# Phase 13C-A — Domain-Neutral Blueprint & Interactive Assessment Foundation

Baseline: `53ad49038adbe9d2bc89159dd83f368e6b8db425` (merge of PR #222 / Phase 13B). Branch:
`feature/13c-a-domain-neutral-blueprint-foundation`. Audit commit `0c3ecb8` (docs only) precedes the implementation.

Scope of 13C-A: the **canonical, versioned, domain-neutral assessment blueprint**, optional **question classification**
(`assessmentMeta`), a **pure assessment profile** (fact extraction, no scores), the **Blueprint UI** ("مخطط الامتحان"),
and the **interactive assessment context foundation** (data descriptor → trusted, code-owned renderer host). No quality
gates, no scores, no new question type, no grading change, no data migration.

## 1. Baseline gate

| Check | Result |
|---|---|
| `origin/main` | `53ad49038adbe9d2bc89159dd83f368e6b8db425` (verified with `git fetch` before the audit and before the push) |
| Working tree | clean; no merge / rebase / cherry-pick / bisect in progress |
| Phase 13B | merged into main (PR #222: `9cb6c2e`, `816f1f8`, `e59121e`, `ae6c5bc`) |
| Branch | one branch from the baseline SHA; auto-merge OFF; nothing merged |

## 2. Audit — where the current builder is domain-specific (networking / 791381)

| Area | Evidence | Domain coupling | Source of truth today | 13C-A action |
|---|---|---|---|---|
| Bank taxonomy | `src/bank/bankQuestionModel.ts` `SECTIONS = ["BASIC","INFRASTRUCTURE"]`; `api/src/lib/section-resolver.js` `VALID_SECTIONS`; `exam-question-selection.filterEligibleCandidates` | HIGH — the two 791381 exam parts are baked into the bank index schema, the picker filters and generation eligibility | `api/config/topic-section-map.json`, code constants | untouched (bank / import / generation are 13C-B+ concerns); bank topic ids are consumed only as **evidence** through an exact-id bridge |
| Topic taxonomy | `api/config/topics.json` (`791381-topics-v1`: NUMBER_SYSTEMS, NETWORK_BASICS, OSI_TCPIP, IP_ADDRESSING, SUBNET_CIDR, …) consumed by `interpret-exam-request`, `classify-*`, `generate-exam`, `bank-questions` | HIGH but config-driven (one JSON, one loader) | `api/config/topics.json` | untouched; a blueprint that reuses those ids (as data) maps bank questions exactly; a blueprint with other ids maps nothing |
| Difficulty rubric | `api/config/difficulty-rubric.json` (`791381-OpenMaterial-v2`) | HIGH (subject-specific prose) | config JSON | untouched; the blueprint carries its own `difficultyScale` (default 1..5) |
| Official-source detection | `bank-question-exam.isOfficialLikeSource` (`/^791381-20\d{2}/`, `/^791367-20\d{2}/`) | HIGH — exam codes in code | code | untouched (bank provenance, not planning) |
| Section presets | `examBuilderState.SECTION_PRESETS` (`core-2026`, `infra-2026`, `infra-2025`) | MEDIUM — data already | code constant | untouched |
| Instruction templates | `src/instructionTemplates.ts` (`execute`) | LOW | code constant | untouched |
| Question types | `BuilderQuestionType` includes `cliFill` | MEDIUM — one networking-flavoured type | `examTypes.ts` + grader + renderer | untouched; **no new type added** (see decision 3) |
| Exam metadata | `App.ExamMetadata.subject` (free text); `learning-materials-registry` `courseId "791381"` | MEDIUM | free text | the blueprint adds a **structured** subject / curriculum / course / level identity (optional, additive) |
| Auth / storage | `builder-auth` context string `ExamBank791381:teacher-session:v2` | none functionally | — | untouched |

## 3. Audit — the generic engine that stays the single source of truth

| Concern | Existing authority | How 13C-A uses it | Not duplicated |
|---|---|---|---|
| Exam / question shape | `src/examTypes.ts` | four additive optional fields: `StructuredExam.blueprint`, `BuilderQuestion.assessmentMeta / activity`, `BuilderPart.assessmentMeta / activity`, `Stimulus.activity` | no second exam schema |
| Official marks | TS `questionMaxMarks` / `computeTotalMarks` (`examBuilderState.ts`) ⇄ server `exam-structure.js` (`questionMaxMarks`, `sectionOfficialMaxMarks`, `examOfficialStats`, `distributePartMarks`) | `sectionMaxMarks` extracted from `computeTotalMarks` (same arithmetic, now reusable); the profile calls only these helpers; parity is tested against the server module | no marks arithmetic in 13C-A code |
| Quality | `src/examQuality.ts` (`validateStructuredExam`) | untouched; the blueprint validator is a **separate pure module** with its own structured issue codes — it validates the *plan*, not the exam | no quality gate, no score (13C-C) |
| History / editing authority | 13A `useStructuredExamHistory.update(updater)`; 13B `onChange(updater)` | every blueprint / classification / activity edit is ONE functional updater (`withBlueprint`, `onChange({assessmentMeta})`, `onChange({activity})`, `patch(stimulusId, {activity})`) | no shadow state |
| Autosave / recovery | 13A `writeExamBackup` / `readExamBackup` | the blueprint is part of the exam object → autosaved and recovered with no new code | no second backup |
| Persistence | `toSavedStructuredExam` (client) + `save-exam-artifact.cleanExam` (server) | both are spread-based (`{...exam}`); new fields survive unchanged; tested with the REAL `cleanExam` | no new storage / document |
| Answer secrecy | `api/src/lib/student-exam-sanitize.js` | extended in place: planning keys, activity allowlist, config secret stripping, exam-level `blueprint` removal | ONE sanitizer |
| Trusted interactive content | `src/learning/activities/engine.ts` (`createActivityRegistry`, `RegisteredActivity`), `LearningActivityHost` (lazy load, `LearningActivityBoundary`, `ActivityFallback`, fullscreen, reset/replay, reduced motion) | the assessment host IS `LearningActivityHost` with a different registry and built-ins disabled (one additive prop `builtins`) | no second host / boundary / fallback |
| Generation plan | `App.ExamPlan` (`interpret-exam-request` → `generate-exam`) | **projection seam** (§6), generator untouched | no second plan model |
| HTML safety | no `dangerouslySetInnerHTML` in `src` | kept; guard tests pin it for the new modules | — |

## 4. Architecture decisions (final)

1. **Subject identity and taxonomy are DATA.** `AssessmentBlueprintV1.subject / curriculum / course / level` are
   `{ id, label }` values; topics / objectives / cognitive levels / difficulty scale are arrays and objects inside the
   blueprint. There is **no domain-profile framework**, no subject enum, no code branch per subject, no migration of the
   791381 configuration (guard test: the engine source contains no subject-specific branch). `emptyBlueprint()` has NO
   default subject (`{ id: "", label: "" }`); the validator reports `MISSING_SUBJECT_ID / MISSING_SUBJECT_LABEL` instead
   of inventing one. An OPTIONAL context identity (`curriculum` / `course` / `level`), once present, must be complete
   (`MISSING_CONTEXT_ID` / `MISSING_CONTEXT_LABEL`): the stable id is the identity, the label is display text, and
   renaming a label never changes or re-slugs the id (Review Fix 1 / R1).
2. **Blueprint = canonical contract; `ExamPlan` = legacy generator adapter.** `AssessmentBlueprintV1` is the canonical,
   versioned planning contract stored on the exam (`exam.blueprint`). The legacy `App.ExamPlan` is NOT renamed, removed
   or wrapped; an explicit projection seam (`legacyPlanToBlueprint`, `blueprintToLegacyPlanTargets`) documents the
   relation (§6). The generator (`interpret-exam-request`, `generate-exam`, `exam-question-selection`) is unchanged.
3. **Interactive activity / simulation = student-visible interactive CONTEXT only** (correction of the audit draft, which
   proposed a graded "simulation" question type). In 13C-A an activity is a **data descriptor** attached to a question or
   to a shared stimulus and rendered by a trusted host next to an ordinary question. It never sets, submits, grades or
   alters a response or marks: `BuilderQuestionType` is unchanged, `gradeQuestion` has no new response kind, the event
   sink of the host stays the no-op default, and a test (M15) proves that interacting with a live activity never reaches
   `onChoice / onText / onSeq / onTable / onField / onPart`. A graded simulation is a future phase (§17).
4. **Trust is code-owned.** Only identities enumerated in `ASSESSMENT_SAFE_ACTIVITIES` (repo code) render live inside
   an exam. Production ships **zero** approved renderers (acceptable per spec); learning renderers and learning built-ins
   (`guided/reveal`, …) are NOT exam-safe; a stored `assessmentSafe` / `trusted` / `approved` flag has zero authority
   and is reported as `TRUST_CLAIM_IGNORED`.
5. **Every builder mutation goes through the 13A history authority**; every new field is additive and optional; every
   student delivery goes through the ONE sanitizer.

## 5. Canonical contract — `AssessmentBlueprintV1` (`src/assessmentTypes.ts`)

```
schemaVersion: 1
subject: { id, label }                       // required identity (validated, never defaulted)
curriculum? / course? / level?: { id, label }
topics: [{ id, label, parentId?, order?, description? }]      // stable ids, hierarchy by parentId
objectives: [{ id, label, topicId?, order?, description? }]
targets?: { totalQuestions?, totalMarks? }
constraints: [{ id, dimension, ref, metric, unit, min?, target?, max?, tolerance? }]
  dimension ∈ topic | objective | difficulty | cognitiveLevel | questionType | capability | section
  metric    ∈ count | marks        unit ∈ absolute | percent
cognitiveLevels?: [{ id, label, order? }]   // default: Bloom (remember … create), overridable per blueprint
difficultyScale?: { min, max, labels? }     // default: 1..5
notes?
```

Validation (`validateBlueprint`, pure, `src/assessmentBlueprint.ts`) returns `BlueprintIssue[]` `{ code, severity,
message, path?, ref? }`; nothing is repaired. Codes: `UNSUPPORTED_SCHEMA_VERSION`, `MISSING_SUBJECT_ID`,
`MISSING_SUBJECT_LABEL`, `INVALID_IDENTITY`, `MISSING_CONTEXT_ID`, `MISSING_CONTEXT_LABEL`, `INVALID_TOPICS`, `INVALID_TOPIC_ID`, `DUPLICATE_TOPIC_ID`,
`MISSING_TOPIC_LABEL`, `BROKEN_PARENT_REF`, `TOPIC_CYCLE`, `INVALID_OBJECTIVES`, `INVALID_OBJECTIVE_ID`,
`DUPLICATE_OBJECTIVE_ID`, `MISSING_OBJECTIVE_LABEL`, `BROKEN_OBJECTIVE_TOPIC_REF`, `INVALID_TARGET`,
`INVALID_DIFFICULTY_SCALE`, `INVALID_COGNITIVE_LEVELS`, `INVALID_CONSTRAINTS`, `INVALID_CONSTRAINT_ID`,
`DUPLICATE_CONSTRAINT_ID`, `INVALID_DIMENSION`, `INVALID_METRIC`, `INVALID_UNIT`, `MISSING_REF`, `BROKEN_TOPIC_REF`,
`BROKEN_OBJECTIVE_REF`, `INVALID_DIFFICULTY`, `BROKEN_COGNITIVE_REF`, `INVALID_QUESTION_TYPE`, `BROKEN_SECTION_REF`, `INVALID_LIMIT`,
`NEGATIVE_LIMIT`, `PERCENT_OUT_OF_RANGE`, `CONTRADICTORY_LIMITS`, `EMPTY_CONSTRAINT`, `DUPLICATE_EQUIVALENT_CONSTRAINT`.
A partial blueprint (subject only, or constraints covering only part of a dimension) is valid: 13C-A never demands a
complete distribution and never emits a coverage score.

**Context-aware validation (Review Fix 1 / R4).** The blueprint stays pure and carries no exam state; the validator takes
an optional context: `validateBlueprint(bp, { sectionIds })`, and `validateBlueprintForExam(bp, exam)` supplies the
live exam's section ids. With context, a `section` constraint must reference an existing stable section id
(`BROKEN_SECTION_REF` when the section was deleted or never existed; renaming or reordering a section keeps the id and
therefore the constraint). Without context (templates, fixtures, question-free planning) section refs are not judged.
The Structured Exam Builder uses the context-aware form for both the toolbar badge and the panel's issue list.

Pure editing helpers (all return new objects): `addTopic / updateTopic / renameTopic / setTopicParent / removeTopic`
(**removal removes only the topic**: children keep their `parentId`, objectives keep their `topicId`, constraints keep
their `ref`, and the validator reports them as `BROKEN_PARENT_REF` / `BROKEN_OBJECTIVE_TOPIC_REF` / `BROKEN_TOPIC_REF` —
academic meaning is never silently rewritten; F1),
`addObjective / updateObjective / removeObjective`, `upsertConstraint / updateConstraint / removeConstraint`,
`setSubject / setContextIdentity / setTargets`, `orderedTopics` (depth-first with depth), `withBlueprint(exam, fn)` (the
single updater shape the builder dispatches).

## 6. Relation to the legacy generator `ExamPlan` (projection seam)

| | `App.ExamPlan` (legacy) | `AssessmentBlueprintV1` (canonical) |
|---|---|---|
| Role | output of `interpret-exam-request`, input of `generate-exam` | teacher planning contract stored on the exam |
| Topics | flat bank topic codes (`topicTargets[{topic,count}]`, `excludedTopics`) | hierarchical topics with stable ids (any subject) |
| Difficulty | `difficultyTargets` keyed by 1..5 | `constraints` on dimension `difficulty` against the blueprint's scale |
| Types | `typeTargets` (`open` …) | `constraints` on `questionType` (`shortAnswer` …) |
| Marks | `totalMarks` | `targets.totalMarks` + `marks` metric constraints |
| Owner | generator (unchanged) | builder / blueprint UI |

Adapters (`src/assessmentBlueprint.ts`): `legacyPlanToBlueprint(plan, subject, { topicLabels?, sectionLabels? })`
produces a valid canonical blueprint (constraint ids `c-topic-<id>`, `c-difficulty-<k>`, `c-type-<t>`, `c-section-<k>`;
`open → shortAnswer`; the subject is supplied by the caller, never defaulted). `blueprintToLegacyPlanTargets(bp)` projects
absolute count targets back (`shortAnswer → open`). Neither adapter is wired into the generator in 13C-A: the seam exists
so 13C-B can drive bank selection from the blueprint without a second plan model.

## 7. Taxonomy identity and hierarchy

Identity is the `id`; labels are display text. Renaming keeps parent links, objective links, constraint refs and question
mappings (tested). Hierarchy is `parentId`-based, any depth (fixtures use three levels: Algorithms → Sorting → Merge Sort;
Mechanics → Motion → Projectile). Duplicate ids, missing labels, broken parents and cycles are structured issues.

## 8. Question classification — `assessmentMeta` (optional, additive)

`{ primaryTopicId?, secondaryTopicIds?, objectiveIds?, difficulty?, cognitiveLevel?, capabilities? }` on a question or a
part. Absent on every existing question (still valid). Edited through `QuestionClassificationEditor` (fieldset
"التصنيف التعليمي": primary topic, secondary topic chips, objective chips, difficulty, cognitive level); each change is
one `onChange({ assessmentMeta })` updater → one history entry; empty fields are removed (`undefined`), never stored as
`""`. Duplicate / bulk duplicate / move / bulk move / bulk marks / `legacyToStructured` / `updateQuestion` keep it.

## 9. Bank compatibility — `effectiveAssessmentMeta(question, blueprint)`

Explicit `assessmentMeta` is authoritative. Otherwise bank fields are **evidence**: `topic` / `secondaryTopics` map to a
blueprint topic **only on exact id equality** (`source.primaryTopic = "bank"`), anything else is listed in
`unmappedBankTopics` (never guessed, never fuzzy-matched); `difficulty` (integer or numeric string) becomes evidence
(`source.difficulty = "bank"`); `hasCLI → "cli"`, `requiresCalculation → "calculation"` capabilities. The bank provenance
fields themselves (`origin`, `bankQuestionId`, `sourceId`, `topic`, image identity) are never modified. The classification
UI shows the evidence line ("موضوع البنك: … — غير مربوط بالمخطط (لا يُربط تلقائيًا)").

## 10. Official marks parity

The profile uses `questionMaxMarks` (compound → grader part-mark distribution, never top-level `q.marks`),
`sectionMaxMarks` (the grader's rule: `all` never capped; capScore / firstNAnswered use `section.maxMarks` when present)
and `computeTotalMarks`. Tests assert equality with the server's `examOfficialStats` / `sectionOfficialMaxMarks` for
mixed exams (all / capScore / firstNAnswered, compound with uneven parts). Grading behaviour is untouched.

## 11. Mark semantics and attribution policy (Review Fix 1 / R2 — the contract 13C-B constraints consume)

A capped section (capScore / firstNAnswered with `maxMarks`) makes "marks" ambiguous: the questions' authored marks may
sum to 10 while the section is officially worth 6. The profile therefore never exposes a bare `marks`; every tally is
`{ count, weightMarks, officialMarks }` and the two units are defined as:

| Unit | Definition | Sums to | Denominator for |
|---|---|---|---|
| `weightMarks` | authored question weight = `questionMaxMarks(q)` (compound: grader part-mark distribution) | `totalWeightMarks` | share of authored weight |
| `officialMarks` | cap-aware attributable official marks = `weight × sectionOfficial / Σ section weights` (`officialQuestionMarks`) | `totalOfficialMarks − unattributedOfficialMarks` | share of the official total |

`sectionOfficial` is `sectionMaxMarks(section)`; `bySection[id] = { count, weightMarks: Σ weights, officialMarks:
sectionOfficial, officialFactor: sectionOfficial / Σ weights }`. For an `all` section the factor is 1 and
`officialMarks === weightMarks` exactly. For capScore / firstNAnswered the proportional rule is the unique deterministic,
**answer-independent** attribution that sums to the section's official max (firstNAnswered's answer-dependent counting is
deliberately not modelled: this is structural planning analysis, not student analytics). A capped section whose questions
carry zero weight contributes its official max to `unattributedOfficialMarks` (counted in `totalOfficialMarks`, attributable
to nothing).

Invariants (asserted by `assessmentBlueprint.reviewfix1.test.ts`):
- `totalOfficialMarks = computeTotalMarks(exam) = examOfficialStats(exam).totalMarks = Σ bySection.officialMarks`;
- `totalWeightMarks = Σ bySection.weightMarks = Σ byTopic.weightMarks + unclassified.weightMarks = Σ byType.weightMarks = …`;
- for every exclusive dimension (topic + unclassified, difficulty, type, cognitive level):
  `Σ officialMarks + unattributedOfficialMarks = totalOfficialMarks`;
- objectives and capabilities may overlap intentionally (a question counts once per listed objective / capability), so
  their sums are not bounded by the totals.

Attribution: the **primary topic is exclusive** (a 10-mark question with two secondary topics contributes once; questions
without a primary topic go to `unclassified` and `unclassifiedQuestions`). 13C-B `marks` constraints in `percent` use
`officialMarks / totalOfficialMarks`; `absolute` constraints compare `officialMarks`. Output: `totalQuestions`,
`totalWeightMarks`, `totalOfficialMarks`, `unattributedOfficialMarks`, `byTopic`, `byObjective`, `byDifficulty`
(`"unspecified"` bucket), `byType`, `byCognitiveLevel`, `byCapability`, `bySection`, `unclassified`, `unmappedQuestions`,
`unclassifiedQuestions`. Pure, single pass, no deep clone, inputs never mutated. **No gates, no scores, no warnings** —
that is 13C-C.

## 12. Blueprint UI — "مخطط الامتحان"

`src/BlueprintPanel.tsx` (lazy chunk) opened from the builder toolbar button "📐 مخطط الامتحان" (badge = issue count).
RTL dialog with labelled inputs (subject id / label; curriculum / course / level each as an explicit stable **id + label**
pair — renaming the label keeps the id, clearing both removes the identity, a partial identity is reported as
`MISSING_CONTEXT_ID` / `MISSING_CONTEXT_LABEL`; target totals), topic list (add, rename,
add child, re-parent, remove; depth shown), objectives (add, label, topic link, remove), constraints (dimension, ref,
metric, unit, min / target / max), live issue list (`aria-label="مشكلات المخطط"`, `data-code`). Every edit is
`onEdit(fn)` → `update(prev => withBlueprint(prev, fn))` → ONE history entry; opening / closing the panel changes nothing;
an exam without a blueprint opens normally and stays not-dirty until the first edit. Keyboard: native controls, dialog
focus management from the existing `Dialog`. Undo / redo, autosave and recovery need no new code.

## 13. Persistence / round trip

`toSavedStructuredExam` → server `cleanExam` → JSON keeps `blueprint`, `assessmentMeta` (question + part), question
`activity` and stimulus `activity`; no top-level `questions[]` is emitted. `examDeepEqual`, `openExamHistory`,
`writeExamBackup / readExamBackup` handle them as ordinary exam data. Legacy exams without any planning data are
unchanged (byte-identical sanitizer output shape; not dirty on open).

## 14. Sanitizer (teacher-only data) — `api/src/lib/student-exam-sanitize.js`

- exam level: `blueprint` deleted;
- question / part level: `PLANNING_KEYS = ["assessmentMeta"]` stripped alongside the existing secret keys;
- activity (question / part / stimulus): rebuilt from the allowlist `id, kind, key, version, title, description, config,
  placement` (executable / trust-claim fields never copied); `config` recursively stripped (objects and arrays, any
  depth) of every key the **canonical secret-key policy** rejects (Review Fix 1 / R3): keys are compared in canonical
  form (lower-case, `_`/`-`/space/`.` removed) against the families answer, correct, solution, hint, teacher, scoring,
  grading, secret, rationale, explanation, aiInstruction, expected, rubric, markScheme, apiKey, token, password,
  credential, plus the exact canonical keys `key`, `history`, `redoStack` — so `correct_answer`, `CorrectAnswer`,
  `teacherAnswer`, `answer_key`, `ExpectedAnswer` are all rejected. The policy lives in
  `api/src/lib/secret-key-policy.js` (server) and `src/secretKeyPolicy.ts` (frontend validator); the two runtimes
  cannot share a module, so `src/secretKeyPolicy.parity.test.ts` pins identical families, normalization and verdicts;
- all existing rules (answer keys, option flags, `field.correct`, `hint`, part answers, hidden media, 13B re-signing
  order hydrate → sanitize) are unchanged and re-tested.

## 15. Interactive assessment context — descriptor

`AssessmentActivityDescriptor = { id, kind: simulation | animation | interactive-diagram, key, version, title?,
description?, config?, placement?: before | after }`. `validateActivityDescriptor` (pure) codes: `MALFORMED`,
`MISSING_ID`, `INVALID_KIND`, `MISSING_KEY`, `INVALID_KEY`, `INVALID_VERSION`, `INVALID_TEXT`, `INVALID_PLACEMENT`,
`INVALID_CONFIG` (must be JSON data), `SECRET_IN_CONFIG`, `EXECUTABLE_FIELD` (component / module / load / loader /
render / renderer / import / src / srcdoc / html / script / code / eval / path / url / handler / onLoad / onRender),
`TRUST_CLAIM_IGNORED`. `normalizeActivityDescriptor` returns the allowlisted fields or `null`.

`SECRET_IN_CONFIG` uses the canonical secret-key policy (§14) — spelling, case and separator variants of a secret family
are rejected at any nesting depth.

Scopes: **question-level** (`BuilderQuestion.activity`, rendered with its question) and **shared-stimulus**
(`Stimulus.activity`, rendered once with the stimulus for the group). `placement` is honored (F2): the default / `"before"`
renders the context before the question body (or before the stimulus content); `"after"` renders it after; the surface
exposes `data-activity-placement` for tests. Parts may carry a descriptor (`BuilderPart.activity`)
for future use; the student renderer of 13C-A renders question and stimulus scopes.

## 16. Trust policy and rendering

`ASSESSMENT_SAFE_ACTIVITIES: readonly RegisteredActivity[] = []` (literal list in `src/assessmentActivity.ts`) →
`assessmentActivityRegistry`. `isAssessmentSafe(descriptor, registry)` is the only trust decision. The student surface
`AssessmentActivityContext` (`src/AssessmentActivityContext.tsx`) normalizes the descriptor and lazy-loads
`AssessmentActivityHost` through a literal `import("./AssessmentActivityHost")`; the host is `LearningActivityHost` with
the assessment registry and `builtins={emptyActivityRegistry}` (learning built-ins never consulted). Unknown key,
unsupported version, malformed descriptor, unapproved renderer or a renderer exception → static fallback (`ActivityFallback`
/ "نشاط تفاعلي غير متاح — عرض بديل ثابت"), the question stays answerable. No `eval`, `new Function`, content-driven
`import()`, `innerHTML`, `srcdoc` or iframe (guard tests). Exams without activities never fetch the host chunk.

Context-only semantics: the host's event sink is the no-op default; activities have no access to answers, marks or
grading, and no persistence / network / PII (inherited from the learning engine contract).

## 17. Future seams (not implemented)

- **Graded simulation (future phase):** would add ONE `BuilderQuestionType` member, ONE composer body, ONE
  `StudentQuestionCard` branch, ONE `gradeQuestion` response kind and ONE sanitizer rule — exactly how `cliFill` /
  `multiTrueFalse` were added. The descriptor / registry / host of 13C-A are reusable as the rendering half.
- **Sandboxed runner (future):** if third-party renderers are ever allowed, they would run behind an iframe / CSP boundary;
  13C-A deliberately requires no CSP (hosting config unchanged) because only repo code renders.

## 18. Backward compatibility

No field is required; no existing document changes shape; `SECTION_PRESETS`, `topics.json`, bank schema, generator,
grader, student renderer for existing types and quality rules are untouched. The `LearningActivityHost` prop `builtins`
defaults to the existing built-in registry, so learning pages behave exactly as before.

## 19. Five subject fixtures (`src/assessmentBlueprintFixtures.ts`)

| Subject | Identity data | Taxonomy shape | Vocabulary |
|---|---|---|---|
| Networking | `networking` / curriculum `il-vocational` / course `791381` / level `grade-12` | NETWORK_BASICS ▸ OSI_TCPIP; IP_ADDRESSING ▸ SUBNET_CIDR (bank ids reused as data) | Bloom, 1..5 |
| Computer Science | `computer-science` | Algorithms ▸ Sorting ▸ Merge Sort; Data Structures ▸ Trees | Bloom, 1..5 |
| Mathematics | `mathematics` / level `grade-10` | الجبر ▸ المعادلات الخطية; الهندسة ▸ المثلثات ▸ فيثاغورس | **SOLO** levels, **1..3** scale |
| Physics | `physics` | الميكانيكا ▸ الحركة ▸ المقذوفات; الأمواج | Bloom, 1..5 |
| Chemistry | `chemistry` | التفاعلات ▸ الأكسدة والاختزال / الحموض; الحسابات الكيميائية | Bloom, 1..5 |

The same model, validator, profile and UI accept all five with zero issues.

## 20. Tests (fail-first, recorded on `0c3ecb8` before implementation: 6 files failed, 18 failed / 1 passed)

| Suite | Covers |
|---|---|
| `src/assessmentBlueprint.test.ts` | F1 contract, F2 taxonomy, constraints, F4 profile + bridge, marks parity, ExamPlan seam |
| `src/assessmentActivity.test.tsx` | F6 descriptor, M12 / M13 / M16, host fallback (M14), lazy load, isolation, reduced motion, M15, scopes |
| `src/assessmentActivity.guards.test.ts` | no code execution, literal registry, lazy host, M17 |
| `src/assessmentPersistence.test.ts` | F3 round trip (real `cleanExam`), M6 / M7, moves, bank bridge, history, autosave |
| `src/StructuredExamBuilder.blueprint.test.tsx` | Blueprint UI with the real history hook: legacy safety, ONE history step per edit, undo / redo, autosave recovery, classification UI, evidence line, duplicate / move, activity authoring |
| `api/tests/student-exam-sanitize-13c-a.test.js` | F5 / M10 / M11, activity data-only delivery, hidden media + 13B re-signing, legacy byte-identity |
| `src/assessmentBlueprint.reviewfix1.test.ts` | Review Fix 1: R1 identity contract, R2 mark semantics (capScore / firstNAnswered / all / compound / invariant), R4 context validation, F1 pin |
| `src/StructuredExamBuilder.reviewfix1.test.tsx` | Review Fix 1: R1 id + label authoring in the real builder, R4 section constraint vs real sections (rename / delete / undo) |
| `src/assessmentActivity.reviewfix1.test.tsx` | Review Fix 1: R3 secret-key variants (top level, nested, arrays), F2 placement rendering |
| `api/tests/student-exam-sanitize-reviewfix1.test.js` | Review Fix 1: R3 sanitizer strips the whole variant class at any depth; safe keys intact |
| `src/secretKeyPolicy.parity.test.ts` | Review Fix 1: frontend / server secret-key policy parity |

## 21. Mutation proofs M1–M17

See the PR body for the run table. Each mutation is applied alone, the six suites run, the mutation is reverted and the
tree fingerprint is verified unchanged. Mapping: M1 default subject → F1; M2 label identity → F2 rename; M3 secondary
double count → attribution; M4 `q.marks` for compound → parity; M5 edit outside history → builder history tests; M6
`cleanExam` drops blueprint → F3; M7 clone drops `assessmentMeta` → F3 duplicate; M8 bank evidence ignored → bridge; M9
fuzzy topic guess → bridge + builder evidence; M10 blueprint delivered → F5; M11 part answer kept → F5; M12 learning
registry = exam registry → M12 test; M13 / M13b executable fields kept (normalizer / sanitizer) → M13 + F5; M14 / M14b
throw instead of fallback → M14 test; M15 activity click reaches `onChoice` → M15 test; M16 `answer` accepted in config →
M16 test; M17 eager host import → guards.

Review Fix 1 mutations: R1-M optional identity accepts an empty id → R1 tests; R2-M capped section attributes raw
question marks as official → R2 tests; R3-M (frontend) / R3-Mb (server) canonicalization removed (exact, case-sensitive
again) → R3 validator / sanitizer / parity tests; R4-M missing section ref accepted → R4 pure + builder tests.

## 22. Independent Review Fix 1 (same branch, PR #223)

| Finding | Disposition |
|---|---|
| R1 optional context identities could persist `{ id: "", label }` | complete-identity rule (`MISSING_CONTEXT_ID` / `MISSING_CONTEXT_LABEL`), explicit id + label authoring, id never re-slugged (§4, §5, §12) |
| R2 dimension marks were raw while totals were capped | `weightMarks` vs `officialMarks` with a documented, tested invariant (§11); no bare `marks` field remains |
| R3 secret filter bypassable by key spelling | canonical secret-key policy mirrored on both runtimes with a parity test (§14, §15) |
| R4 `section` constraint refs could dangle | context-aware validation seam used by the builder (§5) |
| F1 docs contradicted `removeTopic` | docs corrected to the non-repairing implementation; behaviour pinned by test (§5) |
| F2 `placement: "after"` was dead schema | honored in question and stimulus rendering with deterministic before / after tests (§15) |

## 23. Scope of 13C-B and 13C-C (not in this PR)

- **13C-B — Blueprint-driven authoring:** bank selection / generation driven from the canonical blueprint through the
  §6 seam; coverage view in the builder; classification bulk tools; first approved assessment-safe renderer(s).
- **13C-C — Quality gates:** coverage / balance scores, warnings and publish gates computed from `buildAssessmentProfile`
  against the constraints; integration with `examQuality.ts` codes.
