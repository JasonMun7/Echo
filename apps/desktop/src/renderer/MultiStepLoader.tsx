import type { ReactNode } from "react";
import { IconTrash } from "@tabler/icons-react";
import { AnimatePresence, motion } from "motion/react";
import echoLogo from "./assets/echo_logo.png";
import GradientText from "./reactbits/GradientText";

export type LoadingState = { text: string };

const CheckIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    className={className}
    style={{ width: 24, height: 24 }}
  >
    <path d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
  </svg>
);

const CheckFilled = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    style={{ width: 24, height: 24 }}
  >
    <path
      fillRule="evenodd"
      d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z"
      clipRule="evenodd"
    />
  </svg>
);

function LoaderCore({
  loadingStates,
  value = 0,
}: {
  loadingStates: LoadingState[];
  value?: number;
}) {
  return (
    <div
      className="relative mx-auto mt-40 flex max-w-xl flex-col justify-start"
      style={{ maxWidth: "36rem" }}
    >
      {loadingStates.map((loadingState, index) => {
        const distance = Math.abs(index - value);
        const opacity = Math.max(1 - distance * 0.2, 0);
        const isActive = value === index;
        const isDone = index < value;

        return (
          <motion.div
            key={index}
            className="mb-5 flex items-center gap-3 text-left"
            initial={{ opacity: 0, y: -(value * 44) }}
            animate={{ opacity, y: -(value * 44) }}
            transition={{ duration: 0.5 }}
          >
            <div className="shrink-0">
              {isDone && (
                <CheckFilled
                  className="text-(--echo-lavender)"
                  style={{ color: "var(--echo-lavender)" }}
                />
              )}
              {isActive && (
                <div className="relative flex items-center justify-center">
                  <CheckFilled
                    className="text-(--echo-lavender)"
                    style={{ color: "var(--echo-lavender)" }}
                  />
                  <span
                    className="absolute inset-0 animate-ping rounded-full opacity-30"
                    style={{ backgroundColor: "var(--echo-lavender)" }}
                  />
                </div>
              )}
              {index > value && (
                <CheckIcon
                  className="opacity-30"
                  style={{ color: "var(--echo-text)" }}
                />
              )}
            </div>
            <span
              className="text-base font-medium transition-colors"
              style={{
                color: isActive
                  ? "var(--echo-text)"
                  : isDone
                    ? "var(--echo-lavender)"
                    : "var(--echo-text-secondary)",
                opacity: isActive || isDone ? 1 : 0.5,
              }}
            >
              {loadingState.text}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}

export function MultiStepLoader({
  loadingStates,
  loading,
  value,
  title = "Echo is working",
  onCancel,
}: {
  loadingStates: LoadingState[];
  loading: boolean;
  /** When set, controls current step (0-based). */
  value?: number;
  /** Title label; can be string or ReactNode (e.g. GradientText). */
  title?: ReactNode;
  /** When set, shows a Cancel button that calls this. */
  onCancel?: () => void;
}) {
  const currentState = value ?? 0;

  return (
    <AnimatePresence mode="wait">
      {loading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-100 flex h-full w-full flex-col items-center justify-center backdrop-blur-xl"
        >
          <div
            className="absolute inset-0"
            style={{
              background: "var(--echo-bg)",
              opacity: 0.96,
            }}
            aria-hidden
          />
          {/* Branded header — DESIGN_SYSTEM: Echo logo, glass card, gradient title */}
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="echo-card relative z-10 mb-2 flex flex-col items-center gap-3 rounded-2xl border px-6 py-4 shadow-sm"
            style={{
              borderColor: "rgba(165, 119, 255, 0.2)",
              background: "var(--echo-surface)",
            }}
          >
            <div
              className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-lg"
              style={{
                boxShadow: "0 10px 40px rgba(0,0,0,0.12), 0 4px 12px rgba(165,119,255,0.15)",
              }}
            >
              <img
                src={echoLogo}
                alt="Echo"
                className="object-contain p-2"
                style={{ width: "100%", height: "100%" }}
              />
            </div>
            <div className="text-xs font-semibold uppercase tracking-widest">
              {typeof title === "string" ? (
                <GradientText
                  colors={["#A577FF", "#7C3AED", "#21C4DD", "#A577FF"]}
                  className="text-[0.7rem] font-semibold uppercase tracking-widest"
                >
                  {title}
                </GradientText>
              ) : (
                title
              )}
            </div>
          </motion.div>

          <div className="relative z-10 h-72 overflow-hidden">
            <LoaderCore value={currentState} loadingStates={loadingStates} />
          </div>

          {onCancel && (
            <div className="relative z-10 mt-4">
              <button
                type="button"
                onClick={onCancel}
                className="echo-btn-danger flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors hover:opacity-90"
              >
                <IconTrash size={18} />
                Cancel
              </button>
            </div>
          )}

          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-48"
            style={{
              background: "linear-gradient(to top, var(--echo-bg), transparent)",
            }}
          />
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-24"
            style={{
              background:
                "linear-gradient(to bottom, var(--echo-bg), transparent)",
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
