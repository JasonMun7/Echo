import { useEffect, useRef } from "react";
import {
  collectionGroup,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";
import type { FirebaseApp } from "firebase/app";
import type { Firestore } from "firebase/firestore";
import { getAuth, signInWithCustomToken } from "firebase/auth";
import { db, app } from "@/lib/firebase";

const API_URL =
  (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ??
  "http://localhost:8000";

/**
 * Listens in real-time for pending runs owned by the current user via Firestore onSnapshot.
 * Signs in to Firebase Auth using a custom token from the backend, then subscribes
 * to pending runs. When a pending run appears (e.g. triggered from mobile chat/voice),
 * calls `onRunDetected` so the desktop can auto-start execution.
 */
export function usePendingRunListener(
  token: string | null,
  onRunDetected: (arg: {
    workflowId: string;
    runId: string;
    goalOnly?: boolean;
    goal?: string;
  }) => void,
) {
  const onRunDetectedRef = useRef(onRunDetected);
  onRunDetectedRef.current = onRunDetected;

  // Track runs we've already dispatched to avoid re-triggering
  const handledRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!token) return;
    const firebaseApp = app;
    const firestore = db;
    if (firebaseApp == null || firestore == null) return;
    const fApp: FirebaseApp = firebaseApp;
    const fDb: Firestore = firestore;

    let unsub: (() => void) | null = null;
    let cancelled = false;

    async function setup() {
      try {
        // Get a custom token from the backend
        const resp = await fetch(`${API_URL}/api/users/custom-token`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!resp.ok || cancelled) return;
        const { custom_token } = await resp.json();

        // Sign in to Firebase Auth with the custom token
        const auth = getAuth(fApp);
        await signInWithCustomToken(auth, custom_token);
        if (cancelled) return;

        const uid = auth.currentUser?.uid;
        if (!uid) return;

        console.log("[pending-run-listener] Firebase auth successful, uid:", uid);

        // Subscribe to pending runs
        const q = query(
          collectionGroup(fDb, "runs"),
          where("owner_uid", "==", uid),
          where("status", "==", "pending"),
        );

        unsub = onSnapshot(
          q,
          (snapshot) => {
            for (const change of snapshot.docChanges()) {
              if (change.type !== "added") continue;
              const doc = change.doc;
              const data = doc.data();

              // Extract workflow_id from path: workflows/{wf_id}/runs/{run_id}
              const pathParts = doc.ref.path.split("/");
              const workflowId = pathParts.length >= 4 ? pathParts[1] : "";
              const runId = doc.id;
              const key = `${workflowId}/${runId}`;

              if (handledRef.current.has(key)) continue;
              handledRef.current.add(key);

              const goalOnly = data.run_mode === "goal_only";
              const goal = typeof data.goal === "string" ? data.goal : undefined;

              console.log("[pending-run-listener] detected pending run", key);
              onRunDetectedRef.current({ workflowId, runId, goalOnly, goal });
            }
          },
          (err) => {
            console.warn("[pending-run-listener] onSnapshot error", err);
          },
        );
      } catch (err) {
        console.error("[pending-run-listener] setup failed:", err);
      }
    }

    setup();

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [token]);
}
