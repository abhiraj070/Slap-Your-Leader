import { manifestoPoints } from "@/lib/manifesto";

/**
 * Party manifesto pledges.
 *
 * Titled and attributed to the party on purpose: these points come from
 * `party_manifesto_points`, so every candidate of a given party shows the same
 * text. Presenting them as the individual's promises would misread the data.
 *
 * Renders nothing when there are no points — which is also what happens if the
 * API's manifesto join is ever relaxed to an outer join.
 */
export function ManifestoList({ representative }) {
  const points = manifestoPoints(representative);
  if (points.length === 0) return null;

  const party = representative.party?.trim();

  return (
    <section className="mt-7">
      <div className="flex items-baseline gap-3">
        <h3 className="eyebrow text-ink">Party manifesto</h3>
        <span className="h-px flex-1 bg-rule" />
        {party && <span className="text-[11px] text-muted">{party}</span>}
      </div>

      <ol className="mt-1">
        {points.map((point, index) => (
          <li
            key={point}
            className="flex gap-3.5 border-b border-rule py-2.5 last:border-b-0"
          >
            <span className="text-xs tabular-nums text-faint">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="text-sm leading-relaxed">{point}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
