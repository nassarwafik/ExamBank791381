# Phase 19G — Scenario & Source Assessment Engine

Status: implemented on `feature/19g-advanced-scenario-source-assessment` (baseline `2aa40da`). Owner review required before merge.

## 1. Problem statement

Teachers build assessments where several ordinary questions read the same material: a passage, a network topology, a data table,
a program. Before 19G the only shared material was the legacy section `stimuli` map (`title / text / image`) referenced by a
question-side `groupId`: two mutable authorities that can drift, no table or code source, no alt text, no validation of the
stored object, and the student received the stored object as a spread.

19G adds a strict **Scenario** layer: one or more shared **sources** plus several ordinary canonical questions of the **same
section**. A scenario is a composition / presentation layer. It is **not** a question type (the catalog stays at **23**), it has
no grader, no marks and no answer, and the canonical questions keep their own grading untouched.

## 2. The Scenario model (`src/scenarioSource.ts`, shared server build)

```text
section.scenarios?: ScenarioV1[]
ScenarioV1 = { id, version: 1, title?, instructions?, sources: SourceStimulusV1[], questionIds: string[] }
```

- Exact keys only; `version` is literally `1` (a future version is never read as 1).
- `id` matches `^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$` and is never `__proto__` / `constructor` / `prototype`.
- `title` ≤ 200 characters, `instructions` ≤ 4000 (a blank optional is dropped from the canonical copy).
- 1–8 sources with unique ids; 1–30 `questionIds` (strings, unique); the text payload of one scenario (titles, instructions,
  text, cells, code) ≤ 128 KB, image bytes excluded.
- Questions are **never** nested inside a scenario; a scenario references `examQuestionId` values.

### Ownership model — one authority each

| Concern | Authority |
|---|---|
| Storage | `section.scenarios[]` (section-owned; nothing on the exam root, nothing on a question) |
| Identity / version | `{ id, version: 1 }` |
| Membership | `scenario.questionIds` only — a question carries **no** scenario field |
| Order | `section.questions` order; the canonical copy sorts `questionIds` into it; members must be **contiguous** |
| Validation | `validateSourceStimulus`, `validateScenario`, `validateSectionScenarios` |
| Student projection | `projectSectionScenariosForStudent` (fail closed, never a spread) |
| Teacher projection | the same canonical copy — a scenario has no private field by contract |
| Finalization | `examQuality.validateStructuredExam` → every scenario rule is a blocking structural error |
| Import / export | `structuredExamImport` judges imported scenarios with the same contract; any violation is a fatal parse error |
| Deletion / referential integrity | `examBuilderState` / `structuredExamProductivity` / `scenarioBuilderOps` (pure operations) |

## 3. `SourceStimulusV1`

`{ id, version: 1, kind, title? }` plus the kind's own fields — exact keys only:

| Kind | Fields | Bounds | Rendering |
|---|---|---|---|
| `text` | `text` | 1–20 000 characters, ≤ 64 KB UTF-8, non-blank | `<p dir="auto">`, text only (never HTML / Markdown) |
| `image` | `alt` (required, 1–300), `image` (canonical asset) | an inline **raster** data URL (`png` / `jpeg` / `webp`, ≤ 3 MB) **or** a durable bank asset `{ id, origin: "bank", blobName, contentType? }` | `<img alt>`; bank assets get a freshly signed delivery URL at delivery (hydration), never persisted |
| `table` | `columnHeaders` (1–12), `rowHeaders?` (= rows), `rows` (1–50 × columns) | header ≤ 200, cell ≤ 500 characters, strings only | semantic `<table>` with `<caption>`, `th scope="col"`, `th scope="row"` |
| `code` | `language`, `source` | the 19F code-stimulus rules (python / java / csharp / pseudocode, ≤ 16 KB, ≤ 400 lines) | `CodeStimulusView` (LTR, focusable, text only, never executed) |

No PDF, audio, video, iframe, arbitrary HTML, remote embeds or executable content exist in V1. The image source reuses the
canonical ExamBank asset shape and the existing hydration / normalization pipeline (`bank-asset-hydrate` walks
`sections[].scenarios[].sources[].image`); there is no second image system. SVG is not accepted for scenario images.

## 4. Scenario vs Compound (pinned)

| | Compound | Scenario |
|---|---|---|
| What it is | ONE canonical question with subparts | MULTIPLE independent canonical questions sharing sources |
| Grading | compound answer / part marks semantics | none — each question's own engine |
| Catalog | a type (`compound`) | not a type |
| Answer | `{ kind: "compound", parts }` | none |

A scenario never routes through compound logic, never nests questions and is never a compound part.

## 5. Same-section rule and membership

Every referenced question must exist in **this** section (an id known elsewhere in the exam is reported as
`SCENARIO_QUESTION_CROSS_SECTION`, otherwise `SCENARIO_QUESTION_MISSING` — both withhold), belong to at most one scenario of the
section (`SCENARIO_QUESTION_SHARED`), and the members must be contiguous (`SCENARIO_NOT_CONTIGUOUS`; the builder offers
«تجميع أسئلة السيناريو»). Cross-assessment references are impossible: ids resolve inside the section only, and the exam copy
regenerates scenario / source ids and remaps membership to the fresh question ids.

Builder semantics: delete scenario → questions remain, standalone; unlink → question intact; delete / move away a linked
question → its reference is dropped; duplicate a member → the copy is never a member and lands after the group; type change →
membership untouched (it is not on the question); link → the question moves next to the group (presentation order only).
No operation changes marks, answers, type, version, hidden tests, parametric seed, geometry, rubric or simulator package.

## 6. Student sanitizer (security authority)

`api/src/lib/student-exam-sanitize.js` rebuilds `section.scenarios` through `projectSectionScenariosForStudent`: canonical copies of
the scenarios that pass every rule; a scenario failing any rule (a source smuggling `answer`, `modelAnswer`, `hiddenTests`,
`geometry`, `callbackKey`, …, a future version, an unknown kind, a missing / shared / cross-section reference, a missing alt) is
withheld whole. The stored object is never spread. The same function serves the server finalization gate, the import parser and the
teacher review, so one rule set decides everywhere.

The **legacy** `section.stimuli[groupId]` and the per-question `stimulus` fallback are now rebuilt through the allow-list the renderer
reads (`title`, `text`, `image.dataUrl`, `activity`); anything else stored next to a passage no longer reaches the student. Nothing
else about the legacy model changed: no auto-upgrade, `STIMULUS_MISSING` stays a warning, published exams are not rewritten.

## 7. Teacher projection and review

`GET /api/assignment-review` adds `scenarios` (the same canonical copies, once per scenario with its `sectionId`, hydrated so a
bank image has a signed delivery URL) and a per-question `scenarioId`. The review UI shows the scenario context (title,
instructions, sources) above a linked response and tags the question head «ضمن سيناريو». No server-only field (grading keys, job
ids, HMAC keys) can ride along: the review emits the exact-key projection only.

## 8. Grading equivalence, coding, parametric, visual, openResponse

- **Grading**: `grade(Q, A)` is identical with and without membership for every engine (pinned through the real `gradeExam` for
  multipleChoice, multipleSelect, numericResponse, inlineCloze, parametricNumeric, hotspot, labelDiagram, openResponse, networkCli
  and coding's provisional grade; rubric scoring through `scoreOpenResponseRubric`). A scenario contributes zero marks and has no
  grader; first-N / capScore stay per canonical unit (a scenario is never atomic for scoring).
- **Coding**: `questionFingerprint`, `gradingKey`, `answerHash` and the Runner job are byte-identical for coding@1 / @2 / @3 with
  and without a scenario (including a code source); a code source linked to non-coding questions plans **zero** Runner jobs
  (the dispatch gate is the canonical `coding` type with hidden tests). No file under `runner/` changed.
- **Parametric**: the official instance (text, values, digest) and the student projection are identical with and without
  membership; the seed derives from the server identity and the section-scoped question key only.
- **Visual**: a scenario image source is presentation material; hotspot / labelDiagram geometry and mappings stay on the question's
  canonical image and private key; a source carrying `geometry` / `mapping` is refused.
- **openResponse**: student secrecy preserved (private rubric guidance / model answer never in a source; the question projection is
  unchanged); the teacher grades in context through the review projection.

## 9. AI trust boundaries (`src/aiScenarioDraft.ts`, `POST /api/ai-scenario-author`)

The AI may propose a title, instructions, public text / table / display-only code sources and ordinary question drafts. It may
**not** propose image sources (no asset authority), hidden tests, reference solutions, Runner payloads, simulator packages, visual
geometry, label mappings, private rubric internals or scores. Every question goes through the 19A single-question layer
(`normalizeAiQuestionDraft`, all its refusals inherited), every source through `validateSourceStimulus`, and the assembled section
through `validateStructuredExam`. One refused question or source refuses the whole scenario (all or nothing). The Builder dialog
re-verifies the server result with the same shared code (`verifyAiScenarioDraft`) before offering it and inserts it as one update
with fresh ids. There is no AI grading path.

## 10. Import / export

Export is the saved exam JSON (`toSavedStructuredExam`); import (`parseStructuredExamJson`) judges `section.scenarios` with the
contract after ids are normalized: unsupported versions, unknown kinds, duplicate ids, duplicate membership, missing or
cross-section references, malformed sources and private fields are fatal parse errors (the file cannot open; nothing is repaired or
silently dropped). A round trip yields the same canonical semantics; `stats.scenarios` counts them.

## 11. Accessibility and UX

- Student: a scenario is a labelled region (`<section aria-labelledby>` with an `h3`), instructions, then a native `<details>`
  («المصادر المشتركة (N)») that is **open on the first linked question's page and on wide screens, collapsed on later pages** — the
  student revisits the sources without scrolling back. Each source is a `<figure>` with a caption; tables are semantic; images carry
  the authored alt; code is LTR and focusable; text is never HTML. On ≥ 1024 px the paged runtime lays the sources beside the
  question (two-column grid, sticky sources). Each linked question keeps its own card, id and answer state.
- Teacher: the scenario card lives inside the section (badge «سيناريو», collapsible, reorder / delete), typed source editors (no raw
  JSON), «ربط سؤال موجود», «+ سؤال جديد داخل السيناريو» through the one palette, «فك الربط», reorder, regroup, confirmed delete that
  keeps the questions, inline validator messages, and a «ضمن سيناريو» chip on the question card. 44 px controls on phones.
- Review: the context is a `<details open>` region with an `h4` above the response.

## 12. Bundle and lazy loading

The initial JS graph is **119.1 KB gzip** (budget 125, unchanged). `scenarioSource.ts` is runtime-imported only by lazy chunks
(`examQuality` → builder chunk; `ScenarioView`; `ScenarioBlockEditor`; `aiScenarioDraft`); initial-graph modules reference it with
`import type` only, and `examBuilderState` inlines its three tiny integrity touch points. Chunks: `ScenarioBlockEditor` (4.1 KB
gzip + CSS), `ScenarioView` (1.2 KB + CSS), `scenarioSource` (3.9 KB), the AI dialog — all behind dynamic edges. Monaco / coding
remain lazy; a code source renders through `CodeStimulusView`, never Monaco.

## 13. Legacy stimulus relationship, versioning, migration

- Legacy `stimuli` / `groupId` stay as they are (authoring, rendering, warning). A question may carry both a `groupId` and a scenario
  membership; the scenario block renders first. Nothing is upgraded automatically; a teacher recreates a scenario explicitly.
- `scenarios` is absent on every existing exam, preset extraction refuses it (`FORBIDDEN_FIELD`), the Live Challenge source
  import flattens questions and drops scenario context (documented).
- Published snapshots are immutable and never rewritten; an unknown scenario or source version fails closed everywhere.
- Future V2 (documented only): PDF / audio / video sources, external references, per-source visibility, cross-section scenarios.

## 14. Tests, fail-first and mutations

| Suite | Scope |
|---|---|
| `src/scenarioSource.19g.test.ts` | contract (sources, scenarios, membership, projection, smuggled-field matrix, finalization gate, preview) |
| `src/scenarioBuilderOps.19g.test.ts` | CRUD, link / unlink / reorder / regroup, referential integrity of the existing operations, exam copy, import / export, presets |
| `api/tests/scenario-19g.test.js` | sanitizer, legacy stimulus allow-list, real delivery / snapshot / review / finalization, hydration, grading / fingerprint / Runner / seed / first-N equivalence pins |
| `src/scenario/scenario.19g.test.tsx` | builder UX, student long form and paged runtime, review context, AI dialog |
| `src/aiScenarioDraft.19g.test.ts`, `api/tests/ai-scenario-author-19g.test.js` | AI layer and endpoint |

Fail-first evidence was recorded on `2aa40da`; the mutation table is in the PR body.

## 15. Known limitations

- Moving a question with the card's ↑/↓ across a scenario group breaks contiguity; finalization reports it and «تجميع» repairs it.
- Scenario images accept raster uploads and bank assets only (no SVG).
- Import treats any scenario violation as fatal (the file cannot open) rather than opening a repairable draft.
- The pre-start student payload (`student-assignment.js preStartAssignment`) forwards `metadata` / `coverPage` without the
  sanitizer — pre-existing, outside this phase, reported to the owner.
