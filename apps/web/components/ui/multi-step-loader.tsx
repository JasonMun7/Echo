"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "motion/react";
import { useState, useEffect } from "react";

const CheckIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    className={cn("w-6 h-6", className)}
  >
    <path d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
  </svg>
);

const CheckFilled = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className={cn("w-6 h-6", className)}
  >
    <path
      fillRule="evenodd"
      d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z"
      clipRule="evenodd"
    />
  </svg>
);

export type LoadingState = {
  text: string;
};

const LoaderCore = ({
  loadingStates,
  value = 0,
}: {
  loadingStates: LoadingState[];
  value?: number;
}) => (
  <div className="relative mx-auto mt-40 flex max-w-xl flex-col justify-start">
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
            {isDone && <CheckFilled className="text-[#A577FF]" />}
            {isActive && (
              <div className="relative flex items-center justify-center">
                <CheckFilled className="text-[#A577FF]" />
                <span className="absolute inset-0 animate-ping rounded-full bg-[#A577FF]/30" />
              </div>
            )}
            {index > value && <CheckIcon className="text-[#150A35]/30" />}
          </div>
          <span
            className={cn(
              "text-base font-medium transition-colors",
              isActive && "text-[#150A35]",
              isDone && "text-[#A577FF]",
              !isActive && !isDone && "text-[#150A35]/30"
            )}
          >
            {loadingState.text}
          </span>
        </motion.div>
      );
    })}
  </div>
);

export const MultiStepLoader = ({
  loadingStates,
  loading,
  duration = 2000,
  loop = true,
  title = "Echo is working",
  value: controlledValue,
}: {
  loadingStates: LoadingState[];
  loading?: boolean;
  duration?: number;
  loop?: boolean;
  /** Header label (design system: Lavender accent). Default "Echo is working". */
  title?: string;
  /** When set, controls current step (0-based). Overrides internal timer. */
  value?: number;
}) => {
  const [internalState, setInternalState] = useState(0);

  useEffect(() => {
    if (controlledValue !== undefined) return;
    if (!loading) {
      setTimeout(() => setInternalState(0), 0);
      return;
    }
    const timeout = setTimeout(() => {
      setInternalState((prevState) =>
        loop
          ? prevState === loadingStates.length - 1
            ? 0
            : prevState + 1
          : Math.min(prevState + 1, loadingStates.length - 1)
      );
    }, duration);

    return () => clearTimeout(timeout);
  }, [controlledValue, internalState, loading, loop, loadingStates.length, duration]);

  const currentState =
    controlledValue !== undefined ? controlledValue : internalState;

  return (
    <AnimatePresence mode="wait">
      {loading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-100 flex h-full w-full flex-col items-center justify-center bg-[#F5F7FC]/90 backdrop-blur-xl"
        >
          {/* Branded header — DESIGN_SYSTEM: Ghost White surface, Lavender/Cyan, Echo logo */}
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="echo-card mb-2 flex flex-col items-center gap-3 rounded-2xl border border-[#A577FF]/20 px-6 py-4 shadow-sm"
          >
            <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-lg">
              <Image
                src="/echo_logo.png"
                alt="Echo"
                fill
                className="object-contain p-2"
                priority
              />
            </div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[#A577FF]">
              {title}
            </p>
          </motion.div>

          <div className="relative h-72 overflow-hidden">
            <LoaderCore value={currentState} loadingStates={loadingStates} />
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-linear-to-t from-[#F5F7FC] to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-linear-to-b from-[#F5F7FC] to-transparent" />
        </motion.div>
      )}
    </AnimatePresence>
  );
};
