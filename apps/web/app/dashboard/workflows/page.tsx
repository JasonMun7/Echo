"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, collectionGroup, query, where, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { db } from "@/lib/firebase";
import { auth } from "@/lib/firebase";
import { apiFetch } from "@/lib/api";
import { Workflow } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardEmptyState } from "@/components/dashboard-empty-state";
import { CreateWorkflowMenu } from "@/components/create-workflow-menu";
import {
  DashboardWorkflowListCard,
  DeleteWorkflowConfirmDialog,
  type DashboardWorkflowListCardModel,
} from "@/components/dashboard-workflow-list-card";
import { DASHBOARD_PAGE_TITLE_CLASS } from "@/lib/dashboard-page-typography";
import { featuredWorkflowId } from "@/lib/workflow-activity";
import { workflowTimestampMillis } from "@/lib/workflow-timestamps";

interface Workflow extends DashboardWorkflowListCardModel {
  workflow_type?: "browser" | "desktop";
  ephemeral?: boolean;
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
        .sort(
          (a, b) =>
            workflowTimestampMillis(b.createdAt ?? b.updatedAt) -
            workflowTimestampMillis(a.createdAt ?? a.updatedAt),
        );
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
    return (
      <DashboardWorkflowListCard
        key={w.id}
        workflow={w}
        authUid={authUid}
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
