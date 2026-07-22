"use client";

import { CheckCircle2, ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";

import { BottomSheet } from "./BottomSheet";
import { manifestoPoints } from "@/lib/manifesto";

function orNull(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function titleCase(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/(?:^|[\s-])\S/g, (character) => character.toUpperCase());
}

const INITIAL_POINTS = 3;

/**
 * The Information bottom sheet — everything about the current representative
 * that isn't identity: party, seat particulars, criminal cases, manifesto.
 */
export function InfoSheet({ open, onClose, subject }) {
  const [showAll, setShowAll] = useState(false);

  if (!subject) return null;

  const isMinister = subject.tier === "minister";
  const name = subject.name;
  const party = orNull(subject.party);
  const points = manifestoPoints(subject);
  const visiblePoints = showAll ? points : points.slice(0, INITIAL_POINTS);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Information"
      subtitle={name}
    >
      <dl className="border-t border-rule">
        {party && <Fact term="Party" value={party} />}

        {isMinister ? (
          <>
            {subject.portfolio && (
              <Fact term="Portfolio" value={subject.portfolio} />
            )}
            {subject.rank_title && (
              <Fact term="Rank" value={subject.rank_title} />
            )}
          </>
        ) : (
          <>
            <Fact
              term="Constituency"
              value={titleCase(subject.constituency) || "Not on record"}
            />
            <Fact term="Education" value={orNull(subject.education) || "Not on record"} />
            <Fact
              term="Criminal cases"
              value={<CriminalCases value={subject.criminal_cases} />}
              last
            />
          </>
        )}
      </dl>

      {points.length > 0 && (
        <section className="mt-8">
          <div className="flex items-baseline gap-3">
            <h3 className="eyebrow text-ink">
              {isMinister ? "Minister's commitments" : "Party manifesto"}
            </h3>
            <span className="h-px flex-1 bg-rule" />
            {party && <span className="text-[11px] text-muted">{party}</span>}
          </div>

          <ul className="mt-3 space-y-2.5">
            <AnimatePresence initial={false}>
              {visiblePoints.map((point) => (
                <motion.li
                  key={point}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
                  className="flex items-start gap-3 rounded-card border border-rule bg-paper/60 px-4 py-3"
                >
                  <CheckCircle2
                    className="mt-0.5 size-4 shrink-0 text-laurel"
                    strokeWidth={2}
                  />
                  <span className="text-sm leading-relaxed text-ink">
                    {point}
                  </span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>

          {points.length > INITIAL_POINTS && (
            <button
              type="button"
              onClick={() => setShowAll((prev) => !prev)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-control text-xs font-medium tracking-[0.05em] text-ink uppercase transition-colors hover:text-slap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              {showAll
                ? "Show less"
                : `Show ${points.length - INITIAL_POINTS} more`}
              <motion.span
                animate={{ rotate: showAll ? 180 : 0 }}
                transition={{ duration: 0.18 }}
                className="inline-flex"
              >
                <ChevronDown className="size-3.5" strokeWidth={2.5} />
              </motion.span>
            </button>
          )}
        </section>
      )}
    </BottomSheet>
  );
}

function Fact({ term, value, last = false }) {
  return (
    <div
      className={`flex items-start gap-4 py-3.5 ${last ? "" : "border-b border-rule"}`}
    >
      <dt className="eyebrow w-32 shrink-0 pt-0.5">{term}</dt>
      <dd className="min-w-0 flex-1 text-sm text-ink">{value}</dd>
    </div>
  );
}

function CriminalCases({ value }) {
  if (value === null || value === undefined) return "Not on record";
  if (value === 0) return "None declared";
  return <span className="text-slap">{value} declared</span>;
}
