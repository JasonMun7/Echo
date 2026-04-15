"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  Boxes,
  Calendar,
  Database,
  FileSearch,
  FileText,
  LayoutDashboard,
  LineChart,
  PlayCircle,
  Plug,
  PlusCircle,
  Sparkles,
  SquarePen,
  Workflow,
} from "lucide-react";

import {
  DashboardCommandMenu,
  DashboardSearchTrigger,
  useDashboardCommandPalette,
} from "@/components/dashboard-command-menu";
import { useNotificationsInbox } from "@/components/notifications/notifications-inbox-context";
import { ThemeToggle } from "@/components/theme-toggle";
import Orb from "@/components/reactbits/Orb";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getDashboardPageMetadata, type DashboardHeaderIconId } from "@/lib/dashboard-route-titles";
import { GradientIconWell } from "@/components/ui/gradient-icon-well";
import { DASHBOARD_INSET_X_CLASS } from "@/lib/dashboard-shell";
import { cn } from "@/lib/utils";

const HEADER_ICONS: Record<DashboardHeaderIconId, LucideIcon> = {
  "layout-dashboard": LayoutDashboard,
  workflow: Workflow,
  "plus-circle": PlusCircle,
  "play-circle": PlayCircle,
  "square-pen": SquarePen,
  "file-text": FileText,
  database: Database,
  "line-chart": LineChart,
  "file-search": FileSearch,
  sparkles: Sparkles,
  boxes: Boxes,
  plug: Plug,
  calendar: Calendar,
  bell: Bell,
};

interface SiteHeaderProps {
  /** Optional override; default is derived from the current path. */
  title?: string;
}

function EchoPrismOrbButton() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href="/dashboard/chat"
          aria-label="Open EchoPrism"
          className="flex size-10 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#21C4DD]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--sidebar)]"
        >
          <div className="size-10 overflow-hidden rounded-lg bg-muted">
            <Orb
              hue={0}
              hoverIntensity={0.3}
              rotateOnHover
              forceHoverState={false}
              backgroundColor="#eef1f7"
            />
          </div>
        </Link>
      </TooltipTrigger>
      <TooltipContent side="bottom">Open EchoPrism</TooltipContent>
    </Tooltip>
  );
}

function NotificationsButton() {
  const { unreadCount, setDrawerOpen } = useNotificationsInbox();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="relative size-9 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
      aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
      onClick={() => setDrawerOpen(true)}
    >
      <Bell className="size-[18px]" />
      {unreadCount > 0 ? (
        <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-gradient-to-r from-[#21C4DD] to-[#A577FF] px-0.5 text-[10px] font-semibold leading-none text-white shadow-sm ring-2 ring-sidebar">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      ) : null}
    </Button>
  );
}

export function SiteHeader({ title: titleProp }: SiteHeaderProps) {
  const pathname = usePathname();
  const { open, setOpen } = useDashboardCommandPalette();
  const meta = getDashboardPageMetadata(pathname ?? "/dashboard");
  const title = titleProp ?? meta.title;
  const HeaderIcon = HEADER_ICONS[meta.icon];

  return (
    <>
      <DashboardCommandMenu open={open} onOpenChange={setOpen} />
      <header
        className={cn(
          "flex shrink-0 flex-col border-0 bg-sidebar text-sidebar-foreground shadow-none",
          "transition-[width,height] ease-linear",
        )}
        style={{ minHeight: "var(--header-height, 4.5rem)" }}
      >
        <div
          className={cn(
            "flex min-h-[var(--header-height,4.5rem)] w-full items-center gap-3 py-2",
            DASHBOARD_INSET_X_CLASS,
          )}
        >
          <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
            <GradientIconWell corners="lg" className="h-8 w-8 shrink-0 sm:h-9 sm:w-9">
              <HeaderIcon
                className="h-3.5 w-3.5 text-card-foreground sm:h-4 sm:w-4"
                strokeWidth={1.75}
                aria-hidden
              />
            </GradientIconWell>
            <div className="min-w-0 max-w-[11rem] sm:max-w-[16rem] md:max-w-[18rem] lg:max-w-[22rem]">
              <h1 className="truncate text-xs font-semibold tracking-tight text-sidebar-foreground sm:text-sm lg:text-base">
                {title}
              </h1>
              <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-sidebar-foreground/65 sm:text-xs">
                {meta.description}
              </p>
            </div>
          </div>
          <div className="mx-auto my-3 flex min-w-0 flex-1 justify-center px-1 md:px-2">
            <DashboardSearchTrigger onClick={() => setOpen(true)} />
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <NotificationsButton />
            <ThemeToggle className="text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-foreground" />
            <EchoPrismOrbButton />
          </div>
        </div>
      </header>
    </>
  );
}
