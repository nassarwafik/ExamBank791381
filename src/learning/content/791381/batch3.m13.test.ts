// Batch 3 phase — source-fidelity, mapping, provenance, pedagogy, SOURCE-ORDER and HARD-STOP guards for the book's
// section «نماذج الاتصال · OSI و TCP/IP» (PDF 77–86; PDF 76 is the batch divider) as stable module m13 (order 9).
// PDF 87+ («البروتوكولات», then «أوامر فحص الشبكة») is the NEXT section and is never converted here.
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
import manifest from "./manifest";
import { validateLearningCourseContent } from "../validation";
import { LEARNING_CONTENT_SCHEMA_VERSION, type LearningCourseContent, type ContentBlock, type ContentPage, type PracticeTableSelectCell } from "../types";

const ALL = [m01, m02, m07, m08, m09, m10, m11, m12, m13];
const course: LearningCourseContent = { schemaVersion: LEARNING_CONTENT_SCHEMA_VERSION, courseId: "791381", title: "شبكات الاتصال", direction: "rtl", modules: ALL };
const lessons = [...m13.lessons].sort((a, b) => a.order - b.order);
const pages = lessons.flatMap(l => [...l.pages].sort((a, b) => a.order - b.order));
const pageBy = (id: string): ContentPage => pages.find(p => p.id === id)!;
const blockBy = (p: ContentPage, id: string): ContentBlock => p.blocks.find(b => b.id === id)!;
const plain = (p: ContentPage): string => JSON.stringify(p.blocks);
const sel = (cell: unknown) => cell as PracticeTableSelectCell;
const allBlocks = pages.flatMap(p => p.blocks);
const practices = allBlocks.filter(b => b.type === "practice");
const NEXT_SECTION_PDF = 87;

const MAP: Record<string, [number, string]> = {
  "791381-m13-l01-p01": [77, "ما هو نموذج OSI؟"],
  "791381-m13-l01-p02": [78, "طبقات OSI السبع"],
  "791381-m13-l01-p03": [79, "طبقات OSI الأساسية"],
  "791381-m13-l01-p04": [80, "باقي طبقات OSI"],
  "791381-m13-l02-p01": [81, "نموذج TCP/IP"],
  "791381-m13-l02-p02": [82, "طبقات TCP/IP الأربع"],
  "791381-m13-l02-p03": [83, "مقارنة سريعة: OSI و TCP/IP"],
  "791381-m13-l03-p01": [84, "TCP و UDP"],
  "791381-m13-l03-p02": [85, "متى نستخدم TCP؟"],
  "791381-m13-l03-p03": [86, "متى نستخدم UDP؟"],
};

describe("m13 — validation, mapping PDF 77–86, divider PDF 76, completeness, HARD STOP before PDF 87", () => {
  it("the WHOLE real course (m01 … m13) produces ZERO validation issues", () => {
    expect(validateLearningCourseContent(course)).toEqual([]);
  });
  it("maps the ten learner pages 1:1 to PDF 77..86, one page per PDF page, printed page = PDF page (rendered circle), book order", () => {
    expect(pages.map(p => p.id).sort()).toEqual(Object.keys(MAP).sort());
    for (const [id, [pdf, title]] of Object.entries(MAP)) {
      const p = pageBy(id);
      expect([p.source.kind, p.source.sourceId, p.source.pdfPageStart, p.source.pdfPageEnd, p.source.printedPage, p.title], id).toEqual(["book", "791381", pdf, undefined, pdf, title]);
    }
    expect(pages.map(p => p.source.pdfPageStart)).toEqual([77, 78, 79, 80, 81, 82, 83, 84, 85, 86]);   // strictly increasing = book order
  });
  it("PDF 76 (the batch-3 divider) is represented ONLY by the module's coarse source range + sourceNote — never as a learner page or a fake unit opener", () => {
    expect(m13.source).toMatchObject({ kind: "book", sourceId: "791381", pdfPageStart: 76, pdfPageEnd: 86 });
    expect(m13.source!.sourceNote).toContain("PDF 76");
    expect(m13.source!.sourceNote).toContain("PDF 77");
    expect(pages.some(p => p.source.pdfPageStart === 76)).toBe(false);
    expect(allBlocks.some(b => b.type === "unit-opener")).toBe(false);
    expect(m13.lessons.some(l => l.id.endsWith("-l00"))).toBe(false);
    expect(JSON.stringify(m13)).not.toMatch(/الوحدة التاسعة|الوحدة 9|unitNumber/);
  });
  it("HARD STOP: every m13 page < 87; no page in the WHOLE real course reaches PDF 87; the manifest's m13 pages stop at 86", () => {
    for (const p of pages) expect(p.source.pdfPageStart, p.id).toBeLessThan(NEXT_SECTION_PDF);
    expect(Math.max(...pages.map(p => p.source.pdfPageStart))).toBe(86);
    expect(m13.source!.pdfPageEnd).toBeLessThan(NEXT_SECTION_PDF);
    for (const m of ALL) for (const p of m.lessons.flatMap(l => l.pages)) expect(p.source.pdfPageStart, p.id).toBeLessThan(NEXT_SECTION_PDF);
    for (const b of allBlocks) if (b.source) expect([b.source.pdfPageStart, b.source.pdfPageEnd ?? b.source.pdfPageStart], b.id).toEqual([expect.any(Number), expect.any(Number)]);
    for (const b of allBlocks) if (b.source) { expect(b.source.pdfPageStart, b.id).toBeGreaterThanOrEqual(77); expect(b.source.pdfPageEnd ?? b.source.pdfPageStart, b.id).toBeLessThanOrEqual(86); }
    const mm = manifest.modules.find(m => m.id === "791381-m13")!;
    for (const p of mm.lessons.flatMap(l => l.pages)) { expect(p.source!.pdfPageStart, p.id).toBeGreaterThanOrEqual(77); expect(p.source!.pdfPageStart, p.id).toBeLessThanOrEqual(86); }
  });
  it("HARD STOP (content): nothing from the NEXT section leaks — protocol FUNCTIONS (PDF 87–92) and network COMMANDS (PDF 93+) are absent everywhere in m13", () => {
    const json = JSON.stringify(m13);
    for (const banned of ["DNS", "DHCP", "TFTP", "SSH", "Telnet", "NAT", "HTTPS", "POP", "IMAP", "ICMP", "ARP", "ping", "ipconfig", "tracert", "nslookup", "أهم البروتوكولات", "أوامر فحص", "أوامر الشبكة", "يحوّل اسم", "يوزّع عناوين", "يترجم", "التصادم والهجمات", "أمان الشبكات"]) expect(json, banned).not.toContain(banned);
    // HTTP / FTP / SMTP are printed by PDF 80 and PDF 85 as bare example names only — never with a function
    expect(json).not.toMatch(/HTTP[^,"S]|FTP (?!\.)|SMTP (?!\.)/);   // no «HTTP هو …», «FTP لنقل …», «SMTP للبريد …»
    expect(json).not.toMatch(/HTTP\s*[:=]|FTP\s*[:=]|SMTP\s*[:=]/);
  });
  it("m13 is COMPLETE: manifest ↔ body match; order 9; three lessons as specified; partial not set", () => {
    const mm = manifest.modules.find(m => m.id === "791381-m13")!;
    expect([mm.order, m13.order, m13.partial, mm.title, m13.title]).toEqual([9, 9, undefined, "نماذج الاتصال: OSI و TCP/IP", "نماذج الاتصال: OSI و TCP/IP"]);
    expect(mm.lessons.flatMap(l => l.pages.map(p => p.id)).sort()).toEqual(pages.map(p => p.id).sort());
    expect(lessons.map(l => [l.id, l.title, l.pages.length])).toEqual([["791381-m13-l01", "نموذج OSI", 4], ["791381-m13-l02", "نموذج TCP/IP", 3], ["791381-m13-l03", "TCP و UDP", 3]]);
    for (const l of mm.lessons) {
      const body = m13.lessons.find(x => x.id === l.id)!;
      expect([body.order, body.title], l.id).toEqual([l.order, l.title]);
      for (const p of l.pages) { const bp = pageBy(p.id); expect([bp.order, bp.title, bp.source.pdfPageStart, bp.source.printedPage], p.id).toEqual([p.order, p.title, p.source!.pdfPageStart, p.source!.printedPage]); }
    }
  });
});

describe("m13 — key source facts in BOOK ORDER (PDF 77–86)", () => {
  it("PDF 77: the definition, the three facts and the «تذكّر» line as printed", () => {
    const p = pageBy("791381-m13-l01-p01");
    expect(plain(p)).toContain("نموذج يساعدنا على فهم انتقال البيانات بين الأجهزة.");
    const f = blockBy(p, "m13-l01-p01-facts");
    expect(f.type === "list" && [f.origin, f.items.map(i => i.text.map(s => s.text).join(""))]).toEqual(["book", ["يقسّم عملية الاتصال إلى 7 طبقات.", "كل طبقة لها وظيفة محدّدة.", "يساعد في اكتشاف الأعطال وفهم الشبكات."]]);
    expect(plain(p)).toContain("لا تحفظ شرحًا طويلًا؛ احفظ وظيفة كل طبقة بكلمات قليلة.");
  });
  it("PDF 78: the seven-layer table top (7) → bottom (1) with the book's tokens; the «للحفظ» send-down / receive-up rule in prose", () => {
    const p = pageBy("791381-m13-l01-p02");
    const t = blockBy(p, "m13-l01-p02-table");
    expect(t.type === "table" && [t.origin, t.headers, t.columnDirs]).toEqual(["book", ["الرقم", "الطبقة", "الاختصار"], ["ltr", "rtl", "ltr"]]);
    expect(t.type === "table" && t.rows.map(r => [r[0], r[2]])).toEqual([["7", "App"], ["6", "Pres"], ["5", "Sess"], ["4", "TCP/UDP"], ["3", "IP"], ["2", "MAC"], ["1", "Cable"]]);
    expect(t.type === "table" && t.rows.map(r => String(r[1]))).toEqual(["التطبيق Application", "العرض Presentation", "الجلسة Session", "النقل Transport", "الشبكة Network", "ربط البيانات Data Link", "الفيزيائية Physical"]);
    expect(plain(p)).toContain("عند الإرسال ننزل من 7 إلى 1، وعند الاستقبال نصعد من 1 إلى 7.");
  });
  it("PDF 79: the lower-layer cards (Physical / Data Link, Network / Transport) with Frame, MAC Address, IP, Packet as LTR tokens; TCP/UDP only NAMED", () => {
    const p = pageBy("791381-m13-l01-p03");
    const lower = blockBy(p, "m13-l01-p03-lower"), mid = blockBy(p, "m13-l01-p03-mid");
    expect(lower.type === "list" && lower.items.map(i => [i.term, i.text.map(s => s.text).join("")])).toEqual([["Physical", "الكابلات، الإشارات، الواي فاي."], ["Data Link", "تنقل Frame داخل الشبكة."], [undefined, "تتعامل مع MAC Address."], [undefined, "تساعد في كشف أخطاء الإرسال."]]);
    expect(mid.type === "list" && mid.items.map(i => [i.term, i.text.map(s => s.text).join("")])).toEqual([["Network", "تختار الطريق باستخدام IP."], [undefined, "تتعامل مع Packet."], ["Transport", "تنظّم وصول البيانات."], [undefined, "TCP و UDP يعملان في هذه الطبقة."]]);
    const ltr = [lower, mid].flatMap(b => b.type === "list" ? b.items.flatMap(i => i.text.filter(s => s.dir === "ltr").map(s => s.text)) : []);
    expect(ltr).toEqual(["Frame", "MAC Address", "IP", "Packet", "TCP", "UDP"]);
  });
  it("PDF 80: the upper-layer cards (Session / Presentation, Application with HTTP, FTP, SMTP as bare names) + the «الفكرة» line", () => {
    const p = pageBy("791381-m13-l01-p04");
    const up = blockBy(p, "m13-l01-p04-upper"), app = blockBy(p, "m13-l01-p04-app");
    expect(up.type === "list" && up.items.map(i => i.text.map(s => s.text).join(""))).toEqual(["تفتح الاتصال وتديره.", "تحافظ على استمرار الجلسة.", "تنهي الاتصال عند الانتهاء.", "تنسيق وتشفير البيانات."]);
    expect(app.type === "list" && app.items.map(i => i.text.map(s => s.text).join(""))).toEqual(["الطبقة الأقرب للمستخدم.", "تظهر في المتصفح والبريد والبرامج.", "أمثلة: HTTP, FTP, SMTP.", "هي ما يتعامل معه الطالب مباشرة."]);
    expect(app.type === "list" && app.items[2].text.map(s => [s.text, s.dir])).toEqual([["أمثلة: ", undefined], ["HTTP, FTP, SMTP", "ltr"], [".", undefined]]);
  });
  it("PDF 81–82: TCP/IP definition, «4 طبقات بدل 7 طبقات», and the four-layer table top (4) → bottom (1)", () => {
    expect(plain(pageBy("791381-m13-l02-p01"))).toContain("هو النموذج العملي الذي تعتمد عليه الإنترنت.");
    expect(plain(pageBy("791381-m13-l02-p01"))).toContain("يتكوّن من 4 طبقات بدل 7 طبقات.");
    const t = blockBy(pageBy("791381-m13-l02-p02"), "m13-l02-p02-table");
    expect(t.type === "table" && [t.origin, t.headers, t.rows.map(r => r[0]), t.rows.map(r => String(r[1]))]).toEqual(["book", ["الرقم", "الطبقة", "وظيفتها"], ["4", "3", "2", "1"], ["التطبيق Application", "النقل Transport", "الإنترنت Internet", "الربط Link"]]);
  });
  it("PDF 83: the comparison figure maps 7 OSI rows onto the 4 TCP/IP layers exactly as drawn; the upper-three → Application note; OSI educational vs TCP/IP practical", () => {
    const p = pageBy("791381-m13-l02-p03");
    const t = blockBy(p, "m13-l02-p03-figure");
    expect(t.type === "table" && t.rows).toEqual([["Application", "Application"], ["Presentation", "Application"], ["Session", "Application"], ["Transport", "Transport"], ["Network", "Internet"], ["Data Link", "Link"], ["Physical", "Link"]]);
    expect(plain(p)).toContain("تُجمع في طبقة ");
    expect(plain(p)).toContain("نموذج تعليمي يساعد على الفهم");
    expect(plain(p)).toContain("نموذج عملي أكثر استعمالًا");
    expect(plain(p)).toContain("افهم وظيفة الطبقة وليس الاسم فقط");
  });
  it("PDF 84–86: TCP/UDP both in Transport Layer; the two cards with the book's «مناسب» notes; the TCP and UDP rules and examples as printed", () => {
    const p84 = pageBy("791381-m13-l03-p01");
    expect(plain(p84)).toContain("كلاهما يعمل في طبقة النقل ");
    const c = blockBy(p84, "m13-l03-p01-cards");
    expect(c.type === "list" && c.items.map(i => [i.term, i.text.map(s => s.text).join(""), i.note])).toEqual([
      ["TCP", "بروتوكول موثوق. يتأكّد أن البيانات وصلت كاملة وبالترتيب الصحيح.", "مناسب: الويب، البريد، الملفات"],
      ["UDP", "بروتوكول سريع. لا يتأكّد من وصول كل البيانات، فيُستخدم عندما تكون السرعة أهم.", "مناسب: بث مباشر، ألعاب"],
    ]);
    const p85 = pageBy("791381-m13-l03-p02"), p86 = pageBy("791381-m13-l03-p03");
    expect(plain(p85)).toContain("عندما نحتاج اتصالًا موثوقًا ومضمونًا.");
    const f85 = blockBy(p85, "m13-l03-p02-facts");
    expect(f85.type === "list" && f85.items.map(i => i.text.map(s => s.text).join(""))).toEqual(["عندما يجب أن تصل البيانات كاملة.", "عندما يهمّنا ترتيب البيانات.", "أمثلة: HTTP, SMTP, FTP."]);
    expect(plain(p85)).toContain("أبطأ نسبيًا، لكنه أكثر أمانًا من ناحية ضمان وصول البيانات.");
    expect(plain(p86)).toContain("عندما تكون السرعة مهمة جدًا.");
    const f86 = blockBy(p86, "m13-l03-p03-facts");
    expect(f86.type === "list" && f86.items.map(i => i.text.map(s => s.text).join(""))).toEqual(["عندما يمكن تحمّل فقدان جزء صغير من البيانات.", "لا يضمن وصول كل الرسائل.", "أمثلة: الألعاب، البث المباشر، المكالمات."]);
    expect(plain(p86)).toContain("سريع لأنه لا ينتظر تأكيدًا على كل رسالة يرسلها.");
  });
});

describe("m13 — SOURCE ORDER inside the section (no concept before the book introduces it)", () => {
  const before84 = pages.filter(p => p.source.pdfPageStart < 84);
  const l01 = pages.filter(p => p.id.includes("-l01-"));
  it("TCP / UDP reliability & speed semantics (PDF 84–86) never appear on PDF 77–83 — there they are layer-4 NAMES only", () => {
    const SEMANTICS = /موثوق|سريع|يتأكّد|ضمان|يضمن|تأكيد|السرعة أهم|بث مباشر|ألعاب|المكالمات/;
    for (const p of before84) expect(plain(p), p.id).not.toMatch(SEMANTICS);
    expect(pages.filter(p => SEMANTICS.test(plain(p))).map(p => p.source.pdfPageStart)).toEqual([84, 85, 86]);
  });
  it("the four TCP/IP layers (PDF 81+) never appear on the OSI pages (PDF 77–80): no «4 طبقات», no Internet/Link layer", () => {
    for (const p of l01) {
      expect(plain(p), p.id).not.toMatch(/4 طبقات|أربع طبقات|الطبقات الأربع|"Internet"|"Link"|طبقة الإنترنت|طبقة الربط/);
      expect(plain(p), p.id).not.toMatch(/OSI[^"]{0,40}مقابل|تُجمع في طبقة/);
    }
  });
  it("the OSI layer FUNCTIONS respect the page order: PDF 78 only names/tokens (no card functions), PDF 79 lower four, PDF 80 upper three", () => {
    const p78 = plain(pageBy("791381-m13-l01-p02"));
    for (const fn of ["تنقل Frame", "تختار الطريق", "تفتح الاتصال", "تنسيق وتشفير", "الأقرب للمستخدم"]) expect(p78, fn).not.toContain(fn);
    const p79 = plain(pageBy("791381-m13-l01-p03"));
    for (const fn of ["تفتح الاتصال", "تنسيق وتشفير", "الأقرب للمستخدم", "\"Session\"", "\"Presentation\""]) expect(p79, fn).not.toContain(fn);
    expect(p79).not.toMatch(/HTTP|FTP|SMTP/);
  });
});

describe("m13 — the ONE activity: interactive-diagram/osi-layers/v1 on PDF 80, after all seven layers are introduced", () => {
  const p = pageBy("791381-m13-l01-p04");
  const acts = allBlocks.filter(b => ["simulation", "animation", "guided", "interactive-diagram"].includes(b.type));
  it("exactly one activity block in the whole module; enrichment origin; source PDF 80 (printed 80)", () => {
    expect(acts.map(b => [b.id, b.type])).toEqual([["m13-l01-p04-explorer", "interactive-diagram"]]);
    const a = acts[0];
    expect(a.type === "interactive-diagram" && [a.interactionType, a.version, a.origin, a.source?.pdfPageStart, a.source?.printedPage, a.capabilities]).toEqual(["osi-layers", 1, "teacher-enrichment", 80, 80, { fullscreen: true, reset: true, interactive: true }]);
  });
  it("sits AFTER the PDF 80 book cards (Session / Presentation, Application) and the «الفكرة» callout, BEFORE the page's practices", () => {
    const idx = p.blocks.map(b => b.id);
    const at = idx.indexOf("m13-l01-p04-explorer");
    for (const before of ["m13-l01-p04-upper", "m13-l01-p04-app", "m13-l01-p04-idea"]) expect(idx.indexOf(before), before).toBeLessThan(at);
    for (const after of ["m13-l01-p04-q1", "m13-l01-p04-q2"]) expect(idx.indexOf(after), after).toBeGreaterThan(at);
    // no activity on PDF 77–79 (the layers are not all introduced yet)
    for (const id of ["791381-m13-l01-p01", "791381-m13-l01-p02", "791381-m13-l01-p03"]) expect(pageBy(id).blocks.some(b => b.type === "interactive-diagram"), id).toBe(false);
  });
  it("config = the book's seven layers 7 → 1 with the PDF 78 tokens, PDF 79–80 roles and the PDF 78 send/receive rule; fallback text is a faithful static summary", () => {
    const a = blockBy(p, "m13-l01-p04-explorer");
    const cfg = (a as { config?: { layers: { number: number; name: string; token: string; arabic: string; role: string }[]; sendNote: string; receiveNote: string } }).config!;
    expect(cfg.layers.map(l => [l.number, l.name, l.token])).toEqual([[7, "Application", "App"], [6, "Presentation", "Pres"], [5, "Session", "Sess"], [4, "Transport", "TCP/UDP"], [3, "Network", "IP"], [2, "Data Link", "MAC"], [1, "Physical", "Cable"]]);
    expect(cfg.layers.map(l => l.arabic)).toEqual(["التطبيق", "العرض", "الجلسة", "النقل", "الشبكة", "ربط البيانات", "الفيزيائية"]);
    for (const l of cfg.layers) expect(l.role.length, l.name).toBeGreaterThan(10);
    expect([cfg.sendNote, cfg.receiveNote]).toEqual(["عند الإرسال ننزل من 7 إلى 1.", "عند الاستقبال نصعد من 1 إلى 7."]);
    expect(a.type === "interactive-diagram" && a.fallback?.text).toContain("7 Application");
    expect(a.type === "interactive-diagram" && a.fallback?.text).toContain("1 Physical");
    expect(JSON.stringify(cfg)).not.toMatch(/DNS|DHCP|HTTP|FTP|SMTP|"Internet"|"Link"|موثوق|سريع/);   // no next-page / next-section knowledge inside the activity
  });
});

describe("m13 — pedagogy: worksheets, solved examples, inline practices with «افحص» feedback, closing review", () => {
  it("20 inline practices (all enrichment, interactive kinds only — no fillBlank), each with 2 hints, «افحص» incorrect feedback and an explanation", () => {
    expect(practices.length).toBe(20);
    for (const b of practices) {
      if (b.type !== "practice") continue;
      expect(b.origin, b.id).toBe("teacher-enrichment");
      expect(["multipleChoice", "trueFalse", "shortInput"], b.id).toContain(b.question.kind);
      const fb = b.question.feedback!;
      expect(fb.hints?.length, b.id).toBe(2);
      expect(fb.incorrectFeedback, b.id).toMatch(/افحص/);
      expect(fb.correctFeedback && fb.explanation, b.id).toBeTruthy();
      if (b.question.kind === "multipleChoice") expect(b.question.options.filter(o => o.correct).length, b.id).toBe(1);
    }
    expect(practices.filter(b => b.type === "practice").map(b => b.type === "practice" && b.question.kind)).toEqual(expect.arrayContaining(["multipleChoice", "trueFalse", "shortInput"]));
    expect(pages.every(p => p.blocks.some(b => b.type === "practice"))).toBe(true);   // every page ends with practice
  });
  it("two interactive worksheets: OSI → TCP/IP mapping (PDF 83) and TCP-or-UDP cases (PDF 86), keyed to the book's figure / examples", () => {
    const tables = allBlocks.filter(b => b.type === "practice-table");
    expect(tables.map(b => b.id)).toEqual(["m13-l02-p03-match", "m13-l03-p03-match"]);
    const t1 = blockBy(pageBy("791381-m13-l02-p03"), "m13-l02-p03-match");
    expect(t1.type === "practice-table" && t1.rows.map(r => [r[0], sel(r[1]).key])).toEqual([["Presentation", "Application"], ["Network", "Internet"], ["Physical", "Link"], ["Transport", "Transport"], ["Session", "Application"], ["Data Link", "Link"]]);
    expect(t1.type === "practice-table" && t1.rows.every(r => JSON.stringify(sel(r[1]).options) === JSON.stringify(["Application", "Transport", "Internet", "Link"]))).toBe(true);
    const t2 = blockBy(pageBy("791381-m13-l03-p03"), "m13-l03-p03-match");
    expect(t2.type === "practice-table" && t2.rows.map(r => sel(r[1]).key)).toEqual(["TCP", "UDP", "TCP", "UDP", "TCP", "UDP"]);
    expect(t2.type === "practice-table" && t2.rows.map(r => r[0])).toEqual(["إرسال بريد إلكتروني.", "مكالمة صوتية مباشرة.", "نقل ملف يجب أن يصل كاملًا.", "لعبة جماعية عبر الشبكة.", "تصفّح موقع ويب.", "بث مباشر لمباراة."]);
  });
  it("four SOLVED examples (send/receive order, MAC vs IP layer, Session → TCP/IP, file vs live stream) and four clarifications, all enrichment", () => {
    const ex = allBlocks.filter(b => b.type === "example");
    expect(ex.map(b => [b.id, b.type === "example" && b.mode, b.origin])).toEqual([["m13-l01-p02-ex1", "solved", "teacher-enrichment"], ["m13-l01-p03-ex1", "solved", "teacher-enrichment"], ["m13-l02-p03-ex1", "solved", "teacher-enrichment"], ["m13-l03-p01-ex1", "solved", "teacher-enrichment"]]);
    const cl = allBlocks.filter(b => b.type === "callout" && b.kind === "clarification");
    expect(cl.map(b => [b.id, b.origin])).toEqual([["m13-l01-p01-clar", "teacher-enrichment"], ["m13-l01-p02-clar", "teacher-enrichment"], ["m13-l02-p02-clar", "teacher-enrichment"], ["m13-l03-p01-clar", "teacher-enrichment"]]);
  });
  it("the closing review (r1–r3) is the LAST thing on PDF 86, after the UDP worksheet, easy → exam-like", () => {
    const p = pageBy("791381-m13-l03-p03");
    const ids = p.blocks.map(b => b.id);
    expect(ids.slice(-4)).toEqual(["m13-l03-p03-review", "m13-l03-p03-r1", "m13-l03-p03-r2", "m13-l03-p03-r3"]);
    expect(ids.indexOf("m13-l03-p03-match")).toBeLessThan(ids.indexOf("m13-l03-p03-review"));
    expect(allBlocks.filter(b => /^m13-l03-p03-r\d$/.test(b.id)).length).toBe(3);
    const r1 = blockBy(p, "m13-l03-p03-r1");
    expect(r1.type === "practice" && r1.question.kind === "multipleChoice" && r1.question.options.find(o => o.correct)?.text).toBe("OSI: 7 · TCP/IP: 4");
    expect(blockBy(p, "m13-l03-p03-r3").type === "practice" && (blockBy(p, "m13-l03-p03-r3") as { question: { prompt: string } }).question.prompt).toContain("سؤال بأسلوب الامتحان");
  });
});

describe("m13 — provenance, RTL/LTR and content safety", () => {
  it("book-derived blocks are origin:book (definitions, facts, tables, cards, «تذكّر»); every practice/example/worksheet/activity/clarification/heading is enrichment", () => {
    for (const b of allBlocks) {
      if (["practice", "practice-table", "example", "interactive-diagram", "heading", "visual"].includes(b.type) || (b.type === "callout" && b.kind === "clarification")) expect(b.origin, b.id).toBe("teacher-enrichment");
      else expect(b.origin, b.id).toBe("book");
    }
    expect(allBlocks.filter(b => b.origin === "book").length).toBe(29);   // 10 pages of book bullets/tables/cards/callouts
  });
  it("technical tokens are LTR spans inside RTL prose (OSI, TCP/IP, TCP, UDP, IP, MAC, Frame, Packet, layer names) and no arrow glyphs anywhere", () => {
    const spans = allBlocks.flatMap(b => b.type === "callout" || b.type === "text" ? b.spans : b.type === "list" ? b.items.flatMap(i => i.text) : []);
    const ltr = spans.filter(s => s.dir === "ltr").map(s => s.text);
    for (const tok of ["OSI", "TCP/IP", "TCP", "UDP", "IP", "MAC", "Frame", "Packet", "Transport Layer", "Internet", "Link"]) expect(ltr, tok).toContain(tok);
    for (const s of spans.filter(s => s.dir !== "ltr")) expect(s.text, s.text).not.toMatch(/^(OSI|TCP|UDP|MAC|IP)$/);
    const json = JSON.stringify(m13);
    for (const banned of ["<iframe", ".pdf", "http://", "https://", "<script", ".png", ".svg", "←", "→", "⇐", "⇒"]) expect(json, banned).not.toContain(banned);
  });
  it("ids are prefix-scoped and unique; no batch-2 module was touched by this batch (m11/m12 keep their PDF 61–75 ranges)", () => {
    const ids = allBlocks.map(b => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^m13-l0[1-3]-p0[1-4]-/);
    expect(m11.source).toMatchObject({ pdfPageStart: 61, pdfPageEnd: 65 });
    expect(m12.source).toMatchObject({ pdfPageStart: 66, pdfPageEnd: 75 });
  });
});
