# Classes & Students — enterprise hardening

Baseline: `8697af6df79fd539168fab072e6f30126a226f0c`. Branch: `claude/wizardly-dijkstra-4qb6vd`.

## Scope

The teacher workspace «الصفوف والطلاب» end to end: `/api/classrooms`, `/api/students`, their libraries, and the
`TeacherPlatform` students workspace (`src/students/*`). Out of scope by design: **class learning materials**
(`ClassLearningMaterialsPanel`, `class-learning-materials.js` and their handlers, which a parallel phase owns), the
assignments workspace, grading routes, the Runner.

## Decisions

### 1. Ids are blob-name segments

`classId`, `userId`, `profileUserId` and `targetClassId` must match the repository safe-id alphabet
(`/^[A-Za-z0-9_-]{1,128}$/`, the same rule as `class-assignment-index` and `assignment-results`). The storage SDK
resolves `.`/`..` segments when it builds the request URL, so a classId of `../auth/<hash>` previously reached a student's
login document (an `archive` wrote `active:false` into it: 200 on the baseline). Invalid class ids are a 400; an invalid
student id is reported exactly like an unknown student (404). In tenant mode a loaded class document whose own `classId`
differs from the requested id is also treated as missing.

### 2. Identity rename: new credential first, compensation on failure

`update` with a new identity number now creates the credential at the new path **first** (create-only), then rewrites
the student document, then deletes the old credential. A taken identity is a clean 409 with nothing changed (baseline:
the student document already claimed the new identity while its credential stayed at the old path). If the student write
fails, the new credential is removed again (ETag-conditional). The whole sequence still runs under the per-student
credential lock, and login still requires `auth.authVersion === student.authVersion`.

### 3. A concurrent move is never written back

The bulk move takes no credential lock. `update` therefore checks inside its CAS callback that the student is still in
the class the request was validated against, and returns 409 otherwise (baseline: a name edit silently moved the student
back).

### 4. Orphan credentials

Student creation writes the auth document first. If the student document write fails, the auth document is now deleted
(compensation). An existing orphan (an auth document whose student document does not exist) is reclaimed by the next
create of that identity, but only once it is older than 10 minutes, so a create that is still between its two writes is
never disturbed. The reclaim is conditional on the ETag just read and never touches a credential whose student exists.

### 5. Grading safety: `PENDING_GRADING` (product policy, owner review requested)

The gradebook, scoped review and grading routes select students by `isStudentClassMember` (same class, not archived).
Moving or archiving a student therefore hides every result of their current class from that class's teacher surfaces,
including results still awaiting the teacher and open attempts. Nothing is zeroed, but the work can no longer be graded:
an invisible "no answer". Following `AGENTS.md` §10 ("fail closed"), these operations are now **refused** with
`409 { code: "PENDING_GRADING", pendingCount }` while the student's current class has:

- a latest result whose canonical grading status is `pendingReview` (manual marks, `finalized:false`, coding hold), or
- an open attempt (`activeAttempt` with `startedAt`).

Bulk move/archive report the blocked rows as per-row errors with the same code; the other rows proceed. Disabling login
(`active:false`) keeps class membership and stays allowed; the message names it as the alternative to archiving.
Delete is unchanged (an explicit destructive action with its own confirmation). **This is a behaviour change of the
roster product; the owner may prefer a different policy** (for example letting the gradebook include former members
with submissions). The guard is isolated in `api/src/lib/pending-grading.js` so the policy can change in one place.

### 6. Smaller contract changes

- `Cache-Control: no-store` on every credential-bearing response (`create`, `bulkImport`, bulk `resetpasswords`), the
  roster GET and the profile GET.
- Bulk actions: more than 250 ids is a 400 (baseline: silently truncated while reporting success). Per-row errors only
  expose teacher-facing messages; raw storage text is logged instead.
- `toggleActive` accepts an explicit `active` boolean (idempotent); the legacy flip without it is kept for old clients.
- Audit: `student.setActive`, `student.update` (changed field names only, never identity numbers) and `class.update`.
- Identity numbers: Arabic-Indic / Persian digits are digits; any other non-separator character makes the value invalid
  instead of being stripped and zero-padded. The established short-value left-padding is unchanged.
- Names and class labels: Unicode NFC; bidi overrides, zero-width and control characters removed (ZWNJ/ZWJ kept);
  whitespace collapsed; bounded lengths (name 60, class 80, grade 40, year 20, password 6–128).
- New class `update` action (name / grade / school year): CAS, archived → 403, unchanged values write and audit nothing.

## Teacher workspace

- **Reliability:** profile responses are sequenced (a late response never opens over another student or class); bulk
  actions act only on visible selected rows; the move target resets on class switch; reloads after bulk operations are
  sequential (the roster read repairs the count index before the classes read) and a bulk move re-reads both classes.
- **Errors:** a server rejection is shown inside the open dialog (the page banner sat under the modal backdrop) and is
  cleared when the dialog closes. A 401 calls the shell logout (`onSessionExpired`); non-JSON gateway pages and network
  failures produce Arabic messages.
- **Arabic-aware text:** search folds hamza / taa marbuta / alef maqsura variants, diacritics, tatweel and Arabic digits,
  and matches every typed word. Graduation detection accepts «١٢» and «ثاني عشر». The default school year follows the
  academic calendar (from August). School years render LTR inside RTL text.
- **Features:** class details edit; class filter for long lists; «لم يدخلوا بعد» status filter; printable login cards
  and CSV for generated credentials (in memory only, never persisted); import template; semicolon / tab CSV and
  Windows-1256 decoding; password reveal toggle; dismissible notices; the bulk-delete confirmation names the students;
  provisional marks labelled «(مبدئية)».

## Visual pass

Checked in a real browser (Chromium, mocked API) at 1360px and 390px:

- **Row actions always reachable.** At a typical desktop width the roster table was wider than its pane and the row
  "⋯" menu (edit / archive / delete) sat off-screen behind a horizontal scroll. The actions column is now pinned to the
  inline end, the details action is an icon button (same accessible name «التفاصيل», the student's name as tooltip) and
  the last-login column is a short relative label, so the whole table fits.
- **Row identity.** Each row shows the student's avatar: their photo (one authenticated read per photo version, only for
  students who have one), else their preset avatar, else their initial. It is decorative (the name follows it).
- **Last login** reads «قبل 7 أيام» / «أمس» / «الآن» for 30 days, then a date; the exact time is the tooltip.
- **Quieter rows.** The reactions count is a neutral pill (it was an alert-red badge on every row); selected rows are
  tinted; archived rows have a tinted background.
- **Summary strip.** The five figures are a compact strip of buttons that filter the roster (pressed state =
  the active status filter); the `<strong>` order is unchanged.
- **Class cards.** The legacy `.class-row` column layout put "⋯" on its own line under every card; cards are rows again
  with the trigger in the corner. Archived cards keep full opacity (the legacy 62% failed text contrast).
- **Sticky header** for long classes (the table scrolls inside a bounded pane).
- **Loading skeleton** shaped like the roster, with one visually hidden status line; it stops under reduced motion.
- **Phone.** Rows become labelled cards (checkbox in the corner, fields in two columns, actions at the bottom) instead
  of a sideways-scrolling table; the legacy 620px table minimum is lifted there; the wrapped bulk bar scrolls with the
  page instead of staying sticky over the cards; the icon action keeps a 44px target.

## Validation

Fail-first: 27 of 38 API cases and all 18 workspace cases failed on the baseline (the remainder are labelled pins).
Mutation campaign: 22 mutants over the new security, grading and authority invariants, 22 KILLED (M09 initially
survived and was killed by a strengthened test). Files were restored and hash-verified after each mutant. A real-browser
check (Chromium, mocked API) found the school-year bidi and phone-header defects, both fixed.

## Known limitations / follow-ups

- **Scale:** every roster read still scans all user documents and all submission names; the profile reads one submission
  per assignment platform-wide. Per-teacher / per-class indexes and pagination are a separate architecture phase.
- **Pending-grading guard** is a check-then-act: an attempt started between the check and the move is not covered.
- **Hard delete** still leaves submissions (with denormalized student name / code) behind; a retention / cascade
  policy is an owner decision.
- **Class create** has no idempotency key (a double submit within one render tick creates two classes).
- **Password hashing** uses Node's default scrypt cost (N=16384); raising it needs a migration-free rehash-on-login plan.
- **Shared legacy data:** production should set `LEGACY_DATA_OWNER` so pre-tenancy classes are not shared by every teacher.

## Phase S.0 — display safety (the page shows only figures it has)

An audit of the page (code, a real-browser run against the real API on in-memory storage, concurrency and read-cost
probes) found that the workspace could show figures it did not have. S.0 fixes the teacher-facing part; the server
findings are planned below.

### Defects fixed

- **Another class's rows under this class's name.** A class switch kept the previous class's rows (with their counts, row
  actions, bulk move and CSV export) under the new class's header until the new roster arrived, and for good when that
  read failed. The roster load state now names its class; rows, counts and actions are rendered only once the SELECTED
  class's roster is loaded, and a switch drops the previous rows before the new read.
- **A failed read looked like an empty class.** A failed roster read showed «لا يوجد طلاب في هذا الصف بعد» with an add
  call to action and zero counts; a failed classes read showed «لا توجد صفوف نشطة بعد. أنشئ أول صف» (inviting duplicate
  classes during an outage). Both are now an error with «إعادة المحاولة» in their pane. A failed REFRESH of data already
  shown keeps it and reports the failure above the page, as before.
- **One loading flag for two reads.** The classes read and the roster read shared one flag (the last to finish won), so
  a superseded read could end the skeleton of the class still loading and show a false empty state. They now have
  separate states, and a repair-only roster read of a class that is not selected never touches the visible roster.
- **Zeros while loading.** The five count tiles and the header badge read 0 until the roster arrived; they read «—» until
  it is loaded (and after a failed read).
- **Header and class card disagreed.** The header counted archived students (the roster is read with
  `includeArchived=1`) while the class card's `studentCount` does not; the header now counts the current members and
  names the archived apart («· N مؤرشف»). The tiles still cover everyone.

### Planned next phases (from the same audit)

| Phase | Scope |
|---|---|
| S.1 | Grading safety on the server: a bulk move re-checks the student's class inside the write (409 `CONCURRENT_MOVE`); single and bulk delete, class archive and graduation honour `PENDING_GRADING`. |
| S.2 | Read cost: a roster read lists the class's members (not every user and every submission name on the platform); a per-teacher class index; the profile and the pending-grading check use the class-assignment index. |
| S.3 | Credentials and dangerous actions: warn before leaving with an unsaved credential batch, mask passwords by default, a stronger bulk-delete confirmation, an import that can be retried safely. |
| S.4 | Polish: the class filter layout, phone cards, Arabic number agreement (one shared `arabicCount`), numeric name sort, terminology, accessibility details, dead code. |

Owner decisions requested for later phases: project display titles (the registry's titles are «مشروع <code>»), hard vs
recoverable student delete, and whether graduation disables student logins.

## Phase S.1 — grading safety of the roster on the server

AGENTS.md §10 forbids a silent "no answer". Work still awaiting the teacher (a result that is not final, an open attempt)
must never disappear behind a roster change. The guard of decision 5 (`PENDING_GRADING`) covered a single move, a single
archive and the bulk move / archive rows; S.1 closes the paths the audit found open.

- **A concurrent move is never written over (bulk move and archive).** The pending-grading check runs against the class
  the request read. The user write now re-checks that class INSIDE the compare-and-set: if another request moved the
  student meanwhile, the row is `409 CONCURRENT_MOVE` (the single-student edit already did this). Previously the bulk
  move wrote the target class over the concurrent move — hiding the work of the class the student had been moved to —
  and removed the student from the wrong class index; an archive archived the student in their new class unchecked.
- **Delete honours `PENDING_GRADING`.** Single and bulk delete are refused for a member with pending work (the message
  offers disabling the account instead, as for archive). An archived student is already outside the class's gradebook
  and can still be deleted; final results never block. Just before deleting, the student is re-read: one moved
  meanwhile is refused (`409 CONCURRENT_MOVE`).
- **Class archive and graduation honour `PENDING_GRADING`.** An archived class refuses its students' submissions (an
  open attempt can no longer be handed in) and leaves the day's follow-up, so archive and graduate-and-archive are
  refused (`409`, with `pendingCount`) while a CURRENT member (canonical membership: same class, not archived) has such
  work. Former members' work is already outside the class's gradebook and never blocks; unarchive is never blocked.

Read cost: the class guard lists the users once (as `reconcileRoster` does) and reuses the pending-grading reader (one
listing of assignments and of submission names, then each member's existing submissions in this class). Archive is a
rare action; the scale work is S.2.

Remaining window (unchanged in kind): the guards are check-then-act — an attempt started between the check and the
write is not covered. The concurrent-move re-check narrows the roster side; a submission-side lock is out of scope.

## Phase U.1 — page structure (class bar, full-width roster, side sheet, compact phone cards)

The owner chose the broader UX option. U.1 changes the structure of the page; U.2 takes the remaining details. Nothing
in the data, the API or the grading path changes.

| # | Decision | Why |
|---|---|---|
| U1-a | **One column at every width.** The classes become a bar of cards ABOVE the roster (a grid of cards at most about two rows tall, scrolling inside the bar). The roster takes the whole content width. The 260–300 px sticky side column is gone. | The roster is the work surface. The side column took 27–30 % of the width (the roster had 70 % at 1024 px and 73 % at 1440 px). Below 1024 px it already stacked, as an 690–890 px tall list before the roster. |
| U1-b | **One toolbar row** for the view switch and the class filter. From 1024 px the heading, that toolbar and «إنشاء صف» / «تحديث» share one row: the header's box is dissolved into the pane's grid (`display:contents`); the markup is unchanged. | In the old column the filter's `flex:1 1 240px` was a HEIGHT: a 240 px tall search box. As a row item it is a width. |
| U1-c | **The selected card is kept in view by scrolling the list only**, never the page. Sideways (the phone strip) the card's start edge is aligned with the strip's start, which is a snap position. | `scrollIntoView` would also scroll the page, and a teacher scrolled down the roster would jump. The nearest-edge alignment was measured in Chromium: the strip's `scroll-snap` pulled it straight back. |
| U1-d | **Phone: the classes are one sideways strip** (`scroll-snap-type:x proximity`; each card is 78 % wide, so the next card shows). The roster search keeps a single line (`flex:0 0 auto` in the column toolbar). | Same 240 px basis defect as U1-b, on the roster search on a phone. |
| U1-e | **Compact phone student card** (233 px → 113 px): the full name on the first line beside the actions (the family name comes from `data-family` on the name, so the DOM text and the desktop column are unchanged; the family cell is hidden on a phone). Then the details flow with inline labels; the status badge and the «الوظائف» link name themselves. The checkbox and the actions sit in the card's corners. | Six labelled lines per student made a 29-student class about 6 800 px long. |
| U1-f | **`Dialog placement="end"`**: a full-height side sheet at the inline end (the left edge in RTL), 820 px for `size="lg"`; a bottom sheet on a phone. Same modal contract (focus trap, Escape, backdrop, focus return, stacking). The student dialog uses it. | The student's details open beside the roster instead of over it. Every other dialog keeps the centred default. |
| U1-g | The student dialog's two history tables are named, focusable scroll regions (`role="region"`, `tabIndex=0`), the same as the item-analysis table. | axe `scrollable-region-focusable` (serious) at 390 px, present on the baseline. |
| U1-h | The clipped «بدون مشروع» chips (390 and 834 px) came from the old column list: its cards were flex items of a 320 px scroll box and shrank, and the legacy `.class-row{overflow:hidden}` cut their last line. The grid cards do not shrink. | Measured in Chromium (chip rectangle against its card and its select button). |

**Evidence.**
- `scripts/check-classes-students-browser-u1.mjs` runs on the production build and the real API in process, at 390 and 834 px (touch) and at 1024 and 1440 px. It checks the field heights, the chips, the structure and width share, the phone strip and cards, the selected card scrolling into view without a page scroll, the student sheet's placement, Escape and focus return, axe (no serious or critical violation) and horizontal overflow.
- Its own workflow, `.github/workflows/classes-students-browser-u1.yml`, adds a gate and weakens nothing.
- Results: on the baseline `a1d8ba80` the gate fails 22 checks; on the head it fails none.
- `src/students/classesStudents.u1.test.tsx` adds 13 tests. 12 fail on the baseline; the 13th pins the centred default.
- The mutation campaign plants 13 mutants; all 13 are KILLED.

**Not in U.1 (U.2):**
- 44 px touch targets for the row checkboxes and the sort buttons on a phone;
- Arabic number agreement and numeric name sort;
- the archived-class card details;
- the empty and loading states of the bar;
- dead legacy `.class-row` styles.

The class filter layout and the phone cards of the S.4 row above are delivered here.

## Phase U.2 — details: touch targets, number agreement, name order, the archive view

U.2 completes U.1's deferred list. Nothing in the data, the API or the grading path changes.

| # | Decision | Why |
|---|---|---|
| U2-a | **44 × 44 px touch targets** on a phone and on any coarse pointer (`@media (max-width:767px), (pointer:coarse)`). Covered: the buttons, icon buttons, menu triggers, view switch, sort buttons, selects, the bulk bar's link, the student sheet's section chips, and the action-menu items (the panel is portalled to `<body>`, so it is matched by its own class). The rules are scoped to this workspace and its sheet; desktop mouse density is unchanged. | Measured in Chromium. At 390 px the checkboxes were 13 × 13 and the search inputs 26 px tall. At 834 px (a touch tablet, wider than the 767 px phone rules) 24 page controls were under 44 px, and the menu items were 35 px. |
| U2-b | **The checkboxes and search fields are labels.** Each row checkbox and «تحديد الكل» sit in a `label.eb-check-hit` (44 × 44 on touch); the class filter and the roster search fields are `<label>` elements. The whole field, icon included, is the tap target. | A bare checkbox cannot grow its hit area. A field's border and icon were dead space. |
| U2-c | **Arabic number agreement** through the shared `arabicCount` (`src/learning/arabicCount.ts`, now documented as shared):<br>• class cards: `STUDENTS` («طالب واحد»، «طالبان»، «3 طلاب»، «29 طالبًا»);<br>• the bulk bar: `SELECTED_STUDENTS` («طالب واحد محدد»);<br>• the bulk confirmations and the import / bulk notices: `STUDENTS_GENITIVE` («على طالبين»، «نقل 3 طلاب»);<br>• the credential batch and the printed cards: `STUDENTS`;<br>• the roster header chip: `STUDENTS_AFTER_DIGITS`. The chip always shows digits, so only the noun agrees («12 طالبًا»; 1 and 2 keep the digit). | «3 طالب» and «29 طالب» were wrong on every card. |
| U2-d | **Not changed:** the bulk-delete confirmation keeps «⚠️ حذف نهائي لـ N طالب؟». | `TeacherPlatform.ux4.test.tsx` locks that message as the exact original text («the two locked delete confirmation MESSAGES»). Changing it is the owner's decision, not an agent's. |
| U2-e | **Equal sort keys fall back** to the first name, then the full name and the identity, all compared numerically. | Twelve students sharing one family name were listed in the server's order (طالب1, طالب10, طالب11, طالب12, طالب2 …). |
| U2-f | **Switching views selects that view's first class** when the selected class is not in it. An empty view keeps the selection. | After «الأرشيف» the roster kept showing an active class that the bar no longer listed. |
| U2-g | **The archive line** reads: the badge, then «في <day>» (a day without a time: «في 19 أكتوبر 2026»), then «دفعة <year>». It no longer starts with «·». The badge gets an outline on the tinted card. | The line read «مؤرشف · 19‏/10‏/2026 3:55:40 ص»: a seconds-precision time, a leading separator, and an invisible badge (neutral on neutral). |
| U2-h | **The legacy `.class-list` / `.class-row` rules are removed** (`platform.css`: a column with `overflow:hidden` and 62 % opacity when archived; `page-parts.css`: the border, hover and selected lines). The class names stay on the markup as test hooks. The two U.1-era guard lines, row direction and full opacity, are kept for the existing style contract. | Dead weight that every new class-card rule had to override. `overflow:hidden` was half of U.1's clipped-chip defect. |

**Evidence.**
- **Browser gate.** The gate script (`scripts/check-classes-students-browser-u1.mjs`, its U.2 section) adds a class of twelve students that share one family name and are created out of order. It checks, at 390 / 834 / 1024 / 1440 px:
  - the agreement on the cards, the header and the bulk bar;
  - the name order;
  - the archive-view selection and the archive line;
  - at the touch sizes, every control on the page, with the bulk bar open, in an open row menu and in the student sheet. A checkbox counts with its label.
- **Gate results.** On the baseline `a4061e6f`, 31 of the 78 checks fail; all 31 are U.2 checks, and every U.1 check passes. On the head, 0 of 78 fail.
- **Unit tests.** `src/students/classesStudents.u2.test.tsx`: 11 of 12 fail on the baseline; the 12th, an empty view keeping its selection, is a pin.
- **Mutation campaign.** 14 mutants, all KILLED. V4 (no empty-view guard) first survived; the test now also asserts that the switch reports no error.
- **Existing tests.** Expectations updated for the new wording: «طالب واحد محدد», «طالبان محددان», «3 طلاب محددون», «نُفذت العملية على طالب واحد». Clicks in the archive view are scoped to the class list, because the selected class's name now also heads the roster.

## Phase S.3 — credentials and dangerous actions

S.3 is the S.3 row of the plan above: four changes around the moments where a teacher can lose or expose a credential, or
destroy many accounts at once. Grading, roster membership and the data model are unchanged; the only stored addition is
an optional `importId` on student documents created by a bulk import.

| # | Decision | Why |
|---|---|---|
| S3-a | **Generated and reset passwords are masked on screen until the teacher asks.** This covers three places: the box after creating one student, the credential batch table (bulk import, bulk «كلمات مرور جديدة»), and the reset box in the student sheet. Each has one toggle with a fixed accessible name («إظهار كلمة المرور» / «إظهار كلمات المرور») and `aria-pressed`. The mask is a fixed eight dots plus a hidden «مخفية», so it never reveals the length. **Copy, download (JSON / CSV) and print still use the real values.** Every new box or batch starts masked, and so does a batch shown again after another class was selected (the panel unmounts while hidden). | A projector, a shared screen or someone behind the desk saw every new password in clear. The teacher-typed password fields of the add / edit forms were already masked with their own reveal button. |
| S3-b | **Leaving with an unsaved credential batch asks first.** A batch is *unsaved* until a download (JSON or CSV) or a print takes a copy; the panel then reads «✓ حُفظت نسخة منها» instead of «لم تُحفظ بعد». While a batch is unsaved:<br>• closing or reloading the tab triggers the browser's own `beforeunload` prompt;<br>• TeacherPlatform reports it to App (`onCredentialsPendingChange`), and App confirms («كلمات مرور لم تُحفظ»: «مغادرة دون حفظ» / «البقاء في الصفحة») before any navigation that unmounts the workspace: another sidebar page, the logout, and the Today Hub's project links;<br>• moving between the workspace's own tabs (لوحة المتابعة، الصفوف والطلاب، الواجبات، سجل النشاط) asks nothing, because the batch stays mounted;<br>• an expired session (401) is never held back. | The plaintext passwords exist only in this tab's memory (credentialBatch.ts never stores them). One click on another sidebar page lost them for good, and the teacher had to generate new ones. |
| S3-c | **A bulk delete is typed.** «حذف نهائي» unlocks only once the number of selected students is typed. Arabic-Indic and Western digits are equivalent, and surrounding spaces are ignored. The confirmation **message is unchanged** (U2-d: its wording is locked and is the owner's decision). The typed text belongs to one confirmation and never unlocks a later one. A single-student delete keeps its existing confirmation, which names the student and the identity. | One click on «حذف نهائي» deleted every selected account. A hidden selection is already excluded (S.0); this adds a deliberate step for the irreversible case. `ConfirmDialog` gains an optional `typeToConfirm`; every other confirmation is unchanged. |
| S3-d | **An import can be retried safely.** The browser creates one unguessable key (`crypto.randomUUID`) per previewed file and sends it with every import attempt of that preview. A failed attempt keeps the preview and the key and says so («يمكنك إعادة المحاولة بأمان…»). A new file, or the dialog opened again, gets a new key. The server stores the key on each account the import creates; `publicStudent` never returns it.<br>On a retry, a row whose identity is already held by an account that meets all of the following is **recovered with a NEW password** (an ordinary reset: authVersion + 1, sessions revoked), returned with `recovered: true`:<br>• it carries the same key;<br>• it is in the same class;<br>• it was created less than 24 hours ago;<br>• it was never logged into;<br>• it is not archived.<br>Everything else stays an explicit duplicate, as before. The response and the audit count recovered rows apart (`recovered`, `recoveredCount`; `createdCount` counts new accounts only). A key that is not a 16–64 character `[A-Za-z0-9-]` string is ignored. | A lost response (network drop, gateway timeout) left accounts whose generated passwords reached no one. The retry reported every row as «رقم الهوية مستخدم مسبقًا», and the teacher had to find and reset each account. The first attempt's password was never seen, so replacing it is harmless. The conditions keep the recovery away from any account that is in use, moved, archived or old. |

**Limitations (stated, not hidden).**
- Closing the import dialog after a failed attempt discards the key. Picking the file again then shows the created rows as duplicates (explicitly, never silently). The bulk «كلمات مرور جديدة» recovers them.
- A print counts as «saved» even if the print dialog is then cancelled.
- The browser's `beforeunload` prompt shows its own generic text; browsers do not allow a custom message.
- The one-student credential box is not part of the leave warning. It holds one password the teacher reads or copies at once, and it is already cleared on a class switch.

**Evidence.**
- **Fail-first.** The new tests were run against a detached worktree of the baseline `00ecfd10`: 17 fail and 6 pass. The 6 that pass are pins: no batch, no hold; and five server rules that must stay duplicates (no key or another key; a used, archived, moved or old account; another class; a one-by-one account; a malformed key).
- **Files.**
  - `src/students/classesStudents.s3.test.tsx`: 13 tests (masking, leave hold, typed delete, import key).
  - `src/App.credentialsLeave.s3.test.tsx`: 2 tests through the real App (sidebar, logout, workspace tabs, a downloaded batch).
  - `api/tests/classes-students-s3.test.js`: 8 tests through the real handler over the in-memory container. A recovered password logs in and the lost one no longer does; no second account is created; the roster index lists each student once; the audit counts are split.
- **Existing tests.** Updated for the new interaction: reveal before reading a password; type the count before a bulk delete; the import body carries `importId`. Each «gone» assertion now reveals first, so it still proves the password left the screen and does not pass merely because the text is masked.
- **Mutation campaign.** 23 planted defects; every source file was restored byte-for-byte and SHA-256 verified after each one.
  - **Killed: 22.**
    - Typed confirmation: the gate is ignored (Y1); Arabic-Indic digits are not normalized (Y2); typed text carries over to a newer confirmation (Y3); the bulk delete is not typed (Y22).
    - Masking: passwords are never masked (Y4).
    - Leave hold: a saved batch still counts as unsaved (Y5); `beforeunload` does not hold (Y6); App ignores the report (Y7); the workspace tabs also ask (Y8); the logout is not guarded (Y9); a print does not mark the batch saved (Y10).
    - Import key: a failed import drops its key (Y12); a new preview keeps the old key (Y11b).
    - Server recovery ignores the key (Y13), the class (Y14), a login (Y15), an archive (Y16) or the age window (Y17); it gives a password without a reset (Y18); it does not store the key (Y19); it coerces a non-string key (Y20); it leaves recovered rows out of the roster index (Y21).
  - **Two first survived.**
    - **Y21** survived because the test's first attempt had already written the index. A test now covers an attempt that died before its index write, and kills it.
    - **Y11** (keep the old key) is **equivalent**. Picking a file resets the key before the preview, so the replacement always runs on an empty key. The combined mutant Y11b (no reset and no replacement) is killed by the test «another file picked in the SAME dialog gets a new key».
