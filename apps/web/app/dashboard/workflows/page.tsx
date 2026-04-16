"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { collection, collectionGroup, query, where, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { db } from "@/lib/firebase";
import { auth } from "@/lib/firebase";
import { apiFetch } from "@/lib/api";
import { Workflow } from "lucide-react";
import {
  IconTrash,
  IconDots,
  IconLoader,
  IconPlayerPlay,
  IconPencil,
  IconList,
  IconCopy,
  IconLogout,
  IconX,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardEmptyState } from "@/components/dashboard-empty-state";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { CreateWorkflowMenu } from "@/components/create-workflow-menu";
import { GradientIconWell, gradientWellImageClass } from "@/components/ui/gradient-icon-well";
import { WorkflowThumbnail } from "@/components/workflow-thumbnail";
import { brandfetchLogoUrlForDomain } from "@/app/dashboard/integrations/_lib/brandfetch-logo";
import {
  workflowListCardClass,
  workflowSharedTagClass,
  workflowStatusBadgeClass,
  workflowStatusLabel,
} from "@/lib/workflow-status";
import {
  DASHBOARD_PAGE_DESCRIPTION_CLASS,
  DASHBOARD_PAGE_TITLE_CLASS,
} from "@/lib/dashboard-page-typography";
import { featuredWorkflowId } from "@/lib/workflow-activity";
import { cn } from "@/lib/utils";

interface Workflow {
  id: string;
  name?: string;
  status: string;
  owner_uid?: string;
  workflow_type?: "browser" | "desktop";
  thumbnail_gcs_path?: string;
  /** Denormalized from synthesis / navigate step — used for list card logo. */
  brand_domain?: string;
  createdAt: unknown;
  updatedAt: unknown;
  shared_with?: string[];
  collaborator_roles?: Record<string, string>;
}

function canEditSharedWorkflow(w: Workflow, uid: string | null | undefined): boolean {
  if (!uid) return false;
  if (w.owner_uid === uid) return true;
  if (!Array.isArray(w.shared_with) || !w.shared_with.includes(uid)) return false;
  return w.collaborator_roles?.[uid] !== "viewer";
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

function WorkflowCardMedia({
  workflowId,
  thumbnail_gcs_path,
  brand_domain,
}: {
  workflowId: string;
  thumbnail_gcs_path?: string;
  brand_domain?: string;
}) {
  const [logoFailed, setLogoFailed] = useState(false);
  const onLogoError = useCallback(() => setLogoFailed(true), []);

  const mediaShell = "relative h-28 w-full shrink-0 overflow-hidden rounded-t-xl";

  if (thumbnail_gcs_path) {
    return (
      <div className={mediaShell}>
        <WorkflowThumbnail workflowId={workflowId} heightClass="h-28" />
      </div>
    );
  }

  const domain = typeof brand_domain === "string" ? brand_domain.trim() : "";
  const logoUrl = domain && !logoFailed ? brandfetchLogoUrlForDomain(domain) : null;

  if (logoUrl) {
    return (
      <div
        className={cn(
          mediaShell,
          "flex items-center justify-center bg-linear-to-br from-muted/70 to-muted/25 dark:from-muted/40 dark:to-muted/15",
        )}
      >
        <GradientIconWell corners="xl" className="h-16 w-16">
          {/* eslint-disable-next-line @next/next/no-img-element -- Brandfetch CDN */}
          <img
            src={logoUrl}
            alt=""
            className={gradientWellImageClass("xl")}
            onError={onLogoError}
          />
        </GradientIconWell>
      </div>
    );
  }

  return (
    <div
      className={cn(
        mediaShell,
        "flex items-center justify-center bg-linear-to-br from-muted/70 to-muted/25 dark:from-muted/40 dark:to-muted/15",
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Workflow className="h-6 w-6 text-muted-foreground" strokeWidth={1.75} />
      </div>
    </div>
  );
}

export default function WorkflowsPage() {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteWorkflowId, setDeleteWorkflowId] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [forkingId, setForkingId] = useState<string | null>(null);
  const [leavingId, setLeavingId] = useState<string | null>(null);
  const [activeWorkflowId, setActiveWorkflowId] = useState<string | null>(null);
  const [authUid, setAuthUid] = useState<string | null>(auth?.currentUser?.uid ?? null);
  const workflowsSourceRef = useRef<{
    apiMap: Map<string, Workflow>;
    ownedMap: Map<string, Workflow>;
    merge: () => void;
  } | null>(null);

  useEffect(() => {
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUid(user?.uid ?? null);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!db || !authUid) return;
    const q = query(
      collectionGroup(db, "runs"),
      where("owner_uid", "==", authUid),
      where("status", "in", ["running", "pending", "awaiting_user"]),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const first = snap.docs[0];
        setActiveWorkflowId(first ? (first.ref.parent.parent?.id ?? null) : null);
      },
      () => setActiveWorkflowId(null),
    );
    return () => unsub();
  }, [authUid]);

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
      const res = await apiFetch(`/api/workflows/${workflowId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      const source = workflowsSourceRef.current;
      if (source) {
        source.apiMap.delete(workflowId);
        source.ownedMap.delete(workflowId);
        source.merge();
      } else {
        setWorkflows((prev) => prev.filter((w) => w.id !== workflowId));
      }
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
      const res = await apiFetch(`/api/run/${workflowId}?source=desktop`, {
        method: "POST",
      });
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
      const source = workflowsSourceRef.current;
      if (source) {
        source.apiMap.delete(workflowId);
        source.merge();
      } else {
        setWorkflows((prev) => prev.filter((w) => w.id !== workflowId));
      }
      toast.success("You left the workflow");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not leave workflow");
    } finally {
      setLeavingId(null);
    }
  };

  useEffect(() => {
    if (!db || !authUid) return;
    const uid = authUid;

    // API map: initial full list (owned + legacy shared_with + forks) from backend
    // Firestore map: real-time updates for owned workflows only
    const apiMap = new Map<string, Workflow>();
    const ownedMap = new Map<string, Workflow>();
    let apiReady = false;

    const merge = () => {
      if (!apiReady) return;
      // Firestore owned data takes precedence over API data for owned workflows
      const combined = new Map([...apiMap, ...ownedMap]);
      const list = Array.from(combined.values())
        .filter((w) => (w as Workflow & { ephemeral?: boolean }).ephemeral !== true)
        .sort((a, b) => getTime(b.createdAt ?? b.updatedAt) - getTime(a.createdAt ?? a.updatedAt));
      setWorkflows(list);
      setLoading(false);
    };

    workflowsSourceRef.current = { apiMap, ownedMap, merge };

    // 1. Fetch all workflows (owned + forked + legacy shared) via API
    apiFetch("/api/workflows")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { workflows: Workflow[] }) => {
        apiMap.clear();
        for (const w of data.workflows || []) {
          apiMap.set(w.id, w);
        }
        apiReady = true;
        merge();
      })
      .catch(() => {
        apiReady = true;
        merge();
      });

    // 2. Firestore listener for owned workflows — real-time updates (new workflows from desktop)
    const qOwned = query(collection(db, "workflows"), where("owner_uid", "==", uid));
    const unsubOwned = onSnapshot(
      qOwned,
      (snap) => {
        ownedMap.clear();
        for (const d of snap.docs) {
          ownedMap.set(d.id, { id: d.id, ...d.data() } as Workflow);
        }
        merge();
      },
      (err) => {
        console.warn("Workflows snapshot error:", err);
      },
    );

    return () => {
      unsubOwned();
      workflowsSourceRef.current = null;
    };
  }, [authUid]);

  const mine = authUid ? workflows.filter((w) => String(w.owner_uid ?? "") === authUid) : [];
  /** Only workflows where you’re a listed collaborator — never your own (owners aren’t in `shared_with`). */
  const sharedWithMe = authUid
    ? workflows.filter((w) => {
        if (String(w.owner_uid ?? "") === authUid) return false;
        const shared = w.shared_with;
        if (!Array.isArray(shared) || !shared.includes(authUid)) return false;
        return Boolean(w.owner_uid);
      })
    : [];

  const featuredId = featuredWorkflowId(workflows);

  function renderWorkflowCard(w: Workflow) {
    const isOwner = Boolean(authUid && String(w.owner_uid ?? "") === authUid);
    const couldEdit = canEditSharedWorkflow(w, authUid);
    const isFeatured = featuredId != null && w.id === featuredId;
    const isRunning = activeWorkflowId === w.id;
    return (
      <div
        key={w.id}
        className={`relative rounded-xl transition-all ${isRunning ? "bg-linear-to-r from-[#21C4DD] to-[#A577FF] p-[2px] shadow-lg shadow-[#A577FF]/25" : ""}`}
      >
        {isFeatured ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="absolute -right-1 -top-1 z-10 echo-indicator-flash-dot"
                onClick={(e) => e.preventDefault()}
                onMouseDown={(e) => e.stopPropagation()}
              />
            </TooltipTrigger>
            <TooltipContent side="bottom">Most recently updated workflow</TooltipContent>
          </Tooltip>
        ) : null}
        <div
          className={cn(
            workflowListCardClass,
            "overflow-visible",
            isFeatured && !isRunning && "shadow-xl shadow-black/[0.12] dark:shadow-black/50",
          )}
        >
          <div
            className="absolute right-2 top-2 z-10 opacity-0 transition-opacity group-hover:opacity-100"
            onClick={(e) => e.preventDefault()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-border bg-card/95 text-foreground shadow-sm backdrop-blur-sm hover:bg-muted"
                  aria-label="Workflow actions"
                >
                  <IconDots className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-40">
                <DropdownMenuItem
                  onClick={(e) => handleRun(e, w.id)}
                  disabled={runningId === w.id || (w.status !== "ready" && w.status !== "active")}
                >
                  <IconPlayerPlay className="h-4 w-4" />
                  {runningId === w.id ? "Starting…" : "Run"}
                </DropdownMenuItem>
                {couldEdit ? (
                  <DropdownMenuItem asChild>
                    <Link href={`/dashboard/workflows/${w.id}/edit`}>
                      <IconPencil className="h-4 w-4" />
                      Edit
                    </Link>
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem asChild>
                  <Link href={`/dashboard/workflows/${w.id}`}>
                    <IconList className="h-4 w-4" />
                    {isOwner ? "Details and share" : "Details"}
                  </Link>
                </DropdownMenuItem>
                {isOwner ? (
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={(e) => openDeleteWorkflowDialog(e, w.id)}
                    disabled={deletingId === w.id}
                  >
                    <IconTrash className="h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                ) : (
                  <>
                    <DropdownMenuItem
                      onClick={(e) => handleFork(e, w.id)}
                      disabled={forkingId === w.id}
                    >
                      <IconCopy className="h-4 w-4" />
                      {forkingId === w.id ? "Copying…" : "Make a copy"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={(e) => handleLeave(e, w.id)}
                      disabled={leavingId === w.id}
                    >
                      <IconLogout className="h-4 w-4" />
                      {leavingId === w.id ? "Leaving…" : "Leave"}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <Link
            href={
              w.status === "draft" || w.status === "processing"
                ? `/dashboard/workflows/${w.id}/edit`
                : `/dashboard/workflows/${w.id}`
            }
            className="flex flex-1 cursor-pointer flex-col"
          >
            <WorkflowCardMedia
              workflowId={w.id}
              thumbnail_gcs_path={w.thumbnail_gcs_path}
              brand_domain={w.brand_domain}
            />

            <div className="flex flex-1 flex-col gap-2 px-4 pt-4 pb-4">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                {!isOwner ? (
                  <span
                    className={workflowSharedTagClass}
                    title="This workflow was shared with you"
                  >
                    Shared
                  </span>
                ) : null}
                <span className={workflowStatusBadgeClass(w.status)}>
                  {workflowStatusLabel(w.status)}
                </span>
              </div>
              <span className="line-clamp-2 min-w-0 text-sm font-semibold leading-snug text-foreground">
                {w.name ?? "Untitled workflow"}
              </span>
            </div>
          </Link>
        </div>
        {isRunning && (
          <div className="absolute -right-1 -top-1 z-10 flex items-center gap-1 rounded-full bg-linear-to-r from-[#21C4DD] to-[#A577FF] px-2 py-0.5 text-[10px] font-medium text-white shadow-sm ring-2 ring-card">
            Running
          </div>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-1 overflow-auto">
        <div className="flex w-full flex-1 flex-col gap-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <Skeleton className="h-8 w-36 rounded-lg" />
            <Skeleton className="h-10 w-36 rounded-lg" />
          </div>
          {/* Card grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="overflow-hidden rounded-xl border border-border">
                <Skeleton className="h-36 w-full rounded-none" />
                <div className="flex flex-col gap-2 p-4">
                  <Skeleton className="h-4 w-40 rounded-md" />
                  <div className="flex gap-2">
                    <Skeleton className="h-5 w-16 rounded-full" />
                    <Skeleton className="h-5 w-14 rounded-full" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const deleteTargetName =
    deleteWorkflowId != null
      ? workflows.find((x) => x.id === deleteWorkflowId)?.name?.trim() || "Untitled workflow"
      : "";

  return (
    <>
      <Dialog open={deleteWorkflowId != null} onOpenChange={(o) => !o && setDeleteWorkflowId(null)}>
        <DialogContent
          showCloseButton
          className={cn(
            "gap-0 overflow-hidden rounded-2xl border border-border bg-card p-0 shadow-xl sm:max-w-md",
          )}
        >
          <div className="border-b border-border/60 px-6 pt-6 pb-5">
            <div className="flex gap-3">
              <GradientIconWell corners="lg" className="size-10 shrink-0">
                <IconTrash className="size-5 text-card-foreground" stroke={1.5} aria-hidden />
              </GradientIconWell>
              <div className="min-w-0 flex-1 space-y-2 text-left">
                <DialogTitle className={cn(DASHBOARD_PAGE_TITLE_CLASS, "text-card-foreground")}>
                  Delete this workflow?
                </DialogTitle>
                <DialogDescription className={cn(DASHBOARD_PAGE_DESCRIPTION_CLASS, "text-left")}>
                  This permanently removes &quot;{deleteTargetName}&quot; and its steps. You cannot
                  undo this action.
                </DialogDescription>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 border-t border-border/60 bg-card px-6 py-4 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="border-border"
              onClick={() => setDeleteWorkflowId(null)}
              disabled={deletingId != null}
            >
              <IconX className="size-4 shrink-0" stroke={1.5} />
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deletingId != null}
              onClick={() => void confirmDeleteWorkflow()}
            >
              {deletingId != null ? (
                <>
                  <IconLoader className="size-4 shrink-0 animate-spin" stroke={1.5} aria-hidden />
                  Deleting…
                </>
              ) : (
                <>
                  <IconTrash className="size-4 shrink-0" stroke={1.5} aria-hidden />
                  Delete workflow
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="flex shrink-0 items-center justify-between">
            <h1 className={DASHBOARD_PAGE_TITLE_CLASS}>Workflows</h1>
            <CreateWorkflowMenu variant="page-primary" />
          </div>

          {mine.length === 0 && sharedWithMe.length === 0 ? (
            <DashboardEmptyState
              className="min-h-0 flex-1"
              minHeightClass="min-h-0 flex-1"
              title="No workflows yet"
              description="Create your first workflow to get started."
              icon={Workflow}
            >
              <CreateWorkflowMenu variant="page-empty" />
            </DashboardEmptyState>
          ) : (
            <div className="flex flex-col gap-8">
              {mine.length > 0 ? (
                <section className="flex flex-col gap-3">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    My workflows
                  </h2>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {mine.map(renderWorkflowCard)}
                  </div>
                </section>
              ) : null}
              {sharedWithMe.length > 0 ? (
                <section className="flex flex-col gap-3">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Shared with me
                  </h2>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {sharedWithMe.map(renderWorkflowCard)}
                  </div>
                </section>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
