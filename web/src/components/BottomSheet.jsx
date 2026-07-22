"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";

/**
 * A modal that slides up from the bottom of the viewport.
 *
 * Reused for Information, Leaderboard, and Search — the trio of secondary
 * surfaces that keep the main representative card slim.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  size = "auto",
  autoFocus = false,
}) {
  const contentRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  // Focus the first focusable element inside the sheet on open — the search
  // sheet uses this to land the caret in the combobox immediately.
  useEffect(() => {
    if (!open || !autoFocus) return;
    const t = setTimeout(() => {
      const target = contentRef.current?.querySelector(
        'input, textarea, [contenteditable="true"]',
      );
      target?.focus();
    }, 220);
    return () => clearTimeout(t);
  }, [open, autoFocus]);

  const sheetHeight =
    size === "tall"
      ? "h-[88vh] sm:h-[85vh]"
      : "max-h-[92vh]";

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-40">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 340, damping: 34 }}
            className={`absolute inset-x-0 bottom-0 flex ${sheetHeight} flex-col rounded-t-[28px] border-t border-rule bg-surface shadow-lift sm:mx-auto sm:max-w-2xl sm:rounded-t-[32px] lg:max-w-3xl`}
          >
            <div
              aria-hidden
              className="mx-auto mt-3 h-1.5 w-10 rounded-full bg-rule"
            />
            <header className="flex items-start justify-between gap-3 px-6 pt-4 pb-3">
              <div className="min-w-0">
                <h2 className="font-serif text-2xl leading-tight text-ink sm:text-3xl">
                  {title}
                </h2>
                {subtitle && (
                  <p className="mt-1 text-sm text-muted">{subtitle}</p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="shrink-0 rounded-full border border-rule bg-surface p-2 text-muted transition-colors hover:border-ink hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                <X className="size-4" strokeWidth={2} />
              </button>
            </header>
            <div
              ref={contentRef}
              className="min-h-0 flex-1 overflow-y-auto px-6 pb-8"
            >
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
