"""
One-off full-roster reconciliation against MyNeta's latest winners, keyed to the
new (ECI Release 2026) assembly_constituencies layer.

Per state:
  1. discover the latest MyNeta dataset that actually has a winners list
  2. parse winners (name, candidate_id, constituency, party, criminal cases, education)
  3. align to the AC layer's constituency_key set (source of truth post-swap)
  4. upsert mlas rows: same person -> untouched; changed person -> update + reset
     counts/photo; missing seat -> insert; stale key (pre-delimitation) -> delete
  5. optionally fetch photos for rows left with NULL photo_url from the same dataset

Run from SYL/app:  ../.venv/bin/python /path/to/roster_reconcile.py --state "Assam" [--apply]
                   ../.venv/bin/python /path/to/roster_reconcile.py --all [--apply] [--photos]
"""
from __future__ import annotations

import argparse
import html as html_mod
import re
import subprocess
import sys
import time
from urllib.parse import quote

sys.path.insert(0, "/Users/abhirajintern/Desktop/SYL/app")

from sqlalchemy import text  # noqa: E402
from db.connect import engine  # noqa: E402
from data_update.roster_refresh import (  # noqa: E402
    normalize, classify_name_pair, name_similarity,
)

BASE_URL = "https://myneta.info"
USER_AGENT = "SlapYourLeader-DataPipeline/1.0 (self-hosted civic-sentiment app; contact: project owner)"

# MyNeta home-page state params -> our mlas.state_key
STATE_PARAM = {
    "ANDHRA PRADESH": "Andhra Pradesh", "ARUNACHAL PRADESH": "Arunachal Pradesh",
    "ASSAM": "Assam", "BIHAR": "Bihar", "CHHATTISGARH": "Chattisgarh", "DELHI": "Delhi",
    "GOA": "Goa", "GUJARAT": "Gujarat", "HARYANA": "Haryana",
    "HIMACHAL PRADESH": "Himachal Pradesh", "JAMMU AND KASHMIR": "Jammu And Kashmir",
    "JHARKHAND": "Jharkhand", "KARNATAKA": "Karnataka", "KERALA": "Kerala",
    "MADHYA PRADESH": "Madhya Pradesh", "MAHARASHTRA": "Maharashtra",
    "MANIPUR": "Manipur", "MEGHALAYA": "Meghalaya", "MIZORAM": "Mizoram",
    "NAGALAND": "Nagaland", "ODISHA": "Odisha", "PUDUCHERRY": "Puducherry",
    "PUNJAB": "Punjab", "RAJASTHAN": "Rajasthan", "SIKKIM": "Sikkim",
    "TAMIL NADU": "Tamil Nadu", "TELANGANA": "Telangana", "TRIPURA": "Tripura",
    "UTTAR PRADESH": "Uttar Pradesh", "UTTARAKHAND": "Uttarakhand",
    "WEST BENGAL": "West Bengal",
}

# Non-territorial seats with no AC geometry: never delete, never insert-from-AC
NO_GEOM_KEYS = {("SIKKIM", "SANGHA")}

# Winner-key -> AC-key aliases the fuzzy remap can't safely infer (same-named
# constituencies in different districts)
MANUAL_KEY_ALIASES = {
    "TAMIL NADU": {"TIRUPPATHUR": "TIRUPPATTUR SIVAGANGA"},
}


def fetch_text(url: str, attempts: int = 3) -> str:
    last = None
    for i in range(1, attempts + 1):
        r = subprocess.run(
            ["curl", "-sS", "--fail", "--max-time", "40", "-H", f"User-Agent: {USER_AGENT}", url],
            capture_output=True,
        )
        if r.returncode == 0:
            return r.stdout.decode(errors="replace")
        last = r.stderr.decode(errors="replace")
        time.sleep(3 * i)
    raise RuntimeError(f"fetch failed {url}: {last}")


def discover_latest_dataset(state_key: str) -> str | None:
    """All dataset slugs on the state page, newest year first, first one whose
    winners page actually lists candidates wins."""
    page = fetch_text(f"{BASE_URL}/state_assembly.php?state={quote(STATE_PARAM[state_key])}")
    slugs = re.findall(r"href='?\"?/?([A-Za-z]+\d{4})/", page)
    seen, ordered = set(), []
    for s in slugs:
        if s not in seen:
            seen.add(s)
            ordered.append(s)
    ordered.sort(key=lambda s: int(s[-4:]), reverse=True)
    for slug in ordered:
        try:
            wp = fetch_text(f"{BASE_URL}/{slug}/index.php?action=show_winners&sort=default")
        except RuntimeError:
            continue
        if wp.count("candidate_id=") > 20:  # a real winners list, not an empty shell
            return slug
    return None


ROW_RE = re.compile(
    r"candidate\.php\?candidate_id=(\d+)>([^<]+)</a></a>[^<]*(?:<b>)?</td>"
    r"<td>([^<]+)</td>\s*"          # constituency
    r"<td>([^<]+)</td>\s*"          # party
    r"<td[^>]*>(?:<span[^>]*><b>\s*)?(\d+)(?:\s*</b></span>)?</td>\s*"  # criminal cases
    r"<td[^>]*>([^<]*)</td>",       # education
    re.DOTALL,
)


def parse_winners(page: str) -> list[dict]:
    out = []
    for cid, name, cons, party, cases, edu in ROW_RE.findall(page):
        out.append({
            "candidate_id": cid,
            "name": html_mod.unescape(name).strip(),
            "constituency": html_mod.unescape(cons).strip(),
            "party": html_mod.unescape(party).strip(),
            "criminal_cases": int(cases),
            "education": html_mod.unescape(edu).strip() or None,
        })
    return out


def fetch_photo_url(slug: str, candidate_id: str) -> str | None:
    try:
        page = fetch_text(f"{BASE_URL}/{slug}/candidate.php?candidate_id={candidate_id}", attempts=2)
    except RuntimeError:
        return None
    m = re.search(r"src=(https?://myneta\.info/images_candidate/[^\s>\"']+)", page)
    return m.group(1) if m else None


def reconcile_state(state_key: str, apply: bool, photos: bool) -> dict:
    slug = discover_latest_dataset(state_key)
    if not slug:
        print(f"!! {state_key}: no winners dataset found, skipping")
        return {}
    winners = parse_winners(fetch_text(f"{BASE_URL}/{slug}/index.php?action=show_winners&sort=default"))
    # By-election rows ("X : BYE ELECTION ON d-m-Y") supersede the general winner for X
    winners_by_ck: dict[str, dict] = {}
    bye_keys = set()
    for w in winners:
        cons = w["constituency"]
        m = re.match(r"(.+?)\s*:\s*BYE ELECTION", cons, re.IGNORECASE)
        if m:
            ck = normalize(m.group(1))
            w = {**w, "constituency": m.group(1).strip()}
            winners_by_ck[ck] = w
            bye_keys.add(ck)
        else:
            ck = normalize(cons)
            if ck not in bye_keys:
                winners_by_ck[ck] = w

    with engine.connect() as conn:
        ac_keys = set(conn.execute(text(
            "SELECT constituency_key FROM assembly_constituencies WHERE state_key=:sk"
        ), {"sk": state_key}).scalars())
        stored = conn.execute(text(
            "SELECT id, name, constituency, constituency_key, party, photo_url FROM mlas WHERE state_key=:sk"
        ), {"sk": state_key}).fetchall()
        display_state = conn.execute(text(
            "SELECT state FROM mlas WHERE state_key=:sk LIMIT 1"), {"sk": state_key}).scalar()
    stored_by_ck = {r.constituency_key: r for r in stored}

    # First, rekey STORED rows whose old key is a spelling variant of an AC key
    # (old boundary table used MyNeta-style spellings). A rekeyed row keeps its
    # person/photo/counts; only its key + display constituency change.
    rekeys: list[tuple[str, str]] = []  # (old_key, new_key)
    stored_unmatched = [ck for ck in stored_by_ck if ck not in ac_keys
                        and (state_key, ck) not in NO_GEOM_KEYS]
    stored_unclaimed_ac = [ck for ck in ac_keys if ck not in stored_by_ck]
    for sck in stored_unmatched:
        best, best_score = None, 0.0
        for ack in stored_unclaimed_ac:
            s = name_similarity(sck, ack)
            if s > best_score:
                best, best_score = ack, s
        if best is not None and best_score >= 0.80:
            stored_by_ck[best] = stored_by_ck.pop(sck)
            stored_unclaimed_ac.remove(best)
            rekeys.append((sck, best))
            print(f"   STORED-REKEY {sck!r} -> {best!r} (score={best_score:.2f})")

    for src, dst in MANUAL_KEY_ALIASES.get(state_key, {}).items():
        if src in winners_by_ck and dst not in winners_by_ck:
            winners_by_ck[dst] = winners_by_ck.pop(src)

    # Spelling-variant fallback: remap winner keys that miss the AC set onto
    # unclaimed AC keys when the names are near-identical (e.g. MyNeta
    # "CHARAR-I-SHARIEF" vs ECI "Chrar i Sharief").
    unmatched_keys = [ck for ck in winners_by_ck if ck not in ac_keys]
    unclaimed_ac = [ck for ck in ac_keys if ck not in winners_by_ck]
    for wck in unmatched_keys:
        best, best_score = None, 0.0
        for ack in unclaimed_ac:
            s = name_similarity(wck, ack)
            if s > best_score:
                best, best_score = ack, s
        if best is not None and best_score >= 0.80:
            winners_by_ck[best] = winners_by_ck.pop(wck)
            unclaimed_ac.remove(best)
            print(f"   KEY-REMAP {wck!r} -> {best!r} (score={best_score:.2f})")

    same, changed, inserted, deleted, ambiguous, unmatched_winner, no_winner = 0, [], [], [], [], [], []
    stored_no_winner = 0

    # AC layer is the seat list; winners fill it
    for ck in sorted(ac_keys):
        w = winners_by_ck.get(ck)
        row = stored_by_ck.get(ck)
        if w is None:
            if row is None:
                no_winner.append(ck)   # seat exists, no parse + no stored row
            else:
                stored_no_winner += 1  # left alone; possibly stale if seat changed hands
            continue
        if row is None:
            inserted.append((ck, w))
            continue
        verdict = classify_name_pair(row.name, w["name"])
        if verdict == "same":
            same += 1
        else:
            changed.append((row, w, verdict, name_similarity(row.name, w["name"])))
            if verdict == "ambiguous":
                ambiguous.append((row.constituency, row.name, w["name"]))

    for ck, w in winners_by_ck.items():
        if ck not in ac_keys:
            unmatched_winner.append((w["constituency"], w["name"]))

    for ck, row in stored_by_ck.items():
        if ck not in ac_keys and (state_key, ck) not in NO_GEOM_KEYS:
            deleted.append(row)

    print(f"\n=== {state_key} [{slug}] winners parsed: {len(winners)} | AC seats: {len(ac_keys)} ===")
    print(f" same: {same} | changed: {len(changed)} | insert: {len(inserted)}"
          f" | delete-stale: {len(deleted)} | rekeyed: {len(rekeys)}"
          f" | stored-no-fresh-winner: {stored_no_winner}"
          f" | winner-key-unmatched: {len(unmatched_winner)}"
          f" | seat-no-data: {len(no_winner)}")
    for c, a, b in ambiguous:
        print(f"   AMBIGUOUS [{c}] {a!r} -> {b!r}")
    for c, n in unmatched_winner:
        print(f"   UNMATCHED-WINNER {c!r} ({n})")
    if no_winner:
        print(f"   SEAT-NO-DATA: {no_winner}")

    if apply:
        with engine.connect() as conn:
            ac_names = dict(conn.execute(text(
                "SELECT constituency_key, ac_name FROM assembly_constituencies WHERE state_key=:sk"
            ), {"sk": state_key}).fetchall())
        with engine.begin() as conn:
            for old_ck, new_ck in rekeys:
                conn.execute(text(
                    "UPDATE mlas SET constituency_key=:ck, constituency=:cons WHERE id=:id"
                ), {"ck": new_ck, "cons": (ac_names.get(new_ck) or new_ck).upper(),
                    "id": stored_by_ck[new_ck].id})
            for row, w, verdict, score in changed:
                conn.execute(text("""
                    UPDATE mlas SET name=:n, party=:p, criminal_cases=:cc, education=:e,
                        slap_count=0, rose_count=0, photo_url=NULL
                    WHERE id=:id
                """), {"n": w["name"], "p": w["party"], "cc": w["criminal_cases"],
                       "e": w["education"], "id": row.id})
            for ck, w in inserted:
                conn.execute(text("""
                    INSERT INTO mlas (name, state, constituency, party, criminal_cases, education,
                                      assets, state_key, constituency_key, photo_url, slap_count, rose_count)
                    VALUES (:n, :st, :cons, :p, :cc, :e, NULL, :sk, :ck, NULL, 0, 0)
                """), {"n": w["name"], "st": display_state, "cons": w["constituency"].upper(),
                       "p": w["party"], "cc": w["criminal_cases"], "e": w["education"],
                       "sk": state_key, "ck": ck})
            for row in deleted:
                conn.execute(text("DELETE FROM mlas WHERE id=:id"), {"id": row.id})
        print(f" APPLIED: {len(changed)} updates, {len(inserted)} inserts, {len(deleted)} deletes")

    if apply and photos:
        with engine.connect() as conn:
            gaps = conn.execute(text(
                "SELECT id, constituency_key FROM mlas WHERE state_key=:sk AND photo_url IS NULL"
            ), {"sk": state_key}).fetchall()
        filled = 0
        for g in gaps:
            w = winners_by_ck.get(g.constituency_key)
            if not w:
                continue
            url = fetch_photo_url(slug, w["candidate_id"])
            time.sleep(0.35)
            if url:
                with engine.begin() as conn:
                    conn.execute(text("UPDATE mlas SET photo_url=:u WHERE id=:id"),
                                 {"u": url, "id": g.id})
                filled += 1
        print(f" PHOTOS: filled {filled}/{len(gaps)} gaps")

    return {"state": state_key, "slug": slug, "same": same, "changed": len(changed),
            "inserted": len(inserted), "deleted": len(deleted)}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--state")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--photos", action="store_true")
    args = ap.parse_args()
    states = list(STATE_PARAM) if args.all else [args.state.upper()]
    summaries = []
    for sk in states:
        try:
            summaries.append(reconcile_state(sk, args.apply, args.photos))
        except Exception as e:  # keep going; one state's failure shouldn't kill the run
            print(f"!! {sk}: ERROR {e}")
        time.sleep(1)
    print("\n==== SUMMARY ====")
    for s in summaries:
        if s:
            print(f"{s['state']}: [{s['slug']}] same={s['same']} changed={s['changed']}"
                  f" ins={s['inserted']} del={s['deleted']}")


if __name__ == "__main__":
    main()
