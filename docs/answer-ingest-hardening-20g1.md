# Phase 20G.1 — Answer Ingest Hardening (design record)

Resolves **D3** of the Phase 20G core certification (`docs/enterprise-core-certification-20g.md` §21, §28). This is a security and reliability hardening phase. It contains no refactor and no product feature.

## 1. Baseline, branch, head

| Item | Value |
|---|---|
| Baseline (`origin/main`) | `b952f5cfe6960abd1eb2629fbb082dea5c64cbc2`: the merge of PR #272 (Phase 20G). Post-merge CI on it was green: Azure SWA run 37623212544 / 1 success, Runner run 37623212634 / 1 success. |
| Baseline moved? | No. `git fetch origin --prune` at every step showed `b952f5c`. |
| Branch | `feature/20g1-answer-ingest-hardening` |
| Head | Recorded in the PR body and the final report, together with the exact-head CI. |

## 2. Threat model

The adversary is an **authenticated student with a hostile HTTP client**. The adversary is not the UI. The UI's limits are never counted as protection. Every student ingest path calls one shared normalizer, `normalizeDraftAnswers(answers, a.examSnapshot || null)` in `api/src/functions/student-submission.js`:
- `saveDraft` (autosave);
- `submit`;
- `pauseAttempt`.

The timed-out, integrity-exit and teacher-ended finalizations grade the **stored** draft, which was normalized when it was saved. The normalizer is the single ingest authority.

**Assets:**
- storage size of the submission blob (draft and every attempt record);
- integrity of grading: a grade must be computed only from answers the attempt records;
- the per-kind authorities (code, codeTemplate, SmartSim, networkCli, hotspot, labelDiagram, openResponse, parametric, inlineCloze, composite);
- teacher review payloads;
- `Object.prototype`.

## 3. D3, reproduced on the baseline

Bound to the published exam, the baseline normalizer stored the following:

| Input | Baseline result |
|---|---|
| `{ ghost: { kind: "text", value: "x".repeat(5e6) } }` (no question `ghost`) | **stored** (5 MB) |
| 100 000 unknown ids, each with a small text answer | **all stored** |
| `{ q1: 5 }`, `{ q1: [1] }`, `{ q1: null }`, `{ q1: { kind: "zzz" } }`, `{ q1: { kind: "text", value: 5 } }` | **stored verbatim** |
| `{ q1: { kind: "text", value: "TCP", junk: <anything> } }` | **stored with `junk`** |
| compound answer with unknown part ids or an extra container key | **stored** |
| a compound answer on a non-compound question | **stored**. It is never gradable, yet it can take a firstN slot through the answered predicate. |
| any answer with a `null` / malformed snapshot | **stored** (pass-through) |
| an own `__proto__` answer key (JSON) | `out["__proto__"] = answer` **re-prototyped the stored map**. See §3.1. |

The specialized binders already refused an unknown id with their own codes:
- `CODE_QUESTION_MISMATCH` (code, codeTemplate);
- `SMARTSIM_QUESTION_MISMATCH`;
- `HOTSPOT_QUESTION_MISMATCH`;
- `COMPOSITE_QUESTION_MISMATCH`;
- the networkCli codes.

A `simulation` state was stored on any id.

### 3.1 Finding D3-P: answers from the prototype chain were graded but not recorded

This was proven on `b952f5c` with test D3-N′, through the real handlers. The submit body `{"__proto__":{"q1":…,"q2":{"kind":"choice","index":1}},"q6":…}` produced two results that disagree:
- `q2` was **graded correct (1 mark)**, because the grader reads `answers?.[id]`, which follows the prototype chain;
- the stored `attempt.answers` contained **only `q6`**.

So the grade was computed from an answer the attempt does not record, and that answer never passed through any binder. It is not a cross-student or privilege issue: the student could send `q2` directly. It is an integrity and authority gap. It is closed by storing every answer and part as an **own data property**, and by the unknown-id refusal (no question is named `__proto__`).

## 4. Answer-family bounds matrix (audit)

"Rebuilt" means the server reconstructs the stored answer from validated fields rather than storing the client object.

| Family (Answer kind) | Client limit | Server limit (before 20G.1) | Rebuilt? | Legacy pass-through before | Remaining surface before → after 20G.1 |
|---|---|---|---|---|---|
| multipleChoice / trueFalse (`choice`) | the options | none | no | yes | unbounded → `{kind,index}`, integer ≥ 0, ≤ 64 KiB |
| shortAnswer and legacy essay alias (`text`) | **none** (no `maxLength`) | none | no | yes | unbounded → string, ≤ 64 KiB serialized |
| ordering (`sequence`) | none | none | no | yes | unbounded → (string\|null)[], ≤ 64 KiB |
| tableFill (`table`) | none | none | no | yes | unbounded → (string\|boolean\|null)[], ≤ 64 KiB |
| fillBlank, wordBank, matching, multiTrueFalse, cliFill, matrix, categorization (`fields`) | **none** on blanks | none | no | yes | unbounded → plain map of string\|boolean\|null\|(string\|null)[], no forbidden keys, ≤ 64 KiB |
| multipleSelect (`multiChoice`) | the options | none | no | yes | unbounded → string[], ≤ 64 KiB |
| numericResponse (`numeric`) | none | none | no | yes | unbounded → `{kind,value,unit?}` strings, ≤ 64 KiB |
| compound@1 container (`compound`) | parts | modern kinds in parts dropped | partially | yes | unknown part ids and extra keys → own part ids only, each part as above, container `{kind,parts}` |
| simulation@1 (`simulation`) | sandbox | `SIMULATION_STATE_MAX_BYTES` 65 536, depth 32 | yes | no | any id → **only an answer unit of the exam** |
| coding@1 / @2 (`code`) | editor | `sourceBytes` ≤ 65 536 per question | yes | no | unchanged |
| coding@3 (`codeTemplate`) | editor | 30 gaps × 16 384 B | yes | no | unchanged |
| networkCli@1 (`networkCli`) | `inputChars` 200 | 300 commands, replayed | yes | no | unchanged |
| smartSim@1 (`smartSim`) | plugin | 1000 actions, 262 144 B, depth 8, replayed | yes | no | unchanged |
| hotspot@1 (`hotspot`) | canvas | 50 points | yes | no | unchanged |
| labelDiagram@1 (`fields`) | drag/drop | 200 response keys, 120-character labels | yes | no | unchanged |
| inlineCloze@1 (`fields`) | `maxLength` 500 | `responseChars` 500 (sliced; pre-existing) | yes | no | unchanged |
| openResponse@1 (`text`) | `maxLength` = `maxChars` | `maxChars` ≤ 20 000 (refused) | yes | no | unchanged |
| parametricNumeric (`numeric`) | slice | 64 / 32 characters (sliced; pre-existing) | yes | no | unchanged |
| composite@1 (`composite`) | per child | 1 MiB answer, context actions; children by the same binders | yes | **legacy children** were shape-checked but kept extra keys | legacy children are now rebuilt and bounded like a top-level legacy answer; the refusal code is unchanged |
| request body | — | Azure Functions platform default only | — | — | unchanged (out of scope). The **stored** size is now bounded (§5). |

## 5. The chosen limit and its rationale

There is **one** new constant: `LEGACY_ANSWER_LIMITS.answerBytes = 65 536`, exported from `api/src/lib/draft-answers.js`. It is the serialized UTF-8 size of a rebuilt legacy answer, and of each compound part.

**Precedent:** it is the existing per-answer ceiling of the two other free-form ingest authorities:
- `SIMULATION_STATE_MAX_BYTES` = 65 536;
- the maximum coding `sourceBytes` = 65 536.

**Headroom:** it holds the largest typed answer the product accepts anywhere, an openResponse at its 20 000-character cap. That is 40 000 bytes of Arabic, and still under 64 KiB at 3 bytes per character. A legacy essay answered through the `essay` → `shortAnswer` alias is therefore never refused at a realistic length.

**Behaviour:**
- Oversize input is **refused** (`ANSWER_TOO_LARGE`), never truncated.
- The specialized limits stay authoritative: legacy validation runs only where no specialized binder applies, and it never loosens a stricter limit.
- Boundaries are tested at exactly N (accepted, byte-for-byte) and N + 1 (refused).

**Resulting bound on stored state:** at most (answer units of the exam) × (their per-kind maximum). This is proportional to the published exam, which only the teacher controls. Unknown ids add nothing.

## 6. Authority and dataflow

```
HTTP body ─► student-submission.js (saveDraft | submit | pauseAttempt)
               └─► normalizeDraftAnswers(answers, a.examSnapshot || null)        ← THE ingest authority (api/src/lib/draft-answers.js)
                     index = flattenQuestions(exam) → sectionQuestionId          ← the SAME id function gradeExam reads
                     for each own key id:
                       composite question? → bindCompositeAnswer (children → bindAnswer with the child node)
                       else bindAnswer:
                         simulation / code / codeTemplate / smartSim / networkCli / hotspot   (kind-first; specialized codes)
                         labelDiagram / openResponse / parametric / inlineCloze               (question-first)
                         compound  → unknown q ⇒ ANSWER_QUESTION_UNKNOWN · non-compound q ⇒ COMPOUND_QUESTION_MISMATCH
                                     · own part ids only (COMPOUND_PART_UNKNOWN) · each part ► bindLegacyAnswer
                         otherwise → unbound: historical pass-through
                                     bound:   unknown q ⇒ ANSWER_QUESTION_UNKNOWN · else ► bindLegacyAnswer
                       bound && id ∉ index ⇒ ANSWER_QUESTION_UNKNOWN   (backstop for every kind a binder accepts)
                       stored as an OWN data property
               ◄─ { answers, rejected[{id, code}] } — only `answers` is stored / graded (endpoint response unchanged)
```

`bindLegacyAnswer` performs these steps in order:
1. Require a plain object whose kind is one of `choice`, `text`, `sequence`, `table`, `fields`, `multiChoice`, `numeric`, with value types from the historical contract.
2. Otherwise refuse with `ANSWER_INVALID`.
3. Rebuild the answer to exactly its contract keys.
4. Refuse with `ANSWER_TOO_LARGE` if the rebuilt answer exceeds the bound.

There is **no second definition of a valid answer id**: the index is the grader's own `flattenQuestions` / `sectionQuestionId`, and compound part ids use the grader's `questionParts` / `partId`. **Unbound** mode (no exam argument) keeps its exact historical behaviour. No HTTP path uses it, and the 20D `draftUnbound` pin proves it unchanged.

The module has no generated mirror: `draft-answers.js` is API-only and is not part of `scripts/build-shared-finalization.mjs`. The mutants therefore target exactly the file the server executes.

## 7. Refusal codes

| Code | When | New? |
|---|---|---|
| `ANSWER_QUESTION_UNKNOWN` | Bound, and the id is not an answer unit of the exam, including a missing or malformed snapshot. The specialized codes win where they apply. | new |
| `ANSWER_INVALID` | Malformed legacy answer: primitive, array, null, unknown kind, wrong value types, forbidden field key. | new |
| `ANSWER_TOO_LARGE` | Rebuilt legacy answer or compound part over 65 536 bytes. | new |
| `COMPOUND_PART_UNKNOWN` | A compound part id the question does not have. | new |
| `COMPOUND_QUESTION_MISMATCH` | A compound answer on a question the grader does not treat as compound. | new |
| `COMPOSITE_CHILD_ANSWER_INVALID` | A composite child refused for its legacy shape: **unchanged**, mapped back from the two generic codes above. | kept |
| every specialized code | Unchanged and with unchanged precedence (D3-H, D3-H′, D3-H″ pins). | kept |

Refusals are recorded in `rejected[]` with deterministic codes. As before, the endpoint still answers 200 and stores only what was accepted. **Per-answer refusal reporting to the client is future work.** It was deliberately not added, so the student API is not destabilized (directive §7).

## 8. Fail-first evidence

The suite is `api/tests/answer-ingest-hardening-20g1.test.js`. The final file (31 tests), run on a clean detached worktree of `b952f5c`, gave **21 failed / 10 passed**. On the head it gives **31 / 31**.

The 21 baseline failures are A, A′, A″, B, C, C′, D, D′, D″, E, H′, I, K, L, N, N′, N″, N‴, P, R and S.

The 10 baseline passes are the pins, which are **labelled as pins**:
- D3-F, D3-F′ (boundary-valid and sparse legacy answers);
- D3-G, D3-G′, D3-G″ (valid forms; stress fixture digest captured on `b952f5c`);
- D3-H, D3-H″ (specialized and composite child codes);
- D3-J (grades equal);
- D3-M (teacher review never shows unknown ids — already true, because review iterates the exam);
- D3-O (20G exams A and E digests captured on `b952f5c`).

Representative baseline failures:
- **D3-A:** `expected [ 'q1', … ] to not include 'ghost'`.
- **D3-D:** `5: expected { q1: 5 } to deeply equal {}`.
- **D3-E:** `expected { q1: { kind: 'text', …(1) } } to deeply equal {}`.
- **D3-I:** the stored submission JSON contains the canary.
- **D3-L:** `attempt.answers` contains the canary.
- **D3-K:** `{ questionId: 'f2', … }` does not match `{ score: 3, ignored: false }`, because the malformed `f1` took the only firstN slot.
- **D3-N′:** `expected 1 to be +0`, because `q2` was graded from the prototype chain.

## 9. F-7: the one intentional freeze recapture

The pin is in `src/compoundFreeze.20d.test.tsx` (test "F-7 draft-answer normalization of compound answers"). All **16** pins were captured with `CAPTURE_20D_PINS` before and after the change.

| Pin | Before | After |
|---|---|---|
| `draftBound` | `d48d3f3a85be41666dcebfd92bbbad8d8f1b5817e4b23527b3273bf2057c5500` | `59ede24887af8ebbaedc6e8be752660254d9d4c2f172273f672a9351df9863d6` |
| the other 15 (`gradeExam`, `gradeSummary`, `gradeMixed`, `gradeMixedEmpty`, `gradeUnknownPart`, `firstN`, `sanitizedExam`, `sanitizedPart`, **`draftUnbound`**, `validation`, `imported`, `saved`, `renderMixed`, `renderExcess`, `editorMixed`) | — | **byte-identical** |

**The semantic difference** comes from re-evaluating the F-7 input on both trees; the probe reproduces both digests exactly:
- **`unknownQ`** is not a question of `EXAM()`. It is no longer stored, and is refused with `ANSWER_QUESTION_UNKNOWN`. This is the D3 invariant itself.
- The **`cq1`** compound container's `extra: 1` key is dropped: the container is rebuilt to `{ kind, parts }`. This closes the extra-key storage path.
- All nine `cq1` parts are byte-identical, and the three modern-kind part refusals (`CODE_` / `SMARTSIM_` / `HOTSPOT_QUESTION_MISMATCH`) are unchanged.

The change is intentional and authorized by the 20G.1 directive §8. It follows from the hardening invariant and from nothing else. Only the `draftBound` literal was edited, with the old value and the reason recorded beside it. There was no blanket regeneration.

## 10. Existing tests that pinned the old permissive ingest

| Test | Why it failed | Change |
|---|---|---|
| `coding-17a` (3 cases) | The non-code control answer `other` answered no question of the fixture exam, so it was an unknown id. | Fixture only: an `other` short-answer question was added. **Assertions unchanged.** |
| `student-submission-stale-attempt` (3 cases) | The draft markers were bare primitives (`q1: "FRESH"`) on an id absent from the snapshot (`questions: []`). | Fixture: `q1` is in the snapshot, and the markers are `{kind:"text", value}`. The identity / 409 / lifecycle assertions are unchanged; the marker comparison is now `toEqual(marker(...))`. |
| `student-submission` (1 case) | `q1` was absent from the snapshot. | Fixture only (grading is mocked there). |
| `open-response-19e` "legacy text answers … untouched" | It pinned an **extra key** kept on a legacy text answer. | The expectation is now `{ kind, value }`. The value is unchanged; the extra key is the closed storage path. |
| `parametric-numeric-19b` (numericResponse half) | It pinned an **extra key** kept on a legacy numeric answer. | The expectation is now `{ kind, value }`. |

No test was skipped, widened or deleted.

## 11. Backward compatibility

- **Valid answers are unchanged.** The conforming client produces exactly the contract keys (`{kind, …}`, `kind` first). Rebuilding is therefore byte-identical for every client answer, including sparse sequence / table arrays (unfilled cells arrive as JSON `null`). The digest pins over the stress fixture (every family, kitchen-sink composite and compound) and over the 20G exams A and E are unchanged from `b952f5c`.
- **Grades are unchanged.** All 20G certification suites pass with their **unchanged** hand-derived ledgers:
  - A Networking, B Physics, C Computer Science, D Mathematics, E Showcase;
  - the stress fixture;
  - the capability matrix;
  - student-security / autosave;
  - import-compat / backward compatibility;
  - the AI composer;
  - the batteries.
- **No grading interpretation changed.** A refused malformed answer grades exactly like no answer, because the legacy grader dispatches on `response.kind` and falls to the same manual-review result for an unknown or absent response. The only grade effect is intended: a malformed answer can no longer take a firstN slot (D3-K).
- **Unbound mode is unchanged:** `draftUnbound` and the unbound composite path.
- **Known edge case (documented, not changed):** a legacy **flat** exam whose question `id` / `examQuestionId` is a falsy non-empty value (`0`, `false`). The client keys it with `qid` (`||`), and the server with `sectionQuestionId` (`!= null`). These already diverged at baseline, so such an answer was stored but **never graded**. 20G.1 now refuses it, instead of storing a value the grader never reads. No fixture or importer produces such ids: library imports use `<examId>-Qnn`. Adding the client's `qid` as a second id authority was deliberately rejected.
- **There is no data migration.** Drafts and attempts stored before 20G.1 are not rewritten. Their unknown ids were never graded, and are ignored by review, which iterates the exam.

## 12. Security review

Each item was proven by a test or a probe; none is claimed without evidence.

| Concern | Result |
|---|---|
| Unknown-id injection | Refused on draft, submit and pause (D3-A, A′, A″, S, I, L, P). |
| Storage amplification | 5 MB unknown answer, 100 000 unknown ids, junk mixed with valid answers: nothing stored. The stored submission stays under 20 / 40 KB in the e2e tests (D3-B, C, I, L). |
| Malformed legacy injection | Primitives, arrays, null, unknown kinds, wrong types, nested objects: `ANSWER_INVALID` (D3-D). Extra keys are dropped (D3-D′, R). |
| Prototype pollution | `Object.prototype` untouched; `__proto__` / `constructor` / `prototype` field keys refused; an own `__proto__` answer id never re-prototypes the stored map (D3-N, N′, N″, N‴). **Finding D3-P (§3.1) is closed.** |
| Forged grading fields (score, correct, checks) | Never stored on legacy answers (rebuilt); the specialized binders were already rebuilding. The grader never reads them. |
| SmartSim / Runner forgery, hidden tests, teacher metadata | Unchanged authorities (replay, signed callbacks, sanitizer). 20G.1 does not touch them, and the 20G security suites pass unchanged. |
| Cross-student / cross-role | Unchanged; the ingest path only touches the caller's own submission. |
| Stale / concurrent submissions | Unchanged guards; the stale-attempt suite passes with realistic fixtures. Normalization happens before the lock, exactly as before. |
| Logs | The normalizer logs nothing; the endpoint's failure log carries no answer content (unchanged). |

## 13. Mutation campaign

See §13.1. The suites per mutant were:
- `answer-ingest-hardening-20g1`;
- the 20D compound freeze;
- composite hardening and review-fix;
- `coding-17a`;
- `student-submission`.

Each mutant was planted one at a time with SHA-256-verified byte restore, and no other test ran concurrently.

**Process note:** a first campaign run was **stopped deliberately** after 10 mutants, when self-review found the composite-code issue fixed in `3dbc68e`. Stopping killed the runner before its `finally` restore, which left mutant N11 planted in `draft-answers.js`. It was restored with `git checkout`, and its blob hash was verified equal to `HEAD` (`31f99750…`). Nothing was committed while it was planted. The partial results of that run (N06 and N08 survived) were analysed and drove test D3-S. The full campaign below was re-run on the final code.

### 13.1 Results — 38 mutants, **38 KILLED**, 0 SURVIVED, 0 TIMEOUT, 0 EQUIVALENT, 0 INVALID

Full campaign on `25bb4d9`; the 2 survivors were re-run on `0042a6c` after strengthening. Every run restored its file byte for byte, verified by hash. Afterwards `git status` showed only the then-uncommitted design record, never a source file.

| Id | File | Planted defect | Result | Killed by |
|---|---|---|---|---|
| N01 | `lib/draft-answers.js` | remove the top-level unknown-id backstop | **KILLED** | `answer-ingest-hardening-20g1.test.js` D3-A' |
| N02 | `lib/draft-answers.js` | invert the unknown-id check | **KILLED** | `answer-ingest-hardening-20g1.test.js` D3-A |
| N03 | `lib/draft-answers.js` | bypass bound mode when the index is empty (the 20G proposal's guard) | **KILLED** | `answer-ingest-hardening-20g1.test.js` D3-A' |
| N04 | `lib/draft-answers.js` | allow the first unknown id | **KILLED** | `answer-ingest-hardening-20g1.test.js` D3-A' |
| N05 | `lib/draft-answers.js` | legacy fallback validates before knowing the id is unknown | **KILLED** | `answer-ingest-hardening-20g1.test.js` D3-B |
| N06 | `lib/draft-answers.js` | compound branch without its unknown-question check | **KILLED** | `answer-ingest-hardening-20g1.test.js` D3-S |
| N07 | `lib/draft-answers.js` | skip legacy validation when bound (historical pass-through) | **KILLED** | `answer-ingest-hardening-20g1.test.js` 20G.1 D3 — malformed and oversize legacy answers fail closed; boundary-valid ones are kept  |
| N08 | `lib/draft-answers.js` | allow arrays at the legacy entry | **KILLED** | `answer-ingest-hardening-20g1.test.js` D3-N''' (first run on `25bb4d9`: SURVIVED; killed after strengthening, §13.2) |
| N09 | `lib/draft-answers.js` | fields values may be an array | **KILLED** | `answer-ingest-hardening-20g1.test.js` 20G.1 D3 — malformed and oversize legacy answers fail closed; boundary-valid ones are kept  |
| N10 | `lib/draft-answers.js` | remove the legacy byte bound | **KILLED** | `answer-ingest-hardening-20g1.test.js` 20G.1 D3 — malformed and oversize legacy answers fail closed; boundary-valid ones are kept  |
| N11 | `lib/draft-answers.js` | off-by-one at the byte bound | **KILLED** | `answer-ingest-hardening-20g1.test.js` 20G.1 D3 — malformed and oversize legacy answers fail closed; boundary-valid ones are kept  |
| N12 | `lib/draft-answers.js` | bound + 1 | **KILLED** | `answer-ingest-hardening-20g1.test.js` 20G.1 D3 — malformed and oversize legacy answers fail closed; boundary-valid ones are kept  |
| N13 | `lib/draft-answers.js` | bound - 1 | **KILLED** | `answer-ingest-hardening-20g1.test.js` 20G.1 D3 — malformed and oversize legacy answers fail closed; boundary-valid ones are kept  |
| N14 | `lib/draft-answers.js` | generic unknown-id refusal BEFORE the specialized binders | **KILLED** | `answer-ingest-hardening-20g1.test.js` D3-H |
| N15 | `lib/draft-answers.js` | trust nested part ids as top-level answer ids | **KILLED** | `answer-ingest-hardening-20g1.test.js` D3-A'' |
| N16 | `lib/draft-answers.js` | store a rejected compound part | **KILLED** | `answer-ingest-hardening-20g1.test.js` 20G.1 D3 — malformed and oversize legacy answers fail closed; boundary-valid ones are kept  |
| N17 | `lib/draft-answers.js` | store the raw legacy input instead of the rebuilt answer | **KILLED** | `answer-ingest-hardening-20g1.test.js` 20G.1 D3 — malformed and oversize legacy answers fail closed; boundary-valid ones are kept  |
| N18 | `lib/draft-answers.js` | forbidden (prototype) field keys accepted | **KILLED** | `answer-ingest-hardening-20g1.test.js` D3-N''' (first run on `25bb4d9`: SURVIVED; killed after strengthening, §13.2) |
| N19 | `lib/draft-answers.js` | plain assignment (a __proto__ id re-prototypes the map) | **KILLED** | `answer-ingest-hardening-20g1.test.js` D3-N'' |
| N20 | `functions/student-submission.js` | submit path unbound (no validation on submit) | **KILLED** | `answer-ingest-hardening-20g1.test.js` 20G.1 D3 — end to end through the real handlers (draft, restore, submit, review) — draft an |
| N21 | `functions/student-submission.js` | saveDraft path unbound (no validation on draft) | **KILLED** | `coding-17a.test.js` the REAL handler bi |
| N22 | `functions/student-submission.js` | pauseAttempt path unbound | **KILLED** | `coding-17a.test.js` the REAL handler bi |
| N23 | `lib/draft-answers.js` | a null snapshot treated as unbound (pass-through) | **KILLED** | `answer-ingest-hardening-20g1.test.js` D3-C' |
| N24 | `lib/draft-answers.js` | choice index 0 refused | **KILLED** | `answer-ingest-hardening-20g1.test.js` D3-A |
| N25 | `lib/draft-answers.js` | sparse sequence (null cell) refused | **KILLED** | `answer-ingest-hardening-20g1.test.js` 20G.1 D3 — malformed and oversize legacy answers fail closed; boundary-valid ones are kept  |
| N26 | `lib/draft-answers.js` | boolean table / field values refused | **KILLED** | `answer-ingest-hardening-20g1.test.js` D3-G' |
| N27 | `lib/draft-answers.js` | string-array field values refused | **KILLED** | `answer-ingest-hardening-20g1.test.js` D3-G'' |
| N28 | `lib/draft-answers.js` | numeric unit type unchecked | **KILLED** | `answer-ingest-hardening-20g1.test.js` 20G.1 D3 — malformed and oversize legacy answers fail closed; boundary-valid ones are kept  |
| N29 | `lib/draft-answers.js` | unknown compound part ids accepted | **KILLED** | `answer-ingest-hardening-20g1.test.js` D3-H' |
| N30 | `lib/draft-answers.js` | compound container not rebuilt (extra keys stored) | **KILLED** | `answer-ingest-hardening-20g1.test.js` D3-H' |
| N31 | `lib/draft-answers.js` | multiChoice option ids unchecked | **KILLED** | `answer-ingest-hardening-20g1.test.js` 20G.1 D3 — malformed and oversize legacy answers fail closed; boundary-valid ones are kept  |
| N32 | `lib/draft-answers.js` | text value type unchecked | **KILLED** | `answer-ingest-hardening-20g1.test.js` 20G.1 D3 — malformed and oversize legacy answers fail closed; boundary-valid ones are kept  |
| N33 | `lib/draft-answers.js` | unknown answer kinds passed through | **KILLED** | `answer-ingest-hardening-20g1.test.js` 20G.1 D3 — malformed and oversize legacy answers fail closed; boundary-valid ones are kept  |
| N34 | `lib/draft-answers.js` | compound parts not validated / bounded | **KILLED** | `answer-ingest-hardening-20g1.test.js` 20G.1 D3 — malformed and oversize legacy answers fail closed; boundary-valid ones are kept  |
| N35 | `lib/draft-answers.js` | store the raw top-level input instead of the bound result | **KILLED** | `answer-ingest-hardening-20g1.test.js` D3-O |
| N36 | `lib/draft-answers.js` | compound answer accepted on a non-compound question | **KILLED** | `answer-ingest-hardening-20g1.test.js` D3-H'' |
| N37 | `lib/draft-answers.js` | composite child legacy refusal reported with the generic code | **KILLED** | `answer-ingest-hardening-20g1.test.js` D3-H'' |
| N38 | `lib/draft-answers.js` | nested compound in a composite child reported with the compound code | **KILLED** | `answer-ingest-hardening-20g1.test.js` D3-H'' |

### 13.2 Survivors (first run) and how they were closed

- **N18 (forbidden field keys accepted)** was a weak test, not an equivalent mutant. D3-N's `__proto__` field carried an **object** value, which the value-type check already refuses, so the key check was never what refused it. D3-N‴ now sends `__proto__` / `constructor` / `prototype` with a well-typed **string** value. KILLED.
- **N08 (arrays allowed at the legacy entry)** is unreachable over JSON, because a JSON array cannot carry a `kind` string. The legacy kind check therefore refuses it anyway, and the rebuilt output would be a plain contract object regardless. Rather than claim equivalence, D3-N‴ constructs an array carrying `kind` in-process. KILLED.
- From the stopped first run (§13), **N06** (compound branch without its unknown-question check) survived. Since `3dbc68e` the mutant would answer `COMPOUND_QUESTION_MISMATCH` instead of `ANSWER_QUESTION_UNKNOWN`. D3-S pins the exact single refusal, and N06 is KILLED in the full run.

## 14. Bundle

This phase is server-only: no `src/` production module changed (the only `src/` change is the F-7 pin in a test). `npm run build` on `0042a6c` gave **initial JS graph 18 files, 124.2 KB gzip (budget 125 KB)**, identical to the 20G head. The bundle guard passed, and the budget is **not** changed.

## 15. Local validation

Run sequentially on `0042a6c` with **no `dist/` present** during the tests. The commit after it adds only this design record.

| Check | Result |
|---|---|
| `npx vitest run` (root: app + API + scripts, including the shared-finalization drift test) | **779 files, 10261 / 10261 passed** |
| Focused: 20G.1 + 20D compound freeze + every 20G certification suite + the a11y and D4 suites + drift | **20 files, 242 / 242** |
| `npm run lint` | exit 0 |
| `npx tsc -b --force` | exit 0 |
| `npm run build` + bundle guard | exit 0; 124.2 KB / 125 KB |
| `git diff --check` | clean |
| `npm --prefix runner test` (isolated, last) | **407 / 407** (`runner/` untouched) |

## 16. Exact-head CI, independent review, limitations, verdict

Exact-head CI, the independent review history, the final verdict and the head-specific counts are in the PR body and the final report. **Known limitations:**
- per-answer refusal reporting to the client (future work);
- no request-body size limit at the HTTP layer beyond the platform default (the stored state is bounded);
- the falsy-id flat-exam edge case (§11);
- no migration of pre-20G.1 stored data.
