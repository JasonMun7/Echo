"use client";

import { useEffect, useRef } from "react";
import type { ReadonlyURLSearchParams } from "next/navigation";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";

/** Echo catalog ids from ``GET /api/integrations`` — safe to echo in OAuth return query param. */
const OAUTH_CONNECTED_ALLOWLIST = new Set(["slack", "github", "google", "gmail"]);

function validatedOAuthDisplayName(connected: string | null): string | null {
  if (!connected) return null;
  const t = connected.trim();
  if (!t || t.length > 64) return null;
  if (!/^[\w\- ]+$/i.test(t)) return null;
  if (!OAUTH_CONNECTED_ALLOWLIST.has(t.toLowerCase())) return null;
  return t;
}

/**
 * After Composio OAuth, the redirect URL may include query params (or none). Refetch integrations,
 * toast, and strip query params so the UI shows updated connection state.
 */
export function useIntegrationsOAuthParams(
  searchParams: ReadonlyURLSearchParams,
  options: {
    loadIntegrations: (opts?: {
      forceIdTokenRefresh?: boolean;
      silent?: boolean;
    }) => Promise<unknown>;
  },
) {
  const { loadIntegrations } = options;
  const router = useRouter();
  const pathname = usePathname();
  const lastQs = useRef<string>("");

  useEffect(() => {
    const qs = searchParams.toString();
    if (!qs) {
      lastQs.current = "";
      return;
    }
    if (lastQs.current === qs) return;
    lastQs.current = qs;

    const error = searchParams.get("error");
    const connected = searchParams.get("connected");

    if (error) {
      const rawDesc = searchParams.get("error_description");
      const desc = rawDesc ? rawDesc.replace(/\+/g, " ") : "";
      toast.error(desc ? `OAuth error (${error}): ${desc}` : `OAuth error: ${error}`);
      router.replace(pathname, { scroll: false });
      return;
    }

    void (async () => {
      const refreshed = await loadIntegrations({ forceIdTokenRefresh: true, silent: true });
      if (refreshed != null) {
        const display = connected ? validatedOAuthDisplayName(connected) : null;
        if (connected) {
          toast.success(
            display ? `${display} connected successfully!` : "Integration connected successfully",
          );
        } else {
          toast.success("Connection updated.");
        }
      }
      router.replace(pathname, { scroll: false });
    })();
  }, [searchParams, loadIntegrations, router, pathname]);
}
