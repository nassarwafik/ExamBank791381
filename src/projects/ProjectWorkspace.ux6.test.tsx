// @vitest-environment happy-dom
//
// UX-6a — Teacher Projects workspace. Drives the REAL ProjectHub / ProjectTracker tree with a routed fetch
// mock and pins: hub hierarchy (no hero, App-provided catalog, ready counts), workspace toolbar (labelled class
// selector with active/archived groups, read-only badge, aria-pressed view switch, no tablist), the exact
// request model (classes once, one resource per view, zero requests for search / filter / track switches,
// no fan-out when returning from a student profile, no per-card requests), dashboard StatCards + progress
// bars, student cards, the non-modal student profile (heading focus in, opener focus back, aria-expanded
// disclosures, ONE primary approve action + ActionMenu, exact progress.update bodies for status and note,
// timeline), analytics (ChartCard tabular equivalents, reduced motion, text track selector, non-colour-only
// heatmap), stage settings (labelled controls, exact template.update body, reset through ConfirmDialog with
// the exact project.reset body and cancel → zero mutations), archived read-only behaviour, loading / error /
// empty states and source guards (no emoji controls, no outline:none).
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";

vi.mock("react-chartjs-2", () => ({
  Bar: (p: { options?: { animation?: boolean } }) => <canvas data-chart="bar" data-animation={String(p.options?.animation ?? "default")} />,
  Line: (p: { options?: { animation?: boolean } }) => <canvas data-chart="line" data-animation={String(p.options?.animation ?? "default")} />,
  Doughnut: (p: { options?: { animation?: boolean } }) => <canvas data-chart="doughnut" data-animation={String(p.options?.animation ?? "default")} />
}));

import ProjectHub from "./ProjectHub";
import ProjectTracker from "./ProjectTracker";

const TRACKS = [{ trackId: "book", title: "الكتاب", icon: "📘" }, { trackId: "packetTracer", title: "Packet Tracer", icon: "🖧" }];
const CATALOG = [{ projectCode: "794589", title: "مشروع 794589", tracks: TRACKS }, { projectCode: "899373", title: "مشروع 899373", tracks: [TRACKS[0], { trackId: "access", title: "Access" }] }];
const CLASSES = [
  { classId: "c1", name: "الحادي عشر", grade: "11", schoolYear: "2025-2026", status: "active", studentCount: 2 },
  { classId: "c2", name: "دفعة 2024", grade: "12", schoolYear: "2024-2025", status: "archived", archivedAt: "2025-06-01T00:00:00.000Z", studentCount: 1 }
];
const SUMMARY = { studentCount: 2, avgOverall: 55, trackAverages: { book: 70, packetTracer: 40 }, completedCount: 1, studentsReadyForReview: 1, totalReadyStages: 3, staleCount: 1, trackWeights: { book: 1, packetTracer: 1 }, staleDays: 7 };
const CARD = (over: Record<string, unknown>) => ({ studentId: "s1", displayName: "زيد صالح", code: "P1", overallProgress: 45, trackProgress: { book: 60, packetTracer: 30 }, counts: { not_started: 4, in_progress: 2, ready_for_review: 1, approved: 3 }, readyForReviewCount: 1, complete: false, updatedAt: "2026-03-01T10:00:00.000Z", stale: false, ...over });
const STUDENTS = [CARD({}), CARD({ studentId: "s2", displayName: "خالد عمر", code: "P2", overallProgress: 100, complete: true, readyForReviewCount: 0, counts: { not_started: 0, in_progress: 0, ready_for_review: 0, approved: 10 }, stale: true })];
const STAGES = [
  { stageId: "B01", track: "book", groupId: "g1", title: "مقدمة الشبكات", description: "اقرأ الفصل الأول", order: 1, weight: 1, required: true, active: true },
  { stageId: "B02", track: "book", groupId: "g1", title: "طبقات OSI", order: 2, weight: 1, required: false, active: true },
  { stageId: "P01", track: "packetTracer", groupId: "g2", title: "أول طوبولوجيا", order: 1, weight: 1, required: true, active: true }
];
const GROUPS = [{ groupId: "g1", track: "book", title: "الوحدة الأولى", order: 1 }, { groupId: "g2", track: "packetTracer", title: "مختبرات", order: 1 }];
const DETAIL = (readOnly = false) => ({
  ok: true, readOnly, projectCode: "794589",
  student: { studentId: "s1", displayName: "زيد صالح", code: "P1" },
  tracks: TRACKS, summary: STUDENTS[0], stages: STAGES, groups: GROUPS, trackWeights: { book: 1, packetTracer: 1 },
  config: { staleDays: 7, lateThreshold: 40, balanceWarningThreshold: 30 },
  progress: { B01: { status: "ready_for_review", note: "راجع القسم 2", updatedAt: "2026-03-01T10:00:00.000Z" }, B02: { status: "in_progress", updatedAt: "2026-02-20T10:00:00.000Z" } },
  history: [{ eventId: "e1", stageId: "B01", type: "status", fromStatus: "in_progress", toStatus: "ready_for_review", actor: "t", createdAt: "2026-03-01T10:00:00.000Z" }, { eventId: "e2", stageId: "B01", type: "note", actor: "t", createdAt: "2026-03-02T10:00:00.000Z" }],
  nextStages: { book: STAGES[1], packetTracer: null },
  balance: { leadingTrackId: "book", leadingTrackTitle: "الكتاب", laggingTrackId: "packetTracer", laggingTrackTitle: "Packet Tracer", diff: 30 }
});
const ANALYTICS = {
  perStudent: [{ studentId: "s1", name: "زيد صالح", trackProgress: { book: 60, packetTracer: 30 }, overall: 45 }, { studentId: "s2", name: "خالد عمر", trackProgress: { book: 100, packetTracer: 100 }, overall: 100 }],
  stageCompletion: [{ stageId: "B01", title: "مقدمة الشبكات", track: "book", groupId: "g1", approvedPct: 50 }, { stageId: "P01", title: "أول طوبولوجيا", track: "packetTracer", groupId: "g2", approvedPct: 100 }],
  buckets: { "0-25": 0, "26-50": 1, "51-75": 0, "76-99": 0, "100": 1 },
  weeklyTrend: [{ weekStart: "2026-02-22", avgOverall: 40 }, { weekStart: "2026-03-01", avgOverall: 72 }],
  heatmap: { students: [{ studentId: "s1", name: "زيد صالح" }, { studentId: "s2", name: "خالد عمر" }], stages: STAGES.map(s => ({ stageId: s.stageId, title: s.title, track: s.track, groupId: s.groupId })), statuses: [{ B01: "ready_for_review", B02: "in_progress", P01: "not_started" }, { B01: "approved", B02: "approved", P01: "approved" }] }
};
const TEMPLATE = { stages: STAGES, groups: GROUPS, trackWeights: { book: 1, packetTracer: 1 }, config: { staleDays: 7, lateThreshold: 40 } };

type Call = { method: string; url: string; body?: Record<string, unknown> };
let calls: Call[] = [];
let failStudents = false;
let failProgress = false;
let noChangeProgress = false;
const json = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => body } as Response);

function route(url: string, init?: RequestInit): Promise<Response> {
  const method = init?.method || "GET";
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  calls.push({ method, url, body });
  const u = new URL(url, "http://x");
  if (method === "GET") {
    const resource = u.searchParams.get("resource");
    const classId = u.searchParams.get("classId");
    if (resource === "classes") return json({ ok: true, projectCode: "794589", title: "مشروع 794589", tracks: TRACKS, classes: CLASSES });
    if (resource === "summary") return json({ ok: true, summary: SUMMARY, tracks: TRACKS, readOnly: classId === "c2" });
    if (resource === "students") return failStudents ? json({ ok: false, error: "تعذر تحميل الطلاب (خادم)." }, 500) : json({ ok: true, students: STUDENTS, tracks: TRACKS, config: { lateThreshold: 40 }, readOnly: classId === "c2" });
    if (resource === "student") return json(DETAIL(classId === "c2"));
    if (resource === "analytics") return json({ ok: true, analytics: ANALYTICS, tracks: TRACKS, groups: GROUPS, readOnly: classId === "c2" });
    if (resource === "template") return json({ ok: true, template: TEMPLATE, tracks: TRACKS, readOnly: classId === "c2" });
    return json({ ok: false, error: "resource غير معروف." }, 400);
  }
  const action = body?.action;
  if (action === "progress.update") {
    if (failProgress) return json({ ok: false, error: "تعارض مؤقت." }, 503);
    if (noChangeProgress) return json({ ok: true, noChange: true });
    const st = (body?.status as string) || "ready_for_review";
    return json({ ok: true, projectCode: "794589", summary: { ...STUDENTS[0], overallProgress: 50 }, stage: { stageId: body?.stageId, status: st, note: (body?.note as string) ?? "راجع القسم 2", updatedAt: "2026-03-05T10:00:00.000Z" }, nextStages: { book: STAGES[1], packetTracer: null }, balance: null, history: [{ eventId: "e3", stageId: body?.stageId, type: body?.note !== undefined ? "note" : "status", toStatus: st, actor: "t", createdAt: "2026-03-05T10:00:00.000Z" }] });
  }
  if (action === "template.update") return json({ ok: true, projectCode: "794589", template: TEMPLATE });
  if (action === "project.reset") return json({ ok: true, projectCode: "794589", deletedProgressCount: 2 });
  return json({ ok: false, error: "إجراء غير معروف." }, 400);
}

beforeEach(() => {
  calls = []; failStudents = false; failProgress = false; noChangeProgress = false;
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => route(String(input), init)) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const gets = (resource: string) => calls.filter(c => c.method === "GET" && new URL(c.url, "http://x").searchParams.get("resource") === resource);
const posts = () => calls.filter(c => c.method === "POST").map(c => c.body);
const toolbar = () => screen.getByRole("region", { name: "مساحة عمل المشروع" });
const views = () => within(toolbar()).getByRole("group", { name: "أقسام المشروع" });
const view = (label: string) => within(views()).getByRole("button", { name: label });
async function mountTracker(code = "794589") {
  render(<ProjectTracker token="t" projectCode={code} />);
  await screen.findByRole("heading", { level: 2, name: "لوحة المشروع" });
}
async function openStudents() { fireEvent.click(view("تقدّم الطلاب")); return await screen.findByRole("heading", { level: 2, name: "تقدّم الطلاب" }); }
const cardOf = (name: string) => screen.getByText(name).closest(".eb-student-card") as HTMLElement;
async function openStudent(name = "زيد صالح") {
  const opener = within(cardOf(name)).getByRole("button", { name: "فتح ملف الطالب" });
  opener.focus(); fireEvent.click(opener);
  const heading = await screen.findByRole("heading", { level: 2, name: "ملف المشروع: " + name });
  return { opener, heading, profile: heading.closest(".eb-student-profile") as HTMLElement };
}
// Control/label glyphs only: the "✓" (U+2713) prefix of existing success notices is text parity, not a control.
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{2712}\u{2714}-\u{27BF}\u{2B00}-\u{2BFF}]/u;

describe("UX-6a hub — App-provided catalog, no hero, no request", () => {
  it("renders one card per project with title, quiet code, track chips, ready count and a primary open action; issues no fetch", () => {
    const onOpen = vi.fn();
    render(<ProjectHub projects={CATALOG} status="ready" readyByProject={{ "794589": 3 }} onOpenProject={onOpen} />);
    expect(calls).toHaveLength(0);
    expect(document.querySelector(".teacher-assignment-heading")).toBeNull();
    expect(document.querySelector("h1")).toBeNull();
    const cards = screen.getAllByRole("listitem").filter(li => li.classList.contains("eb-project-card"));
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByRole("heading", { level: 2, name: "مشروع 794589" })).toBeTruthy();
    expect(within(cards[0]).getByText("الرمز 794589")).toBeTruthy();
    expect(within(within(cards[0]).getByRole("list", { name: "مسارات مشروع 794589" })).getAllByRole("listitem").map(l => l.textContent)).toEqual(["الكتاب", "Packet Tracer"]);
    expect(within(cards[0]).getByText("3 مراحل بانتظار الفحص")).toBeTruthy();
    expect(within(cards[1]).getByText("لا مراحل بانتظار الفحص")).toBeTruthy();
    fireEvent.click(within(cards[1]).getByRole("button", { name: "فتح المشروع" }));
    expect(onOpen).toHaveBeenCalledWith("899373");
    expect(EMOJI.test(document.body.textContent || "")).toBe(false);
  });
  it("loading, error (with retry) and empty states", () => {
    const onRetry = vi.fn();
    const { rerender } = render(<ProjectHub projects={[]} status="loading" readyByProject={{}} onOpenProject={() => {}} />);
    expect(screen.getByRole("status").textContent).toContain("جارٍ تحميل المشاريع");
    rerender(<ProjectHub projects={[]} status="error" readyByProject={{}} onRetry={onRetry} onOpenProject={() => {}} />);
    expect(screen.getByRole("alert").textContent).toContain("تعذر تحميل قائمة المشاريع");
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    rerender(<ProjectHub projects={[]} status="ready" readyByProject={{}} onOpenProject={() => {}} />);
    expect(screen.getByText("لا توجد مشاريع مسجّلة.")).toBeTruthy();
    expect(calls).toHaveLength(0);
  });
});

describe("UX-6a workspace — toolbar, class selector, view switch, request model", () => {
  it("loads classes exactly once, focuses the workspace, shows project context (no hero / h1), a labelled class selector with active + archived groups, and an aria-pressed view switch (no tablist)", async () => {
    await mountTracker();
    expect(gets("classes")).toHaveLength(1);
    expect(gets("classes")[0].url).toBe("/api/project-tracker?projectCode=794589&resource=classes");
    expect(document.querySelector(".teacher-assignment-heading")).toBeNull();
    expect(document.querySelector("h1")).toBeNull();
    expect(document.querySelector('[role="tablist"]')).toBeNull();
    expect(document.activeElement).toBe(toolbar());
    expect(within(toolbar()).getByText("مشروع 794589")).toBeTruthy();
    expect(within(toolbar()).getByText("الرمز 794589")).toBeTruthy();
    const select = within(toolbar()).getByLabelText("الصف") as HTMLSelectElement;
    expect(select.value).toBe("c1");                                                                   // first ACTIVE class
    expect(Array.from(select.querySelectorAll("optgroup")).map(g => g.getAttribute("label"))).toEqual(["الصفوف النشطة", "السنوات السابقة / الصفوف المؤرشفة"]);
    expect(within(views()).getAllByRole("button").map(b => b.textContent + "=" + b.getAttribute("aria-pressed"))).toEqual(["لوحة المشروع=true", "تقدّم الطلاب=false", "الإحصائيات=false", "إعداد المراحل=false"]);
    expect(within(toolbar()).queryByText(/للقراءة فقط/)).toBeNull();
    // dashboard = exactly one summary read; StatCards from the payload; semantic progress bars
    expect(gets("summary")).toHaveLength(1);
    expect(gets("summary")[0].url).toBe("/api/project-tracker?projectCode=794589&resource=summary&classId=c1");
    const cards = Array.from(document.querySelectorAll(".eb-stat-grid.is-primary .eb-stat-card")).map(c => (c.querySelector(".eb-stat-label")?.textContent || "") + "=" + (c.querySelector(".eb-stat-value")?.textContent || ""));
    expect(cards).toEqual(["الطلاب=2", "مكتملون=1", "ينتظرون الفحص=1", "مراحل جاهزة للفحص=3"]);
    expect(document.querySelector(".eb-stat-hint")?.textContent).toBe("بلا تحديث 7+ أيام: 1");
    const bars = screen.getAllByRole("progressbar");
    expect(bars.map(b => b.getAttribute("aria-valuenow"))).toEqual(["55", "70", "40"]);
    expect(screen.getByRole("progressbar", { name: "التقدم العام للصف" })).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "متوسط الكتاب" })).toBeTruthy();
    expect(EMOJI.test(toolbar().textContent || "")).toBe(false);
  });
  it("switching views loads only that view's resource (once each); the refresh action re-reads classes + the current view", async () => {
    await mountTracker();
    await openStudents();
    expect(gets("students")).toHaveLength(1); expect(gets("analytics")).toHaveLength(0); expect(gets("template")).toHaveLength(0);
    expect(gets("students")[0].url).toBe("/api/project-tracker?projectCode=794589&resource=students&classId=c1");
    fireEvent.click(view("الإحصائيات"));
    await screen.findByRole("heading", { level: 2, name: "الإحصائيات" });
    expect(gets("analytics")).toHaveLength(1);
    expect(gets("analytics")[0].url).toBe("/api/project-tracker?projectCode=794589&resource=analytics&classId=c1");
    fireEvent.click(view("إعداد المراحل"));
    await screen.findByRole("heading", { level: 2, name: "إعداد المراحل" });
    expect(gets("template")).toHaveLength(1);
    expect(gets("template")[0].url).toBe("/api/project-tracker?projectCode=794589&resource=template&classId=c1");
    expect(gets("classes")).toHaveLength(1); expect(gets("summary")).toHaveLength(1);
    fireEvent.click(within(toolbar()).getByRole("button", { name: "المزيد من إجراءات المشروع" }));
    fireEvent.click(await screen.findByRole("button", { name: "تحديث" }));
    await waitFor(() => expect(gets("classes")).toHaveLength(2));
    await waitFor(() => expect(gets("template")).toHaveLength(2));
    expect(gets("summary")).toHaveLength(1);                                                           // only the current view reloads
  });
  it("selecting the archived class marks the workspace read-only (badge) and re-reads the current view for that class", async () => {
    await mountTracker();
    fireEvent.change(within(toolbar()).getByLabelText("الصف"), { target: { value: "c2" } });
    expect(await within(toolbar()).findByText("مؤرشف — للقراءة فقط")).toBeTruthy();
    await waitFor(() => expect(gets("summary")).toHaveLength(2));
    expect(gets("summary")[1].url).toBe("/api/project-tracker?projectCode=794589&resource=summary&classId=c2");
    expect(gets("classes")).toHaveLength(1);
  });
  it("no classes → EmptyState pointing at Classes & Students; classes failure → alert + retry", async () => {
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => { calls.push({ method: "GET", url: String(input) }); return json({ ok: true, projectCode: "794589", title: "مشروع 794589", tracks: TRACKS, classes: [] }); }) as unknown as typeof fetch;
    render(<ProjectTracker token="t" projectCode="794589" />);
    expect(await screen.findByText("لا يوجد صف مرتبط بهذا المشروع بعد.")).toBeTruthy();
    expect(gets("summary")).toHaveLength(0);
    cleanup(); calls = [];
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => { calls.push({ method: "GET", url: String(input) }); return json({ ok: false, error: "انقطع الاتصال." }, 500); }) as unknown as typeof fetch;
    render(<ProjectTracker token="t" projectCode="794589" />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("انقطع الاتصال.");
    fireEvent.click(within(alert).getByRole("button", { name: "إعادة المحاولة" }));
    await waitFor(() => expect(gets("classes")).toHaveLength(2));
  });
});

describe("UX-6a students view — cards, labelled search, aria-pressed filters, zero requests, states", () => {
  it("renders cards from the payload, filters/searches client-side with zero requests and reports the count", async () => {
    await mountTracker();
    await openStudents();
    expect(screen.getByRole("status").textContent).toBe("2 من 2 طالب");
    const zaid = cardOf("زيد صالح");
    expect(within(zaid).getAllByRole("progressbar").map(b => b.getAttribute("aria-valuenow"))).toEqual(["45", "60", "30"]);
    expect(within(zaid).getByText("تم الاعتماد 3")).toBeTruthy();
    expect(within(zaid).getByText("جاهز للفحص 1")).toBeTruthy();
    expect(within(zaid).getAllByRole("button").map(b => b.textContent)).toEqual(["فتح ملف الطالب"]);        // one action per card
    expect(within(cardOf("خالد عمر")).getByText("مكتمل")).toBeTruthy();
    const n = calls.length;
    const chips = screen.getByRole("group", { name: "تصفية الطلاب" });
    fireEvent.click(within(chips).getByRole("button", { name: "مكتملون" }));
    expect(within(chips).getByRole("button", { name: "مكتملون" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByText("زيد صالح")).toBeNull(); expect(screen.getByText("خالد عمر")).toBeTruthy();
    fireEvent.click(within(chips).getByRole("button", { name: "الكل" }));
    fireEvent.change(screen.getByLabelText("بحث"), { target: { value: "P1" } });
    expect(screen.getByText("زيد صالح")).toBeTruthy(); expect(screen.queryByText("خالد عمر")).toBeNull();
    fireEvent.change(screen.getByLabelText("بحث"), { target: { value: "zzz" } });
    expect(screen.getByText("لا يوجد طلاب مطابقون للتصفية.")).toBeTruthy();
    expect(calls.length).toBe(n);                                                                     // zero requests
    expect(EMOJI.test(document.body.textContent || "")).toBe(false);
  });
  it("students request failure → alert with retry (one more read); empty class → EmptyState", async () => {
    failStudents = true;
    await mountTracker();
    fireEvent.click(view("تقدّم الطلاب"));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("تعذر تحميل الطلاب (خادم).");
    failStudents = false;
    fireEvent.click(within(alert).getByRole("button", { name: "إعادة المحاولة" }));
    await screen.findByText("زيد صالح");
    expect(gets("students")).toHaveLength(2);
  });
});

describe("UX-6a student profile — non-modal, focus, disclosures, actions, exact payloads", () => {
  it("opens with focus on the heading, one student read, aria-expanded groups/stages, primary approve + ActionMenu, exact progress.update bodies, notice, timeline; back returns focus to the opener without re-reading the list when nothing changed", async () => {
    await mountTracker();
    await openStudents();
    const { opener, heading, profile } = await openStudent();
    expect(gets("student")).toHaveLength(1);
    expect(gets("student")[0].url).toBe("/api/project-tracker?projectCode=794589&resource=student&classId=c1&studentId=s1");
    expect(document.activeElement).toBe(heading);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.querySelector('[role="tablist"]')).toBeNull();
    // hidden (still mounted) list — no duplicate students read
    expect(document.querySelector(".eb-project-students")?.closest("[hidden]")).toBeTruthy();
    // summary + next steps + balance as text
    expect(within(profile).getByRole("progressbar", { name: "التقدم العام" }).getAttribute("aria-valuenow")).toBe("45");
    expect(within(profile).getByText("الكتاب متقدّم على Packet Tracer بـ 30%")).toBeTruthy();
    expect(within(profile).getByText("الكتاب: B02 — طبقات OSI")).toBeTruthy();
    expect(within(profile).getByText("Packet Tracer: مكتمل")).toBeTruthy();
    // track switch = aria-pressed, zero requests
    const n = calls.length;
    const trackGroup = within(profile).getByRole("group", { name: "مسارات المشروع" });
    fireEvent.click(within(trackGroup).getByRole("button", { name: "Packet Tracer" }));
    expect(within(trackGroup).getByRole("button", { name: "Packet Tracer" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("أول طوبولوجيا")).toBeTruthy();
    fireEvent.click(within(trackGroup).getByRole("button", { name: "الكتاب" }));
    expect(calls.length).toBe(n);
    // group disclosure
    const group = within(profile).getByRole("button", { name: /الوحدة الأولى/ });
    expect(group.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById(group.getAttribute("aria-controls") || "")).toBeTruthy();
    fireEvent.click(group);
    expect(group.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("مقدمة الشبكات")).toBeNull();
    fireEvent.click(group);
    // stage disclosure + status badge text
    const stage = within(profile).getByRole("button", { name: /B01/ });
    expect(stage.getAttribute("aria-expanded")).toBe("false");
    expect(stage.textContent).toContain("جاهز للفحص");
    fireEvent.click(stage);
    expect(stage.getAttribute("aria-expanded")).toBe("true");
    const panel = document.getElementById(stage.getAttribute("aria-controls") || "") as HTMLElement;
    expect(panel.textContent).toContain("اقرأ الفصل الأول");
    // exactly one primary action + one menu (no four equal buttons)
    expect(within(panel).getAllByRole("button").map(b => b.textContent)).toEqual(["اعتماد المرحلة", "تغيير الحالة", "حفظ الملاحظة"]);
    fireEvent.click(within(panel).getByRole("button", { name: "تغيير حالة المرحلة B01" }));
    const menu = await screen.findByRole("group", { name: "تغيير حالة المرحلة B01" });
    const items = within(menu).getAllByRole("button");
    expect(items.map(b => b.textContent)).toEqual(["لم يبدأ", "قيد التنفيذ", "جاهز للفحص"]);
    expect((items[2] as HTMLButtonElement).disabled).toBe(true);                                       // current status
    fireEvent.click(items[1]);
    await waitFor(() => expect(posts()).toEqual([{ projectCode: "794589", action: "progress.update", classId: "c1", studentId: "s1", stageId: "B01", status: "in_progress" }]));
    await screen.findByText("تم تحديث حالة المرحلة.");
    await waitFor(() => expect(within(profile).getByRole("progressbar", { name: "التقدم العام" }).getAttribute("aria-valuenow")).toBe("50"));
    // approve = primary
    fireEvent.click(within(panel).getByRole("button", { name: "اعتماد المرحلة" }));
    await waitFor(() => expect(posts()).toHaveLength(2));
    expect(posts()[1]).toEqual({ projectCode: "794589", action: "progress.update", classId: "c1", studentId: "s1", stageId: "B01", status: "approved" });
    await waitFor(() => expect((within(panel).getByRole("button", { name: "اعتماد المرحلة" }) as HTMLButtonElement).disabled).toBe(true));
    // note save (exact body)
    const note = within(panel).getByLabelText("ملاحظة المعلم") as HTMLTextAreaElement;
    expect(note.value).toBe("راجع القسم 2");
    expect((within(panel).getByRole("button", { name: "حفظ الملاحظة" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(note, { target: { value: "أحسنت" } });
    fireEvent.click(within(panel).getByRole("button", { name: "حفظ الملاحظة" }));
    await waitFor(() => expect(posts()).toHaveLength(3));
    expect(posts()[2]).toEqual({ projectCode: "794589", action: "progress.update", classId: "c1", studentId: "s1", stageId: "B01", note: "أحسنت" });
    await screen.findByText("تم حفظ الملاحظة.");
    // timeline text (dates + labels), max 20 events, no icons-only
    const timeline = profile.querySelector(".eb-timeline") as HTMLElement;
    expect(within(timeline).getAllByRole("listitem").map(li => li.querySelector(".eb-timeline-text")?.textContent)).toEqual(["ملاحظة — B01"]);   // last authoritative history (server returns the slice)
    expect(timeline.querySelector(".eb-timeline-date")?.textContent).toBeTruthy();
    expect(gets("student")).toHaveLength(1);
    expect(gets("students")).toHaveLength(1);
    // back → the list is re-read ONCE (a mutation happened) and focus returns to the opener
    fireEvent.click(within(profile).getByRole("button", { name: "عودة إلى تقدّم الطلاب" }));
    await waitFor(() => expect(gets("students")).toHaveLength(2));
    expect(screen.queryByRole("heading", { level: 2, name: "ملف المشروع: زيد صالح" })).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(opener.isConnected).toBe(true);
    // open again and back WITHOUT changes → no list request
    const again = await openStudent();
    expect(gets("student")).toHaveLength(2);
    fireEvent.click(within(again.profile).getByRole("button", { name: "عودة إلى تقدّم الطلاب" }));
    await waitFor(() => expect(screen.queryByRole("heading", { level: 2, name: "ملف المشروع: زيد صالح" })).toBeNull());
    expect(gets("students")).toHaveLength(2);
    expect(document.activeElement).toBe(again.opener);
    expect(EMOJI.test(document.body.textContent || "")).toBe(false);
  });
  it("archived class → profile is read-only: no approve, no status menu, no note editor; note shown as text", async () => {
    await mountTracker();
    fireEvent.change(within(toolbar()).getByLabelText("الصف"), { target: { value: "c2" } });
    await openStudents();
    const { profile } = await openStudent();
    expect(within(profile).getByText("مؤرشف — للقراءة فقط")).toBeTruthy();
    fireEvent.click(within(profile).getByRole("button", { name: /B01/ }));
    expect(within(profile).queryByRole("button", { name: "اعتماد المرحلة" })).toBeNull();
    expect(within(profile).queryByRole("button", { name: /تغيير حالة/ })).toBeNull();
    expect(within(profile).queryByLabelText("ملاحظة المعلم")).toBeNull();
    expect(within(profile).getByText("ملاحظة المعلم: راجع القسم 2")).toBeTruthy();
    expect(posts()).toHaveLength(0);
  });
});

describe("UX-6a analytics — one read, ChartCards with tabular equivalents, reduced motion, text track selector, heatmap semantics", () => {
  it("issues exactly one analytics read; each chart is a named figure with a table alternative; the track selector is text with aria-pressed and costs no request", async () => {
    await mountTracker();
    fireEvent.click(view("الإحصائيات"));
    await screen.findByRole("heading", { level: 2, name: "الإحصائيات" });
    expect(gets("analytics")).toHaveLength(1);
    const titles = ["تقدّم كل طالب", "مقارنة المسارات", "نسبة إنجاز كل مرحلة", "توزيع الطلاب حسب التقدم", "تطوّر متوسط تقدّم الصف", "توزيع حالات المراحل في الصف"];
    for (const t of titles) {
      const card = screen.getByRole("region", { name: t });
      expect(within(card).getByRole("img", { name: t })).toBeTruthy();
      expect(within(card).getByRole("button", { name: "عرض البيانات كجدول" }).getAttribute("aria-expanded")).toBe("false");
    }
    const n = calls.length;
    const per = screen.getByRole("region", { name: "تقدّم كل طالب" });
    fireEvent.click(within(per).getByRole("button", { name: "عرض البيانات كجدول" }));
    expect(within(within(per).getByRole("table")).getAllByRole("row").map(r => r.textContent)).toEqual(["الطالبالتقدم العام %", "زيد صالح45", "خالد عمر100"]);
    const stages = screen.getByRole("region", { name: "نسبة إنجاز كل مرحلة" });
    const trackSel = within(stages).getByRole("group", { name: "مسار المراحل" });
    expect(within(trackSel).getAllByRole("button").map(b => b.textContent)).toEqual(["الكتاب", "Packet Tracer"]);
    fireEvent.click(within(trackSel).getByRole("button", { name: "Packet Tracer" }));
    expect(within(trackSel).getByRole("button", { name: "Packet Tracer" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(stages).getByRole("button", { name: "عرض البيانات كجدول" }));
    expect(within(within(stages).getByRole("table")).getAllByRole("row").map(r => r.textContent)).toEqual(["المرحلةالعنواننسبة الاعتماد %", "P01أول طوبولوجيا100"]);
    const dist = screen.getByRole("region", { name: "توزيع حالات المراحل في الصف" });
    fireEvent.click(within(dist).getByRole("button", { name: "عرض البيانات كجدول" }));
    expect(within(within(dist).getByRole("table")).getAllByRole("row").map(r => r.textContent)).toEqual(["الحالةعدد المراحل", "لم يبدأ1", "قيد التنفيذ1", "جاهز للفحص1", "تم الاعتماد3"]);
    expect(calls.length).toBe(n);
    expect(document.querySelectorAll("canvas[data-animation='default']").length).toBe(6);
    expect(EMOJI.test(document.body.textContent || "")).toBe(false);
  });
  it("prefers-reduced-motion → every chart is rendered with animation:false", async () => {
    window.matchMedia = ((q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
    await mountTracker();
    fireEvent.click(view("الإحصائيات"));
    await screen.findByRole("heading", { level: 2, name: "الإحصائيات" });
    expect(document.querySelectorAll("canvas[data-animation='false']").length).toBe(6);
    expect(document.querySelectorAll(".eb-chart-card[data-reduced-motion='true']").length).toBe(6);
  });
  it("heatmap: labelled track/group controls, text legend, and every cell carries the student · stage · status text (never colour-only)", async () => {
    await mountTracker();
    fireEvent.click(view("الإحصائيات"));
    await screen.findByRole("heading", { level: 2, name: "الإحصائيات" });
    const heat = screen.getByRole("heading", { level: 3, name: "الخريطة الحرارية للمراحل" }).closest(".eb-heatmap-card") as HTMLElement;
    const legend = within(heat).getByRole("list", { name: "مفتاح الخريطة" });
    expect(within(legend).getAllByRole("listitem").map(l => l.textContent)).toEqual(["—لم يبدأ", "ججقيد التنفيذ".replace("جج", "ج"), "فجاهز للفحص", "متم الاعتماد"]);
    const table = within(heat).getByRole("table");
    expect(within(table).getAllByRole("columnheader").map(h => h.textContent)).toEqual(["الطالب", "B01", "B02"]);
    const zaidRow = within(table).getByRole("row", { name: /زيد صالح/ });
    expect(within(zaidRow).getAllByRole("cell").map(c => c.textContent)).toEqual(["فزيد صالح · B01 مقدمة الشبكات · جاهز للفحص", "جزيد صالح · B02 طبقات OSI · قيد التنفيذ"]);
    const n = calls.length;
    fireEvent.click(within(heat).getByRole("group", { name: "مسار الخريطة الحرارية" }).querySelector('button[aria-pressed="false"]') as HTMLElement);
    expect(within(table).getAllByRole("columnheader").map(h => h.textContent)).toEqual(["الطالب", "P01"]);
    fireEvent.change(within(heat).getByLabelText("المجموعة"), { target: { value: "g2" } });
    expect(calls.length).toBe(n);
  });
  it("analytics with no students → EmptyState", async () => {
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const u = String(input);
      if (u.includes("resource=analytics")) { calls.push({ method: "GET", url: u }); return json({ ok: true, analytics: { ...ANALYTICS, perStudent: [] }, tracks: TRACKS, groups: GROUPS }); }
      return route(u, init);
    }) as unknown as typeof fetch;
    await mountTracker();
    fireEvent.click(view("الإحصائيات"));
    expect(await screen.findByText("لا توجد بيانات كافية للرسوم البيانية.")).toBeTruthy();
  });
});

describe("UX-6a stage settings — labelled controls, exact template.update, reset through ConfirmDialog", () => {
  it("reads the template once; aria-pressed track buttons, labelled group/search, editable rows; save posts the exact template.update body", async () => {
    await mountTracker();
    fireEvent.click(view("إعداد المراحل"));
    await screen.findByRole("heading", { level: 2, name: "إعداد المراحل" });
    expect(gets("template")).toHaveLength(1);
    expect(document.querySelector('[role="tablist"]')).toBeNull();
    const bar = screen.getByRole("region", { name: "أدوات إعداد المراحل" });
    expect(within(within(bar).getByRole("group", { name: "المسار" })).getAllByRole("button").map(b => b.textContent + "=" + b.getAttribute("aria-pressed"))).toEqual(["الكتاب=true", "Packet Tracer=false"]);
    expect(within(bar).getByLabelText("المجموعة")).toBeTruthy();
    expect(within(bar).getByLabelText("بحث")).toBeTruthy();
    const n = calls.length;
    fireEvent.change(within(bar).getByLabelText("بحث"), { target: { value: "OSI" } });
    expect(screen.getByLabelText("عنوان المرحلة B02")).toBeTruthy();
    expect(screen.queryByLabelText("عنوان المرحلة B01")).toBeNull();
    fireEvent.change(within(bar).getByLabelText("بحث"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("عنوان المرحلة B01"), { target: { value: "مقدمة الشبكات المحدثة" } });
    expect(calls.length).toBe(n);
    fireEvent.click(within(bar).getByRole("button", { name: "حفظ التغييرات" }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]).toEqual({ projectCode: "794589", action: "template.update", classId: "c1", template: { stages: [{ ...STAGES[0], title: "مقدمة الشبكات المحدثة" }, STAGES[1], STAGES[2]], trackWeights: TEMPLATE.trackWeights, config: TEMPLATE.config } });
    await screen.findByText("✓ تم حفظ إعداد المراحل.");
    await waitFor(() => expect(gets("template")).toHaveLength(2));                                     // re-read after save (as before)
    // add stage keeps track-specific numbering
    fireEvent.click(within(screen.getByRole("region", { name: "الوحدة الأولى" })).getByRole("button", { name: "إضافة مرحلة" }));
    expect(screen.getByLabelText("عنوان المرحلة B03")).toBeTruthy();
    expect(EMOJI.test(document.body.textContent || "")).toBe(false);
  });
  it("reset: same warning through the danger ConfirmDialog; cancel → zero mutation requests; confirm → exact project.reset body", async () => {
    await mountTracker();
    fireEvent.click(view("إعداد المراحل"));
    await screen.findByRole("heading", { level: 2, name: "إعداد المراحل" });
    fireEvent.click(screen.getByRole("button", { name: "تصفير المشروع…" }));
    let dialog = await screen.findByRole("dialog", { name: "تصفير المشروع للصف" });
    expect(dialog.classList.contains("eb-confirm")).toBe(true);
    expect(within(dialog).getByText("متأكد؟ سيُحذف كل التقدّم نهائيًا.")).toBeTruthy();
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "إلغاء" }));        // danger: focus starts on cancel
    fireEvent.click(within(dialog).getByRole("button", { name: "إلغاء" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(posts()).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "تصفير المشروع…" }));
    dialog = await screen.findByRole("dialog", { name: "تصفير المشروع للصف" });
    fireEvent.click(within(dialog).getByRole("button", { name: "نعم، صفّر المشروع" }));
    await waitFor(() => expect(posts()).toEqual([{ projectCode: "794589", action: "project.reset", classId: "c1" }]));
    await screen.findByText(/تم تصفير المشروع لهذا الصف \(حُذف تقدّم 2 طالبًا\)/);
    await waitFor(() => expect(gets("template")).toHaveLength(2));
  });
  it("archived class → settings read-only: no save, no add, no reset, inputs disabled", async () => {
    await mountTracker();
    fireEvent.change(within(toolbar()).getByLabelText("الصف"), { target: { value: "c2" } });
    fireEvent.click(view("إعداد المراحل"));
    await screen.findByRole("heading", { level: 2, name: "إعداد المراحل" });
    expect(screen.getByText("الصف مؤرشف — الإعداد للقراءة فقط.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "حفظ التغييرات" })).toBeNull();
    expect(screen.queryByRole("button", { name: "إضافة مرحلة" })).toBeNull();
    expect(screen.queryByRole("button", { name: "تصفير المشروع…" })).toBeNull();
    expect((screen.getByLabelText("عنوان المرحلة B01") as HTMLInputElement).disabled).toBe(true);
  });
});

describe("UX-6a source guards", () => {
  const RAW = import.meta.glob("./{ProjectHub,ProjectTracker,ProjectDashboard,ProjectStudentCards,ProjectStudentDetail,ProjectAnalytics,ProjectHeatmap,ProjectStageSettings,StudentProjectPanel}.tsx", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
  const RAW_MISC = import.meta.glob("./{teacherPresentation,helpers}.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
  const RAW_CSS = import.meta.glob(["../projects-pro.css", "../ui/ui.css"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;
  const read = (rel: string) => {
    const key = "./" + rel.replace(/^projects\//, "");
    const src = RAW[key] ?? RAW_MISC[key] ?? RAW_CSS["../" + rel];
    if (typeof src !== "string") throw new Error("source not loaded: " + rel);
    return src;
  };
  it("teacher project components carry no emoji controls/labels, no tablist, no window.confirm, no p794 classes; StudentProjectPanel and its helpers are untouched consumers", () => {
    for (const f of ["projects/ProjectHub.tsx", "projects/ProjectTracker.tsx", "projects/ProjectDashboard.tsx", "projects/ProjectStudentCards.tsx", "projects/ProjectStudentDetail.tsx", "projects/ProjectAnalytics.tsx", "projects/ProjectHeatmap.tsx", "projects/ProjectStageSettings.tsx", "projects/teacherPresentation.ts"]) {
      const src = read(f);
      expect(EMOJI.test(src), f + " contains emoji").toBe(false);
      expect(src, f).not.toMatch(/role="tablist"|window\.confirm|"p794-|analytics-view-tab|STATUS_META\.|trackIcon\(/);
    }
    const student = read("projects/StudentProjectPanel.tsx");
    expect(student).toMatch(/STATUS_META|StageStatusBadge|ProjectProgressBar/);                       // still the legacy consumers
    expect(read("projects/helpers.ts")).toMatch(/icon: "⬜"/);                                          // shared icons untouched
    expect(read("projects-pro.css")).not.toMatch(/outline\s*:\s*(none|0)/);
    expect(read("ui/ui.css")).not.toMatch(/outline\s*:\s*(none|0)/);
  });
});

describe("UX-6a review — global ready-summary invalidation contract (onReadyChanged)", () => {
  async function mountWithSpy() {
    const onReadyChanged = vi.fn();
    render(<ProjectTracker token="t" projectCode="794589" onReadyChanged={onReadyChanged} />);
    await screen.findByRole("heading", { level: 2, name: "لوحة المشروع" });
    return onReadyChanged;
  }
  async function openStagePanel() {
    await openStudents();
    const { profile } = await openStudent();
    const stage = within(profile).getByRole("button", { name: /^B01\b/ });
    fireEvent.click(stage);
    return document.getElementById(stage.getAttribute("aria-controls") || "") as HTMLElement;
  }
  it("a successful STATUS mutation fires it exactly once; a note-only update never does", async () => {
    const spy = await mountWithSpy();
    const panel = await openStagePanel();
    expect(spy).toHaveBeenCalledTimes(0);
    fireEvent.click(within(panel).getByRole("button", { name: "اعتماد المرحلة" }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    await screen.findByText("تم تحديث حالة المرحلة.");
    expect(spy).toHaveBeenCalledTimes(1);
    fireEvent.change(within(panel).getByLabelText("ملاحظة المعلم"), { target: { value: "ملاحظة جديدة" } });
    fireEvent.click(within(panel).getByRole("button", { name: "حفظ الملاحظة" }));
    await waitFor(() => expect(posts()).toHaveLength(2));
    await screen.findByText("تم حفظ الملاحظة.");
    expect(posts()[1]).toEqual({ projectCode: "794589", action: "progress.update", classId: "c1", studentId: "s1", stageId: "B01", note: "ملاحظة جديدة" });
    expect(spy).toHaveBeenCalledTimes(1);                                                             // note-only → no global refresh
  });
  it("a failed or noChange status mutation never fires it", async () => {
    failProgress = true;
    const spy = await mountWithSpy();
    const panel = await openStagePanel();
    fireEvent.click(within(panel).getByRole("button", { name: "اعتماد المرحلة" }));
    await screen.findByText(/تعارض مؤقت/);
    expect(posts()).toHaveLength(1);
    expect(spy).toHaveBeenCalledTimes(0);
    failProgress = false; noChangeProgress = true;
    fireEvent.click(within(panel).getByRole("button", { name: "اعتماد المرحلة" }));
    await waitFor(() => expect(posts()).toHaveLength(2));
    await screen.findByText("تم تحديث حالة المرحلة.");
    expect(spy).toHaveBeenCalledTimes(0);
  });
  it("a successful template.update fires it once; reset cancel never does; a confirmed project.reset fires it once", async () => {
    const spy = await mountWithSpy();
    fireEvent.click(view("إعداد المراحل"));
    const bar = await screen.findByRole("region", { name: "أدوات إعداد المراحل" });
    fireEvent.click(within(bar).getByRole("button", { name: "حفظ التغييرات" }));
    await screen.findByText("✓ تم حفظ إعداد المراحل.");
    expect(spy).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "تصفير المشروع…" }));
    let dialog = await screen.findByRole("dialog", { name: "تصفير المشروع للصف" });
    fireEvent.click(within(dialog).getByRole("button", { name: "إلغاء" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(posts().filter(b => b?.action === "project.reset")).toHaveLength(0);
    expect(spy).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "تصفير المشروع…" }));
    dialog = await screen.findByRole("dialog", { name: "تصفير المشروع للصف" });
    fireEvent.click(within(dialog).getByRole("button", { name: "نعم، صفّر المشروع" }));
    await screen.findByText(/تم تصفير المشروع لهذا الصف/);
    expect(posts().filter(b => b?.action === "project.reset")).toEqual([{ projectCode: "794589", action: "project.reset", classId: "c1" }]);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
