import type { BuilderSection } from "../examTypes";
import type { StructuredIssue } from "../examQuality";
import type { FinalizationDecision, FinalizationItem } from "../examFinalization";
import type { IssueTarget } from "../builder/issueIndex";
import type { Tally } from "../assessmentBlueprint";

// Phase 21F.6 — the Studio's review step, as pure derivations of what the builder already computes: the ONE finalization decision
// (structural validity + quality gates), the issue index's targets and the assessment profile. Nothing here re-validates, scores or
// ranks: readiness is a count of questions without structural issues (operational, not an academic judgement), and the
// distributions are the profile's own tallies in display order.

/** Questions by their structural state — the same figures the outline's meter shows. */
export type QuestionReadiness = { ok: number; warn: number; error: number; total: number; canFinalize: boolean; share: number };

export function questionReadiness(sections: readonly BuilderSection[], issuesOf: ReadonlyMap<string, readonly StructuredIssue[]>, canFinalize: boolean): QuestionReadiness {
  let ok = 0, warn = 0, error = 0;
  for (const s of sections) for (const q of s.questions) {
    const list = issuesOf.get(q.examQuestionId);
    if (!list?.length) ok += 1; else if (list.some(i => i.severity === "error")) error += 1; else warn += 1;
  }
  const total = ok + warn + error;
  return { ok, warn, error, total, canFinalize, share: total ? Math.round(((ok + warn) / total) * 100) : 0 };
}

/** empty: nothing to finalize · blocked: finalization refused · review: allowed, with warnings · ready: allowed, nothing to note. */
export type ReadinessState = "empty" | "blocked" | "review" | "ready";
export function readinessState(r: QuestionReadiness, decision: FinalizationDecision): ReadinessState {
  if (r.total === 0) return "empty";
  if (!decision.canFinalize) return "blocked";
  return decision.warnings.length ? "review" : "ready";
}

/** One line of the review list. `fix` says what «إصلاح» does: open the issue where it lives, or the panel that owns the rule. */
export type ReviewFix = { kind: "issue"; target: IssueTarget; issue: StructuredIssue } | { kind: "readiness" } | { kind: "policy" } | null;
export type ReviewItem = { id: string; level: "blocker" | "warning"; source: FinalizationItem["kind"]; message: string; place: string | null; fix: ReviewFix };

export function reviewItems(decision: FinalizationDecision, targets: ReadonlyMap<StructuredIssue, IssueTarget>): ReviewItem[] {
  const one = (item: FinalizationItem, level: ReviewItem["level"], n: number): ReviewItem => {
    const target = item.structural ? targets.get(item.structural) : undefined;
    const fix: ReviewFix = item.kind === "structural"
      ? (target && item.structural ? { kind: "issue", target, issue: item.structural } : null)
      : item.kind === "policy" ? { kind: "policy" } : { kind: "readiness" };
    return { id: level + ":" + n + ":" + item.id, level, source: item.kind, message: item.message, place: target?.label ?? null, fix };
  };
  return [...decision.blockers.map((b, n) => one(b, "blocker", n)), ...decision.warnings.map((w, n) => one(w, "warning", n))];
}

/** One bar of a distribution: how many questions and how much of the official total they carry. */
export type DistributionRow = { key: string; label: string; count: number; marks: number; share: number };

const round2 = (n: number) => Math.round(n * 100) / 100;
/**
 * The rows of one profile tally, in `order` (keys absent from it follow in their own order), with "unspecified" last. `share` is the
 * part of `totalMarks` (0 when there are no marks). Rows with no question are dropped unless `keepEmpty` (a declared vocabulary
 * shows its empty levels too, so a teacher sees what the exam does NOT assess).
 */
export function distribution(tally: Readonly<Record<string, Tally>>, labelOf: (key: string) => string, totalMarks: number, order: readonly string[] = [], keepEmpty = false): DistributionRow[] {
  const keys = [...order.filter(k => keepEmpty || tally[k]?.count), ...Object.keys(tally).filter(k => !order.includes(k) && k !== "unspecified")];
  if (tally.unspecified?.count) keys.push("unspecified");
  return keys.map(key => {
    const t = tally[key];
    const marks = round2(t?.officialMarks ?? 0);
    return { key, label: labelOf(key), count: t?.count ?? 0, marks, share: totalMarks > 0 ? Math.round((marks / totalMarks) * 100) : 0 };
  });
}
