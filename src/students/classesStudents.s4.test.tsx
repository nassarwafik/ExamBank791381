// @vitest-environment happy-dom
// Phase S.4 — Classes & Students: one term and accessible details, through the REAL TeacherPlatform with a routed fetch.
//   - one term for assignments: «الواجبات» in the roster (column, phone label, history button) and in the student sheet;
//     «الوظائف» is gone from this workspace;
//   - an archived class is RESTORED («استعادة الصف»), the word the student actions already use; «تمت أرشفة الصف» agrees;
//   - the roster table is named after its class; each row's details button names its student; an empty assignments cell reads
//     «لا واجبات مسلّمة» instead of a bare «—»;
//   - a row or bulk action that removes the control focus returns to puts focus on the roster heading, never on <body>; an
//     action that keeps that control leaves focus where it is.
// The same behaviour is measured in a real Chromium by scripts/check-classes-students-browser-u1.mjs (its S.4 section).
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import TeacherPlatform from "../TeacherPlatform";

type Student = { userId: string; code: string; identityNumber: string; firstName: string; familyName: string; displayName: string; classId: string; active: boolean; archived: boolean; createdAt: string; updatedAt: string; lastLoginAt: string; submittedAssignmentsCount: number; likesCount: number };
const CLASSES = [
  { classId: "c1", name: "الحادي عشر 3", grade: "11", schoolYear: "2026-2027", active: true, status: "active", studentCount: 3, createdAt: "2026-01-02" },
  { classId: "c9", name: "دفعة 2025", grade: "12", schoolYear: "2025-2026", active: false, status: "archived", archivedAt: "2026-06-30T00:00:00.000Z", studentCount: 0, createdAt: "2025-01-01" }
];
const stu = (userId: string, firstName: string, familyName: string, identity: string, over: Partial<Student> = {}): Student => ({
  userId, code: identity, identityNumber: identity, firstName, familyName, displayName: firstName + " " + familyName, classId: "c1",
  active: true, archived: false, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", lastLoginAt: "", submittedAssignmentsCount: 0, likesCount: 0, ...over
});
let roster: Student[] = [];
const PROFILE = (s: Student) => ({ ok: true, profile: {
  student: s, classroom: { classId: "c1", name: "الحادي عشر 3" }, stats: { assigned: 1, completed: 1, pending: 0, average: 90, lastLoginAt: "" },
  assignments: [{ assignmentId: "a1", title: "اختبار الكسور", status: "published", dueAt: "", totalMarks: 20, attemptsUsed: 1, latestScore: 18, latestPercentage: 90, submittedAt: "2026-02-20T00:00:00.000Z", gradingStatus: "final", finalized: true }],
  submittedAssignmentsCount: 1,
  submittedAssignments: [{ assignmentId: "a1", title: "اختبار الكسور", submittedAt: "2026-02-20T00:00:00.000Z", latestAttemptNumber: 1, attemptsUsed: 1, allowedAttempts: 1, score: 18, totalMarks: 20, percentage: 90, gradingStatus: "final", finalized: true, isCurrentClassAssignment: true, dueAt: "", dueAtOverride: null, effectiveDueAt: "" }]
} });
type Body = Record<string, unknown>;
let posts: Body[] = [];
const json = (data: unknown) => ({ ok: true, status: 200, json: async () => data } as Response);
async function routedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input); const method = (init?.method || "GET").toUpperCase();
  const body: Body = init?.body ? JSON.parse(String(init.body)) : {};
  if (method === "POST") posts.push(body);
  if (url.includes("/api/project-tracker")) return json({ ok: true, projects: [] });
  if (url.includes("/api/classrooms") && method === "GET") return json({ ok: true, classes: CLASSES });
  if (url.includes("/api/classrooms")) return json({ ok: true });
  if (url.includes("/api/students?profileUserId=")) return json(PROFILE(roster.find(s => url.includes(s.userId)) || roster[0]));
  if (url.includes("/api/students") && method === "GET") return json({ ok: true, students: new URL(url, "http://x").searchParams.get("classId") === "c1" ? roster : [] });
  if (body.action === "delete") { roster = roster.filter(s => s.userId !== body.userId); return json({ ok: true, deleted: true, rosterSynced: true }); }
  if (body.action === "toggleActive") { roster = roster.map(s => s.userId === body.userId ? { ...s, active: body.active === true } : s); return json({ ok: true, active: body.active }); }
  if (body.action === "bulkAction") { roster = roster.map(s => (body.userIds as string[]).includes(s.userId) ? { ...s, archived: true, active: false } : s); return json({ ok: true, processed: (body.userIds as string[]).length, failed: 0, credentials: [], errors: [], rosterSynced: true }); }
  return json({ ok: true });
}
beforeEach(() => {
  posts = [];
  roster = [stu("s1", "علي", "حسن", "111111111", { submittedAssignmentsCount: 2 }), stu("s2", "بسمة", "أحمد", "222222222"), stu("s3", "خالد", "زيد", "333333333")];
  globalThis.fetch = vi.fn(routedFetch) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function mount() {
  render(<TeacherPlatform token="t" currentExam={null} workspaceTab="students" />);
  await screen.findByText("علي");
}
const rowOf = (first: string) => screen.getByText(first, { selector: "td.eb-col-name strong" }).closest("tr") as HTMLElement;
async function confirmEl() { return waitFor(() => { const el = document.querySelector('.eb-confirm[role="dialog"]') as HTMLElement | null; if (!el) throw new Error("no confirm"); return el; }); }
async function confirmYes() { fireEvent.click((await confirmEl()).querySelector(".eb-dialog-foot .is-primary, .eb-dialog-foot .is-danger") as HTMLElement); }
const heading = () => document.getElementById("eb-roster-title");

describe("S.4 — one term for assignments", () => {
  it("the roster says «الواجبات» (column, phone label, history button) and never «الوظائف»", async () => {
    await mount();
    expect(screen.getByRole("columnheader", { name: "الواجبات" })).toBeTruthy();
    expect(rowOf("علي").querySelector("td.eb-col-tasks")?.getAttribute("data-label")).toBe("الواجبات");
    expect(within(rowOf("علي")).getByRole("button", { name: "الواجبات (2) — علي حسن" })).toBeTruthy();
    expect(document.querySelector(".eb-students-workspace")?.textContent).not.toContain("الوظائف");
  });
  it("the student sheet says «الواجبات» everywhere (section, history table, review action)", async () => {
    await mount();
    fireEvent.click(within(rowOf("علي")).getByRole("button", { name: /^الواجبات \(2\)/ }));
    const d = await screen.findByRole("dialog", { name: "علي حسن" });
    expect(within(d).getByRole("heading", { level: 3, name: "الواجبات وسجل التسليم" })).toBeTruthy();
    expect(within(d).getByRole("region", { name: "جدول سجل الواجبات المسلّمة" })).toBeTruthy();
    expect(within(d).getByRole("button", { name: "فحص الواجب" })).toBeTruthy();
    expect(d.textContent).not.toContain("الوظائف");
    expect(d.textContent).not.toContain("الوظيفة");
  });
  it("an archived class is restored with «استعادة الصف» (confirm and notice agree); archiving says «تمت أرشفة الصف»", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: /^الأرشيف/ }));
    fireEvent.click(await screen.findByRole("button", { name: "إجراءات الصف دفعة 2025" }));
    const menu = await waitFor(() => { const m = document.querySelector(".eb-menu-panel") as HTMLElement | null; if (!m) throw new Error("no menu"); return m; });
    expect(within(menu).queryByRole("button", { name: "تفعيل" })).toBeNull();
    fireEvent.click(within(menu).getByRole("button", { name: "استعادة الصف" }));
    const c = await confirmEl();
    expect(c.textContent).toContain("استعادة الصف دفعة 2025 من الأرشيف؟");
    expect(within(c).getByRole("button", { name: "استعادة" })).toBeTruthy();
    await confirmYes();
    await screen.findByText("✓ تمت استعادة الصف.");
    expect(posts).toContainEqual({ action: "unarchive", classId: "c9" });
  });
});

describe("S.4 — accessible names", () => {
  it("the roster table is named after its class; each details button names its student; an empty cell is read, not «—»", async () => {
    await mount();
    expect(screen.getByRole("table", { name: "طلاب الحادي عشر 3" })).toBeTruthy();
    for (const [first, name] of [["علي", "تفاصيل علي حسن"], ["بسمة", "تفاصيل بسمة أحمد"]]) expect(within(rowOf(first)).getByRole("button", { name })).toBeTruthy();
    const empty = rowOf("بسمة").querySelector("td.eb-col-tasks") as HTMLElement;
    expect(empty.textContent).toBe("—لا واجبات مسلّمة");
    expect(empty.querySelector('[aria-hidden="true"]')?.textContent).toBe("—");
  });
});

describe("S.4 — focus never falls to <body>", () => {
  it("a single delete (its row and menu are removed): focus moves to the roster heading", async () => {
    await mount();
    const trigger = within(rowOf("بسمة")).getByRole("button", { name: "إجراءات بسمة أحمد" });
    trigger.focus();
    fireEvent.click(trigger);
    const menu = await waitFor(() => { const m = document.querySelector(".eb-menu-panel") as HTMLElement | null; if (!m) throw new Error("no menu"); return m; });
    fireEvent.click(within(menu).getByRole("button", { name: "حذف نهائي" }));
    await confirmYes();
    await waitFor(() => expect(screen.queryByText("بسمة", { selector: "td.eb-col-name strong" })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(heading()));
    expect(heading()?.getAttribute("tabindex")).toBe("-1");
  });
  it("a bulk action (the bulk bar goes away with the selection): focus moves to the roster heading", async () => {
    await mount();
    fireEvent.click(screen.getByLabelText("تحديد علي حسن"));
    fireEvent.click(screen.getByLabelText("تحديد بسمة أحمد"));
    const archive = within(await screen.findByRole("region", { name: "إجراءات جماعية" })).getByRole("button", { name: "أرشفة" });
    archive.focus();
    fireEvent.click(archive);
    await confirmYes();
    await waitFor(() => expect(screen.queryByRole("region", { name: "إجراءات جماعية" })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(heading()));
  });
  it("an action that keeps its control leaves focus where it is (never pulled to the heading)", async () => {
    await mount();
    const trigger = within(rowOf("خالد")).getByRole("button", { name: "إجراءات خالد زيد" });
    trigger.focus();
    fireEvent.click(trigger);
    const menu = await waitFor(() => { const m = document.querySelector(".eb-menu-panel") as HTMLElement | null; if (!m) throw new Error("no menu"); return m; });
    fireEvent.click(within(menu).getByRole("button", { name: "تعطيل الحساب" }));
    await screen.findByText("✓ تم تعطيل حساب الطالب.");
    await new Promise(r => setTimeout(r, 20));
    expect(document.activeElement).toBe(within(rowOf("خالد")).getByRole("button", { name: "إجراءات خالد زيد" }));
    expect(document.activeElement).not.toBe(heading());
  });
});
