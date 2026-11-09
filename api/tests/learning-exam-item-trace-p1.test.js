import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { handler } from "../src/functions/learning-exam-item.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { validateExamItem } from "../src/lib/learning-exam-items.js";

// 899371 P1 (docs/enterprise-899371-learning-plan.md §13) — the book's «تتبّع بجدول متابعة» questions are planned as learning exam
// items of type tableFill with a C# code stimulus (plan §3). This pins that the existing exam-item path carries them end to end,
// course-agnostic (proved here on a registered unit of 791381s; 899371 has no unit yet):
//   • the store accepts a tableFill question with a csharp codeStimulus;
//   • GET (the student projection) keeps the code EXACTLY and withholds every key and explanation;
//   • check grades with the official grader, cell by cell (partial credit), writes nothing, and explains only an answered question.
// The program is the book's own (ف4 بيتية س1, the P0 probe c04-h-q1, verified by execution: inputs 5, 2, 7 → output 7).

const CID = "791381s", MID = "791381s-m10";
const SOURCE = readFileSync(join(__dirname, "..", "..", "docs", "enterprise-899371-learning", "probes", "c04-h-q1", "Program.cs"), "utf8");
const TRACE = {
  examQuestionId: "t1", presentationType: "tableFill", questionTypeVersion: 1, marks: 4,
  text: "تتبّع البرنامج بالمدخلات a=5, b=2, c=7 وأكمل جدول المتابعة.",
  codeStimulus: { language: "csharp", source: SOURCE, label: "ف4 بيتية س1" },
  tableHeaders: ["a", "b", "c", "المخرج"],
  tableRows: [["5", "2", "", ""]],
  fields: [
    { id: "c-after", kind: "text", row: 0, column: 2, correct: "7" },
    { id: "out", kind: "text", row: 0, column: 3, correct: "7" },
  ],
};
const exam = qs => ({ examId: "LX", title: "x", status: "published", schemaVersion: 2, sections: [{ id: "s1", title: "س", gradingPolicy: "all", stimuli: {}, questions: qs }] });
const item = () => ({ moduleId: MID, label: "تتبّع: جملة الشرط", examSnapshot: exam([TRACE]), feedback: { t1: { explanation: "a > b فتصبح c = a + b = 7، و(a - b) = 3 < 5 فيُطبع 7." } } });
const INDEX = () => ({ schemaVersion: 1, courseId: CID, items: { trace1: item() } });

const USR = id => "platform/users/" + id + ".json", CLS = id => "platform/classes/" + id + ".json";
const student = (id, classId) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId, displayName: "علي", code: "S1" });
const room = () => ({ classId: "cA", name: "صف", active: true, status: "active", studentIds: [], learningMaterials: [{ courseId: CID, visibleModuleIds: [MID] }] });
const BUILDER_NO = { requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } }) };
const seed = () => createMemoryContainer({ [USR("u1")]: student("u1", "cA"), [CLS("cA")]: room() });
const deps = ctx => ({ ...BUILDER_NO, readIndex: () => INDEX(), requireStudentAuth: () => ({ ok: true, user: { sub: "u1", sv: 1, role: "student", classId: "cA" } }), container: ctx.container, getContainer: () => ctx.container });
const get = d => handler({ method: "GET", url: "https://x", headers: { get: () => null }, params: { courseId: CID, itemId: "trace1" } }, d);
const check = (d, body) => handler({ method: "POST", url: "https://x", headers: { get: () => null }, params: { courseId: CID, itemId: "trace1", action: "check" }, json: async () => body }, d);
const written = ctx => ctx.names("platform/").filter(n => !n.startsWith("platform/users/") && !n.startsWith("platform/classes/"));

describe("a C# trace table as a learning exam item", () => {
  it("the store accepts it", () => {
    expect(validateExamItem(CID, "trace1", item())).toEqual([]);
  });

  it("GET shows the code exactly and the table, with no key and no explanation", async () => {
    const r = await get(deps(seed()));
    expect(r.status).toBe(200);
    const q = r.jsonBody.exam.sections[0].questions[0];
    expect(q.codeStimulus).toEqual({ language: "csharp", source: SOURCE, label: "ف4 بيتية س1" });
    expect(q.tableHeaders).toEqual(["a", "b", "c", "المخرج"]);
    expect(q.fields.map(f => f.id)).toEqual(["c-after", "out"]);
    const json = JSON.stringify(r.jsonBody);
    for (const secret of ["\"correct\"", "explanation", "c = a + b = 7"]) expect(json, secret).not.toContain(secret);
  });

  it("check grades cell by cell, explains only an answered question, and writes nothing", async () => {
    const ctx = seed();
    const full = await check(deps(ctx), { answers: { t1: { kind: "fields", values: { "c-after": "7", out: "7" } } } });
    expect(full.status).toBe(200);
    expect(full.jsonBody).toMatchObject({ ok: true, persisted: false });
    expect(full.jsonBody.result.questions[0]).toMatchObject({ answered: true, correct: true, score: 4, explanation: "a > b فتصبح c = a + b = 7، و(a - b) = 3 < 5 فيُطبع 7." });
    const half = await check(deps(ctx), { answers: { t1: { kind: "fields", values: { "c-after": "7", out: "12" } } } });
    expect(half.jsonBody.result.questions[0]).toMatchObject({ answered: true, correct: false, score: 2, parts: { correct: 1, total: 2 } });
    const none = await check(deps(ctx), { answers: {} });
    expect(none.jsonBody.result.questions[0]).toMatchObject({ answered: false, score: 0 });
    expect("explanation" in none.jsonBody.result.questions[0]).toBe(false);
    expect(JSON.stringify([full.jsonBody, half.jsonBody])).not.toContain("\"correct\":\"7\"");
    expect(written(ctx)).toEqual([]);
  });
});
