"""
Fill remaining mps.photo_url gaps (people MyNeta/Wikipedia didn't have a
photo for) via sansad.in's official Lok Sabha member directory (National
Informatics Centre, Government of India) -- the source the original project
brief specifically named for MPs.

sansad.in's member list page is a JS-rendered SPA with no useful static
HTML, but it calls a real JSON API underneath
(sansad.in/api_ls/member?...&searchText=...) which was found by inspecting
network requests in an actual browser session. That API's searchText only
matches single words reliably (multi-word full-name queries return zero
results), so this tries each word of a person's stored name as a separate
query and cross-checks candidates by constituency before accepting a match
-- necessary because common surnames collide (e.g. "Valmiki" alone matches a
Hathras, UP MP, not our target in Anantapur, AP).

Run from the app/ directory:
    cd app && python -m data_update.sansad_photo_update
"""
from __future__ import annotations

import json
import re
import subprocess
import time
from urllib.parse import quote

from sqlalchemy import text

from db.connect import engine

SEARCH_URL = (
    "https://sansad.in/api_ls/member?loksabha=18&state=&party=&gender=&ageFrom=&ageTo="
    "&noOfTerms=&page=1&size=10&searchText={query}&constituency=&sitting=1&locale=en"
    "&month=&profession=&otherProfession=&constituencyCategory=&positionCode="
    "&qualification=&noOfChildren=&isFreedomFighter=&memberStatus=s"
)
USER_AGENT = "Mozilla/5.0"
RETRY_ATTEMPTS = 3
RETRY_BACKOFF_SECONDS = 3
REQUEST_DELAY_SECONDS = 0.5

# Titles/honorifics/connector words that make bad, near-universal search
# tokens -- skipped when picking which word of a name to search for.
SKIP_WORDS = {
    "dr", "shri", "smt", "s", "o", "d", "alias", "adv", "prof", "capt",
    "col", "lt", "major", "gen",
}


def normalize(value) -> str:
    if not value:
        return ""
    value = re.sub(r"\(\s*(SC|ST)\s*\)", "", value, flags=re.IGNORECASE)
    value = re.sub(r"[^A-Za-z0-9]+", " ", value)
    return " ".join(value.upper().split())


def constituency_matches(a: str, b: str) -> bool:
    a, b = normalize(a), normalize(b)
    if not a or not b:
        return False
    return a == b or a in b or b in a


def fetch_json(url: str) -> dict:
    """Via curl (subprocess): this venv's Python has no configured CA bundle,
    which breaks urllib's TLS handshake; curl uses the system trust store."""
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


def search_tokens(name: str) -> list[str]:
    words = re.findall(r"[A-Za-z]+", name)
    words = [w for w in words if w.lower() not in SKIP_WORDS and len(w) > 1]
    return sorted(set(words), key=len, reverse=True)


def find_photo(name: str, constituency: str) -> tuple[str | None, str]:
    """Returns (photo_url_or_None, note). Tries each search token in turn,
    accepting the first candidate whose constituency matches ours."""
    seen_ids = set()
    for token in search_tokens(name):
        url = SEARCH_URL.format(query=quote(token))
        data = fetch_json(url)
        time.sleep(REQUEST_DELAY_SECONDS)

        for member in data.get("membersDtoList", []):
            if member["mpsno"] in seen_ids:
                continue
            seen_ids.add(member["mpsno"])
            if constituency_matches(member["constName"], constituency) and member.get("imageUrl"):
                return member["imageUrl"], f"matched via token '{token}' -> {member['mpFirstLastName']} ({member['constName']})"

    return None, f"no constituency-matching candidate found (tried tokens: {', '.join(search_tokens(name))})"


def main() -> None:
    with engine.connect() as conn:
        target_mps = conn.execute(text(
            "SELECT id, name, constituency FROM mps WHERE photo_url IS NULL"
        )).fetchall()

    print(f"{len(target_mps)} MPs still missing a photo")

    stored = 0
    for mp in target_mps:
        photo_url, note = find_photo(mp.name, mp.constituency)
        print(f"{mp.name} ({mp.constituency}): {note}")

        if photo_url:
            with engine.begin() as conn:
                conn.execute(
                    text("UPDATE mps SET photo_url = :photo_url WHERE id = :id"),
                    {"photo_url": photo_url, "id": mp.id},
                )
            stored += 1

    print(f"Stored {stored}/{len(target_mps)} photos via sansad.in")


if __name__ == "__main__":
    main()
