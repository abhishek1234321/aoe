# Contributing

Thanks for taking the time to contribute! This project is a browser extension for exporting Amazon.in order history and (optionally) invoices.

## Ground rules
- Be respectful and follow the Code of Conduct (`CODE_OF_CONDUCT.md`).
- Keep user privacy intact: no external data transfers without explicit user consent.
- Prefer small, focused pull requests with clear descriptions.

## Development setup
1. Install Node.js 22+ and npm 10+.
2. Install dependencies: `npm install`
3. Dev build/watch: `npm run dev`
4. Production build: `npm run build`

## Quality checks
Run these before opening a PR:
- `npm run lint`
- `npm run typecheck`
- `npm run test:ci`
- `npm run format:check`

## E2E tests (fixtures)
We run extension E2E against local HTML fixtures (not live Amazon pages).
1. Install the Playwright browser once: `npm run e2e:install`
2. Run E2E: `npm run e2e`

## Tests
Unit/integration tests live in `tests/` and use fixtures in `docs/samples/amazon.in/`.
Add or update fixtures if Amazon markup changes.

## Submitting a PR
- Describe what changed and why.
- Add/adjust tests for parser, filters, CSV, or highlights changes.
- Update `docs/PLAN.md` or `docs/STORE.md` if the change affects roadmap or store listing.

## Reporting issues
Use GitHub Issues: https://github.com/abhishek1234321/aoe/issues
