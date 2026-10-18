# Phase P-1 — Projects safety fixes

Defects found in the Projects analysis (B1–B5). All are fixed with fail-first evidence: the tests below were written
first and executed against the defective baseline `41bcbdcc` (Merge pull request #357), where 27 of them failed; they
pass on the fix.

| Id | Defect (baseline) | Fix |
|---|---|---|
| B1 | **Stage settings could save one class's stages into another.** After a class switch the previous class's editor stayed on screen with «حفظ التغييرات» enabled while the new template loaded, and a slower read for the previous class could replace the current one. A save then sent class A's stages with class B's id. | The editor is bound to the `(project, class)` its template was read for (`loadedFor`): nothing renders or saves until the current selection's read lands; a read for a previous selection is dropped (request sequence). |
| B2 | **Stale class data.** «لوحة المشروع», «تقدّم الطلاب» and «الإحصائيات» had no request-sequence guard: a slower response for the previously selected class rendered under the new class. | Request sequence in each view; a class / project change clears the previous data before the new read. |
| B3 | **Weight 0 was counted as 1.** The editor accepted 0 (`min=0`), and `core.stageWeight` silently treats ≤ 0 as 1. | The editor refuses to save a weight that is not a number > 0 (message, nothing sent; input `min` 0.5) and the server applies the same rule. An unchanged legacy value already stored never blocks an unrelated edit. Grading math is unchanged. |
| B4 | **No server validation of `template.update`.** Any `stages` array was stored as sent. | `lib/project-tracker/template-validation.js`, run inside the same CAS round against the class's current snapshot (`service.updateTemplate` `options.validate`): unique non-empty ids, known track, group of that track, title 1–200, finite order, weight > 0, boolean flags, **no deleted stage** (deactivate instead — progress and scores are never orphaned), track weights (known tracks, ≥ 0, sum > 0), config keys and ranges. 400 with an Arabic message; nothing written, no audit. |
| B5 | **Unsaved stage-settings edits were lost silently** on a class change, a view change or «تحديث». | The editor reports `onDirtyChange`; the workspace asks «تعديلات غير محفوظة» (`متابعة التعديل` / `تجاهل التعديلات`) before those actions, and the browser warns on tab close while edits are unsaved. With no edits the actions run at once exactly as before. |

Scope notes: the legacy `project-794589` route's own `template.update` is unchanged (no `validate` option) to keep the
r33 golden parity; the UI only uses the generic route. No grading, progress, Strength or storage-shape change.

## Fail-first evidence (baseline `41bcbdcc`)

`npx vitest run api/tests/project-template-validation-p1s.test.js src/projects/ProjectSafety.p1s.test.tsx`
→ **27 failed | 3 passed** (the 3 passing are the valid-edit cases that must keep working):

- B4 — all 19 malformed-patch cases: `expected 200 to be 400` (the snapshot was overwritten).
- B1 — in-flight: `expected <input> to be null` (the previous class's editor was still rendered); out-of-order:
  `expected 'مرحلة خاصة بالصف الأول' not to be 'مرحلة خاصة بالصف الأول'` (class 1's stage title shown and saved for class 2).
- B2 — dashboard `expected 'الطلاب3' not to contain '3'`; student cards `expected <strong> to be null` (class 1's student
  shown under class 2); analytics crashed re-rendering charts with class 1's late data.
- B3 — `Unable to find role="alert"` (weight 0 saved with «✓ تم حفظ إعداد المراحل.»).
- B5 — `Unable to find role="dialog"` ×2 (edits discarded without asking).

On the fix: **30 passed**.

## Tests

- `api/tests/project-template-validation-p1s.test.js` — 19 refusals (nothing written, no audit) + 3 valid edits.
- `src/projects/ProjectSafety.p1s.test.tsx` — B1 ×2, B2 ×3, B3, B5 ×2 over the real handler.

## Mutation proof

Each mutant planted alone; both P-1 suites run; the file restored byte-for-byte (sha256-checked).

| Id | Planted defect | Result | Killed by |
|---|---|---|---|
| S1 | dashboard request-sequence check removed | KILLED | B2 dashboard |
| S2 | student-cards request-sequence check removed | KILLED | B2 student cards |
| S3 | analytics request-sequence check removed | KILLED | B2 analytics |
| S4 | stage-settings stale read not dropped | KILLED | B1 out-of-order read |
| S5 | editor not bound to the class it was read for | KILLED (after strengthening; first campaign SURVIVED — the state reset hid it after one commit) | B1 in-flight, per-commit Profiler check |
| S6 | client weight check removed | KILLED | B3 (no request may be sent) |
| S7 | server weight rule removed | KILLED | weight 0 / negative → 400 |
| S8 | server "no deleted stage" rule removed | KILLED | removed stage → 400 |
| S9 | server group-in-track rule removed | KILLED | unknown group → 400 |
| S10 | validation not called in updateTemplate | KILLED | malformed patches → 400 |
| S11 | workspace never asks on unsaved edits | KILLED | B5 ×2 |
| S12 | editor never reports unsaved edits | KILLED | B5 ×2 |
