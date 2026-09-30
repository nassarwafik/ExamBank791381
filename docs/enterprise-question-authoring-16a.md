# Phase 16A — Enterprise Question & Activity Registry + Advanced Authoring Toolkit — Wave 1

Baseline: `origin/main` = `6468cc74db71131ef8d9f91e91a1af7ebc8e9a41` (merge of PR #228 — Phase 15A; post-merge run 856:
Quality Gate success, Build and Deploy success). Branch `feature/16a-enterprise-question-registry`. This document is the
authoritative design of the phase; the PR body carries the evidence summary.

## 1. Objective

Turn the fixed 11-type Structured Exam Builder into an authoring studio with ONE versioned, extensible Question Type Catalog
and code-owned runtime registries, so that a future question type (Phase 16B: `networkSimulation` v1) is a registration —
not another set of `if (type === …)` branches across the Builder, the student page, the grader, the sanitizer and the
Blueprint. Wave 1 delivers four production types on top of the registry: Multiple Select, Numeric Response, Matrix,
Categorization — plus the Question Type Palette and versioned type / capability metadata.

**Assessment Activity Context != Scored Question Runtime.** `AssessmentActivityDescriptor` (13C-A) stays interactive
CONTEXT: never a response, never grading authority. A scored interactive question is a registered question type whose
student response is an ordinary `Answer` (see §12 handoff).

## 2. Audit of the 11-type dispatch on the baseline

| Surface | Baseline responsibility | 16A |
|---|---|---|
| `src/examTypes.ts` | hand-maintained `BUILDER_QUESTION_TYPES` (11), `BUILDER_PART_TYPES` (filter), `QUESTION_TYPE_LABELS` (11 literals) | all three DERIVE from the catalog; public names / order / labels unchanged |
| `src/examBuilderState.ts` | `applyTypeDefaults` 11-case switch; `changeQuestionType` carried id / number / group / text / marks only | legacy switch kept byte-for-byte (legacy adapter); registered types seed code-owned defaults + `questionTypeVersion`; type change carries meta / activity / media and RESETS every body key (`typeChangePatch`, `mergePatch`) |
| `src/QuestionComposer.tsx` | `<select>` of 11 types; compound vs `QuestionBodyEditor` | same host; destructive type change → shared `ConfirmDialog` («تغيير نوع السؤال»); unknown current type shown as «غير مدعوم» |
| `src/QuestionBodyEditor.tsx` | 8 `if (type === …)` branches | thin HOST: registry editor (lazy) → legacy adapter (unchanged inline editors) → explicit unsupported state |
| `src/CompoundQuestionEditor.tsx` | `BUILDER_PART_TYPES` select + `QuestionBodyEditor` per part | unchanged; part types derive from the `compoundPart` capability, so Wave 1 types appear automatically |
| `src/StudentQuestionCard.tsx` | inline rendering by lower-cased type (radio / fields / table / seq / textarea); 5 callbacks | resolves the student registry first (registered types render inside the same card chrome through `onAnswer(next)`); legacy path untouched |
| `src/CompoundQuestion.tsx` | second mini-dispatch (`isChoice` / `fieldPartTypes` / textarea) | registered part types render through the SAME student registry; legacy parts unchanged |
| `src/answerState.ts` / `api/src/lib/exam-structure.js` | `choice / sequence / table / text / fields / compound` | + `multiChoice`, `numeric`; unknown kinds fail closed in both mirrors |
| `src/examQuality.ts` | `validateBody` 11-case switch | canonical seam runs first (unknown key / unsupported version / compound capability / executable fields / registered validators, all BLOCKING); legacy switch kept |
| `src/assessmentBlueprint.ts` | `questionType` ref checked against `BUILDER_QUESTION_TYPES` | unchanged code — the list now derives from the catalog, so new types are valid automatically |
| `src/assessmentBlueprintCoverage.ts` | `byType[presentationType]`, labels from `QUESTION_TYPE_LABELS` | unchanged — classifies Wave 1 types normally |
| `src/structuredExamImport.ts` | second `CANONICAL_TYPES` + alias table | both derive from the catalog (`isKnownQuestionType`, `resolveQuestionTypeKey`, `LEGACY_TYPE_ALIASES`); unknown types kept verbatim + `UNSUPPORTED_QUESTION_TYPE` |
| `api/src/lib/assignment-grading.js` | response-kind-first `gradeQuestion` with legacy type / `answer.mode` fallbacks | resolves `api/src/lib/question-type-graders.js` first; the original dispatch is the LEGACY adapter (`gradeLegacyQuestion`), byte-for-byte; unknown → `unknownTypeResult` |
| `api/src/lib/student-exam-sanitize.js` | `answer: {}` + flag keys + planning keys | unchanged strategy; Wave 1 config objects (`numeric`, `matrix`, `categorization`) additionally pass the canonical secret-key policy |
| `src/assessmentActivity.ts`, `ActivityDescriptorEditor.tsx` | interactive CONTEXT descriptor | untouched (guarded: never scored) |

Why the old dispatch became expensive: each new type needed edits in ≥ 8 files (defaults, labels, editor, student card,
compound renderer, quality validator, grader, import list) and the student card was heading toward one callback per type.

## 3. Architecture

```
                 src/questionTypeCatalog.ts  (pure, frozen, compiled into the server shared build)
                 key · version · label · category · gradingMode · capabilities · responseKinds
                                        │
     ┌──────────────────────┬───────────┴────────────┬──────────────────────┐
 authoringRegistry.tsx  studentRegistry.tsx   questionTypeValidation.ts   api/…/question-type-graders.js
 key → lazy Editor      key → lazy Renderer   key → validator (pure)     key → handler (shared scoring)
     │                      │                        │                          │
 QuestionBodyEditor     StudentQuestionCard      examQuality /            assignment-grading.gradeQuestion
 (host)                 CompoundQuestion         finalization             (authority; legacy adapter; fail-closed)
```

- **Catalog** (`QUESTION_TYPE_CATALOG`, frozen): legacy 11 in historical order, then Wave 1. `registerQuestionType(def)`
  adds a code-owned plugin type at module level and returns the unregister function; production keys and malformed keys
  are refused. Lookups: `questionTypeDefinition`, `isKnownQuestionType`, `resolveQuestionTypeKey` (exact / case-insensitive),
  `listQuestionTypes`, `compoundPartTypeKeys`, `currentQuestionTypeVersion`, `supportsQuestionTypeVersion`. Legacy import
  aliases (`mcq`, `tf`, `open`, …), category / grading-mode labels live in `src/questionTypeAliases.ts` (shared build, but
  outside the student initial graph); descriptions / icons in `src/questionTypes/typePresentation.ts` (lazy with the palette);
  the type-change patch helpers and the authored-content heuristic in `src/questionTypes/typeContent.ts` (builder only).
- **Plugin seam** `src/questionTypes/registerQuestionTypePlugin.ts` registers definition + defaults + validator + editor +
  student renderer in one call (server grader: `registerGrader`). The test-only synthetic type `syntheticInteractive`
  proves the seam without touching any central file (guarded).
- **Persisted data never selects code**: exam JSON carries `presentationType` / `type` + `questionTypeVersion` + its own
  configuration; every `import()` in a registry is a literal relative path; `EXECUTABLE_NODE_FIELDS` (`component`,
  `module`, `path`, `import`, `renderer`, `grader`, `script`, `html`, `srcdoc`, `eval`, `src`, `url`, …) on a node is a
  blocking validation error.

## 4. Versioning

`questionTypeVersion?: number` on questions and compound parts. Absence = the canonical V1 behaviour of the type. Legacy
factories never write it (A2 / M19: opening or saving an old exam writes nothing); a newly created Wave 1 question and a type
change to a Wave 1 type are stamped with the type's current version (1). `supportsQuestionTypeVersion` accepts `undefined`
or an integer `1..current`; anything else is `UNSUPPORTED_QUESTION_TYPE_VERSION` (blocking) and the server grader fails
closed for it. A published revision's stored version decides semantics — never "latest plugin behaviour".

## 5. Legacy compatibility

All 11 types keep storage shapes, editors, renderers, answers and grading. Proof: `api/tests/grading-parity-16a.test.js`
replays a snapshot generated on the untouched baseline grader (22 structured questions across every type, compound
explicit / auto / mixed marks and a manual-review part, `all` / `capScore` / `firstNAnswered` at question and part level, a
legacy flat exam with alias / missing types, edge single questions) — byte-identical after the refactor. The ONE documented
divergence: a STRUCTURED question whose `presentationType` is neither a catalog type nor a legacy alias is now fail-closed
(score 0, manual review); on the baseline it was graded by response kind. Legacy flat questions (no `presentationType`)
keep the original grader.

## 6. Response contracts (`answerState.ts`)

`choice / sequence / table / text / fields / compound` unchanged. Added: `{ kind: "multiChoice", optionIds: string[] }`
(Multiple Select — option IDENTITIES) and `{ kind: "numeric", value: string, unit?: string }` (Numeric Response — raw typed
text; the grader parses). Matrix (`rowId → columnId`) and Categorization (`itemId → categoryId`) reuse `fields`.
`answered()` and the server mirror `isResponseAnswered` recognise both; unknown kinds are never "answered". The student
page stores every answer in the same `Record<questionId, Answer>` (autosave / submission / resync untouched) through one
generic seam `onAnswer(next)` on the card / section / preview / Live Challenge.

## 7. Grading authority

Official scores stay server-side. `gradeQuestion`: compound → `gradeCompound` (unchanged); else `resolveGrader(type,
version, { legacyFlat })`: registered handler → clamp `[0, max]`; `LEGACY` → the original dispatch; `undefined` (unknown
key, unsupported version, structured question with an unknown `presentationType`) → `unknownTypeResult` (score 0, manual
review, `unsupportedType: true`) so it never receives credit, never falls through to another grader, never crashes
submission and never finalizes. Grading modes in the catalog: auto (MCQ, TF, multi-TF, fill, word bank, matching, ordering,
table, CLI, the four Wave 1 types), hybrid (shortAnswer — existing behaviour), composed (compound).

## 8. Wave 1 types and scoring formulas (`src/questionTypeScoring.ts`, one implementation for browser tests and server)

| Type | Data (student-visible) | Answer key (under `answer`, stripped for students) | Response | Score |
|---|---|---|---|---|
| `multipleSelect` | `options[{ id, text }]` | `correctOptionIds`, `scoring` | `multiChoice.optionIds` | S = selected ∩ valid (dedup), C = correct. `allOrNothing`: S = C → marks else 0 · `partialNoPenalty`: \|S∩C\|/\|C\| × marks · `partialWithPenalty`: max(0, (\|S∩C\| − \|S∖C\|)/\|C\|) × marks. Always 0 ≤ score ≤ marks; empty S = unanswered; invalid ids ignored |
| `numericResponse` | `numeric.unitRequired` | `mode` (`tolerance` / `range`), `expected`, `tolerance`, `min`, `max`, `unit` | `numeric.value`, `unit` | parse: ASCII / Arabic-Indic digits, `.` `,` `٫` `،` as decimal separator, optional exponent, finite only, no expressions. tolerance: \|v − expected\| ≤ tolerance (inclusive, ε = 1e-9·scale). range: min ≤ v ≤ max (inclusive). Unit compared only when required (NFKC, lower-case, whitespace removed) |
| `matrix` | `matrix.rows[{id,label}]`, `matrix.columns[{id,label}]` | `correctColumnByRow{rowId: columnId}` | `fields{rowId: columnId}` | correctRows / totalRows × marks |
| `categorization` | `categorization.categories`, `.items` | `correctCategoryByItem{itemId: categoryId}` | `fields{itemId: categoryId}` | correctItems / totalItems × marks |

Validation (`questionTypeValidation.ts`): Multiple Select ≥ 2 options, unique ids, non-empty option text, ≥ 1 existing
correct id, known scoring; Numeric finite expected / non-negative finite tolerance / finite ordered range / known mode /
unit present when required; Matrix ≥ 1 row, ≥ 2 columns, unique ids, exactly one existing correct column per row;
Categorization ≥ 2 categories, ≥ 1 item, unique ids, an existing category per item.

## 9. Security model

Code-owned catalog and registries; no `eval` / `new Function` / iframe / srcdoc / innerHTML / external URL in any 16A
module (guarded); unknown types fail closed on the client (blocking issue) and the server (score 0 + manual review); the
student payload never carries a key (every key lives under `answer`, which the sanitizer blanks; option ids / rows /
columns / categories / items / `unitRequired` are the only new visible data; smuggled `answerKey` / `correctColumn` inside
a config object is stripped by the canonical secret-key policy); the activity descriptor remains context-only.

## 10. Blueprint, compound, palette, inspector, performance

- **Blueprint**: `dimension: "questionType"` validates against `BUILDER_QUESTION_TYPES`, which derives from the catalog —
  Wave 1 types are valid references automatically and coverage classifies them under `byType`.
- **Compound**: `BUILDER_PART_TYPES` = `compoundPart` capability; parts consume the same authoring host and the same student
  registry; explicit / automatic / mixed marks, part-level `firstNAnswered` and `manualReviewMarks` unchanged.
- **Palette** (`src/questionTypes/QuestionTypePalette.tsx`, lazy): cards (icon, label, description, grading mode, capability
  chips), search, category tabs (اختيار / إجابات / منظّم / تفاعلي / مركّب), arrow-key navigation, empty state, RTL, narrow
  screens; opened from «+ إضافة سؤال»; UI state is never persisted.
- **Inspector metadata**: `StructuredQuestionEditor` shows نوع السؤال · الإصدار · طريقة التصحيح · capability chips.
- **Performance**: the palette, the four editors and the four renderers are lazy chunks (guarded by a static-import scan).
  Initial JS graph (gzip, `npm run check:bundle`): baseline `6468cc7` 13 files / **120.0 KB** → 16A 14 files / **121.9 KB**
  (**+1.9 KB**, budget 125 KB). Per chunk: `index` 104.6 → 105.4 (+0.8: Wave 1 default shapes — `newQuestion` lives in
  `examBuilderState`, so they must be synchronous —, `mergePatch`, the wider `changeQuestionType` carry, `examTypes` constants
  Vite moved here from `examPreviewModel`), `examPreviewModel` 1.2 → 0.7 (−0.5, same move), `StudentQuestionCard` 2.8 → 3.3
  (+0.5: the student registry lookup + `onAnswer` seam), new shared chunk `questionTypeCatalog` **1.1** (Vite emits the
  catalog as its own chunk because the initial graph AND the lazy builder / quality / palette chunks import it; it carries the
  15 frozen definitions + registry functions and its own chunk overhead). The +1.9 KB sits 0.4 KB above the ~1.5 KB soft
  target: the catalog is the ONE canonical source the student runtime needs for labels / key resolution and cannot be split
  further without a second list, which the phase forbids. Everything type-specific (editors, renderers, palette, descriptions,
  icons, aliases, validators, scoring, content heuristic) stays out of the initial graph.

## 11. Five-subject evidence and tests

`src/questionTypeCatalog.16a.test.ts` runs Networking (multipleSelect), Computer Science (matrix), Mathematics
(numericResponse), Physics (numericResponse with a required unit), Chemistry (categorization) through the same validation
seam; a guard asserts no subject branch exists in any registry / scoring / validation module.

Suites: `src/questionTypeCatalog.16a.test.ts` (A1, A2, A4, A15, A20, five subjects), `src/questionTypeScoring.16a.test.ts`
(A5–A11 + seam), `api/tests/question-type-grading-16a.test.js` (A6–A11 via `gradeExam`, A14, A16, A17, A13, A12, A3),
`api/tests/grading-parity-16a.test.js` (§36), `api/tests/question-type-guards-16a.test.js` (§38, M20–M22 guards),
`src/questionTypes/authoring.16a.test.tsx` (A18, editors, A19, §24, A16 UI, A3), `src/questionTypes/studentRuntime.16a.test.tsx`
(renderers, A13, A14, §26 preview parity, A3).

**Migrated legacy pins (§6 — the 11-type count / literal lists were the ONLY thing they asserted)**: `src/examTypes.registry.test.ts`
(now mirrors the catalog: 11 legacy first, stable order, every catalog type), `src/QuestionComposer.test.tsx`,
`src/StructuredQuestionEditor.test.tsx`, `src/StudentExamPage.ux7b1.test.tsx` (answer-kind union prefix + new kinds),
`src/games/liveChallenge/LiveChallengeAuthoring.test.tsx` and `LiveChallengeGenerator.test.tsx` (the shared type picker
offers every catalog type instead of exactly 11), `api/tests/assessment-presets-guards-15a.test.js` (`SHARED_ENTRIES` prefix).
Every other legacy suite passes unchanged.

**Fail-first on `6468cc7`** (`scratchpad/16a/fail-first-6468cc7.log`): 7 files failed · 10 tests failed / 5 passed — the 5
passing tests are the grading-parity snapshot, which must pass before and after by design.

### Mutation campaign M1–M22 (one mutant at a time · targeted 16A suites + drift + registry test · revert · tree fingerprint)

| # | Mutation | Result | First failing test | Tree after revert | Verdict |
|---|---|---|---|---|---|
| M1 | remove one original type (`ordering`) from the catalog | 10 failed / 75 passed (85) | `lists the 11 legacy types first (stable order) followed by the four Wave 1 types; frozen; every` | clean | **killed** |
| M2 | registry / labels drift from the catalog (student registry + `QUESTION_TYPE_LABELS` invent their own label) | 3 failed / 82 passed (85) | `has a label for every question type and the 11 historical labels are unchanged (labels remain t` | clean | **killed** |
| M3 | allow an unknown question type through validation / finalization | 3 failed / 82 passed (85) | `a new Wave 1 question is created at its current version; an unsupported version or unknown type` | clean | **killed** |
| M4 | treat an unsupported `questionTypeVersion` as the current version | 4 failed / 81 passed (85) | `unknown keys and unsupported versions are blocking issues; a part of a non-compound-capable typ` | clean | **killed** |
| M5 | multipleSelect option reorder rewrites ids by position (key corrupted) | 1 failed / 8 passed (9) | `multipleSelect: stable option ids … (identity-follows-the-option assertions)` | clean | **killed** — first run SURVIVED (85/85); test strengthened, re-run killed |
| M6 | multipleSelect score can exceed max (clamp removed) | 6 failed / 79 passed (85) | `multipleSelect: three scoring modes, clamped to [0, max] 27ms` | clean | **killed** |
| M7 | partialWithPenalty produces a negative score | 1 failed / 84 passed (85) | `partialWithPenalty: max(0, (` | clean | **killed** |
| M8 | numeric tolerance boundary becomes exclusive | 3 failed / 82 passed (85) | `tolerance mode: boundaries exactly ON the tolerance are accepted (inclusive, epsilon-safe), jus` | clean | **killed** |
| M9 | reversed numeric range accepted | 1 failed / 84 passed (85) | `A9 — configuration: NaN / infinite / negative tolerance / reversed range / unknown mode rejecte` | clean | **killed** |
| M10 | numeric grader evaluates the raw string as an expression (`new Function`) | 4 failed / 81 passed (85) | `parses decimal notation, Arabic-Indic digits, Arabic decimal separators and safe scientific not` | clean | **killed** |
| M11 | matrix correctness keyed by column INDEX instead of identity | 1 failed / 84 passed (85) | `partial credit per correctly answered row, deterministic; identities are stable ids — reorderin` | clean | **killed** |
| M12 | categorization correctness keyed by item INDEX instead of identity | 1 failed / 84 passed (85) | `correctItems / totalItems × marks; stable item / category identity under reorder; unanswered an` | clean | **killed** |
| M13 | answer key leaks through the sanitizer (`answer` kept on questions) | 2 failed / 83 passed (85) | `the student payload keeps display / config data and never the keys, expected values, tolerances` | clean | **killed** |
| M14 | a Wave 1 type stops working as a compound part (registry ignored for parts) | 2 failed / 83 passed (85) | `a compound with multipleSelect + numeric + matrix parts renders each part through the registry ` | clean | **killed** |
| M15 | Blueprint keeps a separate stale literal type list | 3 failed / 82 passed (85) | `Blueprint and structured import derive their question-type vocabulary from the catalog (no stal` | clean | **killed** |
| M16 | unknown server type silently graded through the legacy adapter | 2 failed / 83 passed (85) | `the ONE documented divergence: a STRUCTURED question whose presentationType is neither a catalo` | clean | **killed** |
| M17 | old MCQ grading changes (`correctOptionIndex + 1`) | 6 failed / 79 passed (85) | `full structured exam: identical totals, per-question scores, manual-review marks, section resul` | clean | **killed** |
| M18 | old compound grading changes (part score halved) | 4 failed / 81 passed (85) | `full structured exam: identical totals, per-question scores, manual-review marks, section resul` | clean | **killed** |
| M19 | legacy questions get `questionTypeVersion` stamped | 2 failed / 83 passed (85) | `legacy factories keep their exact default shapes (no questionTypeVersion is written on a legacy` | clean | **killed** |
| M20 | validator stops refusing executable field names on persisted nodes | 1 failed / 84 passed (85) | `persisted question data can never select code: the validator rejects executable field names on ` | clean | **killed** |
| M21 | the palette becomes a static import (initial bundle) | 1 failed / 84 passed (85) | `the Question Type Palette and the four advanced editors are lazy (dynamic import only) from eve` | clean | **killed** |
| M22 | `AssessmentActivityDescriptor` gains a scoring function | 1 failed / 84 passed (85) | `AssessmentActivityDescriptor is never scored: no grader / response / marks path reads `activity` | clean | **killed** |

Fingerprint (md5 of `git status --short` + `git diff` + untracked md5s) identical before and after every mutant. Log: `scratchpad/16a/mutations-16a-summary.txt`, per-mutant `mut16a-M*.log`.


## 12. Phase 16B handoff — Packet-Tracer-Familiar Network Simulation Assessment Runtime

16B adds ONE registered type, `networkSimulation` version 1, as a plugin:

| 16B piece | 16A seam |
|---|---|
| catalog definition (`category: "interactive"`, `gradingMode: "auto"`, `capabilities.interactive = true`, `compoundPart` as decided, `responseKinds: ["fields"]` or a new explicit kind) | `registerQuestionType` via `registerQuestionTypePlugin` |
| topology authoring editor (lazy) | `Editor` in the plugin → rendered by the `QuestionBodyEditor` host |
| device / runtime renderer + CLI terminal (lazy) | `StudentRenderer` in the plugin → rendered by `StudentQuestionCard` / `CompoundQuestion` through `onAnswer(next)` |
| student simulation response / state | an ordinary `Answer` stored in the existing `Record<questionId, Answer>` (autosave / submission untouched); add a discriminated kind to `answerState.ts` + `exam-structure.js` only if `fields` is not semantically clean |
| server state validator | `registerTypeValidator` (config / answer-key shape, stable identities, executable-field refusal already enforced) |
| partial-credit grader | `registerGrader("networkSimulation", handler)` using a pure scoring module compiled into the shared build |

Nothing in `StructuredExamBuilder`, `QuestionComposer`, `StudentExamPage`, the central grading flow or the Blueprint changes
beyond registration. The synthetic `syntheticInteractive` plugin in the 16A tests exercises exactly this path (authoring
host, palette, validation, student card, compound part, server grader). Deferred deliberately: the simulator itself, any
iframe / external URL / HTML runtime, GeoGebra / Desmos / H5P / LTI / QTI, hotspot, coding sandbox, drag-and-drop UI
(16C may add a drag presentation over the same `fields` response), recently-used / favourites in the palette, a larger
Enterprise Inspector, Question Bank generalization (Phase 17).
