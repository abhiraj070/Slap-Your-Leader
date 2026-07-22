"use client";

import { motion } from "framer-motion";
import { useRef } from "react";

import { ManifestoList } from "./ManifestoList";
import { VoteAnnouncement } from "./vote/VoteAnnouncement";
import { VoteFlight } from "./vote/VoteFlight";
import { VotePortrait } from "./vote/VotePortrait";
import { VoteButtons } from "./VoteButtons";
import { useVote } from "@/hooks/useVote";
import { useVoteChoreography } from "@/hooks/useVoteChoreography";

const TIER_COPY = {
  mla: { office: "Member of Legislative Assembly" },
  mp: { office: "Member of Parliament" },
};

/** Scraper coverage is partial, so every field can come back null. */
function orNull(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

/**
 * Full record for one representative: portrait beside the particulars, the
 * party's manifesto below, then the verdict controls.
 */
export function RepresentativeCard({ tier, representative }) {
  const { choice, casts, vote, isError } = useVote(tier, representative);
  // The card owns the DOM refs the flight path is measured from.
  const stageRef = useRef(null);
  const portraitRef = useRef(null);
  const buttonsRef = useRef({});
  const choreo = useVoteChoreography({ stageRef, portraitRef, buttonsRef });

  const constituency = orNull(representative.constituency);
  const education = orNull(representative.education);
  const party = orNull(representative.party);
  const cases = representative.criminal_cases;

  const slaps = (representative.slap_count ?? 0) + (choice === "slap" ? casts : 0);
  const roses = (representative.rose_count ?? 0) + (choice === "rose" ? casts : 0);

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.2, 0, 0, 1] }}
      className="relative rounded-card border border-rule bg-surface p-5 shadow-card sm:p-7"
      ref={stageRef}
    >
      {/* ---- Identity ---- */}
      <div className="flex items-start gap-4 sm:gap-6">
        <VotePortrait
          src={representative.photo_url}
          name={representative.name}
          className="w-21 sm:w-33"
          portraitRef={portraitRef}
          controls={choreo.portraitControls}
          showSlapMark={choreo.showSlapMark}
          showBloom={choreo.showBloom}
          direction={choreo.impactDirection}
        />

        <div className="min-w-0 flex-1">
          <p className="eyebrow">{TIER_COPY[tier].office}</p>
          <h2 className="mt-1.5 font-serif text-2xl leading-tight text-balance sm:text-3xl">
            {representative.name}
          </h2>
          {party && <p className="mt-1.5 text-sm text-muted">{party}</p>}

          {/* Particulars sit beside the portrait only when there's room for
              two columns; below `sm` they'd be squeezed to a few words a line. */}
          <dl className="mt-4 hidden border-t border-rule sm:block">
            <Fact term="Constituency">{constituency ?? "Not on record"}</Fact>
            <Fact term="Education">{education ?? "Not on record"}</Fact>
            <Fact term="Criminal cases" last>
              <CriminalCases value={cases} />
            </Fact>
          </dl>
        </div>
      </div>

      <dl className="mt-4 border-t border-rule sm:hidden">
        <Fact term="Constituency">{constituency ?? "Not on record"}</Fact>
        <Fact term="Education">{education ?? "Not on record"}</Fact>
        <Fact term="Criminal cases" last>
          <CriminalCases value={cases} />
        </Fact>
      </dl>

      <ManifestoList representative={representative} />

      {/* ---- Verdict ---- */}
      <div className="mt-6 border-t border-rule pt-5">
        <p className="mb-3 text-xs tabular-nums text-muted">
          {slaps.toLocaleString("en-IN")} slaps · {roses.toLocaleString("en-IN")}{" "}
          roses
        </p>
        <VoteButtons
          choice={choice}
          casts={casts}
          onVote={(next) => choreo.play(next, () => vote(next))}
          isError={isError}
          busy={choreo.isBusy}
          buttonsRef={buttonsRef}
        />
      </div>

      <VoteFlight flight={choreo.flight} />
      <VoteAnnouncement message={choreo.message} />
    </motion.article>
  );
}

function Fact({ term, children, last = false }) {
  return (
    <div
      className={`flex gap-4 py-2.5 ${last ? "" : "border-b border-rule"}`}
    >
      <dt className="eyebrow w-30 shrink-0 pt-0.5">{term}</dt>
      <dd className="min-w-0 flex-1 text-sm">{children}</dd>
    </div>
  );
}

/** A colour shift rather than an alarm badge — the number speaks for itself. */
function CriminalCases({ value }) {
  if (value === null || value === undefined) return "Not on record";
  if (value === 0) return "None declared";
  return <span className="text-slap">{value} declared</span>;
}
