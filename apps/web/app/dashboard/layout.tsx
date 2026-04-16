"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { DashboardProfileNavProvider } from "@/components/dashboard-profile-nav-context";
import { NotificationsDrawer } from "@/components/notifications-drawer";
import { NotificationsInboxProvider } from "@/components/notifications/notifications-inbox-context";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import {
  DASHBOARD_MAIN_CONTENT_MY_CLASS,
  DASHBOARD_MAIN_PAD_CLASS,
  DASHBOARD_MAIN_SURFACE_CLASS,
  DASHBOARD_SHELL_TOP_INSET_CLASS,
} from "@/lib/dashboard-shell";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores";

export default function DashboardRootLayout({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/signin");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (user) {
      router.prefetch("/dashboard/chat");
    }
  }, [user, router]);

  // Prevent body-level scroll — dashboard is a full-screen app
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (loading || !user) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-primary" />
      </div>
    );
  }

  return (
    <div
      style={
        {
          "--sidebar-width": "240px",
          "--header-height": "4.5rem",
        } as React.CSSProperties
      }
      className="flex h-screen min-h-0 w-full flex-col overflow-hidden bg-background md:flex-row"
    >
      <NotificationsInboxProvider>
        <SidebarProvider>
          <DashboardProfileNavProvider>
            <AppSidebar />
            <div
              className={cn(
                "flex min-h-0 min-w-0 flex-1 flex-col",
                DASHBOARD_SHELL_TOP_INSET_CLASS,
              )}
            >
              <SidebarInset className={DASHBOARD_MAIN_SURFACE_CLASS}>
                <SiteHeader />
                <div
                  className={cn(
                    "flex min-h-0 flex-1 flex-col overflow-hidden",
                    DASHBOARD_MAIN_PAD_CLASS,
                    DASHBOARD_MAIN_CONTENT_MY_CLASS,
                  )}
                >
                  {children}
                </div>
              </SidebarInset>
            </div>
            <NotificationsDrawer />
          </DashboardProfileNavProvider>
        </SidebarProvider>
      </NotificationsInboxProvider>
    </div>
  );
}
