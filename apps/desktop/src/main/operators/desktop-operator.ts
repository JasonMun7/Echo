/**
 * Desktop operator – nut-js + desktopCapturer for EchoPrism (Electron).
 * Screenshots via desktopCapturer; mouse/keyboard via nut-js.
 *
 * DPI/HiDPI-aware: uses logical pixels for mouse movement (nut-js on macOS
 * operates in logical space) and physical pixels for screenshot capture.
 * Adapted from UI-TARS NutJSElectronOperator coordinate pipeline.
 */
import { BrowserWindow, clipboard, desktopCapturer, screen as electronScreen, shell } from "electron";
import { execFile } from "child_process";
import { promisify } from "util";
import {
  mouse,
  keyboard,
  sleep,
  Point,
  Button,
  Key,
} from "@nut-tree-fork/nut-js";

const execFileAsync = promisify(execFile);
import type { OperatorAction } from "@echo/types";

const COORD_SCALE = 1000;

/** Delay in ms between mouse movement and click for OS to settle. */
const MOUSE_MOVE_DELAY_MS = 100;

export type OperatorResult = boolean | "finished" | "calluser";

interface ScreenInfo {
  /** Logical pixels — used for mouse positioning (nut-js). */
  logicalWidth: number;
  logicalHeight: number;
  /** Physical pixels — used for screenshot capture. */
  physicalWidth: number;
  physicalHeight: number;
  /** Device pixel ratio (e.g. 2 on Retina). */
  scaleFactor: number;
}

// Cache screen dimensions at module level — refreshed on first call and cached
let _screenInfo: ScreenInfo | null = null;
function getScreenInfo(): ScreenInfo {
  if (!_screenInfo) {
    const primary = electronScreen.getPrimaryDisplay();
    // On macOS, nut-js operates in screen points (logical pixels) and
    // Electron's NativeImage.toPNG() already returns the physical backing store.
    // Using scaleFactor=1 on macOS matches UI-TARS's proven coordinate pipeline.
    const scaleFactor = process.platform === "darwin" ? 1 : (primary.scaleFactor || 1);
    _screenInfo = {
      logicalWidth: primary.size.width,
      logicalHeight: primary.size.height,
      physicalWidth: Math.round(primary.size.width * scaleFactor),
      physicalHeight: Math.round(primary.size.height * scaleFactor),
      scaleFactor,
    };
    console.log(
      `[desktop-operator] Screen: ${_screenInfo.logicalWidth}x${_screenInfo.logicalHeight} logical, ` +
      `${_screenInfo.physicalWidth}x${_screenInfo.physicalHeight} physical, ` +
      `scaleFactor=${scaleFactor} (platform=${process.platform}, raw=${primary.scaleFactor})`
    );
  }
  return _screenInfo;
}

/** Backwards-compatible: returns logical size for existing callers. */
function getScreenSize(): { width: number; height: number } {
  const info = getScreenInfo();
  return { width: info.logicalWidth, height: info.logicalHeight };
}

/**
 * Scale normalized coordinates (0-1000) to logical screen pixels.
 * nut-js on macOS uses logical coordinates for mouse movement.
 * On Windows/Linux, logical == physical when scaleFactor is 1.
 */
function scaleCoords(x: number, y: number): { x: number; y: number } {
  const { logicalWidth, logicalHeight } = getScreenInfo();
  const wx = Math.round((x * logicalWidth) / COORD_SCALE);
  const wy = Math.round((y * logicalHeight) / COORD_SCALE);
  if (process.env.ECHO_DEBUG_COORDS) {
    console.log(
      `[desktop-operator] scaleCoords: (${x}, ${y}) / 1000 → (${wx}, ${wy}) px ` +
      `(screen ${logicalWidth}x${logicalHeight})`
    );
  }
  return { x: wx, y: wy };
}

/**
 * Capture screenshot at the display's full physical resolution.
 * Uses actual display dimensions × scaleFactor instead of hardcoded 1920×1080.
 * Retries up to 3 times with increasing delays.
 */
export async function captureScreen(sourceId: string): Promise<Buffer> {
  const { logicalWidth, logicalHeight } = getScreenInfo();

  // Hide overlay windows (HUD, haze) so they don't appear in screenshots.
  // The VLM must see only the actual desktop — overlay text confuses verification.
  const overlays = BrowserWindow.getAllWindows().filter(
    (w) => !w.isDestroyed() && w.isAlwaysOnTop()
  );
  for (const w of overlays) w.setOpacity(0);
  if (overlays.length > 0) await sleep(100); // let compositor update

  const attempt = async (): Promise<Buffer | null> => {
    // Use "screen" only (not "window") to ensure we get the full display.
    // Request logical dimensions — on macOS Retina, Electron's NativeImage stores
    // at 2× DPR internally. We resize down to logical before encoding so the
    // image dimensions match the coordinate space used by nut-js (logical pixels).
    // This matches UI-TARS's NutJSElectronOperator.screenshot() approach.
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: logicalWidth, height: logicalHeight },
    });
    const src = sources.find((s) => s.id === sourceId);
    if (!src?.thumbnail) return null;

    // Resize to logical pixels — NativeImage may be 2× on Retina
    const resized = src.thumbnail.resize({ width: logicalWidth, height: logicalHeight });
    const buf = Buffer.from(resized.toJPEG(75));
    if (buf.length < 5000) return null;
    return buf;
  };

  let buf = await attempt();
  if (!buf) {
    await sleep(500);
    buf = await attempt();
  }
  if (!buf) {
    await sleep(1000);
    buf = await attempt();
  }
  if (!buf) {
    // Restore overlays before throwing
    for (const w of overlays) {
      if (!w.isDestroyed()) w.setOpacity(1);
    }
    throw new Error(
      "Screenshot capture failed: blank or missing thumbnail. " +
      "On macOS, grant Screen Recording permission to this app in System Settings → Privacy & Security → Screen Recording, then restart."
    );
  }
  if (process.env.ECHO_DEBUG_COORDS) {
    console.log(
      `[desktop-operator] captureScreen: source=${sourceId}, jpeg=${buf.length} bytes, ` +
      `target=${logicalWidth}x${logicalHeight}`
    );
  }
  // Restore overlay windows after capture
  for (const w of overlays) {
    if (!w.isDestroyed()) w.setOpacity(1);
  }

  // Save debug screenshots to disk when ECHO_DEBUG_SCREENSHOTS is set
  if (process.env.ECHO_DEBUG_SCREENSHOTS) {
    try {
      const fs = require("fs");
      const path = require("path");
      const dir = process.env.ECHO_DEBUG_SCREENSHOTS;
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const ts = Date.now();
      fs.writeFileSync(path.join(dir, `screenshot-${ts}.jpg`), buf);
      console.log(`[desktop-operator] Saved debug screenshot: screenshot-${ts}.jpg`);
    } catch (e) {
      console.warn("[desktop-operator] Failed to save debug screenshot:", e);
    }
  }
  return buf;
}

/**
 * Move mouse to (x, y), wait for OS to settle, then left-click.
 * The 100ms delay prevents race conditions where click registers before
 * the OS finishes processing the mouse movement.
 */
export async function click(x: number, y: number): Promise<void> {
  const { x: wx, y: wy } = scaleCoords(x, y);
  console.log(`[desktop-operator] click: norm=(${x}, ${y}) → pixel=(${wx}, ${wy})`);
  await mouse.setPosition(new Point(wx, wy));
  await sleep(MOUSE_MOVE_DELAY_MS);
  await mouse.leftClick();
}

/**
 * Double-click at (x, y) with precision delay.
 * Uses standard OS double-click — nut-js sends two rapid clicks
 * which macOS recognises as a double-click even if the window
 * needs activation (the first of the pair activates it and the
 * pair is still treated as a double-click by the OS).
 */
export async function doubleClick(x: number, y: number): Promise<void> {
  const { x: wx, y: wy } = scaleCoords(x, y);
  console.log(`[desktop-operator] doubleClick: norm=(${x}, ${y}) → pixel=(${wx}, ${wy})`);
  await mouse.setPosition(new Point(wx, wy));
  await sleep(MOUSE_MOVE_DELAY_MS);
  await mouse.doubleClick(Button.LEFT);
}

/**
 * Right-click at (x, y) with precision delay.
 */
export async function rightClick(x: number, y: number): Promise<void> {
  const { x: wx, y: wy } = scaleCoords(x, y);
  await mouse.setPosition(new Point(wx, wy));
  await sleep(MOUSE_MOVE_DELAY_MS);
  await mouse.rightClick();
}

/**
 * Type text via keyboard.
 * On Windows, uses clipboard + Ctrl+V for reliability (avoids character loss).
 * On macOS/Linux, uses direct keyboard.type().
 */
export async function typeText(text: string): Promise<void> {
  if (process.platform === "win32" && text.length > 1) {
    clipboard.writeText(text);
    await keyboard.pressKey(Key.LeftControl);
    await keyboard.pressKey(Key.V);
    await keyboard.releaseKey(Key.V);
    await keyboard.releaseKey(Key.LeftControl);
    await sleep(50);
  } else {
    await keyboard.type(text);
  }
}

/**
 * Press a single key and release it.
 */
export async function pressKey(keyName: string): Promise<void> {
  const key = mapKeyName(keyName);
  await keyboard.pressKey(key);
  await keyboard.releaseKey(key);
}

function mapKeyName(name: string): Key {
  const k = name.toUpperCase().replace(/\s+/g, "_").replace(/-/g, "_");
  const map: Record<string, Key> = {
    ENTER: Key.Return,
    RETURN: Key.Return,
    TAB: Key.Tab,
    ESC: Key.Escape,
    ESCAPE: Key.Escape,
    BACKSPACE: Key.Backspace,
    DELETE: Key.Delete,
    SPACE: Key.Space,
    UP: Key.Up,
    DOWN: Key.Down,
    LEFT: Key.Left,
    RIGHT: Key.Right,
    PAGEUP: Key.PageUp,
    PAGE_UP: Key.PageUp,
    PAGEDOWN: Key.PageDown,
    PAGE_DOWN: Key.PageDown,
    HOME: Key.Home,
    END: Key.End,
    // Modifier keys
    CMD: Key.LeftSuper,
    COMMAND: Key.LeftSuper,
    META: Key.LeftSuper,
    CTRL: Key.LeftControl,
    CONTROL: Key.LeftControl,
    ALT: Key.LeftAlt,
    OPTION: Key.LeftAlt,
    SHIFT: Key.LeftShift,
    // Function keys
    F1: Key.F1,
    F2: Key.F2,
    F3: Key.F3,
    F4: Key.F4,
    F5: Key.F5,
    F6: Key.F6,
    F7: Key.F7,
    F8: Key.F8,
    F9: Key.F9,
    F10: Key.F10,
    F11: Key.F11,
    F12: Key.F12,
  };
  return (map[k] as Key) ?? Key.Return;
}

/**
 * Scroll at (x, y) in the given direction. Distance in pixels (converted to scroll steps).
 */
export async function scroll(
  x: number,
  y: number,
  direction: string,
  distance: number = 300
): Promise<void> {
  const { x: wx, y: wy } = scaleCoords(x, y);
  await mouse.setPosition(new Point(wx, wy));
  // Convert pixel distance to scroll steps (approximately 100px per step)
  const steps = Math.min(Math.max(1, Math.round(distance / 100)), 20);
  const dir = direction.toLowerCase();
  if (dir === "down") {
    await mouse.scrollDown(steps);
  } else if (dir === "up") {
    await mouse.scrollUp(steps);
  } else if (dir === "left") {
    await mouse.scrollLeft(steps);
  } else if (dir === "right") {
    await mouse.scrollRight(steps);
  } else {
    await mouse.scrollDown(steps);
  }
}

/**
 * Wait for the given number of seconds.
 */
export async function wait(seconds: number): Promise<void> {
  const ms = Math.min(Math.max(1, seconds), 30) * 1000;
  await sleep(ms);
}

/**
 * Press a hotkey combination e.g. ["cmd", "c"].
 */
export async function hotkey(keys: string[]): Promise<void> {
  const mapped = keys.map(mapKeyName);
  await keyboard.pressKey(...mapped);
  await keyboard.releaseKey(...mapped);
}

/**
 * Open an application by name (macOS: `open -a <AppName>`).
 * Tries exact name first, then fuzzy-matches in /Applications.
 */
export async function openApp(appName: string): Promise<void> {
  if (process.platform === "darwin") {
    try {
      await execFileAsync("open", ["-a", appName]);
      return;
    } catch (e) {
      console.warn(`[desktop-operator] open -a "${appName}" failed, trying fuzzy match:`, e);
    }
    // Fuzzy: search /Applications for partial match
    try {
      const { stdout } = await execFileAsync("find", [
        "/Applications",
        "-maxdepth", "2",
        "-name", `*${appName}*.app`,
        "-type", "d",
      ]);
      const matches = stdout.trim().split("\n").filter(Boolean);
      if (matches.length > 0) {
        console.log(`[desktop-operator] Fuzzy match found: ${matches[0]}`);
        await execFileAsync("open", [matches[0]]);
        return;
      }
    } catch { /* ignore */ }
    // Last resort: try with "IntelliJ IDEA CE" / "IntelliJ IDEA Ultimate" variants
    const lower = appName.toLowerCase();
    if (lower.includes("intellij")) {
      for (const variant of ["IntelliJ IDEA CE", "IntelliJ IDEA Ultimate", "IntelliJ IDEA"]) {
        try {
          await execFileAsync("open", ["-a", variant]);
          console.log(`[desktop-operator] Opened IntelliJ variant: ${variant}`);
          return;
        } catch { /* try next */ }
      }
    }
    // If all else fails, try AppleScript activate
    try {
      const script = `tell application "${appName}" to activate`;
      await execFileAsync("osascript", ["-e", script]);
      return;
    } catch (e2) {
      console.error(`[desktop-operator] All openApp attempts failed for "${appName}":`, e2);
      throw e2;
    }
  } else {
    await shell.openExternal(`file:///Applications/${appName}.app`);
  }
}

/**
 * Bring an application to the foreground (macOS: AppleScript).
 * Falls back to `open -a` if AppleScript fails.
 */
export async function focusApp(appName: string): Promise<void> {
  if (process.platform === "darwin") {
    try {
      const script = `tell application "${appName}" to activate`;
      await execFileAsync("osascript", ["-e", script]);
    } catch (e) {
      console.warn(`[desktop-operator] focusApp AppleScript failed for "${appName}", trying open -a:`, e);
      await openApp(appName);
    }
  }
}

/**
 * Execute an operator action (parsed from EchoPrism).
 * Returns:
 *   "finished"  — agent declared task complete
 *   "calluser"  — agent needs human intervention
 *   true        — action succeeded
 *   false       — action failed
 */
export async function execute(action: OperatorAction): Promise<OperatorResult> {
  try {
    const act = (action.action || "").toLowerCase();

    // Terminal signals — propagate as string sentinels (do NOT swallow as true)
    if (act === "finished") return "finished";
    if (act === "calluser") return "calluser";

    if (act === "click") {
      await click(Number(action.x ?? 0), Number(action.y ?? 0));
    } else if (act === "rightclick") {
      await rightClick(Number(action.x ?? 0), Number(action.y ?? 0));
    } else if (act === "doubleclick") {
      await doubleClick(Number(action.x ?? 0), Number(action.y ?? 0));
    } else if (act === "clickandtype") {
      await click(Number(action.x ?? 0), Number(action.y ?? 0));
      await sleep(200);
      // Select all existing text before typing to replace (not append)
      if (process.platform === "darwin") {
        await hotkey(["cmd", "a"]);
      } else {
        await hotkey(["ctrl", "a"]);
      }
      await sleep(100);
      await typeText(String(action.content ?? ""));
    } else if (act === "drag") {
      const { x: wx1, y: wy1 } = scaleCoords(Number(action.x1 ?? 0), Number(action.y1 ?? 0));
      const { x: wx2, y: wy2 } = scaleCoords(Number(action.x2 ?? 0), Number(action.y2 ?? 0));
      // Smooth drag: move to start, press, interpolate through midpoints, release
      await mouse.setPosition(new Point(wx1, wy1));
      await sleep(MOUSE_MOVE_DELAY_MS);
      await mouse.pressButton(Button.LEFT);
      await sleep(100);
      // Interpolate 5 intermediate points for smooth path
      const DRAG_STEPS = 5;
      for (let i = 1; i <= DRAG_STEPS; i++) {
        const t = i / DRAG_STEPS;
        const ix = Math.round(wx1 + (wx2 - wx1) * t);
        const iy = Math.round(wy1 + (wy2 - wy1) * t);
        await mouse.setPosition(new Point(ix, iy));
        await sleep(50);
      }
      await sleep(100);
      await mouse.releaseButton(Button.LEFT);
    } else if (act === "type") {
      await typeText(String(action.content ?? ""));
    } else if (act === "hotkey") {
      const keys = Array.isArray(action.keys) ? (action.keys as string[]) : [];
      if (!keys.length) return false;
      await hotkey(keys);
    } else if (act === "wait") {
      await wait(Number(action.seconds ?? 1));
    } else if (act === "presskey") {
      await pressKey(String(action.key ?? "enter"));
    } else if (act === "scroll") {
      const distance = Number((action as Record<string, unknown>).distance ?? action.amount ?? 300);
      await scroll(Number(action.x ?? 500), Number(action.y ?? 500), String(action.direction ?? "down"), distance);
    } else if (act === "navigate") {
      await shell.openExternal(String(action.url ?? "https://www.google.com"));
    } else if (act === "openapp") {
      await openApp(String(action.appName ?? ""));
      // Wait for app to launch and render
      await sleep(2000);
    } else if (act === "focusapp") {
      await focusApp(String(action.appName ?? ""));
      await sleep(1000);
    } else {
      console.warn("[desktop-operator] Unknown action:", act);
      return false;
    }
    return true;
  } catch (e) {
    console.error("Desktop operator execute failed:", e);
    return false;
  }
}
