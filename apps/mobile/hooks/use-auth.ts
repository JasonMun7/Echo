import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuthStore } from "@/stores/auth-store";
import { createOrUpdateUser } from "@/lib/firestore";
import { apiFetch } from "@/lib/api";

/**
 * Listens to Firebase auth state and syncs with Zustand store.
 * Call once in the root layout.
 */
export function useAuthListener() {
  const setUser = useAuthStore((s) => s.setUser);
  const setLoading = useAuthStore((s) => s.setLoading);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        try {
          await createOrUpdateUser(user);
          await apiFetch("/api/users/init", { method: "POST" });
        } catch {
          // Non-critical — user profile sync can retry later
        }
      }
      setLoading(false);
    });

    return unsubscribe;
  }, [setUser, setLoading]);
}
