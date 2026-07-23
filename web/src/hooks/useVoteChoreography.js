"use client";

import { useAnimationControls, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Sequences the slap/rose micro-interaction for one card.
 *
 * Phases: idle → winding (message, both buttons locked) → flying (projectile
 * leaves the button, portrait swells) → impact (shake + mark, or bloom) →
 * settling → idle, and only then does the caller's `commit` run, so the tally
 * never moves before the animation lands.
 *
 * The card is the stage: it holds the positioning context, and the flight path
 * is measured from the button and portrait rects at launch, so it stays correct
 * at any breakpoint without hard-coded coordinates.
 */
export const WIND_UP_MS = 900;
export const FLIGHT_MS = 900;
export const IMPACT_MS = 700;
export const SETTLE_MS = 450;

/**
 * Where the strike actually lands, as a fraction of the portrait's own
 * width/height — shared with `SlapImpact` in `VotePortrait.jsx` so the thrown
 * hand and the mark it leaves can never drift apart again. `IMPACT_X` is
 * measured in from the struck edge (mirrored for the other side), not from
 * the portrait's dead centre, since a slap lands on a cheek, not the nose.
 * Percentages of the portrait's own box keep this correct at any image size
 * or breakpoint. Calibrated against the actual portrait crop (a plain
 * overlay dot at candidate values, checked against a percentage grid) rather
 * than guessed — these photos are head-and-shoulders shots where the face
 * sits lower and smaller in the frame than a tight face crop would suggest,
 * so `IMPACT_Y` needed to land near the mouth/jaw line (~48%), not eye level.
 */
export const IMPACT_X = 0.3;
export const IMPACT_Y = 0.48;

const MESSAGES = {
  // Deliberately not "the man" — representatives are of any gender, and the
  // roster includes plenty of women.
  slap: "👋 Wait… the slap is on its way…",
  rose: "🌹 Wait… giving a rose…",
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Start a portrait animation without awaiting it. The rejection guard matters:
 * unmounting mid-animation rejects the promise, which would otherwise surface
 * as an unhandled rejection.
 */
function animate(controls, definition) {
  Promise.resolve(controls.start(definition)).catch(() => {});
}

/**
 * The card owns its DOM refs and passes them in; this hook owns only the
 * timeline. Keeping refs out of the return value matters — the returned object
 * is read during render, and React forbids reading refs there.
 */
export function useVoteChoreography({ stageRef, portraitRef, buttonsRef }) {
  // Survives unmount mid-flight (switching ministry remounts the card).
  const aliveRef = useRef(true);
  const busyRef = useRef(false);

  const portraitControls = useAnimationControls();
  const reduceMotion = useReducedMotion();

  const [phase, setPhase] = useState("idle");
  const [activeChoice, setActiveChoice] = useState(null);
  const [flight, setFlight] = useState(null);
  const [impactDirection, setImpactDirection] = useState(1);

  // Set on mount as well as cleared on unmount: Strict Mode mounts, cleans up,
  // then remounts, so a flag only initialised by `useRef(true)` would stay
  // false forever after that first cleanup and every await would bail out.
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  /**
   * Button centre → the point of impact on the portrait, both relative to
   * the card. For a slap that's the struck cheek (`IMPACT_X`/`IMPACT_Y`,
   * mirrored by which side the button sits on); for a rose it's the
   * portrait's dead centre, matching `Bloom`'s centred bouquet. Sharing the
   * same constants `SlapImpact` renders with is what keeps the hand landing
   * exactly where its mark then appears, at any image size or breakpoint.
   */
  const measure = useCallback(
    (choice) => {
      const stage = stageRef.current;
      const button = buttonsRef.current[choice];
      const portrait = portraitRef.current;
      if (!stage || !button || !portrait) return null;

      const s = stage.getBoundingClientRect();
      const b = button.getBoundingClientRect();
      const p = portrait.getBoundingClientRect();

      // +1 when the button sits left of the portrait's centre: the hand
      // travels left-to-right and lands on the near (left) cheek. Derived
      // from button vs. portrait position — not from the flight target —
      // so it's available before the target itself is computed.
      const direction = b.left + b.width / 2 <= p.left + p.width / 2 ? 1 : -1;

      const targetX =
        choice === "slap"
          ? p.left + p.width * (direction === 1 ? IMPACT_X : 1 - IMPACT_X)
          : p.left + p.width / 2;
      const targetY =
        choice === "slap" ? p.top + p.height * IMPACT_Y : p.top + p.height / 2;

      return {
        from: {
          x: b.left + b.width / 2 - s.left,
          y: b.top + b.height / 2 - s.top,
        },
        to: {
          x: targetX - s.left,
          y: targetY - s.top,
        },
        direction,
      };
    },
    [stageRef, portraitRef, buttonsRef],
  );

  const play = useCallback(
    async (choice, commit) => {
      if (busyRef.current) return;

      // Someone who asked the OS to cut motion gets the outcome, not the show.
      if (reduceMotion) {
        commit();
        return;
      }

      busyRef.current = true;
      setActiveChoice(choice);
      setPhase("winding");

      await wait(WIND_UP_MS);
      if (!aliveRef.current) return;

      const path = measure(choice);
      if (!path) {
        // Never leave the buttons stuck if the layout isn't measurable.
        busyRef.current = false;
        setPhase("idle");
        setActiveChoice(null);
        commit();
        return;
      }

      const direction = path.direction;
      setImpactDirection(direction);

      setFlight({ choice, ...path });
      setPhase("flying");

      // The timeline is driven by timers, and the portrait animations are
      // fire-and-forget. Awaiting `controls.start()` would tie the sequence to
      // rAF, which stalls in a backgrounded tab — the buttons would stay locked
      // and the vote would never commit. Timers still fire (throttled) there.
      animate(portraitControls, {
        scale: 1.12,
        transition: { duration: FLIGHT_MS / 1000, ease: [0.2, 0, 0, 1] },
      });
      await wait(FLIGHT_MS);
      if (!aliveRef.current) return;

      setPhase("impact");
      setFlight(null);

      animate(
        portraitControls,
        choice === "slap"
          ? {
              // Snaps away from the blow, then settles back — a recoil rather
              // than a symmetric wobble.
              x: [0, 13 * direction, -6 * direction, 3 * direction, 0],
              rotate: [0, 2.8 * direction, -1.3 * direction, 0.5 * direction, 0],
              // The face twist. skewX at a top-heavy transform origin shifts
              // the upper half horizontally — reads as the flesh pushing with
              // the blow, then whipping back. Peaks in the same direction as
              // the strike so the face moves with it, not against.
              skewX: [0, 6 * direction, -2.5 * direction, 1 * direction, 0],
              scale: [1.16, 1.09, 1.13, 1.12],
              transition: {
                duration: IMPACT_MS / 1000,
                ease: [0.16, 1, 0.3, 1],
              },
            }
          : {
              scale: [1.12, 1.18, 1.13],
              rotate: [0, -1.2, 0],
              transition: { duration: IMPACT_MS / 1000, ease: "easeOut" },
            },
      );
      await wait(IMPACT_MS);
      if (!aliveRef.current) return;

      setPhase("settling");
      animate(portraitControls, {
        scale: 1,
        x: 0,
        rotate: 0,
        // Reset explicitly: Framer leaves omitted properties at their last
        // committed value, so a lingering skew would carry over otherwise.
        skewX: 0,
        transition: { duration: SETTLE_MS / 1000, ease: [0.2, 0, 0, 1] },
      });
      await wait(SETTLE_MS);
      if (!aliveRef.current) return;

      setPhase("idle");
      setActiveChoice(null);
      busyRef.current = false;
      commit();
    },
    [measure, portraitControls, reduceMotion],
  );

  return {
    portraitControls,
    phase,
    activeChoice,
    flight,
    isBusy: phase !== "idle",
    // Only while winding up: the banner clears the moment the hand launches so
    // it never sits over the animation it was announcing.
    message: phase === "winding" ? MESSAGES[activeChoice] : null,
    impactDirection,
    showSlapMark: phase === "impact" && activeChoice === "slap",
    showBloom: phase === "impact" && activeChoice === "rose",
    play,
  };
}
