import { describe, it, expect } from "vitest";
import { handler } from "../src/functions/ai-exam-composer.js";
import * as F from "../../src/aiComposer/testing/composerFakeAi";
import { COMPOSER_FIXTURES } from "../../src/aiComposer/testing/composerFixtures";
import { sanitizeExamForStudent } from "../src/lib/student-exam-sanitize.js";

// Phase 21A.1 — POST /api/ai-exam-composer with the data-chart capability (catalog V3), through the REAL handler and a scripted provider:
// the section prompt / schema carry the chart contract; an AI chart built from the teacher's own numbers is accepted and labelled as the
// teacher's data; a chart whose numbers differ from the request, or invented data without the teacher's consent, is refused with a
// classified, repairable issue and NOTHING is returned to store; with consent, invented data is accepted and labelled illustrative by code.
const NET = COMPOSER_FIXTURES[0];
const req = body => ({ json: async () => body });
const auth = () => ({ ok: true, user: { sub: "teacher-1" } });
function deps(script) {
  const ai = F.scriptedAi(script);
  return { ai, d: { requireBuilderAuth: auth, callTextJson: ai.fn, reserveComposerCall: async () => ({ allowed: true, retryAfterSeconds: 0 }), container: null, now: () => "2026-10-08T00:00:00.000Z", log: () => {} } };
}
const INTENT = (over = {}) => ({ ...NET.intent, teacherInstruction: "أضف رسمًا بيانيًا لهطول الأمطار: يناير ١٢٠ ملم، فبراير 95 ملم، مارس 82 ملم.", ...over });
const chart = over => ({
  kind: "bar", dataOrigin: "teacherProvided", title: "الهطول الشهري", description: "كمية الأمطار في الربع الأول بالملّيمتر.",
  categories: ["يناير", "فبراير", "مارس"], series: [{ label: "الهطول", values: [120, 95, 82], mark: "bar" }], points: [], bins: [], boxes: [],
  xLabel: "الشهر", yLabel: "الهطول", unit: "mm", stacked: false, horizontal: false, donut: false, ...over
});
const sectionWithChart = c => ({ items: [{ ...NET.sections[0].items[0], stem: [F.rb("paragraph", { text: "ادرس الرسم ثم أجب." }), F.rb("dataChart", { chart: c })] }, ...NET.sections[0].items.slice(1)] });
const body = (intent = INTENT()) => ({ stage: "section", intent, planRaw: NET.plan, sectionIndex: 0, nonce: "abc123" });

describe("21A1-AI-API the chart capability through the composer endpoint", () => {
  it("the section call carries the chart contract and the closed chart schema; the teacher's numbers become a validated chart labelled as the teacher's data", async () => {
    const { ai, d } = deps({ ai_exam_section: [sectionWithChart(chart())] });
    const r = await handler(req(body()), d);
    expect(r.status).toBe(200);
    expect(r.jsonBody.ok, JSON.stringify(r.jsonBody.issues)).toBe(true);
    expect(ai.calls[0].prompt).toContain("Charts: a dataChart block carries ONE descriptor");
    // 21A.2: the chart contract stays pinned while the additive function-graph catalog advances to V4.
    expect(ai.calls[0].prompt).toContain("AI_COMPOSER_CATALOG_V4");
    expect(JSON.stringify(ai.calls[0].schema)).toContain('"dataOrigin"');
    const q = r.jsonBody.section.questions[0];
    const block = q.richContent.blocks[1];
    expect(block).toMatchObject({ type: "dataChart", chart: { id: "chart2", kind: "bar", source: "بيانات من طلب المعلم", categories: [{ id: "c1", label: "يناير" }, { id: "c2", label: "فبراير" }, { id: "c3", label: "مارس" }] } });
    expect(block.chart.series[0].values).toEqual([120, 95, 82]);
    const student = sanitizeExamForStudent({ examId: "e", title: "t", sections: [r.jsonBody.section] });
    expect(student.sections[0].questions[0].richContent.blocks[1].chart.series[0].values).toEqual([120, 95, 82]);
  });
  it("a changed teacher number is refused (classified, repairable) and no section is returned", async () => {
    const { d } = deps({ ai_exam_section: [sectionWithChart(chart({ series: [{ label: "الهطول", values: [120, 95, 85], mark: "bar" }] }))] });
    const r = await handler(req(body()), d);
    expect(r.jsonBody.ok).toBe(false);
    expect(r.jsonBody.code).toBe("SECTION_INVALID");
    expect(r.jsonBody.issues.map(i => i.code)).toContain("AI_CHART_DATA_NOT_PROVIDED");
    expect(r.jsonBody.section).toBeUndefined();
  });
  it("invented (illustrative) data is refused without the teacher's consent and accepted — labelled illustrative by code — with it", async () => {
    const invented = chart({ dataOrigin: "illustrative", series: [{ label: "الهطول", values: [10, 20, 30], mark: "bar" }], description: "بيانات حقيقية من الأرصاد" });
    const no = await handler(req(body()), deps({ ai_exam_section: [sectionWithChart(invented)] }).d);
    expect(no.jsonBody.issues.map(i => i.code)).toContain("AI_CHART_ILLUSTRATIVE_NOT_ALLOWED");
    const intent = INTENT({ capabilities: { ...(NET.intent.capabilities ?? {}), illustrativeData: true } });
    const yes = await handler(req(body(intent)), deps({ ai_exam_section: [sectionWithChart(invented)] }).d);
    expect(yes.jsonBody.ok, JSON.stringify(yes.jsonBody.issues)).toBe(true);
    expect(yes.jsonBody.section.questions[0].richContent.blocks[1].chart.source).toBe("بيانات توضيحية من إنشاء الذكاء الاصطناعي — ليست بيانات حقيقية");
  });
  it("with charts turned off, an AI chart is refused", async () => {
    const intent = INTENT({ capabilities: { ...(NET.intent.capabilities ?? {}), charts: false } });
    const r = await handler(req(body(intent)), deps({ ai_exam_section: [sectionWithChart(chart())] }).d);
    expect(r.jsonBody.issues.map(i => i.code)).toContain("AI_CHART_DISABLED");
  });
  it("an engine option / markup smuggled in a descriptor fails closed", async () => {
    for (const c of [{ ...chart(), option: { series: [] } }, chart({ title: "<img src=x onerror=alert(1)>" }), chart({ kind: "graphic" })]) {
      const r = await handler(req(body()), deps({ ai_exam_section: [sectionWithChart(c)] }).d);
      expect(r.jsonBody.ok, JSON.stringify(c).slice(0, 60)).toBe(false);
    }
  });
});
