"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { auth } from "@/lib/firebase";
import { apiFetch } from "@/lib/api";
import {
  IconPlus,
  IconTrash,
  IconBrandChrome,
  IconDeviceLaptop,
} from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface Workflow {
  id: string;
  name?: string;
  status: string;
  workflow_type?: "browser" | "desktop";
  thumbnail_gcs_path?: string;
  createdAt: unknown;
  updatedAt: unknown;
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
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (e: React.MouseEvent, workflowId: string) => {
    e.preventDefault();
    e.stopPropagation();
    // Simple confirm — AlertDialog would require refactor of card structure
    if (!window.confirm("Delete this workflow? This cannot be undone.")) return;
    setDeletingId(workflowId);
    try {
      const res = await apiFetch(`/api/workflows/${workflowId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
    } catch (err) {
      console.error("Delete failed:", err);
      // Toast would require adding Sonner import; log for now
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    if (!db || !auth?.currentUser) {
      setLoading(false);
      return;
    }
    const uid = auth.currentUser.uid;
    const q = query(collection(db, "workflows"), where("owner_uid", "==", uid));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as Workflow)
        .sort((a, b) => {
          const getTime = (x: unknown) =>
            typeof (x as { toMillis?: () => number })?.toMillis === "function"
              ? (x as { toMillis: () => number }).toMillis()
              : 0;
          return getTime(b.updatedAt) - getTime(a.updatedAt);
        });
      setWorkflows(list);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-1 overflow-auto">
        <div className="flex w-full flex-1 flex-col gap-4 rounded-tl-2xl border border-[#A577FF]/20 border-l-0 bg-white p-6 shadow-sm md:p-10">
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
    <div className="flex flex-1 overflow-auto">
      <div className="flex h-full w-full flex-1 flex-col gap-4 rounded-tl-2xl border border-[#A577FF]/20 border-l-0 bg-white p-6 shadow-sm md:p-10">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-[#150A35]">Workflows</h1>
          <Link
            href="/dashboard/workflows/new"
            className="echo-btn-primary flex items-center gap-2"
          >
            <IconPlus className="h-5 w-5" />
            New Workflow
          </Link>
        </div>
        {workflows.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-[#A577FF]/40 bg-[#F5F7FC] py-16">
            <p className="text-[#150A35]/80">No workflows yet</p>
            <Link href="/dashboard/workflows/new" className="echo-btn-primary">
              Create your first workflow
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {workflows.map((w) => (
              <div
                key={w.id}
                className="group relative echo-card flex flex-col overflow-hidden transition-all hover:border-[#A577FF]/50 hover:shadow-md"
              >
                {/* Delete button — top-right, shown on hover, stops link navigation */}
                <button
                  type="button"
                  onClick={(e) => handleDelete(e, w.id)}
                  disabled={deletingId === w.id}
                  className="absolute right-2 top-2 z-10 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-white/80 text-echo-error opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover:opacity-100 hover:bg-echo-error hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Delete workflow"
                >
                  <IconTrash className="h-3.5 w-3.5" />
                </button>

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
                        {w.workflow_type === "desktop" ? (
                          <IconDeviceLaptop className="h-6 w-6 text-[#A577FF]" />
                        ) : (
                          <IconBrandChrome className="h-6 w-6 text-[#A577FF]" />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Card body */}
                  <div className="flex flex-1 flex-col gap-2 p-4">
                    <span className="min-w-0 flex-1 font-medium leading-snug text-[#150A35] transition-colors group-hover:text-[#A577FF]">
                      {w.name ?? "Untitled workflow"}
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {w.workflow_type && (
                        <WorkflowTypeBadge type={w.workflow_type} />
                      )}
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
