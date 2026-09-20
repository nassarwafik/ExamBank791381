// Batch 10 phase — source-fidelity, mapping, provenance, pedagogy, SOURCE-ORDER and HARD-STOP guards for the book's
// sixth batch: «مراجعة الأوامر» (PDF 200 cover + 201–206, NEW module m25), «الشبكة الواسعة WAN» (PDF 207–209, NEW
// module m26), «بروتوكولات التوجيه» (PDF 210–222, NEW module m27) and «قوائم التحكم ACL» (PDF 223–229, the HISTORICAL
// skeleton m06 COMPLETED IN PLACE; PDF 228 / 229 are the closing QR trainings / exams pages). PDF 230 is the «مرجع
// نهائي · الملخّص الشامل» divider: nothing from PDF 230+ is ever converted here.
// Guards also cover: unique ids, manifest ↔ body ↔ server-registry agreement, the immutable historical m06 page,
// navigation m05 → m25 → m26 → m27 → m06 (the last module), the loaders, publishable-not-auto-published, the
// untouched Batch 6–9 bodies, and the fifteen REAL book CLI exercises driven through the extended simulator
// (router mode, OSPF / EIGRP, numbered ACLs, show ip route) with the book's own lines.
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
import m25 from "./modules/m25";
import m26 from "./modules/m26";
import m27 from "./modules/m27";
import m06 from "./modules/m06";
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

const PREV = [m01, m02, m07, m08, m09, m10, m11, m12, m13, m14, m15, m16, m17, m18, m03, m19, m04, m20, m21, m22, m23, m24, m05];
const BATCH = [m25, m26, m27, m06];
const ALL = [...PREV, ...BATCH];
const course: LearningCourseContent = { schemaVersion: LEARNING_CONTENT_SCHEMA_VERSION, courseId: "791381", title: "شبكات الاتصال", direction: "rtl", modules: ALL };
const pagesOf = (m: ContentModule): ContentPage[] => [...m.lessons].sort((a, b) => a.order - b.order).flatMap(l => [...l.pages].sort((a, b) => a.order - b.order));
const pages = BATCH.flatMap(pagesOf);
const pageBy = (id: string): ContentPage => pages.find(p => p.id === id)!;
const blockBy = (p: ContentPage, id: string): ContentBlock => p.blocks.find(b => b.id === id)!;
const plain = (p: ContentPage): string => JSON.stringify(p.blocks);
const sel = (cell: unknown) => cell as PracticeTableSelectCell;
const allBlocks = pages.flatMap(p => p.blocks);
const M25 = "791381-m25", M26 = "791381-m26", M27 = "791381-m27", M06 = "791381-m06";
const byId = Object.fromEntries(manifest.modules.map(m => [m.id, m]));
const NEXT_PDF = 230;
const server = () => (apiRegistry as unknown as { listLearningModules: (c: string) => { moduleId: string; title: string; order: number }[]; findLearningModule: (c: string, m: string) => unknown; validateLearningModuleIds: (c: string, ids: string[]) => string[] });
const sims = (m: ContentModule) => pagesOf(m).flatMap(p => p.blocks.filter((b): b is SimulationBlock => b.type === "simulation").map(b => ({ page: p, block: b })));
const exOf = (id: string) => { const b = allBlocks.find(x => x.id === id) as SimulationBlock; return readCliExerciseConfig(b.config)!; };
const drive = (ex: ReturnType<typeof exOf>, ...lines: string[]) => lines.reduce((s, l) => submitCommand(ex, s, l), createSession(ex));
const last = (s: CliSession) => s.history[s.history.length - 1];

// PDF → [printed page, title, page id]. The historical m06 page keeps the skeleton's printed number (225); every
// other page follows the page circle = PDF index rule.
const MAP: Record<number, [number, string, string]> = {
  201: [201, "الدخول والإعداد الأساسي", M25 + "-l01-p01"], 202: [202, "VLAN و Trunk", M25 + "-l01-p02"], 203: [203, "VTP وكلمات المرور", M25 + "-l01-p03"],
  204: [204, "Router on a Stick — Dot1Q", M25 + "-l01-p04"], 205: [205, "Port Security — أمان المنفذ", M25 + "-l01-p05"], 206: [206, "أوامر الفحص المهمة", M25 + "-l01-p06"],
  207: [207, "الشبكة الواسعة WAN", M26 + "-l01-p01"], 208: [208, "تقنيات WAN القديمة", M26 + "-l01-p02"], 209: [209, "HDLC و Metro Ethernet", M26 + "-l01-p03"],
  210: [210, "بروتوكولات التوجيه", M27 + "-l01-p01"], 211: [211, "Static Route — التوجيه الثابت", M27 + "-l01-p02"], 212: [212, "Distance Vector / Link-State", M27 + "-l01-p03"], 213: [213, "Administrative Distance و METRIC", M27 + "-l01-p04"],
  214: [214, "OSPF", M27 + "-l02-p01"], 215: [215, "مثال OSPF", M27 + "-l02-p02"], 216: [216, "مثال OSPF — تعريفات R1", M27 + "-l02-p03"], 217: [217, "مثال OSPF — تعريفات R2", M27 + "-l02-p04"],
  218: [218, "EIGRP", M27 + "-l03-p01"], 219: [219, "مثال EIGRP", M27 + "-l03-p02"], 220: [220, "مثال EIGRP — تعريفات R1", M27 + "-l03-p03"], 221: [221, "مثال EIGRP — تعريفات R2", M27 + "-l03-p04"], 222: [222, "show ip route", M27 + "-l03-p05"],
  223: [223, "ACL — Access Control List", M06 + "-l01-p02"], 224: [224, "Standard ACL", M06 + "-l01-p03"], 225: [225, "Standard ACL — أمثلة", M06 + "-l01-p04"], 226: [226, "Standard ACL — أمثلة إضافية", M06 + "-l01-p05"],
  227: [225, "Extended ACL", M06 + "-l01-p01"], 228: [228, "تدريبات", M06 + "-l02-p01"], 229: [229, "امتحانات نهائية للتدريب", M06 + "-l02-p02"],
};

describe("Batch 10 — validation, identities, mapping PDF 200–229, m06 completed IN PLACE, HARD STOP before PDF 230", () => {
  it("the WHOLE real course (every module of the manifest — no skeleton remains) produces ZERO validation issues; every id is unique", () => {
    expect(validateLearningCourseContent(course)).toEqual([]);
    expect(ALL.map(m => m.id).sort()).toEqual(manifest.modules.map(m => m.id).sort());
    const ids = ALL.flatMap(m => [m.id, ...m.lessons.flatMap(l => [l.id, ...l.pages.flatMap(p => [p.id, ...p.blocks.map(b => b.id)])])]);
    expect(new Set(ids).size).toBe(ids.length);
    const refIds = manifest.modules.flatMap(m => [m.id, ...m.lessons.flatMap(l => [l.id, ...l.pages.map(p => p.id)])]);
    expect(new Set(refIds).size).toBe(refIds.length);
  });
  it("m25 / m26 / m27 are NEW stable ids (orders 24 / 25 / 26); m06 keeps the historical skeleton's id, title, shortTitle and lesson l01 id/title and reads at order 27 (the last module); lesson structure pinned", () => {
    expect([m25.id, m25.title, m25.shortTitle, m25.order, m25.partial]).toEqual([M25, "مراجعة الأوامر", "مراجعة الأوامر", 24, undefined]);
    expect([m26.id, m26.title, m26.shortTitle, m26.order, m26.partial]).toEqual([M26, "الشبكة الواسعة WAN", "WAN", 25, undefined]);
    expect([m27.id, m27.title, m27.shortTitle, m27.order, m27.partial]).toEqual([M27, "بروتوكولات التوجيه", "التوجيه", 26, undefined]);
    expect([m06.id, m06.title, m06.shortTitle, m06.order, m06.partial]).toEqual([M06, "قوائم التحكم ACL", "ACL", 27, undefined]);
    expect(m25.lessons.map(l => [l.id, l.title, l.order, l.pages.length])).toEqual([[M25 + "-l01", "مراجعة أوامر Cisco", 1, 6]]);
    expect(m26.lessons.map(l => [l.id, l.title, l.order, l.pages.length])).toEqual([[M26 + "-l01", "WAN وتقنياتها", 1, 3]]);
    expect(m27.lessons.map(l => [l.id, l.title, l.order, l.pages.length])).toEqual([[M27 + "-l01", "أساسيات التوجيه", 1, 4], [M27 + "-l02", "OSPF", 2, 4], [M27 + "-l03", "EIGRP و show ip route", 3, 5]]);
    expect(m06.lessons.map(l => [l.id, l.title, l.order, l.pages.length])).toEqual([[M06 + "-l01", "التحكم بالوصول", 1, 5], [M06 + "-l02", "تدريبات وامتحانات", 2, 2]]);
    for (const [id, title, order] of [[M25, "مراجعة الأوامر", 24], [M26, "الشبكة الواسعة WAN", 25], [M27, "بروتوكولات التوجيه", 26], [M06, "قوائم التحكم ACL", 27]] as const) expect([byId[id].title, byId[id].order], id).toEqual([title, order]);
    expect(manifest.modules.filter(m => /m06|m25|m26|m27/.test(m.id)).map(m => m.id)).toEqual([M25, M26, M27, M06]);   // no duplicate / parallel module for ACL
    expect(manifest.modules.some(m => /m28|m29/.test(m.id))).toBe(false);
    expect(orderedModules(manifest).at(-1)!.id).toBe(M06);
  });
  it("HISTORICAL-ID IMMUTABILITY: 791381-m06-l01-p01 = PDF 227 «Extended ACL» (printed 225), keywords [acl, extended], identical in manifest and body; only its `order` moved (1 → 5); not recreated under a new id", () => {
    const hist = (src: { id: string; title: string; order: number; source?: unknown; keywords?: string[] }[]) => src.filter(p => p.id === M06 + "-l01-p01").map(p => [p.id, p.title, p.order, p.source, p.keywords]);
    const expected = [[M06 + "-l01-p01", "Extended ACL", 5, { kind: "book", sourceId: "791381", pdfPageStart: 227, printedPage: 225 }, ["acl", "extended"]]];
    expect(hist(byId[M06].lessons[0].pages)).toEqual(expected);
    expect(hist(m06.lessons[0].pages)).toEqual(expected);
    expect([pageBy(M06 + "-l01-p01").source.pdfPageEnd, pageBy(M06 + "-l01-p01").source.sourceNote, pageBy(M06 + "-l01-p01").conversionNote]).toEqual([undefined, undefined, undefined]);
    expect(pages.filter(p => p.source.pdfPageStart === 227).map(p => p.id)).toEqual([M06 + "-l01-p01"]);
    expect(m06.lessons[0].pages.map(p => [p.id, p.order])).toEqual([[M06 + "-l01-p02", 1], [M06 + "-l01-p03", 2], [M06 + "-l01-p04", 3], [M06 + "-l01-p05", 4], [M06 + "-l01-p01", 5]]);
  });
  it("maps the twenty-nine learner pages 1:1 to PDF 201..229 in SOURCE ORDER (explicit `order`), with the pinned titles, ids and printed pages; manifest TOC = body; PDF 200 (cover) is never a page", () => {
    expect(pagesOf(m25).map(p => p.source.pdfPageStart)).toEqual([201, 202, 203, 204, 205, 206]);
    expect(pagesOf(m26).map(p => p.source.pdfPageStart)).toEqual([207, 208, 209]);
    expect(pagesOf(m27).map(p => p.source.pdfPageStart)).toEqual([210, 211, 212, 213, 214, 215, 216, 217, 218, 219, 220, 221, 222]);
    expect(pagesOf(m06).map(p => p.source.pdfPageStart)).toEqual([223, 224, 225, 226, 227, 228, 229]);
    expect(pages).toHaveLength(29);
    for (const p of pages) {
      const [printed, title, id] = MAP[p.source.pdfPageStart];
      expect([p.id, p.title, p.source.kind, p.source.sourceId, p.source.pdfPageEnd, p.source.printedPage], String(p.source.pdfPageStart)).toEqual([id, title, "book", "791381", undefined, printed]);
    }
    for (const m of BATCH) for (const l of m.lessons) {
      const ref = byId[m.id].lessons.find(x => x.id === l.id)!;
      expect([ref.title, ref.order, ref.pages.map(p => [p.id, p.title, p.order, p.source, p.keywords])], l.id).toEqual([l.title, l.order, l.pages.map(p => [p.id, p.title, p.order, p.source, p.keywords])]);
      expect(new Set(l.pages.map(p => p.order)).size, l.id).toBe(l.pages.length);
    }
    expect(pages.filter(p => p.conversionNote).map(p => p.id)).toEqual([M06 + "-l02-p01", M06 + "-l02-p02"]);   // only the QR trainings / exams pages carry a note
    expect(flattenPageRefs(manifest).some(p => p.page.source?.pdfPageStart === 200 || p.page.source?.pdfPageStart === 230)).toBe(false);
  });
  it("the sixth-batch cover (PDF 200) lives only in m25's coarse source range + sourceNote; module ranges 200–206 / 207–209 / 210–222 / 223–229 name their neighbours; PDF 230 named only as the stop", () => {
    expect([m25.source!.pdfPageStart, m25.source!.pdfPageEnd, m26.source!.pdfPageStart, m26.source!.pdfPageEnd, m27.source!.pdfPageStart, m27.source!.pdfPageEnd, m06.source!.pdfPageStart, m06.source!.pdfPageEnd]).toEqual([200, 206, 207, 209, 210, 222, 223, 229]);
    for (const [m, tokens] of [[m25, ["PDF 200", "الدفعة السادسة", "PDF 201–206", "PDF 199", "m05", "PDF 207", "m26"]], [m26, ["PDF 207–209", "PDF 206", "m25", "PDF 210", "m27"]], [m27, ["PDF 210–222", "PDF 209", "m26", "PDF 223", "m06"]], [m06, ["PDF 223–229", "PDF 222", "m27", "PDF 230"]]] as const) for (const t of tokens) expect(m.source!.sourceNote, m.id).toContain(t);
    expect(allBlocks.some(b => b.type === "unit-opener")).toBe(false);
    expect(BATCH.some(m => m.lessons.some(l => l.id.endsWith("-l00")))).toBe(false);
    for (const m of BATCH) for (const p of pagesOf(m)) for (const b of p.blocks) if (b.source) expect([b.source.pdfPageStart >= m.source!.pdfPageStart, (b.source.pdfPageEnd ?? b.source.pdfPageStart) <= m.source!.pdfPageEnd!], b.id).toEqual([true, true]);
  });
  it("HARD STOP: every Batch-10 page < 230; the maximum pdfPageStart among ALL converted bodies is 229; the earlier bodies still stop at 199; no page has a gap or a duplicate PDF index", () => {
    for (const p of pages) expect(p.source.pdfPageStart, p.id).toBeLessThan(NEXT_PDF);
    expect(Math.max(...ALL.flatMap(m => m.lessons.flatMap(l => l.pages.map(p => p.source.pdfPageStart))))).toBe(229);
    expect(Math.max(...PREV.flatMap(m => m.lessons.flatMap(l => l.pages.map(p => p.source.pdfPageStart))))).toBe(199);
    for (const [id, lo, hi] of [[M25, 201, 206], [M26, 207, 209], [M27, 210, 222], [M06, 223, 229]] as const) {
      const starts = byId[id].lessons.flatMap(l => l.pages.map(p => p.source!.pdfPageStart));
      expect([Math.min(...starts), Math.max(...starts)], id).toEqual([lo, hi]);
    }
    const all = flattenPageRefs(manifest).map(p => p.page.source!.pdfPageStart).filter(n => n >= 201);
    expect([...all].sort((a, b) => a - b)).toEqual(Array.from({ length: 29 }, (_, i) => 201 + i));
  });
  it("NO LEAKAGE from PDF 230+ (the final reference: glossary, closing word, visual summary, worked examples) nor from commands the book never prints (NAT, static routes, named ACLs, RIP configuration) in any Batch-10 lesson", () => {
    const ban = /قاموس|كلمة الختام|ملخّص بصري|الملخّص الشامل|مرجع نهائي|أمثلة عملية|ip access-list|\bNAT\b|ip nat|ip route \d|router rip|access-class|show access-lists|router-id|passive-interface/i;
    for (const m of BATCH) expect(JSON.stringify(m.lessons), m.id).not.toMatch(ban);
    for (const id of [M25, M26, M27, M06]) expect(JSON.stringify(byId[id]), id).not.toMatch(ban);
    expect(m06.source!.sourceNote).toMatch(/PDF 230 صفحة فاصلة «مرجع نهائي · الملخّص الشامل»/);   // the divider is named only as the boundary
  });
  it("SOURCE ORDER inside the batch: m25 never names OSPF / EIGRP / ACL configuration; m26 has no commands at all; in m27 router ospf first on 216, area on 215, router eigrp on 220, show ip route on 206 (review) then 222; in m06 access-list first on 224, host on 226, tcp on 227, T27 on 228, F01 on 229", () => {
    expect(JSON.stringify(m25.lessons)).not.toMatch(/router ospf|router eigrp|access-list|access-group|area 0|Frame Relay|Metro Ethernet/);
    expect(JSON.stringify(m26.lessons)).not.toMatch(/\(config|show |router |access-list|OSPF|EIGRP/);
    expect(JSON.stringify(m27.lessons)).not.toMatch(/access-list|access-group|permit|deny/);
    const first = (m: ContentModule, re: RegExp) => pagesOf(m).find(p => re.test(plain(p)))?.source.pdfPageStart;
    expect(first(m25, /interface range f0\/1-10/)).toBe(202);
    expect(first(m25, /vtp mode/)).toBe(203);
    expect(first(m25, /dot1Q/)).toBe(204);
    expect(first(m25, /maximum 2/)).toBe(205);
    expect(first(m25, /show ip route/)).toBe(206);
    expect(first(m26, /Frame Relay/)).toBe(208);
    expect(first(m26, /Metro Ethernet/)).toBe(209);
    expect(first(m27, /RIP = 120/)).toBe(213);
    expect(first(m27, /Open Shortest Path First/)).toBe(214);
    expect(first(m27, /area/)).toBe(215);
    expect(first(m27, /router ospf 1/)).toBe(216);
    expect(first(m27, /192\.168\.2\.0 0\.0\.0\.255 area 0/)).toBe(217);
    expect(first(m27, /Enhanced Interior Gateway/)).toBe(218);
    expect(first(m27, /router eigrp 100/)).toBe(220);
    expect(first(m27, /directly connected/)).toBe(222);
    expect(first(m06, /access-list 10 permit/)).toBe(224);
    expect(first(m06, /access-list 20 deny/)).toBe(225);
    expect(first(m06, /permit host/)).toBe(226);
    expect(first(m06, /permit tcp any any eq 80/)).toBe(227);
    expect(first(m06, /T27/)).toBe(228);
    expect(first(m06, /F01/)).toBe(229);
  });
});

describe("Batch 10 — source fidelity (the twelve CLI boxes, the show output, the Extended-ACL example, cards and facts)", () => {
  const CODE: Record<string, string> = {
    [M25 + "-l01-p01"]: "Device(config)# enable\nDevice(config)# configure terminal\nDevice(config)# hostname R1\nDevice(config)# interface g0/0",
    [M25 + "-l01-p02"]: "Device(config)# interface range f0/1-10\nDevice(config)# vlan 10\nDevice(config)# switchport access vlan 10\nDevice(config)# switchport mode trunk",
    [M25 + "-l01-p03"]: "Device(config)# vtp mode server / client\nDevice(config)# enable secret cisco\nDevice(config)# line vty 0 4 / line console 0",
    [M25 + "-l01-p04"]: "Device(config)# interface g0/0.10\nDevice(config)# encapsulation dot1Q 10\nDevice(config)# ip address 192.168.10.254 255.255.255.0",
    [M25 + "-l01-p05"]: "Device(config)# switchport mode access\nDevice(config)# switchport port-security maximum 2\nDevice(config)# switchport port-security violation shutdown",
    [M27 + "-l02-p03"]: "Device(config)# router ospf 1\nDevice(config)# network 192.168.1.0 0.0.0.255 area 0\nDevice(config)# network 10.0.0.0 0.0.0.3 area 0",
    [M27 + "-l02-p04"]: "Device(config)# router ospf 1\nDevice(config)# network 192.168.2.0 0.0.0.255 area 0\nDevice(config)# network 10.0.0.0 0.0.0.3 area 0",
    [M27 + "-l03-p03"]: "Device(config)# router eigrp 100\nDevice(config)# network 192.168.1.0\nDevice(config)# network 10.0.0.0",
    [M27 + "-l03-p04"]: "Device(config)# router eigrp 100\nDevice(config)# network 192.168.2.0\nDevice(config)# network 10.0.0.0",
    [M06 + "-l01-p03"]: "Router(config)# access-list 10 permit 192.168.1.0 0.0.0.255\nRouter(config)# interface g0/0\nRouter(config-if)# ip access-group 10 out",
    [M06 + "-l01-p04"]: "Device(config)# access-list 10 permit 192.168.1.0 0.0.0.255\nDevice(config)# access-list 20 deny 192.168.2.0 0.0.0.255\nDevice(config)# access-list 20 permit any",
    [M06 + "-l01-p05"]: "Device(config)# access-list 30 permit host 192.168.1.10\nDevice(config)# access-list 40 permit 192.168.1.0 0.0.0.255\nDevice(config-if)# ip access-group 40 in",
  };
  it("every «Cisco CLI» box is a `code` block that OPENS its page with the book's exact lines and prompts, followed by the annotation table whose first column repeats those lines; the only other code blocks are the PDF 222 show output and the PDF 227 two-line example", () => {
    for (const [id, code] of Object.entries(CODE)) {
      const p = pageBy(id);
      const c = p.blocks[0];
      expect([c.type, c.origin, c.type === "code" && c.language, c.type === "code" && c.code], id).toEqual(["code", "book", "cli", code]);
      const t = p.blocks[1];
      expect(t.type === "table" && [t.origin, t.columnDirs, t.rows.map(r => r[0])], id).toEqual(["book", ["ltr", "rtl"], code.split("\n")]);
      for (const line of code.split("\n")) expect(line).toMatch(/^(Device|Router)\(config(-if)?\)# \S/);
    }
    const out = blockBy(pageBy(M27 + "-l03-p05"), "m27-l03-p05-out");
    expect(out.type === "code" && [out.origin, out.language, out.code]).toEqual(["book", "cli", "C    192.168.1.0/24 is directly connected, G0/0\nR    192.168.2.0/24 [120/1] via 192.168.1.1\nO    10.0.0.0/24 [110/2] via 192.168.1.1"]);
    expect(pageBy(M27 + "-l03-p05").blocks[0].id).toBe("m27-l03-p05-out");
    const ext = blockBy(pageBy(M06 + "-l01-p01"), "m06-l01-p01-cli");
    expect(ext.type === "code" && [ext.origin, ext.language, ext.code]).toEqual(["book", "cli", "access-list 100\n  permit tcp any any eq 80"]);
    expect(pages.filter(p => p.blocks.some(b => b.type === "code")).map(p => p.id).sort()).toEqual([...Object.keys(CODE), M27 + "-l03-p05", M06 + "-l01-p01"].sort());
  });
  it("PDF 201–206: the five boxes' annotations, «الفكرة» / «ملاحظة» / «تذكّر», and the two show cards exactly as printed", () => {
    const ann = (id: string, block: string) => { const t = blockBy(pageBy(id), block); return t.type === "table" ? t.rows.map(r => r[1]) : null; };
    expect(ann(M25 + "-l01-p01", "m25-l01-p01-cmds")).toEqual(["الدخول إلى وضع الأوامر", "وضع الإعداد", "تغيير اسم الجهاز", "ثم ip address لضبط منفذ"]);
    expect(ann(M25 + "-l01-p02", "m25-l01-p02-cmds")).toEqual(["تفعيل عدة منافذ", "تعريف VLAN", "ربط المنافذ مع VLAN", "تعريف Trunk"]);
    expect(ann(M25 + "-l01-p03", "m25-l01-p03-cmds")).toEqual(["إعداد VTP", "كلمة مرور مشفّرة", "حماية طرق الدخول"]);
    expect(ann(M25 + "-l01-p04", "m25-l01-p04-cmds")).toEqual(["ننشئ Sub-Interface لكل VLAN", "يحدّد رقم VLAN", "Gateway لأجهزة VLAN"]);
    expect(ann(M25 + "-l01-p05", "m25-l01-p05-cmds")).toEqual(["نجعله Access", "عدد الأجهزة المسموح", "العقوبة عند المخالفة"]);
    expect(plain(pageBy(M25 + "-l01-p01"))).toContain("نبدأ بالدخول إلى وضع الإعداد، ثم نغيّر اسم الجهاز أو نضبط منفذًا معيّنًا");
    expect(plain(pageBy(M25 + "-l01-p03"))).toContain("لأنه يحفظ كلمة السر بشكل مشفّر");
    expect(plain(pageBy(M25 + "-l01-p05"))).toContain("نحدّد عدد الأجهزة المسموح لها بالاتصال بالمنفذ، ونحدّد العقوبة عند المخالفة");
    const cards = blockBy(pageBy(M25 + "-l01-p06"), "m25-l01-p06-cards");
    expect(cards.type === "list" && cards.items.map(i => [i.term, i.text.filter(s => s.dir === "ltr").map(s => s.text)])).toEqual([["VLAN / Interfaces / Config", ["show vlan brief", "show ip interface brief", "show running-config"]], ["Security / Routing / DHCP", ["show port-security", "show ip route", "show ip dhcp pool"]]]);
    expect(plain(pageBy(M25 + "-l01-p06"))).toContain("هذه الأوامر لا تغيّر الإعدادات، بل تساعدنا على الفحص والتأكد من صحة البرمجة");
  });
  it("PDF 207–209: the WAN definition, facts and «الخلاصة»; Frame Relay / ATM cards + goal + «تذكّر»; HDLC / Metro Ethernet cards + «شائع»", () => {
    expect(plain(pageBy(M26 + "-l01-p01"))).toContain("شبكة تمتد عبر مسافات كبيرة: مدن، دول، أو قارات");
    expect(plain(pageBy(M26 + "-l01-p01"))).toContain("تربط شبكات بعيدة مع بعضها عبر مسافات شاسعة");
    const old = blockBy(pageBy(M26 + "-l01-p02"), "m26-l01-p02-cards");
    expect(old.type === "list" && old.items.map(i => i.term)).toEqual(["Frame Relay", "ATM"]);
    expect(plain(pageBy(M26 + "-l01-p02"))).toContain("نقل البيانات بين مواقع بعيدة بكفاءة");
    const modern = blockBy(pageBy(M26 + "-l01-p03"), "m26-l01-p03-cards");
    expect(modern.type === "list" && modern.items.map(i => i.term)).toEqual(["HDLC", "Metro Ethernet"]);
    expect(plain(pageBy(M26 + "-l01-p03"))).toContain("شائع لربط فروع داخل منطقة حضرية واحدة");
  });
  it("PDF 210–222: the three protocol cards with their badges, Static Route pros / cons, DV / LS cards, METRIC cards + the AD values (RIP 120 · OSPF 110 · EIGRP 90 · Static 1 · Connected 0), OSPF / EIGRP facts, the two example set-ups, the four boxes' annotations and the show ip route explanations", () => {
    const c210 = blockBy(pageBy(M27 + "-l01-p01"), "m27-l01-p01-cards");
    expect(c210.type === "list" && c210.items.map(i => [i.term, i.note])).toEqual([["Static Route", "يدوي · بسيط"], ["OSPF", "Link-State"], ["EIGRP", "Cisco · متطور"]]);
    expect(plain(pageBy(M27 + "-l01-p01"))).toContain("اختيار الطريق الذي تسلكه البيانات للوصول إلى الشبكة المطلوبة");
    const pros = blockBy(pageBy(M27 + "-l01-p02"), "m27-l01-p02-pros"), cons = blockBy(pageBy(M27 + "-l01-p02"), "m27-l01-p02-cons");
    expect([pros.type === "list" && pros.items.length, cons.type === "list" && cons.items.length]).toEqual([3, 3]);
    expect(plain(pageBy(M27 + "-l01-p02"))).toContain("في الشبكات الصغيرة الثابتة التي لا تتغيّر كثيرًا");
    expect(plain(pageBy(M27 + "-l01-p03"))).toContain("ويسمّى أحيانًا هجينًا لأنه يجمع صفات من النوعين");
    const ad = blockBy(pageBy(M27 + "-l01-p04"), "m27-l01-p04-table");
    expect(ad.type === "table" && ad.rows).toEqual([["Connected", "0"], ["Static", "1"], ["EIGRP", "90"], ["OSPF", "110"], ["RIP", "120"]]);
    expect(plain(pageBy(M27 + "-l02-p01"))).toContain("Open Shortest Path First");
    expect(plain(pageBy(M27 + "-l02-p01"))).toContain("غير مملوك لشركة واحدة، لذلك يعمل مع أجهزة من شركات مختلفة");
    const topo = blockBy(pageBy(M27 + "-l02-p02"), "m27-l02-p02-topology");
    expect(topo.type === "table" && topo.rows.map(r => r[1])).toEqual(["10.0.0.0/30", "192.168.1.0/24", "192.168.2.0/24"]);
    const ann = (id: string, block: string) => { const t = blockBy(pageBy(id), block); return t.type === "table" ? t.rows.map(r => r[1]) : null; };
    expect(ann(M27 + "-l02-p03", "m27-l02-p03-cmds")).toEqual(["تفعيل OSPF برقم العملية 1", "إعلان الشبكة الأولى", "إعلان الشبكة الثانية"]);
    expect(ann(M27 + "-l02-p04", "m27-l02-p04-cmds")).toEqual(["نفس رقم العملية", "شبكة R2 الأولى", "الشبكة المشتركة"]);
    expect(plain(pageBy(M27 + "-l02-p04"))).toContain("نستعمل نفس رقم العملية ونفس");
    expect(plain(pageBy(M27 + "-l03-p01"))).toContain("Enhanced Interior Gateway Routing Protocol");
    expect(plain(pageBy(M27 + "-l03-p01"))).toContain("وأسرع في التقارب من البروتوكولات القديمة");
    expect(plain(pageBy(M27 + "-l03-p02"))).toContain("يجمع الراوترات التي تتبادل معلومات التوجيه معًا");
    expect(ann(M27 + "-l03-p03", "m27-l03-p03-cmds")).toEqual(["تفعيل EIGRP برقم AS 100", "إعلان الشبكة الأولى", "إعلان الشبكة المشتركة"]);
    expect(ann(M27 + "-l03-p04", "m27-l03-p04-cmds")).toEqual(["نفس رقم AS", "شبكة R2", "الشبكة المشتركة"]);
    expect(plain(pageBy(M27 + "-l03-p03"))).toContain("لا نكتب");
    const facts = blockBy(pageBy(M27 + "-l03-p05"), "m27-l03-p05-facts");
    expect(facts.type === "list" && facts.items.map(i => i.text.map(s => s.text).join(""))).toEqual([
      "C تعني أن الشبكة متصلة مباشرة بالراوتر.",
      "R تعني أنها وصلت عبر بروتوكول RIP، و O عبر OSPF، و D عبر EIGRP.",
      "[120/1]: الرقم 120 هو المسافة الإدارية AD، والرقم 1 هو المقياس Metric.",
      "via 192.168.1.1 يعني أن الطريق يمر عبر هذا العنوان.",
    ]);
  });
  it("PDF 223–229: the ACL definition, permit / deny roles, facts, Standard / Extended cards, «تذكّر» placement rule, the three boxes' annotations, «قاعدة», the implicit deny and the common mistake, the Extended facts + «شرح المثال», and the T27–T30 / F01–F06 QR cards (no library-training)", () => {
    expect(plain(pageBy(M06 + "-l01-p02"))).toContain("مجموعة قواعد تسمح أو تمنع مرور البيانات في الشبكة");
    const roles = blockBy(pageBy(M06 + "-l01-p02"), "m06-l01-p02-rule"), types = blockBy(pageBy(M06 + "-l01-p02"), "m06-l01-p02-types");
    expect([roles.type === "list" && roles.items.map(i => i.term), types.type === "list" && types.items.map(i => i.term)]).toEqual([["permit", "deny"], ["Standard", "Extended"]]);
    expect(plain(pageBy(M06 + "-l01-p02"))).toContain("نضع القائمة قريبًا من الوجهة في");
    const ann = (id: string, block: string) => { const t = blockBy(pageBy(id), block); return t.type === "table" ? t.rows.map(r => r[1]) : null; };
    expect(ann(M06 + "-l01-p03", "m06-l01-p03-cmds")).toEqual(["السماح لشبكة معيّنة", "نحدّد الواجهة", "نربط القائمة بالواجهة"]);
    expect(plain(pageBy(M06 + "-l01-p03"))).toContain("وأرقامها من");
    expect(ann(M06 + "-l01-p04", "m06-l01-p04-cmds")).toEqual(["مثال 1: السماح لشبكة", "مثال 2: منع شبكة", "السماح للباقي"]);
    expect(plain(pageBy(M06 + "-l01-p04"))).toContain("نضع القاعدة الأقرب للهدف، لأنها تتحكّم بالمصدر فقط");
    expect(ann(M06 + "-l01-p05", "m06-l01-p05-cmds")).toEqual(["السماح لجهاز واحد", "السماح لشبكة كاملة", "تطبيق القائمة على الواجهة"]);
    expect(plain(pageBy(M06 + "-l01-p05"))).toContain("غير مكتوب. أي عنوان لا تسمح له صراحةً يُمنع تلقائيًا");
    expect(plain(pageBy(M06 + "-l01-p05"))).toContain("القائمة لا تعمل إطلاقًا");
    const facts = blockBy(pageBy(M06 + "-l01-p01"), "m06-l01-p01-facts");
    expect(facts.type === "list" && facts.items.length).toBe(4);
    expect(plain(pageBy(M06 + "-l01-p01"))).toContain("أكثر تفصيلًا من");
    const t = blockBy(pageBy(M06 + "-l02-p01"), "m06-l02-p01-cards"), f = blockBy(pageBy(M06 + "-l02-p02"), "m06-l02-p02-cards");
    expect([t.type === "list" && t.items.map(i => i.term), f.type === "list" && f.items.map(i => i.term)]).toEqual([["T27", "T28", "T29", "T30"], ["F01", "F02", "F03", "F04", "F05", "F06"]]);
    expect(plain(pageBy(M06 + "-l02-p02"))).toContain("امتحانات نهائية للتدريب والمراجعة الشاملة قبل الاختبار الرسمي");
    expect(allBlocks.some(b => b.type === "library-training")).toBe(false);
  });
});

describe("Batch 10 — the fifteen REAL book CLI exercises (simulation / cli-terminal / v1)", () => {
  const expected: [number, string, string][] = [
    [201, "m25-l01-p01-sim", "task"], [202, "m25-l01-p02-sim", "task"], [203, "m25-l01-p03-sim", "challenge"], [204, "m25-l01-p04-sim", "challenge"], [205, "m25-l01-p05-sim", "guided"], [206, "m25-l01-p06-sim", "challenge"],
    [216, "m27-l02-p03-sim", "guided"], [217, "m27-l02-p04-sim", "challenge"], [220, "m27-l03-p03-sim", "guided"], [221, "m27-l03-p04-sim", "task"], [222, "m27-l03-p05-sim", "challenge"],
    [224, "m06-l01-p03-sim", "guided"], [225, "m06-l01-p04-sim", "challenge"], [226, "m06-l01-p05-sim", "task"], [227, "m06-l01-p01-sim", "challenge"],
  ];
  it("exactly fifteen exercises on the CLI pages (none on 207–215, 218, 219, 223, 228, 229), one per page, all teacher-enrichment, resolvable, with fallback text and two-step hints; the activity registry is unchanged", () => {
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
    expect(sims(m26)).toHaveLength(0);
    expect(allBlocks.filter(b => b.type === "animation" || b.type === "guided" || b.type === "interactive-diagram")).toHaveLength(0);
    expect(productionActivityRegistry.list().length).toBe(14);
  });
  it("PDF 202 VLAN task (regression): the book's range completes it; VLAN 10 on ONLY f0/1 + f0/10 (+ trunk) stays incomplete; a missing middle port (f0/5) is reported unmet; goals cover every port f0/1 … f0/10", () => {
    const vlan = exOf("m25-l01-p02-sim");
    expect(vlan.goals!.map(g => g.id)).toEqual(["g-vlan", "g-f1", "g-f2", "g-f3", "g-f4", "g-f5", "g-f6", "g-f7", "g-f8", "g-f9", "g-f10", "g-trunk"]);
    expect(vlan.goals!.filter(g => g.condition.kind === "interface" && g.condition.prop === "accessVlan").map(g => (g.condition as { name: string }).name)).toEqual(Array.from({ length: 10 }, (_, i) => "f0/" + (i + 1)));
    // A. the book's lines (range) + the VLAN definition + the trunk → complete
    const ok = drive(vlan, "vlan 10", "exit", "interface range f0/1-10", "switchport access vlan 10", "exit", "interface f0/24", "switchport mode trunk");
    expect([ok.completed, last(ok).feedback]).toEqual([true, "✓ أحسنت، VLAN 10 على المنافذ العشرة و Trunk على f0/24."]);
    // B. false-positive reproduction: only the first and the last port → MUST stay incomplete
    const edges = drive(vlan, "vlan 10", "exit", "interface f0/1", "switchport access vlan 10", "exit", "interface f0/10", "switchport access vlan 10", "exit", "interface f0/24", "switchport mode trunk");
    expect(edges.completed).toBe(false);
    const edgeStatus = Object.fromEntries(goalStatus(vlan, edges.state).map(g => [g.id, g.met]));
    expect([edgeStatus["g-vlan"], edgeStatus["g-f1"], edgeStatus["g-f10"], edgeStatus["g-trunk"]]).toEqual([true, true, true, true]);
    for (const n of [2, 3, 4, 5, 6, 7, 8, 9]) expect(edgeStatus["g-f" + n], "f0/" + n).toBe(false);
    // C. every port except the middle one f0/5 → incomplete, and exactly that goal is unmet
    const noFive = drive(vlan, "vlan 10", "exit", "interface range f0/1-4", "switchport access vlan 10", "exit", "interface range f0/6-10", "switchport access vlan 10", "exit", "interface f0/24", "switchport mode trunk");
    expect(noFive.completed).toBe(false);
    expect(goalStatus(vlan, noFive.state).filter(g => !g.met).map(g => g.id)).toEqual(["g-f5"]);
    expect(submitCommand(vlan, submitCommand(vlan, submitCommand(vlan, noFive, "exit"), "interface f0/5"), "switchport access vlan 10").completed).toBe(true);
    // a port in the wrong VLAN keeps it open too
    const wrongVlan = drive(vlan, "vlan 10", "exit", "interface range f0/1-10", "switchport access vlan 10", "exit", "interface f0/7", "switchport access vlan 20", "exit", "interface f0/24", "switchport mode trunk");
    expect([wrongVlan.completed, goalStatus(vlan, wrongVlan.state).filter(g => !g.met).map(g => g.id)]).toEqual([false, ["g-f7"]]);
  });
  it("Review (201–206): the basics task needs hostname R1 + an addressed, up g0/0; the VLAN task needs the trunk on f0/24 beside the ten ports (checked above); the VTP challenge ends with the fix-the-command; the dot1Q challenge follows the box; the Port Security guided box starts inside f0/1; the show challenge accepts only show", () => {
    const basics = exOf("m25-l01-p01-sim");
    const partial = drive(basics, "enable", "configure terminal", "hostname R1", "interface g0/0", "ip address 192.168.1.1 255.255.255.0");
    expect([partial.completed, goalStatus(basics, partial.state).map(g => g.met)]).toEqual([false, [true, true, true, false]]);
    expect(submitCommand(basics, partial, "no shutdown").completed).toBe(true);
    expect(drive(basics, "enable", "configure terminal", "hostname R2", "interface g0/0", "ip address 192.168.1.1 255.255.255.0", "no shutdown").completed).toBe(false);
    const vlan = exOf("m25-l01-p02-sim");
    const v = drive(vlan, "vlan 10", "exit", "interface range f0/1-10", "switchport access vlan 10", "exit", "interface f0/24", "switchport mode trunk");
    expect([v.completed, v.state.interfaces["f0/10"].accessVlan, v.state.interfaces["f0/24"].switchportMode]).toEqual([true, 10, "trunk"]);
    expect(drive(vlan, "vlan 10", "exit", "interface range f0/1-9", "switchport access vlan 10", "exit", "interface f0/24", "switchport mode trunk").completed).toBe(false);   // f0/10 missing
    expect(drive(vlan, "vlan 10", "exit", "interface range f0/1-10", "switchport access vlan 10").completed).toBe(false);   // trunk missing
    const vtp = exOf("m25-l01-p03-sim");
    let s = drive(vtp, "vtp mode server", "vtp mode client", "enable secret cisco", "line vty 0 4", "line console 0");
    expect([s.stepIndex, last(s).status]).toEqual([4, "wrong-mode"]);   // still inside line vty: the step asks for exit first
    s = submitCommand(vtp, s, "exit");
    s = submitCommand(vtp, s, "line console 1");
    expect([s.stepIndex, last(s).status]).toEqual([4, "invalid"]);
    s = submitCommand(vtp, s, "line console 0");
    expect([s.completed, s.state.vtp.mode, s.state.enableSecret, s.state.selectedLine]).toEqual([true, "client", "cisco", "console"]);
    expect(vtp.steps![4].instruction).toContain("line console 1");
    expect(last(submitCommand(vtp, createSession(vtp), "hostname SW1")).status).toBe("not-required");
    const dot = exOf("m25-l01-p04-sim");
    const d = drive(dot, "interface g0/0.10", "encapsulation dot1Q 10", "ip address 192.168.10.254 255.255.255.0");
    expect([d.completed, d.state.interfaces["g0/0.10"]]).toEqual([true, { shutdown: true, encapsulationVlan: 10, ipAddress: "192.168.10.254", subnetMask: "255.255.255.0" }]);
    expect(drive(dot, "interface g0/0.20").stepIndex).toBe(0);
    const ps = exOf("m25-l01-p05-sim");
    expect([createSession(ps).state.mode, createSession(ps).state.selectedInterfaces]).toEqual(["interface", ["f0/1"]]);
    const p = drive(ps, "switchport mode access", "switchport port-security maximum 2", "switchport port-security violation shutdown");
    expect([p.completed, p.state.interfaces["f0/1"].portSecurity]).toEqual([true, { enabled: false, maximum: 2, violation: "shutdown" }]);
    const show = exOf("m25-l01-p06-sim");
    let sh = createSession(show);
    const before = JSON.stringify(sh.state);
    sh = submitCommand(show, sh, "configure terminal");   // navigation is free, but the challenge only advances on show commands
    expect([sh.stepIndex, sh.state.mode]).toEqual([0, "global"]);
    sh = submitCommand(show, sh, "hostname X");
    expect(last(sh).status).toBe("not-required");
    sh = ["end", "show vlan brief", "show ip interface brief", "show running-config", "show port-security", "show ip route", "show ip dhcp pool"].reduce((acc, l) => submitCommand(show, acc, l), sh);
    expect([sh.completed, sh.stepIndex, JSON.stringify({ ...sh.state, mode: "privileged" })]).toEqual([true, 6, before]);
    expect(sh.history.find(h => h.input === "show vlan brief")!.output!.some(l => /Students/.test(l))).toBe(true);
  });
  it("Routing (216–222): the OSPF guided box rejects the mask form and the EIGRP form; the R2 challenge accepts only network after router ospf; the EIGRP guided box refuses area; the R2 task completes only with AS 100 and both networks; the show challenge prints the two connected routes and never changes state", () => {
    const g = exOf("m27-l02-p03-sim");
    let s = submitCommand(g, createSession(g), "network 192.168.1.0 0.0.0.255 area 0");
    expect(last(s).feedback).toBe(CLI_FEEDBACK.wrongMode(CLI_MODE_LABEL.router));
    s = submitCommand(g, s, "router ospf 1");
    expect([s.stepIndex, s.state.mode, last(s).feedback]).toEqual([1, "router", "✓ أحسنت، أنت الآن في وضع إعداد التوجيه (config-router)#"]);
    s = submitCommand(g, s, "network 192.168.1.0 255.255.255.0");
    expect([s.stepIndex, last(s).status]).toEqual([1, "wrong-mode"]);   // the DHCP form is not accepted inside OSPF
    s = submitCommand(g, s, "network 192.168.1.0");
    expect([s.stepIndex, last(s).status]).toEqual([1, "incomplete"]);
    s = ["network 192.168.1.0 0.0.0.255 area 0", "network 10.0.0.0 0.0.0.3 area 0"].reduce((acc, l) => submitCommand(g, acc, l), s);
    expect([s.completed, s.state.routing.ospf]).toEqual([true, { id: 1, networks: [{ address: "192.168.1.0", wildcard: "0.0.0.255", area: 0 }, { address: "10.0.0.0", wildcard: "0.0.0.3", area: 0 }] }]);
    const c = exOf("m27-l02-p04-sim");
    let cs = submitCommand(c, createSession(c), "router ospf 2");   // navigation-class: enters the mode, but it is not the asked process → step does not advance
    expect([cs.stepIndex, last(cs).feedback]).toEqual([0, CLI_FEEDBACK.done]);
    cs = ["exit", "router ospf 1", "network 192.168.2.0 0.0.0.255 area 0", "network 10.0.0.0 0.0.0.3 area 0"].reduce((acc, l) => submitCommand(c, acc, l), cs);
    expect([cs.completed, cs.state.hostname, cs.state.routing.ospf!.networks.length]).toEqual([true, "R2", 2]);
    expect(last(submitCommand(c, createSession(c), "hostname R3")).status).toBe("not-required");
    const eg = exOf("m27-l03-p03-sim");
    let es = drive(eg, "router eigrp 100", "network 192.168.1.0 0.0.0.255 area 0");
    expect([es.stepIndex, last(es).status, last(es).feedback]).toEqual([1, "invalid", CLI_FEEDBACK.invalid("في EIGRP لا نكتب area؛ الصيغة: network <address> [<wildcard>]")]);
    es = ["network 192.168.1.0", "network 10.0.0.0"].reduce((acc, l) => submitCommand(eg, acc, l), es);
    expect([es.completed, es.state.routing.eigrp]).toEqual([true, { id: 100, networks: ["192.168.1.0", "10.0.0.0"] }]);
    const t = exOf("m27-l03-p04-sim");
    const wrongAs = drive(t, "router eigrp 200", "network 192.168.2.0", "network 10.0.0.0");
    expect([wrongAs.completed, goalStatus(t, wrongAs.state).map(x => x.met)]).toEqual([false, [false, true, true]]);
    const ok = drive(t, "router eigrp 100", "network 10.0.0.0", "network 192.168.2.0");
    expect([ok.completed, last(ok).feedback]).toEqual([true, "✓ أحسنت، R2 يعلن شبكتيه برقم AS المطابق لـ R1."]);
    const sh = exOf("m27-l03-p05-sim");
    let ss = createSession(sh);
    const before = JSON.stringify(ss.state);
    ss = submitCommand(sh, ss, "show ip route");
    expect([ss.completed, JSON.stringify(ss.state)]).toEqual([true, before]);
    expect(last(ss).output).toEqual(["Codes: C - connected, S - static, R - RIP, O - OSPF, D - EIGRP", "", "C    192.168.1.0/24 is directly connected, GigabitEthernet0/0", "C    10.0.0.0/30 is directly connected, GigabitEthernet0/1"]);
  });
  it("ACL (224–227): the guided box writes, selects and applies; the examples challenge accepts only access-list and keeps the two lines of list 20 in order; the task needs host 30 + net 40 + 40 in on g0/0 (out or g0/1 keep it open); the Extended challenge takes the book's line then port 443", () => {
    const g = exOf("m06-l01-p03-sim");
    let s = submitCommand(g, createSession(g), "ip access-group 10 out");
    expect(last(s).feedback).toBe(CLI_FEEDBACK.interfaceFirst);
    s = ["access-list 10 permit 192.168.1.0 0.0.0.255", "interface g0/0", "ip access-group 10 out"].reduce((acc, l) => submitCommand(g, acc, l), s);
    expect([s.completed, s.state.acls["10"].length, s.state.interfaces["g0/0"].accessGroup]).toEqual([true, 1, { acl: 10, direction: "out" }]);
    const c = exOf("m06-l01-p04-sim");
    let cs = submitCommand(c, createSession(c), "access-list 20 permit any");   // valid and allowed, but not the asked rule → retry (the line is real)
    expect([cs.stepIndex, last(cs).feedback, cs.state.acls["20"].length]).toEqual([0, CLI_FEEDBACK.retry, 1]);
    cs = ["access-list 10 permit 192.168.1.0 0.0.0.255", "access-list 20 deny 192.168.2.0 0.0.0.255", "access-list 20 permit any"].reduce((acc, l) => submitCommand(c, acc, l), createSession(c));
    expect([cs.completed, cs.state.acls["20"].map(e => e.action)]).toEqual([true, ["deny", "permit"]]);
    expect(last(submitCommand(c, createSession(c), "interface g0/0")).status).toBe("ok");   // navigation stays free
    expect(last(submitCommand(c, createSession(c), "hostname R1")).status).toBe("not-required");
    const t = exOf("m06-l01-p05-sim");
    const out = drive(t, "access-list 30 permit host 192.168.1.10", "access-list 40 permit 192.168.1.0 0.0.0.255", "interface g0/0", "ip access-group 40 out");
    expect([out.completed, goalStatus(t, out.state).map(x => x.met)]).toEqual([false, [true, true, false]]);
    expect(submitCommand(t, out, "ip access-group 40 in").completed).toBe(true);
    expect(drive(t, "access-list 30 permit host 192.168.1.10", "access-list 40 permit 192.168.1.0 0.0.0.255", "interface g0/1", "ip access-group 40 in").completed).toBe(false);
    expect(drive(t, "access-list 30 permit 192.168.1.10 0.0.0.0", "access-list 40 permit 192.168.1.0 0.0.0.255", "interface g0/0", "ip access-group 40 in").completed).toBe(false);   // the book's form is `host`
    const x = exOf("m06-l01-p01-sim");
    let xs = drive(x, "access-list 100 permit tcp any any eq 80");
    expect([xs.stepIndex, last(xs).feedback]).toEqual([1, CLI_FEEDBACK.correct]);
    xs = submitCommand(x, xs, "access-list 100 permit tcp any any eq 443");
    expect([xs.completed, xs.state.acls["100"].map(e => e.port)]).toEqual([true, [80, 443]]);
    expect(last(drive(x, "access-list 100 permit tcp any any eq http")).status).toBe("invalid");
    expect(last(drive(x, "access-list 10 permit any")).feedback).toBe(CLI_FEEDBACK.retry);
  });
  it("answer secrecy and inert hostile input hold for every book exercise", () => {
    for (const e of BATCH.flatMap(sims)) {
      const ex = readCliExerciseConfig(e.block.config)!;
      for (const s of ex.steps ?? []) { expect(s.hints![0], s.id).not.toMatch(/^(switchport|line|password|login|enable|service|banner|vtp|interface|encapsulation|ip address|ip access-group|show|router|network|access-list) /); }
      let sess = createSession(ex);
      const initial = JSON.stringify(sess.state);
      for (const h of ["rm -rf /", "$(id)", "<script>alert(1)</script>", "access-list 10 permit any && reboot", "router ospf", "network 10.0.0.0 0.0.0.3 area", "ip access-group 40"]) sess = submitCommand(ex, sess, h);
      expect([sess.completed, sess.stepIndex, JSON.stringify(sess.state)], e.block.id).toEqual([false, 0, initial]);
      expect(sess.history.every(h => h.status !== "ok"), e.block.id).toBe(true);
    }
  });
});

describe("Batch 10 — pedagogy, provenance, direction", () => {
  it("every page ends with a practice; exactly ONE clarification per page; every practice has 2 hints + «افحص» incorrect feedback + explanation; review heading + r1–r3 on each module's last page (206, 209, 222, 229)", () => {
    for (const p of pages) {
      expect(p.blocks.at(-1)!.type, p.id).toBe("practice");
      expect(p.blocks.filter(b => b.type === "callout" && b.kind === "clarification"), p.id).toHaveLength(1);
      for (const b of p.blocks) if (b.type === "practice") {
        const f = b.question.feedback!;
        expect([f.hints?.length, f.incorrectFeedback?.startsWith("افحص"), Boolean(f.explanation), Boolean(f.correctFeedback)], b.id).toEqual([2, true, true, true]);
      }
    }
    for (const [m, lastId, pdf] of [[m25, M25 + "-l01-p06", 206], [m26, M26 + "-l01-p03", 209], [m27, M27 + "-l03-p05", 222], [m06, M06 + "-l02-p02", 229]] as const) {
      const p = pagesOf(m).at(-1)!;
      expect([p.id, p.source.pdfPageStart]).toEqual([lastId, pdf]);
      const rev = p.blocks.findIndex(b => b.id.endsWith("-review"));
      expect(rev, p.id).toBeGreaterThan(0);
      expect(p.blocks.slice(rev + 1).map(b => b.id.slice(-3)), p.id).toEqual(["-r1", "-r2", "-r3"]);
    }
  });
  it("counts: 6 / 3 / 13 / 7 pages, 14 / 8 / 27 / 13 practices, 1 worksheet each, one clarification per page, 5 / 0 / 5 / 4 code blocks, 6 / 0 / 5 / 4 simulations, book blocks 17 / 10 / 37 / 22; worksheet keys are always one of their options", () => {
    const count = (m: ContentModule, f: (b: ContentBlock) => boolean) => pagesOf(m).flatMap(p => p.blocks).filter(f).length;
    expect(BATCH.map(m => pagesOf(m).length)).toEqual([6, 3, 13, 7]);
    expect(BATCH.map(m => count(m, b => b.type === "practice"))).toEqual([14, 8, 27, 13]);
    expect(BATCH.map(m => count(m, b => b.type === "practice-table"))).toEqual([1, 1, 1, 1]);
    expect(BATCH.map(m => count(m, b => b.type === "callout" && b.kind === "clarification"))).toEqual([6, 3, 13, 7]);
    expect(BATCH.map(m => count(m, b => b.type === "code"))).toEqual([5, 0, 5, 4]);
    expect(BATCH.map(m => count(m, b => b.type === "simulation"))).toEqual([6, 0, 5, 4]);
    expect(BATCH.map(m => count(m, b => b.origin === "book"))).toEqual([17, 10, 37, 22]);
    for (const b of allBlocks) if (b.type === "practice-table") {
      let selects = 0;
      for (const row of b.rows) for (const cell of row) if (typeof cell !== "string") { selects++; expect(sel(cell).options, b.id).toContain(sel(cell).key); expect(new Set(sel(cell).options).size).toBe(sel(cell).options.length); }
      expect(selects, b.id).toBeGreaterThan(0);
    }
  });
  it("every newly authored Batch-10 keyed practice uses an interactive kind (multipleChoice / trueFalse / shortInput) — no keyed fillBlank (its static fallback is untouched, just not used here)", () => {
    const kinds = new Set(allBlocks.filter(b => b.type === "practice").map(b => b.question.kind));
    expect([...kinds].sort()).toEqual(["multipleChoice", "shortInput", "trueFalse"]);
    expect(allBlocks.some(b => b.type === "practice" && b.question.kind === "fillBlank")).toBe(false);
    const packet = blockBy(pageBy(M26 + "-l01-p02"), "m26-l01-p02-q2"), distance = blockBy(pageBy(M27 + "-l01-p03"), "m27-l01-p03-q2");
    expect(packet.type === "practice" && [packet.origin, packet.question.kind, (packet.question as { answer?: string }).answer, packet.question.feedback?.hints?.length, packet.question.feedback?.incorrectFeedback?.startsWith("افحص")]).toEqual(["teacher-enrichment", "shortInput", "Packet", 2, true]);
    expect(distance.type === "practice" && [distance.origin, distance.question.kind, (distance.question as { answer?: string }).answer, distance.question.feedback?.hints?.length, distance.question.feedback?.incorrectFeedback?.startsWith("افحص")]).toEqual(["teacher-enrichment", "shortInput", "Distance", 2, true]);
    expect(plain(pageBy(M27 + "-l01-p03"))).toContain("يركّز على تحديث معلومات الحالة عند حدوث تغيير");
    expect(plain(pageBy(M27 + "-l01-p03"))).not.toContain("يصمت");
  });
  it("provenance: book blocks are text / callout / table / list / code only; practice, worksheets, clarifications, headings and simulations are teacher-enrichment; no raw HTML", () => {
    for (const b of allBlocks) {
      if (b.type === "practice" || b.type === "practice-table" || b.type === "simulation" || b.type === "heading" || (b.type === "callout" && b.kind === "clarification")) expect(b.origin, b.id).toBe("teacher-enrichment");
      if (b.origin === "book") expect(["text", "callout", "table", "list", "code"], b.id).toContain(b.type);
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
    for (const tok of ["WAN", "LAN", "Frames", "Packet Switching", "Metro Ethernet", "Ethernet", "Bandwidth", "Bandwidth + Delay", "Cisco", "Metric", "AD", "RIP = 120", "OSPF = 110", "EIGRP = 90", "Static = 1", "Connected = 0", "OSPF = Open Shortest Path First", "Open Standard", "Shortest Path First", "R1", "R2", "10.0.0.0/30", "area", "wildcard", "0.0.0.3", "R1(config-router)#", "EIGRP = Enhanced Interior Gateway Routing Protocol", "Convergence", "AS", "Autonomous System", "network 10.0.0.0", "C", "R", "O", "D", "[120/1]", "via 192.168.1.1", "ACL", "IP", "Standard ACL", "Extended", "in", "out", "0.0.0.255", "deny any", "ip access-group", "host 192.168.1.10", "wildcard 0.0.0.0", "(config-if)#", "g0/0", "TCP / UDP / ICMP", "permit", "tcp", "any", "eq 80", "HTTP", "access-list 100 permit tcp any any eq 80", "enable", "Router>", "configure terminal", "Router#", "hostname", "interface", "(config)#", "ip address", "192.168.1.1 255.255.255.0", "VLAN", "Trunk", "vlan 10", "switchport access vlan 10", "switchport mode trunk", "f0/1-10", "VLAN 10", "f0/24", "server", "client", "vty", "console", "password", "login", "enable secret", "enable password", "g0/0.10", "encapsulation dot1Q 10", "Default Gateway", "switchport port-security", "Port Security", "show", "#", "show ip route", "show vlan brief", "show port-security", "show ip dhcp pool"]) expect(ltr.has(tok), tok).toBe(true);
    expect(JSON.stringify(BATCH)).not.toMatch(/→|←|➜|⟶|⇒/);
    for (const b of allBlocks) if (b.type === "table" || b.type === "practice-table") expect(b.columnDirs, b.id).toBeDefined();
  });
});

describe("Batch 10 — loaders, navigation, server registry agreement, publication invariants, earlier bodies untouched", () => {
  it("the m25 / m26 / m27 / m06 body loaders EXIST and lazily resolve (6 / 3 / 13 / 7 pages); every manifest module now has a loader", async () => {
    expect([M25, M26, M27, M06].map(id => hasModuleContent("791381", id))).toEqual([true, true, true, true]);
    const a = await loadModuleContent("791381", M25), b = await loadModuleContent("791381", M26), c = await loadModuleContent("791381", M27), d = await loadModuleContent("791381", M06);
    expect([a.id, a.order, pagesOf(a).length, b.id, b.order, pagesOf(b).length, c.id, c.order, pagesOf(c).length, d.id, d.order, pagesOf(d).length]).toEqual([M25, 24, 6, M26, 25, 3, M27, 26, 13, M06, 27, 7]);
    expect(manifest.modules.every(m => hasModuleContent("791381", m.id))).toBe(true);
    expect(hasModuleContent("791381", "791381-m28")).toBe(false);
  });
  it("navigation: m05 → m25 → m26 → m27 → m06 (last); PDF 199 leads to 201 (200 is a cover); 206 to 207; 209 to 210; 222 to 223; the historical PDF 227 page follows the new PDF 226 page; PDF 229 is the last page of the course", () => {
    expect(orderedModules(manifest).map(m => m.id).slice(22)).toEqual(["791381-m05", M25, M26, M27, M06]);
    expect(nextPage(manifest, "791381-m05-l03-p02")?.id).toBe(M25 + "-l01-p01");
    expect(previousPage(manifest, M25 + "-l01-p01")?.id).toBe("791381-m05-l03-p02");
    expect(nextPage(manifest, M25 + "-l01-p06")?.id).toBe(M26 + "-l01-p01");
    expect(nextPage(manifest, M26 + "-l01-p03")?.id).toBe(M27 + "-l01-p01");
    expect(nextPage(manifest, M27 + "-l03-p05")?.id).toBe(M06 + "-l01-p02");
    expect(nextPage(manifest, M06 + "-l01-p05")?.id).toBe(M06 + "-l01-p01");
    expect(nextPage(manifest, M06 + "-l01-p01")?.id).toBe(M06 + "-l02-p01");
    expect(nextPage(manifest, M06 + "-l02-p02")).toBeNull();   // PDF 229 is the last page of the course
    const walk: number[] = []; let cur = nextPage(manifest, "791381-m05-l03-p02");
    while (cur) { walk.push(cur.source!.pdfPageStart); cur = nextPage(manifest, cur.id); }
    expect(walk).toEqual(Array.from({ length: 29 }, (_, i) => 201 + i));
  });
  it("FRONTEND ↔ SERVER agreement: every module of the manifest is in the server publication registry with the same title and order (and only those); m25 = 24, m26 = 25, m27 = 26, m06 = 27 at the end; an id outside the manifest is absent", () => {
    const withBody = manifest.modules.filter(m => hasModuleContent("791381", m.id)).map(m => ({ moduleId: m.id, title: m.title, order: m.order }));
    const s = server().listLearningModules("791381");
    expect(s).toEqual([...withBody].sort((a, b) => a.order - b.order));
    expect(s).toHaveLength(27);
    expect(s.slice(-4)).toEqual([{ moduleId: M25, title: "مراجعة الأوامر", order: 24 }, { moduleId: M26, title: "الشبكة الواسعة WAN", order: 25 }, { moduleId: M27, title: "بروتوكولات التوجيه", order: 26 }, { moduleId: M06, title: "قوائم التحكم ACL", order: 27 }]);
    expect(server().findLearningModule("791381", "791381-m28")).toBeNull();
  });
  it("PUBLISHABLE but NOT auto-published: the server accepts m25 / m26 / m27 / m06 for explicit publication in canonical order (m06 LAST, never by id); an unknown id → 400; the registry carries identity + title + order only; no module body mentions any class or visibleModuleIds", () => {
    expect(server().validateLearningModuleIds("791381", [M06, M25, "791381-m05", M27, M26])).toEqual(["791381-m05", M25, M26, M27, M06]);
    expect(server().validateLearningModuleIds("791381", [M06])).toEqual([M06]);
    expect(() => server().validateLearningModuleIds("791381", ["791381-m28"])).toThrow();
    expect(JSON.stringify(server().listLearningModules("791381"))).not.toMatch(/pages|lessons|blocks|pdf|visibleModuleIds|published|simulation|cli-terminal|config/i);
    for (const m of server().listLearningModules("791381")) expect(Object.keys(m).sort()).toEqual(["moduleId", "order", "title"]);
    expect(JSON.stringify(BATCH)).not.toMatch(/visibleModuleIds|classId|publish/i);
  });
  it("earlier bodies untouched: Batch 6–9 modules keep their page counts and PDF ranges, and none of them carries a Batch-10 command (router ospf / eigrp, access-list, ip access-group); b4 / b5 unchanged; b6 = [m25, m26, m27, m06]; orders 1..27 contiguous", () => {
    const shape = (m: ContentModule) => [m.id, m.order, pagesOf(m).length, Math.min(...pagesOf(m).map(p => p.source.pdfPageStart)), Math.max(...pagesOf(m).map(p => p.source.pdfPageStart))];
    expect([m03, m19, m04, m20, m21, m22, m23, m24, m05].map(shape)).toEqual([
      ["791381-m03", 15, 18, 121, 138], ["791381-m19", 16, 5, 140, 144], ["791381-m04", 17, 12, 146, 157],
      ["791381-m20", 18, 7, 159, 165], ["791381-m21", 19, 3, 166, 168], ["791381-m22", 20, 11, 169, 179],
      ["791381-m23", 21, 5, 180, 184], ["791381-m24", 22, 7, 185, 191], ["791381-m05", 23, 8, 192, 199],
    ]);
    for (const m of PREV) expect(JSON.stringify(m.lessons), m.id).not.toMatch(/router ospf|router eigrp|access-list \d|ip access-group|\(config-router\)/);
    expect(manifest.batches!.find(b => b.id === "b4")!.moduleIds).toEqual(["791381-m03", "791381-m19", "791381-m04"]);
    expect(manifest.batches!.find(b => b.id === "b5")!.moduleIds).toEqual(["791381-m20", "791381-m21", "791381-m22", "791381-m23", "791381-m24", "791381-m05"]);
    expect(manifest.batches!.find(b => b.id === "b6")!.moduleIds).toEqual([M25, M26, M27, M06]);
    expect(manifest.modules.map(m => m.order)).toEqual(Array.from({ length: 27 }, (_, i) => i + 1));
  });
});
