import { expect, test } from "@playwright/test";

// The page Google Calendar's connection ends on. It is public, as it can open
// in a browser without the app's session (the Home Screen app on iPhone).

test("says the calendar is connected and leads back to the app", async ({ page }) => {
  await page.goto("/auth/connect/done?result=connected");
  await expect(page).toHaveTitle("Google Calendar · PlanToMe");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Google Calendar is connected",
  );
  await page.getByRole("link", { name: "Open PlanToMe" }).click();
  await expect(page).toHaveURL("/");
});

test("explains what went wrong, and only with its own messages", async ({ page }) => {
  await page.goto("/auth/connect/done?result=wrong-account");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "That's a different Google account",
  );
  await page.goto("/auth/connect/done?result=__proto__");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Couldn't connect Google Calendar",
  );
});
