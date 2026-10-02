"use strict";
// Phase 17F-A2 hotfix — the Node CLI OPTION BOUNDARY of the deployment commands — node:test, no Docker, no real secrets.
//
// Incident (real Azure pilot VM, Node 22): `readiness.sh --deep` died with `/usr/bin/node: /etc/smartassess-runner/runner.env:
// not found`. Node 22 owns a CLI option named `--env-file` and pre-scans the WHOLE argv for it, even after the script path, so
// `node deploy/azure-vm/preflight.js … --env-file=/etc/smartassess-runner/runner.env` made Node itself try to open the secret
// file — which is root:root 0600 BY DESIGN (systemd PID 1 injects it through EnvironmentFile=; the service user must never read
// it). The same line is ExecStartPre of the service, so the production unit could not start either. The fix is the Node option
// terminator: `/usr/bin/node -- deploy/azure-vm/preflight.js …`. Nothing about the secret file changes.
//   R1 readiness.sh boundary (static + EXECUTED with a systemd-run test double)   R2 ExecStartPre boundary (parsed unit)
//   R3 secret-file ownership invariant (root:root 0600, no read grant)            R4 EnvironmentFile invariant
//   R5 every preflight argument survives (parsed with preflight's own parseArgs)  R6 exact Node 22 reproduction (subprocess)
//   R7 drift scan: no `node <script> … --env-file` without `--` can reappear in the deployment artifacts
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const P = require("../../deploy/azure-vm/preflight.js");

const RUNNER = path.join(__dirname, "..", "..");
const DEPLOY = path.join(RUNNER, "deploy", "azure-vm");
const REPO = path.join(RUNNER, "..");
const read = f => fs.readFileSync(path.join(DEPLOY, f), "utf8");
const ENV_FILE = "/etc/smartassess-runner/runner.env";
const MANIFEST = "/etc/smartassess-runner/images.manifest";
const SCRIPT = "deploy/azure-vm/preflight.js";

/** systemd unit → { Section: { Key: [values] } } (same parser as deploy-artifacts.rtest.js). */
function parseUnit(text) {
  const out = {}; let sec = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    const s = /^\[(.+)\]$/.exec(line);
    if (s) { sec = s[1]; out[sec] = out[sec] || {}; continue; }
    const m = /^([A-Za-z]+)=(.*)$/.exec(line);
    if (m && sec) (out[sec][m[1]] = out[sec][m[1]] || []).push(m[2]);
  }
  return out;
}
/** The `exec systemd-run …` command of readiness.sh with its line continuations joined → whitespace tokens. */
function readinessExecTokens() {
  const src = read("readiness.sh").replace(/\\\n\s*/g, " ");
  const line = src.split("\n").find(l => /^\s*exec\s+systemd-run\b/.test(l));
  assert.ok(line, "readiness.sh execs systemd-run");
  return line.trim().split(/\s+/);
}
/** The Node command inside an argv: [nodeIndex, terminatorIndex, scriptIndex, appArgs]. */
function nodeBoundary(tokens) {
  const nodeIndex = tokens.indexOf("/usr/bin/node");
  assert.ok(nodeIndex >= 0, "the command runs /usr/bin/node: " + tokens.join(" "));
  const scriptIndex = tokens.findIndex((t, i) => i > nodeIndex && /preflight\.js$/.test(t));
  assert.ok(scriptIndex > nodeIndex, "the command runs preflight.js");
  return { nodeIndex, terminatorIndex: tokens.indexOf("--", nodeIndex), scriptIndex, appArgs: tokens.slice(scriptIndex + 1) };
}
const assertBoundary = (tokens, label) => {
  const b = nodeBoundary(tokens);
  assert.equal(b.terminatorIndex, b.nodeIndex + 1, label + ": `--` must come IMMEDIATELY after /usr/bin/node (Node stops parsing its own options there)");
  assert.equal(b.scriptIndex, b.terminatorIndex + 1, label + ": the script path must come immediately after `--`");
  assert.ok(!tokens.slice(b.nodeIndex + 1, b.scriptIndex).some(t => t.startsWith("--env-file")), label + ": the application's --env-file is never a Node option");
  assert.ok(b.appArgs.includes("--env-file=" + ENV_FILE), label + ": --env-file stays an APPLICATION argument after the script");
  assert.ok(b.appArgs.includes("--image-manifest=" + MANIFEST), label + ": --image-manifest preserved");
  return b;
};

/** Runs readiness.sh with a systemd-run TEST DOUBLE on PATH that records its argv (no systemd, no secrets, nothing started). */
function runReadiness(args) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sa-readiness-"));
  const record = path.join(dir, "argv.json");
  fs.writeFileSync(path.join(dir, "systemd-run"), '#!/bin/sh\nprintf \'%s\\n\' "$@" > "' + record + '"\nexit 0\n', { mode: 0o755 });
  const r = spawnSync("sh", [path.join(DEPLOY, "readiness.sh"), ...args], { encoding: "utf8", env: { PATH: dir + ":/usr/bin:/bin" } });
  const argv = fs.existsSync(record) ? fs.readFileSync(record, "utf8").split("\n").filter(Boolean) : null;
  fs.rmSync(dir, { recursive: true, force: true });
  return { status: r.status, stderr: r.stderr, argv };
}

test("R1 — readiness.sh: Node CLI parsing is terminated with `--` before preflight.js (static) and the executed wrapper passes the right argv (systemd-run test double)", () => {
  assertBoundary(readinessExecTokens(), "readiness.sh");
  for (const [args, mode] of [[[], "readiness"], [["--deep"], "verify-sandbox"]]) {
    const r = runReadiness(args);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.argv, "systemd-run was invoked");
    const props = r.argv.filter((t, i) => r.argv[i - 1] === "-p");
    assert.deepEqual(props.filter(p => /^(User|Group|SupplementaryGroups|EnvironmentFile|Environment|WorkingDirectory)=/.test(p)).sort(), ["Environment=HOME=/var/lib/smartassess-runner", "EnvironmentFile=" + ENV_FILE, "Group=smartassess-runner", "SupplementaryGroups=docker", "User=smartassess-runner", "WorkingDirectory=/opt/smartassess-runner/current/runner"], "service context preserved for " + JSON.stringify(args));
    for (const f of ["--quiet", "--pipe", "--wait", "--collect"]) assert.ok(r.argv.includes(f), f);
    const b = assertBoundary(r.argv, "readiness.sh " + args.join(" "));
    assert.deepEqual(b.appArgs, ["--mode=" + mode, "--env-file=" + ENV_FILE, "--image-manifest=" + MANIFEST], "exact preflight argv for " + JSON.stringify(args));
    assert.equal(r.argv.indexOf("/usr/bin/node"), r.argv.length - 6, "nothing is appended after the preflight arguments");
  }
});

test("R2 — smartassess-runner.service: ExecStartPre terminates Node CLI parsing before preflight.js; the old unsafe form is rejected", () => {
  const u = parseUnit(read("smartassess-runner.service"));
  assert.equal(u.Service.ExecStartPre.length, 1, "exactly one ExecStartPre (the preflight gate)");
  const cmd = u.Service.ExecStartPre[0];
  assert.ok(cmd.startsWith("/usr/bin/node -- " + SCRIPT + " --mode=start "), "ExecStartPre must begin `/usr/bin/node -- deploy/azure-vm/preflight.js --mode=start`: " + cmd);
  assert.doesNotMatch(cmd, /^\/usr\/bin\/node\s+deploy\//, "the unsafe form (script directly after node) is rejected");
  assert.doesNotMatch(cmd, /^[@\-:+!]/, "no systemd exec prefix: a preflight failure must keep the unit DOWN");
  const b = assertBoundary(cmd.split(/\s+/), "ExecStartPre");
  assert.deepEqual(b.appArgs, ["--mode=start", "--env-file=" + ENV_FILE, "--image-manifest=" + MANIFEST]);
  // the rest of the unit is untouched by the hotfix
  assert.deepEqual(u.Service.ExecStart, ["/usr/bin/node gateway/main.js"]);
  assert.deepEqual(u.Service.ExecStopPost, ["/usr/bin/node deploy/azure-vm/sweep-containers.js"]);
  assert.equal(u.Service.User[0], "smartassess-runner"); assert.equal(u.Service.Group[0], "smartassess-runner"); assert.deepEqual(u.Service.SupplementaryGroups, ["docker"]);
  assert.deepEqual((u.Unit.RequiresMountsFor || []).join(" ").split(/\s+/), ["/data/smartassess-runner", "/var/lib/docker"]);
  for (const k of ["NoNewPrivileges", "ProtectSystem", "ProtectHome", "PrivateTmp", "RestrictNamespaces", "LockPersonality", "SystemCallArchitectures"]) assert.ok(u.Service[k], k + " hardening kept");
  assert.equal((u.Service.CapabilityBoundingSet || [""])[0], "");
});

test("R3 — the secret file stays root:root 0600 and the service account gains no read access (documented, templated, never relaxed by a deployment artifact)", () => {
  const readme = read("README.md");
  assert.match(readme, /install -o root -g root -m 0600 \S+runner-env\.example \/etc\/smartassess-runner\/runner\.env/, "the runbook installs runner.env root:root 0600");
  assert.match(read("runner-env.example"), /install -o root -g root -m 0600/);
  for (const f of fs.readdirSync(DEPLOY)) {
    const t = read(f);
    assert.doesNotMatch(t, /ch(mod|own)[^\n]*runner\.env/, f + ": no chmod/chown of runner.env");
    assert.doesNotMatch(t, /runner\.env[^\n]*\b0?6[46][04]\b|\b0?6[46][04]\b[^\n]*runner\.env/, f + ": no weaker mode than 0600 near runner.env");
    assert.doesNotMatch(t, /(^|[\s;&|])(\.|source|cat|export \$\(cat)\s+\/etc\/smartassess-runner\/runner\.env/m, f + ": the secret file is never sourced / read by a shell");
  }
  const u = parseUnit(read("smartassess-runner.service"));
  assert.equal(u.Service.User[0], "smartassess-runner", "the preflight and the gateway run as the service user, not root");
  for (const k of ["ExecStartPre", "ExecStart", "ExecStopPost"]) for (const c of u.Service[k]) assert.doesNotMatch(c, /^[@\-:+!]/, k + ": no exec prefix (+/! would run it with root privileges and read the secret as root; - would fail open)");
  // the preflight itself only STATS the env file (owner / mode / type) through --env-file; reading it is a separate, explicit, operator-only flag
  const pf = fs.readFileSync(path.join(DEPLOY, "preflight.js"), "utf8");
  assert.match(pf, /k === "read-env-file"/, "reading the env file is a separate explicit flag");
  for (const t of [read("readiness.sh"), u.Service.ExecStartPre[0]]) assert.ok(!t.includes("--read-env-file"), "production commands never ask the preflight to read the secret file");
});

test("R4 — EnvironmentFile invariant: systemd (PID 1) injects the secrets — the unit and the readiness wrapper both keep the mandatory EnvironmentFile", () => {
  const u = parseUnit(read("smartassess-runner.service"));
  assert.deepEqual(u.Service.EnvironmentFile, [ENV_FILE], "exactly one mandatory (no '-' prefix) EnvironmentFile");
  const tokens = readinessExecTokens();
  assert.ok(tokens.some((t, i) => tokens[i - 1] === "-p" && t === "EnvironmentFile=" + ENV_FILE), "readiness.sh passes -p EnvironmentFile=… to systemd-run");
  const b = nodeBoundary(tokens);
  assert.ok(tokens.indexOf("-p") < b.nodeIndex && tokens.lastIndexOf("-p") < b.nodeIndex, "every systemd-run property precedes the command");
});

test("R5 — argument preservation: preflight's OWN parser receives --mode, --env-file and --image-manifest from both artifacts (nothing lost to Node)", () => {
  const unitArgs = nodeBoundary(parseUnit(read("smartassess-runner.service")).Service.ExecStartPre[0].split(/\s+/)).appArgs;
  const parsed = P.parseArgs(unitArgs);
  assert.ok(parsed, "ExecStartPre arguments are valid preflight arguments: " + unitArgs.join(" "));
  assert.equal(parsed.mode, "start"); assert.equal(parsed.profile, "production");
  assert.deepEqual(parsed.options, { envFile: ENV_FILE, imageManifest: MANIFEST });
  assert.equal(parsed.readEnvFile, undefined);
  for (const [args, mode] of [[[], "readiness"], [["--deep"], "verify-sandbox"]]) {
    const b = nodeBoundary(runReadiness(args).argv);
    const p = P.parseArgs(b.appArgs);
    assert.ok(p, "readiness arguments are valid preflight arguments");
    assert.equal(p.mode, mode); assert.equal(p.profile, "production"); assert.deepEqual(p.options, { envFile: ENV_FILE, imageManifest: MANIFEST });
  }
  // the terminator itself must never reach the application (Node consumes it) — the parser would refuse it
  assert.equal(P.parseArgs(["--", "--mode=start"]), null, "a stray `--` is a usage error for preflight (so a misplaced terminator fails loudly)");
});

test("R6 — exact Node reproduction (installed " + process.version + "): `node script.js --env-file=<sentinel>` is intercepted by Node; `node -- script.js --env-file=<sentinel>` reaches the script", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sa-envfile-"));
  const script = path.join(dir, "argv.js");
  fs.writeFileSync(script, 'process.stdout.write(JSON.stringify(process.argv.slice(2)));\n');
  const sentinel = path.join(dir, "no-such-dir", "runner.env");           // a harmless path that does not exist: no secret is ever touched
  const run = argv => spawnSync(process.execPath, argv, { encoding: "utf8", env: { PATH: process.env.PATH } });
  const safe = run(["--", script, "--env-file=" + sentinel, "--mode=readiness"]);
  assert.equal(safe.status, 0, safe.stderr);
  assert.deepEqual(JSON.parse(safe.stdout), ["--env-file=" + sentinel, "--mode=readiness"], "with `--` the application receives --env-file untouched");
  const unsafe = run([script, "--env-file=" + sentinel, "--mode=readiness"]);
  const intercepted = unsafe.status !== 0 && /not found|ENOENT|env-file|env file/i.test(unsafe.stderr) && !unsafe.stdout.includes("--env-file");
  if (/^v22\./.test(process.version)) {
    assert.ok(intercepted, "Node 22 pre-scans argv for --env-file even after the script path and dies before the script runs; got status " + unsafe.status + " stdout=" + unsafe.stdout + " stderr=" + unsafe.stderr.trim());
    assert.match(unsafe.stderr, /not found/, "the production symptom: `node: <path>: not found` (Node, not the application)");
  } else {
    // Other majors may behave differently; the deployment contract is enforced structurally by R1/R2/R7 regardless.
    console.log("note: Node " + process.version + " unsafe form →", unsafe.status, unsafe.stderr.trim().slice(0, 120));
  }
  // the REAL preflight: with `--` the application owns --env-file and judges the file itself (FAIL env-file, exit 11 — never Node's exit 9)
  const pf = run(["--", path.join(DEPLOY, "preflight.js"), "--mode=readiness", "--env-file=" + sentinel]);
  assert.equal(pf.status, P.EXIT.ENV_FILE, "preflight reports the env-file contract itself: " + pf.stdout + pf.stderr);
  assert.match(pf.stdout, /FAIL env-file\s+environment file not found/);
  if (/^v22\./.test(process.version)) {
    const bad = run([path.join(DEPLOY, "preflight.js"), "--mode=readiness", "--env-file=" + sentinel]);
    assert.notEqual(bad.status, P.EXIT.ENV_FILE, "without `--` the preflight never runs (Node exits first)");
    assert.ok(!bad.stdout.includes("env-file"), "no preflight check line is printed");
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

test("R7 — drift scan: in every deployment artifact and runbook, a `node … <script> … --env-file=` command has `--` immediately before the script (unrelated node commands are not flagged)", () => {
  const files = [...fs.readdirSync(DEPLOY).map(f => path.join(DEPLOY, f)), ...["enterprise-coding-assessment-17f-a1.md", "enterprise-coding-assessment-17f-a1-1.md"].map(f => path.join(REPO, "docs", f))].filter(f => fs.existsSync(f) && fs.statSync(f).isFile());
  const offenders = [];
  let commandsSeen = 0;
  for (const f of files) {
    const text = fs.readFileSync(f, "utf8").replace(/\\\n\s*/g, " ");
    text.split("\n").forEach((line, i) => {
      if (!/--env-file=/.test(line) || !/(^|[\s=`"'(])(\/usr\/bin\/)?node(\s|$)/.test(line)) return;
      const tokens = line.trim().replace(/^[`>|*\s-]*/, "").split(/\s+/);
      const nodeIndex = tokens.findIndex(t => /^(\/usr\/bin\/)?node$|^ExecStartPre=\/usr\/bin\/node$/.test(t));
      if (nodeIndex < 0) return;
      commandsSeen++;
      const scriptIndex = tokens.findIndex((t, k) => k > nodeIndex && /\.m?js$/.test(t));
      const envIndex = tokens.findIndex((t, k) => k > nodeIndex && t.startsWith("--env-file="));
      if (scriptIndex < 0 || envIndex < scriptIndex) { offenders.push(path.relative(REPO, f) + ":" + (i + 1) + " (--env-file before/without a script)"); return; }
      if (tokens[scriptIndex - 1] !== "--") offenders.push(path.relative(REPO, f) + ":" + (i + 1) + " `" + tokens.slice(nodeIndex, scriptIndex + 1).join(" ") + "` lacks the `--` Node option terminator");
    });
  }
  assert.ok(commandsSeen >= 2, "the unit and readiness.sh are scanned (" + commandsSeen + " commands)");
  assert.deepEqual(offenders, []);
  // the scan is narrow: these legitimate commands are NOT flagged
  const legit = ["/usr/bin/node gateway/main.js", "node deploy/azure-vm/smoke.js runner --gate-p1", "docker run --env-file=x alpine", "node -- deploy/azure-vm/preflight.js --mode=start --env-file=/etc/x"];
  for (const l of legit) {
    const tokens = l.split(/\s+/); const n = tokens.findIndex(t => /^(\/usr\/bin\/)?node$/.test(t)); const s = tokens.findIndex((t, k) => k > n && /\.js$/.test(t));
    assert.ok(n < 0 || !/--env-file=/.test(l) || tokens[s - 1] === "--", "legit: " + l);
  }
});
