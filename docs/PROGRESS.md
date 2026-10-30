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
- **Phase 2 — Real app:**
  - Done in code: Supabase schema with Row Level Security on every table, sign-in with Google for the one allowed account (checked by the server, a sign-up hook and every table policy), tasks and check-offs synced between devices with an offline queue, public privacy policy at `/privacy`.
  - Done in services: Supabase project (EU), Vercel project `planto-me` with its settings.
  - Waiting for: Google Cloud sign-in keys (owner), then switch on Google sign-in in Supabase, deploy, and test on iPhone and Mac.

## Next

- **Phase 3 — Google Calendar:** events in the list, timed tasks written to the calendar.

## Open questions

- Swipe direction: now a finger swipe to the left shows the next day (like turning a page). Confirm, or flip it.

## Decisions

- Days can be viewed from today up to 7 days ahead.
- Demo sample data is invented by the engineer.
- App icon: "List row" — a checked round checkbox next to two text lines, white on the orange gradient. Source: `src/app/icon.svg`; PNGs and splash screens via `node scripts/generate-icons.mjs`.
- GitHub: secret scanning, push protection, Dependabot alerts and Dependabot security updates (automatic fix PRs) are on.
- Demo: a one-time tip for first-time visitors. If the swipe direction changes, update its text.
- Node 24 LTS on CI and Vercel. Local Mac runs Node 26, which is compatible.
- Accent buttons use near-black icons on the orange gradient: white on orange is below the 3:1 contrast minimum.
- Real app address: https://planto-me.vercel.app (`plantome.vercel.app` was taken).
- Google sign-in app is published "In production" without Google's verification, so calendar access doesn't expire every 7 days. No logo on the consent screen: a logo would require verification.
