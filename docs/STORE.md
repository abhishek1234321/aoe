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
- Permissions:
  - `activeTab`, `scripting`: inject the content script on the Amazon Orders page you open.
  - `storage`: persist scrape state between popup opens.
  - `downloads`: save invoice PDFs when you opt in to invoice downloads (used only on user request).
  - Host permissions: `https://www.amazon.in/*` only.

## Assets needed
- Icons: already in `public/icons/` (16/32/48/128/256).
- Promo images/screenshots (prepare before submission): 1280x800, 640x400, 440x280.

## Listing checklist
- Turn off debug logging for release (`DEBUG_LOGGING` false in production builds).
- Mention data-local processing and optional invoices in the listing text.
- Note the downloads permission (“Manage your downloads”) is used only when invoice downloads are enabled.

## Support / feedback (suggested)
- Mailto or issue link (add to popup/footer if desired).
