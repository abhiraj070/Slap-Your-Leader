"use client";

import { AnimatePresence, motion } from "framer-motion";

import { Portrait } from "../ui/Portrait";
import { IMPACT_MS, IMPACT_X, IMPACT_Y } from "@/hooks/useVoteChoreography";

/**
 * The portrait, wrapped so it can swell, recoil, and carry impact effects.
 *
 * `Portrait` itself stays untouched and single-purpose; everything transient
 * lives here and clips to the same rounded rect. Transform-only animation keeps
 * this on the compositor.
 */
export function VotePortrait({
  src,
  name,
  className = "",
  portraitRef,
  controls,
  showSlapMark,
  showBloom,
  direction = 1,
}) {
  return (
    <motion.div
      ref={portraitRef}
      animate={controls}
      style={{ transformOrigin: "50% 40%", willChange: "transform" }}
      className={`relative shrink-0 ${className}`}
    >
      <Portrait src={src} name={name} className="w-full" />

      {/* Effects are clipped to the portrait so nothing bleeds over the text. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-photo">
        <AnimatePresence>
          {showSlapMark && <SlapImpact key="mark" direction={direction} />}
        </AnimatePresence>
        <AnimatePresence>{showBloom && <Bloom key="bloom" />}</AnimatePresence>
      </div>
    </motion.div>
  );
}

/**
 * Lands on the cheek that was actually struck: travelling left-to-right means
 * the blow arrives on the viewer's left. A quick white flash sells the contact,
 * a ring carries the force outward, and the flush lingers and fades.
 *
 * Centred (via `x`/`y` percentage transforms rather than the box's own
 * top/left corner) on `IMPACT_X`/`IMPACT_Y` — the exact point
 * `useVoteChoreography`'s `measure()` throws the hand at, so the thrown hand
 * and the mark it leaves can never drift apart again.
 */
function SlapImpact({ direction }) {
  const side = {
    [direction === 1 ? "left" : "right"]: `${
      (direction === 1 ? IMPACT_X : 1 - IMPACT_X) * 100
    }%`,
    top: `${IMPACT_Y * 100}%`,
  };
  const recenter = { x: "-50%", y: "-50%" };

  return (
    <>
      <motion.span
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.5, 0] }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.16, ease: "easeOut" }}
        className="absolute inset-0 bg-white"
      />

      <motion.span
        aria-hidden
        style={side}
        initial={{ opacity: 0, scale: 0.2, ...recenter }}
        animate={{ opacity: [0, 0.7, 0], scale: [0.2, 1.6, 2.2], ...recenter }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.42, ease: "easeOut" }}
        className="absolute size-[34%] rounded-full border-2 border-slap"
      />

      <motion.span
        aria-hidden
        style={side}
        initial={{ opacity: 0, scale: 0.5, ...recenter }}
        animate={{
          opacity: [0, 0.62, 0.5, 0],
          scale: [0.5, 1.05, 1.15, 1.25],
          ...recenter,
        }}
        exit={{ opacity: 0 }}
        transition={{ duration: (IMPACT_MS + 260) / 1000, ease: "easeOut" }}
        className="absolute size-[42%] rounded-full bg-slap blur-[10px]"
      />
    </>
  );
}

const PETALS = [
  { x: -28, y: -36, r: -28, d: 0 },
  { x: 24, y: -42, r: 24, d: 0.05 },
  { x: -36, y: -8, r: -14, d: 0.1 },
  { x: 32, y: -4, r: 18, d: 0.07 },
  { x: -12, y: -50, r: 8, d: 0.13 },
  { x: 14, y: -22, r: -20, d: 0.16 },
];

/** Petals lift, then fall — appreciation, not confetti. */
function Bloom() {
  return (
    <>
      <motion.span
        aria-hidden
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: [0, 0.45, 0], scale: [0.5, 1.3, 1.6] }}
        exit={{ opacity: 0 }}
        transition={{ duration: (IMPACT_MS + 300) / 1000, ease: "easeOut" }}
        className="absolute top-1/2 left-1/2 size-[70%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-laurel"
      />

      {PETALS.map((petal, index) => (
        <motion.span
          key={index}
          aria-hidden
          initial={{ opacity: 0, x: 0, y: 0, scale: 0.4, rotate: 0 }}
          animate={{
            opacity: [0, 1, 0.9, 0],
            x: [0, petal.x * 0.7, petal.x],
            // Up on the burst, then gravity takes them down.
            y: [0, petal.y, petal.y + 46],
            scale: [0.4, 1, 0.8],
            rotate: [0, petal.r, petal.r * 2],
          }}
          exit={{ opacity: 0 }}
          transition={{
            duration: (IMPACT_MS + 420) / 1000,
            delay: petal.d,
            ease: [0.25, 0.6, 0.4, 1],
          }}
          className="absolute top-1/2 left-1/2 size-2 rounded-tl-full rounded-br-full bg-laurel"
        />
      ))}
    </>
  );
}
