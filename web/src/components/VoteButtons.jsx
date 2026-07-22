"use client";

import { motion } from "framer-motion";

const OPTIONS = [
  {
    choice: "slap",
    emoji: "👋",
    label: "Slap",
    idle: "border-rule bg-surface text-ink hover:border-slap hover:bg-slap-wash",
    picked: "border-slap bg-slap text-paper",
  },
  {
    choice: "rose",
    emoji: "🌹",
    label: "Rose",
    idle: "border-rule bg-surface text-ink hover:border-laurel hover:bg-laurel-wash",
    picked: "border-laurel bg-laurel text-paper",
  },
];

/**
 * The two verdict controls.
 *
 * Once a side is picked it stays live — you can keep registering the same
 * verdict — while the opposite side dims and locks. Both lock for the length
 * of the send animation; that beat is announced by the centred banner rather
 * than inline, so nothing here shifts.
 */
export function VoteButtons({
  choice,
  casts,
  onVote,
  isError,
  busy = false,
  buttonsRef,
}) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        {OPTIONS.map((option) => {
          const isPicked = choice === option.choice;
          const isLockedOut = Boolean(choice) && !isPicked;
          const isDisabled = isLockedOut || busy;

          return (
            <motion.button
              key={option.choice}
              ref={(element) => {
                if (buttonsRef) buttonsRef.current[option.choice] = element;
              }}
              type="button"
              onClick={() => onVote(option.choice)}
              disabled={isDisabled}
              aria-pressed={isPicked}
              aria-label={`${option.label} this representative`}
              whileTap={isDisabled ? undefined : { y: 1 }}
              animate={{ opacity: isLockedOut ? 0.42 : 1 }}
              transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}
              className={`flex items-center justify-center gap-2.5 rounded-control border px-4 py-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed ${
                isPicked ? option.picked : option.idle
              }`}
            >
              <span aria-hidden className="text-base leading-none">
                {option.emoji}
              </span>
              {option.label}
            </motion.button>
          );
        })}
      </div>

      <p className="mt-3 min-h-4 text-center text-xs" aria-live="polite">
        {isError ? (
          <span className="text-slap">That didn&apos;t save. Try again.</span>
        ) : choice && !busy ? (
          <span className="text-muted">
            Recorded{casts > 1 ? ` ×${casts}` : ""}.
          </span>
        ) : null}
      </p>
    </div>
  );
}
