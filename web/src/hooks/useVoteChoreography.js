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

  /** Button centre → portrait's upper third, both relative to the card. */
  const measure = useCallback(
    (choice) => {
      const stage = stageRef.current;
      const button = buttonsRef.current[choice];
      const portrait = portraitRef.current;
      if (!stage || !button || !portrait) return null;

      const s = stage.getBoundingClientRect();
      const b = button.getBoundingClientRect();
      const p = portrait.getBoundingClientRect();

      return {
        from: {
          x: b.left + b.width / 2 - s.left,
          y: b.top + b.height / 2 - s.top,
        },
        to: {
          x: p.left + p.width / 2 - s.left,
          y: p.top + p.height * 0.4 - s.top,
        },
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

      // +1 when the hand travels left-to-right, so the head can recoil the way
      // it was hit and the flush can land on the struck cheek.
      const direction = path.to.x >= path.from.x ? 1 : -1;
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
