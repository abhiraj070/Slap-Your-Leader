"use client";

import { BottomSheet } from "./BottomSheet";
import { Leaderboard } from "./Leaderboard";

export function LeaderboardSheet({
  open,
  onClose,
  tier,
  currentIdentity,
  onSelectTopper,
  pendingKey,
}) {
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Leaderboard"
      subtitle="How they stack up nationally"
    >
      <Leaderboard
        defaultTier={tier}
        highlightName={currentIdentity}
        onSelectTopper={onSelectTopper}
        pendingKey={pendingKey}
      />
    </BottomSheet>
  );
}
