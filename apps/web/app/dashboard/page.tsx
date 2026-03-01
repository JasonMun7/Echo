"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  IconCircleCheck,
  IconJumpRope,
  IconPlus,
  IconArrowRight,
  IconBrandChrome,
  IconDeviceLaptop,
  IconPlayerPlay,
  IconAlertTriangle,
  IconX,
  IconRocket,
  IconBrain,
  IconMessageCircle,
} from "@tabler/icons-react";
const STATUS_LABELS: Record<string, string> = {
  draft: "Setting Up",
  processing: "Synthesizing",
  ready: "Ready",
  active: "Live",
  failed: "Failed",
  cancelled: "Cancelled",
};

interface Workflow {
  id: string;
  name?: string;
  status: string;
  workflow_type?: "browser" | "desktop";
  thumbnail_gcs_path?: string;
  createdAt: unknown;
  updatedAt: unknown;
}

function getTime(x: unknown): number {
  if (typeof (x as { toMillis?: () => number })?.toMillis === "function") {
    return (x as { toMillis: () => number }).toMillis();
  }
  return 0;
}

export default function DashboardPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalRuns, setTotalRuns] = useState(0);
  const [awaitingRuns, setAwaitingRuns] = useState<{ workflowId: string; runId: string } | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const user = auth?.currentUser;

  useEffect(() => {
    // Show onboarding for first-time users
    const isNew = localStorage.getItem("echo_user_created") === "true";
    const dismissed = localStorage.getItem("echo_onboarding_dismissed") === "true";
    if (isNew && !dismissed) setTimeout(() => setShowOnboarding(true), 0);
  }, []);

  useEffect(() => {
    if (!db || !user) {
      setTimeout(() => setLoading(false), 0);
      return;
    }
    const uid = user.uid;

    const wfQ = query(
      collection(db, "workflows"),
      where("owner_uid", "==", uid),
    );
    // Track nested runs listeners so we can clean them up when workflows are deleted
    const runUnsubs = new Map<string, () => void>();
    const runSizes = new Map<string, number>();

    function recomputeRuns() {
      let total = 0;
      runSizes.forEach((n) => { total += n; });
      setTotalRuns(total);
    }

    const unsubWf = onSnapshot(wfQ, (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as Workflow)
        .sort((a, b) => getTime(b.updatedAt) - getTime(a.updatedAt));
      setWorkflows(list);
      setLoading(false);

      const currentIds = new Set(snap.docs.map((d) => d.id));

      // Clean up listeners for deleted workflows
      runUnsubs.forEach((unsub, id) => {
        if (!currentIds.has(id)) {
          unsub();
          runUnsubs.delete(id);
          runSizes.delete(id);
        }
      });

      recomputeRuns();

      // Subscribe to runs for newly-seen workflows
      snap.docs.forEach((wfDoc) => {
        if (runUnsubs.has(wfDoc.id)) return;
        const runsQ = query(collection(db, "workflows", wfDoc.id, "runs"));
        const unsub = onSnapshot(
          runsQ,
          (runsSnap) => {
            runSizes.set(wfDoc.id, runsSnap.size);
            recomputeRuns();
            runsSnap.docs.forEach((rd) => {
              if (rd.data().status === "awaiting_user") {
                setAwaitingRuns({ workflowId: wfDoc.id, runId: rd.id });
              }
            });
          },
          () => {
            // Permission error — workflow likely deleted, clean up silently
            runUnsubs.get(wfDoc.id)?.();
            runUnsubs.delete(wfDoc.id);
            runSizes.delete(wfDoc.id);
            recomputeRuns();
          },
        );
        runUnsubs.set(wfDoc.id, unsub);
      });
    });

    return () => {
      unsubWf();
      runUnsubs.forEach((unsub) => unsub());
      runUnsubs.clear();
    };
  }, [user]);

  const totalWorkflows = workflows.length;
  const activeWorkflows = workflows.filter(
    (w) => w.status === "active" || w.status === "ready",
  ).length;
  const browserWorkflows = workflows.filter(
    (w) => w.workflow_type === "browser",
  ).length;
  const desktopWorkflows = workflows.filter(
    (w) => w.workflow_type === "desktop",
  ).length;

  const recentWorkflows = workflows.slice(0, 6);

  if (loading) {
    return (
      <div className="flex flex-1 overflow-auto">
        <div className="flex w-full flex-1 flex-col gap-6 rounded-tl-2xl border border-[#A577FF]/20 border-l-0 bg-white p-6 shadow-sm md:p-10">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-9 w-52 rounded-lg" />
              <Skeleton className="h-4 w-72 rounded-lg" />
            </div>
            <Skeleton className="h-10 w-36 rounded-lg" />
          </div>
          {/* Stats grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
          {/* Recent workflows section */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-40 rounded-lg" />
              <Skeleton className="h-4 w-16 rounded-lg" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-xl border border-[#A577FF]/20 overflow-hidden">
                  <Skeleton className="h-28 w-full rounded-none" />
                  <div className="flex flex-col gap-2 p-4">
                    <Skeleton className="h-4 w-36 rounded-md" />
                    <div className="flex gap-2">
                      <Skeleton className="h-5 w-16 rounded-full" />
                      <Skeleton className="h-5 w-12 rounded-full" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 overflow-auto">
      <div className="flex h-full w-full flex-1 flex-col gap-6 rounded-tl-2xl border border-[#A577FF]/20 border-l-0 bg-white p-6 shadow-sm md:p-10">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[#150A35]">
              Welcome back
              {user?.displayName ? `, ${user.displayName.split(" ")[0]}` : ""}
            </h1>
            <p className="mt-1 text-sm text-echo-text-muted">
              Here&apos;s what&apos;s happening with your workflows today.
            </p>
          </div>
          <Link
            href="/dashboard/workflows/new"
            className="echo-btn-primary flex shrink-0 items-center gap-2"
          >
            <IconPlus className="h-5 w-5" />
            New Workflow
          </Link>
        </div>

        {/* Onboarding banner */}
        {showOnboarding && (
          <div className="relative rounded-xl border border-[#A577FF]/30 bg-linear-to-r from-[#F5F3FF] to-[#EDE9FF] p-5">
            <button
              onClick={() => {
                setShowOnboarding(false);
                localStorage.setItem("echo_onboarding_dismissed", "true");
              }}
              className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
            >
              <IconX className="h-4 w-4" />
            </button>
            <h3 className="text-base font-semibold text-[#150A35]">Welcome to Echo!</h3>
            <p className="mt-1 text-sm text-gray-500">Get started with these 3 steps:</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              {[
                { icon: <IconRocket className="h-4 w-4" />, label: "Create a workflow", href: "/dashboard/workflows/new" },
                { icon: <IconPlayerPlay className="h-4 w-4" />, label: "Run it", href: "/dashboard/workflows" },
                { icon: <IconBrain className="h-4 w-4" />, label: "Review traces", href: "/dashboard/traces" },
              ].map((step) => (
                <Link
                  key={step.label}
                  href={step.href}
                  className="flex items-center gap-2 rounded-lg border border-[#A577FF]/30 bg-white px-3 py-2 text-sm font-medium text-[#A577FF] hover:bg-[#A577FF]/10 transition-colors"
                >
                  {step.icon}
                  {step.label}
                </Link>
              ))}
              <Link
                href="/dashboard/chat"
                className="flex items-center gap-2 rounded-lg border border-[#A577FF]/30 bg-white px-3 py-2 text-sm font-medium text-[#A577FF] hover:bg-[#A577FF]/10 transition-colors"
              >
                <IconMessageCircle className="h-4 w-4" />
                Try EchoPrismVoice
              </Link>
            </div>
          </div>
        )}

        {/* Stats grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          <StatCard
            title="Total Workflows"
            value={totalWorkflows}
            icon={<IconJumpRope className="h-5 w-5 text-[#A577FF]" />}
            accent="purple"
          />
          <StatCard
            title="Active Workflows"
            value={activeWorkflows}
            icon={<IconCircleCheck className="h-5 w-5 text-echo-success" />}
            accent="green"
          />
          <StatCard
            title="Browser"
            value={browserWorkflows}
            icon={<IconBrandChrome className="h-5 w-5 text-[#A577FF]" />}
            accent="purple"
          />
          <StatCard
            title="Desktop"
            value={desktopWorkflows}
            icon={<IconDeviceLaptop className="h-5 w-5 text-echo-success" />}
            accent="green"
          />
          <StatCard
            title="Total Runs"
            value={totalRuns}
            icon={<IconPlayerPlay className="h-5 w-5 text-[#A577FF]" />}
            accent="purple"
          />
          <div
            className={awaitingRuns ? "cursor-pointer" : ""}
            onClick={() => {
              if (awaitingRuns) {
                window.location.href = `/dashboard/workflows/${awaitingRuns.workflowId}/runs/${awaitingRuns.runId}`;
              }
            }}
          >
            <Card className={`border shadow-sm ${awaitingRuns ? "border-amber-200 bg-amber-50" : "border-[#A577FF]/20 bg-white"}`}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-echo-text-muted">
                  Awaiting Input
                </CardTitle>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100">
                  <IconAlertTriangle className="h-5 w-5 text-amber-500" />
                </div>
              </CardHeader>
              <CardContent>
                <div className={`text-3xl font-bold ${awaitingRuns ? "text-amber-600" : "text-[#150A35]"}`}>
                  {awaitingRuns ? 1 : 0}
                </div>
                {awaitingRuns && (
                  <p className="text-xs text-amber-500 mt-0.5">Click to view</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Recent Workflows */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#150A35]">
              Recent Workflows
            </h2>
            <Link
              href="/dashboard/workflows"
              className="flex cursor-pointer items-center gap-1 text-sm font-medium text-[#A577FF] hover:underline"
            >
              View all
              <IconArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {recentWorkflows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-[#A577FF]/40 bg-[#F5F7FC] py-16">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#A577FF]/10">
                <IconJumpRope className="h-7 w-7 text-[#A577FF]" />
              </div>
              <div className="text-center">
                <p className="font-medium text-[#150A35]">No workflows yet</p>
                <p className="mt-1 text-sm text-echo-text-muted">
                  Create your first workflow to get started
                </p>
              </div>
              <Link
                href="/dashboard/workflows/new"
                className="echo-btn-primary"
              >
                Create workflow
              </Link>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {recentWorkflows.map((w) => (
                <WorkflowCard key={w.id} workflow={w} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  accent,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  accent: "purple" | "green";
}) {
  return (
    <Card className="border-[#A577FF]/20 bg-white shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-echo-text-muted">
          {title}
        </CardTitle>
        <div
          className={[
            "flex h-9 w-9 items-center justify-center rounded-lg",
            accent === "purple" ? "bg-[#A577FF]/10" : "bg-echo-success/10",
          ].join(" ")}
        >
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold text-[#150A35]">{value}</div>
      </CardContent>
    </Card>
  );
}

function WorkflowTypeBadge({ type }: { type: "browser" | "desktop" }) {
  return (
    <Badge
      variant="outline"
      className="flex items-center gap-1 rounded-full border-[#A577FF]/30 bg-[#A577FF]/15 px-2 py-0.5 text-xs font-medium text-[#A577FF]"
    >
      {type === "desktop" ? (
        <IconDeviceLaptop className="h-3 w-3" />
      ) : (
        <IconBrandChrome className="h-3 w-3" />
      )}
      {type === "desktop" ? "Desktop" : "Browser"}
    </Badge>
  );
}

function WorkflowThumbnail({ workflowId }: { workflowId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/workflows/${workflowId}/thumbnail`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (!cancelled) setUrl(d.url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [workflowId]);

  if (failed) return null;

  if (!url) {
    return <Skeleton className="h-28 w-full rounded-none" />;
  }

  return (
    <div className="relative h-28 w-full overflow-hidden bg-[#F5F7FC]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Workflow screenshot"
        className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.02]"
        onError={() => setFailed(true)}
      />
      <div className="absolute inset-0 bg-linear-to-t from-white/60 via-transparent to-transparent" />
    </div>
  );
}

function WorkflowCard({ workflow: w }: { workflow: Workflow }) {
  const href =
    w.status === "draft" || w.status === "processing"
      ? `/dashboard/workflows/${w.id}/edit`
      : `/dashboard/workflows/${w.id}`;

  return (
    <Link
      href={href}
      className="group echo-card flex cursor-pointer flex-col overflow-hidden transition-all hover:border-[#A577FF]/50 hover:shadow-md"
    >
      {/* Thumbnail */}
      {w.thumbnail_gcs_path ? (
        <WorkflowThumbnail workflowId={w.id} />
      ) : (
        <div className="flex h-28 w-full items-center justify-center bg-linear-to-br from-[#F5F7FC] to-[#A577FF]/5">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#A577FF]/10">
            {w.workflow_type === "desktop" ? (
              <IconDeviceLaptop className="h-5 w-5 text-[#A577FF]" />
            ) : (
              <IconBrandChrome className="h-5 w-5 text-[#A577FF]" />
            )}
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col gap-2 p-4">
        <span className="min-w-0 truncate font-medium text-[#150A35] transition-colors group-hover:text-[#A577FF]">
          {w.name ?? "Untitled workflow"}
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {w.workflow_type && <WorkflowTypeBadge type={w.workflow_type} />}
          <span
            className={[
              "rounded-full px-2.5 py-0.5 text-xs font-medium",
              w.status === "ready" || w.status === "active"
                ? "bg-echo-success/15 text-echo-success"
                : w.status === "processing"
                  ? "bg-[#A577FF]/20 text-[#A577FF]"
                  : w.status === "failed"
                    ? "bg-echo-error/15 text-echo-error"
                    : "bg-[#150A35]/10 text-[#150A35]/70",
            ].join(" ")}
          >
            {STATUS_LABELS[w.status] ?? w.status}
          </span>
        </div>
      </div>
    </Link>
  );
}
