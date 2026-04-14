"use client";

import { Plug } from "lucide-react";

import {
  brandfetchLogoUrlForIntegrationId,
  integrationIdFromComposioSlug,
} from "@/app/dashboard/integrations/_lib/brandfetch-logo";
import { cn } from "@/lib/utils";

type IntegrationLogoProps = {
  /** Composio tool slug from step params (e.g. `SLACK_SEND_MESSAGE`). */
  composioSlug?: string | null;
  className?: string;
  imgClassName?: string;
};

export function IntegrationLogo({ composioSlug, className, imgClassName }: IntegrationLogoProps) {
  const id = composioSlug ? integrationIdFromComposioSlug(composioSlug) : null;
  const url = id ? brandfetchLogoUrlForIntegrationId(id) : null;

  if (url) {
    return (
      <img
        src={url}
        alt=""
        width={24}
        height={24}
        className={cn("h-6 w-6 shrink-0 rounded object-contain", imgClassName)}
      />
    );
  }

  return (
    <span
      className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[#A577FF]/10",
        className,
      )}
      aria-hidden
    >
      <Plug className="h-3.5 w-3.5 text-[#A577FF]" />
    </span>
  );
}
