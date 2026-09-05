import { describe, it, expect } from "vitest";
import { parseBookCatalogIndex } from "./library-catalog-parse.js";

const SAMPLE_HTML = `
<section class="section filter-section" id="foundation">
  <div class="grid">
<article class="card item-card" data-group="foundation" data-search="T01 أساسيات الشبكات">
  <div class="card-head">
    <div class="code training-code">T01</div>
    <div class="head-text">
      <small>تدريب تفاعلي</small>
      <h3>أساسيات الشبكات</h3>
    </div>
  </div>
  <p>تعريف الشبكة، فوائدها، أنواعها الأساسية.</p>
  <div class="info-row">
    <span><b>10</b> سؤالًا</span>
    <span>الصفحات <b>6–11</b></span>
  </div>
  <div class="tags"><span class="tag">أساسيات</span><span class="tag">LAN / WAN</span></div>
  <a class="open-btn training-btn" href="T01.html">فتح T01<span>←</span></a>
</article>

<article class="card exam-card item-card" data-group="final" data-search="F01">
  <div class="code exam-code">F01</div>
  <h3>نموذج A – 2025</h3>
  <p>وصف النموذج.</p>
  <a class="open-btn exam-btn" href="F01.html">فتح F01</a>
</article>
  </div>
</section>
`;

describe("parseBookCatalogIndex", () => {
  it("extracts libraryItemId, category, title, description, questionCount, pageRange, and tags from a .card.item-card article", () => {
    const items = parseBookCatalogIndex(SAMPLE_HTML);
    const t01 = items.find(item => item.libraryItemId === "T01");
    expect(t01).toEqual({
      libraryItemId: "T01",
      category: "foundation",
      title: "أساسيات الشبكات",
      description: "تعريف الشبكة، فوائدها، أنواعها الأساسية.",
      questionCount: 10,
      pageRange: "6–11",
      tags: ["أساسيات", "LAN / WAN"]
    });
  });

  it("also matches an exam-card (F-series) article, carrying its title/category", () => {
    const items = parseBookCatalogIndex(SAMPLE_HTML);
    const f01 = items.find(item => item.libraryItemId === "F01");
    expect(f01).toBeDefined();
    expect(f01.category).toBe("final");
    expect(f01.title).toBe("نموذج A – 2025");
  });

  it("returns an empty array when there are no matching articles at all", () => {
    expect(parseBookCatalogIndex("<html><body>no cards here</body></html>")).toEqual([]);
  });

  it("decodes HTML entities and collapses whitespace in extracted text", () => {
    const html = `<article class="card item-card" data-group="foundation">
      <div class="card-head">
        <div class="code">T02</div>
        <div class="head-text">
          <small>تدريب تفاعلي</small>
          <h3>Class A &amp; B</h3>
        </div>
      </div>
      <p>وصف   يحتوي\n   مسافات متعددة.</p>
      <div class="info-row"><span><b>5</b> سؤالًا</span></div>
      <div class="tags"></div>
    </article>`;
    const items = parseBookCatalogIndex(html);
    expect(items[0].title).toBe("Class A & B");
    expect(items[0].description).toBe("وصف يحتوي مسافات متعددة.");
  });
});
