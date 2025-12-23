# Order Extractor Extension Plan

## Goals
- Extract order metadata (ID, date, buyer name, total, item titles, status, invoice link) from Amazon India order history.
- Export structured data to CSV and download invoice PDFs when present.
- Run the same codebase on Chromium, Firefox, and (via converter) Safari.

## Architecture Snapshot
- **Manifest**: MV3 base manifest with build-time tweaks per browser. Permissions: `activeTab`, `scripting`, `downloads`, `storage`, host access for Amazon order pages.
- **Popup UI**: React/Vite UI that lets users set date ranges, start scraping, monitor progress, and trigger CSV download.
- **Content script**: Injected scraper that parses the DOM, normalizes values, follows pagination, and reports results back to the service worker.
- **Background service worker**: Coordinates scraping sessions, throttles invoice downloads, manages CSV building, persists state, and communicates status to the popup.
- **Shared utils**: Type definitions, DOM helpers, CSV generator, Amazon-specific parsers, and logging helpers.
- **State management**: The background service worker maintains canonical session state (progress, discovered orders, invoice download queue) in memory and mirrors checkpoints to `browser.storage.session`. The popup subscribes to state updates via runtime messaging, enabling the UI to reconnect after reloads without restarting the scrape.

## Tooling & Dependencies
- **Runtime**: Node.js 22.x LTS, npm 10.x (latest LTS gives longer support window and modern JS features such as faster `fetch` and WebStreams).
- **Build/bundler**: Vite 5.x with React plugin—fast HMR during development and simple multi-entry bundling for popup/background/content targets.
- **UI stack**: React 19.2.3 + ReactDOM 19.2.3 (latest stable) with TypeScript 5.9.x and CSS Modules. No heavyweight UI framework for now; hand-rolled components keep bundle size small and give us tight control over popup layout.
- **Browser APIs**: `webextension-polyfill` 0.10.x for consistent `browser.*` namespace across Chrome/Edge/Firefox and manifest typing.
- **Type helpers**: `@types/chrome` 0.0.latest and `@types/firefox-webext-browser` for build-time safety, along with ESLint 8.x + Prettier 3.x for lint/format.
- **CSV + utilities**: `papaparse` 5.x (small footprint, battle-tested), `date-fns` 3.x for parsing/formatting order dates.
- **Testing**: Vitest 1.x for unit tests on parsing utilities (optional but easy to add later).

Version policy: start with the newest stable releases listed above; when tooling updates, we can bump within the same major after running tests. If we hit regressions undocumented in training data, we lean on upstream changelogs, docs, and source to diagnose—staying on actively maintained versions gives us better fixes and community support than pinning to older builds.

## Authentication & Privacy
- We assume the user is already logged into amazon.in in the active browser profile; the extension never handles credentials. All scraping occurs within the user’s session and no network requests leave the browser besides Amazon endpoints.
- Manifest permissions stay minimal (`activeTab`, `scripting`, specific amazon.in hosts, `downloads`, `storage`). No external servers or analytics—data remains on the user’s machine.

## Scope Decisions
- **Data granularity**: Phase 1 targets order-level summaries only (no per-item breakdown) while keeping the model flexible for future detail.
- **Pagination depth**: Default run scrapes all historic orders; popup exposes an optional “year” selector to chunk older histories and avoid browser overload.
- **Order cap**: Hard limit scraping to the first 1,000 orders per run. If the total count exceeds 1,000 we prompt the user to narrow by year; this guards against memory/timeout issues until we optimize further.
- **Marketplace**: Focus exclusively on amazon.in selectors/endpoints for now; keep parser hooks modular so other regions can be added later.

## Testing Strategy
- **Unit tests** (Vitest): DOM parser utilities, currency/date normalization, CSV generators.
- **Integration tests**: Headless DOM fixtures simulating order cards to ensure content-script logic handles pagination, missing invoices, and the 1,000-order cap.
- **E2E smoke**: `web-ext run` (Firefox) and Chrome’s extension loader with a mocked Amazon page to verify popup ⇄ background ⇄ content messaging plus invoice download flows. Manual testing remains essential before releases, but we automate regression checks where feasible.

## Packaging & Distribution
- Build variants: `npm run build:chromium` bundles MV3 manifest for Chrome/Edge; `build:firefox` swaps Firefox-specific manifest tweaks and runs `web-ext lint/sign`; `build:safari` feeds the generated bundle into `xcrun safari-web-extension-converter`.
- Versioning + changelog tracked via `package.json` and Git tags; release artifacts stored under `dist/<browser>` with zipped packages ready for stores or sideloading.

## Error Handling & Limits
- Preflight: content script reads the “xx orders placed” summary Amazon shows per filter; if >1,000, popup shows an actionable warning and aborts until the user applies a smaller range.
- Pagination: throttle navigation with short delays, detect stuck states (e.g., no new orders found after a page change) and surface errors.
- Invoice downloads: queue with configurable concurrency (default 2), exponential backoff on 429/5xx, final status per order in the CSV and popup.
- All error events logged (debug console + optional downloadable log for bug reports).

## Configuration & Secrets
- No API keys or external services. Runtime configuration limited to build-time env (e.g., `VITE_AMAZON_HOST` defaulting to `www.amazon.in`) so forks can retarget regions without touching code.
- User-facing settings (year filter, invoice download toggle, concurrency) stored in `browser.storage.sync` for convenience but never include sensitive data.

## Delivery Workflow
- Short-lived feature branches off `main` (e.g., `feat/scaffold-extension`, `feat/scraper`) keep work isolated; merge via PR after review/testing. For tiny fixes we can commit directly to `main`, but default to feature branches so history stays clean even early on.
- Conventional Commits (`feat:`, `fix:`, `docs:`) for clarity and automated changelog generation later.
- Continuous push to GitHub: run lint/tests locally before PR; CI (to be added later) will re-run checks. Releases are tagged (e.g., `v0.1.0`) after verified builds from `main`.

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
