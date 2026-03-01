"use client";

import React, { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { createOrUpdateUser } from "@/lib/firestore";
import { apiFetch } from "@/lib/api";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
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

  return <>{children}</>;
}
