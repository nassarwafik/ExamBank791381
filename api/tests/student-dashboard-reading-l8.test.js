import { describe, it, expect } from "vitest";
import { handler as dashboardHandler } from "../src/functions/student-dashboard.js";
import { latestReadingPosition } from "../src/lib/learning-progress.js";

// Phase L.8 — found by the real-browser gate: on another device the Today Hub offered «ابدأ الآن» at the first unit although the
// server knew the last page the student read (L.3). The dashboard's `study.lastActivity` (the Hub's server continuation) is now
// the NEWER of the last study completion and the last page read, in the same shape { courseId, moduleId, pageId, completedAt }.

const student = { userId: "u1", classId: "c1", code: "S1", displayName: "علي", active: true, shareAchievements: true };
const deps = store => ({
  requireActiveStudentSession: async () => ({ ok: true, container: {}, student }),
  downloadJsonOrNull: async (_c, key) => (store.has(key) ? structuredClone(store.get(key)) : null),
  listJson: async (_c, prefix) => [...store.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => structuredClone(v)),
});
const dreq = () => ({ method: "GET", url: "http://x/student-dashboard", headers: { get: () => null } });
const STUDY = "platform/learning-study/u1.json", PROGRESS = "platform/learning-progress/u1.json";
const studied = at => ({ schemaVersion: 1, pages: { "791381-m03-l01-p02": { courseId: "791381", moduleId: "791381-m03", completed: { a1: at } } } });
const read = (at, pageId = "791381-m05-l02-p01", moduleId = "791381-m05") => ({ schemaVersion: 1, courses: { "791381": { lastPageId: pageId, lastModuleId: moduleId, lastReadAt: at, pages: { [pageId]: at } } } });
const last = async store => (await dashboardHandler(dreq(), deps(store))).jsonBody.study.lastActivity;

describe("L.8 — the Today Hub's server continuation includes the last page read", () => {
  it("only a reading position (no exercise done yet): the Hub continues at the last page read", async () => {
    const store = new Map([[PROGRESS, read("2026-10-17T10:00:00.000Z")]]);
    expect(await last(store)).toEqual({ courseId: "791381", moduleId: "791381-m05", pageId: "791381-m05-l02-p01", completedAt: "2026-10-17T10:00:00.000Z" });
  });
  it("a reading position newer than the last exercise wins; an older one does not", async () => {
    const store = new Map([[STUDY, studied("2026-10-17T09:00:00.000Z")], [PROGRESS, read("2026-10-17T10:00:00.000Z")]]);
    expect((await last(store)).pageId).toBe("791381-m05-l02-p01");
    store.set(STUDY, studied("2026-10-17T11:00:00.000Z"));
    expect(await last(store)).toEqual({ courseId: "791381", moduleId: "791381-m03", pageId: "791381-m03-l01-p02", completedAt: "2026-10-17T11:00:00.000Z" });
  });
  it("no document, an empty one or a malformed reading time → the study continuation alone (or null)", async () => {
    expect(await last(new Map())).toBeNull();
    expect(await last(new Map([[PROGRESS, { schemaVersion: 1, courses: {} }]]))).toBeNull();
    const store = new Map([[STUDY, studied("2026-10-17T09:00:00.000Z")], [PROGRESS, read("not-a-date")]]);
    expect((await last(store)).pageId).toBe("791381-m03-l01-p02");
  });
  it("latestReadingPosition: the newest course wins; a course without a page or module is skipped", () => {
    const doc = { schemaVersion: 1, courses: {
      "791381": { lastPageId: "791381-m02-l01-p01", lastModuleId: "791381-m02", lastReadAt: "2026-10-01T10:00:00.000Z", pages: {} },
      "123456": { lastPageId: "123456-m01-l01-p01", lastModuleId: "123456-m01", lastReadAt: "2026-10-05T10:00:00.000Z", pages: {} },
      "999999": { lastPageId: null, lastModuleId: null, lastReadAt: "2026-10-09T10:00:00.000Z", pages: {} },
    } };
    expect(latestReadingPosition(doc)).toEqual({ courseId: "123456", moduleId: "123456-m01", pageId: "123456-m01-l01-p01", completedAt: "2026-10-05T10:00:00.000Z" });
    expect(latestReadingPosition(null)).toBeNull();
  });
});
