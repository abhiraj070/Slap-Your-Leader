"use client";

import { motion } from "framer-motion";

import { Button } from "./ui/Button";

const shell = "mx-auto w-full max-w-xl px-5 py-24 sm:px-8";

export function LocatingScreen({ label, detail }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.2, 0, 0, 1] }}
      className={shell}
    >
      <h2 aria-live="polite" className="font-serif text-2xl sm:text-3xl">
        {label}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">{detail}</p>

      {/* An indeterminate sweep — the quietest possible progress cue, and it
          costs nothing on the main thread. */}
      <div
        role="presentation"
        className="mt-8 h-1.5 w-full overflow-hidden rounded-full bg-rule"
      >
        <motion.div
          className="h-full w-1/3 rounded-full bg-gradient-to-r from-laurel to-slap"
          animate={{ x: ["-100%", "300%"] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
    </motion.div>
  );
}

export function ErrorScreen({ overline, title, body, onRetry }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.2, 0, 0, 1] }}
      className={shell}
      role="alert"
    >
      <p className="eyebrow text-slap">{overline}</p>
      <h2 className="mt-2 font-serif text-2xl text-balance sm:text-3xl">
        {title}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted text-pretty">
        {body}
      </p>
      <Button variant="secondary" className="mt-7" onClick={onRetry}>
        Try again
      </Button>
    </motion.div>
  );
}
