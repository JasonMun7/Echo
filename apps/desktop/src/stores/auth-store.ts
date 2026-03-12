import { create } from "zustand";

interface AuthState {
  token: string | null;
  screenPermissionRequired: boolean;
  loadToken: () => Promise<string | null>;
  signIn: () => void;
  signOut: () => Promise<void>;
  setScreenPermissionRequired: (value: boolean) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  screenPermissionRequired: false,

  loadToken: async () => {
    const t = await window.electronAPI?.authGetToken?.();
    set({ token: t ?? null });
    return t ?? null;
  },

  signIn: () => {
    window.electronAPI?.authOpenSignin?.();
  },

  signOut: async () => {
    await window.electronAPI?.authClearToken?.();
    set({ token: null });
  },

  setScreenPermissionRequired: (value: boolean) => {
    set({ screenPermissionRequired: value });
  },
}));
