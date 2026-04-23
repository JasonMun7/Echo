"use client";

import { useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";

/** Log failed context-media responses (JSON `detail` includes `req_id` for server log correlation). */
export function logContextMediaHttpError(
  workflowId: string,
  res: Response,
  bodyText: string,
): void {
  let detail: unknown = bodyText.slice(0, 800);
  try {
    const parsed = JSON.parse(bodyText) as { detail?: unknown };
    detail = parsed.detail ?? parsed;
  } catch {
    /* keep truncated text */
  }
  console.warn("[Echo context-media]", {
    workflowId,
    status: res.status,
    requestId: res.headers.get("X-Echo-Request-Id"),
    detail,
  });
}

/** Firebase Storage download URLs work in `<img>` without a backend proxy. */
export function isFirebaseStorageDownloadUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    return (
      u.hostname === "firebasestorage.googleapis.com" &&
      u.pathname.includes("/o/") &&
      (u.searchParams.has("token") || u.searchParams.get("alt") === "media")
    );
  } catch {
    return false;
  }
}

/**
 * GCS signed URLs and `gs://` links often fail in `<img src>` / `<video src>` (Referrer / CORP).
 * Those should be loaded via POST /api/workflows/:id/context-media + blob URLs instead.
 */
export function shouldProxyStepContextMediaUrl(url: string): boolean {
  const t = url.trim();
  if (!t || t.startsWith("blob:") || t.startsWith("data:")) return false;
  if (t.startsWith("gs://")) return true;
  try {
    const u = new URL(t);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    if (isFirebaseStorageDownloadUrl(t)) return false;
    if (u.hostname === "storage.googleapis.com" || u.hostname === "storage.cloud.google.com") {
      return true;
    }
    if (u.hostname === "www.googleapis.com") {
      const p = u.pathname;
      return p.includes("/storage/v1/b/") || p.includes("/download/storage/v1/b/");
    }
    if (u.hostname.endsWith(".storage.googleapis.com")) return true;
    return false;
  } catch {
    return true;
  }
}

export function useResolvedStepContextMediaUrl(
  workflowId: string | undefined,
  rawUrl: string | undefined,
): { displayUrl: string | undefined; loading: boolean; failed: boolean } {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const blobUrlRef = useRef<string | null>(null);

  const trimmed = rawUrl?.trim() ?? "";
  const needsProxy = Boolean(workflowId && trimmed && shouldProxyStepContextMediaUrl(trimmed));

  useEffect(() => {
    if (!needsProxy || !workflowId || !trimmed) {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      setBlobUrl(null);
      setFailed(false);
      return;
    }

    let cancelled = false;
    const ac = new AbortController();
    setFailed(false);
    setBlobUrl(null);
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    void apiFetch(`/api/workflows/${workflowId}/context-media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ src: trimmed }),
      signal: ac.signal,
    })
      .then(async (r) => {
        if (r.ok) return r.blob();
        const bodyText = await r.text();
        logContextMediaHttpError(workflowId, r, bodyText);
        throw new Error(`context-media ${r.status}`);
      })
      .then((blob) => {
        if (cancelled) return;
        if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = URL.createObjectURL(blob);
        setBlobUrl(blobUrlRef.current);
      })
      .catch(() => {
        if (!cancelled && !ac.signal.aborted) setFailed(true);
      });

    return () => {
      cancelled = true;
      ac.abort();
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [needsProxy, workflowId, trimmed]);

  if (!trimmed) return { displayUrl: undefined, loading: false, failed: false };
  if (!needsProxy) return { displayUrl: trimmed, loading: false, failed: false };
  if (failed) return { displayUrl: undefined, loading: false, failed: true };
  return { displayUrl: blobUrl ?? undefined, loading: !blobUrl, failed: false };
}
