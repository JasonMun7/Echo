import { test, expect } from "@playwright/test";

test.describe("Auth", () => {
  test("signin page loads", async ({ page }) => {
    await page.goto("/signin");
    await expect(page).toHaveURL(/\/signin/);
  });

  test("backend health is reachable from web context", async ({ request }) => {
    const res = await request.get("http://localhost:8000/health");
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toEqual({ status: "ok" });
  });
});
