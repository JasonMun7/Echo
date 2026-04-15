"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { collection, doc, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { auth } from "@/lib/firebase";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import {
  IconArrowLeft,
  IconCheck,
  IconCopy,
  IconDots,
  IconList,
  IconPlayerPlay,
  IconPlus,
  IconShare,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { ZoomIn, ZoomOut, Maximize2, Loader2, Undo2, History } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  workflowSharedTagClass,
  workflowStatusBadgeClass,
  workflowStatusLabel,
} from "@/lib/workflow-status";
import { cn } from "@/lib/utils";
import {
  EchoSearchWithSuggestions,
  type EchoSearchSuggestion,
} from "@/components/ui/echo-search-with-suggestions";
import { FloatingDock } from "@/components/ui/floating-dock";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  EchoWorkflowCanvas,
  type EchoWorkflowCanvasHandle,
} from "@/components/echo-flow/echo-workflow-canvas";
import { AddActionModal } from "@/components/echo-flow/add-action-modal";
import { EchoNodeInspector } from "@/components/echo-flow/echo-node-inspector";
import { EchoFlowCollabStub } from "@/components/echo-flow/collab-presence-stub";
import { EchoFlowRemotePointersOverlay } from "@/components/echo-flow/collab-remote-pointers";
import {
  WorkflowShareDialog,
  type WorkflowParticipantRole,
  type WorkflowShareRole,
} from "@/components/workflow-share-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EchoStepNodeActionsContextValue } from "@/components/echo-flow/echo-step-node-actions-context";
import { useStepEditLock } from "@/hooks/use-step-edit-lock";
import { useWorkflowPresencePointers } from "@/hooks/use-workflow-presence-pointers";
import { echoStepCardLabel, type EchoPersistedFlow } from "@/lib/echo-flow-graph";
import { type PeerPresenceAccent, uidToPeerAccent } from "@/lib/peer-presence-color";
import { useWorkflowEditUndo } from "@/lib/workflow-edit-undo";
import {
  publishIssuesForStep,
  validateStepsForPublish,
} from "@/lib/workflow-step-publish-validation";
import {
  StepEditorPanel,
  formatAction,
  getDefaultParamsForAction,
  type WorkflowStepEditorStep,
} from "./step-editor-panel";
import { EchoFlowStepSearchIcon } from "@/components/echo-flow/echo-flow-step-search-icon";

const BROWSER_ACTIONS = [
  "navigate",
  "click_at",
  "type_text_at",
  "scroll",
  "wait",
  "take_screenshot",
  "select_option",
  "hover",
  "press_key",
  "drag_drop",
  "wait_for_element",
  "open_web_browser",
  "close_web_browser",
  "api_call",
] as const;

const DESKTOP_ACTIONS = [
  "click_at",
  "right_click",
  "double_click",
  "type_text_at",
  "hotkey",
  "scroll",
  "drag",
  "wait",
  "press_key",
  "open_app",
  "focus_app",
  "api_call",
] as const;

type BrowserAction = (typeof BROWSER_ACTIONS)[number];
type DesktopAction = (typeof DESKTOP_ACTIONS)[number];
type AnyAction = BrowserAction | DesktopAction;

type Step = WorkflowStepEditorStep;

interface Workflow {
  id: string;
  status: string;
  name?: string;
  workflow_type?: "browser" | "desktop";
  source_recording_id?: string;
  owner_uid?: string;
  owner_name?: string;
  shared_with?: string[];
  /** Maps collaborator uid → `viewer` | `editor` (Firestore). */
  collaborator_roles?: Record<string, string>;
  /** When true, API allows share link + invites. */
  is_public?: boolean;
  flow_graph?: EchoPersistedFlow;
  error?: string;
}

function canAccessWorkflowEditor(wf: Workflow | null, uid: string | undefined): boolean {
  if (!wf || !uid) return false;
  if (wf.owner_uid === uid) return true;
  return Array.isArray(wf.shared_with) && wf.shared_with.includes(uid);
}

function canEditWorkflow(wf: Workflow | null, uid: string | undefined): boolean {
  if (!wf || !uid) return false;
  if (wf.owner_uid === uid) return true;
  if (!Array.isArray(wf.shared_with) || !wf.shared_with.includes(uid)) return false;
  const role = wf.collaborator_roles?.[uid];
  if (role === "viewer") return false;
  return true;
}

export default function WorkflowEditPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [workflowName, setWorkflowName] = useState("");
  const [steps, setSteps] = useState<Step[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingStepId, setSavingStepId] = useState<string | null>(null);
  const [invalidStepIds, setInvalidStepIds] = useState<Set<string>>(new Set());
  const [newStepIds, setNewStepIds] = useState<Set<string>>(new Set());
  const [dirtyStepIds, setDirtyStepIds] = useState<Set<string>>(new Set());
  const dirtyStepIdsRef = useRef(dirtyStepIds);
  dirtyStepIdsRef.current = dirtyStepIds;
  /** Merged step rows for dirty ids — updated synchronously so Firestore snapshots cannot drop local fields (e.g. context_attachments) before React commits. */
  const dirtyStepsDraftRef = useRef<Map<string, Step>>(new Map());

  const [canvasFlow, setCanvasFlow] = useState<EchoPersistedFlow | null>(null);
  const canvasHydratedFor = useRef<string | null>(null);

  const [addModalOpen, setAddModalOpen] = useState(false);
  /** When set, Add action modal updates this step’s type instead of POSTing a new step. */
  const [addModalReplaceStepId, setAddModalReplaceStepId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [shareInviteRole, setShareInviteRole] = useState<WorkflowShareRole>("editor");
  const [sharing, setSharing] = useState(false);
  const [publicSaving, setPublicSaving] = useState(false);
  const [roleChangePendingUid, setRoleChangePendingUid] = useState<string | null>(null);
  const [collaborators, setCollaborators] = useState<
    {
      uid: string;
      email: string;
      display_name: string;
      photo_url?: string;
      status?: "pending" | "accepted";
      role?: WorkflowParticipantRole;
    }[]
  >([]);
  const [inspectorExpanded, setInspectorExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [running, setRunning] = useState(false);
  const [forking, setForking] = useState(false);
  const [renameStepId, setRenameStepId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const canvasRef = useRef<EchoWorkflowCanvasHandle>(null);
  /** Skip one canvas “undo point” after undo/redo apply (avoids duplicate history from RF sync). */
  const skipCanvasPersistUndoRef = useRef(0);
  /** First debounced persist after load is RF/React settling — not a user edit. */
  const initialCanvasPersistSkippedRef = useRef(false);

  const canEdit = canEditWorkflow(workflow, auth?.currentUser?.uid);
  const accessUid = auth?.currentUser?.uid;
  const editorAccessOk = Boolean(
    workflow && accessUid && canAccessWorkflowEditor(workflow, accessUid),
  );

  const {
    inspectorReadOnly,
    lockOwnerLabel,
    peerLocks,
    peerLockMetaByStepId,
    activeEditorUids,
    peerDisplayNameByUid,
    peerPhotoUrlByUid,
  } = useStepEditLock(
    editorAccessOk ? id : undefined,
    auth?.currentUser ?? null,
    canEdit ? selectedStepId : null,
  );

  const { presencePeers, reportCanvasPosition, reportReorderPresence } =
    useWorkflowPresencePointers(id, editorAccessOk, auth?.currentUser ?? null);

  const availableActions: readonly AnyAction[] = [
    ...new Set([...BROWSER_ACTIONS, ...DESKTOP_ACTIONS]),
  ] as AnyAction[];

  useEffect(() => {
    canvasHydratedFor.current = null;
    setCanvasFlow(null);
    dirtyStepsDraftRef.current.clear();
    setSteps([]);
    setLoading(true);
  }, [id]);

  useEffect(() => {
    if (!db || !auth?.currentUser) return;
    const wfRef = doc(db, "workflows", id);
    const unsubWf = onSnapshot(
      wfRef,
      (snap) => {
        if (snap.exists()) {
          const d = snap.data();
          const uid = auth?.currentUser?.uid;
          const owner = d?.owner_uid;
          const shared = Array.isArray(d?.shared_with) ? (d.shared_with as string[]) : [];
          const allowed = uid && (owner === uid || shared.includes(uid));
          if (!allowed) {
            router.replace("/dashboard/workflows");
            return;
          }
          const wf = { id: snap.id, ...d } as Workflow;
          setWorkflow(wf);
          setWorkflowName((prev) => prev || wf.name || "");
          if (canvasHydratedFor.current !== id) {
            canvasHydratedFor.current = id;
            setCanvasFlow((d?.flow_graph as EchoPersistedFlow | undefined) ?? null);
          }
        } else {
          setWorkflow(null);
          setLoading(false);
        }
      },
      (err) => {
        console.warn("[workflow-edit] workflow snapshot error:", id, err);
      },
    );
    return () => {
      unsubWf();
    };
  }, [id, router]);

  useEffect(() => {
    if (!db || !auth?.currentUser || !editorAccessOk) return;

    const stepsRef = collection(db, "workflows", id, "steps");
    const q = query(stepsRef, orderBy("order"));
    const unsubSteps = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Step)
          .sort((a, b) => a.order - b.order);
        setSteps((prev) => {
          const dirty = dirtyStepIdsRef.current;
          const prevById = new Map(prev.map((s) => [s.id, s]));
          return list.map((remote) => {
            const synced = dirtyStepsDraftRef.current.get(remote.id);
            if (synced) {
              return { ...remote, ...synced };
            }
            if (dirty.has(remote.id)) {
              const draft = prevById.get(remote.id);
              return draft ?? remote;
            }
            return remote;
          });
        });
        setLoading(false);
      },
      (err) => {
        console.warn("[workflow-edit] steps snapshot error:", id, err);
        setLoading(false);
      },
    );
    return () => {
      unsubSteps();
    };
  }, [id, editorAccessOk]);

  const stepQueryId = searchParams.get("step");

  useEffect(() => {
    if (!stepQueryId || steps.length === 0) return;
    if (!steps.some((s) => s.id === stepQueryId)) return;
    setSelectedStepId(stepQueryId);
  }, [stepQueryId, steps]);

  useEffect(() => {
    if (!workflow?.id) return;
    let cancelled = false;
    apiFetch(`/api/workflows/${id}/collaborators`)
      .then((res) => (res.ok ? res.json() : { collaborators: [] }))
      .then((data) => {
        if (!cancelled && Array.isArray(data.collaborators)) setCollaborators(data.collaborators);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id, workflow?.id, shareOpen]);

  const {
    touchStepUndoGroup,
    pushDiscreteUndo,
    undo: undoEdit,
    undoMultiple,
    canUndo,
    undoEntriesNewestFirst,
  } = useWorkflowEditUndo<Step>({
    canEdit,
    workflowId: id,
    steps,
    setSteps,
    canvasFlow,
    setCanvasFlow,
    dirtyStepIds,
    setDirtyStepIds,
    dirtyStepIdsRef,
    dirtyStepsDraftRef,
  });

  const pendingInsertBetweenRef = useRef<{ sourceId: string; targetId: string } | null>(null);

  const handleReorderSteps = useCallback(
    async (orderedIds: string[], options?: { quiet?: boolean }): Promise<boolean> => {
      if (!canEdit) return false;
      pushDiscreteUndo("Reorder");
      try {
        await Promise.all(
          orderedIds.map((stepId, index) =>
            apiFetch(`/api/workflows/${id}/steps/${stepId}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ order: index }),
            }),
          ),
        );
        if (!options?.quiet) {
          toast.success("Steps reordered", {
            description: "Run order is saved—Echo will execute steps in this sequence.",
          });
        }
        return true;
      } catch (e) {
        toast.error("Could not reorder steps");
        console.error(e);
        return false;
      }
    },
    [id, canEdit, pushDiscreteUndo],
  );

  const openInsertStepBetween = useCallback(
    (sourceId: string, targetId: string) => {
      if (!canEdit) {
        toast.info("View-only access", {
          description: "Ask the owner for edit access to add steps.",
        });
        return;
      }
      pendingInsertBetweenRef.current = { sourceId, targetId };
      setAddModalReplaceStepId(null);
      setAddModalOpen(true);
    },
    [canEdit],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // ⌘⇧K focuses canvas step search; ⌘K is reserved for the global command palette.
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.getElementById("echo-flow-search-input")?.focus();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        const el = e.target as HTMLElement;
        if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable) {
          return;
        }
        e.preventDefault();
        undoEdit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undoEdit]);

  const handleStepUpdate = (stepId: string, data: Partial<Step>) => {
    touchStepUndoGroup();
    setSteps((prev) => {
      const cur = prev.find((s) => s.id === stepId);
      if (!cur) return prev;
      const merged = { ...cur, ...data };
      dirtyStepsDraftRef.current.set(stepId, merged);
      const nextDirty = new Set(dirtyStepIdsRef.current);
      nextDirty.add(stepId);
      dirtyStepIdsRef.current = nextDirty;
      if (publishIssuesForStep(merged).length === 0) {
        queueMicrotask(() => {
          setNewStepIds((ids) => {
            if (!ids.has(stepId)) return ids;
            const out = new Set(ids);
            out.delete(stepId);
            return out;
          });
          setInvalidStepIds((ids) => {
            if (!ids.has(stepId)) return ids;
            const out = new Set(ids);
            out.delete(stepId);
            return out;
          });
        });
      }
      return prev.map((s) => (s.id === stepId ? merged : s));
    });
    setDirtyStepIds((prev) => {
      const next = new Set(prev);
      next.add(stepId);
      return next;
    });
  };

  const handleDeleteStep = useCallback(
    async (stepId: string) => {
      pushDiscreteUndo("Delete step");
      if (selectedStepId === stepId) setSelectedStepId(null);
      dirtyStepsDraftRef.current.delete(stepId);
      try {
        await apiFetch(`/api/workflows/${id}/steps/${stepId}`, {
          method: "DELETE",
        });
        toast.success("Step deleted", {
          description: "Removed from this workflow. Add a new step if that was a mistake.",
        });
      } catch (e) {
        toast.error("Failed to delete step");
        console.error("Failed to delete step:", e);
      }
    },
    [id, selectedStepId, pushDiscreteUndo],
  );

  const openRenameStep = useCallback(
    (stepId: string) => {
      const s = steps.find((x) => x.id === stepId);
      setRenameDraft(
        String((s?.params as Record<string, unknown> | undefined)?.display_label ?? "").trim(),
      );
      setRenameStepId(stepId);
      setSelectedStepId(stepId);
    },
    [steps],
  );

  const confirmRenameStep = useCallback(() => {
    if (!renameStepId) return;
    const s = steps.find((x) => x.id === renameStepId);
    if (!s) return;
    const p: Record<string, unknown> = { ...(s.params ?? {}) };
    if (renameDraft.trim()) p.display_label = renameDraft.trim();
    else delete p.display_label;
    handleStepUpdate(renameStepId, { params: p });
    setRenameStepId(null);
  }, [renameStepId, renameDraft, steps]);

  const handleCopyStep = useCallback(
    async (stepId: string) => {
      const s = steps.find((x) => x.id === stepId);
      if (!s) return;
      try {
        const payload = {
          action: s.action,
          context: s.context ?? "",
          params: s.params ?? {},
          expected_outcome: s.expected_outcome ?? "",
        };
        await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
        toast.success("Step copied to clipboard");
      } catch {
        toast.error("Could not copy to clipboard");
      }
    },
    [steps],
  );

  const handleDuplicateStep = useCallback(
    async (stepId: string) => {
      const s = steps.find((x) => x.id === stepId);
      if (!s) return;
      pushDiscreteUndo("Duplicate step");
      const sorted = [...steps].sort((a, b) => a.order - b.order);
      const idx = sorted.findIndex((x) => x.id === stepId);
      const insert_before = idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1]!.id : undefined;

      try {
        const res = await apiFetch(`/api/workflows/${id}/steps`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: s.action,
            context: s.context ?? "",
            params: s.params ?? {},
            expected_outcome: s.expected_outcome ?? "",
            ...(s.frame_image_url ? { frame_image_url: s.frame_image_url } : {}),
            ...(s.click_overlay ? { click_overlay: s.click_overlay } : {}),
            ...(insert_before ? { insert_before_step_id: insert_before } : {}),
          }),
        });
        if (!res.ok) {
          toast.error("Could not duplicate step");
          return;
        }
        const data = (await res.json()) as { id?: string };
        const newId = data.id;
        if (newId) {
          setNewStepIds((prev) => new Set(prev).add(newId));
          setSelectedStepId(newId);
          canvasRef.current?.fitViewToStep(newId);
        }
        toast.success("Step duplicated");
      } catch (e) {
        toast.error("Could not duplicate step");
        console.error(e);
      }
    },
    [id, steps, pushDiscreteUndo],
  );

  const stepNodeActions = useMemo((): EchoStepNodeActionsContextValue | undefined => {
    if (!workflow) return undefined;
    if (!canEdit) {
      return { menuDisabled: true };
    }
    return {
      onDeleteStep: handleDeleteStep,
      onCopyStep: handleCopyStep,
      onDuplicateStep: handleDuplicateStep,
      onRenameStep: openRenameStep,
    };
  }, [workflow, canEdit, handleDeleteStep, handleCopyStep, handleDuplicateStep, openRenameStep]);

  const handleAddStep = async (
    action: AnyAction,
    options?: { params?: Record<string, unknown> },
  ) => {
    if (!canEdit) {
      toast.info("View-only access", {
        description: "Ask the owner for edit access to add steps.",
      });
      return;
    }
    /** Snapshot before any await — modal calls `onOpenChange(false)` right after pick and clears the ref. */
    const insertBetween = pendingInsertBetweenRef.current;
    const base = getDefaultParamsForAction(action);
    const merged =
      options?.params && typeof options.params === "object" ? { ...base, ...options.params } : base;
    pushDiscreteUndo("Add step");
    try {
      const res = await apiFetch(`/api/workflows/${id}/steps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          context: "",
          params: merged,
          expected_outcome: "",
          ...(insertBetween ? { insert_before_step_id: insertBetween.targetId } : {}),
        }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        let message = "Failed to add step";
        try {
          const j = JSON.parse(errText) as { detail?: unknown };
          if (typeof j.detail === "string") message = j.detail;
        } catch {
          /* ignore */
        }
        toast.error(message);
        return;
      }
      const data = (await res.json()) as { id?: string };
      const newStepId = data.id;
      if (newStepId) {
        setNewStepIds((prev) => new Set(prev).add(newStepId));
        setSelectedStepId(newStepId);
        canvasRef.current?.fitViewToStep(newStepId);
      }
      toast.success(`Added ${formatAction(action)} step`, {
        description:
          "Describe what this step does and fill any required fields before you publish.",
      });
    } catch (e) {
      toast.error("Failed to add step");
      console.error("Failed to add step:", e);
    }
  };

  const handleSave = async () => {
    if (!canEdit) return;
    if (steps.length === 0) {
      toast.error("Add at least one step before publishing");
      return;
    }

    const { invalidIds, firstFailureIssues, firstFailureStepId } = validateStepsForPublish(steps);
    if (invalidIds.size > 0) {
      setInvalidStepIds(invalidIds);
      const hint = firstFailureIssues[0] ?? "Complete required fields on each step.";
      toast.error("Can’t publish yet", {
        description:
          invalidIds.size === 1 ? hint : `${invalidIds.size} steps need attention. ${hint}`,
      });
      if (firstFailureStepId) {
        setSelectedStepId(firstFailureStepId);
        requestAnimationFrame(() => canvasRef.current?.fitViewToStep(firstFailureStepId));
      }
      return;
    }

    setInvalidStepIds(new Set());
    setSaving(true);
    try {
      const dirtySteps = steps.filter((s) => dirtyStepIds.has(s.id));
      await Promise.all(
        dirtySteps.map((s) =>
          apiFetch(`/api/workflows/${id}/steps/${s.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: s.action,
              context: s.context,
              params: s.params,
              expected_outcome: s.expected_outcome ?? "",
              frame_image_url: s.frame_image_url,
              click_overlay: s.click_overlay,
              context_attachments: s.context_attachments ?? [],
            }),
          }),
        ),
      );
      await apiFetch(`/api/workflows/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "active",
          name: workflowName || undefined,
        }),
      });
      setDirtyStepIds(new Set());
      dirtyStepsDraftRef.current.clear();
      setNewStepIds(new Set());
      toast.success("Workflow published", {
        description: "Your workflow is active and ready to run from the dashboard or desktop.",
      });
      router.push(`/dashboard/workflows/${id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save workflow");
      console.error("Failed to save:", e);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveStep = useCallback(
    async (stepId: string) => {
      if (!canEdit) return;
      const s = steps.find((x) => x.id === stepId);
      if (!s) return;
      setSavingStepId(stepId);
      try {
        const res = await apiFetch(`/api/workflows/${id}/steps/${stepId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: s.action,
            context: s.context,
            params: s.params,
            expected_outcome: s.expected_outcome ?? "",
            frame_image_url: s.frame_image_url,
            click_overlay: s.click_overlay,
            context_attachments: s.context_attachments ?? [],
          }),
        });
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          throw new Error(t || "Could not save step");
        }
        setDirtyStepIds((prev) => {
          const next = new Set(prev);
          next.delete(stepId);
          return next;
        });
        dirtyStepsDraftRef.current.delete(stepId);
        toast.success("Step saved");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save step");
      } finally {
        setSavingStepId(null);
      }
    },
    [canEdit, id, steps],
  );

  const handleWorkflowPublicChange = async (next: boolean) => {
    if (!workflow || workflow.owner_uid !== auth?.currentUser?.uid) return;
    setPublicSaving(true);
    try {
      const res = await apiFetch(`/api/workflows/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_public: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.detail === "string" ? data.detail : "Could not update visibility",
        );
      }
      setWorkflow((prev) => (prev ? { ...prev, is_public: next } : prev));
      toast.success(next ? "Workflow is public" : "Workflow is private", {
        description: next
          ? "You can copy the link and send invites."
          : "Sharing is disabled until you turn public on again.",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update visibility");
    } finally {
      setPublicSaving(false);
    }
  };

  const handleShare = async () => {
    if (!shareEmail.trim()) return;
    if (!workflow?.is_public) {
      toast.info("Make the workflow public first", {
        description: "Use the toggle in this dialog to enable sharing.",
      });
      return;
    }
    setSharing(true);
    try {
      const res = await apiFetch(`/api/workflows/${id}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: shareEmail.trim(), role: shareInviteRole }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Failed to share");
      setShareEmail("");
      toast.success("Invite sent", {
        description: "They’ll get access once they accept. You can resend from Share if needed.",
      });
      const c = await apiFetch(`/api/workflows/${id}/collaborators`);
      if (c.ok) {
        const j = await c.json();
        setCollaborators(j.collaborators || []);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to share");
    } finally {
      setSharing(false);
    }
  };

  const loadCollaborators = async () => {
    try {
      const res = await apiFetch(`/api/workflows/${id}/collaborators`);
      if (res.ok) {
        const data = await res.json();
        setCollaborators(data.collaborators || []);
      }
    } catch {
      /* ignore */
    }
  };

  const handleDeleteWorkflow = async () => {
    if (!confirm("Delete this workflow? This cannot be undone.")) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/workflows/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      router.push("/dashboard/workflows");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete workflow");
    } finally {
      setDeleting(false);
    }
  };

  const handleFork = async () => {
    setForking(true);
    try {
      const res = await apiFetch(`/api/workflows/${id}/fork`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Failed to make a copy");
      toast.success("Copy created", {
        description: "Opening your copy—you can edit and publish it independently.",
      });
      router.push(`/dashboard/workflows/${data.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to make a copy");
    } finally {
      setForking(false);
    }
  };

  const handleRunWorkflow = async () => {
    setRunning(true);
    try {
      const res = await apiFetch(`/api/run/${id}?source=desktop`, {
        method: "POST",
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || "Failed to start run");
      }
      const data = await res.json();
      if (data.run_id) {
        toast.success("Run started", {
          description:
            "Opening Echo desktop with this run. You can follow progress on the run page.",
        });
        window.location.href = `echo-desktop://run?workflow_id=${id}&run_id=${data.run_id}`;
        router.push(`/dashboard/workflows/${id}/runs/${data.run_id}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start run");
    } finally {
      setRunning(false);
    }
  };

  const handleCollaboratorRoleChange = async (targetUid: string, role: WorkflowShareRole) => {
    setRoleChangePendingUid(targetUid);
    try {
      const res = await apiFetch(`/api/workflows/${id}/share/${targetUid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(typeof data.detail === "string" ? data.detail : "Could not update access");
      setCollaborators((prev) => prev.map((c) => (c.uid === targetUid ? { ...c, role } : c)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update access");
    } finally {
      setRoleChangePendingUid(null);
    }
  };

  const handleUnshare = async (targetUid: string) => {
    try {
      const res = await apiFetch(`/api/workflows/${id}/share/${targetUid}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to remove");
      setCollaborators((prev) => prev.filter((c) => c.uid !== targetUid));
      toast.success("Access removed", {
        description: "That collaborator no longer sees this workflow.",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove access");
    }
  };

  const searchItems: EchoSearchSuggestion[] = steps.map((s, i) => ({
    id: s.id,
    label: `${i + 1}. ${echoStepCardLabel(s)}`,
    subtitle: s.context?.trim() ? s.context.slice(0, 56) : formatAction(s.action),
    icon: <EchoFlowStepSearchIcon action={s.action} params={s.params} />,
  }));

  const selectedStep =
    selectedStepId != null ? steps.find((s) => s.id === selectedStepId) : undefined;
  const selectedStepIndex =
    selectedStepId != null ? steps.findIndex((s) => s.id === selectedStepId) : -1;

  const uid = auth?.currentUser?.uid;
  const isOwner = workflow?.owner_uid === uid;
  const isViewOnlyCollaborator = Boolean(uid && workflow && workflow.owner_uid !== uid && !canEdit);
  /** Remote pointer only when another user has an active step lock (actually editing). */
  const showRemotePointerForActivePeer = peerLocks.size > 0;
  const activePeerEditorLabel = showRemotePointerForActivePeer
    ? ([...peerLocks.values()][0] ?? "Collaborator")
    : "Collaborator";

  /**
   * Other people on this workflow edit view: active step locks and/or recent canvas presence.
   * Shown next to Publish; cleared when they leave (locks expire / presence goes stale).
   */
  const coPresentEditorsBar = useMemo(() => {
    const byUid = new Map(collaborators.map((c) => [c.uid, c]));
    const rows: {
      uid: string;
      email: string;
      display_name: string;
      photo_url?: string;
    }[] = [];

    for (const peerUid of activeEditorUids) {
      const row = byUid.get(peerUid);
      const lockPhoto = peerPhotoUrlByUid.get(peerUid);
      if (row) {
        rows.push({
          ...row,
          photo_url: row.photo_url ?? lockPhoto,
        });
      } else {
        rows.push({
          uid: peerUid,
          email: "",
          display_name: peerDisplayNameByUid.get(peerUid) ?? "Collaborator",
          photo_url: lockPhoto,
        });
      }
    }

    const seen = new Set(rows.map((r) => r.uid));
    for (const p of presencePeers) {
      if (seen.has(p.uid)) continue;
      seen.add(p.uid);
      const row = byUid.get(p.uid);
      if (row) {
        rows.push({
          ...row,
          photo_url: row.photo_url ?? p.photoURL ?? undefined,
        });
      } else {
        rows.push({
          uid: p.uid,
          email: "",
          display_name: p.displayName,
          photo_url: p.photoURL ?? undefined,
        });
      }
    }

    return rows.slice(0, 8);
  }, [activeEditorUids, presencePeers, collaborators, peerDisplayNameByUid, peerPhotoUrlByUid]);

  const liveCollaboratorUidsForShare = useMemo(() => {
    const s = new Set<string>(activeEditorUids);
    for (const p of presencePeers) s.add(p.uid);
    return s;
  }, [activeEditorUids, presencePeers]);

  /** Lock + live drag: same hues as remote cursor (stroke / pill). Locks overwrite drag for the same step. */
  const peerStepAccentsByStepId = useMemo(() => {
    const m = new Map<string, PeerPresenceAccent>();
    for (const p of presencePeers) {
      if (p.draggingStepId) {
        m.set(p.draggingStepId, uidToPeerAccent(p.uid));
      }
    }
    peerLockMetaByStepId.forEach((meta, stepId) => {
      m.set(stepId, uidToPeerAccent(meta.uid));
    });
    return m;
  }, [peerLockMetaByStepId, presencePeers]);

  /** Everyone currently dragging the vertical stack (for the live banner). */
  const remoteReorderActivePeers = useMemo(() => {
    return presencePeers
      .filter((p) => p.draggingStepId)
      .map((p) => ({
        uid: p.uid,
        displayName: p.displayName,
        photoURL: p.photoURL,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [presencePeers]);

  /**
   * One peer’s `reorder_preview` drives dotted ghost slots on others’ canvases (lowest uid wins).
   */
  const primaryRemoteReorder = useMemo(() => {
    const candidates = presencePeers
      .filter((p) => (p.reorderPreviewIds?.length ?? 0) > 0)
      .sort((a, b) => a.uid.localeCompare(b.uid));
    return candidates[0] ?? null;
  }, [presencePeers]);

  const remoteReorderLayoutIds = primaryRemoteReorder?.reorderPreviewIds ?? null;
  const remoteReorderDraggingStepId = primaryRemoteReorder?.draggingStepId ?? null;

  const firstActivePeerUid = useMemo(() => [...activeEditorUids][0] ?? null, [activeEditorUids]);
  const firstActivePeerPhoto =
    firstActivePeerUid != null ? peerPhotoUrlByUid.get(firstActivePeerUid) : undefined;

  const status = workflow?.status ?? "unknown";
  const failureReason = workflow && typeof workflow.error === "string" ? workflow.error.trim() : "";

  if (loading || !workflow) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-auto bg-background">
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 border-b border-border bg-card px-4 py-3 md:px-6">
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 shrink-0 rounded-md" />
              <Skeleton className="h-4 max-w-xs flex-1 rounded-md" />
              <Skeleton className="ml-auto h-8 w-8 shrink-0 rounded-full" />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <Skeleton className="h-9 max-w-xl flex-1 rounded-lg" />
              <Skeleton className="h-9 w-24 rounded-lg" />
            </div>
          </div>
          <Skeleton className="min-h-[280px] flex-1 rounded-none" />
        </div>
      </div>
    );
  }

  if (!canAccessWorkflowEditor(workflow, uid)) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
        <p className="text-center text-muted-foreground">
          You don&apos;t have access to edit this workflow.
        </p>
        <Link
          href={`/dashboard/workflows/${id}`}
          className="echo-btn-primary rounded-lg px-4 py-2 text-sm"
        >
          Open workflow
        </Link>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      {running && (
        <>
          <div className="echo-run-haze" />
          <div className="echo-run-haze-content">
            <div className="h-12 w-12 animate-spin rounded-full border-2 border-primary/50 border-t-primary" />
            <p className="animate-pulse text-lg font-bold tracking-wide text-foreground drop-shadow-sm">
              EchoPrism is taking control…
            </p>
          </div>
        </>
      )}
      <EchoFlowCollabStub />
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="relative z-20 shrink-0 bg-card/95 backdrop-blur-md">
          {/* Slim title row — not a heavy “detail page” card */}
          <div className="flex items-center gap-2 px-4 py-2.5 md:gap-3 md:px-6 md:py-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/dashboard/workflows"
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Back to workflows"
                >
                  <IconArrowLeft className="h-4 w-4" stroke={1.5} />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="bottom">Back to workflows</TooltipContent>
            </Tooltip>

            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <p className="truncate text-sm font-semibold tracking-tight text-foreground md:text-[15px]">
                  {String(workflow.name || id)}
                </p>
                <span
                  className={cn(workflowStatusBadgeClass(status), "shrink-0")}
                  title="Workflow status"
                >
                  {workflowStatusLabel(status)}
                </span>
                {!isOwner ? (
                  <span
                    className={workflowSharedTagClass}
                    title="This workflow was shared with you"
                  >
                    Shared
                  </span>
                ) : null}
                {typeof workflow.source_recording_id === "string" &&
                workflow.source_recording_id ? (
                  <code
                    className="hidden max-w-[10rem] truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground lg:inline-block"
                    title={`Recording ${String(workflow.source_recording_id)}`}
                  >
                    {String(workflow.source_recording_id)}
                  </code>
                ) : null}
              </div>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Editor menu"
                >
                  <IconDots className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-44">
                <DropdownMenuItem asChild>
                  <Link href={`/dashboard/workflows/${id}`}>
                    <IconList className="h-4 w-4" />
                    View workflow
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => void handleRunWorkflow()}
                  disabled={
                    running || (workflow.status !== "active" && workflow.status !== "ready")
                  }
                >
                  <IconPlayerPlay className="h-4 w-4" />
                  {running ? "Starting…" : "Run workflow"}
                </DropdownMenuItem>
                {canEdit ? (
                  <DropdownMenuItem
                    onClick={() => {
                      setShareOpen(true);
                      void loadCollaborators();
                    }}
                  >
                    <IconShare className="h-4 w-4" />
                    Share
                  </DropdownMenuItem>
                ) : null}
                {!isOwner ? (
                  <DropdownMenuItem onClick={() => void handleFork()} disabled={forking}>
                    <IconCopy className="h-4 w-4" />
                    {forking ? "Copying…" : "Make a copy"}
                  </DropdownMenuItem>
                ) : null}
                {isOwner && (
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => void handleDeleteWorkflow()}
                    disabled={deleting}
                  >
                    <IconTrash className="h-4 w-4" />
                    {deleting ? "Deleting…" : "Delete"}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {status === "failed" && failureReason && (
            <div className="border-t border-echo-error/20 bg-echo-error/5 px-4 py-2.5 md:px-6">
              <p className="text-xs font-medium text-echo-error">Workflow synthesis failed</p>
              <p className="mt-0.5 text-xs text-echo-error/90">{failureReason}</p>
            </div>
          )}

          {isViewOnlyCollaborator && (
            <div className="border-t border-amber-200/80 bg-amber-50/90 px-4 py-2.5 md:px-6">
              <p className="text-xs font-medium text-amber-950">View-only access</p>
              <p className="mt-0.5 text-xs text-amber-900/85">
                You can explore this workflow on the canvas; editing and publish require{" "}
                <span className="font-medium">Can edit</span> access from the owner.
              </p>
            </div>
          )}

          {/* Toolbar: search + collaborators + actions */}
          <div className="flex flex-col gap-3 border-t border-border/60 bg-muted px-4 py-2.5 md:flex-row md:items-center md:justify-between md:px-6 md:py-3">
            <div className="min-w-0 flex-1 md:max-w-xl">
              <EchoSearchWithSuggestions
                inputId="echo-flow-search-input"
                items={searchItems}
                placeholder="Find a step… (⌘K)"
                onSelect={(item) => {
                  setSelectedStepId(item.id);
                  canvasRef.current?.fitViewToStep(item.id);
                }}
                aria-label="Search steps"
              />
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {coPresentEditorsBar.length > 0 && (
                <div
                  className="mr-1 flex shrink-0 -space-x-2"
                  title="Others editing this workflow right now"
                >
                  {coPresentEditorsBar.map((c) => {
                    const peerAccent = uidToPeerAccent(c.uid);
                    return (
                      <button
                        key={c.uid}
                        type="button"
                        title={`${c.display_name} — click to jump to their cursor on the canvas`}
                        className={cn(
                          "z-[1] inline-flex cursor-pointer border-0 bg-transparent p-0 transition-transform hover:z-[2] hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                        )}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const live = presencePeers.find((p) => p.uid === c.uid);
                          if (live && Number.isFinite(live.flowX) && Number.isFinite(live.flowY)) {
                            canvasRef.current?.centerOnFlowCoordinates(live.flowX, live.flowY);
                          } else {
                            toast.info("Canvas position not available yet", {
                              description:
                                "Ask them to move the mouse on the workflow canvas once.",
                            });
                          }
                        }}
                      >
                        <Avatar
                          className="pointer-events-none h-7 w-7 border-2 shadow-sm"
                          style={{ borderColor: peerAccent.stroke }}
                        >
                          {c.photo_url ? (
                            <AvatarImage
                              src={c.photo_url}
                              alt=""
                              className="object-cover brightness-110 saturate-125 contrast-[1.02]"
                            />
                          ) : null}
                          <AvatarFallback
                            className="text-[10px] font-semibold text-white"
                            style={{ backgroundColor: peerAccent.fill }}
                          >
                            {(c.display_name || "?")
                              .split(/\s+/)
                              .map((p) => p[0])
                              .join("")
                              .slice(0, 2)
                              .toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      </button>
                    );
                  })}
                </div>
              )}
              {canEdit ? (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-foreground shadow-sm transition-colors hover:bg-muted disabled:opacity-40"
                        onClick={() => undoEdit()}
                        disabled={!canUndo}
                        aria-label="Undo"
                      >
                        <Undo2 className="h-4 w-4" strokeWidth={1.5} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Undo (⌘Z)</TooltipContent>
                  </Tooltip>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-card px-2 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted disabled:opacity-40"
                        disabled={undoEntriesNewestFirst.length === 0}
                        title="Jump back through recent edits"
                        aria-label="Undo history"
                      >
                        <History className="h-4 w-4" strokeWidth={1.5} />
                        History
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="max-h-72 min-w-52 overflow-y-auto">
                      {undoEntriesNewestFirst.length === 0 ? (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">
                          No undo history yet
                        </div>
                      ) : (
                        undoEntriesNewestFirst.map((entry, idx) => (
                          <DropdownMenuItem
                            key={`${entry.label}-${idx}`}
                            onClick={() => undoMultiple(entry.undoCount)}
                          >
                            <span className="font-medium text-foreground">{entry.label}</span>
                            <span className="ml-2 text-muted-foreground">
                              {entry.undoCount} checkpoint{entry.undoCount > 1 ? "s" : ""} back
                            </span>
                          </DropdownMenuItem>
                        ))
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              ) : null}
              {canEdit ? (
                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
                  onClick={() => {
                    setShareOpen(true);
                    void loadCollaborators();
                  }}
                >
                  <IconShare className="h-3.5 w-3.5" />
                  Share
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !canEdit}
                className="echo-btn-primary inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-white" aria-hidden />
                ) : (
                  <IconCheck className="h-3.5 w-3.5 shrink-0 text-white" aria-hidden />
                )}
                {saving ? "Publishing…" : "Publish"}
              </button>
            </div>
          </div>
        </header>

        <div className="relative z-0 flex min-h-0 min-h-[280px] flex-1 flex-col px-4 pb-6 md:px-6">
          <EchoWorkflowCanvas
            ref={canvasRef}
            workflowId={id}
            steps={steps}
            persistedGraph={canvasFlow}
            onReorderSteps={handleReorderSteps}
            onInsertStepBetween={openInsertStepBetween}
            stepNodeActions={stepNodeActions}
            invalidStepIds={invalidStepIds}
            newStepIds={newStepIds}
            peerStepAccents={peerStepAccentsByStepId}
            remoteReorderPeers={remoteReorderActivePeers}
            remoteReorderOrderedIds={remoteReorderLayoutIds}
            remoteReorderDraggingStepId={remoteReorderDraggingStepId}
            onReorderPresence={canEdit && editorAccessOk ? reportReorderPresence : undefined}
            onSelectStep={setSelectedStepId}
            lockedStepId={inspectorReadOnly && selectedStepId ? selectedStepId : null}
            lockOwnerLabel={inspectorReadOnly ? lockOwnerLabel : null}
            collaborationOverlay={
              <EchoFlowRemotePointersOverlay
                lockLabel={activePeerEditorLabel}
                showLockOnlyPointer={showRemotePointerForActivePeer}
                presencePeers={presencePeers}
                lockAccentUid={firstActivePeerUid}
                lockPhotoUrl={firstActivePeerPhoto}
              />
            }
            onCanvasPointerMove={editorAccessOk ? reportCanvasPosition : undefined}
            dock={
              <FloatingDock
                items={[
                  {
                    title: "Zoom in",
                    icon: <ZoomIn className="h-5 w-5 text-foreground" aria-hidden />,
                    onClick: () => canvasRef.current?.zoomIn(),
                  },
                  {
                    title: "Fit view",
                    icon: <Maximize2 className="h-5 w-5 text-foreground" aria-hidden />,
                    onClick: () => canvasRef.current?.fitView(),
                  },
                  {
                    title: "Add step",
                    accent: true,
                    icon: <IconPlus className="h-5 w-5" stroke={1.5} aria-hidden />,
                    onClick: () => {
                      if (!canEdit) {
                        toast.info("View-only access", {
                          description: "Ask the owner for edit access to add steps.",
                        });
                        return;
                      }
                      pendingInsertBetweenRef.current = null;
                      setAddModalReplaceStepId(null);
                      setAddModalOpen(true);
                    },
                  },
                  {
                    title: "Undo",
                    icon: (
                      <Undo2 className="h-5 w-5 text-foreground" strokeWidth={1.5} aria-hidden />
                    ),
                    onClick: () => {
                      if (!canEdit) {
                        toast.info("View-only access", {
                          description: "Ask the owner for edit access to undo changes.",
                        });
                        return;
                      }
                      if (!canUndo) return;
                      undoEdit();
                    },
                  },
                  {
                    title: "Zoom out",
                    icon: <ZoomOut className="h-5 w-5 text-foreground" aria-hidden />,
                    onClick: () => canvasRef.current?.zoomOut(),
                  },
                ]}
              />
            }
          />
          {steps.length === 0 && (
            <div className="pointer-events-none absolute inset-x-0 top-1/3 z-10 flex justify-center px-4">
              <div className="pointer-events-auto rounded-xl border border-dashed border-primary/40 bg-card px-6 py-4 text-center text-sm text-muted-foreground shadow-sm">
                No steps yet. Use <span className="font-medium text-primary">Add step</span> in the
                dock or open the add-step picker.
              </div>
            </div>
          )}
        </div>
      </div>

      <AddActionModal
        open={addModalOpen}
        pickerMode={addModalReplaceStepId ? "changeStepType" : "add"}
        onOpenChange={(open) => {
          setAddModalOpen(open);
          if (!open) {
            pendingInsertBetweenRef.current = null;
            setAddModalReplaceStepId(null);
          }
        }}
        actions={availableActions}
        onPickAction={(a, opts) => {
          if (addModalReplaceStepId) {
            const sid = addModalReplaceStepId;
            const base = getDefaultParamsForAction(a);
            const merged =
              opts?.params && typeof opts.params === "object" ? { ...base, ...opts.params } : base;
            handleStepUpdate(sid, { action: a, params: merged });
            toast.success(`Step type: ${formatAction(a)}`, {
              description: "Fields were reset for this action—complete any required values.",
            });
            return;
          }
          void handleAddStep(a as AnyAction, opts);
        }}
      />

      <WorkflowShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        shareEmail={shareEmail}
        onShareEmailChange={setShareEmail}
        inviteRole={shareInviteRole}
        onInviteRoleChange={setShareInviteRole}
        onShare={handleShare}
        sharing={sharing}
        collaborators={collaborators}
        onUnshare={handleUnshare}
        onCollaboratorRoleChange={handleCollaboratorRoleChange}
        roleChangePendingUid={roleChangePendingUid}
        liveCollaboratorUids={liveCollaboratorUidsForShare}
        workflowId={id}
        directLinkVariant="edit"
        canManageCollaborators={isOwner}
        currentUserUid={uid ?? null}
        isPublic={Boolean(workflow?.is_public)}
        onPublicChange={isOwner ? handleWorkflowPublicChange : undefined}
        publicSaving={publicSaving}
        canManagePublic={isOwner}
      />

      <Dialog open={renameStepId != null} onOpenChange={(open) => !open && setRenameStepId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename step</DialogTitle>
            <DialogDescription>
              Custom label shown on the canvas. Leave empty to use the default action name.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            placeholder="e.g. Check Slack for mentions"
            className="mt-1"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                confirmRenameStep();
              }
            }}
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setRenameStepId(null)}>
              <IconX className="size-4" aria-hidden />
              Cancel
            </Button>
            <Button type="button" onClick={confirmRenameStep}>
              <IconCheck className="size-4" aria-hidden />
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selectedStepId && selectedStep && selectedStepIndex >= 0 ? (
        <EchoNodeInspector
          open
          expanded={inspectorExpanded}
          onToggleExpand={() => setInspectorExpanded((e) => !e)}
          onClose={() => {
            setSelectedStepId(null);
            setInspectorExpanded(false);
          }}
          title={`Step ${selectedStepIndex + 1} — ${echoStepCardLabel(selectedStep)}`}
          headerStep={{
            action: selectedStep.action,
            composioSlug:
              selectedStep.action === "api_call" && typeof selectedStep.params?.slug === "string"
                ? selectedStep.params.slug
                : null,
            brandDomain:
              selectedStep.action === "open_app" || selectedStep.action === "focus_app"
                ? String(selectedStep.params?.brand_domain ?? "").trim() || null
                : null,
          }}
          rename={{
            stepNumber: selectedStepIndex + 1,
            customLabel: String((selectedStep.params?.display_label as string) ?? ""),
            displayLabel: echoStepCardLabel(selectedStep),
            defaultActionLabel: formatAction(selectedStep.action),
            onSaveLabel: (trimmed) => {
              if (!selectedStepId) return;
              const p: Record<string, unknown> = { ...(selectedStep.params ?? {}) };
              if (trimmed) p.display_label = trimmed;
              else delete p.display_label;
              handleStepUpdate(selectedStepId, { params: p });
            },
            readOnly: inspectorReadOnly || !canEdit,
          }}
        >
          <StepEditorPanel
            workflowId={id}
            step={selectedStep}
            dirtyStepIds={dirtyStepIds}
            invalidStepIds={invalidStepIds}
            handleStepUpdate={handleStepUpdate}
            handleDeleteStep={handleDeleteStep}
            onSaveStep={() => {
              if (selectedStepId) void handleSaveStep(selectedStepId);
            }}
            saveStepDisabled={
              !selectedStepId ||
              !dirtyStepIds.has(selectedStepId) ||
              inspectorReadOnly ||
              !canEdit ||
              savingStepId === selectedStepId
            }
            savingStep={savingStepId === selectedStepId}
            setInvalidStepIds={setInvalidStepIds}
            onOpenStepTypePicker={() => {
              setAddModalReplaceStepId(selectedStepId);
              setAddModalOpen(true);
            }}
            readOnly={inspectorReadOnly || !canEdit}
            lockOwnerLabel={lockOwnerLabel}
          />
        </EchoNodeInspector>
      ) : null}
    </div>
  );
}
