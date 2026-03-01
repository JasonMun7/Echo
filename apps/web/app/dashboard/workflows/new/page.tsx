"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import {
  IconUpload,
  IconPhoto,
  IconVideo,
  IconPlayerRecord,
} from "@tabler/icons-react";
import { MultiStepLoader } from "@/components/ui/multi-step-loader";

const SYNTHESIS_STEPS = [
  { text: "Uploading your recording to secure storage…" },
  { text: "Sampling key frames from the video…" },
  { text: "Running EchoPrism scene perception…" },
  { text: "Grounding UI elements to coordinates…" },
  { text: "Generating action sequence with Gemini…" },
  { text: "Validating step completeness…" },
  { text: "Building workflow graph…" },
  { text: "Finalising and saving your workflow…" },
];

type Mode = "video" | "screenshots" | "record";

export default function NewWorkflowPage() {
  const [mode, setMode] = useState<Mode>("video");
  const [workflowName, setWorkflowName] = useState("My Workflow");
  const [video, setVideo] = useState<File | null>(null);
  const [screenshots, setScreenshots] = useState<File[]>([]);
  const [recording, setRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [hasRecording, setHasRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [, setUploadStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setUploadStatus(null);

    try {
      const formData = new FormData();

      if (mode === "record") {
        const blob = getRecordedBlob();
        if (!blob) {
          setError("No recording. Record your screen first.");
          setLoading(false);
          return;
        }
        const ext = blob.type.includes("webm") ? "webm" : "mp4";
        const filename = `recording-${Date.now()}.${ext}`;
        setUploadStatus("Requesting upload URL…");
        const signedRes = await apiFetch("/api/storage/signed-upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename,
            content_type: blob.type || "video/webm",
          }),
        });
        if (!signedRes.ok) {
          const d = await signedRes.json().catch(() => ({}));
          throw new Error(d.detail || "Failed to get upload URL");
        }
        const { signed_url, gcs_path } = await signedRes.json();
        setUploadStatus("Uploading recording…");
        const gcsRes = await fetch(signed_url, {
          method: "PUT",
          headers: { "Content-Type": blob.type || "video/webm" },
          body: blob,
        });
        if (!gcsRes.ok) {
          throw new Error(
            `Storage upload failed: ${gcsRes.status} ${gcsRes.statusText}`,
          );
        }
        setUploadStatus("Synthesizing workflow with AI…");
        formData.append("video_gcs_path", gcs_path);
      } else if (mode === "video" && video) {
        // ── Step 1: get a signed GCS URL so the browser uploads directly,
        //            bypassing the Cloud Run 32 MB request-body limit.
        setUploadStatus("Requesting upload URL…");
        const signedRes = await apiFetch("/api/storage/signed-upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: video.name,
            content_type: video.type || "video/mp4",
          }),
        });
        if (!signedRes.ok) {
          const d = await signedRes.json().catch(() => ({}));
          throw new Error(d.detail || "Failed to get upload URL");
        }
        const { signed_url, gcs_path } = await signedRes.json();

        // ── Step 2: PUT the video file directly to GCS (no backend involved).
        setUploadStatus("Uploading video to storage…");
        const gcsRes = await fetch(signed_url, {
          method: "PUT",
          headers: { "Content-Type": video.type || "video/mp4" },
          body: video,
        });
        if (!gcsRes.ok) {
          throw new Error(
            `Storage upload failed: ${gcsRes.status} ${gcsRes.statusText}`,
          );
        }

        // ── Step 3: tell the backend to synthesize from the GCS path.
        setUploadStatus("Synthesizing workflow with AI…");
        formData.append("video_gcs_path", gcs_path);
      } else if (mode === "screenshots" && screenshots.length > 0) {
        setUploadStatus("Synthesizing workflow with AI…");
        screenshots.forEach((f) => formData.append("screenshots", f));
      } else {
        setError(
          "Please record your screen, select a video, or upload screenshots",
        );
        setLoading(false);
        return;
      }

      formData.append("workflow_name", workflowName || "My Workflow");
      const res = await apiFetch("/api/synthesize", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || res.statusText);
      }
      const { workflow_id } = await res.json();
      router.push(`/dashboard/workflows/${workflow_id}/edit`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Synthesis failed");
    } finally {
      setLoading(false);
      setUploadStatus(null);
    }
  };

  const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    setVideo(f || null);
  };

  const handleScreenshotsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setScreenshots(files);
  };

  const startRecordingFn = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "browser" },
        audio: false,
      });
      const mime = MediaRecorder.isTypeSupported("video/webm")
        ? "video/webm"
        : "video/mp4";
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setHasRecording(true);
      };
      mediaRecorderRef.current = recorder;
      recorder.start(1000);
      setRecording(true);
      setRecordingDuration(0);
      recordingIntervalRef.current = setInterval(() => {
        setRecordingDuration((d) => d + 1);
      }, 1000);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not access screen. Grant permission to share.",
      );
    }
  };

  const stopRecordingFn = () => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.stop();
      setRecording(false);
    }
  };

  const getRecordedBlob = (): Blob | null => {
    if (chunksRef.current.length === 0) return null;
    const mime = mediaRecorderRef.current?.mimeType || "video/webm";
    return new Blob(chunksRef.current, { type: mime });
  };

  return (
    <div className="flex flex-1 overflow-auto">
      {/* Full-screen synthesis loader */}
      <MultiStepLoader
        loadingStates={SYNTHESIS_STEPS}
        loading={loading}
        duration={1800}
        loop={false}
      />

      <div className="flex h-full w-full flex-1 flex-col gap-4 rounded-tl-2xl border border-[#A577FF]/20 border-l-0 bg-white p-6 shadow-sm md:p-10">
        <h1 className="text-2xl font-semibold text-[#150A35]">New Workflow</h1>
        <p className="text-[#150A35]/80">
          Upload a video or screenshots to generate a workflow with AI.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {/* Workflow name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[#150A35]">Workflow Name</label>
            <input
              type="text"
              value={workflowName}
              onChange={(e) => setWorkflowName(e.target.value)}
              placeholder="My Workflow"
              className="rounded-lg border border-[#A577FF]/30 bg-white px-3 py-2 text-sm text-[#150A35] placeholder:text-gray-400 focus:border-[#A577FF] focus:outline-none focus:ring-1 focus:ring-[#A577FF]/30"
            />
          </div>
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => setMode("video")}
              className={`flex items-center gap-2 rounded-lg border px-4 py-2 ${
                mode === "video"
                  ? "border-[#A577FF] bg-[#A577FF]/10 text-[#A577FF]"
                  : "border-[#A577FF]/40 bg-white text-[#150A35]"
              }`}
            >
              <IconVideo className="h-5 w-5" />
              Video
            </button>
            <button
              type="button"
              onClick={() => setMode("screenshots")}
              className={`flex items-center gap-2 rounded-lg border px-4 py-2 ${
                mode === "screenshots"
                  ? "border-[#A577FF] bg-[#A577FF]/10 text-[#A577FF]"
                  : "border-[#A577FF]/40 bg-white text-[#150A35]"
              }`}
            >
              <IconPhoto className="h-5 w-5" />
              Screenshots
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("record");
                setHasRecording(false);
              }}
              disabled={recording}
              className={`flex items-center gap-2 rounded-lg border px-4 py-2 disabled:opacity-60 ${
                mode === "record"
                  ? "border-[#A577FF] bg-[#A577FF]/10 text-[#A577FF]"
                  : "border-[#A577FF]/40 bg-white text-[#150A35]"
              }`}
            >
              <IconPlayerRecord
                className={`h-5 w-5 ${recording ? "animate-pulse text-echo-error" : ""}`}
              />
              Record Screen
            </button>
          </div>

          {mode === "video" && (
            <div>
              <label className="mb-2 block text-sm font-medium text-[#150A35]">
                Video file
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/webm,video/quicktime,video/mov"
                onChange={handleVideoChange}
                className="block w-full text-sm text-[#150A35] file:mr-4 file:rounded-lg file:border-0 file:bg-[#A577FF] file:px-4 file:py-2 file:text-white"
              />
              {video && (
                <p className="mt-1 text-sm text-[#150A35]/70">{video.name}</p>
              )}
            </div>
          )}

          {mode === "record" && (
            <div>
              <label className="mb-2 block text-sm font-medium text-[#150A35]">
                Record your screen
              </label>
              <p className="mb-3 text-sm text-[#150A35]/70">
                Share your screen or a browser tab. The recording will be sent
                to AI to generate workflow steps.
              </p>
              <div className="flex items-center gap-3">
                {!recording ? (
                  <button
                    type="button"
                    onClick={startRecordingFn}
                    className="echo-btn-primary flex h-12 items-center gap-2"
                  >
                    <IconPlayerRecord className="h-5 w-5" />
                    Start Recording
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopRecordingFn}
                  className="flex h-12 items-center gap-2 rounded-lg border border-echo-error bg-echo-error/10 px-4 text-echo-error hover:bg-echo-error/20"
                >
                  <span className="h-3 w-3 rounded-full bg-echo-error animate-pulse" />
                    Stop Recording ({recordingDuration}s)
                  </button>
                )}
                {!recording && hasRecording && (
                  <span className="text-sm text-echo-success">
                    Recording saved. Create workflow below.
                  </span>
                )}
              </div>
            </div>
          )}

          {mode === "screenshots" && (
            <div>
              <label className="mb-2 block text-sm font-medium text-[#150A35]">
                Screenshots (ordered by filename)
              </label>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                onChange={handleScreenshotsChange}
                className="block w-full text-sm text-[#150A35] file:mr-4 file:rounded-lg file:border-0 file:bg-[#A577FF] file:px-4 file:py-2 file:text-white"
              />
              {screenshots.length > 0 && (
                <p className="mt-1 text-sm text-[#150A35]/70">
                  {screenshots.length} file(s):{" "}
                  {screenshots.map((f) => f.name).join(", ")}
                </p>
              )}
            </div>
          )}

          {error && <p className="text-sm text-echo-error">{error}</p>}

          <button
            type="submit"
            disabled={
              loading ||
              recording ||
              (mode === "video"
                ? !video
                : mode === "screenshots"
                  ? screenshots.length === 0
                  : !hasRecording)
            }
            className="echo-btn-primary flex h-12 w-fit items-center gap-2 disabled:opacity-50"
          >
            <IconUpload className="h-5 w-5" />
            {loading ? "Synthesizing…" : "Create Workflow"}
          </button>
        </form>
      </div>
    </div>
  );
}
