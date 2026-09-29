# Phase 13C-B — Live Blueprint Intelligence & Guided Authoring

Baseline: `e6affe07609b8c0d068382b8e052efe3c8558ff8` (merge of PR #223 / Phase 13C-A, post-merge run #834 green).
Branch: `feature/13c-b-live-blueprint-intelligence`.

13C-B answers one question, continuously, while the teacher authors: **"What does the current exam contain compared
with the teacher's Blueprint?"** It is factual intelligence and guided authoring — no score, no verdict, no gate, no
blocking. 13C-C will decide which mismatches become warnings, policies or finalization gates, consuming this engine
without rebuilding the math.

## 1. Baseline gate

| Check | Result |
|---|---|
| `origin/main` | `e6affe07609b8c0d068382b8e052efe3c8558ff8` (verified with `git fetch`; re-verified before commit and push) |
| PR #223 | merged (`merge_commit_sha = e6affe0…`), auto-merge never enabled |
| Post-merge CI | run #834 on `e6affe0…`: success |
| Working tree | clean; no merge / rebase / cherry-pick in progress |
| Branch | created from the exact baseline; one PR; auto-merge OFF; nothing merged |

## 2. Audit — the authorities 13C-B reuses (nothing re-implemented)

| Area | Authority | Used by 13C-B as |
|---|---|---|
| Blueprint contract | `src/assessmentTypes.ts` (`AssessmentBlueprintV1`, `BlueprintConstraint` {dimension, ref, metric, unit, min/target/max/tolerance}, `targets`) | the ONLY planning input |
| Facts | `buildAssessmentProfile` (`Tally = {count, weightMarks, officialMarks}`, `totalQuestions`, `totalWeightMarks`, `totalOfficialMarks`, `unattributedOfficialMarks`, `bySection.officialFactor`, `unclassified`) | the ONLY numbers; the engine adds comparison, never arithmetic |
| Classification | `effectiveAssessmentMeta` (explicit `assessmentMeta` authoritative; bank evidence exact-id only; `unmappedBankTopics`) | evidence index + unmapped rows |
| Validation | `validateBlueprintForExam` (structural issues incl. `BROKEN_SECTION_REF`) | an issue on a constraint ⇒ `unassessable` row |
| History | `useStructuredExamHistory.update(updater)` / `onChange(updater)` (13A) | bulk classification = ONE updater; unchanged `prev` ⇒ no entry |
| Selection | 13B builder UI state (`ids`, pruned during render, reset per exam) | evidence reveal writes the selection; bulk classification reads it |
| Navigator / focus | `ExamQuestionNavigator`, `focusCard` (scroll + focus + flash by `examQuestionId`) | evidence reveal opens the navigator and focuses the first contributing card |
| Bulk actions | `BulkActionBar` (one mutation per action) | new `تصنيف المحدد` action |
| Bank picker | `BankQuestionPicker` (lazy, `list` + exact-id `select`, used ids locked, latest-authority insertion, R1–R8 races) | opened with an EXACT prefilled filter (`focus`) |
| Bank model | `bankQuestionModel` (`BankFilters` {q, section, type, difficulty, source} + topic; `SECTIONS = BASIC/INFRASTRUCTURE`; difficulty 1..5; types multipleChoice / fillBlank / wordBank / open) | the ONLY dimensions a bank focus may carry |
| Bank bridge | `structuredExamProductivity.bankExamQuestionToBuilderQuestion` (`open → shortAnswer` name bridge) | the type mapping used in reverse for the focus (`shortAnswer → open`) |
| Duplicate invariant | 13B exact `bankQuestionId` refusal (picker + updater) | untouched |
| Legacy generation | `App.ExamPlan` → `interpret-exam-request` (schema enums from `topics.json`) → `generate-exam` (`["BASIC","INFRASTRUCTURE"]` loops, 791381 / 791367 official-source rules, 1..5 difficulty) → `exam-question-selection` | **untouched** (§12); `blueprintToLegacyPlanTargets` / `legacyPlanToBlueprint` remain the explicit compatibility seam |

Domain coupling confirmed in the audit: `generate-exam.js` iterates `["BASIC", "INFRASTRUCTURE"]`, applies official-source
regexes (`/^791381-20\d{2}/`), and consumes `api/config/topics.json`; `interpret-exam-request.js` builds its schema enums
from the same networking config. None of it can be driven by an arbitrary subject Blueprint without a redesign.

## 3. Architecture decisions

1. **One pure engine, no parallel math.** `src/assessmentBlueprintCoverage.ts` → `evaluateBlueprintCoverage(exam, blueprint?)`
   consumes the canonical Blueprint, the current `StructuredExam`, the 13C-A profile and the structural issues. It compares;
   it does not recompute marks, taxonomy or attribution.
2. **Analysis ≠ editing.** `مخطط الامتحان` (13C-A) edits the Blueprint; `تحليل المخطط الحي` (13C-B, lazy) analyses the current
   exam against it. Both are dialogs opened from the toolbar.
3. **Runtime-derived only.** The report and the evidence index are `useMemo` results of the canonical exam prop. Nothing is
   cached elsewhere, polled, fetched or persisted (`StructuredExam` gains no field; the sanitizer additionally drops any
   `coverageReport / blueprintCoverage / assessmentIntelligence / evidenceIndex` key as defense in depth).
4. **Existing navigation and selection.** Evidence reveal = the 13B selection + navigator + card focus. Bulk classification =
   the 13B selection + ONE history updater. No second selection, navigation or history authority.
5. **Guided bank discovery is exact and manual.** A coverage row opens the existing picker with an exact prefilled filter only
   for dimensions the bank index represents; unsupported dimensions have no bank action. Nothing is auto-selected or
   auto-inserted.
6. **The legacy generator is not generalized** (§12). A dedicated Enterprise Assembly phase will do that.

## 4. Live coverage contract (`src/assessmentBlueprintCoverage.ts`)

```
evaluateBlueprintCoverage(exam, blueprint = exam.blueprint): BlueprintCoverageReport
BlueprintCoverageReport = {
  totalQuestions, targetTotalQuestions?, totalOfficialMarks, targetTotalMarks?,
  totals: CoverageItem[]            // "total-questions" / "total-marks" rows when a target is configured
  constraints: CoverageItem[]       // one row per Blueprint constraint, Blueprint order
  constraintCount,
  unclassified: { count, weightMarks, officialMarks, questionIds },
  unmappedBank: { questionIds, byTopic: Record<bankTopic, questionIds> },
  issues: BlueprintIssue[]          // validateBlueprintForExam(blueprint, exam)
}
CoverageItem = {
  id, kind: "total-questions" | "total-marks" | "constraint", dimension?, ref?, refLabel, metric, unit,
  actual: number | null,            // raw, never rounded; null when unassessable
  count, weightMarks, officialMarks,// the factual bucket (0 when missing)
  denominator?,                     // percent rows: totalQuestions or totalOfficialMarks
  min?, target?, max?, tolerance?,
  relation, reason?, issues,
  delta: number | null,             // actual − target
  shortfall: number | null,         // min − actual (below-min)
  excess: number | null,            // actual − max (above-max)
  evidence: string[]                // contributing examQuestionIds, global exam order
}
```

### Actual-value extraction (fixed)

| metric / unit | actual | denominator |
|---|---|---|
| count / absolute | `bucket.count` | — |
| count / percent | `bucket.count / profile.totalQuestions × 100` | `totalQuestions` |
| marks / absolute | `bucket.officialMarks` (13C-A cap-aware official marks — never `q.marks`, never `weightMarks`, never a stale exam total) | — |
| marks / percent | `bucket.officialMarks / profile.totalOfficialMarks × 100` | `totalOfficialMarks` (**never** `totalWeightMarks`) |

Buckets: `byTopic[ref]` (PRIMARY topic only — a 10-mark question with primary A and secondaries B, C contributes once to
A), `byObjective[ref]` and `byCapability[ref]` (overlap by design), `byDifficulty[String(ref)]`, `byType[ref]`,
`byCognitiveLevel[ref]`, `bySection[ref]`. A missing bucket is `{0, 0, 0}` with no evidence — not `undefined`.

Total targets: `targets.totalQuestions` vs `totalQuestions`; `targets.totalMarks` vs `totalOfficialMarks`.

capScore / firstNAnswered: the official marks per question are the 13C-A proportional attribution
(`weight × sectionMaxMarks / Σ weights`), so a capScore section of 5 + 5 capped at 6 contributes 3 + 3 and a
firstNAnswered section of 3 × 2 capped at 4 contributes 4/3 each; compound questions use the grader's part-mark
distribution. The engine consumes those fractions as-is.

### Relation semantics (closed set, deterministic order)

`unassessable` → `below-min` (actual < min) → `above-max` (actual > max) → with a target: `within-tolerance`
(|actual − target| ≤ tolerance), `at-target` (no tolerance, actual = target), `below-target`, `above-target` → otherwise
`within-range`. Comparisons use `COVERAGE_EPSILON = 1e-9` (0.1 + 0.2 is "at" 0.3; 33.4 vs 33.3 is a real difference).
Nothing is rounded inside the engine; `src/coverageFormat.ts` is the one display helper (two decimals for numbers, one
for percentages: 99.999999999 reads "100%").

`unassessable` reasons: `zero-count-denominator` (percent of 0 questions), `zero-marks-denominator` (percent of 0
official marks), `blueprint-issue` (any structural issue on that constraint — broken topic / objective / section ref,
invalid difficulty / unit / metric, contradictory limits, percent out of range … — the issues are attached, nothing is
repaired and nothing is silently 0), `no-limits`. NaN / Infinity never appear.

### Evidence index

`buildAssessmentEvidenceIndex(exam, blueprint?)` → `{ order, byTopic, byObjective, byDifficulty, byType, byCognitiveLevel,
byCapability, bySection, unclassified, unmappedBankTopics }` — one O(n) pass (per-question `effectiveAssessmentMeta`),
ids in global exam order, never stored. Complexity of the whole evaluation: O(n) profile + O(n) index + O(c) constraint
rows with O(1) bucket lookups.

## 5. Live intelligence UI — `تحليل المخطط الحي` (`src/BlueprintCoveragePanel.tsx`, lazy)

Toolbar button `📊 تحليل المخطط` (shown when the exam has a Blueprint). Dialog "تحليل المخطط الحي":
- overview (`data-overview`): `الأسئلة 18 / 20 سؤال`, `العلامات الرسمية 86 / 100 علامة`, unclassified count with
  `عرض غير المصنفة`, unmapped bank count with `عرض غير المربوطة`, constraint count;
- `الأهداف الإجمالية` list (total rows) and `قيود المخطط` list (`ul[aria-label]`, `li[data-coverage-id][data-relation]`);
- each row: dimension chip, referenced label, metric/unit, actual (`22% من العلامات الرسمية`, `5 أسئلة`), configured
  limits (`النطاق 4–6`, `الهدف 30% ± 2`), a CSS progress bar (`role="progressbar"`, numeric `aria-valuenow` and
  `aria-valuetext`), the factual relation as TEXT (`أقل من الهدف بـ 8 نقاط مئوية`, `أعلى من الحد الأقصى بـ 1`,
  `ضمن النطاق`, `غير قابل للتقييم — BROKEN_TOPIC_REF`), the signed delta, and the actions `عرض الأسئلة` (when questions
  contribute) and `ابحث في بنك الأسئلة` (only when an exact bank focus exists and a bank service is wired).
- Relation is never colour-only (text + glyph); RTL; native buttons/keyboard; focus returns to the opener; phone
  layout stacks actions full-width; no charting dependency.

Truly live: the panel receives the canonical `exam` prop and memoizes the report on it — add / delete / duplicate / move /
marks / cap / classification / constraint / label / bulk / bank insertion / undo / redo / recovery all re-render it. No
refresh button, no polling, no backend call.

## 6. Bulk pedagogical classification — `تصنيف المحدد`

`src/assessmentBulkClassify.ts` (pure): `applyBulkClassification(sections, ids, change)` with
`change: { primaryTopicId?, difficulty?, cognitiveLevel?: FieldOp; objectiveIds?, secondaryTopicIds?, capabilities?: ListOp }`,
`FieldOp = keep | set(value) | clear`, `ListOp = keep | add(ids) | remove(ids) | replace(ids) | clear`. Omitted / `keep`
fields are never touched; `clear` is explicit; list `add` keeps order and de-duplicates; the normalized meta
(`normalizeAssessmentMeta`, now shared with the per-question editor) never stores `{}` or empty fields. A question is only
changed when its normalized meta actually differs; an unchanged question keeps its reference, an unchanged section keeps
its reference, and an unchanged exam returns the SAME `sections` array.

Builder: `BulkActionBar` → `تصنيف المحدد` → `BulkClassifyDialog` (lazy; tri-state selects "بدون تغيير / مسح / value" for
primary topic, difficulty, cognitive level; mode select `بدون تغيير / إضافة / إزالة / استبدال / مسح` + chips for objectives
and secondary topics) → `onApply(change)` → ONE `update(prev => …)` over the ids selected at apply time against the `prev`
the history authority hands over: a deleted or replaced question is simply absent (never resurrected), the unchanged case
returns `prev` (no history entry, not dirty). Undo restores every selected question; redo reapplies; autosave sees the
result normally. Selection remains UI-only. Bank provenance, images and answer keys are untouched.

## 7. Guided Question Bank discovery (`src/bankPickerFocus.ts`)

`bankFocusForCoverageItem(item)` → `{ topic }` (the exact blueprint/bank topic id, never the label), `{ difficulty }` (only
integer 1..5, the bank scale), `{ presentationType }` (only `multipleChoice`, `fillBlank`, `wordBank`, and `shortAnswer →
open` through the documented 13B bridge) — or `null` for objectives, cognitive levels, capabilities, sections, totals,
unbridged types (`cliFill`, `compound`, `multiTrueFalse`, `ordering`, …), out-of-scale difficulties and unassessable rows.
`BankQuestionPicker` gains an optional `focus` prop that only initializes its filters (`bankFiltersFromFocus`); the teacher
edits them freely; used bank ids stay locked; the exact duplicate refusal and every 13B race guard are unchanged; nothing
is selected or inserted automatically. No fuzzy or label matching anywhere.

## 8. Performance and numerical stability

O(n + c): two linear passes plus one constraint loop with indexed lookups; no deep clone (inputs are never mutated,
verified by test); 2000 questions × 40 constraints evaluate in well under the 400 ms test bound. Raw numbers everywhere;
epsilon comparisons; display rounding only in `coverageFormat`.

## 9. Security / student payload

Teacher-only: nothing new is persisted; the student sanitizer is unchanged for every existing rule and additionally strips
the four analytics keys. Answer, media and bank-image regressions stay green.

## 10. Tests

| Suite | Covers |
|---|---|
| `src/assessmentBlueprintCoverage.test.ts` | F1 relations (min / max / target / tolerance / range / epsilon / deltas), F2–F3 extraction for every metric × unit, totals, primary-only, overlap, missing bucket, evidence order, unclassified / unmapped, capScore / firstNAnswered / compound / fractional, zero denominators, broken constraints, no / invalid blueprint, F4 index, determinism + no mutation + near-linear, five subject fixtures, 13C-C boundary |
| `src/coverageFormat.test.ts` | the display helper |
| `src/assessmentBulkClassify.test.ts` | keep / set / clear, list ops, no-op references, stale ids, provenance untouched |
| `src/bankPickerFocus.test.ts` | exact focus mapping, unsupported dimensions, filter prefill |
| `src/StructuredExamBuilder.coverage.test.tsx` | real builder + history: open (no history), live updates for marks / classification / move / delete / duplicate / target / undo / redo, evidence → selection + navigator + focus, unclassified path, no-blueprint exam, invalid blueprint, accessibility, bulk classification (one step, preservation, clear, no-op, stale id, undo / redo), bank focus (exact filters, manual, no auto-select / insert, used ids locked, no fake actions) |
| `src/assessmentIntelligence.guards.test.ts` | generator non-goal, engine isolation, 13C-C vocabulary boundary, no subject branch |
| `api/tests/student-exam-sanitize-13c-b.test.js` | analytics keys never reach a student |

Fail-first on `e6affe0`: 7 files failed, **14 failed / 1 passed** (the pass is the generator non-goal pin). After
implementation: 7 files / 51 tests green; broad regression set 42 files / 601 tests green.

## 11. Mutation proofs B1–B18

See §15 (and the PR body) for the run table: each mutation applied alone → suites → reverted → tree fingerprint identical.

## 12. Explicit non-goal: the 791381 generator stays legacy

`generate-exam.js`, `exam-question-selection.js` and `interpret-exam-request.js` are unchanged and pinned by
`assessmentIntelligence.guards.test.ts`: they never read the canonical Blueprint or `assessmentMeta`, and the explicit
`["BASIC", "INFRASTRUCTURE"]` loop stays. `blueprintToLegacyPlanTargets` / `legacyPlanToBlueprint` remain the compatibility
seam and are not wired into generation. A future **Enterprise Assembly** phase must provide subject-neutral candidate
querying, Blueprint-driven selection, pluggable bank indexes, exact taxonomy matching, deterministic assembly constraints,
optional AI-assisted planning and no subject hard-coding in the core — none of it is built here.

## 13. Hand-off to 13C-C

13C-C consumes `BlueprintCoverageReport` as-is: relations, deltas, shortfalls, excesses, denominators, evidence and issues
are already computed and tested; 13C-C adds policy (which relations become warnings or gates) and presentation, never
math. The report deliberately contains no score, grade, rating, pass/fail or gate field (guarded by test).

## 14. Non-goals honoured

No quality gates, no blocking save, no overall score, no AI recommendations or Blueprint generation, no cross-subject
generator, no auto-assembly or auto-insertion, no fuzzy taxonomy matching, no difficulty prediction, no student analytics,
no simulation scope change (activities stay context-only; zero production renderers), no code execution, no permissions /
publish workflow, no CSP rollout.

## 15. Validation

| Check | Result |
|---|---|
| `npx tsc -b` | exit 0 |
| Focused new suites (7 files) | 51 tests passed |
| Broad regression set (13A / 13B / 13C-A, Review Fix 1, activity guards, persistence, builder suites, history, autosave, quality, productivity, navigator, bulk bar, bank picker, exact selection, asset hydration, official marks, grader, sanitizer, assignment) | 42 files / 601 tests passed |
| `npm test` | 519 files / 6349 tests passed, 0 failed |
| `npm run build` | exit 0 |
| `npm run check:bundle` | initial JS graph 12 files, **118.9 KB gzip / budget 125 KB** — baseline `e6affe0` measured in a fresh worktree: 118.9 KB → **delta 0.0 KB** (everything new is lazy) |
| Largest new lazy chunk | `BlueprintCoveragePanel` 4.3 KB gzip (13.4 KB raw); `BulkClassifyDialog` 1.5 KB gzip |
| `npm run lint` | exit 0 — 99 findings on baseline (fresh worktree) vs 99 on head, finding-for-finding identical: ZERO new warnings |

Mutation proofs B1–B18 (each applied alone → the seven new suites + the 13C-A profile suites → reverted → tree fingerprint
identical): every mutation was caught — B1 weightMarks for marks (3 failures), B2 totalWeightMarks denominator (3),
B3 classified-count denominator (1), B4 secondary topics as primary (4, incl. the 13C-A attribution test), B5 objectives
de-duplicated (5), B6 broken constraint as 0 (3), B7 NaN / Infinity denominators (1), B8 rounding before comparison (1,
compound parity), B9 cached report (1, live builder test), B10 bulk bypasses onChange (2), B11 wipes untouched meta (7),
B12 stale snapshot resurrects a deleted question (1), B13 topic focus by label (2), B14 auto-select on open (1), B15
generator reads a Blueprint (1, guard), B16 report persisted on the exam (3), B17 analytics key reaches the student (1),
B18 qualityScore added (2, boundary guards).
