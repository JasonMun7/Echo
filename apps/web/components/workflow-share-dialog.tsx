"use client";

import { useEffect, useState } from "react";
import { IconCheck, IconChevronRight, IconCopy, IconShare, IconX } from "@tabler/icons-react";
import { Code2, Link2, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { GradientIconWell, gradientWellImageClass } from "@/components/ui/gradient-icon-well";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type WorkflowShareRole = "viewer" | "editor";

/** Row in “People with access” — includes workflow owner. */
export type WorkflowParticipantRole = "owner" | WorkflowShareRole;

export type WorkflowShareCollaborator = {
  uid: string;
  email: string;
  display_name: string;
  /** Firebase Auth profile photo when available. */
  photo_url?: string;
  status?: "pending" | "accepted";
  role?: WorkflowParticipantRole;
};

const ROLE_LABEL: Record<WorkflowShareRole, string> = {
  viewer: "Can view",
  editor: "Can edit",
};

const PARTICIPANT_LABEL: Record<WorkflowParticipantRole, string> = {
  owner: "Owner",
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
  /** When false, collaborators are read-only (invite-only for editors; owner can change roles and remove). */
  canManageCollaborators?: boolean;
  /** Highlights the signed-in user in the list (e.g. “You”). */
  currentUserUid?: string | null;
  /** When true, direct link + invites are enabled (backend also requires `is_public`). */
  isPublic?: boolean;
  /** Owner only: toggle public workflow. Omit to hide the control. */
  onPublicChange?: (next: boolean) => void | Promise<void>;
  /** While saving visibility. */
  publicSaving?: boolean;
  /** Show the public switch (typically workflow owner). */
  canManagePublic?: boolean;
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
  getCollaboratorStatusLabel = (c) => {
    if (c.role === "owner") return PARTICIPANT_LABEL.owner;
    if (c.status === "pending") return "Pending";
    const r = c.role === "viewer" || c.role === "editor" ? c.role : "editor";
    return ROLE_LABEL[r];
  },
  workflowId,
  directLinkVariant = "detail",
  canManageCollaborators = true,
  currentUserUid = null,
  isPublic = false,
  onPublicChange,
  publicSaving = false,
  canManagePublic = false,
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
        className="h-9 w-full min-w-[7.5rem] shrink-0 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-foreground shadow-sm sm:w-[132px]"
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

  const sharingEnabled = isPublic;

  const copyDirectLink = async () => {
    if (!directUrl || !sharingEnabled) return;
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
        className="relative w-full max-w-lg rounded-3xl border border-border bg-card p-8 shadow-[0_24px_48px_-12px_rgba(21,10,53,0.18)]"
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
          <GradientIconWell className="mb-4 h-11 w-11 shrink-0">
            <IconShare className="h-5 w-5 text-card-foreground" stroke={1.75} aria-hidden />
          </GradientIconWell>
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
          {canManagePublic && typeof onPublicChange === "function" ? (
            <section
              aria-labelledby="workflow-public-heading"
              className="rounded-2xl border border-border bg-muted/40 p-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <h3
                    id="workflow-public-heading"
                    className="text-sm font-semibold text-foreground"
                  >
                    Public workflow
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Turn this on to copy a share link and invite people. While private, the workflow
                    stays yours only.
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3 sm:pl-2">
                  <Label
                    htmlFor="workflow-share-public"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    {isPublic ? "Public" : "Private"}
                  </Label>
                  <Switch
                    id="workflow-share-public"
                    size="sm"
                    checked={isPublic}
                    disabled={publicSaving}
                    onCheckedChange={(v) => void onPublicChange(v)}
                  />
                </div>
              </div>
            </section>
          ) : !canManagePublic && !isPublic ? (
            <p className="rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
              This workflow is private. Ask the owner to make it public before you can copy a share
              link or send invites.
            </p>
          ) : null}

          {directUrl ? (
            <section
              aria-labelledby="direct-link-heading"
              className={cn(
                "rounded-2xl border border-border bg-muted/40 p-4 transition-opacity",
                !sharingEnabled && "pointer-events-none opacity-50",
              )}
              aria-disabled={!sharingEnabled}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 id="direct-link-heading" className="text-sm font-semibold text-[#111827]">
                    Direct link
                  </h3>
                  <p className="mt-0.5 text-xs leading-relaxed text-[#6b7280]">
                    {sharingEnabled
                      ? "Anyone with the link can access (per their role)"
                      : "Enable “Public workflow” above to share this link"}
                  </p>
                </div>
                {inviteRoleSelect}
              </div>
              <div className="mt-3 flex items-center gap-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                <span className="min-w-0 flex-1 truncate px-3 py-2.5 font-mono text-[11px] leading-snug text-[#374151] sm:text-xs">
                  {directUrl}
                </span>
                <button
                  type="button"
                  onClick={() => void copyDirectLink()}
                  disabled={!sharingEnabled}
                  className="inline-flex shrink-0 items-center gap-1.5 border-l border-border bg-muted/50 px-3 py-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-40 sm:text-sm"
                >
                  <Link2
                    className="h-3.5 w-3.5 text-muted-foreground sm:h-4 sm:w-4"
                    strokeWidth={1.5}
                    aria-hidden
                  />
                  Copy link
                </button>
              </div>
            </section>
          ) : null}

          <section
            className={cn(
              "flex flex-col gap-2",
              !sharingEnabled && "pointer-events-none opacity-50",
            )}
            aria-disabled={!sharingEnabled}
          >
            {!directUrl ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-xs text-[#6b7280]">Access for new invite</span>
                {inviteRoleSelect}
              </div>
            ) : null}
            <h3 className="text-sm font-semibold text-[#111827]">Invite</h3>
            {!sharingEnabled ? (
              <p className="text-xs text-muted-foreground">
                Make the workflow public above to send email invites.
              </p>
            ) : null}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
              <div className="flex min-h-12 min-w-0 flex-1 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                <input
                  type="email"
                  placeholder="Invite others by name or email"
                  value={shareEmail}
                  onChange={(e) => onShareEmailChange(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sharingEnabled && onShare()}
                  disabled={!sharingEnabled}
                  className="min-h-12 min-w-0 flex-1 border-0 bg-transparent px-4 py-3 text-sm text-[#111827] outline-none placeholder:text-[#9ca3af] focus-visible:ring-0 disabled:cursor-not-allowed"
                />
              </div>
              <button
                type="button"
                onClick={onShare}
                disabled={sharing || !shareEmail.trim() || !sharingEnabled}
                className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-foreground px-6 text-sm font-medium text-background transition-colors hover:bg-foreground/90 disabled:opacity-45"
              >
                {sharing ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Inviting…
                  </span>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                    Invite
                  </>
                )}
              </button>
            </div>
          </section>

          <section className="border-t border-border pt-5">
            <h3 className="mb-3 text-sm font-semibold text-[#111827]">People with access</h3>
            {collaborators.length === 0 ? (
              <p className="text-sm text-[#6b7280]">Only you have access right now.</p>
            ) : (
              <ul className="flex flex-col gap-0 divide-y divide-border">
                {collaborators.map((c) => {
                  const isLive = liveCollaboratorUids?.has(c.uid) ?? false;
                  const isOwnerRow = c.role === "owner";
                  const isSelf = Boolean(currentUserUid && c.uid === currentUserUid);
                  return (
                    <li key={c.uid} className="flex items-center gap-3 py-3 first:pt-0">
                      <span
                        className={cn(
                          "inline-flex",
                          isLive && "rounded-full ring-2 ring-ring ring-offset-2 ring-offset-card",
                        )}
                        title={isLive ? "On this workflow now" : undefined}
                      >
                        <GradientIconWell corners="full" className="h-9 w-9 shrink-0 shadow-sm">
                          <Avatar className="size-full rounded-full border-0">
                            {c.photo_url ? (
                              <AvatarImage
                                src={c.photo_url}
                                alt=""
                                className={cn(
                                  gradientWellImageClass("full"),
                                  isLive && "brightness-[1.08] saturate-125 contrast-[1.02]",
                                )}
                              />
                            ) : null}
                            <AvatarFallback
                              className={cn(
                                "text-xs font-semibold",
                                c.status === "pending"
                                  ? "bg-amber-100 text-amber-900"
                                  : "bg-muted text-foreground",
                              )}
                            >
                              {initialsFromName(c.display_name || c.email || "?")}
                            </AvatarFallback>
                          </Avatar>
                        </GradientIconWell>
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[#111827]">
                          {c.display_name}
                          {isSelf ? (
                            <span className="ml-1.5 text-xs font-normal text-[#6b7280]">(You)</span>
                          ) : null}
                        </p>
                        {c.email ? (
                          <p className="truncate text-xs text-[#6b7280]">{c.email}</p>
                        ) : null}
                        {c.status === "pending" ? (
                          <p className="text-[10px] font-medium text-amber-800">Invite pending</p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {onCollaboratorRoleChange && canManageCollaborators && !isOwnerRow ? (
                          <Select
                            value={c.role === "viewer" || c.role === "editor" ? c.role : "editor"}
                            disabled={roleChangePendingUid === c.uid}
                            onValueChange={(v) =>
                              void onCollaboratorRoleChange(c.uid, v as WorkflowShareRole)
                            }
                          >
                            <SelectTrigger
                              size="sm"
                              className="h-8 w-[min(100%,7.5rem)] rounded-lg border-border text-xs"
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
                            {!isOwnerRow ? (
                              <IconChevronRight className="h-4 w-4 text-[#d1d5db]" stroke={1.5} />
                            ) : null}
                          </span>
                        )}
                        {canManageCollaborators && !isOwnerRow ? (
                          <button
                            type="button"
                            onClick={() => onUnshare(c.uid)}
                            className="ml-1 rounded-lg p-1.5 text-[#9ca3af] transition-colors hover:bg-red-50 hover:text-red-600"
                            title="Remove access"
                          >
                            <IconX className="h-4 w-4" stroke={1.5} />
                          </button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
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
              className="h-10 rounded-xl px-4 shadow-sm"
              disabled={!directUrl || !sharingEnabled}
              onClick={() => void copyDirectLink()}
            >
              <IconCopy className="h-4 w-4" stroke={1.5} />
              Copy link
            </Button>
            <Button
              type="button"
              size="sm"
              className="echo-btn-primary h-10 rounded-xl px-6 font-semibold"
              onClick={() => onOpenChange(false)}
            >
              <IconCheck className="h-4 w-4" stroke={1.75} aria-hidden />
              Done
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
