"use client";

import * as React from "react";
import { IconSearch } from "@tabler/icons-react";

import { cn } from "@/lib/utils";
import { GradientIconWell } from "@/components/ui/gradient-icon-well";
import { Input } from "@/components/ui/input";

/** Dropdown panel for contextual search (see DESIGN_SYSTEM — Echo contextual search). */
export const ECHO_SEARCH_SUGGEST_PANEL_CLASS =
  "absolute left-0 right-0 top-full z-[200] mt-1 max-h-72 overflow-auto rounded-lg border border-border bg-card py-1 shadow-lg";

/** Empty state panel (query with no matches). */
export const ECHO_SEARCH_SUGGEST_EMPTY_CLASS =
  "absolute left-0 right-0 top-full z-[200] mt-1 rounded-lg border border-border bg-card px-3 py-4 text-center text-sm text-muted-foreground shadow-lg";

export function echoSearchSuggestRowClass(active: boolean) {
  return cn(
    "flex w-full flex-row items-center gap-3 px-3 py-2.5 text-left text-sm",
    active ? "bg-muted" : "hover:bg-muted/70",
  );
}

export type EchoSearchSuggestion = {
  id: string;
  label: string;
  subtitle?: string;
  icon?: React.ReactNode;
};

type EchoSearchWithSuggestionsProps = {
  items: EchoSearchSuggestion[];
  onSelect: (item: EchoSearchSuggestion) => void;
  placeholder?: string;
  emptyText?: string;
  className?: string;
  inputClassName?: string;
  /** For global shortcuts (e.g. ⌘K) */
  inputId?: string;
  /** Keep parent list filters in sync (e.g. integrations grid). */
  onQueryChange?: (query: string) => void;
  /** Stack icon above label and center (e.g. add-step picker). */
  centerSuggestions?: boolean;
  "aria-label"?: string;
};

/**
 * Search with live dropdown suggestions as the user types (project-wide pattern).
 * Keyboard: ArrowUp/ArrowDown to move, Enter to select, Escape to close.
 */
export function EchoSearchWithSuggestions({
  items,
  onSelect,
  placeholder = "Search…",
  emptyText = "No results.",
  className,
  inputClassName,
  inputId,
  onQueryChange,
  centerSuggestions = false,
  "aria-label": ariaLabel = "Search",
}: EchoSearchWithSuggestionsProps) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const listBaseId = React.useId().replace(/:/g, "");

  const filtered = React.useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter(
      (i) =>
        i.label.toLowerCase().includes(s) ||
        i.subtitle?.toLowerCase().includes(s) ||
        i.id.toLowerCase().includes(s),
    );
  }, [items, q]);

  const itemsIdentity = React.useMemo(() => items.map((i) => i.id).join("\0"), [items]);

  React.useEffect(() => {
    setActiveIndex(-1);
  }, [q, itemsIdentity]);

  React.useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const el = rootRef.current;
      if (el && !el.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown, true);
    return () => document.removeEventListener("mousedown", onDocMouseDown, true);
  }, [open]);

  const pick = React.useCallback(
    (item: EchoSearchSuggestion) => {
      onSelect(item);
      setQ("");
      setOpen(false);
      setActiveIndex(-1);
    },
    [onSelect],
  );

  const activeDescendantId =
    open && activeIndex >= 0 && filtered[activeIndex]
      ? `${listBaseId}-opt-${activeIndex}`
      : undefined;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <div className="relative">
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={inputId}
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={`${listBaseId}-listbox`}
          aria-activedescendant={activeDescendantId}
          value={q}
          onChange={(e) => {
            const v = e.target.value;
            setQ(v);
            onQueryChange?.(v);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              setActiveIndex(-1);
              return;
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              if (filtered.length === 0) return;
              setActiveIndex((i) => (i < 0 ? 0 : (i + 1) % filtered.length));
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setOpen(true);
              if (filtered.length === 0) return;
              setActiveIndex((i) =>
                i < 0 ? filtered.length - 1 : (i - 1 + filtered.length) % filtered.length,
              );
              return;
            }
            if (e.key === "Enter") {
              if (open && activeIndex >= 0 && filtered[activeIndex]) {
                e.preventDefault();
                pick(filtered[activeIndex]);
              }
            }
          }}
          placeholder={placeholder}
          aria-label={ariaLabel}
          className={cn(
            "border-border bg-card dark:bg-card pl-9 pr-3 text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:ring-ring/40",
            inputClassName,
          )}
        />
      </div>
      {open && filtered.length > 0 ? (
        <ul id={`${listBaseId}-listbox`} className={ECHO_SEARCH_SUGGEST_PANEL_CLASS} role="listbox">
          {filtered.map((item, idx) => (
            <li
              key={item.id}
              id={`${listBaseId}-opt-${idx}`}
              role="option"
              aria-selected={activeIndex === idx}
            >
              <button
                type="button"
                className={echoSearchSuggestRowClass(activeIndex === idx)}
                onMouseEnter={() => setActiveIndex(idx)}
                onMouseDown={(ev) => ev.preventDefault()}
                onClick={() => pick(item)}
              >
                {item.icon ? (
                  <GradientIconWell
                    corners="lg"
                    className={cn("shrink-0", centerSuggestions ? "h-9 w-9" : "h-8 w-8")}
                  >
                    {item.icon}
                  </GradientIconWell>
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-foreground">{item.label}</div>
                  {item.subtitle ? (
                    <div className="text-xs text-muted-foreground">{item.subtitle}</div>
                  ) : null}
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {open && q.trim() && filtered.length === 0 ? (
        <div className={ECHO_SEARCH_SUGGEST_EMPTY_CLASS} role="status">
          {emptyText}
        </div>
      ) : null}
    </div>
  );
}
