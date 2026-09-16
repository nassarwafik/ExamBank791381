// TEACHER-ONLY presentation mapping for stage statuses. `helpers.ts` (STATUS_META with its emoji icons)
// is shared with the student portal panel and stays untouched; teacher components read labels through
// `statusLabel` and take tones/abbreviations from here, so student rendering cannot change by accident.
import type { BadgeTone } from "../ui/StatusBadge";
import type { ProgressTone } from "../ui/ProgressBar";
import type { StageStatus } from "./types";
import { statusLabel } from "./helpers";

export const STAGE_STATUS_ORDER: StageStatus[] = ["not_started", "in_progress", "ready_for_review", "approved"];

export const STAGE_STATUS_TONE: Record<StageStatus, BadgeTone> = {
  not_started: "neutral",
  in_progress: "warn",
  ready_for_review: "info",
  approved: "success"
};

/** One-letter visible abbreviation for dense grids (heatmap); the full label is always exposed as text too. */
export const STAGE_STATUS_ABBR: Record<StageStatus, string> = {
  not_started: "—",
  in_progress: "ج",
  ready_for_review: "ف",
  approved: "م"
};

export const STAGE_STATUS_CLASS: Record<StageStatus, string> = {
  not_started: "is-not-started",
  in_progress: "is-in-progress",
  ready_for_review: "is-ready",
  approved: "is-approved"
};

export function stageStatusLabel(status: StageStatus): string {
  return statusLabel(status);
}

export function normalizeStageStatus(status: string | undefined | null): StageStatus {
  return (STAGE_STATUS_ORDER as string[]).includes(String(status || "")) ? (status as StageStatus) : "not_started";
}

/** Track progress bars cycle these token tones by track index (stable per position, no hard-coded track ids). */
export const SERIES_TONES: ProgressTone[] = ["series-1", "series-2", "series-3", "series-4"];
export function toneForTrack(i: number): ProgressTone { return SERIES_TONES[i % SERIES_TONES.length]; }
