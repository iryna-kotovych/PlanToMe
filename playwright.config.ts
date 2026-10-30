import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    // Tests check behavior, not animations, and must not hit a cached app shell.
    reducedMotion: "reduce",
    serviceWorkers: "block",
  },
  projects: [
    {
      name: "iphone",
      // Full iPhone screen as in the installed Home Screen app (no Safari bars).
      use: { ...devices["iPhone 14"], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: {
    // CI runs `npm run build` first, so it serves the production build.
    command: process.env.CI ? "npm run start" : "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    env: { NEXT_PUBLIC_DEMO_MODE: "true" },
  },
});
