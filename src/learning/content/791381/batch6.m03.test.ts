// Batch 6 phase — the HISTORICAL skeleton module m03 («برمجة السويتش CLI و VLAN») COMPLETED IN PLACE for the book's
// section PDF 121–138 (PDF 120 is the «الدفعة الرابعة · برمجة السويتش و VLAN» cover, metadata only). Guards: the two
// historical page ids / titles / source mappings are IMMUTABLE, PDF 121–138 read in book order, PDF 120 is never a
// learner page, nothing from PDF 139+ (the centralised VLAN-management section, sub-interfaces, port security, ACL …)
// leaks, the loader / server registry / navigation / publication invariants hold, and the m05–m06 skeletons are untouched
// (Batch 7 later added m19 and completed m04 in place; the pins below were refreshed for that).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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
import m03 from "./modules/m03";
import manifest from "./manifest";
import { hasModuleContent, loadModuleContent } from "../registry";
import { nextPage, previousPage, orderedModules, flattenPageRefs } from "../navigation";
import { validateLearningCourseContent } from "../validation";
import { LEARNING_CONTENT_SCHEMA_VERSION, type LearningCourseContent, type ContentBlock, type ContentModule, type ContentPage, type PracticeTableSelectCell } from "../types";
// @ts-expect-error — the server registry is an untyped CommonJS module; it is imported here on purpose to cross-check it.
import * as apiRegistry from "../../../../api/src/lib/learning-materials-registry.js";

const PREV = [m01, m02, m07, m08, m09, m10, m11, m12, m13, m14, m15, m16, m17, m18];
const ALL = [...PREV, m03];
const course: LearningCourseContent = { schemaVersion: LEARNING_CONTENT_SCHEMA_VERSION, courseId: "791381", title: "شبكات الاتصال", direction: "rtl", modules: ALL };
const pagesOf = (m: ContentModule): ContentPage[] => [...m.lessons].sort((a, b) => a.order - b.order).flatMap(l => [...l.pages].sort((a, b) => a.order - b.order));
const pages = pagesOf(m03);
const pageBy = (id: string): ContentPage => pages.find(p => p.id === id)!;
const blockBy = (p: ContentPage, id: string): ContentBlock => p.blocks.find(b => b.id === id)!;
const plain = (p: ContentPage): string => JSON.stringify(p.blocks);
const sel = (cell: unknown) => cell as PracticeTableSelectCell;
const allBlocks = pages.flatMap(p => p.blocks);
const M03 = "791381-m03";
const byId = Object.fromEntries(manifest.modules.map(m => [m.id, m]));
const NEXT_SECTION_PDF = 139;
const server = () => (apiRegistry as unknown as { listLearningModules: (c: string) => { moduleId: string; title: string; order: number }[]; findLearningModule: (c: string, m: string) => unknown; validateLearningModuleIds: (c: string, ids: string[]) => string[] });

// PDF → [printed page, title, page id] — the two HISTORICAL pages keep the Phase-2 skeleton's printed numbers (121/122,
// the hidden text-layer running number); every NEW page follows the page circle = PDF index rule.
const MAP: Record<number, [number, string, string]> = {
  121: [121, "برمجة السويتش — CLI", "791381-m03-l01-p03"], 122: [122, "الدخول إلى وضع البرمجة", "791381-m03-l01-p04"],
  123: [121, "منافذ السويتش", "791381-m03-l01-p01"], 124: [122, "برمجة المنافذ من CLI", "791381-m03-l01-p02"],
  125: [125, "ما هي VLAN؟", "791381-m03-l02-p01"], 126: [126, "مصطلحات مهمة في VLAN", "791381-m03-l02-p02"], 127: [127, "فكرة VLAN", "791381-m03-l02-p03"],
  128: [128, "جدول مثال VLAN", "791381-m03-l02-p04"], 129: [129, "توزيع الأجهزة على VLAN", "791381-m03-l02-p05"],
  130: [130, "إنشاء VLAN على السويتش", "791381-m03-l03-p01"], 131: [131, "ربط المنافذ مع VLAN", "791381-m03-l03-p02"], 132: [132, "توضيح Access Ports", "791381-m03-l03-p03"],
  133: [133, "الواجهة SVI", "791381-m03-l03-p04"], 134: [134, "فكرة SVI و Gateway", "791381-m03-l03-p05"],
  135: [135, "Native / Tagged / Untagged VLAN", "791381-m03-l04-p01"], 136: [136, "إعداد Native VLAN", "791381-m03-l04-p02"],
  137: [137, "إعداد Tagged VLAN عبر Trunk", "791381-m03-l04-p03"], 138: [138, "إعداد Untagged / Access", "791381-m03-l04-p04"],
};

describe("Batch 6 — m03 completed IN PLACE: identity, historical-id immutability, mapping PDF 121–138, cover PDF 120", () => {
  it("the WHOLE real course (m01 … m18 + m03) produces ZERO validation issues", () => {
    expect(validateLearningCourseContent(course)).toEqual([]);
  });
  it("module identity is the historical skeleton's: id 791381-m03, the same title / shortTitle, order 15, lesson l01 «مدخل إلى CLI و VLAN»; no rename, no repurpose, no m19", () => {
    expect([m03.id, m03.title, m03.shortTitle, m03.order, m03.partial]).toEqual([M03, "برمجة السويتش CLI و VLAN", "CLI و VLAN", 15, undefined]);
    expect([byId[M03].title, byId[M03].shortTitle, byId[M03].order]).toEqual(["برمجة السويتش CLI و VLAN", "CLI و VLAN", 15]);
    expect(m03.lessons.map(l => [l.id, l.title, l.order, l.pages.length])).toEqual([
      [M03 + "-l01", "مدخل إلى CLI و VLAN", 1, 4], [M03 + "-l02", "مفهوم VLAN والمصطلحات", 2, 5], [M03 + "-l03", "إنشاء VLAN وربط المنافذ", 3, 5], [M03 + "-l04", "Native / Tagged / Untagged", 4, 4],
    ]);
    expect(manifest.modules.map(m => m.id).filter(id => /m03/.test(id))).toEqual([M03]);   // no parallel module for the m03 section (m19 is the VTP section added by Batch 7)
  });
  it("HISTORICAL-ID IMMUTABILITY: 791381-m03-l01-p01 = PDF 123 «منافذ السويتش» (printed 121) and -p02 = PDF 124 «برمجة المنافذ من CLI» (printed 122), identical in manifest and body, keywords untouched; only their `order` moved to 3 / 4", () => {
    const hist = (src: { id: string; title: string; order: number; source?: { kind: string; sourceId: string; pdfPageStart: number; pdfPageEnd?: number; printedPage?: number; sourceNote?: string }; keywords?: string[] }[]) =>
      src.filter(p => p.id === M03 + "-l01-p01" || p.id === M03 + "-l01-p02").map(p => [p.id, p.title, p.order, p.source, p.keywords]);
    const expected = [
      [M03 + "-l01-p01", "منافذ السويتش", 3, { kind: "book", sourceId: "791381", pdfPageStart: 123, printedPage: 121 }, ["switch", "ports", "CLI"]],
      [M03 + "-l01-p02", "برمجة المنافذ من CLI", 4, { kind: "book", sourceId: "791381", pdfPageStart: 124, printedPage: 122 }, ["access", "trunk", "VLAN"]],
    ];
    expect(hist(byId[M03].lessons[0].pages)).toEqual(expected);
    expect(hist(m03.lessons[0].pages)).toEqual(expected);
    // the historical pages carry no pdfPageEnd, no sourceNote and no conversionNote — the mapping is exactly the skeleton's
    for (const id of [M03 + "-l01-p01", M03 + "-l01-p02"]) expect([pageBy(id).source.pdfPageEnd, pageBy(id).source.sourceNote, pageBy(id).conversionNote], id).toEqual([undefined, undefined, undefined]);
  });
  it("maps the eighteen learner pages 1:1 to PDF 121..138 in SOURCE ORDER (explicit `order`, not array position or id), with the pinned titles, ids and printed pages", () => {
    expect(pages.map(p => p.source.pdfPageStart)).toEqual(Array.from({ length: 18 }, (_, i) => 121 + i));
    for (const p of pages) {
      const [printed, title, id] = MAP[p.source.pdfPageStart];
      expect([p.id, p.title, p.source.kind, p.source.sourceId, p.source.pdfPageEnd, p.source.printedPage], String(p.source.pdfPageStart)).toEqual([id, title, "book", "791381", undefined, printed]);
    }
    // PDF 121–122 are NEW stable ids placed FIRST by order; the array order in the file is irrelevant
    expect(m03.lessons[0].pages.map(p => [p.id, p.order])).toEqual([[M03 + "-l01-p03", 1], [M03 + "-l01-p04", 2], [M03 + "-l01-p01", 3], [M03 + "-l01-p02", 4]]);
    // manifest TOC = body pages (ids, titles, orders, sources) and orders are unique inside every lesson
    for (const l of m03.lessons) {
      const ref = byId[M03].lessons.find(x => x.id === l.id)!;
      expect(ref.pages.map(p => [p.id, p.title, p.order, p.source]), l.id).toEqual(l.pages.map(p => [p.id, p.title, p.order, p.source]));
      expect(new Set(l.pages.map(p => p.order)).size, l.id).toBe(l.pages.length);
    }
  });
  it("PDF 120 (the batch cover) is STRUCTURAL: only m03's coarse source range 120–138 + sourceNote — never a learner page, never an invented unit opener or l00 lesson", () => {
    expect([m03.source!.pdfPageStart, m03.source!.pdfPageEnd]).toEqual([120, 138]);
    expect(m03.source!.sourceNote).toContain("PDF 120");
    expect(m03.source!.sourceNote).toContain("PDF 121");
    expect(m03.source!.sourceNote).toContain("PDF 139");
    expect(pages.some(p => p.source.pdfPageStart === 120)).toBe(false);
    expect(flattenPageRefs(manifest).some(p => p.page.source?.pdfPageStart === 120)).toBe(false);
    expect(allBlocks.some(b => b.type === "unit-opener")).toBe(false);
    expect(m03.lessons.some(l => l.id.endsWith("-l00"))).toBe(false);
    expect(JSON.stringify(m03)).not.toMatch(/الوحدة (الخامسة عشرة|التاسعة|العاشرة)|unitNumber/);
    for (const b of allBlocks) if (b.source) expect([b.source.pdfPageStart >= 121, (b.source.pdfPageEnd ?? b.source.pdfPageStart) <= 138], b.id).toEqual([true, true]);
  });
  it("HARD STOP: every m03 page < 139; the maximum pdfPageStart among ALL converted real bodies is 138; the manifest m03 range is 121–138; the earlier bodies still stop at 119", () => {
    for (const p of pages) expect(p.source.pdfPageStart, p.id).toBeLessThan(NEXT_SECTION_PDF);
    expect(Math.max(...ALL.flatMap(m => m.lessons.flatMap(l => l.pages.map(p => p.source.pdfPageStart))))).toBe(138);
    expect(Math.max(...PREV.flatMap(m => m.lessons.flatMap(l => l.pages.map(p => p.source.pdfPageStart))))).toBe(119);
    const pdfs = byId[M03].lessons.flatMap(l => l.pages.map(p => p.source!.pdfPageStart));
    expect([Math.min(...pdfs), Math.max(...pdfs), pdfs.length]).toEqual([121, 138, 18]);
  });
  it("HARD STOP (content): nothing from PDF 139+ leaks — no centralised VLAN-management protocol, no Server/Client roles, no Router on a Stick / sub-interfaces / Dot1Q encapsulation, no port security, no DHCP configuration, no ACL", () => {
    const json = JSON.stringify(m03);
    expect(json).not.toMatch(/\bVTP\b|VLAN Trunking Protocol|إدارة مركزية|\bServer\b|\bClient\b|Transparent|Router on a Stick|Dot1Q|dot1q|802\.1Q|encapsulation|sub-?interface|واجهة فرعية|واجهات فرعية|\bg0\/0\.\d|port-?security|Port Security|sticky|\bDHCP\b|access-list|\bACL\b|permit|deny|\bVTP\b/i);
    // no real terminal and no invented command OUTPUT: every code block is command lines only, one command per line, each with the book's prompt
    for (const b of allBlocks) if (b.type === "code") {
      expect(b.language, b.id).toBe("cli");
      for (const line of b.code.split("\n")) expect(line, b.id).toMatch(/^Switch(>|#|\(config\)#|\(config-vlan\)#) \S/);
      expect(b.code, b.id).not.toMatch(/%|\bshow\b|Building configuration|\[OK\]|Enter configuration commands|copy running/);
    }
    // no commands the book does not print in PDF 121–138
    expect(json).not.toMatch(/\bshow (vlan|running|interfaces)|\bhostname\b|\bexit\b|\bend\b|write memory|copy run|spanning-tree|ip routing|ip default-gateway|\bpassword\b|\bsecret\b|\bline (vty|console)/);
  });
});

describe("Batch 6 — SOURCE ORDER inside m03 (no concept before the book introduces it)", () => {
  const P = (id: string) => plain(pageBy(id));
  const firstPdf = (re: RegExp) => pages.filter(p => re.test(plain(p))).map(p => p.source.pdfPageStart)[0];
  it("commands appear only where the book prints them: enable / configure terminal from PDF 122; vlan / name from 122 and 130; interface range + switchport from 131; SVI commands from 133; trunk commands from 136", () => {
    expect(P(M03 + "-l01-p03")).not.toMatch(/Switch>|Switch#|Switch\(config\)|configure terminal|switchport|interface/);
    expect(firstPdf(/\benable\b/)).toBe(122);
    expect(firstPdf(/configure terminal/)).toBe(122);
    expect(firstPdf(/\bname MNG\b/)).toBe(130);
    expect(firstPdf(/switchport/)).toBe(131);
    expect(firstPdf(/interface range/)).toBe(131);
    expect(firstPdf(/interface vlan|ip address|no shutdown|\bSVI\b/)).toBe(133);
    expect(firstPdf(/switchport mode trunk|native vlan/)).toBe(136);
    expect(firstPdf(/allowed vlan/)).toBe(137);
    // the PDF 124 steps page stays prose: it names Access / Trunk / VLAN but prints NO command
    expect(P(M03 + "-l01-p02")).not.toMatch(/switchport|interface|Switch\(config\)/);
  });
  it("VLAN vocabulary follows the book: VLAN ID / 4094 / VLAN 1 not before PDF 126; Gateway not before 134; Tag not before 132 (named there, explained on 135); Native / Tagged / Untagged not before 135; the SVI address not before 133", () => {
    expect(firstPdf(/VLAN ID|4094/)).toBe(126);
    expect(firstPdf(/\bVLAN 1\b/)).toBe(126);
    expect(firstPdf(/Gateway/)).toBe(134);
    expect(firstPdf(/\bTag\b/)).toBe(132);
    expect(firstPdf(/Native|Tagged|Untagged/)).toBe(132);   // the PDF 132 clarification names the later page by its title only
    expect(pages.filter(p => /Native VLAN|Tagged VLAN|Untagged VLAN/.test(plain(p))).map(p => p.source.pdfPageStart)[0]).toBe(135);
    expect(firstPdf(/192\.168\.10\.254/)).toBe(133);
    expect(firstPdf(/192\.168\.1\.254/)).toBe(134);
    expect(firstPdf(/\bMNG\b|\bGAZ\b/)).toBe(128);         // the branch names first appear in the PDF 128 table as device names (Pc1-GAZ), then as VLAN names on 130
  });
  it("the earlier real modules (m01 … m18) still contain none of the switch-programming content (VLAN is named in m16 only because the book's PDF 100–101 name it as a Broadcast-domain separator)", () => {
    expect(JSON.stringify(PREV)).not.toMatch(/Trunk|configure terminal|Switch\(config\)|Switch>|Switch#|switchport|\bSVI\b|Native VLAN|Tagged|Untagged|برمجة السويتش|VLAN ID|4094|\bF0\/\d|\bG0\/\d/);
    expect(PREV.filter(m => /\bVLAN\b/.test(JSON.stringify(m))).map(m => m.id)).toEqual(["791381-m16"]);
  });
});

describe("Batch 6 — key source facts as printed (CLI boxes, definitions, tables, «تذكّر» boxes)", () => {
  const spans = (pid: string, bid: string) => { const b = blockBy(pageBy(pid), bid); return b.type === "callout" || b.type === "text" ? b.spans.map(s => s.text).join("") : ""; };
  const items = (pid: string, bid: string) => { const b = blockBy(pageBy(pid), bid); return b.type === "list" ? b.items.map(i => [i.term, i.text.map(s => s.text).join(""), i.note]) : null; };
  const code = (pid: string, bid: string) => { const b = blockBy(pageBy(pid), bid); return b.type === "code" ? b.code : null; };
  const table = (pid: string, bid: string): [string[], string[] | undefined, string[][]] => { const b = blockBy(pageBy(pid), bid); return b.type === "table" ? [b.headers, b.columnDirs, b.rows] : [[], undefined, []]; };
  it("PDF 121–124: the CLI definition, the three facts, «الأهم للطالب», the PDF 122 CLI box + «تذكّر», the port facts + «مثال», the three steps + «تذكّر»", () => {
    expect(spans(M03 + "-l01-p03", "m03-l01-p03-def")).toBe("CLI هي واجهة الأوامر التي نبرمج منها السويتش.");
    expect(items(M03 + "-l01-p03", "m03-l01-p03-facts")!.map(i => i[1])).toEqual(["نستعملها لتعريف VLAN، المنافذ، كلمات المرور، و Trunk.", "كل أمر يُكتب في سطر مستقل.", "CLI = Command Line Interface."]);
    expect(spans(M03 + "-l01-p03", "m03-l01-p03-student")).toBe("فهم وظيفة الأمر، وليس حفظ النص الطويل فقط.");
    expect(code(M03 + "-l01-p04", "m03-l01-p04-cli")).toBe("Switch> enable\nSwitch# configure terminal\nSwitch(config)# vlan 10");
    expect(table(M03 + "-l01-p04", "m03-l01-p04-cmds")).toEqual([["الأمر", "ماذا يفعل"], ["ltr", "rtl"], [["Switch> enable", "يدخلنا إلى وضع الأوامر المتقدّم"], ["Switch# configure terminal", "يدخلنا إلى وضع الإعدادات"], ["Switch(config)# vlan 10", "بعدها نعرّف VLAN أو المنافذ"]]]);
    expect(spans(M03 + "-l01-p04", "m03-l01-p04-remember")).toBe("لاحظ تغيّر الموجّه في كل خطوة: من > إلى # ثم (config)# — وهو يدلّك على الوضع الذي أنت فيه.");
    expect(spans(M03 + "-l01-p01", "m03-l01-p01-def")).toBe("لكل منفذ في السويتش اسم نستخدمه في البرمجة.");
    expect(items(M03 + "-l01-p01", "m03-l01-p01-facts")!.map(i => i[1])).toEqual(["منافذ FastEthernet تُكتب غالبًا F0/1 حتى F0/24.", "منافذ GigabitEthernet أسرع وتُكتب G0/1 أو G0/2.", "نختار المنفذ الصحيح قبل كتابة أوامر البرمجة."]);
    expect(spans(M03 + "-l01-p01", "m03-l01-p01-example")).toBe("F0/1 يعني المنفذ رقم 1 في السويتش.");
    const steps = blockBy(pageBy(M03 + "-l01-p02"), "m03-l01-p02-steps");
    expect(steps.type === "list" && [steps.variant, steps.items.map(i => i.text.map(s => s.text).join(""))]).toEqual(["ordered", ["نحدّد المنفذ أو مجموعة منافذ.", "نحدّد نوع المنفذ: Access أو Trunk.", "بعد ذلك نربط المنفذ بـ VLAN مناسبة."]]);
    expect(spans(M03 + "-l01-p02", "m03-l01-p02-remember")).toBe("كل منفذ يخدم جهازًا واحدًا (Access) أو يكون وصلة بين سويتشات (Trunk).");
  });
  it("PDF 125–129: the VLAN definition + facts + «متى نستعملها؟», the three term cards with their notes, «الفكرة الأساسية» / «الخلاصة», the PDF 128 table + «لاحظ», the distribution facts + «تذكّر»", () => {
    expect(spans(M03 + "-l02-p01", "m03-l02-p01-def")).toBe("VLAN تقسّم الشبكة الكبيرة إلى شبكات أصغر.");
    expect(items(M03 + "-l02-p01", "m03-l02-p01-facts")!.map(i => i[1])).toEqual(["التقسيم يكون افتراضيًا دون تغيير الكابلات.", "كل قسم يصبح كأنه شبكة مستقلة.", "الفائدة: أمان أفضل وتنظيم أسهل وتقليل ازدحام."]);
    expect(spans(M03 + "-l02-p01", "m03-l02-p01-when")).toBe("مفيدة جدًا لفصل الإدارة عن المحاسبة أو الطلاب داخل نفس الشبكة.");
    expect(items(M03 + "-l02-p02", "m03-l02-p02-cards")).toEqual([
      ["VLAN ID", "رقم يميّز كل VLAN. مثال: VLAN 10 للإدارة، VLAN 20 للمحاسبة.", "المجال: 1 – 4094"],
      ["VLAN 1", "الشبكة الافتراضية الموجودة على السويتش عند البداية.", "لا يُفضّل استخدامها للأمان"],
      ["Trunk", "وصلة تسمح بمرور أكثر من VLAN عبر نفس الكابل بين السويتشات.", "كابل واحد لعدة VLAN"],
    ]);
    expect(spans(M03 + "-l02-p02", "m03-l02-p02-remember")).toBe("Access = لجهاز عادي، و Trunk = وصلة بين أجهزة الشبكة (سويتشات/راوتر).");
    expect(items(M03 + "-l02-p03", "m03-l02-p03-facts")!.map(i => i[1])).toEqual(["كل مجموعة أجهزة لها VLAN مختلفة.", "الأجهزة داخل نفس VLAN تتواصل بسهولة.", "بين VLAN مختلفة نحتاج راوتر أو سويتش طبقة ثالثة."]);
    expect(spans(M03 + "-l02-p03", "m03-l02-p03-idea")).toBe("فصل الشبكة إلى أقسام واضحة.");
    expect(spans(M03 + "-l02-p03", "m03-l02-p03-summary")).toBe("VLAN تفصل الأقسام منطقيًا، فيبدو كل قسم كأنه شبكة قائمة بذاتها.");
    expect(table(M03 + "-l02-p04", "m03-l02-p04-table")).toEqual([["الجهاز", "الفرع", "VLAN", "العنوان", "القناع"], ["ltr", "rtl", "ltr", "ltr", "ltr"], [
      ["Pc1-ADMIN", "الإدارة", "10", "192.168.10.1", "/24"], ["Pc2-ADMIN", "الإدارة", "10", "192.168.10.2", "/24"], ["Pc1-GAZ", "المحاسبة", "20", "192.168.20.1", "/24"], ["Pc2-GAZ", "المحاسبة", "20", "192.168.20.2", "/24"],
    ]]);
    expect(spans(M03 + "-l02-p04", "m03-l02-p04-note")).toBe("كل VLAN لها شبكة IP مختلفة في هذا المثال: الإدارة 192.168.10.x والمحاسبة 192.168.20.x.");
    expect(items(M03 + "-l02-p05", "m03-l02-p05-facts")!.map(i => i[1])).toEqual(["Pc1 و Pc2 في VLAN 10 (الإدارة).", "أجهزة المحاسبة في VLAN 20.", "السويتش يميّز الأجهزة حسب المنفذ المتصل به."]);
    expect(spans(M03 + "-l02-p05", "m03-l02-p05-remember")).toBe("السويتش لا يعرف القسم من اسم الجهاز، بل من إعداد المنفذ.");
  });
  it("PDF 130–134: the four CLI boxes' exact command lines and annotations, «تذكّر» (130), «النتيجة» (131), the Access facts + «تذكّر» (132), «متى؟» (133), the Gateway facts + «تذكّر» (134)", () => {
    expect(code(M03 + "-l03-p01", "m03-l03-p01-cli")).toBe("Switch(config)# vlan 10\nSwitch(config-vlan)# name MNG\nSwitch(config)# vlan 20\nSwitch(config-vlan)# name GAZ");
    expect(table(M03 + "-l03-p01", "m03-l03-p01-cmds")[2].map(r => r[1])).toEqual(["يُنشئ VLAN رقم 10", "يعطيها اسمًا واضحًا", "نكرّر الأمر لكل VLAN نحتاجها", "اسم VLAN المحاسبة"]);
    expect(spans(M03 + "-l03-p01", "m03-l03-p01-remember")).toBe("الاسم لا يغيّر عمل الشبكة، لكنه يسهّل الإدارة والمتابعة.");
    expect(code(M03 + "-l03-p02", "m03-l03-p02-cli")).toBe("Switch(config)# interface range f0/1-10\nSwitch(config)# switchport mode access\nSwitch(config)# switchport access vlan 10");
    expect(table(M03 + "-l03-p02", "m03-l03-p02-cmds")[2].map(r => r[1])).toEqual(["يحدّد مجموعة منافذ", "المنفذ لجهاز عادي", "يربط المنافذ بـ VLAN 10"]);
    expect(spans(M03 + "-l03-p02", "m03-l03-p02-result")).toBe("الجهاز المتصل بالمنفذ يصبح داخل VLAN المحدّدة تلقائيًا.");
    expect(items(M03 + "-l03-p03", "m03-l03-p03-facts")!.map(i => i[1])).toEqual(["منفذ Access ينتمي إلى VLAN واحدة فقط.", "يُستخدم مع الحواسيب والطابعات والأجهزة النهائية.", "الجهاز لا يحتاج أن يعرف رقم VLAN.", "السويتش هو الذي يحدّد VLAN حسب إعداد المنفذ."]);
    expect(spans(M03 + "-l03-p03", "m03-l03-p03-remember")).toBe("Access Port = جهاز واحد في VLAN واحدة، بلا أي Tag.");
    expect(code(M03 + "-l03-p04", "m03-l03-p04-cli")).toBe("Switch(config)# interface vlan 10\nSwitch(config)# ip address 192.168.10.254 255.255.255.0\nSwitch(config)# no shutdown");
    expect(table(M03 + "-l03-p04", "m03-l03-p04-cmds")[2].map(r => r[1])).toEqual(["واجهة افتراضية داخل السويتش", "عنوان IP لإدارة VLAN", "يشغّل الواجهة"]);
    expect(spans(M03 + "-l03-p04", "m03-l03-p04-when")).toBe("SVI مفيدة خاصة في السويتشات التي تدعم الطبقة الثالثة (Layer 3).");
    expect(spans(M03 + "-l03-p05", "m03-l03-p05-def")).toBe("لكل VLAN يمكن أن يكون Gateway خاص بها.");
    expect(items(M03 + "-l03-p05", "m03-l03-p05-facts")!.map(i => i[1])).toEqual(["العنوان 192.168.1.254 يمثّل نقطة خروج للأجهزة.", "تُستخدم لإدارة أو توجيه بين الشبكات الظاهرية.", "Default Gateway هو الباب الذي يخرج منه الجهاز."]);
    expect(spans(M03 + "-l03-p05", "m03-l03-p05-remember")).toBe("بدون Gateway تعمل VLAN داخليًا، لكن لا تصل إلى الشبكات الأخرى.");
  });
  it("PDF 135–138: the three Native / Tagged / Untagged cards with their notes, «ما هو الـ Tag؟», the three CLI boxes (F0/24 trunk + native vlan 99 · allowed vlan 10,20 · F0/1 access vlan 10), «لماذا؟» / «الفائدة» / «تذكّر»", () => {
    expect(items(M03 + "-l04-p01", "m03-l04-p01-cards")).toEqual([
      ["Native VLAN", "تمرّ عبر Trunk بدون Tag، وتُستخدم للتوافق مع أجهزة قديمة.", "يُفضّل تغييرها من VLAN 1"],
      ["Tagged VLAN", "الحزمة تحمل رقم VLAN، وتُستخدم عبر وصلات Trunk.", "مثال: VLAN 10,20"],
      ["Untagged VLAN", "حزمة بدون Tag، تظهر غالبًا في منافذ Access للأجهزة العادية.", "PC / Printer"],
    ]);
    expect(spans(M03 + "-l04-p01", "m03-l04-p01-tag")).toBe("علامة داخل الحزمة تخبر السويتش لأي VLAN تنتمي هذه الحزمة.");
    expect(code(M03 + "-l04-p02", "m03-l04-p02-cli")).toBe("Switch(config)# interface f0/24\nSwitch(config)# switchport mode trunk\nSwitch(config)# switchport trunk native vlan 99");
    expect(table(M03 + "-l04-p02", "m03-l04-p02-cmds")[2].map(r => r[1])).toEqual(["نحدّد منفذ Trunk", "نجعله Trunk", "نجعل VLAN 99 هي Native"]);
    expect(spans(M03 + "-l04-p02", "m03-l04-p02-why")).toBe("لأسباب أمنية يُفضّل عدم ترك Native VLAN على VLAN 1؛ وهي لا تحمل Tag على رابط Trunk.");
    expect(code(M03 + "-l04-p03", "m03-l04-p03-cli")).toBe("Switch(config)# interface f0/24\nSwitch(config)# switchport mode trunk\nSwitch(config)# switchport trunk allowed vlan 10,20");
    expect(table(M03 + "-l04-p03", "m03-l04-p03-cmds")[2].map(r => r[1])).toEqual(["منفذ الوصلة", "Trunk يسمح بمرور عدة VLAN", "يسمح فقط لـ VLAN 10 و 20"]);
    expect(spans(M03 + "-l04-p03", "m03-l04-p03-benefit")).toBe("الحزم تحمل Tag برقم VLAN، فيعرف السويتش مصدر كل حزمة.");
    expect(code(M03 + "-l04-p04", "m03-l04-p04-cli")).toBe("Switch(config)# interface f0/1\nSwitch(config)# switchport mode access\nSwitch(config)# switchport access vlan 10");
    expect(table(M03 + "-l04-p04", "m03-l04-p04-cmds")[2].map(r => r[1])).toEqual(["منفذ لجهاز نهائي مثل حاسوب", "المنفذ ينتمي إلى VLAN واحدة", "الجهاز يرسل ويستقبل بدون Tag"]);
    expect(spans(M03 + "-l04-p04", "m03-l04-p04-remember")).toBe("Access Port = جهاز عادي، و Trunk Port = بين أجهزة الشبكة.");
  });
  it("every CLI box is a `code` block (language cli, origin book) followed by its command table whose first column is the SAME command lines (LTR column) — seven boxes on PDF 122, 130, 131, 133, 136, 137, 138", () => {
    const codes = allBlocks.filter(b => b.type === "code");
    expect(codes.map(b => pages.find(p => p.blocks.includes(b))!.source.pdfPageStart)).toEqual([122, 130, 131, 133, 136, 137, 138]);
    for (const c of codes) {
      if (c.type !== "code") continue;
      const p = pages.find(p => p.blocks.includes(c))!;
      const idx = p.blocks.indexOf(c);
      expect([c.origin, c.language, idx], c.id).toEqual(["book", "cli", 0]);   // the CLI box opens the page, as in the book
      const t = p.blocks[idx + 1];
      expect(t.type === "table" && t.origin === "book" && t.columnDirs?.[0] === "ltr" && t.rows.map(r => r[0]).join("\n") === c.code, c.id).toBe(true);
    }
  });
});

describe("Batch 6 — pedagogy: worksheets, solved examples, practices with «افحص» feedback, closing review; NO activity", () => {
  const practices = allBlocks.filter(b => b.type === "practice");
  it("37 inline practices, interactive kinds only, each with 2 hints, «افحص» incorrect feedback and an explanation; every page ends with practice; deterministic shortInput answers", () => {
    expect(practices.length).toBe(37);
    for (const b of practices) {
      if (b.type !== "practice") continue;
      expect(b.origin, b.id).toBe("teacher-enrichment");
      expect(["multipleChoice", "trueFalse", "shortInput"], b.id).toContain(b.question.kind);
      const fb = b.question.feedback!;
      expect(fb.hints?.length, b.id).toBe(2);
      expect(fb.incorrectFeedback, b.id).toMatch(/افحص/);
      expect(fb.correctFeedback && fb.explanation, b.id).toBeTruthy();
      if (b.question.kind === "multipleChoice") expect(b.question.options.filter(o => o.correct).length, b.id).toBe(1);
      if (b.question.kind === "shortInput") expect(String(b.question.answer), b.id).toMatch(/^[A-Za-z0-9./]+$/);
    }
    for (const p of pages) expect(p.blocks.at(-1)?.type, p.id).toBe("practice");
    expect(pages.every(p => p.blocks.some(b => b.type === "practice"))).toBe(true);
  });
  it("six keyed worksheets: Access/Trunk (PDF 124, 138), term (126), device → VLAN (128), command → purpose (131), Native/Tagged/Untagged (135)", () => {
    const tables = allBlocks.filter(b => b.type === "practice-table");
    expect(tables.map(b => b.id)).toEqual(["m03-l01-p02-match", "m03-l02-p02-match", "m03-l02-p04-match", "m03-l03-p02-match", "m03-l04-p01-match", "m03-l04-p04-match"]);
    const keys = (pid: string, bid: string) => { const t = blockBy(pageBy(pid), bid); return t.type === "practice-table" ? t.rows.map(r => sel(r[1]).key) : null; };
    expect(keys(M03 + "-l01-p02", "m03-l01-p02-match")).toEqual(["Access", "Trunk", "Access"]);
    expect(keys(M03 + "-l02-p02", "m03-l02-p02-match")).toEqual(["VLAN ID", "Trunk", "VLAN 1", "Trunk"]);
    expect(keys(M03 + "-l02-p04", "m03-l02-p04-match")).toEqual(["10", "20", "20", "10"]);
    expect(keys(M03 + "-l03-p02", "m03-l03-p02-match")).toEqual(["يربط المنافذ بـ VLAN 10", "يحدّد مجموعة منافذ", "المنفذ لجهاز عادي"]);
    expect(keys(M03 + "-l04-p01", "m03-l04-p01-match")).toEqual(["Tagged VLAN", "Native VLAN", "Untagged VLAN", "Native VLAN"]);
    expect(keys(M03 + "-l04-p04", "m03-l04-p04-match")).toEqual(["Access", "Trunk", "Trunk", "Access"]);
    for (const t of tables) if (t.type === "practice-table") for (const r of t.rows) expect(sel(r[1]).options, t.id).toContain(sel(r[1]).key);
  });
  it("two solved examples (PDF 128 table reading, PDF 138 port F0/3 → VLAN 20 built ONLY from the book's commands) and eighteen clarifications, all enrichment; one closing review (r1–r3) on the last page (PDF 138)", () => {
    expect(allBlocks.filter(b => b.type === "example").map(b => [b.id, b.type === "example" && b.mode, b.origin])).toEqual([["m03-l02-p04-ex1", "solved", "teacher-enrichment"], ["m03-l04-p04-ex1", "solved", "teacher-enrichment"]]);
    const ex = blockBy(pageBy(M03 + "-l04-p04"), "m03-l04-p04-ex1");
    expect(ex.type === "example" && ex.result).toBe("interface f0/3 · switchport mode access · switchport access vlan 20");
    expect(allBlocks.filter(b => b.type === "callout" && b.kind === "clarification").length).toBe(18);
    expect(pages.every(p => p.blocks.filter(b => b.type === "callout" && b.kind === "clarification").length === 1)).toBe(true);
    const last = pages.at(-1)!;
    expect(last.source.pdfPageStart).toBe(138);
    expect(last.blocks.map(b => b.id).slice(-4)).toEqual(["m03-l04-p04-review", "m03-l04-p04-r1", "m03-l04-p04-r2", "m03-l04-p04-r3"]);
    expect(allBlocks.filter(b => /-r\d$/.test(b.id)).length).toBe(3);
  });
  it("NO activity block in m03 (none of simulation / animation / guided / interactive-diagram / library-training); the activity allowlist is untouched by this batch", () => {
    expect(allBlocks.some(b => ["simulation", "animation", "guided", "interactive-diagram", "library-training"].includes(b.type))).toBe(false);
    expect(JSON.stringify(m03)).not.toMatch(/interactionType|simulationType|animationType|trainingId|T0\d/);
  });
});

describe("Batch 6 — provenance, RTL/LTR (Cisco commands never reversed), safety", () => {
  it("book-derived blocks are origin:book (52); every practice / worksheet / example / clarification / heading is enrichment", () => {
    for (const b of allBlocks) {
      if (["practice", "practice-table", "example", "heading"].includes(b.type) || (b.type === "callout" && b.kind === "clarification")) expect(b.origin, b.id).toBe("teacher-enrichment");
      else expect(b.origin, b.id).toBe("book");
    }
    expect(allBlocks.filter(b => b.origin === "book").length).toBe(52);
    expect(allBlocks.length).toBe(116);
  });
  it("technical tokens are LTR spans (CLI, VLAN, Trunk, Access, Tag, SVI, Gateway, port names, prompts, commands, addresses); command tables mark the command column ltr; no arrow glyphs, urls, iframes or images", () => {
    const spans = allBlocks.flatMap(b => b.type === "callout" || b.type === "text" ? b.spans : b.type === "list" ? b.items.flatMap(i => i.text) : []);
    const ltr = spans.filter(s => s.dir === "ltr").map(s => s.text);
    for (const tok of ["CLI", "VLAN", "Trunk", "Access", "Tag", "SVI", "Gateway", "Default Gateway", "F0/1", "F0/24", "G0/1", "G0/2", "Switch>", "Switch#", "Switch(config)#", "Switch(config-vlan)#", "enable", "configure terminal", "vlan 10", "interface range f0/1-10", "switchport mode access", "switchport access vlan 10", "no shutdown", "192.168.10.254", "255.255.255.0", "192.168.1.254", "VLAN 10", "VLAN 20", "VLAN 1", "Native VLAN", "Tagged", "Untagged", "MNG", "GAZ", "Pc1-ADMIN", "/24", "10,20", "99", ">", "#", "(config)#"]) expect(ltr, tok).toContain(tok);
    for (const s of spans.filter(s => s.dir !== "ltr")) expect(s.text, s.text).not.toMatch(/^(CLI|VLAN|Trunk|Access|Tag|SVI|Gateway|F0\/\d+|G0\/\d|Switch.*|enable|configure terminal|switchport.*|interface.*|no shutdown|\d+\.\d+\.\d+\.\d+)$/);
    for (const b of allBlocks) if (b.type === "table" && b.origin === "book" && b.headers[0] === "الأمر") expect(b.columnDirs, b.id).toEqual(["ltr", "rtl"]);
    const json = JSON.stringify(m03);
    for (const banned of ["<iframe", ".pdf", "http://", "https://", "<script", ".png", ".svg", "←", "→", "⇐", "⇒", "⇢", "⇠", "↔"]) expect(json, banned).not.toContain(banned);
  });
  it("the reader's code wrapper is LTR (direction + text-align) so a long command line inside the RTL reader starts scrolled at its prompt, never at its tail; the wrapper is the only scroller", () => {
    const css = readFileSync(fileURLToPath(new URL("../../reader/reader.css", import.meta.url)), "utf8");
    const rule = css.split("\n").find(l => l.startsWith(".learning-reader-codewrap{"))!;
    expect(rule).toMatch(/direction:\s*ltr/);
    expect(rule).toMatch(/text-align:\s*left/);
    expect(rule).toMatch(/overflow-x:\s*auto/);
    expect(css.split("\n").find(l => l.startsWith(".learning-reader-code code{"))).toMatch(/white-space:\s*pre/);
  });
  it("ids are prefix-scoped and unique across the module; the historical pages' blocks use the historical page prefixes (m03-l01-p01-*, m03-l01-p02-*)", () => {
    const ids = allBlocks.map(b => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^m03-l0[1-4]-p0[1-5]-/);
    expect(pageBy(M03 + "-l01-p01").blocks.every(b => b.id.startsWith("m03-l01-p01-"))).toBe(true);
    expect(pageBy(M03 + "-l01-p02").blocks.every(b => b.id.startsWith("m03-l01-p02-"))).toBe(true);
    expect(pageBy(M03 + "-l01-p03").blocks.every(b => b.id.startsWith("m03-l01-p03-"))).toBe(true);
  });
});

describe("Batch 6 — loader, navigation, server registry agreement, publication invariants, m04–m06 untouched", () => {
  it("the m03 body loader EXISTS and lazily returns the same module (hasModuleContent true; loadModuleContent resolves to id m03 with 18 pages); m05–m06 still have NO loader", async () => {
    expect(hasModuleContent("791381", M03)).toBe(true);
    const loaded = await loadModuleContent("791381", M03);
    expect([loaded.id, loaded.title, loaded.order, loaded.lessons.length, pagesOf(loaded).length]).toEqual([M03, "برمجة السويتش CLI و VLAN", 15, 4, 18]);
    expect(["791381-m05", "791381-m06"].map(id => hasModuleContent("791381", id))).toEqual([false, false]);
  });
  it("navigation: m03 reads 15th, directly after m18 (PDF 119 → PDF 121, the NEW first page), historical PDF 123 follows the new PDF 122 page, and the page after m03's last page (PDF 138) is the next manifest module's first page (m19, PDF 140, since Batch 7)", () => {
    expect(orderedModules(manifest).map(m => m.id).slice(13, 16)).toEqual(["791381-m18", M03, "791381-m19"]);
    expect(nextPage(manifest, "791381-m18-l03-p01")?.id).toBe(M03 + "-l01-p03");
    expect(previousPage(manifest, M03 + "-l01-p03")?.id).toBe("791381-m18-l03-p01");
    expect(nextPage(manifest, M03 + "-l01-p04")?.id).toBe(M03 + "-l01-p01");
    expect(nextPage(manifest, M03 + "-l01-p02")?.id).toBe(M03 + "-l02-p01");
    const walk: number[] = []; let cur = nextPage(manifest, "791381-m18-l03-p01");
    while (cur && cur.id.startsWith(M03)) { walk.push(cur.source!.pdfPageStart); cur = nextPage(manifest, cur.id); }
    expect(walk).toEqual(Array.from({ length: 18 }, (_, i) => 121 + i));
    expect(cur?.id).toBe("791381-m19-l01-p01");
    expect(nextPage(manifest, M03 + "-l04-p04")?.id).toBe("791381-m19-l01-p01");
    expect(cur?.source!.pdfPageStart).toBe(140);
  });
  it("FRONTEND ↔ SERVER agreement: m03 is in the server publication registry with the same title and order (15); every module with a body is listed and only those; skeletons m05–m06 are not", () => {
    const withBody = manifest.modules.filter(m => hasModuleContent("791381", m.id)).map(m => ({ moduleId: m.id, title: m.title, order: m.order }));
    const s = server().listLearningModules("791381");
    expect(s).toEqual([...withBody].sort((a, b) => a.order - b.order));
    expect(s.find(m => m.moduleId === M03)).toEqual({ moduleId: M03, title: "برمجة السويتش CLI و VLAN", order: 15 });
    expect(s.map(m => m.moduleId).indexOf(M03)).toBe(14);   // by order (15th), never by id (m03 would sort before m07 lexically)
    for (const skel of ["791381-m05", "791381-m06"]) expect(server().findLearningModule("791381", skel)).toBeNull();
  });
  it("PUBLISHABLE but NOT auto-published: the server accepts m03 for explicit publication (canonical order after m18); no class document, fixture or default carries m03 in visibleModuleIds", () => {
    expect(server().validateLearningModuleIds("791381", [M03, "791381-m18", "791381-m01"])).toEqual(["791381-m01", "791381-m18", M03]);
    expect(server().listLearningModules("791381").every(m => m.moduleId !== "791381-m05" && m.moduleId !== "791381-m06")).toBe(true);
    expect(server().validateLearningModuleIds("791381", [M03])).toEqual([M03]);
    // the registry lists identity + title + order only — no bodies, no page ids, no pdf mapping leaves the server
    expect(JSON.stringify(server().listLearningModules("791381"))).not.toMatch(/pages|lessons|blocks|pdf|visibleModuleIds|published/i);
    // nothing in the registry module marks m03 (or anything) as published / visible by default
    expect(Object.keys(server().listLearningModules("791381")[0]).sort()).toEqual(["moduleId", "order", "title"]);
  });
  it("m04's historical page and m05 / m06 are UNCHANGED (ids, titles, page ids, PDF mappings); since Batch 7 m04 has a body at order 17 and m05 / m06 shift to 18 / 19; b6 unchanged", () => {
    const pagesRef = (id: string) => byId[id].lessons.flatMap(l => l.pages.map(p => [p.id, p.title, p.source!.pdfPageStart, p.source!.printedPage]));
    expect([byId["791381-m04"].title, byId["791381-m04"].order, pagesRef("791381-m04").filter(p => p[0] === "791381-m04-l01-p01")]).toEqual(["Trunk و Router on a Stick", 17, [["791381-m04-l01-p01", "أوامر Trunk", 148, 146]]]);
    expect([byId["791381-m05"].title, byId["791381-m05"].order, pagesRef("791381-m05")]).toEqual(["مرجع أوامر Cisco", 18, [["791381-m05-l01-p01", "أوامر أساسية للجهاز", 193, 191], ["791381-m05-l01-p02", "أوامر VLAN و Trunk", 194, 192]]]);
    expect([byId["791381-m06"].title, byId["791381-m06"].order, pagesRef("791381-m06")]).toEqual(["قوائم التحكم ACL", 19, [["791381-m06-l01-p01", "Extended ACL", 227, 225]]]);
    for (const id of ["791381-m05", "791381-m06"]) expect(Object.keys(byId[id]).sort(), id).toEqual(["id", "lessons", "order", "shortTitle", "title"].filter(k => k in byId[id]).sort());
    expect(manifest.batches!.find(b => b.id === "b4")!.moduleIds).toEqual([M03, "791381-m19", "791381-m04", "791381-m05"]);
    expect(manifest.batches!.find(b => b.id === "b6")!.moduleIds).toEqual(["791381-m06"]);
    expect(manifest.modules.map(m => m.order)).toEqual(Array.from({ length: 19 }, (_, i) => i + 1));
  });
});
