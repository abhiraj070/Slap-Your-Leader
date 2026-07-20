# Slap Your Leader — Project Brief

## 1. Concept

A no-login web app for public sentiment on local politicians. A user opens a link, shares their location, and sees the MP (Lok Sabha) and MLA (Vidhan Sabha) for their constituency, each shown with a few points from their manifesto/promises. The user gives each leader (or each promise point — see open decision below) a flower (approve) or a slap (disapprove). Votes roll up into a running Pan-India tally. No login, no forms — click and walk away.

## 2. Hard constraints (decided, not up for renegotiation)

- **No authentication.** Login/signup would suppress genuine, low-friction reactions — the whole point is a person can react in one tap and leave.
- **No time/frequency policing beyond the lock.** We are not building session limits or "how often can you vote" logic. The only control on repeat voting is the one-month change lock, enforced via the UUID system below.
- **One flower or one slap per identity per leader, exhausting the option.** To change a vote, the user must wait one month.

## 3. MVP scope (decided)

- **Pilot region first, not Pan-India at launch.** Build and prove the full pipeline for one city/state before expanding coverage. Pick a region with clean, non-overlapping constituency boundaries and reasonably well-documented manifestos online.
- **Manifesto content sourced via scrape + LLM extraction + human review**, not fully manual entry. Raw text is pulled from party manifesto PDFs/sites and news coverage, an LLM extracts 3–5 concrete promise points per leader, and a human reviews before publishing (accuracy/defamation gate).
- **Open decision still needed before build:** does voting happen per individual manifesto point (more informative, richer schema) or once per leader overall (simpler UI and data model)? Decide this before finalizing the votes table schema.

## 4. Data requirements

No single official API provides "MP/MLA by location with photo" — this has to be assembled once and self-hosted, then refreshed on real-world events (not continuously polled).

**Sources to pull from:**
- sansad.in (Digital Sansad) — MP member list/profiles (no formal API; scrape-based)
- PRS Legislative Research (prsindia.org/mptrack, /mlatrack) — CC-BY 4.0 licensed, most reusable structured MP/MLA data
- MyNeta (myneta.info, ADR/National Election Watch data) — candidate background; unofficial API wrapper exists on GitHub (`nini1294/myneta_api`)
- Party manifesto PDFs / news coverage — for manifesto/promise points
- Photos — pulled from the above and self-hosted with attribution (no live photo API exists)

**Constituency boundary data (for location resolution):**
- DataMeet community-created shapefiles for both Lok Sabha (parliamentary) and Vidhan Sabha (assembly) constituency boundaries
- Note: current boundaries are from the 2008 delimitation; a future delimitation could change them, so the pipeline should treat boundary data as a refreshable input, not a hardcoded constant
- Pincode-based lookup is less accurate than lat/long, since pincodes can straddle constituency boundaries — prefer geolocation coordinates with pincode as a fallback only

## 5. Data pipeline (one-time setup + light maintenance)

**Initial build (per pilot region):**
1. Scrape/collect source pages (sansad.in, PRS, MyNeta, manifesto docs, news)
2. LLM pass to extract structured records: leader name, photo, party, constituency, promise points, "region details"
3. Human review pass for accuracy before publishing (defamation/accuracy gate)
4. Load into a database keyed by constituency ID
5. Load constituency boundary shapefiles for the pilot region into the backend

**Ongoing maintenance (event-driven, not scheduled re-crawling):**
- Watch for by-elections, resignations, disqualifications, deaths via news alerts — update the affected constituency record only
- Manifesto points can be flagged for review reactively if users dispute accuracy

## 6. Runtime flow

1. User opens the link; browser requests location permission (pincode entry as fallback if denied)
2. Coordinates sent to backend
3. Backend runs point-in-polygon lookup against boundary data → resolves the specific Lok Sabha and Vidhan Sabha constituency
4. If the resolved constituency is outside current pilot coverage, show a "not available in your area yet" message
5. Backend looks up the pre-built dataset for those constituency IDs → returns MP and MLA records (name, photo, promise points)
6. Backend checks the user's identity cookie (see §7) against the votes table for these leaders → determines if they've already voted and are inside the lock window
7. Frontend renders both leaders side by side with promise points; shows active flower/slap controls, or the user's existing locked choice with a "changeable after [date]" note
8. User taps flower or slap → vote recorded server-side with timestamp
9. Pan-India and local tallies update; user can close the tab — done

## 7. Identity & anti-abuse design ("strict" UUID scheme)

Given no authentication, this is the practical ceiling: tamper-proof enforcement of the UUID contract itself, not true one-vote-per-human guarantee.

- **Server-issued, signed UUID**, not client-generated-and-trusted. On first visit with no valid identity cookie, the server generates a UUID, signs it (HMAC), and sets it as an HttpOnly, Secure, long-lived cookie (1–2 years, refreshed each visit). A tampered/forged cookie fails signature verification and is treated as a new, unrecognized identity.
- **Redundant client storage** (cookie + localStorage) to survive accidental loss of one, reconciled against server records on load — this helps with accidental loss only, not deliberate reset.
- **Database-level uniqueness constraint** on (signed UUID, constituency/leader) in the votes table, so duplicate votes are rejected even if something slips past the frontend.
- **Soft abuse signals, kept separate from identity:** IP-based rate limiting per time window and burst-pattern detection per constituency, used to flag suspicious activity for manual review — not used as an identity key (Indian carrier-grade NAT makes IP unreliable as identity: many unrelated users share an IP, and the same user's IP changes across networks).
- **Explicit limitation to keep in mind going forward:** a motivated user can always reset by clearing storage, using incognito, or switching devices/networks. This system cannot and should not be marketed as election-grade or tamper-proof — it's a directional sentiment gauge.

## 8. Known risks to design around (not blockers, but need explicit handling)

- **Structural anti-abuse ceiling** described above — set user-facing expectations accordingly (e.g., label the tally as indicative, not verified).
- **Legal/defamation exposure** — public negative sentiment tied to named, identifiable politicians can draw legal notices or IT Rules 2021 intermediary-liability scrutiny, especially if the app gets traction. Structured voting on fixed, reviewed promise points (no free-text user comments) keeps this safer than an open commentary feature.
- **Privacy (DPDP Act 2023) considerations** — even without login, linking a persistent identifier + IP to political opinion is sensitive. Hash/truncate IPs before storage, minimize retention, and have a short privacy notice.
- **Content ops workload** scales with geographic coverage — full Pan-India manifesto curation is a phase-two+ effort, not part of MVP.

## 9. Suggested build order

1. Pilot region selection + constituency boundary data ingestion
2. Data pipeline: scrape → LLM extract → human review → populate leader/constituency database
3. Location resolution service (geolocation/pincode → point-in-polygon → constituency ID → leader lookup)
4. Identity/vote backend: signed UUID issuance, votes table with uniqueness constraint, one-month lock logic
5. Frontend: location prompt → leader display with promise points → flower/slap interaction → confirmation
6. Soft abuse-detection layer (IP rate limiting, burst flagging) — can follow after core loop works
7. Decide and implement voting granularity (per-point vs per-leader) before finalizing step 4's schema
