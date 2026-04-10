"use client";

import type { ReactNode } from "react";
import {
  IconBrandGithub,
  IconBrandGoogle,
  IconBrandSlack,
  IconCheck,
  IconExternalLink,
  IconPlug,
  IconX,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Integration } from "../_lib/integration-types";

const ICON_MAP: Record<string, ReactNode> = {
  IconBrandSlack: <IconBrandSlack className="h-6 w-6" />,
  IconBrandGithub: <IconBrandGithub className="h-6 w-6" />,
  IconBrandGoogle: <IconBrandGoogle className="h-6 w-6" />,
};

type IntegrationCardProps = {
  integration: Integration;
  connecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
};

export function IntegrationCard({
  integration,
  connecting,
  onConnect,
  onDisconnect,
}: IntegrationCardProps) {
  const connected = integration.connected;

  return (
    <Card
      className={cn(
        "echo-card flex flex-col overflow-hidden rounded-xl border shadow-sm transition-all",
        connected
          ? "border-emerald-200 bg-emerald-50/50 hover:border-emerald-300/80"
          : "border-[#A577FF]/20 bg-white/90 hover:border-[#A577FF]/40 hover:shadow-md",
      )}
    >
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-xl",
            connected ? "bg-emerald-100 text-emerald-600" : "bg-[#F5F3FF] text-[#A577FF]",
          )}
        >
          {ICON_MAP[integration.icon] || <IconPlug className="h-6 w-6" />}
        </div>
        {connected ? (
          <Badge className="border-emerald-200 bg-emerald-100 text-xs text-emerald-700">
            <IconCheck className="mr-1 h-3 w-3" />
            Connected
          </Badge>
        ) : integration.note ? (
          <Badge variant="outline" className="border-[#A577FF]/30 text-xs text-[#A577FF]">
            Auto
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-1 pb-4">
        <CardTitle className="text-base font-semibold text-[#150A35]">{integration.name}</CardTitle>
        <p className="text-sm text-echo-text-muted">{integration.description}</p>
        {integration.account_name ? (
          <p className="mt-1 text-xs text-emerald-600">Connected as: {integration.account_name}</p>
        ) : null}
        {integration.note ? (
          <p className="mt-1 text-xs text-[#A577FF]">{integration.note}</p>
        ) : null}
      </CardContent>
      <CardFooter className="mt-auto flex flex-col gap-2 border-t border-transparent pt-0">
        {integration.oauth && !integration.note ? (
          connected ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onDisconnect}
              className="h-7 w-full border-red-200 text-xs text-red-500 hover:bg-red-50"
            >
              <IconX className="mr-1 h-3 w-3" />
              Disconnect
            </Button>
          ) : integration.token_vault ? (
            <Button
              size="sm"
              onClick={onConnect}
              disabled={connecting}
              className="echo-btn-cyan-lavender h-7 w-full text-xs"
            >
              <IconExternalLink className="mr-1 h-3 w-3" />
              {connecting ? "Connecting…" : "Connect"}
            </Button>
          ) : null
        ) : (
          <span className="text-xs italic text-echo-text-muted">Uses Google sign-in</span>
        )}
      </CardFooter>
    </Card>
  );
}
