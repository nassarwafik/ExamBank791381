// @vitest-environment happy-dom
// Phase R-4 — printReport renders several titled sections (the Reports Center's identity + tables), every cell escaped; the
// single-table form the gradebook uses (columns + rows) is unchanged.
import { describe, it, expect } from "vitest";
import { reportHtml } from "./printReport";

describe("R-4 — print document sections", () => {
  it("renders each section's heading and table, escaping every cell", () => {
    const html = reportHtml({ title: "التقييمات والواجبات — الحادي عشر", meta: [["الفترة", "كل الفترة"]], generatedAt: "2026-10-20 09:05", sections: [
      { heading: "ملخص كل تقييم", columns: ["التقييم", "المتوسط (%)"], rows: [["<b>اختبار</b>", 66.7]] },
      { heading: "مصفوفة الطالب × التقييم", columns: ["الطالب", "اختبار"], rows: [["خالد", "بانتظار التصحيح"]] }
    ] });
    expect(html.match(/<table>/g)).toHaveLength(2);
    expect(html).toContain("<h2>ملخص كل تقييم</h2>");
    expect(html).toContain("<h2>مصفوفة الطالب × التقييم</h2>");
    expect(html).toContain("&lt;b&gt;اختبار&lt;/b&gt;");
    expect(html).toContain('<td class="num">66.7</td>');
    expect(html).not.toContain("<b>اختبار</b>");
  });
  it("the gradebook's single-table form renders exactly one table as before", () => {
    const html = reportHtml({ title: "سجل العلامات", meta: [], columns: ["الطالب"], rows: [["سارة"]], generatedAt: "x" });
    expect(html.match(/<table>/g)).toHaveLength(1);
    expect(html).not.toContain("<h2>");
  });
});
