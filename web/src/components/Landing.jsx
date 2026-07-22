"use client";

import { motion } from "framer-motion";

import { Button } from "./ui/Button";

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};

const item = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.28, ease: [0.2, 0, 0, 1] },
  },
};

const PROMISES = [
  "Name, party, constituency",
  "Education and declared cases",
  "Their party's manifesto",
  "A slap or a rose — one side each",
];

export function Landing({ onAllowLocation, isBusy }) {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="mx-auto grid w-full max-w-5xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14 lg:py-24"
    >
      <div>
        <motion.p variants={item} className="eyebrow">
          Verdicts · India
        </motion.p>

        <motion.h1
          variants={item}
          className="mt-3 font-serif text-5xl leading-[1.02] text-balance sm:text-6xl lg:text-7xl"
        >
          Slap or Rose? <span className="text-slap">You decide.</span>
        </motion.h1>

        <motion.p
          variants={item}
          className="mt-5 max-w-md text-lg leading-relaxed text-muted text-pretty"
        >
          Read what they promised. Then decide if they deserve a 👋 or 🌹.
        </motion.p>

        <motion.div
          variants={item}
          className="mt-8 flex flex-wrap items-center gap-4"
        >
          <Button onClick={onAllowLocation} disabled={isBusy}>
            Who&apos;s mine? →
          </Button>
          <span className="text-xs text-muted">Read once. Never stored.</span>
        </motion.div>
      </div>

      <motion.div
        variants={item}
        className="lg:border-l lg:border-rule lg:pl-10"
      >
        <p className="eyebrow">What you&apos;ll see</p>
        <ul className="mt-3">
          {PROMISES.map((promise) => (
            <li
              key={promise}
              className="border-b border-rule py-2.5 text-sm last:border-b-0"
            >
              {promise}
            </li>
          ))}
        </ul>
      </motion.div>
    </motion.div>
  );
}
