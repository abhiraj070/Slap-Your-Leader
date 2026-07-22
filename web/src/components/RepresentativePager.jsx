"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { PagerTabs, SwipeIndicator } from "./SwipeIndicator";

/**
 * Tells child components whether the section they belong to has been visited.
 *
 * Used by `Leaderboard` to gate lazy fetches: MLA fires immediately because
 * page 0 is visited on mount, MP and Minister fire when the user reaches them.
 * A cleaner signal than IntersectionObserver — deterministic and works in
 * headless/backgrounded panes too.
 */
const VisitedTiersContext = createContext(new Set());

export function useTierVisited(tier) {
  return useContext(VisitedTiersContext).has(tier);
}

/**
 * The three sections, one at a time, at every breakpoint.
 *
 * A single CSS scroll-snap track drives all of them: touch devices swipe it
 * natively, and so do trackpads, which is why desktop gets the same track
 * rather than a stacked column. Mouse-only users get the arrows, and the
 * whole region takes Left/Right keys.
 *
 * Stacking all three on desktop was the previous design and it buried the
 * ministers section below two full-height cards — nobody scrolled that far.
 *
 * `pages` is `[{ key, label, preview, accent, node }]` so it can carry
 * anything; the ministers page is a search panel, not a card.
 */
export function RepresentativePager({ pages }) {
  const trackRef = useRef(null);
  const [active, setActive] = useState(0);
  const [seenAccent, setSeenAccent] = useState(false);
  const [visitedTiers, setVisitedTiers] = useState(
    () => new Set(pages[0]?.tier ? [pages[0].tier] : []),
  );

  const markVisited = useCallback(
    (index) => {
      const tier = pages[index]?.tier;
      if (!tier) return;
      setVisitedTiers((prev) =>
        prev.has(tier) ? prev : new Set(prev).add(tier),
      );
    },
    [pages],
  );
  // Programmatic navigations set `active` up front so the tab underline
  // reacts instantly. This ref tells the scroll handler to trust that
  // value until the animated scroll converges — otherwise a mid-flight
  // scroll event could snap `active` back to whichever page the animation
  // is passing through.
  const targetRef = useRef(0);

  const markSeen = useCallback(
    (index) => {
      if (pages[index]?.accent) setSeenAccent(true);
    },
    [pages],
  );

  const scrollToPage = useCallback(
    (index) => {
      const track = trackRef.current;
      if (!track) return;
      const clamped = Math.max(0, Math.min(index, pages.length - 1));
      targetRef.current = clamped;
      setActive(clamped);
      track.scrollTo({ left: clamped * track.clientWidth, behavior: "smooth" });
      markSeen(clamped);
      markVisited(clamped);
    },
    [pages.length, markSeen, markVisited],
  );

  const handleScroll = useCallback(
    (event) => {
      const track = event.currentTarget;
      const width = track.clientWidth;
      if (width === 0) return;
      // Only accept scroll positions that have snapped to a page boundary;
      // mid-flight events would flip `active` through pages the animation is
      // just passing over. `scroll-snap-mandatory` guarantees the resting
      // position is on a boundary, so real touch swipes still land here.
      const offset = track.scrollLeft % width;
      if (offset > 4 && width - offset > 4) return;
      const index = Math.round(track.scrollLeft / width);
      targetRef.current = index;
      setActive(index);
      markSeen(index);
      markVisited(index);
    },
    [markSeen, markVisited],
  );

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      // The ministry combobox owns its own arrow keys — don't page the whole
      // deck out from under someone who's typing in it.
      if (
        event.target.closest(
          'input, textarea, select, [role="combobox"], [role="listbox"]',
        )
      ) {
        return;
      }
      event.preventDefault();
      scrollToPage(active + (event.key === "ArrowRight" ? 1 : -1));
    },
    [active, scrollToPage],
  );

  const multiple = pages.length > 1;
  const atStart = active === 0;
  const atEnd = active === pages.length - 1;

  return (
    <VisitedTiersContext.Provider value={visitedTiers}>
    <div className="w-full" onKeyDown={handleKeyDown}>
      {multiple && (
        <div className="sticky top-0 z-10 mb-5 bg-paper/95 px-5 pt-2 pb-1 backdrop-blur-sm sm:px-8 lg:px-0">
          <PagerTabs
            pages={pages}
            active={active}
            onSelect={scrollToPage}
            unseenAccent={!seenAccent}
          />
        </div>
      )}

      <div className="flex items-start gap-3">
        {multiple && (
          <PagerArrow
            direction="previous"
            disabled={atStart}
            onClick={() => scrollToPage(active - 1)}
          />
        )}

        <div
          ref={trackRef}
          onScroll={handleScroll}
          className="no-scrollbar flex min-w-0 flex-1 snap-x snap-mandatory overflow-x-auto scroll-smooth"
        >
          {pages.map((page, index) => (
            <div
              key={page.key}
              className="w-full shrink-0 snap-center px-5 sm:px-8 lg:px-0"
            >
              {page.node}

              {multiple && index < pages.length - 1 && (
                <div className="mt-5 lg:hidden">
                  <SwipeIndicator
                    label={`Next: ${pages[index + 1].label}`}
                    onClick={() => scrollToPage(index + 1)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        {multiple && (
          <PagerArrow
            direction="next"
            disabled={atEnd}
            onClick={() => scrollToPage(active + 1)}
          />
        )}
      </div>
    </div>
    </VisitedTiersContext.Provider>
  );
}

/** Mouse affordance — there's nothing to swipe with on a mouse. */
function PagerArrow({ direction, disabled, onClick }) {
  const Icon = direction === "next" ? ChevronRight : ChevronLeft;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`Go to ${direction} section`}
      className="sticky top-1/2 hidden size-9 shrink-0 items-center justify-center rounded-full border border-rule bg-surface text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:text-faint disabled:hover:border-rule focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink lg:flex"
    >
      <Icon className="size-4.5" strokeWidth={2} />
    </button>
  );
}
