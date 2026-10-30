# Progress

## Done

- **Phase 0 — Project setup:** Next.js 16 + TypeScript + Tailwind scaffold, ESLint, typecheck, Vitest, Playwright (iPhone 390×844), gitleaks secret scan (`npm run secrets:check` + pre-commit hook), GitHub Actions CI, public GitHub repo with secret scanning and push protection.
- **Phase 1 — Public demo (code):**
  - Today screen: date header, one mixed list (untimed first, then by time), round checkboxes, checked items sink with an animation, swipe and arrows between today and +7 days, tap the date for today, edit sheet, read-only sheet for calendar events, add bar with mic, text and attach, Undo/Edit toast.
  - Demo mode: invented calendar, tasks and habits stored in the browser, Reset, "Demo — sample data" label, canned voice and picture results, a small rule-based parser for typed text (en/ru/uk), carry-over of unfinished untimed tasks.
  - PWA: manifest, app icon, 11 iPhone splash screens, offline app shell (service worker), "new version" prompt, safe areas.
  - Tests: 39 unit tests (dates, repeats, list order, carry-over, parser, demo data), 12 iPhone e2e tests.
- **Phase 1 — Deploy:** Vercel project `plantome-demo`, connected to GitHub (Vercel app has access to this repo only), every push to `main` deploys to https://plantome-demo.vercel.app. Linked from the README.

## In progress

- Owner tests the demo on iPhone and gives feedback.

## Next

- **Phase 2 — Real app:** Supabase, Google sign-in for one email, synced tasks.

## Open questions

- Swipe direction: now a finger swipe to the left shows the next day (like turning a page). Confirm, or flip it.
- Production URL: `plantome.vercel.app` is taken by someone else. Pick another name in Phase 2.

## Decisions

- Days can be viewed from today up to 7 days ahead.
- Demo sample data is invented by the engineer.
- App icon: "List row" — a checked round checkbox next to two text lines, white on the orange gradient. Source: `src/app/icon.svg`; PNGs and splash screens via `node scripts/generate-icons.mjs`.
- GitHub: secret scanning, push protection and Dependabot alerts are on.
- Node 24 LTS on CI and Vercel. Local Mac runs Node 26, which is compatible.
- Accent buttons use near-black icons on the orange gradient: white on orange is below the 3:1 contrast minimum.
