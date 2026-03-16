"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useAuthStore } from "@/stores";

export default function DashboardRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/signin");
    }
  }, [loading, user, router]);

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
      <div className="flex h-screen w-full items-center justify-center bg-[#F5F7FC]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#A577FF] border-t-transparent" />
      </div>
    );
  }

  return (
    <div
      style={
        {
          "--sidebar-width": "18rem",
          "--header-height": "3rem",
        } as React.CSSProperties
      }
      className="flex h-screen w-full flex-col md:flex-row overflow-hidden"
    >
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <SiteHeader />
          <div className="flex min-h-0 flex-1 flex-col bg-[#F5F7FC]">
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
