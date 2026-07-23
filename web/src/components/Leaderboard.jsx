"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useId, useState } from "react";

import { useLeaderboard } from "@/hooks/useLeaderboard";
import { toFriendlyError } from "@/lib/api";

const TIER_COPY = {
  mp: { scope: "Lok Sabha constituencies across India" },
  minister: { scope: "The union council of ministers" },
};

const TIERS = [
  { value: "mp", label: "MPs" },
  { value: "minister", label: "Ministers" },
];

const BOARDS = [
  { value: "slap", emoji: "👋", label: "Slap toppers" },
  { value: "rose", emoji: "🌹", label: "Rose toppers" },
];

/**
 * The full leaderboard: two top-level sections — MPs and Ministers — each
 * with its own Slap/Rose sub-tabs underneath. That's four independent,
 * independently-paginated rankings in total; switching either tab swaps
 * which one is on screen, it doesn't merge or reset the others.
 *
 * `defaultTier` opens on whichever tier the current representative belongs
 * to. `highlightName` emphasises that representative's own row wherever it
 * appears — it simply won't match on the other tier's rows.
 *
 * `onSelectTopper(tier, topper)` — when provided, every row becomes tappable
 * and opens that person's full profile (handled by the caller). `pendingKey`
 * marks the one row currently being fetched, formatted `"${tier}:${name}"`.
 */
export function Leaderboard({
  defaultTier = "mp",
  highlightName = null,
  onSelectTopper,
  pendingKey,
}) {
  const [tier, setTier] = useState(defaultTier);
  const [board, setBoard] = useState("slap");

  return (
    <div>
      <div className="flex justify-center">
        <PillTabs
          options={TIERS}
          value={tier}
          onChange={setTier}
          ariaLabel="Leaderboard tier"
        />
      </div>

      <p className="mt-2 text-center text-xs text-muted">
        {TIER_COPY[tier]?.scope}
      </p>

      <div className="mt-4 flex justify-center">
        <PillTabs
          options={BOARDS}
          value={board}
          onChange={setBoard}
          ariaLabel="Leaderboard board"
        />
      </div>

      <div className="mt-4">
        <TierBoard
          tier={tier}
          board={board}
          highlightName={highlightName}
          onSelectTopper={onSelectTopper}
          pendingKey={pendingKey}
        />
      </div>
    </div>
  );
}

/** One of the four independent (tier, board) rankings. */
function TierBoard({ tier, board, highlightName, onSelectTopper, pendingKey }) {
  const query = useLeaderboard(tier, board, true);

  return (
    <div>
      {query.isPending && <SkeletonRows />}

      {query.isError && (
        <p
          role="alert"
          className="rounded-control border border-rule px-4 py-3 text-sm text-slap"
        >
          {toFriendlyError(query.error)}
        </p>
      )}

      {!query.isPending && !query.isError && (
        <>
          <TopperList
            toppers={query.toppers}
            tier={tier}
            board={board}
            highlightName={highlightName}
            onSelectTopper={onSelectTopper}
            pendingKey={pendingKey}
          />
          {query.hasNextPage && (
            <button
              type="button"
              onClick={() => query.fetchNextPage()}
              disabled={query.isFetchingNextPage}
              className="mt-3 w-full rounded-control border border-rule py-2.5 text-xs font-medium tracking-[0.05em] text-ink uppercase transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-60"
            >
              {query.isFetchingNextPage ? "Loading…" : "Load more"}
            </button>
          )}
        </>
      )}
    </div>
  );
}

/** A pill-switcher, reused for both the tier tabs and the board sub-tabs. */
function PillTabs({ options, value, onChange, ariaLabel }) {
  const instanceId = useId();
  const pillId = `lb-pill-${instanceId}`;

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="relative inline-flex shrink-0 rounded-control border border-rule bg-paper p-0.5"
    >
      {options.map((option) => {
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
            {option.emoji && <span aria-hidden>{option.emoji}</span>}
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

const RANK_BADGES = ["🥇", "🥈", "🥉"];

function TopperList({ toppers, tier, board, highlightName, onSelectTopper, pendingKey }) {
  if (!toppers || toppers.length === 0) {
    return (
      <p className="rounded-control border border-dashed border-rule px-4 py-8 text-center text-sm text-muted">
        {board === "slap"
          ? "No slaps recorded yet — be the first to weigh in."
          : "No roses recorded yet — be the first to weigh in."}
      </p>
    );
  }

  const highlight = String(highlightName ?? "").trim().toLowerCase();

  return (
    <ol className="space-y-1.5">
      <AnimatePresence initial={false}>
        {toppers.map((topper, index) => {
          const name = topper.minister_name ?? topper.name;
          const secondary = formatSecondary(tier, topper);
          const rank = index + 1;
          const badge = RANK_BADGES[index] ?? null;
          const isCurrent =
            highlight && String(name ?? "").trim().toLowerCase() === highlight;
          const rowKey = `${tier}:${name}`;
          const isPending = pendingKey === rowKey;

          return (
            <motion.li
              key={`${board}-${name}-${index}`}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{
                duration: 0.24,
                delay: index * 0.03,
                ease: [0.2, 0, 0, 1],
              }}
            >
              <button
                type="button"
                onClick={() => onSelectTopper?.(tier, topper)}
                disabled={!onSelectTopper || isPending}
                aria-label={`View ${name}'s profile`}
                className={`flex w-full items-center gap-3 rounded-card border px-3 py-2.5 text-left transition-colors disabled:cursor-wait ${
                  isCurrent
                    ? "border-slap bg-slap-wash"
                    : "border-transparent hover:border-rule hover:bg-paper/60"
                } ${isPending ? "opacity-60" : ""}`}
              >
                <span
                  aria-label={`Rank ${rank}`}
                  className="flex w-9 shrink-0 items-center justify-center text-lg tabular-nums"
                >
                  {isPending ? (
                    <Loader2
                      aria-hidden
                      className="size-4 animate-spin text-muted"
                    />
                  ) : badge ? (
                    <span aria-hidden className="text-2xl leading-none">
                      {badge}
                    </span>
                  ) : (
                    <span className="font-serif text-sm text-faint">
                      {String(rank).padStart(2, "0")}
                    </span>
                  )}
                </span>

                <CompactAvatar src={topper.photo_url} name={name} />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {name}
                  </p>
                  {secondary && (
                    <p className="truncate text-xs text-muted">{secondary}</p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  <Metric
                    value={topper.slap_count ?? 0}
                    emoji="👋"
                    emphasize={board === "slap"}
                    accentClass="text-slap"
                  />
                  <Metric
                    value={topper.rose_count ?? 0}
                    emoji="🌹"
                    emphasize={board === "rose"}
                    accentClass="text-laurel"
                  />
                </div>
              </button>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ol>
  );
}

/**
 * One count with its glyph. Both metrics show on every row now — the board
 * that's currently active gets the bigger, coloured treatment; the other
 * stays small and muted rather than disappearing, so a leader's overall
 * standing reads at a glance without switching tabs.
 */
function Metric({ value, emoji, emphasize, accentClass }) {
  return (
    <span
      className={`flex items-baseline gap-1 ${emphasize ? accentClass : "text-muted"}`}
    >
      <AnimatedCount
        value={value}
        className={
          emphasize
            ? "text-base font-semibold tabular-nums"
            : "text-xs font-medium tabular-nums"
        }
      />
      <span aria-hidden className={emphasize ? "text-sm" : "text-[10px]"}>
        {emoji}
      </span>
    </span>
  );
}

function AnimatedCount({ value, className }) {
  return (
    <motion.span
      key={value}
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
      className={className}
    >
      {Number(value).toLocaleString("en-IN")}
    </motion.span>
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

function CompactAvatar({ src, name }) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  return (
    <div className="size-11 shrink-0 overflow-hidden rounded-full border border-rule bg-paper">
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
          className="flex size-full items-center justify-center font-serif text-sm text-faint"
        >
          {monogramOf(name)}
        </span>
      )}
    </div>
  );
}

function SkeletonRows() {
  return (
    <ol className="animate-pulse space-y-2">
      {Array.from({ length: 5 }, (_, i) => (
        <li
          key={i}
          className="flex items-center gap-3 rounded-card px-3 py-2.5"
        >
          <span className="w-9 shrink-0" />
          <span className="size-11 shrink-0 rounded-full bg-rule" />
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
