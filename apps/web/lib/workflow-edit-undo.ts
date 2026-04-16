import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { EchoPersistedFlow } from "@/lib/echo-flow-graph";

/** Serializable snapshot for undo/redo (steps + local drafts + canvas layout). */
export type WorkflowEditUndoSnapshot<TStep extends { id: string }> = {
  steps: TStep[];
  canvasFlow: EchoPersistedFlow | null;
  dirtyStepIds: string[];
  drafts: Record<string, TStep>;
  label: string;
};

export function cloneStepsForUndo<T>(steps: T[]): T[] {
  try {
    return structuredClone(steps);
  } catch {
    return JSON.parse(JSON.stringify(steps)) as T[];
  }
}

export function cloneFlowForUndo(flow: EchoPersistedFlow | null): EchoPersistedFlow | null {
  if (flow == null) return null;
  try {
    return structuredClone(flow);
  } catch {
    return JSON.parse(JSON.stringify(flow)) as EchoPersistedFlow;
  }
}

const GROUP_MS = 750;
const CANVAS_GROUP_MS = 1200;

type UndoOpts<TStep extends { id: string }> = {
  canEdit: boolean;
  workflowId: string;
  steps: TStep[];
  setSteps: Dispatch<SetStateAction<TStep[]>>;
  canvasFlow: EchoPersistedFlow | null;
  setCanvasFlow: Dispatch<SetStateAction<EchoPersistedFlow | null>>;
  dirtyStepIds: Set<string>;
  setDirtyStepIds: Dispatch<SetStateAction<Set<string>>>;
  dirtyStepIdsRef: MutableRefObject<Set<string>>;
  dirtyStepsDraftRef: MutableRefObject<Map<string, TStep>>;
  /** @deprecated Canvas flow is not persisted to the API; pass a no-op. */
  persistFlowToServer?: (g: EchoPersistedFlow) => void;
  /** Called right before applying a snapshot (undo/redo) so the host can skip the next canvas persist undo bump. */
  onBeforeApplySnapshot?: () => void;
};

export function useWorkflowEditUndo<TStep extends { id: string }>(opts: UndoOpts<TStep>) {
  const {
    canEdit,
    workflowId,
    steps,
    setSteps,
    canvasFlow,
    setCanvasFlow,
    dirtyStepIds,
    setDirtyStepIds,
    dirtyStepIdsRef,
    dirtyStepsDraftRef,
    onBeforeApplySnapshot,
  } = opts;

  const undoStack = useRef<WorkflowEditUndoSnapshot<TStep>[]>([]);
  const redoStack = useRef<WorkflowEditUndoSnapshot<TStep>[]>([]);
  const [, bump] = useState(0);
  const forceRerender = useCallback(() => bump((n) => n + 1), []);

  const inStepGroupRef = useRef(false);
  const stepGroupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inCanvasGroupRef = useRef(false);
  const canvasGroupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const capture = useCallback(
    (label: string): WorkflowEditUndoSnapshot<TStep> => ({
      steps: cloneStepsForUndo(steps),
      canvasFlow: cloneFlowForUndo(canvasFlow),
      dirtyStepIds: [...dirtyStepIds],
      drafts: Object.fromEntries(dirtyStepsDraftRef.current),
      label,
    }),
    [steps, canvasFlow, dirtyStepIds, dirtyStepsDraftRef],
  );

  const apply = useCallback(
    (snap: WorkflowEditUndoSnapshot<TStep>) => {
      onBeforeApplySnapshot?.();
      setSteps(cloneStepsForUndo(snap.steps));
      const flow = cloneFlowForUndo(snap.canvasFlow);
      setCanvasFlow(flow);
      const d = new Set(snap.dirtyStepIds);
      setDirtyStepIds(d);
      dirtyStepIdsRef.current = d;
      dirtyStepsDraftRef.current = new Map(Object.entries(snap.drafts)) as Map<string, TStep>;
    },
    [
      onBeforeApplySnapshot,
      setSteps,
      setCanvasFlow,
      setDirtyStepIds,
      dirtyStepIdsRef,
      dirtyStepsDraftRef,
    ],
  );

  const clearRedo = useCallback(() => {
    redoStack.current = [];
  }, []);

  const pushUndo = useCallback(
    (label: string) => {
      if (!canEdit) return;
      undoStack.current.push(capture(label));
      if (undoStack.current.length > 40) undoStack.current.shift();
      clearRedo();
      forceRerender();
    },
    [canEdit, capture, clearRedo, forceRerender],
  );

  const touchStepUndoGroup = useCallback(() => {
    if (!canEdit) return;
    if (!inStepGroupRef.current) {
      pushUndo("Step");
      inStepGroupRef.current = true;
    }
    if (stepGroupTimerRef.current) clearTimeout(stepGroupTimerRef.current);
    stepGroupTimerRef.current = setTimeout(() => {
      inStepGroupRef.current = false;
      stepGroupTimerRef.current = null;
    }, GROUP_MS);
  }, [canEdit, pushUndo]);

  const touchCanvasUndoGroup = useCallback(() => {
    if (!canEdit) return;
    if (!inCanvasGroupRef.current) {
      pushUndo("Canvas");
      inCanvasGroupRef.current = true;
    }
    if (canvasGroupTimerRef.current) clearTimeout(canvasGroupTimerRef.current);
    canvasGroupTimerRef.current = setTimeout(() => {
      inCanvasGroupRef.current = false;
      canvasGroupTimerRef.current = null;
    }, CANVAS_GROUP_MS);
  }, [canEdit, pushUndo]);

  const pushDiscreteUndo = useCallback(
    (label: string) => {
      if (!canEdit) return;
      if (stepGroupTimerRef.current) {
        clearTimeout(stepGroupTimerRef.current);
        stepGroupTimerRef.current = null;
      }
      if (canvasGroupTimerRef.current) {
        clearTimeout(canvasGroupTimerRef.current);
        canvasGroupTimerRef.current = null;
      }
      inStepGroupRef.current = false;
      inCanvasGroupRef.current = false;
      pushUndo(label);
    },
    [canEdit, pushUndo],
  );

  const undo = useCallback(() => {
    if (!canEdit || undoStack.current.length === 0) return;
    const prev = undoStack.current.pop()!;
    redoStack.current.push(capture("Current"));
    apply(prev);
    forceRerender();
  }, [canEdit, capture, apply, forceRerender]);

  const redo = useCallback(() => {
    if (!canEdit || redoStack.current.length === 0) return;
    const next = redoStack.current.pop()!;
    undoStack.current.push(capture("Current"));
    apply(next);
    forceRerender();
  }, [canEdit, capture, apply, forceRerender]);

  /** Undo N checkpoints at once (applies the oldest popped snapshot). */
  const undoMultiple = useCallback(
    (times: number) => {
      if (!canEdit || times < 1 || undoStack.current.length === 0) return;
      const k = Math.min(times, undoStack.current.length);
      const popped: WorkflowEditUndoSnapshot<TStep>[] = [];
      for (let i = 0; i < k; i++) {
        popped.push(undoStack.current.pop()!);
      }
      const target = popped[popped.length - 1]!;
      redoStack.current.push(capture("Current"));
      apply(target);
      forceRerender();
    },
    [canEdit, capture, apply, forceRerender],
  );

  useEffect(() => {
    undoStack.current = [];
    redoStack.current = [];
    inStepGroupRef.current = false;
    inCanvasGroupRef.current = false;
    forceRerender();
  }, [workflowId, forceRerender]);

  const stack = undoStack.current;
  const undoEntriesNewestFirst = [...stack].reverse().map((s, i) => ({
    id: stack.length - 1 - i,
    label: s.label,
    /** How many undos from the current state to restore this checkpoint (1-based). */
    undoCount: i + 1,
  }));

  return {
    touchStepUndoGroup,
    touchCanvasUndoGroup,
    pushDiscreteUndo,
    undo,
    redo,
    undoMultiple,
    canUndo: canEdit && undoStack.current.length > 0,
    canRedo: canEdit && redoStack.current.length > 0,
    undoEntriesNewestFirst,
    undoDepth: undoStack.current.length,
  };
}
