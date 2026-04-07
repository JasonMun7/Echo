import { describe, expect, it } from "vitest";
import { interpolateString, interpolateStep, interpolateSteps } from "../step-placeholders";
import type { Step } from "@echo/types";

describe("step-placeholders", () => {
  it("interpolateString replaces {{var}}", () => {
    expect(
      interpolateString("Hello {{name}}", { name: "Ada" }),
    ).toBe("Hello Ada");
  });

  it("leaves unknown keys as placeholder", () => {
    expect(interpolateString("{{missing}}", {})).toBe("{{missing}}");
  });

  it("interpolateStep updates params.text and context", () => {
    const step = {
      id: "1",
      action: "type_text_at",
      order: 0,
      context: "To {{recipient}}",
      params: { text: "{{body}}", description: "field" },
    } as unknown as Step;
    const out = interpolateStep(step, { recipient: "Mom", body: "Running late" });
    expect(out.context).toBe("To Mom");
    expect(out.params?.text).toBe("Running late");
  });

  it("interpolateSteps maps all steps", () => {
    const steps = [
      {
        id: "1",
        action: "click_at",
        order: 0,
        context: "",
        params: { description: "x" },
      },
    ] as unknown as Step[];
    expect(interpolateSteps(steps, {}).length).toBe(1);
  });
});
