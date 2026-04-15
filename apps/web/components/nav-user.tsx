"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  IconCreditCard,
  IconDotsVertical,
  IconHome,
  IconLogout,
  IconNotification,
  IconUserCircle,
} from "@tabler/icons-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useNotificationsInbox } from "@/components/notifications/notifications-inbox-context";
import { useDashboardProfileNav } from "@/components/dashboard-profile-nav-context";
import { useAuthStore } from "@/stores";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export function NavUser({
  user,
}: {
  user: {
    name: string;
    email: string;
    avatar: string;
  };
}) {
  const { isRailMode, setKeepExpanded } = useSidebar();
  const isMobile = useIsMobile();
  const signOut = useAuthStore((s) => s.signOut);
  const router = useRouter();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const { openProfile } = useDashboardProfileNav();

  useEffect(() => {
    // Dropdown + notifications portaled beside the rail — keep expanded while interacting.
    // Profile modal is separate UI; collapsing the sidebar when it opens (below).
    setKeepExpanded(dropdownOpen || notificationsOpen);
  }, [dropdownOpen, notificationsOpen, setKeepExpanded]);

  /** Profile opens via context (also collapses the rail). */
  const handleOpenProfile = () => openProfile();

  const handleLogout = async () => {
    await signOut();
    router.replace("/signin");
  };

  const initials = user.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu onOpenChange={setDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className={cn(
                "min-w-0 max-w-full text-sidebar-foreground",
                isRailMode && "px-1.5",
                "data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground",
              )}
            >
              <Avatar className="h-8 w-8 rounded-lg border border-sidebar-border">
                <AvatarImage src={user.avatar || undefined} alt={user.name} />
                <AvatarFallback className="rounded-lg bg-sidebar-accent text-sidebar-foreground text-xs">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div
                className={cn(
                  "grid min-w-0 flex-1 text-left text-xs leading-tight",
                  isRailMode && "hidden",
                )}
              >
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-[11px] text-muted-foreground">{user.email}</span>
              </div>
              <IconDotsVertical
                className={cn(
                  "ml-auto size-4 shrink-0 text-muted-foreground",
                  isRailMode && "hidden",
                )}
              />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg border-border bg-popover text-popover-foreground"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm text-popover-foreground">
                <Avatar className="h-8 w-8 rounded-lg border border-border">
                  <AvatarImage src={user.avatar || undefined} alt={user.name} />
                  <AvatarFallback className="rounded-lg bg-muted text-muted-foreground text-xs">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={handleOpenProfile}>
                <IconUserCircle className="size-4" />
                Account
              </DropdownMenuItem>
              <DropdownMenuItem>
                <IconCreditCard className="size-4" />
                Billing
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setNotificationsOpen(true)}>
                <IconNotification className="size-4" />
                Notifications
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/" className="flex items-center gap-2">
                <IconHome className="size-4" />
                Back to landing page
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleLogout}>
              <IconLogout className="size-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
