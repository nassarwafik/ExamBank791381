import { describe, it, expect } from "vitest";
import { filterEligibleCandidates, presentationTypeFromIndex } from "./exam-question-selection.js";

function q(overrides = {}) {
  return {
    id: "q1",
    sourceId: "src1",
    section: "BASIC",
    topic: "PRIVATE_PUBLIC_IP",
    difficulty: 2,
    type: "multipleChoice",
    needsReview: false,
    reviewStatus: "ok",
    ...overrides
  };
}

describe("filterEligibleCandidates - baseline eligibility (unchanged from the original inline filter)", () => {
  it("keeps a well-formed candidate with no restrictions applied", () => {
    const result = filterEligibleCandidates([q()], {});
    expect(result).toHaveLength(1);
  });

  it("drops candidates missing id or sourceId", () => {
    expect(filterEligibleCandidates([q({ id: "" })], {})).toHaveLength(0);
    expect(filterEligibleCandidates([q({ sourceId: "" })], {})).toHaveLength(0);
  });

  it("drops candidates outside BASIC/INFRASTRUCTURE sections", () => {
    expect(filterEligibleCandidates([q({ section: "OTHER" })], {})).toHaveLength(0);
  });

  it("drops candidates with a non-integer difficulty", () => {
    expect(filterEligibleCandidates([q({ difficulty: 2.5 })], {})).toHaveLength(0);
    expect(filterEligibleCandidates([q({ difficulty: NaN })], {})).toHaveLength(0);
  });

  it("drops candidates with an UNKNOWN or missing topic", () => {
    expect(filterEligibleCandidates([q({ topic: "UNKNOWN" })], {})).toHaveLength(0);
    expect(filterEligibleCandidates([q({ topic: "" })], {})).toHaveLength(0);
  });

  it("excludes needsReview/needs-review candidates by default, includes them when excludeNeedsReview is false", () => {
    const flagged = q({ needsReview: true });
    expect(filterEligibleCandidates([flagged], {})).toHaveLength(0);
    expect(filterEligibleCandidates([flagged], { excludeNeedsReview: false })).toHaveLength(1);

    const flaggedByStatus = q({ reviewStatus: "needs-review" });
    expect(filterEligibleCandidates([flaggedByStatus], {})).toHaveLength(0);
  });
});

describe("filterEligibleCandidates - strict topic exclusion (no auto-expansion)", () => {
  const bank = [
    q({ id: "ip1", topic: "PRIVATE_PUBLIC_IP" }),
    q({ id: "ip2", topic: "PRIVATE_PUBLIC_IP" }),
    q({ id: "ip3", topic: "PRIVATE_PUBLIC_IP" }),
    q({ id: "vlan1", topic: "VLAN" }),
    q({ id: "vlan2", topic: "VLAN" }),
    q({ id: "ospf1", topic: "OSPF" })
  ];

  it("with no excludedTopics, every topic is eligible", () => {
    expect(filterEligibleCandidates(bank, {})).toHaveLength(6);
  });

  it("excluding every topic except PRIVATE_PUBLIC_IP leaves only PRIVATE_PUBLIC_IP candidates, never VLAN/OSPF", () => {
    const result = filterEligibleCandidates(bank, { excludedTopics: ["VLAN", "OSPF"] });
    expect(result).toHaveLength(3);
    expect(result.every(item => item.topic === "PRIVATE_PUBLIC_IP")).toBe(true);
  });

  it("an excludedTopics entry that matches nothing in the bank is a harmless no-op for other topics", () => {
    const result = filterEligibleCandidates(bank, { excludedTopics: ["SOME_HALLUCINATED_TOPIC_CODE"] });
    expect(result).toHaveLength(6);
  });
});

describe("filterEligibleCandidates - allowedDifficulties/allowedTypes are hard filters, not scoring preferences", () => {
  const bank = [
    q({ id: "a", difficulty: 1, type: "multipleChoice" }),
    q({ id: "b", difficulty: 2, type: "multipleChoice" }),
    q({ id: "c", difficulty: 1, type: "shortAnswer" }), // presentationType -> open
    q({ id: "d", difficulty: 3, type: "multiField" })   // presentationType -> fillBlank
  ];

  it("empty/omitted allowedDifficulties or allowedTypes impose no restriction", () => {
    expect(filterEligibleCandidates(bank, {})).toHaveLength(4);
    expect(filterEligibleCandidates(bank, { allowedDifficulties: [], allowedTypes: [] })).toHaveLength(4);
  });

  it("a non-empty allowedDifficulties keeps only exact matches", () => {
    const result = filterEligibleCandidates(bank, { allowedDifficulties: [1] });
    expect(result.map(item => item.id).sort()).toEqual(["a", "c"]);
  });

  it("a non-empty allowedTypes keeps only exact presentation-type matches", () => {
    const result = filterEligibleCandidates(bank, { allowedTypes: ["multipleChoice"] });
    expect(result.map(item => item.id).sort()).toEqual(["a", "b"]);
  });

  it("supports selecting multiple topics AND multiple difficulty levels at once (real multi-select filter usage)", () => {
    const mixed = [
      q({ id: "ip-d1", topic: "PRIVATE_PUBLIC_IP", difficulty: 1 }),
      q({ id: "ip-d3", topic: "PRIVATE_PUBLIC_IP", difficulty: 3 }),
      q({ id: "vlan-d1", topic: "VLAN", difficulty: 1 }),
      q({ id: "vlan-d3", topic: "VLAN", difficulty: 3 }),
      q({ id: "ospf-d1", topic: "OSPF", difficulty: 1 }), // excluded topic, must never appear
      q({ id: "ip-d2", topic: "PRIVATE_PUBLIC_IP", difficulty: 2 }) // wrong difficulty, must never appear
    ];
    const result = filterEligibleCandidates(mixed, {
      excludedTopics: ["OSPF"],
      allowedDifficulties: [1, 3]
    });
    expect(result.map(item => item.id).sort()).toEqual(["ip-d1", "ip-d3", "vlan-d1", "vlan-d3"]);
  });

  it("combining topic + difficulty + type restrictions applies all of them simultaneously", () => {
    const mixed = [
      q({ id: "match", topic: "IP_ADDRESSING", difficulty: 1, type: "multipleChoice" }),
      q({ id: "wrong-difficulty", topic: "IP_ADDRESSING", difficulty: 2, type: "multipleChoice" }),
      q({ id: "wrong-type", topic: "IP_ADDRESSING", difficulty: 1, type: "shortAnswer" }),
      q({ id: "wrong-topic", topic: "VLAN", difficulty: 1, type: "multipleChoice" })
    ];
    const result = filterEligibleCandidates(mixed, {
      excludedTopics: ["VLAN"],
      allowedDifficulties: [1],
      allowedTypes: ["multipleChoice"]
    });
    expect(result.map(item => item.id)).toEqual(["match"]);
  });
});

describe("presentationTypeFromIndex", () => {
  it("maps the known index type values to their presentation type", () => {
    expect(presentationTypeFromIndex({ type: "multipleChoice" })).toBe("multipleChoice");
    expect(presentationTypeFromIndex({ type: "multiField" })).toBe("fillBlank");
    expect(presentationTypeFromIndex({ type: "shortAnswer" })).toBe("open");
    expect(presentationTypeFromIndex({ type: "multiPart" })).toBe("open");
    expect(presentationTypeFromIndex({ type: "other" })).toBe("open");
    expect(presentationTypeFromIndex({ type: "anything-else" })).toBe("open");
  });
});
