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

**Stable module ids are immutable identifiers, not sequence numbers.** A module id is **not** guaranteed to equal the
source book's unit number or the module's current reading position; the explicit `order` field is the **only**
sequencing authority (Reader, TOC and navigation all sort by it). The Phase-2 skeleton claimed `m03`–`m06` for a
representative set of later book sections, so when the book's real Unit 3 («عناوين IP») was converted (Phase 3E) it
became the next free id, **`791381-m07`, with `order: 3`**, while the historical `m03` skeleton kept its id, title
and source mappings and merely moved to `order: 4` (m04→5, m05→6, m06→7). Future real units continue with `m08`,
`m09`, … placed by `order`. Existing ids are **never renumbered or repurposed**; a regression test pins every
pre-existing module id and source mapping.

## Source traceability

Every production **Page** carries `source`:

```ts
source: { kind: "book"; sourceId: "791381"; pdfPageStart: number; pdfPageEnd?: number; printedPage?: number; sourceNote?: string }
```

We can always answer "which original PDF page produced this interactive page?". **Reading position ≠ source PDF
page**: the Reader navigates by content order (`pagePosition` → *page N of M*); `source.pdfPageStart` is traceability
only, and `printedPage` (the number printed on the paper) differs from the PDF page index again.

## Block families (union on `type`)

`text` · `heading` · `image` · `callout` · `example` · `table` · `code` · `diagram` · `practice` · `list` ·
`unit-opener` · `simulation` · `animation` · `guided` · `interactive-diagram`.

- **text** — safe inline `spans` (`strong`/`em`/`term`/`code`, optional per-span `dir`). No raw HTML.
- **callout** — `remember` · `important` · `warning` · `tip` · `summary` · `clarification` (maps to book boxes تذكّر / الخلاصة / الفكرة; `clarification` is the separable teacher note, always `origin:"teacher-enrichment"`).
- **example** — `mode: "solved" | "practice"` (default `solved`), `title?` + `prompt?` + structured `steps[]` + `result?` + `explanation?` (never one blob string). Solved = مثال محلول; practice = مثال للحل.
- **table** — `headers[]` + `rows[][]` (not an HTML string); optional `columnDirs[]` (Phase 3E) marks body columns
  `"ltr"` so IP addresses / ranges / class names keep their digit order inside an RTL table whose header order stays RTL.
- **code** — `language: cli|text|config`, whitespace preserved, usually `dir:"ltr"`.
- **image / diagram** — local `src`, `alt` **required unless `decorative`**; diagram is metadata + image only (no sim behavior).
- **practice** — lightweight interactive practice with immediate-feedback readiness. Question kinds `multipleChoice` / `trueFalse` / `shortInput` / `fillBlank`, plus a `feedback` object (`hint` / `correctFeedback` / `incorrectFeedback` / `explanation`). **Not** the ExamBank exam schema, not graded, not a rank/medal input. *Extension path:* richer kinds (matching, ordering, classify, binary-entry, IP/CIDR, CLI) are added as new union members (or expressed as `simulation`) without touching existing ones.
- **simulation / animation / guided / interactive-diagram** — the four interactive **activity** families (Phase 3A
  engine). Each is a pure DATA descriptor: a trusted registry **key** (`simulationType` / `animationType` /
  `guidedType` / `interactionType` — a plain string, never a component/function/path), a required positive-integer
  `version`, a `title`, and optional `capabilities` / static `fallback` / opaque `config`. A descriptor renders
  live only when a trusted renderer owns its exact `{kind, key, version}`; otherwise the engine renders a faithful
  static fallback. In Phase 3A the generic built-in `guided / reveal / v1` walkthrough presenter has real behavior;
  real networking simulations / animations / interactive diagrams are later phases (see *Interactive Learning
  Engine* below).

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
`guided-invalid-step`, `guided-duplicate-step-id`, `list-empty-items`, `list-invalid-item`,
`unit-opener-missing-title`, `invalid-table-row`.

Activity descriptors (Phase 3A) are validated centrally as pure data: `activity-missing-key` (empty registry key),
`activity-invalid-version` (missing / non-positive-integer `version`), `activity-missing-title`,
`activity-invalid-capabilities` (capabilities must be an object of optional **boolean** flags — `fullscreen: "yes"`,
an unknown key, an array or `null` are rejected), a fallback image with no `alt` reuses `image-missing-alt`, and a
`guided` block needs a non-empty `steps` array whose every step has a non-empty id and non-empty text spans
(`guided-empty-steps` / `guided-invalid-step`), with step ids unique within that block
(`guided-duplicate-step-id`; uniqueness across different guided blocks is not required). `config` stays opaque to the central validator (a registered
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
it is built in, guided needs no entry in `productionActivityRegistry` (which stays empty) — but it is still resolved
by **exact identity**: the built-in registry (`builtins.ts`) owns precisely `guided / reveal / v1`. A guided block
with an unknown `guidedType` (e.g. a future branching walkthrough) or an unsupported `version` falls back to the
static surface until a trusted presenter for that exact identity is added there; dispatch is never by block type.

**Trusted registry + lazy loader.** `createActivityRegistry([...])` maps `{kind, key, version}` → a
`RegisteredActivity` whose component is loaded through a statically-authored `load` thunk (its own code-split
chunk). Content supplies only the **key** — never a component name, function, module path, or any executable code.
There is **no `eval`, no `new Function`, and no dynamic `import()` of a data path**. `productionActivityRegistry`
ships **EMPTY** in Phase 3A: no registry-backed renderer (real simulation / animation / interactive diagram) is
registered, so those descriptors render their faithful static `ActivityFallback` and no activity chunk ever loads
in production. This does **not** mean every activity family falls back — the generic built-in `guided / reveal / v1`
presenter (`builtinActivityRegistry`, eager component, same `{kind, key, version}` discipline) is intentionally
available. Overlapping ownership of one `{kind, key, version}` by two registrations is rejected at registry
construction (`ActivityRegistryError`); disjoint version sets are fine. Registries are **injected** (the reader
defaults to the empty production one; tests inject a synthetic one) — dependency injection, exactly like the
reader's content API.

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

## Phase 3B — First Real Conversion Pilot (source PDF 7–14)

The first REAL native conversion of Book 791381: source **PDF pages 7–14** (Unit-1 basics + the Unit-2 opener),
authored as TypeScript content → React blocks → semantic HTML. It is a pilot to validate architecture, fidelity and
mobile UX before the conversion expands; **nothing beyond PDF 14** is converted.

- **Authoritative source.** The OWNER's 264-page teacher book `كتاب_791381_نسخة_المعلم_الملونة_الكاملة(2).pdf`
  (delivered as `Book791381.zip` → `Book791381.pdf`, verified: **264 pages**). It is the educational book — never a
  Bagrut/exam PDF (`791381-2026.pdf` etc.). Each page was verified against the **rendered** source (not only text
  extraction, which scrambles Arabic/technical strings). The source PDF is **never** bundled into production.
- **1:1 mapping.** Each source page → exactly one interactive page (`source.pdfPageStart` 7…14). No split/merge was
  needed. `printedPage` is set only where visibly printed (PDF 8–13 → 6–11); the unit openers omit it.
- **First real module bodies.** `src/learning/content/791381/modules/m01.ts` (complete) and `m02.ts` (partial),
  registered as lazy `import()` chunks in the registry. The main bundle imports none of them eagerly.
- **Partial module conversion.** A loaded module body may set `partial: true` when its manifest lists pages this
  batch has not converted yet. The Reader then shows an unconverted page as the professional **"قيد الإعداد"**
  state (`bodyForModule` → `unavailable`), distinct from a **"missing content"** integrity error (a non-partial
  module unexpectedly missing a page). `m02` is partial: its opener (PDF 14) is ready; its later manifest pages
  (PDF 16/18/20) stay "قيد الإعداد". Module-level lazy chunking, `pageId` authority, stale-load safety and the
  session cache are unchanged.
- **First production registry-backed activity.** `productionActivityRegistry` is no longer empty: it holds exactly
  `interactive-diagram / network-scope / v1` (`NetworkScopeDiagram`, its own lazy chunk) for PDF 11's PAN → LAN →
  WAN scope. There are still **zero** real simulation/animation renderers, and the exact allowlist is tested. The
  generic `guided / reveal / v1` built-in (from Phase 3A) drives PDF 12's "حل مع المعلم" reveal.
- **Two generic primitives** (course-agnostic, reusable by any book): a `list` block (labelled/feature list — the
  book's uses/benefits/management grids) and a `unit-opener` block + page `layout: "opener"` hero (unit number/label
  /title/subtitle/goal). No `if page === 7`, no 791381-named component.
- **Book vs enrichment.** Every source-derived block is `origin:"book"` (definitions, the four uses, the five
  benefits, the shared-printer **ExampleBlock**, the type/needs/management lists, the ping/ipconfig callout — with
  `ping`/`ipconfig`/`TCP/IP`/`Wi-Fi`/PAN/LAN/WAN rendered LTR). The only enrichment blocks are the two interactive
  activities (network-scope diagram, guided reveal); both carry a block-level book `source` ASSOCIATING them to
  their page while remaining `teacher-enrichment` (source association ≠ provenance), and no enrichment surface ever
  claims «من الكتاب».
- **Native, not a PDF viewer.** No PDF embed, iframe, or full-page screenshot — native blocks only.
- **Mobile-first acceptance.** Verified at 360/390/430 + tablet/desktop: no page-level horizontal scroll, ≥44px
  touch targets (scope tabs, controls), responsive `auto-fit` grids that collapse to one column, `clamp()` opener
  typography (no fixed desktop widths), LTR technical strings, reduced-motion, keyboard-operable controls.
- **Lesson learned.** The engine/reader needed only two small, generic additions (the partial-module `unavailable`
  vs `missing` distinction, and the `list`/`unit-opener` primitives) — no registry redesign. The activity registry,
  built-in resolution, capability model and secrecy contracts carried the pilot unchanged.

The rest of the book stays skeleton (manifest only); the next batch continues the number-system content from PDF 15.

## Phase 3C — Number-Systems Batch (source PDF 15–22)

The second real conversion batch: Book 791381 Unit-2 **PDF 15–22** (العشري/الثنائي, binary↔decimal box method,
النظام السادس عشري (Hex), the hex↔binary table, hex↔binary conversions, and the short exercises). Same standards as
3A/3B: source-faithful, additive, lazy, accessible, mobile-first, RTL-correct, answer-key safe. **Nothing beyond
PDF 22.**

- **Fills the existing skeleton + interleaves.** The Phase-2 skeleton already mapped PDF 16/18/20 to
  `m02-l01-p01/p02/p03`; those **stable IDs are unchanged** — only their `order` is adjusted to interleave the newly
  added PDF 15/17/19/21/22 pages into the exact source reading sequence 15 → 22. `p02`'s title is corrected to the
  authoritative rendered source «النظام السادس عشري (Hex)» (the skeleton's «الميزان السادس عشر» came from a hidden,
  inaccurate text layer). A regression test asserts every pre-existing id is preserved and the reading order is
  15 → 23.
- **m02 stays PARTIAL.** Unit 2 continues to **PDF 23** («خلاصة التحويلات»), which this batch does not convert. PDF 23
  is added to the manifest as a **skeleton-only** entry (no body), so `m02.partial` remains `true` and the reader
  shows PDF 23 as «قيد الإعداد» — the module becomes complete only when every manifest page has a body.
- **Numeric fidelity under RTL.** Every binary/decimal/hex value, place-value row and equation is authored as an
  **LTR** span/table so RTL never reverses digit order (e.g. `9A2C5 = 1001 1010 0010 1100 0101`, not the visually
  reversed source grouping). Focused tests lock each numeric example. The PDF-19 hex↔binary table reproduces the
  source **exactly**, including the source's own omission of `7` and `F` (never silently "completed").
- **Two small generic renderer additions** (existing primitives, reusable by any book): a `list` **`ordered`**
  variant (a real `<ol>` for numbered procedures) and **`dir` support on `table`** (numeric place-value tables opt
  into `dir:"ltr"` so columns read MSB→LSB left-to-right; they still scroll inside their own container on mobile).
- **Conservative activities.** No new simulation/animation; `productionActivityRegistry` is unchanged. The only
  enrichment is a single `clarification` note on the exercises page (the printed QR codes are not shown in the
  reader). The exercises are a faithful list — **no practice blocks, no answers, no external link/image, no
  evaluator wiring.** Answer-key secrecy is untouched.

The next batch continues from **PDF 23** (خلاصة التحويلات).

## Phase 3D — Complete Unit 2 (source PDF 23)

Phase 3D converts the single remaining page of Unit 2 — **PDF 23 «خلاصة التحويلات»**, the unit's closing summary —
which **completes module m02**. The Unit-2 boundary is confirmed from the rendered source: PDF 23 is still headed
«الوحدة الثانية · الأعداد والموازين», and **PDF 24 opens Unit 3** («الوحدة الثالثة · عناوين IP»). So m02 spans PDF
14 + 15–23, and every one of those pages now has a real body.

- **Fills the existing `p09` skeleton.** PDF 23 was already listed in the manifest as `791381-m02-l01-p09`
  («خلاصة التحويلات», order 9); Phase 3D adds its body only — the **stable id is unchanged** and no other id moves.
- **m02 becomes COMPLETE.** With PDF 23 converted, every manifest page of m02 has a body, so the module's
  `partial` flag is dropped. An unexpectedly-absent m02 page is once again a genuine integrity error rather than a
  «قيد الإعداد» state. The professional unavailable state remains covered by the synthetic-fixture reader tests.
- **Source fidelity + RTL safety.** The four conversion methods and the closing «لماذا هذا مهم؟» callout are
  reproduced verbatim. The source's four badge labels use a compact «A ← B» arrow whose direction is
  bidi-ambiguous under RTL, so each conversion is preserved using the book's own directional phrasing («من X إلى
  Y») — no technical label can render reversed. `IPv4` / `IPv6` are authored as `dir:"ltr"` code spans; a DOM test
  asserts they render inside `dir="ltr"` and are never reversed.
- **No new capability, no enrichment.** No renderer changes; reuses the existing `list` (cards) + `callout`
  primitives. The page is pure book content (`origin:"book"` throughout) — no practice, no answers, no QR image,
  no external link, no evaluator wiring.

**Unit 3 followed in Phase 3E** (see the next section) as a **new** stable module `791381-m07` placed by
`order: 3`. The Phase-2 skeleton's `m03` («برمجة السويتش CLI و VLAN» @ PDF 123) does **not** correspond to the
book's actual Unit 3 and was deliberately left untouched (id, title and source mappings immutable).

## Phase 3E — Complete Unit 3: IP Addresses (source PDF 24–33)

Phase 3E converts the whole of **Unit 3 «عناوين IP» — PDF 24–33** (printed 22–31) into one **complete** module.
The boundary is verified from the rendered source: PDF 24 is the Unit-3 opener («الوحدة الثالثة · 03 · عناوين
IP»), PDF 25–33 all carry the «الوحدة الثالثة · عناوين IP» header, and **PDF 34 opens Unit 4** («الوحدة الرابعة —
CIDR و Subnet و Class»). Nothing from PDF 34 onward is converted; a test asserts no m07 body page has
`pdfPageStart >= 34`.

- **New stable module `791381-m07`, `order: 3`** (title «عناوين IP»). The historical Phase-2 skeleton `m03`
  («برمجة السويتش CLI و VLAN», PDF 123+) is **not** reused, renamed or re-mapped — module ids are immutable and
  are **not** unit numbers; explicit `order` is the sequencing authority (m03→4, m04→5, m05→6, m06→7). The
  overview batch **b1** («الأساسيات · الأعداد · IP») now lists `[m01, m02, m07]`; its id/label and the other batch
  mappings are unchanged (CLI/VLAN stays in b4). A regression test pins every pre-existing module id, title and
  PDF mapping.
- **Structure (1 source page → 1 interactive page, no `pdfPageEnd`):**
  `l00` افتتاحية الوحدة — PDF 24 (generic `unit-opener` hero) ·
  `l01` عنوان IP وبنية IPv4 — PDF 25 (what is an IP address), 26 (IPv4 / IPv6), 27 (IPv4 structure: four octets),
  28 (when is an address invalid — the book's own school rules), 29 (تدريب: صالح أو غير صالح؟) ·
  `l02` العناوين العامة والخاصة — PDF 30 (public / private), 31 (private ranges), 32 (تدريب: خاص أم عام؟),
  33 (Static IP / Dynamic IP — the last Unit-3 page). Page ids `791381-m07-lNN-pNN` are new, authored once, and
  immutable from here on. The module is **complete** (manifest page ids ↔ body page ids match exactly; no
  `partial` flag).
- **Source fidelity, no silent corrections.** The book presents simplified school-level IP rules (e.g. PDF 28's
  validity rules incl. the Localhost/127 and APIPA `169.254.x.x` exclusions, and the explicit nuance that `255` in
  a *middle* octet is not automatically invalid — `192.255.10.10`; PDF 31's private ranges incl. the "172: second
  octet 16–31" rule; PDF 32's `192.167` ≠ `192.168` warning). These are converted **as written**; outside
  networking nuance is never substituted. Every faithful block is `origin:"book"`.
- **RTL/LTR.** Every IP address, IPv4/IPv6 token, range and PC label is authored as a `dir:"ltr"` code span or
  inside an LTR table so digits and dots are never reversed inside the RTL page; DOM tests cover the representative
  strings (`192.168.1.5`, `2001:db8::1`, `192.168.100.10`, `192.255.10.10`, `169.254.10.234`, `8.8.8.8`,
  `172.16.32.30`, …). The worksheet/range tables mark their address columns with the small generic `table`
  capability added here, `columnDirs: ["ltr", …]`, so those cells are explicitly LTR while the Arabic header
  order stays RTL. Wide tables scroll inside their own container.
- **Transparent normalizations (documented, not silent):** PDF 28 rule 5 is printed with «المجال» touching
  `169.254.x.x` — a normal space is used (typography only). PDF 33's title is authored as the logical RTL string
  «Static IP و Dynamic IP», which reproduces the printed visual (Static rightmost) under the reader's RTL base; its
  closing «الفرق الأساسي» box is printed with an LTR base direction (an authoring artifact) and is shown as
  normal RTL prose with the identical logical content `Dynamic = متغيّر · Static = ثابت`.
- **The first IP-focused interaction — `interactive-diagram / ipv4-octets / v1`** (PDF 27, `origin:
  "teacher-enrichment"` with a source association): the second registry-backed production activity, its own lazy
  chunk (`IPv4OctetsDiagram`). The student selects one of the FOUR octet segments of the example address (real
  buttons, ≥44px, keyboard + touch, `aria-pressed` + a visible mark — never colour-only, LTR row, reduced-motion
  contract, shell reset). It shows only PDF 27's concept — four parts, each in the book's 0–255 range — with **no**
  validity rules, no free-text input, no CIDR/subnet/class, no scoring. The production registry is an exact
  two-entry allowlist (`network-scope/v1`, `ipv4-octets/v1`); still zero simulation/animation/CLI renderers.
- **PDF 28 guided reveal** (built-in `guided / reveal / v1`, `origin:"teacher-enrichment"`, source PDF 28): «كيف
  نفحص إن كان العنوان صالحًا حسب قواعد هذه الصفحة؟» reveals the page's **own** rules one at a time — no new rules,
  no answers from the PDF 29 training.
- **Source exercises stay book exercises.** PDF 29 and PDF 32 are rendered as faithful worksheet tables (the
  address rows with empty صالح/غير صالح · السبب / خاص/عام columns), exactly as the book presents them: **no**
  answer key, no `correct` flag, no evaluator wiring, no Correct/Incorrect UI, no score, no solution reveal.
  Interactive answer checking is Phase 4.
- **One small Reader robustness fix (found by the new lazy-load test).** When a navigation interleaved two module
  loads, the Reader released a module id from its in-flight set inside the promise callback — *before* the state
  commit — so a passive-effect run triggered by the other module's commit could observe "not in flight, not loaded"
  and request the same chunk twice. The id is now released only where the committed `modules` / `erroredModules`
  state shows it (in the effect). Session caching, stale-load protection, error/retry and the ready / unavailable /
  missing distinction are unchanged; the Phase-3E reader test asserts each module body is requested exactly once.
- Confined to `src/learning/**` and `docs/`; no product area outside Learning is touched.

**Deferred next work: Unit 4 (PDF 34+)** — CIDR, Subnet, Class A/B/C, masks, network/host bits.

## Class Learning Materials & Progressive Release

The first product slice that puts the converted book in front of REAL students, class by class, on the teacher's
schedule. Three things are deliberately distinct — and the distinction is the core invariant of the feature:

```text
Content DEPLOYMENT   ≠   Class ASSIGNMENT   ≠   Module PUBLICATION
(a module body ships      (a class uses book       (which modules of that book the
 in the frontend build)    791381)                  class's students may see right now)
```

Deploying a newly converted unit changes nothing for any class. Attaching a book to a class shows nothing to its
students until the teacher publishes at least one module. Publication is per module, reversible, and class-level.

**Classroom data shape (authorization / delivery metadata only — never bodies, pages, blocks or PDF text):**

```ts
classroom.learningMaterials = [ { courseId: "791381", visibleModuleIds: ["791381-m01", "791381-m02"] } ]
```

A course may be attached with `visibleModuleIds: []` (teacher sees the card, students see nothing). It is a separate
field from `programCodes` (projects) and from `platform/assignments/` (exams) — no coupling in either direction.

**Server publication registry — `api/src/lib/learning-materials-registry.js`.** The only list the API trusts for
course/module ids: course `791381` with `m01`, `m02`, `m07` in the book's content order (never a lexical sort; m07
is Unit 3 after m02). Skeleton-only modules (m03–m06) are absent, so they can neither be published nor become
student-visible. **Future module onboarding:** when a unit is converted and approved, the developer appends it here;
it then appears to teachers as «مخفي عن الطلاب» and is NEVER appended to any class's `visibleModuleIds` — a test
proves a newly registered module is not auto-published to existing classes.

**One normalization authority — `api/src/lib/class-learning-materials.js`.** Every consumer reads the field through
it: missing/malformed → `[]`; ids trimmed, de-duplicated, filtered to the registry, canonical order; duplicate
course entries merged; unknown courses/modules default-denied (a stale `791381-m999` in storage is never echoed).
Pure `set`/`remove` mutations and the safe student catalog builder live here too.

**Teacher flow** (`POST /api/classrooms`, builder auth, `mutateJsonWithRetry` CAS, audit):
`setLearningCourseModules { classId, courseId, moduleIds }` attaches the course if needed and sets EXACTLY the
published ids (`[]` valid; unknown course/module → 400; archived class → 403 via `normalizeClassStatus`; missing →
404; conflict → 503). `removeLearningCourse { classId, courseId }` detaches the course (idempotent: absent → 200
`removed:false`, no write, no audit); content is never deleted, roster/projects/assignments untouched.
`GET /api/classrooms` returns the normalized `learningMaterials` per class (derived from the same document — no
extra reads). `GET /api/learning-materials-catalog` returns the publishable catalog (ids, titles, order only), read
once per Classes & Students workspace. UI: `src/students/ClassLearningMaterialsPanel.tsx` below Classes | Students
(add-course dialog with nothing pre-checked; hide and remove use non-destructive confirmations; archived = read-only;
a response for class A never rewrites the panel of a class B selected meanwhile).

**Student entitlement** (`GET /api/student-learning-materials`): `requireActiveStudentSession` → the CURRENT
persisted student document → `student.classId` (never the token's `classId`, never a query parameter) → one class
document read → lifecycle (archived class → 403, same rule as the dashboard) → normalized publication ∩ registry.
Only courses with ≥ 1 published module are returned, each with ONLY its published modules (id, title, order): no
hidden titles, no hidden count. Storage path: the session's user read + one class read; no scans, no bodies.

**Student experience:** «موادي التعليمية» in the portal (after «ماذا عليّ أن أفعل الآن؟», before «تقدّمي») is an
optional panel (one read; failures degrade locally, never a logout). «فتح المادة» RE-READS the entitlement, then
opens the **same `LearningReader`** (no student fork) through `createRestrictedReaderContentApi` +
`filterManifestByModuleIds`: the manifest contains only released modules (TOC, jump list, previous/next and the
page total all follow), `hasModule` is false for anything else, and `loadModule` rejects BEFORE the base loader is
invoked. A hidden MIDDLE module (m01 + m07 released) simply does not exist — the last m01 page reads straight into
the first m07 page; no placeholder, no «قيد الإعداد», no locked entry. Exit returns to the portal.

**Consistency model (phase 1):** changes appear on the student's next portal load, explicit refresh, or course
re-open (open-time revalidation). No realtime push, no polling.

**Honest boundary — static assets.** Module bodies are frontend code-split chunks. This phase enforces
server-authoritative, default-deny access through every SUPPORTED application path (API entitlement, UI visibility,
manifest filtering, navigation, loader guard). It is not asset-level confidentiality: a technically advanced user
fetching chunk URLs by hand is not prevented. True confidentiality needs authenticated content delivery from the
server in a future architecture; nothing here claims DRM.

**Deliberately NOT in this phase:** page/lesson-level release (modules only), scheduled release, per-student
exceptions (class-level only), reading progress (no last page, completion, streaks, XP or badges — Phase 6), answer
checking (Phase 4), new book content (Unit 4 / PDF 34+ paused for the UX review this slice enables).

See also `docs/class-learning-materials.md` for the authority chain in one diagram.

## Phase boundaries

| Phase | Scope | Status |
| --- | --- | --- |
| 2 | Content schema, validation, navigation, lazy registry, `791381` skeleton manifest | done |
| 3 | Interactive **Reader** — TOC, previous/next, jump-to-page, page/block rendering, provenance display, lazy module loading, professional not-yet-converted state | done (reader shell) |
| **3A (this)** | Interactive Learning **Engine foundation** — activity descriptors, trusted registry + lazy loader (EMPTY production), host shell + error boundary + fullscreen + reduced-motion, no-op event sink, validation, tests, docs | done (foundation) |
| 3B | First real conversion pilot — Book 791381 source PDF **7–14** | done |
| 3C | Number-systems batch — Book 791381 source PDF **15–22** (decimal/binary/hex conversions) | done |
| 3D | Complete Unit 2 — Book 791381 source PDF **23** (خلاصة التحويلات); m02 becomes complete | done |
| 3E | Complete Unit 3 «عناوين IP» — Book 791381 source PDF **24–33** as new stable module `m07` (order 3); first IP-focused activity (`ipv4-octets/v1`) | done |
| **Class Learning Materials (this)** | Class assignment + progressive module release + «موادي التعليمية» + filtered shared Reader + default-deny student access; Unit 4 conversion paused for the real teacher/student UX review | done (awaiting UX review) |
| 4 | Interactive Practice — answer checking + immediate feedback (inline) | deferred |
| 5 | Simulations — real VLAN/subnet/CLI/… renderers registered behind the Phase-3A engine | deferred |
| 6 | Student Progress — last page, completion, attempts (separate domain; attaches to the no-op event seam) | deferred |
| 7 | Teacher Content Management — editors, publish/unpublish | deferred |
| 8 | AI Learning Assistant | deferred |

Phase 3 shipped the Reader **shell** first (synthetic/test content + the "قيد الإعداد" state for the real book).
**PDF → native content conversion started in Phase 3B** and proceeds in small contiguous page ranges, each verified
against the rendered source: **m01 (Unit 1) and m02 (Unit 2) are complete**, and **Phase 3E continues with Unit 3
(«عناوين IP», module `m07`)**. Later units remain skeleton-only until their batch. The source PDF remains the
authoritative source and is never bundled into production.
