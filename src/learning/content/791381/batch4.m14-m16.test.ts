// Batch 4 phase — source-fidelity, mapping, provenance, pedagogy, SOURCE-ORDER and HARD-STOP guards for the book's
// three consecutive sections «البروتوكولات» (PDF 87–92, m14), «أوامر فحص الشبكة» (PDF 93–97, m15) and
// «المجالات والمفاهيم» (PDF 98–105 + the PDF 106 trainings page, m16). PDF 107 is the «الجزء الثاني · أمان الشبكات»
// cover: nothing from PDF 107+ (attacks, VPN, SSL/TLS, Segment/encapsulation, 3-way handshake, switch CLI / VLAN
// programming) is ever converted here.
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
import manifest from "./manifest";
import { hasModuleContent } from "../registry";
import { validateLearningCourseContent } from "../validation";
import { LEARNING_CONTENT_SCHEMA_VERSION, type LearningCourseContent, type ContentBlock, type ContentModule, type ContentPage, type PracticeTableSelectCell } from "../types";
// The SERVER publication registry (CommonJS) — cross-checked here so the frontend and the API can never disagree
// on which modules exist, their titles and their order.
// @ts-expect-error — the server registry is an untyped CommonJS module; it is imported here on purpose to cross-check it.
import * as apiRegistry from "../../../../api/src/lib/learning-materials-registry.js";

const PREV = [m01, m02, m07, m08, m09, m10, m11, m12, m13];
const BATCH = [m14, m15, m16];
const ALL = [...PREV, ...BATCH];
const course: LearningCourseContent = { schemaVersion: LEARNING_CONTENT_SCHEMA_VERSION, courseId: "791381", title: "شبكات الاتصال", direction: "rtl", modules: ALL };
const pagesOf = (m: ContentModule): ContentPage[] => [...m.lessons].sort((a, b) => a.order - b.order).flatMap(l => [...l.pages].sort((a, b) => a.order - b.order));
const pages = BATCH.flatMap(pagesOf);
const pageBy = (id: string): ContentPage => pages.find(p => p.id === id)!;
const blockBy = (p: ContentPage, id: string): ContentBlock => p.blocks.find(b => b.id === id)!;
const plain = (p: ContentPage): string => JSON.stringify(p.blocks);
const sel = (cell: unknown) => cell as PracticeTableSelectCell;
const allBlocks = pages.flatMap(p => p.blocks);
const NEXT_PART_PDF = 107;

const MAP: Record<string, [number, string]> = {
  "791381-m14-l01-p01": [87, "أهم البروتوكولات"], "791381-m14-l01-p02": [88, "DNS / HTTP / DHCP"],
  "791381-m14-l02-p01": [89, "SMTP / FTP / TFTP"], "791381-m14-l02-p02": [90, "SSH / Telnet / NAT"],
  "791381-m14-l03-p01": [91, "HTTPS / POP / IMAP / ICMP / ARP"], "791381-m14-l03-p02": [92, "البروتوكولات ونوع النقل"],
  "791381-m15-l01-p01": [93, "أمر ping"], "791381-m15-l01-p02": [94, "أمر ipconfig"],
  "791381-m15-l02-p01": [95, "أمر tracert"], "791381-m15-l02-p02": [96, "أمر nslookup"], "791381-m15-l02-p03": [97, "أمر arp"],
  "791381-m16-l01-p01": [98, "Collision Domain"], "791381-m16-l01-p02": [99, "كيف يقلّل السويتش التصادم؟"],
  "791381-m16-l02-p01": [100, "Broadcast Domain"], "791381-m16-l02-p02": [101, "Broadcast Domain في Switch و Router"],
  "791381-m16-l03-p01": [102, "بروتوكول STP"], "791381-m16-l03-p02": [103, "Half Duplex / Full Duplex"],
  "791381-m16-l04-p01": [104, "Localhost"], "791381-m16-l04-p02": [105, "APIPA"],
  "791381-m16-l05-p01": [106, "تدريبات مراجعة سريعة"],
};

describe("Batch 4 — validation, mapping PDF 87–106, completeness, HARD STOP before PDF 107", () => {
  it("the WHOLE real course (m01 … m16) produces ZERO validation issues", () => {
    expect(validateLearningCourseContent(course)).toEqual([]);
  });
  it("maps the twenty learner pages 1:1 to PDF 87..106, one page per PDF page, printed page = PDF page (rendered circle), book order across the three modules", () => {
    expect(pages.map(p => p.id).sort()).toEqual(Object.keys(MAP).sort());
    for (const [id, [pdf, title]] of Object.entries(MAP)) {
      const p = pageBy(id);
      expect([p.source.kind, p.source.sourceId, p.source.pdfPageStart, p.source.pdfPageEnd, p.source.printedPage, p.title], id).toEqual(["book", "791381", pdf, undefined, pdf, title]);
    }
    expect(pages.map(p => p.source.pdfPageStart)).toEqual(Array.from({ length: 20 }, (_, i) => 87 + i));
    expect([m14.source, m15.source, m16.source].map(s => [s!.pdfPageStart, s!.pdfPageEnd])).toEqual([[87, 92], [93, 97], [98, 106]]);
    expect(m16.source!.sourceNote).toContain("PDF 106");
    expect(m16.source!.sourceNote).toContain("PDF 107");
  });
  it("the three sections are separate modules with the book's running-header titles, orders 10–12, no invented unit opener, no partial flag", () => {
    expect(BATCH.map(m => [m.id, m.title, m.order, m.partial])).toEqual([["791381-m14", "البروتوكولات", 10, undefined], ["791381-m15", "أوامر فحص الشبكة", 11, undefined], ["791381-m16", "المجالات والمفاهيم", 12, undefined]]);
    expect(allBlocks.some(b => b.type === "unit-opener")).toBe(false);
    expect(BATCH.some(m => m.lessons.some(l => l.id.endsWith("-l00")))).toBe(false);
    expect(JSON.stringify(BATCH)).not.toMatch(/الوحدة (التاسعة|العاشرة|الحادية عشرة|الثانية عشرة)|unitNumber/);
    expect(m14.lessons.map(l => [l.id, l.pages.length])).toEqual([["791381-m14-l01", 2], ["791381-m14-l02", 2], ["791381-m14-l03", 2]]);
    expect(m15.lessons.map(l => [l.id, l.pages.length])).toEqual([["791381-m15-l01", 2], ["791381-m15-l02", 3]]);
    expect(m16.lessons.map(l => [l.id, l.pages.length])).toEqual([["791381-m16-l01", 2], ["791381-m16-l02", 2], ["791381-m16-l03", 2], ["791381-m16-l04", 2], ["791381-m16-l05", 1]]);
  });
  it("HARD STOP: every Batch-4 page < 107; no page in the WHOLE real course reaches PDF 107; every block source stays inside its module's range; the manifest ranges stop at 92 / 97 / 106", () => {
    for (const p of pages) expect(p.source.pdfPageStart, p.id).toBeLessThan(NEXT_PART_PDF);
    expect(Math.max(...pages.map(p => p.source.pdfPageStart))).toBe(106);
    for (const m of ALL) for (const p of m.lessons.flatMap(l => l.pages)) expect(p.source.pdfPageStart, p.id).toBeLessThan(NEXT_PART_PDF);
    for (const m of BATCH) for (const p of pagesOf(m)) for (const b of p.blocks) if (b.source) {
      expect(b.source.pdfPageStart, b.id).toBeGreaterThanOrEqual(m.source!.pdfPageStart);
      expect(b.source.pdfPageEnd ?? b.source.pdfPageStart, b.id).toBeLessThanOrEqual(m.source!.pdfPageEnd!);
    }
    for (const [id, lo, hi] of [["791381-m14", 87, 92], ["791381-m15", 93, 97], ["791381-m16", 98, 106]] as const) {
      const mm = manifest.modules.find(m => m.id === id)!;
      const pdfs = mm.lessons.flatMap(l => l.pages.map(p => p.source!.pdfPageStart));
      expect([Math.min(...pdfs), Math.max(...pdfs)], id).toEqual([lo, hi]);
    }
  });
  it("HARD STOP (content): nothing from PDF 107+ leaks — attacks, secure-communication tools, encapsulation names, the 3-way handshake and switch-CLI / VLAN programming are absent from m14–m16 (semantic patterns, all block fields)", () => {
    const json = JSON.stringify(BATCH);
    const NEXT = /القرصنة|هجوم|هجمات|\bDoS\b|DDoS|Hijack|اختطاف|MitM|الرجل في الوسط|Phishing|Spoofing|تزييف|إغراق|\bVPN\b|\bSSL\b|\bTLS\b|Segment|تجزئة|تغليف|غلاف|Handshake|3-Way|\bSYN\b|\bACK\b|Trunk|Dot1Q|\bVTP\b|Router on a Stick|configure terminal|Switch\(config\)|Switch>|Switch#|\bF0\/\d|\bG0\/\d|\bAccess\b|\benable\b/;
    expect(json).not.toMatch(NEXT);
    // commands the book does NOT print in this section
    expect(json).not.toMatch(/traceroute|netstat|nbtstat|route print|ifconfig|telnet\s+\S+@/);
  });
});

describe("Batch 4 — SOURCE ORDER inside the batch (no concept before the book introduces it)", () => {
  const P = (id: string) => plain(pageBy(id));
  it("m14 introduces protocols page by page: PDF 87 names none, 88 only DNS/HTTP/DHCP, 89 adds SMTP/FTP/TFTP, 90 adds SSH/Telnet/NAT, 91 adds HTTPS/POP/IMAP/ICMP/ARP", () => {
    expect(P("791381-m14-l01-p01")).not.toMatch(/\b(DNS|HTTP|HTTPS|DHCP|SMTP|FTP|TFTP|SSH|Telnet|NAT|POP|IMAP|ICMP|ARP)\b/);
    expect(P("791381-m14-l01-p02")).not.toMatch(/\b(SMTP|FTP|TFTP|SSH|Telnet|NAT|HTTPS|POP|IMAP|ICMP|ARP)\b/);
    expect(P("791381-m14-l02-p01")).not.toMatch(/\b(SSH|Telnet|NAT|HTTPS|POP|IMAP|ICMP|ARP)\b/);
    expect(P("791381-m14-l02-p02")).not.toMatch(/\b(HTTPS|POP|IMAP|ICMP|ARP)\b/);
  });
  it("the ping COMMAND (PDF 93) never appears in m14: `ping` occurs there only as the book's ICMP example on PDF 91; no syntax lines, no ipconfig/tracert/nslookup/arp, no output semantics", () => {
    for (const p of pagesOf(m14)) {
      if (p.source.pdfPageStart !== 91) expect(plain(p), p.id).not.toMatch(/ping/);
      expect(plain(p), p.id).not.toMatch(/ipconfig|tracert|nslookup|arp -a|> ping|ping google|8\.8\.8\.8|زمن الوصول|خطوة بعد خطوة/);
    }
    expect(pagesOf(m14).some(p => p.blocks.some(b => b.type === "code"))).toBe(false);
  });
  it("m15 introduces each command on its own page and never earlier: ipconfig from 94, tracert from 95, nslookup from 96, arp -a from 97; exactly five book code blocks with the book's syntax lines", () => {
    expect(P("791381-m15-l01-p01")).not.toMatch(/ipconfig|tracert|nslookup|arp -a/);
    expect(P("791381-m15-l01-p02")).not.toMatch(/tracert|nslookup|arp -a/);
    expect(P("791381-m15-l02-p01")).not.toMatch(/nslookup|arp -a/);
    expect(P("791381-m15-l02-p02")).not.toMatch(/arp -a/);
    const codes = pagesOf(m15).flatMap(p => p.blocks.filter(b => b.type === "code"));
    expect(codes.map(b => b.type === "code" && [b.origin, b.language, b.code])).toEqual([["book", "cli", "> ping google.com"], ["book", "cli", "> ipconfig /all"], ["book", "cli", "> tracert google.com"], ["book", "cli", "> nslookup google.com"], ["book", "cli", "> arp -a"]]);
    // no invented terminal output, switches or OS context anywhere in m15
    expect(JSON.stringify(m15)).not.toMatch(/Reply from|bytes=|TTL|time=|Request timed out|Pinging|Tracing route|Windows|Linux|macOS|-t\b|-n\b|\/release|\/renew|\/flushdns/);
  });
  it("domains / concepts (PDF 98+) never appear in m14 or m15; inside m16 each concept appears only from its page", () => {
    const DOMAINS = /Collision|مجال تصادم|مجالات التصادم|Broadcast Domain|مجال البث|\bSTP\b|حلقات|Loops|Duplex|Localhost|127\.0\.0\.1|APIPA|169\.254/;
    for (const p of [...pagesOf(m14), ...pagesOf(m15)]) expect(plain(p), p.id).not.toMatch(DOMAINS);
    for (const id of ["791381-m16-l01-p01", "791381-m16-l01-p02"]) expect(P(id), id).not.toMatch(/Broadcast Domain|مجال البث|\bVLAN\b|\bSTP\b|Duplex|Localhost|APIPA|169\.254/);
    for (const id of ["791381-m16-l02-p01", "791381-m16-l02-p02"]) expect(P(id), id).not.toMatch(/\bSTP\b|حلقات|Duplex|Localhost|APIPA|169\.254/);
    expect(P("791381-m16-l03-p01")).not.toMatch(/Duplex|Localhost|APIPA|169\.254/);
    expect(P("791381-m16-l03-p02")).not.toMatch(/Localhost|127\.0\.0\.1|APIPA|169\.254/);
    expect(P("791381-m16-l04-p01")).not.toMatch(/APIPA|169\.254/);
  });
  it("VLAN is named ONLY where PDF 100–101 print it (as a separator of Broadcast domains) and on the PDF 101 explorer — never configured, never in m14/m15", () => {
    const vlanPages = pages.filter(p => /\bVLAN\b/.test(plain(p))).map(p => p.source.pdfPageStart);
    expect(vlanPages).toEqual([100, 101, 106]);   // 106 = the closing review (Broadcast Domain separator question)
    expect(JSON.stringify(BATCH)).not.toMatch(/vlan \d|VLAN \d+ name|switchport|تعريف VLAN|برمجة/);
  });
});

describe("Batch 4 — key source facts as printed", () => {
  it("PDF 87–91: the definition, the three facts, the «تذكّر» rule and every protocol card sentence", () => {
    expect(plain(pageBy("791381-m14-l01-p01"))).toContain("البروتوكول هو قاعدة أو لغة تتفاهم بها الأجهزة.");
    expect(plain(pageBy("791381-m14-l01-p01"))).toContain("احفظ وظيفة البروتوكول مع مثال واحد فقط، لا أكثر.");
    const cardText = (pid: string, bid: string) => { const c = blockBy(pageBy(pid), bid); return c.type === "list" ? c.items.map(i => [i.term, i.text.map(s => s.text).join(""), i.note]) : null; };
    expect(cardText("791381-m14-l01-p02", "m14-l01-p02-cards")).toEqual([["DNS", "يحوّل اسم الموقع إلى عنوان IP.", "من google.com إلى IP"], ["HTTP", "يجلب صفحات الويب من الخادم ويعرضها في المتصفح.", "تصفّح المواقع"], ["DHCP", "يوزّع عناوين IP تلقائيًا على الأجهزة.", "الحاسوب يأخذ IP تلقائيًا"]]);
    expect(cardText("791381-m14-l02-p01", "m14-l02-p01-cards")).toEqual([["SMTP", "يُستخدم لإرسال البريد الإلكتروني بين الخوادم.", "إرسال البريد"], ["FTP", "يُستخدم لنقل الملفات بين جهاز وخادم.", "نقل الملفات"], ["TFTP", "نسخة بسيطة من FTP، تُستعمل كثيرًا مع أجهزة الشبكة.", "نقل ملفات بسيط"]]);
    expect(cardText("791381-m14-l02-p02", "m14-l02-p02-cards")).toEqual([["SSH", "اتصال آمن ومشفّر للتحكم بالأجهزة عن بُعد.", "تحكّم آمن"], ["Telnet", "تحكّم عن بُعد لكنه غير آمن لأنه لا يشفّر البيانات.", "تحكّم غير آمن"], ["NAT", "يحوّل عناوين الشبكة الداخلية إلى عنوان عام للإنترنت.", "من داخلي إلى عام"]]);
    expect(cardText("791381-m14-l03-p01", "m14-l03-p01-cards")).toEqual([["HTTPS", "نسخة آمنة من HTTP تستعمل التشفير.", undefined], ["POP / IMAP", "استلام البريد الإلكتروني من الخادم.", undefined], ["ICMP", "رسائل فحص وأخطاء مثل ping.", undefined], ["ARP", "يربط عنوان IP بعنوان MAC داخل الشبكة.", undefined]]);
    // the book's protocol level: no port numbers anywhere in the batch
    expect(JSON.stringify(BATCH)).not.toMatch(/\b(20|21|22|23|25|53|67|68|69|80|110|143|443)\b\s*(port|منفذ)|منفذ\s*\d{2,3}\b|port \d/);
  });
  it("PDF 92: the transport table exactly (six rows, «UDP غالبًا» for DNS) and «القاعدة»", () => {
    const t = blockBy(pageBy("791381-m14-l03-p02"), "m14-l03-p02-table");
    expect(t.type === "table" && [t.origin, t.headers, t.columnDirs, t.rows]).toEqual(["book", ["البروتوكول", "وظيفته المختصرة", "النقل"], ["ltr", "rtl", "ltr"], [
      ["HTTP / HTTPS", "تصفّح المواقع", "TCP"], ["SMTP / POP / IMAP", "البريد الإلكتروني", "TCP"], ["FTP / SSH / Telnet", "نقل ملفات أو تحكّم عن بُعد", "TCP"],
      ["DNS", "تحويل اسم الموقع إلى IP", "UDP غالبًا"], ["DHCP", "توزيع عناوين IP", "UDP"], ["TFTP", "نقل ملفات بسيط", "UDP"],
    ]]);
    expect(plain(pageBy("791381-m14-l03-p02"))).toContain("للموثوقية (الويب والبريد والملفات)");
  });
  it("PDF 93–97: each command's «الوظيفة» sentence, the ping «تطبيق سريع» / «خطأ شائع» and the repeated «أوامر الشبكة» / «تذكّر» boxes as printed", () => {
    const fn = (id: string, bid: string) => { const b = blockBy(pageBy(id), bid); return b.type === "callout" ? b.spans.map(s => s.text).join("") : ""; };
    expect(fn("791381-m15-l01-p01", "m15-l01-p01-fn")).toBe("يفحص هل يوجد اتصال بين جهازك وجهاز آخر أو موقع، ويعرض أيضًا زمن الوصول.");
    expect(fn("791381-m15-l01-p02", "m15-l01-p02-fn")).toBe("يعرض إعدادات الشبكة في جهازك: عنوان IP، قناع الشبكة، البوابة الافتراضية، و MAC Address.");
    expect(fn("791381-m15-l02-p01", "m15-l02-p01-fn")).toBe("يعرض الطريق الذي تسلكه الرسالة حتى تصل إلى الموقع، خطوة بعد خطوة.");
    expect(fn("791381-m15-l02-p02", "m15-l02-p02-fn")).toBe("يفحص خدمة DNS ويعرض عنوان IP المرتبط باسم الموقع.");
    expect(fn("791381-m15-l02-p03", "m15-l02-p03-fn")).toBe("يعرض جدولًا فيه عناوين IP وعناوين MAC التي عرفها الجهاز مؤخرًا.");
    expect(fn("791381-m15-l01-p01", "m15-l01-p01-mistake")).toBe("نجاح ping لا يعني أن كل الخدمات تعمل؛ يعني فقط أن الجهازين متّصلان على مستوى الشبكة.");
    expect(fn("791381-m15-l01-p01", "m15-l01-p01-try")).toBe("نفّذ ping 8.8.8.8 ثم ping 10.255.255.1. أيّهما يصل؟ ولماذا؟");
    for (const id of ["791381-m15-l01-p02", "791381-m15-l02-p01", "791381-m15-l02-p02", "791381-m15-l02-p03"]) {
      expect(plain(pageBy(id)), id).toContain("أوامر تساعدنا في فحص الشبكة ومعرفة الخلل وتحديد مكانه.");
      expect(plain(pageBy(id)), id).toContain("احفظ وظيفة الأمر أكثر من حفظ النص الطويل.");
    }
  });
  it("PDF 98–105: definitions, facts, the PDF 101 table, the Duplex cards, Localhost / APIPA lines as printed", () => {
    expect(plain(pageBy("791381-m16-l01-p01"))).toContain("منطقة يمكن أن يحدث فيها تصادم بين الرسائل.");
    expect(plain(pageBy("791381-m16-l01-p01"))).toContain("كل منفذ في السويتش = ");
    expect(plain(pageBy("791381-m16-l01-p02"))).toContain("هذا يحسّن سرعة الشبكة ويقلّل التداخل بين الرسائل.");
    expect(plain(pageBy("791381-m16-l02-p01"))).toContain("تُستخدم لاكتشاف الأجهزة والخدمات.");
    const t = blockBy(pageBy("791381-m16-l02-p02"), "m16-l02-p02-table");
    expect(t.type === "table" && [t.origin, t.rows]).toEqual(["book", [
      ["Switch", "كل المنافذ غالبًا ضمن Broadcast Domain واحد", "البرودكاست ينتشر داخل السويتش"],
      ["Router", "كل منفذ في الراوتر Broadcast Domain مستقل", "الراوتر يوقف البرودكاست بين الشبكات"],
      ["VLAN", "كل VLAN تعتبر Broadcast Domain منفصل", "تفصل الأقسام عن بعضها"],
    ]]);
    expect(plain(pageBy("791381-m16-l03-p01"))).toContain("يعطّل الروابط الزائدة مؤقّتًا.");
    const d = blockBy(pageBy("791381-m16-l03-p02"), "m16-l03-p02-cards");
    expect(d.type === "list" && d.items.map(i => [i.term, i.note])).toEqual([["Half Duplex", "اتجاه واحد في كل مرة"], ["Full Duplex", "اتجاهان في نفس الوقت"]]);
    expect(plain(pageBy("791381-m16-l04-p01"))).toContain("127.0.0.1");
    expect(plain(pageBy("791381-m16-l04-p02"))).toContain("169.254.x.x");
    expect(plain(pageBy("791381-m16-l04-p02"))).toContain("فغالبًا هناك مشكلة في ");
  });
  it("PDF 106 is a learner-visible CLOSING page: the three training cards + the QR note as printed, a conversionNote, NO library-training block (trainings 5–12 are not delivered in the platform), then the section review", () => {
    const p = pageBy("791381-m16-l05-p01");
    expect(p.conversionNote).toMatch(/PDF 106/);
    expect(p.conversionNote).toMatch(/QR/);
    const c = blockBy(p, "m16-l05-p01-cards");
    expect(c.type === "list" && [c.origin, c.items.map(i => [i.term, i.text.map(s => s.text).join("")])]).toEqual(["book", [["تدريب 5–6", "IP، Subnet، وفحص الاتصال."], ["تدريب 7–8", "أوامر الشبكة والبروتوكولات."], ["تدريب 9–12", "OSI، TCP/UDP، ومفاهيم Broadcast."]]]);
    expect(plain(p)).toContain("امسح رمز كل تدريب لحلّه إلكترونيًا مع التفسير الفوري ومراجعة الأخطاء.");
    expect(allBlocks.some(b => b.type === "library-training")).toBe(false);
    expect(JSON.stringify(BATCH)).not.toMatch(/T0[5-9]|T1[0-2]|trainingId/);
    expect(p.blocks.map(b => b.id).slice(-4)).toEqual(["m16-l05-p01-review", "m16-l05-p01-r1", "m16-l05-p01-r2", "m16-l05-p01-r3"]);
  });
});

describe("Batch 4 — the ONE activity: interactive-diagram/network-domains/v1 on PDF 101, after both domain kinds and the Switch / Router / VLAN table", () => {
  const acts = allBlocks.filter(b => ["simulation", "animation", "guided", "interactive-diagram"].includes(b.type));
  it("exactly one activity block across the three modules; enrichment origin; source PDF 101 (printed 101)", () => {
    expect(acts.map(b => [b.id, b.type])).toEqual([["m16-l02-p02-explorer", "interactive-diagram"]]);
    const a = acts[0];
    expect(a.type === "interactive-diagram" && [a.interactionType, a.version, a.origin, a.source?.pdfPageStart, a.source?.printedPage, a.capabilities]).toEqual(["network-domains", 1, "teacher-enrichment", 101, 101, { fullscreen: true, reset: true, interactive: true }]);
  });
  it("sits AFTER the PDF 101 table and «الخلاصة», BEFORE the page's practices; no activity on PDF 98–100", () => {
    const idx = pageBy("791381-m16-l02-p02").blocks.map(b => b.id);
    const at = idx.indexOf("m16-l02-p02-explorer");
    for (const before of ["m16-l02-p02-table", "m16-l02-p02-summary"]) expect(idx.indexOf(before), before).toBeLessThan(at);
    for (const after of ["m16-l02-p02-q1", "m16-l02-p02-q2"]) expect(idx.indexOf(after), after).toBeGreaterThan(at);
    for (const id of ["791381-m16-l01-p01", "791381-m16-l01-p02", "791381-m16-l02-p01"]) expect(pageBy(id).blocks.some(b => b.type === "interactive-diagram"), id).toBe(false);
  });
  it("config = the four book networks with counts derived from the book's rules (Hub 1/1, Switch 4/1, Router 6/2, VLAN 4/2) and the book's reason sentences; the fallback states the same numbers", () => {
    const a = acts[0] as { config?: { scenarios: { id: string; collision: number; broadcast: number; collisionNote: string; broadcastNote: string }[] }; fallback?: { text?: string } };
    expect(a.config!.scenarios.map(s => [s.id, s.collision, s.broadcast])).toEqual([["hub", 1, 1], ["switch", 4, 1], ["router", 6, 2], ["vlan", 4, 2]]);
    expect(a.config!.scenarios[1].collisionNote).toBe("كل منفذ في السويتش = Collision Domain مستقل.");
    expect(a.config!.scenarios[2].broadcastNote).toContain("كل منفذ في الراوتر Broadcast Domain مستقل");
    expect(a.config!.scenarios[3].broadcastNote).toContain("كل VLAN تعتبر Broadcast Domain منفصل");
    for (const n of ["مجال تصادم واحد", "4 مجالات تصادم", "6 مجالات تصادم", "مجالا Broadcast"]) expect(a.fallback?.text, n).toContain(n);
    expect(JSON.stringify(a.config)).not.toMatch(/STP|Duplex|Trunk|Dot1Q|configure/);
  });
});

describe("Batch 4 — pedagogy: worksheets, solved examples, practices with «افحص» feedback, closing reviews", () => {
  const practices = allBlocks.filter(b => b.type === "practice");
  it("43 inline practices (m14 14 · m15 10 · m16 19), interactive kinds only, each with 2 hints, «افحص» incorrect feedback and an explanation; every page ends with practice", () => {
    expect(BATCH.map(m => pagesOf(m).flatMap(p => p.blocks.filter(b => b.type === "practice")).length)).toEqual([14, 10, 19]);
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
    for (const p of pages) expect(p.blocks.at(-1)?.type, p.id).toBe("practice");
    // shortInput answers are single deterministic tokens
    for (const b of practices) if (b.type === "practice" && b.question.kind === "shortInput") expect(String(b.question.answer), b.id).toMatch(/^[A-Za-z0-9.]+$/);
  });
  it("three keyed worksheets: protocol → purpose (PDF 91), protocol → TCP/UDP (PDF 92, the book's table), task → command (PDF 97)", () => {
    const tables = allBlocks.filter(b => b.type === "practice-table");
    expect(tables.map(b => b.id)).toEqual(["m14-l03-p01-match", "m14-l03-p02-match", "m15-l02-p03-match"]);
    const t1 = blockBy(pageBy("791381-m14-l03-p01"), "m14-l03-p01-match");
    expect(t1.type === "practice-table" && t1.rows.map(r => [r[0], sel(r[1]).key])).toEqual([["DNS", "يحوّل اسم الموقع إلى عنوان IP"], ["SSH", "تحكّم آمن ومشفّر عن بُعد"], ["DHCP", "يوزّع عناوين IP تلقائيًا"], ["ARP", "يربط عنوان IP بعنوان MAC"], ["SMTP", "إرسال البريد بين الخوادم"], ["HTTPS", "تصفّح آمن بالتشفير"], ["FTP", "نقل الملفات بين جهاز وخادم"], ["ICMP", "رسائل فحص وأخطاء"]]);
    const t2 = blockBy(pageBy("791381-m14-l03-p02"), "m14-l03-p02-match");
    expect(t2.type === "practice-table" && t2.rows.map(r => [r[0], sel(r[1]).key])).toEqual([["DHCP", "UDP"], ["HTTP / HTTPS", "TCP"], ["TFTP", "UDP"], ["SMTP / POP / IMAP", "TCP"], ["DNS", "UDP"], ["FTP / SSH / Telnet", "TCP"]]);
    const t3 = blockBy(pageBy("791381-m15-l02-p03"), "m15-l02-p03-match");
    expect(t3.type === "practice-table" && t3.rows.map(r => sel(r[1]).key)).toEqual(["ipconfig", "ping", "arp", "nslookup", "tracert"]);
    expect(t3.type === "practice-table" && t3.rows.every(r => JSON.stringify(sel(r[1]).options) === JSON.stringify(["ping", "ipconfig", "tracert", "nslookup", "arp"]))).toBe(true);
  });
  it("six solved examples and nine clarifications, all enrichment; three closing reviews (r1–r3) — one per module, last on the module's last page", () => {
    expect(allBlocks.filter(b => b.type === "example").map(b => [b.id, b.type === "example" && b.mode, b.origin])).toEqual([
      ["m14-l01-p02-ex1", "solved", "teacher-enrichment"], ["m14-l03-p02-ex1", "solved", "teacher-enrichment"], ["m15-l01-p01-ex1", "solved", "teacher-enrichment"],
      ["m15-l02-p03-ex1", "solved", "teacher-enrichment"], ["m16-l01-p01-ex1", "solved", "teacher-enrichment"], ["m16-l04-p02-ex1", "solved", "teacher-enrichment"],
    ]);
    expect(allBlocks.filter(b => b.type === "callout" && b.kind === "clarification").length).toBe(9);
    for (const m of BATCH) {
      const last = pagesOf(m).at(-1)!;
      expect(last.blocks.map(b => b.id).slice(-4).map(id => id.replace(/^m1\d-l\d\d-p\d\d-/, "")), m.id).toEqual(["review", "r1", "r2", "r3"]);
      expect(pagesOf(m).flatMap(p => p.blocks).filter(b => /-r\d$/.test(b.id)).length, m.id).toBe(3);
    }
  });
});

describe("Batch 4 — provenance, RTL/LTR, safety, skeletons and registry consistency", () => {
  it("book-derived blocks are origin:book (definitions, facts, cards, tables, code lines, «تذكّر» boxes); every practice/example/worksheet/activity/clarification/heading is enrichment", () => {
    for (const b of allBlocks) {
      if (["practice", "practice-table", "example", "interactive-diagram", "heading"].includes(b.type) || (b.type === "callout" && b.kind === "clarification")) expect(b.origin, b.id).toBe("teacher-enrichment");
      else expect(b.origin, b.id).toBe("book");
    }
    expect(BATCH.map(m => pagesOf(m).flatMap(p => p.blocks).filter(b => b.origin === "book").length)).toEqual([13, 20, 27]);
  });
  it("technical tokens are LTR spans (protocol names, IP, MAC, VLAN, STP, 127.0.0.1, 169.254.x.x); code lines are LTR CLI; no arrow glyphs, urls, iframes or images anywhere", () => {
    const spans = allBlocks.flatMap(b => b.type === "callout" || b.type === "text" ? b.spans : b.type === "list" ? b.items.flatMap(i => i.text) : []);
    const ltr = spans.filter(s => s.dir === "ltr").map(s => s.text);
    for (const tok of ["IP", "DNS", "HTTP", "DHCP", "FTP", "SSH", "Telnet", "NAT", "HTTPS", "ICMP", "ARP", "TCP", "UDP", "MAC Address", "Hub", "VLAN", "Broadcast", "STP", "Loops", "127.0.0.1", "169.254.x.x", "ping 8.8.8.8", "Collision Domain"]) expect(ltr, tok).toContain(tok);
    for (const s of spans.filter(s => s.dir !== "ltr")) expect(s.text, s.text).not.toMatch(/^(DNS|HTTP|DHCP|SMTP|FTP|TFTP|SSH|Telnet|NAT|HTTPS|ICMP|ARP|TCP|UDP|IP|MAC|VLAN|STP)$/);
    const json = JSON.stringify(BATCH);
    for (const banned of ["<iframe", ".pdf", "http://", "https://", "<script", ".png", ".svg", "←", "→", "⇐", "⇒", "⇢", "⇠"]) expect(json, banned).not.toContain(banned);
  });
  it("ids are prefix-scoped and unique across the batch; m13 and earlier modules keep their ranges (m13 = 76–86)", () => {
    const ids = allBlocks.map(b => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^m1[456]-l0[1-5]-p0[1-3]-/);
    expect(m13.source).toMatchObject({ pdfPageStart: 76, pdfPageEnd: 86 });
    expect(Math.max(...PREV.flatMap(m => m.lessons.flatMap(l => l.pages.map(p => p.source.pdfPageStart))))).toBe(86);
  });
  it("historical m03 / m04 (completed in place by Batches 6 / 7) keep their historical pages' ids, titles and PDF mappings; skeletons m05–m06 are untouched and merely shift after every real module (orders 18–19 since Batch 7)", () => {
    const byId = Object.fromEntries(manifest.modules.map(m => [m.id, m]));
    expect(["791381-m03", "791381-m19", "791381-m04", "791381-m05", "791381-m06"].map(id => byId[id].order)).toEqual([15, 16, 17, 18, 19]);
    expect(byId["791381-m03"].lessons[0].pages.filter(p => /-p0[12]$/.test(p.id)).map(p => [p.id, p.title, p.source!.pdfPageStart, p.source!.printedPage])).toEqual([["791381-m03-l01-p01", "منافذ السويتش", 123, 121], ["791381-m03-l01-p02", "برمجة المنافذ من CLI", 124, 122]]);
    expect(byId["791381-m06"].lessons[0].pages.map(p => [p.id, p.source!.pdfPageStart, p.source!.printedPage])).toEqual([["791381-m06-l01-p01", 227, 225]]);
    expect(["791381-m03", "791381-m19", "791381-m04", "791381-m05", "791381-m06"].map(id => hasModuleContent("791381", id))).toEqual([true, true, true, false, false]);
    expect(manifest.batches!.find(b => b.id === "b3")!.moduleIds.slice(0, 4)).toEqual(["791381-m13", "791381-m14", "791381-m15", "791381-m16"]);
    expect(manifest.batches!.find(b => b.id === "b4")!.moduleIds).toEqual(["791381-m03", "791381-m19", "791381-m04", "791381-m05"]);
  });
  it("FRONTEND ↔ SERVER registry consistency: every manifest module WITH a body is in the server publication registry with the same title and order (and only those); no skeleton (m05–m06) is publishable", () => {
    const withBody = manifest.modules.filter(m => hasModuleContent("791381", m.id)).map(m => ({ moduleId: m.id, title: m.title, order: m.order }));
    const server = (apiRegistry as unknown as { listLearningModules: (c: string) => { moduleId: string; title: string; order: number }[] }).listLearningModules("791381");
    expect(server).toEqual([...withBody].sort((a, b) => a.order - b.order));
    expect(server.map(m => m.moduleId)).toEqual(expect.arrayContaining(["791381-m14", "791381-m15", "791381-m16"]));
    for (const s of ["791381-m05", "791381-m06"]) expect(server.map(m => m.moduleId)).not.toContain(s);
    for (const m of BATCH) expect(manifest.modules.find(x => x.id === m.id)!.lessons.flatMap(l => l.pages.map(p => p.id)).sort()).toEqual(pagesOf(m).map(p => p.id).sort());
  });
});

describe("Batch 4 — review fixes: enrichment claims stay within what the book states", () => {
  const ex = (pid: string, bid: string) => { const b = blockBy(pageBy(pid), bid); return b.type === "example" ? b : null; };
  it("PDF 88: the book «معًا» block is unchanged; the DHCP/DNS/HTTP example is an explicit one-scenario walk-through (device joined the network first), never a universal chronological order", () => {
    const together = blockBy(pageBy("791381-m14-l01-p02"), "m14-l01-p02-together");
    expect(together.type === "callout" && [together.origin, together.kind, together.title, together.spans.map(s => s.text).join("")]).toEqual(["book", "summary", "معًا", "DNS يجد العنوان، HTTP يجلب الصفحة، و DHCP يمنح الجهاز عنوانه — أساس تصفّح الإنترنت."]);
    const e = ex("791381-m14-l01-p02", "m14-l01-p02-ex1")!;
    expect(e.origin).toBe("teacher-enrichment");
    expect(e.prompt).toMatch(/وصل جهازه بالشبكة/);
    expect(e.prompt).toMatch(/حصل على إعداداته تلقائيًا/);
    expect(e.steps[0].text).toMatch(/عند الانضمام إلى الشبكة/);
    expect(e.explanation).toMatch(/موقف واحد/);
    expect(e.explanation).toMatch(/لا يلزم أن يعمل من جديد عند كل فتح صفحة/);
    const all = JSON.stringify(e);
    expect(all).not.toMatch(/ترتيب الحدوث|دائمًا|في كل مرة يفتح|قبل كل شيء/);
  });
  it("PDF 93: the book «تطبيق سريع» is unchanged; the ping example is conditional (قد / يعتمد على الشبكة), keeps 10.255.255.1 as a private address, notes that no reply does not prove the Internet is down, and invents no output", () => {
    const tryBox = blockBy(pageBy("791381-m15-l01-p01"), "m15-l01-p01-try");
    expect(tryBox.type === "callout" && [tryBox.origin, tryBox.title, tryBox.spans.map(s => s.text).join("")]).toEqual(["book", "تطبيق سريع", "نفّذ ping 8.8.8.8 ثم ping 10.255.255.1. أيّهما يصل؟ ولماذا؟"]);
    const e = ex("791381-m15-l01-p01", "m15-l01-p01-ex1")!;
    expect(e.origin).toBe("teacher-enrichment");
    const all = JSON.stringify(e);
    expect(all).not.toMatch(/فسيصل|8\.8\.8\.8 يصل|الأول يصل|متّصلًا بالإنترنت فسيصل|سيرد|يصل \(عبر الإنترنت\)/);
    expect(e.result).toMatch(/قد يردّ/);
    expect(e.result).toMatch(/تعتمد على الشبكة/);
    expect(e.steps[1].text).toMatch(/العناوين الخاصة/);
    expect(e.steps[2].text).toMatch(/لا يثبت أن الإنترنت غير متاح/);
    expect(e.steps[2].text).toMatch(/ICMP/);
    expect(all).not.toMatch(/Reply from|bytes=|TTL|time=|Request timed out|جدار الحماية|firewall/i);
  });
});
