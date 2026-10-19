// CI base-image pulls (node:test, no Docker, no network, no secrets). The two CI-only scripts run against TEST DOUBLES
// of docker / aws / curl placed first on PATH:
//   pull-base-images.sh — pulls every digest-pinned FROM image once, retries a refusal with backoff, gives up after the
//                         bounded attempts, refuses an unpinned base;
//                         and (Docker Hub fallback) on an ECR Public QUOTA refusal pulls the same digest from Docker Hub
//                         and hands it to the build as a BuildKit named context;
//   build-images.sh     — passes those named contexts to `docker build` only in their one exact, digest-identical shape;
//   ecr-public-login.sh — fail-open optional login: no role / no OIDC token / STS refusal → warning + exit 0 and no
//                         docker login; the full path logs in with the password on STDIN and prints no credential except
//                         inside ::add-mask:: commands.
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const SCRIPTS = path.join(__dirname, "..", "..", "scripts");
const REAL_WORKERS = path.join(__dirname, "..", "..", "workers");

function sandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ci-base-images-"));
  const bin = path.join(root, "bin");
  fs.mkdirSync(bin);
  fs.mkdirSync(path.join(root, "scripts"));
  for (const f of ["pull-base-images.sh", "ecr-public-login.sh", "build-images.sh"]) fs.copyFileSync(path.join(SCRIPTS, f), path.join(root, "scripts", f));
  return { root, bin, log: path.join(root, "calls.log") };
}
function fake(bin, name, body) {
  const p = path.join(bin, name);
  fs.writeFileSync(p, "#!/bin/sh\n" + body + "\n");
  fs.chmodSync(p, 0o755);
}
function workers(root, files) {
  for (const [dir, content] of Object.entries(files)) {
    fs.mkdirSync(path.join(root, "workers", dir), { recursive: true });
    fs.writeFileSync(path.join(root, "workers", dir, "Dockerfile"), content);
  }
}
function run(sb, script, env = {}) {
  const r = spawnSync("sh", [path.join(sb.root, "scripts", script)], { encoding: "utf8", env: { PATH: sb.bin + ":/usr/bin:/bin", LOG: sb.log, ...env } });
  const calls = fs.existsSync(sb.log) ? fs.readFileSync(sb.log, "utf8").trim().split("\n").filter(Boolean) : [];
  return { code: r.status, out: r.stdout, err: r.stderr, calls };
}
// docker double: records argv; `docker pull X` fails while the per-image failure counter is > 0.
const DOCKER = 'echo "docker $*" >> "$LOG"\nif [ "$1" = pull ]; then f="$FAILS_DIR/$(echo "$3" | tr "/:@" "___")"; if [ -f "$f" ]; then n=$(cat "$f"); if [ "$n" -gt 0 ]; then echo $((n-1)) > "$f"; echo "429 Too Many Requests" >&2; exit 1; fi; fi; fi\nif [ "$1" = login ]; then cat > "$LOG.stdin"; fi\nexit 0';

test("pull: the real worker Dockerfiles yield exactly the pinned bases, each pulled once", () => {
  const sb = sandbox();
  fs.cpSync(REAL_WORKERS, path.join(sb.root, "workers"), { recursive: true });
  fake(sb.bin, "docker", DOCKER);
  const r = run(sb, "pull-base-images.sh", { FAILS_DIR: sb.root });
  assert.equal(r.code, 0, r.err);
  const pulled = r.calls.map(c => c.replace("docker pull --quiet ", ""));
  const expected = [...new Set(fs.readdirSync(REAL_WORKERS).flatMap(d => {
    const f = path.join(REAL_WORKERS, d, "Dockerfile");
    return fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(l => /^FROM\s/.test(l)).map(l => l.split(/\s+/)[1]) : [];
  }))].sort();
  assert.deepEqual(pulled.slice().sort(), expected);
  assert.ok(expected.length >= 3 && expected.every(i => i.includes("@sha256:")));
});

test("pull: a refused pull is retried with backoff and then succeeds", () => {
  const sb = sandbox();
  workers(sb.root, { a: "FROM reg.example/img@sha256:aaa\n" });
  fake(sb.bin, "docker", DOCKER);
  fake(sb.bin, "sleep", 'echo "sleep $1" >> "$LOG"');
  fs.writeFileSync(path.join(sb.root, "reg.example_img_sha256_aaa"), "2");
  const r = run(sb, "pull-base-images.sh", { FAILS_DIR: sb.root, PULL_BACKOFF_SECONDS: "5" });
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(r.calls, ["docker pull --quiet reg.example/img@sha256:aaa", "sleep 5", "docker pull --quiet reg.example/img@sha256:aaa", "sleep 10", "docker pull --quiet reg.example/img@sha256:aaa"]);
});

test("pull: gives up after the bounded number of attempts (the job then fails)", () => {
  const sb = sandbox();
  workers(sb.root, { a: "FROM reg.example/img@sha256:aaa\n" });
  fake(sb.bin, "docker", DOCKER);
  fake(sb.bin, "sleep", 'echo "sleep $1" >> "$LOG"');
  fs.writeFileSync(path.join(sb.root, "reg.example_img_sha256_aaa"), "99");
  const r = run(sb, "pull-base-images.sh", { FAILS_DIR: sb.root, PULL_ATTEMPTS: "3", PULL_BACKOFF_SECONDS: "1" });
  assert.equal(r.code, 1);
  assert.equal(r.calls.filter(c => c.startsWith("docker pull")).length, 3);
  assert.match(r.err, /pull failed after 3 attempts/);
});

test("pull: refuses a base image that is not pinned by digest", () => {
  const sb = sandbox();
  workers(sb.root, { a: "FROM reg.example/img:latest\n" });
  fake(sb.bin, "docker", DOCKER);
  const r = run(sb, "pull-base-images.sh", { FAILS_DIR: sb.root });
  assert.equal(r.code, 1);
  assert.match(r.err, /unpinned base image/);
  assert.deepEqual(r.calls, []);
});

// ── Docker Hub fallback ────────────────────────────────────────────────────────────────────────────────────────────────
const D = "4d06038800655fe1211760cd561de70ef2ed7a47f5d69255e9834414602b7026";
const ECR = "public.ecr.aws/docker/library/eclipse-temurin@sha256:" + D, HUB = "docker.io/library/eclipse-temurin@sha256:" + D;
// docker double with the REAL ECR Public quota message for every image listed in $QUOTA_LIST (one name per line); an image
// listed in $DOWN_LIST fails with a generic error. Everything else succeeds.
const DOCKER_QUOTA = 'echo "docker $*" >> "$LOG"\nif [ "$1" = pull ]; then\n' +
  '  if [ -f "$QUOTA_LIST" ] && grep -qxF "$3" "$QUOTA_LIST"; then echo "Error response from daemon: toomanyrequests: Data limit exceeded" >&2; exit 1; fi\n' +
  '  if [ -f "$DOWN_LIST" ] && grep -qxF "$3" "$DOWN_LIST"; then echo "Error response from daemon: net/http: TLS handshake timeout" >&2; exit 1; fi\nfi\nexit 0';
function quota(sb, { quotaOn = [], downOn = [] } = {}) {
  fake(sb.bin, "docker", DOCKER_QUOTA);
  fake(sb.bin, "sleep", 'echo "sleep $1" >> "$LOG"');
  fs.writeFileSync(path.join(sb.root, "quota.list"), quotaOn.join("\n") + "\n");
  fs.writeFileSync(path.join(sb.root, "down.list"), downOn.join("\n") + "\n");
  return { QUOTA_LIST: path.join(sb.root, "quota.list"), DOWN_LIST: path.join(sb.root, "down.list"), PULL_BACKOFF_SECONDS: "1", GITHUB_ENV: path.join(sb.root, "github.env") };
}
const githubEnv = sb => (fs.existsSync(path.join(sb.root, "github.env")) ? fs.readFileSync(path.join(sb.root, "github.env"), "utf8") : "");

test("fallback: an ECR Public QUOTA refusal pulls the SAME digest from Docker Hub at once and hands it to the build", () => {
  const sb = sandbox();
  workers(sb.root, { java: "FROM " + ECR + " AS jdk\nFROM reg.example/other@sha256:bbb\n" });
  const env = quota(sb, { quotaOn: [ECR] });
  const r = run(sb, "pull-base-images.sh", env);
  assert.equal(r.code, 0, r.err);
  // a quota is not retried (it does not clear in minutes): one ECR attempt, then the Docker Hub copy of the same digest
  assert.deepEqual(r.calls.filter(c => c.startsWith("docker pull")), ["docker pull --quiet " + ECR, "docker pull --quiet " + HUB, "docker pull --quiet reg.example/other@sha256:bbb"]);
  assert.ok(!r.calls.some(c => c.startsWith("sleep")), "no backoff wait on a quota refusal");
  assert.equal(githubEnv(sb), "BASE_IMAGE_CONTEXTS=" + ECR + "=docker-image://" + HUB + "\n");
  assert.match(r.out, /::warning title=Base image served by Docker Hub::/);
});

test("fallback: the Docker Hub pull is bounded too; when it also fails the job fails (nothing is built from another digest)", () => {
  const sb = sandbox();
  workers(sb.root, { java: "FROM " + ECR + "\n" });
  const env = quota(sb, { quotaOn: [ECR], downOn: [HUB] });
  const r = run(sb, "pull-base-images.sh", { ...env, PULL_ATTEMPTS: "2" });
  assert.equal(r.code, 1);
  assert.equal(r.calls.filter(c => c === "docker pull --quiet " + HUB).length, 2);
  assert.match(r.err, /pull failed after 2 attempts: docker\.io\/library\/eclipse-temurin@sha256:/);
  assert.equal(githubEnv(sb), "");
});

test("fallback: a generic ECR refusal is still retried first (no fallback while the bounded retries can succeed)", () => {
  const sb = sandbox();
  workers(sb.root, { java: "FROM " + ECR + "\n" });
  const env = quota(sb, { downOn: [ECR] });
  const r = run(sb, "pull-base-images.sh", { ...env, PULL_ATTEMPTS: "3" });
  assert.equal(r.code, 0, r.err);
  assert.equal(r.calls.filter(c => c === "docker pull --quiet " + ECR).length, 3);   // the 3 bounded attempts, then the fallback
  assert.ok(r.calls.includes("docker pull --quiet " + HUB));
});

test("fallback: only Docker Official Images on ECR Public have one — a quota on another registry fails after its retries", () => {
  const sb = sandbox();
  const MCR = "mcr.microsoft.com/dotnet/sdk@sha256:" + D;
  workers(sb.root, { cs: "FROM " + MCR + "\n" });
  const env = quota(sb, { quotaOn: [MCR] });
  const r = run(sb, "pull-base-images.sh", { ...env, PULL_ATTEMPTS: "2" });
  assert.equal(r.code, 1);
  assert.ok(!r.calls.some(c => c.includes("docker.io")));
  assert.equal(githubEnv(sb), "");
});

test("fallback: the real worker Dockerfiles — every ECR Public base has the one shape the fallback (and the build) accept", () => {
  const froms = fs.readdirSync(REAL_WORKERS).flatMap(d => { const f = path.join(REAL_WORKERS, d, "Dockerfile"); return fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(l => /^FROM\s/.test(l)).map(l => l.split(/\s+/)[1]) : []; });
  const ecr = froms.filter(i => i.startsWith("public.ecr.aws/"));
  assert.ok(ecr.length >= 2);
  for (const i of ecr) assert.match(i, /^public\.ecr\.aws\/docker\/library\/[a-z0-9][a-z0-9._-]*@sha256:[0-9a-f]{64}$/, i);
});

function buildRun(sb, env = {}) {
  workers(sb.root, { python: "FROM x\n", java: "FROM x\n", csharp: "FROM x\n" });
  fake(sb.bin, "docker", 'echo "docker $*" >> "$LOG"\nexit 0');
  return run(sb, "build-images.sh", env);
}
test("build: no BASE_IMAGE_CONTEXTS (the VM, or CI without a fallback) → the same three builds as before, no named context", () => {
  const sb = sandbox();
  const r = buildRun(sb);
  assert.equal(r.code, 0, r.err);
  const builds = r.calls.filter(c => c.startsWith("docker build"));
  assert.equal(builds.length, 3);
  for (const b of builds) { assert.ok(!b.includes("--build-context"), b); assert.ok(b.includes("--network none"), b); }
});
test("build: each valid named context is passed to every build", () => {
  const sb = sandbox();
  const PY = "public.ecr.aws/docker/library/python@sha256:" + "7".repeat(64);
  const entries = [ECR + "=docker-image://" + HUB, PY + "=docker-image://docker.io/library/python@sha256:" + "7".repeat(64)];
  const r = buildRun(sb, { BASE_IMAGE_CONTEXTS: entries.join(" ") });
  assert.equal(r.code, 0, r.err);
  const builds = r.calls.filter(c => c.startsWith("docker build"));
  assert.equal(builds.length, 3);
  for (const b of builds) for (const e of entries) assert.ok(b.includes("--build-context " + e), b);
});
test("build: refuses any named context that is not the same name AND digest on docker.io/library (nothing is built)", () => {
  for (const bad of [
    ECR + "=docker-image://docker.io/library/eclipse-temurin@sha256:" + "0".repeat(64),     // another digest
    ECR + "=docker-image://docker.io/library/python@sha256:" + D,                           // another image
    ECR + "=docker-image://evil.example/library/eclipse-temurin@sha256:" + D,               // another registry
    ECR + "=docker-image://docker.io/library/eclipse-temurin:21",                            // a tag
    "mcr.microsoft.com/dotnet/sdk@sha256:" + D + "=docker-image://docker.io/library/sdk@sha256:" + D,
    "public.ecr.aws/docker/library/eclipse-temurin:21=docker-image://docker.io/library/eclipse-temurin:21",
    ECR + "=local:///tmp/ctx",                                                                 // a local directory context
  ]) {
    const sb = sandbox();
    const r = buildRun(sb, { BASE_IMAGE_CONTEXTS: bad });
    assert.equal(r.code, 1, bad);
    assert.match(r.err, /refusing the base-image context/, bad);
    assert.ok(!r.calls.some(c => c.startsWith("docker build")), bad);
  }
});

const OIDC = { ACTIONS_ID_TOKEN_REQUEST_URL: "https://token.example/?x=1", ACTIONS_ID_TOKEN_REQUEST_TOKEN: "req-token-123", GITHUB_RUN_ID: "42" };
const ROLE = "arn:aws:iam::111111111111:role/gha-ecr-public";
function awsStack(sb, { stsFails = false } = {}) {
  fake(sb.bin, "docker", DOCKER);
  fake(sb.bin, "curl", 'echo "curl $*" >> "$LOG"\necho \'{"value":"oidc-jwt-SECRET"}\'');
  fake(sb.bin, "aws", 'echo "aws $1 $2" >> "$LOG"\n' +
    'if [ "$1" = sts ]; then ' + (stsFails ? 'echo "AccessDenied" >&2; exit 254; ' : '') + 'printf "AKIAEXAMPLE\\tsecret-key-SECRET\\tsession-token-SECRET\\n"; exit 0; fi\n' +
    'if [ "$1" = ecr-public ]; then [ "$AWS_SESSION_TOKEN" = session-token-SECRET ] || exit 9; printf "registry-password-SECRET"; exit 0; fi\nexit 1');
}

test("login: no role variable → warning, exit 0, nothing called (anonymous pulls as before)", () => {
  const sb = sandbox();
  awsStack(sb);
  const r = run(sb, "ecr-public-login.sh", { ...OIDC });
  assert.equal(r.code, 0);
  assert.match(r.out, /::warning title=ECR Public login skipped::ECR_PUBLIC_ROLE_ARN is not set/);
  assert.deepEqual(r.calls, []);
});

test("login: no OIDC token (fork pull request) → warning, exit 0, nothing called", () => {
  const sb = sandbox();
  awsStack(sb);
  const r = run(sb, "ecr-public-login.sh", { ECR_PUBLIC_ROLE_ARN: ROLE });
  assert.equal(r.code, 0);
  assert.match(r.out, /no OIDC token available/);
  assert.deepEqual(r.calls, []);
});

test("login: STS refusal → warning, exit 0, no docker login", () => {
  const sb = sandbox();
  awsStack(sb, { stsFails: true });
  const r = run(sb, "ecr-public-login.sh", { ECR_PUBLIC_ROLE_ARN: ROLE, ...OIDC });
  assert.equal(r.code, 0);
  assert.match(r.out, /AWS STS refused the role/);
  assert.ok(!r.calls.some(c => c.startsWith("docker login")));
});

test("login: full path logs in with the password on stdin and prints no credential outside ::add-mask::", () => {
  const sb = sandbox();
  awsStack(sb);
  const r = run(sb, "ecr-public-login.sh", { ECR_PUBLIC_ROLE_ARN: ROLE, ...OIDC });
  assert.equal(r.code, 0, r.err);
  assert.ok(r.calls.includes("docker login --username AWS --password-stdin public.ecr.aws"));
  assert.equal(fs.readFileSync(sb.log + ".stdin", "utf8"), "registry-password-SECRET");
  assert.ok(r.calls.some(c => c.startsWith("curl") && c.includes("audience=sts.amazonaws.com")));
  for (const line of (r.out + r.err).split("\n")) if (line.includes("SECRET")) assert.match(line, /^::add-mask::/, "leaked: " + line);
  for (const s of ["oidc-jwt-SECRET", "secret-key-SECRET", "session-token-SECRET", "registry-password-SECRET"]) assert.ok(r.out.includes("::add-mask::" + s), "not masked: " + s);
  assert.match(r.out, /Logged in to public\.ecr\.aws/);
  assert.ok(!r.calls.some(c => c.includes("SECRET")), "a credential appeared in a command line");
});
