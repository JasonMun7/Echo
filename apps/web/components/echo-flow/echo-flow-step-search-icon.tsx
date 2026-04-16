"use client";

import { useEffect, useState } from "react";

import {
  brandfetchLogoUrlForDomain,
  brandfetchLogoUrlForIntegrationId,
  integrationIdFromComposioSlug,
} from "@/app/dashboard/integrations/_lib/brandfetch-logo";
import { gradientWellImageClass } from "@/components/ui/gradient-icon-well";
import { WorkflowActionIcon } from "@/lib/workflow-action-icons";

/**
 * Inner icon for workflow edit step search (`EchoSearchWithSuggestions` wraps with `GradientIconWell`).
 * Brandfetch CDN for open/focus app domains and Composio api_call toolkits when mapped; else Lucide icons.
 */
export function EchoFlowStepSearchIcon({
  action,
  params,
}: {
  action: string;
  params?: Record<string, unknown> | null;
}) {
  const p = params ?? {};
  const [domainLogoFailed, setDomainLogoFailed] = useState(false);
  const [integrationLogoFailed, setIntegrationLogoFailed] = useState(false);

  const isOpenApp = action === "open_app" || action === "focus_app";
  const domain = isOpenApp ? String(p.brand_domain ?? "").trim() : "";
  const domainLogoUrl = domain && !domainLogoFailed ? brandfetchLogoUrlForDomain(domain) : null;

  const slug = action === "api_call" && typeof p.slug === "string" ? p.slug.trim() : "";
  const integrationId = slug ? integrationIdFromComposioSlug(slug) : null;
  const integrationLogoUrl =
    integrationId && !integrationLogoFailed
      ? brandfetchLogoUrlForIntegrationId(integrationId)
      : null;

  const composioSlug = slug || null;

  useEffect(() => {
    queueMicrotask(() => {
      setDomainLogoFailed(false);
      setIntegrationLogoFailed(false);
    });
  }, [domain, slug]);

  if (domainLogoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- Brandfetch CDN hotlink
      <img
        src={domainLogoUrl}
        alt=""
        width={32}
        height={32}
        loading="lazy"
        decoding="async"
        className={gradientWellImageClass("lg")}
        onError={() => setDomainLogoFailed(true)}
      />
    );
  }

  if (integrationLogoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- Brandfetch CDN hotlink
      <img
        src={integrationLogoUrl}
        alt=""
        width={32}
        height={32}
        loading="lazy"
        decoding="async"
        className={gradientWellImageClass("lg")}
        onError={() => setIntegrationLogoFailed(true)}
      />
    );
  }

  return (
    <WorkflowActionIcon
      action={action}
      composioSlug={composioSlug}
      className="h-4 w-4 text-foreground"
    />
  );
}
