// @vitest-environment happy-dom
// Project Performance (frontend): presentation helpers over the server's `performance`, the grade/progress circle,
// the student project cards → detail (hero + stage scores, read-only) with multi-project switching that never shows
// a previous project's values, the legacy payload without `performance`, and the teacher's score control through
// the canonical progress.update write (plus the stale-selection guard on the teacher detail).
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { fmtContribution, fmtGrade, fmtStageScore, normalizeProjectPerformance, projectRankVisual } from "./projectPerformance";
import { RANK_VISUALS } from "../studentRankVisuals";
import ProjectPerformanceCircle from "./ProjectPerformanceCircle";
import StudentProjectPanel from "./StudentProjectPanel";
import ProjectStudentDetail from "./ProjectStudentDetail";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const TRACKS = [{ trackId: "book", title: "الكتاب" }, { trackId: "lab", title: "المختبر" }];
const STAGES = [
  { stageId: "S01", track: "book", groupId: "g1", title: "المقدمة", order: 1, weight: 1, required: true, active: true },
  { stageId: "S03", track: "book", groupId: "g1", title: "إعداد VLAN", order: 2, weight: 1, required: true, active: true },
  { stageId: "L01", track: "lab", groupId: "g2", title: "أول مختبر", order: 1, weight: 1, required: true, active: true }
];
const GROUPS = [{ groupId: "g1", track: "book", title: "الكتاب", order: 1 }, { groupId: "g2", track: "lab", title: "المختبرات", order: 1 }];
const summary = (overall: number) => ({ studentId: "s1", displayName: "ليان", code: "P1", overallProgress: overall, trackProgress: { book: overall, lab: overall }, counts: { not_started: 1, in_progress: 0, ready_for_review: 0, approved: 2 }, readyForReviewCount: 0, complete: false, updatedAt: "2026-03-01T10:00:00.000Z", stale: false });
const perfA = { overallProgress: 80, grade: 70, gradePrecise: 70, projectStrength: 450, maxStrength: 600, tier: "diamond", level: 5, nextTier: "legendary", complete: false,
  stageValues: { S01: { stageId: "S01", track: "book", status: "approved", score: 85, maxContribution: 10, contribution: 8.5, counted: true }, S03: { stageId: "S03", track: "book", status: "approved", score: null, maxContribution: 10, contribution: 0, counted: false }, L01: { stageId: "L01", track: "lab", status: "not_started", score: null, maxContribution: 50, contribution: 0, counted: false } } };
const perfB = { overallProgress: 20, grade: 15, gradePrecise: 15.25, projectStrength: 105, maxStrength: 600, tier: "bronze", level: 2, nextTier: "silver", complete: false, stageValues: {} };
const project = (code: string, title: string, perf: unknown, overall: number) => ({
  projectCode: code, title, tracks: TRACKS, summary: summary(overall), performance: perf, stages: STAGES, groups: GROUPS,
  progress: { S01: { status: "approved", score: 85, note: "ممتاز" }, S03: { status: "approved" } }, nextStages: { book: STAGES[1], lab: STAGES[2] }
});
const TWO = { ok: true, enrolled: true, className: "الصف", projects: [project("AQ", "AquaSense", perfA, 80), project("SB", "SecureBank", perfB, 20)] };
function mockTracker(body: unknown) {
  globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => body })) as unknown as typeof fetch;
}
const region = () => screen.findByRole("region", { name: /مشاريعي/ });
const strengthLine = () => document.querySelector(".eb-prh-strength")?.textContent;

describe("presentation helpers — format only, tier → the SAME six artworks", () => {
  it("formats contributions/grades/scores and maps tiers to the existing rank images", () => {
    expect(fmtContribution(8.5)).toBe("8.5"); expect(fmtContribution(10)).toBe("10"); expect(fmtContribution(2.125)).toBe("2.1"); expect(fmtContribution(Number.NaN)).toBe("0");
    expect(fmtGrade(81)).toBe("81 / 100");
    expect(fmtStageScore({ score: 85 })).toBe("85 / 100"); expect(fmtStageScore({ score: 0 })).toBe("0 / 100"); expect(fmtStageScore({})).toBe("لم تُرصد بعد"); expect(fmtStageScore(null)).toBe("لم تُرصد بعد");
    expect(projectRankVisual("silver")).toBe(RANK_VISUALS.silver);
    expect(projectRankVisual("diamond").title).toBe("تنين النار");
  });
  it("normalizes the server performance and rejects malformed payloads (older API → null, no invented values)", () => {
    expect(normalizeProjectPerformance(perfA)).toEqual(perfA);
    expect(normalizeProjectPerformance(undefined)).toBeNull();
    expect(normalizeProjectPerformance({ grade: 70 })).toBeNull();
    expect(normalizeProjectPerformance({ ...perfA, tier: "platinum" })).toBeNull();
  });
});

describe("ProjectPerformanceCircle — grade in the centre, progress on the ring, textual equivalents", () => {
  it("82 / 100 in the centre, 76% ring as a named progressbar, hidden sentence with both values", () => {
    const { container } = render(<ProjectPerformanceCircle grade={82} progress={76} />);
    const bar = screen.getByRole("progressbar", { name: "التقدم في المشروع" });
    expect(bar.getAttribute("aria-valuenow")).toBe("76");
    expect(container.querySelector(".eb-ppc-grade")?.textContent).toBe("82 / 100");
    expect(container.querySelector(".eb-ppc-grade-label")?.textContent).toBe("العلامة");
    expect(container.querySelector(".eb-ppc-progress")?.textContent).toBe("76% التقدم في المشروع");
    expect(screen.getByText("العلامة 82 من 100، والتقدم في المشروع 76 بالمئة.")).toBeTruthy();
  });
});

describe("StudentProjectPanel — cards → detail, multi-project switching, legacy payload", () => {
  it("two projects → cards with progress / grade / rank; opening AquaSense shows ONLY its hero, circle and stage scores", async () => {
    mockTracker(TWO);
    render(<StudentProjectPanel token="t" />);
    const r = within(await region());
    const cards = r.getAllByRole("article");
    expect(cards.map(c => c.querySelector(".eb-sp-project-card-title")?.textContent)).toEqual(["AquaSense", "SecureBank"]);
    expect(cards[0].textContent).toContain("التقدم80%"); expect(cards[0].textContent).toContain("العلامة70 / 100"); expect(cards[0].textContent).toContain("القوةتنين النار");
    expect(cards[1].textContent).toContain("التقدم20%"); expect(cards[1].textContent).toContain("العلامة15 / 100"); expect(cards[1].textContent).toContain("القوةشعلة صغيرة");
    fireEvent.click(within(cards[0]).getByRole("button", { name: "فتح المشروع" }));
    expect(strengthLine()).toBe("قوة المشروع: 450 / 600");
    expect(r.getByRole("img", { name: "رتبة المشروع: تنين النار — المستوى 5" })).toBeTruthy();
    expect(r.getByRole("progressbar", { name: "التقدم في المشروع" }).getAttribute("aria-valuenow")).toBe("80");
    expect(r.getByText("العلامة 70 من 100، والتقدم في المشروع 80 بالمئة.")).toBeTruthy();
    // stage rows: teacher score + project value, read-only (no inputs), unscored stage says لم تُرصد بعد
    const rows = r.getAllByRole("listitem").filter(li => li.classList.contains("eb-sp-stage"));
    expect(rows[0].textContent).toContain("العلامة: 85 / 100"); expect(rows[0].textContent).toContain("القيمة في المشروع: 8.5 / 10"); expect(rows[0].textContent).toContain("ملاحظة من المعلم: ممتاز");
    expect(rows[1].textContent).toContain("العلامة: لم تُرصد بعد"); expect(rows[1].textContent).toContain("القيمة في المشروع: 0 / 10");
    expect(document.querySelector("input, select, textarea")).toBeNull();
    expect(r.queryByText(/SecureBank|شعلة صغيرة|105 \/ 600/)).toBeNull();                               // nothing of B while A is open
    // back → cards; open B → only B's values (no stale A numbers)
    fireEvent.click(r.getByRole("button", { name: "العودة إلى المشاريع" }));
    fireEvent.click(within(r.getAllByRole("article")[1]).getByRole("button", { name: "فتح المشروع" }));
    expect(strengthLine()).toBe("قوة المشروع: 105 / 600");
    expect(r.getByRole("img", { name: "رتبة المشروع: شعلة صغيرة — المستوى 2" })).toBeTruthy();
    expect(r.getByRole("progressbar", { name: "التقدم في المشروع" }).getAttribute("aria-valuenow")).toBe("20");
    expect(r.queryByText(/450 \/ 600|تنين النار|AquaSense/)).toBeNull();
    expect((globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(1);   // one read for everything
  });
  it("a single project opens directly (no cards, no back); the global contribution line stays distinct from the project Strength", async () => {
    mockTracker({ ...TWO, projects: [TWO.projects[0]] });
    render(<StudentProjectPanel token="t" contributions={[{ projectCode: "AQ", overallProgress: 80, strengthPoints: 320 }]} />);
    const r = within(await region());
    expect(r.queryByRole("button", { name: "فتح المشروع" })).toBeNull();
    expect(r.queryByRole("button", { name: "العودة إلى المشاريع" })).toBeNull();
    expect(strengthLine()).toBe("قوة المشروع: 450 / 600");
    expect(r.getByText(/نقاط القوة من المشروع:/).textContent).toBe("تقدم المشروع: 80% · نقاط القوة من المشروع: 320 / 400");
  });
  it("an older payload without `performance` still renders (progress bars, no grade / rank / stage scores)", async () => {
    const legacy = { ...TWO, projects: [{ ...TWO.projects[0], performance: undefined }] };
    mockTracker(legacy);
    render(<StudentProjectPanel token="t" />);
    const r = within(await region());
    expect(r.getByRole("progressbar", { name: "التقدم العام" })).toBeTruthy();
    expect(r.queryByText(/قوة المشروع|العلامة/)).toBeNull();
  });
});

describe("ProjectStudentDetail (teacher) — hero, score control through progress.update, stale-selection guard", () => {
  const detail = (studentId: string, perf: unknown, overall: number, score?: number) => ({
    ok: true, readOnly: false, projectCode: "AQ", student: { studentId, displayName: studentId === "s1" ? "ليان" : "كريم", code: studentId.toUpperCase() },
    tracks: TRACKS, summary: { ...summary(overall), studentId }, stages: STAGES, groups: GROUPS, trackWeights: { book: 50, lab: 50 }, config: { staleDays: 7, lateThreshold: 40, balanceWarningThreshold: 30 },
    progress: { S01: { status: "approved", ...(score === undefined ? {} : { score }) } }, history: [], nextStages: { book: STAGES[1], lab: STAGES[2] }, balance: null, performance: perf
  });
  it("saves a score with the exact body, shows the returned performance (hero + stage value) and the timeline entry; clears with null", async () => {
    const calls: { url: string; body?: Record<string, unknown> }[] = [];
    let current = detail("s1", { ...perfA, grade: 0, gradePrecise: 0, projectStrength: 240, tier: "silver", level: 3, stageValues: { ...perfA.stageValues, S01: { ...perfA.stageValues.S01, score: null, contribution: 0, counted: false } } }, 80);
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input); const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url, body });
      if (init?.method === "POST") {
        const score = body.score === null ? null : Number(body.score);
        const perf = score === null ? current.performance : { ...perfA, projectStrength: 450, tier: "diamond", level: 5 };
        current = { ...current, performance: perf, progress: { S01: { status: "approved", ...(score === null ? {} : { score }) } } };
        return { ok: true, status: 200, json: async () => ({ ok: true, summary: current.summary, performance: perf, stage: { stageId: "S01", status: "approved", ...(score === null ? {} : { score }) }, nextStages: current.nextStages, balance: null, history: [{ eventId: "h1", stageId: "S01", type: "score", fromScore: null, toScore: score, actor: "t", createdAt: "2026-03-02T10:00:00.000Z" }] }) } as Response;
      }
      return { ok: true, status: 200, json: async () => current } as Response;
    }) as unknown as typeof fetch;
    render(<ProjectStudentDetail token="t" projectCode="AQ" classId="c1" studentId="s1" tracks={TRACKS} onBack={() => {}} />);
    await screen.findByRole("heading", { level: 2, name: "ملف المشروع: ليان" });
    expect(strengthLine()).toBe("قوة المشروع: 240 / 600");
    // Phase 8C: the score field and its save are on the stage row itself (no disclosure needed)
    const input = screen.getByRole("spinbutton", { name: "علامة المرحلة S01 — المقدمة من 100" }) as HTMLInputElement;
    expect(input.value).toBe("");
    fireEvent.change(input, { target: { value: "85" } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ علامة المرحلة S01" }));
    await screen.findByText("تم حفظ العلامة.");
    expect(calls.at(-1)?.body).toEqual({ action: "progress.update", projectCode: "AQ", classId: "c1", studentId: "s1", stageId: "S01", score: "85" });
    expect(strengthLine()).toBe("قوة المشروع: 450 / 600");
    expect(screen.getByRole("img", { name: "رتبة المشروع: تنين النار — المستوى 5" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "تفاصيل وملاحظة المرحلة S01" }));
    const panel = document.getElementById("eb-stage-S01") as HTMLElement;
    expect(within(panel).getByText(/القيمة في المشروع:/).textContent).toBe("القيمة في المشروع: 8.5 / 10");
    expect(within(panel).getByText(/^العلامة:/).textContent).toBe("العلامة: 85 / 100");
    expect(screen.getByText("علامة 85 / 100 — S01")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "مسح العلامة" }));
    await waitFor(() => expect(calls.at(-1)?.body?.score).toBeNull());
    expect(calls.filter(c => c.body).length).toBe(2);
  });
  it("read-only (archived) shows the score and value as text with no input", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ...detail("s1", perfA, 80, 85), readOnly: true }) })) as unknown as typeof fetch;
    render(<ProjectStudentDetail token="t" projectCode="AQ" classId="c1" studentId="s1" tracks={TRACKS} onBack={() => {}} />);
    await screen.findByRole("heading", { level: 2, name: "ملف المشروع: ليان" });
    expect(screen.queryByRole("spinbutton")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "تفاصيل وملاحظة المرحلة S01" }));
    expect(screen.getByText(/^العلامة:/).textContent).toBe("العلامة: 85 / 100");
  });
  it("a slow response for the previous student never overwrites the current one (stale-selection guard)", async () => {
    let releaseS1: (v: unknown) => void = () => {};
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("studentId=s1")) return new Promise(res => { releaseS1 = res; }).then(() => ({ ok: true, status: 200, json: async () => detail("s1", perfA, 80, 85) } as Response));
      return Promise.resolve({ ok: true, status: 200, json: async () => detail("s2", perfB, 20) } as Response);
    }) as unknown as typeof fetch;
    const { rerender } = render(<ProjectStudentDetail token="t" projectCode="AQ" classId="c1" studentId="s1" tracks={TRACKS} onBack={() => {}} />);
    rerender(<ProjectStudentDetail token="t" projectCode="AQ" classId="c1" studentId="s2" tracks={TRACKS} onBack={() => {}} />);
    await screen.findByRole("heading", { level: 2, name: "ملف المشروع: كريم" });
    expect(strengthLine()).toBe("قوة المشروع: 105 / 600");
    releaseS1(null);
    await new Promise(r => setTimeout(r, 20));
    expect(screen.getByRole("heading", { level: 2, name: "ملف المشروع: كريم" })).toBeTruthy();
    expect(strengthLine()).toBe("قوة المشروع: 105 / 600");
    expect(screen.queryByText(/450 \/ 600|ليان/)).toBeNull();
  });
});
