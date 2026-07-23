import axios from "axios";

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000",
  timeout: 15_000,
  headers: { "Content-Type": "application/json" },
});

/**
 * Turns an axios failure into a sentence we're willing to show a user.
 * The FastAPI handlers wrap everything into `{ detail: "..." }`, so we prefer
 * that when present and fall back to the transport-level reason.
 */
export function toFriendlyError(error) {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (error.code === "ECONNABORTED") {
      return "The server took too long to answer. Give it another go?";
    }
    if (!error.response) {
      return "Couldn't reach the server. Is the API running?";
    }
    return `Server responded with ${error.response.status}.`;
  }
  return "Something unexpected went wrong.";
}

/**
 * `POST /get-location` — resolves a GPS point to the MP whose parliamentary
 * constituency contains it. Returns `{ mp }`; `mp` can be null when the point
 * falls outside every stored boundary (or the party has no manifesto row —
 * the handler inner-joins `party_manifesto_points`).
 */
export async function fetchRepresentatives({ latitude, longitude }) {
  const { data } = await api.post("/get-location", { latitude, longitude });
  return data;
}

const LEADERBOARD_PATH = {
  mp: "/get-leaderboard-mp",
  minister: "/get-leaderboard-minister",
};

/**
 * `GET /get-leaderboard-{tier}?limit=&offset=` — rows by slap count and by
 * rose count, one page at a time.
 *
 * The backend filters counts > 0, so an empty response is a genuine "nobody's
 * been voted on yet" signal rather than sparse data. Note `offset` is
 * 1-indexed on this API — `offset=0` is rejected (422) — so the first page
 * must be requested with `offset: 1`, not 0.
 */
export async function fetchLeaderboard(tier, { limit = 10, offset = 1 } = {}) {
  const path = LEADERBOARD_PATH[tier];
  if (!path) throw new Error(`Unknown leaderboard tier: ${tier}`);
  const { data } = await api.get(path, { params: { limit, offset } });
  return {
    slapToppers: Array.isArray(data?.slap_toppers) ? data.slap_toppers : [],
    roseToppers: Array.isArray(data?.rose_toppers) ? data.rose_toppers : [],
  };
}

/**
 * `POST /get-minister` with no name — returns the whole council of ministers.
 *
 * Fetched once so the ministry picker can filter locally: 90 rows is a small
 * payload, and it keeps type-ahead instant with no request per keystroke.
 */
export async function fetchMinisters() {
  const { data } = await api.post("/get-minister", {});
  return Array.isArray(data?.ministers) ? data.ministers : [];
}

/** The UI speaks tier names; the API wants the table name. */
const TABLE_FOR_TIER = { mp: "mps" };
const COLUMN_FOR_CHOICE = { slap: "slap_count", rose: "rose_count" };

/**
 * `PATCH /update-member-count` — increments the slap or rose tally by one.
 *
 * The API identifies the row by (constituency_key, name), so both must be the
 * exact values that came back from `/get-location`.
 */
export async function castVote({ tier, name, constituencyKey, choice }) {
  const { data } = await api.patch("/update-member-count", {
    table_to_update: TABLE_FOR_TIER[tier],
    name_field_to_update: name,
    constituency_key: constituencyKey,
    field_to_update: COLUMN_FOR_CHOICE[choice],
  });
  return data;
}

/**
 * `POST /get-mps-by-name` — the full record for one MP, identified by
 * (name, constituency_key) the same way `castVote` identifies them. Used to
 * open a leaderboard row as a full profile. Returns `{ mp_details }`, `null`
 * when nothing matches.
 */
export async function fetchMpByName({ name, constituencyKey }) {
  const { data } = await api.post("/get-mps-by-name", {
    name,
    constituency_key: constituencyKey,
  });
  return data?.mp_details ?? null;
}

/**
 * `POST /get-ministers-by-name` — the full record for one minister, identified
 * by (name, ministry) — `ministry` must be the row's full original portfolio
 * string, same convention as `castMinistryVote`. Returns `{ minister_details }`,
 * `null` when nothing matches.
 */
export async function fetchMinisterByName({ name, ministry }) {
  const { data } = await api.post("/get-ministers-by-name", { name, ministry });
  return data?.minister_details ?? null;
}

/**
 * `PATCH /update-ministry-count` — the ministers table has its own endpoint.
 *
 * `ministryName` must be the row's full, original `ministry` string (the whole
 * semicolon-joined portfolio), not the single ministry label shown in the UI —
 * the handler matches on it exactly.
 */
export async function castMinistryVote({ name, ministryName, choice }) {
  const { data } = await api.patch("/update-ministry-count", {
    name_field_to_update: name,
    ministry_name: ministryName,
    field_to_update: COLUMN_FOR_CHOICE[choice],
  });
  return data;
}
