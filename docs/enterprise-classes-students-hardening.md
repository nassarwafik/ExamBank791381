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
