"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
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
import {
  IconArrowLeft,
  IconCircleCheck,
  IconAlertCircle,
  IconBan,
  IconUserQuestion,
  IconRefresh,
  IconBrain,
} from "@tabler/icons-react";
import { toast } from "sonner";

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface ThoughtEntry {
  thought: string;
  action: string;
  step_index: number;
}

interface LogEntry {
  id: string;
  message: string;
  level?: string;
  timestamp: unknown;
}

function formatTimestamp(ts: unknown): string {
  const ms =
    typeof (ts as { toMillis?: () => number })?.toMillis === "function"
      ? (ts as { toMillis: () => number }).toMillis()
      : 0;
  if (!ms) return "";
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function RunDetailPage() {
  const params = useParams();
  const router = useRouter();
  const workflowId = params.id as string;
  const runId = params.runId as string;
  const [run, setRun] = useState<Record<string, unknown> | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [cancelling, setCancelling] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [liveThoughts, setLiveThoughts] = useState<ThoughtEntry[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!db || !auth?.currentUser) return;
    const runRef = doc(db, "workflows", workflowId, "runs", runId);
    const unsub = onSnapshot(runRef, (snap) => {
      if (snap.exists() && snap.data()?.owner_uid === auth?.currentUser?.uid) {
        setRun({ id: snap.id, ...snap.data() });
      } else {
        setRun(null);
      }
    });
    return () => unsub();
  }, [workflowId, runId]);

  useEffect(() => {
    if (!db || !auth?.currentUser) return;
    const logsQ = query(
      collection(db, "workflows", workflowId, "runs", runId, "logs"),
      orderBy("timestamp", "asc"),
    );
    const unsub = onSnapshot(logsQ, (snap) => {
      setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as LogEntry));
    });
    return () => unsub();
  }, [workflowId, runId]);

  // Auto-scroll logs to bottom as new entries arrive
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // SSE stream for live thoughts during active run
  useEffect(() => {
    const status = run?.status as string | undefined;
    const isRunning = status === "running" || status === "pending";
    if (!isRunning) return;

    const fetchToken = async () => {
      const user = auth?.currentUser;
      if (!user) return;
      const token = await user.getIdToken();
      const es = new EventSource(
        `${API_URL}/api/run/${workflowId}/${runId}/stream?token=${encodeURIComponent(token)}`
      );
      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          setLiveThoughts((prev) => [...prev, data]);
        } catch { /* ignore */ }
      };
      es.onerror = () => es.close();
      return () => es.close();
    };

    const cleanup = fetchToken();
    return () => { cleanup.then((fn) => fn?.()); };
  }, [run?.status, workflowId, runId]);

  const handleCancel = async () => {
    const status = run?.status as string | undefined;
    if (!run || !status || TERMINAL_STATUSES.has(status)) return;
    setCancelling(true);
    try {
      await apiFetch(`/api/run/${workflowId}/${runId}`, { method: "DELETE" });
    } catch (e) {
      console.error("Cancel failed:", e);
      toast.error("Failed to cancel run");
    } finally {
      setCancelling(false);
    }
  };

  const handleDismiss = async () => {
    setDismissing(true);
    try {
      await apiFetch(`/api/run/${workflowId}/${runId}/dismiss`, { method: "POST" });
    } catch (e) {
      console.error("Dismiss failed:", e);
      toast.error("Failed to dismiss — try again");
    } finally {
      setDismissing(false);
    }
  };

  const handleRetry = async () => {
    setRetrying(true);
    try {
      const resp = await apiFetch(`/api/run/${workflowId}`, { method: "POST", body: JSON.stringify({}) });
      if (!resp.ok) throw new Error(await resp.text());
      const data = await resp.json();
      router.push(`/dashboard/workflows/${workflowId}/runs/${data.run_id}`);
    } catch (e) {
      toast.error(`Failed to retry: ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally {
      setRetrying(false);
    }
  };

  const status = run?.status as string | undefined;
  const isActive = !status || status === "pending" || status === "running";
  const isAwaitingUser = status === "awaiting_user";

  // ── Active run: show border haze + live thoughts + cancel ─────────────────
  if (isActive) {
    return (
      <>
        <div className="echo-run-haze" />
        <div className="echo-run-haze-content">
          <div className="h-12 w-12 animate-spin rounded-full border-2 border-[#A577FF]/50 border-t-[#A577FF]" />
          <p className="animate-pulse text-lg font-bold tracking-wide text-[#150A35] drop-shadow-sm">
            EchoPrism is taking control…
          </p>

          {/* Live thoughts panel */}
          {liveThoughts.length > 0 && (
            <div className="mt-4 w-full max-w-md max-h-48 overflow-y-auto rounded-xl border border-[#A577FF]/30 bg-white/90 backdrop-blur-sm p-3 text-left">
              <div className="flex items-center gap-1.5 mb-2">
                <IconBrain className="h-4 w-4 text-[#A577FF]" />
                <span className="text-xs font-semibold text-[#A577FF]">EchoPrism thinking…</span>
              </div>
              {liveThoughts.slice(-5).map((t, i) => (
                <div key={i} className="mb-2 text-xs">
                  <span className="text-gray-400">Step {t.step_index + 1}: </span>
                  <span className="text-[#150A35]/70">{t.thought.slice(0, 150)}{t.thought.length > 150 ? "…" : ""}</span>
                </div>
              ))}
            </div>
          )}

          {/* Live log entries */}
          {logs.length > 0 && (
            <div className="mt-2 w-full max-w-md max-h-32 overflow-y-auto rounded-xl border border-[#A577FF]/20 bg-[#150A35]/90 p-3 text-left font-mono">
              {logs.slice(-8).map((log) => (
                <div key={log.id} className="text-xs text-white/70 leading-relaxed">
                  {log.message}
                </div>
              ))}
            </div>
          )}

          {status && (
            <span className="mt-2 rounded-full bg-[#A577FF]/20 px-3 py-1 text-sm font-semibold text-[#150A35]">
              {status}
            </span>
          )}
          <button
            type="button"
            onClick={handleCancel}
            disabled={cancelling}
            className="mt-2 rounded-lg border border-[#A577FF]/40 px-4 py-2 text-sm font-medium text-[#150A35] transition-colors hover:border-echo-error hover:bg-echo-error/10 hover:text-echo-error disabled:opacity-40"
          >
            {cancelling ? "Cancelling…" : "Cancel run"}
          </button>
        </div>
      </>
    );
  }

  // ── Awaiting user: agent called CallUser() ───────────────────────────────
  if (isAwaitingUser) {
    const reason = run?.callUserReason as string | undefined;
    return (
      <div className="flex flex-1 overflow-auto">
        <div className="flex h-full w-full flex-1 flex-col items-center justify-center gap-6 rounded-tl-2xl border border-[#A577FF]/20 border-l-0 bg-white p-6 shadow-sm md:p-10">
          <div className="flex flex-col items-center gap-4 max-w-md text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 border border-amber-200">
              <IconUserQuestion className="h-8 w-8 text-amber-500" />
            </div>
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold text-[#150A35]">EchoPrism needs your help</h2>
              <p className="text-sm text-echo-text-muted">
                The agent paused and is waiting for you to take action before it can continue.
              </p>
            </div>
            {reason && (
              <div className="w-full rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3 text-left">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 mb-1">
                  Agent&apos;s reason
                </p>
                <p className="text-sm text-[#150A35]/80 leading-relaxed">{reason}</p>
              </div>
            )}
            <div className="flex items-center gap-3 mt-2">
              <button
                type="button"
                onClick={handleDismiss}
                disabled={dismissing}
                className="cursor-pointer rounded-lg bg-[#A577FF] px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#8B5CF6] disabled:opacity-40"
              >
                {dismissing ? "Dismissing…" : "Mark as done"}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={cancelling}
                className="cursor-pointer rounded-lg border border-[#150A35]/20 px-5 py-2 text-sm font-medium text-[#150A35]/70 transition-colors hover:border-echo-error hover:text-echo-error disabled:opacity-40"
              >
                {cancelling ? "Cancelling…" : "Cancel run"}
              </button>
            </div>
            <Link
              href={`/dashboard/workflows/${workflowId}`}
              className="flex items-center gap-1 text-sm text-echo-text-muted hover:text-[#A577FF] transition-colors"
            >
              <IconArrowLeft className="h-4 w-4" />
              Back to workflow
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Completed / failed / cancelled: show logs ────────────────────────────
  const statusIcon: ReactNode =
    status === "completed" ? (
      <IconCircleCheck className="h-5 w-5 text-echo-success" />
    ) : status === "failed" ? (
      <IconAlertCircle className="h-5 w-5 text-echo-error" />
    ) : status === "awaiting_user" ? (
      <IconUserQuestion className="h-5 w-5 text-amber-500" />
    ) : (
      <IconBan className="h-5 w-5 text-echo-text-muted" />
    );

  const statusColor =
    status === "completed"
      ? "bg-echo-success/15 text-echo-success"
      : status === "failed"
      ? "bg-echo-error/15 text-echo-error"
      : status === "awaiting_user"
      ? "bg-amber-50 text-amber-600"
      : "bg-[#150A35]/10 text-[#150A35]/70";

  return (
    <div className="flex flex-1 overflow-auto">
      <div className="flex h-full w-full flex-1 flex-col gap-4 rounded-tl-2xl border border-[#A577FF]/20 border-l-0 bg-white p-6 shadow-sm md:p-10">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
          <Link
            href={`/dashboard/workflows/${workflowId}`}
            className="cursor-pointer text-[#150A35]/70 hover:text-[#A577FF]"
          >
            <IconArrowLeft className="h-5 w-5" />
          </Link>
            <h1 className="text-xl font-semibold text-[#150A35]">Run Logs</h1>
          </div>
          <div className="flex items-center gap-2">
            {statusIcon}
            <span className={`rounded-full px-3 py-1 text-sm font-medium ${statusColor}`}>
              {status ?? "unknown"}
            </span>
          </div>
        </div>

        {/* Error message + retry if failed */}
        {status === "failed" && (
          <div className="flex items-start justify-between rounded-lg border border-echo-error/30 bg-echo-error/5 px-4 py-3">
            <p className="text-sm text-echo-error flex-1">
              {run?.error != null ? String(run.error) : "Run failed"}
            </p>
                <button
                  type="button"
              onClick={handleRetry}
              disabled={retrying}
              className="ml-4 flex shrink-0 items-center gap-1.5 rounded-lg bg-[#A577FF] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              <IconRefresh className="h-3.5 w-3.5" />
              {retrying ? "Starting…" : "Retry Run"}
                </button>
          </div>
        )}

        {/* Logs */}
        <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-[#A577FF]/20 bg-[#150A35]">
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2">
            <span className="text-xs font-medium text-white/50 uppercase tracking-wider">
              Output
            </span>
            <span className="ml-auto text-xs text-white/30">{logs.length} lines</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 font-mono text-sm">
          {logs.length === 0 ? (
              <p className="text-white/30">No log output.</p>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="flex gap-3 leading-relaxed">
                  {formatTimestamp(log.timestamp) && (
                    <span className="shrink-0 text-white/30 text-xs mt-0.5">
                      {formatTimestamp(log.timestamp)}
                    </span>
                  )}
                  <span
                    className={
                      log.level === "error"
                        ? "text-echo-error"
                        : log.level === "warn"
                        ? "text-yellow-400"
                        : "text-white/80"
                    }
                  >
                  {log.message}
                  </span>
                </div>
              ))
            )}
              <div ref={logsEndRef} />
            </div>
        </div>
      </div>
    </div>
  );
}
