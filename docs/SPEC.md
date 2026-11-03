# PlanToMe — Product Spec

A calm, minimal daily to-do app for one person. It lives on the iPhone home screen as an installable web app (PWA), pulls the day's events from Google Calendar, and lets the owner add tasks by voice, text, or by snapping a screenshot of an invitation or email.

Owner: Iryna Kotovych · Timezone: Europe/Madrid · Interface language: **English only**

---

## 1. Goals

- One screen that answers "what's on today?" — calendar events, tasks and habits in a single list.
- Adding a task takes seconds: say it, type it, or show it a picture.
- Nothing slips: untimed tasks roll forward on their own; timed tasks get a gentle evening check-in.
- Installs on iPhone without the App Store and updates itself whenever new code is pushed to GitHub.
- The public GitHub repo and demo never expose the owner's calendar, tasks, or keys.

## 2. Non-goals (for now)

- Multi-user / sharing, teams, collaboration.
- Week or month views (only day-by-day).
- Native iOS app, App Store, Android-specific work.
- Dark mode.
- Gamification: streak counters, scores, guilt-trip notifications.

---

## 3. Platform & delivery

| Area | Decision |
|---|---|
| App type | PWA: web app manifest, `display: standalone`, service worker, offline app shell, iOS home-screen icons and splash |
| Install | iPhone → open the URL → Share → "Add to Home Screen" (works from Safari and Chrome on iOS 16.4+) |
| Updates | Every push to `main` auto-deploys; the installed app picks up the new version on next launch (service worker update + "reload" prompt if a session is open) |
| Devices | iPhone first (design at 390×844), also usable on the Mac in a browser, synced |
| Hosting | Vercel (free Hobby plan), auto-deploy from GitHub |
| Backend | Supabase (free plan): Postgres, Auth, Storage, Edge Functions, `pg_cron` |
| Frontend | Next.js (App Router) + TypeScript + Tailwind CSS |

---

## 4. Screens & interactions

### 4.1 Today (the only main screen)

- Full-screen list for one day. Small header with the date ("Friday, Oct 30") and a subtle "Today" label when on the current day ("Tomorrow" on the next one).
- **One list, no sections.** Calendar events, tasks and habits are mixed together:
  - Untimed items first (all-day calendar events, untimed tasks, habits).
  - Then timed items in chronological order, each showing its time (e.g. `09:30`) on the left. A time range is shown if the item has an end time.
- Every item has a round checkbox. Checking it strikes the item through, softens its color and moves it to the bottom of the list (with a gentle animation). Unchecking restores it.
- A small, quiet icon distinguishes the source: calendar event, task, habit (recurring). No colored tags, no clutter.
- Tap an item → edit sheet (title, date, time, recurrence, note, attachment, delete). A one-off task can't be moved to a past day (it would vanish from the list).
- **Swipe right → next day.** Swipe back → previous day, but not earlier than today. Days are viewable up to 7 days ahead (today + 7). Tapping the date header jumps back to today. Small previous/next arrows beside the date do the same as swiping (for accessibility, and the arrow keys work on the Mac).
- Calendar events open a read-only sheet: they can be checked off in the app, never edited.
- Pull down from the top of the list to refresh (re-syncs Google Calendar); a small spinner shows while it runs, and a short message if it couldn't.
- Empty day: one calm line of copy, no illustrations needed.

### 4.2 Add bar (fixed at the bottom)

- **Mic button:** tap to start recording, tap again to stop (also support press-and-hold). Shows a live recording indicator and timer.
- Text field: type a task in natural language ("call the bank tomorrow at 3pm").
- Attach button: camera, photo library, or file (images, PDF).
- After capture, the item is added immediately and an **Undo / Edit** toast appears for a few seconds. If parsing produced several tasks, all are added and the toast says how many.

### 4.3 Wrap-up (evening check-in)

- Opened from the 20:00 push notification, or from a small "Needs a decision" row at the top of Today if something was left unresolved.
- Lists the day's **unfinished timed tasks created in the app** (not calendar events — see 5.4).
- Per task: **Done** · **Move to tomorrow** (keeps the time) · **Pick a day**.
- iOS web push cannot show action buttons inside the notification, so the decision happens on this screen.

### 4.4 Settings (minimal)

- Connected Google account / reconnect.
- Notifications on/off, test notification.
- Toggle: remind me before calendar events too (default on).
- Wrap-up time (default 20:00) and reminder lead time (default 15 min).
- Sign out.

---

## 5. Features

### 5.1 Google Calendar sync (two-way, primary calendar only)

**Connecting**
- Until Google Calendar is connected, a quiet row at the top of the list says "See your Google Calendar events here" with **Connect**. If Google later stops accepting the connection (access removed, token expired), the row says "Google Calendar was disconnected" with **Reconnect**.
- Connect goes through Google's consent screen and ends on a short result page with **Open PlanToMe**. It must be the same Google account the owner signs in with; another account is refused and its access given straight back.
- The connection lives on the server, so connecting once (say, on the Mac) serves every device. The connect flow doesn't rely on cookies, so it also finishes when the iPhone's Home Screen app hands Google's page to another browser.

**Calendar → app**
- Fetch events of the owner's **primary** calendar for today + 7 days (the days the list can show). Each device keeps a copy, so the calendar shows at once and offline.
- All-day events → untimed items, on every day they cover. Timed events → timed items with start (and end) time; one that runs past midnight shows on its first day ("22:00 to 01:00"), and one longer than a day also shows as an untimed item on the following days.
- Recurring calendar events are expanded into single instances.
- Hidden: events the owner declined, working-location events ("Home", "Office"), and the app's own events (their tasks are already in the list).
- Changes made in Google Calendar (edit, move, delete) show up in the app on next sync: on app open, when coming back to the app after a minute or more, every 5 minutes while it is open, and on pull-to-refresh. A background job on the server comes with the reminders in Phase 5, which are what need it.
- **Checking off a calendar event is local to the app only. The app never modifies or deletes events it did not create.**

**App → calendar**
- A one-off task **with a time**, dated today or later, is also created as an event in the primary calendar (default duration 30 min unless an end time was given). It is sent shortly after the change is saved, so changes made offline follow once they sync.
- These events are **private**: people who can see the owner's calendar but not edit it see only "busy". Events written before this rule are made private once, at the next sync.
- Editing, rescheduling or deleting that task in the app updates/deletes the matching event, as does removing its time or making it repeat. The server keeps each task's event ID (table `calendar_links`) to avoid duplicates and to recognise its own events when syncing back.
- One-way for these events: an edit made to one in Google Calendar stays there until the task is changed in the app, and then the app's version wins. Deleting it in Google Calendar doesn't delete the task.
- Events of past days are never changed or deleted. When a task whose event is already past is deleted, the event stays in Google Calendar, and the server forgets its `calendar_links` row (with the title) at the next sync.
- Untimed tasks and habits are **not** written to the calendar.

**OAuth notes**
- Scope: `https://www.googleapis.com/auth/calendar.events` (minimum needed for read + write of events).
- Refresh tokens are stored server-side only, encrypted (AES-256-GCM, key in `TOKEN_ENCRYPTION_KEY`), never sent to the browser. Only the server, with the Supabase secret key, can read them.
- ⚠️ A Google OAuth app left in "Testing" status issues refresh tokens that expire after 7 days. Set the consent screen to "In production" (unverified is fine for personal use; the owner sees the "Google hasn't verified this app" screen once).
- Publishing needs the Branding page filled in: home page `https://planto-me.vercel.app`, privacy policy `https://planto-me.vercel.app/privacy`, authorised domains `planto-me.vercel.app` and the Supabase project domain (`<project-ref>.supabase.co`). No logo: uploading one makes Google require verification.

### 5.2 Voice input (free)

- Record audio in the browser with `MediaRecorder` (iOS produces `audio/mp4`), upload to a server route.
- **Transcription:** Groq API, Whisper Large v3 (or v3 Turbo). Free tier, no credit card; limits are far above personal use (≈2,000 requests/day and several hours of audio per day — verify current limits in Groq docs).
- **Fallback:** Cloudflare Workers AI `whisper-large-v3-turbo` (free daily allocation of 10,000 neurons ≈ 200 audio minutes/day).
- Do **not** rely on the browser Web Speech API: it does not work in iOS web apps added to the Home Screen.
- Languages: Ukrainian, Russian, English, and mixtures of them in one sentence. Don't force a language; let the model auto-detect.

### 5.3 Understanding tasks (text, voice transcript, images, documents)

A single server-side "parser" turns input into structured tasks:

```json
{
  "tasks": [
    {
      "title": "Call the bank",
      "date": "2026-10-31",
      "time": "15:00",
      "endTime": null,
      "recurrence": null,
      "isHabit": false,
      "notes": null,
      "location": null
    }
  ]
}
```

Rules:
- Resolve relative dates ("tomorrow", "on Friday", "завтра", "в п'ятницу") in Europe/Madrid.
- **No day mentioned → today.** Time mentioned → timed task (and a calendar event).
- An end time earlier than the start means the next morning ("22:00–01:00"); an end equal to the start is ignored.
- Recurrence phrases ("every weekday", "каждый день", "щопонеділка") → recurring item.
- Several tasks in one input → several items.
- Keep task titles in the language the owner used; do not translate. All interface text stays English.
- **Images & documents** (screenshots of invitations, emails, PDFs): extract the event/task, date, time and location. Store the original file privately (Supabase Storage, private bucket) and link it from the task.
- Model: Claude API (latest Haiku model — check docs.claude.com for the current model ID) for text, images and PDFs; best quality for Ukrainian/Russian. Costs cents per month at personal volume.
- Put the LLM behind a small provider interface so a free model (e.g. a Groq-hosted vision model) can be switched on via env var.
- Return strict JSON (validate with zod); on failure, add the raw text as an untimed task for today rather than losing it.

### 5.4 Carry-over rules

| Item | Not done by end of day → |
|---|---|
| Untimed task | Moves automatically to the next day (at local midnight). A subtle "from Tue" hint is fine. |
| Timed task (created in app) | 20:00 push → Wrap-up screen: Done / Move to tomorrow / Pick a day. If still undecided at midnight, it stays on its day and shows under "Needs a decision" on Today. Moving it also moves its calendar event. |
| Calendar event (not created in app) | Nothing happens; it's an event, not a task. |
| Habit / recurring item | Never carries over; it simply appears again on its next scheduled day. |

In the real app the database does the moving (`public.carry_over()`, once a day per device, after that device's own changes are in), judged by the stored data. A device with an old copy can never bring back a task deleted on the other device or reopen one checked off there. The list shows carried tasks right away, offline too. A check-off on the task's day or any later past day counts as done: offline, a carried task shows (and gets checked off) on the new day before the database has moved it.

### 5.5 Recurring tasks & habits

- Recurrence options: daily, weekdays, chosen weekdays, every N days, monthly on a date.
- Habits appear **inside the daily list together with everything else**, marked only by a small recurring icon.
- Non-intrusive: no streak counters on the main screen, no "you missed it" messages, no extra notifications for habits unless the habit has a time.

### 5.6 Notifications (Web Push)

- iOS supports Web Push for web apps added to the Home Screen (iOS 16.4+). Permission is requested from a user tap (e.g. in Settings or on first launch after install).
- **Reminders:** 15 minutes before every timed task, and before timed calendar events (toggle).
- **Wrap-up:** at 20:00 if there are unfinished timed tasks today ("2 tasks left today — wrap up?"). No push if there's nothing to decide.
- Scheduler: Supabase `pg_cron` calling an Edge Function every few minutes (Vercel's free cron is limited to daily jobs — verify current limits). VAPID keys stored as secrets.

### 5.7 Sync & storage

- Supabase Postgres is the source of truth for tasks, completions, recurrence rules, push subscriptions, settings and encrypted Google tokens. A task's recurrence rule is stored with the task (one rule per task).
- Timed tasks are stored as UTC instants; days and wall-clock times are computed in Europe/Madrid.
- Row Level Security on every table. Only the allowed email can get an account at all (a "before user created" hook), and every policy also checks that email.
- Optimistic UI: actions apply instantly and sync in the background; queue changes when offline and replay when back online.
- Each device keeps a copy of the data, calendar events included, so the app opens instantly and works offline. It shows that copy at once and checks the session in the background (that check can take half a minute on a bad network). Changes from the other device arrive within seconds (Supabase Realtime) and on every app open.
- No change is ever dropped. One the server refuses stays queued and is retried; check-offs stay when a task is deleted, so Undo brings them back.
- A small status line appears only when something isn't synced yet: "Saving…", "Offline · changes are kept on this device", "Couldn't save · kept on this device" (with Retry), or "Signed out · changes are kept on this device" (with Sign in).
- Sign out signs out this device only, and asks first if changes haven't been sent yet.
- On a computer one tab at a time syncs: opening another tab pauses the first, which offers "Use it here".

---

## 6. Privacy, security & the public repo

- The GitHub repo is **public** (portfolio). It must never contain secrets, tokens, or personal data.
- All keys live in Vercel / Supabase environment settings and a local `.env.local` that is git-ignored. The repo has `.env.example` with placeholders only.
- Enable GitHub secret scanning and push protection. Add a secret-scan step (e.g. gitleaks) to CI.
- Seeds, fixtures, tests and screenshots use invented data only.
- **Production app:** sign-in with Google, restricted to a single allowed email (`ALLOWED_EMAIL` env var). Anyone else is rejected server-side.
- AI and Google API calls happen only on the server.
- Preview deployments of the real app (e.g. from Dependabot pull requests) build in demo mode, so they never touch real services.
- A public privacy policy at `/privacy`, linked from the sign-in page and from Google's consent screen. Keep it true whenever the app starts using data in a new way (new provider, new kind of data).

## 7. Public demo

- A separate deployment (same code, `NEXT_PUBLIC_DEMO_MODE=true`) linked from the README.
- No sign-in, no real Google account, no real keys. Uses a mock calendar and sample tasks; data is kept in the visitor's browser and can be reset.
- Voice and image input in the demo run against canned example results (so the owner's free quotas and keys can't be abused). The demo never asks for the microphone.
- Typed text in the demo is understood by a small built-in rule-based parser (days, times and repeats in English, Russian and Ukrainian), so it needs no AI.
- A small "Demo — sample data" label.
- First-time visitors see a short, dismissible tip: swipe for the coming days, type a task, try the mic and the paperclip. Once dismissed it stays hidden in that browser.

---

## 8. Design

- **Mood:** calm, minimal, light. Inspired by the clean, full-screen list feel of apps like HelloHabits — but an original design (no copied assets, icons or branding).
- **Colors**
  - Background: off-white `#FAF8F4`
  - Accent: orange gradient `#FF7A2F → #FFB15C` (add button, mic, active states, app icon)
  - Primary text: near-black `#141414`
  - Secondary text: smoky blue-gray `#5B6B80`
  - Dividers/subtle UI: `#E9E5DE`
- **Type:** system font stack (`-apple-system`, SF Pro) or Inter; large, airy task titles; generous line height and spacing.
- Round checkboxes with a soft orange fill when checked.
- Respect iPhone safe areas; thumb-friendly bottom bar; subtle motion only.
- Light mode only.
- App icon: simple original mark on the orange gradient.

## 9. Acceptance checklist

- [ ] Installs on iPhone from the Home Screen and opens full-screen with no browser UI.
- [ ] A push to `main` shows up in the installed app after relaunch.
- [ ] Today shows all-day events without a time and timed events with their time.
- [ ] Swipe right shows tomorrow; tapping the header returns to today.
- [ ] Saying "завтра о 15:00 подзвонити в банк" creates a task tomorrow at 15:00 and a matching Google Calendar event.
- [ ] A screenshot of an invitation becomes a task with the right date and time.
- [ ] Checking off a calendar event changes nothing in Google Calendar.
- [ ] An untimed unfinished task appears on the next day automatically.
- [ ] At 20:00 a push arrives if timed tasks are unfinished, and the wrap-up screen works.
- [ ] 15-minute reminders arrive for timed items.
- [ ] The repo contains no secrets or personal data; the demo works without any keys.
