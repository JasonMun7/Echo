"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/stores";

export type ProfileMe = {
  display_name?: string;
  email?: string;
  phone?: string | null;
  createdAt?: unknown;
  created_at?: unknown;
};

/** E.164: optional +, then 10–15 digits. */
export function isValidE164(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  const digitsOnly = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) {
    return digitsOnly.length >= 10 && digitsOnly.length <= 15;
  }
  return digitsOnly.length >= 10 && digitsOnly.length <= 15;
}

export function parseProfileDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === "object") {
    const maybeTimestamp = value as {
      _seconds?: number;
      seconds?: number;
      toDate?: () => Date;
    };
    if (typeof maybeTimestamp.toDate === "function") {
      const parsed = maybeTimestamp.toDate();
      if (parsed instanceof Date && !Number.isNaN(parsed.getTime())) return parsed;
    }
    const seconds = maybeTimestamp._seconds ?? maybeTimestamp.seconds;
    if (typeof seconds === "number") {
      const parsed = new Date(seconds * 1000);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
  }
  return null;
}

export function useProfileMe(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);

  const [profile, setProfile] = useState<ProfileMe | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [editing, setEditing] = useState(false);
  const [editingPhone, setEditingPhone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingPhone, setSavingPhone] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const resp = await apiFetch("/api/users/me");
      if (resp.ok) {
        const data = (await resp.json()) as ProfileMe;
        setProfile(data);
        setDisplayName(data.display_name || user.displayName || "");
        setPhone(data.phone ?? "");
      }
    } catch {
      /* keep stale UI */
    }
  }, [user]);

  useEffect(() => {
    if (!enabled) return;
    if (!user) {
      if (!loading) router.replace("/signin");
      return;
    }
    void refresh();
  }, [enabled, user, loading, router, refresh]);

  const saveDisplayName = async () => {
    setSaving(true);
    try {
      const resp = await apiFetch("/api/users/me", {
        method: "PUT",
        body: JSON.stringify({ display_name: displayName }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      toast.success("Display name updated");
      setEditing(false);
      await refresh();
    } catch (e: unknown) {
      toast.error(`Failed: ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  };

  const savePhone = async () => {
    const value = phone.trim() || null;
    if (value && !isValidE164(value)) {
      toast.error("Enter a valid phone number in E.164 format (e.g. +18016741971)");
      return;
    }
    setSavingPhone(true);
    try {
      const resp = await apiFetch("/api/users/me", {
        method: "PUT",
        body: JSON.stringify({ phone: value }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      setProfile((p) => (p ? { ...p, phone: value ?? undefined } : null));
      toast.success(value ? "Phone number saved" : "Phone number cleared");
      setEditingPhone(false);
    } catch (e: unknown) {
      toast.error(`Failed: ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally {
      setSavingPhone(false);
    }
  };

  const createdAtDate =
    parseProfileDate(profile?.createdAt) ?? parseProfileDate(profile?.created_at);
  const memberSinceLabel = createdAtDate
    ? createdAtDate.toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : null;

  return {
    user,
    profile,
    refresh,
    displayName,
    setDisplayName,
    phone,
    setPhone,
    editing,
    setEditing,
    editingPhone,
    setEditingPhone,
    saving,
    savingPhone,
    saveDisplayName,
    savePhone,
    memberSinceLabel,
  };
}
