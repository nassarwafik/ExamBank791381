"use strict";
// Phase 17F-A1.1 (M4) — tracked deployment file REFERENCE guard — node:test, no Docker.
// 17F-A1 regression class: a template named runner.env.example matched the repo's `*.env.*` git-ignore rule, so it existed
// locally, was referenced by the runbook and was silently absent from the pushed tree. The 17F-A1 guard only read the README
// §4 table and emulated .gitignore by hand. This guard extracts every REPOSITORY artifact reference from the whole deployment
// package (docs, checklists, unit, Caddyfile, shell scripts, Node tools, phase notes) and lets git be the authority:
// `git ls-files` (tracked) and `git check-ignore -v --no-index` (ignored). Host runtime paths (/etc/…, /data/…, /var/lib/docker,
// /usr/bin/node) are never treated as repository artifacts.
//   FILE1 README table ref missing → fail       FILE2 README operative command ref missing → fail   FILE3 checklist ref missing → fail
//   FILE4 shell script ref missing → fail       FILE5 referenced file exists but is git-ignored → fail (real temp git repo)
//   FILE6 tracked → pass                        FILE7 host paths are not artifacts → pass            FILE8 case mismatch → fail
//   REAL  the actual deployment package: every referenced repository artifact is tracked and not ignored
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const F = require("./deploy-file-refs.js");

const DEPLOY = "runner/deploy/azure-vm";
const README = DEPLOY + "/README.md";
const refsOf = (text, file) => F.extractDeployRefs(text, { file }).map(r => r.ref);
const problems = (text, file, tracked, ignored) => F.checkDeployRefs([{ file, text }], F.fakeAuthority({ tracked, ignored: ignored || {} }));

test("FILE1 — a README §4 table row naming a file that is not tracked → reported", () => {
  const table = "## 4. What is in this directory\n\n| File | Purpose |\n|---|---|\n| `README.md` | this runbook |\n| `nope.md` | ghost |\n| `build-and-record-images.sh` / `record-images.js` | build |\n";
  assert.deepEqual(refsOf(table, README), [DEPLOY + "/README.md", DEPLOY + "/nope.md", DEPLOY + "/build-and-record-images.sh", DEPLOY + "/record-images.js"]);
  const p = problems(table, README, [README, DEPLOY + "/build-and-record-images.sh", DEPLOY + "/record-images.js"]);
  assert.deepEqual(p.map(x => [x.ref, x.kind]), [[DEPLOY + "/nope.md", "missing"]]);
  assert.equal(p[0].file, README); assert.equal(p[0].line, 6);
});

test("FILE2 — the README §5.9 operative command installs a deploy file that does not exist in the tree → reported (the 17F-A1 regression, outside the table)", () => {
  const cmd = "### 5.9 Environment file\n```sh\ninstall -o root -g root -m 0600 /opt/smartassess-runner/current/runner/deploy/azure-vm/runner.env.example /etc/smartassess-runner/runner.env\nchmod 0600 /etc/smartassess-runner/runner.env\n```\n";
  assert.deepEqual(refsOf(cmd, README), [DEPLOY + "/runner.env.example"]);
  const p = problems(cmd, README, [README, DEPLOY + "/runner-env.example"]);
  assert.deepEqual(p.map(x => [x.ref, x.kind, x.line]), [[DEPLOY + "/runner.env.example", "missing", 3]]);
  assert.deepEqual(problems(cmd.replace("runner.env.example", "runner-env.example"), README, [README, DEPLOY + "/runner-env.example"]), []);
  // the other spellings an operator command uses
  assert.deepEqual(refsOf("sudo sh runner/deploy/azure-vm/readiness.sh --deep\nnode deploy/azure-vm/smoke.js runner --gate-p1\nsee ../runner/deploy/azure-vm/rollback.md.", "docs/x.md"), [DEPLOY + "/readiness.sh", DEPLOY + "/smoke.js", DEPLOY + "/rollback.md"]);
  assert.deepEqual(refsOf("Documentation=file:///opt/smartassess-runner/current/runner/deploy/azure-vm/README.md\nExecStartPre=/usr/bin/node deploy/azure-vm/preflight.js --mode=start --env-file=/etc/smartassess-runner/runner.env", DEPLOY + "/smartassess-runner.service"), [DEPLOY + "/README.md", DEPLOY + "/preflight.js"]);
});

test("FILE3 — an activation-checklist step referencing a deploy script that does not exist → reported", () => {
  const row = "| 13 | Preflight (deep) | `sh runner/deploy/azure-vm/readines.sh --deep` | every check PASS | — | the list |\n| 14 | Smoke | `node deploy/azure-vm/smoke.js runner` | ok | — | — |\n";
  const p = problems(row, DEPLOY + "/activation-checklist.md", [DEPLOY + "/readiness.sh", DEPLOY + "/smoke.js"]);
  assert.deepEqual(p.map(x => [x.ref, x.kind, x.line]), [[DEPLOY + "/readines.sh", "missing", 1]]);
  // markdown links resolve relative to the document
  assert.deepEqual(refsOf("see [rollback](rollback.md) and [A2](a2-live-activation-checklist.md#a2-2) and [runbook](../runner/deploy/azure-vm/README.md) — not [web](https://example.invalid/x.md) nor [anchor](#top)", "docs/n.md").sort(), ["docs/a2-live-activation-checklist.md", "docs/rollback.md", DEPLOY + "/README.md"].sort());
});

test("FILE4 — a shell script invoking a sibling tool that does not exist → reported ($here / $runner / relative require)", () => {
  const sh = 'here=$(cd "$(dirname "$0")" && pwd)\nrunner=$(cd "$here/../.." && pwd)\nsh "$runner/scripts/build-images.sh"\nnode "$here/record-image.js" > "$tmp"\n';
  assert.deepEqual(refsOf(sh, DEPLOY + "/build-and-record-images.sh"), ["runner/scripts/build-images.sh", DEPLOY + "/record-image.js"]);
  const p = problems(sh, DEPLOY + "/build-and-record-images.sh", ["runner/scripts/build-images.sh", DEPLOY + "/record-images.js"]);
  assert.deepEqual(p.map(x => [x.ref, x.kind, x.line]), [[DEPLOY + "/record-image.js", "missing", 4]]);
  const js = 'const { createDockerApi } = require("./docker-apy.js");\nconst { LANGUAGES } = require("../../gateway/registry.js");\n// run deploy/azure-vm/build-and-record-images.sh\n';
  assert.deepEqual(refsOf(js, DEPLOY + "/record-images.js"), [DEPLOY + "/docker-apy.js", "runner/gateway/registry.js", DEPLOY + "/build-and-record-images.sh"]);
  assert.deepEqual(problems(js, DEPLOY + "/record-images.js", [DEPLOY + "/docker-api.js", "runner/gateway/registry.js", DEPLOY + "/build-and-record-images.sh"]).map(x => x.ref), [DEPLOY + "/docker-apy.js"]);
});

test("FILE5 — a referenced deploy file EXISTS on disk but is git-ignored (the `*.env.*` class) → reported by the REAL git authority in a temp repo", () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "sa-refs-"));
  const git = (...a) => { const r = spawnSync("git", ["-C", repo, ...a], { encoding: "utf8", env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null", HOME: repo } }); assert.equal(r.status, 0, a.join(" ") + ": " + r.stderr); return r.stdout; };
  git("init", "-q");
  fs.mkdirSync(path.join(repo, DEPLOY), { recursive: true });
  fs.writeFileSync(path.join(repo, ".gitignore"), "node_modules\n*.env\n*.env.*\n");
  fs.writeFileSync(path.join(repo, DEPLOY, "runner.env.example"), "RUNNER_HOST=127.0.0.1\n");
  fs.writeFileSync(path.join(repo, DEPLOY, "readiness.sh"), "#!/bin/sh\n");
  fs.writeFileSync(path.join(repo, DEPLOY, "README.md"), "| `runner.env.example` | template |\n\ninstall -m 0600 /opt/smartassess-runner/current/runner/deploy/azure-vm/runner.env.example /etc/smartassess-runner/runner.env\nsh runner/deploy/azure-vm/readiness.sh\n");
  git("add", "-A");
  assert.ok(fs.existsSync(path.join(repo, DEPLOY, "runner.env.example")), "the file exists locally");
  const authority = F.gitAuthority(repo);
  assert.equal(authority.tracked.has(DEPLOY + "/readiness.sh"), true);
  assert.equal(authority.tracked.has(DEPLOY + "/runner.env.example"), false, "never added: git ignored it");
  const p = F.checkDeployRefs([{ file: README, text: fs.readFileSync(path.join(repo, README), "utf8") }], authority);
  assert.deepEqual(p.map(x => [x.ref, x.kind, x.line]), [[DEPLOY + "/runner.env.example", "ignored", 1], [DEPLOY + "/runner.env.example", "ignored", 3]]);
  assert.match(p[0].detail, /\.gitignore:3:\*\.env\.\*/, "the violated rule is named");
  // a force-added file that still matches an ignore rule is fragile on a fresh clone / future edits → still reported
  git("add", "-f", DEPLOY + "/runner.env.example");
  const forced = F.checkDeployRefs([{ file: README, text: fs.readFileSync(path.join(repo, README), "utf8") }], F.gitAuthority(repo));
  assert.deepEqual([...new Set(forced.map(x => x.kind))], ["ignored"]);
  fs.rmSync(repo, { recursive: true, force: true });
});

test("FILE6 — a tracked, not ignored reference passes (temp repo + fake authority)", () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "sa-refs-"));
  const git = (...a) => { const r = spawnSync("git", ["-C", repo, ...a], { encoding: "utf8", env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null", HOME: repo } }); assert.equal(r.status, 0, r.stderr); return r.stdout; };
  git("init", "-q");
  fs.mkdirSync(path.join(repo, DEPLOY), { recursive: true });
  fs.writeFileSync(path.join(repo, ".gitignore"), "*.env\n*.env.*\n");
  fs.writeFileSync(path.join(repo, DEPLOY, "runner-env.example"), "RUNNER_HOST=127.0.0.1\n");
  fs.writeFileSync(path.join(repo, DEPLOY, "README.md"), "| `runner-env.example` | template |\n\ninstall -m 0600 /opt/smartassess-runner/current/runner/deploy/azure-vm/runner-env.example /etc/smartassess-runner/runner.env\n");
  git("add", "-A");
  assert.deepEqual(F.checkDeployRefs([{ file: README, text: fs.readFileSync(path.join(repo, README), "utf8") }], F.gitAuthority(repo)), []);
  fs.rmSync(repo, { recursive: true, force: true });
  assert.deepEqual(problems("`sh runner/deploy/azure-vm/readiness.sh --deep`", DEPLOY + "/activation-checklist.md", [DEPLOY + "/readiness.sh"]), []);
});

test("FILE7 — host runtime paths, URLs, wildcards and prose words are never repository artifacts", () => {
  const text = [
    "EnvironmentFile=/etc/smartassess-runner/runner.env", "RequiresMountsFor=/data/smartassess-runner /var/lib/docker", "ExecStart=/usr/bin/node gateway/main.js",
    "install -m 0644 x /etc/systemd/system/ && cp /etc/docker/daemon.json /etc/caddy/Caddyfile", "--image-manifest=/etc/smartassess-runner/images.manifest",
    "ls /var/run/docker.sock /dev/disk/azure/scsi1/lun0 /proc/self/mountinfo /opt/smartassess-runner/current/runner", "https://runner.example.invalid/healthz GET /v1/execute",
    "Node.js, docker.service, journald.conf, resolv.conf, runner.example.invalid, json.example, tests/unit/*.rtest.js, runner/deploy/azure-vm/*.md, runner/deploy/azure-vm/ (the directory)",
    "`runner/`, `gateway/sandbox.js` stays the only process-starting module; `api/src/lib/coding/runner-config.js`; `.github/workflows/coding-grading-recovery.yml`"
  ].join("\n");
  const refs = refsOf(text, README);
  assert.deepEqual(refs, ["runner/gateway/main.js", "runner/gateway/sandbox.js", "api/src/lib/coding/runner-config.js", ".github/workflows/coding-grading-recovery.yml"]);
  assert.deepEqual(problems(text, README, ["runner/gateway/main.js", "runner/gateway/sandbox.js", "api/src/lib/coding/runner-config.js", ".github/workflows/coding-grading-recovery.yml"]), []);
  // bare file names count only in explicit contexts (table column, backticked tool name / command); prose names such as docker.service do not
  assert.deepEqual(refsOf("run `readiness.sh --deep`, then `node smoke.js callback`, read `rollback.md`; restart docker.service", DEPLOY + "/crash-tests.md"), [DEPLOY + "/readiness.sh", DEPLOY + "/smoke.js", DEPLOY + "/rollback.md"]);
  // a bare tool name may mean the deploy dir, runner/gateway or runner/scripts: it passes when ANY candidate is tracked
  const bare = F.extractDeployRefs("`main.js` reads env; `scripts/build-images.sh` builds", { file: README });
  assert.deepEqual(bare.map(r => r.ref), [DEPLOY + "/main.js", "runner/scripts/build-images.sh"]);
  assert.deepEqual(bare[0].candidates, [DEPLOY + "/main.js", "runner/gateway/main.js", "runner/scripts/main.js"]);
  assert.deepEqual(problems("`main.js` reads env; `scripts/build-images.sh` builds", README, ["runner/gateway/main.js", "runner/scripts/build-images.sh"]), []);
  assert.deepEqual(problems("`main.js` reads env", README, [README]).map(x => x.ref), [DEPLOY + "/main.js"]);
  // a bare name in prose is satisfied by a tracked file of exactly that name under runner/, api/ or docs/ — never elsewhere
  assert.deepEqual(problems("see `durable-delivery.rtest.js` and `official-grading.js`", DEPLOY + "/crash-tests.md", ["runner/tests/unit/durable-delivery.rtest.js", "api/src/lib/coding/official-grading.js"]), []);
  assert.deepEqual(problems("see `durable-delivery.rtest.js`", DEPLOY + "/crash-tests.md", ["scripts/durable-delivery.rtest.js"]).map(x => x.kind), ["missing"]);
  // a dependency directory probed at runtime is not an artifact (build-and-record-images.sh checks api/node_modules exists)
  assert.deepEqual(refsOf('if [ -d "$runner/../api/node_modules" ]; then npm --prefix "$runner" run test:docker:official; fi', DEPLOY + "/build-and-record-images.sh"), []);
});

test("FILE8 — a case mismatch is a missing file (git is case-sensitive; the VM's ext4 is too)", () => {
  const p = problems("see runner/deploy/azure-vm/Readme.md and `Preflight.js`", DEPLOY + "/rollback.md", [README, DEPLOY + "/preflight.js"]);
  assert.deepEqual(p.map(x => [x.ref, x.kind]), [[DEPLOY + "/Readme.md", "missing"], [DEPLOY + "/Preflight.js", "missing"]]);
});

test("REAL — every repository artifact referenced by the deployment package and the 17F-A1 / 17F-A1.1 phase notes is tracked by git and not ignored", () => {
  const repo = path.join(__dirname, "..", "..", "..");
  const authority = F.gitAuthority(repo);
  assert.ok(authority.tracked.size > 500, "git ls-files is the authority (" + authority.tracked.size + " tracked files)");
  const sources = F.deploymentSources(repo);
  assert.ok(sources.length >= 24, "the whole package is scanned: " + sources.length + " files");
  for (const f of ["README.md", "activation-checklist.md", "rollback.md", "a2-live-activation-checklist.md", "smoke-matrix.md", "crash-tests.md", "monitoring-checklist.md", "smartassess-runner.service", "Caddyfile.example", "build-and-record-images.sh", "readiness.sh", "preflight.js", "record-images.js"]) assert.ok(sources.some(s => s.file === DEPLOY + "/" + f), f + " is scanned");
  assert.ok(sources.some(s => s.file === "docs/enterprise-coding-assessment-17f-a1.md") && sources.some(s => s.file === "docs/enterprise-coding-assessment-17f-a1-1.md"));
  const refs = sources.flatMap(s => F.extractDeployRefs(s.text, { file: s.file }));
  assert.ok(refs.length >= 60, "the package references its artifacts (" + refs.length + " references)");
  assert.ok(refs.some(r => r.ref === DEPLOY + "/runner-env.example" && /5\.9|install/.test(r.token) || r.ref === DEPLOY + "/runner-env.example"), "the env template is referenced");
  assert.ok(!refs.some(r => /^\/(etc|data|var|usr|opt|proc|dev|run)\//.test(r.ref)), "no host path is treated as an artifact");
  const p = F.checkDeployRefs(sources, authority);
  assert.deepEqual(p.map(x => x.file + ":" + x.line + " " + x.ref + " (" + x.kind + (x.detail ? ": " + x.detail : "") + ")"), []);
});
