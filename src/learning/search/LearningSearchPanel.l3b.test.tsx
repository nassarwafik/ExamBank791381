// @vitest-environment happy-dom
// Phase 21E L3-B — the search panel: states (loading / unavailable / empty / no results / results / open error),
// grouping DOM, accessible highlighting, the polite live result count, keyboard navigation, and L3-7: the SAME UI runs
// unchanged on a swapped (stub) provider.
import { describe, expect, it, vi, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import manifest from "../content/791381/manifest";
import type { SearchProvider } from "../content/searchProvider";
import LearningSearchPanel from "./LearningSearchPanel";
import type { SearchHit, SearchProviderFactory, SearchSource } from "./searchModel";

afterEach(() => { cleanup(); vi.useRealTimers(); });
const course = manifest.courseId;
const source: SearchSource = { courseId: course, courseTitle: "كتاب " + course, manifest, allowedModuleIds: "all" };

function Host(props: { sources?: SearchSource[] | null; availability?: "ready" | "unavailable"; initial?: string; onOpen?: (h: SearchHit) => void; providerFactory?: SearchProviderFactory; openError?: string }) {
  const [q, setQ] = useState(props.initial ?? "");
  return (
    <LearningSearchPanel
      sources={props.sources === undefined ? [source] : props.sources}
      availability={props.availability}
      query={q}
      onQueryChange={setQ}
      onOpen={props.onOpen ?? (() => {})}
      providerFactory={props.providerFactory}
      openError={props.openError}
      autoFocus
    />
  );
}
const field = () => screen.getByRole("searchbox");
const status = () => screen.getByRole("status");
const hitButtons = () => [...document.querySelectorAll<HTMLButtonElement>("[data-search-hit]")];
const settle = async () => { await act(async () => { await new Promise(r => setTimeout(r, 80)); }); };

describe("L3-B search panel — states", () => {
  it("is a labelled search landmark; the field is focused on mount; an empty query shows a hint and announces nothing", async () => {
    render(<Host />);
    expect(screen.getByRole("search", { name: "البحث في المحتوى التعليمي" })).toBeTruthy();
    expect(document.activeElement).toBe(field());
    await settle();
    expect(status().textContent).toBe("");
    expect(screen.getByText(/اكتب كلمة من عنوان درس أو صفحة/)).toBeTruthy();
    expect(hitButtons()).toHaveLength(0);
  });

  it("sources still resolving → «loading», no result even with a query", async () => {
    render(<Host sources={null} initial="الشبكة" />);
    await settle();
    expect(status().textContent).toBe("جارٍ تجهيز البحث...");
    expect(hitButtons()).toHaveLength(0);
  });

  it("permissions unavailable → message, disabled field, no result", async () => {
    render(<Host availability="unavailable" initial="الشبكة" />);
    await settle();
    expect(status().textContent).toBe("البحث غير متاح الآن.");
    expect((field() as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(/لا تُعرض نتائج/)).toBeTruthy();
    expect(hitButtons()).toHaveLength(0);
  });

  it("permissions unavailable or still loading → submitting the form (Enter) opens nothing", () => {
    const onOpen = vi.fn();
    const { unmount } = render(<Host availability="unavailable" initial="الشبكة" onOpen={onOpen} />);
    fireEvent.submit(screen.getByRole("search"));
    unmount();
    render(<Host sources={null} initial="الشبكة" onOpen={onOpen} />);
    fireEvent.submit(screen.getByRole("search"));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("no match → empty state and «لا توجد نتائج مطابقة.» announced", async () => {
    render(<Host />);
    fireEvent.change(field(), { target: { value: "zzzzqqq" } });
    await settle();
    expect(status().textContent).toBe("لا توجد نتائج مطابقة.");
    expect(screen.getByText("لا توجد نتائج مطابقة")).toBeTruthy();
  });

  it("an open error is an alert", () => {
    render(<Host initial="الشبكة" openError="لم تعد هذه الصفحة متاحة لك" />);
    expect(screen.getByRole("alert").textContent).toContain("لم تعد هذه الصفحة متاحة لك");
  });
});

describe("L3-B search panel — results", () => {
  it("groups by module (heading) → lesson (labelled list), highlights matches with <mark>, shows the page ordinal, announces the count", async () => {
    render(<Host />);
    fireEvent.change(field(), { target: { value: "الشبكه" } });
    await settle();
    const n = hitButtons().length;
    expect(n).toBeGreaterThan(1);
    expect(status().textContent).toMatch(/نتيج|نتائج/);
    const firstModule = manifest.modules.find(m => m.lessons.some(l => l.pages.some(p => /شبك/.test(p.title))))!;
    expect(screen.getAllByRole("heading", { level: 3 }).map(h => h.textContent)).toContain(firstModule.title);
    const lists = screen.getAllByRole("list");
    expect(lists.every(l => l.getAttribute("aria-labelledby"))).toBe(true);
    expect(document.querySelectorAll("mark.eb-search-mark").length).toBeGreaterThan(0);
    expect(hitButtons()[0].textContent).toMatch(/الصفحة \d+ من 248/);
  });

  it("opens a result by click and by Enter in the field (first result)", () => {
    const onOpen = vi.fn();
    render(<Host onOpen={onOpen} initial="الشبكة" />);
    fireEvent.click(hitButtons()[0]);
    expect(onOpen).toHaveBeenCalledTimes(1);
    fireEvent.submit(screen.getByRole("search"));
    expect(onOpen).toHaveBeenCalledTimes(2);
    expect(onOpen.mock.calls[1][0].pageId).toBe(onOpen.mock.calls[0][0].pageId);   // Enter = the first result
    fireEvent.click(hitButtons()[1]);
    expect(onOpen.mock.calls[2][0].pageId).not.toBe(onOpen.mock.calls[0][0].pageId);
  });
});

describe("L3-B search panel — keyboard", () => {
  it("↓ from the field enters the results; ↓ / ↑ / Home / End move; ↑ on the first returns to the field", () => {
    render(<Host initial="الشبكة" />);
    const hits = hitButtons();
    expect(hits.length).toBeGreaterThan(2);
    fireEvent.keyDown(field(), { key: "ArrowDown" });
    expect(document.activeElement).toBe(hits[0]);
    fireEvent.keyDown(hits[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(hits[1]);
    fireEvent.keyDown(hits[1], { key: "End" });
    expect(document.activeElement).toBe(hits[hits.length - 1]);
    fireEvent.keyDown(hits[hits.length - 1], { key: "Home" });
    expect(document.activeElement).toBe(hits[0]);
    fireEvent.keyDown(hits[0], { key: "ArrowUp" });
    expect(document.activeElement).toBe(field());
  });

  it("Escape in a non-empty field clears it (and does not reach the host); in an empty field it does reach the host", () => {
    const hostEscape = vi.fn();
    render(<div onKeyDown={e => { if (e.key === "Escape") hostEscape(); }}><Host initial="الشبكة" /></div>);
    fireEvent.keyDown(field(), { key: "Escape" });
    expect((field() as HTMLInputElement).value).toBe("");
    expect(hostEscape).not.toHaveBeenCalled();
    fireEvent.keyDown(field(), { key: "Escape" });
    expect(hostEscape).toHaveBeenCalledTimes(1);
  });

  it("the clear button empties the query and returns focus to the field", () => {
    render(<Host initial="الشبكة" />);
    fireEvent.click(screen.getByRole("button", { name: "مسح البحث" }));
    expect((field() as HTMLInputElement).value).toBe("");
    expect(document.activeElement).toBe(field());
  });
});

describe("L3-7 — the UI runs unchanged on a swapped provider", () => {
  it("a stub second provider drives the SAME panel: its results render grouped, highlighted and openable", async () => {
    const page = manifest.modules[3].lessons[0].pages[0];
    const queries: string[] = [];
    const stub: SearchProviderFactory = (): SearchProvider => ({
      query(text, scope) {
        queries.push(text);
        if (scope.allowedModuleIds !== "all") return [];
        return [{ courseId: course, moduleId: manifest.modules[3].id, lessonId: manifest.modules[3].lessons[0].id, pageId: page.id, title: page.title, matchedField: "title", snippet: "full-text snippet" }];
      },
    });
    const onOpen = vi.fn();
    render(<Host providerFactory={stub} onOpen={onOpen} />);
    fireEvent.change(field(), { target: { value: "anything" } });
    await settle();
    expect(queries).toContain("anything");
    expect(hitButtons()).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 3, name: manifest.modules[3].title })).toBeTruthy();
    expect(status().textContent).toBe("نتيجة واحدة.");
    fireEvent.click(hitButtons()[0]);
    expect(onOpen.mock.calls[0][0].pageId).toBe(page.id);
    expect(within(hitButtons()[0]).getByText(new RegExp("الصفحة \\d+ من 248"))).toBeTruthy();
  });
});
