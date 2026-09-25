// @vitest-environment happy-dom
//
// Phase 8A — Dashboard analytics scope. The dashboard shows ONE scope at a time (GLOBAL / CLASS / STUDENT): every
// KPI, chart, section, CSV row, AI request and achievements request follows it, and a response for an older scope can
// never be shown for a newer one. The fetch mock answers per scope, like the server does, and can hold any response.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, waitFor, fireEvent, within } from "@testing-library/react";

type ChartCall = { type: string; data: { labels: unknown[]; datasets: Array<Record<string, unknown>> }; options: Record<string, unknown> };
const charts = vi.hoisted(() => ({ calls: [] as ChartCall[] }));
vi.mock("react-chartjs-2", () => {
  const make = (type: string) => (props: { data: ChartCall["data"]; options: ChartCall["options"] }) => {
    charts.calls.push({ type, data: props.data, options: props.options });
    return <div data-testid={"chart-" + type} />;
  };
  return { Line: make("line"), Doughnut: make("doughnut"), Bar: make("bar") };
});

import TeacherDashboard from "./TeacherDashboard";
import TeacherAppShell from "./shell/TeacherAppShell";

const CLASSES = [
  { classId: "cA", name: "صف ألف", grade: "10", schoolYear: "2026", active: true, studentCount: 2 },
  { classId: "cB", name: "صف باء", grade: "11", schoolYear: "2026", active: true, studentCount: 1 }
];
const S1 = "سارة المتفوقة", S2 = "سامي المتأخر", B1 = "باسل من باء";
const person = (userId: string, displayName: string, classId: string, className: string, average: number, over: Record<string, unknown> = {}) => ({ userId, displayName, identityNumber: "0000" + userId, classId, className, average, assigned: 2, completed: 2, missing: 0, completionRate: 100, trendDelta: 0, trend: "stable", lastLoginAt: "2026-09-01T00:00:00.000Z", severity: "medium", reasons: ["معدل منخفض"], ...over });
const trend = (id: string, classId: string, className: string, average: number, students: number) => ({ assignmentId: id, classId, className, title: "واجب " + id, dueAt: "2026-09-0" + id.slice(-1) + "T00:00:00.000Z", date: "2026-09-0" + id.slice(-1), students, submitted: students, missing: 0, pendingReview: 0, completionRate: 100, average, highest: average, lowest: average });
function payload(mode: "global" | "class" | "student", over: Record<string, unknown> = {}) {
  const base = {
    ok: true, generatedAt: "2026-09-10T08:00:00.000Z", classes: CLASSES,
    gradeDistribution: [{ label: "90–100", count: 1 }], insights: [], topImprovers: [], classComparison: [], studentDetail: null, students: [] as unknown[],
    submissionStatus: { submitted: 1, missing: 0, pendingReview: 0, late: 0 }
  };
  const kpis = (average: number, activeStudents: number) => ({ activeClasses: 2, activeStudents, publishedAssignments: 2, submissions: 2, expectedSubmissions: 2, missingSubmissions: 0, pendingReview: 0, lateSubmissions: 0, completionRate: 100, average, highest: average, lowest: average, performanceChange: 0, followUpStudents: 1, neverLogged: 0 });
  if (mode === "global") return { ...base, scope: { mode, classId: "", className: "كل الصفوف", studentId: "", studentName: "", from: "", to: "" }, kpis: kpis(51.7, 3),
    assignmentTrend: [trend("a1", "cA", "صف ألف", 55, 2), trend("b1", "cB", "صف باء", 45, 1)],
    classComparison: [{ classId: "cA", name: "صف ألف", grade: "10", students: 2, assignments: 1, expected: 2, submitted: 2, missing: 0, pendingReview: 0, completionRate: 100, average: 55 }, { classId: "cB", name: "صف باء", grade: "11", students: 1, assignments: 1, expected: 1, submitted: 1, missing: 0, pendingReview: 0, completionRate: 100, average: 45 }],
    topicAnalytics: [{ topic: "جبر", average: 55, gradedQuestions: 2 }, { topic: "إحصاء", average: 45, gradedQuestions: 1 }],
    followUp: [person("u2", S2, "cA", "صف ألف", 20), person("b1", B1, "cB", "صف باء", 45)],
    topImprovers: [person("u1", S1, "cA", "صف ألف", 90, { trendDelta: 9 })],
    insights: [{ tone: "warning", title: "يوجد تراجع عام في الأداء", text: "انخفض متوسط الأداء" }], ...over };
  if (mode === "class") return { ...base, scope: { mode, classId: "cA", className: "صف ألف", studentId: "", studentName: "", from: "", to: "" }, kpis: kpis(55, 2),
    assignmentTrend: [trend("a1", "cA", "صف ألف", 55, 2), trend("a2", "cA", "صف ألف", 55, 2)],
    topicAnalytics: [{ topic: "جبر", average: 55, gradedQuestions: 2 }],
    followUp: [person("u2", S2, "cA", "صف ألف", 20)], topImprovers: [person("u1", S1, "cA", "صف ألف", 90, { trendDelta: 9 })],
    insights: [{ tone: "warning", title: "طلاب يحتاجون متابعة", text: "في الصف صف ألف، 1 طالبًا لديهم مؤشر متابعة" }],
    students: [{ userId: "u1", displayName: S1 }, { userId: "u2", displayName: S2 }], ...over };
  return { ...base, scope: { mode, classId: "cA", className: "صف ألف", studentId: "u1", studentName: S1, from: "", to: "" }, kpis: { ...kpis(90, 1), followUpStudents: 0 },
    assignmentTrend: [trend("a1", "cA", "صف ألف", 90, 1), trend("a2", "cA", "صف ألف", 90, 1)],
    gradeDistribution: [{ label: "90–100", count: 2 }],
    topicAnalytics: [{ topic: "جبر", average: 90, gradedQuestions: 2 }], followUp: [],
    insights: [{ tone: "success", title: "نقطة قوة", text: "أداء الطالب في موضوع جبر قوي بمتوسط 90%." }],
    students: [{ userId: "u1", displayName: S1 }, { userId: "u2", displayName: S2 }],
    studentDetail: { userId: "u1", displayName: S1, classId: "cA", className: "صف ألف", average: 90, assigned: 2, completed: 2, missing: 0, completionRate: 100, trendDelta: 0, trend: "stable", lastLoginAt: "2026-09-01T00:00:00.000Z", needsFollowUp: false, reasons: [], scoreTrend: [{ assignmentId: "a1", title: "واجب a1", date: "", percentage: 90 }, { assignmentId: "a2", title: "واجب a2", date: "", percentage: 90 }], topicAnalytics: [{ topic: "جبر", average: 90, gradedQuestions: 2 }] }, ...over };
}
/** The second student's own STUDENT-scope payload (server-computed from u2's records only). */
function studentU2() {
  const p = payload("student") as Record<string, unknown> & { studentDetail: Record<string, unknown>; kpis: Record<string, unknown> };
  return { ...p, scope: { ...(p.scope as object), studentId: "u2", studentName: S2 }, kpis: { ...p.kpis, average: 20, highest: 20, lowest: 20 },
    assignmentTrend: [trend("a1", "cA", "صف ألف", 20, 1), trend("a2", "cA", "صف ألف", 20, 1)], studentDetail: { ...p.studentDetail, userId: "u2", displayName: S2, average: 20 } };
}
// assignment-results as the server answers it: the whole class without studentId, exactly one student with it.
const ROW = (studentId: string, studentName: string, pct: number) => {
  const attempt = { attemptNumber: 1, score: pct / 10, totalMarks: 10, percentage: pct, submittedAt: "2026-09-01T00:00:00.000Z", gradingStatus: "final", finalized: true };
  return { studentId, studentName, studentCode: "C" + studentId, attemptsUsed: 1, allowedAttempts: 2, attempts: [attempt], latestResult: attempt };
};
function resultsFor(q: URLSearchParams) {
  const assignment = { assignmentId: q.get("assignmentId"), title: "واجب " + q.get("assignmentId"), maxAttempts: 2, totalMarks: 10 };
  const sid = q.get("studentId");
  if (sid === "u1") return { ok: true, assignment, stats: { students: 1, submitted: 1, pendingReview: 0, average: 90, highest: 90, lowest: 90 }, students: [ROW("u1", S1, 90)], scope: { mode: "student", studentId: "u1" } };
  if (sid === "u2") return { ok: true, assignment, stats: { students: 1, submitted: 1, pendingReview: 0, average: 20, highest: 20, lowest: 20 }, students: [ROW("u2", S2, 20)], scope: { mode: "student", studentId: "u2" } };
  return { ok: true, assignment, stats: { students: 2, submitted: 2, pendingReview: 0, average: 55, highest: 90, lowest: 20 }, students: [ROW("u1", S1, 90), ROW("u2", S2, 20)] };
}
const modeOf = (query: string) => query.includes("studentId=") ? "student" : query.includes("classId=") ? "class" : "global";

type Call = { url: string; init?: RequestInit };
const res = (status: number, body: unknown) => ({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);
/** Per-scope server. `hold(pattern)` makes the NEXT matching request wait until `release(pattern)`. */
function server() {
  const calls: Call[] = [];
  const holds = new Map<string, Array<() => void>>();
  const armed = new Set<string>();
  let aiAnswer = "نصيحة النطاق";
  const deferred = (key: string, make: () => Response) => {
    if (!armed.has(key)) return Promise.resolve(make());
    armed.delete(key);
    return new Promise<Response>(resolve => { const list = holds.get(key) || []; list.push(() => resolve(make())); holds.set(key, list); });
  };
  globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); calls.push({ url, init });
    if (url.startsWith("/api/teacher-analytics-ai")) { const answer = aiAnswer; return deferred("ai", () => res(200, { ok: true, advice: answer })); }
    if (url.startsWith("/api/teacher-analytics")) { const q = url.split("?")[1] || ""; return deferred("analytics:" + q, () => res(200, q.includes("studentId=u2") ? studentU2() : payload(modeOf(q)))); }
    if (url.startsWith("/api/teacher-achievement-feed")) return Promise.resolve(res(200, { ok: true, posts: [] }));
    if (url.startsWith("/api/assignment-results")) { const q = url.split("?")[1] || ""; return deferred("results:" + q, () => res(200, resultsFor(new URLSearchParams(q)))); }
    return Promise.resolve(res(404, { ok: false, error: "unexpected " + url }));
  }) as unknown as typeof fetch;
  return {
    calls,
    hold: (key: string) => { armed.add(key); },
    release: (key: string) => { const list = holds.get(key) || []; holds.delete(key); list.forEach(fn => fn()); },
    setAi: (text: string) => { aiAnswer = text; },
    analytics: () => calls.filter(c => c.url.startsWith("/api/teacher-analytics") && !c.url.startsWith("/api/teacher-analytics-ai")).map(c => c.url),
    ai: () => calls.filter(c => c.url === "/api/teacher-analytics-ai").map(c => JSON.parse(String(c.init?.body)))
  };
}

const caption = () => screen.getByTestId("dashboard-scope-caption").textContent;
const main = () => document.querySelector(".eb-dash-main") as HTMLElement | null;
const avgCard = () => (main()!.querySelector(".eb-stat-grid.is-primary .eb-stat-card .eb-stat-value") as HTMLElement).textContent;
async function boot() {
  const srv = server();
  charts.calls.length = 0;
  render(<TeacherDashboard token="tkn" />);
  await screen.findByRole("heading", { level: 2, name: "يحتاج إلى انتباهك" });
  return srv;
}
const pickClass = (id: string) => fireEvent.change(screen.getByLabelText("الصف"), { target: { value: id } });
const pickStudent = async (id: string) => fireEvent.change(await screen.findByLabelText("الطالب"), { target: { value: id } });
async function toClass(id = "cA") { pickClass(id); await waitFor(() => expect(caption()).toContain("جميع طلاب الصف")); await screen.findByRole("heading", { level: 2, name: "يحتاج إلى انتباهك" }); }
async function toStudent(id = "u1") { await screen.findByRole("option", { name: S1 }); await pickStudent(id); await waitFor(() => expect(caption()).toContain("الطالب:")); await screen.findByRole("heading", { level: 2, name: "يحتاج إلى انتباهك" }); }

function stubMatchMedia() {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => true })) as unknown as typeof window.matchMedia;
}
beforeEach(stubMatchMedia);
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("8A — scope transitions: GLOBAL → CLASS → STUDENT → clear student → clear class", () => {
  it("each step requests exactly its scope and the caption, KPIs and sections follow", async () => {
    const srv = await boot();
    // GLOBAL
    expect(srv.analytics()).toEqual(["/api/teacher-analytics"]);
    expect(caption()).toBe("كل الصفوف · جميع الطلاب");
    expect(avgCard()).toBe("51.7%");
    expect(screen.getByRole("heading", { level: 3, name: "مقارنة الصفوف" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: /^طلاب يحتاجون متابعة/ })).toBeTruthy();
    // CLASS
    await toClass("cA");
    expect(srv.analytics().at(-1)).toBe("/api/teacher-analytics?classId=cA");
    expect(caption()).toBe("الصف: صف ألف · جميع طلاب الصف");
    expect(avgCard()).toBe("55%");
    expect(screen.queryByRole("heading", { level: 3, name: "مقارنة الصفوف" })).toBeNull();
    expect(main()!.textContent).not.toContain(B1);
    expect(main()!.textContent).not.toContain("صف باء");
    // STUDENT
    await toStudent("u1");
    expect(srv.analytics().at(-1)).toBe("/api/teacher-analytics?classId=cA&studentId=u1");
    expect(caption()).toBe("الطالب: " + S1 + " · الصف: صف ألف");
    expect(avgCard()).toBe("90%");
    expect(within(main()!).getByText("معدل الطالب")).toBeTruthy();
    expect(within(main()!).getByText("الطالب المختار فقط")).toBeTruthy();
    // CLEAR STUDENT → CLASS
    await pickStudent("");
    await waitFor(() => expect(caption()).toBe("الصف: صف ألف · جميع طلاب الصف"));
    expect(srv.analytics().at(-1)).toBe("/api/teacher-analytics?classId=cA");
    await waitFor(() => expect(avgCard()).toBe("55%"));
    // CLEAR CLASS → GLOBAL (the student picker disappears)
    pickClass("");
    await waitFor(() => expect(caption()).toBe("كل الصفوف · جميع الطلاب"));
    expect(srv.analytics().at(-1)).toBe("/api/teacher-analytics");
    expect(screen.queryByLabelText("الطالب")).toBeNull();
    await waitFor(() => expect(avgCard()).toBe("51.7%"));
  });
  it("student mode hides the class comparison, the multi-student follow-up table and top improvers; no classmate name in analytics", async () => {
    await boot();
    await toClass("cA");
    expect(screen.getByRole("heading", { level: 3, name: "أفضل تحسن" })).toBeTruthy();
    charts.calls.length = 0;                                                   // only the student render's charts below
    await toStudent("u1");
    expect(screen.queryByRole("heading", { level: 3, name: "مقارنة الصفوف" })).toBeNull();
    expect(screen.queryByRole("heading", { level: 2, name: /^طلاب يحتاجون متابعة/ })).toBeNull();
    expect(screen.queryByRole("heading", { level: 3, name: "أفضل تحسن" })).toBeNull();
    expect(screen.queryByRole("list", { name: "اختيار صف لعرض تفاصيله" })).toBeNull();
    expect(main()!.textContent).not.toContain(S2);
    expect(main()!.textContent).not.toContain(B1);
    // student-worded charts
    expect(screen.getByRole("heading", { level: 3, name: "حركة علامات الطالب" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "الموضوعات لهذا الطالب" })).toBeTruthy();
    const line = charts.calls.filter(c => c.type === "line").at(-1)!;
    expect(line.data.datasets[0].label).toBe("علامة الطالب");
    expect(line.data.datasets[0].data).toEqual([90, 90]);
    expect(charts.calls.filter(c => c.type === "bar").some(c => c.data.datasets[0].label === "متوسط الصف")).toBe(false);
    expect(charts.calls.filter(c => c.type === "bar").at(-2)?.data.datasets[0].label).toBe("عدد الواجبات");
  });
  it("a new class drops the student: the student picker only lists the new class once it has loaded", async () => {
    const srv = await boot();
    await toClass("cA");
    await toStudent("u1");
    srv.hold("analytics:classId=cB");
    pickClass("cB");
    expect((screen.getByLabelText("الطالب") as HTMLSelectElement).value).toBe("");
    expect(screen.queryByRole("option", { name: S1 })).toBeNull();          // class A roster never offered for class B
    expect(srv.analytics().at(-1)).toBe("/api/teacher-analytics?classId=cB");
    srv.release("analytics:classId=cB");
    await waitFor(() => expect(caption()).toBe("الصف: صف باء · جميع طلاب الصف"));
  });
});

describe("8A — never show the previous scope while loading; stale responses cannot win", () => {
  it("while CLASS loads, the GLOBAL figures are gone and a loading status is shown", async () => {
    const srv = await boot();
    srv.hold("analytics:classId=cA");
    pickClass("cA");
    expect(main()).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("جارٍ تحميل بيانات النطاق المحدد");
    expect(screen.queryByRole("heading", { level: 3, name: "مقارنة الصفوف" })).toBeNull();
    expect(caption()).toBe("الصف: صف ألف · جميع طلاب الصف");
    srv.release("analytics:classId=cA");
    await waitFor(() => expect(avgCard()).toBe("55%"));
  });
  it("a slow CLASS response (older request) cannot overwrite the STUDENT scope", async () => {
    const srv = await boot();
    await toClass("cA");
    srv.hold("analytics:classId=cA");
    fireEvent.click(screen.getByRole("button", { name: "تحديث" }));          // class request in flight…
    await pickStudent("u1");                                                   // …then the student scope wins
    await waitFor(() => expect(avgCard()).toBe("90%"));
    srv.release("analytics:classId=cA");
    await new Promise(r => setTimeout(r, 0));
    expect(caption()).toBe("الطالب: " + S1 + " · الصف: صف ألف");
    expect(avgCard()).toBe("90%");
    expect(main()!.textContent).not.toContain(S2);
  });
  it("a slow STUDENT response cannot overwrite the CLASS scope the teacher returned to", async () => {
    const srv = await boot();
    await toClass("cA");
    await screen.findByRole("option", { name: S1 });
    srv.hold("analytics:classId=cA&studentId=u1");
    await pickStudent("u1");
    await pickStudent("");
    await waitFor(() => expect(avgCard()).toBe("55%"));
    srv.release("analytics:classId=cA&studentId=u1");
    await new Promise(r => setTimeout(r, 0));
    expect(caption()).toBe("الصف: صف ألف · جميع طلاب الصف");
    expect(avgCard()).toBe("55%");
  });
  it("a scope change closes open drill panels immediately", async () => {
    await boot();
    const table = screen.getByRole("heading", { level: 2, name: "متابعة الواجبات" }).closest("section")!.querySelector("table")!;
    fireEvent.click(within(table).getByRole("button", { name: "واجب a1" }));
    await screen.findByRole("complementary", { name: "واجب a1" });
    pickClass("cA");
    expect(screen.queryByRole("complementary")).toBeNull();
  });
});

describe("8A — AI follows the scope", () => {
  it("one button whose label, description and payload follow GLOBAL / CLASS / STUDENT", async () => {
    const srv = await boot();
    expect(screen.getByRole("heading", { level: 2, name: "تحليل البيانات العامة واستخلاص العبر" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /تحليل البيانات العامة واستخلاص العبر/ }));
    await screen.findByText("نصيحة النطاق");
    await toClass("cA");
    expect(screen.queryByText("نصيحة النطاق")).toBeNull();
    expect(screen.getByText(/بيانات الصف صف ألف وجميع طلابه فقط/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /تحليل بيانات الصف واستخلاص العبر/ }));
    await screen.findByText("نصيحة النطاق");
    await toStudent("u1");
    expect(screen.queryByText("نصيحة النطاق")).toBeNull();
    expect(screen.getByText(new RegExp("بيانات الطالب " + S1 + " وحده"))).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /واستخلاص العبر|بالذكاء الاصطناعي/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /تحليل بيانات الطالب واستخلاص العبر/ }));
    await screen.findByText("نصيحة النطاق");
    expect(srv.ai()).toEqual([{}, { classId: "cA" }, { classId: "cA", studentId: "u1" }]);
  });
  it("advice requested for one scope never appears after a scope change", async () => {
    const srv = await boot();
    srv.setAi("نصيحة عامة قديمة");
    srv.hold("ai");
    fireEvent.click(screen.getByRole("button", { name: /تحليل البيانات العامة واستخلاص العبر/ }));
    await toClass("cA");
    srv.release("ai");
    await new Promise(r => setTimeout(r, 0));
    expect(screen.queryByText("نصيحة عامة قديمة")).toBeNull();
    expect((screen.getByRole("button", { name: /تحليل بيانات الصف واستخلاص العبر/ }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("8A — CSV and achievements follow the scope", () => {
  async function csvText() {
    let captured: Blob | null = null;
    URL.createObjectURL = vi.fn((b: Blob) => { captured = b; return "blob:x"; }) as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    fireEvent.click(screen.getByRole("button", { name: "تصدير CSV" }));
    return (captured as unknown as Blob).text();
  }
  it("GLOBAL: scope line + class comparison; CLASS: class name, no comparison; STUDENT: student + class, no classmate, no comparison / improvers", async () => {
    await boot();
    let text = await csvText();
    expect(text).toContain('"النطاق","كل الصفوف / جميع الطلاب"');
    expect(text).toContain('"مقارنة الصفوف"');
    await toClass("cA");
    text = await csvText();
    expect(text).toContain('"النطاق","صف ألف"');
    expect(text).not.toContain("مقارنة الصفوف");
    expect(text).not.toContain(B1);
    expect(text).toContain('"أفضل تحسن"');
    await toStudent("u1");
    text = await csvText();
    expect(text).toContain('"النطاق","الطالب: ' + S1 + ' / الصف: صف ألف"');
    expect(text).toContain('"متابعة الطالب"');
    for (const absent of [S2, B1, "مقارنة الصفوف", "أفضل تحسن", "طلاب يحتاجون متابعة"]) expect(text).not.toContain(absent);
  });
  it("CSV is disabled while another scope is loading (never exports the previous scope)", async () => {
    const srv = await boot();
    srv.hold("analytics:classId=cA");
    pickClass("cA");
    expect((screen.getByRole("button", { name: "تصدير CSV" }) as HTMLButtonElement).disabled).toBe(true);
    srv.release("analytics:classId=cA");
    await waitFor(() => expect((screen.getByRole("button", { name: "تصدير CSV" }) as HTMLButtonElement).disabled).toBe(false));
  });
  it("achievements request the same scope at every step", async () => {
    const srv = await boot();
    const feed = () => srv.calls.filter(c => c.url.startsWith("/api/teacher-achievement-feed")).map(c => c.url);
    expect(feed().at(-1)).toBe("/api/teacher-achievement-feed");
    await toClass("cA");
    expect(feed().at(-1)).toBe("/api/teacher-achievement-feed?classId=cA");
    await toStudent("u1");
    expect(feed().at(-1)).toBe("/api/teacher-achievement-feed?classId=cA&studentId=u1");
    pickClass("");
    await waitFor(() => expect(feed().at(-1)).toBe("/api/teacher-achievement-feed"));
  });
});

describe("8A — dashboard page icon", () => {
  const nav = (workspaceTab: string) => ({ teacherView: "platform", workspaceTab, projectCode: "", projectList: [] }) as never;
  it("the «لوحة المتابعة» title carries the existing dashboard SVG icon (decorative, no emoji); other pages carry none", () => {
    const { rerender } = render(<TeacherAppShell nav={nav("dashboard")} projectReadyTotal={0} displayName="م" onNavigate={() => {}} onLogout={() => {}}><p>x</p></TeacherAppShell>);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toBe("لوحة المتابعة");
    const icon = h1.querySelector(".eb-page-header-icon");
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
    expect(icon?.querySelector("svg")).toBeTruthy();
    rerender(<TeacherAppShell nav={nav("students")} projectReadyTotal={0} displayName="م" onNavigate={() => {}} onLogout={() => {}}><p>x</p></TeacherAppShell>);
    expect(screen.getByRole("heading", { level: 1 }).querySelector(".eb-page-header-icon")).toBeNull();
  });
});

describe("8A review fix — the assignment drill follows the scope", () => {
  const openA1 = () => fireEvent.click(within(screen.getByRole("heading", { level: 2, name: /^(متابعة الواجبات|واجبات الطالب)$/ }).closest("section")!.querySelector("table")!).getByRole("button", { name: "واجب a1" }));
  const results = (srv: ReturnType<typeof server>) => srv.calls.filter(c => c.url.startsWith("/api/assignment-results")).map(c => c.url);
  it("STUDENT scope: the drill request carries assignmentId + studentId and shows only that student's own result", async () => {
    const srv = await boot();
    await toClass("cA");
    await toStudent("u1");
    expect(screen.getByText("افتح أي واجب لعرض نتيجة الطالب ومحاولاته")).toBeTruthy();
    openA1();
    const panel = await screen.findByRole("complementary", { name: "واجب a1" });
    expect(results(srv).at(-1)).toBe("/api/assignment-results?assignmentId=a1&studentId=u1");
    expect(panel.textContent).toContain("نتيجة الطالب ومحاولاته · " + S1);
    expect(panel.textContent).toContain("علامة الطالب 90%");
    expect(panel.textContent).toContain("محاولة #1 · 90%");
    for (const classLabel of ["المتوسط", "سلّموا", "أعلى", "20%"]) expect(panel.textContent).not.toContain(classLabel);
    expect(panel.textContent).not.toContain(S2);
    expect(panel.querySelector("table")).toBeNull();                                     // no roster table
  });
  it("STUDENT scope: a class-wide answer is refused — no classmate name or attempt is ever rendered", async () => {
    const srv = await boot();
    await toClass("cA");
    await toStudent("u1");
    const realFetch = globalThis.fetch;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => String(input).startsWith("/api/assignment-results")
      ? Promise.resolve(res(200, resultsFor(new URLSearchParams("assignmentId=a1"))))       // a forged / legacy class response
      : realFetch(input, init)) as typeof fetch;
    openA1();
    await screen.findByText("تعذر فتح نتيجة الطالب لهذا الواجب.");
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(document.body.textContent).not.toContain("20%");
    expect(main()!.textContent).not.toContain(S2);
    void srv;
  });
  it("CLASS scope: the drill is the whole class exactly as before (no studentId)", async () => {
    const srv = await boot();
    await toClass("cA");
    expect(screen.getByText("افتح أي واجب لعرض نتائج طلابه ومحاولاتهم")).toBeTruthy();
    openA1();
    const panel = await screen.findByRole("complementary", { name: "واجب a1" });
    expect(results(srv).at(-1)).toBe("/api/assignment-results?assignmentId=a1");
    expect(panel.textContent).toContain("المتوسط 55%");
    expect(panel.textContent).toContain("سلّموا 2/2");
    expect(within(panel).getAllByRole("row").slice(1).map(r => r.firstElementChild?.textContent)).toEqual([S1, S2]);
  });
  it("GLOBAL scope: unchanged whole-class drill", async () => {
    const srv = await boot();
    openA1();
    const panel = await screen.findByRole("complementary", { name: "واجب a1" });
    expect(results(srv).at(-1)).toBe("/api/assignment-results?assignmentId=a1");
    expect(panel.textContent).toContain(S2);
  });
  it("switching student A → B while A's drill is in flight never shows A's drill under B", async () => {
    const srv = await boot();
    await toClass("cA");
    await toStudent("u1");
    srv.hold("results:assignmentId=a1&studentId=u1");
    openA1();
    await pickStudent("u2");
    await waitFor(() => expect(caption()).toBe("الطالب: " + S2 + " · الصف: صف ألف"));
    await screen.findByRole("heading", { level: 2, name: "يحتاج إلى انتباهك" });
    srv.release("results:assignmentId=a1&studentId=u1");
    await new Promise(r => setTimeout(r, 0));
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(document.body.textContent).not.toContain("محاولة #1 · 90%");
    // B's own drill is B's result only
    openA1();
    const panel = await screen.findByRole("complementary", { name: "واجب a1" });
    expect(results(srv).at(-1)).toBe("/api/assignment-results?assignmentId=a1&studentId=u2");
    expect(panel.textContent).toContain("نتيجة الطالب ومحاولاته · " + S2);
    expect(panel.textContent).not.toContain(S1);
  });
  it("returning to the class scope invalidates an in-flight student drill", async () => {
    const srv = await boot();
    await toClass("cA");
    await toStudent("u1");
    srv.hold("results:assignmentId=a1&studentId=u1");
    openA1();
    await pickStudent("");
    await waitFor(() => expect(caption()).toBe("الصف: صف ألف · جميع طلاب الصف"));
    await screen.findByRole("heading", { level: 2, name: "يحتاج إلى انتباهك" });
    srv.release("results:assignmentId=a1&studentId=u1");
    await new Promise(r => setTimeout(r, 0));
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(screen.queryByRole("status", { name: /تفاصيل الواجب/ })).toBeNull();
  });
  it("an open student drill closes when the student changes", async () => {
    await boot();
    await toClass("cA");
    await toStudent("u1");
    openA1();
    await screen.findByRole("complementary", { name: "واجب a1" });
    await pickStudent("u2");
    expect(screen.queryByRole("complementary")).toBeNull();
  });
});
