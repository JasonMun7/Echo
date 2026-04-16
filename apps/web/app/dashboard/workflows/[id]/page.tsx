"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { db } from "@/lib/firebase";
import { auth } from "@/lib/firebase";
import { apiFetch } from "@/lib/api";
import {
  workflowSharedTagClass,
  workflowShellClass,
  workflowStatusBadgeClass,
  workflowStatusLabel,
} from "@/lib/workflow-status";
import { DASHBOARD_PAGE_TITLE_CLASS } from "@/lib/dashboard-page-typography";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  WorkflowShareDialog,
  type WorkflowParticipantRole,
  type WorkflowShareRole,
} from "@/components/workflow-share-dialog";
import {
  IconArrowLeft,
  IconPlayerPlay,
  IconTrash,
  IconCopy,
  IconShare,
  IconDots,
  IconPencil,
} from "@tabler/icons-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
          <Skeleton className="h-32 w-full shrink-0 rounded-xl" />
          <div className="flex min-h-0 flex-1 flex-col gap-3 rounded-xl border border-[#A577FF]/20 bg-white p-4">
            <Skeleton className="h-6 w-24 shrink-0 rounded-md" />
            <Skeleton className="h-4 w-2/3 max-w-md shrink-0 rounded-md" />
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
          <div className={cn(workflowShellClass, "shrink-0 p-5 sm:p-6")}>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      href="/dashboard/workflows"
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/80 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:mt-0.5"
                      aria-label="Back to workflows"
                    >
                      <IconArrowLeft className="h-5 w-5" stroke={1.5} />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Back to workflows</TooltipContent>
                </Tooltip>

                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h1
                      className={cn(
                        "min-w-0 flex-1 break-words leading-snug",
                        DASHBOARD_PAGE_TITLE_CLASS,
                      )}
                      title={String(workflow.name || id)}
                    >
                      {String(workflow.name || id)}
                    </h1>
                    <div className="flex shrink-0 items-center justify-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground"
                            aria-label="Workflow actions"
                          >
                            <IconDots className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-44">
                          <DropdownMenuItem
                            onClick={() => void handleRun()}
                            disabled={
                              running ||
                              (workflow.status !== "active" && workflow.status !== "ready")
                            }
                          >
                            <IconPlayerPlay className="h-4 w-4" />
                            {running ? "Starting…" : "Run workflow"}
                          </DropdownMenuItem>
                          {canEditWorkflow ? (
                            <DropdownMenuItem asChild>
                              <Link href={`/dashboard/workflows/${id}/edit`}>
                                <IconPencil className="h-4 w-4" />
                                Edit
                              </Link>
                            </DropdownMenuItem>
                          ) : null}
                          {canEditWorkflow ? (
                            <DropdownMenuItem
                              onClick={() => {
                                setShareModalOpen(true);
                                void loadCollaborators();
                              }}
                            >
                              <IconShare className="h-4 w-4" />
                              Share
                            </DropdownMenuItem>
                          ) : null}
                          {!isOwner ? (
                            <DropdownMenuItem onClick={() => void handleFork()} disabled={forking}>
                              <IconCopy className="h-4 w-4" />
                              {forking ? "Copying…" : "Make a copy"}
                            </DropdownMenuItem>
                          ) : null}
                          {isOwner && (
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => void handleDelete()}
                              disabled={deleting}
                            >
                              <IconTrash className="h-4 w-4" />
                              {deleting ? "Deleting…" : "Delete"}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                    <span
                      className={workflowStatusBadgeClass(status)}
                      title="Workflow lifecycle status"
                    >
                      {workflowStatusLabel(status)}
                    </span>
                    {!isOwner ? (
                      <span
                        className={workflowSharedTagClass}
                        title="This workflow was shared with you"
                      >
                        Shared
                      </span>
                    ) : null}
                    {typeof workflow.source_recording_id === "string" &&
                      workflow.source_recording_id && (
                        <span className="text-muted-foreground" title="Source">
                          From screen recording
                        </span>
                      )}
                  </div>
                  {status === "failed" && failureReason && (
                    <div className="rounded-lg border border-echo-error/30 bg-echo-error/10 px-3 py-2">
                      <p className="text-sm font-medium text-echo-error">
                        Workflow synthesis failed
                      </p>
                      <p className="mt-1 text-sm text-echo-error/90">{failureReason}</p>
                      <p className="mt-1 text-xs text-foreground/70">
                        Retry with a clearer recording or edit steps manually once fixed.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

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
            <div className="flex min-h-0 flex-1 basis-0 flex-col overflow-hidden px-4 pb-4 pt-0 sm:px-5 sm:pb-5">
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
