# Phase 17A — Enterprise Coding Assessment Engine Core

Versioned coding questions, a dependency-free code editor, the test-case model, a secure execution boundary, and
submission & review. Branch `feature/17a-enterprise-coding-assessment-engine`, baseline `origin/main` =
`7af619a4ba86f34875f4457f334d5f87e4244ed7` (merge of PR #230).

## 1. Product objective

Teachers can author **programming questions** in any subject and students can answer with **source code**. The
answer is autosaved, restored, submitted and reviewed through the existing exam pipeline.

17A deliberately does **not** run code. It establishes the complete authoring, response, persistence, review,
validation and execution-provider architecture. Phase 17B attaches isolated execution workers to it without
redesigning anything below.

Student code is **never** executed by the application: not in Azure Functions, not in the browser, not in a test fake.

## 2. One generic type: `coding@1`

| field | value |
|---|---|
| key / version | `coding` / `1` (17th production type; catalog 16 → 17) |
| label | «برمجة / كتابة كود» |
| category | interactive («تفاعلي») |
| designed grading mode | `hybrid` — manual marks always remain possible; automatic weighted grading arrives with a trusted executor |
| capabilities | `manualGrading`, `hybridGrading`, `partialCredit`, `interactive`, `offline` (editing / autosave only); `autoGrading: false`, `compoundPart: false` (V1) |
| response kinds | `["code"]` |

The palette replaces the generic grading chip for this type with the factual «تصحيح يدوي حاليًا» and «إجابة برمجية»
chips. It never shows «تصحيح تلقائي». Offline means the answer can be written and restored offline; execution is a
separate, provider-reported capability.

There are **no per-language types** (`pythonQuestion`, `javaQuestion`, …). Language is data.

## 3. Coding Language Registry (`src/codingQuestion.ts`)

The registry is pure, frozen and domain-neutral.

```ts
type CodingLanguageDefinition = {
  key; version; label; extension; editorLanguage; indentUnit;
  capabilities: { compile; run; stdin; tests };
};
```

> **Coding Assessment V1 intentionally supports only Python, Java and C#. JavaScript, TypeScript, C++, SQL and other
> languages are not registered and fail closed.**

| Key | Language | ext | indent | compile | run / stdin / tests |
|---|---|---|---|---|---|
| `python` | Python | .py | 4 | – | ✓ |
| `java` | Java | .java | 4 | ✓ | ✓ |
| `csharp` | C# | .cs | 4 | ✓ | ✓ |

**Fail closed for any unregistered key** (`javascript`, `typescript`, `cpp`, `sql`, `ruby`, …):
- **Finalization** blocks it with `CODING_LANGUAGE_UNKNOWN`. There is no silent migration and no fallback to Python.
- **The student projection** drops the key and its starter code.
- **Server answer ingestion** refuses it (`CODE_ANSWER_INVALID`). It accepts only `python@1`, `java@1` and
  `csharp@1`; any other key or contract version is refused.

The registry stays data-driven, so a language is added later through a reviewed change to `CODING_LANGUAGES`, never by
branching on a key.

- **Two identities, never confused.** The question type `coding@1` versions SmartAssess behaviour. The language
  identity is `language` key + language **contract** version (`languageVersion: 1`), and it is persisted in every
  answer.
- **No runtime versions.** Toolchain / runtime versions (an interpreter or compiler release) are **not** promised in
  17A. They belong to the execution provider's capability response (17B). This is guard-tested.
- **Capabilities describe the contract, not availability.** `capabilities` say what the stdin/stdout program model can
  mean for a language. Whether a provider actually offers that language is a separate, provider-reported fact.
- **Generic capability check.** `CODING_TESTS_UNSUPPORTED_FOR_LANGUAGE` is a future-proof rule for any registered language
  whose contract lacks stdin/stdout program semantics. No V1 language triggers it, and there is no V1 manual-review
  exception for any unregistered language.
- **No language branches.** Nothing branches on a language literal (`language === "python"`). This is guard-tested.
  Indentation comes from registry data.

## 4. Public vs private data

```
question.coding   (PUBLIC — reaches the student, rebuilt through an allow-list projection)
  allowedLanguages: string[]       defaultLanguage: string
  starterCode?: { [language]: string }
  taskMode: "program"  inputMode: "stdin"  outputMode: "stdout"
  limits: { sourceBytes, outputBytes, timeMs, memoryMb }
  publicTests?: [{ id, title?, input, sampleOutput? }]

question.answer   (PRIVATE — blanked for students by the universal sanitizer)
  hiddenTests?: [{ id, title?, input, expectedOutput, weight }]
  comparator?: "exact" | "trimTrailingWhitespace" | "normalizeWhitespace"
  referenceSolutions?: { [language]: string }
```

**Why `sampleOutput` and not `expectedOutput`.** The canonical secret-key policy (shared client/server, parity-pinned)
treats every key containing `expected` as secret and strips it from student data. Public sample output is therefore
named `sampleOutput`; the policy was **not** weakened.

**Defense in depth.** Hidden tests and reference solutions sit under `answer`, which the student sanitizer blanks.
In addition, `projectCodingConfigForStudent` rebuilds the public config field by field. That projection is shared by
the server sanitizer and the client renderer, so private data smuggled into `coding` (hidden tests, weights, reference
solutions, notes, tokens) never reaches a student, the DOM or component state.

Other layers:
- A malformed config is dropped (fail closed).
- Finalization refuses unknown keys inside `coding` (`CODING_CONFIG_UNKNOWN_KEY`).
- The teacher preview's deep scrub also lists `hiddenTests` / `referenceSolutions`.

## 5. The `code` Answer

```ts
{ kind: "code"; language: string; languageVersion: number; source: string }
```

- **Additive.** Appended to the `Answer` union; the previous members are byte-identical (pinned).
- **Canonical.** The answer is the source + language identity. Execution results are never part of it: run output is
  ephemeral, and a client-sent `score` / `passed` / `testsPassed` / `stdout` is dropped by `normalizeCodeAnswer`.
- **Answered rule.** An answer counts as answered when the source has non-whitespace text. The client `answered()`
  and the server `isResponseAnswered()` mirror each other.
- **Source is text.** It is never trimmed, re-indented or re-encoded (tabs, blank lines, trailing spaces, CRLF,
  Arabic comments and emoji are preserved). The only line-ending normalization is the browser's own: a `<textarea>`
  value always uses LF. The server stores exactly what it receives.
- **Size bound: 64 KB (UTF-8 bytes, not characters).**
  - Client: the editor refuses a change above the question's `limits.sourceBytes` (≤ 64 KB) with an Arabic message,
    and a size indicator appears at 80 %.
  - Server: `normalizeDraftAnswers` drops a `code` answer above 64 KB, or a malformed one, on **every** ingest path:
    `saveDraft`, `submit` and — newly — `pauseAttempt`. Before 17A the pause path stored `b.answers` unnormalized; 17A
    closes this gap, which also bounds simulation states on pause.
  - Why 64 KB: the autosave debounce sends the whole answers map. 64 KB is large enough for any single-file exam answer
    and keeps a draft request small.

### 5a. Independent Review Fix — ingestion bound to the published coding question

Server ingestion runs on `saveDraft`, `submit` and `pauseAttempt`. It now binds every `code` answer to the
**authoritative** question that its answer id names, using the assignment's `examSnapshot` (the same snapshot the
grader uses) and the shared, pure `bindCodeAnswerToQuestion`.

A code answer is stored only when all of these hold:

| rule | refusal code |
|---|---|
| the answer id names a **coding@1** question of that exam (not another type, not an unknown id, not a different type version) | `CODE_QUESTION_MISMATCH` |
| the answer's language ∈ **that question's** `allowedLanguages` (registered languages only) | `CODE_LANGUAGE_NOT_ALLOWED` |
| UTF-8 source bytes ≤ **that question's** `limits.sourceBytes` (never above 64 KB) | `CODE_SOURCE_TOO_LARGE` |
| registered language at its exact contract version, well-formed | `CODE_ANSWER_INVALID` |

- **Compound parts.** A code answer hidden inside a compound part is dropped. Coding is not compound-capable in V1.
- **Missing or malformed exam.** Nothing is bound, so every code answer is dropped (fail closed).
- **Refusal behaviour.** Refused answers are dropped from the stored map. They never crash the save and never replace
  other answers.

## 6. Editor architecture (`src/coding/CodingEditor.tsx`)

**Decision: a dependency-free `<textarea>` editor.** CodeMirror 6 is documented as a follow-up (§16). The minimum
CodeMirror set is about 2.6 MB unpacked across six or more packages (state 440 KB, view 1.26 MB, commands 247 KB,
language 310 KB, lezer common 246 KB, highlight 100 KB, plus per-language packages). Its contenteditable model is
also hard to test reliably under happy-dom. A native textarea is the most robust screen-reader, mobile-keyboard and
IME surface, and it adds no supply-chain risk.

Behaviour:
- **One component** for student answers, teacher starter code and reference solutions. Review uses the read-only
  `CodeSourceView`.
- **Always LTR + monospace**, whatever the RTL shell around it. Horizontal scrolling stays inside the editor, so the
  exam page never overflows.
- **Line numbers** are one text node, scroll-synced (never one element per line).
- **Keys.**
  - Tab / Shift+Tab indent and outdent by the registry indent unit.
  - Enter keeps the indentation and adds one unit after `: { ( [`.
  - **Esc then Tab leaves the editor** (no keyboard trap; the hint is on screen).
- **Undo / redo.** Edits use `document.execCommand("insertText")` when supported, so the native undo stack survives.
- **Not in 17A.** No syntax highlighter, language server, autocomplete, terminal, filesystem, Git, package
  installation or AI generation.
- **Lazy only.** The editor is loaded through the registries' `lazy(() => import(...))` edges. The production bundle
  guard fails the build if any coding signature (`cx-code-input`, `cx-code-gutter`, `coding-run-unavailable`,
  `qt-editor-coding`) appears in the initial graph.
- **Performance.** 5 KB, 25 KB and ~63 KB sources render and edit through one textarea and one gutter text node
  (tested).

## 7. Student view, preview and review

- **Student response (`CodingResponse`).** One component for the exam **and** the teacher preview (`ExamPreview` uses
  the same `StudentQuestionCard`). It has:
  - a language selector (allowed languages only);
  - starter code;
  - nothing recorded until the student edits or picks a language;
  - edited code is never destroyed by a language switch;
  - «استعادة الكود الابتدائي» through the shared **ConfirmDialog** (never `window.confirm`);
  - public samples (input + sample output);
  - run area / result panel.
- **Run area.** «تشغيل» appears **only** when a trusted provider reports the selected language. In 17A no provider
  exists, so the student sees: «تشغيل الكود غير متاح حاليًا؛ يمكن حفظ الإجابة وتسليمها للمراجعة.»
- **Result statuses (future):** نجح · خطأ في الترجمة · خطأ أثناء التشغيل · انتهى الوقت · تجاوز حد المخرجات. Results
  are ephemeral, rendered as text, never stored in the Answer and never an official score. Hidden-test results are
  never shown to students.
- **Malformed / unknown config.** The student sees a safe Arabic panel (no editor, no crash). An unknown language is
  never silently converted.
- **Teacher review (`AssignmentReview`).** A code answer is rendered by `CodeSourceView`: language badge, monospace
  read-only `<pre>` with line numbers, a bounded scroll box (a long submission never stretches the page) and «نسخ الكود».
  The source is a React **text** child: no `dangerouslySetInnerHTML`, `innerHTML`, `srcdoc` or highlighter (guarded;
  an injection test proves `<script>` / `<img onerror>` stay text).
  - The teacher-side key is summarised factually: hidden-test count, comparator, reference solutions as text.
  - Manual marks stay the official authority; no new gradebook.

## 8. Teacher authoring (`CodingQuestionEditor`, lazy)

- **Inspector:** «نوع السؤال: برمجة · الإصدار: 1 · طريقة التصحيح الرسمي: يدوي بواسطة المعلم · اللغات: …» (Phase 17C replaced
  the 17A line «طريقة التقييم الحالية: مراجعة يدوية» with the explicit official grading mode — 17C doc §11).
- **Help text (since 17C):** «يكتب الطالب الكود ويسلّمه، ويمكنه تجربته على الأمثلة الظاهرة عبر محرك التنفيذ المعزول. العلامة
  الرسمية إما من المعلم، أو تُحتسب تلقائيًا على الخادم من الاختبارات المخفية.» (the 17A text said execution and automatic
  grading were not yet connected).
- **Sections:** اللغات المسموحة · اللغة الافتراضية · الكود الابتدائي · أمثلة ظاهرة للطالب · اختبارات مخفية للتصحيح
  (each row marked «مخفي عن الطالب»; weight per test) · طريقة مقارنة المخرجات · الحلول المرجعية (للمعلم فقط) ·
  حدود التنفيذ.
- **Tests:** add / edit / reorder / duplicate / delete. The **stable id** travels with its row
  (`src/coding/codingTests.ts`; never the array index).
- **Unknown stored languages** show an unsupported-language state and block finalization.
- **Type change.** Changing away from a coding question uses the existing destructive type-change confirmation. The
  canonical `changeQuestionType` drops `coding` and the whole private `answer`; identity, prompt, marks,
  assessmentMeta and media are kept.
- **History.** Duplicate, move, clone, undo / redo, save and reload preserve the exact config. No editor state is
  persisted outside canonical exam state.

## 9. Test cases and limits

| limit | value |
|---|---|
| public samples | ≤ 10 |
| hidden tests | ≤ 50 |
| input / output per test | ≤ 16 KB (UTF-8) |
| total test data | ≤ 256 KB |
| `sourceBytes` | 1 024 – 65 536 (default 65 536) |
| `outputBytes` | 1 024 – 262 144 (default 65 536) |
| `timeMs` | 250 – 10 000 (default 2 000) |
| `memoryMb` | 16 – 512 (default 256) |

- **Ids:** `/^[A-Za-z0-9_-]{1,64}$/`, unique across public **and** hidden tests.
- **Weights:** finite and ≥ 0, with a positive total when hidden tests exist. Hidden tests are **not** required: a
  manual-only question is valid.

Finalization blocks: no languages · unknown / duplicate language · default not allowed · unsupported task mode ·
invalid limits · starter code for a non-allowed language or above the source limit · invalid / duplicate test ids ·
too many / oversized tests · malformed hidden test · invalid weight / zero total · unknown comparator · reference
solution for a non-allowed language · unknown public-config key · stdin/stdout tests for a registered language without
program semantics (none in V1). Every one of
these is a blocking error, shared verbatim with the server finalization build.

## 10. Output comparison contract (`src/codingContract.ts`, pure)

| mode | semantics |
|---|---|
| `exact` | byte-for-byte |
| `trimTrailingWhitespace` (**default**) | CRLF / CR → LF; spaces / tabs at the end of each line removed; trailing newlines at the end removed. Internal spaces, leading indentation and internal blank lines are **kept** |
| `normalizeWhitespace` (explicit opt-in) | every whitespace run → one space, then trimmed |

An unknown mode never matches; there is no fuzzy or AI comparison.

`weightedPassFraction(tests, results)` is `passedWeight / totalWeight` by stable test id. It is a 17B building block
and is **not** wired to official marks.

## 11. Execution provider contract

```ts
type CodingExecutionRequest = { requestId; language; languageVersion; source; stdin; limits: { timeMs; memoryMb; outputBytes } };
type CodeExecutionResult = {
  status: "success" | "compile-error" | "runtime-error" | "timeout" | "output-limit" | "internal-error";
  stdout; stderr; exitCode?; durationMs?; memoryKb?;
};
type CodingTestResult = { testId; status; passed; output?; durationMs? };
```

Server (`api/src/lib/coding/execution-provider.js`):

- **`resolveCodingExecutionProvider(deps)`.** Returns the **UNAVAILABLE** provider in every environment. 17A ships no
  provider, and no environment variable can conjure one. Only code may inject a provider object (tests); a malformed
  injection resolves to UNAVAILABLE.
- **`codingCapabilities(provider)`.** A factual report. It forwards only registry languages as `{ key,
  languageVersion }`; unavailable → `{ available: false, languages: [] }`.
- **`runCodingExecution(provider, input)`** runs these steps in order, then normalises:

  | step | failure |
  |---|---|
  | provider available | `503 EXECUTION_UNAVAILABLE` |
  | request built field by field from an allow-list | `400 REQUEST_INVALID` |
  | language offered by the provider | `422 LANGUAGE_UNAVAILABLE` |
  | execute | a throw → `502 EXECUTION_FAILED` |

  Normalisation: unknown status → `internal-error`; output over the limit → truncated + `output-limit`;
  runner-internal fields (env, host, tokens) dropped.
- **Never** a local fallback, a fake success or a retry on the API host.
- **Minimum data.** The provider receives exactly `requestId`, `language`, `languageVersion`, `source`, `stdin` and
  `limits`. It never receives identity, email, class, auth token, the exam, other answers or hidden tests. An
  official grader will send **one** hidden test's stdin at a time.
- **Client seam.** `CodingExecutionContext` (`src/coding/codingExecution.ts`) is empty in 17A. 17B provides a service
  that calls the authenticated server route.
- **Deferred routes.** `GET /api/coding/capabilities` and `POST /api/coding/run` are **not** added in 17A. Capability
  is derived internally (none). A run route needs per-attempt context validation and rate limiting (§13), which belong
  with the executor in 17B. No unbounded execution endpoint exists.

> **Forward reference (Phase 17B).** The remote gateway provider, `GET /api/coding/capabilities`, `POST /api/coding/run`
> (practice runs only), the distributed run budget and the isolated `runner/` subtree are specified in
> [`enterprise-coding-assessment-17b.md`](enterprise-coding-assessment-17b.md). Without runner configuration the
> provider is still UNAVAILABLE (fail closed).

## 12. Security boundary — why Azure Functions never execute code

```
SmartAssess API ──(authenticated, minimal request)──▶ Execution Gateway ──▶ Isolated Worker
```

- **The API process is not a sandbox.** It holds application secrets, Azure storage credentials, auth configuration
  and production network access. `eval`, `new Function`, `node:vm`, `child_process`, `worker_threads`,
  exec / spawn / fork, dynamic `import()` / `require()` of a variable, string timers, and Docker from Functions are
  **all** forbidden.
- **Guard coverage.** `api/tests/coding-guards-17a.test.js` scans the **whole production tree** (`src/` + `api/src/`)
  plus every coding module. It also enforces:
  - no HTML sink in coding UI or review;
  - no code answer into SmartSim (and no SmartSim in coding);
  - the fake provider is never imported by production;
  - no language-literal or subject branches;
  - lazy registries.
- **The 17B worker is UNTRUSTED** with respect to the application. It must have no storage credentials, no
  application secrets, no database credentials, no unrestricted outbound network, an ephemeral filesystem,
  CPU / time / memory limits and process isolation.
- **Student code gets nothing beyond stdin/stdout.** It is never promised internet, DNS or HTTP, and gets no package
  installation (npm / pip / NuGet / Maven / apt). V1 tasks are self-contained.
- **SmartSim and Coding stay separate.** SmartSim = a teacher uploads an executable static package (sandboxed by HTTP
  CSP + iframe). Coding = a student writes source as an answer (never executed by the app). 17A changes nothing in the
  SmartSim runtime; its suites, including the real-browser isolation proof, were re-run.

## 13. Future authoritative flow (17B) and abuse model

> **Forward reference.** Phase 17B ships **practice** execution only (17B doc §1); the authoritative hidden-test flow below
> is delivered by Phase **17C** — see [`enterprise-coding-assessment-17c.md`](enterprise-coding-assessment-17c.md) (opt-in per
> question via `answer.gradingMode: "hiddenTests"`; manual stays the default). The 17B run budget is 20 runs / 5 minutes per
> student + assignment (17B doc §9).

```
student submits source
  → server loads hidden tests (private, never sent to the browser)
  → server sends source + ONE test's stdin to the trusted isolated runner
  → receives a normalised CodeExecutionResult
  → server compares stdout with the stored comparator (codingContract.compareOutput)
  → server computes the weighted fraction by stable test id → awarded marks
```

- The **runner never decides a grade**; the SmartAssess grader is the authority. A browser result is never an
  official score.
- **Rate limiting (17B):**
  - a bounded per-attempt / per-student run budget and a per-teacher preview budget;
  - one queued execution per attempt;
  - global concurrency caps at the gateway;
  - over-budget runs answer a bounded error, never queue unboundedly.

## 14. Manual grading in 17A

`coding@1` is registered in the server grading registry and returns **score 0 / `manualReview: true` for every
response**:
- whatever the response carries (`score`, `passed`, `testsPassed` are never read);
- never by comparing the source to a reference solution.

The teacher's manual marks are the official grade. The UI never claims automatic grading.

## 15. Integration (no second system)

- **Blueprint:** `dimension = questionType, ref = coding` works automatically through the live catalog.
- **Finalization:** the shared validator registry (client == generated server build: `codingQuestion.js`,
  `codingContract.js` added to `SHARED_ENTRIES`).
- **Autosave / pause / strict policy:**
  - Autosave, restore, pause / resume and submit are the existing `StudentExamPage` pipeline. There is no coding
    timer and no local storage; the existing ~800 ms debounce owns the cadence.
  - Pause / resume keeps the server-owned remaining time.
  - The strict-exit policy is not bypassed.
  - The editor does not intercept the clipboard: the exam has no clipboard restriction to bypass, and the editor adds
    none.
- **Import / Question Bank:** a coding question is an ordinary structured question (generic JSON). No AI conversion
  and no invented hidden tests; malformed configs are blocking finalization issues. The Question Bank is not
  generalised in 17A.

## 16. Known deferrals (17B and later)

Phase 17B must initially build isolated execution toolchains **only** for **Python, Java and C#** (the V1 registry).

> **Forward reference.** Delivered in Phase 17B: the isolated workers + gateway, the three toolchain images, capability
> discovery, compile / run / timeouts / memory / output limits, the run budget, observability and the authenticated run
> route — see [`enterprise-coding-assessment-17b.md`](enterprise-coding-assessment-17b.md). Hidden-test execution and
> weighted automatic grading are delivered by Phase 17C — see
> [`enterprise-coding-assessment-17c.md`](enterprise-coding-assessment-17c.md).


- **17B:**
  - isolated workers + gateway, toolchain images, language / runtime capability discovery;
  - compile, run, timeouts, memory / output limits;
  - hidden-test execution, weighted automatic grading;
  - queue, rate limits, observability, worker health;
  - the authenticated run route (§11).
- **Later:** CodeMirror 6 syntax highlighting (lazy, per-language parsers) as an optional enhancement over the
  accessible textarea; function-signature tasks, unit-test frameworks, multi-file projects (`coding-project@…`),
  database containers, browser coding projects, package allow-lists; a language dimension for the Blueprint;
  compound-part support.

## 17. Test matrix

| suite | covers |
|---|---|
| `src/coding/coding.17a.test.ts` | C1–C4, C8–C11, C15–C20, C24–C26, C35: catalog, registry, Answer, defaults, byte preservation, size bound, finalization rules, stable ids, comparator, type change, builder ops, five domains |
| `api/tests/coding-17a.test.js` | C8 / C9 server ingest (saveDraft + pause through the REAL handler), C12–C14 sanitizer, C30 / C31 grader, C33 / C34 provider contract with a deterministic fake |
| `api/tests/coding-guards-17a.test.js` | C32 + §74 guards (global no-execution scan, HTML sinks, SmartSim separation, fake provider, language / subject neutrality, lazy registries, bundle guard) |
| `src/questionTypes/coding.17a.test.tsx` | C5–C7, C27–C29, C33 / C34 UI, C35 palette, editor UX, reset via ConfirmDialog, teacher panel (languages, starter code, tests with stable ids, comparator, limits, reference solutions, undo / redo, unknown language), performance |
| `src/coding/codingAutosave.17a.test.tsx` | C21–C23 against the REAL student-submission / student-assignment handlers; strict policy and clipboard |

Five-domain evidence is covered with the same type and rules: algorithms (sorting), networking automation (network
address from IP/CIDR), mathematics (GCD), physics (v = u + a·t), data analysis (mean / median).

## 18. Mutation matrix

One mutant at a time → targeted suites (shared server build regenerated for shared-TS mutants, before and after) → revert →
tree fingerprint (md5 of `git status --short` + `git diff` + every untracked file) compared.

| id | mutation | targeted suites result | tree after revert | verdict |
|---|---|---|---|---|
| CM1 | remove `coding` from the catalog | 24 failed / 80 passed (104) | clean | **killed** |
| CM2 | allow an unknown language | 3 failed / 64 passed (67) | clean | **killed** |
| CM3 | default language outside the allowed set | 2 failed / 65 passed (67) | clean | **killed** |
| CM4 | remove the source byte limit | 3 failed / 55 passed (58) | clean | **killed** |
| CM5 | trim the source before save | 7 failed / 57 passed (64) | clean | **killed** |
| CM6 | expose hidden tests through the student projection | 2 failed / 84 passed (86) | clean | **killed** |
| CM7 | expose reference solutions through the sanitizer | 2 failed / 45 passed (47) | clean | **killed** |
| CM8 | array index as hidden-test identity | 2 failed / 65 passed (67) | clean | **killed** |
| CM9 | accept duplicate test ids | 1 failed / 38 passed (39) | clean | **killed** |
| CM10 | allow negative / non-finite weights | 1 failed / 38 passed (39) | clean | **killed** |
| CM11 | change comparator semantics | 1 failed / 38 passed (39) | clean | **killed** |
| CM12 | trust a client-reported score | 1 failed / 18 passed (19) | clean | **killed** |
| CM13 | auto score from coding@1 (source == reference) | 1 failed / 18 passed (19) | clean | **killed** |
| CM14 | `eval` for a JavaScript preview | 2 failed / 13 passed (15) | clean | **killed** |
| CM15 | execute source with `node:vm` | 2 failed / 32 passed (34) | clean | **killed** |
| CM16 | persist editor state outside the Answer (localStorage) | 1 failed / 5 passed (6) | clean | **killed** |
| CM17 | type change retains the hidden coding answer | 1 failed / 38 passed (39) | clean | **killed** |
| CM18 | coding renderer imported synchronously | 1 failed / 14 passed (15) + bundle guard failed | clean | **killed** |
| CM19 | render student source as HTML | 3 failed / 40 passed (43) | clean | **killed** |
| CM20 | provider silently falls back to local execution | 5 failed / 29 passed (34) | clean | **killed** |

**20 / 20 killed** on the final tree; fingerprint `d8381e6e9f40a5aa` → `d8381e6e9f40a5aa`. CM16 first SURVIVED: the autosave suite only spied on
`Storage.prototype.setItem`, which does not observe every implementation's writes. The test now also inspects the storage
contents themselves (no key / value carries the code), and the whole campaign was re-run on the final tree (table above).
CM18 is additionally refused by the production bundle guard (coding payload in the initial graph).

### Follow-up campaign — V1 language restriction (L-M) and ingestion binding Review Fix (RF-M)

| id | mutation | targeted suites result | tree after revert | verdict |
|---|---|---|---|---|
| L-M1 | re-register JavaScript in the V1 registry | 9 failed / 85 passed (94) | clean | **killed** |
| L-M2 | normalization accepts any regex-valid language | 3 failed / 62 passed (65) | clean | **killed** |
| L-M3 | projection keeps unregistered allowed languages | 2 failed / 63 passed (65) | clean | **killed** |
| L-M4 | projection keeps unregistered starter code | 2 failed / 63 passed (65) | clean | **killed** |
| RF-M1 | binding ignores the question's allowed languages | 3 failed / 21 passed (24) | clean | **killed** |
| RF-M2 | binding ignores the question's sourceBytes limit | 3 failed / 21 passed (24) | clean | **killed** |
| RF-M3 | binding ignores the question type / version | 2 failed / 22 passed (24) | clean | **killed** |
| RF-M4 | code answers hidden in compound parts kept | 1 failed / 23 passed (24) | clean | **killed** |
| RF-M5 | unknown answer id falls back to unbound normalization | 1 failed / 23 passed (24) | clean | **killed** |
| RF-M6 | saveDraft not bound to the exam snapshot | 1 failed / 23 passed (24) | clean | **killed** |
| RF-M7 | pauseAttempt not bound to the exam snapshot | 1 failed / 23 passed (24) | clean | **killed** |
| RF-M8 | submit not bound to the exam snapshot | 1 failed / 23 passed (24) | clean | **killed** |

**12 / 12 killed**; fingerprint `2fdc073c4da25df2` → `2fdc073c4da25df2`.
