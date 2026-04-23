"use client";

import { IconX } from "@tabler/icons-react";
import { Expand, Pencil } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { brandfetchLogoUrlForDomain } from "@/app/dashboard/integrations/_lib/brandfetch-logo";
import { GradientIconWell, gradientWellImageClass } from "@/components/ui/gradient-icon-well";
import { WorkflowActionIcon } from "@/lib/workflow-action-icons";

export type EchoNodeInspectorRenameProps = {
  stepNumber: number;
  /** Raw `params.display_label` (empty if using default). */
  customLabel: string;
  /** Resolved card label (`echoStepCardLabel`). */
  displayLabel: string;
  /** Shown as input placeholder when custom is empty. */
  defaultActionLabel: string;
  onSaveLabel: (trimmed: string) => void;
  readOnly: boolean;
};

export type EchoNodeInspectorHeaderStep = {
  action: string;
  composioSlug?: string | null;
  brandDomain?: string | null;
};

type EchoNodeInspectorProps = {
  open: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onClose: () => void;
  /** Fallback title when `rename` is not passed. */
  title: string;
  /** Inline header rename (double-click title or pencil). */
  rename?: EchoNodeInspectorRenameProps;
  /** Step identity for header gradient icon (matches canvas nodes). */
  headerStep?: EchoNodeInspectorHeaderStep;
  /**
   * When true, the docked (non-expanded) panel is positioned in a relative parent (e.g. the
   * canvas host) with no full-screen backdrop — clicks on the canvas are not blocked and do not
   * dismiss the panel via overlay. Expanded mode still uses a modal backdrop.
   */
  embedDock?: boolean;
  children: ReactNode;
};

function InspectorHeaderIconWell({
  action,
  composioSlug,
  brandDomain,
}: EchoNodeInspectorHeaderStep) {
  const [logoFailed, setLogoFailed] = useState(false);
  const isOpenApp = action === "open_app" || action === "focus_app";
  const domain = brandDomain?.trim() || null;
  const logoUrl = isOpenApp && domain ? brandfetchLogoUrlForDomain(domain) : null;

  useEffect(() => {
    queueMicrotask(() => setLogoFailed(false));
  }, [domain]);

  return (
    <GradientIconWell corners="lg" className="h-8 w-8 shrink-0" innerClassName="overflow-hidden">
      {logoUrl && !logoFailed ? (
        // eslint-disable-next-line @next/next/no-img-element -- Brandfetch Logo API hotlink
        <img
          src={logoUrl}
          alt=""
          width={32}
          height={32}
          className={gradientWellImageClass("lg")}
          onError={() => setLogoFailed(true)}
        />
      ) : (
        <WorkflowActionIcon
          action={action}
          composioSlug={composioSlug}
          className="h-5 w-5 text-card-foreground"
        />
      )}
    </GradientIconWell>
  );
}

export function EchoNodeInspector({
  open,
  expanded,
  onToggleExpand,
  onClose,
  title,
  rename,
  headerStep,
  embedDock = false,
  children,
}: EchoNodeInspectorProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    // Reset inline rename when navigating to another step.
    queueMicrotask(() => setEditingTitle(false));
  }, [rename?.stepNumber]);

  const startEdit = () => {
    if (!rename || rename.readOnly) return;
    setDraft(rename.customLabel);
    setEditingTitle(true);
  };

  const saveEdit = () => {
    if (!rename) return;
    const trimmed = draft.trim();
    const prev = (rename.customLabel || "").trim();
    if (trimmed !== prev) {
      rename.onSaveLabel(trimmed);
    }
    setEditingTitle(false);
  };

  const cancelEdit = () => {
    if (!rename) return;
    setDraft(rename.customLabel);
    setEditingTitle(false);
  };

  const titleBlock =
    rename && !rename.readOnly ? (
      <div className="flex min-w-0 flex-1 items-center gap-1.5 pr-2">
        {editingTitle ? (
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            <span className="shrink-0 text-sm font-semibold text-foreground/85">
              Step {rename.stepNumber}
              <span className="font-semibold text-foreground/55"> — </span>
            </span>
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => saveEdit()}
              placeholder={rename.defaultActionLabel}
              className="min-w-[8rem] flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm font-semibold text-foreground outline-none focus:ring-2 focus:ring-ring/35"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  (e.target as HTMLInputElement).blur();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  cancelEdit();
                }
              }}
              autoFocus
            />
          </div>
        ) : (
          <>
            <button
              type="button"
              className="min-w-0 flex-1 cursor-default truncate text-left text-sm font-semibold text-foreground hover:cursor-text"
              title="Double-click to rename"
              onDoubleClick={(e) => {
                e.preventDefault();
                startEdit();
              }}
            >
              <span className="text-[#150A35]/80">Step {rename.stepNumber} — </span>
              <span>{rename.displayLabel}</span>
            </button>
            <button
              type="button"
              className="shrink-0 rounded-md p-1 text-foreground/55 hover:bg-muted hover:text-foreground"
              aria-label="Rename step"
              title="Rename"
              onClick={(e) => {
                e.stopPropagation();
                startEdit();
              }}
            >
              <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            </button>
          </>
        )}
      </div>
    ) : rename?.readOnly ? (
      <h3 className="min-w-0 flex-1 truncate pr-2 text-sm font-semibold text-foreground">
        <span className="text-foreground/80">Step {rename.stepNumber} — </span>
        {rename.displayLabel}
      </h3>
    ) : (
      <h3 className="min-w-0 flex-1 truncate pr-2 text-sm font-semibold text-foreground">
        {title}
      </h3>
    );

  const header = (
    <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {headerStep ? <InspectorHeaderIconWell {...headerStep} /> : null}
        {titleBlock}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={onToggleExpand}
          aria-expanded={expanded}
          aria-label={expanded ? "Dock inspector" : "Expand inspector"}
          title={expanded ? "Dock" : "Expand"}
        >
          <Expand className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
          onClick={onClose}
          aria-label="Close inspector"
        >
          <IconX className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  const body = <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>;

  const expandedBackdrop = (
    <motion.button
      type="button"
      aria-label="Collapse inspector"
      className="pointer-events-auto fixed inset-0 z-[45] bg-[#150A35]/20"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={() => onToggleExpand()}
    />
  );

  const expandedShell = (
    <motion.div
      layout
      className="pointer-events-auto fixed top-1/2 left-1/2 z-[46] flex h-[min(88vh,720px)] min-h-[480px] w-[calc(100%-1.5rem)] max-w-[calc(100%-1.5rem)] -translate-x-1/2 -translate-y-1/2 flex-col md:w-[50vw] md:max-w-[50vw]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ type: "spring", stiffness: 280, damping: 28 }}
    >
      <motion.div
        className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        initial={{ scale: 0.96 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 280, damping: 28 }}
      >
        {header}
        {body}
      </motion.div>
    </motion.div>
  );

  const legacyDockBackdrop = !embedDock ? (
    <motion.button
      type="button"
      aria-label="Dim canvas"
      className="pointer-events-auto fixed inset-0 z-[45] bg-[#150A35]/20"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={() => onClose()}
    />
  ) : null;

  const expandedInPortal =
    embedDock && typeof document !== "undefined"
      ? createPortal(
          <AnimatePresence>
            {open && expanded ? (
              <>
                {expandedBackdrop}
                {expandedShell}
              </>
            ) : null}
          </AnimatePresence>,
          document.body,
        )
      : null;

  return (
    <>
      {embedDock ? expandedInPortal : null}
      <AnimatePresence>
        {open ? (
          <>
            {!embedDock && expanded ? (
              <>
                {expandedBackdrop}
                {expandedShell}
              </>
            ) : null}
            {!embedDock && !expanded ? legacyDockBackdrop : null}
            {!expanded ? (
              <motion.div
                layout
                className={
                  embedDock
                    ? "pointer-events-auto absolute right-0 top-3 bottom-3 z-[35] flex w-full max-w-md flex-col overflow-hidden rounded-l-2xl rounded-tr-none border border-border bg-card shadow-2xl"
                    : "fixed bottom-0 right-0 top-16 z-[46] flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-2xl md:top-20 md:rounded-l-2xl md:rounded-tr-none"
                }
                initial={{ x: embedDock ? 40 : 320, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ type: "spring", stiffness: 280, damping: 28 }}
              >
                {header}
                {body}
              </motion.div>
            ) : null}
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}
