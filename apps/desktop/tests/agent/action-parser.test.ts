import { describe, it, expect } from "vitest";
import { parseAction, extractThought } from "../../src/main/agent/action-parser";

describe("parseAction", () => {
  it("parses Action: Click(500, 300)", () => {
    const result = parseAction("Action: Click(500, 300)");
    expect(result).toEqual({ action: "click", x: 500, y: 300 });
  });

  it("parses lowercase action:", () => {
    const result = parseAction("action: click(100, 200)");
    expect(result).toEqual({ action: "click", x: 100, y: 200 });
  });

  it("returns null for null/undefined/empty input (hallucination robustness)", () => {
    expect(parseAction(null)).toBeNull();
    expect(parseAction(undefined)).toBeNull();
    expect(parseAction("")).toBeNull();
    expect(parseAction("   ")).toBeNull();
  });

  it("returns null when no Action: line found", () => {
    expect(parseAction("Thought: I should click somewhere")).toBeNull();
    expect(parseAction("Just some text without Action:")).toBeNull();
  });

  it("returns null for malformed Action line - no parens", () => {
    expect(parseAction("Action: Click")).toBeNull();
  });

  it("returns null for empty URL in navigate (hallucination)", () => {
    expect(parseAction('Action: Navigate("")')).toBeNull();
    expect(parseAction("Action: Navigate('')")).toBeNull();
    expect(parseAction("Action: Navigate()")).toBeNull();
  });

  it("parses Action: Navigate with valid URL", () => {
    const result = parseAction('Action: Navigate("https://example.com")');
    expect(result).toEqual({ action: "navigate", url: "https://example.com" });
  });

  it("returns null for unknown action names with invalid args", () => {
    const result = parseAction("Action: FooBar(1, 2, 3)");
    expect(result).toEqual({ action: "foobar" });
  });

  it("parses rightclick, doubleclick, hover with coords", () => {
    expect(parseAction("Action: RightClick(10, 20)")).toEqual({
      action: "rightclick",
      x: 10,
      y: 20,
    });
    expect(parseAction("Action: DoubleClick(100, 200)")).toEqual({
      action: "doubleclick",
      x: 100,
      y: 200,
    });
    expect(parseAction("Action: Hover(50, 75)")).toEqual({
      action: "hover",
      x: 50,
      y: 75,
    });
  });

  it("parses Action: Drag with 4 coords", () => {
    const result = parseAction("Action: Drag(0, 0, 500, 300)");
    expect(result).toEqual({
      action: "drag",
      x1: 0,
      y1: 0,
      x2: 500,
      y2: 300,
    });
  });

  it("parses Action: Scroll - positional form", () => {
    const result = parseAction('Action: Scroll(400, 600, "down", 300)');
    expect(result).toMatchObject({
      action: "scroll",
      x: 400,
      y: 600,
      direction: "down",
    });
  });

  it("parses Action: Type with quoted content", () => {
    const result = parseAction('Action: Type("hello world")');
    expect(result).toEqual({ action: "type", content: "hello world" });
  });

  it("parses Action: Hotkey with cmd,c", () => {
    const result = parseAction('Action: Hotkey("cmd", "c")');
    expect(result).toEqual({ action: "hotkey", keys: ["cmd", "c"] });
  });

  it("parses Action: Hotkey with command/control aliases", () => {
    const result = parseAction('Action: Hotkey("command", "c")');
    expect(result).toEqual({ action: "hotkey", keys: ["cmd", "c"] });
  });

  it("parses Action: Wait with seconds", () => {
    const result = parseAction("Action: Wait(3)");
    expect(result).toEqual({ action: "wait", seconds: 3 });
  });

  it("parses Action: PressKey", () => {
    const result = parseAction('Action: PressKey("enter")');
    expect(result).toEqual({ action: "presskey", key: "enter" });
  });

  it("parses Action: OpenApp and FocusApp", () => {
    expect(parseAction('Action: OpenApp("Safari")')).toEqual({
      action: "openapp",
      appName: "Safari",
    });
    expect(parseAction('Action: FocusApp("Chrome")')).toEqual({
      action: "focusapp",
      appName: "Chrome",
    });
  });

  it("parses Action: Finished and CallUser", () => {
    expect(parseAction('Action: Finished("Done")')).toMatchObject({
      action: "finished",
    });
    expect(parseAction('Action: CallUser("Need help")')).toMatchObject({
      action: "calluser",
    });
  });

  it("uses first Action: line when multiple present", () => {
    const text = `Thought: I'll click first
Action: Click(1, 2)
Action: Click(3, 4)`;
    const result = parseAction(text);
    expect(result).toEqual({ action: "click", x: 1, y: 2 });
  });

  it("returns null for malformed coords in click", () => {
    const result = parseAction("Action: Click(not, numbers)");
    expect(result).toEqual({ action: "click" });
  });
});

describe("extractThought", () => {
  it("extracts Thought: prefix", () => {
    const text = "Thought: I need to click the button";
    expect(extractThought(text)).toBe("I need to click the button");
  });

  it("extracts Reflection: prefix", () => {
    const text = "Reflection: The page loaded successfully";
    expect(extractThought(text)).toBe("The page loaded successfully");
  });

  it("extracts Action_Summary: prefix", () => {
    const text = "Action_Summary: Completed navigation";
    expect(extractThought(text)).toBe("Completed navigation");
  });

  it("handles multiline - returns first matching line", () => {
    const text = `Thought: First thought
Action: Click(1, 2)`;
    expect(extractThought(text)).toBe("First thought");
  });

  it("returns empty string when no match", () => {
    expect(extractThought("Action: Click(1, 2)")).toBe("");
  });

  it("is case-insensitive for prefix", () => {
    expect(extractThought("THOUGHT: Hello")).toBe("Hello");
  });
});
