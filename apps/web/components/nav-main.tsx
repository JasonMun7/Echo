"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { IconCirclePlusFilled } from "@tabler/icons-react";
import { DesktopCaptureLink } from "@/components/desktop-capture-link";

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  isDashboardNavActive,
  sidebarDashboardNavLinkClass,
  sidebarNavIconClass,
  sidebarNavLabelClass,
} from "@/lib/sidebar-nav-classes";
import { cn } from "@/lib/utils";

/** Matches `SidebarGroupLabel` row height (`px-2 py-1` + label line) so rail doesn’t jump when labels hide. */
const RAIL_SECTION_LABEL_ROW = "min-h-[1.75rem]";

export type NavMainItem = {
  title: string;
  url: string;
  /** Tabler or Lucide icons — must accept `className`; Lucide also uses `strokeWidth`. */
  icon?: ComponentType<{ className?: string; strokeWidth?: number }>;
};

export type NavMainSection = {
  label: string;
  items: NavMainItem[];
};

function NavItemRow({ item }: { item: NavMainItem }) {
  const pathname = usePathname();
  const { isRailMode } = useSidebar();
  const active = isDashboardNavActive(pathname, item.url);
  const linkClass = sidebarDashboardNavLinkClass(active);

  const inner = (
    <>
      {item.icon && <item.icon className={sidebarNavIconClass(active)} strokeWidth={1.75} />}
      <span
        className={cn(
          "min-w-0 truncate",
          sidebarNavLabelClass(active),
          !isRailMode && "flex-1",
          isRailMode && "sr-only",
        )}
      >
        {item.title}
      </span>
    </>
  );

  return (
    <SidebarMenuItem>
      {item.url.startsWith("echo-desktop://") ? (
        <SidebarMenuButton tooltip={item.title} asChild className={linkClass}>
          <a href={item.url}>{inner}</a>
        </SidebarMenuButton>
      ) : (
        <SidebarMenuButton tooltip={item.title} asChild className={linkClass}>
          <Link href={item.url} aria-current={active ? "page" : undefined}>
            {inner}
          </Link>
        </SidebarMenuButton>
      )}
    </SidebarMenuItem>
  );
}

export function NavMain({ sections }: { sections: NavMainSection[] }) {
  const { isRailMode } = useSidebar();

  return (
    <div className="flex flex-col gap-3">
      <SidebarGroup className="p-0">
        <SidebarGroupContent className="flex flex-col gap-2">
          <SidebarMenu>
            <SidebarMenuItem className="min-h-10">
              <SidebarMenuButton
                tooltip="Create workflow"
                variant="cta"
                asChild
                className={cn(
                  // Same height rail + expanded so width animation doesn’t reflow nav rows (.echo-btn-primary uses py-2.5 otherwise).
                  "!h-10 !min-h-10 !max-h-10 shrink-0 !rounded-lg !py-0 leading-none [&_a]:!py-0",
                  isRailMode
                    ? "!mx-auto !w-10 !min-w-10 !p-0 [&_a]:size-full [&_a]:min-w-0 [&_a]:justify-center [&_a]:gap-0"
                    : "w-full min-w-0 !px-4",
                )}
              >
                <DesktopCaptureLink
                  className={cn(
                    "flex min-h-0 items-center gap-2",
                    isRailMode
                      ? "size-full min-h-0 justify-center !px-0"
                      : "h-10 min-h-0 w-full justify-start text-left",
                  )}
                >
                  <IconCirclePlusFilled className="size-[18px] shrink-0" />
                  <span
                    className={cn("font-medium", isRailMode && "sr-only")}
                    aria-hidden={isRailMode}
                  >
                    Quick Create
                  </span>
                </DesktopCaptureLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <div className="flex flex-col gap-3">
        {sections.map((section, sectionIndex) => (
          <SidebarGroup key={section.label} className="p-0">
            {isRailMode ? (
              <div
                role="presentation"
                aria-hidden
                className={cn("flex shrink-0 items-center justify-center", RAIL_SECTION_LABEL_ROW)}
              >
                {/* Vertical cue in each label row (first row = after Quick Create, same min-height as “General”). */}
                <div className="h-5 w-px shrink-0 rounded-full bg-sidebar-border/70 dark:bg-sidebar-border/50" />
              </div>
            ) : (
              <SidebarGroupLabel className="px-2">{section.label}</SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => (
                  <NavItemRow key={item.title} item={item} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </div>
    </div>
  );
}
