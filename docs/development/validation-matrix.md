# Validation matrix — which checks a change must pass before it is handed to independent review

Phase 18A. Companion to `AGENTS.md` §12. This matrix documents **when** each existing check is required; it does not add,
remove or weaken any workflow. CI remains the authority on the exact head; the local runs are how the implementation agent
proves readiness before pushing and how the reviewer re-verifies.

## 1. The checks

| # | Check | Command (repository root) | Runs in CI | What it proves |
|---|---|---|---|---|
| C1 | Root unit / API / UI tests | `npm test` (Vitest: `src/**`, `api/tests/**`, `scripts/**`) | Quality Gate, every push / PR | app, API handlers in-process against an in-memory blob container, script guards, the repository governance contract |
| C2 | Lint | `npm run lint` (oxlint; fails on error-level findings only) | Quality Gate | no rules-of-hooks or other error-level findings; warning baseline reported, not fatal |
| C3 | TypeScript build / typecheck | `npx tsc -b` | Quality Gate (inside `npm run build`) | the app and tooling type-check with the project references |
| C4 | Application build | `npm run build` (= `tsc -b` + `vite build` + bundle guard) | Quality Gate | the production bundle builds |
| C5 | Bundle guard | `npm run check:bundle` (after a build) | Quality Gate (inside `npm run build`) | initial JavaScript graph within its gzip budget; heavy modules and learning visuals stay lazy |
| C6 | Runner unit suite | `npm --prefix runner test` | Runner security & smoke, every push / PR | gateway, auth, registry, queue, journal, target authority, admission; no Docker |
| C7 | Docker security / smoke tests | `npm --prefix runner run test:docker:security` | Runner security & smoke (after building the images) | real sandboxes: isolation, limits, cleanup, practice end-to-end |
| C8 | Official grading Docker tests | `npm --prefix runner run test:docker:official` | Runner security & smoke | compile once / fresh runtime per case, cross-case isolation, end-to-end through the real API handlers |
| C9 | Mutation tests | harness: `npm --prefix runner run test:load:mutation`; phase-specific campaigns as documented in the phase's design record | Load harness workflow (harness campaign only) | critical invariants are enforced by tests, not by luck; files restored byte-for-byte |
| C10 | Load / certification harness | `npm --prefix runner run test:load`; bounded local qualification `npm --prefix runner run load:qualify:local`; real-Docker load suite `npm --prefix runner run test:docker:load` | Load harness workflow (path-filtered; real-Docker load is manual `workflow_dispatch`) | admission, accounting identity, correctness gates, qualification verdicts; never against production |
| C11 | diff-check | `git diff --check` (and `git diff origin/main --check` before pushing) | not in CI | no trailing whitespace, no conflict markers |
| C12 | Shared-finalization drift | part of C1 (`api/tests/shared-finalization-drift-14a.test.js`) | Quality Gate | the generated CJS matches the TypeScript source; regenerate with `node scripts/build-shared-finalization.mjs` |
| C13 | Route authorization inventory | part of C1 (`api/tests/route-auth-inventory-11a.test.js`) | Quality Gate | no new anonymous route |
| C14 | Repository governance contract | part of C1 (`scripts/repo-governance-contract.test.mjs`) | Quality Gate | `AGENTS.md`, the development documents and the PR template exist and keep their non-negotiable rules |

## 2. Required set per change class

`R` = required locally before the handoff and must be green in CI on the exact head. `CI` = not required locally, but the
workflow runs on every PR anyway and must be green. `P` = required when the listed path is touched (the workflow's path
filter then runs it in CI too). `—` = not applicable; say so in the report.

| Change class | C1 tests | C2 lint | C3 tsc | C4 build | C5 bundle | C6 runner unit | C7 docker sec. | C8 docker official | C9 mutation | C10 harness | C11 diff-check |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Documentation only (`docs/**`, `*.md`, PR template) | R | R | R | R | R | CI | CI | CI | — | — | R |
| Frontend (`src/**` excluding shared finalization) | R | R | R | R | R | CI | CI | CI | R for grading / authority / concurrency logic | — | R |
| Shared finalization source (`src/**` compiled to API CJS) | R + regenerate | R | R | R | R | CI | CI | CI | R | — | R |
| API (`api/src/**`) | R | R | R | R | R | CI | CI | R when the official grading path is touched | R for grading / auth / durability / idempotency | — | R |
| Runner gateway or workers (`runner/gateway/**`, `runner/workers/**`) | R | R | R | R | R | R | R (local Docker when available; CI always) | R | R | P (gateway changes trigger the harness workflow) | R |
| Runner deployment material (`runner/deploy/**`) | R | R | R | R | R | R | CI | CI | — unless a preflight / readiness invariant changes | — | R |
| Load / certification harness (`runner/tests/load/**`, `runner/tests/mutation/**`) | R | R | R | R | R | R | CI | CI | R (campaign must be 100 % killed) | R | R |
| CI workflows (`.github/workflows/**`) | R | R | R | R | R | CI | CI | CI | — | P | R + a written justification that no gate was weakened |
| Scripts / tooling (`scripts/**`) | R | R | R | R | R | CI | CI | CI | R when the script is a guard | — | R |

Notes:

- A **documentation-only PR does not run Docker manually.** The Runner workflow still builds the images and runs the real
  Docker suites in CI on every PR; its result is reported like any other exact-head result.
- **Production Runner changes must satisfy the existing Runner CI.** A missing Docker daemon or a missing worker image fails
  that workflow; nothing is skipped. When local Docker is unavailable to the agent, the report says so and CI is the proof.
- The mutation column is about **new or changed critical invariants** (security, grading, concurrency, durability,
  authority). Pure refactors with unchanged tests do not need a new campaign but must keep the existing ones green.
- Any new dependency (root, `api/`, `runner/`) is itself a governance change: name it, justify it, and show the lockfile
  diff. Documentation and governance phases add none.

## 3. Order of operations before the handoff

1. Focused tests for the change (fail-first first, when fixing a defect).
2. `npm test` (full root suite), `npm run lint`, `npx tsc -b`, `npm run build`.
3. Runner suites per the matrix.
4. Mutation campaign per the matrix, in isolation, then `git status` must be clean.
5. `git diff --check`, review the diff adversarially: what would make CI reject it?
6. Commit (normal), push, open or update the PR, wait for every workflow on the exact head.
7. Fetch; if `origin/main` advanced, normal merge and repeat 2–6 on the reconciled head.

## 4. Known timing-sensitive test

`src/GovernancePanel.14b.test.tsx` ("a 409 on a decision shows the conflict message…") occasionally fails under CI load.
Policy (`AGENTS.md` §12): not patched inside unrelated PRs; one re-run (owner-triggered when the agent lacks permission);
a second failure on the same head is real. Local isolated re-run of the file is acceptable evidence that the failure was
load-related, and is reported together with the CI attempt numbers.

## 5. What is intentionally not in this matrix

- Browser-driven visual checks (`browser-harness/`, `scripts/check-code-editor-browser.mjs`) are phase-specific evidence
  requested by the owner, not a standing gate.
- Production smoke checks are **read-only** and performed by the owner after a merge; an agent performs one only when the
  phase instruction asks and never with write operations.
- The scheduled recovery sweep workflow is an operational job, not validation.
