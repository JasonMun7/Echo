import type { ContextAttachmentKind } from "@/lib/workflow-step-context-attachments";

export function kindFromMime(mime: string): ContextAttachmentKind {
  const m = mime.toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  return "file";
}

/** If MIME is still generic, infer image/video from filename (pairs with resolveUploadMime). */
export function attachmentKindFromFile(file: File, resolvedMime: string): ContextAttachmentKind {
  const k = kindFromMime(resolvedMime);
  if (k !== "file") return k;
  const n = file.name.toLowerCase();
  if (/\.(png|jpe?g|gif|webp|bmp|svg|ico|heic|heif|avif|tiff?)$/.test(n)) return "image";
  if (/\.(mp4|mpe?g|webm|mov|m4v|mkv|avi)$/.test(n)) return "video";
  return "file";
}

export async function captureScreenAsPngBlob(): Promise<Blob> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getDisplayMedia) {
    throw new Error("Screen capture is not supported in this browser.");
  }
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: false,
  });
  const video = document.createElement("video");
  video.srcObject = stream;
  video.playsInline = true;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Could not read display stream"));
      void video.play().catch(reject);
    });
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) throw new Error("Could not read display size");
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not available");
    ctx.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
    if (!blob) throw new Error("Could not encode screenshot");
    return blob;
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}
