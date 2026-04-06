"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { auth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  IconPlug,
  IconCheck,
  IconX,
  IconExternalLink,
  IconBrandSlack,
  IconBrandGithub,
  IconBrandGoogle,
  IconStethoscope,
  IconUnlink,
  IconUsersGroup,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/** Optional: force Link Auth0 to a specific connection (e.g. Username-Password-Authentication) when Google is Token Vault–only. Backend can also set AUTH0_LINK_CONNECTION. */
function auth0LinkUrlPath(): string {
  const c = process.env.NEXT_PUBLIC_AUTH0_LINK_CONNECTION?.trim();
  if (!c) return "/api/auth0/link-url";
  return `/api/auth0/link-url?connection=${encodeURIComponent(c)}`;
}

const PENDING_VAULT_KEY = "echo_pending_vault_integration";

interface Integration {
  id: string;
  name: string;
  description: string;
  icon: string;
  oauth: boolean;
  connected: boolean;
  account_name?: string;
  connected_at?: unknown;
  note?: string;
  token_vault?: boolean;
}

const ICON_MAP: Record<string, React.ReactNode> = {
  IconBrandSlack: <IconBrandSlack className="h-6 w-6" />,
  IconBrandGithub: <IconBrandGithub className="h-6 w-6" />,
  IconBrandGoogle: <IconBrandGoogle className="h-6 w-6" />,
};

async function apiFetch(path: string, options?: RequestInit) {
  const user = auth?.currentUser;
  const token = user ? await user.getIdToken() : "";
  return fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options?.headers || {}),
    },
  });
}

/** Auth0 may return a JSON array or an object with nested lists; count what we can. */
function countConnectedAccountsPayload(payload: unknown): number | null {
  if (payload == null) return null;
  if (Array.isArray(payload)) return payload.length;
  if (typeof payload === "object") {
    const o = payload as Record<string, unknown>;
    for (const key of [
      "accounts",
      "items",
      "connected_accounts",
      "data",
      "results",
    ] as const) {
      const v = o[key];
      if (Array.isArray(v)) return v.length;
    }
  }
  return null;
}

/** Human-readable lines from GET /api/auth0/management-connected-accounts (no secrets). */
function summarizeManagementConnectedAccounts(data: unknown): string[] {
  if (!data || typeof data !== "object") {
    return ["Unexpected response shape."];
  }
  const d = data as Record<string, unknown>;
  const lines: string[] = [];
  const ca = d.connected_accounts as Record<string, unknown> | undefined;
  if (ca && typeof ca.http_status === "number") {
    if (ca.http_status === 200) {
      const n = countConnectedAccountsPayload(ca.data);
      if (n !== null) {
        lines.push(
          n === 0
            ? "Connected accounts (Management API): 0 — My Account–style list is empty. That can happen if you only used Universal Login with Google; use Connect on an integration below so Token Vault can store provider tokens (separate from signing into Auth0 with Google)."
            : `Connected accounts (Management API): ${n} record(s).`
        );
      } else {
        lines.push(
          "Connected accounts (Management API): HTTP 200 — body is not a recognized list shape. Use “Connected accounts (Management API)” in Debug below to inspect JSON."
        );
      }
    } else {
      const err = ca.error;
      lines.push(
        `Connected accounts request: HTTP ${ca.http_status}${err ? ` — ${typeof err === "string" ? err : JSON.stringify(err).slice(0, 120)}` : ""}`
      );
    }
  }
  const fc = d.federated_connections_tokensets as Record<string, unknown> | undefined;
  if (fc && typeof fc.http_status === "number") {
    if (fc.http_status === 200) {
      lines.push("Federated connections tokensets: available (deprecated on some tenants).");
    } else if (fc.http_status === 403) {
      lines.push(
        "Federated connections tokensets: HTTP 403 (often deprecated or missing M2M scopes) — rely on connected accounts + diagnostics above."
      );
    } else {
      lines.push(`Federated connections tokensets: HTTP ${fc.http_status}`);
    }
  }
  if (typeof d.note === "string" && d.note.trim()) {
    lines.push(`Note: ${d.note.trim()}`);
  }
  return lines.length ? lines : ["No Management API summary available."];
}

export default function IntegrationsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [auth0Linked, setAuth0Linked] = useState(false);
  const [auth0Sub, setAuth0Sub] = useState<string | null>(null);
  const pendingVaultHandled = useRef(false);
  const [diagOpen, setDiagOpen] = useState(false);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagBody, setDiagBody] = useState("");
  const [diagTitle, setDiagTitle] = useState("Auth0 diagnostics");
  const [mgmtStatusLines, setMgmtStatusLines] = useState<string[] | null>(null);
  const [mgmtStatusLoading, setMgmtStatusLoading] = useState(false);
  const [mgmtStatusError, setMgmtStatusError] = useState<string | null>(null);
  const mgmtFetchedRef = useRef(false);

  const loadIntegrations = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await apiFetch("/api/integrations");
      if (resp.ok) {
        const data = await resp.json();
        setIntegrations(data.integrations || []);
        setAuth0Linked(Boolean(data.auth0_linked));
        setAuth0Sub(
          typeof data.auth0_sub === "string" ? data.auth0_sub : null
        );
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

  /**
   * Token Vault authorize must run in the same window as the app so the callback redirect
   * (…/dashboard/integrations?vault_exchange_ok=…) lands here and toasts/query handling work.
   */
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

  /** If Auth0 is not linked, link first (full page), then continue to Token Vault via sessionStorage + return URL. */
  const startConnectIntegration = useCallback(
    async (id: string) => {
      if (auth0Linked) {
        await connectVaultIntegration(id);
        return;
      }

      setConnecting(id);
      try {
        const resp = await apiFetch(auth0LinkUrlPath());
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

  const refreshManagementStatus = useCallback(async () => {
    setMgmtStatusLoading(true);
    setMgmtStatusError(null);
    setMgmtStatusLines(null);
    try {
      const resp = await apiFetch("/api/auth0/management-connected-accounts");
      const text = await resp.text();
      let data: unknown;
      try {
        data = JSON.parse(text) as unknown;
      } catch {
        setMgmtStatusError("Invalid JSON from server");
        return;
      }
      if (!resp.ok) {
        const detail =
          typeof data === "object" && data !== null && "detail" in data
            ? String((data as { detail?: unknown }).detail)
            : text.slice(0, 200);
        setMgmtStatusError(detail || `HTTP ${resp.status}`);
        return;
      }
      setMgmtStatusLines(summarizeManagementConnectedAccounts(data));
    } catch (e: unknown) {
      setMgmtStatusError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setMgmtStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!auth0Linked) {
      mgmtFetchedRef.current = false;
      setMgmtStatusLines(null);
      setMgmtStatusError(null);
    }
  }, [auth0Linked]);

  useEffect(() => {
    if (loading || !auth0Linked || mgmtFetchedRef.current) return;
    mgmtFetchedRef.current = true;
    void refreshManagementStatus();
  }, [loading, auth0Linked, refreshManagementStatus]);

  useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");
    const al = searchParams.get("auth0_linked");
    const vaultExchangeOk = searchParams.get("vault_exchange_ok");

    if (al !== "1") {
      pendingVaultHandled.current = false;
    }

    if (connected) {
      toast.success(`${connected} connected successfully!`);
      void loadIntegrations();
    }

    if (vaultExchangeOk === "0") {
      toast.error(
        "Token Vault did not return a Google API token (Echo retried). In Auth0: Google → Connected Accounts for Token Vault + Offline Access; if Google is vault-only, Link Auth0 must use another connection. Retry Connect or Auth0 diagnostics."
      );
      void loadIntegrations().then(() => {
        mgmtFetchedRef.current = false;
        void refreshManagementStatus();
      });
    } else if (vaultExchangeOk === "1") {
      toast.success("Integration connected — Token Vault exchange verified.");
      void loadIntegrations().then(() => {
        mgmtFetchedRef.current = false;
        void refreshManagementStatus();
      });
    } else if (al === "1") {
      const pending = sessionStorage.getItem(PENDING_VAULT_KEY);
      if (pending && ["slack", "github", "google"].includes(pending)) {
        toast.success("Auth0 linked. Opening provider sign-in…");
      } else {
        toast.success("Auth0 linked for integrations (Token Vault).");
      }
      void loadIntegrations().then(() => {
        if (pendingVaultHandled.current) return;
        const p = sessionStorage.getItem(PENDING_VAULT_KEY);
        if (p && ["slack", "github", "google"].includes(p)) {
          pendingVaultHandled.current = true;
          sessionStorage.removeItem(PENDING_VAULT_KEY);
          void connectVaultIntegration(p);
        }
      });
    }

    if (error) {
      const rawDesc = searchParams.get("error_description");
      const desc = rawDesc ? rawDesc.replace(/\+/g, " ") : "";
      if (error === "access_denied") {
        toast.error(
          desc
            ? `Access denied: ${desc}`
            : "Access denied. If you did not cancel sign-in, in Auth0 open Authentication → Social → your connection → Applications and enable your Echo app. Also ensure the connection allows Token Vault."
        );
      } else if (
        error === "invalid_request" &&
        /connection is not enabled/i.test(desc)
      ) {
        toast.error(
          "Auth0: this connection is not enabled for your app. Open Authentication → Social → Google or GitHub → Applications and enable your Echo Regular Web Application (same AUTH0_CLIENT_ID as the backend). If the connection name is custom, set AUTH0_CONNECTION_GOOGLE / AUTH0_CONNECTION_GITHUB in Doppler."
        );
      } else if (
        error === "invalid_request" &&
        /not active for authentication/i.test(desc)
      ) {
        toast.error(
          "Auth0: vault-only connections block Echo’s Connect flow. Enable “Authentication and Connected Accounts for Token Vault” on Google/GitHub. Set AUTH0_LINK_CONNECTION to your database (e.g. Username-Password-Authentication) so Link Auth0 stays email/password."
        );
      } else {
        toast.error(
          desc ? `OAuth error (${error}): ${desc}` : `OAuth error: ${error}`
        );
      }
    }
  }, [searchParams, loadIntegrations, connectVaultIntegration]);

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

  async function runAuth0Diagnostics() {
    setDiagTitle("Auth0 diagnostics");
    setDiagOpen(true);
    setDiagLoading(true);
    setDiagBody("");
    try {
      const resp = await apiFetch("/api/auth0/diagnostics?integration=google");
      const text = await resp.text();
      try {
        setDiagBody(JSON.stringify(JSON.parse(text), null, 2));
      } catch {
        setDiagBody(text);
      }
      if (!resp.ok) {
        toast.error("Diagnostics request failed");
      }
    } catch (e: unknown) {
      setDiagBody(e instanceof Error ? e.message : "Request failed");
      toast.error("Diagnostics request failed");
    } finally {
      setDiagLoading(false);
    }
  }

  async function runManagementConnectedAccounts() {
    setDiagTitle("Management API — connected accounts");
    setDiagOpen(true);
    setDiagLoading(true);
    setDiagBody("");
    try {
      const resp = await apiFetch("/api/auth0/management-connected-accounts");
      const text = await resp.text();
      try {
        setDiagBody(JSON.stringify(JSON.parse(text), null, 2));
      } catch {
        setDiagBody(text);
      }
      if (!resp.ok) {
        toast.error("Management API request failed — check backend env and M2M scopes.");
      }
    } catch (e: unknown) {
      setDiagBody(e instanceof Error ? e.message : "Request failed");
      toast.error("Management API request failed");
    } finally {
      setDiagLoading(false);
    }
  }

  async function unlinkAuth0Debug() {
    if (
      !window.confirm(
        "Remove Auth0 link and vault flags from your Echo account? Integration API access stops until you link Auth0 again."
      )
    ) {
      return;
    }
    try {
      const resp = await apiFetch("/api/auth0/link", { method: "DELETE" });
      if (!resp.ok) throw new Error(await resp.text());
      toast.success("Auth0 unlinked");
      setAuth0Sub(null);
      await loadIntegrations();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Unlink failed");
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 pb-24 md:p-10 md:pb-24">
      <div>
        <h1 className="text-2xl font-bold text-[#1A1A2E]">App Integrations</h1>
        <p className="mt-1 text-sm text-gray-500">
          Connect Slack, GitHub, or Google for workflow API calls. Echo login stays on Firebase; the first time
          you connect an app you link Auth0 (for Token Vault), then use <strong className="font-medium">Connect</strong>{" "}
          for each provider. If Google is reserved for Token Vault only in Auth0, link with email/password (or
          another auth connection)—not Google—then Connect Google here. Sign-in opens in this window so you return
          to Echo with the correct status.
        </p>

        {!auth0Linked ? (
          <div className="mt-4 rounded-lg border border-[#A577FF]/25 bg-[#F5F3FF]/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#1A1A2E]/80">
              Step 1 of 2 — Link Auth0 (Token Vault)
            </p>
            <p className="mt-1 text-sm text-gray-600">
              Click <strong className="font-medium">Connect</strong> on an integration below. You will sign in with
              Auth0 once (use <strong className="font-medium">email/password</strong> if your tenant uses Google only
              for Token Vault). Then complete Step 2 — Connect Slack, GitHub, or Google — in the same window.
            </p>
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-emerald-200/80 bg-emerald-50/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900/85">
                Step 2 — Connect each provider
              </p>
              <Badge className="border-emerald-200 bg-emerald-100/90 text-emerald-800">
                Auth0 linked
              </Badge>
            </div>
            {auth0Sub ? (
              <p className="mt-2 text-xs text-emerald-900/75">
                Auth0 profile:{" "}
                <code className="rounded bg-white/80 px-1 font-mono text-[11px]">
                  {auth0Sub.length > 48 ? `${auth0Sub.slice(0, 24)}…` : auth0Sub}
                </code>
              </p>
            ) : null}
            <div className="mt-3 border-t border-emerald-200/60 pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium text-emerald-900/90">
                  Auth0 Management API (your M2M app)
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 border-emerald-300/80 bg-white text-[11px] text-emerald-900"
                  disabled={mgmtStatusLoading}
                  onClick={() => void refreshManagementStatus()}
                >
                  {mgmtStatusLoading ? "Refreshing…" : "Refresh status"}
                </Button>
              </div>
              {mgmtStatusLoading && !mgmtStatusLines?.length && !mgmtStatusError ? (
                <p className="mt-2 text-xs text-emerald-900/60">Loading connection status…</p>
              ) : null}
              {mgmtStatusError ? (
                <p className="mt-2 text-xs text-red-700">{mgmtStatusError}</p>
              ) : null}
              {mgmtStatusLines?.length ? (
                <ul className="mt-2 list-inside list-disc space-y-2 break-words text-xs text-emerald-900/85">
                  {mgmtStatusLines.map((line, i) => (
                    <li key={i} className="pl-0.5">
                      {line}
                    </li>
                  ))}
                </ul>
              ) : null}
              {!mgmtStatusLoading && !mgmtStatusError && !mgmtStatusLines?.length && auth0Linked ? (
                <p className="mt-2 text-xs text-emerald-900/55">
                  Status will load automatically. If it stays empty, use Refresh or check backend M2M env.
                </p>
              ) : null}
            </div>
          </div>
        )}

        <div className="mt-4 rounded-lg border border-amber-200/90 bg-amber-50/50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-900/80">
            Debug
          </p>
          <p className="mt-1 text-xs leading-relaxed text-amber-950/70">
            Google API access uses Auth0 Token Vault: run “Connect Google” after Link Auth0. Signing into Auth0
            with Google does not by itself store the Google refresh token the vault exchange needs. In Auth0 →
            Social → Google, enable Connected Accounts for Token Vault and Offline Access. If Google is set to
            Token Vault only (not for Universal Login), enable another Auth0 authentication connection first,
            then Link Auth0 with that method—see README “Firebase vs Auth0 and Google connection Purpose”.
          </p>
          <div className="mt-3 rounded-md border border-amber-300/60 bg-white/80 p-3">
            <p className="text-xs font-semibold text-amber-950">Auth0 Management API (debug)</p>
            <p className="mt-1 text-[11px] leading-relaxed text-amber-950/75">
              Set <code className="rounded bg-amber-100/80 px-0.5 font-mono text-[10px]">AUTH0_MGMT_CLIENT_ID</code>{" "}
              and <code className="rounded bg-amber-100/80 px-0.5 font-mono text-[10px]">AUTH0_MGMT_CLIENT_SECRET</code>{" "}
              on the <strong className="font-medium">backend</strong> (M2M app → Auth0 Management API; grant at least{" "}
              <code className="font-mono text-[10px]">read:users</code> and whatever your tenant requires for connected
              accounts). Restart the API. Then use the button below — credentials never leave the server.
            </p>
            <p className="mt-2 text-[10px] leading-relaxed text-amber-950/65">
              An empty <code className="font-mono">connected_accounts</code> list means Auth0 has not stored provider
              tokens for this user yet. If <code className="font-mono">federated_connections_tokensets</code> returns
              403 deprecated, Auth0 may disable that Management API on your tenant—use Dashboard → Users → Connected
              Accounts and <strong className="font-medium">Auth0 diagnostics</strong> (vault probe) instead.
            </p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 border-amber-300/80 bg-white text-xs text-amber-950 hover:bg-amber-50"
              onClick={() => void runAuth0Diagnostics()}
            >
              <IconStethoscope className="mr-1 h-3.5 w-3.5" />
              Auth0 diagnostics
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 border-amber-300/80 bg-white text-xs text-amber-950 hover:bg-amber-50"
              onClick={() => void runManagementConnectedAccounts()}
            >
              <IconUsersGroup className="mr-1 h-3.5 w-3.5" />
              Connected accounts (Management API)
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 border-red-200 bg-white text-xs text-red-600 hover:bg-red-50"
              onClick={() => void unlinkAuth0Debug()}
            >
              <IconUnlink className="mr-1 h-3.5 w-3.5" />
              Unlink Auth0
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={diagOpen} onOpenChange={setDiagOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{diagTitle}</DialogTitle>
            <DialogDescription>
              {diagTitle.startsWith("Management") ? (
                <span className="text-xs">
                  <code>GET /api/auth0/management-connected-accounts</code> — calls Auth0 Management API for{" "}
                  <code className="font-mono">connected-accounts</code> and{" "}
                  <code className="font-mono">federated-connections-tokensets</code> (Token Vault). M2M env only.
                </span>
              ) : (
                <span className="text-xs">
                  <code>GET /api/auth0/diagnostics?integration=google</code> — no raw tokens returned.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          {diagLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <pre className="max-h-[60vh] overflow-auto rounded-md border bg-muted/40 p-3 text-left text-[11px] leading-relaxed break-all font-mono whitespace-pre-wrap">
              {diagBody || "—"}
            </pre>
          )}
        </DialogContent>
      </Dialog>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {integrations.map((integration) => (
            <div
              key={integration.id}
              className={cn(
                "group flex flex-col gap-3 rounded-xl border p-5 transition-all",
                integration.connected
                  ? "border-emerald-200 bg-emerald-50/50"
                  : "border-[#A577FF]/20 bg-white hover:border-[#A577FF]/40 hover:shadow-sm"
              )}
            >
              <div className="flex items-start justify-between">
                <div
                  className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-xl",
                    integration.connected
                      ? "bg-emerald-100 text-emerald-600"
                      : "bg-[#F5F3FF] text-[#A577FF]"
                  )}
                >
                  {ICON_MAP[integration.icon] || <IconPlug className="h-6 w-6" />}
                </div>
                {integration.connected ? (
                  <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">
                    <IconCheck className="mr-1 h-3 w-3" />
                    Connected
                  </Badge>
                ) : integration.note ? (
                  <Badge variant="outline" className="border-[#A577FF]/30 text-[#A577FF] text-xs">
                    Auto
                  </Badge>
                ) : null}
              </div>

              <div>
                <h3 className="font-semibold text-[#1A1A2E]">{integration.name}</h3>
                <p className="mt-0.5 text-xs text-gray-500">{integration.description}</p>
                {integration.account_name && (
                  <p className="mt-1 text-xs text-emerald-600">
                    Connected as: {integration.account_name}
                  </p>
                )}
                {integration.note && (
                  <p className="mt-1 text-xs text-[#A577FF]">{integration.note}</p>
                )}
              </div>

              <div className="mt-auto flex flex-col gap-2">
                {integration.oauth && !integration.note ? (
                  integration.connected ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => disconnectIntegration(integration.id)}
                      className="h-7 text-xs border-red-200 text-red-500 hover:bg-red-50"
                    >
                      <IconX className="mr-1 h-3 w-3" />
                      Disconnect
                    </Button>
                  ) : integration.token_vault ? (
                    <Button
                      size="sm"
                      onClick={() => startConnectIntegration(integration.id)}
                      disabled={connecting === integration.id}
                      className="echo-btn-cyan-lavender h-7 text-xs"
                    >
                      <IconExternalLink className="mr-1 h-3 w-3" />
                      {connecting === integration.id ? "Connecting…" : "Connect"}
                    </Button>
                  ) : null
                ) : (
                  <span className="text-xs text-gray-400 italic">
                    Uses Google sign-in
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
