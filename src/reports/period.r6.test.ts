// Reports R-6 — the client's wording of the period basis (docs/enterprise-reports-period-r6.md §4). The server decides what the
// dates of an assessment report are and says so in `periodBasis`; the client only words it. Pinned: the sentence, the Arabic
// counted forms, and that anything this client does not know — an absent basis, another criterion, a malformed count — is
// never worded as «تاريخ النشر» nor as a number of its own.
import { describe, it, expect } from "vitest";
import { periodBasisOf, periodBasisText, periodBasisMeta } from "./period";
import { classExport, studentExport, assignmentsExport, exportRows } from "./reportExport";

describe("R-6 periodBasisOf — only what the server said, and only a criterion this client knows", () => {
  it("the publication criterion with its count", () => {
    expect(periodBasisOf({ criterion: "publishedAt", byCreation: 0 })).toEqual({ criterion: "publishedAt", byCreation: 0 });
    expect(periodBasisOf({ criterion: "publishedAt", byCreation: 3 })).toEqual({ criterion: "publishedAt", byCreation: 3 });
  });
  it("absent, null, not an object, or another criterion → null (nothing is said)", () => {
    for (const v of [undefined, null, "", "publishedAt", 7, [], {}, { byCreation: 2 }, { criterion: "createdAt", byCreation: 0 }, { criterion: "dueAt", byCreation: 1 }, { criterion: "PublishedAt" }])
      expect(periodBasisOf(v), JSON.stringify(v)).toBeNull();
  });
  it("a count that is not a positive whole number reads as none — never a number of its own", () => {
    for (const n of [undefined, null, "3", -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, {}])
      expect(periodBasisOf({ criterion: "publishedAt", byCreation: n })).toEqual({ criterion: "publishedAt", byCreation: 0 });
  });
});

describe("R-6 the sentence", () => {
  const BASE = "الفترة وتواريخ التقييمات وترتيبها بحسب تاريخ نشر التقييم.";
  it("names the criterion; says nothing more when every assessment has a publication date", () => {
    expect(periodBasisText({ criterion: "publishedAt", byCreation: 0 })).toBe(BASE);
  });
  it("counts the assessments dated by creation in the Arabic counted forms (Western digits)", () => {
    const tail = (n: number) => periodBasisText({ criterion: "publishedAt", byCreation: n }).slice(BASE.length + 1);
    expect(tail(1)).toBe("تقييم واحد هنا نُشر قبل بدء تسجيل تاريخ النشر، فتاريخه تاريخ إنشائه.");
    expect(tail(2)).toBe("تقييمان هنا نُشرا قبل بدء تسجيل تاريخ النشر، فتاريخهما تاريخ إنشائهما.");
    expect(tail(3)).toBe("3 تقييمات هنا نُشرت قبل بدء تسجيل تاريخ النشر، فتاريخها تاريخ إنشائها.");
    expect(tail(10)).toBe("10 تقييمات هنا نُشرت قبل بدء تسجيل تاريخ النشر، فتاريخها تاريخ إنشائها.");
    expect(tail(11)).toBe("11 تقييمًا هنا نُشرت قبل بدء تسجيل تاريخ النشر، فتاريخها تاريخ إنشائها.");
  });
  it("the export cell says the same in one cell", () => {
    expect(periodBasisMeta({ criterion: "publishedAt", byCreation: 0 })).toBe("تاريخ نشر التقييم");
    expect(periodBasisMeta({ criterion: "publishedAt", byCreation: 2 })).toBe("تاريخ نشر التقييم (تقييمان هنا نُشرا قبل بدء تسجيل تاريخ النشر، فتاريخهما تاريخ إنشائهما)");
  });
});

describe("R-6 the exports name the criterion in their identity — only when the server named it", () => {
  const ctx = { schoolYear: "2025-2026", from: "2026-03-08", to: "2026-03-14" };
  const meta = (r: { meta: [string, string][] }) => Object.fromEntries(r.meta);
  const cls = (over: object = {}) => ({ class: { name: "الحادي عشر", schoolYear: "2025-2026", status: "active", studentCount: 2 }, kpis: { assignments: 1, averageScore: 80, submissionRate: 100 }, insights: null, projects: [], ...over });
  const stu = (over: object = {}) => ({ student: { displayName: "زيد", className: "الحادي عشر", schoolYear: "2025-2026" }, academic: { average: 80, submittedCount: 1, assessmentCount: 1, submissionRate: 100 }, insights: null, projects: [], ...over });
  const asg = (over: object = {}) => ({ class: { name: "الحادي عشر" }, students: [], overall: { assessmentCount: 0, participants: 0, average: null, submissionRate: 0, distribution: {} }, perAssignment: [], matrix: [], ...over });
  const BASIS = { criterion: "publishedAt", byCreation: 1 };

  it("class, student and assessments exports: «معيار الفترة» right after «الفترة»", () => {
    for (const r of [classExport(cls({ periodBasis: BASIS }), ctx), studentExport(stu({ periodBasis: BASIS }), ctx), assignmentsExport(asg({ periodBasis: BASIS }), ctx)]) {
      const keys = r.meta.map(m => m[0]);
      expect(keys[keys.indexOf("الفترة") + 1]).toBe("معيار الفترة");
      expect(meta(r)["معيار الفترة"]).toBe("تاريخ نشر التقييم (تقييم واحد هنا نُشر قبل بدء تسجيل تاريخ النشر، فتاريخه تاريخ إنشائه)");
      expect(exportRows(r, "2026-03-14 10:00").rows.some(row => row[0] === "معيار الفترة" && String(row[1]).startsWith("تاريخ نشر التقييم"))).toBe(true);
    }
  });
  it("no basis in the reply (an older API), or one this client does not know → no such row; the export is as it was", () => {
    for (const basis of [undefined, null, { criterion: "createdAt", byCreation: 0 }]) {
      expect("معيار الفترة" in meta(classExport(cls({ periodBasis: basis }), ctx))).toBe(false);
      expect("معيار الفترة" in meta(studentExport(stu({ periodBasis: basis }), ctx))).toBe(false);
      expect("معيار الفترة" in meta(assignmentsExport(asg({ periodBasis: basis }), ctx))).toBe(false);
    }
    expect(exportRows(classExport(cls({ periodBasis: { criterion: "createdAt" } }), ctx), "T")).toEqual(exportRows(classExport(cls(), ctx), "T"));
  });
  it("the academic part withheld: the criterion of assessments that were not read is not named", () => {
    expect("معيار الفترة" in meta(classExport(cls({ kpis: null, periodBasis: BASIS }), ctx))).toBe(false);
    expect("معيار الفترة" in meta(studentExport(stu({ academic: null, periodBasis: BASIS }), ctx))).toBe(false);
  });
});
