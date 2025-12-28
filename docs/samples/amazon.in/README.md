# Amazon.in fixtures

These HTML fixtures mirror the Amazon.in order pages for parsing and E2E tests.
All fixtures must be sanitized and contain no PII (names, addresses, real order IDs, invoices).
See `docs/samples/README.md` for shared rules and validation.

## Current fixtures
- `order-list.html`
- `order-single.html`
- `time-filter.html`
- `invoice-popover.html`
- `e2e-orders.html`

## Archive
When fixtures change, copy the previous versions into `archive/YYYY-MM-DD/` so we can compare DOM changes over time.
