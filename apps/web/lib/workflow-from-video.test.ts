import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
  agentFetch: vi.fn(),
  apiErrorMessage: vi.fn(async (_r: Response, fallback?: string) => fallback ?? "api-error"),
}));

import { agentFetch, apiFetch } from "@/lib/api";
import {
  DIRECT_UPLOAD_MAX_BYTES,
  guessVideoContentType,
  synthesizeWorkflowFromUploadedVideo,
  uploadWorkflowVideoToStorage,
} from "@/lib/workflow-from-video";

describe("guessVideoContentType", () => {
  it("uses file.type when present", () => {
    const f = new File([], "x.mp4", { type: "video/mp4" });
    expect(guessVideoContentType(f)).toBe("video/mp4");
  });

  it("infers from extension", () => {
    expect(guessVideoContentType(new File([], "a.webm", { type: "" }))).toBe("video/webm");
    expect(guessVideoContentType(new File([], "a.MOV", { type: "" }))).toBe("video/quicktime");
    expect(guessVideoContentType(new File([], "a.bin", { type: "" }))).toBe("video/mp4");
  });
});

describe("DIRECT_UPLOAD_MAX_BYTES", () => {
  it("is below common gateway limits", () => {
    expect(DIRECT_UPLOAD_MAX_BYTES).toBe(28 * 1024 * 1024);
  });
});

describe("uploadWorkflowVideoToStorage", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    vi.mocked(agentFetch).mockReset();
  });

  it("uses direct upload path when under size limit", async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      new Response(JSON.stringify({ gcs_path: "gs://bucket/obj" }), { status: 200 }),
    );
    const file = new File(["x"], "small.mp4", { type: "video/mp4" });
    Object.defineProperty(file, "size", { value: 1000 });
    const path = await uploadWorkflowVideoToStorage(file);
    expect(path).toBe("gs://bucket/obj");
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/storage/upload-recording",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws from apiErrorMessage when direct upload fails", async () => {
    vi.mocked(apiFetch).mockResolvedValue(new Response("nope", { status: 500 }));
    const file = new File(["x"], "small.mp4", { type: "video/mp4" });
    Object.defineProperty(file, "size", { value: 1000 });
    await expect(uploadWorkflowVideoToStorage(file)).rejects.toThrow("Upload failed");
  });
});

describe("synthesizeWorkflowFromUploadedVideo", () => {
  beforeEach(() => {
    vi.mocked(agentFetch).mockReset();
  });

  it("returns workflow id on success", async () => {
    vi.mocked(agentFetch).mockResolvedValue(
      new Response(JSON.stringify({ workflow_id: "wf-1" }), { status: 200 }),
    );
    await expect(synthesizeWorkflowFromUploadedVideo("gs://b/o")).resolves.toBe("wf-1");
  });

  it("throws when body lacks workflow id", async () => {
    vi.mocked(agentFetch).mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    await expect(synthesizeWorkflowFromUploadedVideo("gs://b/o")).rejects.toThrow(
      "No workflow id returned",
    );
  });
});
