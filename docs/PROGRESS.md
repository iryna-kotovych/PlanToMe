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
  - Done in services: Supabase project (EU), Vercel project `planto-me`, Google sign-in (consent screen published), live at https://planto-me.vercel.app.
  - QA pass (Nov 2): live site, database access as a stranger and as the owner, and shipped code for secrets all checked. An independent code review found data-loss risks in sync, all fixed:
    - carry-over now runs in the database;
    - refused changes are kept and shown;
    - the app opens from the device copy offline;
    - sign out affects this device only and warns about unsent changes;
    - one tab at a time;
    - overnight time ranges;
    - Undo keeps check-offs.
  - A second independent review of the rewritten sync found 8 more issues; all fixed, each with a test that fails on the old code.
  - Tests: 86 unit tests, including 22 for the sync store against an in-memory fake Supabase; 17 iPhone e2e tests.
  - Owner checklist (Nov 2): steps 1–8 pass on iPhone and Mac — sign-in, Home Screen app, sync both ways, offline start and catch-up. Waiting for step 9, the next-morning carry-over (Nov 3).
- **Phase 3 — Google Calendar** (plan approved Nov 2):
  - Done in code: Connect / Reconnect row and result page; refresh token sealed with AES-256-GCM and readable only by the server; events of today + 7 days in the list (all-day, timed, recurring, overnight; declined and working-location events hidden), kept on each device; pull to refresh; timed one-off tasks written to the primary calendar and kept in step (create, move, rename, delete), past days untouched; database table `calendar_links`.
  - Background calendar check moved to Phase 5, with the reminders that need it.
  - Independent review: 8 findings, all fixed, each with a test that fails on the old code (Reconnect now stays until reconnected; a Google outage stops the sync at once; an event made while another device deleted its task is removed; a task moved to a past day takes its event along, and the form refuses past days; retries back off; the app looks again right after connecting; unusable access is given back).
  - Tests: 160 unit tests (calendar sync against an in-memory Supabase and Google Calendar), 23 iPhone e2e tests.
  - Waiting for: the four server keys in Vercel (needs the owner's go-ahead), the owner's Google Cloud steps (Calendar API, scope, redirect address), then the owner connects the calendar.

## Known limits

- Until the evening wrap-up (Phase 5), an unfinished **timed** task stays on its day and disappears from view the next day.
- The free Supabase project pauses after a week without use (a few requests a day keep it awake). Supabase emails first; **Resume project** in the dashboard brings it back with all data, up to a year later. The free plan has no time limit and is never billed: over a quota, Supabase warns, then restricts (e.g. read-only) until the quota refills next month.
- Free plan room (Nov 2): database 11 MB of 500 MB, mostly Supabase's own tables; a task row is ~120 bytes. Files: 1 GB, so Phase 4 must shrink screenshots before storing them.
- Only the last 30 days of one-off tasks and check-offs are loaded.

## Next

- **Phase 4 — Voice, text and pictures.**

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
