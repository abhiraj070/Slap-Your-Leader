"use client";

import { useMutation } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";

import { castMinistryVote, castVote } from "@/lib/api";

/**
 * Picks a side for one subject, then lets you keep hitting it.
 *
 * The chosen side stays live and can be clicked repeatedly — each click is its
 * own PATCH. The opposite side locks only for as long as the card is mounted:
 * nothing is persisted, so a reload hands both buttons back.
 *
 * `casts` counts this session's increments so the tally reads `base + casts`.
 * It resets on reload, which is correct — the count the API returns already
 * includes everything recorded earlier.
 *
 * `tier` is "mla" | "mp" | "minister"; ministers go to their own endpoint.
 */
export function useVote(tier, subject) {
  const isMinister = tier === "minister";

  const [choice, setChoice] = useState(null);
  const [casts, setCasts] = useState(0);
  const [isError, setIsError] = useState(false);

  // Mirrors `casts` outside of state so a failure can roll back without
  // reading state inside an updater.
  const countRef = useRef(0);

  const { mutate, isPending } = useMutation({
    mutationFn: isMinister ? castMinistryVote : castVote,
  });

  const vote = useCallback(
    (next) => {
      if (!subject) return;
      // You can hit your own side as often as you like, but never cross over.
      if (choice && next !== choice) return;

      countRef.current += 1;
      setChoice(next);
      setCasts(countRef.current);
      setIsError(false);

      const payload = isMinister
        ? {
            name: subject.minister_name,
            ministryName: subject.ministry,
            choice: next,
          }
        : {
            tier,
            name: subject.name,
            constituencyKey: subject.constituency_key,
            choice: next,
          };

      mutate(payload, {
        onError: () => {
          countRef.current = Math.max(0, countRef.current - 1);
          setCasts(countRef.current);
          setIsError(true);
          // Hand the other side back only if nothing landed at all.
          if (countRef.current === 0) setChoice(null);
        },
      });
    },
    [choice, isMinister, mutate, subject, tier],
  );

  return { choice, casts, vote, isPending, isError };
}
