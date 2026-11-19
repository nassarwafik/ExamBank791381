// Class gradebook GB6b — the approvals section's words (approvalsView.ts). PURE: the server decides; these only phrase its answers —
// every refusal reason says what to fix, a change after approval is never hidden, and an unknown change is never «unchanged».
import { describe, it, expect } from "vitest";
import { approvedCategoryIds, driftText, finalApprovalStatus, finalApproved, historyText, issueText, partStatus, reasonOk } from "./approvalsView";
import type { GbGradebook } from "./types";

const GB = (over: Partial<GbGradebook> = {}): GbGradebook => ({
  ok: true, classId: "c1", className: "ص", readOnly: false, withheld: [], warnings: [], schemeStatus: "active", etags: { scheme: "e", entries: "x" }, students: [],
  scheme: { revision: 3, updatedAt: "", categories: [
    { categoryId: "m", title: "الشهري", weight: 30, items: [] },
    { categoryId: "t", title: "الفصل", weight: 70, items: [] }
  ] },
  columns: [{ itemId: "hw", categoryId: "m", weight: 100, source: { kind: "assignment", assignmentId: "a1" }, title: "الوظيفة 1" }],
  rows: [],
  approvals: { revision: 2, parts: { m: { approvedAt: "2026-11-18T10:00:00.000Z", schemeRevision: 3, drift: { structure: false, students: 0 } } }, final: null, history: [] },
  readiness: { parts: { t: { ready: false, issues: [{ code: "PART_INCOMPLETE", message: "x", cells: 4, students: 3 }] } }, final: { ready: false, issues: [{ code: "PARTS_NOT_APPROVED", message: "x", categoryIds: ["t"] }] } },
  ...over
});

describe("GB6b — statuses", () => {
  it("approved / not ready / ready / unknown (an older API offers nothing)", () => {
    expect(partStatus(GB(), "m")).toEqual({ kind: "approved", approvedAt: "2026-11-18T10:00:00.000Z", drift: null });
    expect(partStatus(GB(), "t")).toEqual({ kind: "notReady", reasons: [expect.stringContaining("خانات غير مكتملة: 4 لدى 3")] });
    expect(partStatus(GB({ readiness: { parts: { t: { ready: true, issues: [] } }, final: { ready: true, issues: [] } } }), "t")).toEqual({ kind: "ready" });
    expect(partStatus(GB({ readiness: undefined }), "t")).toEqual({ kind: "unknown" });
    expect(finalApprovalStatus(GB())).toEqual({ kind: "notReady", reasons: ["اعتمد الأجزاء أولًا: «الفصل»."] });
    expect(approvedCategoryIds(GB())).toEqual(new Set(["m"]));
    expect(finalApproved(GB())).toBe(false);
    expect(approvedCategoryIds(GB({ approvals: undefined })).size).toBe(0);
  });
  it("a change after the approval is always said; an unknown one is never «unchanged»", () => {
    expect(driftText({ structure: false, students: 0 })).toBeNull();
    expect(driftText({ structure: false, students: 2 })).toContain("تغيّرت علامات 2 من الطلاب");
    expect(driftText({ structure: true, students: 3 })).toContain("تغيّر المخطط");
    expect(driftText({ structure: false, students: null })).toContain("تعذّر التحقق");
    const drifted = GB({ approvals: { revision: 2, parts: { m: { approvedAt: "2026-11-18T10:00:00.000Z", schemeRevision: 3, drift: { structure: false, students: 1 } } }, final: null, history: [] } });
    expect(partStatus(drifted, "m")).toMatchObject({ kind: "approved", drift: expect.stringContaining("يرى الطلاب العلامات المعتمدة") });
  });
});

describe("GB6b — every refusal reason says what to fix", () => {
  it("unreleased results name the columns; drift and missing parts name the parts; unknown codes keep the server's words", () => {
    const gb = GB();
    expect(issueText(gb, { code: "RESULTS_NOT_RELEASED", message: "", itemIds: ["hw"] })).toBe("نتائج «الوظيفة 1» لم تُنشر للطلاب بعد. انشرها من صفحة الواجب أولًا.");
    expect(issueText(gb, { code: "PART_DRIFT", message: "", categoryIds: ["m"] })).toContain("«الشهري»");
    expect(issueText(gb, { code: "FINAL_INCOMPLETE", message: "", students: 2 })).toContain("2 من الطلاب");
    expect(issueText(gb, { code: "PART_WITHHELD", message: "" })).toContain("مشاريع");
    expect(issueText(gb, { code: "SCHEME_DRAFT", message: "مخطط العلامات مسودة." })).toBe("مخطط العلامات مسودة.");
  });
});

describe("GB6b — history and reason", () => {
  it("a history line says what, which part, when and why", () => {
    const line = historyText(GB(), { action: "part.reopen", categoryId: "m", at: "2026-11-18T10:00:00.000Z", reason: "خطأ في الرصد" });
    expect(line).toMatch(/^إعادة فتح «الشهري» · .+ · السبب: خطأ في الرصد$/);
    expect(historyText(GB(), { action: "final.approve", at: "bad-date" })).toBe("اعتماد العلامة النهائية · bad-date");
  });
  it("a reason is 3..300 characters after trimming", () => {
    expect(reasonOk("  اب ")).toBe(false);
    expect(reasonOk("سبب")).toBe(true);
    expect(reasonOk("x".repeat(300))).toBe(true);
    expect(reasonOk("x".repeat(301))).toBe(false);
  });
});
