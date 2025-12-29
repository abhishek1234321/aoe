# Release checklist

Use this checklist before publishing to the Chrome Web Store or tagging a release.

## Pre-release
- [ ] Update `CHANGELOG.md` with user-facing changes.
- [ ] Bump version in `package.json`, `public/manifest.json`, and `public/manifest.e2e.json`.
- [ ] Verify `docs/privacy.md` and `PRIVACY.md` match the current behavior.
- [ ] Confirm `SUPPORT_EMAIL` is correct in `src/shared/constants.ts`.
- [ ] Run `npm run lint`, `npm run typecheck`, `npm run test`.
- [ ] Run `npm run build` and load `dist/` as an unpacked extension for a smoke test.
- [ ] Run `trivy fs . --severity HIGH,CRITICAL` and `npm audit --audit-level=high`.
- [ ] Capture/update store assets (icons, screenshots, promo images).

## Store submission
- [ ] Ensure `DEBUG_LOGGING` is false in production builds.
- [ ] Confirm optional permissions are only requested on user action.
- [ ] Publish `docs/privacy.md` to a public URL and update `docs/STORE.md`.
- [ ] Verify host permissions match supported locales.

## Post-release
- [ ] Tag the release in Git with the same version (e.g., `v0.1.1`).
- [ ] Archive new fixture snapshots if selectors changed.
- [ ] Open a tracking issue for any known post-release bugs.
