"""
Populate manifesto/promise points:
  - MPs/MLAs: party-level, via a party_manifesto_points(party, points[]) table
    (one row per party, points as a TEXT[] array) joined at query time
    through mps.party / mlas.party. Real value here --
    540 MPs + 4,067 MLAs means denormalizing a party's points onto every one
    of their rows would duplicate the same text across ~1,279 BJP rows alone,
    and updating a party's platform later would mean rewriting all of them
    instead of the ~4 rows in this table.
  - Ministers: denormalized directly onto ministers.manifesto_points (a
    TEXT[] column). Only 90 rows, so the small duplication cost (e.g. Health
    has 2 MoS, both get the same Health points) is negligible, and it matches
    how photo_url/slap_count/rose_count already live directly on that table
    rather than in a joined table. A minister's points are computed once at
    write time from whichever portfolio(s) they hold (ministers.ministry is
    a "; "-joined string, e.g. Amit Shah = "Minister of Home Affairs;
    Minister of Co-operation"), using a normalized ministry key so a title
    like "Minister of Railways" and "Minister of State in the Ministry of
    Railways" both resolve to the same underlying ministry.

Source for the point text: Wikipedia's "2024 Indian general election"
article's "Party manifestos" section (BJP/INC have dedicated, cited
bullet-point sections there -- other parties don't have the same structured
coverage and are left for a follow-up pass). Points are written by hand from
that sourced text, in plain language, rather than run through a separate LLM
API this project has no integration for.

Run from the app/ directory:
    cd app && python -m data_update.manifesto_update
"""
import re

from sqlalchemy import text

from db.connect import engine

PARTY_POINTS = {
    "BJP": [
        "Free food grains for 80 crore (800 million) people for the next 5 years, under the PM Garib Kalyan Anna Yojana.",
        "6,000 rupees a year in direct cash support to farmers (PM Kisan Samman Nidhi), plus periodic increases to crop support prices (MSP).",
        "Free rooftop solar power for low-income households (PM Surya Ghar Muft Bijli Yojana).",
        "Free healthcare coverage up to 5 lakh rupees for all senior citizens, under Ayushman Bharat.",
    ],
    "INC": [
        "Fill 30 lakh (3 million) vacant government jobs, and guarantee a year of paid apprenticeship to graduates under 25.",
        "1 lakh rupees a year in cash support to women from poor families.",
        "A legal guarantee that crops will be bought at Minimum Support Price (MSP), plus a farm loan waiver.",
        "A nationwide caste census, and removing the 50% cap on reservations for SC, ST, and backward classes.",
    ],
    "SP": [
        "A caste census by 2025, and filling all vacant government jobs reserved for SC, ST, and OBC candidates.",
        "Scrap the Agniveer military recruitment scheme and return to regular armed forces recruitment; restore the Old Pension Scheme for government employees.",
        "Guarantee crops are bought at Minimum Support Price (MSP), based on the Swaminathan Commission formula.",
        "Reserve 33% of seats for women in Parliament and state assemblies within two years.",
    ],
    "AITC": [
        "Guarantee 100 days of work a year at 400 rupees a day for job card holders, plus a paid one-year apprenticeship for graduates.",
        "Guarantee crops are bought at 50% above production cost (MSP based on the Swaminathan formula).",
        "10 lakh rupees of health insurance coverage for all, and a 1,000 rupee monthly pension for citizens over 60.",
        "No Citizenship Amendment Act (CAA), National Register of Citizens (NRC), or Uniform Civil Code in West Bengal.",
    ],
    "TDP": [
        "1,500 rupees a month to women, plus free bus travel for women on state transport.",
        "20 lakh (2 million) new jobs for youth in Andhra Pradesh.",
        "20,000 rupees a year in financial assistance to every farmer.",
        "Three free LPG gas cylinders per household each year.",
    ],
    "AIADMK": [
        "3,000 rupees a month in financial aid to women heads of economically weaker families.",
        "Set up a Supreme Court bench in Chennai, and make Tamil the official language of the Madras High Court.",
        "An alternative to the NEET medical entrance exam for Tamil Nadu students.",
        "2,000 rupees a month in assistance to all ration-card holding families, with free bus travel for men and women.",
    ],
    "BJD": [
        "Free electricity for households using up to 100 units a month, with subsidized rates up to 150 units.",
        "20,000 crore rupees in government business for women's self-help groups over 10 years, plus interest-free loans.",
        "A 1,000 crore rupee fund to preserve Odisha's heritage sites and temples.",
    ],
    "DMK": [
        "Scrap the NEET medical entrance exam and the National Education Policy (NEP).",
        "End the Agnipath military recruitment scheme and restore permanent armed forces recruitment.",
        "Guarantee crops are bought at 50% above production cost (MSP based on the Swaminathan formula).",
        "Cut the price of LPG cylinders to 500 rupees.",
    ],
    "BSP": [
        "BSP did not release a formal written election manifesto for the 2024 general election.",
        "Party leader Mayawati pledged to work toward statehood for western Uttar Pradesh.",
    ],
    "CPI(M)": [
        "Repeal the Citizenship Amendment Act (CAA).",
        "Scrap strict security laws like UAPA and PMLA.",
        "A guaranteed urban employment scheme, similar to the rural MGNREGA scheme.",
        "A special tax on the super-rich, and a law on wealth and inheritance tax.",
    ],
    "JD(U)": [
        "Push for special category status for Bihar.",
        "Provide irrigation facilities to every agricultural field in Bihar.",
        "Financial assistance to help women start their own businesses.",
    ],
    "RJD": [
        "1 crore (10 million) jobs for youth nationwide.",
        "LPG gas cylinders at 500 rupees nationwide.",
        "1 lakh rupees a year to poor women.",
        "Restore the Old Pension Scheme for government employees.",
    ],
    "AAP": [
        "2,100 rupees a month in financial assistance to every woman.",
        "Free healthcare treatment for all, under the Sanjeevani scheme.",
        "Full statehood for Delhi.",
    ],
    "Yuvajana Sramika Rythu Congress Party": [
        "Continue the \"Navaratnalu\" welfare schemes covering health, education, housing, and social security.",
        "Raise social welfare pensions from 3,000 to 3,500 rupees a month.",
        "Raise farmer financial assistance (Rythu Bharosa) from 13,500 to 16,000 rupees a year.",
        "Complete the Polavaram irrigation project and build a new airport at Bhogapuram.",
    ],
    "NCP": [
        "Work toward making Maharashtra a trillion-dollar economy.",
        "Support Minimum Support Price (MSP) guarantees for farmers.",
        "Raise the Majhi Ladki Bahin women's assistance scheme from 1,500 to 2,100 rupees a month.",
    ],
    "Nationalist Congress Party – Sharadchandra Pawar": [
        "A nationwide caste census, and 50% reservation for women in government jobs.",
        "Review the Citizenship Amendment Act (CAA), NRC, and UAPA.",
        "Support full statehood for Jammu and Kashmir, and oppose \"One Nation, One Election\".",
    ],
    "ShivSena (Uddhav Balasaheb Thackeray)": [
        "Scrap the Dharavi redevelopment project, and extend the free education scheme for male students.",
        "Stabilize prices of essential commodities like wheat, sugar, edible oil, and rice.",
        "Build temples honoring Chhatrapati Shivaji Maharaj in every district of Maharashtra.",
    ],
    "TRS": [
        "500,000 rupees of life insurance coverage for poor families, under the KCR Bhima scheme.",
        "Raise farmer financial assistance (Rythu Bandhu) from 10,000 to 16,000 rupees a year.",
        "Raise the Aasara pension from 2,106 to 3,016 rupees, working toward 5,000 rupees over five years.",
        "Cooking gas cylinders for the poor at 400 rupees each.",
    ],
    "JMM": [
        "33% reservation for women in state government jobs.",
        "Zero-interest agricultural loans, and a higher minimum wage for MGNREGA workers.",
        "Free healthcare treatment up to 15 lakh rupees, under the Abua Health Security Scheme.",
        "25 lakh (2.5 million) new houses, under the Abua Housing scheme.",
    ],
    "CPI": [
        "Bring investigative agencies like the ED and CBI under Parliament's oversight.",
        "Abolish the Governor's Office to strengthen states' powers.",
        "Introduce a wealth tax and inheritance tax, and remove the 50% cap on reservations.",
        "Scrap the Agnipath military recruitment scheme and fully restore the Old Pension Scheme.",
    ],
    "JKNC": [
        "Restore Article 370 and Jammu & Kashmir's statehood.",
        "Restore the Old Pension Scheme, and create 1 lakh (100,000) jobs.",
        "Repeal the Public Safety Act (PSA) and release political prisoners.",
        "12 free LPG cylinders a year for economically weaker families, and free bus travel for women.",
    ],
}

# Party names that are the same real-world party stored under more than one
# string in mps.party/mlas.party (inconsistent between the MP and MLA source
# pulls). Points written for the first name are copied onto the alias too so
# the join still works regardless of which string a given row uses.
PARTY_ALIASES = {
    "CPM": "CPI(M)",
    "YSRCP": "Yuvajana Sramika Rythu Congress Party",
    "Jammu & Kashmir National Conference": "JKNC",
}

# Keyed by normalized ministry (see normalize_ministry) so it matches
# regardless of a minister's rank/title phrasing.
MINISTRY_POINTS = {
    "FINANCE": [
        "Grow India's economy to 5 trillion dollars by 2025 and 10 trillion dollars by 2032.",
    ],
    "HEALTH AND FAMILY WELFARE": [
        "Free healthcare coverage up to 5 lakh rupees for all senior citizens, under Ayushman Bharat.",
    ],
    "NEW AND RENEWABLE ENERGY": [
        "Free rooftop solar electricity for low-income households, under PM Surya Ghar Muft Bijli Yojana.",
    ],
    "RURAL DEVELOPMENT": [
        "3 crore (30 million) new houses built under the PM Awas Yojana, with priority given to people with disabilities.",
    ],
    "WOMEN AND CHILD DEVELOPMENT": [
        "Reserve seats for women in state and national legislatures, under the Nari Shakti Vandan Adhiniyam.",
        "Help 3 crore (30 million) rural women become financially self-sufficient \"Lakhpati Didis\".",
    ],
    "CONSUMER AFFAIRS FOOD AND PUBLIC DISTRIBUTION": [
        "Free food grains for 80 crore (800 million) people for the next 5 years, under the PM Garib Kalyan Anna Yojana.",
    ],
    "AGRICULTURE AND FARMERS WELFARE": [
        "6,000 rupees a year in direct cash support to farmers (PM Kisan Samman Nidhi), plus periodic increases to crop support prices (MSP).",
    ],
    "HOUSING AND URBAN AFFAIRS": [
        "3 crore (30 million) new houses built under the PM Awas Yojana, with priority given to people with disabilities.",
    ],
    "ROAD TRANSPORT AND HIGHWAYS": [
        "Modern rest stops for truck drivers on national highways, with parking, clean drinking water, and food.",
    ],
    "LAW AND JUSTICE": [
        "Implement a Uniform Civil Code (UCC) -- one common set of personal laws for all citizens, replacing separate religion-based laws.",
    ],
    "PARLIAMENTARY AFFAIRS": [
        "\"One Nation, One Election\" -- holding Lok Sabha and all state assembly elections at the same time.",
    ],
    "EXTERNAL AFFAIRS": [
        "Secure India a permanent seat on the UN Security Council.",
        "Build international partnerships to crack down on terrorism and terror financing.",
    ],
    "HOME AFFAIRS": [
        "Crack down on terrorism and terror funding.",
        "Reduce Left-Wing Extremism (Naxalism) through development-focused measures.",
    ],
    "SPACE": [
        "Establish a permanent Indian space station (Bharatiya Antariksha Station) and send an Indian astronaut to the Moon.",
    ],
    "RAILWAYS": [
        "Keep adding over 5,000 km of new railway track every year.",
        "Launch a single \"super app\" covering all train-related services for passengers.",
    ],
    "DEFENCE": [
        "Expand India's defence capabilities and set up unified \"theatre commands\" for the armed forces.",
        "Speed up infrastructure development along the India-China, India-Pakistan, and India-Myanmar borders.",
    ],
    "EDUCATION": [
        "Reach 100% school enrollment from pre-school through secondary level.",
        "Increase medical education seats nationwide, including at AIIMS.",
        "Fully implement the National Education Policy (NEP 2020).",
    ],
    "POWER": [
        "Reach energy independence by 2047, and cut petroleum imports through electric mobility and renewable power.",
        "Build 500 GW of renewable energy capacity through mega solar parks, wind parks, and the Green Energy Corridor.",
    ],
    "COMMERCE AND INDUSTRY": [
        "Turn India into a global manufacturing hub for electronics, defence, textiles, mobiles, and automobiles.",
        "Expand small traders' adoption of the Open Network for Digital Commerce (ONDC).",
    ],
    "MICRO SMALL AND MEDIUM ENTERPRISES": [
        "Turn India into a global manufacturing hub for electronics, defence, textiles, mobiles, and automobiles.",
    ],
    "ENVIRONMENT FOREST AND CLIMATE CHANGE": [
        "Improve flood management in the North East and along Himalayan rivers.",
        "Clean up and improve the water quality of major rivers.",
    ],
    "LABOUR AND EMPLOYMENT": [
        "Bring gig workers onto the e-Shram national database for social security benefits.",
    ],
    "SKILL DEVELOPMENT AND ENTREPRENEURSHIP": [
        "Expand the startup ecosystem beyond major cities into tier-2 and tier-3 towns, with more funding and mentorship support.",
    ],
    "JAL SHAKTI": [
        "Provide piped drinking water to every household nationwide, under the Jal Jivan Mission.",
    ],
    "TOURISM": [
        "Develop India as a global tourism hub, with special focus on island destinations.",
    ],
    "CULTURE": [
        "Set up Thiruvalluvar cultural centres (honoring the Tamil poet-philosopher) around the world.",
    ],
    "CIVIL AVIATION": [
        "Grow India's domestic aviation manufacturing and services industry.",
    ],
    "FOOD PROCESSING INDUSTRIES": [
        "Build more storage, cold-storage, and food processing facilities for farm produce, under the Krishi Infrastructure Mission.",
    ],
    "FISHERIES ANIMAL HUSBANDRY AND DAIRYING": [
        "Raise financial assistance to fishermen during the 61-day fishing ban period from 8,000 to 12,000 rupees.",
        "5,000 houses for fishing families, under the PM Awas Yojana.",
    ],
    "TRIBAL AFFAIRS": [
        "Mark 2025 as \"Janjatiya Gaurav Varsh\", the 150th anniversary of tribal leader Birsa Munda, with new schemes for tribal communities.",
        "Focused healthcare for tribal communities, and measures to eliminate malnutrition among tribal children.",
    ],
    "SOCIAL JUSTICE AND EMPOWERMENT": [
        "Expand Ayushman Bharat free healthcare coverage to everyone above age 70.",
        "Raise the Mudra Yojana small-business loan limit from 10 lakh to 20 lakh rupees.",
        "Train rural women as drone pilots, under the Namo Didi Yojana.",
    ],
    "SCIENCE AND TECHNOLOGY": [
        "Set up a 1 lakh crore rupee research fund (Anusandhan National Research Foundation) to support scientific research.",
    ],
    "AYUSH": [
        "Extend free healthcare coverage under Ayushman Bharat to transgender people.",
    ],
    "CO OPERATION": [
        "Introduce a national cooperative policy (Rashtriya Sahkarita Niti).",
    ],
    "PORTS SHIPPING AND WATERWAYS": [
        "Grow India's domestic shipbuilding industry.",
    ],
    "PANCHAYATI RAJ": [
        "Give panchayati raj institutions more financial autonomy to make them self-sustaining.",
    ],
    "PETROLEUM AND NATURAL GAS": [
        "Raise natural gas's share of India's energy mix from 6.8% to 15% by 2030, and expand city gas distribution.",
        "Provide clean cooking gas (LPG) to rural and low-income households, under the Ujjwala Yojana.",
    ],
    "PRIME MINISTER": [
        "Free food grains for 80 crore (800 million) people for the next 5 years, under the PM Garib Kalyan Anna Yojana.",
        "6,000 rupees a year in direct cash support to farmers (PM Kisan Samman Nidhi), plus periodic increases to crop support prices (MSP).",
        "Free rooftop solar power for low-income households (PM Surya Ghar Muft Bijli Yojana).",
        "Free healthcare coverage up to 5 lakh rupees for all senior citizens, under Ayushman Bharat.",
    ],
}


def normalize_ministry(title: str) -> str:
    if not title:
        return ""
    t = title.strip()
    t = re.sub(r"^Minister of State \(Independent Charge\) of the Ministry of\s+", "", t, flags=re.IGNORECASE)
    t = re.sub(r"^Minister of State in the (Department|Ministry) of\s+", "", t, flags=re.IGNORECASE)
    t = re.sub(r"^Minister of State in the\s+", "", t, flags=re.IGNORECASE)
    t = re.sub(r"^Minister of\s+", "", t, flags=re.IGNORECASE)
    t = re.sub(r"^Department of\s+", "", t, flags=re.IGNORECASE)
    t = re.sub(r"^Ministry of\s+", "", t, flags=re.IGNORECASE)
    t = re.sub(r"[^A-Za-z0-9 ]+", " ", t)
    key = " ".join(t.upper().split())
    if key in ("AND", "ALL IMPORTANT POLICY ISSUES", "ALL OTHER PORTFOLIOS NOT ALLOCATED TO ANY MINISTER"):
        return ""
    return key


def ensure_schema() -> None:
    with engine.begin() as conn:
        # party_manifesto_points used to be one row per (party, point); now
        # it's one row per party with a points array, matching
        # ministers.manifesto_points. This table is fully owned/regenerated
        # by this script (PARTY_POINTS is the source of truth), so dropping
        # and recreating on the old schema is safe -- populate_party_points()
        # refills it immediately after.
        old_schema = conn.execute(text("""
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'party_manifesto_points' AND column_name = 'point'
        """)).first()
        if old_schema:
            conn.execute(text("DROP TABLE party_manifesto_points"))

        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS party_manifesto_points (
                id SERIAL PRIMARY KEY,
                party TEXT NOT NULL UNIQUE,
                points TEXT[] NOT NULL
            )
        """))
        conn.execute(text(
            "ALTER TABLE ministers ADD COLUMN IF NOT EXISTS manifesto_points TEXT[]"
        ))


def populate_party_points() -> None:
    all_points = dict(PARTY_POINTS)
    for alias, canonical in PARTY_ALIASES.items():
        all_points[alias] = PARTY_POINTS[canonical]

    with engine.begin() as conn:
        for party, points in all_points.items():
            conn.execute(text("""
                INSERT INTO party_manifesto_points (party, points)
                VALUES (:party, :points)
                ON CONFLICT (party) DO UPDATE SET points = EXCLUDED.points
            """), {"party": party, "points": points})


def populate_minister_manifesto_points() -> None:
    with engine.connect() as conn:
        ministers = conn.execute(text("SELECT id, ministry FROM ministers")).fetchall()

    updated = 0
    with engine.begin() as conn:
        for minister in ministers:
            points = []
            for portfolio in minister.ministry.split(";"):
                ministry_key = normalize_ministry(portfolio)
                for point in MINISTRY_POINTS.get(ministry_key, []):
                    if point not in points:
                        points.append(point)

            conn.execute(
                text("UPDATE ministers SET manifesto_points = :points WHERE id = :id"),
                {"points": points or None, "id": minister.id},
            )
            if points:
                updated += 1

    print(f"Ministers with at least one manifesto point: {updated}/{len(ministers)}")


def report_coverage() -> None:
    with engine.connect() as conn:
        mp_total, mp_covered = conn.execute(text("""
            SELECT count(*), count(*) FILTER (WHERE party IN (SELECT DISTINCT party FROM party_manifesto_points))
            FROM mps
        """)).one()
        mla_total, mla_covered = conn.execute(text("""
            SELECT count(*), count(*) FILTER (WHERE party IN (SELECT DISTINCT party FROM party_manifesto_points))
            FROM mlas
        """)).one()

    print(f"MPs with party manifesto points: {mp_covered}/{mp_total}")
    print(f"MLAs with party manifesto points: {mla_covered}/{mla_total}")


def main() -> None:
    ensure_schema()
    populate_party_points()
    populate_minister_manifesto_points()
    report_coverage()


if __name__ == "__main__":
    main()
