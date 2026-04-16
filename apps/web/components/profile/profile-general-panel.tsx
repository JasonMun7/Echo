"use client";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  GradientIconWell,
  GradientIconTag,
  gradientWellImageClass,
} from "@/components/ui/gradient-icon-well";
import {
  IconBrandGoogle,
  IconCheck,
  IconMail,
  IconPencil,
  IconPhone,
  IconUser,
  IconX,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { isValidE164, useProfileMe } from "@/hooks/use-profile-me";
import { ProfileBrandLogo } from "@/components/profile/profile-brand-logo";

function SectionCard({
  title,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card p-5 shadow-sm", className)}>
      <div className="mb-4 flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold tracking-tight text-foreground">{title}</h3>
      </div>
      {children}
    </div>
  );
}

export function ProfileGeneralPanel({ enabled = true }: { enabled?: boolean }) {
  const {
    user,
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
    profile,
  } = useProfileMe({ enabled });

  if (!user) return null;

  const initials = (user.displayName || user.email || "U")
    .split(" ")
    .map((s) => s[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="flex flex-col gap-5">
      {/* Profile card — reference-style top block */}
      <div className="rounded-2xl border border-border bg-muted/40 p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          <GradientIconWell corners="full" className="h-16 w-16 shrink-0">
            <Avatar className="size-full rounded-full border-0">
              <AvatarImage
                src={user.photoURL || ""}
                alt=""
                className={gradientWellImageClass("full")}
              />
              <AvatarFallback className="bg-muted text-lg font-bold text-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
          </GradientIconWell>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold text-foreground">
              {user.displayName || displayName || "Echo user"}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <IconMail className="size-3.5 shrink-0 opacity-70" />
                {user.email}
              </span>
              {memberSinceLabel && (
                <span className="text-muted-foreground/80">Member since {memberSinceLabel}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <SectionCard title="Profile details" icon={IconUser}>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Display name
            </label>
            {editing ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="border-border bg-background"
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={() => void saveDisplayName()}
                    disabled={saving}
                    className="echo-btn-primary shrink-0"
                  >
                    <IconCheck className="mr-1.5 size-4" />
                    {saving ? "Saving…" : "Save"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setEditing(false)}>
                    <IconX className="mr-1.5 size-4" aria-hidden />
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/50 px-3 py-2.5">
                <span className="text-sm text-foreground">{displayName || "Not set"}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(true)}
                  className="shrink-0 text-foreground hover:bg-muted"
                >
                  <IconPencil className="mr-1 size-4" />
                  Edit
                </Button>
              </div>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Phone (E.164)
            </label>
            <p className="mb-2 text-xs text-muted-foreground">
              Used when you call Echo by phone. Include country code.
            </p>
            {editingPhone ? (
              <div className="flex flex-col gap-3">
                <Field data-invalid={phone.trim() !== "" && !isValidE164(phone)}>
                  <FieldLabel htmlFor="profile-phone-modal" className="sr-only">
                    Phone
                  </FieldLabel>
                  <Input
                    id="profile-phone-modal"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+18016741971"
                    aria-invalid={phone.trim() !== "" && !isValidE164(phone)}
                    className={
                      phone.trim() !== "" && !isValidE164(phone)
                        ? "border-red-500"
                        : "border-border focus-visible:ring-ring/40"
                    }
                    autoFocus
                  />
                  <FieldDescription
                    className={
                      phone.trim() !== "" && !isValidE164(phone) ? "text-red-600" : undefined
                    }
                  >
                    {phone.trim() !== "" && !isValidE164(phone)
                      ? "Use a valid E.164 number with country code."
                      : null}
                  </FieldDescription>
                </Field>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={() => void savePhone()}
                    disabled={savingPhone || (phone.trim() !== "" && !isValidE164(phone))}
                    className="echo-btn-primary"
                  >
                    <IconCheck className="mr-1.5 size-4" />
                    {savingPhone ? "Saving…" : "Save"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setEditingPhone(false);
                      setPhone(profile?.phone ?? "");
                    }}
                  >
                    <IconX className="mr-1.5 size-4" aria-hidden />
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/50 px-3 py-2.5">
                <span className="flex items-center gap-2 text-sm text-foreground">
                  <IconPhone className="size-4 text-muted-foreground" />
                  {phone || "Not set"}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingPhone(true)}
                  className="text-foreground hover:bg-muted"
                >
                  <IconPencil className="mr-1 size-4" />
                  Edit
                </Button>
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Account" icon={IconMail}>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/50 px-3 py-3">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="truncate text-sm font-medium text-foreground">{user.email}</p>
            </div>
            <GradientIconTag
              size="sm"
              className="shrink-0"
              innerClassName="text-[10px] font-semibold uppercase tracking-wide text-foreground"
            >
              Verified
            </GradientIconTag>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/50 px-3 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">Sign-in method</p>
              <p className="text-xs text-muted-foreground">
                {user.providerData?.some((p) => p.providerId === "google.com")
                  ? "Google account"
                  : "Email and password"}
              </p>
            </div>
            {user.providerData?.some((p) => p.providerId === "google.com") ? (
              <ProfileBrandLogo
                domain="google.com"
                className="h-9 w-9"
                alt="Google"
                fallback={
                  <IconBrandGoogle
                    className="size-6 shrink-0 text-muted-foreground"
                    stroke={1.25}
                    aria-hidden
                  />
                }
              />
            ) : null}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
