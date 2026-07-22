"use client";

import { BottomSheet } from "./BottomSheet";
import { Leaderboard } from "./Leaderboard";

const TITLES = {
  mp: { title: "Leaderboard", subtitle: "How MPs stack up nationally" },
  minister: {
    title: "Leaderboard",
    subtitle: "How ministers stack up nationally",
  },
};

export function LeaderboardSheet({ open, onClose, tier, currentIdentity }) {
  const copy = TITLES[tier] ?? TITLES.mp;
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={copy.title}
      subtitle={copy.subtitle}
    >
      <Leaderboard
        tier={tier}
        forceEnabled
        highlightName={currentIdentity}
        chromeless
      />
    </BottomSheet>
  );
}
