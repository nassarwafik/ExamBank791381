// @vitest-environment happy-dom
// Teacher identity in the shell: the sidebar shows the name from the authority (profile → session → «المعلم» —
// never a hard-coded personal name), the photo / preset / initial precedence, an accessible profile button
// («تعديل صورة وملف المعلم») opening the self-profile dialog whose actions POST the exact self-service bodies
// (no teacher id) and update the sidebar; the compact rail keeps the avatar only.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { readFileSync } from "fs";
import path from "path";
import TeacherAppShell from "../shell/TeacherAppShell";
import { resolveTeacherDisplayName, normalizeTeacherProfile, type TeacherProfile } from "./teacherProfile";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const nav = { teacherView: "platform" as const, workspaceTab: "dashboard" as const, projectCode: "", projectList: [] };
const profile = (over: Partial<TeacherProfile> = {}): TeacherProfile => ({ teacherId: "builder-1", displayName: "أ. سامر", hasCustomName: true, avatarId: "a4", profilePhoto: null, updatedAt: "", ...over });

function mockFetch() {
  const calls: { url: string; method: string; body?: Record<string, unknown>; headers: Record<string, string> }[] = [];
  let current = profile();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method: init?.method || "GET", body, headers: (init?.headers || {}) as Record<string, string> });
    if (url.startsWith("/api/teacher-profile-photo")) return { ok: true, status: 200, json: async () => ({}), blob: async () => new Blob(["img"], { type: "image/webp" }) } as Response;
    if (body?.action === "setAvatar") current = { ...current, avatarId: String(body.avatarId) };
    if (body?.action === "uploadPhoto") current = { ...current, profilePhoto: { version: (current.profilePhoto?.version || 0) + 1, updatedAt: "now" } };
    if (body?.action === "removePhoto") current = { ...current, profilePhoto: null };
    if (body?.action === "setDisplayName") current = { ...current, displayName: String(body.displayName), hasCustomName: true };
    return { ok: true, status: 200, json: async () => ({ ok: true, profile: current }) } as Response;
  }) as unknown as typeof fetch;
  return calls;
}
function Shell({ p, onChange, sessionName = "" }: { p: TeacherProfile | null; onChange?: (x: TeacherProfile) => void; sessionName?: string }) {
  return <TeacherAppShell nav={nav} projectReadyTotal={0} displayName={resolveTeacherDisplayName(p, sessionName)} identity={{ token: "tok", profile: p, onProfileChange: onChange || (() => {}) }} onNavigate={() => {}} onLogout={() => {}}><div>x</div></TeacherAppShell>;
}
const sidebar = () => screen.getByRole("complementary", { name: "التنقل الرئيسي" });

describe("display-name authority", () => {
  it("profile name wins; else the session name; else «المعلم» — and the sources contain no hard-coded personal name", () => {
    expect(resolveTeacherDisplayName(profile(), "x")).toBe("أ. سامر");
    expect(resolveTeacherDisplayName(null, "المعلم الأول")).toBe("المعلم الأول");
    expect(resolveTeacherDisplayName(null, "")).toBe("المعلم");
    expect(normalizeTeacherProfile({ teacherId: "b", displayName: "", avatarId: "a1", profilePhoto: { version: "2" } })).toMatchObject({ displayName: "المعلم", profilePhoto: { version: 2 } });
    const read = (rel: string) => readFileSync(path.join(process.cwd(), "src", rel), "utf8");
    for (const f of ["shell/TeacherAppShell.tsx", "teacher/TeacherIdentity.tsx", "teacher/TeacherProfileDialog.tsx", "App.tsx"]) expect(read(f), f).not.toMatch(/سامر|nassar|wafik/i);
  });
});

describe("sidebar identity block", () => {
  it("shows the name and the preset icon, keeps the brand (ExamBank / 791381), exposes the accessible profile button; no profile → default initial, no button", () => {
    mockFetch();
    const { rerender } = render(<Shell p={profile()} />);
    const side = sidebar();
    expect(within(side).getByText("أ. سامر")).toBeTruthy();
    expect(within(side).getByText("ExamBank")).toBeTruthy(); expect(within(side).getByText("791381")).toBeTruthy();
    const btn = within(side).getByRole("button", { name: /تعديل صورة وملف المعلم/ });
    expect(btn.textContent).toContain("🦁");
    rerender(<Shell p={null} sessionName="" />);
    expect(within(sidebar()).getAllByText("المعلم").length).toBeGreaterThan(0);
    expect(within(sidebar()).queryByRole("button", { name: /تعديل صورة وملف المعلم/ })).toBeNull();
    expect(sidebar().querySelector(".eb-teacher-identity .is-default")).toBeTruthy();
  });
  it("with a photo version the sidebar reads the own photo ONCE (builder headers) and shows it before the preset", async () => {
    (globalThis as { URL: typeof URL }).URL.createObjectURL = () => "blob:teacher";
    (globalThis as { URL: typeof URL }).URL.revokeObjectURL = () => {};
    const calls = mockFetch();
    render(<Shell p={profile({ profilePhoto: { version: 2, updatedAt: "" } })} />);
    await waitFor(() => expect(sidebar().querySelector(".eb-teacher-identity .is-photo")).toBeTruthy());
    expect(calls.map(c => c.url)).toEqual(["/api/teacher-profile-photo?v=2"]);
    expect(calls[0].headers["x-builder-token"]).toBe("tok");
  });
  it("opening the dialog: preset choice POSTs {action:setAvatar, avatarId} (no teacher id) and the sidebar updates; name save; upload/replace/remove", async () => {
    (globalThis as { URL: typeof URL }).URL.createObjectURL = () => "blob:teacher";
    (globalThis as { URL: typeof URL }).URL.revokeObjectURL = () => {};
    const calls = mockFetch();
    function Host() {
      const [p, setP] = (require("react") as typeof import("react")).useState<TeacherProfile | null>(profile());
      return <Shell p={p} onChange={setP} />;
    }
    render(<Host />);
    fireEvent.click(within(sidebar()).getByRole("button", { name: /تعديل صورة وملف المعلم/ }));
    const dialog = await screen.findByRole("dialog", { name: "ملف المعلم" });
    fireEvent.click(within(dialog).getByRole("button", { name: "قطة" }));
    await within(dialog).findByText("تم حفظ الأيقونة.");
    expect(calls.filter(c => c.method === "POST").at(-1)!.body).toEqual({ action: "setAvatar", avatarId: "a2" });
    expect(within(sidebar()).getByRole("button", { name: /تعديل صورة وملف المعلم/ }).textContent).toContain("🐱");
    fireEvent.change(within(dialog).getByLabelText("اسم المعلم"), { target: { value: "أ. هدى" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "حفظ الاسم" }));
    await within(dialog).findByText("تم حفظ الاسم.");
    expect(within(sidebar()).getByText("أ. هدى")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "رفع صورة شخصية" })).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText("ملف الصورة الشخصية للمعلم"), { target: { files: [new File([new Uint8Array([1, 2, 3])], "me.jpg", { type: "image/jpeg" })] } });
    await within(dialog).findByText("تم حفظ صورتك الشخصية.");
    const up = calls.filter(c => c.body?.action === "uploadPhoto").at(-1)!;
    expect(String(up.body!.dataUrl)).toMatch(/^data:image\/jpeg;base64,/); expect(up.body).not.toHaveProperty("teacherId");
    await waitFor(() => expect(sidebar().querySelector(".eb-teacher-identity .is-photo")).toBeTruthy());
    fireEvent.click(within(dialog).getByRole("button", { name: /إزالة الصورة/ }));
    await within(dialog).findByText(/تمت إزالة الصورة/);
    expect(calls.filter(c => c.method === "POST").at(-1)!.body).toEqual({ action: "removePhoto" });
    await waitFor(() => expect(sidebar().querySelector(".eb-teacher-identity .is-avatar")).toBeTruthy());   // preset fallback returns
    for (const c of calls.filter(c => c.method === "POST")) { expect(c.url).toBe("/api/teacher-profile"); expect(c.headers["x-builder-token"]).toBe("tok"); }
    fireEvent.click(within(dialog).getAllByRole("button", { name: "إغلاق" }).at(-1) as HTMLElement);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "ملف المعلم" })).toBeNull());
  });
});
