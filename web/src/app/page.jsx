"use client";

import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { Search, Trophy } from "lucide-react";

import { InfoSheet } from "@/components/InfoSheet";
import { Landing } from "@/components/Landing";
import { LeaderboardSheet } from "@/components/LeaderboardSheet";
import { Ornament } from "@/components/Ornament";
import { RepresentativeCard } from "@/components/RepresentativeCard";
import { SearchSheet } from "@/components/SearchSheet";
import { ErrorScreen, LocatingScreen } from "@/components/StatusScreens";
import { useMinistries } from "@/hooks/useMinistries";
import {
  fetchMinisterByName,
  fetchMpByName,
  fetchRepresentatives,
  toFriendlyError,
} from "@/lib/api";
import {
  GEOLOCATION_COPY,
  GeolocationError,
  requestPosition,
} from "@/lib/geolocation";
import { rankOf } from "@/lib/ministries";

const RANK_ORDER = {
  "Prime Minister": 0,
  "Cabinet Minister": 1,
  "MoS (Independent Charge)": 2,
  "Minister of State": 3,
};

/**
 * Reads the incoming query string once. `?share=mp&lat=&lng=` opens the MP
 * page for those coordinates without prompting for location again;
 * `?share=minister&name=` seeds the pending minister name so we can pick
 * their entry once the ministries list loads.
 */
function readDeepLink() {
  if (typeof window === "undefined") return { coords: null, ministerName: null };
  const params = new URLSearchParams(window.location.search);
  const share = params.get("share");
  if (share === "mp") {
    const lat = parseFloat(params.get("lat"));
    const lng = parseFloat(params.get("lng"));
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { coords: { latitude: lat, longitude: lng }, ministerName: null };
    }
  } else if (share === "minister") {
    return { coords: null, ministerName: params.get("name") };
  }
  return { coords: null, ministerName: null };
}

export default function Home() {
  const [coords, setCoords] = useState(() => readDeepLink().coords);
  const [geoError, setGeoError] = useState(null);
  const [isLocating, setIsLocating] = useState(false);
  const [openSheet, setOpenSheet] = useState(null); // "info" | "leaderboard" | "search" | null
  const [selectedMinistry, setSelectedMinistry] = useState(null);
  // Set when a leaderboard row is tapped — a fully-fetched subject that
  // overrides whatever else is on screen until the user backs out of it.
  const [leaderboardSubject, setLeaderboardSubject] = useState(null);
  const [pendingTopperKey, setPendingTopperKey] = useState(null);
  const [lastChoice, setLastChoice] = useState(null); // "slap" | "rose" | null — drives the share copy and CTA highlight
  const [toast, setToast] = useState(null);
  const [pendingMinisterName, setPendingMinisterName] = useState(
    () => readDeepLink().ministerName,
  );

  // Ministries are pre-fetched here (not only when the Search sheet opens) so
  // deep links can resolve a shared minister on first render.
  const { entries: ministryEntries } = useMinistries();

  // Once ministries load, match a pending deep-linked minister name to an
  // entry and swap the card. Runs during render — React batches the paired
  // setStates into the same commit.
  if (pendingMinisterName && ministryEntries.length > 0) {
    const target = pendingMinisterName.toLowerCase();
    const entry = ministryEntries.find(
      (e) => e.minister.minister_name?.toLowerCase() === target,
    );
    if (entry) {
      setSelectedMinistry(entry);
      setPendingMinisterName(null);
    } else {
      setPendingMinisterName(null);
    }
  }

  const {
    data,
    isPending: isLoadingSeats,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["representatives", coords?.latitude, coords?.longitude],
    queryFn: () => fetchRepresentatives(coords),
    enabled: coords !== null,
  });

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

  const subject =
    leaderboardSubject ?? buildSubject(selectedMinistry, data?.mp, ministryEntries);

  const subjectKey = subject
    ? `${subject.tier}:${subject.tier === "minister" ? subject.ministry + "|" + subject.name : subject.constituency_key + "|" + subject.name}`
    : "none";

  const closeSheet = useCallback(() => setOpenSheet(null), []);

  const showToast = useCallback((message) => {
    setToast(message);
    setTimeout(() => setToast(null), 2200);
  }, []);

  /**
   * Opens a leaderboard row as a full profile, reusing the same
   * `RepresentativeCard` the home MP/minister uses — no separate modal or
   * simplified view. Only one lookup runs at a time; a second tap while one
   * is in flight is a no-op rather than racing two fetches.
   */
  const handleSelectTopper = useCallback(
    async (tier, topper) => {
      if (pendingTopperKey) return;

      const toppedName = tier === "minister" ? topper.minister_name : topper.name;
      const key = `${tier}:${toppedName}`;
      setPendingTopperKey(key);

      try {
        if (tier === "mp") {
          const details = await fetchMpByName({
            name: topper.name,
            constituencyKey: topper.constituency_key,
          });
          if (!details) throw new Error("MP not found");
          setLeaderboardSubject({
            tier: "mp",
            ...details,
            designation: findMpDesignation(details.name, ministryEntries),
          });
        } else {
          const details = await fetchMinisterByName({
            name: topper.minister_name,
            ministry: topper.ministry,
          });
          if (!details) throw new Error("Minister not found");
          const firstFragment = String(details.ministry ?? "")
            .split(";")[0]
            .trim();
          setLeaderboardSubject({
            tier: "minister",
            name: details.minister_name,
            minister_name: details.minister_name,
            party: details.party,
            photo_url: details.photo_url,
            slap_count: details.slap_count,
            rose_count: details.rose_count,
            points: details.manifesto_points,
            manifesto_points: details.manifesto_points,
            ministry: details.ministry,
            portfolio: firstFragment,
            rank_title: rankOf(firstFragment),
            designation: firstFragment,
          });
        }
        setOpenSheet(null);
      } catch {
        showToast("Couldn't load their profile. Try again?");
      } finally {
        setPendingTopperKey(null);
      }
    },
    [pendingTopperKey, ministryEntries, showToast],
  );

  const handleBackFromLeaderboardProfile = useCallback(() => {
    setLeaderboardSubject(null);
  }, []);

  const handleShare = useCallback(
    async (currentChoice) => {
      if (!subject || typeof window === "undefined") return;
      // A leaderboard-navigated MP isn't the one `coords` points at — sharing
      // the home location here would silently send the recipient to the
      // wrong person, so it's withheld rather than reused.
      const url = buildShareUrl(subject, leaderboardSubject ? null : coords);
      const text = buildShareMessage(subject, currentChoice);

      try {
        if (navigator.share) {
          await navigator.share({ title: "Slap Your Leader", text, url });
          return;
        }
      } catch {
        /* user cancelled the native sheet — fall through to clipboard */
      }
      try {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        showToast("Link copied — paste it anywhere.");
      } catch {
        showToast("Couldn't copy the link. Try again?");
      }
    },
    [subject, coords, showToast],
  );

  // The lightweight reward beat after a vote commits — separate from the
  // in-flight "winding" banner, which clears before the tally ever lands.
  const handleVoteCast = useCallback(
    (next) => {
      setLastChoice(next);
      showToast(
        next === "slap"
          ? "👋 Another slap recorded."
          : "🌹 One more rose added.",
      );
    },
    [showToast],
  );

  const stage = resolveStage({
    geoError,
    isLocating,
    coords,
    isLoadingSeats,
    isError,
    hasSubject: Boolean(subject),
  });

  return (
    <main className="flex min-h-dvh flex-col">
      {stage === "landing" && (
        <div className="flex flex-1 items-center">
          <Landing onAllowLocation={handleAllowLocation} isBusy={isLocating} />
        </div>
      )}

      {stage === "locating" && (
        <LocatingScreen
          label="Locating your constituency"
          detail="Matching your coordinates against parliamentary boundaries."
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

      {stage === "results" && subject && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25, ease: [0.2, 0, 0, 1] }}
          className="mx-auto w-full max-w-3xl px-5 pt-6 pb-10 sm:px-8 sm:pt-8 sm:pb-14"
        >
          <ResultsHeader
            subject={subject}
            isMinister={subject.tier === "minister"}
            isViewingOther={Boolean(leaderboardSubject)}
            onResetToMp={
              leaderboardSubject
                ? handleBackFromLeaderboardProfile
                : subject.tier === "minister"
                  ? () => setSelectedMinistry(null)
                  : null
            }
            backLabel={leaderboardSubject ? "← Back" : "← Back to your MP"}
            onOpenLeaderboard={() => setOpenSheet("leaderboard")}
          />

          <RepresentativeCard
            key={subjectKey}
            subject={subject}
            keySeed={subjectKey}
            onOpenInfo={() => setOpenSheet("info")}
            onShare={() => handleShare(lastChoice)}
            onFirstVote={handleVoteCast}
          />

          <InfoSheet
            open={openSheet === "info"}
            onClose={closeSheet}
            subject={subject}
          />
          <LeaderboardSheet
            open={openSheet === "leaderboard"}
            onClose={closeSheet}
            tier={subject.tier}
            currentIdentity={subject.name}
            onSelectTopper={handleSelectTopper}
            pendingKey={pendingTopperKey}
          />
          <SearchSheet
            open={openSheet === "search"}
            onClose={closeSheet}
            selected={selectedMinistry}
            onSelect={(entry) => {
              setLeaderboardSubject(null);
              setSelectedMinistry(entry);
            }}
          />

          <Toast message={toast} />

          <FloatingSearchButton onClick={() => setOpenSheet("search")} />
        </motion.div>
      )}
    </main>
  );
}

/**
 * The nameplate look: rectangular rather than a full pill, a muted brass
 * hairline border with a second inset line just inside it (the classic
 * engraved-plaque double rule), and a faint top-to-bottom gradient for a
 * touch of dimension. Deliberately no extra glyphs or corner flourishes —
 * the double border already reads as "plaque" without adding clutter.
 */
const NAMEPLATE_CLASS =
  "relative inline-flex items-center gap-1.5 rounded-[10px] border border-[#c9a869]/50 bg-gradient-to-b from-white to-[#faf3e6] px-4 py-2 text-[11px] leading-none font-medium tracking-[0.14em] text-ink uppercase shadow-card";

function NameplateBorder() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-[3px] rounded-[7px] border border-[#c9a869]/25"
    />
  );
}

function ResultsHeader({
  subject,
  isMinister,
  isViewingOther = false,
  onResetToMp,
  backLabel = "← Back to your MP",
  onOpenLeaderboard,
}) {
  // Viewing someone else via the leaderboard always shows the back button in
  // this slot instead — the constituency badge would otherwise displace it
  // whenever the tapped row happens to be another MP.
  const location =
    isMinister || isViewingOther ? null : titleCase(subject.constituency ?? "");

  return (
    <motion.header
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.2, 0, 0, 1] }}
      className="mb-6 sm:mb-8"
    >
      {/* Global top bar: location on the left, Leaderboard as a screen-level
          action on the right — not tucked inside the card below. */}
      <div className="flex items-center justify-between gap-3">
        {location ? (
          <span className={NAMEPLATE_CLASS}>
            <NameplateBorder />
            <span className="relative">{location}</span>
          </span>
        ) : onResetToMp ? (
          <button
            type="button"
            onClick={onResetToMp}
            className={`${NAMEPLATE_CLASS} text-muted transition-colors hover:text-ink`}
          >
            <NameplateBorder />
            <span className="relative">{backLabel}</span>
          </button>
        ) : (
          <span aria-hidden />
        )}

        <motion.button
          type="button"
          onClick={onOpenLeaderboard}
          whileHover={{ y: -1 }}
          whileTap={{ y: 1, scale: 0.96 }}
          transition={{ duration: 0.15, ease: [0.2, 0, 0, 1] }}
          className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-xs font-semibold tracking-[0.05em] text-paper uppercase shadow-card transition-colors hover:bg-slap"
        >
          <Trophy className="size-3.5" strokeWidth={2} />
          Leaderboard
        </motion.button>
      </div>

      <div className="text-center">
        <h1 className="mt-6 font-serif text-3xl leading-[1.05] text-balance sm:text-4xl">
          {isMinister ? (
            <>
              They serve <span className="text-laurel">the country</span>.{" "}
              <span className="text-slap">Judge</span> the service.
            </>
          ) : (
            <>
              They work for <span className="text-laurel">you</span>.{" "}
              <span className="text-slap">Judge</span> the work.
            </>
          )}
        </h1>

        <div className="mt-4">
          <Ornament />
        </div>

        <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-muted text-pretty">
          Read their record. Then slap or rose them.
        </p>
      </div>
    </motion.header>
  );
}

/**
 * Always-visible floating entry point into the Search sheet — discoverable
 * from the moment a subject is on screen, not just after a vote. Filled dark
 * so it reads as a primary action against the paper background (the earlier
 * quiet/outline treatment blended in too much to notice), with a slow
 * breathing glow so it stays noticeable without competing for attention the
 * way Share's faster reward pulse does once a vote lands. The helper label
 * teaches the gesture once per visit, then gets out of the way.
 */
function FloatingSearchButton({ onClick }) {
  const [showHint, setShowHint] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShowHint(false), 9000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="fixed right-5 bottom-6 z-30 flex items-center gap-2.5 sm:right-8">
      <AnimatePresence>
        {showHint && (
          <motion.span
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            transition={{ duration: 0.25, ease: [0.2, 0, 0, 1] }}
            className="hidden rounded-full border border-rule bg-surface px-3.5 py-2 text-xs font-medium text-ink shadow-card sm:inline-block"
          >
            Search any minister
          </motion.span>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        onClick={() => {
          setShowHint(false);
          onClick();
        }}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{
          opacity: 1,
          scale: [1, 1.05, 1],
          boxShadow: [
            "0 0 0 0 rgb(47 107 74 / 0)",
            "0 0 0 10px rgb(47 107 74 / 0.14)",
            "0 0 0 0 rgb(47 107 74 / 0)",
          ],
        }}
        transition={{
          opacity: { duration: 0.3, ease: [0.2, 0, 0, 1] },
          scale: { duration: 2.8, repeat: Infinity, ease: "easeInOut", delay: 1 },
          boxShadow: { duration: 2.8, repeat: Infinity, ease: "easeInOut", delay: 1 },
        }}
        whileHover={{ scale: 1.08, y: -2 }}
        whileTap={{ scale: 0.95 }}
        aria-label="Search another MP or Minister"
        className="flex size-16 items-center justify-center rounded-full bg-ink text-paper shadow-lift transition-colors hover:bg-laurel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <Search className="size-6" strokeWidth={2.25} />
      </motion.button>
    </div>
  );
}

function Toast({ message }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          role="status"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-rule bg-ink px-4 py-2 text-sm text-paper shadow-lift"
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * The shared text always names the exact action taken — never generic
 * "rated" language, since the product is an explicit Slap/Rose choice, not a
 * rating scale.
 */
function buildShareMessage(subject, currentChoice) {
  if (currentChoice === "slap") {
    return `I slapped ${subject.name}. 👋 Now it's your turn.`;
  }
  if (currentChoice === "rose") {
    return `I gave ${subject.name} a 🌹. What's your verdict?`;
  }
  return `Slap or Rose ${subject.name}? Decide for yourself.`;
}

function buildShareUrl(subject, coords) {
  if (typeof window === "undefined") return "";
  const origin = window.location.origin;
  const params = new URLSearchParams({ share: subject.tier });
  if (subject.tier === "mp" && coords) {
    params.set("lat", String(coords.latitude));
    params.set("lng", String(coords.longitude));
  } else if (subject.tier === "minister") {
    params.set("name", subject.name);
  }
  return `${origin}/?${params.toString()}`;
}

/**
 * An MP's own record has no ministry field — most aren't in the union
 * council at all. Cross-referencing the already-fetched ministries list by
 * name (client-side, no backend change) tells us the ones who are, using
 * each fragment's raw portfolio text ("Minister of Housing and Urban
 * Affairs") rather than the cleaned search label. The PM's row carries many
 * fragments from a long prose blob, so that case just says "Prime Minister"
 * instead of joining all of them into a wall of text.
 */
function findMpDesignation(mpName, ministryEntries) {
  const fallback = "Member of Parliament";
  if (!mpName || !ministryEntries?.length) return fallback;

  const target = mpName.toLowerCase();
  const matches = ministryEntries.filter(
    (entry) => entry.minister.minister_name?.toLowerCase() === target,
  );
  if (matches.length === 0) return fallback;
  if (matches[0].rank === "Prime Minister") return "Prime Minister";
  return matches.map((entry) => entry.portfolio).join(" & ");
}

function buildSubject(selectedMinistry, mp, ministryEntries) {
  if (selectedMinistry) {
    const entry = selectedMinistry;
    const m = entry.minister;
    return {
      tier: "minister",
      name: m.minister_name,
      minister_name: m.minister_name,
      party: m.party,
      photo_url: m.photo_url,
      slap_count: m.slap_count,
      rose_count: m.rose_count,
      points: m.manifesto_points,
      manifesto_points: m.manifesto_points,
      ministry: entry.ministry,
      portfolio: entry.portfolio || entry.label,
      rank_title: entry.rank,
      designation: entry.portfolio || entry.label,
    };
  }
  if (mp) {
    return {
      tier: "mp",
      ...mp,
      isHome: true,
      designation: findMpDesignation(mp.name, ministryEntries),
    };
  }
  return null;
}

function titleCase(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/(?:^|[\s-])\S/g, (character) => character.toUpperCase());
}

// Silence unused warning if RANK_ORDER isn't referenced.
void RANK_ORDER;

function resolveStage({
  geoError,
  isLocating,
  coords,
  isLoadingSeats,
  isError,
  hasSubject,
}) {
  // A resolved subject wins outright: a minister deep link isn't
  // location-derived, so it must reach the card without ever waiting on
  // (or requiring) `coords`.
  if (hasSubject) return "results";
  if (geoError) return "geo-error";
  if (isLocating) return "locating";
  if (!coords) return "landing";
  if (isLoadingSeats) return "locating";
  if (isError) return "fetch-error";
  return "empty";
}
