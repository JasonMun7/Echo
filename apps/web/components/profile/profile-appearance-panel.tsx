"use client";

import { ThemeToggle } from "@/components/theme-toggle";

export function ProfileAppearancePanel() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <p className="text-sm text-muted-foreground">
        Same control as the header: click the icon to cycle{" "}
        <span className="font-medium text-foreground">System → Light → Dark</span>.
      </p>
      <div className="mt-4 flex items-center gap-3">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Theme
        </span>
        <ThemeToggle />
      </div>
    </div>
  );
}
