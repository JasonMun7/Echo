import {
  IconCircleCheck,
  IconAlertCircle,
  IconAlertTriangle,
  IconInfoCircle,
  IconRefresh,
  IconTrash,
} from "@tabler/icons-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

type Theme = "light" | "dark" | "system";

/**
 * Echo Design System toasts: success/error/warning/info use Echo tokens.
 * Use with toast.success(), toast.error(), etc. from "sonner".
 */
const Toaster = ({
  theme = "dark",
  ...props
}: Omit<ToasterProps, "theme"> & { theme?: Theme }) => {
  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="bottom-right"
      icons={{
        success: <IconCircleCheck size={18} style={{ color: "var(--echo-success)" }} />,
        error: <IconAlertCircle size={18} style={{ color: "var(--echo-error)" }} />,
        warning: <IconAlertTriangle size={18} style={{ color: "#f59e0b" }} />,
        info: <IconInfoCircle size={18} style={{ color: "var(--echo-cyan)" }} />,
        loading: (
          <IconRefresh
            size={18}
            className="animate-spin"
            style={{ color: "var(--echo-lavender)" }}
          />
        ),
        default: <IconInfoCircle size={18} style={{ color: "var(--echo-cyan)" }} />,
      }}
      toastOptions={{
        style: {
          border: "1px solid var(--echo-border)",
          borderRadius: "0.75rem",
          background: "var(--echo-surface-solid)",
          color: "var(--echo-text)",
          boxShadow: "var(--echo-card-shadow)",
        },
      }}
      style={
        {
          "--normal-bg": "var(--echo-surface-solid)",
          "--normal-text": "var(--echo-text)",
          "--normal-border": "var(--echo-border)",
          "--success-bg": "rgba(34, 197, 94, 0.15)",
          "--success-text": "var(--echo-text)",
          "--success-border": "rgba(34, 197, 94, 0.4)",
          "--error-bg": "rgba(239, 68, 68, 0.15)",
          "--error-text": "var(--echo-text)",
          "--error-border": "rgba(239, 68, 68, 0.4)",
          "--warning-bg": "rgba(245, 158, 11, 0.15)",
          "--warning-text": "var(--echo-text)",
          "--warning-border": "rgba(245, 158, 11, 0.4)",
          "--info-bg": "rgba(33, 196, 221, 0.15)",
          "--info-text": "var(--echo-text)",
          "--info-border": "rgba(33, 196, 221, 0.4)",
          "--border-radius": "0.75rem",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
