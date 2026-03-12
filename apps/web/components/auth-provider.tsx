"use client";

import React, { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { createOrUpdateUser } from "@/lib/firestore";
import { apiFetch } from "@/lib/api";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuthStore } from "@/stores";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!auth) {
      useAuthStore.getState().setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      useAuthStore.getState().setUser(user);
      useAuthStore.getState().setLoading(false);
      if (user) {
        try {
          await createOrUpdateUser(user);
          await apiFetch("/api/users/init", { method: "POST" });
        } catch (err) {
          console.error("Failed to sync user:", err);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  return <TooltipProvider>{children}</TooltipProvider>;
}
