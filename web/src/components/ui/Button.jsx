"use client";

import { motion } from "framer-motion";

const VARIANTS = {
  primary:
    "bg-ink text-paper border border-ink hover:bg-ink/90 focus-visible:outline-ink",
  secondary:
    "bg-surface text-ink border border-rule hover:border-ink/30 focus-visible:outline-ink",
  quiet:
    "bg-transparent text-muted border border-transparent hover:text-ink focus-visible:outline-ink",
};

export function Button({
  variant = "primary",
  className = "",
  disabled,
  ...props
}) {
  return (
    <motion.button
      whileTap={disabled ? undefined : { y: 1 }}
      transition={{ duration: 0.12, ease: [0.2, 0, 0, 1] }}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-control px-5 py-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}
