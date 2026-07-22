"use client";

import { BottomSheet } from "./BottomSheet";
import { MinistryCombobox } from "./MinistryCombobox";
import { useMinistries } from "@/hooks/useMinistries";
import { toFriendlyError } from "@/lib/api";

/**
 * The Search bottom sheet — the ministry picker moved into a modal so the
 * main screen stays focused on the current representative.
 */
export function SearchSheet({ open, onClose, onSelect, selected }) {
  const { entries, ministryCount, isPending, isError, error } = useMinistries();

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Search"
      size="tall"
      autoFocus
      subtitle={
        ministryCount
          ? `Any of ${ministryCount} ministries in the union council`
          : "The union council of ministers"
      }
    >
      {isPending && (
        <div className="rounded-control border border-rule px-4 py-3 text-sm text-muted">
          Loading the council…
        </div>
      )}

      {isError && (
        <div
          role="alert"
          className="rounded-control border border-rule px-4 py-3 text-sm text-slap"
        >
          {toFriendlyError(error)}
        </div>
      )}

      {!isPending && !isError && (
        <MinistryCombobox
          entries={entries}
          selected={selected}
          onSelect={(entry) => {
            onSelect(entry);
            onClose();
          }}
          onClear={() => onSelect(null)}
        />
      )}

      <p className="mt-6 text-xs text-muted">
        Pick a ministry to swap the card to that minister. Your MP stays a tap
        away.
      </p>
    </BottomSheet>
  );
}
