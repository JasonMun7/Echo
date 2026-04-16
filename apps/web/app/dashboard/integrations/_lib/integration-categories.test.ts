import { describe, expect, it } from "vitest";
import {
  categoryForIntegrationId,
  integrationMatchesCategoryTab,
} from "@/app/dashboard/integrations/_lib/integration-categories";

describe("categoryForIntegrationId", () => {
  it("maps known ids", () => {
    expect(categoryForIntegrationId("slack")).toBe("alerting");
    expect(categoryForIntegrationId("github")).toBe("ci_cd");
    expect(categoryForIntegrationId("google")).toBe("infrastructure");
    expect(categoryForIntegrationId("gmail")).toBe("logging_apm");
  });

  it("defaults unknown ids to infrastructure", () => {
    expect(categoryForIntegrationId("unknown-tool")).toBe("infrastructure");
  });
});

describe("integrationMatchesCategoryTab", () => {
  it("all tab matches any id", () => {
    expect(integrationMatchesCategoryTab("anything", "all")).toBe(true);
  });

  it("respects category filter", () => {
    expect(integrationMatchesCategoryTab("slack", "alerting")).toBe(true);
    expect(integrationMatchesCategoryTab("slack", "ci_cd")).toBe(false);
  });
});
