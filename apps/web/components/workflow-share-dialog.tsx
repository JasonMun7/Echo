"use client";

import { useEffect, useState } from "react";
import { IconChevronRight, IconCopy, IconShare, IconX } from "@tabler/icons-react";
import { Code2, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type WorkflowShareRole = "viewer" | "editor";

export type WorkflowShareCollaborator = {
  uid: string;
  email: string;
  display_name: string;
  /** Firebase Auth profile photo when available. */
  photo_url?: string;
  status?: "pending" | "accepted";
  role?: WorkflowShareRole;
};

const ROLE_LABEL: Record<WorkflowShareRole, string> = {
  viewer: "Can view",
  editor: "Can edit",
};

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}`.toUpperCase();
  }
  const s = name.trim();
  return (s.slice(0, 2) || "?").toUpperCase();
}

type WorkflowShareDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shareEmail: string;
  onShareEmailChange: (v: string) => void;
  /** Role for the next invite (default Can edit). */
  inviteRole: WorkflowShareRole;
  onInviteRoleChange: (role: WorkflowShareRole) => void;
  onShare: () => void;
  sharing: boolean;
  collaborators: WorkflowShareCollaborator[];
  onUnshare: (uid: string) => void;
  /** Owner updates access level for an existing collaborator. */
  onCollaboratorRoleChange?: (uid: string, role: WorkflowShareRole) => void | Promise<void>;
  roleChangePendingUid?: string | null;
  /** When set (e.g. from step-lock presence), highlights people actively on this workflow. */
  liveCollaboratorUids?: ReadonlySet<string> | null;
  getCollaboratorStatusLabel?: (c: WorkflowShareCollaborator) => string;
  /** When set, shows a read-only URL + copy for this workflow. */
  workflowId?: string;
  /** Path suffix: `/dashboard/workflows/{id}` vs `.../edit`. */
  directLinkVariant?: "detail" | "edit";
};

export function WorkflowShareDialog({
  open,
  onOpenChange,
  shareEmail,
  onShareEmailChange,
  inviteRole,
  onInviteRoleChange,
  onShare,
  sharing,
  collaborators,
  onUnshare,
  onCollaboratorRoleChange,
  roleChangePendingUid,
  liveCollaboratorUids,
  getCollaboratorStatusLabel = (c) =>
    c.status === "pending" ? "Pending" : ROLE_LABEL[c.role ?? "editor"],
  workflowId,
  directLinkVariant = "detail",
}: WorkflowShareDialogProps) {
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    if (open && typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, [open]);

  const directUrl =
    workflowId && origin
      ? `${origin}/dashboard/workflows/${workflowId}${directLinkVariant === "edit" ? "/edit" : ""}`
      : "";

  const inviteRoleSelect = (
    <Select value={inviteRole} onValueChange={(v) => onInviteRoleChange(v as WorkflowShareRole)}>
      <SelectTrigger
        size="sm"
        className="h-9 w-full min-w-[7.5rem] shrink-0 rounded-lg border border-[#e5e7eb] bg-white px-2.5 text-xs font-medium text-[#111827] shadow-sm sm:w-[132px]"
        aria-label="Access for new invite"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="editor">{ROLE_LABEL.editor}</SelectItem>
        <SelectItem value="viewer">{ROLE_LABEL.viewer}</SelectItem>
      </SelectContent>
    </Select>
  );

  const copyDirectLink = async () => {
    if (!directUrl) return;
    try {
      await navigator.clipboard.writeText(directUrl);
      toast.success("Link copied", {
        description: "Paste it anywhere—recipients need an Echo account you’ve invited.",
      });
    } catch {
      toast.error("Could not copy link");
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]"
      role="presentation"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="relative w-full max-w-lg rounded-3xl border border-[#e5e7eb] bg-white p-8 shadow-[0_24px_48px_-12px_rgba(21,10,53,0.18)]"
        role="dialog"
        aria-labelledby="workflow-share-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 rounded-lg p-2 text-[#6b7280] transition-colors hover:bg-[#f3f4f6] hover:text-[#150A35]"
          aria-label="Close"
        >
          <IconX className="h-5 w-5" stroke={1.5} />
        </button>

        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[#0a0a0a] text-white shadow-sm">
            <IconShare className="h-5 w-5" stroke={1.75} aria-hidden />
          </div>
          <h2
            id="workflow-share-title"
            className="text-lg font-semibold tracking-tight text-[#111827] sm:text-xl"
          >
            Share this workflow
          </h2>
          <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-[#6b7280]">
            Manage workflow details and who has access
          </p>
        </div>

        <div className="flex flex-col gap-6">
          {directUrl ? (
            <section
              aria-labelledby="direct-link-heading"
              className="rounded-2xl border border-[#e5e7eb] bg-[#f9fafb] p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 id="direct-link-heading" className="text-sm font-semibold text-[#111827]">
                    Direct link
                  </h3>
                  <p className="mt-0.5 text-xs leading-relaxed text-[#6b7280]">
                    Anyone with the link can access
                  </p>
                </div>
                {inviteRoleSelect}
              </div>
              <div className="mt-3 flex items-center gap-0 overflow-hidden rounded-xl border border-[#e5e7eb] bg-white shadow-sm">
                <span className="min-w-0 flex-1 truncate px-3 py-2.5 font-mono text-[11px] leading-snug text-[#374151] sm:text-xs">
                  {directUrl}
                </span>
                <button
                  type="button"
                  onClick={() => void copyDirectLink()}
                  className="inline-flex shrink-0 items-center gap-1.5 border-l border-[#e5e7eb] bg-[#fafafa] px-3 py-2.5 text-xs font-medium text-[#111827] transition-colors hover:bg-[#f3f4f6] sm:text-sm"
                >
                  <Link2
                    className="h-3.5 w-3.5 text-[#6b7280] sm:h-4 sm:w-4"
                    strokeWidth={1.5}
                    aria-hidden
                  />
                  Copy link
                </button>
              </div>
            </section>
          ) : null}

          <section className="flex flex-col gap-2">
            {!directUrl ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-xs text-[#6b7280]">Access for new invite</span>
                {inviteRoleSelect}
              </div>
            ) : null}
            <h3 className="text-sm font-semibold text-[#111827]">Invite</h3>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
              <div className="flex min-h-12 min-w-0 flex-1 overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white shadow-sm">
                <input
                  type="email"
                  placeholder="Invite others by name or email"
                  value={shareEmail}
                  onChange={(e) => onShareEmailChange(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && onShare()}
                  className="min-h-12 min-w-0 flex-1 border-0 bg-transparent px-4 py-3 text-sm text-[#111827] outline-none placeholder:text-[#9ca3af] focus-visible:ring-0"
                />
              </div>
              <button
                type="button"
                onClick={onShare}
                disabled={sharing || !shareEmail.trim()}
                className="inline-flex h-12 shrink-0 items-center justify-center rounded-2xl bg-[#0a0a0a] px-6 text-sm font-medium text-white transition-colors hover:bg-[#262626] disabled:opacity-45"
              >
                {sharing ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Inviting…
                  </span>
                ) : (
                  "Invite"
                )}
              </button>
            </div>
          </section>

          <section className="border-t border-[#f3f4f6] pt-5">
            <h3 className="mb-3 text-sm font-semibold text-[#111827]">People with access</h3>
            {collaborators.length === 0 ? (
              <p className="text-sm text-[#6b7280]">Only you have access right now.</p>
            ) : (
              <ul className="flex flex-col gap-0 divide-y divide-[#f3f4f6]">
                {collaborators.map((c) => {
                  const isLive = liveCollaboratorUids?.has(c.uid) ?? false;
                  return (
                    <li key={c.uid} className="flex items-center gap-3 py-3 first:pt-0">
                      <Avatar
                        className={cn(
                          "h-9 w-9 shrink-0 border-2 border-white shadow-sm",
                          isLive
                            ? "ring-2 ring-[#A577FF] ring-offset-2 ring-offset-white shadow-[0_0_14px_rgba(165,119,255,0.35)]"
                            : "ring-1 ring-[#150A35]/8",
                        )}
                        title={isLive ? "On this workflow now" : undefined}
                      >
                        {c.photo_url ? (
                          <AvatarImage
                            src={c.photo_url}
                            alt=""
                            className={cn(
                              isLive && "brightness-[1.08] saturate-125 contrast-[1.02]",
                            )}
                          />
                        ) : null}
                        <AvatarFallback
                          className={cn(
                            "text-xs font-semibold",
                            c.status === "pending"
                              ? "bg-amber-100 text-amber-900"
                              : "bg-[#ede9fe] text-[#5b21b6]",
                          )}
                        >
                          {initialsFromName(c.display_name || c.email || "?")}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[#111827]">
                          {c.display_name}
                        </p>
                        {c.email ? (
                          <p className="truncate text-xs text-[#6b7280]">{c.email}</p>
                        ) : null}
                        {c.status === "pending" ? (
                          <p className="text-[10px] font-medium text-amber-800">Invite pending</p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {onCollaboratorRoleChange ? (
                          <Select
                            value={c.role ?? "editor"}
                            disabled={roleChangePendingUid === c.uid}
                            onValueChange={(v) =>
                              void onCollaboratorRoleChange(c.uid, v as WorkflowShareRole)
                            }
                          >
                            <SelectTrigger
                              size="sm"
                              className="h-8 w-[min(100%,7.5rem)] rounded-lg border-[#e5e7eb] text-xs"
                              aria-label={`Access for ${c.display_name}`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="editor">{ROLE_LABEL.editor}</SelectItem>
                              <SelectItem value="viewer">{ROLE_LABEL.viewer}</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 text-sm text-[#6b7280]">
                            {getCollaboratorStatusLabel(c)}
                            <IconChevronRight className="h-4 w-4 text-[#d1d5db]" stroke={1.5} />
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => onUnshare(c.uid)}
                          className="ml-1 rounded-lg p-1.5 text-[#9ca3af] transition-colors hover:bg-red-50 hover:text-red-600"
                          title="Remove access"
                        >
                          <IconX className="h-4 w-4" stroke={1.5} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-[#f3f4f6] pt-6 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-10 justify-start gap-2 text-[#374151] hover:bg-[#f9fafb] hover:text-[#111827]"
            onClick={() =>
              toast.info("Embed codes aren’t available for workflows yet.", {
                description: "We’ll add shareable embeds in a future release.",
              })
            }
          >
            <Code2 className="h-4 w-4" strokeWidth={1.5} />
            Embed code
          </Button>
          <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10 rounded-xl border-[#e5e7eb] bg-white px-4 text-[#374151] shadow-sm hover:bg-[#f9fafb]"
              disabled={!directUrl}
              onClick={() => void copyDirectLink()}
            >
              <IconCopy className="h-4 w-4" stroke={1.5} />
              Copy link
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-10 rounded-xl bg-[#A577FF] px-6 font-semibold text-white shadow-sm hover:bg-[#9469e8]"
              onClick={() => onOpenChange(false)}
            >
              Done
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
