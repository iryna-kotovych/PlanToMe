# Kickoff prompt for Claude Code

Open this folder in VS Code, start Claude Code, and paste everything below the line.

---

You are building **PlanToMe**, my personal daily to-do app. Read `CLAUDE.md` (working rules) and `docs/SPEC.md` (full product spec) first, then follow the phases below in order. Do not skip ahead: finish a phase, show me the result, wait for my "ok", then continue.

Short version of what we are building: a minimal, light, English-only PWA that I install on my iPhone from the Home Screen. It shows one full-screen list for the day (swipe right for the next day) with my Google Calendar events (all-day without time, timed with time), my tasks and my habits mixed together, each with a checkbox. I add tasks by voice (Ukrainian, Russian, English), by text, or by a screenshot/document of an invitation or email; the app works out the day and time. Timed tasks go into my Google Calendar too. Untimed unfinished tasks move to the next day on their own; for timed ones I get a push at 20:00 asking to mark done or move. Reminders 15 minutes before timed items. The GitHub repo is public, so no secrets or personal data ever go into it, and there is a public demo with fake data.

## Phase 0 — Project setup
1. Check what is installed on my Mac (Node LTS, npm, git, GitHub CLI) and install what's missing, telling me what you're doing.
2. Scaffold Next.js + TypeScript + Tailwind in this folder, keeping the existing files (`README.md`, `CLAUDE.md`, `PROMPT.md`, `docs/`, `.gitignore`, `.env.example`).
3. Add lint, typecheck, Vitest, Playwright, gitleaks (`npm run secrets:check`) and a GitHub Actions CI workflow.
4. Make sure the repo is on GitHub as public `iryna-kotovych/PlanToMe` and pushed. Turn on secret scanning and push protection (give me the clicks if it can't be done from the CLI).
5. Create `docs/PROGRESS.md`.

## Phase 1 — Public demo first (no accounts, no keys)
1. Build the full Today screen per the spec's Design section: header with date, one mixed list (untimed first, then timed by time), round checkboxes, checked items sink to the bottom, swipe right/left between days (not before today), tap header → today, item edit sheet, bottom add bar with mic, text field and attach button.
2. Demo mode (`NEXT_PUBLIC_DEMO_MODE=true`): mock calendar + sample tasks and habits, stored in the browser, with a reset button and a small "Demo — sample data" label. Voice and attachments return canned example results.
3. PWA: manifest, icons (an original simple mark on the orange gradient), splash screens, service worker, offline shell, `display: standalone`, safe areas.
4. Deploy the demo to Vercel (walk me through connecting the GitHub repo) and add its link to the README.
5. Show me: the demo URL, and how to add it to my iPhone Home Screen. I'll test and give feedback.

## Phase 2 — My real app: sign-in and storage
1. Supabase project (walk me through creating it), schema with RLS: tasks, completions, recurrence rules, attachments, push subscriptions, settings, encrypted Google tokens.
2. Google sign-in restricted to `ALLOWED_EMAIL`. A second Vercel deployment (production) uses real data; the demo deployment stays untouched.
3. Tasks, check-off, edit, delete, recurring tasks/habits, sync between iPhone and Mac, optimistic UI with offline queue.

## Phase 3 — Google Calendar, two-way (primary calendar only)
1. Walk me through Google Cloud: project, Calendar API, OAuth consent screen set to **In production** (Testing mode makes tokens expire after 7 days), OAuth client, redirect URIs.
2. Calendar → app: all-day and timed events for the viewed days, recurring instances expanded, refresh on open, pull-to-refresh and a background job.
3. App → calendar: timed tasks create/update/delete their own event (store the event ID). Checking off a calendar event only changes the app, never the calendar. Never touch events the app didn't create.

## Phase 4 — Voice, text and pictures
1. Mic button: record with MediaRecorder (iOS gives audio/mp4), upload to a server route, transcribe with Groq Whisper (free tier) with Cloudflare Workers AI Whisper as fallback. Walk me through getting both free keys. Don't use the Web Speech API — it doesn't work in Home Screen web apps on iOS.
2. Parser on the server: Claude API (current Haiku model — check docs.claude.com) turns text, transcripts, images and PDFs into tasks (JSON validated with zod). Rules from spec 5.3: today if no day; resolve relative dates in Europe/Madrid; several tasks per input; keep titles in my language; on failure save raw text as an untimed task. Walk me through getting an Anthropic API key (separate from my Claude subscription) and setting a small monthly spend limit.
3. Attachments stored in a private Supabase bucket and linked to the task.
4. Undo/Edit toast after every capture. Unit tests with uk/ru/en examples, e.g. "завтра о 15:00 подзвонити в банк", "в пятницу купить подарок", "every weekday 8am stretch".

## Phase 5 — Carry-over and notifications
1. Carry-over per spec 5.4 (untimed → next day at midnight; timed → wrap-up decision; calendar events and habits never carry over).
2. Web Push with VAPID: permission from a tap, 15-minute reminders for timed tasks and (toggle) timed events, 20:00 wrap-up push only when something is unfinished. Scheduler: Supabase pg_cron + Edge Function.
3. Wrap-up screen: Done / Move to tomorrow / Pick a day. "Needs a decision" row on Today for leftovers.
4. Settings screen per spec 4.4.

## Phase 6 — Polish and portfolio
1. Run through the acceptance checklist in `docs/SPEC.md` and fix everything that fails.
2. Accessibility and performance pass on iPhone.
3. README for GitHub: what it is, screenshots/GIF from the demo, demo link, stack, architecture diagram, how privacy is handled, how to run your own copy. Written so other product managers find it useful.
4. Give me a list of the 5 best next improvements, ranked by value vs. effort.

Start with Phase 0 now.
