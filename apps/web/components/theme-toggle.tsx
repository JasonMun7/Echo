"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { nextThemePreference, setThemeWithViewTransition } from "@/lib/theme-view-transition";
import { cn } from "@/lib/utils";

const PREFERENCE_LABELS: Record<"system" | "light" | "dark", string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  const preference = (theme ?? "system") as "system" | "light" | "dark";
  /** Icon reflects actual appearance (system resolves to light or dark). */
  const Icon = resolvedTheme === "dark" ? Moon : Sun;

  const cycle = () => {
    const next = nextThemePreference(theme);
    setThemeWithViewTransition(() => setTheme(next));
  };

  const nextPref = nextThemePreference(preference);

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
          aria-label={`Theme preference: ${PREFERENCE_LABELS[preference]}. Click to use ${PREFERENCE_LABELS[nextPref]}.`}
          onClick={cycle}
        >
          <Icon className="size-[18px]" />
        </Button>
      </TooltipTrigger>
      <TooltipContent
        side="left"
        align="center"
        sideOffset={8}
        className="pointer-events-none max-w-[11rem] px-2 py-1 text-[10px] leading-snug text-balance"
      >
        {resolvedTheme === "dark" ? "Dark" : "Light"} UI · {PREFERENCE_LABELS[preference]} · next:{" "}
        {PREFERENCE_LABELS[nextPref]}
      </TooltipContent>
    </Tooltip>
  );
}
