/**
 * Unified operator – routes actions to NutJS (desktop) or Playwright (browser) per step.
 * Agent can mix both: e.g. navigate (Playwright) → click/type (Playwright) → openapp (NutJS).
 *
 * Routing logic:
 * - navigate, waitforelement, selectoption, hover → Playwright (browser)
 * - openapp, focusapp → NutJS (desktop only)
 * - click, type, scroll, wait, etc. → Playwright if we have an active browser page; else NutJS
 */
import { chromium, type Browser, type Page } from "playwright";
import * as desktop from "./desktop-operator";
import type { OperatorAction } from "@echo/types";

export type OperatorResult = boolean | "finished" | "calluser";

const COORD_SCALE = 1000;
const BROWSER_ONLY_ACTIONS = new Set([
  "navigate",
  "waitforelement",
  "selectoption",
  "hover",
]);
const DESKTOP_ONLY_ACTIONS = new Set(["openapp", "focusapp"]);

let browser: Browser | null = null;
let page: Page | null = null;

function hasBrowserContext(): boolean {
  return page != null && !page.isClosed();
}

/** Launch browser and create a page if not already running. */
async function ensureBrowserPage(): Promise<Page> {
  if (page && !page.isClosed()) return page;
  if (browser && !browser.contexts().length) {
    page = await browser.newPage();
    return page;
  }
  browser = await chromium.launch({
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  return page;
}

/** Close browser and clear context (call when switching to desktop). */
async function closeBrowser(): Promise<void> {
  try {
    if (page && !page.isClosed()) await page.close();
  } catch { /* ignore */ }
  page = null;
  try {
    if (browser) await browser.close();
  } catch { /* ignore */ }
  browser = null;
}

/** Scale normalized 0-1000 coords to viewport pixels. */
function scaleToViewport(x: number, y: number, viewport: { width: number; height: number }) {
  return {
    x: Math.round((x * viewport.width) / COORD_SCALE),
    y: Math.round((y * viewport.height) / COORD_SCALE),
  };
}

/** Execute action via Playwright (browser). */
async function executePlaywright(action: OperatorAction): Promise<OperatorResult> {
  const act = (action.action || "").toLowerCase().replace(/_/g, "");

  if (act === "finished") return "finished";
  if (act === "calluser") return "calluser";

  const p = await ensureBrowserPage();
  const vp = p.viewportSize() ?? { width: 1280, height: 900 };

  try {
    if (act === "navigate") {
      const url = String(action.url ?? "https://www.google.com");
      await p.goto(url, { timeout: 15000, waitUntil: "domcontentloaded" });
      return true;
    }

    if (act === "click") {
      const { x, y } = scaleToViewport(Number(action.x ?? 500), Number(action.y ?? 500), vp);
      await p.mouse.click(x, y);
    } else if (act === "rightclick") {
      const { x, y } = scaleToViewport(Number(action.x ?? 500), Number(action.y ?? 500), vp);
      await p.mouse.click(x, y, { button: "right" });
    } else if (act === "doubleclick") {
      const { x, y } = scaleToViewport(Number(action.x ?? 500), Number(action.y ?? 500), vp);
      await p.mouse.dblclick(x, y);
    } else if (act === "drag") {
      const x1 = scaleToViewport(Number(action.x1 ?? 0), Number(action.y1 ?? 0), vp);
      const x2 = scaleToViewport(Number(action.x2 ?? 0), Number(action.y2 ?? 0), vp);
      await p.mouse.move(x1.x, x1.y);
      await p.mouse.down();
      await p.mouse.move(x2.x, x2.y);
      await p.mouse.up();
    } else if (act === "type") {
      await p.keyboard.type(String(action.content ?? ""));
    } else if (act === "hotkey") {
      const keys = Array.isArray(action.keys) ? (action.keys as string[]) : [];
      if (keys.length) {
        for (let i = 0; i < keys.length - 1; i++) await p.keyboard.down(keys[i]);
        await p.keyboard.press(keys[keys.length - 1] ?? "Enter");
        for (let i = keys.length - 2; i >= 0; i--) await p.keyboard.up(keys[i]);
      } else return false;
    } else if (act === "wait") {
      const secs = Math.min(Math.max(1, Number(action.seconds ?? 1)), 30);
      await new Promise((r) => setTimeout(r, secs * 1000));
    } else if (act === "presskey") {
      await p.keyboard.press(String(action.key ?? "Enter"));
    } else if (act === "scroll") {
      const direction = String(action.direction ?? "down").toLowerCase();
      const distance = Number((action as Record<string, unknown>).distance ?? action.amount ?? 300);
      const x = scaleToViewport(Number(action.x ?? 500), Number(action.y ?? 500), vp);
      await p.mouse.move(x.x, x.y);
      const dy = direction === "down" ? distance : direction === "up" ? -distance : 0;
      const dx = direction === "right" ? distance : direction === "left" ? -distance : 0;
      await p.mouse.wheel(dx, dy);
    } else if (act === "hover") {
      const { x, y } = scaleToViewport(Number(action.x ?? 500), Number(action.y ?? 500), vp);
      await p.mouse.move(x, y);
    } else if (act === "waitforelement") {
      try {
        await p.waitForLoadState("domcontentloaded", { timeout: 10000 });
      } catch { /* ignore */ }
      try {
        await p.waitForLoadState("networkidle", { timeout: 5000 });
      } catch { /* ignore */ }
      await new Promise((r) => setTimeout(r, 500));
    } else if (act === "selectoption") {
      const value = String(action.value ?? "");
      if (!value) return false;
      const x = action.x;
      const y = action.y;
      if (x != null && y != null) {
        const { x: wx, y: wy } = scaleToViewport(Number(x), Number(y), vp);
        await p.mouse.click(wx, wy);
        await new Promise((r) => setTimeout(r, 300));
        await p.evaluate(
          (v) => {
            const el = document.activeElement as HTMLSelectElement | null;
            if (el?.tagName === "SELECT") {
              el.value = v;
              el.dispatchEvent(new Event("change", { bubbles: true }));
            }
          },
          value
        );
      } else {
        const sel = action.selector ?? (action as Record<string, unknown>).selector;
        if (sel) await p.selectOption(String(sel), value);
        else return false;
      }
    } else {
      console.warn("[unified-operator] Unknown Playwright action:", act);
      return false;
    }

    try {
      await p.waitForLoadState("domcontentloaded", { timeout: 5000 });
      await new Promise((r) => setTimeout(r, 500));
    } catch { /* ignore */ }
    return true;
  } catch (e) {
    console.error("[unified-operator] Playwright execute failed:", e);
    return false;
  }
}

/** Capture screenshot. Uses Playwright page if in browser context; else desktop capture. */
export async function captureScreen(sourceId: string): Promise<Buffer> {
  if (hasBrowserContext() && page && !page.isClosed()) {
    try {
      const buf = await page.screenshot({ type: "png" });
      return Buffer.isBuffer(buf) ? buf : Buffer.from(buf as ArrayBuffer);
    } catch (e) {
      console.warn("[unified-operator] Playwright screenshot failed, falling back to desktop:", e);
    }
  }
  return desktop.captureScreen(sourceId);
}

/** Execute action — route to Playwright or NutJS based on action type and context. */
export async function execute(action: OperatorAction): Promise<OperatorResult> {
  const act = (action.action || "").toLowerCase().replace(/_/g, "");

  if (act === "finished") return "finished";
  if (act === "calluser") return "calluser";

  if (DESKTOP_ONLY_ACTIONS.has(act)) {
    await closeBrowser();
    return desktop.execute(action);
  }

  if (BROWSER_ONLY_ACTIONS.has(act)) {
    return executePlaywright(action);
  }

  if (hasBrowserContext()) {
    return executePlaywright(action);
  }

  return desktop.execute(action);
}
