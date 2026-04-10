/**
 * GitHub Releases auto-update via electron-updater (pairs with electron-builder).
 * We intentionally do not use update-electron-app / update.electronjs.org — see scripts/doppler-env-reference.md (Desktop).
 */
import { app, BrowserWindow } from "electron";
import { autoUpdater, type UpdateInfo } from "electron-updater";
import { readFileSync } from "fs";
import { join } from "path";

const isWinPortable = process.platform === "win32" && Boolean(process.env.PORTABLE_EXECUTABLE_DIR);

function resolveGithubTarget(): { owner: string; repo: string } | null {
  const envOwner = process.env.VITE_GITHUB_UPDATE_OWNER?.trim();
  const envRepo = process.env.VITE_GITHUB_UPDATE_REPO?.trim();
  if (envOwner && envRepo) return { owner: envOwner, repo: envRepo };
  try {
    const pkgPath = join(app.getAppPath(), "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
      repository?: { url?: string };
    };
    const url = pkg.repository?.url;
    if (typeof url !== "string") return null;
    const m = url.match(/github\.com[/:]([^/]+)\/([^/.]+)/i);
    if (!m) return null;
    return { owner: m[1], repo: m[2].replace(/\.git$/, "") };
  } catch {
    return null;
  }
}

/** Prefer assets whose names suggest Echo Desktop (avoids wrong product in a busy monorepo). */
function isEchoDesktopRelease(info: UpdateInfo): boolean {
  const u = info.files?.[0]?.url;
  if (typeof u === "string" && u.length > 0) return /echo/i.test(u);
  return true;
}

export function setupAutoUpdater(getMainWindow: () => BrowserWindow | null): void {
  if (!app.isPackaged || isWinPortable) return;

  const target = resolveGithubTarget();
  if (target) {
    autoUpdater.setFeedURL({
      provider: "github",
      owner: target.owner,
      repo: target.repo,
    });
  } else {
    console.warn(
      "[updater] No owner/repo from env or package.json; using embedded app-update feed (set VITE_GITHUB_UPDATE_OWNER / VITE_GITHUB_UPDATE_REPO to override)",
    );
  }

  autoUpdater.logger = {
    info: (...m: unknown[]) => console.log("[updater]", ...m),
    warn: (...m: unknown[]) => console.warn("[updater]", ...m),
    error: (...m: unknown[]) => console.error("[updater]", ...m),
    debug: (...m: unknown[]) => console.debug("[updater]", ...m),
  };

  autoUpdater.autoDownload = false;

  autoUpdater.on("update-available", (info: UpdateInfo) => {
    if (!isEchoDesktopRelease(info)) {
      console.info("[updater] Skipping update: release assets do not look like Echo Desktop");
      return;
    }
    const win = getMainWindow();
    win?.webContents.send("update-available");
    autoUpdater.downloadUpdate().catch(() => {
      /* network or GitHub API */
    });
  });

  autoUpdater.on("download-progress", (p) => {
    const win = getMainWindow();
    win?.webContents.send("update-download-progress", {
      percent: p.percent,
      bytesPerSecond: p.bytesPerSecond,
      transferred: p.transferred,
      total: p.total,
    });
  });

  autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
    const win = getMainWindow();
    win?.webContents.send("update-downloaded", {
      version: info?.version ?? "unknown",
    });
  });

  autoUpdater.on("error", (err: Error) => {
    console.error("[updater]", err);
    const win = getMainWindow();
    win?.webContents.send("update-error", { message: err?.message ?? String(err) });
  });

  autoUpdater.checkForUpdates().catch(() => {
    /* offline or invalid publish config */
  });
}

export function runUpdateCheck(): Promise<unknown> {
  if (!app.isPackaged || isWinPortable) return Promise.resolve(null);
  return autoUpdater.checkForUpdates().catch(() => null);
}

export function quitAndInstallIfReady(): void {
  if (app.isPackaged) {
    autoUpdater.quitAndInstall(false, true);
  }
}
