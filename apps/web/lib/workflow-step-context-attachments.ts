/** Rich context attached to a workflow step (images, videos, files) — stored on the step doc. */

export type ContextAttachmentKind = "image" | "video" | "file";

export type ContextAttachment = {
  id: string;
  kind: ContextAttachmentKind;
  /** Firebase Storage download URL (tokenized; safe to share with collaborators who can open the step). */
  url: string;
  name: string;
  mime?: string;
};

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
    const kind = o.kind === "image" || o.kind === "video" || o.kind === "file" ? o.kind : "file";
    const mime = typeof o.mime === "string" ? o.mime : undefined;
    if (!id || !url) continue;
    out.push({ id, kind, url, name, mime });
  }
  return out.slice(0, MAX_ATTACHMENTS);
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
