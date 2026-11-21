// @vitest-environment happy-dom
//
// Class gradebook GB9 — a part that needs no exam («الحضور والمشاركة»): the builder says, in the empty part, that a mark the teacher
// enters is an option; the box «علامة يرصدها المعلم» sits beside the platform's assignments, with suggested titles; the part is built
// and saved with no assignment at all; and the table names the column's kind in the same words. Through the REAL panel and builder with a
// routed fetch mock. TEST data only.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import ClassGradebookPanel from "./ClassGradebookPanel";
import { TeacherAccessContext } from "../shell/teacherAccessContext";
import type { GbGradebook } from "./types";

// A class with NO assignment at all: the part must still be possible.
const SOURCES = { ok: true, classId: "c1", assignments: [], projects: [], withheld: [] };
const book: GbGradebook = { ok: true, classId: "c1", className: "العاشر", readOnly: false, students: [], etags: { scheme: null, entries: null }, withheld: [], scheme: null, columns: [], rows: [], warnings: [] };
let posts: Record<string, unknown>[] = [];
const json = (body: unknown, status = 200) => ({ ok: status < 400, status, headers: new Headers(), json: async () => body } as unknown as Response);
beforeEach(() => {
  posts = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = (init?.method || "GET").toUpperCase();
    if (method === "POST") { posts.push(JSON.parse(String(init!.body))); return json({ ok: true, etag: "e1", revision: 1, status: "active", sumIssues: [] }); }
    if (url.includes("resource=sources")) return json(SOURCES);
    return json(book);
  }) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("GB9 — a part without an exam: «علامة يرصدها المعلم»", () => {
  it("the empty part says so; a suggested title fills the field; the part is saved with no assignment", async () => {
    render(<TeacherAccessContext.Provider value={null}><ClassGradebookPanel token="t" classroom={{ classId: "c1", name: "العاشر" }} classActive /></TeacherAccessContext.Provider>);
    fireEvent.click(await screen.findByRole("button", { name: "إنشاء مخطط العلامات" }));
    const dialog = await screen.findByRole("dialog", { name: /مخطط العلامات/ });
    fireEvent.click(within(dialog).getByRole("button", { name: "إضافة قسم" }));
    expect(within(dialog).getByText(/أو علامة يرصدها المعلم بنفسه مثل الحضور والمشاركة/)).toBeTruthy();
    // both ways are offered, each in its own labelled box
    expect(within(dialog).getByRole("group", { name: "من المنصة: واجب أو امتحان أو مشروع" })).toBeTruthy();
    const box = within(dialog).getByRole("group", { name: "علامة يرصدها المعلم (بلا واجب على المنصة)" });
    fireEvent.change(within(dialog).getByLabelText("عنوان القسم"), { target: { value: "الحضور والمشاركة" } });
    fireEvent.change(within(dialog).getByLabelText("النسبة من العلامة النهائية (%)"), { target: { value: "100" } });
    fireEvent.click(within(within(box).getByRole("group", { name: "عناوين مقترحة" })).getByRole("button", { name: "الحضور والمشاركة" }));
    expect((within(box).getByLabelText("العنوان") as HTMLInputElement).value).toBe("الحضور والمشاركة");
    fireEvent.change(within(box).getByLabelText("العلامة القصوى"), { target: { value: "١٠" } });
    fireEvent.click(within(box).getByRole("button", { name: "إضافة علامة يرصدها المعلم" }));
    expect(within(dialog).getByRole("rowheader", { name: "الحضور والمشاركة (من 10)" })).toBeTruthy();
    expect(within(dialog).getByRole("cell", { name: "يرصدها المعلم" })).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText("وزن الحضور والمشاركة (من 10)"), { target: { value: "100" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "حفظ المخطط" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({ action: "scheme.save", scheme: { categories: [{ title: "الحضور والمشاركة", weight: 100, items: [{ weight: 100, source: { kind: "manual", title: "الحضور والمشاركة", maxScore: 10 } }] }] } });
  });
});
