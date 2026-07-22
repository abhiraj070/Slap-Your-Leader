"""
Fix the 11 same-named constituency pairs that collapse to one normalized key.

For each pair: give the second member a disambiguated constituency_key on the
AC layer, then rebuild both mlas rows from the state's winners page raw names
(which carry the (SC)/(ST)/district suffixes the normal normalize() strips).

Run from SYL/app:  ../.venv/bin/python .../dup_pair_fixup.py
"""
import re
import sys
import subprocess
import time

sys.path.insert(0, "/Users/abhirajintern/Desktop/SYL/app")
from sqlalchemy import text  # noqa: E402
from db.connect import engine  # noqa: E402

UA = "SlapYourLeader-DataPipeline/1.0 (self-hosted civic-sentiment app; contact: project owner)"

ROW_RE = re.compile(
    r"candidate\.php\?candidate_id=(\d+)>([^<]+)</a></a>[^<]*(?:<b>)?</td>"
    r"<td>([^<]+)</td>\s*<td>([^<]+)</td>\s*"
    r"<td[^>]*>(?:<span[^>]*><b>\s*)?(\d+)(?:\s*</b></span>)?</td>\s*<td[^>]*>([^<]*)</td>",
    re.DOTALL,
)


def fetch(url):
    r = subprocess.run(["curl", "-sS", "--fail", "--max-time", "40", "-H",
                        f"User-Agent: {UA}", url], capture_output=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.decode()[:200])
    return r.stdout.decode(errors="replace")


def photo(slug, cid):
    try:
        page = fetch(f"https://myneta.info/{slug}/candidate.php?candidate_id={cid}")
    except RuntimeError:
        return None
    m = re.search(r"src=(https?://myneta\.info/images_candidate/[^\s>\"']+)", page)
    return m.group(1) if m else None


# (state_key, slug, base_key,
#   [(ac_no, new_key, myneta_raw_name_or_None), ...])
# myneta_raw None => resolve by winner name below (Bihar Pipra: identical raw names)
PAIRS = [
    ("ANDHRA PRADESH", "AndhraPradesh2024", "GANNAVARAM", [
        # SC member = Konaseema (eastern polygon); plain = Krishna (western)
        ("east", "GANNAVARAM SC", "GANNAVARAM (SC)"),
        ("west", "GANNAVARAM", "GANNAVARAM"),
    ]),
    ("ANDHRA PRADESH", "AndhraPradesh2024", "PRATHIPADU", [
        # SC member = Guntur (southern polygon); plain = Kakinada (northern)
        ("south", "PRATHIPADU SC", "PRATHIPADU (SC)"),
        ("north", "PRATHIPADU", "PRATHIPADU"),
    ]),
    ("BIHAR", "Bihar2025", "KALYANPUR", [
        (16, "KALYANPUR", "KALYANPUR"),
        (131, "KALYANPUR SC", "KALYANPUR (SC)"),
    ]),
    ("BIHAR", "Bihar2025", "PIPRA", [
        (17, "PIPRA", "Shyambabu Prasad Yadav"),   # E.Champaran (BJP) - by winner
        (42, "PIPRA SUPAUL", "Rambilash Kamat"),   # Supaul (JDU) - by winner
    ]),
    ("GUJARAT", "Gujarat2022", "JETPUR", [
        (74, "JETPUR", "JETPUR"),
        (138, "JETPUR ST", "JETPUR (ST)"),
    ]),
    ("GUJARAT", "Gujarat2022", "KALOL", [
        (38, "KALOL GANDHINAGAR", "KALOL-GANDHINAGAR"),
        (127, "KALOL PANCHMAHALS", "KALOL-PANCHMAHALS"),
    ]),
    ("GUJARAT", "Gujarat2022", "MAHUVA", [
        (99, "MAHUVA", "MAHUVA"),
        (170, "MAHUVA ST", "MAHUVA (ST)"),
    ]),
    ("GUJARAT", "Gujarat2022", "MANDVI", [
        (2, "MANDVI", "MANDVI"),
        (157, "MANDVI ST", "MANDVI (ST)"),
    ]),
    ("GUJARAT", "Gujarat2022", "MANGROL", [
        (89, "MANGROL", "MANGROL"),
        (156, "MANGROL ST", "MANGROL (ST)"),
    ]),
    ("RAJASTHAN", "Rajasthan2023", "SHAHPURA", [
        (42, "SHAHPURA", "SHAHPURA"),
        (181, "SHAHPURA SC", "SHAHPURA (SC)"),
    ]),
    ("WEST BENGAL", "WestBengal2026", "BISHNUPUR", [
        (146, "BISHNUPUR SC", "BISHNUPUR (SC)"),
        (255, "BISHNUPUR", "BISHNUPUR"),
    ]),
]


# Seats absent from MyNeta winners pages; winner/party verified on the
# constituency's Wikipedia page (2025 Bihar / 2022 Gujarat results).
FALLBACKS = {
    ("BIHAR", "KALYANPUR SC"): ("Maheshwar Hazari", "JDU"),
    ("GUJARAT", "JETPUR"): ("Jayeshbhai Vitthalbhai Radadiya", "BJP"),
    ("GUJARAT", "MANGROL"): ("Bhagvanjibhai Karagatiya", "BJP"),
}


def resolve_ac_id(conn, sk, base_key, selector):
    rows = conn.execute(text("""
        SELECT id, ac_no, ST_X(ST_Centroid(geom)) lon, ST_Y(ST_Centroid(geom)) lat
        FROM assembly_constituencies
        WHERE state_key=:sk AND constituency_key LIKE :pat
        ORDER BY ac_no
    """), {"sk": sk, "pat": base_key + "%"}).fetchall()
    assert len(rows) == 2, (sk, base_key, rows)
    a, b = rows
    if selector == "east":
        return (a if a.lon > b.lon else b).id
    if selector == "west":
        return (a if a.lon < b.lon else b).id
    if selector == "north":
        return (a if a.lat > b.lat else b).id
    if selector == "south":
        return (a if a.lat < b.lat else b).id
    return next(r.id for r in rows if int(r.ac_no) == selector)


def main():
    pages = {}
    for sk, slug, base, members in PAIRS:
        if slug not in pages:
            pages[slug] = ROW_RE.findall(
                fetch(f"https://myneta.info/{slug}/index.php?action=show_winners&sort=default"))
            time.sleep(0.5)
        rows = pages[slug]
        with engine.begin() as conn:
            display_state = conn.execute(text(
                "SELECT state FROM mlas WHERE state_key=:sk LIMIT 1"), {"sk": sk}).scalar()
            for selector, new_key, raw in members:
                ac_id = resolve_ac_id(conn, sk, base, selector)
                conn.execute(text(
                    "UPDATE assembly_constituencies SET constituency_key=:k WHERE id=:id"),
                    {"k": new_key, "id": ac_id})
                # find the winner row: by raw constituency name, or by winner name (Pipra)
                cand = None
                for cid, nm, cons, party, cases, edu in rows:
                    cons_clean = cons.strip().upper()
                    if raw.upper() == cons_clean or raw.lower() in nm.strip().lower():
                        if raw.upper() == cons_clean or cons_clean.startswith(base.split()[0]):
                            cand = (cid, nm.strip(), party.strip(), int(cases), edu.strip() or None)
                            break
                if cand is None:
                    fb = FALLBACKS.get((sk, new_key))
                    if fb is None:
                        print(f"!! no winner row for {sk} {new_key} ({raw}); leaving seat empty")
                        continue
                    cid, (nm, party), cases, edu = None, fb, None, None
                else:
                    cid, nm, party, cases, edu = cand
                existing = conn.execute(text(
                    "SELECT id, name FROM mlas WHERE state_key=:sk AND constituency_key=:k"),
                    {"sk": sk, "k": new_key}).first()
                purl = photo(slug, cid) if cid else None
                time.sleep(0.35)
                if existing:
                    conn.execute(text("""
                        UPDATE mlas SET name=:n, party=:p, criminal_cases=:cc, education=:e,
                            photo_url=COALESCE(:u, photo_url)
                        WHERE id=:id
                    """), {"n": nm, "p": party, "cc": cases, "e": edu, "u": purl, "id": existing.id})
                    print(f"updated  {sk} {new_key}: {nm} ({party})")
                else:
                    conn.execute(text("""
                        INSERT INTO mlas (name, state, constituency, party, criminal_cases, education,
                                          assets, state_key, constituency_key, photo_url, slap_count, rose_count)
                        VALUES (:n, :st, :c, :p, :cc, :e, NULL, :sk, :k, :u, 0, 0)
                    """), {"n": nm, "st": display_state, "c": new_key, "p": party,
                           "cc": cases, "e": edu, "sk": sk, "k": new_key, "u": purl})
                    print(f"inserted {sk} {new_key}: {nm} ({party})")


if __name__ == "__main__":
    main()
