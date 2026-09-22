import { describe, it, expect } from "vitest";
import { NAV_LABELS, PRIMARY_NAV, activeNavId, breadcrumbFor, pageTitleFor, type TeacherNavState } from "./teacherNav";

// Phase 1 adds a `games` teacher destination. These tests pin its presence in the nav registry and that the shell
// derivations (active id, breadcrumb, page title) resolve it — without disturbing the existing destinations.

const base: TeacherNavState = { teacherView: "games", workspaceTab: "dashboard", projectCode: "", projectList: [] };

describe("teacher nav — games destination", () => {
  it("is a labelled primary destination", () => {
    expect(NAV_LABELS.games).toBe("الألعاب التعليمية");
    expect(PRIMARY_NAV).toContain("games");
  });

  it("resolves as active, and drives the breadcrumb / page title when teacherView is games", () => {
    expect(activeNavId(base)).toBe("games");
    expect(breadcrumbFor(base)).toEqual([{ label: "الألعاب التعليمية" }]);
    expect(pageTitleFor(base)).toBe("الألعاب التعليمية");
  });

  it("does not disturb an existing destination (learning still resolves)", () => {
    expect(activeNavId({ ...base, teacherView: "learning" })).toBe("learning");
  });
});
