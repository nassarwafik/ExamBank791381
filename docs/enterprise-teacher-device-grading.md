# Teacher-device grading of C# and Python answers («صحّح على جهازي»)

> Phase record. Owner decision 2026-11-23: after the students answer, the teacher grades the **C#** coding answers **on their own
> computer** — one student («صحّح على جهازي») or every student («صحّح جميع الطلاب على جهازي») — instead of starting the Coding Runner VM.
> Agreed details: a time-out on the teacher's device stays **«قيد المراجعة»** (never lost marks); the Runner stays as the fallback.

## 1. The rule that does not change

**The device executes. The server decides the grade.** Exactly as with the Runner (Phase 17C):

| Step | Who | What |
|---|---|---|
| Job | API → teacher's page | For each open C# target: the stored answer's source (coding@3: rebuilt on the server from the published template), the cases as `{ token, stdin }` in snapshot order, the question's time limit, and an opaque **ticket** bound to the target's grading key. **Never** expected outputs, weights, titles, marks, job ids or grading keys. |
| Run | teacher's computer | The on-device C# lab (`/csharp-lab/`, sandboxed opaque-origin iframe). A **fresh runtime per answer** (`fresh: true` on its first case), each case run once with its stdin, no course library (the same program the Runner grades). |
| Evidence | teacher's page → API | Raw evidence only: compile status, per case `{ token, status, stdout, stderr, durationMs }`, within the Runner callback's exact byte bounds (the same validator). |
| Grade | API | Re-derives the authority (target → revision → grading key recomputed from the stored answer and the snapshot), compares and weights with `evaluateOfficialCodingRun`, scores and applies with **`scoreCompleteEvidence`** — the function the Runner callback uses (extracted from `applyOfficialCallback`, behaviour unchanged: the 17C / 17E / 17F / 20D suites pass untouched). |

## 2. Safety

- **One application per revision.** The device result is applied under the target's own job id. Whichever reports first — the teacher's
  device or the Runner — applies; the other gets «already applied» and changes nothing. A force regrade makes a new revision; an old
  ticket is `409 STALE_RESULT`.
- **Fail safe (nothing written, `422`)** for evidence the device cannot vouch for: a case that timed out, hit the output limit or failed
  inside the lab; a case longer than the question's time limit, or without a duration; a runtime error raised by the browser runtime
  itself (`PlatformNotSupportedException`); a compile error under any policy except coding@2+ «manualReview» (which only sends the
  answer to the teacher); any language other than C#. The answer stays «قيد المراجعة»: the teacher grades it by hand or with the Runner.
  The teacher's page does not even send such evidence (it checks the same rules first).
- **Isolation between students.** Each student's answer starts in a new .NET runtime, so nothing one program leaves in the process is met
  by another student's program (the lab smoke shows the leak without `fresh` and its absence with it).
- **Hidden inputs stay on the teacher's computer.** The lab worker is SEALED after boot (#699, `tools/csharp-lab/wwwroot/worker.js`): every
  network, storage and sub-worker entry point throws, so a student's program cannot send its input anywhere — the lab smoke checks
  that a request started by a program never arrives (the page's CSP alone was not enough in Chrome). A fresh runtime boots sealed too.
  Expected outputs never reach the device at all.
- **Desktop only** (owner decision 2026-11-23, as for the lab itself): the two buttons appear only on a wide screen with a precise pointer.
- **Access.** Same as «إعادة المحاولة»: a teacher session, the `assignments.grading.grade` capability (`coding-grading.js` `*`), and
  the class tenancy check (another teacher's class is reported as not found). Audited as `coding.deviceGrade.completed` under the
  teacher's id; the result records `engine: "teacher-device-v1"`.
- **Manual override still wins** (the canonical rebuild is unchanged).

## 3. Known limits

- **C# only** (the lab's compiler). Python and Java answers are skipped and counted; they still need the Runner.
- **Memory limit** is not enforced on the device. **Time** is measured by the lab (the program's own run time, compile excluded) and
  compared with the question's limit by the page and again by the server; a slower device can only make an answer «قيد المراجعة»,
  never give it marks it would not get.
- Behaviour differences between the lab and the Runner's .NET (for example an API the browser cannot offer) are routed to review, not scored.

## 4. Files

`api/src/lib/coding/device-grading.js` (list, jobs, apply) · `api/src/functions/coding-grading.js` (`GET/POST /api/coding/device-grading`)
· `api/src/lib/coding/official-grading.js` (`scoreCompleteEvidence`) · `src/coding/deviceGrading.ts` · `src/assignments/Gradebook.tsx`
· `src/assignments/useAssignmentsController.ts` · `src/studentTools/deviceCSharpLab.ts` (`fresh`, `durationMs`) · `tools/csharp-lab/wwwroot/main.js`
· `tools/csharp-lab/smoke.mjs` · tests `api/tests/coding-device-grading.test.js`, `src/coding/deviceGrading.test.ts`,
`src/assignments/Gradebook.deviceGrading.test.tsx`, `src/AssignmentsPanel.deviceGrading.test.tsx`, `src/studentTools/deviceCSharpLab.t15.test.tsx`.

## 5. Python (Python phase 2, owner decision 2026-11-23)

Python answers (`python@1`) take the **same** path:
- **Jobs and evidence:** the same jobs, ticket and evidence validator.
- **Scoring:** the same `scoreCompleteEvidence`.
- **Refusals:** the same ones as for C#.
- **Runtime:** the on-device Python lab (`/python-lab/`, CPython 3.13 like the Runner, a fresh interpreter per answer, sealed worker).

**Browser-caused runtime errors are refused (`422`, nothing written).** `BROWSER_LIMIT` covers both languages:
- C#'s `PlatformNotSupportedException`;
- Python's «can't start new thread»;
- «Function not implemented»;
- an Emscripten / Pyodide limit.

**Java** still has no device lab: its answers are skipped and counted, and wait for the Runner.
