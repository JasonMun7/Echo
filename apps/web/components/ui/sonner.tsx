"use client";

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * Echo Design System toast styling:
 * - Success: #22c55e (echo-success)
 * - Error: #ef4444 (echo-error)
 * - Ghost White surface, Lavender borders, Cetacean text
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="bottom-right"
      icons={{
        success: <CircleCheckIcon className="size-4 text-echo-success" />,
        info: <InfoIcon className="size-4 text-echo-cyan" />,
        warning: <TriangleAlertIcon className="size-4 text-amber-500" />,
        error: <OctagonXIcon className="size-4 text-echo-error" />,
        loading: <Loader2Icon className="size-4 animate-spin text-echo-lavender" />,
      }}
      toastOptions={{
        style: {
          border: "1px solid rgba(165, 119, 255, 0.2)",
          borderRadius: "var(--radius-echo-lg, 0.75rem)",
          background: "var(--color-echo-ghost, #F5F7FC)",
          color: "var(--color-echo-text, #150A35)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
        },
      }}
      style={
        {
          "--normal-bg": "var(--color-echo-ghost, #F5F7FC)",
          "--normal-text": "var(--color-echo-text, #150A35)",
          "--normal-border": "rgba(165, 119, 255, 0.2)",
          "--success-bg": "rgba(34, 197, 94, 0.12)",
          "--success-text": "var(--color-echo-text, #150A35)",
          "--success-border": "rgba(34, 197, 94, 0.4)",
          "--error-bg": "rgba(239, 68, 68, 0.12)",
          "--error-text": "var(--color-echo-text, #150A35)",
          "--error-border": "rgba(239, 68, 68, 0.4)",
          "--warning-bg": "rgba(245, 158, 11, 0.12)",
          "--warning-text": "var(--color-echo-text, #150A35)",
          "--warning-border": "rgba(245, 158, 11, 0.4)",
          "--info-bg": "rgba(33, 196, 221, 0.12)",
          "--info-text": "var(--color-echo-text, #150A35)",
          "--info-border": "rgba(33, 196, 221, 0.4)",
          "--border-radius": "var(--radius-echo-lg, 0.75rem)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
