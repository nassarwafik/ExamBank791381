// Phase T8 — the teacher's line for the tools a student opened during an attempt (the review summary). Kept apart from toolUsage.ts so
// the exam page never loads the catalog for it.
import { STUDENT_TOOLS_CATALOG } from "./studentToolsCatalog";

export type ToolUsageEntry = { toolId: string; opens: number; firstSeenAt?: string; lastSeenAt?: string };

/** "مرة واحدة" / "مرتان" / "3 مرات" / "11 مرة" — the Arabic count of openings. */
export function opensLabel(n: number): string {
  if (n === 1) return "مرة واحدة";
  if (n === 2) return "مرتان";
  return n <= 10 ? n + " مرات" : n + " مرة";
}

/** One line for the review summary: each known tool with its count, in the record's order ("" when there is nothing to show). */
export function toolUsageSummaryText(list: unknown): string {
  if (!Array.isArray(list)) return "";
  const parts: string[] = [];
  for (const e of list) {
    if (!e || typeof e !== "object") continue;
    const { toolId, opens } = e as ToolUsageEntry;
    const entry = STUDENT_TOOLS_CATALOG.find(c => c.id === toolId);
    if (!entry || typeof opens !== "number" || !Number.isInteger(opens) || opens < 1) continue;
    parts.push(entry.label + " (" + opensLabel(opens) + ")");
  }
  return parts.join("، ");
}
