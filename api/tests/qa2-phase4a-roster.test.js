import { describe, it, expect, beforeAll } from "vitest";
import { createRequire } from "node:module";

// QA round 2 (main 36dc60e9), phase 4a — roster data.
//
// QA2-18  a bulk-import row refused for its own reason (no family name) claimed its identity, so the VALID row with the same identity
//         was reported «مكرر داخل الملف» and nobody was created (QA-4 gap).
// QA2-19  a name made only of other invisible characters (Hangul fillers, Braille blank, soft hyphen, CGJ) was accepted (QA-20 gap).
// QA2-24  (owner decision) an OLDER attempt still awaiting manual marks did not block moving the student, so the unfinished marking
//         left the class gradebook; only the latest attempt was read.
//
// Real handlers on the in-memory container.

const require_ = createRequire(import.meta.url);
const { createMemoryContainer } = require_("./fixtures/memory-container.js");
const { handler: students } = require_("../src/functions/manage-students.js");
const { handler: classrooms } = require_("../src/functions/manage-classrooms.js");
const { cleanText } = require_("../src/lib/roster-input.js");

beforeAll(() => { process.env.STUDENT_SESSION_SECRET = process.env.STUDENT_SESSION_SECRET || "qa2-phase4a-session-secret-0123456789"; });
const AUTH = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), recordAuditEvent: async () => {} };
const call = (ctx, body) => students({ method: "POST", url: "https://x/api/students", json: async () => body }, { ...AUTH, container: ctx.container, getContainer: () => ctx.container });
const IMPORT_ID = "abcdef0123456789abcd";
const withClass = () => { const ctx = createMemoryContainer(); ctx.setJson("platform/classes/c1.json", { classId: "c1", name: "صف", active: true, studentIds: [] }); return ctx; };

describe("QA2-18 only an imported row claims its identity in the batch", () => {
  it("row 1 invalid (no family name), row 2 valid with the same identity: row 2 is created, row 1 reported", async () => {
    const ctx = withClass();
    const r = await call(ctx, { action: "bulkImport", classId: "c1", students: [{ firstName: "علي", familyName: "", identityNumber: "111222333" }, { firstName: "علي", familyName: "حسن", identityNumber: "111222333" }], importId: IMPORT_ID });
    expect(r.status).toBe(200);
    expect({ imported: r.jsonBody.imported, users: ctx.names("platform/users/").length, errors: r.jsonBody.errors.length }).toEqual({ imported: 1, users: 1, errors: 1 });
  });
  it("unchanged (QA-4): two VALID rows with the same identity — the second is the in-file duplicate", async () => {
    const ctx = withClass();
    const r = await call(ctx, { action: "bulkImport", classId: "c1", students: [{ firstName: "علي", familyName: "حسن", identityNumber: "111222333" }, { firstName: "سارة", familyName: "خالد", identityNumber: "111222333" }], importId: IMPORT_ID });
    expect({ imported: r.jsonBody.imported, duplicates: r.jsonBody.duplicates, users: ctx.names("platform/users/").length }).toEqual({ imported: 1, duplicates: 1, users: 1 });
  });
});

describe("QA2-19 a name nobody can see is refused like a blank one", () => {
  for (const [label, name] of [["HANGUL FILLER U+3164", "ㅤ"], ["BRAILLE BLANK U+2800", "⠀"], ["SOFT HYPHEN U+00AD", "­"], ["COMBINING GRAPHEME JOINER U+034F", "͏"], ["HANGUL CHOSEONG FILLER U+115F", "ᅟ"], ["HALFWIDTH HANGUL FILLER U+FFA0", "ﾠ"]]) {
    it("a first name made only of " + label + " → 400", async () => {
      const ctx = withClass();
      expect((await call(ctx, { action: "create", classId: "c1", firstName: name + " " + name, familyName: "حسن", identityNumber: "333444555" })).status).toBe(400);
    });
  }
  it("unchanged: ZWNJ inside a real word is kept; a soft hyphen inside a word is removed; real names pass", () => {
    expect(cleanText("می‌خواهم")).toBe("می‌خواهم");
    expect(cleanText("عل­ي")).toBe("علي");
    expect(cleanText("  علي  حسن ")).toBe("علي حسن");
  });
});

describe("QA2-24 an older attempt still awaiting the teacher blocks a roster removal", () => {
  const user = id => ({ userId: id, role: "student", active: true, archived: false, classId: "c1", displayName: "طالب " + id, firstName: "طالب", familyName: id, code: "C" + id, authVersion: 1 });
  const seed = attempts => createMemoryContainer({
    "platform/classes/c1.json": { classId: "c1", name: "صف 1", active: true, status: "active" },
    "platform/classes/c2.json": { classId: "c2", name: "صف 2", active: true, status: "active" },
    "platform/users/s1.json": user("s1"),
    "platform/assignments/a1.json": { assignmentId: "a1", classId: "c1", status: "published", title: "واجب", maxAttempts: 2, attemptModelVersion: 2, examSnapshot: { questions: [] } },
    "platform/submissions/a1/s1.json": { assignmentId: "a1", studentId: "s1", classId: "c1", attempts }
  });
  const pendingOld = { attemptNumber: 1, score: 2, totalMarks: 10, percentage: 20, manualReviewMarks: 6, finalized: false, submittedAt: "2026-10-01T08:00:00.000Z" };
  const final2 = { attemptNumber: 2, score: 9, totalMarks: 10, percentage: 90, manualReviewMarks: 0, finalized: true, submittedAt: "2026-10-02T08:00:00.000Z" };
  const final1 = { ...pendingOld, manualReviewMarks: 0, finalized: true };
  const move = ctx => call(ctx, { action: "bulkAction", operation: "move", userIds: ["s1"], targetClassId: "c2" });

  it("attempt 1 awaits manual marks, attempt 2 is final: the move is refused (PENDING_GRADING) and the student stays in c1", async () => {
    const ctx = seed([pendingOld, final2]);
    const r = await move(ctx);
    expect(JSON.stringify(r.jsonBody)).toContain("PENDING_GRADING");
    expect(ctx.getJson("platform/users/s1.json").classId).toBe("c1");
  });
  it("the class archive is refused for the same reason", async () => {
    const ctx = seed([pendingOld, final2]);
    const r = await classrooms({ method: "POST", url: "https://x/api/classrooms", json: async () => ({ action: "archive", classId: "c1" }) }, { ...AUTH, container: ctx.container, getContainer: () => ctx.container });
    expect({ status: r.status, code: r.jsonBody.code }).toEqual({ status: 409, code: "PENDING_GRADING" });
  });
  it("unchanged: every attempt final → the move goes through", async () => {
    const ctx = seed([final1, final2]);
    await move(ctx);
    expect(ctx.getJson("platform/users/s1.json").classId).toBe("c2");
  });
});
