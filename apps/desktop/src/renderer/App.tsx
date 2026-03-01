import { useState, useEffect, useRef, useCallback } from "react";
import {
  IconPlayerPlay,
  IconDeviceDesktop,
  IconPlayerRecord,
  IconLogin,
  IconLogout,
  IconTrash,
  IconExternalLink,
  IconRefresh,
} from "@tabler/icons-react";

declare global {
  interface Window {
    electronAPI?: {
      getSources: () => Promise<
        { id: string; name: string; thumbnail: string }[]
      >;
      getPrimarySourceId: () => Promise<string | null>;
      runWorkflowLocal: (args: {
        steps: Array<Record<string, unknown>>;
        sourceId: string;
        workflowType?: string;
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
      onRunProgress: (cb: (entry: { thought: string; action: string; step: number }) => void) => void;
      removeRunProgressListener: () => void;
      startVoiceChat: () => Promise<{ ok: boolean; error?: string }>;
      stopVoiceChat: () => Promise<{ ok: boolean }>;
      sendChatText: (text: string) => Promise<{ ok: boolean; error?: string }>;
      onChatAudio: (cb: (chunk: ArrayBuffer) => void) => void;
      onChatText: (cb: (msg: { role: string; text: string }) => void) => void;
      removeChatListeners: () => void;
    };
  }
}

const API_URL =
  (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ??
  "http://localhost:8000";

export default function App() {
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
  const [runResult, setRunResult] = useState<{
    success: boolean;
    error?: string;
    progress?: string[];
    runId?: string;
    workflowId?: string;
  } | null>(null);
  const [liveProgress, setLiveProgress] = useState<Array<{ thought: string; action: string; step: number }>>([]);
  const [chatMessages, setChatMessages] = useState<Array<{ role: string; text: string }>>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);

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

  const loadToken = useCallback(async () => {
    const t = await window.electronAPI?.authGetToken();
    setToken(t ?? null);
    return t;
  }, []);

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

  useEffect(() => {
    window.electronAPI?.onScreenPermissionRequired?.(() => {
      setScreenPermissionRequired(true);
      const interval = setInterval(async () => {
        const granted = await window.electronAPI?.checkScreenPermission?.();
        if (granted) {
          clearInterval(interval);
          setScreenPermissionRequired(false);
        }
      }, 2000);
      return () => clearInterval(interval);
    });
  }, []);

  useEffect(() => {
    loadToken();
  }, [loadToken]);

  useEffect(() => {
    window.electronAPI?.onAuthTokenReceived?.(() => {
      loadToken().then((t) => {
        if (t) loadWorkflows();
      });
    });
  }, [loadToken, loadWorkflows]);

  useEffect(() => {
    if (token) loadWorkflows();
    else setWorkflows([]);
  }, [token, loadWorkflows]);

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

  const startRecording = async () => {
    setRecordError("");
    setRecordedBlob(null);
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
    } catch (e) {
      setRecordError(
        e instanceof Error ? e.message : "Could not start recording",
      );
    }
  };

  const stopRecording = () => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.stop();
      setRecordedDuration(recordingDuration);
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

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const uploadAndSynthesize = async () => {
    if (!recordedBlob || !token) return;
    setRecordStatus("Requesting upload URL…");
    setRecordError("");
    const base = API_URL.replace(/\/$/, "");
    try {
      const ext = recordedBlob.type.includes("webm") ? "webm" : "mp4";
      const filename = `recording-${Date.now()}.${ext}`;
      const signedRes = await fetch(`${base}/api/storage/signed-upload-url`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          filename,
          content_type: recordedBlob.type || "video/webm",
        }),
      });
      if (!signedRes.ok) {
        if (signedRes.status === 401) {
          await window.electronAPI?.authClearToken?.();
          setToken(null);
          throw new Error("Session expired. Please sign in again.");
        }
        const d = await signedRes.json().catch(() => ({}));
        throw new Error(
          (d as { detail?: string }).detail || "Failed to get upload URL",
        );
      }
      const { signed_url, gcs_path } = (await signedRes.json()) as {
        signed_url: string;
        gcs_path: string;
      };
      setRecordStatus("Uploading recording…");
      const gcsRes = await fetch(signed_url, {
        method: "PUT",
        headers: { "Content-Type": recordedBlob.type || "video/webm" },
        body: recordedBlob,
      });
      if (!gcsRes.ok) throw new Error(`Upload failed: ${gcsRes.status}`);
      setRecordStatus("Synthesizing workflow…");
      const formData = new FormData();
      formData.append("video_gcs_path", gcs_path);
      const synthRes = await fetch(`${base}/api/synthesize`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
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
    if (steps.length === 0) return;
    const sourceId = await getPrimarySourceId();
    if (!sourceId) {
      setRunResult({ success: false, error: "Could not get primary display" });
      return;
    }
    setRunning(true);
    setRunResult(null);
    setLiveProgress([]);

    // Register real-time progress listener
    window.electronAPI?.onRunProgress((entry) => {
      setLiveProgress((prev) => [...prev, entry]);
    });

    try {
      const result = await window.electronAPI?.runWorkflowLocal({
        steps,
        sourceId,
        workflowType: selectedWorkflowType,
      });
      window.electronAPI?.removeRunProgressListener();
      setRunResult({
        ...(result ?? { success: false, error: "No response" }),
        workflowId: selectedWorkflowId,
      });
    } finally {
      setRunning(false);
      window.electronAPI?.removeRunProgressListener();
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
        <h1
          style={{
            fontSize: "1.5rem",
            fontWeight: 600,
            color: "#150A35",
            marginBottom: 8,
          }}
        >
          Echo Desktop
        </h1>
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
          <div>
            <h1
              style={{
                fontSize: "1.5rem",
                fontWeight: 600,
                color: "#150A35",
                marginBottom: 4,
              }}
            >
              Echo Desktop
            </h1>
            <p style={{ color: "#6b7280", fontSize: 14 }}>
              Signed in · EchoPrism workflow automation
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
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

          {/* Active recording controls */}
          {recording && (
            <div className="echo-recording-bar">
              <div
                className={`echo-recording-dot${recordingPaused ? " paused" : ""}`}
              />
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--echo-cetacean)",
                  minWidth: 48,
                }}
              >
                {formatDuration(recordingDuration)}
              </span>
              <span
                style={{
                  fontSize: 13,
                  color: "var(--echo-muted)",
                  flexGrow: 1,
                }}
              >
                {recordingPaused ? "Paused" : "Recording…"}
              </span>
              <button
                type="button"
                className="echo-btn-secondary"
                onClick={pauseResumeRecording}
                style={{ fontSize: 13, padding: "0.35rem 0.75rem" }}
              >
                {recordingPaused ? "Resume" : "Pause"}
              </button>
              <button
                type="button"
                className="echo-btn-primary"
                onClick={stopRecording}
                style={{ fontSize: 13, padding: "0.35rem 0.75rem" }}
              >
                Stop
              </button>
              <button
                type="button"
                className="echo-btn-danger"
                onClick={discardRecording}
                style={{ padding: "0.35rem 0.75rem", fontSize: 13 }}
              >
                <IconTrash
                  size={14}
                  style={{ marginRight: 4, verticalAlign: "middle" }}
                />
                Discard
              </button>
            </div>
          )}

          {/* Review state: recording stopped, blob ready */}
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
              {workflows.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => handleSelectWorkflow(w.id)}
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    border:
                      selectedWorkflowId === w.id
                        ? "2px solid #A577FF"
                        : "1px solid rgba(165,119,255,0.2)",
                    background:
                      selectedWorkflowId === w.id
                        ? "rgba(165,119,255,0.1)"
                        : "white",
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
                </button>
              ))}
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
          {workflow && (
            <p style={{ color: "#22c55e", fontSize: 13, marginTop: 8 }}>
              Loaded: {String(workflow.name ?? workflow.id)} ({steps.length}{" "}
              steps)
            </p>
          )}
        </section>

        {/* Run workflow */}
        <section className="echo-card" style={{ padding: 20 }}>
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
            <div style={{ marginTop: 12, padding: 12, background: "#F5F3FF", borderRadius: 8, border: "1px solid #A577FF30" }}>
              <p style={{ fontSize: 11, color: "#A577FF", fontWeight: 600, marginBottom: 6 }}>EchoPrism thinking…</p>
              {liveProgress.slice(-3).map((entry, i) => (
                <div key={i} style={{ fontSize: 11, color: "#5B3FA0", marginBottom: 3 }}>
                  Step {entry.step + 1}: {entry.thought.slice(0, 120)}{entry.thought.length > 120 ? "…" : ""}
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
                  onClick={() => window.electronAPI?.openWebUI(`/dashboard/workflows/${runResult.workflowId}`)}
                >
                  <IconExternalLink style={{ width: 14, height: 14 }} />
                  View full logs
                </button>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Border-only haze while EchoPrism is running */}
      {running && (
        <>
          <div className="echo-run-haze" />
          <div className="echo-run-haze-content">
            <div className="echo-run-haze-spinner" />
            <div className="echo-run-haze-label">
              {workflow ? `Running: ${String(workflow.name || selectedWorkflowId)}` : "EchoPrism is taking control…"}
            </div>
            {liveProgress.length > 0 && (
              <div style={{ marginTop: 12, padding: 12, background: "rgba(255,255,255,0.9)", borderRadius: 10, maxWidth: 400, maxHeight: 160, overflow: "auto", textAlign: "left" }}>
                <p style={{ fontSize: 10, color: "#A577FF", fontWeight: 700, marginBottom: 6 }}>LIVE THOUGHTS</p>
                {liveProgress.slice(-4).map((e, i) => (
                  <div key={i} style={{ fontSize: 10, color: "#3B1F7A", marginBottom: 3 }}>
                    Step {e.step + 1}: {e.thought.slice(0, 100)}…
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* EchoPrismVoice Chat Panel */}
      {chatOpen && (
        <div style={{
          position: "fixed",
          bottom: 80,
          right: 20,
          width: 320,
          maxHeight: 480,
          background: "white",
          borderRadius: 16,
          boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
          border: "1px solid #A577FF30",
          display: "flex",
          flexDirection: "column",
          zIndex: 1000,
        }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #A577FF20", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: "#150A35" }}>EchoPrismVoice</span>
            <button onClick={() => { setChatOpen(false); window.electronAPI?.stopVoiceChat(); setVoiceActive(false); }}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#999", fontSize: 16 }}>×</button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {chatMessages.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                background: m.role === "user" ? "#A577FF" : "#F5F3FF",
                color: m.role === "user" ? "white" : "#150A35",
                borderRadius: 12,
                padding: "6px 12px",
                fontSize: 12,
                maxWidth: "85%",
              }}>{m.text}</div>
            ))}
          </div>
          <div style={{ padding: "8px 12px", borderTop: "1px solid #A577FF20", display: "flex", gap: 8 }}>
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && chatInput.trim()) {
                  setChatMessages((prev) => [...prev, { role: "user", text: chatInput }]);
                  window.electronAPI?.sendChatText(chatInput);
                  setChatInput("");
                }
              }}
              placeholder="Type a message..."
              style={{ flex: 1, borderRadius: 8, border: "1px solid #A577FF30", padding: "6px 10px", fontSize: 12, outline: "none" }}
            />
          </div>
        </div>
      )}

      {/* Floating EchoPrismVoice button */}
      <button
        onClick={async () => {
          if (!chatOpen) {
            setChatOpen(true);
            if (!voiceActive) {
              const result = await window.electronAPI?.startVoiceChat();
              if (result?.ok) {
                setVoiceActive(true);
                window.electronAPI?.onChatText((msg) => {
                  setChatMessages((prev) => [...prev, msg]);
                });
              }
            }
          } else {
            setChatOpen(false);
          }
        }}
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
        title="EchoPrismVoice"
      >
        <span style={{ fontSize: 22 }}>🎙️</span>
      </button>
    </>
  );
}
