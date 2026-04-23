"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ComponentType, type ReactNode } from "react";
import { Database, LineChart, PlusCircle, Settings, Workflow } from "lucide-react";
import {
  IconBrandGithub,
  IconBrandGoogle,
  IconBrandSlack,
  IconCalendarClock,
  IconDashboard,
  IconHelp,
  IconPlug,
  IconSearch,
  IconSettings,
  IconSparkles2,
  IconTool,
  IconUser,
} from "@tabler/icons-react";
import { Bell as BellLucide, Palette } from "lucide-react";

import {
  brandfetchLogoUrlForDomain,
  brandfetchLogoUrlForIntegrationId,
} from "@/app/dashboard/integrations/_lib/brandfetch-logo";
import type { Integration } from "@/app/dashboard/integrations/_lib/integration-types";
import { useDashboardProfileNav } from "@/components/dashboard-profile-nav-context";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { GradientIconWell, gradientWellImageClass } from "@/components/ui/gradient-icon-well";
import type { ProfileModalSection } from "@/components/profile/profile-modal";
import { apiFetch } from "@/lib/api";
import { workflowStatusLabel } from "@/lib/workflow-status";
import { cn } from "@/lib/utils";

type WorkflowListItem = {
  id: string;
  name?: string;
  status?: string;
  thumbnail_gcs_path?: string;
  brand_domain?: string;
};

const NAV_ROUTES: {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  keywords?: string;
}[] = [
  { label: "Dashboard", href: "/dashboard", icon: IconDashboard, keywords: "home overview" },
  { label: "Workflows", href: "/dashboard/workflows", icon: Workflow, keywords: "automations" },
  { label: "New workflow", href: "/dashboard/workflows/new", icon: PlusCircle, keywords: "create" },
  {
    label: "EchoPrism",
    href: "/dashboard/chat",
    icon: IconSparkles2,
    keywords: "chat voice agent",
  },
  { label: "MCP Tools", href: "/dashboard/mcp", icon: IconTool, keywords: "tools connectors" },
  {
    label: "Integrations",
    href: "/dashboard/integrations",
    icon: IconPlug,
    keywords: "oauth apps composio",
  },
  {
    label: "Schedule",
    href: "/dashboard/schedule",
    icon: IconCalendarClock,
    keywords: "cron automation",
  },
  { label: "Traces", href: "/dashboard/traces", icon: LineChart, keywords: "logs spans" },
  {
    label: "Create dataset",
    href: "/dashboard/datasets/create",
    icon: Database,
    keywords: "data upload",
  },
  { label: "Settings", href: "/dashboard/settings", icon: Settings, keywords: "preferences" },
];

const PROFILE_ITEMS: {
  section: ProfileModalSection;
  label: string;
  subtitle: string;
  icon: ComponentType<{ className?: string }>;
}[] = [
  {
    section: "general",
    label: "Profile — General",
    subtitle: "Profile and account",
    icon: IconUser,
  },
  {
    section: "appearance",
    label: "Profile — Appearance",
    subtitle: "Theme and display",
    icon: Palette,
  },
  {
    section: "notifications",
    label: "Profile — Notifications",
    subtitle: "Alerts and EchoPrism",
    icon: BellLucide,
  },
  {
    section: "account",
    label: "Profile — Account",
    subtitle: "Security and data",
    icon: IconSettings,
  },
  { section: "help", label: "Profile — Help", subtitle: "Contact and support", icon: IconHelp },
];

function WellIcon({
  Icon,
  className,
}: {
  Icon: ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <GradientIconWell corners="lg" className={cn("h-7 w-7 shrink-0", className)}>
      <Icon className="h-3.5 w-3.5 text-card-foreground" />
    </GradientIconWell>
  );
}

/** Match workflow list cards: Brandfetch from `brand_domain`, else Lucide `Workflow`. */
function WorkflowCommandLeading({ workflow }: { workflow: WorkflowListItem }) {
  const [logoFailed, setLogoFailed] = useState(false);
  const domain = typeof workflow.brand_domain === "string" ? workflow.brand_domain.trim() : "";
  const logoUrl = domain && !logoFailed ? brandfetchLogoUrlForDomain(domain) : null;

  if (logoUrl) {
    return (
      <GradientIconWell corners="lg" className="h-7 w-7 shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element -- Brandfetch CDN */}
        <img
          src={logoUrl}
          alt=""
          width={28}
          height={28}
          loading="lazy"
          decoding="async"
          className={gradientWellImageClass("lg")}
          onError={() => setLogoFailed(true)}
        />
      </GradientIconWell>
    );
  }

  return (
    <GradientIconWell corners="lg" className="h-7 w-7 shrink-0">
      <Workflow className="h-3.5 w-3.5 text-[#A577FF]" strokeWidth={1.75} aria-hidden />
    </GradientIconWell>
  );
}

const INTEGRATION_ICON_MAP: Record<string, ReactNode> = {
  IconBrandSlack: <IconBrandSlack className="h-3.5 w-3.5 text-muted-foreground" />,
  IconBrandGithub: <IconBrandGithub className="h-3.5 w-3.5 text-muted-foreground" />,
  IconBrandGoogle: <IconBrandGoogle className="h-3.5 w-3.5 text-muted-foreground" />,
};

function IntegrationCommandLeading({ integration }: { integration: Integration }) {
  const url = brandfetchLogoUrlForIntegrationId(integration.id);
  const [failed, setFailed] = useState(false);
  const showImg = Boolean(url && !failed);

  return (
    <GradientIconWell corners="lg" className="h-7 w-7 shrink-0">
      {showImg && url ? (
        // eslint-disable-next-line @next/next/no-img-element -- Brandfetch CDN hotlink
        <img
          src={url}
          alt=""
          width={28}
          height={28}
          loading="lazy"
          decoding="async"
          className={gradientWellImageClass("lg")}
          onError={() => setFailed(true)}
        />
      ) : (
        (INTEGRATION_ICON_MAP[integration.icon] ?? (
          <IconPlug className="h-3.5 w-3.5 text-muted-foreground" />
        ))
      )}
    </GradientIconWell>
  );
}

export function useDashboardCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return { open, setOpen };
}

export function DashboardCommandMenu({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { openProfile } = useDashboardProfileNav();

  const [workflows, setWorkflows] = useState<WorkflowListItem[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    void (async () => {
      try {
        const res = await apiFetch("/api/workflows");
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { workflows?: WorkflowListItem[] };
        if (!cancelled) setWorkflows(data.workflows ?? []);
      } catch {
        if (!cancelled) setWorkflows([]);
      }
    })();

    void (async () => {
      try {
        const res = await apiFetch("/api/integrations");
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { integrations?: Integration[] };
        if (!cancelled) setIntegrations(data.integrations ?? []);
      } catch {
        if (!cancelled) setIntegrations([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  const run = useCallback(
    (href: string) => {
      onOpenChange(false);
      router.push(href);
    },
    [onOpenChange, router],
  );

  const runProfile = useCallback(
    (section: ProfileModalSection) => {
      onOpenChange(false);
      openProfile(section);
    },
    [onOpenChange, openProfile],
  );

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Search" description="Go to…">
      <CommandInput placeholder="Search pages, workflows, steps…" />
      <CommandList className="max-h-[min(420px,60vh)]">
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Navigate">
          {NAV_ROUTES.map((r) => (
            <CommandItem
              key={`${r.href}:${r.label}`}
              value={`${r.label} ${r.keywords ?? ""} ${r.href}`}
              onSelect={() => run(r.href)}
            >
              <WellIcon Icon={r.icon} />
              <span>{r.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading="Account">
          {PROFILE_ITEMS.map((p) => (
            <CommandItem
              key={p.section}
              value={`${p.label} ${p.subtitle} profile settings`}
              onSelect={() => runProfile(p.section)}
            >
              <WellIcon Icon={p.icon} />
              <div className="flex min-w-0 flex-col">
                <span>{p.label}</span>
                <span className="text-xs text-muted-foreground">{p.subtitle}</span>
              </div>
            </CommandItem>
          ))}
        </CommandGroup>

        {workflows.length > 0 ? (
          <CommandGroup heading="Workflows">
            {workflows.map((w) => (
              <CommandItem
                key={w.id}
                value={`${w.name?.trim() || "Untitled workflow"} ${workflowStatusLabel(w.status)} workflow`}
                onSelect={() => run(`/dashboard/workflows/${w.id}/edit`)}
              >
                <WorkflowCommandLeading workflow={w} />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate">{w.name?.trim() || "Untitled workflow"}</span>
                  {w.status ? (
                    <span className="truncate text-xs text-muted-foreground">
                      {workflowStatusLabel(w.status)}
                    </span>
                  ) : null}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {integrations.length > 0 ? (
          <CommandGroup heading="Integrations">
            {integrations.map((i) => (
              <CommandItem
                key={i.id}
                value={`${i.name} ${i.tagline ?? ""} ${i.description} ${i.id} integration`}
                onSelect={() =>
                  run(`/dashboard/integrations?highlight=${encodeURIComponent(i.id)}`)
                }
              >
                <IntegrationCommandLeading integration={i} />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate">{i.name}</span>
                  {(i.tagline || i.description) && (
                    <span className="line-clamp-1 text-xs text-muted-foreground">
                      {i.tagline || i.description.slice(0, 80)}
                    </span>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}

export function DashboardSearchTrigger({
  className,
  onClick,
}: {
  className?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full max-w-xl items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left text-sm text-muted-foreground shadow-sm",
        "transition-colors hover:bg-card hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A577FF]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-card",
        className,
      )}
    >
      <GradientIconWell corners="lg" className="h-7 w-7 shrink-0">
        <IconSearch className="h-3 w-3 text-card-foreground" aria-hidden />
      </GradientIconWell>
      <span className="flex-1 truncate font-medium text-muted-foreground">Search or jump to…</span>
      <kbd className="pointer-events-none hidden h-[1.125rem] select-none items-center gap-1 rounded border border-border bg-muted/80 px-1 font-mono text-[10px] font-medium leading-none text-muted-foreground sm:inline-flex">
        ⌘K
      </kbd>
    </button>
  );
}
