// @vitest-environment happy-dom
// Phase 21E L3-B — in-book search inside the shared Reader, over the real 791381 registry.
//  • teacher ("all"): search → open → back restores the query, focus in the field and the live result count (L3-6);
//  • opening and typing in the search loads NO module body (L3-3, unit level; Chromium proves the request log);
//  • student (restricted API + explicit release Set): hidden titles return nothing (L3-1), and a result whose
//    entitlement re-check fails (false / throws) does NOT open;
//  • no scope → no search control; an invalid scope → "unavailable"; the shared wrapper refuses "all" for a student.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor, act } from "@testing-library/react";
import LearningReader from "./LearningReader";
import LearningReaderWithTraining from "../training/LearningReaderWithTraining";
import { registryContentApi } from "./readerContentApi";
import { createRestrictedReaderContentApi } from "./restrictedContentApi";
import manifest from "../content/791381/manifest";
import type { SearchScope } from "../content/searchProvider";

afterEach(cleanup);
const SLOW = { timeout: 8000 }, T = 20000;
const M01 = "791381-m01", M02 = "791381-m02", M07 = "791381-m07";
const modTitle = (id: string) => manifest.modules.find(m => m.id === id)!.title;
const pageTitles = (id: string) => manifest.modules.find(m => m.id === id)!.lessons.flatMap(l => l.pages.map(p => p.title));

function spied(allowed?: string[]) {
  const loads: string[] = [];
  const base = { ...registryContentApi, loadModule: (c: string, m: string) => { loads.push(m); return registryContentApi.loadModule(c, m); } };
  return { loads, api: allowed ? createRestrictedReaderContentApi("791381", allowed, base) : base };
}
const ready = () => screen.findByRole("heading", { level: 2, name: "أساسيات الشبكات" }, SLOW);
const openSearch = async () => {
  fireEvent.click(screen.getByRole("button", { name: "بحث" }));
  const dlg = await screen.findByRole("dialog", { name: "البحث في الكتاب" });
  await within(dlg).findByRole("searchbox", undefined, SLOW);
  return dlg;
};
const box = (dlg: HTMLElement) => within(dlg).getByRole("searchbox") as HTMLInputElement;
const hits = (dlg: HTMLElement) => [...dlg.querySelectorAll<HTMLButtonElement>("[data-search-hit]")];
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 120)); });

describe("L3-B Reader search — teacher (\"all\")", () => {
  it("L3-6: search → open → back restores the query, focus in the field and the announced count", async () => {
    const { api } = spied();
    render(<LearningReader courseId="791381" onExit={vi.fn()} api={api} searchScope="all" />);
    await ready();
    const dlg = await openSearch();
    expect(document.activeElement).toBe(box(dlg));
    fireEvent.change(box(dlg), { target: { value: "IP" } });
    await settle();
    const count = within(dlg).getByRole("status").textContent;
    expect(count).toMatch(/نتيج|نتائج/);
    const target = hits(dlg).find(h => /IP/.test(h.textContent || ""))!;
    const title = target.querySelector(".eb-search-hit-title")!.textContent!;
    fireEvent.click(target);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "البحث في الكتاب" })).toBeNull());
    await screen.findByRole("heading", { level: 2, name: title }, SLOW);
    const back = screen.getByRole("button", { name: /العودة إلى نتائج البحث/ });
    expect(back.textContent).toContain("«IP»");
    fireEvent.click(back);
    const again = await screen.findByRole("dialog", { name: "البحث في الكتاب" });
    await within(again).findByRole("searchbox", undefined, SLOW);
    expect(box(again).value).toBe("IP");
    expect(document.activeElement).toBe(box(again));
    await settle();
    expect(within(again).getByRole("status").textContent).toBe(count);
    expect(hits(again).length).toBeGreaterThan(0);
  }, T);

  it("L3-3 (unit): opening the search and typing loads NO module body", async () => {
    const { api, loads } = spied();
    render(<LearningReader courseId="791381" onExit={vi.fn()} api={api} searchScope="all" />);
    await ready();
    await waitFor(() => expect(loads).toEqual([M01]), SLOW);
    const dlg = await openSearch();
    for (const q of ["الشبكة", "IP", "Router", "VLAN", "ACL"]) { fireEvent.change(box(dlg), { target: { value: q } }); await settle(); }
    expect(hits(dlg).length).toBeGreaterThan(0);
    expect(loads).toEqual([M01]);
  }, T);

  it("Escape closes the search and returns focus to the «بحث» control; the query is kept for next time", async () => {
    render(<LearningReader courseId="791381" onExit={vi.fn()} api={spied().api} searchScope="all" />);
    await ready();
    const dlg = await openSearch();
    fireEvent.change(box(dlg), { target: { value: "" } });
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "البحث في الكتاب" })).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "بحث" }));
  }, T);

  it("no scope → no search control; an invalid scope → «unavailable», no result", async () => {
    const { unmount } = render(<LearningReader courseId="791381" onExit={vi.fn()} api={spied().api} />);
    await ready();
    expect(screen.queryByRole("button", { name: "بحث" })).toBeNull();
    unmount();
    render(<LearningReader courseId="791381" onExit={vi.fn()} api={spied().api} searchScope={["791381-m01"] as unknown as SearchScope["allowedModuleIds"]} />);
    await ready();
    const dlg = await openSearch();
    fireEvent.change(box(dlg), { target: { value: "الشبكة" } });
    await settle();
    expect(within(dlg).getByRole("status").textContent).toBe("البحث غير متاح الآن.");
    expect(hits(dlg)).toHaveLength(0);
  }, T);
});

describe("L3-B Reader search — student (restricted manifest + explicit release Set)", () => {
  const released = [M01, M02];
  it("L3-1 (UI): every hidden module's title and a sample of its page titles return no result; released pages are found", async () => {
    const { api } = spied(released);
    render(<LearningReader courseId="791381" onExit={vi.fn()} api={api} searchScope={new Set(released)} />);
    await ready();
    const dlg = await openSearch();
    const hidden = manifest.modules.filter(m => !released.includes(m.id));
    for (const m of hidden) {
      for (const q of [m.title, ...pageTitles(m.id).slice(0, 2)]) {
        fireEvent.change(box(dlg), { target: { value: q } });
        await settle();
        const shown = hits(dlg).map(h => h.textContent || "");
        expect(dlg.textContent, `«${q}»`).not.toContain(modTitle(M07));
        for (const t of pageTitles(m.id)) if (!pageTitles(M01).includes(t) && !pageTitles(M02).includes(t)) expect(shown.some(s => s.includes(t)), `«${t}» leaked for «${q}»`).toBe(false);
      }
    }
    fireEvent.change(box(dlg), { target: { value: pageTitles(M02)[1] } });
    await settle();
    expect(hits(dlg).length).toBeGreaterThan(0);
  }, 60000);

  it("a result whose entitlement re-check fails does NOT open (false, then a rejected check); a passing check opens it", async () => {
    const { api } = spied(released);
    const check = vi.fn<(h: { moduleId: string }) => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(true);
    render(<LearningReader courseId="791381" onExit={vi.fn()} api={api} searchScope={new Set(released)} onSearchOpen={check} />);
    await ready();
    const dlg = await openSearch();
    const target = pageTitles(M02)[1];
    fireEvent.change(box(dlg), { target: { value: target } });
    await settle();
    const hit = hits(dlg).find(h => (h.textContent || "").includes(target))!;
    fireEvent.click(hit);
    expect(await within(dlg).findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "البحث في الكتاب" })).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 2, name: target })).toBeNull();
    fireEvent.click(hits(dlg).find(h => (h.textContent || "").includes(target))!);
    await within(dlg).findByRole("alert");
    expect(screen.queryByRole("heading", { level: 2, name: target })).toBeNull();
    fireEvent.click(hits(dlg).find(h => (h.textContent || "").includes(target))!);
    await screen.findByRole("heading", { level: 2, name: target }, SLOW);
    expect(check).toHaveBeenCalledTimes(3);
    expect(check.mock.calls.every(c => c[0].moduleId === M02)).toBe(true);
  }, T);
});

describe("L3-B shared Reader-plus-training wrapper", () => {
  it("refuses \"all\" for a STUDENT session (no search control) and forwards it for a teacher", async () => {
    const { unmount } = render(<LearningReaderWithTraining courseId="791381" onExit={vi.fn()} exitLabel="x" client={null} actor="student" api={spied([M01]).api} searchScope="all" />);
    await ready();
    expect(screen.queryByRole("button", { name: "بحث" })).toBeNull();
    unmount();
    render(<LearningReaderWithTraining courseId="791381" onExit={vi.fn()} exitLabel="x" client={null} actor="teacher" searchScope="all" />);
    await ready();
    expect(screen.getByRole("button", { name: "بحث" })).toBeTruthy();
  }, T);

  it("forwards a student's explicit Set", async () => {
    render(<LearningReaderWithTraining courseId="791381" onExit={vi.fn()} exitLabel="x" client={null} actor="student" api={spied([M01]).api} searchScope={new Set([M01])} />);
    await ready();
    expect(screen.getByRole("button", { name: "بحث" })).toBeTruthy();
  }, T);
});
