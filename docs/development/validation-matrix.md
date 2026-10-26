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
| C15 | UX visual regression | `node scripts/ux-visual-gate.mjs` with `BASE_DIST` / `HEAD_DIST` (UX-R19b; see the script's header) | UX-R19b visual regression gate (`ux-visual-regression-r19b.yml`, path-filtered: `src/**`, `public/**`, the capture harness, the manifest), one job per viewport and theme (light and dark, UX-R18c2) | no page or scene the UX-R harness captures changes by more than 12 levels per channel unless the PR declares it in `docs/ux-r/visual-changes.json`; no harness check fails on the head only |
| C16 | Projects in real Chromium | each `node scripts/check-project-*-browser-*.mjs` with `PLAYWRIGHT_CORE_DIR` / `AXE_CORE_DIR` / `CHROMIUM_PATH` and `DIST` (see each script's header) | Projects Real Chromium Gate (`projects-browser-g.yml`, path-filtered: the project code and API, the app shell, `src/ui/**`, the browser harness, the checks), one job running every project check (each step runs even after an earlier one failed) | the project tracker's teacher and student journeys (P3, P4, P6, P7, P8, P10, G1, G3) in the production build over the real API: stored documents, keyboard and touch, no sideways scroll, axe without serious or critical violations; `scripts/projects-browser-ci.test.mjs` (part of C1) fails if a project check is not wired into the workflow |

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

- **C15 (UX-R19b)** is required in CI (`P`) for any change that touches `src/**`, `public/**` or the capture harness. A PR whose
  pages change on purpose declares each change (page, viewport, reason) in `docs/ux-r/visual-changes.json`; the gate's artifact holds
  the before, after and diff images for the reviewer.
- **C16 (projects in Chromium)** is required in CI (`P`) for any change that touches the project code, its API, the app shell
  or `src/ui/**`. A new project browser check is added as its own step in `projects-browser-g.yml` (the C1 guard enforces it).
- **A browser gate's artifact keeps its harness folder (Phase G-CI2).** Every harness writes to a folder whose name starts with
  a dot, and `actions/upload-artifact@v4` leaves hidden paths out unless the step sets `include-hidden-files: true`. Every upload
  of a hidden path sets it; `scripts/workflow-artifacts.test.mjs` (part of C1) fails otherwise.
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

## 5. Phase G-CI2 — browser-gate artifacts

**The defect.** Six browser gates uploaded their harness folder without `include-hidden-files: true`: L8, U1, 21a2, 21b, 21c and
21d. The upload step only warned «No files were found», and no artifact was created. The L8 gate's red run `39982297641`, for
example, left no artifact, so there was no record or screenshot to look at. G-CI found the same fault in its own gate and fixed
it there.

**The fix.** Each of the six upload steps sets `include-hidden-files: true`. So does the UX-R19b visual gate, whose step names
its files inside `.harness-visual/`. That gate's upload already worked; the setting keeps one rule for every gate and changes
nothing it uploads. No step, job, trigger, threshold or test changed.

**The guard.** `scripts/workflow-artifacts.test.mjs` reads every workflow and fails when an upload step names a hidden path
without the setting.
- **Fail-first:** on `main` `38db902e` it lists the 7 steps.
- **Mutation:** dropping the setting from L8 or from the visual gate, setting it to `false` on U1, or dropping it from 21d is
  killed in each case. The workflows were restored by SHA-256.

## 6. What is intentionally not in this matrix

- Browser-driven visual checks (`browser-harness/`, `scripts/check-code-editor-browser.mjs`) are phase-specific evidence
  requested by the owner, not a standing gate.
- Production smoke checks are **read-only** and performed by the owner after a merge; an agent performs one only when the
  phase instruction asks and never with write operations.
- The scheduled recovery sweep workflow is an operational job, not validation.

## 7. QA round 2, phase 4c — four stale browser checks and the worktree exclude

Baseline `5f4e6cb2`. The QA round 2 run of every browser check found four that no longer matched the product they certify. Each was
brought back to what it certifies, never loosened:

- `check-builder-overlay-browser.mjs`, `check-shared-confirm-browser-21e1.mjs`: their stylesheet-fidelity check requires the harness to
  load every App stylesheet whose rules name the builder's menus or dialogs. Since UX-R6 `assignments-pro.css` does (touch targets
  scoped to `.eb-assignments`, which never reach the builder), so both harnesses now load it after `shell.css`, in App's order. The
  fidelity rule is unchanged.
- `check-exam-focus-ring-browser-21e0-rf1.mjs`: the canonical platform ring outside the exam was a hard-coded `rgb(37, 99, 235)`, the
  pre-UX-R17 blue. The check now resolves the colour from the production `--eb-primary` token on the page, asserts it is an opaque
  colour different from every preset primary, and still requires the outside ring to be exactly `2px solid` that colour.
- `check-review-fix1-browser-21e1s2.mjs`: the teacher now lands on the dashboard and the builder opens on the Exam Studio home (21F.7).
  The check reaches the builder from the sidebar (the drawer on phone and zoomed layouts), switches to «الواجهة الكلاسيكية» (the classic
  builder it certifies), and continues through «الامتحانات المحفوظة» as before; its measurements are unchanged.
- Vitest (`vite.config.ts`): `test.exclude` = Vitest's defaults plus `**/.claude/worktrees/**`, so an agent's scratch git worktree is
  never collected as a second, stale copy of the suite (it was, during QA round 2). Proof: a failing test planted in
  `.claude/worktrees/qa-probe/` fails the run with the baseline config and is not collected with this one.

## 8. `App.credentialsLeave.s3` — a lazy-dialog reveal raced the default wait (fixed at the root)

During QA round 2 phase 4c, one full local run failed `src/App.credentialsLeave.s3.test.tsx` («another page or the logout asks…»)
with `no leave confirm`; it passed in isolation and on the re-run. Root cause: the App's confirmations use `useDeferredConfirm`,
whose dialog is a lazy chunk prefetched only when the browser is idle after sign-in. The test navigates right after sign-in, so the
leave guard's confirm rendered the lazy dialog on demand; it suspends once and React reveals it only after its Suspense throttle
(~300 ms), which under a fully loaded parallel run outlived the default 1 s `waitFor`. Proof: delaying only that lazy loader
(`lazyWithRetry` key `shared-confirm-dialog`) by 3 s makes the old test fail at the same step every time.

Fix: the test gives the App the eager `useConfirm` (identical contract and return shape, see `src/ui/useDeferredConfirm.tsx`), so
the guard's dialog renders in the same commit. No assertion and no timeout changed; the lazy path keeps its own tests
(`App.sharedConfirm.21e1`, `App.confirmPrefetch.21e1s2`, `deferredConfirmPrefetched.21e1s2`). The test still fails when the guard
never asks, or when «البقاء في الصفحة» leaves anyway (both planted and caught). It is not added to §4: it is no longer timing-sensitive.
