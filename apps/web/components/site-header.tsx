"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import Orb from "@/components/reactbits/Orb";

interface SiteHeaderProps {
  title?: string;
}

/** EchoPrism orb button (same as desktop) linking to echo-desktop://echoprism. */
function EchoPrismOrbButton() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href="echo-desktop://echoprism"
          aria-label="Open EchoPrism"
          className="flex size-10 shrink-0 items-center justify-center rounded-lg transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A577FF]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#F5F7FC]"
        >
          <div className="size-10 overflow-hidden rounded-lg">
            <Orb
              hue={0}
              hoverIntensity={0.3}
              rotateOnHover
              forceHoverState={false}
              backgroundColor="#F5F7FC"
            />
          </div>
        </a>
      </TooltipTrigger>
      <TooltipContent side="bottom">Open EchoPrism</TooltipContent>
    </Tooltip>
  );
}

export function SiteHeader({ title = "Dashboard" }: SiteHeaderProps) {
  return (
    <header
      className="flex shrink-0 items-center gap-2 border-b border-[#A577FF]/20 bg-[#F5F7FC] transition-[width,height] ease-linear"
      style={{ height: "var(--header-height, 3rem)" }}
    >
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 h-4 bg-[#A577FF]/20"
        />
        <h1 className="text-base font-semibold text-[#150A35]">{title}</h1>
        <div className="ml-auto flex items-center gap-2">
          <EchoPrismOrbButton />
        </div>
      </div>
    </header>
  );
}
