"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
} from "react";
import {
  FolderOpen,
  ImagePlus,
  Loader2,
  Mic,
  MonitorUp,
  Paperclip,
  Plus,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  assertFileSize,
  canAddAttachment,
  nextAttachmentRefLabel,
  type ContextAttachment,
  MAX_ATTACHMENTS,
} from "@/lib/workflow-step-context-attachments";
import {
  appendContextTokenToPrompt,
  friendlyLabelForAttachment,
  migratePromptTokensToCanonical,
} from "@/lib/context-prompt-tokens";
import { IconPaperclip, IconPhoto, IconVideo } from "@tabler/icons-react";
import { attachmentKindFromFile, captureScreenAsPngBlob } from "@/lib/step-context-capture";
import { echoAttachDebug } from "@/lib/echo-attach-debug";
import { uploadStepContextFile } from "@/lib/upload-step-context-file";
import { ContextPromptRichField } from "@/components/echo-flow/context-prompt-rich-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { GradientIconTag } from "@/components/ui/gradient-icon-well";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** Label-only gradient pill (preview strip — removal is the corner control, not this pill). */
function ContextRefLabel({ label, kind }: { label: string; kind: "image" | "video" | "file" }) {
  const KindIcon = kind === "image" ? IconPhoto : kind === "video" ? IconVideo : IconPaperclip;
  return (
    <GradientIconTag
      size="sm"
      className="max-w-full min-w-0"
      innerClassName="inline-flex min-w-0 max-w-full items-center justify-start gap-1 !px-1.5 !py-0.5 text-[#150A35]"
    >
      <KindIcon className="h-3 w-3 shrink-0 text-[#150A35]" stroke={2} aria-hidden />
      <span className="min-w-0 truncate text-[10px] font-semibold">{label}</span>
    </GradientIconTag>
  );
}

function PreviewRemoveButton({
  disabled,
  onRemove,
  label,
  variant = "thumbnail",
}: {
  disabled?: boolean;
  onRemove: () => void;
  label: string;
  /** Thumbnail previews (image/video): larger top-right. File row: smaller, vertically centered. */
  variant?: "thumbnail" | "file";
}) {
  const isFile = variant === "file";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onRemove();
      }}
      className={cn(
        "absolute right-1 z-[3] flex items-center justify-center rounded-full bg-black/50 text-white shadow-sm backdrop-blur-sm transition hover:bg-black/65 disabled:opacity-40",
        isFile
          ? "top-1/2 right-1.5 h-5 w-5 min-h-0 min-w-0 -translate-y-1/2 p-0"
          : "right-1 top-1 h-7 w-7",
      )}
      aria-label={`Remove ${label} from context`}
    >
      <X className={isFile ? "h-2.5 w-2.5 shrink-0" : "h-3.5 w-3.5"} strokeWidth={2} />
    </button>
  );
}

function ContextAttachmentPreview({
  a,
  attachments,
  disabled,
  onRemove,
}: {
  a: ContextAttachment;
  attachments: ContextAttachment[];
  disabled?: boolean;
  onRemove: () => void;
}) {
  const { label, kind } = friendlyLabelForAttachment(a, attachments);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  if (a.kind === "image") {
    return (
      <>
        <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
          <DialogContent className="max-h-[90vh] max-w-[min(96vw,56rem)] gap-0 overflow-hidden border bg-card p-3 sm:p-4">
            <DialogTitle className="sr-only">Preview: {label}</DialogTitle>
            {/* eslint-disable-next-line @next/next/no-img-element -- Firebase download URLs */}
            <img
              src={a.url}
              alt={a.name || label}
              className="mx-auto max-h-[min(85vh,900px)] w-auto max-w-full object-contain"
            />
          </DialogContent>
        </Dialog>
        <div className="relative inline-block w-fit max-w-[min(100%,14rem)] align-top">
          <div className="relative w-fit overflow-hidden rounded-lg border border-[#150A35]/12 bg-[#f3f4f6] shadow-sm">
            <PreviewRemoveButton disabled={disabled} onRemove={onRemove} label={label} />
            <button
              type="button"
              disabled={disabled}
              onClick={() => setLightboxOpen(true)}
              className="relative block w-fit cursor-zoom-in p-0 disabled:cursor-not-allowed disabled:opacity-60"
              aria-label={`Open larger preview of ${label}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- Firebase download URLs */}
              <img
                src={a.url}
                alt=""
                className="block h-auto max-h-40 w-auto max-w-full object-contain align-middle"
                loading="lazy"
              />
            </button>
            <div className="pointer-events-none absolute bottom-1.5 left-1.5 right-1.5 z-[1] max-w-[calc(100%-0.75rem)]">
              <ContextRefLabel label={label} kind={kind} />
            </div>
          </div>
        </div>
      </>
    );
  }

  if (a.kind === "video") {
    return (
      <>
        <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
          <DialogContent className="max-h-[90vh] max-w-[min(96vw,56rem)] gap-0 overflow-hidden border bg-card p-3 sm:p-4">
            <DialogTitle className="sr-only">Preview: {label}</DialogTitle>
            <video
              src={a.url}
              className="mx-auto max-h-[min(85vh,900px)] w-full max-w-full bg-black object-contain"
              controls
              playsInline
              aria-label={a.name || label}
            />
          </DialogContent>
        </Dialog>
        <div className="relative inline-block w-fit max-w-[min(100%,14rem)] align-top">
          <div className="relative w-fit overflow-hidden rounded-lg border border-[#150A35]/12 bg-black shadow-sm">
            <PreviewRemoveButton disabled={disabled} onRemove={onRemove} label={label} />
            <button
              type="button"
              disabled={disabled}
              onClick={() => setLightboxOpen(true)}
              className="relative block w-fit cursor-pointer p-0 disabled:cursor-not-allowed disabled:opacity-60"
              aria-label={`Open larger preview of ${label}`}
            >
              <video
                src={a.url}
                className="block h-auto max-h-40 w-auto max-w-full object-contain align-middle"
                muted
                playsInline
                preload="metadata"
                aria-label={a.name}
              />
            </button>
            <div className="pointer-events-none absolute bottom-1.5 left-1.5 right-1.5 z-[1] max-w-[calc(100%-0.75rem)]">
              <ContextRefLabel label={label} kind={kind} />
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <span className="relative inline-flex max-w-[min(100%,18rem)] items-center gap-2 rounded-lg border border-[#150A35]/12 bg-white py-1.5 pl-2 pr-8 text-xs shadow-sm">
      <PreviewRemoveButton disabled={disabled} onRemove={onRemove} label={a.name} variant="file" />
      <IconPaperclip className="h-3.5 w-3.5 shrink-0 text-[#150A35]/55" stroke={2} aria-hidden />
      <span className="min-w-0 flex-1 truncate font-medium text-[#150A35]" title={a.name}>
        {a.name}
      </span>
      <ContextRefLabel label={label} kind="file" />
    </span>
  );
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const DICTATION_BAR_COUNT = 22;

function formatListenTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

/** Waveform: animates only while `active` (user is speaking / sound detected). */
function DictationWaveform({ active }: { active: boolean }) {
  return (
    <div
      className="flex h-7 w-full min-w-0 items-end justify-center gap-[2px] overflow-hidden"
      role="presentation"
      aria-hidden
    >
      {Array.from({ length: DICTATION_BAR_COUNT }, (_, i) => {
        const idleH = 3 + (i % 3);
        const speakH = 5 + ((i * 3 + (i % 4)) % 12);
        const h = active ? speakH : idleH;
        return (
          <span
            key={i}
            className={cn(
              "w-[2px] max-h-[22px] min-h-[3px] rounded-full bg-gradient-to-t from-[#150A35]/20 via-[#A577FF]/55 to-[#21C4DD]/80 transition-opacity duration-150",
              active && "animate-echo-dictation-bar",
              !active && "opacity-50",
            )}
            style={{
              height: `${h}px`,
              animationDelay: active ? `${(i * 0.045) % 0.5}s` : undefined,
            }}
          />
        );
      })}
    </div>
  );
}

function ContextAttachPopover({
  busy,
  addDisabled,
  onPickFiles,
  captureScreen,
}: {
  busy: boolean;
  addDisabled: boolean;
  onPickFiles: (e: ChangeEvent<HTMLInputElement>) => void;
  captureScreen: () => void;
}) {
  const [open, setOpen] = useState(false);

  /**
   * Each row wraps a hidden `<input type="file">` in a `<label>` so the OS picker stays tied to
   * a real click target inside the popover (labels pointing at inputs *outside* Radix’s portal
   * can fail to open the picker or fire change reliably in some browsers).
   */
  const handleFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    echoAttachDebug("ContextAttachPopover input change", {
      accept: e.target.accept || "(any)",
      multiple: e.target.multiple,
      webkitdirectory: Boolean(
        (e.target as HTMLInputElement & { webkitdirectory?: boolean }).webkitdirectory,
      ),
      fileCount: list?.length ?? 0,
      names: list?.length ? Array.from(list).map((f) => f.name) : [],
    });
    onPickFiles(e);
    setOpen(false);
  };

  const rowClass = cn(
    "flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-[#150A35] hover:bg-[#150A35]/6",
    addDisabled && "pointer-events-none opacity-50",
  );

  const menuIconClass = "h-4 w-4 shrink-0 text-[#150A35]/60";

  return (
    <Popover modal={false} open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          disabled={addDisabled}
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
        align="start"
        className="w-56 p-1"
        onCloseAutoFocus={(e) => e.preventDefault()}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <label className={rowClass}>
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            tabIndex={-1}
            disabled={addDisabled}
            onChange={handleFiles}
          />
          <ImagePlus className={menuIconClass} aria-hidden />
          Image
        </label>
        <label className={rowClass}>
          <input
            type="file"
            accept="video/*"
            className="sr-only"
            tabIndex={-1}
            disabled={addDisabled}
            onChange={handleFiles}
          />
          <Video className={menuIconClass} aria-hidden />
          Video
        </label>
        <label className={rowClass}>
          <input
            type="file"
            multiple
            className="sr-only"
            tabIndex={-1}
            disabled={addDisabled}
            onChange={handleFiles}
          />
          <Paperclip className={menuIconClass} aria-hidden />
          Files
        </label>
        <label className={rowClass}>
          <input
            type="file"
            multiple
            className="sr-only"
            tabIndex={-1}
            disabled={addDisabled}
            onChange={handleFiles}
            {...({ webkitdirectory: "", directory: "" } as InputHTMLAttributes<HTMLInputElement>)}
          />
          <FolderOpen className={menuIconClass} aria-hidden />
          Folder
        </label>
        <div className="my-1 h-px bg-border" />
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-[#150A35] hover:bg-[#150A35]/6"
          onClick={() => {
            setOpen(false);
            captureScreen();
          }}
        >
          <MonitorUp className={menuIconClass} aria-hidden />
          Capture screen
        </button>
      </PopoverContent>
    </Popover>
  );
}

export type StepContextComposerProps = {
  workflowId: string;
  stepId: string;
  uid: string;
  prompt: string;
  onPromptChange: (next: string) => void;
  attachments: ContextAttachment[];
  onAttachmentsChange: (next: ContextAttachment[]) => void;
  disabled?: boolean;
  placeholder?: string;
};

/**
 * Chat-style context: media chips on top (with @c1 refs), then + | textarea | mic;
 * when the prompt grows past one line, textarea is full width with + and mic on a row below.
 */
export function StepContextComposer({
  workflowId,
  stepId,
  uid,
  prompt,
  onPromptChange,
  attachments,
  onAttachmentsChange,
  disabled,
  placeholder = "Describe what the agent should wait for. Tags for uploads appear in this text as you add files.",
}: StepContextComposerProps) {
  const [busy, setBusy] = useState(false);
  /** Mic session armed — like a recorder; user stops manually. */
  const [recording, setRecording] = useState(false);
  /** True while the browser reports sound/speech (waveform + mic pulse). */
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [listenElapsedMs, setListenElapsedMs] = useState(0);
  /** Second toolbar row only when the prompt has a newline (avoids DOM height measure fighting the editor). */
  const isMultiLine = useMemo(
    () => migratePromptTokensToCanonical(prompt).includes("\n"),
    [prompt],
  );
  const taRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<SpeechRecognition | null>(null);
  const promptRef = useRef(prompt);
  promptRef.current = prompt;
  const onPromptChangeRef = useRef(onPromptChange);
  onPromptChangeRef.current = onPromptChange;

  const dictationSupported = typeof window !== "undefined" && Boolean(getSpeechRecognitionCtor());

  useEffect(() => {
    const m = migratePromptTokensToCanonical(prompt);
    if (m !== prompt) onPromptChangeRef.current(m);
  }, [prompt]);

  useEffect(() => {
    return () => {
      try {
        recRef.current?.stop();
      } catch {
        /* ignore */
      }
    };
  }, []);

  useEffect(() => {
    if (!recording) {
      setListenElapsedMs(0);
      return;
    }
    const t0 = Date.now();
    const id = window.setInterval(() => {
      setListenElapsedMs(Date.now() - t0);
    }, 120);
    return () => clearInterval(id);
  }, [recording]);

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
      const raw = e.target.files;
      const fileArray = raw?.length ? Array.from(raw) : [];
      e.target.value = "";
      if (!fileArray.length) {
        echoAttachDebug("StepContextComposer onPickFiles: no files (cancelled or empty)", {
          workflowId,
          stepId,
        });
        return;
      }
      echoAttachDebug("StepContextComposer onPickFiles: start", {
        workflowId,
        stepId,
        count: fileArray.length,
        names: fileArray.map((f) => f.name),
      });
      setBusy(true);
      try {
        let list = [...attachments];
        let nextPrompt = promptRef.current;
        for (const file of fileArray) {
          if (list.length >= MAX_ATTACHMENTS) {
            toast.error(`Stopped at ${MAX_ATTACHMENTS} files total.`);
            break;
          }
          try {
            const ref = nextAttachmentRefLabel(list);
            echoAttachDebug("StepContextComposer uploadOne", {
              ref_label: ref,
              name: file.name,
              size: file.size,
            });
            const row = await uploadOne(file, ref);
            if (row) {
              list = [...list, row];
              nextPrompt = appendContextTokenToPrompt(nextPrompt, row.ref_label);
            }
          } catch (err) {
            echoAttachDebug("StepContextComposer uploadOne failed", {
              message: err instanceof Error ? err.message : String(err),
            });
            toast.error(err instanceof Error ? err.message : "Upload failed");
          }
        }
        if (list.length > attachments.length) {
          onAttachmentsChange(list);
          onPromptChange(nextPrompt);
          echoAttachDebug("StepContextComposer onPickFiles: done", {
            added: list.length - attachments.length,
          });
          toast.success(
            list.length - attachments.length === 1
              ? "Added to context"
              : `${list.length - attachments.length} files added`,
          );
        }
      } finally {
        setBusy(false);
      }
    },
    [attachments, onAttachmentsChange, onPromptChange, stepId, uploadOne, workflowId],
  );

  const captureScreen = useCallback(async () => {
    if (disabled || busy) return;
    if (!canAddAttachment(attachments)) {
      toast.error(`You can add up to ${MAX_ATTACHMENTS} files.`);
      return;
    }
    setBusy(true);
    try {
      echoAttachDebug("StepContextComposer captureScreen: getDisplayMedia / capture", {
        workflowId,
        stepId,
      });
      const blob = await captureScreenAsPngBlob();
      const file = new File([blob], `screen-capture-${Date.now()}.png`, { type: "image/png" });
      const ref = nextAttachmentRefLabel(attachments);
      const row = await uploadOne(file, ref);
      if (row) {
        echoAttachDebug("StepContextComposer captureScreen: uploaded", { ref_label: ref });
        onAttachmentsChange([...attachments, row]);
        onPromptChange(appendContextTokenToPrompt(promptRef.current, row.ref_label));
        toast.success("Screenshot added to context");
      }
    } catch (e) {
      echoAttachDebug("StepContextComposer captureScreen error", {
        message: e instanceof Error ? e.message : String(e),
      });
      const msg = e instanceof Error ? e.message : "Screen capture failed";
      if (!/Permission|denied|Abort/i.test(msg)) {
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  }, [
    attachments,
    busy,
    disabled,
    onAttachmentsChange,
    onPromptChange,
    stepId,
    uploadOne,
    workflowId,
  ]);

  const remove = (id: string) => {
    onAttachmentsChange(attachments.filter((a) => a.id !== id));
  };

  const toggleDictation = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor || disabled) return;
    if (recording) {
      try {
        recRef.current?.stop();
      } catch {
        /* ignore */
      }
      setRecording(false);
      setIsSpeaking(false);
      return;
    }
    const r = new Ctor();
    recRef.current = r;
    r.lang = navigator.language || "en-US";
    r.interimResults = true;
    r.continuous = true;

    const markSpeaking = () => setIsSpeaking(true);
    const markSilent = () => setIsSpeaking(false);

    // Prefer sound energy (true “speaking”); speech* is a fallback where sound* is missing.
    const ext = r as SpeechRecognition & {
      onsoundstart: ((this: SpeechRecognition, ev: Event) => void) | null;
      onsoundend: ((this: SpeechRecognition, ev: Event) => void) | null;
      onspeechstart: ((this: SpeechRecognition, ev: Event) => void) | null;
      onspeechend: ((this: SpeechRecognition, ev: Event) => void) | null;
    };
    ext.onsoundstart = markSpeaking;
    ext.onsoundend = markSilent;
    ext.onspeechstart = markSpeaking;
    ext.onspeechend = markSilent;

    r.onresult = (ev: SpeechRecognitionEvent) => {
      const parts: string[] = [];
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        if (res.isFinal) {
          const t = res[0]?.transcript?.trim() ?? "";
          if (t) parts.push(t);
        }
      }
      if (parts.length === 0) return;
      const chunk = parts.join(" ").trim();
      if (!chunk) return;
      const base = migratePromptTokensToCanonical(promptRef.current).trim();
      onPromptChange(base ? `${base} ${chunk}` : chunk);
    };
    r.onerror = () => {
      setRecording(false);
      setIsSpeaking(false);
    };
    r.onend = () => {
      setRecording(false);
      setIsSpeaking(false);
    };
    try {
      r.start();
      setRecording(true);
      setIsSpeaking(false);
    } catch {
      toast.error("Could not start dictation");
    }
  }, [disabled, recording, onPromptChange]);

  const addDisabled = disabled || busy || !canAddAttachment(attachments);

  const promptFieldEl = (
    <ContextPromptRichField
      key="context-prompt"
      ref={taRef}
      value={prompt}
      onChange={onPromptChange}
      attachments={attachments}
      placeholder={placeholder}
      disabled={disabled}
      className={cn(
        isMultiLine
          ? "w-full px-3 pb-1 pt-2"
          : // Parent row is flex; editor sits in a flex-1 anchor — use full width of that cell (`w-0 flex-1` breaks here: parent of contenteditable is not a flex container, so `w-0` collapsed the field).
            "w-full min-w-0 self-center px-0 py-1",
      )}
      aria-label="Context prompt"
    />
  );

  const dictationCluster = dictationSupported ? (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2",
        recording && "min-w-[7rem] max-w-[min(100%,18rem)] flex-1",
      )}
    >
      {recording ? (
        <>
          <div
            className={cn(
              "flex min-h-7 min-w-0 flex-1 items-stretch rounded-md px-2 py-1 ring-1 transition-[box-shadow,background-color] duration-200",
              isSpeaking
                ? "bg-gradient-to-r from-[#A577FF]/[0.12] to-[#21C4DD]/[0.1] ring-[#A577FF]/35"
                : "bg-gradient-to-r from-[#A577FF]/[0.05] to-[#21C4DD]/[0.04] ring-[#150A35]/10",
            )}
          >
            <DictationWaveform active={isSpeaking} />
          </div>
          <span
            className="shrink-0 self-center font-mono text-[11px] tabular-nums text-[#150A35]/60"
            aria-live="polite"
            aria-atomic="true"
          >
            {formatListenTime(listenElapsedMs)}
          </span>
        </>
      ) : null}
      <Button
        type="button"
        variant={recording ? "secondary" : "ghost"}
        size="icon-sm"
        disabled={disabled || busy}
        className={cn(
          "shrink-0 text-[#150A35]",
          recording &&
            "border border-[#21C4DD]/35 bg-linear-to-br from-[#21C4DD]/14 to-[#A577FF]/14 text-[#150A35] shadow-[inset_0_0_0_1px_rgba(33,196,221,0.22)]",
          recording && isSpeaking && "animate-echo-indicator-flash",
        )}
        aria-label={recording ? "Stop recording" : "Start voice input"}
        aria-pressed={recording}
        onClick={() => toggleDictation()}
      >
        <Mic className={cn("h-4 w-4", recording && "text-[#150A35]")} aria-hidden />
      </Button>
      {recording ? (
        <span className="sr-only">
          Recording. The waveform moves while you speak. Click the microphone again to stop.
        </span>
      ) : null}
    </div>
  ) : null;

  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-[#150A35]/80">Context</label>

      <div
        className={cn(
          "overflow-hidden rounded-xl border border-[#150A35]/12 bg-white shadow-sm focus-within:ring-2 focus-within:ring-[#A577FF]/30",
          disabled && "pointer-events-none opacity-70",
        )}
      >
        {attachments.length > 0 ? (
          <div className="border-b border-[#150A35]/8 bg-[#F9FAFB]/80 px-3 py-2">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-[#150A35]/45">
              Attached context
            </p>
            <div className="flex flex-wrap gap-3">
              {attachments.map((a) => (
                <ContextAttachmentPreview
                  key={a.id}
                  a={a}
                  attachments={attachments}
                  disabled={disabled || busy}
                  onRemove={() => remove(a.id)}
                />
              ))}
            </div>
          </div>
        ) : null}

        {isMultiLine ? (
          <div className="flex flex-col">
            {promptFieldEl}
            <div className="flex min-w-0 items-center justify-between gap-2 px-3 pb-2 pt-0">
              <ContextAttachPopover
                busy={busy}
                addDisabled={addDisabled}
                onPickFiles={onPickFiles}
                captureScreen={() => void captureScreen()}
              />
              {dictationCluster}
            </div>
          </div>
        ) : (
          <div className="flex min-w-0 items-center gap-2 px-2 py-2">
            <ContextAttachPopover
              busy={busy}
              addDisabled={addDisabled}
              onPickFiles={onPickFiles}
              captureScreen={() => void captureScreen()}
            />
            {promptFieldEl}
            {dictationCluster}
          </div>
        )}
      </div>
    </div>
  );
}
