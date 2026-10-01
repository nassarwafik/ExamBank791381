# Phase 17C — Enterprise Hidden-Test Automatic Coding Grading

> **Status:** implementation complete on `feature/17c-official-coding-autograding`.
> **Do not merge.** An independent security review is required.
>
> **Baseline:** `origin/main` = `543fa9f4cf5f45257a9233e831d76bda69c2a1ad`.

**The Runner executes code. The SmartAssess server decides the grade.**

Phase 17C adds **official** automatic grading of `coding@1` answers with teacher-owned hidden tests. It covers
**Python, Java and C# only** (`python@1`, `java@1`, `csharp@1`).

It is an opt-in, per question setting: `question.answer.gradingMode = "hiddenTests"`. Manual grading stays the default.
A question without a mode, or with `"manual"`, behaves exactly as in Phase 17A.

Related documents:

- [`enterprise-coding-assessment-17a.md`](enterprise-coding-assessment-17a.md): the question type, contracts and editor.
- [`enterprise-coding-assessment-17b.md`](enterprise-coding-assessment-17b.md): the isolated runner and practice execution.
- [`../runner/README.md`](../runner/README.md): the runner package.

---

## 1. Scope

**In scope**

- A private grading mode on the coding answer key, with finalization gates.
- A durable grading intent, written atomically with every completed attempt.
- Asynchronous, signed dispatch to a new runner endpoint.
- A trusted official execution path in the runner:
  - no in-container grading reporter;
  - compile once;
  - a fresh runtime container per hidden case;
  - each status derived by the gateway itself.
- A signed callback carrying raw evidence only.
- Server-side comparison, weighting and scoring, plus the canonical attempt rebuild.
- Idempotency, stale-result protection, retry and force regrade.
- Teacher evidence, the student pending message, notifications, achievements, audit and observability.

**Explicit 17C limits (no new infrastructure)**

- No SQL database or migration. State lives in the existing blob documents.
- No message broker. No Azure Queue, Service Bus or Durable Functions.
- No timer sweeper. Re-dispatch happens on teacher retry, or through the idempotent `ensureCodingGradingJobs` (§19).
- No gVisor or Kata. Runtime isolation is the 17B hardened Docker profile.
- No new languages, packages, network access for programs, multiple files, or teacher preview runs.
- No partial credit inside a test. A test passes or fails; weights are per test.
- No per-test resource tuning. One limit set applies to the whole question.

---

## 2. Trust model

| Component | Trusted for | Never trusted for |
|---|---|---|
| SmartAssess API | identity, attempt authority, hidden tests, comparator, weights, marks, final grade | — |
| Runner gateway | running containers, observing exit code, wall clock and byte counts | the grade, pass/fail, weights |
| Trusted official entry (in container, before `execve`) | materialising the program, writing the exec marker | anything after `execve` |
| Student program | nothing; its stdout and stderr are **data** | status, score, pass/fail |

The student program can never claim any of these:

- `passed`, `failed`, `score`, `status`, `testsPassed`, `grade`.

Student stdout is always data. The callback body has no field that could carry a verdict.
The API refuses any unknown field with `400` (§9).

---

## 3. Data model

### 3.1 Private answer key (teacher only)

```jsonc
"answer": {
  "gradingMode": "manual" | "hiddenTests",   // missing ⇒ manual
  "hiddenTests": [{ "id", "title?", "input", "expectedOutput", "weight" }],
  "comparator": "exact" | "trimTrailingWhitespace" | "normalizeWhitespace",
  "referenceSolutions": { "<language>": "<source>" }       // teacher aid only: never sent anywhere
}
```

The student sanitizer blanks `question.answer` entirely. Since 17C it also strips the following keys from any question or
part node (defense in depth):

- `gradingMode`, `hiddenTests`, `referenceSolutions`;
- `codingGrading`, `gradingKey`, `answerHash`, `questionFingerprint`.

### 3.2 Attempt-side grading intent

`attempt.codingGrading` is written in the same CAS as the completed attempt:

```jsonc
"codingGrading": {
  "version": 1,
  "targets": {
    "<questionId>": {
      "mode": "hiddenTests",
      "state": "pending" | "dispatched" | "complete" | "retryable",
      "revision": 1,
      "jobId": "cg_<40 hex>",
      "gradingKey": "<sha256>", "answerHash": "<sha256>", "questionFingerprint": "<sha256>",
      "createdAt": "…", "updatedAt": "…",
      "technicalCode": "RUNNER_BUSY",            // only when retryable
      "result": {                                // only once a revision completed
        "revision", "jobId", "engine": "runner-official-v1",
        "automaticScore", "maxMarks", "passedWeight", "totalWeight", "testCount", "passedCount",
        "outcome": "graded" | "compile-error" | "no-answer",
        "compilePreview?": "≤ 4 KB",
        "cases": [{ "testId", "status", "passed", "durationMs?", "actualPreview?": "≤ 4 KB", "stderrPreview?": "≤ 4 KB" }],
        "completedAt"
      }
    }
  }
}
```

**Target key = question id.** `coding@1` is not compound-capable: the catalog has no compound flag, and draft ingestion drops
a code answer inside a compound part. A guard test pins this.

Previews are cut at a UTF-8 code-point boundary (`utf8Prefix`). Only failed cases keep previews. Expected outputs are
**not** copied into the result; the teacher view reads them from the snapshot.

### 3.3 Job store

`platform/coding-grading-jobs/<jobId>.json` holds identifiers and state only:

```jsonc
{ "schemaVersion": 1, "jobId", "assignmentId", "studentId", "attemptNumber", "targetKey", "revision", "gradingKey",
  "state": "pending" | "dispatched" | "retryable" | "complete" | "superseded",
  "technicalCode?", "dispatchCount", "createdAt", "updatedAt" }
```

It never holds source, hidden tests, expected outputs or reference solutions. A test asserts this.

---

## 4. Finalization gates (hiddenTests mode)

The shared validator (`src/codingQuestion.ts`, regenerated into `api/src/lib/shared-finalization/`) refuses an automatic
question unless all of these hold:

- at least one hidden test;
- valid, unique test ids;
- every weight finite and ≥ 0, and total weight > 0;
- a supported comparator;
- inputs and expected outputs within the I/O limits;
- every expected output within `limits.outputBytes` and therefore capturable by the official grader
  (`CODING_EXPECTED_OUTPUT_EXCEEDS_LIMIT`);
- every allowed language supports tests;
- valid limits.

Error codes: `CODING_GRADING_MODE_UNKNOWN` and `CODING_AUTO_NO_HIDDEN_TESTS` are new; the other gates reuse 17A codes.

The server re-checks the same contract at grading time and fails closed (`gradeableQuestion`). A snapshot question that
claims `hiddenTests` but is not gradeable becomes a `retryable` target with `QUESTION_INVALID`. Its question stays in manual
review and is never scored zero.

---

## 5. Lifecycle

```
completed-attempt CAS (submit | finalizeTimedOutAttempt | finalizeIntegrityExit | teacher endActiveAttempt)
  └─ planCodingGrading(snapshot, attempt)        pure, inside the CAS: targets + no-answer zeros + canonical rebuild
commit
  └─ dispatchPlannedGrading                       after the commit; never fails the request
        ├─ job record upsert (identifiers only)
        ├─ signed POST /v1/official-grading-jobs  (outside every storage mutation callback)
        └─ target → dispatched | retryable(technicalCode)
runner: 202 → bounded queue → compile once → fresh container per case → raw evidence
  └─ signed POST /api/coding/grade-callback      (at-least-once, bounded retry)
API: verify → validate → authority (job → target → revision → grading key) → compare + weight + score
  └─ target → complete (score applied, rebuild) | retryable (technical, no score)
       └─ became final? → ONE automatic notification + achievement (idempotent)
```

- **All four completed-attempt writers** record the intent inside their CAS. A storage conflict retries the CAS and re-plans,
  so there is exactly one intent per attempt (D9).
- **Missing or blank answer.** A counted target is complete immediately (`no-answer`, score 0). No job is created and the
  runner is not called (D3). Whitespace-only source counts as no answer.
- **Not counted.** A `firstNAnswered` question that is not counted (effective marks 0) gets no target.
- **Submission never depends on the runner.** A runner outage or refusal, or missing configuration, leaves the target
  `retryable` with a technical code. The question stays in manual review and the attempt stays `pendingReview`. The
  submission itself succeeded and stays consumed (D2).
- **`gradeExam` stays synchronous.** The `coding@1` built-in grader still returns `score 0, manualReview: true`. The official
  layer upgrades the grade later.

---

## 6. Official execution in the runner

### 6.1 Endpoint

`POST /v1/official-grading-jobs` is signed with the existing `SA-CODING-RUNNER-1` protocol and key.

The body has exactly these keys:

```jsonc
{ "jobId": "cg_…", "language": "python", "languageVersion": 1, "source": "…",
  "cases": [{ "token": "c01", "stdin": "…" }],         // tokens c01, c02 … in order; ≤ 50 cases
  "limits": { "timeMs": 250..10000, "memoryMb": 16..512, "outputBytes": 1024..17408 } }
```

**Bounds**

- source ≤ 64 KB;
- each stdin ≤ 16 KB, total stdin ≤ 256 KB;
- body ≤ 2 MB.

**Refused with `400`**

- any other key at any level: image, command, entrypoint, flags, mounts, env, network, user, callback URL;
- any expected output, weight, title, identity, marks or score.

**Responses**

| response | meaning |
|---|---|
| `202 { ok, accepted, duplicate }` | queued, or a duplicate of a known job |
| `409 JOB_ID_CONFLICT` | same job id with a different payload hash |
| `503 RUNNER_BUSY` | the bounded queue is full |
| `503 GRADING_UNAVAILABLE` | no valid callback destination is configured |
| `422 LANGUAGE_UNAVAILABLE` | the language's image is not on the host |
| `401` | missing or invalid signature |

### 6.2 Queue (`gateway/official.js`)

- **Dedupe.** Jobs are deduplicated by `jobId` + SHA-256 of the canonical request.
  - A duplicate of a completed job is **re-delivered from the result cache** without running student code again.
  - A different body under a known id is `JOB_ID_CONFLICT`, so a reused id can never run replacement code.
- **Bounds.** `maxPending` (default 8) covers queued plus running jobs. `maxActive` (default 1) caps jobs running at once.
- **Case concurrency.** Cases run 2 at a time per job, through **2 global official container slots**.
- **Server-owned hard wall.** Compile allowance + ⌈cases / concurrency⌉ × (timeMs + start-up slack) + 30 s, capped at
  20 minutes.
  - An overrun is `outcome: "failed", technicalCode: "SUITE_TIMEOUT"`.
  - A sandbox exception is `RUNNER_INTERNAL`.
  - Neither is ever a partial grade.
- **Result cache.** Bounded to 512 entries and one hour.

### 6.3 Execution (`gateway/sandbox.js` `runOfficialSuite`, `workers/supervisor.py` official frame)

**Compile once (Java / C#).** The 17B compile sandbox runs once per job. Its artifact stays in gateway memory.

- A compile error ends the suite with `compile: { status: "compile-error", stderr ≤ 32 KB }` and no runtime container.

**Fresh runtime per case.** Each case gets a new container: new random name, `docker run --rm`, the full 17B hardening
profile, and the runtime memory ceiling of memoryMb + language overhead (unchanged from 17B). After every case the gateway
runs `rm -f` on the container.

**Strict framing.** Container stdin carries:

```
"SAOFF1 " + 10-digit length + "\n" + JSON setup { phase:"official", source | artifact, limits } + raw case stdin
```

The trusted entry reads exactly the frame with `os.read` on fd 0, so there is **no read-ahead** of the case stdin. Case
stdin is opaque data: a frame-looking stdin is never interpreted (F7).

**Trusted entry, then `execve`.** The entry:

1. materialises the source (interpreted) or the artifact (compiled) in the tmpfs workspace;
2. applies the rlimits to itself;
3. writes the fixed marker `\0SA-EXEC-17C\0` to fd 1;
4. calls `execve()` on the runtime command.

No supervisor stays alive next to student code. Setup failure exits `125` with no marker.

**Gateway-derived status.** Each case status comes only from the gateway's own observation:

| observation | status |
|---|---|
| no marker | `internal-error` (student code never ran; infrastructure) |
| wall clock exceeded | `timeout` (program timer starts at the marker) |
| stdout above the capture bound, or stderr flood above 64 KB | `output-limit` |
| exit 0 | `success` |
| exit > 0 | `runtime-error` (including 137 for out-of-memory kill) |
| anything else | `internal-error` |

**Capture bounds.**

- stdout is captured while reading, up to `outputBytes` (≤ 17,408 = 16 KB I/O contract + 1 KB to detect excess output);
- stderr is captured up to 4 KB;
- both are decoded as UTF-8 and cut at a code-point boundary.

**Python syntax errors** are a `runtime-error` per case, because Python has no separate compile step.

### 6.4 Callback delivery (`gateway/callback.js`)

**Destination.** Taken from the gateway host's own configuration, never from a request:

- `SMARTASSESS_CALLBACK_BASE_URL`: `https://` only (plain `http://` only for a loopback host); no credentials, path, query
  or fragment.
- `SMARTASSESS_CALLBACK_HMAC_KEY`: ≥ 32 characters, and different from `RUNNER_HMAC_KEY`. If both raw secrets are set and
  equal, the gateway **refuses to start**, whether or not the callback URL is valid (Review Fix 1, §20).

Missing or invalid configuration fails closed: the official endpoint answers `503 GRADING_UNAVAILABLE`.

**Body.** `{ jobId, outcome: "completed" | "failed", technicalCode?, compile?, cases: [{ token, status, stdout, stderr,
exitCode?, durationMs? }] }`.

- `encodeCallbackBody` throws on any other key, and on a body over 8 MB.
- The worst case (50 cases × fully escaped stdout and stderr) is about 6.5 MB.

**Delivery.** At least once.

- Retries on network error, timeout, 5xx, 408 or 429.
- Any other status is final: 2xx accepted, 4xx stale, unknown or malformed.
- Up to 6 attempts with backoff of `min(30 s, 1 s × 2^(n−1))`.
- `redirect: "error"` and a 15 s timeout per attempt.
- A fresh request id per attempt.
- The response body is discarded unread.

---

## 7. Dispatch (API → runner)

`lib/coding/official-grading.js` reaches the runner only through `readCodingRunnerConfig` and `signRunnerRequest`.

- **Request.** `redirect: "error"`, an 8 s timeout, and the response read with a 16 KB bound.
- **Preconditions.** Both the runner configuration and the callback key must be present; otherwise the result is
  `EXECUTION_UNAVAILABLE`.
- **No fallback.** There is no local fallback, no fake success and no reference-solution comparison.

| runner answer | target |
|---|---|
| `202 accepted` (incl. `duplicate`) | `dispatched` |
| `409 JOB_ID_CONFLICT` | `retryable` · `JOB_ID_CONFLICT` |
| `503 RUNNER_BUSY` / `GRADING_UNAVAILABLE` | `retryable` · same code |
| `422 LANGUAGE_UNAVAILABLE` | `retryable` · same code |
| `401` | `retryable` · `RUNNER_UNAUTHORIZED` |
| network error / anything else | `retryable` · `EXECUTION_FAILED` |
| not configured | `retryable` · `EXECUTION_UNAVAILABLE` (no request) |

**Job id.** `"cg_" + sha256(assignment, student, attempt, submittedAt, target, revision)[:40]`.

- It is lowercase hex, deterministic and opaque.
- Re-dispatching the same revision reuses it; the runner dedupes. A force regrade gets a new id.

**Target updates.** The target state change after dispatch is a CAS that applies only if the target is still the same
revision and job and not complete. A callback that wins the race is never overwritten.

---

## 8. Grading key and stale protection

```
questionFingerprint = sha256(stable JSON {questionId, type "coding", questionTypeVersion 1, mode, comparator,
                                          tests[{id,input,expectedOutput,weight}], official limits, allowedLanguages,
                                          effective (counted) marks, counted})
answerHash          = sha256(stable JSON {language, languageVersion, source})   | sha256("no-answer")
gradingKey          = sha256(stable JSON {v:1, assignmentId, studentId, attemptNumber, submittedAt, targetKey, revision,
                                          mode, questionFingerprint, answerHash})
```

The callback recomputes the key from the **stored** attempt answer and the **current** snapshot question. It applies a
result only if all of these hold:

- the job record exists;
- `target.jobId` matches;
- `target.revision` matches the job's revision;
- the recomputed key equals both `target.gradingKey` and `job.gradingKey`.

Anything else is `409 STALE_RESULT` with **no mutation**. The tests cover a tampered answer, a changed hidden test, and an
old revision after a force regrade (E3, E4).

---

## 9. Callback (`POST /api/coding/grade-callback`)

**Order of checks**

1. Unsigned request: `401`.
2. Callback key not configured, or equal to the runner request-signing key: `503 GRADING_UNAVAILABLE` (fail closed).
   The equality check compares the two **raw configured secrets** byte-for-byte (`lib/coding/hmac-key-separation.js`). It
   does not depend on the runner URL, the `CODING_RUNNER_ENABLED` kill switch or runner validity (Review Fix 1, §20).
3. Signature check (`SA-CODING-CALLBACK-1`): HMAC-SHA256 over protocol, method, the **fixed** path, timestamp (±300 s),
   request id and SHA-256 of the exact body, compared in constant time. Failure: `401`.
4. Body bounded to 8 MB and strictly validated: exact keys at every level, `jobId` pattern, `outcome` enum, token
   `c\d\d`, status enum, stdout ≤ 17,408 B, stderr ≤ 4 KB, compile stderr ≤ 32 KB, numeric bounds. Failure: `400`.
   - `score`, `passed`, `percentage` or any other field is refused (E8).
5. Unknown job: `404` with nothing written.
6. Stale result: `409` with no mutation.
7. Duplicate of an applied result: `200 { alreadyApplied: true }` with no write (the ETag is unchanged).

The route is classified **SIGNED** in the route-auth inventory, and anonymous requests are asserted to get `401`.

**Replay.** There is no stored nonce; Functions instances are stateless. Replay inside the ±300 s window is harmless because
application is idempotent and bound to job, revision and grading key. The one replay effect is that an older signed
`failed` callback for the *same* still-dispatched job can mark it `retryable` again; a teacher retry recovers it (§19).

---

## 10. Scoring, failure semantics, rebuild and overrides

**Comparison.** `evaluateOfficialCodingRun` (shared, pure) matches cases to tests by order and opaque token. It uses only the
stored comparator (`compareOutput` / `normalizeOutput`). Only `success` with a matching stdout passes.

**Score.** `officialCodingScore(effectiveMax, passedWeight, totalWeight) = effectiveMax × passedWeight / totalWeight`,
rounded **once** to 2 decimals.

**All or nothing.** Any of these makes the run a **technical** result:

- a missing case or a duplicate token (`SUITE_INCOMPLETE` / `EVIDENCE_INVALID`);
- an `internal-error` case (`CASE_INTERNAL_ERROR`);
- runner outcome `failed`.

A technical result is never a zero. The target becomes `retryable`, no score is produced, and manual review stays true (E7).

**Compile error** is a student outcome: complete, score 0, with a bounded diagnostic preview (E9).

**Rebuild.** The ONE canonical rebuild is `api/src/lib/attempt-grade-rebuild.js`, extracted verbatim from
`assignment-review.js`. A parity test pins it byte-for-byte to the original on legacy, sectioned, capped, `firstNAnswered`
and overridden attempts. Both manual review and the callback use it.

**Manual override always wins.** The callback sets the base grade (`score = automaticScore`, `manualReview = false`) and then
rebuilds. The rebuild applies `manualOverrides` on top. An override saved before or after the callback, or across a forced
regrade, is never erased (E5).

---

## 11. Teacher retry and force regrade (`POST /api/coding/regrade`)

- **Auth.** Builder authentication; anonymous gets `401`.
- **Body.** Exactly `{ action: "retry" | "force", assignmentId, studentId, attemptNumber, questionId }`. Any other field gets
  `400`: source, tests, limits, score, language. A non-target question or a missing attempt gets `404`.
- **`retry`.** Re-dispatches the same revision for pending, dispatched or retryable targets. It reuses the job id. A completed
  target gets `409 ALREADY_COMPLETE`.
- **`force`.** Starts a new revision from the stored answer and the current snapshot, with a new job id. The old job record
  becomes `superseded`. Audited as `coding.autoGrade.regraded`.
  - The previously applied result stays visible and official until the new revision completes.
  - A late callback of the old revision is refused (`409`).

---

## 12. User interface

**Editor (`CodingQuestionEditor`, lazy)**

- Radio group «طريقة التصحيح الرسمي» with «يدوي بواسطة المعلم» and «تلقائي بواسطة الاختبارات المخفية».
- The mode is stored under the private `answer`.
- Switching modes never deletes hidden tests, the comparator or reference solutions.
- **Automatic mode:** «الاختبارات المخفية لا تظهر للطالب، ويتم احتساب العلامة على الخادم بواسطة محرك التنفيذ المعزول.»
  - Also shows the hidden-test count, the total weight and the comparator.
  - Hint when no tests exist: «أضف اختبارًا مخفيًا واحدًا على الأقل…».
- **Manual mode with hidden tests:** a notice that they are not used for the official mark.
- **Reference solutions:** «مساعدة للمعلم فقط؛ لا تُرسل إلى الطالب ولا إلى محرك التنفيذ، ولا يُصحَّح بمقارنة نص الكود بها».
- The inspector line «طريقة التقييم الحالية: مراجعة يدوية» was replaced by «طريقة التصحيح الرسمي: …». The 17A test was
  updated deliberately.

**Teacher review (`AssignmentReview` → `CodingAutoGradeBlock`)**

- «التصحيح الآلي» block showing:
  - state: «مكتمل», «جارٍ التصحيح الآلي» or «تعذر التصحيح الآلي لأسباب تقنية»;
  - «العلامة الآلية: x / max», comparator and test count;
  - per-test rows: title or id, ناجح / فاشل, status, weight, duration, plus for failures the expected output (from the
    snapshot) and the bounded actual and stderr previews;
  - the compile-error preview.
- A technical failure never says «إجابة خاطئة».
- Buttons «إعادة التصحيح الآلي» and «فرض إعادة التصحيح الآلي» post identifiers only, then reload.
- The existing manual controls are unchanged: teacher mark, comment, «استخدم العلامة الآلية».

**Student (`StudentExamPage`)**

- When `autoGradingPending` is true: «تم تسليم الامتحان بنجاح. جارٍ استكمال التصحيح الآلي لأسئلة البرمجة.»
- Student responses carry only this boolean. They carry no tests, evidence, job ids, keys or technical codes (secrecy suite).

**Gradebook.** Rows use the existing grading-status resolver: `pendingReview` until final. Results rows and the latest result
also carry `autoGradingPending: true` while pending. The optional badge «تصحيح برمجي جارٍ» was **not** added; the bundle
headroom was kept instead.

**Bundle.** The initial JS graph went from 127,554 B (baseline) to 127,545 B gzip. The budget of 125 KB is unchanged.
The new UI lives in the lazy Teacher Platform and coding chunks.

---

## 13. Notifications, achievements, audit, observability

**Notification.** When an automatic result turns an attempt from `pendingReview` to final, ONE `assignment_reviewed` event is
recorded with `automatic: true`. It is deduped by `coding-autograde-final:<assignment>:<attempt>`. The frontend presents it
as «اكتمل تصحيح واجبك».

**Achievement.** On the same transition, `recordAchievementIfEligible` runs. It is create-only, so a duplicate callback adds
no second feed post (E2).

**Audit actions.** `coding.autoGrade.dispatched`, `coding.autoGrade.completed`, `coding.autoGrade.retryable` and
`coding.autoGrade.regraded`.

- Details contain identifiers, revision, state, technical code, outcome and counts only.
- They never contain source, stdin, stdout, stderr, expected outputs or keys.

**Logs (API).** `coding.autoGrade.dispatched`, `coding.autoGrade.retryable`, `coding.autoGrade.callback.applied`,
`.callback.stale`, `.callback.duplicate`, `.callback.unauthorized`, `.callback.refused`, `.regraded`, `.regrade.requested`,
`.dispatch.failed` and `.sideEffects.failed`.

**Logs (runner).** `runner.official.accepted`, `.busy`, `.conflict`, `.completed` (status counts and duration), `.failed`,
`.callback`, `runner.callback.delivered`, `.rejected`, `.unreachable` and `.gave-up`. The runner never logs keys or bodies.

---

## 14. Configuration

| where | setting | purpose |
|---|---|---|
| API | `CODING_RUNNER_URL`, `CODING_RUNNER_HMAC_KEY` | existing 17B runner seam (request signing) |
| API | `CODING_GRADING_CALLBACK_HMAC_KEY` | **new** — verifies callbacks; must differ from `CODING_RUNNER_HMAC_KEY` (checked on the raw secrets, whatever the runner URL or kill switch) |
| Runner | `RUNNER_HMAC_KEY` | existing — verifies API requests |
| Runner | `SMARTASSESS_CALLBACK_BASE_URL`, `SMARTASSESS_CALLBACK_HMAC_KEY` | **new** — fixed callback destination and key |
| Runner | `RUNNER_OFFICIAL_MAX_PENDING` (1..64, 8), `RUNNER_OFFICIAL_MAX_ACTIVE` (1..4, 1), `RUNNER_OFFICIAL_CASE_CONCURRENCY` (1..4, 2) | queue bounds |

Images are rebuilt as `smartassess-coding-<language>:17c-v1`; the official entry changed the supervisor. Keys are held in
non-enumerable properties and are never logged. Tests use TEST keys only.

---

## 15. Tests and evidence

**Fail-first at `543fa9f`.** The output is recorded in the PR body.

| suite | result |
|---|---|
| 17C vitest (model, lifecycle, secrecy, guards, UI) | 67 failed / 10 passed (77) |
| runner official unit | 11 / 11 failed |
| Docker official | 9 / 9 failed |

The 10 baseline passes are invariant pins: manual mode, existing validation codes, `gradeExam` synchronous, coding not
compound-capable, sanitizer and practice separation, no student message without pending grading, and D4 manual mode.

**Test groups**

| group | file | covers |
|---|---|---|
| 17C-A/B | `api/tests/coding-17c-model.test.js` | modes, gates, comparator scoring, technical results, rounding, token map |
| 17C-C | `api/tests/coding-17c-secrecy.test.js` | exact runner request + canary scan + signature check; student GET/POST/dashboard; sanitizer; practice untouched; logs |
| 17C-D | `api/tests/coding-17c-lifecycle.test.js` D1–D10 | all four writers, runner down, no-answer, manual/legacy, CAS retry, crash-after-commit recovery |
| 17C-E | same file, E1–E10, E8b, auth, regrade | scoring, idempotency, stale, override, retry, infrastructure ≠ zero, forged score, compile error, HMAC, malformed, unknown job, unconfigured, regrade body |
| guards | `api/tests/coding-guards-17c.test.js` | no execution primitive in the API; signed seam only; own callback key; one rebuild + parity; sync engine; not compound; runner boundaries |
| 17C-F | `runner/tests/unit/official.rtest.js` F1–F11 | strict request; queue dedupe/conflict/busy/cache; job wall; internal ≠ student; raw-runtime authority; compile once + fresh per case + hardened argv + `rm -f`; framing; HTTP; callback config/delivery/body |
| 17C-G | `runner/tests/docker-official/official-grading.rtest.js` G1–G8 | real Docker: Python/Java/C#; stdout spoofing; cross-case isolation; limits; cleanup and no host write; **end-to-end through the real API handlers** |
| 17C-H | `src/coding/codingGrading.17c.test.tsx` | editor mode control, review block, retry/force, student pending message |

---

## 16. Mutations

Each mutation was applied, its killing test run, then the file restored byte-for-byte. The tree fingerprint was identical
before and after every mutation.

| # | mutation | killed by |
|---|---|---|
| M1 | trust stdout (`"status":"success"` in stdout ⇒ success) | F5 raw-runtime authority |
| M2 | leak `expectedOutput` into the runner request | 17C-C exact shape + canary scan |
| M3 | trust a runner-supplied score | E8b (apply ignores score fields); E8 refuses them at validation |
| M4 | infrastructure failure becomes a zero | E7 |
| M5 | remove the grading-key / stale check | E4 |
| M6 | erase the manual override on callback | E5 |
| M7 | reuse one runtime container across cases | F6 |
| M8 | remove callback HMAC verification | callback authentication suite |
| M9 | local execution in the API (`child_process`) | 17C guards + 17B global guard |
| M10 | remove runtime container cleanup | F6 (`rm -f` per container) |

M3 survived its first run: the strict validator made the mutated read unreachable. E8b now calls the apply step directly
with a forged score and kills it.

---

## 17. Security review gates

Every question is answered **NO**.

| question | answer |
|---|---|
| Can student stdout, stderr or exit behaviour claim a pass, score or status the gateway did not observe? | **NO** |
| Can any in-container process report the official status or score? | **NO** — no reporter survives `execve` |
| Does the runner receive expected outputs, weights, titles, marks, reference solutions, identity or the exam? | **NO** |
| Can a callback carry a score that is used? | **NO** |
| Can an unauthenticated, wrong-key, runner-key-signed, tampered, stale or wrong-path callback mutate anything? | **NO** |
| Can a stale, foreign or old-revision result be applied? | **NO** |
| Is an infrastructure failure ever turned into a zero? | **NO** |
| Can a manual override be erased by automatic grading? | **NO** |
| Does the API ever execute student code or fall back locally? | **NO** |
| Is any external request made inside a storage mutation callback? | **NO** |
| Can a runtime container be reused across hidden cases, or left behind? | **NO** |
| Can the client choose the image, command, entrypoint, flags, mounts, env, network, user or callback URL? | **NO** |
| Do browser responses expose hidden tests, evidence, job ids, keys or technical codes to students? | **NO** |
| Are code, stdin, stdout, stderr, hidden data or keys logged? | **NO** |
| Was the 17B hardening or the runtime memory ceiling weakened? | **NO** |
| Was the bundle budget raised? | **NO** |

---

## 18. Operations runbook

**Enable.** Order matters.

1. Build the `17c-v1` images on the runner host.
2. Set the callback base URL and key on the runner.
3. Set the same callback key as `CODING_GRADING_CALLBACK_HMAC_KEY` in the Function App.
4. Restart the gateway.

Until both sides are configured, automatic targets stay `retryable · EXECUTION_UNAVAILABLE` and are graded manually.

**Stuck targets.** A target stuck in `dispatched` has an exhausted or lost callback. Use «إعادة التصحيح الآلي»: it re-dispatches
the same job id, and the runner re-delivers from its one-hour cache or re-runs. A `retryable` target needs the same action.

**Rotate keys.** Change both sides together. Callbacks in flight with the old key get `401`; the runner treats that as final,
so retry from the review page afterwards.

**Disable.** Unset the runner callback configuration (`503 GRADING_UNAVAILABLE`) or the API callback key. New targets become
`retryable`; nothing is ever scored zero.

**Stop new runner traffic only (incident response).** Set `CODING_RUNNER_ENABLED=false` in the Function App. New dispatch
and teacher retries become `retryable · EXECUTION_UNAVAILABLE`, but a correctly separated callback key still authenticates
results of jobs that were already dispatched, so outstanding work can still land. Never "fix" an outage by giving both
directions the same key: equal keys always make the callback route answer `503`.

---

## 19. Phase 17D handoff

- **Automatic re-dispatch.** Add a durable sweeper (timer trigger or queue) for `pending`, `retryable` and stale
  `dispatched` targets. It must use bounded backoff and reuse `ensureCodingGradingJobs`, which is idempotent.
  *Delivered in Phase 17D-A* as an HTTP-triggered Recovery Engine driven by a GitHub Actions schedule (the managed Functions
  host is HTTP-only), together with the gradebook badges and bulk retry below — see
  [`enterprise-coding-assessment-17d-a.md`](enterprise-coding-assessment-17d-a.md).
- **Callback nonce store.** Close the ±300 s replay window for same-job `failed` re-delivery (§9).
- **Stronger isolation.** gVisor or Kata runtime, and per-tenant runner hosts.
- **Gradebook.** The «تصحيح برمجي جارٍ» badge, plus bulk retry per assignment.
- **Evidence retention.** Per-test evidence retention and redaction policy; evidence export.
- **Product scope.** Teacher preview runs of hidden tests against reference solutions, partial credit per test, and per-test
  limits.
- **Scale.** Multi-instance gateway: a shared replay guard and a shared official result cache.

---

## 20. Independent Security Review Fix 1 — HMAC key separation

**Root cause.** At `68afc136` the callback route refused equal keys only when the runner configuration parsed as enabled:

```js
const runner = readCodingRunnerConfig(env);
if (runner.enabled && runner.key === key) return null;
```

When the runner configuration was disabled, incomplete or malformed, `enabled` was `false` and equality was never checked.
Examples: `CODING_RUNNER_ENABLED=false`, a missing `CODING_RUNNER_URL`, a malformed URL, a malformed kill switch.

In that state, a callback signed with the API → runner **request** key was accepted as a grading result (`200`, grade
applied). That breaks the two-key trust boundary.

**Fix (API).**

- `readRunnerSigningKey(env)` in `runner-config.js` returns the raw configured `CODING_RUNNER_HMAC_KEY` and nothing else.
  It never enables the runner, and `readCodingRunnerConfig()` is unchanged.
- `resolveCallbackKey(env)` in `hmac-key-separation.js` returns `null` when the callback key is missing or weak, **or**
  byte-for-byte equal to the raw runner key. It never trims or case-folds.
- The callback route uses only this authority.

**Fix (Runner, defense in depth).** `readGatewayConfig` refuses startup when the raw `RUNNER_HMAC_KEY` equals the raw
`SMARTASSESS_CALLBACK_HMAC_KEY`, regardless of callback URL validity. Before the fix, an equal key with an invalid or missing
URL started the gateway with official grading disabled. The error message never contains a key.

**Lifecycle separation (preserved).** Callback availability never depends on outbound runner availability. With separate
keys and `CODING_RUNNER_ENABLED=false`, an already-dispatched job's signed result is still applied (§18 incident response).

**Tests.**

| file | covers |
|---|---|
| `api/tests/coding-17c-key-separation.test.js` | K1–K7, exact-bytes equality, unsigned request, incident response and its misconfiguration variant |
| `runner/tests/unit/key-separation.rtest.js` | RK1–RK6: equal keys with valid, missing or malformed destination refused; separate keys unchanged; exact bytes |

Fail-first at `68afc136`:

- API: 11 of 17 failed. K3–K6 (8 variants) and the misconfiguration variant were `200` instead of `503`. The 2 pure-function
  tests failed because the module did not exist.
- Runner: RK2 and RK3 failed.

**Mutations.** Each was restored, and the tree fingerprint was identical before and after.

| # | mutation | killed by |
|---|---|---|
| KM1 | restore `runner.enabled && runner.key === callbackKey` | K3–K6, misconfiguration variant, pure-function tests |
| KM2 | ignore equality completely | K2–K6, misconfiguration variant |
| KM3 | reject every callback when the runner is disabled | K7, incident response, exact-bytes route test |
| KM4 | compare trimmed / lower-cased secrets | exact-bytes equality (pure + route) |
| RKM1 | runner: compare only when the callback URL parsed as enabled | RK2, RK3 |

Replay handling is unchanged: ±300 s window, a fresh request id per delivery, idempotent application, no nonce store.

