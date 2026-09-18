// UX-7 — the six PERSONAL rank levels' custom artwork (author-provided final assets). This is the ONE central
// place that binds each rank tier to its image, its Arabic level name and its numeric level. Components import
// from here instead of scattering image imports; nothing here touches the rank cadence, the finalized count,
// medals or any threshold — it is presentation metadata for a tier that studentRank.ts already decided.
//
// The keys reuse the existing RankTier union (no second rank enum is introduced), so the mapping stays in lock
// step with RANK_ORDER: beginner→1 … legendary→6.
import { type RankTier } from "./studentRank";
import rankBeginner from "./assets/student-ranks/rank-beginner.png";
import rankBronze from "./assets/student-ranks/rank-bronze.png";
import rankSilver from "./assets/student-ranks/rank-silver.png";
import rankGold from "./assets/student-ranks/rank-gold.png";
import rankDiamond from "./assets/student-ranks/rank-diamond.png";
import rankLegendary from "./assets/student-ranks/rank-legendary.png";

/** The custom artwork + Arabic level-name + level number for one rank tier. `alt` is the meaningful Arabic
 *  screen-reader text for the primary (earned) rank image. */
export type RankVisual = { tier: RankTier; image: string; title: string; level: number; alt: string };

/** The single source of truth mapping each RankTier to its author-provided image and Arabic level name. */
export const RANK_VISUALS: Record<RankTier, RankVisual> = {
  beginner:  { tier: "beginner",  image: rankBeginner,  title: "بذرة القوة",      level: 1, alt: "رتبة بذرة القوة — المستوى 1" },
  bronze:    { tier: "bronze",    image: rankBronze,    title: "شعلة صغيرة",      level: 2, alt: "رتبة شعلة صغيرة — المستوى 2" },
  silver:    { tier: "silver",    image: rankSilver,    title: "نمر البرق",       level: 3, alt: "رتبة نمر البرق — المستوى 3" },
  gold:      { tier: "gold",      image: rankGold,      title: "فارس الجليد",     level: 4, alt: "رتبة فارس الجليد — المستوى 4" },
  diamond:   { tier: "diamond",   image: rankDiamond,   title: "تنين النار",      level: 5, alt: "رتبة تنين النار — المستوى 5" },
  legendary: { tier: "legendary", image: rankLegendary, title: "العنقاء الذهبية", level: 6, alt: "رتبة العنقاء الذهبية — المستوى 6" },
};

/** The visual metadata for a tier (thin, explicit accessor so callers never index the record ad hoc). */
export function rankVisual(tier: RankTier): RankVisual {
  return RANK_VISUALS[tier];
}
