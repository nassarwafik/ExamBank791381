import { describe, it, expect } from "vitest";
import { handler as classHandler } from "../src/functions/manage-classrooms.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Batch 4 (D3) — creating a class twice from one submission (a double click, a retry after a lost response) made two
// classes. A create request now carries the form's `requestKey`: the class id is derived from (teacher, key) and stored with
// a create-only write, so a repeat — sequential or concurrent — answers with the SAME class, writes nothing and audits
// nothing. Another teacher's identical key is a different class. Without a key (older clients) the old behaviour stays.
// Fail-first: run against 791f8118 (the key is ignored: every request creates a new class).
const deps = (ctx, sub = "teacher-a") => ({ requireBuilderAuth: () => ({ ok: true, user: { sub, am: "multi-user" } }), container: ctx.container });
const create = (ctx, body, sub) => classHandler({ method: "POST", url: "https://x/api/classrooms", json: async () => ({ action: "create", name: "العاشر 1", grade: "10", schoolYear: "2026-2027", ...body }) }, deps(ctx, sub));
const classes = ctx => ctx.names("platform/classes/");
const creates = ctx => ctx.names("platform/audit/").map(n => ctx.getJson(n)).filter(a => a.action === "class.create");
const KEY = "lq2x9a-k3j8f0zt";

describe("D3 — one submission creates one class", () => {
  it("a repeated request with the same key returns the same class and creates, writes and audits nothing more", async () => {
    const ctx = createMemoryContainer();
    const first = await create(ctx, { requestKey: KEY });
    expect(first.status).toBe(200);
    const id = first.jsonBody.classroom.classId;
    const stored = JSON.stringify(ctx.getJson("platform/classes/" + id + ".json"));
    const again = await create(ctx, { requestKey: KEY });
    expect(again.status).toBe(200);
    expect(again.jsonBody.classroom.classId).toBe(id);
    expect(again.jsonBody.duplicate).toBe(true);
    expect(classes(ctx)).toHaveLength(1);
    expect(JSON.stringify(ctx.getJson("platform/classes/" + id + ".json"))).toBe(stored);
    expect(creates(ctx)).toHaveLength(1);
  });

  it("two concurrent requests with the same key (a double click) create one class", async () => {
    const ctx = createMemoryContainer();
    const [a, b] = await Promise.all([create(ctx, { requestKey: KEY }), create(ctx, { requestKey: KEY })]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(a.jsonBody.classroom.classId).toBe(b.jsonBody.classroom.classId);
    expect(classes(ctx)).toHaveLength(1);
    expect(creates(ctx)).toHaveLength(1);
  });

  it("another teacher's identical key is another class (never the first teacher's)", async () => {
    const ctx = createMemoryContainer();
    const a = await create(ctx, { requestKey: KEY }, "teacher-a");
    const b = await create(ctx, { requestKey: KEY }, "teacher-b");
    expect(b.status).toBe(200);
    expect(b.jsonBody.classroom.classId).not.toBe(a.jsonBody.classroom.classId);
    expect(b.jsonBody.duplicate).toBeUndefined();
    expect(ctx.getJson("platform/classes/" + b.jsonBody.classroom.classId + ".json").ownerId).toBe("teacher-b");
    expect(classes(ctx)).toHaveLength(2);
  });

  it("a malformed key is refused (400) and nothing is stored", async () => {
    const ctx = createMemoryContainer();
    for (const requestKey of ["short", "../../users/x1", "a b c d e f g h", 12345678, { k: 1 }]) {
      const r = await create(ctx, { requestKey });
      expect(r.status, JSON.stringify(requestKey)).toBe(400);
    }
    expect(classes(ctx)).toEqual([]);
  });

  it("without a key (an older client) each request still creates its own class (pin)", async () => {
    const ctx = createMemoryContainer();
    const a = await create(ctx, {});
    const b = await create(ctx, {});
    expect(a.jsonBody.classroom.classId).not.toBe(b.jsonBody.classroom.classId);
    expect(classes(ctx)).toHaveLength(2);
  });
});
