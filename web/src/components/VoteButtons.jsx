"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";

/**
 * Ceramic, soft-touch treatment: a shallow matte gradient (a tint-to-shade of
 * the app's own slap/laurel accent, not a glossy sphere), a barely-there
 * inset rim-light standing in for a specular highlight, and the app's own
 * ambient shadow recipe (`--shadow-card` / `--shadow-lift`) softened further —
 * so the circles read as part of the card's surface rather than a 3D object
 * dropped on top of it. The picked side gets a soft colour-tinted aura behind
 * it instead of a hard ring, so there's no dark outer edge at any point.
 */
const OPTIONS = [
  {
    choice: "slap",
    emoji: "👋",
    label: "Slap",
    gradient: "bg-[linear-gradient(155deg,#e98a62_0%,#c05427_100%)]",
    auraRgb: "226 99 46",
  },
  {
    choice: "rose",
    emoji: "🌹",
    label: "Rose",
    gradient: "bg-[linear-gradient(155deg,#639077_0%,#285b3f_100%)]",
    auraRgb: "47 107 74",
  },
];

const REST_SHADOW =
  "shadow-[0_1px_2px_rgba(64,44,20,0.05),0_6px_16px_-8px_rgba(64,44,20,0.10),inset_0_1px_1.5px_rgba(255,255,255,0.4),inset_0_-3px_5px_rgba(0,0,0,0.08)]";
const HOVER_SHADOW =
  "hover:shadow-[0_3px_8px_rgba(64,44,20,0.06),0_22px_38px_-18px_rgba(64,44,20,0.14),inset_0_1px_1.5px_rgba(255,255,255,0.45),inset_0_-3px_5px_rgba(0,0,0,0.06)]";

/**
 * The two verdict controls — large icon-only circles, the app's primary
 * action. Counts sit below each circle rather than inside it, so the glyph
 * stays the whole focus of the button.
 *
 * Once a side is picked it stays live; the opposite side dims and locks.
 * Both lock for the length of the send animation; that beat is announced by
 * the centred banner rather than inline.
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
      <div className="flex items-start justify-center gap-10 sm:gap-14">
        {OPTIONS.map((option) => {
          const isPicked = choice === option.choice;
          const isLockedOut = Boolean(choice) && !isPicked;
          const isDisabled = isLockedOut || busy;
          const count = counts[option.choice];

          return (
            <div
              key={option.choice}
              className="flex flex-col items-center gap-2.5"
            >
              <VoteButton
                option={option}
                isPicked={isPicked}
                isLockedOut={isLockedOut}
                isDisabled={isDisabled}
                onVote={onVote}
                buttonsRef={buttonsRef}
              />

              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={count}
                  initial={{ opacity: 0, y: -8, scale: 0.85 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.85 }}
                  transition={{ type: "spring", stiffness: 500, damping: 26 }}
                  className="text-base font-semibold tabular-nums text-ink"
                >
                  {Number(count).toLocaleString("en-IN")}
                </motion.span>
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      <p className="mt-4 min-h-4 text-center text-xs" aria-live="polite">
        {isError ? (
          <span className="text-slap">That didn&apos;t save. Try again.</span>
        ) : slapCount === 0 && roseCount === 0 && !choice ? (
          <span className="text-muted">No verdicts yet — be the first.</span>
        ) : null}
      </p>
    </div>
  );
}

/**
 * One circle, with its own ripple state — each tap spawns a short-lived
 * ripple that expands and fades, clipped to the circle by `overflow-hidden`.
 * Kept local to the button rather than lifted to `VoteButtons` since neither
 * side needs to know about the other's ripples.
 */
function VoteButton({ option, isPicked, isLockedOut, isDisabled, onVote, buttonsRef }) {
  const [ripples, setRipples] = useState([]);

  const handleClick = () => {
    setRipples((prev) => [...prev, Date.now() + Math.random()]);
    onVote(option.choice);
  };

  return (
    <div className="relative">
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-[-6px] rounded-full blur-md"
        style={{ backgroundColor: `rgb(${option.auraRgb})` }}
        animate={{ opacity: isPicked ? 0.22 : 0 }}
        transition={{ duration: 0.35, ease: [0.2, 0, 0, 1] }}
      />

      <motion.button
        ref={(element) => {
          if (buttonsRef) buttonsRef.current[option.choice] = element;
        }}
        type="button"
        onClick={handleClick}
        disabled={isDisabled}
        aria-pressed={isPicked}
        aria-label={`${option.label} this representative`}
        whileHover={
          isDisabled
            ? undefined
            : {
                y: -3,
                scale: 1.02,
                transition: { type: "spring", stiffness: 320, damping: 18 },
              }
        }
        whileTap={
          isDisabled
            ? undefined
            : {
                y: 0,
                scale: 0.94,
                transition: { type: "spring", stiffness: 500, damping: 24 },
              }
        }
        animate={{ opacity: isLockedOut ? 0.4 : 1 }}
        transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
        className={`relative flex size-24 items-center justify-center overflow-hidden rounded-full text-4xl text-white transition-shadow duration-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink disabled:cursor-not-allowed sm:size-28 sm:text-5xl ${option.gradient} ${REST_SHADOW} ${HOVER_SHADOW}`}
      >
        <AnimatePresence>
          {ripples.map((id) => (
            <motion.span
              key={id}
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-full bg-white/35"
              initial={{ scale: 0.3, opacity: 0.4 }}
              animate={{ scale: 1.6, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: [0.2, 0, 0, 1] }}
              onAnimationComplete={() =>
                setRipples((prev) => prev.filter((r) => r !== id))
              }
            />
          ))}
        </AnimatePresence>
        <span aria-hidden className="relative">
          {option.emoji}
        </span>
      </motion.button>
    </div>
  );
}
