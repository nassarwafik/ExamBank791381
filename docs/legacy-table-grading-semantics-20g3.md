# Phase 20G.3 — Legacy Table Grading Semantics Hardening (design record)

Closes **L-F2** (found by the Phase 20G.2 independent review): the legacy table grader gave knowledge-free credit. A table whose
answer key named no row was graded in a "check-mark" mode that treated every blank, unticked or arbitrary cell as a correct
"not ticked". The phase also closes five more table defects found while auditing that grader (§4, §16).

## 1. Exact baseline

`origin/main = c2a49e9907b01225810a1e71311515bd85a8247d` (the owner's merge of PR #274, Phase 20G.2), verified with
`git fetch origin --prune` before any edit. The working tree was clean, with no merge, rebase or cherry-pick in progress and no
planted mutant. Branch: `feature/20g3-legacy-table-grading-semantics`, normal commits only. Every "baseline" figure below was
produced by the untouched code in a detached worktree of c2a49e9.

## 2. Exact L-F2 reproduction (baseline c2a49e9)

The question is a `shortAnswer` worth 4 marks. Its text holds a **data** table (`| الجهاز | IP |`, rows `PC1 | 10.0.0.5` and
`PC2 | 10.0.0.6`), and its key is the free-text answer `255.255.255.0`. The key contains no `row=value` pair and no row label.

| Response | Baseline grade |
|---|---|
| `{kind:"table", values:["x"]}` (what the card sends after the student types "x" in row 1) | **4/4**, correct, no review |
| `["", ""]`, `[false, false]`, `["x", "y"]` | **4/4** each |
| the same answers on a typeless question, or under any unrelated `answer.text` | **4/4** |

The 20G.2 binding admits `table` here, because the student card really draws a table for this question. So the answer is
stored, and the grader then awarded full marks without any knowledge.

## 3. Renderer path

`StudentQuestionCard` draws the stem table when the question is not registered, not unsupported and not a field-type question
(`isFieldType`: multiTrueFalse, cliFill, or a tableFill with a `tableHeaders` / `tableRows` grid) and `parseTable(q.text)`
finds at least one data row. Each data row gets exactly one control:

1. a **select**, when `resolveTableRowOptions(q, row)` yields options (that row's `field.options`, a `boolean` field, or the
   shared `wordBank` when the question has fields);
2. otherwise a **checkbox**, when the question text is check-box phrased (`/وضع علامة|✓|خاص بالشبكات الخاصة\?|private\?/i`);
3. otherwise a **free-text input**.

`StudentExamPage.setTable` builds the answer by copying the previous values and setting one index, so the array is **sparse**.
A table answered only on row 1 is sent as `[v]`, and its holes become `null` once serialized. Reproduced through the real card
(`src/legacyTableGrading.20g3.test.tsx` R1–R3), using the real controls and the real emitted Answer:

| Case | Baseline grade |
|---|---|
| R1: the L-F2 question draws 2 text inputs; typing "لا أعرف" emits `["لا أعرف"]` | 4/4 |
| R2: a check-box table answered by ticking only row 1 emits `[true]` | 6/6 |
| R3: a matching (select) table answered only on row 1 emits `["تطبيقات"]` | 6/6 |

## 4. Root cause

The baseline `gradeTable` dates from the repository's first commit and never changed:

```
rows = tableRows(text); vals = response.values
if pairMap(answer.text) is non-empty: keyed compare, total = min(rows, vals)
else if answer.text is non-empty:      expected[i] = answer.text.includes(clean(row label))   // "check-mark" mode
                                       actual[i]   = v === true || clean(v) ∈ {"true","1","✓"}; total = min(rows, vals)
```

It ignored what the student was actually shown. Any key without `=` switched **every** row of **every** table (text inputs and
selects included) into check-mark mode. A row missing from the key became "expected unticked", and a blank or arbitrary cell
"matched" that expectation, so a key that names no row credited every untouched cell. The same code had five more defects:

- **Denominator inflation:** `total = min(rows, cells)`, so the sparse array of a table answered on row 1 was graded out of 1.
- **Substring membership:** the key `R10` made row `R1` "expected ticked".
- **Blank and duplicate row labels:** a blank label is a substring of every key, and duplicate labels cannot be told apart.
- **Empty or conflicting key values:** `Router=` credited a blank cell, and a repeated key silently kept its last value.
- **A crash on non-primitive stored cells:** `{toString:null}` threw `TypeError: Cannot convert object to primitive value`.

## 5. Historical table modes

Archaeology across the repository:

- **Every producer writes `row=value` keys:**
  - `examBuilderState.buildMatchingPatch`, `exam-quality-fix` and `structuredAiProposal`;
  - the F-series library maps `library-fseries-map` and `library-json-map` (with the Arabic separator `؛`);
  - the library overlay.
- **Import panel and bank-import tables** use `{mode:"anyAccepted"}` and already go to manual review.
- **No repository data uses the check-mark mode on a table that is actually drawn with checkboxes.** The only check-mark
  fixture (`assignment-grading.test.js`, text "ضع علامة…", without the leading و) is drawn with **text inputs**, so it is
  itself an instance of L-F2 (§17).
- **The exam library** has 41 questions with a markdown table:
  - 39 are keyed (28 with select rows, 11 with text rows) and grade identically after this phase;
  - **LIB-F06-Q41** is keyed `1=1؛ 2=3`, values its selects never offer, so a real student always scored a silent 0. It now
    goes to teacher review (§9);
  - LIB-F06-Q29 is an `open` question with no key; it was manual before and stays manual.

## 6. New table semantic authority

`src/legacyTableSemantics.ts` is pure, uses no React, and is compiled into the shared build for the API. It is the **one**
legacy table authority:

- `parseTable` and `resolveTableRowOptions` moved here verbatim (`questionContent.tsx` re-exports them);
- `isCheckboxTableText` is the check-box phrasing;
- `legacyTableCellControl(q, row)` returns `"select" | "checkbox" | "text"`, the control the card draws for a row.

Consumers:

- `StudentQuestionCard` draws each row from `legacyTableCellControl`, with a byte-identical DOM. `tableCheckbox` remains as a
  thin wrapper.
- The server's `legacyTableMode(question)` (in `assignment-grading.js`) decides the grading mode from the question alone, using
  the same parse and the same per-row control.
- The 20G.2 binding's `textHasTable` now calls the same `parseTable`; this is equivalent to its old inline copy.

| Mode | When (decided from the question alone) |
|---|---|
| `none` | no markdown table in the text |
| `keyed` | `answer.text` has `row=value` pairs, every drawn row has a non-empty expected value, and that value is valid for the row's control: a select row's value is one of its options (normalized); a checkbox row's value is `true` or `false` |
| `checkbox` | no pairs, **every** drawn row is a checkbox, and `answer.text` is a list (separators `, ، ; ؛ / \|` or newline) whose items are each **exactly** a row label |
| `manual` | anything else: a blank or duplicated label, conflicting or incomplete keys, an empty value, an unofferable select value, a non-boolean checkbox value, a membership key on non-checkbox rows, an empty list, or a list item that names no row |

`gradeTable`:

- In `none` or `manual` mode, or when no values were sent, it returns **score 0 + teacher review**.
- Otherwise the **denominator is every drawn row**, and a missing cell is a blank or unticked row.
- Cells are read as primitives only (string, number, boolean). Any other value is blank and can neither crash the grader nor
  match.
- When nothing is ticked or typed in any **drawn** row, the answer is **unanswered**: score 0, no review. This is consistent
  with `isResponseAnswered` (§13).

## 7. Keyed-value behaviour

A complete, valid key grades exactly as before. Pinned (T05–T07, T21, T27, T34 and the existing suites):

- full, partial and all-wrong answers;
- reordered keys;
- whitespace, case, NFKC and tatweel normalization;
- the separators `;` and `؛`;
- `=` inside a value (everything after the first `=`);
- extra cells beyond the drawn rows.

Two changes, both proven defects:

- **Every row is the denominator:** `["3"]` on a 3-row 6-mark table now scores 2, where the baseline gave 6.
- **A key that misses a row, gives an empty value, conflicts or names unofferable values goes to review** (T30′, T14′).

## 8. Checkbox behaviour

Checkbox grading needs both a renderer that proves the rows are checkboxes (every row is a `checkbox`) and a key that names the
rows to tick by exact, normalized label. Then:

- a row is expected ticked if and only if its label is in the list;
- a row is ticked if and only if its value is `true`, `"true"`, `"1"` or `"✓"` (the historical set, unchanged);
- any other value (`"yes"`, `"x"`, `"on"`, a string `"false"`, `null` or a hole) is unticked.

A key that names no row, or names a row that does not exist, cannot tell ticked from unticked rows, so it goes to review (T11).

A checkbox table may also carry an explicit `row=true` / `row=false` key (keyed mode). Its rows are graded through ticks, so an
untouched row reads as `false` (T31). Any other keyed value (`نعم`, `✓`, `1`) goes to review (T32).

## 9. Select behaviour

A select row can only be graded from a `row=value` key whose value is one of the options it offers. A membership key on select
rows, including boolean selects, never reaches check-mark grading; it goes to review (T12). An unofferable value goes to review
instead of a silent 0 (T14′, LIB-F06-Q41).

Governance already refuses a matching pair whose per-field `correct` value is not among its options, so the exact Q41 shape
reaches students only through the library.

## 10. Text-input behaviour

A text-input row is graded only from an explicit, non-empty `row=value` value (exact after `clean()`). Blank cells and
non-check values are never read as "false = correct". A membership key, prose, or an empty or absent key on a text-input table
goes to review (T01–T04, T13, T29).

## 11. Ambiguous / manual-review behaviour

`manual` → `{score: 0, correct: false, manualReview: true}`, never a guess. The answer stays stored and admitted (see "Ingest vs grading"
below); the teacher sees it as pending and settles it through the review (acceptance fixture D / G, §21).

**Ingest vs grading.** Ingest is unchanged. The 20G.2 binding (`legacyAnswerKindAllowed`, placement, field-type) still decides whether a table answer is **admitted**, and a valid but ambiguous table answer is stored. The new authority only decides **how an admitted table is graded**: automatically, or 0 + review. "Answer kind invalid" (refused, absent, never counted) and "valid answer requiring review" (stored, counted, pending) remain distinct (T18, fixture D / E vs F).

## 12. tableFill compatibility

- **A tableFill with a `tableHeaders` / `tableRows` grid is a field-type question:**
  - The card draws the grid from fields, so no legacy table is drawn.
  - Its historical `{kind:"table"}` answer stays ingest-compatible (20G.1 q8, T14). With no stem table, the table grader finds
    nothing and returns 0 + review.
  - The field-set answer is graded unchanged (T15, fixture E).
- **A grid whose text also holds a markdown table:** the 20G.2 binding refuses the table kind there (the parity matrix's
  "bound-out" row).
- **A tableFill without a grid**, whose stem table the card draws, follows the table rules above.

## 13. firstN behaviour

The convention, unchanged and pinned (T18): a **genuinely answered** table that needs review **takes its first-N slot**. It is
counted, scores 0 and appears in `manualReviewMarks`; an "invalid answer kind" never takes a slot (20G.2). A keyed table answered
correctly takes the slot and scores.

**Negative-answer decision (§13 of the directive):** `isResponseAnswered` treats a table with no ticked or non-empty cell as
**unanswered**. The grader agrees: an all-unticked answer scores 0 with no review, and earns no credit for rows the key leaves
unticked (the baseline gave 2/6). Answered-ness was deliberately **not** changed. Consequence: a checkbox table whose correct
answer is "tick nothing" cannot be auto-graded. A membership key always names at least one row; an all-`false` keyed checkbox
table scores 0 when left untouched. No repository data has this shape. Recorded as a follow-up (§25).

## 14. Compound / composite behaviour

Unchanged. A part or composite child is answered through `CompoundPartControl`, which never draws a table. A forged table there
is refused at ingest (`ANSWER_KIND_MISMATCH`) and fails closed at grading (T16 / T17, fixture F1 / F2). The refused part leaves
an empty compound or composite answer, which both c2a49e9 and the head grade 0 + review (existing semantics). A forged part table
never steals a part-level first-N slot (20G.2 RF1-F1e, re-run).

## 15. Stored-data behaviour

- **Answers stored before the phase are re-graded by the new grader.** An old L-F2-shaped answer passed straight to `gradeExam`
  scores 0 + review (T19). Stored nulls, which are serialized holes, read as blank or unticked.
- **Grades already computed and stored are not recomputed.** `rebuildAttemptGrades` reuses each attempt's stored
  `questionGrades`, so an attempt graded on c2a49e9 keeps its stored table scores until a teacher or regrade re-grades it.
  Practice best scores are persisted the same way.
- **No migration is part of this phase.** Finding such attempts means re-grading stored attempts whose question carries a
  markdown table, through the new grader, with the owner's authorization.

## 16. Substring / duplicate-row analysis

| Defect | Baseline | Head |
|---|---|---|
| Labels IP/RIP, LAN/VLAN, HTTP/HTTPS, A/AA with key `RIP، VLAN، HTTPS، AA` (T25) | the correct answer scored **4/8** and tick-all scored 8/8 | 8/8 and 4/8 |
| Arabic whole-word prefixes الشبكة / الشبكة الخاصة / الشبكة العامة (T26) | 4/6 | 6/6 |
| Duplicate row labels (T23) | keys could not tell the rows apart | review |
| Blank row labels (T24) | review only with the key `=3` | review in every mode |
| Duplicate key entries with conflicting values | last value won silently | review |
| Separator-only rows | — | the parse is unchanged |
| A table whose first pipe line is a separator | the baseline parse took the next line as the header, so **every cell was graded against the wrong row** | the head grades the rows the student is shown (differential class P) |
| Extra / fewer cells, `null`, `false`, `""`, `"false"`, `"0"`, `"1"`, `"✓"`, Arabic text | see the T20–T22, T28, T29′ and T33 pins | |
| Prototype-shaped cells (`{toString:null}`, `["3"]`, `{valueOf:1}`) | **crash** | blank, no crash |
| Prototype-shaped keys (`__proto__=…`, `constructor=…`) | — | a `Map` is used, and the keys never satisfy every row, so review |

## 17. Fail-first evidence

The final versions of the three new test files were run against a detached worktree of **c2a49e9** (log:
`ff-final.json`): **28 failed, 8 passed (pins)**. Every failure is a real behavioural difference (e.g. T01 `expected
{score: 4…} to deeply equal {score: 0…}`, T20 6/6, T25 4/8, T28 the TypeError). On the baseline the parity and matrix tests fail
because the authority does not exist yet, and the acceptance file cannot load. Its ledger was therefore computed on c2a49e9 with
the real ingest and grader instead (§21).

**Pins that pass on the baseline:** T05–T07, T27, T21, T08–T10, T14/T15, T16/T17, T30 and T34.

**T31–T33 were written after the implementation**, to close mutation survivors (§20). They also fail on c2a49e9 (e.g. T31: 4 vs
6), but they are reported as post-implementation tests, not fail-first.

**Existing tests whose expectation moved (each justified in place):**

- **`assignment-grading.test.js`, "legacy checkbox-style table":**
  - Its text `ضع علامة…` is not check-box phrasing for the card, which draws text inputs; the expected 2/2 was the L-F2 defect
    itself.
  - The case is now split. The same table with real check-box phrasing (`وضع علامة…`) keeps 2/2, and the text-input table goes
    to review.
- **`learning-practice-strength-all-items.test.js` and `learning-training-t05-f06.test.js`:**
  - Their helper answers LIB-F06-Q41 with its key's values `"1"` / `"3"`, which its selects never offer.
  - F06 therefore moves from 85% (131/154) to **82% (127/154)**, its strength points from 34 to 33 (total 72 → 71), and its
    review rows from 7 to 8. The extra review row is asserted to be exactly LIB-F06-Q41.
  - F01–F05 and every T item grade identically (computed on both trees).

**The renderer parity test's selector was corrected before it ever ran green.** It counted the rows of a field-type grid as
legacy rows; it now selects rows headed by `th[scope=row]`. It had never executed on the baseline, because the module was
missing.

## 18. Renderer parity

`src/legacyTableGrading.20g3.test.tsx`:

- **R1–R3:** the real card, its real controls and its real emitted Answer, graded by the real server grader.
- **Per-row parity:** for 12 shapes, each drawn row control equals `legacyTableCellControl(q, row)`. The shapes are text,
  checkbox (three phrasings), field-option select, boolean select, select over checkbox phrasing, word-bank select, mixed,
  F-series empty options, field grid, and non-table.
- **Matrix (directive §24), non-vacuous:** shape → drawn control → emitted `Answer.kind` → server `legacyTableMode` →
  grading authority. It covers every control (select / checkbox / text), every mode (`keyed` / `checkbox` / `manual` /
  `none` / bound-out field grid) and both authorities (automatic / review). Manual modes always grade 0 + review.

## 19. Differential campaign

`scratchpad/20g3/diff/differential.cjs` grades seeded, generated (legacy table question, response) pairs with the c2a49e9
grader and the head grader. It checks **every** head result against an **independent oracle** written from the §6 rules (its
own parse, controls, modes and grading, not the head code), and classifies every difference by an explanation predicate. The
run fails on any oracle mismatch, any unclassified difference, any head crash, or any difference in the control answers.

**Generated dimensions:**

- 8 label pools: substring pairs, Arabic prefixes, IPs, digits, and labels containing `/`, `,` or `=`;
- 1–4 rows, including duplicate and blank labels;
- 8 phrasings (the check-box set, "ضع علامة", prose);
- separator variants, including a table whose first pipe line is a separator;
- 6 types (`shortAnswer`, `matching`, `tableFill`, typeless, `fillBlank`, `open`);
- 5 field shapes (none, per-row selects, boolean, word bank, empty options, partial);
- 17 key forms (complete / missing / empty / conflicting / extra / boolean pairs; exact / substring / non-row membership;
  prose; empty; absent; numeric; prototype names);
- responses of 0 to rows+1 cells, with holes, every tick spelling, key values, option values and non-primitive objects.

**Two seeds × 30,000 = 60,000 table cases, plus 240,000 control answers:**

| | count |
|---|---|
| identical | 25,762 |
| different | 34,238 |
| head ≠ independent oracle | **0** |
| unclassified differences | **0** |
| head crashes | **0** (baseline crashed 2,256 times on non-primitive cells) |
| non-table control answers (text / fields / choice / sequence on the same questions) differing | **0** of 240,000 |
| **valid authoritative keyed answers** (keyed text / select rows, every drawn row sent as a primitive, same parse) differing | **0** of 4,024 |

**Direction of every difference:**

- 30,899 auto → review;
- 1,000 lower scores;
- 2,256 baseline crashes;
- 83 higher scores;
- **0** review → auto.

**Classes (a difference can carry several):**

| Class | Cases | Meaning |
|---|---|---|
| R | 9,126 | auto → review: membership key on text / select rows (**L-F2**) |
| R | 5,199 | auto → review: incomplete / empty key |
| R | 4,836 | auto → review: duplicate labels |
| R | 3,385 | auto → review: non-boolean key on a checkbox row |
| R | 2,441 | auto → review: unofferable select value |
| R | 2,243 | auto → review: conflicting key |
| R | 2,200 | auto → review: list item naming no row |
| R | 1,469 | auto → review: blank label |
| X | 2,256 | baseline crash on a non-primitive cell |
| P | 1,296 | the baseline's header parse differs from the card's (§16) |
| D | 940 | denominator: fewer cells than drawn rows |
| O | 537 | a non-primitive cell is read as blank |
| U | 488 | unanswered (nothing ticked / typed in a drawn row) → 0 |
| C | 97 | keyed checkbox rows graded through ticks |
| S | 60 | substring membership → exact tokens |

All 83 higher scores need a valid key and come only from D, C, S, O and P. In each, the head credits a row the student
answered correctly as drawn, and the baseline did not: the denominator now counts every row, an unticked row reads as unticked,
an exact label replaces a substring, and the student's row is now aligned with the row they were shown.

## 20. Mutation campaign

The runner is `scratchpad/20g3/mut/run2.mjs`, the 20G.2 runner:

- each mutant is 1–n exact single-occurrence edits;
- an **unmutated pre-check** of every suite set runs first and must be green;
- every touched file is **SHA-256-verified restored** in a `finally`;
- it refuses to start on a dirty tree;
- `git status` must be unchanged afterwards.

Shared-authority mutants edit the TypeScript source and its generated CommonJS together. Suites: the three 20G.3 files,
`assignment-grading.test.js`, 20G.2 (both), 20G.1, `StudentQuestionCard.test.ts`, the F06 practice suites and (round 2) the 20D
compound freeze.

**Round 1 — 30 design-specific plants:** 26 KILLED on the first run. The 4 survivors were real gaps, closed by T31–T34 and
**KILLED** on re-run (round 2):

- **M07:** a checkbox row's non-boolean key was accepted.
- **M15:** answered-ness was counted over every sent cell.
- **M18:** a keyed checkbox row was compared as text.
- **M20:** the key was split at its last `=`.

**Round 2 — the directive's classes M01–M30 on the final code:** 29 KILLED on the first run, and 1 INVALID (D-M12: its
search text matched two lines). D-M12 was re-targeted with unique context as D-M12b and **KILLED**.

| Class | Plant | Outcome |
|---|---|---|
| M01 | restore the generic check-mark fallback (any key, substring membership, every row) | KILLED |
| M02 | check-mark mode whenever `answer.text` is non-empty | KILLED |
| M03 | every row classified as a checkbox (authority, TS + JS) | KILLED |
| M04 | grader ignores select mode | KILLED |
| M05 | grader ignores text-input mode | KILLED |
| M06 | bypass the row=value map | KILLED |
| M07 | absent row key = expected false | KILLED |
| M08 | unknown list item ignored | KILLED |
| M09 | substring membership | KILLED |
| M10 / M11 | check-box heuristic always true / always false | KILLED / KILLED |
| M12 | table admitted on a compound part (ingest + both part graders) | INVALID → re-targeted → KILLED |
| M13 | table admitted on a composite child (ingest + grader) | KILLED |
| M14 / M15 | ambiguous → manualReview false / full marks | KILLED / KILLED |
| M16 | blank text cells count as correct | KILLED |
| M17 | sparse values filled with the expected value | KILLED |
| M18 / M19 | extra cells raise / missing cells lower the denominator | KILLED / KILLED |
| M20 | duplicate row labels allowed | KILLED |
| M21 / M22 | select table / keyed check-box table into the membership branch | KILLED / KILLED |
| M23 | tableFill grid's historical table refused | KILLED |
| M24 | 20G.2 placement bypass in the shared binding | KILLED |
| M25 | stored nulls read as ticks | KILLED |
| M26 | first-N: a typed review-pending table no longer takes its slot | KILLED |
| M27 / M28 | key normalization removed / Arabic separators removed | KILLED / KILLED |
| M29 | tick parsing broadened (yes / x / on / صحيح) | KILLED |
| M30 | conflicting key auto-grades | KILLED |

**Totals on the final code: 64 plants, every one KILLED.** That is 30 design plants, 30 directive classes and the 4 re-run
survivors; D-M12 was re-targeted once. There were no timeouts and no unexplained survivors. `git status` was unchanged after
every round.

## 21. Full validation

Directive §31, run sequentially (`scratchpad/20g3/fullval.sh`) with `dist` removed first:

- the focused 20G.3 suite, the renderer parity suite and the acceptance fixture;
- 20G.2, 20G.1, the 20G certification A–E (stress, batteries, AI Composer and governance included);
- compound / composite / first-N / 16A parity;
- the full root suite;
- `npm run lint`, `npx tsc -b --force` and `npm run build` (with the bundle guard);
- `git diff --check`, the shared-finalization drift test and the Runner unit suite.

The results for the exact PR head are recorded in the pull-request body; a document commit cannot certify its own head. The 20D
compound freeze pins, captured on c2a49e9 before any edit, are **byte-identical** after the change. The 20G certification ledgers
are unchanged.

### Table security acceptance fixture (directive §25)

`api/tests/legacy-table-acceptance-20g3.test.js` publishes nine questions through governance, assigns them, and answers them
through the real handlers: saveDraft → restore → submit → teacher review. The per-row controls are read from the
**sanitized** delivery through the shared authority. The ledger was derived by hand; on c2a49e9 it was computed with the real
ingest and grader (the head-side values are asserted by the test).

| Id | Shape (marks) | Expert, head | Attacker, head | Expert, c2a49e9 | Attacker, c2a49e9 |
|---|---|---|---|---|---|
| A | keyed text table (6) | 6 | 2 (row 1 only) | 6 | 6 |
| B | check-box table (6) | 6 | 4 (row 1 ticked) | 6 | 6 |
| C | select / matching table (6) | 6 | 2 (row 1 only) | 6 | 6 |
| D | ambiguous data table, L-F2 (4) | 0 + review | 0 + review | 4 | 4 |
| E | tableFill grid (4) | 4 (fields) | 0 + review (historical table) | 4 | 0 + review |
| F1 / F2 | compound / composite with a forged part table (4 + 4) | 4 + 4 | refused → 0 + review | 4 + 4 | refused → 0 + review |
| G | select rows, key never offered (4) | 0 + review | 0 + review | 0 (silent) | 0 (silent) |
| H | check-box, substring labels (8) | 8 | 4 (tick all) | **4** | **8** |
| **Total (46)** | | **38** (+8 pending) | **12** (+20 pending) | 38 | **30** |

After the teacher settles the pending items, the expert reaches 46 and the attacker stays at 12. On c2a49e9 the attacker scored
**30 of 46** with the L-F2 playbook (at most one cell per table, tick everything, arbitrary text), while the expert's correct check-box answer on H scored only 4 of 8 (substring
membership). Both students earned D's 4 marks although the key names no row of D's table.

## 22. Bundle

The initial JS graph, measured with the guard's own static-closure walk using exact gzip bytes:

| | files | gzip bytes |
|---|---|---|
| c2a49e9 | 18 | 127,169 (124.19 KB) |
| head | 18 | **127,267 (124.28 KB)** |
| delta | | **+98 B** |

The budget is unchanged at 125 KB, with 733 B of headroom. The growth is the shared check-box phrasing and per-row control in the
`questionContent` chunk (+141 B); `StudentQuestionCard` shrank by 50 B. No new chunk was added to the initial graph.

## 23. Independent review

An independent, read-only, adversarial review with its own mutants runs on the exact PR head. Its verdict, and any re-review of
a new head, are recorded in the pull-request body.

## 24. Exact-head CI

The required checks are:

- Azure Static Web Apps CI/CD: Quality Gate, plus Build and Deploy (PR preview);
- Coding Runner Security & Smoke Tests.

The run IDs, attempts and conclusions for the exact head are recorded in the pull-request body.

## 25. Limitations

1. **Stored grades are not recomputed.** Attempts graded before this phase keep their stored table scores (§15); no migration.
2. **Negative-only checkbox answers.** A checkbox table whose correct answer is "tick nothing" cannot be auto-graded, because an
   all-unticked answer is unanswered (§13). This is a follow-up; no data has this shape.
3. **LIB-F06-Q41's key** (`1=1؛ 2=3`) is a library content defect. It now goes to teacher review. Correcting the key to its
   option values is an owner content decision, not part of this phase.
4. **Membership lists:** a row label containing a list separator (`,`, `،`, `;`, `؛`, `/`, `|`) cannot be named in a membership
   key, so such a table goes to review. No data has this shape.
5. **The library quality report's `manualReviewCount`** is a conversion statistic (questions without a key). It still counts
   Q41 as auto-gradable. The report is generated from source HTML that is not in the repository, so it was not edited by hand.

## 26. Final verdict

Recorded in the pull-request body for the exact head, after exact-head CI and a CLEAN independent review. **DO NOT MERGE** — the
owner merges manually.
