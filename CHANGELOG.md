# Changelog

Notable Halal Finder changes are tracked here alongside the preference log.

## Unreleased

### Changed

- General map road layers now use soft contrasting fills and casings in light and dark mode so roads stay visible without bright or distracting colors.
- Review overlay form swaps now animate card height smoothly instead of snapping between verification, OTP, and rating states.
- Event, suggest/edit hours, and suggest Eid form mode changes now use the shared overlay height animation helper where the card's natural height can change.

### Documentation

- Added the reusable overlay height transition pattern to the design system docs.
- Restored changelog coverage for recent release commits and current UI polish work.

## 2026-05-22

### Fixed

- Preserved review-related fixes while removing guide artifact changes. Commit: `898f686`.

### Changed

- Refreshed Eid prayer and places data, updated the review API surface, and bumped the service worker cache. Commit: `898f686`.
- Updated the privacy policy and bumped the app/service-worker cache to `20260522-2`. Commit: `04a183e`.

## 2026-05-19

### Changed

- Added place pill count badges and disabled dev-only features for release. Commit: `dc5d830`.
- Refreshed Eid prayer fallback data and bumped the release cache version. Commit: `dc5d830`.
