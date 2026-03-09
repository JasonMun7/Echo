import { app, BrowserWindow, desktopCapturer, globalShortcut, ipcMain, session, shell } from "electron";
import { runWorkflowRemote } from "./agent/remote-workflow-runner";
import { createHudOverlayWindow, createHazeOverlayWindow } from "./windows";
import { join } from "path";
import { readFileSync, writeFileSync, existsSync } from "fs";

const AUTH_TOKEN_FILE = "echo-auth-token.json";
const WEB_APP_URL = process.env.VITE_APP_URL || "http://localhost:3000";

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

function handleRunUrl(url: string): void {
  try {
    const u = new URL(url);
    if (u.protocol !== "echo-desktop:") return;
    const workflowId = u.searchParams.get("workflow_id");
    const runId = u.searchParams.get("run_id");
    if (workflowId && runId && mainWindow) {
      mainWindow.focus();
      mainWindow.webContents.send("run-from-url", { workflowId, runId });
    }
  } catch {
    /* ignore */
  }
}

let mainWindow: BrowserWindow | null = null;
let hudOverlayWindow: BrowserWindow | null = null;
let hazeOverlayWindow: BrowserWindow | null = null;

/** Stored when enter-run-mode is called, used by cancel-run and send-interrupt */
let runContext: { workflowId: string; runId: string; token: string } | null = null;

function destroyOverlaysAndShowMain(): void {
  if (hudOverlayWindow && !hudOverlayWindow.isDestroyed()) {
    hudOverlayWindow.destroy();
    hudOverlayWindow = null;
  }
  if (hazeOverlayWindow && !hazeOverlayWindow.isDestroyed()) {
    hazeOverlayWindow.destroy();
    hazeOverlayWindow = null;
  }
  runContext = null;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
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
    });
  }
  return { ok: true };
});

ipcMain.handle("exit-recording-mode", () => {
  destroyOverlaysAndShowMain();
  return { ok: true };
});

ipcMain.handle("enter-run-mode", (_, ctx: { workflowId: string; runId: string; token: string }) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    runContext = ctx;
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
    });
  }
  return { ok: true };
});

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
  mainWindow?.webContents.send("recording-command", { action: "stop", duration });
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
  const base = (process.env.VITE_API_URL || "http://localhost:8000").replace(/\/$/, "");
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
  if (!runContext || !text?.trim()) return { ok: false, error: "No run or text" };
  const { workflowId, runId, token } = runContext;
  const base = (process.env.VITE_API_URL || "http://localhost:8000").replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/api/run/${workflowId}/${runId}/redirect`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ instruction: text.trim() }),
    });
    return { ok: res.ok };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
});

ipcMain.handle("calluser-feedback", async (_, text: string) => {
  if (!runContext || !text?.trim()) return { ok: false, error: "No run or text" };
  const { workflowId, runId, token } = runContext;
  const base = (process.env.VITE_API_URL || "http://localhost:8000").replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/api/run/${workflowId}/${runId}/calluser-feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ instruction: text.trim() }),
    });
    return { ok: res.ok };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
});

app.whenReady().then(async () => {
  if (!app.isDefaultProtocolClient("echo-desktop")) {
    app.setAsDefaultProtocolClient("echo-desktop");
  }

  // Fail-safe: global shortcut to recover from frozen overlays
  globalShortcut.register("CommandOrControl+Shift+X", () => {
    destroyOverlaysAndShowMain();
  });

  // Required for getDisplayMedia() in the renderer - Electron does not support it by default
  session.defaultSession.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      const sources = await desktopCapturer.getSources({ types: ["screen"] });
      const source = sources[0];
      if (source) callback({ video: source });
    },
    { useSystemPicker: true }
  );

  createWindow();

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

app.on("open-url", (_event, url) => {
  if (url.includes("run?")) {
    handleRunUrl(url);
  } else {
    handleAuthUrl(url);
  }
});

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, commandLine: string[]) => {
    const url = commandLine.find((a) => a.startsWith("echo-desktop://"));
    if (url) {
      if (url.includes("run?")) handleRunUrl(url);
      else handleAuthUrl(url);
    }
    if (mainWindow) {
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
  shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")
);
ipcMain.handle("auth-get-token", () => loadStoredToken());
ipcMain.handle("auth-store-token", (_, token: string) => {
  storeToken(token);
});
ipcMain.handle("auth-clear-token", () => clearStoredToken());
ipcMain.handle("auth-open-signin", () => {
  const base = WEB_APP_URL.replace(/\/$/, "");
  shell.openExternal(`${base}/signin?desktop=1`);
});

ipcMain.handle(
  "list-workflows",
  async (
    _,
    args: { token: string }
  ): Promise<{ workflows?: Array<{ id: string; name?: string; status?: string; workflow_type?: string }>; error?: string }> => {
    const { token } = args;
    const base = (process.env.VITE_API_URL || "http://localhost:8000").replace(/\/$/, "");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
    try {
      const res = await fetch(`${base}/api/workflows`, { headers });
      if (!res.ok) {
        return { error: `Workflows: ${res.status} ${res.statusText}` };
      }
      const data = (await res.json()) as { workflows?: Array<{ id: string; name?: string; status?: string; workflow_type?: string }> };
      return { workflows: data.workflows ?? [] };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }
);

ipcMain.handle("get-sources", async () => {
  const sources = await desktopCapturer.getSources({
    types: ["screen", "window"],
    thumbnailSize: { width: 150, height: 150 },
  });
  return sources.map((s) => ({ id: s.id, name: s.name, thumbnail: s.thumbnail.toDataURL() }));
});

ipcMain.handle("get-primary-source-id", async (): Promise<string | null> => {
  const sources = await desktopCapturer.getSources({ types: ["screen"] });
  return sources[0]?.id ?? null;
});

ipcMain.handle("create-run", async (_, args: { workflowId: string; token: string }) => {
  const { workflowId, token } = args;
  const base = (process.env.VITE_API_URL || "http://localhost:8000").replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/api/run/${workflowId}?source=desktop`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      return { error: (d as { detail?: string }).detail ?? `Create run failed: ${res.status}` };
    }
    const data = (await res.json()) as { run_id: string; workflow_id: string };
    return { runId: data.run_id, workflowId: data.workflow_id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
});

import { requestPause, requestResume } from "./run-control";

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
    }
  ) => {
    const { steps, sourceId, workflowType, workflowId, runId, token } = args;
    if (!steps?.length || !sourceId) {
      return { success: false, error: "steps and sourceId required" };
    }
    requestResume();
    const base = (process.env.VITE_API_URL || "http://localhost:8000").replace(/\/$/, "");
    const agentUrl = (process.env.VITE_ECHO_PRISM_AGENT_URL || base).replace(/\/$/, "");
    const progress: string[] = [];
    const result = await runWorkflowRemote(
      steps as unknown as import("@echo/types").Step[],
      {
        sourceId,
        workflowType: (workflowType as import("@echo/types").WorkflowType) ?? "desktop",
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
      }
    );
    return { ...result, progress };
  }
);

ipcMain.handle(
  "fetch-workflow",
  async (
    _,
    args: { workflowId: string; token?: string }
  ) => {
    const { workflowId, token } = args;
    const base = (process.env.VITE_API_URL || "http://localhost:8000").replace(/\/$/, "");
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
      const steps = Array.isArray(stepsData) ? stepsData : stepsData.steps ?? [];
      return { workflow: { id: workflowId, ...workflow }, steps };
    } catch (e) {
      return {
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }
);

// ── EchoPrismVoice IPC (uses backend /ws/chat?mode=voice) ──────────────────────
let voiceClient: import("./agent/voice-backend-client").VoiceBackendClient | null = null;

ipcMain.handle("start-voice-chat", async () => {
  try {
    const { VoiceBackendClient } = await import("./agent/voice-backend-client");
    const token = loadStoredToken() || "";
    const base = (process.env.VITE_API_URL || "http://localhost:8000").replace(/\/$/, "");
    const opts = {
      backendUrl: base,
      token,
      workflowId: runContext?.workflowId,
      runId: runContext?.runId,
    };
    voiceClient = new VoiceBackendClient(opts, (type, data) => {
      if (!mainWindow) return;
      if (type === "audio") {
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
        mainWindow.webContents.send("chat-audio", new Uint8Array(buf));
      } else if (type === "text") {
        mainWindow.webContents.send("chat-text", { role: "assistant", text: data });
      }
    });
    await voiceClient.start();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
});

ipcMain.handle("stop-voice-chat", async () => {
  if (voiceClient) {
    voiceClient.stop();
    voiceClient = null;
  }
  return { ok: true };
});

ipcMain.handle("send-chat-text", async (_, text: string) => {
  if (!voiceClient) return { ok: false, error: "No active voice session" };
  voiceClient.sendText(text);
  return { ok: true };
});

ipcMain.handle("send-voice-audio", async (_, chunk: ArrayBuffer | Buffer) => {
  if (!voiceClient) return;
  const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  voiceClient.sendAudio(buf);
});
