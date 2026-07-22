"""
One-off remediation pass for the mlas photo gaps that myneta_photo_update.py's
exact constituency_key match legitimately leaves behind in states where the
DB's transliteration of a constituency name differs from MyNeta's (e.g. TN's
ARUPPUKKOTTAI vs MyNeta's ARUPPUKOTTAI -- a doubled-consonant spelling
variant, not a different seat).

Matches on a "loose key" that collapses consecutive duplicate letters
(normalize() output with runs like "KK"/"TT"/"LL" folded to one letter).
This resolves doubling-variant pairs without over-matching: it does NOT
merge cases that differ by more than doubling, e.g. ATTUR vs SATTUR or
ERODE WEST vs ERODE EAST stay distinct under this key, unlike a generic
edit-distance fuzzy match (which conflates both of those). Any loose key
that collides across more than one distinct real constituency name on
either side is treated as ambiguous and skipped rather than guessed.

Run from the app/ directory:
    cd app && python -m data_update.fix_transliteration_gaps --state "Tamil Nadu"
    cd app && python -m data_update.fix_transliteration_gaps --state "Tamil Nadu" --dry-run
"""
from __future__ import annotations

import argparse
import re
import time
from collections import defaultdict

from sqlalchemy import text

from db.connect import engine
from data_update.myneta_photo_update import (
    STATE_KEY_ALIASES,
    discover_current_term_winners_url,
    fetch_photo_url,
    fetch_text,
    normalize,
    parse_winners,
)


def loose_key(value: str) -> str:
    return re.sub(r"(.)\1+", r"\1", normalize(value))


def run(state: str, dry_run: bool) -> None:
    state_key = normalize(state)
    state_key = STATE_KEY_ALIASES.get(state_key, state_key)
    with engine.connect() as conn:
        target_mlas = conn.execute(text(
            "SELECT id, name, constituency_key FROM mlas WHERE state_key = :state_key AND photo_url IS NULL"
        ), {"state_key": state_key}).fetchall()

    if not target_mlas:
        print(f"{state}: no remaining photo gaps")
        return

    discovery = discover_current_term_winners_url(state)
    if not discovery:
        print(f"{state}: could not discover a current-term winners page")
        return
    dataset_slug, winners_url = discovery

    winners = parse_winners(fetch_text(winners_url))
    time.sleep(0.4)

    # Group winners by loose key; find real (non-doubling) name collisions.
    winners_by_loose = defaultdict(set)
    winner_rows_by_loose = defaultdict(list)
    for w in winners:
        lk = loose_key(w["constituency"])
        winners_by_loose[lk].add(normalize(w["constituency"]))
        winner_rows_by_loose[lk].append(w)

    ambiguous_loose_keys = {lk for lk, names in winners_by_loose.items() if len(names) > 1}

    gaps_by_loose = defaultdict(list)
    for row in target_mlas:
        gaps_by_loose[loose_key(row.constituency_key)].append(row)

    matched = 0
    skipped_ambiguous = 0
    skipped_no_photo = 0
    for lk, gap_rows in gaps_by_loose.items():
        if lk in ambiguous_loose_keys:
            skipped_ambiguous += len(gap_rows)
            continue
        candidate_winners = winner_rows_by_loose.get(lk)
        if not candidate_winners:
            continue
        winner = candidate_winners[0]
        for gap_row in gap_rows:
            if normalize(gap_row.constituency_key) == normalize(winner["constituency"]):
                continue  # exact match -- already handled by the main pass
            print(f"  MATCH: DB={gap_row.constituency_key!r} ({gap_row.name}) <-> MyNeta={winner['constituency']!r}")
            if dry_run:
                matched += 1
                continue
            photo_url = fetch_photo_url(dataset_slug, winner["candidate_id"])
            time.sleep(0.4)
            if not photo_url:
                skipped_no_photo += 1
                continue
            with engine.begin() as conn:
                conn.execute(
                    text("UPDATE mlas SET photo_url = :photo_url WHERE id = :id"),
                    {"photo_url": photo_url, "id": gap_row.id},
                )
            matched += 1

    verb = "would store" if dry_run else "stored"
    print(f"{state}: {verb} {matched} photos via loose-key match; "
          f"{skipped_ambiguous} skipped (ambiguous), {skipped_no_photo} skipped (no photo on page)")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--state", required=True)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    run(args.state, args.dry_run)


if __name__ == "__main__":
    main()
