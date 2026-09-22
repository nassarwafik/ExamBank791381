// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

// Integrity of the COMMITTED Exam Library data (api/src/data/exam-library): the catalog entry, the item
// header and the stored examSnapshot must agree, and contentHash must be the hash the build script
// writes (sha256 of the stored questions). The F06 block pins the teacher marks rule that fixed the
// only 0-mark question in the library (LIB-F06-Q45): Q45 = 4, Q41..Q44 = 3, total unchanged at 154.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "src", "data", "exam-library");
const catalog = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "catalog.json"), "utf8"));
const readItem = id => JSON.parse(fs.readFileSync(path.join(DATA_DIR, "items", id + ".json"), "utf8"));
const sha256 = s => crypto.createHash("sha256").update(s).digest("hex");
const sumMarks = qs => qs.reduce((s, q) => s + (Number(q.marks) || 0), 0);

describe("committed exam-library data integrity", () => {
  it("has the full 36-item catalog (T01..T30 + F01..F06)", () => {
    const ids = catalog.map(c => c.libraryItemId).sort();
    expect(ids).toHaveLength(36);
    expect(ids.filter(id => /^T\d\d$/.test(id))).toHaveLength(30);
    expect(ids.filter(id => /^F0[1-6]$/.test(id))).toHaveLength(6);
  });

  it("every item: contentHash = sha256(stored questions); catalog, item header and snapshot agree on hash / totals / count", () => {
    for (const entry of catalog) {
      const item = readItem(entry.libraryItemId);
      const questions = item.examSnapshot.questions;
      const hash = sha256(JSON.stringify(questions));
      expect(item.contentHash, entry.libraryItemId + " item hash").toBe(hash);
      expect(entry.contentHash, entry.libraryItemId + " catalog hash").toBe(hash);
      expect(item.examSnapshot.totalMarks, entry.libraryItemId + " snapshot total").toBe(sumMarks(questions));
      expect(item.totalMarks, entry.libraryItemId + " item total").toBe(item.examSnapshot.totalMarks);
      expect(entry.totalMarks, entry.libraryItemId + " catalog total").toBe(item.examSnapshot.totalMarks);
      expect(entry.questionCount, entry.libraryItemId + " catalog count").toBe(questions.length);
      expect(item.questionCount, entry.libraryItemId + " item count").toBe(questions.length);
    }
  });

  it("every T-series training totals exactly 100 marks (the Unified Strength percentage base)", () => {
    for (const entry of catalog.filter(c => /^T\d\d$/.test(c.libraryItemId))) {
      expect(readItem(entry.libraryItemId).examSnapshot.totalMarks, entry.libraryItemId).toBe(100);
    }
  });

  it("no library question is worth 0 marks", () => {
    for (const entry of catalog) {
      const zero = readItem(entry.libraryItemId).examSnapshot.questions.filter(q => !(Number(q.marks) > 0));
      expect(zero.map(q => q.examQuestionId), entry.libraryItemId).toEqual([]);
    }
  });

  it("F06 marks rule: Q45 (manual extra exercise) = 4, Q41..Q44 = 3, 45 questions, total still 154", () => {
    const f06 = readItem("F06");
    const byId = Object.fromEntries(f06.examSnapshot.questions.map(q => [q.examQuestionId, q]));
    expect(f06.examSnapshot.questions).toHaveLength(45);
    expect(byId["LIB-F06-Q45"]).toMatchObject({ sourceQuestionId: "g11", presentationType: "open", marks: 4 });
    expect(Object.keys(byId["LIB-F06-Q45"].answer)).toHaveLength(0); // still teacher-graded
    for (const n of [41, 42, 43, 44]) expect(byId["LIB-F06-Q" + n].marks, "Q" + n).toBe(3);
    expect(byId["LIB-F06-Q40"].marks).toBe(4);
    const dist = {};
    for (const q of f06.examSnapshot.questions) dist[q.marks] = (dist[q.marks] || 0) + 1;
    expect(dist).toEqual({ 3: 26, 4: 19 });
    expect(f06.examSnapshot.totalMarks).toBe(154);
  });
});
