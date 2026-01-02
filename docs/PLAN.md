# Order Extractor Extension – Working Plan

## Goals (Phase 1)

- Export Amazon order history (amazon.in, amazon.com, amazon.ca, amazon.co.uk) to CSV, with optional invoice downloads.
- Keep runs stable via a 1,000-order cap and Amazon’s time filter options.
- Keep user data local (no external calls) with explicit opt-in for optional permissions.

## Current Status

- Multi-locale support (IN/US/CA/UK) with fixtures, parsers, and tests.
- Popup: time filter selection, export/reset, CSV download, invoice opt-in, notifications opt-in.
- Highlights view (spend, top items, busiest days) + buyer breakdown.
- Background export runs in a hidden tab to avoid user disruption; status badges and notifications supported.
- Diagnostics and feedback flow (copy/download/email/open issue), privacy messaging in popup footer.
- CI: lint/typecheck/tests, CodeQL + Trivy scans, Dependabot, npm audit (high/critical).

## Done (recent)

- Hidden-tab export workflow and progress UI.
- Optional invoices + notifications with permission prompts.
- Order-count hint via `.num-orders` label.
- Popup UX polish (sticky header/footer, single scroll region).
- E2E tests against local fixtures; fixture validation in CI.
- Support for amazon.in/com/ca/co.uk.

## Next Up (prioritized)

1. Store prep: finalize listing copy/assets, verify privacy policy hosting, and confirm release build settings. ⏳
2. Invoice reliability: add retry for failed invoices + a short per-order failure list. 🚧
3. Long-history UX: guidance + multi-run flow for >1,000 orders. ⏳
4. Manual QA across locales before release. ⏳
5. Add new locales once fixtures are provided (AU/DE/FR/etc.). ⏳

## Risks / Watch

- Large histories (>1k) need chunking UX beyond the time filter.
- Invoice links/markup vary by locale; keep parsing defensive.
- Optional permissions (downloads/notifications) require clear, user-friendly explanations.

## How to Run / Debug

- Dev (unminified + sourcemaps): `npm run dev` then reload the unpacked extension.
- Clean: `npm run clean`; Prod build: `npm run build`.
- Logs: `[AOE:content]` in the page console, `[AOE:bg]` in service-worker console; toggle `DEBUG_LOGGING` in constants.

## Decisions (active)

- Locale scope: amazon.in/com/ca/co.uk; expand via fixtures + parser tweaks.
- Export language in UI (avoid “scrape” wording).
- 1,000-order cap per run; time filter required.

## Open Questions

- Should invoice downloads expose configurable concurrency or keep the fixed low limit?
- Do we need a stronger multi-run UX for 2k+ order histories?
