/**
 * Identity for a votable subject.
 *
 * Votes are deliberately **not persisted**. A reload gives you both buttons
 * back — the lock only lasts as long as the card is mounted. Nothing is written
 * to localStorage, so there's no client-side record of how anyone voted.
 * (The server has no identity check either, so persistence never bought real
 * one-vote-per-person enforcement anyway — it only got in the user's way.)
 *
 * This key is still needed for React reconciliation: the pager keys pages by it
 * so looking up a new location remounts the card instead of reusing its state.
 */
export function voteKey(tier, subject) {
  const scope = subject.constituency_key ?? subject.ministry ?? "";
  const name = subject.name ?? subject.minister_name ?? "";
  return `${tier}:${scope}:${name}`;
}
