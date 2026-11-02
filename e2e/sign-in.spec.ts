import { expect, test, type Page } from "@playwright/test";

// Next.js keeps its own (empty) route announcer alert outside <main>.
const message = (page: Page) => page.getByRole("main").getByRole("alert");

test("the sign-in page explains a refused account", async ({ page }) => {
  await page.goto("/login?error=not-allowed");
  await expect(message(page)).toHaveText(
    "This PlanToMe is private, and that account isn't the owner's.",
  );
});

test("the sign-in page ignores error codes it doesn't know", async ({ page }) => {
  await page.goto("/login?error=__proto__");
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await expect(message(page)).toHaveCount(0);
});
