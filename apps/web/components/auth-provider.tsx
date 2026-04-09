"use client";

import React, { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { createOrUpdateUser } from "@/lib/firestore";
import { apiFetch } from "@/lib/api";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuthStore } from "@/stores";

/**
 * Initializes and synchronizes authentication state, exposes it to the auth store, and renders children wrapped with a TooltipProvider.
 *
 * On mount the component: if no `auth` is present it clears the loading state; otherwise it waits for an optional `authStateReady()` hook, registers a Firebase auth state listener that updates the auth store, ensures the user's ID token, calls the backend `/api/users/init`, and synchronizes the user to Firestore. The listener is cleaned up on unmount.
 *
 * @param children - The content to render inside the provider
 * @returns The provided `children` wrapped in a `TooltipProvider`
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!auth) {
      useAuthStore.getState().setLoading(false);
      return;
    }
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    const a = auth as { authStateReady?: () => Promise<void> };
    void (async () => {
      if (typeof a.authStateReady === "function") {
        await a.authStateReady();
      }
      if (cancelled) return;
      unsubscribe = onAuthStateChanged(auth, async (user) => {
        useAuthStore.getState().setUser(user);
        useAuthStore.getState().setLoading(false);
        if (user) {
          try {
            // Mint ID token before backend calls. Run /api/users/init before Firestore so a
            // blocked firestore.googleapis.com (ad blockers → ERR_BLOCKED_BY_CLIENT) does not skip init.
            await user.getIdToken();
            await apiFetch("/api/users/init", { method: "POST" });
            await createOrUpdateUser(user);
          } catch (err) {
            console.error("Failed to sync user:", err);
          }
        }
      });
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  return <TooltipProvider>{children}</TooltipProvider>;
}
