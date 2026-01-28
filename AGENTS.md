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

- Unit tests: `npm run test:ci` (Vitest; fixtures in `docs/samples/`).
- Type check: `npm run typecheck`.
- Lint/format: `npm run lint`, `npm run format:check`.
- E2E (fixtures): `npm run e2e` after `npm run e2e:install`.
- Security audit: `npm run security:audit` (high/critical).
- **Full check**: `npm run check` runs lint + typecheck + tests + format check.

## Agent workflow (IMPORTANT)

### Definition of done

Before any change is considered complete, ALL of these must pass:

1. `npm run check` passes (lint + typecheck + tests + format)
2. No new TypeScript errors introduced
3. No new ESLint warnings introduced
4. All existing tests still pass
5. New functionality has corresponding tests (see testing requirements below)
6. Changes are committed with a descriptive message

### Testing requirements by change type

| Change Type                           | Required Testing                                        |
| ------------------------------------- | ------------------------------------------------------- |
| Bug fix                               | Add regression test that would have caught the bug      |
| New utility function in `src/shared/` | Add unit test in `tests/`                               |
| Parser/formatter changes              | Update existing tests or add new ones with fixture data |
| UI changes in popup                   | Run `npm run e2e` to verify flows still work            |
| New message type                      | Document in types, test integration if complex          |
| Selector changes (Amazon markup)      | Update fixtures in `docs/samples/` and related tests    |

### Verification workflow

```
1. Before making changes:
   - Run `npm run check` to establish baseline
   - Understand existing tests for the area you're modifying

2. Making changes:
   - Write/update test first when possible (defines expected behavior)
   - Make the code change
   - Run `npm run typecheck` for fast feedback on type errors
   - Run `npm run test:ci` to verify unit tests pass

3. Before committing:
   - Run `npm run check` (full verification)
   - For UI/flow changes, also run `npm run e2e`
   - Commit only if all checks pass

4. After committing:
   - Verify the commit includes all intended changes
   - Do not amend pushed commits
```

### Fast feedback commands

| Command             | Speed | When to use              |
| ------------------- | ----- | ------------------------ |
| `npm run typecheck` | ~2s   | After any code change    |
| `npm run test:ci`   | ~3s   | After logic changes      |
| `npm run lint`      | ~2s   | Before committing        |
| `npm run check`     | ~8s   | Before every commit      |
| `npm run e2e`       | ~30s  | Only for UI/flow changes |

### What NOT to do

- Do not skip tests to "fix later"
- Do not commit with failing tests
- Do not modify `docs/samples/` fixtures without updating related tests
- Do not add external API calls without explicit user consent (privacy-first)
- Do not use `git push --force` on main branch
- Do not remove existing tests without justification

## Key behaviors & files

- Time filters: `src/shared/timeFilters.ts` parses all `#time-filter` options (months and years) and applies a selected value; fallback options include last30/months-3 and recent years. The content script waits up to ~8s for the dropdown to appear (`src/content/index.ts`).
- Popup: surfaces available filters and starts/reset export sessions, builds CSV client-side (`src/popup/App.tsx`, `src/shared/csv.ts`).
- Background session state: merges progress, caps runs at `MAX_ORDERS_PER_RUN` (1000), persists in `browser.storage.session` (`src/background/index.ts`, `src/shared/types.ts`).
- Exporting: content script parses order cards, auto-clicks next page, and resumes via sessionStorage; background opens a hidden tab to avoid disrupting the user (`src/content/index.ts`, `src/background/index.ts`).
- Manifest/icons: `public/manifest.json`, icons in `public/icons/` (Amazon-themed SVG + generated PNGs).

## Architecture overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Extension Structure                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    messages     ┌──────────────────┐          │
│  │    Popup     │◄───────────────►│    Background    │          │
│  │  (React UI)  │                 │ (Service Worker) │          │
│  └──────────────┘                 └────────┬─────────┘          │
│        │                                   │                     │
│        │ user clicks                       │ opens hidden tab    │
│        ▼                                   ▼                     │
│  ┌──────────────┐    messages     ┌──────────────────┐          │
│  │   Shared     │◄───────────────►│  Content Script  │          │
│  │  Utilities   │                 │  (Amazon page)   │          │
│  └──────────────┘                 └──────────────────┘          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

Key files by module:

- **Popup**: `src/popup/App.tsx` (main UI), `src/popup/App.css` (styles)
- **Background**: `src/background/index.ts` (message handling, session state)
- **Content**: `src/content/index.ts` (DOM scraping, page navigation)
- **Shared**: `src/shared/*.ts` (parsers, formatters, types, constants)

## Test file locations

| Source File                 | Test File                                           | What's Tested                           |
| --------------------------- | --------------------------------------------------- | --------------------------------------- |
| `src/shared/orderParser.ts` | `tests/orderParser.test.ts`                         | Order card parsing from HTML            |
| `src/shared/csv.ts`         | `tests/csv.test.ts`, `tests/csvIntegration.test.ts` | CSV generation                          |
| `src/shared/format.ts`      | `tests/format.test.ts`                              | Date/currency formatting                |
| `src/shared/highlights.ts`  | `tests/highlights.test.ts`                          | Spend analytics                         |
| `src/shared/timeFilters.ts` | `tests/yearFilter.test.ts`                          | Time filter parsing                     |
| `src/shared/invoice.ts`     | `tests/invoiceParser.test.ts`                       | Invoice URL extraction                  |
| E2E flows                   | `tests/e2e/extension.spec.ts`                       | Full extension integration              |
| Fixtures                    | `tests/fixtures.test.ts`                            | Fixture validation (no PII, valid HTML) |

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
