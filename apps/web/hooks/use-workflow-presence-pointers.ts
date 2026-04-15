"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { collection, deleteDoc, deleteField, doc, onSnapshot, setDoc } from "firebase/firestore";

import { db } from "@/lib/firebase";

const THROTTLE_MS = 120;
const REORDER_WRITE_MS = 220;
const STALE_MS = 12_000;
/** Refresh presence doc while on the canvas so peers see you without constant mouse movement. */
const HEARTBEAT_MS = 8000;

export type PresencePeer = {
  uid: string;
  /** Legacy 0–1 position over the canvas card (kept for older clients). */
  x: number;
  y: number;
  /** React Flow graph coordinates — used for rendering + viewport culling. */
  flowX: number;
  flowY: number;
  displayName: string;
  photoURL?: string | null;
  /** Step id the peer is dragging to reorder (live). */
  draggingStepId?: string;
  /** Projected order of step ids while the peer is reordering (same as local Y-sort). */
  reorderPreviewIds?: string[];
};

/** Payload from the canvas: normalized card position + flow-space pointer (for peers’ viewports). */
export type CanvasPointerReport = {
  x: number;
  y: number;
  flowX: number;
  flowY: number;
};

export type ReorderPresenceState = {
  draggingStepId: string | null;
  orderedStepIds: string[] | null;
};

/**
 * Throttled writes to `workflows/{id}/presencePointers/{uid}` and a live subscription to peers.
 * Optional `dragging_step_id` + `reorder_preview` (comma-separated ids) broadcast live reorder.
 */
export function useWorkflowPresencePointers(
  workflowId: string | undefined,
  enabled: boolean,
  user: User | null | undefined,
) {
  const [peers, setPeers] = useState<PresencePeer[]>([]);
  const pendingRef = useRef<CanvasPointerReport | null>(null);
  const lastKnownRef = useRef<Partial<CanvasPointerReport> & { x: number; y: number }>({
    x: 0.5,
    y: 0.5,
  });
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reorderPresenceRef = useRef<ReorderPresenceState>({
    draggingStepId: null,
    orderedStepIds: null,
  });
  const reorderWriteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastReorderWriteAtRef = useRef(0);

  const writeFullPresence = useCallback(
    (report: CanvasPointerReport | (Partial<CanvasPointerReport> & { x: number; y: number })) => {
      const u = user;
      if (!u?.uid || !workflowId || !db) return;
      const display_name = u.displayName?.trim() || u.email?.split("@")[0] || "Editor";
      const photo_url = u.photoURL?.trim() || null;
      lastKnownRef.current = { ...lastKnownRef.current, ...report };
      const m = lastKnownRef.current;

      const r = reorderPresenceRef.current;
      const reorderPayload: Record<string, unknown> = {};
      if (r.draggingStepId) {
        reorderPayload.dragging_step_id = r.draggingStepId;
        if (r.orderedStepIds && r.orderedStepIds.length > 0) {
          reorderPayload.reorder_preview = r.orderedStepIds.join(",");
        } else {
          reorderPayload.reorder_preview = deleteField();
        }
      } else {
        reorderPayload.dragging_step_id = deleteField();
        reorderPayload.reorder_preview = deleteField();
      }

      const base: Record<string, unknown> = {
        uid: u.uid,
        x: m.x,
        y: m.y,
        updatedAt: Date.now(),
        display_name,
        ...(photo_url ? { photo_url } : {}),
        ...reorderPayload,
      };
      if (typeof m.flowX === "number" && typeof m.flowY === "number") {
        base.flow_x = m.flowX;
        base.flow_y = m.flowY;
      }

      void setDoc(doc(db, "workflows", workflowId, "presencePointers", u.uid), base, {
        merge: true,
      });
    },
    [workflowId, user],
  );

  const scheduleReorderWrite = useCallback(() => {
    const report = pendingRef.current ?? (lastKnownRef.current as CanvasPointerReport);
    if (typeof report.flowX !== "number" || typeof report.flowY !== "number") return;
    const now = Date.now();
    if (now - lastReorderWriteAtRef.current >= REORDER_WRITE_MS) {
      lastReorderWriteAtRef.current = now;
      writeFullPresence(report);
      return;
    }
    if (reorderWriteTimerRef.current) return;
    reorderWriteTimerRef.current = setTimeout(() => {
      reorderWriteTimerRef.current = null;
      lastReorderWriteAtRef.current = Date.now();
      const r = pendingRef.current ?? (lastKnownRef.current as CanvasPointerReport);
      if (typeof r.flowX === "number" && typeof r.flowY === "number") {
        writeFullPresence(r);
      }
    }, REORDER_WRITE_MS);
  }, [writeFullPresence]);

  useEffect(() => {
    if (!workflowId || !db || !enabled || !user?.uid) {
      setPeers([]);
      return;
    }
    const myUid = user.uid;
    const col = collection(db, "workflows", workflowId, "presencePointers");
    const unsub = onSnapshot(
      col,
      (snap) => {
        const now = Date.now();
        const list: PresencePeer[] = [];
        for (const d of snap.docs) {
          const data = d.data() as {
            uid?: string;
            x?: number;
            y?: number;
            flow_x?: number;
            flow_y?: number;
            updatedAt?: number;
            display_name?: string;
            photo_url?: string | null;
            dragging_step_id?: string;
            reorder_preview?: string;
          };
          if (data.uid === myUid) continue;
          if (typeof data.updatedAt !== "number" || now - data.updatedAt > STALE_MS) continue;
          if (typeof data.x !== "number" || typeof data.y !== "number") continue;
          if (typeof data.flow_x !== "number" || typeof data.flow_y !== "number") continue;
          const dragging =
            typeof data.dragging_step_id === "string" && data.dragging_step_id.length > 0
              ? data.dragging_step_id
              : undefined;
          const reorderPreviewIds =
            typeof data.reorder_preview === "string" && data.reorder_preview.length > 0
              ? data.reorder_preview
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
              : undefined;
          list.push({
            uid: data.uid ?? d.id,
            x: Math.min(1, Math.max(0, data.x)),
            y: Math.min(1, Math.max(0, data.y)),
            flowX: data.flow_x,
            flowY: data.flow_y,
            displayName: (data.display_name as string)?.trim() || "Collaborator",
            photoURL: typeof data.photo_url === "string" ? data.photo_url : undefined,
            ...(dragging ? { draggingStepId: dragging } : {}),
            ...(reorderPreviewIds && reorderPreviewIds.length > 0 ? { reorderPreviewIds } : {}),
          });
        }
        setPeers(list);
      },
      (err) => {
        console.warn("[presence-pointers] snapshot error:", workflowId, err);
      },
    );
    return () => {
      unsub();
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      if (reorderWriteTimerRef.current) {
        clearTimeout(reorderWriteTimerRef.current);
        reorderWriteTimerRef.current = null;
      }
      void deleteDoc(doc(db, "workflows", workflowId, "presencePointers", myUid)).catch(() => {});
    };
  }, [workflowId, enabled, user?.uid]);

  /** Keep `updatedAt` fresh so other editors see you on the workflow until you leave. */
  useEffect(() => {
    if (!workflowId || !db || !enabled || !user?.uid) return;

    const pulse = () => {
      const n = pendingRef.current ?? (lastKnownRef.current as CanvasPointerReport);
      if (typeof n.flowX !== "number" || typeof n.flowY !== "number") return;
      writeFullPresence(n);
    };

    pulse();
    const hb = setInterval(pulse, HEARTBEAT_MS);
    return () => clearInterval(hb);
  }, [workflowId, enabled, user?.uid, writeFullPresence]);

  const reportCanvasPosition = useCallback(
    (report: CanvasPointerReport) => {
      if (!workflowId || !db || !enabled || !user?.uid) return;
      pendingRef.current = {
        x: Math.min(1, Math.max(0, report.x)),
        y: Math.min(1, Math.max(0, report.y)),
        flowX: report.flowX,
        flowY: report.flowY,
      };
      if (flushTimerRef.current) return;
      flushTimerRef.current = setTimeout(() => {
        flushTimerRef.current = null;
        const n = pendingRef.current;
        if (!n || !workflowId || !db || !user?.uid) return;
        lastKnownRef.current = n;
        writeFullPresence(n);
      }, THROTTLE_MS);
    },
    [workflowId, enabled, user?.uid, writeFullPresence],
  );

  const reportReorderPresence = useCallback(
    (state: ReorderPresenceState) => {
      if (!workflowId || !db || !enabled || !user?.uid) return;
      reorderPresenceRef.current = state;
      if (reorderWriteTimerRef.current) {
        clearTimeout(reorderWriteTimerRef.current);
        reorderWriteTimerRef.current = null;
      }
      const n = pendingRef.current ?? (lastKnownRef.current as CanvasPointerReport);
      if (state.draggingStepId === null && state.orderedStepIds === null) {
        lastReorderWriteAtRef.current = Date.now();
        if (typeof n.flowX === "number" && typeof n.flowY === "number") {
          writeFullPresence(n);
        }
        return;
      }
      scheduleReorderWrite();
    },
    [workflowId, enabled, user?.uid, writeFullPresence, scheduleReorderWrite],
  );

  return { presencePeers: peers, reportCanvasPosition, reportReorderPresence };
}
