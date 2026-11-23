import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Teacher C# lab, phase V1 (docs/enterprise-csharp-visual-lab-plan.md) — GET /api/teacher-tools/csharp-lab?courseId=…: the book's own
// classes for the teacher's in-browser lab, through the REAL handler, the in-memory container and the real course-access helpers.
//   • WHO: a teacher session only — a student (or no) session is refused before anything is read;
//   • WHICH course: a known, published course in the teacher's entitlement; archived → 403, unknown → 404, malformed id → 400;
//   • WHAT: exactly the book's classes (the same file the Runner appends), "" for a course without classes; never cached;
//   • NOTHING stored, whatever the outcome.
const cjs = createRequire(import.meta.url);
const { handler } = cjs("../src/functions/teacher-csharp-lab.js");
const { libraryClasses } = cjs("../src/lib/course-library.js");

const BOOK = "899271d";
const BOOK_FILE = readFileSync(join(__dirname, "..", "src", "data", "course-libraries", "899271d.cs"), "utf8");
const TEACHER = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
const NOBODY = { requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false, code: "UNAUTHORIZED" } } }) };
const deps = (ctx, auth = TEACHER, extra = {}) => ({ ...auth, container: ctx.container, getContainer: () => ctx.container, env: {}, ...extra });
const req = query => ({ method: "GET", url: "https://x/api/teacher-tools/csharp-lab?" + new URLSearchParams(query), params: {}, query: new URLSearchParams(query), headers: new Headers() });
const stored = ctx => JSON.stringify(ctx.names("").sort().map(n => [n, ctx.getJson(n)]));

describe("Teacher C# lab — the book's classes for the teacher's browser", () => {
  it("a teacher gets exactly the book's classes, in file order, never cached; nothing is stored", async () => {
    const ctx = createMemoryContainer({});
    const before = stored(ctx);
    const r = await handler(req({ courseId: BOOK }), deps(ctx));
    expect(r.status).toBe(200);
    expect(r.headers["Cache-Control"]).toBe("no-store");
    expect(r.jsonBody.ok).toBe(true);
    expect(r.jsonBody.courseId).toBe(BOOK);
    const lib = r.jsonBody.library;
    expect(lib).toBe(libraryClasses(BOOK).map(c => c.code).join("\n\n"));
    for (const name of ["public class Node\n", "public class Node<T>", "public class BinNode<T>", "public class Stack<T>", "public class Queue<T>"]) expect(lib).toContain(name);
    for (const c of libraryClasses(BOOK)) expect(BOOK_FILE).toContain(c.code);      // byte-for-byte from the drift-guarded book file
    expect(stored(ctx)).toBe(before);
  });

  it("a published course without book classes → an empty library (the lab compiles the program alone)", async () => {
    const ctx = createMemoryContainer({});
    const r = await handler(req({ courseId: "899371" }), deps(ctx));
    expect(r.status).toBe(200);
    expect(r.jsonBody).toEqual({ ok: true, courseId: "899371", library: "" });
  });

  it("no teacher session (a student token, or none) → refused before anything is read", async () => {
    const ctx = createMemoryContainer({});
    let reads = 0;
    const r = await handler(req({ courseId: BOOK }), deps(ctx, NOBODY, { downloadJsonOrNull: async () => { reads++; return null; } }));
    expect(r.status).toBe(401);
    expect(reads).toBe(0);
    expect(JSON.stringify(r.jsonBody)).not.toContain("class Stack");
  });

  it("an archived course is refused (403), an unknown course 404, a malformed id 400 — never the classes", async () => {
    const archived = createMemoryContainer({ ["platform/catalog/courses/" + BOOK + ".json"]: { schemaVersion: 1, courseId: BOOK, status: "archived" } });
    const a = await handler(req({ courseId: BOOK }), deps(archived));
    expect(a.status).toBe(403);
    expect(a.jsonBody.code).toBe("COURSE_NOT_AVAILABLE");
    const ctx = createMemoryContainer({});
    const u = await handler(req({ courseId: "000000" }), deps(ctx));
    expect(u.status).toBe(404);
    for (const bad of [{}, { courseId: "" }, { courseId: "../899271d" }, { courseId: "a".repeat(65) }]) {
      const r = await handler(req(bad), deps(ctx));
      expect(r.status, JSON.stringify(bad)).toBe(400);
      expect(JSON.stringify(r.jsonBody)).not.toContain("class Stack");
    }
  });

  it("a storage failure while deciding the course fails closed (503), never the classes", async () => {
    const ctx = createMemoryContainer({});
    const r = await handler(req({ courseId: BOOK }), deps(ctx, TEACHER, { downloadJsonOrNull: async () => { throw new Error("storage down"); } }));
    expect(r.status).toBe(503);
    expect(JSON.stringify(r.jsonBody)).not.toContain("class Stack");
  });
});
