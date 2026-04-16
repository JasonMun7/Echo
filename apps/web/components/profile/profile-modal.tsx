"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IconHelp, IconHome, IconLogout, IconSettings, IconUser, IconX } from "@tabler/icons-react";
import { Bell, Palette } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { GradientIconWell } from "@/components/ui/gradient-icon-well";
import { ProfileAccountPanel } from "@/components/profile/profile-account-panel";
import { ProfileAppearancePanel } from "@/components/profile/profile-appearance-panel";
import { ProfileGeneralPanel } from "@/components/profile/profile-general-panel";
import { ProfileHelpPanel } from "@/components/profile/profile-help-panel";
import { ProfileNotificationsPanel } from "@/components/profile/profile-notifications-panel";
import { useAuthStore } from "@/stores";
import { useRouter } from "next/navigation";
import {
  sidebarModalNavLinkClass,
  sidebarNavIconClass,
  sidebarNavLabelClass,
} from "@/lib/sidebar-nav-classes";
import { PROFILE_MODAL_MAIN_SURFACE_CLASS } from "@/lib/dashboard-shell";
import {
  DASHBOARD_PAGE_DESCRIPTION_CLASS,
  DASHBOARD_PAGE_TITLE_CLASS,
} from "@/lib/dashboard-page-typography";
import { cn } from "@/lib/utils";

export type ProfileModalSection = "general" | "appearance" | "notifications" | "account" | "help";

type Section = ProfileModalSection;

const NAV: {
  section: Section;
  label: string;
  icon: typeof IconUser | typeof Bell | typeof Palette | typeof IconSettings | typeof IconHelp;
}[] = [
  { section: "general", label: "General", icon: IconUser },
  { section: "appearance", label: "Appearance", icon: Palette },
  { section: "notifications", label: "Notifications", icon: Bell },
  { section: "account", label: "Account", icon: IconSettings },
  { section: "help", label: "Help", icon: IconHelp },
];

export function ProfileModal({
  open,
  onOpenChange,
  /** When opening (e.g. from command palette), start on this section. */
  initialSection,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSection?: ProfileModalSection;
}) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const [section, setSection] = useState<Section>("general");

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => setSection(initialSection ?? "general"));
  }, [open, initialSection]);

  const handleLogout = async () => {
    onOpenChange(false);
    await signOut();
    router.replace("/signin");
  };

  const initials = (user?.displayName || user?.email || "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const titles: Record<Section, { title: string; subtitle: string }> = {
    general: { title: "General", subtitle: "Profile and account" },
    appearance: { title: "Appearance", subtitle: "Theme and display" },
    notifications: { title: "Notifications", subtitle: "Alerts and EchoPrism" },
    account: { title: "Account", subtitle: "Security and data" },
    help: { title: "Help", subtitle: "Contact and support" },
  };

  const SectionHeaderIcon = NAV.find((n) => n.section === section)?.icon ?? IconUser;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          "flex h-[min(88vh,calc(100vh-2.5rem))] min-h-[480px] w-[calc(100%-1.5rem)] max-w-[calc(100%-1.5rem)] md:w-[50vw] md:max-w-[50vw] flex-col gap-0 overflow-hidden rounded-2xl border border-border bg-card p-0 shadow-xl",
          // Inset from top like dashboard shell (`pt-2` vibe) so the dimmed backdrop reads behind the modal
          "top-8 left-[50%] z-50 max-h-[min(88vh,calc(100vh-2.5rem))] -translate-x-1/2 translate-y-0 sm:top-10",
        )}
      >
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {/* Settings modal — left rail: deemphasized canvas (`.echo-sidebar-inset`), same as dashboard sidebar */}
          <aside
            className={cn(
              "echo-sidebar-inset flex w-full shrink-0 flex-col rounded-t-2xl md:w-[220px] md:rounded-t-none md:rounded-l-2xl",
            )}
          >
            <div className="flex items-center justify-between border-b border-border/50 px-4 py-3 md:block">
              <div className="flex min-w-0 items-center gap-2.5">
                <GradientIconWell corners="full" className="size-9 shrink-0">
                  <Avatar className="size-full rounded-full border-0">
                    <AvatarImage
                      src={user?.photoURL || undefined}
                      alt=""
                      className="object-cover"
                    />
                    <AvatarFallback className="rounded-full bg-muted text-xs font-semibold text-foreground">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                </GradientIconWell>
                <div className="min-w-0 md:px-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {user?.displayName || "Echo user"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 text-muted-foreground hover:bg-muted md:hidden"
                onClick={() => onOpenChange(false)}
                aria-label="Close"
              >
                <IconX className="size-5" />
              </Button>
            </div>

            <nav className="flex flex-1 flex-col gap-1 p-3">
              <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Preferences
              </p>
              {NAV.map(({ section: id, label, icon: Icon }) => {
                const active = section === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSection(id)}
                    className={sidebarModalNavLinkClass(active)}
                  >
                    <Icon className={sidebarNavIconClass(active)} />
                    <span className={sidebarNavLabelClass(active)}>{label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="mt-auto flex flex-col gap-2 border-t border-border/50 p-3">
              <Button
                type="button"
                variant="ghost"
                className="echo-sidebar-nav-item h-auto w-full justify-start gap-2 rounded-sm px-2 py-1.5 text-muted-foreground hover:text-foreground"
                asChild
              >
                <Link
                  href="/"
                  onClick={() => onOpenChange(false)}
                  className="flex items-center gap-2"
                >
                  <IconHome className="size-4 shrink-0 opacity-80" />
                  Back to landing page
                </Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-center gap-2 border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground"
                onClick={handleLogout}
              >
                <IconLogout className="size-4" />
                Sign out
              </Button>
            </div>
          </aside>

          {/* Main — emphasized card surface (see PROFILE_MODAL_MAIN_SURFACE_CLASS); rail stays canvas */}
          <div
            className={cn(
              "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
              PROFILE_MODAL_MAIN_SURFACE_CLASS,
              "rounded-b-2xl md:rounded-r-2xl md:rounded-bl-none",
            )}
          >
            <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border/60 bg-transparent px-5 py-3.5 text-card-foreground">
              <div className="flex min-w-0 items-start gap-3">
                <GradientIconWell className="mt-0.5 inline-flex h-10 w-10 shrink-0">
                  <SectionHeaderIcon className="h-5 w-5 text-card-foreground" aria-hidden />
                </GradientIconWell>
                <div className="min-w-0">
                  <h2 className={cn(DASHBOARD_PAGE_TITLE_CLASS, "text-card-foreground")}>
                    {titles[section].title}
                  </h2>
                  <p className={cn(DASHBOARD_PAGE_DESCRIPTION_CLASS, "mt-1")}>
                    {titles[section].subtitle}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="hidden shrink-0 text-muted-foreground hover:bg-muted md:inline-flex"
                onClick={() => onOpenChange(false)}
                aria-label="Close"
              >
                <IconX className="size-5" />
              </Button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-transparent px-5 py-5">
              <div className="mx-auto w-full max-w-2xl">
                {section === "general" && <ProfileGeneralPanel enabled={open} />}
                {section === "appearance" && <ProfileAppearancePanel />}
                {section === "notifications" && <ProfileNotificationsPanel />}
                {section === "account" && <ProfileAccountPanel />}
                {section === "help" && <ProfileHelpPanel />}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
