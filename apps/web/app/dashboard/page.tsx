"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Workflow } from "lucide-react";
import {
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
import { CreateWorkflowMenu } from "@/components/create-workflow-menu";
import { Button } from "@/components/ui/button";
import { DesktopCaptureLink } from "@/components/desktop-capture-link";
import {
  DashboardWorkflowListCard,
  DeleteWorkflowConfirmDialog,
  type DashboardWorkflowListCardModel,
} from "@/components/dashboard-workflow-list-card";
import {
  DASHBOARD_PAGE_DESCRIPTION_CLASS,
  DASHBOARD_PAGE_TITLE_CLASS,
} from "@/lib/dashboard-page-typography";
import { cn } from "@/lib/utils";
import { useNotificationsInbox } from "@/components/notifications/notifications-inbox-context";
import { featuredWorkflowId } from "@/lib/workflow-activity";
import { workflowTimestampMillis } from "@/lib/workflow-timestamps";

interface Workflow extends DashboardWorkflowListCardModel {
  workflow_type?: "browser" | "desktop";
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

export default function DashboardPage() {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalRuns, setTotalRuns] = useState(0);
  const [allRuns, setAllRuns] = useState<Run[]>([]);
  const [inProgressRun, setInProgressRun] = useState<{
    workflowId: string;
    runId: string;
  } | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteWorkflowId, setDeleteWorkflowId] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [forkingId, setForkingId] = useState<string | null>(null);
  const [leavingId, setLeavingId] = useState<string | null>(null);
  const user = auth?.currentUser;
  const { setDrawerOpen } = useNotificationsInbox();
  const activeWorkflowId = inProgressRun?.workflowId ?? null;

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
                onClick: () => setDrawerOpen(true),
              },
            },
          );
        }
      })
      .catch(() => {});
  }, [user, setDrawerOpen]);

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
      flat.sort(
        (a, b) => workflowTimestampMillis(b.createdAt) - workflowTimestampMillis(a.createdAt),
      );
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
        .sort(
          (a, b) =>
            workflowTimestampMillis(b.createdAt ?? b.updatedAt) -
            workflowTimestampMillis(a.createdAt ?? a.updatedAt),
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

  const openDeleteWorkflowDialog = (e: React.MouseEvent, workflowId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleteWorkflowId(workflowId);
  };

  const confirmDeleteWorkflow = async () => {
    if (!deleteWorkflowId) return;
    const workflowId = deleteWorkflowId;
    setDeletingId(workflowId);
    try {
      const res = await apiFetch(`/api/workflows/${workflowId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      setWorkflows((prev) => prev.filter((w) => w.id !== workflowId));
      setDeleteWorkflowId(null);
      toast.success("Workflow deleted");
    } catch (err) {
      console.error("Delete failed:", err);
      toast.error("Failed to delete workflow");
    } finally {
      setDeletingId(null);
    }
  };

  const handleRun = async (e: React.MouseEvent, workflowId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setRunningId(workflowId);
    try {
      const res = await apiFetch(`/api/run/${workflowId}?source=desktop`, { method: "POST" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { detail?: string }).detail || "Failed to start run");
      }
      const data = (await res.json()) as { run_id?: string };
      if (data.run_id) {
        window.location.href = `echo-desktop://run?workflow_id=${workflowId}&run_id=${data.run_id}`;
        router.push(`/dashboard/workflows/${workflowId}/runs/${data.run_id}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start run");
    } finally {
      setRunningId(null);
    }
  };

  const handleFork = async (e: React.MouseEvent, workflowId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setForkingId(workflowId);
    try {
      const res = await apiFetch(`/api/workflows/${workflowId}/fork`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error((data as { detail?: string }).detail || "Could not create a copy");
      toast.success("Copy created");
      const newId = (data as { id?: string }).id;
      if (newId) router.push(`/dashboard/workflows/${newId}/edit`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not fork workflow");
    } finally {
      setForkingId(null);
    }
  };

  const handleLeave = async (e: React.MouseEvent, workflowId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (
      !window.confirm(
        "Leave this shared workflow? You will lose access until the owner invites you again.",
      )
    ) {
      return;
    }
    setLeavingId(workflowId);
    try {
      const res = await apiFetch(`/api/workflows/${workflowId}/leave`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error((data as { detail?: string }).detail || "Could not leave workflow");
      setWorkflows((prev) => prev.filter((w) => w.id !== workflowId));
      toast.success("You left the workflow");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not leave workflow");
    } finally {
      setLeavingId(null);
    }
  };

  const totalWorkflows = workflows.length;
  const activeWorkflows = workflows.filter(
    (w) => w.status === "active" || w.status === "ready",
  ).length;
  const recentWorkflows = workflows.slice(0, 3);
  const deleteTargetName =
    deleteWorkflowId != null
      ? workflows.find((x) => x.id === deleteWorkflowId)?.name?.trim() || "Untitled workflow"
      : "";

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        <div className="flex flex-col gap-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-9 w-52 rounded-lg sm:h-10 sm:w-60" />
              <Skeleton className="h-4 w-72 rounded-lg sm:h-5 sm:w-80" />
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
    <>
      <DeleteWorkflowConfirmDialog
        open={deleteWorkflowId != null}
        onOpenChange={(o) => {
          if (!o) setDeleteWorkflowId(null);
        }}
        workflowDisplayName={deleteTargetName}
        deleting={deletingId != null}
        onConfirm={() => void confirmDeleteWorkflow()}
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        <div className="flex flex-col gap-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className={DASHBOARD_PAGE_TITLE_CLASS}>
                Welcome back
                {user?.displayName ? `, ${user.displayName.split(" ")[0]}` : ""}
              </h1>
              <p className={cn(DASHBOARD_PAGE_DESCRIPTION_CLASS, "mt-1")}>
                Here&apos;s what&apos;s happening with your workflows today.
              </p>
            </div>
            <div className="shrink-0">
              <CreateWorkflowMenu variant="page-primary" />
            </div>
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
              <Button variant="outline" size="sm" className="shrink-0" asChild>
                <Link href="/dashboard/workflows" className="inline-flex items-center gap-1.5">
                  View all
                  <IconChevronRight className="h-4 w-4" aria-hidden />
                </Link>
              </Button>
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
                <CreateWorkflowMenu variant="page-empty" />
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {(() => {
                  const featuredId = featuredWorkflowId(workflows);
                  return recentWorkflows.map((w) => (
                    <DashboardWorkflowListCard
                      key={w.id}
                      workflow={w}
                      authUid={user?.uid ?? null}
                      isFeatured={featuredId != null && w.id === featuredId}
                      activeWorkflowId={activeWorkflowId}
                      onRun={handleRun}
                      runBusyWorkflowId={runningId}
                      onRequestDelete={openDeleteWorkflowDialog}
                      deleteBusyWorkflowId={deletingId}
                      onFork={handleFork}
                      forkBusyWorkflowId={forkingId}
                      onLeave={handleLeave}
                      leaveBusyWorkflowId={leavingId}
                    />
                  ));
                })()}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
