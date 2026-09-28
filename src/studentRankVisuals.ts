// LEGACY six-rank artwork (PR #107's owner assets). The PRIMARY Student Strength presentation is the 25-stage path in
// src/studentStageVisuals.ts; these six images remain ONLY for their legitimate remaining consumers:
//   • the PROJECT TRACKER's own six-tier project ranks (src/projects/projectPerformance.ts — project_rank_up /
//     project_complete feed events and the project panel), which are a separate ladder from the Strength path;
//   • historical `global_rank_up` feed events from the six-rank era (rendered by AchievementFeed / TeacherDashboard
//     through `post.rank.tier` when a post carries no `stage`).
// Nothing here decides a stage. The 25-stage visual authority never imports these files.
//
// UX-7 — the six PERSONAL rank levels' custom artwork (author-provided final assets). This is the ONE central
// place that binds each rank tier to its image, its Arabic level name and its numeric level. Components import
// from here instead of scattering image imports; nothing here touches the rank cadence, the finalized count,
// medals or any threshold — it is presentation metadata for a tier that studentRank.ts already decided.
//
// The keys reuse the existing RankTier union (no second rank enum is introduced), so the mapping stays in lock
// step with RANK_ORDER: beginner→1 … legendary→6.
import { type RankTier } from "./studentRank";
import { sizedImageSet, type VisualImageSet } from "./studentVisualSizes";

// Phase 11C — the app ships the SIZED derivatives only (never the 1254² masters beside them); `?no-inline` keeps
// even the smallest file a separate cacheable asset instead of base64 inside the JS chunk.
const SIZED = import.meta.glob<string>("./assets/student-ranks/sized/*.png", { eager: true, query: "?no-inline", import: "default" });

/** The custom artwork (its sized derivatives) + Arabic level-name + level number for one rank tier. `alt` is the
 *  meaningful Arabic screen-reader text for the primary (earned) rank image. */
export type RankVisual = { tier: RankTier; images: VisualImageSet; title: string; level: number; alt: string };

/** The single source of truth mapping each RankTier to its author-provided image and Arabic level name. */
export const RANK_VISUALS: Record<RankTier, RankVisual> = {
  beginner:  { tier: "beginner",  images: sizedImageSet(SIZED, "rank-beginner"),  title: "بذرة القوة",      level: 1, alt: "رتبة بذرة القوة — المستوى 1" },
  bronze:    { tier: "bronze",    images: sizedImageSet(SIZED, "rank-bronze"),    title: "شعلة صغيرة",      level: 2, alt: "رتبة شعلة صغيرة — المستوى 2" },
  silver:    { tier: "silver",    images: sizedImageSet(SIZED, "rank-silver"),    title: "نمر البرق",       level: 3, alt: "رتبة نمر البرق — المستوى 3" },
  gold:      { tier: "gold",      images: sizedImageSet(SIZED, "rank-gold"),      title: "فارس الجليد",     level: 4, alt: "رتبة فارس الجليد — المستوى 4" },
  diamond:   { tier: "diamond",   images: sizedImageSet(SIZED, "rank-diamond"),   title: "تنين النار",      level: 5, alt: "رتبة تنين النار — المستوى 5" },
  legendary: { tier: "legendary", images: sizedImageSet(SIZED, "rank-legendary"), title: "العنقاء الذهبية", level: 6, alt: "رتبة العنقاء الذهبية — المستوى 6" },
};

/** The visual metadata for a tier (thin, explicit accessor so callers never index the record ad hoc). */
export function rankVisual(tier: RankTier): RankVisual {
  return RANK_VISUALS[tier];
}
