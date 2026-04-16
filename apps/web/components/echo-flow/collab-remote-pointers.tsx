"use client";

import type { RefObject } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { useReactFlow, useStore } from "@xyflow/react";

import type { PresencePeer } from "@/hooks/use-workflow-presence-pointers";
import { type PeerPresenceAccent, uidToPeerAccent } from "@/lib/peer-presence-color";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

function PeerCursorGlyph({ accent }: { accent: PeerPresenceAccent }) {
  return (
    <span
      className="-mb-1 inline-flex rounded-full p-[3px]"
      style={{ backgroundColor: accent.pillBg }}
    >
      <svg
        className="h-5 w-5 -translate-x-px -scale-x-100"
        style={{ color: accent.stroke }}
        viewBox="0 0 16 16"
        fill="currentColor"
        aria-hidden
      >
        <path d="M14.082 2.182a.5.5 0 0 1 .103.557L8.528 15.467a.5.5 0 0 1-.917-.007L5.57 10.694.803 8.652a.5.5 0 0 1-.006-.916l12.728-5.657a.5.5 0 0 1 .556.103z" />
      </svg>
    </span>
  );
}

function PeerPointerBubble({
  displayName,
  photoURL,
  accentUid,
}: {
  displayName: string;
  photoURL?: string | null;
  accentUid: string;
}) {
  const accent = uidToPeerAccent(accentUid);
  const initials = displayName
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="ml-3 flex max-w-[200px] flex-col items-start gap-1">
      <div
        className="flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2 shadow-md ring-1 ring-black/8"
        style={{
          backgroundColor: accent.pillBg,
          borderColor: accent.softRing,
        }}
      >
        <Avatar
          className="size-6 shrink-0 border-2 shadow-sm"
          style={{ borderColor: accent.stroke }}
          title={displayName}
        >
          {photoURL ? <AvatarImage src={photoURL} alt="" /> : null}
          <AvatarFallback
            className="text-[9px] font-semibold text-white"
            style={{ backgroundColor: accent.fill }}
          >
            {initials || "?"}
          </AvatarFallback>
        </Avatar>
        <span
          className="min-w-0 truncate text-[10px] font-medium text-[#150A35] dark:text-foreground"
          title={displayName}
        >
          {displayName}
        </span>
      </div>
    </div>
  );
}

type PlacedPeer = PresencePeer & {
  left: number;
  top: number;
  visible: boolean;
};

function usePlacedPresencePeers(
  peers: PresencePeer[],
  containerRef: RefObject<HTMLDivElement | null>,
): PlacedPeer[] {
  const { flowToScreenPosition, screenToFlowPosition } = useReactFlow();

  /**
   * Pan/zoom and measured width/height (ResizeObserver inside React Flow). When any of these
   * change, `layoutSig` updates so the layout effect recomputes screen positions for each client.
   */
  const layoutSig = useStore((s) => {
    const t = s.transform;
    const tr = Array.isArray(t) ? t.join(",") : String(t);
    return `${s.width}x${s.height}x${tr}`;
  });
  const [placed, setPlaced] = useState<PlacedPeer[]>([]);

  useLayoutEffect(() => {
    if (peers.length === 0) {
      setPlaced([]);
      return;
    }
    const root = containerRef.current;
    if (!root) return;
    const host = root.closest(".echo-flow-canvas-host");
    const rfEl = host?.querySelector(".react-flow") as HTMLElement | null;
    if (!rfEl) return;

    const olR = root.getBoundingClientRect();
    const rfR = rfEl.getBoundingClientRect();

    /** Visible graph in flow space — corners use the same client coords RF expects. */
    const tl = screenToFlowPosition({ x: rfR.left, y: rfR.top });
    const tr = screenToFlowPosition({ x: rfR.right, y: rfR.top });
    const bl = screenToFlowPosition({ x: rfR.left, y: rfR.bottom });
    const br = screenToFlowPosition({ x: rfR.right, y: rfR.bottom });
    const minFX = Math.min(tl.x, tr.x, bl.x, br.x);
    const maxFX = Math.max(tl.x, tr.x, bl.x, br.x);
    const minFY = Math.min(tl.y, tr.y, bl.y, br.y);
    const maxFY = Math.max(tl.y, tr.y, br.y, bl.y);

    const next: PlacedPeer[] = peers.map((p) => {
      const inView = p.flowX >= minFX && p.flowX <= maxFX && p.flowY >= minFY && p.flowY <= maxFY;
      /**
       * `flowToScreenPosition` returns **viewport/client** coordinates (see @xyflow: adds
       * `.react-flow` getBoundingClientRect to the transformed point). Position inside the
       * overlay with `client − overlayRect`, not `+ (rf − overlay)` — that double-counted.
       */
      const client = flowToScreenPosition({ x: p.flowX, y: p.flowY });
      return {
        ...p,
        left: client.x - olR.left,
        top: client.y - olR.top,
        visible: inView,
      };
    });
    setPlaced(next);
  }, [peers, flowToScreenPosition, screenToFlowPosition, layoutSig]);

  return placed;
}

/**
 * Remote pointers: Firestore-backed **flow** positions (graph coords). Each viewer only sees peers
 * whose pointer falls inside **their** current pan/zoom viewport.
 */
export function EchoFlowRemotePointersOverlay({
  lockLabel,
  showLockOnlyPointer,
  presencePeers = [],
  lockAccentUid,
  lockPhotoUrl,
}: {
  lockLabel?: string | null;
  showLockOnlyPointer: boolean;
  presencePeers?: PresencePeer[];
  lockAccentUid?: string | null;
  lockPhotoUrl?: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const placed = usePlacedPresencePeers(presencePeers, containerRef);

  if (presencePeers.length > 0) {
    return (
      <div ref={containerRef} className="relative h-full w-full overflow-hidden">
        {placed.map((p) => {
          if (!p.visible) return null;
          const accent = uidToPeerAccent(p.uid);
          return (
            <motion.div
              key={p.uid}
              className="absolute flex flex-col items-start gap-0 will-change-transform"
              style={{ left: p.left, top: p.top }}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 420, damping: 28 }}
            >
              <PeerCursorGlyph accent={accent} />
              <PeerPointerBubble
                displayName={p.displayName}
                photoURL={p.photoURL}
                accentUid={p.uid}
              />
            </motion.div>
          );
        })}
      </div>
    );
  }

  if (!showLockOnlyPointer || !lockLabel) return null;

  const fbUid = lockAccentUid ?? "peer";
  const accent = uidToPeerAccent(fbUid);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      <motion.div
        className="absolute flex flex-col items-start gap-0"
        style={{ left: "42%", top: "32%" }}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <PeerCursorGlyph accent={accent} />
        <PeerPointerBubble displayName={lockLabel} photoURL={lockPhotoUrl} accentUid={fbUid} />
      </motion.div>
    </div>
  );
}
