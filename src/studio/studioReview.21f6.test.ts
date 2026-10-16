// Phase 21F.6 — the review step's pure derivations: readiness counts, the readiness state, the review list (blockers before warnings,
// each with what «إصلاح» does) and the distributions (declared order, empty levels kept on request, "unspecified" last).
import { describe, it, expect } from "vitest";
import type { BuilderSection } from "../examTypes";
import type { StructuredIssue } from "../examQuality";
import type { FinalizationDecision, FinalizationItem } from "../examFinalization";
import type { IssueTarget } from "../builder/issueIndex";
import { questionReadiness, readinessState, reviewItems, distribution } from "./studioReview";

const issue = (id: string, severity: "error" | "warning", questionId?: string) => ({ id, code: "X", severity, message: "م " + id, questionId }) as unknown as StructuredIssue;
const section = (id: string, qids: string[]) => ({ id, title: id, gradingPolicy: "all", questions: qids.map(q => ({ examQuestionId: q })) }) as unknown as BuilderSection;
const decision = (blockers: FinalizationItem[], warnings: FinalizationItem[], canFinalize: boolean) => ({ blockers, warnings, canFinalize }) as unknown as FinalizationDecision;

describe("21F.6 questionReadiness / readinessState", () => {
  it("counts questions by their worst issue and gives the share of questions without an error", () => {
    const issues = new Map<string, StructuredIssue[]>([["b", [issue("1", "warning")]], ["c", [issue("2", "warning"), issue("3", "error")]]]);
    const r = questionReadiness([section("s1", ["a", "b"]), section("s2", ["c"])], issues, false);
    expect(r).toEqual({ ok: 1, warn: 1, error: 1, total: 3, canFinalize: false, share: 67 });
    expect(questionReadiness([], issues, true).share).toBe(0);
  });
  it("empty → blocked → review → ready", () => {
    const r = questionReadiness([section("s1", ["a"])], new Map(), true);
    const w = { kind: "quality", id: "w", message: "", evidence: [] } as FinalizationItem;
    expect(readinessState({ ...r, total: 0 }, decision([], [], true))).toBe("empty");
    expect(readinessState(r, decision([w], [], false))).toBe("blocked");
    expect(readinessState(r, decision([], [w], true))).toBe("review");
    expect(readinessState(r, decision([], [], true))).toBe("ready");
  });
});

describe("21F.6 reviewItems", () => {
  it("lists blockers first; a structural issue with a place opens it, one without has no fix; gates open their panel", () => {
    const placed = issue("p", "error", "q1"), loose = issue("l", "error"), warn = issue("w", "warning", "q1");
    const target: IssueTarget = { kind: "question", id: "q1", label: "السؤال 1 في القسم 1" };
    const s = (i: StructuredIssue): FinalizationItem => ({ kind: "structural", id: i.id, message: i.message, evidence: [], structural: i });
    const items = reviewItems(decision(
      [s(placed), s(loose), { kind: "policy", id: "pol", message: "سياسة", evidence: [] }, { kind: "quality", id: "g", message: "بوابة", evidence: [] }],
      [s(warn)], false), new Map([[placed, target], [warn, target]]));
    expect(items.map(i => [i.level, i.source, i.fix?.kind ?? null, i.place])).toEqual([
      ["blocker", "structural", "issue", target.label],
      ["blocker", "structural", null, null],
      ["blocker", "policy", "policy", null],
      ["blocker", "quality", "readiness", null],
      ["warning", "structural", "issue", target.label]
    ]);
    expect(items[0].fix).toEqual({ kind: "issue", target, issue: placed });
    expect(new Set(items.map(i => i.id)).size).toBe(items.length);
  });
});

describe("21F.6 distribution", () => {
  const t = (count: number, officialMarks: number) => ({ count, weightMarks: officialMarks, officialMarks });
  it("follows the declared order, keeps empty declared levels on request, puts «unspecified» last, shares of the total", () => {
    const tally = { apply: t(1, 3), unspecified: t(1, 1), remember: t(1, 2), extra: t(1, 0) };
    const label = (k: string) => k.toUpperCase();
    expect(distribution(tally, label, 6, ["remember", "understand", "apply"], true).map(r => [r.key, r.count, r.marks, r.share])).toEqual([
      ["remember", 1, 2, 33], ["understand", 0, 0, 0], ["apply", 1, 3, 50], ["extra", 1, 0, 0], ["unspecified", 1, 1, 17]
    ]);
    expect(distribution(tally, label, 6, ["remember", "understand", "apply"]).map(r => r.key)).toEqual(["remember", "apply", "extra", "unspecified"]);
    expect(distribution(tally, label, 0).every(r => r.share === 0)).toBe(true);
  });
});
