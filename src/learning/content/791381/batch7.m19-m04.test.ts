// Batch 7 phase — source-fidelity, mapping, provenance, pedagogy, SOURCE-ORDER and HARD-STOP guards for the book's
// sections «إدارة VLAN · VTP» (PDF 140–144, NEW module m19; PDF 139 is the section cover) and «توجيه بين الشبكات ·
// Trunk و Router on a Stick» (PDF 146–156 + the PDF 157 end-of-batch trainings page, the HISTORICAL skeleton m04 COMPLETED
// IN PLACE; PDF 145 is the section cover). PDF 158 is the «الدفعة الخامسة · Wi-Fi و IPv6 و DHCP والأمان» cover: nothing
// from PDF 158+ is ever converted here. Guards also cover: unique ids, manifest ↔ body ↔ server-registry agreement,
// the immutable historical m04 page, navigation m03 → m19 → m04 → m05, the loaders, and publishable-not-auto-published.
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
import m03 from "./modules/m03";
import m19 from "./modules/m19";
import m04 from "./modules/m04";
import manifest from "./manifest";
import { hasModuleContent, loadModuleContent } from "../registry";
import { nextPage, previousPage, orderedModules, flattenPageRefs } from "../navigation";
import { validateLearningCourseContent } from "../validation";
import { LEARNING_CONTENT_SCHEMA_VERSION, type LearningCourseContent, type ContentBlock, type ContentModule, type ContentPage, type PracticeTableSelectCell } from "../types";
// @ts-expect-error — the server registry is an untyped CommonJS module; it is imported here on purpose to cross-check it.
import * as apiRegistry from "../../../../api/src/lib/learning-materials-registry.js";

const PREV = [m01, m02, m07, m08, m09, m10, m11, m12, m13, m14, m15, m16, m17, m18, m03];
const BATCH = [m19, m04];
const ALL = [...PREV, ...BATCH];
const course: LearningCourseContent = { schemaVersion: LEARNING_CONTENT_SCHEMA_VERSION, courseId: "791381", title: "شبكات الاتصال", direction: "rtl", modules: ALL };
const pagesOf = (m: ContentModule): ContentPage[] => [...m.lessons].sort((a, b) => a.order - b.order).flatMap(l => [...l.pages].sort((a, b) => a.order - b.order));
const pages = BATCH.flatMap(pagesOf);
const pageBy = (id: string): ContentPage => pages.find(p => p.id === id)!;
const blockBy = (p: ContentPage, id: string): ContentBlock => p.blocks.find(b => b.id === id)!;
const plain = (p: ContentPage): string => JSON.stringify(p.blocks);
const sel = (cell: unknown) => cell as PracticeTableSelectCell;
const allBlocks = pages.flatMap(p => p.blocks);
const M19 = "791381-m19", M04 = "791381-m04";
const byId = Object.fromEntries(manifest.modules.map(m => [m.id, m]));
const NEXT_BATCH_PDF = 158;
const server = () => (apiRegistry as unknown as { listLearningModules: (c: string) => { moduleId: string; title: string; order: number }[]; findLearningModule: (c: string, m: string) => unknown; validateLearningModuleIds: (c: string, ids: string[]) => string[] });

// PDF → [printed page, title, page id]. The historical m04 page keeps the Phase-2 skeleton's printed number (146, the
// hidden text-layer running number); every NEW page follows the page circle = PDF index rule; PDF 157 prints none.
const MAP: Record<number, [number | undefined, string, string]> = {
  140: [140, "ما هو VTP؟", M19 + "-l01-p01"], 141: [141, "كيف يعمل VTP؟", M19 + "-l01-p02"],
  142: [142, "إعداد VTP: Server و Client", M19 + "-l02-p01"], 143: [143, "إعداد VTP لباقي السويتشات", M19 + "-l02-p02"], 144: [144, "تعريف VLAN على سويتش السيرفر", M19 + "-l02-p03"],
  146: [146, "منافذ الربط بين السويتشات", M04 + "-l01-p02"], 147: [147, "ما هو Trunk؟", M04 + "-l01-p03"], 148: [146, "أوامر Trunk", M04 + "-l01-p01"],
  149: [149, "أوامر Trunk — باقي السويتشات", M04 + "-l01-p04"], 150: [150, "Trunk على Sw6 مع الراوتر", M04 + "-l01-p05"],
  151: [151, "Router on a Stick", M04 + "-l02-p01"], 152: [152, "ما هو Dot1Q؟", M04 + "-l02-p02"], 153: [153, "إعداد Dot1Q على منفذ Trunk", M04 + "-l02-p03"],
  154: [154, "Router on a Stick — VLAN 10 / 20", M04 + "-l02-p04"], 155: [155, "Router on a Stick — VLAN 30 / 40", M04 + "-l02-p05"],
  156: [156, "خلاصة الوحدة", M04 + "-l03-p01"], 157: [undefined, "تدريبات نهاية الدفعة", M04 + "-l03-p02"],
};

describe("Batch 7 — validation, identities, mapping PDF 140–157, covers PDF 139 / 145, HARD STOP before PDF 158", () => {
  it("the WHOLE real course (m01 … m18, m03, m19, m04) produces ZERO validation issues; every module / lesson / page / block id is unique", () => {
    expect(validateLearningCourseContent(course)).toEqual([]);
    const ids = ALL.flatMap(m => [m.id, ...m.lessons.flatMap(l => [l.id, ...l.pages.flatMap(p => [p.id, ...p.blocks.map(b => b.id)])])]);
    expect(new Set(ids).size).toBe(ids.length);
    const refIds = manifest.modules.flatMap(m => [m.id, ...m.lessons.flatMap(l => [l.id, ...l.pages.map(p => p.id)])]);
    expect(new Set(refIds).size).toBe(refIds.length);
  });
  it("m19 is a NEW stable id (VTP), order 16, two lessons; m04 keeps the historical skeleton's id, title, shortTitle, lesson l01 title, and reads at order 17", () => {
    expect([m19.id, m19.title, m19.shortTitle, m19.order, m19.partial]).toEqual([M19, "إدارة VLAN: VTP", "VTP", 16, undefined]);
    expect(m19.lessons.map(l => [l.id, l.title, l.order, l.pages.length])).toEqual([[M19 + "-l01", "ما هو VTP وكيف يعمل", 1, 2], [M19 + "-l02", "إعداد VTP", 2, 3]]);
    expect([m04.id, m04.title, m04.shortTitle, m04.order, m04.partial]).toEqual([M04, "Trunk و Router on a Stick", "Trunk", 17, undefined]);
    expect(m04.lessons.map(l => [l.id, l.title, l.order, l.pages.length])).toEqual([
      [M04 + "-l01", "الربط بين السويتشات والتوجيه", 1, 5], [M04 + "-l02", "Router on a Stick و Dot1Q", 2, 5], [M04 + "-l03", "خلاصة الوحدة وتدريبات نهاية الدفعة", 3, 2],
    ]);
    for (const [id, title, order] of [[M19, "إدارة VLAN: VTP", 16], [M04, "Trunk و Router on a Stick", 17]] as const) expect([byId[id].title, byId[id].order], id).toEqual([title, order]);
    expect(manifest.modules.filter(m => /m04|m19/.test(m.id)).map(m => m.id)).toEqual([M19, M04]);   // no duplicate / parallel module for either section
  });
  it("HISTORICAL-ID IMMUTABILITY: 791381-m04-l01-p01 = PDF 148 «أوامر Trunk» (printed 146), keywords [trunk, dot1q], identical in manifest and body; only its `order` moved to 3; not recreated under a new id", () => {
    const hist = (src: { id: string; title: string; order: number; source?: unknown; keywords?: string[] }[]) => src.filter(p => p.id === M04 + "-l01-p01").map(p => [p.id, p.title, p.order, p.source, p.keywords]);
    const expected = [[M04 + "-l01-p01", "أوامر Trunk", 3, { kind: "book", sourceId: "791381", pdfPageStart: 148, printedPage: 146 }, ["trunk", "dot1q"]]];
    expect(hist(byId[M04].lessons[0].pages)).toEqual(expected);
    expect(hist(m04.lessons[0].pages)).toEqual(expected);
    expect([pageBy(M04 + "-l01-p01").source.pdfPageEnd, pageBy(M04 + "-l01-p01").source.sourceNote, pageBy(M04 + "-l01-p01").conversionNote]).toEqual([undefined, undefined, undefined]);
    expect(pages.filter(p => p.source.pdfPageStart === 148).map(p => p.id)).toEqual([M04 + "-l01-p01"]);
  });
  it("maps the seventeen learner pages 1:1 to PDF 140..144 and 146..157 in SOURCE ORDER (explicit `order`), with the pinned titles, ids and printed pages; manifest TOC = body", () => {
    expect(pagesOf(m19).map(p => p.source.pdfPageStart)).toEqual([140, 141, 142, 143, 144]);
    expect(pagesOf(m04).map(p => p.source.pdfPageStart)).toEqual(Array.from({ length: 12 }, (_, i) => 146 + i));
    for (const p of pages) {
      const [printed, title, id] = MAP[p.source.pdfPageStart];
      expect([p.id, p.title, p.source.kind, p.source.sourceId, p.source.pdfPageEnd, p.source.printedPage], String(p.source.pdfPageStart)).toEqual([id, title, "book", "791381", undefined, printed]);
    }
    expect(m04.lessons[0].pages.map(p => [p.id, p.order])).toEqual([[M04 + "-l01-p02", 1], [M04 + "-l01-p03", 2], [M04 + "-l01-p01", 3], [M04 + "-l01-p04", 4], [M04 + "-l01-p05", 5]]);
    for (const m of BATCH) for (const l of m.lessons) {
      const ref = byId[m.id].lessons.find(x => x.id === l.id)!;
      expect([ref.title, ref.order, ref.pages.map(p => [p.id, p.title, p.order, p.source, p.keywords])], l.id).toEqual([l.title, l.order, l.pages.map(p => [p.id, p.title, p.order, p.source, p.keywords])]);
      expect(new Set(l.pages.map(p => p.order)).size, l.id).toBe(l.pages.length);
    }
  });
  it("PDF 139 and PDF 145 (section covers) are STRUCTURAL: only the coarse source ranges 139–144 / 145–157 + sourceNotes — never learner pages, never invented unit openers", () => {
    expect([m19.source!.pdfPageStart, m19.source!.pdfPageEnd, m04.source!.pdfPageStart, m04.source!.pdfPageEnd]).toEqual([139, 144, 145, 157]);
    for (const [m, tokens] of [[m19, ["PDF 139", "PDF 140", "PDF 145"]], [m04, ["PDF 145", "PDF 146", "PDF 157", "PDF 158"]]] as const) for (const t of tokens) expect(m.source!.sourceNote, m.id).toContain(t);
    expect(flattenPageRefs(manifest).some(p => p.page.source?.pdfPageStart === 139 || p.page.source?.pdfPageStart === 145)).toBe(false);
    expect(pages.some(p => p.source.pdfPageStart === 139 || p.source.pdfPageStart === 145)).toBe(false);
    expect(allBlocks.some(b => b.type === "unit-opener")).toBe(false);
    expect(BATCH.some(m => m.lessons.some(l => l.id.endsWith("-l00")))).toBe(false);
    for (const m of BATCH) for (const p of pagesOf(m)) for (const b of p.blocks) if (b.source) expect([b.source.pdfPageStart >= m.source!.pdfPageStart, (b.source.pdfPageEnd ?? b.source.pdfPageStart) <= m.source!.pdfPageEnd!], b.id).toEqual([true, true]);
  });
  it("HARD STOP: every Batch-7 page < 158; the maximum pdfPageStart among ALL converted real bodies is 157; the earlier bodies still stop at 138; manifest ranges 140–144 / 146–157", () => {
    for (const p of pages) expect(p.source.pdfPageStart, p.id).toBeLessThan(NEXT_BATCH_PDF);
    expect(Math.max(...ALL.flatMap(m => m.lessons.flatMap(l => l.pages.map(p => p.source.pdfPageStart))))).toBe(157);
    expect(Math.max(...PREV.flatMap(m => m.lessons.flatMap(l => l.pages.map(p => p.source.pdfPageStart))))).toBe(138);
    for (const [id, lo, hi, n] of [[M19, 140, 144, 5], [M04, 146, 157, 12]] as const) {
      const pdfs = byId[id].lessons.flatMap(l => l.pages.map(p => p.source!.pdfPageStart));
      expect([Math.min(...pdfs), Math.max(...pdfs), pdfs.length], id).toEqual([lo, hi, n]);
    }
  });
  it("HARD STOP (content): nothing from PDF 158+ leaks — no DMZ, Wi-Fi, SSID, WEP/WPA, access point, IPv6, port-number table, DHCP — and no commands the book does not print", () => {
    const json = JSON.stringify(BATCH);
    expect(json).not.toMatch(/\bDMZ\b|Wi-?Fi|wireless|لاسلكي|\bSSID\b|\bWEP\b|\bWPA\d?\b|Access Point|نقطة الوصول|IPv6|\bDHCP\b|dhcp|default-router|dns-server|\bpool\b|المنطقة العازلة|منافذ مهمة|\bACL\b|access-list/i);
    for (const b of allBlocks) if (b.type === "code") {
      expect(b.language, b.id).toBe("cli");
      for (const line of b.code.split("\n")) expect(line, b.id).toMatch(/^(Switch|Router)(\(config\)#|\(config-subif\)#) \S/);
      expect(b.code, b.id).not.toMatch(/%|\bshow\b|Building configuration|\[OK\]|Enter configuration|copy running|no shutdown|\bexit\b|\bend\b/);
    }
    expect(json).not.toMatch(/\bshow (vlan|vtp|running|interfaces)\b|\bhostname\b|write memory|copy run|spanning-tree|ip routing|ip default-gateway|\bsecret\b|\bline (vty|console)|vtp version|vtp pruning|transparent|revision/i);
  });
});

describe("Batch 7 — SOURCE ORDER (no concept before the book introduces it)", () => {
  const firstPdf = (m: ContentModule, re: RegExp) => pagesOf(m).filter(p => re.test(plain(p))).map(p => p.source.pdfPageStart)[0];
  it("m19 (VTP) never names Router on a Stick, Dot1Q, sub-interfaces or the router; the vtp commands appear only from PDF 142; Domain / Password from 142", () => {
    expect(JSON.stringify(m19)).not.toMatch(/Router on a Stick|Dot1Q|dot1q|Sub-?Interface|واجهة فرعية|Router\(|encapsulation|Inter-VLAN|Sw\d-HFA|Layer 2/);
    expect(firstPdf(m19, /vtp mode|vtp domain|vtp password/)).toBe(142);
    expect(firstPdf(m19, /\bDomain\b|\bPassword\b/)).toBe(142);
    expect(plain(pageBy(M19 + "-l01-p01"))).not.toMatch(/Switch\(config\)|vtp /);
  });
  it("m04 never names VTP (that is m19's section); Router on a Stick is first named on PDF 150 (the book prints it there), Sub-Interface / Inter-VLAN from 151, Dot1Q from 152, router commands from 154, VLAN 30 / 40 from 155", () => {
    expect(JSON.stringify(m04)).not.toMatch(/\bVTP\b|vtp |VLAN Trunking Protocol|\bServer\b|\bClient\b/);
    expect(firstPdf(m04, /Router on a Stick/)).toBe(150);
    expect(firstPdf(m04, /Sub-Interface|Inter-VLAN/)).toBe(151);
    expect(firstPdf(m04, /Dot1Q/)).toBe(152);
    expect(firstPdf(m04, /encapsulation dot1Q/)).toBe(154);
    expect(firstPdf(m04, /Router\(config/)).toBe(154);
    expect(firstPdf(m04, /VLAN 40|g0\/0\.30|g0\/0\.40|dot1Q 30|dot1Q 40/)).toBe(155);   // VLAN 30 itself is already in the PDF 147 figure and the PDF 153 allowed list
    expect(plain(pageBy(M04 + "-l01-p02"))).not.toMatch(/switchport|Switch\(config\)|Dot1Q|Router on a Stick/);
  });
  it("the earlier real modules (m01 … m18, m03) contain none of the Batch-7 content (VTP, Router on a Stick, Dot1Q, sub-interfaces, the Sw*-HFA topology)", () => {
    expect(JSON.stringify(PREV)).not.toMatch(/\bVTP\b|Router on a Stick|Dot1Q|dot1q|Sub-?Interface|encapsulation|Sw\d-HFA|Inter-VLAN|g0\/0\.\d/);
  });
});

describe("Batch 7 — key source facts as printed (CLI boxes, tables, definitions, «تذكّر» boxes)", () => {
  const spans = (pid: string, bid: string) => { const b = blockBy(pageBy(pid), bid); return b.type === "callout" || b.type === "text" ? b.spans.map(s => s.text).join("") : ""; };
  const items = (pid: string, bid: string) => { const b = blockBy(pageBy(pid), bid); return b.type === "list" ? b.items.map(i => [i.term, i.text.map(s => s.text).join(""), i.note]) : null; };
  const code = (pid: string, bid: string) => { const b = blockBy(pageBy(pid), bid); return b.type === "code" ? b.code : null; };
  const table = (pid: string, bid: string): [string[], string[] | undefined, string[][]] => { const b = blockBy(pageBy(pid), bid); return b.type === "table" ? [b.headers, b.columnDirs, b.rows] : [[], undefined, []]; };
  it("PDF 140–144: the VTP definition, facts, «اختصار», the three steps + «الفائدة», the CLI box + annotations + «انتبه», the facts + «للتدريب» / «تأكّد»", () => {
    expect(spans(M19 + "-l01-p01", "m19-l01-p01-def")).toBe("VTP بروتوكول من Cisco لإدارة VLAN على عدة سويتشات.");
    expect(items(M19 + "-l01-p01", "m19-l01-p01-facts")!.map(i => i[1])).toEqual(["المشكلة: تعديل VLAN يدويًا على كل سويتش يأخذ وقتًا.", "الحل: سويتش Server يرسل التحديثات إلى Clients.", "يعمل غالبًا عبر وصلات Trunk."]);
    expect(spans(M19 + "-l01-p01", "m19-l01-p01-abbr")).toBe("VTP = VLAN Trunking Protocol.");
    const steps = blockBy(pageBy(M19 + "-l01-p02"), "m19-l01-p02-steps");
    expect(steps.type === "list" && [steps.variant, steps.items.map(i => i.text.map(s => s.text).join(""))]).toEqual(["ordered", ["نضبط سويتشًا واحدًا كـ Server.", "نضبط باقي السويتشات كـ Client.", "نعرّف VLAN في السيرفر فقط، فتصل تلقائيًا."]]);
    expect(spans(M19 + "-l01-p02", "m19-l01-p02-benefit")).toBe("توفير الوقت وتقليل أخطاء تكرار الإعدادات على كل سويتش.");
    expect(code(M19 + "-l02-p01", "m19-l02-p01-cli")).toBe("Switch(config)# vtp mode server\nSwitch(config)# vtp domain HFA\nSwitch(config)# vtp password 123\nSwitch(config)# vtp mode client");
    expect(table(M19 + "-l02-p01", "m19-l02-p01-cmds")).toEqual([["الأمر", "ماذا يفعل"], ["ltr", "rtl"], [["Switch(config)# vtp mode server", "Server يدير تعريفات VLAN"], ["Switch(config)# vtp domain HFA", "اسم المجال المشترك"], ["Switch(config)# vtp password 123", "كلمة مرور المجال"], ["Switch(config)# vtp mode client", "على السويتش العميل"]]]);
    expect(spans(M19 + "-l02-p01", "m19-l02-p01-warn")).toBe("يجب أن يكون Domain و Password متطابقين، وإلا لن تصل التحديثات.");
    expect(items(M19 + "-l02-p02", "m19-l02-p02-facts")!.map(i => i[1])).toEqual(["كلها يجب أن تكون داخل نفس Domain.", "بهذا تصبح VLAN موحّدة في الشبكة كلها.", "نضبط كل سويتش كـ Client ما عدا السيرفر."]);
    expect(spans(M19 + "-l02-p02", "m19-l02-p02-train")).toBe("يكفي أن تعرف الفرق بين Server و Client ووظيفة كل منهما.");
    expect(items(M19 + "-l02-p03", "m19-l02-p03-facts")!.map(i => i[1])).toEqual(["السيرفر ينقل التعريفات لباقي السويتشات.", "لهذا يقلّ الحاجة لتكرار الأوامر.", "نعرّف كل VLAN مرة واحدة فقط."]);
    expect(spans(M19 + "-l02-p03", "m19-l02-p03-check")).toBe("إذا كان VTP صحيحًا، ستظهر VLAN على العملاء تلقائيًا.");
  });
  it("PDF 146–150: the six-switch Trunk-port table + «قاعدة», the Trunk definition + facts + «تذكّر», the Sw1/Sw2 CLI box, the «قاعدة» of PDF 149, the Sw6 facts + «تذكّر»", () => {
    expect(table(M04 + "-l01-p02", "m04-l01-p02-table")).toEqual([["السويتش", "المنافذ التي ستكون Trunk"], ["ltr", "ltr"], [["Sw1-HFA", "F0/23 , F0/24"], ["Sw2-HFA", "F0/22 , F0/23 , F0/24"], ["Sw3-HFA", "F0/22 , F0/23 , F0/24"], ["Sw4-HFA", "F0/23 , F0/24"], ["Sw5-HFA", "F0/22 , F0/23 , F0/24"], ["Sw6-HFA", "F0/22 , F0/23 , F0/24 , G0/0"]]]);
    expect(spans(M04 + "-l01-p02", "m04-l01-p02-rule")).toBe("المنافذ بين السويتشات غالبًا تكون Trunk لتمرير عدة VLAN عبرها.");
    expect(spans(M04 + "-l01-p03", "m04-l01-p03-def")).toBe("Trunk هو رابط ينقل عدة VLAN عبر نفس الكابل.");
    expect(items(M04 + "-l01-p03", "m04-l01-p03-facts")!.map(i => i[1])).toEqual(["يُستخدم غالبًا بين سويتش وسويتش أو سويتش وراوتر.", "الحزم تحمل Tag حتى نعرف لأي VLAN تنتمي.", "بدون Trunk نحتاج كابلًا منفصلًا لكل VLAN."]);
    expect(spans(M04 + "-l01-p03", "m04-l01-p03-remember")).toBe("Access لجهاز واحد، و Trunk لنقل عدة VLAN عبر كابل واحد.");
    expect(code(M04 + "-l01-p01", "m04-l01-p01-cli")).toBe("Switch(config)# interface range f0/23-24\nSwitch(config)# switchport mode trunk");
    expect(table(M04 + "-l01-p01", "m04-l01-p01-cmds")[2].map(r => r[1])).toEqual(["يحدّد عدة منافذ معًا", "يحوّلها إلى Trunk"]);
    expect(spans(M04 + "-l01-p01", "m04-l01-p01-remember")).toBe("نكتب الأمر على كل سويتش في منافذ الربط بين السويتشات.");
    expect(items(M04 + "-l01-p04", "m04-l01-p04-facts")!.map(i => i[1])).toEqual(["المهم أن يكون المنفذ المقابل Trunk أيضًا.", "بهذا تمرّ VLAN بين السويتشات بسلاسة.", "Trunk يجب أن يكون متّفقًا من الجهتين."]);
    expect(spans(M04 + "-l01-p04", "m04-l01-p04-rule")).toBe("إذا كان أحد الطرفين Trunk والآخر ليس Trunk، لن تمرّ VLAN بينهما.");
    expect(items(M04 + "-l01-p05", "m04-l01-p05-facts")!.map(i => i[1])).toEqual(["رابط الراوتر يحتاج Trunk إذا كان Router on a Stick.", "نقل VLAN للراوتر يسمح بالتوجيه بينها.", "المنفذ G0/0 يربط Sw6 بالراوتر."]);
    expect(spans(M04 + "-l01-p05", "m04-l01-p05-remember")).toBe("الراوتر لا يعرف VLAN إلا إذا وصلته الحزم عبر Trunk.");
  });
  it("PDF 151–155: the Router-on-a-Stick facts + «الهدف», the Dot1Q definition + facts + «الفكرة», the Dot1Q CLI box + «ملاحظة», the two Router CLI boxes with the book's exact lines, annotations and «تذكّر»", () => {
    expect(spans(M04 + "-l02-p01", "m04-l02-p01-def")).toBe("السويتش العادي يعمل في الطبقة الثانية Layer 2.");
    expect(items(M04 + "-l02-p01", "m04-l02-p01-facts")!.map(i => i[1])).toEqual(["الأجهزة في VLAN مختلفة لا تتواصل مباشرة.", "نستخدم راوتر واحد للتوجيه بين VLAN.", "ننشئ Sub-Interface لكل VLAN على نفس المنفذ."]);
    expect(spans(M04 + "-l02-p01", "m04-l02-p01-goal")).toBe("Inter-VLAN Routing — اتصال بين VLAN مختلفة عبر راوتر واحد.");
    expect(spans(M04 + "-l02-p02", "m04-l02-p02-def")).toBe("Dot1Q هو معيار يضع Tag للحزمة.");
    expect(items(M04 + "-l02-p02", "m04-l02-p02-facts")!.map(i => i[1])).toEqual(["الـ Tag يحمل رقم VLAN.", "يسمح بتمييز عدة VLAN على نفس رابط Trunk.", "يُستخدم في Trunk وبين السويتش والراوتر."]);
    expect(spans(M04 + "-l02-p02", "m04-l02-p02-idea")).toBe("Dot1Q يخبر الجهاز: هذه الحزمة تابعة لأي VLAN؟");
    expect(code(M04 + "-l02-p03", "m04-l02-p03-cli")).toBe("Switch(config)# interface g0/1\nSwitch(config)# switchport mode trunk\nSwitch(config)# switchport trunk allowed vlan 10,20,30");
    expect(table(M04 + "-l02-p03", "m04-l02-p03-cmds")[2].map(r => r[1])).toEqual(["نحدّد منفذ GigabitEthernet0/1", "نجعله Trunk", "نسمح بمرور VLAN 10 و 20 و 30"]);
    expect(spans(M04 + "-l02-p03", "m04-l02-p03-note")).toBe("بعض أجهزة Cisco الحديثة تستخدم Dot1Q تلقائيًا دون أمر إضافي.");
    expect(code(M04 + "-l02-p04", "m04-l02-p04-cli")).toBe("Router(config)# interface g0/0.10\nRouter(config-subif)# encapsulation dot1Q 10\nRouter(config-subif)# ip address 192.168.10.254 255.255.255.0\nRouter(config-subif)# interface g0/0.20");
    expect(table(M04 + "-l02-p04", "m04-l02-p04-cmds")[2].map(r => r[1])).toEqual(["Sub-Interface لـ VLAN 10", "يربطها بـ VLAN 10", "Gateway أجهزة VLAN 10", "Sub-Interface لـ VLAN 20"]);
    expect(spans(M04 + "-l02-p04", "m04-l02-p04-remember")).toBe("لكل VLAN نكتب Sub-Interface وعنوان Gateway خاص بها.");
    expect(code(M04 + "-l02-p05", "m04-l02-p05-cli")).toBe("Router(config)# interface g0/0.30\nRouter(config-subif)# encapsulation dot1Q 30\nRouter(config-subif)# ip address 192.168.30.254 255.255.255.0\nRouter(config)# interface g0/0.40\nRouter(config-subif)# encapsulation dot1Q 40\nRouter(config-subif)# ip address 192.168.40.254 255.255.255.0");
    expect(table(M04 + "-l02-p05", "m04-l02-p05-cmds")[2].map(r => r[1])).toEqual(["Sub-Interface لـ VLAN 30", "رقم Dot1Q خاص بـ VLAN 30", "Gateway VLAN 30", "Sub-Interface لـ VLAN 40", "رقم Dot1Q خاص بـ VLAN 40", "Gateway VLAN 40"]);
    expect(spans(M04 + "-l02-p05", "m04-l02-p05-remember")).toBe("لكل VLAN واجهة فرعية Sub-Interface خاصة بها: رقم Dot1Q مختلف وعنوان Gateway مختلف.");
  });
  it("PDF 156–157: the four concept cards with their notes + «للامتحان»; the closing page prints no page number, carries a conversionNote, the four training cards, the book's line, NO library-training block, then the module review", () => {
    expect(items(M04 + "-l03-p01", "m04-l03-p01-cards")).toEqual([
      ["VLAN", "تقسيم افتراضي للشبكة إلى أقسام مستقلة.", "VLAN 10 / VLAN 20"], ["Trunk", "رابط ينقل عدة VLAN عبر نفس الكابل.", "بين سويتشات"],
      ["Dot1Q", "Tag يحدّد رقم VLAN داخل الحزمة.", "encapsulation dot1Q"], ["Router on a Stick", "راوتر واحد يوجّه بين VLAN مختلفة.", "Sub-Interfaces"],
    ]);
    expect(spans(M04 + "-l03-p01", "m04-l03-p01-exam")).toBe("هذه المفاهيم الأربعة مرتبطة ببعضها: VLAN تُقسّم، Trunk ينقل، Dot1Q يميّز، والراوتر يوجّه.");
    const p = pageBy(M04 + "-l03-p02");
    expect(p.source.printedPage).toBeUndefined();
    expect(p.conversionNote).toMatch(/PDF 157/);
    expect(p.conversionNote).toMatch(/QR/);
    expect(items(M04 + "-l03-p02", "m04-l03-p02-cards")!.map(i => i[0])).toEqual(["التدريب التاسع عشر", "التدريب العشرون", "التدريب الحادي والعشرون", "التدريب الثاني والعشرون"]);
    expect(spans(M04 + "-l03-p02", "m04-l03-p02-line")).toBe("امسح رمز QR أو ضع روابط التدريبات هنا · أتممت نموذج 791381 بالكامل.");
    expect(allBlocks.some(b => b.type === "library-training")).toBe(false);
    expect(JSON.stringify(BATCH)).not.toMatch(/T(19|2[0-2])\b|trainingId/);
    expect(p.blocks.map(b => b.id).slice(-4)).toEqual(["m04-l03-p02-review", "m04-l03-p02-r1", "m04-l03-p02-r2", "m04-l03-p02-r3"]);
  });
  it("every CLI box is a `code` block (cli, origin book) that OPENS its page and is followed by a command table whose LTR first column repeats the SAME lines — PDF 142, 148, 153, 154, 155", () => {
    const codes = allBlocks.filter(b => b.type === "code");
    expect(codes.map(b => pages.find(p => p.blocks.includes(b))!.source.pdfPageStart)).toEqual([142, 148, 153, 154, 155]);
    for (const c of codes) {
      if (c.type !== "code") continue;
      const p = pages.find(p => p.blocks.includes(c))!;
      const idx = p.blocks.indexOf(c);
      expect([c.origin, c.language, idx], c.id).toEqual(["book", "cli", 0]);
      const t = p.blocks[idx + 1];
      expect(t.type === "table" && t.origin === "book" && t.columnDirs?.[0] === "ltr" && t.rows.map(r => r[0]).join("\n") === c.code, c.id).toBe(true);
    }
  });
});

describe("Batch 7 — pedagogy: worksheets, solved example, practices with «افحص» feedback, closing reviews; NO activity", () => {
  const practices = allBlocks.filter(b => b.type === "practice");
  it("32 inline practices (m19 10 · m04 22), interactive kinds only, each with 2 hints, «افحص» incorrect feedback and an explanation; every page ends with practice; deterministic shortInput answers", () => {
    expect(BATCH.map(m => pagesOf(m).flatMap(p => p.blocks.filter(b => b.type === "practice")).length)).toEqual([10, 22]);
    for (const b of practices) {
      if (b.type !== "practice") continue;
      expect(b.origin, b.id).toBe("teacher-enrichment");
      expect(["multipleChoice", "trueFalse", "shortInput"], b.id).toContain(b.question.kind);
      const fb = b.question.feedback!;
      expect(fb.hints?.length, b.id).toBe(2);
      expect(fb.incorrectFeedback, b.id).toMatch(/افحص/);
      expect(fb.correctFeedback && fb.explanation, b.id).toBeTruthy();
      if (b.question.kind === "multipleChoice") {
        expect(b.question.options.filter(o => o.correct).length, b.id).toBe(1);
        const correct = b.question.options.find(o => o.correct)!.text;
        for (const h of fb.hints!) expect(h, b.id).not.toBe(correct);
      }
      if (b.question.kind === "shortInput") expect(String(b.question.answer), b.id).toMatch(/^[A-Za-z0-9./]+$/);
    }
    for (const p of pages) expect(p.blocks.at(-1)?.type, p.id).toBe("practice");
  });
  it("six keyed worksheets: Server/Client (PDF 141, 143), vtp command → purpose (142), Dot1Q command → purpose (153), line → VLAN (155), concept (156)", () => {
    const tables = allBlocks.filter(b => b.type === "practice-table");
    expect(tables.map(b => b.id)).toEqual(["m19-l01-p02-match", "m19-l02-p01-match", "m19-l02-p02-match", "m04-l02-p03-match", "m04-l02-p05-match", "m04-l03-p01-match"]);
    const keys = (pid: string, bid: string) => { const t = blockBy(pageBy(pid), bid); return t.type === "practice-table" ? t.rows.map(r => sel(r[1]).key) : null; };
    expect(keys(M19 + "-l01-p02", "m19-l01-p02-match")).toEqual(["Server", "Client", "Server"]);
    expect(keys(M19 + "-l02-p01", "m19-l02-p01-match")).toEqual(["اسم المجال المشترك", "على السويتش العميل", "كلمة مرور المجال", "Server يدير تعريفات VLAN"]);
    expect(keys(M19 + "-l02-p02", "m19-l02-p02-match")).toEqual(["Server", "Client", "Client"]);
    expect(keys(M04 + "-l02-p03", "m04-l02-p03-match")).toEqual(["نسمح بمرور VLAN 10 و 20 و 30", "نحدّد منفذ GigabitEthernet0/1", "نجعله Trunk"]);
    expect(keys(M04 + "-l02-p05", "m04-l02-p05-match")).toEqual(["VLAN 30", "VLAN 40", "VLAN 10", "VLAN 20"]);
    expect(keys(M04 + "-l03-p01", "m04-l03-p01-match")).toEqual(["Trunk", "Router on a Stick", "Dot1Q", "VLAN"]);
    for (const t of tables) if (t.type === "practice-table") for (const r of t.rows) expect(sel(r[1]).options, t.id).toContain(sel(r[1]).key);
  });
  it("one solved example (PDF 155, VLAN 50 built ONLY from the book's three router commands), seventeen clarifications (one per page), one closing review (r1–r3) per module on its last page; no activity block", () => {
    expect(allBlocks.filter(b => b.type === "example").map(b => [b.id, b.type === "example" && b.mode, b.origin])).toEqual([["m04-l02-p05-ex1", "solved", "teacher-enrichment"]]);
    const ex = blockBy(pageBy(M04 + "-l02-p05"), "m04-l02-p05-ex1");
    expect(ex.type === "example" && ex.result).toBe("interface g0/0.50 · encapsulation dot1Q 50 · ip address 192.168.50.254 255.255.255.0");
    expect(allBlocks.filter(b => b.type === "callout" && b.kind === "clarification").length).toBe(17);
    expect(pages.every(p => p.blocks.filter(b => b.type === "callout" && b.kind === "clarification").length === 1)).toBe(true);
    for (const m of BATCH) {
      const last = pagesOf(m).at(-1)!;
      expect(last.blocks.map(b => b.id).slice(-4).map(id => id.replace(/^m(19|04)-l\d\d-p\d\d-/, "")), m.id).toEqual(["review", "r1", "r2", "r3"]);
      expect(pagesOf(m).flatMap(p => p.blocks).filter(b => /-r\d$/.test(b.id)).length, m.id).toBe(3);
    }
    expect(allBlocks.some(b => ["simulation", "animation", "guided", "interactive-diagram", "library-training"].includes(b.type))).toBe(false);
    expect(JSON.stringify(BATCH)).not.toMatch(/interactionType|simulationType|animationType/);
  });
});

describe("Batch 7 — provenance, RTL/LTR, safety", () => {
  it("book-derived blocks are origin:book (m19 15 · m04 36); every practice / worksheet / example / clarification / heading is enrichment", () => {
    for (const b of allBlocks) {
      if (["practice", "practice-table", "example", "heading"].includes(b.type) || (b.type === "callout" && b.kind === "clarification")) expect(b.origin, b.id).toBe("teacher-enrichment");
      else expect(b.origin, b.id).toBe("book");
    }
    expect(BATCH.map(m => pagesOf(m).flatMap(p => p.blocks).filter(b => b.origin === "book").length)).toEqual([15, 36]);
  });
  it("technical tokens are LTR spans; command tables mark the command column ltr; no arrow glyphs, urls, iframes or images; ids are prefix-scoped", () => {
    const spans = allBlocks.flatMap(b => b.type === "callout" || b.type === "text" ? b.spans : b.type === "list" ? b.items.flatMap(i => i.text) : []);
    const ltr = spans.filter(s => s.dir === "ltr").map(s => s.text);
    for (const tok of ["VTP", "Cisco", "VLAN", "Server", "Clients", "Client", "Trunk", "Domain", "Password", "HFA", "123", "VTP = VLAN Trunking Protocol", "Tag", "Access", "Sw6", "G0/0", "Router on a Stick", "Layer 2", "Sub-Interface", "Inter-VLAN Routing", "Dot1Q", "g0/0.10", "g0/0.20", "Router(config)#", "Router(config-subif)#", "encapsulation dot1Q 10", "192.168.10.254", "192.168.30.254", "192.168.40.254", "Gateway", "QR", "Switch 1", "Switch 2"]) expect(ltr, tok).toContain(tok);
    for (const s of spans.filter(s => s.dir !== "ltr")) expect(s.text, s.text).not.toMatch(/^(VTP|VLAN|Trunk|Access|Tag|Dot1Q|Server|Client|Router.*|Switch.*|vtp .*|switchport.*|interface.*|encapsulation.*|\d+\.\d+\.\d+\.\d+|g0\/\d.*|F0\/\d+|G0\/\d)$/);
    for (const b of allBlocks) if (b.type === "table" && b.origin === "book" && b.headers[0] === "الأمر") expect(b.columnDirs, b.id).toEqual(["ltr", "rtl"]);
    const json = JSON.stringify(BATCH);
    for (const banned of ["<iframe", ".pdf", "http://", "https://", "<script", ".png", ".svg", "←", "→", "⇐", "⇒", "⇢", "⇠", "↔"]) expect(json, banned).not.toContain(banned);
    const ids = allBlocks.map(b => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^m(19|04)-l0[1-3]-p0[1-5]-/);
    expect(pageBy(M04 + "-l01-p01").blocks.every(b => b.id.startsWith("m04-l01-p01-"))).toBe(true);
  });
});

describe("Batch 7 — loaders, navigation, server registry agreement, publication invariants, m05–m06 untouched", () => {
  it("the m19 and m04 body loaders EXIST and lazily resolve (5 and 12 pages); m05–m06 still have NO loader", async () => {
    expect([M19, M04].map(id => hasModuleContent("791381", id))).toEqual([true, true]);
    const a = await loadModuleContent("791381", M19), b = await loadModuleContent("791381", M04);
    expect([a.id, a.order, pagesOf(a).length, b.id, b.order, pagesOf(b).length]).toEqual([M19, 16, 5, M04, 17, 12]);
    expect(["791381-m05", "791381-m06"].map(id => hasModuleContent("791381", id))).toEqual([true, true]);   // m05 completed in place by Batch 9, m06 by Batch 10
  });
  it("navigation: m18 → m03 → m19 → m04 → m20 (Batch 8) → … → m05; m03's last page (PDF 138) leads to PDF 140; m19's last page (PDF 144) leads to PDF 146; the historical PDF 148 page follows the new PDF 147 page; after PDF 157 comes Wi-Fi (PDF 159)", () => {
    expect(orderedModules(manifest).map(m => m.id).slice(14, 27)).toEqual(["791381-m03", M19, M04, "791381-m20", "791381-m21", "791381-m22", "791381-m23", "791381-m24", "791381-m05", "791381-m25", "791381-m26", "791381-m27", "791381-m06"]);
    expect(nextPage(manifest, "791381-m03-l04-p04")?.id).toBe(M19 + "-l01-p01");
    expect(previousPage(manifest, M19 + "-l01-p01")?.id).toBe("791381-m03-l04-p04");
    expect(nextPage(manifest, M19 + "-l02-p03")?.id).toBe(M04 + "-l01-p02");
    expect(nextPage(manifest, M04 + "-l01-p03")?.id).toBe(M04 + "-l01-p01");
    expect(nextPage(manifest, M04 + "-l01-p01")?.id).toBe(M04 + "-l01-p04");
    const walk: number[] = []; let cur = nextPage(manifest, "791381-m03-l04-p04");
    while (cur && (cur.id.startsWith(M19) || cur.id.startsWith(M04))) { walk.push(cur.source!.pdfPageStart); cur = nextPage(manifest, cur.id); }
    expect(walk).toEqual([140, 141, 142, 143, 144, ...Array.from({ length: 12 }, (_, i) => 146 + i)]);
    expect([cur?.id, cur?.source!.pdfPageStart]).toEqual(["791381-m20-l01-p01", 159]);   // since Batch 8 the Wi-Fi section follows PDF 157
  });
  it("FRONTEND ↔ SERVER agreement: every module with a body is in the server publication registry with the same title and order (and only those); m19 = 16, m04 = 17 after m03; skeletons m05–m06 absent", () => {
    const withBody = manifest.modules.filter(m => hasModuleContent("791381", m.id)).map(m => ({ moduleId: m.id, title: m.title, order: m.order }));
    const s = server().listLearningModules("791381");
    expect(s).toEqual([...withBody].sort((a, b) => a.order - b.order));
    expect(s.slice(14, 17)).toEqual([{ moduleId: "791381-m03", title: "برمجة السويتش CLI و VLAN", order: 15 }, { moduleId: M19, title: "إدارة VLAN: VTP", order: 16 }, { moduleId: M04, title: "Trunk و Router on a Stick", order: 17 }]);
    expect(server().findLearningModule("791381", "791381-m06")).not.toBeNull();   // m06 completed in place by Batch 10
  });
  it("PUBLISHABLE but NOT auto-published: the server accepts m19 / m04 for explicit publication in canonical order; the registry carries identity + title + order only", () => {
    expect(server().validateLearningModuleIds("791381", [M04, M19, "791381-m03", "791381-m01"])).toEqual(["791381-m01", "791381-m03", M19, M04]);
    expect(server().validateLearningModuleIds("791381", [M04])).toEqual([M04]);
    expect(JSON.stringify(server().listLearningModules("791381"))).not.toMatch(/pages|lessons|blocks|pdf|visibleModuleIds|published/i);
    for (const m of server().listLearningModules("791381")) expect(Object.keys(m).sort()).toEqual(["moduleId", "order", "title"]);
  });
  it("m05 and m06 are UNCHANGED (ids, titles, page ids, PDF mappings, no body) apart from their explicit orders (21 / 22 since Batch 8); b4 = [m03, m19, m04, m05]; b6 unchanged; orders 1..22 contiguous", () => {
    const pagesRef = (id: string) => byId[id].lessons.flatMap(l => l.pages.map(p => [p.id, p.title, p.source!.pdfPageStart, p.source!.printedPage]));
    expect([byId["791381-m05"].title, byId["791381-m05"].order, pagesRef("791381-m05")]).toEqual(["مرجع أوامر Cisco", 23, [["791381-m05-l01-p03", "أوامر السويتش والراوتر", 192, 192], ["791381-m05-l01-p01", "أوامر أساسية للجهاز", 193, 191], ["791381-m05-l01-p02", "أوامر VLAN و Trunk", 194, 192], ["791381-m05-l02-p01", "VTP وكلمات مرور سريعة", 195, 195], ["791381-m05-l02-p02", "Sub-Interface و Dot1Q", 196, 196], ["791381-m05-l02-p03", "أوامر Port Security مختصرة", 197, 197], ["791381-m05-l03-p01", "أوامر الفحص المهمة", 198, 198], ["791381-m05-l03-p02", "OSPF / EIGRP / ACL — تذكير سريع", 199, 199]]]);   // completed in place by Batch 9: historical p01 / p02 unchanged (printed 191 / 192), PDF 192 first as p03
    expect([byId["791381-m06"].title, byId["791381-m06"].order, pagesRef("791381-m06")]).toEqual(["قوائم التحكم ACL", 27, [["791381-m06-l01-p02", "ACL — Access Control List", 223, 223], ["791381-m06-l01-p03", "Standard ACL", 224, 224], ["791381-m06-l01-p04", "Standard ACL — أمثلة", 225, 225], ["791381-m06-l01-p05", "Standard ACL — أمثلة إضافية", 226, 226], ["791381-m06-l01-p01", "Extended ACL", 227, 225], ["791381-m06-l02-p01", "تدريبات", 228, 228], ["791381-m06-l02-p02", "امتحانات نهائية للتدريب", 229, 229]]]);   // completed in place by Batch 10
    for (const id of ["791381-m05", "791381-m06"]) expect(Object.keys(byId[id]).sort(), id).toEqual(["id", "lessons", "order", "shortTitle", "title"].filter(k => k in byId[id]).sort());
    expect(manifest.batches!.find(b => b.id === "b4")!.moduleIds).toEqual(["791381-m03", M19, M04]);   // Batch 9 moved m05 (the book's fifth-batch section) into b5
    expect(manifest.batches!.find(b => b.id === "b6")!.moduleIds).toEqual(["791381-m25", "791381-m26", "791381-m27", "791381-m06"]);   // Batch 10 filled the sixth-batch grouping
    expect(manifest.modules.map(m => m.order)).toEqual(Array.from({ length: 28 }, (_, i) => i + 1));   // 27 since Batch 10, 28 since the final summary (m28)
  });
});
