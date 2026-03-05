import { BrowserWindow, screen } from "electron";
import { join } from "path";

const HUD_RECORDING_WIDTH = 500;
const HUD_RECORDING_HEIGHT = 120;
const HUD_RUN_WIDTH = 420;
const HUD_RUN_HEIGHT = 320;

function getRendererUrl(query: string): string {
  if (process.env.NODE_ENV === "development") {
    return `http://localhost:5173?${query}`;
  }
  const htmlPath = join(__dirname, "../renderer/index.html");
  return `file://${htmlPath}?${query}`;
}

export function createHudOverlayWindow(mode: "recording" | "run"): BrowserWindow {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.bounds;

  const isRun = mode === "run";
  const w = isRun ? HUD_RUN_WIDTH : HUD_RECORDING_WIDTH;
  const h = isRun ? HUD_RUN_HEIGHT : HUD_RECORDING_HEIGHT;

  const x = Math.floor((screenWidth - w) / 2);
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
  const display = displayId != null && displays[displayId]
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
