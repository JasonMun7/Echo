"use client";

import { useCallback, useId, useState, type ChangeEvent, type InputHTMLAttributes } from "react";
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
  nextAttachmentRefLabel,
  type ContextAttachment,
  MAX_ATTACHMENTS,
} from "@/lib/workflow-step-context-attachments";
import { echoAttachDebug } from "@/lib/echo-attach-debug";
import { attachmentKindFromFile, captureScreenAsPngBlob } from "@/lib/step-context-capture";
import { uploadStepContextFile } from "@/lib/upload-step-context-file";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

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
  const [attachOpen, setAttachOpen] = useState(false);
  const rid = useId();
  const imageId = `${rid}-echo-enrich-img`;
  const videoId = `${rid}-echo-enrich-vid`;
  const filesId = `${rid}-echo-enrich-files`;
  const folderId = `${rid}-echo-enrich-folder`;
  const pickDisabled = disabled || busy || !canAddAttachment(attachments);

  const uploadOne = useCallback(
    async (
      file: File,
      ref_label: string,
      overrideName?: string,
    ): Promise<ContextAttachment | null> => {
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
      const kind = attachmentKindFromFile(file, mime);
      return {
        id: crypto.randomUUID(),
        kind,
        url,
        name,
        mime,
        ref_label,
      };
    },
    [stepId, uid, workflowId],
  );

  const onPickFiles = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      e.target.value = "";
      if (!files?.length) {
        echoAttachDebug("StepContextEnrichment onPickFiles: no files", { workflowId, stepId });
        return;
      }
      echoAttachDebug("StepContextEnrichment onPickFiles: start", {
        workflowId,
        stepId,
        count: files.length,
        names: Array.from(files).map((f) => f.name),
      });
      setBusy(true);
      try {
        let list = [...attachments];
        for (const file of Array.from(files)) {
          if (list.length >= MAX_ATTACHMENTS) {
            toast.error(`Stopped at ${MAX_ATTACHMENTS} files total.`);
            break;
          }
          try {
            const ref = nextAttachmentRefLabel(list);
            echoAttachDebug("StepContextEnrichment uploadOne", {
              ref_label: ref,
              name: file.name,
              size: file.size,
            });
            const row = await uploadOne(file, ref);
            if (row) list = [...list, row];
          } catch (err) {
            echoAttachDebug("StepContextEnrichment uploadOne failed", {
              message: err instanceof Error ? err.message : String(err),
            });
            toast.error(err instanceof Error ? err.message : "Upload failed");
          }
        }
        if (list.length > attachments.length) {
          onChange(list);
          echoAttachDebug("StepContextEnrichment onPickFiles: done", {
            added: list.length - attachments.length,
          });
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
    [attachments, onChange, stepId, uploadOne, workflowId],
  );

  const captureScreen = useCallback(async () => {
    if (disabled || busy) return;
    if (!canAddAttachment(attachments)) {
      toast.error(`You can add up to ${MAX_ATTACHMENTS} files.`);
      return;
    }
    setBusy(true);
    try {
      echoAttachDebug("StepContextEnrichment captureScreen", { workflowId, stepId });
      const blob = await captureScreenAsPngBlob();
      const file = new File([blob], `screen-capture-${Date.now()}.png`, { type: "image/png" });
      const ref = nextAttachmentRefLabel(attachments);
      const row = await uploadOne(file, ref);
      if (row) {
        echoAttachDebug("StepContextEnrichment captureScreen: uploaded", { ref_label: ref });
        onChange([...attachments, row]);
        toast.success("Screen capture added");
      }
    } catch (e) {
      echoAttachDebug("StepContextEnrichment captureScreen error", {
        message: e instanceof Error ? e.message : String(e),
      });
      const msg = e instanceof Error ? e.message : "Screen capture failed";
      if (!/Permission|denied|Abort/i.test(msg)) {
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  }, [attachments, busy, disabled, onChange, stepId, uploadOne, workflowId]);

  const remove = (id: string) => {
    onChange(attachments.filter((a) => a.id !== id));
  };

  const handleAttachFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    echoAttachDebug("StepContextEnrichment input change", {
      inputId: e.target.id,
      accept: e.target.accept || "(any)",
      multiple: e.target.multiple,
      webkitdirectory: Boolean(
        (e.target as HTMLInputElement & { webkitdirectory?: boolean }).webkitdirectory,
      ),
      fileCount: list?.length ?? 0,
      names: list?.length ? Array.from(list).map((f) => f.name) : [],
    });
    void onPickFiles(e);
    setAttachOpen(false);
  };

  const rowClass = cn(
    "flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-[#150A35] hover:bg-[#150A35]/6",
    pickDisabled && "pointer-events-none opacity-50",
  );

  return (
    <div className="space-y-2">
      <input
        id={imageId}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        disabled={pickDisabled}
        onChange={handleAttachFiles}
      />
      <input
        id={videoId}
        type="file"
        accept="video/*"
        className="sr-only"
        tabIndex={-1}
        disabled={pickDisabled}
        onChange={handleAttachFiles}
      />
      <input
        id={filesId}
        type="file"
        multiple
        className="sr-only"
        tabIndex={-1}
        disabled={pickDisabled}
        onChange={handleAttachFiles}
      />
      <input
        id={folderId}
        type="file"
        multiple
        className="sr-only"
        tabIndex={-1}
        disabled={pickDisabled}
        onChange={handleAttachFiles}
        {...({ webkitdirectory: "", directory: "" } as InputHTMLAttributes<HTMLInputElement>)}
      />
      <div className="flex justify-end">
        <Popover modal={false} open={attachOpen} onOpenChange={setAttachOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              disabled={pickDisabled}
              className="shrink-0 border-[#A577FF]/35 text-[#150A35] hover:bg-[#A577FF]/10"
              aria-label="Add image, file, or screen capture"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Plus className="h-4 w-4" aria-hidden />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-56 p-1"
            onCloseAutoFocus={(e) => e.preventDefault()}
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <label htmlFor={imageId} className={rowClass}>
              <ImagePlus className="h-4 w-4 shrink-0 text-[#A577FF]" aria-hidden />
              Image
            </label>
            <label htmlFor={videoId} className={rowClass}>
              <Video className="h-4 w-4 shrink-0 text-[#A577FF]" aria-hidden />
              Video
            </label>
            <label htmlFor={filesId} className={rowClass}>
              <Paperclip className="h-4 w-4 shrink-0 text-[#A577FF]" aria-hidden />
              Files
            </label>
            <label htmlFor={folderId} className={rowClass}>
              <FolderOpen className="h-4 w-4 shrink-0 text-[#A577FF]" aria-hidden />
              Folder
            </label>
            <div className="my-1 h-px bg-border" />
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-[#150A35] hover:bg-[#150A35]/6"
              onClick={() => {
                setAttachOpen(false);
                void captureScreen();
              }}
            >
              <MonitorUp className="h-4 w-4 shrink-0 text-[#21C4DD]" aria-hidden />
              Capture screen
            </button>
          </PopoverContent>
        </Popover>
      </div>

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
      ) : null}
    </div>
  );
}
