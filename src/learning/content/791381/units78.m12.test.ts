// Units 7–8 phase — source-fidelity, mapping, provenance, pedagogy and hard-stop guards for Unit 8 «أنواع الرسائل»
// (PDF 66–74) + the batch-2 summary (PDF 75) as stable module m12. PDF 76+ (batch 3) is never converted.
import { describe, it, expect } from "vitest";
import m01 from "./modules/m01";
import m02 from "./modules/m02";
import m07 from "./modules/m07";
import m08 from "./modules/m08";
import m09 from "./modules/m09";
import m10 from "./modules/m10";
import m11 from "./modules/m11";
import m12 from "./modules/m12";
import manifest from "./manifest";
import { validateLearningCourseContent } from "../validation";
import { LEARNING_CONTENT_SCHEMA_VERSION, type LearningCourseContent, type ContentBlock, type ContentPage, type PracticeTableSelectCell } from "../types";

const ALL = [m01, m02, m07, m08, m09, m10, m11, m12];
const course: LearningCourseContent = { schemaVersion: LEARNING_CONTENT_SCHEMA_VERSION, courseId: "791381", title: "شبكات الاتصال", direction: "rtl", modules: ALL };
const pages = m12.lessons.flatMap(l => l.pages);
const pageBy = (id: string): ContentPage => pages.find(p => p.id === id)!;
const blockBy = (p: ContentPage, id: string): ContentBlock => p.blocks.find(b => b.id === id)!;
const plain = (p: ContentPage): string => JSON.stringify(p.blocks);
const sel = (cell: unknown) => cell as PracticeTableSelectCell;
const BCAST = "FF:FF:FF:FF:FF:FF";

const MAP: Record<string, [number, number | undefined, string]> = {
  "791381-m12-l00-p01": [66, undefined, "أنواع الرسائل"],
  "791381-m12-l01-p01": [67, 67, "Unicast / Multicast / Broadcast"],
  "791381-m12-l01-p02": [68, 68, "Unicast و Multicast"],
  "791381-m12-l01-p03": [69, 69, "Broadcast"],
  "791381-m12-l02-p01": [70, 70, "كيف نعرف عنوان Broadcast؟"],
  "791381-m12-l02-p02": [71, 71, "بروتوكولات تستعمل Broadcast"],
  "791381-m12-l03-p01": [72, 72, "وحدات التخزين"],
  "791381-m12-l03-p02": [73, 73, "مبنى الرسائل في الشبكات"],
  "791381-m12-l03-p03": [74, 74, "مبنى رسالة Broadcast"],
  "791381-m12-l04-p01": [75, undefined, "نهاية الدفعة الثانية — خلاصة سريعة"],
};

describe("m12 — validation, mapping PDF 66–75, completeness, HARD STOP before PDF 76", () => {
  it("the WHOLE real course (m01 … m12) produces ZERO validation issues", () => {
    expect(validateLearningCourseContent(course)).toEqual([]);
  });
  it("maps the ten pages 1:1 to PDF 66..75 with the RENDERED page-circle numbers (67–74; opener + summary print none)", () => {
    expect(pages.map(p => p.id).sort()).toEqual(Object.keys(MAP).sort());
    for (const [id, [pdf, printed, title]] of Object.entries(MAP)) {
      const p = pageBy(id);
      expect([p.source.sourceId, p.source.pdfPageStart, p.source.printedPage, p.source.pdfPageEnd, p.title], id).toEqual(["791381", pdf, printed, undefined, title]);
    }
    const ordered = [...m12.lessons].sort((a, b) => a.order - b.order).flatMap(l => [...l.pages].sort((a, b) => a.order - b.order));
    expect(ordered.map(p => p.source.pdfPageStart)).toEqual([66, 67, 68, 69, 70, 71, 72, 73, 74, 75]);
    expect(m12.source).toMatchObject({ kind: "book", sourceId: "791381", pdfPageStart: 66, pdfPageEnd: 75 });
    expect(m12.source!.sourceNote).toContain("PDF 76");
  });
  it("PDF 75 is a learner-visible BATCH SUMMARY page: last lesson of m12, book cards for Hub/Switch/Router/MAC/Broadcast/Cables, the next-batch line as printed, a conversionNote — not a fake unit", () => {
    const last = [...m12.lessons].sort((a, b) => a.order - b.order).at(-1)!;
    expect([last.id, last.title]).toEqual(["791381-m12-l04", "خلاصة الدفعة الثانية"]);
    const p = pageBy("791381-m12-l04-p01");
    expect(p.layout).toBeUndefined();
    expect(p.conversionNote).toContain("PDF 75");
    const c = blockBy(p, "m12-l04-p01-cards");
    expect(c.type === "list" && c.origin).toBe("book");
    expect(c.type === "list" && c.items.map(i => [i.term, i.text.map(s => s.text).join("")])).toEqual([
      ["Hub", "يرسل الرسالة للجميع."], ["Switch", "يرسل الرسالة للمقصود فقط."], ["Router", "يربط الشبكة بالإنترنت أو بشبكات أخرى."],
      ["MAC", "عنوان فيزيائي لكرت الشبكة."], ["Broadcast", "رسالة تصل لكل الأجهزة داخل الشبكة."], ["Cables", "طرق انتقال البيانات بين الأجهزة."],
    ]);
    const n = blockBy(p, "m12-l04-p01-next");
    expect(n.type === "callout" && [n.origin, n.spans.map(s => s.text).join("")]).toEqual(["book", "OSI · TCP/IP · البروتوكولات · أوامر الشبكات · التصادم والهجمات"]);
    expect(pages.some(p => p.blocks.some(b => b.type === "unit-opener" && b.title !== "أنواع الرسائل"))).toBe(false);   // no invented unit opener
  });
  it("HARD STOP: no page in the WHOLE course reaches PDF 76; batch-3 (PDF 76–77) content is absent everywhere", () => {
    for (const m of ALL) for (const p of m.lessons.flatMap(l => l.pages)) expect(p.source.pdfPageStart, p.id).toBeLessThan(76);
    for (const m of manifest.modules.filter(x => ["791381-m11", "791381-m12"].includes(x.id))) for (const p of m.lessons.flatMap(l => l.pages)) expect(p.source!.pdfPageStart, p.id).toBeLessThanOrEqual(75);
    const json = JSON.stringify([m11, m12]);
    for (const banned of ["7 طبقات", "سبع طبقات", "نموذج يساعدنا على فهم انتقال البيانات", "TCP/UDP", "تجزئة البيانات", "أمان الشبكات", "نماذج الاتصال", "المجالات والتصادم"]) expect(json, banned).not.toContain(banned);
  });
  it("m12 is COMPLETE: manifest ↔ body match; order 8; five lessons as specified", () => {
    const mm = manifest.modules.find(m => m.id === "791381-m12")!;
    expect(mm.order).toBe(8); expect(m12.order).toBe(8); expect(m12.partial).toBeFalsy();
    expect(mm.lessons.flatMap(l => l.pages.map(p => p.id)).sort()).toEqual(pages.map(p => p.id).sort());
    expect(m12.lessons.map(l => [l.id, l.title])).toEqual([
      ["791381-m12-l00", "افتتاحية الوحدة"], ["791381-m12-l01", "Unicast / Multicast / Broadcast"], ["791381-m12-l02", "عنوان Broadcast والبروتوكولات"],
      ["791381-m12-l03", "وحدات التخزين ومبنى الرسالة"], ["791381-m12-l04", "خلاصة الدفعة الثانية"],
    ]);
    for (const l of mm.lessons) {
      const body = m12.lessons.find(x => x.id === l.id)!;
      expect([body.order, body.title], l.id).toEqual([l.order, l.title]);
      for (const p of l.pages) { const bp = pageBy(p.id); expect([bp.order, bp.title, bp.source.pdfPageStart, bp.source.printedPage], p.id).toEqual([p.order, p.title, p.source!.pdfPageStart, p.source!.printedPage]); }
    }
  });
});

describe("m12 — key source facts in BOOK ORDER (PDF 66–74)", () => {
  it("PDF 66 opener; PDF 67 three cards + «الفرق الأساسي»; the delivery simulation sits on PDF 67 after all three kinds", () => {
    const o = blockBy(pageBy("791381-m12-l00-p01"), "m12-l00-p01-opener");
    expect(o.type === "unit-opener" && [o.unitLabel, o.unitNumber, o.title, o.subtitle]).toEqual(["الوحدة الثامنة", "08", "أنواع الرسائل", "ما الفرق بين رسالة لجهاز واحد، لمجموعة، أو للجميع؟"]);
    const p = pageBy("791381-m12-l01-p01");
    const c = blockBy(p, "m12-l01-p01-cards");
    expect(c.type === "list" && c.items.map(i => [i.term, i.text.map(s => s.text).join(""), i.note])).toEqual([
      ["Unicast", "رسالة من جهاز واحد إلى جهاز واحد محدّد.", "جهاز واحد فقط يستقبل"], ["Multicast", "رسالة من جهاز واحد إلى مجموعة محدّدة.", "مجموعة محدّدة تستقبل"], ["Broadcast", "رسالة من جهاز واحد إلى جميع الأجهزة.", "الجميع يستقبلون"],
    ]);
    expect(plain(p)).toContain("الفرق هو عدد الأجهزة التي تستقبل الرسالة: واحد، مجموعة، أو الجميع.");
    const idx = p.blocks.map(b => b.id);
    expect(idx.indexOf("m12-l01-p01-sim")).toBeGreaterThan(idx.indexOf("m12-l01-p01-diff"));
    const a = blockBy(p, "m12-l01-p01-sim");
    expect(a.type === "simulation" && [a.simulationType, a.version, a.origin, a.source?.pdfPageStart]).toEqual(["message-delivery", 1, "teacher-enrichment", 67]);
    const cfg = (a as { config?: { sender: string; receivers: string[]; unicast: { target: string }; multicast: { group: string[] }; broadcast: { router: { stopLabel: string } } } }).config!;
    expect([cfg.sender, cfg.receivers, cfg.unicast.target, cfg.multicast.group, cfg.broadcast.router.stopLabel]).toEqual(["PC1", ["PC2", "PC3", "PC4"], "PC3", ["PC2", "PC4"], "يتوقّف هنا"]);
  });
  it("PDF 68 examples (browsing / video to subscribers) in prose «من مصدر واحد إلى …» (no arrow glyph) + the Multicast warning", () => {
    const p = pageBy("791381-m12-l01-p02");
    const c = blockBy(p, "m12-l01-p02-cards");
    expect(c.type === "list" && c.items.map(i => i.text.map(s => s.text).join(""))).toEqual([
      "من مصدر واحد إلى هدف واحد. مثال: تصفّح موقع أو إرسال رسالة لجهاز محدّد.", "من مصدر واحد إلى مجموعة محدّدة. مثال: بث فيديو لمجموعة مشتركين.",
    ]);
    expect(plain(p)).toContain("لا تصل الرسالة للجميع، بل فقط للمجموعة المطلوبة.");
  });
  it("PDF 69 Broadcast facts, the Router «يتوقّف هنا» boundary, the exact broadcast MAC and the reminder", () => {
    const p = pageBy("791381-m12-l01-p03");
    expect(plain(p)).toContain("يعني إرسال الرسالة إلى جميع الأجهزة داخل الشبكة.");
    const f = blockBy(p, "m12-l01-p03-facts");
    expect(f.type === "list" && f.items.map(i => i.text.map(s => s.text).join(""))).toEqual(["مفيد عند البحث عن جهاز أو خدمة.", "يزيد حركة المرور داخل الشبكة.", "يُستخدم بشكل محدود في الشبكات الحديثة."]);
    expect(plain(p)).toContain("يتوقّف هنا");
    const addr = blockBy(p, "m12-l01-p03-addr");
    expect(addr.type === "callout" && addr.spans.map(s => [s.text, s.dir])).toEqual([[BCAST, "ltr"]]);
    expect(plain(p)).toContain("عادةً بين الشبكات المختلفة، بل يبقى داخل الشبكة نفسها.");
  });
  it("PDF 70 the five book rows EXACTLY (LTR columns), the /24 · /16 rule; the builder covers those rows and stays at /8 /16 /24", () => {
    const p = pageBy("791381-m12-l02-p01");
    const t = blockBy(p, "m12-l02-p01-table");
    expect(t.type === "table" && [t.origin, t.headers, t.columnDirs, t.rows]).toEqual(["book", ["عنوان الشبكة", "القناع", "Broadcast"], ["ltr", "ltr", "ltr"], [
      ["10.0.0.0", "/8", "10.255.255.255"], ["192.168.10.0", "/24", "192.168.10.255"], ["192.168.0.0", "/16", "192.168.255.255"], ["172.18.20.0", "/24", "172.18.20.255"], ["172.30.0.0", "/16", "172.30.255.255"],
    ]]);
    const r = blockBy(p, "m12-l02-p01-rule");
    expect(r.type === "callout" && r.spans.map(s => s.text).join("")).toBe("في /24 يكون غالبًا آخر رقم 255، وفي /16 يكون آخر رقمين 255.255.");
    const a = blockBy(p, "m12-l02-p01-builder");
    expect(a.type === "interactive-diagram" && [a.interactionType, a.version, a.origin, a.source?.pdfPageStart]).toEqual(["broadcast-address", 1, "teacher-enrichment", 70]);
    const cfg = (a as { config?: { examples: { network: string; prefix: number }[]; practice: { prefix: number }[] } }).config!;
    expect(cfg.examples.map(e => `${e.network} /${e.prefix}`)).toEqual(["10.0.0.0 /8", "192.168.10.0 /24", "192.168.0.0 /16", "172.18.20.0 /24", "172.30.0.0 /16"]);
    for (const x of [...cfg.examples, ...cfg.practice]) expect([8, 16, 24]).toContain(x.prefix);
    expect(JSON.stringify(m12)).not.toMatch(/\/2[5-9]|\/3[0-2]/);   // no arbitrary subnet math
  });
  it("PDF 71 ARP / DHCP / RIP rows exactly, RIP v1 Broadcast vs v2 Multicast preserved, the «أبطأ» reminder", () => {
    const p = pageBy("791381-m12-l02-p02");
    const t = blockBy(p, "m12-l02-p02-table");
    expect(t.type === "table" && [t.origin, t.rows]).toEqual(["book", [
      ["ARP", "عندما يبحث الجهاز عن MAC Address لجهاز داخل نفس الشبكة."], ["DHCP", "عندما يبحث الجهاز عن خادم DHCP للحصول على عنوان IP."], ["RIP", "لإعلان جداول التوجيه — الإصدار الأول يستعمل Broadcast، والثاني Multicast."],
    ]]);
    expect(plain(p)).toContain("مهم، لكن استعماله بكثرة يجعل الشبكة أبطأ بسبب كثرة الرسائل.");
    const match = blockBy(p, "m12-l02-p02-match");
    expect(match.type === "practice-table" && match.rows.map(r => sel(r[1]).key)).toEqual(["DHCP", "ARP", "RIP"]);
  });
  it("PDF 72 storage units in the exact book order with the book's 1024 convention (never 1000); PDF 73 the four fields; PDF 74 the broadcast MAC + domain facts", () => {
    const p = pageBy("791381-m12-l03-p01");
    const t = blockBy(p, "m12-l03-p01-table");
    expect(t.type === "table" && [t.origin, t.rows]).toEqual(["book", [["Bit", "أصغر وحدة: 0 أو 1"], ["Byte", "8 بت، تقريبًا حرف واحد"], ["KB", "1024 بايت"], ["MB", "1024 كيلوبايت"], ["GB", "1024 ميجابايت"], ["TB", "1024 جيجابايت"]]]);
    expect(plain(p)).toContain("بمقدار 1024 ضعفًا.");
    expect(plain(p)).not.toMatch(/\b1000\b/);
    const ladder = blockBy(p, "m12-l03-p01-ladder");
    expect(ladder.type === "list" && [ladder.origin, ladder.variant, ladder.items.map(i => i.term)]).toEqual(["teacher-enrichment", "ordered", ["Bit", "Byte", "KB", "MB", "GB", "TB"]]);
    const f = blockBy(pageBy("791381-m12-l03-p02"), "m12-l03-p02-fields");
    expect(f.type === "list" && f.items.map(i => [i.term, i.text.map(s => s.text).join("")])).toEqual([["IP المصدر", "عنوان الجهاز المرسِل."], ["IP الهدف", "عنوان الجهاز المستقبِل."], ["MAC المصدر", "عنوان كرت الشبكة للمرسِل."], ["MAC الهدف", "عنوان كرت الشبكة للمستقبِل."]]);
    expect(plain(pageBy("791381-m12-l03-p02"))).toContain("يوجد مصدر واحد وهدف واحد محدّد، فتُملأ كل الحقول الأربعة بعناوين معروفة.");
    const p74 = pageBy("791381-m12-l03-p03");
    const facts = blockBy(p74, "m12-l03-p03-facts");
    expect(facts.type === "list" && facts.items.map(i => i.text.map(s => s.text).join(""))).toEqual(["يُستعمل للبحث عن خدمة أو جهاز.", "يبقى داخل نفس Broadcast Domain.", "الراوتر يفصل بين مجالات Broadcast."]);
    const mac = blockBy(p74, "m12-l03-p03-mac");
    expect(mac.type === "callout" && [mac.origin, mac.spans[0].text, mac.spans[0].dir]).toEqual(["book", BCAST, "ltr"]);
    expect(plain(p74)).toContain("أرسل الرسالة للجميع داخل الشبكة المحلية.");
    const cmp = blockBy(p74, "m12-l03-p03-compare");
    expect(cmp.type === "table" && [cmp.origin, cmp.rows.at(-1)]).toEqual(["teacher-enrichment", ["MAC الهدف", "B4:11:C2:07:9E:31", BCAST]]);
  });
});

describe("m12 — pedagogy + provenance + LTR + safety", () => {
  it("5 solved examples, 3 worksheets (protocols, units, message classification), 21 inline practices incl. the closing review; «افحص» feedback + hints; no keyed fillBlank", () => {
    const ex = pages.flatMap(p => p.blocks.filter(b => b.type === "example"));
    expect(ex.length).toBe(5);
    for (const e of ex) { expect(e.type === "example" && e.mode).toBe("solved"); expect(e.origin).toBe("teacher-enrichment"); }
    const tables = pages.flatMap(p => p.blocks.filter(b => b.type === "practice-table"));
    expect(tables.map(t => t.id)).toEqual(["m12-l02-p02-match", "m12-l03-p01-match", "m12-l03-p03-r0"]);
    const practices = pages.flatMap(p => p.blocks.filter(b => b.type === "practice"));
    expect(practices.length).toBe(21);
    expect(pageBy("791381-m12-l03-p03").blocks.filter(b => /^m12-l03-p03-r\d$/.test(b.id)).length).toBe(4);
    for (const b of practices) {
      if (b.type !== "practice") continue;
      expect(b.origin, b.id).toBe("teacher-enrichment");
      expect(b.question.feedback?.incorrectFeedback, b.id).toMatch(/افحص/);
      expect((b.question.feedback?.hints ?? []).length, b.id).toBeGreaterThanOrEqual(1);
      if (b.question.kind === "multipleChoice") expect(b.question.options.filter(o => o.correct).length, b.id).toBe(1);
      expect(b.question.kind, b.id).not.toBe("fillBlank");
    }
    // the broadcast-address short inputs are keyed with the exact whole-octet answers
    const q = (id: string) => { const b = pages.flatMap(p => p.blocks).find(x => x.id === id)!; return b.type === "practice" && b.question.kind === "shortInput" ? b.question.answer : null; };
    expect([q("m12-l02-p01-q1"), q("m12-l02-p01-q2"), q("m12-l03-p03-r3"), q("m12-l03-p01-q2")]).toEqual(["192.168.20.255", "172.16.255.255", "172.30.255.255", "1024"]);
  });
  it("book blocks are origin book; enrichment is marked; technical tokens are LTR; the broadcast MAC is always an LTR span; no arrow glyphs; no image/iframe/link", () => {
    for (const id of ["m12-l01-p01-cards", "m12-l01-p01-diff", "m12-l01-p02-cards", "m12-l01-p02-warn", "m12-l01-p03-def", "m12-l01-p03-facts", "m12-l01-p03-addr", "m12-l01-p03-remember", "m12-l02-p01-table", "m12-l02-p01-rule", "m12-l02-p02-table", "m12-l02-p02-remember", "m12-l03-p01-def", "m12-l03-p01-table", "m12-l03-p01-note", "m12-l03-p02-idea", "m12-l03-p02-fields", "m12-l03-p02-unicast", "m12-l03-p03-def", "m12-l03-p03-facts", "m12-l03-p03-mac", "m12-l04-p01-cards", "m12-l04-p01-next"]) {
      expect(pages.flatMap(p => p.blocks).find(b => b.id === id)!.origin, id).toBe("book");
    }
    for (const id of ["m12-l01-p01-sim", "m12-l02-p01-builder", "m12-l01-p02-clar", "m12-l02-p01-clar", "m12-l02-p02-clar", "m12-l03-p03-clar", "m12-l04-p01-clar", "m12-l03-p02-table", "m12-l03-p03-compare", "m12-l03-p01-ladder"]) {
      expect(pages.flatMap(p => p.blocks).find(b => b.id === id)!.origin, id).toBe("teacher-enrichment");
    }
    const spans: { text: string; dir?: string }[] = [];
    const walk = (v: unknown) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") { const o = v as Record<string, unknown>; if (typeof o.text === "string" && ("dir" in o || "style" in o || Object.keys(o).length === 1)) spans.push(o as { text: string; dir?: string }); Object.values(o).forEach(walk); } };
    walk(m12.lessons);
    for (const s of spans.filter(x => x.text === BCAST)) expect(s.dir, "broadcast MAC span").toBe("ltr");
    const ltr = new Set(spans.filter(s => s.dir === "ltr").map(s => s.text));
    for (const tok of ["Broadcast", "Multicast", "Unicast", "Switch", "Router", "/24", "/16", "/8", "255", "OSI", "TCP/IP", "Broadcast Domain", BCAST]) expect([...ltr], tok).toContain(tok);
    const json = JSON.stringify(m12);
    for (const banned of ["<iframe", ".pdf", "http", "<script", "من الكتاب", ".png", ".svg", "←", "→"]) expect(json, banned).not.toContain(banned);
    expect(pages.some(p => p.blocks.some(b => b.type === "image" || b.type === "diagram"))).toBe(false);
  });
});
