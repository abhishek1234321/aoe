# Chrome Web Store Prep

## Summary (short description, <=132 chars)
Export Amazon orders to CSV and optionally download invoices. Runs locally in your browser.

## Full description (final)
Amazon Order Extractor helps you export order history from Amazon.in, Amazon.com, Amazon.ca, and Amazon.co.uk into CSV.

Highlights:
- Choose a timeframe from Amazon’s dropdown and export up to 1,000 orders per run.
- Optional invoice downloads with progress and retry for failures.
- Post-run highlights: total spend, top items, busiest days, buyer breakdowns.
- Privacy-first: all processing stays in your browser. No data leaves your device.

Ideal for bookkeeping, budgeting, or archiving your purchases.

## Privacy
- All processing is local. No order data is sent off-device.
- Privacy policy: `PRIVACY.md` (publish as a URL in the store listing).
- No remote code or analytics; everything is bundled with the extension.

## Permissions (rationale)
- `activeTab`: read the Amazon Orders page you open.
- `storage`: persist export state between popup opens.
- `downloads` (optional): save invoice PDFs when you opt in.
- `notifications` (optional): show a completion alert if you enable it.
- Host permissions:
  - `https://www.amazon.in/*`
  - `https://www.amazon.com/*`
  - `https://www.amazon.ca/*`
  - `https://www.amazon.co.uk/*`

## Assets needed
- Icons: already in `public/icons/` (16/32/48/128/256).
- Screenshots: at least 1, recommended 5.
- Promo images (optional, recommended): 1280x800, 640x400, 440x280.

To generate screenshots from fixtures:
- Run `npm run e2e:install` once (Playwright browser).
- Run `npm run screenshots` to save images into `docs/store/screenshots/`.

## Store metadata (fill before submission)
- Support email: abhishek1234321@gmail.com
- `SUPPORT_EMAIL` is set in `src/shared/constants.ts` to show the email support option in the popup.
- Privacy policy URL: TODO (must be public, even if repo stays private)
- Homepage URL: https://github.com/abhishek1234321/aoe
- Issue tracker: https://github.com/abhishek1234321/aoe/issues/new

## Suggested screenshot set
1. Idle state: time filter selection + Start export.
2. Export running: progress bar + status.
3. Export complete: Download CSV + counts.
4. Highlights view: spend + top items.
5. Privacy footer visible (local-only statement + support links).

## Promo image ideas
- Top: "Export Amazon Orders" headline, with a CSV icon.
- Bottom: "Local-only • Optional invoices • Highlights" (three badges).

## Demo video (30–45s) storyboard
1. Open Amazon Orders page.
2. Open extension, pick a timeframe.
3. Start export → show progress.
4. Completed → Download CSV.
5. Open Highlights view.
6. End on privacy footer (local-only message).

## Submission steps
1. Run `npm run build` and zip `dist/`.
2. Verify `DEBUG_LOGGING` is false in production builds.
3. Upload screenshots + promo images.
4. Paste the short and full description.
5. Set the privacy policy URL and support email.

## Listing checklist
- Turn off debug logging for release (`DEBUG_LOGGING` false in production builds).
- Mention data-local processing and optional invoices in the listing text.
- Note the downloads permission (“Manage your downloads”) is used only when invoice downloads are enabled.

## Support / feedback (suggested)
- Issue tracker: https://github.com/abhishek1234321/aoe/issues/new
- Feedback is user-initiated; no automatic data collection.
