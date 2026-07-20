# Boundary Data — Source & Quality Notes

Source: DataMeet Community Maps (`github.com/datameet/maps`), CC-BY 2.5 India license. Attribution required if used publicly: "Maps provided by Data{Meet} Community Maps Project, under CC-BY 2.5 India."

## Parliamentary Constituencies (Lok Sabha) — GOOD, use this one with confidence

File: `parliamentary-constituencies/india_pc_2019.shp` (+ `.geojson` simplified version for web use)

- 543 features — correct national count
- Verified: Telangana is correctly separated from Andhra Pradesh (this was a known error in older versions)
- Includes useful extra fields: `wikidata_qid`, `pc_category` (reservation status), `2019_election_phase`, `2019_election_date`, Hindi name
- This is a 2019-dated file, i.e. current post-2008-delimitation boundaries — no caveats found on spot-check

## Assembly Constituencies (Vidhan Sabha) — USE WITH CAUTION, verify your pilot state

File: `assembly-constituencies/India_AC.shp`

- 4,182 features
- Confirmed on inspection: contains a `STATUS` field, and at least one sampled record (Nagaland) is explicitly marked `"Pre delimitation"` — meaning outdated boundaries for that state
- Telangana is **not** present as a separate state in this file — assembly seats there are still bundled under Andhra Pradesh. If your pilot region is Telangana or Andhra Pradesh, this file will misassign MLAs.
- DataMeet's own documentation flags pre-delimitation boundaries for: Jammu & Kashmir, Jharkhand, Assam, Manipur, Nagaland, Arunachal Pradesh
- An alternate per-state source exists in the same repo (`eci/AC_Data/States/`, scraped from ECI directly, 30 state files, ~4,109 total features) but it uses a different/older schema (no clean state-name field, has legacy `PARTY`/`CODE_NO` fields) and several state files failed to decode with UTF-8 — likely an older, non-standard text encoding. Not clearly better, just differently flawed. Left out of the delivered set for that reason.

## Practical recommendation

**Before committing to a pilot state/city, check it against the flagged list above** (J&K, Jharkhand, Assam, Manipur, Nagaland, Arunachal Pradesh, Telangana, Andhra Pradesh). If your pilot region is outside that list, the AC file should be usable as-is. If it's inside that list, you'll need to source a corrected boundary file for that specific state before launch — worth a targeted search at that point rather than trying to fix all of India's AC data upfront.
