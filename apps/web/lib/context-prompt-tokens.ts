import type {
  ContextAttachment,
  ContextAttachmentKind,
} from "@/lib/workflow-step-context-attachments";

/** Stored in Firestore / step.context — machine token for each attachment. */
export function canonicalTokenForRef(refLabel: string | undefined): string {
  const id = (refLabel ?? "c1").trim().toLowerCase().replace(/^@/, "");
  return `{{${id}}}`;
}

/** Per-kind numbering: Image 1, Video 2, File 1 — stable for display. */
export function friendlyLabelForAttachment(
  att: ContextAttachment,
  attachments: ContextAttachment[],
): { label: string; kind: ContextAttachmentKind } {
  const sameKind = attachments.filter((a) => a.kind === att.kind);
  const idx = sameKind.findIndex((a) => a.id === att.id) + 1;
  switch (att.kind) {
    case "image":
      return { label: `Image ${idx}`, kind: "image" };
    case "video":
      return { label: `Video ${idx}`, kind: "video" };
    default:
      return { label: `File ${idx}`, kind: "file" };
  }
}

/** @c1 → {{c1}} for legacy prompts (token-like only; avoids emails like user@c1.com). */
export function migratePromptTokensToCanonical(raw: string): string {
  return raw.replace(
    /(^|\s)@c(\d+)(?=\s|$|[.,;:!?)])/gim,
    (_, lead: string, n: string) => `${lead}{{c${n}}}`,
  );
}

export function tokenAlreadyInPrompt(prompt: string, refLabel: string | undefined): boolean {
  const id = (refLabel ?? "c1").trim().toLowerCase().replace(/^@/, "");
  if (new RegExp(`\\{\\{${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\}\\}`, "i").test(prompt))
    return true;
  if (
    new RegExp(`(?:^|\\s)@${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`, "i").test(prompt)
  )
    return true;
  return false;
}

export function appendContextTokenToPrompt(current: string, refLabel: string | undefined): string {
  if (tokenAlreadyInPrompt(current, refLabel)) return migratePromptTokensToCanonical(current);
  const token = canonicalTokenForRef(refLabel);
  const migrated = migratePromptTokensToCanonical(current);
  const t = migrated.trimEnd();
  if (!t) return `${token} `;
  return `${t} ${token} `;
}

/** Replace `{{c1}}` tokens with human labels (e.g. Image 1) for canvas cards and summaries. */
export function formatContextForDisplay(
  raw: string,
  attachments: ContextAttachment[] | null | undefined,
): string {
  const migrated = migratePromptTokensToCanonical(raw ?? "").replace(/\r\n/g, "\n");
  const list = attachments ?? [];
  const byRef = new Map(list.map((a) => [(a.ref_label ?? "c1").toLowerCase(), a]));
  return migrated.replace(/\{\{c(\d+)\}\}/gi, (_, num: string) => {
    const id = `c${num}`;
    const att = byRef.get(id.toLowerCase());
    if (att) {
      return friendlyLabelForAttachment(att, list).label;
    }
    return `Ref ${num}`;
  });
}
