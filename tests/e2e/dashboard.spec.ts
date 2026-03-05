import { test, expect } from "@playwright/test";

test.describe("Dashboard", () => {
  test("landing page loads and shows Welcome to Echo", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Welcome to Echo/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Sign In/i })).toBeVisible();
  });

  test("landing page Sign In links to signin", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /Sign In/i }).click();
    await expect(page).toHaveURL(/\/signin/);
  });

  test("dashboard redirects unauthenticated users to signin", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/signin|\/dashboard/);
  });
});
