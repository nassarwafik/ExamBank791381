// @vitest-environment happy-dom
// Phase 21E L3-B — L3-4 guard: typing in the in-book search re-renders the search panel only. The page body and the two
// indexes (desktop sidebar + drawer, 248 entries each) must not re-render per keystroke — in Chromium at 4× CPU
// throttling that Reader-wide re-render alone pushed the p95 input → results time above the 50 ms budget.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, act } from "@testing-library/react";

const renders = { toc: 0, page: 0 };
vi.mock("./LearningReaderToc", async importOriginal => {
  const real = (await importOriginal<typeof import("./LearningReaderToc")>()).default;
  return { default: (props: Parameters<typeof real>[0]) => { renders.toc++; return real(props); } };
});
vi.mock("./LearningPageRenderer", async importOriginal => {
  const mod = await importOriginal<typeof import("./LearningPageRenderer")>();
  const real = mod.default;
  return { ...mod, default: (props: Parameters<typeof real>[0]) => { renders.page++; return real(props); } };
});
import LearningReader from "./LearningReader";

afterEach(cleanup);
const SLOW = { timeout: 8000 };
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 120)); });

describe("L3-B Reader search — a keystroke does not re-render the Reader", () => {
  it("typing 8 queries leaves the index and page-body render counts unchanged, while the results update", async () => {
    render(<LearningReader courseId="791381" onExit={vi.fn()} searchScope="all" />);
    await screen.findByRole("heading", { level: 2, name: "أساسيات الشبكات" }, SLOW);
    fireEvent.click(screen.getByRole("button", { name: "بحث" }));
    const dlg = await screen.findByRole("dialog", { name: "البحث في الكتاب" });
    const box = await within(dlg).findByRole("searchbox", undefined, SLOW);
    await settle();
    const before = { ...renders };
    const counts: number[] = [];
    for (const q of ["ا", "IP", "Router", "VLAN", "ACL", "الشبكة", "Switch", "zzzz"]) {
      fireEvent.change(box, { target: { value: q } });
      counts.push(dlg.querySelectorAll("[data-search-hit]").length);
    }
    await settle();
    expect(counts.some(n => n > 0)).toBe(true);
    expect(counts[counts.length - 1]).toBe(0);
    expect(renders).toEqual(before);
  }, 20000);
});
