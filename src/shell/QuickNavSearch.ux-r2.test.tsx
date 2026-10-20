// @vitest-environment happy-dom
// Phase UX-R2 — the top bar's quick navigation field: an ARIA combobox that only jumps to shell destinations.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import QuickNavSearch from "./QuickNavSearch";
import { matchDestinations, normalizeArabic } from "./quickNav";

const DEST = [
  { id: "dashboard", label: "لوحة المتابعة" }, { id: "students", label: "الصفوف والطلاب" }, { id: "assignments", label: "الواجبات" },
  { id: "reports", label: "التقارير" }, { id: "bank", label: "بنك الامتحانات" }, { id: "builder", label: "باني الامتحان" },
];
afterEach(cleanup);
function mount() {
  const onNavigate = vi.fn<(id: string) => void>();
  render(<QuickNavSearch destinations={DEST} onNavigate={onNavigate} />);
  return { onNavigate, input: screen.getByRole("combobox", { name: "انتقل إلى صفحة" }) };
}
const options = () => screen.queryAllByRole("option").map(o => o.textContent);

describe("UX-R2 quick navigation — matching", () => {
  it("is Arabic-insensitive: diacritics, tatweel, alef / ya / ta-marbuta forms", () => {
    expect(normalizeArabic("الامتحانـات")).toBe(normalizeArabic("الإمتحانات"));
    expect(normalizeArabic("مُتابَعة")).toBe("متابعه");
    expect(matchDestinations(DEST, "إمتحان").map(d => d.id)).toEqual(["bank", "builder"]);
    expect(matchDestinations(DEST, "  ").length).toBe(DEST.length);
    expect(matchDestinations(DEST, "غير موجود")).toEqual([]);
  });
});

describe("UX-R2 quick navigation — combobox behaviour", () => {
  it("starts closed with the combobox semantics in place", () => {
    const { input } = mount();
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(input.getAttribute("aria-autocomplete")).toBe("list");
    expect(input.getAttribute("aria-controls")).toBeTruthy();
    expect(options()).toEqual([]);
  });
  it("typing filters the destinations and highlights the first match through aria-activedescendant", () => {
    const { input } = mount();
    fireEvent.change(input, { target: { value: "امتحان" } });
    expect(options()).toEqual(["بنك الامتحانات", "باني الامتحان"]);
    expect(input.getAttribute("aria-expanded")).toBe("true");
    const first = screen.getAllByRole("option")[0];
    expect(input.getAttribute("aria-activedescendant")).toBe(first.id);
    expect(first.getAttribute("aria-selected")).toBe("true");
  });
  it("ArrowDown / ArrowUp move the highlight (wrapping) and Enter opens the highlighted destination, then clears", () => {
    const { input, onNavigate } = mount();
    fireEvent.change(input, { target: { value: "امتحان" } });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[1].getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[0].getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith("builder");
    expect((input as HTMLInputElement).value).toBe("");
    expect(input.getAttribute("aria-expanded")).toBe("false");
  });
  it("ArrowDown on an empty field opens the full list", () => {
    const { input } = mount();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(options().length).toBe(DEST.length);
  });
  it("Escape closes the list first, then clears the text; Enter with no match navigates nowhere", () => {
    const { input, onNavigate } = mount();
    fireEvent.change(input, { target: { value: "تقارير" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect((input as HTMLInputElement).value).toBe("تقارير");
    fireEvent.keyDown(input, { key: "Escape" });
    expect((input as HTMLInputElement).value).toBe("");
    fireEvent.change(input, { target: { value: "غير موجود" } });
    const live = document.querySelector(".eb-quicknav-live")!;
    expect(live.getAttribute("aria-live")).toBe("polite");
    expect(live.getAttribute("role")).toBeNull();                       // the page keeps ONE role="status" (its loading fallback)
    expect(live.textContent).toBe("لا توجد صفحة بهذا الاسم");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onNavigate).not.toHaveBeenCalled();
    expect((input as HTMLInputElement).value).toBe("غير موجود");      // the text stays, so the teacher can correct it
  });
  it("a click on an option navigates; blur closes the list", () => {
    const { input, onNavigate } = mount();
    fireEvent.change(input, { target: { value: "طلاب" } });
    fireEvent.click(screen.getByRole("option", { name: "الصفوف والطلاب" }));
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith("students");
    fireEvent.change(input, { target: { value: "طلاب" } });
    fireEvent.blur(input);
    expect(options()).toEqual([]);
  });
});
