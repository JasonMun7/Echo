"use client";

import React, { useState, useEffect } from "react";
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
  IconMail,
  IconTable,
  IconCalendar,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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
}

const ICON_MAP: Record<string, React.ReactNode> = {
  IconBrandSlack: <IconBrandSlack className="h-6 w-6" />,
  IconMail: <IconMail className="h-6 w-6" />,
  IconTable: <IconTable className="h-6 w-6" />,
  IconCalendar: <IconCalendar className="h-6 w-6" />,
  IconBrandGithub: <IconBrandGithub className="h-6 w-6" />,
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

export default function IntegrationsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);

  useEffect(() => {
    const unsub = auth?.onAuthStateChanged((u) => {
      if (!u) router.replace("/signin");
      else loadIntegrations();
    });
    return () => unsub?.();
  }, [router]);

  useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");
    if (connected) {
      toast.success(`${connected} connected successfully!`);
      loadIntegrations();
    }
    if (error) {
      toast.error(`OAuth error: ${error}`);
    }
  }, [searchParams]);

  async function loadIntegrations() {
    setLoading(true);
    try {
      const resp = await apiFetch("/api/integrations");
      if (resp.ok) {
        const data = await resp.json();
        setIntegrations(data.integrations || []);
      }
    } catch {
      toast.error("Failed to load integrations");
    } finally {
      setLoading(false);
    }
  }

  async function connectIntegration(id: string) {
    setConnecting(id);
    try {
      const resp = await apiFetch(`/api/integrations/${id}/connect`);
      if (!resp.ok) throw new Error(await resp.text());
      const data = await resp.json();
      const popup = window.open(data.auth_url, "oauth", "width=600,height=700");
      if (!popup) {
        window.location.href = data.auth_url;
        return;
      }
      const check = setInterval(() => {
        if (popup.closed) {
          clearInterval(check);
          loadIntegrations();
          setConnecting(null);
        }
      }, 500);
    } catch (e: unknown) {
      toast.error(`Connect failed: ${e instanceof Error ? e.message : "Unknown error"}`);
      setConnecting(null);
    }
  }

  async function disconnectIntegration(id: string) {
    try {
      const resp = await apiFetch(`/api/integrations/${id}`, { method: "DELETE" });
      if (!resp.ok) throw new Error(await resp.text());
      toast.success(`${id} disconnected`);
      await loadIntegrations();
    } catch {
      toast.error("Failed to disconnect");
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 rounded-tl-2xl border border-[#A577FF]/20 bg-white p-6 md:p-10">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#1A1A2E]">App Integrations</h1>
        <p className="mt-1 text-sm text-gray-500">
          Connect apps so EchoPrism can use them in workflows — combining UI clicks with API calls.
        </p>
      </div>

      {/* Info banner */}
      <div className="rounded-xl border border-[#A577FF]/20 bg-[#F5F3FF] px-4 py-3 text-sm text-[#5B3FA0]">
        <div className="flex items-center gap-2">
          <IconPlug className="h-4 w-4 shrink-0" />
          <span>
            Connected integrations become available as <code className="font-mono text-xs bg-[#A577FF]/10 px-1 rounded">api_call</code> steps in your workflows — faster, cheaper, and more reliable than UI clicks for known apps.
          </span>
        </div>
      </div>

      {/* Integration grid */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-40 rounded-xl bg-gray-100 animate-pulse" />
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
                    integration.connected ? "bg-emerald-100 text-emerald-600" : "bg-[#F5F3FF] text-[#A577FF]"
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
                  <p className="mt-1 text-xs text-emerald-600">Connected as: {integration.account_name}</p>
                )}
                {integration.note && (
                  <p className="mt-1 text-xs text-[#A577FF]">{integration.note}</p>
                )}
              </div>

              <div className="mt-auto flex gap-2">
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
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => connectIntegration(integration.id)}
                      disabled={connecting === integration.id}
                      className="h-7 text-xs bg-linear-to-r from-[#A577FF] to-[#7C3AED] text-white hover:opacity-90"
                    >
                      <IconExternalLink className="mr-1 h-3 w-3" />
                      {connecting === integration.id ? "Connecting..." : "Connect"}
                    </Button>
                  )
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
