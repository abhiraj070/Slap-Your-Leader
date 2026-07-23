"use client";

import { useInfiniteQuery } from "@tanstack/react-query";

import { fetchLeaderboard } from "@/lib/api";

const PAGE_SIZE = 10;

/**
 * Lazily (and incrementally) fetches ONE board (slap or rose) for one tier.
 *
 * The endpoint returns both the slap and rose toppers together for a given
 * `limit`/`offset`, but each of the four leaderboards (MP-slap, MP-rose,
 * Minister-slap, Minister-rose) paginates independently — `queryKey` is
 * keyed by `(tier, board)`, so "load more" on one never affects the others.
 *
 * `enabled` lets the caller defer the fetch until this specific board is
 * actually the one on screen.
 */
export function useLeaderboard(tier, board, enabled) {
  const query = useInfiniteQuery({
    queryKey: ["leaderboard", tier, board],
    queryFn: ({ pageParam }) =>
      fetchLeaderboard(tier, { limit: PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const list = board === "slap" ? lastPage.slapToppers : lastPage.roseToppers;
      // Fewer rows than asked for means this board has nothing left to load.
      return list.length === PAGE_SIZE ? allPages.length * PAGE_SIZE : undefined;
    },
    enabled,
    staleTime: 60_000,
  });

  const pages = query.data?.pages ?? [];
  const toppers = pages.flatMap((page) =>
    board === "slap" ? page.slapToppers : page.roseToppers,
  );

  return { ...query, toppers };
}
