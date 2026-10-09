import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { publishAndAssign, takeExam } from "../certification-20g/lifecycle.js";
import { ledgerOf, attemptInvariants } from "../certification-20g/ledger.js";
import { scanProjection } from "../certification-20g/scan.js";
import { GRAPHS_ACCEPTANCE_PATH } from "../../../scripts/function-graphs-21a2-exam.mjs";

const require_ = createRequire(import.meta.url);
const { createPlatform } = require_("../certification-20g/platform.js");
const { normalizeDraftAnswers } = require_("../../src/lib/draft-answers.js");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const load = () => JSON.parse(fs.readFileSync(path.join(root, GRAPHS_ACCEPTANCE_PATH), "utf8"));
const sid = { "fg-perfect": "طالب مثالي", "fg-partial": "طالب جزئي", "fg-blank": "طالب بلا إجابات", "fg-attacker": "محاولة تلاعب" };
const sel = (graphId, ...targets) => ({ kind: "functionGraphSelection", graphId, targets });
const PERFECT = {
  a1: sel("g-quad", "point:p1", "point:p2"),
  b1: sel("g-rat", "line:l1"),
  c1: sel("g-sin", "point:q1"),
  d1: sel("g-piece", "point:m1"),
  e1: sel("g-meet", "point:e1", "point:e2"),
  f1: sel("g-tan", "tangent:t1"),
  g1: sel("g-area", "region:r1"),
  h1: sel("g-ar", "point:n1"),
  i1: { kind: "composite", parts: { part1: sel("g-circle", "curve:circ"), part2: { kind: "numeric", value: "2" } }, contexts: {} }
};
const PARTIAL = { ...PERFECT,
  a1: sel("g-quad", "point:p1"),
  b1: sel("g-rat", "line:l3"),
  e1: sel("g-meet", "point:e1")
};
const LEDGERS = {
  PERFECT: { a1: [4, 0], b1: [4, 0], c1: [4, 0], d1: [4, 0], e1: [4, 0], f1: [4, 0], g1: [4, 0], h1: [4, 0], i1: [6, 0] },
  PARTIAL: { a1: [2, 0], b1: [0, 0], c1: [4, 0], d1: [4, 0], e1: [2, 0], f1: [4, 0], g1: [4, 0], h1: [4, 0], i1: [6, 0] }
};
const PART_LEDGERS = { i1: { part1: [3, 0], part2: [3, 0] } };
const ATTACKER = {
  a1: sel("g-quad", "point:p1", "point:p1"),
  b1: sel("g-quad", "line:l1"),
  c1: sel("g-sin", "point:nonexistent"),
  h1: { ...sel("g-ar", "point:n2"), correct: true, score: 999, hiddenKey: "ATTACKER" }
};

// 21A.2 enterprise lifecycle: production handlers, storage, governance, immutable assignment,
// student delivery, autosave/restore, official grade, idempotent submit and teacher review.
// All marks are independently hand-derived; the actual grader is NEVER used to calculate expectations.
describe("21A2-PLATFORM complete function-graph exam lifecycle", () => {
  let platform, published, aid;
  const runs = {};
  beforeAll(async () => {
    platform = createPlatform({ students: sid });
    published = await publishAndAssign(platform, load());
    aid = published.aid;
    runs.PERFECT = await takeExam(platform, aid, "fg-perfect", PERFECT, { chunks: 3 });
    runs.PARTIAL = await takeExam(platform, aid, "fg-partial", PARTIAL, { chunks: 4 });
  }, 120000);

  it("teacher save/load/governance/publish/assign keep EVERY graph and official answer in the immutable snapshot", () => {
    expect(published.pub.ok).toBe(true);
    const original = load();
    const snapshot = platform.assignmentOf(aid).examSnapshot;
    expect(snapshot.sections.map(s => s.id)).toEqual(original.sections.map(s => s.id));
    expect(published.loaded.sections[0].questions[0].functionGraphSelection.graph).toEqual(original.sections[0].questions[0].functionGraphSelection.graph);
    expect(snapshot.sections[8].questions[0].composite.contexts[0].sources[0].richContent.blocks[1].graph).toEqual(original.sections[8].questions[0].composite.contexts[0].sources[0].richContent.blocks[1].graph);
    expect(snapshot.sections[0].questions[0].answer).toEqual(original.sections[0].questions[0].answer);
  });

  it("student pre-start never exposes the exam; delivery displays curves but not keys, roles or on-curve claims", () => {
    for (const [name, run] of Object.entries(runs)) {
      expect([run.preStart.status, run.start.status, run.startAgain.status, run.delivery.status], name).toEqual([200, 200, 200, 200]);
      expect(JSON.stringify(run.preStart.jsonBody), name).not.toContain("g-quad");
      const delivered = run.delivery.jsonBody.assignment.exam;
      expect(delivered.sections).toHaveLength(9);
      const selection = delivered.sections[0].questions[0].functionGraphSelection;
      expect(selection.graph.curves[0].expression).toBe("x^2 - 4*x + 3");
      expect(selection.graph.points).toHaveLength(4);
      const shared = delivered.sections[8].questions[0].composite.contexts[0].sources[0].richContent.blocks[1].graph;
      expect(shared.curves).toHaveLength(2);
      expect(JSON.stringify(run.delivery.jsonBody), name).not.toMatch(/"correct"|"scoring"|"role"|"on"|"derivativeOf"|"slope"/);
      // The 20G privacy scanner bans the legacy visual-question private "regions" answer-key field.
      // 21A.2 defines a different, PUBLIC graph.regions drawing primitive. Exempt ONLY these
      // exact validated graph paths, never a sibling or a generic "regions" field.
      const publicGraphRegionPaths = [/\\.functionGraphSelection\\.graph\\.regions$/, /\\.richContent\\.blocks\\[\\d+\\]\\.graph\\.regions$/];
      expect(scanProjection(run.delivery.jsonBody, { secrets: ["correctOptionIndex", "gradingKey", "hiddenTests"], allowKeysAt: publicGraphRegionPaths }), name).toEqual([]);
    }
  });

  it("retains the privacy scanner\u2019s forbidden legacy regions key outside validated graph paths", () => {\n    const publicGraphRegionPaths = [/\\.functionGraphSelection\\.graph\\.regions$/, /\\.richContent\\.blocks\\[\\d+\\]\\.graph\\.regions$/];\n    expect(scanProjection({ regions: [{ answer: "leaked" }] }, { allowKeysAt: publicGraphRegionPaths }).map(f => f.key)).toContain("regions");\n  });\n\n  it("semantic graph answers autosave and restore through server state; official ledgers are 38 / 30", () => {
    for (const [name, run] of Object.entries(runs)) {
      expect(run.restores.length, name).toBeGreaterThan(1);
      for (const restore of run.restores) {
        expect(restore.status, name).toBe(200);
        expect(restore.restored, name).toEqual(restore.expected.answers);
      }
      expect(run.restores.at(-1).restored.a1, name).toEqual(run.answers.a1);
      expect([run.submit.status, run.duplicateSubmit.status], name).toEqual([200, 409]);
      expect(ledgerOf(run.attempt).questions, name).toEqual(LEDGERS[name]);
      expect(ledgerOf(run.attempt).parts, name).toEqual(PART_LEDGERS);
      expect([run.attempt.score, run.attempt.totalMarks, run.attempt.finalized], name).toEqual([name === "PERFECT" ? 38 : 30, 38, true]);
      expect(attemptInvariants(run.attempt, 38), name).toEqual([]);
    }
  });

  it("blank submission scores exactly 0 and leaves no teacher-review marks", async () => {
    const student = platform.student("fg-blank");
    expect((await student.start(aid)).status).toBe(200);
    expect((await student.submit(aid, {})).status).toBe(200);
    const attempt = student.attempt(aid);
    expect(ledgerOf(attempt).questions).toEqual(Object.fromEntries(Object.keys(LEDGERS.PERFECT).map(id => [id, [0, 0]])));
    expect([attempt.score, attempt.manualReviewMarks, attempt.finalized]).toEqual([0, 0, true]);
    expect(attemptInvariants(attempt, 38)).toEqual([]);
  });

  it("forged graph targets and self-grading fields cannot become accepted official answers", async () => {
    const snapshot = platform.assignmentOf(aid).examSnapshot;
    const normalized = normalizeDraftAnswers(ATTACKER, snapshot);
    expect(normalized.rejected.map(r => [r.id, r.code]).sort()).toEqual([
      ["a1", "GRAPH_SELECTION_DUPLICATE"],
      ["b1", "GRAPH_SELECTION_GRAPH_MISMATCH"],
      ["c1", "GRAPH_SELECTION_TARGET_UNKNOWN"]
    ]);
    expect(normalized.answers).toEqual({ h1: sel("g-ar", "point:n2") });
    const student = platform.student("fg-attacker");
    expect((await student.start(aid)).status).toBe(200);
    expect((await student.draft(aid, ATTACKER)).status).toBe(200);
    expect((await student.state(aid)).jsonBody.state.draftAnswers).toEqual(normalized.answers);
    expect((await student.submit(aid, ATTACKER)).status).toBe(200);
    const attempt = student.attempt(aid);
    expect([attempt.score, attempt.manualReviewMarks, attempt.finalized]).toEqual([0, 0, true]);
    expect(JSON.stringify(attempt)).not.toContain("ATTACKER");
    expect(attemptInvariants(attempt, 38)).toEqual([]);
  });

  it("teacher review receives the private canonical graph keys and actual semantic answers, then saves audit", async () => {
    const response = await platform.teacher.reviewGet(aid, "fg-partial");
    expect(response.status).toBe(200);
    const byId = Object.fromEntries(response.jsonBody.questions.map(q => [q.questionId, q]));
    for (const [id, [score]] of Object.entries(LEDGERS.PARTIAL)) expect(byId[id].autoGrade.score, id).toBe(score);
    expect(byId.a1.functionGraphSelection.graph.id).toBe("g-quad");
    expect(byId.a1.expectedAnswer.correct).toEqual(["point:p1", "point:p2"]);
    expect(byId.a1.studentAnswer).toEqual(PARTIAL.a1);
    expect(byId.i1.composite.groups[0].parts[0].functionGraphSelection.graph.id).toBe("g-circle");
    const saved = await platform.teacher.saveReview(aid, "fg-partial", {}, 1, "اعتماد رسم الدوال");
    expect([saved.status, saved.jsonBody.result.score, saved.jsonBody.result.finalized]).toEqual([200, 30, true]);
  });
});
