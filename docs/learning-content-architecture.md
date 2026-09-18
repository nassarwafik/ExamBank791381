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

`text` · `heading` · `image` · `callout` · `example` · `table` · `code` · `diagram` · `practice` · `simulation`.

- **text** — safe inline `spans` (`strong`/`em`/`term`/`code`, optional per-span `dir`). No raw HTML.
- **callout** — `remember` · `important` · `warning` · `tip` · `summary` · `clarification` (maps to book boxes تذكّر / الخلاصة / الفكرة; `clarification` is the separable teacher note, always `origin:"teacher-enrichment"`).
- **example** — `mode: "solved" | "practice"` (default `solved`), `title?` + `prompt?` + structured `steps[]` + `result?` + `explanation?` (never one blob string). Solved = مثال محلول; practice = مثال للحل.
- **table** — `headers[]` + `rows[][]` (not an HTML string).
- **code** — `language: cli|text|config`, whitespace preserved, usually `dir:"ltr"`.
- **image / diagram** — local `src`, `alt` **required unless `decorative`**; diagram is metadata + image only (no sim behavior).
- **practice** — lightweight interactive practice with immediate-feedback readiness. Question kinds `multipleChoice` / `trueFalse` / `shortInput` / `fillBlank`, plus a `feedback` object (`hint` / `correctFeedback` / `incorrectFeedback` / `explanation`). **Not** the ExamBank exam schema, not graded, not a rank/medal input. *Extension path:* richer kinds (matching, ordering, classify, binary-entry, IP/CIDR, CLI) are added as new union members (or expressed as `simulation`) without touching existing ones.
- **simulation** — a typed placeholder descriptor (`simulationType` + `title` + `description`); detailed configs are Phase 5.

Every block also carries two optional provenance fields (see *Book Fidelity* below): `origin` and a block-level `source`.

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
`duplicate-order`, `missing-source`, `invalid-source-page`, `source-id-mismatch`, `invalid-origin`,
`invalid-example-mode`, `unsupported-block-type`, `image-missing-alt`, `invalid-direction`, `quiz-empty-options`,
`quiz-mcq-answer-count`, `unsupported-simulation-type`, `invalid-table-row`.

`source-id-mismatch` enforces that every `source.sourceId` (page, module, or block level) equals the course id —
content can never reference another book by accident.

**Normalization policy: none.** A validator validates. It never reorders content, invents ids/titles/source pages,
generates answers, or rewrites Arabic. Any future normalization is a separate, explicit converter tool.

## Batches → modules

The six Phase-1 overview "batches" are **presentation groupings**; each maps to one **or more** real modules
(`manifest.batches[].moduleIds`). Batches are not part of the canonical Course→Module hierarchy and never distort it.

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

Every block declares its provenance; the model keeps book content and added enrichment visibly separate:

```ts
origin?: "book" | "teacher-enrichment"   // omitted ⇒ "book"
```

- `"book"` — content directly based on the source book.
- `"teacher-enrichment"` — added to improve learning: extra solved/practice examples, hints, interactive practice,
  immediate feedback, diagrams, simulations, explanatory notes, clarifications.

AI-generated provenance is **not** introduced now (AI is Phase 8).

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

First-class but used **only where interaction genuinely improves understanding** (not on every page). Ready types:
`network-flow`, `binary-box`, `subnet`, `vlan`, `cli`. Phase 2 stores only a typed descriptor; behavior/config is
Phase 5, resolved through a controlled registry (never by executing a name from data).

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

## Interactive Page Design Principles (Phase 3 rendering — not implemented here)

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

## Phase boundaries (not implemented here)

| Phase | Scope |
| --- | --- |
| **2 (this)** | Content schema, validation, navigation, lazy registry, `791381` skeleton manifest |
| 3 | Interactive Reader — TOC, previous/next, jump-to-page, page rendering |
| 4 | Interactive Practice — quiz rendering + immediate feedback |
| 5 | Simulations — binary-box, network-flow, subnet, VLAN, CLI |
| 6 | Student Progress — last page, completion, attempts (separate domain) |
| 7 | Teacher Content Management — editors, publish/unpublish |
| 8 | AI Learning Assistant |

PDF → native content conversion happens only **after** the schema and Reader are approved. The source PDF remains
the authoritative source and is never bundled into production.
