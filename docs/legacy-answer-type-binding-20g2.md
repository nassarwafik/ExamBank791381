# Phase 20G.2 — Legacy Answer-Type / Grading Binding (design record)

Closes **O1** (found by the Phase 20G.1 independent review): a hostile student could pick the legacy grader by forging
`response.kind`, and a choice index on a fill-in-the-blank / ordering style question scored full marks.

## 1. Baseline SHA

`origin/main = 6db0fc02e92711ef718d0106509314663a716d8e` (merge of PR #273, Phase 20G.1), verified with
`git fetch origin --prune` before any edit. Clean worktree, no merge / rebase / cherry-pick in progress, no planted mutant.

## 2. Branch

`feature/20g2-legacy-answer-type-binding`, from the baseline above. Normal commits only. The head and the PR are recorded on the pull request (§20).

## 3. Exact O1 reproduction (baseline 6db0fc0)

Reproduced with the untouched baseline grader (`api/src/lib/assignment-grading.js`) and ingest (`draft-answers.js`) in a
detached worktree of 6db0fc0:

| Question (7 marks) | Answer key | Hostile response | Baseline grade | Baseline ingest |
|---|---|---|---|---|
| `fillBlank`, fields b1/b2 | `answer.values: ["4","x"]` | `{kind:"choice",index:3}` | **7/7**, correct, no review | stored |
| `ordering`, 3 fields | `{mode:"exactSequence",values:["1","2","3"]}` | `{kind:"choice",index:0}` | **7/7** | stored |
| `shortAnswer` | `{text:"b",values:["b"]}` | `{kind:"choice",index:1}` | **7/7** | stored |
| `tableFill` (text table) | `{text:"R1=A",values:["A"]}` | `{kind:"choice",index:0}` | **7/7** | stored |
| typeless legacy-flat question | `{values:["1"],correctOptionIndex:0}` | `{kind:"choice",index:0}` | **7/7** | stored |
| `shortAnswer` | `{text:"b",values:["b"]}` | `{kind:"sequence",values:["b"]}` | **7/7** | stored |
| `ordering` (no table in its text) | as above | `{kind:"table",values:["1","2","3"]}` | **7/7** | stored |

An exam of the first four questions answered only with forged choices graded **28/28, 0 marks pending review** on the
baseline.

**Why the wrong grader ran:** `gradeLegacyQuestion` dispatched by the RESPONSE first: `response.kind === "fields"` →
fields grader; `type === "multiplechoice" || type === "truefalse" || response.kind === "choice"` → `gradeChoice`;
`answer.mode` sequence or `response.kind === "sequence"` → sequence grader; `response.kind === "table"` → table grader.
`gradeChoice` builds `expected` from **every** `answer.values` entry and accepts the positional candidates of the chosen
index (`String(idx+1)`, `a…h`, `أ…ح`, plus the option's own text). So `index 3` → candidate `"4"` matches the fill-blank key
`"4"`, and `index 0` → `"1"` matches the ordering key `"1"`. The ingest stored any well-formed legacy shape (20G.1 bounds
the shape, not the kind), so the forgery was persisted and graded.

## 4. Threat model

The attacker is an authenticated student who controls the whole request body (a direct HTTP client, no UI). Assets: the
official score and the first-N selection of their own attempt. The attacker can send any legacy answer kind for any answer
id. They cannot change the published exam snapshot, which is server-owned. They can also rely on answers persisted
**before** this phase, from older clients or earlier forgeries.

Out of reach after 20G.2:
- selecting the choice / sequence / table / fields / text grader by forging `response.kind`;
- doing so through an alias, a typeless or unknown legacy-flat type, a compound part or a composite child;
- taking a first-N slot with a mismatched answer;
- scoring with mismatched data already stored;
- a teacher review save re-introducing an automatic score.

## 5. Current legacy dispatch (unchanged after the gate)

`gradeQuestion` → composite (type-decided) → compound (structural) → `resolveGrader(presentationType || type, version,
{legacyFlat})`:
- a registered (modern) handler grades it;
- `undefined` (unknown structured type, unsupported version) → `unknownTypeResult` (fail closed, `unsupportedType`);
- `LEGACY` → `gradeLegacyQuestion`.

20G.2 adds ONE line at the top of `gradeLegacyQuestion`: a present response whose kind the question does not admit returns
`{score:0, maxMarks, correct:false, manualReview:true}` before any legacy grader is reached. The dispatch below it is
byte-for-byte the baseline. An absent response (`null` / `undefined`) keeps its historical path, because an unanswered
question is not a mismatch.

## 6. Catalog responseKinds authority

The binding derives from the shared Question Type Catalog (`src/questionTypeCatalog.ts` → generated
`questionTypeCatalog.js`); no second type matrix exists in production code. The legacy rows:

| Type | responseKinds |
|---|---|
| multipleChoice, trueFalse | choice |
| multiTrueFalse, matching, cliFill | fields |
| shortAnswer | text |
| fillBlank, wordBank | sequence, fields |
| ordering | sequence |
| tableFill | fields, table |
| compound | compound |

`O1-CAT` asserts every legacy row admits exactly its kinds, and that `choice` is admitted exactly on choice types. It also
asserts every modern row is outside the binding. `O1-CAT2` pins the eleven legacy rows literally, so an edit that drops a
dual kind fails a test instead of silently narrowing the binding.

**The one authority:** `legacyAnswerKindAllowed(question, kind)` in `src/questionTypeAliases.ts`, compiled into
`api/src/lib/shared-finalization/questionTypeAliases.js` by `scripts/build-shared-finalization.mjs`, with the drift test
green. For a legacy, typeless or unknown legacy-flat question it admits:

1. the catalog `responseKinds` of the resolved type (exact key or alias);
2. the kinds the **official legacy renderers** (`StudentQuestionCard`, `CompoundPartControl`) derive from the question's
   own content:
   - `table` ⇐ the question text holds a markdown table with at least one data row (the client `parseTable` / server
     `tableRows` rule);
   - `sequence`, `fields` ⇐ the question carries a non-empty `fields` array;
   - `sequence` ⇐ the question's own answer key is a sequence (`answer.mode` `exactSequence` / `sequence`), except on a
     choice type;
   - `text` ⇐ the renderer shows a textarea: every question whose **literal** type (`presentationType || type`,
     lower-cased) is not `multiplechoice` / `truefalse`.

`choice` comes **only** from the catalog choice family, aliases included. It is the only legacy grader with a positional
shortcut (codes matched against any key value). Every content-derived kind is graded by a grader that credits only the keyed
values: sequence compares position by position with `answer.values`; table compares row keys with `answer.text` pairs or
check marks; fields compares each field with its own `correct`; text needs an exact `answer.text` match.

Why content-derived kinds at all: the official client has always produced them. For example, a `matching` question with
fields renders word-bank selects and emits `sequence`, and a `fillBlank` without fields renders a textarea and emits `text`.
A strict catalog-only binding would refuse answers the official client produces (directive §5 G/I).
`src/legacyAnswerBinding.20g2.test.tsx` covers 25 type spellings × 6 content shapes × 2 placements. It renders every
renderer, operates every control and asserts every emitted kind is admitted. All five legacy kinds are actually produced, so
the sweep is not vacuous.

## 7. Canonical type / alias resolution

The type is `presentationType` when it is a non-blank string, otherwise the flat `type`. A stale flat `type` beside a
structured `presentationType` is never the authority (`O1-L'''`). The type is resolved by
`resolveQuestionTypeKeyOrAlias`: the exact catalog key (case-insensitive), then `LEGACY_TYPE_ALIASES`
(trimmed / lower-cased), so `mcq`, `MCQ`, `tf`, `order`, `Fill`, `table`, `cli` and the rest admit their canonical type's
kinds. The alias matrix (`O1-L`) covers all 22 directive aliases plus case variants, in both `presentationType` and flat
`type` placement, over 8 kinds. The ONE spelling-dependent kind is `text` (see §8 E-2). The kind itself is never normalized:
`"Choice"`, `" choice"`, a non-string and prototype-shaped kinds (`__proto__`, `constructor`, …) are never admitted
(`O1-L'''`).

## 8. Missing / unknown-type decision

| Class | Authority | Decision |
|---|---|---|
| known canonical legacy type | catalog row | catalog kinds + renderer-derived kinds (§6) |
| known alias | catalog row via `LEGACY_TYPE_ALIASES` | identical to its canonical type (except `text`, E-2) |
| missing type (typeless legacy-flat) | the question's own content: fields, table text, `answer.mode` | renderer-derived kinds only; **never `choice`** |
| unknown legacy-flat `type` (e.g. `"sequence"`) | as typeless | as typeless; **never `choice`** |
| unknown STRUCTURED type / unsupported `questionTypeVersion` | 16A registry: `resolveGrader → undefined` | grading fails closed (`unsupportedType`, teacher review) whatever the kind; the binding does not apply (E-4) |

The response kind is never its own authority. A typeless question never admits `choice`: the official renderer never drew
radios for one, and `choice` is the exploit's grader.

Documented exceptions (each pinned by a test):
- **E-1, answer-key sequence.** A legacy question whose own answer key is a sequence admits `sequence` even when typeless
  or fieldless. The legacy dispatch has always graded such a question with the sequence grader (O1-L5; the pre-existing
  16A parity fixture's `type:"sequence"` question and the AI-builder `exactSequence` fixtures prove it).
- **E-2, raw choice alias.** A raw stored choice alias (`mcq`, `tf`) renders a **textarea**, because the client tests the
  literal spelling. Its text answer is admitted and keeps its historical grade: teacher review, never a score. Refusing it
  would silently drop the only answer the client lets the student give (AGENTS §10). O1-L4 pins this. Canonical
  `multipleChoice` / `trueFalse` admit no text.
- **E-3, empty containers.** `fields: []` and a header-only table prove nothing (O1-K', O1-J').
- **E-4, unknown structured type / unsupported version.** These are the 16A registry's fail-closed result, unchanged.
  Ingest keeps storing a legacy-shaped answer for them, as on the baseline. Refusing it would change the ingest of modern
  types with an unsupported version, which this phase must not touch. The answer can never score. In a first-N section it
  can take one of the student's **own** slots and goes to teacher review. The client renders "unsupported" for these
  questions, so no legitimate answer exists. O1-L6 pins it.

## 9. Ingress enforcement

`draft-answers.js` `bindLegacyAnswer(a, q)`, used by `saveDraft`, `submit` and `pauseAttempt` through
`normalizeDraftAnswers`, runs these checks in order:
1. shape (`ANSWER_INVALID`, 20G.1);
2. **kind binding** (`ANSWER_KIND_MISMATCH`, new);
3. size (`ANSWER_TOO_LARGE`, 20G.1).

The kind check calls `admittedResponse(q, answer)` (exam-structure), which calls `legacyResponseAdmitted`
(question-type-graders), which calls the shared `legacyAnswerKindAllowed`.

- `ANSWER_KIND_MISMATCH` is distinct from `ANSWER_INVALID`: the shape is valid but the question never accepts that kind.
- The refused answer is not stored and not converted to another kind.
- Compound parts are bound against their own part node and refused one part at a time (`cq.p1`).
- Composite children are bound against `compositeChildNode(raw)`. Their code is reported as `ANSWER_KIND_MISMATCH`, not
  masked as `COMPOSITE_CHILD_ANSWER_INVALID` (it is not in `LEGACY_SHAPE_CODES`).
- Every specialized modern binder and its code runs before the legacy binder, unchanged.

## 10. Grading enforcement

The gate in `gradeLegacyQuestion` (§5) consumes the same `legacyResponseAdmitted`. Grading never assumes ingest ran. Stored
data, imported data and data restored from before 20G.2 are all re-checked at dispatch. A mismatch returns `score 0`,
`correct false`, `manualReview true`. That is the repository's fail-closed convention, the same shape as `unknownTypeResult`
and the composite broken-authority result. It is never a silent zero.

## 11. FirstN semantics

`exam-structure.js` adds `admittedResponse(q, resp)`. It mirrors `gradeQuestion`'s dispatch order (composite, compound,
registry):
- a plain legacy answer survives only if admitted;
- a compound answer keeps only the part answers its part nodes admit, and a compound question answered with another kind
  admits nothing;
- a composite answer keeps only the child answers its child nodes admit.

`getAnswerUnits` decides `answered` from the admitted response at both question level and part level. A mismatch therefore
never takes a first-N slot, never pushes a later valid answer out, never inflates the server's answered count, and is not
reported as an "ignored excess answer". Valid answers keep the baseline selection byte-for-byte (O1-FN4 and the 20D freeze
pins). FN1–FN3 cover stored data graded directly, FN3' covers a compound question stored with another kind, and FN5 covers
part level.

## 12. Compound behaviour

Each part is graded as `{...part, presentationType: part.type || part.presentationType}`, unchanged, so the gate applies to
every legacy part automatically. Ingest binds each part against that same node. Preserved:
- part ids, part marks and `answerUnit:"part"`;
- the specialized part mismatch codes (`CODE_/NETCLI_/SMARTSIM_/HOTSPOT_QUESTION_MISMATCH`, `COMPOUND_PART_UNKNOWN`);
- the 20G.1 compound hardening.

The 20D compound freeze pins are byte-identical before and after (16 pins compared, §16).

## 13. Composite behaviour

Composite children are graded through `gradeQuestion(compositeChildNode(raw) + marks)`, so a legacy child is gated, and a
shortAnswer or ordering child with a forged choice scores 0 and goes to review (O1-X). Group first-N selection
(`selectCompositeCountedParts`) now receives the **admitted** composite answer, so a mismatched child takes no group slot
(O1-X'). The counted children are still graded from the stored answers. SmartSim-linked parts, the composite structure
authority and the client composite model (which is in the initial bundle) are untouched.

## 14. Historical stored-data behaviour

**No migration is required for grading safety.** Tests prove it:
- O1-Z: an exam of fillBlank / ordering / tableFill / shortAnswer questions whose stored answers are forged choices,
  passed straight to `gradeExam`, scores 0 with every question pending review (baseline 28/28);
- FN3 / FN3': stored mismatches take no first-N slot;
- O1-Y': a teacher review save over such an attempt keeps the score at 0. `rebuildAttemptGrades` never re-grades, and a
  pending grade contributes its stored 0.

Limitation: a grade **already computed and stored** by a baseline grader before 20G.2 is a stored fact. `rebuildAttemptGrades`
reuses it and does not re-grade, so a historical exploited score persists until the attempt is re-graded. Re-grading or
migrating stored attempts is out of scope (§22).

## 15. Fail-first evidence

The final suites were run on the untouched baseline `6db0fc0` (detached worktree, the same test files copied in):
`api/tests/legacy-answer-type-binding-20g2.test.js` + `src/legacyAnswerBinding.20g2.test.tsx` → **47 tests: 37 fail / 10 pass on the baseline; 47 / 47 pass on this branch.**

| Class | Count | Tests |
|---|---|---|
| Behavioural failure on the baseline (the defect itself) | 30 | O1-A … O1-K plus O1-H', O1-K', O1-K'', O1-J' (each graded 7/7 or was stored on the baseline, e.g. O1-A `expected { score: 7 … } to deeply equal { score: 0 … }`); O1-L' / O1-L'' (choice on an alias / typeless question scored 7/7); O1-L5 (choice on an answer-key-sequence question scored); O1-FN1–3, FN3', FN5; O1-W (`[7, true, false]`); O1-X (`expected 4 to be 0`); O1-X'; O1-Z (`expected 28 to be 0`); O1-Y, Y', Y'', Y3 (forged kinds stored / graded); O1-Y4 (`expected 14 to be 0`) |
| Fail only because the new helper does not exist on the baseline (`TypeError: … legacyAnswerKindAllowed is not a function`) — **not** counted as behavioural evidence | 7 | O1-L, O1-L4, O1-L‴, O1-CAT, O1-CAT2, renderer parity × 2 |
| Pass on the baseline — **pins** of behaviour that must not change | 10 | O1-M/N, O1-O, O1-P, O1-Q, O1-R (incl. the text-keyed trueFalse), O1-S/T/U/V, O1-V', O1-L6, O1-FN4, "choice only from the literal choice renderers" |

The first version of the suite (33 tests) was run on the baseline before any production change: 25 fail / 8 pins pass. Tests added
later (end-to-end resume / stale / retry, mutation-driven strengthening) were re-run on the baseline with the final suite above.

## 16. Compatibility matrix

**Valid scores are unchanged.** Every pre-existing suite passes unchanged on this head (full root run, §18). That includes:
- the Phase 20G certification ledgers: exams A–E, the stress fixture, the capability matrix, student security,
  autosave / restore, import compatibility, the AI Composer, composite, parametric and coding;
- the 20G.1 ingest suite;
- the 16A grading-parity fixture generated on 6468cc7 (the legacy flat exam with alias / missing types is unchanged);
- the AI-builder `exactSequence` grading proofs;
- the section and first-N suites.

**Freeze pins.** The 20D compound@1 freeze digests were captured before the implementation (`CAPTURE_20D_PINS`) and again
after it. The 16 pins are **byte-identical** (`cmp` equal), so no pin was recaptured. 20G.1's F-7 pin is untouched.

**The one existing test whose input changed:** `api/tests/composite-review-fix-20d.test.js` (20D-RF1-F1). It used
`{kind:"choice"}` on a **matching** child as its "well-formed, kept" control. That is exactly the O1 forgery, and no renderer
ever produced it. The control is now an admitted `fields` answer for that child. The test's intent is unchanged: keep the
well-formed child, drop and report the malformed one, never crash grading. O1-X now proves the choice is refused.

**Renderer answer-kind matrix.** Generated by rendering `StudentQuestionCard` and operating every control. Each cell reads
`emitted ⟶ admitted`:

| type | bare | fields | tableText | tableGrid |
|---|---|---|---|---|
| multipleChoice |  ⟶ admits choice | sequence ⟶ admits choice,sequence,fields | table ⟶ admits choice,table |  ⟶ admits choice |
| trueFalse | choice ⟶ admits choice | choice+sequence ⟶ admits choice,sequence,fields | choice+table ⟶ admits choice,table | choice ⟶ admits choice |
| multiTrueFalse |  ⟶ admits text,fields | fields ⟶ admits text,sequence,fields |  ⟶ admits text,table,fields |  ⟶ admits text,fields |
| shortAnswer | text ⟶ admits text | sequence ⟶ admits text,sequence,fields | table ⟶ admits text,table | text ⟶ admits text |
| fillBlank |  ⟶ admits text,sequence,fields | sequence ⟶ admits text,sequence,fields | table ⟶ admits text,sequence,table,fields |  ⟶ admits text,sequence,fields |
| wordBank |  ⟶ admits text,sequence,fields | sequence ⟶ admits text,sequence,fields | table ⟶ admits text,sequence,table,fields |  ⟶ admits text,sequence,fields |
| matching | text ⟶ admits text,fields | sequence ⟶ admits text,sequence,fields | table ⟶ admits text,table,fields | text ⟶ admits text,fields |
| ordering | text ⟶ admits text,sequence | sequence ⟶ admits text,sequence,fields | table ⟶ admits text,sequence,table | text ⟶ admits text,sequence |
| tableFill | text ⟶ admits text,table,fields | sequence ⟶ admits text,sequence,table,fields | table ⟶ admits text,table,fields |  ⟶ admits text,table,fields |
| cliFill |  ⟶ admits text,fields | fields ⟶ admits text,sequence,fields |  ⟶ admits text,table,fields |  ⟶ admits text,fields |
| mcq | text ⟶ admits choice,text | sequence ⟶ admits choice,text,sequence,fields | table ⟶ admits choice,text,table | text ⟶ admits choice,text |
| (typeless) | text ⟶ admits text | sequence ⟶ admits text,sequence,fields | table ⟶ admits text,table | text ⟶ admits text |

Every emitted kind is admitted. The parity suite asserts this for 25 spellings × 6 shapes × 2 placements, and for
`CompoundPartControl` on both the compound part node and the composite child node. The client really emits `sequence` for a
multipleChoice / trueFalse question that carries fields, and `table` for any question whose text holds a table. A
catalog-only binding would have refused those valid client answers.

## 17. Mutation campaign

The campaign ran in two rounds plus a round-3 re-run. Every plant ran one at a time. A SHA-256-verified byte-for-byte restore
ran in `finally`, and `git status` was clean before and after (the round-2 runner refuses to start on a dirty tree).

Targets:
- helper plants target the GENERATED `shared-finalization/questionTypeAliases.js` / `questionTypeCatalog.js` that the API
  executes;
- `U01–U04` target the TypeScript source that the renderer-parity suite executes;
- the drift test is deliberately excluded from mutant suites, because it would kill every helper plant trivially.

Totals: **69 distinct plants: 68 KILLED, 1 equivalent, 0 TIMEOUT, 0 unexplained survivors.** Every survivor of a round was
either killed by a strengthened test in the next round (8 plants: 7 from round 1, D-M23 from round 2) or proven equivalent
(U04).

### Round 1 — implementation-designed plants (34)

| Id | Planted defect | Outcome | Killed by |
|---|---|---|---|
| M01 | grading gate removed | KILLED | O1-A…K (exploit closed) |
| M02 | gate fails closed WITHOUT teacher review (silent zero) | KILLED | O1-A…K (exploit closed) |
| M03 | gate also catches ABSENT responses (unanswered → review) | KILLED | composite-20d.test.js (20D-S1, an unanswered child must stay a plain 0) |
| M04 | gate awards full marks on mismatch | KILLED | O1-A…K (exploit closed) |
| M05 | helper: choice admitted on every legacy type | KILLED | O1-A…K (exploit closed) |
| M06 | helper: modern bypass applied to legacy types too | KILLED | O1-A…K (exploit closed) |
| M07 | helper: aliases not resolved (exact catalog key only) | KILLED | O1-L |
| M08 | helper: table admitted without a table in the text | KILLED | O1-A…K (exploit closed) |
| M09 | helper: sequence/fields admitted with an EMPTY fields array | SURVIVED → **KILLED** after strengthening (R2-M09) | O1-K' |
| M10 | helper: answer.mode sequence admitted on choice types | KILLED | O1-L5 |
| M11 | helper: answer.mode rule dropped (typeless exactSequence refused) | KILLED | O1-L5 |
| M12 | helper: text admitted everywhere | KILLED | O1-A…K (exploit closed) |
| M13 | helper: text decided by canonical type (raw mcq textarea answer refused) | KILLED | O1-L |
| M14 | helper: flat type takes precedence over presentationType | SURVIVED → **KILLED** after strengthening (R2-M14) | O1-L''' |
| M15 | helper: table separator rows count as data (header-only table admits table) | SURVIVED → **KILLED** after strengthening (R2-M15) | O1-J' |
| M16 | server wrapper: legacy questions bypass the binding | KILLED | O1-A…K (exploit closed) |
| M17 | server wrapper: legacyFlat flag inverted | KILLED | O1-L5 |
| M18 | first-N: plain questions not bound (raw response counts) | KILLED | O1-A…K (exploit closed) |
| M19 | first-N: compound parts not filtered | KILLED | O1-FN block (firstNAnswered describe; test title truncated in the round-1 log) |
| M20 | first-N: compound question answered with another kind still counts | SURVIVED → **KILLED** after strengthening (R2-M20) | O1-FN3' |
| M21 | first-N: composite children not filtered | KILLED | O1-X' |
| M22 | first-N: question-level unit uses the raw answered predicate | KILLED | O1-FN block (firstNAnswered describe; test title truncated in the round-1 log) |
| M23 | first-N: part-level unit uses the raw answered predicate | KILLED | O1-FN block (firstNAnswered describe; test title truncated in the round-1 log) |
| M24 | composite grader selects on the raw answer | KILLED | O1-X' |
| M25 | ingest: kind binding removed | KILLED | O1-A…K (exploit closed) |
| M26 | ingest: mismatch reported as ANSWER_INVALID | KILLED | O1-A…K (exploit closed) |
| M27 | ingest: compound part bound against the WHOLE compound question | KILLED | answer-ingest-hardening-20g1.test.js: D3-A an unknown top |
| M28 | ingest: composite child kind mismatch masked as COMPOSITE_CHILD_ANSWER_INVALID | KILLED | O1-X |
| M29 | section grading: ignored flag uses the raw answered predicate | SURVIVED → **KILLED** after strengthening (R2-M29) | O1-FN1 / FN2 / FN3 |
| M30 | part section grading: ignored flag uses the raw answer | SURVIVED → **KILLED** after strengthening (R2-M30) | O1-FN5 |
| U01 | TS helper: text decided by canonical type (renderer parity) | KILLED | renderer parity: 20G.2 O1 — renderer parity: every kind a |
| U02 | TS helper: table never admitted on content | KILLED | renderer parity: 20G.2 O1 — renderer parity: every kind a |
| U03 | TS helper: fields content rule dropped | KILLED | renderer parity: 20G.2 O1 — renderer parity: every kind a |
| U04 | TS helper: choice refused on aliases (exact keys only) | SURVIVED — **equivalent** for the UI parity suite (see note) | — (same plant in the API copy = M07: KILLED) |

### Round 2 — the directive's classes M01–M25 (35 plants; a/b/c = several plants for one class)

| Id | Planted defect | Outcome | Killed by |
|---|---|---|---|
| D-M01 | grading: restore `// response.kind === "choice"` (a choice skips the binding) | KILLED | O1-A |
| D-M02 | grading: restore `// response.kind === "sequence"` (a sequence skips the binding) | KILLED | O1-K |
| D-M03 | helper: table grader for any kind:"table" | KILLED | O1-J |
| D-M04 | helper: fields admitted for every legacy type | KILLED | O1-K'' |
| D-M05 | ingest: answer-kind check skipped | KILLED | O1-B |
| D-M06 | grading: answer-kind check skipped | KILLED | O1-A |
| D-M07 | helper: mismatch allowed only for aliases (an alias / case variant bypasses) | KILLED | O1-L |
| D-M08 | helper: raw type resolved, aliases skipped | KILLED | O1-L |
| D-M09 | helper: response.kind is the fallback authority when the type is unknown | KILLED | O1-L5 |
| D-M10 | helper: a missing type is response-authoritative | KILLED | O1-L5 |
| D-M11a | catalog: fillBlank permits only sequence | KILLED | O1-CAT2 |
| D-M11b | helper: fillBlank refuses fields | KILLED | O1-CAT2 |
| D-M12a | catalog: fillBlank permits only fields | KILLED | O1-CAT2 |
| D-M12b | helper: fillBlank refuses sequence | KILLED | O1-CAT2 |
| D-M13a | catalog: wordBank loses sequence | KILLED | O1-CAT2 |
| D-M13b | helper: wordBank refuses fields | KILLED | O1-CAT2 |
| D-M14a | catalog: tableFill loses table | KILLED | O1-CAT2 |
| D-M14b | helper: tableFill refuses table | KILLED | O1-P |
| D-M15a | catalog: tableFill loses fields | KILLED | O1-CAT2 |
| D-M15b | helper: tableFill refuses fields | KILLED | O1-P |
| D-M16 | helper: shortAnswer accidentally permits choice | KILLED | O1-D |
| D-M17 | helper: ordering accidentally permits choice | KILLED | O1-A |
| D-M18a | grading: compound child bypass (part sub-questions skip the binding) | KILLED | O1-FN5 |
| D-M18b | ingest: compound child bypass (part answers bound without their node) | KILLED | O1-W |
| D-M19a | grading: composite legacy child bypass | KILLED | O1-X |
| D-M19b | ingest: composite legacy child bypass | KILLED | O1-X |
| D-M20a | first-N: a mismatched response counts as answered (question level) | KILLED | O1-FN1 / FN2 / FN3 |
| D-M20b | first-N: a mismatched part counts as answered (part level) | KILLED | O1-FN5 |
| D-M20c | first-N: a mismatched composite child counts in its group | KILLED | O1-X' |
| D-M21 | grading trusts canonical-shaped (ingest-looking) data: old persisted {kind,index} passes | KILLED | O1-A |
| D-M22 | review rebuild re-introduces an auto-score for a fail-closed (pending) grade | KILLED | O1-Y' |
| D-M23 | trueFalse implicit options broken | SURVIVED → **KILLED** after strengthening (round 3) | O1-R |
| D-M24 | multipleChoice valid choice incorrectly manual-reviews | KILLED | O1-Q |
| D-M25a | unknown / unsupported type falls back to the client-selected legacy grader | KILLED | O1-L6 |
| D-M25b | binding: an unknown legacy-flat type admits whatever the response claims | KILLED | O1-L5 |

**U04 is equivalent for the parity suite.** The client emits `choice` only for the literal spellings `multiplechoice` /
`truefalse`, and `resolveQuestionTypeKey` resolves those case-insensitively without the alias table. Every other emitted
kind (`text`, `table`, `sequence`, `fields`) is decided by rules that give the same answer without the alias resolution. The
same plant in the code the server runs (M07 / D-M08) is KILLED by O1-L.

## 18. Full validation

Run sequentially on the code head `39cdba2`, after `rm -rf dist`. The design-record commit that follows changes only this
file.

| Check | Result |
|---|---|
| Focused 20G.2 suites (`legacy-answer-type-binding-20g2.test.js`, `legacyAnswerBinding.20g2.test.tsx`) | 47 / 47 pass |
| O1 exploit reproduction | 7/7 on the baseline (§3); 0 + teacher review on the head (O1-A) |
| 20D compound freeze pins | 12 / 12 pass; the 16 captured pins are byte-identical before and after |
| Full root `npm test` (app + API + scripts, includes every 20G / 20G.1 certification, composite, first-N, submission / autosave, governance suite) | **781 files, 10,311 tests, all passed**, exit 0 |
| `npm run lint` | exit 0; 0 errors; 104 warnings, **exactly the baseline's warning set** (compared by file + rule) |
| `npx tsc -b --force` | exit 0 |
| `npm run build` | exit 0; bundle guard passed (§19) |
| `git diff --check` | clean |
| Shared-finalization drift test | 2 / 2 pass |
| Runner unit suite (`npm --prefix runner test`, run in isolation; `runner/**` is untouched) | 407 / 407 pass, 0 skipped |

## 19. Bundle measurement

`npm run build` (fresh, no stale `dist/`): **initial JS graph 18 files, 124.2 KB gzip — budget 125 KB, the same as the baseline measurement (124.2 KB)**; `bundle guard passed`. The helper lives in `src/questionTypeAliases.ts`, which the client already imports; no client code calls `legacyAnswerKindAllowed` (only the parity test), so it is tree-shaken. No client component changed.

## 20. Exact-head CI

Recorded on the pull request (body table, refreshed for every pushed head) and in the phase's final report. A design record cannot certify the commit that contains it: CI is reported only for the exact final head SHA (AGENTS §6).

## 21. Independent-review rounds

An independent read-only adversarial review runs on the exact PR head with its own mutants. Every Review Fix commit is re-reviewed on its new head. Rounds and verdicts are recorded on the pull request and in the final report, for the reason given in §20.

## 22. Known limitations

- **Stored exploited grades persist.** Scores already computed by a baseline grader and stored before 20G.2 persist through
  `rebuildAttemptGrades`, which reuses stored grades. Migration or re-grading of stored attempts is out of scope
  (directive §28).
- **E-4: unknown structured type / unsupported version.** Ingest keeps storing a legacy-shaped answer for these. Grading
  fails it closed; it can take one of the student's own first-N slots.
- **E-2: raw `mcq` / `tf` aliases.** A question stored with such an alias renders a textarea on the client (pre-existing
  rendering, no client redesign in this phase). Its text answer goes to teacher review as before.
- **Client display only.** The live first-N progress mirror (`src/examStructure.ts`) still counts what the local state
  holds. A hostile client could show itself a forged count; the server never stores or counts it.
- **Out of scope (directive §28), recorded separately:**
  - the 20G.1 64 KiB refusal-reporting UX;
  - HTTP body-size limits;
  - duplicate question ids;
  - the 0 / false id edge;
  - the GovernancePanel timing flake.

## 23. Final verdict

The verdict is issued only for the exact final PR head, after exact-head CI and a CLEAN independent review. It is recorded on the pull request and in the final report as `LEGACY ANSWER-TYPE / GRADING BINDING 20G.2: PASS` or `… BLOCKED` with blockers. The owner merges manually; this phase never merges.
