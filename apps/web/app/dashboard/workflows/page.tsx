"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { collection, collectionGroup, query, where, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { db } from "@/lib/firebase";
import { auth } from "@/lib/firebase";
import { apiFetch } from "@/lib/api";
import {
  IconPlus,
  IconTrash,
  IconJumpRope,
  IconCheck,
  IconX,
  IconDots,
  IconPlayerPlay,
  IconPencil,
  IconShare3,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import Threads from "@/components/threads";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DesktopCaptureLink } from "@/components/desktop-capture-link";

interface WorkflowInvite {
  id: string;
  workflow_id: string;
  workflow_name: string;
  from_name: string;
  from_uid: string;
}

interface Workflow {
  id: string;
  name?: string;
  status: string;
  owner_uid?: string;
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
  return getTime(w.createdAt) === maxCreated || getTime(w.updatedAt) === maxUpdated;
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

  if (failed || (!url && failed !== false && url === null)) {
    return null;
  }

  if (!url) {
    return <Skeleton className="h-36 w-full rounded-none" />;
  }

  return (
    <div className="relative h-36 w-full overflow-hidden bg-[#F5F7FC]">
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

export default function WorkflowsPage() {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [invites, setInvites] = useState<WorkflowInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [respondingInvite, setRespondingInvite] = useState<string | null>(null);
  const [activeWorkflowId, setActiveWorkflowId] = useState<string | null>(null);
  const [authUid, setAuthUid] = useState<string | null>(
    auth?.currentUser?.uid ?? null,
  );
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

  const loadInvites = async () => {
    try {
      const res = await apiFetch("/api/workflows/invites");
      if (res.ok) {
        const data = await res.json();
        setInvites(data.invites || []);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!authUid) return;
    loadInvites();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUid]);

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
        setActiveWorkflowId(first ? first.ref.parent.parent?.id ?? null : null);
      },
      () => setActiveWorkflowId(null),
    );
    return () => unsub();
  }, [authUid]);

  const handleAcceptInvite = async (invite: WorkflowInvite) => {
    setRespondingInvite(invite.id);
    try {
      const res = await apiFetch(`/api/workflows/${invite.workflow_id}/invite/accept`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Failed to accept");
      setInvites((prev) => prev.filter((i) => i.id !== invite.id));
      toast.success(`"${invite.workflow_name}" copied to your workflows`);
      if (data.fork_id) {
        router.push(`/dashboard/workflows/${data.fork_id}`);
      }
    } catch {
      toast.error("Failed to accept invite");
    } finally {
      setRespondingInvite(null);
    }
  };

  const handleDeclineInvite = async (invite: WorkflowInvite) => {
    setRespondingInvite(invite.id);
    try {
      const res = await apiFetch(`/api/workflows/${invite.workflow_id}/invite/decline`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to decline");
      setInvites((prev) => prev.filter((i) => i.id !== invite.id));
      toast.success("Invite declined");
    } catch {
      toast.error("Failed to decline invite");
    } finally {
      setRespondingInvite(null);
    }
  };

  const handleDelete = async (e: React.MouseEvent, workflowId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm("Delete this workflow? This cannot be undone.")) return;
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
        .sort((a, b) =>
          getTime(b.createdAt ?? b.updatedAt) - getTime(a.createdAt ?? a.updatedAt),
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

  if (loading) {
    return (
      <div className="flex flex-1 overflow-auto">
        <div className="flex w-full flex-1 flex-col gap-4 p-6 md:p-10">
          {/* Header */}
          <div className="flex items-center justify-between">
            <Skeleton className="h-8 w-36 rounded-lg" />
            <Skeleton className="h-10 w-36 rounded-lg" />
          </div>
          {/* Card grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="rounded-xl border border-[#A577FF]/20 overflow-hidden">
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

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-6 md:p-10">
        <div className="flex shrink-0 items-center justify-between">
          <h1 className="text-2xl font-semibold text-[#150A35]">Workflows</h1>
          <DesktopCaptureLink
            className="echo-btn-cyan-lavender flex items-center gap-2"
          >
            <IconPlus className="h-5 w-5" />
            New Workflow
          </DesktopCaptureLink>
        </div>
        {invites.length > 0 && (
          <div className="flex flex-col gap-2">
            {invites.map((invite) => (
              <div
                key={invite.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-[#A577FF]/30 bg-[#A577FF]/5 px-4 py-3"
              >
                <p className="text-sm text-[#150A35]">
                  <span className="font-medium">{invite.from_name}</span>
                  {" invited you to "}
                  <span className="font-medium">&ldquo;{invite.workflow_name}&rdquo;</span>
                </p>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => handleDeclineInvite(invite)}
                    disabled={respondingInvite === invite.id}
                    className="flex items-center gap-1 rounded-md border border-[#150A35]/20 px-2.5 py-1 text-xs text-[#150A35]/60 hover:border-echo-error/40 hover:text-echo-error disabled:opacity-50"
                  >
                    <IconX className="h-3.5 w-3.5" />
                    Decline
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAcceptInvite(invite)}
                    disabled={respondingInvite === invite.id}
                    className="echo-btn-cyan-lavender flex items-center gap-1 rounded-md px-2.5 py-1 text-xs disabled:opacity-50"
                  >
                    <IconCheck className="h-3.5 w-3.5" />
                    Accept
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {workflows.length === 0 ? (
          <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-hidden rounded-lg border border-dashed border-[#A577FF]/40">
            <div className="absolute inset-0 overflow-hidden rounded-lg">
              <Threads
                color={[165 / 255, 119 / 255, 255 / 255]}
                amplitude={1.3}
                distance={0.3}
                enableMouseInteraction={false}
              />
            </div>
            <div className="relative z-[1] flex flex-col items-center gap-3 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#A577FF]/10">
                <IconJumpRope className="h-6 w-6 text-[#A577FF]" />
              </div>
              <p className="text-[#150A35] font-medium">No workflows yet</p>
              <DesktopCaptureLink
                className="echo-btn-cyan-lavender inline-flex items-center gap-2"
              >
                <IconPlus className="h-5 w-5" />
                Create your first workflow
              </DesktopCaptureLink>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {workflows.map((w) => {
              const isLatest = isLatestOrLastModified(w, workflows);
              const isRunning = activeWorkflowId === w.id;
              return (
              <div
                key={w.id}
                className={`relative rounded-xl transition-all ${isRunning ? "bg-linear-to-r from-echo-cyan to-[#A577FF] p-[2px] shadow-lg shadow-[#A577FF]/20" : ""}`}
              >
              <div
                className={`group relative echo-card flex h-full flex-col overflow-visible transition-all hover:border-[#A577FF]/50 hover:shadow-md ${isRunning ? "border-0" : ""} ${isLatest && !isRunning ? "border-[#A577FF]/40 ring-1 ring-[#A577FF]/20" : ""}`}
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
                {/* Three-dots menu — top-right, shown on hover */}
                <div
                  className="absolute right-2 top-2 z-10 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={(e) => e.preventDefault()}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white/90 text-[#150A35] shadow-sm backdrop-blur-sm hover:bg-[#A577FF]/10 hover:text-[#A577FF]"
                        aria-label="Workflow actions"
                      >
                        <IconDots className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-40">
                      <DropdownMenuItem
                        onClick={(e) => handleRun(e, w.id)}
                        disabled={
                          runningId === w.id ||
                          (w.status !== "ready" && w.status !== "active")
                        }
                      >
                        <IconPlayerPlay className="h-4 w-4" />
                        {runningId === w.id ? "Starting…" : "Run"}
                      </DropdownMenuItem>
                      {w.owner_uid === auth?.currentUser?.uid && (
                        <DropdownMenuItem asChild>
                          <Link href={`/dashboard/workflows/${w.id}/edit`}>
                            <IconPencil className="h-4 w-4" />
                            Edit
                          </Link>
                        </DropdownMenuItem>
                      )}
                      {w.owner_uid === auth?.currentUser?.uid && (
                        <DropdownMenuItem asChild>
                          <Link href={`/dashboard/workflows/${w.id}`}>
                            <IconShare3 className="h-4 w-4" />
                            Share
                          </Link>
                        </DropdownMenuItem>
                      )}
                      {w.owner_uid === auth?.currentUser?.uid && (
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={(e) => handleDelete(e, w.id)}
                          disabled={deletingId === w.id}
                        >
                          <IconTrash className="h-4 w-4" />
                          {deletingId === w.id ? "Deleting…" : "Delete"}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Entire card is a link */}
                <Link
                  href={
                    w.status === "draft" || w.status === "processing"
                      ? `/dashboard/workflows/${w.id}/edit`
                      : `/dashboard/workflows/${w.id}`
                  }
                  className="flex flex-1 cursor-pointer flex-col"
                >
                  {/* Thumbnail */}
                  {w.thumbnail_gcs_path ? (
                    <WorkflowThumbnail workflowId={w.id} />
                  ) : (
                    <div className="flex h-28 w-full items-center justify-center bg-linear-to-br from-[#F5F7FC] to-[#A577FF]/5">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#A577FF]/10">
                        <IconJumpRope className="h-6 w-6 text-[#A577FF]" />
                      </div>
                    </div>
                  )}

                  {/* Card body */}
                  <div className="flex flex-1 flex-col gap-2 p-4">
                    <span className="min-w-0 flex-1 font-medium leading-snug text-[#150A35] transition-colors group-hover:text-[#A577FF]">
                      {w.name ?? "Untitled workflow"}
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          w.status === "ready" || w.status === "active"
                            ? "bg-echo-success/15 text-echo-success"
                            : w.status === "processing"
                              ? "bg-[#A577FF]/20 text-[#A577FF]"
                              : w.status === "failed"
                                ? "bg-echo-error/15 text-echo-error"
                                : "bg-[#150A35]/10 text-[#150A35]/70"
                        }`}
                      >
                        {({ draft: "Setting Up", processing: "Synthesizing", ready: "Ready", active: "Live", failed: "Failed" } as Record<string, string>)[w.status] ?? w.status}
                      </span>
                    </div>
                  </div>
                </Link>
              </div>
              {isRunning && (
                <div className="absolute -right-1 -top-1 z-10 flex items-center gap-1 rounded-full bg-linear-to-r from-echo-cyan to-[#A577FF] px-2 py-0.5 text-[10px] font-medium text-white shadow-sm ring-2 ring-white">
                  Running
                </div>
              )}
              </div>
            );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
