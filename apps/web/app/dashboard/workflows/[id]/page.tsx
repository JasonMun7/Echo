"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  doc,
  collection,
  query,
  orderBy,
  onSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { auth } from "@/lib/firebase";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import {
  IconArrowLeft,
  IconPlayerPlay,
  IconList,
  IconTrash,
} from "@tabler/icons-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Run {
  id: string;
  status: string;
  createdAt: unknown;
}

function formatRunLabel(r: Run, index: number): string {
  const ts = (r.createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0;
  if (!ts) return `Run ${index + 1}`;
  const diff = Date.now() - ts;
  if (diff < 60_000) return "Just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} hr ago`;
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function WorkflowDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [workflow, setWorkflow] = useState<Record<string, unknown> | null>(
    null,
  );
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  useEffect(() => {
    if (!db || !auth?.currentUser) return;
    const wfRef = doc(db, "workflows", id);
    const unsubWf = onSnapshot(
      wfRef,
      (snap) => {
        if (snap.exists() && snap.data()?.owner_uid === auth?.currentUser?.uid) {
          setWorkflow({ id: snap.id, ...snap.data() });
        } else {
          setWorkflow(null);
        }
      },
      (err) => {
        console.warn("Workflow snapshot error (may be deleted):", err);
        setWorkflow(null);
      },
    );
    const runsRef = collection(db, "workflows", id, "runs");
    const q = query(runsRef, orderBy("createdAt", "desc"));
    const unsubRuns = onSnapshot(
      q,
      (snap) => {
        setRuns(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Run));
      },
      (err) => {
        console.warn("Runs snapshot error (workflow may be deleted):", err);
        setRuns([]);
      },
    );
    return () => {
      unsubWf();
      unsubRuns();
    };
  }, [id]);

  useEffect(() => {
    setLoading(false);
  }, [workflow]);

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
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        <div className="flex min-h-0 flex-1 flex-col gap-4 p-6 md:p-10">
          {/* Header skeleton: Back, Title, Buttons */}
          <div className="flex flex-col gap-3">
            <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
            <Skeleton className="h-4 w-48 rounded-md" />
            <div className="flex gap-2">
              <Skeleton className="h-8 w-16 rounded-md" />
              <Skeleton className="h-8 w-14 rounded-md" />
              <Skeleton className="h-8 w-14 rounded-md" />
            </div>
          </div>
          {/* Status */}
          <Skeleton className="h-4 w-32 rounded-md" />
          {/* Run list */}
          <div className="flex flex-col gap-2 mt-2">
            <Skeleton className="h-5 w-24 rounded-lg" />
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {running && (
        <>
          <div className="echo-run-haze" />
          <div className="echo-run-haze-content">
            <div className="h-12 w-12 animate-spin rounded-full border-2 border-[#A577FF]/50 border-t-[#A577FF]" />
            <p className="animate-pulse text-lg font-bold tracking-wide text-[#150A35] drop-shadow-sm">
              EchoPrism is taking control…
            </p>
          </div>
        </>
      )}
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        <div className="flex min-h-0 flex-1 flex-col gap-4 p-6 md:p-10">
          <div className="flex flex-col gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/dashboard/workflows"
                  className="echo-btn-secondary-accent flex w-fit shrink-0 items-center justify-center rounded-lg p-1.5"
                  aria-label="Back"
                >
                  <IconArrowLeft className="h-5 w-5 text-[#21C4DD]" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="bottom">Back to workflows</TooltipContent>
            </Tooltip>
            <h1 className="min-w-0 truncate text-base font-semibold text-[#150A35]">
              {String(workflow.name || id)}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="echo-btn-danger flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm disabled:opacity-50"
              >
                <IconTrash className="h-4 w-4" />
                {deleting ? "Deleting..." : "Delete"}
              </button>
              <Link
                href={`/dashboard/workflows/${id}/edit`}
                className="echo-btn-secondary-accent flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm"
              >
                <IconList className="h-4 w-4 text-[#21C4DD]" />
                Edit
              </Link>
              <button
                type="button"
                onClick={handleRun}
                disabled={
                  running ||
                  (workflow.status !== "active" && workflow.status !== "ready")
                }
                className="echo-btn-cyan-lavender flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm disabled:opacity-50"
              >
                <IconPlayerPlay className="h-4 w-4 text-white" />
                {running ? "Starting..." : "Run"}
              </button>
            </div>
          </div>

          <p className="text-[#150A35]/80">
            Status:{" "}
            <span className="font-medium">{String(workflow.status)}</span>
          </p>
          {typeof workflow.source_recording_id === "string" && workflow.source_recording_id && (
            <p
              className="text-sm text-[#150A35]/60"
              title="Recording used to create this workflow — use this to correlate with logs"
            >
              Source: <code className="rounded bg-[#150A35]/5 px-1.5 py-0.5 font-mono text-xs">{String(workflow.source_recording_id)}</code>
            </p>
          )}

          <div>
            <h2 className="mb-3 text-lg font-medium text-[#150A35]">
              Run History
            </h2>
            <p className="mb-3 text-sm text-echo-text-muted">
              Click Run above to start a workflow. EchoPrism will take control
              and navigate automatically.
            </p>
            {runs.length === 0 ? (
              <p className="text-[#150A35]/60">No runs yet.</p>
            ) : (
              <div className="space-y-2">
                {runs.map((r, idx) => (
                  <Link
                    key={r.id}
                    href={`/dashboard/workflows/${id}/runs/${r.id}`}
                    className="echo-card block cursor-pointer p-4 transition-colors hover:border-[#A577FF]/40"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-[#150A35]">
                        {formatRunLabel(r, idx)}
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          r.status === "completed"
                            ? "bg-echo-success/20 text-echo-success"
                            : r.status === "running" || r.status === "pending"
                              ? "bg-[#A577FF]/20 text-[#A577FF]"
                              : r.status === "failed"
                                ? "bg-echo-error/20 text-echo-error"
                                : r.status === "awaiting_user"
                                  ? "bg-amber-100 text-amber-600"
                                  : "bg-gray-200 text-gray-600"
                        }`}
                      >
                        {r.status === "awaiting_user"
                          ? "needs input"
                          : r.status}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
