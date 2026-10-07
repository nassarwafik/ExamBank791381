// Phase 20F — the AI Full Exam Composer: HARD bounds of every request, plan, draft and patch (one place; pure; shared server build).
// Teacher text never produces an unbounded model request: the server refuses before any provider call, and every normalizer refuses an
// AI result beyond these bounds (fail closed — never truncated into a different meaning).
export const COMPOSER_VERSION = "AI_COMPOSER_V1";
export const COMPOSER_LIMITS = Object.freeze({
  instructionChars: 4000,
  shortText: 120,
  titleChars: 200,
  topicChars: 80,
  topics: 20,
  learningGoals: 8,
  goalChars: 200,
  rationaleChars: 240,
  sections: 8,
  itemsPerSection: 30,
  items: 60,
  totalMarksMax: 1000,
  itemMarksMax: 100,
  durationMax: 600,
  compositeGroups: 4,
  compositeParts: 12,
  richBlocks: 12,
  richItems: 20,
  richTableRows: 20,
  richTableColumns: 8,
  richTextChars: 2000,
  richSourceChars: 4000,
  patchOperations: 40,
  repairAttempts: 2,
  functionSims: 6,                // function-study simulators judged per section draft / patch (each runs a bounded completeness probe)
  aiContextBytes: 60000,
  requestBytes: 2_000_000,
  historyEntries: 20,
  historySummaryChars: 140,
  assetDescriptionChars: 300,
  unsupportedRequests: 10
});
export type ComposerIssue = { code: string; message: string; path?: string; sectionId?: string; questionId?: string };
