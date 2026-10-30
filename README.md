# PlanToMe

[![CI](https://github.com/iryna-kotovych/PlanToMe/actions/workflows/ci.yml/badge.svg)](https://github.com/iryna-kotovych/PlanToMe/actions/workflows/ci.yml)

A calm, minimal daily to-do app for iPhone, built as an installable web app (PWA).

- One full-screen list for today: Google Calendar events, tasks and habits together, each with a checkbox. Swipe right for tomorrow.
- Add tasks by voice (Ukrainian, Russian, English), by text, or from a screenshot of an invitation or email. The app works out the day and time.
- Two-way sync with Google Calendar (primary calendar).
- Untimed tasks roll over to the next day automatically; timed ones get a gentle 20:00 check-in. Reminders 15 minutes before.
- Installs from the Home Screen, no App Store. Updates itself on every push.

**Status:** in development. Live demo with sample data: **[plantome-demo.vercel.app](https://plantome-demo.vercel.app)** (best on iPhone: Share → Add to Home Screen).

Built by [Iryna Kotovych](https://github.com/iryna-kotovych) as a product manager working with Claude Code as the engineer. Product spec: [`docs/SPEC.md`](docs/SPEC.md).

## Privacy

This repository is public and contains no keys, tokens or personal data. Secrets live only in hosting and database settings. The demo runs on invented data and never touches real calendars or AI services.
