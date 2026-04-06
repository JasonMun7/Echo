import { describe, expect, it } from "vitest";
import { parseUiTarsTypeContent } from "../type-content";

describe("parseUiTarsTypeContent", () => {
  it("strips trailing newline and sets submit", () => {
    const { body, submit } = parseUiTarsTypeContent("hello\n");
    expect(body).toBe("hello");
    expect(submit).toBe(true);
  });

  it("strips literal backslash-n suffix and sets submit", () => {
    const { body, submit } = parseUiTarsTypeContent(String.raw`hello\n`);
    expect(body).toBe("hello");
    expect(submit).toBe(true);
  });

  it("keeps internal newlines and no submit", () => {
    const { body, submit } = parseUiTarsTypeContent("a\nb");
    expect(body).toBe("a\nb");
    expect(submit).toBe(false);
  });
});
