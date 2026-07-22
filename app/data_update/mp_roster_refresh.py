"""
Verify the mps roster against sansad.in's live, official Lok Sabha member
directory (National Informatics Centre, Government of India) -- the same
authoritative source used for MP photos earlier. Unlike the per-state MLA
check, this is a single national dataset (543-ish seats, one API call), so
no by-state discovery step is needed.

Lok Sabha's 5-year term (2024-2029) isn't up, so a wholesale roster swap
like Assam's assembly isn't expected here -- but individual seats can still
change mid-term via by-election, death, resignation, or disqualification
(confirmed real case this session: Nanded, Maharashtra). This finds any
other such cases.

For each (state, constituency), names are classified into three buckets
(see classify_name_pair) rather than a single same/different boolean -- no
name-similarity score perfectly separates "same person, reformatted name"
from "different person" (a parent and their by-election successor can share
two of three name words, e.g. Nanded's 'Vasantrao Balwantrao Chavan' vs
'Chavan Ravindra Vasantrao'):
  - "same": left alone, no action.
  - "different": high-confidence the seat changed, but --apply is still
    required and this remains a strong signal, not a verified fact -- worth
    spot-checking before trusting broadly.
  - "ambiguous": inconclusive, never auto-applied, printed for review.

Run from the app/ directory:
    cd app && python -m data_update.mp_roster_refresh
    cd app && python -m data_update.mp_roster_refresh --apply
"""
from __future__ import annotations

import argparse
import difflib
import json
import re
import subprocess
import time

from sqlalchemy import text

from db.connect import engine

SEARCH_URL = (
    "https://sansad.in/api_ls/member?loksabha=18&state=&party=&gender=&ageFrom=&ageTo="
    "&noOfTerms=&page=1&size=600&searchText=&constituency=&sitting=1&locale=en"
    "&month=&profession=&otherProfession=&constituencyCategory=&positionCode="
    "&qualification=&noOfChildren=&isFreedomFighter=&memberStatus=s"
)
USER_AGENT = "Mozilla/5.0"
RETRY_ATTEMPTS = 3
RETRY_BACKOFF_SECONDS = 3


def fetch_json(url: str) -> dict:
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


def normalize(value) -> str:
    if not value:
        return ""
    value = re.sub(r"\(\s*(SC|ST)\s*\)", "", value, flags=re.IGNORECASE)
    value = value.replace("&", " AND ")
    value = re.sub(r"[^A-Za-z0-9]+", " ", value)
    return " ".join(value.upper().split())


def _concat_ratio(a: str, b: str) -> float:
    """Character-level similarity with all spaces removed, so 'Amraram' vs
    'Amra Ram' and 'Chandrashekhar' vs 'Chandra Shekhar' compare as
    identical despite different word-splitting."""
    ca, cb = normalize(a).replace(" ", ""), normalize(b).replace(" ", "")
    return difflib.SequenceMatcher(None, ca, cb).ratio()


def _word_overlap_score(a: str, b: str) -> float:
    """Exact-word overlap (fraction of the shorter name's word count), with
    initials expanded against the longer name ('C R Patil' matches
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
    """Best-of-two-signals similarity in [0, 1]. Calibrated against
    confirmed same-person and confirmed-different-person MP name pairs
    found this session -- the classes still overlap in the middle (a
    same-person pair like 'C R Patil'/'Chandrakant Raghunath Patil' can
    score as low as ~0.44 on pure character similarity, while a genuinely
    different pair like Nanded's father/son MPs can score ~0.67-0.71), so
    this is a signal to bucket by, not a clean same/different boolean."""
    if not a or not b:
        return 0.0
    return max(_concat_ratio(a, b), _word_overlap_score(a, b))


HIGH_CONFIDENCE_SAME = 0.80
HIGH_CONFIDENCE_DIFFERENT = 0.30


def classify_name_pair(a: str, b: str) -> str:
    """Returns 'same', 'different', or 'ambiguous'. Only 'same' is safe to
    treat as settled automatically -- 'different' is a strong signal, not a
    verified fact (see the Nanded by-election case), and 'ambiguous' is
    never auto-applied."""
    score = name_similarity(a, b)
    if score >= HIGH_CONFIDENCE_SAME:
        return "same"
    if score <= HIGH_CONFIDENCE_DIFFERENT:
        return "different"
    return "ambiguous"


def refresh_mps(apply: bool) -> None:
    data = fetch_json(SEARCH_URL)
    current = data["membersDtoList"]
    print(f"sansad.in reports {data['metaDatasDto']['totalElements']} current sitting MPs")

    current_by_key = {}
    for member in current:
        key = (normalize(member["stateName"]), normalize(member["constName"]))
        current_by_key[key] = member

    with engine.connect() as conn:
        stored = conn.execute(text("SELECT id, name, state, constituency, party FROM mps")).fetchall()

    unchanged, different, ambiguous, missing_in_ours, missing_in_current = 0, [], [], [], []
    stored_keys = set()

    for row in stored:
        key = (normalize(row.state), normalize(row.constituency))
        stored_keys.add(key)
        member = current_by_key.get(key)
        if member is None:
            missing_in_current.append(row)
            continue
        verdict = classify_name_pair(row.name, member["mpFirstLastName"])
        if verdict == "same":
            unchanged += 1
        elif verdict == "different":
            different.append((row, member))
        else:
            ambiguous.append((row, member))

    for key, member in current_by_key.items():
        if key not in stored_keys:
            missing_in_ours.append(member)

    print(f"Unchanged (same person, left alone): {unchanged}")
    print(f"Likely different person (high-confidence, still needs a human look before writing): {len(different)}")
    for row, member in different:
        print(f"  [{row.state} / {row.constituency}] {row.name!r} -> {member['mpFirstLastName']!r}")
    if ambiguous:
        print(f"Ambiguous (name similarity inconclusive, needs manual review): {len(ambiguous)}")
        for row, member in ambiguous:
            print(f"  [{row.state} / {row.constituency}] {row.name!r} -> {member['mpFirstLastName']!r}  (score={name_similarity(row.name, member['mpFirstLastName']):.2f})")
    if missing_in_ours:
        print(f"Seats in sansad.in with no stored row: {len(missing_in_ours)}")
        for m in missing_in_ours:
            print(f"  {m['stateName']} / {m['constName']} -- {m['mpFirstLastName']}")
    if missing_in_current:
        print(f"Stored seats not found in sansad.in's current list: {len(missing_in_current)}")
        for row in missing_in_current:
            print(f"  {row.state} / {row.constituency} -- {row.name}")

    if apply and different:
        with engine.begin() as conn:
            for row, member in different:
                conn.execute(text("""
                    UPDATE mps SET name = :name, party = :party,
                        slap_count = 0, rose_count = 0, photo_url = NULL
                    WHERE id = :id
                """), {"name": member["mpFirstLastName"], "party": member["partySname"], "id": row.id})
        print(f"Applied {len(different)} updates. (Ambiguous cases were NOT touched.)")
    elif different:
        print("(dry run -- pass --apply to write the 'likely different person' list; ambiguous cases are never auto-applied)")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    refresh_mps(args.apply)


if __name__ == "__main__":
    main()
