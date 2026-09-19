// @vitest-environment happy-dom
// Class Learning Materials — the Reader half of the E2E journey (api/tests/class-learning-materials-e2e.test.js
// proves the server half). For each successive teacher state the student's Reader — the SAME LearningReader over
// the restricted content API — is opened over the REAL 791381 registry and its TOC / navigation are checked:
//   m01 → m01+m02 → m01+m02+m07 → m01+m07 (m02 hidden) → m01+m02+m07 (re-published).
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import LearningReader from "./LearningReader";
import { registryContentApi } from "./readerContentApi";
import { createRestrictedReaderContentApi } from "./restrictedContentApi";

afterEach(cleanup);
const M01 = "791381-m01", M02 = "791381-m02", M07 = "791381-m07";
const SLOW = { timeout: 8000 }, T = 30000;
const jump = () => screen.getByLabelText("انتقل إلى صفحة") as HTMLSelectElement;
const nextBtn = () => screen.getByRole("button", { name: "التالي" }) as HTMLButtonElement;
const tocModules = () => within(screen.getByRole("complementary", { name: "فهرس الكتاب (سطح المكتب)" })).getAllByRole("button", { expanded: true }).map(b => b.textContent);
const readerText = () => (document.querySelector(".learning-reader") as HTMLElement).textContent || "";

async function openReader(released: string[]) {
  const loads: string[] = [];
  const base = { ...registryContentApi, loadModule: (c: string, m: string) => { loads.push(m); return registryContentApi.loadModule(c, m); } };
  const utils = render(<LearningReader courseId="791381" onExit={vi.fn()} api={createRestrictedReaderContentApi("791381", released, base)} exitLabel="العودة إلى موادي التعليمية" />);
  await screen.findByRole("heading", { level: 2, name: "أساسيات الشبكات" }, SLOW);
  return { ...utils, loads };
}
async function goToLastPageOf(moduleId: string) {
  const last = [...jump().options].filter(o => o.value.startsWith(moduleId)).at(-1)!.value;
  fireEvent.change(jump(), { target: { value: last } });
  await waitFor(() => expect(jump().value).toBe(last));
  return last;
}

describe("E2E — the student's Reader after each teacher step", () => {
  it("m01 only: TOC lists only «أساسيات الشبكات»; its last page disables Next", async () => {
    const r = await openReader([M01]);
    expect(tocModules()).toEqual(["أساسيات الشبكات"]);
    expect(jump().options.length).toBe(7);
    await goToLastPageOf(M01);
    await screen.findByText(/صفحة PDF 13(\D|$)/, {}, SLOW);
    expect(nextBtn().disabled).toBe(true);
    expect(readerText()).not.toMatch(/الأعداد والموازين|عناوين IP|قيد الإعداد/);
    r.unmount();
  }, T);

  it("m01 + m02: TOC in canonical sequence; last m01 page → Next → first m02 page; last m02 page disables Next", async () => {
    const r = await openReader([M01, M02]);
    expect(tocModules()).toEqual(["أساسيات الشبكات", "الأعداد والموازين"]);
    await goToLastPageOf(M01);
    await screen.findByText(/صفحة PDF 13(\D|$)/, {}, SLOW);
    fireEvent.click(nextBtn());
    expect(await screen.findByText("الوحدة الثانية", {}, SLOW)).toBeTruthy();               // m02 opener (PDF 14)
    await goToLastPageOf(M02);
    await screen.findByText(/صفحة PDF 23(\D|$)/, {}, SLOW);
    expect(nextBtn().disabled).toBe(true);
    // (PDF 23's own prose may mention IP addresses — the NAVIGATION surfaces are what must not expose the hidden unit)
    expect(tocModules()).toEqual(["أساسيات الشبكات", "الأعداد والموازين"]);
    expect([...jump().options].some(o => o.value.startsWith(M07))).toBe(false);
    r.unmount();
  }, T);

  it("m01 + m02 + m07: TOC lists the three units in canonical order and m07 follows m02", async () => {
    const r = await openReader([M01, M02, M07]);
    expect(tocModules()).toEqual(["أساسيات الشبكات", "الأعداد والموازين", "عناوين IP"]);
    expect(jump().options.length).toBe(7 + 10 + 10);
    await goToLastPageOf(M02);
    await screen.findByText(/صفحة PDF 23(\D|$)/, {}, SLOW);
    expect(nextBtn().disabled).toBe(false);
    fireEvent.click(nextBtn());
    expect(await screen.findByText("الوحدة الثالثة", {}, SLOW)).toBeTruthy();
    r.unmount();
  }, T);

  it("m02 hidden (m01 + m07): no blank, no «قيد الإعداد», no m02 name; last m01 page → Next → first m07 page; m02 never loads", async () => {
    const r = await openReader([M01, M07]);
    expect(tocModules()).toEqual(["أساسيات الشبكات", "عناوين IP"]);
    expect(jump().options.length).toBe(7 + 10);
    await goToLastPageOf(M01);
    await screen.findByText(/صفحة PDF 13(\D|$)/, {}, SLOW);
    fireEvent.click(nextBtn());
    expect(await screen.findByText("الوحدة الثالثة", {}, SLOW)).toBeTruthy();
    expect(screen.getByText(/صفحة PDF 24(\D|$)/)).toBeTruthy();
    expect(readerText()).not.toMatch(/الأعداد والموازين|قيد الإعداد/);
    await waitFor(() => expect(r.loads).toEqual([M01, M07]), SLOW);
    r.unmount();
  }, T);

  it("m02 re-published: the Reader returns to m01 → m02 → m07 in canonical order", async () => {
    const r = await openReader([M07, M01, M02]);                                              // allow-list order never matters
    expect(tocModules()).toEqual(["أساسيات الشبكات", "الأعداد والموازين", "عناوين IP"]);
    await goToLastPageOf(M01);
    fireEvent.click(nextBtn());
    expect(await screen.findByText("الوحدة الثانية", {}, SLOW)).toBeTruthy();
    r.unmount();
  }, T);
});
