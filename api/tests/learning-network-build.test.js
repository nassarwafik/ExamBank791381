// «ابنِ الشبكة» (docs/enterprise-network-build-exercises.md) — the SERVER judge of a build-the-network exercise through the REAL attempt
// route, on the REAL generated indexes of book 791381 (module m29):
//   • the generated check index holds the key (kinds, checks, the solution's network as the reference) and the feedback; the served
//     module body holds the task only;
//   • the exercises are study activities (owner decision 2026-11-26: m29 is the 29th study module, 20 points): the empty network is
//     wrong with per-goal booleans and nothing is written; the authored solution is right and completed ONCE (m29: 1 of 7 → 3 points);
//   • the verdict carries booleans and the issue code only — never a check kind, an expected value or the reference;
//   • a key the judge cannot trust → 503 retryable, nothing written; an answer over 384 KB → 413; an unpublished module → 403;
//     a teacher is judged and never persisted.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { handler } from "../src/functions/learning-study.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { evaluateNetworkBuild } from "../src/lib/learning-network-build.js";
import { checkResponse } from "../src/lib/learning-check.js";
import { evaluateStudyResponse, studyDocName } from "../src/lib/learning-study.js";

const CID = "791381", MID = "791381-m29";
const readJson = p => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const CHECKS = readJson("../src/data/learning-check/791381.json");
const STUDY = readJson("../src/data/learning-study/791381.json");
const BODY = readJson("../src/data/learning-content/791381/791381-m29.json");
const PAGE = "791381-m29-l01-p01", ACT = "m29-l01-p01-build-lan";
const entry = CHECKS.pages[PAGE].activities[ACT];
const EMPTY = { kind: "network-build", config: { v: 2, devices: [], links: [] }, actions: [] };
// the solution is the reference the key carries (plus its actions, known only to the authored module)
const SOLUTION_ACTIONS = ["pc1", "pc2", "pc3"].map((d, i) => ({ type: "host.setStatic", deviceId: d, adapter: "eth0", address: "192.168.1.1" + i, mask: "255.255.255.0", gateway: "", dns: "" }));
const SOLVED = { kind: "network-build", config: entry.key.reference, actions: SOLUTION_ACTIONS };

const USR = id => "platform/users/" + id + ".json", CLS = id => "platform/classes/" + id + ".json";
const student = (id, classId) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId, displayName: "علي", code: "S1" });
const room = (id, visible) => ({ classId: id, name: "صف " + id, active: true, status: "active", studentIds: [], learningMaterials: [{ courseId: CID, visibleModuleIds: visible }] });
const BUILDER_NO = { requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } }) };
const BUILDER_OK = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
const BROKEN = "broken-build";
function indexes() {
  const checks = JSON.parse(JSON.stringify(CHECKS));
  checks.pages[PAGE].activities[BROKEN] = { ...entry, key: { ...entry.key, checks: [...entry.key.checks, { id: "zz", label: "x", weight: 1, kind: "host.address", deviceId: "pc9", adapter: "eth0", value: "1.1.1.1" }] } };
  return { loadCheckIndex: id => (id === CID ? checks : null), loadStudyIndex: id => (id === CID ? STUDY : null) };
}
const seed = (visible = [MID]) => createMemoryContainer({ [USR("u1")]: student("u1", "cA"), [CLS("cA")]: room("cA", visible) });
const studentDeps = ctx => ({ ...BUILDER_NO, ...indexes(), requireStudentAuth: () => ({ ok: true, user: { sub: "u1", sv: 1, role: "student", classId: "STALE" } }), container: ctx.container, getContainer: () => ctx.container });
const teacherDeps = ctx => ({ ...BUILDER_OK, ...indexes(), container: ctx.container, getContainer: () => ctx.container });
const attempt = (deps, activityId, response) => handler({ method: "POST", url: "https://x/api/learning-study", headers: { get: () => null }, params: { courseId: CID, action: "attempt" }, json: async () => ({ pageId: PAGE, activityId, response }) }, deps);
const written = ctx => ctx.names("platform/").filter(n => !n.startsWith("platform/users/") && !n.startsWith("platform/classes/"));

describe("the generated indexes", () => {
  it("the check index holds the key and the feedback; the served body holds the task only", () => {
    expect(entry.key.kind).toBe("network-build");
    expect(entry.key.rules).toEqual({ kinds: ["switch", "pc"] });
    expect(entry.study).toBe(true);   // a study activity: m29 is the 29th study module (owner decision 2026-11-26)
    const served = BODY.lessons.flatMap(l => l.pages).flatMap(p => p.blocks).filter(b => b.simulationType === "network-build");
    expect(served).toHaveLength(7);
    for (const b of served) { expect(Object.keys(b.config)).toEqual(["task"]); expect(b.serverCheck).toBe(true); }
    expect(JSON.stringify(BODY)).not.toMatch(/"checks"|"solution"|"reference"/);
    expect(Object.keys(STUDY.pages).filter(p => p.startsWith("791381-m29-")).length).toBe(7);   // one exercise per page
    expect(STUDY.pages[PAGE].activities[ACT]).toEqual(entry.key);                                    // the study index holds the same key
  });
  it("the judge and the study rule agree", () => {
    expect(evaluateNetworkBuild(entry.key, SOLVED)).toMatchObject({ status: "judged", correct: true });
    expect(evaluateStudyResponse(entry.key, SOLVED)).toBe(true);
    expect(evaluateStudyResponse(entry.key, EMPTY)).toBe(false);
    const v = checkResponse(entry, EMPTY);
    expect(v.correct).toBe(false);
    expect(Object.values(v.parts).every(x => x === false)).toBe(true);
    expect(checkResponse({ ...entry, key: { ...entry.key, checks: [] } }, SOLVED)).toEqual({ unavailable: true });
  });
});

describe("POST /api/learning-study/791381/attempt — «ابنِ الشبكة»", () => {
  it("the empty network: wrong, booleans only, nothing written; the solution: completed once (m29 1/7 → 3 points); a repeat is read-only", async () => {
    const ctx = seed();
    const w = await attempt(studentDeps(ctx), ACT, EMPTY);
    expect(w.status).toBe(200);
    expect(w.jsonBody).toMatchObject({ ok: true, correct: false, persisted: false, gained: 0, study: true });
    expect(Object.keys(w.jsonBody.parts)).toEqual(entry.key.checks.map(c => c.id));
    expect(JSON.stringify(w.jsonBody)).not.toMatch(/build\.|reachability|host\.address|"reference"|"expected"|"actual"|deviceKind/);
    expect(w.jsonBody.feedback.hints.length).toBeGreaterThan(0);
    expect(written(ctx)).toEqual([]);
    const r = await attempt(studentDeps(ctx), ACT, SOLVED);
    expect(r.jsonBody).toMatchObject({ correct: true, persisted: true, alreadyCompleted: false, gained: 3, study: true, module: { completed: 1, eligible: 7, points: 3, max: 20 } });
    expect(r.jsonBody.feedback.explanation).toBeTruthy();
    const again = await attempt(studentDeps(ctx), ACT, SOLVED);
    expect(again.jsonBody).toMatchObject({ correct: true, persisted: false, alreadyCompleted: true, gained: 0 });
    expect(written(ctx)).toEqual([studyDocName("u1")]);
  });
  it("a forged verdict beside the empty network is never read", async () => {
    const ctx = seed();
    const r = await attempt(studentDeps(ctx), ACT, { ...EMPTY, correct: true, parts: { sw: true }, state: { solved: true } });
    expect(r.jsonBody).toMatchObject({ correct: false, persisted: false });
    expect(written(ctx)).toEqual([]);
  });
  it("a network with a kind the task does not offer is wrong with its reason", async () => {
    const ctx = seed();
    const config = { ...SOLVED.config, devices: [...SOLVED.config.devices, { id: "r1", kind: "router", label: "R1", x: 0.5, y: 0.1 }] };
    const r = await attempt(studentDeps(ctx), ACT, { ...SOLVED, config });
    expect(r.jsonBody).toMatchObject({ correct: false, issue: { code: "KIND_NOT_ALLOWED" } });
  });
  it("a key the judge cannot trust → 503 retryable, nothing written, never a wrong", async () => {
    const ctx = seed();
    for (const resp of [SOLVED, EMPTY]) {
      const r = await attempt(teacherDeps(ctx), BROKEN, resp);
      expect(r.status).toBe(503);
      expect(r.jsonBody).toMatchObject({ ok: false, retryable: true });
      expect("correct" in r.jsonBody).toBe(false);
    }
    expect(written(ctx)).toEqual([]);
  });
  it("over 384 KB → 413; unpublished module → 403; a teacher is judged and never persisted", async () => {
    const ctx = seed();
    const huge = { ...EMPTY, actions: [{ type: "host.command", deviceId: "pc1", command: "x".repeat(393216) }] };
    expect((await attempt(studentDeps(ctx), ACT, huge)).status).toBe(413);
    expect((await attempt(studentDeps(seed([])), ACT, SOLVED)).status).toBe(403);
    const t = await attempt(teacherDeps(ctx), ACT, SOLVED);
    expect(t.jsonBody).toMatchObject({ actor: "teacher", correct: true, persisted: false, gained: 0 });
    expect(written(ctx)).toEqual([]);
  });
});

// 791381s m37 (owner decision 2026-11-26) — the booklet's seven exercises, through the same real route with the booklet's own indexes:
// the served body holds the task only, every exercise is a study activity, and a right VTP network is completed once.
import m37 from "../../src/learning/content/791381s/modules/m37";
describe("POST /api/learning-study/791381s/attempt — «ابنِ الشبكة» in the booklet (m37)", () => {
  const SCID = "791381s", SMID = "791381s-m37", SPAGE = "791381s-m37-l01-p03", SACT = "m37-l01-p03-build-vtp";
  const SCHECKS = readJson("../src/data/learning-check/791381s.json"), SSTUDY = readJson("../src/data/learning-study/791381s.json");
  const SBODY = readJson("../src/data/learning-content/791381s/791381s-m37.json");
  const vtp = m37.lessons.flatMap(l => l.pages).flatMap(p => p.blocks).find(b => b.id === SACT).config.solution;
  const sDeps = ctx => ({ ...BUILDER_NO, loadCheckIndex: id => (id === SCID ? SCHECKS : null), loadStudyIndex: id => (id === SCID ? SSTUDY : null), requireStudentAuth: () => ({ ok: true, user: { sub: "u1", sv: 1, role: "student", classId: "STALE" } }), container: ctx.container, getContainer: () => ctx.container });
  const sSeed = () => createMemoryContainer({ [USR("u1")]: student("u1", "cA"), [CLS("cA")]: { ...room("cA", []), learningMaterials: [{ courseId: SCID, visibleModuleIds: [SMID] }] } });
  const sAttempt = (deps, response) => handler({ method: "POST", url: "https://x/api/learning-study", headers: { get: () => null }, params: { courseId: SCID, action: "attempt" }, json: async () => ({ pageId: SPAGE, activityId: SACT, response }) }, deps);

  it("the generated indexes: seven study exercises; the served body holds the task only", () => {
    expect(Object.keys(SSTUDY.pages).filter(p => p.startsWith(SMID + "-")).length).toBe(7);
    const served = SBODY.lessons.flatMap(l => l.pages).flatMap(p => p.blocks).filter(b => b.simulationType === "network-build");
    expect(served).toHaveLength(7);
    for (const b of served) expect(Object.keys(b.config)).toEqual(["task"]);
    expect(JSON.stringify(SBODY)).not.toMatch(/"checks"|"solution"|"reference"/);
  });
  it("the empty network is wrong (nothing written); the VTP solution is completed once (m37 1/7 → 3 points)", async () => {
    const ctx = sSeed();
    const w = await sAttempt(sDeps(ctx), EMPTY);
    expect(w.jsonBody).toMatchObject({ ok: true, correct: false, persisted: false, gained: 0, study: true });
    expect(written(ctx)).toEqual([]);
    const r = await sAttempt(sDeps(ctx), { kind: "network-build", config: vtp.config, actions: vtp.actions });
    expect(r.jsonBody).toMatchObject({ correct: true, persisted: true, gained: 3, module: { completed: 1, eligible: 7, points: 3, max: 20 } });
    expect((await sAttempt(sDeps(ctx), { kind: "network-build", config: vtp.config, actions: vtp.actions })).jsonBody).toMatchObject({ correct: true, persisted: false, alreadyCompleted: true, gained: 0 });
    expect(written(ctx)).toEqual([studyDocName("u1")]);
  });
});
