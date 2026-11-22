# Accessibility scan of the student exam journey (A11Y-1)

The student exam page is the most important screen for a student. Phase 21E.3 certified its focus order, live regions, touch
targets and LTR islands in real Chromium (`docs/enterprise-ux-premium-21e3.md`). Until now, only the assignments workspace had
been checked with an automated WCAG engine (21G.7). A11Y-1 adds that check to the student journey.

## The scan

`scripts/check-student-exam-browser-21e3.mjs` gains an optional axe-core scan. With `AXE_PATH` set to a local `axe.min.js`,
every stage the run photographs is scanned against the WCAG 2.1 A and AA rules (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`).
That is 15 stages from the portal to the result, at desktop, 150 %, 200 % and phone sizes. The new check **H1** requires no
violation at any stage. axe is evaluated through the DevTools protocol rather than an inline `<script>`, so the page keeps its
real Content-Security-Policy during the scan. Without `AXE_PATH` the harness behaves as before.

```bash
npm run build
npm install --prefix /tmp/pw --no-save playwright-core@1.55.0 axe-core@4.10.2
PLAYWRIGHT_CORE_DIR=/tmp/pw AXE_PATH=/tmp/pw/node_modules/axe-core/axe.min.js node scripts/check-student-exam-browser-21e3.mjs
```

The harness now opens the portal at its «الواجبات» view (`#/s/tasks`). Since UX-S2 the task cards live there, so the harness
could no longer find «ابدأ الحل» on the default view and stopped at its first step.

## Result

| Build | H1 (4 viewports × 15 stages) | Finding |
|---|---|---|
| baseline `20696cf` | FAIL at every viewport, stage `02-notifications` | `color-contrast` (serious): a notification's time, `#a9a5b4` on the unread tint `#f3effa`, ratio **2.12** for 12 px text (AA: 4.5) |
| this phase | **PASS** at every viewport, 0 violations | none |

The fix: `.eb-notif-time` uses the text token `--eb-muted` (ratio 5.84 on the unread tint, 6.62 on the surface) instead of the
decorative `--eb-faint`. Guard: `src/notifications/notificationTimeContrast.a11y1.test.ts`. It failed on the baseline
(`Received: "var(--eb-faint, var(--eb-muted))"`) and passes on this head. It also checks the ratio in light and dark.

## Reported, not changed here

- **Check A5 of the 21E.3 harness: root-caused and fixed in the harness (not a product defect).** A5 ("no save / submit / start
  caused by the failure") failed at every viewport on the baseline. The probe recorded every `saveDraft` body. The extra save
  carries the **same answers** as the last save before the failure, plus `renderFailures: [{questionId: "h1", code: "chunk-load"}]`.
  That is the sync the owner's assessment-integrity decision requires (`docs/enterprise-ux-premium-21e3.md` §16.2): the server
  holds the question for the teacher instead of grading the blank as 0. A5 was written before §16 and was never updated.
  The check now says exactly that. **A5**: no submit, one start, and every save after the failure has answers byte-for-byte equal
  to the last answers saved before it, plus a `renderFailures` array. **A5r** (new): while the recovery card is shown, a save
  reports `h1`.
  - Head build: 80 / 80, A5 and A5r PASS at all four viewports.
  - Mutations in `src/StudentExamPage.tsx`, restored byte-for-byte (hash verified):

    | Mutant | Planted defect | A5 | A5r |
    |---|---|---|---|
    | M1 | the `saveDraft` body without `renderFailures` | KILLED | KILLED |
    | M2 | the sync save sends `{}` as answers | KILLED | not targeted, passes |
- **The chunk recovery's import map is blocked by the Content-Security-Policy.** When a shared dependency chunk fails, the 21E.3
  recovery (`src/recoverableLazy.ts`) inserts a `<script type="importmap">`. The D2 policy (`script-src 'self' 'sha256-…'`)
  blocks it, and the browser logs a CSP violation, which reaches `client.csp_violation` in production. The question still
  renders in the harness (checks A4 and A8 pass), but that recovery path is not doing what its design record says. Fixing it
  touches the security policy or the recovery design, so it is a decision for its own reviewed phase.
- **Other faint text.** 13 other rules in the CSS colour text with `--eb-faint` (for example in `student-portal-v2.css` and
  `studentportal-pro.css`). The stages scanned here did not flag them; each may still fail where it is shown, and is worth a scan
  of its own screen.
