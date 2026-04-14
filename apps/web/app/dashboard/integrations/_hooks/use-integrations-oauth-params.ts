"use client";

import { useEffect, useRef } from "react";
import type { ReadonlyURLSearchParams } from "next/navigation";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";

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
      await loadIntegrations({ forceIdTokenRefresh: true, silent: true });
      if (connected) {
        toast.success(`${connected} connected successfully!`);
      } else {
        toast.success("Connection updated.");
      }
      router.replace(pathname, { scroll: false });
    })();
  }, [searchParams, loadIntegrations, router, pathname]);
}
