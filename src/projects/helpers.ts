// Presentational helpers for the generic Project Tracker. All progress math is computed on the backend
// and returned ready-made; these only label statuses and filter/search already-computed cards.
import type { StageStatus, StudentCard, StudentFilter } from "./types";

export const STATUS_META: Record<StageStatus, { label: string; icon: string; className: string }> = {
  not_started: { label: "لم يبدأ", icon: "⬜", className: "status-not-started" },
  in_progress: { label: "قيد التنفيذ", icon: "🟡", className: "status-in-progress" },
  ready_for_review: { label: "جاهز للفحص", icon: "🔵", className: "status-ready" },
  approved: { label: "تم الاعتماد", icon: "✅", className: "status-approved" }
};

export function statusLabel(status: StageStatus): string {
  return (STATUS_META[status] || STATUS_META.not_started).label;
}

export function trackIcon(icon?: string): string {
  return icon || "📁";
}

export function filterStudentCards(cards: StudentCard[], filter: StudentFilter, search: string, lateThreshold: number): StudentCard[] {
  const term = search.trim().toLowerCase();
  return cards.filter(card => {
    if (term && !(card.displayName.toLowerCase().includes(term) || String(card.code || "").toLowerCase().includes(term))) return false;
    switch (filter) {
      case "ready": return card.readyForReviewCount > 0;
      case "late": return !card.complete && card.overallProgress < lateThreshold;
      case "not_started": return card.overallProgress === 0 && card.counts.in_progress === 0 && card.readyForReviewCount === 0;
      case "complete": return card.complete;
      case "stale": return card.stale;
      default: return true;
    }
  });
}

export function fmtDate(iso: string): string {
  return iso ? new Date(iso).toLocaleDateString("ar") : "—";
}

// Groups a track's stages by group, preserving order, for the accordion in student detail.
export function stagesByGroup<T extends { groupId: string; order: number; track: string }>(stages: T[], track: string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const s of stages.filter(x => x.track === track).sort((a, b) => a.order - b.order)) {
    if (!map.has(s.groupId)) map.set(s.groupId, []);
    map.get(s.groupId)!.push(s);
  }
  return map;
}
