"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, setDoc } from "firebase/firestore";
import type { User } from "firebase/auth";

import { db } from "@/lib/firebase";

const LEASE_MS = 45_000;
/** Keep well under lease; avoid stacking with other writers. */
const HEARTBEAT_MS = 22_000;

export type PeerStepLockMeta = {
  uid: string;
  displayName: string;
  photoURL?: string | null;
};

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
  const myPhotoURL = currentUser?.photoURL?.trim() || null;

  /** stepId → collaborator display name (compact, for banners / legacy). */
  const [peerLocks, setPeerLocks] = useState<Map<string, string>>(() => new Map());
  /** stepId → uid, name, photo for canvas highlights and avatars. */
  const [peerLockMetaByStepId, setPeerLockMetaByStepId] = useState<Map<string, PeerStepLockMeta>>(
    () => new Map(),
  );
  /** UIDs of other users with a non-expired step lock (actively editing this workflow). */
  const [activeEditorUids, setActiveEditorUids] = useState<Set<string>>(() => new Set());
  /** Display name from each peer's lock doc (for avatars when they're not in the collaborators API list). */
  const [peerDisplayNameByUid, setPeerDisplayNameByUid] = useState<Map<string, string>>(
    () => new Map(),
  );
  /** Best-effort profile photo per peer uid from step lock docs. */
  const [peerPhotoUrlByUid, setPeerPhotoUrlByUid] = useState<Map<string, string | undefined>>(
    () => new Map(),
  );
  const peerLocksRef = useRef<Map<string, string>>(new Map());
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!workflowId || !db) {
      peerLocksRef.current = new Map();
      setPeerLocks(new Map());
      setPeerLockMetaByStepId(new Map());
      setActiveEditorUids(new Set());
      setPeerDisplayNameByUid(new Map());
      setPeerPhotoUrlByUid(new Map());
      return;
    }
    const col = collection(db, "workflows", workflowId, "stepLocks");
    const unsub = onSnapshot(
      col,
      (snap) => {
        const now = Date.now();
        const next = new Map<string, string>();
        const meta = new Map<string, PeerStepLockMeta>();
        const uids = new Set<string>();
        const namesByUid = new Map<string, string>();
        const photosByUid = new Map<string, string | undefined>();
        for (const d of snap.docs) {
          const data = d.data() as {
            uid?: string;
            until?: number;
            display_name?: string;
            photo_url?: string | null;
          };
          if (!data.uid || data.uid === myUid) continue;
          if (typeof data.until !== "number" || data.until < now) continue;
          const label = (data.display_name as string)?.trim() || "Collaborator";
          const photoURL = typeof data.photo_url === "string" ? data.photo_url : undefined;
          next.set(d.id, label);
          meta.set(d.id, { uid: data.uid, displayName: label, photoURL });
          uids.add(data.uid);
          namesByUid.set(data.uid, label);
          if (photoURL) photosByUid.set(data.uid, photoURL);
        }
        peerLocksRef.current = next;
        setPeerLocks(next);
        setPeerLockMetaByStepId(meta);
        setActiveEditorUids(uids);
        setPeerDisplayNameByUid(namesByUid);
        setPeerPhotoUrlByUid(photosByUid);
      },
      (err) => {
        console.warn("[step-edit-lock] stepLocks snapshot error:", workflowId, err);
      },
    );
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
          ...(myPhotoURL ? { photo_url: myPhotoURL } : {}),
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
  }, [workflowId, myUid, activeStepId, displayName, myPhotoURL]);

  const lockInfo = useMemo(() => {
    if (!activeStepId) return { readOnly: false, ownerLabel: null as string | null };
    const label = peerLocks.get(activeStepId);
    if (!label) return { readOnly: false, ownerLabel: null as string | null };
    return { readOnly: true, ownerLabel: label };
  }, [activeStepId, peerLocks]);

  return {
    peerLocks,
    peerLockMetaByStepId,
    activeEditorUids,
    peerDisplayNameByUid,
    peerPhotoUrlByUid,
    lockOwnerLabel: lockInfo.ownerLabel,
    inspectorReadOnly: lockInfo.readOnly,
  };
}
