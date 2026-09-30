import { describe, it, expect } from "vitest";
import { NAV_LABELS, EXAM_BANK_NAV, PRIMARY_NAV, activeNavId, breadcrumbFor, pageTitleFor, type TeacherNavState } from "./teacherNav";

// Phase 14B — the «مراجعات النشر» (Review Inbox) destination lives in the ONE navigation registry as a child of the Exam Bank
// group (App.tsx still owns teacherView). Fail-first on b9e45e8: the destination does not exist.
const base: TeacherNavState = { teacherView: "reviews", workspaceTab: "dashboard", projectCode: "", projectList: [] };

describe("teacher nav — review inbox destination", () => {
  it("is a labelled Exam Bank child placed after import, not a primary destination", () => {
    expect(NAV_LABELS.reviews).toBe("مراجعات النشر");
    expect(EXAM_BANK_NAV.indexOf("reviews")).toBe(EXAM_BANK_NAV.indexOf("import") + 1);
    expect(PRIMARY_NAV).not.toContain("reviews");
  });
  it("resolves as active and drives the breadcrumb (Exam Bank → مراجعات النشر) and the page title", () => {
    expect(activeNavId(base)).toBe("reviews");
    expect(breadcrumbFor(base)).toEqual([{ label: "بنك الامتحانات", navId: "bank" }, { label: "مراجعات النشر" }]);
    expect(pageTitleFor(base)).toBe("مراجعات النشر");
    expect(activeNavId({ ...base, teacherView: "builder" })).toBe("builder");
  });
});
