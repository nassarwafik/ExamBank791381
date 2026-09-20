// Batch 8 phase — source-fidelity, mapping, provenance, pedagogy, SOURCE-ORDER and HARD-STOP guards for the book's
// fifth-batch sections «Wi-Fi · الشبكات اللاسلكية» (PDF 159–165, NEW module m20; PDF 158 is the batch cover), «IPv6
// والمنافذ» (PDF 166–168, NEW module m21) and «بروتوكول DHCP» (PDF 169–179, NEW module m22). PDF 180 begins «Port
// Security»: nothing from PDF 180+ is ever converted here. Guards also cover: unique ids, manifest ↔ body ↔ server-
// registry agreement, the untouched m05 / m06 skeletons, navigation m04 → m20 → m21 → m22 → m05, the loaders,
// publishable-not-auto-published, and the three REAL book CLI exercises (simulation / cli-terminal / v1) on the DHCP
// router pages, driven through the simulator with the book's own command lines.
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
import manifest from "./manifest";
import { hasModuleContent, loadModuleContent } from "../registry";
import { nextPage, previousPage, orderedModules, flattenPageRefs } from "../navigation";
import { validateLearningCourseContent } from "../validation";
import { LEARNING_CONTENT_SCHEMA_VERSION, type LearningCourseContent, type ContentBlock, type ContentModule, type ContentPage, type PracticeTableSelectCell, type SimulationBlock } from "../types";
import { productionActivityRegistry } from "../../activities/engine";
import { readCliExerciseConfig } from "../../cli/config";
import { createSession, submitCommand, goalStatus, CLI_FEEDBACK } from "../../cli/exercise";
// @ts-expect-error — the server registry is an untyped CommonJS module; it is imported here on purpose to cross-check it.
import * as apiRegistry from "../../../../api/src/lib/learning-materials-registry.js";

const PREV = [m01, m02, m07, m08, m09, m10, m11, m12, m13, m14, m15, m16, m17, m18, m03, m19, m04];
const BATCH = [m20, m21, m22];
const ALL = [...PREV, ...BATCH];
const course: LearningCourseContent = { schemaVersion: LEARNING_CONTENT_SCHEMA_VERSION, courseId: "791381", title: "شبكات الاتصال", direction: "rtl", modules: ALL };
const pagesOf = (m: ContentModule): ContentPage[] => [...m.lessons].sort((a, b) => a.order - b.order).flatMap(l => [...l.pages].sort((a, b) => a.order - b.order));
const pages = BATCH.flatMap(pagesOf);
const pageBy = (id: string): ContentPage => pages.find(p => p.id === id)!;
const blockBy = (p: ContentPage, id: string): ContentBlock => p.blocks.find(b => b.id === id)!;
const plain = (p: ContentPage): string => JSON.stringify(p.blocks);
const sel = (cell: unknown) => cell as PracticeTableSelectCell;
const allBlocks = pages.flatMap(p => p.blocks);
const M20 = "791381-m20", M21 = "791381-m21", M22 = "791381-m22";
const byId = Object.fromEntries(manifest.modules.map(m => [m.id, m]));
const NEXT_BATCH_PDF = 180;
const server = () => (apiRegistry as unknown as { listLearningModules: (c: string) => { moduleId: string; title: string; order: number }[]; findLearningModule: (c: string, m: string) => unknown; validateLearningModuleIds: (c: string, ids: string[]) => string[] });
const sims = (m: ContentModule) => pagesOf(m).flatMap(p => p.blocks.filter((b): b is SimulationBlock => b.type === "simulation").map(b => ({ page: p, block: b })));

// PDF → [printed page, title, page id]. Every page follows the page circle = PDF index rule.
const MAP: Record<number, [number, string, string]> = {
  159: [159, "DMZ — المنطقة العازلة", M20 + "-l01-p01"], 160: [160, "Wi-Fi — الشبكة اللاسلكية", M20 + "-l01-p02"], 161: [161, "أنواع الشبكات اللاسلكية", M20 + "-l01-p03"],
  162: [162, "SSID — اسم شبكة Wi-Fi", M20 + "-l02-p01"], 163: [163, "أمان الشبكة اللاسلكية", M20 + "-l02-p02"], 164: [164, "تقنيات حماية Wi-Fi", M20 + "-l02-p03"], 165: [165, "Access Point — نقطة الوصول", M20 + "-l02-p04"],
  166: [166, "IPv6 — عنوان الجيل الجديد", M21 + "-l01-p01"], 167: [167, "أمثلة اختصار IPv6", M21 + "-l01-p02"], 168: [168, "Ports — المنافذ المهمة", M21 + "-l01-p03"],
  169: [169, "DHCP — مقدمة", M22 + "-l01-p01"], 170: [170, "مراحل عمل DHCP", M22 + "-l01-p02"], 171: [171, "مثال DHCP على الراوتر", M22 + "-l01-p03"],
  172: [172, "DHCP على الراوتر — الجزء الأول", M22 + "-l02-p01"], 173: [173, "DHCP على الراوتر — الجزء الثاني", M22 + "-l02-p02"], 174: [174, "شرح أوامر DHCP", M22 + "-l02-p03"], 175: [175, "DHCP — ملاحظات مهمة", M22 + "-l02-p04"],
  176: [176, "DHCP عن طريق Server", M22 + "-l03-p01"], 177: [177, "خطوة 1: الدخول للسيرفر", M22 + "-l03-p02"], 178: [178, "خطوة 2: تشغيل DHCP", M22 + "-l03-p03"], 179: [179, "خطوة 3: إدخال التعريفات", M22 + "-l03-p04"],
};

describe("Batch 8 — validation, identities, mapping PDF 159–179, cover PDF 158, HARD STOP before PDF 180", () => {
  it("the WHOLE real course (m01 … m04, m20, m21, m22) produces ZERO validation issues; every module / lesson / page / block id is unique", () => {
    expect(validateLearningCourseContent(course)).toEqual([]);
    const ids = ALL.flatMap(m => [m.id, ...m.lessons.flatMap(l => [l.id, ...l.pages.flatMap(p => [p.id, ...p.blocks.map(b => b.id)])])]);
    expect(new Set(ids).size).toBe(ids.length);
    const refIds = manifest.modules.flatMap(m => [m.id, ...m.lessons.flatMap(l => [l.id, ...l.pages.map(p => p.id)])]);
    expect(new Set(refIds).size).toBe(refIds.length);
  });
  it("m20 / m21 / m22 are NEW stable ids (the next free ones), orders 18 / 19 / 20, with the pinned titles, shortTitles and lesson structure", () => {
    expect([m20.id, m20.title, m20.shortTitle, m20.order, m20.partial]).toEqual([M20, "Wi-Fi والشبكات اللاسلكية", "Wi-Fi", 18, undefined]);
    expect([m21.id, m21.title, m21.shortTitle, m21.order, m21.partial]).toEqual([M21, "IPv6 والمنافذ", "IPv6 والمنافذ", 19, undefined]);
    expect([m22.id, m22.title, m22.shortTitle, m22.order, m22.partial]).toEqual([M22, "بروتوكول DHCP", "DHCP", 20, undefined]);
    expect(m20.lessons.map(l => [l.id, l.title, l.order, l.pages.length])).toEqual([[M20 + "-l01", "DMZ و Wi-Fi", 1, 3], [M20 + "-l02", "SSID وأمان الشبكة اللاسلكية", 2, 4]]);
    expect(m21.lessons.map(l => [l.id, l.title, l.order, l.pages.length])).toEqual([[M21 + "-l01", "IPv6 والمنافذ المهمة", 1, 3]]);
    expect(m22.lessons.map(l => [l.id, l.title, l.order, l.pages.length])).toEqual([[M22 + "-l01", "ما هو DHCP", 1, 3], [M22 + "-l02", "DHCP على الراوتر", 2, 4], [M22 + "-l03", "DHCP عن طريق Server", 3, 4]]);
    for (const [id, title, order] of [[M20, "Wi-Fi والشبكات اللاسلكية", 18], [M21, "IPv6 والمنافذ", 19], [M22, "بروتوكول DHCP", 20]] as const) expect([byId[id].title, byId[id].order], id).toEqual([title, order]);
    expect(manifest.modules.filter(m => /m2[0-2]/.test(m.id)).map(m => m.id)).toEqual([M20, M21, M22]);
    expect(manifest.modules.some(m => /m23|m24/.test(m.id))).toBe(false);
  });
  it("maps the twenty-one learner pages 1:1 to PDF 159..179 in SOURCE ORDER (explicit `order`), with the pinned titles, ids and printed pages; manifest TOC = body", () => {
    expect(pagesOf(m20).map(p => p.source.pdfPageStart)).toEqual([159, 160, 161, 162, 163, 164, 165]);
    expect(pagesOf(m21).map(p => p.source.pdfPageStart)).toEqual([166, 167, 168]);
    expect(pagesOf(m22).map(p => p.source.pdfPageStart)).toEqual(Array.from({ length: 11 }, (_, i) => 169 + i));
    expect(pages).toHaveLength(21);
    for (const p of pages) {
      const [printed, title, id] = MAP[p.source.pdfPageStart];
      expect([p.id, p.title, p.source.kind, p.source.sourceId, p.source.pdfPageEnd, p.source.printedPage, p.conversionNote], String(p.source.pdfPageStart)).toEqual([id, title, "book", "791381", undefined, printed, undefined]);
    }
    for (const m of BATCH) for (const l of m.lessons) {
      const ref = byId[m.id].lessons.find(x => x.id === l.id)!;
      expect([ref.title, ref.order, ref.pages.map(p => [p.id, p.title, p.order, p.source, p.keywords])], l.id).toEqual([l.title, l.order, l.pages.map(p => [p.id, p.title, p.order, p.source, p.keywords])]);
      expect(new Set(l.pages.map(p => p.order)).size, l.id).toBe(l.pages.length);
    }
  });
  it("PDF 158 (the fifth-batch cover) is STRUCTURAL: only m20's coarse source range 158–165 + sourceNote — never a learner page, never an invented unit opener; m21 / m22 ranges 166–168 / 169–179", () => {
    expect([m20.source!.pdfPageStart, m20.source!.pdfPageEnd, m21.source!.pdfPageStart, m21.source!.pdfPageEnd, m22.source!.pdfPageStart, m22.source!.pdfPageEnd]).toEqual([158, 165, 166, 168, 169, 179]);
    for (const [m, tokens] of [[m20, ["PDF 158", "PDF 159", "PDF 165", "PDF 166", "m21"]], [m21, ["PDF 166–168", "PDF 165", "m20", "PDF 169", "m22"]], [m22, ["PDF 169–179", "PDF 168", "m21", "PDF 180"]]] as const) for (const t of tokens) expect(m.source!.sourceNote, m.id).toContain(t);
    expect(flattenPageRefs(manifest).some(p => p.page.source?.pdfPageStart === 158)).toBe(false);
    expect(pages.some(p => p.source.pdfPageStart === 158)).toBe(false);
    expect(allBlocks.some(b => b.type === "unit-opener")).toBe(false);
    expect(BATCH.some(m => m.lessons.some(l => l.id.endsWith("-l00")))).toBe(false);
    for (const m of BATCH) for (const p of pagesOf(m)) for (const b of p.blocks) if (b.source) expect([b.source.pdfPageStart >= m.source!.pdfPageStart, (b.source.pdfPageEnd ?? b.source.pdfPageStart) <= m.source!.pdfPageEnd!], b.id).toEqual([true, true]);
  });
  it("HARD STOP: every Batch-8 page < 180; the maximum pdfPageStart among ALL converted real bodies is 179; the earlier bodies still stop at 157; manifest ranges 159–165 / 166–168 / 169–179", () => {
    for (const p of pages) expect(p.source.pdfPageStart, p.id).toBeLessThan(NEXT_BATCH_PDF);
    expect(Math.max(...ALL.flatMap(m => m.lessons.flatMap(l => l.pages.map(p => p.source.pdfPageStart))))).toBe(179);
    expect(Math.max(...PREV.flatMap(m => m.lessons.flatMap(l => l.pages.map(p => p.source.pdfPageStart))))).toBe(157);
    for (const [id, lo, hi] of [[M20, 159, 165], [M21, 166, 168], [M22, 169, 179]] as const) {
      const starts = byId[id].lessons.flatMap(l => l.pages.map(p => p.source!.pdfPageStart));
      expect([Math.min(...starts), Math.max(...starts)], id).toEqual([lo, hi]);
    }
    // the m05 skeleton (PDF 193–194) and m06 (PDF 227) are NOT reached by this batch
    expect(byId["791381-m05"].lessons[0].pages.map(p => p.source!.pdfPageStart)).toEqual([193, 194]);
    expect(pages.some(p => p.source.pdfPageStart >= 193)).toBe(false);
  });
  it("NO LEAKAGE from PDF 180+ (Port Security, sticky MAC, violation, device passwords, line vty / console, enable secret, password-encryption, banner, the command reference, OSPF / EIGRP / ACL / WAN) in any Batch-8 body or manifest entry", () => {
    const ban = /Port Security|port-security|Sticky|violation|MAC ثابت|line vty|line console|enable secret|enable password|service password-encryption|banner motd|hostname SW1|show running-config|show startup-config|show vlan brief|show ip dhcp pool|كلمات المرور|حماية أجهزة|مرجع أوامر|أوامر الفحص|OSPF|EIGRP|\bACL\b|access-list|\bWAN\b|Console|\bVTY\b/i;
    // lessons + pages + blocks (the module sourceNote names the NEXT section only as the boundary, so it is checked separately)
    for (const m of BATCH) expect(JSON.stringify(m.lessons), m.id).not.toMatch(ban);
    for (const id of [M20, M21, M22]) expect(JSON.stringify(byId[id]), id).not.toMatch(ban);
    expect(m22.source!.sourceNote).toMatch(/PDF 180 تبدأ قسم Port Security/);
    expect(JSON.stringify(BATCH.map(m => ({ ...m, source: undefined })))).not.toMatch(ban);
  });
  it("SOURCE ORDER inside the batch: Wi-Fi pages never mention IPv6 / ports / DHCP; IPv6 pages never mention DHCP / Access Point / WPA; DHCP appears first on PDF 169, DORA on 170, the router commands on 172–173, APIPA on 175, the server steps on 176+", () => {
    expect(JSON.stringify(m20.lessons)).not.toMatch(/IPv6|\bPort\b|HTTP|\bDHCP\b|DORA|APIPA|Hexadecimal/);
    expect(JSON.stringify(m21.lessons)).not.toMatch(/\bDHCP\b|DORA|Access Point|WPA|SSID|DMZ|APIPA/);
    expect(JSON.stringify(m22.lessons)).not.toMatch(/WPA|SSID|DMZ|Hexadecimal|::/);
    const first = (m: ContentModule, re: RegExp) => pagesOf(m).find(p => re.test(plain(p)))?.source.pdfPageStart;
    expect(first(m22, /DORA|Discover/)).toBe(170);
    expect(first(m22, /192\.168\.1\.0\/24/)).toBe(171);
    expect(first(m22, /ip dhcp pool LAN/)).toBe(172);
    expect(first(m22, /default-router|dns-server|excluded-address/)).toBe(173);
    expect(first(m22, /APIPA|169\.254/)).toBe(175);
    expect(first(m22, /Packet Tracer/)).toBe(176);
    expect(first(m22, /Services/)).toBe(177);
    expect(first(m22, /\bOn\b|\bOff\b/)).toBe(178);
    expect(first(m22, /Start IP|Default Gateway|\bAdd\b|\bSave\b/)).toBe(179);
    expect(first(m20, /SSID/)).toBe(162);
    expect(first(m20, /\bWEP\b|\bWPA\b|WPA2|WPA3/)).toBe(164);   // \bWPA\b: WPAN (161) is a different token
    expect(first(m21, /::/)).toBe(167);
    expect(first(m21, /\b443\b|\b53\b/)).toBe(168);
  });
});

describe("Batch 8 — source fidelity (key facts, tables, the DHCP CLI boxes)", () => {
  it("PDF 159 DMZ: definition, the three public services, the visitor rule and «الفكرة»; PDF 165 Access Point definition + «تذكّر»", () => {
    const dmz = pageBy(M20 + "-l01-p01");
    expect(plain(dmz)).toContain("منطقة بين الشبكة الداخلية والإنترنت");
    for (const t of ["Web", "Mail", "DNS", "تحمي الشبكة الداخلية من الوصول المباشر", "خادم الموقع", "خدمات عامة متاحة للناس، والشبكة الداخلية تبقى محمية"]) expect(plain(dmz)).toContain(t);
    const ap = pageBy(M20 + "-l02-p04");
    expect(plain(ap)).toContain("جهاز يربط الأجهزة اللاسلكية بالشبكة");
    expect(plain(ap)).toContain("ليس الإنترنت نفسه، بل نقطة اتصال بالشبكة");
  });
  it("PDF 161 wireless-types table (PAN / WLAN / WPAN / WWAN with the book's ideas and examples) and «احفظ من المثال»; PDF 164 WEP / WPA / WPA2-WPA3 rows", () => {
    const t = blockBy(pageBy(M20 + "-l01-p03"), "m20-l01-p03-table");
    expect(t.type === "table" && [t.headers, t.rows, t.columnDirs]).toEqual([["النوع", "الفكرة", "مثال"], [["PAN", "أجهزة قريبة جدًا", "هاتف وسماعة بلوتوث"], ["WLAN", "شبكة محلية لاسلكية", "بيت أو مدرسة"], ["WPAN", "اتصال شخصي لاسلكي", "Bluetooth / IR"], ["WWAN", "شبكة واسعة لاسلكية", "4G / 5G"]], ["ltr", "rtl", "rtl"]]);
    expect(plain(pageBy(M20 + "-l01-p03"))).toContain("= بيت");
    const w = blockBy(pageBy(M20 + "-l02-p03"), "m20-l02-p03-table");
    expect(w.type === "table" && w.rows.map(r => [r[0], r[2]])).toEqual([["WEP", "ضعيف"], ["WPA", "أفضل من WEP"], ["WPA2 / WPA3", "الأفضل"]]);
    expect(plain(pageBy(M20 + "-l02-p03"))).toContain("لا يُوصى باستخدامه إطلاقًا");
  });
  it("PDF 166–168: 128 / 32 bit, Hexadecimal, the three IPv6 addresses copied exactly, the «::» rule, and the nine-row port table", () => {
    expect(plain(pageBy(M21 + "-l01-p01"))).toContain("IPv6 = 128");
    expect(plain(pageBy(M21 + "-l01-p01"))).toContain("IPv4 = 32");
    const ipv6 = blockBy(pageBy(M21 + "-l01-p02"), "m21-l01-p02-table");
    expect(ipv6.type === "table" && ipv6.rows).toEqual([
      ["2001:0db8:0000:0000:0000:ff00:0042:8329", "2001:db8::ff00:42:8329"],
      ["fe80:0000:0000:0000:0202:b3ff:fe1e:8329", "fe80::202:b3ff:fe1e:8329"],
      ["2a00:8640:0000:0000:0200:23ff:fe10:8329", "2a00:8640::200:23ff:fe10:8329"],
    ]);
    expect(ipv6.type === "table" && ipv6.columnDirs).toEqual(["ltr", "ltr"]);
    expect(plain(pageBy(M21 + "-l01-p02"))).toContain("مرة واحدة فقط");
    const ports = blockBy(pageBy(M21 + "-l01-p03"), "m21-l01-p03-table");
    expect(ports.type === "table" && ports.rows.map(r => r[0] + " " + r[1])).toEqual(["HTTP 80", "HTTPS 443", "SMTP 25", "POP3 110", "IMAP 143", "SSH 22", "FTP 21", "Telnet 23", "DNS 53"]);
    expect(plain(pageBy(M21 + "-l01-p03"))).toContain("المنفذ يساعد الجهاز أن يعرف لأي خدمة وصلت البيانات");
  });
  it("PDF 169–171 DHCP facts, DORA order in prose (no arrow glyph), the router example numbers", () => {
    expect(plain(pageBy(M22 + "-l01-p01"))).toContain("يوزّع إعدادات الشبكة تلقائيًا");
    const dora = plain(pageBy(M22 + "-l01-p02"));
    expect(dora).toContain("Discover");
    expect(dora).toContain("DORA");
    expect(dora).toContain("الطلب يبدأ من الجهاز، والخادم يردّ في كل مرّة");
    expect(dora).not.toMatch(/→|←|➜|⟶/);
    const ex = plain(pageBy(M22 + "-l01-p03"));
    for (const t of ["192.168.1.0/24", "192.168.1.10", "192.168.1.50", "192.168.1.254", "جهاز واحد (الراوتر) يوزّع الإعدادات"]) expect(ex).toContain(t);
  });
  it("PDF 172 / 173 «Cisco CLI» boxes: a `code` block opens each page with the book's exact seven command lines; the annotation tables repeat each line with the book's meaning (LTR command column)", () => {
    const p1 = pageBy(M22 + "-l02-p01"), p2 = pageBy(M22 + "-l02-p02");
    for (const [p, code] of [[p1, "Router(config-if)# ip address 192.168.1.254 255.255.255.0\nRouter(config-if)# no shutdown\nRouter(config)# ip dhcp pool LAN\nRouter(dhcp-config)# network 192.168.1.0 255.255.255.0"], [p2, "Router(dhcp-config)# default-router 192.168.1.254\nRouter(dhcp-config)# dns-server 8.8.8.8\nRouter(config)# ip dhcp excluded-address 192.168.1.1 192.168.1.9"]] as const) {
      const c = p.blocks[0];
      expect([c.type, c.origin, c.type === "code" && c.language, c.type === "code" && c.code], p.id).toEqual(["code", "book", "cli", code]);
      const t = p.blocks[1];
      expect(t.type === "table" && [t.origin, t.columnDirs, t.rows.map(r => r[0])], p.id).toEqual(["book", ["ltr", "rtl"], code.split("\n")]);
      for (const line of code.split("\n")) expect(line).toMatch(/^Router\((config|config-if|dhcp-config)\)# \S/);
    }
    const t1 = p1.blocks[1], t2 = p2.blocks[1];
    expect(t1.type === "table" && t1.rows.map(r => r[1])).toEqual(["عنوان واجهة الراوتر (Gateway)", "لتشغيل الواجهة", "ينشئ مجموعة توزيع", "الشبكة التي سنوزّع منها"]);
    expect(t2.type === "table" && t2.rows.map(r => r[1])).toEqual(["يحدّد Gateway للأجهزة", "يحدّد خادم DNS", "يستثني عناوين من التوزيع"]);
    expect(plain(p2)).toContain("نستثني غالبًا عناوين الراوتر والسيرفرات والطابعات");
  });
  it("PDF 174 command explanations, PDF 175 notes (APIPA 169.254.x.x), PDF 176–179 the server path Services → DHCP, On / Off, Default Gateway / DNS Server / Start IP / Add / Save, DHCP بدل Static", () => {
    const roles = blockBy(pageBy(M22 + "-l02-p03"), "m22-l02-p03-roles");
    expect(roles.type === "list" && roles.items.map(i => i.term)).toEqual(["interface G0/0", "ip address", "network", "default-router و dns-server"]);
    expect(plain(pageBy(M22 + "-l02-p03"))).toContain("لا تحفظ الأوامر فقط، بل افهم وظيفة كل أمر ومتى يُستخدم");
    const notes = plain(pageBy(M22 + "-l02-p04"));
    for (const t of ["العناوين المستثناة لا توزَّع", "يعيد استخدام العناوين غير المستعملة", "APIPA", "169.254.x.x"]) expect(notes).toContain(t);
    expect(plain(pageBy(M22 + "-l03-p01"))).toContain("192.168.10.0/24");
    expect(plain(pageBy(M22 + "-l03-p02"))).toContain("Services");
    expect(plain(pageBy(M22 + "-l03-p03"))).toContain("فلن يحصل الحاسوب على عنوان");
    const last = plain(pageBy(M22 + "-l03-p04"));
    for (const t of ["Default Gateway", "DNS Server", "Start IP", "Add", "Save", "Static"]) expect(last).toContain(t);
  });
});

describe("Batch 8 — the REAL book CLI exercises (simulation / cli-terminal / v1) on PDF 172–174", () => {
  const exercises = sims(m22);
  const GUIDED = ["enable", "configure terminal", "interface g0/0", "ip address 192.168.1.254 255.255.255.0", "no shutdown", "exit", "ip dhcp pool LAN", "network 192.168.1.0 255.255.255.0"];
  const CHALLENGE = ["default-router 192.168.1.254", "dns-server 8.8.8.8", "exit", "ip dhcp excluded-address 192.168.1.1 192.168.1.9"];
  it("exactly THREE exercises, one per router page, in the book's order: guided (PDF 172), challenge (PDF 173), task (PDF 174); all teacher-enrichment, all resolvable by the production registry, none anywhere else in the batch", () => {
    expect(exercises.map(e => [e.page.source.pdfPageStart, e.block.id, e.block.simulationType, e.block.version, e.block.origin])).toEqual([
      [172, "m22-l02-p01-sim", "cli-terminal", 1, "teacher-enrichment"], [173, "m22-l02-p02-sim", "cli-terminal", 1, "teacher-enrichment"], [174, "m22-l02-p03-sim", "cli-terminal", 1, "teacher-enrichment"],
    ]);
    expect(exercises.map(e => readCliExerciseConfig(e.block.config)?.kind)).toEqual(["guided", "challenge", "task"]);
    for (const e of exercises) {
      expect(productionActivityRegistry.resolve(e.block)?.key, e.block.id).toBe("cli-terminal");
      expect(e.block.fallback?.text, e.block.id).toBeTruthy();
      expect(e.block.capabilities, e.block.id).toEqual({ fullscreen: true, reset: true, interactive: true });
    }
    expect(sims(m20).length + sims(m21).length).toBe(0);
    expect(allBlocks.filter(b => b.type === "animation" || b.type === "guided" || b.type === "interactive-diagram")).toHaveLength(0);
  });
  it("the guided example (PDF 172) is completed by the book's own eight lines (with the G0/0 interface from PDF 174) and by common spellings; a wrong-mode line does not advance it", () => {
    const ex = readCliExerciseConfig(exercises[0].block.config)!;
    expect(ex.steps!.map(s => s.hints!.length)).toEqual(Array(8).fill(2));
    let s = createSession(ex);
    expect(s.state.mode).toBe("user");
    s = submitCommand(ex, s, "configure terminal");
    expect([s.stepIndex, s.history.at(-1)!.tone]).toEqual([0, "error"]);
    for (const line of GUIDED) s = submitCommand(ex, s, line);
    expect([s.completed, s.stepIndex]).toEqual([true, 8]);
    expect(s.history.filter(h => h.tone === "success")).toHaveLength(8);
    expect(s.state.interfaces["g0/0"]).toEqual({ shutdown: false, ipAddress: "192.168.1.254", subnetMask: "255.255.255.0" });
    expect(s.state.dhcpPools.LAN).toEqual({ dnsServers: [], network: "192.168.1.0", mask: "255.255.255.0" });
    const alt = ["EN", "conf t", "int GigabitEthernet0/0", "IP ADDRESS 192.168.1.254 255.255.255.0", "no shut", "exit", "ip dhcp pool LAN", "network 192.168.1.0 255.255.255.0"].reduce((acc, l) => submitCommand(ex, acc, l), createSession(ex));
    expect(alt.completed).toBe(true);
    const wrongIf = ["enable", "configure terminal", "interface g0/1", "ip address 192.168.1.254 255.255.255.0"].reduce((acc, l) => submitCommand(ex, acc, l), createSession(ex));
    expect([wrongIf.stepIndex, wrongIf.completed]).toEqual([2, false]);
  });
  it("the challenges (PDF 173) start inside the LAN pool with part one preset, accept only the three book commands, reject wrong values / wrong mode, and never print the answers", () => {
    const ex = readCliExerciseConfig(exercises[1].block.config)!;
    let s = createSession(ex);
    expect([s.state.mode, s.state.selectedPool, s.state.interfaces["g0/0"]?.ipAddress, s.state.dhcpPools.LAN?.network]).toEqual(["dhcp", "LAN", "192.168.1.254", "192.168.1.0"]);
    s = submitCommand(ex, s, "default-router 192.168.1.1");
    expect([s.stepIndex, s.history.at(-1)!.feedback]).toEqual([0, CLI_FEEDBACK.retry]);
    s = submitCommand(ex, s, "network 10.0.0.0 255.0.0.0");
    expect([s.history.at(-1)!.status, s.state.dhcpPools.LAN.network]).toEqual(["not-required", "192.168.1.0"]);
    s = submitCommand(ex, s, "ip dhcp excluded-address 192.168.1.1 192.168.1.9");
    expect(s.history.at(-1)!.status).toBe("wrong-mode");
    for (const line of CHALLENGE) s = submitCommand(ex, s, line);
    expect([s.completed, s.stepIndex]).toEqual([true, 3]);
    expect(s.state.dhcpPools.LAN).toEqual({ dnsServers: ["8.8.8.8"], network: "192.168.1.0", mask: "255.255.255.0", defaultRouter: "192.168.1.254" });
    expect(s.state.dhcpExcluded).toEqual([{ from: "192.168.1.1", to: "192.168.1.9" }]);
    for (const step of ex.steps!) { expect(step.hints).toHaveLength(2); expect(step.hints![0]).not.toMatch(/default-router 192|dns-server 8|excluded-address 192/); expect(step.instruction).not.toMatch(/^(default-router|dns-server|ip dhcp)/); }
  });
  it("the task (PDF 174) completes ONLY when all seven goals hold — a wrong DNS or a shut interface keeps it open; the full book sequence in either part order completes it; reset restores the empty router", () => {
    const ex = readCliExerciseConfig(exercises[2].block.config)!;
    expect(ex.goals!.map(g => g.id)).toEqual(["g1", "g2", "g3", "g4", "g5", "g6", "g7"]);
    expect(ex.hints).toHaveLength(2);
    const drive = (...lines: string[]) => lines.reduce((acc, l) => submitCommand(ex, acc, l), createSession(ex));
    const wrongDns = drive(...GUIDED, "default-router 192.168.1.254", "dns-server 1.1.1.1", "exit", "ip dhcp excluded-address 192.168.1.1 192.168.1.9");
    expect(goalStatus(ex, wrongDns.state).map(g => g.met)).toEqual([true, true, true, true, true, false, true]);
    expect(wrongDns.completed).toBe(false);
    const fixed = submitCommand(ex, submitCommand(ex, wrongDns, "ip dhcp pool LAN"), "dns-server 8.8.8.8");
    expect([fixed.completed, fixed.history.at(-1)!.feedback]).toEqual([true, ex.completion]);
    const noShut = drive("enable", "conf t", "interface g0/0", "ip address 192.168.1.254 255.255.255.0", "exit", "ip dhcp pool LAN", "network 192.168.1.0 255.255.255.0", "default-router 192.168.1.254", "dns-server 8.8.8.8", "exit", "ip dhcp excluded-address 192.168.1.1 192.168.1.9");
    expect([noShut.completed, goalStatus(ex, noShut.state)[2].met]).toEqual([false, false]);
    const partTwoFirst = drive("enable", "conf t", "ip dhcp excluded-address 192.168.1.1 192.168.1.9", "ip dhcp pool LAN", "network 192.168.1.0 255.255.255.0", "default-router 192.168.1.254", "dns-server 8.8.8.8", "exit", "interface g0/0", "ip address 192.168.1.254 255.255.255.0", "no shutdown");
    expect(partTwoFirst.completed).toBe(true);
    expect(createSession(ex).state).toEqual({ device: "router", hostname: "Router", mode: "user", selectedInterfaces: [], interfaces: {}, vlans: {}, dhcpPools: {}, dhcpExcluded: [], vtp: {} });
  });
});

describe("Batch 8 — pedagogy, provenance, direction", () => {
  it("every page ends with a practice; exactly ONE clarification per page; every practice carries 2 hints + «افحص» incorrect feedback + explanation; review heading + r1–r3 on each module's last page", () => {
    for (const p of pages) {
      expect(p.blocks.at(-1)!.type, p.id).toBe("practice");
      expect(p.blocks.filter(b => b.type === "callout" && b.kind === "clarification"), p.id).toHaveLength(1);
      for (const b of p.blocks) if (b.type === "practice") {
        const f = b.question.feedback!;
        expect([f.hints?.length, f.incorrectFeedback?.startsWith("افحص"), Boolean(f.explanation), Boolean(f.correctFeedback)], b.id).toEqual([2, true, true, true]);
      }
    }
    for (const [m, last] of [[m20, M20 + "-l02-p04"], [m21, M21 + "-l01-p03"], [m22, M22 + "-l03-p04"]] as const) {
      const p = pagesOf(m).at(-1)!;
      expect(p.id).toBe(last);
      const rev = p.blocks.findIndex(b => b.id.endsWith("-review"));
      expect(rev, p.id).toBeGreaterThan(0);
      expect(p.blocks.slice(rev + 1).map(b => b.id.slice(-3)), p.id).toEqual(["-r1", "-r2", "-r3"]);
      expect(p.blocks[rev].type === "heading" && p.blocks[rev].text).toBe("مراجعة الوحدة");
    }
  });
  it("counts: 7 / 3 / 11 pages, 14 / 8 / 21 practices, 2 / 1 / 2 worksheets, 7 / 3 / 11 clarifications, 0 / 0 / 2 code blocks, 0 / 0 / 3 simulations; worksheet keys are always one of their options", () => {
    const count = (m: ContentModule, f: (b: ContentBlock) => boolean) => pagesOf(m).flatMap(p => p.blocks).filter(f).length;
    expect(BATCH.map(m => pagesOf(m).length)).toEqual([7, 3, 11]);
    expect(BATCH.map(m => count(m, b => b.type === "practice"))).toEqual([14, 8, 21]);
    expect(BATCH.map(m => count(m, b => b.type === "practice-table"))).toEqual([2, 1, 2]);
    expect(BATCH.map(m => count(m, b => b.type === "callout" && b.kind === "clarification"))).toEqual([7, 3, 11]);
    expect(BATCH.map(m => count(m, b => b.type === "code"))).toEqual([0, 0, 2]);
    expect(BATCH.map(m => count(m, b => b.type === "simulation"))).toEqual([0, 0, 3]);
    for (const b of allBlocks) if (b.type === "practice-table") {
      let selects = 0;
      for (const row of b.rows) for (const cell of row) if (typeof cell !== "string") { selects++; expect(sel(cell).options, b.id).toContain(sel(cell).key); expect(new Set(sel(cell).options).size).toBe(sel(cell).options.length); }
      expect(selects, b.id).toBeGreaterThan(0);
    }
  });
  it("provenance: book blocks are only text / heading-free facts, callouts (non-clarification), tables, lists, code; every practice / practice-table / clarification / simulation is teacher-enrichment; book counts 18 / 6 / 31", () => {
    for (const b of allBlocks) {
      if (b.type === "practice" || b.type === "practice-table" || b.type === "simulation" || (b.type === "callout" && b.kind === "clarification")) expect(b.origin, b.id).toBe("teacher-enrichment");
      if (b.origin === "book") expect(["text", "callout", "table", "list", "code"], b.id).toContain(b.type);
      if (b.type === "heading") expect(b.origin, b.id).toBe("teacher-enrichment");
    }
    expect(BATCH.map(m => pagesOf(m).flatMap(p => p.blocks).filter(b => b.origin === "book").length)).toEqual([18, 6, 31]);
    expect(allBlocks.some(b => b.type === "library-training")).toBe(false);
    expect(JSON.stringify(BATCH)).not.toMatch(/dangerouslySetInnerHTML|<script|javascript:/i);
  });
  it("technical tokens are LTR code spans (never bare in RTL prose); no arrow glyphs anywhere; the IPv6 / port / command tables mark their technical columns LTR", () => {
    const ltr = new Set<string>();
    const walk = (spans: { text: string; dir?: string; style?: string }[]) => { for (const s of spans) if (s.dir === "ltr") ltr.add(s.text); };
    for (const b of allBlocks) {
      if (b.type === "text" || b.type === "callout") walk(b.spans);
      if (b.type === "list") for (const i of b.items) walk(i.text);
    }
    for (const tok of ["DMZ", "Wi-Fi", "SSID", "Access Point", "WEP", "WPA", "WPA2", "WPA3", "WLAN", "WWAN", "WPAN", "Spoofing", "IPv6", "IPv4", "Hexadecimal", "::", "DHCP", "Gateway", "DNS", "Discover", "Offer", "Request", "ACK", "DORA", "192.168.1.254", "192.168.1.0/24", "APIPA", "169.254.x.x", "Packet Tracer", "Services", "On", "Off", "Default Gateway", "Start IP", "Static", "default-router", "dns-server", "Router(config-if)#", "Router(dhcp-config)#"]) expect(ltr, tok).toContain(tok);
    expect(JSON.stringify(BATCH)).not.toMatch(/→|←|➜|⟶|⇒/);
    for (const b of allBlocks) if (b.type === "table" || b.type === "practice-table") expect(b.columnDirs, b.id).toBeDefined();
  });
});

describe("Batch 8 — loaders, navigation, server registry agreement, publication invariants, m05–m06 untouched", () => {
  it("the m20 / m21 / m22 body loaders EXIST and lazily resolve (7 / 3 / 11 pages); m05–m06 still have NO loader", async () => {
    expect([M20, M21, M22].map(id => hasModuleContent("791381", id))).toEqual([true, true, true]);
    const a = await loadModuleContent("791381", M20), b = await loadModuleContent("791381", M21), c = await loadModuleContent("791381", M22);
    expect([a.id, a.order, pagesOf(a).length, b.id, b.order, pagesOf(b).length, c.id, c.order, pagesOf(c).length]).toEqual([M20, 18, 7, M21, 19, 3, M22, 20, 11]);
    expect(["791381-m05", "791381-m06"].map(id => hasModuleContent("791381", id))).toEqual([false, false]);
  });
  it("navigation: m04 → m20 → m21 → m22 → m05; PDF 157 leads to PDF 159; PDF 165 to 166; PDF 168 to 169; after PDF 179 comes the m05 skeleton (PDF 193)", () => {
    expect(orderedModules(manifest).map(m => m.id).slice(16, 22)).toEqual(["791381-m04", M20, M21, M22, "791381-m05", "791381-m06"]);
    expect(nextPage(manifest, "791381-m04-l03-p02")?.id).toBe(M20 + "-l01-p01");
    expect(previousPage(manifest, M20 + "-l01-p01")?.id).toBe("791381-m04-l03-p02");
    expect(nextPage(manifest, M20 + "-l02-p04")?.id).toBe(M21 + "-l01-p01");
    expect(nextPage(manifest, M21 + "-l01-p03")?.id).toBe(M22 + "-l01-p01");
    const walk: number[] = []; let cur = nextPage(manifest, "791381-m04-l03-p02");
    while (cur && /m2[0-2]/.test(cur.id)) { walk.push(cur.source!.pdfPageStart); cur = nextPage(manifest, cur.id); }
    expect(walk).toEqual(Array.from({ length: 21 }, (_, i) => 159 + i));
    expect([cur?.id, cur?.source!.pdfPageStart]).toEqual(["791381-m05-l01-p01", 193]);
  });
  it("FRONTEND ↔ SERVER agreement: every module with a body is in the server publication registry with the same title and order (and only those); m20 = 18, m21 = 19, m22 = 20 at the end; skeletons m05–m06 absent", () => {
    const withBody = manifest.modules.filter(m => hasModuleContent("791381", m.id)).map(m => ({ moduleId: m.id, title: m.title, order: m.order }));
    const s = server().listLearningModules("791381");
    expect(s).toEqual([...withBody].sort((a, b) => a.order - b.order));
    expect(s.slice(-3)).toEqual([{ moduleId: M20, title: "Wi-Fi والشبكات اللاسلكية", order: 18 }, { moduleId: M21, title: "IPv6 والمنافذ", order: 19 }, { moduleId: M22, title: "بروتوكول DHCP", order: 20 }]);
    for (const skel of ["791381-m05", "791381-m06"]) expect(server().findLearningModule("791381", skel)).toBeNull();
  });
  it("PUBLISHABLE but NOT auto-published: the server accepts m20 / m21 / m22 for explicit publication in canonical order; the registry carries identity + title + order only", () => {
    expect(server().validateLearningModuleIds("791381", [M22, M20, "791381-m04", M21])).toEqual(["791381-m04", M20, M21, M22]);
    expect(server().validateLearningModuleIds("791381", [M22])).toEqual([M22]);
    expect(() => server().validateLearningModuleIds("791381", ["791381-m05"])).toThrow();
    expect(JSON.stringify(server().listLearningModules("791381"))).not.toMatch(/pages|lessons|blocks|pdf|visibleModuleIds|published|simulation|cli-terminal|config/i);
    for (const m of server().listLearningModules("791381")) expect(Object.keys(m).sort()).toEqual(["moduleId", "order", "title"]);
  });
  it("m05 and m06 are UNCHANGED (ids, titles, page ids, PDF mappings, no body) apart from their explicit orders 21 / 22; b5 = [m20, m21, m22]; b4 / b6 unchanged; orders 1..22 contiguous; Batch 7 bodies untouched", () => {
    const pagesRef = (id: string) => byId[id].lessons.flatMap(l => l.pages.map(p => [p.id, p.title, p.source!.pdfPageStart, p.source!.printedPage]));
    expect([byId["791381-m05"].title, byId["791381-m05"].order, pagesRef("791381-m05")]).toEqual(["مرجع أوامر Cisco", 21, [["791381-m05-l01-p01", "أوامر أساسية للجهاز", 193, 191], ["791381-m05-l01-p02", "أوامر VLAN و Trunk", 194, 192]]]);
    expect([byId["791381-m06"].title, byId["791381-m06"].order, pagesRef("791381-m06")]).toEqual(["قوائم التحكم ACL", 22, [["791381-m06-l01-p01", "Extended ACL", 227, 225]]]);
    for (const id of ["791381-m05", "791381-m06"]) expect(Object.keys(byId[id]).sort(), id).toEqual(["id", "lessons", "order", "shortTitle", "title"].filter(k => k in byId[id]).sort());
    expect(manifest.batches!.find(b => b.id === "b5")!.moduleIds).toEqual([M20, M21, M22]);
    expect(manifest.batches!.find(b => b.id === "b4")!.moduleIds).toEqual(["791381-m03", "791381-m19", "791381-m04", "791381-m05"]);
    expect(manifest.batches!.find(b => b.id === "b6")!.moduleIds).toEqual(["791381-m06"]);
    expect(manifest.modules.map(m => m.order)).toEqual(Array.from({ length: 22 }, (_, i) => i + 1));
    expect([m19.order, m04.order, pagesOf(m19).length, pagesOf(m04).length, m04.lessons[0].pages.find(p => p.id === "791381-m04-l01-p01")!.source]).toEqual([16, 17, 5, 12, { kind: "book", sourceId: "791381", pdfPageStart: 148, printedPage: 146 }]);
    expect(sims(m19).length + sims(m04).length + sims(m03).length).toBe(0);   // no retroactive CLI exercises in Batches 6–7 (a later PR may add them)
  });
});
