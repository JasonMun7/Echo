"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/stores";

export type InboxNotification = {
  id: string;
  to_uid?: string;
  type?: string;
  title: string;
  body?: string;
  workflow_id?: string;
  workflow_name?: string;
  from_uid?: string;
  from_name?: string;
  from_photo_url?: string;
  invite_id?: string;
  read?: boolean;
  createdAt?: unknown;
  readAt?: unknown;
};

type NotificationsInboxContextValue = {
  notifications: InboxNotification[];
  unreadCount: number;
  loading: boolean;
  drawerOpen: boolean;
  setDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  markRead: (id: string) => Promise<void>;
  deleteNotification: (id: string) => Promise<boolean>;
  deleteAllNotifications: () => Promise<boolean>;
  markAllRead: () => Promise<boolean>;
  /** Firestore doc ids for `workflow_invites` with status `pending` for the current user. */
  pendingWorkflowInviteIds: ReadonlySet<string>;
};

const NotificationsInboxContext = createContext<NotificationsInboxContextValue | null>(null);

const INBOX_LIMIT = 50;

export function NotificationsInboxProvider({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const uid = user?.uid ?? null;

  const [notifications, setNotifications] = useState<InboxNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pendingWorkflowInviteIds, setPendingWorkflowInviteIds] = useState<Set<string>>(
    () => new Set(),
  );

  const initialSnapDoneRef = useRef(false);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const toastedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!uid || !db) {
      setNotifications([]);
      setLoading(false);
      initialSnapDoneRef.current = false;
      knownIdsRef.current = new Set();
      toastedIdsRef.current = new Set();
      return;
    }

    setLoading(true);
    const q = query(
      collection(db, "notifications"),
      where("to_uid", "==", uid),
      orderBy("createdAt", "desc"),
      limit(INBOX_LIMIT),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: InboxNotification[] = [];
        const incomingIds = new Set<string>();

        for (const d of snap.docs) {
          incomingIds.add(d.id);
          rows.push({ id: d.id, ...(d.data() as Omit<InboxNotification, "id">) });
        }

        setNotifications(rows);
        setLoading(false);

        if (!initialSnapDoneRef.current) {
          initialSnapDoneRef.current = true;
          knownIdsRef.current = incomingIds;
          return;
        }

        for (const id of incomingIds) {
          if (knownIdsRef.current.has(id)) continue;
          const n = rows.find((x) => x.id === id);
          if (!n || n.read) continue;
          if (toastedIdsRef.current.has(id)) continue;
          toastedIdsRef.current.add(id);
          toast.info(n.title, {
            description: n.body,
            duration: 6_000,
            action: n.workflow_id
              ? {
                  label: "Open",
                  onClick: () => {
                    window.location.href = `/dashboard/workflows/${n.workflow_id}`;
                  },
                }
              : undefined,
          });
        }

        knownIdsRef.current = incomingIds;
      },
      (err) => {
        console.warn("[notifications-inbox] snapshot error:", err);
        setLoading(false);
      },
    );

    return () => {
      unsub();
      initialSnapDoneRef.current = false;
      knownIdsRef.current = new Set();
      toastedIdsRef.current = new Set();
    };
  }, [uid]);

  useEffect(() => {
    if (!uid || !db) {
      setPendingWorkflowInviteIds(new Set());
      return;
    }
    const q = query(
      collection(db, "workflow_invites"),
      where("to_uid", "==", uid),
      where("status", "==", "pending"),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setPendingWorkflowInviteIds(new Set(snap.docs.map((d) => d.id)));
      },
      (err) => {
        console.warn("[notifications-inbox] workflow_invites snapshot error:", err);
      },
    );
    return () => unsub();
  }, [uid]);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  const markRead = useCallback(async (id: string) => {
    const res = await apiFetch(`/api/notifications/${id}`, { method: "PATCH" });
    if (res.ok) {
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    }
  }, []);

  const deleteNotification = useCallback(async (id: string) => {
    const res = await apiFetch(`/api/notifications/${id}`, { method: "DELETE" });
    if (res.ok) {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      return true;
    }
    return false;
  }, []);

  const deleteAllNotifications = useCallback(async () => {
    const res = await apiFetch("/api/notifications/delete-all", { method: "POST" });
    if (res.ok) {
      setNotifications([]);
      return true;
    }
    return false;
  }, []);

  const markAllRead = useCallback(async () => {
    const res = await apiFetch("/api/notifications/mark-all-read", { method: "POST" });
    if (res.ok) {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      return true;
    }
    return false;
  }, []);

  const value = useMemo<NotificationsInboxContextValue>(
    () => ({
      notifications,
      unreadCount,
      loading,
      drawerOpen,
      setDrawerOpen,
      markRead,
      deleteNotification,
      deleteAllNotifications,
      markAllRead,
      pendingWorkflowInviteIds,
    }),
    [
      notifications,
      unreadCount,
      loading,
      drawerOpen,
      markRead,
      deleteNotification,
      deleteAllNotifications,
      markAllRead,
      pendingWorkflowInviteIds,
    ],
  );

  return (
    <NotificationsInboxContext.Provider value={value}>
      {children}
    </NotificationsInboxContext.Provider>
  );
}

export function useNotificationsInbox() {
  const ctx = useContext(NotificationsInboxContext);
  if (!ctx) {
    throw new Error("useNotificationsInbox must be used within NotificationsInboxProvider");
  }
  return ctx;
}
