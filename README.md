# Amazon Order Extractor

Work-in-progress browser extension that scrapes Amazon.in order history to export CSVs and optionally download invoices. See `docs/PLAN.md` for architecture/roadmap.

## Privacy
- All scraping, CSV generation, and invoice downloads happen locally in your browser; no order data is sent off-device.
- If a future feature needs to call external services, it must be explicitly consented to by the user before any data leaves the machine.

## Getting Started

1. Install Node.js 22+ and npm 10+.
2. Install dependencies: `npm install`
3. Build in watch mode: `npm run dev`
4. Load the `dist/` directory as an unpacked extension in Chrome/Edge or via `web-ext` for Firefox.

## Scripts

| Command            | Description                               |
| ------------------ | ----------------------------------------- |
| `npm run dev`      | Builds extension assets with watch mode   |
| `npm run build`    | Production build (minified, no sourcemap)  |
| `npm run clean`    | Remove `dist/`                             |
| `npm run lint`     | ESLint across `src`                       |
| `npm run test`     | Vitest (unit/integration)                 |
| `npm run e2e`      | Playwright E2E against local fixtures     |
| `npm run e2e:install` | Install Playwright Chromium            |
| `npm run typecheck`| TypeScript `--noEmit` checks              |
| `npm run format`   | Prettier write                            |
| `npm run format:check` | Prettier verify                       |
| `npm run security:audit` | npm audit (high/critical)          |

E2E environment toggles:
- `E2E_HEADLESS=1` to run without a visible browser window.
- `E2E_SLOWMO=250` to slow browser actions for debugging.
- `E2E_VIDEO=1` to record videos into `test-results/videos`.
- `E2E_TRACE=0` to disable trace capture (enabled by default).

Scraping, CSV export, invoice downloads (opt-in), and highlights are implemented and evolving.

## Security
- We run CodeQL + Trivy scans in GitHub Actions and keep dependencies updated with Dependabot.
- Report vulnerabilities via `SECURITY.md`.
- Fixtures in `docs/samples` are sanitized and must not contain PII.
- Optional local scan (if installed): `trivy fs . --severity HIGH,CRITICAL`

## Contributing
See `CONTRIBUTING.md` and `CODE_OF_CONDUCT.md` for guidance.

## License
MIT. See `LICENSE`.
