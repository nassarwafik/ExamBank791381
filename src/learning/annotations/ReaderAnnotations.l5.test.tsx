// @vitest-environment happy-dom
// Phase L.5 — a student's PRIVATE annotations in the Reader, over the reader fixtures and an in-memory annotations client:
//   • the controls exist only when the host hands the Reader an annotations client (a student); a teacher preview has none
//     and makes no annotations request;
//   • «علامة مرجعية» toggles the current page's bookmark (aria-pressed follows the server's answer) and says so;
//   • «ملاحظاتي»: the privacy line; this page's note (save / delete / NOTE_MAX); this page's highlights (remove); every
//     bookmark, note and highlight in the book, each opening its page (and closing the panel); a failed write is an alert;
//     a failed read offers a retry;
//   • selecting a passage in the page offers «تظليل», which sends the collapsed quote for the current page;
//   • the page's highlights are painted through the Highlight API, and only where it exists;
//   • «طباعة الصفحة» prints.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import LearningReader from "../reader/LearningReader";
import LearningReaderWithTraining from "../training/LearningReaderWithTraining";
import { makeImmediateApi } from "../reader/readerFixtures";
import { AnnotationsError, NOTE_MAX, QUOTE_MAX, type AnnotationsClient, type ReaderAnnotations } from "./annotationsClient";
import { findQuoteRange, paintHighlights, HIGHLIGHT_NAME } from "./highlightRanges";

afterEach(() => { cleanup(); vi.restoreAllMocks(); window.getSelection()?.removeAllRanges(); try { localStorage.clear(); } catch { /* ignore */ } });
const AT = "2026-10-17T10:00:00.000Z";

function fakeClient(seed: Partial<ReaderAnnotations> = {}, over: Partial<AnnotationsClient> = {}) {
  let data: ReaderAnnotations = { bookmarks: [], notes: [], highlights: [], ...seed };
  let n = 0;
  const snap = () => JSON.parse(JSON.stringify(data)) as ReaderAnnotations;
  const c: AnnotationsClient = {
    get: vi.fn(async () => snap()),
    bookmark: vi.fn(async (_c: string, pageId: string, on: boolean) => {
      data.bookmarks = on ? [...data.bookmarks.filter(b => b.pageId !== pageId), { pageId, at: AT }] : data.bookmarks.filter(b => b.pageId !== pageId);
      return snap();
    }),
    note: vi.fn(async (_c: string, pageId: string, text: string) => {
      data.notes = data.notes.filter(x => x.pageId !== pageId);
      if (text.trim()) data.notes.push({ pageId, text: text.trim(), updatedAt: AT });
      return snap();
    }),
    highlight: vi.fn(async (_c: string, pageId: string, quote: string) => { data.highlights = [...data.highlights, { pageId, id: "h" + (++n), quote, createdAt: AT }]; return snap(); }),
    unhighlight: vi.fn(async (_c: string, pageId: string, id: string) => { data.highlights = data.highlights.filter(h => !(h.pageId === pageId && h.id === id)); return snap(); }),
    ...over,
  };
  return c;
}
const mount = (annotations: AnnotationsClient | null) => render(<LearningReader courseId="791381" onExit={vi.fn()} api={makeImmediateApi()} annotations={annotations} />);
const page = (name: string) => screen.findByRole("heading", { level: 2, name });
const notesButton = () => screen.getByRole("button", { name: "ملاحظاتي" });
const dialog = () => screen.getByRole("dialog", { name: "ملاحظاتي" });

describe("L.5 — who gets annotations", () => {
  it("a teacher preview (no client, or actor=teacher) has no annotation control; «طباعة الصفحة» is for everyone", async () => {
    mount(null);
    await page("صفحة غنية");
    expect(screen.queryByRole("button", { name: "علامة مرجعية" })).toBeNull();
    expect(screen.queryByRole("button", { name: "ملاحظاتي" })).toBeNull();
    const print = vi.fn();
    window.print = print;
    const printButton = await waitFor(() => { const b = screen.getByRole("button", { name: "طباعة الصفحة" }) as HTMLButtonElement; expect(b.disabled).toBe(false); return b; });
    fireEvent.click(printButton);
    expect(print).toHaveBeenCalledTimes(1);
    cleanup();
    const client = fakeClient();
    render(<LearningReaderWithTraining courseId="791381" api={makeImmediateApi()} onExit={vi.fn()} exitLabel="عودة" client={null} actor="teacher" annotations={client} />);
    await page("صفحة غنية");
    expect(screen.queryByRole("button", { name: "ملاحظاتي" })).toBeNull();
    expect(client.get).not.toHaveBeenCalled();
  });

  it("a student session forwards its client: one read on open", async () => {
    const client = fakeClient();
    render(<LearningReaderWithTraining courseId="791381" api={makeImmediateApi()} onExit={vi.fn()} exitLabel="عودة" client={null} actor="student" annotations={client} />);
    await page("صفحة غنية");
    expect(notesButton()).toBeTruthy();
    expect(client.get).toHaveBeenCalledTimes(1);
    expect(client.get).toHaveBeenCalledWith("791381");
  });
});

describe("L.5 — bookmarks", () => {
  it("toggles the current page's bookmark; aria-pressed follows the server; the outcome is announced", async () => {
    const client = fakeClient();
    mount(client);
    await page("صفحة غنية");
    const toggle = await waitFor(() => { const b = screen.getByRole("button", { name: "علامة مرجعية" }) as HTMLButtonElement; expect(b.disabled).toBe(false); return b; });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(toggle);
    await waitFor(() => expect(client.bookmark).toHaveBeenCalledWith("791381", "p1", true));
    const pressed = await screen.findByRole("button", { name: "إزالة العلامة المرجعية" });
    expect(pressed.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("status").textContent).toContain("أُضيفت الصفحة إلى علاماتك المرجعية");
    fireEvent.click(pressed);
    await waitFor(() => expect(client.bookmark).toHaveBeenLastCalledWith("791381", "p1", false));
    expect((await screen.findByRole("button", { name: "علامة مرجعية" })).getAttribute("aria-pressed")).toBe("false");
  });

  it("a refused write is an alert and the state does not change", async () => {
    const client = fakeClient({}, { bookmark: vi.fn(async () => { throw new AnnotationsError(403, "هذه الصفحة غير متاحة لصفك بعد."); }) });
    mount(client);
    await page("صفحة غنية");
    const toggle = await waitFor(() => { const b = screen.getByRole("button", { name: "علامة مرجعية" }) as HTMLButtonElement; expect(b.disabled).toBe(false); return b; });
    fireEvent.click(toggle);
    expect((await screen.findByRole("alert")).textContent).toContain("هذه الصفحة غير متاحة لصفك بعد.");
    expect(screen.getByRole("button", { name: "علامة مرجعية" }).getAttribute("aria-pressed")).toBe("false");
  });
});

describe("L.5 — «ملاحظاتي»", () => {
  it("says the notes are private; saves, replaces and deletes this page's note; over NOTE_MAX cannot be saved", async () => {
    const client = fakeClient();
    mount(client);
    await page("صفحة غنية");
    await waitFor(() => expect(client.get).toHaveBeenCalled());
    fireEvent.click(notesButton());
    expect(dialog().textContent).toContain("لا يراها المعلم ولا الطلاب الآخرون");
    const box = await within(dialog()).findByRole("textbox", { name: "ملاحظتي على هذه الصفحة" }) as HTMLTextAreaElement;
    const save = () => within(dialog()).getByRole("button", { name: "حفظ الملاحظة" }) as HTMLButtonElement;
    expect(save().disabled).toBe(true);                                                   // nothing typed yet
    fireEvent.change(box, { target: { value: "x".repeat(NOTE_MAX + 1) } });
    expect(save().disabled).toBe(true);
    expect(box.getAttribute("aria-invalid")).toBe("true");
    fireEvent.change(box, { target: { value: "راجع الفرق بين Access و Trunk" } });
    fireEvent.click(save());
    await waitFor(() => expect(client.note).toHaveBeenCalledWith("791381", "p1", "راجع الفرق بين Access و Trunk"));
    expect((await within(dialog()).findByRole("status")).textContent).toContain("حُفظت ملاحظتك");
    fireEvent.click(await within(dialog()).findByRole("button", { name: "حذف الملاحظة" }));
    await waitFor(() => expect(client.note).toHaveBeenLastCalledWith("791381", "p1", ""));
    await waitFor(() => expect(within(dialog()).queryByRole("button", { name: "حذف الملاحظة" })).toBeNull());
  });

  it("lists every bookmark, note and highlight in the book; each opens its page and closes the panel; this page's highlight can be removed", async () => {
    const client = fakeClient({
      bookmarks: [{ pageId: "p3", at: AT }],
      notes: [{ pageId: "p5", text: "ملاحظة الصفحة الخامسة", updatedAt: AT }],
      highlights: [{ pageId: "p1", id: "h9", quote: "يربط جهازًا واحدًا", createdAt: AT }, { pageId: "p-gone", id: "hx", quote: "مقطع", createdAt: AT }],
    });
    mount(client);
    await page("صفحة غنية");
    await waitFor(() => expect(client.get).toHaveBeenCalled());
    fireEvent.click(notesButton());
    const d = dialog();
    const section = (name: RegExp) => within(d).getByRole("heading", { level: 3, name }).closest("section") as HTMLElement;
    expect(within(section(/علاماتي المرجعية/)).getByRole("button", { name: /صفحة ٣/ })).toBeTruthy();
    expect(within(section(/ملاحظاتي في الكتاب/)).getByRole("button", { name: /صفحة ٥/ }).textContent).toContain("ملاحظة الصفحة الخامسة");
    const hl = within(section(/النصوص المظلّلة/)).getAllByRole("button");
    expect(hl).toHaveLength(1);                                                           // a page this reader cannot open is not listed
    fireEvent.click(within(d).getByRole("button", { name: /إزالة تظليل «يربط جهازًا واحدًا»/ }));
    await waitFor(() => expect(client.unhighlight).toHaveBeenCalledWith("791381", "p1", "h9"));
    fireEvent.click(within(section(/علاماتي المرجعية/)).getByRole("button", { name: /صفحة ٣/ }));
    await page("صفحة ٣");
    expect(screen.queryByRole("dialog", { name: "ملاحظاتي" })).toBeNull();
  });

  it("a failed read is an alert with a retry; the retry reads again", async () => {
    let fail = true;
    const client = fakeClient({}, { get: vi.fn(async () => (fail ? null : { bookmarks: [], notes: [], highlights: [] })) });
    mount(client);
    await page("صفحة غنية");
    fireEvent.click(notesButton());
    expect((await within(dialog()).findByRole("alert")).textContent).toContain("تعذّر تحميل ملاحظاتك");
    fail = false;
    fireEvent.click(within(dialog()).getByRole("button", { name: "إعادة المحاولة" }));
    await within(dialog()).findByRole("textbox", { name: "ملاحظتي على هذه الصفحة" });
    expect(client.get).toHaveBeenCalledTimes(2);
  });
});

describe("L.5 — highlighting a selected passage", () => {
  function selectIn(node: Node, start: number, end: number) {
    const range = document.createRange();
    range.setStart(node, start); range.setEnd(node, end);
    const sel = window.getSelection()!;
    sel.removeAllRanges(); sel.addRange(range);
    act(() => { document.dispatchEvent(new Event("selectionchange")); });
  }
  const textNode = (needle: string) => {
    const walker = document.createTreeWalker(document.querySelector(".learning-reader-page")!, 4);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if ((n as Text).data.includes(needle)) return n as Text;
    throw new Error("text not found: " + needle);
  };

  it("a selection inside the page offers «تظليل», which sends the collapsed quote for the current page", async () => {
    const client = fakeClient();
    mount(client);
    await page("صفحة غنية");
    await waitFor(() => expect(client.get).toHaveBeenCalled());
    const node = textNode("يربط جهازًا واحدًا");
    const at = node.data.indexOf("يربط");
    selectIn(node, at, at + "يربط جهازًا واحدًا".length);
    fireEvent.click(await screen.findByRole("button", { name: "تظليل" }));
    await waitFor(() => expect(client.highlight).toHaveBeenCalledWith("791381", "p1", "يربط جهازًا واحدًا"));
  });

  it("a selection outside the page offers nothing; a passage over QUOTE_MAX asks for a shorter one", async () => {
    const client = fakeClient();
    mount(client);
    await page("صفحة غنية");
    await waitFor(() => expect(client.get).toHaveBeenCalled());
    const bookTitle = document.querySelector(".learning-reader-topbar .learning-reader-booktitle")!.firstChild!;   // the toolbar, not the page
    selectIn(bookTitle, 0, 4);
    expect(window.getSelection()!.toString().length).toBe(4);
    expect(screen.queryByRole("group", { name: "المقطع المحدد" })).toBeNull();
    const long = document.createElement("p");
    long.textContent = "ن".repeat(QUOTE_MAX + 5);
    document.querySelector(".learning-reader-page")!.appendChild(long);
    selectIn(long.firstChild!, 0, QUOTE_MAX + 5);
    expect((await screen.findByRole("group", { name: "المقطع المحدد" })).textContent).toContain("حدّد مقطعًا أقصر");
    expect(screen.queryByRole("button", { name: "تظليل" })).toBeNull();
    long.remove();
  });
});

describe("L.5 — locating and painting a quote (pure DOM)", () => {
  function build(html: string) { const d = document.createElement("article"); d.innerHTML = html; document.body.appendChild(d); return d; }
  it("matches across inline elements and block boundaries, collapses whitespace, ignores controls; absent → null", () => {
    const root = build("<h2>عنوان</h2><p>منفذ <span>Access</span>   يربط\n جهازًا</p><p>واحدًا هنا</p><button>يربط جهازًا</button>");
    const r1 = findQuoteRange(root, "منفذ Access يربط جهازًا");
    expect(r1?.toString().replace(/\s+/g, " ")).toBe("منفذ Access يربط جهازًا");
    const r2 = findQuoteRange(root, "جهازًا واحدًا");                                     // across two paragraphs
    expect(r2).not.toBeNull();
    expect(findQuoteRange(root, "عنوان منفذ")).not.toBeNull();                              // heading → paragraph boundary is a space
    expect(findQuoteRange(root, "غير موجود")).toBeNull();
    const onlyButton = build("<p>نص</p><button>زر خاص</button>");
    expect(findQuoteRange(onlyButton, "زر خاص")).toBeNull();
    root.remove(); onlyButton.remove();
  });

  it("paints through CSS.highlights when the API exists, clears on undo, and is a safe no-op without it", () => {
    const root = build("<p>الشبكة مجموعة أجهزة</p>");
    const registry = new Map<string, unknown>();
    class FakeHighlight { ranges: Range[]; constructor(...r: Range[]) { this.ranges = r; } }
    const g = globalThis as unknown as { CSS?: unknown; Highlight?: unknown };
    const saved = { CSS: g.CSS, Highlight: g.Highlight };
    g.CSS = { highlights: { set: (k: string, v: unknown) => registry.set(k, v), delete: (k: string) => registry.delete(k) } };
    g.Highlight = FakeHighlight;
    try {
      const painted = paintHighlights(root, ["مجموعة", "غائب"]);
      expect(painted.found).toBe(1);
      expect((registry.get(HIGHLIGHT_NAME) as FakeHighlight).ranges.map(r => r.toString())).toEqual(["مجموعة"]);
      painted.clear();
      expect(registry.has(HIGHLIGHT_NAME)).toBe(false);
      g.Highlight = undefined;
      expect(() => paintHighlights(root, ["مجموعة"])).not.toThrow();
      expect(registry.size).toBe(0);
    } finally { g.CSS = saved.CSS; g.Highlight = saved.Highlight; root.remove(); }
  });
});
