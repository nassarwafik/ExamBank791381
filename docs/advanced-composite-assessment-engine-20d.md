# Phase 20D — Advanced Composite Assessment Engine (`composite@1`)

Status: implemented on `feature/20d-advanced-composite-assessment-engine` (baseline `caac213`, the merge of #267). Owner review required
before merge.

## 1. Purpose

Real exams compose several modern items around shared material: one reading passage serving MCQ / matching / cloze / an essay; one physics
simulation serving five measured parts and an interpretation; one code listing serving a trace question, a programming task and an
explanation; one network topology serving several configuration criteria. Phase 20D delivers this as a **new production question family**,
`composite@1`, built on the existing type engines — never a second grader, renderer, sanitizer or validator per child type.

## 2. Why a new family (and not `compound@1`)

Legacy `compound` is detected **structurally** everywhere (`isCompound(q) = q.parts.length > 0`): student rendering, grading, structural
marks, first-N part units, draft binding, the sanitizer and the builder. Teaching `compound` new behaviour would reinterpret published exams.
Therefore:

* `compound@1` is **frozen** (byte- and behaviour-compatible). `src/compoundFreeze.20d.test.tsx` pins, with SHA-256 digests captured on
  `caac213`: the catalog row and child-type list, part-mark distribution and `questionMaxMarks` (client / builder / server), official grading
  of mixed legacy + Wave-1 parts (manual-review marks, first-N part and question units, capScore), matching canonical keys, answered-ness,
  first-N selection parity, sanitizer output, draft normalization, structural validation, JSON import / canonical save, the student DOM
  (incl. lazy Wave-1 children and excess hints), answer behaviour and the authoring editor DOM.
* `composite@1` stores its children under the **type-owned root** `question.composite` and never under `parts`, so no structural compound
  path can see it. The catalog grows from **24 to 25**; the `composite` row sits right after `compound` (category `composite`, grading mode
  `composed`, capabilities auto / manual / hybrid / partial / interactive / offline; **not** a compound part).

## 3. Canonical schema (strict, data only)

```
question  = { examQuestionId, presentationType: "composite", questionTypeVersion: 1, text, marks, composite,
              displayNumber?, assessmentMeta?, groupId?, activity?, codeStimulus?, image?, images? }      // answer absent or {}
composite = { v: 1, contexts: Context[], groups: Group[] }
Context   = { id, version: 1, kind: "source",   title?, instructions?, sources: SourceStimulusV1[1..8] }
          | { id, version: 1, kind: "smartSim", title?, instructions?, smartSim: SmartSimEnvelopeV1 }
Group     = { id, title?, instructions?, gradingPolicy: "all" | "firstNAnswered", requiredAnswers, maxMarks, parts: Part[] }
Part      = { id, label?, type, questionTypeVersion?, text?, marks, contextId?, answer?, image?, images?, assessmentMeta?,
              <ONLY the type-owned config keys of its own type> }
Answer    = { kind: "composite", parts: { [partId]: <the child's own Answer> }, contexts: { [contextId]: SmartSimAnswer } }
```

* **Exact keys at every level**; an unknown key (`script`, `grader`, legacy `parts` …) or another type's config key on a child
  (`COMPOSITE_CHILD_CONFIG_FOREIGN`) blocks finalization and withholds the student projection.
* **Ids**: groups, parts and contexts share ONE namespace, `/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/`, prototype-sensitive names refused,
  no `.` / `:` (keeps the child key unambiguous). The composite's own id must match `/^[A-Za-z0-9._:-]{1,80}$/` and never contain
  `::part::`; in an exam containing a composite, no other question id may contain `::part::` (`COMPOSITE_TARGET_KEY_AMBIGUOUS`).
  Both rules apply to the EFFECTIVE runtime id — `examQuestionId ?? id ?? "<section>::qN"`, the mirror of the server's
  `sectionQuestionId` that keys answers, grades, overrides and coding targets — not to `examQuestionId` alone (Review Fix 1).
* **Child vocabulary** (code-owned, exact identities): `multipleChoice, trueFalse, multiTrueFalse, shortAnswer, fillBlank, wordBank,
  matching, ordering, tableFill, cliFill, multipleSelect, numericResponse, matrix, categorization, simulation, networkCli, inlineCloze,
  parametricNumeric, hotspot, labelDiagram, openResponse, smartSim` at `@1` and `coding@1/@2/@3`. `compound` and `composite` are refused
  (`COMPOSITE_CHILD_TYPE_REFUSED`); an unknown type, a case variant or an unsupported version (`inlineCloze@2`, `coding@4`) is
  `COMPOSITE_CHILD_TYPE_UNSUPPORTED`. Absent `questionTypeVersion` is the family's canonical V1 (catalog authority); never "latest".
* **No repair**: a malformed published composite is never upgraded, coerced or partially accepted.

Authorities: `src/compositeModel.ts` (light — ids, child key, bounds, group / mark semantics, first-N, copy) and
`src/compositeQuestion.ts` (strict structure validator + finalization rules), both in `SHARED_ENTRIES` (server copies generated, drift-guarded).
The light module is the only one reachable from the student initial graph (structural marks); the strict one stays lazy (bundle guard).

## 4. Groups, first-N and marks

| Policy | Rule | Official group maximum |
|---|---|---|
| `all` | every part counts; `requiredAnswers` / `maxMarks` must be null | Σ part marks |
| `firstNAnswered` | integer `requiredAnswers` in 1..parts; **all parts carry equal marks m**; `maxMarks === requiredAnswers × m`; shared-context SmartSim parts prohibited | `maxMarks` |

* Part marks are finite and > 0. `question.marks` must equal Σ official group maxima (`COMPOSITE_MARKS_MISMATCH` blocks; the editor shows a
  warning and an explicit «use the official total» button — marks are never rewritten silently).
* `questionMaxMarks(composite)` is **answer-independent** (`compositeQuestionMaxMarks`, ONE shared function for client, builder, server,
  cover and assignment totals); a structurally invalid composite contributes its stored marks (never a guessed total).
* First-N selection (`selectCompositeCountedParts`, mirrored through the shared build): answered parts in display order fill the N slots;
  answered parts beyond N are **ignored** (kept, score 0, countedMaxMarks 0, never pending review, never a coding job, never an override
  target); unanswered parts fill no slot.
* **Policy A (documented decision)**: a SmartSim part scored on a SHARED context has no answer of its own, so "answered" would be ambiguous;
  such parts are refused in `firstNAnswered` groups (`COMPOSITE_FIRSTN_SHARED_SMARTSIM`).
* A composite inside a `firstNAnswered` question-unit SECTION counts as one unit; an excess composite is ignored whole (its parts carry
  no counted marks either). In a part-unit section a composite is one unit (part units remain a compound@1 concept).

## 5. Shared contexts

* **Static sources** reuse the Phase 19G `SourceStimulusV1` contract and validator unchanged (text / image / table / code; code via the
  read-only code-stimulus contract; images via the canonical asset rules and bank hydration). A source context renders ONCE and serves
  every part that links it (`contextId`, presentation only).
* **Shared SmartSim context** = ONE public envelope (`validateSmartSimEnvelope`, exact plugin identity) + ONE student action stream stored at
  `answer.contexts[contextId]`. The workspace renders ONCE. A SmartSim part **linked** to it carries no envelope of its own, only its
  PRIVATE checks (`answer: { scoring?, checks }`), validated against the context's plugin and canonical config; each linked part has its
  own checks and marks. An **independent** SmartSim part carries its own envelope and answer (standalone semantics).

### SmartSim core seam (additive)

`prepareSmartSimEvaluation({ envelope, response })` validates the envelope and normalizes + **replays the actions once**; the prepared
object is frozen and branded (module-private WeakMap) — a copied, deserialized or forged object is refused (fail closed).
`evaluatePreparedSmartSimChecks(prepared, { answerKey, maxMarks })` validates ONE private key against the prepared envelope and scores it
on the prepared server-derived state; `describePreparedSmartSim` gives the teacher review state + plugin details once.
`evaluateSmartSim` is now exactly prepare + evaluate — its output is byte-identical for every branch (pinned). The response's
`state`, score or check results are never read.

## 6. Grading model (server, `api/src/lib/assignment-grading.js`)

`gradeQuestion` decides the composite family by TYPE first (a composite carrying a legacy `parts` array is a broken authority, never graded
as a compound). `gradeComposite`:

1. re-validates the strict structure — a broken authority fails CLOSED as a whole (0, manual review, the structural maximum);
2. replays each shared SmartSim context ONCE (lazily, only if a counted linked part needs it) and evaluates every linked part's own checks;
3. grades every other counted child through `gradeQuestion(childNode, childAnswer, { generation, questionKey: <childKey> })` — the SAME
   registered / legacy grader a standalone question of its type uses (an unsupported child version fails closed for that part only);
4. aggregates: `score = Σ_groups min(Σ counted part scores, group max)`, `maxMarks` = official maximum, `manualReviewMarks` = the exact
   counted marks still awaiting review, `correct` only when every counted part is fully correct and nothing is pending.

Each part result carries `{ partId, groupId, label, type, score, maxMarks, countedMaxMarks, correct, manualReview, ignored, counted, parts? }`;
the question grade carries `composite: { v: 1, groups: [{ id, gradingPolicy, maxMarks, partIds }] }` so the canonical rebuild can recompute
the parent from its parts. Section policies outside the composite are unchanged.

## 7. Child identities — ONE key for coding, review and parametric

`childKey = <questionId>::part::<partId>` (≤ 128 chars, the coding `SAFE_ID` charset, `parseCompositeChildKey` splits at the LAST separator):

* **Parametric**: the server-owned generation key of a parametric child — delivery projection, official grading and teacher review all
  regenerate the same instance from `{ assignmentId, studentId, attemptNumber, questionKey: childKey }`; different parts / attempts get
  different instances; standalone parametric questions keep `questionKey = questionId` (pinned). No client value is ever an identity.
* **Manual review**: `attempt.manualOverrides[childKey] = { score, comment, reviewedAt, rubric? }`.
* **Coding**: the target key of a coding child (§8).

## 8. Official coding grading of composite children

The existing lifecycle (plan in the attempt CAS → durable target → leased signed dispatch → HMAC callback → server scoring → canonical
rebuild → recovery sweep / bulk retry / teacher retry & force regrade → teacher evidence → student aggregate status) is reused through ONE
resolver, `resolveCodingTarget(exam, attempt, key)`:

* a top-level key resolves **first and exactly as before** — top-level job ids, target refs, question fingerprints, answer hashes and
  grading keys are byte-identical (`api/tests/composite-coding-20d.test.js` pins coding@1 / coding@2 values captured on `caac213`);
* a child key resolves only to a coding child of a VALID composite parent: the child node (its own marks), the PART grade (a live reference
  — the callback mutates the part, the canonical rebuild recomputes the parent and the attempt) and `answers[parent].parts[part]`;
* a key resolving both ways is ambiguous and fails closed; planning never creates a child key equal to a top-level id;
* only a child's fingerprint gains `target: { kind: "compositePart", questionId, partId }`;
* an excess / unanswered first-N child or an ignored composite is never planned; an unanswered counted child completes as "no-answer" (0);
* the Runner protocol is unchanged (`jobId`, language, source, case tokens + stdin, limits, revision, opaque `targetRef`); `runner/**`
  untouched;
* overrides: a part override supersedes its child target, and a whole-composite override supersedes it too (`overrideScoreOf`);
* practice runs (`/api/coding/run`) resolve the child key the composite renderer passes as the child's id.

Proven end to end: dispatch payload contents, callback → part score → parent → attempt, duplicate callback idempotent, superseded revision
refused (409 `STALE_RESULT`), Runner busy ⇒ retryable + manual review (never a zero) + sweep re-dispatch, coding@2 compile error ⇒
`reviewRequired`, teacher part override authoritative before and after the callback, child evidence under its child key.

## 9. Manual review and rubric

`POST /api/assignment-review` (`saveReview`) accepts child keys next to question ids:

* a top-level id keeps the original path byte-for-byte (a whole-composite override still wins over its parts);
* a child key binds ONLY to a real part of a real composite grade of this attempt (`COMPOSITE_PART_UNKNOWN`), and only while that part is
  COUNTED (`COMPOSITE_PART_IGNORED` — an override can never resurrect an excess first-N part);
* an open-response child is graded ONLY through ITS published rubric: `rubricAwards` are bound to that child's rubric and the server
  computes the score (`RUBRIC_GRADE_REQUIRED` for a score-only save; malformed / forged awards rejected); nothing is written on any refusal;
* the canonical rebuild (`attempt-grade-rebuild.js`) recomputes a composite from its parts (part override clamped to the part's counted
  max), then the attempt total; pending marks are exact per part.

The review GET adds `composite` (teacher root) and `compositeReview` (contexts once — a SmartSim context's derived state + plugin details
ONCE; parts with child key, child node, student answer, expected answer, part grade, override, and type evidence: linked SmartSim check
facts only, independent SmartSim full review, rubric review, official parametric instance, coding@3 reconstruction, coding evidence).

## 10. Student projection (sanitizer)

`applyCompositeProjection` REBUILDS `composite` after the generic deep strip: the strict structure is validated first (any violation ⇒
`{ v: 1, status: "unavailable" }`, never a partial composite); source contexts → canonical sources; SmartSim contexts → canonical public
envelope; each child → `sanitizeQuestionForStudent(childNode, childKey identity)` (the SAME per-type projection a standalone question gets:
coding allow-list, open-response public rubric, inline-cloze / visual strict configs, SmartSim envelope, parametric per-attempt instance)
then the private key and blank teacher fields are removed structurally; linked SmartSim parts expose identity, text and marks only.
`sanitizePartForStudent` (compound parts) is unchanged. Leakage is tested with canaries on every fixture (keys, checks, hidden tests,
reference solutions, rubric guidance, model answers, expressions, teacher metadata).

## 11. Answer binding, autosave, restore, reset

`normalizeDraftAnswers` (draft, pause, submit) binds a composite answer to the published composite: exactly `{ kind, parts, contexts }`;
≤ 1 MB serialized and ≤ 3000 shared-context actions; unknown part / context ids removed and reported; each child bound by the SAME binder a
standalone question of its type uses (the original chain was extracted verbatim into `bindAnswer`, refusal codes unchanged); a linked
SmartSim part never carries an answer; each context answer is replayed against its envelope and stored with the derived state. Autosave /
restore use the existing draft pipeline; the student renderer resets one part, one shared context or the whole composite without touching
the other answers.

## 12. Authoring, copy, import / export

* Lazy enterprise editor (`src/questionTypes/editors/CompositeEditor.tsx`): groups, parts, contexts, policies, marks summary and mismatch,
  child type / exact version, links, SmartSim context config and linked-part checks through the plugin's own editor (config stays on the
  context), every other child body through the existing `QuestionBodyEditor`.
* Copy / duplicate (`cloneQuestionWithNewIds`, `duplicateQuestion`, `structuredExamCopy`): fresh group / part / context ids, part →
  context references remapped, versions and keys preserved (`cloneCompositeWithNewIds`).
* JSON import keeps a composite byte-for-byte (fresh exam id only) and judges it with the strict authority (blocked, never repaired);
  canonical save keeps it; bank media inside composites (child images, image sources) is hydrated / normalized like top-level media.
* AI: composite is neither an AI intent nor an AI-generated type and the AI node verifier refuses it (groundwork only; nothing certifies AI
  authoring of composites in this phase). The safe-repair and AI-proposal paths never target a composite.

## 13. Bounds and DoS

Groups ≤ 12, parts ≤ 40, contexts ≤ 8 (SmartSim ≤ 3, source ≤ 6), sources ≤ 8 per context, coding children ≤ 4, titles ≤ 200,
instructions ≤ 4000, labels ≤ 40, part text ≤ 20 000 chars, composite root ≤ 1 MB (image data URLs excluded; media keep their own bounds),
answer ≤ 1 MB and ≤ 3000 shared-context actions, plus every plugin / child limit (e.g. networkTopology@2 per-device command caps). Profile of
the worst realistic composite (40 parts, 3 shared SmartSim contexts, 2100 actions): finalization 23 ms, binding + replay 334 ms, official
grading 93 ms (one replay per context for 39 linked parts), student projection 4 ms. No `eval`, `Function`, dynamic module loading, external
URL or HTML execution anywhere in the composite authorities; uploaded `simulation@1` children stay sandboxed and manual-only.

## 14. Acceptance fixtures

`src/composite/compositeFixtures.ts` (code) and `docs/fixtures/composite-20d/{arabic,physics,cs,network}.json` (importable, kept identical by
a test):

* **A — Arabic** (20 marks): one shared passage; group أ (MCQ, multiTrueFalse, matching, inlineCloze), group ب `firstNAnswered` 2 of 3
  (categorization, matrix, numeric), group ج (rubric open response).
* **B — Physics** (18): ONE `physicsFreeFall@1` workspace serving impact time / impact speed / height at t / velocity at t / point on
  trajectory, plus numericResponse and a rubric interpretation.
* **C — Computer science** (18): shared code source, MCQ trace, predict-the-output short answer, coding@2 hidden-test child (official Runner
  lifecycle), rubric explanation.
* **D — Network** (14): ONE `networkTopology@2` Router-on-a-Stick context serving VLAN / trunk / sub-interface / reachability parts + MCQ.

Each is proven end to end through the real handlers (delivery, autosave, submit, automatic grading, per-part review / rubric, finalization).

## 15. Known limitations (v1)

* No recursive groups, no nested composite / compound; one level of groups.
* Shared-context SmartSim parts cannot sit in `firstNAnswered` groups (policy A).
* `firstNAnswered` groups require equal part marks (unambiguous maxima).
* Part-unit sections treat a composite as one unit.
* AI authoring of composites is not offered.
* A coding child's practice run uses the same rate limits as a standalone coding question.

## 16. Independent review and Review Fix 1

An independent internal reviewer (fresh context, read-only worktree at `127c0b2`, node probes) returned **BLOCKERS**:

| Finding | Severity | Defect | Fix (commit `2110868`) |
|---|---|---|---|
| F2 | BLOCKER | the `::part::` reservation looked only at `examQuestionId`; a top-level question whose `id` equals a child key passed finalization and its legacy override graded the composite part | rules on the effective id; the rebuild and the review never read a key that is also a top-level question id as a part override (the part stays as graded / pending) |
| F1 | MAJOR (treated as blocker) | the composite answered predicate threw on malformed, student-controlled nested answers (`{kind:"text"}` without a value …) — submit / end-attempt 500 and a stuck attempt, also for a forged composite answer on a NON-composite question | the shared predicate is total; a composite child answer must be a well-formed single-question Answer kind (malformed, nested compound / composite, unknown kinds refused per child, `COMPOSITE_CHILD_ANSWER_INVALID`); a composite answer on a non-composite question is refused when bound (`COMPOSITE_QUESTION_MISMATCH`) |
| F3 | MINOR | a composite whose effective id is unsafe passed finalization (child keys never parseable; failed safe) | `COMPOSITE_QUESTION_ID_INVALID` on the effective id |
| N1 | NOTE | the 1 MB bound exempted every `data:` string | only image `dataUrl` payloads are exempt |
| N2–N4 | NOTE | plugin purity of the shared replay state; rebuild pending-mark parity; nested compound / composite child answers | N2/N3 documented below (parity with top-level questions); N4 covered by the F1 fix |

**Fail-first:** `api/tests/composite-review-fix-20d.test.js` executed against `127c0b2` (the reviewed head, in a detached worktree):
**9 failed / 1 passed** (the passing case is the guard "a safe effective `id` is accepted"); failing assertions include
`expected [] to include 'COMPOSITE_TARGET_KEY_AMBIGUOUS'`, `expected [] to include 'COMPOSITE_QUESTION_ID_INVALID'`,
`expected { partId: 'pC1', … } to match object { score: 0, manualReview: true }` and
`TypeError: Cannot read properties of undefined (reading 'trim')`. On the fix commit: **10 / 10 passed**.

Notes kept as documented behaviour: N2 — every SmartSim plugin's `evaluateCheck` / rule view is pure (a plugin contract since 20A); the
prepared state is shared read-only by the linked parts of one context. N3 — after a part override the rebuild counts pending marks the
same way the top-level rebuild does (parity, unchanged).

## 17. Mutation campaign

One mutant at a time (`scratchpad` runner: exact single-occurrence replacement, the focused suites only, SHA-256 verified byte-for-byte
restore in a `finally`, `git status` clean after every round, never concurrent with another test run). Shared-build logic is mutated in
the TypeScript source when the killing suite is a client suite, and in the generated / server JavaScript when it is a server suite.

| Round | Mutants | Killed | Survived | Timeouts |
|---|---|---|---|---|
| 1 (core 108 + UI / compound-compat 37) | 145 | 119 | 26 | 0 |
| broad re-run (wider existing suites for the shared seams) | 8 | 1 | 7 | 0 |
| 2 (after the hardening tests + 9 Review-Fix mutants R001–R009) | 36 | 30 | 6 (4 equivalent) | 0 |
| 3 | 2 | 2 | 0 | 0 |
| **Final** | **154** | **150** | **0 non-equivalent** | **0** |

Every round-1 survivor was a missing assertion, not a product defect; each got a focused test (commits `9505526`, `e14d7df`) that was
proven to kill it. The four EQUIVALENT mutants and their proofs are in the appendix (U013 catalog-owned version resolution; U021 / U023
the server invariant "ignored ⇒ countedMaxMarks 0"; U032 `Math.min(0, …)` adds nothing).

## 18. Validation evidence (head `fdf6b81`)

| Check | Result |
|---|---|
| `npm test` (root: app + API + scripts) | 715 files, **9354 / 9354 passed** |
| 20D suites | freeze 12, model 62, SmartSim 16, server 28, coding 10, acceptance 11, hardening 14, review fix 10, student / editor UI 15 + 7, review UI 5 — **190 / 190** |
| `npm run lint` | 0 errors; no warning in a 20D file (the two on `AssignmentReview.tsx:99` pre-exist on `caac213`) |
| `npx tsc -b` | clean |
| `npm run build` + bundle guard | initial JS graph **123.3 KB gzip (budget 125 KB, unchanged)**; every composite chunk lazy |
| `git diff --check` | clean |

**Fail-first of the phase (on `caac213`):** the five 20D feature suites ran **47 failed / 6 passed** (the 6 are pins: top-level coding
identities, standalone parametric identity, compound part projection, Runner untouched, structural max parity, rebuild parity); the freeze
pins (12) pass on `caac213` and on the head by construction.

**Timing note:** the first full run on `e14d7df` observed the F-12 compound editor pin digesting while a lazy Wave-1 part editor was still
loading under load; the harness now preloads the four lazy editor modules and asserts nothing is still loading (commit `fdf6b81`); the
pinned digest is unchanged and the updated suite passes on `caac213` and on the head. An earlier full run recorded the documented
timing-sensitive `src/GovernancePanel.14b.test.tsx` (AGENTS.md §12) once; it was not modified.

## Appendix — mutation table

| Id | File | Planted defect | Outcome | Killed by (suite) / equivalence proof |
|---|---|---|---|---|
| M001 | `src/compositeModel.ts` | id charset admits ':' (child-key separator) | KILLED | src/composite/composite.20d.test.ts |
| M002 | `src/compositeModel.ts` | prototype-sensitive id 'constructor' accepted | KILLED | src/composite/composite.20d.test.ts |
| M003 | `src/compositeModel.ts` | duplicate ids accepted | KILLED | src/composite/composite.20d.test.ts |
| M004 | `src/compositeModel.ts` | context count bound removed | KILLED | api/tests/composite-hardening-20d.test.js |
| M005 | `src/compositeModel.ts` | group count bound removed | KILLED | src/composite/composite.20d.test.ts |
| M006 | `src/compositeModel.ts` | SmartSim context bound removed | KILLED | api/tests/composite-hardening-20d.test.js |
| M007 | `src/compositeModel.ts` | source context bound removed | KILLED | api/tests/composite-hardening-20d.test.js |
| M008 | `src/compositeModel.ts` | part count bound removed | KILLED | api/tests/composite-hardening-20d.test.js |
| M009 | `src/compositeModel.ts` | coding children bound removed | KILLED | api/tests/composite-hardening-20d.test.js |
| M010 | `src/compositeModel.ts` | unknown group policy accepted (capScore) | KILLED | src/composite/composite.20d.test.ts |
| M011 | `src/compositeModel.ts` | all-group may carry a cap | KILLED | src/composite/composite.20d.test.ts |
| M012 | `src/compositeModel.ts` | firstN requiredAnswers above parts accepted | KILLED | src/composite/composite.20d.test.ts |
| M013 | `src/compositeModel.ts` | firstN requiredAnswers 0 accepted | KILLED | src/composite/composite.20d.test.ts |
| M014 | `src/compositeModel.ts` | firstN without maxMarks accepted | KILLED | src/composite/composite.20d.test.ts |
| M015 | `src/compositeModel.ts` | firstN unequal part marks accepted | KILLED | src/composite/composite.20d.test.ts |
| M016 | `src/compositeModel.ts` | firstN maxMarks ≠ N×m accepted | KILLED | src/composite/composite.20d.test.ts |
| M017 | `src/compositeModel.ts` | shared-context SmartSim allowed in firstN (policy A dropped) | KILLED | src/composite/composite.20d.test.ts |
| M018 | `src/compositeModel.ts` | question marks ≠ Σ group maxima accepted | KILLED | src/composite/composite.20d.test.ts |
| M019 | `src/compositeModel.ts` | non-positive part marks accepted | KILLED | src/composite/composite.20d.test.ts |
| M020 | `src/compositeModel.ts` | dangling contextId accepted | KILLED | src/composite/composite.20d.test.ts |
| M021 | `src/compositeModel.ts` | SmartSim part may link a source context | KILLED | src/composite/composite.20d.test.ts |
| M022 | `src/compositeModel.ts` | schema v2 accepted (silent upgrade) | KILLED | src/composite/composite.20d.test.ts |
| M023 | `src/compositeModel.ts` | future context version accepted | KILLED | src/composite/composite.20d.test.ts |
| M024 | `src/compositeModel.ts` | first-N counts beyond the quota | KILLED | src/composite/composite.20d.test.ts |
| M025 | `src/compositeModel.ts` | first-N excess part not marked ignored | KILLED | src/composite/composite.20d.test.ts |
| M026 | `src/compositeModel.ts` | answered-ness ignores shared contexts | KILLED | src/composite/composite.20d.test.ts |
| M027 | `src/compositeModel.ts` | child key parser accepts an invalid part id | KILLED | src/composite/composite.20d.test.ts |
| M028 | `src/compositeModel.ts` | malformed composite contributes 0 marks (guessed total) | KILLED | src/composite/composite.20d.test.ts |
| M029 | `src/compositeModel.ts` | copy keeps the original part ids | KILLED | src/composite/composite.20d.test.ts |
| M030 | `src/compositeModel.ts` | copy leaves contextId references stale | KILLED | src/composite/composite.20d.test.ts |
| M031 | `src/compositeModel.ts` | composite question id may contain the child separator | KILLED | src/composite/composite.20d.test.ts |
| M040 | `src/compositeQuestion.ts` | unknown root key accepted | KILLED | src/composite/composite.20d.test.ts |
| M041 | `src/compositeQuestion.ts` | unknown group key accepted | KILLED | src/composite/composite.20d.test.ts |
| M042 | `src/compositeQuestion.ts` | unknown part key accepted | KILLED | src/composite/composite.20d.test.ts |
| M043 | `src/compositeQuestion.ts` | foreign type config accepted on a child | KILLED | src/composite/composite.20d.test.ts |
| M044 | `src/compositeQuestion.ts` | nested compound / composite children accepted | KILLED | src/composite/composite.20d.test.ts |
| M045 | `src/compositeQuestion.ts` | child version ignored (coding@4 supported) | KILLED | src/composite/composite.20d.test.ts |
| M046 | `src/compositeQuestion.ts` | linked SmartSim part may carry its own envelope | KILLED | src/composite/composite.20d.test.ts |
| M047 | `src/compositeQuestion.ts` | SmartSim part needs neither context nor envelope | KILLED | src/composite/composite.20d.test.ts |
| M048 | `src/compositeQuestion.ts` | malformed source silently dropped (not blocking) | KILLED | src/composite/composite.20d.test.ts |
| M049 | `src/compositeQuestion.ts` | invalid shared SmartSim envelope accepted | KILLED | src/composite/composite.20d.test.ts |
| M050 | `src/compositeQuestion.ts` | 1 MB root bound removed | KILLED | api/tests/composite-hardening-20d.test.js |
| M051 | `src/compositeQuestion.ts` | unknown question-level key accepted | KILLED | api/tests/composite-hardening-20d.test.js |
| M052 | `src/compositeQuestion.ts` | unsafe composite question id accepted | KILLED | src/composite/composite.20d.test.ts |
| M053 | `src/compositeQuestion.ts` | question-level answer key accepted | KILLED | src/composite/composite.20d.test.ts |
| M054 | `src/compositeQuestion.ts` | unsupported child identity not reported | KILLED | src/composite/composite.20d.test.ts |
| M055 | `src/compositeQuestion.ts` | linked part checks not validated against the context | KILLED | src/composite/composite.20d.test.ts |
| M056 | `src/compositeQuestion.ts` | legacy parts on a composite accepted | KILLED | src/composite/composite.20d.test.ts |
| M057 | `src/compositeQuestion.ts` | unknown child type accepted at the structure level | KILLED | src/composite/composite.20d.test.ts |
| M060 | `src/examQuality.ts` | child bodies not validated by their own type validator | KILLED | src/composite/composite.20d.test.ts |
| M061 | `src/examQuality.ts` | target-key ambiguity guard disabled | KILLED | src/composite/composite.20d.test.ts |
| M062 | `src/examQuality.ts` | composite dispatched to the generic body validator | KILLED | src/composite/composite.20d.test.ts |
| M063 | `src/answerState.ts` | composite answered ignores contexts | KILLED | src/composite/composite.20d.test.ts |
| M064 | `src/questionTypeCatalog.ts` | composite becomes a compound part (nesting) | KILLED | src/composite/composite.20d.test.ts |
| M065 | `src/examBuilderState.ts` | copy does not remap composite internals | KILLED | src/composite/composite.20d.test.ts |
| M070 | `src/trustedSimQuestion.ts` | prepared object not frozen | KILLED | src/composite/compositeSmartSim.20d.test.ts |
| M071 | `src/trustedSimQuestion.ts` | part key validated without the shared config | KILLED | src/composite/compositeSmartSim.20d.test.ts |
| M072 | `src/trustedSimQuestion.ts` | plugin identity of the response not checked | KILLED | src/trustedSimCrossDomain.20a1.test.ts |
| M073 | `src/trustedSimQuestion.ts` | replay failure graded as valid state | KILLED | src/composite/compositeSmartSim.20d.test.ts |
| M080 | `api/src/lib/assignment-grading.js` | composite dispatched after compound detection (a composite with parts grades as compound) | KILLED | api/tests/composite-hardening-20d.test.js |
| M081 | `api/src/lib/assignment-grading.js` | shared context replayed for every linked part | KILLED | api/tests/composite-20d.test.js |
| M082 | `api/src/lib/assignment-grading.js` | linked part evaluated without its own private checks | KILLED | api/tests/composite-20d.test.js |
| M083 | `api/src/lib/assignment-grading.js` | ignored first-N parts graded | KILLED | api/tests/composite-20d.test.js |
| M084 | `api/src/lib/assignment-grading.js` | pending marks not counted for manual-review children | KILLED | api/tests/composite-20d.test.js |
| M085 | `api/src/lib/assignment-grading.js` | child parametric identity = parent question key | KILLED | api/tests/composite-20d.test.js |
| M086 | `api/src/lib/assignment-grading.js` | excess composite in a firstN section keeps part marks | KILLED | api/tests/composite-20d.test.js |
| M087 | `api/src/lib/assignment-grading.js` | composite descriptor not stored on the grade | KILLED | api/tests/composite-20d.test.js |
| M088 | `api/src/lib/assignment-grading.js` | broken composite authority graded instead of failing closed | KILLED | api/tests/composite-20d.test.js |
| M089 | `api/src/lib/assignment-grading.js` | child score not clamped to its marks | KILLED | api/tests/composite-20d.test.js |
| M090 | `api/src/lib/attempt-grade-rebuild.js` | per-part overrides ignored | KILLED | api/tests/composite-20d.test.js |
| M091 | `api/src/lib/attempt-grade-rebuild.js` | part override clamped to full (not counted) max | KILLED | api/tests/composite-hardening-20d.test.js |
| M092 | `api/src/lib/attempt-grade-rebuild.js` | whole-question override no longer wins over parts | KILLED | api/tests/composite-20d.test.js |
| M093 | `api/src/lib/attempt-grade-rebuild.js` | pending marks of composite parts dropped | KILLED | api/tests/composite-20d.test.js |
| M094 | `api/src/lib/attempt-grade-rebuild.js` | uncounted parts contribute to the parent | KILLED | api/tests/composite-hardening-20d.test.js |
| M100 | `api/src/lib/draft-answers.js` | unknown part ids kept | KILLED | api/tests/composite-20d.test.js |
| M101 | `api/src/lib/draft-answers.js` | linked SmartSim part may carry its own answer | KILLED | api/tests/composite-20d.test.js |
| M102 | `api/src/lib/draft-answers.js` | shared context answer stored unreplayed | KILLED | api/tests/composite-20d.test.js |
| M103 | `api/src/lib/draft-answers.js` | composite answer size bound removed | KILLED | api/tests/composite-hardening-20d.test.js |
| M104 | `api/src/lib/draft-answers.js` | child answers not bound by their type's binder | KILLED | api/tests/composite-20d.test.js |
| M105 | `api/src/lib/draft-answers.js` | unknown context ids kept | KILLED | api/tests/composite-20d.test.js |
| M106 | `api/src/lib/draft-answers.js` | non-composite answer on a composite question accepted | KILLED | api/tests/composite-20d.test.js |
| M107 | `api/src/lib/draft-answers.js` | compound nested refusals reordered (compound@1 binding changed) | KILLED | src/compoundFreeze.20d.test.tsx |
| M110 | `api/src/lib/student-exam-sanitize.js` | composite projection not applied (deny-list only) | KILLED | api/tests/composite-20d.test.js |
| M111 | `api/src/lib/student-exam-sanitize.js` | child private key kept | KILLED | api/tests/composite-hardening-20d.test.js |
| M112 | `api/src/lib/student-exam-sanitize.js` | malformed composite spread instead of withheld | KILLED | api/tests/composite-20d.test.js |
| M113 | `api/src/lib/student-exam-sanitize.js` | linked part projection carries the private checks | KILLED | api/tests/composite-20d.test.js |
| M114 | `api/src/lib/student-exam-sanitize.js` | parametric child projected without the child identity | KILLED | api/tests/composite-20d.test.js |
| M115 | `api/src/lib/student-exam-sanitize.js` | legacy parts kept on a delivered composite | KILLED | api/tests/composite-hardening-20d.test.js |
| M120 | `api/src/lib/composite-review.js` | unknown part override accepted | KILLED | api/tests/composite-20d.test.js |
| M121 | `api/src/lib/composite-review.js` | ignored part override accepted | KILLED | api/tests/composite-20d.test.js |
| M122 | `api/src/lib/composite-review.js` | score-only override accepted on a rubric child | KILLED | api/tests/composite-20d.test.js |
| M123 | `api/src/lib/composite-review.js` | forged rubric awards accepted | KILLED | api/tests/composite-20d.test.js |
| M124 | `api/src/lib/composite-review.js` | linked part review leaks the shared state | KILLED | api/tests/composite-20d.test.js |
| M125 | `api/src/lib/composite-review.js` | rubric child score computed from the client | KILLED | api/tests/composite-20d.test.js |
| M126 | `api/src/functions/assignment-review.js` | part override not clamped to the counted max | KILLED | api/tests/composite-20d.test.js |
| M130 | `api/src/lib/coding/official-grading.js` | ambiguous key resolved as top-level | KILLED | api/tests/composite-hardening-20d.test.js |
| M131 | `api/src/lib/coding/official-grading.js` | child fingerprint loses its target material | KILLED | api/tests/composite-hardening-20d.test.js |
| M132 | `api/src/lib/coding/official-grading.js` | excess / uncounted coding child planned | KILLED | api/tests/composite-coding-20d.test.js |
| M133 | `api/src/lib/coding/official-grading.js` | ignored composite plans its coding children | KILLED | api/tests/composite-hardening-20d.test.js |
| M134 | `api/src/lib/coding/official-grading.js` | parent override does not supersede the child target | KILLED | api/tests/composite-hardening-20d.test.js |
| M135 | `api/src/lib/coding/official-grading.js` | child result applied to the parent grade | KILLED | api/tests/composite-coding-20d.test.js |
| M136 | `api/src/lib/coding/official-grading.js` | child answer read from the top-level map | KILLED | api/tests/composite-coding-20d.test.js |
| M137 | `api/src/lib/coding/official-grading.js` | regrade ignores composite children | KILLED | api/tests/composite-coding-20d.test.js |
| M138 | `api/src/lib/coding/official-grading.js` | child evidence reads the parent grade | KILLED | api/tests/composite-hardening-20d.test.js |
| M139 | `api/src/lib/coding/official-grading.js` | linked SmartSim / non-coding part resolves as a coding target | KILLED | api/tests/composite-hardening-20d.test.js |
| M140 | `api/src/functions/coding-run.js` | practice run cannot address a composite child | KILLED | api/tests/composite-acceptance-20d.test.js |
| M141 | `api/src/lib/bank-asset-hydrate.js` | composite media not hydrated | KILLED | api/tests/composite-20d.test.js |
| M142 | `api/src/lib/exam-structure.js` | composite answers never answered (server) | KILLED | api/tests/composite-20d.test.js |
| R001 | `api/src/lib/attempt-grade-rebuild.js` | RF1: ambiguous child key read as the part's override | KILLED | api/tests/composite-review-fix-20d.test.js |
| R002 | `api/src/lib/composite-review.js` | RF1: review shows an ambiguous key as the part's score | KILLED | api/tests/composite-review-fix-20d.test.js |
| R003 | `api/src/lib/shared-finalization/compositeModel.js` | RF1: answered predicate not total (throws on malformed children) | KILLED | api/tests/composite-review-fix-20d.test.js |
| R004 | `api/src/lib/draft-answers.js` | RF1: malformed / wrong-family child answers stored | KILLED | api/tests/composite-review-fix-20d.test.js |
| R005 | `api/src/lib/draft-answers.js` | RF1: composite answer accepted on a non-composite question | KILLED | api/tests/composite-review-fix-20d.test.js |
| R006 | `src/examQuality.ts` | RF1: separator reservation checks examQuestionId only | KILLED | api/tests/composite-review-fix-20d.test.js |
| R007 | `src/examQuality.ts` | RF1: composite effective id not validated | KILLED | api/tests/composite-review-fix-20d.test.js |
| R008 | `src/compositeQuestion.ts` | RF1: every data:-prefixed string exempt from the 1 MB bound | KILLED | api/tests/composite-review-fix-20d.test.js |
| R009 | `api/src/lib/draft-answers.js` | RF1: choice index shape not checked | KILLED | api/tests/composite-review-fix-20d.test.js |
| U001 | `src/questionTypes/student/CompositeResponse.tsx` | malformed root rendered (no fail-closed note) | KILLED | src/questionTypes/composite.20d.test.tsx |
| U002 | `src/questionTypes/student/CompositeResponse.tsx` | registered child renderer receives the bare part id (not the child key) | KILLED | src/questionTypes/composite.20d.test.tsx |
| U003 | `src/questionTypes/student/CompositeResponse.tsx` | excess first-N part not marked | KILLED | src/questionTypes/composite.20d.test.tsx |
| U004 | `src/questionTypes/student/CompositeResponse.tsx` | part reset clears the whole answer | KILLED | src/questionTypes/composite.20d.test.tsx |
| U005 | `src/questionTypes/student/CompositeResponse.tsx` | context reset drops part answers | KILLED | src/questionTypes/composite.20d.test.tsx |
| U006 | `src/questionTypes/student/CompositeResponse.tsx` | linked SmartSim part renders its own simulator path | KILLED | src/questionTypes/composite.20d.test.tsx |
| U007 | `src/questionTypes/student/CompositeResponse.tsx` | part accessible name loses the question prefix | KILLED | src/questionTypes/composite.20d.test.tsx |
| U008 | `src/questionTypes/student/CompositeResponse.tsx` | part emission drops the shared contexts | KILLED | src/questionTypes/composite.20d.test.tsx |
| U009 | `src/questionTypes/student/CompositeResponse.tsx` | context emission drops part answers | KILLED | src/questionTypes/composite.20d.test.tsx |
| U010 | `src/questionTypes/student/CompositeResponse.tsx` | shared source context not rendered | KILLED | src/questionTypes/composite.20d.test.tsx |
| U011 | `src/questionTypes/student/CompositeResponse.tsx` | first-N rule hidden | KILLED | src/questionTypes/composite.20d.test.tsx |
| U012 | `src/questionTypes/student/CompositeResponse.tsx` | unavailable projection status rendered | KILLED | src/questionTypes/composite.20d.test.tsx |
| U013 | `src/questionTypes/studentRegistry.tsx` | composite renderer registered for version 2 too | EQUIVALENT | the catalog decides the effective version (createVersionedRegistry.resolve → effectiveQuestionTypeVersion); composite@1 is the only version, so an extra @2 registration can never resolve |
| U014 | `src/questionTypes/authoringRegistry.tsx` | composite editor registered statically / not lazily | KILLED | src/questionTypes/composite.20d.test.tsx |
| U020 | `src/composite/CompositeReviewView.tsx` | ignored part inputs enabled | KILLED | src/composite/compositeReview.20d.test.tsx |
| U021 | `src/composite/CompositeReviewView.tsx` | excess (ignored) part considered counted | EQUIVALENT | server invariant: an ignored part is always stored with countedMaxMarks 0 (pinned by 20D-S1/S7 and H3), so `!(cap > 0)` already classifies it as ignored |
| U022 | `src/composite/CompositeReviewView.tsx` | score input not bounded by the counted max | KILLED | src/composite/compositeReview.20d.test.tsx |
| U023 | `src/composite/CompositeReviewView.tsx` | ignored composite parts editable | EQUIVALENT | server invariant: an ignored composite zeroes every part's countedMaxMarks (gradeQuestionForSection, pinned by 20D-S1 / H4), so each part is already locked by `!(cap > 0)` |
| U030 | `src/AssignmentReview.tsx` | uncounted part overrides sent | KILLED | src/composite/compositeReview.20d.test.tsx |
| U031 | `src/AssignmentReview.tsx` | provisional composite ignores part overrides | KILLED | src/composite/compositeReview.20d.test.tsx |
| U032 | `src/AssignmentReview.tsx` | provisional composite counts uncounted parts | EQUIVALENT | `gs += Math.min(pc, …)` with pc = 0 adds 0 — skipping the part or adding min(0, v) is the same value |
| U033 | `src/AssignmentReview.tsx` | rubric child sent as a raw score | KILLED | src/composite/compositeReview.20d.test.tsx |
| U034 | `src/AssignmentReview.tsx` | composite rendered through the generic answer grid | KILLED | src/composite/compositeReview.20d.test.tsx |
| U040 | `src/questionTypes/editors/CompositeEditor.tsx` | duplicate group keeps the original part ids | KILLED | src/questionTypes/compositeEditor.20d.test.tsx |
| U041 | `src/questionTypes/editors/CompositeEditor.tsx` | firstN maxMarks not derived (left null) | KILLED | src/questionTypes/compositeEditor.20d.test.tsx |
| U042 | `src/questionTypes/editors/CompositeEditor.tsx` | switch back to all keeps the cap | KILLED | src/questionTypes/compositeEditor.20d.test.tsx |
| U043 | `src/questionTypes/editors/CompositeEditor.tsx` | move to another group duplicates the part | KILLED | src/questionTypes/compositeEditor.20d.test.tsx |
| U044 | `src/questionTypes/editors/CompositeEditor.tsx` | linking keeps the part's own envelope | KILLED | src/questionTypes/compositeEditor.20d.test.tsx |
| U045 | `src/questionTypes/editors/CompositeEditor.tsx` | deleting a context leaves dangling references | KILLED | src/questionTypes/compositeEditor.20d.test.tsx |
| U046 | `src/questionTypes/editors/CompositeEditor.tsx` | unlinked SmartSim part loses the envelope copy on context delete | KILLED | src/questionTypes/compositeEditor.20d.test.tsx |
| U047 | `src/questionTypes/editors/CompositeEditor.tsx` | exact version switch ignored (latest family default) | KILLED | src/questionTypes/compositeEditor.20d.test.tsx |
| U048 | `src/questionTypes/editors/CompositeEditor.tsx` | added source context lacks a source | KILLED | src/questionTypes/compositeEditor.20d.test.tsx |
| U050 | `src/questionTypes/typeContent.ts` | composite contexts not counted as authored content | KILLED | src/questionTypes/compositeEditor.20d.test.tsx |
| U060 | `src/CompoundPartControl.tsx` | legacy part control names controls by name even when text exists | KILLED | src/compoundFreeze.20d.test.tsx |
| U061 | `src/CompoundPartControl.tsx` | legacy field answers lose previous values | KILLED | src/compoundFreeze.20d.test.tsx |
| U062 | `src/CompoundPartControl.tsx` | legacy text answers emitted under another kind | KILLED | src/compoundFreeze.20d.test.tsx |
| U063 | `src/CompoundPartControl.tsx` | true/false parts treated as text | KILLED | src/compoundFreeze.20d.test.tsx |
