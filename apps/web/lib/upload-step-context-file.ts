"use client";

import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

import { getFirebaseStorage } from "@/lib/firebase-storage";

function safeFileName(name: string): string {
  return name.replace(/[^\w.\-() ]/g, "_").slice(0, 120) || "file";
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
    throw new Error("Firebase Storage is not configured.");
  }
  const mime = contentType || (file instanceof File ? file.type : "") || "application/octet-stream";
  const safe = safeFileName(fileName);
  const objectPath = `uploads/${uid}/workflow-context/${workflowId}/${stepId}/${crypto.randomUUID()}-${safe}`;
  const r = ref(storage, objectPath);
  await uploadBytes(r, file, { contentType: mime });
  const url = await getDownloadURL(r);
  return { url, name: file instanceof File ? file.name : fileName, mime };
}
