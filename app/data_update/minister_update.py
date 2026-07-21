"""
Fetch the current Union Council of Ministers (ministry, minister, party,
photo) from Wikipedia and store it in the same Postgres/PostGIS DB used for
everything else.

Source: the "Third Modi ministry" Wikipedia article's `{{Cabinet table
minister}}` templates (Cabinet Ministers / Ministers of State (Independent
Charge) / Ministers of State sections) -- 72 people, 90 ministry-assignment
rows (some ministers hold more than one portfolio, e.g. Amit Shah is both
Home Affairs and Co-operation; some portfolios have two MoS assigned at once,
e.g. Health and Family Welfare). Photos come from each minister's own
Wikipedia page via the pageimages API (Wikimedia Commons, attribution
required, same as the DataMeet boundary data).

Run from the app/ directory:
    cd app && python -m data_update.minister_update
"""
import json
import re
import subprocess
import time
from urllib.parse import quote

from sqlalchemy import text

from db.connect import engine

MINISTRY_PAGE = "Third_Modi_ministry"
WIKITEXT_URL = f"https://en.wikipedia.org/w/rest.php/v1/page/{MINISTRY_PAGE}"
PAGEIMAGES_URL = (
    "https://en.wikipedia.org/w/api.php?action=query&format=json"
    "&prop=pageimages&piprop=thumbnail&pithumbsize=400&redirects=1&titles="
)

RETRY_ATTEMPTS = 3
RETRY_BACKOFF_SECONDS = 2
PHOTO_BATCH_SIZE = 50


def fetch_json(url: str) -> dict:
    """Via curl (subprocess): this venv's Python has no configured CA bundle,
    which breaks urllib's TLS handshake; curl uses the system trust store."""
    last_error = None
    for attempt in range(1, RETRY_ATTEMPTS + 1):
        result = subprocess.run(
            ["curl", "-sS", "--fail", "--max-time", "30", url],
            capture_output=True,
        )
        if result.returncode == 0:
            return json.loads(result.stdout)
        last_error = result.stderr.decode(errors="replace")
        if attempt < RETRY_ATTEMPTS:
            time.sleep(RETRY_BACKOFF_SECONDS ** attempt)
    raise RuntimeError(f"Failed to fetch {url} after {RETRY_ATTEMPTS} attempts: {last_error}")


def clean_wikitext(value: str) -> str:
    """Strip wikilinks down to their display text, turn <br/> into '; ', and
    drop bold markup / stray HTML."""
    if not value:
        return ""
    value = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]+)\]\]", r"\1", value)
    value = re.sub(r"<br\s*/?>", "; ", value, flags=re.IGNORECASE)
    value = re.sub(r"'''?", "", value)
    value = re.sub(r"<[^>]+>", "", value)
    value = value.replace("&nbsp;", " ")
    return " ".join(value.split())


def extract_wikilink(value: str):
    """A minister field is a single wikilink, e.g. '[[Narendra Modi]]' or
    '[[Chandra Sekhar Pemmasani|Pemmasani Chandra Sekhar]]'. Returns
    (link_target, display_name) -- the target is what has a matching
    Wikipedia page (and thus a lookup-able photo), the display name is what
    we actually want to show in the app."""
    match = re.match(r"^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$", value.strip())
    if not match:
        return None, clean_wikitext(value)
    target = match.group(1)
    display = match.group(2) or target
    return target, clean_wikitext(display)


def parse_roster() -> list[dict]:
    data = fetch_json(WIKITEXT_URL)
    source = data["source"]
    blocks = re.findall(r"\{\{Cabinet table minister.*?\n\}\}", source, flags=re.DOTALL)

    rows = []
    for block in blocks:
        fields = {}
        for line in block.splitlines():
            match = re.match(r"\s*\|\s*([A-Za-z0-9_]+)\s*=\s*(.*)$", line)
            if match:
                fields[match.group(1)] = match.group(2)

        ministry = clean_wikitext(fields.get("title", ""))
        for n in range(1, 6):
            raw_name = fields.get(f"minister{n}")
            if not raw_name or not raw_name.strip():
                continue
            target, display_name = extract_wikilink(raw_name)
            party = clean_wikitext(fields.get(f"minister{n}_party", ""))
            rows.append({
                "ministry": ministry,
                "minister_name": display_name,
                "wiki_target": target,
                "party": party,
            })
    return rows


def fetch_photos(targets: list[str]) -> dict:
    unique_targets = list(dict.fromkeys(t for t in targets if t))
    photo_by_target = {}

    for i in range(0, len(unique_targets), PHOTO_BATCH_SIZE):
        batch = unique_targets[i:i + PHOTO_BATCH_SIZE]
        url = PAGEIMAGES_URL + quote("|".join(batch), safe="|")
        result = fetch_json(url)
        query = result.get("query", {})

        normalized_map = {n["from"]: n["to"] for n in query.get("normalized", [])}
        redirect_map = {r["from"]: r["to"] for r in query.get("redirects", [])}
        thumb_by_title = {
            page["title"]: page["thumbnail"]["source"]
            for page in query.get("pages", {}).values()
            if "thumbnail" in page
        }

        for target in batch:
            resolved = redirect_map.get(normalized_map.get(target, target), normalized_map.get(target, target))
            photo_by_target[target] = thumb_by_title.get(resolved)

        time.sleep(0.5)

    return photo_by_target


def ensure_schema() -> None:
    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS ministers (
                id SERIAL PRIMARY KEY,
                ministry TEXT NOT NULL,
                minister_name TEXT NOT NULL,
                party TEXT,
                photo_url TEXT,
                slap_count INTEGER NOT NULL DEFAULT 0,
                rose_count INTEGER NOT NULL DEFAULT 0,
                UNIQUE (ministry, minister_name)
            )
        """))


def upsert_ministers(rows: list[dict]) -> None:
    with engine.begin() as conn:
        for row in rows:
            conn.execute(text("""
                INSERT INTO ministers (ministry, minister_name, party, photo_url)
                VALUES (:ministry, :minister_name, :party, :photo_url)
                ON CONFLICT (ministry, minister_name) DO UPDATE SET
                    party = EXCLUDED.party,
                    photo_url = EXCLUDED.photo_url
            """), {
                "ministry": row["ministry"],
                "minister_name": row["minister_name"],
                "party": row["party"],
                "photo_url": row["photo_url"],
            })
    # Note: slap_count/rose_count are deliberately untouched on conflict --
    # they're live user vote tallies, not source data, and must survive a
    # re-run of this script (e.g. after a reshuffle updates a portfolio).


def main() -> None:
    ensure_schema()

    roster = parse_roster()
    print(f"Parsed {len(roster)} ministry assignments for {len(set(r['wiki_target'] for r in roster))} unique ministers")

    photos = fetch_photos([r["wiki_target"] for r in roster])
    missing_photos = [t for t in dict.fromkeys(r["wiki_target"] for r in roster) if not photos.get(t)]
    if missing_photos:
        print(f"No photo found for {len(missing_photos)} minister(s): {', '.join(missing_photos)}")

    for row in roster:
        row["photo_url"] = photos.get(row["wiki_target"])

    upsert_ministers(roster)
    print(f"Stored {len(roster)} rows in ministers")


if __name__ == "__main__":
    main()
