import { BrowserWindow, screen } from "electron";
import { join } from "path";

const HUD_RECORDING_WIDTH = 375;
const HUD_RECORDING_HEIGHT = 60;
const HUD_RUN_WIDTH = 420;
const HUD_RUN_HEIGHT = 320;
const VOICE_INTERRUPTION_WIDTH = 420;
const VOICE_INTERRUPTION_HEIGHT = 560;

function getRendererUrl(query: string): string {
  if (process.env.NODE_ENV === "development") {
    return `http://localhost:5173?${query}`;
  }
  const htmlPath = join(__dirname, "../renderer/index.html");
  return `file://${htmlPath}?${query}`;
}

export function createHudOverlayWindow(
  mode: "recording" | "run",
): BrowserWindow {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.bounds;

  const isRun = mode === "run";
  const w = isRun ? HUD_RUN_WIDTH : HUD_RECORDING_WIDTH;
  const h = isRun ? HUD_RUN_HEIGHT : HUD_RECORDING_HEIGHT;

  const margin = 24;
  const x = isRun
    ? Math.floor(screenWidth - w - margin)
    : Math.floor((screenWidth - w) / 2);
  const y = Math.floor(screenHeight - h - 48);

  const win = new BrowserWindow({
    width: w,
    height: h,
    x,
    y,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.setBackgroundColor("#00000000");
  win.loadURL(getRendererUrl(`windowType=hud&mode=${mode}`));

  return win;
}

export function createHazeOverlayWindow(displayId?: number): BrowserWindow {
  const displays = screen.getAllDisplays();
  const display =
    displayId != null && displays[displayId]
      ? displays[displayId]
      : screen.getPrimaryDisplay();
  const { x, y, width, height } = display.bounds;

  const win = new BrowserWindow({
    x,
    y,
    width,
    height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    enableLargerThanScreen: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.setBackgroundColor("#00000000");
  win.loadURL(getRendererUrl("windowType=haze"));

  win.webContents.on("did-finish-load", () => {
    // Forward mouse events so user can interact with desktop/apps through the purple border
    win.setIgnoreMouseEvents(true, { forward: true });
  });

  return win;
}

export function createVoiceInterruptionWindow(workflowId: string, runId: string): BrowserWindow {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.bounds;

  const x = Math.floor((screenWidth - VOICE_INTERRUPTION_WIDTH) / 2);
  const y = Math.floor((screenHeight - VOICE_INTERRUPTION_HEIGHT) / 2);

  const win = new BrowserWindow({
    width: VOICE_INTERRUPTION_WIDTH,
    height: VOICE_INTERRUPTION_HEIGHT,
    x,
    y,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.setBackgroundColor("#00000000");
  const query = `windowType=voice-interruption&workflowId=${encodeURIComponent(workflowId)}&runId=${encodeURIComponent(runId)}`;
  win.loadURL(getRendererUrl(query));

  return win;
}
