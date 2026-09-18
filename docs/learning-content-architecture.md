# Learning Materials — Content Architecture (Phase 2)

The canonical content model behind the future interactive books. Phase 2 is **architecture only**: schema, validation,
navigation, a lazy content registry, and a skeleton manifest for book `791381`. There is **no reader UI, no PDF
rendering, no student progress, no teacher CMS, no AI, and no backend** — those are later phases.

All code lives under `src/learning/content/`. Product/catalog metadata stays in `src/learning/catalog.ts`.

## Hierarchy

```
Course → Module → Lesson → Page → Blocks
```

- **Course** — one book (e.g. `791381`). Connected to the Phase-1 catalog by `courseId`.
- **Module** — a major unit (e.g. "أساسيات الشبكات").
- **Lesson** — a group of pages inside a module.
- **Page** — the future Reader unit; an ordered list of typed blocks + a source reference.
- **Block** — the smallest content atom; a strongly-typed discriminated union (never raw HTML / `any`).

## Content format decision

**Strongly-typed TypeScript modules** are the authoring format (not JSON). Rationale: there is no CMS in Phase 2,
the repo is Vite + TypeScript, and TS gives compile-time schema guarantees, tree-shaking, and — crucially —
statically-analyzable `import()` boundaries that Vite code-splits per module. JSON would add a parse/validate step
and lose type-checking at author time with no conversion-workflow benefit today. One format only; no per-module mix.

## ID policy

Stable, human-debuggable, **position-independent** ids, scoped by prefix:

```
course :  791381
module :  791381-m01
lesson :  791381-m01-l01
page   :  791381-m01-l01-p01
block  :  <page-scoped>-bNN     (e.g. fa-b1 in fixtures)
```

Ids are authored, unique, and **never regenerated at runtime**. Ordering uses the `order` field (not array index),
with the id as a deterministic tiebreaker.

## Source traceability

Every production **Page** carries `source`:

```ts
source: { kind: "book"; sourceId: "791381"; pdfPageStart: number; pdfPageEnd?: number; printedPage?: number; sourceNote?: string }
```

We can always answer "which original PDF page produced this interactive page?". **Reading position ≠ source PDF
page**: the Reader navigates by content order (`pagePosition` → *page N of M*); `source.pdfPageStart` is traceability
only, and `printedPage` (the number printed on the paper) differs from the PDF page index again.

## Block families (union on `type`)

`text` · `heading` · `image` · `callout` · `example` · `table` · `code` · `diagram` · `practice` · `simulation` ·
`animation` · `guided` · `interactive-diagram`.

- **text** — safe inline `spans` (`strong`/`em`/`term`/`code`, optional per-span `dir`). No raw HTML.
- **callout** — `remember` · `important` · `warning` · `tip` · `summary` · `clarification` (maps to book boxes تذكّر / الخلاصة / الفكرة; `clarification` is the separable teacher note, always `origin:"teacher-enrichment"`).
- **example** — `mode: "solved" | "practice"` (default `solved`), `title?` + `prompt?` + structured `steps[]` + `result?` + `explanation?` (never one blob string). Solved = مثال محلول; practice = مثال للحل.
- **table** — `headers[]` + `rows[][]` (not an HTML string).
- **code** — `language: cli|text|config`, whitespace preserved, usually `dir:"ltr"`.
- **image / diagram** — local `src`, `alt` **required unless `decorative`**; diagram is metadata + image only (no sim behavior).
- **practice** — lightweight interactive practice with immediate-feedback readiness. Question kinds `multipleChoice` / `trueFalse` / `shortInput` / `fillBlank`, plus a `feedback` object (`hint` / `correctFeedback` / `incorrectFeedback` / `explanation`). **Not** the ExamBank exam schema, not graded, not a rank/medal input. *Extension path:* richer kinds (matching, ordering, classify, binary-entry, IP/CIDR, CLI) are added as new union members (or expressed as `simulation`) without touching existing ones.
- **simulation / animation / guided / interactive-diagram** — the four interactive **activity** families (Phase 3A
  engine). Each is a pure DATA descriptor: a trusted registry **key** (`simulationType` / `animationType` /
  `guidedType` / `interactionType` — a plain string, never a component/function/path), a required positive-integer
  `version`, a `title`, and optional `capabilities` / static `fallback` / opaque `config`. Detailed behavior is a
  later phase; the engine renders a faithful static fallback until a trusted renderer is registered (see
  *Interactive Learning Engine* below).

Every block carries a **mandatory** `origin` and an optional block-level `source` (see *Book Fidelity* below).

## RTL / LTR

The course is `direction: "rtl"`. Any block (`code`, `table`, …) or inline `span` can opt into `dir: "ltr"` for
technical content — CLI, IPv4/IPv6, MAC, CIDR, Hex, binary — without flipping the whole lesson.

## Manifest vs content bodies

- **Manifest** (`LearningCourseManifest`) — lightweight TOC: module/lesson/page **identities**, titles, order,
  `source`, keywords. **No block bodies.** Powers the table of contents, jump navigation, search indexing and lazy
  loading; the Reader can render a full TOC without loading a single page body. `deriveManifest(content)` produces it.
- **Content bodies** — the full `ContentModule` (pages + blocks), loaded on demand.

## Loading / chunk strategy

**Module-level chunking.** The main app bundle imports none of this eagerly. The registry
(`src/learning/content/registry.ts`) exposes statically-analyzable `import()` thunks Vite splits into chunks:

```ts
loadCourseManifest("791381")            // one lazy chunk: the course TOC
loadModuleContent("791381", moduleId)   // one lazy chunk per module body
hasCourseContent(id) / hasModuleContent(id, moduleId)  // pure, trigger no import
```

Registering a new book/module is a data edit in the registry — the Reader never changes. This keeps the 264-page
book (and future books `794589`, `899373`, …) out of the initial bundle. Phase 2 ships the `791381` manifest;
module **bodies** are authored during content conversion (a later phase) and each registers as its own chunk.

## Validation

`validateLearningCourseContent(content)` is **pure and deterministic**: it returns `ContentValidationIssue[]`
(never throws for normal content errors, never mutates/normalizes). Callers branch on `issue.code` (a stable enum),
never on the human message. Codes: `schema-version-mismatch`, `unknown-course`, `missing-id`, `duplicate-id`,
`missing-title`, `empty-modules`, `empty-lessons`, `empty-pages`, `page-no-blocks`, `invalid-order`,
`duplicate-order`, `missing-source`, `invalid-source-page`, `source-id-mismatch`, `missing-origin`,
`invalid-origin`, `origin-policy-violation`, `invalid-example-mode`, `unsupported-block-type`, `image-missing-alt`,
`invalid-direction`, `quiz-empty-options`, `quiz-mcq-answer-count`, `activity-missing-key`,
`activity-invalid-version`, `activity-missing-title`, `activity-invalid-capabilities`, `guided-empty-steps`,
`guided-invalid-step`, `invalid-table-row`.

Activity descriptors (Phase 3A) are validated centrally as pure data: `activity-missing-key` (empty registry key),
`activity-invalid-version` (missing / non-positive-integer `version`), `activity-missing-title`,
`activity-invalid-capabilities` (capabilities must be an object of optional **boolean** flags — `fullscreen: "yes"`,
an unknown key, an array or `null` are rejected), a fallback image with no `alt` reuses `image-missing-alt`, and a
`guided` block needs a non-empty `steps` array whose every step has a non-empty id and non-empty text spans
(`guided-empty-steps` / `guided-invalid-step`). `config` stays opaque to the central validator (a registered
renderer may validate its own config schema later). `simulationType` (and the other family keys) are **free-form
registry keys, not an enum** — a new key is valid content; a missing renderer is a runtime fallback, not a
validation error. All four families are enrichment-only (`origin-policy-violation` if marked `book`).

`source-id-mismatch` enforces that every `source.sourceId` (page, module, or block level) equals the course id —
content can never reference another book by accident. `missing-origin` / `invalid-origin` require every block to
declare a valid provenance, and `origin-policy-violation` enforces that clarification callouts, practice blocks and
all four interactive-activity families (simulation / animation / guided / interactive-diagram) are
`teacher-enrichment` (never `book`).

**Normalization policy: none.** A validator validates. It never reorders content, invents ids/titles/source pages,
generates answers, or rewrites Arabic. Any future normalization is a separate, explicit converter tool.

## Batches → modules

The **eight** high-level presentation sections (المقدمة · b1 … b6 · التلخيص — the manifest's "batches") are
**presentation groupings**; each maps to one **or more** real modules (`manifest.batches[].moduleIds`). Batches are
not part of the canonical Course→Module hierarchy and never distort it.

## Security / content safety

Educational content is trusted repository data, but still: no raw/executable HTML, no `eval`, no executable code
from content, no dynamic component names from data, no external script URLs. Simulation types resolve through a
controlled registry (Phase 5), never by executing a name from data.

## Book Fidelity and Educational Enrichment

**The source book (791381) is the authoritative academic source.** Conversion must preserve the book's topic order,
concepts, terminology, intended examples, academically-meaningful tables/diagrams, the relationship between
neighboring pages, and the curriculum scope. It must **not** silently remove content, silently add curriculum facts
as if they were the book's, or silently rewrite/"improve" the author's academic meaning.

**No silent corrections.** If the source has an apparent typo, inconsistency or questionable wording, preserve the
source meaning and, if needed, attach a clearly separate teacher note — a `callout` of kind `clarification` authored
as `origin:"teacher-enrichment"`. The original book and any added enrichment must always remain distinguishable.

### Block provenance (origin)

Every block **must explicitly** declare its provenance — there is **no default**, so a block can never accidentally
masquerade as book content (critical for the upcoming 264-page conversion, where thousands of blocks are authored):

```ts
origin: "book" | "teacher-enrichment"   // MANDATORY — never defaulted
```

- `"book"` — content faithfully represented from the PDF: original text, example, table, diagram, summary, or an
  original exercise represented faithfully.
- `"teacher-enrichment"` — additions: new solved/practice examples, hints, interactive practice, immediate
  feedback, clarifications, added diagrams, simulations, supplementary explanation.

A missing `origin` is a validation error (`missing-origin`); an unknown value is `invalid-origin`.
`blockOrigin()` returns the declared value and never invents one. AI-generated provenance is **not** introduced now
(AI is Phase 8).

**Provenance is by conscious authorship, not inferred from block type.** An `example`, `image` or `diagram` may be
`book` (reproduced from the source) or `teacher-enrichment` (added) — the author decides and declares it.

**Enrichment-only policy (enforced, `origin-policy-violation`).** These families are interactive/added layers that
are, by definition, never faithful book content and therefore must be `teacher-enrichment`:

- a `callout` of kind `clarification` (the separable teacher note),
- a `practice` block (interactive answer-checking is an enrichment layer over the faithful source exercise),
- **all four interactive-activity families** — `simulation`, `animation`, `guided`, `interactive-diagram` (native
  interactive functionality added by this product).

A block-level book `source` on any of these only **associates** the enrichment with a book page; it never changes
its `origin` (source association ≠ provenance), and no enrichment surface may present itself as «من الكتاب».

A source book diagram stays `image`/`diagram` with `origin:"book"`; the added interactive simulation is separate
enrichment. If the book contains an original question, its wording is preserved as faithful `book` blocks, and an
interactive `practice` block (which may reference the same page via block-level `source`) is attached as enrichment.

### Block-level source + inheritance rule

Page-level `source` is always required. Blocks may **optionally** carry their own `source`, resolved by
`effectiveBlockSource(page, block)`:

- explicit block `source` wins;
- otherwise an `origin:"book"` block **inherits the page's source** (no duplicate metadata needed);
- an `origin:"teacher-enrichment"` block without a source simply has none (it is supplementary).

Any `source` present — page, module or block — must have `sourceId === courseId` (`source-id-mismatch`).

### Book page → interactive page mapping

Default: **1 source book page → 1 interactive page** (preserves fidelity, easy teacher verification). Controlled
exceptions are allowed only when presentation requires it: one dense page → two interactive pages, or two small
adjacent pages → one interactive sequence. In every case the original order and the **exact** source page reference
are preserved and never lost; a split/merge is recorded in the page's `source` range plus `conversionNote`. The
page's `source` **is** its source mapping (`{sourceId, pdfPageStart, pdfPageEnd?}`) — no separate `sourceMapping`
field is duplicated. The teacher can always answer: «هذه الصفحة التفاعلية مأخوذة من أي صفحة في الكتاب؟».

### Solved vs practice examples, and immediate feedback

- **Solved example** (مثال محلول) — `example` with `mode:"solved"`: structured `steps[]` + `result` + optional
  `explanation`; the Reader may later reveal steps progressively.
- **Practice example** (مثال للحل) — `example` with `mode:"practice"`: the problem for the student to attempt.
- **Interactive practice** — the `practice` block carries answer(s) + a `feedback` object (`hint`,
  `correctFeedback`, `incorrectFeedback`, `explanation`) so Phase 4 can check answers and respond immediately.
  This feedback is **educational only** — never assignment grading, exam grade, medal or rank input.

### Simulations

First-class but used **only where interaction genuinely improves understanding** (not on every page). A simulation
is a data descriptor whose `simulationType` is a **free-form trusted registry key** (there is no closed enum);
behavior arrives in Phase 5 as renderers registered behind the Phase-3A engine, resolved through the controlled
registry (never by executing a name from data). *Future example keys only:* `network-flow`, `binary-box`, `subnet`,
`vlan`, `cli`.

### No invented curriculum

Enrichment must build on the concept already taught on that page/unit. Do not introduce a new networking topic
merely because it is related (a page teaching *Access vs Trunk* may demonstrate Access/Trunk — it must not suddenly
teach OSPF unless the book has reached OSPF).

### Source-first conversion policy (future)

For every source page: **(1)** read the exact source page; **(2)** extract its objectives and original material;
**(3)** create faithful native book blocks; **(4)** only then decide whether enrichment helps; **(5)** add a solved
example if beneficial; **(6)** add a short practice activity if beneficial; **(7)** add a simulation only where the
concept benefits from interaction; **(8)** validate the page against the source. A page is **not** "converted" merely
because its topic was summarized.

### Conversion acceptance criteria (future)

A converted page passes only if — **Fidelity:** original concept present, terminology preserved, important
examples and table/diagram information preserved, no source concept silently removed. **Traceability:** correct PDF
page reference and course/source id. **Enrichment separation:** book blocks and teacher-added blocks are
identifiable (via `origin`). **Educational quality:** any added example is correct and relevant, practice matches the
lesson, answers/feedback are correct, and any simulation reinforces the exact concept.

### Not a PDF viewer

The student experience is native (text, cards, tables, diagrams, interactive controls) — **not** 264 screenshots and
**not** a PDF embed. A source-page screenshot may serve later only as a teacher *verification* reference. Added
visuals must not contradict the source.

## Reader & UX Principles (Phase 3 — permanent)

> **Every learning page must be academically faithful, mobile-first, visually polished, and meaningfully
> interactive. Interactivity must improve understanding rather than merely decorate the page.**
>
> **A learning page is not complete if it is faithful to the book but unusable on a phone.**

These are permanent product invariants, alongside the retained ones: book vs teacher-enrichment separation
(mandatory `origin`), source-first conversion, no silent corrections, mobile-friendly controlled page splitting,
and the eight high-level course sections (المقدمة … التلخيص).

The **Interactive Reader** (`src/learning/reader/`) is the presentation surface — it never owns content or
navigation ordering:

- **Composition:** `LearningReader` (orchestration + state), `LearningReaderToc` (manifest-only TOC),
  `LearningPageRenderer` (page header + blocks), `RichTextRenderer` (safe inline spans — never
  `dangerouslySetInnerHTML`). Styles are namespaced `learning-reader-*`.
- **Navigation authority is the manifest + Phase-2 helpers** (`flattenPageRefs` / `previousPage` / `nextPage` /
  `pagePosition` / `findPage`) — never array positions re-implemented in React. `pageId` is the selection key.
- **Reader position (`صفحة N من M`) is content order — distinct from the source PDF page** shown quietly as
  `المصدر: كتاب … · صفحة PDF …` (and the printed page when known).
- **Lazy + cached:** the manifest drives the TOC without loading any body; only the selected page's module is
  lazily loaded and cached for the session; late/out-of-order loads never render a stale page. Zero backend
  requests (only code-split imports). The Reader is itself a lazy chunk.
- **Provenance is visible:** book blocks are the dominant surface (a quiet page-level "من الكتاب"); each
  teacher-enrichment block sits in a clearly-labelled, non-color-only enrichment surface (مثال إضافي / جرّب بنفسك /
  توضيح المعلم / محاكاة).
- **Answer keys never reach the DOM:** the static Phase-3 practice preview shows the question + option shapes only —
  never `correct`, `answer(s)`, or feedback (no text, attribute, prop or label).
- **Not-yet-converted is graceful:** with no module bodies authored yet, every real page shows a professional
  "قيد الإعداد" state (title/module/lesson/source) — never an AI-generated explanation.
- **Mobile-first:** single content column, a `الفهرس` drawer instead of a permanent sidebar, sticky safe-area-aware
  bottom Previous/Next, ≥44px touch targets, tables/code scroll only inside their own container (never the page),
  focus moves to the page title on navigation (never on first mount), and animations respect reduced motion.

## Interactive Page Design Principles (rendering contract)

Each converted page is one native **Interactive Learning Page** that can combine, in **authored block order**:
header (title / lesson / page position) → core book content → visual explanation → example → try-it practice →
simulation (only when useful) → summary/remember. Not every page needs every section — the blocks present decide
what renders. The Reader must render blocks in authored order and must **not** hardcode this sequence in React.

**Book content comes first.** The student must see the faithful book material clearly before optional enrichment;
extra activities must never bury the original lesson. Preferred visual hierarchy:
`المادة الأساسية ↓ مثال ↓ جرّب بنفسك ↓ محاكاة / نشاط ↓ الخلاصة`.

**Accessibility (kept compatible by the Phase-2 types):** keyboard navigation, proper heading levels, required `alt`
(unless decorative), input labels, visible focus, feedback never by color alone, RTL Arabic with LTR technical
values/commands (per-block/per-span `dir`), and mobile layouts.

## Interactive Learning Engine (Phase 3A — foundation)

Phase 3A adds the **engine foundation** the later interactive phases (real simulations in Phase 5, richer practice
in Phase 4) plug into — **architecture + types + a trusted registry + shells + validation + tests + docs, and no
real simulations/animations/questions and no PDF conversion**. It lives under `src/learning/activities/` and is
reached only through `LearningPageRenderer` delegation, so the renderer stays lean.

**Activity descriptor (data only).** The four families — `simulation`, `animation`, `guided`,
`interactive-diagram` — are enrichment blocks that carry a trusted registry **key** (a plain string), a positive
`version`, a `title`, and optional `capabilities`, a static `fallback` (text + an optional vetted image), and an
opaque `config`. Uniform helpers: `isActivityBlock`, `activityKey`, `activityDescriptor`.

**Capability / command contract.** `ActivityCapabilities` = `fullscreen` · `reset` · `replay` · `pause` · `speed`
(command capabilities) + `animated` · `interactive` (hints), all optional booleans. The **renderer's declaration is
the authority** (a registry entry's `capabilities`, or a built-in's): the shell shows a control (توسيع / إعادة
تعيين / إعادة التشغيل) **only** when the renderer declares it — untrusted content data can never enable a control the
renderer does not honor, and an unsupported command never renders a fake button. Commands reach the renderer as
monotonic signals (`commands.reset` / `commands.replay`, via `LearningActivityProps`) and emit `reset` /
`replayed` events. `pause` / `speed` are declared so a renderer-specific control can honor them later without an
engine redesign (no generic button yet).

**Guided (حل مع المعلم) is a structured model, not an opaque key.** `GuidedBlock` carries `prompt?` (spans) →
ordered `steps: GuidedStep[]` (`{ id, text: RichText, note? }`) → `result?` (spans) → `explanation?`. A **built-in**
progressive-reveal presenter (`GuidedActivity`) renders it — prompt → «فكّر أولًا» → reveal one step at a time →
result/explanation — with real keyboard-operable buttons (≥44px), restart through the shell's generic `reset`,
reduced-motion honored, safe spans only (never raw HTML), and state in React memory only (no persistence). Because
it is built in, guided needs no registry entry and the production activity registry stays empty.

**Trusted registry + lazy loader.** `createActivityRegistry([...])` maps `{kind, key, version}` → a
`RegisteredActivity` whose component is loaded through a statically-authored `load` thunk (its own code-split
chunk). Content supplies only the **key** — never a component name, function, module path, or any executable code.
There is **no `eval`, no `new Function`, and no dynamic `import()` of a data path**. `productionActivityRegistry`
ships **EMPTY** in Phase 3A, so every descriptor renders its faithful static `ActivityFallback` and no activity
chunk ever loads in production. Registries are **injected** (the reader defaults to the empty production one; tests
inject a synthetic one) — dependency injection, exactly like the reader's content API.

**Shell (`LearningActivityHost`).** The single place that touches the engine: it resolves a built-in presenter or
the injected registry (no match / unsupported version → static fallback), lazily loads a trusted component (held in
state, isolated by `LearningActivityBoundary` so a throwing activity degrades to the fallback instead of crashing
the page), and honors **reduced-motion** (prop + CSS). **One live instance, always:** the activity element is
rendered exactly once at a fixed tree position; fullscreen promotes the **same** host surface to a fixed overlay
(CSS) and arms the shared `useFocusTrap` (Tab containment, Escape, focus return) plus body scroll-lock — nothing is
duplicated, portalled or remounted, so interaction state stays authoritative across inline ↔ fullscreen (**no new
modal library**). Styles are namespaced `learning-activity-*` with ≥44px touch targets. Registry indexing uses
nested Maps (kind → key), so free-form keys never collide with a separator and the source carries no control bytes.

**Events go nowhere yet.** Activities/shell emit `ready` · `interaction` · `fullscreen` · `reset` · `replayed` ·
`error` through an **injected sink**; Phase 3A ships **only a no-op sink** (`noopActivityEventSink`). No
persistence, no backend, no `/api`, and no progress / grades / rank / medals — the event seam is where a separate
later Progress phase attaches without changing the engine.

**Question → Evaluator → Feedback foundation (`src/learning/practice/evaluator.ts`).** Established now so Phase 4
needs no schema redesign: `LearningQuestionEvaluator` (pure, injectable, `evaluate(question, response) →
EvaluationResult` with `correct | incorrect | partial | unknown`), `createEvaluatorRegistry` (resolve by question
kind; a local, a server, or **no** evaluator share one contract), a reference pure `localEvaluator`, and
`LearningFeedbackState` (submitted / result / `revealedHints` / `solutionRevealed`). Phase 3A ships **no server
implementation, no network call, no grading, no student persistence**, and the Phase-3 static practice rendering is
**unchanged** — the answer key never reaches the DOM.

**Hint ladder.** `PracticeFeedback.hints?: string[]` is the ordered ladder (تلميح 1 → تلميح 2 → … → اعرض أول خطوة →
اعرض الحل); the legacy single `hint` stays for backward compatibility and `hintLadder(feedback)` folds it in.
`revealNextHint` / `revealedHints` are pure state transitions for Phase 4. Nothing from the ladder is rendered in
Phase 3.

**Not in Phase 3A:** real VLAN/subnet/ACL/etc. simulations, real animations, full answer-checking, real Book
791381 PDF conversion (`src/learning/content/791381/modules/*` stays unauthored), student progress, and
class ↔ learning-material assignment. Synthetic activity fixtures + a showcase page are **test-only** and never
wired into a production route or catalog.

## Phase boundaries

| Phase | Scope | Status |
| --- | --- | --- |
| 2 | Content schema, validation, navigation, lazy registry, `791381` skeleton manifest | done |
| 3 | Interactive **Reader** — TOC, previous/next, jump-to-page, page/block rendering, provenance display, lazy module loading, professional not-yet-converted state | done (reader shell) |
| **3A (this)** | Interactive Learning **Engine foundation** — activity descriptors, trusted registry + lazy loader (EMPTY production), host shell + error boundary + fullscreen + reduced-motion, no-op event sink, validation, tests, docs | done (foundation) |
| 3B | Pilot content conversion — a small contiguous range of real Book 791381 pages | next |
| 4 | Interactive Practice — answer checking + immediate feedback (inline) | deferred |
| 5 | Simulations — real VLAN/subnet/CLI/… renderers registered behind the Phase-3A engine | deferred |
| 6 | Student Progress — last page, completion, attempts (separate domain; attaches to the no-op event seam) | deferred |
| 7 | Teacher Content Management — editors, publish/unpublish | deferred |
| 8 | AI Learning Assistant | deferred |

Phase 3 ships the Reader **shell only**: it renders synthetic/test content and the "قيد الإعداد" state for the real
book. **PDF → native content conversion has not started** — it begins in Phase 3B, only after the Reader UX is
approved, choosing a small contiguous page range first. The source PDF remains the authoritative source and is never
bundled into production.
