"use client";

import { motion } from "framer-motion";

/**
 * Editorial rule with a centred bullet.
 *
 * Draws itself outward from the middle on mount, and the bullet keeps a slow
 * radar pulse — a small piece of ongoing life so the page doesn't feel frozen
 * once everything's settled. Reused wherever a section needs a divider.
 */
export function Ornament({ className = "" }) {
  return (
    <div
      aria-hidden
      className={`flex items-center justify-center gap-3 ${className}`}
    >
      <motion.span
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{
          duration: 0.7,
          delay: 0.15,
          ease: [0.16, 1, 0.3, 1],
        }}
        style={{ transformOrigin: "right", willChange: "transform" }}
        className="h-px w-14 bg-rule sm:w-24"
      />

      <span className="relative flex size-1.5 items-center justify-center">
        <motion.span
          className="absolute inset-0 rounded-full bg-slap"
          initial={{ scale: 1, opacity: 0.55 }}
          animate={{ scale: [1, 2.6], opacity: [0.55, 0] }}
          transition={{
            duration: 2.6,
            repeat: Infinity,
            ease: "easeOut",
            delay: 1.1,
          }}
        />
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{
            duration: 0.35,
            delay: 0.55,
            ease: [0.16, 1, 0.3, 1],
          }}
          className="relative size-1.5 rounded-full bg-slap"
        />
      </span>

      <motion.span
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{
          duration: 0.7,
          delay: 0.15,
          ease: [0.16, 1, 0.3, 1],
        }}
        style={{ transformOrigin: "left", willChange: "transform" }}
        className="h-px w-14 bg-rule sm:w-24"
      />
    </div>
  );
}
