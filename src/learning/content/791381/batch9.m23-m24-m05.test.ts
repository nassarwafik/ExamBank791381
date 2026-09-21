// Batch 9 phase — source-fidelity, mapping, provenance, pedagogy, SOURCE-ORDER and HARD-STOP guards for the book's
// sections «Port Security» (PDF 180–184, NEW module m23), «حماية أجهزة Cisco» (PDF 185–191, NEW module m24; PDF 191
// is the closing QR trainings page) and «مرجع أوامر Cisco» (PDF 192–199, the HISTORICAL skeleton m05 COMPLETED IN
// PLACE). PDF 200 is the «الدفعة السادسة · WAN والتوجيه و ACL» cover: nothing from PDF 200+ is ever converted here.
// Guards also cover: unique ids, manifest ↔ body ↔ server-registry agreement, the immutable historical m05 pages,
// navigation m22 → m23 → m24 → m05 → m06, the loaders, publishable-not-auto-published, the untouched Batch 6–8
// bodies, and the twelve REAL book CLI exercises driven through the extended simulator with the book's own lines.
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
import m20 from "./modules/m20";
import m21 from "./modules/m21";
import m22 from "./modules/m22";
import m23 from "./modules/m23";
import m24 from "./modules/m24";
import m05 from "./modules/m05";
import manifest from "./manifest";
import { hasModuleContent, loadModuleContent } from "../registry";
import { nextPage, previousPage, orderedModules, flattenPageRefs } from "../navigation";
import { validateLearningCourseContent } from "../validation";
import { LEARNING_CONTENT_SCHEMA_VERSION, type LearningCourseContent, type ContentBlock, type ContentModule, type ContentPage, type PracticeTableSelectCell, type SimulationBlock } from "../types";
import { productionActivityRegistry } from "../../activities/engine";
import { readCliExerciseConfig } from "../../cli/config";
import { createSession, submitCommand, goalStatus, CLI_FEEDBACK, type CliSession } from "../../cli/exercise";
import { CLI_MODE_LABEL } from "../../cli/state";
// @ts-expect-error — the server registry is an untyped CommonJS module; it is imported here on purpose to cross-check it.
import * as apiRegistry from "../../../../api/src/lib/learning-materials-registry.js";

const PREV = [m01, m02, m07, m08, m09, m10, m11, m12, m13, m14, m15, m16, m17, m18, m03, m19, m04, m20, m21, m22];
const BATCH = [m23, m24, m05];
const ALL = [...PREV, ...BATCH];
const course: LearningCourseContent = { schemaVersion: LEARNING_CONTENT_SCHEMA_VERSION, courseId: "791381", title: "شبكات الاتصال", direction: "rtl", modules: ALL };
const pagesOf = (m: ContentModule): ContentPage[] => [...m.lessons].sort((a, b) => a.order - b.order).flatMap(l => [...l.pages].sort((a, b) => a.order - b.order));
const pages = BATCH.flatMap(pagesOf);
const pageBy = (id: string): ContentPage => pages.find(p => p.id === id)!;
const blockBy = (p: ContentPage, id: string): ContentBlock => p.blocks.find(b => b.id === id)!;
const plain = (p: ContentPage): string => JSON.stringify(p.blocks);
const sel = (cell: unknown) => cell as PracticeTableSelectCell;
const allBlocks = pages.flatMap(p => p.blocks);
const M23 = "791381-m23", M24 = "791381-m24", M05 = "791381-m05";
const byId = Object.fromEntries(manifest.modules.map(m => [m.id, m]));
const NEXT_BATCH_PDF = 200;
const server = () => (apiRegistry as unknown as { listLearningModules: (c: string) => { moduleId: string; title: string; order: number }[]; findLearningModule: (c: string, m: string) => unknown; validateLearningModuleIds: (c: string, ids: string[]) => string[] });
const sims = (m: ContentModule) => pagesOf(m).flatMap(p => p.blocks.filter((b): b is SimulationBlock => b.type === "simulation").map(b => ({ page: p, block: b })));
const exOf = (id: string) => { const b = allBlocks.find(x => x.id === id) as SimulationBlock; return readCliExerciseConfig(b.config)!; };
const drive = (ex: ReturnType<typeof exOf>, ...lines: string[]) => lines.reduce((s, l) => submitCommand(ex, s, l), createSession(ex));
const last = (s: CliSession) => s.history[s.history.length - 1];

// PDF → [printed page, title, page id]. The two historical m05 pages keep the skeleton's printed numbers (191 / 192);
// every other page follows the page circle = PDF index rule.
const MAP: Record<number, [number, string, string]> = {
  180: [180, "Port Security", M23 + "-l01-p01"], 181: [181, "سيناريو Port Security", M23 + "-l01-p02"],
  182: [182, "Port Security — MAC ثابت", M23 + "-l02-p01"], 183: [183, "Port Security — Sticky MAC", M23 + "-l02-p02"], 184: [184, "Port Security — عدد الأجهزة", M23 + "-l02-p03"],
  185: [185, "حماية السويتشات والراوترات", M24 + "-l01-p01"], 186: [186, "طرق الدخول إلى أجهزة Cisco", M24 + "-l01-p02"],
  187: [187, "كلمة مرور VTY", M24 + "-l02-p01"], 188: [188, "كلمة مرور Console", M24 + "-l02-p02"], 189: [189, "تشفير كلمات المرور", M24 + "-l02-p03"], 190: [190, "عرض الإعدادات", M24 + "-l02-p04"],
  191: [191, "تدريبات على DHCP و Security", M24 + "-l03-p01"],
  192: [192, "أوامر السويتش والراوتر", M05 + "-l01-p03"], 193: [191, "أوامر أساسية للجهاز", M05 + "-l01-p01"], 194: [192, "أوامر VLAN و Trunk", M05 + "-l01-p02"],
  195: [195, "VTP وكلمات مرور سريعة", M05 + "-l02-p01"], 196: [196, "Sub-Interface و Dot1Q", M05 + "-l02-p02"], 197: [197, "أوامر Port Security مختصرة", M05 + "-l02-p03"],
  198: [198, "أوامر الفحص المهمة", M05 + "-l03-p01"], 199: [199, "OSPF / EIGRP / ACL — تذكير سريع", M05 + "-l03-p02"],
};

describe("Batch 9 — validation, identities, mapping PDF 180–199, m05 completed IN PLACE, HARD STOP before PDF 200", () => {
  it("the WHOLE real course (every module except the m06 skeleton) produces ZERO validation issues; every id is unique", () => {
    expect(validateLearningCourseContent(course)).toEqual([]);
    const ids = ALL.flatMap(m => [m.id, ...m.lessons.flatMap(l => [l.id, ...l.pages.flatMap(p => [p.id, ...p.blocks.map(b => b.id)])])]);
    expect(new Set(ids).size).toBe(ids.length);
    const refIds = manifest.modules.flatMap(m => [m.id, ...m.lessons.flatMap(l => [l.id, ...l.pages.map(p => p.id)])]);
    expect(new Set(refIds).size).toBe(refIds.length);
  });
  it("m23 / m24 are NEW stable ids (orders 21 / 22); m05 keeps the historical skeleton's id, title, shortTitle and lesson l01 id/title and reads at order 23; lesson structure pinned", () => {
    expect([m23.id, m23.title, m23.shortTitle, m23.order, m23.partial]).toEqual([M23, "Port Security", "Port Security", 21, undefined]);
    expect([m24.id, m24.title, m24.shortTitle, m24.order, m24.partial]).toEqual([M24, "حماية أجهزة Cisco", "حماية الأجهزة", 22, undefined]);
    expect([m05.id, m05.title, m05.shortTitle, m05.order, m05.partial]).toEqual([M05, "مرجع أوامر Cisco", "أوامر Cisco", 23, undefined]);
    expect(m23.lessons.map(l => [l.id, l.title, l.order, l.pages.length])).toEqual([[M23 + "-l01", "ما هو Port Security", 1, 2], [M23 + "-l02", "أوامر Port Security", 2, 3]]);
    expect(m24.lessons.map(l => [l.id, l.title, l.order, l.pages.length])).toEqual([[M24 + "-l01", "طرق الدخول إلى أجهزة Cisco", 1, 2], [M24 + "-l02", "كلمات المرور وعرض الإعدادات", 2, 4], [M24 + "-l03", "تدريبات نهاية القسم", 3, 1]]);
    expect(m05.lessons.map(l => [l.id, l.title, l.order, l.pages.length])).toEqual([[M05 + "-l01", "الأوامر الأساسية", 1, 3], [M05 + "-l02", "VTP و Dot1Q و Port Security", 2, 3], [M05 + "-l03", "أوامر الفحص وما بعد", 3, 2]]);
    for (const [id, title, order] of [[M23, "Port Security", 21], [M24, "حماية أجهزة Cisco", 22], [M05, "مرجع أوامر Cisco", 23]] as const) expect([byId[id].title, byId[id].order], id).toEqual([title, order]);
    expect(manifest.modules.filter(m => /m05|m23|m24/.test(m.id)).map(m => m.id)).toEqual([M23, M24, M05]);   // no duplicate / parallel module for the command reference
    expect(manifest.modules.some(m => /m29|m30/.test(m.id))).toBe(false);   // Batch 10 later added m25–m27, the final summary m28
  });
  it("HISTORICAL-ID IMMUTABILITY: 791381-m05-l01-p01 = PDF 193 «أوامر أساسية للجهاز» (printed 191) and -p02 = PDF 194 «أوامر VLAN و Trunk» (printed 192), same keywords, identical in manifest and body; only their `order` moved (2 / 3); not recreated under new ids", () => {
    const hist = (src: { id: string; title: string; order: number; source?: unknown; keywords?: string[] }[]) => src.filter(p => /-l01-p0[12]$/.test(p.id)).map(p => [p.id, p.title, p.order, p.source, p.keywords]);
    const expected = [
      [M05 + "-l01-p01", "أوامر أساسية للجهاز", 2, { kind: "book", sourceId: "791381", pdfPageStart: 193, printedPage: 191 }, ["cisco", "cli"]],
      [M05 + "-l01-p02", "أوامر VLAN و Trunk", 3, { kind: "book", sourceId: "791381", pdfPageStart: 194, printedPage: 192 }, ["vlan", "trunk"]],
    ];
    expect(hist(byId[M05].lessons[0].pages)).toEqual(expected);
    expect(hist(m05.lessons[0].pages)).toEqual(expected);
    for (const id of [M05 + "-l01-p01", M05 + "-l01-p02"]) expect([pageBy(id).source.pdfPageEnd, pageBy(id).source.sourceNote, pageBy(id).conversionNote], id).toEqual([undefined, undefined, undefined]);
    expect(pages.filter(p => p.source.pdfPageStart === 193 || p.source.pdfPageStart === 194).map(p => p.id)).toEqual([M05 + "-l01-p01", M05 + "-l01-p02"]);
    expect(m05.lessons[0].pages.map(p => [p.id, p.order])).toEqual([[M05 + "-l01-p03", 1], [M05 + "-l01-p01", 2], [M05 + "-l01-p02", 3]]);
  });
  it("maps the twenty learner pages 1:1 to PDF 180..199 in SOURCE ORDER (explicit `order`), with the pinned titles, ids and printed pages; manifest TOC = body", () => {
    expect(pagesOf(m23).map(p => p.source.pdfPageStart)).toEqual([180, 181, 182, 183, 184]);
    expect(pagesOf(m24).map(p => p.source.pdfPageStart)).toEqual([185, 186, 187, 188, 189, 190, 191]);
    expect(pagesOf(m05).map(p => p.source.pdfPageStart)).toEqual([192, 193, 194, 195, 196, 197, 198, 199]);
    expect(pages).toHaveLength(20);
    for (const p of pages) {
      const [printed, title, id] = MAP[p.source.pdfPageStart];
      expect([p.id, p.title, p.source.kind, p.source.sourceId, p.source.pdfPageEnd, p.source.printedPage], String(p.source.pdfPageStart)).toEqual([id, title, "book", "791381", undefined, printed]);
    }
    for (const m of BATCH) for (const l of m.lessons) {
      const ref = byId[m.id].lessons.find(x => x.id === l.id)!;
      expect([ref.title, ref.order, ref.pages.map(p => [p.id, p.title, p.order, p.source, p.keywords])], l.id).toEqual([l.title, l.order, l.pages.map(p => [p.id, p.title, p.order, p.source, p.keywords])]);
      expect(new Set(l.pages.map(p => p.order)).size, l.id).toBe(l.pages.length);
    }
    expect(pages.filter(p => p.conversionNote).map(p => p.id)).toEqual([M24 + "-l03-p01"]);   // only the QR trainings page carries a note
  });
  it("no section cover in this batch: module source ranges 180–184 / 185–191 / 192–199 with sourceNotes naming the neighbours; no unit openers; PDF 200 named only as the stop", () => {
    expect([m23.source!.pdfPageStart, m23.source!.pdfPageEnd, m24.source!.pdfPageStart, m24.source!.pdfPageEnd, m05.source!.pdfPageStart, m05.source!.pdfPageEnd]).toEqual([180, 184, 185, 191, 192, 199]);
    for (const [m, tokens] of [[m23, ["PDF 180–184", "PDF 179", "m22", "PDF 185", "m24"]], [m24, ["PDF 185–191", "PDF 184", "m23", "PDF 192", "m05"]], [m05, ["PDF 192–199", "PDF 191", "m24", "PDF 200"]]] as const) for (const t of tokens) expect(m.source!.sourceNote, m.id).toContain(t);
    expect(allBlocks.some(b => b.type === "unit-opener")).toBe(false);
    expect(BATCH.some(m => m.lessons.some(l => l.id.endsWith("-l00")))).toBe(false);
    for (const m of BATCH) for (const p of pagesOf(m)) for (const b of p.blocks) if (b.source) expect([b.source.pdfPageStart >= m.source!.pdfPageStart, (b.source.pdfPageEnd ?? b.source.pdfPageStart) <= m.source!.pdfPageEnd!], b.id).toEqual([true, true]);
  });
  it("HARD STOP: every Batch-9 page < 200; the maximum pdfPageStart among ALL converted real bodies is 199; the earlier bodies still stop at 179; the m06 skeleton (PDF 227) is not reached", () => {
    for (const p of pages) expect(p.source.pdfPageStart, p.id).toBeLessThan(NEXT_BATCH_PDF);
    expect(Math.max(...ALL.flatMap(m => m.lessons.flatMap(l => l.pages.map(p => p.source.pdfPageStart))))).toBe(199);
    expect(Math.max(...PREV.flatMap(m => m.lessons.flatMap(l => l.pages.map(p => p.source.pdfPageStart))))).toBe(179);
    for (const [id, lo, hi] of [[M23, 180, 184], [M24, 185, 191], [M05, 192, 199]] as const) {
      const starts = byId[id].lessons.flatMap(l => l.pages.map(p => p.source!.pdfPageStart));
      expect([Math.min(...starts), Math.max(...starts)], id).toEqual([lo, hi]);
    }
    expect(byId["791381-m06"].lessons[0].pages.map(p => p.source!.pdfPageStart)).toEqual([223, 224, 225, 226, 227]);   // m06 completed in place by Batch 10
    expect(flattenPageRefs(manifest).some(p => p.page.source?.pdfPageStart === 200)).toBe(false);
  });
  it("NO LEAKAGE from PDF 200+ (WAN, the glossary, the closing word, routing-protocol / ACL / NAT configuration) in any Batch-9 lesson or manifest entry", () => {
    const ban = /\bWAN\b|قاموس|كلمة الختام|ملخّص بصري|الدفعة السادسة|router ospf|router eigrp|access-list \d|ip access-list|\bNAT\b|ip nat|ip route \d|network \d+\.\d+\.\d+\.\d+ area/i;
    for (const m of BATCH) expect(JSON.stringify(m.lessons), m.id).not.toMatch(ban);
    for (const id of [M23, M24, M05]) expect(JSON.stringify(byId[id]), id).not.toMatch(ban);
    expect(m05.source!.sourceNote).toMatch(/PDF 200 صفحة عنوان الدفعة السادسة/);   // the cover is named only as the boundary
  });
  it("SOURCE ORDER inside the batch: m23 never names line / password / enable secret / banner; m24 never names port-security / VTP / dot1Q; in m05 banner first on 193, VTP on 195, dot1Q on 196, port-security on 197, the show groups on 198, OSPF on 199", () => {
    expect(JSON.stringify(m23.lessons)).not.toMatch(/line vty|line console|password|enable secret|banner|dot1Q|VTP/);
    expect(JSON.stringify(m24.lessons)).not.toMatch(/port-security|switchport|VTP|dot1Q|Sub-Interface|OSPF|EIGRP|ACL/);
    const first = (m: ContentModule, re: RegExp) => pagesOf(m).find(p => re.test(plain(p)))?.source.pdfPageStart;
    expect(first(m23, /mac-address 00A0/)).toBe(182);
    expect(first(m23, /sticky/)).toBe(183);
    expect(first(m23, /maximum 3/)).toBe(184);
    expect(first(m24, /line vty 0 4/)).toBe(186);
    expect(first(m24, /password cisco123/)).toBe(187);
    expect(first(m24, /line console 0/)).toBe(186);
    expect(first(m24, /password-encryption/)).toBe(189);
    expect(first(m24, /show running-config/)).toBe(190);
    expect(first(m24, /T23/)).toBe(191);
    expect(first(m05, /banner motd/)).toBe(193);
    expect(first(m05, /interface range f0\/1-10/)).toBe(194);
    expect(first(m05, /vtp mode/)).toBe(195);
    expect(first(m05, /dot1Q/)).toBe(196);
    expect(first(m05, /maximum 2/)).toBe(197);
    expect(first(m05, /show ip route|show cdp neighbors|show arp/)).toBe(198);
    expect(first(m05, /OSPF|EIGRP|access-lists/)).toBe(199);
  });
});

describe("Batch 9 — source fidelity (facts, cards, the twelve CLI boxes)", () => {
  const CODE: Record<string, string> = {
    [M23 + "-l02-p01"]: "Device(config)# interface f0/1\nDevice(config)# switchport mode access\nDevice(config)# switchport port-security mac-address 00A0.1234.5678\nDevice(config)# switchport port-security violation shutdown",
    [M23 + "-l02-p02"]: "Device(config)# switchport port-security\nDevice(config)# switchport port-security mac-address sticky",
    [M23 + "-l02-p03"]: "Device(config)# switchport port-security maximum 3\nDevice(config)# switchport port-security violation shutdown",
    [M24 + "-l02-p01"]: "Device(config)# line vty 0 4\nDevice(config)# password cisco123\nDevice(config)# login",
    [M24 + "-l02-p02"]: "Device(config)# line console 0\nDevice(config)# password cisco123\nDevice(config)# login",
    [M24 + "-l02-p03"]: "Device(config)# service password-encryption\nDevice(config)# enable secret cisco123",
    [M24 + "-l02-p04"]: "Device(config)# show running-config\nDevice(config)# show startup-config",
    [M05 + "-l01-p01"]: "Device(config)# enable\nDevice(config)# hostname SW1\nDevice(config)# banner motd #...#\nDevice(config)# no shutdown",
    [M05 + "-l01-p02"]: "Device(config)# interface range f0/1-10\nDevice(config)# vlan 10\nDevice(config)# switchport access vlan 10\nDevice(config)# switchport mode trunk",
    [M05 + "-l02-p01"]: "Device(config)# vtp mode server\nDevice(config)# vtp mode client\nDevice(config)# enable secret cisco123\nDevice(config)# line console 0 / line vty 0 4",
    [M05 + "-l02-p02"]: "Device(config)# interface g0/0.10\nDevice(config)# encapsulation dot1Q 10\nDevice(config)# ip address 192.168.10.254 255.255.255.0",
    [M05 + "-l02-p03"]: "Device(config)# interface f0/1\nDevice(config)# switchport mode access\nDevice(config)# switchport port-security maximum 2\nDevice(config)# switchport port-security violation shutdown",
  };
  it("every «Cisco CLI» box is a `code` block that OPENS its page with the book's exact lines and generic Device(config)# prompt, followed by the annotation table whose first column repeats those lines; no other page has a code block", () => {
    for (const [id, code] of Object.entries(CODE)) {
      const p = pageBy(id);
      const c = p.blocks[0];
      expect([c.type, c.origin, c.type === "code" && c.language, c.type === "code" && c.code], id).toEqual(["code", "book", "cli", code]);
      const t = p.blocks[1];
      expect(t.type === "table" && [t.origin, t.columnDirs, t.rows.map(r => r[0])], id).toEqual(["book", ["ltr", "rtl"], code.split("\n")]);
      for (const line of code.split("\n")) expect(line).toMatch(/^Device\(config\)# \S/);
    }
    expect(pages.filter(p => p.blocks.some(b => b.type === "code")).map(p => p.id).sort()).toEqual(Object.keys(CODE).sort());
  });
  it("PDF 180–181: definition, facts, «تذكّر», scenario roles and «الفكرة»; PDF 182–184 boxes' annotations and «تذكّر» / «متى؟»", () => {
    expect(plain(pageBy(M23 + "-l01-p01"))).toContain("خاصية في السويتش للتحكّم بمن يُسمح له بالاتصال");
    expect(plain(pageBy(M23 + "-l01-p01"))).toContain("= حماية المنفذ حسب الجهاز المتصل به");
    const sc = plain(pageBy(M23 + "-l01-p02"));
    for (const t of ["المنفذ يحفظ عنوان", "PC0", "PC1", "جهاز غريب", "الجهاز المصرّح به يعمل، وغيره يُرفض", "المنفذ لا يقبل أي جهاز عشوائي، بل المسموح به فقط"]) expect(sc).toContain(t);
    const t182 = blockBy(pageBy(M23 + "-l02-p01"), "m23-l02-p01-cmds");
    expect(t182.type === "table" && t182.rows.map(r => r[1])).toEqual(["نحدّد المنفذ", "نجعله Access", "نسمح فقط للـ MAC المكتوب", "يغلق المنفذ عند المخالفة"]);
    expect(plain(pageBy(M23 + "-l02-p01"))).toContain("يعني إغلاق المنفذ تمامًا عند دخول جهاز غير مسموح");
    expect(plain(pageBy(M23 + "-l02-p02"))).toContain("مفيد عندما لا نعرف");
    expect(plain(pageBy(M23 + "-l02-p03"))).toContain("إذا زاد العدد تحدث مخالفة، ويمكن تغيير العدد حسب الحاجة");
  });
  it("PDF 185–191: the three access cards with their commands, the line / encryption / show annotations, «تذكّر» boxes, and the T23–T26 QR cards with the book's note (+ the Learning-Practice cards T23–T26, metadata only)", () => {
    const cards = blockBy(pageBy(M24 + "-l01-p02"), "m24-l01-p02-table");
    expect(cards.type === "table" && cards.rows.map(r => [r[0], r[2]])).toEqual([["Console", "line console 0"], ["VTY", "line vty 0 4"], ["Enable", "enable secret"]]);
    expect(plain(pageBy(M24 + "-l01-p02"))).toContain("= قريب من الجهاز");
    expect(plain(pageBy(M24 + "-l02-p01"))).toContain("لأنه أكثر أمانًا ويشفّر البيانات");
    const t189 = blockBy(pageBy(M24 + "-l02-p03"), "m24-l02-p03-cmds");
    expect(t189.type === "table" && t189.rows.map(r => r[1])).toEqual(["يخفي كلمات المرور العادية في الإعدادات", "أقوى من enable password"]);
    expect(plain(pageBy(M24 + "-l02-p04"))).toContain("ولا تنسَ الحفظ بعد البرمجة");
    const qr = blockBy(pageBy(M24 + "-l03-p01"), "m24-l03-p01-cards");
    expect(qr.type === "list" && qr.items.map(i => i.term)).toEqual(["T23", "T24", "T25", "T26"]);
    expect(plain(pageBy(M24 + "-l03-p01"))).toContain("يُفضّل حل التدريبات بعد مراجعة");
    expect(allBlocks.filter(b => b.type === "library-training").map(b => b.trainingId)).toEqual(["T23", "T24", "T25", "T26"]);   // since the Learning-Practice phase
  });
  it("PDF 192–199: intro facts + «مهم», the five reference boxes' annotations, «انتبه», the four show groups as printed, and the OSPF / EIGRP / ACL outlook", () => {
    expect(plain(pageBy(M05 + "-l01-p03"))).toContain("المطلوب: معرفة وظيفة الأمر ومتى يُستخدم");
    const t193 = blockBy(pageBy(M05 + "-l01-p01"), "m05-l01-p01-cmds");
    expect(t193.type === "table" && t193.rows.map(r => r[1])).toEqual(["للدخول إلى الإعدادات ثم config t", "يغيّر اسم الجهاز", "يضيف رسالة عند الدخول", "يشغّل المنفذ"]);
    expect(plain(pageBy(M05 + "-l01-p02"))).toContain("للأجهزة النهائية");
    expect(plain(pageBy(M05 + "-l02-p01"))).toContain("متطابقًا بين الأجهزة لتصل التحديثات");
    expect(plain(pageBy(M05 + "-l02-p02"))).toContain("خاصة بها على الراوتر");
    expect(plain(pageBy(M05 + "-l02-p03"))).toContain("من أكثر الأوامر العملية ظهورًا في التدريب");
    const groups = blockBy(pageBy(M05 + "-l03-p01"), "m05-l03-p01-groups");
    expect(groups.type === "list" && groups.items.map(i => [i.term, i.text.filter(s => s.dir === "ltr").map(s => s.text)])).toEqual([
      ["VLAN & Ports", ["show vlan brief", "show ip interface brief", "show mac-address-table", "show vtp status"]],
      ["Port Security", ["show port-security", "show port-security interface F0/1"]],
      ["Config", ["show interfaces", "show running-config", "show startup-config"]],
      ["Routing & Services", ["show arp", "show cdp neighbors", "show ip route", "show ip dhcp pool"]],
    ]);
    expect(plain(pageBy(M05 + "-l03-p01"))).toContain("للفحص فقط، ولا تغيّر الإعدادات");
    const outlook = plain(pageBy(M05 + "-l03-p02"));
    for (const t of ["بروتوكولات توجيه", "تتحكّم بالسماح أو المنع", "show access-lists", "سيتم شرح هذه المواضيع بالتفصيل في الوحدة القادمة"]) expect(outlook).toContain(t);
  });
});

describe("Batch 9 — the twelve REAL book CLI exercises (simulation / cli-terminal / v1)", () => {
  const expected: [number, string, string][] = [
    [182, "m23-l02-p01-sim", "guided"], [183, "m23-l02-p02-sim", "challenge"], [184, "m23-l02-p03-sim", "task"],
    [187, "m24-l02-p01-sim", "guided"], [188, "m24-l02-p02-sim", "challenge"], [189, "m24-l02-p03-sim", "task"], [190, "m24-l02-p04-sim", "challenge"],
    [193, "m05-l01-p01-sim", "guided"], [194, "m05-l01-p02-sim", "challenge"], [195, "m05-l02-p01-sim", "challenge"], [196, "m05-l02-p02-sim", "task"], [197, "m05-l02-p03-sim", "task"],
  ];
  it("exactly twelve exercises on the CLI pages (none on 180, 181, 185, 186, 191, 192, 198, 199), one per page, all teacher-enrichment, resolvable, with fallback text and two-step hints", () => {
    const all = BATCH.flatMap(sims);
    expect(all.map(e => [e.page.source.pdfPageStart, e.block.id, readCliExerciseConfig(e.block.config)?.kind])).toEqual(expected);
    for (const e of all) {
      expect(productionActivityRegistry.resolve(e.block)?.key, e.block.id).toBe("cli-terminal");
      expect([e.block.simulationType, e.block.version, e.block.origin, e.block.capabilities], e.block.id).toEqual(["cli-terminal", 1, "teacher-enrichment", { fullscreen: true, reset: true, interactive: true }]);
      expect(e.block.fallback?.text, e.block.id).toBeTruthy();
      const ex = readCliExerciseConfig(e.block.config)!;
      if (ex.kind === "task") { expect(ex.hints, e.block.id).toHaveLength(2); expect(ex.goals!.length, e.block.id).toBeGreaterThanOrEqual(3); }
      else for (const s of ex.steps!) expect(s.hints, e.block.id + "/" + s.id).toHaveLength(2);
    }
    expect(allBlocks.filter(b => b.type === "animation" || b.type === "guided" || b.type === "interactive-diagram")).toHaveLength(0);
    expect(new Set(pages.map(p => sims({ ...m23, lessons: [{ id: "x", title: "x", order: 1, pages: [p] }] }).length)).has(2)).toBe(false);
  });
  it("Port Security: the guided box (182) completes with the book's lines and rejects a wrong MAC; the Sticky challenge (183) accepts only its two commands; the task (184) needs enabled + maximum 3 + shutdown on an access port", () => {
    const g = exOf("m23-l02-p01-sim");
    expect(createSession(g).state.mode).toBe("global");
    const done = drive(g, "interface f0/1", "switchport mode access", "switchport port-security mac-address 00A0.1234.5678", "switchport port-security violation shutdown");
    expect([done.completed, done.stepIndex]).toEqual([true, 4]);
    const wrongMac = drive(g, "interface f0/1", "switchport mode access", "switchport port-security mac-address 00A0.1234.9999");
    expect([wrongMac.stepIndex, last(wrongMac).feedback]).toEqual([2, CLI_FEEDBACK.retry]);
    const c = exOf("m23-l02-p02-sim");
    let s = createSession(c);
    expect([s.state.mode, s.state.interfaces["f0/1"].switchportMode]).toEqual(["interface", "access"]);
    s = submitCommand(c, s, "switchport port-security maximum 3");   // valid, not part of this challenge → refused, not executed
    expect([last(s).status, s.state.interfaces["f0/1"].portSecurity]).toEqual(["not-required", undefined]);
    s = submitCommand(c, s, "switchport port-security mac-address sticky");   // right command, wrong step → retry (state does change: it is a real command)
    expect([s.stepIndex, last(s).feedback]).toEqual([0, CLI_FEEDBACK.retry]);
    s = submitCommand(c, s, "switchport port-security");
    s = submitCommand(c, s, "switchport port-security mac-address sticky");
    expect([s.completed, s.state.interfaces["f0/1"].portSecurity]).toEqual([true, { enabled: true, sticky: true }]);
    const t = exOf("m23-l02-p03-sim");
    const partial = drive(t, "enable", "conf t", "interface f0/1", "switchport mode access", "switchport port-security maximum 3", "switchport port-security violation shutdown");
    expect([partial.completed, goalStatus(t, partial.state).map(x => x.met)]).toEqual([false, [true, false, true, true]]);
    expect(submitCommand(t, partial, "switchport port-security").completed).toBe(true);
    expect(drive(t, "enable", "conf t", "interface f0/2", "switchport mode access", "switchport port-security", "switchport port-security maximum 3", "switchport port-security violation shutdown").completed).toBe(false);
  });
  it("Device protection: the VTY guided box (187) walks through enable → global → line vty → password → login; the console challenge (188) distinguishes the lines; the hardening task (189) needs both lines + secret + encryption; the show challenge (190) never changes state", () => {
    const g = exOf("m24-l02-p01-sim");
    let s = drive(g, "line vty 0 4");
    expect([s.stepIndex, last(s).feedback]).toEqual([0, CLI_FEEDBACK.wrongMode(CLI_MODE_LABEL.global)]);
    s = ["enable", "configure terminal", "line vty 0 4", "password cisco123", "login"].reduce((acc, l) => submitCommand(g, acc, l), createSession(g));
    expect([s.completed, s.state.lines.vty]).toEqual([true, { password: "cisco123", login: true }]);
    const c = exOf("m24-l02-p02-sim");
    let cs = submitCommand(c, createSession(c), "line vty 0 4");   // navigation-class (free to move), but not the asked line → step does not advance
    expect([cs.stepIndex, last(cs).feedback, cs.state.selectedLine]).toEqual([0, CLI_FEEDBACK.done, "vty"]);
    cs = ["exit", "line console 0", "password cisco123", "login"].reduce((acc, l) => submitCommand(c, acc, l), cs);
    expect([cs.completed, cs.state.lines.console, cs.state.lines.vty]).toEqual([true, { password: "cisco123", login: true }, { login: false }]);
    const t = exOf("m24-l02-p03-sim");
    const partial = drive(t, "enable", "conf t", "line console 0", "password cisco123", "login", "exit", "line vty 0 4", "password cisco123", "login", "exit", "enable secret cisco123");
    expect(goalStatus(t, partial.state).map(x => x.met)).toEqual([true, true, true, true, true, false]);
    expect(submitCommand(t, partial, "service password-encryption").completed).toBe(true);
    const wrongPw = drive(t, "enable", "conf t", "line console 0", "password cisco", "login", "exit", "line vty 0 4", "password cisco123", "login", "exit", "enable secret cisco123", "service password-encryption");
    expect([wrongPw.completed, goalStatus(t, wrongPw.state)[0].met]).toEqual([false, false]);
    const sh = exOf("m24-l02-p04-sim");
    let ss = createSession(sh);
    const before = JSON.stringify(ss.state);
    ss = submitCommand(sh, ss, "hostname X");   // wrong mode from privileged EXEC — never executed
    expect(last(ss).status).toBe("wrong-mode");
    ss = submitCommand(sh, ss, "show running-config");
    expect([ss.stepIndex, last(ss).output?.[1]]).toEqual([1, "hostname SW1"]);
    ss = submitCommand(sh, ss, "show startup-config");
    expect([ss.completed, last(ss).output?.[0], JSON.stringify(ss.state)]).toEqual([true, "startup-config is not present", before]);
  });
  it("Command reference: the basics guided box (193) accepts any #…# banner and needs an interface for no shutdown; the VLAN challenge (194) follows the book's four lines with free navigation; the VTP challenge (195) ends with the fix-the-command; the sub-interface (196) and Port Security (197) tasks complete only on the book's final state", () => {
    const g = exOf("m05-l01-p01-sim");
    const s = drive(g, "enable", "config t", "hostname SW1", "banner motd #Welcome to SW1#", "no shutdown", "interface f0/1", "no shutdown");
    expect([s.completed, s.state.hostname, s.state.banner, s.state.interfaces["f0/1"].shutdown]).toEqual([true, "SW1", "Welcome to SW1", false]);
    expect(s.history.find(h => h.input === "no shutdown" && h.status === "wrong-mode")?.feedback).toBe(CLI_FEEDBACK.interfaceFirst);
    const bad = drive(g, "enable", "config t", "hostname SW1", "banner motd Welcome");
    expect([bad.stepIndex, last(bad).status]).toEqual([3, "invalid"]);
    const v = exOf("m05-l01-p02-sim");
    const vs = drive(v, "interface range f0/1-10", "switchport access vlan 10", "exit", "vlan 10", "exit", "interface f0/24", "switchport mode trunk");
    expect([vs.completed, vs.state.interfaces["f0/10"].accessVlan, vs.state.vlans["10"], vs.state.interfaces["f0/24"].switchportMode]).toEqual([true, 10, {}, "trunk"]);
    expect(drive(v, "interface f0/1").stepIndex).toBe(0);   // a single port is not the range the book prints
    const fx = exOf("m05-l02-p01-sim");
    let fs = drive(fx, "vtp mode server", "vtp mode client", "enable secret cisco123", "line vty 0-4");
    expect([fs.stepIndex, last(fs).status]).toEqual([3, "invalid"]);
    fs = submitCommand(fx, fs, "line vty 0 4");
    expect([fs.completed, fs.state.vtp.mode, fs.state.enableSecret, fs.state.mode]).toEqual([true, "client", "cisco123", "line"]);
    expect(fx.steps![3].instruction).toContain("line vty 0-4");
    const sub = exOf("m05-l02-p02-sim");
    expect(sub.device).toBe("router");
    const wrongVlan = drive(sub, "enable", "configure terminal", "interface g0/0.10", "encapsulation dot1Q 20", "ip address 192.168.10.254 255.255.255.0");
    expect([wrongVlan.completed, goalStatus(sub, wrongVlan.state).map(x => x.met)]).toEqual([false, [false, true, true]]);
    expect(submitCommand(sub, wrongVlan, "encapsulation dot1Q 10").completed).toBe(true);
    const ps = exOf("m05-l02-p03-sim");
    const three = drive(ps, "enable", "conf t", "interface f0/1", "switchport mode access", "switchport port-security", "switchport port-security maximum 3", "switchport port-security violation shutdown");
    expect(three.completed).toBe(false);   // the reference page says two devices
    expect(submitCommand(ps, three, "switchport port-security maximum 2").completed).toBe(true);
  });
  it("answer secrecy and inert hostile input hold for every book exercise", () => {
    for (const e of BATCH.flatMap(sims)) {
      const ex = readCliExerciseConfig(e.block.config)!;
      for (const s of ex.steps ?? []) { expect(s.hints![0], s.id).not.toMatch(/^(switchport|line|password|login|enable|service|banner|vtp|interface|encapsulation|ip address|show) /); }
      let sess = createSession(ex);
      const initial = JSON.stringify(sess.state);
      for (const h of ["rm -rf /", "$(id)", "<script>alert(1)</script>", "password cisco123 && reboot", "enable secret"]) sess = submitCommand(ex, sess, h);
      expect([sess.completed, sess.stepIndex, JSON.stringify(sess.state)], e.block.id).toEqual([false, 0, initial]);
      expect(sess.history.every(h => h.status !== "ok"), e.block.id).toBe(true);
    }
  });
});

describe("Batch 9 — pedagogy, provenance, direction", () => {
  it("every page ends with an interactive exercise (practice or practice-table); exactly ONE clarification per page; every practice has 2 hints + «افحص» incorrect feedback + explanation; review heading + r1–r3 on each module's last page (184, 191, 199)", () => {
    for (const p of pages) {
      expect(["practice", "practice-table"], p.id).toContain(p.blocks.at(-1)!.type);
      expect(p.blocks.filter(b => b.type === "callout" && b.kind === "clarification"), p.id).toHaveLength(1);
      for (const b of p.blocks) if (b.type === "practice") {
        const f = b.question.feedback!;
        expect([f.hints?.length, f.incorrectFeedback?.startsWith("افحص"), Boolean(f.explanation), Boolean(f.correctFeedback)], b.id).toEqual([2, true, true, true]);
      }
    }
    for (const [m, last, pdf] of [[m23, M23 + "-l02-p03", 184], [m24, M24 + "-l03-p01", 191], [m05, M05 + "-l03-p02", 199]] as const) {
      const p = pagesOf(m).at(-1)!;
      expect([p.id, p.source.pdfPageStart]).toEqual([last, pdf]);
      const rev = p.blocks.findIndex(b => b.id.endsWith("-review"));
      expect(rev, p.id).toBeGreaterThan(0);
      expect(p.blocks.slice(rev + 1).map(b => b.id.slice(-3)), p.id).toEqual(["-r1", "-r2", "-r3"]);
    }
  });
  it("counts: 5 / 7 / 8 pages, 10 / 11 / 14 practices, 2 / 2 / 1 worksheets, 5 / 7 / 8 clarifications, 3 / 4 / 5 code blocks, 3 / 4 / 5 simulations, book blocks 16 / 19 / 23; worksheet keys are always one of their options", () => {
    const count = (m: ContentModule, f: (b: ContentBlock) => boolean) => pagesOf(m).flatMap(p => p.blocks).filter(f).length;
    expect(BATCH.map(m => pagesOf(m).length)).toEqual([5, 7, 8]);
    // m24-l01-p01-q2 converted from a static fillBlank practice to a dropdown practice-table
    expect(BATCH.map(m => count(m, b => b.type === "practice"))).toEqual([10, 11, 14]);
    expect(BATCH.map(m => count(m, b => b.type === "practice-table"))).toEqual([2, 2, 1]);
    expect(BATCH.map(m => count(m, b => b.type === "callout" && b.kind === "clarification"))).toEqual([5, 7, 8]);
    expect(BATCH.map(m => count(m, b => b.type === "code"))).toEqual([3, 4, 5]);
    expect(BATCH.map(m => count(m, b => b.type === "simulation"))).toEqual([3, 4, 5]);
    expect(BATCH.map(m => count(m, b => b.origin === "book"))).toEqual([16, 23, 23]);   // m24 +4 book pointers (T23–T26) since the Learning-Practice phase
    for (const b of allBlocks) if (b.type === "practice-table") {
      let selects = 0;
      for (const row of b.rows) for (const cell of row) if (typeof cell !== "string") { selects++; expect(sel(cell).options, b.id).toContain(sel(cell).key); expect(new Set(sel(cell).options).size).toBe(sel(cell).options.length); }
      expect(selects, b.id).toBeGreaterThan(0);
    }
  });
  it("provenance: book blocks are text / callout / table / list / code only; practice, worksheets, clarifications, headings and simulations are teacher-enrichment; no raw HTML", () => {
    for (const b of allBlocks) {
      if (b.type === "practice" || b.type === "practice-table" || b.type === "simulation" || b.type === "heading" || (b.type === "callout" && b.kind === "clarification")) expect(b.origin, b.id).toBe("teacher-enrichment");
      if (b.origin === "book") expect(["text", "callout", "table", "list", "code", "library-training"], b.id).toContain(b.type);
    }
    expect(JSON.stringify(BATCH)).not.toMatch(/dangerouslySetInnerHTML|<script|javascript:/i);
  });
  it("technical tokens are LTR code spans; no arrow glyphs; every table / worksheet declares column directions", () => {
    const ltr = new Set<string>();
    const walk = (spans: { text: string; dir?: string }[]) => { for (const s of spans) if (s.dir === "ltr") ltr.add(s.text); };
    for (const b of allBlocks) {
      if (b.type === "text" || b.type === "callout") walk(b.spans);
      if (b.type === "list") for (const i of b.items) walk(i.text);
    }
    for (const tok of ["Port Security", "MAC Address", "PC0", "PC1", "Sticky", "violation shutdown", "Cisco", "Console", "VTY", "Enable", "SSH", "Telnet", "line console 0", "line vty 0 4", "enable secret", "service password-encryption", "Packet Tracer", "show startup-config", "CLI", "config t", "hostname", "banner motd", "vtp mode", "VTP domain", "Router on a Stick", "encapsulation dot1Q", "show vlan brief", "show port-security", "show ip route", "OSPF", "EIGRP", "ACL", "show access-lists"]) expect(ltr, tok).toContain(tok);
    expect(JSON.stringify(BATCH)).not.toMatch(/→|←|➜|⟶|⇒/);
    for (const b of allBlocks) if (b.type === "table" || b.type === "practice-table") expect(b.columnDirs, b.id).toBeDefined();
  });
});

describe("Batch 9 — loaders, navigation, server registry agreement, publication invariants, earlier bodies untouched", () => {
  it("the m23 / m24 / m05 body loaders EXIST and lazily resolve (5 / 7 / 8 pages); m06 still has NO loader", async () => {
    expect([M23, M24, M05].map(id => hasModuleContent("791381", id))).toEqual([true, true, true]);
    const a = await loadModuleContent("791381", M23), b = await loadModuleContent("791381", M24), c = await loadModuleContent("791381", M05);
    expect([a.id, a.order, pagesOf(a).length, b.id, b.order, pagesOf(b).length, c.id, c.order, pagesOf(c).length]).toEqual([M23, 21, 5, M24, 22, 7, M05, 23, 8]);
    expect(hasModuleContent("791381", "791381-m06")).toBe(true);   // completed in place by Batch 10
  });
  it("navigation: m22 → m23 → m24 → m05 → m06; PDF 179 leads to 180; 184 to 185; 191 to 192; the historical PDF 193 page follows the new PDF 192 page; after PDF 199 comes the m06 skeleton (PDF 227)", () => {
    expect(orderedModules(manifest).map(m => m.id).slice(19, 27)).toEqual(["791381-m22", M23, M24, M05, "791381-m25", "791381-m26", "791381-m27", "791381-m06"]);
    expect(nextPage(manifest, "791381-m22-l03-p04")?.id).toBe(M23 + "-l01-p01");
    expect(previousPage(manifest, M23 + "-l01-p01")?.id).toBe("791381-m22-l03-p04");
    expect(nextPage(manifest, M23 + "-l02-p03")?.id).toBe(M24 + "-l01-p01");
    expect(nextPage(manifest, M24 + "-l03-p01")?.id).toBe(M05 + "-l01-p03");
    expect(nextPage(manifest, M05 + "-l01-p03")?.id).toBe(M05 + "-l01-p01");
    expect(nextPage(manifest, M05 + "-l01-p01")?.id).toBe(M05 + "-l01-p02");
    const walk: number[] = []; let cur = nextPage(manifest, "791381-m22-l03-p04");
    while (cur && /m23|m24|m05/.test(cur.id)) { walk.push(cur.source!.pdfPageStart); cur = nextPage(manifest, cur.id); }
    expect(walk).toEqual(Array.from({ length: 20 }, (_, i) => 180 + i));
    expect([cur?.id, cur?.source!.pdfPageStart]).toEqual(["791381-m25-l01-p01", 201]);   // since Batch 10 the review section follows PDF 199 (PDF 200 is a cover)
  });
  it("FRONTEND ↔ SERVER agreement: every module with a body is in the server publication registry with the same title and order (and only those); m23 = 21, m24 = 22, m05 = 23 at the end; the m06 skeleton absent", () => {
    const withBody = manifest.modules.filter(m => hasModuleContent("791381", m.id)).map(m => ({ moduleId: m.id, title: m.title, order: m.order }));
    const s = server().listLearningModules("791381");
    expect(s).toEqual([...withBody].sort((a, b) => a.order - b.order));
    expect(s.slice(20, 23)).toEqual([{ moduleId: M23, title: "Port Security", order: 21 }, { moduleId: M24, title: "حماية أجهزة Cisco", order: 22 }, { moduleId: M05, title: "مرجع أوامر Cisco", order: 23 }]);
    expect(server().findLearningModule("791381", "791381-m06")).not.toBeNull();   // m06 completed in place by Batch 10
  });
  it("PUBLISHABLE but NOT auto-published: the server accepts m23 / m24 / m05 for explicit publication in canonical order; m06 → 400; the registry carries identity + title + order only", () => {
    expect(server().validateLearningModuleIds("791381", [M05, M23, "791381-m22", M24])).toEqual(["791381-m22", M23, M24, M05]);
    expect(server().validateLearningModuleIds("791381", [M05])).toEqual([M05]);
    expect(server().validateLearningModuleIds("791381", ["791381-m06"])).toEqual(["791381-m06"]);   // publishable since Batch 10
    expect(JSON.stringify(server().listLearningModules("791381"))).not.toMatch(/pages|lessons|blocks|pdf|visibleModuleIds|published|simulation|cli-terminal|config/i);
    for (const m of server().listLearningModules("791381")) expect(Object.keys(m).sort()).toEqual(["moduleId", "order", "title"]);
  });
  it("m06 is UNCHANGED (id, title, page id, PDF mapping, no body) apart from its explicit order 24; b5 = [m20, m21, m22, m23, m24, m05]; b4 = [m03, m19, m04]; b6 = [m06]; orders 1..24 contiguous; Batch 6–8 bodies untouched", () => {
    const pagesRef = (id: string) => byId[id].lessons.flatMap(l => l.pages.map(p => [p.id, p.title, p.source!.pdfPageStart, p.source!.printedPage]));
    expect([byId["791381-m06"].title, byId["791381-m06"].order, pagesRef("791381-m06")]).toEqual(["قوائم التحكم ACL", 27, [["791381-m06-l01-p02", "ACL — Access Control List", 223, 223], ["791381-m06-l01-p03", "Standard ACL", 224, 224], ["791381-m06-l01-p04", "Standard ACL — أمثلة", 225, 225], ["791381-m06-l01-p05", "Standard ACL — أمثلة إضافية", 226, 226], ["791381-m06-l01-p01", "Extended ACL", 227, 225], ["791381-m06-l02-p01", "تدريبات", 228, 228], ["791381-m06-l02-p02", "امتحانات نهائية للتدريب", 229, 229]]]);   // completed in place by Batch 10
    expect(Object.keys(byId["791381-m06"]).sort()).toEqual(["id", "lessons", "order", "shortTitle", "title"].filter(k => k in byId["791381-m06"]).sort());
    expect(manifest.batches!.find(b => b.id === "b5")!.moduleIds).toEqual(["791381-m20", "791381-m21", "791381-m22", M23, M24, M05]);
    expect(manifest.batches!.find(b => b.id === "b4")!.moduleIds).toEqual(["791381-m03", "791381-m19", "791381-m04"]);
    expect(manifest.batches!.find(b => b.id === "b6")!.moduleIds).toEqual(["791381-m25", "791381-m26", "791381-m27", "791381-m06"]);   // Batch 10 filled the sixth-batch grouping
    expect(manifest.modules.map(m => m.order)).toEqual(Array.from({ length: 28 }, (_, i) => i + 1));   // 27 since Batch 10, 28 since the final summary (m28)
    expect([m20.order, m21.order, m22.order, pagesOf(m20).length, pagesOf(m21).length, pagesOf(m22).length, sims(m22).length, sims(m20).length + sims(m21).length]).toEqual([18, 19, 20, 7, 3, 11, 3, 1]);   // Reader follow-up added the ipv6-compress practice simulator on m21 PDF 167
    expect(sims(m19).length + sims(m04).length + sims(m03).length).toBe(0);   // no retroactive CLI exercises in Batches 6–7
    expect([m03.order, m19.order, m04.order]).toEqual([15, 16, 17]);
  });
});
