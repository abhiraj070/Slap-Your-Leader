"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchLeaderboard } from "@/lib/api";

/**
 * Lazily fetches the leaderboard for a tier.
 *
 * `enabled` is driven by the caller (usually an IntersectionObserver in the
 * `Leaderboard` component): the MLA leaderboard fires immediately because its
 * page is on screen from the start, MP and Minister only fetch when their
 * page becomes horizontally visible.
 */
export function useLeaderboard(tier, enabled) {
  return useQuery({
    queryKey: ["leaderboard", tier],
    queryFn: () => fetchLeaderboard(tier),
    enabled,
    staleTime: 60_000,
  });
}
