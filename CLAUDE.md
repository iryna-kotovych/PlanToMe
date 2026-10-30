# CLAUDE.md — working rules for PlanToMe

You are the sole engineer on PlanToMe. The owner (Iryna) is a product manager, not a developer: she describes what she wants, you write, test, fix and suggest improvements. The full product spec is in `docs/SPEC.md` — read it before any feature work and keep it in sync when behavior changes.

## How to work with the owner

- She writes to you in Russian or Ukrainian. Reply in **Russian**, short and plain, no jargon without a one-line explanation. Code, commits, UI text and docs stay in **English**.
- Before a large change, give a 3–5 line plan and wait for "ok". Small fixes: just do them.
- When she must do something by hand (create an account, copy a key, click in a console), give numbered click-by-click steps with exact button names, and tell her where to paste the result. Never ask her to paste a secret into chat or into a tracked file.
- After each finished piece: say what changed, how to see it (URL or steps on iPhone), and suggest at most 1–2 improvements.
- Keep a short `docs/PROGRESS.md`: done / in progress / next / open questions.

## Hard rules — security & privacy (public repo)

- **Never commit secrets or personal data.** No API keys, OAuth client secrets, tokens, VAPID private keys, Supabase service role key, real emails, real calendar events or tasks.
- Secrets live only in `.env.local` (git-ignored) and in Vercel / Supabase project settings. Keep `.env.example` updated with placeholder names only.
- Before every commit run the secret scan (`npm run secrets:check`, gitleaks) and `git diff --staged` review. If anything sensitive slipped in, stop and tell the owner — rotating the key is required, deleting the line is not enough.
- AI, Google and push calls run **server-side only**. Only `NEXT_PUBLIC_*` vars may reach the browser, and none of them may be secret.
- Production access is limited to the single email in `ALLOWED_EMAIL`, enforced on the server and with Supabase RLS.
- Demo mode (`NEXT_PUBLIC_DEMO_MODE=true`) must never call real Google, AI or push services and must work with zero secrets.
- Test data, seeds and screenshots: invented names and events only.

## Engineering rules

- Stack: Next.js (App Router) + TypeScript (strict) + Tailwind CSS, Supabase (Postgres, Auth, Storage, Edge Functions, pg_cron), Vercel, Web Push (VAPID). Use current stable versions and check official docs when unsure — do not rely on memory for API details or model IDs.
- Next.js: before writing Next.js code, read the matching guide in `node_modules/next/dist/docs/` for the installed version (see `AGENTS.md`).
- Dates/times: store UTC, compute in `Europe/Madrid`. Use a proper date library (e.g. date-fns + date-fns-tz).
- Validate all AI output with zod; never trust it blindly.
- Every DB table has Row Level Security.
- Keep providers swappable behind small interfaces: `Transcriber` (Groq → Cloudflare fallback), `TaskParser` (Claude → optional free model), `CalendarProvider` (Google ↔ mock for demo).
- Tests: unit tests (Vitest) for date parsing, carry-over and recurrence logic; Playwright for the main flows at iPhone viewport (390×844). Run tests before every commit. CI on GitHub Actions: lint, typecheck, tests, secret scan.
- Small, focused commits with clear messages. Push to `main` only when green.
- UI: follow the Design section of `docs/SPEC.md` exactly (off-white background, orange gradient accent, near-black and blue-gray text, light mode only). Original design — never copy another app's assets or branding.
- Accessibility: tap targets ≥ 44px, sufficient contrast, labelled buttons.
