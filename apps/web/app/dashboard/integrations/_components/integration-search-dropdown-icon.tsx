"use client";

import { useState, type ReactNode } from "react";
import { IconBrandGithub, IconBrandGoogle, IconBrandSlack, IconPlug } from "@tabler/icons-react";

import { gradientWellImageClass } from "@/components/ui/gradient-icon-well";

import { brandfetchLogoUrlForIntegrationId } from "../_lib/brandfetch-logo";
import type { Integration } from "../_lib/integration-types";

const ICON_MAP: Record<string, ReactNode> = {
  IconBrandSlack: <IconBrandSlack className="h-4 w-4 text-foreground" />,
  IconBrandGithub: <IconBrandGithub className="h-4 w-4 text-foreground" />,
  IconBrandGoogle: <IconBrandGoogle className="h-4 w-4 text-foreground" />,
};

/**
 * Inner icon for {@link EchoSearchWithSuggestions} rows (wrapped by GradientIconWell in the component).
 */
export function IntegrationSearchDropdownIcon({ integration }: { integration: Integration }) {
  const url = brandfetchLogoUrlForIntegrationId(integration.id);
  const [failed, setFailed] = useState(false);

  if (url && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- Brandfetch CDN hotlink
      <img
        src={url}
        alt=""
        width={32}
        height={32}
        loading="lazy"
        decoding="async"
        className={gradientWellImageClass("lg")}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    ICON_MAP[integration.icon] ?? <IconPlug className="h-4 w-4 text-foreground" stroke={1.75} />
  );
}
