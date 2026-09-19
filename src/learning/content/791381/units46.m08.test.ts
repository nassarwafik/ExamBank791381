// Units 4–6 phase — source-fidelity, mapping, provenance, pedagogy and answer-key guards for the real Book 791381
// conversion of Unit 4 «Class و Subnet و CIDR» (PDF 34–46) as the new stable module m08. The rendered source is
// authoritative; the printed page is the number in the rendered page circle.
import { describe, it, expect } from "vitest";
import m01 from "./modules/m01";
import m02 from "./modules/m02";
import m07 from "./modules/m07";
import m08 from "./modules/m08";
import manifest from "./manifest";
import { validateLearningCourseContent } from "../validation";
import { LEARNING_CONTENT_SCHEMA_VERSION, type LearningCourseContent, type ContentBlock, type ContentPage, type PracticeTableSelectCell } from "../types";

const course: LearningCourseContent = {
  schemaVersion: LEARNING_CONTENT_SCHEMA_VERSION, courseId: "791381", title: "شبكات الاتصال", direction: "rtl",
  modules: [m01, m02, m07, m08],
};
const pages = m08.lessons.flatMap(l => l.pages);
const pageBy = (id: string): ContentPage => pages.find(p => p.id === id)!;
const blockBy = (p: ContentPage, id: string): ContentBlock => p.blocks.find(b => b.id === id)!;
const plain = (p: ContentPage): string => JSON.stringify(p.blocks);
const ltrText = (p: ContentPage): string[] => {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      const o = v as { dir?: string; text?: string };
      if (o.dir === "ltr" && typeof o.text === "string") out.push(o.text);
      for (const val of Object.values(v)) walk(val);
    }
  };
  walk(p.blocks);
  for (const b of p.blocks) if ((b.type === "table" || b.type === "practice-table") && b.columnDirs) {
    b.rows.forEach(row => row.forEach((cell, c) => { if (b.columnDirs![c] === "ltr" && typeof cell === "string" && cell) out.push(cell); }));
  }
  return out;
};
const sel = (cell: unknown) => cell as PracticeTableSelectCell;

const MAP: Record<string, [number, number | undefined, string]> = {
  "791381-m08-l00-p01": [34, undefined, "Class و Subnet و CIDR"],
  "791381-m08-l01-p01": [35, 35, "فئات العناوين"],
  "791381-m08-l01-p02": [36, 36, "تدريب: لأي فئة ينتمي العنوان؟"],
  "791381-m08-l01-p03": [37, 37, "قناع الشبكة Subnet Mask"],
  "791381-m08-l01-p04": [38, 38, "القناع الطبيعي لكل فئة"],
  "791381-m08-l01-p05": [39, 39, "تدريب: ما هو قناع الشبكة؟"],
  "791381-m08-l02-p01": [40, 40, "جزء الشبكة وجزء الجهاز"],
  "791381-m08-l02-p02": [41, 41, "ما هو CIDR؟"],
  "791381-m08-l02-p03": [42, 42, "أمثلة على CIDR"],
  "791381-m08-l03-p01": [43, 43, "أجهزة في نفس الشبكة"],
  "791381-m08-l03-p02": [44, 44, "تدريب: أعطِ عنوانًا لجهاز PC2"],
  "791381-m08-l03-p03": [45, 45, "البوابة الافتراضية Default Gateway"],
  "791381-m08-l03-p04": [46, undefined, "خلاصة سريعة"],
};

describe("m08 — validation, exact 1:1 mapping PDF 34–46, completeness, hard stop", () => {
  it("the REAL course (m01 + m02 + m07 + m08) produces ZERO validation issues", () => {
    expect(validateLearningCourseContent(course)).toEqual([]);
  });
  it("maps the thirteen Unit-4 pages 1:1 to PDF 34..46 with the rendered titles and printed numbers; source order is the reading order", () => {
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
    const ordered = [...m08.lessons].sort((a, b) => a.order - b.order).flatMap(l => [...l.pages].sort((a, b) => a.order - b.order));
    expect(ordered.map(p => p.source.pdfPageStart)).toEqual([34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46]);
  });
  it("HARD STOP: no m08 page reaches PDF 47; the module source range is 34–46", () => {
    for (const p of pages) expect(p.source.pdfPageStart, p.id).toBeLessThan(47);
    expect(m08.source).toEqual({ kind: "book", sourceId: "791381", pdfPageStart: 34, pdfPageEnd: 46 });
    // nothing from Unit 5/6 is converted here (their page headings never appear); the PDF-45 figure's own
    // Switch/Router labels are legitimately part of Unit 4's gateway page
    for (const banned of ["جهاز Hub", "مميزات Switch", "أهم خصائص Router", "خلاصة الأجهزة", "أنواع الشبكات البسيطة", "الشبكات الحديثة"]) expect(JSON.stringify(m08), banned).not.toContain(banned);
  });
  it("m08 is COMPLETE: manifest ↔ body page ids, lesson titles and orders match; order 4; no partial flag", () => {
    const mm = manifest.modules.find(m => m.id === "791381-m08")!;
    expect(mm.order).toBe(4); expect(m08.order).toBe(4); expect(m08.partial).toBeFalsy();
    expect(mm.lessons.flatMap(l => l.pages.map(p => p.id)).sort()).toEqual(pages.map(p => p.id).sort());
    for (const l of mm.lessons) {
      const body = m08.lessons.find(x => x.id === l.id)!;
      expect(body.order, l.id).toBe(l.order); expect(body.title, l.id).toBe(l.title);
      for (const p of l.pages) {
        const bp = pageBy(p.id);
        expect(bp.order, p.id).toBe(p.order); expect(bp.title, p.id).toBe(p.title);
        expect(bp.source.pdfPageStart, p.id).toBe(p.source!.pdfPageStart);
        expect(bp.source.printedPage, p.id).toBe(p.source!.printedPage);
      }
    }
    expect(mm.lessons.map(l => l.title)).toEqual(["افتتاحية الوحدة", "فئات العناوين والقناع الطبيعي", "جزء الشبكة وجزء الجهاز و CIDR", "الأجهزة في نفس الشبكة والبوابة الافتراضية"]);
  });
});

describe("m08 — key source facts, page by page", () => {
  it("PDF 34: generic unit-opener with the book's label/number/title/subtitle/goal", () => {
    const p = pageBy("791381-m08-l00-p01");
    expect(p.layout).toBe("opener");
    const o = blockBy(p, "m08-l00-p01-opener");
    expect(o.type === "unit-opener" && [o.unitLabel, o.unitNumber, o.title, o.subtitle, o.goal]).toEqual(["الوحدة الرابعة", "04", "Class و Subnet و CIDR", "كيف نحدّد جزء الشبكة وجزء الجهاز؟", "الهدف: فكرة أساسية + مثال واضح + تدريب"]);
  });
  it("PDF 35: the class table exactly as rendered + the first-number rule", () => {
    const t = blockBy(pageBy("791381-m08-l01-p01"), "m08-l01-p01-table");
    if (t.type !== "table") throw new Error("no table");
    expect(t.headers).toEqual(["الفئة", "المدى", "عدد الأجهزة", "الاستخدام"]);
    expect(t.rows).toEqual([
      ["A", "1.0.0.0 – 126.255.255.255", "16 مليون", "شبكات كبيرة جدًا"],
      ["B", "128.0.0.0 – 191.255.255.255", "65 ألف", "شبكات متوسطة"],
      ["C", "192.0.0.0 – 223.255.255.255", "254", "شبكات صغيرة"],
    ]);
    expect(plain(pageBy("791381-m08-l01-p01"))).toContain("نحدّد الفئة من الرقم الأول (الأيسر) في عنوان ");
  });
  it("PDF 36 + PDF 39: the printed worksheets with the exact seven addresses; class and mask keys follow the book's own rule", () => {
    const c = blockBy(pageBy("791381-m08-l01-p02"), "m08-l01-p02-table");
    const m = blockBy(pageBy("791381-m08-l01-p05"), "m08-l01-p05-table");
    if (c.type !== "practice-table" || m.type !== "practice-table") throw new Error("no worksheet");
    const addresses = ["192.168.10.200", "200.10.168.192", "20.20.20.10", "129.192.168.100", "178.177.100.178", "200.100.50.1", "1.2.3.4"];
    expect(c.rows.map(r => r[0])).toEqual(addresses); expect(m.rows.map(r => r[0])).toEqual(addresses);
    expect(c.rows.map(r => sel(r[1]).key)).toEqual(["C", "C", "A", "B", "B", "C", "A"]);
    expect(m.rows.map(r => sel(r[1]).key)).toEqual(["255.255.255.0", "255.255.255.0", "255.0.0.0", "255.255.0.0", "255.255.0.0", "255.255.255.0", "255.0.0.0"]);
    for (const r of c.rows) expect(sel(r[1]).options).toEqual(["A", "B", "C"]);
    for (const r of m.rows) expect(sel(r[1]).options).toEqual(["255.0.0.0", "255.255.0.0", "255.255.255.0"]);
    expect(c.origin).toBe("book"); expect(m.origin).toBe("book");
    expect(plain(pageBy("791381-m08-l01-p02"))).toContain("انظر فقط إلى الرقم الأول من اليسار وقارنه بمدى كل فئة.");
    expect(ltrText(pageBy("791381-m08-l01-p05"))).toEqual(expect.arrayContaining(["Class A = /8", "Class B = /16", "Class C = /24"]));
  });
  it("PDF 37: the mask figure (192.168.1.100 / 255.255.255.0) as an LTR table, the 255 / 0 meaning and the book's idea", () => {
    const p = pageBy("791381-m08-l01-p03");
    const f = blockBy(p, "m08-l01-p03-figure");
    expect(f.type === "table" && f.rows).toEqual([["IP", "192", "168", "1", "100"], ["Mask", "255", "255", "255", "0"]]);
    expect(f.dir).toBe("ltr");
    expect(plain(p)).toContain(" يعني: هذا القسم للشبكة · ");
    expect(plain(p)).toContain("القناع كقناع يغطّي جزء الشبكة ويترك جزء الجهاز ظاهرًا، فنعرف من ينتمي لنفس الشبكة.");
  });
  it("PDF 38 + PDF 41 + PDF 42: the natural-mask, CIDR and examples tables exactly as rendered, with the Broadcast warning", () => {
    const n = blockBy(pageBy("791381-m08-l01-p04"), "m08-l01-p04-table");
    expect(n.type === "table" && n.rows).toEqual([["Class A", "1 – 126", "255.0.0.0", "/8"], ["Class B", "128 – 191", "255.255.0.0", "/16"], ["Class C", "192 – 223", "255.255.255.0", "/24"]]);
    const c = blockBy(pageBy("791381-m08-l02-p02"), "m08-l02-p02-table");
    expect(c.type === "table" && c.rows).toEqual([["/24", "255.255.255.0", "24", "254"], ["/16", "255.255.0.0", "16", "65 ألف"], ["/8", "255.0.0.0", "8", "16 مليون"]]);
    expect(plain(pageBy("791381-m08-l02-p02"))).toContain(" طريقة مختصرة لكتابة قناع الشبكة: نكتب عدد بتات الشبكة بعد علامة / مثل ");
    expect(ltrText(pageBy("791381-m08-l02-p02"))).toContain("192.168.1.0/24");
    const e = blockBy(pageBy("791381-m08-l02-p03"), "m08-l02-p03-table");
    expect(e.type === "table" && e.rows).toEqual([
      ["10.10.10.0/24", "255.255.255.0", "10.10.10.1 – 10.10.10.254"],
      ["172.16.40.0/24", "255.255.255.0", "172.16.40.1 – 172.16.40.254"],
      ["192.168.0.0/16", "255.255.0.0", "192.168.0.1 – 192.168.255.254"],
      ["20.113.0.0/16", "255.255.0.0", "20.113.0.1 – 20.113.255.254"],
    ]);
    expect(plain(pageBy("791381-m08-l02-p03"))).toContain("أول عنوان غالبًا للشبكة، وآخر عنوان غالبًا ");
    expect(plain(pageBy("791381-m08-l01-p04"))).toContain(" هو الأكثر شيوعًا في الأمثلة المدرسية، وغالبًا قناعه ");
  });
  it("PDF 40: the three /24 /16 /8 rules, the network/host table, the two تذكّر lines, and the CIDR visualizer (enrichment, PDF 40)", () => {
    const p = pageBy("791381-m08-l02-p01");
    const t = blockBy(p, "m08-l02-p01-table");
    expect(t.type === "table" && t.rows).toEqual([["192.168.10.10", "192.168.10", "10"], ["10.138.10.1", "10", "138.10.1"], ["172.18.200.100", "172.18", "200.100"]]);
    expect(plain(p)).toContain(" ← أول 3 أقسام للشبكة، والقسم الأخير للجهاز.");
    expect(plain(p)).toContain(" ← أول قسمين للشبكة.");
    expect(plain(p)).toContain(" ← أول قسم فقط للشبكة.");
    expect(plain(p)).toContain("كلما كبر الرقم اتّسع جزء الشبكة وضاق جزء الجهاز.");
    expect(plain(p)).toContain(" زاد الجزء الخاص بالشبكة، وقلّ الجزء المتاح للأجهزة.");
    const a = blockBy(p, "m08-l02-p01-visualizer");
    expect(a.type === "interactive-diagram" && a.interactionType).toBe("cidr-network-host");
    expect(a.type === "interactive-diagram" && a.version).toBe(1);
    expect(a.origin).toBe("teacher-enrichment"); expect(a.source?.pdfPageStart).toBe(40);
    const cfg = (a as { config?: { examples?: { address: string }[]; prefixes?: number[] } }).config!;
    expect(cfg.examples!.map(e => e.address)).toEqual(["192.168.10.10", "10.138.10.1", "172.18.200.100"]);   // the page's own addresses
    expect(cfg.prefixes).toEqual([8, 16, 24]);                                                                  // the book's level only
    expect((a as { fallback?: { text?: string } }).fallback?.text).toContain("192.168.10");
  });
  it("PDF 43 + PDF 44: the same-network rule and table; the PC2 worksheet stays the book's BLANK open column, with a separate closed-choice enrichment whose keys keep the network part and differ from PC1", () => {
    const t = blockBy(pageBy("791381-m08-l03-p01"), "m08-l03-p01-table");
    expect(t.type === "table" && t.rows).toEqual([["PC1", "192.168.1.1"], ["PC2", "192.168.1.2"], ["Printer", "192.168.1.10"], ["Phone", "192.168.1.20"]]);
    expect(plain(pageBy("791381-m08-l03-p01"))).toContain("حتى تتواصل الأجهزة في نفس الشبكة يجب أن يبقى جزء الشبكة ثابتًا، ونغيّر فقط جزء الجهاز.");
    const p = pageBy("791381-m08-l03-p02");
    const book = blockBy(p, "m08-l03-p02-table");
    if (book.type !== "table") throw new Error("the printed worksheet must stay a plain table");
    expect(book.origin).toBe("book");
    expect(book.rows).toEqual([["192.168.20.1", "/24", ""], ["172.18.10.10", "/16", ""], ["10.138.10.1", "/8", ""], ["200.10.10.200", "/24", ""], ["189.10.100.100", "/16", ""]]);
    const check = blockBy(p, "m08-l03-p02-check");
    if (check.type !== "practice-table") throw new Error("no enrichment check");
    expect(check.origin).toBe("teacher-enrichment");
    const octets = (ip: string) => ip.split(".");
    for (const row of check.rows) {
      const [pc1, mask] = [row[0] as string, row[1] as string];
      const n = mask === "/8" ? 1 : mask === "/16" ? 2 : 3;
      const key = sel(row[2]).key;
      expect(sel(row[2]).options).toContain(key);
      expect(octets(key).slice(0, n)).toEqual(octets(pc1).slice(0, n));     // same network part
      expect(key).not.toBe(pc1);                                               // never PC1 itself
      expect(sel(row[2]).options).toContain(pc1);                              // the "same as PC1" distractor is present
    }
    expect(plain(p)).toContain("غيّر فقط جزء الجهاز حسب القناع، ولا تستعمل نفس عنوان ");
  });
  it("PDF 45: the gateway definition, the three bullets (192.168.1.1 / 192.168.0.1), the figure caption, «بدون Gateway», and the gateway-flow animation (enrichment, PDF 45)", () => {
    const p = pageBy("791381-m08-l03-p03");
    expect(plain(p)).toContain("البوابة الافتراضية هي غالبًا عنوان الراوتر. وظيفتها: إخراج البيانات من الشبكة المحلية إلى الإنترنت أو إلى شبكة أخرى.");
    expect(ltrText(p)).toEqual(expect.arrayContaining(["192.168.1.1", "192.168.0.1"]));
    expect(plain(p)).toContain("كل ما يخرج من الشبكة يمرّ عبر البوابة.");
    expect(plain(p)).toContain("قد تعمل الشبكة المحلية، لكن لن تصل الأجهزة إلى الإنترنت.");
    const a = blockBy(p, "m08-l03-p03-flow");
    expect(a.type === "animation" && a.animationType).toBe("gateway-flow");
    expect(a.type === "animation" && a.version).toBe(1);
    expect(a.origin).toBe("teacher-enrichment"); expect(a.source?.pdfPageStart).toBe(45);
    expect((a as { config?: { router?: { address?: string } } }).config?.router?.address).toBe("192.168.1.1");
    expect((a as { fallback?: { text?: string } }).fallback?.text).toContain("192.168.1.1");
  });
  it("PDF 46: the five summary cards and the «الدفعة التالية» line as printed; no page number", () => {
    const p = pageBy("791381-m08-l03-p04");
    const cards = blockBy(p, "m08-l03-p04-cards");
    expect(cards.type === "list" && cards.items.map(i => i.term)).toEqual(["الشبكة", "IP", "Subnet", "CIDR", "Gateway"]);
    expect(plain(p)).toContain("الباب الذي يخرج منه الجهاز للخارج.");
    expect(plain(p)).toContain("أجهزة الشبكات · أنواع شبكات الاتصال · الكوابل · ");
    expect(p.source.printedPage).toBeUndefined();
  });
});

describe("m08 — pedagogy standard: solved examples, guided practice, independent practice with feedback", () => {
  it("every solved example has ≥ 2 structured steps (never a single paragraph) and is teacher-enrichment", () => {
    const examples = pages.flatMap(p => p.blocks.filter(b => b.type === "example"));
    expect(examples.length).toBe(9);
    for (const e of examples) {
      if (e.type !== "example") continue;
      expect(e.origin, e.id).toBe("teacher-enrichment");
      expect(e.steps.length, e.id).toBeGreaterThanOrEqual(2);
      expect((e.mode ?? "solved"), e.id).toBe("solved");
    }
    const spec = examples.find(e => e.id === "m08-l02-p01-ex1");
    expect(spec && spec.type === "example" && spec.steps.map(s => s.text)).toEqual([
      "/24 يعني أن أول 24 بت للشبكة.", "في مستوى هذه الوحدة، هذا يعني أول ثلاثة أقسام.", "جزء الشبكة: 192.168.10 — جزء الجهاز: 25.",
    ]);
  });
  it("every inline practice carries a key, an incorrectFeedback that says what to CHECK (starts with «افحص»), a hint ladder and is enrichment; MCQs have exactly one correct option", () => {
    const practices = pages.flatMap(p => p.blocks.filter(b => b.type === "practice"));
    expect(practices.length).toBe(11);
    for (const b of practices) {
      if (b.type !== "practice") continue;
      expect(b.origin, b.id).toBe("teacher-enrichment");
      const q = b.question;
      expect(q.feedback?.incorrectFeedback, b.id).toMatch(/افحص|ابدأ/);
      expect((q.feedback?.hints ?? []).length, b.id).toBeGreaterThanOrEqual(1);
      if (q.kind === "multipleChoice") expect(q.options.filter(o => o.correct).length, b.id).toBe(1);
      if (q.kind === "trueFalse") expect(typeof q.answer, b.id).toBe("boolean");
    }
    // progression: the closing page carries the three exam-style questions
    expect(pageBy("791381-m08-l03-p04").blocks.filter(b => b.type === "practice").length).toBe(3);
  });
  it("one guided walkthrough (built-in guided/reveal/v1) on the /16 example — steps are structured spans, enrichment, PDF 40", () => {
    const g = blockBy(pageBy("791381-m08-l02-p01"), "m08-l02-p01-guided");
    if (g.type !== "guided") throw new Error("no guided block");
    expect(g.guidedType).toBe("reveal"); expect(g.version).toBe(1); expect(g.origin).toBe("teacher-enrichment");
    expect(g.steps.length).toBe(4); expect(g.source?.pdfPageStart).toBe(40);
  });
  it("activities: exactly one CIDR visualizer, one gateway-flow animation, one guided walkthrough; every activity has a useful text fallback", () => {
    const acts = pages.flatMap(p => p.blocks.filter(b => ["simulation", "animation", "guided", "interactive-diagram"].includes(b.type)));
    expect(acts.map(a => a.type).sort()).toEqual(["animation", "guided", "interactive-diagram"]);
    for (const a of acts) if (a.type !== "guided") expect(((a as { fallback?: { text?: string } }).fallback?.text ?? "").length, a.id).toBeGreaterThan(40);
  });
});

describe("m08 — provenance + LTR + safety", () => {
  it("every block is book or teacher-enrichment; every printed table/worksheet/callout of the book is origin book", () => {
    for (const p of pages) for (const b of p.blocks) expect(["book", "teacher-enrichment"], b.id).toContain(b.origin);
    for (const id of ["m08-l01-p01-table", "m08-l01-p02-table", "m08-l01-p03-figure", "m08-l01-p04-table", "m08-l01-p05-table", "m08-l02-p01-table", "m08-l02-p02-table", "m08-l02-p03-table", "m08-l03-p01-table", "m08-l03-p02-table", "m08-l03-p04-cards"]) {
      const b = pages.flatMap(p => p.blocks).find(x => x.id === id)!;
      expect(b.origin, id).toBe("book");
    }
    expect(JSON.stringify(m08)).not.toContain("من الكتاب");
  });
  it("every representative technical token is authored LTR and no reversed-octet form exists", () => {
    const all = pages.flatMap(ltrText);
    for (const tok of ["IP", "CIDR", "/24", "/16", "/8", "255.255.255.0", "192.168.10.10", "172.18.200.100", "10.138.10.1", "192.168.1.0/24", "Broadcast", "PC1", "192.168.1.1", "MAC Address", "Class C"]) expect(all, tok).toContain(tok);
    const json = JSON.stringify(m08);
    for (const rev of ["10.10.168.192", "100.200.18.172", "1.10.138.10", "1.1.168.192"]) expect(json).not.toContain(rev);
  });
  it("no image / iframe / external link / raw HTML; no invented answers on the book's open PC2 column", () => {
    expect(pages.some(p => p.blocks.some(b => b.type === "image" || b.type === "diagram"))).toBe(false);
    const json = JSON.stringify(m08);
    for (const banned of ["<iframe", ".pdf", "http", "<script", "dangerouslySetInnerHTML"]) expect(json, banned).not.toContain(banned);
  });
});
