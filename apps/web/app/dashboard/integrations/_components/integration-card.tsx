"use client";

import { useState, type ReactNode } from "react";
import {
  IconBrandGithub,
  IconBrandGoogle,
  IconBrandSlack,
  IconPlug,
  IconSettings,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { brandfetchLogoUrlForIntegrationId } from "../_lib/brandfetch-logo";
import type { Integration } from "../_lib/integration-types";

const ICON_MAP: Record<string, ReactNode> = {
  IconBrandSlack: <IconBrandSlack className="h-5 w-5" />,
  IconBrandGithub: <IconBrandGithub className="h-5 w-5" />,
  IconBrandGoogle: <IconBrandGoogle className="h-5 w-5" />,
};

function effectiveConnected(integration: Integration): boolean {
  return Boolean(integration.connected || integration.composio_account_active === true);
}

type IntegrationCardProps = {
  integration: Integration;
  /** When set, overrides server-derived connection for optimistic UI (instant toggle feedback). */
  connectionOverride?: boolean;
  connecting: boolean;
  /** True while DELETE runs — blocks duplicate toggles until the request finishes. */
  disconnecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
};

export function IntegrationCard({
  integration,
  connectionOverride,
  connecting,
  disconnecting,
  onConnect,
  onDisconnect,
}: IntegrationCardProps) {
  const on =
    connectionOverride !== undefined ? connectionOverride : effectiveConnected(integration);
  const canOAuth = Boolean(integration.oauth && !integration.note);
  const descriptionLine = (integration.tagline || integration.description || "").trim();
  const brandfetchUrl = brandfetchLogoUrlForIntegrationId(integration.id);
  const [brandfetchFailed, setBrandfetchFailed] = useState(false);
  const showBrandfetchLogo = Boolean(brandfetchUrl && !brandfetchFailed);

  const handleSwitch = (checked: boolean) => {
    if (!canOAuth || connecting || disconnecting) return;
    if (checked && !on) void onConnect();
    if (!checked && on) void onDisconnect();
  };

  const switchChecked = (on || connecting) && !disconnecting;

  return (
    <div
      className={cn(
        "echo-card flex flex-col rounded-xl border bg-white p-3 shadow-sm transition-colors",
        on
          ? "border-[#A577FF]/35 shadow-[0_1px_0_0_rgba(165,119,255,0.15)] ring-1 ring-[#A577FF]/10"
          : "border-[#A577FF]/12 bg-white hover:border-[#A577FF]/25",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
            showBrandfetchLogo && "overflow-hidden",
            showBrandfetchLogo
              ? "border border-[#150A35]/10 bg-white shadow-sm"
              : on
                ? "echo-gradient-cyan-lavender text-white shadow-sm"
                : "bg-[#F5F3FF] text-[#A577FF]",
          )}
        >
          {showBrandfetchLogo && brandfetchUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- Brandfetch Logo API: browser hotlink only (no next/image proxy)
            <img
              src={brandfetchUrl}
              alt={integration.name}
              width={36}
              height={36}
              loading="lazy"
              decoding="async"
              className="h-9 w-9 rounded-xl object-contain"
              onError={() => setBrandfetchFailed(true)}
            />
          ) : (
            ICON_MAP[integration.icon] || <IconPlug className="h-5 w-5" />
          )}
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-sm font-semibold leading-tight text-[#150A35]">
              {integration.name}
            </h3>
            {canOAuth ? (
              <Switch
                checked={switchChecked}
                disabled={connecting || disconnecting}
                onCheckedChange={handleSwitch}
                className="shrink-0 data-[state=checked]:!bg-echo-lavender data-[state=checked]:shadow-sm"
                aria-label={
                  on ? "Connected — toggle to disconnect" : "Not connected — toggle to connect"
                }
              />
            ) : (
              <span className="text-[10px] font-medium uppercase tracking-wide text-[#9ca3af]">
                Auto
              </span>
            )}
          </div>
          {descriptionLine ? (
            <p
              className="mt-1 truncate text-xs leading-snug text-[#6b7280]"
              title={descriptionLine}
            >
              {descriptionLine}
            </p>
          ) : null}
          {integration.account_name ? (
            <p className="mt-1 truncate text-[11px] font-medium text-[#A577FF]">
              {integration.account_name}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#150A35]/6 pt-2.5">
        <span
          className={cn(
            "inline-flex max-w-[72%] items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium",
            integration.note
              ? "bg-[#f5f3ff] text-[#A577FF]"
              : on
                ? "echo-gradient-cyan-lavender text-white shadow-sm"
                : "bg-[#f3f4f6] text-[#6b7280]",
          )}
        >
          {integration.note ? "Via Google sign-in" : on ? "Connected" : "Not connected"}
        </span>

        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-[#6b7280] hover:bg-[#F5F7FC] hover:text-[#150A35]"
                  aria-label="Integration options"
                >
                  <IconSettings className="h-4 w-4" stroke={1.5} />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="top">Options</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-56">
            {on && integration.account_name ? (
              <>
                <p className="px-2 py-1.5 text-xs text-[#6b7280]">
                  Signed in as{" "}
                  <span className="font-medium text-[#150A35]">{integration.account_name}</span>
                </p>
                <DropdownMenuSeparator />
              </>
            ) : null}
            {canOAuth && on ? (
              <DropdownMenuItem
                className="text-[#ef4444] focus:text-[#ef4444]"
                disabled={connecting || disconnecting}
                onClick={() => {
                  if (connecting || disconnecting) return;
                  void onDisconnect();
                }}
              >
                Disconnect
              </DropdownMenuItem>
            ) : null}
            {!canOAuth ? (
              <p className="px-2 py-2 text-xs text-[#6b7280]">
                Uses your Google sign-in — no separate OAuth.
              </p>
            ) : null}
            {canOAuth && !on ? (
              <p className="px-2 py-2 text-xs text-[#6b7280]">
                Turn on the switch to connect with Composio (OAuth).
              </p>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
