"use client";

import { FirebaseError } from "firebase/app";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

import { echoAttachDebug } from "@/lib/echo-attach-debug";
import { firebaseClientEnv } from "@/lib/firebase";
import { getFirebaseStorage } from "@/lib/firebase-storage";

function safeFileName(name: string): string {
  return name.replace(/[^\w.\-() ]/g, "_").slice(0, 120) || "file";
}

/** Picked files often report empty or generic MIME (esp. HEIC/Photos); infer from extension so Storage + previews work. */
const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".jfif": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".avif": "image/avif",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".m4v": "video/x-m4v",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
};

function extFromName(name: string): string {
  const m = name.toLowerCase().match(/\.[a-z0-9]+$/);
  return m ? m[0] : "";
}

export function resolveUploadMime(
  file: File | Blob,
  fileName: string,
  contentTypeHint?: string,
): string {
  const hint = contentTypeHint?.trim();
  if (hint && hint !== "application/octet-stream") return hint;
  const fromFile = file instanceof File ? file.type?.trim() : "";
  if (fromFile && fromFile !== "application/octet-stream") return fromFile;
  const ext = extFromName(fileName);
  if (ext && MIME_BY_EXT[ext]) return MIME_BY_EXT[ext];
  return fromFile || hint || "application/octet-stream";
}

/**
 * Uploads to `uploads/{uid}/workflow-context/{workflowId}/{stepId}/...` (see storage.rules).
 */
export async function uploadStepContextFile(
  uid: string,
  workflowId: string,
  stepId: string,
  file: File | Blob,
  fileName: string,
  contentType?: string,
): Promise<{ url: string; name: string; mime: string }> {
  const storage = getFirebaseStorage();
  if (!storage) {
    echoAttachDebug("uploadStepContextFile: getFirebaseStorage() null", {
      projectId: firebaseClientEnv.projectId,
      configured: firebaseClientEnv.configured,
    });
    throw new Error("Firebase Storage is not configured.");
  }
  const mime = resolveUploadMime(
    file,
    fileName,
    contentType ?? (file instanceof File ? file.type : undefined),
  );
  const safe = safeFileName(fileName);
  const objectPath = `uploads/${uid}/workflow-context/${workflowId}/${stepId}/${crypto.randomUUID()}-${safe}`;
  echoAttachDebug("uploadStepContextFile: uploading", {
    objectPath,
    mime,
    size: file instanceof Blob ? file.size : undefined,
    projectId: firebaseClientEnv.projectId,
  });
  const r = ref(storage, objectPath);
  try {
    await uploadBytes(r, file, { contentType: mime });
    const url = await getDownloadURL(r);
    echoAttachDebug("uploadStepContextFile: ok", { objectPath });
    return { url, name: file instanceof File ? file.name : fileName, mime };
  } catch (e) {
    if (e instanceof FirebaseError) {
      echoAttachDebug("uploadStepContextFile: FirebaseError", {
        code: e.code,
        message: e.message,
        objectPath,
      });
    } else {
      echoAttachDebug("uploadStepContextFile: error", {
        message: e instanceof Error ? e.message : String(e),
        objectPath,
      });
    }
    throw e;
  }
}
