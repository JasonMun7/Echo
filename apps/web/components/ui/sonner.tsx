"use client";

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * Echo toasts: white surface, black copy; only the leading icon carries semantic color
 * (success / info / warning / error / loading). `richColors` stays off so the bar isn’t tinted.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      position="bottom-right"
      icons={{
        success: (
          <CircleCheckIcon className="size-4 text-echo-success" strokeWidth={2} aria-hidden />
        ),
        info: <InfoIcon className="size-4 text-echo-cyan" strokeWidth={2} aria-hidden />,
        warning: (
          <TriangleAlertIcon className="size-4 text-amber-500" strokeWidth={2} aria-hidden />
        ),
        error: <OctagonXIcon className="size-4 text-echo-error" strokeWidth={2} aria-hidden />,
        loading: <Loader2Icon className="size-4 animate-spin text-echo-lavender" aria-hidden />,
      }}
      toastOptions={{
        classNames: {
          toast:
            "!border !border-neutral-200/90 !bg-white !text-black shadow-[0_4px_24px_rgba(0,0,0,0.08)]",
          title: "!text-black !font-medium",
          description: "!text-black !opacity-100",
        },
      }}
      style={
        {
          "--border-radius": "var(--radius-echo-lg, 0.75rem)",
          "--normal-bg": "#ffffff",
          "--normal-border": "rgba(0, 0, 0, 0.1)",
          "--normal-text": "#000000",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
