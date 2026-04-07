"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { auth } from "@/lib/firebase";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { PENDING_VAULT_KEY, type Integration } from "./_lib/integration-types";
import { Auth0StatusBanner } from "./_components/auth0-status-banner";
import { IntegrationCard } from "./_components/integration-card";
import { useIntegrationsOAuthParams } from "./_hooks/use-integrations-oauth-params";

export default function IntegrationsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [auth0Linked, setAuth0Linked] = useState(false);
  const [auth0Sub, setAuth0Sub] = useState<string | null>(null);
  const [auth0Email, setAuth0Email] = useState<string | null>(null);
  const pendingVaultHandled = useRef(false);

  const loadIntegrations = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await apiFetch("/api/integrations");
      if (resp.ok) {
        const data = await resp.json();
        setIntegrations(data.integrations || []);
        setAuth0Linked(Boolean(data.auth0_linked));
        setAuth0Sub(typeof data.auth0_sub === "string" ? data.auth0_sub : null);
        setAuth0Email(typeof data.auth0_email === "string" ? data.auth0_email : null);
      }
    } catch {
      toast.error("Failed to load integrations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsub = auth?.onAuthStateChanged((u) => {
      if (!u) router.replace("/signin");
      else void loadIntegrations();
    });
    return () => unsub?.();
  }, [router, loadIntegrations]);

  const connectVaultIntegration = useCallback(async (id: string) => {
    setConnecting(id);
    try {
      const resp = await apiFetch(
        `/api/auth0/vault-url?integration=${encodeURIComponent(id)}`
      );
      if (!resp.ok) throw new Error(await resp.text());
      const data = await resp.json();
      window.location.href = data.auth_url as string;
    } catch (e: unknown) {
      toast.error(`Connect failed: ${e instanceof Error ? e.message : "Unknown"}`);
      setConnecting(null);
    }
  }, []);

  const startConnectIntegration = useCallback(
    async (id: string) => {
      if (auth0Linked) {
        await connectVaultIntegration(id);
        return;
      }

      setConnecting(id);
      try {
        const resp = await apiFetch("/api/auth0/link-url");
        if (!resp.ok) throw new Error(await resp.text());
        const data = await resp.json();
        sessionStorage.setItem(PENDING_VAULT_KEY, id);
        window.location.href = data.auth_url as string;
      } catch (e: unknown) {
        toast.error(
          `Auth0 link failed: ${e instanceof Error ? e.message : "Unknown"}`
        );
        setConnecting(null);
      }
    },
    [auth0Linked, connectVaultIntegration]
  );

  useIntegrationsOAuthParams(searchParams, {
    loadIntegrations,
    connectVaultIntegration,
    pendingVaultHandledRef: pendingVaultHandled,
  });

  async function disconnectIntegration(id: string) {
    const name = integrations.find((i) => i.id === id)?.name;
    try {
      const resp = await apiFetch(`/api/integrations/${id}`, { method: "DELETE" });
      if (!resp.ok) throw new Error(await resp.text());
      toast.success(`${name || "Integration"} disconnected`);
      await loadIntegrations();
    } catch {
      toast.error("Failed to disconnect");
    }
  }

  async function unlinkAuth0() {
    if (
      !window.confirm(
        "Remove Auth0 link from your Echo account? Integration API access stops until you link again."
      )
    ) {
      return;
    }
    try {
      const resp = await apiFetch("/api/auth0/link", { method: "DELETE" });
      if (!resp.ok) throw new Error(await resp.text());
      toast.success("Auth0 unlinked");
      setAuth0Sub(null);
      setAuth0Email(null);
      await loadIntegrations();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Unlink failed");
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto bg-[#F5F7FC]">
      <div className="flex flex-1 flex-col gap-6 p-6 pb-24 md:p-10 md:pb-24">
        <div>
          <h1 className="text-2xl font-semibold text-[#150A35]">Integrations</h1>
          <p className="mt-1 max-w-2xl text-sm text-echo-text-muted">
            Connect Slack, GitHub, and Google so Echo can act on your behalf. Link Auth0 once to store tokens
            securely, then use <span className="font-medium text-[#150A35]">Connect</span> for each service.
          </p>
        </div>

        <Auth0StatusBanner
          auth0Linked={auth0Linked}
          auth0Email={auth0Email}
          auth0Sub={auth0Sub}
          onUnlink={() => void unlinkAuth0()}
        />

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton
                key={i}
                className="h-48 rounded-xl border border-[#A577FF]/20 bg-white/80"
              />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {integrations.map((integration) => (
              <IntegrationCard
                key={integration.id}
                integration={integration}
                connecting={connecting === integration.id}
                onConnect={() => void startConnectIntegration(integration.id)}
                onDisconnect={() => void disconnectIntegration(integration.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
