// Learning Materials — Phase 3E: source-fidelity + mapping + provenance + answer-key guards for the real Book
// 791381 conversion of Unit 3 «عناوين IP» (PDF 24–33) as the new stable module m07. Semantic assertions only: the
// whole real course validates, every page maps 1:1, the module is COMPLETE (manifest ↔ body), the book's own
// simplified IP rules are present as written (no outside rule substituted), every technical token is authored LTR,
// the two exercises carry no answers, and nothing from Unit 4 (PDF 34+) is converted.
import { describe, it, expect } from "vitest";
import m01 from "./modules/m01";
import m02 from "./modules/m02";
import m07 from "./modules/m07";
import manifest from "./manifest";
import { validateLearningCourseContent } from "../validation";
import { LEARNING_CONTENT_SCHEMA_VERSION, type LearningCourseContent, type ContentBlock, type ContentPage, type PracticeTableSelectCell } from "../types";

const course: LearningCourseContent = {
  schemaVersion: LEARNING_CONTENT_SCHEMA_VERSION, courseId: "791381", title: "شبكات الاتصال", direction: "rtl",
  modules: [m01, m02, m07],
};
const pages = m07.lessons.flatMap(l => l.pages);
const pageBy = (id: string): ContentPage => pages.find(p => p.id === id)!;
const blockBy = (p: ContentPage, id: string): ContentBlock => p.blocks.find(b => b.id === id)!;
const plain = (p: ContentPage): string => JSON.stringify(p.blocks);
/** Every dir:"ltr" span text on a page (+ every cell of an ltr table column) — what the student sees LTR. */
const ltrText = (p: ContentPage): string[] => {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      const o = v as { dir?: string; text?: string };
      if (o.dir === "ltr" && typeof o.text === "string") out.push(o.text);
      for (const val of Object.values(v)) walk(val);   // strings are no-ops; list items carry `text` ARRAYS
    }
  };
  walk(p.blocks);
  for (const b of p.blocks) if ((b.type === "table" || b.type === "practice-table") && b.columnDirs) {
    b.rows.forEach(row => row.forEach((cell, c) => { if (b.columnDirs![c] === "ltr" && typeof cell === "string" && cell) out.push(cell); }));
  }
  return out;
};

const MAP: Record<string, [number, number | undefined, string]> = {
  "791381-m07-l00-p01": [24, undefined, "عناوين IP"],
  "791381-m07-l01-p01": [25, 23, "ما هو عنوان IP؟"],
  "791381-m07-l01-p02": [26, 24, "IPv4 و IPv6"],
  "791381-m07-l01-p03": [27, 25, "مبنى عنوان IPv4"],
  "791381-m07-l01-p04": [28, 26, "متى يكون عنوان IP غير صالح؟"],
  "791381-m07-l01-p05": [29, 27, "تدريب: صالح أو غير صالح؟"],
  "791381-m07-l02-p01": [30, 28, "عنوان خاص وعنوان عام"],
  "791381-m07-l02-p02": [31, 29, "مجالات العناوين الخاصة"],
  "791381-m07-l02-p03": [32, 30, "تدريب: خاص أم عام؟"],
  "791381-m07-l02-p04": [33, 31, "Static IP و Dynamic IP"],
};

describe("Phase 3E — validation, exact 1:1 mapping PDF 24–33, module completeness", () => {
  it("the REAL course (m01 + m02 + m07) produces ZERO validation issues", () => {
    expect(validateLearningCourseContent(course)).toEqual([]);
  });

  it("maps the ten Unit-3 pages 1:1 to PDF 24..33 (printed 23..31) with the rendered titles; no split/merge", () => {
    expect(pages.map(p => p.id).sort()).toEqual(Object.keys(MAP).sort());
    for (const [id, [pdf, printed, title]] of Object.entries(MAP)) {
      const p = pageBy(id);
      expect(p.source.sourceId, id).toBe("791381");
      expect(p.source.pdfPageStart, id).toBe(pdf);
      expect(p.source.printedPage, id).toBe(printed);
      expect(p.source.pdfPageEnd, id).toBeUndefined();
      expect(p.title, id).toBe(title);
      expect(p.blocks.length, id).toBeGreaterThan(0);
    }
    // reading order inside the module is the exact source sequence 24 → 33
    const ordered = [...m07.lessons].sort((a, b) => a.order - b.order).flatMap(l => [...l.pages].sort((a, b) => a.order - b.order));
    expect(ordered.map(p => p.source.pdfPageStart)).toEqual([24, 25, 26, 27, 28, 29, 30, 31, 32, 33]);
  });

  it("HARD STOP: no m07 body page (and no other real body) reaches PDF 34 — Unit 4 (CIDR/Subnet/Class) is not started", () => {
    for (const p of pages) expect(p.source.pdfPageStart, p.id).toBeLessThan(34);
    for (const p of [m01, m02].flatMap(m => m.lessons.flatMap(l => l.pages))) expect(p.source.pdfPageStart).toBeLessThan(24);
    const json = JSON.stringify(m07);
    for (const banned of ["CIDR", "Subnet", "قناع", "Class A/B/C", "network bits", "host bits"]) expect(json, banned).not.toContain(banned);
  });

  it("m07 is COMPLETE: manifest page ids ↔ body page ids match exactly, order 3, no partial flag", () => {
    const mm = manifest.modules.find(m => m.id === "791381-m07")!;
    expect(mm.order).toBe(3);
    expect(m07.order).toBe(3);
    expect(m07.partial).toBeFalsy();
    expect(mm.lessons.flatMap(l => l.pages.map(p => p.id)).sort()).toEqual(pages.map(p => p.id).sort());
    for (const l of mm.lessons) {
      const body = m07.lessons.find(x => x.id === l.id)!;
      expect(body.order, l.id).toBe(l.order);
      expect(body.title, l.id).toBe(l.title);
      for (const p of l.pages) {
        const bp = pageBy(p.id);
        expect(bp.order, p.id).toBe(p.order);
        expect(bp.title, p.id).toBe(p.title);
        expect(bp.source.pdfPageStart, p.id).toBe(p.source!.pdfPageStart);
      }
    }
  });
});

describe("Phase 3E — key source facts, page by page (rendered book is authoritative)", () => {
  it("PDF 24: the generic unit-opener with the book's label, number, subtitle and goal — nothing invented", () => {
    const p = pageBy("791381-m07-l00-p01");
    expect(p.layout).toBe("opener");
    const o = blockBy(p, "m07-l00-p01-opener");
    expect(o.type === "unit-opener" && o.unitLabel === "الوحدة الثالثة" && o.unitNumber === "03" && o.title === "عناوين IP").toBe(true);
    expect(o.type === "unit-opener" && o.subtitle).toBe("ما هو عنوان IP؟ وما الفرق بين العام والخاص؟");
    expect(o.type === "unit-opener" && o.goal).toBe("الهدف: فكرة أساسية + مثال واضح + تدريب");
    expect(p.blocks.length).toBe(1);
  });

  it("PDF 25: the house-address analogy is BOOK content; function + summary callouts verbatim", () => {
    const p = pageBy("791381-m07-l01-p01");
    const def = blockBy(p, "m07-l01-p01-def");
    expect(def.origin).toBe("book");
    expect(def.type === "text" && def.spans.map(s => s.text).join("")).toBe(
      "عنوان IP هو رقم خاص لكل جهاز على الشبكة. يشبه عنوان البيت: بدون عنوان لا تصل الرسالة إلى المكان الصحيح.");
    expect(plain(p)).toContain("يحدّد موقع الجهاز على الشبكة، ويساعد في إرسال واستقبال البيانات.");
    expect(plain(p)).toContain("كل جهاز يحتاج عنوانًا ليتواصل مع باقي الأجهزة.");
  });

  it("PDF 26: IPv4 / IPv6 with the exact examples as LTR tokens, and the book's IPv4 focus note", () => {
    const p = pageBy("791381-m07-l01-p02");
    const ltr = ltrText(p);
    expect(ltr).toContain("192.168.1.5");
    expect(ltr).toContain("2001:db8::1");
    expect(ltr).toContain("IPv4");
    // the two card titles are the pure-Latin tokens exactly as printed (inherently LTR runs)
    const versions = blockBy(p, "m07-l01-p02-versions");
    expect(versions.type === "list" && versions.items.map(i => i.term)).toEqual(["IPv4", "IPv6"]);
    expect(plain(p)).toContain("الأقدم والأكثر استعمالًا، ويتكوّن من أرقام فقط.");
    expect(plain(p)).toContain("الأحدث، ويحتوي أرقامًا وحروفًا معًا.");
    expect(plain(p)).toContain("لأنه الأساس في تدريبات الشبكات والامتحانات.");
  });

  it("PDF 27: four octets 0–255, the three source examples, the source WARNING, and the octets activity (enrichment, PDF 27)", () => {
    const p = pageBy("791381-m07-l01-p03");
    expect(plain(p)).toContain("من 4 أقسام (");
    expect(plain(p)).toContain("كل قسم بين 0 و 255.");
    expect(ltrText(p)).toContain("0-255 . 0-255 . 0-255 . 0-255");
    for (const ip of ["192.168.100.10", "100.200.10.20", "240.200.0.20"]) expect(ltrText(p)).toContain(ip);
    expect(plain(p)).toContain("وجود 4 أقسام لا يعني أن العنوان صالح دائمًا للحاسوب؛ هناك قواعد إضافية سنراها في الشريحة التالية.");
    const a = blockBy(p, "m07-l01-p03-octets");
    expect(a.type).toBe("interactive-diagram");
    expect(a.origin).toBe("teacher-enrichment");
    expect(a.type === "interactive-diagram" && a.interactionType).toBe("ipv4-octets");
    expect(a.type === "interactive-diagram" && a.version).toBe(1);
    expect(a.source?.pdfPageStart).toBe(27);
    expect(a.type === "interactive-diagram" && (a.config as { address?: string }).address).toBe("192.168.100.10");
    // strictly PDF 27's concept: the activity carries no validity/CIDR/mask/class wording
    expect(JSON.stringify(a)).not.toMatch(/صالح|CIDR|Subnet|Class|قناع/);
  });

  it("PDF 28: the book's FIVE school rules as written (incl. Localhost/127 and APIPA 169.254.x.x) + the 192.255.10.10 middle-octet nuance", () => {
    const p = pageBy("791381-m07-l01-p04");
    const rules = blockBy(p, "m07-l01-p04-rules");
    if (rules.type !== "list") throw new Error("no rules list");
    const ruleText = rules.items.map(it => it.text.map(s => s.text).join(""));
    expect(ruleText).toEqual([
      "لا يبدأ العنوان بـ 0 أو 255.",
      "لا ينتهي العنوان بـ 0 أو 255.",
      "لا يزيد أي قسم عن 255، فالمجال من 0 إلى 255.",
      "لا يبدأ بـ 127 لأنه Localhost.",
      "لا يكون من المجال 169.254.x.x (APIPA).",
    ]);
    expect(rules.origin).toBe("book");
    // examples
    expect(ltrText(p)).toContain("192.168.10.1");
    expect(ltrText(p)).toContain("192.168.10.255");
    expect(ltrText(p)).toContain("192.168.300.10");
    expect(plain(p)).toContain("القسم 300 أكبر من 255.");
    // the source's own nuance — never "corrected" with outside subnetting knowledge
    expect(plain(p)).toContain("الرقم 255 ممنوع في القسم الأول والأخير فقط؛ أما في الوسط — مثل ");
    expect(ltrText(p)).toContain("192.255.10.10");
    expect(plain(p)).toContain(" — فالعنوان صالح.");
    // no outside rule silently substituted
    expect(plain(p)).not.toMatch(/subnet|broadcast address of the|network address|\/24|قناع/i);
  });

  it("PDF 28 guided reveal: exact guided/reveal/v1, enrichment, source PDF 28, steps = the page's five rules, NO PDF-29 answers", () => {
    const p = pageBy("791381-m07-l01-p04");
    const g = blockBy(p, "m07-l01-p04-guided");
    if (g.type !== "guided") throw new Error("no guided block");
    expect(g.guidedType).toBe("reveal");
    expect(g.version).toBe(1);
    expect(g.origin).toBe("teacher-enrichment");
    expect(g.source?.pdfPageStart).toBe(28);
    expect(g.title).toBe("كيف نفحص إن كان العنوان صالحًا حسب قواعد هذه الصفحة؟");
    const rules = blockBy(p, "m07-l01-p04-rules");
    const ruleText = rules.type === "list" ? rules.items.map(it => it.text.map(s => s.text).join("")) : [];
    expect(g.steps.map(s => s.text.map(x => x.text).join(""))).toEqual(ruleText);   // no new rules
    const json = JSON.stringify(g);
    for (const trainingAddr of ["127.11.10.1", "169.169.10.10", "169.254.10.234"]) expect(json).not.toContain(trainingAddr);
    expect(json).not.toMatch(/correct|feedback|score/i);
  });

  it("PDF 29: the worksheet — all five source addresses (LTR), the صالح/غير صالح column as the book's own two-word choice checked in place, السبب blank", () => {
    const p = pageBy("791381-m07-l01-p05");
    const t = blockBy(p, "m07-l01-p05-table");
    if (t.type !== "practice-table") throw new Error("no practice table");
    expect(t.headers).toEqual(["العنوان", "صالح / غير صالح", "السبب"]);
    expect(t.columnDirs).toEqual(["ltr", "rtl", "rtl"]);
    expect(t.rows.map(r => r[0])).toEqual(["192.168.10.1", "192.255.10.10", "127.11.10.1", "169.169.10.10", "169.254.10.234"]);
    const choice = (r: (typeof t.rows)[number]) => r[1] as PracticeTableSelectCell;
    for (const r of t.rows) {
      expect(choice(r).kind).toBe("select");
      expect(choice(r).options).toEqual(["صالح", "غير صالح"]);   // the printed column's vocabulary, nothing else
      expect(r[2]).toBe("");                                        // the reason column stays the learner's (blank, as printed)
    }
    // the expected choices follow the book's OWN PDF-28 rules (127 = Localhost, 169.254 = APIPA; 255 only forbidden as the FIRST number)
    expect(t.rows.map(r => choice(r).key)).toEqual(["صالح", "صالح", "غير صالح", "صالح", "غير صالح"]);
    expect(plain(p)).toContain("حلّ الجدول بنفسك أولًا، ثم راجع القواعد في الشريحة السابقة للتأكد.");
    expect(p.blocks.some(b => b.type === "practice")).toBe(false);   // no quiz block — the worksheet itself is the exercise
  });

  it("PDF 30: Public/Private with the exact examples (8.8.8.8 / 192.168.1.5) and the book's important note", () => {
    const p = pageBy("791381-m07-l02-p01");
    expect(ltrText(p)).toContain("8.8.8.8");
    expect(ltrText(p)).toContain("192.168.1.5");
    const kinds = blockBy(p, "m07-l02-p01-kinds");
    expect(kinds.type === "list" && kinds.items.map(i => i.term)).toEqual(["Public IP — عام", "Private IP — خاص"]);
    expect(plain(p)).toContain("عنوان يمكن الوصول إليه من الإنترنت، يُستخدم للمواقع والسيرفرات.");
    expect(plain(p)).toContain("عنوان يُستخدم داخل شبكة محلية فقط، مثل البيت أو المدرسة.");
    expect(plain(p)).toContain("العنوان الخاص لا يُستخدم مباشرة على الإنترنت العام، بل داخل الشبكة المحلية فقط.");
  });

  it("PDF 31: the private-range table EXACTLY as rendered (Class A/B/C ↔ pattern ↔ example) + the 172 second-octet 16–31 rule", () => {
    const p = pageBy("791381-m07-l02-p02");
    const t = blockBy(p, "m07-l02-p02-table");
    if (t.type !== "table") throw new Error("no table");
    expect(t.headers).toEqual(["الفئة", "العنوان الخاص", "مثال"]);
    expect(t.rows).toEqual([
      ["Class A", "10.x.x.x", "10.0.0.1"],
      ["Class B", "172.16 - 172.31", "172.23.100.13"],
      ["Class C", "192.168.x.x", "192.168.100.6"],
    ]);
    expect(t.columnDirs).toEqual(["ltr", "ltr", "ltr"]);
    expect(plain(p)).toContain("يجب أن يكون القسم الثاني بين 16 و 31 فقط ليكون العنوان خاصًا.");
    expect(ltrText(p)).toContain("10");
    expect(ltrText(p)).toContain("192.168");
    expect(plain(p)).toContain("فغالبًا أنت أمام عنوان خاص.");
    expect(plain(p)).not.toMatch(/\/8|\/12|\/16|CIDR/);   // no CIDR notation — the page has none
  });

  it("PDF 32: the exact five PC/address rows with خاص/عام as the book's own two-word choice checked in place + the 192.167 ≠ 192.168 warning", () => {
    const p = pageBy("791381-m07-l02-p03");
    const t = blockBy(p, "m07-l02-p03-table");
    if (t.type !== "practice-table") throw new Error("no practice table");
    expect(t.headers).toEqual(["الجهاز", "العنوان", "خاص / عام"]);
    expect(t.rows.map(r => [r[0], r[1]])).toEqual([
      ["PC1", "192.167.100.2"], ["PC2", "10.100.10.10"], ["PC3", "172.16.32.30"], ["PC4", "220.100.100.100"], ["PC5", "9.10.11.12"],
    ]);
    const choice = (r: (typeof t.rows)[number]) => r[2] as PracticeTableSelectCell;
    for (const r of t.rows) expect(choice(r).options).toEqual(["خاص", "عام"]);
    // expected choices per the PDF-31 private ranges (10.x / 172.16–31 / 192.168.x) — 192.167 is NOT 192.168
    expect(t.rows.map(r => choice(r).key)).toEqual(["عام", "خاص", "خاص", "عام", "عام"]);
    expect(t.columnDirs).toEqual(["ltr", "ltr", "rtl"]);
    expect(ltrText(p)).toContain("192.167");
    expect(ltrText(p)).toContain("192.168");
    expect(plain(p)).toContain("افحص الأرقام بدقة قبل الحكم.");
    expect(p.blocks.some(b => b.type === "practice")).toBe(false);
  });

  it("PDF 33: Dynamic vs Static as written; Static = ثابت / Dynamic = متغيّر; it is the module's last page", () => {
    const p = pageBy("791381-m07-l02-p04");
    expect(plain(p)).toContain("عنوان يتغيّر من وقت لآخر، وقد يتغيّر عند إعادة تشغيل المودم. مناسب للبيوت والشركات الصغيرة.");
    expect(plain(p)).toContain("عنوان ثابت لا يتغيّر إلا إذا غيّرناه يدويًا. مناسب للطابعات والكاميرات والسيرفرات.");
    const diff = blockBy(p, "m07-l02-p04-diff");
    expect(diff.type === "callout" && diff.spans.map(s => s.text).join("")).toBe("Dynamic = متغيّر · Static = ثابت");
    expect(ltrText(p)).toContain("Static");
    expect(ltrText(p)).toContain("Dynamic");
    expect(Math.max(...pages.map(x => x.source.pdfPageStart))).toBe(33);
  });
});

describe("Phase 3E — LTR technical tokens are authored explicitly LTR (never reversed under RTL)", () => {
  it("every representative address / protocol token appears as a dir:ltr span or an ltr table column", () => {
    const all = pages.flatMap(ltrText);
    for (const tok of [
      "IPv4", "192.168.1.5", "2001:db8::1", "192.168.100.10", "192.255.10.10", "169.254.10.234",
      "8.8.8.8", "172.16.32.30", "169.254.x.x", "Localhost", "APIPA", "192.167", "172.16 - 172.31", "220.100.100.100",
    ]) expect(all, tok).toContain(tok);
    // no reversed-octet form anywhere in the module
    const json = JSON.stringify(m07);
    for (const rev of ["5.1.168.192", "10.100.168.192", "234.10.254.169", "30.32.16.172", "2.100.167.192"]) expect(json).not.toContain(rev);
  });
});

describe("Phase 3E — provenance + answer-key safety", () => {
  it("exactly TWO enrichment blocks (the octets diagram and the PDF-28 guided reveal); every other block is origin:book", () => {
    const enrich: string[] = [];
    for (const p of pages) for (const b of p.blocks) {
      if (b.origin === "teacher-enrichment") enrich.push(b.id);
      else expect(b.origin, b.id).toBe("book");
    }
    expect(enrich).toEqual(["m07-l01-p03-octets", "m07-l01-p04-guided"]);
    // an enrichment surface never claims book provenance in its wording
    expect(JSON.stringify(m07)).not.toContain("من الكتاب");
  });

  it("adds NO practice blocks, NO answer keys, NO evaluator/feedback/score, NO image/iframe/PDF/external link", () => {
    expect(pages.some(p => p.blocks.some(b => b.type === "practice"))).toBe(false);
    expect(pages.some(p => p.blocks.some(b => b.type === "image" || b.type === "diagram" || b.type === "simulation" || b.type === "animation"))).toBe(false);
    const json = JSON.stringify(m07);
    for (const banned of ["<iframe", ".pdf", "http", "correct", "feedback", "PracticeFeedback", "score", "evaluator", "answer", "الإجابة الصحيحة"]) {
      expect(json, banned).not.toContain(banned);
    }
  });
});
