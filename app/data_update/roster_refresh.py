"""
Verify each state's mlas roster against MyNeta's CURRENT-term winners list
and refresh rows where the actual officeholder has changed since our
original data pull (nish.space, and even its live API, was found to still
be serving Assam's outgoing 2021-2026 assembly membership after Assam's 2026
election -- this is likely not unique to Assam).

For each constituency in the current winners list, names are classified into
three buckets (see classify_name_pair) rather than a single same/different
boolean -- no name-similarity score perfectly separates "same person,
reformatted name" from "different person" (a parent and their by-election
successor can share two of three name words, e.g. Nanded's
'Vasantrao Balwantrao Chavan' vs 'Chavan Ravindra Vasantrao'):
  - "same": leave the row alone entirely -- votes and photo stay put.
  - "different": high-confidence the seat changed hands, but --apply is
    still required, and even then this is a strong signal, not a verified
    fact -- worth a spot-check against real news before trusting broadly.
    Applying updates name/party and resets slap_count/rose_count/photo_url,
    since carrying old votes/photo over to a different real person would
    misattribute them.
  - "ambiguous": name similarity is inconclusive. Never auto-applied,
    printed for manual review.
  - Constituencies present in one list but not the other (delimitation,
    parsing misses) are reported, not silently guessed at.

This does NOT re-fetch photos -- run photo_update.py / myneta_photo_update.py
/ sansad_photo_update.py again afterward for any state this refreshes.

Run from the app/ directory:
    cd app && python -m data_update.roster_refresh --state "Assam"
    cd app && python -m data_update.roster_refresh --state "Assam" --apply
"""
from __future__ import annotations

import argparse
import difflib
import re
import subprocess
import time
from urllib.parse import quote

from sqlalchemy import text

from db.connect import engine

BASE_URL = "https://myneta.info"
USER_AGENT = "SlapYourLeader-DataPipeline/1.0 (self-hosted civic-sentiment app; contact: project owner)"
RETRY_ATTEMPTS = 3
RETRY_BACKOFF_SECONDS = 4


def fetch_text(url: str) -> str:
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
    if not value:
        return ""
    value = re.sub(r"\(\s*(SC|ST)\s*\)", "", value, flags=re.IGNORECASE)
    value = value.replace("&", " AND ")
    value = re.sub(r"[^A-Za-z0-9]+", " ", value)
    return " ".join(value.upper().split())


def parse_winners(html: str) -> list[dict]:
    rows = re.findall(
        r"candidate\.php\?candidate_id=(\d+)>([^<]+)</a></a>.*?</td>\s*<td>([^<]+)</td>\s*<td>([^<]+)</td>",
        html,
    )
    return [
        {"candidate_id": cid, "name": name.strip(), "constituency": constituency.strip(), "party": party.strip()}
        for cid, name, constituency, party in rows
    ]


def discover_current_term_winners_url(state: str) -> tuple[str, str] | None:
    html = fetch_text(f"{BASE_URL}/state_assembly.php?state={quote(state)}")
    match = re.search(r"href=/([a-zA-Z]+\d{4})/index\.php\?action=show_winners[^\s>]*", html)
    if not match:
        return None
    dataset_slug = match.group(1)
    return dataset_slug, f"{BASE_URL}/{dataset_slug}/index.php?action=show_winners&sort=default"


def _concat_ratio(a: str, b: str) -> float:
    """Character-level similarity on names with all spaces removed, so
    'Amraram' vs 'Amra Ram' and 'Chandrashekhar' vs 'Chandra Shekhar' compare
    as identical despite different word-splitting."""
    ca, cb = normalize(a).replace(" ", ""), normalize(b).replace(" ", "")
    return difflib.SequenceMatcher(None, ca, cb).ratio()


def _word_overlap_score(a: str, b: str) -> float:
    """Exact-word overlap (as a fraction of the shorter name's word count),
    with initials expanded against the longer name (so 'C R Patil' matches
    'Chandrakant Raghunath Patil')."""
    wa, wb = normalize(a).split(), normalize(b).split()
    sa, sb = set(wa), set(wb)
    if not sa or not sb:
        return 0.0
    exact_common = sa & sb
    shorter, longer = (wa, wb) if len(wa) <= len(wb) else (wb, wa)
    initials_hits = sum(
        1 for w in shorter
        if len(w) == 1 and w not in exact_common and any(lw.startswith(w) for lw in longer)
    )
    return min((len(exact_common) + initials_hits) / min(len(sa), len(sb)), 1.0)


def name_similarity(a: str, b: str) -> float:
    """Best-of-two-signals similarity score in [0, 1]. Neither signal alone
    is reliable: character-ratio misses reordered/expanded names ('C R
    Patil' vs 'Chandrakant Raghunath Patil' scores 0.44), and word-overlap
    is fooled by Indian patronymic naming, where a parent and their
    successor can share two of three name words (the real case that
    surfaced this: Nanded's MP by-election, 'Vasantrao Balwantrao Chavan'
    vs 'Chavan Ravindra Vasantrao' -- different people, sharing 'Chavan' and
    'Vasantrao'). Calibrated against a set of confirmed same-person and
    confirmed-different-person name pairs found this session; the two
    classes still overlap in the middle (a same-person pair can score as
    low as ~0.50, a different-person pair as high as ~0.71) -- there is no
    threshold that separates them perfectly from text alone, hence the
    three-tier classification in classify_name_pair() rather than a single
    boolean cutoff."""
    if not a or not b:
        return 0.0
    return max(_concat_ratio(a, b), _word_overlap_score(a, b))


HIGH_CONFIDENCE_SAME = 0.80
HIGH_CONFIDENCE_DIFFERENT = 0.30


def classify_name_pair(a: str, b: str) -> str:
    """Returns 'same', 'different', or 'ambiguous'. Only 'same' is safe to
    treat as "no action needed" automatically. Both 'different' and
    'ambiguous' need a human look before writing anything -- 'different'
    per this scorer is a strong signal, not a verified fact (Nanded looked
    like a plausible name match too, until MyNeta's own by-election note
    confirmed it)."""
    score = name_similarity(a, b)
    if score >= HIGH_CONFIDENCE_SAME:
        return "same"
    if score <= HIGH_CONFIDENCE_DIFFERENT:
        return "different"
    return "ambiguous"


# MyNeta's own spelling for this state ("Chattisgarh", one 'h') doesn't match
# the corrected state_key our mlas rows actually use ("CHHATTISGARH", from
# the same alias fix applied in update_details.py) -- without this, the
# lookup below silently finds zero rows and the whole state looks like it
# has no data to compare, rather than actually being checked.
STATE_KEY_ALIASES = {
    "CHATTISGARH": "CHHATTISGARH",
}


def refresh_state(state: str, apply: bool, apply_ambiguous: bool = False) -> None:
    discovery = discover_current_term_winners_url(state)
    if not discovery:
        print(f"{state}: could not discover a current-term winners page, skipping")
        return
    dataset_slug, winners_url = discovery

    with engine.connect() as conn:
        state_key = normalize(state)
        state_key = STATE_KEY_ALIASES.get(state_key, state_key)
        stored = conn.execute(text(
            "SELECT id, name, constituency, constituency_key FROM mlas WHERE state_key = :state_key"
        ), {"state_key": state_key}).fetchall()
    stored_by_ck = {row.constituency_key: row for row in stored}

    winners = parse_winners(fetch_text(winners_url))
    winners_by_ck = {}
    for winner in winners:
        winners_by_ck[normalize(winner["constituency"])] = winner

    unchanged, different, ambiguous, missing_in_ours, missing_in_current = 0, [], [], [], []

    for ck, winner in winners_by_ck.items():
        row = stored_by_ck.get(ck)
        if row is None:
            missing_in_ours.append(winner)
            continue
        verdict = classify_name_pair(row.name, winner["name"])
        if verdict == "same":
            unchanged += 1
        elif verdict == "different":
            different.append((row, winner))
        else:
            ambiguous.append((row, winner))

    for ck, row in stored_by_ck.items():
        if ck not in winners_by_ck:
            missing_in_current.append(row)

    print(f"\n=== {state} ({winners_url}) ===")
    print(f"Unchanged (same person, left alone): {unchanged}")
    print(f"Likely different person (high-confidence, still needs a human look before writing): {len(different)}")
    for row, winner in different:
        print(f"  [{row.constituency}] {row.name!r} -> {winner['name']!r}")
    if ambiguous:
        print(f"Ambiguous (name similarity inconclusive, needs manual review): {len(ambiguous)}")
        for row, winner in ambiguous:
            print(f"  [{row.constituency}] {row.name!r} -> {winner['name']!r}  (score={name_similarity(row.name, winner['name']):.2f})")
    if missing_in_ours:
        print(f"Constituencies in current winners with no stored row: {len(missing_in_ours)}")
        for w in missing_in_ours:
            print(f"  {w['constituency']} -- {w['name']}")
    if missing_in_current:
        print(f"Stored constituencies not found in current winners: {len(missing_in_current)}")
        for row in missing_in_current:
            print(f"  {row.constituency} -- {row.name}")

    to_write = list(different)
    if apply_ambiguous:
        to_write += ambiguous
        # Surface pairs close to the "same person" boundary specifically --
        # these are the ones most likely to actually be a reformatted name
        # rather than a real seat change, worth a manual glance even though
        # they're being applied (per instruction: MyNeta's current-term
        # winner is treated as accurate regardless, so applying is still
        # correct either way, but a close-to-threshold score is the closest
        # thing to a red flag available at this scale).
        near_threshold = [
            (row, winner) for row, winner in ambiguous
            if name_similarity(row.name, winner["name"]) >= HIGH_CONFIDENCE_SAME - 0.10
        ]
        if near_threshold:
            print(f"Ambiguous cases close to the 'same person' boundary (worth a second look, still applied): {len(near_threshold)}")
            for row, winner in near_threshold:
                print(f"  [{row.constituency}] {row.name!r} -> {winner['name']!r}  (score={name_similarity(row.name, winner['name']):.2f})")

    if apply and to_write:
        with engine.begin() as conn:
            for row, winner in to_write:
                conn.execute(text("""
                    UPDATE mlas SET name = :name, party = :party,
                        slap_count = 0, rose_count = 0, photo_url = NULL
                    WHERE id = :id
                """), {"name": winner["name"], "party": winner["party"], "id": row.id})
        note = " (including ambiguous)" if apply_ambiguous else " (ambiguous cases were NOT touched)"
        print(f"Applied {len(to_write)} updates for {state}.{note}")
    elif to_write:
        print("(dry run -- pass --apply to write these changes)")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--state", required=True)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--apply-ambiguous", action="store_true", help="Also apply the ambiguous bucket, not just high-confidence-different")
    args = parser.parse_args()
    refresh_state(args.state, args.apply, args.apply_ambiguous)


if __name__ == "__main__":
    main()
