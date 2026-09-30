import { describe, it, expect } from "vitest";
import {
  LIFECYCLE_STATES, LEGAL_TRANSITIONS, isLegalTransition, GOVERNANCE_EVENT_TYPES, GOVERNANCE_PREFIX,
  manifestName, revisionName, revisionMetaName, eventName, isSafeExamId, newManifest, validateManifest, transitionEventType
} from "../src/lib/exam-governance-model.js";

// Phase 14A — G3: the server lifecycle state machine is a pure, explicit table. Fail-first on 6918ce1 (module absent).

describe("14A G3 — lifecycle state machine (pure)", () => {
  it("exactly four states and the documented legal transitions, nothing else", () => {
    expect(LIFECYCLE_STATES).toEqual(["draft", "in-review", "approved", "published"]);
    expect(LEGAL_TRANSITIONS).toEqual({
      draft: ["in-review"],
      "in-review": ["draft", "approved"],
      approved: ["draft", "published"],
      published: ["draft"]
    });
    for (const from of LIFECYCLE_STATES) for (const to of LIFECYCLE_STATES) {
      expect(isLegalTransition(from, to)).toBe(LEGAL_TRANSITIONS[from].includes(to));
    }
  });
  it("the forbidden shortcuts are illegal: draft→approved, draft→published, in-review→published, approved→in-review, published→approved/in-review, self loops", () => {
    for (const [f, t] of [["draft", "approved"], ["draft", "published"], ["in-review", "published"], ["approved", "in-review"], ["published", "approved"], ["published", "in-review"], ["draft", "draft"], ["published", "published"]]) {
      expect(isLegalTransition(f, t), f + "→" + t).toBe(false);
    }
    // arbitrary / injected target states are never legal
    expect(isLegalTransition("draft", "final")).toBe(false);
    expect(isLegalTransition("draft", "PUBLISHED")).toBe(false);
    expect(isLegalTransition("nope", "draft")).toBe(false);
    expect(isLegalTransition("draft", undefined)).toBe(false);
  });
  it("event types are the six governance events (+ the five 14B workflow decisions); transition event types derive from the (from,to) pair", () => {
    expect(GOVERNANCE_EVENT_TYPES.slice(0, 6)).toEqual(["governance-enabled", "revision-created", "submitted-for-review", "returned-to-draft", "approved", "published"]);
    expect(GOVERNANCE_EVENT_TYPES.slice(6)).toEqual(["review-completed", "changes-requested", "approval-rejected", "publication-rejected", "review-withdrawn"]);   // 14B
    expect(transitionEventType("draft", "in-review")).toBe("submitted-for-review");
    expect(transitionEventType("in-review", "approved")).toBe("approved");
    expect(transitionEventType("approved", "published")).toBe("published");
    for (const f of ["in-review", "approved", "published"]) expect(transitionEventType(f, "draft")).toBe("returned-to-draft");
    expect(transitionEventType("draft", "published")).toBe(null);
  });
});

describe("14A — server-owned blob namespace", () => {
  it("governance lives in its own namespace, never inside exams/<id>.json", () => {
    expect(GOVERNANCE_PREFIX).toBe("exam-governance/");
    expect(manifestName("EX-1")).toBe("exam-governance/EX-1/manifest.json");
    expect(revisionName("EX-1", "rev-a")).toBe("exam-governance/EX-1/revisions/rev-a.json");
    expect(revisionMetaName("EX-1", 7, "rev-a")).toBe("exam-governance/EX-1/revision-meta/000007-rev-a.json");
    expect(eventName("EX-1", 12, "ev-b")).toBe("exam-governance/EX-1/events/000012-ev-b.json");
    for (const n of [manifestName("EX-1"), revisionName("EX-1", "r"), eventName("EX-1", 1, "e")]) expect(n.startsWith("exams/")).toBe(false);
  });
  it("exam ids are validated before they become blob path segments", () => {
    expect(isSafeExamId("EXAM-1758000000000")).toBe(true);
    expect(isSafeExamId("ex.1_a-b")).toBe(true);
    for (const bad of ["", "../x", "a/b", "a\\b", ".hidden", "x".repeat(200), 5, null, undefined, "with space"]) expect(isSafeExamId(bad), String(bad)).toBe(false);
    expect(() => manifestName("../x")).toThrow();
    expect(() => revisionName("EX", "../r")).toThrow();
  });
});

describe("14A — manifest contract", () => {
  it("newManifest is a draft at stateVersion 1 pointing at the first revision; timestamps/actor are the server's arguments (never a client body)", () => {
    const m = newManifest({ examId: "EX-1", revisionId: "rev-1", now: "2026-09-30T10:00:00.000Z", actorId: "teacher-1" });
    expect(m).toMatchObject({ schemaVersion: 1, examId: "EX-1", lifecycleState: "draft", stateVersion: 1, latestRevisionId: "rev-1", latestRevisionNumber: 1, createdAt: "2026-09-30T10:00:00.000Z", updatedAt: "2026-09-30T10:00:00.000Z", createdBy: "teacher-1", revisions: [{ revisionId: "rev-1", revisionNumber: 1 }], eventCount: 0, commands: [] });
    expect(m.publishedRevisionId).toBeUndefined();
    expect(m.approvedRevisionId).toBeUndefined();
    expect(m.reviewRevisionId).toBeUndefined();
    expect(validateManifest(m)).toEqual([]);
  });
  it("validateManifest rejects malformed authority documents (unknown state, non-integer version, missing latest revision, dangling pointers)", () => {
    const ok = newManifest({ examId: "EX-1", revisionId: "rev-1", now: "2026-09-30T10:00:00.000Z", actorId: "t" });
    expect(validateManifest({ ...ok, lifecycleState: "final" })).not.toEqual([]);
    expect(validateManifest({ ...ok, stateVersion: "1" })).not.toEqual([]);
    expect(validateManifest({ ...ok, latestRevisionId: "" })).not.toEqual([]);
    expect(validateManifest({ ...ok, lifecycleState: "published" })).not.toEqual([]);          // published without publishedRevisionId
    expect(validateManifest({ ...ok, lifecycleState: "approved" })).not.toEqual([]);           // approved without approvedRevisionId
    expect(validateManifest({ ...ok, lifecycleState: "in-review" })).not.toEqual([]);          // in-review without reviewRevisionId
    expect(validateManifest({ ...ok, publishedRevisionId: "ghost" })).not.toEqual([]);         // pointer outside the lineage
    expect(validateManifest(null)).not.toEqual([]);
    expect(validateManifest({ ...ok, schemaVersion: 2 })).not.toEqual([]);
  });
});
