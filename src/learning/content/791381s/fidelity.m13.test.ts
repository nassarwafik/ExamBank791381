// Fidelity fix (owner-approved, docs/enterprise-791381s-enrichment-plan.md §2): booklet PDF p. 39, section 13 «أمان الشبكات»,
// card «SSL/TLS و HTTPS» prints «HTTPS = HTTP + طبقة أمان» (verified on a 150-dpi render of the page). The conversion had the
// two protocol names swapped («HTTP = HTTPS + …»), which teaches the reverse of the booklet. The formula is an LTR span so the
// RTL Reader keeps «HTTPS = HTTP +» in its printed order, followed by «طبقة أمان»; its spaces are no-break spaces so a narrow
// card never splits the formula over two lines (checked in Chromium). Nothing else on the card changes.
import { describe, it, expect } from "vitest";
import { loadBundledModuleContent } from "../bundledModules";
import type { ListBlock } from "../types";

describe("791381s m13 — the HTTPS card reads as the printed booklet", () => {
  it("«HTTPS = HTTP + طبقة أمان», with the formula as one LTR span, and the rest of the card unchanged", async () => {
    const mod = await loadBundledModuleContent("791381s", "791381s-m13");
    const page = mod.lessons.flatMap(l => l.pages).find(p => p.id === "791381s-m13-l01-p02")!;
    const cards = page.blocks.find(b => b.id === "m13-l01-p02-cards") as ListBlock;
    const card = cards.items.find(i => i.id === "m13-l01-p02-c2")!;
    const text = card.text.map(s => s.text).join("").replace(/\u00A0/g, " ");
    expect(text).toBe("SSL/TLS يشفّر الاتصال بين المتصفح والخادم. HTTPS = HTTP + طبقة أمان. علامة القفل 🔒 في المتصفح تعني اتصالًا آمنًا. يمنع التجسّس والتلاعب بالبيانات.");
    expect(text).not.toContain("HTTP = HTTPS");
    expect(card.text.find(s => s.text.startsWith("HTTPS"))).toEqual({ text: "HTTPS\u00A0=\u00A0HTTP\u00A0+", dir: "ltr" });
    expect(card.term).toBe("SSL/TLS و HTTPS");
  });
});
