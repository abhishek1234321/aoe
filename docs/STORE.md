# Chrome Web Store Prep

## Summary (short description)
Export Amazon.in order history to CSV and optionally download invoices, all locally in your browser.

## Full description (suggested)
- Scrape your Amazon.in order history into CSV (order ID, date, buyer, total, status, item titles, invoice link).
- Choose a timeframe (Amazon’s dropdown options) and run up to 1,000 orders per session.
- Optional: auto-download invoices after a scrape, with progress and error reporting.
- Privacy-first: all scraping, CSV generation, and invoice downloads run locally in your browser. No data leaves your device.
- Clear status, cancel controls, and a highlights view (spend, top items, busiest days) after a run.

## Privacy
- All processing is local. No order data is sent off-device.
- Privacy policy: `PRIVACY.md` (publish as a URL in the store listing).
- No remote code or analytics; everything is bundled with the extension.
- Permissions:
  - `activeTab`: access the active Amazon Orders tab you open.
  - `storage`: persist scrape state between popup opens.
  - `downloads` (optional): save invoice PDFs when you opt in to invoice downloads (requested only on user action).
  - `notifications` (optional): show a completion notification if you enable it in the popup.
  - Host permissions: `https://www.amazon.in/*` only.

## Assets needed
- Icons: already in `public/icons/` (16/32/48/128/256).
- Promo images/screenshots (prepare before submission): 1280x800, 640x400, 440x280.

## Listing checklist
- Turn off debug logging for release (`DEBUG_LOGGING` false in production builds).
- Mention data-local processing and optional invoices in the listing text.
- Note the downloads permission (“Manage your downloads”) is used only when invoice downloads are enabled.

## Support / feedback (suggested)
- Issue tracker: https://github.com/abhishek1234321/aoe/issues/new
- Feedback is user-initiated; no automatic data collection.
