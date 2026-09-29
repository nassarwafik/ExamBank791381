import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { logReadCost } from "../src/lib/read-cost-log.js";

// Phase 12E-A — the read-cost telemetry is COUNT-ONLY. Source guard over the two call sites (exact field names, and
// every value is a count expression — never an id / name / title / mark / submission / token) + the helper contract
// (non-numbers are dropped, a throwing logger is inert).

const src = rel => readFileSync(fileURLToPath(new URL("../src/" + rel, import.meta.url)), "utf8");
function readCostCalls(code) {
  return [...code.matchAll(/logReadCost\(obs,"([^"]+)",\{([^}]*)\}\)/g)].map(m => ({
    event: m[1],
    fields: m[2].split(",").map(p => { const i = p.indexOf(":"); return [p.slice(0, i).trim(), p.slice(i + 1).trim()]; })
  }));
}
// A count expression: `<identifier>.length`, `tally.<counter>` or the index loader's stats (`idxStats.<counter>` /
// `idx.stats.<counter>`, Phase 12E-B) — nothing that can carry content.
const COUNT_EXPR = /^(?:[A-Za-z_$][\w$]*\.length|tally\.[A-Za-z]+|idxStats\.[A-Za-z]+|idx\.stats\.[A-Za-z]+)$/;
const FORBIDDEN = /(id|Id|ID|name|Name|title|Title|mark|score|percentage|token|studentId|classId|assignmentId|displayName)\b/;

describe("12E-A read-cost observability — source guard", () => {
  it("student-dashboard emits exactly one count-only event with the eight documented fields", () => {
    const calls = readCostCalls(src("functions/student-dashboard.js"));
    expect(calls.map(c => c.event)).toEqual(["student.dashboard.read_cost"]);
    expect(calls[0].fields.map(f => f[0])).toEqual(["assignmentDocsScanned", "publishedClassAssignments", "submissionReads", "assignmentIndexReads", "assignmentIndexesBootstrapped", "globalAssignmentScans", "assignmentIndexAuthoritative", "assignmentIndexAuthorityChanges"]);
    for (const [, expr] of calls[0].fields) { expect(expr).toMatch(COUNT_EXPR); expect(expr.replace(/\.length$/, "")).not.toMatch(FORBIDDEN); }
  });

  it("teacher-today emits exactly one count-only event with the eleven documented fields", () => {
    const calls = readCostCalls(src("functions/teacher-today.js"));
    expect(calls.map(c => c.event)).toEqual(["teacher.today.read_cost"]);
    expect(calls[0].fields.map(f => f[0])).toEqual(["assignmentDocsScanned", "classDocsScanned", "userDocsScanned", "publishedActiveAssignments", "submissionFolderListings", "submissionDocsLoaded", "assignmentIndexReads", "assignmentIndexesBootstrapped", "globalAssignmentScans", "assignmentIndexAuthoritative", "assignmentIndexAuthorityChanges"]);
    for (const [, expr] of calls[0].fields) { expect(expr).toMatch(COUNT_EXPR); expect(expr.replace(/\.length$/, "")).not.toMatch(FORBIDDEN); }
  });

  it("no other read-cost event exists in the API sources (only the two hot paths are instrumented)", () => {
    for (const rel of ["functions/student-notifications.js", "lib/notification-center.js", "lib/student-notifications.js", "lib/platform-storage.js", "lib/class-assignment-index.js", "functions/manage-assignments.js", "functions/assignment-index-control.js"]) {
      expect(src(rel)).not.toContain("logReadCost");
    }
  });
});

describe("12E-A read-cost observability — helper contract", () => {
  it("forwards only finite, non-negative numbers (floored); strings, ids, objects, NaN and negatives are dropped", () => {
    const got = [];
    logReadCost({ logInfo: (e, f) => got.push([e, f]) }, "x.read_cost", { a: 3, b: 2.9, id: "u1", title: "واجب", obj: { n: 1 }, nan: NaN, neg: -1, inf: Infinity, big: 1e3 });
    expect(got).toEqual([["x.read_cost", { a: 3, b: 2, big: 1000 }]]);
  });
  it("a throwing or missing logger is inert", () => {
    expect(() => logReadCost({ logInfo: () => { throw new Error("down"); } }, "x", { a: 1 })).not.toThrow();
    expect(() => logReadCost(null, "x", { a: 1 })).not.toThrow();
    expect(() => logReadCost({}, "x", { a: 1 })).not.toThrow();
  });
});
