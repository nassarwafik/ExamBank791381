import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { createRequire } from "module";
import { readdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// D3 (item 5) — per-teacher rate limits on every AI route. Before D3 only the AI exam composer (Phase 20F) had one; the other twelve
// routes that reach an AI provider could be called without limit by any teacher session (a runaway client loop, a stolen token).
//
// The guard below discovers the routes from REALITY (the real app.http registrations, as the Phase 11A route inventory does) and
// the AI routes from the SOURCE (any function module that reaches an AI client). A new AI route registered without the wrapper fails
// this file by name.

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const FUNCTIONS_DIR = join(HERE, "..", "src", "functions");
const { AI_RATE_POLICIES, evaluateAiBucket, reserveAiCall, withAiRateLimit, bucketName } = require("../src/lib/ai-rate-limit.js");
const { createMemoryContainer } = require("./fixtures/memory-container.js");
const observability = require("../src/lib/observability.js");
const storage = require("../src/lib/platform-storage.js");

const SECRETS = { BUILDER_SESSION_SECRET: "ai-rate-d3-builder-secret", STUDENT_SESSION_SECRET: "ai-rate-d3-student-secret", BUILDER_PASSWORD: "ai-rate-d3-password" };
const saved = {};
beforeAll(() => { for (const [k, v] of Object.entries(SECRETS)) { saved[k] = process.env[k]; process.env[k] = v; } for (const k of ["BUILDER_USERS", "OPENAI_API_KEY"]) { saved[k] = process.env[k]; delete process.env[k]; } });
afterAll(() => { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });

const { createBuilderToken } = require("../src/lib/builder-auth.js");
const request = (token, body = "{}") => ({
  method: "POST", url: "https://example.invalid/api/x", headers: new Headers({ "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) }),
  query: new URLSearchParams(), params: {}, json: async () => JSON.parse(body), text: async () => body, arrayBuffer: async () => new TextEncoder().encode(body).buffer
});
const exhausted = (policy, nowMs) => ({ schemaVersion: 1, tokens: 0, updatedAt: nowMs });

describe("the token bucket", () => {
  it("policies: general 120 / 10 min, bulk 20 / hour, image 30 / hour", () => {
    expect(AI_RATE_POLICIES).toEqual({ "ai-general": { budget: 120, windowSeconds: 600 }, "ai-bulk": { budget: 20, windowSeconds: 3600 }, "ai-image": { budget: 30, windowSeconds: 3600 } });
  });
  it("a fresh teacher has the full budget; the call that would go below one token is refused with the real time to the next token", () => {
    let state = null;
    for (let i = 0; i < 20; i++) { const r = evaluateAiBucket("ai-bulk", state, 1000); expect(r.allowed).toBe(true); state = r.next; }
    const refused = evaluateAiBucket("ai-bulk", state, 1000);
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSeconds).toBe(180);                                   // one token per 3600 / 20 seconds
    expect(evaluateAiBucket("ai-bulk", state, 1000 + 180 * 1000).allowed).toBe(true);
  });
  it("refill never exceeds the budget; a corrupt record starts full; an unknown policy throws", () => {
    expect(evaluateAiBucket("ai-image", { tokens: 5, updatedAt: 0 }, 1e12).next.tokens).toBe(29);
    expect(evaluateAiBucket("ai-image", { tokens: "x" }, 5).next.tokens).toBe(29);
    expect(() => evaluateAiBucket("ai-everything", null, 0)).toThrow(/unknown AI rate policy/);
  });
  it("reservations are stored per policy and per teacher; the blob name carries no identity", async () => {
    const mem = createMemoryContainer();
    await reserveAiCall(mem.container, "ai-general", "teacher-a", { now: () => 5 });
    await reserveAiCall(mem.container, "ai-general", "teacher-a", { now: () => 5 });
    await reserveAiCall(mem.container, "ai-general", "teacher-b", { now: () => 5 });
    expect(mem.getJson(bucketName("ai-general", "teacher-a")).tokens).toBe(118);
    expect(mem.getJson(bucketName("ai-general", "teacher-b")).tokens).toBe(119);
    expect(mem.getJson(bucketName("ai-image", "teacher-a"))).toBeNull();
    expect(bucketName("ai-general", "teacher-a")).toMatch(/^platform\/throttle\/ai-ai-general-[0-9a-f]{64}\.json$/);
  });
});

describe("withAiRateLimit", () => {
  let mem, calls, logs;
  const inner = async () => { calls++; return { status: 200, jsonBody: { ok: true } }; };
  beforeEach(() => { mem = createMemoryContainer(); calls = 0; logs = []; observability.setSink(r => { logs.push(r); return r; }); });
  afterEach(() => observability.resetSink());

  it("an unauthenticated request reaches the handler (its own 401) and never touches the bucket", async () => {
    const h = withAiRateLimit("ai-x", "ai-general", inner, { getContainer: () => { throw new Error("must not be called"); } });
    expect((await h(request(null))).status).toBe(200);
    expect(calls).toBe(1);
  });
  it("within budget: the handler runs once and one token is spent for that teacher", async () => {
    const h = withAiRateLimit("ai-x", "ai-general", inner, { getContainer: () => mem.container, now: () => 1000 });
    expect((await h(request(createBuilderToken("teacher-a")))).status).toBe(200);
    expect(calls).toBe(1);
    expect(mem.getJson(bucketName("ai-general", "teacher-a")).tokens).toBe(119);
  });
  it("exhausted: 429 RATE_LIMITED with Retry-After and no-store; the handler (and its provider call) never runs; one throttled event without identity", async () => {
    mem.setJson(bucketName("ai-general", "teacher-a"), exhausted("ai-general", 1000));
    const h = withAiRateLimit("ai-x", "ai-general", inner, { getContainer: () => mem.container, now: () => 1000 });
    const r = await h(request(createBuilderToken("teacher-a")));
    expect(r.status).toBe(429);
    expect(r.jsonBody).toMatchObject({ ok: false, code: "RATE_LIMITED", retryAfterSeconds: 5 });
    expect(r.headers).toMatchObject({ "Retry-After": "5", "Cache-Control": "no-store" });
    expect(calls).toBe(0);
    const ev = logs.filter(l => l.event === "ai.rate_limited");
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ level: "warn", route: "ai-x", reason: "ai-general", outcome: "throttled" });
    expect(JSON.stringify(ev[0])).not.toContain("teacher-a");
  });
  it("another teacher is not affected by one teacher's exhausted bucket", async () => {
    mem.setJson(bucketName("ai-general", "teacher-a"), exhausted("ai-general", 1000));
    const h = withAiRateLimit("ai-x", "ai-general", inner, { getContainer: () => mem.container, now: () => 1000 });
    expect((await h(request(createBuilderToken("teacher-b")))).status).toBe(200);
  });
  it("storage failure fails CLOSED: 503 AI_UNAVAILABLE, no provider call", async () => {
    const h = withAiRateLimit("ai-x", "ai-general", inner, { getContainer: () => { throw new Error("storage down"); } });
    const r = await h(request(createBuilderToken("teacher-a")));
    expect(r.status).toBe(503);
    expect(r.jsonBody.code).toBe("AI_UNAVAILABLE");
    expect(calls).toBe(0);
    expect(logs.some(l => l.event === "ai.rate_limit.unavailable")).toBe(true);
  });
  it("an unknown policy is refused at registration, not at the first request", () => {
    expect(() => withAiRateLimit("ai-x", "ai-unlimited", inner)).toThrow(/unknown AI rate policy/);
  });
});

// ── Inventory: every registered route whose module reaches an AI provider is rate-limited ─────────────────────────────────────────
const AI_CLIENT = /quality-fix-ai-client|import-ai-client|new OpenAI\b|chat\.completions|images\.generate/;
// The Phase 20F composer keeps its own limiter (ai-composer-rate-limit.js, tested in its own suite).
const OWN_LIMITER = { "ai-exam-composer.js": /reserveComposerCall/ };
const EXPECTED_POLICY = {
  "ai-question-author.js": "ai-general", "ai-scenario-author.js": "ai-general", "analyze-global-exam-instruction.js": "ai-general",
  "classify-bank-batch.js": "ai-bulk", "classify-question-preview.js": "ai-general", "exam-quality-fix.js": "ai-general",
  "generate-question-image.js": "ai-image", "import-analyze.js": "ai-bulk", "interpret-exam-request.js": "ai-general",
  "question-ai-action.js": "ai-general", "structured-exam-ai-fix.js": "ai-general", "teacher-analytics-ai.js": "ai-general"
};

const registrations = [];
const aiFiles = [];
beforeAll(() => {
  const functionsPkg = require("@azure/functions");
  const realHttp = functionsPkg.app.http;
  const files = readdirSync(FUNCTIONS_DIR).filter(f => f.endsWith(".js")).sort();
  for (const file of files) delete require.cache[require.resolve(join(FUNCTIONS_DIR, file))];
  const registeringFile = () => { const frame = (new Error().stack || "").split("\n").find(l => l.includes(FUNCTIONS_DIR)); const m = frame && frame.match(/functions[\\/]([^\\/:]+\.js)/); return m ? m[1] : "?"; };
  functionsPkg.app.http = (name, options) => { registrations.push({ name, file: registeringFile(), ...options }); };
  try {
    for (const file of files) {
      if (AI_CLIENT.test(readFileSync(join(FUNCTIONS_DIR, file), "utf8"))) aiFiles.push(file);
      require(join(FUNCTIONS_DIR, file));
    }
  } finally { functionsPkg.app.http = realHttp; }
});

describe("inventory — no AI route without a rate limit", () => {
  it("the AI routes found in the source are exactly the known ones (a new one must be classified here)", () => {
    expect(aiFiles.sort()).toEqual([...Object.keys(EXPECTED_POLICY), ...Object.keys(OWN_LIMITER)].sort());
    for (const [file, pattern] of Object.entries(OWN_LIMITER)) expect(readFileSync(join(FUNCTIONS_DIR, file), "utf8")).toMatch(pattern);
  });
  it("each AI route is registered through withAiRateLimit with its policy", () => {
    for (const [file, policy] of Object.entries(EXPECTED_POLICY)) {
      const src = readFileSync(join(FUNCTIONS_DIR, file), "utf8");
      const route = file.replace(/\.js$/, "");
      expect(src, file).toContain('withAiRateLimit("' + route + '", "' + policy + '", ');
      expect(registrations.filter(r => r.file === file && r.route === route), file).toHaveLength(1);
    }
  });
  it("calling each REAL registered handler with a teacher session whose bucket is exhausted answers 429 before any handler code runs", async () => {
    const mem = createMemoryContainer();
    const realGet = storage.getContainer;
    storage.getContainer = () => mem.container;
    try {
      const token = createBuilderToken("teacher-inventory");
      for (const [file, policy] of Object.entries(EXPECTED_POLICY)) {
        mem.setJson(bucketName(policy, "teacher-inventory"), { schemaVersion: 1, tokens: 0, updatedAt: Date.now() });
        const reg = registrations.find(r => r.file === file);
        const r = await reg.handler(request(token), { invocationId: "d3", functionName: reg.name, log() {}, error() {}, warn() {}, info() {}, trace() {}, debug() {} });
        expect(r.status, file).toBe(429);
        expect(r.jsonBody && r.jsonBody.code, file).toBe("RATE_LIMITED");
      }
    } finally { storage.getContainer = realGet; }
  });
  it("with budget left the same handlers run (not 429) and spend exactly one token of their own policy", async () => {
    const mem = createMemoryContainer();
    const realGet = storage.getContainer;
    storage.getContainer = () => mem.container;
    try {
      const token = createBuilderToken("teacher-fresh");
      for (const [file, policy] of Object.entries(EXPECTED_POLICY)) {
        const before = mem.getJson(bucketName(policy, "teacher-fresh"));
        const reg = registrations.find(r => r.file === file);
        const r = await reg.handler(request(token), { invocationId: "d3", functionName: reg.name, log() {}, error() {}, warn() {}, info() {}, trace() {}, debug() {} });
        expect(r.status, file).not.toBe(429);
        const after = mem.getJson(bucketName(policy, "teacher-fresh"));
        expect(Math.round(after.tokens), file).toBe(Math.round((before ? before.tokens : AI_RATE_POLICIES[policy].budget) - 1));
      }
    } finally { storage.getContainer = realGet; }
  });
});
