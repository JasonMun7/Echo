"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import {
  IconCalendarClock,
  IconDashboard,
  IconInfoCircle,
  IconJumpRope,
  IconPlug,
  IconSearch,
  IconSettings,
  IconSparkles2,
  IconTool,
} from "@tabler/icons-react";

import GradientText from "@/components/reactbits/GradientText";
import { NavMain } from "@/components/nav-main";
import { NavSecondary } from "@/components/nav-secondary";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useAuthStore } from "@/stores";

const navMain = [
  { title: "Dashboard", url: "/dashboard", icon: IconDashboard },
  { title: "Workflows", url: "/dashboard/workflows", icon: IconJumpRope },
  { title: "EchoPrism", url: "echo-desktop://echoprism", icon: IconSparkles2 },
  { title: "MCP Tools", url: "/dashboard/mcp", icon: IconTool },
  { title: "Integrations", url: "/dashboard/integrations", icon: IconPlug },
  { title: "Schedule", url: "/dashboard/schedule", icon: IconCalendarClock },
];

const navSecondary = [
  { title: "Settings", url: "/dashboard/settings", icon: IconSettings },
  { title: "Get Help", url: "#", icon: IconInfoCircle },
  { title: "Search", url: "#", icon: IconSearch },
];

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const user = useAuthStore((s) => s.user);
  const authUser = user
    ? {
        name: user.displayName || user.email || "User",
        email: user.email || "",
        avatar: user.photoURL || "",
      }
    : { name: "User", email: "", avatar: "" };

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="p-1.5!">
              <Link
                href="/dashboard"
                className="flex items-center gap-2 text-sm font-normal text-white"
              >
                <Image
                  src="/echo_logo.png"
                  alt="Echo"
                  width={40}
                  height={40}
                  className="size-10 shrink-0 object-contain"
                  style={{ aspectRatio: "1" }}
                />
                <GradientText
                  colors={["#A577FF", "#21C4DD", "#A577FF"]}
                  animationSpeed={6}
                  className="font-semibold text-lg"
                >
                  <span>Echo Web</span>
                </GradientText>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
        <NavSecondary items={navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={authUser} />
      </SidebarFooter>
    </Sidebar>
  );
}
