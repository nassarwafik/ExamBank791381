// @vitest-environment happy-dom
// Phase 3E — DOM rendering of the Unit-3 pages: IP addresses / IPv4 / IPv6 tokens render inside dir="ltr" code
// spans or dir="ltr" table cells (never reversed under RTL), the worksheet tables keep their RTL header order with
// LTR address columns and NEUTRAL (unchosen) answer cells that check in place, the octets activity lazy-loads four
// real buttons, the PDF-28 guided reveal starts with zero steps, and no exercise page exposes a free-text input, a
// check control or a pre-filled Correct/Incorrect UI.
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import LearningPageRenderer, { type ReaderPageHeader } from "./LearningPageRenderer";
import m07 from "../content/791381/modules/m07";
import type { ContentPage } from "../content/types";

afterEach(cleanup);

const pageBy = (id: string): ContentPage => m07.lessons.flatMap(l => l.pages).find(p => p.id === id)!;
const header = (p: ContentPage): ReaderPageHeader => ({
  courseId: "791381", pageTitle: p.title, moduleTitle: "عناوين IP", lessonTitle: "عنوان IP وبنية IPv4",
  position: { index: 1, total: 10 }, source: p.source,
});
const draw = (p: ContentPage) => render(<LearningPageRenderer header={header(p)} body={{ kind: "ready", page: p }} />);
const ltrCodes = (root: HTMLElement) => [...root.querySelectorAll("code[dir=ltr]")].map(c => c.textContent);
const ltrCells = (root: HTMLElement) => [...root.querySelectorAll(".learning-reader-table td[dir=ltr]")].map(c => c.textContent);

describe("Phase 3E — technical tokens render LTR in the DOM", () => {
  it("PDF 26: IPv4 / IPv6 and both example addresses are dir=ltr code spans with intact digit order", () => {
    const { container } = draw(pageBy("791381-m07-l01-p02"));
    const codes = ltrCodes(container);
    for (const tok of ["192.168.1.5", "2001:db8::1", "IPv4"]) expect(codes).toContain(tok);
    // the card titles are the pure-Latin tokens, intact and in order
    const terms = [...container.querySelectorAll(".learning-reader-list-item .learning-reader-list-term")].map(s => s.textContent);
    expect(terms).toEqual(["IPv4", "IPv6"]);
    expect(container.textContent).not.toContain("5.1.168.192");
    expect(container.textContent).not.toContain("1::8bd:1002");
  });

  it("PDF 27: the four-box range line and the three examples are LTR; the octets activity lazy-loads FOUR real buttons", async () => {
    const { container } = draw(pageBy("791381-m07-l01-p03"));
    const codes = ltrCodes(container);
    expect(codes).toContain("0-255 . 0-255 . 0-255 . 0-255");
    for (const ip of ["192.168.100.10", "100.200.10.20", "240.200.0.20"]) expect(codes).toContain(ip);
    expect(screen.getByText(/هناك قواعد إضافية سنراها في الشريحة التالية/)).toBeTruthy();   // the source warning
    const first = await screen.findByRole("button", { name: "القسم 1 من 4: 192" });          // lazy chunk resolved
    expect(first.getAttribute("aria-pressed")).toBe("true");
    const row = container.querySelector(".learning-octets-row")!;
    expect(row.getAttribute("dir")).toBe("ltr");
    expect([...row.querySelectorAll(".learning-octets-value")].map(v => v.textContent)).toEqual(["192", "168", "100", "10"]);
    expect(container.querySelector("input, textarea")).toBeNull();
  });

  it("PDF 28: the five rules render as a list; Localhost / APIPA / 169.254.x.x / 192.255.10.10 are LTR; guided reveal starts at step 0 and reveals rule 1 first", () => {
    const { container } = draw(pageBy("791381-m07-l01-p04"));
    const rules = container.querySelector("#m07-l01-p04-rules, [data-block-id='m07-l01-p04-rules']") ?? container.querySelector(".learning-reader-list.variant-plain");
    expect(rules).toBeTruthy();
    expect(within(rules as HTMLElement).getAllByRole("listitem").length).toBeGreaterThanOrEqual(5);
    const codes = ltrCodes(container);
    for (const tok of ["Localhost", "APIPA", "169.254.x.x", "192.255.10.10", "192.168.10.1", "192.168.10.255", "192.168.300.10"]) expect(codes).toContain(tok);
    // guided (built-in) — hidden steps until revealed; the first reveal is rule 1, in authored order
    expect(document.querySelectorAll(".learning-guided-step").length).toBe(0);
    expect(screen.getByText("الخطوة 0 من 5")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "اعرض الخطوة الأولى" }));
    const steps = document.querySelectorAll(".learning-guided-step");
    expect(steps.length).toBe(1);
    expect(steps[0].textContent).toContain("لا يبدأ العنوان بـ 0 أو 255.");
    // no PDF-29 training address leaks into the DOM of this page
    for (const addr of ["127.11.10.1", "169.169.10.10", "169.254.10.234"]) expect(container.textContent).not.toContain(addr);
  });

  it("PDF 29: interactive worksheet — العنوان first (RTL order), five LTR address cells, a neutral «اختر...» choice per row, السبب blank, no verdict and no key before a choice", () => {
    const { container } = draw(pageBy("791381-m07-l01-p05"));
    const heads = [...container.querySelectorAll("thead th")].map(th => th.textContent);
    expect(heads).toEqual(["العنوان", "صالح / غير صالح", "السبب"]);
    expect(ltrCells(container)).toEqual(["192.168.10.1", "192.255.10.10", "127.11.10.1", "169.169.10.10", "169.254.10.234"]);
    const rows = [...container.querySelectorAll("tbody tr")];
    expect(rows.length).toBe(5);
    const selects = [...container.querySelectorAll("tbody select")] as HTMLSelectElement[];
    expect(selects.length).toBe(5);
    for (const [i, r] of rows.entries()) {
      const cells = [...r.querySelectorAll("td")];
      expect(cells[1].querySelector("select")).toBe(selects[i]);
      expect(selects[i].value).toBe("");
      expect([...selects[i].options].map(o => o.textContent)).toEqual(["اختر...", "صالح", "غير صالح"]);   // the printed vocabulary only
      expect(cells[2].textContent).toBe("");                                                        // السبب stays blank
    }
    expect(selects[2].getAttribute("aria-label")).toBe("127.11.10.1 — صالح / غير صالح");
    expect(container.querySelector("[role=status]")).toBeNull();                                     // no verdict before a choice
    expect(container.textContent).not.toMatch(/✓|✕|صحيح|Correct|Incorrect|النتيجة:/);
    expect(container.innerHTML).not.toMatch(/key=|data-key|data-answer|data-expected/);              // the expected choice is not in the DOM
    expect(container.querySelector("input, textarea, [data-command='check']")).toBeNull();           // no free text, no check button
    expect(container.closest("body")!.querySelector(".learning-reader-tablewrap")).toBeTruthy();    // scrolls inside itself
  });

  it("PDF 29: choosing gives an immediate, retryable, non-colour-only verdict (127.11.10.1 → غير صالح); reset clears everything; nothing persists", () => {
    const { container } = draw(pageBy("791381-m07-l01-p05"));
    const selects = [...container.querySelectorAll("tbody select")] as HTMLSelectElement[];
    fireEvent.change(selects[2], { target: { value: "صالح" } });
    const cell = selects[2].closest("td") as HTMLElement;
    expect(within(cell).getByRole("status").textContent).toBe("✕ غير صحيح — حاول مرة أخرى");
    expect(within(cell).getByRole("status").querySelector("svg")).toBeTruthy();                       // icon + word, never colour-only
    expect(selects[2].className).toContain("is-wrong");
    expect(selects[2].disabled).toBe(false);                                                          // retry in place
    fireEvent.change(selects[2], { target: { value: "غير صالح" } });
    expect(within(cell).getByRole("status").textContent).toBe("✓ صحيح");
    expect(selects[2].className).toContain("is-right");
    fireEvent.change(selects[0], { target: { value: "صالح" } });                                     // 192.168.10.1 → صالح
    expect(within(selects[0].closest("td") as HTMLElement).getByRole("status").textContent).toBe("✓ صحيح");
    fireEvent.change(selects[4], { target: { value: "صالح" } });                                     // 169.254.10.234 (APIPA) → غير صالح
    expect(within(selects[4].closest("td") as HTMLElement).getByRole("status").textContent).toBe("✕ غير صحيح — حاول مرة أخرى");
    fireEvent.click(screen.getByRole("button", { name: "امسح الإجابات" }));
    expect(container.querySelector("[role=status]")).toBeNull();
    for (const s of selects) expect(s.value).toBe("");
    expect(container.innerHTML).not.toMatch(/key=|data-key/);
  });

  it("PDF 31: the private-range table cells are LTR (Class A/B/C, patterns, examples) with RTL header order", () => {
    const { container } = draw(pageBy("791381-m07-l02-p02"));
    expect([...container.querySelectorAll("thead th")].map(th => th.textContent)).toEqual(["الفئة", "العنوان الخاص", "مثال"]);
    const cells = ltrCells(container);
    for (const tok of ["Class A", "10.x.x.x", "10.0.0.1", "Class B", "172.16 - 172.31", "172.23.100.13", "Class C", "192.168.x.x", "192.168.100.6"]) expect(cells).toContain(tok);
    expect(screen.getByText(/بين 16 و 31 فقط/)).toBeTruthy();
    expect(ltrCodes(container)).toContain("192.168");
  });

  it("PDF 32: PC1–PC5 rows with LTR addresses, the خاص/عام column as a neutral choice, the 192.167 warning LTR; 192.167.100.2 → عام checks in place", () => {
    const { container } = draw(pageBy("791381-m07-l02-p03"));
    const cells = ltrCells(container);
    for (const tok of ["PC1", "192.167.100.2", "PC3", "172.16.32.30", "220.100.100.100", "9.10.11.12"]) expect(cells).toContain(tok);
    const selects = [...container.querySelectorAll("tbody select")] as HTMLSelectElement[];
    expect(selects.length).toBe(5);
    for (const s of selects) { expect(s.value).toBe(""); expect([...s.options].map(o => o.textContent)).toEqual(["اختر...", "خاص", "عام"]); }
    expect(selects[0].getAttribute("aria-label")).toBe("PC1 — خاص / عام");
    expect(container.querySelector("[role=status]")).toBeNull();                                     // classification not pre-filled
    expect(ltrCodes(container)).toContain("192.167");
    expect(container.querySelector("input, textarea")).toBeNull();
    expect(container.textContent).not.toMatch(/Correct|Incorrect|✓|✕/);
    fireEvent.change(selects[0], { target: { value: "خاص" } });                                       // the trap: 192.167 ≠ 192.168
    expect(within(selects[0].closest("td") as HTMLElement).getByRole("status").textContent).toBe("✕ غير صحيح — حاول مرة أخرى");
    fireEvent.change(selects[0], { target: { value: "عام" } });
    expect(within(selects[0].closest("td") as HTMLElement).getByRole("status").textContent).toBe("✓ صحيح");
    fireEvent.change(selects[1], { target: { value: "خاص" } });                                       // 10.100.10.10 → خاص
    expect(within(selects[1].closest("td") as HTMLElement).getByRole("status").textContent).toBe("✓ صحيح");
  });

  it("PDF 30 + 33: 8.8.8.8 / 192.168.1.5 and Static / Dynamic render as LTR spans", () => {
    const { container: c30 } = draw(pageBy("791381-m07-l02-p01"));
    for (const tok of ["8.8.8.8", "192.168.1.5"]) expect(ltrCodes(c30)).toContain(tok);
    cleanup();
    const { container: c33 } = draw(pageBy("791381-m07-l02-p04"));
    for (const tok of ["Static", "Dynamic"]) expect(ltrCodes(c33)).toContain(tok);
    expect(c33.innerHTML).not.toContain("<script");
  });
});
