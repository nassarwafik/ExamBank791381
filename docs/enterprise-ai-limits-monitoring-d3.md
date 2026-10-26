# D3 — AI rate limits (item 5) and monitoring / alerts (item 3)

| # | Gap found by the project survey | Change |
|---|---|---|
| 5 | Only the AI exam composer (Phase 20F) had a rate limit. The **12 other routes that reach an AI provider** could be called without limit by any teacher session: a client stuck in a retry loop or a stolen token could run up the provider bill without bound. | Per-teacher distributed rate limits at route registration, plus an inventory guard that fails CI when an AI route is registered without one. |
| 3 | The API already wrote structured request logs (Roadmap #9). But nothing from the **browser** reached anyone: a crash in a student's exam page, a lazy chunk lost after a deployment, or a CSP violation (D2) existed only in that browser's console. Nothing watched production availability, and there were no alert rules. | A content-free client error and CSP channel into the API logs, a scheduled read-only production probe, and an alert runbook (`docs/operations-monitoring.md`). |

## 1. AI rate limits

`api/src/lib/ai-rate-limit.js`, `withAiRateLimit(route, policy, handler)`. It uses the same mechanism as the composer limiter:

- a token bucket per **(policy, teacher)**;
- stored in a small JSON blob, mutated with the platform's ETag compare-and-set;
- the blob name is a SHA-256 of the policy and the teacher identity, so no identity appears in names;
- process memory is never trusted.

| Policy | Budget | Routes |
|---|---|---|
| `ai-general` | 120 requests / 10 min, refilling continuously | ai-question-author, ai-scenario-author, analyze-global-exam-instruction, classify-question-preview, exam-quality-fix, interpret-exam-request, question-ai-action, structured-exam-ai-fix, teacher-analytics-ai |
| `ai-bulk` | 20 requests / hour | import-analyze (one PDF = one request fanning out to many provider calls), classify-bank-batch |
| `ai-image` | 30 requests / hour | generate-question-image |
| *(own)* | 40 provider calls / 10 min | ai-exam-composer, unchanged (Phase 20F) |

**Behaviour:**

- **Unauthenticated:** the request passes straight to the handler, which answers its own 401. The bucket is not touched.
- **Within budget:** the handler runs unchanged.
- **Exhausted:** the route answers **429** `RATE_LIMITED` with the real `Retry-After`, an Arabic message the client shows as
  is, and `no-store`. No handler code runs and no provider is called.
- **Storage failure:** the call **fails closed** with 503 `AI_UNAVAILABLE` and no provider call.

Both refusals are logged (`ai.rate_limited`, `ai.rate_limit.unavailable`) with the route and policy, never the teacher identity.

The budgets are far above manual use. Every one of these routes is one click per request, and no client calls them in a loop
(checked: the import wizard sends one request per PDF, and the structured fix sends one request per question the teacher opens).

**Registration, not handler code.** Each handler body and its tests are unchanged.

- The wrapper sits inside `withObservability` where present, so the 429 is a normal `http.request.completed` with status 429.
- `teacher-analytics-ai` is the exception: there the wrapper sits outside, because an observability guard pins that route's
  exact registration text. The wrapper then logs its own throttling event.

**Guard.** `api/tests/ai-rate-limit-d3.test.js`:

1. It discovers the registered routes from the real `app.http` registrations, and finds the AI routes from the source (any
   function module that reaches an AI client).
2. It requires that set to equal the classified list, and each route to be wrapped with its policy.
3. It then calls **each real registered handler**:
   - with a teacher session whose bucket is exhausted: the answer must be 429 before any handler code;
   - with budget left: the handler must run and spend exactly one token of its own policy.

A future AI route without a limit fails CI by name.

## 2. Monitoring

**Client error and CSP reports.**

- **Browser side:** `src/observability/clientErrorReporter.ts` is installed in `main.tsx`. It is also called by the root
  `ErrorBoundary` (area `app`) and the exam `QuestionErrorBoundary` (area `exam-question`). It reports:
  - uncaught errors and unhandled rejections;
  - render errors and lazy-chunk failures caught by those boundaries;
  - `securitypolicyviolation` events.
- **Server side:** `POST /api/client-error-report` (`api/src/functions/client-error-report.js`) turns a report into one
  `client.error` or `client.csp_violation` log event.

**Privacy** is the ErrorBoundary rule extended to the wire. A report carries:

- a fixed kind;
- an allowlisted error-class name (anything else becomes `Error`);
- the code location inside the app's own bundle, as a same-origin `/assets/` path plus line and column. Another origin, an
  extension, a query string or a `..` path loses the location;
- a coarse area;
- the build id (the entry chunk's hash);
- for CSP, the directive and only an origin or keyword of what was blocked.

It never carries a message, stack, component tree, URL query, answer or identity. The server re-validates every field
against the same allowlists, so a crafted report cannot put data into the logs.

**Who and how much:**

- only a session holder can report: a teacher or student token, checked statelessly with no storage I/O. Anonymous callers
  get 401, and the route inventory guard still holds;
- the browser sends at most 5 reports per page load, deduplicated, never retried, never thrown into the app;
- the server accepts at most 30 per user per 10 minutes per instance (in-memory, log-volume bound only) and returns 413 for
  bodies over 2 KB.

**Production probe.** `.github/workflows/production-health.yml` runs `scripts/production-health-check.mjs` every 30 minutes. It
makes two read-only GET requests:

- `/api/health` must return 200 with `{ ok: true, service }` within 10 s;
- `/` must return 200 with the app shell, the D2 CSP meta and the D2 security headers.

Each check is retried once after 20 s. There is no login, no write, no load and no secret. A failed scheduled run notifies
the owner through GitHub. The probe ran against production during development: **2 / 2 PASS**. That run also confirmed D2 is
live: all six headers and the CSP meta are served, and the headers apply to static content only, not to `/api/*`, as designed.

**Alert runbook.** `docs/operations-monitoring.md` covers:

- enabling Application Insights;
- five log-search alert rules (API failures, client error spike, CSP violations, AI throttling, limiter storage failure);
- an availability test;
- triage queries.

## 3. Limitations

- **The limits are per teacher identity.** In the legacy single-password mode every teacher shares one identity, and
  therefore one budget per policy, consistent with the single-teacher model in `README.md`.
- **Budgets are constants in code**, so changing one is a reviewed PR. The values are a judgement of normal use, not
  measured traffic. `ai.rate_limited` events will show whether they bite.
- **Client reports need a signed-in session.** Errors on the sign-in page itself are not reported, because the route has no
  anonymous access by design.
- **Application Insights, the alert rules and GitHub notifications** are owner settings. Until they are on, the events are
  only in the host's live log stream, and only the GitHub probe alerts.

## 4. Evidence

See the PR: fail-first on the baseline, the D3 unit and guard tests, the mutation campaign, the production probe run and
exact-head CI.
