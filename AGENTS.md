# AGENTS.md — operating contract for AI-assisted engineering in this repository

This file is the repository-level contract for every coding agent (Claude Code, OpenAI Codex, ChatGPT acting as an
independent reviewer, or any future tool) and for the humans who direct them. It is tool-neutral: nothing here depends
on one vendor. If a session instruction conflicts with this file, the session instruction may make a rule **stricter**,
never looser. Only the repository owner can relax a rule, and only by changing this file in a reviewed pull request.

Companion documents (read them when the summary here is not enough):

| Topic | Document |
|---|---|
| Roles, phase lifecycle, review protocol, report format | `docs/development/agentic-development-workflow.md` |
| Which checks are required for which change | `docs/development/validation-matrix.md` |
| Pull request body skeleton | `.github/pull_request_template.md` |
| Architecture, environment variables, deployment pipeline | `README.md`, `runner/README.md`, `docs/` |

The automated contract check `scripts/repo-governance-contract.test.mjs` fails the root test suite if these files
disappear or lose their non-negotiable rules.

---

## 1. Repository map and architecture boundaries

| Area | Path | Boundary |
|---|---|---|
| Web app (teacher + student, React 19 / TypeScript / Vite, RTL-first) | `src/` | Never executes student code. Never holds a secret. |
| API (Azure Functions v4, Node 22, CommonJS) | `api/src/functions/` (one module per route), `api/src/lib/` | **Owns every grading decision and every authority check.** |
| Shared finalization source | `src/` TypeScript → generated CJS for the API (`scripts/build-shared-finalization.mjs`) | Regenerate with the script; a drift test fails CI on hand edits. |
| Coding Runner (gateway, Docker sandboxes, worker images) | `runner/` | **The only place student code runs.** Executes and reports raw evidence; never compares, weights or grades. |
| Runner deployment material (Azure VM, systemd, readiness, rollback) | `runner/deploy/azure-vm/` | Documentation and scripts for the operator. Running them against the live VM is a deployment (section 11). |
| Load / certification harness | `runner/tests/load/`, `runner/tests/mutation/` | Independent evaluator of the Runner; never weaken a rule to obtain PASS. |
| Storage | Azure Blob Storage JSON documents (see `README.md`) | No database migrations exist; do not invent one. |
| CI | `.github/workflows/` | Changing a workflow is a governance change: justify it in the PR, never weaken a gate. |
| Documentation | `docs/`, `docs/development/` | Product / architecture phases ship a `docs/enterprise-*.md` design record when applicable; governance or documentation-only phases use their canonical development document under `docs/development/` as the phase record. Never create an enterprise document only to satisfy wording. |

Teacher and student product behaviour, grading semantics, assessment model semantics and the coding question version
families are **product decisions of the owner**. An agent changes them only when the phase it was given asks for it.

## 2. Authority

The **repository owner is the final merge authority.** Nothing merges to `main` without the owner performing the merge
manually after an independent review.

Agents **may**:

- create branches and push normal commits to their assigned branch;
- modify files on that branch within the scope of the assigned phase;
- run tests, builds, lint, mutation campaigns and local harness runs;
- open pull requests and update their bodies;
- respond to review findings with a Review Fix commit on the same branch.

Agents **must NOT**:

- merge their own pull request, or any pull request;
- enable auto-merge, or ask another agent or bot to merge;
- force-push, rebase, amend, squash or otherwise rewrite history that has been pushed for review;
- deploy to production or to the live Coding Runner without explicit, written owner authorization for that deployment;
- rotate, read out, print, or move secrets, HMAC keys, tokens or connection strings;
- mutate production data, production Azure settings, DNS, NSG rules, app settings or VM configuration;
- weaken, skip, disable, quarantine or loosen a test, a lint rule, a bundle budget or a CI gate to obtain green;
- copy or cherry-pick unmerged work from another parallel branch (section 7).

## 3. The canonical development loop

Every phase, hotfix and review fix follows the same loop. Steps are not skipped; a step that does not apply is stated as
not applicable in the report, with the reason.

```
baseline gate
→ branch
→ fail-first proof (when fixing a defect)
→ implementation
→ focused tests
→ full validation
→ mutation proof (for critical invariants)
→ exact-head CI
→ independent review
→ review fix (if required) → independent re-review
→ owner manual merge
→ post-merge verification
```

## 4. Baseline gate

Before changing anything:

1. `git fetch origin --prune`.
2. Confirm `origin/main` is the SHA named in the phase instruction. If it moved because another approved PR merged,
   adopt the new `origin/main` as the baseline and **record both SHAs** in the report. Never reset `main` backwards.
3. Confirm a clean working tree, no merge / rebase / cherry-pick in progress, and no stash you depend on.
4. Confirm the baseline contains the merged histories the instruction names (for example by locating the merge commits).

## 5. Branches and commits

- One phase = one branch = one pull request. Branch names: `feature/<phase>-<short-topic>` (hotfixes: `hotfix/<topic>`).
- **Normal commits only.** One commit per step (implementation, review fix N, reconciliation merge). No amend, no
  squash, no rebase, no force-push once a commit has been pushed for review.
- Reconciliation with `main` is a **normal merge commit** (`git merge origin/main`), never a rebase.
- Commit messages describe the change and its evidence. Agent-session attribution trailers are allowed when the owner's
  tooling adds them; **model or vendor identifiers never appear in source code, code comments or tests.** Governance
  documents name tools only to describe roles, never to make a rule depend on one vendor.
- Never commit secrets, `local.settings.json`, `*.env`, harness result files or build output. Never commit a file while a
  mutation campaign has a mutant applied; wait for the byte-for-byte restore and check `git status` first.

## 6. Exact-head rule

A report may claim CI success **only for the exact final commit SHA proposed for merge**. Green CI on an earlier commit is
not evidence for a newer head, and a workflow that did not run on the head (path filter, skipped job) is reported as
"not run on this head", not as green. The report names the SHA, the workflow, the run attempt and the conclusion.

## 7. Parallel windows and reconciliation

Several agents may work in parallel from the same baseline. Rules:

- Do not read, copy or cherry-pick another window's unmerged commits. Shared changes arrive only through `main`.
- Before the final independent review, run `git fetch origin --prune`. If `origin/main` advanced: `git merge origin/main`
  as a **normal merge commit**, resolve conflicts conservatively (keep both sides' intent, for example the union of two
  `.gitignore` additions), regenerate generated files with the repository tooling, and **run full validation again**.
- The final CI must run on the reconciled exact head. A reconciliation that changes a measured outcome (a scenario that now
  passes, a count that changed) is explained in the PR with before / after evidence.

## 8. Fail-first policy

Bug, security and reliability fixes require **reproducible fail-first evidence** whenever technically feasible:

- Write the test, run it against the defective baseline (a detached worktree of the baseline SHA is the usual way), and
  record the failing assertion with the SHA in the PR.
- Then implement the fix and show the same test passing on the head.
- Do not write a test after the implementation and present it as fail-first unless it was actually executed against the
  defective baseline. A test that only pins current behaviour is reported as a **pin**, not as fail-first.
- When a fail-first run is not feasible (the defect needs real Docker on a remote VM, a vendor outage, a race that cannot be
  forced), say so and describe what was done instead.

## 9. Mutation policy

Critical **security, grading, concurrency, durability and authority** invariants receive mutation proof when appropriate:
a deliberate defect is planted (a guard removed, a comparison inverted, a lock dropped), the suite runs, and the mutant
is **KILLED** only if a test fails because of it.

- A **timeout is not a killed mutant.** Report it as TIMEOUT, re-run in isolation, and treat an unexplained second timeout
  as a surviving mutant.
- A survivor is a finding: strengthen the test or show the mutant is equivalent, and say which.
- **Files are restored byte-for-byte after each mutation** (hash-verified), even when the run throws or is interrupted.
  `git status` must be clean afterwards. The Runner harness `runner/tests/mutation/load-mutations.js` is the reference
  implementation of these rules.
- Never run a mutation campaign concurrently with another test run on the same files.

## 10. Safety invariants that no phase may weaken

### Grading safety

Never manufacture an academic zero, a failing grade, or a silent "no answer" because of:

- infrastructure failure, Runner unavailability or `RUNNER_BUSY` backpressure;
- callback failure, lost or duplicate delivery;
- a malformed or unsupported question version;
- a stale result, a superseded job revision, or a corrupted / ambiguous authority record;
- any state the code cannot classify with certainty.

Prefer, in the order the existing architecture provides: fail closed, a retryable technical state, the recovery sweep,
teacher review (`reviewRequired`), explicit teacher decision. Idempotent application of a grade is mandatory; a repeated
callback never changes an already applied score.

### Coding safety

Preserve, in every change touching coding assessment:

- **trusted hidden-test grading**: expected outputs, weights, titles and marks never leave the API; the Runner receives
  only opaque case tokens and stdin;
- **Runner isolation**: one disposable hardened sandbox per execution, compile once / fresh runtime per case, hard wall
  clock, bounded output, no network, no container left behind;
- **API-owned grading authority**: the Runner executes and reports raw evidence; the API compares, weights and decides;
- **versioned coding question semantics**: version families are immutable once published; new behaviour is a new version;
- **`reviewRequired` compile-error policy**: a compile error on official grading routes to teacher review, never to a zero;
- **target revision authority**: the durable target record decides which job revision may deliver; stale revisions are
  withheld and rejected (`409 STALE_RESULT`);
- **callback / HMAC boundaries**: three distinct keys (runner request, callback, recovery sweep), signature + freshness +
  replay checks on both sides, keys never logged.

## 11. Deployment boundaries

Five tiers exist. Reports name the tier that was actually exercised; "nothing deployed" is only true when none of tiers
3–5 happened.

| Tier | What it is | Who triggers it |
|---|---|---|
| 1. Local tests | Vitest, Node test runner, local Docker suites, local harness runs | the agent |
| 2. CI | GitHub Actions on the exact head (Quality Gate, Runner security & smoke, load harness) | every push / PR, automatically |
| 3. Azure PR preview | `Build and Deploy Job` creates a Static Web Apps **preview environment for a pull request only when it succeeds** after the Quality Gate passed on that head | opening or updating a PR triggers the job automatically; a failed, cancelled or skipped job creates no preview |
| 4. Production Static Web App | the same workflow on a push to `main` | the owner's merge |
| 5. Live Coding Runner VM | `runner/deploy/azure-vm/` material applied to the real VM (images, service, settings) | **the owner, explicitly, never an agent** |

- **Never report "nothing deployed" when a PR preview was actually created.** Say "PR preview environment created by the
  workflow; no production or Runner deployment." A preview exists **only when the `Build and Deploy Job` succeeded** on
  the reported head: report the observed job result, and never claim a preview when that job failed, was cancelled or
  did not run.
- **Never deploy the live Runner** (build / push images to the VM, restart the service, change its env file, Caddy, Docker
  daemon or systemd unit) unless the owner explicitly authorizes that deployment in writing.
- Never run a load or certification scenario against production. The harness refuses without
  `SMARTASSESS_ALLOW_PRODUCTION_LOAD_TEST=I_UNDERSTAND`; an agent never sets that variable.
- Never use the Azure CLI, portal or ARM APIs to change anything. Read-only inventory is allowed only when a phase asks.
- The scheduled workflow `coding-grading-recovery.yml` calls the production recovery sweep; do not edit its schedule,
  URL or key handling without owner authorization.

## 12. Testing expectations

See `docs/development/validation-matrix.md` for the required set per change class. Minimum for any PR:
`npm test`, `npm run lint`, `npx tsc -b`, `npm run build` (includes the bundle guard), `git diff --check`.

- Tests are evidence, not decoration: every new behaviour has a focused test; every fixed defect has a fail-first test.
- Known flaky test policy: the repository has one documented timing-sensitive UI test (`src/GovernancePanel.14b.test.tsx`,
  the 409 conflict alert). If it fails in CI on an unrelated PR, **do not patch it inside that PR**; record the failure,
  re-run the job once (or ask the owner to, when re-run permission is missing), and treat a second failure on the same
  head as real. Any other failure is real until root-caused.
- Never change a test's expectation to match a defect. Never add `skip`, `only`, `todo` or a widened timeout to make CI
  pass.
- Documentation-only PRs still run the root suite and CI; they do not need manual Docker runs. Any change under
  `runner/gateway/**`, `runner/workers/**` or the official grading path must pass the Runner CI (`coding-runner-security.yml`),
  which builds the worker images and runs the real-Docker suites.

## 13. Independent review handoff

When implementation is complete the agent **stops** and hands over. The handoff is a report that lets a reviewer who did
not watch the work verify every claim:

- baseline SHA, branch, final head SHA, list of files changed;
- fail-first evidence (test names, failing assertion on the baseline SHA, passing on the head);
- full validation counts (pass / fail per suite) on the head, run locally;
- mutation table (id, what was planted, KILLED / SURVIVED / TIMEOUT, killed by which test);
- exact-head CI results per workflow, with run attempt;
- whether `main` moved and whether a reconciliation merge was made;
- deployment tier actually exercised (section 11);
- known limitations and anything not run, with reasons;
- PR number and state, auto-merge state (always OFF).

The PR body's first line is `⛔ DO NOT MERGE — INDEPENDENT REVIEW REQUIRED` until the owner merges. The independent
reviewer verifies the exact head, re-runs what it can, probes the change adversarially, and **does not modify production
code during the review**. Findings go back to the implementation agent as a Review Fix phase; the reviewer re-reviews the
new exact head. The owner merges manually with a normal merge commit after a CLEAN review, then post-merge CI on `main` is
verified and reported.

## 14. Quick reference

```bash
git fetch origin --prune && git status --porcelain          # baseline gate
npm ci && npm ci --prefix api                                # dependencies (Node 22.12+)
npm test                                                     # root Vitest suite: app + API + scripts (includes the governance contract check)
npm run lint && npx tsc -b && npm run build                  # lint, typecheck, build + bundle guard
git diff --check                                             # whitespace / conflict-marker check
npm --prefix runner test                                     # Runner unit suite (no Docker)
npm --prefix runner run test:docker                          # Runner real-Docker security + official grading suites (needs Docker)
npm --prefix runner run test:load && npm --prefix runner run test:load:mutation   # harness suites + mutation campaign
```
