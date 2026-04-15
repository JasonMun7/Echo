"use client";

/**
 * Opt-in logging for step context file picks + Firebase uploads.
 *
 * Enable any of:
 * - `localStorage.setItem("ECHO_DEBUG_ATTACH", "1")` then reload
 * - In DevTools console: `window.__ECHO_ATTACH_DEBUG__ = true`
 * - `NEXT_PUBLIC_ECHO_DEBUG_ATTACH=1` in `.env.local` (dev build)
 *
 * Chrome often logs **"A listener indicated an asynchronous response…"** — that comes from a
 * **browser extension** (content/background messaging), not from Echo. Test in a clean profile
 * or disable extensions to confirm.
 */

declare global {
  interface Window {
    __ECHO_ATTACH_DEBUG__?: boolean;
  }
}

function attachDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (window.__ECHO_ATTACH_DEBUG__ === true) return true;
  if (process.env.NEXT_PUBLIC_ECHO_DEBUG_ATTACH === "1") return true;
  try {
    return window.localStorage?.getItem("ECHO_DEBUG_ATTACH") === "1";
  } catch {
    return false;
  }
}

/** Structured attach/upload logs (only when {@link attachDebugEnabled}). */
export function echoAttachDebug(message: string, detail?: Record<string, unknown>): void {
  if (!attachDebugEnabled()) return;
  if (detail && Object.keys(detail).length > 0) {
    console.debug(`[Echo attach] ${message}`, detail);
  } else {
    console.debug(`[Echo attach] ${message}`);
  }
}

export function isEchoAttachDebugEnabled(): boolean {
  return attachDebugEnabled();
}
