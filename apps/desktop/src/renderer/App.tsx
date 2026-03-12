import { useState, useEffect, useRef, useCallback } from "react";
import {
  IconPlayerPlay,
  IconPlayerPause,
  IconUpload,
  IconPlayerRecord,
  IconLogin,
  IconLogout,
  IconTrash,
  IconExternalLink,
  IconRefresh,
  IconPhoneCall,
  IconSend,
  IconCalendarClock,
  IconChevronRight,
  IconChevronLeft,
  IconSun,
  IconMoon,
  IconDots,
  IconMenu2,
  IconPencil,
  IconInfoSmall,
  IconSparkles,
  IconPower,
} from "@tabler/icons-react";
import RecordingHud from "./RecordingHud";
import { EchoPrismLiveKitSession } from "./EchoPrismLiveKitSession";
import RunHud from "./RunHud";
import RunLogsSection from "./RunLogsSection";
import HazeOverlay from "./HazeOverlay";
import WorkflowDetailView from "./WorkflowDetailView";
import WorkflowEditView from "./WorkflowEditView";
import ScheduleView from "./ScheduleView";
import echoLogo from "./assets/echo_logo.png";
import GradientText from "./reactbits/GradientText";
import ShinyText from "./reactbits/ShinyText";
import SpotlightCard from "./reactbits/SpotlightCard";
import Orb from "./reactbits/Orb";
import { useTheme } from "./useTheme";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import AnimatedList from "@/components/AnimatedList";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AnimatePresence, motion } from "motion/react";

declare global {
  interface Window {
    electronAPI?: {
      getSources: () => Promise<
        { id: string; name: string; thumbnail: string }[]
      >;
      getPrimarySourceId: () => Promise<string | null>;
      createRun: (args: {
        workflowId: string;
        token: string;
      }) => Promise<{ runId: string; workflowId: string } | { error: string }>;
      runWorkflowLocal: (args: {
        steps: Array<Record<string, unknown>>;
        sourceId: string;
        workflowType?: string;
        workflowId?: string;
        runId?: string;
        token?: string;
      }) => Promise<{ success: boolean; error?: string; progress?: string[] }>;
      fetchWorkflow: (args: { workflowId: string; token?: string }) => Promise<
        | {
            workflow: Record<string, unknown>;
            steps: Array<Record<string, unknown>>;
          }
        | { error: string }
      >;
      authGetToken: () => Promise<string | null>;
      authClearToken: () => Promise<void>;
      authOpenSignin: () => Promise<void>;
      onAuthTokenReceived: (callback: () => void) => void;
      removeAuthTokenReceivedListener: () => void;
      onScreenPermissionRequired: (callback: () => void) => void;
      checkScreenPermission: () => Promise<boolean>;
      openSystemSettings: () => Promise<void>;
      listWorkflows: (args: { token: string }) => Promise<
        | {
            workflows: Array<{
              id: string;
              name?: string;
              status?: string;
              workflow_type?: string;
            }>;
          }
        | { error: string }
      >;
      openWebUI: (path?: string) => Promise<void>;
      pauseRun: () => Promise<{ ok: boolean }>;
      resumeRun: () => Promise<{ ok: boolean }>;
      cancelRun: () => Promise<void>;
      sendInterrupt: (text: string) => Promise<void>;
      onRunProgress: (
        cb: (entry: { thought: string; action: string; step: number }) => void,
      ) => void;
      removeRunProgressListener: () => void;
      onRunFromUrl: (
        cb: (arg: { workflowId: string; runId: string }) => void,
      ) => void;
      removeRunFromUrlListener: () => void;
      onOpenEchoPrism: (callback: () => void) => void;
      removeOpenEchoPrismListener: () => void;
      onStartCapture: (callback: () => void) => void;
      removeStartCaptureListener: () => void;
      enterRecordingMode: () => Promise<{ ok: boolean }>;
      exitRecordingMode: () => Promise<{ ok: boolean }>;
      enterRunMode: (ctx: {
        workflowId: string;
        runId: string;
        token: string;
      }) => Promise<{ ok: boolean }>;
      exitRunMode: () => Promise<{ ok: boolean }>;
      onRecordingCommand: (cb: (payload: { action: string }) => void) => void;
      removeRecordingCommandListener: () => void;
      recordingPause: () => Promise<void>;
      recordingStop: (duration?: number) => Promise<void>;
      recordingRedo: () => Promise<void>;
      recordingDiscard: () => Promise<void>;
      sendCallUserFeedback: (text: string) => Promise<{ ok: boolean }>;
      onRunAwaitingUser: (cb: (arg: { reason: string }) => void) => void;
      removeRunAwaitingUserListener: () => void;
      desktopCollapse: () => Promise<void>;
      desktopExpand: () => Promise<void>;
      onDesktopStateChanged: (
        callback: (arg: { collapsed: boolean }) => void,
      ) => void;
      removeDesktopStateChangedListener: () => void;
      quitApp: () => Promise<void>;
    };
  }
}

function useWindowType(): { windowType: string; mode: string } {
  const [params, setParams] = useState({ windowType: "", mode: "" });
  useEffect(() => {
    const search = typeof window !== "undefined" ? window.location.search : "";
    const p = new URLSearchParams(search);
    setParams({
      windowType: p.get("windowType") ?? "",
      mode: p.get("mode") ?? "",
    });
  }, []);
  return params;
}

const API_URL =
  (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ??
  "http://localhost:8000";
const AGENT_URL =
  (import.meta as { env?: { VITE_ECHO_AGENT_URL?: string } }).env
    ?.VITE_ECHO_AGENT_URL ?? API_URL;

function MainWindowApp() {
  const { theme, toggleTheme } = useTheme();
  const [screenPermissionRequired, setScreenPermissionRequired] =
    useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [workflows, setWorkflows] = useState<
    Array<{
      id: string;
      name?: string;
      status?: string;
      workflow_type?: string;
    }>
  >([]);
  const [workflowsLoading, setWorkflowsLoading] = useState(false);
  const [workflowsError, setWorkflowsError] = useState("");
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>("");
  const [selectedWorkflowType, setSelectedWorkflowType] =
    useState<string>("desktop");
  const [workflow, setWorkflow] = useState<Record<string, unknown> | null>(
    null,
  );
  const [steps, setSteps] = useState<Array<Record<string, unknown>>>([]);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [running, setRunning] = useState(false);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [runPaused, setRunPaused] = useState(false);
  const [interruptText, setInterruptText] = useState("");
  const [sendingInterrupt, setSendingInterrupt] = useState(false);
  const [runResult, setRunResult] = useState<{
    success: boolean;
    error?: string;
    progress?: string[];
    runId?: string;
    workflowId?: string;
  } | null>(null);
  const [runResultDismissed, setRunResultDismissed] = useState(false);
  const [liveProgress, setLiveProgress] = useState<
    Array<{ thought: string; action: string; step: number }>
  >([]);
  const [echoPrismModalOpen, setEchoPrismModalOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const [recording, setRecording] = useState(false);
  const [recordingPaused, setRecordingPaused] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedDuration, setRecordedDuration] = useState(0);
  const [recordStatus, setRecordStatus] = useState("");
  const [recordError, setRecordError] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const recordingDurationRef = useRef<number>(0);

  // Navigation
  const [page, setPage] = useState<"home" | "detail" | "edit" | "schedule">(
    "home",
  );

  const loadToken = useCallback(async () => {
    const t = await window.electronAPI?.authGetToken();
    setToken(t ?? null);
    return t ?? null;
  }, []);

  const refreshAuth = useRef<() => void>(() => {});
  refreshAuth.current = async () => {
    const t = await loadToken();
    if (t) loadWorkflows();
  };

  const loadWorkflows = useCallback(async () => {
    const t = token ?? (await loadToken());
    if (!t) return;
    setWorkflowsLoading(true);
    setWorkflowsError("");
    try {
      const result = await window.electronAPI?.listWorkflows({ token: t });
      if (result && "error" in result) {
        if (result.error?.includes("401")) {
          await window.electronAPI?.authClearToken?.();
          setToken(null);
          setWorkflows([]);
          return;
        }
        setWorkflowsError(result.error ?? "");
        setWorkflows([]);
      } else if (result && "workflows" in result) {
        setWorkflows(result.workflows ?? []);
      }
    } finally {
      setWorkflowsLoading(false);
    }
  }, [token, loadToken]);

  const getPrimarySourceId = useCallback(async (): Promise<string | null> => {
    return (await window.electronAPI?.getPrimarySourceId?.()) ?? null;
  }, []);

  // Permission screen: poll to auto-dismiss when user grants permission
  useEffect(() => {
    if (!screenPermissionRequired) return;
    const interval = setInterval(async () => {
      const granted = await window.electronAPI?.checkScreenPermission?.();
      if (granted) setScreenPermissionRequired(false);
    }, 2000);
    return () => clearInterval(interval);
  }, [screenPermissionRequired]);

  useEffect(() => {
    loadToken();
  }, [loadToken]);

  useEffect(() => {
    const handler = () => refreshAuth.current();
    window.electronAPI?.onAuthTokenReceived?.(handler);
    return () => window.electronAPI?.removeAuthTokenReceivedListener?.();
  }, []);

  useEffect(() => {
    const onFocus = () => refreshAuth.current();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  useEffect(() => {
    if (token) loadWorkflows();
    else setWorkflows([]);
  }, [token, loadWorkflows]);

  // Shared handler for run-from-url (web opens desktop) and voice-run (LiveKit run_started)
  const handleRunStarted = useCallback(
    async (arg: { workflowId: string; runId: string }) => {
      const t = token ?? (await loadToken());
      if (!t) return;
      const hasPermission = await window.electronAPI?.checkScreenPermission?.();
      if (!hasPermission) {
        setScreenPermissionRequired(true);
        return;
      }
      const result = await window.electronAPI?.fetchWorkflow?.({
        workflowId: arg.workflowId,
        token: t,
      });
      if (!result || "error" in result) return;
      const { workflow, steps } = result;
      if (!steps?.length) return;
      const sourceId = await getPrimarySourceId();
      if (!sourceId) return;
      setSelectedWorkflowId(arg.workflowId);
      setWorkflow(workflow);
      setSteps(steps);
      setRunning(true);
      setRunResult(null);
      setRunResultDismissed(false);
      setLiveProgress([]);
      setCurrentRunId(arg.runId);
      window.electronAPI?.onRunProgress?.(
        (entry: { thought: string; action: string; step: number }) =>
          setLiveProgress((prev) => [...prev, entry]),
      );
      try {
        await window.electronAPI?.enterRunMode?.({
          workflowId: arg.workflowId,
          runId: arg.runId,
          token: t,
        });
        const runResult = await window.electronAPI?.runWorkflowLocal?.({
          steps,
          sourceId,
          workflowType:
            (workflow as { workflow_type?: string }).workflow_type ?? "desktop",
          workflowId: arg.workflowId,
          runId: arg.runId,
          token: t,
        });
        window.electronAPI?.removeRunProgressListener?.();
        setRunResult({
          ...(runResult ?? { success: false, error: "No response" }),
          workflowId: arg.workflowId,
          runId: arg.runId,
        });
      } finally {
        setRunning(false);
        setRunPaused(false);
        setCurrentRunId(null);
        window.electronAPI?.removeRunProgressListener?.();
        await window.electronAPI?.exitRunMode?.();
      }
    },
    [token, loadToken, getPrimarySourceId],
  );

  // Handle run-from-url (web opens desktop)
  useEffect(() => {
    window.electronAPI?.onRunFromUrl?.(handleRunStarted);
    return () => window.electronAPI?.removeRunFromUrlListener?.();
  }, [handleRunStarted]);

  // Handle open-echoprism (web opens EchoPrism modal)
  useEffect(() => {
    window.electronAPI?.onOpenEchoPrism?.(() => setEchoPrismModalOpen(true));
    return () => window.electronAPI?.removeOpenEchoPrismListener?.();
  }, []);

  // Handle start-capture (web opens desktop and starts recording)
  const startRecordingRef = useRef<() => Promise<void>>(() =>
    Promise.resolve(),
  );
  useEffect(() => {
    window.electronAPI?.onStartCapture?.(() => startRecordingRef.current());
    return () => window.electronAPI?.removeStartCaptureListener?.();
  }, []);

  // Sync collapse state from main process
  useEffect(() => {
    window.electronAPI?.onDesktopStateChanged?.((arg) =>
      setIsCollapsed(arg.collapsed),
    );
    return () => window.electronAPI?.removeDesktopStateChangedListener?.();
  }, []);

  const handleSignIn = () => {
    window.electronAPI?.authOpenSignin?.();
  };

  const handleSignOut = async () => {
    await window.electronAPI?.authClearToken?.();
    setToken(null);
    setWorkflow(null);
    setSteps([]);
    setSelectedWorkflowId("");
    setSelectedWorkflowType("desktop");
  };

  const handleSelectWorkflow = async (workflowId: string) => {
    setSelectedWorkflowId(workflowId);
    const wf = workflows.find((w) => w.id === workflowId);
    setSelectedWorkflowType(wf?.workflow_type ?? "desktop");
    if (!token) return;
    setFetching(true);
    setFetchError("");
    setWorkflow(null);
    setSteps([]);
    try {
      const result = await window.electronAPI?.fetchWorkflow({
        workflowId,
        token,
      });
      if (result && "error" in result) {
        if (result.error?.includes("401")) {
          await window.electronAPI?.authClearToken?.();
          setToken(null);
          return;
        }
        setFetchError(result.error ?? "");
      } else if (result && "workflow" in result) {
        setWorkflow(result.workflow);
        setSteps(result.steps ?? []);
      }
    } finally {
      setFetching(false);
    }
  };

  // Main window: receive recording commands from HUD (forwarded via Main Process)
  useEffect(() => {
    const handler = (payload: { action: string; duration?: number }) => {
      if (payload.action === "pause") pauseResumeRecording();
      if (payload.action === "stop") {
        stopRecording(payload.duration);
        window.electronAPI?.exitRecordingMode?.();
      }
      if (payload.action === "discard") {
        discardRecording();
        window.electronAPI?.exitRecordingMode?.();
      }
      if (payload.action === "redo") redoRecording();
    };
    window.electronAPI?.onRecordingCommand?.(handler);
    return () => window.electronAPI?.removeRecordingCommandListener?.();
  }, []);

  const startRecording = async () => {
    setRecordError("");
    setRecordedBlob(null);
    const hasPermission = await window.electronAPI?.checkScreenPermission?.();
    if (!hasPermission) {
      setScreenPermissionRequired(true);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });
      const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : MediaRecorder.isTypeSupported("video/webm")
          ? "video/webm"
          : "video/mp4";
      const recorder = new MediaRecorder(stream, { mimeType: mime });

      // Use a local array per recording session — avoids stale-ref bug when
      // a new recording starts before the previous onstop fires.
      const localChunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size) localChunks.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecordedBlob(
          new Blob(localChunks, { type: recorder.mimeType || "video/webm" }),
        );
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1000);
      setRecording(true);
      setRecordingDuration(0);
      recordingDurationRef.current = 0;
      recordingIntervalRef.current = setInterval(() => {
        setRecordingDuration((d) => {
          const next = d + 1;
          recordingDurationRef.current = next;
          return next;
        });
      }, 1000);
      await window.electronAPI?.enterRecordingMode?.();
    } catch (e) {
      setRecordError(
        e instanceof Error ? e.message : "Could not start recording",
      );
    }
  };
  startRecordingRef.current = startRecording;

  const stopRecording = (durationFromHud?: number) => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.stop();
      setRecordedDuration(durationFromHud ?? recordingDurationRef.current);
      setRecording(false);
      setRecordingPaused(false);
    }
  };

  const pauseResumeRecording = () => {
    const rec = mediaRecorderRef.current;
    if (!rec) return;
    if (rec.state === "recording") {
      rec.pause();
      setRecordingPaused(true);
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
    } else if (rec.state === "paused") {
      rec.resume();
      setRecordingPaused(false);
      recordingIntervalRef.current = setInterval(() => {
        setRecordingDuration((d) => {
          const next = d + 1;
          recordingDurationRef.current = next;
          return next;
        });
      }, 1000);
    }
  };

  const discardRecording = () => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.stop();
    }
    mediaRecorderRef.current = null;
    setRecording(false);
    setRecordingPaused(false);
    setRecordedBlob(null);
    setRecordingDuration(0);
    setRecordedDuration(0);
    setRecordError("");
    setRecordStatus("");
  };

  const redoRecording = () => {
    discardRecording();
    startRecording();
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const uploadAndSynthesize = async () => {
    if (!recordedBlob || !token) return;
    setRecordStatus("Uploading recording…");
    setRecordError("");
    const apiBase = API_URL.replace(/\/$/, "");
    const agentBase = AGENT_URL.replace(/\/$/, "");
    try {
      const ext = recordedBlob.type.includes("webm") ? "webm" : "mp4";
      const filename = `recording-${Date.now()}.${ext}`;
      const formData = new FormData();
      formData.append("video", recordedBlob, filename);
      const uploadRes = await fetch(`${apiBase}/api/storage/upload-recording`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!uploadRes.ok) {
        if (uploadRes.status === 401) {
          await window.electronAPI?.authClearToken?.();
          setToken(null);
          throw new Error("Session expired. Please sign in again.");
        }
        const d = await uploadRes.json().catch(() => ({}));
        throw new Error(
          (d as { detail?: string }).detail || "Failed to upload recording",
        );
      }
      const { gcs_path } = (await uploadRes.json()) as { gcs_path: string };
      setRecordStatus("Synthesizing workflow…");
      const synthFormData = new FormData();
      synthFormData.append("video_gcs_path", gcs_path);
      const synthRes = await fetch(`${agentBase}/api/synthesize`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: synthFormData,
      });
      if (!synthRes.ok) {
        const d = await synthRes.json().catch(() => ({}));
        throw new Error(
          (d as { detail?: string }).detail || "Synthesis failed",
        );
      }
      const { workflow_id } = (await synthRes.json()) as {
        workflow_id: string;
      };
      setRecordStatus(`Created workflow ${workflow_id}`);
      setRecordedBlob(null);
      loadWorkflows();
    } catch (e) {
      setRecordError(
        e instanceof Error ? e.message : "Upload/synthesis failed",
      );
    } finally {
      setTimeout(() => setRecordStatus(""), 3000);
    }
  };

  const handleRun = async () => {
    if (steps.length === 0 || !token) return;
    const hasPermission = await window.electronAPI?.checkScreenPermission?.();
    if (!hasPermission) {
      setScreenPermissionRequired(true);
      return;
    }
    const sourceId = await getPrimarySourceId();
    if (!sourceId) {
      setRunResult({ success: false, error: "Could not get primary display" });
      return;
    }
    setRunning(true);
    setRunResult(null);
    setRunResultDismissed(false);
    setLiveProgress([]);

    window.electronAPI?.onRunProgress(
      (entry: { thought: string; action: string; step: number }) => {
        setLiveProgress((prev) => [...prev, entry]);
      },
    );

    try {
      const createRes = await window.electronAPI?.createRun?.({
        workflowId: selectedWorkflowId,
        token,
      });
      if (createRes && "error" in createRes) {
        setRunResult({
          success: false,
          error: createRes.error,
          workflowId: selectedWorkflowId,
        });
        return;
      }
      const runId =
        createRes && "runId" in createRes ? createRes.runId : undefined;
      setCurrentRunId(runId ?? null);

      await window.electronAPI?.enterRunMode?.({
        workflowId: selectedWorkflowId,
        runId: runId ?? "",
        token,
      });

      const result = await window.electronAPI?.runWorkflowLocal({
        steps,
        sourceId,
        workflowType: selectedWorkflowType,
        workflowId: selectedWorkflowId,
        runId,
        token,
      });
      window.electronAPI?.removeRunProgressListener();
      setRunResult({
        ...(result ?? { success: false, error: "No response" }),
        workflowId: selectedWorkflowId,
        runId,
      });
    } finally {
      setRunning(false);
      setRunPaused(false);
      setCurrentRunId(null);
      window.electronAPI?.removeRunProgressListener?.();
      await window.electronAPI?.exitRunMode?.();
    }
  };

  const handleCancelRun = async () => {
    if (!selectedWorkflowId || !currentRunId || !token) return;
    window.electronAPI?.resumeRun();
    try {
      const base = API_URL.replace(/\/$/, "");
      const res = await fetch(
        `${base}/api/run/${selectedWorkflowId}/${currentRunId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!res.ok) throw new Error("Cancel failed");
    } catch {
      // Non-fatal: agent may have already finished
    }
  };

  /** Run a workflow from any page (detail view, home, etc.) */
  const handleRunWorkflow = async (args: {
    workflowId: string;
    steps: Array<Record<string, unknown>>;
    workflowType: string;
  }) => {
    if (!args.steps.length || !token) return;
    const hasPermission = await window.electronAPI?.checkScreenPermission?.();
    if (!hasPermission) {
      setScreenPermissionRequired(true);
      return;
    }
    const sourceId = await getPrimarySourceId();
    if (!sourceId) {
      setRunResult({ success: false, error: "Could not get primary display" });
      return;
    }
    setRunning(true);
    setRunResult(null);
    setRunResultDismissed(false);
    setLiveProgress([]);
    setSelectedWorkflowId(args.workflowId);
    setSelectedWorkflowType(args.workflowType);

    window.electronAPI?.onRunProgress(
      (entry: { thought: string; action: string; step: number }) => {
        setLiveProgress((prev) => [...prev, entry]);
      },
    );

    try {
      const createRes = await window.electronAPI?.createRun?.({
        workflowId: args.workflowId,
        token,
      });
      if (createRes && "error" in createRes) {
        setRunResult({
          success: false,
          error: createRes.error,
          workflowId: args.workflowId,
        });
        return;
      }
      const runId =
        createRes && "runId" in createRes ? createRes.runId : undefined;
      setCurrentRunId(runId ?? null);

      await window.electronAPI?.enterRunMode?.({
        workflowId: args.workflowId,
        runId: runId ?? "",
        token,
      });

      const result = await window.electronAPI?.runWorkflowLocal({
        steps: args.steps,
        sourceId,
        workflowType: args.workflowType,
        workflowId: args.workflowId,
        runId,
        token,
      });
      window.electronAPI?.removeRunProgressListener();
      setRunResult({
        ...(result ?? { success: false, error: "No response" }),
        workflowId: args.workflowId,
        runId,
      });
    } finally {
      setRunning(false);
      setRunPaused(false);
      setCurrentRunId(null);
      window.electronAPI?.removeRunProgressListener?.();
      await window.electronAPI?.exitRunMode?.();
    }
  };

  const handleInterrupt = async () => {
    if (!interruptText.trim() || !selectedWorkflowId || !currentRunId || !token)
      return;
    setSendingInterrupt(true);
    try {
      const base = API_URL.replace(/\/$/, "");
      const res = await fetch(
        `${base}/api/run/${selectedWorkflowId}/${currentRunId}/redirect`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ instruction: interruptText.trim() }),
        },
      );
      if (!res.ok) throw new Error("Failed to send");
      setInterruptText("");
    } catch {
      // Ignore
    } finally {
      setSendingInterrupt(false);
    }
  };

  if (screenPermissionRequired) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          padding: 32,
          background: "var(--echo-bg)",
        }}
      >
        <div
          className="echo-card"
          style={{
            maxWidth: 440,
            width: "100%",
            padding: 32,
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "rgba(165,119,255,0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 20px",
              fontSize: 28,
            }}
          >
            🖥️
          </div>
          <h1
            style={{
              fontSize: "1.25rem",
              fontWeight: 700,
              color: "var(--echo-text)",
              marginBottom: 8,
            }}
          >
            Screen Recording Required
          </h1>
          <p
            style={{
              fontSize: 14,
              color: "var(--echo-text-secondary)",
              marginBottom: 8,
              lineHeight: 1.6,
            }}
          >
            Echo needs permission to record your screen in order to capture
            workflows and run automations.
          </p>
          <p
            style={{
              fontSize: 13,
              color: "var(--echo-text-secondary)",
              marginBottom: 24,
              lineHeight: 1.6,
            }}
          >
            Go to{" "}
            <strong style={{ color: "var(--echo-text)" }}>
              System Settings → Privacy &amp; Security → Screen Recording
            </strong>{" "}
            and enable Echo.
          </p>
          <button
            type="button"
            className="echo-btn-primary"
            style={{ width: "100%", marginBottom: 16 }}
            onClick={() => window.electronAPI?.openSystemSettings?.()}
          >
            Open System Settings
          </button>
          <p
            style={{
              fontSize: 12,
              color: "#9ca3af",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#A577FF",
                animation: "echo-pulse 1.2s ease-in-out infinite",
              }}
            />
            Waiting for permission — will continue automatically once granted
          </p>
        </div>
      </div>
    );
  }

  if (!token) {
    const isDark = theme === "dark";
    return (
      <div
        style={{
          position: "relative",
          minHeight: "100vh",
          overflow: "hidden",
          background: isDark
            ? "linear-gradient(135deg, #150a35 0%, #2d1b69 50%, #0d0620 100%)"
            : "linear-gradient(135deg, #f5f0ff 0%, #ede5fc 50%, #e8e0f5 100%)",
        }}
      >
        <button
          type="button"
          className="echo-theme-toggle"
          onClick={toggleTheme}
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            zIndex: 10,
          }}
        >
          {isDark ? <IconSun size={18} /> : <IconMoon size={18} />}
        </button>
        <div
          style={{
            position: "relative",
            zIndex: 1,
            padding: 32,
            maxWidth: 400,
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
          }}
        >
          <div
            style={{
              background: isDark
                ? "rgba(255, 255, 255, 0.08)"
                : "rgba(255, 255, 255, 0.9)",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              border: isDark
                ? "1px solid rgba(255, 255, 255, 0.12)"
                : "1px solid rgba(165, 119, 255, 0.2)",
              borderRadius: 24,
              padding: 40,
              width: "100%",
              boxShadow: isDark
                ? "0 8px 32px rgba(0, 0, 0, 0.2)"
                : "0 8px 32px rgba(165, 119, 255, 0.12)",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 20,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <img
                  src={echoLogo}
                  alt="Echo"
                  width={56}
                  height={56}
                  style={{ width: 56, height: 56, objectFit: "contain" }}
                />
                <GradientText
                  colors={["#A577FF", "#21C4DD", "#A577FF"]}
                  animationSpeed={6}
                >
                  <h1
                    style={{ fontSize: "1.75rem", fontWeight: 700, margin: 0 }}
                  >
                    Echo Desktop
                  </h1>
                </GradientText>
              </div>
              <p
                style={{
                  color: isDark
                    ? "rgba(255, 255, 255, 0.75)"
                    : "var(--echo-text-secondary)",
                  fontSize: 14,
                  textAlign: "center",
                  margin: 0,
                  lineHeight: 1.5,
                }}
              >
                Sign in to access/run workflows
              </p>
              <button
                type="button"
                className="echo-btn-cyan-lavender"
                onClick={handleSignIn}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  padding: "14px 24px",
                  borderRadius: 12,
                  fontSize: 15,
                  fontWeight: 600,
                }}
              >
                <IconLogin size={20} />
                Sign in
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleRunFromList = async (w: {
    id: string;
    workflow_type?: string;
  }) => {
    const t = token ?? (await loadToken());
    if (!t) return;
    const result = await window.electronAPI?.fetchWorkflow?.({
      workflowId: w.id,
      token: t,
    });
    if (!result || "error" in result) return;
    const { workflow, steps } = result;
    if (!steps?.length) return;
    await handleRunWorkflow({
      workflowId: w.id,
      steps,
      workflowType:
        (workflow as { workflow_type?: string }).workflow_type ?? "desktop",
    });
  };

  const handleDeleteWorkflow = async (workflowId: string) => {
    if (!confirm("Delete this workflow? This cannot be undone.")) return;
    if (!token) return;
    try {
      const base = API_URL.replace(/\/$/, "");
      const res = await fetch(
        `${base}/api/workflows/${encodeURIComponent(workflowId)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!res.ok) throw new Error("Failed to delete workflow");
      loadWorkflows();
      if (selectedWorkflowId === workflowId) {
        setSelectedWorkflowId("");
        setWorkflow(null);
        setSteps([]);
        setPage("home");
      }
    } catch {
      // Non-fatal
    }
  };

  const handleCollapse = () => {
    window.electronAPI?.desktopCollapse?.();
  };

  const handleExpand = () => {
    window.electronAPI?.desktopExpand?.();
  };

  return (
    <>
      <TooltipProvider>
        <AnimatePresence mode="wait">
          {isCollapsed ? (
            <button
              key="collapsed"
              type="button"
              onClick={handleExpand}
              style={{
                position: "fixed",
                inset: 0,
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 14,
                cursor: "pointer",
                border: "none",
                background:
                  theme === "dark"
                    ? "rgba(21, 10, 53, 0.92)"
                    : "rgba(255, 255, 255, 0.98)",
                boxShadow:
                  theme === "dark"
                    ? "0 4px 24px rgba(0,0,0,0.35), 0 0 0 1px rgba(165, 119, 255, 0.2)"
                    : "0 6px 28px rgba(165, 119, 255, 0.25), 0 0 0 1px rgba(165, 119, 255, 0.15)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "scale(1.06)";
                e.currentTarget.style.boxShadow =
                  theme === "dark"
                    ? "0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(165, 119, 255, 0.3)"
                    : "0 8px 32px rgba(165, 119, 255, 0.35), 0 0 0 1px rgba(165, 119, 255, 0.25)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "scale(1)";
                e.currentTarget.style.boxShadow =
                  theme === "dark"
                    ? "0 4px 24px rgba(0,0,0,0.35), 0 0 0 1px rgba(165, 119, 255, 0.2)"
                    : "0 6px 28px rgba(165, 119, 255, 0.25), 0 0 0 1px rgba(165, 119, 255, 0.15)";
              }}
              title="Expand"
            >
              <img
                src={echoLogo}
                alt="Echo"
                width={36}
                height={36}
                style={{ width: 36, height: 36, objectFit: "contain" }}
              />
            </button>
          ) : (
            <div
              key="expanded"
              style={{
                position: "relative",
                zIndex: 1,
                padding: 16,
                width: "100%",
                minHeight: "100vh",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}
            >
              {/* Header — collapse, icon-only Start Capture, dropdown, theme toggle */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 20,
                  gap: 8,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    cursor: "pointer",
                    flex: 1,
                    minWidth: 0,
                  }}
                  onClick={() => setPage("home")}
                >
                  <img
                    src={echoLogo}
                    alt="Echo"
                    width={36}
                    height={36}
                    style={{
                      width: 36,
                      height: 36,
                      objectFit: "contain",
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <GradientText
                      colors={["#A577FF", "#7C3AED", "#21C4DD", "#A577FF"]}
                      animationSpeed={6}
                    >
                      <h1
                        style={{
                          fontSize: "1.1rem",
                          fontWeight: 700,
                          margin: 0,
                        }}
                      >
                        Echo
                      </h1>
                    </GradientText>
                    <p
                      style={{
                        fontSize: 11,
                        color: "var(--echo-text-muted)",
                        margin: 0,
                      }}
                    >
                      {workflows.length} workflow
                      {workflows.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    flexShrink: 0,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setEchoPrismModalOpen(true)}
                    title="EchoPrism"
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      padding: 0,
                      border: "none",
                      cursor: "pointer",
                      overflow: "hidden",
                      flexShrink: 0,
                      boxShadow: "0 2px 12px rgba(165,119,255,0.35)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "scale(1.08)";
                      e.currentTarget.style.boxShadow =
                        "0 4px 16px rgba(165,119,255,0.45)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "scale(1)";
                      e.currentTarget.style.boxShadow =
                        "0 2px 12px rgba(165,119,255,0.35)";
                    }}
                  >
                    <div style={{ width: "100%", height: "100%" }}>
                      <Orb
                        hue={0}
                        hoverIntensity={0.3}
                        rotateOnHover
                        forceHoverState={false}
                        backgroundColor={
                          theme === "dark" ? "#0a0414" : "#f5f0ff"
                        }
                      />
                    </div>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleTheme}
                    className="h-8 w-8 rounded-lg"
                    title={
                      theme === "dark"
                        ? "Switch to light mode"
                        : "Switch to dark mode"
                    }
                  >
                    {theme === "dark" ? (
                      <IconSun size={18} />
                    ) : (
                      <IconMoon size={18} />
                    )}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg"
                        title="Menu"
                      >
                        <IconMenu2 size={18} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="w-48 bg-[var(--echo-surface-solid)] text-[var(--echo-text)] border border-[var(--echo-border)] shadow-lg"
                    >
                      <DropdownMenuItem
                        onClick={() => setEchoPrismModalOpen(true)}
                      >
                        <IconSparkles size={16} />
                        EchoPrism
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setPage(page === "schedule" ? "home" : "schedule");
                        }}
                      >
                        <IconCalendarClock size={16} />
                        Schedule
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => window.electronAPI?.openWebUI?.()}
                      >
                        <IconExternalLink size={16} />
                        Open in web
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleSignOut}>
                        <IconLogout size={16} />
                        Sign out
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => window.electronAPI?.quitApp?.()}
                      >
                        <IconPower size={16} />
                        Quit
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg"
                        onClick={handleCollapse}
                        title="Collapse to side"
                      >
                        <IconChevronLeft size={18} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Collapse to side</TooltipContent>
                  </Tooltip>
                </div>
              </div>

              {/* Page-based content */}
              {page === "home" && (
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    minHeight: 0,
                    overflow: "hidden",
                  }}
                >
                  {/* Start Capture — gradient button */}
                  <div style={{ marginBottom: 20 }}>
                    {!recording && !recordedBlob && (
                      <button
                        type="button"
                        onClick={startRecording}
                        className="echo-btn-cyan-lavender w-full flex items-center justify-center gap-2 rounded-lg px-4 py-3 font-medium text-white"
                      >
                        <IconPlayerRecord size={18} />
                        Start Capture
                      </button>
                    )}

                    {/* Review state: recording stopped, blob ready */}
                    {!recording && recordedBlob && (
                      <div className="echo-recording-bar rounded-lg border border-[#A577FF]/20 bg-[#F5F7FC] dark:bg-[#150A35]/30 p-4 flex items-center gap-4">
                        <span
                          style={{
                            fontSize: 13,
                            color: "var(--echo-text-secondary)",
                            flexGrow: 1,
                          }}
                        >
                          Recording ready — {formatDuration(recordedDuration)}
                        </span>
                        <button
                          type="button"
                          className="echo-btn-cyan-lavender flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed"
                          onClick={uploadAndSynthesize}
                          disabled={!!recordStatus}
                        >
                          <IconUpload size={16} />
                          {recordStatus || "Synthesize workflow"}
                        </button>
                        <button
                          type="button"
                          className="echo-btn-danger flex shrink-0 items-center justify-center rounded-lg p-2"
                          onClick={discardRecording}
                          title="Discard"
                          aria-label="Discard"
                        >
                          <IconTrash size={16} />
                        </button>
                      </div>
                    )}

                    {(recordError || recordStatus) && (
                      <p
                        style={{
                          color: recordError
                            ? "var(--echo-error)"
                            : "var(--echo-success)",
                          fontSize: 13,
                          marginTop: 8,
                        }}
                      >
                        {recordError || recordStatus}
                      </p>
                    )}
                  </div>

                  {/* Workflows list */}
                  <SpotlightCard style={{ padding: 20, marginBottom: 20 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 12,
                      }}
                    >
                      <h2
                        style={{
                          fontSize: "1rem",
                          fontWeight: 600,
                          color: "var(--echo-lavender)",
                          margin: 0,
                        }}
                      >
                        Workflows
                      </h2>
                      <button
                        type="button"
                        onClick={loadWorkflows}
                        disabled={workflowsLoading}
                        title="Refresh workflows"
                        style={{
                          background: "none",
                          border: "none",
                          cursor: workflowsLoading ? "not-allowed" : "pointer",
                          color: "#A577FF",
                          padding: 4,
                          display: "flex",
                          alignItems: "center",
                        }}
                      >
                        <IconRefresh
                          size={18}
                          style={{
                            animation: workflowsLoading
                              ? "echo-spin 1s linear infinite"
                              : "none",
                            opacity: workflowsLoading ? 0.5 : 1,
                          }}
                        />
                      </button>
                    </div>
                    {workflowsLoading ? (
                      <p
                        style={{
                          color: "var(--echo-text-secondary)",
                          fontSize: 14,
                        }}
                      >
                        Loading workflows…
                      </p>
                    ) : workflowsError ? (
                      <p style={{ color: "#ef4444", fontSize: 14 }}>
                        {workflowsError}
                      </p>
                    ) : workflows.length === 0 ? (
                      <p
                        style={{
                          color: "var(--echo-text-secondary)",
                          fontSize: 14,
                        }}
                      >
                        No workflows yet. Record a screen to create one.
                      </p>
                    ) : (
                      <AnimatedList
                        items={workflows}
                        showGradients={true}
                        onItemSelect={(w: {
                          id: string;
                          workflow_type?: string;
                        }) => handleRunFromList(w)}
                        renderItem={(w: {
                          id: string;
                          name?: string;
                          workflow_type?: string;
                        }) => (
                          <div
                            key={w.id}
                            className="group/workflow"
                            style={{
                              padding: "10px 12px",
                              borderRadius: 8,
                              border: "1px solid rgba(165,119,255,0.12)",
                              background: "var(--echo-surface)",
                              display: "flex",
                              alignItems: "center",
                              overflow: "hidden",
                            }}
                          >
                            <button
                              type="button"
                              style={{
                                flex: 1,
                                padding: 0,
                                paddingRight: 8,
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                textAlign: "left",
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                minWidth: 0,
                              }}
                            >
                              <span
                                className="workflow-play-icon inline-flex shrink-0 transition-[stroke]"
                                style={{ color: "var(--echo-text-secondary)" }}
                              >
                                <IconPlayerPlay
                                  size={14}
                                  stroke="currentColor"
                                />
                              </span>
                              <span
                                style={{
                                  fontWeight: 500,
                                  color: "var(--echo-text)",
                                  flexGrow: 1,
                                  fontSize: 13,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {w.name ?? w.id}
                              </span>
                              {w.workflow_type && (
                                <span
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 600,
                                    padding: "2px 5px",
                                    borderRadius: 99,
                                    background:
                                      w.workflow_type === "desktop"
                                        ? "rgba(165,119,255,0.15)"
                                        : "rgba(34,197,94,0.12)",
                                    color:
                                      w.workflow_type === "desktop"
                                        ? "#A577FF"
                                        : "#16a34a",
                                    flexShrink: 0,
                                  }}
                                >
                                  {w.workflow_type === "desktop"
                                    ? "Desktop"
                                    : "Browser"}
                                </span>
                              )}
                            </button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 shrink-0 ml-auto rounded-md text-[#A577FF] hover:bg-[#A577FF]/10 px-2"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <IconDots size={14} />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="end"
                                className="w-40 bg-[var(--echo-surface-solid)] text-[var(--echo-text)] border border-[var(--echo-border)] shadow-lg"
                              >
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedWorkflowId(w.id);
                                    setSelectedWorkflowType(
                                      w.workflow_type ?? "desktop",
                                    );
                                    handleSelectWorkflow(w.id);
                                    setPage("detail");
                                  }}
                                >
                                  <IconInfoSmall size={14} />
                                  Summary
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedWorkflowId(w.id);
                                    setSelectedWorkflowType(
                                      w.workflow_type ?? "desktop",
                                    );
                                    setPage("edit");
                                  }}
                                >
                                  <IconPencil size={14} />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  variant="destructive"
                                  onClick={() => handleDeleteWorkflow(w.id)}
                                >
                                  <IconTrash size={14} />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        )}
                        maxHeight="280px"
                        displayScrollbar={true}
                        showGradients={true}
                        enableArrowNavigation={true}
                        className="p-0"
                        scrollContainerClassName="!p-0"
                        keyExtractor={(w: { id: string }) => w.id}
                      />
                    )}
                    {fetching && (
                      <p
                        style={{
                          color: "var(--echo-text-secondary)",
                          fontSize: 13,
                          marginTop: 8,
                        }}
                      >
                        Loading workflow…
                      </p>
                    )}
                    {fetchError && (
                      <p
                        style={{ color: "#ef4444", fontSize: 13, marginTop: 8 }}
                      >
                        {fetchError}
                      </p>
                    )}
                  </SpotlightCard>

                  {/* Run Logs — placeholder until first run; logs + success/failure after run */}
                  <RunLogsSection
                    runResult={runResult}
                    dismissed={runResultDismissed}
                    onDismiss={() => setRunResultDismissed(true)}
                    onOpenWebUI={(path) =>
                      window.electronAPI?.openWebUI?.(path)
                    }
                    workflowName={
                      runResult?.workflowId
                        ? (workflows.find((w) => w.id === runResult.workflowId)
                            ?.name ?? runResult.workflowId)
                        : undefined
                    }
                  />
                </div>
              )}

              {page === "detail" && selectedWorkflowId && (
                <WorkflowDetailView
                  workflowId={selectedWorkflowId}
                  token={token}
                  apiUrl={API_URL}
                  onBack={() => {
                    setPage("home");
                    loadWorkflows();
                  }}
                  onEdit={() => setPage("edit")}
                  onRun={handleRunWorkflow}
                  onDeleted={() => {
                    setPage("home");
                    loadWorkflows();
                  }}
                  onOpenWebUI={(p) => window.electronAPI?.openWebUI(p)}
                />
              )}

              {page === "edit" && selectedWorkflowId && (
                <WorkflowEditView
                  workflowId={selectedWorkflowId}
                  token={token}
                  apiUrl={API_URL}
                  onBack={() => setPage("detail")}
                  onSaved={() => setPage("detail")}
                />
              )}

              {page === "schedule" && (
                <ScheduleView
                  token={token}
                  apiUrl={API_URL}
                  onBack={() => setPage("home")}
                />
              )}
            </div>
          )}
        </AnimatePresence>
      </TooltipProvider>

      {/* EchoPrism (Voice + Chat) via LiveKit AgentSessionView */}
      <EchoPrismLiveKitSession
        isOpen={echoPrismModalOpen}
        onClose={() => setEchoPrismModalOpen(false)}
        getToken={loadToken}
        onRunStarted={handleRunStarted}
      />
    </>
  );
}

export default function App() {
  const { windowType, mode } = useWindowType();
  useTheme(); // Sync theme (localStorage) to document for all windows including HUD

  useEffect(() => {
    if (windowType === "hud" || windowType === "haze") {
      document.body.style.background = "transparent";
      return () => {
        document.body.style.background = "";
      };
    }
  }, [windowType]);

  if (windowType === "hud") {
    if (mode === "recording") {
      return (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "stretch",
          }}
        >
          <RecordingHud />
        </div>
      );
    }
    if (mode === "run") {
      return <RunHudWrapper />;
    }
    return null;
  }

  if (windowType === "haze") {
    return (
      <div style={{ width: "100%", height: "100%" }}>
        <HazeOverlay />
      </div>
    );
  }

  return <MainWindowApp />;
}

function RunHudWrapper() {
  const [runPaused, setRunPaused] = useState(false);
  const [liveProgress, setLiveProgress] = useState<
    Array<{ thought: string; action: string; step: number }>
  >([]);
  const [callUserReason, setCallUserReason] = useState<string | null>(null);
  const [isAwaitingUser, setIsAwaitingUser] = useState(false);

  useEffect(() => {
    const handler = (entry: {
      thought: string;
      action: string;
      step: number;
    }) => {
      setLiveProgress((prev) => [...prev.slice(-19), entry]);
    };
    window.electronAPI?.onRunProgress?.(handler);
    return () => window.electronAPI?.removeRunProgressListener?.();
  }, []);

  useEffect(() => {
    const handler = (arg: { reason: string }) => {
      setCallUserReason(arg.reason);
      setIsAwaitingUser(true);
    };
    window.electronAPI?.onRunAwaitingUser?.(handler);
    return () => window.electronAPI?.removeRunAwaitingUserListener?.();
  }, []);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "stretch",
        minHeight: 0,
      }}
    >
      <RunHud
        runPaused={runPaused}
        setRunPaused={setRunPaused}
        liveProgress={liveProgress}
        callUserReason={callUserReason}
        isAwaitingUser={isAwaitingUser}
        onCallUserFeedbackSent={() => {
          setIsAwaitingUser(false);
          setCallUserReason(null);
        }}
      />
    </div>
  );
}
