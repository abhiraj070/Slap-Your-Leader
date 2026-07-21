"""
Add photo/slap/rose columns to mps and mlas (person-level tables -- not the
boundary tables, since a by-election can change who represents a
constituency while the constituency shape stays the same, and votes need to
stay attached to the person), then populate MP photos via Wikipedia.

MLA photos are deliberately left NULL here: a spot-check of 5 random MLAs
found only 1 with an actual Wikipedia photo (state-assembly-level politicians
have far thinner Wikipedia coverage than MPs), matching the project brief's
own note that MLA photos need a dedicated state-assembly-website scrape, not
a single API call. Faking coverage we don't have would be worse than leaving
it NULL.

Guards against name-collision false positives (e.g. an MP named
"Radhakrishna" matching the Hindu deity's Wikipedia page/photo instead of the
person): a match is only accepted if Wikipedia's short description contains
"politician".

Run from the app/ directory:
    cd app && python -m data_update.photo_update
"""
import json
import subprocess
import time
from urllib.parse import quote

from sqlalchemy import text

from db.connect import engine

PAGEIMAGES_URL = (
    "https://en.wikipedia.org/w/api.php?action=query&format=json"
    "&prop=pageimages|description&piprop=thumbnail&pithumbsize=400&redirects=1&titles="
)

RETRY_ATTEMPTS = 4
RETRY_BACKOFF_SECONDS = 5
BATCH_SIZE = 50
BATCH_DELAY_SECONDS = 6
USER_AGENT = "SlapYourLeader-DataPipeline/1.0 (self-hosted civic-sentiment app; contact: project owner)"
# A single "politician" substring check was too strict: it correctly rejected
# real false positives (name-collision pages like "Divine couple in Hinduism"
# for an MP named Radhakrishna, or "American engineer" for an unrelated
# Arup Chakraborty) but ALSO discarded confirmed-correct matches whose
# Wikidata description doesn't literally say "politician" -- including
# Narendra Modi ("Prime Minister of India since 2014"), Rahul Gandhi, Om
# Birla, and many "Member of the Lok Sabha" descriptions. Widened to a set of
# political-office keywords; disambiguation pages ("Topics referred to by
# the same term"), other professions, and empty descriptions still correctly
# fall through to rejected.
POLITICAL_DESCRIPTION_KEYWORDS = (
    "politician", "lok sabha", "rajya sabha", "member of parliament",
    "chief minister", "minister of", "prime minister", "speaker of",
    "leader of the opposition", "legislative assembly", " mla",
    "governor of", "member of the indian parliament",
)


def fetch_json(url: str) -> dict:
    """Via curl (subprocess): this venv's Python has no configured CA bundle,
    which breaks urllib's TLS handshake; curl uses the system trust store.
    Sends a descriptive User-Agent per Wikimedia's API etiquette -- requests
    without one get throttled harder."""
    last_error = None
    for attempt in range(1, RETRY_ATTEMPTS + 1):
        result = subprocess.run(
            ["curl", "-sS", "--fail", "--max-time", "30", "-H", f"User-Agent: {USER_AGENT}", url],
            capture_output=True,
        )
        if result.returncode == 0:
            return json.loads(result.stdout)
        last_error = result.stderr.decode(errors="replace")
        if attempt < RETRY_ATTEMPTS:
            time.sleep(RETRY_BACKOFF_SECONDS * attempt)
    raise RuntimeError(f"Failed to fetch {url} after {RETRY_ATTEMPTS} attempts: {last_error}")


def ensure_schema() -> None:
    with engine.begin() as conn:
        for table in ("mps", "mlas"):
            conn.execute(text(f"""
                ALTER TABLE {table}
                ADD COLUMN IF NOT EXISTS photo_url TEXT,
                ADD COLUMN IF NOT EXISTS slap_count INTEGER NOT NULL DEFAULT 0,
                ADD COLUMN IF NOT EXISTS rose_count INTEGER NOT NULL DEFAULT 0
            """))


def fetch_verified_photos(names: list[str]) -> tuple[dict, dict]:
    """Returns (photo_by_name, rejection_reason_by_name). A name only gets a
    photo if Wikipedia's short description confirms the page is about a
    politician -- otherwise it's recorded as rejected/missing so the gap is
    visible instead of silently storing a wrong photo or silently having none."""
    unique_names = list(dict.fromkeys(names))
    photo_by_name = {}
    reason_by_name = {}

    for i in range(0, len(unique_names), BATCH_SIZE):
        batch = unique_names[i:i + BATCH_SIZE]
        url = PAGEIMAGES_URL + quote("|".join(batch), safe="|")
        result = fetch_json(url)
        query = result.get("query", {})

        normalized_map = {n["from"]: n["to"] for n in query.get("normalized", [])}
        redirect_map = {r["from"]: r["to"] for r in query.get("redirects", [])}
        pages_by_title = {page["title"]: page for page in query.get("pages", {}).values()}

        for name in batch:
            resolved = normalized_map.get(name, name)
            resolved = redirect_map.get(resolved, resolved)
            page = pages_by_title.get(resolved)

            if page is None or "missing" in page:
                reason_by_name[name] = "no Wikipedia page found"
                continue

            description = page.get("description", "")
            if not any(keyword in description.lower() for keyword in POLITICAL_DESCRIPTION_KEYWORDS):
                reason_by_name[name] = f"rejected -- description was '{description or 'none'}', not a politician"
                continue

            thumbnail = page.get("thumbnail", {}).get("source")
            if not thumbnail:
                reason_by_name[name] = "page exists but has no photo"
                continue

            photo_by_name[name] = thumbnail

        time.sleep(BATCH_DELAY_SECONDS)

    return photo_by_name, reason_by_name


def update_photos(table: str, photo_by_id: dict) -> None:
    with engine.begin() as conn:
        for row_id, photo_url in photo_by_id.items():
            conn.execute(
                text(f"UPDATE {table} SET photo_url = :photo_url WHERE id = :id"),
                {"photo_url": photo_url, "id": row_id},
            )


def main() -> None:
    ensure_schema()

    with engine.connect() as conn:
        all_mps = conn.execute(text("SELECT id, name FROM mps")).fetchall()
        mps = conn.execute(text("SELECT id, name FROM mps WHERE photo_url IS NULL")).fetchall()

    print(f"{len(all_mps) - len(mps)} MPs already have a photo from a previous run; fetching the remaining {len(mps)}")

    photo_by_name, reason_by_name = fetch_verified_photos([row.name for row in mps])

    photo_by_id = {
        row.id: photo_by_name[row.name]
        for row in mps
        if row.name in photo_by_name
    }
    update_photos("mps", photo_by_id)

    print(f"MPs: {len(all_mps)} total, {len(photo_by_id)} newly stored this run, {len(reason_by_name)} still without a photo")
    for name, reason in reason_by_name.items():
        print(f"  {name}: {reason}")


if __name__ == "__main__":
    main()
