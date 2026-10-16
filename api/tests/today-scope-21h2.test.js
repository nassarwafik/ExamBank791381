import { describe, it, expect } from "vitest";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { school, assignment, NOW, SUB } from "./fixtures/analytics-school.js";
import { handler as todayHandler } from "../src/functions/teacher-today.js";

// Phase 21H.2 — the dashboard's ONE scope: ?classId= narrows GET /api/teacher-today to one of the teacher's OWN classes. It is
// applied after the tenancy filter, so it can only narrow: another teacher's class is «not found» (404), never its data.
const NOW_MS = Date.parse(NOW);
const req = q => ({ method: "GET", url: "https://x/api/teacher-today" + q, headers: { get: () => null } });
const single = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
const multi = sub => ({ requireBuilderAuth: () => ({ ok: true, user: { ver: 2, role: "teacher", sub, am: "multi-user" } }) });
const deps = (ctx, auth = single) => ({ ...auth, teacherDirectUnread: async () => ({ totalUnread: 0, capped: false }), container: ctx.container, nowMs: NOW_MS });
function seed() {
  const s = school();
  s["platform/assignments/P1.json"] = assignment("P1", "c1", "published", NOW, { dueAt: "2026-03-20T10:00:00.000Z" });
  s["platform/assignments/Q1.json"] = assignment("Q1", "c2", "published", NOW, { dueAt: "2026-03-20T10:00:00.000Z" });
  s[SUB + "Q1/s11.json"] = { assignmentId: "Q1", studentId: "s11", classId: "c2", attempts: [], activeAttempt: { attemptNumber: 1, startedAt: "2026-03-10T09:58:00.000Z", status: "started" } };
  return s;
}
const titles = body => JSON.stringify(body.attention);

describe("21H.2 teacher-today ?classId= — one scope, narrow only", () => {
  it("no classId → every class; classId=c1 → only c1's figures, and the response names its scope", async () => {
    const ctx = createMemoryContainer(seed());
    const all = (await todayHandler(req(""), deps(ctx))).jsonBody;
    expect(titles(all)).toContain("واجب Q1");
    expect(all.scopeClassId).toBeUndefined();
    const c1 = (await todayHandler(req("?classId=c1"), deps(ctx))).jsonBody;
    expect(c1.scopeClassId).toBe("c1");
    expect(titles(c1)).toContain("واجب P1");
    expect(titles(c1)).not.toContain("واجب Q1");
    expect(c1.attention.activeAttempts.count).toBe(0);
    expect(c1.scope.activeClasses).toBe(1);
  });

  it("an unknown class → 404 and no figures", async () => {
    const r = await todayHandler(req("?classId=nope"), deps(createMemoryContainer(seed())));
    expect(r.status).toBe(404);
    expect(r.jsonBody.attention).toBeUndefined();
  });

  it("multi-user: another teacher's class → 404 (the scope cannot widen past tenancy); the owner gets it", async () => {
    const s = seed();
    s["platform/classes/c1.json"].ownerId = "teacher-a";
    s["platform/classes/c2.json"].ownerId = "teacher-b";
    const ctx = createMemoryContainer(s);
    expect((await todayHandler(req("?classId=c2"), deps(ctx, multi("teacher-a")))).status).toBe(404);
    const own = await todayHandler(req("?classId=c2"), deps(ctx, multi("teacher-b")));
    expect(own.status).toBe(200);
    expect(titles(own.jsonBody)).toContain("واجب Q1");
  });
});
