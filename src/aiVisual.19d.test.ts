import { describe, it, expect } from "vitest";
import { AI_AUTHOR_INTENTS, AI_GENERATED_TYPES, buildAiAuthorPrompt, buildAiAuthorSchema, classifyAuthorRequest, normalizeAiQuestionDraft } from "./aiQuestionDraft";

// Phase 19D — AI authoring vocabulary for the visual types. The AI may RECOGNISE hotspot / labelDiagram intents (request signals, intent
// enum, prompt), but it has no image and no geometry authority: it can never place target regions or drop zones. A visual intent is
// therefore refused with an explicit, teacher-facing message (manual placement on an attached image is the V1 path) — never a question
// with invented coordinates, never a silently repaired draft, whatever payload the AI smuggles. Fail-first on e0ec8e2.
const NONE = { multipleChoice: null, trueFalse: null, shortAnswer: null, fillBlank: null, inlineCloze: null, networkCli: null, parametricNumeric: null };
const draft = (over: Record<string, unknown> = {}) => ({ intent: "hotspot", confidence: "clear", unsupportedCapabilities: [], explanation: "", text: "انقر على الموجّه في المخطط.", marks: 2, ...NONE, ...over });

describe("19D AI — visual intent vocabulary", () => {
  it("hotspot and labelDiagram are recognised intents (schema enum) but never generated types", () => {
    expect(AI_AUTHOR_INTENTS).toContain("hotspot"); expect(AI_AUTHOR_INTENTS).toContain("labelDiagram");
    expect(buildAiAuthorSchema().properties.intent.enum).toEqual([...AI_AUTHOR_INTENTS]);
    expect(AI_GENERATED_TYPES).not.toContain("hotspot"); expect(AI_GENERATED_TYPES).not.toContain("labelDiagram");
    expect(JSON.stringify(buildAiAuthorSchema())).not.toMatch(/"regions"|"zones"|"cx"|"points"/);
  });
  it("bilingual request signals suggest the visual intents", () => {
    for (const r of ["اطلب من الطالب أن ينقر على الموجّه في الصورة", "حدد على الصورة مكان المعالج", "click on the router in the image", "select the correct area on the picture"]) expect(classifyAuthorRequest(r).suggestedIntent, r).toBe("hotspot");
    for (const r of ["سمِّ أجزاء الرسم التالي", "اسحب التسميات إلى أجزاء المخطط", "label the parts of the diagram", "label diagram of the OSI layers"]) expect(classifyAuthorRequest(r).suggestedIntent, r).toBe("labelDiagram");
    expect(classifyAuthorRequest("اكتب سؤال اختيار من متعدد عن الشبكات").suggestedIntent).not.toBe("hotspot");
  });
  it("the prompt tells the AI to recognise but never fill visual questions (no coordinates without an image)", () => {
    const p = buildAiAuthorPrompt("انقر على الموجّه في الصورة", classifyAuthorRequest("انقر على الموجّه في الصورة"));
    expect(p).toMatch(/hotspot/); expect(p).toMatch(/labelDiagram/); expect(p).toMatch(/never invent (image )?coordinates|do not invent coordinates/i);
  });
});

describe("19D AI — refusal: no invented geometry", () => {
  it("a hotspot intent is refused with AI_VISUAL_GEOMETRY_REQUIRED and an explicit teacher-facing message; no question", () => {
    const r = normalizeAiQuestionDraft(draft(), { request: "انقر على الموجّه" });
    expect(r).toMatchObject({ ok: false, code: "AI_VISUAL_GEOMETRY_REQUIRED", intent: "hotspot" });
    expect(r.ok === false && r.message).toMatch(/المعلم/); expect(r.ok === false && r.message).toMatch(/صورة/); expect(r.ok === false && r.message).toMatch(/تحديد منطقة على صورة/);
    expect((r as { question?: unknown }).question).toBeUndefined();
  });
  it("a labelDiagram intent is refused the same way (zones must be placed by the teacher on the attached image)", () => {
    const r = normalizeAiQuestionDraft(draft({ intent: "labelDiagram", text: "سمِّ طبقات OSI" }), { request: "سمِّ أجزاء الرسم" });
    expect(r).toMatchObject({ ok: false, code: "AI_VISUAL_GEOMETRY_REQUIRED", intent: "labelDiagram" });
    expect(r.ok === false && r.message).toMatch(/تسمية أجزاء الرسم/);
  });
  it("whatever payload accompanies a visual intent (even a valid ordinary payload) nothing is generated; smuggled geometry is malformed", () => {
    const withPayload = normalizeAiQuestionDraft(draft({ multipleChoice: { options: ["Router", "Switch"], correctIndex: 0 } }), { request: "x" });
    expect(withPayload).toMatchObject({ ok: false, code: "AI_VISUAL_GEOMETRY_REQUIRED" });
    const smuggled = normalizeAiQuestionDraft({ ...draft(), hotspot: { regions: [{ id: "t1", shape: { kind: "rect", x: 0.1, y: 0.1, width: 0.2, height: 0.2 } }] } }, { request: "x" });
    expect(smuggled).toMatchObject({ ok: false, code: "AI_DRAFT_MALFORMED" });
    expect(JSON.stringify(smuggled)).not.toMatch(/"x":0\.1/);
  });
});
