// @vitest-environment happy-dom
// Identity display precedence (ONE component for students and the teacher): photo → preset avatar → default; the
// button form carries an accessible label; the static form is an image with the name. Plus: the student photo
// field's teacher-only flows (upload / replace / remove through /api/student-profile-photo), the picker's note when
// a teacher photo exists, the identity card's single authenticated photo read, and the no-N+1 roster guard.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import { readFileSync } from "fs";
import path from "path";
import ProfileAvatar from "./ProfileAvatar";
import { avatarSource } from "./avatarSource";
import StudentPhotoField from "../students/StudentPhotoField";
import AvatarPickerDialog from "../student/AvatarPickerDialog";
import StudentIdentityCard from "../student/StudentIdentityCard";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("ProfileAvatar precedence", () => {
  it("photo + avatar → photo; avatar only → preset; neither → default letter", () => {
    expect(avatarSource("blob:x", "a1")).toBe("photo"); expect(avatarSource(null, "a1")).toBe("avatar"); expect(avatarSource(null, "nope")).toBe("default"); expect(avatarSource(undefined, undefined)).toBe("default");
    const { container, rerender } = render(<ProfileAvatar photoUrl="blob:photo" avatarId="a1" name="ليان" />);
    expect(container.querySelector("img.eb-profile-avatar-img")?.getAttribute("src")).toBe("blob:photo");
    expect(screen.getByRole("img", { name: "صورة ليان" })).toBeTruthy();
    expect(container.textContent).not.toContain("🦊");
    rerender(<ProfileAvatar photoUrl={null} avatarId="a1" name="ليان" />);
    expect(container.querySelector("img")).toBeNull(); expect(container.textContent).toContain("🦊");
    rerender(<ProfileAvatar photoUrl={null} avatarId="" name="ليان" />);
    expect(container.textContent).toBe("ل");
  });
  it("as a button it is keyboard-accessible with the given label and the current source in the name", () => {
    const onClick = vi.fn();
    render(<ProfileAvatar photoUrl="blob:p" avatarId="a2" name="ليان" onClick={onClick} label="تغيير الأيقونة" />);
    const btn = screen.getByRole("button", { name: "تغيير الأيقونة (صورة شخصية)" });
    fireEvent.click(btn); expect(onClick).toHaveBeenCalled();
  });
});

function mockFetch(routes: (init?: RequestInit) => { status: number; body?: unknown; blob?: Blob } | null) {
  const calls: { url: string; method: string; body?: Record<string, unknown>; headers: Record<string, string> }[] = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method || "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined, headers: (init?.headers || {}) as Record<string, string> });
    const r = routes(init) || { status: 404, body: { ok: false } };
    return { ok: r.status < 400, status: r.status, json: async () => r.body ?? {}, blob: async () => r.blob ?? new Blob(["x"], { type: "image/webp" }) } as Response;
  }) as unknown as typeof fetch;
  return calls;
}

describe("StudentPhotoField (teacher entry point)", () => {
  it("upload: reads the file as a data URL, POSTs {action:upload, studentId, dataUrl} with the builder headers, reports success and hands back the metadata; remove POSTs {action:remove}", async () => {
    (globalThis as { URL: typeof URL }).URL.createObjectURL = (globalThis as { URL: typeof URL }).URL.createObjectURL || (() => "blob:mock");
    (globalThis as { URL: typeof URL }).URL.revokeObjectURL = (globalThis as { URL: typeof URL }).URL.revokeObjectURL || (() => {});
    const calls = mockFetch(init => {
      if (init?.method === "POST") { const b = JSON.parse(String(init.body)); return { status: 200, body: b.action === "upload" ? { ok: true, profilePhoto: { version: 1, updatedAt: "now" } } : { ok: true, profilePhoto: null } }; }
      return { status: 200, blob: new Blob(["img"], { type: "image/webp" }) };
    });
    const onChange = vi.fn();
    const { rerender } = render(<StudentPhotoField token="tt" studentId="s1" studentName="ليان" avatarId="a1" profilePhoto={null} onChange={onChange} />);
    expect(screen.getByRole("button", { name: "اختيار صورة من الحاسوب" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /إزالة الصورة/ })).toBeNull();
    expect(calls.length).toBe(0);                                                              // no photo → no read
    const input = screen.getByLabelText("ملف صورة الطالب") as HTMLInputElement;
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "me.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });
    await screen.findByText("تم حفظ صورة الطالب.");
    const upload = calls.find(c => c.method === "POST")!;
    expect(upload.url).toBe("/api/student-profile-photo");
    expect(upload.headers["x-builder-token"]).toBe("tt");
    expect(upload.body).toMatchObject({ action: "upload", studentId: "s1" });
    expect(String(upload.body!.dataUrl)).toMatch(/^data:image\/png;base64,/);
    expect(onChange).toHaveBeenCalledWith({ version: 1, updatedAt: "now" });
    // with a photo: replace + remove controls; the current photo is read ONCE with the version
    rerender(<StudentPhotoField token="tt" studentId="s1" studentName="ليان" avatarId="a1" profilePhoto={{ version: 1, updatedAt: "now" }} onChange={onChange} />);
    await waitFor(() => expect(calls.filter(c => c.method === "GET").length).toBe(1));
    expect(calls.find(c => c.method === "GET")!.url).toBe("/api/student-profile-photo?studentId=s1&v=1");
    fireEvent.click(screen.getByRole("button", { name: /إزالة الصورة/ }));
    await screen.findByText(/تمت إزالة الصورة/);
    expect(calls.filter(c => c.method === "POST").at(-1)!.body).toEqual({ action: "remove", studentId: "s1" });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
  it("rejects a non-raster or oversize file locally with the Arabic message and never POSTs", async () => {
    const calls = mockFetch(() => ({ status: 200 }));
    render(<StudentPhotoField token="tt" studentId="s1" studentName="ليان" profilePhoto={null} onChange={vi.fn()} />);
    const input = screen.getByLabelText("ملف صورة الطالب") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["<svg/>"], "x.svg", { type: "image/svg+xml" })] } });
    expect((await screen.findByRole("alert")).textContent).toContain("نوع الملف غير مدعوم");
    expect(calls.filter(c => c.method === "POST").length).toBe(0);
  });
});

describe("student side — preset avatars only, teacher photo shown first", () => {
  it("the picker explains the teacher-managed photo and offers presets only (no file/camera/upload/URL controls)", () => {
    render(<AvatarPickerDialog open current="a1" saving={false} photoManaged onPick={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText("الصورة الشخصية يحددها المعلم. يمكنك اختيار الأيقونة التي ستظهر إذا أزيلت الصورة الشخصية.")).toBeTruthy();
    expect(document.querySelector("input[type=file], input[type=url], input[capture]")).toBeNull();
    expect(screen.getAllByRole("button", { pressed: true }).length).toBe(1);
  });
  it("the identity card reads the OWN photo once (only when the server reports a version) and shows it over the preset; without a version no request", async () => {
    (globalThis as { URL: typeof URL }).URL.createObjectURL = () => "blob:own";
    (globalThis as { URL: typeof URL }).URL.revokeObjectURL = () => {};
    const calls = mockFetch(() => ({ status: 200, blob: new Blob(["img"], { type: "image/webp" }) }));
    const base = { userId: "u1", code: "C1", displayName: "ليان", classId: "c1", avatarId: "a1" };
    const { rerender } = render(<StudentIdentityCard student={{ ...base, profilePhoto: null }} classroom={null} displayName="ليان" rank={null} token="stok" onChangeAvatar={vi.fn()} />);
    expect(calls.length).toBe(0);
    expect(document.querySelector(".eb-profile-avatar.is-avatar")).toBeTruthy();
    rerender(<StudentIdentityCard student={{ ...base, profilePhoto: { version: 3, updatedAt: "" } }} classroom={null} displayName="ليان" rank={null} token="stok" onChangeAvatar={vi.fn()} />);
    await waitFor(() => expect(document.querySelector(".eb-profile-avatar.is-photo")).toBeTruthy());
    expect(calls.map(c => c.url)).toEqual(["/api/student-profile-photo?v=3"]);
    expect(calls[0].headers["x-student-token"]).toBe("stok");
  });
  it("no N+1: the roster never resolves photos per row; only the edit dialog and the student's own identity read them", () => {
    const read = (rel: string) => readFileSync(path.join(process.cwd(), "src", rel), "utf8");
    expect(read("students/RosterPane.tsx")).not.toMatch(/useProfilePhoto|student-profile-photo/);
    expect(read("students/StudentDialog.tsx")).not.toMatch(/useProfilePhoto|student-profile-photo/);
    expect(read("students/StudentPhotoField.tsx")).toContain("useProfilePhoto(");
    expect(read("student/StudentIdentityCard.tsx")).toContain("useProfilePhoto(");
    expect(read("StudentPortal.tsx")).not.toContain("student-profile-photo");
  });
});
