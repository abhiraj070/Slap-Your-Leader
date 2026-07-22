"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";

import { highlight, searchMinistries } from "@/lib/ministries";

/**
 * Searchable ministry picker, following the ARIA combobox pattern:
 * `aria-expanded` / `aria-controls` / `aria-activedescendant` on the input,
 * with a listbox of options. Arrow keys move, Enter selects, Escape dismisses.
 *
 * Filtering is local over ~119 entries, so results update on every keystroke
 * with no network and no debounce needed.
 */
export function MinistryCombobox({ entries, selected, onSelect, onClear }) {
  const listboxId = useId();
  const optionId = (index) => `${listboxId}-opt-${index}`;

  // `draft` is null until the user types, so an outside selection (a quick-pick
  // chip) still shows in the field. The displayed value is derived from both.
  const [draft, setDraft] = useState(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const value = draft ?? selected?.label ?? "";
  // Not typing means no filter: show the whole list rather than the single
  // entry that happens to match the current selection's own label.
  const effectiveQuery = draft ?? "";

  const results = useMemo(
    () => searchMinistries(entries, effectiveQuery),
    [entries, effectiveQuery],
  );

  // Derived rather than corrected in an effect: when the query narrows the
  // list, a stale index would point past the end and Enter would select
  // nothing. `activeIndex` is reset to 0 wherever the query changes.
  const active = results.length > 0 ? Math.min(activeIndex, results.length - 1) : 0;

  // Keep the active option in view during keyboard navigation.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector(`#${CSS.escape(optionId(active))}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, active]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = useCallback(() => {
    setOpen(false);
    setDraft(null);
  }, []);

  // Dismiss on any pointer press outside the whole control.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, close]);

  const commit = useCallback(
    (entry) => {
      if (!entry) return;
      onSelect(entry);
      setDraft(null);
      setOpen(false);
      inputRef.current?.blur();
    },
    [onSelect],
  );

  function handleKeyDown(event) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (results.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((index) => {
        const from = Math.min(index, results.length - 1);
        return (from + step + results.length) % results.length;
      });
      return;
    }

    if (event.key === "Home" || event.key === "End") {
      if (!open || results.length === 0) return;
      event.preventDefault();
      setActiveIndex(event.key === "Home" ? 0 : results.length - 1);
      return;
    }

    if (event.key === "Enter") {
      if (!open) return;
      event.preventDefault();
      commit(results[active]);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }

    if (event.key === "Tab" && open) close();
  }

  const showClear = Boolean(selected);

  return (
    <div ref={rootRef} className="relative">
      <div
        className={`flex items-center gap-2.5 rounded-control border bg-surface px-3.5 transition-colors ${
          open ? "border-ink" : "border-rule"
        }`}
      >
        <Search className="size-4 shrink-0 text-muted" strokeWidth={2} />

        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && results.length > 0 ? optionId(active) : undefined
          }
          aria-label="Search a ministry or a minister"
          autoComplete="off"
          spellCheck={false}
          placeholder="Search a ministry or a minister"
          value={value}
          onChange={(event) => {
            setDraft(event.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onFocus={(event) => {
            setOpen(true);
            event.target.select();
          }}
          onKeyDown={handleKeyDown}
          className="w-full bg-transparent py-2.5 text-sm text-ink outline-none placeholder:text-muted"
        />

        {showClear ? (
          <button
            type="button"
            onClick={() => {
              onClear();
              setDraft(null);
              setOpen(false);
            }}
            aria-label="Clear selected ministry"
            className="shrink-0 rounded-full p-1 text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <X className="size-4" strokeWidth={2} />
          </button>
        ) : (
          <span className="shrink-0 text-[11px] whitespace-nowrap text-faint">
            {open && effectiveQuery
              ? `${results.length} of ${entries.length}`
              : `${entries.length} portfolios`}
          </span>
        )}
      </div>

      {open && (
        <div className="absolute inset-x-0 top-full z-20 mt-1.5 overflow-hidden rounded-control border border-rule bg-surface shadow-card">
          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-label="Ministries"
            className="max-h-72 overflow-y-auto"
          >
            {results.map((entry, index) => (
              <Option
                key={entry.id}
                id={optionId(index)}
                entry={entry}
                query={effectiveQuery}
                active={index === active}
                selected={selected?.id === entry.id}
                onPick={() => commit(entry)}
                onHover={() => setActiveIndex(index)}
              />
            ))}

            {results.length === 0 && (
              <li className="px-3.5 py-6 text-center text-sm text-muted">
                No ministry or minister matches “{effectiveQuery}”.
              </li>
            )}
          </ul>

          {results.length > 0 && (
            <p className="border-t border-rule px-3.5 py-2 text-[11px] text-faint">
              ↑ ↓ to move · ↵ to select · esc to dismiss
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Option({ id, entry, query, active, selected, onPick, onHover }) {
  return (
    <li
      id={id}
      role="option"
      aria-selected={selected}
      // Pointer, not click: the outside-press listener fires on pointerdown,
      // and a plain onClick would lose the race and close before selecting.
      onPointerDown={(event) => {
        event.preventDefault();
        onPick();
      }}
      onMouseMove={onHover}
      className={`cursor-pointer border-b border-rule px-3.5 py-2.5 last:border-b-0 ${
        active ? "bg-paper" : ""
      }`}
    >
      <div className="flex items-baseline gap-3">
        <span className="min-w-0 flex-1 truncate text-sm text-ink">
          <Marked runs={highlight(entry.label, query)} />
        </span>
        <span className="shrink-0 text-[11px] whitespace-nowrap text-muted">
          {entry.rank}
        </span>
      </div>
      <p className="mt-0.5 truncate text-xs text-muted">
        <Marked runs={highlight(entry.minister.minister_name, query)} />
        {entry.minister.party ? ` · ${entry.minister.party}` : ""}
      </p>
    </li>
  );
}

/** Underlines the matched prefix rather than colouring it — quieter. */
function Marked({ runs }) {
  return runs.map((run, index) =>
    run.match ? (
      <mark
        key={index}
        className="bg-transparent font-medium text-ink underline decoration-ink/30 underline-offset-2"
      >
        {run.text}
      </mark>
    ) : (
      <span key={index}>{run.text}</span>
    ),
  );
}
