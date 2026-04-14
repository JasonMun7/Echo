"use client";

import type { ComponentType } from "react";
import { IconPlug } from "@tabler/icons-react";
import Threads from "@/components/threads";

type IconComp = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

type IntegrationsEmptyStateProps = {
  title: string;
  description?: string;
  icon?: IconComp;
};

/**
 * Empty state with Threads background — matches dashboard patterns (workflows, MCP, schedule).
 */
export function IntegrationsEmptyState({
  title,
  description,
  icon: Icon = IconPlug,
}: IntegrationsEmptyStateProps) {
  return (
    <div className="relative flex min-h-[220px] w-full flex-col items-center justify-center gap-4 overflow-hidden rounded-lg border border-dashed border-[#A577FF]/40">
      <div className="absolute inset-0 overflow-hidden rounded-lg">
        <Threads
          color={[165 / 255, 119 / 255, 255 / 255]}
          amplitude={1.3}
          distance={0.3}
          enableMouseInteraction={false}
        />
      </div>
      <div className="relative z-[1] flex flex-col items-center gap-3 px-4 py-8 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#A577FF]/10">
          <Icon className="h-6 w-6 text-[#A577FF]" aria-hidden />
        </div>
        <h2 className="font-medium text-[#150A35]">{title}</h2>
        {description ? <p className="max-w-md text-sm text-[#150A35]/70">{description}</p> : null}
      </div>
    </div>
  );
}
