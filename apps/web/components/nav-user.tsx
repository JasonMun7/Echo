"use client";

import { useState } from "react";
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

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
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
} from "@/components/ui/sidebar";
import { NotificationsDrawer } from "@/components/notifications-drawer";
import { useAuthStore } from "@/stores";
import { useIsMobile } from "@/hooks/use-mobile";

export function NavUser({
  user,
}: {
  user: {
    name: string;
    email: string;
    avatar: string;
  };
}) {
  const isMobile = useIsMobile();
  const signOut = useAuthStore((s) => s.signOut);
  const router = useRouter();
  const [notificationsOpen, setNotificationsOpen] = useState(false);

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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-white/10 data-[state=open]:text-white"
            >
              <Avatar className="h-8 w-8 rounded-lg border border-white/20">
                <AvatarImage src={user.avatar || undefined} alt={user.name} />
                <AvatarFallback className="rounded-lg bg-[#A577FF]/20 text-white text-xs">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium text-white">{user.name}</span>
                <span className="truncate text-xs text-white/70">
                  {user.email}
                </span>
              </div>
              <IconDotsVertical className="ml-auto size-4 text-white/80" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg border-[#A577FF]/20 bg-[#F5F7FC]"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={user.avatar || undefined} alt={user.name} />
                  <AvatarFallback className="rounded-lg bg-[#A577FF]/20 text-[#150A35] text-xs">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium text-[#150A35]">{user.name}</span>
                  <span className="truncate text-xs text-echo-text-muted">
                    {user.email}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-[#A577FF]/20" />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild className="text-[#150A35] focus:bg-[#A577FF]/10">
                <Link href="/dashboard/profile" className="flex items-center gap-2">
                  <IconUserCircle className="size-4" />
                  Account
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem className="text-[#150A35] focus:bg-[#A577FF]/10">
                <IconCreditCard className="size-4" />
                Billing
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-[#150A35] focus:bg-[#A577FF]/10"
                onSelect={() => setNotificationsOpen(true)}
              >
                <IconNotification className="size-4" />
                Notifications
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator className="bg-[#A577FF]/20" />
            <DropdownMenuItem asChild className="text-[#150A35] focus:bg-[#A577FF]/10 focus:text-[#150A35]">
              <Link href="/" className="flex items-center gap-2">
                <IconHome className="size-4" />
                Back to landing page
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-[#150A35] focus:bg-[#A577FF]/10 focus:text-[#150A35]"
              onClick={handleLogout}
            >
              <IconLogout className="size-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
      <NotificationsDrawer
        open={notificationsOpen}
        onOpenChange={setNotificationsOpen}
      />
    </SidebarMenu>
  );
}
