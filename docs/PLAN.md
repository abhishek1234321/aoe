# Order Extractor Extension – Working Plan

## Goals (Phase 1)
- Scrape Amazon.in order history (order ID, date, buyer, total, status, invoice link) and export to CSV.
- Keep runs stable via a 1,000-order cap and optional year filter.
- Show clear status/error messages; keep user data local (no external calls).

## Current Status
- Content script parses order cards, handles pagination, extracts available years from the page.
+- Popup: year selector (auto-populated), start/reset, CSV download; zero-state card when not on an order page.
-- CSV is generated client-side on download (no Blob storage in SW). Debug logging via `[AOE:content]` / `[AOE:bg]`.

## Next Up
1. Improve scraping UX (avoid user disruption while paging; move pagination to a background/hidden tab).
2. Harden time-filter handling and fallbacks (surface errors, handle missing dropdowns gracefully).
3. Invoice download manager (queue, throttle, retries) once CSV scrape is solid.
4. Expand parser/CSV tests with markup variants.
5. Polish popup UX (status/error clarity, disable states).
7. Store prep: finalize listing copy/assets, keep debug off in prod, and ensure invoice downloads stay opt-in.

## Risks / Watch
- Pagination flow can disrupt the user (same-tab navigation).
- Large histories (>1k) still need chunking UX beyond the year filter.
- Invoice links/markup can vary; need defensive parsing.

## How to Run / Debug
- Dev (unminified + sourcemaps): `npm run dev` then reload the unpacked extension.
- Clean: `npm run clean`; Prod build: `npm run build`.
- Logs: `[AOE:content]` in the page console, `[AOE:bg]` in service-worker console; toggle `DEBUG_LOGGING` in constants.

## Decisions (active)
- Marketplace scope: Amazon.in only (selectors modular for future regions).
- Year filter preferred; 1,000-order cap per run.
- CSV built in popup at download time.

## Open Questions
- Best navigation strategy to avoid user-page disruption during pagination?
- What invoice download concurrency/backoff is safe without throttling? 

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
