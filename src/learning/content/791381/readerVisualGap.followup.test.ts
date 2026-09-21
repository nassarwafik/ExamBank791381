// Reader follow-up — «Visual Gaps & Interactive Fixes» (site/reader pages 138–156). CONTENT-LEVEL regressions.
//
// The teacher reported SITE (reader) page numbers, which are NOT the PDF numbers. The verified mapping (site → PDF →
// content page) is encoded once in SITE_MAP below and every assertion keys off it, so the test fails loudly if a page's
// source drifts. This file checks the CONTENT wiring: the registry allowlist size and the one NEW visual id, the
// activity-registry entry for the IPv6 practice simulator, that the merged-Batch-7 visuals on the reported pages still
// resolve (one visual per page — no duplicate was added), and the new source-faithful blocks (site 138 diagram, site 142
// upgraded topology id kept, site 147 dropdown worksheet, site 154 simulation). Rendering fidelity lives in the sibling
// readerVisualGap.fidelity.test.tsx.
import { describe, it, expect } from "vitest";
import m04 from "./modules/m04";
import m20 from "./modules/m20";
import m21 from "./modules/m21";
import m22 from "./modules/m22";
import type { ContentModule, ContentPage, VisualBlock, SimulationBlock, PracticeTableBlock, PracticeTableSelectCell } from "../types";
import { REGISTERED_VISUAL_IDS, resolveVisual } from "../../visuals/registry";
import { productionActivityRegistry } from "../../activities/engine";

const pagesOf = (m: ContentModule): ContentPage[] => [...m.lessons].sort((a, b) => a.order - b.order).flatMap(l => [...l.pages].sort((a, b) => a.order - b.order));
const pageByPdf = (m: ContentModule, pdf: number): ContentPage => {
  const p = pagesOf(m).find(pg => pg.source?.pdfPageStart === pdf);
  if (!p) throw new Error(`no page with pdfPageStart=${pdf}`);
  return p;
};
const visualsOf = (p: ContentPage) => p.blocks.filter((b): b is VisualBlock => b.type === "visual");
const sel = (cell: unknown) => cell as PracticeTableSelectCell;

// site (reader page) → PDF page → module + the visual the reader should now see on it.
const SITE_MAP = [
  { site: 146, pdf: 159, module: m20, visualId: "791381/m20/dmz-three-zone" },
  { site: 147, pdf: 160, module: m20, visualId: "791381/m20/wifi-radio-link" },
  { site: 148, pdf: 161, module: m20, visualId: "791381/m20/wireless-network-types" },
  { site: 149, pdf: 162, module: m20, visualId: "791381/m20/ssid-beacon" },
  { site: 150, pdf: 163, module: m20, visualId: "791381/m20/wifi-security" },
  { site: 151, pdf: 164, module: m20, visualId: "791381/m20/wifi-protection-technologies" },
  { site: 152, pdf: 165, module: m20, visualId: "791381/m20/access-point-bridge" },
  { site: 153, pdf: 166, module: m21, visualId: "791381/m21/ipv6-anatomy" },
  { site: 154, pdf: 167, module: m21, visualId: "791381/m21/ipv6-compression" },
  { site: 155, pdf: 168, module: m21, visualId: "791381/m21/well-known-ports" },
  { site: 156, pdf: 169, module: m22, visualId: "791381/m22/dhcp-automatic-config" },
] as const;

describe("Reader follow-up — registry & activity allowlists", () => {
  it("the visual registry holds exactly 122 ids and includes the ONE new follow-up visual (sw6-router-trunk)", () => {
    expect(REGISTERED_VISUAL_IDS.length).toBe(122);
    expect(REGISTERED_VISUAL_IDS).toContain("791381/m04/sw6-router-trunk");
    expect(new Set(REGISTERED_VISUAL_IDS).size).toBe(REGISTERED_VISUAL_IDS.length);   // no duplicate id
  });
  it("the activity registry gains ONLY the ipv6-compress simulator (v1); still fifteen entries", () => {
    expect(productionActivityRegistry.size).toBe(15);
    expect(productionActivityRegistry.has("simulation", "ipv6-compress")).toBe(true);
    expect(productionActivityRegistry.list().filter(e => e.kind === "simulation").map(e => e.key))
      .toEqual(["hub-switch-router-flow", "message-delivery", "cli-terminal", "ipv6-compress"]);
  });
});

describe("Reader follow-up — site 146–154 audit: the reported pages already carry a resolving visual (merged Batch 7), and NO duplicate was added", () => {
  for (const { site, pdf, module, visualId } of SITE_MAP) {
    it(`site ${site} (PDF ${pdf}) shows exactly one visual, «${visualId}», and it resolves in the trusted registry`, () => {
      const page = pageByPdf(module, pdf);
      const vs = visualsOf(page);
      expect(vs).toHaveLength(1);                              // one visual per page — no duplicate enrichment
      expect(vs[0].visualId).toBe(visualId);
      expect(resolveVisual(visualId)).not.toBeNull();          // Teacher-reported missing-image issue is now resolved by merged Batch 7
    });
  }
});

describe("Reader follow-up — site 138 (PDF 150): NEW teacher-requested Sw6 ↔ Router trunk diagram", () => {
  it("m04 PDF 150 gains a visual block wired to the new sw6-router-trunk id (static), before its clarification", () => {
    const page = pageByPdf(m04, 150);
    const vs = visualsOf(page);
    expect(vs.map(v => v.visualId)).toContain("791381/m04/sw6-router-trunk");
    const block = vs.find(v => v.visualId === "791381/m04/sw6-router-trunk")!;
    expect(block.motion).toBe(false);
    expect(block.origin).toBe("teacher-enrichment");
    expect(resolveVisual("791381/m04/sw6-router-trunk")).not.toBeNull();
    // it precedes the existing clarification callout on the same page
    const ids = page.blocks.map(b => b.id);
    expect(ids.indexOf("m04-l01-p05-visual")).toBeLessThan(ids.indexOf("m04-l01-p05-clar"));
  });
});

describe("Reader follow-up — site 142 (PDF 154): the existing sub-interface visual keeps its id (upgraded in place to a topology)", () => {
  it("m04 PDF 154 still points at the SAME id subinterfaces-vlan10-20 (no new id, no duplicate)", () => {
    const page = pageByPdf(m04, 154);
    const vs = visualsOf(page);
    expect(vs).toHaveLength(1);
    expect(vs[0].visualId).toBe("791381/m04/subinterfaces-vlan10-20");
    expect(vs[0].motion).toBe(false);
  });
});

describe("Reader follow-up — site 147 (PDF 160): source-faithful «حسنة أم عيب» dropdown worksheet", () => {
  it("m20 PDF 160 gains a practice-table with the six Wi-Fi traits, each a select of حسنة/عيب, keyed to the book's two lines", () => {
    const page = pageByPdf(m20, 160);
    const table = page.blocks.find(b => b.id === "m20-l01-p02-classify") as PracticeTableBlock | undefined;
    expect(table, "the classify worksheet exists").toBeTruthy();
    expect(table!.type).toBe("practice-table");
    expect(table!.origin).toBe("teacher-enrichment");
    expect(table!.columnDirs).toBeDefined();
    const pairs = table!.rows.map(r => [r[0], sel(r[1]).key]);
    expect(pairs).toEqual([
      ["سهولة الاستخدام", "حسنة"],
      ["المرونة", "حسنة"],
      ["ربط عدة أجهزة", "حسنة"],
      ["المدى محدود", "عيب"],
      ["التأثر بالتداخل", "عيب"],
      ["ضعف الأمان", "عيب"],
    ]);
    for (const r of table!.rows) expect(sel(r[1]).options).toEqual(["حسنة", "عيب"]);
    // the existing two practice questions are untouched and the page still ENDS with practice
    expect(page.blocks.some(b => b.id === "m20-l01-p02-q1")).toBe(true);
    expect(page.blocks.some(b => b.id === "m20-l01-p02-q2")).toBe(true);
    expect(page.blocks[page.blocks.length - 1].type).toBe("practice");
  });
});

describe("Reader follow-up — site 154 (PDF 167): the IPv6 long→short practice simulator", () => {
  it("m21 PDF 167 gains a simulation (ipv6-compress v1) that carries ONLY the three exact book examples, after the visual/note and before the closing practice", () => {
    const page = pageByPdf(m21, 167);
    const sim = page.blocks.find((b): b is SimulationBlock => b.type === "simulation");
    expect(sim, "the ipv6-compress simulation exists").toBeTruthy();
    expect(sim!.simulationType).toBe("ipv6-compress");
    expect(sim!.version).toBe(1);
    expect(sim!.origin).toBe("teacher-enrichment");
    expect(sim!.capabilities).toEqual({ fullscreen: true, reset: true, interactive: true });
    expect(sim!.fallback?.text).toBeTruthy();
    expect(productionActivityRegistry.resolve(sim!)?.key).toBe("ipv6-compress");
    const examples = (sim!.config as { examples: { long: string; short: string }[] }).examples;
    expect(examples).toEqual([
      { long: "2001:0db8:0000:0000:0000:ff00:0042:8329", short: "2001:db8::ff00:42:8329" },
      { long: "fe80:0000:0000:0000:0202:b3ff:fe1e:8329", short: "fe80::202:b3ff:fe1e:8329" },
      { long: "2a00:8640:0000:0000:0200:23ff:fe10:8329", short: "2a00:8640::200:23ff:fe10:8329" },
    ]);
    // placement: after the visual + note, before the closing practice; the page still ends with practice
    const ids = page.blocks.map(b => b.id);
    expect(ids.indexOf("m21-l01-p02-note")).toBeLessThan(ids.indexOf("m21-l01-p02-sim"));
    expect(ids.indexOf("m21-l01-p02-sim")).toBeLessThan(ids.indexOf("m21-l01-p02-q1"));
    expect(page.blocks[page.blocks.length - 1].type).toBe("practice");
  });
});

describe("Reader follow-up — site 155/156 keep their existing (upgraded) visuals wired", () => {
  it("site 155 (PDF 168) → well-known-ports and site 156 (PDF 169) → dhcp-automatic-config both still resolve", () => {
    expect(visualsOf(pageByPdf(m21, 168)).map(v => v.visualId)).toContain("791381/m21/well-known-ports");
    expect(visualsOf(pageByPdf(m22, 169)).map(v => v.visualId)).toContain("791381/m22/dhcp-automatic-config");
    expect(resolveVisual("791381/m21/well-known-ports")).not.toBeNull();
    expect(resolveVisual("791381/m22/dhcp-automatic-config")).not.toBeNull();
  });
});
