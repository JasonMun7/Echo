"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Workflow } from "lucide-react";
import {
  IconPlus,
  IconArrowRight,
  IconPlayerPlay,
  IconX,
  IconRocket,
  IconMessageCircle,
  IconChevronRight,
} from "@tabler/icons-react";
import { ChartAreaInteractive } from "@/components/chart-area-interactive";
import { DataTable } from "@/components/data-table";
import { SectionCards } from "@/components/section-cards";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DesktopCaptureLink } from "@/components/desktop-capture-link";
import { WorkflowThumbnail } from "@/components/workflow-thumbnail";
import {
  workflowListCardClass,
  workflowStatusBadgeClass,
  workflowStatusLabel,
} from "@/lib/workflow-status";
import { cn } from "@/lib/utils";

interface Workflow {
  id: string;
  name?: string;
  status: string;
  workflow_type?: "browser" | "desktop";
  thumbnail_gcs_path?: string;
  createdAt: unknown;
  updatedAt: unknown;
}

interface Run {
  id: string;
  workflowId: string;
  workflowName: string;
  status: string;
  createdAt: unknown;
  completedAt?: unknown;
  source?: string;
  error?: string;
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
  return getTime(w.createdAt) === maxCreated || getTime(w.updatedAt) === maxUpdated;
}

export default function DashboardPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalRuns, setTotalRuns] = useState(0);
  const [allRuns, setAllRuns] = useState<Run[]>([]);
  const [inProgressRun, setInProgressRun] = useState<{
    workflowId: string;
    runId: string;
  } | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const user = auth?.currentUser;

  useEffect(() => {
    // Show onboarding for first-time users
    const isNew = localStorage.getItem("echo_user_created") === "true";
    const dismissed = localStorage.getItem("echo_onboarding_dismissed") === "true";
    if (isNew && !dismissed) setTimeout(() => setShowOnboarding(true), 0);
  }, []);

  useEffect(() => {
    if (!user) return;
    if (
      typeof sessionStorage !== "undefined" &&
      sessionStorage.getItem("echo_notifications_toast_shown")
    )
      return;
    apiFetch("/api/notifications")
      .then((res) => (res.ok ? res.json() : { notifications: [] }))
      .then((data) => {
        const list = Array.isArray(data.notifications) ? data.notifications : [];
        const unread = list.filter((n: { read?: boolean }) => !n.read);
        if (unread.length > 0 && typeof sessionStorage !== "undefined") {
          sessionStorage.setItem("echo_notifications_toast_shown", "1");
          toast.info(
            `You have ${unread.length} new notification${unread.length === 1 ? "" : "s"}`,
            {
              action: {
                label: "View",
                onClick: () => (window.location.href = "/dashboard/notifications"),
              },
            },
          );
        }
      })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!db || !user) {
      setTimeout(() => setLoading(false), 0);
      return;
    }
    const uid = user.uid;

    const wfQ = query(collection(db, "workflows"), where("owner_uid", "==", uid));
    // Track nested runs listeners so we can clean them up when workflows are deleted
    const runUnsubs = new Map<string, () => void>();
    const runSizes = new Map<string, number>();
    const runDocsMap = new Map<string, Run[]>();

    function recomputeRuns() {
      let total = 0;
      runSizes.forEach((n) => {
        total += n;
      });
      const flat: Run[] = [];
      runDocsMap.forEach((runs) => flat.push(...runs));
      flat.sort((a, b) => getTime(b.createdAt) - getTime(a.createdAt));
      setTotalRuns(total);
      setAllRuns(flat);
      const first = flat.find(
        (r) => r.status === "running" || r.status === "pending" || r.status === "awaiting_user",
      );
      setInProgressRun(first ? { workflowId: first.workflowId, runId: first.id } : null);
    }

    const unsubWf = onSnapshot(wfQ, (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as Workflow)
        .sort((a, b) => getTime(b.createdAt ?? b.updatedAt) - getTime(a.createdAt ?? a.updatedAt));
      setWorkflows(list);
      setLoading(false);

      const currentIds = new Set(snap.docs.map((d) => d.id));

      // Clean up listeners for deleted workflows
      runUnsubs.forEach((unsub, id) => {
        if (!currentIds.has(id)) {
          unsub();
          runUnsubs.delete(id);
          runSizes.delete(id);
          runDocsMap.delete(id);
        }
      });

      recomputeRuns();

      // Subscribe to runs for newly-seen workflows
      snap.docs.forEach((wfDoc) => {
        if (runUnsubs.has(wfDoc.id)) return;
        const wfName = (wfDoc.data().name as string | undefined) ?? "Untitled workflow";
        const runsQ = query(collection(db, "workflows", wfDoc.id, "runs"));
        const unsub = onSnapshot(
          runsQ,
          (runsSnap) => {
            const runs: Run[] = runsSnap.docs.map((rd) => ({
              id: rd.id,
              workflowId: wfDoc.id,
              workflowName: wfName,
              ...(rd.data() as Omit<Run, "id" | "workflowId" | "workflowName">),
            }));
            runSizes.set(wfDoc.id, runsSnap.size);
            runDocsMap.set(wfDoc.id, runs);
            recomputeRuns();
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
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        <div className="flex flex-col gap-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-9 w-52 rounded-lg" />
              <Skeleton className="h-4 w-72 rounded-lg" />
            </div>
            <Skeleton className="h-10 w-36 rounded-lg" />
          </div>
          <SectionCards totalWorkflows={0} activeWorkflows={0} totalRuns={0} awaitingInput={0} />
          <Skeleton className="h-70 w-full rounded-lg" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              Welcome back
              {user?.displayName ? `, ${user.displayName.split(" ")[0]}` : ""}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Here&apos;s what&apos;s happening with your workflows today.
            </p>
          </div>
          <DesktopCaptureLink className="echo-btn-primary flex shrink-0 items-center gap-2">
            <IconPlus className="h-5 w-5" />
            New Workflow
          </DesktopCaptureLink>
        </div>

        {/* Onboarding banner */}
        {showOnboarding && (
          <div className="relative rounded-xl border border-primary/25 bg-linear-to-r from-violet-50/90 to-violet-100/50 p-5 dark:border-primary/30 dark:from-violet-950/35 dark:to-violet-950/15">
            <button
              onClick={() => {
                setShowOnboarding(false);
                localStorage.setItem("echo_onboarding_dismissed", "true");
              }}
              className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
            >
              <IconX className="h-4 w-4" />
            </button>
            <h3 className="text-base font-semibold text-foreground">Welcome to Echo!</h3>
            <p className="mt-1 text-sm text-muted-foreground">Get started with these 3 steps:</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              {[
                {
                  icon: <IconRocket className="h-4 w-4" />,
                  label: "Create a workflow",
                  href: "echo-desktop://capture",
                  isCapture: true,
                },
                {
                  icon: <IconPlayerPlay className="h-4 w-4" />,
                  label: "Run it",
                  href: "/dashboard/workflows",
                  isCapture: false,
                },
              ].map((step) =>
                step.isCapture ? (
                  <DesktopCaptureLink
                    key={step.label}
                    className="flex items-center gap-2 rounded-lg border border-primary/35 bg-card px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-muted"
                  >
                    {step.icon}
                    {step.label}
                  </DesktopCaptureLink>
                ) : (
                  <Link
                    key={step.label}
                    href={step.href}
                    className="flex items-center gap-2 rounded-lg border border-primary/35 bg-card px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-muted"
                  >
                    {step.icon}
                    {step.label}
                  </Link>
                ),
              )}
              <Link
                href="/dashboard/chat"
                className="flex items-center gap-2 rounded-lg border border-primary/35 bg-card px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-muted"
              >
                <IconMessageCircle className="h-4 w-4" />
                Try EchoPrism
              </Link>
            </div>
          </div>
        )}

        {/* Stats */}
        <SectionCards
          totalWorkflows={totalWorkflows}
          activeWorkflows={activeWorkflows}
          totalRuns={totalRuns}
          awaitingInput={
            allRuns.filter(
              (r) =>
                r.status === "running" || r.status === "pending" || r.status === "awaiting_user",
            ).length
          }
          onAwaitingClick={() => {
            if (inProgressRun) {
              window.location.href = `/dashboard/workflows/${inProgressRun.workflowId}/runs/${inProgressRun.runId}`;
            }
          }}
        />

        {/* Activity chart */}
        <div className="w-full min-w-0">
          <ChartAreaInteractive runs={allRuns} />
        </div>

        {/* Data table */}
        <DataTable data={allRuns} />

        {/* Recent Workflows */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Recent Workflows</h2>
            <Link
              href="/dashboard/workflows"
              className="flex cursor-pointer items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              View all
              <IconArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {recentWorkflows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border bg-card py-16 shadow-sm">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <Workflow className="h-7 w-7 text-primary" strokeWidth={1.75} />
              </div>
              <div className="text-center">
                <p className="font-medium text-foreground">No workflows yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Create your first workflow to get started
                </p>
              </div>
              <DesktopCaptureLink className="echo-btn-primary">Create workflow</DesktopCaptureLink>
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
    </div>
  );
}

function WorkflowCard({ workflow: w, isLatest }: { workflow: Workflow; isLatest: boolean }) {
  const href =
    w.status === "draft" || w.status === "processing"
      ? `/dashboard/workflows/${w.id}/edit`
      : `/dashboard/workflows/${w.id}`;

  return (
    <Link
      href={href}
      className={cn(
        workflowListCardClass,
        "cursor-pointer overflow-visible",
        isLatest && "border-primary/30 ring-1 ring-primary/20",
      )}
    >
      {isLatest && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="absolute -right-1 -top-1 z-10 echo-indicator-flash-dot"
              onClick={(e) => e.preventDefault()}
              onMouseDown={(e) => e.stopPropagation()}
            />
          </TooltipTrigger>
          <TooltipContent side="bottom">Newest or most recently modified workflow</TooltipContent>
        </Tooltip>
      )}
      {/* Thumbnail */}
      {w.thumbnail_gcs_path ? (
        <WorkflowThumbnail workflowId={w.id} heightClass="h-28" />
      ) : (
        <div className="flex h-28 w-full items-center justify-center bg-linear-to-br from-muted/70 to-muted/25 dark:from-muted/40 dark:to-muted/15">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <Workflow className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} />
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col px-4 pt-4">
        <span className="line-clamp-2 min-w-0 text-sm font-semibold leading-snug text-foreground">
          {w.name ?? "Untitled workflow"}
        </span>
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border px-4 py-3">
        <span className={workflowStatusBadgeClass(w.status)}>{workflowStatusLabel(w.status)}</span>
        <IconChevronRight
          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
          stroke={1.5}
          aria-hidden
        />
      </div>
    </Link>
  );
}
