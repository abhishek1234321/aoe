# HTML fixtures (all locales)

These fixtures are sanitized snapshots of Amazon order pages used for parsing and E2E tests.
They must not contain PII or full production HTML.

## What to capture per locale
- `order-list.html`: multiple orders list view (2+ orders)
- `order-single.html`: one order card with invoice link
- `time-filter.html`: the time filter dropdown (`#time-filter`)
- `invoice-page.html` or `invoice-popover.html`: the invoice link response/page
- `e2e-orders.html`: minimal end-to-end orders page

## Sanitization rules
- Remove scripts, styles, and external assets.
- Replace real names, addresses, emails, and order IDs with placeholders.
- Keep only the DOM elements needed by the parser (order cards, time filter, invoice links).
- Use example links or relative paths; avoid real URLs or tokens.

## Validation
Run `npm run fixtures:check` before committing fixtures. CI will fail if raw HTML is committed.

## Adding a new Amazon locale
- Add the host to `src/shared/amazonHosts.json`.
- Update `public/manifest.json` and `public/manifest.e2e.json` host permissions/matches.
- Add fixtures under `docs/samples/<locale>/`.

## Archiving
When a fixture changes, copy the previous version into `docs/samples/<locale>/archive/YYYY-MM-DD/`.
