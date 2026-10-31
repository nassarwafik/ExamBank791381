import { describe, it, expect } from "vitest";
import { handler } from "../src/functions/learning-study.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { evaluateNetworkLab } from "../src/lib/learning-lab.js";
import { evaluateStudyResponse, studyDocName } from "../src/lib/learning-study.js";
import { checkResponse } from "../src/lib/learning-check.js";

// 791381s Phase 8B-1 (docs/enterprise-791381s-enrichment-plan.md §11.3) — the SERVER judge of a learning-book NETWORK LAB
// (`simulation` / `network-lab` v1 on networkTopology@2), through the real evaluator and the real practice route
// POST /api/learning-study/{course}/attempt:
//   • the state is re-derived by REPLAYING the learner's actions — a forged `state` with no action never passes;
//   • right only when EVERY check passes (all-or-nothing); `parts` = per check, booleans only — never expected / actual values;
//   • a broken topology or key is `unavailable`: 503 retryable, nothing written — never a "wrong" (grading safety);
//   • an oversized answer → 413; a study lab completes once (idempotent); a `study: false` lab is judged, never recorded;
//   • a teacher is judged, never persisted; nothing is ever written outside the learner's study document.

const host = (id, address) => ({ id, kind: "pc", label: id.toUpperCase(), x: 0.3, y: 0.8, initial: { v: 2, device: "host", adapters: { eth0: { mode: "static", address, mask: "255.255.255.0", gateway: "" } } } });
const TOPOLOGY = {
  v: 2,
  devices: [{ id: "sw1", kind: "switch", label: "SW1", x: 0.5, y: 0.2 }, host("pc1", "192.168.10.11"), host("pc2", "192.168.10.12")],
  links: [{ id: "a", a: { deviceId: "sw1", port: "f0/1" }, b: { deviceId: "pc1", port: "eth0" } }, { id: "b", a: { deviceId: "sw1", port: "f0/2" }, b: { deviceId: "pc2", port: "eth0" } }],
};
const CHECKS = [
  { id: "g1", label: "VLAN 10 موجودة على SW1", weight: 1, kind: "switch.vlanExists", deviceId: "sw1", vlan: 10 },
  { id: "g2", label: "المنفذ Fa0/1 في VLAN 10", weight: 1, kind: "switch.accessVlan", deviceId: "sw1", interface: "f0/1", value: 10 },
];
const KEY = { kind: "network-lab", topology: TOPOLOGY, checks: CHECKS };
const sw = lines => lines.map(command => ({ type: "switch.command", deviceId: "sw1", command }));
const HALF = sw(["enable", "configure terminal", "vlan 10", "end"]);
const FULL = sw(["enable", "configure terminal", "vlan 10", "exit", "interface f0/1", "switchport mode access", "switchport access vlan 10", "end"]);
const lab = actions => ({ kind: "network-lab", actions });

describe("evaluateNetworkLab — the simulator judges, the learner's actions only", () => {
  it("all-or-nothing with a per-check verdict: nothing → both false; half → g1 only; full → right", () => {
    expect(evaluateNetworkLab(KEY, lab([]))).toEqual({ status: "judged", correct: false, parts: { g1: false, g2: false } });
    expect(evaluateNetworkLab(KEY, lab(HALF))).toEqual({ status: "judged", correct: false, parts: { g1: true, g2: false } });
    expect(evaluateNetworkLab(KEY, lab(FULL))).toEqual({ status: "judged", correct: true, parts: { g1: true, g2: true } });
  });

  it("a forged state, score or checks in the response are never read: no action ⇒ never right", () => {
    const forged = { kind: "network-lab", actions: [], state: { devices: { sw1: { vlans: { 10: {} } } } }, correct: true, score: 1, parts: { g1: true, g2: true }, checks: [] };
    expect(evaluateNetworkLab(KEY, forged)).toEqual({ status: "judged", correct: false, parts: { g1: false, g2: false } });
    expect(evaluateStudyResponse(KEY, forged)).toBe(false);
  });

  it("the response's state is never even read: a junk or over-deep state cannot change the verdict of a right action list", () => {
    let deep = {};
    for (let i = 0; i < 20; i++) deep = { d: deep };
    for (const state of [deep, "x".repeat(300000), [1, 2, 3], { __proto__: { x: 1 } }]) {
      expect(evaluateNetworkLab(KEY, { kind: "network-lab", actions: FULL, state })).toEqual({ status: "judged", correct: true, parts: { g1: true, g2: true } });
    }
  });

  it("malformed responses are judged wrong with no parts; invalid actions replay nothing", () => {
    for (const bad of [null, {}, "x", { kind: "smartSim", actions: FULL }, { kind: "network-lab" }, { kind: "network-lab", actions: "enable" }]) {
      expect(evaluateNetworkLab(KEY, bad), JSON.stringify(bad)).toEqual({ status: "judged", correct: false, parts: {} });
    }
    expect(evaluateNetworkLab(KEY, lab([{ type: "nope" }]))).toEqual({ status: "judged", correct: false, parts: {} });
    expect(evaluateNetworkLab(KEY, lab([...FULL, { type: "camera.pan" }])).correct).toBe(false);
  });

  it("a broken topology or key is UNAVAILABLE (fail closed — never judged wrong)", () => {
    expect(evaluateNetworkLab({ ...KEY, topology: { v: 3, devices: [], links: [] } }, lab(FULL))).toEqual({ status: "unavailable" });
    expect(evaluateNetworkLab({ ...KEY, checks: [{ ...CHECKS[0], kind: "no.such.check" }] }, lab(FULL))).toEqual({ status: "unavailable" });
    expect(evaluateNetworkLab({ ...KEY, checks: [{ ...CHECKS[0], deviceId: "ghost" }] }, lab(FULL))).toEqual({ status: "unavailable" });
    expect(evaluateNetworkLab({ ...KEY, checks: [] }, lab(FULL))).toEqual({ status: "unavailable" });
    expect(evaluateNetworkLab(null, lab(FULL))).toEqual({ status: "unavailable" });
    expect(evaluateStudyResponse({ ...KEY, checks: [] }, lab(FULL))).toBe(false);
  });

  it("checkResponse: parts are booleans only (no expected / actual value leaks); feedback by verdict; never a reveal; unavailable passes through", () => {
    const act = { key: KEY, feedback: { correct: "أحسنت", incorrect: "راجع الإعداد", hints: ["ابدأ بـ vlan 10"], explanation: "الشرح" }, reveal: true };
    const wrong = checkResponse(act, lab(HALF));
    expect(wrong).toEqual({ correct: false, feedback: { message: "راجع الإعداد", hints: ["ابدأ بـ vlan 10"] }, parts: { g1: true, g2: false } });
    expect(Object.values(wrong.parts).every(v => typeof v === "boolean")).toBe(true);
    expect(JSON.stringify(wrong)).not.toMatch(/switch\.|accessVlan|"10"|"1"|expected|actual|evidence/);
    expect(checkResponse(act, lab(FULL))).toEqual({ correct: true, feedback: { message: "أحسنت", explanation: "الشرح" }, parts: { g1: true, g2: true } });
    expect(checkResponse({ ...act, key: { ...KEY, checks: [] } }, lab(FULL))).toEqual({ unavailable: true });
  });
});

// ── the practice route ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const CID = "791381s", MID = "791381s-m19", PAGE = "791381s-m19-l99-p01";
const USR = id => "platform/users/" + id + ".json", CLS = id => "platform/classes/" + id + ".json";
const student = (id, classId) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId, displayName: "علي", code: "S1" });
const room = (id, visible) => ({ classId: id, name: "صف " + id, active: true, status: "active", studentIds: [], learningMaterials: [{ courseId: CID, visibleModuleIds: visible }] });
const BUILDER_NO = { requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } }) };
const BUILDER_OK = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
/** In-memory indexes: lab `L1` is a study activity, lab `L2` a checked-only (`study: false`) one, `L3` has a broken key. */
function indexes() {
  const feedback = { correct: "أحسنت", incorrect: "راجع الإعداد", hints: ["ابدأ بـ vlan 10"] };
  const checks = { schemaVersion: 1, courseId: CID, pages: { [PAGE]: { moduleId: MID, activities: {
    L1: { key: KEY, study: true, feedback }, L2: { key: KEY, study: false, feedback }, L3: { key: { ...KEY, checks: [{ ...CHECKS[0], kind: "no.such.check" }] }, study: true, feedback },
  } } } };
  const study = { schemaVersion: 1, courseId: CID, pages: { [PAGE]: { moduleId: MID, activities: { L1: KEY, L3: checks.pages[PAGE].activities.L3.key } } } };
  return { loadCheckIndex: id => (id === CID ? checks : null), loadStudyIndex: id => (id === CID ? study : null) };
}
const seed = (visible = [MID]) => createMemoryContainer({ [USR("u1")]: student("u1", "cA"), [CLS("cA")]: room("cA", visible) });
const studentDeps = ctx => ({ ...BUILDER_NO, ...indexes(), requireStudentAuth: () => ({ ok: true, user: { sub: "u1", sv: 1, role: "student", classId: "STALE" } }), container: ctx.container, getContainer: () => ctx.container });
const teacherDeps = ctx => ({ ...BUILDER_OK, ...indexes(), container: ctx.container, getContainer: () => ctx.container });
const attempt = (deps, activityId, response) => handler({ method: "POST", url: "https://x/api/learning-study", headers: { get: () => null }, params: { courseId: CID, action: "attempt" }, json: async () => ({ pageId: PAGE, activityId, response }) }, deps);
const written = ctx => ctx.names("platform/").filter(n => !n.startsWith("platform/users/") && !n.startsWith("platform/classes/"));

describe("POST /api/learning-study/{course}/attempt — network labs", () => {
  it("wrong: per-check booleans + the wrong message and hints, nothing written; right: completed once, a repeat is read-only", async () => {
    const ctx = seed();
    const w = await attempt(studentDeps(ctx), "L1", lab(HALF));
    expect(w.status).toBe(200);
    expect(w.jsonBody).toMatchObject({ ok: true, correct: false, persisted: false, gained: 0, study: true, parts: { g1: true, g2: false }, feedback: { message: "راجع الإعداد", hints: ["ابدأ بـ vlan 10"] } });
    expect(w.jsonBody.reveal).toBeUndefined();
    expect(JSON.stringify(w.jsonBody)).not.toMatch(/switch\.vlanExists|accessVlan|"value"|expected|actual/);
    expect(written(ctx)).toEqual([]);
    const r = await attempt(studentDeps(ctx), "L1", lab(FULL));
    expect(r.jsonBody).toMatchObject({ correct: true, persisted: true, alreadyCompleted: false, parts: { g1: true, g2: true } });
    expect(r.jsonBody.gained).toBeGreaterThan(0);
    const again = await attempt(studentDeps(ctx), "L1", lab(FULL));
    expect(again.jsonBody).toMatchObject({ correct: true, persisted: false, alreadyCompleted: true, gained: 0 });
    expect(written(ctx)).toEqual([studyDocName("u1")]);
    expect(Object.keys(ctx.getJson(studyDocName("u1")).pages[PAGE].completed)).toEqual(["L1"]);
  });

  it("a forged «everything passes» state with no action is wrong and records nothing", async () => {
    const ctx = seed();
    const r = await attempt(studentDeps(ctx), "L1", { kind: "network-lab", actions: [], state: { solved: true }, correct: true });
    expect(r.jsonBody).toMatchObject({ correct: false, persisted: false, gained: 0 });
    expect(written(ctx)).toEqual([]);
  });

  it("a checked-only lab (study: false) is judged and never recorded", async () => {
    const ctx = seed();
    const r = await attempt(studentDeps(ctx), "L2", lab(FULL));
    expect(r.jsonBody).toMatchObject({ correct: true, persisted: false, gained: 0, study: false, parts: { g1: true, g2: true } });
    expect(written(ctx)).toEqual([]);
  });

  it("a lab whose key the simulator rejects → 503 retryable, NOTHING written, never a wrong verdict", async () => {
    const ctx = seed();
    for (const actions of [FULL, []]) {
      const r = await attempt(studentDeps(ctx), "L3", lab(actions));
      expect(r.status).toBe(503);
      expect(r.jsonBody).toMatchObject({ ok: false, retryable: true });
      expect("correct" in r.jsonBody).toBe(false);
    }
    expect(written(ctx)).toEqual([]);
  });

  it("an answer over 256 KB → 413 before any judging; nothing written", async () => {
    const ctx = seed();
    const huge = lab([{ type: "switch.command", deviceId: "sw1", command: "x".repeat(262144) }]);
    const r = await attempt(studentDeps(ctx), "L1", huge);
    expect(r.status).toBe(413);
    expect(written(ctx)).toEqual([]);
  });

  it("the gate: the lab's module unpublished → 403; a teacher is judged and never persisted", async () => {
    const closed = seed([]);
    expect((await attempt(studentDeps(closed), "L1", lab(FULL))).status).toBe(403);
    const ctx = seed();
    const t = await attempt(teacherDeps(ctx), "L1", lab(FULL));
    expect(t.jsonBody).toMatchObject({ actor: "teacher", correct: true, persisted: false, gained: 0 });
    expect(written(ctx)).toEqual([]);
  });
});
