"""
Fill in mps/mlas photo_url gaps using MyNeta (myneta.info) -- the same
ADR-backed source as our existing mps/mlas data (fetched via nish.space),
which hosts a real, candidate-submitted photo per election affidavit at a
predictable URL on each candidate's profile page. This is a second, wider
pass after photo_update.py's Wikipedia-based pass: Wikipedia only covers
politicians notable enough for an article (543 MPs partially, ~4,067 MLAs
almost not at all); MyNeta covers essentially every contesting candidate,
winners included, because a photo is part of the mandatory affidavit.

Only fills photo_url where it's currently NULL -- never overwrites an
already-verified Wikipedia photo.

Part A -- MPs: one national winners page (LokSabha2024), matched onto `mps`
by (constituency_key, name).

Part B -- MLAs: MyNeta has no single all-India MLA listing (unlike Lok
Sabha); each state's assembly election happens on its own schedule, so each
state has its own dataset "slug" (e.g. goa2022, WestBengal2026). This script
discovers the current (most recent) term's slug per state from
state_assembly.php?state=X, then fetches that state's winners page and
matches onto `mlas` by (state_key, constituency_key, name). This is a much
larger crawl (~4,067 individual candidate-page fetches across 30 states) and
is written to be safely resumable: it only queries mlas rows still missing a
photo, so re-running after an interruption picks up where it left off.

Run from the app/ directory:
    cd app && python -m data_update.myneta_photo_update mps
    cd app && python -m data_update.myneta_photo_update mlas
    cd app && python -m data_update.myneta_photo_update mlas --state "Goa"
"""
from __future__ import annotations

import re
import subprocess
import sys
import time
from urllib.parse import quote

from sqlalchemy import text

from db.connect import engine

BASE_URL = "https://myneta.info"
LOKSABHA_WINNERS_URL = f"{BASE_URL}/LokSabha2024/index.php?action=show_winners&sort=default"
USER_AGENT = "SlapYourLeader-DataPipeline/1.0 (self-hosted civic-sentiment app; contact: project owner)"

RETRY_ATTEMPTS = 3
RETRY_BACKOFF_SECONDS = 4
REQUEST_DELAY_SECONDS = 0.4

STATES = [
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chattisgarh",
    "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh",
    "Jammu And Kashmir", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh",
    "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha",
    "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana",
    "Tripura", "Uttarakhand", "Uttar Pradesh", "West Bengal",
]


def fetch_text(url: str) -> str:
    """Via curl (subprocess): this venv's Python has no configured CA bundle,
    which breaks urllib's TLS handshake; curl uses the system trust store."""
    last_error = None
    for attempt in range(1, RETRY_ATTEMPTS + 1):
        result = subprocess.run(
            ["curl", "-sS", "--fail", "--max-time", "30", "-H", f"User-Agent: {USER_AGENT}", url],
            capture_output=True,
        )
        if result.returncode == 0:
            return result.stdout.decode(errors="replace")
        last_error = result.stderr.decode(errors="replace")
        if attempt < RETRY_ATTEMPTS:
            time.sleep(RETRY_BACKOFF_SECONDS * attempt)
    raise RuntimeError(f"Failed to fetch {url} after {RETRY_ATTEMPTS} attempts: {last_error}")


def normalize(value) -> str:
    """Same normalization as update_details.py: strips only (SC)/(ST)
    reservation tags (kept for consistency, not strictly needed here since
    we're matching against constituency_key values that already went through
    this exact transform), uppercases, and collapses punctuation/whitespace."""
    if not value:
        return ""
    value = re.sub(r"\(\s*(SC|ST)\s*\)", "", value, flags=re.IGNORECASE)
    value = value.replace("&", " AND ")
    value = re.sub(r"[^A-Za-z0-9]+", " ", value)
    return " ".join(value.upper().split())


def parse_winners(html: str) -> list[dict]:
    """Extracts (candidate_id, name, constituency) from a MyNeta winners
    table. The name cell is doubly-linked in the markup
    (<a href=/candidate.php...><a href=/LokSabha2024/candidate.php...>Name</a></a>)."""
    rows = re.findall(
        r"candidate\.php\?candidate_id=(\d+)>([^<]+)</a></a>.*?</td>\s*<td>([^<]+)</td>",
        html,
    )
    return [
        {"candidate_id": cid, "name": name.strip(), "constituency": constituency.strip()}
        for cid, name, constituency in rows
    ]


def fetch_photo_url(dataset_slug: str, candidate_id: str) -> str | None:
    """The dataset slug (e.g. 'LokSabha2024', 'goa2022') MUST be in the path --
    the bare /candidate.php?candidate_id=X route returns 200 with a page that
    has no profile image at all, silently yielding zero photos."""
    html = fetch_text(f"{BASE_URL}/{dataset_slug}/candidate.php?candidate_id={candidate_id}")
    match = re.search(r"src=['\"]?(https://myneta\.info/images_candidate/[^\s'\">]+)", html)
    return match.group(1) if match else None


def update_mp_photos() -> None:
    with engine.connect() as conn:
        target_mps = conn.execute(text(
            "SELECT id, name, constituency_key FROM mps WHERE photo_url IS NULL"
        )).fetchall()

    print(f"{len(target_mps)} MPs still missing a photo after the Wikipedia pass")
    if not target_mps:
        return

    by_constituency = {}
    for row in target_mps:
        by_constituency.setdefault(row.constituency_key, []).append(row)

    winners = parse_winners(fetch_text(LOKSABHA_WINNERS_URL))
    print(f"Parsed {len(winners)} rows from the LokSabha2024 winners page")

    stored = 0
    for winner in winners:
        constituency_key = normalize(winner["constituency"])
        candidates = by_constituency.get(constituency_key)
        if not candidates:
            continue

        match = next((c for c in candidates if normalize(c.name) == normalize(winner["name"])), candidates[0])

        photo_url = fetch_photo_url("LokSabha2024", winner["candidate_id"])
        time.sleep(REQUEST_DELAY_SECONDS)
        if not photo_url:
            continue

        with engine.begin() as conn:
            conn.execute(
                text("UPDATE mps SET photo_url = :photo_url WHERE id = :id"),
                {"photo_url": photo_url, "id": match.id},
            )
        stored += 1

    print(f"MPs: stored {stored} photos via MyNeta")


def discover_current_term_winners_url(state: str) -> str | None:
    html = fetch_text(f"{BASE_URL}/state_assembly.php?state={quote(state)}")
    match = re.search(r"href=/([a-zA-Z]+\d{4})/index\.php\?action=show_winners[^\s>]*", html)
    if not match:
        return None
    dataset_slug = match.group(1)
    return dataset_slug, f"{BASE_URL}/{dataset_slug}/index.php?action=show_winners&sort=default"


# MyNeta's own spelling for this state ("Chattisgarh", one 'h') doesn't match
# the corrected state_key our mlas rows actually use ("CHHATTISGARH", from
# the same alias fix applied in update_details.py) -- without this, the
# lookup below silently finds zero rows and the whole state gets skipped as
# if it had no gaps, when in fact it was never queried at all.
STATE_KEY_ALIASES = {
    "CHATTISGARH": "CHHATTISGARH",
}


def update_mla_photos_for_state(state: str) -> None:
    with engine.connect() as conn:
        state_key = normalize(state)
        state_key = STATE_KEY_ALIASES.get(state_key, state_key)
        target_mlas = conn.execute(text(
            "SELECT id, name, constituency_key FROM mlas WHERE state_key = :state_key AND photo_url IS NULL"
        ), {"state_key": state_key}).fetchall()

    if not target_mlas:
        print(f"{state}: no remaining photo gaps, skipping")
        return

    discovery = discover_current_term_winners_url(state)
    if not discovery:
        print(f"{state}: could not discover a current-term winners page, skipping")
        return
    dataset_slug, winners_url = discovery

    by_constituency = {}
    for row in target_mlas:
        by_constituency.setdefault(row.constituency_key, []).append(row)

    winners = parse_winners(fetch_text(winners_url))
    time.sleep(REQUEST_DELAY_SECONDS)

    stored = 0
    for winner in winners:
        constituency_key = normalize(winner["constituency"])
        candidates = by_constituency.get(constituency_key)
        if not candidates:
            continue

        match = next((c for c in candidates if normalize(c.name) == normalize(winner["name"])), candidates[0])

        photo_url = fetch_photo_url(dataset_slug, winner["candidate_id"])
        time.sleep(REQUEST_DELAY_SECONDS)
        if not photo_url:
            continue

        with engine.begin() as conn:
            conn.execute(
                text("UPDATE mlas SET photo_url = :photo_url WHERE id = :id"),
                {"photo_url": photo_url, "id": match.id},
            )
        stored += 1

    print(f"{state} ({winners_url}): {len(target_mlas)} gaps, {len(winners)} winners parsed, {stored} photos stored")


def update_mla_photos(states: list[str]) -> None:
    for state in states:
        update_mla_photos_for_state(state)


def main() -> None:
    args = sys.argv[1:]
    mode = args[0] if args else "mps"

    if mode == "mps":
        update_mp_photos()
    elif mode == "mlas":
        if "--state" in args:
            state = args[args.index("--state") + 1]
            update_mla_photos([state])
        else:
            update_mla_photos(STATES)
    else:
        sys.exit(f"Unknown mode {mode!r}, expected 'mps' or 'mlas'")


if __name__ == "__main__":
    main()
