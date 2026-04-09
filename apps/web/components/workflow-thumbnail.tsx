"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Fetches a workflow's cover image and renders it as an object URL.
 *
 * The component requests the thumbnail blob via an authenticated API call, creates a browser
 * object URL for rendering, and revokes any previously created object URL to avoid leaks.
 * If the fetch or image load fails, the component renders nothing.
 *
 * @param workflowId - Workflow identifier used to fetch the thumbnail
 * @param heightClass - Tailwind CSS height class applied to the container (default: `"h-28"`)
 * @returns A JSX element containing the thumbnail image or a skeleton while loading; `null` if loading or rendering fails
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
