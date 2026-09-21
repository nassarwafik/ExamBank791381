// Final summary — guard suite for m28 «الملخّص الشامل» (source PDF 230 cover + 231–263 learner pages; PDF 264 back
// cover never converted): exactly one new module at order 28 (the last), the manifest's «summary» grouping filled,
// 33 pages mapped 1:1 to PDF 231–263 with printed pages 229–260 for 231–262, navigation from m06 PDF 229 to m28
// PDF 231 (230 skipped) through 263 (no next page), pedagogy / provenance / direction rules, the ten book CLI
// exercises driven end to end through the real engine (native VLAN, static + default route, EIGRP wildcard,
// Port Security, passwords, ACLs, DHCP, show), publication invariants (publishable, never auto-published; the
// unknown-id sentinel is now `791381-m29`), earlier bodies untouched, no summary text leaking backwards.
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
import m28 from "./modules/m28";
import manifest from "./manifest";
import { hasModuleContent, loadModuleContent } from "../registry";
import { nextPage, previousPage, orderedModules, flattenPageRefs } from "../navigation";
import { validateLearningCourseContent } from "../validation";
import { LEARNING_CONTENT_SCHEMA_VERSION, type LearningCourseContent, type ContentBlock, type ContentModule, type ContentPage, type PracticeTableSelectCell, type SimulationBlock } from "../types";
import { productionActivityRegistry } from "../../activities/engine";
import { readCliExerciseConfig } from "../../cli/config";
import { createSession, submitCommand, goalStatus, CLI_FEEDBACK, type CliSession } from "../../cli/exercise";
// @ts-expect-error — the server registry is an untyped CommonJS module; it is imported here on purpose to cross-check it.
import * as apiRegistry from "../../../../api/src/lib/learning-materials-registry.js";

const PREV = [m01, m02, m07, m08, m09, m10, m11, m12, m13, m14, m15, m16, m17, m18, m03, m19, m04, m20, m21, m22, m23, m24, m05, m25, m26, m27, m06];
const ALL = [...PREV, m28];
const course: LearningCourseContent = { schemaVersion: LEARNING_CONTENT_SCHEMA_VERSION, courseId: "791381", title: "شبكات الاتصال", direction: "rtl", modules: ALL };
const M28 = "791381-m28", M06 = "791381-m06", UNKNOWN = "791381-m29";
const pagesOf = (m: ContentModule): ContentPage[] => [...m.lessons].sort((a, b) => a.order - b.order).flatMap(l => [...l.pages].sort((a, b) => a.order - b.order));
const pages = pagesOf(m28);
const byPdf = (n: number): ContentPage => pages.find(p => p.source.pdfPageStart === n)!;
const blockBy = (p: ContentPage, id: string): ContentBlock => p.blocks.find(b => b.id === id)!;
const allBlocks = pages.flatMap(p => p.blocks);
const sel = (cell: unknown) => cell as PracticeTableSelectCell;
const byId = Object.fromEntries(manifest.modules.map(m => [m.id, m]));
const server = () => (apiRegistry as unknown as { listLearningModules: (c: string) => { moduleId: string; title: string; order: number }[]; findLearningModule: (c: string, m: string) => unknown; validateLearningModuleIds: (c: string, ids: string[]) => string[]; canonicalizeLearningModuleIds: (c: string, ids: unknown[]) => string[] });
const sims = (m: ContentModule) => pagesOf(m).flatMap(p => p.blocks.filter((b): b is SimulationBlock => b.type === "simulation").map(b => ({ page: p, block: b })));
const exOf = (id: string) => { const b = allBlocks.find(x => x.id === id) as SimulationBlock; return readCliExerciseConfig(b.config)!; };
const last = (s: CliSession) => s.history[s.history.length - 1];
const drive = (ex: ReturnType<typeof exOf>, ...lines: string[]) => lines.reduce((s, l) => submitCommand(ex, s, l), createSession(ex));
const count = (m: ContentModule, f: (b: ContentBlock) => boolean) => pagesOf(m).flatMap(p => p.blocks).filter(f).length;

/** PDF → [printed page (undefined for 263), title, page id]. */
const MAP: Record<number, [number | undefined, string, string]> = {
  231: [229, "المفاهيم الأولى: IP و MAC", M28 + "-l01-p01"], 232: [230, "فئات عناوين IPv4", M28 + "-l01-p02"], 233: [231, "أنظمة العدّ والتحويل", M28 + "-l01-p03"],
  234: [232, "أجهزة الشبكة", M28 + "-l01-p04"], 235: [233, "الكوابل ووسائط الاتصال", M28 + "-l01-p05"], 236: [234, "أنواع الشبكات حسب النطاق", M28 + "-l01-p06"],
  237: [235, "نموذج OSI — الطبقات السبع", M28 + "-l02-p01"], 238: [236, "البروتوكولات والمنافذ المهمّة", M28 + "-l02-p02"], 239: [237, "الفروق بين TCP و UDP", M28 + "-l02-p03"], 240: [238, "وحدات البيانات والتغليف", M28 + "-l02-p04"],
  241: [239, "العناوين الخاصة وأنواع الرسائل", M28 + "-l03-p01"], 242: [240, "التجزئة Subnetting — أمثلة محلولة", M28 + "-l03-p02"], 243: [241, "قناع البدل Wildcard Mask", M28 + "-l03-p03"], 244: [242, "العنوان IPv6 — البنية والتصغير", M28 + "-l03-p04"],
  245: [243, "مفهوم VLANs و VTP", M28 + "-l04-p01"], 246: [244, "أوامر VLAN و Trunk", M28 + "-l04-p02"], 247: [245, "أوضاع وأوامر VTP", M28 + "-l04-p03"], 248: [246, "التوجيه بين VLANs — Dot1Q", M28 + "-l04-p04"], 249: [247, "بروتوكول STP وسلوك السويتش", M28 + "-l04-p05"], 250: [248, "Metro-Ethernet و VLAN", M28 + "-l04-p06"],
  251: [249, "أنواع المسارات والمسار الثابت", M28 + "-l05-p01"], 252: [250, "المسافة الإدارية AD", M28 + "-l05-p02"], 253: [251, "بروتوكولات التوجيه — مقارنة", M28 + "-l05-p03"],
  254: [252, "الهجمات الشائعة", M28 + "-l06-p01"], 255: [253, "تأمين المنافذ Port Security", M28 + "-l06-p02"], 256: [254, "تأمين الوصول بكلمات المرور و SSH", M28 + "-l06-p03"], 257: [255, "قوائم التحكم بالوصول ACL", M28 + "-l06-p04"],
  258: [256, "NAT و PAT و APIPA", M28 + "-l07-p01"], 259: [257, "بروتوكول DHCP — DORA و Pool", M28 + "-l07-p02"], 260: [258, "مصافحة TCP الثلاثية", M28 + "-l07-p03"], 261: [259, "سيناريو تكاملي: فتح موقع", M28 + "-l07-p04"], 262: [260, "أوامر CMD و Show", M28 + "-l07-p05"],
  263: [undefined, "كلمة الختام", M28 + "-l08-p01"],
};
const PDFS = Object.keys(MAP).map(Number);

describe("Final summary — identity, structure, mapping PDF 231–263, covers 230 / 264 excluded", () => {
  it("the WHOLE course (every module incl. m28) validates with ZERO issues; every id is unique; the manifest TOC equals the bodies", () => {
    expect(validateLearningCourseContent(course)).toEqual([]);
    expect(ALL.map(m => m.id).sort()).toEqual(manifest.modules.map(m => m.id).sort());
    const ids = ALL.flatMap(m => [m.id, ...m.lessons.flatMap(l => [l.id, ...l.pages.flatMap(p => [p.id, ...p.blocks.map(b => b.id)])])]);
    expect(new Set(ids).size).toBe(ids.length);
    const refs = flattenPageRefs(manifest).filter(r => r.module.id === M28).map(r => [r.page.id, r.page.title, r.page.source!.pdfPageStart, r.page.source!.printedPage]);
    expect(refs).toEqual(pages.map(p => [p.id, p.title, p.source.pdfPageStart, p.source.printedPage]));
  });
  it("EXACTLY ONE new module m28 «الملخّص الشامل» (shortTitle «الملخّص», order 28, the LAST); eight lessons in the book's section order; module source 230–264 (cover / back cover are metadata only)", () => {
    expect(manifest.modules.filter(m => !PREV.some(p => p.id === m.id)).map(m => m.id)).toEqual([M28]);
    expect([m28.id, m28.title, m28.shortTitle, m28.order, m28.partial]).toEqual([M28, "الملخّص الشامل", "الملخّص", 28, undefined]);
    expect([byId[M28].title, byId[M28].shortTitle, byId[M28].order]).toEqual(["الملخّص الشامل", "الملخّص", 28]);
    expect(orderedModules(manifest).at(-1)!.id).toBe(M28);
    expect(orderedModules(manifest).at(-2)!.id).toBe(M06);
    expect(manifest.modules.map(m => m.order)).toEqual(Array.from({ length: 28 }, (_, i) => i + 1));
    expect(m28.lessons.map(l => [l.id, l.title, l.order, l.pages.length])).toEqual([
      [M28 + "-l01", "الأساسيات", 1, 6], [M28 + "-l02", "النماذج والبروتوكولات", 2, 4], [M28 + "-l03", "العنونة والتجزئة", 3, 4], [M28 + "-l04", "التبديل و VLANs", 4, 6],
      [M28 + "-l05", "التوجيه", 5, 3], [M28 + "-l06", "الأمان", 6, 4], [M28 + "-l07", "الخدمات والأوامر", 7, 5], [M28 + "-l08", "كلمة الختام", 8, 1],
    ]);
    expect(byId[M28].lessons.map(l => [l.id, l.title, l.order, l.pages.length])).toEqual(m28.lessons.map(l => [l.id, l.title, l.order, l.pages.length]));
    expect(m28.source).toEqual({ kind: "book", sourceId: "791381", pdfPageStart: 230, pdfPageEnd: 264, sourceNote: expect.stringContaining("PDF 264 الغلاف الخلفي") });
    expect(manifest.modules.some(m => new RegExp(UNKNOWN.slice(-3)).test(m.id))).toBe(false);
  });
  it("33 learner pages = PDF 231–263 exactly (1:1, source order, no gap, no duplicate); PDF 230 and 264 are NOT learner pages; printed 229–260 ↔ PDF 231–262; PDF 263 has no printed number; the maximum source page of the whole course is 263", () => {
    expect(pages.length).toBe(33);
    expect(pages.map(p => p.source.pdfPageStart)).toEqual(PDFS);
    expect(pages.map(p => p.source.pdfPageStart)).toEqual(Array.from({ length: 33 }, (_, i) => 231 + i));
    for (const p of pages) {
      const [printed, title, id] = MAP[p.source.pdfPageStart];
      expect([p.id, p.title, p.source.printedPage, p.source.sourceId, p.source.pdfPageEnd], String(p.source.pdfPageStart)).toEqual([id, title, printed, "791381", undefined]);
      expect(p.source.pdfPageStart <= 262 ? p.source.printedPage : undefined, p.id).toBe(p.source.pdfPageStart <= 262 ? p.source.pdfPageStart - 2 : undefined);
    }
    const everyPdf = ALL.flatMap(m => m.lessons.flatMap(l => l.pages.map(p => p.source.pdfPageStart)));
    expect(everyPdf.includes(230)).toBe(false);
    expect(everyPdf.includes(264)).toBe(false);
    expect(Math.max(...everyPdf)).toBe(263);
    expect(Math.max(...PREV.flatMap(m => m.lessons.flatMap(l => l.pages.map(p => p.source.pdfPageStart))))).toBe(229);
    expect(new Set(everyPdf).size).toBe(everyPdf.length);   // no duplicate PDF index in the whole course
    expect(byPdf(263).conversionNote).toMatch(/PDF 264/);
    expect(byPdf(263).blocks.every(b => b.type !== "practice" && b.type !== "practice-table" && b.type !== "simulation")).toBe(true);
  });
  it("manifest groupings: summary = [m28]; intro unchanged (empty); b1–b6 unchanged; every module id in at most one grouping", () => {
    const g = Object.fromEntries(manifest.batches!.map(b => [b.id, b.moduleIds]));
    expect(g.summary).toEqual([M28]);
    expect(g.intro).toEqual([]);
    expect(g.b6).toEqual(["791381-m25", "791381-m26", "791381-m27", M06]);
    expect(g.b5).toEqual(["791381-m20", "791381-m21", "791381-m22", "791381-m23", "791381-m24", "791381-m05"]);
    expect(g.b4).toEqual(["791381-m03", "791381-m19", "791381-m04"]);
    expect(manifest.batches!.map(b => b.id)).toEqual(["intro", "b1", "b2", "b3", "b4", "b5", "b6", "summary"]);
    const all = manifest.batches!.flatMap(b => b.moduleIds);
    expect(new Set(all).size).toBe(all.length);
    expect(manifest.batches!.filter(b => b.moduleIds.includes(M28)).map(b => b.id)).toEqual(["summary"]);
  });
  it("navigation: m06 PDF 229 → m28 PDF 231 (230 skipped), 231 → … → 263 in order, 263 has NO next page, 264 never appears; previous of 231 is 229; the loader resolves m28 lazily", async () => {
    expect(nextPage(manifest, M06 + "-l02-p02")?.id).toBe(M28 + "-l01-p01");
    expect(previousPage(manifest, M28 + "-l01-p01")?.id).toBe(M06 + "-l02-p02");
    expect(nextPage(manifest, M28 + "-l08-p01")).toBeNull();
    const walk: number[] = []; let cur = nextPage(manifest, M06 + "-l02-p02");
    while (cur) { walk.push(cur.source!.pdfPageStart); cur = nextPage(manifest, cur.id); }
    expect(walk).toEqual(PDFS);
    expect(walk).not.toContain(230);
    expect(walk).not.toContain(264);
    for (let i = 1; i < pages.length; i++) expect(nextPage(manifest, pages[i - 1].id)?.id, pages[i - 1].id).toBe(pages[i].id);
    expect(hasModuleContent("791381", M28)).toBe(true);
    expect(hasModuleContent("791381", UNKNOWN)).toBe(false);
    const loaded = await loadModuleContent("791381", M28);
    expect([loaded.id, loaded.order, pagesOf(loaded).length]).toEqual([M28, 28, 33]);
    expect(manifest.modules.every(m => hasModuleContent("791381", m.id))).toBe(true);
  });
});

describe("Final summary — fidelity spot checks against the printed pages", () => {
  const table = (pdf: number, id: string) => { const b = blockBy(byPdf(pdf), id); return b.type === "table" ? b : null; };
  const code = (pdf: number, id: string) => { const b = blockBy(byPdf(pdf), id); return b.type === "code" ? b.code : null; };
  it("231 / 232 / 233 / 238 / 241 / 243 / 244 / 252 / 253 / 254 / 262: the summary tables carry the book's exact values", () => {
    expect(table(231, "m28-l01-p01-table")!.rows.map(r => r[0])).toEqual(["IP — عنوان الجهاز", "IP خاص Private", "MAC — عنوان البطاقة", "Subnet Mask — القناع", "Gateway — البوابة"]);
    expect(table(232, "m28-l01-p02-table")!.rows).toEqual([["Class A", "1.0.0.0 – 126.255.255.255", "255.0.0.0  /8", "16,777,214"], ["Class B", "128.0.0.0 – 191.255.255.255", "255.255.0.0  /16", "65,534"], ["Class C", "192.0.0.0 – 223.255.255.255", "255.255.255.0  /24", "254"]]);
    expect(table(233, "m28-l01-p03-boxes")!.headers).toEqual(["128", "64", "32", "16", "8", "4", "2", "1"]);
    expect(table(238, "m28-l02-p02-table")!.rows.map(r => [r[0], r[1]])).toEqual([["HTTP", "80"], ["HTTPS", "443"], ["FTP", "20,21"], ["TFTP", "69"], ["DNS", "53"], ["DHCP", "67,68"], ["SMTP", "25"], ["POP3", "110"], ["IMAP", "143"], ["SSH", "22"], ["TELNET", "23"]]);
    expect(table(241, "m28-l03-p01-special")!.rows.map(r => r[0])).toEqual(["127.0.0.1", "169.254.x.x", "0.0.0.0", "255.255.255.255"]);
    expect(table(242, "m28-l03-p02-table")!.rows).toEqual([["10.5.6.7", "/8", "10.0.0.0", "10.0.0.1", "10.255.255.254", "10.255.255.255"], ["172.16.5.40", "/16", "172.16.0.0", "172.16.0.1", "172.16.255.254", "172.16.255.255"], ["192.168.1.25", "/24", "192.168.1.0", "192.168.1.1", "192.168.1.254", "192.168.1.255"]]);
    expect(table(243, "m28-l03-p03-table")!.rows.map(r => [r[0], r[1]])).toEqual([["255.255.255.255", "0.0.0.0"], ["255.255.255.0", "0.0.0.255"], ["255.255.0.0", "0.0.255.255"], ["0.0.0.0", "255.255.255.255"]]);
    expect(table(244, "m28-l03-p04-table")!.rows.map(r => r[1])).toEqual(["128 bit", "8 مجموعات", "64 bit /64", "64 bit", "2001:0DB8:0000:0000:0000:0000:0000:0001", "2001:DB8:0:0:0:0:0:1", "2001:DB8::1"]);
    expect(table(252, "m28-l05-p02-table")!.rows).toEqual([["RIP", "120"], ["OSPF", "110"], ["EIGRP", "90"], ["Static", "1"], ["Connected", "0"]]);
    expect(table(253, "m28-l05-p03-table")!.rows.map(r => [r[1], r[2]])).toEqual([["Distance Vector", "120"], ["Link State", "110"], ["Hybrid", "90"], ["Path Vector", "—"]]);
    expect(table(254, "m28-l06-p01-table")!.rows.map(r => r[0])).toEqual(["DoS", "DDoS", "Spoofing", "MitM", "Sniffing", "Hijacking", "Phishing"]);
    expect(table(262, "m28-l07-p05-cmd")!.rows.map(r => r[0])).toEqual(["ping 8.8.8.8", "tracert", "ipconfig", "ipconfig /all", "nslookup", "arp -a"]);
    expect(table(262, "m28-l07-p05-show")!.rows.map(r => r[0])).toEqual(["show vlan brief", "show interfaces trunk", "show mac address-table", "show interfaces status", "show vtp status", "show spanning-tree"]);
    expect(JSON.stringify(byPdf(237).blocks)).toContain("All People Seem To Need Data Processing");
    expect(JSON.stringify(byPdf(239).blocks)).toContain("TCP: HTTP/HTTPS · FTP · SMTP · SSH");
    expect(JSON.stringify(byPdf(240).blocks)).toMatch(/Data.*Segment.*Packet.*Frame.*Bits/);
    const dora = blockBy(byPdf(259), "m28-l07-p02-dora");
    expect(dora.type === "list" && dora.items.map(i => i.term)).toEqual(["Discover", "Offer", "Request", "ACK"]);
    const hs = blockBy(byPdf(260), "m28-l07-p03-steps");
    expect(hs.type === "list" && hs.items.map(i => i.term)).toEqual(["1 · SYN", "2 · SYN-ACK", "3 · ACK"]);
    const web = blockBy(byPdf(261), "m28-l07-p04-steps");
    expect(web.type === "list" && web.items.map(i => [i.term, i.note])).toEqual([["1 · DNS", "الحاسوب إلى DNS · UDP 53"], ["2 · ARP", "الحاسوب إلى GW · L2"], ["3 · TCP Handshake", "ثلاث خطوات · App"], ["4 · HTTP/HTTPS", "صفحة مشفّرة · 80/443"]]);
  });
  it("the nine CLI boxes are the book's exact lines (246, 247, 248, 251, 253, 255, 256, 257, 259) and each is followed by its command table", () => {
    const CODE: Record<number, [string, string]> = {
      246: ["m28-l04-p02-cli", "Device(config)# vlan 10 / name SALES\nDevice(config)# interface range fa0/1-10\nDevice(config)# switchport mode access\nDevice(config)# switchport access vlan 10\nDevice(config)# switchport mode trunk\nDevice(config)# switchport trunk allowed vlan 10,20,30"],
      247: ["m28-l04-p03-cli", "Switch(config)# vtp mode server\nSwitch(config)# vtp domain HFA\nSwitch(config)# vtp password SA1234"],
      248: ["m28-l04-p04-cli", "Device(config)# interface gi0/0 / no shutdown\nDevice(config)# interface gi0/0.10\nDevice(config)# encapsulation dot1Q 10\nDevice(config)# ip address 192.168.10.1 255.255.255.0"],
      251: ["m28-l05-p01-cli", "Router(config)# ip route 192.168.2.0 255.255.255.0 10.0.0.2"],
      253: ["m28-l05-p03-cli", "R(config)# router ospf 1 / network 192.168.1.0 0.0.0.255 area 0\nR(config)# router eigrp 100 / network 192.168.1.0 0.0.0.255"],
      255: ["m28-l06-p02-cli", "Device(config)# switchport mode access\nDevice(config)# switchport port-security\nDevice(config)# switchport port-security maximum 2\nDevice(config)# switchport port-security mac-address sticky\nDevice(config)# switchport port-security violation shutdown"],
      256: ["m28-l06-p03-cli", "Device(config)# line console 0 / password cisco / login\nDevice(config)# line vty 0 4 / password cisco / login\nDevice(config)# enable secret cisco123\nDevice(config)# service password-encryption"],
      257: ["m28-l06-p04-cli", "access-list 10 permit 192.168.1.0 0.0.0.255      (Standard)\nip access-group 10 out\naccess-list 100 permit tcp 192.168.1.0 0.0.0.255 any eq 80   (Extended)\nip access-group 100 in"],
      259: ["m28-l07-p02-cli", "R(config)# ip dhcp pool STUDENTS\nR(dhcp-config)# network 192.168.10.0 255.255.255.0\nR(dhcp-config)# default-router 192.168.10.1 / dns-server 8.8.8.8\nR(config)# ip dhcp excluded-address 192.168.10.1 192.168.10.10"],
    };
    for (const [pdf, [id, text]] of Object.entries(CODE)) {
      const p = byPdf(Number(pdf));
      expect(code(Number(pdf), id), id).toBe(text);
      const i = p.blocks.findIndex(b => b.id === id);
      const next = p.blocks[i + 1];
      expect(next.type === "table" && next.origin === "book" && next.columnDirs?.[0] === "ltr", id).toBe(true);
    }
    expect(count(m28, b => b.type === "code")).toBe(9);
    expect(JSON.stringify(byPdf(246).blocks)).toContain("switchport trunk native vlan 99");
    expect(JSON.stringify(byPdf(255).blocks)).toMatch(/Restrict.*Protect/);
  });
});

describe("Final summary — pedagogy, provenance, direction", () => {
  it("every page except the closing word ends with a practice; exactly ONE clarification per page (33); every practice has 2 hints + «افحص» incorrect feedback + explanation + correct feedback; NO keyed fillBlank; review heading + r1–r3 on PDF 262; PDF 263 static", () => {
    for (const p of pages) {
      if (p.source.pdfPageStart !== 263) expect(p.blocks.at(-1)!.type, p.id).toBe("practice");
      expect(p.blocks.filter(b => b.type === "callout" && b.kind === "clarification"), p.id).toHaveLength(1);
      const practices = p.blocks.filter(b => b.type === "practice").length + p.blocks.filter(b => b.type === "practice-table").length;
      if (p.source.pdfPageStart !== 263) expect(practices, p.id).toBeGreaterThanOrEqual(1);
    }
    for (const b of allBlocks) if (b.type === "practice") {
      const f = b.question.feedback!;
      expect(f.hints, b.id).toHaveLength(2);
      expect(f.incorrectFeedback, b.id).toMatch(/^افحص/);
      expect(f.explanation && f.correctFeedback, b.id).toBeTruthy();
      expect(b.question.kind, b.id).not.toBe("fillBlank");
      if (b.question.kind === "multipleChoice") expect(b.question.options.filter(o => o.correct), b.id).toHaveLength(1);
    }
    const p262 = byPdf(262);
    const h = blockBy(p262, "m28-l07-p05-review");
    expect(h.type === "heading" && h.text).toBe("مراجعة الوحدة");
    expect(p262.blocks.slice(-3).map(b => b.id)).toEqual(["m28-l07-p05-r1", "m28-l07-p05-r2", "m28-l07-p05-r3"]);
    expect(byPdf(263).blocks.map(b => b.type)).toEqual(["text", "text", "text", "text", "callout", "callout"]);
    expect(byPdf(263).blocks.filter(b => b.origin === "book")).toHaveLength(5);
    // SOURCE FIDELITY (review finding): the rendered PDF 263 opens with «الحمد لله …» — no initial ف (the PDF text layer's ف is a glyph artifact).
    const first = blockBy(byPdf(263), "m28-l08-p01-t1");
    expect(first.type === "text" && first.origin === "book" && first.spans.map(sp => sp.text).join("")).toBe("الحمد لله الذي وفّقنا وأعاننا على إتمام هذا الكتاب.");
    expect(JSON.stringify(byPdf(263).blocks)).not.toContain("فالحمد");
  });
  it("counts: 33 pages, 41 practices (21 MC / 6 TF / 14 shortInput / 0 fillBlank), 16 worksheets, 10 simulations, 9 code, 37 tables, 21 visual-enrichment blocks (Batch 9), 93 book blocks, 122 enrichment, 215 blocks; every worksheet key is one of its options", () => {
    expect([pages.length, count(m28, b => b.type === "practice"), count(m28, b => b.type === "practice-table"), count(m28, b => b.type === "simulation"), count(m28, b => b.type === "code"), count(m28, b => b.type === "table")]).toEqual([33, 41, 16, 10, 9, 37]);
    expect(["multipleChoice", "trueFalse", "shortInput", "fillBlank"].map(k => count(m28, b => b.type === "practice" && b.question.kind === k))).toEqual([21, 6, 14, 0]);
    expect(count(m28, b => b.type === "visual")).toBe(21);
    expect([count(m28, b => b.origin === "book"), count(m28, b => b.origin === "teacher-enrichment"), count(m28, () => true)]).toEqual([93, 122, 215]);
    for (const b of allBlocks) if (b.type === "practice-table") {
      let selects = 0;
      for (const row of b.rows) for (const cell of row) if (typeof cell !== "string") { selects++; expect(sel(cell).options, b.id).toContain(sel(cell).key); expect(new Set(sel(cell).options).size, b.id).toBe(sel(cell).options.length); }
      expect(selects, b.id).toBeGreaterThan(0);
      expect(b.columnDirs, b.id).toHaveLength(b.headers.length);
    }
  });
  it("provenance: book blocks are text / callout / table / list / code only; practice, worksheets, clarifications, headings and simulations are teacher-enrichment; no raw HTML; no arrow glyphs; every table declares column directions; technical tokens are LTR code spans", () => {
    for (const b of allBlocks) {
      if (b.origin === "book") expect(["text", "callout", "table", "list", "code"], b.id).toContain(b.type);
      if (b.type === "practice" || b.type === "practice-table" || b.type === "simulation" || b.type === "heading" || (b.type === "callout" && b.kind === "clarification")) expect(b.origin, b.id).toBe("teacher-enrichment");
      if (b.type === "table") expect(b.columnDirs, b.id).toHaveLength(b.headers.length);
    }
    const text = JSON.stringify(m28);
    expect(text).not.toMatch(/<[a-z!/]/i);
    expect(text).not.toMatch(/→|←|➜|⟶|⇒|⇐/);
    const ltr = new Set<string>();
    for (const b of allBlocks) {
      const spans = b.type === "text" || b.type === "callout" ? b.spans : b.type === "list" ? b.items.flatMap(i => i.text) : [];
      for (const s of spans) if (s.dir === "ltr") ltr.add(s.text);
    }
    for (const tok of ["IP", "MAC", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "Static", "DHCP", "127.x", "Loopback", "2^host − 2", "192 = 128 + 64 = 11000000₂", "Hub", "Switch", "Router", "Fiber", "PAN", "WAN", "All People Seem To Need Data Processing", "ARP", "ICMP", "ping", "DNS", "Data", "Segment", "Packet", "Frame", "Bits", "Broadcast", "ARP · DHCP · RIP", "192.168.1.0", "255 −", "Wildcard 0.0.0.255", "Loopback = ::1", "Link-Local = FE80::/10", "Multicast = FF00::/8", "VLAN", "VTP", "Trunk (802.1Q)", "switchport trunk native vlan 99", "Domain", "Password", "encapsulation dot1Q 10", "Flooding", "Metro-Ethernet", "ip route ...", "OSPF · EIGRP", "0.0.0.0/0", "0.0.0.0 0.0.0.0", "AD", "Connected", "OSPF = Link-State", "HTTPS/VPN/SSH", "Port Security", "ACL", "err-disabled", "Restrict", "Protect", "Telnet", "22", "Standard", "Extended", "NAT/PAT", "APIPA", "ipconfig /release", "ipconfig /renew", "SYN", "TCP", "GET", "TLS", "CMD", "show vlan brief", "show vtp status", "791381"]) expect(ltr.has(tok), tok).toBe(true);
  });
  it("no summary text leaks into earlier bodies; earlier bodies carry none of the final-reference CLI additions (nativeVlan / static-route / ip-route / EIGRP wildcard); Batch 6–10 bodies keep their shapes; m28 mentions no class / publication concept", () => {
    const ban = /الملخّص الشامل|كلمة الختام|مرجع نهائي|تمّ بحمد الله|ip route \d|791381-m28|m28-l0/;
    for (const m of PREV) expect(JSON.stringify(m.lessons), m.id).not.toMatch(ban);
    for (const m of PREV) expect(JSON.stringify(sims(m).map(s => s.block.config)), m.id).not.toMatch(/"nativeVlan"|"static-route"|"command":"ip-route"|"ip-route"\]|"form":"eigrp","address":"[\d.]+","wildcard"/);
    const shape = (m: ContentModule) => [m.id, m.order, pagesOf(m).length, Math.min(...pagesOf(m).map(p => p.source.pdfPageStart)), Math.max(...pagesOf(m).map(p => p.source.pdfPageStart))];
    expect([m03, m19, m04, m20, m21, m22, m23, m24, m05, m25, m26, m27, m06].map(shape)).toEqual([
      ["791381-m03", 15, 18, 121, 138], ["791381-m19", 16, 5, 140, 144], ["791381-m04", 17, 12, 146, 157],
      ["791381-m20", 18, 7, 159, 165], ["791381-m21", 19, 3, 166, 168], ["791381-m22", 20, 11, 169, 179],
      ["791381-m23", 21, 5, 180, 184], ["791381-m24", 22, 7, 185, 191], ["791381-m05", 23, 8, 192, 199],
      ["791381-m25", 24, 6, 201, 206], ["791381-m26", 25, 3, 207, 209], ["791381-m27", 26, 13, 210, 222], ["791381-m06", 27, 7, 223, 229],
    ]);
    expect(JSON.stringify(m28)).not.toMatch(/visibleModuleIds|classId|publish/i);
  });
});

describe("Final summary — the ten REAL book CLI exercises (simulation / cli-terminal / v1)", () => {
  it("exactly ten simulations on PDF 246, 247, 248, 251, 253, 255, 256, 257, 259, 262; every one resolves to cli-terminal; the registry stays at fourteen entries; every config reads back as a valid, cleaned exercise; Windows commands and restrict / protect never enter a simulator config", () => {
    const list = sims(m28);
    expect(list.map(s => s.page.source.pdfPageStart)).toEqual([246, 247, 248, 251, 253, 255, 256, 257, 259, 262]);
    for (const e of list) {
      expect([e.block.simulationType, e.block.version, e.block.origin], e.block.id).toEqual(["cli-terminal", 1, "teacher-enrichment"]);
      expect(productionActivityRegistry.resolve(e.block)?.key, e.block.id).toBe("cli-terminal");
      expect(e.block.fallback?.text, e.block.id).toBeTruthy();
      expect(e.block.capabilities, e.block.id).toEqual({ fullscreen: true, reset: true, interactive: true });
      const cfg = readCliExerciseConfig(e.block.config);
      expect(cfg, e.block.id).not.toBeNull();
      const raw = e.block.config as Record<string, unknown>;
      expect(cfg!.kind, e.block.id).toBe(raw.kind);
      if (cfg!.kind === "task") expect(cfg!.goals!.length, e.block.id).toBe((raw.goals as unknown[]).length);
      else expect(cfg!.steps!.length, e.block.id).toBe((raw.steps as unknown[]).length);
    }
    expect(productionActivityRegistry.list().length).toBe(14);
    const cfgText = JSON.stringify(list.map(s => s.block.config));
    expect(cfgText).not.toMatch(/ping|tracert|ipconfig|nslookup|arp -a|restrict|protect|show interfaces trunk|show mac address-table|show spanning-tree/i);
    expect(list.map(s => (s.block.config as { kind: string }).kind)).toEqual(["task", "guided", "guided", "task", "challenge", "guided", "task", "task", "task", "challenge"]);
  });
  it("PDF 246 task: the book's range + trunk lines + native vlan 99 complete it; without the native VLAN, with edges-only ports, or with the wrong allowed list it stays open (exactly those goals unmet)", () => {
    const t = exOf("m28-l04-p02-sim");
    expect(t.goals!.map(g => g.id)).toEqual(["g-vlan", "g-f1", "g-f2", "g-f3", "g-f4", "g-f5", "g-f6", "g-f7", "g-f8", "g-f9", "g-f10", "g-trunk", "g-allowed", "g-native"]);
    const book = ["vlan 10", "name SALES", "exit", "interface range fa0/1-10", "switchport mode access", "switchport access vlan 10", "exit", "interface fa0/24", "switchport mode trunk", "switchport trunk allowed vlan 10,20,30"];
    const noNative = drive(t, ...book);
    expect([noNative.completed, goalStatus(t, noNative.state).filter(g => !g.met).map(g => g.id)]).toEqual([false, ["g-native"]]);
    const done = submitCommand(t, noNative, "switchport trunk native vlan 99");
    expect([done.completed, last(done).feedback, done.state.interfaces["f0/24"].nativeVlan]).toEqual([true, t.completion, 99]);
    const edges = drive(t, "vlan 10", "exit", "interface fa0/1", "switchport access vlan 10", "exit", "interface fa0/10", "switchport access vlan 10", "exit", "interface fa0/24", "switchport mode trunk", "switchport trunk allowed vlan 10,20,30", "switchport trunk native vlan 99");
    expect([edges.completed, goalStatus(t, edges.state).filter(g => !g.met).map(g => g.id)]).toEqual([false, ["g-f2", "g-f3", "g-f4", "g-f5", "g-f6", "g-f7", "g-f8", "g-f9"]]);
    const wrongList = drive(t, ...book.slice(0, -1), "switchport trunk allowed vlan 10,20", "switchport trunk native vlan 99");
    expect(goalStatus(t, wrongList.state).filter(g => !g.met).map(g => g.id)).toEqual(["g-allowed"]);
    const wrongNative = drive(t, ...book, "switchport trunk native vlan 1");
    expect(goalStatus(t, wrongNative.state).filter(g => !g.met).map(g => g.id)).toEqual(["g-native"]);
  });
  it("PDF 247 guided VTP and PDF 248 guided Router on a Stick follow the book's lines step by step; a wrong value does not advance", () => {
    const v = exOf("m28-l04-p03-sim");
    let s = drive(v, "vtp mode client");
    expect([s.stepIndex, last(s).feedback]).toEqual([0, CLI_FEEDBACK.retry]);
    s = ["vtp mode server", "vtp domain HFA", "vtp password SA1234"].reduce((acc, l) => submitCommand(v, acc, l), s);
    expect([s.completed, s.state.vtp]).toEqual([true, { mode: "server", domain: "HFA", password: "SA1234" }]);
    const r = exOf("m28-l04-p04-sim");
    let rs = drive(r, "interface gi0/0", "no shutdown", "interface gi0/0.10", "encapsulation dot1Q 20");
    expect([rs.stepIndex, last(rs).feedback]).toEqual([3, CLI_FEEDBACK.retry]);
    rs = ["encapsulation dot1Q 10", "ip address 192.168.10.1 255.255.255.0"].reduce((acc, l) => submitCommand(r, acc, l), rs);
    expect([rs.completed, rs.state.interfaces["g0/0"].shutdown, rs.state.interfaces["g0/0.10"]]).toEqual([true, false, { shutdown: true, encapsulationVlan: 10, ipAddress: "192.168.10.1", subnetMask: "255.255.255.0" }]);
  });
  it("PDF 251 task: the book's static route + the default route complete it; a wrong next-hop keeps a goal open; the allowed gate refuses any other configuration command; show ip route then lists S and S*", () => {
    const t = exOf("m28-l05-p01-sim");
    expect(t.allowed).toEqual(["ip-route"]);
    const wrong = drive(t, "ip route 192.168.2.0 255.255.255.0 10.0.0.6", "ip route 0.0.0.0 0.0.0.0 10.0.0.2");
    expect([wrong.completed, goalStatus(t, wrong.state).filter(g => !g.met).map(g => g.id)]).toEqual([false, ["g-static"]]);
    const gated = submitCommand(t, createSession(t), "hostname R9");
    expect([last(gated).status, gated.state.hostname]).toEqual(["not-required", "Router"]);
    let s = drive(t, "ip route 192.168.2.0 255.255.255.0 10.0.0.2");
    expect(s.completed).toBe(false);
    s = submitCommand(t, s, "ip route 0.0.0.0 0.0.0.0 10.0.0.2");
    expect([s.completed, last(s).feedback]).toEqual([true, t.completion]);
    s = submitCommand(t, s, "end");
    s = submitCommand(t, s, "show ip route");
    expect(last(s).output).toContain("S    192.168.2.0/24 [1/0] via 10.0.0.2");
    expect(last(s).output).toContain("S*   0.0.0.0/0 [1/0] via 10.0.0.2");
    expect(last(s).output).toContain("Gateway of last resort is 10.0.0.2 to network 0.0.0.0");
  });
  it("PDF 253 challenge: OSPF needs area, EIGRP refuses area and accepts the book's wildcard form; the four steps complete with the book's two lines", () => {
    const c = exOf("m28-l05-p03-sim");
    let s = drive(c, "router ospf 1", "network 192.168.1.0 0.0.0.255");
    expect([s.stepIndex, last(s).status, last(s).feedback]).toEqual([1, "incomplete", CLI_FEEDBACK.incomplete("في OSPF المطلوب: network <address> <wildcard> area <n>")]);
    s = ["network 192.168.1.0 0.0.0.255 area 0", "exit", "router eigrp 100", "network 192.168.1.0 0.0.0.255 area 0"].reduce((acc, l) => submitCommand(c, acc, l), s);
    expect([s.stepIndex, last(s).status, last(s).feedback]).toEqual([3, "invalid", CLI_FEEDBACK.invalid("في EIGRP لا نكتب area؛ الصيغة: network <address> [<wildcard>]")]);
    s = submitCommand(c, s, "network 192.168.1.0 0.0.0.255");
    expect([s.completed, s.state.routing]).toEqual([true, { ospf: { id: 1, networks: [{ address: "192.168.1.0", wildcard: "0.0.0.255", area: 0 }] }, eigrp: { id: 100, networks: ["192.168.1.0 0.0.0.255"] } }]);
    const wrongAs = drive(c, "router ospf 1", "network 192.168.1.0 0.0.0.255 area 0", "exit", "router eigrp 200");
    expect([wrongAs.stepIndex, last(wrongAs).feedback]).toEqual([2, CLI_FEEDBACK.done]);   // navigation-class: enters the mode, but it is not the asked AS → the step does not advance
  });
  it("PDF 255 guided Port Security starts inside f0/1 and ends with violation shutdown; PDF 256 task completes only with both lines, the secret and the encryption", () => {
    const g = exOf("m28-l06-p02-sim");
    expect([g.startMode, g.startInterface]).toEqual(["interface", "f0/1"]);
    let s = drive(g, "switchport port-security");   // before switchport mode access → retry (the line executes, the step is not the asked one)
    expect([s.stepIndex, last(s).feedback]).toEqual([0, CLI_FEEDBACK.retry]);
    s = ["switchport mode access", "switchport port-security", "switchport port-security maximum 2", "switchport port-security mac-address sticky", "switchport port-security violation shutdown"].reduce((acc, l) => submitCommand(g, acc, l), s);
    expect([s.completed, s.state.interfaces["f0/1"].portSecurity]).toEqual([true, { enabled: true, maximum: 2, sticky: true, violation: "shutdown" }]);
    const t = exOf("m28-l06-p03-sim");
    const partial = drive(t, "line console 0", "password cisco", "login", "exit", "line vty 0 4", "password cisco", "login", "exit", "enable secret cisco123");
    expect([partial.completed, goalStatus(t, partial.state).filter(x => !x.met).map(x => x.id)]).toEqual([false, ["g-enc"]]);
    const done = submitCommand(t, partial, "service password-encryption");
    expect([done.completed, last(done).feedback]).toEqual([true, t.completion]);
    const noLogin = drive(t, "line console 0", "password cisco", "exit", "line vty 0 4", "password cisco", "login", "exit", "enable secret cisco123", "service password-encryption");
    expect(goalStatus(t, noLogin.state).filter(x => !x.met).map(x => x.id)).toEqual(["g-con-login"]);
  });
  it("PDF 257 ACL task: both lists + both applications complete it; a wrong direction or a wrong port keeps the matching goal open", () => {
    const t = exOf("m28-l06-p04-sim");
    const ok = drive(t, "access-list 10 permit 192.168.1.0 0.0.0.255", "interface g0/0", "ip access-group 10 out", "exit", "access-list 100 permit tcp 192.168.1.0 0.0.0.255 any eq 80", "interface g0/1", "ip access-group 100 in");
    expect([ok.completed, last(ok).feedback]).toEqual([true, t.completion]);
    const wrongDir = drive(t, "access-list 10 permit 192.168.1.0 0.0.0.255", "interface g0/0", "ip access-group 10 in", "exit", "access-list 100 permit tcp 192.168.1.0 0.0.0.255 any eq 80", "interface g0/1", "ip access-group 100 in");
    expect(goalStatus(t, wrongDir.state).filter(x => !x.met).map(x => x.id)).toEqual(["g-std-apply"]);
    const wrongPort = drive(t, "access-list 10 permit 192.168.1.0 0.0.0.255", "interface g0/0", "ip access-group 10 out", "exit", "access-list 100 permit tcp 192.168.1.0 0.0.0.255 any eq 443", "interface g0/1", "ip access-group 100 in");
    expect(goalStatus(t, wrongPort.state).filter(x => !x.met).map(x => x.id)).toEqual(["g-ext"]);
  });
  it("PDF 259 DHCP task: the book's pool + exclusion complete it in either order; a pool under another name or a missing exclusion keeps it open", () => {
    const t = exOf("m28-l07-p02-sim");
    const ok = drive(t, "ip dhcp pool STUDENTS", "network 192.168.10.0 255.255.255.0", "default-router 192.168.10.1", "dns-server 8.8.8.8", "exit", "ip dhcp excluded-address 192.168.10.1 192.168.10.10");
    expect([ok.completed, last(ok).feedback]).toEqual([true, t.completion]);
    const exclFirst = drive(t, "ip dhcp excluded-address 192.168.10.1 192.168.10.10", "ip dhcp pool STUDENTS", "network 192.168.10.0 255.255.255.0", "default-router 192.168.10.1", "dns-server 8.8.8.8");
    expect(exclFirst.completed).toBe(true);
    const otherName = drive(t, "ip dhcp pool LAN", "network 192.168.10.0 255.255.255.0", "default-router 192.168.10.1", "dns-server 8.8.8.8", "exit", "ip dhcp excluded-address 192.168.10.1 192.168.10.10");
    expect([otherName.completed, goalStatus(t, otherName.state).filter(x => !x.met).map(x => x.id)]).toEqual([false, ["g-net", "g-mask", "g-gw", "g-dns"]]);
    const noExcl = drive(t, "ip dhcp pool STUDENTS", "network 192.168.10.0 255.255.255.0", "default-router 192.168.10.1", "dns-server 8.8.8.8");
    expect(goalStatus(t, noExcl.state).filter(x => !x.met).map(x => x.id)).toEqual(["g-excl"]);
  });
  it("PDF 262 show challenge: the preset switch answers show vlan brief (VLAN 10 SALES with f0/1–2) then show vtp status, never changing state; a book command the simulator does not know is refused without state change", () => {
    const c = exOf("m28-l07-p05-sim");
    expect(c.startMode).toBe("privileged");
    let s = submitCommand(c, createSession(c), "show interfaces trunk");
    expect([last(s).status, last(s).feedback, s.stepIndex]).toEqual(["unknown", CLI_FEEDBACK.unknown, 0]);
    const before = s.state;
    s = submitCommand(c, s, "show vlan brief");
    expect([s.stepIndex, last(s).feedback]).toEqual([1, CLI_FEEDBACK.correct]);
    expect(last(s).output!.some(l => /^10\s+SALES\s+active\s+FastEthernet0\/1, FastEthernet0\/2$/.test(l))).toBe(true);
    expect(s.state).toBe(before);
    s = submitCommand(c, s, "show vtp status");
    expect([s.completed, last(s).feedback, last(s).output![0]]).toEqual([true, CLI_FEEDBACK.correct, "VTP Operating Mode : (not set)"]);
    expect(s.state).toBe(before);
  });
  it("hostile input on the summary exercises never throws, never mutates the device beyond valid lines, and typed text never appears in any config", () => {
    for (const e of sims(m28)) {
      const ex = readCliExerciseConfig(e.block.config)!;
      let sess = createSession(ex);
      const start = sess.state;
      for (const h of ["rm -rf /", "$(id)", "<script>alert(1)</script>", "ip route 0.0.0.0 0.0.0.0 10.0.0.2 && reboot", "switchport trunk native vlan 99999", "network 192.168.1.0 0.0.0.255 area", "ip route 10.0.0.0"]) sess = submitCommand(ex, sess, h);
      expect(sess.state, e.block.id).toBe(start);
      expect(sess.completed, e.block.id).toBe(false);
      expect(JSON.stringify(e.block.config), e.block.id).not.toMatch(/script|reboot|rm -rf/);
    }
  });
});

describe("Final summary — publication invariants (publishable, NEVER auto-published) and the m29 unknown-id sentinel", () => {
  it("FRONTEND ↔ SERVER agreement: the server registry lists every manifest module (28) with the same title and order, m28 LAST as {الملخّص الشامل, 28}; identity + title + order only", () => {
    const expected = manifest.modules.filter(m => hasModuleContent("791381", m.id)).map(m => ({ moduleId: m.id, title: m.title, order: m.order })).sort((a, b) => a.order - b.order);
    const s = server().listLearningModules("791381");
    expect(s).toEqual(expected);
    expect(s).toHaveLength(28);
    expect(s.at(-1)).toEqual({ moduleId: M28, title: "الملخّص الشامل", order: 28 });
    expect(s.at(-2)).toEqual({ moduleId: M06, title: "قوائم التحكم ACL", order: 27 });
    for (const m of s) expect(Object.keys(m).sort()).toEqual(["moduleId", "order", "title"]);
    expect(JSON.stringify(s)).not.toMatch(/pages|lessons|blocks|pdf|visibleModuleIds|published|simulation|cli-terminal|config/i);
  });
  it("m28 is publishable on explicit request only: validate([m28]) → [m28]; a mixed list canonicalizes by order with m28 LAST (never by id); m29 is unknown (rejected, absent, no body)", () => {
    expect(server().validateLearningModuleIds("791381", [M28])).toEqual([M28]);
    expect(server().validateLearningModuleIds("791381", [M28, "791381-m25", M06, "791381-m01"])).toEqual(["791381-m01", "791381-m25", M06, M28]);
    expect(server().canonicalizeLearningModuleIds("791381", [M28, " 791381-m01 ", UNKNOWN, "", null])).toEqual(["791381-m01", M28]);
    expect(server().findLearningModule("791381", M28)).toEqual({ moduleId: M28, title: "الملخّص الشامل", order: 28 });
    expect(server().findLearningModule("791381", UNKNOWN)).toBeNull();
    expect(() => server().validateLearningModuleIds("791381", [UNKNOWN])).toThrow();
    expect(() => server().validateLearningModuleIds("791381", [M28, UNKNOWN])).toThrow();
    expect(hasModuleContent("791381", UNKNOWN)).toBe(false);
    expect(manifest.modules.some(m => m.id === UNKNOWN)).toBe(false);
  });
});
