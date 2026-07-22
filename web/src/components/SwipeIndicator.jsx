"use client";

import { motion } from "framer-motion";
import { ArrowRight, Search } from "lucide-react";

/**
 * The section switcher — and the main fix for section three's visibility.
 *
 * Each tab previews what's behind it ("Vishesh Ravi · AAP", "Search 58
 * ministries"), so the ministers section announces that it's browsable
 * instead of sitting unseen below two full-height cards. The accented tab
 * also carries a dot until it's been opened at least once.
 */
export function PagerTabs({ pages, active, onSelect, unseenAccent }) {
  const columns = pages.length;

  return (
    <div
      role="group"
      aria-label="Sections"
      className="grid overflow-hidden rounded-card border border-rule bg-surface shadow-card"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {pages.map((page, index) => {
        const isActive = index === active;

        return (
          <button
            key={page.key}
            type="button"
            onClick={() => onSelect(index)}
            aria-current={isActive}
            style={{
              // Inline to guarantee it wins the cascade — a class-based
              // `border-b-ink` was silently ignored under Tailwind v4's
              // preflight (a `border-rule` shorthand overrode it). No CSS
              // transition here either — repeated re-renders in the tree
              // restart the transition from its previous value every frame,
              // so the border effectively never lands.
              borderBottom: `2px solid ${
                isActive ? "var(--color-ink)" : "transparent"
              }`,
            }}
            className={`relative min-w-0 border-r border-rule px-2.5 py-2.5 text-left last:border-r-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink sm:px-4 ${
              !isActive ? "hover:bg-paper/60" : ""
            } ${page.accent ? "bg-paper" : ""}`}
          >
            <span
              className={`eyebrow flex items-center gap-1.5 ${
                isActive || page.accent ? "text-ink" : ""
              }`}
            >
              {page.accent && unseenAccent && (
                <motion.span
                  aria-hidden
                  animate={{ scale: [1, 1.4, 1], opacity: [0.7, 1, 0.7] }}
                  transition={{
                    duration: 1.6,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                  className="size-1.5 shrink-0 rounded-full bg-slap"
                />
              )}
              <span className="truncate">{page.label}</span>
            </span>

            {page.preview && (
              <span
                className={`mt-0.5 flex items-center gap-1 text-[11px] sm:text-xs ${
                  page.accent ? "text-ink" : "text-muted"
                }`}
              >
                {page.accent && (
                  <Search className="size-3 shrink-0" strokeWidth={2} />
                )}
                <span className="truncate">{page.preview}</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * "Next section" nudge at the foot of a card. Touch users swipe and desktop
 * users have the arrows, so this is the mobile belt-and-braces.
 */
export function SwipeIndicator({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mx-auto flex items-center gap-2 rounded-control px-3 py-2 text-sm text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
    >
      {label}
      <motion.span
        aria-hidden
        animate={{ x: [0, 5, 0] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      >
        <ArrowRight className="size-4" strokeWidth={2} />
      </motion.span>
    </button>
  );
}
