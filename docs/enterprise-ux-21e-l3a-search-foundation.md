# Phase 21E L3-A — Search-provider foundation

Baseline: `main` at `6762761583850ad6aa6940c0e0b8d829ce0b820a` (including merged #317).

This is a small, independent **foundation slice**, NOT user-facing completion of L3.

- Adds a replaceable `SearchProvider` contract and title/keyword implementation.
- Arabic normalization removes diacritics and tatweel and harmonizes hamza, final ya and taa marbuta.
- Uses only metadata from the existing lazy manifest search index; no page-body imports or API requests.
- Supports course scoping and a caller-supplied release-set restriction. **Student integrations MUST supply `allowedModuleIds` from the authenticated released-modules endpoint.** Omitting this option is for authorized teacher-only callers.
- No UI, entitlement, grading, submission, backend, sidebar or reader changes.
- Tests cover normalization variants, three release sets, course scope, keyword matches and replaceable provider contract.

Next L3-B: lazy UI, keyboard/accessibility, result grouping, student entitlement integration, navigation and Chromium/bundle benchmarks from roadmap #309. Do not claim acceptance L3-1 through L3-7 complete until that integration is independently tested.

Validation status: exact-head CI pending. No local full-suite validation was possible through the GitHub connector alone; that is a merge blocker, not a waiver.
