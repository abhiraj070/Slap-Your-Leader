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

/**
 * One minister, reached through the ministry picker.
 *
 * Same anatomy as RepresentativeCard, but the ministers table carries no
 * constituency, education or criminal-case columns — the particulars here are
 * the portfolio and the rank instead.
 */
export function MinisterCard({ entry }) {
  const { minister } = entry;
  const { choice, casts, vote, isError } = useVote("minister", minister);
  // The card owns the DOM refs the flight path is measured from.
  const stageRef = useRef(null);
  const portraitRef = useRef(null);
  const buttonsRef = useRef({});
  const choreo = useVoteChoreography({ stageRef, portraitRef, buttonsRef });

  const party = minister.party?.trim() || null;
  const slaps = (minister.slap_count ?? 0) + (choice === "slap" ? casts : 0);
  const roses = (minister.rose_count ?? 0) + (choice === "rose" ? casts : 0);

  // A row can hold several ministries; show the others so the card doesn't
  // imply this person only runs the one that was searched for.
  const alsoHolds = entry.ministry
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part && part !== entry.portfolio && !/^all\b|^and$/i.test(part));

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.2, 0, 0, 1] }}
      className="relative mt-6"
      ref={stageRef}
    >
      <div className="flex items-start gap-4 sm:gap-6">
        <VotePortrait
          src={minister.photo_url}
          name={minister.minister_name}
          className="w-21 sm:w-33"
          portraitRef={portraitRef}
          controls={choreo.portraitControls}
          showSlapMark={choreo.showSlapMark}
          showBloom={choreo.showBloom}
          direction={choreo.impactDirection}
        />

        <div className="min-w-0 flex-1">
          <p className="eyebrow">{entry.rank}</p>
          <h3 className="mt-1.5 font-serif text-2xl leading-tight text-balance sm:text-3xl">
            {minister.minister_name}
          </h3>
          {party && <p className="mt-1.5 text-sm text-muted">{party}</p>}

          <dl className="mt-4 hidden border-t border-rule sm:block">
            <Fact term="Portfolio">{entry.portfolio}</Fact>
            <Fact term="Also holds" last>
              {alsoHolds.length > 0 ? alsoHolds.join(" · ") : "No other portfolio"}
            </Fact>
          </dl>
        </div>
      </div>

      <dl className="mt-4 border-t border-rule sm:hidden">
        <Fact term="Portfolio">{entry.portfolio}</Fact>
        <Fact term="Also holds" last>
          {alsoHolds.length > 0 ? alsoHolds.join(" · ") : "No other portfolio"}
        </Fact>
      </dl>

      <ManifestoList representative={minister} />

      <div className="mt-6 border-t border-rule pt-5">
        <p className="mb-3 text-xs tabular-nums text-muted">
          {slaps.toLocaleString("en-IN")} slaps ·{" "}
          {roses.toLocaleString("en-IN")} roses
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
    <div className={`flex gap-4 py-2.5 ${last ? "" : "border-b border-rule"}`}>
      <dt className="eyebrow w-30 shrink-0 pt-0.5">{term}</dt>
      <dd className="min-w-0 flex-1 text-sm">{children}</dd>
    </div>
  );
}
