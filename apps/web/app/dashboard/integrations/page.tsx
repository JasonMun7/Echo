"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { IconCircleCheck, IconPlug, IconSearch } from "@tabler/icons-react";
import { auth } from "@/lib/firebase";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { TooltipProvider } from "@/components/ui/tooltip";
import { apiFetch, apiErrorMessage } from "@/lib/api";
import type { Integration } from "./_lib/integration-types";
import { IntegrationCard } from "./_components/integration-card";
import { IntegrationCardSkeleton } from "./_components/integration-card-skeleton";
import { IntegrationsEmptyState } from "./_components/integrations-empty-state";
import { useIntegrationsOAuthParams } from "./_hooks/use-integrations-oauth-params";

function matchesQuery(integration: Integration, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return (
    integration.name.toLowerCase().includes(s) ||
    integration.id.toLowerCase().includes(s) ||
    (integration.tagline || "").toLowerCase().includes(s) ||
    integration.description.toLowerCase().includes(s)
  );
}

function isEffectivelyConnected(integration: Integration): boolean {
  return Boolean(integration.connected || integration.composio_account_active === true);
}

/** Merges server integration list with optimistic connection toggles for snappy UI. */
function displayConnected(integration: Integration, optimistic: Record<string, boolean>): boolean {
  const o = optimistic[integration.id];
  if (o !== undefined) return o;
  return isEffectivelyConnected(integration);
}

export default function IntegrationsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  /** Immediate connection state until the server (or OAuth redirect) catches up. */
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});
  const [composioConfigured, setComposioConfigured] = useState(false);
  const [query, setQuery] = useState("");
  /** Blocks duplicate link fetches before `window.location` navigates away. */
  const oauthLaunchInFlightRef = useRef(false);
  const disconnectInFlightRef = useRef(false);

  const loadIntegrations = useCallback(
    async (opts?: { forceIdTokenRefresh?: boolean; silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      try {
        const fetchOpts = {
          cache: "no-store" as const,
          ...(opts?.forceIdTokenRefresh ? { forceIdTokenRefresh: true as const } : {}),
        };
        const intResp = await apiFetch("/api/integrations", fetchOpts);
        if (intResp.ok) {
          const data = await intResp.json();
          const list = (data.integrations || []) as Integration[];
          setIntegrations(list);
          setComposioConfigured(Boolean(data.composio_account_active ?? data.composio_configured));
          return list;
        }
        return null;
      } catch {
        toast.error("Failed to load integrations");
        return null;
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const unsub = auth?.onAuthStateChanged((u) => {
      if (!u) {
        router.replace("/signin");
        return;
      }
      void loadIntegrations();
    });
    return () => unsub?.();
  }, [router, loadIntegrations]);

  /** Composio often redirects back without query params — refetch immediately and once more after Composio sync. */
  useEffect(() => {
    let tid: ReturnType<typeof setTimeout> | undefined;
    try {
      if (sessionStorage.getItem("echo_composio_oauth_return") !== "1") return;
      void loadIntegrations({ forceIdTokenRefresh: true, silent: true });
      tid = setTimeout(() => {
        void loadIntegrations({ forceIdTokenRefresh: true, silent: true });
        try {
          sessionStorage.removeItem("echo_composio_oauth_return");
        } catch {
          /* ignore */
        }
      }, 2200);
    } catch {
      /* sessionStorage unavailable */
    }
    return () => {
      if (tid !== undefined) clearTimeout(tid);
    };
  }, [loadIntegrations]);

  const connectComposioIntegration = useCallback(async (id: string) => {
    if (oauthLaunchInFlightRef.current) return;
    oauthLaunchInFlightRef.current = true;
    setOptimistic((prev) => ({ ...prev, [id]: true }));
    setConnecting(id);
    try {
      const resp = await apiFetch(`/api/composio/link?toolkit=${encodeURIComponent(id)}`);
      if (!resp.ok) throw new Error(await apiErrorMessage(resp, "Connect failed"));
      const data = (await resp.json()) as { url?: string };
      if (!data.url) throw new Error("No redirect URL from Composio");

      try {
        sessionStorage.setItem("echo_composio_oauth_return", "1");
      } catch {
        /* private mode */
      }

      window.location.href = data.url;
    } catch (e: unknown) {
      oauthLaunchInFlightRef.current = false;
      setOptimistic((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      toast.error(`Connect failed: ${e instanceof Error ? e.message : "Unknown"}`);
      setConnecting(null);
    }
  }, []);

  const startConnectIntegration = useCallback(
    async (id: string) => {
      if (!composioConfigured) {
        toast.error(
          "Composio is not configured on the API server. Set COMPOSIO_API_KEY on the API.",
        );
        return;
      }
      if (oauthLaunchInFlightRef.current) return;
      await connectComposioIntegration(id);
    },
    [composioConfigured, connectComposioIntegration],
  );

  useIntegrationsOAuthParams(searchParams, {
    loadIntegrations,
  });

  const disconnectIntegration = useCallback(
    async (id: string) => {
      if (disconnectInFlightRef.current) return;
      disconnectInFlightRef.current = true;
      setOptimistic((prev) => ({ ...prev, [id]: false }));
      setDisconnecting(id);
      const name = integrations.find((i) => i.id === id)?.name;
      try {
        const resp = await apiFetch(`/api/integrations/${id}`, { method: "DELETE" });
        if (!resp.ok) throw new Error(await apiErrorMessage(resp, "Disconnect failed"));
        toast.success(`${name || "Integration"} disconnected`);
        setDisconnecting(null);
        disconnectInFlightRef.current = false;
        void loadIntegrations({ silent: true }).finally(() => {
          setOptimistic((prev) => {
            if (!(id in prev)) return prev;
            const next = { ...prev };
            delete next[id];
            return next;
          });
        });
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Failed to disconnect");
        setOptimistic((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
        void loadIntegrations({ silent: true });
        setDisconnecting(null);
        disconnectInFlightRef.current = false;
      }
    },
    [integrations, loadIntegrations],
  );

  const filtered = useMemo(
    () => integrations.filter((i) => matchesQuery(i, query)),
    [integrations, query],
  );

  const connectedPlugins = useMemo(
    () => filtered.filter((i) => displayConnected(i, optimistic)),
    [filtered, optimistic],
  );

  const availablePlugins = useMemo(
    () => filtered.filter((i) => !displayConnected(i, optimistic)),
    [filtered, optimistic],
  );

  const cardGridClass = "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

  return (
    <TooltipProvider>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto bg-[#F5F7FC]">
        <div className="flex flex-1 flex-col gap-6 p-6 pb-24 md:p-10 md:pb-24">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-xl">
              <h1 className="text-2xl font-semibold text-[#150A35]">Integrations</h1>
              <p className="mt-1 text-sm text-[#6b7280]">
                Connect apps once so Echo can work with them on your behalf. You stay signed in to
                Echo with Google; third-party access is handled securely by Composio.
              </p>
            </div>
            <div className="relative w-full max-w-md shrink-0">
              <IconSearch
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]"
                aria-hidden
              />
              <Input
                type="search"
                placeholder="Search integrations…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-10 rounded-lg border-[#A577FF]/20 bg-white pl-9 pr-3 text-sm text-[#150A35] placeholder:text-[#9ca3af] focus-visible:ring-[#A577FF]/30"
                aria-label="Search integrations"
              />
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col gap-8">
              <section className="flex flex-col gap-3" aria-hidden>
                <div>
                  <Skeleton className="mb-2 h-7 w-28 rounded-md" />
                  <Skeleton className="h-4 max-w-md rounded-md" />
                </div>
                <div className={cardGridClass}>
                  {[1, 2].map((i) => (
                    <IntegrationCardSkeleton key={i} />
                  ))}
                </div>
              </section>
              <section className="flex flex-col gap-3" aria-hidden>
                <div>
                  <Skeleton className="mb-2 h-7 w-36 rounded-md" />
                  <Skeleton className="h-4 max-w-lg rounded-md" />
                </div>
                <div className={cardGridClass}>
                  {[1, 2, 3, 4].map((i) => (
                    <IntegrationCardSkeleton key={`a-${i}`} />
                  ))}
                </div>
              </section>
            </div>
          ) : (
            <div className="flex flex-col gap-8">
              <section className="flex flex-col gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[#150A35]">Connected</h2>
                  <p className="text-sm text-[#6b7280]">Apps ready for workflows and chat tools.</p>
                </div>
                {connectedPlugins.length === 0 ? (
                  query.trim() ? (
                    <IntegrationsEmptyState
                      icon={IconSearch}
                      title="No connected integrations match your search."
                      description="Try a different search term."
                    />
                  ) : (
                    <IntegrationsEmptyState
                      icon={IconPlug}
                      title="No integrations connected yet"
                      description="Add one from the Available section below."
                    />
                  )
                ) : (
                  <div className={cardGridClass}>
                    {connectedPlugins.map((integration) => (
                      <IntegrationCard
                        key={integration.id}
                        integration={integration}
                        connectionOverride={optimistic[integration.id]}
                        connecting={connecting === integration.id}
                        disconnecting={disconnecting === integration.id}
                        onConnect={() => void startConnectIntegration(integration.id)}
                        onDisconnect={() => void disconnectIntegration(integration.id)}
                      />
                    ))}
                  </div>
                )}
              </section>

              <section className="flex flex-col gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[#150A35]">Available</h2>
                  <p className="text-sm text-[#6b7280]">
                    Connect these when you&apos;re ready — you&apos;ll leave this page briefly to
                    sign in with the provider, then return here.
                  </p>
                </div>
                {availablePlugins.length === 0 ? (
                  query.trim() ? (
                    <IntegrationsEmptyState
                      icon={IconSearch}
                      title="No available integrations match your search."
                      description="Try a different search term."
                    />
                  ) : (
                    <IntegrationsEmptyState
                      icon={IconCircleCheck}
                      title="Everything in the catalog is already connected"
                      description="All listed apps are connected and ready to use."
                    />
                  )
                ) : (
                  <div className={cardGridClass}>
                    {availablePlugins.map((integration) => (
                      <IntegrationCard
                        key={integration.id}
                        integration={integration}
                        connectionOverride={optimistic[integration.id]}
                        connecting={connecting === integration.id}
                        disconnecting={disconnecting === integration.id}
                        onConnect={() => void startConnectIntegration(integration.id)}
                        onDisconnect={() => void disconnectIntegration(integration.id)}
                      />
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
