"use strict";
// Phase 17F-A1 — static guards of the Azure VM deployment package (runner/deploy/azure-vm/) — node:test, no Docker:
//   D1  the gateway binds loopback only (env template + unit never override it)
//   D2  the systemd unit fails closed on storage (RequiresMountsFor journal + Docker disks), needs Docker, runs the preflight
//   D3  the env template holds no secret values and is EXACTLY the set of settings the gateway reads
//   D4  Caddy proxies only the gateway's own routes, only to 127.0.0.1:8787, with body / timeout bounds derived from the code
//   D5  no public 8787 / Docker TCP binding anywhere in the deployment tree
//   D6  worker images come from the registry (never a hand-written list)
//   D12 env-file permissions documented and checked
//   D13 no production secrets / credentials / tokens in the deployment tree or the phase document
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const RUNNER = path.join(__dirname, "..", "..");
const DEPLOY = path.join(RUNNER, "deploy", "azure-vm");
const REPO = path.join(RUNNER, "..");
const read = f => fs.readFileSync(path.join(DEPLOY, f), "utf8");
const { LANGUAGES, compileWallMs, runWallMs } = require("../../gateway/registry.js");
const { OFFICIAL_MAX_BODY_BYTES } = require("../../gateway/server.js");
const { BOUNDS } = require("../../gateway/validate.js");

/** systemd unit → { Section: { Key: [values] } } (comments / blank lines ignored). */
function parseUnit(text) {
  const out = {};
  let sec = null;
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
const unit = () => parseUnit(read("smartassess-runner.service"));
const envLines = () => read("runner.env.example").split("\n").map(l => /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(l.trim())).filter(Boolean).map(m => ({ key: m[1], value: m[2] }));
const caddy = () => read("Caddyfile.example").split("\n").filter(l => !l.trim().startsWith("#")).join("\n");
/** Worst LEGITIMATE-or-killed practice wall of the gateway (compile wall + run wall at the maximum time limit). */
const practiceWorstMs = () => Math.max(...Object.values(LANGUAGES).map(e => (e.compileSandbox ? compileWallMs(e) : 0) + runWallMs(e, BOUNDS.timeMs[1])));
const apiExecuteTimeoutMs = () => { const m = /EXECUTE_TIMEOUT_MS\s*=\s*(\d+)/.exec(fs.readFileSync(path.join(REPO, "api", "src", "lib", "coding", "execution-provider.js"), "utf8")); return Number(m[1]); };
const deployFiles = () => fs.readdirSync(DEPLOY).map(f => path.join(DEPLOY, f)).filter(f => fs.statSync(f).isFile());

test("D1 — loopback bind: the env template pins 127.0.0.1:8787 and nothing overrides RUNNER_HOST / RUNNER_PORT", () => {
  const env = Object.fromEntries(envLines().map(l => [l.key, l.value]));
  assert.equal(env.RUNNER_HOST, "127.0.0.1");
  assert.equal(env.RUNNER_PORT, "8787");
  const u = unit();
  for (const e of u.Service.Environment || []) assert.doesNotMatch(e, /RUNNER_(HOST|PORT)/, "the unit must not override the bind");
  assert.deepEqual(u.Service.ExecStart, ["/usr/bin/node gateway/main.js"]);
});

test("D2 — systemd: Docker required, storage mounts required, preflight gate, dedicated user, bounded restart / stop", () => {
  const u = unit();
  assert.ok((u.Unit.Requires || []).join(" ").split(/\s+/).includes("docker.service"));
  assert.ok((u.Unit.After || []).join(" ").split(/\s+/).includes("docker.service"));
  const mounts = (u.Unit.RequiresMountsFor || []).join(" ").split(/\s+/);
  assert.ok(mounts.includes("/data/smartassess-runner"), "journal disk mount must be required");
  assert.ok(mounts.includes("/var/lib/docker"), "Docker disk mount must be required");
  assert.equal(u.Service.User[0], "smartassess-runner");
  assert.equal(u.Service.Group[0], "smartassess-runner");
  assert.notEqual(u.Service.User[0], "root");
  assert.deepEqual(u.Service.SupplementaryGroups, ["docker"]);
  assert.equal(u.Service.WorkingDirectory[0], "/opt/smartassess-runner/current/runner");
  assert.deepEqual(u.Service.EnvironmentFile, ["/etc/smartassess-runner/runner.env"], "exactly one, mandatory (no '-' prefix) environment file");
  assert.match(u.Service.ExecStartPre[0], /^\/usr\/bin\/node deploy\/azure-vm\/preflight\.js --mode=start\b/);
  assert.match(u.Service.ExecStartPre[0], /--env-file=\/etc\/smartassess-runner\/runner\.env/);
  assert.match(u.Service.ExecStartPre[0], /--image-manifest=\//);
  assert.ok(!/--profile=development|--allow-non-loopback-bind/.test(u.Service.ExecStartPre[0]), "production profile only");
  assert.deepEqual(u.Service.ExecStopPost, ["/usr/bin/node deploy/azure-vm/sweep-containers.js"]);
  assert.deepEqual(u.Service.Restart, ["on-failure"]);
  const restartSec = parseInt(u.Service.RestartSec[0], 10);
  assert.ok(restartSec >= 1 && restartSec <= 60, "RestartSec bounded");
  assert.ok(Number(u.Unit.StartLimitBurst[0]) >= 1 && Number(u.Unit.StartLimitIntervalSec[0]) > 0, "crash loops are bounded");
  assert.deepEqual(u.Service.KillSignal, ["SIGTERM"]);
  assert.deepEqual(u.Service.KillMode, ["mixed"]);
  assert.ok(parseInt(u.Service.TimeoutStopSec[0], 10) * 1000 > practiceWorstMs(), "graceful stop outlasts the worst in-flight practice request");
  assert.deepEqual(u.Service.NoNewPrivileges, ["true"]);
  assert.deepEqual(u.Service.ProtectSystem, ["strict"]);
  assert.deepEqual(u.Service.ReadWritePaths, ["/data/smartassess-runner"]);
  assert.equal(u.Service.PrivateDevices, undefined, "PrivateDevices would hide /dev/disk/azure (the gateway's temporary-disk gate)");
  assert.equal((u.Service.CapabilityBoundingSet || [""])[0], "", "no capabilities");
  assert.equal(u.Install.WantedBy[0], "multi-user.target");
});

test("D3 — env template: no secret values, no dev override, exactly the gateway's settings (no invented knobs)", () => {
  const lines = envLines();
  const active = Object.fromEntries(lines.map(l => [l.key, l.value]));
  for (const k of ["RUNNER_HMAC_KEY", "SMARTASSESS_CALLBACK_HMAC_KEY", "SMARTASSESS_CALLBACK_BASE_URL"]) assert.equal(active[k], "", k + " must be EMPTY in the template (fail closed)");
  assert.ok(!("RUNNER_JOURNAL_ALLOW_EPHEMERAL" in active), "the ephemeral journal override must never be active");
  assert.equal(active.RUNNER_JOURNAL_DIR, "/data/smartassess-runner");
  // inventory parity with the gateway sources
  const gatewayKeys = new Set();
  for (const f of fs.readdirSync(path.join(RUNNER, "gateway"))) {
    const src = fs.readFileSync(path.join(RUNNER, "gateway", f), "utf8");
    for (const m of src.matchAll(/\benv\.([A-Z][A-Z0-9_]+)/g)) gatewayKeys.add(m[1]);
    const dk = /DOCKER_ENV_KEYS\s*=\s*\[([^\]]*)\]/.exec(src);
    if (dk) for (const m of dk[1].matchAll(/"([A-Z_]+)"/g)) gatewayKeys.add(m[1]);
  }
  gatewayKeys.delete("PATH"); gatewayKeys.delete("HOME");                     // provided by systemd (HOME = the state directory)
  const template = read("runner.env.example");
  assert.deepEqual([...gatewayKeys].filter(k => !new RegExp("^#?\\s*" + k + "=", "m").test(template)).sort(), [], "every setting the gateway reads is in the template");
  assert.deepEqual(Object.keys(active).filter(k => !gatewayKeys.has(k)), [], "the template defines no setting the gateway does not read");
  assert.ok(gatewayKeys.has("RUNNER_JOURNAL_DIR") && gatewayKeys.has("RUNNER_JOURNAL_ALLOW_EPHEMERAL"), "the journal knob is the existing RUNNER_JOURNAL_DIR");
});

test("D4 — Caddy: only the gateway's routes, only to 127.0.0.1:8787, body / timeout bounds derived from the code", () => {
  const c = caddy();
  const upstreams = [...c.matchAll(/reverse_proxy\s+(\S+)/g)].map(m => m[1]);
  assert.deepEqual(upstreams, ["127.0.0.1:8787"]);
  const server = fs.readFileSync(path.join(RUNNER, "gateway", "server.js"), "utf8");
  const routes = new Set([...(/ROUTES = new Set\(\[([^\]]*)\]/.exec(server)[1]).matchAll(/"(?:GET|POST) ([^"]+)"/g)].map(m => m[1]).concat(["/healthz"]));
  const matcher = /@runner path ([^\n]+)/.exec(c)[1].trim().split(/\s+/);
  assert.deepEqual(new Set(matcher), routes, "the matcher forwards exactly the gateway routes");
  assert.match(c, /handle \{\s*respond 404\s*\}/, "everything else is 404");
  const size = /max_size (\d+)MiB/.exec(c);
  assert.ok(size, "request body is bounded");
  const bytes = Number(size[1]) * 1024 * 1024;
  assert.ok(bytes > OFFICIAL_MAX_BODY_BYTES, "the proxy must accept every valid official job (≤ " + OFFICIAL_MAX_BODY_BYTES + " B)");
  assert.ok(bytes <= 4 * 1024 * 1024, "the proxy limit stays bounded");
  const rht = Number(/response_header_timeout (\d+)s/.exec(c)[1]) * 1000;
  assert.ok(rht > practiceWorstMs(), "proxy timeout > the gateway's worst practice wall (" + practiceWorstMs() + " ms)");
  assert.ok(rht >= apiExecuteTimeoutMs(), "proxy timeout ≥ the API's runner timeout (" + apiExecuteTimeoutMs() + " ms)");
  assert.match(c, /request>headers delete/, "signature headers are never written to the access log");
  assert.doesNotMatch(c, /docker\.sock|:2375|:2376|\/data\/smartassess-runner|file_server|root \*/, "no Docker API, journal or file serving");
  assert.match(read("Caddyfile.example"), /^runner\.example\.invalid \{/m, "the site is a DNS name placeholder (never a raw IP)");
});

test("D5 — no public Runner / Docker TCP exposure anywhere in the deployment tree", () => {
  for (const f of deployFiles()) {
    const t = fs.readFileSync(f, "utf8");
    assert.doesNotMatch(t, /(0\.0\.0\.0|\[::\]|\*)\s*:\s*8787/, path.basename(f) + ": public 8787 bind");
    assert.doesNotMatch(t, /^\s*RUNNER_HOST=(?!127\.0\.0\.1\s*$).+$/m, path.basename(f) + ": RUNNER_HOST must be loopback");
    assert.doesNotMatch(t, /tcp:\/\/[^\s"']*:(2375|2376)|-H\s+tcp:|"hosts"\s*:/, path.basename(f) + ": Docker daemon on TCP");
  }
  const daemon = JSON.parse(read("docker-daemon.json.example"));
  assert.equal(daemon.hosts, undefined, "the Docker daemon keeps its unix socket only");
  assert.equal(daemon["live-restore"], false);
});

test("D6 — worker images come from the registry; the docs list exactly the registry's images", () => {
  const images = Object.values(LANGUAGES).map(e => e.image).sort();
  assert.deepEqual(images, ["smartassess-coding-csharp:17c-v1", "smartassess-coding-java:17c-v1", "smartassess-coding-python:17c-v1"]);
  for (const f of ["preflight.js", "record-images.js"]) assert.doesNotMatch(read(f), /smartassess-coding-[a-z]+:/, f + " must read image names from registry.js");
  const readme = read("README.md");
  for (const i of images) assert.ok(readme.includes(i), "README lists " + i);
  assert.match(read("build-and-record-images.sh"), /scripts\/build-images\.sh/, "the existing build pipeline is reused, not duplicated");
});

test("D12 — the environment file is root-owned 0600: documented and enforced by the preflight flags in the unit", () => {
  const readme = read("README.md");
  assert.match(readme, /install -o root -g root -m 0600/);
  assert.match(read("runner.env.example"), /-m 0600/);
  assert.match(unit().Service.ExecStartPre[0], /--env-file=/);
});

test("D13 — no secrets, tokens, private keys or production identifiers in the deployment tree / phase doc", () => {
  const files = [...deployFiles(), path.join(REPO, "docs", "enterprise-coding-assessment-17f-a1.md")];
  for (const f of files) {
    const t = fs.readFileSync(f, "utf8");
    const name = path.basename(f);
    // any hex run of key length (≥ 32) is suspect, except an image digest (sha256:…), a 40-hex git commit SHA and low-entropy
    // constants (e.g. the IPv6 /proc/net/tcp6 addresses: only '0' and '1')
    const hex = [...t.matchAll(/(^|[^0-9a-fA-F:@])([0-9a-fA-F]{32,})(?![0-9a-fA-F])/g)].filter(m => m[2].length !== 40 && new Set(m[2]).size > 2 && !/sha256[:@]\s*$/.test(t.slice(Math.max(0, m.index - 8), m.index + m[1].length)));
    assert.deepEqual(hex.map(m => m[2].slice(0, 8) + "…"), [], name + ": long hex literal (key material?)");
    assert.doesNotMatch(t, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, name + ": private key");
    assert.doesNotMatch(t, /AccountKey=|SharedAccessSignature=|[?&]sig=[A-Za-z0-9%]{20,}/, name + ": Azure storage credential");
    assert.doesNotMatch(t, /\bghp_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}|\bxox[abp]-/, name + ": token");
    assert.doesNotMatch(t, /https?:\/\/[^\s/:@]+:[^\s/@]+@/, name + ": URL with credentials");
    assert.doesNotMatch(t, /azurestaticapps\.net|white-grass/i, name + ": a real production hostname");
    assert.doesNotMatch(t, /^\s*(RUNNER_HMAC_KEY|SMARTASSESS_CALLBACK_HMAC_KEY|CODING_RUNNER_HMAC_KEY|CODING_GRADING_CALLBACK_HMAC_KEY|CODING_GRADING_SWEEP_HMAC_KEY)=\S{8,}/m, name + ": a key value");
  }
});

test("DOC — the runbook states the two non-negotiable rules and the pilot guardrails", () => {
  const readme = read("README.md");
  assert.match(readme, /DO NOT put secrets in the repository\./);
  assert.match(readme, /PR preview environments must not receive production Runner keys\./);
  for (const g of [/≤ 64 official jobs/, /1,000 official jobs/, /2000 ms/, /< vCPU/]) assert.match(readme, g);
  assert.match(readme, /45 seconds/);
  assert.match(readme, /CODING_RUNNER_ENABLED=false/);
  for (const f of ["activation-checklist.md", "rollback.md", "a2-live-activation-checklist.md", "smoke-matrix.md", "crash-tests.md", "monitoring-checklist.md", "known-limits-17f-b-backlog.md"]) assert.ok(fs.existsSync(path.join(DEPLOY, f)), f + " exists");
  const backlog = read("known-limits-17f-b-backlog.md");
  for (let i = 1; i <= 10; i++) assert.match(backlog, new RegExp("\\bB" + i + "\\b"), "backlog item B" + i);
  assert.match(backlog, /Force Regrade/);
});
