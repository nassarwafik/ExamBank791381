# Phase 21E — Assignments workspace enterprise visual pass

Baseline: `10bcbe8adeb060a2a187290b75d4328fcdd0d8dc`.

## Scope
Presentation-only visual consistency across teacher assignments list, filters, assignment details, composer, gradebook, item analysis, and library selection. No route, API, marks, review, submission, security, archival or other business logic changed. Changes are CSS-only plus structural regression tests.

## Visual intent
Use canonical design tokens, unified surface hierarchy, clearer selected-row affordance, readable headings and data tables, visible keyboard focus, touch-size mobile actions, narrow-screen single-column layout and reduced-motion support.

## Validation limits
No local Chromium or local npm environment was available via this GitHub connector. Tests in the added file are **style-policy pins**; they are not represented as fail-first evidence or real-browser acceptance. Exact-head CI, deployed preview, full-suite and independent browser review are required before merge. Focus on phone, 200% zoom, horizontal overflow, gradebook table scroll, dialog/overlay layering, all composer and archival actions.

## Follow-up
If an independent reviewer identifies CSS specificity or layout failures, fix them with a normal Review Fix commit and rerun exact-head CI. Owner retains manual merge authority.
