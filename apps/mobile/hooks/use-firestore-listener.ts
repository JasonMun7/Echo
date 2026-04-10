import { useEffect, useRef, useState } from "react";
import {
  query,
  collection,
  collectionGroup,
  doc,
  where,
  onSnapshot,
  orderBy,
  limit,
  type Query,
  type DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

/**
 * Generic hook for Firestore onSnapshot listeners.
 * Automatically subscribes/unsubscribes and returns live data.
 */
export function useFirestoreQuery<T = DocumentData>(
  queryFn: (() => Query<DocumentData>) | null,
  deps: unknown[] = [],
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!db || !queryFn) {
      setLoading(false);
      return;
    }

    const q = queryFn();
    const unsub = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as T);
        setData(items);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.warn("Firestore listener error:", err);
        setError(err);
        setLoading(false);
      },
    );

    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error };
}

/**
 * Listen to workflows owned by the current user.
 */
export function useOwnedWorkflows(uid: string | null) {
  return useFirestoreQuery(
    uid ? () => query(collection(db, "workflows"), where("owner_uid", "==", uid)) : null,
    [uid],
  );
}

/**
 * Listen to active runs for a user (running/pending/awaiting_user).
 */
export function useActiveRuns(uid: string | null) {
  return useFirestoreQuery(
    uid
      ? () =>
          query(
            collectionGroup(db, "runs"),
            where("owner_uid", "==", uid),
            where("status", "in", ["running", "pending", "awaiting_user"]),
          )
      : null,
    [uid],
  );
}

/**
 * Listen to runs for a specific workflow.
 */
export function useWorkflowRuns(workflowId: string | null) {
  return useFirestoreQuery(
    workflowId
      ? () =>
          query(
            collection(db, "workflows", workflowId, "runs"),
            orderBy("createdAt", "desc"),
            limit(50),
          )
      : null,
    [workflowId],
  );
}

/**
 * Listen to a single run's logs.
 */
export function useRunLogs(workflowId: string | null, runId: string | null) {
  return useFirestoreQuery(
    workflowId && runId
      ? () =>
          query(
            collection(db, "workflows", workflowId, "runs", runId, "logs"),
            orderBy("timestamp", "asc"),
          )
      : null,
    [workflowId, runId],
  );
}

/**
 * Listen to all runs for a user across all their workflows.
 * Queries each workflow's runs subcollection directly (avoids collectionGroup
 * index/rules requirements). Runs are merged and sorted client-side.
 */
export function useAllWorkflowRuns(workflowIds: string[], maxPerWorkflow = 30) {
  const [data, setData] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(true);
  // Store per-workflow snapshots in a ref so individual updates don't lose other data
  const bucketsRef = useRef<Map<string, DocumentData[]>>(new Map());
  // Track the previous set of IDs to detect changes
  const prevIdsRef = useRef<string>("");

  useEffect(() => {
    const key = workflowIds.slice().sort().join(",");
    if (!db || workflowIds.length === 0) {
      bucketsRef.current.clear();
      setData([]);
      setLoading(false);
      return;
    }

    // Only re-subscribe if the set of IDs changed
    if (key === prevIdsRef.current) return;
    prevIdsRef.current = key;

    bucketsRef.current.clear();
    setLoading(true);

    const unsubscribers = workflowIds.map((wfId) => {
      const q = query(
        collection(db, "workflows", wfId, "runs"),
        orderBy("createdAt", "desc"),
        limit(maxPerWorkflow),
      );
      return onSnapshot(
        q,
        (snap) => {
          bucketsRef.current.set(
            wfId,
            // Inject workflow_id so callers can navigate to /workflows/{wfId}/runs/{runId}
            // without requiring a redundant field on every Firestore run document.
            snap.docs.map((d) => ({ workflow_id: wfId, id: d.id, ...d.data() })),
          );
          const merged = Array.from(bucketsRef.current.values()).flat();
          setData(merged);
          setLoading(false);
        },
        () => {
          // On error for a specific workflow, keep existing data for others
          if (!bucketsRef.current.has(wfId)) {
            bucketsRef.current.set(wfId, []);
          }
          setLoading(false);
        },
      );
    });

    return () => {
      unsubscribers.forEach((fn) => fn());
      bucketsRef.current.clear();
      prevIdsRef.current = "";
    };
  }, [workflowIds.slice().sort().join(","), maxPerWorkflow]);

  return { data, loading };
}

/**
 * Listen to steps for a specific workflow, ordered by step order.
 */
export function useWorkflowSteps(workflowId: string | null) {
  return useFirestoreQuery(
    workflowId
      ? () => query(collection(db, "workflows", workflowId, "steps"), orderBy("order", "asc"))
      : null,
    [workflowId],
  );
}

/**
 * Listen to a single run document and return its current status.
 */
export function useRunStatus(workflowId: string | null, runId: string | null) {
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!db || !workflowId || !runId) {
      setStatus(null);
      return;
    }

    // Reset status when switching to a different run so we don't briefly show stale data
    setStatus(null);

    const docRef = doc(db, "workflows", workflowId, "runs", runId);
    const unsub = onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          setStatus(snap.data()?.status ?? null);
        }
      },
      (err) => {
        console.warn("Run status listener error:", err);
      },
    );

    return unsub;
  }, [workflowId, runId]);

  return status;
}

/**
 * Listen to pending invites for the current user.
 */
export function usePendingInvites(uid: string | null) {
  return useFirestoreQuery(
    uid
      ? () =>
          query(
            collection(db, "workflow_invites"),
            where("to_uid", "==", uid),
            where("status", "==", "pending"),
          )
      : null,
    [uid],
  );
}
