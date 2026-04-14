"use client";

import { useCallback, useRef, useState, type InputHTMLAttributes } from "react";
import {
  FolderOpen,
  ImagePlus,
  Loader2,
  MonitorUp,
  Paperclip,
  Plus,
  Trash2,
  Video,
} from "lucide-react";
import { toast } from "sonner";

import {
  assertFileSize,
  canAddAttachment,
  type ContextAttachment,
  type ContextAttachmentKind,
  MAX_ATTACHMENTS,
} from "@/lib/workflow-step-context-attachments";
import { uploadStepContextFile } from "@/lib/upload-step-context-file";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

function kindFromMime(mime: string): ContextAttachmentKind {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return "file";
}

async function captureScreenAsPngBlob(): Promise<Blob> {
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

type StepContextEnrichmentProps = {
  workflowId: string;
  stepId: string;
  uid: string;
  attachments: ContextAttachment[];
  disabled?: boolean;
  onChange: (next: ContextAttachment[]) => void;
};

export function StepContextEnrichment({
  workflowId,
  stepId,
  uid,
  attachments,
  disabled,
  onChange,
}: StepContextEnrichmentProps) {
  const [busy, setBusy] = useState(false);
  const imgRef = useRef<HTMLInputElement>(null);
  const vidRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  const uploadOne = useCallback(
    async (file: File, overrideName?: string): Promise<ContextAttachment | null> => {
      const sizeErr = assertFileSize(file);
      if (sizeErr) {
        toast.error(sizeErr);
        return null;
      }
      const { url, name, mime } = await uploadStepContextFile(
        uid,
        workflowId,
        stepId,
        file,
        overrideName ?? file.name,
        file.type,
      );
      const kind = kindFromMime(mime);
      return {
        id: crypto.randomUUID(),
        kind,
        url,
        name,
        mime,
      };
    },
    [stepId, uid, workflowId],
  );

  const onPickFiles = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      e.target.value = "";
      if (!files?.length) return;
      setBusy(true);
      try {
        let list = [...attachments];
        for (const file of Array.from(files)) {
          if (list.length >= MAX_ATTACHMENTS) {
            toast.error(`Stopped at ${MAX_ATTACHMENTS} files total.`);
            break;
          }
          try {
            const row = await uploadOne(file);
            if (row) list = [...list, row];
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Upload failed");
          }
        }
        if (list.length > attachments.length) {
          onChange(list);
          toast.success(
            list.length - attachments.length === 1
              ? "Context added"
              : `${list.length - attachments.length} files added`,
          );
        }
      } finally {
        setBusy(false);
      }
    },
    [attachments, onChange, uploadOne],
  );

  const captureScreen = useCallback(async () => {
    if (disabled || busy) return;
    if (!canAddAttachment(attachments)) {
      toast.error(`You can add up to ${MAX_ATTACHMENTS} files.`);
      return;
    }
    setBusy(true);
    try {
      const blob = await captureScreenAsPngBlob();
      const file = new File([blob], `screen-capture-${Date.now()}.png`, { type: "image/png" });
      const row = await uploadOne(file);
      if (row) {
        onChange([...attachments, row]);
        toast.success("Screen capture added");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Screen capture failed";
      if (!/Permission|denied|Abort/i.test(msg)) {
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  }, [attachments, busy, disabled, onChange, uploadOne]);

  const remove = (id: string) => {
    onChange(attachments.filter((a) => a.id !== id));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-[#150A35]/80">Extra context</p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || busy || !canAddAttachment(attachments)}
              className="h-8 gap-1.5 border-[#A577FF]/35 text-xs text-[#150A35] hover:bg-[#A577FF]/10"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Plus className="h-3.5 w-3.5" aria-hidden />
              )}
              Add
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onSelect={() => imgRef.current?.click()} className="gap-2 text-sm">
              <ImagePlus className="h-4 w-4 text-[#A577FF]" aria-hidden />
              Image
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => vidRef.current?.click()} className="gap-2 text-sm">
              <Video className="h-4 w-4 text-[#A577FF]" aria-hidden />
              Video
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => fileRef.current?.click()} className="gap-2 text-sm">
              <Paperclip className="h-4 w-4 text-[#A577FF]" aria-hidden />
              Files
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => folderRef.current?.click()} className="gap-2 text-sm">
              <FolderOpen className="h-4 w-4 text-[#A577FF]" aria-hidden />
              Folder
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void captureScreen()} className="gap-2 text-sm">
              <MonitorUp className="h-4 w-4 text-[#21C4DD]" aria-hidden />
              Capture screen
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <p className="text-[11px] leading-snug text-[#6b7280]">
        Uploads go to your Firebase Storage. Collaborators open the same step to view. Screen
        capture asks which window or screen to share.
      </p>

      <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={onPickFiles} />
      <input ref={vidRef} type="file" accept="video/*" className="hidden" onChange={onPickFiles} />
      <input ref={fileRef} type="file" multiple className="hidden" onChange={onPickFiles} />
      <input
        ref={folderRef}
        type="file"
        className="hidden"
        multiple
        onChange={onPickFiles}
        {...({ webkitdirectory: "" } as InputHTMLAttributes<HTMLInputElement>)}
      />

      {attachments.length > 0 ? (
        <ul className="space-y-2">
          {attachments.map((a) => (
            <li
              key={a.id}
              className="flex items-start gap-2 rounded-lg border border-[#150A35]/10 bg-[#F5F7FC]/80 p-2"
            >
              <div className="min-w-0 flex-1">
                {a.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element -- user / Firebase URLs
                  <img src={a.url} alt="" className="max-h-28 w-full rounded-md object-contain" />
                ) : a.kind === "video" ? (
                  <video
                    src={a.url}
                    className="max-h-36 w-full rounded-md bg-black/80"
                    controls
                    preload="metadata"
                  />
                ) : (
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-xs font-medium text-[#A577FF] underline-offset-2 hover:underline"
                  >
                    {a.name}
                  </a>
                )}
                <p className="mt-1 truncate text-[11px] text-[#6b7280]" title={a.name}>
                  {a.name}
                </p>
              </div>
              <button
                type="button"
                disabled={disabled || busy}
                onClick={() => remove(a.id)}
                className={cn(
                  "shrink-0 rounded-md p-1.5 text-[#6b7280] transition hover:bg-red-50 hover:text-red-600",
                  (disabled || busy) && "pointer-events-none opacity-50",
                )}
                aria-label={`Remove ${a.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed border-[#150A35]/15 bg-white/60 px-3 py-4 text-center text-[11px] text-[#150A35]/50">
          No extra images, videos, or files yet.
        </p>
      )}
    </div>
  );
}
