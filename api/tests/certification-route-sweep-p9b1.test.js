import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createMemoryContainer } from "./fixtures/memory-container.js";

import { recordedManagedToken } from "./fixtures/managed-session.js";
// Tadris+ P9-B1 — the BEHAVIOURAL route sweep (blueprint §14.1, §17 criterion 1; acceptance tests #6 and #14). The static registry
// test (route-capabilities-p3b) proves every teacher route DECLARES a capability and ASKS for it; this sweep proves the answer:
// every HTTP registration of every declared route file is called, for every key of its map (each action, GET and POST), by a
// managed teacher who holds NOTHING, in the enforce mode — and must be refused 403 CAPABILITY_DENIED, with storage untouched
// byte for byte. Two such teachers: one the owner never assigned (default deny) and one whose revision denies every capability of
// its preset (an assigned but empty revision). The control: the same requests in the observe mode are never refused — so the 403s
// come from the enforcement, not from a malformed request. TEST data only; no provider, network or real storage is reached.

const require = createRequire(import.meta.url);
const FUNCTIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "functions");

const SAVED = { ...process.env };
process.env.BANK_SETUP_KEY = "p9b1-sweep-root-secret";
process.env.BUILDER_PASSWORD = "shared";
process.env.AZURE_STORAGE_CONNECTION_STRING = "UseDevelopmentStorage=true";   // never dialled: the blob client is replaced below
for (const k of ["BUILDER_SESSION_SECRET", "OWNER_SESSION_SECRET", "BUILDER_USERS", "BUILDER_USER_CODE", "BUILDER_SESSION_VERSION", "LEGACY_DATA_OWNER", "OPENAI_API_KEY", "AZURE_OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY"]) delete process.env[k];

const { ROUTE_CAPABILITIES } = require("../src/lib/access/route-capabilities.js");
const { PRESETS } = require("../src/lib/access/presets.js");
const { buildRevision, resetRevisionCache } = require("../src/lib/access/revisions.js");
const { ACCESS_CONTROL_DOC } = require("../src/lib/access/access-mode.js");
const { newTeacherSessionId } = require("../src/lib/identity/teacher-token.js");
const { teacherAccountName } = require("../src/lib/identity/teacher-accounts.js");
const { resetOperatorGateCache } = require("../src/lib/identity/operator-gate.js");

// Registrations in a declared route file that are NOT a teacher-session endpoint (each with why), so the sweep does not apply:
// they never read a teacher token. The list is exact — a new registration must either refuse the empty teacher or be added here.
const NOT_A_TEACHER_ENDPOINT = Object.freeze({
  codingGradeCallback: "the Coding Runner's HMAC-signed callback (no teacher session; refused 401 without a valid signature)",
  codingGradingSweep: "the scheduled recovery sweep, HMAC-signed with its own key (no teacher session)",
  simulatorRuntime: "a published simulator's files by content hash, loaded by a student's exam (no session; unknown hash → 404)",
  meshAssetRuntime: "a published 3D model by content hash, loaded by a student's exam (no session; unknown hash → 404)"
});

const NOBODY = "t_00000000000000f1";      // a managed teacher the owner never assigned
const EMPTY = "t_00000000000000f2";       // a managed teacher whose revision denies everything its preset grants
let mem;
let emptyRevision;
const registrations = [];
let restoreBlob;

beforeAll(() => {
  for (const m of ["log", "info", "warn", "error"]) vi.spyOn(console, m).mockImplementation(() => {});   // the routes' request logs
  const blob = require("@azure/storage-blob");
  const real = blob.BlobServiceClient.fromConnectionString;
  blob.BlobServiceClient.fromConnectionString = () => ({ getContainerClient: () => mem.container });
  restoreBlob = () => { blob.BlobServiceClient.fromConnectionString = real; };
  const fnPkg = require("@azure/functions");
  const realHttp = fnPkg.app.http;
  const registeringFile = () => { const frame = (new Error().stack || "").split("\n").find(l => l.includes(FUNCTIONS_DIR)); const m = frame && frame.match(/functions[\\/]([^\\/:]+\.js)/); return m ? m[1] : "?"; };
  fnPkg.app.http = (name, options) => { registrations.push({ name, file: registeringFile(), ...options }); };
  try { for (const file of Object.keys(ROUTE_CAPABILITIES)) require(join(FUNCTIONS_DIR, file)); } finally { fnPkg.app.http = realHttp; }
  const base = PRESETS.find(p => p.id === "learning-only" && p.version === 1);
  emptyRevision = buildRevision({ accountId: EMPTY, presetId: "learning-only", presetVersion: 1, denies: [...base.capabilities], createdBy: "owner:own_0011223344556677" });
});
afterAll(() => {
  if (restoreBlob) restoreBlob();
  vi.restoreAllMocks();
  for (const k of Object.keys(process.env)) if (!(k in SAVED)) delete process.env[k];
  Object.assign(process.env, SAVED);
});

/** A fresh platform: the two teachers, their sessions and the mode. Returns each teacher's token. */
function freshPlatform(mode) {
  resetOperatorGateCache(); resetRevisionCache();
  mem = createMemoryContainer({});
  const account = (id, extra = {}) => mem.setJson(teacherAccountName(id), { schemaVersion: 1, accountId: id, role: "teacher", username: "u" + id.slice(-2), displayName: "معلم تجريبي", status: "active", credential: { algo: "scrypt" }, authVersion: 1, revokedSessions: [], ...extra });
  account(NOBODY);
  mem.setJson("platform/access/revisions/" + emptyRevision.revision.revisionId + ".json", emptyRevision.revision);
  account(EMPTY, { accessRevisionId: emptyRevision.revision.revisionId, accessPreset: { id: "learning-only", version: 1 } });
  mem.setJson(ACCESS_CONTROL_DOC, { schemaVersion: 1, mode });
  const token = id => recordedManagedToken(mem, { accountId: id, sid: newTeacherSessionId(), authVersion: 1 }).token;
  return { [NOBODY]: token(NOBODY), [EMPTY]: token(EMPTY) };
}

function request(method, route, action, token) {
  const url = new URL("https://x.invalid/api/" + route.replace(/\{[^}]+\}/g, "x") + (action ? "?action=" + encodeURIComponent(action) : ""));
  const h = { "x-builder-token": token, authorization: "Bearer " + token, "content-type": "application/json" };
  const body = action ? { action } : {};
  return {
    method, url: url.href, query: url.searchParams, params: { action: action || "" },
    headers: { get: k => h[String(k).toLowerCase()] ?? null },
    json: async () => body, text: async () => JSON.stringify(body), arrayBuffer: async () => new ArrayBuffer(0),
    formData: async () => { throw new Error("no form data in the sweep"); }
  };
}
// The one write a refused request may cause: the AI routes' rate-limit wrapper (D3, at registration) takes a token from the
// caller's OWN bucket before the handler — and so before the capability check. A counter, never content; no provider is reached.
const AI_BUCKETS = "platform/throttle/ai-";
const snapshot = () => JSON.stringify([...mem.store.entries()].filter(([n]) => !n.startsWith(AI_BUCKETS)).map(([n, e]) => [n, e.content.toString("base64")]).sort());
const actionOf = key => (["GET", "POST", "*"].includes(key) ? "" : key);
const swept = () => registrations.filter(r => !NOT_A_TEACHER_ENDPOINT[r.name]);

/** Every (registration × key × method) call for `teacher`; returns the calls whose answer `bad` flags, with the store checked. */
async function sweep(mode, teacher, bad) {
  const out = [];
  for (const reg of swept()) {
    for (const key of Object.keys(ROUTE_CAPABILITIES[reg.file])) {
      for (const method of reg.methods || ["GET"]) {
        const tokens = freshPlatform(mode);
        const before = snapshot();
        let r;
        try { r = await reg.handler(request(method, reg.route, actionOf(key), tokens[teacher]), { invocationId: "p9b1-sweep" }); } catch (e) { r = { status: "threw: " + e.message }; }
        const label = reg.file + " [" + reg.name + "] " + method + " " + key + " → " + r.status + (r.jsonBody && r.jsonBody.code ? " " + r.jsonBody.code : "");
        if (bad(r)) out.push(label);
        else if (mode === "enforce" && snapshot() !== before) out.push(label + " (storage changed)");
      }
    }
  }
  return out;
}
const refused = r => r.status === 403 && r.jsonBody && r.jsonBody.code === "CAPABILITY_DENIED";

describe("P9-B1 behavioural route sweep — the inventory", () => {
  it("every declared route file is reached by at least one HTTP registration", () => {
    const files = new Set(registrations.map(r => r.file));
    expect(Object.keys(ROUTE_CAPABILITIES).filter(f => !files.has(f))).toEqual([]);
    expect(registrations.every(r => ROUTE_CAPABILITIES[r.file])).toBe(true);
    expect(swept().length).toBeGreaterThanOrEqual(Object.keys(ROUTE_CAPABILITIES).length);
  });
  it("the registrations outside the sweep are exactly the named non-teacher endpoints, and none of them serves the empty teacher", async () => {
    const names = registrations.map(r => r.name);
    expect(Object.keys(NOT_A_TEACHER_ENDPOINT).filter(n => !names.includes(n))).toEqual([]);
    for (const reg of registrations.filter(r => NOT_A_TEACHER_ENDPOINT[r.name])) {
      const tokens = freshPlatform("enforce");
      const before = snapshot();
      const r = await reg.handler(request((reg.methods || ["GET"])[0], reg.route, "", tokens[NOBODY]), { invocationId: "p9b1-sweep" });
      expect([401, 404], reg.name + " → " + r.status).toContain(r.status);
      expect(snapshot()).toBe(before);
    }
  });
});

describe("P9-B1 behavioural route sweep — enforce: a teacher who holds nothing can do nothing", () => {
  it("never assigned (default deny): every route, every action, GET and POST → 403 CAPABILITY_DENIED; nothing stored changes", async () => {
    expect(await sweep("enforce", NOBODY, r => !refused(r))).toEqual([]);
  }, 60000);
  it("an assigned revision that denies everything: the same — 403 CAPABILITY_DENIED everywhere; nothing stored changes", async () => {
    expect(emptyRevision.capabilities).toEqual([]);
    expect(await sweep("enforce", EMPTY, r => !refused(r))).toEqual([]);
  }, 60000);
});

describe("P9-B1 behavioural route sweep — the control", () => {
  it("observe: the very same requests are never refused (the 403s above are the enforcement, not a malformed request)", async () => {
    expect(await sweep("observe", NOBODY, r => refused(r) || (r.jsonBody && r.jsonBody.code === "ACCESS_UNAVAILABLE"))).toEqual([]);
  }, 60000);
});
