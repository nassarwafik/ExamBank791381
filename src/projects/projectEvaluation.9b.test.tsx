// @vitest-environment happy-dom
/// <reference types="node" />
// Phase 9B — Project Performance Foundation (frontend). The evaluation presentation helpers, the teacher's summary card
// over the REAL project-tracker handler (score.set / score.clear through the in-memory container: 0 is a grade, clear
// keeps the other stages, a failed save keeps the draft and shows a row error, saving A never disables B, no reload),
// the student's read-only evaluation block («لم تُقيّم بعد», 0 displayed as «0 / 100», no controls, project isolation,
// the ungraded list), and the Today Hub chip (student — the only hub integration shipped in 9B).
import { createRequire } from "node:module";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import ProjectStudentDetail from "./ProjectStudentDetail";
import StudentProjectPanel from "./StudentProjectPanel";
import ProjectEvaluationCard from "./ProjectEvaluationCard";
import StudentTodayHub from "../student/today/StudentTodayHub";
import { evaluationBriefs, evaluationSummaryText, fmtProjectScore, mutationBody, normalizeProjectEvaluation, projectEvaluationText, ungradedStagesOf } from "./projectEvaluation";
import { NOT_GRADED_LABEL } from "./projectPerformance";
import type { ProjectEvaluation, TrackMeta } from "./types";

const nodeRequire = createRequire(import.meta.url);
const { handler: tracker } = nodeRequire("../../api/src/functions/project-tracker.js");
const { getProjectDefinition } = nodeRequire("../../api/src/lib/project-tracker/registry.js");
const { createMemoryContainer } = nodeRequire("../../api/tests/fixtures/memory-container.js");

type Body = Record<string, unknown>;
const NOW = "2026-03-01T00:00:00.000Z";
const user = (id: string, cid: string) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId: cid, displayName: "طالب " + id, code: "C" + id });
const room = (id: string, codes: string[], over: Body = {}) => ({ classId: id, name: "صف " + id, active: true, status: "active", studentIds: [], programCodes: codes, schoolYear: "2026", updatedAt: NOW, createdAt: NOW, ...over });
const ACTIVE = (code: string) => (getProjectDefinition(code).stages as { active?: boolean }[]).filter(s => s.active === true).length;

function server() {
  const ctx = createMemoryContainer({ "platform/classes/c1.json": room("c1", ["899373", "883589"]), "platform/users/s1.json": user("s1", "c1"), "platform/users/s2.json": user("s2", "c1") });
  const deps = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async () => {}, recordProjectMilestones: async () => {} };
  const posts: Body[] = [];
  const control = { failNext: "", hold: false, release: () => {} };
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = init?.method || "GET";
    const body = init?.body ? JSON.parse(String(init.body)) as Body : undefined;
    if (method === "POST") {
      posts.push(body!);
      if (control.failNext) { const msg = control.failNext; control.failNext = ""; return { ok: false, status: 503, json: async () => ({ ok: false, error: msg }) } as Response; }
      if (control.hold) { control.hold = false; await new Promise<void>(r => { control.release = r; }); }
    }
    const r = await tracker({ method, url: "https://x" + url, json: async () => body ?? {} }, deps);
    return { ok: r.status < 400, status: r.status, json: async () => r.jsonBody } as Response;
  }) as unknown as typeof fetch;
  return { posts, control, ctx };
}
const tracks = (code: string): TrackMeta[] => getProjectDefinition(code).tracks;
async function mountTeacher(code = "899373", studentId = "s1") {
  render(<ProjectStudentDetail token="t" projectCode={code} classId="c1" studentId={studentId} tracks={tracks(code)} onBack={() => {}} />);
  await screen.findByRole("heading", { level: 2, name: "ملف المشروع: طالب " + studentId });
}
const row = (stageId: string) => document.querySelector('[data-stage-id="' + stageId + '"]') as HTMLElement;
const scoreInput = (stageId: string) => within(row(stageId)).getByRole("spinbutton") as HTMLInputElement;
const saveBtn = (stageId: string) => within(row(stageId)).getByRole("button", { name: "حفظ علامة المرحلة " + stageId }) as HTMLButtonElement;
const type = (stageId: string, v: string) => fireEvent.change(scoreInput(stageId), { target: { value: v } });
const card = () => document.querySelector(".eb-eval-card") as HTMLElement;
const fact = (label: string) => { const dt = Array.from(card().querySelectorAll("dt")).find(d => d.textContent === label); return dt?.nextElementSibling?.textContent; };
const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });

beforeEach(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const EVAL: ProjectEvaluation = {
  totalStages: 7, gradedStages: 5, ungradedStages: 2, evaluationProgress: 71, projectScore: 84, projectScorePrecise: 84.2,
  stages: [
    { stageId: "S01", track: "book", groupId: "g", title: "المقدمة", order: 1, required: true, status: "approved", score: 85, graded: true, scoredAt: "2026-03-02T10:00:00.000Z", scoredBy: "t" },
    { stageId: "S02", track: "book", groupId: "g", title: "الفصل الأول", order: 2, required: true, status: "in_progress", score: 0, graded: true, scoredAt: "2026-03-03T10:00:00.000Z", scoredBy: "t" },
    { stageId: "S03", track: "book", groupId: "g", title: "الفصل الثاني", order: 3, required: true, status: "not_started", score: null, graded: false, scoredAt: "", scoredBy: "" },
    { stageId: "S04", track: "book", groupId: "g", title: "الفصل الثالث", order: 4, required: true, status: "not_started", score: null, graded: false, scoredAt: "", scoredBy: "" },
    { stageId: "L01", track: "lab", groupId: "h", title: "مختبر 1", order: 1, required: true, status: "approved", score: 100, graded: true, scoredAt: "2026-03-01T10:00:00.000Z", scoredBy: "t" },
    { stageId: "L02", track: "lab", groupId: "h", title: "مختبر 2", order: 2, required: true, status: "approved", score: 90, graded: true, scoredAt: "2026-03-01T10:00:00.000Z", scoredBy: "t" },
    { stageId: "L03", track: "lab", groupId: "h", title: "مختبر 3", order: 3, required: true, status: "approved", score: 46, graded: true, scoredAt: "2026-03-01T10:00:00.000Z", scoredBy: "t" }
  ],
  orphanStageIds: [], updatedAt: "2026-03-03T10:00:00.000Z"
};

describe("9B helpers — presentation only", () => {
  it("formats the project score (0 → «0 / 100», null → «لم تُقيّم بعد») and the one-line summary exactly", () => {
    expect(fmtProjectScore(84)).toBe("84 / 100"); expect(fmtProjectScore(0)).toBe("0 / 100"); expect(fmtProjectScore(null)).toBe(NOT_GRADED_LABEL); expect(fmtProjectScore(84.25)).toBe("84.3 / 100");
    expect(evaluationSummaryText(EVAL)).toBe("التقييم العام: 84 / 100 · المراحل المقيّمة: 5 / 7 · نسبة التقييم: 71%");
    expect(evaluationSummaryText({ ...EVAL, gradedStages: 0, ungradedStages: 7, evaluationProgress: 0, projectScore: null, projectScorePrecise: null })).toBe("التقييم العام: لم تُقيّم بعد · المراحل المقيّمة: 0 / 7 · نسبة التقييم: 0%");
    expect(ungradedStagesOf(EVAL).map(s => s.stageId)).toEqual(["S03", "S04"]);
  });
  it("normalizes the server payload; absent / malformed → null (older API shows no block); junk scores are 'not graded'", () => {
    expect(normalizeProjectEvaluation(EVAL)).toEqual(EVAL);
    expect(normalizeProjectEvaluation(undefined)).toBeNull(); expect(normalizeProjectEvaluation({})).toBeNull(); expect(normalizeProjectEvaluation({ totalStages: "7" })).toBeNull();
    const n = normalizeProjectEvaluation({ totalStages: 2, gradedStages: 1, stages: [{ stageId: "A", score: 101 }, { stageId: "B", score: 0 }, null, { title: "no id" }], projectScore: 250 })!;
    expect(n.projectScore).toBeNull(); expect(n.stages.map(s => [s.stageId, s.score, s.graded])).toEqual([["A", null, false], ["B", 0, true]]);
    expect(n).toMatchObject({ ungradedStages: 1, evaluationProgress: 50, orphanStageIds: [], updatedAt: "" });
  });
  it("the mutation body: a score → score.set / score.clear with ONLY the identifiers; status and note stay progress.update", () => {
    expect(mutationBody("c1", "s1", "B01", { score: "85" })).toEqual({ action: "score.set", classId: "c1", studentId: "s1", stageId: "B01", score: "85" });
    expect(mutationBody("c1", "s1", "B01", { score: null })).toEqual({ action: "score.clear", classId: "c1", studentId: "s1", stageId: "B01" });
    expect(mutationBody("c1", "s1", "B01", { status: "approved" })).toEqual({ action: "progress.update", classId: "c1", studentId: "s1", stageId: "B01", status: "approved" });
    expect(mutationBody("c1", "s1", "B01", { note: "x" })).toEqual({ action: "progress.update", classId: "c1", studentId: "s1", stageId: "B01", note: "x" });
  });
  it("the Today Hub line: one project → «مشروعك», several → «مشاريعك» with summed counts, nothing → ''", () => {
    expect(projectEvaluationText([{ gradedStages: 5, totalStages: 7 }])).toBe("مشروعك: 5/7 مراحل مقيّمة");
    expect(projectEvaluationText([{ gradedStages: 5, totalStages: 7 }, { gradedStages: 4, totalStages: 7 }])).toBe("مشاريعك: 9/14 مراحل مقيّمة");
    expect(projectEvaluationText([{ gradedStages: 0, totalStages: 0 }])).toBe(""); expect(projectEvaluationText(null)).toBe(""); expect(projectEvaluationText([])).toBe("");
    expect(evaluationBriefs([{ projectCode: "A", title: "أ", evaluation: EVAL } as never, { projectCode: "B", title: "ب" } as never])).toEqual([{ projectCode: "A", title: "أ", gradedStages: 5, totalStages: 7 }]);
  });
});

describe("9B card — RTL-safe read-only summary", () => {
  it("teacher variant: heading, the four facts, a named progressbar, the last update; no controls", () => {
    render(<ProjectEvaluationCard id="x" variant="teacher" evaluation={EVAL} />);
    expect(screen.getByRole("region", { name: "تقييم المراحل" })).toBeTruthy();
    expect(fact("التقييم العام")).toBe("84 / 100"); expect(fact("المراحل المقيّمة")).toBe("5 / 7"); expect(fact("نسبة التقييم")).toBe("71%"); expect(fact("غير مقيّمة")).toBe("2");
    expect(screen.getByRole("progressbar", { name: "نسبة التقييم" }).getAttribute("aria-valuenow")).toBe("71");
    expect(card().textContent).toContain("آخر تحديث للتقييم:");
    expect(card().querySelectorAll("button, input, textarea, select").length).toBe(0);
    expect(card().textContent).not.toContain("مراحل لم تُقيّم بعد:");                                 // the ungraded list is the student's
  });
  it("student variant: lists the ungraded stages by id + title; a fully graded project says so; zero stages is explicit", () => {
    render(<ProjectEvaluationCard id="y" variant="student" evaluation={EVAL} />);
    expect(screen.getByRole("region", { name: "تقييم مشروعك" }).textContent).toContain("مراحل لم تُقيّم بعد: S03 — الفصل الثاني، S04 — الفصل الثالث");
    cleanup();
    render(<ProjectEvaluationCard id="z" variant="student" evaluation={{ ...EVAL, stages: EVAL.stages.map(s => ({ ...s, score: s.score ?? 50, graded: true })), gradedStages: 7, ungradedStages: 0, evaluationProgress: 100 }} />);
    expect(card().textContent).toContain("قُيّمت جميع المراحل.");
    cleanup();
    render(<ProjectEvaluationCard id="w" variant="student" evaluation={{ ...EVAL, totalStages: 0, gradedStages: 0, ungradedStages: 0, evaluationProgress: 0, projectScore: null, projectScorePrecise: null, stages: [], updatedAt: "" }} />);
    expect(card().textContent).toContain("لا توجد مراحل فعّالة في هذا المشروع بعد."); expect(fact("التقييم العام")).toBe(NOT_GRADED_LABEL); expect(card().textContent).toContain("لم يُسجَّل أي تقييم بعد.");
  });
});

describe("9B teacher editor — the summary card over the real handler", () => {
  it("G1 empty student → «لم تُقيّم بعد» and 0 / N; saving 85 then 0 updates the card live (0 is graded), with no reload of the profile", async () => {
    const srv = server();
    await mountTeacher();
    const total = ACTIVE("899373");
    expect(fact("التقييم العام")).toBe(NOT_GRADED_LABEL); expect(fact("المراحل المقيّمة")).toBe("0 / " + total); expect(fact("نسبة التقييم")).toBe("0%");
    const gets = () => (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(c => !(c[1] as RequestInit | undefined)?.method || (c[1] as RequestInit).method === "GET").length;
    const before = gets();
    type("B01", "85"); fireEvent.click(saveBtn("B01"));
    await screen.findByText("تم حفظ العلامة.");
    expect(srv.posts).toEqual([{ projectCode: "899373", action: "score.set", classId: "c1", studentId: "s1", stageId: "B01", score: "85" }]);
    expect(fact("التقييم العام")).toBe("85 / 100"); expect(fact("المراحل المقيّمة")).toBe("1 / " + total); expect(fact("نسبة التقييم")).toBe(Math.round(100 / total) + "%");
    type("B02", "0"); fireEvent.click(saveBtn("B02"));
    await waitFor(() => expect(fact("المراحل المقيّمة")).toBe("2 / " + total));
    expect(fact("التقييم العام")).toBe("43 / 100");                                                    // round((85 + 0) / 2) — 0 counts; the server rounds projectScore for display
    expect(scoreInput("B02").value).toBe("0");                                                          // the canonical saved 0 shows in the field
    fireEvent.click(within(row("B02")).getByRole("button", { name: "تفاصيل وملاحظة المرحلة B02" }));
    expect(within(document.getElementById("eb-stage-B02") as HTMLElement).getByText(/^العلامة:/).textContent).toBe("العلامة: 0 / 100");
    expect(gets()).toBe(before);                                                                       // the response updated the view; no re-read
    expect(card().getAttribute("data-graded")).toBe("2");
  });
  it("G2 clear removes one stage's score and keeps the other; the card follows; the exact narrow body is sent", async () => {
    const srv = server();
    await mountTeacher();
    type("B01", "60"); fireEvent.click(saveBtn("B01")); await screen.findByText("تم حفظ العلامة.");
    type("B02", "80"); fireEvent.click(saveBtn("B02")); await waitFor(() => expect(fact("المراحل المقيّمة")).toContain("2 /"));
    expect(fact("التقييم العام")).toBe("70 / 100");
    fireEvent.click(within(row("B01")).getByRole("button", { name: "تفاصيل وملاحظة المرحلة B01" }));
    fireEvent.click(screen.getByRole("button", { name: "مسح العلامة" }));
    await waitFor(() => expect(fact("المراحل المقيّمة")).toContain("1 /"));
    expect(srv.posts.at(-1)).toEqual({ projectCode: "899373", action: "score.clear", classId: "c1", studentId: "s1", stageId: "B01" });
    expect(fact("التقييم العام")).toBe("80 / 100");
    expect(scoreInput("B01").value).toBe(""); expect(scoreInput("B02").value).toBe("80");
  });
  it("G3 a failed save shows a visible row error, keeps the typed draft and leaves the card unchanged; retry succeeds", async () => {
    const srv = server();
    await mountTeacher();
    srv.control.failNext = "تعذر الحفظ الآن.";
    type("B01", "77"); fireEvent.click(saveBtn("B01"));
    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).toContain("تعذر الحفظ الآن.");
    expect(scoreInput("B01").value).toBe("77"); expect(fact("التقييم العام")).toBe(NOT_GRADED_LABEL);
    fireEvent.click(saveBtn("B01"));
    await screen.findByText("تم حفظ العلامة.");
    expect(fact("التقييم العام")).toBe("77 / 100"); expect(screen.queryByRole("alert")).toBeNull();
  });
  it("G4 while stage A's save is in flight, stage B stays editable and saveable; A's save cannot be queued twice", async () => {
    const srv = server();
    await mountTeacher();
    srv.control.hold = true;
    type("B01", "50"); fireEvent.click(saveBtn("B01"));
    await flush();
    expect(saveBtn("B01").disabled).toBe(true); expect(saveBtn("B01").textContent).toBe("جارٍ الحفظ…");
    fireEvent.click(saveBtn("B01"));                                                                   // second click: guarded
    expect(scoreInput("B02").disabled).toBe(false);
    type("B02", "90"); expect(saveBtn("B02").disabled).toBe(false); fireEvent.click(saveBtn("B02"));
    srv.control.release();
    await waitFor(() => expect(fact("المراحل المقيّمة")).toContain("2 /"));
    expect(srv.posts.map(p => [p.stageId, p.score])).toEqual([["B01", "50"], ["B02", "90"]]);
    expect(fact("التقييم العام")).toBe("70 / 100");
  });
  it("G5 the wording for an unscored stage is the shared «لم تُقيّم بعد» in the stage details; the card carries no reload button or prompt", async () => {
    server();
    await mountTeacher();
    fireEvent.click(within(row("B01")).getByRole("button", { name: "تفاصيل وملاحظة المرحلة B01" }));
    expect(within(document.getElementById("eb-stage-B01") as HTMLElement).getByText(/^العلامة:/).textContent).toBe("العلامة: " + NOT_GRADED_LABEL);
    expect(card().querySelector("button")).toBeNull();
  });
});

const TRACKS = [{ trackId: "book", title: "الكتاب" }, { trackId: "lab", title: "المختبر" }];
const STAGES = [
  { stageId: "S01", track: "book", groupId: "g1", title: "المقدمة", order: 1, weight: 1, required: true, active: true },
  { stageId: "S02", track: "book", groupId: "g1", title: "الفصل الأول", order: 2, weight: 1, required: true, active: true },
  { stageId: "S03", track: "book", groupId: "g1", title: "الفصل الثاني", order: 3, weight: 1, required: true, active: true }
];
const GROUPS = [{ groupId: "g1", track: "book", title: "الكتاب", order: 1 }];
const summary = () => ({ studentId: "s1", displayName: "ليان", code: "P1", overallProgress: 33, trackProgress: { book: 33, lab: 0 }, counts: { not_started: 2, in_progress: 0, ready_for_review: 0, approved: 1 }, readyForReviewCount: 0, complete: false, updatedAt: NOW, stale: false });
const perf = { overallProgress: 33, grade: 28, gradePrecise: 28.3, projectStrength: 184, maxStrength: 600, tier: "bronze", level: 2, nextTier: "silver", complete: false, stageValues: {} };
const evalA: ProjectEvaluation = { totalStages: 3, gradedStages: 2, ungradedStages: 1, evaluationProgress: 67, projectScore: 43, projectScorePrecise: 42.5,
  stages: [{ stageId: "S01", track: "book", groupId: "g1", title: "المقدمة", order: 1, required: true, status: "approved", score: 85, graded: true, scoredAt: NOW, scoredBy: "t" }, { stageId: "S02", track: "book", groupId: "g1", title: "الفصل الأول", order: 2, required: true, status: "in_progress", score: 0, graded: true, scoredAt: NOW, scoredBy: "t" }, { stageId: "S03", track: "book", groupId: "g1", title: "الفصل الثاني", order: 3, required: true, status: "not_started", score: null, graded: false, scoredAt: "", scoredBy: "" }],
  orphanStageIds: [], updatedAt: NOW };
const evalB: ProjectEvaluation = { ...evalA, gradedStages: 0, ungradedStages: 3, evaluationProgress: 0, projectScore: null, projectScorePrecise: null, stages: evalA.stages.map(s => ({ ...s, score: null, graded: false, scoredAt: "", scoredBy: "" })), updatedAt: "" };
const project = (code: string, title: string, evaluation: ProjectEvaluation | undefined, progress: Record<string, unknown>) => ({ projectCode: code, title, tracks: TRACKS, summary: summary(), performance: perf, evaluation, stages: STAGES, groups: GROUPS, progress, nextStages: { book: STAGES[2], lab: null } });
const mockStudent = (body: unknown) => { globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => body })) as unknown as typeof fetch; };

describe("9B student block — read-only, isolated per project", () => {
  it("H1 one project: the evaluation card shows 43 / 100 · 2 / 3 · 67%, S02's 0 as «0 / 100», S03 as «لم تُقيّم بعد», the ungraded list; no inputs", async () => {
    mockStudent({ ok: true, enrolled: true, projects: [project("A", "AquaSense", evalA, { S01: { status: "approved", score: 85 }, S02: { status: "in_progress", score: 0 } })] });
    render(<StudentProjectPanel token="t" />);
    const region = within(await screen.findByRole("region", { name: /مشاريعي/ }));
    expect(region.getByRole("region", { name: "تقييم مشروعك" })).toBeTruthy();
    expect(fact("التقييم العام")).toBe("43 / 100"); expect(fact("المراحل المقيّمة")).toBe("2 / 3"); expect(fact("نسبة التقييم")).toBe("67%");
    expect(card().textContent).toContain("مراحل لم تُقيّم بعد: S03 — الفصل الثاني");
    const rows = region.getAllByRole("listitem").filter(li => li.className.includes("eb-sp-stage"));
    expect(rows[1].textContent).toContain("العلامة: 0 / 100");
    expect(rows[2].textContent).toContain("العلامة: " + NOT_GRADED_LABEL);
    expect(document.querySelectorAll("input, textarea, select").length).toBe(0);
    expect(region.queryByRole("button", { name: /حفظ|مسح/ })).toBeNull();
  });
  it("H2 two projects: cards show each project's own evaluation fact; opening B shows B's «لم تُقيّم بعد» card, never A's numbers", async () => {
    mockStudent({ ok: true, enrolled: true, projects: [project("A", "AquaSense", evalA, {}), project("B", "SecureBank", evalB, {})] });
    render(<StudentProjectPanel token="t" />);
    const region = within(await screen.findByRole("region", { name: /مشاريعي/ }));
    const cards = region.getAllByRole("article");
    expect(cards[0].textContent).toContain("التقييم43 / 100 · 2/3"); expect(cards[1].textContent).toContain("التقييم" + NOT_GRADED_LABEL + " · 0/3");
    fireEvent.click(within(cards[1]).getByRole("button", { name: "فتح المشروع" }));
    expect(fact("التقييم العام")).toBe(NOT_GRADED_LABEL); expect(fact("المراحل المقيّمة")).toBe("0 / 3");
    expect(card().textContent).not.toContain("43");
    fireEvent.click(region.getByRole("button", { name: "العودة إلى المشاريع" }));
    fireEvent.click(within(region.getAllByRole("article")[0]).getByRole("button", { name: "فتح المشروع" }));
    expect(fact("التقييم العام")).toBe("43 / 100");
  });
  it("H3 an older payload without `evaluation` renders the project exactly as before (no card, no invented numbers)", async () => {
    mockStudent({ ok: true, enrolled: true, projects: [project("A", "AquaSense", undefined, {})] });
    render(<StudentProjectPanel token="t" />);
    await screen.findByRole("region", { name: /مشاريعي/ });
    expect(document.querySelector(".eb-eval-card")).toBeNull();
    expect(screen.queryByText(/التقييم العام/)).toBeNull();
  });
  it("I1 the panel reports the evaluation brief once per read; the Today Hub renders the chip from it (and nothing without it)", async () => {
    mockStudent({ ok: true, enrolled: true, projects: [project("A", "AquaSense", evalA, {}), project("B", "SecureBank", evalB, {})] });
    const onEvaluationChange = vi.fn();
    render(<StudentProjectPanel token="t" onEvaluationChange={onEvaluationChange} />);
    await screen.findByRole("region", { name: /مشاريعي/ });
    expect(onEvaluationChange).toHaveBeenCalledTimes(1);
    expect(onEvaluationChange.mock.calls[0][0]).toEqual([{ projectCode: "A", title: "AquaSense", gradedStages: 2, totalStages: 3 }, { projectCode: "B", title: "SecureBank", gradedStages: 0, totalStages: 3 }]);
    cleanup();
    const base = { continueItem: null, busy: false, onContinue: () => {}, messagesUnread: { total: 0, capped: false }, onOpenMessages: () => {}, progress: { stageNumber: null, stageCount: 25, medals: 0, finalized: 0, latest: null }, onOpenProgress: () => {}, onOpenTasks: () => {} };
    const onOpenProjects = vi.fn();
    render(<StudentTodayHub {...base} projectEvaluation={onEvaluationChange.mock.calls[0][0]} onOpenProjects={onOpenProjects} />);
    const strip = within(screen.getByRole("list", { name: "رسائلك وتقدمك" }));
    expect(strip.getByText("مشاريعك: 2/6 مراحل مقيّمة")).toBeTruthy();
    fireEvent.click(strip.getByRole("button", { name: "مشاريعي" }));
    expect(onOpenProjects).toHaveBeenCalledTimes(1);
    cleanup();
    render(<StudentTodayHub {...base} />);
    expect(within(screen.getByRole("list", { name: "رسائلك وتقدمك" })).getAllByRole("listitem").length).toBe(2);   // 9A strip unchanged without projects
  });
});
