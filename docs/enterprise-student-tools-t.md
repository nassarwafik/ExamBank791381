# Phase T — Student Exam Tools (design record; T0 – T7)

> STATUS: T0 (this design), T1 (contract and data path), T2 (Builder panel, student tool bar, calculator, IPv4 calculator), T3
> (base converter, answer-risk notes, tools in the teacher preview, draggable panel) and T4 (function plotter) are implemented on
> branch `claude/stoic-brown-yscldn`. They are waiting for independent review and the owner's manual merge. An exam without
> `studentTools` looks, is delivered and is graded exactly as before. All four contract tools now have a student UI.

## 1. Goal

A teacher who builds an exam or a training activity can allow tools that the student opens whenever they want during the attempt:

| Tool | Contract id | What the student gets |
|---|---|---|
| Calculator | `calculator` | basic: + − × ÷ and brackets; scientific: also powers, roots, logarithms, trigonometric functions and their inverses, factorial, π, e, Ans, history |
| Number-base converter | `baseConverter` | conversion between the allowed bases (2, 8, 10, 16), optional step-by-step working |
| Function plotter | `graphPlotter` | up to 1–3 functions at once, zoom / pan, value at a point; optional analysis (intersections, extrema) |
| IPv4 / subnet calculator | `ipv4Calculator` | network, broadcast, first / last host, host count, mask, wildcard, class, scope; optional binary view and subnet split |

A tool appears **only** when the teacher enabled it for that exam, and the teacher can switch a tool off for a single section (for
example: calculator allowed, but not in the mental-arithmetic section).

## 2. Non-goals and honest limits

- **A tool isn't a proctoring control.** Hiding a tool only changes the platform's own UI; a student can always use a calculator
  outside the browser. The tools are about fairness and convenience. They don't prevent cheating (AGENTS.md §10: client-side
  checks are for display only).
- **No grading role.** The tools never read an answer key, never submit, never call the API with exam data, and never change a score.
  The grading paths are unchanged.
- **No free-form code.** No `eval`, no `Function`, no HTML. The calculator (T2) has its own bounded parser
  (`src/studentTools/calculatorEngine.ts`, §9). It deliberately does **not** reuse `src/parametricExpression.ts`: that engine is a
  grading authority with frozen languages, and calculator conventions (degrees, factorial, Ans, implicit multiplication, `log` = base
  10) must never change what a grading engine accepts. The IPv4 tool has its own strict grammar. The plotter (T4) will draw through
  `FunctionGraphView`.
- **No new infrastructure.** No storage migration, no new route, no new database. The configuration is one optional field on the exam.

## 3. Contract: `StudentToolsSpecV1` (`src/studentTools/studentToolsSpec.ts`)

```json
{
  "version": 1,
  "tools": [
    { "id": "calculator", "variant": "scientific", "angleUnit": "deg" },
    { "id": "baseConverter", "bases": [2, 8, 10, 16], "showSteps": false },
    { "id": "graphPlotter", "maxFunctions": 3, "showAnalysis": false },
    { "id": "ipv4Calculator", "showBinary": true, "allowSubnetting": false }
  ],
  "sectionOverrides": { "<sectionId>": { "disabled": ["calculator"] } }
}
```

Rules:

1. **Closed keys at every level.** An unknown key, a foreign key or `__proto__` / `constructor` / `prototype` makes the **whole**
   spec invalid. Only plain JSON objects are accepted.
2. **Versioned.** Only `version: 1` is accepted. New behaviour is a new version, never a reinterpretation of version 1.
3. **Ids.** Each tool appears at most once; an unknown id is refused, never ignored.
4. **Values.** `variant ∈ {basic, scientific}`, `angleUnit ∈ {deg, rad}`, `bases` ⊆ {2, 8, 10, 16} with at least two and no
   duplicates, `maxFunctions` an integer from 1 to 3, every flag a boolean.
5. **Section overrides.** At most 100. A section id is 1–120 characters with no control characters. `disabled` is non-empty, has no
   duplicates, and lists only tools enabled in the exam. The quality gate also requires that every override names an existing section.
6. **Canonical form.** `bases` sorted ascending, `disabled` in contract tool order, override keys sorted. Tools keep the teacher's order
   (it is the display order).
7. **All or nothing.** One issue ⇒ no value. A caller never uses a partially valid spec.

Absent (or `null`) means no tools, which is the state of every existing exam. Nothing is migrated.

### Adding a tool later

A new tool (formula sheet, ASCII table, truth tables, unit converter, periodic table, scratch pad …) is a reviewed contract change:
a new id with its closed key set in `studentToolsSpec.ts`, a catalog entry in `studentToolsCatalog.ts` (the T1 suite fails when the two
lists differ), then its UI. Tools whose configuration carries content (a formula sheet in rich content) must add a strict projection
for that content before they are accepted.

## 4. Data path

| Step | Where | Rule |
|---|---|---|
| Builder authoring | `StructuredExam.studentTools` (`src/examTypes.ts`), edited by `StudentToolsEditor` | the panel emits only canonical values, or removes the key when no tool is left |
| Builder quality gate | `validateStructuredExam` (`src/examQuality.ts`) | any contract issue or an override of a missing section is an **error**: it blocks a final save |
| Server finalization / governance | the same `examQuality` via the shared build (`scripts/build-shared-finalization.mjs`) | byte-identical rules; drift guarded by `api/tests/shared-finalization-drift-14a.test.js` |
| Assignment creation | `api/src/functions/manage-assignments.js` | a malformed spec ⇒ **400 `STUDENT_TOOLS_INVALID`**, nothing stored; a valid spec is stored **canonical** in the frozen `examSnapshot` |
| Freeze | the assignment's `examSnapshot` | later edits of the source exam don't change the tools of a published assignment |
| Student delivery | `sanitizeExamForStudent` (`api/src/lib/student-exam-sanitize.js`) | **canonical copy or nothing**, never a spread of the raw value |
| Pre-start screen | `preStartAssignment` (`api/src/functions/student-assignment.js`) | the same projection, so the start screen can announce the tools; the tools themselves open only in the started attempt |
| Teacher preview | `toSafePreviewExam` (`src/examPreviewModel.ts`) | the same projection: the teacher previews exactly what the student receives |

Why a malformed spec is refused at assignment creation but withheld at delivery: at creation the teacher is present and can fix it;
at delivery the only safe action is to remove a convenience. Withholding tools can't produce a zero, a lost answer or a changed
attempt (AGENTS.md §10, grading safety).

## 5. IPv4 calculator engine (`src/studentTools/ipv4Calculator.ts`)

The engine is pure and works on unsigned 32-bit integers. It is self-contained and deliberately does **not** import the frozen networkCli@1 / router CLI /
networkTopology engines: those are grading authorities, and a student convenience tool must never be able to change what they accept.

- Input: `a.b.c.d/n`, `a.b.c.d /n` or `a.b.c.d m.m.m.m`. Octets 0–255 with no leading zeros, a prefix from 0 to 32, a contiguous mask.
  Errors come back as a code plus an Arabic message.
- Output: address, prefix, mask, wildcard, network, broadcast, first / last host, total and usable counts, class (A–E), scope
  (private, public, loopback, link-local, shared address 100.64/10, multicast, reserved, this-network) and the dotted binary forms.
- Conventions: `/31` follows RFC 3021 (two usable addresses, no broadcast); `/32` is a single host; otherwise usable = 2^(32−n) − 2.
- Subnetting: split into a longer prefix (the count is exact, at most 64 rows are listed), the prefix for a host count, and the prefix
  for a subnet count.

## 6. Answer-revealing risk

Some tools can answer some questions outright: the IPv4 calculator answers "network / broadcast / host count" questions, the base
converter answers conversion questions. The catalog records this for each tool (`answerRisk`). The planned Builder behaviour:

- the settings panel shows the risk before the teacher switches a tool on (T2);
- an **advisory note** (never blocking: the teacher decides) names the questions an enabled tool could answer (T3, §10). It lives in
  the panel, not in the shared quality gate, so finalization, governance and the server never depend on a text heuristic;
- the section override lets the teacher keep a tool for one section and remove it from another (contract ready in T1).

## 7. Phases

| Phase | Scope | State |
|---|---|---|
| T0 | this design record | done |
| T1 | contract, catalog, IPv4 engine, quality gate, shared build, assignment gate, student / pre-start / preview projections | done (this branch) |
| T2 | Builder settings panel; student tool bar (floating window on desktop, bottom sheet on phone, lazy chunk, keyboard / screen reader, state kept per attempt); scientific calculator; IPv4 calculator UI | done (this branch) |
| T3 | base converter; answer-risk notes; tools in the teacher's exam preview; draggable panel | done (this branch) |
| T4 | function plotter on `FunctionGraphView` | done (this branch) |
| T5 | formula sheet (rich content, strict projection) and scratch pad | done (branch `claude/student-tools-t5`, stacked on T0–T4) |
| T6 | subject tools (ASCII table, bitwise calculator, truth tables, unit converter, periodic table) | done (branch `claude/student-tools-t6`, stacked on T5) |
| T7 | tools in the course books (learning materials); usage analytics deferred by the owner | done (branch `claude/student-tools-t7`, stacked on T6) |

Each phase is one branch and one PR and follows AGENTS.md §3.

## 8. Evidence for T1

- `src/studentTools/studentToolsSpec.t1.test.ts`: validation (every refusal code, prototype pollution, class instances, all or nothing),
  canonical form, the projection (smuggled keys withhold everything), per-section tools, the catalog ↔ contract pin, the Builder quality
  gate and the teacher preview.
- `src/studentTools/ipv4Calculator.t1.test.ts`: grammar, mask ↔ prefix for every prefix, textbook and edge analyses (/0, /20, /26, /31,
  /32, top of the address space), class / scope tables, subnet split bounds, host / subnet count prefixes.
- `api/tests/student-tools-t1.test.js`: the student sanitizer, the pre-start payload, the server finalization gate through the shared
  build, and assignment creation (a canonical value is frozen, a malformed one is refused with nothing stored, an exam without tools is
  unchanged).
- Fail-first: not applicable. T1 adds a feature and fixes no defect. The "exam without tools is unchanged" tests are **pins**.
- Mutation proof (the projection and the assignment gate are authority invariants): see the PR body for the campaign table.

## 9. T2 — what the student and the teacher see

### Builder: «أدوات الطالب»

`src/studentTools/StudentToolsEditor.tsx` appears under the cover panel in both the Studio setup step and the classic workspace.

- One row per contract tool: a switch, the description, and, once the tool is on, its answer-risk note (`answerRisk`) and its options
  (calculator: scientific / basic, degrees / radians; IPv4: binary view, subnet split).
- Tools whose student UI does not ship yet (`available: false` in the catalog) are marked «قريبًا» and can't be switched on.
- «الأدوات في كل قسم» (exams with more than one section): a table of sections × enabled tools; unticking a cell adds the tool to that
  section's `disabled` list.
- Each edit is re-validated, and only a canonical spec is emitted. Switching the last tool off removes `studentTools`. A tool's section
  overrides are dropped with it, and overrides of deleted sections are pruned (a banner offers it at once).
- A stored value that fails validation is reported, with one button that removes it.

### Student: the tool bar

- **Start screen.** «الأدوات المسموحة: …» names the tools from the pre-start projection, so the student knows before starting.
- **During the attempt.** `StudentToolDock` loads as its own lazy chunk, and only for an exam that has `studentTools`. It's offered only
  while the attempt is writable (`canWrite`, not expired, not strict-ended). It re-projects the value itself: a malformed one renders
  nothing.
- The «الأدوات» button lists the tools enabled for the **current section**. Moving into a section that disables the open tool closes it.
- The panel is non-modal (`role="dialog"`, `aria-modal="false"`): the question stays readable and answerable. Escape closes it and
  focus returns to the button. On a phone (≤ 640 px) the panel becomes a bottom sheet. It isn't printed.
- **State.** A tool, once opened, stays mounted (hidden when closed). Expression, last answer and history survive closing the panel
  and moving between questions for the whole attempt. Nothing is stored or sent, and leaving the page discards it.
- **Containment.** `ToolDockBoundary` wraps the dock (its chunk failing to load included), and each tool has its own boundary. A
  failure shows a quiet note, never reaches the exam's error boundary or render-failure accounting, and never triggers a page reload
  (a reload would end a strict attempt). That's why the dock uses a plain `lazy`, not `recoverableLazy`.

### Calculator (`calculatorEngine.ts`, `CalculatorTool.tsx`)

- **Grammar.** `+ − × ÷`, brackets, unary minus (`−2^2 = −4`), right-associative `^`, postfix `!`, `√`, implicit multiplication
  (`2π`, `2(3)`, `2sin(30)`). A number directly after a value (`2 3`) is a syntax error, never a product.
- **Functions.** `sin cos tan asin acos atan sqrt cbrt ln log exp abs`; `log` is base 10. Constants `π`/`pi` and `e`; `Ans` = the
  last result.
- **Angles.** In the teacher's unit; in degrees, exact values at the usual angles (`sin 180° = 0`, `tan 45° = 1`), and `tan 90°` is a
  domain error.
- **Basic variant.** The four operations, brackets and `Ans` only; anything else is `NOT_IN_BASIC`.
- **Bounds.** 200 characters, nesting depth 32, factorial ≤ 170.
- **Errors.** Every error has an Arabic message: division by zero, domain, overflow, syntax, unknown name, no previous result.
- **Display.** 12 significant digits (`0.1 + 0.2 = 0.3`), exponent form at or above 1e12 or below 1e-9.

### IPv4 calculator (`Ipv4CalculatorTool.tsx`)

- **Results.** Network, broadcast, first / last host, address count, usable hosts, mask, wildcard, prefix, class and scope (LTR values
  inside the RTL page); the binary table when `showBinary` is on.
- **Subnet split** (when `allowSubnetting` is on). By new prefix, by number of subnets, or by hosts per subnet. The exact count is
  shown, and at most 64 rows are listed.

### Evidence for T2

- `src/studentTools/calculatorEngine.t2.test.ts`: precedence, implicit multiplication, every function in both angle units, domain /
  division / overflow errors, Ans, the basic variant, bounds, non-JavaScript input, formatting.
- `src/studentTools/StudentToolDock.t2.test.tsx`: nothing rendered without valid tools; per-section listing; the keypad; state kept
  across close / reopen and sections; Enter, Escape and focus; the basic variant; the IPv4 panel (analysis, binary, split, errors,
  options off); containment of a failing dock.
- `src/studentTools/StudentToolsEditor.t2.test.tsx`: canonical emission, unavailable tools, option edits, section overrides, removal of
  the last tool, invalid values, pruning of deleted sections.
- `src/StudentExamPage.studentTools.t2.test.tsx`, through the real exam page: the start-screen notice, the tool bar in a started
  attempt following the section, no notice or tool bar for an exam without tools or with a malformed value.
- Fail-first: not applicable (a new feature).

## 10. T3 — base converter, answer-risk notes, preview, dragging

### Base converter (`baseConverter.ts`, `BaseConverterTool.tsx`)

- **Exact arithmetic.** BigInt; non-negative integers below 2^64; input bounded to 100 characters. It is self-contained: it does not
  use the number-conversion game's helpers, which serve a server-graded board.
- **Input.** Digits of the chosen source base; spaces and `_` as group separators; an optional prefix that must match the base
  (`0b`, `0o`, `0x`). In base 16 only `0x` is a prefix, because `0B11` is the hexadecimal number B11.
- **Errors.** Each error names the offending digit and the allowed digits, in Arabic.
- **Output.** The value in every other base the teacher allowed: hex in upper case, binary in nibbles, octal in threes, decimal in
  thousands.
- **Steps** (only when `showSteps` is on). Positional expansion into decimal; repeated division out of decimal, with the remainders
  read bottom-up; bit grouping between 2 and 8 / 16; octal ↔ hex through decimal. At most 64 rows (2^64 − 1 needs exactly 64).
- **Builder options.** The allowed bases (at least two: the last two can't be unticked) and «عرض خطوات التحويل».

### Answer-risk notes (`studentToolsRisk.ts`)

- **Advisory only.** A heuristic over the question's **display text**: stem, parts, options, rich content. Answer keys, hints, teacher
  notes, rubrics and the model answer are never read.
- **Signals.** IPv4 calculator: an IPv4 address, or a networking term (network / broadcast address, mask, subnets, host count, CIDR).
  Base converter: a base name (الثنائي، الثماني، الست عشري، …) or base notation (`(1011)₂`, `0x2F`). Plotter: a graph-reading
  question type. The calculator is never named, because every numeric question would be.
- **Scope.** Only sections where the tool is on are reported, so the note follows the section overrides.
- **Display.** The panel names up to five questions («الشبكات · السؤال 2») and suggests the per-section table or switching the tool
  off. Nothing blocks a save, and nothing reaches the student.

### Teacher preview

`ExamPreview` mounts the same lazy dock, fed `toSafePreviewExam`'s projection (canonical spec or nothing). The preview shows every
section on one page, so it offers the exam-level tools: section overrides apply only in the student's page, where the current section
is known.

### Dragging

On wide screens the open panel moves by its header (pointer capture; the header stays inside the viewport). «إعادة النافذة إلى
موضعها» is the non-drag alternative (WCAG 2.5.7), and pressing a header button never starts a drag. On a phone (≤ 640 px) the panel
is a bottom sheet: dragging is off, and a viewport that becomes phone-width drops the offset.

### Evidence for T3

- `src/studentTools/baseConverter.t3.test.ts`: parsing, prefixes (hex `0B`), refusals with messages, round trips up to 2^64 − 1,
  grouping, every step kind.
- `src/studentTools/studentToolsRisk.t3.test.ts`: positive / negative phrases per tool; answer data never read; bounded input; section
  overrides respected.
- `src/studentTools/StudentToolsEditor.t2.test.tsx` (T3 block): converter options, the two-base minimum, the risk note following the
  overrides.
- `src/studentTools/StudentToolDock.t2.test.tsx` (T3 blocks): the converter panel (bases, steps, errors, steps off), dragging with
  clamping, release, reset, and buttons not dragging.
- `src/ExamPreview.studentTools.t3.test.tsx`: the dock in the preview, absent without tools or for a value the student would not receive.

## 11. T4 — function plotter

### What the student gets (`GraphPlotterTool.tsx`, `graphPlotter.ts`)

- **Functions.** Up to the teacher's `maxFunctions` fields, `f(x) =`, `g(x) =`, `h(x) =` (LTR). «ارسم» or Enter draws them.
- **Window.** A collapsible «نافذة الرسم» (xMin, xMax, yMin, yMax; default −10…10). Bounds must be numbers within ±10^6, with the
  minimum below the maximum and a usable span.
- **The graph.** Drawn by the existing owned SVG renderer `FunctionGraphView` (Phase 21A.2), with everything it already offers:
  zoom (± and wheel / pinch), pan (drag, Shift + arrows), trace (arrows, with a spoken readout), reset, and the text description and
  table of values for screen readers.
- **Value at a point.** «القيمة عند x =» lists f(x), g(x), h(x) at that x, and «غير معرّفة» where a function is undefined.
- **Analysis** (only when the teacher ticked «إظهار الجذور ونقاط التقاطع والقيم القصوى»). The engine's own `analyzeFunctionGraph`
  becomes labelled points: roots, y-intercepts, minima, maxima and intersections, each naming its curve(s) (`تقاطع f و g (3، 5)`).
  Vertical asymptotes become dashed reference lines. The engine requires distinct labels, so an exact repeat is skipped, and a
  decorated graph the engine refuses falls back to the plain graph.

### The engine stays the authority

- **No new evaluator.** Every expression is compiled by `compileGraphExpression` (expression language 3), and the whole graph is
  validated by `validateFunctionGraphSpec` before it's drawn. The graph engine itself is unchanged.
- **School notation.** `normalizePlotExpression` rewrites only what is unambiguous, so students can type what they type into the
  calculator: `2x → 2*x`, `2(x+1) → 2*(x+1)`, `)( → )*(`, `x( → x*(`, `π → pi`, `√( → sqrt(`, `× ÷ −`, and school `log( → log10(`.
  A number inside a name (`log10(`) and an `x` inside a name (`exp(`) are untouched. Everything else is left to the engine, which
  accepts it or refuses with its own Arabic message under the field.
- **Angles.** Trigonometric functions take radians (the engine's convention), and the panel says so.
- **Loading.** The plotter is its own lazy chunk inside the dock, so an exam that only allows the calculator never downloads the graph
  engine. Its panel is wider (560 px) on desktop.

### Builder

- The plotter row offers «عدد الدوال» (1–3) and the analysis switch.
- Answer-risk notes name graph-reading question types (`functionGraphSelection`, `functionStudy2d`).

### Evidence for T4

- `src/studentTools/graphPlotter.t4.test.ts`: the notation rewrite (names untouched), the window (reversed / equal bounds named as
  such, range, span), building (empty fields skipped, per-field engine messages, the teacher's count, non-expressions refused, a window
  the engine refuses draws nothing), analysis labels unique and naming curves, asymptote lines, values at a point.
- `src/studentTools/StudentToolDock.t2.test.tsx` (T4 block): field count from the teacher, drawing, analysis labels, value at a point,
  field error, analysis off.
- `src/studentTools/StudentToolsEditor.t2.test.tsx` (T4 block): plotter defaults, function count, analysis switch; no tool is locked
  as «قريبًا» any more.
- Mutation M37–M44: 7 killed; M43 (skip a repeated label) is **equivalent** under reachable inputs, because the analysis already
  removes repeated features, so the guard is a second line of defence.

## 12. T5 — formula sheet and scratch pad

### Contract (additive within version 1)

`STUDENT_TOOL_IDS` gains two ids. Every spec that was valid before T5 stays valid and means the same.

- **`formulaSheet`: `{ id, title, content }`.**
  - `title`: 1–80 characters with no control or bidirectional-override characters. It is trimmed in the canonical form.
  - `content`: a `RichContentV1` document validated by the platform's one rich-content authority (`validateRichContent`), bounded to
    64 KiB serialized.
  - Allow-list of blocks (`FORMULA_SHEET_BLOCKS`): headings, paragraphs, lists, tables, maths, callouts, key–value grids, dividers,
    code, quotes and columns. The check walks inside columns.
  - **Refused in version 1:** images and figures (bank images need signed delivery), charts, function graphs, 3D surfaces / scenes,
    and CLI blocks. A sheet is reference text that renders with no network and no heavy engine.
- **`scratchPad`: `{ id, drawing }`.** `drawing` switches the pen and eraser on or off.

### The pre-start projection withholds the sheet

The start screen is shown before the attempt and its timer begin. `projectStudentToolsForPreStart` keeps the sheet's **title**
(announced as «ورقة القوانين «…»») and replaces its **content** with a fixed placeholder. The teacher's content arrives only with the
exam body after the start, so a sheet never gives reading time before the clock runs. The student sanitizer (started exam) delivers the
full canonical sheet.

### Student panels

- **Formula sheet** (`FormulaSheetTool.tsx`). Read-only and drawn by the one `RichContentRenderer`. It is its own lazy chunk (the maths
  renderer stays off the dock), and the panel is titled with the teacher's title.
- **Scratch pad** (`ScratchPadTool.tsx`).
  - Notes (`dir="auto"`, at most 20,000 characters) and, when allowed, a canvas with pen, eraser, undo (one stroke) and clear (at most
    500 strokes, 4,000 points each).
  - The panel states that the scratch pad is **not saved, not sent and not graded**, and is cleared when the exam page is left. It
    lives in component state only (no storage: a shared school computer must not keep a student's notes). Like every tool it survives
    closing the panel and changing questions during the attempt.

### Builder

- **Formula sheet.** A title field plus the platform's rich-content editor (lazy, as for the cover's rich instructions), with the
  allow-list stated.
- **Scratch pad.** The drawing switch.
- **Refused edits.** An edit the contract refuses (a blank title, a disallowed block, an empty sheet) is **not** emitted, and the panel
  says why («لم يُحفظ التعديل الأخير: …») instead of dropping it silently.
- **Risk notes.** The formula sheet's catalog note reminds the teacher that the sheet shows only what they write. The risk heuristic
  names no question for either tool.

### Evidence for T5

- `src/studentTools/formulaSheet.t5.test.ts`: canonical sheet, default, refusals (title, empty or missing content, raw HTML, a *valid*
  image block refused by the allow-list, CLI, a graph also inside columns, unknown key, oversize), scratch pad switch, the pre-start
  placeholder, catalog and risk.
- `api/tests/student-tools-t1.test.js` (T5 block): the started exam carries the content; the pre-start payload never does; a refused
  block is withheld and blocks finalization.
- `src/studentTools/StudentToolDock.t2.test.tsx` (T5 block): the sheet under its title with its table; the scratch pad notice, notes
  and strokes kept across close / reopen, undo removing one stroke, clear; no canvas when drawing is off.
- `src/studentTools/StudentToolsEditor.t2.test.tsx` (T5 block): defaults, the drawing switch, a refused title shown and not emitted.
- `src/StudentExamPage.studentTools.t2.test.tsx`: the start screen names the sheet by title and never shows its content.
- Mutation M45–M52: 8 KILLED. M52 (undo clears everything) first SURVIVED; the test now draws two strokes.

## 13. T6 — subject tools

Five tools join version 1 additively: `asciiTable`, `bitwiseCalculator`, `truthTable`, `unitConverter` and `periodicTable`. Every
earlier spec keeps its validity and meaning. The option values live in the contract module itself (`BIT_WIDTH_OPTIONS`,
`UNIT_CATEGORY_IDS`, `TRUTH_MAX_VARIABLES_RANGE`), so it stays a leaf of the shared build. A test pins the unit categories to the
engine's list.

| Tool | Contract | Engine | What the student gets |
|---|---|---|---|
| ASCII table | `range: "printable" \| "full"` | `asciiTable.ts` | lookup by character, text (≤ 32 characters), decimal, `0x41` / `41h`, binary, or control name (LF, CR …); the table in dec / hex / oct / bin; control codes only in the full range; non-ASCII (Arabic) characters named as such |
| Bitwise calculator | `width: 8 \| 16 \| 32` | `bitwise.ts` (BigInt, the base converter's strict parser) | AND, OR, XOR, NAND, NOR, NOT, logical shifts; operands in binary, decimal or hex; result in binary (nibbles), decimal and hex; values that don't fit the word are refused; SHL drops the bits shifted out |
| Truth table | `maxVariables: 2–6` | `truthTable.ts` (bounded parser, no eval) | `¬ ! ~ NOT '`, `∧ & && · * AND` and implicit `AB`, `∨ \| \|\| + OR`, `⊕ ^ XOR`, `NAND`, `NOR`, `0`/`1`, brackets; precedence NOT > AND > XOR > OR; variables A–Z in alphabetical order (A most significant); the table, the expression as understood, and the minterms Σm(…) |
| Unit converter | `categories`: non-empty subset of length, mass, time, temperature, speed, data, dataRate (canonical order) | `unitConverter.ts` | factor conversions (temperature is affine and refuses values below 0 K; mass, time, data and rates refuse negatives); decimal prefixes (kB = 1000 B, Mbps = 10⁶ bit/s) and binary prefixes written as such (KiB = 1024 B); 12-significant-digit display |
| Periodic table | `showMass`, `showConfiguration` | the platform's verified chemistry catalog (`src/chemistry/elements.ts`, `electrons.ts`) | an 18-group grid of **Z 1–36** (the curriculum's scope, stated on the panel); a selected element's name, symbol, Z, period / group, category, and, as the teacher chose, its atomic mass and ground-state configuration; its own lazy chunk |

**Answer-risk notes.** The heuristic names ASCII questions, bit-operation questions (including literal `1100 AND 1010`), truth-table /
logic-gate questions, and atomic number / mass / configuration questions. It never names a question for the unit converter: units
appear in most physics questions.

**Builder options.** ASCII range; word width; maximum variables (2–6); unit categories (at least one, the last can't be unticked);
the mass and configuration switches.

### Evidence for T6

- `src/studentTools/subjectTools.t6.test.ts`: all five engines (operations, notations, precedence, bounds, refusals with Arabic
  messages), contract defaults, refusals and canonical order, catalog ↔ contract, risk terms.
- T6 blocks in `StudentToolDock.t2.test.tsx` (each panel end to end, including the teacher's limits) and `StudentToolsEditor.t2.test.tsx`
  (defaults and options).
- Mutation M53–M64: 12 / 12 KILLED.

## 14. T7 — tools in training and in the course books

### Owner decisions

- **Books.** A **fixed tool set per course**, defined in code (`src/studentTools/courseTools.ts`). There is no stored setting, no route
  and no teacher screen; a set can be changed later in a reviewed PR.
- **No usage tracking in T7.** Recording which student opened which tool would store new data about students (privacy, retention, a
  new route). It is left for its own phase, once the owner decides what the teacher needs to see.

### Training

A training assignment is an assignment whose cover says `activityType: "training"`, and it runs in the same `StudentExamPage`. It
already offers the teacher's tools exactly like an exam (T2): nothing to add.

### The course books

| Course | Book | Tools |
|---|---|---|
| 791381, 791381s | شبكات الاتصال، أوراق التلخيص | IPv4 calculator (binary view, subnetting), base converter (2/8/10/16 with steps), bitwise calculator (32 bits), unit converter (data, data rate), scientific calculator, scratch pad |
| 899371 | أسس علم الحاسوب | base converter (with steps), ASCII table (full), truth table (6 variables), bitwise calculator (8 bits), unit converter (data, data rate), scientific calculator, scratch pad |
| 899271 | الأتمتة | scratch pad, base converter (with steps), scientific calculator |
| 899271d | مبنى المعطيات | scientific calculator, base converter (with steps), bitwise calculator (32 bits), scratch pad |

- **Working is on.** A book is practice, not an exam, so the sets switch on the working: conversion steps, subnetting and the binary
  view.
- **Same tool bar, one lazy chunk.** `LearningReader` mounts `CourseToolDock`: the course lookup plus the exam's `StudentToolDock`, in
  one lazy chunk. Only the tiny `ToolDockBoundary` stays in the reader's first load (41.5 KB of the 42 KB budget; 40.9 KB before T7).
  The tool bar is hidden in presentation mode, where the teacher projects the page to the class.
- **Deployment recovery.** In the reader the chunk loads through `lazyWithRetry` (key `reader-student-tools`, inventoried in
  `src/deploymentRecovery.inventory.11d.test.ts`), like every lazy view of the reader. A stale chunk after a deployment recovers with
  one reload. A reload is harmless in a book; that's why the exam page keeps a plain `lazy` (a reload there would end a strict
  attempt).
- **No sections.** A book has no sections, so the set applies throughout.
- **No tools without an entry.** A course without an entry shows no tool bar. `courseStudentTools` reads own properties only.

### Evidence for T7

- `src/studentTools/courseTools.t7.test.tsx`:
  - every set is a valid canonical spec of tools that have a UI;
  - the sets match the registered courses one-to-one;
  - the networks book has subnetting;
  - unknown and inherited names have no tools;
  - in the real reader, the networks book lists its six tools and the IPv4 calculator works with subnetting;
  - the bar is hidden in presentation mode and comes back after it.
- All 1,963 learning tests still pass.
- `CourseToolDock` directly: the course's set, and nothing for a course without one.
- Mutation M65–M70: 6 / 6 KILLED, including the deployment-recovery wrapper (M70, killed by the inventory test).

## 18. T11 — the course book's tools, chosen by the teacher

At T7 the owner chose a fixed set per course, defined in code. T11 lets the teacher choose the tools of a book for each of their
classes. The fixed set stays as the default.

### Storage: the class's book settings, nothing new

The choice lives in the class document's existing `learningMaterials` entry for the course, the same field that holds the publication
and the solutions release (P13). `studentTools` is written only when the teacher chooses:

| Stored | Meaning |
|---|---|
| absent | the book's built-in set (`src/studentTools/courseTools.ts`, T7) |
| `{ version: 1, tools: [...] }` | the teacher's set, canonical |
| `{ version: 1, tools: [] }` | the teacher turned the book's tools off |

- **A class that never chose** keeps its exact earlier document shape.
- **A stored value that is no longer valid** reads as absent (the built-in set), never as a partial spec.
- **Other book settings keep it.** Publishing, hiding and releasing keep the choice; removing the course drops it with the course
  (`api/src/lib/class-learning-materials.js`).

### The rule (`validateBookStudentTools`, shared build)

A book set is a valid version-1 spec with:
- **no section overrides:** a book has no sections;
- **no formula sheet:** the book is the reference text, and a sheet (up to 64 KiB of text plus images) would make every class
  document heavy.

All or nothing, like the exam's validator.

### The action

`POST /api/classrooms`, action `setLearningCourseTools` (`api/src/functions/manage-classrooms.js`):

| Rule | Detail |
|---|---|
| request | `{ classId, courseId, studentTools }`; `null` restores the built-in set |
| capability | `learning.module.release`, declared in `route-capabilities.js`, the same as publishing and releasing |
| class and course | the teacher's own class (the dispatch point's tenancy check); a course the teacher may use (P5-A); the course attached to the class |
| storage | an archived class is refused; CAS write |
| audit | `class.learningMaterials.setTools`, with the tool ids before and after only |

### Delivery

- **The student endpoint.** `buildStudentLearningMaterials` adds the course's `studentTools` when the teacher chose. Both paths of
  `/api/student-learning-materials` use it: one class, and shared classes (one class per course).
- **The tool bar.** The portal passes it through `StudentReader` → `LearningReaderWithTraining` → `LearningReader` → `CourseToolDock`.
  The dock:
  - shows the chosen set;
  - shows nothing for an empty list or an invalid value;
  - shows the built-in set when there is no choice.
- **Teacher previews.** The teacher's own reader keeps the built-in set.

### The teacher's control

«المواد التعليمية لهذا الصف» shows, on each book card, «أدوات الطالب في الكتاب»: the current tools and where they come from («أدوات
الكتاب» or «اختيارك»).

«تعديل الأدوات» opens `BookToolsDialog`:
- **The editor.** The exam's «أدوات الطالب» editor (lazy), without sections and without the formula sheet (`excludeTools`). It starts
  from the current set.
- **Saving.** «حفظ» saves the selection; an empty selection turns the tools off.
- **Restoring.** «استعادة أدوات الكتاب» sends `null`.

An archived class shows the tools without the edit button.

### Evidence for T11

- `api/tests/book-student-tools-t11.test.js` (real handlers, in-memory store):
  - **The rule.** Sections and sheets are refused; an empty list is valid.
  - **Storage.** Canonical, stored only when chosen; an invalid stored value reads as the built-in set; publication and release keep
    it; removal drops it.
  - **The student catalog** carries it.
  - **The action.** Set, turn off and restore; audited with ids only. Refused: a sheet, sections, a malformed spec, a missing field, no
    course, a course not attached. An archived class gets 403, an unknown class 404.
  - **The student endpoint** delivers it.
- `src/studentTools/bookTools.t11.test.tsx`:
  - **The tool bar.** The chosen set, the built-in set, tools off, an invalid value, and the real reader passing it.
  - **The teacher's card and dialog.** The source shown; no formula sheet offered; the edit saved canonical; all off saves `[]`;
    restore sends `null`; archived is read-only.
- The route-capability and certification route sweeps pass with the new action.
- Mutation M101–M112: 12 / 12 KILLED. The planted defects:
  - a sheet or sections allowed (the contract mutants regenerate and restore the shared build);
  - the choice forgotten by the normalizer, or dropped by publishing;
  - an invalid value kept;
  - an unattached course accepted;
  - the student catalog omitting it;
  - the capability undeclared;
  - the dock ignoring it, or falling back when tools are off;
  - the dialog offering the sheet;
  - the reader not passing it.
