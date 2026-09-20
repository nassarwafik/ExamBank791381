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

- **Learning Materials desktop inset.** The teacher shell's content area carries no padding; from 1024px the
  Learning-Materials roots (`.eb-lm` library/overview and the `.eb-lm-reader` wrapper around the teacher's Reader)
  take a LOGICAL inline inset (`--eb-space-5`) and a block inset, in `src/learning/learning.css` only. The shared
  Reader stylesheet, the student portal's Reader and the phone/tablet baseline are untouched; the Reader keeps its
  wide slide canvas (a gutter, never a max-width). Guarded by `learning.layout.guards.test.ts`.

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
shipped **EMPTY** in Phase 3A (historical — the current allowlist is the enumerated, test-pinned `productionActivityRegistry` in `engine.ts`; each later content phase section below records the entries it added): no registry-backed renderer (real simulation / animation / interactive diagram) is
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

**Unit 4 (PDF 34+) followed in the «Units 4–6» phase** (CIDR, Subnet, Class A/B/C, masks, network/host bits, devices, topologies).

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

## Learning Practice, Interactive Worksheets & Unified Strength

The first phase in which the student **does** something in the book and it counts. Three additive layers, each with
one authority, none of which touches assignments, medals, project stages or class publication:

```text
library-training block  →  GET/POST /api/learning-training  →  platform/learning-practice/<studentId>.json (best only)
practice-table block    →  checked in the Reader, in place    →  nothing stored, nothing scored
Strength                →  api/src/lib/student-strength.js    →  dashboard `strength` (exams + trainings + projects)
```

### `library-training` — a book page points at a platform training

- **Metadata only.** `{ type: "library-training", trainingId, label, requiredModuleId }`. No questions, options,
  answers or titles may live in the content (validated: `library-training-invalid`). Origin `book` is allowed because
  the printed page itself lists the trainings (791381 PDF 22 → T01–T04, blocks `m02-l01-p08-t1..t4`).
- **The six book review pages** (Learning Practice — T05–T30 and F01–F06). The book's QR pages are the platform's
  pointers, ONE block per real Exam-Library id (never a combined `T05-T06` id), grouped by `heading` level 4 exactly
  as the book groups its cards, under a level-3 «تدريبات مرتبطة بهذه الصفحة» (page 215: «امتحانات نهائية للتدريب»).
  Page numbers are **Reader ordinal positions** (the footer «n / 248»), not PDF numbers:

  | Reader position | Page id | PDF | Items | Blocks |
  | --- | --- | --- | --- | --- |
  | 98 | `791381-m16-l05-p01` «تدريبات مراجعة سريعة» | 106 | T05–T12 (groups 5–6, 7–8, 9–12) | `m16-l05-p01-lt05..lt12` |
  | 110 | `791381-m18-l03-p01` «تدريبات نهاية الدفعة» | 119 | T13–T18 (groups 13–14, 15–16, 17–18) | `m18-l03-p01-lt13..lt18` |
  | 145 | `791381-m04-l03-p02` «تدريبات نهاية الدفعة» | 157 | T19–T22 | `m04-l03-p02-lt19..lt22` |
  | 178 | `791381-m24-l03-p01` «تدريبات على DHCP و Security» | 191 | T23–T26 | `m24-l03-p01-lt23..lt26` |
  | 214 | `791381-m06-l02-p01` «تدريبات» | 228 | T27–T30 | `m06-l02-p01-lt27..lt30` |
  | 215 | `791381-m06-l02-p02` «امتحانات نهائية للتدريب» | 229 | F01–F06 | `m06-l02-p02-lf01..lf06` |

  The book's own cards and QR note stay as provenance; the clarification says the trainings open from inside the
  platform once their linked part is released. m28 begins at position 216 and is untouched. Guards:
  `src/learning/content/791381/learningPractice.t05-f06.test.ts` (ordinal → page identity, exact association,
  cardinality, metadata-only shape, gate agreement with the server registry) and
  `api/tests/learning-training-t05-f06.test.js` (registry = catalog, gate per item, F-series safety).
- **Disclosure rule.** The Reader renders only what the injected HOST discloses. Without a host: the printed label
  and a generic note (no CTA, no request). Unavailable: label + «سيصبح متاحًا عند نشر الجزء المرتبط به.» + a disabled
  CTA — **no title**. Available: title, best result («أفضل نتيجة: 80% · نقاط التقوية: 20 / 25») and «ابدأ التدريب» /
  «أعد التدريب». The renderer never hardcodes training ids.
- **Registry (server).** `api/src/lib/learning-training-registry.js` — the ONE registry — lists the whole
  Exam-Library catalog (36 items: T01–T30, F01–F06) with the catalog's own titles. The gate is the SAME publication
  authority as Class Learning Materials: active student session → persisted `classId` → active class → course
  assigned → `requiredModuleId` published. Teachers (builder token) may open every training regardless.
  `requiredModuleId` is the **latest module the item's catalog `pageRange` requires** (not the module of the page that
  lists it — precedent T03/T04 on PDF 22 gated by m07): T01 m01 · T02 m02 · T03/T04 m07 · T05 m08 · T06 m09 · T07 m10
  · T08 m11 · T09 m12 · T10 m13 · T11 m14 · T12 m15 · T13 m16 · T14 m18 · T15 m03 · T16 m19 · T17 m04 · T18 m21 · T19
  m22 · T20 m24 · T21 m05 · T22 m26 · T23 m27 · T24 m06 · T25/T26 (comprehensive, 6–188) m24 · T27–T30 (advanced
  226) m06 · F01–F06 (final exams) m06. Every entry is cross-checked against `catalog.json` pageRange / category /
  title by the API guard suite.
- **API** (`api/src/functions/learning-training.js`): `GET /api/learning-training` (list; `title` only when
  `available`), `GET /api/learning-training/{id}` (the Exam-Library item through `sanitizeExamForStudent` — no
  answers, hints, notes or history), `POST /api/learning-training/{id}/submit` (grades **only** `body.answers` with
  `gradeExam`; the browser never sends a score/percentage/points). Unknown id → 404; hidden module → 403
  `UNAVAILABLE`. The review rows carry `manualReview` and, for non-choice questions, the key text `correctText`
  (post-submission only). The **F-series** final exams (multiple choice + matching + open questions) go through the
  SAME sanitizer, grader, runner and best-score flow: matching keys (`answer.text`, field `correct` flags) never reach
  the student before submission; open questions are `manualReview` rows that the grader keeps in the total, so the
  automatic percentage of an exam with open questions cannot reach 100% (F01 max 98%, F06 max 85%) — the existing
  scoring rule, not a new one.
- **Best-score storage.** `platform/learning-practice/<studentId>.json` (CAS via `mutateJsonWithRetry`), one entry
  per training: `bestPercentage`, `bestPoints = round(best% × 25 / 100)`, `attempts`, `lastCompletedAt`. Retries are
  a **max-merge**: nothing lowers the best, a duplicate never double-awards, concurrent submits converge. The API
  exposes `best` **only once attempted** (`attempts > 0`): a never-attempted training has no `best` (the card says
  «لم تحلّ هذا التدريب بعد» / «ابدأ التدريب»); a real 0% attempt does (`bestPercentage 0, attempts 1` → «أفضل
  نتيجة: 0%» / «أعد التدريب»).
- **Not an assignment.** No assignment record, no due date, no attempt limit, no gradebook row, no medal, no
  teacher review queue. Teacher submissions are graded and returned but never persisted.

### The shared Training Runner and host

- **One runner** — `src/learning/training/LearningTrainingRunner.tsx` — for teacher preview and student practice;
  only the injected `client` (auth headers) and `actor` differ. It reuses `StudentQuestionCard` (no second question
  engine), enables submission once every question is answered, and renders the SERVER's grading: «8 / 10 إجابات
  صحيحة», «80%», «20 / 25 نقاط تقوية» (student), the improvement note, and a per-question review (chosen option,
  right option for wrong answers, hint) marked `is-right` / `is-wrong` with icon + word, plus `is-manual` («لا
  يُصحَّح تلقائيًا», the learner's own text, no key) for open questions. The runner handles every answer kind
  `StudentQuestionCard` emits (choice, sequence, table / matching, text, fields), so the F-series shapes render
  without a second surface (`LearningTrainingRunner.fseries.test.tsx`). «أعد التدريب» restarts without re-fetching.
  The card header shows the canonical library code (`T05`, `F01`, `dir="ltr"`) beside the printed label.
- **One host** — `src/learning/training/LearningReaderWithTraining.tsx` — used by both `StudentReader` and the
  teacher's `LearningMaterialsPage`. It mounts the SAME `LearningReader` with the `training` seam, reads the list
  **once per mount** (and once more when a training closes — never per block), swaps the Reader for the runner and
  remounts it on the **same page** (`initialPageId` / `onPageChange`; never page 1). The portal reloads the
  dashboard once on Reader exit, only if a training was submitted.

### `practice-table` — the authoring standard for inline worksheets

A `table` whose answerable cells are small closed choices, checked in the Reader the moment the learner chooses:

```ts
{ id, type: "practice-table", origin: "book", headers: [...], columnDirs?: [...],
  rows: [["192.168.10.1", { kind: "select", options: ["صالح", "غير صالح"], key: "صالح" }, ""], ...] }
```

- **Data, not code.** The values, the choices and the expected choice are content; `PracticeTableView` is generic
  (no page ids, no address logic, no course names — guarded by a source test). Any future worksheet of any book is
  authored the same way; a page-specific component is a violation.
- **Contract** (validated as `invalid-practice-table` / `invalid-table-row`): non-empty headers; every row matches
  the header count; every select cell has ≥ 2 unique non-empty `options` and a `key` that is one of them; at least
  one select cell (otherwise author a `table`). Cells are strings or select objects — never HTML, never free text.
- **Rendering.** The static table's skeleton (`.learning-reader-tablewrap > table.learning-reader-table`, per-column
  `dir`, LTR isolation) plus a native `<select>` with the neutral «اختر...» placeholder. Verdicts are immediate,
  retryable in place, never colour-only («✓ صحيح» / «✕ غير صحيح — حاول مرة أخرى» with an icon), `role="status"`
  and `aria-describedby` from the select; «امسح الإجابات» resets. State is component-local: **nothing is stored,
  sent or scored, and no Strength points come from inline worksheets**. The key never appears in the DOM.
- **Vocabulary.** The choice words are the printed column's own words (PDF 29 «صالح / غير صالح»; PDF 32 «خاص /
  عام»), and the expected choices follow the book's own rules (PDF 28 / PDF 31). Untouched columns (PDF 29's
  «السبب») stay blank as printed.

### Unified Strength Points (one rank system)

`api/src/lib/student-strength.js` is the ONLY policy; the dashboard returns it as `strength` and the portal renders
it (`src/studentRank.ts` keeps the compatible helpers for the six-rank ladder).

| Source | Points | Rule |
| --- | --- | --- |
| Finalized exam | 100 each | `FINALIZED_EXAM_STRENGTH_POINTS` — the old 4-exam-per-rank boundaries are unchanged (4 × 100 = 400) |
| Training (T01–T30, F01–F06) | up to 25 each | `round(best% × 25 / 100)` — best only; retries never lower it |
| Project | up to 400 each | `round(overallProgress × 400 / 100)` from `core.buildStudentSummary()` — derived, never incremented; a reset lowers it |

- **Ladder:** one step per 400 points — 0–399 none, 400 بذرة القوة (beginner), 800 شعلة صغيرة (bronze), 1200 نمر
  البرق (silver), 1600 فارس الجليد (gold), 2000 تنين النار (diamond), 2400+ العنقاء الذهبية (legendary). The six
  rank images and titles are immutable; there is no seventh level and no second image set.
- **Client authority contract.** The frontend `StudentStrength` type is the exact server payload (points, `tier`,
  `level`, `nextTier`, block progress, projects). `src/student/strengthPresentation.ts` only shapes and labels it
  (`rankPresentationFromStrength`, `progressPresentationFromStrength`): a well-formed payload is trusted as a whole
  and the client never divides, floors or compares `totalPoints` against a threshold; a tier id maps to its label
  and artwork (presentation). No payload at all, or a malformed/incomplete one, falls back **as a whole** to the
  legacy finalized × 100 path through the compatibility helpers of `studentRank.ts` — server fields are never mixed
  with locally recalculated ones. Guarded by `strengthPresentation.test.ts` and
  `StudentPortal.strengthAuthority.test.tsx` (a deliberately inconsistent server payload must render verbatim).
- **Presentation** (Strength language only): «نقاط القوة: N» with the breakdown الواجبات النهائية / التدريبات /
  المشاريع; «التقدم نحو المستوى التالي: X / 400»; «بقي N نقطة قوة للوصول إلى رتبة …» (dual/singular forms). The
  ring shows the within-400 block. The project panel shows «تقدم المشروع: 75%» and «نقاط القوة من المشروع:
  300 / 400» (no second ring, no project rank).
- **Medals are unchanged** (exam-only 70/80/90). Trainings and projects award no medals.
- **Projects:** `programCodes[]` is the authority; every project of the class counts (each ≤ 400); reads go through
  the shared `loadStudentProjects` (bounded concurrency, no scans) that `student-project-tracker` also uses.

### Deliberately NOT in this phase

No page-reading completion; no points for opening pages, clicks or inline worksheet choices; no medals for trainings
or projects; no project rank or second image set; no assignment records for T01–T04; no change to project stage
authority; no leaderboard; no scheduled release; no per-student exceptions; **no Unit 4 conversion**. (The later
Learning-Practice phase connected T05–T30 and F01–F06 under the same rules — still no assignment record, gradebook
row or medal for any of them.)

## Project Performance, Achievement Hub, Achievement Events & Profile Identity

Four connected additions on top of Unified Strength. Each keeps ONE authority and none of them changes assignment
grading, medals, project stage authority, class membership or publication.

### Project Performance (per project, isolated by `programCodes[]` / tracker namespaces)

```text
teacher score (0–100, per stage)   → stage project value  → weighted contribution → project GRADE /100
progress (core.buildStudentSummary) ┐
                                    ├→ project STRENGTH /600 → six-band project rank (the SAME six artworks)
project grade                       ┘
```

- **Stage score** — an additive, optional `score` on the per-student stage entry (`{ status, score, note, updatedAt,
  approvedAt, approvedBy }`), written ONLY by the builder through the canonical `progress.update` pipeline (generic
  and legacy 794589 routes share `service.updateStudentProgress` → `applyProgressUpdate`). Server validation:
  finite `0 ≤ score ≤ 100` (Arabic 400, nothing written); `null` clears. History type `"score"` (`fromScore`,
  `toScore`); audit `project.stage.score` (projectCode / classId / studentId / stageId / oldScore / newScore). No
  migration — legacy entries simply have no score. Status (workflow) and score (quality) are separate.
- **ONE calculator** — `api/src/lib/project-tracker/performance.js`: `calculateStageProjectWeight` (track weight
  share × stage weight share of the track's COUNTED stages — the same trackWeights / stage weights / active +
  required set the progress math uses), `calculateStageWeightedScore` (counted only while approved; a stage moved
  back keeps its score but contributes 0 until approved again), `calculateProjectGrade` (Σ contributions, ≤ 100,
  precision kept — presentation rounds), `calculateProjectStrength` = round((progress + grade) / 200 × 600) clamped
  0..600, `projectStrengthTier` (0–99 بذرة القوة · 100–199 شعلة صغيرة · 200–299 نمر البرق · 300–399 فارس الجليد ·
  400–499 تنين النار · 500–600 العنقاء الذهبية) and `buildProjectPerformanceSummary`. Example: track 50 %, stage 20 %
  of its track → max 10 / 100; score 85 → 8.5. Progress 80 + grade 70 → 450 (تنين النار).
- **Progress vs grade** are independent axes (90 % / 65 and 45 % / 42 are both valid); neither derives from the
  other. Correction / reset lowers grade, Strength and the local rank — no "highest ever" is kept.
- **Surfaces** — `performance` on the teacher student detail and the student project tracker; grade /
  projectStrength / projectTier on teacher cards. Frontend `projectPerformance.ts` only formats and maps a tier id
  to `RANK_VISUALS` (no second artwork set); `ProjectPerformanceCircle` (grade in the centre, progress on the ring,
  textual equivalent) and `ProjectRankHero` («قوة المشروع: X / 600»). Student cards → detail (read-only stage scores
  «العلامة: 85 / 100» / «لم تُرصد بعد», «القيمة في المشروع: 8.5 / 10»); every project's numbers come from the one
  response, so switching never shows a previous project's values. Teacher detail: score control per stage, stale-
  selection guard (only the latest requested student may populate the view).
- **Global Strength stays separate**: the per-project contribution to the GLOBAL Strength is still
  round(overallProgress × 4) ≤ 400 (student-strength.js); the project-specific Strength /600 never feeds it.

### Achievement events (generic, server-decided)

- **Schema** (`api/src/lib/achievement-feed.js`): `{ schemaVersion, eventType, postId, classId, studentId,
  studentDisplayName, createdAt, shareWithClass, medal? | rank? | project?, reactions, teacherReaction, teacherNote }`
  with `eventType ∈ medal | global_rank_up | project_rank_up | project_complete`. Legacy posts without `eventType`
  normalize as `medal` (no migration; their legacy fields stay). ONE public projection (`publicPost`) serves both
  feeds. Ids are deterministic and create-only, ending `_<studentId>`: `<assignmentId>_<studentId>`,
  `global_rank_<tier>_<studentId>`, `project_<code>_rank_<tier>_<studentId>`, `project_<code>_complete_<studentId>`.
- **Milestones** (`achievement-milestones.js`) — React never decides: the global rank-up is observed at the one
  place the total Strength is built (the student dashboard) against `platform/recognition/<studentId>.json`
  (first sight = baseline only, so an already-earned rank is never posted retroactively; a NEW tier → exactly one
  event; a jump → one event for the final tier; a decrease → nothing; steady state write-free). Project rank-up /
  completion come from the before/after documents of a real progress write (both tracker routes), per project,
  idempotent, never on a lowering correction. Small changes (+2 %, a score edit, one status) create nothing.
- **Privacy** — new events are stored regardless of the sharing flag; `shareWithClass` (from `shareAchievements`)
  governs classmates: the owner always sees their own, the teacher sees every managed student's event, a classmate
  sees (and can react to) only shared events. Reacting to your own or an unshared event is refused.
- **Reactions** — unchanged types (heart / clap / cheer / fire), one active per student, toggle / replace, CAS-safe,
  on every event type; the teacher reacts / notes through the generalized teacher feed. Reactions and events never
  alter Strength, project Strength, grade, progress or medals (recognition only).
- **Recognition summary** — `aggregateRecognition` is the ONE aggregation behind the roster `likesCount` and the
  dashboard `recognition`: it lists blob NAMES under the global `platform/feed/` prefix (every class), keeps only the
  names whose post id ends in `_<studentId>.json` for the requested students (plus legacy ids without a suffix), and
  downloads only those posts — a name listing across the whole feed, never a full download. Counts: reactions
  RECEIVED (by type + total, never sent), non-medal achievements (by type), medal counts from the finalized
  authority. Lifetime, not the visible 30 posts.
- **Feed wording** (`achievements.feedEventParts`, shared by the student feed and the teacher dashboard):
  «حصلت ليان على ميدالية ذهبية في …», «تقدّم كريم إلى تنين النار — المستوى 5», «تقدّمت هاجر في مشروع AquaSense إلى
  نمر البرق», «أكمل أحمد مشروع SecureBank». Section: «أحدث الإنجازات والتقدّم في صفك»; empty: «عندما يحقق أحد طلاب
  الصف إنجازًا سيظهر هنا.»

### Student Achievement Hub («تقدّمي وقوتي»)

The global rank artwork stays central (level, %, «نقاط القوة» + the الواجبات النهائية / التدريبات / المشاريع
breakdown) and three separate recognition tiles follow — الميداليات · التفاعلات (received, per-type detail) ·
الإنجازات — never summed into one number: Strength = academic progression, medals = finalized assessment, reactions
= social appreciation received, achievements = meaningful milestones. The teacher's student profile shows the same
concise line-up (rank + Strength, the three counts, per-project progress) from the same server authorities.

### Student profile photo (teacher-managed) and preset avatar (student)

- `profilePhoto` (real photo) is separate from `avatarId` (preset). Display precedence, ONE component
  (`ProfileAvatar` / `avatarSource`): photo → selected preset → default initial. A student can never upload,
  replace or delete a photo (the picker is preset-only and explains «الصورة الشخصية يحددها المعلم…» when a photo
  exists); the teacher photo endpoint refuses a student token (403).
- **Teacher entry point**: الصفوف والطلاب → ⋯ → تعديل → «صورة الطالب» (circular preview, اختيار / استبدال / إزالة,
  preview / loading / error / success, no reload). `POST /api/student-profile-photo` (upload / remove, builder only,
  audited `student.photo.upload` / `student.photo.remove`). **Lifecycle policy**: the same as «تعديل تفاصيل الطالب» —
  the teacher may edit an ARCHIVED student's identity (only account activation is blocked while archived), so photo
  upload / remove are allowed for archived students too (pinned by test).
- **Retrieval authority**: `GET` serves the bytes to the teacher (any student) or to the student for their OWN photo
  only, through the HARDENED student session (`requireActiveStudentSession`: signed token → CURRENT persisted
  document → `active !== false` → `archived !== true` → token `sv` === `authVersion`); a revoked / inactive / archived
  token is 401 like the rest of the portal, naming another id is 403. `?v=` is cache-busting context only — the
  committed metadata selects the blob.
- **ONE safe image service** (`api/src/lib/profile-image.js`, sharp): ≤ 3 MB, JPEG / PNG / WebP by REAL bytes (SVG,
  GIF, PDF, HTML, text, arbitrary binary, URLs rejected), decoded (a fake signature fails), EXIF-orientation-aware
  resize to a ≤ 512 square, WebP re-encode with EXIF / ICC / XMP stripped.
- **ONE publication authority** (`api/src/lib/profile-photo-store.js`, shared with the teacher photo). The active photo
  is exactly the IMMUTABLE blob the committed metadata references; blobs are never overwritten in place:
  - storage `platform/student-profile-images/<studentId>/<time36>-<24 hex>.webp` (one immutable revision per
    publication); persisted `profilePhoto: { version, updatedAt, blobKey }` + `profilePhotoSeq` (monotonic counter,
    kept across removals so a re-published photo never reuses a cache version); PUBLIC shape everywhere (route
    responses, roster, dashboard, teacher profile) is `{ version, updatedAt }` only — no blob key, no URL, no SAS;
  - **publish** = normalize → upload a NEW revision (unreferenced) → CAS-commit the metadata to that exact key → only
    then best-effort delete the previously referenced revision. Success ⇔ the metadata points at the new derivative;
    a metadata CAS failure ⇒ 503, the previously published metadata AND bytes stay the active photo, the orphan is
    deleted best-effort;
  - **remove** = CAS-clear the metadata FIRST → only after success best-effort delete the revision it referenced. A
    CAS failure ⇒ old metadata + old photo remain usable; the active blob is never deleted before its authority is
    cleared;
  - **cleanup is secondary**: a leftover / orphan revision is never served (the metadata decides) and a failed cleanup
    never alters the authoritative metadata; permanent student delete purges the current revision and every other blob
    under the student's photo prefix, best-effort, never blocking the core delete;
  - concurrency: two overlapping replacements both commit through the real CAS retry (one exact final key, GET serves
    it, no unreferenced revision left); upload vs remove ends either with metadata → existing blob or with no metadata
    and nothing served — never a dangling reference, never hidden byte changes (pinned by tests).
  Roster / dashboard carry metadata only (no N+1: bytes load in the edit dialog and for the student's own identity).

### Teacher identity (name · preset avatar · own photo)

- **Audit**: one builder identity (`BUILDER_USER_CODE`, token `sub`), display name hard-coded «المعلم», no profile
  document → the minimal canonical self-profile `platform/teacher-profiles/<sub>.json { displayName, avatarId,
  profilePhoto: { version, updatedAt }, updatedAt }` was introduced. The teacher id is ALWAYS the verified token
  subject (a body `teacherId` / `targetTeacherId` is ignored). Name authority: profile `displayName` → configured
  `TEACHER_DISPLAY_NAME` → «المعلم», reported by `platform-login` / `platform-session` (storage failure → fallback).
- `GET/POST /api/teacher-profile` (setAvatar — the same preset allow-list as students, setDisplayName 1–60,
  uploadPhoto, removePhoto) + `GET /api/teacher-profile-photo` (own photo): builder only, student 403, anonymous
  401, audited. The photo uses the SAME image service and the SAME `profile-photo-store` publication / removal
  authority as the student photo (immutable revisions under `platform/teacher-profile-images/<sub>/`, CAS-committed
  `profilePhoto: { version, updatedAt, blobKey }` in the profile document, public `{ version, updatedAt }` only,
  identical success / failure semantics, monotonic versions, best-effort cleanup).
- Sidebar: identity block under the brand (ExamBank / 791381 kept): photo → preset → initial as the button
  «تعديل صورة وملف المعلم» + the name; compact rail / tablet keep the avatar only; drawer readable. «ملف المعلم»
  dialog (shared Dialog: focus trap, Escape, focus return): preset grid, upload / replace / remove, optional name.
  App reads the profile once per teacher session.
- **Authorization summary**: student real photo = teacher only · student preset avatar = student · teacher own
  photo / avatar / name = teacher self-service only.

### Deliberately NOT in this phase

No Unit 4 / PDF 34+; no leaderboard; reactions and medals never create Strength; students never set a stage score,
never upload a personal photo, never use an arbitrary avatar URL; photo blobs are never public; no project-specific
artwork set; membership authorities unchanged; assignment grading unchanged; the teacher self-profile API never
targets another teacher.

## Units 4–6 — CIDR, Devices & Topologies (source PDF 34–60)

The first content phase after the Reader, Class Learning Materials and Unified Strength slices: three complete book
units converted **in exact book order** from the authoritative teacher PDF (`Book791381.pdf`, 264 pages, never
bundled). Every source page was reviewed against the rendered PDF before authoring. Conversion **stops before PDF 61**
(Unit 7): no page body has `pdfPageStart >= 61`, and a test asserts it.

### Source map and module structure

| Unit | Source PDF | Module (immutable id) | `order` | Batch | Lessons |
| --- | --- | --- | --- | --- | --- |
| 4 «Class و Subnet و CIDR» | **34–46** | `791381-m08` | 4 | b1 | `l00` افتتاحية (34) · `l01` فئات العناوين والقناع الطبيعي (35–39) · `l02` جزء الشبكة وجزء الجهاز و CIDR (40–42) · `l03` الأجهزة في نفس الشبكة والبوابة الافتراضية (43–46) |
| — divider | **47** | (no learner page) | — | — | The second-batch divider sheet; recorded only as `m09.source.pdfPageStart: 47` + `sourceNote`, never rendered |
| 5 «أجهزة الشبكات» | **48–56** | `791381-m09` | 5 | b2 | `l00` افتتاحية (48) · `l01` Hub و Switch (49–53) · `l02` Router (54–55) · `l03` خلاصة الأجهزة (56) |
| 6 «أنواع شبكات الاتصال» | **57–60** | `791381-m10` | 6 | b2 | `l00` افتتاحية (57) · `l01` الشبكات البسيطة والتقليدية (58–59) · `l02` الشبكات الحديثة (60) |

- **1 source page → 1 interactive page**, no splits or merges, page ids `791381-mNN-lNN-pNN` authored once and
  immutable. Every body page records `source.pdfPageStart` (and `printedPage`, see below); every faithful block
  is `origin:"book"`, every added solved example / guided walkthrough / practice / activity is
  `origin:"teacher-enrichment"` with a source association. Module bodies register as their own lazy chunks
  (`m08`, `m09`, `m10` in `src/learning/content/registry.ts`); the batch b1 overview now lists
  `[m01, m02, m07, m08]` and b2 `[m09, m10]` (b3/b4 unchanged).
- **Historical skeleton m03–m06 untouched.** Ids, titles and PDF mappings are pinned by tests; only their explicit
  `order` shifts to 7–10 (previously 4–7) because m08–m10 are inserted at orders 4–6. As with m07, module ids are
  not unit numbers.
- **Rendered title.** The Unit-4 opener prints «CIDR و Subnet و Class» (LTR reading). It is authored as the logical
  RTL string «Class و Subnet و CIDR» (rightmost word first), the same rule as m07's «Static IP و Dynamic IP».
- **Printed page number (documented discrepancy, not silent).** The rendered page circle on PDF 35–60 shows the
  PDF index itself (PDF 35 renders «35»); an overlapping hidden text-layer number (PDF−2) exists underneath and is
  what m01 / m02 / m07 recorded as `printedPage` (e.g. PDF 24 → printed 22). m08–m10 record the **rendered**
  value (`printedPage === pdfPageStart`) because that is the number a teacher sees on the page; the older modules
  are left as recorded. Unit openers and PDF 46 (a closing summary page without a printed number) carry no
  `printedPage`.
- **PDF 44's answer column stays blank** (`origin:"book"` table exactly as printed); the checkable version is a
  separate `origin:"teacher-enrichment"` `practice-table` whose keys keep the network part and differ from PC1.
  PDF 36 / 39 worksheets are `practice-table` blocks whose keys follow the page's own class rule.

### Pedagogical standard applied (with judgment, never mechanically)

Every concept page follows **explanation → solved example → guided practice → independent practice → immediate
feedback («ماذا أفحص؟») → short summary** where the source page supports it. Totals:

| Module | Solved examples (`example`, `mode:"solved"`) | Guided walkthrough | Inline practices (`practice`) | Worksheet tables (`practice-table`) | Activities |
| --- | --- | --- | --- | --- | --- |
| m08 | 9 | 1 (`m08-l02-p01-guided`, /16 on 172.18.200.100) | 11 | 3 | 2 |
| m09 | 1 | — | 8 | 1 (device-feature matching) | 1 |
| m10 | 1 | — | 3 | 1 (topology matching) | 1 |

Inline practices are **educational only**: nothing is stored, scored, ranked or turned into a medal, assignment or
Strength; no T05+ training exists. Every practice carries `feedback.hint` / `incorrectFeedback` telling the student
**what to check** (the class rule, the mask, the prefix, the network part) rather than the answer.

### Interactive inline practice — `PracticeBlockView` (Phase-4 first slice, Reader-local)

The static Phase-3 practice preview is replaced by `src/learning/reader/PracticeBlockView.tsx`: MCQ / true-false
options are real `role="radio"` buttons, short-input practices are a form with «تحقّق», answers are checked in the
browser by the Phase-3A `localEvaluator`, and the verdict is announced in a `role="status"` region
(«✓ صحيح» / «✕ غير صحيح — حاول مرة أخرى») with the block's `correctFeedback` / `incorrectFeedback`, the explanation
on success, the `hintLadder` behind «ماذا أفحص؟ (تلميح)» → «تلميح آخر», and «امسح الإجابة». A practice without a
key, or of a kind whose answering surface is not implemented in the view yet (`fillBlank`, even when keyed), renders
the old static surface — never a prompt with an interactive footer and no field. State lives in React memory only; no network, no persistence, no score, no
Strength — the answer key is compared locally and never displayed as a key.

### Four registry-backed activities (`productionActivityRegistry` = exact six-entry allowlist)

| Activity | `{kind, key, version}` | Page | Renderer (own lazy chunk) |
| --- | --- | --- | --- |
| A — CIDR network/host visualizer | `interactive-diagram / cidr-network-host / 1` | PDF 40 (`m08-l02-p01-visualizer`) | `CidrNetworkHostDiagram` — pick /8, /16 or /24 on the book's examples; the network part and host part of the four octets are highlighted and named |
| B — Default-gateway flow | `animation / gateway-flow / 1` | PDF 45 (`m08-l03-p03-flow`) | `GatewayFlowAnimation` — a packet leaves PC1 for a local host directly, and for an outside address via the Switch → Router (192.168.1.1) hop by hop; replay/reset |
| C — Hub vs Switch vs Router | `simulation / hub-switch-router-flow / 1` | PDF 49 (`m09-l01-p01-sim`) | `HubSwitchRouterFlow` — the same PC1 → PC3 frame through a Hub (all ports), a Switch (target port only) and a Router (between networks) |
| D — Topologies explorer | `interactive-diagram / network-topologies / 1` | PDF 60 (`m10-l02-p01-explorer`) | `NetworkTopologiesExplorer` — p2p / bus / ring / star / tree / hybrid with the book's collision note for Bus |

Shared contract (tested per renderer): trusted registry key + positive version, statically-authored `import()`
thunk, the descriptor's faithful `ActivityFallback` when the registry is injected empty or the chunk fails,
`reducedMotion` jumps straight to the final state (no timers), every control is a real ≥44px keyboard-operable
button with `aria-pressed` and a visible mark (never colour-only), state is stamped with the shell's
`commands.reset` / `commands.replay` epochs, live text mirrors the visual (`aria-live`) as plain prose «من <المرسل>
إلى <المستقبل>» — sender first, receiver second, never an arrow glyph inside a mixed Arabic/Latin string, so a
screen-reader user gets the same direction as the animation — single-column at phone width. The earlier "EMPTY" / "two-entry allowlist" statements in the Phase 3A / 3E sections are historical; the Units 7–8 phase brings the allowlist to ten entries.

### Publication: deployable ≠ published

`api/src/lib/learning-materials-registry.js` now lists `m08` (order 4), `m09` (order 5) and `m10` (order 6) with
titles only, so the teacher's catalog shows them as «مخفي عن الطلاب» and `validateLearningModuleIds` accepts them in
canonical order. **Nothing is auto-published:** deployment changes no class document, `visibleModuleIds` are
untouched, and a real-registry test proves a class that released `[m01, m02, m07]` still exposes none of m08–m10 to
its students until the teacher publishes them explicitly.

### Deliberately NOT in this phase

No leaderboard, no page-reading Strength, no medals for inline practices, no new rank levels, no project scoring
change, no T05+ trainings, no AI tutor, no CMS, no change to Project Performance / Achievement Hub / profile photo,
and **no Unit 7 (PDF 61+)**.

## Units 7–8 — Cables, MAC & Message Types (source PDF 61–75)

The second content phase after Units 4–6, converted as one **complete logical learning unit**: cables → MAC →
Unicast / Multicast / Broadcast → the broadcast address → protocols that use Broadcast → storage units → message
fields → the Broadcast message → the book's batch-2 summary. Every page of PDF 61–75 was rendered and reviewed
against the source before authoring. Conversion **stops before PDF 76** (batch 3: OSI · TCP/IP · TCP/UDP …); no page
body has `pdfPageStart >= 76` and a test asserts it.

### Source map and module structure

| Unit | Source PDF | Module (immutable id) | `order` | Batch | Lessons |
| --- | --- | --- | --- | --- | --- |
| 7 «الكوابل وعنوان MAC» | **61–65** | `791381-m11` | 7 | b2 | `l00` افتتاحية (61) · `l01` كوابل الشبكة (62–63) · `l02` عنوان MAC واستخداماته (64–65) |
| 8 «أنواع الرسائل» | **66–74** | `791381-m12` | 8 | b2 | `l00` افتتاحية (66) · `l01` Unicast / Multicast / Broadcast (67–69) · `l02` عنوان Broadcast والبروتوكولات (70–71) · `l03` وحدات التخزين ومبنى الرسالة (72–74) |
| batch-2 summary | **75** | `791381-m12` · `l04` خلاصة الدفعة الثانية | — | b2 | one learner-visible summary page (`conversionNote`), not a fake unit; its «الدفعة التالية» line is kept as printed |

- **1 source page → 1 interactive page**, page ids `791381-mNN-lNN-pNN` authored once and immutable. Faithful blocks
  are `origin:"book"`; clarifications, solved examples, activities, worksheets and practices are
  `origin:"teacher-enrichment"`. Both bodies register as their own lazy chunks (`m11`, `m12`).
- **Historical skeleton m03–m06 untouched**: ids, titles, lesson/page ids and PDF mappings pinned; only their explicit
  `order` shifts to 9–12. **b2** «الأجهزة والرسائل» now lists `[m09, m10, m11, m12]`; **b3** stays empty until PDF 76+.
- **Printed page numbers** follow the Units 4–6 decision: the rendered page circle (PDF 62 → «62» … PDF 74 → «74»);
  the two openers (PDF 61, 66) and the summary (PDF 75) print none and carry no `printedPage`.
- **Transparent normalization (documented, not silent):** PDF 68 prints «مصدر واحد ← هدف واحد» / «مصدر واحد ← مجموعة
  محدّدة» with an arrow glyph; the page renders the same meaning as prose «من مصدر واحد إلى هدف واحد» under the
  permanent «من X إلى Y» rule. PDF 64's facts mention «الطبقة الثانية من نموذج OSI» and PDF 75 names the next batch;
  both are kept as printed, and nothing from PDF 76+ is taught. **Source order inside the phase is sacred too:** the
  broadcast MAC on PDF 64 is named exactly as the book names it (m11 never says who receives a broadcast — that is
  Unit 8), and the message-delivery simulation sits on PDF 69, after the Broadcast / Router-boundary facts, not on
  PDF 67 where only the receiver-count distinction is taught.
- **Book level preserved:** no OUI/vendor or bit-level MAC structure; no cable categories, speeds or distances;
  broadcast addresses at whole-octet **/8 /16 /24 only**; storage units by the book's **1024** convention (never 1000);
  RIP v1 = Broadcast / RIP v2 = Multicast exactly as printed.

### The permanent mixed RTL/LTR rule

Technical values (MAC, IP, Hub, Switch, Router, UTP, STP, Fiber Optic, Coaxial, Broadcast, `192.168.1.1`,
`FF:FF:FF:FF:FF:FF`) are LTR code spans inside Arabic prose, and LTR table columns where tabular. **Semantic traffic
direction in text is always prose «من X إلى Y»** — never an arrow glyph inside a mixed Arabic/Latin string — in
aria-live mirrors, textual equivalents of animations and explanatory flow sentences. Visual diagram arrows are allowed
where the direction is visually explicit. Content tests ban `←` / `→` from m11 and m12 entirely.

### Pedagogy applied

| Module | Solved examples | Clarifications | Inline practices | Worksheets (`practice-table`) | Closing review | Activities |
| --- | --- | --- | --- | --- | --- | --- |
| m11 | 3 | 2 | 13 | 1 (four cables) | 3 exam-style questions on PDF 65 | 2 |
| m12 | 5 | 5 | 21 | 3 (protocols, storage units, message classification) | 4 items on PDF 74 + 2 batch-review questions on PDF 75 | 2 |

Practices are educational only (nothing stored, scored or ranked; no T05+); every wrong-answer feedback says what
to **check** («افحص …») and every question carries a hint ladder. Keyed `fillBlank` is not used (no interactive UI).

### Four registry-backed activities (`productionActivityRegistry` = exact TEN-entry allowlist)

| Activity | `{kind, key, version}` | Page | Renderer (own lazy chunk) |
| --- | --- | --- | --- |
| A — cable comparison / chooser | `interactive-diagram / cable-comparison / 1` | PDF 63 (`m11-l01-p02-chooser`) | `CableComparisonDiagram` — four cable tabs with the book's traits (text list + schematic cross-section), then teacher-enrichment scenarios (classroom / noisy workshop / long fast link / cable TV) with an immediate verdict and «افحص صفات …» on a wrong pick |
| B — MAC address anatomy | `interactive-diagram / mac-address-anatomy / 1` | PDF 64 (`m11-l02-p01-anatomy`) | `MacAddressAnatomy` — `A0:02:AF:2D:10:22` as six LTR two-digit groups (12 hex digits stated in words), group press names its digits, the broadcast toggle shows `FF:FF:FF:FF:FF:FF` = «للجميع», a "which string has the MAC shape?" task |
| C — message delivery | `simulation / message-delivery / 1` | PDF 69 (`m12-l01-p03-sim`), after the book's Broadcast + Router-boundary facts | `MessageDeliverySimulation` — Unicast (exactly one receiver), Multicast (the selected group), Broadcast (every local device) from PC1 via Switch; receiver count line; the **Router boundary marked «يتوقّف هنا» in words** — a normal Broadcast never crosses |
| D — broadcast address builder | `interactive-diagram / broadcast-address / 1` | PDF 70 (`m12-l02-p01-builder`) | `BroadcastAddressBuilder` — the book's five rows as examples (network/host text badges, the resulting address), then guided attempts: toggle host octets to 255 → «تحقّق»; feedback names the octet to check; «أظهر الحل»; /8 /16 /24 only |

Shared contract (tested per renderer): trusted registry key + positive version, statically-authored `import()`
thunk, faithful `ActivityFallback` when the registry is injected empty or the version is unsupported (fallbacks never
expose answer keys), `reducedMotion` renders the final state at once (no timers), real ≥44px keyboard-operable
buttons with `aria-pressed` / radio semantics and a visible mark, shell `commands.reset` / `commands.replay`
epochs, prose text mirrors, single-column at phone width. Timers exist only in the simulation (and are skipped under
reduced motion).

### Publication: deployable ≠ published

`api/src/lib/learning-materials-registry.js` lists `m11` (order 7) and `m12` (order 8) with titles only. Nothing is
auto-published: a real-registry test proves a class released only through m10 exposes none of m11/m12 to its
students, that a stale id the class never published stays hidden, and that the teacher's `[m12, m11]` canonicalizes
to `[m11, m12]`.

### Deliberately NOT in this phase

No PDF 76+ (OSI, TCP/IP, TCP vs UDP, protocol commands), no T05+, no medals for learning practice, no Strength for
page practice, no leaderboard, no project scoring / Achievement Hub / profile identity / teacher login changes, no
change to the approved m08–m10 content.

## Batch 3 — نماذج الاتصال: OSI و TCP/IP (source PDF 76–86)

The third content phase after Units 7–8. Its boundary was **discovered from the book, not assumed**: PDF 76 is the
batch-3 divider («الدفعة الثالثة · نماذج الاتصال والبروتوكولات والأمان …», a structural page like PDF 47), PDF 77–86
is the section «نماذج الاتصال · OSI و TCP/IP» (OSI → its seven layers → lower / upper layers → TCP/IP → its four
layers → the comparison → TCP و UDP → when TCP → when UDP), and PDF 87 opens the **next** section «البروتوكولات ·
أهم البروتوكولات» (DNS / HTTP / DHCP …, then «أوامر فحص الشبكة» from PDF 93). The section is converted as one
complete module and conversion **stops before PDF 87**: no page body has `pdfPageStart >= 87` and tests assert it
for m13 and for the whole real course. This batch has **no «الوحدة N» opener page** in the book, so none is invented:
the section header is the module title and PDF 76 is represented only by the module's coarse source range
(`pdfPageStart: 76` + `sourceNote`), never as a learner page.

### Source map and module structure

| Section | Source PDF | Module (immutable id) | `order` | Batch | Lessons |
| --- | --- | --- | --- | --- | --- |
| «نماذج الاتصال: OSI و TCP/IP» | **76 (divider) · 77–86** | `791381-m13` | 9 | b3 | `l01` نموذج OSI (77–80) · `l02` نموذج TCP/IP (81–83) · `l03` TCP و UDP (84–86) |

- **1 source page → 1 interactive page** (ten pages, PDF 77…86), page ids `791381-m13-lNN-pNN` authored once and
  immutable; the body registers as its own lazy chunk (`m13`). Faithful blocks are `origin:"book"` (29 blocks);
  clarifications, solved examples, the explorer, worksheets, practices and the closing review are
  `origin:"teacher-enrichment"`.
- **Printed page numbers** follow the rendered page circle (PDF 77 → «77» … PDF 86 → «86»); the divider prints none.
- **Historical skeleton m03–m06 untouched**: ids, titles, lesson/page ids and PDF mappings pinned; only their explicit
  `order` shifts to 10–13. **b3** «النماذج والبروتوكولات والأمان» now lists `[m13]` (it was empty after Units 7–8);
  b1/b2/b4–b6 unchanged. (This supersedes the "b3 stays empty" and "TEN-entry allowlist" statements in the Units 7–8
  section above, which describe that phase as delivered.)
- **Source order inside the section is sacred (tested):** TCP / UDP are only *named* as layer-4 tokens on PDF 78–79;
  their reliability / speed semantics («موثوق», «سريع», «يتأكّد», «يضمن» …) appear on PDF 84–86 only. The four TCP/IP
  layers (Internet, Link, «4 طبقات») never appear on the OSI pages (PDF 77–80). OSI layer *functions* follow the
  book's page order (PDF 78 names + tokens only; PDF 79 the lower four; PDF 80 the upper three). Protocol functions
  (PDF 87–92: DNS, DHCP, TFTP, SSH, Telnet, NAT, HTTPS, POP, IMAP, ICMP, ARP …) and network commands (PDF 93+: ping …)
  never appear; HTTP / FTP / SMTP are printed only as bare example names exactly where the book prints them (PDF 80,
  85).
- **Book level preserved:** no port numbers, no handshake / header structure, no PDU names beyond the book's Frame /
  Packet, no encapsulation walkthrough; the comparison keeps the book's 7-row figure (upper three → Application,
  Network → Internet, Data Link + Physical → Link).
- **Transparent normalization (documented, not silent):** the book's send-down / receive-up memorisation rule is kept
  as prose «عند الإرسال ننزل من 7 إلى 1، وعند الاستقبال نصعد من 1 إلى 7» under the permanent «من X إلى Y» rule; the
  content tests ban `←` / `→` from m13 entirely, and the explorer's direction radios read «إرسال: من 7 إلى 1» /
  «استقبال: من 1 إلى 7».

### Pedagogy applied

| Module | Solved examples | Clarifications | Inline practices | Worksheets (`practice-table`) | Closing review | Activities |
| --- | --- | --- | --- | --- | --- | --- |
| m13 | 4 (send/receive order · MAC vs IP layer · Session in TCP/IP · file vs live stream) | 4 | 20 (every page ends with practice) | 2 (OSI → TCP/IP mapping on PDF 83 · TCP-or-UDP cases on PDF 86) | 3 exam-style questions on PDF 86 | 1 |

Practices are educational only (nothing stored, scored or ranked; no T05+); every wrong-answer feedback says what to
**check** («افحص …») and every question carries a two-step hint ladder. Keyed `fillBlank` is not used.

### One registry-backed activity (`productionActivityRegistry` = exact ELEVEN-entry allowlist)

Only one activity was added, because only one place in the section benefits from interaction beyond a table: the
seven-layer stack, once all seven layers are introduced. The OSI ↔ TCP/IP comparison stays a table + keyed worksheet
and TCP vs UDP stays cards + a keyed worksheet (an animation there would add nothing the book teaches).

| Activity | `{kind, key, version}` | Page | Renderer (own lazy chunk) |
| --- | --- | --- | --- |
| OSI layers explorer | `interactive-diagram / osi-layers / 1` | PDF 80 (`m13-l01-p04-explorer`), after the Session / Presentation / Application cards and the «الفكرة» line, before the page's practices | `OsiLayersExplorer` — the book's stack drawn top (7) to bottom (1) as real buttons (number · name · Arabic · token), upper/lower groups named in words; pressing a layer shows its function as TEXT in a `role="status"` region (the PDF 79–80 wording, from the block's `config`); an «إرسال» / «استقبال» radio applies the PDF 78 rule by renumbering the steps (send: layer 7 = الخطوة 1; receive: layer 1 = الخطوة 1) and swapping the prose note. No timers, no protocol functions, no persistence; malformed config (duplicate numbers, fewer than two layers) → a note; unsupported version → the faithful static fallback |

Shared contract (tested): trusted registry key + positive version, statically-authored `import()` thunk (pinned by
`engine.test.ts` / `activities.guards.test.ts`, allowlist size 11), faithful `ActivityFallback`, `reducedMotion`
reflected as `data-reduced-motion`, real keyboard-operable buttons with `aria-pressed` / radio semantics, shell
`commands.reset` epoch, no network, single-column at phone width.

### Publication: deployable ≠ published

`api/src/lib/learning-materials-registry.js` lists `m13` (order 9, title only). Nothing is auto-published: a
real-registry test proves a class released through m12 exposes nothing of m13 to its students, that an explicitly
published m13 is visible, and that the teacher's `[m13, m12]` canonicalizes to `[m12, m13]`.

### Deferred PR #122 follow-ups applied here

- `LearningPageRenderer.tsx`'s injection-seam comment no longer states a count; it points at the enumerated,
  test-pinned allowlist in `activities/engine.ts` (a count there went stale twice).
- The m11 «no Unit-8 delivery semantics» guard is now applied to **every block of m11** (all pages, configs and
  fallbacks), not only to the eleven blocks around the broadcast MAC; the whole module was verified clean first.

### Deliberately NOT in this phase

No PDF 87+ (protocol functions, network commands, collisions / attacks), no T05+, no medals / Strength / leaderboard
for page practice, no project / Achievement Hub / identity / login changes, no change to the approved m01–m12 content
(m11 only gains a wider test), no change to any class's `visibleModuleIds`.

## Batch 4 — البروتوكولات · أوامر فحص الشبكة · المجالات والمفاهيم (source PDF 87–106)

The fourth content phase, deliberately **larger** than Batch 3 (twenty pages, three sections, three modules). The
boundary was discovered from the book: PDF 87 opens «البروتوكولات» («أهم البروتوكولات»), PDF 93 opens
«أوامر فحص الشبكة» (ping), PDF 98 opens «المجالات والمفاهيم» (Collision Domain), PDF 106 is that section's closing
«تدريبات مراجعة سريعة» page, and **PDF 107 is the book's «الجزء الثاني · أمان الشبكات» part cover** — a structural page
that starts network security (108–115), then «تجزئة البيانات» (116–118), the end-of-batch trainings (119) and the
fourth batch cover «برمجة السويتش و VLAN» (120, whose pages are the historical m03 skeleton from PDF 123). Conversion
**stops before PDF 107**: no page body has `pdfPageStart >= 107` and tests assert it for the batch and for the whole
real course. Every page in the range is learner-facing (no divider inside 87–106), so structural range = learner range.

### Source map and module structure

| Section | Source PDF | Module (immutable id) | `order` | Batch | Lessons |
| --- | --- | --- | --- | --- | --- |
| «البروتوكولات» | **87–92** | `791381-m14` | 10 | b3 | `l01` ما هو البروتوكول؟ · DNS / HTTP / DHCP (87–88) · `l02` SMTP / FTP / TFTP · SSH / Telnet / NAT (89–90) · `l03` HTTPS / POP / IMAP / ICMP / ARP · نوع النقل (91–92) |
| «أوامر فحص الشبكة» | **93–97** | `791381-m15` | 11 | b3 | `l01` ping و ipconfig (93–94) · `l02` tracert و nslookup و arp (95–97) |
| «المجالات والمفاهيم» | **98–106** | `791381-m16` | 12 | b3 | `l01` مجال التصادم (98–99) · `l02` مجال البث (100–101) · `l03` STP و Duplex (102–103) · `l04` Localhost و APIPA (104–105) · `l05` تدريبات مراجعة سريعة (106) |

- **1 source page → 1 interactive page**, twenty pages, printed page = the rendered page circle = PDF index (87…106).
  Three separate modules because the book has three separate running headers; no numbered «الوحدة N» exists in
  the range and none is invented. Each body is its own lazy chunk (`m14`, `m15`, `m16`).
- **PDF 106** («تدريبات مراجعة سريعة») is kept as a learner-visible closing page with a `conversionNote`: the three
  cards that group the book's electronic trainings 5–12 by topic and the QR note are the book's own text; the QR
  codes live in the printed book; since the Learning-Practice T05–T30 phase the page also carries `library-training`
  blocks `lt05..lt12` (Reader position 98, one per library id, grouped 5–6 / 7–8 / 9–12). The section's closing
  review follows on that page.
- **Historical skeleton m03–m06 untouched**: ids, titles, lesson/page ids and PDF mappings pinned; only their explicit
  `order` shifts to 13–16. **b3** «النماذج والبروتوكولات والأمان» now lists `[m13, m14, m15, m16]`.
- **Protocol fidelity (PDF 87–92):** every protocol carries exactly the book's one-sentence function and its short
  badge — DNS, HTTP, DHCP, SMTP, FTP, TFTP, SSH, Telnet, NAT, HTTPS, POP / IMAP, ICMP, ARP — plus the PDF 92
  transport table (six rows, «UDP غالبًا» for DNS) and «القاعدة». No port numbers, message formats, handshakes or
  security comparisons beyond the book's «SSH آمن / Telnet غير آمن» and «HTTPS نسخة آمنة». The book's two arrow
  badges («google.com → IP», «داخلي → عام») are rendered as prose «من … إلى …».
- **Command fidelity (PDF 93–97):** exactly the five commands the book prints, each as a `code` block with the
  book's syntax line (`ping google.com`, `ipconfig /all`, `tracert google.com`, `nslookup google.com`, `arp -a`,
  LTR CLI) and its one-sentence «الوظيفة»; the PDF 93 «تطبيق سريع» and «خطأ شائع»; the repeated «أوامر الشبكة» /
  «تذكّر» boxes. The book prints **no terminal output**, so none is invented (a test bans `Reply from`, `TTL`,
  `Request timed out`, OS names and extra switches). No traceroute / netstat / route (not in the book).
- **Source order inside the batch (tested):** protocols appear page by page (87 names none; 88 DNS/HTTP/DHCP; 89
  adds SMTP/FTP/TFTP; 90 adds SSH/Telnet/NAT; 91 adds the rest); the ping *command* never appears in m14 (`ping` is
  printed there only as the book's ICMP example on PDF 91); each command appears from its own page only; domain
  concepts (Collision / Broadcast Domain, STP, Duplex, Localhost, APIPA) never appear in m14/m15 and inside m16 only
  from their pages; VLAN is named only where PDF 100–101 print it (as a separator of Broadcast domains), never
  configured.
- **Next-part leakage guard (semantic, all block fields):** attacks (القرصنة, DoS/DDoS, Hijacking, MitM, Phishing,
  Spoofing), VPN / SSL / TLS, Segment / تغليف / غلاف, the 3-way handshake (SYN/ACK), and switch-CLI / VLAN
  programming (Trunk, Dot1Q, VTP, `configure terminal`, `F0/1`, Access) are banned from m14–m16.

### Pedagogy applied

| Module | Solved examples | Clarifications | Inline practices | Worksheets (`practice-table`) | Closing review | Activities |
| --- | --- | --- | --- | --- | --- | --- |
| m14 | 2 | 3 | 14 | 2 (protocol → purpose on PDF 91 · protocol → TCP/UDP on PDF 92) | 3 on PDF 92 | 0 |
| m15 | 2 (the PDF 93 «تطبيق سريع» · which command for which problem) | 2 | 10 | 1 (task → command on PDF 97) | 3 on PDF 97 | 0 |
| m16 | 2 | 4 | 19 | 0 | 3 on PDF 106 | 1 |

Practices are educational only (nothing stored, scored or ranked; no T05+); every wrong-answer feedback says what
to **check** («افحص …»), every question carries a two-step hint ladder, every page ends with practice, and the
shortInput answers are single deterministic tokens (`7`-style numbers, `DNS`, `ipconfig`, `tracert`, `127.0.0.1`).

### One registry-backed activity (`productionActivityRegistry` = exact TWELVE-entry allowlist)

| Activity | `{kind, key, version}` | Page | Renderer (own lazy chunk) |
| --- | --- | --- | --- |
| Collision / Broadcast domains explorer | `interactive-diagram / network-domains / 1` | PDF 101 (`m16-l02-p02-explorer`), after the PDF 101 table and «الخلاصة», before the practices | `NetworkDomainsExplorer` — four networks (Hub · Switch · Router · VLAN) as radio buttons; each redraws a native SVG with one **dashed** box per collision domain (the book's own drawing convention, PDF 98–99) and one coloured box per Broadcast domain (PDF 100–101); two toggles show / hide each family; the counts (Hub 1/1, Switch 4/1, Router 6/2, VLAN 4/2) and the book's reason sentences come from `config` and are mirrored as text in a `role="status"` region. No timers, no traffic simulation, no persistence; malformed config → note; unsupported version → fallback |

Rejected on purpose: a terminal simulator for the commands (the book prints no output, so any output would be
invented), a protocol animation, a second copy of the transport table as an activity (a keyed worksheet already is one).

### Publication: deployable ≠ published

`api/src/lib/learning-materials-registry.js` lists `m14` (10), `m15` (11), `m16` (12) with titles only. Nothing is
auto-published: a real-registry test proves a class released through m13 exposes nothing of m14–m16, that
publishing only m15 shows m15 alone, and that `[m16, m14, m15, m13]` canonicalizes to `[m13, m14, m15, m16]`. A
frontend test cross-checks the server registry against the manifest: every module with a body is publishable with
the same title and order, and no skeleton is.

### Deferred PR #123 follow-ups applied here

- **A** — `engine.ts` no longer states a count in its allowlist comment; it points at the enumerated, test-pinned
  registry ("the tests, not this comment, carry the count").
- **B** — the Phase 3A section's pointer to "today's six-entry allowlist" now points at the enumerated registry and
  the per-phase sections, so it cannot go stale again.
- **C** — the PDF 84 clarification in m13 uses the book's own wording («يتأكّد أن البيانات وصلت كاملة وبالترتيب
  الصحيح») instead of the broader "resends what did not arrive".
- **D** (arrow-key roving in the send/receive radiogroup) — left as optional polish; not implemented.

### Deliberately NOT in this phase

No PDF 107+ (network security, VPN / SSL / TLS, data encapsulation, the 3-way handshake, switch CLI / VLAN
programming), no trainings T05+ inside the platform, no terminal output, no port numbers, no medals / Strength /
leaderboard for page practice, no project / Achievement Hub / identity / login changes, no change to the approved
m01–m13 content other than cleanup C, no change to any class's `visibleModuleIds`.

## Batch 5 — أمان الشبكات · تجزئة البيانات (source PDF 107–119)

The fifth content phase closes the book's third batch. The boundary was discovered from the book: PDF 107 is the
**«الجزء الثاني · أمان الشبكات» part cover** (structural), PDF 108–115 is the section «أمان الشبكات» (attacks 108–111,
secure communications 112–115), PDF 116–118 is «تجزئة البيانات» (encapsulation names, Segment / Packet / Frame, the
TCP 3-way handshake), PDF 119 is the batch's closing «نهاية الدفعة · تدريبات» QR page, and **PDF 120 is the
«الدفعة الرابعة · برمجة السويتش و VLAN» cover** whose pages (from PDF 123) are already claimed by the historical m03
skeleton. Thirteen PDF pages, twelve learner-facing (108–119). Going past 119 would cut into a different part of the
book and require repurposing skeleton modules, so 119 is the clean boundary even though the batch is smaller than
Batch 4. Conversion **stops before PDF 120**: no converted body has `pdfPageStart >= 120` and tests assert it.

### Source map and module structure

| Section | Source PDF | Module (immutable id) | `order` | Batch | Lessons |
| --- | --- | --- | --- | --- | --- |
| «أمان الشبكات» | **107 (part cover) · 108–115** | `791381-m17` | 13 | b3 | `l01` القرصنة والهجمات على الشبكة (108–111) · `l02` الاتصالات الآمنة (112–115) |
| «تجزئة البيانات» | **116–118 · 119 (closing trainings page)** | `791381-m18` | 14 | b3 | `l01` Segment و Packet و Frame (116–117) · `l02` TCP 3-Way Handshake (118) · `l03` تدريبات نهاية الدفعة (119) |

- **1 source page → 1 interactive page** (twelve pages), printed page = the rendered page circle (108…118); PDF 107
  (cover) and PDF 119 (trainings page) print none. PDF 107 is represented only by m17's coarse source range +
  `sourceNote` (the PDF 47 / 76 divider treatment). PDF 119 is a learner-visible closing page with a
  `conversionNote`: the book's three training cards (13–14, 15–16, 17–18), the QR line and «الدفعة التالية» as
  printed; since the Learning-Practice T05–T30 phase the page also carries `library-training` blocks `lt13..lt18`
  (Reader position 110).
- **Historical skeleton m03–m06 untouched**: ids, titles, lesson/page ids and PDF mappings pinned; only their explicit
  `order` shifts to 15–18. **b3** «النماذج والبروتوكولات والأمان» = `[m13, m14, m15, m16, m17, m18]`.
- **Security fidelity (108–115):** one book sentence per attack (DoS, DDoS, Session Hijacking, MitM, Phishing,
  Spoofing) and per protection (VPN, SSL/TLS + HTTPS, SSH), the figure captions of PDF 110 as text, «الفرق» /
  «الوقاية» / «احذر» / «الأمان يعني» / «متى نستعمله؟» / «تذكّر» as printed. Exactly the book's level — «اسم الهجوم +
  فكرته الأساسية، دون الدخول في تفاصيل تقنية»: no attack mechanics, tools, defence configuration or key details.
- **Encapsulation fidelity (116–118):** the PDF 116 stack as a table (Data → Segment / Transport → Packet / Network →
  Frame / Data Link) with «احفظ», the PDF 117 cards with the book's field families («أرقام المنافذ والتحكّم بالتدفّق»,
  «IP المصدر والهدف ومعلومات التوجيه», «MAC المصدر والهدف وفحص الأخطاء»), the book's arrow line «Segment ← Packet ← Frame»
  rendered as prose «من Segment إلى Packet ثم إلى Frame», and the three handshake steps with «الفكرة» / «الخلاصة».
  No header layouts, sequence numbers or teardown.
- **Source order inside the batch (tested):** attacks appear page by page (108 names none; 109 DoS/DDoS; 110
  Hijacking/MitM; 111 Phishing/Spoofing); VPN is named on PDF 110 only because the book's «الوقاية» prints it, then
  explained from 112; SSL/TLS not before 112; nothing from «تجزئة البيانات» in m17; no attack or security tool in m18;
  the PDF 117 field families not on PDF 116; SYN/ACK not before 118.
- **Next-batch leakage guard:** switch CLI / VLAN programming (VLAN, Trunk, Dot1Q, VTP, `configure terminal`,
  `Switch(config)`, `enable`, `F0/1`, Access, «برمجة السويتش») is banned from m17–m18.

### Pedagogy applied

| Module | Solved examples | Clarifications | Inline practices | Worksheets (`practice-table`) | Closing review | Activities |
| --- | --- | --- | --- | --- | --- | --- |
| m17 | 1 | 5 | 17 | 2 (attack → name on PDF 111 · tool → purpose on PDF 115) | 3 on PDF 115 | 0 |
| m18 | 1 | 3 | 9 | 1 (description → Segment/Packet/Frame on PDF 117) | 3 on PDF 119 | 1 |

Practices are educational only (nothing stored, scored or ranked; no T05+); every wrong-answer feedback says what
to **check** («افحص …»), every question carries a two-step hint ladder, every page ends with practice, and the
shortInput answers are single deterministic tokens (`HTTPS`, `3`).

### One registry-backed activity (`productionActivityRegistry` = exact THIRTEEN-entry allowlist)

| Activity | `{kind, key, version}` | Page | Renderer (own lazy chunk) |
| --- | --- | --- | --- |
| TCP three-way handshake stepper | `interactive-diagram / tcp-handshake / 1` | PDF 118 (`m18-l02-p01-stepper`), after «الفكرة», the three steps and «الخلاصة», before the practices | `TcpHandshakeStepper` — two devices in a native SVG; «الخطوة التالية» / «الخطوة السابقة» reveal or hide one arrow (SYN, SYN-ACK, ACK) at a time with the book's sentence; the summary appears after the third; every revealed step is mirrored as text in a `role="status"` list. Deterministic, no timers, no persistence; malformed config → note; unsupported version → fallback |

Rejected on purpose: an attack "simulation" (the book gives one idea per attack, nothing to simulate), an
encapsulation animation (the table + cards + keyed worksheet already carry the book's content).

### Publication: deployable ≠ published

`api/src/lib/learning-materials-registry.js` lists `m17` (13) and `m18` (14) with titles only. Nothing is
auto-published: a real-registry test proves a class released through m16 exposes nothing of m17–m18, that
publishing only m18 shows m18 alone, and that `[m18, m17, m16]` canonicalizes to `[m16, m17, m18]`. The frontend
cross-check test (every module with a body is publishable with the same title and order; no skeleton is) covers
the new modules automatically.

### Deliberately NOT in this phase

No PDF 120+ (switch CLI, VLAN, Trunk, the m03–m06 skeleton ranges), no trainings T05+ inside the platform, no attack
mechanics, no medals / Strength / leaderboard for page practice, no project / Achievement Hub / identity / login
changes, no change to the approved m01–m16 content, no change to any class's `visibleModuleIds`.

### Where the next batch begins

**The next Learning Content batch begins at PDF 120** («الدفعة الرابعة · برمجة السويتش و VLAN» cover, then
«برمجة السويتش CLI و VLAN» from PDF 121). PDF 123–124 are the historical m03 skeleton pages, so that batch must decide
whether to fill m03 in place (keeping its immutable ids) rather than create a parallel module. *(Decided in Batch 6
below: m03 was completed in place.)*

## Batch 6 — برمجة السويتش · CLI و VLAN (source PDF 120–138) — m03 completed IN PLACE

The sixth content phase converts the book's fourth-batch opening section. The boundary was discovered from the book:
**PDF 120 is the «الدفعة الرابعة · برمجة السويتش و VLAN» cover** (structural), PDF 121–138 is the section
«برمجة السويتش · CLI و VLAN» (CLI and the switch ports 121–124, the VLAN concept and terms 125–129, VLAN creation /
port binding / SVI / gateway 130–134, Native / Tagged / Untagged with their commands 135–138), and **PDF 139 is the
«إدارة مركزية» cover of the next section** (centralised VLAN management across switches). Nineteen PDF pages, eighteen
learner-facing (121–138). Conversion **stops before PDF 139**: no converted body has `pdfPageStart >= 139` and tests
assert it.

### The in-place completion of the historical skeleton `791381-m03`

The Phase-2 skeleton claimed `791381-m03` («برمجة السويتش CLI و VLAN», lesson `791381-m03-l01` «مدخل إلى CLI و VLAN»)
with two pages, `-l01-p01` = PDF 123 «منافذ السويتش» and `-l01-p02` = PDF 124 «برمجة المنافذ من CLI». Module ids are
immutable, so this batch **completes m03 in place** instead of creating a parallel `m19` or renaming anything:

- **Module identity unchanged**: id, title, `shortTitle`, `order: 15` (it already read after m18), lesson `l01` id and
  title, batch membership (`b4` = `[m03, m04, m05]`).
- **Historical page ids, titles, meanings and source mappings unchanged** — byte-for-byte the skeleton's values,
  including `printedPage` 121 / 122 (the Phase-2 skeleton recorded the hidden running number of the PDF text layer,
  two lower than the page circle; the values are pinned as immutable rather than "corrected"). Only their explicit
  `order` moved (1 → 3, 2 → 4) so the book's PDF 121–122 can precede them.
- **PDF 121 and 122 are NEW stable page ids** `791381-m03-l01-p03` («برمجة السويتش — CLI») and `-l01-p04»
  («الدخول إلى وضع البرمجة») placed first by `order` 1 and 2 — ids are opaque, `order` sequences, and the mixed
  numbering is the visible proof that nothing historical was renumbered. New pages follow the established rule
  printed page = page circle = PDF index (121 … 138).
- **PDF 120** is represented only by m03's coarse source range `120–138` + `sourceNote` (the PDF 47 / 76 / 107
  divider treatment); it is never a learner page and no unit opener is invented.

### Source map and module structure

| Section | Source PDF | Module (immutable id) | `order` | Batch | Lessons |
| --- | --- | --- | --- | --- | --- |
| «برمجة السويتش · CLI و VLAN» | **120 (cover) · 121–138** | `791381-m03` | 15 | b4 | `l01` مدخل إلى CLI و VLAN (121–124: new `p03`, new `p04`, historical `p01`, historical `p02`) · `l02` مفهوم VLAN والمصطلحات (125–129) · `l03` إنشاء VLAN وربط المنافذ (130–134) · `l04` Native / Tagged / Untagged (135–138) |

- **1 source page → 1 interactive page** (eighteen pages), TOC in the manifest = pages in the body (ids, titles,
  orders, sources pinned equal).
- **CLI fidelity:** every «Switch CLI» box of the book (PDF 122, 130, 131, 133, 136, 137, 138) is a `code` block
  (`language: "cli"`, origin book) with the book's exact command lines and prompts — `Switch>`, `Switch#`,
  `Switch(config)#`, `Switch(config-vlan)#` — rendered inside `<pre><code dir="ltr">` so Cisco commands, port names
  (`f0/1-10`, `f0/24`) and addresses never reverse under RTL; each box is followed by a command/explanation table
  whose command column is `ltr` and whose second column carries the book's own annotations. There is **no real
  terminal and no invented output**: tests assert every code line is a prompt + command, and ban `show …`, `%`,
  `[OK]`, `Building configuration`, `hostname`, `exit`, `end`, `write`, passwords and other commands the book does
  not print in these pages. Where the book abbreviates a prompt (PDF 131 prints `Switch(config)#` before the
  `switchport` commands), the code block keeps the book's text and a teacher clarification notes that a real device
  changes the prompt after `interface`, without inventing the string.
- **Concept fidelity:** the CLI definition and facts (121), the prompt transition «من > إلى # ثم (config)#» as prose
  (122), the port figure and naming facts (123), the three port-programming steps (124), the VLAN definition, figure
  and benefits (125), the three term cards with the printed range 1–4094 and the VLAN 1 note (126), «الفكرة الأساسية»
  / «الخلاصة» (127), the PDF 128 table as a five-column table with LTR device / VLAN / address / mask columns (128),
  the distribution facts (129), «تذكّر» / «النتيجة» / «متى؟» / «لماذا؟» / «الفائدة» / «ما هو الـ Tag؟» as printed.
  Technical tokens (CLI, VLAN, Trunk, Access, Tag, SVI, Gateway, port names, commands, addresses) are LTR spans.
- **Source order inside the module (tested):** no command on PDF 121; `enable` / `configure terminal` from 122; the
  PDF 124 steps page names Access / Trunk / VLAN but prints no command; `name MNG` from 130; `switchport` and
  `interface range` from 131; SVI commands and `192.168.10.254` from 133; Gateway from 134; Tag first named on 132
  (explained on 135); Native / Tagged / Untagged cards from 135; trunk commands from 136; `allowed vlan` from 137.
- **Historical skeletons m04–m06 untouched**: ids, titles, lesson/page ids, PDF mappings and orders 16–18 pinned;
  m03 still precedes them.
- **Next-section leakage guard:** the centralised VLAN-management protocol and its server/client roles, Router on a
  Stick, sub-interfaces, Dot1Q / 802.1Q encapsulation, port security, DHCP configuration and ACLs are banned from
  m03 by tests; m01–m18 are asserted to contain none of the switch-programming content (VLAN is named in m16 only
  because PDF 100–101 print it as a Broadcast-domain separator).

### Pedagogy applied

| Module | Solved examples | Clarifications | Inline practices | Worksheets (`practice-table`) | Closing review | Activities |
| --- | --- | --- | --- | --- | --- | --- |
| m03 | 2 (PDF 128 table reading · PDF 138 «F0/3 → VLAN 20» built only from the book's commands) | 18 (one per page) | 37 | 6 (Access/Trunk on 124 and 138 · term on 126 · device → VLAN on 128 · command → purpose on 131 · Native/Tagged/Untagged on 135) | 3 on PDF 138 | 0 |

Practices are educational only (nothing stored, scored or ranked; no T05+); every wrong-answer feedback says what
to **check** («افحص …»), every question carries a two-step hint ladder, every page ends with practice, and the one
shortInput answer is a single deterministic token (`F0/24`).

**No activity was added on purpose.** A "CLI stepper" would re-present the seven code blocks + command tables that
already carry the book's content, and a fake terminal would contradict the "no real terminal, no invented output"
rule. The `productionActivityRegistry` allowlist stays at thirteen entries.

### Publication: deployable ≠ published

`api/src/lib/learning-materials-registry.js` now lists `m03` (title «برمجة السويتش CLI و VLAN», `order: 15`) after
m18 — by order, never by id (lexically `m03` would sort before `m07`). Nothing is auto-published: a real-registry
test proves a class released through m18 exposes nothing of m03, that publishing `[m01, m03]` shows exactly those two
(m03 last), that `[m03, m18, m01]` canonicalizes to `[m01, m18, m03]`, that the catalog still carries identity +
title + order only, and that m04–m06 remain unpublishable (400). No class's `visibleModuleIds` changed.

### Deliberately NOT in this phase

No PDF 139+ (centralised VLAN management, Router on a Stick, sub-interfaces, Dot1Q, port security, DHCP, ACL — the
m04–m06 skeleton ranges), no new activity, no trainings T05+ inside the platform, no medals / Strength / leaderboard
for page practice, no project / Achievement Hub / identity / login changes, no change to the approved m01–m18 content
(only test labels that described m03 as skeleton-only were refreshed), no change to m04 / m05 / m06, no change to any
class's `visibleModuleIds`.

### Where the next batch begins

**The next untouched page is PDF 139** («إدارة مركزية» cover of the next section, then its pages from PDF 140). The
historical `m04` skeleton («Trunk و Router on a Stick», PDF 148) is the next module that will need the same in-place
decision. *(Decided in Batch 7 below: the VTP section became the new module m19 and m04 was completed in place.)*

## Batch 7 — إدارة VLAN · VTP · Trunk و Router on a Stick (source PDF 139–157)

The seventh content phase closes the book's fourth batch. The boundary was discovered from the book: **PDF 139 is the
«إدارة مركزية · VTP» section cover** (structural), PDF 140–144 is the section «إدارة VLAN · VTP», **PDF 145 is the
«توجيه بين الشبكات · Trunk و Router on a Stick» section cover** (structural), PDF 146–156 is that section (146–150
Trunk ports and commands, 151–155 Router on a Stick and Dot1Q, 156 «خلاصة الوحدة»), PDF 157 is the batch's closing
«نهاية الدفعة الرابعة · تدريبات على VLAN و Trunk» QR page, and **PDF 158 is the «الدفعة الخامسة · Wi-Fi و IPv6 و DHCP
والأمان» cover**. Nineteen PDF pages, seventeen learner-facing. Conversion **stops before PDF 158**: no converted body
has `pdfPageStart >= 158` and tests assert it.

### Two modules: a NEW id for VTP, the historical m04 completed IN PLACE

PDF 139 does not start m04. The book opens a separate VTP section with its own cover, and the Phase-2 skeleton `m04`
(«Trunk و Router on a Stick», historical page = PDF 148) reserves only the section that starts at the PDF 145 cover.
So:

- **`791381-m19` («إدارة VLAN: VTP», `shortTitle` «VTP») is a NEW stable id** — the next free one — placed by explicit
  `order: 16` between m03 (15) and m04 (17). Lessons `l01` ما هو VTP وكيف يعمل (140–141) · `l02` إعداد VTP (142–144).
- **`791381-m04` is completed IN PLACE**: id, title, `shortTitle`, lesson `791381-m04-l01` id and title
  («الربط بين السويتشات والتوجيه») unchanged. Its historical page `791381-m04-l01-p01` = PDF 148 «أوامر Trunk»
  keeps `printedPage: 146` (the skeleton's text-layer number, pinned as immutable) and its keywords; only its explicit
  `order` moved (1 → 3). PDF 146–147 are new stable ids `-l01-p02` / `-l01-p03` placed first by `order`; PDF 149–150 are
  `-l01-p04` / `-l01-p05`. New lessons: `l02` Router on a Stick و Dot1Q (151–155) and `l03` خلاصة الوحدة وتدريبات
  نهاية الدفعة (156–157). Reading `order` 16 → 17 because the VTP section precedes it.
- **m05 and m06 shift** to orders 18 / 19 (ids, titles, page ids, mappings untouched). **b4** = `[m03, m19, m04, m05]`.
- PDF 139 and 145 are represented only by the modules' coarse source ranges (139–144, 145–157) + `sourceNote`s.

### Source map and module structure

| Section | Source PDF | Module (immutable id) | `order` | Batch | Lessons |
| --- | --- | --- | --- | --- | --- |
| «إدارة VLAN · VTP» | **139 (cover) · 140–144** | `791381-m19` (new) | 16 | b4 | `l01` ما هو VTP وكيف يعمل (140–141) · `l02` إعداد VTP (142–144) |
| «Trunk و Router on a Stick» | **145 (cover) · 146–156 · 157 (closing trainings page)** | `791381-m04` (in place) | 17 | b4 | `l01` الربط بين السويتشات والتوجيه (146–150: new `p02`, new `p03`, historical `p01`, new `p04`, new `p05`) · `l02` Router on a Stick و Dot1Q (151–155) · `l03` خلاصة الوحدة وتدريبات نهاية الدفعة (156–157) |

- **1 source page → 1 interactive page** (seventeen pages); printed page = page circle = PDF index for every new page;
  PDF 157 prints none and is a learner-visible closing page with a `conversionNote` (four training cards 19–22 and the
  book's line as printed; since the Learning-Practice T05–T30 phase the page also carries `library-training` blocks
  `lt19..lt22`, Reader position 145).
- **CLI fidelity:** the «Switch CLI» boxes of PDF 142, 148, 153 and the «Router CLI» boxes of PDF 154, 155 are `code`
  blocks (`language: "cli"`, origin book) with the book's exact command lines and prompts (`Switch(config)#`,
  `Router(config)#`, `Router(config-subif)#`), each followed by a command/explanation table with an LTR command
  column carrying the book's annotations. No real terminal, no invented output; tests ban `show`, `no shutdown` on the
  router, `exit`/`end`, VTP versions/pruning/transparent mode and other commands the book does not print.
- **Concept fidelity:** the VTP definition, problem/solution facts and «اختصار» (140), the three steps and «الفائدة»
  (141), «انتبه» (142), «للتدريب» (143), «تأكّد» (144); the six-switch Trunk-port table and «قاعدة» (146), the Trunk
  definition, figure text and «تذكّر» (147), «قاعدة» of 149, the Sw6 facts (150), the Router-on-a-Stick figure text and
  «الهدف» (151), the Dot1Q definition and «الفكرة» (152), «ملاحظة» (153), the two «تذكّر» boxes (154, 155), the four
  concept cards and «للامتحان» (156). Technical tokens are LTR spans; direction is prose, never arrow glyphs.
- **Source order inside the batch (tested):** m19 never names Router on a Stick / Dot1Q / sub-interfaces; the vtp
  commands appear only from 142; m04 never names VTP; Router on a Stick is first named on 150 (the book prints it
  there), Sub-Interface / Inter-VLAN from 151, Dot1Q from 152, router commands from 154, VLAN 30 / 40 from 155.
- **Next-batch leakage guard:** DMZ, Wi-Fi, SSID, WEP/WPA, access points, IPv6, the port-number table and DHCP are
  banned from m19–m04 by tests; m01–m18 and m03 are asserted free of VTP / Router on a Stick / Dot1Q / sub-interfaces.

### Pedagogy applied

| Module | Solved examples | Clarifications | Inline practices | Worksheets (`practice-table`) | Closing review | Activities |
| --- | --- | --- | --- | --- | --- | --- |
| m19 | 0 | 5 (one per page) | 10 | 3 (Server/Client on 141 and 143 · vtp command → purpose on 142) | 3 on PDF 144 | 0 |
| m04 | 1 (PDF 155: a VLAN 50 sub-interface built only from the book's three router commands) | 12 (one per page) | 22 | 3 (Dot1Q command → purpose on 153 · line → VLAN on 155 · concept on 156) | 3 on PDF 157 | 0 |

Practices are educational only (nothing stored, scored or ranked; no T19+); every wrong-answer feedback says what
to **check** («افحص …»), every question carries a two-step hint ladder, every page ends with practice, and the one
shortInput answer is a single deterministic token (`G0/0`). **No activity was added**: the section is commands and
one-sentence rules, already carried by the code blocks, tables and keyed worksheets. The allowlist stays at thirteen.

### Publication: deployable ≠ published

`api/src/lib/learning-materials-registry.js` lists `m19` (16) and `m04` (17) after m03 — by order, never by id.
Nothing is auto-published: a real-registry test proves a class released through m03 exposes nothing of m19 / m04, that
publishing `[m01, m04]` shows exactly those two, that `[m04, m19, m03]` canonicalizes to `[m03, m19, m04]`, and that
m05 / m06 remain unpublishable (400). No class's `visibleModuleIds` changed.

### Deliberately NOT in this phase

No PDF 158+ (DMZ, Wi-Fi, IPv6, ports, DHCP, security — the fifth batch), no new activity, no trainings T19+ inside the
platform, no VTP versions / pruning / transparent mode, no router `no shutdown` or `show` commands the book does not
print, no change to the approved m01–m18 / m03 content (only test labels and pins that described m04 as skeleton-only
were refreshed), no change to m05 / m06 beyond their explicit `order`, no change to any class's `visibleModuleIds`.

### Where the next batch begins

**The next untouched page is PDF 158** («الدفعة الخامسة · Wi-Fi و IPv6 و DHCP والأمان» cover, then «Wi-Fi · الشبكات
اللاسلكية» from PDF 159). None of the remaining skeletons (m05 «مرجع أوامر Cisco» PDF 193, m06 «قوائم التحكم ACL» PDF 227)
claims pages in that range, so the next batch will need new stable ids.

## Batch 8 — Wi-Fi · IPv6 والمنافذ · DHCP (source PDF 158–179) + the interactive CLI simulator

The eighth content phase opens the book's fifth batch. The boundary was discovered from the book: **PDF 158 is the
«الدفعة الخامسة · Wi-Fi و IPv6 و DHCP والأمان» batch cover** (structural; its first line lists «DMZ · Wi-Fi · IPv6 ·
المنافذ · DHCP», its second «Port Security · كلمات المرور · مرجع أوامر Cisco»). PDF 159–165 is the section «Wi-Fi ·
الشبكات اللاسلكية» (159 DMZ, 160 Wi-Fi, 161 wireless types, 162 SSID, 163 security, 164 WEP / WPA, 165 Access Point),
PDF 166–168 is «IPv6 والمنافذ» (166 IPv6, 167 shortening examples, 168 the port table), PDF 169–179 is «بروتوكول DHCP»
(169 intro, 170 DORA, 171 the router example, **172–173 the two «Cisco CLI» boxes**, 174 command explanations, 175
notes, 176–179 DHCP from a Packet Tracer server), **PDF 180 begins «Port Security»** (180–184), then «حماية أجهزة Cisco»
(185–191), «مرجع أوامر Cisco» (192–199 — the m05 skeleton's PDF 193–194 live there) and the sixth-batch cover at PDF
200. The smallest coherent batch is the cover's first line: **PDF 158–179, three sections, twenty-one learner pages**.
Conversion **stops before PDF 180**: no converted body has `pdfPageStart >= 180` and tests assert it.

### Three NEW stable ids; nothing historical is touched

None of the remaining skeletons claims pages in 158–179 (m05 = PDF 193–194, m06 = PDF 227), so the three sections
are the next free ids, placed by explicit `order` after m04 (17):

- **`791381-m20` «Wi-Fi والشبكات اللاسلكية»** (`shortTitle` «Wi-Fi»), order 18, source 158–165 (PDF 158 only in the
  module's coarse source range + `sourceNote`). Lessons `l01` DMZ و Wi-Fi (159–161) · `l02` SSID وأمان الشبكة اللاسلكية
  (162–165).
- **`791381-m21` «IPv6 والمنافذ»**, order 19, source 166–168, one lesson `l01` IPv6 والمنافذ المهمة.
- **`791381-m22` «بروتوكول DHCP»** (`shortTitle` «DHCP»), order 20, source 169–179. Lessons `l01` ما هو DHCP (169–171) ·
  `l02` DHCP على الراوتر (172–175) · `l03` DHCP عن طريق Server (176–179).
- **m05 and m06 shift** to orders 21 / 22 (ids, titles, page ids, mappings untouched). **b5** («الأمان · Wi-Fi · IPv6 ·
  DHCP», previously empty) = `[m20, m21, m22]`; b4 / b6 unchanged. Batch 7 bodies (m19, m04) are untouched.

### Source map and module structure

| Section | Source PDF | Module (new stable id) | `order` | Batch | Lessons |
| --- | --- | --- | --- | --- | --- |
| «Wi-Fi · الشبكات اللاسلكية» | **158 (batch cover) · 159–165** | `791381-m20` | 18 | b5 | `l01` DMZ و Wi-Fi (159–161) · `l02` SSID وأمان الشبكة اللاسلكية (162–165) |
| «IPv6 والمنافذ» | **166–168** | `791381-m21` | 19 | b5 | `l01` IPv6 والمنافذ المهمة (166–168) |
| «بروتوكول DHCP» | **169–179** | `791381-m22` | 20 | b5 | `l01` ما هو DHCP (169–171) · `l02` DHCP على الراوتر (172–175) · `l03` DHCP عن طريق Server (176–179) |

- **1 source page → 1 interactive page** (twenty-one pages); printed page = page circle = PDF index everywhere; no
  split, merge or `conversionNote`.
- **CLI fidelity:** the «Cisco CLI» boxes of PDF 172 and 173 are `code` blocks (`language: "cli"`, origin book) with
  the book's exact seven lines and prompts (`Router(config-if)#`, `Router(config)#`, `Router(dhcp-config)#`), each
  followed by the command/annotation table with an LTR command column. The interface name **G0/0** comes from the
  book's PDF 174 explanation («interface G0/0»). Nothing the book does not print appears in book-origin blocks.
- **Concept fidelity:** DMZ definition, diagram roles, facts and «الفكرة» (159); Wi-Fi facts and «تذكّر» (160); the
  PAN / WLAN / WPAN / WWAN table and «احفظ من المثال» (161); SSID facts (162); security facts and «قاعدة» (163); the
  WEP / WPA / WPA2-WPA3 rows and «للطالب» (164); Access Point (165); 128 / 32 bit, Hexadecimal (166); the three IPv6
  addresses copied character by character and the «::» rule (167); the nine-row port table and «الفكرة» (168); DHCP
  facts (169); DORA in prose «ثم» (170); the 192.168.1.0/24 example numbers (171); the CLI boxes and «تذكّر» (172–173);
  the four command roles (174); APIPA 169.254.x.x (175); the server facts and three Packet Tracer steps (176–179).
- **Source order inside the batch (tested):** m20 never names IPv6 / ports / DHCP; m21 never names DHCP / Access
  Point / WPA; in m22 DORA first appears on 170, the router commands on 172–173, APIPA on 175, the server steps from 176.
- **Next-batch leakage guard:** Port Security, sticky MAC, violation, device passwords, `line vty` / `line console`,
  `enable secret`, `service password-encryption`, `banner motd`, `show running-config` / `show startup-config`, the
  command reference, OSPF / EIGRP / ACL / WAN are banned from m20–m22 by tests.

### The interactive CLI simulator (`src/learning/cli/`, `simulation / cli-terminal / v1`)

Batch 8 ships **v1 of a deterministic TEACHING simulator** of a Cisco-style command line — not an IOS emulator. It is
a generic Learning-Reader component reusable by every CLI section (VLAN, Trunk, VTP, Router on a Stick, DHCP, and
later routing / ACL / show commands); exercises are **declarative data** in content modules.

- **Engine (no React):** `types.ts` (state model, closed command union, exercise config), `normalize.ts` (trim,
  collapse whitespace, canonical interface spelling `FastEthernet0/1` = `fa0/1` = `f0/1`, IPv4 / mask / VLAN checks),
  `grammar.ts` (the closed command table — keyword sequences with the book's abbreviations such as `config t`, valid
  modes, display syntax, argument parsers; `parseCommand` → empty / unknown / incomplete / invalid / ok), `state.ts`
  (device state, prompts, Arabic mode labels, initial state from an exercise), `engine.ts` (`executeCommand`: parse →
  mode check → apply; pure, returns a new state; unknown / incomplete / invalid / wrong-mode input never changes
  state), `show.ts` (simplified deterministic `show` output labelled as simulation), `exercise.ts` (session =
  state + transcript + step / goal progress + hint ladder; `submitCommand`, `revealHint`, `goalStatus`; the exact
  feedback strings), `config.ts` (defensive reading of the opaque block `config`; unknown commands / modes / shapes →
  null → the block's static fallback).
- **Modes:** user EXEC `>`, privileged EXEC `#`, global `(config)#`, interface `(config-if)#`, sub-interface
  `(config-subif)#`, VLAN `(config-vlan)#`, DHCP pool `(dhcp-config)#`. **Commands (v1):** `enable`, `disable`,
  `configure terminal`, `exit`, `end`, `?`, `hostname`, `interface` (+ `range`, sub-interfaces, `vlan N` SVI),
  `vlan`, `name`, `switchport mode access|trunk`, `switchport access vlan`, `switchport trunk allowed vlan`,
  `ip address`, `no shutdown`, `shutdown`, `encapsulation dot1Q`, `ip dhcp pool`, `network`, `default-router`,
  `dns-server`, `ip dhcp excluded-address`, `vtp mode|domain|password`, `show running-config`, `show ip interface
  brief`, `show vlan brief`, `show ip dhcp pool`, `show vtp status`.
- **Exercise kinds:** `guided` (ordered instructions, step-specific success text such as «✓ أحسنت، انتقلت إلى وضع
  الإعداد العام»), `challenge` (questions, «✓ صحيح» / «✗ حاول مرة أخرى», upcoming questions hidden, answers never
  printed), `task` (required final state as goal conditions; completes only when every goal holds, in any command
  order). Feedback distinguishes unknown («✗ أمر غير معروف في هذا المحاكي التعليمي»), wrong mode («✗ الأمر صحيح لكنك
  في الوضع غير المناسب — المطلوب: …»), interface-mode commands outside an interface («✗ اختر الواجهة أولًا»),
  incomplete, invalid value, not required by the exercise («✗ هذا الأمر غير مطلوب في هذا التدريب» — never executed),
  correct step, and completed final state. Two-step hint ladders (hint 1 never reveals the answer).
- **Component:** `CliTerminalActivity.tsx` + `cli.css`, registered in `productionActivityRegistry` as
  `simulation / cli-terminal / v1` (its own lazy chunk; capabilities fullscreen + reset + interactive; the allowlist
  is now **fourteen** entries). RTL instruction panel (kind, intro, step list or goal checklist, hints, completion
  banner) + an **LTR terminal island** (transcript, prompt, input with Enter / «تنفيذ», ArrowUp history) contained at
  320 / 360 px (`min-width: 0`, `max-width: 100%`, the screen scrolls inside itself, ≥ 44 px input row). Shell reset
  rebuilds the session from the exercise's initial state; nothing is persisted or sent (interaction events carry only
  status / completed, never the typed text).
- **Safety:** input is only ever matched against the closed grammar table — no `eval`, `Function`, dynamic `import`,
  shell / process APIs, `fetch`, storage or DOM globals in any simulator source (a test scans the folder), and hostile
  input (shell metacharacters, JS, HTML) is inert text that never executes, never mutates state and never advances an
  exercise.
- **Book exercises (m22):** PDF 172 guided example (the eight lines of part one, from `enable` to `network`), PDF 173
  command challenges (`default-router`, `dns-server`, then `ip dhcp excluded-address` from global config; only those
  three commands are accepted), PDF 174 multi-step task (seven goals: G0/0 address, mask, up; pool LAN network,
  default-router, dns-server; the excluded range). Tests drive all three with the book's own lines (and common
  spellings) to completion and prove wrong values / wrong modes / a shut interface keep them open. **Batch 7 content
  was not retroactively changed**; a later PR may add CLI exercises to VTP / Trunk / Router on a Stick.

### Pedagogy applied

| Module | Clarifications | Inline practices | Worksheets (`practice-table`) | Closing review | Activities |
| --- | --- | --- | --- | --- | --- |
| m20 | 7 (one per page) | 14 | 2 (example → wireless type on 161 · technology → rating on 164) | 3 on PDF 165 | 0 |
| m21 | 3 (one per page) | 8 | 1 (port → service on 168) | 3 on PDF 168 | 0 |
| m22 | 11 (one per page) | 21 | 2 (DORA order on 170 · command → role on 174) | 3 on PDF 179 | 3 CLI exercises (172 guided · 173 challenge · 174 task) |

Practices are educational only (nothing stored, scored or ranked); every wrong-answer feedback says what to **check**
(«افحص …»), every question carries a two-step hint ladder, every page ends with practice.

### Publication: deployable ≠ published

`api/src/lib/learning-materials-registry.js` lists `m20` (18), `m21` (19), `m22` (20) after m04 — by order, never by
id. Nothing is auto-published: a real-registry test proves a class released through m04 exposes nothing of m20–m22,
that publishing `[m01, m22]` shows exactly those two, that `[m22, m20, m04]` canonicalizes to `[m04, m20, m22]`, and
that m05 / m06 remain unpublishable (400). No class's `visibleModuleIds` changed.

### Deliberately NOT in this phase

No PDF 180+ (Port Security, device passwords, the command reference m05, ACL m06), no `show`-command exercise type
(the grammar carries simplified `show` output as a foundation; the diagnostic exercise kind is deferred), no answer
reveal after the hint ladder, no `line` / routing / ACL / NAT commands, no persistence or progress of CLI sessions, no
retroactive CLI exercises in m03 / m19 / m04, no change to any class's `visibleModuleIds`.

### Where the next batch begins

**The next untouched page is PDF 180** («Port Security», 180–184, then «حماية أجهزة Cisco» 185–191 — both CLI-rich and
natural candidates for `cli-terminal` challenges — then «مرجع أوامر Cisco» 192–199 where the m05 skeleton's PDF 193–194
live, and the sixth-batch cover at PDF 200).

## Batch 9 — Port Security · حماية أجهزة Cisco · مرجع أوامر Cisco (source PDF 180–199) — m05 completed IN PLACE

The ninth content phase completes the book's fifth batch (its cover at PDF 158 lists «Port Security · كلمات المرور ·
مرجع أوامر Cisco» on its second line). The boundary was discovered from the book: **PDF 180–184 is «Port Security»**
(180 what it is, 181 why / the scenario, 182 the enabling box, 183 sticky MAC, 184 maximum + violation), **PDF 185–191
is «حماية أجهزة Cisco»** (185 why passwords, 186 the three doors Console / VTY / Enable, 187 the VTY box, 188 the
Console box, 189 `enable secret` + `service password-encryption`, 190 `show running-config` / `show startup-config`,
191 the QR trainings page T23–T26), **PDF 192–199 is «مرجع أوامر Cisco»** (192 intro, 193–194 the historical m05
skeleton pages, 195 VTP + quick passwords, 196 sub-interface / dot1Q, 197 Port Security digest, 198 the `show`
reference, 199 OSPF / EIGRP / ACL reminders + «الدفعة التالية») and **PDF 200 is the sixth-batch cover** (structural,
not rendered). Conversion **stops before PDF 200**: no converted body has `pdfPageStart >= 200` and tests assert it
(the Batch 8 maximum 179 and the m06 skeleton at PDF 227 are pinned too).

### Two NEW stable ids, the historical m05 completed IN PLACE

- **`791381-m23` «Port Security»** (`shortTitle` «Port Security»), order 21, source 180–184. Lessons `l01` ما هو Port
  Security (180–181) · `l02` أوامر Port Security (182–184).
- **`791381-m24` «حماية أجهزة Cisco»** (`shortTitle` «حماية الأجهزة»), order 22, source 185–191. Lessons `l01` طرق الدخول إلى
  أجهزة Cisco (185–186) · `l02` كلمات المرور وعرض الإعدادات (187–190) · `l03` تدريبات نهاية القسم (191, the QR page as
  static cards with a `conversionNote`, plus — since the Learning-Practice T05–T30 phase — `library-training` blocks
  `lt23..lt26`, Reader position 178).
- **`791381-m05` «مرجع أوامر Cisco»** (`shortTitle` «أوامر Cisco»), order 23, source 192–199 — the Phase-2 skeleton
  whose two historical pages `-l01-p01` (PDF 193, printed 191) and `-l01-p02` (PDF 194, printed 192) were the only
  known content. **Decision: complete in place** (like m03 in Batch 6 and m04 in Batch 7): the module id, title, the
  lesson id `791381-m05-l01`, both historical page ids, titles, mappings and keywords are byte-for-byte unchanged; only
  their `order` moved to 2 / 3 so that PDF 192 (new id `-l01-p03`, order 1) opens the lesson. Two new lessons follow:
  `l02` VTP و Dot1Q و Port Security (195–197) · `l03` أوامر الفحص وما بعد (198–199). Manifest `order` is the sole
  authority; a test pins that the historical lines are unchanged.
- **m06 shifts** to order 24 (id, title, page, mapping untouched). **b5** = `[m20, m21, m22, m23, m24, m05]` (m05 moved
  from b4 to b5 because the book's fifth-batch cover names «مرجع أوامر Cisco»); **b4** = `[m03, m19, m04]`; b6
  unchanged. Batch 6–8 bodies (m03, m19, m04, m20, m21, m22) are untouched.

### Source map and module structure

| Section | Source PDF | Module | `order` | Batch | Lessons |
| --- | --- | --- | --- | --- | --- |
| «Port Security» | **180–184** | `791381-m23` (new) | 21 | b5 | `l01` ما هو Port Security (180–181) · `l02` أوامر Port Security (182–184) |
| «حماية أجهزة Cisco» | **185–191** | `791381-m24` (new) | 22 | b5 | `l01` طرق الدخول إلى أجهزة Cisco (185–186) · `l02` كلمات المرور وعرض الإعدادات (187–190) · `l03` تدريبات نهاية القسم (191) |
| «مرجع أوامر Cisco» | **192–199** | `791381-m05` (completed in place) | 23 | b5 | `l01` الأوامر الأساسية (192, 193, 194) · `l02` VTP و Dot1Q و Port Security (195–197) · `l03` أوامر الفحص وما بعد (198–199) |

- **1 source page → 1 interactive page** (twenty pages); printed page = page circle = PDF index everywhere except the
  two historical m05 pages, which keep their historical printed numbers 191 / 192 (the book's own footer); no split
  or merge. PDF 191 (QR trainings) and the OSPF / EIGRP / ACL page 199 carry a `conversionNote`.
- **CLI fidelity:** the twelve «Cisco CLI» boxes (PDF 182, 183, 184, 187, 188, 189, 190, 193, 194, 195, 196, 197) are
  `code` blocks (`language: "cli"`, origin book) with the book's exact lines and prompts — including the book's
  generic `Device(config)#` / `Device(config-line)#` prompts, kept verbatim — each followed by the command / annotation
  table with an LTR command column. The sample MAC `00A0.1234.5678`, the password `cisco123` and the addresses of
  PDF 196 are the book's. Nothing the book does not print appears in book-origin blocks; the `show` reference (198)
  and the routing / ACL reminders (199) are static text and cards, not exercises, because the simulator does not
  carry those commands.

### CLI simulator extension (v1, same activity `simulation / cli-terminal / v1`)

Batch 8's simulator is extended **only with commands the book prints in PDF 180–199**; the registry entry, the
component and the exercise kinds are unchanged (the allowlist stays fourteen entries).

- **New mode:** line configuration `(config-line)#` (Arabic label «وضع إعداد خط الدخول»), entered from global config
  by `line console 0` or `line vty 0 4` (exactly the book's ranges), left by `exit` (→ global) or `end`. The device
  state gains `lines.console` / `lines.vty` (`password?`, `login`), `selectedLine`, `enableSecret?`,
  `passwordEncryption`, `banner?`, and each interface gains an optional `portSecurity` record (`enabled`, `maximum?`,
  `macAddress?`, `sticky?`, `violation?`). Exercises may start in line mode (`startMode: "line"` + `startLine`).
- **New commands (closed grammar, book lines only):** `switchport port-security`, `switchport port-security maximum
  N` (1–8192), `switchport port-security mac-address H.H.H` (Cisco dotted MAC), `switchport port-security
  mac-address sticky`, `switchport port-security violation shutdown` (the book teaches only `shutdown`; `protect` /
  `restrict` are rejected as invalid values, not silently accepted), `line console 0`, `line vty 0 4`, `password …`,
  `login`, `enable secret …`, `service password-encryption`, `banner motd <delim>…<delim>` (same non-alphanumeric
  delimiter first and last, ≤ 200 chars), `show port-security`, `show port-security interface <if>`, `show
  startup-config` (deterministic «nothing has been saved» simulation text — there is no save command). Every other
  input stays unknown / incomplete / invalid and never mutates state.
- **`show running-config`** now prints `service password-encryption`, `enable secret 5 <hidden>`, the banner, the
  port-security lines and the line blocks (`password 7 <hidden>` once encryption is on, `login`). Secrets are never
  echoed by any `show` output.
- **Stricter `config` validation** (`config.ts`, no refactor): per-property validators for interface / port-security /
  pool / VTP / line / device goal conditions (VLAN 1–4094, canonical interface names, IPv4 and masks, numeric ranges,
  the Port Security maximum), expectation `args` checked per command (unknown keys rejected), `startLine` required
  with `startMode: "line"`, preset keys validated. A malformed block still degrades to its static fallback.
- **Book exercises (twelve, all declarative):** m23 — PDF 182 guided from global config (interface f0/1 → access → the fixed MAC →
  violation shutdown, the book's four lines), 183 challenge (`switchport port-security` + sticky; only those two
  accepted, from interface f0/1 preset to access), 184 task (access + enabled + maximum 3 + violation shutdown, judged
  on final state). m24 — PDF 187 guided VTY box from user EXEC, 188 challenge Console box
  (`password`, `login` only), 189 task (both lines protected + `enable secret` + `service password-encryption`, six
  goals), 190 `show` challenge (`show running-config` then `show startup-config`; no configuration command accepted).
  m05 — PDF 193 guided (hostname, banner, interface, `no shutdown`), 194 challenge (range, access VLAN, VLAN, trunk),
  195 challenge (VTP server / client, `enable secret`, a **fix-the-command** step: the book's `line vty 0-4` typo must
  be typed as `line vty 0 4`), 196 router task (dot1Q sub-interface + address), 197 task (Port Security digest). No
  exercise on PDF 180, 181, 185, 186, 191, 192, 198, 199. Tests drive all twelve with the book's own lines to
  completion and prove wrong values / wrong modes / the wrong interface keep them open; typed text never reaches
  events or analytics.

### Pedagogy applied

| Module | Clarifications | Inline practices | Worksheets (`practice-table`) | Closing review | CLI exercises |
| --- | --- | --- | --- | --- | --- |
| m23 | 5 (one per page) | 10 | 2 (device → result on 181 · command → function on 184) | 3 on PDF 184 | 3 (182 guided · 183 challenge · 184 task) |
| m24 | 7 (one per page) | 12 | 1 (access method → command on 186) | 3 on PDF 191 | 4 (187 guided · 188 challenge · 189 task · 190 show challenge) |
| m05 | 8 (one per page) | 14 | 1 (`show` command → group on 198) | 3 on PDF 199 | 5 (193 guided · 194 challenge · 195 challenge + fix · 196 task · 197 task) |

Practices are educational only (nothing stored, scored or ranked); every wrong-answer feedback says what to **check**
(«افحص …»), every question carries a two-step hint ladder, every page ends with practice.

### Publication: deployable ≠ published

`api/src/lib/learning-materials-registry.js` lists `m23` (21), `m24` (22), `m05` (23) after m22 — by order, never by
id. Nothing is auto-published: a real-registry test proves a class released through m22 exposes nothing of m23 / m24 /
m05, that publishing `[m01, m05]` shows exactly those two, that a mixed list canonicalizes by order, and that m06
remains the sole unpublishable skeleton (400). No class's `visibleModuleIds` changed.

### Deliberately NOT in this phase

No PDF 200+ (ACL m06, routing, NAT, WAN), no `protect` / `restrict` violation modes, no `copy running-config
startup-config` / `write memory` (so `show startup-config` is a fixed simulation text), no `show` commands beyond the
book's boxes (`show mac address-table`, `show ip route`, `show access-lists`, `show interfaces` … of PDF 198 are
reference text only), no OSPF / EIGRP / ACL commands, no answer reveal after the hint ladder, no persistence of CLI
sessions, no retroactive CLI exercises in m03 / m19 / m04 / Batch 8 modules, no change to any class's
`visibleModuleIds`.

### Where the next batch begins

**The next untouched page is PDF 200** (the sixth-batch cover «ACL · التوجيه · WAN»; the m06 skeleton's PDF 227 lives
in that batch).

## Batch 10 — مراجعة الأوامر · WAN · بروتوكولات التوجيه · قوائم التحكم ACL (source PDF 200–229) — m06 completed IN PLACE

The tenth content phase converts the book's sixth batch. The boundary was discovered from the book: **PDF 200 is the
«الدفعة السادسة · WAN والتوجيه و ACL وقاموس شامل» batch cover** (structural; its first line lists «مراجعة الأوامر · WAN ·
OSPF و EIGRP · ACL», its second «قاموس شامل للمصطلحات · كلمة الختام», its third «ملخّص بصري · أمثلة عملية · مرجع نهائي»).
**PDF 201–206 is «مراجعة الأوامر»** (six review boxes: basics, VLAN / Trunk, VTP / passwords, Router on a Stick, Port
Security, the `show` cards), **PDF 207–209 is «الشبكة الواسعة WAN»** (WAN, Frame Relay / ATM, HDLC / Metro Ethernet),
**PDF 210–222 is «بروتوكولات التوجيه»** (overview, Static Route, Distance Vector / Link-State, AD / METRIC, OSPF +
its R1 / R2 boxes, EIGRP + its R1 / R2 boxes, `show ip route`), **PDF 223–229 is «قوائم التحكم ACL»** (definition,
Standard ACL box, examples, additional examples, the historical m06 page «Extended ACL» at PDF 227, the QR trainings
page T27–T30, the QR final-exams page F01–F06) and **PDF 230 is the «مرجع نهائي · الملخّص الشامل» divider** (the final
reference: glossary, closing word, visual summary, worked examples). The batch is the cover's first line: **PDF
200–229, four sections, twenty-nine learner pages**. Conversion **stops before PDF 230**: no converted body has
`pdfPageStart >= 230` and tests assert it (the Batch 9 maximum 199 is pinned too).

### Three NEW stable ids, the historical m06 completed IN PLACE — no skeleton remains

- **`791381-m25` «مراجعة الأوامر»**, order 24, source 200–206 (PDF 200 only in the module's coarse source range +
  `sourceNote`). One lesson `l01` مراجعة أوامر Cisco (201–206).
- **`791381-m26` «الشبكة الواسعة WAN»** (`shortTitle` «WAN»), order 25, source 207–209, one lesson `l01` WAN وتقنياتها.
- **`791381-m27` «بروتوكولات التوجيه»** (`shortTitle` «التوجيه»), order 26, source 210–222. Lessons `l01` أساسيات
  التوجيه (210–213) · `l02` OSPF (214–217) · `l03` EIGRP و show ip route (218–222).
- **`791381-m06` «قوائم التحكم ACL»** (`shortTitle` «ACL»), order 27, source 223–229 — the Phase-2 skeleton whose one
  historical page `-l01-p01` (PDF 227 «Extended ACL», printed 225) was the only known content. **Decision: complete
  in place** (like m03 / m04 / m05 before it): module id, title, shortTitle, the lesson id `791381-m06-l01`
  («التحكم بالوصول») and the historical page id, title, mapping and keywords are byte-for-byte unchanged; only its
  `order` moved (1 → 5) because PDF 223–226 precede it as new stable ids `-l01-p02` … `-l01-p05` (orders 1–4). A new
  lesson `l02` تدريبات وامتحانات (228–229) closes the module and the course. Manifest `order` is the sole authority;
  a test pins the historical line.
- **b6** («ACL · التوجيه · WAN») = `[m25, m26, m27, m06]`; b4 / b5 unchanged. Every module of the 791381 manifest now
  has a body: nothing is shown as «قيد الإعداد» and the server registry lists all 27 modules. Batch 6–9 bodies
  (m03, m19, m04, m20–m24, m05) are untouched.

### Source map and module structure

| Section | Source PDF | Module | `order` | Batch | Lessons |
| --- | --- | --- | --- | --- | --- |
| «مراجعة الأوامر» | **200 (batch cover) · 201–206** | `791381-m25` (new) | 24 | b6 | `l01` مراجعة أوامر Cisco (201–206) |
| «الشبكة الواسعة WAN» | **207–209** | `791381-m26` (new) | 25 | b6 | `l01` WAN وتقنياتها (207–209) |
| «بروتوكولات التوجيه» | **210–222** | `791381-m27` (new) | 26 | b6 | `l01` أساسيات التوجيه (210–213) · `l02` OSPF (214–217) · `l03` EIGRP و show ip route (218–222) |
| «قوائم التحكم ACL» | **223–229** | `791381-m06` (completed in place) | 27 | b6 | `l01` التحكم بالوصول (223, 224, 225, 226, 227) · `l02` تدريبات وامتحانات (228–229) |

- **1 source page → 1 interactive page** (twenty-nine pages); printed page = page circle = PDF index everywhere
  except the historical m06 page, which keeps its historical printed number 225; no split or merge. PDF 228 (QR
  trainings) and 229 (QR exams) carry a `conversionNote`; their cards are static provenance, and since the
  Learning-Practice T05–T30 phase they also carry `library-training` blocks `lt27..lt30` (Reader position 214) and
  `lf01..lf06` (Reader position 215, «امتحانات نهائية للتدريب»).
- **CLI fidelity:** the twelve «Cisco CLI» boxes (PDF 201–205, 216, 217, 220, 221, 224, 225, 226) are `code` blocks
  (`language: "cli"`, origin book) with the book's exact lines and prompts — the generic `Device(config)#` /
  `Device(config-if)#` prompts and PDF 224's `Router(config)#` / `Router(config-if)#` kept verbatim — each followed
  by the command / annotation table with an LTR command column. The visible wildcard of the shared /30 link on PDF
  216 / 217 is `0.0.0.3` (a hidden text layer says 0.0.0.255; the rendered page wins). PDF 222's `show ip route`
  sample and PDF 227's two-line `access-list 100 / permit tcp any any eq 80` example are book `code` blocks too.
  The book's figures (PDF 215 / 219 topologies, PDF 223 rule drawing) are carried as book tables / cards.

### CLI simulator extension (v1, same activity `simulation / cli-terminal / v1`)

Batch 8's simulator is extended **only with the lines the book prints on PDF 201–229**; the registry entry, the
component and the exercise kinds are unchanged (the allowlist stays fourteen entries).

- **New mode:** router configuration `(config-router)#` (Arabic label «وضع إعداد التوجيه»), entered from global
  config by `router ospf <1–65535>` or `router eigrp <1–65535>`, left by `exit` (→ global) or `end`. One process per
  protocol: re-entering the same number keeps its networks, a different number starts afresh. The device state
  gains `routing.ospf` / `routing.eigrp` (id + network statements), `selectedRouter`, `acls` (numbered lists of
  canonical entries) and each interface an optional `accessGroup` (`{ acl, direction }`). There is no `startMode:
  "router"` initial state: an exercise that asks for it starts in global config and enters the process itself.
- **`network` has three book forms in ONE grammar entry:** the DHCP pool form `network <address> <mask>` (Batch 8),
  the OSPF form `network <address> <wildcard> area <n>` and the EIGRP form `network <address>`. The shape is decided
  by the tokens; the engine then checks it against the mode and the selected process — the EIGRP form inside OSPF
  is «incomplete» («في OSPF المطلوب: network <address> <wildcard> area <n>»), the OSPF form inside EIGRP is «invalid»
  («في EIGRP لا نكتب area»: the book's PDF 220 «تذكّر»), the DHCP form in a process is wrong-mode. None mutates state.
- **New commands (closed grammar):** `router ospf` / `router eigrp`, the two routing `network` forms, `access-list
  <1–99> permit|deny (<address> <wildcard> | host <address> | any)`, `access-list <100–199> permit|deny
  tcp|udp|icmp|ip <source> <destination> [eq <port>]` (the book prints the `tcp … eq 80` form and names TCP / UDP /
  ICMP and the ports 80 / 443 on PDF 227; `eq` only with tcp / udp), `ip access-group <n> in|out` (interface mode,
  one list per interface in this simulation), `show ip route`. Everything else (`ip route`, `router rip`, named
  `ip access-list`, `access-class`, `show access-lists`, `no access-list`, `router-id`, `passive-interface`) stays
  unknown and never mutates state. Entries and network statements are de-duplicated; order is authored order.
- **`show ip route`** prints the connected routes of every interface that is up and addressed (`C <network>/<len>
  is directly connected, <interface>`), and — because there is only one device and no neighbours — says that routes
  learned via OSPF / EIGRP appear only after neighbours exchange updates instead of inventing R / O / D lines. The
  book's PDF 222 sample (with R and O lines) is quoted as book output on that page. `show running-config` now prints
  the `router` blocks, the `access-list` lines and ` ip access-group` under the interface.
- **Config validation by grammar round-trip** (`config.ts`): a routing `network` text, an ACL `entry` text and an
  interface `accessGroup` text are accepted only when the RUNTIME parser reads them back to exactly the same
  canonical string (`network 10.0.0.0 0.0.0.3 area 0`, `access-list 30 permit host 192.168.1.10`, `ip access-group
  40 in`), so a goal can never name a line the learner could not type; expectation `args` gained `form`, `wildcard`,
  `area`, `protocol`, `number`, `action` (permit / deny beside shutdown), `source`, `destination`, `port`,
  `direction` and `what: "ip-route"`, each checked with the runtime validators.
- **Book exercises (fifteen, all declarative):** m25 — PDF 201 task (hostname R1 + an addressed, up g0/0), 202 task
  (VLAN 10 on f0/1–10 and trunk on f0/24: the teacher's uplink scenario), 203 challenge (VTP server / client, `enable
  secret`, `line vty`, then a **fix-the-command**: «line console 1» → `line console 0` after `exit`), 204 challenge
  (sub-interface, dot1Q, address), 205 guided (inside f0/1: access, maximum 2, violation shutdown), 206 `show`
  challenge (the six show commands of the two cards on a preset device; only `show` advances). m27 — PDF 216 guided
  (`router ospf 1` + the two `network … area 0` lines), 217 challenge (R2), 220 guided (`router eigrp 100` + two
  classful networks), 221 task (R2: AS 100 + both networks, judged on final state), 222 `show ip route` challenge on
  a preset R1 with two addressed interfaces. m06 — PDF 224 guided (write the list, select g0/0, apply `out`), 225
  challenge (the three standard rules; only `access-list` accepted), 226 task (list 30 `host`, list 40 network,
  applied `in` on g0/0 — the page's «خطأ شائع» is the point), 227 challenge (the book's HTTP line, then the same
  rule for the port 443 the page names). No exercise on PDF 207–215, 218, 219, 223, 228, 229. The `allowed` gate of a
  challenge refuses unlisted NON-navigation commands without executing them; navigation / inspection commands
  (`enable`, `configure terminal`, `exit`, `end`, `interface`, `vlan`, `line`, `router`, `show`, …) keep the existing
  exercise behaviour and are never refused. The PDF 202 task lists one goal per port f0/1 … f0/10 (the book's
  `interface range f0/1-10`), so configuring only the first and the last port cannot complete it. Tests drive all
  fifteen with the book's own lines to completion and prove wrong values / wrong modes / the wrong process, port,
  interface or direction keep them open; typed text never reaches events or analytics.

### Pedagogy applied

| Module | Clarifications | Inline practices | Worksheets (`practice-table`) | Closing review | CLI exercises |
| --- | --- | --- | --- | --- | --- |
| m25 | 6 (one per page) | 14 | 1 (show command → card group on 206) | 3 on PDF 206 | 6 (201 task · 202 task · 203 challenge + fix · 204 challenge · 205 guided · 206 show challenge) |
| m26 | 3 (one per page) | 8 | 1 (description → WAN technology on 209) | 3 on PDF 209 | 0 |
| m27 | 13 (one per page) | 27 | 1 (routing source → AD value on 213) | 3 on PDF 222 | 5 (216 guided · 217 challenge · 220 guided · 221 task · 222 show challenge) |
| m06 | 7 (one per page) | 13 | 1 (token → meaning of the Extended example on 227) | 3 on PDF 229 | 4 (224 guided · 225 challenge · 226 task · 227 challenge) |

Practices are educational only (nothing stored, scored or ranked); every wrong-answer feedback says what to **check**
(«افحص …»), every question carries a two-step hint ladder, every page ends with practice.

### Publication: deployable ≠ published

`api/src/lib/learning-materials-registry.js` lists `m25` (24), `m26` (25), `m27` (26) and `m06` (27) after m05 — by
order, never by id. With them, every module of the manifest is listed: the registry no longer has a skeleton to
withhold, so the tests that used m06 as the «unpublishable skeleton» example now use an id outside the manifest
for the unknown-id cases (`791381-m28` at the time; since the final summary made m28 real, that sentinel is
`791381-m29`). Nothing is auto-published: a real-registry test proves a class released
through m05 exposes nothing of Batch 10, that publishing `[m01, m06]` shows exactly those two, and that a mixed list
canonicalizes by order with m06 last. No class's `visibleModuleIds` changed.

### Deliberately NOT in this phase

No PDF 230+ (the final reference: glossary, closing word, visual summary, worked examples), no static routes (`ip
route`), no RIP configuration, no named ACLs / `access-class` / `show access-lists` (not on these pages), no
`protect` / `restrict`, no learned-route simulation between devices (one device only), no save commands, no answer
reveal after the hint ladder, no persistence of CLI sessions, no retroactive exercises in earlier modules, no change
to any class's `visibleModuleIds`.

### Where the next batch begins

**The next untouched page was PDF 230** (the «مرجع نهائي · الملخّص الشامل» divider); the final summary phase below
converts it as the last module `m28`.

## Final summary — الملخّص الشامل (source PDF 230–264) — m28, the LAST module

The closing phase converts the book's final reference. Discovered from the rendered pages: **PDF 230 is the section
cover «مرجع نهائي — الملخّص الشامل · أهمّ المفاهيم والأوامر والمصطلحات في سبعة أقسام متسلسلة»** (structural, not a learner
page — recorded like every earlier section cover as the module's coarse source start + `sourceNote`); **PDF 231–262
are the seven summary sections** under the running header «الملخّص الشامل · <section>»; **PDF 263 is «كلمة الختام»**
(the author's closing word, no printed number); **PDF 264 is the back cover** (title, description, the six batches
with their page ranges, the QR to the trainings site, the author and 2026–2027 — metadata only, **not converted**).
The book has no glossary pages: the cover's «قاموس شامل» line names the summary tables themselves.

**Printed pages:** the page circle of PDF 231–262 shows the PDF index, but the running-header number is **229–260 =
PDF − 2**; `printedPage` records that header number (a test pins printed 229–260 ↔ PDF 231–262 and no printed number
for PDF 263).

### One NEW stable id, the summary grouping filled

- **`791381-m28` «الملخّص الشامل»** (`shortTitle` «الملخّص»), order **28** — after m06 (27), the last module of the
  course. Eight lessons in the book's section order: `l01` الأساسيات (231–236) · `l02` النماذج والبروتوكولات (237–240)
  · `l03` العنونة والتجزئة (241–244) · `l04` التبديل و VLANs (245–250) · `l05` التوجيه (251–253) · `l06` الأمان
  (254–257) · `l07` الخدمات والأوامر (258–262) · `l08` كلمة الختام (263). **33 learner pages, 1 book page → 1
  interactive page**, no split or merge.
- **Manifest:** only `{ id: "summary", label: "التلخيص", moduleIds: [] }` changed → `["791381-m28"]`. `intro` stays
  empty (the book's introduction pages were never converted into a module), b1–b6 unchanged, orders exactly 1..28.
  No b7: the final reference is the book's own «التلخيص» grouping.
- **Navigation:** m06 PDF 229 → m28 PDF 231 (230 skipped), 231 → … → 263; PDF 263 has no next page; PDF 264 never
  appears in the sequence. Batch 6–10 bodies are untouched (their shapes are pinned again).

### Source map

| Section | Source PDF | Lesson | Pages |
| --- | --- | --- | --- |
| cover «مرجع نهائي — الملخّص الشامل» | **230** | — (module source start only) | 0 |
| الأساسيات | **231–236** | `l01` | IP / MAC / Subnet / Gateway / Static vs DHCP + private ranges · IPv4 classes · numeral systems + the 128…1 boxes · devices → layer · cables / media / Straight-Cross-Roll-over · PAN / LAN / MAN / WAN / WLAN |
| النماذج والبروتوكولات | **237–240** | `l02` | OSI seven layers + «All People Seem To Need Data Processing» · protocol → port table + ARP / ICMP · TCP vs UDP · Data → Segment → Packet → Frame → Bit |
| العنونة والتجزئة | **241–244** | `l03` | special addresses + Unicast / Multicast / Broadcast · three solved subnetting examples + طريقة الحل · wildcard table + rule · IPv6 structure + shortening + special addresses |
| التبديل و VLANs | **245–250** | `l04` | VLAN / VTP / Trunk / DMZ / VPN · VLAN + Trunk CLI (+ `switchport trunk native vlan 99`) · VTP modes + CLI · Router on a Stick CLI · STP + flooding / learning · Metro-Ethernet + VLAN |
| التوجيه | **251–253** | `l05` | Static / Dynamic / Default + `ip route 192.168.2.0 255.255.255.0 10.0.0.2` · AD table · RIP / OSPF / EIGRP / BGP comparison + the OSPF / EIGRP lines |
| الأمان | **254–257** | `l06` | attacks table + الوقاية · Port Security CLI + Shutdown / Restrict / Protect · console / vty / enable secret / encryption + SSH · Standard / Extended ACL + the four ACL lines |
| الخدمات والأوامر | **258–262** | `l07` | NAT / PAT / APIPA · DORA + DHCP pool CLI + `ipconfig /release` / `/renew` · TCP three-way handshake · open-a-website DNS → ARP → TCP → HTTP/HTTPS · Windows CMD table + `show` table + «تمّ بحمد الله» |
| كلمة الختام | **263** | `l08` | the four closing sentences + المؤلف (static, respectful, no forced quiz) |
| back cover | **264** | — (not converted) | 0 |

- **Content fidelity:** every summary table is a book `table` with the printed values (classes, ports, AD, wildcard,
  IPv6 shortening steps, attacks, CMD / show); the book's «الفكرة» / «تذكّر» / «للتذكّر» / «انتبه» / «القاعدة» /
  «الوقاية» / «شرط أساسي» / «النتيجة» boxes are book callouts; the nine CLI boxes (PDF 246, 247, 248, 251, 253, 255,
  256, 257, 259) are book `code` blocks with the exact lines and prompts (`Device(config)#`, `Switch(config)#`,
  `R(config)#`, `Router(config)#`, `R(dhcp-config)#`, the «/» that joins two commands on one printed line), each
  followed by its command table (LTR command column). Arrow glyphs are written as «ثم»; technical tokens are LTR code
  spans. Summary pages stay summaries: nothing beyond the book's own lines is added to a book block.
- **Teacher enrichment:** exactly one «توضيح المعلّم» per page (33), 1–2 practices per page (41 inline practices:
  21 multipleChoice · 6 trueFalse · 14 shortInput · **0 fillBlank**; 16 `practice-table` worksheets: private /
  public, class from the first octet, device → layer, cable → use, network scope, protocol → port, TCP / UDP /
  both, PDU per layer, special address → meaning, mask → wildcard, AD per source, attack → description, NAT / PAT /
  APIPA, open-a-website step order, CMD command → task, show command → function), two-step hint ladders,
  «افحص …» incorrect feedback, an explanation and a correct-feedback line on every practice. The module review
  (`مراجعة الوحدة`, r1–r3) sits on PDF 262 — the last content page — so that PDF 263 stays static.

### CLI simulator — final-reference extensions (v1, same activity `simulation / cli-terminal / v1`)

The engine is extended **only where these pages require it**; no second simulator, no `cmd` framework, the registry
stays fourteen entries.

- **PDF 246 → `switchport trunk native vlan <1–4094>`** (interface mode; a new interface prop `nativeVlan`; printed
  by `show running-config` right after the allowed list; invalid ids and wrong modes are inert; the existing
  `switchport trunk allowed vlan` entry is untouched; new interface-condition prop `nativeVlan`).
- **PDF 251 → the minimal static route `ip route <network> <mask> <next-hop>`** (global mode), including the
  default route `ip route 0.0.0.0 0.0.0.0 <next-hop>` from the book's Default Route card. No exit-interface,
  distance, permanent or track variants (those forms are unknown / invalid and never mutate). Routes are stored in
  authored order without duplicates (`staticRoutes`), the network must match its mask, a half-default route is
  rejected; `show running-config` prints them between the interfaces and the routing processes; `show ip route`
  prints `S <net>/<len> [1/0] via <next-hop>` and `S* 0.0.0.0/0 …` with the «Gateway of last resort» line — only
  from configured statics, never an invented learned route (the Batch 10 output without statics is unchanged).
  New condition kind `static-route` (`route` text round-trips through the grammar; `count`), `ip-route` expectation
  args with a per-command mask rule (0.0.0.0 is valid only for the route, never for `ip address`).
- **PDF 253 → EIGRP `network <address> [<wildcard>]`**: two values that form a contiguous subnet mask remain the DHCP
  pool form; any other wildcard is the EIGRP form; the plain `network <address>` of PDF 220–221 still works; OSPF
  still requires `area` (the EIGRP forms under `router ospf` stay «incomplete — area missing», the OSPF form under
  `router eigrp` stays «invalid — no area in EIGRP» with the widened syntax in the message); a wildcard typed inside
  a DHCP pool is still «قناع الشبكة غير صالح»; the selected process is authoritative. EIGRP statements are stored as
  canonical texts («10.0.0.0» or «192.168.1.0 0.0.0.255»), de-duplicated; an EIGRP network condition accepts either
  text through the grammar round-trip.
- **PDF 255** names Shutdown / Restrict / Protect in prose but prints only `violation shutdown`: restrict / protect
  are NOT added (a practice distinguishes them). **PDF 262**'s Windows commands (`ping`, `tracert`, `ipconfig`,
  `ipconfig /all`, `nslookup`, `arp -a`) are practised in a worksheet and never enter the Cisco simulator; of its six
  `show` commands the simulator answers `show vlan brief` and `show vtp status` (a test proves `show interfaces
  trunk` is refused without state change).
- **Ten declarative exercises:** 246 task (VLAN 10 / SALES, f0/1–10 access — one goal per port, f0/24 trunk with
  allowed 10,20,30 and native 99: 14 goals) · 247 guided VTP · 248 guided Router on a Stick · 251 task (static +
  default route, `allowed: ["ip-route"]`) · 253 challenge (OSPF with area, EIGRP with wildcard) · 255 guided Port
  Security (starts inside f0/1, ends with `violation shutdown`) · 256 task (console / vty password + login, enable
  secret, encryption: 6 goals) · 257 task (both ACL lines applied — 10 out on g0/0, 100 in on g0/1, a teaching
  scenario the clarification states) · 259 task (pool STUDENTS + exclusion: 5 goals) · 262 show challenge on a preset
  switch. Tests: `src/learning/cli/engine.summary.test.ts` (grammar / engine / show / config for the three
  additions, DHCP and OSPF non-regression, hostile input) and the guard suite below (every exercise driven to
  completion through the real engine with negative paths).

### Publication: deployable ≠ published

`api/src/lib/learning-materials-registry.js` appends `{ 791381-m28, الملخّص الشامل, 28 }` after m06 — by order, never
by id. m28 is **publishable on explicit request only**: real-registry tests prove that a class released through m06
sees nothing of m28 (its student payload has 27 modules and no «الملخّص»), that publishing `[m01, m28]` shows exactly
those two, that a mixed list canonicalizes by order with m28 LAST, that the class document is byte-unaffected, and
that `791381-m29` — the new unknown-id sentinel now that m28 is real — is rejected (400 / thrown / absent / no body).
No class's `visibleModuleIds` changed.

### Guard suite

`src/learning/content/791381/summary.m28.test.ts` pins: exactly one new module m28 at order 28 (the last); summary
grouping = [m28], intro unchanged; 33 pages = PDF 231–263 exactly (230 / 264 are not learner pages, the whole
course has no duplicate PDF index, maximum source page 263, no PDF 264 body); printed 229–260 ↔ PDF 231–262 and none
for 263; navigation 229 → 231 → … → 263 → null; manifest TOC = body; whole-course validation = zero issues;
fidelity spot checks of the tables and the nine CLI boxes; pedagogy / provenance / direction rules (no fillBlank, no
raw HTML, no arrow glyphs, column directions, LTR tokens); the ten exercises resolve via `cli-terminal`, registry =
14, Windows commands and restrict / protect never in a simulator config; every exercise completes with the book's
lines and stays open on the documented wrong inputs; no summary text leaks into earlier bodies; earlier simulator
configs carry none of the new additions; Batch 6–10 shapes unchanged; frontend ↔ server agreement (28, m28 last);
m29 unknown. API suites: the m28 real-registry test + the m28 → m29 sentinel migration in
`class-learning-materials`, `learning-materials-registry` and `student-learning-materials`.

### Deliberately NOT in this phase

No PDF 264 body (back cover), no glossary module (the book has none), no b7 grouping, no restrict / protect, no
`ip route` exit-interface / distance / permanent / track forms, no RIP / BGP configuration, no `show interfaces
trunk` / `show mac address-table` / `show interfaces status` / `show spanning-tree` simulation, no Windows command
simulator, no learned-route simulation, no save commands, no answer reveal, no CLI session persistence, no
retroactive exercises in earlier modules, no change to approved Batch 1–10 bodies beyond the pins that became real
because m28 exists, no change to any class's `visibleModuleIds`.

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
| Class Learning Materials | Class assignment + progressive module release + «موادي التعليمية» + filtered shared Reader + default-deny student access | done |
| Learning Practice & Unified Strength | Book trainings T01–T04 as `library-training` blocks + the shared Training Runner + server grading/best-score storage; inline `practice-table` worksheets (PDF 29 / 32); Unified Strength Points (exams + trainings + projects) on the existing six-rank ladder; Learning Materials desktop inset. Unit 4 conversion still paused. | done (awaiting review) |
| **Project Performance, Achievement Hub & Profile Identity (this)** | Teacher stage scores → project grade /100 → project Strength /600 + six-band project rank (per project); generic achievement events (global/project rank-up, completion) with privacy + reactions + lifetime recognition; Achievement Hub «تقدّمي وقوتي»; teacher-managed student photo + preset avatars; teacher name / preset / own photo identity. Unit 4 still paused. | done (awaiting review) |
| **Units 4–6 (this)** | Book 791381 source PDF **34–60** as complete modules `m08` (Class/Subnet/CIDR, order 4), `m09` (أجهزة الشبكات, order 5), `m10` (أنواع شبكات الاتصال, order 6); PDF 47 divider not rendered; interactive `PracticeBlockView`; activities `cidr-network-host/v1`, `gateway-flow/v1`, `hub-switch-router-flow/v1`, `network-topologies/v1`; server publication registry lists m08–m10 (publishable, never auto-published) | done (awaiting review) |
| **Units 7–8 (this)** | Book 791381 source PDF **61–75** as complete modules `m11` (الكوابل وعنوان MAC, order 7) and `m12` (أنواع الرسائل + the batch-2 summary PDF 75, order 8); b2 = m09–m12; activities `cable-comparison/v1`, `mac-address-anatomy/v1`, `message-delivery/v1`, `broadcast-address/v1` (registry = 10); server publication registry lists m11–m12 (publishable, never auto-published); PDF 76+ untouched | done (awaiting review) |
| **Batch 3 (this)** | Book 791381 source PDF **76–86** (PDF 76 divider not rendered) as complete module `m13` («نماذج الاتصال: OSI و TCP/IP», order 9); b3 = [m13]; m03–m06 shift to orders 10–13; activity `osi-layers/v1` (registry = 11); server publication registry lists m13 (publishable, never auto-published); PDF 87+ («البروتوكولات») untouched; two deferred PR #122 cleanups applied | done (awaiting review) |
| **Batch 4 (this)** | Book 791381 source PDF **87–106** as complete modules `m14` («البروتوكولات», order 10), `m15` («أوامر فحص الشبكة», order 11), `m16` («المجالات والمفاهيم» + the PDF 106 trainings page, order 12); b3 = [m13, m14, m15, m16]; m03–m06 shift to orders 13–16; activity `network-domains/v1` (registry = 12); server publication registry lists m14–m16 (publishable, never auto-published); PDF 107+ (Part 2: security …) untouched; PR #123 cleanups A–C applied | done (awaiting review) |
| **Batch 5** | Book 791381 source PDF **107–119** (PDF 107 part cover not rendered) as complete modules `m17` («أمان الشبكات», order 13) and `m18` («تجزئة البيانات» + the PDF 119 trainings page, order 14); b3 = [m13 … m18]; m03–m06 shift to orders 15–18; activity `tcp-handshake/v1` (registry = 13); server publication registry lists m17–m18 (publishable, never auto-published); next batch begins at PDF 120 | done (merged) |
| **Batch 6** | Book 791381 source PDF **120–138** (PDF 120 batch cover not rendered) as the historical skeleton `m03` («برمجة السويتش CLI و VLAN», order 15) **completed in place** — historical page ids `-l01-p01` (PDF 123) / `-l01-p02` (PDF 124) preserved with unchanged titles and mappings, PDF 121–122 as new stable ids placed first by `order`; four lessons, eighteen pages, seven CLI `code` blocks, no new activity (registry stays 13); server publication registry lists m03 (publishable, never auto-published); m04–m06 untouched; next untouched page = PDF 139 | done (merged) |
| Batch 7 | Book 791381 source PDF **139–157** (PDF 139 / 145 section covers not rendered) as NEW module `m19` («إدارة VLAN: VTP», order 16, PDF 140–144) and the historical skeleton `m04` («Trunk و Router on a Stick», order 17, PDF 146–157) **completed in place** — historical page `-l01-p01` (PDF 148) preserved with unchanged title and mapping, PDF 146–147 as new stable ids placed first by `order`; five CLI `code` blocks, no new activity (registry stays 13); server publication registry lists m19 and m04 (publishable, never auto-published); m05–m06 shift to orders 18–19; next untouched page = PDF 158 | done (awaiting review) |
| Batch 8 | Book 791381 source PDF **158–179** (PDF 158 batch cover not rendered) as NEW modules `m20` («Wi-Fi والشبكات اللاسلكية», order 18, PDF 159–165), `m21` («IPv6 والمنافذ», order 19, PDF 166–168) and `m22` («بروتوكول DHCP», order 20, PDF 169–179); two CLI `code` blocks; **the interactive CLI teaching simulator** (`src/learning/cli/`, `simulation / cli-terminal / v1`, registry now 14) with three declarative book exercises on PDF 172–174; server publication registry lists m20–m22 (publishable, never auto-published); m05–m06 shift to orders 21–22; next untouched page = PDF 180 | done (awaiting review) |
| Batch 9 | Book 791381 source PDF **180–199** (PDF 200 sixth-batch cover not rendered) as NEW modules `m23` («Port Security», order 21, PDF 180–184) and `m24` («حماية أجهزة Cisco», order 22, PDF 185–191) and the historical skeleton `m05` («مرجع أوامر Cisco», order 23, PDF 192–199) **completed in place** — historical pages `-l01-p01` / `-l01-p02` (PDF 193–194) preserved with unchanged ids, titles and mappings, PDF 192 as a new stable id placed first by `order`; twelve CLI `code` blocks; the CLI simulator extended with line mode, Port Security, password / secret / banner and two `show` commands (registry stays 14) plus twelve declarative exercises; server publication registry lists m23, m24, m05 (publishable, never auto-published); m06 shifts to order 24; next untouched page = PDF 200 | done (awaiting review) |
| Batch 10 | Book 791381 source PDF **200–229** (PDF 200 sixth-batch cover not rendered) as NEW modules `m25` («مراجعة الأوامر», order 24, PDF 201–206), `m26` («الشبكة الواسعة WAN», order 25, PDF 207–209), `m27` («بروتوكولات التوجيه», order 26, PDF 210–222) and the historical skeleton `m06` («قوائم التحكم ACL», order 27, PDF 223–229) **completed in place** — historical page `-l01-p01` (PDF 227, printed 225) preserved with unchanged id, title and mapping, PDF 223–226 as new stable ids placed first by `order`; twelve CLI `code` boxes; the CLI simulator extended with the router mode (OSPF / EIGRP `network` forms), numbered standard / extended ACLs, `ip access-group` and `show ip route` (registry stays 14) plus fifteen declarative exercises; server publication registry lists m25, m26, m27, m06 (publishable, never auto-published) — every manifest module now has a body; next untouched page = PDF 230 | done (merged) |
| **Final summary (this)** | Book 791381 source PDF **230–264** (PDF 230 section cover and PDF 264 back cover not rendered) as the NEW module `m28` («الملخّص الشامل», order 28, the LAST module; fills the manifest's «summary» grouping) — eight lessons, 33 learner pages PDF 231–263 (printed 229–260 for 231–262), nine CLI `code` boxes; the CLI simulator extended with `switchport trunk native vlan`, the minimal static / default route `ip route … <next-hop>` (shown as `S` / `S*` routes) and the EIGRP optional wildcard (registry stays 14) plus ten declarative exercises; server publication registry lists m28 (publishable, never auto-published); the unknown-id test sentinel moves to `791381-m29`; the book is fully converted | done (awaiting review) |
| **Learning Practice T05–T30 / F01–F06 (this)** | The remaining 32 Exam-Library items connected to the six book review pages (Reader positions 98, 110, 145, 178, 214, 215) as metadata-only `library-training` blocks, one per real library id, grouped as the book groups them; the ONE server registry extended to the full catalog with the catalog's titles and pageRange-derived gates; the shared runner extended to the F-series shapes (matching, open / manual review) with no second surface; no external QR / GitHub Pages links, no question copies, no assignment / gradebook / publication change | done (awaiting review) |
| 4 | Interactive Practice — remaining inline checking families beyond closed-choice worksheets (free text, ordering, evaluator-backed hints) | deferred |
| 5 | Simulations — real VLAN/subnet/CLI/… renderers registered behind the Phase-3A engine | deferred |
| 6 | Student Progress — last page, completion, attempts (separate domain; attaches to the no-op event seam) | deferred |
| 7 | Teacher Content Management — editors, publish/unpublish | deferred |
| 8 | AI Learning Assistant | deferred |

Phase 3 shipped the Reader **shell** first (synthetic/test content + the "قيد الإعداد" state for the real book).
**PDF → native content conversion started in Phase 3B** and proceeds in small contiguous page ranges, each verified
against the rendered source: **m01 (Unit 1) and m02 (Unit 2) are complete**, and **Phase 3E continues with Unit 3
(«عناوين IP», module `m07`)**; Units 4–6 (`m08`–`m10`, PDF 34–60) followed. Later units remain skeleton-only until their batch. The source PDF remains the
authoritative source and is never bundled into production.
