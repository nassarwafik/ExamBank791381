# Phase 21E L3-A — Search-provider foundation

Baseline: `main` at `6762761583850ad6aa6940c0e0b8d829ce0b820a` (including merged #317).

This is a small, independent **foundation slice**, NOT user-facing completion of L3.

- Adds a replaceable `SearchProvider` contract and title/keyword implementation.
- Arabic normalization removes diacritics and tatweel and harmonizes hamza, final ya and taa marbuta. Sentence punctuation (؟ ، ؛ ? ! , ; : quotes, brackets) and invisible format characters (ZWNJ, bidi marks) are ignored; technical characters such as `.` `/` `-` `+` are kept.
- Uses only metadata from the existing lazy manifest search index; no page-body imports or API requests.
- Supports course scoping and an **explicit, fail-closed release set**: `allowedModuleIds` is required. **Student integrations pass the module ids from the authenticated released-modules endpoint**; only teacher-only callers pass `"all"`. A missing or malformed release set returns no results (Review Fix 1).
- This is an application-path filter over frontend manifest metadata, like `createRestrictedReaderContentApi`; it is not asset-level confidentiality and not a new authorization boundary. The server-side release list stays the authority.
- No UI, entitlement, grading, submission, backend, sidebar or reader changes.
- Tests cover normalization variants, three release sets (fixture and the real 248-page course 791381, every hidden title and keyword, with a positive control), course scope, keyword matches, the fail-closed scope and the replaceable provider contract.

Next L3-B: lazy UI, keyboard/accessibility, result grouping, student entitlement integration, navigation and Chromium/bundle benchmarks from roadmap #309. Do not claim acceptance L3-1 through L3-7 complete until that integration is independently tested.

Validation status: recorded per exact head in the PR description (AGENTS.md §6), not in this document.
