"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { auth } from "@/lib/firebase";
import { apiFetch } from "@/lib/api";
import { IconArrowLeft, IconPlayerStop } from "@tabler/icons-react";

interface Log {
  id: string;
  message: string;
  timestamp: unknown;
  level: string;
}

export default function RunDetailPage() {
  const params = useParams();
  const workflowId = params.id as string;
  const runId = params.runId as string;
  const [run, setRun] = useState<Record<string, unknown> | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [cancelling, setCancelling] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const handleCancel = async () => {
    if (!run || (run.status !== "pending" && run.status !== "running")) return;
    setCancelling(true);
    try {
      const res = await apiFetch(
        `/api/run/${workflowId}/${runId}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Failed to cancel");
    } catch (e) {
      console.error("Cancel failed:", e);
    } finally {
      setCancelling(false);
    }
  };

  useEffect(() => {
    if (!db || !auth?.currentUser) return;
    const runRef = doc(db, "workflows", workflowId, "runs", runId);
    const unsubRun = onSnapshot(runRef, (snap) => {
      if (snap.exists() && snap.data()?.owner_uid === auth?.currentUser?.uid) {
        setRun({ id: snap.id, ...snap.data() });
      } else {
        setRun(null);
      }
    });
    const logsRef = collection(db, "workflows", workflowId, "runs", runId, "logs");
    const q = query(logsRef, orderBy("timestamp", "asc"));
    const unsubLogs = onSnapshot(q, (snap) => {
      setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Log)));
    });
    return () => {
      unsubRun();
      unsubLogs();
    };
  }, [workflowId, runId]);

  return (
    <div className="flex flex-1 overflow-auto">
      <div className="flex h-full w-full flex-1 flex-col gap-4 rounded-tl-2xl border border-[#A577FF]/20 border-l-0 bg-white p-6 shadow-sm md:p-10">
        <div className="flex flex-wrap items-center gap-4">
          <Link
            href={`/dashboard/workflows/${workflowId}`}
            className="cursor-pointer text-[#150A35]/70 hover:text-[#A577FF]"
          >
            <IconArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-semibold text-[#150A35]">Run Logs</h1>
          {(run?.status === "running" || run?.status === "pending") && (
            <span className="flex items-center gap-1.5 rounded-full bg-[#A577FF]/20 px-2.5 py-0.5 text-xs font-medium text-[#A577FF]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#A577FF]" />
              Live
            </span>
          )}
          {run && (
            <>
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  run.status === "completed"
                    ? "bg-[#22c55e]/20 text-[#22c55e]"
                    : run.status === "running"
                    ? "bg-[#A577FF]/20 text-[#A577FF]"
                    : run.status === "failed"
                    ? "bg-[#ef4444]/20 text-[#ef4444]"
                    : run.status === "cancelled"
                    ? "bg-gray-300 text-gray-600"
                    : "bg-gray-200 text-gray-600"
                }`}
              >
                {String(run.status)}
              </span>
              {(run.status === "pending" || run.status === "running") && (
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="echo-btn-secondary ml-2 flex items-center gap-2 border-[#ef4444]/40 text-[#ef4444] hover:bg-[#ef4444]/10 disabled:opacity-50"
                >
                  <IconPlayerStop className="h-4 w-4" />
                  {cancelling ? "Cancelling..." : "Cancel Run"}
                </button>
              )}
            </>
          )}
        </div>

        {run?.lastScreenshotUrl ? (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-[#150A35]">Live view</h3>
            <div className="overflow-hidden rounded-lg border border-[#A577FF]/20 bg-[#150A35] shadow-sm">
              <img
                src={String(run.lastScreenshotUrl)}
                alt="Agent browser view"
                className="h-auto w-full max-w-4xl object-contain"
              />
            </div>
          </div>
        ) : null}
        <div className="flex-1 overflow-auto rounded-lg border border-[#A577FF]/20 bg-[#150A35] p-4 font-mono text-sm text-[#F5F7FC]">
          {logs.length === 0 ? (
            <p className="text-[#F5F7FC]/60">No logs yet. Logs stream here in real time as the agent runs.</p>
          ) : (
            <div className="space-y-1">
              {logs.map((log) => (
                <div key={log.id} className="whitespace-pre-wrap">
                  {log.message}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
