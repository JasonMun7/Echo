import { create } from "zustand";

export type Page = "home" | "detail" | "edit" | "schedule";

interface UIState {
  page: Page;
  echoPrismModalOpen: boolean;
  isCollapsed: boolean;
  workflowSearchOpen: boolean;
  workflowSearchQuery: string;
  setPage: (page: Page) => void;
  setEchoPrismModalOpen: (open: boolean) => void;
  setIsCollapsed: (collapsed: boolean) => void;
  setWorkflowSearchOpen: (open: boolean) => void;
  setWorkflowSearchQuery: (query: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  page: "home",
  echoPrismModalOpen: false,
  isCollapsed: false,
  workflowSearchOpen: false,
  workflowSearchQuery: "",

  setPage: (page) => set({ page }),
  setEchoPrismModalOpen: (open) => set({ echoPrismModalOpen: open }),
  setIsCollapsed: (collapsed) => set({ isCollapsed: collapsed }),
  setWorkflowSearchOpen: (open) => set({ workflowSearchOpen: open }),
  setWorkflowSearchQuery: (query) => set({ workflowSearchQuery: query }),
}));
