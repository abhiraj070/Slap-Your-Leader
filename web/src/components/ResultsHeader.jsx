"use client";

import { motion } from "framer-motion";
import { MapPin } from "lucide-react";

import { Ornament } from "./Ornament";

/** "KAROL BAGH" -> "Karol Bagh". API values are ALL CAPS. */
function titleCase(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/(?:^|[\s-])\S/g, (character) => character.toUpperCase());
}

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};

const item = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.42, ease: [0.2, 0, 0, 1] },
  },
};

/**
 * The masthead over the three-section switcher.
 *
 * Personalises the page with the constituency the API resolved to (the local
 * MLA seat, or the MP if that came back empty). Serif headline, staggered
 * entrance, and a shared ornament rule under the title so the results view
 * carries the same editorial motif as the landing screen.
 */
export function ResultsHeader({ representatives }) {
  const constituency =
    representatives?.mla?.constituency ?? representatives?.mp?.constituency;

  return (
    <motion.header
      variants={container}
      initial="hidden"
      animate="show"
      className="mb-8 px-5 text-center sm:px-8 sm:mb-10 lg:px-0"
    >
      {constituency && (
        <motion.p
          variants={item}
          className="inline-flex items-center gap-1.5 rounded-full border border-rule bg-surface px-3 py-1 text-[11px] leading-none font-medium tracking-[0.09em] text-ink uppercase shadow-card"
        >
          <MapPin className="size-3 text-slap" strokeWidth={2.5} />
          {titleCase(constituency)}
        </motion.p>
      )}

      <motion.h1
        variants={item}
        className="mt-4 font-serif text-4xl leading-[1.05] text-balance sm:text-5xl lg:text-[3.75rem]"
      >
        Here&apos;s who answers for you
      </motion.h1>

      <motion.div variants={item} className="mt-5">
        <Ornament />
      </motion.div>

      <motion.p
        variants={item}
        className="mx-auto mt-5 max-w-md text-sm leading-relaxed text-muted text-pretty"
      >
        Three sections — swipe, tap a tab above the card, or use the arrow keys.
      </motion.p>
    </motion.header>
  );
}
