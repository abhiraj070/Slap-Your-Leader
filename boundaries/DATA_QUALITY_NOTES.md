# Boundary Data — Source & Quality Notes

## UPDATE (2026-07-22): both layers replaced — see `eci-2026/`

The two shapefile sources below are **superseded** and kept only for reference.
The live DB now uses `eci-2026/`:

- `eci-2026/assembly_constituencies_eci2026.geojson` — 4,122 ACs, "Release 2026 by ECI"
  via Esri India Living Atlas (`livingatlas.esri.in`, service
  `Legislative_Assembly_Boundaries_2022/MapServer/0`, item modified 2026-04).
  Post-delimitation everywhere: J&K 90 (2022 order), Assam 126 (2023 order),
  Jharkhand 81, Telangana split from AP, Manipur 60. Sikkim's non-territorial
  Sangha seat has no polygon (31 mapped + 1 seat). Code-0 / "Data Not Available"
  filler features and non-assembly UTs were dropped before load.
- `eci-2026/parliamentary_constituencies_2024.geojson` — 543 PCs via the same
  server (`IAB2024/IN_Parliamentary_2024/MapServer/0`). Post-2022 J&K PCs
  (incl. Anantnag-Rajouri). Assam's 5 renamed PCs were stored under their
  post-2023 names (Sonitpur, Darrang-Udalguri, Kaziranga, Nagaon, Diphu) —
  note their polygons are the pre-2023 footprints, the closest public GIS
  data available; boundary-adjacent precision in Assam is approximate.

Old tables are retained in the DB as `assembly_constituencies_old` /
`parliamentary_constituencies_old` backups.

---

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
