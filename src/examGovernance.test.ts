import { describe, it, expect } from "vitest";
import {
  LIFECYCLE_LABEL, GOVERNANCE_ACTION_LABEL, GOVERNANCE_CONFLICT_MESSAGE, availableGovernanceActions, revisionRoles, shortId,
  type GovernanceManifestView, type GovernanceCapability
} from "./examGovernance";

// Phase 14A — pure frontend governance vocabulary + action availability (display only; the server is the authority).
// Fail-first on 6918ce1 (module absent).

const ALL: GovernanceCapability[] = ["author", "review", "approve", "publish"];
const m = (over: Partial<GovernanceManifestView> = {}): GovernanceManifestView => ({ examId: "e", lifecycleState: "draft", stateVersion: 3, latestRevisionId: "rev-latest-0000", latestRevisionNumber: 4, createdAt: "2026-09-30T10:00:00.000Z", updatedAt: "2026-09-30T10:00:00.000Z", ...over });

describe("14A — lifecycle vocabulary", () => {
  it("clear Arabic state and action labels; publication is never called «اعتماد نهائي»", () => {
    expect(LIFECYCLE_LABEL).toEqual({ draft: "مسودة", "in-review": "قيد المراجعة", approved: "معتمد", published: "منشور" });
    expect(GOVERNANCE_ACTION_LABEL["submit-review"]).toBe("إرسال للمراجعة");
    expect(GOVERNANCE_ACTION_LABEL["return-to-draft"]).toBe("إرجاع إلى المسودة");
    expect(GOVERNANCE_ACTION_LABEL.approve).toBe("اعتماد");
    expect(GOVERNANCE_ACTION_LABEL.publish).toBe("نشر");
    expect(GOVERNANCE_ACTION_LABEL["new-draft"]).toBe("إنشاء نسخة تحرير جديدة");
    expect(Object.values(GOVERNANCE_ACTION_LABEL).some(l => l.includes("اعتماد نهائي"))).toBe(false);
    expect(GOVERNANCE_CONFLICT_MESSAGE).toBe("تغيرت حالة الامتحان في الخادم منذ فتح هذه الصفحة. تم تحديث الحالة؛ راجعها قبل إعادة المحاولة.");
  });
});

describe("14A — availableGovernanceActions (state × capabilities; mirrors the server table, never authority)", () => {
  it("draft: author may create a revision and submit for review; nobody may approve / publish", () => {
    expect(availableGovernanceActions(m(), ALL)).toEqual(["create-revision", "submit-review"]);
    expect(availableGovernanceActions(m(), ["review", "approve", "publish"])).toEqual([]);
  });
  it("in-review: approve needs approve; return-to-draft needs author or review", () => {
    expect(availableGovernanceActions(m({ lifecycleState: "in-review", reviewRevisionId: "rev-latest-0000" }), ALL)).toEqual(["approve", "return-to-draft"]);
    expect(availableGovernanceActions(m({ lifecycleState: "in-review", reviewRevisionId: "rev-latest-0000" }), ["review"])).toEqual(["return-to-draft"]);
    expect(availableGovernanceActions(m({ lifecycleState: "in-review", reviewRevisionId: "rev-latest-0000" }), ["approve"])).toEqual(["approve"]);
    expect(availableGovernanceActions(m({ lifecycleState: "in-review", reviewRevisionId: "rev-latest-0000" }), ["publish"])).toEqual([]);
  });
  it("approved: publish needs publish; return-to-draft needs author or approve — never a direct submit", () => {
    expect(availableGovernanceActions(m({ lifecycleState: "approved", approvedRevisionId: "rev-latest-0000" }), ALL)).toEqual(["publish", "return-to-draft"]);
    expect(availableGovernanceActions(m({ lifecycleState: "approved", approvedRevisionId: "rev-latest-0000" }), ["publish"])).toEqual(["publish"]);
    expect(availableGovernanceActions(m({ lifecycleState: "approved", approvedRevisionId: "rev-latest-0000" }), ["approve"])).toEqual(["return-to-draft"]);
  });
  it("published: only «إنشاء نسخة تحرير جديدة» (new-draft) for an author; the publication itself is never an action target", () => {
    expect(availableGovernanceActions(m({ lifecycleState: "published", publishedRevisionId: "rev-latest-0000" }), ALL)).toEqual(["new-draft"]);
    expect(availableGovernanceActions(m({ lifecycleState: "published", publishedRevisionId: "rev-latest-0000" }), ["publish", "approve", "review"])).toEqual([]);
  });
  it("no manifest (legacy exam): only enable, for an author", () => {
    expect(availableGovernanceActions(null, ALL)).toEqual(["enable"]);
    expect(availableGovernanceActions(null, ["review"])).toEqual([]);
  });
});

describe("14A — revision roles and display helpers", () => {
  it("roles derive from the manifest pointers only (never from labels)", () => {
    const man = m({ lifecycleState: "published", latestRevisionId: "r9", latestRevisionNumber: 9, publishedRevisionId: "r7", approvedRevisionId: undefined });
    expect(revisionRoles(man, "r9")).toEqual(["latest"]);
    expect(revisionRoles(man, "r7")).toEqual(["published"]);
    expect(revisionRoles(m({ lifecycleState: "in-review", latestRevisionId: "r2", reviewRevisionId: "r2" }), "r2")).toEqual(["latest", "review"]);
    expect(revisionRoles(m({ lifecycleState: "approved", latestRevisionId: "r2", reviewRevisionId: "r2", approvedRevisionId: "r2", publishedRevisionId: "r1" }), "r2")).toEqual(["latest", "review", "approved"]);
    expect(revisionRoles(man, "r1")).toEqual([]);
  });
  it("shortId shows a stable prefix of a long id", () => {
    expect(shortId("rev-0123456789abcdef")).toBe("rev-0123");
    expect(shortId("abc")).toBe("abc");
    expect(shortId("")).toBe("");
  });
});
