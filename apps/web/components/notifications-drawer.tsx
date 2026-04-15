"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  IconArrowRight,
  IconCheck,
  IconChevronRight,
  IconNotification,
  IconX,
} from "@tabler/icons-react";
import { toast } from "sonner";

import { useNotificationsInbox } from "@/components/notifications/notifications-inbox-context";
import { apiFetch } from "@/lib/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { GradientIconTag } from "@/components/ui/gradient-icon-well";
import { cn } from "@/lib/utils";

function getTime(x: unknown): number {
  if (typeof (x as { toMillis?: () => number })?.toMillis === "function") {
    return (x as { toMillis: () => number }).toMillis();
  }
  if (typeof x === "number") return x > 1e12 ? x : x * 1000;
  if (typeof x === "string") return new Date(x).getTime() || 0;
  const o = x as { seconds?: number; _seconds?: number } | null;
  const sec = o?.seconds ?? o?._seconds;
  return typeof sec === "number" ? sec * 1000 : 0;
}

function formatDate(ts: unknown): string {
  const ms = getTime(ts);
  if (!ms) return "";
  const d = new Date(ms);
  const now = Date.now();
  const diff = now - ms;
  if (diff < 60_000) return "Just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Static Cyan → Lavender dot for unread (no animation; matches brand gradient). */
function UnreadGradientIndicator() {
  return (
    <div
      className="h-3 w-3 shrink-0 rounded-full bg-gradient-to-br from-[#21C4DD] to-[#A577FF] shadow-sm ring-2 ring-background"
      aria-hidden
    />
  );
}

/** Normalize Firestore photo URL; Google CDN often needs `referrerPolicy="no-referrer"` on `<img>`. */
function profileImageUrl(raw: string | undefined | null): string | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s || !/^https?:\/\//i.test(s)) return null;
  return s;
}

function isPendingWorkflowInviteNotification(
  n: { invite_id?: string; workflow_id?: string },
  pendingInviteIds: ReadonlySet<string>,
): boolean {
  return Boolean(n.invite_id && n.workflow_id && pendingInviteIds.has(n.invite_id));
}

export function NotificationsDrawer() {
  const router = useRouter();
  const { notifications, loading, drawerOpen, setDrawerOpen, markRead, pendingWorkflowInviteIds } =
    useNotificationsInbox();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [respondingInviteId, setRespondingInviteId] = useState<string | null>(null);

  const handleAcceptWorkflowInvite = useCallback(
    async (n: { id: string; invite_id?: string; workflow_id?: string; workflow_name?: string }) => {
      if (!n.workflow_id || !n.invite_id) return;
      setRespondingInviteId(n.invite_id);
      try {
        const res = await apiFetch(`/api/workflows/${n.workflow_id}/invite/accept`, {
          method: "POST",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data as { detail?: string }).detail || "Failed to accept");
        toast.success("You're in", {
          description: `Open "${n.workflow_name ?? "the workflow"}" to edit together on the shared workflow.`,
        });
        void markRead(n.id);
        setDrawerOpen(false);
        const wid = (data as { workflow_id?: string }).workflow_id ?? n.workflow_id;
        router.push(`/dashboard/workflows/${wid}/edit`);
      } catch {
        toast.error("Failed to accept invite");
      } finally {
        setRespondingInviteId(null);
      }
    },
    [markRead, router, setDrawerOpen],
  );

  const handleDeclineWorkflowInvite = useCallback(
    async (n: { id: string; invite_id?: string; workflow_id?: string }) => {
      if (!n.workflow_id || !n.invite_id) return;
      setRespondingInviteId(n.invite_id);
      try {
        const res = await apiFetch(`/api/workflows/${n.workflow_id}/invite/decline`, {
          method: "POST",
        });
        if (!res.ok) throw new Error("Failed to decline");
        toast.success("Invite declined");
        void markRead(n.id);
      } catch {
        toast.error("Failed to decline invite");
      } finally {
        setRespondingInviteId(null);
      }
    },
    [markRead],
  );

  const handleCopyWorkflowInvite = useCallback(
    async (n: { id: string; invite_id?: string; workflow_id?: string; workflow_name?: string }) => {
      if (!n.workflow_id || !n.invite_id) return;
      setRespondingInviteId(n.invite_id);
      try {
        const acceptRes = await apiFetch(`/api/workflows/${n.workflow_id}/invite/accept`, {
          method: "POST",
        });
        const acceptData = await acceptRes.json().catch(() => ({}));
        if (!acceptRes.ok) {
          throw new Error(
            (acceptData as { detail?: string }).detail || "Failed to join shared workflow",
          );
        }
        const forkRes = await apiFetch(`/api/workflows/${n.workflow_id}/fork`, {
          method: "POST",
        });
        const forkData = await forkRes.json().catch(() => ({}));
        if (!forkRes.ok) {
          throw new Error((forkData as { detail?: string }).detail || "Failed to make a copy");
        }
        toast.success("Copy saved", {
          description:
            "Your copy is ready. You can keep editing the shared workflow with others too.",
        });
        void markRead(n.id);
        setDrawerOpen(false);
        if ((forkData as { id?: string }).id) {
          router.push(`/dashboard/workflows/${(forkData as { id: string }).id}/edit`);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to copy workflow");
      } finally {
        setRespondingInviteId(null);
      }
    },
    [markRead, router, setDrawerOpen],
  );

  const toggleExpanded = useCallback(
    (id: string, isUnread: boolean) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
          if (isUnread) {
            void markRead(id);
          }
        }
        return next;
      });
    },
    [markRead],
  );

  return (
    <Drawer direction="right" open={drawerOpen} onOpenChange={setDrawerOpen}>
      <DrawerContent
        className="flex h-full flex-col left-auto right-0 top-0 w-full max-w-md border-l border-border bg-muted p-0 shadow-2xl shadow-black/10 data-[vaul-drawer-direction=right]:rounded-l-xl dark:shadow-black/40"
        style={{ boxShadow: "var(--echo-card-shadow, -4px 0 24px rgba(21, 10, 53, 0.08))" }}
      >
        <DrawerHeader className="shrink-0 space-y-0 border-b border-border bg-card px-4 py-3.5 shadow-[0_1px_0_rgba(21,10,53,0.06)] dark:shadow-[0_1px_0_rgba(0,0,0,0.2)]">
          <div className="flex items-center justify-between gap-3 pr-0">
            <DrawerTitle className="text-lg font-semibold tracking-tight text-foreground">
              Notifications
            </DrawerTitle>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
              aria-label="Close notifications"
              onClick={() => setDrawerOpen(false)}
            >
              <IconX className="size-5" />
            </Button>
          </div>
        </DrawerHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {loading ? (
            <div className="flex flex-col gap-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 w-full rounded-xl border border-border bg-card" />
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-background px-6 py-12 text-center">
              <IconNotification className="h-9 w-9 text-muted-foreground/35" />
              <p className="mt-3 text-sm font-medium text-muted-foreground">No notifications yet</p>
              <p className="mt-1 max-w-xs text-xs text-muted-foreground/80">
                When someone shares a workflow or accepts an invite, it will show here.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {notifications.map((n) => {
                const initial =
                  (n.from_name || n.title || "?")
                    .split(/\s+/)
                    .map((s) => s[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase() || "?";
                const isOpen = expanded.has(n.id);
                const isUnread = !n.read;
                const photoUrl = profileImageUrl(n.from_photo_url);
                const showInviteActions = isPendingWorkflowInviteNotification(
                  n,
                  pendingWorkflowInviteIds,
                );

                return (
                  <li key={n.id}>
                    <div
                      className={cn(
                        "overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm transition-[box-shadow,background-color] dark:border-border/50 dark:bg-card",
                        isOpen && "shadow-md ring-1 ring-border/40",
                      )}
                    >
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() => toggleExpanded(n.id, isUnread)}
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-2.5">
                          {isUnread ? (
                            <UnreadGradientIndicator />
                          ) : (
                            <div className="h-3 w-3 shrink-0 opacity-0" aria-hidden />
                          )}
                          <Avatar className="h-9 w-9 shrink-0">
                            {photoUrl ? (
                              <AvatarImage src={photoUrl} alt="" referrerPolicy="no-referrer" />
                            ) : null}
                            <AvatarFallback className="bg-muted text-[11px] font-medium text-foreground">
                              {initial}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="min-w-0 text-sm font-medium leading-snug text-foreground line-clamp-2">
                                {n.title}
                              </p>
                              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                                {formatDate(n.createdAt)}
                              </span>
                            </div>
                          </div>
                        </div>
                        <span
                          className={cn(
                            "flex h-9 shrink-0 items-center text-muted-foreground transition-transform duration-200",
                            isOpen && "rotate-90",
                          )}
                        >
                          <IconChevronRight className="size-5" aria-hidden />
                        </span>
                      </button>
                      {isOpen && (
                        <div className="space-y-2 border-t border-border bg-muted px-3 pb-3 pt-2.5">
                          {n.body ? (
                            <p className="text-xs leading-relaxed text-muted-foreground">
                              {n.body}
                            </p>
                          ) : null}
                          {showInviteActions ? (
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 gap-1 border-border text-xs text-muted-foreground hover:text-destructive"
                                disabled={respondingInviteId === n.invite_id}
                                onClick={() => void handleDeclineWorkflowInvite(n)}
                              >
                                <IconX className="h-3.5 w-3.5" />
                                Decline
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs"
                                disabled={respondingInviteId === n.invite_id}
                                onClick={() => void handleCopyWorkflowInvite(n)}
                              >
                                Make a copy
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                className="echo-btn-primary h-8 gap-1 text-xs"
                                disabled={respondingInviteId === n.invite_id}
                                onClick={() => void handleAcceptWorkflowInvite(n)}
                              >
                                <IconCheck className="h-3.5 w-3.5" />
                                Join
                              </Button>
                            </div>
                          ) : null}
                          {n.workflow_id ? (
                            <Link
                              href={`/dashboard/workflows/${n.workflow_id}`}
                              onClick={() => {
                                setDrawerOpen(false);
                                if (!n.read) void markRead(n.id);
                              }}
                              className="inline-flex max-w-full"
                            >
                              <GradientIconTag
                                size="sm"
                                className="max-w-full min-w-0"
                                innerClassName="inline-flex items-center gap-1 text-foreground"
                              >
                                <span className="truncate">View workflow</span>
                                <IconArrowRight className="h-3 w-3 shrink-0" aria-hidden />
                              </GradientIconTag>
                            </Link>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
