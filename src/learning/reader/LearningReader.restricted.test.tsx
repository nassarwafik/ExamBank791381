// @vitest-environment happy-dom
// Class Learning Materials — the SAME LearningReader over the real 791381 registry, constrained by the student's
// released module ids. Proves: a hidden module has no title/TOC entry/jump option/page in the total; navigating to
// a hidden page fails safely and never lazy-loads its body; the last released page disables Next; releasing m07
// (a remount with the new allow-list) makes it appear in canonical order; a hidden MIDDLE module reads m01 → m07.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import LearningReader from "./LearningReader";
import { registryContentApi } from "./readerContentApi";
import { createRestrictedReaderContentApi } from "./restrictedContentApi";
import manifest from "../content/791381/manifest";

afterEach(cleanup);
const M01 = "791381-m01", M02 = "791381-m02", M07 = "791381-m07";
const SLOW = { timeout: 8000 }, T = 20000;
const pagesOf = (id: string) => manifest.modules.find(x => x.id === id)!.lessons.reduce((n, l) => n + l.pages.length, 0);
const jump = () => screen.getByLabelText("انتقل إلى صفحة") as HTMLSelectElement;
const nextBtn = () => screen.getByRole("button", { name: "التالي" }) as HTMLButtonElement;
const heading = (name: string) => screen.findByRole("heading", { level: 2, name }, SLOW);

function spiedBase() {
  const loads: string[] = [];
  return { loads, api: { ...registryContentApi, loadModule: (c: string, m: string) => { loads.push(m); return registryContentApi.loadModule(c, m); } } };
}
function mount(allowed: string[]) {
  const base = spiedBase();
  const api = createRestrictedReaderContentApi("791381", allowed, base.api);
  const utils = render(<LearningReader courseId="791381" onExit={vi.fn()} api={api} exitLabel="العودة إلى موادي التعليمية" />);
  return { ...utils, loads: base.loads };
}
const readerText = () => (document.querySelector(".learning-reader") as HTMLElement).textContent || "";

describe("student Reader — m07 hidden (released m01 + m02)", () => {
  it("«عناوين IP» appears nowhere: desktop TOC, mobile drawer, jump select, header context, page total; the exit label is the student's", async () => {
    const { loads } = mount([M01, M02]);
    await heading("أساسيات الشبكات");
    const total = pagesOf(M01) + pagesOf(M02);
    expect(screen.getByText("صفحة 1 من " + total)).toBeTruthy();
    const toc = within(screen.getByRole("complementary", { name: "فهرس الكتاب (سطح المكتب)" }));
    expect(toc.getAllByText("أساسيات الشبكات").length).toBeGreaterThan(0); expect(toc.getAllByText("الأعداد والموازين").length).toBeGreaterThan(0);
    expect(toc.queryByText("عناوين IP")).toBeNull();
    expect(toc.queryByText(/CLI|Trunk|Cisco|ACL/)).toBeNull();                       // skeleton modules absent too
    expect([...jump().options].some(o => o.value.startsWith(M07))).toBe(false);
    expect(jump().options.length).toBe(total);
    fireEvent.click(screen.getByRole("button", { name: "الفهرس" }));                  // mobile drawer
    const drawer = await screen.findByRole("dialog", { name: "فهرس الكتاب" });
    expect(within(drawer).queryByText("عناوين IP")).toBeNull();
    fireEvent.click(within(drawer).getByRole("button", { name: "إغلاق" }));
    expect(readerText()).not.toContain("عناوين IP");
    expect(screen.getAllByRole("button", { name: "العودة إلى موادي التعليمية" }).length).toBe(1);
    expect(loads).toEqual([M01]);
  }, T);

  it("a direct navigation to a hidden page (m07 opener) is ignored: no body load, no title, position unchanged", async () => {
    const { loads } = mount([M01, M02]);
    await heading("أساسيات الشبكات");
    fireEvent.change(jump(), { target: { value: "791381-m07-l00-p01" } });
    await new Promise(r => setTimeout(r, 50));
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("أساسيات الشبكات");
    expect(readerText()).not.toContain("الوحدة الثالثة");
    expect(readerText()).not.toContain("عناوين IP");
    await waitFor(() => expect(loads).toEqual([M01]), SLOW);
    expect(loads).not.toContain(M07);
  }, T);

  it("the last released page (end of m02) disables Next; m07 released later (remount) → Next continues into the m07 opener in canonical order", async () => {
    const two = mount([M01, M02]);
    await heading("أساسيات الشبكات");
    fireEvent.change(jump(), { target: { value: "791381-m02-l01-p09" } });
    await screen.findByText(/صفحة PDF 23(\D|$)/, {}, SLOW);
    expect(nextBtn().disabled).toBe(true);
    expect(screen.getByText("صفحة " + (pagesOf(M01) + pagesOf(M02)) + " من " + (pagesOf(M01) + pagesOf(M02)))).toBeTruthy();
    two.unmount();
    const three = mount([M01, M02, M07]);
    await heading("أساسيات الشبكات");
    const toc = within(screen.getByRole("complementary", { name: "فهرس الكتاب (سطح المكتب)" }));
    const modules = toc.getAllByRole("button", { expanded: true }).map(b => b.textContent);
    expect(modules).toEqual(["أساسيات الشبكات", "الأعداد والموازين", "عناوين IP"]);   // canonical order, m07 after m02
    fireEvent.change(jump(), { target: { value: "791381-m02-l01-p09" } });
    await screen.findByText(/صفحة PDF 23(\D|$)/, {}, SLOW);
    expect(nextBtn().disabled).toBe(false);
    fireEvent.click(nextBtn());
    expect(await screen.findByText("الوحدة الثالثة", {}, SLOW)).toBeTruthy();
    await waitFor(() => expect(three.loads).toEqual([M01, M02, M07]), SLOW);
  }, T);
});

describe("student Reader — hidden MIDDLE module (released m01 + m07)", () => {
  it("no m02 anywhere (no blank, no «قيد الإعداد», no name); last m01 page → Next → first m07 page; total = m01 + m07 pages; m02 never loads", async () => {
    const { loads } = mount([M01, M07]);
    await heading("أساسيات الشبكات");
    const total = pagesOf(M01) + pagesOf(M07);
    expect(document.querySelector(".learning-reader-navpos")!.textContent).toBe("1 / " + total);   // page 1 is the m01 opener
    expect(readerText()).not.toContain("الأعداد والموازين");
    expect(readerText()).not.toContain("قيد الإعداد");
    fireEvent.change(jump(), { target: { value: "791381-m01-l02-p03" } });        // last page of m01 (PDF 13)
    await screen.findByText(/صفحة PDF 13(\D|$)/, {}, SLOW);
    expect(screen.getByText("صفحة " + pagesOf(M01) + " من " + total)).toBeTruthy();
    fireEvent.click(nextBtn());
    expect(await screen.findByText("الوحدة الثالثة", {}, SLOW)).toBeTruthy();       // m07 opener (PDF 24)
    expect(screen.getByText(/صفحة PDF 24(\D|$)/)).toBeTruthy();
    // opener pages show the position only in the bottom navigation
    expect(document.querySelector(".learning-reader-navpos")!.textContent).toBe((pagesOf(M01) + 1) + " / " + total);
    await waitFor(() => expect(loads).toEqual([M01, M07]), SLOW);
    expect(loads).not.toContain(M02);
    expect(readerText()).not.toContain("الأعداد والموازين");
  }, T);
});
