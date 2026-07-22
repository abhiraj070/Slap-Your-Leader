"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useId, useState } from "react";

import { useTierVisited } from "./RepresentativePager";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import { toFriendlyError } from "@/lib/api";

const TIER_COPY = {
  mla: {
    title: "Pan India ranking",
    scope: "Ranked across every state assembly",
  },
  mp: {
    title: "Pan India ranking",
    scope: "Lok Sabha constituencies across India",
  },
  minister: {
    title: "Pan India ranking",
    scope: "The union council of ministers",
  },
};

const OPTIONS = [
  { value: "slap", emoji: "👋", label: "Slap toppers", accent: "text-slap" },
  { value: "rose", emoji: "🌹", label: "Rose toppers", accent: "text-laurel" },
];

/**
 * A tier-specific ranking, lazily fetched.
 *
 * The MLA leaderboard mounts inside the first pager page and fires immediately;
 * MP and Minister leaderboards fire when their pager page becomes horizontally
 * visible (via IntersectionObserver). Once fetched, React Query caches the
 * result for the session.
 */
export function Leaderboard({ tier }) {
  const [board, setBoard] = useState("slap");
  // `enabled` is driven by the pager: true once the section this leaderboard
  // belongs to has been visited. MLA is visited on mount (page 0), MP and
  // Minister when the user navigates there.
  const enabled = useTierVisited(tier);

  const query = useLeaderboard(tier, enabled);
  const copy = TIER_COPY[tier];
  const toppers =
    board === "slap" ? query.data?.slapToppers : query.data?.roseToppers;
  const isLoading = !enabled || query.isPending;

  return (
    <section className="overflow-hidden rounded-card border border-rule bg-surface shadow-card">
      <header className="border-b border-rule p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow">Leaderboard</p>
            <h3 className="mt-1 font-serif text-xl leading-tight text-balance sm:text-2xl">
              {copy.title}
            </h3>
            <p className="mt-1 text-xs text-muted">{copy.scope}</p>
          </div>

          <SubTabs value={board} onChange={setBoard} />
        </div>
      </header>

      <div className="p-5 sm:p-6">
        {isLoading && <SkeletonRows />}

        {enabled && query.isError && (
          <p
            role="alert"
            className="rounded-control border border-rule px-4 py-3 text-sm text-slap"
          >
            {toFriendlyError(query.error)}
          </p>
        )}

        {enabled && !query.isPending && !query.isError && (
          <TopperList toppers={toppers} tier={tier} board={board} />
        )}
      </div>
    </section>
  );
}

function SubTabs({ value, onChange }) {
  // A per-instance id keeps each leaderboard's pill from sliding between
  // *other* leaderboards on the same page — Framer's `layoutId` is global.
  const instanceId = useId();
  const pillId = `lb-pill-${instanceId}`;

  return (
    <div
      role="tablist"
      aria-label="Leaderboard board"
      className="relative inline-flex shrink-0 rounded-control border border-rule bg-paper p-0.5"
    >
      {OPTIONS.map((option) => {
        const isActive = value === option.value;
        return (
          <button
            key={option.value}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => onChange(option.value)}
            className="relative z-10 flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            style={{ color: isActive ? "var(--color-ink)" : "var(--color-muted)" }}
          >
            <span aria-hidden>{option.emoji}</span>
            {option.label}
            {isActive && (
              <motion.span
                layoutId={pillId}
                aria-hidden
                transition={{ type: "spring", stiffness: 400, damping: 34 }}
                className="absolute inset-0 -z-10 rounded-[6px] bg-surface shadow-card"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

function TopperList({ toppers, tier, board }) {
  if (!toppers || toppers.length === 0) {
    return (
      <p className="rounded-control border border-dashed border-rule px-4 py-8 text-center text-sm text-muted">
        {board === "slap"
          ? "No slaps recorded yet — be the first to weigh in."
          : "No roses recorded yet — be the first to weigh in."}
      </p>
    );
  }

  const countKey = board === "slap" ? "slap_count" : "rose_count";
  const emoji = board === "slap" ? "👋" : "🌹";
  const accent = board === "slap" ? "text-slap" : "text-laurel";

  return (
    <ol>
      <AnimatePresence initial={false}>
        {toppers.map((topper, index) => {
          const name = topper.minister_name ?? topper.name;
          const secondary = formatSecondary(tier, topper);
          const count = topper[countKey] ?? 0;
          const rank = index + 1;

          return (
            <motion.li
              key={`${board}-${name}-${index}`}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{
                duration: 0.22,
                delay: index * 0.03,
                ease: [0.2, 0, 0, 1],
              }}
              className="flex items-center gap-3 border-b border-rule py-3 last:border-b-0"
            >
              <span
                className={`w-6 shrink-0 text-right font-serif text-sm tabular-nums ${
                  rank === 1 ? accent : "text-faint"
                }`}
              >
                {String(rank).padStart(2, "0")}
              </span>

              <CompactAvatar src={topper.photo_url} name={name} />

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{name}</p>
                {secondary && (
                  <p className="truncate text-xs text-muted">{secondary}</p>
                )}
              </div>

              <span className="flex shrink-0 items-baseline gap-1 tabular-nums">
                <span className="text-sm font-medium">
                  {count.toLocaleString("en-IN")}
                </span>
                <span aria-hidden className="text-xs">
                  {emoji}
                </span>
              </span>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ol>
  );
}

function monogramOf(name) {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  return (
    parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")
  ).toUpperCase();
}

/**
 * Circular 36×36 avatar for compact list rows. The card portraits stay
 * rectangular; this one is intentionally different because 10 tall rectangles
 * in a list read as sports cards rather than a ranking.
 */
function CompactAvatar({ src, name }) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  return (
    <div className="size-9 shrink-0 overflow-hidden rounded-full border border-rule bg-paper">
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="size-full object-cover object-top"
        />
      ) : (
        <span
          aria-hidden
          className="flex size-full items-center justify-center font-serif text-xs text-faint"
        >
          {monogramOf(name)}
        </span>
      )}
    </div>
  );
}

function SkeletonRows() {
  return (
    <ol className="animate-pulse">
      {Array.from({ length: 5 }, (_, i) => (
        <li
          key={i}
          className="flex items-center gap-3 border-b border-rule py-3 last:border-b-0"
        >
          <span className="w-6 shrink-0" />
          <span className="size-9 shrink-0 rounded-full bg-rule" />
          <span className="flex-1 space-y-1.5">
            <span
              className="block h-3 rounded bg-rule"
              style={{ width: `${70 - i * 6}%` }}
            />
            <span
              className="block h-2.5 rounded bg-rule/60"
              style={{ width: `${45 - i * 3}%` }}
            />
          </span>
          <span className="h-3 w-12 rounded bg-rule" />
        </li>
      ))}
    </ol>
  );
}

function titleCase(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/(?:^|[\s-])\S/g, (character) => character.toUpperCase());
}

/** Party · Constituency for MLAs/MPs; party · shortened portfolio for ministers. */
function formatSecondary(tier, topper) {
  const party = topper.party?.trim();
  if (tier === "minister") {
    const portfolio = String(topper.ministry ?? "")
      .split(";")[0]
      .trim();
    const cleaned = portfolio
      .replace(
        /^Minister of State \(Independent Charge\) of the Ministry of\s*/i,
        "",
      )
      .replace(/^Minister of State in the Ministry of\s*/i, "")
      .replace(/^Minister of State\s*/i, "")
      .replace(/^Minister of\s*/i, "")
      .trim();
    return [party, cleaned || portfolio].filter(Boolean).join(" · ");
  }
  const constituency = titleCase(topper.constituency);
  return [party, constituency].filter(Boolean).join(" · ");
}
