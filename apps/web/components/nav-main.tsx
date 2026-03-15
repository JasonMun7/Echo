"use client";

import Link from "next/link";
import { IconCirclePlusFilled, type Icon } from "@tabler/icons-react";
import { DesktopCaptureLink } from "@/components/desktop-capture-link";

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export function NavMain({
  items,
}: {
  items: {
    title: string;
    url: string;
    icon?: Icon;
  }[];
}) {
  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-2">
            <SidebarMenuButton
              tooltip="Create workflow"
              asChild
              className="min-w-8 rounded-lg echo-btn-cyan-lavender"
            >
              <DesktopCaptureLink>
                <IconCirclePlusFilled className="size-5" />
                <span>Quick Create</span>
              </DesktopCaptureLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              {item.url.startsWith("echo-desktop://") ? (
                <SidebarMenuButton tooltip={item.title} asChild>
                  <a href={item.url}>
                    {item.icon && <item.icon className="size-5 shrink-0" />}
                    <span>{item.title}</span>
                  </a>
                </SidebarMenuButton>
              ) : (
                <SidebarMenuButton tooltip={item.title} asChild>
                  <Link href={item.url}>
                    {item.icon && <item.icon className="size-5 shrink-0" />}
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              )}
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
