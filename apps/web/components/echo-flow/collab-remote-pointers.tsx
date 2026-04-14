"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";

/**
 * §7c — Remote pointer when another editor has an active Firestore step lock
 * (see `useStepEditLock`). Shown only while that peer is actively editing a step.
 */
export function EchoFlowRemotePointersOverlay({
  visible,
  label = "Collaborator",
}: {
  visible: boolean;
  label?: string;
}) {
  const [pos, setPos] = useState({ x: 38, y: 28 });

  useEffect(() => {
    if (!visible) return;
    const id = window.setInterval(() => {
      const t = Date.now() / 1000;
      setPos({
        x: 42 + Math.sin(t * 1.1) * 8,
        y: 30 + Math.cos(t * 0.9) * 6,
      });
    }, 48);
    return () => clearInterval(id);
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="pointer-events-none relative h-full w-full overflow-hidden">
      <motion.div
        className="absolute flex flex-col items-start gap-0.5"
        style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <svg
          className="-mb-1 h-6 w-6 -translate-x-1 text-[#A577FF] drop-shadow"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden
        >
          <path d="M14.082 2.182a.5.5 0 0 1 .103.557L8.528 15.467a.5.5 0 0 1-.917-.007L5.57 10.694.803 8.652a.5.5 0 0 1-.006-.916l12.728-5.657a.5.5 0 0 1 .556.103z" />
        </svg>
        <span className="max-w-[140px] truncate rounded-full bg-[#A577FF] px-2 py-0.5 text-[10px] font-medium text-white shadow-md">
          {label}
        </span>
      </motion.div>
    </div>
  );
}
