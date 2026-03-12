import { create } from "zustand";
import { useAuthStore } from "./auth-store";
import { useUIStore } from "./ui-store";

export interface WorkflowInfo {
  id: string;
  name?: string;
  status?: string;
  workflow_type?: string;
}

interface WorkflowsState {
  workflows: WorkflowInfo[];
  workflowsLoading: boolean;
  workflowsError: string;
  selectedWorkflowId: string;
  selectedWorkflowType: string;
  workflow: Record<string, unknown> | null;
  steps: Array<Record<string, unknown>>;
  fetching: boolean;
  fetchError: string;
  loadWorkflows: () => Promise<void>;
  selectWorkflow: (workflowId: string) => void;
  setWorkflow: (workflow: Record<string, unknown> | null) => void;
  setSteps: (steps: Array<Record<string, unknown>>) => void;
  handleSelectWorkflow: (workflowId: string) => Promise<void>;
  clearWorkflowDetail: () => void;
  resetOnSignOut: () => void;
  handleDeleteWorkflow: (workflowId: string) => Promise<void>;
}

export const useWorkflowsStore = create<WorkflowsState>((set, get) => ({
  workflows: [],
  workflowsLoading: false,
  workflowsError: "",
  selectedWorkflowId: "",
  selectedWorkflowType: "desktop",
  workflow: null,
  steps: [],
  fetching: false,
  fetchError: "",

  loadWorkflows: async () => {
    const token = useAuthStore.getState().token ?? (await useAuthStore.getState().loadToken());
    if (!token) {
      set({ workflows: [] });
      return;
    }
    set({ workflowsLoading: true, workflowsError: "" });
    try {
      const result = await window.electronAPI?.listWorkflows?.({ token });
      if (result && "error" in result) {
        if (result.error?.includes("401")) {
          await window.electronAPI?.authClearToken?.();
          useAuthStore.getState().signOut();
          set({ workflows: [] });
          return;
        }
        set({ workflowsError: result.error ?? "", workflows: [] });
      } else if (result && "workflows" in result) {
        set({ workflows: result.workflows ?? [] });
      }
    } finally {
      set({ workflowsLoading: false });
    }
  },

  selectWorkflow: (workflowId) => {
    const wf = get().workflows.find((w) => w.id === workflowId);
    set({
      selectedWorkflowId: workflowId,
      selectedWorkflowType: wf?.workflow_type ?? "desktop",
    });
  },

  setWorkflow: (workflow) => set({ workflow }),
  setSteps: (steps) => set({ steps }),

  handleSelectWorkflow: async (workflowId) => {
    const { workflows } = get();
    const wf = workflows.find((w) => w.id === workflowId);
    set({
      selectedWorkflowId: workflowId,
      selectedWorkflowType: wf?.workflow_type ?? "desktop",
      workflow: null,
      steps: [],
      fetching: true,
      fetchError: "",
    });
    const token = useAuthStore.getState().token ?? (await useAuthStore.getState().loadToken());
    if (!token) return;
    try {
      const result = await window.electronAPI?.fetchWorkflow?.({
        workflowId,
        token,
      });
      if (result && "error" in result) {
        if (result.error?.includes("401")) {
          await window.electronAPI?.authClearToken?.();
          useAuthStore.getState().signOut();
          return;
        }
        set({ fetchError: result.error ?? "" });
      } else if (result && "workflow" in result) {
        set({
          workflow: result.workflow,
          steps: result.steps ?? [],
        });
      }
    } finally {
      set({ fetching: false });
    }
  },

  clearWorkflowDetail: () => {
    set({
      workflow: null,
      steps: [],
    });
  },

  resetOnSignOut: () => {
    set({
      workflows: [],
      selectedWorkflowId: "",
      selectedWorkflowType: "desktop",
      workflow: null,
      steps: [],
    });
  },

  handleDeleteWorkflow: async (workflowId: string) => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    try {
      const base = (import.meta as { env?: { VITE_API_URL?: string } }).env
        ?.VITE_API_URL?.replace(/\/$/, "") ?? "http://localhost:8000";
      const res = await fetch(
        `${base}/api/workflows/${encodeURIComponent(workflowId)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (!res.ok) throw new Error("Failed to delete workflow");
      get().loadWorkflows();
      if (get().selectedWorkflowId === workflowId) {
        set({
          selectedWorkflowId: "",
          workflow: null,
          steps: [],
        });
        useUIStore.getState().setPage("home");
      }
    } catch {
      // Non-fatal
    }
  },
}));
