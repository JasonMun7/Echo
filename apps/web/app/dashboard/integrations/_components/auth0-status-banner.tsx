"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Unlink } from "lucide-react";
import { cn } from "@/lib/utils";

type Auth0StatusBannerProps = {
  auth0Linked: boolean;
  auth0Email: string | null;
  auth0Sub: string | null;
  onUnlink: () => void;
};

export function Auth0StatusBanner({
  auth0Linked,
  auth0Email,
  auth0Sub,
  onUnlink,
}: Auth0StatusBannerProps) {
  if (!auth0Linked) {
    return (
      <div className="rounded-xl border border-[#A577FF]/30 bg-[#A577FF]/5 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#150A35]/80">
          Link Auth0 first
        </p>
        <p className="mt-1 text-sm text-[#150A35]/80">
          Use <strong className="font-medium text-[#150A35]">Connect</strong> on an integration
          below to sign in with Auth0 and store third-party tokens securely. You sign in to Echo
          with Firebase; Auth0 holds Slack, GitHub, and Google credentials for workflows.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-emerald-200/90 bg-emerald-50/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900/85">
            Auth0 linked
          </p>
          <Badge className="border-emerald-200 bg-emerald-100/90 text-emerald-800">Ready</Badge>
        </div>
        {auth0Email || auth0Sub ? (
          <div className="mt-2 space-y-1 text-xs text-emerald-900/75">
            {auth0Email ? (
              <p>
                <span className="text-emerald-900/60">Linked account </span>
                <span className="font-medium text-emerald-900">{auth0Email}</span>
              </p>
            ) : null}
            {auth0Sub ? (
              <p className={cn(auth0Email && "text-emerald-900/55")}>
                <span className="mr-1">Auth0 user ID </span>
                <code className="rounded bg-white/80 px-1 font-mono text-[11px] text-emerald-900/85">
                  {auth0Sub.length > 56 ? `${auth0Sub.slice(0, 28)}…` : auth0Sub}
                </code>
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 shrink-0 border-emerald-300/80 text-emerald-900"
        onClick={onUnlink}
      >
        <Unlink className="mr-1 h-3.5 w-3.5" />
        Unlink Auth0
      </Button>
    </div>
  );
}
