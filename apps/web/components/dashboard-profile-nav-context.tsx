"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { ProfileModal, type ProfileModalSection } from "@/components/profile/profile-modal";
import { useSidebar } from "@/components/ui/sidebar";

type DashboardProfileNavContextValue = {
  openProfile: (section?: ProfileModalSection) => void;
};

const DashboardProfileNavContext = createContext<DashboardProfileNavContextValue | null>(null);

export function DashboardProfileNavProvider({ children }: { children: ReactNode }) {
  const { setOpen: setSidebarOpen } = useSidebar();
  const [open, setOpen] = useState(false);
  const [initialSection, setInitialSection] = useState<ProfileModalSection | undefined>(undefined);

  const openProfile = useCallback(
    (section?: ProfileModalSection) => {
      setSidebarOpen(false);
      setInitialSection(section);
      setOpen(true);
    },
    [setSidebarOpen],
  );

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) queueMicrotask(() => setInitialSection(undefined));
  }, []);

  const value = useMemo(
    () => ({
      openProfile,
    }),
    [openProfile],
  );

  return (
    <DashboardProfileNavContext.Provider value={value}>
      {children}
      <ProfileModal open={open} onOpenChange={handleOpenChange} initialSection={initialSection} />
    </DashboardProfileNavContext.Provider>
  );
}

export function useDashboardProfileNav(): DashboardProfileNavContextValue {
  const ctx = useContext(DashboardProfileNavContext);
  if (!ctx) {
    throw new Error("useDashboardProfileNav must be used within DashboardProfileNavProvider");
  }
  return ctx;
}
