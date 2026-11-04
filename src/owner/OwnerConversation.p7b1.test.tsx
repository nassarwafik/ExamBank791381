// @vitest-environment happy-dom
// Tadris+ P7-B1 — owner decision D14 on a class roster of the teacher's page, against a mocked API (test data only): «الاطلاع على
// المحادثة» says it is read only and recorded (owner audit + the teacher's activity log), needs a reason before anything is sent,
// shows the thread read only (no reply / edit / delete control), every older page is a new recorded opening with the same reason,
// and the opening is retried unchanged after the second-factor check.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import OwnerApp from "./OwnerApp";
import { OWNER_TOKEN_KEY } from "./ownerApi";
import { ownerTeacherHash } from "./ownerRoute";

type Call = { url: string; method: string; body: Record<string, unknown> | undefined };
let calls: Call[] = [];
let routes: Record<string, (c: Call) => { status: number; body: unknown }> = {};
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;
const SARA = "t_00112233445566aa", OMAR = "t_00112233445566bb";
const S = "11111111-1111-1111-1111-111111111111";
const VIEW = { ok: true, owner: { accountId: "own_0123456789abcdef", username: "tadris.owner", displayName: "مالك المنصة" }, session: { expiresAt: "2026-11-03T12:00:00.000Z", stepUpValidUntil: null }, recoveryCodesRemaining: 10 };
const teacher = (accountId: string, displayName: string, username: string) => ({ accountId, username, displayName, fullName: "", email: "", phone: "", subjects: [], notes: "", organizationId: "default", status: "active", hasPassword: true, invitation: null, createdAt: "2026-10-01T10:00:00.000Z", updatedAt: "2026-10-02T10:00:00.000Z", lastLoginAt: "", origin: "console", access: null, suspendedAt: "", suspendedReason: "" });
const cls = (classId: string, name: string, status = "active") => ({ classId, name, grade: "11", schoolYear: "2026-2027", status, studentCount: 1, programCodes: [], createdAt: "2026-11-01T10:00:00.000Z", archivedAt: "" });
const PREVIEW = (pending = 0) => ({ userId: S, displayName: "ليان سعيد", archived: false, fromClassId: "cA", fromClassName: "صف سارة", from: SARA, toClassId: "cB", toClassName: "صف عمر", to: OMAR, pendingGrading: pending });

beforeEach(() => {
  calls = [];
  routes = {
    "GET /api/owner-session": () => ({ status: 200, body: VIEW }),
    "GET /api/owner-teachers": () => ({ status: 200, body: { ok: true, teachers: [teacher(SARA, "سارة", "t.sara"), teacher(OMAR, "عمر", "t.omar")] } }),
    "GET /api/owner-access": () => ({ status: 200, body: { ok: true, mode: "enforce", presets: [], capabilities: [] } }),
    ["GET /api/owner-access/history?accountId=" + SARA]: () => ({ status: 200, body: { ok: true, accountId: SARA, currentRevisionId: null, truncated: false, limit: 50, entries: [] } }),
    ["GET /api/owner-access/effective?accountId=" + SARA]: () => ({ status: 200, body: { ok: true, accountId: SARA, accountStatus: "active", mode: "enforce", enforced: true, access: { status: "ok", source: "revision", revisionId: null, preset: null, capabilities: [] } } }),
    ["GET /api/owner-classes?accountId=" + SARA]: () => ({ status: 200, body: { ok: true, accountId: SARA, classes: [cls("cA", "صف سارة")] } }),
    ["GET /api/owner-classes?accountId=" + OMAR]: () => ({ status: 200, body: { ok: true, accountId: OMAR, classes: [cls("cB", "صف عمر"), cls("cOld", "صف قديم", "archived")] } }),
    "GET /api/owner-classes/students?classId=cA": () => ({ status: 200, body: { ok: true, classId: "cA", students: [{ userId: S, displayName: "ليان سعيد", identityNumber: "300000001", active: true, archived: false }] } }),
    ["GET /api/owner-classes/student-transfer-preview?userId=" + S + "&toClassId=cB"]: () => ({ status: 200, body: { ok: true, preview: PREVIEW() } })
  };
  sessionStorage.clear();
  sessionStorage.setItem(OWNER_TOKEN_KEY, "owner-tok");
  window.location.hash = ownerTeacherHash(SARA);
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const c: Call = { url, method: String(init.method || "GET"), body: init.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(c);
    const h = routes[c.method + " " + url];
    if (!h) return json(404, { ok: false, code: "NOT_FOUND", error: "غير موجود." });
    const r = h(c);
    return json(r.status, r.body);
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const posted = (path: string) => calls.filter(c => c.method === "POST" && c.url === path);

const M = (n: number, role: "teacher" | "student", extra: Record<string, unknown> = {}) => ({ messageId: "000000000000" + n + "-00112233445566aa", kind: "direct", senderRole: role, senderDisplayName: role === "teacher" ? "سارة" : "ليان سعيد", body: "رسالة " + n, createdAt: "2026-11-04T08:0" + n + ":00.000Z", ...extra });

async function openConversation() {
  render(<OwnerApp />);
  await screen.findByRole("heading", { name: "سارة" });
  fireEvent.click(screen.getByRole("tab", { name: "الصفوف" }));
  const item = await screen.findByRole("listitem", { name: "صف سارة" });
  fireEvent.click(within(item).getByRole("button", { name: "الطلاب" }));
  const row = await screen.findByRole("listitem", { name: "ليان سعيد" });
  fireEvent.click(within(row).getByRole("button", { name: "الاطلاع على المحادثة" }));
  return within(screen.getByRole("region", { name: "محادثة ليان سعيد" }));
}

describe("P7-B1 — D14 «الاطلاع على المحادثة»", () => {
  it("read only and recorded; no reason → nothing sent; opened: the thread, without any reply / edit / delete control", async () => {
    routes["POST /api/owner-conversations/open"] = () => ({ status: 200, body: { ok: true, student: { userId: S, displayName: "ليان سعيد" }, messages: [M(2, "teacher"), M(3, "student", { deleted: true, body: "" })], hasMore: false } });
    const panel = await openConversation();
    expect(panel.getByRole("note").textContent).toMatch(/قراءة فقط.*سجل التدقيق.*سجل نشاطه/);
    const openBtn = panel.getByRole("button", { name: "فتح المحادثة (قراءة فقط)" }) as HTMLButtonElement;
    expect(openBtn.disabled).toBe(true);
    fireEvent.change(panel.getByRole("textbox"), { target: { value: "قصير" } });
    expect(openBtn.disabled).toBe(true);
    fireEvent.change(panel.getByRole("textbox"), { target: { value: "شكوى ولي أمر بتاريخ اليوم" } });
    fireEvent.click(openBtn);
    const list = await panel.findByRole("list", { name: "رسائل ليان سعيد" });
    expect(list.textContent).toContain("رسالة 2");
    expect(list.textContent).toContain("حُذفت هذه الرسالة.");
    expect(posted("/api/owner-conversations/open").map(c => c.body)).toEqual([{ studentId: S, reason: "شكوى ولي أمر بتاريخ اليوم" }]);
    expect(panel.queryByRole("button", { name: /رد|إرسال|حذف|تعديل/ })).toBeNull();
    expect(panel.queryByRole("button", { name: /الأقدم/ })).toBeNull();
  });

  it("an older page is a new recorded opening with the same reason; the second-factor check is retried unchanged", async () => {
    let n = 0;
    routes["POST /api/owner-conversations/open"] = c => {
      n++;
      if (n === 1) return { status: 403, body: { ok: false, code: "STEP_UP_REQUIRED", error: "تحقق" } };
      return c.body?.before ? { status: 200, body: { ok: true, student: { userId: S, displayName: "ليان سعيد" }, messages: [M(1, "teacher")], hasMore: false } }
        : { status: 200, body: { ok: true, student: { userId: S, displayName: "ليان سعيد" }, messages: [M(2, "teacher"), M(3, "student")], hasMore: true } };
    };
    routes["POST /api/owner-session/step-up"] = () => ({ status: 200, body: VIEW });
    const panel = await openConversation();
    fireEvent.change(panel.getByRole("textbox"), { target: { value: "مراجعة سلوك بطلب المدرسة" } });
    fireEvent.click(panel.getByRole("button", { name: "فتح المحادثة (قراءة فقط)" }));
    const form = await screen.findByRole("form", { name: "التحقق بخطوتين" });
    fireEvent.change(within(form).getByRole("textbox"), { target: { value: "123456" } });
    fireEvent.click(within(form).getByRole("button", { name: "تأكيد" }));
    await panel.findByRole("list", { name: "رسائل ليان سعيد" });
    fireEvent.click(panel.getByRole("button", { name: "عرض الرسائل الأقدم (اطلاع جديد يُسجَّل)" }));
    await within(screen.getByRole("region", { name: "محادثة ليان سعيد" })).findByText("رسالة 1");
    const bodies = posted("/api/owner-conversations/open").map(c => c.body);
    expect(bodies).toEqual([
      { studentId: S, reason: "مراجعة سلوك بطلب المدرسة" }, { studentId: S, reason: "مراجعة سلوك بطلب المدرسة" },
      { studentId: S, reason: "مراجعة سلوك بطلب المدرسة", before: M(2, "teacher").messageId }
    ]);
    expect(screen.getByRole("list", { name: "رسائل ليان سعيد" }).textContent).toMatch(/رسالة 1[\s\S]*رسالة 2/);
  });
});
