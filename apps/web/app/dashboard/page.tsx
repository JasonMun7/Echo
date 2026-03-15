"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { apiFetch } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import {
  IconCircleCheck,
  IconJumpRope,
  IconPlus,
  IconArrowRight,
  IconPlayerPlay,
  IconX,
  IconRocket,
  IconMessageCircle,
} from "@tabler/icons-react";
import { ChartAreaInteractive } from "@/components/chart-area-interactive";
import { DataTable } from "@/components/data-table";
import { SectionCards } from "@/components/section-cards";
import data from "./data.json";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  if (typeof x === "number") return x > 1e12 ? x : x * 1000;
  if (typeof x === "string") return new Date(x).getTime() || 0;
  const o = x as { seconds?: number; _seconds?: number };
  const sec = o?.seconds ?? (o as { _seconds?: number })._seconds;
  return typeof sec === "number" ? sec * 1000 : 0;
}

function isLatestOrLastModified(
  w: { id: string; createdAt?: unknown; updatedAt?: unknown },
  all: Array<{ id: string; createdAt?: unknown; updatedAt?: unknown }>,
): boolean {
  if (all.length === 0) return false;
  const created = all.map((x) => getTime(x.createdAt));
  const updated = all.map((x) => getTime(x.updatedAt));
  const maxCreated = Math.max(...created);
  const maxUpdated = Math.max(...updated);
  return (
    getTime(w.createdAt) === maxCreated || getTime(w.updatedAt) === maxUpdated
  );
}

export default function DashboardPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalRuns, setTotalRuns] = useState(0);
  const [awaitingRuns, setAwaitingRuns] = useState<{
    workflowId: string;
    runId: string;
  } | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const user = auth?.currentUser;

  useEffect(() => {
    // Show onboarding for first-time users
    const isNew = localStorage.getItem("echo_user_created") === "true";
    const dismissed =
      localStorage.getItem("echo_onboarding_dismissed") === "true";
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
      runSizes.forEach((n) => {
        total += n;
      });
      setTotalRuns(total);
    }

    const unsubWf = onSnapshot(wfQ, (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as Workflow)
        .sort(
          (a, b) =>
            getTime(b.createdAt ?? b.updatedAt) -
            getTime(a.createdAt ?? a.updatedAt),
        );
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
  const recentWorkflows = workflows.slice(0, 6);

  if (loading) {
    return (
      <div className="flex flex-1 flex-col gap-6 px-4 lg:px-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-9 w-52 rounded-lg" />
            <Skeleton className="h-4 w-72 rounded-lg" />
          </div>
          <Skeleton className="h-10 w-36 rounded-lg" />
        </div>
        <SectionCards
          totalWorkflows={0}
          activeWorkflows={0}
          totalRuns={0}
          awaitingInput={0}
        />
        <Skeleton className="h-[280px] w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 px-4 lg:px-6">
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
        <a
          href="echo-desktop://capture"
          className="echo-btn-cyan-lavender flex shrink-0 items-center gap-2"
        >
          <IconPlus className="h-5 w-5" />
          New Workflow
        </a>
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
          <h3 className="text-base font-semibold text-[#150A35]">
            Welcome to Echo!
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Get started with these 3 steps:
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            {[
              {
                icon: <IconRocket className="h-4 w-4" />,
                label: "Create a workflow",
                href: "echo-desktop://capture",
              },
              {
                icon: <IconPlayerPlay className="h-4 w-4" />,
                label: "Run it",
                href: "/dashboard/workflows",
              },
            ].map((step) =>
              step.href.startsWith("echo-desktop") ? (
                <a
                  key={step.label}
                  href={step.href}
                  className="flex items-center gap-2 rounded-lg border border-[#A577FF]/30 bg-white px-3 py-2 text-sm font-medium text-[#A577FF] hover:bg-[#A577FF]/10 transition-colors"
                >
                  {step.icon}
                  {step.label}
                </a>
              ) : (
                <Link
                  key={step.label}
                  href={step.href}
                  className="flex items-center gap-2 rounded-lg border border-[#A577FF]/30 bg-white px-3 py-2 text-sm font-medium text-[#A577FF] hover:bg-[#A577FF]/10 transition-colors"
                >
                  {step.icon}
                  {step.label}
                </Link>
              ),
            )}
            <a
              href="echo-desktop://echoprism"
              className="flex items-center gap-2 rounded-lg border border-[#A577FF]/30 bg-white px-3 py-2 text-sm font-medium text-[#A577FF] hover:bg-[#A577FF]/10 transition-colors"
            >
              <IconMessageCircle className="h-4 w-4" />
              Try EchoPrismVoice
            </a>
          </div>
        </div>
      )}

      {/* Stats */}
      <SectionCards
        totalWorkflows={totalWorkflows}
        activeWorkflows={activeWorkflows}
        totalRuns={totalRuns}
        awaitingInput={awaitingRuns ? 1 : 0}
        onAwaitingClick={() => {
          if (awaitingRuns) {
            window.location.href = `/dashboard/workflows/${awaitingRuns.workflowId}/runs/${awaitingRuns.runId}`;
          }
        }}
      />

      {/* Activity chart */}
      <div className="px-4 lg:px-6">
        <ChartAreaInteractive />
      </div>

      {/* Data table */}
      <DataTable data={data} />

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
            <a href="echo-desktop://capture" className="echo-btn-cyan-lavender">
              Create workflow
            </a>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recentWorkflows.map((w) => (
              <WorkflowCard
                key={w.id}
                workflow={w}
                isLatest={isLatestOrLastModified(w, workflows)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
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

function WorkflowCard({
  workflow: w,
  isLatest,
}: {
  workflow: Workflow;
  isLatest: boolean;
}) {
  const href =
    w.status === "draft" || w.status === "processing"
      ? `/dashboard/workflows/${w.id}/edit`
      : `/dashboard/workflows/${w.id}`;

  return (
    <Link
      href={href}
      className={`group echo-card relative flex cursor-pointer flex-col overflow-visible transition-all hover:border-[#A577FF]/50 hover:shadow-md ${isLatest ? "border-[#A577FF]/40 ring-1 ring-[#A577FF]/20" : ""}`}
    >
      {isLatest && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="absolute -right-1 -top-1 z-10 h-4 w-4 animate-echo-indicator-flash cursor-default rounded-full bg-[#A577FF] ring-2 ring-white shadow-sm"
              onClick={(e) => e.preventDefault()}
              onMouseDown={(e) => e.stopPropagation()}
            />
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            className="border-[#A577FF]/20 bg-[#150A35] text-[#F5F7FC]"
          >
            Newest or most recently modified workflow
          </TooltipContent>
        </Tooltip>
      )}
      {/* Thumbnail */}
      {w.thumbnail_gcs_path ? (
        <WorkflowThumbnail workflowId={w.id} />
      ) : (
        <div className="flex h-28 w-full items-center justify-center bg-linear-to-br from-[#F5F7FC] to-[#A577FF]/5">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#A577FF]/10">
            <IconJumpRope className="h-5 w-5 text-[#A577FF]" />
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col gap-2 p-4">
        <span className="min-w-0 truncate font-medium text-[#150A35] transition-colors group-hover:text-[#A577FF]">
          {w.name ?? "Untitled workflow"}
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
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
