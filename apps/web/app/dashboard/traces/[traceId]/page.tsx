"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { agentFetch } from "@/lib/api";
import { IconArrowLeft } from "@tabler/icons-react";

interface COCOImage {
  id: number;
  file_name: string;
  width: number;
  height: number;
  gcs_url?: string;
}

interface COCOAnnotation {
  id: number;
  image_id: number;
  bbox: number[];
  keypoints?: number[];
  attributes?: {
    task_description?: string;
    thought?: string;
    action_type?: string;
    quality?: string;
  };
}

interface COCOData {
  images: COCOImage[];
  annotations: COCOAnnotation[];
}

export default function TraceViewerPage() {
  const params = useParams();
  const traceId = params.traceId as string;
  const [coco, setCoco] = useState<COCOData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!traceId) return;
    agentFetch(`/api/traces/${traceId}/coco`)
      .then((r) => r.json())
      .then(setCoco)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [traceId]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-echo-text-muted">Loading trace…</p>
      </div>
    );
  }
  if (error || !coco) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <p className="text-echo-error">{error || "Failed to load trace"}</p>
        <Link
          href="/dashboard/traces"
          className="flex items-center gap-2 text-[#A577FF] hover:underline"
        >
          <IconArrowLeft className="h-4 w-4" />
          Back to traces
        </Link>
      </div>
    );
  }

  const imagesById = Object.fromEntries(coco.images.map((img) => [img.id, img]));

  return (
    <div className="flex flex-1 min-h-0">
      <div className="flex w-full flex-col gap-6 rounded-tl-2xl border border-[#A577FF]/20 border-l-0 bg-white p-6 shadow-sm md:p-10 overflow-y-auto">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/traces"
            className="flex items-center gap-2 text-[#A577FF] hover:underline text-sm font-medium"
          >
            <IconArrowLeft className="h-4 w-4" />
            Back
          </Link>
        </div>
        <h1 className="text-2xl font-semibold text-[#150A35]">Trace Viewer — {traceId}</h1>
        <p className="text-sm text-echo-text-muted -mt-4">
          COCO4GUI annotations. Edit and merge into the training pipeline.
        </p>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {coco.annotations.map((ann) => {
            const img = imagesById[ann.image_id];
            if (!img) return null;
            return (
              <div
                key={ann.id}
                className="rounded-xl border border-[#A577FF]/20 overflow-hidden bg-[#F5F7FC]"
              >
                <div className="aspect-video bg-[#150A35]/5 flex items-center justify-center overflow-hidden">
                  {img.gcs_url ? (
                    <img
                      src={img.gcs_url}
                      alt={img.file_name}
                      className="max-w-full max-h-48 object-contain"
                    />
                  ) : (
                    <span className="text-echo-text-muted text-sm">{img.file_name}</span>
                  )}
                </div>
                <div className="p-3 space-y-1">
                  <p className="text-xs font-mono text-[#A577FF]">
                    step {ann.id} · {ann.attributes?.action_type || "click"}
                  </p>
                  <p className="text-sm text-[#150A35] line-clamp-2">
                    {ann.attributes?.thought || ann.attributes?.task_description || "—"}
                  </p>
                  {ann.attributes?.quality && (
                    <span
                      className={`inline-block text-xs font-medium ${
                        ann.attributes.quality === "good"
                          ? "text-echo-success"
                          : ann.attributes.quality === "bad"
                          ? "text-echo-error"
                          : "text-echo-text-muted"
                      }`}
                    >
                      {ann.attributes.quality}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {coco.annotations.length === 0 && (
          <p className="text-echo-text-muted text-center py-8">No annotations in this trace.</p>
        )}
      </div>
    </div>
  );
}
