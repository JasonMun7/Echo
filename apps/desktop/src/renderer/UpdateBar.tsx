import { useState, useEffect } from "react";
import { IconRefresh, IconDownload } from "@tabler/icons-react";

type Status = "idle" | "downloading" | "ready" | "failed";

/**
 * Render an update notification bar that reflects Electron update lifecycle events.
 *
 * Shows a downloading state (optional rounded progress percent), a ready state with an optional
 * version and actions to "Later" or "Restart now", and a failed state with a Dismiss action.
 * Subscribes to listeners on `window.electronAPI` for update availability, download progress,
 * downloaded completion, and errors, and removes those listeners on unmount.
 *
 * @returns The update bar element when an update is active and not dismissed, or `null` otherwise.
 */
export function UpdateBar() {
  const [status, setStatus] = useState<Status>("idle");
  const [version, setVersion] = useState<string | null>(null);
  const [downloadPercent, setDownloadPercent] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onUpdateAvailable || !api?.onUpdateDownloaded) return;

    const onAvailable = () => {
      setDownloadPercent(null);
      setStatus("downloading");
    };
    const onDownloaded = (arg: { version: string }) => {
      setVersion(arg.version);
      setStatus("ready");
    };
    const onProgress = (arg: { percent: number }) => {
      setDownloadPercent(Math.round(arg.percent));
    };
    const onError = () => {
      setStatus((prev) => (prev === "downloading" ? "failed" : prev));
    };

    api.onUpdateAvailable(onAvailable);
    api.onUpdateDownloaded(onDownloaded);
    api.onUpdateDownloadProgress?.(onProgress);
    api.onUpdateError?.(onError);
    return () => {
      api.removeUpdateAvailableListener?.();
      api.removeUpdateDownloadedListener?.();
      api.removeUpdateDownloadProgressListener?.();
      api.removeUpdateErrorListener?.();
    };
  }, []);

  if (status === "idle" || dismissed) return null;

  if (status === "failed") {
    return (
      <div
        className="echo-card flex flex-wrap items-center justify-between gap-3 border-b border-[var(--echo-border)] px-4 py-2.5"
        style={{
          background: "var(--echo-surface)",
          borderLeft: "none",
          borderRight: "none",
          borderTop: "none",
        }}
      >
        <span className="text-sm text-[var(--echo-text)]">
          Could not download update. Check your connection and try again from the menu.
        </span>
        <button
          type="button"
          className="echo-btn-secondary rounded-lg px-3 py-1.5 text-sm"
          onClick={() => setDismissed(true)}
        >
          Dismiss
        </button>
      </div>
    );
  }

  if (status === "downloading") {
    return (
      <div
        className="echo-card flex items-center gap-3 border-b border-[var(--echo-border)] px-4 py-2.5"
        style={{
          background: "var(--echo-surface)",
          borderLeft: "none",
          borderRight: "none",
          borderTop: "none",
        }}
      >
        <IconDownload className="size-4 shrink-0 text-[var(--echo-cyan)]" />
        <span className="text-sm text-[var(--echo-text)]">
          Downloading update…
          {downloadPercent != null ? ` ${downloadPercent}%` : ""}
        </span>
      </div>
    );
  }

  if (status === "ready") {
    return (
      <div
        className="echo-card flex flex-wrap items-center justify-between gap-3 border-b border-[var(--echo-border)] px-4 py-2.5"
        style={{
          background: "var(--echo-surface)",
          borderLeft: "none",
          borderRight: "none",
          borderTop: "none",
        }}
      >
        <div className="flex items-center gap-3">
          <IconRefresh className="size-4 shrink-0 text-[var(--echo-cyan)]" />
          <span className="text-sm text-[var(--echo-text)]">
            Update ready{version ? ` (${version})` : ""}. Restart to install.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="echo-btn-secondary rounded-lg px-3 py-1.5 text-sm"
            onClick={() => setDismissed(true)}
          >
            Later
          </button>
          <button
            type="button"
            className="echo-btn-primary rounded-lg px-3 py-1.5 text-sm"
            onClick={() => window.electronAPI?.quitAndInstall?.()}
          >
            Restart now
          </button>
        </div>
      </div>
    );
  }

  return null;
}
