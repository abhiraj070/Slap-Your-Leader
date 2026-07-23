"use client";

import { motion } from "framer-motion";
import { useRef } from "react";
import { Info, Share2 } from "lucide-react";

import { VoteAnnouncement } from "./vote/VoteAnnouncement";
import { VoteFlight } from "./vote/VoteFlight";
import { VotePortrait } from "./vote/VotePortrait";
import { VoteButtons } from "./VoteButtons";
import { useVote } from "@/hooks/useVote";
import { useVoteChoreography } from "@/hooks/useVoteChoreography";

const ROLE_LABEL = {
  // Only the home MP (resolved from the user's own location) is "yours" —
  // one tapped in from the leaderboard is someone else's, so it falls back
  // to the plain title rather than misrepresenting whose seat it is.
  mp: (subject) => (subject?.isHome ? "Your MP" : "Member of Parliament"),
  minister: (subject) => subject?.rank_title || "Union Minister",
};

/**
 * The slim representative card: portrait, name, designation, and the vote
 * controls. All other information lives behind the Information bottom sheet.
 */
export function RepresentativeCard({
  subject,
  keySeed,
  onOpenInfo,
  onShare,
  onFirstVote,
}) {
  const stageRef = useRef(null);
  const portraitRef = useRef(null);
  const buttonsRef = useRef({});

  const { choice, casts, vote, isError } = useVote(subject.tier, subject);
  const choreo = useVoteChoreography({ stageRef, portraitRef, buttonsRef });

  const slaps = (subject.slap_count ?? 0) + (choice === "slap" ? casts : 0);
  const roses = (subject.rose_count ?? 0) + (choice === "rose" ? casts : 0);

  const role = ROLE_LABEL[subject.tier]?.(subject);

  return (
    <motion.article
      key={keySeed}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.32, delay: 0.08, ease: [0.2, 0, 0, 1] }}
      ref={stageRef}
      className="relative overflow-visible rounded-card bg-surface p-7 shadow-lift transition-shadow duration-300 sm:p-10"
    >
      {onOpenInfo && (
        <div className="absolute top-4 left-4 sm:top-5 sm:left-5">
          <IconAction label="Information" onClick={onOpenInfo} icon={Info} />
        </div>
      )}
      {onShare && (
        <div className="absolute top-4 right-4 sm:top-5 sm:right-5">
          <IconAction
            label="Share"
            onClick={onShare}
            icon={Share2}
            highlight={Boolean(choice)}
          />
        </div>
      )}

      <div className="flex flex-col items-center text-center">
        <motion.div whileHover={{ scale: 1.03 }} transition={{ duration: 0.24, ease: [0.2, 0, 0, 1] }}>
          <VotePortrait
            src={subject.photo_url}
            name={subject.name}
            className="w-36 sm:w-44"
            portraitRef={portraitRef}
            controls={choreo.portraitControls}
            showSlapMark={choreo.showSlapMark}
            showBloom={choreo.showBloom}
            direction={choreo.impactDirection}
          />
        </motion.div>

        <p className="eyebrow mt-6">{role}</p>

        <h2 className="mt-2 font-serif text-3xl leading-tight text-balance text-ink sm:text-4xl">
          {subject.name}
        </h2>

        {subject.designation && (
          <p className="mt-2 text-base font-medium text-ink/80 text-balance">
            {subject.designation}
          </p>
        )}
      </div>

      <div className="mx-auto mt-9 max-w-md">
        <VoteButtons
          choice={choice}
          slapCount={slaps}
          roseCount={roses}
          onVote={(next) =>
            choreo.play(next, () => {
              vote(next);
              onFirstVote?.(next);
            })
          }
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

/**
 * Circular icon button — consistent size, hover, and press for anything that
 * needs to sit in a card corner or a floating context.
 *
 * `highlight` turns it into the reward beat for whatever just happened (the
 * Share button once a vote lands): filled accent + a soft looping pulse ring,
 * echoing the ring already used elsewhere (Ornament) rather than introducing
 * a new motion pattern.
 */
export function IconAction({
  label,
  onClick,
  icon: Icon,
  size = "md",
  highlight = false,
}) {
  const dimensions = size === "lg" ? "size-14" : "size-10";
  const iconSize = size === "lg" ? "size-6" : "size-4";

  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label={label}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.94 }}
      transition={{ type: "spring", stiffness: 420, damping: 22 }}
      className={`relative ${dimensions} flex shrink-0 items-center justify-center rounded-full shadow-card transition-shadow hover:shadow-lift focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
        highlight ? "bg-slap text-paper" : "bg-surface text-ink hover:text-slap"
      }`}
    >
      {highlight && (
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-full border border-slap"
          animate={{ scale: [1, 1.35, 1], opacity: [0.6, 0, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
        />
      )}
      <Icon className={iconSize} strokeWidth={2} />
    </motion.button>
  );
}
