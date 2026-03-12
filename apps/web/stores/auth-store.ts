"use client";

import { create } from "zustand";
import {
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

interface AuthState {
  user: User | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  signIn: (email: string, password: string) => Promise<unknown>;
  signUp: (email: string, password: string) => Promise<unknown>;
  signInWithGoogle: () => Promise<unknown>;
  signOut: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: true,

  setUser: (user) => set({ user }),
  setLoading: (loading) => set({ loading }),

  signIn: (email, password) =>
    auth ? signInWithEmailAndPassword(auth, email, password) : Promise.reject(),

  signUp: (email, password) =>
    auth
      ? createUserWithEmailAndPassword(auth, email, password)
      : Promise.reject(),

  signInWithGoogle: () =>
    auth
      ? signInWithPopup(auth, new GoogleAuthProvider())
      : Promise.reject(),

  signOut: () => (auth ? signOut(auth) : Promise.resolve()),

  getIdToken: async () => {
    const user = get().user ?? auth?.currentUser;
    return user ? user.getIdToken() : null;
  },
}));
