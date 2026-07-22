"use client";

import { AnimatePresence, motion } from "framer-motion";

/**
 * The wind-up banner, centred in the viewport rather than tucked above the
 * buttons — it's the only thing happening for that beat, so it gets the room.
 *
 * Fixed positioning means it's centred on screen wherever the card is scrolled
 * to. It clears the instant the hand launches, so it never covers the animation
 * it was announcing.
 */
export function VoteAnnouncement({ message }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          key={message}
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, scale: 0.94, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: -6 }}
          transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
          className="pointer-events-none fixed inset-x-0 top-1/2 z-50 flex -translate-y-1/2 justify-center px-6"
        >
          <span className="rounded-card border border-rule bg-surface/95 px-7 py-5 text-center font-serif text-xl leading-snug text-balance text-ink shadow-card backdrop-blur-sm sm:text-2xl">
            {message}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
