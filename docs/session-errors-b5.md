# Batch 5 — expired sessions, request error text, finalize backoff

Three defects from the full-project audit in what a teacher or a student sees when a request fails. Fixes only; no new feature, no API change.

## F1 — an expired teacher session left the teacher inside the app

**Defect.** Eight teacher pages outside `TeacherPlatform` / `App` had their own copy of a JSON request helper:
- assignments, assignment review, exam bank, projects;
- dashboard, question import, audit history, smart structured import.

None of the copies treated a `401` specially. When the session expired, the teacher stayed signed in. Every action then failed with the server's English `Unauthorized`, and nothing said that signing in again was the fix.

**Fix.** `src/teacherFetch.ts` is the one helper those pages now use (`teacherFetchJson`). On a `401` it:
- announces `TEACHER_SESSION_EXPIRED_EVENT` (`eb:teacher-session-expired`) once;
- fails with the Arabic session-expired text.

`App` listens for the event and signs a **teacher** session out, as its own `apiRequest` already did on a `401`. A student session ignores the event. The assignment review's regrade call has its own request code, so it announces the same event on a `401`.

## F2 — browser, parser and English text shown to users

**Defect.** The request helpers parsed the body before looking at the status. Each then showed whatever came back:
- the browser's error on a dropped connection: `Failed to fetch` / `Load failed`;
- the JSON parser's error on a gateway HTML page: `Unexpected token '<' … is not valid JSON`;
- the server's English message, where one exists.

For a student, a `401` with a non-JSON body never reached the logout, because the parse threw first.

**Fix.** `src/userFacingErrors.ts` holds the Arabic texts and the rule:
- an Arabic server message is shown;
- otherwise a `5xx` gets the "server unavailable" text, and anything else gets the caller's Arabic fallback.

`safeJson` reads a body without throwing, and `errorText` turns a caught value into Arabic text.

The helpers read the status first, and a network failure becomes the Arabic connection text:
- `teacherFetchJson`, plus `App.apiRequest`;
- the exam page's `subApi` and `fetchExamBody`;
- the student portal's five request sites.

A cancelled request (`AbortError`) still passes through unchanged. On the exam page, a network failure stays a plain `Error`, so the existing retry and offline paths treat it exactly as before. Tracking codes on unexpected statuses are kept.

## F3 — a failing timeout finalize was re-sent every second

**Defect.** After a timed attempt's time ran out, the exam page sent `finalizeTimedOutAttempt` on every tick of its one-second timer for as long as the server kept failing while the browser was online.

**Fix.** Each failure backs off: 2 s, 4 s, 8 s … capped at 30 s. A success resets the backoff, and so does the browser coming back online, so the retry is immediate after a reconnect. The backoff runs on the monotonic clock (`performance.now()`), so a changed system clock can neither stall it nor rush it. The page's existing `Date.now()` use, which the UX-7b source guards pin, is unchanged.

## Tests

| File | What |
|---|---|
| `src/sessionExpiry.b5.test.tsx` (2, real `App`) | A `401` on the exam bank signs the teacher out, back to the sign-in form, and `Unauthorized` is never shown. A valid session still loads the bank (pin) |
| `src/studentErrors.b5.test.tsx` (7, real `StudentExamPage` / `StudentPortal`) | Exam page: a dropped connection and a `502` HTML page show Arabic text; a non-JSON `401` logs the student out. Portal: a dropped connection shows Arabic text; a non-JSON `401` logs out. Finalize: at most 2 sends in 4.5 s of errors; a reconnect retries within 1.2 s |
| `src/teacherFetch.test.ts` (6) | Headers (both token headers, JSON content type, a binary body keeps its own); `401` announces once (JSON and non-JSON); the message rules; network and abort; `errorText` / `userFacingMessage` |

**Updated deliberately:** `src/TeacherDashboard.test.tsx`. The helper now passes a `Headers` object, so the test reads the request headers through `new Headers(init.headers)`. The asserted values are unchanged.

**Fail-first** on `56ce0972`: the two behaviour files (9 tests) were run before the fix existed. **7 of 8 behaviour tests fail**, and the bank pin passes. The reconnect test was added after that run, so it is not counted as fail-first; mutant F2 proves it. The new-module unit file cannot run on the baseline, so it is not counted.

| Defect | Failing assertion on the baseline |
|---|---|
| F1 (1) | the teacher stays signed in: the wait for the sign-in form times out |
| F2 (5) | `Failed to fetch` and `Unexpected token '<'` are shown instead of the Arabic text; `onLogout` is never called on a non-JSON `401` (exam page and portal) |
| F3 (1) | `expected 6 to be less than or equal to 2` |

## Mutation proof

Each mutant was applied, the relevant suites were run, and the file was restored byte-for-byte. The restore was hash-verified (`sha256sum -c`, all OK) and the tree was clean afterwards. **14 / 14 KILLED.**

| Id | Planted defect | Killed by |
|---|---|---|
| T1 | a `401` does not announce the expired session | `401` announce tests (JSON and non-JSON) |
| T2 | a dropped connection shows the browser text | network / abort test |
| T3 | the body is parsed before the status | non-JSON `401` test; message-rules test |
| U1 | English server text is shown | message-rules test; `errorText` test |
| U2 | `errorText` shows browser / parser text | `errorText` test; portal network test |
| A1 | `App` ignores the expired-session event | bank `401` sign-out test |
| B1 | the bank keeps its old helper | bank `401` sign-out test |
| S1 | exam page: body parsed before the status | `502` HTML test; non-JSON `401` test |
| S2 | exam page: a dropped connection shows the browser text | exam-page network test |
| S3 | exam page: no Arabic server-error text | `502` HTML test |
| P1 | portal: the dashboard shows browser text | portal network test |
| P2 | portal: the dashboard body is parsed before the status | portal `401` test |
| F1 | finalize: no backoff | backoff test; reconnect test |
| F2 | finalize: a reconnect keeps the backoff | reconnect test |

## Known limits

- The pages inside `TeacherPlatform` keep their own request code, which already signed the teacher out on a `401`. This batch did not change them.
- An Arabic message from the server is shown as is. The rule only replaces non-Arabic or missing text.
- The finalize backoff resets on a reload, as before: the attempt record on the server, not the page, decides when the attempt is closed.
