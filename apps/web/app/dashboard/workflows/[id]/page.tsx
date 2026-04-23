"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { db } from "@/lib/firebase";
import { auth } from "@/lib/firebase";
import { apiFetch } from "@/lib/api";
import { workflowShellClass } from "@/lib/workflow-status";
import { DASHBOARD_PAGE_TITLE_CLASS } from "@/lib/dashboard-page-typography";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  WorkflowShareDialog,
  type WorkflowParticipantRole,
  type WorkflowShareRole,
} from "@/components/workflow-share-dialog";
import {
  WorkflowPageHeader,
  WorkflowPageHeaderShell,
  WorkflowPageHeaderSkeleton,
} from "@/components/workflow-page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable } from "@/components/data-table";

interface Run {
  id: string;
  status: string;
  createdAt: unknown;
  completedAt?: unknown;
  source?: string;
}

interface Collaborator {
  uid: string;
  email: string;
  display_name: string;
  photo_url?: string;
  status?: "pending" | "accepted";
  role?: WorkflowParticipantRole;
}

interface WorkflowDetail {
  id: string;
  name?: string;
  status?: string;
  error?: string;
  owner_uid?: string;
  owner_name?: string;
  source_recording_id?: string;
  shared_with?: string[];
  collaborator_roles?: Record<string, string>;
  is_public?: boolean;
  [key: string]: unknown;
}

export default function WorkflowDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [workflow, setWorkflow] = useState<WorkflowDetail | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [shareInviteRole, setShareInviteRole] = useState<WorkflowShareRole>("editor");
  const [sharing, setSharing] = useState(false);
  const [roleChangePendingUid, setRoleChangePendingUid] = useState<string | null>(null);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [forking, setForking] = useState(false);
  const [publicSaving, setPublicSaving] = useState(false);
  const [authUid, setAuthUid] = useState<string | null>(auth?.currentUser?.uid ?? null);
  const getCollaboratorStatusLabel = (c: Collaborator) => {
    if (c.role === "owner") return "Owner";
    if (c.status === "pending") return "Pending";
    if (c.role === "viewer") return "Can view";
    return "Can edit";
  };

  // Track auth state so snapshot effect re-runs once Firebase auth is ready
  useEffect(() => {
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUid(user?.uid ?? null);
    });
    return unsub;
  }, []);

  const handleDelete = async () => {
    if (!confirm("Delete this workflow? This cannot be undone.")) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/workflows/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      router.push("/dashboard/workflows");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete workflow");
    } finally {
      setDeleting(false);
    }
  };

  // Load workflow via API — works for both owners and shared users
  useEffect(() => {
    if (!authUid) return;
    let cancelled = false;
    setLoading(true);
    apiFetch(`/api/workflows/${id}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data) => {
        if (!cancelled) {
          setWorkflow(data as WorkflowDetail);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setWorkflow(null);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id, authUid]);

  // Runs: keep real-time Firestore listener for live status updates
  useEffect(() => {
    if (!db || !authUid) return;
    const runsRef = collection(db, "workflows", id, "runs");
    const q = query(runsRef, orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setRuns(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Run));
      },
      (err) => {
        console.warn("Runs snapshot error:", err);
        setRuns([]);
      },
    );
    return unsub;
  }, [id, authUid]);

  const tableRuns = useMemo(
    () =>
      workflow
        ? runs.map((r) => ({
            id: r.id,
            workflowId: id,
            workflowName: String(workflow.name ?? ""),
            status: r.status,
            createdAt: r.createdAt,
            completedAt: r.completedAt,
            source: r.source ?? "desktop",
          }))
        : [],
    [runs, id, workflow],
  );

  const loadCollaborators = async () => {
    try {
      const res = await apiFetch(`/api/workflows/${id}/collaborators`);
      if (res.ok) {
        const data = await res.json();
        setCollaborators(data.collaborators || []);
      }
    } catch {
      // ignore
    }
  };

  const handleWorkflowPublicChange = async (next: boolean) => {
    if (!workflow || workflow.owner_uid !== authUid) return;
    setPublicSaving(true);
    try {
      const res = await apiFetch(`/api/workflows/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_public: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.detail === "string" ? data.detail : "Could not update visibility",
        );
      }
      setWorkflow((prev) => (prev ? { ...prev, is_public: next } : prev));
      toast.success(next ? "Workflow is public" : "Workflow is private", {
        description: next
          ? "You can copy the link and send invites."
          : "Sharing is disabled until you turn public on again.",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update visibility");
    } finally {
      setPublicSaving(false);
    }
  };

  const handleShare = async () => {
    if (!shareEmail.trim()) return;
    if (!workflow?.is_public) {
      toast.info("Make the workflow public first", {
        description: "Use the toggle in this dialog to enable sharing.",
      });
      return;
    }
    setSharing(true);
    try {
      const res = await apiFetch(`/api/workflows/${id}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: shareEmail.trim(), role: shareInviteRole }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Failed to share");
      setShareEmail("");
      toast.success("Workflow shared", {
        description: "They’ll appear under collaborators once they accept the invite.",
      });
      await loadCollaborators();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to share workflow");
    } finally {
      setSharing(false);
    }
  };

  const handleCollaboratorRoleChange = async (targetUid: string, role: WorkflowShareRole) => {
    setRoleChangePendingUid(targetUid);
    try {
      const res = await apiFetch(`/api/workflows/${id}/share/${targetUid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(typeof data.detail === "string" ? data.detail : "Could not update access");
      setCollaborators((prev) => prev.map((c) => (c.uid === targetUid ? { ...c, role } : c)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update access");
    } finally {
      setRoleChangePendingUid(null);
    }
  };

  const handleUnshare = async (targetUid: string) => {
    try {
      const res = await apiFetch(`/api/workflows/${id}/share/${targetUid}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to remove collaborator");
      setCollaborators((prev) => prev.filter((c) => c.uid !== targetUid));
      toast.success("Access removed", {
        description: "That person no longer sees this workflow.",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove access");
    }
  };

  const handleFork = async () => {
    setForking(true);
    try {
      const res = await apiFetch(`/api/workflows/${id}/fork`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Failed to make a copy");
      toast.success("Copy created", {
        description: "Opening your copy—you can edit and publish it independently.",
      });
      router.push(`/dashboard/workflows/${data.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to make a copy");
    } finally {
      setForking(false);
    }
  };

  const handleRun = async () => {
    setRunning(true);
    try {
      const res = await apiFetch(`/api/run/${id}?source=desktop`, {
        method: "POST",
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || "Failed to start run");
      }
      const data = await res.json();
      if (data.run_id) {
        toast.success("Run started", {
          description: "Opening Echo desktop with this run. Track it on the run page.",
        });
        window.location.href = `echo-desktop://run?workflow_id=${id}&run_id=${data.run_id}`;
        router.push(`/dashboard/workflows/${id}/runs/${data.run_id}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start run");
    } finally {
      setRunning(false);
    }
  };

  if (loading || !workflow) {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1 basis-0 flex-col gap-6">
          <WorkflowPageHeaderShell className="shrink-0">
            <WorkflowPageHeaderSkeleton showSubtitle />
          </WorkflowPageHeaderShell>
          <div className="flex min-h-0 flex-1 flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-md sm:p-5">
            <div className="flex flex-wrap items-center gap-3">
              <Skeleton className="h-9 w-28 shrink-0 rounded-lg sm:w-32" />
              <Skeleton className="h-9 flex-1 rounded-lg sm:max-w-xs" />
              <Skeleton className="h-9 w-24 shrink-0 rounded-lg" />
            </div>
            <Skeleton className="h-4 w-full max-w-2xl rounded-md" />
            <Skeleton className="h-4 w-[min(100%,80%)] max-w-xl rounded-md" />
            <Skeleton className="min-h-0 flex-1 rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  const uid = auth?.currentUser?.uid;
  const isOwner = workflow.owner_uid === uid;
  const canEditWorkflow =
    isOwner ||
    (uid != null &&
      Array.isArray(workflow.shared_with) &&
      workflow.shared_with.includes(uid) &&
      workflow.collaborator_roles?.[uid] !== "viewer");
  const status = workflow.status ?? "unknown";
  const failureReason = typeof workflow.error === "string" ? workflow.error.trim() : "";

  const handleSaveWorkflowTitle = async (trimmed: string) => {
    if (!canEditWorkflow) return;
    try {
      const res = await apiFetch(`/api/workflows/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.detail === "string" ? data.detail : "Could not rename workflow",
        );
      }
      setWorkflow((prev) => (prev ? { ...prev, name: trimmed } : prev));
      toast.success("Workflow renamed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not rename workflow");
    }
  };

  return (
    <>
      {running && (
        <>
          <div className="echo-run-haze" />
          <div className="echo-run-haze-content">
            <div className="h-12 w-12 animate-spin rounded-full border-2 border-[#A577FF]/50 border-t-[#A577FF]" />
            <p className={cn("animate-pulse drop-shadow-sm", DASHBOARD_PAGE_TITLE_CLASS)}>
              EchoPrism is taking control…
            </p>
          </div>
        </>
      )}
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1 basis-0 flex-col gap-6">
          <WorkflowPageHeaderShell className="shrink-0">
            <WorkflowPageHeader
              workflowId={id}
              workflowTitle={String(workflow.name || id)}
              workflowStatus={status}
              isOwner={isOwner}
              canEditWorkflow={canEditWorkflow}
              variant="detail"
              backHref="/dashboard/workflows"
              backTooltip="Back to workflows"
              titleAsPageHeading
              onSaveWorkflowTitle={
                canEditWorkflow ? (t) => void handleSaveWorkflowTitle(t) : undefined
              }
              onRunWorkflow={() => void handleRun()}
              runWorkflowDisabled={
                running || (workflow.status !== "active" && workflow.status !== "ready")
              }
              runWorkflowPending={running}
              onOpenShare={() => {
                setShareModalOpen(true);
                void loadCollaborators();
              }}
              onFork={() => void handleFork()}
              forking={forking}
              onRequestDeleteWorkflow={isOwner ? () => void handleDelete() : undefined}
              deleteWorkflowPending={deleting}
              belowRow={
                status === "failed" && failureReason ? (
                  <div className="rounded-lg border border-echo-error/30 bg-echo-error/10 px-3 py-2">
                    <p className="text-sm font-medium text-echo-error">Workflow synthesis failed</p>
                    <p className="mt-1 text-sm text-echo-error/90">{failureReason}</p>
                    <p className="mt-1 text-xs text-foreground/70">
                      Retry with a clearer recording or edit steps manually once fixed.
                    </p>
                  </div>
                ) : null
              }
            />
          </WorkflowPageHeaderShell>

          <section
            className={cn(
              workflowShellClass,
              "flex min-h-0 flex-1 basis-0 flex-col overflow-hidden p-0",
            )}
          >
            <div className="shrink-0 border-b border-border px-5 py-4 sm:px-6">
              <h2 className="text-base font-semibold tracking-tight text-foreground">Runs</h2>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Execution history for this workflow. Start a run from the button above; EchoPrism
                drives the desktop session.
              </p>
            </div>
            <div className="flex min-h-0 flex-1 basis-0 flex-col overflow-hidden p-4 sm:p-5">
              <DataTable
                data={tableRuns}
                singleWorkflow={{ workflowId: id, workflowName: String(workflow.name ?? "") }}
              />
            </div>
          </section>
        </div>
      </div>

      <WorkflowShareDialog
        open={shareModalOpen}
        onOpenChange={setShareModalOpen}
        shareEmail={shareEmail}
        onShareEmailChange={setShareEmail}
        inviteRole={shareInviteRole}
        onInviteRoleChange={setShareInviteRole}
        onShare={handleShare}
        sharing={sharing}
        collaborators={collaborators}
        onUnshare={handleUnshare}
        onCollaboratorRoleChange={handleCollaboratorRoleChange}
        roleChangePendingUid={roleChangePendingUid}
        getCollaboratorStatusLabel={getCollaboratorStatusLabel}
        workflowId={id}
        directLinkVariant="detail"
        canManageCollaborators={isOwner}
        currentUserUid={authUid}
        isPublic={Boolean(workflow.is_public)}
        onPublicChange={isOwner ? handleWorkflowPublicChange : undefined}
        publicSaving={publicSaving}
        canManagePublic={isOwner}
      />
    </>
  );
}
