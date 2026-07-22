"use client";

import { useState } from "react";

import { MinisterCard } from "./MinisterCard";
import { MinistryCombobox } from "./MinistryCombobox";
import { useMinistries } from "@/hooks/useMinistries";
import { toFriendlyError } from "@/lib/api";

/**
 * The third section: pick any ministry in the union council.
 *
 * Unlike the MLA and MP cards this isn't tied to where you're standing, so it
 * says so — otherwise a third card under two location-derived ones reads as if
 * it were also your local representative.
 */
/**
 * A few well-known Cabinet portfolios to start from, so the empty state shows
 * what's actually in here rather than an empty box. Falls back to whatever
 * Cabinet entries exist if the roster is reshuffled.
 */
const SUGGESTED = [
  "defence",
  "finance",
  "home affairs",
  "railways",
  "education",
  "external affairs",
];

function suggestionsFrom(entries) {
  const cabinet = entries.filter((entry) => entry.rank === "Cabinet Minister");
  const picked = SUGGESTED.map((wanted) =>
    cabinet.find((entry) => entry.label.toLowerCase() === wanted),
  ).filter(Boolean);

  return picked.length >= 4 ? picked : cabinet.slice(0, 6);
}

export function MinisterSection() {
  const [selected, setSelected] = useState(null);
  const { entries, ministryCount, isPending, isError, error } = useMinistries();

  return (
    <section className="rounded-card border border-rule bg-surface p-5 shadow-card sm:p-7">
      <p className="eyebrow text-ink">Union council of ministers</p>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">
        Your MLA and MP are decided by where you stand. These aren&apos;t —
        {ministryCount > 0 ? ` pick any of the ${ministryCount} ministries.` : " pick any ministry."}
      </p>

      <div className="mt-4">
        {isPending && (
          <div className="rounded-control border border-rule px-3.5 py-2.5 text-sm text-muted">
            Loading the council…
          </div>
        )}

        {isError && (
          <div
            role="alert"
            className="rounded-control border border-rule px-3.5 py-2.5 text-sm text-slap"
          >
            {toFriendlyError(error)}
          </div>
        )}

        {!isPending && !isError && (
          <MinistryCombobox
            entries={entries}
            selected={selected}
            onSelect={setSelected}
            onClear={() => setSelected(null)}
          />
        )}
      </div>

      {selected ? (
        // Keyed by the entry so switching ministry remounts the card, resetting
        // its optimistic vote count and photo-error state.
        <MinisterCard key={selected.id} entry={selected} />
      ) : (
        !isPending &&
        !isError && (
          <div className="mt-6 border-t border-rule pt-6">
            <p className="text-sm text-muted">
              Choose a ministry above, or start with one of these.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {suggestionsFrom(entries).map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setSelected(entry)}
                  className="rounded-control border border-rule px-3 py-1.5 text-sm text-ink transition-colors hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                >
                  {entry.label}
                </button>
              ))}
            </div>
          </div>
        )
      )}
    </section>
  );
}
