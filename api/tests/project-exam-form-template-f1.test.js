import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getExamFormTemplate, getSupportedProjects } from "../src/lib/project-tracker/registry.js";
import { KINDS, validateExamFormTemplate, toStudentView, summarizeExamForm, readExamFormTemplateFile, loadExamFormTemplate } from "../src/lib/project-tracker/exam-form.js";

// Phase F1 — the project exam form («استمارة امتحان المشروع»): the bundled 794589 template, the template validation and the
// student projection. No route and no storage yet (docs/enterprise-project-exam-form-f1.md).

const CODE = "794589";
const clone = v => JSON.parse(JSON.stringify(v));
const valid = () => clone(getExamFormTemplate(CODE));
const question = (template, id) => template.sections.flatMap(s => s.questions).find(q => q.questionId === id);
const sectionWeights = (template, from, to) => template.sections.filter(s => s.order >= from && s.order <= to).reduce((n, s) => n + s.weight, 0);
// Every object key that appears anywhere inside `value`.
function keysDeep(value, into = new Set()) {
  if (Array.isArray(value)) value.forEach(v => keysDeep(v, into));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) { into.add(k); keysDeep(v, into); }
  return into;
}

describe("F1 — the bundled 794589 exam form", () => {
  it("is a valid template of 16 sections and 92 questions worth 100", () => {
    const template = getExamFormTemplate(CODE);
    expect(() => validateExamFormTemplate(template, { projectCode: CODE })).not.toThrow();
    expect(summarizeExamForm(template)).toEqual({
      projectCode: CODE, formVersion: 1, sections: 16, questions: 92,
      auto: 13, teacher: 75, unmarked: 4, withImages: 14, files: 2, totalWeight: 100
    });
  });

  it("keeps the sections in book order with the agreed weight of each axis", () => {
    const template = getExamFormTemplate(CODE);
    expect(template.sections.map(s => s.sectionId)).toEqual(Array.from({ length: 16 }, (_, i) => "S" + String(i + 1).padStart(2, "0")));
    expect(template.sections.map(s => s.order)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
    expect(template.sections.map(s => s.questions.length)).toEqual([4, 5, 4, 9, 3, 8, 8, 7, 7, 7, 7, 6, 4, 5, 4, 4]);
    expect([sectionWeights(template, 1, 3), sectionWeights(template, 4, 5), sectionWeights(template, 6, 10), sectionWeights(template, 11, 12), sectionWeights(template, 13, 15), sectionWeights(template, 16, 16)])
      .toEqual([10, 15, 40, 15, 15, 5]);
  });

  it("has a five-level rubric from 0 to 4", () => {
    expect(getExamFormTemplate(CODE).rubric.levels.map(l => l.value)).toEqual([0, 1, 2, 3, 4]);
  });

  it("pins the keys of the auto-marked questions (a key edit must be deliberate)", () => {
    const template = getExamFormTemplate(CODE);
    const chosen = id => { const q = question(template, id); return q.options.find(o => o.id === q.answer.correctOptionId).text; };
    expect(chosen("S04Q04")).toBe("254");
    expect(chosen("S09Q05")).toBe("0.0.0.255");
    expect(chosen("S04Q07")).toContain("البوابة ليست في شبكته");
    const privateRanges = question(template, "S04Q03");
    expect(privateRanges.options.filter(o => privateRanges.answer.correctOptionIds.includes(o.id)).map(o => o.text)).toEqual(["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"]);
    const services = question(template, "S10Q02");
    const pairText = left => services.right.find(r => r.id === services.answer.pairs[services.left.find(l => l.text === left).id]).text;
    expect(pairText("DNS")).toContain("53");
    expect(pairText("DHCP")).toContain("67");
    expect(pairText("HTTP")).toContain("80");
    expect(pairText("FTP")).toContain("21");
    expect(pairText("SMTP")).toContain("25");
    const steps = question(template, "S12Q03");
    expect(steps.answer.order.map(id => steps.items.find(i => i.id === id).text)[0]).toContain("الكابل");
    expect(template.sections.flatMap(s => s.questions).filter(q => q.grading === "auto").map(q => q.questionId))
      .toEqual(["S04Q03", "S04Q04", "S04Q07", "S06Q04", "S06Q06", "S07Q02", "S08Q05", "S09Q05", "S10Q02", "S11Q03", "S11Q06", "S12Q03", "S12Q05"]);
  });

  it("never lists a matching or ordering question in the order of its key", () => {
    const all = getExamFormTemplate(CODE).sections.flatMap(s => s.questions);
    const matching = all.filter(q => q.kind === "matching");
    const ordering = all.filter(q => q.kind === "ordering");
    expect(matching).toHaveLength(4);
    expect(ordering).toHaveLength(1);
    for (const q of matching) expect(q.left.map(l => q.answer.pairs[l.id]), q.questionId).not.toEqual(q.right.map(r => r.id));
    for (const q of ordering) expect(q.answer.order, q.questionId).not.toEqual(q.items.map(i => i.id));
  });

  it("is frozen: a caller cannot change the shared template", () => {
    const template = getExamFormTemplate(CODE);
    expect(Object.isFrozen(template)).toBe(true);
    expect(Object.isFrozen(question(template, "S04Q04").answer)).toBe(true);
    expect(() => { template.sections[0].questions.push({}); }).toThrow();
    expect(getExamFormTemplate(CODE)).toBe(template);
  });
});

describe("F1 — the registry", () => {
  // Phase F1b — 883589 ships its own form now (api/tests/project-exam-form-883589-f1b.test.js); 899373 is the project with none.
  it("returns a form only for the projects that ship one", () => {
    expect(getSupportedProjects().filter(code => getExamFormTemplate(code) !== null).sort()).toEqual([CODE, "883589"]);
    expect(getExamFormTemplate("883589").projectCode).toBe("883589");
    expect(getExamFormTemplate("899373")).toBeNull();
  });
  it("refuses an unknown project instead of answering «no form»", () => {
    expect(() => getExamFormTemplate("000000")).toThrow(/Unknown project code/);
    expect(() => getExamFormTemplate("")).toThrow(/Unknown project code/);
  });
  it("the loader takes a six-digit code only (never a path)", () => {
    expect(() => loadExamFormTemplate("../project-794589")).toThrow(/Unknown project code/);
    expect(() => loadExamFormTemplate("794589/..")).toThrow(/Unknown project code/);
    expect(() => loadExamFormTemplate("899373")).toThrow(/not found/);
  });
});

describe("F1 — a template file is validated when it is read", () => {
  const withFile = (template, run) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "exam-form-f1-"));
    const file = path.join(dir, "exam-form-template.json");
    try { fs.writeFileSync(file, JSON.stringify(template)); return run(file); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  };
  it("a valid file is returned frozen", () => {
    withFile(valid(), file => {
      const template = readExamFormTemplateFile(file, CODE);
      expect(summarizeExamForm(template).questions).toBe(92);
      expect(Object.isFrozen(template.sections[0].questions[0])).toBe(true);
    });
  });
  it("a file with a broken key is refused, not returned", () => {
    const broken = valid();
    question(broken, "S04Q04").answer.correctOptionId = "o9";
    withFile(broken, file => expect(() => readExamFormTemplateFile(file, CODE)).toThrow(/الإجابة الصحيحة/));
  });
  it("a file of another project is refused", () => {
    withFile(valid(), file => expect(() => readExamFormTemplateFile(file, "883589")).toThrow(/لا يخص هذا المشروع/));
  });
});

describe("F1 — the student view never carries an answer key", () => {
  it("has every question and no key, at any depth", () => {
    const template = getExamFormTemplate(CODE);
    const view = toStudentView(template);
    expect(view.sections.flatMap(s => s.questions).map(q => q.questionId)).toEqual(template.sections.flatMap(s => s.questions).map(q => q.questionId));
    const keys = keysDeep(view);
    // (`order` is not listed: a section's display order is public; the ordering KEY lives under `answer`.)
    for (const secret of ["answer", "correctOptionId", "correctOptionIds", "pairs"]) expect(keys.has(secret)).toBe(false);
    expect(view.sections.every(s => s.questions.every(q => !("answer" in q)))).toBe(true);
    expect(JSON.stringify(view)).not.toContain("correctOption");
  });

  it("keeps what the student needs to answer", () => {
    const view = toStudentView(getExamFormTemplate(CODE));
    const q = id => question(view, id);
    expect(q("S04Q04").options).toHaveLength(4);
    expect(q("S04Q07").justification).toBe(true);
    expect(q("S06Q04").left).toHaveLength(4);
    expect(q("S06Q04").right).toHaveLength(4);
    expect(q("S12Q03").items).toHaveLength(5);
    expect(q("S04Q01").columns.map(c => c.id)).toEqual(["branch", "department", "vlan", "network", "mask", "gateway"]);
    expect(q("S11Q07").images).toEqual({ min: 1, max: 2 });
    expect(q("S16Q02").accept).toEqual([".pkt"]);
    expect(q("S14Q04")).toMatchObject({ min: 1, max: 5 });
  });

  it("is an allow-list: a field it does not know is dropped, wherever it is planted", () => {
    const template = valid();
    template.internalNote = "teacher only";
    template.sections[0].teacherHint = "teacher only";
    for (const s of template.sections) for (const q of s.questions) {
      q.modelAnswer = "teacher only";
      if (q.options) q.options.forEach(o => { o.correct = true; });
      if (q.items) q.items.forEach(i => { i.position = 1; });
    }
    const keys = keysDeep(toStudentView(template));
    for (const leaked of ["internalNote", "teacherHint", "modelAnswer", "correct", "position", "answer", "rubric", "weight", "bookRef"]) expect(keys.has(leaked)).toBe(false);
  });

  it("does not change the template it reads", () => {
    const template = valid();
    const before = JSON.stringify(template);
    toStudentView(template);
    expect(JSON.stringify(template)).toBe(before);
  });
});

describe("F1 — a malformed template is refused", () => {
  const q = (t, id) => question(t, id);
  const cases = [
    ["a template of another project", t => { t.projectCode = "883589"; }],
    ["no project code", t => { delete t.projectCode; }],
    ["form version 0", t => { t.formVersion = 0; }],
    ["a fractional form version", t => { t.formVersion = 1.5; }],
    ["an empty title", t => { t.title = "  "; }],
    ["a rubric with one level", t => { t.rubric.levels = [{ value: 0, label: "لا شيء" }]; }],
    ["a rubric that skips a level", t => { t.rubric.levels[2].value = 3; }],
    ["a rubric level with no label", t => { t.rubric.levels[1].label = ""; }],
    ["no sections", t => { t.sections = []; }],
    ["41 sections", t => { t.sections = Array.from({ length: 41 }, (_, i) => ({ ...clone(t.sections[0]), sectionId: "S" + String(i + 1).padStart(2, "0"), order: i + 1 })); }],
    // The second section's questions are renamed too, so only the section-id rule can refuse it.
    ["a duplicate section id", t => { t.sections[1].sectionId = "S01"; t.sections[1].questions.forEach((x, i) => { x.questionId = "S01Q" + (50 + i); }); }],
    ["a section id of the wrong shape", t => { t.sections[0].sectionId = "one"; }],
    ["an empty section title", t => { t.sections[0].title = ""; }],
    ["a duplicate section order", t => { t.sections[1].order = 1; }],
    ["a non-numeric section order", t => { t.sections[0].order = "first"; }],
    ["a negative section weight", t => { t.sections[0].weight = -1; }],
    ["a non-numeric section weight", t => { t.sections[0].weight = "3"; }],
    ["section weights that sum to 99", t => { t.sections[0].weight -= 1; }],
    ["section weights that sum to 101", t => { t.sections[0].weight += 1; }],
    ["a section with no questions", t => { t.sections[0].questions = []; }],
    ["a section with 41 questions", t => { const base = t.sections[0].questions[0]; t.sections[0].questions = Array.from({ length: 41 }, (_, i) => ({ ...clone(base), questionId: "S01Q" + String(i + 1).padStart(2, "0") })); }],
    ["a duplicate question id", t => { t.sections[0].questions[1].questionId = "S01Q01"; }],
    ["a question id that belongs to another section", t => { t.sections[0].questions[0].questionId = "S02Q09"; }],
    ["an empty prompt", t => { q(t, "S01Q01").prompt = " "; }],
    ["a prompt longer than 600 characters", t => { q(t, "S01Q01").prompt = "س".repeat(601); }],
    ["an empty help text", t => { q(t, "S01Q01").help = ""; }],
    ["a non-boolean required flag", t => { q(t, "S01Q01").required = "yes"; }],
    ["an unknown kind", t => { q(t, "S01Q01").kind = "essay"; }],
    ["a paragraph marked automatically", t => { q(t, "S02Q01").grading = "auto"; q(t, "S02Q01").answer = {}; }],
    ["a declaration marked by the teacher", t => { q(t, "S15Q04").grading = "teacher"; }],
    ["an auto question with no key", t => { delete q(t, "S04Q04").answer; }],
    ["a key on a teacher-marked question", t => { q(t, "S11Q02").answer = { correctOptionIds: ["o1"] }; }],
    ["a key on a text question", t => { q(t, "S01Q01").answer = { text: "x" }; }],
    ["a choice key that is not an option", t => { q(t, "S04Q04").answer.correctOptionId = "o9"; }],
    ["a choice with one option", t => { q(t, "S04Q04").options.length = 1; }],
    ["a choice with a duplicate option id", t => { q(t, "S04Q04").options[1].id = "o1"; }],
    ["a choice option with no text", t => { q(t, "S04Q04").options[0].text = ""; }],
    ["a multi-choice key with an unknown option", t => { q(t, "S04Q03").answer.correctOptionIds.push("o99"); }],
    ["a multi-choice key that repeats an option", t => { q(t, "S04Q03").answer.correctOptionIds.push("o1"); }],
    ["an empty multi-choice key", t => { q(t, "S04Q03").answer.correctOptionIds = []; }],
    ["a matching key that misses a left item", t => { delete q(t, "S06Q04").answer.pairs.l1; }],
    ["a matching key that points outside the right column", t => { q(t, "S06Q04").answer.pairs.l1 = "r9"; }],
    ["a matching key with an extra left item", t => { q(t, "S06Q04").answer.pairs.l9 = "r1"; }],
    ["an ordering key that drops an item", t => { q(t, "S12Q03").answer.order.pop(); }],
    ["an ordering key that repeats an item", t => { q(t, "S12Q03").answer.order[0] = q(t, "S12Q03").answer.order[1]; }],
    ["a table with no columns", t => { q(t, "S02Q03").columns = []; }],
    ["a table with a duplicate column", t => { q(t, "S02Q03").columns[1].id = "goal"; }],
    ["a table column id of the wrong shape", t => { q(t, "S02Q03").columns[0].id = "Goal 1"; }],
    ["a table whose minimum rows exceed its maximum", t => { q(t, "S02Q03").minRows = 9; }],
    ["a table of more than 40 rows", t => { q(t, "S04Q01").maxRows = 41; }],
    ["an image question with no image setting", t => { delete q(t, "S01Q04").images; }],
    ["an image minimum above its maximum", t => { q(t, "S01Q04").images = { min: 3, max: 2 }; }],
    ["more than 6 images", t => { q(t, "S16Q01").images.max = 7; }],
    ["images on a choice question", t => { q(t, "S04Q04").images = { min: 0, max: 1 }; }],
    ["a file type that is not allowed", t => { q(t, "S16Q02").accept = [".exe"]; }],
    ["a file question with no type", t => { q(t, "S16Q02").accept = []; }],
    ["a text limit above the cap", t => { q(t, "S01Q01").maxLength = 501; }],
    ["a text limit of 0", t => { q(t, "S02Q01").maxLength = 0; }],
    ["a scale whose minimum is not below its maximum", t => { q(t, "S14Q04").min = 5; }],
    ["a justification on a question that is not a choice", t => { q(t, "S01Q01").justification = true; }],
    ["a checklist with no items", t => { q(t, "S13Q01").items = []; }]
  ];
  it("the unchanged copy is valid (control)", () => {
    expect(() => validateExamFormTemplate(valid(), { projectCode: CODE })).not.toThrow();
  });
  for (const [name, mutate] of cases) {
    it(name, () => {
      const template = valid();
      mutate(template);
      let error = null;
      try { validateExamFormTemplate(template, { projectCode: CODE }); } catch (e) { error = e; }
      expect(error, "expected a refusal").not.toBeNull();
      expect(error.httpStatus).toBe(400);
      expect(typeof error.message).toBe("string");
    });
  }
  it("refuses a value that is not a template at all", () => {
    for (const bad of [null, undefined, [], "form", 7]) expect(() => validateExamFormTemplate(bad)).toThrow();
  });
  it("more than 300 questions in total is refused", () => {
    const template = valid();
    const base = template.sections[0].questions[0];
    template.sections = Array.from({ length: 8 }, (_, si) => {
      const sectionId = "S" + String(si + 1).padStart(2, "0");
      return { sectionId, title: "قسم", order: si + 1, weight: si === 0 ? 100 : 0, questions: Array.from({ length: 40 }, (_, qi) => ({ ...clone(base), questionId: sectionId + "Q" + String(qi + 1).padStart(2, "0") })) };
    });
    expect(() => validateExamFormTemplate(template)).toThrow(/300/);
    template.sections.pop();
    expect(() => validateExamFormTemplate(template)).not.toThrow();
  });
});

describe("F1 — every kind declares how it is marked", () => {
  it("only the four closed kinds can be marked automatically", () => {
    expect(Object.entries(KINDS).filter(([, g]) => g.includes("auto")).map(([k]) => k).sort()).toEqual(["choice", "matching", "multiChoice", "ordering"]);
  });
  it("the bundled form uses every kind", () => {
    const used = new Set(getExamFormTemplate(CODE).sections.flatMap(s => s.questions).map(q => q.kind));
    expect([...used].sort()).toEqual(Object.keys(KINDS).sort());
  });
});
