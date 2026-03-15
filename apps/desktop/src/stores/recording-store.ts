import { create } from "zustand";
import { useAuthStore } from "./auth-store";
import { useWorkflowsStore } from "./workflows-store";

const API_URL =
  (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ??
  "http://localhost:8000";
const AGENT_URL =
  (import.meta as { env?: { VITE_ECHO_AGENT_URL?: string } }).env
    ?.VITE_ECHO_AGENT_URL ?? API_URL;

let currentAbortController: AbortController | null = null;

interface RecordingState {
  recording: boolean;
  recordingPaused: boolean;
  recordingDuration: number;
  recordedBlob: Blob | null;
  recordedDuration: number;
  recordStatus: string;
  recordError: string;
  setRecording: (v: boolean) => void;
  setRecordingPaused: (v: boolean) => void;
  setRecordingDuration: (v: number) => void;
  setRecordedBlob: (v: Blob | null) => void;
  setRecordedDuration: (v: number) => void;
  setRecordStatus: (v: string) => void;
  setRecordError: (v: string) => void;
  uploadAndSynthesize: () => Promise<void>;
  cancelSynthesis: () => void;
  resetRecording: () => void;
}

export const useRecordingStore = create<RecordingState>((set, get) => ({
  recording: false,
  recordingPaused: false,
  recordingDuration: 0,
  recordedBlob: null,
  recordedDuration: 0,
  recordStatus: "",
  recordError: "",

  setRecording: (v) => set({ recording: v }),
  setRecordingPaused: (v) => set({ recordingPaused: v }),
  setRecordingDuration: (v) => set({ recordingDuration: v }),
  setRecordedBlob: (v) => set({ recordedBlob: v }),
  setRecordedDuration: (v) => set({ recordedDuration: v }),
  setRecordStatus: (v) => set({ recordStatus: v }),
  setRecordError: (v) => set({ recordError: v }),

  resetRecording: () =>
    set({
      recording: false,
      recordingPaused: false,
      recordingDuration: 0,
      recordedBlob: null,
      recordedDuration: 0,
      recordError: "",
      recordStatus: "",
    }),

  cancelSynthesis: () => {
    if (currentAbortController) {
      currentAbortController.abort();
      currentAbortController = null;
    }
    set({ recordStatus: "", recordError: "" });
  },

  uploadAndSynthesize: async () => {
    const { recordedBlob } = get();
    const token = useAuthStore.getState().token;
    if (!recordedBlob || !token) return;

    currentAbortController = new AbortController();
    const signal = currentAbortController.signal;
    set({ recordStatus: "Uploading recording…", recordError: "" });
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
        signal,
      });
      if (!uploadRes.ok) {
        if (uploadRes.status === 401) {
          await window.electronAPI?.authClearToken?.();
          useAuthStore.getState().signOut();
          throw new Error("Session expired. Please sign in again.");
        }
        const d = await uploadRes.json().catch(() => ({}));
        throw new Error(
          (d as { detail?: string }).detail || "Failed to upload recording"
        );
      }
      const { gcs_path } = (await uploadRes.json()) as { gcs_path: string };
      set({ recordStatus: "Synthesizing workflow…" });

      const synthFormData = new FormData();
      synthFormData.append("video_gcs_path", gcs_path);
      const synthRes = await fetch(`${agentBase}/api/synthesize`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: synthFormData,
        signal,
      });
      if (!synthRes.ok) {
        const d = await synthRes.json().catch(() => ({}));
        throw new Error(
          (d as { detail?: string }).detail || "Synthesis failed"
        );
      }
      const _ = (await synthRes.json()) as { workflow_id: string };
      set({ recordStatus: "Workflow created", recordedBlob: null });
      useWorkflowsStore.getState().loadWorkflows();
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        set({ recordStatus: "", recordError: "" });
        return;
      }
      set({
        recordError:
          e instanceof Error ? e.message : "Upload/synthesis failed",
      });
    } finally {
      currentAbortController = null;
      const status = get().recordStatus;
      if (status) setTimeout(() => set({ recordStatus: "" }), 3000);
    }
  },
}));
