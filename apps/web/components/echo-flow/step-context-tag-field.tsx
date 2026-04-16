"use client";

import { useCallback, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";

import { cn } from "@/lib/utils";

const TAG_STYLES = [
  "bg-violet-100 text-violet-900 border-violet-200/90",
  "bg-sky-100 text-sky-900 border-sky-200/90",
  "bg-emerald-100 text-emerald-900 border-emerald-200/90",
  "bg-amber-100 text-amber-900 border-amber-200/90",
  "bg-rose-100 text-rose-900 border-rose-200/90",
];

function parseTags(raw: string): string[] {
  return raw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function serializeTags(tags: string[]): string {
  return tags.join("\n");
}

export type StepContextTagFieldProps = {
  value: string;
  onChange: (serialized: string) => void;
  disabled?: boolean;
  /** Empty-state hint inside the input row */
  inputPlaceholder?: string;
};

/**
 * Chat-style context: type a line, Enter or + adds a colored tag; each tag has a remove control.
 * Serialized to the step `context` field as newline-separated lines.
 */
export function StepContextTagField({
  value,
  onChange,
  disabled,
  inputPlaceholder = "Add a note, then Enter or +",
}: StepContextTagFieldProps) {
  const tags = useMemo(() => parseTags(value), [value]);
  const [draft, setDraft] = useState("");

  const commitDraft = useCallback(() => {
    const t = draft.trim();
    if (!t) return;
    onChange(serializeTags([...tags, t]));
    setDraft("");
  }, [draft, tags, onChange]);

  const removeAt = useCallback(
    (i: number) => {
      onChange(serializeTags(tags.filter((_, j) => j !== i)));
    },
    [tags, onChange],
  );

  return (
    <div
      className={cn(
        "flex min-h-[44px] flex-wrap items-center gap-1.5 rounded-xl border border-[#150A35]/12 bg-white px-2 py-1.5 shadow-sm focus-within:ring-2 focus-within:ring-[#A577FF]/30",
        disabled && "pointer-events-none opacity-65",
      )}
    >
      {tags.map((tag, i) => (
        <span
          key={`ctx-tag-${i}`}
          className={cn(
            "inline-flex max-w-[min(100%,18rem)] items-center gap-0.5 rounded-full border px-2 py-0.5 text-xs font-medium",
            TAG_STYLES[i % TAG_STYLES.length],
          )}
        >
          <span className="min-w-0 truncate" title={tag}>
            {tag}
          </span>
          {!disabled && (
            <button
              type="button"
              className="shrink-0 rounded-full p-0.5 text-current hover:bg-black/10"
              onClick={() => removeAt(i)}
              aria-label={`Remove “${tag.slice(0, 48)}”`}
            >
              <X className="h-3 w-3" strokeWidth={2} />
            </button>
          )}
        </span>
      ))}
      <div className="flex min-h-[32px] min-w-[6rem] flex-1 items-center gap-0.5">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitDraft();
            }
            if (e.key === "Backspace" && draft === "" && tags.length > 0) {
              removeAt(tags.length - 1);
            }
          }}
          placeholder={tags.length === 0 ? inputPlaceholder : "Add another…"}
          className="min-w-0 flex-1 border-0 bg-transparent py-1.5 text-sm text-[#150A35] outline-none placeholder:text-[#150A35]/40"
          disabled={disabled}
          aria-label="Context note"
        />
        <button
          type="button"
          className="inline-flex shrink-0 rounded-lg p-2 text-[#A577FF] transition-colors hover:bg-[#A577FF]/12 disabled:opacity-35"
          onClick={commitDraft}
          disabled={disabled || !draft.trim()}
          aria-label="Add note"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
