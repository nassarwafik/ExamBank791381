# Phase 13C-A — Domain-Neutral Blueprint & Interactive Assessment Foundation

Baseline: `53ad49038adbe9d2bc89159dd83f368e6b8db425` (merge of PR #222 / Phase 13B). Branch:
`feature/13c-a-domain-neutral-blueprint-foundation`.

Status of this document: **baseline gate + pre-implementation audit**. The detailed 13C-A specification (section list,
mutations M1–M17, exact deliverables) had not been received when this audit was written; the audit records what the
existing architecture already provides, where it is domain-specific, which source of truth each concept has, and the
architecture decisions that any 13C-A implementation must respect. Fail-first tests and implementation follow the
received specification.

## 1. Baseline gate

| Check | Result |
|---|---|
| `origin/main` | `53ad49038adbe9d2bc89159dd83f368e6b8db425` (verified with `git fetch`) |
| Working tree | clean; no merge / rebase / cherry-pick / bisect in progress |
| Phase 13B | merged into main (PR #222: `9cb6c2e`, `816f1f8`, `e59121e`, `ae6c5bc`) |
| Branch | created from the baseline SHA; no auto-merge, nothing merged |

## 2. Audit — where the current builder is domain-specific (networking / 791381)

| Area | Evidence | Domain coupling | Source of truth today |
|---|---|---|---|
| Bank taxonomy | `src/bank/bankQuestionModel.ts` `SECTIONS = ["BASIC","INFRASTRUCTURE"]`, `SECTION_LABELS`; `api/src/lib/section-resolver.js` `VALID_SECTIONS`; `exam-question-selection.filterEligibleCandidates` hard-codes `["BASIC","INFRASTRUCTURE"]` | HIGH — the two Israeli 791381 exam parts are baked into the bank index schema, the picker filters, generation eligibility and imports | `api/config/topic-section-map.json` (empirical), code constants |
| Topic taxonomy | `api/config/topics.json` (`version: "791381-topics-v1"`, codes NUMBER_SYSTEMS, NETWORK_BASICS, OSI_TCPIP, IP_ADDRESSING, SUBNET_CIDR, …) consumed by `interpret-exam-request` (schema enums), `classify-*`, `generate-exam`, `bank-questions` | HIGH but already **config-driven** (one JSON file, one loader `section-resolver.loadConfig`) | `api/config/topics.json` |
| Difficulty rubric | `api/config/difficulty-rubric.json` (`791381-OpenMaterial-v2`, student profile prose for AI classification) | HIGH (prose is subject-specific) | config JSON |
| Official-source detection | `bank-question-exam.isOfficialLikeSource` (`/^791381-20\d{2}/`, `/^791367-20\d{2}/`, examCode) | HIGH — exam codes in code | code |
| Section presets | `examBuilderState.SECTION_PRESETS` (`core-2026`, `infra-2026`, `infra-2025` with 791381 grading policies) | MEDIUM — presets are data already; only the list is networking | code constant |
| Instruction templates | `src/instructionTemplates.ts` (`execute` → "نفّذ الأوامر المطلوبة") | LOW — text templates; one CLI-flavoured entry | code constant |
| Question types | `examTypes.BuilderQuestionType` includes `cliFill` (`cli` field, CLI placeholders `CLI_EMPTY` / `CLI_PLACEHOLDER_NO_FIELD` quality rules) | MEDIUM — one networking-specific type in an otherwise generic engine | `examTypes.ts` + `assignment-grading.js` + `StudentQuestionCard.tsx` + `QuestionComposer.tsx` |
| Exam metadata | `App.ExamMetadata.subject` (free text), `learning-materials-registry` `courseId "791381"`, `subject "أنظمة محوسبة"` | MEDIUM — subject exists only as free text / the one learning course | free text |
| Learning content | `docs/learning-content-architecture.md`: Course → Module → Lesson → Page → Blocks, `courseId`-scoped, registry keys namespaced (`791381/ch1/...`) — explicitly designed course-agnostic | LOW | typed TS modules |
| Auth / storage | `builder-auth` context string `ExamBank791381:teacher-session:v2` | none functionally (a namespace) | — |

## 3. Audit — the generic engine that must remain the single source of truth

| Concern | Existing authority | Extension seam | Must NOT be duplicated |
|---|---|---|---|
| Exam / question shape | `src/examTypes.ts` (`StructuredExam`, `BuilderSection`, `BuilderQuestion`, `BuilderPart`, `QuestionBody`, `BuilderImage`) | additive optional fields; `presentationType` union | a second exam schema, a "blueprint exam" format |
| Question types | `BUILDER_QUESTION_TYPES` (order + membership) + `QUESTION_TYPE_LABELS`; composer bodies in `QuestionComposer`; student renderer `StudentQuestionCard.typeOf`; grader `assignment-grading.gradeQuestion` (response kinds `choice` / `sequence` / `table` / `text` / `fields`) | a new type = one union member + one body editor + one renderer branch + one grader branch + one quality rule + one sanitizer rule (already how `cliFill` / `multiTrueFalse` were added) | a second grading engine, a second renderer switch |
| Grading | `api/src/lib/assignment-grading.js` (`gradeExam` → sections → `gradeQuestionForSection` → `gradeQuestion`; policies `all` / `capScore` / `firstNAnswered`; answer units question / part) | new response `kind` handled inside `gradeQuestion`; parts grade through the same function | client-side grading; per-domain graders |
| Answer secrecy | `api/src/lib/student-exam-sanitize.js` (denylist + recursion; hidden media rule; import-only keys) | new secret keys → `NODE_SECRET_KEYS` / `FLAG_SECRET_KEYS`; new media → `applyStudentMediaVisibility` | a second sanitizer |
| Quality | `src/examQuality.ts` (`validateStructuredExam`, codes e.g. `MISSING_ANSWER`, `MARKS_PROBLEM`, `FIRSTN_EXCEEDS`, `CLI_EMPTY`) — code-driven, message is display only | new codes | a parallel validator |
| History / editing authority | 13A `useStructuredExamHistory` + 13B `onChange(updater)` (ONE functional updater per mutation) | every new builder mutation goes through `onChange(updater)` | shadow exam state |
| Bank | `bank/index/questions-index.json` + `bank/sources/<sourceId>.json`; `buildExamQuestion` (canonical conversion); 13B exact-select endpoint; bank asset durability (`bank-asset-hydrate`) | index entry fields (`section`, `topic`, `difficulty`, `type`) are the classification projection | a second bank / storage format / migration |
| Generation plan | `App.ExamPlan` (`totalQuestions`, `totalMarks`, `difficultyTargets`, `topicTargets`, `excludedTopics`, `typeTargets`) produced by `interpret-exam-request` (AI, schema enums from `topics.json`) and consumed by `generate-exam` (selection scoring in `exam-question-selection`) — the de-facto **blueprint** of the legacy generator | this IS the blueprint concept; a structured blueprint must be a formalization of it, not a competitor | a second plan model |
| Templates | `manage-templates` + `save-exam-artifact.buildTemplateDocument` (title / plan / totalMarks / metadata / presentationTheme — no questions) | a blueprint document is closest to a template | a second template store |
| Trusted interactive content | `src/learning/visuals/registry.ts` + `types.ts`: content carries a KEY only; renderer reached through a statically-authored allowlist; lazy per-group chunks; reduced-motion contract; `VisualErrorBoundary`; zero network / persistence / PII; guards pin the enumerated set | the exact discipline for any interactive simulation inside an exam | eval / dynamic import from content / iframes with content-controlled code |
| Games | `src/games` (`gameCatalog.ts`, domain folder), live challenge (`live-challenge-session-store`, sanitized current question) | catalog pattern for registered interactive experiences | — |
| HTML safety | no `dangerouslySetInnerHTML` anywhere in `src` (explicit comments in `RichTextRenderer`, `MessageParts`, `structuredExamHtmlParser`, `questionMedia` SVG denylist incl. `iframe`/`script`/`foreignObject`) | keep | any HTML string rendering |
| Hosting headers | `public/staticwebapp.config.json` has NO CSP / `frame-src` / `script-src`; only cache headers for `sw.js` / manifest | a CSP is a separate hardening decision, not a 13C-A prerequisite | — |

## 4. Architecture decisions for 13C-A (to be confirmed against the received specification)

1. **Domain profile is data, not code.** Introduce ONE domain/subject profile model (id, labels, section taxonomy, topic
   taxonomy, difficulty scale, allowed question types, default grading presets) with the current networking profile
   (`791381`) expressed as the first profile built from `api/config/topics.json` + `topic-section-map.json` +
   `SECTION_PRESETS`. Existing constants become the networking profile's data; no behaviour change for existing exams.
   Rejected alternative: per-subject code branches (duplicates the engine).
2. **Blueprint = formalized `ExamPlan`, stored like a template.** A blueprint is a domain-neutral, question-free
   specification (sections × {count, marks, topic/difficulty/type targets, grading policy}) that (a) validates against the
   domain profile, (b) can be materialized into a `StructuredExam` skeleton through the existing builder state helpers
   (`newSection`, `addQ`) and (c) can drive the existing bank selection (`filterEligibleCandidates` + selection scoring)
   through `onChange(updater)` — ONE history step per materialization. Rejected: a blueprint that carries questions
   (that is an exam / template), or a second generator.
3. **Interactive simulation = a registered, trusted question type, never content-supplied code.** Follow the visuals
   registry discipline exactly: content stores `{ presentationType: "simulation", simulationId, params, answer }`;
   the renderer is a statically-registered React component (lazy chunk) with a declared params schema and a declared
   student-response shape; the response is graded by the SAME `gradeQuestion` (new response `kind`, key stays secret via
   the same sanitizer); no iframe, no eval, no network, no PII, reduced-motion contract, error boundary. The first
   registered simulation must be domain-neutral (e.g. a numeric/unit slider or a diagram-labelling interaction) so the
   foundation is proven without a networking dependency.
4. **`cliFill` stays a first-class type** (it is used by real exams) but is classified under the networking profile's
   `allowedQuestionTypes`; other profiles simply do not list it. No removal, no migration.
5. **Every new builder mutation** (apply blueprint, insert simulation) goes through `onChange(updater)`; every new
   persisted field is additive; every student-facing delivery goes through `sanitizeExamForStudent` (extended by
   allowlist/denylist, not bypassed).

## 5. Open items awaiting the specification

The attached specification was not received with the request. Needed before fail-first tests can be written: the
section list of 13C-A, the definitions of mutations M1–M17, the exact deliverables (endpoints / UI / storage), the
first simulation(s) to register, and whether a CSP is in scope.
