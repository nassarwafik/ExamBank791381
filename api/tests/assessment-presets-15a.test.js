import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Phase 15A — personal Assessment Presets: server-owned storage (P5), ownership isolation (P6), optimistic concurrency (P7),
// server-side canonical validation (parity with the frontend through the generated shared build), 14B session inheritance,
// legacy exam-template compatibility. Fail-first on 79b2f9e (lib + function absent; legacy template contract present).
const SAVED = { ...process.env };
process.env.BANK_SETUP_KEY = "15a-test-secret";
delete process.env.BUILDER_SESSION_SECRET; delete process.env.STUDENT_SESSION_SECRET; delete process.env.BUILDER_USERS; delete process.env.BUILDER_USER_CODE; delete process.env.BUILDER_SESSION_VERSION;
process.env.BUILDER_PASSWORD = "legacy-shared-pw";

const { createBuilderToken } = await import("../src/lib/builder-auth.js");
const { createStudentToken } = await import("../src/lib/student-auth.js");
const { handler } = await import("../src/functions/assessment-presets.js");
const { handler: saveArtifact } = await import("../src/functions/save-exam-artifact.js");
const lib = await import("../src/lib/assessment-presets.js");
afterAll(() => { for (const k of Object.keys(process.env)) if (!(k in SAVED)) delete process.env[k]; Object.assign(process.env, SAVED); });

function preset(over = {}) {
  return {
    schemaVersion: 1, presetId: "apr-client-chosen", title: "قالب شبكات — 5 وحدات", description: "تصميم امتحان نصفي",
    blueprint: {
      schemaVersion: 1, subject: { id: "networking", label: "شبكات الحاسوب" }, course: { id: "791381", label: "مقرر 791381" }, level: { id: "12", label: "ثاني ثانوي" },
      topics: [{ id: "t1", label: "IPv4" }, { id: "t2", label: "VLAN" }], objectives: [{ id: "o1", label: "يحسب شبكة فرعية", topicId: "t1" }],
      targets: { totalQuestions: 20, totalMarks: 60 },
      constraints: [{ id: "c1", dimension: "topic", ref: "t1", metric: "count", unit: "absolute", min: 2 }, { id: "c2", dimension: "section", ref: "ps-A", metric: "count", unit: "absolute", min: 1 }],
      qualityPolicy: { schemaVersion: 1, enabled: true, rules: [{ id: "qr1", enabled: true, source: { kind: "constraint", constraintId: "c1" }, relations: ["below-min"], effect: "block-finalization" }] }
    },
    sections: [{ presetSectionId: "ps-A", title: "القسم الأول", gradingPolicy: "all" }, { presetSectionId: "ps-B", title: "القسم الثاني", gradingPolicy: "capScore", maxMarks: 8 }],
    presentationTheme: "cards",
    ...over
  };
}
let mem, deps, A, B;
beforeEach(() => { delete process.env.BUILDER_USERS; mem = createMemoryContainer(); deps = { getContainer: () => mem.container, now: (() => { let t = Date.parse("2026-10-10T08:00:00.000Z"); return () => new Date((t += 1000)).toISOString(); })() }; A = createBuilderToken("teacher-a"); B = createBuilderToken("teacher-b"); });
const req = (body, token) => ({ method: "POST", url: "http://x/api/assessment-presets", params: {}, headers: new Headers(token ? { authorization: "Bearer " + token } : {}), json: async () => body });
const call = (body, token = A) => handler(req(body, token), deps);
const ok = async (body, token) => { const r = await call(body, token); expect(r.status, JSON.stringify(r.jsonBody)).toBe(200); return r.jsonBody; };
const names = () => mem.names(lib.PRESET_PREFIX);

describe("15A P5 — create / list / load with server-owned metadata", () => {
  it("create: the server chooses presetId, ownerId (token subject), version 1 and timestamps; the client's presetId / ownerId / version are ignored; stored under a hashed owner key", async () => {
    const r = await ok({ action: "create", preset: preset(), ownerId: "teacher-b", version: 9, presetId: "evil" });
    const rec = r.record;
    expect(rec).toMatchObject({ schemaVersion: 1, ownerId: "teacher-a", version: 1 });
    expect(rec.presetId).toMatch(/^apr-/); expect(rec.presetId).not.toBe("apr-client-chosen"); expect(rec.preset.presetId).toBe(rec.presetId);
    expect(rec.createdAt).toBe(rec.updatedAt); expect(rec.createdAt).toMatch(/^2026-10-10T/);
    expect(rec.preset.title).toBe("قالب شبكات — 5 وحدات"); expect(rec.preset.sections).toHaveLength(2);
    expect(names()).toHaveLength(1);
    expect(names()[0]).toBe(lib.PRESET_PREFIX + lib.ownerKey("teacher-a") + "/" + rec.presetId + ".json");
    expect(names()[0]).not.toContain("teacher-a"); expect(lib.ownerKey("teacher-a")).toMatch(/^[a-f0-9]{32}$/);
    expect(mem.names("templates/")).toEqual([]);                                        // never inside the legacy template namespace
  });
  it("create is create-only: an id collision never overwrites an existing preset", async () => {
    const first = await ok({ action: "create", preset: preset() });
    const r = await handler(req({ action: "create", preset: preset({ title: "آخر" }) }, A), { ...deps, newId: () => first.record.presetId.slice(4) });
    expect(r.status).toBe(409);
    expect(mem.getJson(names()[0]).preset.title).toBe("قالب شبكات — 5 وحدات");
  });
  it("create validates canonically on the server: invalid Blueprint / policy / duplicate sections / questions / no blueprint ⇒ 400 PRESET_INVALID with issues, nothing stored", async () => {
    const bad = [
      preset({ blueprint: { ...preset().blueprint, topics: "x" } }),
      preset({ blueprint: { ...preset().blueprint, qualityPolicy: { schemaVersion: 1, enabled: true, rules: [{ id: "r", enabled: true, source: { kind: "constraint", constraintId: "ghost" }, relations: ["below-min"], effect: "warning" }] } } }),
      preset({ sections: [{ presetSectionId: "ps-A", title: "أ", gradingPolicy: "all" }, { presetSectionId: "ps-A", title: "ب", gradingPolicy: "all" }] }),
      preset({ sections: [{ presetSectionId: "ps-A", title: "أ", gradingPolicy: "all", questions: [] }] }),
      preset({ blueprint: { ...preset().blueprint, constraints: [{ id: "c2", dimension: "section", ref: "sec-real-A", metric: "count", unit: "absolute", min: 1 }] } }),
      preset({ blueprint: undefined }),
      preset({ title: "" }),
      { schemaVersion: 2 }, "text", null
    ];
    for (const p of bad) { const r = await call({ action: "create", preset: p }); expect(r.status, JSON.stringify(p).slice(0, 80)).toBe(400); expect(r.jsonBody.code).toBe("PRESET_INVALID"); expect(Array.isArray(r.jsonBody.issues)).toBe(true); }
    expect(names()).toEqual([]);
  });
  it("list returns only the caller's presets as bounded metadata (title, subject, course, level, counts, version, updatedAt) — no blueprint / sections bodies; filter by title / subject / course; default 20 / max 50", async () => {
    for (let i = 1; i <= 23; i++) await ok({ action: "create", preset: preset({ title: "قالب " + i, blueprint: { ...preset().blueprint, subject: { id: i % 2 ? "networking" : "math", label: i % 2 ? "شبكات" : "رياضيات" } } }) });
    await ok({ action: "create", preset: preset({ title: "قالب المعلم ب" }) }, B);
    const page = await ok({ action: "list" });
    expect(page.items).toHaveLength(20); expect(page.nextCursor).not.toBeNull();
    expect(page.items[0]).toMatchObject({ version: 1, sectionCount: 2, topicCount: 2, objectiveCount: 1, constraintCount: 2, qualityRuleCount: 1, course: "مقرر 791381", level: "ثاني ثانوي" });
    expect(page.items[0].blueprint).toBeUndefined(); expect(page.items[0].sections).toBeUndefined();
    expect(page.items.some(x => x.title === "قالب المعلم ب")).toBe(false);
    const rest = await ok({ action: "list", cursor: page.nextCursor });
    expect(rest.items).toHaveLength(3); expect(rest.nextCursor).toBeNull();
    const math = await ok({ action: "list", q: "رياضيات", limit: 50 });
    expect(math.items.length).toBe(11); expect(math.items.every(x => x.subject === "رياضيات")).toBe(true);
    const byTitle = await ok({ action: "list", q: "قالب 7", limit: 50 });
    expect(byTitle.items.map(x => x.title)).toEqual(["قالب 7"]);
    const huge = await ok({ action: "list", limit: 999 });
    expect(huge.items.length).toBeLessThanOrEqual(50);
  });
  it("load returns the full record to its owner only", async () => {
    const c = await ok({ action: "create", preset: preset() });
    const l = await ok({ action: "load", presetId: c.record.presetId });
    expect(l.record).toEqual(c.record);
    expect((await call({ action: "load", presetId: "apr-missing" })).status).toBe(404);
    expect((await call({ action: "load", presetId: "../../etc" })).status).toBe(404);
  });
});

describe("15A P7 — optimistic concurrency (update / delete)", () => {
  it("update with the matching expectedVersion succeeds, increments version, stamps updatedAt (server) and re-validates; a stale expectedVersion is 409 and changes nothing", async () => {
    const c = await ok({ action: "create", preset: preset() });
    const u = await ok({ action: "update", presetId: c.record.presetId, expectedVersion: 1, preset: preset({ title: "قالب محدَّث" }), ownerId: "teacher-b" });
    expect(u.record).toMatchObject({ presetId: c.record.presetId, ownerId: "teacher-a", version: 2, createdAt: c.record.createdAt });
    expect(u.record.updatedAt > c.record.updatedAt).toBe(true); expect(u.record.preset.title).toBe("قالب محدَّث");
    const stale = await call({ action: "update", presetId: c.record.presetId, expectedVersion: 1, preset: preset({ title: "قديم" }) });
    expect(stale.status).toBe(409); expect(stale.jsonBody.code).toBe("STALE_VERSION"); expect(stale.jsonBody.record.version).toBe(2);
    expect(mem.getJson(names()[0]).preset.title).toBe("قالب محدَّث");
    const bad = await call({ action: "update", presetId: c.record.presetId, expectedVersion: 2, preset: preset({ title: "" }) });
    expect(bad.status).toBe(400); expect(mem.getJson(names()[0]).version).toBe(2);
    const missing = await call({ action: "update", presetId: c.record.presetId, preset: preset() });
    expect(missing.status).toBe(400);
  });
  it("two clients hold version 3 and both update: exactly one CAS succeeds (version 4), the other is 409; no duplicate version-4 write", async () => {
    const c = await ok({ action: "create", preset: preset() });
    await ok({ action: "update", presetId: c.record.presetId, expectedVersion: 1, preset: preset({ title: "v2" }) });
    await ok({ action: "update", presetId: c.record.presetId, expectedVersion: 2, preset: preset({ title: "v3" }) });
    const results = await Promise.allSettled([
      call({ action: "update", presetId: c.record.presetId, expectedVersion: 3, preset: preset({ title: "client-1" }) }),
      call({ action: "update", presetId: c.record.presetId, expectedVersion: 3, preset: preset({ title: "client-2" }) })
    ]);
    const statuses = results.map(r => r.value.status).sort();
    expect(statuses).toEqual([200, 409]);
    const stored = mem.getJson(names()[0]);
    expect(stored.version).toBe(4);
    const winner = results.find(r => r.value.status === 200).value.jsonBody.record;
    expect(stored.preset.title).toBe(winner.preset.title);
  });
  it("delete requires the current version: a stale delete is refused and the newer edit survives; the owner's fresh delete removes the blob; existing exams are never touched", async () => {
    const c = await ok({ action: "create", preset: preset() });
    mem.setJson("exams/EXAM-1.json", { exam: { examId: "EXAM-1", title: "created from preset", sections: [] } });
    await ok({ action: "update", presetId: c.record.presetId, expectedVersion: 1, preset: preset({ title: "v2" }) });
    const stale = await call({ action: "delete", presetId: c.record.presetId, expectedVersion: 1 });
    expect(stale.status).toBe(409); expect(names()).toHaveLength(1);
    const d = await ok({ action: "delete", presetId: c.record.presetId, expectedVersion: 2 });
    expect(d.deleted).toBe(true); expect(names()).toEqual([]);
    expect(mem.getJson("exams/EXAM-1.json").exam.title).toBe("created from preset");
    expect((await call({ action: "delete", presetId: c.record.presetId, expectedVersion: 2 })).status).toBe(404);
  });
});

describe("15A P6 — ownership isolation and security", () => {
  it("teacher B cannot list, load, update or delete teacher A's preset even knowing its id (404 — no directory leak); A still can", async () => {
    const c = await ok({ action: "create", preset: preset() });
    const id = c.record.presetId;
    expect((await ok({ action: "list" }, B)).items).toEqual([]);
    const load = await call({ action: "load", presetId: id }, B); expect(load.status).toBe(404);
    const missing = await call({ action: "load", presetId: "apr-does-not-exist" }, B); expect(missing.status).toBe(404); expect(load.jsonBody).toEqual(missing.jsonBody);
    expect((await call({ action: "update", presetId: id, expectedVersion: 1, preset: preset({ title: "hijack" }) }, B)).status).toBe(404);
    expect((await call({ action: "update", presetId: id, expectedVersion: 1, preset: preset({ title: "hijack" }), ownerId: "teacher-a" }, B)).status).toBe(404);
    expect((await call({ action: "delete", presetId: id, expectedVersion: 1 }, B)).status).toBe(404);
    expect(names()).toHaveLength(1); expect(mem.getJson(names()[0])).toMatchObject({ ownerId: "teacher-a", version: 1 });
    expect(mem.getJson(names()[0]).preset.title).toBe("قالب شبكات — 5 وحدات");
    expect((await ok({ action: "load", presetId: id })).record.ownerId).toBe("teacher-a");
    expect((await ok({ action: "list" })).items).toHaveLength(1);
  });
  it("anonymous and student tokens are 401; unsupported actions are 400; nothing is written", async () => {
    for (const t of [null, createStudentToken({ userId: "s1", authVersion: 1 }), "garbage", A + "x"]) { const r = await call({ action: "create", preset: preset() }, t); expect(r.status, String(t)).toBe(401); }
    expect((await call({ action: "purge-all" })).status).toBe(400);
    expect(names()).toEqual([]);
  });
  it("Phase 14B session binding is inherited: a legacy token after the multi-user cutover, a removed account's token and a malformed BUILDER_USERS session are all 401", async () => {
    const legacyToken = createBuilderToken("teacher-approver");                    // minted under the legacy configuration
    process.env.BUILDER_USERS = JSON.stringify({ users: { "teacher-approver": { passwordEnv: "PW_X" }, "teacher-author": { passwordEnv: "PW_Y" } } }); process.env.PW_X = "x"; process.env.PW_Y = "y";
    expect((await call({ action: "list" }, legacyToken)).status).toBe(401);
    const multi = createBuilderToken("teacher-author");
    expect((await call({ action: "list" }, multi)).status).toBe(200);
    process.env.BUILDER_USERS = JSON.stringify({ users: { "teacher-approver": { passwordEnv: "PW_X" } } });   // teacher-author removed
    expect((await call({ action: "list" }, multi)).status).toBe(401);
    process.env.BUILDER_USERS = "{broken";
    expect((await call({ action: "list" }, createBuilderToken.length ? legacyToken : legacyToken)).status).toBe(401);
    delete process.env.BUILDER_USERS; delete process.env.PW_X; delete process.env.PW_Y;
    expect((await call({ action: "list" }, legacyToken)).status).toBe(200);          // legacy single-teacher deployments keep working
  });
});

describe("15A — legacy exam-template compatibility", () => {
  it("the legacy save-exam-artifact template path is untouched: kind template still writes an exam-template blob under templates/ with the legacy shape, and it is never reinterpreted as an Assessment Preset", async () => {
    const r = await saveArtifact({ method: "POST", url: "http://x/api/save-exam-artifact", params: {}, headers: new Headers({ authorization: "Bearer " + A }), json: async () => ({ kind: "template", exam: { examId: "EX-T", title: "قالب قديم", plan: { title: "خطة" }, totalMarks: 30, metadata: { grade: "10" }, presentationTheme: "classic", questions: [] } }) }, { getContainer: () => mem.container });
    expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
    const tpl = mem.names("templates/");
    expect(tpl).toHaveLength(1);
    const doc = mem.getJson(tpl[0]);
    expect(doc).toMatchObject({ schemaVersion: 1, kind: "exam-template", title: "قالب قديم", totalMarks: 30, presentationTheme: "classic" });
    expect(doc.templateId).toMatch(/^TPL-/); expect(doc.plan).toEqual({ title: "خطة" });
    expect(doc.blueprint).toBeUndefined(); expect(doc.sections).toBeUndefined();
    expect((await ok({ action: "list" })).items).toEqual([]);                                   // presets never list legacy templates
    expect(names()).toEqual([]);
  });
});
