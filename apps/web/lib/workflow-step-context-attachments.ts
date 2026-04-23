/** Rich context attached to a workflow step (images, videos, files) — stored on the step doc. */

/** Client-only rows merged from `frame_image_url` so the editor preview matches `{{cN}}` tokens; strip before persisting. */
export const SYNTHETIC_FRAME_ATTACHMENT_PREFIX = "echo-synthetic-frame:";

/** Client-only rows inferred from markdown / HTML image URLs in prompt text; strip before persisting. */
export const SYNTHETIC_INLINE_ATTACHMENT_PREFIX = "echo-synthetic-inline:";

export type ContextAttachmentKind = "image" | "video" | "file";

function inferAttachmentKind(
  rawKind: unknown,
  mime: string | undefined,
  url: string,
): ContextAttachmentKind {
  const k = typeof rawKind === "string" ? rawKind.trim().toLowerCase() : "";
  if (k === "image" || k === "video" || k === "file") return k;
  const m = (mime ?? "").toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  const path = (url.split("?")[0] ?? "").toLowerCase();
  if (/\.(png|jpe?g|gif|webp|avif|bmp)(\b|$)/i.test(path)) return "image";
  if (/\.(mp4|webm|mov|m4v)(\b|$)/i.test(path)) return "video";
  return "file";
}

export type ContextAttachment = {
  id: string;
  kind: ContextAttachmentKind;
  /** Firebase Storage download URL (tokenized; safe to share with collaborators who can open the step). */
  url: string;
  name: string;
  mime?: string;
  /** Stable id (c1, c2, …). In step text use tokens like {{c1}} (UI shows “Image 1”, etc.). */
  ref_label?: string;
};

export function isSyntheticFrameAttachment(a: ContextAttachment): boolean {
  return a.id.startsWith(SYNTHETIC_FRAME_ATTACHMENT_PREFIX);
}

export function isSyntheticInlineAttachment(a: ContextAttachment): boolean {
  return a.id.startsWith(SYNTHETIC_INLINE_ATTACHMENT_PREFIX);
}

/** Rows the composer merges for preview that must never be written to Firestore as `context_attachments`. */
export function isEphemeralComposerAttachment(a: ContextAttachment): boolean {
  return isSyntheticFrameAttachment(a) || isSyntheticInlineAttachment(a);
}

const MAX_ATTACHMENTS = 12;
const MAX_FILE_BYTES = 40 * 1024 * 1024;

export function normalizeContextAttachments(raw: unknown): ContextAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: ContextAttachment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : "";
    const url = typeof o.url === "string" ? o.url.trim() : "";
    const name = typeof o.name === "string" ? o.name : "file";
    const kind = inferAttachmentKind(o.kind, typeof o.mime === "string" ? o.mime : undefined, url);
    const mime = typeof o.mime === "string" ? o.mime : undefined;
    if (!id || !url) continue;
    const refRaw = o.ref_label;
    const ref_label =
      typeof refRaw === "string" && /^c\d+$/i.test(refRaw.trim())
        ? refRaw.trim().toLowerCase()
        : undefined;
    out.push({
      id,
      kind,
      url,
      name,
      mime,
      ref_label: ref_label ?? `c${out.length + 1}`,
    });
  }
  return out.slice(0, MAX_ATTACHMENTS);
}

/** Next free label c1, c2, … based on existing attachment ref_labels. */
export function nextAttachmentRefLabel(current: ContextAttachment[]): string {
  let max = 0;
  for (const a of current) {
    const m = /^c(\d+)$/i.exec(a.ref_label ?? "");
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `c${max + 1}`;
}

export function canAddAttachment(current: ContextAttachment[]): boolean {
  return current.length < MAX_ATTACHMENTS;
}

export function assertFileSize(file: File): string | null {
  if (file.size > MAX_FILE_BYTES) {
    return `File too large (max ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB).`;
  }
  return null;
}

export { MAX_ATTACHMENTS, MAX_FILE_BYTES };
