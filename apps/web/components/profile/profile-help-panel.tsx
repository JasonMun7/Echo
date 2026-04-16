"use client";

import Link from "next/link";
import { IconExternalLink, IconHelp, IconMail } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { ProfileBrandLogo } from "@/components/profile/profile-brand-logo";

export function ProfileHelpPanel() {
  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <ProfileBrandLogo
            domain="echo.ai"
            className="size-10"
            alt="Echo"
            fallback={<IconHelp className="size-5" stroke={1.5} aria-hidden />}
          />
          <div className="min-w-0 flex-1 space-y-2">
            <h3 className="text-sm font-semibold text-foreground">Get help</h3>
            <p className="text-sm text-muted-foreground">
              Questions about Echo, billing, or your account? Reach out — we&apos;re happy to help.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button type="button" asChild variant="outline" className="border-border">
                <Link href="/contact" className="inline-flex items-center gap-2">
                  Contact us
                  <IconExternalLink className="size-3.5 opacity-70" />
                </Link>
              </Button>
              <Button type="button" asChild variant="outline" className="border-border">
                <a href="mailto:support@echo.ai" className="inline-flex items-center gap-2">
                  <IconMail className="size-3.5 opacity-80" />
                  support@echo.ai
                </a>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
