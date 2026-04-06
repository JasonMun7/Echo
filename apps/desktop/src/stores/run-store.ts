import { create } from "zustand";
import { useAuthStore } from "./auth-store";
import { useWorkflowsStore } from "./workflows-store";

export interface LiveProgressEntry {
  thought: string;
  action: string;
  step: number;
}

export interface RunResultEntry {
  thought: string;
  action: string;
  step: number;
}

export interface RunResult {
  success: boolean;
  error?: string;
  progress?: string[];
  entries?: RunResultEntry[];
  runId?: string;
  workflowId?: string;
}

const API_URL =
  (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ??
  "http://localhost:8000";

interface RunState {
  running: boolean;
  currentRunId: string | null;
  runPaused: boolean;
  runResult: RunResult | null;
  runResultDismissed: boolean;
  liveProgress: LiveProgressEntry[];
  interruptText: string;
  sendingInterrupt: boolean;
  setInterruptText: (text: string) => void;
  dismissRunResult: () => void;
  appendLiveProgress: (entry: LiveProgressEntry) => void;
  handleRun: () => Promise<void>;
  handleRunWorkflow: (args: {
    workflowId: string;
    steps: Array<Record<string, unknown>>;
    workflowType: string;
  }) => Promise<void>;
  handleRunStarted: (arg: {
    workflowId: string;
    runId: string;
    goalOnly?: boolean;
    goal?: string;
  }) => Promise<void>;
  handleCancelRun: () => Promise<void>;
  handleInterrupt: () => Promise<void>;
  resetRun: () => void;
}

export const useRunStore = create<RunState>((set, get) => ({
  running: false,
  currentRunId: null,
  runPaused: false,
  runResult: null,
  runResultDismissed: false,
  liveProgress: [],
  interruptText: "",
  sendingInterrupt: false,

  setInterruptText: (text) => set({ interruptText: text }),
  dismissRunResult: () => set({ runResultDismissed: true }),
  appendLiveProgress: (entry) =>
    set((s) => ({ liveProgress: [...s.liveProgress, entry] })),

  resetRun: () =>
    set({
      running: false,
      runPaused: false,
      currentRunId: null,
      liveProgress: [],
    }),

  handleRun: async () => {
    const token = useAuthStore.getState().token ?? (await useAuthStore.getState().loadToken());
    const { selectedWorkflowId, selectedWorkflowType, steps } = useWorkflowsStore.getState();
    if (!steps.length || !token) return;

    const hasPermission = await window.electronAPI?.checkScreenPermission?.();
    if (!hasPermission) {
      useAuthStore.getState().setScreenPermissionRequired(true);
      return;
    }

    const sourceId = await window.electronAPI?.getPrimarySourceId?.();
    if (!sourceId) {
      set({
        runResult: {
          success: false,
          error: "Could not get primary display",
          workflowId: selectedWorkflowId,
        },
      });
      return;
    }

    set({
      running: true,
      runResult: null,
      runResultDismissed: false,
      liveProgress: [],
    });

    window.electronAPI?.onRunProgress?.((entry) => {
      get().appendLiveProgress(entry);
    });

    try {
      const createRes = await window.electronAPI?.createRun?.({
        workflowId: selectedWorkflowId,
        token,
      });
      if (createRes && "error" in createRes) {
        set({
          runResult: {
            success: false,
            error: createRes.error,
            workflowId: selectedWorkflowId,
          },
        });
        return;
      }
      const runId = createRes && "runId" in createRes ? createRes.runId : undefined;
      set({ currentRunId: runId ?? null });

      await window.electronAPI?.enterRunMode?.({
        workflowId: selectedWorkflowId,
        runId: runId ?? "",
        token,
      });

      const result = await window.electronAPI?.runWorkflowLocal?.({
        steps,
        sourceId,
        workflowType: selectedWorkflowType,
        workflowId: selectedWorkflowId,
        runId,
        token,
      });
      window.electronAPI?.removeRunProgressListener?.();
      set({
        runResult: {
          ...(result ?? { success: false, error: "No response" }),
          workflowId: selectedWorkflowId,
          runId,
        },
      });
    } finally {
      get().resetRun();
      await window.electronAPI?.exitRunMode?.();
    }
  },

  handleRunWorkflow: async (args) => {
    const token = useAuthStore.getState().token ?? (await useAuthStore.getState().loadToken());
    if (!args.steps.length || !token) return;

    const hasPermission = await window.electronAPI?.checkScreenPermission?.();
    if (!hasPermission) {
      useAuthStore.getState().setScreenPermissionRequired(true);
      return;
    }

    const sourceId = await window.electronAPI?.getPrimarySourceId?.();
    if (!sourceId) {
      set({
        runResult: {
          success: false,
          error: "Could not get primary display",
          workflowId: args.workflowId,
        },
      });
      return;
    }

    useWorkflowsStore.getState().selectWorkflow(args.workflowId);

    set({
      running: true,
      runResult: null,
      runResultDismissed: false,
      liveProgress: [],
    });

    window.electronAPI?.onRunProgress?.((entry) => {
      get().appendLiveProgress(entry);
    });

    try {
      const createRes = await window.electronAPI?.createRun?.({
        workflowId: args.workflowId,
        token,
      });
      if (createRes && "error" in createRes) {
        set({
          runResult: {
            success: false,
            error: createRes.error,
            workflowId: args.workflowId,
          },
        });
        return;
      }
      const runId = createRes && "runId" in createRes ? createRes.runId : undefined;
      set({ currentRunId: runId ?? null });

      await window.electronAPI?.enterRunMode?.({
        workflowId: args.workflowId,
        runId: runId ?? "",
        token,
      });

      const result = await window.electronAPI?.runWorkflowLocal?.({
        steps: args.steps,
        sourceId,
        workflowType: args.workflowType,
        workflowId: args.workflowId,
        runId,
        token,
      });
      window.electronAPI?.removeRunProgressListener?.();
      set({
        runResult: {
          ...(result ?? { success: false, error: "No response" }),
          workflowId: args.workflowId,
          runId,
        },
      });
    } finally {
      get().resetRun();
      await window.electronAPI?.exitRunMode?.();
    }
  },

  handleRunStarted: async (arg) => {
    const token = useAuthStore.getState().token ?? (await useAuthStore.getState().loadToken());
    if (!token) return;

    const hasPermission = await window.electronAPI?.checkScreenPermission?.();
    if (!hasPermission) {
      useAuthStore.getState().setScreenPermissionRequired(true);
      return;
    }

    const sourceId = await window.electronAPI?.getPrimarySourceId?.();
    if (!sourceId) return;

    const goalOnly = arg.goalOnly === true && typeof arg.goal === "string" && arg.goal.trim().length > 0;

    if (goalOnly) {
      const goal = arg.goal!.trim();
      console.log("[run-store] goal-only run_started", {
        workflowId: arg.workflowId,
        runId: arg.runId,
        goal: goal.slice(0, 80),
      });
      useWorkflowsStore.getState().selectWorkflow(arg.workflowId);
      set({
        running: true,
        runResult: null,
        runResultDismissed: false,
        liveProgress: [],
        currentRunId: arg.runId,
      });

      window.electronAPI?.onRunProgress?.((entry) => {
        get().appendLiveProgress(entry);
      });

      try {
        console.log("[run-store] goal-only: calling enterRunMode (HUD for progress, EchoPrism stays open)");
        await window.electronAPI?.enterRunMode?.({
          workflowId: arg.workflowId,
          runId: arg.runId,
          token,
          goalOnly: true,
        });
        console.log("[run-store] goal-only: calling runGoalOnlyLocal", { goal: goal.slice(0, 60), sourceId });
        const runResult = await window.electronAPI?.runGoalOnlyLocal?.({
          goal,
          sourceId,
          workflowType: "desktop",
          workflowId: arg.workflowId,
          runId: arg.runId,
          token,
        });
        window.electronAPI?.removeRunProgressListener?.();
        const accumulated = get().liveProgress;
        console.log("[run-store] goal-only: run finished", {
          success: runResult?.success,
          error: runResult?.error,
          entriesCount: accumulated.length,
        });
        set({
          runResult: {
            ...(runResult ?? { success: false, error: "No response" }),
            workflowId: arg.workflowId,
            runId: arg.runId,
            entries: accumulated.length > 0 ? [...accumulated] : (runResult?.entries ?? []),
          },
        });
      } catch (err) {
        console.error("[run-store] goal-only: run failed", err);
        set({
          runResult: {
            success: false,
            error: err instanceof Error ? err.message : String(err),
            workflowId: arg.workflowId,
            runId: arg.runId,
          },
        });
      } finally {
        get().resetRun();
        await window.electronAPI?.exitRunMode?.();
      }
      return;
    }

    const result = await window.electronAPI?.fetchWorkflow?.({
      workflowId: arg.workflowId,
      token,
    });
    if (!result || "error" in result) return;
    const { workflow, steps } = result;
    if (!steps?.length) return;

    useWorkflowsStore.getState().selectWorkflow(arg.workflowId);
    useWorkflowsStore.getState().setWorkflow(workflow);
    useWorkflowsStore.getState().setSteps(steps);

    set({
      running: true,
      runResult: null,
      runResultDismissed: false,
      liveProgress: [],
      currentRunId: arg.runId,
    });

    window.electronAPI?.onRunProgress?.((entry) => {
      get().appendLiveProgress(entry);
    });

    try {
      await window.electronAPI?.enterRunMode?.({
        workflowId: arg.workflowId,
        runId: arg.runId,
        token,
      });
      const runResult = await window.electronAPI?.runWorkflowLocal?.({
        steps,
        sourceId,
        workflowType:
          (workflow as { workflow_type?: string }).workflow_type ?? "desktop",
        workflowId: arg.workflowId,
        runId: arg.runId,
        token,
      });
      window.electronAPI?.removeRunProgressListener?.();
      const accumulated = get().liveProgress;
      set({
        runResult: {
          ...(runResult ?? { success: false, error: "No response" }),
          workflowId: arg.workflowId,
          runId: arg.runId,
          entries: accumulated.length > 0 ? [...accumulated] : (runResult?.entries ?? []),
        },
      });
    } finally {
      get().resetRun();
      await window.electronAPI?.exitRunMode?.();
    }
  },

  handleCancelRun: async () => {
    const { selectedWorkflowId } = useWorkflowsStore.getState();
    const { currentRunId } = get();
    const token = useAuthStore.getState().token;
    if (!selectedWorkflowId || !currentRunId || !token) return;

    window.electronAPI?.resumeRun?.();
    try {
      const base = API_URL.replace(/\/$/, "");
      await fetch(`${base}/api/run/${selectedWorkflowId}/${currentRunId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // Non-fatal
    }
  },

  handleInterrupt: async () => {
    const { selectedWorkflowId } = useWorkflowsStore.getState();
    const { currentRunId, interruptText } = get();
    const token = useAuthStore.getState().token;
    if (!interruptText.trim() || !selectedWorkflowId || !currentRunId || !token) return;

    set({ sendingInterrupt: true });
    try {
      const base = API_URL.replace(/\/$/, "");
      const res = await fetch(
        `${base}/api/run/${selectedWorkflowId}/${currentRunId}/redirect`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ instruction: interruptText.trim() }),
        }
      );
      if (res.ok) set({ interruptText: "" });
    } finally {
      set({ sendingInterrupt: false });
    }
  },
}));
