# Phase 13C-C — Enterprise Quality Gates & Finalization Policy

Baseline: `bd10c726a998956477c7e7d8cf4b3fadcc2ce66b` (merge of PR #224 / Phase 13C-B, post-merge run #838 green).
Branch: `feature/13c-c-enterprise-quality-gates`.

13C-B answers "what does the exam contain compared with the Blueprint?". 13C-C answers "which of those factual mismatches
are informational, which need attention, and which prevent final authoring approval?" — through an explicit, versioned,
domain-neutral policy, never a score. The layers are kept apart and flow one way:

`Blueprint → Coverage Facts → Quality Policy → Finalization Decision`

## 1. Baseline gate

| Check | Result |
|---|---|
| `origin/main` | `bd10c726a998956477c7e7d8cf4b3fadcc2ce66b` (verified with `git fetch`; re-verified before commit and push) |
| PR #224 | merged (`merge_commit_sha = bd10c72…`), auto-merge never enabled |
| Post-merge CI | run #838 on `bd10c72…`: success |
| Working tree | clean; no merge / rebase / cherry-pick in progress |
| Branch | created from the exact baseline; one PR; auto-merge OFF; nothing merged |

## 2. Audit

| Authority | What it is | 13C-C relation |
|---|---|---|
| `src/examQuality.ts` — `validateStructuredExam`, `StructuredIssue {severity: error/warning, code}`, `hasBlockingErrors` | structural exam validity (malformed MCQ, grading policy, missing auto-grade key, firstN config, duplicate ids, marks, CLI / table / compound shapes) | **consumed unchanged**; `error` stays an unconditional blocker, `warning` stays a warning; no rule reinterpreted |
| `StructuredExamBuilder` — `اعتماد نهائي` (`onSave("final")`, `disabled` on `hasBlockingErrors`), `حفظ مسودة` | the authoring actions | final now goes through `requestFinalSave` (handler re-check); draft untouched |
| `App.saveStructuredExam(mode)` → `toSavedStructuredExam` → `POST /api/save-exam-artifact` → `structuredHistory.commitSaved(snapshot, payload)` | the save path; the endpoint is a **generic artifact persistence endpoint**, not a publish-transition authority | wrapped by the pure `runStructuredSave` (second-line guard on the exact snapshot); commitSaved reconciliation unchanged |
| 13C-A `AssessmentBlueprintV1`, `validateBlueprintForExam` | the specification and its structural validation | gains one optional field: `qualityPolicy` |
| 13C-B `evaluateBlueprintCoverage` → `BlueprintCoverageReport` (`totals[]`, `constraints[]` with `relation`, `actual`, `evidence`, `issues`, `unclassified {count, officialMarks, questionIds}`, `unmappedBank {questionIds}`), `evaluateConstraintRelation`, official-marks / percent-denominator semantics | the facts | **consumed, never recalculated** |
| 13A `useStructuredExamHistory.update(updater)` | the one history authority | every policy edit is one updater |
| 13B selection / navigator / `focusCard` | evidence navigation | reused by the readiness panel |

## 3. Pre-13C-C hardening of the 13C-B engine

- **H1** — the mutable `assessmentMetaDiagnostics.contextsPrepared` counter is gone from the production module. Callers may
  pass an optional `AssessmentEvaluationInstrumentation { contextPrepared?() }` (`prepareAssessmentMetaContext`,
  `buildAssessmentProfile`, `buildAssessmentEvidenceIndex`, `evaluateBlueprintCoverage(exam, bp, { instrumentation })`);
  nothing is recorded when nothing is supplied. Result semantics, the two-argument `effectiveAssessmentMeta` and exact-id
  mapping are unchanged. Tests prove one prepared context per evaluation through the sink and through a getter-counting
  Blueprint whose taxonomy reads do not grow with the number of questions.
- **H2** — `prepareCoverageLabels(bp, exam)` builds topic / objective / cognitive-level / section maps (and the difficulty
  label table) once per evaluation; `refLabelFor(labels, c)` is O(1); no `.find()` remains in the coverage engine (guarded).
  Complexity stated accurately: **O(n + c + taxonomy + issues)** — n questions, c constraints, taxonomy preparation and the
  issue index counted separately.

## 4. Quality policy — canonical, versioned, on the Blueprint (`src/assessmentTypes.ts`)

```
blueprint.qualityPolicy?: AssessmentQualityPolicyV1 = { schemaVersion: 1; enabled: boolean; rules: AssessmentQualityRule[] }
QualityEffect = "warning" | "block-finalization"
CoverageQualityRule  = { id; enabled; source: {kind:"constraint"; constraintId} | {kind:"total-questions"} | {kind:"total-marks"};
                        relations: CoverageRelation[]; effect; note? }
ThresholdQualityRule = { id; enabled; source: {kind:"unclassified"} | {kind:"unmapped-bank"};
                        metric: "count" | "officialMarks" (unmapped-bank: count only); max: number; effect; note? }
```
The policy is persisted with the specification; its evaluation never is (no field on `StructuredExam`). A coverage rule
names the 13C-B **relations** that trigger it and never restates min / target / max; a threshold rule compares the factual
figure with `max` through the same `evaluateConstraintRelation` (triggered on `above-max`). No score, grade, rating or
ranking exists anywhere; the only boolean is the operational `canFinalize`.

## 5. Policy validation (`validateAssessmentQualityPolicy(policy, blueprint)`, pure)

Codes: `INVALID_POLICY`, `UNSUPPORTED_POLICY_SCHEMA`, `INVALID_ENABLED`, `INVALID_RULES`, `INVALID_RULE`, `MISSING_RULE_ID`,
`DUPLICATE_RULE_ID`, `INVALID_RULE_ENABLED`, `INVALID_SOURCE`, `UNSUPPORTED_SOURCE_KIND`, `BROKEN_CONSTRAINT_REF`,
`MISSING_TOTAL_TARGET` (a total rule while the Blueprint configures no such target), `INVALID_RELATIONS`, `EMPTY_RELATIONS`,
`UNKNOWN_RELATION`, `INVALID_EFFECT`, `INVALID_METRIC`, `INVALID_THRESHOLD`, `INVALID_NOTE`. Stable ids are authority:
deleting a referenced constraint leaves the rule in place and **broken** (visible in the editor, blocking while the policy is
enabled); renaming a topic / objective label changes nothing. Nothing is fuzzy-repaired.

Helpers (id-based, immutable, same reference on no-op, never pruning rules): `emptyQualityPolicy`, `withQualityPolicy`,
`setQualityPolicyEnabled`, `addQualityRule`, `updateQualityRule`, `replaceQualityRule`, `removeQualityRule`,
`defaultQualityRule`, `retargetQualityRule`, `qualityRuleSourceKey` / `parseQualityRuleSourceKey`, `describeConstraint`.

## 6. Gate engine (`src/assessmentQualityGates.ts`, pure)

`evaluateAssessmentQualityGates({ coverage, policy, policyIssues })` → `QualityGateReport { enabled, rules[], blockers[],
warnings[], policyIssues, policyBlockers, blockerCount, warningCount, canFinalize }`; each `QualityGateResult { ruleId,
enabled, source, sourceKey, effect, triggered, relation, actual, refLabel, expectedText, message, evidence, coverageId,
note?, issues }`.
- The coverage rows are indexed once by source key (`constraint:<id>`, `total-questions`, `total-marks`); each rule is one
  lookup → O(r + rows). The engine never reads questions, sections, raw marks or `weightMarks` and never re-implements
  relation math (guarded).
- `triggered = rule.enabled && relations.includes(row.relation)` — nothing else. `at-target`, `within-range` and
  `unassessable` trigger only when explicitly listed. Disabled rules never trigger. Evidence ids are copied from the row.
- **Enforcement:** the policy is enforced when it exists and is not explicitly `enabled: false` (so a malformed `enabled`
  cannot silently switch enforcement off). While enforced, policy-level issues and issues on **enabled** rules are
  `policyBlockers`; `canFinalize = blockers.length === 0 && policyBlockers.length === 0`. A disabled policy contributes
  nothing (rules are still listed for the editor; issues stay visible).
- **Rule `enabled` semantics (Independent Review Fix 1):** only an explicit `enabled: false` is intentional
  non-enforcement — that rule's issues stay visible but never block. An explicit `enabled: true` triggers and blocks as
  before. A malformed or absent `enabled` (validator `INVALID_RULE_ENABLED`) never triggers a gate, but while the policy
  is enforced its issues are `policyBlockers` (fail closed). The validator result is the single authority; the gate
  engine adds no second interpretation of malformed values, and neither the UI nor `App` special-cases this.
- Messages are factual: `عنونة IPv4 — الموجود 25%، وسياسة الجودة تمنع الاعتماد النهائي عند «أقل من الحد الأدنى».`,
  `2 أسئلة غير مصنفة — الحد الأقصى المسموح حسب السياسة: 0.`

## 7. The one finalization authority (`src/examFinalization.ts`)

`evaluateExamFinalization(exam)` → `{ structuralIssues, structuralErrors, structuralWarnings, coverage, policyIssues,
qualityReport, blockers[], warnings[], canFinalize }` with `canFinalize = structuralErrors.length === 0 &&
(qualityReport?.canFinalize ?? true)`. Blockers are ordered structural → policy → quality; warnings structural → quality.
Structural errors can never be downgraded by a policy; structural warnings keep their meaning; nothing is persisted.
`finalizationRefusalReason(decision)` renders the structured reason (`لا يمكن الاعتماد النهائي: أخطاء بنيوية: 1، حواجز
بوابات الجودة: 1`).

### Backward compatibility (mandatory)
| Exam | Behaviour |
|---|---|
| no Blueprint, no policy | identical to production: only structural errors block |
| Blueprint, no `qualityPolicy` | 13C-B analysis available; no gate; no implicit policy |
| `qualityPolicy.enabled = false` | visible / editable; adds no blockers or warnings |
| enabled policy | blockers block final authoring approval; warnings inform |

## 8. Save behaviour

- Builder: `اعتماد نهائي` → `requestFinalSave()` re-evaluates the **latest committed exam** (`latestExamRef`, commit-phase
  ref) and, when refused, opens `فحص الجاهزية للاعتماد` instead of calling the owner. Structural errors keep the historical
  HTML `disabled`; quality-gate blockers use `aria-disabled` + `title` + the status text so the control stays reachable and
  its click explains the refusal (never a disabled-only implementation). `حفظ مسودة` is never gated.
- App: `saveStructuredExam(mode)` → `runStructuredSave({ snapshot, mode, request, commitSaved })`
  (`src/structuredSavePolicy.ts`): a `final` save runs `evaluateExamFinalization` on the **exact snapshot to be persisted**;
  when `canFinalize` is false, no request is sent, nothing is committed and a structured reason is shown. Draft saves are
  unchanged; successful saves still reconcile through `commitSaved(snapshot, payload)` (13A). A newer render's verdict is
  never reused (the helper is pure per call).

### Server / governance boundary (explicit non-goal)
Quality Gates are the **authoring finalization authority inside the application**. `/api/save-exam-artifact` remains a
generic artifact persistence endpoint: this phase does not claim that a hostile or manual API request cannot write
`status: "final"`, and deliberately adds no partial server governance. The later **Versioning & Publishing Governance**
phase will make Draft → Review → Approved → Published server-authoritative (role permissions, reviewer identity, approval
timestamps, immutable published versions, transition guards, audit history); `FinalizationDecision` becomes one prerequisite
of that transition.

## 9. UI

- `🛡 سياسات الجودة` (`src/QualityPolicyPanel.tsx`, lazy): enable switch; rule cards (`li[data-rule-id]`) with source select
  (constraints by human label — id stored; totals; unclassified; unmapped), relation chips (coverage rules), metric + max
  (threshold rules), effect (`تنبيه` / `يمنع الاعتماد النهائي`), enabled, note, remove; `إضافة قاعدة`; live issues
  (`ul[aria-label="مشكلات السياسة"]`, per-rule issues). Every edit = one `update(prev => withBlueprint(prev, bp =>
  withQualityPolicy(bp, fn)))` = one history step; no-ops dispatch equal data (no entry, not dirty).
- Status `بوابات الجودة: N حاجب • M تنبيهات` / `بوابات الجودة: لا توجد موانع` (text, plus glyphs — never colour alone) when a
  policy exists; click → `فحص الجاهزية للاعتماد` (`src/FinalizationPanel.tsx`, lazy) with the sections `أخطاء بنيوية`,
  `بوابات الجودة`, `تنبيهات`; each item states effect, factual reason, current value / expected condition, policy note and
  the evidence action (`عرض الأسئلة` / `عرض غير المصنفة` / `عرض غير المربوطة`) through the existing selection / navigator.
- Live: everything derives from the canonical exam (`useMemo`), so question / marks / classification / move / delete /
  duplicate / cap / Blueprint / policy edits, undo, redo, recovery and bank insertion update the status immediately.
- Accessibility: RTL, native controls, named dialogs, headings per section, focus returned to the opener, phone layout
  stacks cards and full-width actions.

## 10. Security

Policy and finalization data are teacher governance data. The policy lives inside `blueprint`, which the sanitizer already
removes; the root keys `qualityPolicy`, `qualityGateReport`, `finalizationDecision`, `qualityBlockers`, `qualityWarnings`
are additionally stripped (defense in depth, tested). Question content, answer secrecy, media and bank-image rules unchanged.

## 11. Performance

Gate evaluation O(r + rows) with a one-time coverage index; no deep clone; no network. Coverage stays
O(n + c + taxonomy + issues) with H1 / H2. Panels are lazy chunks.

## 12. Tests

| Suite | Covers |
|---|---|
| `src/assessmentQualityPolicy.test.ts` | F1 model, F2 validator (every code, deleted constraint, label rename, five subjects), helpers (no-op references, no pruning) |
| `src/assessmentQualityGates.test.ts` | F3 relations / effects / disabled rule / disabled policy / unassessable / broken enabled vs disabled / malformed schema, totals, F9 thresholds (count, officialMarks, evidence order, no fuzzy), architecture (deterministic, no mutation, capScore official marks), five subjects |
| `src/examFinalization.test.ts` | F4 cases A–G, structural not downgradable, warnings preserved, purity |
| `src/structuredSavePolicy.test.ts` | F8 draft always sent, final sent when permitted, refused on structural / quality / malformed policy, exact snapshot, no analytics in payload, request failure |
| `src/assessmentQuality.persistence.test.ts` | F10 round trip (real `cleanExam`), autosave, history one step / no-op, copy, absent policy, nothing written by evaluation |
| `src/StructuredExamBuilder.quality.test.tsx` | F5 editor (history, undo/redo, no-op, issues), threshold rules, F6 status + panel live (marks, classification, cap, target, undo, redo, warning), broken constraint / undo / invalid policy / evidence → navigator, F7 final refused by handler (aria-disabled), warning allowed, draft allowed, structural unchanged, no-blueprint exam, accessibility |
| `src/assessmentQualityGates.guards.test.ts` | dependency direction, engine isolation, no relation re-implementation, 13C-C vocabulary boundary, no subject branch, H1 / H2, generator untouched |
| `api/tests/student-exam-sanitize-13c-c.test.js` | policy / gate / finalization data never reach a student |

Fail-first on `bd10c72`: 8 files failed, **12 failed / 2 passed** (the two passes pin pre-existing behaviour: structural
errors block as before; generator untouched). After implementation: 9 suites (incl. the migrated H1 suite) / 58 tests green;
broad regression set 54 files / 676 tests green.

## 13. Mutation proofs C1–C22

See §15 (and the PR body): each mutation applied alone → suites → reverted → tree fingerprint identical.

## 14. Non-goals honoured

No quality score / rating / ranking, no AI (recommendation, rule generation, auto-fix, classification), no template presets,
no server governance, no change to the legacy generator, no simulation scope change, no student payload change, no
persisted gate report.

## 15. Validation

| Check | Result |
|---|---|
| `npx tsc -b` | exit 0 |
| New 13C-C suites (8 files) + migrated H1 suite | 58 tests passed |
| Broad regression set (13C-A / Review Fix 1, 13C-B / Review Fix 1, bulk classification, bank scope / focus, builder suites, history, autosave / recovery, examQuality, official marks, grader, persistence, sanitizer, bank hydration, saved exams, assignment) | 54 files / 676 tests passed |
| `npm test` | 530 files / 6416 tests passed, 0 failed |
| `npm run build` | exit 0 |
| `npm run check:bundle` | initial JS graph 12 files, **119.3 KB gzip / budget 125 KB** — baseline `bd10c72` measured in a fresh worktree: 119.0 KB → **delta +0.3 KB**; lazy chunks: `examFinalization` 5.8 KB, `QualityPolicyPanel` 2.3 KB, `FinalizationPanel` 1.4 KB, `structuredSavePolicy` 0.3 KB gzip (App loads the save authority on demand) |
| `npm run lint` | exit 0 — 99 findings on baseline (fresh worktree) vs 99 on head, finding-for-finding identical: ZERO new warnings |

Mutation proofs C1–C22 (each applied alone → the eight 13C-C suites → reverted → tree fingerprint identical): all caught —
C1 raw q.marks in the engine (2), C2 weightMarks in a gate (2), C3 engine reads the raw exam (1), C4 warning treated as
blocking (9), C5 blocker treated as warning (14), C6 disabled rule triggers (1), C7 disabled policy blocks (3), C8 broken
constraint reference not detected (6), C9 broken enabled policy ignored (4), C10 constraint referenced by label (19), C11
handler calls save without re-check (1), C12 App path without guard (2), C13 draft blocked (2), C14 gate report persisted in
the payload (1), C15 policy data reaches the student (1), C16 quality score added (2), C17 subject-specific branch (1), C18
policy editor bypasses history (2), C19 same-value edit creates a step (1), C20 relation math re-implemented inline (1 — the
first run survived because the guard accepted the mere import; the guard now requires the call and forbids inline float
thresholds), C21 stale verdict reused across snapshots (2), C22 structural errors downgraded by policy (2).
