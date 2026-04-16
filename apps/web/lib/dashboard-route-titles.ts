/**
 * Icon keys for the dashboard header — mapped to Lucide icons in `site-header.tsx`.
 * First matching rule wins. Keep more specific routes before general prefixes.
 */
export type DashboardHeaderIconId =
  | "layout-dashboard"
  | "workflow"
  | "plus-circle"
  | "play-circle"
  | "square-pen"
  | "file-text"
  | "database"
  | "line-chart"
  | "file-search"
  | "sparkles"
  | "boxes"
  | "plug"
  | "calendar";

export type DashboardPageHeaderMeta = {
  title: string;
  description: string;
  icon: DashboardHeaderIconId;
};

const HEADER_RULES: {
  test: (pathname: string) => boolean;
  title: string;
  description: string;
  icon: DashboardHeaderIconId;
}[] = [
  {
    test: (p) => p === "/dashboard" || p === "/dashboard/",
    title: "Dashboard",
    description: "Overview of your workspace and shortcuts to what matters.",
    icon: "layout-dashboard",
  },
  {
    test: (p) => /\/dashboard\/workflows\/[^/]+\/runs\//.test(p),
    title: "Run",
    description: "Live status, logs, and output for this run.",
    icon: "play-circle",
  },
  {
    test: (p) => /\/dashboard\/workflows\/[^/]+\/edit/.test(p),
    title: "Edit workflow",
    description: "Design the flow, steps, and publishing on the canvas.",
    icon: "square-pen",
  },
  {
    test: (p) => /^\/dashboard\/workflows\/[^/]+/.test(p),
    title: "Workflow",
    description: "Runs, sharing, thumbnails, and workflow details.",
    icon: "file-text",
  },
  {
    test: (p) => p.startsWith("/dashboard/workflows"),
    title: "Workflows",
    description: "Create, run, fork, and collaborate on workflows.",
    icon: "workflow",
  },
  {
    test: (p) => p.startsWith("/dashboard/datasets/create"),
    title: "Create dataset",
    description: "Upload or connect data for training and evaluation.",
    icon: "database",
  },
  {
    test: (p) => /^\/dashboard\/traces\/.+/.test(p),
    title: "Trace",
    description: "Spans, timing, and context for this trace.",
    icon: "file-search",
  },
  {
    test: (p) => p.startsWith("/dashboard/traces"),
    title: "Traces",
    description: "Browse and search recorded agent and workflow traces.",
    icon: "line-chart",
  },
  {
    test: (p) => p.startsWith("/dashboard/datasets"),
    title: "Datasets",
    description: "Manage datasets available to your workspace.",
    icon: "database",
  },
  {
    test: (p) => p.startsWith("/dashboard/chat"),
    title: "EchoPrism",
    description: "Voice and chat with your Echo agent.",
    icon: "sparkles",
  },
  {
    test: (p) => p.startsWith("/dashboard/mcp"),
    title: "MCP Tools",
    description: "Custom tools and connectors for agents.",
    icon: "boxes",
  },
  {
    test: (p) => p.startsWith("/dashboard/integrations"),
    title: "Integrations & Webhooks",
    description: "OAuth accounts and third-party connections.",
    icon: "plug",
  },
  {
    test: (p) => p.startsWith("/dashboard/schedule"),
    title: "Schedule",
    description: "Scheduled runs and automation windows.",
    icon: "calendar",
  },
];

const DEFAULT_META: DashboardPageHeaderMeta = {
  title: "Dashboard",
  description: "Your Echo workspace.",
  icon: "layout-dashboard",
};

export function getDashboardPageMetadata(pathname: string): DashboardPageHeaderMeta {
  const path = pathname.split("?")[0] || "/dashboard";
  for (const rule of HEADER_RULES) {
    if (rule.test(path)) {
      return { title: rule.title, description: rule.description, icon: rule.icon };
    }
  }
  return DEFAULT_META;
}

export function getDashboardPageTitle(pathname: string): string {
  return getDashboardPageMetadata(pathname).title;
}
