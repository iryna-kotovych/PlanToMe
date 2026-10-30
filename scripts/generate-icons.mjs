// Renders the app icons and iOS splash screens from src/app/icon.svg.
// Run after changing the icon: node scripts/generate-icons.mjs
// (needs the Playwright WebKit browser: npx playwright install webkit)

import { mkdir, readFile } from "node:fs/promises";
import { webkit } from "@playwright/test";
import splashScreens from "../src/lib/pwa/splash-screens.json" with { type: "json" };

const BACKGROUND = "#faf8f4";
const root = new URL("../", import.meta.url);
const svg = await readFile(new URL("src/app/icon.svg", root), "utf8");

function sizedIcon(size) {
  return svg.replace("<svg ", `<svg width="${size}" height="${size}" `);
}

const browser = await webkit.launch();

async function render(html, width, height, path) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(
    `<!doctype html><body style="margin:0;overflow:hidden">${html}</body>`,
  );
  await page.screenshot({ path: new URL(path, root).pathname });
  await page.close();
}

await mkdir(new URL("public/icons", root), { recursive: true });
await mkdir(new URL("public/splash", root), { recursive: true });

for (const size of [192, 512]) {
  await render(sizedIcon(size), size, size, `public/icons/icon-${size}.png`);
}
await render(sizedIcon(180), 180, 180, "src/app/apple-icon.png");

// The icon centred on the app background, at each iPhone's pixel size.
for (const { width, height, ratio } of splashScreens) {
  const [w, h] = [width * ratio, height * ratio];
  const icon = Math.round(width * 0.26) * ratio;
  await render(
    `<div style="display:grid;place-items:center;width:${w}px;height:${h}px;background:${BACKGROUND}">
      <div style="width:${icon}px;height:${icon}px;border-radius:${Math.round(icon * 0.2237)}px;overflow:hidden">${sizedIcon(icon)}</div>
    </div>`,
    w,
    h,
    `public/splash/${w}x${h}.png`,
  );
}

await browser.close();
console.log(`Rendered 3 icons and ${splashScreens.length} splash screens.`);
