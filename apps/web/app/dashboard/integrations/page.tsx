"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { IconCircleCheck, IconPlug, IconSearch } from "@tabler/icons-react";
import { ArrowDownWideNarrow, Filter } from "lucide-react";
import { EchoSearchWithSuggestions } from "@/components/ui/echo-search-with-suggestions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { auth } from "@/lib/firebase";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { apiFetch, apiErrorMessage } from "@/lib/api";
import {
  DASHBOARD_PAGE_DESCRIPTION_CLASS,
  DASHBOARD_PAGE_TITLE_CLASS,
} from "@/lib/dashboard-page-typography";
import { cn } from "@/lib/utils";
import type { Integration } from "./_lib/integration-types";
import {
  INTEGRATION_CATEGORY_TABS,
  type IntegrationCategoryId,
  integrationMatchesCategoryTab,
} from "./_lib/integration-categories";
import { IntegrationSearchDropdownIcon } from "./_components/integration-search-dropdown-icon";
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

type ConnectionFilter = "all" | "connected" | "available";

type SortKey = "featured" | "name_asc" | "name_desc" | "connected_first";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "featured", label: "Featured" },
  { value: "name_asc", label: "Name (A–Z)" },
  { value: "name_desc", label: "Name (Z–A)" },
  { value: "connected_first", label: "Connected first" },
];

const CONNECTION_FILTER_LABEL: Record<ConnectionFilter, string> = {
  all: "All integrations",
  connected: "Connected only",
  available: "Not connected",
};

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
  const [categoryTab, setCategoryTab] = useState<IntegrationCategoryId>("all");
  const [connectionFilter, setConnectionFilter] = useState<ConnectionFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("featured");
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
          setComposioConfigured(Boolean(data.composio_configured));
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

  const highlightId = searchParams.get("highlight");

  useEffect(() => {
    if (!highlightId || loading) return;
    const raf = requestAnimationFrame(() => {
      document.getElementById(`integration-card-${highlightId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [highlightId, loading, integrations.length]);

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

  const searchItems = useMemo(
    () =>
      integrations.map((i) => ({
        id: i.id,
        label: i.name,
        subtitle: i.tagline || i.description?.slice(0, 80) || i.id,
        icon: <IntegrationSearchDropdownIcon integration={i} />,
      })),
    [integrations],
  );

  const orderIndex = useMemo(() => {
    const m = new Map<string, number>();
    integrations.forEach((i, idx) => {
      m.set(i.id, idx);
    });
    return m;
  }, [integrations]);

  const displayList = useMemo(() => {
    let list = integrations.filter((i) => matchesQuery(i, query));
    list = list.filter((i) => integrationMatchesCategoryTab(i.id, categoryTab));
    if (connectionFilter === "connected") {
      list = list.filter((i) => displayConnected(i, optimistic));
    } else if (connectionFilter === "available") {
      list = list.filter((i) => !displayConnected(i, optimistic));
    }

    const idx = (a: Integration) => orderIndex.get(a.id) ?? 999;
    const copy = [...list];
    copy.sort((a, b) => {
      if (sortKey === "connected_first") {
        const ca = displayConnected(a, optimistic);
        const cb = displayConnected(b, optimistic);
        if (ca !== cb) return ca ? -1 : 1;
      }
      if (sortKey === "name_asc") return a.name.localeCompare(b.name);
      if (sortKey === "name_desc") return b.name.localeCompare(a.name);
      return idx(a) - idx(b);
    });
    return copy;
  }, [integrations, query, categoryTab, connectionFilter, sortKey, optimistic, orderIndex]);

  const hasActiveFilters =
    query.trim() !== "" ||
    categoryTab !== "all" ||
    connectionFilter !== "all" ||
    sortKey !== "featured";

  const cardGridClass = "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3";

  const toolbarRow = !loading ? (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-4",
        "xl:flex-row xl:items-center xl:justify-between xl:gap-4",
      )}
    >
      <div className="relative w-full min-w-0 shrink-0 xl:max-w-md">
        <EchoSearchWithSuggestions
          items={searchItems}
          placeholder="Search integrations…"
          aria-label="Search integrations"
          onQueryChange={setQuery}
          onSelect={(item) => {
            setQuery(item.label);
            requestAnimationFrame(() => {
              document.getElementById(`integration-card-${item.id}`)?.scrollIntoView({
                behavior: "smooth",
                block: "nearest",
              });
            });
          }}
          className="w-full"
        />
      </div>

      <div className="flex min-w-0 flex-1 justify-center">
        <div className="flex w-full min-w-0 flex-wrap items-center justify-center gap-2">
          {INTEGRATION_CATEGORY_TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setCategoryTab(id)}
              className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Badge
                variant="outline"
                className={cn(
                  "border-border px-3 py-1.5 text-xs font-medium sm:text-sm",
                  categoryTab === id
                    ? "bg-muted text-foreground"
                    : "bg-card text-muted-foreground hover:bg-muted/70",
                )}
              >
                {label}
              </Badge>
            </button>
          ))}
        </div>
      </div>

      <div className="flex w-full min-w-0 shrink-0 flex-wrap items-center justify-end gap-2 xl:ml-auto xl:w-auto">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="border-border shrink-0">
              <Filter className="h-4 w-4 shrink-0" aria-hidden />
              Filters
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              Connection
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={connectionFilter}
              onValueChange={(v) => {
                if (v === "all" || v === "connected" || v === "available") {
                  setConnectionFilter(v);
                }
              }}
            >
              <DropdownMenuRadioItem value="all">
                {CONNECTION_FILTER_LABEL.all}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="connected">
                {CONNECTION_FILTER_LABEL.connected}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="available">
                {CONNECTION_FILTER_LABEL.available}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
          <SelectTrigger
            size="sm"
            className="min-w-0 max-w-full border-border data-[size=sm]:h-9 sm:max-w-[min(100%,220px)] sm:min-w-[12rem]"
            aria-label="Sort integrations"
          >
            <ArrowDownWideNarrow className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="flex min-w-0 flex-1 items-center gap-1.5">
              <span className="text-muted-foreground">Sort by:</span>
              <SelectValue />
            </span>
          </SelectTrigger>
          <SelectContent align="end">
            {SORT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  ) : (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-4",
        "xl:flex-row xl:items-center xl:justify-between xl:gap-4",
      )}
    >
      <Skeleton className="h-10 w-full max-w-md rounded-md" />
      <div className="flex min-w-0 flex-1 flex-wrap justify-center gap-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-8 w-[4.5rem] shrink-0 rounded-full" />
        ))}
      </div>
      <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-2 xl:ml-auto xl:w-auto">
        <Skeleton className="h-9 w-[5.5rem] shrink-0 rounded-md" />
        <Skeleton className="h-9 w-44 shrink-0 rounded-md" />
      </div>
    </div>
  );

  return (
    <TooltipProvider>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
        <div className="flex min-w-0 flex-1 flex-col gap-6 pb-24 md:pb-24">
          <div className="flex max-w-3xl flex-col gap-2">
            <h1 className={DASHBOARD_PAGE_TITLE_CLASS}>Integrations &amp; Webhooks</h1>
            <p className={cn(DASHBOARD_PAGE_DESCRIPTION_CLASS, "mt-1")}>
              Seamlessly connect Echo to your incident response, monitoring, and DevOps toolchain.
              Third-party access is handled securely by Composio.
            </p>
          </div>

          {loading ? (
            <div className="flex flex-col gap-6">
              {toolbarRow}
              <div className={cn(cardGridClass, "opacity-60")}>
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <IntegrationCardSkeleton key={i} />
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {toolbarRow}

              {integrations.length === 0 ? (
                <IntegrationsEmptyState
                  icon={IconPlug}
                  title="No integrations in the catalog"
                  description="Check back later or contact support if this persists."
                />
              ) : displayList.length === 0 ? (
                <IntegrationsEmptyState
                  icon={hasActiveFilters ? IconSearch : IconCircleCheck}
                  title={
                    hasActiveFilters ? "No integrations match your filters" : "Nothing to show"
                  }
                  description={
                    hasActiveFilters
                      ? "Try clearing search, changing category, or adjusting filters and sort."
                      : "Adjust filters to see integrations."
                  }
                />
              ) : (
                <div className={cardGridClass}>
                  {displayList.map((integration) => (
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
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
