# Phase T — Student Exam Tools (design record; T0 + T1)

> STATUS: T0 (this design) and T1 (contract and data path) are implemented on branch `claude/stoic-brown-yscldn`. They are waiting for
> independent review and the owner's manual merge. **No student-visible UI exists yet**: the tool bar and the tools themselves are
> phases T2 and later. Nothing in T1 changes how an existing exam looks, is delivered or is graded.

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
- **No free-form code.** No `eval`, no `Function`, no HTML. The calculator and the plotter reuse the platform's own parser
  (`src/parametricExpression.ts`, expression language 3); the IPv4 tool has its own strict grammar.
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
| Builder authoring | `StructuredExam.studentTools` (`src/examTypes.ts`) | the Builder writes only canonical values (T2 settings panel) |
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
- a quality **warning** (not an error: the teacher decides) appears when an enabled tool matches question kinds in the exam (T3);
- the section override lets the teacher keep a tool for one section and remove it from another (contract ready in T1).

## 7. Phases

| Phase | Scope | State |
|---|---|---|
| T0 | this design record | done |
| T1 | contract, catalog, IPv4 engine, quality gate, shared build, assignment gate, student / pre-start / preview projections | done (this branch) |
| T2 | Builder settings panel; student tool bar (floating window on desktop, bottom sheet on phone, lazy chunks, keyboard / screen reader, state kept per attempt); scientific calculator; IPv4 calculator UI | next |
| T3 | base converter; answer-risk quality warnings | |
| T4 | function plotter on `FunctionGraphView` | |
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
