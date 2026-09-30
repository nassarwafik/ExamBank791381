# Phase 14B — Reviewer / Approver Workflow & Publishing Roles

Baseline: `origin/main` = `b9e45e8a8f59b2d64ca88d11a49d91504dff68b6` (merge of PR #226 — Phase 14A; post-merge run 36687431618
green). Branch `feature/14b-review-approval-workflow`. This document is the authoritative design of the phase; the PR body
carries the evidence summary.

## 1. Objective and boundary

Phase 14A made publishing technically authoritative on the server (immutable revisions, server finalization, manifest CAS,
`stateVersion`, `requestId` idempotency, durable audit continuity, published-assignment pinning, capabilities). Phase 14B turns
that lifecycle into a real multi-person institutional workflow:

`Author → Reviewer → Approver → Publisher`

In **Assigned mode** the Author submits ONE immutable revision to a server-owned review cycle with a specific Reviewer, Approver and
Publisher; the Reviewer must complete review before approval is possible; only the assigned Approver may approve; only the
assigned Publisher may publish; negative decisions return the exam to Draft with a persistent, immutable note; every actor,
timestamp and decision is server-authoritative; reviewers / approvers / publishers receive a real Review Inbox.

Deliberately NOT built (Phase 20): schools, departments, teams, organization owners, tenant model, administrator UI, role editor
UI, account / password administration UI, institution membership. 14B provides only the minimum server-owned identity,
directory and workflow foundation required for trustworthy reviewer / approver separation. Phase 15 (templates / presets) is
untouched.

## 2. Audit of the merged 14A architecture (before implementation)

| Area | Finding |
|---|---|
| `api/src/lib/builder-auth.js` | HMAC v2 teacher session, `sub` = the login `userCode`. `validateBuilderCredentials()` compares ONE shared password (`BUILDER_PASSWORD` / `BANK_SETUP_KEY`) and, only when `BUILDER_USER_CODE` is set, requires that one code. Any submitted code is otherwise accepted as the identity. |
| `api/src/functions/builder-login.js`, `platform-login.js` | Reserve-before-verify login throttle (`login-throttle.js`) in front of `validateBuilderCredentials`; teacher branch issues `createBuilderToken(userCode)`. |
| `api/src/lib/teacher-profile.js` | Self profile `platform/teacher-profiles/<sub>.json`; display name = profile → `TEACHER_DISPLAY_NAME` → «المعلم». Always the token subject. |
| `api/src/lib/exam-governance-capabilities.js` | Capabilities from identity + `GOVERNANCE_CAPABILITIES` (`default-single-teacher` / `configured` / `configuration-error`, fail-safe). `requiredCapabilities(action, fromState)`. |
| `api/src/lib/exam-governance-model.js` | Lifecycle table, six event types, blob namespace, `validateManifest` (fail closed). |
| `api/src/lib/exam-governance.js` | The mutation authority: `expectedStateVersion`, `requestId` replay / conflict, `ensureCommittedAudit` preflight, revision + meta before CAS (discarded on loss), manifest CAS, audit descriptor → create-only event (`ensureAuditEvent`). `approve` / `publish` bind manifest pointers; any `approve` holder could approve. |
| `api/src/functions/exam-governance.js` | HTTP contract; `actor = { id: auth.user.sub, capabilities }`; nothing in the body is authority. |
| `api/src/lib/platform-storage.js` | `uploadJsonConditional` (If-Match / If-None-Match `*`), `isConcurrencyConflict`, `listBlobNames`, `deleteBlob`. |
| `api/src/lib/audit-log.js` | Platform audit blobs (`recordAuditEvent`) — unrelated to governance events; unchanged. |
| Frontend | `GovernancePanel.tsx` (lazy, App-owned `GovernanceService`, Builder never sees the token, read-only `RevisionViewer` inline), `examGovernance.ts` vocabulary, `examGovernanceClient.ts`, `teacherNav.ts` registry + `TeacherAppShell` ICONS + `App.tsx` lazy pages (`lazyWithRetry`), `ui/Dialog` (focus trap, focus return, stacking). |

### 2.1 Critical identity finding

The legacy login is acceptable for a single-teacher deployment but is NOT a security basis for Reviewer / Approver separation:
with one shared password, possession of that password lets one person claim ANY `sub` by typing another `userCode`
(reproduced on the baseline: `validateBuilderCredentials("teacher-reviewer", <shared password>) === true` even with
`BUILDER_USERS` set — see the fail-first log). Therefore Assigned mode is allowed ONLY on top of a server-owned multi-user
account configuration, and role separation is never built on a client-supplied identity claim.

## 3. Part A — server-owned multi-teacher identity (`api/src/lib/builder-users.js`)

```
BUILDER_USERS='{"users":{"teacher-author":{"passwordEnv":"BUILDER_PASSWORD_AUTHOR","displayName":"Author Name"},
                         "teacher-reviewer":{"passwordEnv":"BUILDER_PASSWORD_REVIEWER","displayName":"Reviewer Name"}}}'
BUILDER_PASSWORD_AUTHOR=<server secret>      BUILDER_PASSWORD_REVIEWER=<server secret>
```
(Examples only — no real credentials anywhere in this repository.)

* Metadata only: a `password` / `passwordHash` / `secret` key inside `BUILDER_USERS` is a configuration error.
* `passwordEnv` must match `^[A-Z][A-Z0-9_]{0,127}$` and may not name a reserved platform variable (`BUILDER_USERS`,
  `BUILDER_PASSWORD`, `BUILDER_USER_CODE`, `BANK_SETUP_KEY`, `BUILDER_SESSION_SECRET`, `STUDENT_SESSION_SECRET`,
  `BUILDER_SESSION_VERSION`, `AZURE_STORAGE_CONNECTION_STRING`, `GOVERNANCE_CAPABILITIES`, `TEACHER_DISPLAY_NAME`); no two accounts may share
  one secret (that would let one person claim the other).
* Account ids: `^[A-Za-z0-9][A-Za-z0-9._@-]{0,127}$`; at most 200 accounts.
* Modes: absent / empty ⇒ **legacy** (single-teacher login unchanged byte-for-byte, incl. `BUILDER_USER_CODE`); valid ⇒
  **multi-user**; malformed non-empty ⇒ **configuration-error** ⇒ fail CLOSED (login endpoints answer `503 AUTH_CONFIG_INVALID`
  before any verification; no fallback to the shared password; nothing about values, accounts or variable names is echoed).
* `validateBuilderCredentials()` in multi-user mode: the `userCode` must exactly match a configured account; the password is
  compared (existing `timingSafeEqualText`) ONLY against `process.env[<that account's passwordEnv>]`; a missing / empty secret
  refuses that account; unknown account and wrong password are the same generic `false`. Token: `sub` = the configured id;
  format / signature / TTL / session version unchanged; the reserve-before-verify throttle stays in front.
* Display name precedence (`teacher-profile.fallbackDisplayName(sub)`): stored profile → configured account `displayName` →
  `TEACHER_DISPLAY_NAME` → «المعلم».

## 4. Part B — Assigned governance mode (same `GOVERNANCE_CAPABILITIES` grammar)

```
GOVERNANCE_CAPABILITIES='{"mode":"assigned","default":[],"users":{"teacher-author":["author"],"teacher-reviewer":["review"],
                          "teacher-approver":["approve"],"teacher-publisher":["publish"]}}'
```
* Without `"mode":"assigned"` the 14A semantics are unchanged (`default-single-teacher`, `configured`, `configuration-error`).
* `governanceIdentityStatus(env)`: Assigned mode is valid ONLY when `BUILDER_USERS` is valid and every subject listed in
  `users` exists in the account directory; otherwise `GOVERNANCE_IDENTITY_CONFIG_INVALID` — reads keep working (the status
  reports `identityConfigurationError`), every mutation is refused with 503, and Assigned mode is never downgraded to
  single-teacher behaviour.
* `governanceDirectorySnapshot(env)` = `{ mode: "assigned", actors: [{ actorId, capabilities }] }` (ids + CURRENT
  capabilities) injected by the function layer into the authority as `deps.directory`; `{ mode: "single" }` otherwise.
* `governance-directory.listGovernanceActors()` (action `directory`): `{ actorId, displayName, capabilities }` for the
  authoring UI — profile name → account name → id; never `passwordEnv`, secrets, raw configuration or token data. Only
  server-configured accounts are enumerated.

## 5. Part C — the review workflow inside the existing lifecycle

No new lifecycle state. `manifest.reviewWorkflow` is the ONE authoritative representation of the active cycle:

```
reviewWorkflow: { cycleId, revisionId, revisionNumber, authorId, reviewerId, approverId, publisherId,
                  submittedAt, submittedBy, reviewStatus: "pending" | "completed",
                  reviewedAt?, reviewedBy?, reviewDecisionId?, approvedAt?, approvedBy?, approvalDecisionId?, publishedAt?, publishedBy? }
lastDecision:   { decisionId, stage, decision, actorId, at, cycleId, revisionId, revisionNumber, hasNote }   // for the author
```
* `cycleId` = `cyc-<uuid>` minted by the server on every submission; the browser never chooses it. The cycle binds one exact
  revision and four distinct identities and never retargets: content changes ⇒ Draft → new revision → NEW cycle.
* `validateManifest()` (fail closed) when workflow data exists: valid ids, strict separation (four distinct identities),
  valid `reviewStatus`; **in-review**: `reviewWorkflow.revisionId === reviewRevisionId`; **approved / published**:
  `reviewStatus === "completed"`, `approvedRevisionId` (and `publishedRevisionId`) = the cycle's revision, approval stamp of the
  cycle; **draft** never carries an active workflow. 14A manifests without workflow data remain valid (no migration).

### 5.1 Role action matrix (server-enforced; capability AND assignment both required)

| Actor | May | Cannot |
|---|---|---|
| Author (`author`) | create revision in Draft; `submit-review` with assignments; `withdraw-review` of the cycle it authored; new draft after publication | complete review, approve, publish, cancel another author's cycle |
| Assigned Reviewer (`review`) | view the immutable revision; `complete-review` (optional note); `request-changes` (note required) | approve, publish |
| Assigned Approver (`approve`) | after `reviewStatus === "completed"`: `approve` (optional note), `reject-approval` (note required) | act as reviewer, publish, approve before review completion |
| Assigned Publisher (`publish`) | on `approved`: `publish`, `reject-publication` (note required) | review, approve |
| Anyone else | reads | every mutation of the cycle (`403 NOT_ASSIGNED` / `403 FORBIDDEN`) |

**Bypass rule:** while a cycle is active (in-review / approved) the generic `return-to-draft` is refused for everyone
(`409 WORKFLOW_ACTION_REQUIRED`); the only exits are the explicit workflow actions. After publication the cycle is historical
and `return-to-draft` (new lineage) is the author's ordinary action. In Assigned mode a manifest that is in-review / approved
WITHOUT a cycle (submitted before the mode was enabled) cannot be approved / published (`409 WORKFLOW_REQUIRED`): return it to
draft and resubmit through a cycle.

**Configuration changes during a cycle (§39):** at action time the actor must still be the assigned one AND still hold the
capability in the server directory; a removed actor or a lost capability fails closed; nobody is substituted or transferred.
The author may withdraw and resubmit a new cycle.

### 5.2 Transitions and error codes

| Action | From → to | Actor | Note | Event | Decision record |
|---|---|---|---|---|---|
| `submit-review` + `assignments{reviewerId,approverId,publisherId}` | draft → in-review | author | — | `submitted-for-review` (+ `cycleId`) | — |
| `complete-review` | in-review → in-review (`reviewStatus` completed) | assigned reviewer | optional | `review-completed` | `review-completed` (always) |
| `request-changes` | in-review → draft | assigned reviewer | REQUIRED | `changes-requested` | `changes-requested` |
| `approve` | in-review → approved | assigned approver, review completed | optional | `approved` | `approved` (when a note is given) |
| `reject-approval` | in-review → draft | assigned approver, review completed | REQUIRED | `approval-rejected` | `approval-rejected` |
| `publish` | approved → published | assigned publisher | — | `published` | — |
| `reject-publication` | approved → draft | assigned publisher | REQUIRED | `publication-rejected` | `publication-rejected` |
| `withdraw-review` | in-review → draft | the cycle author | optional | `review-withdrawn` | `withdrawn` |

Codes: `400 WORKFLOW_ASSIGNMENT_INVALID` (missing / unknown / capability-lacking / duplicate assignment, free-text identity),
`400 NOTE_REQUIRED` / `NOTE_TOO_LONG` / `NOTE_INVALID`, `403 NOT_ASSIGNED`, `403 FORBIDDEN`, `409 REVIEW_NOT_COMPLETED`,
`409 WORKFLOW_ACTION_REQUIRED`, `409 WORKFLOW_REQUIRED`, `404 DECISION_NOT_FOUND`, `503 GOVERNANCE_IDENTITY_CONFIG_INVALID`,
plus every 14A code (`STALE_STATE`, `ILLEGAL_TRANSITION`, `REQUEST_ID_CONFLICT`, `AUDIT_EVENT_PENDING`, `AUDIT_INTEGRITY`, …).

## 6. Part H — immutable decision records

`exam-governance/<examId>/decisions/<seq6>-<decisionId>.json` (create-only):
`{ schemaVersion, decisionId, examId, cycleId, revisionId, revisionNumber, stage: review|approval|publication|author,
   decision: review-completed|changes-requested|approved|approval-rejected|publication-rejected|withdrawn, actorId, occurredAt, note, sequence }`

* `sequence` = the audit sequence of the committing mutation (sortable, unique per exam); listing (`decisions`) is
  newest-first, bounded (≤ 50), and `decision` loads one record by id.
* Notes are plain text: CR/LF normalized, control characters dropped, trimmed, ≤ 2000 characters; required-note actions
  reject empty / whitespace-only. The UI renders notes as text only (`<pre>`), never HTML. No exam body, answer key, token or
  credential is ever placed in a record.
* Audit events reference `decisionId` / `cycleId` only — the note body never enters the audit trail.

## 7. Part I — Review Inbox index (`api/src/lib/governance-inbox.js`)

`exam-governance-inbox/<actorKey>/<stage>-<examId>-<cycleId>.json`, `actorKey = sha256("governance-inbox:" + actorId)[0..32]`.
A pointer holds routing / display data only: `{ actorId, stage, examId, cycleId, revisionId, revisionNumber, title, authorId,
submittedAt, createdAt }`. The manifest stays the authority; `isTaskLive(pointer, manifest, actorId)` is the ONE liveness rule
(stage × lifecycle × `reviewStatus` × assigned actor × cycle × revision, and the pointer must belong to the asking actor).

Stages open exactly when the transition commits: reviewer on `submit-review`, approver only after `complete-review`,
publisher only after `approve`. `listActorTasks()` reads pointers + validated manifests only (never a revision body),
filters and best-effort deletes stale pointers, sorts newest-first, pages (≤ 50) and returns per-stage counts. The endpoint
`/api/governance-inbox` derives the actor ONLY from the token subject (`actorId` / `sub` in query or body are never read);
students / anonymous are 401.

## 8. CAS ordering (decision records, task pointers, manifest, audit)

The ONE commit core (`commitMutation`) generalizes the 14A order for every workflow mutation:

1. validate the command (actor, assignment, capability, state, note);
2. pre-CAS create-only writes in order — the decision record, then the next-task pointer (`writeTaskPointer` is create-only:
   a caller undoes ONLY a pointer it created, so a losing concurrent attempt can never delete the winner's live task); a failed
   pre-CAS write undoes what was written and the mutation does not commit;
3. fail-closed validation of the next manifest (workflow rules included);
4. manifest CAS — a lost race undoes the pre-CAS writes (no orphan decision, no uncommitted pointer);
5. `ensureAuditEvent` (14A commit + audit-repair protocol);
6. best-effort removal of the closed task pointer.

A pointer or decision written before a lost CAS may survive a crash or a failed cleanup: the inbox reader filters it (the
manifest never confirms it) and cleans it on the next validated read; an unreferenced decision is never listed by the manifest
/ events. A decision record referenced by a committed manifest / event is never deleted.

## 9. Audit continuity (14A invariant, non-negotiable)

Every 14B mutation (`transition` with assignments / approve / publish, `workflowDecision`) runs through the same authority:
`requireManifest → requireCapability → ensureCommittedAudit → replayOrConflict → stale check → … → commitMutation → ensureAuditEvent`.
`mutation N committed ⇒ event N durable ⇒ only then mutation N+1 may commit` holds unchanged (R12), the command ring, the
audit descriptor (now with optional `cycleId` / `decisionId`), event repair, `requestId` replay (`workflow:<action>` command
types) and `REQUEST_ID_CONFLICT` are reused, not duplicated. Review Fix 1 / Review Fix 2 of 14A are not weakened (their
suites and guards run unchanged, with the guard counts extended for the new mutation path).

## 10. Frontend

* `examGovernance.ts`: workflow / decision / directory types, labels (إتمام المراجعة · طلب تعديلات · رفض الاعتماد وإعادة للمسودة ·
  إعادة قبل النشر · سحب طلب المراجعة), `availableGovernanceActions(manifest, capabilities, ctx)` (assigned-actor affordances, the
  14A table without a context), `workflowStage`, `workflowResponsible`, `assignmentProblems`, `actorName`.
* `examGovernanceClient.ts`: `directory`, `decide`, `listDecisions`, `loadDecision`, assignments (ids only) and note on
  `transition`; `createTokenTransport` for pages outside the App helper.
* `governance/RevisionViewer.tsx`: the ONE read-only revision viewer, extracted from the panel and reused by the Inbox.
* `governance/AssignmentDialog.tsx` (server directory, capability-filtered selects, author / duplicates disabled),
  `governance/DecisionNoteDialog.tsx` (real label, required-note gating, counter, plain text).
* `GovernancePanel.tsx`: workflow card (participants by display name, current stage, stamps), assignment dialog before
  submission, assigned-actor decisions, the latest decision note shown prominently to the author in draft, bounded decision
  history, identity-configuration banner, 409 refresh (never a retry).
* `governance/ReviewInboxPage.tsx` («مراجعات النشر», lazy, Exam Bank group): tabs بانتظار مراجعتي / بانتظار اعتمادي / بانتظار النشر
  with counts, task rows (title, revision, author name, time, stage), task view = the immutable revision loaded by
  `revisionId` + participants + decisions the server would accept; 409 closes the task and reloads; R13 sequence guard; RTL,
  44px targets, narrow-screen layout, `aria-live` status, real tabs / buttons / labels.

## 11. Compatibility

Legacy single-teacher login (BUILDER_USERS absent), 14A manifests / revisions / published exams / assignments (pinning
unchanged, `resolveGovernedExamSource` untouched), StudentExamPage, grader, Question Bank, Blueprint / Quality Policy, server
finalization, audit continuity, autosave / history and the PWA are unchanged. No destructive migration, no manifest rewrite.
Students never reach governance or the inbox.

## 12. Tests

| Suite | Covers |
|---|---|
| `api/tests/builder-users-14b.test.js` | ID1–ID9 (legacy unchanged, per-account secrets, cross-account claim, generic failure, malformed fail-closed, missing secret, client cannot choose passwordEnv, token sub, throttle in front) |
| `api/tests/exam-governance-workflow-14b.test.js` | W1–W20: submission with assignments, server validation, separation of duties, single-teacher unchanged, reviewer / approver / publisher decisions, withdrawal, bypass rule, no retargeting, config change mid-cycle, replay idempotency, decision records, manifest workflow validation |
| `api/tests/governance-inbox-14b.test.js` | I1–I6 (actor key, stage opening, closing, stale filtering + cleanup, `isTaskLive`, bounded newest-first paging without bodies) + S6 / S7 on the endpoint |
| `api/tests/exam-governance-races-14b.test.js` | R1–R12 |
| `api/tests/exam-governance-function-14b.test.js` | HTTP contract in Assigned mode, directory, S1–S10, R14 |
| `api/tests/exam-governance-guards-14b.test.js` | §57 source / security guards |
| `src/examGovernance.14b.test.ts` | assigned-mode affordances, stage helpers, labels |
| `src/GovernancePanel.14b.test.tsx` | assignment dialog, workflow card, decisions, required note, approver gating, decision note / history, 409, identity error |
| `src/governance/ReviewInboxPage.14b.test.tsx` | tabs / counts / rows, immutable revision task view, complete review, required note, approver / publisher, 409, R13, keyboard / RTL |
| `src/shell/teacherNav.reviews.test.ts` | the «مراجعات النشر» destination |
| Updated 14A suites | `exam-governance-model-14a` (event vocabulary +5), `exam-governance-guards-14a` (commit-core counts; `"request-changes"` literal), `teacherNav.test.ts` (Exam Bank children), `phase8b.test.tsx` (nav map) |

### 12.1 Fail-first evidence (recorded on `b9e45e8`, `scratchpad/14b/fail-first-b9e45e8.log`)

The six suites were written first and run unchanged on the exact baseline: **6 files failed · 23 tests failed / 2 passed (25)**.

* `builder-users-14b`, `governance-inbox-14b`, `exam-governance-races-14b`, `exam-governance-function-14b` fail at import
  (`builder-users.js`, `governance-inbox.js`, `governance-inbox` function absent). Behavioural identity probe on the baseline
  validator (same log): with `BUILDER_USERS` configured, `validateBuilderCredentials("teacher-reviewer", <shared password>) === true`
  (the shared password claims ANY configured identity), the per-account secret is not read at all, and a malformed `BUILDER_USERS`
  still accepts the shared password — the exact fail-open behaviours ID2 / ID3 / ID5 close.
* `exam-governance-workflow-14b` (behavioural, against the existing authority): W1, W2, W3, W5–W20 failed — assignments ignored
  (no `reviewWorkflow`), any `approve` holder approved before any review (W9: "expected an error"), `workflowDecision` absent,
  no decision records, generic `return-to-draft` bypassed review, `validateManifest` accepted malformed workflow state; **W4
  passed** (single-teacher flow unchanged — the compatibility contract that must not regress).
* `src/examGovernance.14b`: reviewer / approver / publisher affordances and stage helpers failed (14A table offered `approve`
  to any approve-holder and a generic return-to-draft); **the draft / single-teacher case passed** (the 14A table applies).
* The component suites (`GovernancePanel.14b`, `ReviewInboxPage.14b`) and the nav test were written against the new
  components and could only run after implementation (the page did not exist on the baseline).

## 13. Mutation proofs P35–P48

Each mutation was applied alone to the working tree, the 14B suites + the 14A governance suites (185 tests) were run, the
mutation was reverted, and the tree fingerprint (md5 of `git status` + `git diff` + untracked-file digests) was compared.

| # | Mutation | Result | First failing test |
|---|---|---|---|
| P35 | allow `BUILDER_USERS` mode to fall back to the shared password | **4 failed** · tree clean | S2 — teacher A cannot authenticate as B with A's password (and the shared legacy password grants nothing) |
| P36 | trust body-supplied capability / role / actorId | **5 failed** · tree clean | the function trusts nothing in the body for authority: no body.role / capabilities / actorId / reviewedBy / approvedBy / publishedBy / cy |
| P37 | allow Author == Reviewer in Assigned mode | **2 failed** · tree clean | the assigned actor AND the server capability are both required; the directory is the authority for both, never the request |
| P38 | allow an unassigned actor holding `approve` to approve (assignment identity ignored) | **12 failed** · tree clean | the assigned actor AND the server capability are both required; the directory is the authority for both, never the request |
| P39 | allow approval before `reviewStatus === "completed"` | **3 failed** · tree clean | W9 — approval is impossible before the reviewer completed review, even for the assigned approver (409 REVIEW_NOT_COMPLETED) |
| P40 | let the generic `return-to-draft` bypass the required reviewer rejection note | **3 failed** · tree clean | W15 — BYPASS RULE: while a workflow cycle is active the generic return-to-draft is refused for everyone (409 WORKFLOW_ACTION_REQUIRED); |
| P41 | store the note only in the response / UI state, not in an immutable server decision record | **12 failed** · tree clean | W6 — complete review: lifecycle stays in-review, reviewStatus completed, reviewedAt / reviewedBy server values, stateVersion + eventCou |
| P42 | open the Approver task before the Reviewer completes review | **5 failed** · tree clean | R1 — two clients submit the same draft state simultaneously: exactly one CAS wins, one cycle exists, the loser's pre-CAS pointer is cle |
| P43 | inbox endpoint trusts a client `actorId` | **3 failed** · tree clean | S6 — the actor is ONLY the authenticated token subject: another teacher's id in the query / body changes nothing |
| P44 | return stale inbox pointers without manifest validation | **4 failed** · tree clean | the inbox reader validates every pointer against the validated manifest before returning it, and the actor key is a hash |
| P45 | decision record survives a lost CAS as an orphan | **2 failed** · tree clean | R4 — complete review twice with DIFFERENT requestIds from the same state, concurrently: exactly one CAS succeeds, one decision record, |
| P46 | a 14B mutation (`workflowDecision`) bypasses `ensureCommittedAudit` | **2 failed** (first run: both guards) → **3 failed** after R12 was strengthened · tree clean | R12 — the audit event write fails after a 14B mutation CAS: the next workflow decision commits past the gap (behavioural), plus the 14A preflight guard and the 14B commit-core guard |
| P47 | remove the assigned-Publisher restriction | **3 failed** · tree clean | approval requires a completed review; the generic return-to-draft cannot bypass an active cycle; publication in a cycle is only the assig |
| P48 | the review task view uses client-side task data instead of the immutable stored revision | **3 failed** · tree clean | the review task view renders the STORED revision loaded by id — never a client / live exam body — with no editing controls |

fingerprint before: 20db818cc6f94e54 → fingerprint after: 20db818cc6f94e54 (identical). P46 was re-run after R12 was strengthened to
attempt a workflow decision (`withdraw-review`) as the "next mutation" after an audit gap: **3 failed** (R12 behavioural + both
guards), fingerprint `d04b6290eb9f1752` → `d04b6290eb9f1752` identical.

## 14. Validation

Run on the final tree of this commit (`scratchpad/14b/{tsc,full,build,bundle,lint}.log`):

| Check | Result |
|---|---|
| focused 14B (6 backend suites + 3 frontend suites + nav) | all green (fail-first 23 → 0 failures) |
| whole `api/tests` directory | 150 files passed (before the final lint-only refactor; included again in `npm test` below) |
| `npx tsc -b` | exit 0 |
| `npm test` | **553 files / 6637 tests passed**, 0 failed (baseline 14A: 543 / 6542) |
| `npm run build` | exit 0 |
| `npm run check:bundle` | initial JS graph 12 files, **118.9 KB gzip / budget 125 KB** (baseline `b9e45e8`: 118.7 KB — +0.2 KB: the nav registry entry, the lazy page registration and the client's workflow fields; the Review Inbox page, dialogs and viewer are lazy chunks) |
| `npm run lint` | exit 0 — **99 findings on `b9e45e8` vs 99 on the final tree, finding-for-finding identical** (line numbers ignored); three transient findings introduced during development (an unused test variable, two `set-state-in-effect` warnings) were fixed before the commit |

## 15. Recovery / error semantics (operator notes)

* `503 AUTH_CONFIG_INVALID` on login ⇒ `BUILDER_USERS` is malformed: fix the JSON / `passwordEnv` names / duplicate secrets;
  nobody can log in until then (by design).
* `503 GOVERNANCE_IDENTITY_CONFIG_INVALID` ⇒ `mode: "assigned"` without a valid `BUILDER_USERS`, or a `users` subject outside the
  account directory; reads work, mutations wait for the fix.
* `409 WORKFLOW_ACTION_REQUIRED` ⇒ use the cycle's own actions; `409 WORKFLOW_REQUIRED` ⇒ return to draft and resubmit through a
  cycle; `409 REVIEW_NOT_COMPLETED` ⇒ the reviewer has not finished; `403 NOT_ASSIGNED` ⇒ the wrong person (or a removed /
  demoted actor — the author may withdraw and resubmit).
* `503 AUDIT_EVENT_PENDING` ⇒ 14A audit repair: retry the same request / any next mutation repairs the committed event first.
* Stale inbox pointers are harmless: filtered on read and cleaned best-effort.
