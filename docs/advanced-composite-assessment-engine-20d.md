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
