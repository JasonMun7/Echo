"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import {
  IconCheck,
  IconShare3,
  IconArrowRight,
  IconNotification,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";

interface Notification {
  id: string;
  to_uid: string;
  type: string;
  title: string;
  body?: string;
  workflow_id?: string;
  workflow_name?: string;
  from_uid?: string;
  from_name?: string;
  invite_id?: string;
  read?: boolean;
  createdAt?: unknown;
  readAt?: unknown;
}

function getTime(x: unknown): number {
  if (typeof (x as { toMillis?: () => number })?.toMillis === "function") {
    return (x as { toMillis: () => number }).toMillis();
  }
  if (typeof x === "number") return x > 1e12 ? x : x * 1000;
  if (typeof x === "string") return new Date(x).getTime() || 0;
  const o = (x as { seconds?: number; _seconds?: number } | null);
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

interface NotificationsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NotificationsDrawer({ open, onOpenChange }: NotificationsDrawerProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    apiFetch("/api/notifications")
      .then((res) => (res.ok ? res.json() : { notifications: [] }))
      .then((data) => {
        if (!cancelled && Array.isArray(data.notifications)) {
          setNotifications(data.notifications);
        }
      })
      .catch(() => {
        if (!cancelled) setNotifications([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const markRead = async (id: string) => {
    const res = await apiFetch(`/api/notifications/${id}`, { method: "PATCH" });
    if (res.ok) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
    }
  };

  return (
    <Drawer direction="right" open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        className="flex h-full flex-col left-auto right-0 top-0 w-full max-w-md border-l border-[#A577FF]/20 bg-[#F5F7FC] p-0 data-[vaul-drawer-direction=right]:rounded-l-xl"
        style={{ boxShadow: "var(--echo-card-shadow, -4px 0 24px rgba(21, 10, 53, 0.08))" }}
      >
        <DrawerHeader className="shrink-0 border-b border-[#A577FF]/15 bg-white/80 backdrop-blur-sm">
          <DrawerTitle className="text-xl font-semibold text-[#150A35]">
            Notifications
          </DrawerTitle>
          <DrawerDescription className="text-sm text-echo-text-muted">
            Workflow shares and other updates. Click to open or mark as read.
          </DrawerDescription>
        </DrawerHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <div className="flex flex-col gap-3">
              {[1, 2, 3].map((i) => (
                <Skeleton
                  key={i}
                  className="h-20 w-full rounded-xl border border-[#A577FF]/20"
                />
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="echo-card flex flex-col items-center justify-center rounded-xl border border-[#A577FF]/20 bg-white/80 p-8 text-center">
              <IconNotification className="h-10 w-10 text-[#150A35]/20" />
              <p className="mt-3 text-sm font-medium text-[#150A35]">
                No notifications yet
              </p>
              <p className="mt-1 text-xs text-echo-text-muted">
                When someone shares a workflow with you, it will appear here.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {notifications.map((n) => (
                <li key={n.id}>
                  <div
                    className={`echo-card rounded-xl border bg-white/90 shadow-sm transition-colors ${
                      n.read
                        ? "border-[#150A35]/10"
                        : "border-[#A577FF]/30 bg-[#A577FF]/5"
                    }`}
                  >
                    <div className="flex items-start gap-3 p-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#A577FF]/15">
                        <IconShare3 className="h-4 w-4 text-[#A577FF]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium text-[#150A35]">
                              {n.title}
                            </p>
                            {n.body && (
                              <p className="mt-0.5 text-xs text-echo-text-muted line-clamp-2">
                                {n.body}
                              </p>
                            )}
                          </div>
                          <span className="shrink-0 text-xs text-echo-text-muted">
                            {formatDate(n.createdAt)}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {n.workflow_id && (
                            <Link
                              href={`/dashboard/workflows/${n.workflow_id}`}
                              onClick={() => onOpenChange(false)}
                              className="echo-btn-secondary-accent inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium"
                            >
                              View workflow
                              <IconArrowRight className="h-3 w-3" />
                            </Link>
                          )}
                          {!n.read && (
                            <button
                              type="button"
                              onClick={() => markRead(n.id)}
                              className="inline-flex items-center gap-1 rounded-lg border border-[#150A35]/20 px-2 py-1 text-xs font-medium text-echo-text-muted hover:bg-[#150A35]/5"
                            >
                              <IconCheck className="h-3 w-3" />
                              Mark read
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <DrawerFooter className="shrink-0 border-t border-[#A577FF]/15 bg-white/80">
          <DrawerClose asChild>
            <Button variant="outline" className="border-[#A577FF]/30 text-[#150A35] hover:bg-[#A577FF]/10">
              Close
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
