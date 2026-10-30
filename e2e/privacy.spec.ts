import { expect, test } from "@playwright/test";

test("the privacy policy is public and leads back to the app", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page).toHaveTitle("Privacy · PlanToMe");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Privacy policy");

  await page.getByRole("link", { name: "PlanToMe", exact: true }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByText("Demo — sample data")).toBeVisible();
});
