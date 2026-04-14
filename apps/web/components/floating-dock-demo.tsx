import React from "react";
import { FloatingDock } from "@/components/ui/floating-dock";
import { Github, Home, LayoutGrid, RefreshCw, Share2, Terminal } from "lucide-react";

export default function FloatingDockDemo() {
  const links = [
    {
      title: "Home",
      icon: <Home className="h-full w-full text-neutral-500 dark:text-neutral-300" aria-hidden />,
      href: "#",
    },
    {
      title: "Products",
      icon: (
        <Terminal className="h-full w-full text-neutral-500 dark:text-neutral-300" aria-hidden />
      ),
      href: "#",
    },
    {
      title: "Components",
      icon: (
        <LayoutGrid className="h-full w-full text-neutral-500 dark:text-neutral-300" aria-hidden />
      ),
      href: "#",
    },
    {
      title: "Aceternity UI",
      icon: (
        <img
          src="https://assets.aceternity.com/logo-dark.png"
          width={20}
          height={20}
          alt="Aceternity Logo"
        />
      ),
      href: "#",
    },
    {
      title: "Changelog",
      icon: (
        <RefreshCw className="h-full w-full text-neutral-500 dark:text-neutral-300" aria-hidden />
      ),
      href: "#",
    },
    {
      title: "Social",
      icon: <Share2 className="h-full w-full text-neutral-500 dark:text-neutral-300" aria-hidden />,
      href: "#",
    },
    {
      title: "GitHub",
      icon: <Github className="h-full w-full text-neutral-500 dark:text-neutral-300" aria-hidden />,
      href: "#",
    },
  ];
  return (
    <div className="flex h-[35rem] w-full items-center justify-center">
      <FloatingDock
        mobileClassName="translate-y-20" // only for demo, remove for production
        items={links}
      />
    </div>
  );
}
