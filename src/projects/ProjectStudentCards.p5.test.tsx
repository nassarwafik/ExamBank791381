// @vitest-environment happy-dom
// Phase P-5 — the project's student list. Through the REAL ProjectStudentCards over a routed fetch (one `students` read):
//   - «لم يبدأ» is not «بلا تحديث»: a never-started student (the server marks it stale: an empty updatedAt reads as infinitely
//     old) is badged «لم يبدأ» and listed only by «لم يبدأوا»; «بلا تحديث» lists started, unfinished students only;
//   - a teacher-chosen order (name — numeric —, progress either way, most «جاهز للفحص» first, oldest update first) that also
//     drives the profile's «السابق / التالي» (onVisibleChange);
//   - a table view of the same filtered, ordered list: one row per student with the same values, the state, and the same
//     «فتح ملف الطالب» action; a focusable, named scroll region.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import ProjectStudentCards from "./ProjectStudentCards";
import { isNotStarted, isStalled, cardState, sortStudentCards } from "./studentCardsView";
import type { StudentCard, TrackMeta } from "./types";

const TRACKS: TrackMeta[] = [{ trackId: "book", title: "الكتاب" }, { trackId: "pt", title: "باكيت تريسر" }] as TrackMeta[];
const counts = (in_progress: number, ready_for_review: number, approved: number) => ({ not_started: 10 - in_progress - ready_for_review - approved, in_progress, ready_for_review, approved });
const card = (studentId: string, displayName: string, over: Partial<StudentCard>): StudentCard => ({
  studentId, displayName, code: "C" + studentId, overallProgress: 0, trackProgress: { book: 0, pt: 0 }, counts: counts(0, 0, 0),
  readyForReviewCount: 0, complete: false, updatedAt: "", stale: false, ...over
});
// What the server sends today: a never-started student is stale:true with an empty updatedAt.
const NEVER = card("n1", "طالب10", { stale: true });
const STALLED = card("s1", "طالب2", { overallProgress: 30, trackProgress: { book: 40, pt: 20 }, counts: counts(2, 0, 1), stale: true, updatedAt: "2026-09-01T10:00:00.000Z" });
const READY = card("r1", "أمل", { overallProgress: 60, trackProgress: { book: 70, pt: 50 }, counts: counts(1, 3, 4), readyForReviewCount: 3, updatedAt: "2026-10-18T10:00:00.000Z" });
const DONE = card("d1", "بشير", { overallProgress: 100, trackProgress: { book: 100, pt: 100 }, counts: counts(0, 0, 10), complete: true, updatedAt: "2026-10-10T10:00:00.000Z" });
const CARDS = [NEVER, STALLED, READY, DONE];

let reads = 0;
beforeEach(() => {
  reads = 0;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("resource=students")) { reads++; return { ok: true, status: 200, json: async () => ({ students: CARDS, config: { lateThreshold: 40 } }) } as Response; }
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function mount(onVisibleChange = vi.fn(), onOpenStudent = vi.fn()) {
  render(<ProjectStudentCards token="t" projectCode="899373" classId="c1" tracks={TRACKS} onOpenStudent={onOpenStudent} onVisibleChange={onVisibleChange} />);
  return { onVisibleChange, onOpenStudent };
}
const names = () => Array.from(document.querySelectorAll(".eb-student-card .eb-student-card-name strong")).map(x => x.textContent);
const cardOf = (name: string) => screen.getByText(name, { selector: ".eb-student-card-name strong" }).closest(".eb-student-card") as HTMLElement;
const filter = (label: string) => fireEvent.click(within(screen.getByRole("group", { name: "تصفية الطلاب" })).getByRole("button", { name: label }));

describe("P-5 — «لم يبدأ» is not «بلا تحديث»", () => {
  it("the view model: never-started vs stalled vs complete (pure)", () => {
    expect([NEVER, STALLED, READY, DONE].map(isNotStarted)).toEqual([true, false, false, false]);
    expect([NEVER, STALLED, READY, DONE].map(isStalled)).toEqual([false, true, false, false]);
    expect([NEVER, STALLED, READY, DONE].map(c => cardState(c)?.label ?? null)).toEqual(["لم يبدأ", "بلا تحديث", null, "مكتمل"]);
  });
  it("a never-started student is badged «لم يبدأ» (not «بلا تحديث») and is not styled as stale", async () => {
    mount();
    await screen.findByText("طالب10");
    expect(cardOf("طالب10").textContent).toContain("لم يبدأ");
    expect(cardOf("طالب10").textContent).not.toContain("بلا تحديث");
    expect(cardOf("طالب10").className).not.toContain("is-stale");
    expect(cardOf("طالب2").textContent).toContain("بلا تحديث");
    expect(cardOf("طالب2").className).toContain("is-stale");
  });
  it("«لم يبدأوا» lists only the never-started student; «بلا تحديث» lists only the started, stalled one", async () => {
    mount();
    await screen.findByText("طالب10");
    filter("لم يبدأوا");
    expect(names()).toEqual(["طالب10"]);
    filter("بلا تحديث");
    expect(names()).toEqual(["طالب2"]);
    expect(reads).toBe(1);                                                            // filters never read again
  });
});

describe("P-5 — a started student at 0 % is not «لم يبدأ»", () => {
  it("a first stage waiting for review, or only an optional stage approved, leaves overall progress at 0 but the student HAS started", async () => {
    const WAITING = card("w1", "وليد", { counts: counts(0, 1, 0), readyForReviewCount: 1, updatedAt: "2026-10-18T10:00:00.000Z" });
    const OPTIONAL = card("o1", "عمر", { counts: counts(0, 0, 1), updatedAt: "2026-10-17T10:00:00.000Z" });
    expect([WAITING, OPTIONAL].map(isNotStarted)).toEqual([false, false]);
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ students: [NEVER, WAITING, OPTIONAL], config: { lateThreshold: 40 } }) }) as Response) as unknown as typeof fetch;
    mount();
    await screen.findByText("وليد");
    filter("لم يبدأوا");
    expect(names()).toEqual(["طالب10"]);
    expect(cardOf("طالب10").textContent).toContain("لم يبدأ");
  });
});

describe("P-5 — order", () => {
  it("by name by default, numerically («طالب2» before «طالب10»); the other orders; equal keys fall back to the name", async () => {
    const { onVisibleChange } = mount();
    await screen.findByText("طالب10");
    expect(names()).toEqual(["أمل", "بشير", "طالب2", "طالب10"]);
    const choose = (label: string) => fireEvent.change(screen.getByLabelText("الترتيب"), { target: { value: ({ "التقدم: الأقل أولًا": "progressAsc", "التقدم: الأعلى أولًا": "progressDesc", "جاهز للفحص: الأكثر أولًا": "readyFirst", "آخر تحديث: الأقدم أولًا": "updatedOldest" } as Record<string, string>)[label] } });
    choose("التقدم: الأقل أولًا"); expect(names()).toEqual(["طالب10", "طالب2", "أمل", "بشير"]);
    choose("التقدم: الأعلى أولًا"); expect(names()).toEqual(["بشير", "أمل", "طالب2", "طالب10"]);
    choose("جاهز للفحص: الأكثر أولًا"); expect(names()).toEqual(["أمل", "بشير", "طالب2", "طالب10"]);
    choose("آخر تحديث: الأقدم أولًا"); expect(names()).toEqual(["طالب10", "طالب2", "بشير", "أمل"]);
    // the profile's «السابق / التالي» follows the order shown
    await waitFor(() => expect(onVisibleChange.mock.calls.at(-1)?.[0].map((s: { displayName: string }) => s.displayName)).toEqual(["طالب10", "طالب2", "بشير", "أمل"]));
    expect(reads).toBe(1);
  });
  it("sortStudentCards never mutates its input", () => {
    const input = [...CARDS];
    sortStudentCards(input, "progressDesc");
    expect(input).toEqual(CARDS);
  });
});

describe("P-5 — table view", () => {
  it("the same filtered, ordered list as rows: values, state, and the same open-profile action", async () => {
    const { onOpenStudent } = mount();
    await screen.findByText("طالب10");
    const views = screen.getByRole("group", { name: "طريقة العرض" });
    expect(within(views).getByRole("button", { name: "بطاقات" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(views).getByRole("button", { name: "جدول" }));
    expect(within(views).getByRole("button", { name: "جدول" }).getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector(".eb-student-cards")).toBeNull();
    const region = screen.getByRole("region", { name: "جدول تقدّم الطلاب" });
    expect(region.getAttribute("tabindex")).toBe("0");
    const headers = within(region).getAllByRole("columnheader").map(h => h.textContent);
    expect(headers).toEqual(["الطالب", "التقدم العام", "الكتاب", "باكيت تريسر", "جاهز للفحص", "قيد التنفيذ", "تم الاعتماد", "الحالة", "آخر تحديث", "الإجراء"]);
    const rows = within(region).getAllByRole("row").slice(1);
    expect(rows.map(r => within(r).getByRole("rowheader").querySelector("strong")?.textContent)).toEqual(["أمل", "بشير", "طالب2", "طالب10"]);
    const cells = (r: HTMLElement) => within(r).getAllByRole("cell").map(c => c.textContent);
    expect(cells(rows[0]).slice(0, 7)).toEqual(["60%", "70%", "50%", "3", "1", "4", "قيد التنفيذ"]);
    expect(cells(rows[2])[6]).toBe("بلا تحديث");
    expect(cells(rows[3])[6]).toBe("لم يبدأ");
    expect(cells(rows[1])[6]).toBe("مكتمل");
    filter("بلا تحديث");
    expect(within(screen.getByRole("region", { name: "جدول تقدّم الطلاب" })).getAllByRole("row")).toHaveLength(2);
    const open = within(screen.getByRole("region", { name: "جدول تقدّم الطلاب" })).getByRole("button", { name: "فتح ملف الطالب" });
    fireEvent.click(open);
    expect(onOpenStudent).toHaveBeenCalledWith("s1", open);
    expect(reads).toBe(1);
  });
});
