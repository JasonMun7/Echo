/**
 * Parse EchoPrism Action: <action>(<params>) output to operator-agnostic dict.
 * Example: "Action: Click(500, 300)" -> {"action": "click", "x": 500, "y": 300}
 *
 * Scans line-by-line and matches the FIRST valid Action: line.
 */

import type { OperatorAction } from "@echo/types";

const HOTKEY_ALIASES: Record<string, string> = {
  command: "cmd",
  meta: "cmd",
  control: "ctrl",
  option: "alt",
};

function normalizeHotkeyKey(key: string): string {
  const lower = key.toLowerCase();
  return HOTKEY_ALIASES[lower] ?? lower;
}

function parseCoords(s: string, count: number): number[] | null {
  const parts = s.match(/-?\d+(?:\.\d+)?/g);
  if (parts && parts.length >= count) {
    const nums = parts.slice(0, count).map((p) => Math.round(parseFloat(p)));
    if (nums.every((n) => !Number.isNaN(n))) return nums;
  }
  return null;
}

function extractQuoted(s: string): string {
  if (s.length < 2) return s;
  const quote = s[0];
  if (quote !== '"' && quote !== "'") return s;
  const end = s.lastIndexOf(quote);
  if (end > 0) {
    const inner = s.slice(1, end);
    // Replace all escaped quotes globally
    return inner.replace(new RegExp(`\\\\${quote}`, "g"), quote);
  }
  return s.slice(1);
}

/**
 * Extract the Thought (or Reflection / Action_Summary) from model output.
 * Scans line-by-line so it correctly finds the first thought line.
 */
export function extractThought(text: string): string {
  for (const line of text.split("\n")) {
    const stripped = line.trim();
    for (const prefix of ["Thought:", "Reflection:", "Action_Summary:"]) {
      if (stripped.toLowerCase().startsWith(prefix.toLowerCase())) {
        return stripped.slice(prefix.length).trim();
      }
    }
  }
  const m = text.match(/(?:Thought|Reflection|Action_Summary):\s*(.+?)(?=\nAction:|$)/is);
  return m ? m[1].trim() : "";
}

export function parseAction(text: string | null | undefined): OperatorAction | null {
  if (!text || typeof text !== "string") return null;

  // Scan line-by-line to find the FIRST Action: line
  let actionLine: string | null = null;
  for (const line of text.split("\n")) {
    if (/^(Action|action):/.test(line.trim())) {
      actionLine = line.trim();
      break;
    }
  }
  if (!actionLine) return null;

  const m1 = actionLine.match(/Action:\s*(\w+)\s*\((.*?)\)\s*\.?\s*$/is);
  const m2 = actionLine.match(/Action:\s*(\w+)\s*\((.*?)\)/i);
  const m = m1 ?? m2;
  if (!m) return null;

  const name = m[1].trim().toLowerCase();
  const argsStr = m[2].trim();
  const result: OperatorAction = { action: name };

  if (name === "click" || name === "rightclick" || name === "doubleclick" || name === "hover") {
    const coords = parseCoords(argsStr, 2);
    if (coords) {
      result.x = coords[0];
      result.y = coords[1];
    }
  } else if (name === "drag") {
    const coords = parseCoords(argsStr, 4);
    if (coords) {
      result.x1 = coords[0];
      result.y1 = coords[1];
      result.x2 = coords[2];
      result.y2 = coords[3];
    }
  } else if (name === "scroll") {
    // Support named-arg form: Scroll(x=400, y=600, direction="down", distance=300)
    const namedX = argsStr.match(/\bx\s*=\s*(-?\d+)/i);
    const namedY = argsStr.match(/\by\s*=\s*(-?\d+)/i);
    const namedDir = argsStr.match(/\bdirection\s*=\s*["']?(\w+)["']?/i);
    const namedDist = argsStr.match(/\bdistance\s*=\s*(-?\d+)/i);
    if (namedX && namedY) {
      result.x = parseInt(namedX[1], 10);
      result.y = parseInt(namedY[1], 10);
      result.direction = namedDir ? namedDir[1].toLowerCase() : "down";
      if (namedDist) (result as Record<string, unknown>).distance = parseInt(namedDist[1], 10);
    } else {
      const parts = argsStr.split(",").map((p) => p.trim().replace(/^["']|["']$/g, ""));
      if (parts.length >= 3) {
        const x = parseFloat(parts[0]);
        const y = parseFloat(parts[1]);
        if (!Number.isNaN(x) && !Number.isNaN(y)) {
          result.x = Math.round(x);
          result.y = Math.round(y);
          result.direction = parts[2].toLowerCase();
          if (parts.length >= 4) {
            const dist = parseFloat(parts[3]);
            if (!Number.isNaN(dist)) (result as Record<string, unknown>).distance = Math.round(dist);
          }
        }
      }
    }
  } else if (name === "type") {
    const content =
      argsStr.startsWith('"') || argsStr.startsWith("'")
        ? extractQuoted(argsStr)
        : argsStr.trim();
    result.content = content || argsStr;
  } else if (name === "hotkey") {
    const keys = argsStr
      .split(",")
      .map((p) => normalizeHotkeyKey(p.trim().replace(/^["']|["']$/g, "")))
      .filter(Boolean);
    result.keys = keys;
  } else if (name === "wait") {
    const n = parseFloat(argsStr.trim());
    result.seconds = Number.isNaN(n) ? 1 : Math.max(1, Math.min(Math.round(n), 30));
  } else if (name === "presskey") {
    const key =
      argsStr.startsWith('"') || argsStr.startsWith("'")
        ? extractQuoted(argsStr)
        : argsStr.trim();
    result.key = key || "enter";
  } else if (name === "navigate") {
    const url =
      argsStr.startsWith('"') || argsStr.startsWith("'")
        ? extractQuoted(argsStr)
        : argsStr.trim();
    if (!url) return null; // Empty URL is not valid
    result.url = url;
  } else if (name === "selectoption") {
    const parts = argsStr.split(",").map((p) => p.trim().replace(/^["']|["']$/g, ""));
    if (parts.length >= 3) {
      // Positional with coords: SelectOption(x, y, value)
      const x = parseFloat(parts[0]);
      const y = parseFloat(parts[1]);
      if (!Number.isNaN(x) && !Number.isNaN(y)) {
        result.x = Math.round(x);
        result.y = Math.round(y);
        result.value = parts[2];
      }
    } else if (parts.length >= 2) {
      result.selector = parts[0];
      result.value = parts[1];
    }
  } else if (name === "waitforelement") {
    const desc =
      argsStr.startsWith('"') || argsStr.startsWith("'")
        ? extractQuoted(argsStr)
        : argsStr.trim();
    result.selector = desc;
  } else if (name === "openapp" || name === "focusapp") {
    const appName =
      argsStr.startsWith('"') || argsStr.startsWith("'")
        ? extractQuoted(argsStr)
        : argsStr.trim();
    result.appName = appName;
  } else if (name === "finished" || name === "calluser") {
    // Extract optional reason
    const reason =
      argsStr.startsWith('"') || argsStr.startsWith("'")
        ? extractQuoted(argsStr)
        : argsStr.trim();
    if (reason) (result as Record<string, unknown>).reason = reason;
  }

  return result.action ? result : null;
}
