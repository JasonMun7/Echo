import { agentFetch, apiErrorMessage, apiFetch } from "@/lib/api";

/** Below ~32MB body limits on many gateways; larger files use signed GCS upload + synthesis by `gs` path. */
export const DIRECT_UPLOAD_MAX_BYTES = 28 * 1024 * 1024;

export function guessVideoContentType(file: File): string {
  if (file.type && file.type.startsWith("video/")) return file.type;
  const n = file.name.toLowerCase();
  if (n.endsWith(".webm")) return "video/webm";
  if (n.endsWith(".mov")) return "video/quicktime";
  return "video/mp4";
}

/** Uploads video to storage; returns GCS path for synthesis. */
export async function uploadWorkflowVideoToStorage(file: File): Promise<string> {
  if (file.size > DIRECT_UPLOAD_MAX_BYTES) {
    const ct = guessVideoContentType(file);
    const signedRes = await apiFetch("/api/storage/signed-upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name || `upload-${Date.now()}.mp4`,
        content_type: ct,
      }),
    });
    if (!signedRes.ok) {
      throw new Error(await apiErrorMessage(signedRes, "Could not start upload"));
    }
    const signedJson = (await signedRes.json().catch(() => ({}))) as {
      signed_url?: string;
      gcs_path?: string;
      detail?: string;
    };
    const putUrl = signedJson.signed_url;
    const gcsPath = signedJson.gcs_path ?? "";
    if (!putUrl || !gcsPath) throw new Error("Invalid signed upload response");

    const putRes = await fetch(putUrl, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": ct },
    });
    if (!putRes.ok) {
      throw new Error(`Upload failed (${putRes.status})`);
    }
    return gcsPath;
  }

  const formData = new FormData();
  formData.append("video", file, file.name || "recording.mp4");
  const upRes = await apiFetch("/api/storage/upload-recording", {
    method: "POST",
    body: formData,
  });
  if (!upRes.ok) {
    throw new Error(await apiErrorMessage(upRes, "Upload failed"));
  }
  const upData = (await upRes.json().catch(() => ({}))) as { gcs_path?: string; detail?: string };
  const gcsPath = upData.gcs_path ?? "";
  if (!gcsPath) throw new Error("No storage path returned");
  return gcsPath;
}

/** Starts synthesis from an uploaded recording path; returns new workflow id. */
export async function synthesizeWorkflowFromUploadedVideo(gcsPath: string): Promise<string> {
  const formData = new FormData();
  formData.append("video_gcs_path", gcsPath);
  const synthRes = await agentFetch("/api/synthesize", {
    method: "POST",
    body: formData,
  });
  if (!synthRes.ok) {
    throw new Error(await apiErrorMessage(synthRes, "Synthesis failed"));
  }
  const synthData = (await synthRes.json().catch(() => ({}))) as {
    workflow_id?: string;
    detail?: string;
  };
  const wfId = synthData.workflow_id;
  if (!wfId) throw new Error("No workflow id returned from synthesis");
  return wfId;
}

export async function createWorkflowFromVideoFile(file: File): Promise<string> {
  const gcsPath = await uploadWorkflowVideoToStorage(file);
  return synthesizeWorkflowFromUploadedVideo(gcsPath);
}
