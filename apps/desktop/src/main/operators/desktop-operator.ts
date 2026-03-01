/**
 * Desktop operator – nut-js + desktopCapturer for EchoPrism (Electron).
 * Screenshots via desktopCapturer; mouse/keyboard via nut-js.
 */
import { desktopCapturer, screen as electronScreen, shell } from "electron";
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

export type OperatorResult = boolean | "finished" | "calluser";

// Cache screen dimensions at module level — refreshed on first call and cached
let _screenSize: { width: number; height: number } | null = null;
function getScreenSize(): { width: number; height: number } {
  if (!_screenSize) {
    const primary = electronScreen.getPrimaryDisplay();
    _screenSize = { width: primary.size.width, height: primary.size.height };
  }
  return _screenSize;
}

/**
 * Scale normalized coordinates (0-1000) to actual screen pixels.
 */
function scaleCoords(x: number, y: number): { x: number; y: number } {
  const { width, height } = getScreenSize();
  const wx = Math.round((x * width) / COORD_SCALE);
  const wy = Math.round((y * height) / COORD_SCALE);
  return { x: wx, y: wy };
}

/**
 * Capture screenshot of a specific source (screen or window).
 * Retries up to 3 times with increasing delays.
 */
export async function captureScreen(sourceId: string): Promise<Buffer> {
  const attempt = async (): Promise<Buffer | null> => {
    const sources = await desktopCapturer.getSources({
      types: ["screen", "window"],
      thumbnailSize: { width: 1920, height: 1080 },
    });
    const src = sources.find((s) => s.id === sourceId);
    if (!src?.thumbnail) return null;
    const buf = Buffer.from(src.thumbnail.toPNG());
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
    throw new Error(
      "Screenshot capture failed: blank or missing thumbnail. " +
      "On macOS, grant Screen Recording permission to this app in System Settings → Privacy & Security → Screen Recording, then restart."
    );
  }
  return buf;
}

/**
 * Move mouse to (x, y) and left-click. Coords in 0-1000 space.
 */
export async function click(x: number, y: number): Promise<void> {
  const { x: wx, y: wy } = scaleCoords(x, y);
  await mouse.setPosition(new Point(wx, wy));
  await mouse.leftClick();
}

/**
 * Double-click at (x, y).
 */
export async function doubleClick(x: number, y: number): Promise<void> {
  const { x: wx, y: wy } = scaleCoords(x, y);
  await mouse.setPosition(new Point(wx, wy));
  await mouse.doubleClick(Button.LEFT);
}

/**
 * Right-click at (x, y).
 */
export async function rightClick(x: number, y: number): Promise<void> {
  const { x: wx, y: wy } = scaleCoords(x, y);
  await mouse.setPosition(new Point(wx, wy));
  await mouse.rightClick();
}

/**
 * Type text via keyboard.
 */
export async function typeText(text: string): Promise<void> {
  await keyboard.type(text);
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
 */
export async function openApp(appName: string): Promise<void> {
  if (process.platform === "darwin") {
    await execFileAsync("open", ["-a", appName]);
  } else {
    await shell.openExternal(`file:///Applications/${appName}.app`);
  }
}

/**
 * Bring an application to the foreground (macOS: AppleScript).
 */
export async function focusApp(appName: string): Promise<void> {
  if (process.platform === "darwin") {
    const script = `tell application "${appName}" to activate`;
    await execFileAsync("osascript", ["-e", script]);
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
    } else if (act === "drag") {
      const { x: wx1, y: wy1 } = scaleCoords(Number(action.x1 ?? 0), Number(action.y1 ?? 0));
      const { x: wx2, y: wy2 } = scaleCoords(Number(action.x2 ?? 0), Number(action.y2 ?? 0));
      await mouse.setPosition(new Point(wx1, wy1));
      await mouse.pressButton(Button.LEFT);
      await sleep(80);
      await mouse.setPosition(new Point(wx2, wy2));
      await sleep(80);
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
    } else if (act === "focusapp") {
      await focusApp(String(action.appName ?? ""));
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
