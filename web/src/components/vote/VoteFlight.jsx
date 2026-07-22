"use client";

import { AnimatePresence, motion } from "framer-motion";

import { FLIGHT_MS } from "@/hooks/useVoteChoreography";

const GLYPH = { slap: "👋", rose: "🌹" };

/**
 * The projectile: it leaves the button that was pressed and arcs to the face.
 *
 * Sold as physical rather than as a sliding sticker:
 *  - it winds back before launching, so the throw has an anticipation beat
 *  - it grows from 0.4 to ~1.8 on approach, reading as travel toward the viewer
 *  - three lagging ghosts blur into a motion trail
 *  - the hand cocks then snaps through; the rose tumbles end over end
 *
 * The path is measured at launch, so it lands correctly at any breakpoint, and
 * only transform/opacity animate — all compositor work.
 */
const TRAIL = [
  { delay: 0.1, opacity: 0.18, blur: "blur-[3px]" },
  { delay: 0.055, opacity: 0.32, blur: "blur-[2px]" },
  { delay: 0, opacity: 1, blur: "" },
];

export function VoteFlight({ flight }) {
  return (
    <AnimatePresence>
      {flight && (
        <div
          key={`${flight.choice}-${flight.from.x}-${flight.from.y}`}
          aria-hidden
          className="pointer-events-none absolute inset-0 z-20 overflow-visible"
        >
          {TRAIL.map((ghost) => (
            <Projectile key={ghost.delay} flight={flight} ghost={ghost} />
          ))}
        </div>
      )}
    </AnimatePresence>
  );
}

function Projectile({ flight, ghost }) {
  const dx = flight.to.x - flight.from.x;
  const dy = flight.to.y - flight.from.y;
  const isSlap = flight.choice === "slap";

  return (
    <motion.span
      initial={{ x: 0, y: 0, scale: 0.4, opacity: 0, rotate: isSlap ? 55 : 0 }}
      animate={{
        // Winds back (the small negative step) before arcing over to the face.
        x: [0, dx * -0.08, dx * 0.45, dx],
        y: [0, dy * -0.05 + 8, dy * 0.45 - 62, dy],
        // Grows on approach, then a squash as it lands.
        scale: [0.4, 0.7, 1.35, 1.8],
        opacity: [0, ghost.opacity, ghost.opacity, ghost.opacity],
        // Slap: cocked wide, drops through neutral, whips through on contact —
        // the last stop is where the palm meets the face, so the rotation
        // accelerates hardest in the final 40% of the arc.
        // Rose: two full tumbles end over end.
        rotate: isSlap ? [55, 40, 0, -55] : [0, 60, 240, 400],
      }}
      exit={{
        opacity: 0,
        scale: 2.1,
        transition: { duration: 0.16, ease: "easeOut" },
      }}
      transition={{
        duration: FLIGHT_MS / 1000,
        delay: ghost.delay,
        // Slow wind-up, fast strike.
        ease: [0.5, 0, 0.2, 1],
        times: [0, 0.22, 0.62, 1],
      }}
      style={{
        left: flight.from.x,
        top: flight.from.y,
        willChange: "transform, opacity",
      }}
      className={`absolute -mt-4 -ml-4 text-3xl leading-none select-none ${ghost.blur}`}
    >
      {GLYPH[flight.choice]}
    </motion.span>
  );
}
