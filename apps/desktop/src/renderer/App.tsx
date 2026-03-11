import { useState, useEffect, useRef, useCallback } from "react";
import {
  IconPlayerPlay,
  IconPlayerPause,
  IconDeviceDesktop,
  IconPlayerRecord,
  IconLogin,
  IconLogout,
  IconTrash,
  IconExternalLink,
  IconRefresh,
  IconPhoneCall,
  IconMessageCircle,
  IconWaveSine,
  IconSend,
  IconCalendarClock,
  IconChevronRight,
} from "@tabler/icons-react";
import RecordingHud from "./RecordingHud";
import { EchoPrismVoiceModal } from "./EchoPrismVoiceModal";
import RunHud from "./RunHud";
import HazeOverlay from "./HazeOverlay";
import WorkflowDetailView from "./WorkflowDetailView";
import WorkflowEditView from "./WorkflowEditView";
import ScheduleView from "./ScheduleView";
import echoLogo from "./assets/echo_logo.png";

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
      startVoiceChat: () => Promise<{ ok: boolean; error?: string }>;
      stopVoiceChat: () => Promise<{ ok: boolean }>;
      sendChatText: (text: string) => Promise<{ ok: boolean; error?: string }>;
      sendVoiceAudio: (chunk: ArrayBuffer) => Promise<void>;
      onChatAudio: (cb: (chunk: ArrayBuffer) => void) => void;
      onChatText: (cb: (msg: { role: string; text: string }) => void) => void;
      removeChatListeners: () => void;
      onRunFromUrl: (
        cb: (arg: { workflowId: string; runId: string }) => void,
      ) => void;
      removeRunFromUrlListener: () => void;
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
  const [liveProgress, setLiveProgress] = useState<
    Array<{ thought: string; action: string; step: number }>
  >([]);
  const [voiceModalOpen, setVoiceModalOpen] = useState(false);
  const [textChatOpen, setTextChatOpen] = useState(false);
  const [textChatMessages, setTextChatMessages] = useState<
    Array<{ role: string; text: string }>
  >([
    {
      role: "assistant",
      text: "Hi! I'm EchoPrism. I can help you create workflows, run automations, and manage your Echo workspace.",
    },
  ]);
  const [textChatInput, setTextChatInput] = useState("");
  const [textChatConnected, setTextChatConnected] = useState(false);

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
  const wsTextRef = useRef<WebSocket | null>(null);

  // Navigation
  const [page, setPage] = useState<"home" | "detail" | "edit" | "schedule">("home");

  // EchoPrismVoice: mic + TTS playback
  const voiceMediaStreamRef = useRef<MediaStream | null>(null);
  const voiceMicCtxRef = useRef<AudioContext | null>(null);
  const voiceProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const voicePlaybackCtxRef = useRef<AudioContext | null>(null);
  const voiceNextPlayTimeRef = useRef<number>(0);

  const playVoicePcm = useCallback((chunk: ArrayBuffer | Uint8Array) => {
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!voicePlaybackCtxRef.current) {
      voicePlaybackCtxRef.current = new AudioContextClass({ sampleRate: 24000 });
      voiceNextPlayTimeRef.current = 0;
    }
    const ctx = voicePlaybackCtxRef.current;
    const bytes = chunk instanceof ArrayBuffer ? new Uint8Array(chunk) : new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    const numSamples = bytes.length >> 1;
    const pcmData = new Int16Array(numSamples);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let i = 0; i < numSamples; i++) pcmData[i] = view.getInt16(i << 1, true);
    const floatData = new Float32Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) floatData[i] = pcmData[i] / 32768;
    const FADE_SAMPLES = Math.min(48, floatData.length >> 1);
    for (let i = 0; i < FADE_SAMPLES; i++) {
      floatData[i] *= i / FADE_SAMPLES;
      floatData[floatData.length - 1 - i] *= i / FADE_SAMPLES;
    }
    const buffer = ctx.createBuffer(1, floatData.length, 24000);
    buffer.copyToChannel(floatData, 0);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    const startAt = Math.max(ctx.currentTime, voiceNextPlayTimeRef.current);
    source.start(startAt);
    voiceNextPlayTimeRef.current = startAt + buffer.duration;
  }, []);

  const stopVoiceMic = useCallback(() => {
    voiceProcessorRef.current?.disconnect();
    voiceProcessorRef.current = null;
    voiceMediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    voiceMediaStreamRef.current = null;
    voiceMicCtxRef.current?.close().catch(() => {});
    voiceMicCtxRef.current = null;
  }, []);

  const startVoiceMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voiceMediaStreamRef.current = stream;
      const AudioContextClass =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioContextClass({ sampleRate: 16000 });
      voiceMicCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      voiceProcessorRef.current = processor;
      processor.onaudioprocess = (e) => {
        const float32 = e.inputBuffer.getChannelData(0);
        const int16 = new Int16Array(float32.length);
        for (let i = 0; i < float32.length; i++) {
          int16[i] = Math.max(-32768, Math.min(32767, float32[i] * 32768));
        }
        window.electronAPI?.sendVoiceAudio?.(int16.buffer as ArrayBuffer);
      };
      source.connect(processor);
      processor.connect(ctx.destination);
    } catch (err) {
      console.error("EchoPrismVoice: mic access denied", err);
    }
  }, []);

  const loadToken = useCallback(async () => {
    const t = await window.electronAPI?.authGetToken();
    setToken(t ?? null);
    return t;
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

  // Handle run-from-url (web opens desktop)
  useEffect(() => {
    const handler = async (arg: { workflowId: string; runId: string }) => {
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
      setLiveProgress([]);
      setCurrentRunId(arg.runId);
      window.electronAPI?.onRunProgress?.((entry: { thought: string; action: string; step: number }) =>
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
    };
    window.electronAPI?.onRunFromUrl?.(handler);
    return () => window.electronAPI?.removeRunFromUrlListener?.();
  }, [token, loadToken]);

  // EchoPrism text chat WebSocket (mode=text)
  useEffect(() => {
    if (!textChatOpen || !token) return;
    const wsUrl = AGENT_URL.replace(/^http/, "ws");
    const ws = new WebSocket(
      `${wsUrl}/ws/chat?token=${encodeURIComponent(token)}&mode=text`,
    );
    wsTextRef.current = ws;
    ws.onopen = () => setTextChatConnected(true);
    ws.onclose = () => {
      setTextChatConnected(false);
      wsTextRef.current = null;
      if (textChatOpen) setTimeout(() => setTextChatConnected(false), 0);
    };
    ws.onerror = () => setTextChatConnected(false);
    ws.onmessage = (e) => {
      if (e.data instanceof Blob) return;
      try {
        const d = JSON.parse(e.data as string) as Record<string, unknown>;
        if (d.type === "text" && d.text) {
          setTextChatMessages((prev) => [
            ...prev,
            { role: "assistant", text: d.text as string },
          ]);
        } else if (d.type === "error") {
          setTextChatMessages((prev) => [
            ...prev,
            { role: "assistant", text: `Error: ${d.text ?? "Unknown"}` },
          ]);
        }
      } catch {
        /* ignore */
      }
    };
    return () => {
      ws.close();
      wsTextRef.current = null;
    };
  }, [textChatOpen, token, AGENT_URL]);

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

  const getPrimarySourceId = async (): Promise<string | null> => {
    return (await window.electronAPI?.getPrimarySourceId?.()) ?? null;
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
    setLiveProgress([]);

    window.electronAPI?.onRunProgress((entry: { thought: string; action: string; step: number }) => {
      setLiveProgress((prev) => [...prev, entry]);
    });

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
    setLiveProgress([]);
    setSelectedWorkflowId(args.workflowId);
    setSelectedWorkflowType(args.workflowType);

    window.electronAPI?.onRunProgress((entry: { thought: string; action: string; step: number }) => {
      setLiveProgress((prev) => [...prev, entry]);
    });

    try {
      const createRes = await window.electronAPI?.createRun?.({
        workflowId: args.workflowId,
        token,
      });
      if (createRes && "error" in createRes) {
        setRunResult({ success: false, error: createRes.error, workflowId: args.workflowId });
        return;
      }
      const runId = createRes && "runId" in createRes ? createRes.runId : undefined;
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

  const sendTextChatMessage = (text: string) => {
    if (
      !text.trim() ||
      !wsTextRef.current ||
      wsTextRef.current.readyState !== WebSocket.OPEN
    )
      return;
    setTextChatMessages((prev) => [
      ...prev,
      { role: "user", text: text.trim() },
    ]);
    wsTextRef.current.send(JSON.stringify({ type: "text", text: text.trim() }));
    setTextChatInput("");
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
          background: "var(--echo-bg, #F5F7FC)",
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
              color: "#150A35",
              marginBottom: 8,
            }}
          >
            Screen Recording Required
          </h1>
          <p
            style={{
              fontSize: 14,
              color: "#6b7280",
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
              color: "#6b7280",
              marginBottom: 24,
              lineHeight: 1.6,
            }}
          >
            Go to{" "}
            <strong style={{ color: "#150A35" }}>
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
    return (
      <div style={{ padding: 24, maxWidth: 480, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 8,
          }}
        >
          <img
            src={echoLogo}
            alt="Echo"
            width={56}
            height={56}
            style={{ width: 56, height: 56, objectFit: "contain" }}
          />
          <h1
            style={{
              fontSize: "1.5rem",
              fontWeight: 600,
              color: "#150A35",
              margin: 0,
            }}
          >
            Echo Desktop
          </h1>
        </div>
        <p style={{ color: "#6b7280", marginBottom: 24, fontSize: 14 }}>
          Sign in to access your workflows and run them locally.
        </p>
        <section className="echo-card" style={{ padding: 24 }}>
          <p style={{ color: "#150A35", marginBottom: 16 }}>
            Sign in with your browser to continue.
          </p>
          <button
            type="button"
            className="echo-btn-primary"
            onClick={handleSignIn}
          >
            <IconLogin
              size={18}
              style={{ marginRight: 8, verticalAlign: "middle" }}
            />
            Sign in
          </button>
        </section>
      </div>
    );
  }

  return (
    <>
      <div style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 24,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }} onClick={() => setPage("home")}>
            <img
              src={echoLogo}
              alt="Echo"
              width={56}
              height={56}
              style={{ width: 56, height: 56, objectFit: "contain" }}
            />
            <div>
              <h1
                style={{
                  fontSize: "1.5rem",
                  fontWeight: 600,
                  color: "#150A35",
                  marginBottom: 4,
                  marginTop: 0,
                }}
              >
                Echo Desktop
              </h1>
            <p style={{ color: "#6b7280", fontSize: 14, margin: 0 }}>
                Signed in · EchoPrism workflow automation
              </p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className={page === "schedule" ? "echo-btn-primary" : "echo-btn-secondary"}
              onClick={() => { setPage(page === "schedule" ? "home" : "schedule"); }}
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              <IconCalendarClock size={16} />
              Schedule
            </button>
            <button
              type="button"
              className="echo-btn-secondary"
              onClick={() => setVoiceModalOpen(true)}
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              <IconWaveSine size={16} />
              EchoPrism Voice
            </button>
            <button
              type="button"
              className="echo-btn-secondary"
              onClick={() => setTextChatOpen((o) => !o)}
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              <IconMessageCircle size={16} />
              EchoPrism Chat
            </button>
            <button
              type="button"
              className="echo-btn-secondary"
              onClick={() => window.electronAPI?.openWebUI()}
            >
              <IconExternalLink
                size={16}
                style={{ marginRight: 6, verticalAlign: "middle" }}
              />
              Open in web
            </button>
            <button
              type="button"
              className="echo-btn-secondary"
              onClick={handleSignOut}
            >
              <IconLogout
                size={16}
                style={{ marginRight: 6, verticalAlign: "middle" }}
              />
              Sign out
            </button>
          </div>
        </div>

        {/* Page-based content */}
        {page === "home" && (
          <>
        {/* Record section — TOP */}
        <section
          className="echo-card"
          style={{ padding: 20, marginBottom: 20 }}
        >
          <h2
            style={{
              fontSize: "1rem",
              fontWeight: 600,
              color: "var(--echo-cetacean)",
              marginBottom: 12,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <IconPlayerRecord size={18} />
            Record screen → Create workflow
          </h2>

          {/* Idle: no recording, no blob */}
          {!recording && !recordedBlob && (
            <>
              <p
                style={{
                  color: "var(--echo-muted)",
                  fontSize: 13,
                  marginBottom: 12,
                }}
              >
                Click to start capture. Your system picker will let you choose
                screen, window, or tab.
              </p>
              <button
                type="button"
                className="echo-btn-primary"
                onClick={startRecording}
              >
                <IconPlayerRecord
                  size={16}
                  style={{ marginRight: 6, verticalAlign: "middle" }}
                />
                Start capture / recording
              </button>
            </>
          )}

          {/* Review state: recording stopped, blob ready (main hidden during recording; HUD shows controls) */}
          {!recording && recordedBlob && (
            <div className="echo-recording-bar">
              <span
                style={{
                  fontSize: 13,
                  color: "var(--echo-muted)",
                  flexGrow: 1,
                }}
              >
                Recording ready — {formatDuration(recordedDuration)}
              </span>
              <button
                type="button"
                className="echo-btn-primary"
                onClick={uploadAndSynthesize}
                disabled={!!recordStatus}
                style={{ fontSize: 13 }}
              >
                <IconDeviceDesktop
                  size={14}
                  style={{ marginRight: 6, verticalAlign: "middle" }}
                />
                {recordStatus || "Upload & create workflow"}
              </button>
              <button
                type="button"
                className="echo-btn-danger"
                onClick={discardRecording}
                style={{ padding: "0.4rem 0.8rem", fontSize: 13 }}
              >
                <IconTrash
                  size={14}
                  style={{ marginRight: 4, verticalAlign: "middle" }}
                />
                Discard
              </button>
            </div>
          )}

          {recordError && (
            <p
              style={{ color: "var(--echo-error)", fontSize: 13, marginTop: 8 }}
            >
              {recordError}
            </p>
          )}
          {recordStatus && !recordError && (
            <p
              style={{
                color: "var(--echo-success)",
                fontSize: 13,
                marginTop: 8,
              }}
            >
              {recordStatus}
            </p>
          )}
        </section>

        {/* Workflows list */}
        <section
          className="echo-card"
          style={{ padding: 20, marginBottom: 20 }}
        >
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
                color: "#150A35",
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
            <p style={{ color: "#6b7280", fontSize: 14 }}>Loading workflows…</p>
          ) : workflowsError ? (
            <p style={{ color: "#ef4444", fontSize: 14 }}>{workflowsError}</p>
          ) : workflows.length === 0 ? (
            <p style={{ color: "#6b7280", fontSize: 14 }}>
              No workflows yet. Record a screen to create one.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {workflows.map((w) => {
                const isSelected = selectedWorkflowId === w.id;
                return (
                <div
                  key={w.id}
                  style={{
                    padding: 0,
                    borderRadius: 8,
                    border: isSelected
                      ? "2px solid #A577FF"
                      : "1px solid rgba(165,119,255,0.2)",
                    background: isSelected
                      ? "rgba(165,119,255,0.1)"
                      : "white",
                    display: "flex",
                    alignItems: "center",
                    overflow: "hidden",
                  }}
                >
                  {/* Radio: select for running (stays on home) */}
                  <button
                    type="button"
                    title="Select for running"
                    onClick={(e) => { e.stopPropagation(); handleSelectWorkflow(w.id); }}
                    style={{
                      width: 40,
                      minHeight: 44,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "none",
                      border: "none",
                      borderRight: "1px solid rgba(165,119,255,0.15)",
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  >
                    <span style={{
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      border: isSelected ? "2px solid #A577FF" : "2px solid #d1d5db",
                      background: isSelected ? "#A577FF" : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "all 0.15s ease",
                    }}>
                      {isSelected && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "white" }} />}
                    </span>
                  </button>
                  {/* Name + badges: click to view details */}
                  <button
                    type="button"
                    onClick={() => { setSelectedWorkflowId(w.id); setSelectedWorkflowType(w.workflow_type ?? "desktop"); setPage("detail"); }}
                    style={{
                      flex: 1,
                      padding: 12,
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      textAlign: "left",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span
                      style={{ fontWeight: 500, color: "#150A35", flexGrow: 1 }}
                    >
                      {w.name ?? w.id}
                    </span>
                    {w.workflow_type && (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: "2px 7px",
                          borderRadius: 99,
                          background:
                            w.workflow_type === "desktop"
                              ? "rgba(165,119,255,0.15)"
                              : "rgba(34,197,94,0.12)",
                          color:
                            w.workflow_type === "desktop" ? "#A577FF" : "#16a34a",
                          flexShrink: 0,
                        }}
                      >
                        {w.workflow_type === "desktop" ? "Desktop" : "Browser"}
                      </span>
                    )}
                    {w.status && (
                      <span
                        style={{ fontSize: 12, color: "#6b7280", flexShrink: 0 }}
                      >
                        ({w.status})
                      </span>
                    )}
                    <IconChevronRight size={16} style={{ color: "#9ca3af", flexShrink: 0 }} />
                  </button>
                </div>
                );
              })}
            </div>
          )}
          {fetching && (
            <p style={{ color: "#6b7280", fontSize: 13, marginTop: 8 }}>
              Loading workflow…
            </p>
          )}
          {fetchError && (
            <p style={{ color: "#ef4444", fontSize: 13, marginTop: 8 }}>
              {fetchError}
            </p>
          )}
        </section>

        {/* Run workflow */}
        <section className="echo-card" style={{ padding: 20 }}>
          {!selectedWorkflowId && (
            <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 12 }}>
              Select a workflow using the radio button to run it locally.
            </p>
          )}
          {selectedWorkflowId && workflow && (
            <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 12 }}>
              Ready to run: <strong style={{ color: "#150A35" }}>{String(workflow.name ?? workflow.id)}</strong> ({steps.length} steps)
            </p>
          )}
          <button
            type="button"
            className="echo-btn-primary"
            onClick={handleRun}
            disabled={running || steps.length === 0}
          >
            <IconPlayerPlay
              size={18}
              style={{ marginRight: 8, verticalAlign: "middle" }}
            />
            {running ? "Running…" : "Run workflow locally"}
          </button>
          {/* Live progress during run */}
          {running && liveProgress.length > 0 && (
            <div
              style={{
                marginTop: 12,
                padding: 12,
                background: "#F5F3FF",
                borderRadius: 8,
                border: "1px solid #A577FF30",
              }}
            >
              <p
                style={{
                  fontSize: 11,
                  color: "#A577FF",
                  fontWeight: 600,
                  marginBottom: 6,
                }}
              >
                EchoPrism thinking…
              </p>
              {liveProgress.slice(-3).map((entry, i) => (
                <div
                  key={i}
                  style={{ fontSize: 11, color: "#5B3FA0", marginBottom: 3 }}
                >
                  Step {entry.step + 1}: {entry.thought.slice(0, 120)}
                  {entry.thought.length > 120 ? "…" : ""}
                </div>
              ))}
            </div>
          )}

          {runResult && (
            <div style={{ marginTop: 16 }}>
              {runResult.success ? (
                <p style={{ color: "#22c55e", fontSize: 14 }}>
                  Completed successfully.
                </p>
              ) : (
                <p style={{ color: "#ef4444", fontSize: 14 }}>
                  {runResult.error}
                </p>
              )}
              {runResult.progress && runResult.progress.length > 0 && (
                <div
                  style={{
                    marginTop: 12,
                    padding: 12,
                    background: "#F5F7FC",
                    borderRadius: 8,
                    fontSize: 12,
                    color: "#6b7280",
                    maxHeight: 120,
                    overflow: "auto",
                  }}
                >
                  {runResult.progress.map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                </div>
              )}
              {/* View full logs in web app */}
              {runResult.workflowId && (
                <button
                  style={{
                    marginTop: 10,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    color: "#A577FF",
                    background: "none",
                    border: "1px solid #A577FF40",
                    borderRadius: 6,
                    padding: "4px 10px",
                    cursor: "pointer",
                  }}
                  onClick={() =>
                    window.electronAPI?.openWebUI(
                      runResult.runId
                        ? `/dashboard/workflows/${runResult.workflowId}/runs/${runResult.runId}`
                        : `/dashboard/workflows/${runResult.workflowId}`,
                    )
                  }
                >
                  <IconExternalLink style={{ width: 14, height: 14 }} />
                  View full logs
                </button>
              )}
            </div>
          )}
        </section>
          </>
        )}

        {page === "detail" && selectedWorkflowId && (
          <WorkflowDetailView
            workflowId={selectedWorkflowId}
            token={token}
            apiUrl={API_URL}
            onBack={() => { setPage("home"); loadWorkflows(); }}
            onEdit={() => setPage("edit")}
            onRun={handleRunWorkflow}
            onDeleted={() => { setPage("home"); loadWorkflows(); }}
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

      {/* EchoPrism Chat (text) Panel */}
      {textChatOpen && (
        <div
          style={{
            position: "fixed",
            bottom: 80,
            left: 20,
            width: 340,
            maxHeight: 480,
            background: "white",
            borderRadius: 16,
            boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
            border: "1px solid rgba(165,119,255,0.3)",
            display: "flex",
            flexDirection: "column",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid rgba(165,119,255,0.2)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontWeight: 700, fontSize: 14, color: "#150A35" }}>
              EchoPrism Chat
              {textChatConnected ? (
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: 10,
                    color: "#22c55e",
                    fontWeight: 500,
                  }}
                >
                  • Connected
                </span>
              ) : (
                <span style={{ marginLeft: 6, fontSize: 10, color: "#9ca3af" }}>
                  Connecting…
                </span>
              )}
            </span>
            <button
              onClick={() => setTextChatOpen(false)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#999",
                fontSize: 16,
              }}
            >
              ×
            </button>
          </div>
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              minHeight: 200,
            }}
          >
            {textChatMessages.map((m, i) => (
              <div
                key={i}
                style={{
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  background: m.role === "user" ? "#A577FF" : "#F5F3FF",
                  color: m.role === "user" ? "white" : "#150A35",
                  borderRadius: 12,
                  padding: "8px 12px",
                  fontSize: 13,
                  maxWidth: "90%",
                }}
              >
                {m.text}
              </div>
            ))}
          </div>
          <div
            style={{
              padding: "8px 12px",
              borderTop: "1px solid rgba(165,119,255,0.2)",
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
            }}
          >
            {[
              "List my workflows",
              "What can you do?",
              "Create a new workflow",
            ].map((chip) => (
              <button
                key={chip}
                onClick={() => sendTextChatMessage(chip)}
                style={{
                  fontSize: 11,
                  padding: "4px 10px",
                  borderRadius: 999,
                  border: "1px solid rgba(165,119,255,0.4)",
                  background: "rgba(165,119,255,0.1)",
                  color: "#A577FF",
                  cursor: "pointer",
                }}
              >
                {chip}
              </button>
            ))}
          </div>
          <div
            style={{
              padding: "8px 12px",
              borderTop: "1px solid rgba(165,119,255,0.2)",
              display: "flex",
              gap: 8,
            }}
          >
            <input
              value={textChatInput}
              onChange={(e) => setTextChatInput(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" &&
                !e.shiftKey &&
                sendTextChatMessage(textChatInput)
              }
              placeholder="Message EchoPrism…"
              style={{
                flex: 1,
                borderRadius: 8,
                border: "1px solid rgba(165,119,255,0.3)",
                padding: "8px 12px",
                fontSize: 12,
                outline: "none",
              }}
            />
            <button
              type="button"
              className="echo-btn-primary"
              onClick={() => sendTextChatMessage(textChatInput)}
              disabled={!textChatInput.trim() || !textChatConnected}
              style={{ padding: "8px 14px" }}
            >
              <IconSend size={16} />
            </button>
          </div>
        </div>
      )}

      {/* EchoPrism Voice fullscreen modal */}
      <EchoPrismVoiceModal
        isOpen={voiceModalOpen}
        onClose={() => setVoiceModalOpen(false)}
        token={token}
        onStartVoice={() => window.electronAPI?.startVoiceChat?.() ?? Promise.resolve({ ok: false, error: "No API" })}
        onStopVoice={() => window.electronAPI?.stopVoiceChat?.()}
        onChatText={(cb) => window.electronAPI?.onChatText?.(cb)}
        onChatAudio={(cb) => window.electronAPI?.onChatAudio?.(cb)}
        onRemoveChatListeners={() => window.electronAPI?.removeChatListeners?.()}
        playPcm={playVoicePcm}
        startMic={startVoiceMic}
        stopMic={stopVoiceMic}
      />

      {/* Floating EchoPrism Voice button */}
      <button
        onClick={() => setVoiceModalOpen(true)}
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          width: 52,
          height: 52,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #A577FF, #7C3AED)",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 16px rgba(165,119,255,0.4)",
          zIndex: 999,
        }}
        title="EchoPrism Voice"
      >
        <IconWaveSine size={22} color="white" />
      </button>
    </>
  );
}

export default function App() {
  const { windowType, mode } = useWindowType();

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
      setLiveProgress((prev) => [...prev.slice(-4), entry]);
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
