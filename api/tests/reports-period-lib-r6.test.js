// Reports R-6 — the pure rules behind the publication date (docs/enterprise-reports-period-r6.md §3): what counts as a stamp,
// when it is written, and the one date the reports use for an assessment. The handlers are driven in reports-period-r6.test.js.
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const cjs = createRequire(import.meta.url);
const life = cjs("../src/lib/assignment-lifecycle.js");
const period = cjs("../src/lib/reports/period.js");
const { parseDateRange } = cjs("../src/lib/reports/date-range.js");

const PUB = "2026-03-10T09:00:00.000Z", MADE = "2026-01-10T09:00:00.000Z";

describe("R-6 publishedAtOf — a stamp is an ISO instant the server wrote, nothing else", () => {
  it("reads the instant as written (with or without milliseconds)", () => {
    expect(life.publishedAtOf({ publishedAt: PUB })).toBe(PUB);
    expect(life.publishedAtOf({ publishedAt: "2026-03-10T09:00:00Z" })).toBe("2026-03-10T09:00:00Z");
  });
  it("absent, empty, not a string, date-only, local time, an impossible date → no stamp", () => {
    for (const v of [undefined, null, "", " ", 0, 1773133200000, true, {}, [], "2026-03-10", "2026-03-10 09:00", "2026-03-10T09:00:00", "2026-03-10T09:00:00+02:00", "2026-13-45T09:00:00.000Z", "not a date", "10/03/2026"])
      expect(life.publishedAtOf({ publishedAt: v }), JSON.stringify(v)).toBe("");
    expect(life.publishedAtOf(null)).toBe("");
    expect(life.publishedAtOf(undefined)).toBe("");
  });
});

describe("R-6 stampFirstPublication — once", () => {
  it("writes `now` on a document with no stamp, and returns that document", () => {
    const doc = { status: "draft", createdAt: MADE };
    expect(life.stampFirstPublication(doc, PUB)).toBe(doc);
    expect(doc).toEqual({ status: "draft", createdAt: MADE, publishedAt: PUB });                  // the status is the caller's to set
  });
  it("keeps an existing stamp (publishing again does not move the first publication)", () => {
    const doc = { publishedAt: PUB };
    life.stampFirstPublication(doc, "2026-04-01T00:00:00.000Z");
    expect(doc.publishedAt).toBe(PUB);
  });
  it("replaces a value that is not a readable stamp", () => {
    for (const bad of ["", "not a date", 5, null, "2026-03-10"]) {
      const doc = { publishedAt: bad };
      life.stampFirstPublication(doc, PUB);
      expect(doc.publishedAt).toBe(PUB);
    }
  });
  it("archive and restore carry the stamp along untouched", () => {
    const archived = life.applyAssignmentArchive({ status: "published", publishedAt: PUB, createdAt: MADE }, { actor: "t", now: "2026-04-01T00:00:00.000Z" });
    expect(archived.publishedAt).toBe(PUB);
    expect(life.applyAssignmentRestore(archived, { now: "2026-04-02T00:00:00.000Z" }).publishedAt).toBe(PUB);
  });
});

describe("R-6 the one date of an assessment for the reports", () => {
  it("the publication when it is stamped, the creation otherwise; nothing when it has neither", () => {
    expect(period.assessmentDate({ publishedAt: PUB, createdAt: MADE })).toBe(PUB);
    expect(period.assessmentDate({ createdAt: MADE })).toBe(MADE);
    expect(period.assessmentDate({ publishedAt: "not a date", createdAt: MADE })).toBe(MADE);
    expect(period.assessmentDate({})).toBe("");
    expect(period.assessmentDate(null)).toBe("");
  });
  it("datedByCreation says which of the two it was", () => {
    expect(period.datedByCreation({ publishedAt: PUB, createdAt: MADE })).toBe(false);
    expect(period.datedByCreation({ createdAt: MADE })).toBe(true);
    expect(period.datedByCreation({ publishedAt: 0, createdAt: MADE })).toBe(true);
  });
  it("inPeriod filters by that date, inclusive of both days; an empty range keeps everything; no usable date → out of any range", () => {
    const list = [{ id: "late", publishedAt: PUB, createdAt: MADE }, { id: "old", createdAt: MADE }, { id: "none" }];
    const idsIn = (from, to) => period.inPeriod(list, parseDateRange(from, to)).map(a => a.id);
    expect(idsIn("2026-03-10", "2026-03-10")).toEqual(["late"]);
    expect(idsIn("2026-01-10", "2026-01-10")).toEqual(["old"]);
    expect(idsIn("2026-03-11", "")).toEqual([]);
    expect(idsIn("", "")).toEqual(["late", "old", "none"]);
    expect(idsIn("2000-01-01", "2100-01-01")).toEqual(["late", "old"]);
  });
  it("byAssessmentDate: oldest first by that date; the same instant keeps creation order", () => {
    const a = { id: "a", createdAt: "2026-01-01T00:00:00.000Z", publishedAt: "2026-03-01T00:00:00.000Z" };
    const b = { id: "b", createdAt: "2026-02-01T00:00:00.000Z" };
    const c = { id: "c", createdAt: "2026-02-15T00:00:00.000Z", publishedAt: "2026-03-01T00:00:00.000Z" };
    expect([c, a, b].sort(period.byAssessmentDate).map(x => x.id)).toEqual(["b", "a", "c"]);
  });
  it("periodBasis: the criterion, and how many of the given assessments are dated by creation", () => {
    expect(period.PERIOD_CRITERION).toBe("publishedAt");
    expect(period.periodBasis([])).toEqual({ criterion: "publishedAt", byCreation: 0 });
    expect(period.periodBasis([{ publishedAt: PUB }, { createdAt: MADE }, { publishedAt: "x", createdAt: MADE }])).toEqual({ criterion: "publishedAt", byCreation: 2 });
  });
});
