import { describe, it, expect } from "vitest";
import {
  emptyBlueprint, validateBlueprint, renameTopic, addTopic, removeTopic, setTopicParent, orderedTopics,
  effectiveAssessmentMeta, buildAssessmentProfile, legacyPlanToBlueprint, blueprintToLegacyPlanTargets, withBlueprint
} from "./assessmentBlueprint";
import { ASSESSMENT_BLUEPRINT_SCHEMA_VERSION, DEFAULT_COGNITIVE_LEVELS, type AssessmentBlueprintV1 } from "./assessmentTypes";
import { ALL_SUBJECT_BLUEPRINTS, networkingBlueprint, computerScienceBlueprint, mathematicsBlueprint, classified } from "./assessmentBlueprintFixtures";
import { questionMaxMarks, computeTotalMarks } from "./examBuilderState";
import type { StructuredExam, BuilderQuestion } from "./examTypes";
// @ts-expect-error — the server module is CommonJS without type declarations; the parity test needs the REAL grader-side helpers.
import { examOfficialStats, questionMaxMarks as serverQuestionMaxMarks } from "../api/src/lib/exam-structure.js";

// Phase 13C-A — the canonical, domain-neutral Assessment Blueprint: ONE versioned pure contract + ONE validator that
// accept five materially different subjects, stable taxonomy ids, additive question metadata, a legacy-bank bridge that
// never guesses, and a pure profile (fact extraction) whose marks agree with the grader.

const codes = (issues: { code: string }[]) => issues.map(i => i.code);
const exam = (questions: BuilderQuestion[], blueprint?: AssessmentBlueprintV1, over: Partial<StructuredExam> = {}): StructuredExam =>
  ({ examId: "e1", title: "t", status: "draft", schemaVersion: 2, updatedAt: "", blueprint, sections: [{ id: "s1", title: "S", gradingPolicy: "all", stimuli: {}, questions }], ...over } as StructuredExam);
const q = classified as unknown as (id: string, marks: number, meta: BuilderQuestion["assessmentMeta"], extra?: Record<string, unknown>) => BuilderQuestion;

describe("F1 — versioned, domain-neutral contract", () => {
  it("emptyBlueprint() is schemaVersion 1 with NO default subject (no networking / 791381 anywhere)", () => {
    const bp = emptyBlueprint();
    expect(bp.schemaVersion).toBe(ASSESSMENT_BLUEPRINT_SCHEMA_VERSION);
    expect(bp.subject).toEqual({ id: "", label: "" });
    expect(bp.topics).toEqual([]); expect(bp.objectives).toEqual([]); expect(bp.constraints).toEqual([]);
    const text = JSON.stringify(bp).toLowerCase();
    expect(text).not.toContain("networking"); expect(text).not.toContain("791381"); expect(text).not.toContain("basic"); expect(text).not.toContain("infrastructure");
  });
  it("the SAME model + validator accept all five subject fixtures with zero issues", () => {
    for (const { name, blueprint } of ALL_SUBJECT_BLUEPRINTS) expect({ name, issues: validateBlueprint(blueprint) }).toEqual({ name, issues: [] });
    expect(new Set(ALL_SUBJECT_BLUEPRINTS.map(f => f.blueprint.subject.id)).size).toBe(5);
  });
  it("unsupported schema version / non-object → a single structured issue, nothing repaired", () => {
    expect(codes(validateBlueprint({ ...networkingBlueprint, schemaVersion: 2 }))).toEqual(["UNSUPPORTED_SCHEMA_VERSION"]);
    expect(codes(validateBlueprint(null))).toEqual(["UNSUPPORTED_SCHEMA_VERSION"]);
    expect(codes(validateBlueprint("x"))).toEqual(["UNSUPPORTED_SCHEMA_VERSION"]);
  });
  it("a partial blueprint (subject only) is valid; missing subject id / label are issues, not defaults", () => {
    expect(validateBlueprint({ ...emptyBlueprint(), subject: { id: "biology", label: "الأحياء" } })).toEqual([]);
    expect(codes(validateBlueprint(emptyBlueprint()))).toEqual(expect.arrayContaining(["MISSING_SUBJECT_ID", "MISSING_SUBJECT_LABEL"]));
  });
  it("the generic engine source contains no subject-specific branch", async () => {
    const { readFileSync } = await import("node:fs");
    for (const f of ["src/assessmentBlueprint.ts", "src/assessmentTypes.ts"]) {
      const src = readFileSync(f, "utf8").split("\n").filter(l => !l.trim().startsWith("//") && !l.trim().startsWith("*")).join("\n");
      expect(src).not.toMatch(/subject(\.id|Id)?\s*===?\s*["'](networking|physics|chemistry|math|computer|cs|791381)/i);
      expect(src).not.toMatch(/["']791381["']|["']BASIC["']|["']INFRASTRUCTURE["']|["']NETWORK_BASICS["']/);
    }
  });
});

describe("F2 — stable hierarchical taxonomy", () => {
  it("topic identity is the id: renaming a label keeps parent links, objective links, constraint refs and question mappings", () => {
    const renamed = renameTopic(networkingBlueprint, "IP_ADDRESSING", "IPv4 — العنونة");
    expect(renamed.topics.find(t => t.id === "IP_ADDRESSING")?.label).toBe("IPv4 — العنونة");
    expect(renamed.topics.find(t => t.id === "SUBNET_CIDR")?.parentId).toBe("IP_ADDRESSING");
    expect(renamed.constraints.find(c => c.id === "c-ip-marks")?.ref).toBe("IP_ADDRESSING");
    expect(validateBlueprint(renamed)).toEqual([]);
    const e = exam([q("q1", 10, { primaryTopicId: "IP_ADDRESSING" })], renamed);
    expect(buildAssessmentProfile(e, renamed).byTopic["IP_ADDRESSING"]).toEqual({ count: 1, weightMarks: 10, officialMarks: 10 });
    expect(networkingBlueprint.topics.find(t => t.id === "IP_ADDRESSING")?.label).toBe("عنونة IPv4");   // input untouched
  });
  it("three-level hierarchies from different subjects order depth-first with depth (Algorithms → Sorting → Merge Sort; Mechanics → Motion → Projectile)", () => {
    expect(orderedTopics(computerScienceBlueprint).map(t => t.id + ":" + t.depth)).toEqual(["ALG:0", "SORT:1", "MERGE:2", "DS:0", "TREES:1"]);
    expect(orderedTopics(mathematicsBlueprint).map(t => t.id + ":" + t.depth)).toEqual(["ALGEBRA:0", "LINEAR_EQ:1", "GEOMETRY:0", "TRIANGLES:1", "PYTHAGORAS:2"]);
  });
  it("duplicate ids, missing labels, broken parent references and cycles are structured issues", () => {
    const bp: AssessmentBlueprintV1 = { ...emptyBlueprint(), subject: { id: "s", label: "S" }, topics: [
      { id: "A", label: "A", parentId: "B" }, { id: "B", label: "B", parentId: "A" }, { id: "C", label: "" }, { id: "C", label: "C2" }, { id: "D", label: "D", parentId: "ZZZ" }, { id: " ", label: "blank" }
    ] };
    const c = codes(validateBlueprint(bp));
    expect(c).toEqual(expect.arrayContaining(["TOPIC_CYCLE", "MISSING_TOPIC_LABEL", "DUPLICATE_TOPIC_ID", "BROKEN_PARENT_REF", "INVALID_TOPIC_ID"]));
    expect(codes(validateBlueprint({ ...bp, topics: [{ id: "A", label: "A", parentId: "A" }] }))).toContain("TOPIC_CYCLE");
  });
  it("add / remove / re-parent are pure and id-based", () => {
    const withChild = addTopic(computerScienceBlueprint, { id: "QUICK", label: "Quick Sort", parentId: "SORT" });
    expect(withChild.topics.some(t => t.id === "QUICK")).toBe(true);
    expect(computerScienceBlueprint.topics.some(t => t.id === "QUICK")).toBe(false);
    expect(codes(validateBlueprint(removeTopic(withChild, "SORT")))).toEqual(expect.arrayContaining(["BROKEN_PARENT_REF", "BROKEN_TOPIC_REF"]));   // never silently repaired
    expect(setTopicParent(withChild, "QUICK", undefined).topics.find(t => t.id === "QUICK")?.parentId).toBeUndefined();
  });
  it("objective references: duplicate ids, missing labels, broken topic links", () => {
    const bp: AssessmentBlueprintV1 = { ...emptyBlueprint(), subject: { id: "s", label: "S" }, topics: [{ id: "T", label: "T" }], objectives: [
      { id: "o", label: "x" }, { id: "o", label: "y" }, { id: "o2", label: "", topicId: "NOPE" }
    ] };
    expect(codes(validateBlueprint(bp))).toEqual(expect.arrayContaining(["DUPLICATE_OBJECTIVE_ID", "MISSING_OBJECTIVE_LABEL", "BROKEN_OBJECTIVE_TOPIC_REF"]));
  });
});

describe("constraints — generic dimensions, absolute / percent / range", () => {
  const base = (): AssessmentBlueprintV1 => ({ ...emptyBlueprint(), subject: { id: "s", label: "S" }, topics: [{ id: "T", label: "T" }], objectives: [{ id: "O", label: "O" }] });
  const one = (c: Record<string, unknown>) => codes(validateBlueprint({ ...base(), constraints: [{ id: "c1", dimension: "topic", ref: "T", metric: "count", unit: "absolute", target: 3, ...c }] as AssessmentBlueprintV1["constraints"] }));
  it("absolute target, percent target and ranges are valid; partial blueprints need no complete distribution", () => {
    expect(one({})).toEqual([]);
    expect(one({ unit: "percent", target: 40 })).toEqual([]);
    expect(one({ target: undefined, min: 1, max: 4 })).toEqual([]);
    expect(one({ unit: "percent", target: undefined, min: 10, max: 30 })).toEqual([]);
  });
  it("invalid percentage, negative limits, min > target, target > max, min > max, empty constraint", () => {
    expect(one({ unit: "percent", target: 140 })).toContain("PERCENT_OUT_OF_RANGE");
    expect(one({ target: -2 })).toContain("NEGATIVE_LIMIT");
    expect(one({ min: 5, target: 3 })).toContain("CONTRADICTORY_LIMITS");
    expect(one({ target: 8, max: 3 })).toContain("CONTRADICTORY_LIMITS");
    expect(one({ target: undefined, min: 8, max: 3 })).toContain("CONTRADICTORY_LIMITS");
    expect(one({ target: undefined })).toContain("EMPTY_CONSTRAINT");
    expect(one({ tolerance: -1 })).toContain("NEGATIVE_LIMIT");
  });
  it("malformed metric / unit / dimension and broken references", () => {
    expect(one({ metric: "points" })).toContain("INVALID_METRIC");
    expect(one({ unit: "ratio" })).toContain("INVALID_UNIT");
    expect(one({ dimension: "color" })).toContain("INVALID_DIMENSION");
    expect(one({ ref: "MISSING" })).toContain("BROKEN_TOPIC_REF");
    expect(one({ dimension: "objective", ref: "MISSING" })).toContain("BROKEN_OBJECTIVE_REF");
    expect(one({ dimension: "difficulty", ref: "9" })).toContain("INVALID_DIFFICULTY");
    expect(one({ dimension: "difficulty", ref: "abc" })).toContain("INVALID_DIFFICULTY");
    expect(one({ dimension: "cognitiveLevel", ref: "guess" })).toContain("BROKEN_COGNITIVE_REF");
    expect(one({ dimension: "questionType", ref: "essayish" })).toContain("INVALID_QUESTION_TYPE");
    expect(one({ dimension: "capability", ref: "" })).toContain("MISSING_REF");
    expect(one({ id: "" })).toContain("INVALID_CONSTRAINT_ID");
  });
  it("duplicate equivalent constraints (same dimension + ref + metric + unit) and duplicate ids", () => {
    const bp = { ...base(), constraints: [
      { id: "a", dimension: "topic", ref: "T", metric: "count", unit: "absolute", target: 3 },
      { id: "b", dimension: "topic", ref: "T", metric: "count", unit: "absolute", min: 1 },
      { id: "b", dimension: "objective", ref: "O", metric: "marks", unit: "percent", target: 10 }
    ] } as AssessmentBlueprintV1;
    expect(codes(validateBlueprint(bp))).toEqual(expect.arrayContaining(["DUPLICATE_EQUIVALENT_CONSTRAINT", "DUPLICATE_CONSTRAINT_ID"]));
  });
  it("difficulty scale and cognitive vocabulary are blueprint data (Mathematics uses SOLO + a 1..3 scale)", () => {
    expect(validateBlueprint(mathematicsBlueprint)).toEqual([]);
    expect(codes(validateBlueprint({ ...mathematicsBlueprint, constraints: [{ id: "x", dimension: "difficulty", ref: "5", metric: "count", unit: "absolute", max: 1 }] }))).toContain("INVALID_DIFFICULTY");
    expect(codes(validateBlueprint({ ...mathematicsBlueprint, constraints: [{ id: "x", dimension: "cognitiveLevel", ref: "apply", metric: "count", unit: "absolute", max: 1 }] }))).toContain("BROKEN_COGNITIVE_REF");
    expect(codes(validateBlueprint({ ...mathematicsBlueprint, difficultyScale: { min: 3, max: 1 } }))).toContain("INVALID_DIFFICULTY_SCALE");
    expect(DEFAULT_COGNITIVE_LEVELS.map(l => l.id)).toEqual(["remember", "understand", "apply", "analyze", "evaluate", "create"]);
  });
});

describe("F4 — pure assessment profile (fact extraction) and the legacy bank bridge", () => {
  const bp = networkingBlueprint;
  it("primary topic is the EXCLUSIVE attribution source: a 10-mark question with two secondary topics contributes 10 marks once, not 30", () => {
    const e = exam([q("q1", 10, { primaryTopicId: "IP_ADDRESSING", secondaryTopicIds: ["SUBNET_CIDR", "OSI_TCPIP"] })], bp);
    const p = buildAssessmentProfile(e, bp);
    expect(p.byTopic).toEqual({ IP_ADDRESSING: { count: 1, weightMarks: 10, officialMarks: 10 } });
    expect(Object.values(p.byTopic).reduce((s, x) => s + x.officialMarks, 0)).toBe(10);
    expect(p.totalOfficialMarks).toBe(10);
  });
  it("objectives may overlap (one question measures several) — each listed objective receives the question", () => {
    const e = exam([q("q1", 4, { primaryTopicId: "SUBNET_CIDR", objectiveIds: ["obj-subnet", "obj-layers"] })], bp);
    expect(buildAssessmentProfile(e, bp).byObjective).toEqual({ "obj-subnet": { count: 1, weightMarks: 4, officialMarks: 4 }, "obj-layers": { count: 1, weightMarks: 4, officialMarks: 4 } });
  });
  it("difficulty / type / cognitive / capability distributions, unclassified and unmapped questions", () => {
    const e = exam([
      q("q1", 2, { primaryTopicId: "IP_ADDRESSING", difficulty: 3, cognitiveLevel: "apply", capabilities: ["cli"] }),
      q("q2", 3, { primaryTopicId: "OSI_TCPIP", difficulty: 3, cognitiveLevel: "remember" }, { presentationType: "shortAnswer" }),
      q("q3", 5, undefined, { topic: "IP_ADDRESSING", difficulty: 2, hasCLI: true }),                   // bank evidence, mapped exactly
      q("q4", 1, undefined, { topic: "VLAN_TRUNKING", difficulty: 4 }),                                 // bank topic NOT in the blueprint
      q("q5", 1, undefined)                                                                              // nothing at all
    ], bp);
    const p = buildAssessmentProfile(e, bp);
    expect(p.totalQuestions).toBe(5); expect(p.totalOfficialMarks).toBe(12);
    expect(p.byTopic).toEqual({ IP_ADDRESSING: { count: 2, weightMarks: 7, officialMarks: 7 }, OSI_TCPIP: { count: 1, weightMarks: 3, officialMarks: 3 } });
    expect(p.byDifficulty).toEqual({ "3": { count: 2, weightMarks: 5, officialMarks: 5 }, "2": { count: 1, weightMarks: 5, officialMarks: 5 }, "4": { count: 1, weightMarks: 1, officialMarks: 1 }, unspecified: { count: 1, weightMarks: 1, officialMarks: 1 } });
    expect(p.byType).toEqual({ multipleChoice: { count: 4, weightMarks: 9, officialMarks: 9 }, shortAnswer: { count: 1, weightMarks: 3, officialMarks: 3 } });
    expect(p.byCognitiveLevel).toEqual({ apply: { count: 1, weightMarks: 2, officialMarks: 2 }, remember: { count: 1, weightMarks: 3, officialMarks: 3 }, unspecified: { count: 3, weightMarks: 7, officialMarks: 7 } });
    expect(p.byCapability).toEqual({ cli: { count: 2, weightMarks: 7, officialMarks: 7 } });
    expect(p.unmappedQuestions).toEqual([{ examQuestionId: "q4", bankTopics: ["VLAN_TRUNKING"] }]);
    expect(p.unclassifiedQuestions).toEqual(["q4", "q5"]);
    expect(p.bySection).toEqual({ s1: { count: 5, weightMarks: 12, officialMarks: 12, officialFactor: 1 } });
  });
  it("effective metadata: explicit assessmentMeta is authoritative; bank topic / difficulty / flags are evidence only when the mapping is EXACT; unknown bank topics stay unmapped (never guessed)", () => {
    const bankQ = q("b1", 2, undefined, { origin: "bank", bankQuestionId: "BANK-1", topic: "IP_ADDRESSING", secondaryTopics: ["SUBNET_CIDR", "DHCP"], difficulty: 4, hasCLI: true, requiresCalculation: true });
    const eff = effectiveAssessmentMeta(bankQ, bp);
    expect(eff.primaryTopicId).toBe("IP_ADDRESSING"); expect(eff.source.primaryTopic).toBe("bank");
    expect(eff.secondaryTopicIds).toEqual(["SUBNET_CIDR"]); expect(eff.unmappedBankTopics).toEqual(["DHCP"]);
    expect(eff.difficulty).toBe(4); expect(eff.source.difficulty).toBe("bank");
    expect(eff.capabilities).toEqual(["cli", "calculation"]);
    const explicit = effectiveAssessmentMeta({ ...bankQ, assessmentMeta: { primaryTopicId: "OSI_TCPIP", difficulty: 1, capabilities: [] } }, bp);
    expect(explicit.primaryTopicId).toBe("OSI_TCPIP"); expect(explicit.source.primaryTopic).toBe("explicit"); expect(explicit.difficulty).toBe(1); expect(explicit.capabilities).toEqual([]);
    const nearby = effectiveAssessmentMeta(q("x", 1, undefined, { topic: "ip_addressing" }), bp);           // case differs → NOT the same stable id
    expect(nearby.primaryTopicId).toBeUndefined(); expect(nearby.unmappedBankTopics).toEqual(["ip_addressing"]);
    const noBp = effectiveAssessmentMeta(bankQ, undefined);
    expect(noBp.primaryTopicId).toBeUndefined(); expect(noBp.unmappedBankTopics).toEqual(["IP_ADDRESSING", "SUBNET_CIDR", "DHCP"]); expect(noBp.difficulty).toBe(4);
  });
  it("official marks parity: compound questions use the grader's part-mark distribution, never top-level q.marks; totals equal examOfficialStats", () => {
    const compound = { examQuestionId: "c1", presentationType: "compound", text: "مركب", marks: 10, parts: [
      { id: "p1", type: "shortAnswer", text: "أ", marks: 2, answer: { text: "x" } }, { id: "p2", type: "shortAnswer", text: "ب", marks: 3, answer: { text: "y" } }
    ], assessmentMeta: { primaryTopicId: "SUBNET_CIDR" } } as unknown as BuilderQuestion;
    const capped: StructuredExam = { ...exam([q("q1", 4, { primaryTopicId: "OSI_TCPIP" }), compound], bp), sections: [
      { id: "s1", title: "A", gradingPolicy: "all", stimuli: {}, questions: [q("q1", 4, { primaryTopicId: "OSI_TCPIP" }), compound] },
      { id: "s2", title: "B", gradingPolicy: "capScore", maxMarks: 6, stimuli: {}, questions: [q("q2", 5, { primaryTopicId: "IP_ADDRESSING" }), q("q3", 5, { primaryTopicId: "IP_ADDRESSING" })] }
    ] };
    const p = buildAssessmentProfile(capped, bp);
    expect(p.byTopic["SUBNET_CIDR"]).toEqual({ count: 1, weightMarks: 5, officialMarks: 5 });
    expect(questionMaxMarks(compound)).toBe(5); expect(serverQuestionMaxMarks(compound)).toBe(5);
    expect(p.totalOfficialMarks).toBe(computeTotalMarks(capped)); expect(p.totalOfficialMarks).toBe(examOfficialStats(capped).totalMarks); expect(p.totalOfficialMarks).toBe(15);
    expect(p.bySection).toEqual({ s1: { count: 2, weightMarks: 9, officialMarks: 9, officialFactor: 1 }, s2: { count: 2, weightMarks: 10, officialMarks: 6, officialFactor: 0.6 } });
    expect(p.totalQuestions).toBe(examOfficialStats(capped).questionCount);
  });
  it("profile and bridge never mutate their inputs and profile is single-pass (no deep clone of the exam)", () => {
    const e = exam([q("q1", 10, { primaryTopicId: "IP_ADDRESSING" }), q("q2", 1, undefined, { topic: "NOPE" })], bp);
    const before = JSON.stringify(e), bpBefore = JSON.stringify(bp);
    const p = buildAssessmentProfile(e, bp);
    effectiveAssessmentMeta(e.sections[0].questions[1], bp);
    expect(JSON.stringify(e)).toBe(before); expect(JSON.stringify(bp)).toBe(bpBefore);
    expect(p.byTopic["IP_ADDRESSING"]).toEqual({ count: 1, weightMarks: 10, officialMarks: 10 });
    const big = exam(Array.from({ length: 2000 }, (_, i) => q("q" + i, 1, { primaryTopicId: i % 2 ? "IP_ADDRESSING" : "OSI_TCPIP" })), bp);
    const t0 = performance.now(); buildAssessmentProfile(big, bp); expect(performance.now() - t0).toBeLessThan(250);
  });
});

describe("relation to the legacy generator ExamPlan (projection seam, not a competitor)", () => {
  const plan = { totalQuestions: 20, totalMarks: 100, topicTargets: [{ topic: "IP_ADDRESSING", count: 6 }, { topic: "OSI_TCPIP", count: 4 }, { topic: "ZERO", count: 0 }], difficultyTargets: { "1": 5, "2": 10, "3": 5 }, typeTargets: { multipleChoice: 12, fillBlank: 4, wordBank: 2, open: 2 }, excludedTopics: ["DHCP"], sectionTargets: { BASIC: 12, INFRASTRUCTURE: 8 } };
  it("legacyPlanToBlueprint projects the current plan into a VALID canonical blueprint — subject supplied by the caller, never defaulted", () => {
    const bp = legacyPlanToBlueprint(plan, { id: "networking", label: "شبكات" }, { topicLabels: { IP_ADDRESSING: "عنونة IPv4" } });
    expect(validateBlueprint(bp)).toEqual([]);
    expect(bp.subject).toEqual({ id: "networking", label: "شبكات" });
    expect(bp.topics.map(t => t.id)).toEqual(["IP_ADDRESSING", "OSI_TCPIP"]);
    expect(bp.topics[0].label).toBe("عنونة IPv4"); expect(bp.topics[1].label).toBe("OSI_TCPIP");
    expect(bp.targets).toEqual({ totalQuestions: 20, totalMarks: 100 });
    expect(bp.constraints.find(c => c.dimension === "topic" && c.ref === "IP_ADDRESSING")).toMatchObject({ metric: "count", unit: "absolute", target: 6 });
    expect(bp.constraints.filter(c => c.dimension === "difficulty").map(c => c.ref + "=" + c.target)).toEqual(["1=5", "2=10", "3=5"]);
    expect(bp.constraints.find(c => c.dimension === "questionType" && c.ref === "shortAnswer")?.target).toBe(2);   // legacy "open" → engine type name
    expect(bp.constraints.filter(c => c.dimension === "section").map(c => c.ref)).toEqual(["BASIC", "INFRASTRUCTURE"]);
    expect(bp.constraints.some(c => c.ref === "ZERO")).toBe(false);
    const other = legacyPlanToBlueprint(plan, { id: "physics", label: "الفيزياء" });
    expect(other.subject.id).toBe("physics");
  });
  it("blueprintToLegacyPlanTargets projects absolute count targets back for the existing generator (which is not modified)", () => {
    const bp = legacyPlanToBlueprint(plan, { id: "networking", label: "شبكات" });
    expect(blueprintToLegacyPlanTargets(bp)).toEqual({ totalQuestions: 20, totalMarks: 100, topicTargets: [{ topic: "IP_ADDRESSING", count: 6 }, { topic: "OSI_TCPIP", count: 4 }], difficultyTargets: { "1": 5, "2": 10, "3": 5 }, typeTargets: { multipleChoice: 12, fillBlank: 4, wordBank: 2, open: 2 } });
    expect(blueprintToLegacyPlanTargets(mathematicsBlueprint)).toEqual({ totalMarks: 60, topicTargets: [], difficultyTargets: {}, typeTargets: {} });   // percent / range constraints do not project
  });
  it("withBlueprint edits the exam immutably (the ONE updater shape the builder dispatches)", () => {
    const e = exam([], undefined);
    const next = withBlueprint(e, bp => ({ ...bp, subject: { id: "chemistry", label: "الكيمياء" } }));
    expect(next).not.toBe(e); expect(e.blueprint).toBeUndefined();
    expect(next.blueprint?.subject.id).toBe("chemistry"); expect(next.blueprint?.schemaVersion).toBe(1);
    expect(next.sections).toBe(e.sections);
  });
});
