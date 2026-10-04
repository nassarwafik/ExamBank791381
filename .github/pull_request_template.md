⛔ DO NOT MERGE — INDEPENDENT REVIEW REQUIRED. AUTO-MERGE OFF.

<!--
Repository operating contract: AGENTS.md · workflow: docs/development/agentic-development-workflow.md ·
required checks: docs/development/validation-matrix.md. Keep every section; write "not applicable — <reason>" rather
than deleting one. Replace every <placeholder>. Never paste secrets, keys, connection strings or hostnames here.
-->

## Phase and scope

- **Phase:** <id and title>
- **Scope boundary (from the instruction):** <what this PR may and may not touch>
- **Product behaviour change:** <none | describe>

## Baseline and branch

| Item | Value |
|---|---|
| Baseline SHA (`origin/main` at branch time) | `<40-hex>` |
| Baseline moved during development? | <no | yes: new baseline `<40-hex>`, reason> |
| Branch | `<feature/...>` |
| Head SHA proposed for merge | `<40-hex>` |
| Reconciliation merge commit (if `main` advanced) | <none | `<40-hex>` with parents, conflicts and how each was resolved> |

## Files changed

<list every file with one line on why; generated files say how they were regenerated>

## Fail-first evidence

<test file and case names · baseline SHA they were executed against · the failing assertion text · the passing run on the
head. "not applicable — no defect fixed" for pure features, documentation or tooling. A pin is labelled as a pin.>

## Tests

| Suite | Command | Head SHA | Result |
|---|---|---|---|
| Root (app + API + scripts) | `npm test` | `<sha>` | <pass / fail counts> |
| Runner unit | `npm --prefix runner test` | `<sha>` | <counts | not applicable — reason> |
| Docker security / official | `npm --prefix runner run test:docker` | `<sha>` | <counts | CI only — reason> |
| Harness | `npm --prefix runner run test:load` | `<sha>` | <counts | not applicable> |

## Mutations (where applicable)

| Id | Planted defect | Outcome (KILLED / SURVIVED / TIMEOUT) | Killed by |
|---|---|---|---|
| <id> | <what was changed> | <outcome> | <test> |

Files restored byte-for-byte: <yes, hash-verified | not applicable>. `git status` clean afterwards: <yes>.

## Backward compatibility

<data formats, stored documents, API contracts, question version families, URLs, service worker; what an old client or an
in-flight job sees>

## Security and privacy

<auth boundaries, HMAC / signature paths, secrets (none committed, none logged), student data, hidden expected outputs,
Runner isolation; "no security-relevant change" when true>

## Deployment boundary

- Tier exercised (see `AGENTS.md` §11): <local tests | CI | PR preview environment created by the workflow | production | live Runner VM>
- PR preview: a preview environment exists **only when the `Build and Deploy Job` succeeded** on the head above. State the observed result: <preview created — job success | no preview — job failed / cancelled / did not run>. Never claim a preview when that job did not succeed.
- Production Static Web App: <not deployed by this PR; deploys on the owner's merge>
- Live Coding Runner VM: <not deployed; requires explicit owner authorization>
- Azure settings / secrets / DNS / NSG / database: <none changed>

## Exact-head CI

| Workflow | Head SHA | Attempt | Conclusion |
|---|---|---|---|
| Quality Gate — Tests & Build | `<sha>` | <n> | <success / failure / not run on this head> |
| Build and Deploy Job (PR preview) | `<sha>` | <n> | <…> |
| Runner unit, Docker security & smoke tests | `<sha>` | <n> | <…> |
| Coding Load & Certification Harness | `<sha>` | <n> | <… | not triggered: path filter> |

## Known limitations

<what was not run, what was not proven, follow-ups the owner should know about>

## Independent-review status

- [ ] Handed to independent review (final line of the report: `… — INDEPENDENT REVIEW REQUIRED`)
- [ ] Review Fix rounds: <none | RF1 `<sha>`, RF2 `<sha>` …>, each re-reviewed
- [ ] Reviewer verdict on the head above: <pending | CLEAN — APPROVED FOR OWNER MERGE | NOT READY — REVIEW FIX REQUIRED>
- [ ] Owner manual merge (normal merge commit, auto-merge OFF)
