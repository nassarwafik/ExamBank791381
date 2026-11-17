# Phase T — Student Exam Tools (design record; T0 – T3)

> STATUS: T0 (this design), T1 (contract and data path), T2 (Builder panel, student tool bar, calculator, IPv4 calculator) and T3
> (base converter, answer-risk notes, tools in the teacher preview, draggable panel) are implemented on branch
> `claude/stoic-brown-yscldn`. They are waiting for independent review and the owner's manual merge. An exam without `studentTools`
> looks, is delivered and is graded exactly as before. The function plotter is in the contract but has no UI yet: the Builder can't
> switch it on, and the tool bar never lists it.

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
| T4 | function plotter on `FunctionGraphView` | next |
| T5 | formula sheet (rich content, strict projection) and scratch pad | |
| T6 | subject tools (ASCII and bitwise operations, truth tables, units, periodic table) | |
| T7 | tools in training and learning materials; optional usage analytics (opens only, never the typed values) | |

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
