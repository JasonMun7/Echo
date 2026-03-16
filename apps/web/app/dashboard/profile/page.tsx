"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  IconBrandGoogle,
  IconCheck,
  IconPencil,
  IconPhone,
} from "@tabler/icons-react";
import { toast } from "sonner";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/** E.164: optional +, then 10–15 digits (e.g. +18016741971 or 8016741971). */
function isValidE164(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  const digitsOnly = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) {
    return digitsOnly.length >= 10 && digitsOnly.length <= 15;
  }
  return digitsOnly.length >= 10 && digitsOnly.length <= 15;
}

async function apiFetch(path: string, options?: RequestInit) {
  const token = await useAuthStore.getState().getIdToken();
  return fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers || {}),
    },
  });
}

export default function ProfilePage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const [profile, setProfile] = useState<{
    display_name?: string;
    email?: string;
    phone?: string | null;
    createdAt?: unknown;
  } | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [editing, setEditing] = useState(false);
  const [editingPhone, setEditingPhone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingPhone, setSavingPhone] = useState(false);

  useEffect(() => {
    if (!user) {
      if (!loading) router.replace("/signin");
      return;
    }
    (async () => {
      try {
        const resp = await apiFetch("/api/users/me");
        if (resp.ok) {
          const data = await resp.json();
          setProfile(data);
          setDisplayName(data.display_name || user.displayName || "");
          setPhone(data.phone ?? "");
        }
      } catch {
        /* ignore */
      }
    })();
  }, [user, loading, router]);

  async function saveDisplayName() {
    setSaving(true);
    try {
      const resp = await apiFetch("/api/users/me", {
        method: "PUT",
        body: JSON.stringify({ display_name: displayName }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      toast.success("Display name updated");
      setEditing(false);
    } catch (e: unknown) {
      toast.error(
        `Failed: ${e instanceof Error ? e.message : "Unknown error"}`,
      );
    } finally {
      setSaving(false);
    }
  }

  async function savePhone() {
    const value = phone.trim() || null;
    if (value && !isValidE164(value)) {
      toast.error(
        "Enter a valid phone number in E.164 format (e.g. +18016741971)",
      );
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
      toast.error(
        `Failed: ${e instanceof Error ? e.message : "Unknown error"}`,
      );
    } finally {
      setSavingPhone(false);
    }
  }

  const createdAt = profile?.createdAt
    ? new Date(
        (profile.createdAt as { _seconds: number })._seconds * 1000,
      ).toLocaleDateString()
    : null;

  const initials = (user?.displayName || user?.email || "U")
    .split(" ")
    .map((s) => s[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="flex flex-1 flex-col gap-6  p-6 md:p-10">
      <h1 className="text-2xl font-bold text-[#1A1A2E]">Profile</h1>

      <div className="max-w-lg flex flex-col gap-6">
        {/* Avatar + name */}
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16 ring-2 ring-[#A577FF]/30 ring-offset-2">
            <AvatarImage src={user?.photoURL || ""} />
            <AvatarFallback className="bg-gradient-to-br from-[#A577FF] to-[#7C3AED] text-white text-xl font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="text-lg font-semibold text-[#1A1A2E]">
              {user?.displayName || "Echo User"}
            </p>
            <p className="text-sm text-gray-500">{user?.email}</p>
            {createdAt && (
              <p className="text-xs text-gray-400 mt-0.5">
                Member since {createdAt}
              </p>
            )}
          </div>
        </div>

        {/* Display name */}
        <div className="rounded-xl border border-[#A577FF]/20 p-5 flex flex-col gap-4">
          <h2 className="font-semibold text-[#1A1A2E]">Display Name</h2>
          {editing ? (
            <div className="flex flex-col gap-3">
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="border-[#A577FF]/30 focus-visible:ring-[#A577FF]/50"
                autoFocus
              />
              <div className="flex gap-2">
                <Button
                  onClick={saveDisplayName}
                  disabled={saving}
                  className="bg-gradient-to-r from-[#A577FF] to-[#7C3AED] text-white hover:opacity-90"
                >
                  <IconCheck className="mr-2 h-4 w-4" />
                  {saving ? "Saving..." : "Save"}
                </Button>
                <Button variant="outline" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-[#1A1A2E]">{displayName || "Not set"}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditing(true)}
                className="text-[#A577FF] hover:bg-[#A577FF]/10"
              >
                <IconPencil className="mr-1 h-4 w-4" />
                Edit
              </Button>
            </div>
          )}
        </div>

        {/* Phone (for telephony) */}
        <div className="rounded-xl border border-[#A577FF]/20 bg-[#F5F7FC]/50 p-5 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <IconPhone className="h-5 w-5 text-[#A577FF]" />
            <h2 className="font-semibold text-[#150A35]">Phone number</h2>
          </div>
          <p className="text-sm text-gray-600">
            Used when you call Echo by phone so we can greet you by name and
            show your workflows. Use E.164 format (e.g. +1 555 123 4567).
          </p>
          {editingPhone ? (
            <div className="flex flex-col gap-3">
              <Field data-invalid={phone.trim() !== "" && !isValidE164(phone)}>
                <FieldLabel htmlFor="profile-phone">Phone (E.164)</FieldLabel>
                <Input
                  id="profile-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+18016741971"
                  aria-invalid={phone.trim() !== "" && !isValidE164(phone)}
                  className={
                    phone.trim() !== "" && !isValidE164(phone)
                      ? "border-red-500 focus-visible:ring-red-500"
                      : "border-[#A577FF]/30 focus-visible:ring-[#A577FF]/50"
                  }
                  autoFocus
                />
                <FieldDescription
                  className={
                    phone.trim() !== "" && !isValidE164(phone)
                      ? "text-red-600"
                      : undefined
                  }
                >
                  {phone.trim() !== "" && !isValidE164(phone)
                    ? "Enter a valid E.164 number (e.g. +1801111111). Include country code so call recognition works."
                    : "Include + and country code (e.g. +1 for US) so we can recognize you when you call."}
                </FieldDescription>
              </Field>
              <div className="flex gap-2">
                <Button
                  onClick={savePhone}
                  disabled={
                    savingPhone || (phone.trim() !== "" && !isValidE164(phone))
                  }
                  className="bg-gradient-to-r from-[#A577FF] to-[#7C3AED] text-white hover:opacity-90"
                >
                  <IconCheck className="mr-2 h-4 w-4" />
                  {savingPhone ? "Saving..." : "Save"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditingPhone(false);
                    setPhone(profile?.phone ?? "");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-[#150A35]">{phone || "Not set"}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditingPhone(true)}
                className="text-[#A577FF] hover:bg-[#A577FF]/10"
              >
                <IconPencil className="mr-1 h-4 w-4" />
                Edit
              </Button>
            </div>
          )}
        </div>

        {/* Email (read-only) */}
        <div className="rounded-xl border border-[#A577FF]/20 p-5 flex flex-col gap-3">
          <h2 className="font-semibold text-[#1A1A2E]">Email</h2>
          <div className="flex items-center justify-between">
            <span className="text-[#1A1A2E]">{user?.email}</span>
            <Badge
              variant="outline"
              className="border-gray-200 text-gray-500 text-xs"
            >
              Read-only
            </Badge>
          </div>
        </div>

        {/* Sign-in provider */}
        <div className="rounded-xl border border-[#A577FF]/20 p-5 flex flex-col gap-3">
          <h2 className="font-semibold text-[#1A1A2E]">Sign-in Method</h2>
          <div className="flex items-center gap-2">
            {user?.providerData?.some((p) => p.providerId === "google.com") ? (
              <>
                <IconBrandGoogle className="h-5 w-5 text-[#4285F4]" />
                <span className="text-sm text-[#1A1A2E]">Google</span>
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 ml-auto text-xs">
                  Active
                </Badge>
              </>
            ) : (
              <span className="text-sm text-gray-500">Email & Password</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
