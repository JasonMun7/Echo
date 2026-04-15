"use client";

import { useState, type ReactNode } from "react";

import { brandfetchLogoUrlForDomain } from "@/app/dashboard/integrations/_lib/brandfetch-logo";
import { GradientIconWell, gradientWellImageClass } from "@/components/ui/gradient-icon-well";
import { cn } from "@/lib/utils";

type ProfileBrandLogoProps = {
  /** Registered domain for Brandfetch Logo API (e.g. `google.com`, `echo.ai`). */
  domain: string;
  /** Outer well size, e.g. `size-10` or `h-9 w-9`. */
  className?: string;
  corners?: "lg" | "xl";
  /** Shown when client id is missing, domain fails to resolve, or the image errors. */
  fallback: ReactNode;
  alt?: string;
};

/**
 * Brandfetch CDN logo inside {@link GradientIconWell}, with Tabler/Lucide fallback.
 * Same hotlink pattern as integrations — see DESIGN_SYSTEM and `brandfetch-logo.ts`.
 */
export function ProfileBrandLogo({
  domain,
  className,
  corners = "lg",
  fallback,
  alt = "",
}: ProfileBrandLogoProps) {
  const rawUrl = brandfetchLogoUrlForDomain(domain);
  const [failed, setFailed] = useState(false);
  const showImg = Boolean(rawUrl) && !failed;

  return (
    <GradientIconWell corners={corners} className={cn("shrink-0", className)}>
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element -- Brandfetch Logo API: browser hotlink only
        <img
          src={rawUrl!}
          alt={alt}
          className={gradientWellImageClass(corners)}
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="flex size-full items-center justify-center text-card-foreground [&_svg]:shrink-0">
          {fallback}
        </span>
      )}
    </GradientIconWell>
  );
}
