import { describe, expect, it } from "vitest";
import { dedupeHudActions, formatHudAction } from "./run-hud-action-display";

describe("dedupeHudActions", () => {
  it("drops bare click_at when click(...) is present", () => {
    expect(dedupeHudActions(["click_at", "click(20, 380)"])).toEqual(["click(20, 380)"]);
  });

  it("keeps click_at when no detailed line", () => {
    expect(dedupeHudActions(["click_at"])).toEqual(["click_at"]);
  });

  it("drops type_text_at when type(...) exists", () => {
    expect(dedupeHudActions(["type_text_at", "type(hello)"])).toEqual(["type(hello)"]);
  });
});

describe("formatHudAction", () => {
  it("formats click coordinates", () => {
    const { summary, Icon } = formatHudAction("click(20, 380)");
    expect(summary).toBe("Click at (20, 380)");
    expect(Icon).toBeDefined();
  });

  it("formats bare workflow step name", () => {
    const { summary } = formatHudAction("click_at");
    expect(summary).toBe("Click (targeting)");
  });
});
