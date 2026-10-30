# Progress

## Done

- **Phase 0 — Project setup:** Next.js 16 + TypeScript + Tailwind scaffold, ESLint, typecheck, Vitest, Playwright (iPhone 390×844), gitleaks secret scan (`npm run secrets:check` + pre-commit hook), GitHub Actions CI, public GitHub repo with secret scanning and push protection.

## In progress

- Waiting for the owner's "ok" on Phase 0.

## Next

- **Phase 1 — Public demo:** Today screen, demo mode with sample data, PWA install, deploy to `plantome-demo.vercel.app`.

## Open questions

- Production URL: `plantome.vercel.app` is taken by someone else. Pick another name in Phase 2.

## Decisions

- Days can be viewed from today up to 7 days ahead.
- Demo sample data is invented by the engineer.
- App icon: "List row" — a checked round checkbox next to two text lines, white on the orange gradient.
- GitHub: secret scanning, push protection and Dependabot alerts are on.
- Node 24 LTS on CI and Vercel. Local Mac runs Node 26, which is compatible.
