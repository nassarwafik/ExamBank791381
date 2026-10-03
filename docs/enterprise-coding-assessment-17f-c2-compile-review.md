# Phase 17F-C2 — Pedagogical Compile-Error Review Policy

> ⛔ **DO NOT MERGE — independent review required.** Auto-merge is off; the repository owner performs the final merge
> manually. No Azure resource was created or changed, no secret was generated or rotated, no Runner VM was deployed, no
> production assignment was mutated, no database migration ran, `main` was not modified.

**Scope.** ONE teacher-owned policy on the private coding answer key, `answer.compileErrorPolicy ∈ {"zero","manualReview"}`,
so that a Runner **compile error** can route a coding question to the teacher's existing manual review instead of an
automatic, authoritative **0**. Server authority, shared model, Builder control, teacher evidence, student wording.
**Not here:** any stderr / regex classification of the error, any "minor syntax error" heuristic, any partial-credit
algorithm, any AI-generated official mark, any Runner / gateway change (17F-B3 is Window 2's work), any Python
compile step (Python has no compile phase in the official contract — a Python syntax error stays a runtime error).

| | |
|---|---|
| Baseline | `origin/main` `d2ae703b8608d82c0f20b68be495eabf76a048a2` (merge of PR #247, 17F-B1) — re-verified unchanged before the branch was created and before the push |
| Branch | `feature/17f-c2-compile-error-review-policy` — one branch, one PR, no rebase, no force-push, no amend after push, auto-merge off |
| Parallel work | 17F-B3 (`runner/gateway/official.js`, Window 2) and the PR #249 harness (Window 3) share **no file** with this phase; nothing was copied or cherry-picked from their unmerged branches |
| Shared source | `src/codingQuestion.ts`, `src/questionTypeDefaults.ts` → `api/src/lib/shared-finalization/*` regenerated with `node scripts/build-shared-finalization.mjs` (never hand-edited; drift guard `api/tests/shared-finalization-drift-14a.test.js` green) |

## 1. Architecture audit — the historical compile-error path (proven on the baseline by PED1)

| Step | Code fact (baseline) | Effect |
|---|---|---|
| Runner verdict | `runner/gateway/official.js` posts `compile: { status: "compile-error", stderr }` with `cases: []` (structural verdict of the toolchain, bounded 32 KiB) | The ONLY trusted signal of a compile error. Untouched. |
| Evaluation | `src/codingContract.ts evaluateOfficialCodingRun` → `kind: "complete"`, `compileError: true`, `passedWeight: 0`, every case `compile-error`, `compilePreview` bounded to `OFFICIAL_PREVIEW_BYTES` (4096) | Complete evidence, zero passed weight. Untouched. |
| Score | `officialCodingScoreFor(policy, maxMarks, ev)` → `0` (proportional and allOrNothing alike) | Authoritative automatic 0. |
| Callback | `api/src/lib/coding/official-grading.js applyOfficialCallback` → `target.state = "complete"`, `result.automaticScore = 0`, `applyGrade(grade, 0, false)` ⇒ `grade.manualReview = false` | The question is **decided** by the machine. |
| Rebuild | `attempt-grade-rebuild.js rebuildAttemptGrades`: `manualReview` false ⇒ no `remaining`; with no other manual question `finalized = true`; `deriveGradingStatus` ⇒ `final` | The attempt leaves teacher review. |
| Side effects | `finalSideEffects` (becameFinal) ⇒ `assignment_reviewed` student notification | The student is told the mark is final. |
| Student | `studentCodingGradingStatus` ⇒ `"complete"`; headline `0 / 30`, `0%` | A missing semicolon reads as "you scored zero". |
| Teacher | `teacherCodingEvidence` ⇒ `outcome: "compile-error"`, `automaticScore: 0`, `effectiveScore: 0`, label "فشل تجميع الكود" | The teacher sees a decided zero and must *override* it. |

Facts the design relies on (all pre-existing, verified in code): the fingerprint is `sha256(stableStringify({...}))` over
normalized `officialLimits(cfg)` and adds `scoringPolicy` ONLY for `allOrNothing` (17E-A precedent); the grading key binds
assignment / student / attempt / `submittedAt` / target / revision + fingerprint + answer hash; `rebuildAttemptGrades`
counts `grade.manualReview` marks as `remaining` (⇒ `manualReviewMarks`, `finalized = remaining === 0`) and a teacher
override always wins (`manualReview: false, reviewed: true`); `teacherCodingEvidence` `pick()` lets an **absent**
`automaticScore` be `null` without `incomplete`; a force regrade keeps `previous.result` until the new callback lands;
`validateCodingQuestion` is the ONE validator the Builder, finalization and `gradeableQuestion` (fail-closed
`QUESTION_INVALID`) all run.

## 2. The policy (ONE shared authority)

`src/codingQuestion.ts` (compiled into `api/src/lib/shared-finalization/codingQuestion.js`):

```ts
export type CodingCompileErrorPolicy = "zero" | "manualReview";
export const CODING_COMPILE_ERROR_POLICIES = Object.freeze(["zero", "manualReview"]);
/** absent / anything not exactly "manualReview" ⇒ "zero" (the historical behaviour); the validator rejects unknown explicit values */
export const codingCompileErrorPolicy = (answerKey) => (isObj(answerKey) && answerKey.compileErrorPolicy === "manualReview" ? "manualReview" : "zero");
```

| Stored value | Resolution | Validation | Fingerprint material |
|---|---|---|---|
| absent (every pre-C2 question) | `"zero"` | valid | **none** — byte-identical to the pre-C2 formula (PED28) |
| `"zero"` | `"zero"` | valid | none — same fingerprint as absent (PED28) |
| `"manualReview"` | `"manualReview"` | valid | `compileErrorPolicy: "manualReview"` (PED30) |
| anything else (`"halfCredit"`, `""`, `1`, `null`, `true`) | — | `CODING_COMPILE_ERROR_POLICY_UNKNOWN` "سياسة التعامل مع فشل تجميع الكود غير معروفة." blocks finalization; the server authority fails CLOSED (`QUESTION_INVALID`, no zero committed, no runner call) (PED26, PED26b) | never normalized |

**No migration, no `questionTypeVersion` bump**: a legacy question keeps its exact behaviour, fingerprint and grading key,
so every pre-C2 in-flight job still applies after deployment (PED29). **New authoring default = `"manualReview"`**:
`defaultCodingAnswerKey()` and `registerTypeDefaults("coding", 1, …)` both seed it, so `newQuestion("coding")` and a type
change to coding carry it (PED2); `ensure()` never overwrites an existing `answer`, so no stored node is touched.
Import / export / clone / bank / preset / snapshot paths copy `answer` as an opaque object (audit: the only production
modules that touch key fields by name are the editor, the preview stripper, the student sanitizer and `typeContent.ts` —
none rebuilds the key field-by-field), so the field round-trips unchanged; the editor's `readKey` passes it verbatim.

## 3. Server behaviour under `manualReview` (the trusted compile boundary)

`applyOfficialCallback`, inside the existing `complete` branch:

```js
const reviewRequired = ev.compileError && auth.compileErrorPolicy === "manualReview";   // the Runner's structural verdict × the teacher's policy
const automaticScore = reviewRequired ? null : officialCodingScoreFor(auth.scoringPolicy, auth.maxMarks, ev);
target.result = { …, ...(reviewRequired ? { reviewRequired: true } : { automaticScore }), outcome: "compile-error", compilePreview, cases, completedAt };
target.state = "complete";
if (reviewRequired) holdForReview(auth.grade);   // score 0 (provisional base), manualReview = true, correct = false
else applyGrade(auth.grade, automaticScore, …);
rebuildAttemptGrades(attempt);                   // manualReviewMarks += marks, finalized = false ⇒ gradingStatus pendingReview
```

* `ev.compileError` is `true` ONLY when the Runner said `compile.status === "compile-error"`. **No stderr parsing, no regex,
  no language heuristic, no "minor error" decision** (grep guard: no `/SyntaxError/`, `/expected/` or similar appears in
  `official-grading.js`, `codingContract.ts` or any C2 UI module).
* The target is **complete** — not `retryable`, no `technicalCode`, never `RUNNER_FAILED` (PED3 / PED4). Recovery sweeps
  and the gradebook "retry" path do not touch it; a teacher **regrade** still works.
* No `automaticScore: 0` is stored next to `reviewRequired` (PED7) — the stored result cannot be misread as a zero later.
* `holdForReview` keeps the same grade shape the submission plan wrote (`score 0, manualReview true`): the rebuild counts
  the full question marks as **awaiting the teacher**, exactly like a manual coding question — never as an awarded zero.
* `becameFinal` is false ⇒ `finalSideEffects` does not run ⇒ **no `assignment_reviewed` notification** while the teacher
  has not decided (PED20); the audit `coding.autoGrade.completed` carries `reviewRequired: true` (no code, no stderr).
* Duplicate callbacks stay idempotent (`already`), stale revisions stay rejected (PED17). An override saved **before** the
  callback wins untouched (PED18). A **force regrade** that compile-errors under `manualReview` holds the question for
  review and the previous automatic score is no longer the effective score (PED19). `compileErrorPolicy` is orthogonal
  to `scoringPolicy` (allOrNothing + compile error ⇒ review, PED16b). Every other outcome is unchanged: no-answer 0,
  proportional / allOrNothing marks, runtime error, timeout, output limit, retryable technical failures (PED21–PED25).
* The `"zero"` / legacy path is byte-for-byte the historical path (PED1, PED22).

## 4. Teacher workflow — the existing review, no special algorithm

* `teacherCodingEvidence` gains ONE allow-listed boolean `reviewRequired` (`outcome === "compile-error" && result.reviewRequired === true`);
  with it `automaticScore: null`, `effectiveScore: null`, `status: "complete"`, `incomplete: false`, the bounded
  `compilePreview` (4096 B) and every case `compile-error` (PED8 / PED9 / PED34). The contract pin
  (`coding-17e-d-evidence.test.js` TE1b `EVIDENCE_KEYS`) was extended by exactly that key.
* `src/coding/codingTeacherEvidence.ts`: label **"فشل تجميع الكود — مطلوب تصحيح يدوي"** (warn tone) while review is
  required and no override exists; `src/coding/CodingAutoGradeBlock.tsx` renders a `role="status"` block with the note
  **"لم يمنح SmartAssess علامة صفر تلقائيًا وفق سياسة السؤال."** and the compiler text labelled "رسالة المترجم (دليل للمعلم)".
  Nothing implies the error is minor or the solution correct.
* The mark is awarded through the **existing** manual override (`assignment-review.js saveReview` → `attempt.manualOverrides[qid]`),
  e.g. 9.5 / 10 for `int x = 5` missing its semicolon: effective 9.5, `manualReview` resolved, totals rebuilt, attempt
  final, student status `complete` (PED15 / PED16). **No "minus 0.5" rule, no AI-generated official mark.** A teacher may
  equally award 0 — that 0 is then a decided mark and is displayed as such.
* The gradebook summary / bulk-retry paths treat the target as complete (nothing to retry).

## 5. Student experience — never a fake zero

Server-derived aggregate `studentCodingGradingStatus` (ONE value per attempt, projected as `autoGradingStatus` by
`student-submission.js` and `student-dashboard.js`): precedence **retrying > processing > queued > delayed > reviewRequired > complete**;
a target with `result.reviewRequired === true` counts as review-required until a teacher override exists for it
(PED10, aggregation tests). `autoGradingPending` stays `false` (the automatic part is done).

| Surface | `reviewRequired` | Text |
|---|---|---|
| Result headline (`.iex-score`, `data-pending="true"`) | `— / 30` | percentage slot: **"بانتظار مراجعة المعلم"** (`withheldScoreLabel`) |
| Status panel title | | **"اكتمل فحص الكود، وتحتاج النتيجة إلى مراجعة المعلم."** |
| Status panel detail | | **"تعذّر تجميع الكود، لذلك لم تُحتسب علامة صفر تلقائيًا. سيحدد المعلم العلامة بعد مراجعة الحل."** |
| Portal card | `— /30` | **"سؤال برمجي بانتظار مراجعة المعلم"** |
| Polling | none — `isCodingGradingOpen("reviewRequired") === false`, `shouldPollCodingGrading === false`; no "come back later" / refresh notes (PED14) |
| Mixed exam | another question already worth 10 is NOT presented as a partial total (PED35) |
| After the override | the server says `complete` + `final` ⇒ real mark (`29.5 / 30`, or a real `0 / 30` the teacher chose) (PED16) |

`scoreWithheld` = open automatic state **or** review required **or** the legacy `autoGradingPending: true`; the label
depends on WHY the score is withheld (technical delay vs teacher review, PED12). No compiler text reaches the student
(the sanitizer also strips `compileErrorPolicy` from any node, defense in depth — `answer` itself is already removed).

## 6. Builder control (`src/questionTypes/editors/CodingQuestionEditor.tsx`, under "التصحيح والعلامة")

One `<fieldset role="radiogroup" aria-label="عند فشل تجميع الكود">` with a single `<legend>` and two native radios
(`name = useId() + "-compile"`, arrow-key navigable, each `aria-describedby` → its help paragraph), `disabled` in
read-only mode:

| Option | Label | Help (`aria-describedby`) |
|---|---|---|
| `zero` | احتساب صفر تلقائيًا | عند فشل تجميع الكود يُحتسب للسؤال صفر تلقائيًا ويُعدّ التصحيح الآلي مكتملًا (السلوك السابق). |
| `manualReview` (new default) | إرسال للمراجعة اليدوية | المراجعة اليدوية مناسبة عندما تريد منح الطالب جزءًا من العلامة إذا كان الحل صحيحًا من حيث الفكرة لكن يحتوي خطأً نحويًا يمنع التجميع. لا تُحتسب أي علامة آلية؛ يظهر السؤال للمعلم مع كود الطالب ورسالة المترجم. |

Below the radios: **"SmartAssess لا يقرر تلقائيًا إن كان الخطأ بسيطًا أو يستحق خصمًا معينًا؛ المعلم يحدد العلامة."** and the
scope note "تنطبق هذه السياسة فقط عندما يُبلغ محرك التنفيذ عن فشل حقيقي في تجميع الكود (حاليًا اللغات المُجمَّعة مثل Java وC#). أخطاء
التشغيل والمخرجات غير المطابقة تُحتسب حسب سياسة احتساب العلامة كالمعتاد." A legacy node (no field) shows **zero** checked;
choosing manual review writes ONLY `compileErrorPolicy` (every other key field preserved); switching back writes `"zero"`
explicitly (PED33 / PED33b / PED33c).

## 7. Fail-first evidence (new suites on the untouched baseline `d2ae703`)

| Suite | Baseline | After |
|---|---|---|
| `api/tests/coding-17f-c2-compile-review.test.js` (30) | **18 failed / 12 passed** — the 12 passing are the compatibility pins: PED1 legacy zero, PED22 explicit zero, PED28 legacy fingerprint, PED29 in-flight key, PED34 preview bound, PED31/32 student privacy, unchanged outcomes PED20 / PED21 / PED23 / PED24 / PED25, legacy boolean false | 30 / 30 |
| `src/coding/compileReview.17f-c2.test.tsx` (13) | **11 failed / 2 passed** — the 2 passing are pins (`halfCredit` is undefined; a complete final score renders) | 13 / 13 |

Records: scratchpad `c2-fail-first-api.txt`, `c2-fail-first-ui.txt` (re-recorded with the final harness).

## 8. Tests added / changed

* NEW `api/tests/coding-17f-c2-compile-review.test.js` — real handlers (`student-submission`, `student-dashboard`,
  `assignment-review`, `coding-grading` callback / regrade) against the in-memory container: PED1–PED35 incl. realistic
  Java (`int x = 5` missing `;`, `javac` diagnostic) and C# (`CS1002`) fixtures, aggregation precedence, override
  resolution, idempotency, privacy (`reviewRequired` / `compileErrorPolicy` / compiler text never in a student response).
* NEW `src/coding/compileReview.17f-c2.test.tsx` — vocabulary, result page (fake timers, no polling over 6 min), portal
  card, Builder radiogroup (legacy → zero, writes, round trip, disabled, keyboard / aria), evidence normalization.
* Pins updated for the new field / key: `api/tests/coding-17c-model.test.js` (default key), `api/tests/coding-17e-d-evidence.test.js`
  (TE1b exact evidence keys + `reviewRequired`), `src/coding/coding.17a.test.ts` (new-question default shape ×2).

## 9. Mutations (each applied alone, targeted suites, 7 files restored byte-for-byte — verified by sha256 before / after)

| # | Mutation | Killed by |
|---|---|---|
| M1 | legacy ABSENT resolves to `manualReview` (silent migration) | API 6 (PED1, PED22, PED28, PED29, PED2, PED30) · UI 2 (PED2, PED33) |
| M2 | fingerprint adds material for the legacy value | API 2 (PED28, PED29) |
| M3 | fingerprint ignores `manualReview` | API 1 (PED30) |
| M4 | `manualReview` compile error still applies an authoritative automatic 0 | API 10 (PED3–PED10, PED20, PED27 …) |
| M5 | result stores `automaticScore: 0` next to `reviewRequired` | API 7 (PED3, PED8, PED15, PED18, PED19, PED27 …) |
| M6 | policy ignored — every compile error held for review | API 3 (PED1, PED22, PED29) |
| M7 | student status never says `reviewRequired` | API 5 (PED10, PED19, PED35, precedence, override) |
| M8 | precedence inverted (`reviewRequired` outranks retrying / processing / queued / delayed) | API 1 (precedence) |
| M9 | teacher evidence never flags `reviewRequired` | API 5 (PED8, PED15, PED18, PED19, PED27) |
| M10 | validator accepts an unknown policy (`halfCredit`) | API 2 (PED26, PED26b) |
| M11 | new-authoring default drops the policy | API 1 (PED2) · UI 1 (PED2) |
| M12 | `reviewRequired` counted as OPEN (polling / refresh notes) | UI 2 (PED14, card) |
| M13 | headline not withheld for `reviewRequired` (fake `0 / 30`) | UI 4 (PED11, PED14, PED35, card) |
| M14 | editor writes the wrong key field | UI 2 (PED33, PED33b) |
| M15 | teacher override no longer resolves the student's `reviewRequired` | API 3 (PED15, PED18, override) |

## 10. Validation (this branch)

See the PR body for the exact figures of `npm test`, `npm run lint`, `npx tsc -b`, `npm run build` (bundle guard:
initial JS **124.5 KB gzip ≤ 125 KB budget**, budget unchanged; Monaco `monacoEngine-*.js` stays lazy behind the coding
editor's dynamic edge), `npm run check:bundle`, `git diff --check`, the API coding suites (17A / 17C / 17D / 17E-A–D /
17F-B1 / guards: 325 tests), the drift guard and `npm --prefix runner test`. Runner code is unchanged (Docker suites
not required; the Runner's `compile.status` contract is consumed as-is).

## 11. Security analysis

* The policy is **teacher-owned private key data**: it lives under `answer` (never sent to students — `student-exam-sanitize.js`
  removes `answer` and now also lists `compileErrorPolicy` in `GRADING_SECRET_KEYS` as defense in depth; the Builder
  preview stripper removes `answer` too). Student projections expose only the aggregate word `reviewRequired` (PED10,
  leak regex in the suite).
* No new endpoint, no new auth path, no new storage shape beyond one boolean on an existing result and one string on
  an existing key; no runner / HMAC / callback-validation change (`validateCallbackBody` unchanged: `compile.status` ∈
  {compiled, compile-error}, stderr ≤ 32 KiB, cases an array).
* The teacher evidence stays an allow-listed projection (exact-key pin); the compile preview stays bounded (4096 B) in
  the stored result and in the evidence (PED34).
* Fail-closed on unknown values at every layer (Builder validation, finalization, server authority) — never normalized.
* No decision is made from untrusted text: the Runner's structural verdict is the only input; the teacher is the only
  authority for the mark.

## 12. Known limits and boundaries

* Python questions have no compile phase in the official contract; a Python syntax error is a runtime error and keeps the
  historical runtime-error marking. The Builder help text says so.
* The policy applies per question (not per assignment / class); a legacy question stays on `zero` until the teacher opens
  it and chooses otherwise (deliberate — no migration).
* The teacher must act for the attempt to become final; the student sees "بانتظار مراجعة المعلم" until then (the same
  state as any manual question).

## 13. Rollback

Revert the single PR commit (or the merge). Effects on stored data, both safe:
* a question stored with `compileErrorPolicy: "manualReview"` is simply ignored by the pre-C2 code (`answer` has no
  unknown-key rule; `codingCompileErrorPolicy` disappears) ⇒ it behaves as `zero` again, its fingerprint reverts to the
  legacy formula, so a job created under C2 for such a question is rejected as stale by the pre-C2 callback — a teacher
  regrade re-dispatches it;
* a result stored with `reviewRequired: true` (no `automaticScore`) keeps `grade.manualReview = true` ⇒ the question
  stays in teacher review; the pre-C2 evidence projection reads `automaticScore: null` without `incomplete`.
No database migration, no Azure action, no Runner change is needed in either direction.
