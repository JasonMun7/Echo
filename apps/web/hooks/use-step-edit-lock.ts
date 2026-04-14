"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, setDoc } from "firebase/firestore";
import type { User } from "firebase/auth";

import { db } from "@/lib/firebase";

const LEASE_MS = 45_000;
/** Keep well under lease; avoid stacking with other writers. */
const HEARTBEAT_MS = 22_000;

/**
 * §7b — Firestore-backed step edit lease (owner + collaborators).
 * While `activeStepId` is set, renews `workflows/{wf}/stepLocks/{stepId}` until unmount.
 *
 * Important: the heartbeat effect must NOT depend on `peerLocks`. Any change to another
 * collaborator’s lock would re-run the effect, tear down the interval, and call delete+set
 * in a loop — exhausting the Firestore client write stream (“queued writes”).
 */
export function useStepEditLock(
  workflowId: string | undefined,
  currentUser: User | null | undefined,
  activeStepId: string | null,
) {
  const myUid = currentUser?.uid ?? "";
  const displayName =
    currentUser?.displayName?.trim() || currentUser?.email?.split("@")[0] || "Editor";

  const [peerLocks, setPeerLocks] = useState<Map<string, string>>(() => new Map());
  /** UIDs of other users with a non-expired step lock (actively editing this workflow). */
  const [activeEditorUids, setActiveEditorUids] = useState<Set<string>>(() => new Set());
  /** Display name from each peer's lock doc (for avatars when they're not in the collaborators API list). */
  const [peerDisplayNameByUid, setPeerDisplayNameByUid] = useState<Map<string, string>>(
    () => new Map(),
  );
  const peerLocksRef = useRef<Map<string, string>>(new Map());
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!workflowId || !db) {
      peerLocksRef.current = new Map();
      setPeerLocks(new Map());
      setActiveEditorUids(new Set());
      setPeerDisplayNameByUid(new Map());
      return;
    }
    const col = collection(db, "workflows", workflowId, "stepLocks");
    const unsub = onSnapshot(col, (snap) => {
      const now = Date.now();
      const next = new Map<string, string>();
      const uids = new Set<string>();
      const namesByUid = new Map<string, string>();
      for (const d of snap.docs) {
        const data = d.data() as { uid?: string; until?: number; display_name?: string };
        if (!data.uid || data.uid === myUid) continue;
        if (typeof data.until !== "number" || data.until < now) continue;
        const label = (data.display_name as string)?.trim() || "Collaborator";
        next.set(d.id, label);
        uids.add(data.uid);
        namesByUid.set(data.uid, label);
      }
      peerLocksRef.current = next;
      setPeerLocks(next);
      setActiveEditorUids(uids);
      setPeerDisplayNameByUid(namesByUid);
    });
    return () => unsub();
  }, [workflowId, myUid]);

  useEffect(() => {
    if (!workflowId || !db || !myUid || !activeStepId) {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      return;
    }

    if (peerLocksRef.current.has(activeStepId)) {
      return;
    }

    const lockRef = doc(db, "workflows", workflowId, "stepLocks", activeStepId);
    const touch = () => {
      if (peerLocksRef.current.has(activeStepId)) {
        return;
      }
      void setDoc(
        lockRef,
        {
          uid: myUid,
          until: Date.now() + LEASE_MS,
          display_name: displayName,
        },
        { merge: true },
      );
    };
    touch();
    heartbeatRef.current = setInterval(touch, HEARTBEAT_MS);
    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      void deleteDoc(lockRef).catch(() => {});
    };
  }, [workflowId, myUid, activeStepId, displayName]);

  const lockInfo = useMemo(() => {
    if (!activeStepId) return { readOnly: false, ownerLabel: null as string | null };
    const label = peerLocks.get(activeStepId);
    if (!label) return { readOnly: false, ownerLabel: null as string | null };
    return { readOnly: true, ownerLabel: label };
  }, [activeStepId, peerLocks]);

  return {
    peerLocks,
    activeEditorUids,
    peerDisplayNameByUid,
    lockOwnerLabel: lockInfo.ownerLabel,
    inspectorReadOnly: lockInfo.readOnly,
  };
}
