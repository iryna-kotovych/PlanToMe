import { expect, test, type Page } from "@playwright/test";

// Monday, 2 Nov 2026, 09:00 in Madrid. The demo seeds its data around today.
const NOW = new Date("2026-11-02T08:00:00Z");

const heading = (page: Page) => page.getByRole("heading", { level: 1 });
const rows = (page: Page) => page.getByRole("listitem");
const row = (page: Page, title: string) => rows(page).filter({ hasText: title });

async function swipe(page: Page, distance: number) {
  const box = await page.getByRole("main").boundingBox();
  if (!box) throw new Error("The day list is not on screen");
  const y = box.y + 120;
  const x = box.x + box.width / 2 - distance / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + distance, y, { steps: 10 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await page.goto("/");
  await expect(heading(page)).toContainText("Monday, Nov 2");
});

test("shows today's events, tasks and habits in one list", async ({ page }) => {
  await expect(page.getByText("Demo — sample data")).toBeVisible();
  await expect(heading(page)).toContainText("Today");
  // All-day events have no time; timed ones show it.
  await expect(row(page, "Ana's birthday")).not.toContainText(/\d\d:\d\d/);
  await expect(row(page, "Team stand-up")).toContainText("09:30");
  await expect(row(page, "Read 10 pages")).toBeVisible();
  // Yesterday's unfinished task moved to today.
  await expect(row(page, "Renew library card")).toContainText("from Sun");
});

test("first-time visitors get a tip they can dismiss for good", async ({ page }) => {
  const tip = page.getByRole("region", { name: "Welcome to the demo" });
  await expect(tip).toContainText("Swipe left");
  await tip.getByRole("button", { name: "Dismiss tip" }).click();
  await expect(tip).toHaveCount(0);

  await page.reload();
  await expect(heading(page)).toContainText("Monday, Nov 2");
  await expect(tip).toHaveCount(0);
});

test("checked items sink to the bottom and stay checked", async ({ page }) => {
  const checkbox = page.getByRole("checkbox", { name: "Done: Buy flowers for Ana" });
  await checkbox.click();
  await expect(checkbox).toHaveAttribute("aria-checked", "true");

  const titles = await rows(page).allInnerTexts();
  const position = (title: string) => titles.findIndex((text) => text.includes(title));
  expect(position("Buy flowers for Ana")).toBeGreaterThan(position("Dentist check-up"));

  await page.reload();
  await expect(checkbox).toHaveAttribute("aria-checked", "true");
});

test("pages up to 7 days ahead and back to today", async ({ page }) => {
  const previous = page.getByRole("button", { name: "Previous day" });
  const next = page.getByRole("button", { name: "Next day" });
  await expect(previous).toBeDisabled();

  await next.click();
  await expect(heading(page)).toContainText("Tomorrow");
  await expect(heading(page)).toContainText("Tuesday, Nov 3");
  await expect(row(page, "Pick up dry cleaning")).toBeVisible();

  for (let step = 0; step < 6; step++) await next.click();
  await expect(heading(page)).toContainText("Monday, Nov 9");
  await expect(next).toBeDisabled();

  await heading(page).getByRole("button").click();
  await expect(heading(page)).toContainText("Monday, Nov 2");
});

test("swipes left for the next day, but never before today", async ({ page }) => {
  await swipe(page, -220);
  await expect(heading(page)).toContainText("Tuesday, Nov 3");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await swipe(page, 220);
  await expect(heading(page)).toContainText("Monday, Nov 2");

  await swipe(page, 220);
  await expect(heading(page)).toContainText("Monday, Nov 2");
});

test("adds a task from text, and undo removes it", async ({ page }) => {
  const input = page.getByRole("textbox", { name: "New task" });
  await input.fill("call the bank tomorrow at 3pm");
  await input.press("Enter");
  await expect(page.getByText("Added “Call the bank”")).toBeVisible();
  await expect(page.getByText("Tomorrow, 15:00")).toBeVisible();

  await page.getByRole("button", { name: "Next day" }).click();
  await expect(row(page, "Call the bank")).toContainText("15:00");
  await page.getByRole("button", { name: "Previous day" }).click();

  await input.fill("buy milk");
  await input.press("Enter");
  await expect(row(page, "Buy milk")).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(row(page, "Buy milk")).toHaveCount(0);
});

test("a voice note becomes a task (canned in the demo)", async ({ page }) => {
  await page.getByRole("button", { name: "Record a task" }).click();
  await expect(page.getByText(/Recording \d:\d\d/)).toBeVisible();
  await page.getByRole("button", { name: "Stop recording" }).click();
  await expect(page.getByText("Added “Подзвонити в банк”")).toBeVisible();
  await expect(page.getByText("Heard: “завтра о 15:00 подзвонити в банк”")).toBeVisible();
});

test("a picture becomes several tasks (canned in the demo)", async ({ page }) => {
  await page.locator('input[type="file"]').setInputFiles({
    name: "invitation.png",
    mimeType: "image/png",
    buffer: Buffer.from("not really an image"),
  });
  await expect(page.getByText("Added 2 tasks")).toBeVisible();
  await expect(row(page, "Reply to the book club invitation")).toBeVisible();
});

test("edits a task in the sheet", async ({ page }) => {
  await row(page, "Buy flowers for Ana").getByRole("button").click();
  const sheet = page.getByRole("dialog", { name: "Edit task" });
  await sheet.getByLabel("Title").fill("Buy tulips for Ana");
  await sheet.getByLabel("Time").fill("12:30");
  await sheet.getByRole("button", { name: "Save" }).click();

  await expect(sheet).toHaveCount(0);
  await expect(row(page, "Buy tulips for Ana")).toContainText("12:30");
});

test("a one-off task can't be moved to a past day", async ({ page }) => {
  await row(page, "Buy flowers for Ana").getByRole("button").click();
  const sheet = page.getByRole("dialog", { name: "Edit task" });
  // Typed dates get past the date picker's minimum.
  await sheet.getByLabel("Date").fill("2026-11-01");
  await sheet.getByRole("button", { name: "Save" }).click();

  await expect(sheet.getByRole("alert")).toHaveText("Pick today or a later day.");
  await expect(sheet).toBeVisible();
});

test("a time range can pass midnight", async ({ page }) => {
  const input = page.getByRole("textbox", { name: "New task" });
  await input.fill("party 22:00-01:00");
  await input.press("Enter");
  await expect(row(page, "Party")).toContainText("22:00 to 01:00");

  await row(page, "Party").getByRole("button").click();
  const sheet = page.getByRole("dialog", { name: "Edit task" });
  await expect(sheet.getByText("Ends the next day.")).toBeVisible();
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toHaveCount(0);
});

test("calendar events are read-only but can be checked off", async ({ page }) => {
  await row(page, "Team stand-up").getByRole("button").click();
  const sheet = page.getByRole("dialog", { name: "Calendar event" });
  await expect(sheet).toContainText("never the calendar");
  await sheet.getByRole("button", { name: "Mark as done" }).click();
  await expect(sheet.getByRole("button", { name: "Mark as not done" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(
    page.getByRole("checkbox", { name: "Done: Team stand-up" }),
  ).toHaveAttribute("aria-checked", "true");
});

test("reset brings back the sample data", async ({ page }) => {
  await row(page, "Buy flowers for Ana").getByRole("button").click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(row(page, "Buy flowers for Ana")).toHaveCount(0);

  await page.getByRole("button", { name: "Reset" }).click();
  await expect(row(page, "Buy flowers for Ana")).toBeVisible();
});

test("pulling the list down from the top refreshes the calendar", async ({ page }) => {
  // Touch events as the iPhone sends them; the list is already at the top.
  await page.getByRole("main").evaluate((main) => {
    const touch = (type: string, y: number | null) => {
      const event = new Event(type, { bubbles: true });
      Object.defineProperty(event, "touches", {
        value: y === null ? [] : [{ clientX: 200, clientY: y }],
      });
      main.dispatchEvent(event);
    };
    touch("touchstart", 150);
    touch("touchmove", 220);
    touch("touchmove", 290);
    touch("touchend", null);
  });
  const status = page.getByRole("status").filter({ hasText: "Refreshing the calendar" });
  await expect(status).toBeAttached();
  await expect(status).not.toBeAttached();
  await expect(row(page, "Team stand-up")).toBeVisible();
});

test("a short pull doesn't refresh", async ({ page }) => {
  await page.getByRole("main").evaluate((main) => {
    const touch = (type: string, y: number | null) => {
      const event = new Event(type, { bubbles: true });
      Object.defineProperty(event, "touches", {
        value: y === null ? [] : [{ clientX: 200, clientY: y }],
      });
      main.dispatchEvent(event);
    };
    touch("touchstart", 150);
    touch("touchmove", 200);
    touch("touchend", null);
  });
  await expect(page.getByText("Refreshing the calendar")).not.toBeAttached();
});

test("the demo never asks to connect Google Calendar", async ({ page }) => {
  await expect(row(page, "Team stand-up")).toBeVisible();
  await expect(page.getByText("Connect", { exact: true })).toHaveCount(0);
});
