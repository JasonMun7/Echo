"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { IconUpload, IconPhoto, IconVideo } from "@tabler/icons-react";

type Mode = "video" | "screenshots";

export default function NewWorkflowPage() {
  const [mode, setMode] = useState<Mode>("video");
  const [video, setVideo] = useState<File | null>(null);
  const [screenshots, setScreenshots] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const formData = new FormData();
      if (mode === "video" && video) {
        formData.append("video", video);
      } else if (mode === "screenshots" && screenshots.length > 0) {
        screenshots.forEach((f) => formData.append("screenshots", f));
      } else {
        setError("Please select a video or screenshots");
        setLoading(false);
        return;
      }

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

  return (
    <div className="flex flex-1 overflow-auto">
      <div className="flex h-full w-full flex-1 flex-col gap-4 rounded-tl-2xl border border-[#A577FF]/20 border-l-0 bg-white p-6 shadow-sm md:p-10">
        <h1 className="text-2xl font-semibold text-[#150A35]">New Workflow</h1>
        <p className="text-[#150A35]/80">
          Upload a video or screenshots to generate a workflow with AI.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
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
          </div>

          {mode === "video" && (
            <div>
              <label className="mb-2 block text-sm font-medium text-[#150A35]">
                Video file
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                onChange={handleVideoChange}
                className="block w-full text-sm text-[#150A35] file:mr-4 file:rounded-lg file:border-0 file:bg-[#A577FF] file:px-4 file:py-2 file:text-white"
              />
              {video && <p className="mt-1 text-sm text-[#150A35]/70">{video.name}</p>}
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
                  {screenshots.length} file(s): {screenshots.map((f) => f.name).join(", ")}
                </p>
              )}
            </div>
          )}

          {error && <p className="text-sm text-[#ef4444]">{error}</p>}

          <button
            type="submit"
            disabled={loading || (mode === "video" ? !video : screenshots.length === 0)}
            className="echo-btn-primary flex h-12 w-fit items-center gap-2 disabled:opacity-50"
          >
            <IconUpload className="h-5 w-5" />
            {loading ? "Synthesizing..." : "Create Workflow"}
          </button>
        </form>
      </div>
    </div>
  );
}
