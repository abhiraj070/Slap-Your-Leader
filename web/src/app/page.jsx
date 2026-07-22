"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useCallback, useMemo, useState } from "react";

import { Landing } from "@/components/Landing";
import { MinisterSection } from "@/components/MinisterSection";
import { RepresentativeCard } from "@/components/RepresentativeCard";
import { RepresentativePager } from "@/components/RepresentativePager";
import { ErrorScreen, LocatingScreen } from "@/components/StatusScreens";
import { Button } from "@/components/ui/Button";
import { useMinistries } from "@/hooks/useMinistries";
import { fetchRepresentatives, toFriendlyError } from "@/lib/api";
import {
  GEOLOCATION_COPY,
  GeolocationError,
  requestPosition,
} from "@/lib/geolocation";
import { voteKey } from "@/lib/votes";

export default function Home() {
  const [coords, setCoords] = useState(null);
  const [geoError, setGeoError] = useState(null);
  const [isLocating, setIsLocating] = useState(false);

  // Shared with MinisterSection through React Query's cache, so the switcher
  // can preview the real ministry count without a second request.
  const { ministryCount } = useMinistries();

  const {
    data,
    isPending: isLoadingSeats,
    isError,
    error,
    refetch,
  } = useQuery({
    // Coordinates are part of the key so a re-locate refetches rather than
    // serving the previous neighbourhood from cache.
    queryKey: ["representatives", coords?.latitude, coords?.longitude],
    queryFn: () => fetchRepresentatives(coords),
    enabled: coords !== null,
  });

  /** Must run from the click handler — that gesture is what unlocks the prompt. */
  const handleAllowLocation = useCallback(async () => {
    setGeoError(null);
    setIsLocating(true);
    try {
      setCoords(await requestPosition());
    } catch (err) {
      setGeoError(err instanceof GeolocationError ? err.reason : "unavailable");
    } finally {
      setIsLocating(false);
    }
  }, []);

  const handleReset = useCallback(() => {
    setCoords(null);
    setGeoError(null);
  }, []);

  // Either seat can be missing: the point may fall outside every stored
  // boundary, or the party may have no `party_manifesto_points` row (the
  // handler inner-joins it). The ministers page is always present — it isn't
  // derived from location.
  const pages = useMemo(() => {
    if (!data) return [];

    const built = [
      { tier: "mla", label: "Your MLA", representative: data.mla },
      { tier: "mp", label: "Your MP", representative: data.mp },
    ]
      .filter((page) => page.representative)
      .map((page) => ({
        // Keyed by the representative, not just the tier: looking up a new
        // location must remount the card so its vote and photo-error state
        // don't carry over to a different person.
        key: voteKey(page.tier, page.representative),
        label: page.label,
        // The switcher previews each section so the third one advertises
        // itself instead of hiding behind a bare label.
        preview: [page.representative.name, page.representative.party]
          .filter(Boolean)
          .join(" · "),
        node: (
          <RepresentativeCard
            tier={page.tier}
            representative={page.representative}
          />
        ),
      }));

    built.push({
      key: "ministers",
      label: "Ministers",
      preview: ministryCount
        ? `Search ${ministryCount} ministries`
        : "Search the council",
      accent: true,
      node: <MinisterSection />,
    });

    return built;
  }, [data, ministryCount]);

  // The ministers page is always in `pages`, so it can't stand in for "we
  // found a seat" — that has to come from the lookup itself.
  const hasSeat = Boolean(data?.mla || data?.mp);

  const stage = resolveStage({
    geoError,
    isLocating,
    coords,
    isLoadingSeats,
    isError,
    hasSeat,
  });

  return (
    // No AnimatePresence: the mock/API can answer fast enough that `stage`
    // moves landing -> locating -> results inside a single exit animation, and
    // `mode="wait"` then mounts the incoming child without ever firing its
    // enter animation, leaving it stuck at opacity 0. Each stage animates its
    // own entrance on mount instead, which can't race.
    <main className="flex min-h-dvh flex-col">
      {stage === "landing" && (
        <div className="flex flex-1 items-center">
          <Landing onAllowLocation={handleAllowLocation} isBusy={isLocating} />
        </div>
      )}

      {stage === "locating" && (
        <LocatingScreen
          label="Locating your constituency"
          detail="Matching your coordinates against assembly and parliamentary boundaries."
        />
      )}

      {stage === "geo-error" && (
        <ErrorScreen
          overline={GEOLOCATION_COPY[geoError].overline}
          title={GEOLOCATION_COPY[geoError].title}
          body={GEOLOCATION_COPY[geoError].body}
          onRetry={handleAllowLocation}
        />
      )}

      {stage === "fetch-error" && (
        <ErrorScreen
          overline="Lookup failed"
          title="We couldn't reach the register"
          body={toFriendlyError(error)}
          onRetry={refetch}
        />
      )}

      {stage === "empty" && (
        <ErrorScreen
          overline="No match"
          title="No seat covers this spot"
          body="We couldn't match your location to a constituency we hold. Being outside India — or right on a boundary — is the usual reason."
          onRetry={handleAllowLocation}
        />
      )}

      {stage === "results" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25, ease: [0.2, 0, 0, 1] }}
          className="mx-auto w-full max-w-5xl py-10 sm:py-14"
        >
          <header className="mb-5 px-5 sm:px-8 lg:px-0">
            <p className="eyebrow">Your representatives</p>
            <h1 className="mt-2 font-serif text-3xl text-balance sm:text-4xl">
              Here&apos;s who answers for you
            </h1>
            <p className="mt-2 text-sm text-muted">
              Three sections — swipe, or use the arrows.
            </p>
          </header>

          <RepresentativePager pages={pages} />
        </motion.div>
      )}
    </main>
  );
}

/** Single source of truth for which screen wins, in priority order. */
function resolveStage({
  geoError,
  isLocating,
  coords,
  isLoadingSeats,
  isError,
  hasSeat,
}) {
  if (geoError) return "geo-error";
  if (isLocating) return "locating";
  if (!coords) return "landing";
  if (isLoadingSeats) return "locating";
  if (isError) return "fetch-error";
  return hasSeat ? "results" : "empty";
}
