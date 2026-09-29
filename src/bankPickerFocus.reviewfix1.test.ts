import { describe, it, expect } from "vitest";
import * as FOCUS from "./bankPickerFocus";
import type { CoverageItem } from "./assessmentBlueprintCoverage";
import { networkingBlueprint, physicsBlueprint, chemistryBlueprint, mathematicsBlueprint, computerScienceBlueprint } from "./assessmentBlueprintFixtures";

// Phase 13C-B — Independent Review Fix 1 / R1 (pure): guided Bank discovery is permitted ONLY when the Blueprint is
// explicitly compatible with the Bank service's DATA-declared scope. Fail-first on ffea5b0.
const item = (over: Partial<CoverageItem>): CoverageItem => ({ id: "c", kind: "constraint", refLabel: "x", metric: "count", unit: "absolute", actual: 0, count: 0, weightMarks: 0, officialMarks: 0, relation: "below-target", issues: [], delta: null, shortfall: null, excess: null, evidence: [], ...over } as CoverageItem);
const NET_SCOPE = { subjectId: "networking", courseId: "791381" };
const topicRow = item({ dimension: "topic", ref: "MOTION", refLabel: "الحركة" });
const diffRow = item({ dimension: "difficulty", ref: "3" });
const typeRow = item({ dimension: "questionType", ref: "multipleChoice" });

describe("R1 — bank scope compatibility is generic data comparison", () => {
  it("Physics / Chemistry / Mathematics / Computer Science blueprints get NO guided bank action against the networking-scoped bank (topic, difficulty, type)", () => {
    expect(FOCUS.guidedBankFocusForCoverageItem(topicRow, physicsBlueprint, NET_SCOPE)).toBeNull();
    expect(FOCUS.guidedBankFocusForCoverageItem(diffRow, chemistryBlueprint, NET_SCOPE)).toBeNull();
    expect(FOCUS.guidedBankFocusForCoverageItem(typeRow, mathematicsBlueprint, NET_SCOPE)).toBeNull();
    expect(FOCUS.guidedBankFocusForCoverageItem(typeRow, computerScienceBlueprint, NET_SCOPE)).toBeNull();
    for (const bp of [physicsBlueprint, chemistryBlueprint, mathematicsBlueprint, computerScienceBlueprint]) expect(FOCUS.isBankScopeCompatible(bp, NET_SCOPE)).toBe(false);
  });
  it("an unknown / unscoped bank service permits NO guided discovery, whatever the blueprint", () => {
    expect(FOCUS.isBankScopeCompatible(networkingBlueprint, undefined)).toBe(false);
    expect(FOCUS.guidedBankFocusForCoverageItem(item({ dimension: "topic", ref: "IP_ADDRESSING" }), networkingBlueprint, undefined)).toBeNull();
    expect(FOCUS.guidedBankFocusForCoverageItem(item({ dimension: "topic", ref: "IP_ADDRESSING" }), networkingBlueprint, null)).toBeNull();
    expect(FOCUS.guidedBankFocusForCoverageItem(item({ dimension: "topic", ref: "IP_ADDRESSING" }), undefined, NET_SCOPE)).toBeNull();
  });
  it("the matching Networking / 791381 scope still allows exact topic / difficulty / type focus", () => {
    expect(FOCUS.isBankScopeCompatible(networkingBlueprint, NET_SCOPE)).toBe(true);
    expect(FOCUS.guidedBankFocusForCoverageItem(item({ dimension: "topic", ref: "IP_ADDRESSING", refLabel: "عنونة IPv4" }), networkingBlueprint, NET_SCOPE)).toEqual({ topic: "IP_ADDRESSING" });
    expect(FOCUS.guidedBankFocusForCoverageItem(diffRow, networkingBlueprint, NET_SCOPE)).toEqual({ difficulty: 3 });
    expect(FOCUS.guidedBankFocusForCoverageItem(typeRow, networkingBlueprint, NET_SCOPE)).toEqual({ presentationType: "multipleChoice" });
    expect(FOCUS.guidedBankFocusForCoverageItem(item({ dimension: "objective", ref: "obj-subnet" }), networkingBlueprint, NET_SCOPE)).toBeNull();   // unsupported dimension still null
    expect(FOCUS.isBankScopeCompatible(networkingBlueprint, { subjectId: "networking" })).toBe(true);                                             // a bank scoped by subject only
    expect(FOCUS.isBankScopeCompatible(networkingBlueprint, { subjectId: "networking", courseId: "791381", curriculumId: "il-vocational" })).toBe(true);
  });
  it("a subject mismatch blocks ALL guided focus; a declared course or curriculum mismatch blocks too; a bank that declares a course the blueprint lacks is incompatible", () => {
    const otherSubject = { ...networkingBlueprint, subject: { id: "computer-networks", label: "شبكات الحاسوب" } };
    expect(FOCUS.isBankScopeCompatible(otherSubject, NET_SCOPE)).toBe(false);
    for (const row of [item({ dimension: "topic", ref: "IP_ADDRESSING" }), diffRow, typeRow]) expect(FOCUS.guidedBankFocusForCoverageItem(row, otherSubject, NET_SCOPE)).toBeNull();
    expect(FOCUS.isBankScopeCompatible(networkingBlueprint, { subjectId: "networking", courseId: "791367" })).toBe(false);
    expect(FOCUS.isBankScopeCompatible(networkingBlueprint, { subjectId: "networking", curriculumId: "academic" })).toBe(false);
    const { course: _c, ...noCourse } = networkingBlueprint; void _c;
    expect(FOCUS.isBankScopeCompatible(noCourse, NET_SCOPE)).toBe(false);
    expect(FOCUS.isBankScopeCompatible(noCourse, { subjectId: "networking" })).toBe(true);                                                          // the bank declares no course → subject decides
  });
  it("no fuzzy / label compatibility: same label with a different id, case or spacing differences are incompatible; empty ids never match", () => {
    expect(FOCUS.isBankScopeCompatible({ ...networkingBlueprint, subject: { id: "Networking", label: "شبكات الحاسوب" } }, NET_SCOPE)).toBe(false);
    expect(FOCUS.isBankScopeCompatible({ ...networkingBlueprint, subject: { id: "networking ", label: "شبكات الحاسوب" } }, NET_SCOPE)).toBe(false);
    expect(FOCUS.isBankScopeCompatible({ ...networkingBlueprint, subject: { id: "nets", label: "networking" } }, NET_SCOPE)).toBe(false);
    expect(FOCUS.isBankScopeCompatible({ ...networkingBlueprint, subject: { id: "", label: "" } }, { subjectId: "" })).toBe(false);
    expect(FOCUS.isBankScopeCompatible({ ...networkingBlueprint, course: { id: "791381 ", label: "x" } }, NET_SCOPE)).toBe(false);
  });
});
