import { expect, test } from "@playwright/test";

test("home screen opens", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("PlanToMe");
  await expect(page.getByRole("heading", { name: "PlanToMe" })).toBeVisible();
});
