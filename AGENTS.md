# Amazon Order Extractor — Agent Guide

## Project summary

- Browser extension (MV3) that exports Amazon order history (amazon.in/com/ca/co.uk), tracks export progress, exports CSVs, and optionally downloads invoices (opt-in).
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
- E2E (fixtures): `npm run e2e` after `npm run e2e:install`.
- Security audit: `npm run security:audit` (high/critical).

## Key behaviors & files

- Time filters: `src/shared/timeFilters.ts` parses all `#time-filter` options (months and years) and applies a selected value; fallback options include last30/months-3 and recent years. The content script waits up to ~8s for the dropdown to appear (`src/content/index.ts`).
- Popup: surfaces available filters and starts/reset export sessions, builds CSV client-side (`src/popup/App.tsx`, `src/shared/csv.ts`).
- Background session state: merges progress, caps runs at `MAX_ORDERS_PER_RUN` (1000), persists in `browser.storage.session` (`src/background/index.ts`, `src/shared/types.ts`).
- Exporting: content script parses order cards, auto-clicks next page, and resumes via sessionStorage; background opens a hidden tab to avoid disrupting the user (`src/content/index.ts`, `src/background/index.ts`).
- Manifest/icons: `public/manifest.json`, icons in `public/icons/` (Amazon-themed SVG + generated PNGs).

## Known gaps / cautions

- Large histories beyond 1,000 orders need chunking UX beyond filters.
- Invoice links/markup can vary; keep parsing defensive and update fixtures/tests as needed.
- Time filter reliance on `#time-filter` selector—if Amazon changes markup, update `timeFilters.ts` and fixtures.
- Keep `DEBUG_LOGGING` toggle in `src/shared/constants.ts` in mind when changing logs.

## Practical notes

- Prefer `rg` for search; use `apply_patch` for manual edits. Avoid destructive git commands.
- Preserve sample HTML in `docs/samples/` and extend fixtures/tests when selectors change.
- Keep fixture history in `docs/samples/<locale>/archive/YYYY-MM-DD/` and ensure fixtures have no PII.
- Popup layout is flexible width (min ~360px, max ~440px); avoid shrinking below that to prevent clipping.
- For UX-impacting changes (new flows, download behavior, prompts), propose options and get user sign-off before implementing. Default to opt-in toggles when the change could surprise users.
- Privacy: keep all order data processing local. No external calls without explicit, informed user consent. If a feature must call out, surface a clear prompt and document the data sent.
- Store prep: use production builds with `DEBUG_LOGGING` off; keep listing privacy text consistent with README/popup; downloads permission is used only when invoices are opted in; host scope is amazon.in/com/ca/co.uk.
