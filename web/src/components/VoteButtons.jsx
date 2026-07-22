"use client";

import { AnimatePresence, motion } from "framer-motion";

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
 * Live counts sit on each button — glanceable without opening a sheet — and
 * animate on change. Once a side is picked it stays live; the opposite side
 * dims and locks. Both lock for the length of the send animation; that beat is
 * announced by the centred banner rather than inline.
 */
export function VoteButtons({
  choice,
  slapCount = 0,
  roseCount = 0,
  onVote,
  isError,
  busy = false,
  buttonsRef,
}) {
  const counts = { slap: slapCount, rose: roseCount };

  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        {OPTIONS.map((option) => {
          const isPicked = choice === option.choice;
          const isLockedOut = Boolean(choice) && !isPicked;
          const isDisabled = isLockedOut || busy;
          const count = counts[option.choice];

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
              className={`flex items-center justify-between gap-3 rounded-control border px-4 py-3.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed ${
                isPicked ? option.picked : option.idle
              }`}
            >
              <span className="flex items-center gap-2.5">
                <span aria-hidden className="text-base leading-none">
                  {option.emoji}
                </span>
                <span className="font-medium">{option.label}</span>
              </span>

              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={count}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
                  className="text-sm font-medium tabular-nums"
                >
                  {Number(count).toLocaleString("en-IN")}
                </motion.span>
              </AnimatePresence>
            </motion.button>
          );
        })}
      </div>

      <p className="mt-3 min-h-4 text-center text-xs" aria-live="polite">
        {isError ? (
          <span className="text-slap">That didn&apos;t save. Try again.</span>
        ) : slapCount === 0 && roseCount === 0 && !choice ? (
          <span className="text-muted">No verdicts yet — be the first.</span>
        ) : null}
      </p>
    </div>
  );
}
