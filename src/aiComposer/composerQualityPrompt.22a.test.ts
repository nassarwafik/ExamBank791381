import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { buildModifyPrompt, buildPlanPrompt, buildSectionPrompt } from "./composerPrompts";
import { normalizeComposerIntent } from "./composerIntent";
import { normalizePlanShape } from "./composerPlan";
import { buildAiSafeProjection } from "./composerProjection";
import { qualityWarnings } from "./composerQuality";
import { newQuestion } from "../examBuilderState";
import type { StructuredExam } from "../examTypes";
import * as F from "./testing/composerFakeAi";

// Phase 22A — the wording defects the 21X checks REPORT are now also asked for UP FRONT, in the trusted rules of every composer prompt
// (plan, section, modify): no catch-all options, no two options that mean the same, at most one negation per stem. The rule and the
// checks stay in step: every phrase the rule names is one the check flags. The 21Q rule line is untouched.
const RULE = "- Every option of a choice question is a real, distinct answer: never write «كل ما سبق», «جميع ما سبق», «لا شيء مما سبق», \"all of the above\" or \"none of the above\", and never two options that mean the same thing. Word each stem with at most ONE negation (no double negatives such as «لا … غير»).";
const RULE_21Q = "- Vary the position of the correct option across multiple-choice questions, keep options of similar length, mix true and false answers, and never ask two questions that say the same thing.";
const intent = (() => { const r = normalizeComposerIntent({ v: 1, subject: "الشبكات", totalMarks: 2, teacherInstruction: "ركّز على طبقات الشبكة" }); if (!r.ok) throw new Error("intent"); return r.intent; })();
const PLAN_RAW = F.plan("امتحان قصير", "default", [F.planSection("أساسيات", [F.planItem("multipleChoice", 1), F.planItem("multipleChoice", 1)])]);
const mcq = (id: string, text: string, options: string[]) => newQuestion("multipleChoice", { examQuestionId: id, text, marks: 1, options: options.map(t => ({ text: t })), answer: { correctOptionIndex: 0 } });
const exam = (...questions: unknown[]): StructuredExam => ({ examId: "E22A", title: "t", status: "draft", schemaVersion: 2, sections: [{ id: "s1", title: "القسم", gradingPolicy: "all", stimuli: {}, questions }] } as unknown as StructuredExam);

describe("22A-PROMPT the rule is in every composer prompt, inside the trusted rules", () => {
  const plan = (() => { const s = normalizePlanShape(PLAN_RAW); if (!s.ok) throw new Error("plan"); return s.plan; })();
  const prompts: Record<string, string> = {
    plan: buildPlanPrompt(intent),
    section: buildSectionPrompt(intent, plan, 0),
    modify: buildModifyPrompt(buildAiSafeProjection(exam(mcq("q1", "أي جهاز يربط الشبكات؟", ["الموجّه", "المبدّل"])), { kind: "exam" })!, "modifyExam", { kind: "exam" }, "حسّن الصياغة")
  };
  for (const [name, text] of Object.entries(prompts)) {
    it(name + ": carries the 22A rule once, right after the 21Q rule, before any untrusted data", () => {
      expect(text.split(RULE).length - 1).toBe(1);
      expect(text).toContain(RULE_21Q + "\n" + RULE + "\n");
      expect(text.indexOf(RULE)).toBeGreaterThan(text.indexOf("RULES:"));
      expect(text.indexOf(RULE)).toBeLessThan(text.indexOf("<<UNTRUSTED DATA"));
    });
  }
});

describe("22A-SYNC the rule and the 21X checks agree", () => {
  it("every catch-all phrase the rule names is flagged by the check, and so is its double-negative example", () => {
    const named = [...RULE.matchAll(/«([^»]+)»|"([^"]+)"/g)].map(m => m[1] ?? m[2]);
    expect(named).toEqual(["كل ما سبق", "جميع ما سبق", "لا شيء مما سبق", "all of the above", "none of the above", "لا … غير"]);
    for (const phrase of named.slice(0, 5))
      expect(qualityWarnings(exam(mcq("q1", "أي جهاز يربط الشبكات؟", ["الموجّه", "المبدّل", phrase]))).map(w => w.code), phrase).toEqual(["COMPOSER_CATCH_ALL_OPTION"]);
    expect(qualityWarnings(exam(mcq("q1", "أي مما يلي لا يُعدّ غير صحيح؟", ["أ", "ب"]))).map(w => w.code)).toEqual(["COMPOSER_DOUBLE_NEGATIVE"]);
    expect(qualityWarnings(exam(mcq("q1", "أي جهاز يربط الشبكات؟", ["الموجّه", "الموجه", "المكرّر"]))).map(w => w.code)).toEqual(["COMPOSER_DUPLICATE_OPTIONS"]);
  });
});

describe("22A-ENDPOINT the model actually receives the rule", () => {
  it("the plan, section and modify requests sent by the real endpoint carry it", async () => {
    const { handler } = createRequire(import.meta.url)("../../api/src/functions/ai-exam-composer.js") as { handler: (r: unknown, d: unknown) => Promise<{ jsonBody: Record<string, unknown> }> };
    const SECTION = { items: [F.item("multipleChoice", { question: F.mcq("ما وظيفة VLAN؟", ["تقسيم الشبكة", "تسريع", "تخزين"], 1) }), F.item("multipleChoice", { question: F.mcq("ما وظيفة DNS؟", ["تسريع", "ترجمة الأسماء", "تخزين"], 1) })] };
    const ai = F.scriptedAi({ ai_exam_plan: [PLAN_RAW], ai_exam_section: [SECTION], ai_exam_patch: [F.patch([F.op("updateQuestionText", { questionId: "q1", text: "أي جهاز يربط الشبكات المختلفة؟", reason: "صياغة" })])] });
    const call = async (body: unknown) => (await handler({ json: async () => body }, { requireBuilderAuth: () => ({ ok: true, user: { sub: "t22a" } }), callTextJson: ai.fn, reserveComposerCall: async () => ({ allowed: true, retryAfterSeconds: 0 }), container: null })).jsonBody;
    const input = { v: 1, subject: "الشبكات", totalMarks: 2 };
    const p = await call({ stage: "plan", intent: input });
    expect(p.ok).toBe(true);
    expect((await call({ stage: "section", intent: input, planRaw: p.planRaw, sectionIndex: 0, nonce: "t22anonce" })).ok).toBe(true);
    expect((await call({ stage: "modify", exam: exam(mcq("q1", "أي جهاز يربط الشبكات؟", ["الموجّه", "المبدّل"])), mode: "modifyExam", scope: { kind: "exam" }, instruction: "حسّن الصياغة", nonce: "t22anonce" })).ok).toBe(true);
    expect(ai.calls.map(c => c.schemaName)).toEqual(["ai_exam_plan", "ai_exam_section", "ai_exam_patch"]);
    for (const c of ai.calls) expect(JSON.stringify(c), c.schemaName).toContain(JSON.stringify(RULE).slice(1, -1));
  });
});
