"use client";

import React, { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Sidebar, SidebarBody, SidebarLink, useSidebar } from "@/components/ui/sidebar";
import {
  IconArrowLeft,
  IconBrandTabler,
  IconList,
  IconSettings,
  IconBrain,
  IconSparkles2,
  IconTool,
  IconPlug,
  IconCalendarClock,
} from "@tabler/icons-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { auth, db } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { Skeleton } from "@/components/ui/skeleton";

export function DashboardLayout({ children }: { children?: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  const [user, setUser] = useState(auth?.currentUser ?? null);
  const [activeRunCount, setActiveRunCount] = useState(0);
  const [awaitingUserCount, setAwaitingUserCount] = useState(0);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!auth) return;
    const unsubscribe = auth.onAuthStateChanged((u) => {
      setUser(u);
      if (!u) {
        router.replace("/signin");
      }
    });
    return () => unsubscribe();
  }, [router]);

  // Real-time active run indicator — properly unsubscribes nested listeners on cleanup
  useEffect(() => {
    if (!user || !db) return;

    // Map of workflowId → unsubscribe fn for that workflow's runs listener
    const runUnsubs = new Map<string, () => void>();
    const runCounts = new Map<string, { running: number; awaiting: number }>();

    function recompute() {
      let totalRunning = 0;
      let totalAwaiting = 0;
      runCounts.forEach((c) => {
        totalRunning += c.running;
        totalAwaiting += c.awaiting;
      });
      setActiveRunCount(totalRunning);
      setAwaitingUserCount(totalAwaiting);
    }

    const q = query(collection(db, "workflows"), where("owner_uid", "==", user.uid));
    const unsubWf = onSnapshot(q, (wfSnap) => {
      const currentIds = new Set(wfSnap.docs.map((d) => d.id));

      // Unsubscribe + remove counts for deleted workflows
      runUnsubs.forEach((unsub, id) => {
        if (!currentIds.has(id)) {
          unsub();
          runUnsubs.delete(id);
          runCounts.delete(id);
        }
      });

      if (currentIds.size === 0) {
        setActiveRunCount(0);
        setAwaitingUserCount(0);
        return;
      }

      // Subscribe to runs for any newly-seen workflows
      wfSnap.docs.forEach((wfDoc) => {
        if (runUnsubs.has(wfDoc.id)) return;
        const runsRef = collection(db, "workflows", wfDoc.id, "runs");
        const runQ = query(runsRef, where("status", "in", ["running", "awaiting_user"]));
        const unsub = onSnapshot(
          runQ,
          (snap) => {
            let running = 0;
            let awaiting = 0;
            snap.docs.forEach((d) => {
              if (d.data().status === "running") running++;
              if (d.data().status === "awaiting_user") awaiting++;
            });
            runCounts.set(wfDoc.id, { running, awaiting });
            recompute();
          },
          () => {
            // Permission error (e.g. workflow was deleted mid-listen) — clean up silently
            runUnsubs.get(wfDoc.id)?.();
            runUnsubs.delete(wfDoc.id);
            runCounts.delete(wfDoc.id);
            recompute();
          },
        );
        runUnsubs.set(wfDoc.id, unsub);
      });
    });

    return () => {
      unsubWf();
      runUnsubs.forEach((unsub) => unsub());
      runUnsubs.clear();
    };
  }, [user]);

  const handleLogout = async () => {
    if (auth) {
      await signOut(auth);
      router.replace("/signin");
    }
  };

  if (!user) {
    return (
      <div className="flex h-screen w-full min-h-screen overflow-hidden bg-[#F5F7FC]">
        {/* Sidebar skeleton */}
        <div className="flex w-[60px] shrink-0 flex-col gap-4 bg-linear-to-b from-[#150A35] to-[#2d1b69] p-4 md:w-64">
          <Skeleton className="h-5 w-6 rounded-tl-lg rounded-tr-sm rounded-br-lg rounded-bl-sm bg-[#A577FF]/30" />
          <div className="mt-4 flex flex-col gap-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-5 w-5 shrink-0 rounded-md bg-white/15" />
                <Skeleton className="hidden h-4 w-24 rounded-md bg-white/15 md:block" />
              </div>
            ))}
          </div>
        </div>
        {/* Content skeleton */}
        <div className="flex flex-1 flex-col gap-6 rounded-tl-2xl border border-[#A577FF]/20 bg-white p-6 md:p-10">
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-8 w-48 rounded-lg" />
              <Skeleton className="h-4 w-64 rounded-lg" />
            </div>
            <Skeleton className="h-10 w-32 rounded-lg" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
          <div className="flex flex-col gap-3">
            <Skeleton className="h-5 w-36 rounded-lg" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-xl border border-[#A577FF]/20 overflow-hidden">
                  <Skeleton className="h-28 w-full rounded-none" />
                  <div className="flex flex-col gap-2 p-4">
                    <Skeleton className="h-4 w-32 rounded-md" />
                    <Skeleton className="h-3 w-20 rounded-md" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const links = [
    {
      label: "Dashboard",
      href: "/dashboard",
      icon: <IconBrandTabler className="h-5 w-5 shrink-0 text-current" />,
    },
    {
      label: "Workflows",
      href: "/dashboard/workflows",
      icon: (
        <span className="relative inline-flex">
          <IconList className="h-5 w-5 shrink-0 text-current" />
          {awaitingUserCount > 0 && (
            <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-amber-400" />
          )}
          {awaitingUserCount === 0 && activeRunCount > 0 && (
            <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-[#A577FF] animate-pulse" />
          )}
        </span>
      ),
    },
    {
      label: "EchoPrism",
      href: "/dashboard/chat",
      icon: <IconSparkles2 className="h-5 w-5 shrink-0 text-current" />,
    },
    {
      label: "Traces",
      href: "/dashboard/traces",
      icon: <IconBrain className="h-5 w-5 shrink-0 text-current" />,
    },
    {
      label: "MCP Tools",
      href: "/dashboard/mcp",
      icon: <IconTool className="h-5 w-5 shrink-0 text-current" />,
    },
    {
      label: "Integrations",
      href: "/dashboard/integrations",
      icon: <IconPlug className="h-5 w-5 shrink-0 text-current" />,
    },
    {
      label: "Schedule",
      href: "/dashboard/schedule",
      icon: <IconCalendarClock className="h-5 w-5 shrink-0 text-current" />,
    },
    {
      label: "Settings",
      href: "/dashboard/settings",
      icon: <IconSettings className="h-5 w-5 shrink-0 text-current" />,
    },
  ];

  return (
    <div
      className={cn(
        "flex h-screen w-full min-h-screen flex-col overflow-hidden bg-[#F5F7FC] md:flex-row",
      )}
    >
      <Sidebar open={open} setOpen={setOpen}>
        <SidebarBody className="justify-between gap-10">
          <div className="flex flex-1 flex-col overflow-x-hidden overflow-y-auto">
            {open ? <Logo /> : <LogoIcon />}
            <div className="mt-8 flex flex-col gap-2">
              {links.map((link, idx) => (
                <SidebarLink
                  key={idx}
                  link={link}
                  active={
                    pathname === link.href ||
                    (link.href !== "/dashboard" && pathname.startsWith(link.href))
                  }
                />
              ))}
              <LogoutButton open={open} onLogout={handleLogout} />
            </div>
          </div>
          <div>
            <SidebarLink
              link={{
                label: user.displayName || user.email || "User",
                href: "/dashboard/profile",
                icon: (
                  <img
                    src={user.photoURL || "https://api.dicebear.com/7.x/avataaars/svg?seed=user"}
                    className="h-7 w-7 shrink-0 rounded-full"
                    width={28}
                    height={28}
                    alt="Avatar"
                  />
                ),
              }}
              active={pathname === "/dashboard/profile"}
            />
          </div>
        </SidebarBody>
      </Sidebar>
      <main className="flex flex-1 flex-col overflow-auto">
        {children}
      </main>
    </div>
  );
}

function LogoutButton({ open, onLogout }: { open: boolean; onLogout: () => void }) {
  const { animate } = useSidebar();
  return (
    <button
      type="button"
      onClick={onLogout}
      className={cn(
        "flex w-full cursor-pointer items-center justify-start gap-2 rounded-lg py-2 px-2.5 text-left text-white/80 transition-colors hover:bg-white/10 hover:text-white group/sidebar",
      )}
    >
      <IconArrowLeft className="h-5 w-5 shrink-0" />
      <motion.span
        animate={{
          display: animate ? (open ? "inline-block" : "none") : "inline-block",
          opacity: animate ? (open ? 1 : 0) : 1,
        }}
        className="text-sm group-hover/sidebar:translate-x-0.5 transition duration-150 whitespace-pre inline-block p-0! m-0!"
      >
        Logout
      </motion.span>
    </button>
  );
}

const Logo = () => {
  return (
    <Link
      href="/dashboard"
      className="relative z-20 flex cursor-pointer items-center space-x-2 py-1 text-sm font-normal text-white"
    >
      <div className="h-5 w-6 shrink-0 rounded-tl-lg rounded-tr-sm rounded-br-lg rounded-bl-sm bg-[#A577FF]" />
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="font-semibold whitespace-pre text-white"
      >
        Echo
      </motion.span>
    </Link>
  );
};

const LogoIcon = () => {
  return (
    <Link
      href="/dashboard"
      className="relative z-20 flex cursor-pointer items-center space-x-2 py-1 text-sm font-normal text-white"
    >
      <div className="h-5 w-6 shrink-0 rounded-tl-lg rounded-tr-sm rounded-br-lg rounded-bl-sm bg-[#A577FF]" />
    </Link>
  );
};

