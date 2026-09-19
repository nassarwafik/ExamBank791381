// Units 4–6 phase — source-fidelity, mapping, provenance, pedagogy and safety guards for Unit 5 «أجهزة الشبكات»
// (PDF 48–56) as stable module m09, and the structural treatment of the PDF-47 batch divider.
import { describe, it, expect } from "vitest";
import m01 from "./modules/m01";
import m02 from "./modules/m02";
import m07 from "./modules/m07";
import m08 from "./modules/m08";
import m09 from "./modules/m09";
import manifest from "./manifest";
import { validateLearningCourseContent } from "../validation";
import { LEARNING_CONTENT_SCHEMA_VERSION, type LearningCourseContent, type ContentBlock, type ContentPage, type PracticeTableSelectCell } from "../types";

const course: LearningCourseContent = { schemaVersion: LEARNING_CONTENT_SCHEMA_VERSION, courseId: "791381", title: "شبكات الاتصال", direction: "rtl", modules: [m01, m02, m07, m08, m09] };
const pages = m09.lessons.flatMap(l => l.pages);
const pageBy = (id: string): ContentPage => pages.find(p => p.id === id)!;
const blockBy = (p: ContentPage, id: string): ContentBlock => p.blocks.find(b => b.id === id)!;
const plain = (p: ContentPage): string => JSON.stringify(p.blocks);
const sel = (cell: unknown) => cell as PracticeTableSelectCell;

const MAP: Record<string, [number, number | undefined, string]> = {
  "791381-m09-l00-p01": [48, undefined, "أجهزة الشبكات"],
  "791381-m09-l01-p01": [49, 49, "الأجهزة المستعملة في الشبكات"],
  "791381-m09-l01-p02": [50, 50, "جهاز Hub"],
  "791381-m09-l01-p03": [51, 51, "لماذا استُبدل Hub بـ Switch؟"],
  "791381-m09-l01-p04": [52, 52, "جهاز Switch"],
  "791381-m09-l01-p05": [53, 53, "مميزات Switch"],
  "791381-m09-l02-p01": [54, 54, "جهاز Router"],
  "791381-m09-l02-p02": [55, 55, "أهم خصائص Router"],
  "791381-m09-l03-p01": [56, 56, "خلاصة الأجهزة"],
};

describe("m09 — validation, mapping PDF 48–56, PDF 47 divider, completeness", () => {
  it("the REAL course (m01 + m02 + m07 + m08 + m09) produces ZERO validation issues", () => {
    expect(validateLearningCourseContent(course)).toEqual([]);
  });
  it("maps the nine Unit-5 pages 1:1 to PDF 48..56 with rendered titles and printed numbers; reading order = source order", () => {
    expect(pages.map(p => p.id).sort()).toEqual(Object.keys(MAP).sort());
    for (const [id, [pdf, printed, title]] of Object.entries(MAP)) {
      const p = pageBy(id);
      expect([p.source.sourceId, p.source.pdfPageStart, p.source.printedPage, p.source.pdfPageEnd, p.title], id).toEqual(["791381", pdf, printed, undefined, title]);
      expect(p.blocks.length, id).toBeGreaterThan(0);
    }
    const ordered = [...m09.lessons].sort((a, b) => a.order - b.order).flatMap(l => [...l.pages].sort((a, b) => a.order - b.order));
    expect(ordered.map(p => p.source.pdfPageStart)).toEqual([48, 49, 50, 51, 52, 53, 54, 55, 56]);
  });
  it("PDF 47 (batch-2 divider) is NOT a learner page: no page maps to it; it is the structural start of the module's source range with a note", () => {
    expect(pages.some(p => p.source.pdfPageStart === 47)).toBe(false);
    expect(m09.source).toMatchObject({ kind: "book", sourceId: "791381", pdfPageStart: 47, pdfPageEnd: 56 });
    expect(m09.source?.sourceNote).toContain("PDF 47");
    expect(JSON.stringify(m09)).not.toContain("نفس الأسلوب: شرح مختصر");   // the divider's slogan is never converted as content
  });
  it("HARD STOP: nothing from Unit 6 (PDF 57+) or Unit 7 is in m09", () => {
    for (const p of pages) expect(p.source.pdfPageStart, p.id).toBeLessThan(57);
    for (const banned of ["أنواع الشبكات البسيطة", "الشبكات السلكية التقليدية", "Topology", "P2P", "الكوابل وعنوان MAC", "Hybrid"]) expect(JSON.stringify(m09), banned).not.toContain(banned);
  });
  it("m09 is COMPLETE: manifest ↔ body ids/titles/orders/pages match; order 5; batch b2 lists it", () => {
    const mm = manifest.modules.find(m => m.id === "791381-m09")!;
    expect(mm.order).toBe(5); expect(m09.order).toBe(5); expect(m09.partial).toBeFalsy();
    expect(mm.lessons.flatMap(l => l.pages.map(p => p.id)).sort()).toEqual(pages.map(p => p.id).sort());
    for (const l of mm.lessons) {
      const body = m09.lessons.find(x => x.id === l.id)!;
      expect([body.order, body.title], l.id).toEqual([l.order, l.title]);
      for (const p of l.pages) { const bp = pageBy(p.id); expect([bp.order, bp.title, bp.source.pdfPageStart, bp.source.printedPage], p.id).toEqual([p.order, p.title, p.source!.pdfPageStart, p.source!.printedPage]); }
    }
    expect(manifest.batches!.find(b => b.id === "b2")!.moduleIds).toContain("791381-m09");
  });
});

describe("m09 — key source facts", () => {
  it("PDF 48 opener; PDF 49 three cards + تذكّر + the device simulation (enrichment, PDF 49)", () => {
    const o = blockBy(pageBy("791381-m09-l00-p01"), "m09-l00-p01-opener");
    expect(o.type === "unit-opener" && [o.unitLabel, o.unitNumber, o.title, o.subtitle]).toEqual(["الوحدة الخامسة", "05", "أجهزة الشبكات", "ما وظيفة Hub و Switch و Router؟ وكيف نميّز بينها؟"]);
    const p = pageBy("791381-m09-l01-p01");
    const cards = blockBy(p, "m09-l01-p01-cards");
    expect(cards.type === "list" && cards.items.map(i => [i.term, i.text.map(s => s.text).join("")])).toEqual([["Hub", "يرسل البيانات إلى جميع الأجهزة."], ["Switch", "يرسل البيانات للجهاز المقصود فقط."], ["Router", "يربط بين شبكات مختلفة والإنترنت."]]);
    expect(plain(p)).toContain("كل جهاز له وظيفة مختلفة داخل الشبكة، والفرق بينها هو في طريقة إرسال البيانات.");
    const sim = blockBy(p, "m09-l01-p01-sim");
    expect(sim.type === "simulation" && [sim.simulationType, sim.version, sim.origin, sim.source?.pdfPageStart]).toEqual(["hub-switch-router-flow", 1, "teacher-enrichment", 49]);
    expect((sim as { fallback?: { text?: string } }).fallback?.text).toMatch(/Hub.*Switch.*Router/s);
  });
  it("PDF 50–53: Hub bullets + analogy; the comparison table exactly; Switch bullets + «مناسب لـ»; the five features + the port idea", () => {
    expect(plain(pageBy("791381-m09-l01-p02"))).toContain("كمن يصرخ بالمعلومة في الصف ليسمعها الجميع، دون أن يخصّ أحدًا.");
    const pts = blockBy(pageBy("791381-m09-l01-p02"), "m09-l01-p02-points");
    expect(pts.type === "list" && pts.items.map(i => i.text.map(s => s.text).join(""))).toEqual(["عندما تصله بيانات، يرسلها للجميع.", "لا يعرف من هو الجهاز المقصود.", "الجهاز الصحيح فقط يستعمل البيانات.", "قد يسبب ازدحامًا وتداخلًا في الشبكة."]);
    const t = blockBy(pageBy("791381-m09-l01-p03"), "m09-l01-p03-table");
    expect(t.type === "table" && [t.headers, t.rows]).toEqual([["وجه المقارنة", "Hub", "Switch"], [["طريقة الإرسال", "يرسل البيانات للجميع", "يرسلها للجهاز المقصود"], ["الازدحام", "ازدحام أكثر في الشبكة", "ازدحام أقل"], ["الذكاء", "أقل ذكاءً", "أكثر ذكاءً"], ["الأداء", "أداء أضعف", "أداء أفضل"]]]);
    expect(plain(pageBy("791381-m09-l01-p03"))).toContain(" هو البديل الأفضل والأكثر استخدامًا في الشبكات الحديثة بدل ");
    const sw = blockBy(pageBy("791381-m09-l01-p04"), "m09-l01-p04-points");
    expect(sw.type === "list" && sw.items.map(i => i.text.map(s => s.text).join(""))).toEqual(["يرسل البيانات إلى الجهاز المقصود فقط.", "يحفظ عناوين MAC للأجهزة.", "يقلل الازدحام داخل الشبكة.", "يزيد سرعة وأمان الاتصال."]);
    expect(plain(pageBy("791381-m09-l01-p04"))).toContain("غرفة حواسيب، مكتب، مدرسة أو شركة تحتاج اتصالًا سريعًا ومنظّمًا.");
    const f = blockBy(pageBy("791381-m09-l01-p05"), "m09-l01-p05-cards");
    expect(f.type === "list" && f.items.map(i => i.term)).toEqual(["دقة", "أداء", "توسيع", "إدارة", "أمان"]);
    expect(plain(pageBy("791381-m09-l01-p05"))).toContain(" يمكن اعتباره طريقًا خاصًا لجهاز معيّن، فلا تتزاحم البيانات.");
    const match = blockBy(pageBy("791381-m09-l01-p05"), "m09-l01-p05-match");
    if (match.type !== "practice-table") throw new Error("no matching practice");
    expect(match.origin).toBe("teacher-enrichment");
    expect(match.rows.map(r => sel(r[1]).key)).toEqual(["توسيع", "أمان", "دقة", "أداء"]);
  });
  it("PDF 54–56: Router bullets + example; the five characteristics + the IP-not-MAC reminder; the summary cards + the one-word rule", () => {
    const r = blockBy(pageBy("791381-m09-l02-p01"), "m09-l02-p01-points");
    expect(r.type === "list" && r.items.map(i => i.text.map(s => s.text).join(""))).toEqual(["يربط شبكة البيت أو المدرسة بالإنترنت.", "يختار الطريق المناسب للبيانات.", "يساعد في تنظيم حركة البيانات.", "قد يوزّع عناوين IP باستخدام DHCP."]);
    expect(plain(pageBy("791381-m09-l02-p01"))).toContain("راوتر البيت هو باب الشبكة إلى الإنترنت، تمرّ منه كل البيانات الخارجة.");
    const c = blockBy(pageBy("791381-m09-l02-p02"), "m09-l02-p02-cards");
    expect(c.type === "list" && c.items.map(i => i.term)).toEqual(["توجيه", "ربط", "NAT", "DHCP", "أمان"]);
    expect(plain(pageBy("791381-m09-l02-p02"))).toContain("الراوتر يعمل غالبًا في طبقة الشبكة، ويتعامل مع عناوين ");
    const s = blockBy(pageBy("791381-m09-l03-p01"), "m09-l03-p01-cards");
    expect(s.type === "list" && s.items.map(i => [i.term, i.text.map(x => x.text).join("")])).toEqual([["Hub", "يرسل للجميع"], ["Switch", "يرسل للمقصود فقط"], ["Router", "يربط الشبكات والإنترنت"]]);
    const one = blockBy(pageBy("791381-m09-l03-p01"), "m09-l03-p01-oneword");
    expect(one.type === "callout" && one.spans.map(x => x.text).join("")).toBe("Hub للجميع · Switch للمقصود · Router للخارج");
  });
});

describe("m09 — pedagogy + provenance + safety", () => {
  it("practices: 8 inline (incl. 3 exam-style on the summary), each with a key, «افحص» feedback and a hint ladder, all enrichment; 1 solved example with steps", () => {
    const practices = pages.flatMap(p => p.blocks.filter(b => b.type === "practice"));
    expect(practices.length).toBe(8);
    for (const b of practices) {
      if (b.type !== "practice") continue;
      expect(b.origin, b.id).toBe("teacher-enrichment");
      expect(b.question.feedback?.incorrectFeedback, b.id).toMatch(/افحص/);
      expect((b.question.feedback?.hints ?? []).length, b.id).toBeGreaterThanOrEqual(1);
      if (b.question.kind === "multipleChoice") expect(b.question.options.filter(o => o.correct).length, b.id).toBe(1);
    }
    expect(pageBy("791381-m09-l03-p01").blocks.filter(b => b.type === "practice").length).toBe(3);
    const ex = pages.flatMap(p => p.blocks.filter(b => b.type === "example"));
    expect(ex.length).toBe(1); expect(ex[0].type === "example" && ex[0].steps.length).toBe(3);
  });
  it("every book table/list/callout is origin book; the only activity is the simulation; device names are LTR tokens; no image/iframe/link", () => {
    for (const p of pages) for (const b of p.blocks) expect(["book", "teacher-enrichment"], b.id).toContain(b.origin);
    for (const id of ["m09-l01-p01-cards", "m09-l01-p03-table", "m09-l01-p05-cards", "m09-l02-p02-cards", "m09-l03-p01-cards", "m09-l03-p01-oneword"]) expect(pages.flatMap(p => p.blocks).find(b => b.id === id)!.origin, id).toBe("book");
    const acts = pages.flatMap(p => p.blocks.filter(b => ["simulation", "animation", "guided", "interactive-diagram"].includes(b.type)));
    expect(acts.map(a => a.id)).toEqual(["m09-l01-p01-sim"]);
    const json = JSON.stringify(m09);
    for (const tok of ["\"Hub\"", "\"Switch\"", "\"Router\"", "\"MAC\"", "\"IP\"", "\"DHCP\"", "\"LAN\""]) expect(json).toContain(tok);
    for (const banned of ["<iframe", ".pdf", "http", "<script", "من الكتاب"]) expect(json, banned).not.toContain(banned);
    expect(pages.some(p => p.blocks.some(b => b.type === "image" || b.type === "diagram"))).toBe(false);
  });
});
