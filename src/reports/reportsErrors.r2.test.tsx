// @vitest-environment happy-dom
//
// Phase R-2 — Reports Center error handling (docs/reports-center-audit.md: P1-4, P2-9, P2-10, P3-15). Drives the REAL
// ReportsCenter → ReportViews tree over a routed fetch mock and pins: a non-JSON / network / 5xx failure is a calm Arabic message
// (never «Unexpected token»); a 401 ends the teacher session (onSessionExpired, like the rest of the teacher workspace) with the
// shared session-expired text; a superseded report request is aborted; the student list and the filter options show their own
// loading / error / retry inside the workspace; an inverted custom range is refused locally (no request) with linked min / max;
// changing the class of the track report issues ONE request, never one carrying the previous project's track.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";

vi.mock("react-chartjs-2", () => ({ Bar: () => <canvas data-chart="bar" />, Line: () => <canvas data-chart="line" />, Doughnut: () => <canvas data-chart="doughnut" /> }));

import ReportsCenter from "./ReportsCenter";

const TRACKS = [{ trackId: "book", title: "الكتاب" }, { trackId: "packetTracer", title: "Packet Tracer" }];
const FILTERS = { ok: true, schoolYears: ["2025-2026"], classes: [
  { classId: "c1", name: "الحادي عشر", schoolYear: "2025-2026", status: "active", programCodes: ["794589"] },
  { classId: "c3", name: "الثاني عشر", schoolYear: "2025-2026", status: "active", programCodes: ["794589"] }
], projects: [{ projectCode: "794589", title: "مشروع 794589" }] };
const CLASS = (name: string) => ({ ok: true, type: "class", class: { classId: "c1", name, schoolYear: "2025-2026", status: "active", studentCount: 3 }, kpis: { assignments: 1, averageScore: 40, submissionRate: 100 }, projects: [] });
const TRACK = (track: string) => ({ ok: true, type: "track", projectCode: "794589", tracks: TRACKS, track, groups: [], class: { name: "الحادي عشر" }, rows: [{ stageId: "B01", title: "مقدمة", groupId: "g1", approved: 1, ready_for_review: 0, in_progress: 0, not_started: 1, approvedPct: 50 }] });

type Call = { url: string; signal?: AbortSignal | null };
let calls: Call[] = [];
type Reply = Response | Promise<Response> | "network";
let override: ((url: URL) => Reply | undefined) | null = null;
const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body } as Response);
const html = (status: number) => ({ ok: false, status, json: async () => { throw new SyntaxError("Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON"); } } as unknown as Response);
function respond(u: URL): Response {
  const type = u.searchParams.get("type");
  if (type === "filters") return json(FILTERS);
  if (type === "classStudents") return json({ ok: true, students: [{ studentId: "s1", displayName: "زيد" }] });
  if (type === "class") return json(CLASS(u.searchParams.get("classId") === "c3" ? "الثاني عشر" : "الحادي عشر"));
  if (type === "track") return json(TRACK(u.searchParams.get("track") || "book"));
  return json({ ok: false, error: "نوع تقرير غير معروف." }, 400);
}
beforeEach(() => {
  calls = []; override = null;
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), u = new URL(url, "http://x");
    calls.push({ url, signal: init?.signal });
    const r = override?.(u);
    if (r === "network") return Promise.reject(new TypeError("Failed to fetch"));
    return Promise.resolve(r ?? respond(u));
  }) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const gets = (type: string) => calls.filter(c => new URL(c.url, "http://x").searchParams.get("type") === type);
async function openReport(title: string, onSessionExpired?: () => void) {
  render(<ReportsCenter token="t" onSessionExpired={onSessionExpired} />);
  fireEvent.click(await screen.findByRole("button", { name: "فتح التقرير " + title }));
  await screen.findByRole("heading", { level: 2, name: title });
}
const filters = () => screen.getByRole("region", { name: "مرشحات التقرير" });
const pick = (label: string, value: string) => fireEvent.change(within(filters()).getByLabelText(label), { target: { value } });
const alertText = () => screen.getAllByRole("alert").map(a => a.textContent).join(" | ");

describe("R-2 — failures are calm Arabic messages, never raw parser text", () => {
  it("a non-JSON 502 from the platform reads «تعذر الاتصال بالخادم…» with a retry that works", async () => {
    let fail = true;
    override = u => (u.searchParams.get("type") === "class" && fail ? html(502) : undefined);
    await openReport("تقرير الصف");
    pick("الصف", "c1");
    await waitFor(() => expect(alertText()).toContain("تعذر الاتصال بالخادم"));
    expect(alertText()).not.toMatch(/Unexpected token|JSON|HTTP/);
    fail = false;
    fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "إعادة المحاولة" }));
    expect(await screen.findByRole("heading", { level: 3, name: /الحادي عشر/ })).toBeTruthy();
  });
  it("a network failure reads as a connection problem", async () => {
    override = u => (u.searchParams.get("type") === "class" ? "network" : undefined);
    await openReport("تقرير الصف");
    pick("الصف", "c1");
    await waitFor(() => expect(alertText()).toContain("تحقّق من الاتصال"));
    expect(alertText()).not.toContain("Failed to fetch");
  });
  it("a server JSON error keeps the server's own Arabic message", async () => {
    override = u => (u.searchParams.get("type") === "class" ? json({ ok: false, error: "الصف غير موجود." }, 404) : undefined);
    await openReport("تقرير الصف");
    pick("الصف", "c1");
    await waitFor(() => expect(alertText()).toContain("الصف غير موجود."));
  });
});

describe("R-2 — a 401 ends the teacher session", () => {
  it("a report 401 calls onSessionExpired once and shows the session-expired text", async () => {
    const expired = vi.fn();
    override = u => (u.searchParams.get("type") === "class" ? json({ ok: false, error: "Unauthorized" }, 401) : undefined);
    await openReport("تقرير الصف", expired);
    pick("الصف", "c1");
    await waitFor(() => expect(alertText()).toContain("انتهت صلاحية الجلسة"));
    expect(expired).toHaveBeenCalledTimes(1);
  });
  it("a 401 on the filter options does the same", async () => {
    const expired = vi.fn();
    override = u => (u.searchParams.get("type") === "filters" ? json({ ok: false, error: "Unauthorized" }, 401) : undefined);
    render(<ReportsCenter token="t" onSessionExpired={expired} />);
    await waitFor(() => expect(alertText()).toContain("انتهت صلاحية الجلسة"));
    expect(expired).toHaveBeenCalledTimes(1);
  });
});

describe("R-2 — superseded requests are aborted", () => {
  it("changing the class aborts the in-flight report request for the previous class", async () => {
    override = u => (u.searchParams.get("type") === "class" && u.searchParams.get("classId") === "c1" ? new Promise<Response>(() => {}) : undefined);
    await openReport("تقرير الصف");
    pick("الصف", "c1");
    await waitFor(() => expect(gets("class")).toHaveLength(1));
    pick("الصف", "c3");
    await screen.findByRole("heading", { level: 3, name: /الثاني عشر/ });
    expect(gets("class")[0].signal?.aborted).toBe(true);
    expect(gets("class")[1].signal?.aborted).toBe(false);
  });
});

describe("R-2 — the filter bar shows its own loading / error / retry", () => {
  it("a failed student list says so (not an empty dropdown) and retries", async () => {
    let fail = true;
    override = u => (u.searchParams.get("type") === "classStudents" && fail ? html(500) : undefined);
    await openReport("تقرير الطالب");
    pick("الصف", "c1");
    await waitFor(() => expect(within(filters()).getByRole("alert").textContent).toContain("تعذر تحميل قائمة الطلاب"));
    fail = false;
    fireEvent.click(within(filters()).getByRole("button", { name: "إعادة المحاولة" }));
    await waitFor(() => expect(gets("classStudents")).toHaveLength(2));
    const select = within(filters()).getByLabelText("الطالب") as HTMLSelectElement;
    await waitFor(() => expect(Array.from(select.options).map(o => o.textContent)).toContain("زيد"));
    expect(within(filters()).queryByRole("alert")).toBeNull();
  });
  it("while the student list loads, the select says so", async () => {
    override = u => (u.searchParams.get("type") === "classStudents" ? new Promise<Response>(() => {}) : undefined);
    await openReport("تقرير الطالب");
    pick("الصف", "c1");
    const select = within(filters()).getByLabelText("الطالب") as HTMLSelectElement;
    await waitFor(() => expect(select.options[0].textContent).toBe("جارٍ تحميل الطلاب..."));
    expect(select.disabled).toBe(true);
  });
  it("a failed filter-options load is visible inside an opened report, with a retry", async () => {
    let fail = true;
    override = u => (u.searchParams.get("type") === "filters" && fail ? html(503) : undefined);
    await openReport("تقرير الصف");
    await waitFor(() => expect(within(filters()).getByRole("alert").textContent).toContain("تعذر الاتصال بالخادم"));
    fail = false;
    fireEvent.click(within(filters()).getByRole("button", { name: "إعادة المحاولة" }));
    await waitFor(() => expect(Array.from((within(filters()).getByLabelText("الصف") as HTMLSelectElement).options).map(o => o.value)).toContain("c1"));
  });
});

describe("R-2 — custom range validation", () => {
  it("an inverted range is refused locally: an inline alert, no request with that range; linked min / max", async () => {
    await openReport("تقرير الصف");
    pick("الصف", "c1");
    await waitFor(() => expect(gets("class")).toHaveLength(1));
    pick("الفترة الزمنية", "custom");
    pick("من", "2026-03-10");
    await waitFor(() => expect(gets("class")).toHaveLength(2));
    expect((within(filters()).getByLabelText("إلى") as HTMLInputElement).min).toBe("2026-03-10");
    pick("إلى", "2026-03-01");
    await waitFor(() => expect(within(filters()).getByRole("alert").textContent).toContain("لا يمكن أن يكون تاريخ «من» بعد تاريخ «إلى»"));
    await new Promise(r => setTimeout(r, 600));
    expect(gets("class")).toHaveLength(2);
    expect(calls.some(c => c.url.includes("to=2026-03-01"))).toBe(false);
    pick("إلى", "2026-03-20");
    await waitFor(() => expect(gets("class")).toHaveLength(3));
    expect(gets("class")[2].url).toBe("/api/reports?type=class&classId=c1&from=2026-03-10&to=2026-03-20");
    expect(within(filters()).queryByRole("alert")).toBeNull();
    expect((within(filters()).getByLabelText("من") as HTMLInputElement).max).toBe("2026-03-20");
  });
});

describe("R-2 — the track report issues one request per filter change", () => {
  it("after choosing a track, changing the class sends ONE request and never the previous track", async () => {
    await openReport("تقرير المسار");
    pick("المشروع", "794589");
    pick("الصف", "c1");
    await waitFor(() => expect(gets("track")).toHaveLength(1));
    fireEvent.click(await screen.findByRole("button", { name: "Packet Tracer" }));
    await waitFor(() => expect(gets("track")).toHaveLength(2));
    expect(gets("track")[1].url).toContain("track=packetTracer");
    pick("الصف", "c3");
    await waitFor(() => expect(gets("track")).toHaveLength(3));
    await new Promise(r => setTimeout(r, 50));
    expect(gets("track")).toHaveLength(3);
    expect(gets("track")[2].url).toBe("/api/reports?type=track&projectCode=794589&classId=c3");
  });
});
