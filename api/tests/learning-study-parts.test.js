import { describe, it, expect } from "vitest";
import { handler } from "../src/functions/learning-study.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Defect found in 791381s Phase 8B-1: the practice route answered a STRUCTURED exercise (wordBank / matching / classify /
// ordering) without the per-part verdict the server computes (`parts`, learning-check.js checkResponse). On a served page the
// Reader takes the per-part marks from that reply (PracticeBlockView: `reply.parts`), so a wrong answer showed no ✓ / ✕ per
// blank, row or item and no «الصحيح: …» beside the wrong parts. Pinned through the real handler on the real 791381s data.

const CID = "791381s", MID = "791381s-m01", PAGE = "791381s-m01-l02-p01", Q = "m01-l02-p01-q11";   // wordBank b1..b4, reveal
const USR = id => "platform/users/" + id + ".json", CLS = id => "platform/classes/" + id + ".json";
const student = (id, classId) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId, displayName: "علي", code: "S1" });
const room = id => ({ classId: id, name: "صف " + id, active: true, status: "active", studentIds: [], learningMaterials: [{ courseId: CID, visibleModuleIds: [MID] }] });
const BUILDER_NO = { requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } }) };
const deps = ctx => ({ ...BUILDER_NO, requireStudentAuth: () => ({ ok: true, user: { sub: "u1", sv: 1, role: "student", classId: "cA" } }), container: ctx.container, getContainer: () => ctx.container });
const attempt = (ctx, response) => handler({ method: "POST", url: "https://x/api/learning-study", headers: { get: () => null }, params: { courseId: CID, action: "attempt" }, json: async () => ({ pageId: PAGE, activityId: Q, response }) }, deps(ctx));

describe("the practice route returns the per-part verdict of a structured answer", () => {
  it("a wrong wordBank answer: `parts` says which blanks are right / wrong (booleans only), with the reveal", async () => {
    const ctx = createMemoryContainer({ [USR("u1")]: student("u1", "cA"), [CLS("cA")]: room("cA") });
    const r = await attempt(ctx, { kind: "wordBank", choices: { b1: "الحجم", b2: "PAN", b3: "المسافة", b4: "WAN" } });
    expect(r.status).toBe(200);
    expect(r.jsonBody.correct).toBe(false);
    expect(r.jsonBody.parts).toEqual({ b1: true, b2: false, b3: false, b4: true });
    expect(r.jsonBody.reveal).toEqual({ kind: "wordBank", answers: { b1: "الحجم", b2: "المسافة", b3: "PAN", b4: "WAN" } });
  });
  it("a right answer carries every part right", async () => {
    const ctx = createMemoryContainer({ [USR("u1")]: student("u1", "cA"), [CLS("cA")]: room("cA") });
    const r = await attempt(ctx, { kind: "wordBank", choices: { b1: "الحجم", b2: "المسافة", b3: "PAN", b4: "WAN" } });
    expect(r.jsonBody).toMatchObject({ correct: true, parts: { b1: true, b2: true, b3: true, b4: true } });
  });
});
