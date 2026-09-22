// The six-tier PROJECT rank vocabulary (tier ids + Arabic labels). This is now used ONLY by the project-performance
// feature (a project's own /600 rank — projectPerformance.ts / studentRankVisuals.ts) and the project achievement
// events. It is NOT the Student Strength progression: the visible Student Strength (نقاط القوة) is the 25-STAGE model
// decided by the server (api/src/lib/student-strength.js) and presented from src/student/strengthStages.ts. The old
// global-strength helpers (finalized × 100 → six tiers, 400-point blocks) have been retired and removed; nothing here
// derives or is authoritative for the visible Student Strength.

/** The six project-rank tiers. Ids, labels and the visual rank colors (studentRankVisuals) are preserved. */
export type RankTier = "beginner" | "bronze" | "silver" | "gold" | "diamond" | "legendary";
export const RANK_ORDER: RankTier[] = ["beginner", "bronze", "silver", "gold", "diamond", "legendary"];
export const RANK_LABELS: Record<RankTier, string> = { beginner: "مبتدئ", bronze: "برونزي", silver: "فضي", gold: "ذهبي", diamond: "ألماسي", legendary: "أسطوري" };
