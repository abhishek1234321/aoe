# Order Extractor Extension – Working Plan

## Goals (Phase 1)
- Scrape Amazon.in order history (order ID, date, buyer, total, status, invoice link) and export to CSV.
- Keep runs stable via a 1,000-order cap and optional year filter.
- Show clear status/error messages; keep user data local (no external calls).

## Current Status
- Content script parses order cards, handles pagination, applies time filters, and extracts available filters from the page.
- Popup: time filter selection, start/reset, CSV download; zero-state card when not on an order page.
- CSV is generated client-side on download; invoice downloads are opt-in with progress and retry hints.
- Background scraping runs in a hidden tab to avoid disrupting the user.
- Security baseline: CI lint/typecheck/tests, CodeQL + Trivy scans, Dependabot, npm audit (high/critical).
- Fixture archive added for Amazon.in snapshots; fixtures are sanitized and versioned by date.

## Active Fixes (QA)
- [x] Header spacing/padding for the run cap line.
- [x] Replace “scrape” wording in user-facing text (use “export”).
- [x] Improve popup height/scroll area (sticky header/footer + body space).
- [x] Orders progress should use total orders in range when available (avoid default 0/1000).
- [x] Parse order count from the time-filter label (`.num-orders`) as a hint.
- [x] Back button should be icon-only.
- [x] Hide “Download invoices from last export” unless invoices were requested.
- [x] Confirm/document service worker usage and purpose (MV3 background worker in `src/background/index.ts`).

## Next Up
1. Improve scraping UX (avoid user disruption while paging; move pagination to a background/hidden tab). ✅
2. Harden time-filter handling and fallbacks (surface errors, handle missing dropdowns gracefully). ✅
3. Invoice download manager (queue, throttle, retries) once CSV scrape is solid. ✅
4. Expand parser/CSV tests with markup variants. ✅
5. Polish popup UX (status/error clarity, disable states). ✅
6. E2E tests against local fixtures (no live Amazon). ✅
7. Store prep: finalize listing copy/assets, keep debug off in prod, and ensure invoice downloads stay opt-in. ⏳

## Risks / Watch
- Large histories (>1k) still need chunking UX beyond the time filter.
- Invoice links/markup can vary; need defensive parsing.
- Optional permissions (downloads/notifications) require clear user guidance.

## How to Run / Debug
- Dev (unminified + sourcemaps): `npm run dev` then reload the unpacked extension.
- Clean: `npm run clean`; Prod build: `npm run build`.
- Logs: `[AOE:content]` in the page console, `[AOE:bg]` in service-worker console; toggle `DEBUG_LOGGING` in constants.

## Decisions (active)
- Marketplace scope: Amazon.in only (selectors modular for future regions).
- Year filter preferred; 1,000-order cap per run.
- CSV built in popup at download time.

## Open Questions
- Do we need pagination safeguards beyond yearly chunking for users with 2k+ orders?
- Should invoice downloads allow configurable concurrency or stick to a fixed low number (e.g., 2 at a time)?

## Implementation Steps
1. Scaffold project (Vite + TS), add manifest template(s), linting, npm scripts.
2. Build popup UI shell and messaging plumbing (popup ⇄ background ⇄ content).
3. Implement DOM scraper with pagination controls and normalization utilities.
4. Add CSV export + storage layer.
5. Implement invoice download manager with throttling + retry logic.
6. Polish UI (status, error handling), verify cross-browser adjustments, document usage/build steps.

## Open Questions
- Do we need pagination safeguards beyond yearly chunking for users with 2k+ orders?
- Should invoice downloads allow configurable concurrency or stick to a fixed low number (e.g., 2 at a time)?
