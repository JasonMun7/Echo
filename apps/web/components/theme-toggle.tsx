"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { nextThemePreference, setThemeWithViewTransition } from "@/lib/theme-view-transition";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  /** Icon reflects actual appearance (system resolves to light or dark). */
  const Icon = resolvedTheme === "dark" ? Moon : Sun;

  const cycle = () => {
    const next = nextThemePreference(theme);
    setThemeWithViewTransition(() => setTheme(next));
  };

  const chrome = !className && "text-[#150A35]/80 hover:bg-[#150A35]/08 dark:text-white/85";

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" className={cn("size-9", className, chrome)} aria-hidden>
        <Sun className="size-[18px]" />
      </Button>
    );
  }

  return (
    <Tooltip
      delayDuration={450}
      // Avoid hover “sticky” content fighting the button; first click should always toggle theme.
      disableHoverableContent
    >
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("size-9", className, chrome)}
          aria-label="Change theme"
          onClick={cycle}
        >
          <Icon className="size-[18px]" />
        </Button>
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        align="center"
        sideOffset={8}
        className="pointer-events-none px-2 py-1 text-xs"
      >
        Change theme
      </TooltipContent>
    </Tooltip>
  );
}
