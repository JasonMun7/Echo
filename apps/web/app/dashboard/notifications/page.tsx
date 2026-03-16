"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import {
  IconNotification,
  IconCheck,
  IconShare3,
  IconArrowRight,
} from "@tabler/icons-react";
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

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
    return () => { cancelled = true; };
  }, []);

  const markRead = async (id: string) => {
    const res = await apiFetch(`/api/notifications/${id}`, {
      method: "PATCH",
    });
    if (res.ok) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto bg-[#F5F7FC]">
      <div className="flex flex-col gap-6 p-6 md:p-10">
        <div>
          <h1 className="text-2xl font-semibold text-[#150A35]">
            Notifications
          </h1>
          <p className="mt-1 text-sm text-echo-text-muted">
            Workflow shares and other updates. Click to open or mark as read.
          </p>
        </div>

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
          <div className="echo-card flex flex-col items-center justify-center rounded-xl border border-[#A577FF]/20 bg-white/80 p-12 text-center">
            <IconNotification className="h-12 w-12 text-[#150A35]/20" />
            <p className="mt-3 text-base font-medium text-[#150A35]">
              No notifications yet
            </p>
            <p className="mt-1 text-sm text-echo-text-muted">
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
                  <div className="flex items-start gap-4 p-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#A577FF]/15">
                      <IconShare3 className="h-5 w-5 text-[#A577FF]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-[#150A35]">
                            {n.title}
                          </p>
                          {n.body && (
                            <p className="mt-0.5 text-sm text-echo-text-muted">
                              {n.body}
                            </p>
                          )}
                        </div>
                        <span className="shrink-0 text-xs text-echo-text-muted">
                          {formatDate(n.createdAt)}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {n.workflow_id && (
                          <Link
                            href={`/dashboard/workflows/${n.workflow_id}`}
                            className="echo-btn-secondary-accent inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium"
                          >
                            View workflow
                            <IconArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        )}
                        {!n.read && (
                          <button
                            type="button"
                            onClick={() => markRead(n.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[#150A35]/20 px-2.5 py-1.5 text-sm font-medium text-echo-text-muted hover:bg-[#150A35]/5"
                          >
                            <IconCheck className="h-3.5 w-3.5" />
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
    </div>
  );
}
