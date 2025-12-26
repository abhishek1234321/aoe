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
| `npm run typecheck`| TypeScript `--noEmit` checks              |
| `npm run format`   | Prettier write                            |
| `npm run format:check` | Prettier verify                       |

Scraping, CSV export, invoice downloads (opt-in), and highlights are implemented and evolving.

## Contributing
See `CONTRIBUTING.md` and `CODE_OF_CONDUCT.md` for guidance.

## License
MIT. See `LICENSE`.
