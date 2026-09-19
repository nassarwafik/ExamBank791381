// Units 7–8 phase — source-fidelity, mapping, provenance, pedagogy and hard-stop guards for Unit 7 «الكوابل وعنوان
// MAC» (PDF 61–65) as stable module m11. PDF 66 (Unit 8) belongs to m12; PDF 76+ (batch 3) is never converted.
import { describe, it, expect } from "vitest";
import m01 from "./modules/m01";
import m02 from "./modules/m02";
import m07 from "./modules/m07";
import m08 from "./modules/m08";
import m09 from "./modules/m09";
import m10 from "./modules/m10";
import m11 from "./modules/m11";
import manifest from "./manifest";
import { validateLearningCourseContent } from "../validation";
import { LEARNING_CONTENT_SCHEMA_VERSION, type LearningCourseContent, type ContentBlock, type ContentPage, type PracticeTableSelectCell } from "../types";

const course: LearningCourseContent = { schemaVersion: LEARNING_CONTENT_SCHEMA_VERSION, courseId: "791381", title: "شبكات الاتصال", direction: "rtl", modules: [m01, m02, m07, m08, m09, m10, m11] };
const pages = m11.lessons.flatMap(l => l.pages);
const pageBy = (id: string): ContentPage => pages.find(p => p.id === id)!;
const blockBy = (p: ContentPage, id: string): ContentBlock => p.blocks.find(b => b.id === id)!;
const plain = (p: ContentPage): string => JSON.stringify(p.blocks);
const sel = (cell: unknown) => cell as PracticeTableSelectCell;
const MAC = "A0:02:AF:2D:10:22";
const BCAST = "FF:FF:FF:FF:FF:FF";

const MAP: Record<string, [number, number | undefined, string]> = {
  "791381-m11-l00-p01": [61, undefined, "الكوابل وعنوان MAC"],
  "791381-m11-l01-p01": [62, 62, "الكوابل المستعملة في الشبكات"],
  "791381-m11-l01-p02": [63, 63, "أنواع أخرى من الكوابل"],
  "791381-m11-l02-p01": [64, 64, "عنوان MAC Address"],
  "791381-m11-l02-p02": [65, 65, "استخدامات MAC Address"],
};

describe("m11 — validation, mapping PDF 61–65, completeness, HARD STOP before PDF 66", () => {
  it("the WHOLE real course (m01 … m11) produces ZERO validation issues", () => {
    expect(validateLearningCourseContent(course)).toEqual([]);
  });
  it("maps the five Unit-7 pages 1:1 to PDF 61..65 with the RENDERED page-circle numbers (62–65; the opener prints none)", () => {
    expect(pages.map(p => p.id).sort()).toEqual(Object.keys(MAP).sort());
    for (const [id, [pdf, printed, title]] of Object.entries(MAP)) {
      const p = pageBy(id);
      expect([p.source.sourceId, p.source.pdfPageStart, p.source.printedPage, p.source.pdfPageEnd, p.title], id).toEqual(["791381", pdf, printed, undefined, title]);
    }
    const ordered = [...m11.lessons].sort((a, b) => a.order - b.order).flatMap(l => [...l.pages].sort((a, b) => a.order - b.order));
    expect(ordered.map(p => p.source.pdfPageStart)).toEqual([61, 62, 63, 64, 65]);
    expect(m11.source).toEqual({ kind: "book", sourceId: "791381", pdfPageStart: 61, pdfPageEnd: 65 });
  });
  it("HARD STOP: no m11 page reaches PDF 66; Unit-8 wording (Unicast / Multicast / أنواع الرسائل) is absent from m11", () => {
    for (const p of pages) expect(p.source.pdfPageStart, p.id).toBeLessThan(66);
    for (const banned of ["Unicast", "Multicast", "أنواع الرسائل", "الوحدة الثامنة", "ARP", "DHCP", "وحدات التخزين"]) expect(JSON.stringify(m11), banned).not.toContain(banned);
  });
  it("m11 is COMPLETE: manifest ↔ body match; order 7; lessons l00/l01/l02 as specified", () => {
    const mm = manifest.modules.find(m => m.id === "791381-m11")!;
    expect(mm.order).toBe(7); expect(m11.order).toBe(7); expect(m11.partial).toBeFalsy();
    expect(mm.lessons.flatMap(l => l.pages.map(p => p.id)).sort()).toEqual(pages.map(p => p.id).sort());
    expect(m11.lessons.map(l => [l.id, l.title])).toEqual([["791381-m11-l00", "افتتاحية الوحدة"], ["791381-m11-l01", "كوابل الشبكة"], ["791381-m11-l02", "عنوان MAC واستخداماته"]]);
    for (const l of mm.lessons) {
      const body = m11.lessons.find(x => x.id === l.id)!;
      expect([body.order, body.title], l.id).toEqual([l.order, l.title]);
      for (const p of l.pages) { const bp = pageBy(p.id); expect([bp.order, bp.title, bp.source.pdfPageStart, bp.source.printedPage], p.id).toEqual([p.order, p.title, p.source!.pdfPageStart, p.source!.printedPage]); }
    }
  });
});

describe("m11 — key source facts (rendered PDF 61–65)", () => {
  it("PDF 61 opener; PDF 62 definition, UTP/STP cards and the rule", () => {
    const o = blockBy(pageBy("791381-m11-l00-p01"), "m11-l00-p01-opener");
    expect(o.type === "unit-opener" && [o.unitLabel, o.unitNumber, o.title, o.subtitle]).toEqual(["الوحدة السابعة", "07", "الكوابل وعنوان MAC", "كيف تنتقل البيانات؟ وما هو العنوان الفيزيائي للجهاز؟"]);
    const p = pageBy("791381-m11-l01-p01");
    expect(plain(p)).toContain("الكوابل هي الطريق الذي تنتقل عبره البيانات بين الأجهزة.");
    const c = blockBy(p, "m11-l01-p01-cards");
    expect(c.type === "list" && c.items.map(i => [i.term, i.text.map(s => s.text).join("")])).toEqual([["UTP", "زوج ملتوي غير محمي. شائع ورخيص."], ["STP", "زوج ملتوي محمي. أفضل ضد التشويش."]]);
    expect(plain(p)).toContain("كلما زادت الحماية والجودة، كان الكابل أفضل ضد التشويش وفقدان البيانات.");
    expect(plain(p)).toContain("طبقة حماية معدنية");
  });
  it("PDF 63 Fiber Optic / Coaxial cards + the light info; the cable chooser sits AFTER all four cables and covers exactly them", () => {
    const p = pageBy("791381-m11-l01-p02");
    const c = blockBy(p, "m11-l01-p02-cards");
    expect(c.type === "list" && c.items.map(i => [i.term, i.text.map(s => s.text).join("")])).toEqual([["Fiber Optic", "ألياف بصرية. سرعة عالية جدًا ومسافات طويلة."], ["Coaxial", "كابل محوري. يُستعمل في التلفزيون والإنترنت عبر الكابل."]]);
    expect(plain(p)).toContain("الألياف البصرية تستعمل الضوء لنقل البيانات، لذلك سرعتها عالية جدًا.");
    const a = blockBy(p, "m11-l01-p02-chooser");
    expect(a.type === "interactive-diagram" && [a.interactionType, a.version, a.origin, a.source?.pdfPageStart]).toEqual(["cable-comparison", 1, "teacher-enrichment", 63]);
    const cfg = (a as { config?: { cables?: { id: string; name: string; traits: string[] }[]; scenarios?: { answer: string }[] } }).config!;
    expect(cfg.cables!.map(x => x.name)).toEqual(["UTP", "STP", "Fiber Optic", "Coaxial"]);
    expect(cfg.scenarios!.map(x => x.answer).sort()).toEqual(["coaxial", "fiber", "stp", "utp"]);
    // no invented specs: no categories, speeds or distance figures
    expect(JSON.stringify(cfg)).not.toMatch(/Cat ?[5-8]|Gbps|Mbps|\d+ ?م(تر)?\b|km/);
    const fb = (a as { fallback?: { text?: string } }).fallback?.text ?? "";
    expect(fb).toMatch(/UTP.*STP.*Fiber Optic.*Coaxial/s);
  });
  it("PDF 64 MAC facts (physical / ~unique / 12 hex digits / OSI layer 2 / Switch), the exact example MAC and the exact broadcast MAC", () => {
    const p = pageBy("791381-m11-l02-p01");
    expect(plain(p)).toContain("هو رقم فيزيائي خاص بكرت الشبكة.");
    const f = blockBy(p, "m11-l02-p01-facts");
    expect(f.type === "list" && f.items.map(i => i.text.map(s => s.text).join(""))).toEqual(["يكون فريدًا لكل جهاز تقريبًا.", "يتكوّن من 12 منزلة سداسية عشرية.", "يعمل في الطبقة الثانية من نموذج OSI.", "يستخدمه Switch لمعرفة الجهاز المقصود."]);
    const code = blockBy(p, "m11-l02-p01-example");
    expect(code.type === "code" && [code.code, code.dir, code.origin]).toEqual([MAC, "ltr", "book"]);
    const b = blockBy(p, "m11-l02-p01-bcast");
    expect(b.type === "callout" && b.spans.map(s => s.text).join("")).toBe(`عنوان Broadcast في MAC هو: ${BCAST}`);
    expect(b.type === "callout" && b.spans.find(s => s.text === BCAST)?.dir).toBe("ltr");
    const a = blockBy(p, "m11-l02-p01-anatomy");
    expect(a.type === "interactive-diagram" && [a.interactionType, a.version, a.origin]).toEqual(["mac-address-anatomy", 1, "teacher-enrichment"]);
    const cfg = (a as { config?: { example?: string; broadcast?: string; task?: { candidates: { value: string }[] } } }).config!;
    expect([cfg.example, cfg.broadcast]).toEqual([MAC, BCAST]);
    expect(cfg.task!.candidates.map(c => c.value)).toContain(MAC);
    // book level: no OUI / vendor / locally-administered wording anywhere in the module
    expect(JSON.stringify(m11)).not.toMatch(/OUI|vendor|الشركة المصنّعة|locally/i);
  });
  it("PDF 65 the five MAC-use cards in book order and the IP-changes / MAC-stable reminder", () => {
    const p = pageBy("791381-m11-l02-p02");
    const u = blockBy(p, "m11-l02-p02-uses");
    expect(u.type === "list" && u.items.map(i => i.term)).toEqual(["تمييز الأجهزة", "توجيه البيانات", "الأمان", "إدارة الشبكة", "الجدار الناري"]);
    expect(u.type === "list" && u.items.map(i => i.text.map(s => s.text).join(""))).toEqual(["يساعد على معرفة الجهاز داخل الشبكة.", "Switch يستعمله لإرسال البيانات للمقصود.", "يمكن منع أجهزة غير مسموحة.", "يساعد في تتبّع الأجهزة وتنظيمها.", "قد يُستعمل للتحكم بالوصول."]);
    const r = blockBy(p, "m11-l02-p02-remember");
    expect(r.type === "callout" && r.spans.map(s => s.text).join("")).toBe("عنوان IP قد يتغيّر، لكن MAC غالبًا ثابت لأنه مرتبط بكرت الشبكة نفسه.");
  });
});

describe("m11 — SOURCE ORDER: PDF 64 names the broadcast MAC, it does NOT teach who receives a broadcast (that is Unit 8, PDF 67–69)", () => {
  const p64 = pageBy("791381-m11-l02-p01");
  const p65 = pageBy("791381-m11-l02-p02");
  const FUTURE = /الرسالة للجميع|لجميع الأجهزة|جميع الأجهزة داخل الشبكة|تصل ل|يستقبل|المجموعة المحدّدة|يتوقّف هنا|Unicast|Multicast/;
  it("m11 MAY contain «Broadcast» and FF:FF:FF:FF:FF:FF because PDF 64 prints them", () => {
    expect(plain(p64)).toContain("Broadcast");
    expect(plain(p64)).toContain(BCAST);
  });
  it("the PDF 64 broadcast callout, the MAC anatomy config/fallback and the FF… true/false feedback name the address only — no Unit-8 delivery semantics", () => {
    for (const id of ["m11-l02-p01-bcast", "m11-l02-p01-anatomy", "m11-l02-p01-q3", "m11-l02-p01-clar", "m11-l02-p01-ex1"]) {
      expect(JSON.stringify(blockBy(p64, id)), id).not.toMatch(FUTURE);
    }
    const q3 = blockBy(p64, "m11-l02-p01-q3");
    expect(q3.type === "practice" && q3.question.feedback?.correctFeedback).toBe("صحيح — هذا هو عنوان Broadcast في MAC كما يظهر في الكتاب.");
    const a = blockBy(p64, "m11-l02-p01-anatomy") as { config?: { broadcastLabel?: string }; fallback?: { text?: string } };
    expect(a.config?.broadcastLabel).toBe("عنوان البث Broadcast");
    expect(a.fallback?.text).toContain(`عنوان البث Broadcast في MAC هو ${BCAST}.`);
  });
  it("the Unit-7 closing review asks WHICH address is the broadcast MAC (source level), never who receives it", () => {
    const r3 = blockBy(p65, "m11-l02-p02-r3");
    expect(r3.type === "practice" && r3.question.kind === "multipleChoice" && r3.question.prompt).toBe("سؤال بأسلوب الامتحان: أي من العناوين التالية هو عنوان Broadcast في MAC؟");
    expect(r3.type === "practice" && r3.question.kind === "multipleChoice" && r3.question.options.map(o => [o.text, Boolean(o.correct)])).toEqual([["A0:02:AF:2D:10:22", false], [BCAST, true], ["192.168.1.255", false]]);
    for (const id of ["m11-l02-p02-r1", "m11-l02-p02-r2", "m11-l02-p02-r3", "m11-l02-p02-q1", "m11-l02-p02-q2", "m11-l02-p02-ex1"]) expect(JSON.stringify(blockBy(p65, id)), id).not.toMatch(FUTURE);
    // nowhere in m11 is the Unit-8 claim made
    expect(JSON.stringify(m11)).not.toMatch(/الرسالة للجميع داخل الشبكة|تصل لجميع الأجهزة داخل الشبكة|إلى من ستصل/);
  });
});

describe("m11 — pedagogy + provenance + LTR + safety", () => {
  it("3 solved examples, 1 cable matching worksheet, 13 inline practices (incl. a 3-question closing review) with «افحص» feedback + hints; every enrichment block is marked", () => {
    const ex = pages.flatMap(p => p.blocks.filter(b => b.type === "example"));
    expect(ex.length).toBe(3);
    for (const e of ex) { expect(e.type === "example" && e.mode).toBe("solved"); expect(e.origin).toBe("teacher-enrichment"); }
    const match = blockBy(pageBy("791381-m11-l01-p02"), "m11-l01-p02-match");
    if (match.type !== "practice-table") throw new Error("no matching worksheet");
    expect(match.rows.map(r => sel(r[1]).key).sort()).toEqual(["Coaxial", "Fiber Optic", "STP", "UTP"]);
    expect(match.columnDirs).toEqual(["rtl", "ltr"]);
    const practices = pages.flatMap(p => p.blocks.filter(b => b.type === "practice"));
    expect(practices.length).toBe(13);
    expect(pageBy("791381-m11-l02-p02").blocks.filter(b => /^m11-l02-p02-r\d$/.test(b.id)).length).toBe(3);
    for (const b of practices) {
      if (b.type !== "practice") continue;
      expect(b.origin, b.id).toBe("teacher-enrichment");
      expect(b.question.feedback?.incorrectFeedback, b.id).toMatch(/افحص/);
      expect((b.question.feedback?.hints ?? []).length, b.id).toBeGreaterThanOrEqual(1);
      if (b.question.kind === "multipleChoice") expect(b.question.options.filter(o => o.correct).length, b.id).toBe(1);
      expect(b.question.kind, b.id).not.toBe("fillBlank");   // keyed fillBlank has no interactive UI yet
    }
    for (const id of ["m11-l01-p01-clar", "m11-l02-p01-clar"]) { const c = pages.flatMap(p => p.blocks).find(b => b.id === id)!; expect(c.origin).toBe("teacher-enrichment"); expect(c.type === "callout" && c.kind).toBe("clarification"); }
  });
  it("book cards/callouts/facts are origin book; technical tokens are LTR code spans; no image/iframe/link; no invented artwork", () => {
    for (const id of ["m11-l01-p01-def", "m11-l01-p01-cards", "m11-l01-p01-rule", "m11-l01-p02-cards", "m11-l01-p02-info", "m11-l02-p01-def", "m11-l02-p01-facts", "m11-l02-p01-example", "m11-l02-p01-bcast", "m11-l02-p02-uses", "m11-l02-p02-remember"]) {
      expect(pages.flatMap(p => p.blocks).find(b => b.id === id)!.origin, id).toBe("book");
    }
    const ltrTokens = new Set<string>();
    const walk = (v: unknown) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") { const o = v as Record<string, unknown>; if (o.dir === "ltr" && typeof o.text === "string") ltrTokens.add(o.text); Object.values(o).forEach(walk); } };
    walk(m11.lessons);
    for (const tok of ["MAC Address", "OSI", "Switch", "IP", "MAC", "Broadcast", BCAST, "UTP", "STP"]) expect([...ltrTokens], tok).toContain(tok);
    const json = JSON.stringify(m11);
    for (const banned of ["<iframe", ".pdf", "http", "<script", "من الكتاب", ".png", ".svg", "←", "→"]) expect(json, banned).not.toContain(banned);
    expect(pages.some(p => p.blocks.some(b => b.type === "image" || b.type === "diagram"))).toBe(false);
  });
});
