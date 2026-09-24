import { describe, it, expect } from "vitest";
import { NAV_LABELS, PRIMARY_NAV, activeNavId, breadcrumbFor, pageTitleFor, type TeacherNavState } from "./teacherNav";

// Phase 5C — the «الرسائل» teacher destination lives in the ONE navigation registry (App.tsx still owns teacherView).
const base: TeacherNavState = { teacherView: "messages", workspaceTab: "dashboard", projectCode: "", projectList: [] };

describe("teacher nav — messages destination", () => {
  it("is a labelled primary destination placed right after assignments", () => {
    expect(NAV_LABELS.messages).toBe("الرسائل");
    expect(PRIMARY_NAV.indexOf("messages")).toBe(PRIMARY_NAV.indexOf("assignments") + 1);
  });
  it("resolves as active and drives the breadcrumb / page title", () => {
    expect(activeNavId(base)).toBe("messages");
    expect(breadcrumbFor(base)).toEqual([{ label: "الرسائل" }]);
    expect(pageTitleFor(base)).toBe("الرسائل");
    expect(activeNavId({ ...base, teacherView: "games" })).toBe("games");
  });
});
