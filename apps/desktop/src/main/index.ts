import { app, BrowserWindow, desktopCapturer, ipcMain, session, shell } from "electron";
import { runWorkflowLocal } from "./agent/echo-prism-agent";
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

let mainWindow: BrowserWindow | null = null;

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

app.whenReady().then(async () => {
  if (!app.isDefaultProtocolClient("echo-desktop")) {
    app.setAsDefaultProtocolClient("echo-desktop");
  }

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

  // After window is created, check screen recording permission and notify renderer
  if (process.platform === "darwin") {
    // Small delay to let the renderer mount before we send the event
    setTimeout(async () => {
      const hasPermission = await checkScreenPermission();
      if (!hasPermission) {
        mainWindow?.webContents.send("screen-permission-required");
      }
    }, 1500);
  }
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("open-url", (_event, url) => {
  handleAuthUrl(url);
});

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, commandLine: string[]) => {
    const url = commandLine.find((a) => a.startsWith("echo-desktop://"));
    if (url) handleAuthUrl(url);
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

ipcMain.handle(
  "run-workflow-local",
  async (
    _,
    args: { steps: Array<Record<string, unknown>>; sourceId: string; workflowType?: string }
  ) => {
    const { steps, sourceId, workflowType } = args;
    if (!steps?.length || !sourceId) {
      return { success: false, error: "steps and sourceId required" };
    }
    const progress: string[] = [];
    const result = await runWorkflowLocal(
      steps as unknown as import("@echo/types").Step[],
      {
        sourceId,
        workflowType: (workflowType as import("@echo/types").WorkflowType) ?? "desktop",
        onProgress: (msg, stepNum, thought, action) => {
          progress.push(msg);
          // Push real-time progress to renderer
          if (mainWindow) {
            mainWindow.webContents.send("run-progress", {
              thought: thought || msg,
              action: action || "",
              step: stepNum ?? 0,
            });
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

// ── EchoPrismVoice IPC ────────────────────────────────────────────────────────
let voiceSession: import("./agent/echo-prism-voice").EchoPrismVoiceSession | null = null;

ipcMain.handle("start-voice-chat", async () => {
  try {
    const { EchoPrismVoiceSession } = await import("./agent/echo-prism-voice");
    const token = loadStoredToken() || "";
    voiceSession = new EchoPrismVoiceSession(token, (type, data) => {
      if (!mainWindow) return;
      if (type === "audio") {
        mainWindow.webContents.send("chat-audio", data);
      } else if (type === "text") {
        mainWindow.webContents.send("chat-text", { role: "assistant", text: data });
      }
    });
    await voiceSession.start();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
});

ipcMain.handle("stop-voice-chat", async () => {
  if (voiceSession) {
    await voiceSession.stop();
    voiceSession = null;
  }
  return { ok: true };
});

ipcMain.handle("send-chat-text", async (_, text: string) => {
  if (!voiceSession) return { ok: false, error: "No active voice session" };
  await voiceSession.sendText(text);
  return { ok: true };
});
