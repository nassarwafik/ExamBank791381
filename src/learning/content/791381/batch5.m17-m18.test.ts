// Batch 5 phase — source-fidelity, mapping, provenance, pedagogy, SOURCE-ORDER and HARD-STOP guards for the book's
// sections «أمان الشبكات» (PDF 108–115, m17; PDF 107 is the part cover) and «تجزئة البيانات» (PDF 116–118 + the PDF 119
// end-of-batch trainings page, m18). PDF 120 is the «الدفعة الرابعة · برمجة السويتش و VLAN» cover: nothing from PDF 120+
// (switch CLI / VLAN programming) is ever converted here.
import { describe, it, expect } from "vitest";
import m01 from "./modules/m01";
import m02 from "./modules/m02";
import m07 from "./modules/m07";
import m08 from "./modules/m08";
import m09 from "./modules/m09";
import m10 from "./modules/m10";
import m11 from "./modules/m11";
import m12 from "./modules/m12";
import m13 from "./modules/m13";
import m14 from "./modules/m14";
import m15 from "./modules/m15";
import m16 from "./modules/m16";
import m17 from "./modules/m17";
import m18 from "./modules/m18";
import manifest from "./manifest";
import { hasModuleContent } from "../registry";
import { validateLearningCourseContent } from "../validation";
import { LEARNING_CONTENT_SCHEMA_VERSION, type LearningCourseContent, type ContentBlock, type ContentModule, type ContentPage, type PracticeTableSelectCell } from "../types";
// @ts-expect-error — the server registry is an untyped CommonJS module; it is imported here on purpose to cross-check it.
import * as apiRegistry from "../../../../api/src/lib/learning-materials-registry.js";

const PREV = [m01, m02, m07, m08, m09, m10, m11, m12, m13, m14, m15, m16];
const BATCH = [m17, m18];
const ALL = [...PREV, ...BATCH];
const course: LearningCourseContent = { schemaVersion: LEARNING_CONTENT_SCHEMA_VERSION, courseId: "791381", title: "شبكات الاتصال", direction: "rtl", modules: ALL };
const pagesOf = (m: ContentModule): ContentPage[] => [...m.lessons].sort((a, b) => a.order - b.order).flatMap(l => [...l.pages].sort((a, b) => a.order - b.order));
const pages = BATCH.flatMap(pagesOf);
const pageBy = (id: string): ContentPage => pages.find(p => p.id === id)!;
const blockBy = (p: ContentPage, id: string): ContentBlock => p.blocks.find(b => b.id === id)!;
const plain = (p: ContentPage): string => JSON.stringify(p.blocks);
const sel = (cell: unknown) => cell as PracticeTableSelectCell;
const allBlocks = pages.flatMap(p => p.blocks);
const NEXT_BATCH_PDF = 120;

const MAP: Record<string, [number, number | undefined, string]> = {
  "791381-m17-l01-p01": [108, 108, "القرصنة والهجمات على الشبكة"], "791381-m17-l01-p02": [109, 109, "DoS / DDoS"],
  "791381-m17-l01-p03": [110, 110, "Session Hijacking / MitM"], "791381-m17-l01-p04": [111, 111, "Phishing / Spoofing"],
  "791381-m17-l02-p01": [112, 112, "الاتصالات الآمنة"], "791381-m17-l02-p02": [113, 113, "VPN"],
  "791381-m17-l02-p03": [114, 114, "SSL / TLS و HTTPS"], "791381-m17-l02-p04": [115, 115, "SSH"],
  "791381-m18-l01-p01": [116, 116, "تجزئة البيانات في OSI"], "791381-m18-l01-p02": [117, 117, "Frame / Packet / Segment"],
  "791381-m18-l02-p01": [118, 118, "TCP 3-Way Handshake"], "791381-m18-l03-p01": [119, undefined, "تدريبات نهاية الدفعة"],
};

describe("Batch 5 — validation, mapping PDF 108–119, cover PDF 107, completeness, HARD STOP before PDF 120", () => {
  it("the WHOLE real course (m01 … m18) produces ZERO validation issues", () => {
    expect(validateLearningCourseContent(course)).toEqual([]);
  });
  it("maps the twelve learner pages 1:1 to PDF 108..119 (printed = PDF page circle 108–118; the PDF 119 trainings page prints none), in book order", () => {
    expect(pages.map(p => p.id).sort()).toEqual(Object.keys(MAP).sort());
    for (const [id, [pdf, printed, title]] of Object.entries(MAP)) {
      const p = pageBy(id);
      expect([p.source.kind, p.source.sourceId, p.source.pdfPageStart, p.source.pdfPageEnd, p.source.printedPage, p.title], id).toEqual(["book", "791381", pdf, undefined, printed, title]);
    }
    expect(pages.map(p => p.source.pdfPageStart)).toEqual(Array.from({ length: 12 }, (_, i) => 108 + i));
    expect([m17.source, m18.source].map(s => [s!.pdfPageStart, s!.pdfPageEnd])).toEqual([[107, 115], [116, 119]]);
  });
  it("PDF 107 (the part cover) is represented ONLY by m17's coarse source range + sourceNote — never as a learner page or an invented unit opener", () => {
    expect(m17.source!.sourceNote).toContain("PDF 107");
    expect(m17.source!.sourceNote).toContain("PDF 108");
    expect(pages.some(p => p.source.pdfPageStart === 107)).toBe(false);
    expect(allBlocks.some(b => b.type === "unit-opener")).toBe(false);
    expect(BATCH.some(m => m.lessons.some(l => l.id.endsWith("-l00")))).toBe(false);
    expect(JSON.stringify(BATCH)).not.toMatch(/الوحدة (التاسعة|العاشرة|الحادية عشرة|الثانية عشرة|الثالثة عشرة|الرابعة عشرة)|unitNumber/);
    expect(BATCH.map(m => [m.id, m.title, m.order, m.partial])).toEqual([["791381-m17", "أمان الشبكات", 13, undefined], ["791381-m18", "تجزئة البيانات", 14, undefined]]);
    expect(m17.lessons.map(l => [l.id, l.pages.length])).toEqual([["791381-m17-l01", 4], ["791381-m17-l02", 4]]);
    expect(m18.lessons.map(l => [l.id, l.pages.length])).toEqual([["791381-m18-l01", 2], ["791381-m18-l02", 1], ["791381-m18-l03", 1]]);
  });
  it("HARD STOP: every Batch-5 page < 120; the maximum pdfPageStart among ALL converted real bodies (m01–m18) is 119; every block source stays inside its module range; manifest ranges stop at 115 / 119", () => {
    for (const p of pages) expect(p.source.pdfPageStart, p.id).toBeLessThan(NEXT_BATCH_PDF);
    expect(Math.max(...ALL.flatMap(m => m.lessons.flatMap(l => l.pages.map(p => p.source.pdfPageStart))))).toBe(119);
    for (const m of BATCH) for (const p of pagesOf(m)) for (const b of p.blocks) if (b.source) {
      expect(b.source.pdfPageStart, b.id).toBeGreaterThanOrEqual(m.source!.pdfPageStart);
      expect(b.source.pdfPageEnd ?? b.source.pdfPageStart, b.id).toBeLessThanOrEqual(m.source!.pdfPageEnd!);
    }
    for (const [id, lo, hi] of [["791381-m17", 108, 115], ["791381-m18", 116, 119]] as const) {
      const mm = manifest.modules.find(m => m.id === id)!;
      const pdfs = mm.lessons.flatMap(l => l.pages.map(p => p.source!.pdfPageStart));
      expect([Math.min(...pdfs), Math.max(...pdfs)], id).toEqual([lo, hi]);
    }
    expect(m18.source!.sourceNote).toContain("PDF 120");
  });
  it("HARD STOP (content): nothing from PDF 120+ leaks — switch CLI / VLAN programming, Trunk, Dot1Q, VTP, port names, Router on a Stick — and no invented attack mechanics", () => {
    const json = JSON.stringify(BATCH);
    expect(json).not.toMatch(/\bVLAN\b|Trunk|Dot1Q|\bVTP\b|Router on a Stick|configure terminal|Switch\(config\)|Switch>|Switch#|\benable\b|\bF0\/\d|\bG0\/\d|\bAccess\b|برمجة السويتش|switchport|\bCLI\b/);
    // the book's level only: no attack tooling / mechanics, no ports, no certificates, no keys beyond «مفاتيح تشفير»
    expect(json).not.toMatch(/botnet|بوت نت|packet sniffer|Wireshark|nmap|شهادة|certificate|منفذ 443|port 443|port \d+|SYN flood|إعادة تعيين|\bRST\b|\bFIN\b|sequence number|رقم تسلسل/i);
  });
});

describe("Batch 5 — SOURCE ORDER inside the batch (no concept before the book introduces it)", () => {
  const P = (id: string) => plain(pageBy(id));
  it("m17 introduces attacks page by page: PDF 108 names none; 109 only DoS/DDoS; 110 adds Session Hijacking/MitM; 111 adds Phishing/Spoofing", () => {
    expect(P("791381-m17-l01-p01")).not.toMatch(/\bDoS\b|DDoS|Hijack|اختطاف|MitM|الرجل في الوسط|Phishing|Spoofing|تزييف/);
    expect(P("791381-m17-l01-p02")).not.toMatch(/Hijack|اختطاف|MitM|الرجل في الوسط|Phishing|Spoofing|تزييف/);
    expect(P("791381-m17-l01-p03")).not.toMatch(/Phishing|Spoofing|تزييف/);
  });
  it("secure-communication tools follow the book: VPN appears on PDF 110 only because «الوقاية» prints it, then from 112; SSL/TLS not before 112; SSH in m17 only on 112 and 115; nothing from «تجزئة البيانات» in m17", () => {
    const vpn = pagesOf(m17).filter(p => /\bVPN\b/.test(plain(p))).map(p => p.source.pdfPageStart);
    expect(vpn).toEqual([110, 112, 113, 115]);
    const ssl = pagesOf(m17).filter(p => /SSL|TLS/.test(plain(p))).map(p => p.source.pdfPageStart);
    expect(ssl).toEqual([112, 114, 115]);
    const ssh = pagesOf(m17).filter(p => /\bSSH\b/.test(plain(p))).map(p => p.source.pdfPageStart);
    expect(ssh).toEqual([112, 115]);
    expect(JSON.stringify(m17)).not.toMatch(/Segment|Handshake|\bSYN\b|\bACK\b|تجزئة|غلاف|أرقام المنافذ/);
  });
  it("m18 names no attack or security tool; the PDF 117 field families are not on PDF 116; SYN/SYN-ACK/ACK appear only from PDF 118", () => {
    expect(JSON.stringify(m18)).not.toMatch(/\bDoS\b|DDoS|Hijack|MitM|Phishing|Spoofing|\bVPN\b|\bSSL\b|\bTLS\b|\bSSH\b|هجوم|هجمات|القرصنة|تشفير/);
    expect(P("791381-m18-l01-p01")).not.toMatch(/المنافذ|التدفّق|فحص الأخطاء|معلومات التوجيه|SYN|ACK|Handshake/);
    expect(P("791381-m18-l01-p02")).not.toMatch(/SYN|ACK|Handshake|مصافحة/);
    expect(pagesOf(m18).filter(p => /\bSYN\b|SYN-ACK|\bACK\b/.test(plain(p))).map(p => p.source.pdfPageStart)).toEqual([118, 119]);   // 119 = the closing review
  });
});

describe("Batch 5 — key source facts as printed", () => {
  const cardText = (pid: string, bid: string) => { const c = blockBy(pageBy(pid), bid); return c.type === "list" ? c.items.map(i => [i.term, i.text.map(s => s.text).join("")]) : null; };
  const spans = (pid: string, bid: string) => { const b = blockBy(pageBy(pid), bid); return b.type === "callout" || b.type === "text" ? b.spans.map(s => s.text).join("") : ""; };
  it("PDF 108–111: definition, facts, «المطلوب للطالب», every attack card sentence, «الفرق» / «الوقاية» / «احذر»", () => {
    expect(spans("791381-m17-l01-p01", "m17-l01-p01-def")).toBe("هي محاولات غير قانونية للوصول إلى الشبكة أو تعطيلها.");
    expect(spans("791381-m17-l01-p01", "m17-l01-p01-required")).toBe("اسم الهجوم + فكرته الأساسية، دون الدخول في تفاصيل تقنية.");
    expect(cardText("791381-m17-l01-p02", "m17-l01-p02-cards")).toEqual([["DoS", "إغراق الخادم بطلبات كثيرة من مصدر واحد حتى يتوقّف أو يبطؤ."], ["DDoS", "نفس الفكرة، لكن الهجوم يأتي من أجهزة كثيرة في نفس الوقت."]]);
    expect(spans("791381-m17-l01-p02", "m17-l01-p02-diff")).toBe("DoS من مصدر واحد، و DDoS موزّع من أجهزة كثيرة — وهو أصعب في الإيقاف.");
    expect(cardText("791381-m17-l01-p03", "m17-l01-p03-cards")).toEqual([["اختطاف الجلسة", "المهاجم يسيطر على جلسة اتصال مفتوحة بين المستخدم والخادم."], ["الرجل في الوسط MitM", "المهاجم يقف بين الطرفين ويعترض البيانات وقد يغيّرها."]]);
    expect(spans("791381-m17-l01-p03", "m17-l01-p03-prevent")).toBe("التشفير (HTTPS و VPN) يجعل اعتراض البيانات أو اختطاف الجلسة أصعب بكثير.");
    expect(cardText("791381-m17-l01-p04", "m17-l01-p04-cards")).toEqual([["Phishing", "خداع المستخدم بموقع أو رسالة تشبه جهة حقيقية للحصول على معلوماته."], ["Spoofing", "تزييف عنوان IP أو بريد إلكتروني حتى يبدو وكأنه من جهة موثوقة."]]);
    expect(spans("791381-m17-l01-p04", "m17-l01-p04-warn")).toBe("لا تثق بأي رابط أو رسالة قبل التأكّد من المصدر؛ كثير من الهجمات تبدأ بخداع بسيط.");
  });
  it("PDF 112–115: the secure-communication facts, «الأمان يعني», VPN «متى نستعمله؟», the HTTPS and SSH «تذكّر» boxes", () => {
    expect(spans("791381-m17-l02-p01", "m17-l02-p01-means")).toBe("حماية البيانات + التأكّد من هوية الطرف الآخر معًا.");
    const f = blockBy(pageBy("791381-m17-l02-p02"), "m17-l02-p02-facts");
    expect(f.type === "list" && f.items.map(i => i.text.map(s => s.text).join(""))).toEqual(["ينشئ اتصالًا آمنًا عبر الإنترنت.", "يشفّر البيانات أثناء انتقالها.", "يخفي عنوان IP الحقيقي جزئيًا.", "مفيد للعمل عن بُعد والشبكات العامة."]);
    expect(spans("791381-m17-l02-p02", "m17-l02-p02-when")).toBe("عند العمل عن بُعد أو استخدام شبكات Wi-Fi عامة غير موثوقة.");
    const g = blockBy(pageBy("791381-m17-l02-p03"), "m17-l02-p03-facts");
    expect(g.type === "list" && g.items.map(i => i.text.map(s => s.text).join(""))).toEqual(["SSL/TLS يشفّر الاتصال بين المتصفح والخادم.", "HTTPS هو HTTP مع طبقة أمان.", "علامة القفل في المتصفح تعني اتصالًا آمنًا.", "يساعد على منع التجسّس والتلاعب بالبيانات."]);
    expect(spans("791381-m17-l02-p03", "m17-l02-p03-remember")).toBe("اكتب HTTPS بدل HTTP عند الحديث عن المواقع الآمنة.");
    const h = blockBy(pageBy("791381-m17-l02-p04"), "m17-l02-p04-facts");
    expect(h.type === "list" && h.items.map(i => i.text.map(s => s.text).join(""))).toEqual(["اتصال آمن لإدارة الأجهزة عن بُعد.", "يشفّر البيانات أثناء النقل.", "أكثر أمانًا من Telnet.", "يستخدم كلمة مرور أو مفاتيح تشفير."]);
    expect(spans("791381-m17-l02-p04", "m17-l02-p04-remember")).toBe("SSH آمن، و Telnet غير آمن — فضّل SSH دائمًا.");
  });
  it("PDF 116–118: the stack table, «احفظ», the three PDU cards with field families, «الترتيب» as prose, the handshake idea / steps / summary", () => {
    const t = blockBy(pageBy("791381-m18-l01-p01"), "m18-l01-p01-stack");
    expect(t.type === "table" && [t.origin, t.rows]).toEqual(["book", [["—", "Data (البيانات)"], ["Transport", "Segment"], ["Network", "Packet"], ["Data Link", "Frame"]]]);
    expect(spans("791381-m18-l01-p01", "m18-l01-p01-memo")).toBe("Transport = Segment · Network = Packet · Data Link = Frame.");
    const c = blockBy(pageBy("791381-m18-l01-p02"), "m18-l01-p02-cards");
    expect(c.type === "list" && c.items.map(i => [i.term, i.text.map(s => s.text).join(""), i.note])).toEqual([
      ["Segment", "في طبقة النقل. يحتوي أرقام المنافذ والتحكّم بالتدفّق.", "Transport Layer: منافذ · تحكّم · بيانات"],
      ["Packet", "في طبقة الشبكة. يحتوي IP المصدر والهدف ومعلومات التوجيه.", "Network Layer: مصدر IP · هدف IP · بيانات"],
      ["Frame", "في طبقة ربط البيانات. يحتوي MAC المصدر والهدف وفحص الأخطاء.", "Data Link Layer: MAC · بيانات · فحص"],
    ]);
    expect(spans("791381-m18-l01-p02", "m18-l01-p02-order")).toBe("تنزل البيانات من Segment إلى Packet ثم إلى Frame، وكل طبقة تضيف معلوماتها قبل الإرسال.");
    expect(spans("791381-m18-l02-p01", "m18-l02-p01-idea")).toBe("عملية من 3 خطوات لإنشاء اتصال موثوق قبل تبادل أي بيانات.");
    const st = blockBy(pageBy("791381-m18-l02-p01"), "m18-l02-p01-steps");
    expect(st.type === "list" && [st.origin, st.variant, st.items.map(i => [i.term, i.text.map(s => s.text).join("")])]).toEqual(["book", "ordered", [["SYN", "الجهاز الأول يطلب بدء الاتصال."], ["SYN-ACK", "الجهاز الثاني يوافق ويردّ."], ["ACK", "الجهاز الأول يؤكّد، ثم يبدأ تبادل البيانات."]]]);
    expect(spans("791381-m18-l02-p01", "m18-l02-p01-summary")).toBe("الطرفان يتأكّدان أن الاتصال جاهز قبل إرسال البيانات الفعلية.");
  });
  it("PDF 119 is a learner-visible CLOSING page: the QR line, the three training cards and «الدفعة التالية» as printed, a conversionNote, the Learning-Practice cards T13–T18 (metadata only), no printed page, then the section review", () => {
    const p = pageBy("791381-m18-l03-p01");
    expect(p.source.printedPage).toBeUndefined();
    expect(p.conversionNote).toMatch(/PDF 119/);
    expect(p.conversionNote).toMatch(/QR/);
    expect(spans("791381-m18-l03-p01", "m18-l03-p01-lead")).toBe("امسح الرمز للوصول إلى التدريبات.");
    expect(cardText("791381-m18-l03-p01", "m18-l03-p01-cards")).toEqual([["تدريب 13–14", "OSI و TCP/IP."], ["تدريب 15–16", "البروتوكولات والأوامر."], ["تدريب 17–18", "المجالات والأمان والتجزئة."]]);
    expect(spans("791381-m18-l03-p01", "m18-l03-p01-next")).toBe("مشاريع وتطبيقات عملية على ما تعلّمته في هذه الدفعة.");
    expect(allBlocks.filter(b => b.type === "library-training").map(b => b.trainingId)).toEqual(["T13", "T14", "T15", "T16", "T17", "T18"]);   // since the Learning-Practice phase
    expect(JSON.stringify(BATCH)).not.toMatch(/LIB-T|examSnapshot|correctOptionIndex|github\.io/);   // the T13–T18 pointers are metadata only
    expect(p.blocks.map(b => b.id).slice(-4)).toEqual(["m18-l03-p01-review", "m18-l03-p01-r1", "m18-l03-p01-r2", "m18-l03-p01-r3"]);
  });
});

describe("Batch 5 — the ONE activity: interactive-diagram/tcp-handshake/v1 on PDF 118, after the book's idea, steps and summary", () => {
  const acts = allBlocks.filter(b => ["simulation", "animation", "guided", "interactive-diagram"].includes(b.type));
  it("exactly one activity block across the two modules; enrichment origin; source PDF 118 (printed 118)", () => {
    expect(acts.map(b => [b.id, b.type])).toEqual([["m18-l02-p01-stepper", "interactive-diagram"]]);
    const a = acts[0];
    expect(a.type === "interactive-diagram" && [a.interactionType, a.version, a.origin, a.source?.pdfPageStart, a.source?.printedPage, a.capabilities]).toEqual(["tcp-handshake", 1, "teacher-enrichment", 118, 118, { fullscreen: true, reset: true, interactive: true }]);
  });
  it("sits AFTER «الفكرة», the three steps and «الخلاصة», BEFORE the page's practices; no activity in m17 or on PDF 116–117", () => {
    const idx = pageBy("791381-m18-l02-p01").blocks.map(b => b.id);
    const at = idx.indexOf("m18-l02-p01-stepper");
    for (const before of ["m18-l02-p01-idea", "m18-l02-p01-steps", "m18-l02-p01-summary"]) expect(idx.indexOf(before), before).toBeLessThan(at);
    for (const after of ["m18-l02-p01-q1", "m18-l02-p01-q2", "m18-l02-p01-q3"]) expect(idx.indexOf(after), after).toBeGreaterThan(at);
    expect(pagesOf(m17).some(p => p.blocks.some(b => b.type === "interactive-diagram"))).toBe(false);
  });
  it("config = the book's three steps in order with their senders and sentences; the fallback states the same steps", () => {
    const a = acts[0] as { config?: { steps: { label: string; from: string; text: string }[]; summary: string }; fallback?: { text?: string } };
    expect(a.config!.steps).toEqual([{ label: "SYN", from: "first", text: "الجهاز الأول يطلب بدء الاتصال." }, { label: "SYN-ACK", from: "second", text: "الجهاز الثاني يوافق ويردّ." }, { label: "ACK", from: "first", text: "الجهاز الأول يؤكّد، ثم يبدأ تبادل البيانات." }]);
    expect(a.config!.summary).toBe("الطرفان يتأكّدان أن الاتصال جاهز قبل إرسال البيانات الفعلية.");
    for (const n of ["1) SYN", "2) SYN-ACK", "3) ACK"]) expect(a.fallback?.text, n).toContain(n);
  });
});

describe("Batch 5 — pedagogy: worksheets, solved examples, practices with «افحص» feedback, closing reviews", () => {
  const practices = allBlocks.filter(b => b.type === "practice");
  it("26 inline practices (m17 17 · m18 9), interactive kinds only, each with 2 hints, «افحص» incorrect feedback and an explanation; every page ends with practice; deterministic shortInput answers", () => {
    expect(BATCH.map(m => pagesOf(m).flatMap(p => p.blocks.filter(b => b.type === "practice")).length)).toEqual([17, 9]);
    for (const b of practices) {
      if (b.type !== "practice") continue;
      expect(b.origin, b.id).toBe("teacher-enrichment");
      expect(["multipleChoice", "trueFalse", "shortInput"], b.id).toContain(b.question.kind);
      const fb = b.question.feedback!;
      expect(fb.hints?.length, b.id).toBe(2);
      expect(fb.incorrectFeedback, b.id).toMatch(/افحص/);
      expect(fb.correctFeedback && fb.explanation, b.id).toBeTruthy();
      if (b.question.kind === "multipleChoice") expect(b.question.options.filter(o => o.correct).length, b.id).toBe(1);
      if (b.question.kind === "shortInput") expect(String(b.question.answer), b.id).toMatch(/^[A-Za-z0-9.]+$/);
    }
    for (const p of pages) expect(p.blocks.at(-1)?.type, p.id).toBe("practice");
  });
  it("three keyed worksheets: attack → name (PDF 111), tool → purpose (PDF 115), description → Segment/Packet/Frame (PDF 117)", () => {
    const tables = allBlocks.filter(b => b.type === "practice-table");
    expect(tables.map(b => b.id)).toEqual(["m17-l01-p04-match", "m17-l02-p04-match", "m18-l01-p02-match"]);
    const t1 = blockBy(pageBy("791381-m17-l01-p04"), "m17-l01-p04-match");
    expect(t1.type === "practice-table" && t1.rows.map(r => sel(r[1]).key)).toEqual(["DoS", "MitM", "Spoofing", "DDoS", "Phishing", "Session Hijacking"]);
    const t2 = blockBy(pageBy("791381-m17-l02-p04"), "m17-l02-p04-match");
    expect(t2.type === "practice-table" && t2.rows.map(r => sel(r[1]).key)).toEqual(["VPN", "SSH", "SSL/TLS", "HTTPS"]);
    const t3 = blockBy(pageBy("791381-m18-l01-p02"), "m18-l01-p02-match");
    expect(t3.type === "practice-table" && t3.rows.map(r => sel(r[1]).key)).toEqual(["Frame", "Segment", "Packet", "Frame", "Segment"]);
    expect(t3.type === "practice-table" && t3.rows.every(r => JSON.stringify(sel(r[1]).options) === JSON.stringify(["Segment", "Packet", "Frame"]))).toBe(true);
  });
  it("two solved examples and eight clarifications, all enrichment; one closing review (r1–r3) per module on the module's last page", () => {
    expect(allBlocks.filter(b => b.type === "example").map(b => [b.id, b.type === "example" && b.mode, b.origin])).toEqual([["m17-l01-p04-ex1", "solved", "teacher-enrichment"], ["m18-l01-p02-ex1", "solved", "teacher-enrichment"]]);
    expect(allBlocks.filter(b => b.type === "callout" && b.kind === "clarification").length).toBe(8);
    for (const m of BATCH) {
      const last = pagesOf(m).at(-1)!;
      expect(last.blocks.map(b => b.id).slice(-4).map(id => id.replace(/^m1\d-l\d\d-p\d\d-/, "")), m.id).toEqual(["review", "r1", "r2", "r3"]);
      expect(pagesOf(m).flatMap(p => p.blocks).filter(b => /-r\d$/.test(b.id)).length, m.id).toBe(3);
    }
  });
});

describe("Batch 5 — provenance, RTL/LTR, safety, skeletons and registry consistency", () => {
  it("book-derived blocks are origin:book; every practice/example/worksheet/activity/clarification/heading is enrichment (m17 17 · m18 12 book blocks)", () => {
    for (const b of allBlocks) {
      if (["practice", "practice-table", "example", "interactive-diagram", "heading"].includes(b.type) || (b.type === "callout" && b.kind === "clarification")) expect(b.origin, b.id).toBe("teacher-enrichment");
      else expect(b.origin, b.id).toBe("book");
    }
    expect(BATCH.map(m => pagesOf(m).flatMap(p => p.blocks).filter(b => b.origin === "book").length)).toEqual([17, 18]);   // m18 +6 book pointers (T13–T18) since the Learning-Practice phase
  });
  it("technical tokens are LTR spans; no arrow glyphs (the book's PDF 117 arrows are prose here), no urls / iframes / images", () => {
    const spans = allBlocks.flatMap(b => b.type === "callout" || b.type === "text" ? b.spans : b.type === "list" ? b.items.flatMap(i => i.text) : []);
    const ltr = spans.filter(s => s.dir === "ltr").map(s => s.text);
    for (const tok of ["HTTPS", "VPN", "IP", "SSL/TLS", "SSH", "Telnet", "HTTP", "Wi-Fi", "Segment", "Packet", "Frame", "MAC", "TCP", "SYN-ACK", "OSI", "TCP/IP", "Transport = Segment"]) expect(ltr, tok).toContain(tok);
    for (const s of spans.filter(s => s.dir !== "ltr")) expect(s.text, s.text).not.toMatch(/^(DoS|DDoS|MitM|VPN|SSL|TLS|SSH|HTTPS|HTTP|IP|MAC|TCP|SYN|ACK|Segment|Packet|Frame)$/);
    const json = JSON.stringify(BATCH);
    for (const banned of ["<iframe", ".pdf", "http://", "https://", "<script", ".png", ".svg", "←", "→", "⇐", "⇒", "⇢", "⇠"]) expect(json, banned).not.toContain(banned);
  });
  it("ids are prefix-scoped and unique; earlier modules keep their ranges (m16 = 98–106, whole PREV max 106)", () => {
    const ids = allBlocks.map(b => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^m1[78]-l0[1-3]-p0[1-4]-/);
    expect(m16.source).toMatchObject({ pdfPageStart: 98, pdfPageEnd: 106 });
    expect(Math.max(...PREV.flatMap(m => m.lessons.flatMap(l => l.pages.map(p => p.source.pdfPageStart))))).toBe(106);
  });
  it("historical m03 / m04 (completed in place by Batches 6 / 7) keep their historical pages' ids, titles and PDF mappings; skeletons m05–m06 are untouched; orders 15–22; b3 lists m13 … m18; b6 unchanged", () => {
    const byId = Object.fromEntries(manifest.modules.map(m => [m.id, m]));
    expect(["791381-m03", "791381-m19", "791381-m04", "791381-m20", "791381-m21", "791381-m22", "791381-m23", "791381-m24", "791381-m05", "791381-m25", "791381-m26", "791381-m27", "791381-m06"].map(id => byId[id].order)).toEqual([15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27]);   // Batch 10 added m25–m27 and completed m06 in place
    expect(byId["791381-m03"].lessons[0].pages.filter(p => /-p0[12]$/.test(p.id)).map(p => [p.id, p.title, p.source!.pdfPageStart, p.source!.printedPage])).toEqual([["791381-m03-l01-p01", "منافذ السويتش", 123, 121], ["791381-m03-l01-p02", "برمجة المنافذ من CLI", 124, 122]]);
    expect(byId["791381-m04"].lessons[0].pages.filter(p => /-p01$/.test(p.id)).map(p => [p.id, p.source!.pdfPageStart, p.source!.printedPage])).toEqual([["791381-m04-l01-p01", 148, 146]]);
    expect(byId["791381-m06"].lessons[0].pages.map(p => [p.id, p.source!.pdfPageStart, p.source!.printedPage])).toEqual([["791381-m06-l01-p02", 223, 223], ["791381-m06-l01-p03", 224, 224], ["791381-m06-l01-p04", 225, 225], ["791381-m06-l01-p05", 226, 226], ["791381-m06-l01-p01", 227, 225]]);   // m06 completed in place by Batch 10; the historical page keeps its mapping
    expect(["791381-m03", "791381-m19", "791381-m04", "791381-m05", "791381-m06"].map(id => hasModuleContent("791381", id))).toEqual([true, true, true, true, true]);   // m05 completed in place by Batch 9, m06 by Batch 10
    expect(manifest.batches!.find(b => b.id === "b3")!.moduleIds).toEqual(["791381-m13", "791381-m14", "791381-m15", "791381-m16", "791381-m17", "791381-m18"]);
    expect(manifest.batches!.find(b => b.id === "b4")!.moduleIds).toEqual(["791381-m03", "791381-m19", "791381-m04"]);   // Batch 9 moved m05 (the book's fifth-batch section) into b5
    expect(manifest.batches!.find(b => b.id === "b6")!.moduleIds).toEqual(["791381-m25", "791381-m26", "791381-m27", "791381-m06"]);   // Batch 10 filled the sixth-batch grouping
  });
  it("FRONTEND ↔ SERVER registry consistency: every manifest module WITH a body is in the server publication registry with the same title and order (and only those); the manifest page ids equal the body page ids", () => {
    const withBody = manifest.modules.filter(m => hasModuleContent("791381", m.id)).map(m => ({ moduleId: m.id, title: m.title, order: m.order }));
    const server = (apiRegistry as unknown as { listLearningModules: (c: string) => { moduleId: string; title: string; order: number }[] }).listLearningModules("791381");
    expect(server).toEqual([...withBody].sort((a, b) => a.order - b.order));
    expect(server.map(m => m.moduleId)).toEqual(expect.arrayContaining(["791381-m17", "791381-m18"]));
    for (const m of BATCH) expect(manifest.modules.find(x => x.id === m.id)!.lessons.flatMap(l => l.pages.map(p => p.id)).sort()).toEqual(pagesOf(m).map(p => p.id).sort());
  });
});
