// @vitest-environment happy-dom
// Phase 21E L3-B — the teacher library: subject / grade filters from the catalog model, the library-wide search (an
// authorized teacher session only), and search → open in the Reader → «العودة إلى نتائج البحث» restoring the query
// and focus. Opening the library (and the filters) loads no manifest; only activating the search does.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor, act } from "@testing-library/react";

const manifestLoads: string[] = [];
vi.mock("./content/registry", async importOriginal => {
  const real = await importOriginal<typeof import("./content/registry")>();
  return { ...real, loadCourseManifest: (id: string) => { manifestLoads.push(id); return real.loadCourseManifest(id); } };
});
import LearningMaterialsPage from "./LearningMaterialsPage";

afterEach(() => { cleanup(); manifestLoads.length = 0; vi.restoreAllMocks(); });
const SLOW = { timeout: 8000 }, T = 25000;
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 120)); });
const stubFetch = () => { globalThis.fetch = vi.fn(() => Promise.resolve({ status: 404, ok: false, json: async () => ({ ok: false }) } as Response)) as unknown as typeof fetch; };

describe("L3-B teacher library — filters", () => {
  it("offers subject and grade filters from the catalog (grades split from the free-text field) and loads no manifest", async () => {
    render(<LearningMaterialsPage token="t" />);
    const subject = screen.getByRole("combobox", { name: "المادة" }) as HTMLSelectElement;
    const grade = screen.getByRole("combobox", { name: "الصف" }) as HTMLSelectElement;
    expect([...subject.options].map(o => o.textContent)).toEqual(["كل المواد", "أنظمة محوسبة"]);
    expect([...grade.options].map(o => o.textContent)).toEqual(["كل الصفوف", "الصف العاشر", "الصف الحادي عشر"]);
    fireEvent.change(grade, { target: { value: "الصف الحادي عشر" } });
    expect(screen.getByRole("heading", { level: 3, name: "شبكات الاتصال" })).toBeTruthy();
    fireEvent.change(subject, { target: { value: "أنظمة محوسبة" } });
    expect(screen.getByRole("heading", { level: 3, name: "شبكات الاتصال" })).toBeTruthy();
    await settle();
    expect(manifestLoads).toEqual([]);
  });
});

describe("L3-B teacher library — search", () => {
  it("search → open in the Reader → «العودة إلى نتائج البحث» restores the query and focus", async () => {
    stubFetch();
    render(<LearningMaterialsPage token="t" />);
    fireEvent.click(screen.getByRole("button", { name: "ابحث في عناوين الدروس والصفحات" }));
    const box = await screen.findByRole("searchbox", undefined, SLOW) as HTMLInputElement;
    expect(document.activeElement).toBe(box);
    await waitFor(() => expect(manifestLoads).toEqual(["791381"]), SLOW);
    fireEvent.change(box, { target: { value: "VLAN" } });
    await settle();
    const section = screen.getByRole("region", { name: "البحث في المكتبة" });
    expect(await within(section).findByRole("heading", { level: 4, name: "كتاب 791381 — شبكات الاتصال" }, SLOW)).toBeTruthy();
    expect(within(section).getAllByRole("heading", { level: 5 }).length).toBeGreaterThan(0);
    const hit = section.querySelector<HTMLButtonElement>("[data-search-hit]")!;
    const title = hit.querySelector(".eb-search-hit-title")!.textContent!;
    fireEvent.click(hit);
    await screen.findByRole("heading", { level: 2, name: title }, SLOW);
    fireEvent.click(screen.getAllByRole("button", { name: "العودة إلى نتائج البحث" })[0]);
    const again = await screen.findByRole("searchbox", undefined, SLOW) as HTMLInputElement;
    expect(again.value).toBe("VLAN");
    expect(document.activeElement).toBe(again);
    await settle();
    expect(screen.getByRole("region", { name: "البحث في المكتبة" }).querySelectorAll("[data-search-hit]").length).toBeGreaterThan(0);
  }, T);

  it("the teacher Reader opened from the library has in-book search (\"all\")", async () => {
    stubFetch();
    render(<LearningMaterialsPage token="t" />);
    fireEvent.click(within(screen.getByRole("article", { name: "شبكات الاتصال" })).getByRole("button", { name: "فتح الكتاب" }));
    fireEvent.click(screen.getByRole("button", { name: "بدء القراءة" }));
    await screen.findByRole("heading", { level: 2, name: "أساسيات الشبكات" }, SLOW);
    expect(screen.getByRole("button", { name: "بحث" })).toBeTruthy();
  }, T);

  it("without a teacher session token there is no library search and no in-book search", async () => {
    render(<LearningMaterialsPage />);
    expect(screen.queryByRole("button", { name: "ابحث في عناوين الدروس والصفحات" })).toBeNull();
    fireEvent.click(within(screen.getByRole("article", { name: "شبكات الاتصال" })).getByRole("button", { name: "فتح الكتاب" }));
    fireEvent.click(screen.getByRole("button", { name: "بدء القراءة" }));
    await screen.findByRole("heading", { level: 2, name: "أساسيات الشبكات" }, SLOW);
    expect(screen.queryByRole("button", { name: "بحث" })).toBeNull();
  }, T);
});
