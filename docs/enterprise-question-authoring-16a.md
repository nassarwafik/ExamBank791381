# Phase 16A — Enterprise Question & Activity Registry + Advanced Authoring Toolkit — Wave 1

Baseline: `origin/main` = `6468cc74db71131ef8d9f91e91a1af7ebc8e9a41` (merge of PR #228 — Phase 15A; post-merge run 856:
Quality Gate success, Build and Deploy success). Branch `feature/16a-enterprise-question-registry`. This document is the
authoritative design of the phase; the PR body carries the evidence summary.

## 1. Objective

Turn the fixed 11-type Structured Exam Builder into an authoring studio with ONE versioned, extensible Question Type Catalog
and code-owned runtime registries, so that a future question type (Phase 16B: every simulation / interactive runtime
profile — network lab, function graph, projectile motion, circuit lab, chemical equation, algorithm trace, …) is a registration —
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
- **Plugin seam** `src/questionTypes/registerQuestionTypePlugin.ts` registers ONE type FAMILY: the catalog definition
  (identity + CURRENT version + capabilities) and one executable implementation PER VERSION (defaults, validator, editor,
  student renderer) in one transactional call (server grader: `registerGrader(key, version, handler)`). The test-only
  synthetic families `syntheticInteractive`, `versionedSynthetic` (V1 + V2) and `universalSim` prove the seam without
  touching any central file (guarded). See §13 for the version-bound runtime identity.
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


## 12. Phase 16B handoff — Universal Simulation & Interactive Assessment Runtime

Phase 16B is NOT a network simulator with an assessment bolted on. It is a **domain-neutral runtime**: networking is ONE
plugin / runtime profile alongside mathematics, physics, chemistry, computer science and future domains. The Question Type
Registry built here (catalog + version-bound registries + universal sanitizer contract + `onAnswer` seam + authoritative
grader registry) is the **host boundary** 16B plugs into; nothing in the universal runtime may branch on a subject.

```
                         Universal Simulation Runtime  (16B)
                                    │
        ├── Simulation Registry            = registerQuestionTypePlugin family (key@version), 16A
        ├── Versioned Scenario Contract    = public `scenario` / `publicConfig` per (key, version), 16A sanitizer contract
        ├── Serializable State             = an ordinary `Answer` (fields / a new explicit kind), 16A
        ├── Student Runtime Host           = StudentQuestionCard / CompoundQuestion → StudentRenderer@version, 16A
        ├── Authoring Host                 = QuestionBodyEditor → Editor@version, Palette, composer selector, 16A
        ├── State Validation               = registerTypeValidator(key, version), 16A
        ├── Server Grading                 = registerGrader(key, version, handler) → assignment-grading authority, 16A
        ├── Partial Credit Assertions      = pure scoring module per plugin, compiled into the shared build
        ├── Autosave / Restore             = existing Record<questionId, Answer> pipeline, untouched
        ├── Accessibility                  = renderer contract (labelled controls, keyboard, RTL)
        ├── Lazy Loading                   = every runtime chunk behind import(), bundle guard
        └── Security Boundary              = no eval / iframe / external URL; exam JSON never names code; answer keys only under `answer`
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                  Math           Physics        Chemistry
                    │               │               │
               Networking        CS / Data     future domains
```

Representative plugin families (each ONE `registerQuestionTypePlugin` + ONE `registerGrader` per version; no central edit):

| family | domain | scenario (public) | answer (private) | response |
|---|---|---|---|---|
| `network-lab@1` | Networking | topology, devices, links, initial configs | expected reachability / config assertions | device states / CLI transcript (`fields`) |
| `function-graph@1` | Mathematics | axes, given points, allowed tools | expected function parameters ± tolerance | plotted parameters (`fields`) |
| `quadratic-function@1` | Mathematics | coefficients range, prompt | roots / vertex with tolerance | numeric fields |
| `projectile-motion@1` | Physics | launcher, target, g | expected angle / speed ± tolerance | chosen parameters |
| `free-fall@1` | Physics | height, medium | expected time / velocity | measured values |
| `circuit-lab@1` | Physics | components, board | expected currents / closed loops | wiring state |
| `chemical-equation@1` | Chemistry | reactants, products | balanced coefficients | coefficient fields |
| `molecule-builder@1` | Chemistry | atom palette | expected bonds / formula | built structure |
| `algorithm-trace@1` | Computer Science | code, inputs | expected trace / outputs | trace table (`fields`) |
| `data-experiment@1` | CS / Data | dataset, tools | expected statistics ± tolerance | computed values |

Rules every 16B plugin inherits from 16A: identity is `(key, version)`; V2 is ADDITIVE (V1 keeps serving stored V1
questions); **`definition.version = N` means the family ships implementations 1..N with no gaps** — a deployment that
introduces `network-lab@3` ships V1, V2 and V3 while those versions remain supported, and no historical implementation may
disappear merely because the current version increased; the same historical-version preservation rule binds future
`.smartsim` / uploaded simulator package versions (a package that claims version N must carry, or resolve to, every supported
version 1..N; a gapped package is refused exactly like a gapped code family); **production server-grader invariant**: for
every AUTO-GRADED simulation version admitted into a production plugin family, `(key, version)` must also have an
authoritative server grader registered (`registerGrader(key, version, handler)`) before that type/version may ship — Phase
16B tests must pin this for every production simulation plugin (16A ships no fake graders); the student receives ONLY the public scenario (the universal sanitizer strips `answer` and every secret-looking
key inside any plugin object without knowing the domain); the response is a serializable `Answer` routed through
`onAnswer(next)`; the server grader for the exact version is the only scoring authority; an unknown key or unsupported
version fails closed on every surface. Deferred deliberately: the simulators themselves, any iframe / external URL / HTML
runtime, GeoGebra / Desmos / H5P / LTI / QTI, hotspot, coding sandbox, drag-and-drop presentation, palette favourites, a
larger Enterprise Inspector, Question Bank generalization (Phase 17).

## 13. Independent Review Fix 1 — Truly Versioned & Universal Plugin Runtime

### 13.1 R1 root cause
The persisted identity was already `type + questionTypeVersion` and `supportsQuestionTypeVersion` accepted `1..current`, but
every runtime registry (authoring editor, student renderer, validator, defaults, server grader) was keyed by the type KEY
alone. With a future `functionSimulation@2`, a stored `functionSimulation@1` would have resolved the V2 implementation —
silently reinterpreting a published assessment and breaking governance immutability.

### 13.2 Version-bound runtime identity
- `QuestionTypeIdentity = { key, version }`, canonical id `key@version` (`questionTypeIdentityKey`).
- **`effectiveQuestionTypeVersion(key, stored)`** is THE normalization authority (pure, shared build): known type + absent →
  1; explicit integer within `1..current` → itself; unknown key / 0 / negative / fraction / string / above current →
  `undefined` = fail closed. It never coerces 2 into 1 and never upgrades V1 to current.
- **`createVersionedRegistry<T>()`** (catalog module) backs every registry: `register(key, version, impl)` refuses a taken
  identity (a new version is additive and can never replace an older one); `resolve(key, stored)` normalizes through the
  authority and looks the EXACT identity up — no "latest" fallback anywhere.

| registry | was | now | miss → |
|---|---|---|---|
| authoring (`authoringRegistry.tsx`) | key → Editor | `(key, version)` → Editor (`resolveAuthoringEditor(type, node.questionTypeVersion)`) | explicit «إصدار غير مدعوم» state in `QuestionBodyEditor` |
| student (`studentRegistry.tsx`) | key → Renderer | `(key, version)` → Renderer (card / compound pass the stored version) | `qt-student-unsupported` safe notice, no crash, no legacy guess for a versioned identity |
| validation (`questionTypeValidation.ts`) | key → validator | `(key, version)` → validator; `validateQuestionTypeNode` resolves the effective version first | `UNSUPPORTED_QUESTION_TYPE_VERSION` (blocking) |
| defaults (`questionTypeDefaults.ts`) | key → defaults | `(key, version)`; a NEW node takes the catalog's current version's defaults and is stamped with it; a node that already carries a supported version keeps it (V2 defaults never touch a V1 node) | legacy factories untouched, never stamped |
| server (`question-type-graders.js`) | key → grader | `registerGrader(key, version, handler)`; `resolveGrader` → exact identity through the shared authority; a family registered without a catalog entry serves V1 only | `unknownTypeResult` (score 0 + manual review) |

Proof (`versionedSynthetic`, current 2, both versions registered): RV1 absent → V1 · RV2/RV3 exact editors · RV4/RV5 exact
renderers, V3 → safe notice · RV6/RV7 `@1` → 4/10 and `@2` → 8/10 for the same response · RV8 registering V2 never
replaces V1 (duplicate identity refused) · RV9 V3 fails closed · RV10 a sanitized/published V1 stays V1 and grades V1 after
V2 exists.

### 13.3 Plugin family + transactional registration
`registerQuestionTypePlugin({ definition, versions: { 1: {...}, 2: {...} } })`: the family is validated up front — **the
COMPLETE family first: `definition.version = N` means the family ships implementations 1..N with no gaps** (Review Fix 2;
`{2}` for current 2, `{1,3}` for current 3 and `{1,2,4}` for current 4 are refused before any registry is touched, and a
missing version is never filled from a neighbour) — then every version within `1..N`, components / functions well-formed, then
registered step by step (catalog → per version: defaults, validator, editor, renderer). If step N fails, steps N-1…1 are
undone and the error is rethrown — no catalog / defaults / validator / editor / renderer residue (tested by occupying the
last step's slot). The returned function removes every registration.

### 13.4 R2 — the platform reflects a live registration everywhere
| surface | was | now |
|---|---|---|
| Blueprint `questionType` validation | frozen `BUILDER_QUESTION_TYPES` | `isKnownQuestionType(ref)` — live catalog (UP3) |
| coverage / quality-policy labels | frozen `QUESTION_TYPE_LABELS` | `questionTypeLabel(ref)` — live (UP4) |
| composer type selector | frozen list | `listQuestionTypes()` — live, canonical label, selected after creation, survives undo/redo (UP2) |
| compound part selector | frozen `BUILDER_PART_TYPES` | `compoundPartTypeKeys()` — live `compoundPart` capability (UP5) |
| Blueprint panel ref picker, navigator type filter, Live Challenge picker, import wizard / challenge picker / productivity labels | frozen | live list / `questionTypeLabel` |
| Live Challenge source import | frozen membership | `isKnownQuestionType` |
| `BuilderQuestionType` union | hand-written 15-key union | **derived** from the `as const` production rows (`ProductionQuestionTypeKey`) — adding a production type is one catalog row |

`BUILDER_QUESTION_TYPES` / `BUILDER_PART_TYPES` / `QUESTION_TYPE_LABELS` remain exported as the immutable PRODUCTION
SNAPSHOT (their own contract tests keep mirroring the catalog). Registered plugin keys are runtime data and widen to `string`
at the extension seams; production identity has ONE compile-time source of truth.

### 13.5 Universal student sanitization contract
A plugin never asks the central sanitizer to know its domain. Contract: **student-visible data is PUBLIC configuration under
type-owned object fields** (`numeric`, `matrix`, `categorization`, `scenario`, `publicConfig`, …); **every answer key /
expected state / scoring assertion / solution lives ONLY under `answer`** (always blanked) or another teacher-only field the
sanitizer always strips. Enforcement is generic: every object-valued field of a question / part that is not a structural
field with its own sanitizer (`answer`, `options`, `fields`, `parts`, `image`, `images`, `activity`, `stimulus`) is passed
through the canonical secret-key policy recursively (`expected*`, `correct*`, `solution*`, `answer*`, `scoring*`, … removed
at any depth; ids / labels / values pass byte-for-byte). The former `TYPE_CONFIG_KEYS` domain list is gone (guarded); the Wave
1 protections are unchanged (tested). Persisted exam JSON cannot name this code; a version-bound projection hook was not
needed — the contract is data-shape-based and identical for every version.

### 13.6 Evidence
Fail-first on `e1f295a`: `src/questionTypes/versionedRuntime.16a-rf1.test.tsx` + `api/tests/question-type-versioning-16a-rf1.test.js`
→ 2 files failed · 18 tests failed / 1 passed. Mutation campaign RF1-M1–M10: see the table in the PR body (§13 of the PR).

## 14. Independent Review Fix 2 — Complete Version Family Invariant

**Root cause.** `effectiveQuestionTypeVersion` / `supportsQuestionTypeVersion` treat every integer `1..definition.version`
as supported, but `registerQuestionTypePlugin` required only the CURRENT version to be implemented. A family
`{ definition.version: 2, versions: { 2 } }` was therefore accepted while `effectiveQuestionTypeVersion(key, 1)` returned 1:
the catalog said "V1 supported", the runtime had no V1 editor / renderer / validator, and a stored or imported `key@1` could
pass version validation only to fail closed later at render / grade time.

**Invariant (narrow fix, no catalog redesign).** `definition.version = N` ⇔ the family ships an executable implementation for
every version `1..N`, no gaps. `registerQuestionTypePlugin` checks the complete family FIRST — before the per-version shape
checks and before `registerQuestionType()` or any executable registry is touched — and throws
`missing implementation for version v`. Nothing is ever filled from a neighbouring version (V1 never uses V2, V2 never uses
V3). Optional `defaults` / `validate` stay optional; `Editor` and `StudentRenderer` stay mandatory per version.

| family | current | verdict |
|---|---|---|
| `{1}` | 1 | valid |
| `{1, 2}` | 2 | valid |
| `{1, 2, 3, 4}` | 4 | valid |
| `{2}` | 2 | refused — missing 1 |
| `{1, 3}` | 3 | refused — missing 2 |
| `{1, 2, 4}` | 4 | refused — missing 3 |

**Proof** (`src/questionTypes/versionFamily.16a-rf2.test.tsx`): RF2-1 `{2}`/current 2 refused with no catalog / editor /
renderer / defaults / validator residue · RF2-2 `{1,3}`/3 and `{1,2,4}`/4 refused · RF2-3 `{1,2,3}` registers and `@1 → V1`,
`@2 → V2`, `@3 → V3` for editor, renderer, validator and defaults · RF2-4 absent stored version → V1 with current 3 ·
RF2-5 stored V4 fails closed everywhere · RF2-6 a gapped family fails before any registry mutation and a later complete
registration of the same key succeeds · finalization invariant: for every registered type and every version `1..current+1`,
`supportsQuestionTypeVersion` ⇔ (non-legacy) an authoring editor AND a student renderer exist.

**16B production invariant (documented, not implemented here).** Every auto-graded simulation version `(key, version)`
admitted into a production plugin family must have an authoritative server grader registered before it ships; 16B tests pin
this per production plugin. `.smartsim` / uploaded simulator packages obey the same historical-version preservation rule.
