import { BrowserWindow, screen, type Display } from "electron";
import { join } from "path";

/**
 * When `1`, `true`, or `yes`: recording/run HUD windows are included in screen capture
 * (Electron content protection off). Default: HUDs are excluded so synthesis recording
 * does not show overlay controls.
 */
function hudVisibleInScreenCapture(): boolean {
  const v = process.env.ECHO_HUD_VISIBLE_IN_SCREEN_CAPTURE?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

const HUD_RECORDING_WIDTH = 375;
const HUD_RECORDING_HEIGHT = 60;
const HUD_RUN_WIDTH = 520;
const HUD_RUN_HEIGHT = 440;
const VOICE_INTERRUPTION_WIDTH = 420;
const VOICE_INTERRUPTION_HEIGHT = 560;

function getRendererUrl(query: string): string {
  if (process.env.NODE_ENV === "development") {
    return `http://localhost:5173?${query}`;
  }
  const htmlPath = join(__dirname, "../renderer/index.html");
  return `file://${htmlPath}?${query}`;
}

/** Display that contains the cursor — use so overlays follow the active Space / monitor. */
export function getDisplayUnderCursor(): Display {
  const point = screen.getCursorScreenPoint();
  return screen.getDisplayNearestPoint(point);
}

function getHudBoundsOnDisplay(
  display: Display,
  isRun: boolean,
): { x: number; y: number; w: number; h: number } {
  const { width: screenWidth, height: screenHeight } = display.bounds;
  const w = isRun ? HUD_RUN_WIDTH : HUD_RECORDING_WIDTH;
  const h = isRun ? HUD_RUN_HEIGHT : HUD_RECORDING_HEIGHT;
  const margin = 24;
  const x = isRun ? Math.floor(screenWidth - w - margin) : Math.floor((screenWidth - w) / 2);
  const y = Math.floor(screenHeight - h - 48);
  return { x, y, w, h };
}

export function createHudOverlayWindow(mode: "recording" | "run"): BrowserWindow {
  const display = getDisplayUnderCursor();
  const isRun = mode === "run";
  const { x, y, w, h } = getHudBoundsOnDisplay(display, isRun);

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
  if (!hudVisibleInScreenCapture()) {
    // Exclude HUD from screen capture so synthesis recording doesn't capture the controls
    // (macOS: NSWindowSharingNone; Windows 10 2004+: WDA_EXCLUDEFROMCAPTURE)
    win.setContentProtection(true);
  }
  win.loadURL(getRendererUrl(`windowType=hud&mode=${mode}`));

  return win;
}

/** Return the display and bounds for positioning the HUD on the display under the cursor. Used by main to move the HUD when the user switches screens. */
export function getHudPositionOnCursorDisplay(mode: "recording" | "run"): {
  display: Display;
  x: number;
  y: number;
  w: number;
  h: number;
} {
  const display = getDisplayUnderCursor();
  const isRun = mode === "run";
  const { x, y, w, h } = getHudBoundsOnDisplay(display, isRun);
  return { display, x, y, w, h };
}

/** Full-screen bounds on the display under the cursor (same as HUD follow target). */
export function getHazeBoundsOnCursorDisplay(): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const { x, y, width, height } = getDisplayUnderCursor().bounds;
  return { x, y, width, height };
}

export function createHazeOverlayWindow(displayId?: number): BrowserWindow {
  const displays = screen.getAllDisplays();
  const display =
    displayId != null && displays[displayId] ? displays[displayId] : getDisplayUnderCursor();
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
