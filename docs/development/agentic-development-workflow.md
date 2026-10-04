# Agentic development workflow — how the owner, implementation agents, independent reviewers and CI cooperate

Phase 18A. This document expands the contract in the root `AGENTS.md`. Where the two disagree, `AGENTS.md` wins and this
document has a defect; open a Review Fix for it.

The workflow is **tool-neutral**. "Implementation agent" today is usually Claude Code and "independent reviewer" is usually
ChatGPT or a second Claude Code session; OpenAI Codex or any later tool takes either seat under exactly the same rules.
Nothing in the repository, its CI or its documents depends on one vendor's product.

---

## 1. Responsibility model

| Role | Holds | Never does |
|---|---|---|
| **Repository owner** | final product authority; final merge authority; the only hand that deploys the live Coding Runner or changes Azure | delegates the merge to an agent or to auto-merge |
| **Implementation agent** | implementation on its assigned branch, tests, evidence, mutation campaigns, PR preparation, Review Fix commits | merges, deploys, rewrites reviewed history, touches another window's unmerged work |
| **Independent reviewer** | verification of the exact head: re-runs, adversarial probes, reading the diff against the invariants; the written verdict | modifies production code during the review (a Review Fix is a separate, named phase, usually executed by the implementation agent) |
| **GitHub Actions** | independent, repeatable evidence on the exact head: Quality Gate, Runner security & smoke, load harness, PR preview | is treated as optional, re-run until green, or weakened |
| **Codex / future agents** | implementation or review seat, operating under `AGENTS.md` | bypasses repository governance because its tooling makes a shortcut easy |

A single person may hold the owner seat and direct both agents; the seats stay distinct so that no change is implemented,
reviewed and merged by the same party.

## 2. Phase lifecycle

A **phase** is one bounded unit of work with a name (for example `17F-B3`, `18A`), one branch, one pull request and one
design record in `docs/`. Its life:

1. **Instruction.** The owner issues the phase instruction: mission, scope boundary, expected baseline SHA, required
   evidence, final-report shape. The instruction may tighten `AGENTS.md`; it cannot loosen it.
2. **Baseline gate.** `AGENTS.md` §4. The agent records the baseline SHA it actually used.
3. **Audit.** Read the code the phase touches before writing. For product phases the audit is recorded in the design record
   (`docs/enterprise-<area>-<phase>.md`): what exists, what is missing, which invariants are at risk.
4. **Fail-first.** For defects: the reproducing test executed against the baseline (detached worktree), failing assertion
   captured with the SHA. `AGENTS.md` §8.
5. **Implementation** in the smallest set of files that honours the scope boundary.
6. **Focused tests**, then **full validation** (`docs/development/validation-matrix.md`).
7. **Mutation proof** for critical invariants. `AGENTS.md` §9.
8. **Documentation**: the design record, README or operator docs where behaviour or operation changed.
9. **Commit and push** normal commits; **open the PR** with the template, first line `⛔ DO NOT MERGE — INDEPENDENT REVIEW
   REQUIRED`, auto-merge off.
10. **Exact-head CI.** Wait for every workflow that runs on the head; report per workflow. `AGENTS.md` §6.
11. **Reconciliation check.** If `origin/main` advanced, normal merge, full validation again, CI on the reconciled head.
    `AGENTS.md` §7.
12. **Handoff report** (section 5 below). The agent **stops**.
13. **Independent review** (section 4). Verdict: `CLEAN — APPROVED FOR OWNER MERGE` or `NOT READY — REVIEW FIX REQUIRED`
    with numbered findings.
14. **Review Fix N** (if required): one normal commit per review round on the same branch, PR body appended, exact-head CI,
    **independent re-review** of the new head.
15. **Owner manual merge**: a normal merge commit pinned to the reviewed head SHA. Never squash, never rebase, never
    auto-merge.
16. **Post-merge verification**: the merge commit's parents and tree are checked against the reviewed head; CI on the new
    `main` is confirmed green; the result is reported before the next phase starts.

## 3. Evidence standards

An evidence claim is acceptable only if a reviewer can reproduce it from the report without asking:

| Claim | Minimum evidence |
|---|---|
| "fail-first" | test file and case names; baseline SHA; the failing assertion text (`expected … actual …`); the passing run on the head |
| "tests pass" | command, head SHA, pass / fail counts per suite (root Vitest, Runner unit, Docker suites if run) |
| "mutation proof" | table: id, planted change, outcome KILLED / SURVIVED / TIMEOUT, killing test; confirmation files were restored byte-for-byte and `git status` is clean |
| "CI green" | workflow name, exact head SHA, run attempt number, conclusion; "not run on this head" when a path filter skipped it |
| "nothing deployed" | which of the five tiers in `AGENTS.md` §11 happened; a PR preview is a deployment of tier 3 and is always named |
| "no behaviour change" | the diff touches only documentation, tests, or tooling, listed by file |
| "reconciled" | merge commit SHA with both parents; conflict files and how each was resolved; validation re-run counts |

Numbers that change what the reader does (counts, SHAs, attempts) go in tables; prose carries the reasoning.

## 4. Independent review protocol

The reviewer receives: PR number, expected exact head SHA, expected base SHA, the phase instruction, and the handoff report.

1. **Verify identity.** `git fetch`, confirm the PR head equals the expected SHA and the base is the expected `main`.
   Any mismatch stops the review.
2. **Read the diff against the invariants** in `AGENTS.md` §10, the scope boundary of the instruction, and the design
   record. Look for scope creep, weakened tests, widened timeouts, skipped cases, new dependencies, secrets, model or
   vendor identifiers in source code, code comments or tests.
3. **Re-run what can be re-run**: root suite, Runner unit suite, harness suites, the mutation campaign (in isolation,
   never concurrently with another run on the same files), focused fail-first tests against a detached baseline worktree.
4. **Probe adversarially.** Write throw-away probes in a scratch location (never committed): timing changes, reordered
   awaits, forced failures of the new code paths, boundary inputs. Try to break the new tests, not only the new code.
5. **Check CI on the exact head**, including run attempts (a re-run is recorded as attempt 2 with the reason).
6. **Write the verdict.** Findings are numbered (`RF<n>-<k>`), each with severity, the failing scenario, and the evidence.
   `CLEAN — APPROVED FOR OWNER MERGE` only when nothing blocking remains; informational notes are allowed and labelled.
7. **Do not modify production code during the review.** If a one-line fix is obvious, it is still a finding; the
   implementation agent (or the reviewer, when the owner explicitly opens a Review Fix phase for it) makes the change as a
   new normal commit that is itself re-reviewed.
8. **Do not merge.** The verdict goes to the owner.

## 5. Handoff report (implementation agent → reviewer → owner)

The report follows the PR template sections and ends with one of the fixed final lines, so a reader who sees only the last
message knows the state:

- `PHASE <id> IMPLEMENTED — INDEPENDENT REVIEW REQUIRED`
- `REVIEW FIX <n> IMPLEMENTED — INDEPENDENT RE-REVIEW REQUIRED`
- `PR #<n> RECONCILED WITH <phase> — INDEPENDENT REVIEW REQUIRED`
- `FINAL DECISION: CLEAN — APPROVED FOR OWNER MERGE` / `FINAL DECISION: NOT READY — REVIEW FIX REQUIRED` (reviewer)
- `PR #<n> POST-MERGE VERIFIED — AWAITING OWNER INSTRUCTION FOR NEXT PHASE`

Every report states: baseline SHA, branch, head SHA, files changed, evidence per section 3, whether `main` moved,
whether reconciliation was required, PR state, auto-merge state (OFF), deployment tier exercised.

## 6. Parallel windows

The owner may run several implementation windows at once from the same baseline (for example three Phase 18 branches).

- Each window owns one branch and one PR and never reads another window's unmerged commits. Shared changes flow only
  through `main` after the owner merges them.
- Before its final review each window fetches and, if `main` advanced, performs a **normal merge** of `origin/main`,
  resolves conflicts conservatively (both intents preserved, generated files regenerated with the tooling), re-runs full
  validation and gets CI on the reconciled head. Rebase is forbidden because it rewrites commits a reviewer may have read.
- If a reconciliation changes a measured outcome, the PR explains it with before / after evidence (the Phase 17F-B10
  reconciliation with 17F-B3, where a historical finding became CLOSED, is the reference example:
  `docs/enterprise-coding-assessment-17f-b10-certification.md` §18).
- Windows do not coordinate through shared files on disk, shared scratch directories or shared mutation runs.

## 7. CI, flakes and re-runs

- Four workflows exist: `azure-static-web-apps-*.yml` (Quality Gate → Build and Deploy → preview / production),
  `coding-runner-security.yml` (Runner unit + real Docker on every PR), `coding-load-harness.yml` (path-filtered harness
  suites + mutation + bounded local qualification; manual real-Docker load), `coding-grading-recovery.yml` (a scheduled
  operational job calling the production recovery sweep; it is not CI evidence and agents do not edit it).
- "Flake" is never a root cause. The only documented timing-sensitive test is `src/GovernancePanel.14b.test.tsx`
  (409 conflict alert). On an unrelated PR it is not patched; the job is re-run once (by the owner when the agent lacks
  permission, which is the normal case) and a second failure on the same head is treated as real.
- A failure that is also red on `main` is reported as such with the evidence; it is still never silent.
- Re-running a job never changes the exact-head rule: the report cites the attempt that produced the conclusion.

## 8. Onboarding a new agent (Codex or any other tool)

1. Read `AGENTS.md`, this document, `docs/development/validation-matrix.md`, `README.md`, `runner/README.md`.
2. Read the design record of the area you will touch (`docs/enterprise-*.md`) and the tests next to the code.
3. Run the baseline gate and the root suite once before changing anything, so that a pre-existing failure is known.
4. Work only inside the scope boundary of your instruction; when the boundary and the task conflict, stop and report
   instead of widening the scope.
5. Produce evidence as you go (fail-first runs, mutation tables, CI attempts) rather than reconstructing it at the end.
6. Hand off with the report shape in section 5 and stop. The owner merges.

## 9. Glossary

| Term | Meaning here |
|---|---|
| Baseline | the `origin/main` SHA a branch starts from (or adopts after a reconciliation) |
| Exact head | the final commit SHA proposed for merge; the only SHA for which CI claims are valid |
| Fail-first | a test executed against the defective baseline and shown failing before the fix exists |
| Pin | a test that records current behaviour; valuable, but not fail-first evidence |
| Mutation | a deliberately planted defect; KILLED when a test fails because of it; TIMEOUT is not a kill |
| Reconciliation | a normal merge of `origin/main` into the branch before final review |
| Review Fix N | the n-th round of changes answering independent review findings, each a normal commit on the same branch |
| Deployment tier | one of local / CI / PR preview / production Static Web App / live Runner VM (`AGENTS.md` §11) |
| Design record | the `docs/enterprise-*.md` file written for a phase |
