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
  IconUserBolt,
} from "@tabler/icons-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";

export function DashboardLayout({ children }: { children?: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  const [user, setUser] = useState(auth?.currentUser ?? null);
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

  const handleLogout = async () => {
    if (auth) {
      await signOut(auth);
      router.replace("/signin");
    }
  };

  if (!user) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#F5F7FC]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#A577FF]/20 border-t-[#A577FF]" />
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
      icon: <IconList className="h-5 w-5 shrink-0 text-current" />,
    },
    {
      label: "Profile",
      href: "/dashboard/profile",
      icon: <IconUserBolt className="h-5 w-5 shrink-0 text-current" />,
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
      {children ?? <Dashboard />}
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
        className="text-sm group-hover/sidebar:translate-x-0.5 transition duration-150 whitespace-pre inline-block !p-0 !m-0"
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

const Dashboard = () => {
  return (
    <div className="flex flex-1 overflow-auto">
      <div className="flex h-full w-full flex-1 flex-col gap-4 rounded-tl-2xl border border-[#A577FF]/20 border-l-0 bg-white p-6 shadow-sm md:p-10">
        <h1 className="text-2xl font-semibold text-[#150A35]">
          Dashboard
        </h1>
        <p className="text-[#150A35]/80">
          Welcome back! You're signed in successfully.
        </p>
        <div className="flex gap-4">
          {[...new Array(4)].map((_, idx) => (
            <div
              key={"first-array-demo-" + idx}
              className="h-24 flex-1 animate-pulse rounded-lg bg-[#A577FF]/10"
            />
          ))}
        </div>
        <div className="flex flex-1 gap-4">
          {[...new Array(2)].map((_, idx) => (
            <div
              key={"second-array-demo-" + idx}
              className="h-full flex-1 animate-pulse rounded-lg bg-[#A577FF]/10"
            />
          ))}
        </div>
      </div>
    </div>
  );
};
