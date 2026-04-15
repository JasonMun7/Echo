"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { LayoutGrid, Zap, FolderTree, MousePointer2, Plug } from "lucide-react";
import {
  EchoSearchWithSuggestions,
  type EchoSearchSuggestion,
} from "@/components/ui/echo-search-with-suggestions";
import { formatActionPickerLabel } from "@/lib/workflow-action-labels";
import { apiFetch } from "@/lib/api";
import type { Integration } from "@/app/dashboard/integrations/_lib/integration-types";
import { brandfetchLogoUrlForIntegrationId } from "@/app/dashboard/integrations/_lib/brandfetch-logo";
import { COMPOSIO_APP_GROUPS, catalogEntriesForAppGroup } from "@/lib/composio-app-groups";
import { WorkflowActionIcon } from "@/lib/workflow-action-icons";
import { GradientIconWell, gradientWellImageClass } from "@/components/ui/gradient-icon-well";
import { cn } from "@/lib/utils";

type CategoryId = "all" | "apps" | "screen" | "utils";

const CATS: { id: CategoryId; label: string; icon: ReactNode }[] = [
  { id: "all", label: "All", icon: <FolderTree className="h-4 w-4" aria-hidden /> },
  { id: "screen", label: "Screen", icon: <MousePointer2 className="h-4 w-4" aria-hidden /> },
  { id: "utils", label: "Utilities", icon: <Zap className="h-4 w-4" aria-hidden /> },
  { id: "apps", label: "Apps", icon: <LayoutGrid className="h-4 w-4" aria-hidden /> },
];

function integrationEffectivelyConnected(i: Integration): boolean {
  return Boolean(i.connected || i.composio_account_active === true);
}

function defaultApiCallParamsForIntegration(integrationId: string): Record<string, unknown> {
  const g = COMPOSIO_APP_GROUPS.find((x) => x.integrationId === integrationId);
  if (!g) return {};
  const tools = catalogEntriesForAppGroup(g.key);
  const first = tools[0];
  if (!first) return {};
  return { slug: first.slug, arguments: {} };
}

type AddActionModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions: readonly string[];
  onPickAction: (action: string, options?: { params?: Record<string, unknown> }) => void;
  /** `changeStepType`: same picker, updates an existing step instead of inserting (inspector). */
  pickerMode?: "add" | "changeStepType";
};

function IntegrationPickTile({
  integration,
  onPick,
}: {
  integration: Integration;
  onPick: () => void;
}) {
  const url = brandfetchLogoUrlForIntegrationId(integration.id);
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <button
      type="button"
      onClick={onPick}
      className="flex w-full flex-row items-center gap-3 rounded-xl border border-[#150A35]/10 bg-white px-3 py-3 text-left shadow-sm transition hover:border-[#150A35]/18 hover:shadow-md"
    >
      <GradientIconWell
        corners="lg"
        className="h-10 w-10 shrink-0"
        innerClassName="overflow-hidden"
      >
        {url && !imgFailed ? (
          // eslint-disable-next-line @next/next/no-img-element -- Brandfetch hotlink
          <img
            src={url}
            alt=""
            width={40}
            height={40}
            className={gradientWellImageClass("lg")}
            onError={() => setImgFailed(true)}
          />
        ) : (
          <Plug className="h-5 w-5 text-muted-foreground" aria-hidden />
        )}
      </GradientIconWell>
      <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <span className="block text-sm font-semibold text-[#150A35]">{integration.name}</span>
        {(integration.tagline || integration.description) && (
          <span className="line-clamp-2 text-xs leading-snug text-[#6b7280]">
            {(integration.tagline || integration.description).trim()}
          </span>
        )}
      </span>
    </button>
  );
}

export function AddActionModal({
  open,
  onOpenChange,
  actions,
  onPickAction,
  pickerMode = "add",
}: AddActionModalProps) {
  const [cat, setCat] = useState<CategoryId>("all");
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [integrationsLoading, setIntegrationsLoading] = useState(false);

  useEffect(() => {
    if (open) setCat("all");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setIntegrationsLoading(true);
    apiFetch("/api/integrations", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { integrations?: Integration[] } | null) => {
        if (cancelled || !d?.integrations) return;
        setIntegrations(d.integrations);
      })
      .catch(() => setIntegrations([]))
      .finally(() => {
        if (!cancelled) setIntegrationsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const connectedApps = useMemo(() => {
    return integrations
      .filter((i) => integrationEffectivelyConnected(i))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [integrations]);

  const availableApps = useMemo(() => {
    return integrations
      .filter((i) => !integrationEffectivelyConnected(i))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [integrations]);

  const suggestions: EchoSearchSuggestion[] = useMemo(
    () =>
      actions.map((a) => ({
        id: a,
        label: formatActionPickerLabel(a),
        subtitle: a === "api_call" ? "App integration (Composio)" : undefined,
        icon: (
          <WorkflowActionIcon
            action={a}
            className="h-4 w-4 text-[#150A35]"
            preferComposioLogo={false}
          />
        ),
      })),
    [actions],
  );

  const filteredGrid = useMemo(() => {
    const list = [...actions];
    if (cat === "apps") return [] as string[];
    if (cat === "screen") {
      return list.filter((a) =>
        ["click_at", "type_text_at", "scroll", "navigate", "take_screenshot", "hover"].includes(a),
      );
    }
    if (cat === "utils") return list.filter((a) => ["wait", "press_key", "hotkey"].includes(a));
    return list;
  }, [actions, cat]);

  if (!open) return null;

  const dialogLabel = pickerMode === "changeStepType" ? "Change step type" : "Add step";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[#150A35]/30 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="flex h-[min(90vh,640px)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[#150A35]/10 bg-white shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-label={dialogLabel}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <nav
            aria-label="Categories"
            className="flex shrink-0 gap-1 overflow-x-auto border-[#150A35]/8 p-3 md:w-52 md:flex-col md:overflow-y-auto md:border-r md:gap-0"
          >
            {CATS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCat(c.id)}
                className={cn(
                  "flex shrink-0 flex-row items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium md:w-full md:justify-start",
                  cat === c.id
                    ? "bg-[#150A35]/8 text-[#150A35]"
                    : "text-[#150A35]/70 hover:bg-[#150A35]/5",
                )}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#150A35]/10 bg-white text-[#150A35]/80 shadow-sm">
                  {c.icon}
                </span>
                <span>{c.label}</span>
              </button>
            ))}
          </nav>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-4">
            <div className="shrink-0 pb-3">
              <EchoSearchWithSuggestions
                items={suggestions}
                placeholder="Search apps and actions…"
                centerSuggestions
                onSelect={(item) => {
                  onPickAction(item.id);
                  onOpenChange(false);
                }}
                className="w-full"
              />
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <p className="mb-2 shrink-0 text-xs font-medium uppercase tracking-wide text-[#150A35]/50">
                Browse
              </p>
              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                {cat === "apps" ? (
                  <div className="space-y-6">
                    <p className="text-xs leading-relaxed text-[#6b7280]">
                      {pickerMode === "changeStepType" ? (
                        <>
                          Picks the app integration for{" "}
                          <span className="font-medium text-[#150A35]">this</span> step (same
                          catalog as Integrations). You can adjust the tool in the editor afterward.
                        </>
                      ) : (
                        <>
                          Same catalog as{" "}
                          <span className="font-medium text-[#150A35]">Integrations</span>. Echo
                          adds an app step you can configure in the editor.
                        </>
                      )}
                    </p>
                    {integrationsLoading ? (
                      <p className="text-sm text-[#6b7280]">Loading apps…</p>
                    ) : integrations.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-[#150A35]/15 bg-[#F5F7FC] px-4 py-8 text-center text-sm text-[#150A35]/60">
                        No apps returned from the server. Check Composio configuration or try again
                        later.
                      </p>
                    ) : (
                      <>
                        <section className="space-y-2" aria-labelledby="add-step-apps-connected">
                          <h3
                            id="add-step-apps-connected"
                            className="text-xs font-semibold uppercase tracking-wide text-[#150A35]/70"
                          >
                            Connected
                          </h3>
                          {connectedApps.length === 0 ? (
                            <p className="text-sm text-[#6b7280]">
                              No connected apps yet — connect from Integrations, or choose an app
                              below to add a step and wire OAuth afterward.
                            </p>
                          ) : (
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                              {connectedApps.map((integration) => (
                                <IntegrationPickTile
                                  key={integration.id}
                                  integration={integration}
                                  onPick={() => {
                                    onPickAction("api_call", {
                                      params: defaultApiCallParamsForIntegration(integration.id),
                                    });
                                    onOpenChange(false);
                                  }}
                                />
                              ))}
                            </div>
                          )}
                        </section>
                        <section className="space-y-2" aria-labelledby="add-step-apps-available">
                          <h3
                            id="add-step-apps-available"
                            className="text-xs font-semibold uppercase tracking-wide text-[#150A35]/70"
                          >
                            Available
                          </h3>
                          {availableApps.length === 0 ? (
                            <p className="text-sm text-[#6b7280]">
                              Every catalog app is connected.
                            </p>
                          ) : (
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                              {availableApps.map((integration) => (
                                <IntegrationPickTile
                                  key={integration.id}
                                  integration={integration}
                                  onPick={() => {
                                    onPickAction("api_call", {
                                      params: defaultApiCallParamsForIntegration(integration.id),
                                    });
                                    onOpenChange(false);
                                  }}
                                />
                              ))}
                            </div>
                          )}
                        </section>
                      </>
                    )}
                  </div>
                ) : filteredGrid.length === 0 ? (
                  <p className="col-span-full rounded-lg border border-dashed border-[#150A35]/15 bg-[#F5F7FC] px-4 py-8 text-center text-sm text-[#150A35]/60">
                    No actions in this category.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {filteredGrid.map((a) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => {
                          onPickAction(a);
                          onOpenChange(false);
                        }}
                        className="flex flex-row items-center justify-center gap-3 rounded-lg border border-[#150A35]/10 bg-[#F5F7FC] px-3 py-2.5 text-left text-sm font-medium text-[#150A35] transition hover:border-[#150A35]/25 hover:bg-white"
                      >
                        <GradientIconWell corners="lg" className="h-9 w-9 shrink-0">
                          <WorkflowActionIcon
                            action={a}
                            className="h-4 w-4 text-card-foreground"
                            preferComposioLogo={false}
                          />
                        </GradientIconWell>
                        <span className="min-w-0 flex-1 leading-snug">
                          {formatActionPickerLabel(a)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
