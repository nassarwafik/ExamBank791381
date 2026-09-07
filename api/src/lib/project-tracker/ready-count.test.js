import { describe, it, expect } from "vitest";
import { countReadyStages } from "./ready-count.js";

const active = new Set(["B01", "B02", "B03"]); // B99 is NOT active/known
// members: s1, s2 are members; s3 is archived (not a member)
const isMember = id => id === "s1" || id === "s2";

describe("countReadyStages — badge exactness matches the ready report", () => {
  it("counts a valid member's ready stage on an active stage id", () => {
    const docs = [{ studentId: "s1", stages: { B01: { status: "ready_for_review" }, B02: { status: "approved" } } }];
    expect(countReadyStages(docs, active, isMember)).toBe(1);
  });
  it("does NOT count a stage of an archived/non-member student", () => {
    const docs = [{ studentId: "s3", stages: { B01: { status: "ready_for_review" } } }];
    expect(countReadyStages(docs, active, isMember)).toBe(0);
  });
  it("does NOT count an inactive / unknown stage id", () => {
    const docs = [{ studentId: "s1", stages: { B99: { status: "ready_for_review" } } }];
    expect(countReadyStages(docs, active, isMember)).toBe(0);
  });
  it("counts a login-disabled but non-archived member (isMember true)", () => {
    const docs = [{ studentId: "s2", stages: { B03: { status: "ready_for_review" } } }];
    expect(countReadyStages(docs, active, isMember)).toBe(1);
  });
  it("total equals the sum across docs", () => {
    const docs = [
      { studentId: "s1", stages: { B01: { status: "ready_for_review" }, B02: { status: "ready_for_review" } } },
      { studentId: "s2", stages: { B03: { status: "ready_for_review" } } },
      { studentId: "s3", stages: { B01: { status: "ready_for_review" } } } // archived -> ignored
    ];
    expect(countReadyStages(docs, active, isMember)).toBe(3);
  });
});
