// Phase L.6b — the module bodies the API serves (api/src/data/learning-content/<course>/<module>.json) carry NO answer material in
// any `practice` / `practice-table` block: no option `correct` flag, no `answer` / `answers`, no `feedback` (hints, right / wrong
// messages, explanation) and no select-cell `key`. The server keeps them (api/src/data/learning-check) and judges every answer.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { COURSE_CONTENT_MODULE_IDS } from "./registry";
import type { ContentBlock, ContentModule } from "./types";

const C = "791381";
const served = (moduleId: string): ContentModule => JSON.parse(readFileSync(fileURLToPath(new URL("../../../api/src/data/learning-content/" + C + "/" + moduleId + ".json", import.meta.url)), "utf8"));

/** Every answer-material field a served practice / practice-table block still carries, as "where.what" strings. */
function answerMaterial(block: ContentBlock): string[] {
  const out: string[] = [];
  if (block.type === "practice") {
    const q = block.question as unknown as Record<string, unknown>;
    for (const k of ["answer", "answers", "feedback"]) if (k in q) out.push(block.id + ".question." + k);
    if (Array.isArray(q.options)) (q.options as Record<string, unknown>[]).forEach((o, i) => { for (const k of Object.keys(o)) if (k !== "id" && k !== "text") out.push(block.id + ".options[" + i + "]." + k); });
  }
  if (block.type === "practice-table") {
    block.rows.forEach((row, r) => row.forEach((cell, c) => { if (typeof cell !== "string") for (const k of Object.keys(cell)) if (k !== "kind" && k !== "options") out.push(block.id + "[" + r + ":" + c + "]." + k); }));
  }
  return out;
}

describe("L.6b — the served module bodies carry no answer material", () => {
  it("no practice / practice-table block of any served module keeps a key, a feedback, a hint or an explanation", () => {
    let practice = 0, tables = 0;
    const leaks: string[] = [];
    for (const moduleId of COURSE_CONTENT_MODULE_IDS[C]) {
      for (const block of served(moduleId).lessons.flatMap(l => l.pages).flatMap(p => p.blocks)) {
        if (block.type === "practice") practice++;
        if (block.type === "practice-table") tables++;
        leaks.push(...answerMaterial(block));
      }
    }
    expect(leaks.length, leaks.slice(0, 5).join(", ")).toBe(0);
    expect([practice, tables]).toEqual([415, 64]);                         // every exercise of the book was looked at
  });
});
