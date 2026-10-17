# Messages — enterprise hardening (M.1 server, M.2 presentation)

Design record for the «الرسائل» surfaces: the teacher page (`src/messages/TeacherMessagesPage.tsx`), the student
view (`src/messages/StudentMessagesPage.tsx`) and their APIs (`/api/messages`, `/api/student-messages`). It builds on
Phases 5C–5E (append-only messages, sequenced ids, read markers, responsive workspace) and 8B (student card). Nothing
here changes who may message whom, the read-marker domains, or the acknowledgement rules; those stay as designed in 5D.

## 1. Problems found (audit)

| Id | Problem | Where |
|---|---|---|
| H1 | The teacher badge listed the whole direct prefix and re-downloaded every unanswered teacher message on every 15 s poll; class documents were read once per student. | `message-read-state.js`, `messages.js` |
| H2 | A reader's own trailing messages were never absorbed into its read boundary, so they were re-classified forever. | `message-read-state.js` |
| H3 | No send rate limit: one account could publish an unbounded number of messages (every surface lists the stream). | send routes |
| M3 | A retried send (timeout, network) published a second copy. | send routes, both pages |
| M5 | One unparsable blob (message, marker, user) turned a thread, badge or notification panel into a permanent 500. | stores |
| L1 | Bidi overrides / isolates, zero-width and control characters were stored as typed (spoofing, invisible text). | `message-store.js` |
| L2 | Responses carried no `Cache-Control`. | both routes |
| L3 | Contention after five publication attempts surfaced as a 500. | both routes |
| U1 | The draft was lost on every switch of student, tab or class. | teacher page |
| U2 | The roster could not be searched or filtered, and unread conversations were not surfaced first; every row repeated «نشط». | teacher page |
| U3 | Threads had no day separators or grouping; every bubble repeated the sender and the full date-time. | `MessageParts.tsx` |
| U4 | A 401 showed the raw server text; the page before a class was chosen was an empty selector only. | teacher page |

## 2. M.1 — server (commits `f9d817d`, `e936324`)

- **Own-message absorption (H2, H1):** while counting unread, positions the reader authored are recorded; a run of
  such positions directly after the reader's sequenced boundary is folded into the boundary by an ETag CAS that
  re-checks the run (`absorbIrrelevantSequenced`). It stops at the first relevant, unclassified or missing position and
  never changes a count. The student badge absorbs; the notification view stays read-only.
- **Read cache (H1):** a per-request download cache reads each class document once.
- **Rate limit (H3):** `message-rate-limit.js`. Burst and daily token buckets per sender in one CAS blob
  (`platform/throttle/messages-<sha256>.json`). Student: 8 per minute, 150 per day. Teacher: 30 per minute, 1000 per day.
  A refused send consumes nothing and returns `429 RATE_LIMITED` with `Retry-After`. A storage failure **fails closed**.
- **Idempotent sends (M3):** `message-send-key.js`. An optional `clientMessageId` (`/^[A-Za-z0-9_-]{8,64}$/`) is
  claimed create-only. A retry with the same key returns the published message (`replay: true`, with no second audit
  or push). An in-flight duplicate gets a retryable `409 SEND_IN_PROGRESS`. A pending claim older than 30 s is taken
  over by CAS. A refused or failed send releases its claim. Both pages reuse one key per composed message while the
  thread and text are unchanged.
- **Tolerant reads (M5):** an unparsable blob reads as missing (`downloadManyJsonTolerant`, markers).
- **Text normalization (L1):**
  - NFC; CRLF → LF.
  - Removed: C0 except `\n` and `\t`, C1, U+200B, U+202A–202E, U+2060–2064, U+2066–2069, U+FEFF and lone surrogates.
  - Kept: ZWNJ, ZWJ, LRM, RLM (needed by Arabic/Persian text).
  - Oversized input is refused before any per-character work.
- **`Cache-Control: no-store`** on every messages response (L2). Contention returns `503 BUSY` with `Retry-After: 1` (L3).

## 3. M.2 — presentation (this phase)

Scope: `src/messages/**` only. The state machine of the pages (generations, polling, acknowledgement, send guards) is
unchanged; the 5C–5E and 8B suites pin it and pass unmodified.

- **`threadLayout.ts` (new, pure):**
  - day labels («اليوم» / «أمس» / long Arabic date) based on the local calendar day;
  - grouping of consecutive messages from the same sender (role **and** name), on the same day, within 5 minutes;
  - initials (honorifics such as «أ.» skipped) and a stable avatar tone;
  - Arabic search folding (diacritics, tatweel, alef / yeh / teh-marbuta variants, Arabic-Indic digits);
  - `rosterView`: unread students first (more unread first), everyone else in the server's order; search and the unread
    filter only narrow the list.
- **`MessageThread`:**
  - each `<li>` is a row: an optional day separator plus one `.eb-msg-bubble`;
  - a grouped message keeps its sender label in the accessibility tree (`VisuallyHidden`), so sender identity is never
    colour-only;
  - the bubble shows the clock time, with the full date-time as the `<time>` tooltip;
  - `variant="feed"` draws announcements as full-width cards with an accent rule;
  - the day reference comes from `useTodayStart()` (a once-a-minute external store) rather than `Date.now()` during render.
- **`MessageComposer`:** Ctrl+Enter / ⌘+Enter sends. Plain Enter keeps a new line, an IME composition never sends, and
  sending stays single-flight. The hint is linked with `aria-describedby`, and the counter turns into a warning in
  the last 200 characters.
- **Teacher page:**
  - the draft is kept **per thread**, so switching student, tab or class and coming back restores it; a draft is
    dropped only when the server confirmed that exact text;
  - the roster gets a search box, an «الكل / غير المقروءة (N)» filter and decorative avatars;
  - «نشط» stays in the button's accessible name but is not drawn; معطّل / مؤرشف are drawn as chips;
  - a start card lists the active classes as quick picks, with an explanatory state when there is no class;
  - a 401 shows a session-expired sentence;
  - the announcements header has an icon.
- **Visual language:**
  - own messages are a solid primary token gradient with surface-coloured text (white on `--eb-primary` is 5.2:1 and
    the time `--eb-primary-050` is ≥ 4.5:1); the other party's are white bubbles on a `--eb-surface-2` thread;
  - the tail corner sits on the sender's side, and day separators are pills on a hairline;
  - tokens and logical properties only; no hex colours in the new section; transitions disabled under
    `prefers-reduced-motion`.

Verified in Chromium at 1360 px and 390 px against a mocked client (teacher start state, chat, announcements, phone
roster and phone chat; student chat on desktop and phone): no horizontal overflow, no console errors from the page.
These browser checks are not CI evidence; the CSS contract is pinned by source assertions.

## 4. Evidence

- `api/tests/messages-hardening-m1.test.js`, 23 cases: fail-first against `9aecbaf` (19 of the 21 initial cases
  failed there); 2 cases added after the mutation campaign.
- `src/messages/messagesPresentation.m2.test.tsx`, 15 cases: new behaviour (pins), not fail-first, because the
  presentation did not exist before.
- Mutation:
  - M.1: 17 mutants, all KILLED (MM01 and MM03 survived the first run and were killed after the strengthening above).
  - M.2: 12 mutants, all KILLED (PM12 survived the first run and was killed after the test set the search right before
    the class switch).
  - Files were hash-restored after every mutant.

## 5. Known limitations / follow-ups

- **Last-message preview and time in the roster** needs a per-teacher thread index (also the structural fix for H1:
  the badge still lists the direct prefix, now without re-downloading answered history). Planned as a separate phase.
- **History pagination** (a `before` cursor and «عرض الأقدم») is not done. Threads still load the recent window.
- **Per-class unread in the class selector** would need one summary per class, so it waits for the thread index.
- **Messages of deleted students** need cleanup tied to the student-deletion path (owned by the Classes & Students
  work); deferred until that work is merged.
- The rate limits are product numbers chosen for real conversation; the owner may tune them in
  `message-rate-limit.js`.
