// @vitest-environment happy-dom
// UX-S4 (docs/enterprise-ux-student-s4.md §2.2) — the student's «المشاريع»: the grade and progress once (the hero's circle),
// the project rank and the general-Strength share named apart, the next step right after the hero by NAME, the evaluation
// as one line, one control per track, and a stage's worth (never «0 / N») before its mark. The teacher's views keep the
// facts list and the full evaluation card. Every value is the server's.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, within, fireEvent } from "@testing-library/react";
import StudentProjectPanel from "./StudentProjectPanel";
import ProjectRankHero from "./ProjectRankHero";
import ProjectEvaluationCard from "./ProjectEvaluationCard";
import { normalizeProjectPerformance } from "./projectPerformance";
import type { ProjectEvaluation, ProjectPerformance } from "./types";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const TRACKS = [{ trackId: "book", title: "الكتاب" }, { trackId: "lab", title: "المختبر" }];
const STAGES = [
  { stageId: "BK01", track: "book", groupId: "g1", title: "بداية الكتاب", order: 1, weight: 1, required: true, active: true },
  { stageId: "BK02", track: "book", groupId: "g1", title: "الجداول", order: 2, weight: 1, required: true, active: true },
  { stageId: "LB01", track: "lab", groupId: "g2", title: "أول مختبر", order: 1, weight: 1, required: true, active: true }
];
const GROUPS = [{ groupId: "g1", track: "book", title: "الفصل الأول", order: 1 }, { groupId: "g2", track: "lab", title: "المختبرات", order: 1 }];
const PERF = { overallProgress: 40, grade: 30, gradePrecise: 30, projectStrength: 120, maxStrength: 600, tier: "silver", level: 3, nextTier: "gold", complete: false,
  stageValues: { BK01: { stageId: "BK01", track: "book", status: "approved", score: 90, maxContribution: 10, contribution: 9, counted: true }, BK02: { stageId: "BK02", track: "book", status: "not_started", score: null, maxContribution: 7.5, contribution: 0, counted: false }, LB01: { stageId: "LB01", track: "lab", status: "not_started", score: null, maxContribution: 50, contribution: 0, counted: false } } };
const EVAL: ProjectEvaluation = { projectScore: 90, projectScorePrecise: 90, totalStages: 3, gradedStages: 1, ungradedStages: 2, evaluationProgress: 33, updatedAt: "2026-03-01T10:00:00.000Z", orphanStageIds: [],
  stages: STAGES.map(s => ({ stageId: s.stageId, track: s.track, groupId: s.groupId, title: s.title, order: s.order, required: true, status: "approved", score: s.stageId === "BK01" ? 90 : null, graded: s.stageId === "BK01", scoredAt: "", scoredBy: "" })) } as unknown as ProjectEvaluation;
const summary = { studentId: "s1", displayName: "ليان", code: "P1", overallProgress: 40, trackProgress: { book: 66.6, lab: 0 }, counts: { not_started: 2, in_progress: 0, ready_for_review: 0, approved: 1 }, readyForReviewCount: 0, complete: false, updatedAt: "2026-03-01T10:00:00.000Z", stale: false };
const PROJECT = { projectCode: "899373", title: "مشروع 899373", tracks: TRACKS, summary, performance: PERF, evaluation: EVAL, stages: STAGES, groups: GROUPS,
  progress: { BK01: { status: "approved", score: 90 } }, nextStages: { book: STAGES[1], lab: STAGES[2] } };
function mount(project: unknown = PROJECT) {
  globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, enrolled: true, className: "الصف", projects: [project] }) })) as unknown as typeof fetch;
  render(<StudentProjectPanel token="t" contributions={[{ projectCode: "899373", overallProgress: 40, strengthPoints: 160 }]} />);
  return screen.findByRole("region", { name: /مشاريعي/ });
}

describe("UX-S4 «المشاريع» — the student's project view", () => {
  it("grade and progress appear once (the circle); the rank and the general-Strength share are named apart", async () => {
    const r = await mount();
    expect(r.querySelector(".eb-prh-facts")).toBeNull();
    expect(r.querySelector(".eb-prh-strength")!.textContent).toBe("رتبتك في المشروع: 120 / 600");
    expect(r.querySelector(".eb-sp-project-strength")!.textContent).toBe("يضيف إلى قوتك العامة: 160 / 400");
    expect(r.textContent).not.toMatch(/قوة المشروع|نقاط القوة من المشروع|تقدم المشروع:/);
  });

  it("the next step comes right after the hero, by name; the stage code stays only in the button's accessible name", async () => {
    const r = await mount();
    const order = [...r.querySelectorAll(".eb-prh, .eb-sp-next-card, .eb-eval-card, .eb-sp-track-chips")].map(n => n.classList.contains("eb-prh") ? "hero" : n.classList.contains("eb-sp-next-card") ? "next" : n.classList.contains("eb-eval-card") ? "evaluation" : "tracks");
    expect(order).toEqual(["hero", "next", "evaluation", "tracks"]);
    const card = r.querySelector(".eb-sp-next-card") as HTMLElement;
    expect(card.querySelector("p")!.textContent).toBe("الخطوة التالية في الكتاب: الجداول");
    expect(within(card).getByRole("button", { name: "أنجزت BK02 — الجداول" })).toBeTruthy();
  });

  it("the evaluation is one line over the bar: no four facts, no list of ungraded stages", async () => {
    const r = await mount();
    const evalCard = r.querySelector(".eb-eval-card") as HTMLElement;
    expect(evalCard.querySelector(".eb-eval-summary")!.textContent).toBe("قيّم المعلم 1 من 3 مراحل · التقييم العام: 90 / 100");
    expect(evalCard.querySelector("dl")).toBeNull();
    expect(evalCard.textContent).not.toMatch(/مراحل لم تُقيّم بعد|BK02|LB01/);
  });

  it("several tracks: one button each, carrying the server's (rounded) track progress; no separate bars", async () => {
    const r = await mount();
    const group = within(screen.getByRole("group", { name: "مسارات المشروع" }));
    expect(group.getAllByRole("button").map(b => b.textContent)).toEqual(["الكتاب · 67%", "المختبر · 0%"]);
    expect(r.querySelector(".eb-sp-project-tracks")).toBeNull();
  });

  it("one track: one bar, no buttons", async () => {
    const one = { ...PROJECT, tracks: [TRACKS[0]], stages: STAGES.slice(0, 2), groups: GROUPS.slice(0, 1), nextStages: { book: STAGES[1] } };
    const r = await mount(one);
    expect(screen.queryByRole("group", { name: "مسارات المشروع" })).toBeNull();
    expect(within(screen.getByRole("list", { name: "تقدم المسارات" })).getByRole("progressbar", { name: "الكتاب" })).toBeTruthy();
    expect(r).toBeTruthy();
  });

  it("stage rows: the name before the code; a marked stage says what it adds, an unmarked one its worth (never «0 / N»)", async () => {
    const r = await mount();
    fireEvent.click(within(r).getByRole("button", { name: /^الكل/ }));
    const rows = [...r.querySelectorAll("li.eb-sp-stage")] as HTMLElement[];
    const bk01 = rows.find(li => li.classList.contains("eb-sp-stage") && li.textContent!.includes("BK01"))!;
    const main = bk01.querySelector(".eb-sp-stage-main")!;
    const kids = [...main.children].map(c => c.className);
    expect(kids.indexOf("eb-sp-stage-title")).toBeLessThan(kids.indexOf("eb-sp-stage-code"));
    expect(bk01.querySelector(".eb-sp-stage-score")!.textContent).toBe("العلامة: 90 / 100تضيف إلى علامة المشروع: 9 / 10");
    const bk02 = rows.find(li => li.classList.contains("eb-sp-stage") && li.textContent!.includes("BK02"))!;
    expect(bk02.querySelector(".eb-sp-stage-score")!.textContent).toBe("العلامة: لم تُقيّم بعدقيمتها في المشروع: 7.5");
    expect(bk02.textContent).not.toContain("0 / 7.5");
  });
});

describe("UX-S4 — the teacher's views keep their facts", () => {
  it("ProjectRankHero (teacher, the default) keeps the facts list and «قوة المشروع»", () => {
    render(<ProjectRankHero title="AquaSense" performance={normalizeProjectPerformance(PERF) as ProjectPerformance} />);
    expect(document.querySelector(".eb-prh-facts")!.textContent).toBe("علامة المشروع30 / 100التقدم40%");
    expect(document.querySelector(".eb-prh-strength")!.textContent).toBe("قوة المشروع: 120 / 600");
  });
  it("ProjectEvaluationCard (teacher) keeps the four facts", () => {
    render(<ProjectEvaluationCard id="t" variant="teacher" evaluation={EVAL} />);
    expect([...document.querySelectorAll(".eb-eval-facts dt")].map(d => d.textContent)).toEqual(["التقييم العام", "المراحل المقيّمة", "نسبة التقييم", "غير مقيّمة"]);
  });
});
