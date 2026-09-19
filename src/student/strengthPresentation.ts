// Unified Strength (نقاط القوة) — presentation helpers for the portal. The server's `dashboard.strength` is the
// authority; this module only (a) normalizes that payload defensively and (b) provides the finalized-count
// compatibility fallback (finalized × 100, no practice, no projects) for an older API payload without `strength`,
// so the ring never disappears during a rollout. No points are ever computed from raw scores here.
import { strengthFromFinalized, strengthProgress } from "../studentRank";
import type { ProjectStrength, StudentStrength } from "./types";

const int = (value: unknown): number => { const n = Number(value); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; };

/** A well-formed StudentStrength from whatever the server sent; `finalized` feeds the compatibility fallback. */
export function normalizeStrength(raw: unknown, finalized: number | null | undefined): StudentStrength {
  const r = raw && typeof raw === "object" ? raw as Record<string, unknown> : null;
  if (!r || typeof r.totalPoints !== "number") {
    const examPoints = strengthFromFinalized(finalized);
    const p = strengthProgress(examPoints);
    return { totalPoints: examPoints, examPoints, practicePoints: 0, projectPoints: 0, levelBlockSize: p.needed, withinLevelPoints: p.withinBlock, nextLevelRemaining: p.remaining, percent: p.percent, projects: [] };
  }
  const totalPoints = int(r.totalPoints);
  const p = strengthProgress(totalPoints);
  const projects: ProjectStrength[] = Array.isArray(r.projects)
    ? (r.projects as unknown[]).filter((x): x is Record<string, unknown> => !!x && typeof x === "object").map(x => ({ projectCode: String(x.projectCode || ""), overallProgress: int(x.overallProgress), strengthPoints: int(x.strengthPoints) }))
    : [];
  return { totalPoints, examPoints: int(r.examPoints), practicePoints: int(r.practicePoints), projectPoints: int(r.projectPoints), levelBlockSize: p.needed, withinLevelPoints: p.withinBlock, nextLevelRemaining: p.remaining, percent: p.percent, projects };
}

/** The project contribution row for one project code (null when the server reported none). */
export function projectContribution(strength: StudentStrength | null | undefined, projectCode: string): ProjectStrength | null {
  return strength?.projects.find(p => p.projectCode === projectCode) ?? null;
}
