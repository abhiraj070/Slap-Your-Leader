"use client";

import { useState } from "react";

/** "Pankaj Chaudhary" -> "PC". Falls back to a single glyph. */
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
 * Rectangular 3:4 portrait with a serif monogram fallback.
 *
 * Deliberately a plain <img> rather than next/image: `photo_url` is scraped
 * from upload.wikimedia.org, myneta.info and sansad.in, so the host set isn't
 * fixed enough to allowlist. `no-referrer` matters because MyNeta and
 * sansad.in refuse hotlinked requests that carry an outside Referer.
 */
export function Portrait({ src, name, className = "" }) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  return (
    <div
      className={`aspect-[3/4] shrink-0 overflow-hidden rounded-photo border border-rule bg-paper ${className}`}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- see note above
        <img
          src={src}
          alt={`Portrait of ${name}`}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="size-full object-cover object-top"
        />
      ) : (
        <span
          aria-hidden
          className="flex size-full items-center justify-center font-serif text-3xl text-faint"
        >
          {monogramOf(name)}
        </span>
      )}
    </div>
  );
}
