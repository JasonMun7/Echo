"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { auth } from "@/lib/firebase";
import { apiFetch } from "@/lib/api";
import { IconPlus, IconTrash } from "@tabler/icons-react";

interface Workflow {
  id: string;
  name?: string;
  status: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (e: React.MouseEvent, workflowId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this workflow? This cannot be undone.")) return;
    setDeletingId(workflowId);
    try {
      const res = await apiFetch(`/api/workflows/${workflowId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
    } catch (err) {
      console.error("Delete failed:", err);
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
    const q = query(
      collection(db, "workflows"),
      where("owner_uid", "==", uid)
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = (
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Workflow))
          .sort((a, b) => {
            const getTime = (x: unknown) =>
              typeof (x as { toMillis?: () => number })?.toMillis === "function"
                ? (x as { toMillis: () => number }).toMillis()
                : 0;
            return getTime(b.updatedAt) - getTime(a.updatedAt);
          })
      );
      setWorkflows(list);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#A577FF]/20 border-t-[#A577FF]" />
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
                className="group echo-card flex flex-col overflow-hidden transition-colors hover:border-[#A577FF]/40"
              >
                <Link
                  href={
                    w.status === "ready" || w.status === "active"
                      ? `/dashboard/workflows/${w.id}/edit`
                      : `/dashboard/workflows/${w.id}`
                  }
                  className="flex flex-1 cursor-pointer flex-col p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate font-medium text-[#150A35]">
                      {w.name ?? "Untitled workflow"}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        w.status === "ready" || w.status === "active"
                          ? "bg-[#22c55e]/20 text-[#22c55e]"
                          : w.status === "processing"
                          ? "bg-[#A577FF]/20 text-[#A577FF]"
                          : "bg-[#ef4444]/20 text-[#ef4444]"
                      }`}
                    >
                      {w.status}
                    </span>
                  </div>
                </Link>
                <div className="flex justify-end border-t border-[#A577FF]/10 px-4 py-2 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={(e) => handleDelete(e, w.id)}
                    disabled={deletingId === w.id}
                    className="flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-[#6b7280] transition-colors hover:bg-[#ef4444]/10 hover:text-[#ef4444] disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Delete workflow"
                  >
                    <IconTrash className="h-4 w-4" />
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
