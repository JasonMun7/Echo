import type { TablerIcon } from "@tabler/icons-react";
import {
  IconApi,
  IconAppWindow,
  IconArrowsVertical,
  IconBolt,
  IconCircleCheck,
  IconClick,
  IconCommand,
  IconDragDrop,
  IconEyeSearch,
  IconFocus2,
  IconHandClick,
  IconHourglass,
  IconKeyboard,
  IconMenu2,
  IconMouse2,
  IconSelector,
  IconTypography,
  IconUserQuestion,
  IconWorldWww,
} from "@tabler/icons-react";

/** Strip workflow step names when a detailed operator line exists for the same step. */
export function dedupeHudActions(actions: string[]): string[] {
  const trimmed = actions.map((a) => a.trim()).filter(Boolean);
  if (trimmed.length <= 1) return trimmed;

  const anyMatch = (patterns: RegExp[]) =>
    trimmed.some((a) => patterns.some((p) => p.test(a)));

  const out: string[] = [];
  for (const a of trimmed) {
    if (
      /^click_at$/i.test(a) &&
      anyMatch([/click\s*\(/i])
    ) {
      continue;
    }
    if (
      /^double_click$/i.test(a) &&
      anyMatch([/double_?click\s*\(/i])
    ) {
      continue;
    }
    if (
      /^right_click$/i.test(a) &&
      anyMatch([/right_?click\s*\(/i])
    ) {
      continue;
    }
    if (
      /^type_text_at$/i.test(a) &&
      anyMatch([/(type|click_?and_?type)\s*\(/i])
    ) {
      continue;
    }
    if (/^scroll$/i.test(a) && anyMatch([/scroll\s*\(/i])) continue;
    if (/^hover$/i.test(a) && anyMatch([/hover\s*\(/i])) continue;
    if (/^wait$/i.test(a) && anyMatch([/wait\s*\(/i])) continue;
    if (/^drag$/i.test(a) && anyMatch([/drag\s*\(/i])) continue;
    if (
      /^press_key$/i.test(a) &&
      anyMatch([/(hotkey|press_?key)\s*\(/i])
    ) {
      continue;
    }
    if (
      /^select_option$/i.test(a) &&
      anyMatch([/select_?option\s*\(/i])
    ) {
      continue;
    }
    if (/^wait_for_element$/i.test(a) && anyMatch([/wait_?for_?element\s*\(/i]))
      continue;
    if (/^navigate$/i.test(a) && anyMatch([/navigate\s*\(/i])) continue;
    if (/^open_app$/i.test(a) && anyMatch([/open_?app\s*\(/i])) continue;
    if (/^focus_app$/i.test(a) && anyMatch([/focus_?app\s*\(/i])) continue;
    if (/^api_call$/i.test(a) && anyMatch([/api_?call\s*\(/i])) continue;
    out.push(a);
  }
  return out;
}

function splitActionCall(s: string): { name: string; inner: string } | null {
  const t = s.trim();
  const open = t.indexOf("(");
  const close = t.lastIndexOf(")");
  if (open === -1 || close <= open) return null;
  const name = t.slice(0, open).trim();
  const inner = t.slice(open + 1, close).trim();
  if (!/^[a-zA-Z_][\w]*$/.test(name)) return null;
  return { name, inner };
}

function normOp(name: string): string {
  return name.toLowerCase().replace(/_/g, "");
}

export interface HudActionDisplay {
  summary: string;
  Icon: TablerIcon;
}

/** Map raw progress action strings to a short human label + icon. */
export function formatHudAction(raw: string): HudActionDisplay {
  const s = raw.trim();
  if (!s) return { summary: "Action", Icon: IconBolt };

  const call = splitActionCall(s);
  if (call) {
    const op = normOp(call.name);
    const inner = call.inner;

    switch (op) {
      case "click":
      case "clickat":
        return {
          summary: `Click at (${inner})`,
          Icon: IconClick,
        };
      case "doubleclick":
      case "doubleclickat":
        return {
          summary: `Double-click at (${inner})`,
          Icon: IconHandClick,
        };
      case "rightclick":
        return {
          summary: `Right-click at (${inner})`,
          Icon: IconMenu2,
        };
      case "hover":
        return {
          summary: `Hover at (${inner})`,
          Icon: IconMouse2,
        };
      case "scroll":
        return {
          summary: inner ? `Scroll (${inner})` : "Scroll",
          Icon: IconArrowsVertical,
        };
      case "wait":
        return {
          summary: inner ? `Wait ${inner}` : "Wait",
          Icon: IconHourglass,
        };
      case "type":
      case "clickandtype":
        return {
          summary: inner
            ? `Type ${inner.replace(/^['"]|['"]$/g, "")}`
            : "Type text",
          Icon: IconTypography,
        };
      case "hotkey":
        return {
          summary: inner ? `Press keys: ${inner}` : "Press keys",
          Icon: IconCommand,
        };
      case "presskey":
        return {
          summary: inner ? `Press keys: ${inner}` : "Press keys",
          Icon: IconKeyboard,
        };
      case "drag":
        return {
          summary: inner ? `Drag (${inner})` : "Drag",
          Icon: IconDragDrop,
        };
      case "navigate":
        return {
          summary: inner ? `Go to ${inner}` : "Navigate",
          Icon: IconWorldWww,
        };
      case "openapp":
        return {
          summary: inner ? `Open ${inner}` : "Open app",
          Icon: IconAppWindow,
        };
      case "focusapp":
        return {
          summary: inner ? `Focus ${inner}` : "Focus app",
          Icon: IconFocus2,
        };
      case "selectoption":
        return {
          summary: inner ? `Select option (${inner})` : "Select option",
          Icon: IconSelector,
        };
      case "waitforelement":
        return {
          summary: inner ? `Wait for element (${inner})` : "Wait for element",
          Icon: IconEyeSearch,
        };
      case "apicall":
        return {
          summary: inner ? `API: ${inner}` : "API call",
          Icon: IconApi,
        };
      case "finished":
        return { summary: "Finished", Icon: IconCircleCheck };
      case "calluser":
        return { summary: "Ask user", Icon: IconUserQuestion };
      default:
        return {
          summary: s,
          Icon: IconBolt,
        };
    }
  }

  const bare = normOp(s);
  switch (bare) {
    case "clickat":
      return { summary: "Click (targeting)", Icon: IconClick };
    case "doubleclick":
      return { summary: "Double-click (targeting)", Icon: IconHandClick };
    case "rightclick":
      return { summary: "Right-click (targeting)", Icon: IconMenu2 };
    case "typetextat":
      return { summary: "Type text (targeting)", Icon: IconTypography };
    case "scroll":
      return { summary: "Scroll", Icon: IconArrowsVertical };
    case "hover":
      return { summary: "Hover (targeting)", Icon: IconMouse2 };
    case "wait":
      return { summary: "Wait", Icon: IconHourglass };
    case "presskey":
      return { summary: "Press key", Icon: IconKeyboard };
    case "hotkey":
      return { summary: "Hotkey", Icon: IconCommand };
    case "drag":
      return { summary: "Drag", Icon: IconDragDrop };
    case "navigate":
      return { summary: "Navigate", Icon: IconWorldWww };
    case "openapp":
      return { summary: "Open app", Icon: IconAppWindow };
    case "focusapp":
      return { summary: "Focus app", Icon: IconFocus2 };
    case "selectoption":
      return { summary: "Select option", Icon: IconSelector };
    case "waitforelement":
      return { summary: "Wait for element", Icon: IconEyeSearch };
    case "finished":
      return { summary: "Finished", Icon: IconCircleCheck };
    case "calluser":
      return { summary: "Call user", Icon: IconUserQuestion };
    case "apicall":
      return { summary: "API call", Icon: IconApi };
    default:
      return { summary: s, Icon: IconBolt };
  }
}
