// @vitest-environment happy-dom
// Phase 21E L3-B — the Reader's own open guard, independent of the panel: even if the search panel handed it a result
// outside the Reader's (restricted) manifest — a page of a hidden module, a page of another course, an unknown page —
// the Reader refuses to open it, loads no module body for it, and never calls the entitlement re-check for it.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import type { SearchHit } from "../search/searchModel";
import manifest from "../content/791381/manifest";
import { registryContentApi } from "./readerContentApi";
import { createRestrictedReaderContentApi } from "./restrictedContentApi";

// The panel stub renders one button per crafted hit and forwards the click to the Reader's onOpen.
const crafted: SearchHit[] = [];
vi.mock("../search/LearningSearchPanel", () => ({
  default: (props: { onOpen: (h: SearchHit) => void; openError?: string }) => (
    <div>
      {crafted.map(h => <button key={h.courseId + h.pageId} type="button" onClick={() => props.onOpen(h)}>{"open " + h.pageId}</button>)}
      {props.openError ? <p role="alert">{props.openError}</p> : null}
    </div>
  ),
}));
import LearningReader from "./LearningReader";

afterEach(() => { cleanup(); crafted.length = 0; });
const SLOW = { timeout: 8000 };
const M01 = "791381-m01", M07 = "791381-m07";
const hitOf = (moduleId: string, courseId = "791381"): SearchHit => {
  const mod = manifest.modules.find(m => m.id === moduleId)!;
  const page = mod.lessons[0].pages[0];
  return { courseId, moduleId, lessonId: mod.lessons[0].id, pageId: page.id, title: page.title, matchedField: "title", ordinal: 1, total: 248 };
};

describe("L3-B Reader — a crafted result outside the Reader's manifest never opens", () => {
  it.each([
    ["a page of a hidden module", () => hitOf(M07)],
    ["a page of another course", () => hitOf(M01, "999999")],
    ["an unknown page id", () => ({ ...hitOf(M01), pageId: "791381-m01-l99-p99" })],
  ])("%s → refused, no module load, no re-check", async (_label, make) => {
    const hit = make();
    crafted.push(hit);
    const loads: string[] = [];
    const base = { ...registryContentApi, loadModule: (c: string, m: string) => { loads.push(m); return registryContentApi.loadModule(c, m); } };
    const check = vi.fn(async () => true);
    render(<LearningReader courseId="791381" onExit={vi.fn()} api={createRestrictedReaderContentApi("791381", [M01], base)} searchScope={new Set([M01])} onSearchOpen={check} />);
    await screen.findByRole("heading", { level: 2, name: "أساسيات الشبكات" }, SLOW);
    fireEvent.click(screen.getByRole("button", { name: "بحث" }));
    const dlg = await screen.findByRole("dialog", { name: "البحث في الكتاب" });
    fireEvent.click(await within(dlg).findByRole("button", { name: "open " + hit.pageId }, SLOW));
    expect((await within(dlg).findByRole("alert")).textContent).toBe("لا يمكن فتح هذه الصفحة.");
    expect(check).not.toHaveBeenCalled();
    expect(loads.every(m => m === M01)).toBe(true);
    expect(screen.getByRole("heading", { level: 2, name: "أساسيات الشبكات" })).toBeTruthy();
  }, 20000);
});
