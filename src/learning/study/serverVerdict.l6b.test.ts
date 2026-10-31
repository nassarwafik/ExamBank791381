// Phase L.6b — the REAL attempt handler judges EVERY in-page exercise of the book (the browser holds no key) and answers with the
// book's own feedback for that answer: for each checkable block of the AUTHORED content, a wrong answer earns its wrong message and
// its hint ladder (never the explanation), a right one its right message and its explanation (never a hint). A self-check block
// (`studyEligible: false`) is judged too — answered, never recorded. Students are refused a hidden module's blocks.
import { describe, it, expect } from "vitest";
import { COURSE_CONTENT_MODULE_IDS } from "../content/registry";
import { loadBundledModuleContent } from "../content/bundledModules";
import { hintLadder, type ContentBlock } from "../content/types";
import { practiceQuestionKey, practiceTableKey, type StudyActivityKey } from "./eligibility";
// @ts-expect-error — the API handler and fixture are untyped CommonJS modules, used here on purpose to run the real server.
import { handler } from "../../../api/src/functions/learning-study.js";
import { createMemoryContainer } from "../../../api/tests/fixtures/memory-container.js";

const C = "791381";
type Checkable = { pageId: string; moduleId: string; block: ContentBlock; key: StudyActivityKey };
async function checkables(): Promise<Checkable[]> {
  const out: Checkable[] = [];
  for (const moduleId of COURSE_CONTENT_MODULE_IDS[C]) {
    for (const page of (await loadBundledModuleContent(C, moduleId)).lessons.flatMap(l => l.pages)) {
      for (const block of page.blocks) {
        const key = block.type === "practice" ? practiceQuestionKey(block.question) : block.type === "practice-table" ? practiceTableKey(block) : null;
        if (key) out.push({ pageId: page.id, moduleId, block, key });
      }
    }
  }
  return out;
}
const right = (key: StudyActivityKey) => {
  switch (key.kind) {
    case "multipleChoice": return { kind: key.kind, optionId: key.correct[0] };
    case "trueFalse": return { kind: key.kind, value: key.answer };
    case "shortInput": return { kind: key.kind, text: key.answer };
    case "practice-table": return { kind: key.kind, choices: { ...key.cells } };
    case "wordBank": return { kind: key.kind, choices: { ...key.answers } };
    case "matching": return { kind: key.kind, choices: { ...key.pairs } };
    case "classify": return { kind: key.kind, choices: { ...key.assign } };
    case "ordering": return { kind: key.kind, order: [...key.order] };
    // network labs are not collected here (their server judging is pinned by api/tests/learning-lab.test.js)
    case "network-lab": throw new Error("network-lab is not a practice key");
  }
};
const wrong = (key: StudyActivityKey) => {
  if (key.kind === "multipleChoice") return { kind: key.kind, optionId: "no-such-option" };
  if (key.kind === "trueFalse") return { kind: key.kind, value: !key.answer };
  if (key.kind === "shortInput") return { kind: key.kind, text: key.answer + "x" };
  if (key.kind === "ordering") return { kind: key.kind, order: [...key.order].reverse() };
  if (key.kind === "network-lab") return { kind: key.kind, actions: [] };
  const cells = { ...(key.kind === "practice-table" ? key.cells : key.kind === "wordBank" ? key.answers : key.kind === "matching" ? key.pairs : key.assign) }, first = Object.keys(cells)[0];
  cells[first] = cells[first] + "؟";
  return { kind: key.kind, choices: cells };
};
function server(visible: string[]) {
  const ctx = createMemoryContainer({
    "platform/users/u1.json": { userId: "u1", role: "student", active: true, archived: false, authVersion: 1, classId: "cA" },
    "platform/classes/cA.json": { classId: "cA", status: "active", active: true, learningMaterials: [{ courseId: C, visibleModuleIds: visible }] },
  });
  const deps = { requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false } } }), requireStudentAuth: () => ({ ok: true, user: { sub: "u1", sv: 1, role: "student" } }), container: ctx.container, getContainer: () => ctx.container };
  const attempt = (body: unknown) => handler({ method: "POST", url: "https://x", headers: { get: () => null }, params: { courseId: C, action: "attempt" }, json: async () => body }, deps);
  return { ctx, attempt };
}

describe("L.6b — the server's verdict and feedback for every exercise of the book", () => {
  it("every checkable block (479): wrong → the wrong message + hints; right → the right message + explanation; self-checks answered, never recorded", async () => {
    const all = await checkables();
    expect(all).toHaveLength(479);
    const { ctx, attempt } = server([...COURSE_CONTENT_MODULE_IDS[C]]);
    let selfChecks = 0;
    for (const a of all) {
      const fb = a.block.type === "practice" ? a.block.question.feedback : undefined;
      const no = await attempt({ pageId: a.pageId, activityId: a.block.id, response: wrong(a.key) });
      expect(no.status, a.block.id).toBe(200);
      expect(no.jsonBody.correct, a.block.id).toBe(false);
      const hints = hintLadder(fb);
      expect(no.jsonBody.feedback, a.block.id).toEqual({ ...(fb?.incorrectFeedback ? { message: fb.incorrectFeedback } : {}), ...(hints.length ? { hints } : {}) });
      const ok = await attempt({ pageId: a.pageId, activityId: a.block.id, response: right(a.key) });
      expect(ok.status, a.block.id).toBe(200);
      expect(ok.jsonBody.correct, a.block.id).toBe(true);
      expect(ok.jsonBody.feedback, a.block.id).toEqual({ ...(fb?.correctFeedback ? { message: fb.correctFeedback } : {}), ...(fb?.explanation ? { explanation: fb.explanation } : {}) });
      const selfCheck = a.block.type === "practice-table" || a.block.type === "practice" ? a.block.studyEligible === false : false;
      expect(ok.jsonBody.study, a.block.id).toBe(!selfCheck);
      if (selfCheck) { selfChecks++; expect(ok.jsonBody.persisted).toBe(false); }
    }
    expect(selfChecks).toBe(4);
    const stored = (ctx as { getJson: (n: string) => { pages: Record<string, { completed: Record<string, string> }> } }).getJson("platform/learning-study/u1.json");
    expect(Object.values(stored.pages).reduce((n, p) => n + Object.keys(p.completed).length, 0)).toBe(475);   // the study activities only
  }, 60000);

  it("a hidden module's block is refused to a student, whatever the answer", async () => {
    const all = await checkables();
    const late = all.find(a => a.moduleId === "791381-m28")!;
    const { attempt } = server(["791381-m01"]);
    const r = await attempt({ pageId: late.pageId, activityId: late.block.id, response: wrong(late.key) });
    expect(r.status).toBe(403);
    expect(r.jsonBody.feedback).toBeUndefined();
  });
});
