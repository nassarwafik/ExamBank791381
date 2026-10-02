# Phase 17E — Enterprise Coding Assessment (17E-A: Coding Question Authoring)

Phase 17E turns the secure coding infrastructure of Phases 17A–17D into a first-class enterprise authoring and
assessment experience. It is split into four reviewable phases:

| Phase | Scope |
|---|---|
| **17E-A** (this phase) | **authoring**: the coding question in the Enterprise Exam Builder (schema, editor, validation, grading strategy, secrecy boundary, governance, serialization) |
| 17E-B | the student coding IDE / runtime UX (run against public tests through the existing runner) |
| 17E-C | the official submission / asynchronous grading workflow UI |
| 17E-D | teacher grading evidence and review |

17E-A is authoring only. It adds no student IDE, no live Run button, no browser compiler, no runner change, no new language,
no third-party compiler service and no database.

---

## 1. Pre-implementation audit (baseline `236e1f11`)

The audit found that `coding@1` is **already** a complete, first-class registry plugin built in Phases 17A–17D. 17E-A
therefore closes the remaining authoring gaps on the canonical model. It does not add a second, competing definition.

| Seam | Finding at baseline |
|---|---|
| Question Type Catalog (16A) | `coding` row: `interactive`, `hybrid`, versioned (`questionTypeVersion` 1), not compound-capable |
| Registries (16A) | authoring editor (lazy `CodingQuestionEditor`), student renderer (`CodingResponse`), validator (`validateCodingQuestion`), defaults factory, server built-in grader (manual) — all bound to `(coding, 1)`; `coding@2` resolves to nothing (fail closed) |
| Canonical model | public config under `coding` (languages, default, starter code per language, public tests, limits); private key under `answer` (hidden tests with stable ids + weights, comparator, reference solutions, `gradingMode`) |
| Languages | ONE data registry `CODING_LANGUAGES` (python@1, java@1, csharp@1) = exactly the runner's registry; no free-text language anywhere |
| Limits | ONE range table `CODING_LIMIT_RANGES` (source 1–64 KB, output 1–256 KB, time 250–10000 ms, memory 16–512 MB); the official path clamps captured output to `OFFICIAL_STDOUT_CAPTURE_BYTES` (17 KB) = the runner's `OFFICIAL_BOUNDS.outputBytes` |
| Case identity | stable authoring ids (`CODING_TEST_ID_PATTERN`) + ONE conversion `officialCaseToken(i)` → `c01…` by stored order (runner mirrors it) |
| Grading | 17C `gradingMode` `manual` (default) / `hiddenTests`; the automatic mark was **only proportional** (`marks × passedWeight / totalWeight`) — **no all-or-nothing** |
| Builder | palette insert, edit, clone / duplicate / move, undo / redo, autosave, destructive type-change confirmation (16A), Blueprint `questionType` refs — all generic and already covering coding |
| Finalization (13C / 14A) | `examQuality` runs the type validator for every node; `evaluateExamFinalization` and the server governance gate block on any error |
| Governance (14A) | revisions store the canonical exam content (hidden tests included, teacher-side), immutable once published |
| Presets (15A) | structure-only (sections, grading policy, blueprint) — they never contain questions; a coding `questionType` blueprint ref is already valid → **no change needed** |
| Student sanitizer | `answer` blanked; `coding` rebuilt by the allow-list projection; grading-secret denylist |
| **Question bank** | supports only the 4 legacy types (multipleChoice / fillBlank / wordBank / open); **no** 16A type and no Builder → bank save path exist — see §9 (unresolved) |

**Gaps closed by 17E-A:**

1. A deterministic **scoring policy** with all-or-nothing scoring.
2. Minimal **language-aware starter templates**, so a new C# or Java question is immediately usable.
3. **Inline validation** in the editor through the one canonical validator.
4. A **sectioned enterprise editor** with accessible limits and an honest statement of the limits authority.
5. Defense in depth: `scoringPolicy` added to the sanitizer's grading-secret denylist.

---

## 2. Coding question schema (coding@1, unchanged identity)

```jsonc
{
  "presentationType": "coding", "questionTypeVersion": 1,
  "text": "…", "marks": 10,                                  // the canonical mark model — no separate coding points
  "coding": {                                                // PUBLIC (student-visible after projection)
    "allowedLanguages": ["csharp"], "defaultLanguage": "csharp",   // registry keys only (python | java | csharp)
    "starterCode": { "csharp": "…" },                        // per language, text preserved byte-for-byte
    "taskMode": "program", "inputMode": "stdin", "outputMode": "stdout",
    "limits": { "sourceBytes": 65536, "outputBytes": 65536, "timeMs": 2000, "memoryMb": 256 },
    "publicTests": [{ "id": "pub-…", "title": "…", "input": "…", "sampleOutput": "…" }]
  },
  "answer": {                                                // PRIVATE (never reaches a student or the runner)
    "gradingMode": "hiddenTests",                            // "manual" (default, also when missing) | "hiddenTests"
    "scoringPolicy": "allOrNothing",                         // 17E-A: "proportional" (default, also when missing) | "allOrNothing"
    "comparator": "trimTrailingWhitespace",
    "hiddenTests": [{ "id": "hid-…", "title": "teacher-only", "input": "…", "expectedOutput": "…", "weight": 1 }],
    "referenceSolutions": { "csharp": "…" }
  }
}
```

The runtime identity is the stable pair `(language, languageVersion)`, taken from the language registry. An unknown
language fails closed everywhere (finalization, student projection, answer ingestion, official grading). It is never
converted to another language.

---

## 3. Trust boundary, authorities and secrecy

```
Teacher (Builder) ──canonical node──▶ SmartAssess (validation · finalization · governance · grading authority)
                                         │  minimal signed job: source + hidden-test stdin + limits + opaque tokens c01…
                                         ▼
                                   Coding Runner (executes only; never grades, never sees ids / labels / expected outputs)
```

| Authority | Owner |
|---|---|
| Runtime | `CODING_LANGUAGES` (one registry; equals the runner registry) |
| Limits | `CODING_LIMIT_RANGES` (one table); the official grader clamps captured stdout to 17 KB, as the editor states |
| Grading | SmartAssess only: `evaluateOfficialCodingRun` (comparator per case) + `officialCodingScoreFor(policy, …)` |
| Finalization | `validateCodingQuestion` through `examQuality` / `evaluateExamFinalization` / the governance gate — the editor's inline panel calls the **same** function |

**Public tests vs hidden tests:**

- **Public tests** are student examples. Their title, input and sample output are student-visible and are used by 17E-B
  practice runs. They are never official grading evidence.
- **Hidden tests** are teacher-private and live under `answer`.
  - The student sanitizer blanks `answer`.
  - The coding projection is an allow-list, rebuilt field by field.
  - The grading-secret denylist (now including `scoringPolicy`) strips any smuggled copy from the node.
  - The runner receives only each hidden test's stdin, under an opaque ordered token. It never receives the id, label,
    expected output or weight.

---

## 4. Grading strategy (17E-A)

`answer.scoringPolicy` is decided by SmartAssess and never by the runner. It applies only when
`gradingMode = "hiddenTests"`.

| Policy | Official mark |
|---|---|
| `proportional` (default; also when missing — every existing 17A / 17C question) | `marks × passedWeight / totalWeight`, rounded once (the 17C rule, byte-identical) |
| `allOrNothing` | `marks` when **every** hidden case passed (compiled, `passedCount === testCount`; a zero-weight case still has to pass), else `0` |

**Backward compatibility of in-flight grading.** The question fingerprint (and so the grading key) includes the policy
only when it is `allOrNothing`. A proportional or missing policy produces exactly the 17C fingerprint, so no in-flight
17C/17D job becomes stale at deploy. Switching the policy afterwards changes the authority, and a late result is refused
as stale.

**Fail closed.** An unknown policy is a blocking finalization error (`CODING_SCORING_POLICY_UNKNOWN`). The official path
treats such a question as not gradeable: no dispatch and no zero.

**Marks.** The mark is the question's canonical `marks`, the same model used by section totals, exam totals, Blueprint
and quality gates.

---

## 5. Authoring UX (enterprise editor)

The editor is laid out in sections, in this order:

1. **البيئة والتنفيذ** (environment) — allowed languages (registry checkboxes), default language, and execution limits.
   - Each limit has an integer range hint wired through `aria-describedby`, and `aria-invalid` when out of range.
   - The section states the 17 KB official output capture.
2. **الكود الابتدائي** (starter code) — one LTR code editor per allowed language, with whitespace and Unicode preserved.
   - Allowing a language that has no starter code seeds the registry's minimal template. Existing code is never
     overwritten.
   - An emptied starter can be restored with «إدراج القالب الأساسي — <language>».
3. **أمثلة ظاهرة للطالب** (public tests) — add, edit, duplicate, reorder and delete, with stable ids and named controls.
4. **اختبارات مخفية للتصحيح** (hidden tests) — the same operations, rendered in a visually distinct private style and
   marked «مخفي عن الطالب».
   - Each row carries an input, an expected output, a weight and a teacher-only label; the section also sets the
     comparator.
   - The stored order is the official execution order.
5. Reference solutions (teacher-only aid).
6. **التصحيح والعلامة** (grading) — the official grading mode (17C radio group), the scoring policy (17E-A radio group,
   with help linked by `aria-describedby`), and a mark-semantics line that uses the question's marks.
7. **التحقق من السؤال** (validation) — the canonical validator's blocking issues, listed inline. A valid question shows
   «لا توجد مشكلات في إعداد سؤال البرمجة.»

Minimal templates are registry data (`CodingLanguageDefinition.starterTemplate`, read through `codingStarterTemplate`):

| Language | Template |
|---|---|
| C# | `public class Program` with `static void Main()` (`Program.cs`) |
| Java | `public class Main` with `main(String[])` — the runner compiles `Main.java` and runs `Main` |
| Python | none |

Both shells compile and run unchanged on the real runner images through the official sandbox path (§8).

**Accessibility, RTL and layout:**

- Every control has a real label.
- Every reorder, duplicate and delete control has an accessible name.
- Source code and test I/O are LTR inside the RTL editor.
- Layout grids use `minmax(min(100%, …), 1fr)`, so tablet widths do not overflow.
- No new dependency is added: the 17A dependency-free lazy editor is reused, and the editor chunk stays lazy.

---

## 6. Builder, governance, serialization, versioning

- **Builder.** Palette insert, clone (`cloneQuestionWithNewIds`, `duplicateQuestion`), move between sections, undo,
  redo, autosave and question switching all keep `coding` and `answer` byte-for-byte. Type switching goes through 16A's
  destructive-change confirmation and the canonical factory.
- **Governance.** Draft → Review → Approved → Published carries the canonical coding node (hidden tests and policy) in
  the immutable revision. A later draft never mutates the published copy. An invalid coding exam is refused by the same
  server finalization authority (`FINALIZATION_REFUSED`).
- **Serialization.** `canonicalizeExamContent` + `stableStringify` give deterministic JSON. Identity, version, hidden
  tests, policy and starter code survive a round trip.
- **Versioning.** An unknown coding version (e.g. 2) is kept as stored, never downgraded. It blocks finalization, and no
  editor or student renderer resolves for it.

---

## 7. Student payload (defined now, rendered by 17E-B)

| Allowed | Never |
|---|---|
| prompt, marks, allowed / default language, starter code, public tests (id / title / input / sampleOutput), limits | hidden tests (input or expected output), teacher-only labels, weights, comparator, grading mode, scoring policy, reference solutions, runner tokens / HMAC configuration |

The secrecy test uses three canaries — `HIDDEN_STDIN_CANARY_17EA`, `HIDDEN_EXPECTED_CANARY_17EA` and
`TEACHER_LABEL_CANARY_17EA` — plus a reference-solution canary. It asserts that none of them appears anywhere in:

- the serialized student payload, including smuggling attempts into the public object and onto the node;
- the rendered student UI;
- the teacher preview.

---

## 8. Tests, fail-first and mutations

| Suite | Tests |
|---|---|
| `src/questionTypes/coding.17e-a.test.tsx` | 37 — COD1–COD35 matrix (registry, factory, validation, editing, Builder, sanitization, finalization, serialization, versioning), grading strategy, starter templates, enterprise sections, inline validation, limits authority, a11y, backward compatibility |
| `api/tests/coding-17e-a.test.js` | 9 — E1–E6 (scoring policy through the REAL submit → dispatch → signed-callback handlers, fingerprint compatibility, deterministic case order, fail-closed policy), G1–G3 (governance COD32 / COD33, server finalization refusal) |

**Fail-first on unchanged `236e1f11`:** the final test files were run against the baseline code in a separate worktree.
18 of 46 tests failed.

- **Scoring policy** (COD12; canonical data; `officialCodingScoreFor`; COD18; COD31; E1, E4, E6; G3; backward
  compatibility).
- **Starter templates** (both template tests; COD13; restore).
- **Sectioned editor, inline validation, limits authority.**
- **COD27.** A `scoringPolicy` smuggled onto the question node was not stripped by the baseline denylist. No canary
  string leaked on the baseline.

The other 28 passed, because they guard behaviour that already existed (registry, factory, CRUD, clone / move /
history, secrecy, serialization, governance publish / immutability, proportional scoring, case order).

**Runner proof (scratch, not committed):** the C# and Java templates compiled and ran with exit code 0 on
`smartassess-coding-csharp:17c-v1` / `smartassess-coding-java:17c-v1`, through `runOfficialSuite`. No container was
left behind.

**Mutations — 9/9 killed.** The shared server build was regenerated for every `src` mutation, every mutation was
restored byte-for-byte, and the tree fingerprint matched before and after.

| # | Mutation | Killed by |
|---|---|---|
| MUTA | remove the coding catalog registration | COD1–COD5, COD19, COD30, COD34, G1, G2 |
| MUTB | allow zero hidden tests under automatic grading | COD7, COD31, G3 |
| MUTC | leak the coding answer key through student sanitization | COD27 (canary) |
| MUTD | disable runtime / language validation | COD8, COD31 |
| MUTE | reset starter code during clone | COD20 |
| MUTF | ignore coding questions during finalization | COD31, COD35, G3 |
| MUTG | grading authority ignores the scoring policy | E1 |
| MUTH | no starter template when a language is allowed | COD13 |
| MUTI | accept an unknown scoring policy | COD12, COD31, E6, G3 |

---

## 9. Unresolved finding — question bank support (proposed follow-up)

The spec asks that coding questions work with the existing question bank (save, load, insert, clone). The audit shows
that the bank cannot hold any rich question type today:

- The bank schema (`bankQuestionModel.ts`), its management API (`bank-questions.js`) and the canonical converter
  (`bank-question-exam.js buildExamQuestion`) support exactly multipleChoice, fillBlank, wordBank and open.
- None of the 16A types (multipleSelect, numericResponse, matrix, categorization, simulation) are bank-capable.
- There is no Builder → bank save path for any type.

Adding coding alone would make it the only special-cased rich type in the bank, contrary to the registry principle. It
would also widen this PR into a legacy subsystem (storage schema, index, management editor, conversion, bank-sourced
sanitization).

17E-A therefore does **not** change the bank, and makes no claim about it. The recommended follow-up is a dedicated
phase: a registry-driven **bank schema v2** that stores the canonical versioned node of every registered type, coding
included. It would validate through the same type validators, convert without loss, keep private keys teacher-side, and
add a Builder → bank save action.

Bank coding support is therefore deliberately unimplemented, and there is no COD24 test.

---

## 10. Explicitly out of scope (17E-A)

Out of scope:

- student coding IDE and live Run button (17E-B);
- browser execution or compilers;
- runner redesign, new languages or toolchain changes;
- asynchronous grading status UI (17E-C);
- teacher evidence UI (17E-D);
- plagiarism detection;
- AI code generation;
- network, math, physics or chemistry simulators;
- database or Azure SQL work;
- question-bank v2 (§9).
