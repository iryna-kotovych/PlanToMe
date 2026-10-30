import { expect, test } from "@playwright/test";

test("can be added to the iPhone Home Screen", async ({ page, request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ display: "standalone", start_url: "/" });
  for (const icon of manifest.icons as { src: string }[]) {
    expect((await request.get(icon.src)).ok()).toBe(true);
  }

  await page.goto("/");
  await expect(page).toHaveTitle("PlanToMe");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  await expect(page.locator('meta[name="mobile-web-app-capable"]')).toHaveAttribute(
    "content",
    "yes",
  );

  const splashScreens = await page
    .locator('link[rel="apple-touch-startup-image"]')
    .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
  expect(splashScreens).toHaveLength(11);
  for (const href of splashScreens) {
    expect((await request.get(href)).ok()).toBe(true);
  }
});

test("serves a service worker the browser never caches", async ({ request }) => {
  const response = await request.get("/sw.js");
  expect(response.ok()).toBe(true);
  expect(response.headers()["cache-control"]).toContain("no-cache");
});
