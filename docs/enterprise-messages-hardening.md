# Messages — enterprise hardening (M.1 server, M.2 presentation, M.3 audit follow-ups)

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

## 3b. M.3 — follow-ups of the independent audit of the M.1/M.2 head (`57b9b838`)

The audit (read-only, against `57b9b838`) found no defect introduced by M.1. It found these remaining problems:

| Audit # | Problem | Fix (commit) |
|---|---|---|
| 1, 2 | Every badge poll recomputed everything:<br>• the teacher badge downloaded one marker per conversation on the platform, the user document of every conversation the teacher had not marked (other tenants' students) and the unread candidates;<br>• the student badge re-downloaded up to ~100 unread messages. | **ETag-validated memo** (`message-unread-memo.js`, M.3b), described below. |
| 3 | A sequenced acknowledgement through X covers every lower position, but a page showed only the newest `limit` messages. A reader with more unread replies than one page marked the older ones read without seeing them, and could never reach them (no pagination). | **Sequenced unread frontier and `before` pagination** (M.3a), described below. |
| 4 | A create whose response was lost (the storage SDK retries and gets "already exists") was treated as a lost race, and the same body was published at the next position. An ambiguous failure released the idempotency claim, so a retry published again. | **Publication stamp** (M.3a), described below. |
| 5 | A stale claim (finalize lost, or the request died after publishing) was taken over and published a second copy. | The takeover looks for the claim's stamp among the stream's newest 50 messages and **replays** that message. |
| 6 | Exhausted compare-and-set retries (limiter bucket, marker, claim) answered 500. An unparsable bucket or claim blob meant a permanent 500 for that sender or key. | **503 BUSY** with `Retry-After`, like position contention. An unparsable bucket or claim is reset **once**. `409 SEND_IN_PROGRESS` now carries `Retry-After: 2`. |
| 8 | Tag characters, soft hyphens, blank fillers (Hangul / Braille) and interlinear marks passed the text filter; a message made only of fillers was "non-empty". | Removed. U+2028 / U+2029 become new lines. |

**Sequenced unread frontier and `before` pagination (#3):**
- *Pages:* the legacy frontier rule (5D) now applies to the sequenced domain too. A page carries the reader's unread relevant sequenced messages oldest-first, up to the same bounds (100 relevant, 400 scanned). Unread relevant messages beyond that window are held back (`hasNewer`).
- *Marks:* `markStreamRead` rejects (400, no write) a sequenced boundary that would newly cover an unread relevant position outside that window. The check runs inside every compare-and-set attempt, against the marker being updated.
- *Clients:* the pages reload as soon as the shown messages are acknowledged, so held-back ones follow within one round trip.
- *Own messages:* they never spend the bound, and a window of only the reader's own messages is absorbed (M.1).
- *Older history:*
  - teacher reads accept `?before=<messageId>`; the student read accepts `?stream=direct|announcements&before=<id>`;
  - a malformed cursor is a 400;
  - «عرض الرسائل الأقدم» loads these pages; the scroll position is kept when older messages are prepended;
  - older pages are display-only and never feed an acknowledgement.

**Publication stamp (#4, #5):**
- Every new message stores `publishNonce`. It is storage-only and never part of a view.
- With an idempotency key the stamp is the claim's digest; otherwise it is random.
- On a create conflict, `createMessage` reads the position back. If it holds this request's stamp, it returns that message.
- A non-conflict upload failure is marked `publishAmbiguous`, and `publishGuarded` then keeps the claim pending instead of releasing it.

**ETag-validated memo (#1, #2):**
- It is in-memory, per container, LRU-bounded and never an authority. It follows the same construction as the 21G.2 / 21H.4 caches.
- A document is reused only while the ETag that the listing in this request reports equals the ETag it was downloaded with.
- A stream count is reused only while the stream's listing signature (every name and ETag) and the reader's marker ETag (from a listing of the reader's markers) are unchanged.
- Nothing is time-based. Any writer is seen by the next poll, including an old 5C instance, a direct storage write or a deletion.
- The teacher summary decides membership (the current user document, the class filter, tenancy) **before** counting.
- *Steady-state cost* of a poll in which nothing changed: listings only (direct namespace, the teacher's markers, users) and **zero downloads**.
- *Not memoized:*
  - the notification view, which counts from the markers it loaded for its items;
  - callers that inject their own storage functions (instrumentation, tests).

**Remaining structural item:** the teacher badge still *lists* the whole direct namespace (names only) on every poll. Removing that listing needs a durable per-conversation index, and a durable index cannot see messages written by code that does not maintain it (a rollback, an old 5C instance). The 5D tests pin that such messages are counted immediately. Relaxing that guarantee, for example to "within N minutes", is an owner decision and is **not** made here.

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

- M.3:
  - `api/tests/messages-hardening-m3.test.js`, 20 cases: 19 failed on `57b9b838`; 1 is a pin.
  - `api/tests/messages-unread-memo-m3.test.js`, 9 cases: the 3 cost cases failed on `57b9b838`; the 6 freshness and tenancy pins pass on both.
  - `src/messages/messagesHistory.m3.test.tsx`, 8 cases: new UI pins.
  - Two 5D tests pinned the #3 defect and were updated deliberately:
    - late-legacy "page smaller than the history" now shows S1 to S4 (it used to acknowledge S4 without S1 and S2 ever being shown);
    - the legacy-frontier long-stream setup now acknowledges its 101 unread messages page by page.
  - Mutation: 16 mutants (Q01–Q16), all KILLED. Q16 survived the first run and was killed after the thread-switch test also switched back.

## 5. Known limitations / follow-ups

- **Last-message preview and time in the roster**, **per-class unread in the class selector**, and dropping the
  direct-namespace listing all need the durable per-conversation index described in §3b (an owner decision on how
  quickly messages written by non-maintaining code must be counted).
- **Direct threads are keyed per student**, not per (teacher, student): a teacher who can access a student sees every
  teacher's messages with that student. This is a product decision (audit #8), unchanged.
- An ambiguous publication failure keeps the idempotency claim pending for up to 30 s, so a retry in that window answers
  `409 SEND_IN_PROGRESS` with `Retry-After` even when nothing was published.
- **Messages of deleted students** need cleanup tied to the student-deletion path (owned by the Classes & Students
  work); deferred until that work is merged.
- The rate limits are product numbers chosen for real conversation; the owner may tune them in
  `message-rate-limit.js`.
