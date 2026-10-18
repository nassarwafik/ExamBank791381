// @vitest-environment happy-dom
//
// Phase S.0 — the Classes & Students page shows ONLY figures it actually has for the selected class:
//   • switching class never leaves the previous class's rows (or counts, or row actions) under the new class's name;
//   • a roster or classes read that FAILS is an error with «إعادة المحاولة», never «no students / no classes yet»;
//   • the classes read and the roster read have separate loading states (one finishing never ends the other's skeleton);
//   • while a roster is not loaded the counts read «—», never 0;
//   • the header counts the class's current members (archived students are counted apart), like the class card.
import { describe, it, expect, afterEach, beforeAll, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import TeacherPlatform from "./TeacherPlatform";
import type { RosterPaneProps } from "./students/RosterPane";

// Every render of the roster pane, with the class it is titled for — a state that lasts ONE commit (another class's rows or
// error under this class's name) is caught here even when the next commit replaces it before any assertion can look.
const renders: Array<{ classId: string; loadError: string; studentClassIds: string[] }> = [];
vi.mock("./students/RosterPane", async importOriginal => {
  const actual = await importOriginal<typeof import("./students/RosterPane")>();
  const Real = actual.default;
  return { ...actual, default: (p: RosterPaneProps) => { renders.push({ classId: p.classroom?.classId || "", loadError: p.loadError || "", studentClassIds: p.students.map(s => s.classId) }); return Real(p); } };
});
const rendersFor = (classId: string) => renders.filter(r => r.classId === classId);

type Student = { userId: string; code: string; identityNumber: string; firstName: string; familyName: string; displayName: string; classId: string; active: boolean; archived: boolean; createdAt: string; updatedAt: string; lastLoginAt: string; submittedAssignmentsCount: number; likesCount: number };
const CLASSES = [
  { classId: "c1", name: "الحادي عشر 3", grade: "11", schoolYear: "2026-2027", programCodes: [] as string[], active: true, status: "active", studentCount: 2, createdAt: "2026-01-03" },
  { classId: "c2", name: "الثاني عشر 8", grade: "12", schoolYear: "2026-2027", programCodes: [] as string[], active: true, status: "active", studentCount: 1, createdAt: "2026-01-02" }
];
const stu = (userId: string, firstName: string, classId: string, over: Partial<Student> = {}): Student => ({
  userId, code: userId, identityNumber: "11111111" + userId.length, firstName, familyName: "حسن", displayName: firstName + " حسن", classId,
  active: true, archived: false, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", lastLoginAt: "2026-02-01T00:00:00.000Z", submittedAssignmentsCount: 0, likesCount: 0, ...over
});
const ROSTERS: Record<string, Student[]> = {
  c1: [stu("s1", "علي", "c1"), stu("s2", "بسمة", "c1"), stu("s3", "قديم", "c1", { archived: true, active: false })],
  c2: [stu("t1", "نور", "c2")]
};

const json = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => data }) as Response;
type Route = (url: string) => Promise<Response> | Response | undefined;
let route: Route | null = null;
async function routedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input); const method = (init?.method || "GET").toUpperCase();
  if (route) { const r = route(url); if (r) return r; }
  if (url.includes("/api/project-tracker")) return json({ ok: true, projects: [] });
  if (url.includes("/api/learning-materials-catalog")) return json({ ok: true, courses: [] });
  if (url.includes("/api/classrooms") && method === "GET") return json({ ok: true, classes: CLASSES });
  if (url.includes("/api/students") && method === "GET") return json({ ok: true, students: ROSTERS[new URL(url, "http://x").searchParams.get("classId") || ""] || [] });
  return json({ ok: true });
}
const deferred = () => { let resolve!: (r: Response) => void; const promise = new Promise<Response>(r => { resolve = r; }); return { promise, resolve }; };
const rosterOf = (classId: string) => (url: string) => url.includes("/api/students?classId=" + classId);
// Warm the workspace once (first render of the page, its modules and styles) so the first test's budget measures the test,
// not the file's cold start; the hook keeps the default hook timeout.
beforeAll(async () => {
  globalThis.fetch = vi.fn(routedFetch) as unknown as typeof fetch;
  render(<TeacherPlatform token="t" currentExam={null} workspaceTab="students" />);
  await screen.findByText("علي", {}, { timeout: 8000 });
  cleanup();
});
beforeEach(() => { route = null; renders.length = 0; globalThis.fetch = vi.fn(routedFetch) as unknown as typeof fetch; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const mount = () => render(<TeacherPlatform token="t" currentExam={null} workspaceTab="students" />);
// The FIRST mount runs two sequential reads (classes, then the roster) plus the workspace's first render; on a loaded runner
// that exceeds the 1 s default of findBy / waitFor, so only the initial mount waits use this bound (every later wait is default).
const MOUNT = { timeout: 5000 };
const mounted = (text: string) => screen.findByText(text, {}, MOUNT);
const paneReady = () => waitFor(() => { if (!rosterPane()) throw new Error("no pane"); return rosterPane(); }, MOUNT);
const classList = () => document.querySelector(".class-list") as HTMLElement;
const selectClass = (name: string) => fireEvent.click(within(classList()).getByText(name));
const rosterPane = () => document.querySelector(".eb-roster-pane") as HTMLElement;
const rosterTitle = () => document.getElementById("eb-roster-title")?.textContent || "";
const statValues = () => [...rosterPane().querySelectorAll(".eb-roster-stat-value")].map(n => n.textContent);
const headerCount = () => rosterPane().querySelector(".student-count-badge")?.textContent;
const skeleton = () => rosterPane().querySelector(".eb-roster-skeleton");

describe("S.0 — switching class never shows the previous class's roster", () => {
  it("while the new class's roster loads: its name, a skeleton, «—» counts, none of the old rows and no export", async () => {
    mount();
    await mounted("علي");
    const pending = deferred();
    route = url => (rosterOf("c2")(url) ? pending.promise : undefined);
    selectClass("الثاني عشر 8");
    await waitFor(() => expect(rosterTitle()).toBe("الثاني عشر 8"));
    expect(within(rosterPane()).queryByText("علي")).toBeNull();                       // class 1's rows are gone
    expect(within(rosterPane()).queryByText("بسمة")).toBeNull();
    expect(skeleton()).not.toBeNull();
    expect(statValues()).toEqual(["—", "—", "—", "—", "—"]);
    expect(headerCount()).toBe("—");
    fireEvent.click(within(rosterPane()).getByRole("button", { name: "المزيد من إجراءات الصف" }));
    expect((await screen.findByRole("button", { name: /تصدير CSV/ }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { pending.resolve(json({ ok: true, students: ROSTERS.c2 })); });
    expect(await within(rosterPane()).findByText("نور")).toBeTruthy();
    expect(statValues()[0]).toBe("1");
    expect(rendersFor("c2").filter(r => r.studentClassIds.some(id => id !== "c2"))).toEqual([]);   // not even for one commit
  });

  it("a failed roster read of the new class is an error with «إعادة المحاولة» — never the old rows, never «no students yet»", async () => {
    mount();
    await mounted("علي");
    let fail = true;
    route = url => (rosterOf("c2")(url) && fail ? json({ ok: false, error: "الخادم غير متاح حاليًا." }, 503) : undefined);
    selectClass("الثاني عشر 8");
    const alert = await within(rosterPane()).findByRole("alert");
    expect(alert.textContent).toContain("تعذر تحميل طلاب هذا الصف");
    expect(alert.textContent).toContain("الخادم غير متاح حاليًا.");
    expect(within(rosterPane()).queryByText("علي")).toBeNull();
    expect(within(rosterPane()).queryByText("لا يوجد طلاب في هذا الصف بعد.")).toBeNull();
    expect(statValues()).toEqual(["—", "—", "—", "—", "—"]);
    fail = false;
    fireEvent.click(within(alert).getByRole("button", { name: "إعادة المحاولة" }));
    expect(await within(rosterPane()).findByText("نور")).toBeTruthy();
    expect(within(rosterPane()).queryByRole("alert")).toBeNull();
  });
});

describe("S.0 — load failures are errors, not empty states", () => {
  it("a failed FIRST roster read: an error with retry, «—» counts and no «إضافة طالب» empty-state call to action", async () => {
    let fail = true;
    route = url => (rosterOf("c1")(url) && fail ? json({ ok: false, error: "تعذر الاتصال بالخادم." }, 503) : undefined);
    mount();
    const alert = await within(await paneReady()).findByRole("alert", {}, MOUNT);
    expect(alert.textContent).toContain("تعذر تحميل طلاب هذا الصف");
    expect(screen.queryByText("لا يوجد طلاب في هذا الصف بعد.")).toBeNull();
    expect(statValues()).toEqual(["—", "—", "—", "—", "—"]);
    expect(headerCount()).toBe("—");
    fail = false;
    fireEvent.click(within(alert).getByRole("button", { name: "إعادة المحاولة" }));
    expect(await screen.findByText("علي")).toBeTruthy();
  });

  it("a failed classes read: an error with retry in the classes pane — never «لا توجد صفوف نشطة بعد. أنشئ أول صف»", async () => {
    let fail = true;
    route = url => (url.includes("/api/classrooms") && fail ? json({ ok: false, error: "الخادم غير متاح حاليًا." }, 503) : undefined);
    mount();
    const pane = await waitFor(() => { const el = document.querySelector(".eb-classes-pane") as HTMLElement | null; if (!el) throw new Error("no pane"); return el; }, MOUNT);
    const alert = await within(pane).findByRole("alert", {}, MOUNT);
    expect(alert.textContent).toContain("تعذر تحميل الصفوف");
    expect(within(pane).queryByText("لا توجد صفوف نشطة بعد.")).toBeNull();
    fail = false;
    fireEvent.click(within(alert).getByRole("button", { name: "إعادة المحاولة" }));
    expect(await mounted("علي")).toBeTruthy();                                   // classes then roster again: a mount
    expect(within(pane).queryByRole("alert")).toBeNull();
  });
});

describe("S.0 — the roster's loading state is its own", () => {
  it("a superseded roster read finishing never ends the skeleton of the class still loading (no false «no students»)", async () => {
    const first = deferred(), second = deferred();
    route = url => (rosterOf("c1")(url) ? first.promise : rosterOf("c2")(url) ? second.promise : undefined);
    mount();
    await waitFor(() => expect(rosterTitle()).toBe("الحادي عشر 3"), MOUNT);
    selectClass("الثاني عشر 8");
    await waitFor(() => expect(rosterTitle()).toBe("الثاني عشر 8"));
    await act(async () => { first.resolve(json({ ok: true, students: ROSTERS.c1 })); });   // class 1's (stale) answer lands
    expect(skeleton()).not.toBeNull();
    expect(screen.queryByText("لا يوجد طلاب في هذا الصف بعد.")).toBeNull();
    expect(within(rosterPane()).queryByText("علي")).toBeNull();
    await act(async () => { second.resolve(json({ ok: true, students: ROSTERS.c2 })); });
    expect(await within(rosterPane()).findByText("نور")).toBeTruthy();
  });
});

describe("S.0 — the header counts the class's current members", () => {
  it("archived students are counted apart, so the header agrees with the class card", async () => {
    mount();
    await mounted("علي");
    expect(headerCount()).toBe("2");                                                    // the card says 2 (archived excluded)
    expect(rosterPane().querySelector(".eb-roster-pane .eb-section-head, header")?.textContent || rosterPane().textContent).toContain("1 مؤرشف");
    expect(statValues()).toEqual(["3", "2", "0", "1", "0"]);                            // the tiles still cover everyone
  });
});

describe("S.0 — an error belongs to its class", () => {
  it("leaving a class whose roster failed never shows «no students yet» for the next class while it loads", async () => {
    const pending = deferred();
    route = url => (rosterOf("c1")(url) ? json({ ok: false, error: "تعذر الاتصال بالخادم." }, 503) : rosterOf("c2")(url) ? pending.promise : undefined);
    mount();
    await within(await paneReady()).findByRole("alert", {}, MOUNT);
    // Record every node inserted while switching: an error (or an empty state) shown for even ONE commit is a flash.
    const flashed: string[] = [];
    const observer = new MutationObserver(records => { for (const r of records) for (const n of r.addedNodes) if (n instanceof HTMLElement) flashed.push(n.outerHTML); });
    observer.observe(document.body, { childList: true, subtree: true });
    selectClass("الثاني عشر 8");
    await waitFor(() => expect(rosterTitle()).toBe("الثاني عشر 8"));
    expect(within(rosterPane()).queryByRole("alert")).toBeNull();                     // class 1's error is not class 2's
    expect(screen.queryByText("لا يوجد طلاب في هذا الصف بعد.")).toBeNull();
    expect(skeleton()).not.toBeNull();
    observer.disconnect();
    expect(flashed.filter(html => html.includes('role="alert"') || html.includes("لا يوجد طلاب في هذا الصف بعد."))).toEqual([]);
    expect(rendersFor("c2").filter(r => r.loadError)).toEqual([]);                    // class 1's error never rendered for class 2
    await act(async () => { pending.resolve(json({ ok: true, students: ROSTERS.c2 })); });
    expect(await within(rosterPane()).findByText("نور")).toBeTruthy();
  });
});
