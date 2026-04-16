"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import {
  IconCirclePlusFilled,
  IconDeviceDesktop,
  IconMessageCircle,
  IconPlus,
  IconUpload,
} from "@tabler/icons-react";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { useEchoDesktopCapture } from "@/components/desktop-capture-link";
import { MultiStepLoader } from "@/components/ui/multi-step-loader";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuButton, useSidebar } from "@/components/ui/sidebar";
import { apiFetch, apiErrorMessage } from "@/lib/api";
import { createWorkflowFromVideoFile } from "@/lib/workflow-from-video";
import {
  BLANK_WORKFLOW_READY_STEPS,
  ECHOPRISM_SESSION_READY_STEPS,
  WORKFLOW_VIDEO_SYNTHESIS_STEPS,
} from "@/lib/workflow-synthesis-loader-states";
import { cn } from "@/lib/utils";

type Variant = "sidebar-cta" | "page-primary" | "page-empty";

type CreationOverlay = "idle" | "video" | "blank" | "chat";

export function CreateWorkflowMenu({ variant }: { variant: Variant }) {
  const router = useRouter();
  const { openCapture } = useEchoDesktopCapture();
  const { isRailMode, setKeepExpanded } = useSidebar();
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [creationOverlay, setCreationOverlay] = useState<CreationOverlay>("idle");

  const dismissOverlaySoon = useCallback(() => {
    setTimeout(() => setCreationOverlay("idle"), 380);
  }, []);

  const onVideoFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      setCreationOverlay("video");
      try {
        const workflowId = await createWorkflowFromVideoFile(file);
        router.push(`/dashboard/workflows/${workflowId}/edit`);
        dismissOverlaySoon();
      } catch (err) {
        console.error(err);
        toast.error(err instanceof Error ? err.message : "Could not create workflow");
        setCreationOverlay("idle");
      }
    },
    [dismissOverlaySoon, router],
  );

  const onBlankTemplate = useCallback(async () => {
    if (creationOverlay !== "idle") return;
    setCreationOverlay("blank");
    try {
      const res = await apiFetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Untitled workflow" }),
      });
      if (!res.ok) {
        throw new Error(await apiErrorMessage(res, "Could not create workflow"));
      }
      const data = (await res.json().catch(() => ({}))) as { id?: string };
      const id = data.id;
      if (!id) throw new Error("No workflow id returned");
      router.push(`/dashboard/workflows/${id}/edit`);
      dismissOverlaySoon();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create workflow");
      setCreationOverlay("idle");
    }
  }, [creationOverlay, dismissOverlaySoon, router]);

  const onOpenEchoPrismChat = useCallback(() => {
    if (creationOverlay !== "idle") return;
    setCreationOverlay("chat");
    router.push("/dashboard/chat");
    dismissOverlaySoon();
  }, [creationOverlay, dismissOverlaySoon, router]);

  const rail = variant === "sidebar-cta" && isRailMode;

  const triggerClass =
    variant === "sidebar-cta"
      ? cn(
          // Match prior Quick Create + SidebarMenuButton cta sizing
          "!h-10 !min-h-10 !max-h-10 shrink-0 !rounded-lg !py-0 leading-none",
          rail
            ? "!mx-auto !w-10 !min-w-10 !p-0 justify-center !gap-0"
            : "w-full min-w-0 !px-4 justify-start",
        )
      : cn(
          "echo-btn-primary inline-flex items-center gap-2 rounded-lg font-medium",
          variant === "page-empty" && "shadow-sm",
        );

  const triggerInner =
    variant === "sidebar-cta" ? (
      <>
        <IconCirclePlusFilled className="size-[18px] shrink-0" />
        <span className={cn("font-medium", rail && "sr-only")} aria-hidden={rail}>
          Quick Create
        </span>
        <span className="sr-only">Open create workflow menu</span>
      </>
    ) : (
      <>
        <IconPlus className="h-5 w-5 shrink-0" />
        <span>New Workflow</span>
      </>
    );

  const loaderConfig =
    creationOverlay === "video"
      ? {
          states: [...WORKFLOW_VIDEO_SYNTHESIS_STEPS],
          title: "Echo is working",
          duration: 1800,
        }
      : creationOverlay === "blank"
        ? {
            states: [...BLANK_WORKFLOW_READY_STEPS],
            title: "Getting ready",
            duration: 1200,
          }
        : creationOverlay === "chat"
          ? {
              states: [...ECHOPRISM_SESSION_READY_STEPS],
              title: "Getting ready",
              duration: 1000,
            }
          : null;

  return (
    <>
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*,.mp4,.webm,.mov"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={onVideoFileChange}
      />
      {loaderConfig ? (
        <MultiStepLoader
          loadingStates={loaderConfig.states}
          loading
          duration={loaderConfig.duration}
          loop={false}
          title={loaderConfig.title}
        />
      ) : null}

      <DropdownMenu
        modal={false}
        onOpenChange={(open) => {
          if (variant === "sidebar-cta") {
            setKeepExpanded(open);
          }
        }}
      >
        <DropdownMenuTrigger asChild>
          {variant === "sidebar-cta" ? (
            <SidebarMenuButton tooltip="Create workflow" variant="cta" className={triggerClass}>
              {triggerInner}
            </SidebarMenuButton>
          ) : (
            <button type="button" className={triggerClass}>
              {triggerInner}
            </button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align={variant === "sidebar-cta" ? "start" : "end"}
          className="w-[min(22rem,calc(100vw-2rem))]"
        >
          <DropdownMenuItem
            className="items-start gap-2 py-2"
            onSelect={(e) => {
              e.preventDefault();
              openCapture();
            }}
          >
            <IconDeviceDesktop className="mt-0.5 size-4 shrink-0" />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span>Screen recording (Desktop)</span>
              <span className="text-xs font-normal text-muted-foreground">
                Opens Echo Desktop — install the app if nothing happens
              </span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="items-start gap-2 py-2"
            disabled={creationOverlay !== "idle"}
            onSelect={(e) => {
              e.preventDefault();
              videoInputRef.current?.click();
            }}
          >
            <IconUpload className="mt-0.5 size-4 shrink-0" />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span>Video upload</span>
              <span className="text-xs font-normal text-muted-foreground">
                Choose a recording — we&apos;ll synthesize steps from your video
              </span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="items-start gap-2 py-2"
            disabled={creationOverlay !== "idle"}
            onSelect={(e) => {
              e.preventDefault();
              void onBlankTemplate();
            }}
          >
            <FileText className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span>{creationOverlay === "blank" ? "Creating…" : "Blank template"}</span>
              <span className="text-xs font-normal text-muted-foreground">
                Empty workflow — add steps on the canvas
              </span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="items-start gap-2 py-2"
            disabled={creationOverlay !== "idle"}
            onSelect={(e) => {
              e.preventDefault();
              onOpenEchoPrismChat();
            }}
          >
            <IconMessageCircle className="mt-0.5 size-4 shrink-0" />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span>Prompt with EchoPrism</span>
              <span className="text-xs font-normal text-muted-foreground">
                Describe what to automate in chat
              </span>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
