# Changelog

All notable changes to this project will be documented in this file.
The format is based on Keep a Changelog and this project follows Semantic Versioning.

## [0.1.1] - 2025-12-29
### Added
- Multi-locale support for amazon.in, amazon.com, amazon.ca, and amazon.co.uk.
- Invoice retry flow with per-order failure list and order-details links.
- Order-count hint from the time filter label to improve progress messaging.

### Changed
- User-facing copy now uses “export” instead of “scrape.”
- Popup layout adjusted to a single scroll region with clearer header/footer spacing.

## [0.1.0] - 2025-12-01
### Added
- Initial MV3 extension: export orders to CSV, optional invoice downloads, highlights view.
- Background hidden-tab workflow with progress reporting.
- Privacy-first local processing with optional permissions.
