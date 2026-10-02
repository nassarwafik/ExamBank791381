# Phase 17F-A1.1 — Production Pilot Deployment Hardening

> ⛔ Awaiting independent review. **No Azure resource was created or changed, no secret was generated, rotated or uploaded,
> no Runner was enabled, no PR was merged.** Phase 17F-A2 (live activation) has **NOT started**.

**Scope (deliberately narrow):** close three MINOR findings of the independent review of Phase 17F-A1 ([`enterprise-coding-assessment-17f-a1.md`](enterprise-coding-assessment-17f-a1.md))
before 17F-A2 — M1 dedicated-disk **device** separation, M2 image-manifest **structural** validation, M4 tracked deployment
file **reference** guard. Deployment tooling and tests only.

**Out of scope / untouched:** student UI, teacher UI, grading authority, coding callbacks, question models, grading scores,
Runner sandbox execution semantics (`runner/gateway/*`, `runner/workers/*`, `api/src/*` are byte-for-byte unchanged), the
17E-D teacher evidence, 17F-A2 live activation. M3 (future recovery timestamp), M5 (sweep ownership test gap) and M6
(`RUNNER_BUSY` monitoring) are **not** fixed here (see §9).

| | |
|---|---|
| Baseline | `origin/main` `6bc37696ab744074c3ec21948991a089634f200e` (merge of PR #244, Phase 17F-A1) |
| Branch | `hotfix/17f-a1-1-deployment-hardening` — one branch, one PR, no rebase, no force-push, no amend after push, auto-merge off |
| Canonical runbook | [`runner/deploy/azure-vm/README.md`](../runner/deploy/azure-vm/README.md) §3 "Disks", §4, §5.2, §5.8 |

## 1. M1 — dedicated disk / device separation (preflight `storage`, exit 22)
**Finding.** The 17F-A1 "dedicated disk" rule proved that `RUNNER_JOURNAL_DIR` is a mount point (`/proc/mounts` via
`mountFor`) but not that it sits on a distinct **device**: `mount --bind /srv/journal /data/smartassess-runner` is a mount point
in `/proc/mounts`, `findmnt` and `df`, and still writes to the OS disk; `DockerRootDir=/var/lib/docker` was only checked for
free space and could live on `/`.

**Fix.** A new pure module [`runner/deploy/azure-vm/mountinfo.js`](../runner/deploy/azure-vm/mountinfo.js) reads
`/proc/self/mountinfo` (injected text — no I/O, no process): `parseMountInfo` (octal unescape, optional fields, ` - `
separator, malformed-line count), `mountOf` (longest path-boundary prefix, later entry wins on an overmount) and
`storageSeparation({ mountInfo, journalDir, dockerRootDir })`, which enforces, with device identity = `major:minor`:

| Invariant | Operator message (never a mount-table dump) |
|---|---|
| journal device ≠ root device | `Journal storage must be on a dedicated device separate from the OS disk.` |
| journal path is the filesystem mount of its own device (mountinfo `root` = `/`); a bind mount is refused — from the OS disk **or any other disk** | `… separate from the OS disk: <dir> is a bind mount (of <root>), not the filesystem mount of its own device` |
| Docker root device ≠ root device (covers `DockerRootDir` = `/` and an unmounted `/var/lib/docker`) | `Docker storage must be mounted on a dedicated device separate from the OS disk.` |
| journal device ≠ Docker device (covers Docker's root dir inside the journal disk) | `Journal and Docker storage must not share the same backing device.` |
| mountinfo unreadable / malformed / no root mount / unknown Docker root dir | fails **closed** (`… storage devices unknown, refusing to start`) |

The preflight runs the check as `storage` (new `EXIT.STORAGE = 22`) after `docker-disk`, only when the 17F-A1 `journal` check
passed and the Docker daemon answered (so the symlink / mount-point / fs refusals still fire first, exit 20). Production profile
FAILS, development profile WARNS (one-disk developer hosts; `tests/docker/deploy-preflight.rtest.js` runs the real gate there).
`realDeps` gains `mountInfo: () => read("/proc/self/mountinfo")`. Docs: README §3 (four barriers; "a mount point alone is NOT
enough"; "three distinct storage roles — OS, journal, Docker"; "bind mounts from the OS disk do not qualify"), §4, §5.2
(`findmnt -no SOURCE,MAJ:MIN …`), exit-code line; activation checklist rows 5 / 13; A2-2 (two separate managed disks).

## 2. M2 — image manifest structural validation (exit 32 preserved)
**Finding.** The preflight accepted anything `JSON.parse` returned and compared `manifest.images[image] !== id` only when
`manifest.images` was truthy: `{}`, `[]` and `{"schemaVersion":1}` were reported as `(match manifest)`.

**Fix.** One shared contract, [`runner/deploy/azure-vm/image-manifest.js`](../runner/deploy/azure-vm/image-manifest.js):
`validateImageManifest(value, { images })` — root must be a plain object; only `schemaVersion` / `recordedAt` / `images` keys;
`schemaVersion === 1`; `recordedAt` (optional) an ISO-8601 string; `images` a non-empty plain object whose key set is **exactly**
the registry's image names (passed in from `registry.js`, never written here); every value `sha256:<64 lowercase hex>`; no two
images share an id. `parseImageManifest(text, …)` adds bounded (≤ 64 KB), strict JSON parsing and refuses duplicated JSON keys.
Nothing is normalized or repaired. The reader (`preflight.js`) fails `images` with exit **32** `image manifest invalid:
<reason>`; the writer ([`record-images.js`](../runner/deploy/azure-vm/record-images.js), now exporting `buildImageManifest`)
validates its own output with the same function before printing, so it can never produce what the reader would refuse. The
17F-A1 refusals (missing image, drift, unreadable manifest) are unchanged.

Invalid examples (exit 32): `{}` → `schemaVersion must be 1 (missing)`; `[]` → `root must be a JSON object`;
`{"schemaVersion":1}` → `images must be an object … (missing)`; `{"schemaVersion":2,"images":{…}}` → `schemaVersion must be 1`;
a manifest without the Java image → `missing image: smartassess-coding-java:17c-v1`; an empty id → `empty image id for …`;
`"latest"` / uppercase hex / 63 hex → `image id for … must be sha256:<64 lowercase hex>`; one id for two images → `duplicate image
id shared by … and …`; an extra `"evil/image:latest"` → `unexpected image: …`.
Valid example: `{ "schemaVersion": 1, "recordedAt": "2026-10-02T12:00:00.000Z", "images": { "smartassess-coding-python:17c-v1":
"sha256:<64 hex>", "smartassess-coding-java:17c-v1": "sha256:<64 hex>", "smartassess-coding-csharp:17c-v1": "sha256:<64 hex>" } }`
→ `PASS images … (match manifest)`.

## 3. M4 — tracked deployment file reference guard (git is the authority)
**Finding.** The 17F-A1 regression (`runner.env.example` silently excluded by `.gitignore` `*.env.*`) was only caught for the
README §4 table, with a hand-written `.gitignore` emulation. An operative command (`install … runner-env.example …` in §5.9), a
checklist step, a shell script or a Node tool referencing a missing or ignored file passed.

**Fix.** A test helper, [`runner/tests/unit/deploy-file-refs.js`](../runner/tests/unit/deploy-file-refs.js) (under
`tests/`, so it is not a deployment tool and may call git): `extractDeployRefs` finds repository artifact references in every
deployment file and the phase notes — anchored `runner/deploy/azure-vm/<file>` (also inside `/opt/smartassess-runner/current/…`,
`../…`, `file:///…`), runner-relative `deploy/azure-vm/<file>`, repository trees (`runner/scripts|gateway|workers|tests/…`,
`.github/workflows/…`, `api/src|tests/…`, `docs/…`, `src/…`), runner-relative `gateway/… scripts/… workers/… tests/…`, `$here/<file>`
and `$runner/<path>` in shell scripts, markdown link targets (relative to the document), the runbook table's first column, backticked
tool names / commands (`readiness.sh --deep`, `node smoke.js callback`) and relative `require()`s. Host runtime paths
(`/etc/…`, `/data/…`, `/var/lib/docker`, `/usr/bin/node`, `/proc/…`), URLs, anchors, wildcards, `node_modules` and prose words
(`docker.service`, `journald.conf`, `runner.example.invalid`) are never references. `checkDeployRefs` asks git: a reference is
satisfied only by a path in `git ls-files` that `git check-ignore -v --no-index` does not match (the violated rule, e.g.
`.gitignore:18:*.env.*`, is reported); a bare name is also satisfied by any tracked file of that exact name under `runner/`,
`api/` or `docs/`. No `.gitignore` emulation remains. The FILES test of `deploy-artifacts.rtest.js` keeps the cheap table check
and delegates the authority question to the same helper; the new REAL test scans the whole package.

## 4. Fail-first evidence (new tests on the untouched baseline `6bc3769`)
`node --test tests/unit/deploy-storage.rtest.js tests/unit/deploy-image-manifest.rtest.js tests/unit/deploy-file-refs.rtest.js`
→ **20 tests, 2 pass, 18 fail**:

| Test | Result on baseline | Why |
|---|---|---|
| DISK1 journal on the root device | **fail** — `exit 0` (journal check passed, no `storage` check) | real defect |
| DISK2 journal bind-mounted from an OS-disk dir | **fail** — `exit 0` | real defect |
| DISK3 `DockerRootDir` on the OS disk / `/` | **fail** — `exit 0` (`docker-disk` free space passed) | real defect |
| DISK4 journal and Docker on one device | **fail** — `exit 0` | real defect |
| DISK5 three distinct devices → PASS | **fail** — no `storage` check reported, `EXIT.STORAGE` undefined | new check absent |
| DISK6 symlink refusal intact | pass | regression anchor (17F-A1 protection) |
| DISK7 missing / malformed mountinfo | **fail** — `exit 0` | fail-closed absent |
| development profile warns | **fail** — no `storage` warn | new check absent |
| PARSE ×2 | **fail** — `Cannot find module '../../deploy/azure-vm/mountinfo.js'` | module absent |
| IMG1 `{}` / IMG2 `[]` / IMG3 `{"schemaVersion":1}` / IMG4 v2 | **fail** — `exit 0 []` (reported as match) | real defect |
| IMG5 missing Java image / IMG6 empty id | **fail** — refused only as `worker image differs from the recorded manifest` (drift), not as a structural defect | reported honestly: baseline exit 32 by accident of the drift path |
| IMG7 valid → PASS | pass | regression anchor |
| IMG8 writer / validator contract | **fail** — `Cannot find module '../../deploy/azure-vm/image-manifest.js'` | module absent |
| FILE1–FILE8, REAL | **fail to load** — `Cannot find module './deploy-file-refs.js'` | helper absent |

**M4 baseline mutation (old FILES guard).** With README §5.9 changed on the baseline to `install … runner/deploy/azure-vm/`
`runner.env.example …` (a non-existent, git-ignored name), `deploy-artifacts.rtest.js` passed **10 / 10** including FILES — the
regression class was invisible outside the table. The same mutation is HM6 below and is now caught.

## 5. Tests
| Suite | Tests | Runs in |
|---|---|---|
| `runner/tests/unit/deploy-storage.rtest.js` (new) | DISK1–DISK7, development profile, PARSE ×2 (10) | `npm --prefix runner test` |
| `runner/tests/unit/deploy-image-manifest.rtest.js` (new) | IMG1–IMG8, validator unit contract (9) | `npm --prefix runner test` |
| `runner/tests/unit/deploy-file-refs.rtest.js` (new) | FILE1–FILE8 (FILE5 / FILE6 against a real temporary git repository), REAL (9) | `npm --prefix runner test` |
| `runner/tests/unit/deploy-preflight.rtest.js` | baseline id list now includes `storage`; `deps()` gains `mountInfo` | `npm --prefix runner test` |
| `runner/tests/unit/deploy-artifacts.rtest.js` | FILES delegates to the git authority; D13 secret scan also covers this note | `npm --prefix runner test` |
| `api/tests/coding-guards-17b.test.js` | `RUNNER_DEPLOY` exact inventory + `mountinfo.js`, `image-manifest.js` (no process, literal requires) | `npm test` |
| `runner/tests/docker/deploy-preflight.rtest.js` | unchanged — the real gate in the development profile (storage WARNS there) | `test:docker:security` |

## 6. Mutations (each applied alone, targeted suite run, restored byte-for-byte; tree fingerprint identical before / after)
Targeted suites per mutation: `deploy-storage`, `deploy-image-manifest`, `deploy-file-refs`, `deploy-artifacts`, `deploy-preflight`
(unit). **7 / 7 killed.** Tree fingerprint (sha256 over `git ls-files` contents + `git status`) `10c14a40…bfac` before and after;
every mutated file restored byte-for-byte (`cmp`).

| Mutation | Change | Killed by |
|---|---|---|
| HM1 journal root-device equality accepted | drop `j.device === root.device` in `storageSeparation` | DISK1, PARSE storageSeparation |
| HM2 journal / Docker same device accepted | drop `dk.device === j.device` | DISK4, PARSE storageSeparation |
| HM3 bind mount from the OS disk treated as dedicated | disable the `j.root !== "/"` refusal | DISK2, PARSE storageSeparation |
| HM4 allow `{}` manifest | preflight accepts whatever `JSON.parse` returns (the 17F-A1 code) | IMG1, IMG2, IMG3, IMG4, IMG5, IMG6 |
| HM5 allow a missing Java image | drop the `missing image` rule from the validator | IMG5 (`validator` unit contract also) |
| HM6 README operative command (§5.9) references a non-existent deploy file (`runner.env.example`) | sed on the README | FILES (artifacts), REAL (file-refs) |
| HM7 referenced deploy file exists on disk but is git-ignored (`runner.env.example` created + referenced) | copy + sed; `git check-ignore -v` → `.gitignore:18:*.env.*` | FILES, REAL — reported as `README.md:261 → runner.env.example (ignored: .gitignore:18:*.env.*)` (the guard caught its own description of the mutation in this note too, until the path here was shortened) |

## 7. Validation
All on the final tree (Node 22, this container), in order:

| Step | Result |
|---|---|
| `npm --prefix runner test` | **142 / 142** pass (incl. the 28 new tests) |
| `npm test` (root vitest) | **611 files, 7547 tests** pass |
| `npx tsc -b` | clean |
| `npm run lint` (oxlint) | 99 warnings / 0 errors (= baseline; the one new warning this branch introduced was removed) |
| `npm run build` + `npm run check:bundle` | pass, bundle guard passed |
| `npm --prefix runner run build:images` | the three `17c-v1` images rebuilt |
| `npm --prefix runner run test:docker:security` | **28 / 28** pass (DP1 real sandboxes, DP2, DP3 smoke vs real gateway) |
| `npm --prefix runner run test:docker:official` | **13 / 13** pass |
| leftover sandbox containers (`docker ps -aq --filter label=smartassess.coding-runner=1`) | **0** |
| `api/tests/coding-guards-17b.test.js` | 22 / 22 (exact inventory incl. the two new pure modules) |

Fresh-clone proof and CI on the pushed head are recorded in the PR description.

## 8. Existing 17F-A1 protections (unchanged, re-verified by the existing suites)
Localhost binding, public 8787 refusal, Docker TCP refusal, symlink rejection, env-file permissions, key separation, callback
URL validation, journal / Docker free space, image drift, cgroup v2 gate, Caddy contract, systemd mounts + preflight, recovery
freshness, callback probe, staging-only pressure / crash tests, pilot capacity guards — `deploy-preflight.rtest.js`,
`deploy-artifacts.rtest.js`, the Docker suites and the 17B architecture guard all pass unchanged (the only edits to existing
tests: the `storage` id in the baseline list, the `mountInfo` fixture, and the FILES guard's authority).

## 9. Remaining known findings (NOT fixed here, by instruction)
| Finding | Status |
|---|---|
| M3 — a recovery `lastSuccessAt` in the future is judged fresh (`recovery-freshness.js judge`) | open, MINOR |
| M5 — sweep ownership test gap (`sweep-containers.js` removes only labelled containers; no negative test for a foreign container) | open, MINOR |
| M6 — `RUNNER_BUSY` is not in the monitoring checklist's alert list | open, MINOR |
| INFO findings of the 17F-A1 review | open |

**Phase 17F-A2 has NOT started.** No Azure resource, secret or activation flag was touched.
