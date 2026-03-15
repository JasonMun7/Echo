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
          <div className="flex flex-1 flex-col min-h-0 overflow-y-auto bg-[#F5F7FC]">
            <div className="@container/main flex flex-1 flex-col min-h-0 gap-2">
              <div className="flex min-h-0 flex-1 flex-col gap-4 py-2 pb-4 md:gap-6 md:py-2 md:pb-6">
                {children}
              </div>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
