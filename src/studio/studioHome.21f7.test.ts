// Phase 21F.7 — «امتحاناتي» filtering and the publish timeline (pure).
import { describe, it, expect } from "vitest";
import { filterHomeExams, homeCounts, searchKey, type HomeExam } from "./studioHome";
import { publishTimeline } from "./studioPublishState";

const e = (examId: string, title: string, extra: Partial<HomeExam> = {}): HomeExam => ({ blobName: "exams/" + examId + ".json", examId, title, savedAt: "", questionCount: 1, totalMarks: 1, ...extra });
const LIST = [
  e("A", "امتحان الشبكات", { kind: "structured", status: "draft", readiness: { canFinalize: true, blockers: 0, warnings: 0 } }),
  e("B", "اختبار الأمن", { kind: "structured", status: "draft", readiness: { canFinalize: false, blockers: 2, warnings: 0 } }),
  e("C", "النهائي", { kind: "structured", status: "final", readiness: { canFinalize: true, blockers: 0, warnings: 1 } }),
  e("L", "امتحان قديم", { kind: "legacy", status: "draft", readiness: null }),
  e("O", "من خادم أقدم")                                                    // no additive fields: a structured draft, readiness unknown
];

describe("21F.7 «امتحاناتي» filters", () => {
  it("counts and filters by status; legacy exams are only «قديمة»; unknown readiness is never «تحتاج إصلاحًا»", () => {
    expect(homeCounts(LIST)).toEqual({ all: 5, draft: 3, final: 1, fix: 1, legacy: 1 });
    expect(filterHomeExams(LIST, "draft", "").map(x => x.examId)).toEqual(["A", "B", "O"]);
    expect(filterHomeExams(LIST, "fix", "").map(x => x.examId)).toEqual(["B"]);
    expect(filterHomeExams(LIST, "legacy", "").map(x => x.examId)).toEqual(["L"]);
  });
  it("searches titles ignoring diacritics, alef / taa marbuta forms and extra spaces", () => {
    expect(searchKey("  الإمتِحانُ   النِّهائيّة ")).toBe("الامتحان النهائيه");
    expect(filterHomeExams(LIST, "all", "امتحان").map(x => x.examId)).toEqual(["A", "L"]);
    expect(filterHomeExams(LIST, "all", "الأمن").map(x => x.examId)).toEqual(["B"]);
    expect(filterHomeExams(LIST, "final", "الشبكات")).toEqual([]);
  });
});

describe("21F.7 publish timeline", () => {
  const st = (o: Parameters<typeof publishTimeline>[0]) => publishTimeline(o).map(s => s.key + ":" + s.state).join(" ");
  it("the first stage not done is the current one; later stages wait", () => {
    expect(st({ saveState: "dirty", canFinalize: false, final: false })).toBe("saved:now ready:later final:later assigned:later");
    expect(st({ saveState: "saved", canFinalize: false, final: false })).toBe("saved:done ready:now final:later assigned:later");
    expect(st({ saveState: "saved", canFinalize: true, final: false })).toBe("saved:done ready:done final:now assigned:later");
    expect(st({ saveState: "saved", canFinalize: true, final: true })).toBe("saved:done ready:done final:done assigned:now");
  });
  it("a final exam with unsaved edits (or a save in flight) is not final on the server", () => {
    expect(st({ saveState: "dirty", canFinalize: true, final: true })).toBe("saved:now ready:done final:later assigned:later");
    expect(st({ saveState: "saving", canFinalize: true, final: true })).toBe("saved:now ready:done final:later assigned:later");
  });
});
