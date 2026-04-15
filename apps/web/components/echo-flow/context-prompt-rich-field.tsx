"use client";

import {
  forwardRef,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { IconPaperclip, IconPhoto, IconVideo } from "@tabler/icons-react";

import type {
  ContextAttachment,
  ContextAttachmentKind,
} from "@/lib/workflow-step-context-attachments";
import {
  canonicalTokenForRef,
  friendlyLabelForAttachment,
  migratePromptTokensToCanonical,
} from "@/lib/context-prompt-tokens";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const CHIP_ICON_CLASS = "inline-block h-3 w-3 shrink-0 align-[-0.15em] text-[#150A35]";

function chipKindIconMarkup(kind: ContextAttachmentKind): string {
  const common = { size: 12, stroke: 2, className: CHIP_ICON_CLASS, "aria-hidden": true as const };
  if (kind === "image") return renderToStaticMarkup(<IconPhoto {...common} />);
  if (kind === "video") return renderToStaticMarkup(<IconVideo {...common} />);
  return renderToStaticMarkup(<IconPaperclip {...common} />);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Matches {@link GradientIconTag} — Cyan→Lavender ring + card inner (inline in contenteditable HTML). */
const GRADIENT_CHIP_OUTER =
  "echo-ctx-chip inline-flex max-w-[min(100%,14rem)] cursor-default select-none items-center align-middle rounded-full p-px shadow-sm bg-[linear-gradient(to_right,var(--echo-icon-well-from),var(--echo-icon-well-to))]";
const GRADIENT_CHIP_INNER =
  "inline-flex min-w-0 max-w-full items-center gap-0.5 overflow-hidden rounded-full bg-card py-px pl-1 pr-px text-[11px] font-semibold leading-none text-[#150A35]";

function buildHtml(prompt: string, attachments: ContextAttachment[]): string {
  const migrated = migratePromptTokensToCanonical(prompt).replace(/\r\n/g, "\n");
  if (!migrated.trim()) return "";

  const byRef = new Map(attachments.map((a) => [(a.ref_label ?? "c1").toLowerCase(), a]));

  let html = "";
  let last = 0;
  const re = /\{\{c(\d+)\}\}/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(migrated)) !== null) {
    if (m.index > last) {
      const text = migrated.slice(last, m.index);
      html += escapeHtml(text).replace(/\n/g, "<br />");
    }
    const id = `c${m[1]}`;
    const att = byRef.get(id.toLowerCase());
    if (att) {
      const { label, kind } = friendlyLabelForAttachment(att, attachments);
      const dismiss = `<button type="button" tabindex="-1" contenteditable="false" data-echo-ctx-remove="${escapeHtml(id)}" aria-label="Remove ${escapeHtml(label)} from prompt" class="echo-ctx-chip-dismiss inline-flex h-3 w-3 min-h-3 min-w-3 shrink-0 items-center justify-center rounded-full pb-px text-[9px] font-medium leading-none text-[#150A35]/45 transition hover:bg-[#150A35]/12 hover:text-[#150A35]">×</button>`;
      html += `<span data-echo-ctx="${escapeHtml(id)}" contenteditable="false" class="${GRADIENT_CHIP_OUTER}"><span class="${GRADIENT_CHIP_INNER}"><span aria-hidden="true" class="flex shrink-0 select-none items-center [&>svg]:block">${chipKindIconMarkup(kind)}</span><span class="min-w-0 max-w-[min(100%,10rem)] truncate py-px">${escapeHtml(label)}</span>${dismiss}</span></span>`;
    } else {
      html += escapeHtml(m[0]);
    }
    last = m.index + m[0].length;
  }
  if (last < migrated.length) {
    html += escapeHtml(migrated.slice(last)).replace(/\n/g, "<br />");
  }
  return html;
}

export function serializeContextPromptDom(root: HTMLElement): string {
  let out = "";

  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += (node as Text).data;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName;
    if (tag === "BR") {
      out += "\n";
      return;
    }
    if (el.dataset.echoCtx) {
      out += `{{${el.dataset.echoCtx}}}`;
      return;
    }
    for (const c of el.childNodes) walk(c);
  }

  for (const c of root.childNodes) walk(c);
  return out.replace(/\u00a0/g, " ").replace(/\u200b/g, "");
}

export type ContextPromptRichFieldProps = {
  value: string;
  onChange: (next: string) => void;
  attachments: ContextAttachment[];
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
};

/**
 * Inline chips (gradient ring + label) for `{{c1}}` tokens; type **@** to insert a reference from attachments.
 */
function attachmentSetKey(list: ContextAttachment[]): string {
  return list.map((a) => `${a.id}:${a.ref_label ?? ""}:${a.kind}`).join("|");
}

function ensureZwspTail(el: HTMLElement) {
  const last = el.lastChild;
  if (!last || last.nodeType === Node.ELEMENT_NODE) {
    el.appendChild(document.createTextNode("\u200b"));
  }
}

/** Turn `{{cN}}` text into chip HTML immediately (avoids flashing raw tokens after @ insert). */
function hydrateResolvableChips(el: HTMLElement, prompt: string, attachments: ContextAttachment[]) {
  const migrated = migratePromptTokensToCanonical(prompt).replace(/\r\n/g, "\n");
  if (!/\{\{c\d+\}\}/i.test(migrated)) return;
  const html = buildHtml(prompt, attachments);
  if (!html.trim()) return;
  el.innerHTML = html;
  ensureZwspTail(el);
}

export const ContextPromptRichField = forwardRef<HTMLDivElement, ContextPromptRichFieldProps>(
  function ContextPromptRichField(
    {
      value,
      onChange,
      attachments,
      disabled,
      placeholder,
      className,
      style,
      "aria-label": ariaLabel,
    },
    forwardedRef,
  ) {
    const innerRef = useRef<HTMLDivElement>(null);
    /** After emit(), skip one sync — props can lag the DOM by a render (fixes typing + Strict Mode). */
    const skipSyncFromEmitRef = useRef(false);
    /** Last `contentKey` we rendered into innerHTML (text + attachment set). */
    const lastRenderedKeyRef = useRef<string | null>(null);
    const [mentionOpen, setMentionOpen] = useState(false);
    const mentionRangeRef = useRef<Range | null>(null);

    const setRefs = useCallback(
      (node: HTMLDivElement | null) => {
        innerRef.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) (forwardedRef as { current: HTMLDivElement | null }).current = node;
      },
      [forwardedRef],
    );

    const emit = useCallback(() => {
      const el = innerRef.current;
      if (!el) return;
      skipSyncFromEmitRef.current = true;
      onChange(serializeContextPromptDom(el));
    }, [onChange]);

    const insertAttachmentToken = useCallback(
      (att: ContextAttachment) => {
        const el = innerRef.current;
        const token = canonicalTokenForRef(att.ref_label);
        const text = `${token} `;
        const r = mentionRangeRef.current;
        if (el && r) {
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(r);
          r.deleteContents();
          const tn = document.createTextNode(text);
          r.insertNode(tn);
          r.setStartAfter(tn);
          r.collapse(true);
          sel?.removeAllRanges();
          sel?.addRange(r);
          el.focus();
        }
        mentionRangeRef.current = null;
        emit();
        setMentionOpen(false);
        const box = innerRef.current;
        if (box) {
          const next = serializeContextPromptDom(box);
          hydrateResolvableChips(box, next, attachments);
          lastRenderedKeyRef.current = `${migratePromptTokensToCanonical(next)}|${attachmentSetKey(attachments)}`;
        }
      },
      [attachments, emit],
    );

    const onEditorKeyDown = useCallback(
      (e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key !== "@" || disabled || attachments.length === 0) return;
        const el = innerRef.current;
        const sel = window.getSelection();
        if (!el || !sel?.anchorNode || !el.contains(sel.anchorNode)) return;
        e.preventDefault();
        mentionRangeRef.current = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
        setMentionOpen(true);
      },
      [attachments.length, disabled],
    );

    const onChipDismissPointerDown = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        if (disabled) return;
        if (e.button !== 0) return;
        const target = e.target as HTMLElement | null;
        const btn = target?.closest?.("[data-echo-ctx-remove]");
        if (!btn || !innerRef.current?.contains(btn)) return;
        const chip = btn.closest?.("[data-echo-ctx]");
        if (!chip || !innerRef.current.contains(chip)) return;
        e.preventDefault();
        e.stopPropagation();
        chip.remove();
        emit();
      },
      [disabled, emit],
    );

    useLayoutEffect(() => {
      const el = innerRef.current;
      if (!el) return;

      if (skipSyncFromEmitRef.current) {
        skipSyncFromEmitRef.current = false;
        return;
      }

      const migrated = migratePromptTokensToCanonical(value);
      const contentKey = `${migrated}|${attachmentSetKey(attachments)}`;
      const fromDom = serializeContextPromptDom(el);

      const hydrated = buildHtml(value, attachments);

      // Value matches DOM string but chips were never hydrated (plain `{{cN}}` text) — must render chips.
      if (fromDom === migrated) {
        if (
          hydrated.includes("data-echo-ctx") &&
          !el.querySelector("[data-echo-ctx]") &&
          /\{\{c\d+\}\}/i.test(migrated)
        ) {
          el.innerHTML = hydrated;
          lastRenderedKeyRef.current = contentKey;
          ensureZwspTail(el);
          return;
        }
        if (lastRenderedKeyRef.current === contentKey) {
          return;
        }
        el.innerHTML = hydrated;
        lastRenderedKeyRef.current = contentKey;
        ensureZwspTail(el);
        return;
      }

      lastRenderedKeyRef.current = contentKey;
      el.innerHTML = hydrated;
      ensureZwspTail(el);
    }, [value, attachments]);

    return (
      <Popover
        modal={false}
        open={mentionOpen}
        onOpenChange={(o) => {
          setMentionOpen(o);
          if (!o) mentionRangeRef.current = null;
        }}
      >
        <PopoverAnchor asChild>
          <div className="relative min-w-0 w-full flex-1">
            <div
              ref={setRefs}
              role="textbox"
              aria-multiline="true"
              aria-label={ariaLabel}
              contentEditable={!disabled}
              suppressContentEditableWarning
              data-placeholder={placeholder ?? ""}
              onInput={emit}
              onBlur={emit}
              onKeyDown={onEditorKeyDown}
              onPointerDownCapture={onChipDismissPointerDown}
              className={cn(
                "echo-context-prompt-editor max-h-44 min-h-9 w-full overflow-y-auto whitespace-pre-wrap break-words border-0 bg-transparent py-1.5 text-sm leading-snug text-[#150A35] outline-none [&:empty]:before:text-[#150A35]/38 [&:empty]:before:content-[attr(data-placeholder)]",
                disabled && "cursor-not-allowed opacity-60",
                className,
              )}
              style={style}
            />
          </div>
        </PopoverAnchor>
        <PopoverContent
          align="start"
          sideOffset={6}
          className="w-72 p-1"
          onOpenAutoFocus={(ev) => ev.preventDefault()}
          onCloseAutoFocus={(ev) => ev.preventDefault()}
        >
          <p className="px-2 py-1.5 text-[11px] font-medium text-[#150A35]/55">
            Insert context tag
          </p>
          <div className="max-h-56 overflow-y-auto" role="listbox" aria-label="Context attachments">
            {attachments.map((att) => {
              const { label, kind } = friendlyLabelForAttachment(att, attachments);
              const Icon =
                kind === "image" ? IconPhoto : kind === "video" ? IconVideo : IconPaperclip;
              return (
                <button
                  key={att.id}
                  type="button"
                  role="option"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-[#150A35] hover:bg-[#150A35]/6"
                  onClick={() => insertAttachmentToken(att)}
                >
                  <Icon className="h-4 w-4 shrink-0 text-[#150A35]/60" stroke={2} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    );
  },
);
