"use client";

import { motion } from "framer-motion";
import { useRef } from "react";
import { Info, Share2, Trophy } from "lucide-react";

import { VoteAnnouncement } from "./vote/VoteAnnouncement";
import { VoteFlight } from "./vote/VoteFlight";
import { VotePortrait } from "./vote/VotePortrait";
import { VoteButtons } from "./VoteButtons";
import { useVote } from "@/hooks/useVote";
import { useVoteChoreography } from "@/hooks/useVoteChoreography";

const DESIGNATION = {
  mp: "Your MP",
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
  onOpenLeaderboard,
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

  const designation =
    subject.tier === "minister"
      ? typeof DESIGNATION.minister === "function"
        ? DESIGNATION.minister(subject)
        : DESIGNATION.minister
      : DESIGNATION[subject.tier];

  return (
    <motion.article
      key={keySeed}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.32, delay: 0.08, ease: [0.2, 0, 0, 1] }}
      ref={stageRef}
      className="relative overflow-visible rounded-card border border-rule bg-surface p-6 shadow-lift transition-shadow duration-300 sm:p-8"
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

        <p className="eyebrow mt-6">{designation}</p>

        <h2 className="mt-2 font-serif text-3xl leading-tight text-balance text-ink sm:text-4xl">
          {subject.name}
        </h2>

        <p className="mt-2 text-sm text-muted">
          Your take on them, in two taps.
        </p>
      </div>

      <div className="mx-auto mt-8 max-w-md">
        {onOpenLeaderboard && (
          <div className="mb-4 flex justify-center">
            <motion.button
              type="button"
              onClick={onOpenLeaderboard}
              whileHover={{ y: -1 }}
              whileTap={{ y: 1 }}
              transition={{ duration: 0.15, ease: [0.2, 0, 0, 1] }}
              className="inline-flex items-center gap-1.5 rounded-full border border-rule bg-paper/70 px-3.5 py-1.5 text-xs font-medium tracking-[0.05em] text-ink uppercase transition-colors hover:border-ink hover:text-slap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <Trophy className="size-3.5" strokeWidth={2} />
              Leaderboard
            </motion.button>
          </div>
        )}
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
      className={`relative ${dimensions} flex shrink-0 items-center justify-center rounded-full border shadow-card transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
        highlight
          ? "border-slap bg-slap text-paper"
          : "border-rule bg-surface text-ink hover:border-ink hover:text-slap"
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
