import { test, expect } from "@playwright/test";

test.describe("Workflows", () => {
  test("workflows route is reachable", async ({ page }) => {
    await page.goto("/dashboard/workflows");
    await page.waitForLoadState("domcontentloaded");
    const url = page.url();
    expect(url).toMatch(/\/signin|\/dashboard\/workflows/);
  });
});
