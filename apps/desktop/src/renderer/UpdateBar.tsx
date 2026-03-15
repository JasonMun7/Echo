import { useState, useEffect } from "react";
import { IconRefresh, IconDownload } from "@tabler/icons-react";

type Status = "idle" | "downloading" | "ready";

export function UpdateBar() {
  const [status, setStatus] = useState<Status>("idle");
  const [version, setVersion] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onUpdateAvailable || !api?.onUpdateDownloaded) return;

    const onAvailable = () => setStatus("downloading");
    const onDownloaded = (arg: { version: string }) => {
      setVersion(arg.version);
      setStatus("ready");
    };

    api.onUpdateAvailable(onAvailable);
    api.onUpdateDownloaded(onDownloaded);
    return () => {
      api.removeUpdateAvailableListener?.();
      api.removeUpdateDownloadedListener?.();
    };
  }, []);

  if (status === "idle" || dismissed) return null;

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
