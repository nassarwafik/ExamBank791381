import { describe, it, expect } from "vitest";
import { handler as manage } from "../src/functions/manage-assignments.js";
import { handler as dashboard } from "../src/functions/student-dashboard.js";
import { handler as today } from "../src/functions/teacher-today.js";
import { indexName } from "../src/lib/class-assignment-index.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Phase 12E-B review blocker — MIXED-VERSION DEPLOYMENT.
//
// A pre-12E-B API instance that is still alive while (or after) the 12E-B code is deployed publishes assignments
// WITHOUT maintaining the class index. The "legacy writer" below is the REAL manage-assignments handler with its two
// index seams disabled — exactly the storage behaviour of the pre-12E-B writer (same documents, same CAS, same lock,
// same notification), minus the pointer maintenance.

const AP = "platform/assignments/";
const EXAM = { title: "امتحان", sections: [{ id: "s1", gradingPolicy: "all", questions: [{ marks: 10 }] }] };
const OBS = { logInfo: () => {}, logWarn: () => {}, logError: () => {} };
const NOW = Date.parse("2026-03-01T10:00:00.000Z");

function world() {
  const hooks = {};
  const ctx = createMemoryContainer({
    "platform/classes/c1.json": { classId: "c1", name: "الصف الأول", status: "active", active: true },
    "platform/users/u1.json": { userId: "u1", role: "student", classId: "c1", active: true, archived: false, authVersion: 1, code: "S1", displayName: "علي" },
    [AP + "a0.json"]: { schemaVersion: 2, attemptModelVersion: 2, attemptPolicy: "continuous", assignmentId: "a0", classId: "c1", className: "الصف الأول", title: "قديم", instructions: "", status: "published", openAt: "", dueAt: "", maxAttempts: 1, durationMinutes: 0, questionCount: 1, totalMarks: 10, examSnapshot: EXAM, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }
  }, hooks);
  return { ctx, hooks };
}
const teacherDeps = w => ({ requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), getContainer: () => w.ctx.container, container: w.ctx.container, recordAuditEvent: async () => {} });
/** The pre-12E-B writer: the real handler, index seams disabled. */
const legacyDeps = w => ({ ...teacherDeps(w), ensurePublishedAssignmentIndexed: async () => {}, removePublishedAssignmentFromIndex: async () => ({ removed: false, failed: false }) });
const legacyPost = (w, body) => manage({ method: "POST", url: "https://x/api/assignments", json: async () => body }, legacyDeps(w), OBS);
const newPost = (w, body) => manage({ method: "POST", url: "https://x/api/assignments", json: async () => body }, teacherDeps(w), OBS);
const studentIds = async w => {
  const r = await dashboard({ method: "GET", url: "http://x/api/student-dashboard", headers: { get: () => null } },
    { container: w.ctx.container, requireStudentAuth: () => ({ ok: true, user: { sub: "u1", sv: 1 } }), recordGlobalRankMilestone: async () => {}, aggregateRecognition: async () => new Map() }, OBS);
  expect(r.status).toBe(200);
  return r.jsonBody.assignments.map(a => a.assignmentId).sort();
};
const teacherPublished = async w => {
  const r = await today({ method: "GET", url: "http://x/api/teacher-today", headers: { get: () => null } },
    { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), container: w.ctx.container, nowMs: NOW, teacherDirectUnread: async () => ({ totalUnread: 0, capped: false }), loadProjectEvaluationSources: async () => [] }, OBS);
  expect(r.status).toBe(200);
  return r.jsonBody.scope.publishedAssignments;
};

describe("A — deployment window: a legacy (pre-index) publish after a 12E-B reader touched the class", () => {
  it("student dashboard: a new reader serves c1, a legacy writer CREATES a published assignment, the next reader still shows it", async () => {
    const w = world();
    expect(await studentIds(w)).toEqual(["a0"]);                        // 12E-B reader touches c1 (first request)
    const r = await legacyPost(w, { action: "create", classId: "c1", title: "جديد", examSnapshot: EXAM, publish: true });
    expect(r.status).toBe(200);
    const x = r.jsonBody.assignment.assignmentId;
    expect(w.ctx.getJson(AP + x + ".json").status).toBe("published");  // the legacy publish SUCCEEDED
    expect(await studentIds(w)).toEqual(["a0", x].sort());              // …so it must be visible
  });

  it("student dashboard: a legacy writer PUBLISHES an existing draft (setstatus) after the reader touched the class", async () => {
    const w = world();
    const d = await newPost(w, { action: "create", classId: "c1", title: "مسودة", examSnapshot: EXAM, publish: false });
    const x = d.jsonBody.assignment.assignmentId;
    expect(await studentIds(w)).toEqual(["a0"]);
    expect((await legacyPost(w, { action: "setstatus", assignmentId: x, status: "published" })).status).toBe(200);
    expect(await studentIds(w)).toEqual(["a0", x].sort());
  });

  it("teacher today: the same legacy publish is counted by the next request", async () => {
    const w = world();
    expect(await teacherPublished(w)).toBe(1);
    expect((await legacyPost(w, { action: "create", classId: "c1", title: "جديد", examSnapshot: EXAM, publish: true })).status).toBe(200);
    expect(await teacherPublished(w)).toBe(2);
  });

  it("the class index a 12E-B reader may have written is never proof of completeness on its own", async () => {
    const w = world();
    await studentIds(w);
    const x = (await legacyPost(w, { action: "create", classId: "c1", title: "جديد", examSnapshot: EXAM, publish: true })).jsonBody.assignment.assignmentId;
    const stored = w.ctx.getJson(indexName("c1"));
    // whatever the index says, it does not contain the legacy publish — the readers above must not have trusted it
    expect((stored?.publishedAssignmentIds || []).includes(x)).toBe(false);
    expect(await studentIds(w)).toContain(x);
  });
});

// ── B · C — the authority contract that closes the window ─────────────────────────────────────────────────────────
// The index is trusted only when control.json is AUTHORITATIVE and the class index carries THAT epoch, stamped by a
// reconcile that read the control BEFORE its scan. Activation is the explicit operator assertion that no pre-index
// writer can publish any more; every activation mints a fresh epoch.
import { CONTROL_NAME, activateAssignmentIndex, deactivateAssignmentIndex, loadPublishedAssignmentsForClasses, readIndexControl } from "../src/lib/class-assignment-index.js";
import { handler as control } from "../src/functions/assignment-index-control.js";
import { listJson } from "../src/lib/platform-storage.js";

let epochSeq = 0;
const epochDeps = () => ({ newEpoch: () => "E" + (++epochSeq) });
const activate = w => activateAssignmentIndex(w.ctx.container, epochDeps());
const load = (w, deps = {}) => loadPublishedAssignmentsForClasses(w.ctx.container, ["c1"], deps);
const loadIds = async (w, deps) => { const r = await load(w, deps); return { ids: r.byClass.get("c1").map(a => a.assignmentId).sort(), stats: r.stats }; };
const legacyCreate = async (w, title = "جديد") => { const r = await legacyPost(w, { action: "create", classId: "c1", title, examSnapshot: EXAM, publish: true }); expect(r.status).toBe(200); return r.jsonBody.assignment.assignmentId; };
const newCreate = async (w, title = "جديد") => { const r = await newPost(w, { action: "create", classId: "c1", title, examSnapshot: EXAM, publish: true }); expect(r.status).toBe(200); return r.jsonBody.assignment.assignmentId; };

describe("B — migration lifecycle: migrating → activation → reconcile → steady state", () => {
  it("full lifecycle: legacy publishes during migration are visible, the first request after activation reconciles them, then no scan", async () => {
    const w = world();
    // an index a 12E-B build wrote BEFORE this contract (ready, no epoch) and that MISSES a legacy publish
    w.ctx.setJson(indexName("c1"), { schemaVersion: 1, classId: "c1", ready: true, publishedAssignmentIds: ["a0"], updatedAt: "2026-01-01T00:00:00.000Z" });
    const x1 = await legacyCreate(w, "قديم ١");
    let r = await loadIds(w);
    expect(r.ids).toEqual(["a0", x1].sort());
    expect(r.stats).toMatchObject({ authoritative: 0, globalScans: 1, indexReads: 0, bootstrapped: 0 });
    const x2 = await legacyCreate(w, "قديم ٢");                                      // old instance still alive …
    expect((await loadIds(w)).ids).toEqual(["a0", x1, x2].sort());
    const e = (await activate(w)).epoch;                                            // … operator: all old instances are gone
    r = await loadIds(w);
    expect(r.ids).toEqual(["a0", x1, x2].sort());
    expect(r.stats).toMatchObject({ authoritative: 1, globalScans: 1, bootstrapped: 1 });   // one reconcile
    expect(w.ctx.getJson(indexName("c1"))).toMatchObject({ ready: true, epoch: e, publishedAssignmentIds: ["a0", x1, x2].sort() });
    const y = await newCreate(w, "بعد التفعيل");                                     // a 12E-B writer after activation
    r = await loadIds(w);
    expect(r.ids).toEqual(["a0", x1, x2, y].sort());
    expect(r.stats).toMatchObject({ authoritative: 1, globalScans: 0, bootstrapped: 0, indexReads: 1 });
    expect(await studentIds(w)).toEqual(["a0", x1, x2, y].sort());
    expect(await teacherPublished(w)).toBe(4);
  });

  it("(D · registration) after activation, a 12E-B publish is served from the TRUSTED index with no scan — only because the writer registered its pointer", async () => {
    const w = world();
    await activate(w);
    await loadIds(w);                                                               // reconcile → trusted
    const y = await newCreate(w);
    const r = await loadIds(w);
    expect(r.stats.globalScans).toBe(0);
    expect(r.ids).toContain(y);
    const d = (await newPost(w, { action: "create", classId: "c1", title: "مسودة", examSnapshot: EXAM, publish: false })).jsonBody.assignment.assignmentId;
    expect((await newPost(w, { action: "setstatus", assignmentId: d, status: "published" })).status).toBe(200);
    expect((await loadIds(w)).ids).toContain(d);
  });

  it("(D · trust gate) a ready index is NOT trusted while migrating, nor with a foreign / missing / previous epoch", async () => {
    for (const epoch of [undefined, "", "OTHER", "E-old"]) {
      const w = world();
      const x = await legacyCreate(w);
      w.ctx.setJson(indexName("c1"), { schemaVersion: 1, classId: "c1", ready: true, ...(epoch === undefined ? {} : { epoch }), publishedAssignmentIds: ["a0"], updatedAt: "2026-01-01T00:00:00.000Z" });
      expect((await loadIds(w)).ids).toEqual(["a0", x].sort());                    // migrating: never trusted
      await activate(w);
      expect((await loadIds(w)).ids).toEqual(["a0", x].sort());                    // authoritative: epoch mismatch → reconcile
    }
  });

  it("re-activation mints a new epoch: every class index is reconciled once more before it is trusted", async () => {
    const w = world();
    await activate(w);
    await loadIds(w);
    const e1 = w.ctx.getJson(indexName("c1")).epoch;
    const x = await legacyCreate(w);                                                // an old writer resurfaced (e.g. a stale environment) …
    await deactivateAssignmentIndex(w.ctx.container);                               // … operator falls back to migrating
    expect((await loadIds(w)).ids).toContain(x);
    const e2 = (await activate(w)).epoch;                                           // … and re-activates once it is gone
    expect(e2).not.toBe(e1);
    const r = await loadIds(w);
    expect(r.ids).toContain(x);
    expect(r.stats).toMatchObject({ globalScans: 1, bootstrapped: 1 });
    expect(w.ctx.getJson(indexName("c1")).epoch).toBe(e2);
  });
});

describe("C — races, crashes, malformed metadata, CAS exhaustion", () => {
  it("(D · scan-before-authority) a legacy publish between a reconcile's scan and a (re-)activation is NOT hidden: the stamp is the epoch read BEFORE the scan", async () => {
    const w = world();
    await activate(w);                                                              // E(n)
    let x = null, e2 = null;
    const racingList = async (c, prefix) => {
      const docs = await listJson(c, prefix);                                       // the reconcile's scan …
      x = await legacyCreate(w, "بين المسح والتفعيل");                              // … a legacy publish lands after it …
      e2 = (await activate(w)).epoch;                                               // … then the authority transition
      return docs;
    };
    const first = await loadIds(w, { listJson: racingList });
    expect(first.ids).toEqual(["a0"]);                                              // that one request may miss it
    expect(w.ctx.getJson(indexName("c1")).epoch).not.toBe(e2);                      // stamped with the PRE-scan epoch
    const next = await loadIds(w);
    expect(next.ids).toEqual(["a0", x].sort());                                     // never trusted under e2 → reconciled
    expect(next.stats.globalScans).toBe(1);
    expect(w.ctx.getJson(indexName("c1")).epoch).toBe(e2);
    expect((await loadIds(w)).stats.globalScans).toBe(0);
  });

  it("(D · union) a 12E-B publish racing the reconcile (after its scan, before its CAS) is kept by the union", async () => {
    const w = world();
    await activate(w);
    let y = null;
    const racingList = async (c, prefix) => { const docs = await listJson(c, prefix); y = await newCreate(w, "سباق"); return docs; };
    await loadIds(w, { listJson: racingList });
    const r = await loadIds(w);
    expect(r.stats.globalScans).toBe(0);
    expect(r.ids).toEqual(["a0", y].sort());
  });

  it("publish racing the activation: before or after the control write, the published assignment is served afterwards", async () => {
    for (const order of ["publish-then-activate", "activate-then-publish"]) {
      const w = world();
      let y;
      if (order === "publish-then-activate") { y = await newCreate(w); await activate(w); }
      else { await activate(w); y = await newCreate(w); }
      expect((await loadIds(w)).ids).toEqual(["a0", y].sort());
      expect((await loadIds(w)).ids).toEqual(["a0", y].sort());
    }
  });

  it("restart between steps: activated but never reconciled, or a reconcile that crashed before its CAS → the next request reconciles", async () => {
    const w = world();
    w.ctx.setJson(indexName("c1"), { schemaVersion: 1, classId: "c1", ready: true, publishedAssignmentIds: ["a0"], updatedAt: "2026-01-01T00:00:00.000Z" });   // pre-contract index
    const x = await legacyCreate(w);
    await activate(w);                                                              // (process dies here)
    w.hooks.beforeConditionalUpload = (blob, api) => { if (blob === indexName("c1")) api.setJson(blob, api.getJson(blob)); };   // reconcile CAS never lands
    const crashed = await loadIds(w);
    expect(crashed.ids).toEqual(["a0", x].sort());
    expect(crashed.stats).toMatchObject({ bootstrapped: 0, bootstrapFailures: 1 });
    w.hooks.beforeConditionalUpload = undefined;
    const next = await loadIds(w);
    expect(next.ids).toEqual(["a0", x].sort());
    expect(next.stats).toMatchObject({ globalScans: 1, bootstrapped: 1 });
    expect((await loadIds(w)).stats.globalScans).toBe(0);
  });

  it("malformed / missing / unreadable control metadata ⇒ MIGRATING (scan), never trust", async () => {
    const variants = [null, { hello: 1 }, [1], { schemaVersion: 1, state: "authoritative" }, { schemaVersion: 1, state: "authoritative", epoch: "../x" }, { schemaVersion: 2, state: "authoritative", epoch: "E1" }, { schemaVersion: 1, state: "migrating", epoch: "E1" }, "corrupt"];
    for (const v of variants) {
      const w = world();
      w.ctx.setJson(indexName("c1"), { schemaVersion: 1, classId: "c1", ready: true, epoch: "E1", publishedAssignmentIds: ["a0"], updatedAt: "2026-01-01T00:00:00.000Z" });
      if (v === "corrupt") w.ctx.store.set(CONTROL_NAME, { content: Buffer.from("{ nope"), etag: "e-bad", contentType: "" });
      else if (v !== null) w.ctx.setJson(CONTROL_NAME, v);
      const x = await legacyCreate(w);
      expect(await readIndexControl(w.ctx.container)).toEqual({ authoritative: false, epoch: "" });
      const r = await loadIds(w);
      expect(r.ids).toEqual(["a0", x].sort());
      expect(r.stats).toMatchObject({ authoritative: 0, globalScans: 1, indexReads: 0 });
    }
  });

  it("activation CAS exhaustion: StorageConflictError, the control stays MIGRATING, readers keep scanning", async () => {
    const w = world();
    w.hooks.beforeConditionalUpload = (blob, api) => { if (blob === CONTROL_NAME) api.setJson(blob, api.getJson(blob)); };
    w.ctx.setJson(CONTROL_NAME, { schemaVersion: 1, state: "migrating", epoch: "", updatedAt: "2026-01-01T00:00:00.000Z" });
    await expect(activate(w)).rejects.toMatchObject({ name: "StorageConflictError" });
    expect(await readIndexControl(w.ctx.container)).toEqual({ authoritative: false, epoch: "" });
    const x = await legacyCreate(w);
    expect((await loadIds(w)).ids).toEqual(["a0", x].sort());
  });
});

describe("C — the activation endpoint (builder only, explicit confirmation, audited)", () => {
  const call = (w, method, body, auth = true, extra = {}) => control({ method, url: "https://x/api/assignment-index-control", json: async () => body },
    { requireBuilderAuth: () => (auth ? { ok: true, user: { sub: "teacher-1" } } : { ok: false, response: { status: 401, jsonBody: { ok: false } } }), getContainer: () => w.ctx.container, recordAuditEvent: async (_c, ev) => (w.audit = [...(w.audit || []), ev]), ...epochDeps(), ...extra }, OBS);

  it("GET reports migrating by default; activate needs the explicit confirmation; deactivate is always allowed", async () => {
    const w = world();
    expect((await call(w, "GET")).jsonBody).toEqual({ ok: true, state: "migrating" });
    expect((await call(w, "POST", { operation: "activate" })).status).toBe(400);
    expect((await call(w, "POST", { operation: "nope" })).status).toBe(400);
    expect(await readIndexControl(w.ctx.container)).toEqual({ authoritative: false, epoch: "" });
    const on = await call(w, "POST", { operation: "activate", confirm: "no-pre-index-writers" });
    expect(on.jsonBody).toEqual({ ok: true, state: "authoritative" });
    expect((await readIndexControl(w.ctx.container)).authoritative).toBe(true);
    expect((await call(w, "POST", { operation: "deactivate" })).jsonBody).toEqual({ ok: true, state: "migrating" });
    expect(w.audit.map(a => [a.action, a.details])).toEqual([["assignmentIndex.activate", { previousState: "migrating", state: "authoritative" }], ["assignmentIndex.deactivate", { previousState: "authoritative", state: "migrating" }]]);
    expect(JSON.stringify(on.jsonBody)).not.toContain("E");                          // the epoch is not exposed
  });

  it("unauthenticated requests are rejected before any storage access; a persistent CAS conflict answers 503", async () => {
    const w = world();
    expect((await call(w, "POST", { operation: "activate", confirm: "no-pre-index-writers" }, false)).status).toBe(401);
    expect(w.ctx.has(CONTROL_NAME)).toBe(false);
    w.ctx.setJson(CONTROL_NAME, { schemaVersion: 1, state: "migrating", epoch: "", updatedAt: "x" });
    w.hooks.beforeConditionalUpload = (blob, api) => { if (blob === CONTROL_NAME) api.setJson(blob, api.getJson(blob)); };
    expect((await call(w, "POST", { operation: "activate", confirm: "no-pre-index-writers" })).status).toBe(503);
    expect((await readIndexControl(w.ctx.container)).authoritative).toBe(false);
  });
});
