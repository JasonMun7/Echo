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
  IconBrandSlack: <IconBrandSlack className="h-5 w-5 text-foreground" />,
  IconBrandGithub: <IconBrandGithub className="h-5 w-5 text-foreground" />,
  IconBrandGoogle: <IconBrandGoogle className="h-5 w-5 text-foreground" />,
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

  const switchChecked = on || connecting;

  const noteText = integration.note?.trim() || "Uses your Google sign-in — no separate OAuth.";

  return (
    <div
      id={`integration-card-${integration.id}`}
      className={cn(
        "echo-card flex flex-col rounded-xl p-3 transition-colors",
        "hover:border-muted-foreground/25",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-muted text-muted-foreground",
            showBrandfetchLogo && "overflow-hidden bg-card shadow-sm",
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
            ICON_MAP[integration.icon] || <IconPlug className="h-5 w-5 text-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <h3 className="text-sm font-semibold leading-tight text-foreground">
            {integration.name}
          </h3>
          {descriptionLine ? (
            <p
              className="mt-1 line-clamp-2 text-xs leading-snug text-muted-foreground"
              title={descriptionLine}
            >
              {descriptionLine}
            </p>
          ) : null}
          {integration.account_name ? (
            <p className="mt-1 truncate text-[11px] font-medium text-muted-foreground">
              {integration.account_name}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex min-h-9 items-center justify-between gap-2 border-t border-border pt-2.5">
        {canOAuth ? (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto min-h-0 shrink px-0 text-xs text-muted-foreground"
                >
                  <IconSettings className="mr-1.5 h-4 w-4 shrink-0" stroke={1.5} aria-hidden />
                  Options
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {on && integration.account_name ? (
                  <>
                    <p className="px-2 py-1.5 text-xs text-muted-foreground">
                      Signed in as{" "}
                      <span className="font-medium text-foreground">
                        {integration.account_name}
                      </span>
                    </p>
                    <DropdownMenuSeparator />
                  </>
                ) : null}
                {on ? (
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    disabled={connecting || disconnecting}
                    onClick={() => {
                      void onDisconnect();
                    }}
                  >
                    Disconnect
                  </DropdownMenuItem>
                ) : null}
                {!on ? (
                  <p className="px-2 py-2 text-xs text-muted-foreground">
                    Turn on the switch to connect with Composio (OAuth).
                  </p>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
            <Switch
              checked={switchChecked}
              disabled={connecting || disconnecting}
              onCheckedChange={handleSwitch}
              className="shrink-0"
              aria-label={
                on ? "Connected — toggle to disconnect" : "Not connected — toggle to connect"
              }
            />
          </>
        ) : (
          <>
            <p
              className="min-w-0 flex-1 text-[10px] font-medium leading-snug text-muted-foreground"
              title={noteText}
            >
              {noteText}
            </p>
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label="Integration details"
                    >
                      <IconSettings className="h-4 w-4" stroke={1.5} />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="top">Details</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end" className="w-56">
                <p className="px-2 py-2 text-xs text-muted-foreground">{noteText}</p>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>
    </div>
  );
}
