import { describe, expect, it } from "vitest";
import {
  explainExecuteRoute,
  normalizeOperatorAction,
  resolveExecuteRoute,
} from "../execute-route";

describe("execute-route", () => {
  it("normalizes action names consistently", () => {
    expect(normalizeOperatorAction("Type")).toBe("type");
    expect(normalizeOperatorAction("press_key")).toBe("presskey");
  });

  it("routes open_app and focus_app to desktop always", () => {
    expect(resolveExecuteRoute("open_app", true)).toBe("desktop");
    expect(resolveExecuteRoute("open_app", false)).toBe("desktop");
    expect(explainExecuteRoute("open_app", true)).toBe("desktop_only");
  });

  it("routes browser-only actions to playwright even without browser", () => {
    expect(resolveExecuteRoute("navigate", false)).toBe("playwright");
    expect(explainExecuteRoute("navigate", false)).toBe("browser_only");
  });

  it("H1: type/click/scroll shared actions go to playwright when stale browser open", () => {
    expect(resolveExecuteRoute("type", true)).toBe("playwright");
    expect(resolveExecuteRoute("click", true)).toBe("playwright");
    expect(explainExecuteRoute("type", true)).toBe("shared_routes_playwright_stale_browser");
  });

  it("shared actions go to desktop when no browser context", () => {
    expect(resolveExecuteRoute("type", false)).toBe("desktop");
    expect(resolveExecuteRoute("clickandtype", false)).toBe("desktop");
    expect(explainExecuteRoute("type", false)).toBe("shared_routes_desktop");
  });
});
