"use client";

import { IconX } from "@tabler/icons-react";
import { Expand } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import type { ReactNode } from "react";

type EchoNodeInspectorProps = {
  open: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onClose: () => void;
  title: string;
  children: ReactNode;
};

export function EchoNodeInspector({
  open,
  expanded,
  onToggleExpand,
  onClose,
  title,
  children,
}: EchoNodeInspectorProps) {
  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            aria-label={expanded ? "Collapse inspector" : "Dim canvas"}
            className="fixed inset-0 z-[45] bg-[#150A35]/20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => (expanded ? onToggleExpand() : onClose())}
          />
          <motion.div
            layout
            className={`fixed z-[46] flex max-h-[90vh] flex-col overflow-hidden border border-[#A577FF]/25 bg-[#F5F7FC] shadow-2xl ${
              expanded
                ? "left-1/2 top-1/2 w-[min(100vw-2rem,56rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl"
                : "bottom-0 right-0 top-16 w-full max-w-md rounded-t-2xl md:top-20 md:rounded-l-2xl md:rounded-tr-none"
            }`}
            initial={expanded ? { opacity: 0, scale: 0.96 } : { x: 320, opacity: 0 }}
            animate={expanded ? { opacity: 1, scale: 1 } : { x: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: "spring", stiffness: 280, damping: 28 }}
          >
            <div className="flex items-center justify-between border-b border-[#A577FF]/15 px-4 py-3">
              <h3 className="truncate pr-2 text-sm font-semibold text-[#150A35]">{title}</h3>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  className="rounded-lg p-2 text-[#150A35]/60 hover:bg-[#150A35]/5 hover:text-[#150A35]"
                  onClick={onToggleExpand}
                  aria-expanded={expanded}
                  aria-label={expanded ? "Dock inspector" : "Expand inspector"}
                  title={expanded ? "Dock" : "Expand"}
                >
                  <Expand className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  className="rounded-lg p-2 text-[#150A35]/60 hover:bg-[#150A35]/5"
                  onClick={onClose}
                  aria-label="Close inspector"
                >
                  <IconX className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
