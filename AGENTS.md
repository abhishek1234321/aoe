# Amazon Order Extractor — Agent Guide

## Project summary
- Browser extension (MV3) that scrapes Amazon.in order history, tracks scrape progress, and exports CSVs from the popup. Invoice downloading is not implemented yet; invoice URLs are only collected.
- Modules: React popup (`src/popup`), background service worker (`src/background`), content script (`src/content`), shared utilities (`src/shared`). Build via Vite.
- Time filters: we now respect all dropdown options on the Amazon page (e.g., last 30 days, past 3 months, specific years). The content script applies the selected option before scraping.

## Run / build
- Dev watch: `npm run dev` (popup/background + content watch; `dist/` is not emptied between concurrent watch tasks).
- Prod build: `npm run build` (cleans `dist/` and rebuilds).
- Load `dist/` as the unpacked extension; hit Reload in the extensions page after changes.

## Tests / checks
- Unit tests: `npm run test:ci` (Vitest; fixtures in `docs/samples/amazon.in`).
- Type check: `npm run typecheck`.
- Lint/format: `npm run lint`, `npm run format:check`.

## Key behaviors & files
- Time filters: `src/shared/timeFilters.ts` parses all `#time-filter` options (months and years) and applies a selected value; fallback options include last30/months-3 and recent years. The content script waits up to ~8s for the dropdown to appear (`src/content/index.ts`).
- Popup: surfaces available filters and starts/reset scrape sessions, builds CSV client-side (`src/popup/App.tsx`, `src/shared/csv.ts`).
- Background session state: merges progress, caps runs at `MAX_ORDERS_PER_RUN` (1000), persists in `browser.storage.session` (`src/background/index.ts`, `src/shared/types.ts`).
- Scraping: content script parses order cards, auto-clicks next page in the same tab, and resumes via sessionStorage (`src/content/index.ts`, `src/shared/orderParser.ts`).
- Manifest/icons: `public/manifest.json`, icons in `public/icons/` (Amazon-themed SVG + generated PNGs).

## Known gaps / cautions
- Pagination currently navigates the active tab; this can disrupt the user. Consider background tab or fetch-based pagination before shipping widely.
- Invoice download queue is not built; adding it will need throttling, retries, and session progress reporting.
- Time filter reliance on `#time-filter` selector—if Amazon changes markup, update `timeFilters.ts` and fixtures.
- Keep `DEBUG_LOGGING` toggle in `src/shared/constants.ts` in mind when changing logs.

## Practical notes
- Prefer `rg` for search; use `apply_patch` for manual edits. Avoid destructive git commands.
- Preserve sample HTML in `docs/samples/amazon.in/` and extend fixtures/tests when selectors change.
- Popup layout is flexible width (min ~360px, max ~440px); avoid shrinking below that to prevent clipping.
- For UX-impacting changes (new flows, download behavior, prompts), propose options and get user sign-off before implementing. Default to opt-in toggles when the change could surprise users.
- Privacy: keep all order data processing local. No external calls without explicit, informed user consent. If a feature must call out, surface a clear prompt and document the data sent.
- Store prep: use production builds with `DEBUG_LOGGING` off; keep listing privacy text consistent with README/popup; downloads permission is used only when invoices are opted in; host scope is amazon.in only.
