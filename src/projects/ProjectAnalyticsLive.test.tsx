// @vitest-environment happy-dom
/// <reference types="node" />
// The teacher's «الإحصائيات» view with the exam form's charts, the «Live» follow-up and «ملء الشاشة», over the REAL handlers
// (in-memory container) for every project that ships a form: the form's charts appear once the class's form was opened,
// Live re-reads the form every 10 s and the stage charts every 30 s (silently, keeping what is on screen when a refresh
// fails) and switches itself off after an hour, and the view can cover the whole screen and come back.
import { createRequire } from "node:module";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import ProjectAnalytics, { LIVE_FORM_INTERVAL_MS, LIVE_STAGES_INTERVAL_MS, LIVE_MAX_MS } from "./ProjectAnalytics";

vi.mock("react-chartjs-2", () => ({
  Bar: (p: { data: { datasets: { data: number[] }[] } }) => <canvas data-chart="bar" data-values={JSON.stringify(p.data.datasets[0].data)} />,
  Line: (p: { data: { datasets: { data: number[] }[] } }) => <canvas data-chart="line" data-values={JSON.stringify(p.data.datasets[0].data)} />,
  Doughnut: (p: { data: { datasets: { data: number[] }[] } }) => <canvas data-chart="doughnut" data-values={JSON.stringify(p.data.datasets[0].data)} />
}));

const nodeRequire = createRequire(import.meta.url);
const { handler: tracker } = nodeRequire("../../api/src/functions/project-tracker.js");
const { handler: studentForm } = nodeRequire("../../api/src/functions/student-project-exam-form.js");
const { getExamFormTemplate, getProjectDefinition, getStorageNamespace } = nodeRequire("../../api/src/lib/project-tracker/registry.js");
const { createMemoryContainer } = nodeRequire("../../api/tests/fixtures/memory-container.js");

type Body = Record<string, unknown>;
type Question = { questionId: string; kind: string; grading: string; minRows?: number; columns?: { id: string }[]; options?: { id: string }[]; justification?: boolean; items?: { id: string }[]; max?: number; answer?: { correctOptionId?: string; correctOptionIds?: string[]; pairs?: Record<string, string>; order?: string[] } };
const CODES = ["794589", "883589", "899373"];
const NOW = "2026-11-14T00:00:00.000Z";
const user = (id: string, name: string) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId: "c1", displayName: name, code: "C" + id });
function answerOf(q: Question): Body {
  if (q.grading === "auto") {
    if (q.kind === "choice") return q.justification ? { optionId: q.answer!.correctOptionId, justification: "لأن" } : { optionId: q.answer!.correctOptionId };
    if (q.kind === "multiChoice") return { optionIds: q.answer!.correctOptionIds };
    if (q.kind === "matching") return { pairs: q.answer!.pairs };
    return { order: q.answer!.order };
  }
  switch (q.kind) {
    case "table": return { rows: Array.from({ length: q.minRows || 1 }, (_, i) => Object.fromEntries((q.columns || []).map(c => [c.id, c.id + i]))) };
    case "choice": return q.justification ? { optionId: q.options![0].id, justification: "لأن" } : { optionId: q.options![0].id };
    case "multiChoice": return { optionIds: [q.options![0].id] };
    case "scale": return { values: Object.fromEntries(q.items!.map(i => [i.id, q.max])) };
    case "checklist": return { checked: [q.items![0].id] };
    case "declaration": return { accepted: true };
    default: return { text: "جواب " + q.questionId };
  }
}

function server(code: string) {
  const NS = getStorageNamespace(code);
  const ctx = createMemoryContainer({
    "platform/classes/c1.json": { classId: "c1", name: "صف c1", active: true, status: "active", studentIds: [], programCodes: [code], schoolYear: "2026", updatedAt: NOW, createdAt: NOW },
    "platform/users/s1.json": user("s1", "وليد"), "platform/users/s2.json": user("s2", "بشرى"), "platform/users/s3.json": user("s3", "تامر")
  });
  const common = { container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async () => {}, recordProjectMilestones: async () => {} };
  const teacherDeps = { ...common, requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
  const studentDeps = (id: string) => ({ ...common, requireActiveStudentSession: async () => ({ ok: true, container: ctx.container, user: { sub: id, sv: 1 }, student: ctx.getJson("platform/users/" + id + ".json") }) });
  const reads: string[] = [];
  const state = { fail: "" };
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = init?.method || "GET";
    const resource = new URL("https://x" + url).searchParams.get("resource") || "";
    reads.push(method + " " + resource);
    const r = state.fail && state.fail === resource
      ? { status: 503, jsonBody: { ok: false, error: "تعذر الاتصال." } }
      : await tracker({ method, url: "https://x" + url, json: async () => (init?.body ? JSON.parse(String(init.body)) : {}) }, teacherDeps);
    return { ok: r.status < 400, status: r.status, json: async () => r.jsonBody, text: async () => JSON.stringify(r.jsonBody), headers: new Headers() } as unknown as Response;
  }) as unknown as typeof fetch;
  const teacher = async (action: string) => (await tracker({ method: "POST", url: "https://x/api/project-tracker", json: async () => ({ projectCode: code, classId: "c1", action }) }, teacherDeps)) as { status: number };
  const student = async (id: string, body: Body) => (await studentForm({ method: "POST", url: "https://x/api/student-project-exam-form", json: async () => ({ projectCode: code, ...body }) }, studentDeps(id))) as { status: number };
  const questions = () => (ctx.getJson(NS.examFormClassName("c1")).template.sections as { questions: Question[] }[]).flatMap(s => s.questions).filter(q => q.kind !== "image" && q.kind !== "file");
  const count = (resource: string) => reads.filter(r => r === "GET " + resource).length;
  return { state, teacher, student, questions, count };
}
const mount = (code: string) => render(<ProjectAnalytics token="t" projectCode={code} classId="c1" tracks={getProjectDefinition(code).tracks} />);
const liveButton = () => screen.getByRole("button", { name: "التحديث المباشر Live" });
const rowsOf = (title: string) => {
  const card = screen.getByRole("region", { name: title });
  return within(card).getAllByRole("row", { hidden: true }).map(r => Array.from(r.querySelectorAll("th,td")).map(c => c.textContent));
};
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("project analytics — the exam form's charts, for every project that ships a form", () => {
  it("the three projects ship a form", () => {
    for (const code of CODES) expect(getExamFormTemplate(code)).toBeTruthy();
  });

  for (const code of CODES) {
    it(code + ": no form charts before the form is opened; one read of each resource; the stage charts are unchanged", async () => {
      const s = server(code);
      mount(code);
      await screen.findByRole("heading", { level: 2, name: "الإحصائيات" });
      await waitFor(() => expect(s.count("exam-form-stats")).toBe(1));
      expect(s.count("analytics")).toBe(1);
      expect(screen.queryByTestId("exam-form-stats")).toBeNull();
      expect(screen.queryByRole("heading", { name: "تقدّم المراحل" })).toBeNull();
      expect(screen.getByRole("region", { name: "تقدّم كل طالب" })).toBeTruthy();
      expect(liveButton().getAttribute("aria-pressed")).toBe("false");
      expect(screen.getByTestId("analytics-live-meta").textContent).toBe("");            // no clock on the first paint
    });

    it(code + ": an opened form shows the counts, each student's filling, the sections and the distribution, each with a table", async () => {
      const s = server(code);
      await s.teacher("examForm.open");
      const qs = s.questions();
      expect((await s.student("s1", { action: "saveDraft", baseRevision: 0, answers: Object.fromEntries(qs.map(q => [q.questionId, answerOf(q)])) })).status).toBe(200);
      expect((await s.student("s1", { action: "submit", baseRevision: 1 })).status).toBe(200);
      expect((await s.student("s2", { action: "saveDraft", baseRevision: 0, answers: { [qs[0].questionId]: answerOf(qs[0]) } })).status).toBe(200);
      mount(code);
      const section = await screen.findByTestId("exam-form-stats");
      expect(within(section).getByRole("heading", { level: 3, name: "تعبئة استمارة الامتحان" })).toBeTruthy();
      expect(within(section).getByText("مفتوحة للطلاب")).toBeTruthy();
      const kpi = (label: string) => Array.from(section.querySelectorAll(".eb-form-stats-kpis article")).find(a => a.querySelector(".eb-stat-label")!.textContent === label)!.querySelector(".eb-stat-value")!.textContent;
      expect(kpi("لم يبدأوا")).toBe("1"); expect(kpi("قيد التعبئة")).toBe("1"); expect(kpi("سلّموا")).toBe("1"); expect(kpi("يكتبون الآن")).toBe("1");
      for (const t of ["حالات الاستمارات في الصف", "توزيع الطلاب حسب نسبة التعبئة", "تعبئة كل طالب", "متوسط التعبئة في كل قسم"]) {
        const card = screen.getByRole("region", { name: t });
        expect(within(card).getByRole("img", { name: t })).toBeTruthy();
        expect(within(card).getByRole("button", { name: "عرض البيانات كجدول" })).toBeTruthy();
      }
      expect(rowsOf("حالات الاستمارات في الصف")).toEqual([["الحالة", "عدد الطلاب"], ["اعتُمدت", "0"], ["سُلّمت", "1"], ["أُعيدت للتصحيح", "0"], ["قيد التعبئة", "1"], ["لم يبدأ", "1"]]);
      const students = rowsOf("تعبئة كل طالب");
      expect(students.slice(1).map(r => [r[0], r[1], r[3]])).toEqual([["وليد", "سُلّمت", "100"], ["بشرى", "قيد التعبئة", String(Math.round(100 / qs.length))], ["تامر", "لم يبدأ", "0"]]);
      expect(students[1][2]).toBe(qs.length + " / " + qs.length);
      expect(rowsOf("متوسط التعبئة في كل قسم").length - 1).toBeGreaterThan(5);
      // the live timeline is not shown until Live runs; the stage charts follow under their own heading
      expect(screen.queryByRole("region", { name: "تطوّر تعبئة الصف أثناء المتابعة المباشرة" })).toBeNull();
      expect(screen.getByRole("heading", { level: 3, name: "تقدّم المراحل" })).toBeTruthy();
      expect(document.body.textContent).not.toContain("جواب ");
    });
  }
});

describe("project analytics — Live", () => {
  async function liveClass() {
    const s = server("794589");
    await s.teacher("examForm.open");
    mount("794589");
    await screen.findByTestId("exam-form-stats");
    vi.useFakeTimers();
    return s;
  }

  it("Live re-reads the form every 10 s and the stage charts every 30 s; a student's save shows on the next refresh; stopping stops the reads", async () => {
    const s = await liveClass();
    await tick(LIVE_STAGES_INTERVAL_MS * 2);
    expect(s.count("exam-form-stats")).toBe(1); expect(s.count("analytics")).toBe(1);         // nothing polls while Live is off

    fireEvent.click(liveButton());
    await tick(0);
    expect(liveButton().getAttribute("aria-pressed")).toBe("true");
    expect(s.count("exam-form-stats")).toBe(2); expect(s.count("analytics")).toBe(2);         // one immediate refresh of both
    expect(screen.getByRole("status").textContent).toBe("بدأ التحديث المباشر.");
    expect(screen.getByTestId("analytics-live-meta").textContent).toContain("آخر تحديث");
    expect(rowsOf("تعبئة كل طالب")[1][3]).toBe("0");

    const qs = s.questions();
    expect((await s.student("s2", { action: "saveDraft", baseRevision: 0, answers: Object.fromEntries(qs.map(q => [q.questionId, answerOf(q)])) })).status).toBe(200);
    await tick(LIVE_FORM_INTERVAL_MS);
    expect(s.count("exam-form-stats")).toBe(3); expect(s.count("analytics")).toBe(2);
    expect(rowsOf("تعبئة كل طالب")[1].slice(0, 4)).toEqual(["بشرى", "قيد التعبئة", qs.length + " / " + qs.length, "100"]);
    await tick(LIVE_FORM_INTERVAL_MS * 2);
    expect(s.count("exam-form-stats")).toBe(5); expect(s.count("analytics")).toBe(3);
    // the timeline holds one point per refresh since Live started
    const trend = rowsOf("تطوّر تعبئة الصف أثناء المتابعة المباشرة");
    expect(trend.slice(1).map(r => r[1])).toEqual(["0", "33", "33", "33"]);

    fireEvent.click(liveButton());
    await tick(LIVE_STAGES_INTERVAL_MS * 2);
    expect(liveButton().getAttribute("aria-pressed")).toBe("false");
    expect(s.count("exam-form-stats")).toBe(5); expect(s.count("analytics")).toBe(3);
    expect(screen.getByRole("status").textContent).toBe("أُوقف التحديث المباشر.");
  });

  it("a failed refresh keeps the charts on screen and says so; the next one recovers", async () => {
    const s = await liveClass();
    fireEvent.click(liveButton());
    await tick(0);
    s.state.fail = "exam-form-stats";
    await tick(LIVE_FORM_INTERVAL_MS);
    expect(screen.getByTestId("exam-form-stats")).toBeTruthy();
    expect(screen.getByTestId("analytics-live-meta").textContent).toContain("تعذّر آخر تحديث");
    expect(screen.queryByRole("alert")).toBeNull();
    s.state.fail = "analytics";
    await tick(LIVE_STAGES_INTERVAL_MS);
    expect(screen.getByRole("region", { name: "تقدّم كل طالب" })).toBeTruthy();                 // the stage charts stay too
    expect(screen.queryByRole("alert")).toBeNull();
    s.state.fail = "";
    await tick(LIVE_STAGES_INTERVAL_MS);
    expect(screen.getByTestId("analytics-live-meta").textContent).not.toContain("تعذّر آخر تحديث");
  });

  it("Live switches itself off after an hour", async () => {
    const s = await liveClass();
    fireEvent.click(liveButton());
    await tick(LIVE_MAX_MS + 1000);
    expect(liveButton().getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("status").textContent).toContain("توقّف التحديث المباشر تلقائيًا");
    const n = s.count("exam-form-stats");
    await tick(LIVE_STAGES_INTERVAL_MS * 2);
    expect(s.count("exam-form-stats")).toBe(n);
  });
});

describe("project analytics — full screen", () => {
  it("«ملء الشاشة» turns the view into a modal overlay that keeps Live and the charts; Escape or the button leaves it", async () => {
    const s = server("794589");
    await s.teacher("examForm.open");
    const requestFullscreen = vi.fn(() => Promise.reject(new Error("refused")));                // native fullscreen refused: the overlay still works
    (document.documentElement as unknown as { requestFullscreen: unknown }).requestFullscreen = requestFullscreen;
    mount("794589");
    await screen.findByTestId("exam-form-stats");
    const root = document.querySelector(".eb-project-analytics")!;
    expect(root.getAttribute("role")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "ملء الشاشة" }));
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(root.className).toContain("is-fullscreen");
    expect(root.getAttribute("role")).toBe("dialog"); expect(root.getAttribute("aria-modal")).toBe("true");
    expect(document.body.style.overflow).toBe("hidden");
    expect(within(root as HTMLElement).getByTestId("exam-form-stats")).toBeTruthy();
    expect(within(root as HTMLElement).getByRole("button", { name: "التحديث المباشر Live" })).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(root.className).not.toContain("is-fullscreen");
    expect(document.body.style.overflow).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "ملء الشاشة" }));
    fireEvent.click(screen.getByRole("button", { name: "خروج من ملء الشاشة" }));
    expect(root.getAttribute("role")).toBeNull();
    delete (document.documentElement as unknown as { requestFullscreen?: unknown }).requestFullscreen;
  });
});
