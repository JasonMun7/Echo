import { describe, expect, it } from "vitest";
import { coerceOpenAppDisplayName } from "./app-name-coerce";

describe("coerceOpenAppDisplayName", () => {
  it("passes through normal titles", () => {
    expect(coerceOpenAppDisplayName("Discord")).toBe("Discord");
    expect(coerceOpenAppDisplayName("  Safari  ")).toBe("Safari");
  });

  it("strips mistaken appName= / app= keyword forms", () => {
    expect(coerceOpenAppDisplayName("appName='Discord'")).toBe("Discord");
    expect(coerceOpenAppDisplayName(`appName="Discord"`)).toBe("Discord");
    expect(coerceOpenAppDisplayName("app=Notes")).toBe("Notes");
    expect(coerceOpenAppDisplayName("AppName='IntelliJ IDEA'")).toBe("IntelliJ IDEA");
  });

  it("handles comma after unquoted token", () => {
    expect(coerceOpenAppDisplayName("app=Code, extra")).toBe("Code");
  });
});
