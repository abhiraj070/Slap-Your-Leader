/**
 * Pulls the party manifesto points off a representative.
 *
 * `/get-location` returns them as `points` (from `party_manifesto_points`);
 * `/get-minister` uses `manifesto_points`. Accept either, and always return an
 * array so callers can branch on length rather than null-checking.
 *
 * These are party-level pledges shared by every candidate of that party — the
 * UI must attribute them to the party, never to the individual.
 */
export function manifestoPoints(representative) {
  const raw = representative?.points ?? representative?.manifesto_points;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((point) => (typeof point === "string" ? point.trim() : ""))
    .filter(Boolean);
}
