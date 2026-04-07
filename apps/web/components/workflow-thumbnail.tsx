"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loads workflow cover art via authenticated GET (blob URL). Avoids production issues
 * with embedding GCS signed URLs in `<img src>` (cross-origin / referrer policies).
 */
export function WorkflowThumbnail({
  workflowId,
  heightClass = "h-28",
}: {
  workflowId: string;
  /** Container height, e.g. h-28 (dashboard) or h-36 (workflows list) */
  heightClass?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setSrc(null);
    apiFetch(`/api/workflows/${workflowId}/thumbnail/image`)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error("thumbnail"))))
      .then((blob) => {
        if (cancelled) return;
        if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = URL.createObjectURL(blob);
        setSrc(blobUrlRef.current);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [workflowId]);

  if (failed) return null;

  if (!src) {
    return <Skeleton className={`${heightClass} w-full rounded-none`} />;
  }

  return (
    <div
      className={`relative ${heightClass} w-full overflow-hidden bg-[#F5F7FC]`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Workflow screenshot"
        className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.02]"
        onError={() => setFailed(true)}
      />
      <div className="absolute inset-0 bg-linear-to-t from-white/60 via-transparent to-transparent" />
    </div>
  );
}
