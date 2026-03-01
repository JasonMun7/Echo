"use client";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "motion/react";
import { useState, useEffect } from "react";

const CheckIcon = ({ className }: { className?: string }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={cn("w-6 h-6 ", className)}
    >
      <path d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
};

const CheckFilled = ({ className }: { className?: string }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={cn("w-6 h-6 ", className)}
    >
      <path
        fillRule="evenodd"
        d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z"
        clipRule="evenodd"
      />
    </svg>
  );
};

type LoadingState = {
  text: string;
};

const LoaderCore = ({
  loadingStates,
  value = 0,
}: {
  loadingStates: LoadingState[];
  value?: number;
}) => {
  return (
    <div className="flex relative justify-start max-w-xl mx-auto flex-col mt-40">
      {loadingStates.map((loadingState, index) => {
        const distance = Math.abs(index - value);
        const opacity = Math.max(1 - distance * 0.2, 0);
        const isActive = value === index;
        const isDone = index < value;

        return (
          <motion.div
            key={index}
            className={cn("text-left flex gap-3 mb-5 items-center")}
            initial={{ opacity: 0, y: -(value * 44) }}
            animate={{ opacity: opacity, y: -(value * 44) }}
            transition={{ duration: 0.5 }}
          >
            <div className="shrink-0">
              {isDone && (
                <CheckFilled className="text-[#A577FF]" />
              )}
              {isActive && (
                <div className="relative flex items-center justify-center">
                  <CheckFilled className="text-[#A577FF]" />
                  <span className="absolute inset-0 rounded-full animate-ping bg-[#A577FF]/30" />
                </div>
              )}
              {index > value && (
                <CheckIcon className="text-[#150A35]/30" />
              )}
            </div>
            <span
              className={cn(
                "text-base font-medium transition-colors",
                isActive
                  ? "text-[#150A35]"
                  : isDone
                  ? "text-[#A577FF]"
                  : "text-[#150A35]/30"
              )}
            >
              {loadingState.text}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
};

export const MultiStepLoader = ({
  loadingStates,
  loading,
  duration = 2000,
  loop = true,
}: {
  loadingStates: LoadingState[];
  loading?: boolean;
  duration?: number;
  loop?: boolean;
}) => {
  const [currentState, setCurrentState] = useState(0);

  useEffect(() => {
    if (!loading) {
      setTimeout(() => setCurrentState(0), 0);
      return;
    }
    const timeout = setTimeout(() => {
      setCurrentState((prevState) =>
        loop
          ? prevState === loadingStates.length - 1
            ? 0
            : prevState + 1
          : Math.min(prevState + 1, loadingStates.length - 1)
      );
    }, duration);

    return () => clearTimeout(timeout);
  }, [currentState, loading, loop, loadingStates.length, duration]);

  return (
    <AnimatePresence mode="wait">
      {loading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="w-full h-full fixed inset-0 z-100 flex flex-col items-center justify-center bg-[#F5F7FC]/90 backdrop-blur-2xl"
        >
          {/* Branded header */}
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-2 flex flex-col items-center gap-2"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-linear-to-br from-[#A577FF] to-[#150A35] shadow-lg">
              <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8 text-white">
                <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                <path d="M2 17l10 5 10-5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                <path d="M2 12l10 5 10-5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
              </svg>
            </div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[#A577FF]">
              EchoPrism is analyzing
            </p>
          </motion.div>

          {/* Steps */}
          <div className="h-72 relative overflow-hidden">
            <LoaderCore value={currentState} loadingStates={loadingStates} />
          </div>

          {/* Fade mask */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-linear-to-t from-[#F5F7FC] to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-linear-to-b from-[#F5F7FC] to-transparent" />
        </motion.div>
      )}
    </AnimatePresence>
  );
};
