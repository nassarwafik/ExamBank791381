// @vitest-environment happy-dom
// Phase 21E L3-B — the student's in-book search, end to end through StudentReader:
//  • the search scope is EXACTLY the released module ids the Reader was opened with (never "all");
//  • opening a result re-reads GET /api/student-learning-materials: still released → opens; hidden since →
//    denied; server error / 401 / network failure / malformed body → denied (fail closed);
//  • a static guard: no student code path passes "all" as a release set.
/// <reference types="node" />
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, act } from "@testing-library/react";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import StudentReader from "./StudentReader";
import { fetchReleasedModuleIds } from "./learningRelease";
import manifest from "../learning/content/791381/manifest";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const SLOW = { timeout: 8000 }, T = 25000;
const M01 = "791381-m01", M02 = "791381-m02";
const titlesOf = (id: string) => manifest.modules.find(m => m.id === id)!.lessons.flatMap(l => l.pages.map(p => p.title));
const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);
const materials = (mods: string[]) => ({ ok: true, materials: [{ courseId: "791381", title: "شبكات الاتصال", modules: mods.map((m, i) => ({ moduleId: m, title: m, order: i + 1 })) }] });

function mount(release: () => Promise<Response>) {
  const calls: string[] = [];
  globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("/api/student-learning-materials")) return release();
    return res(404, { ok: false });
  }) as unknown as typeof fetch;
  render(<StudentReader courseId="791381" allowedModuleIds={[M01, M02]} token="tok" onExit={vi.fn()} />);
  return calls;
}
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 120)); });
async function searchFor(q: string) {
  await screen.findByRole("heading", { level: 2, name: "أساسيات الشبكات" }, SLOW);
  fireEvent.click(screen.getByRole("button", { name: "بحث" }));
  const dlg = await screen.findByRole("dialog", { name: "البحث في الكتاب" });
  const box = await within(dlg).findByRole("searchbox", undefined, SLOW);
  fireEvent.change(box, { target: { value: q } });
  await settle();
  return dlg;
}
const hitFor = (dlg: HTMLElement, t: string) => [...dlg.querySelectorAll<HTMLButtonElement>("[data-search-hit]")].find(h => (h.textContent || "").includes(t))!;

describe("StudentReader search — open-time entitlement re-check", () => {
  const target = titlesOf(M02)[1];

  it("still released → the page opens (one fresh release read)", async () => {
    const calls = mount(() => res(200, materials([M01, M02])));
    const dlg = await searchFor(target);
    fireEvent.click(hitFor(dlg, target));
    await screen.findByRole("heading", { level: 2, name: target }, SLOW);
    expect(calls.filter(u => u.includes("/api/student-learning-materials"))).toHaveLength(1);
  }, T);

  it.each([
    ["hidden since the Reader opened", () => res(200, materials([M01]))],
    ["course no longer listed", () => res(200, { ok: true, materials: [] })],
    ["server error", () => res(500, { ok: false })],
    ["session expired (401)", () => res(401, { ok: false })],
    ["malformed body", () => res(200, { ok: true, materials: "nope" })],
    ["network failure", () => Promise.reject(new Error("offline"))],
  ])("%s → denied: the page does not open and the search says why", async (_label, release) => {
    mount(release as () => Promise<Response>);
    const dlg = await searchFor(target);
    fireEvent.click(hitFor(dlg, target));
    expect(await within(dlg).findByRole("alert")).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 2, name: target })).toBeNull();
  }, T);

  it("a hidden module's title finds nothing (the scope is the released Set, the index the restricted manifest)", async () => {
    mount(() => res(200, materials([M01, M02])));
    const dlg = await searchFor("عناوين IP");
    expect(dlg.querySelectorAll("[data-search-hit]")).toHaveLength(0);
    expect(within(dlg).getByRole("status").textContent).toBe("لا توجد نتائج مطابقة.");
  }, T);
});

describe("fetchReleasedModuleIds", () => {
  it("returns the released ids for the course, an empty set when unlisted, and null when it cannot be established", async () => {
    globalThis.fetch = vi.fn(() => res(200, materials([M01, " " + M02 + " ", ""]))) as unknown as typeof fetch;
    expect([...(await fetchReleasedModuleIds("t", "791381"))!]).toEqual([M01, M02]);
    expect((await fetchReleasedModuleIds("t", "other"))!.size).toBe(0);
    globalThis.fetch = vi.fn(() => res(403, {})) as unknown as typeof fetch;
    expect(await fetchReleasedModuleIds("t", "791381")).toBeNull();
    globalThis.fetch = vi.fn(() => res(200, { ok: false })) as unknown as typeof fetch;
    expect(await fetchReleasedModuleIds("t", "791381")).toBeNull();
  });
  it("sends the student token, never another credential", async () => {
    const f = vi.fn((_u: RequestInfo | URL, _i?: RequestInit) => res(200, materials([M01])));
    globalThis.fetch = f as unknown as typeof fetch;
    await fetchReleasedModuleIds("tok-1", "791381");
    const headers = f.mock.calls[0][1]!.headers as Record<string, string>;
    expect(headers["x-student-token"]).toBe("tok-1");
    expect(headers.Authorization).toBe("Bearer tok-1");
  });
});

describe("static guard — no student code path searches \"all\"", () => {
  const SRC = join(process.cwd(), "src");
  const files = (dir: string): string[] => readdirSync(dir).flatMap(n => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) && !/\.test\./.test(n) ? [p] : [];
  });
  it("src/student/** and StudentPortal.tsx never pass \"all\" as a search scope or release set", () => {
    const studentFiles = [...files(join(SRC, "student")), join(SRC, "StudentPortal.tsx")];
    expect(studentFiles.length).toBeGreaterThan(10);
    const offenders = studentFiles.filter(f => /(searchScope|allowedModuleIds)\s*[:=]\s*\{?\s*["']all["']/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
  it("the student Reader passes an explicit Set built from its released ids", () => {
    const reader = readFileSync(join(SRC, "student", "StudentReader.tsx"), "utf8");
    expect(reader).toMatch(/searchScope=\{searchScope\}/);
    expect(reader).toMatch(/new Set\(allowedModuleIds/);
  });
});
