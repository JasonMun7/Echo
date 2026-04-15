"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { Boxes, Calendar, LayoutDashboard, Plug, Sparkles, Workflow } from "lucide-react";

import GradientText from "@/components/reactbits/GradientText";
import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuthStore } from "@/stores";
import { cn } from "@/lib/utils";

/** Match `HEADER_ICONS` / `dashboard-route-titles` for each route (site header). */
const navSections = [
  {
    label: "General",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
      { title: "Workflows", url: "/dashboard/workflows", icon: Workflow },
    ],
  },
  {
    label: "Echo",
    items: [{ title: "EchoPrism", url: "/dashboard/chat", icon: Sparkles }],
  },
  {
    label: "Tools",
    items: [
      { title: "MCP Tools", url: "/dashboard/mcp", icon: Boxes },
      { title: "Integrations", url: "/dashboard/integrations", icon: Plug },
      { title: "Schedule", url: "/dashboard/schedule", icon: Calendar },
    ],
  },
];

function SidebarBrand() {
  const { isRailMode } = useSidebar();

  return (
    <Link
      href="/dashboard"
      aria-label={isRailMode ? "Echo home" : undefined}
      className={cn(
        "flex shrink-0 items-center rounded-lg text-sidebar-foreground transition-colors hover:bg-sidebar-accent",
        // Rail: full header width + inner box centers the mark (avoids clipped w-10 in a tight column).
        isRailMode
          ? "m-0 box-border h-10 min-h-10 w-full min-w-0 justify-center p-0"
          : "min-w-0 w-full gap-2 py-1",
      )}
    >
      <span
        className={cn(
          "flex shrink-0 items-center justify-center",
          isRailMode && "box-border size-10",
        )}
      >
        <Image
          src="/echo_logo.png"
          alt=""
          width={36}
          height={36}
          className={cn(
            "m-0 block size-9 shrink-0 object-contain object-center",
            // Optical: asset reads slightly left-heavy in the square.
            isRailMode && "translate-x-px",
          )}
          style={{ aspectRatio: "1" }}
        />
      </span>
      {!isRailMode ? (
        <GradientText
          colors={["#A577FF", "#21C4DD", "#A577FF"]}
          animationSpeed={6}
          className="min-w-0 truncate font-semibold text-base"
        >
          <span>Echo Web</span>
        </GradientText>
      ) : null}
    </Link>
  );
}

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const { isRailMode } = useSidebar();
  const user = useAuthStore((s) => s.user);
  const authUser = user
    ? {
        name: user.displayName || user.email || "User",
        email: user.email || "",
        avatar: user.photoURL || "",
      }
    : { name: "User", email: "", avatar: "" };

  return (
    <Sidebar {...props}>
      {/* Match SidebarContent horizontal padding (`p-2`) so the logo centers on the same column as nav icons. */}
      <SidebarHeader className="gap-0 px-2 py-0">
        <div
          className={cn(
            "flex w-full min-w-0 items-center",
            isRailMode ? "justify-center" : "justify-start",
          )}
        >
          <SidebarBrand />
        </div>
      </SidebarHeader>
      <SidebarContent className="gap-3">
        <NavMain sections={navSections} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={authUser} />
      </SidebarFooter>
    </Sidebar>
  );
}
