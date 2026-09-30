import { describe, it, expect } from "vitest";
import {
  availableGovernanceActions, workflowStage, workflowResponsible, WORKFLOW_ACTION_LABEL, DECISION_LABEL, STAGE_LABEL, LIFECYCLE_LABEL,
  type GovernanceManifestView, type ReviewWorkflowView, type GovernanceCapability
} from "./examGovernance";

// Phase 14B — frontend affordance helpers for the Assigned workflow. Fail-first on b9e45e8: the helpers do not exist and the
// 14A `availableGovernanceActions` offers `approve` to any approve-holder and a generic return-to-draft during review.
const w = (over: Partial<ReviewWorkflowView> = {}): ReviewWorkflowView => ({ cycleId: "cyc-1", revisionId: "rev-1", revisionNumber: 3, authorId: "author", reviewerId: "reviewer", approverId: "approver", publisherId: "publisher", submittedAt: "2026-10-05T08:00:00.000Z", submittedBy: "author", reviewStatus: "pending", ...over });
const m = (over: Partial<GovernanceManifestView> = {}): GovernanceManifestView => ({ examId: "ex1", lifecycleState: "in-review", stateVersion: 2, latestRevisionId: "rev-1", latestRevisionNumber: 3, reviewRevisionId: "rev-1", reviewRevisionNumber: 3, createdAt: "", updatedAt: "", reviewWorkflow: w(), ...over });
const ctx = (actorId: string, capabilities: GovernanceCapability[]) => ({ actorId, capabilities, workflowMode: "assigned" as const });

describe("14B — availableGovernanceActions in Assigned mode", () => {
  it("reviewer stage: only the assigned reviewer sees complete-review / request-changes; nobody sees approve or the generic return-to-draft", () => {
    expect(availableGovernanceActions(m(), ["review"], ctx("reviewer", ["review"]))).toEqual(["complete-review", "request-changes"]);
    expect(availableGovernanceActions(m(), ["review", "approve", "publish"], ctx("outsider", ["review", "approve", "publish"]))).toEqual([]);
    expect(availableGovernanceActions(m(), ["approve"], ctx("approver", ["approve"]))).toEqual([]);
    expect(availableGovernanceActions(m(), ["author"], ctx("author", ["author"]))).toEqual(["withdraw-review"]);
    expect(availableGovernanceActions(m(), ["author"], ctx("other-author", ["author"]))).toEqual([]);
  });
  it("approver stage (review completed): only the assigned approver sees approve / reject-approval; the reviewer's actions are gone", () => {
    const done = m({ reviewWorkflow: w({ reviewStatus: "completed", reviewedAt: "2026-10-05T09:00:00.000Z", reviewedBy: "reviewer" }) });
    expect(availableGovernanceActions(done, ["approve"], ctx("approver", ["approve"]))).toEqual(["approve", "reject-approval"]);
    expect(availableGovernanceActions(done, ["review"], ctx("reviewer", ["review"]))).toEqual([]);
    expect(availableGovernanceActions(done, ["approve"], ctx("outsider", ["approve"]))).toEqual([]);
    expect(availableGovernanceActions(done, ["author"], ctx("author", ["author"]))).toEqual(["withdraw-review"]);
  });
  it("publisher stage: only the assigned publisher sees publish / reject-publication; after publication the author may start a new draft", () => {
    const approved = m({ lifecycleState: "approved", approvedRevisionId: "rev-1", approvedRevisionNumber: 3, reviewWorkflow: w({ reviewStatus: "completed" }) });
    expect(availableGovernanceActions(approved, ["publish"], ctx("publisher", ["publish"]))).toEqual(["publish", "reject-publication"]);
    expect(availableGovernanceActions(approved, ["publish"], ctx("outsider", ["publish"]))).toEqual([]);
    expect(availableGovernanceActions(approved, ["author", "approve"], ctx("author", ["author", "approve"]))).toEqual([]);
    const published = m({ lifecycleState: "published", approvedRevisionId: "rev-1", publishedRevisionId: "rev-1", reviewWorkflow: w({ reviewStatus: "completed" }) });
    expect(availableGovernanceActions(published, ["author"], ctx("author", ["author"]))).toEqual(["new-draft"]);
  });
  it("draft in Assigned mode: the author gets create-revision + submit-review (the submit opens the assignment dialog); single-teacher mode keeps the exact 14A table", () => {
    const draft = m({ lifecycleState: "draft", reviewRevisionId: undefined, reviewWorkflow: undefined });
    expect(availableGovernanceActions(draft, ["author"], ctx("author", ["author"]))).toEqual(["create-revision", "submit-review"]);
    const legacyInReview = m({ reviewWorkflow: undefined });
    expect(availableGovernanceActions(legacyInReview, ["author", "review", "approve", "publish"])).toEqual(["approve", "return-to-draft"]);
    expect(availableGovernanceActions(legacyInReview, ["author", "review", "approve", "publish"], { actorId: "t1", capabilities: ["author", "review", "approve", "publish"], workflowMode: "single" })).toEqual(["approve", "return-to-draft"]);
  });
  it("workflowStage / workflowResponsible describe the current stage and who is responsible", () => {
    expect(workflowStage(m())).toBe("review"); expect(workflowResponsible(m())).toBe("reviewerId");
    const done = m({ reviewWorkflow: w({ reviewStatus: "completed" }) });
    expect(workflowStage(done)).toBe("approve"); expect(workflowResponsible(done)).toBe("approverId");
    const approved = m({ lifecycleState: "approved", approvedRevisionId: "rev-1", reviewWorkflow: w({ reviewStatus: "completed" }) });
    expect(workflowStage(approved)).toBe("publish"); expect(workflowResponsible(approved)).toBe("publisherId");
    expect(workflowStage(m({ lifecycleState: "draft", reviewRevisionId: undefined, reviewWorkflow: undefined }))).toBeNull();
    expect(STAGE_LABEL.review).toBe("بانتظار مراجعتي"); expect(STAGE_LABEL.approve).toBe("بانتظار اعتمادي"); expect(STAGE_LABEL.publish).toBe("بانتظار النشر");
    expect(WORKFLOW_ACTION_LABEL["complete-review"]).toBe("إتمام المراجعة"); expect(WORKFLOW_ACTION_LABEL["request-changes"]).toBe("طلب تعديلات");
    expect(WORKFLOW_ACTION_LABEL["reject-approval"]).toBe("رفض الاعتماد وإعادة للمسودة"); expect(WORKFLOW_ACTION_LABEL["reject-publication"]).toBe("إعادة قبل النشر"); expect(WORKFLOW_ACTION_LABEL["withdraw-review"]).toBe("سحب طلب المراجعة");
    expect(DECISION_LABEL["changes-requested"]).toBeTruthy(); expect(LIFECYCLE_LABEL["in-review"]).toBe("قيد المراجعة");
  });
});
