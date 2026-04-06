import {
  app,
  BrowserWindow,
  desktopCapturer,
  globalShortcut,
  ipcMain,
  screen,
  session,
  shell,
} from "electron";
import { createServer } from "http";
import { autoUpdater, type UpdateInfo } from "electron-updater";
import type { Step, WorkflowType } from "@echo/types";
import {
  runWorkflowRemote,
  runGoalOnlyRemote,
  abortActiveRun,
} from "./agent/remote-workflow-runner";
import {
  createHudOverlayWindow,
  createHazeOverlayWindow,
  createVoiceInterruptionWindow,
  getHudPositionOnCursorDisplay,
} from "./windows";
import { join } from "path";
import { readFileSync, writeFileSync, existsSync } from "fs";

const AUTH_TOKEN_FILE = "echo-auth-token.json";
const WEB_APP_URL = process.env.VITE_APP_URL || "http://localhost:3000";

/** Port for localhost auth callback (used when echo-desktop:// is not handed off in dev) */
const AUTH_CALLBACK_PORT = 38473;

/**
 * Auth flow: custom protocol (echo-desktop://) + localhost callback.
 * - Production: packaged app should register the protocol (e.g. electron-builder
 *   with build.mac.extendInfo CFBundleURLTypes / protocols config) so the OS
 *   hands off echo-desktop:// to this app. setAsDefaultProtocolClient() is also
 *   called at runtime.
 * - Dev: protocol often not handed off, so we run a local server on AUTH_CALLBACK_PORT
 *   and the web app sends the token there (same machine only, 127.0.0.1).
 */

function getAuthTokenPath(): string {
  return join(app.getPath("userData"), AUTH_TOKEN_FILE);
}

function loadStoredToken(): string | null {
  try {
    const p = getAuthTokenPath();
    if (!existsSync(p)) return null;
    const data = JSON.parse(readFileSync(p, "utf-8"));
    return typeof data?.token === "string" ? data.token : null;
  } catch {
    return null;
  }
}

function storeToken(token: string): void {
  const p = getAuthTokenPath();
  writeFileSync(p, JSON.stringify({ token }), "utf-8");
}

function clearStoredToken(): void {
  try {
    const p = getAuthTokenPath();
    if (existsSync(p)) {
      writeFileSync(p, JSON.stringify({}), "utf-8");
    }
  } catch {
    /* ignore */
  }
}

function handleAuthUrl(url: string): void {
  try {
    const u = new URL(url);
    if (u.protocol !== "echo-desktop:") return;
    const token = u.searchParams.get("token");
    if (token) {
      storeToken(token);
      mainWindow?.webContents.send("auth-token-received");
    }
  } catch {
    /* ignore */
  }
}

function handleOpenApp(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
  }
}

function handleRunUrl(url: string): void {
  try {
    const u = new URL(url);
    if (u.protocol !== "echo-desktop:") return;
    const workflowId = u.searchParams.get("workflow_id");
    const runId = u.searchParams.get("run_id");
    if (workflowId && runId && mainWindow && !mainWindow.isDestroyed()) {
      if (isCollapsed) expandWindow();
      mainWindow.show();
      mainWindow.focus();
      mainWindow.moveTop();
      mainWindow.webContents.send("run-from-url", { workflowId, runId });
    }
  } catch {
    /* ignore */
  }
}

const GENIE_DURATION_MS = 420;
const GENIE_FRAME_INTERVAL_MS = 16;

/** Ease-out cubic for genie "flowing into bottle" feel */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function expandWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!isCollapsed) return;
  const primaryDisplay = screen.getPrimaryDisplay();
  const { x, y, height: workHeight } = primaryDisplay.workArea;
  const WINDOW_HEIGHT = Math.max(400, workHeight - 100);
  const endY = Math.round(y + (workHeight - WINDOW_HEIGHT) / 2);

  const [startW, startH] = mainWindow.getSize();
  const [startX, startY] = mainWindow.getPosition();

  isCollapsed = false;
  mainWindow.webContents.send("desktop-state-changed", { collapsed: false });

  const startTime = Date.now();
  const tick = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const elapsed = Date.now() - startTime;
    const t = Math.min(elapsed / GENIE_DURATION_MS, 1);
    const eased = easeOutCubic(t);

    const w = Math.round(startW + (WINDOW_WIDTH - startW) * eased);
    const h = Math.round(startH + (WINDOW_HEIGHT - startH) * eased);
    const px = Math.round(startX + (x - startX) * eased);
    const py = Math.round(startY + (endY - startY) * eased);

    mainWindow.setBounds({ x: px, y: py, width: w, height: h });

    if (t < 1) {
      setTimeout(tick, GENIE_FRAME_INTERVAL_MS);
    }
  };
  tick();
}

function collapseWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (isCollapsed) return;
  const primaryDisplay = screen.getPrimaryDisplay();
  const { x, y, height: workHeight } = primaryDisplay.workArea;
  const endY = y + workHeight - COLLAPSED_HEIGHT;

  const [startW, startH] = mainWindow.getSize();
  const [startX, startY] = mainWindow.getPosition();

  const startTime = Date.now();
  const tick = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const elapsed = Date.now() - startTime;
    const t = Math.min(elapsed / GENIE_DURATION_MS, 1);
    const eased = easeOutCubic(t);

    const w = Math.round(startW + (COLLAPSED_WIDTH - startW) * eased);
    const h = Math.round(startH + (COLLAPSED_HEIGHT - startH) * eased);
    const px = Math.round(startX + (x - startX) * eased);
    const py = Math.round(startY + (endY - startY) * eased);

    mainWindow.setBounds({ x: px, y: py, width: w, height: h });

    if (t < 1) {
      setTimeout(tick, GENIE_FRAME_INTERVAL_MS);
    } else {
      isCollapsed = true;
      mainWindow.webContents.send("desktop-state-changed", { collapsed: true });
    }
  };
  tick();
}

function sendOpenEchoPrism(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("open-echoprism");
  }
}

function sendStartCapture(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("start-capture");
  }
}

function handleEchoPrismUrl(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    pendingOpenEchoPrism = true;
    return;
  }
  if (isCollapsed) expandWindow();
  mainWindow.show();
  mainWindow.focus();
  mainWindow.moveTop();
  if (mainWindow.webContents.isLoading()) {
    mainWindow.webContents.once("did-finish-load", () => sendOpenEchoPrism());
  } else {
    sendOpenEchoPrism();
  }
}

function handleCaptureUrl(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    pendingStartCapture = true;
    return;
  }
  if (isCollapsed) expandWindow();
  mainWindow.show();
  mainWindow.focus();
  mainWindow.moveTop();
  if (mainWindow.webContents.isLoading()) {
    mainWindow.webContents.once("did-finish-load", () => sendStartCapture());
  } else {
    sendStartCapture();
  }
}

const WINDOW_WIDTH = 400;
const COLLAPSED_WIDTH = 56;
const COLLAPSED_HEIGHT = 56;

let mainWindow: BrowserWindow | null = null;
let hudOverlayWindow: BrowserWindow | null = null;
let hazeOverlayWindow: BrowserWindow | null = null;
let voiceInterruptionWindow: BrowserWindow | null = null;
let isCollapsed = false;
let hudFollowInterval: ReturnType<typeof setInterval> | null = null;
let lastHudDisplayId: number | null = null;
let currentHudMode: "recording" | "run" | null = null;

/** Stored when enter-run-mode is called, used by cancel-run and send-interrupt */
let runContext: { workflowId: string; runId: string; token: string } | null =
  null;

/** True while destroyOverlaysAndShowMain() is executing — prevents HUD "closed" from treating
 *  an intentional teardown as an unexpected close and cancelling the run a second time. */
let isRunModeExiting = false;

/** Last N run progress entries — sent to voice interruption overlay for context */
let recentRunProgress: Array<{ thought: string; action: string; step: number }> = [];

/** Set when a deep link (echoprism/capture) is received before the main window is ready; sent once the window loads. */
let pendingOpenEchoPrism = false;
let pendingStartCapture = false;

function stopHudFollowInterval(): void {
  if (hudFollowInterval) {
    clearInterval(hudFollowInterval);
    hudFollowInterval = null;
  }
  lastHudDisplayId = null;
  currentHudMode = null;
}

function startHudFollowCursor(mode: "recording" | "run"): void {
  currentHudMode = mode;
  lastHudDisplayId = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id;
  stopHudFollowInterval();
  hudFollowInterval = setInterval(() => {
    if (!hudOverlayWindow || hudOverlayWindow.isDestroyed() || !currentHudMode) {
      stopHudFollowInterval();
      return;
    }
    const { display, x, y, w, h } = getHudPositionOnCursorDisplay(currentHudMode);
    if (display.id !== lastHudDisplayId) {
      lastHudDisplayId = display.id;
      hudOverlayWindow.setBounds({ x, y, width: w, height: h });
    }
  }, 500);
}

function destroyOverlaysAndShowMain(): void {
  isRunModeExiting = true;
  if (voiceInterruptionWindow && !voiceInterruptionWindow.isDestroyed()) {
    voiceInterruptionWindow.destroy();
    voiceInterruptionWindow = null;
  }
  stopHudFollowInterval();
  if (hudOverlayWindow && !hudOverlayWindow.isDestroyed()) {
    hudOverlayWindow.destroy();
    hudOverlayWindow = null;
  }
  if (hazeOverlayWindow && !hazeOverlayWindow.isDestroyed()) {
    hazeOverlayWindow.destroy();
    hazeOverlayWindow = null;
  }
  runContext = null;
  recentRunProgress = [];
  isRunModeExiting = false;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
  }
}

function createWindow(): void {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { x, y, height: workHeight } = primaryDisplay.workArea;
  const WINDOW_HEIGHT = Math.max(400, workHeight - 100);
  const winY = Math.round(y + (workHeight - WINDOW_HEIGHT) / 2);
  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    x,
    y: winY,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (process.env.NODE_ENV === "development") {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.once("did-finish-load", () => {
    if (pendingOpenEchoPrism) {
      pendingOpenEchoPrism = false;
      sendOpenEchoPrism();
    }
    if (pendingStartCapture) {
      pendingStartCapture = false;
      sendStartCapture();
    }
  });

  // Appear above fullscreen apps (e.g. browser) when user opens Echo Prism from web
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.setAlwaysOnTop(true, "screen-saver", 1);
  mainWindow.setMovable(false);
}

async function checkScreenPermission(): Promise<boolean> {
  if (process.platform !== "darwin") return true;
  try {
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 100, height: 100 },
    });
    const src = sources[0];
    if (!src?.thumbnail) return false;
    const buf = Buffer.from(src.thumbnail.toPNG());
    return buf.length > 1000;
  } catch {
    return false;
  }
}

// ── Mode switching IPC (Main Process as source of truth) ─────────────────────
ipcMain.handle("enter-recording-mode", () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide();
    if (hudOverlayWindow && !hudOverlayWindow.isDestroyed()) {
      hudOverlayWindow.destroy();
    }
    hudOverlayWindow = createHudOverlayWindow("recording");
    hudOverlayWindow.on("closed", () => {
      hudOverlayWindow = null;
      stopHudFollowInterval();
    });
    startHudFollowCursor("recording");
  }
  return { ok: true };
});

ipcMain.handle("exit-recording-mode", () => {
  destroyOverlaysAndShowMain();
  return { ok: true };
});

ipcMain.handle(
  "enter-run-mode",
  (_, ctx: { workflowId: string; runId: string; token: string; goalOnly?: boolean }) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      runContext = ctx;
      recentRunProgress = [];
      const goalOnly = ctx.goalOnly === true;

      if (goalOnly) {
        // Goal-only from voice: show Run HUD for progress/thoughts, but no haze and don't hide main (EchoPrism stays open).
        // HUD disappears when run completes (exitRunMode).
        console.log("[enter-run-mode] goal-only: runContext + HUD (no haze, main window stays visible)", {
          workflowId: ctx.workflowId,
          runId: ctx.runId,
        });
        if (hudOverlayWindow && !hudOverlayWindow.isDestroyed()) {
          hudOverlayWindow.destroy();
        }
        hudOverlayWindow = createHudOverlayWindow("run");
        hudOverlayWindow.on("closed", () => {
          hudOverlayWindow = null;
          stopHudFollowInterval();
          if (!isRunModeExiting && runContext) {
            requestCancel();
            abortActiveRun();
            runContext = null;
            recentRunProgress = [];
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show();
          }
        });
        startHudFollowCursor("run");
      } else {
        mainWindow.hide();
        if (hazeOverlayWindow && !hazeOverlayWindow.isDestroyed()) {
          hazeOverlayWindow.destroy();
        }
        if (hudOverlayWindow && !hudOverlayWindow.isDestroyed()) {
          hudOverlayWindow.destroy();
        }
        hazeOverlayWindow = createHazeOverlayWindow();
        hazeOverlayWindow.on("closed", () => {
          hazeOverlayWindow = null;
        });
        hudOverlayWindow = createHudOverlayWindow("run");
        hudOverlayWindow.on("closed", () => {
          hudOverlayWindow = null;
          stopHudFollowInterval();
          if (!isRunModeExiting && runContext) {
            requestCancel();
            abortActiveRun();
            runContext = null;
            recentRunProgress = [];
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show();
          }
        });
        startHudFollowCursor("run");
      }
    }
    return { ok: true };
  },
);

ipcMain.handle("exit-run-mode", () => {
  destroyOverlaysAndShowMain();
  return { ok: true };
});

// Recording commands: HUD sends, Main forwards to Main Window (owns MediaRecorder)
ipcMain.handle("recording-pause", () => {
  mainWindow?.webContents.send("recording-command", { action: "pause" });
  return { ok: true };
});
ipcMain.handle("recording-stop", (_, duration?: number) => {
  mainWindow?.webContents.send("recording-command", {
    action: "stop",
    duration,
  });
  return { ok: true };
});
ipcMain.handle("recording-redo", () => {
  mainWindow?.webContents.send("recording-command", { action: "redo" });
  return { ok: true };
});
ipcMain.handle("recording-discard", () => {
  mainWindow?.webContents.send("recording-command", { action: "discard" });
  return { ok: true };
});

// Run commands: Main Process handles via run-control and stored context
ipcMain.handle("cancel-run", async () => {
  if (!runContext) return { ok: false, error: "No active run" };
  const { workflowId, runId, token } = runContext;
  const base = (process.env.VITE_API_URL || "http://localhost:8000").replace(
    /\/$/,
    "",
  );
  // Signal cancel and abort the active run immediately — closes WebSocket so remote-workflow-runner exits
  requestCancel();
  abortActiveRun();
  try {
    const res = await fetch(`${base}/api/run/${workflowId}/${runId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    return { ok: res.ok };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
});

ipcMain.handle("send-interrupt", async (_, text: string) => {
  if (!runContext || !text?.trim())
    return { ok: false, error: "No run or text" };
  const { workflowId, runId, token } = runContext;
  const base = (process.env.VITE_API_URL || "http://localhost:8000").replace(
    /\/$/,
    "",
  );
  try {
    const res = await fetch(`${base}/api/run/${workflowId}/${runId}/redirect`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ instruction: text.trim() }),
    });
    return { ok: res.ok };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
});

ipcMain.handle("calluser-feedback", async (_, text: string) => {
  if (!runContext || !text?.trim())
    return { ok: false, error: "No run or text" };
  const { workflowId, runId, token } = runContext;
  const base = (process.env.VITE_API_URL || "http://localhost:8000").replace(
    /\/$/,
    "",
  );
  try {
    const res = await fetch(
      `${base}/api/run/${workflowId}/${runId}/calluser-feedback`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ instruction: text.trim() }),
      },
    );
    return { ok: res.ok };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
});

// ── Voice Interruption ────────────────────────────────────────────────────────

function openVoiceInterruption(): { ok: boolean; error?: string } {
  if (!runContext) return { ok: false, error: "No active run" };
  if (voiceInterruptionWindow && !voiceInterruptionWindow.isDestroyed()) {
    voiceInterruptionWindow.focus();
    return { ok: true };
  }
  requestPause();
  hudOverlayWindow?.webContents.send("run-paused-by-voice");

  voiceInterruptionWindow = createVoiceInterruptionWindow(runContext.workflowId, runContext.runId);
  voiceInterruptionWindow.on("closed", () => {
    voiceInterruptionWindow = null;
    // Auto-resume unless the run was cancelled through the voice session
    if (!isCancelRequested()) {
      requestResume();
      hudOverlayWindow?.webContents.send("run-resumed-by-voice");
    }
  });

  // Send run context once the window renderer is ready
  voiceInterruptionWindow.webContents.once("did-finish-load", () => {
    if (!runContext) return;
    voiceInterruptionWindow?.webContents.send("voice-interruption-context", {
      workflowId: runContext.workflowId,
      runId: runContext.runId,
      recentThoughts: recentRunProgress,
    });
  });

  return { ok: true };
}

ipcMain.handle("open-voice-interruption", () => openVoiceInterruption());

ipcMain.handle("close-voice-interruption", () => {
  if (voiceInterruptionWindow && !voiceInterruptionWindow.isDestroyed()) {
    voiceInterruptionWindow.close(); // triggers "closed" → auto-resume
  }
  return { ok: true };
});

ipcMain.handle("resume-run-from-voice", () => {
  // Called when the LiveKit agent publishes a resume_run data packet
  requestResume();
  hudOverlayWindow?.webContents.send("run-resumed-by-voice");
  if (voiceInterruptionWindow && !voiceInterruptionWindow.isDestroyed()) {
    voiceInterruptionWindow.destroy();
    voiceInterruptionWindow = null;
  }
  return { ok: true };
});

/** Localhost server so web can send auth token when echo-desktop:// isn't handed off (e.g. in dev) */
function startAuthCallbackServer(): void {
  const server = createServer((req, res) => {
    const url = req.url ?? "";
    const tokenMatch = url.match(/[?&]token=([^&]+)/);
    const token = tokenMatch ? decodeURIComponent(tokenMatch[1]) : null;
    res.setHeader("Content-Type", "text/plain");
    if (token) {
      storeToken(token);
      mainWindow?.webContents.send("auth-token-received");
      res.writeHead(200);
      res.end("OK");
    } else {
      res.writeHead(400);
      res.end("Missing token");
    }
  });
  server.listen(AUTH_CALLBACK_PORT, "127.0.0.1", () => {
    // Only used for auth callback
  });
  server.on("error", () => {
    // Port in use or permission denied; protocol handler may still work
  });
}

app.whenReady().then(async () => {
  if (!app.isDefaultProtocolClient("echo-desktop")) {
    app.setAsDefaultProtocolClient("echo-desktop");
  }

  startAuthCallbackServer();

  // Defer globalShortcut so we run after app is fully ready (avoids "cannot be used before app is ready" on macOS when launched via protocol)
  setImmediate(() => {
    try {
      globalShortcut.register("CommandOrControl+Shift+X", () => {
        destroyOverlaysAndShowMain();
      });
      globalShortcut.register("Ctrl+Shift+V", () => {
        if (!runContext) return;
        if (voiceInterruptionWindow && !voiceInterruptionWindow.isDestroyed()) {
          voiceInterruptionWindow.close();
        } else {
          openVoiceInterruption();
        }
      });
    } catch {
      // Ignore if globalShortcut still not available (e.g. app not fully ready)
    }
  });

  // Required for getDisplayMedia() in the renderer - Electron does not support it by default.
  // useSystemPicker: true shows the OS picker; when the handler runs we supply a fallback.
  // Prefer the screen under the cursor so we don't force the primary display and cause "shift back to desktop".
  session.defaultSession.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      const sources = await desktopCapturer.getSources({
        types: ["window", "screen"],
        thumbnailSize: { width: 150, height: 150 },
      });
      const cursorDisplay = screen.getDisplayNearestPoint(
        screen.getCursorScreenPoint(),
      );
      const screenSource = sources.find(
        (s) =>
          s.id.startsWith("screen:") &&
          (s as { display_id?: string }).display_id === String(cursorDisplay.id),
      );
      const fallbackSource =
        screenSource ?? sources.find((s) => s.id.startsWith("screen:")) ?? sources[0];
      if (fallbackSource) callback({ video: fallbackSource });
    },
    { useSystemPicker: true },
  );

  createWindow();

  // Handle protocol URL passed at launch (e.g. macOS when app was not running)
  const launchUrl = process.argv.find((a) => a.startsWith("echo-desktop://"));
  if (launchUrl) {
    dispatchDeepLink(launchUrl);
  }

  if (app.isPackaged) {
    autoUpdater.on("update-available", () => {
      mainWindow?.webContents.send("update-available");
    });
    autoUpdater.on("update-downloaded", (_event: unknown, info: UpdateInfo) => {
      mainWindow?.webContents.send("update-downloaded", {
        version: info?.version ?? "unknown",
      });
    });
    autoUpdater.checkForUpdates().catch(() => {
      // Ignore (e.g. no network or invalid publish config)
    });
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

function dispatchDeepLink(url: string): void {
  try {
    const u = new URL(url);
    if (u.protocol !== "echo-desktop:") return;
    const pathname = (u.hostname || u.pathname || "").replace(/^\/+/, "") || "";
    if (url.includes("run?")) {
      handleRunUrl(url);
    } else if (pathname === "echoprism") {
      handleEchoPrismUrl();
    } else if (pathname === "capture") {
      handleCaptureUrl();
    } else if (u.searchParams.has("token")) {
      handleAuthUrl(url);
    } else if (pathname === "open") {
      handleOpenApp();
    } else {
      handleAuthUrl(url);
    }
  } catch {
    /* ignore */
  }
}

app.on("open-url", (_event, url) => {
  dispatchDeepLink(url);
});

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, commandLine: string[]) => {
    const url = commandLine.find((a) => a.startsWith("echo-desktop://"));
    if (url) {
      dispatchDeepLink(url);
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.focus();
    }
  });
}

ipcMain.handle("check-screen-permission", () => checkScreenPermission());

ipcMain.handle("open-web-ui", (_, path?: string) => {
  const url = path ? `${WEB_APP_URL}${path}` : WEB_APP_URL;
  return shell.openExternal(url);
});
ipcMain.handle("open-system-settings", () =>
  shell.openExternal(
    "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
  ),
);
ipcMain.handle("auth-get-token", () => loadStoredToken());
ipcMain.handle("auth-store-token", (_, token: string) => {
  storeToken(token);
});
ipcMain.handle("auth-clear-token", () => clearStoredToken());
ipcMain.handle("auth-open-signin", () => {
  const base = WEB_APP_URL.replace(/\/$/, "");
  shell.openExternal(`${base}/signin?desktop=1&port=${AUTH_CALLBACK_PORT}`);
});

ipcMain.handle("quit-and-install", () => {
  if (app.isPackaged) {
    autoUpdater.quitAndInstall(false, true);
  }
});

ipcMain.handle("check-for-updates", () => {
  if (app.isPackaged) {
    return autoUpdater.checkForUpdates().catch(() => null);
  }
  return Promise.resolve(null);
});

ipcMain.handle("desktop-collapse", () => {
  collapseWindow();
});

ipcMain.handle("desktop-expand", () => {
  expandWindow();
});

ipcMain.handle("app-quit", () => {
  app.quit();
});

ipcMain.handle(
  "list-workflows",
  async (
    _,
    args: { token: string },
  ): Promise<{
    workflows?: Array<{
      id: string;
      name?: string;
      status?: string;
      workflow_type?: string;
    }>;
    error?: string;
  }> => {
    const { token } = args;
    const base = (process.env.VITE_API_URL || "http://localhost:8000").replace(
      /\/$/,
      "",
    );
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
    try {
      const res = await fetch(`${base}/api/workflows`, { headers });
      if (!res.ok) {
        return { error: `Workflows: ${res.status} ${res.statusText}` };
      }
      const data = (await res.json()) as {
        workflows?: Array<{
          id: string;
          name?: string;
          status?: string;
          workflow_type?: string;
        }>;
      };
      return { workflows: data.workflows ?? [] };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  },
);

ipcMain.handle("get-sources", async () => {
  const sources = await desktopCapturer.getSources({
    types: ["screen", "window"],
    thumbnailSize: { width: 150, height: 150 },
  });
  return sources.map((s) => ({
    id: s.id,
    name: s.name,
    thumbnail: s.thumbnail.toDataURL(),
  }));
});

ipcMain.handle("get-primary-source-id", async (): Promise<string | null> => {
  const sources = await desktopCapturer.getSources({ types: ["screen"] });
  return sources[0]?.id ?? null;
});

ipcMain.handle(
  "create-run",
  async (_, args: { workflowId: string; token: string }) => {
    const { workflowId, token } = args;
    const base = (process.env.VITE_API_URL || "http://localhost:8000").replace(
      /\/$/,
      "",
    );
    try {
      const res = await fetch(`${base}/api/run/${workflowId}?source=desktop`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        return {
          error:
            (d as { detail?: string }).detail ??
            `Create run failed: ${res.status}`,
        };
      }
      const data = (await res.json()) as {
        run_id: string;
        workflow_id: string;
      };
      return { runId: data.run_id, workflowId: data.workflow_id };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  },
);

import {
  requestPause,
  requestResume,
  requestCancel,
  isCancelRequested,
  clearCancel,
} from "./run-control";

ipcMain.handle("pause-run", () => {
  requestPause();
  return { ok: true };
});

ipcMain.handle("resume-run", () => {
  requestResume();
  return { ok: true };
});

ipcMain.handle(
  "run-workflow-local",
  async (
    _,
    args: {
      steps: Array<Record<string, unknown>>;
      sourceId: string;
      workflowType?: string;
      workflowId?: string;
      runId?: string;
      token?: string;
    },
  ) => {
    const { steps, sourceId, workflowType, workflowId, runId, token } = args;
    if (!steps?.length || !sourceId) {
      return { success: false, error: "steps and sourceId required" };
    }
    requestResume();
    clearCancel();
    const base = (process.env.VITE_API_URL || "http://localhost:8000").replace(
      /\/$/,
      "",
    );
    const agentUrl = (process.env.VITE_ECHO_AGENT_URL || base).replace(
      /\/$/,
      "",
    );
    const progress: string[] = [];
    const entries: Array<{ thought: string; action: string; step: number }> =
      [];
    const result = await runWorkflowRemote(steps as unknown as Step[], {
      sourceId,
      workflowType: (workflowType as WorkflowType) ?? "desktop",
      workflowId,
      runId,
      token,
      backendUrl: base,
      agentWsUrl: agentUrl,
      onProgress: (msg, stepNum, thought, action) => {
        progress.push(msg);
        const payload = {
          thought: thought || msg,
          action: action || "",
          step: stepNum ?? 0,
        };
        entries.push(payload);
        recentRunProgress = [...recentRunProgress.slice(-4), payload];
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("run-progress", payload);
        }
        if (hudOverlayWindow && !hudOverlayWindow.isDestroyed()) {
          hudOverlayWindow.webContents.send("run-progress", payload);
        }
      },
      onAwaitingUser: (reason) => {
        if (hudOverlayWindow && !hudOverlayWindow.isDestroyed()) {
          hudOverlayWindow.webContents.send("run-awaiting-user", { reason });
        }
      },
    });
    if (process.env.NODE_ENV === "development") {
      const withThought = entries.filter((e) => (e.thought ?? "").trim().length > 0).length;
      console.debug("[run-workflow] Completed: %d progress entries (%d with thought)", entries.length, withThought);
    }
    return { ...result, progress, entries };
  },
);

ipcMain.handle(
  "run-goal-only-local",
  async (
    _,
    args: {
      goal: string;
      sourceId: string;
      workflowType?: string;
      workflowId: string;
      runId: string;
      token: string;
    },
  ) => {
    const { goal, sourceId, workflowType, workflowId, runId, token } = args;
    if (!goal?.trim() || !sourceId || !workflowId || !runId || !token) {
      console.warn("[run-goal-only] missing args", {
        hasGoal: !!goal?.trim(),
        hasSourceId: !!sourceId,
        workflowId,
        runId,
      });
      return { success: false, error: "goal, sourceId, workflowId, runId, and token required" };
    }
    console.log("[run-goal-only] starting", {
      goal: goal.slice(0, 80),
      workflowId,
      runId,
      sourceId: sourceId.slice(0, 20),
    });
    requestResume();
    clearCancel();
    const base = (process.env.VITE_API_URL || "http://localhost:8000").replace(
      /\/$/,
      "",
    );
    const agentUrl = (process.env.VITE_ECHO_AGENT_URL || base).replace(
      /\/$/,
      "",
    );
    const progress: string[] = [];
    const entries: Array<{ thought: string; action: string; step: number }> = [];
    const result = await runGoalOnlyRemote(goal, {
      sourceId,
      workflowType: (workflowType as WorkflowType) ?? "desktop",
      workflowId,
      runId,
      token,
      backendUrl: base,
      agentWsUrl: agentUrl,
      onProgress: (msg, stepNum, thought, action) => {
        progress.push(msg);
        const payload = {
          thought: thought || msg,
          action: action || "",
          step: stepNum ?? 0,
        };
        entries.push(payload);
        if (entries.length <= 3) {
          console.log("[run-goal-only] progress", entries.length, { stepNum, thought: (thought || msg).slice(0, 50), action: (action || "").slice(0, 40) });
        }
        recentRunProgress = [...recentRunProgress.slice(-4), payload];
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("run-progress", payload);
        }
        if (hudOverlayWindow && !hudOverlayWindow.isDestroyed()) {
          hudOverlayWindow.webContents.send("run-progress", payload);
        }
      },
      onAwaitingUser: (reason) => {
        console.log("[run-goal-only] awaiting user", reason);
        if (hudOverlayWindow && !hudOverlayWindow.isDestroyed()) {
          hudOverlayWindow.webContents.send("run-awaiting-user", { reason });
        }
      },
    });
    console.log("[run-goal-only] finished", {
      success: result.success,
      error: result.error,
      entriesCount: entries.length,
    });
    if (result.success) {
      console.log("[run-goal-only] goal met — run complete; HUD will close on exitRunMode");
    }
    if (process.env.NODE_ENV === "development") {
      const withThought = entries.filter((e) => (e.thought ?? "").trim().length > 0).length;
      console.debug("[run-goal-only] progress entries: %d (%d with thought)", entries.length, withThought);
    }
    return { ...result, progress, entries };
  },
);

ipcMain.handle(
  "fetch-workflow",
  async (_, args: { workflowId: string; token?: string }) => {
    const { workflowId, token } = args;
    const base = (process.env.VITE_API_URL || "http://localhost:8000").replace(
      /\/$/,
      "",
    );
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    try {
      const [wfRes, stepsRes] = await Promise.all([
        fetch(`${base}/api/workflows/${workflowId}`, { headers }),
        fetch(`${base}/api/workflows/${workflowId}/steps`, { headers }),
      ]);
      if (!wfRes.ok) {
        return { error: `Workflow: ${wfRes.status} ${wfRes.statusText}` };
      }
      if (!stepsRes.ok) {
        return { error: `Steps: ${stepsRes.status} ${stepsRes.statusText}` };
      }
      const workflow = await wfRes.json();
      const stepsData = await stepsRes.json();
      const steps = Array.isArray(stepsData)
        ? stepsData
        : (stepsData.steps ?? []);
      return { workflow: { id: workflowId, ...workflow }, steps };
    } catch (e) {
      return {
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },
);

// EchoPrismVoice now uses LiveKit + AgentSessionView; legacy IPC removed
