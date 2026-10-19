// @vitest-environment happy-dom
// Phase U.1 — Classes & Students page structure. The layout itself is measured in a real Chromium
// (scripts/check-classes-students-browser-u1.mjs); these tests pin the behaviour and the markup / style contract it relies on:
//   - Dialog placement="end": a side sheet (root .is-sheet) with the same modal contract (Escape, focus return); the default
//     stays a centred dialog; the student dialog opens as the sheet and its two history tables are focusable scroll regions;
//   - the class bar: the view switch and the filter share one toolbar row; the selected card is kept in view by scrolling the
//     LIST (down / up in the grid, sideways in the RTL phone strip, aligned to the strip's start), never the page;
//   - the roster row carries what the compact phone card needs (family name on the name, per-column classes);
//   - the stylesheet: one column, no sticky class column, single-line search fields, the phone strip and cards, the sheet.
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import { useState } from "react";
import Dialog from "../ui/Dialog";
import StudentDialog from "./StudentDialog";
import ClassesPane, { type ClassesPaneProps } from "./ClassesPane";
import RosterPane, { type RosterPaneProps } from "./RosterPane";
import type { Classroom } from "./types";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("U.1 — Dialog placement", () => {
  function Host({ placement }: { placement?: "center" | "end" }) {
    const [open, setOpen] = useState(false);
    return <><button type="button" onClick={() => setOpen(true)}>فتح</button><Dialog open={open} title="التفاصيل" onClose={() => setOpen(false)} placement={placement}><button type="button">داخل</button></Dialog></>;
  }
  it("placement=\"end\" renders a side sheet that keeps the modal contract: Escape closes it and focus returns to the opener", async () => {
    render(<Host placement="end" />);
    const opener = screen.getByRole("button", { name: "فتح" });
    opener.focus();
    fireEvent.click(opener);
    const dialog = await screen.findByRole("dialog", { name: "التفاصيل" });
    expect(dialog.closest(".eb-dialog-root")?.className).toContain("is-sheet");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(opener);
  });
  it("the default placement is the centred dialog (no sheet class)", async () => {
    render(<Host />);
    fireEvent.click(screen.getByRole("button", { name: "فتح" }));
    const dialog = await screen.findByRole("dialog", { name: "التفاصيل" });
    expect(dialog.closest(".eb-dialog-root")?.className).not.toContain("is-sheet");
  });
  it("the student dialog opens as the side sheet; its two history tables are named, focusable scroll regions", () => {
    const noop = () => {};
    const profile = {
      student: { userId: "u1", code: "S1", identityNumber: "123456789", firstName: "ليان", familyName: "خالد", displayName: "ليان خالد", classId: "c1", active: true, archived: false, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "", lastLoginAt: "", submittedAssignmentsCount: 0, likesCount: 0 },
      classroom: { classId: "c1", name: "الحادي عشر", grade: "11", schoolYear: "2026" },
      stats: { assigned: 0, completed: 0, pending: 0, average: null, lastLoginAt: "" },
      assignments: [], submittedAssignmentsCount: 0, submittedAssignments: [],
    };
    render(<StudentDialog profile={profile as never} section="summary" onClose={noop} busy={false} suspended={false} passwordReveal={null} onResetPassword={noop} onCopyPassword={noop} onReview={noop} onAllowRetry={noop} deadlineFor={null} deadlineValue="" onDeadlineValue={noop} onOpenDeadline={noop} onCloseDeadline={noop} onSaveDeadline={noop} onClearDeadline={noop} fmtDate={v => v} />);
    const dialog = screen.getByRole("dialog", { name: "ليان خالد" });
    expect(dialog.closest(".eb-dialog-root")?.className).toContain("is-sheet");
    for (const name of ["جدول واجبات الصف الحالي", "جدول سجل الواجبات المسلّمة"]) {
      const region = screen.getByRole("region", { name });
      expect(region.className).toContain("students-table-wrap");
      expect(region.getAttribute("tabindex")).toBe("0");
      expect(region.querySelector("table")).not.toBeNull();
    }
  });
});

const cls = (classId: string, name: string): Classroom => ({ classId, name, grade: "11", schoolYear: "2026", active: true, status: "active", studentCount: 3, createdAt: "2026-01-01" } as Classroom);
const CLASSES = Array.from({ length: 8 }, (_, i) => cls("c" + i, "الصف " + (i + 1)));
function paneProps(selectedClassId: string, extra: Partial<ClassesPaneProps> = {}): ClassesPaneProps {
  return { classes: CLASSES, view: "active", onViewChange: vi.fn(), activeCount: 8, archivedCount: 0, selectedClassId, onSelect: vi.fn(), projects: [], projectTitle: c => c, isGraduationEligible: () => false, onToggleProject: vi.fn(), onToggleArchive: vi.fn(), onGraduate: vi.fn(), onCreate: vi.fn(), onRefresh: vi.fn(), loading: false, busy: false, fmtDate: v => v, ...extra };
}
const rect = (r: { top: number; bottom: number; left: number; right: number }) => ({ ...r, x: r.left, y: r.top, width: r.right - r.left, height: r.bottom - r.top, toJSON: () => r }) as DOMRect;
/** Geometry for the list and the cards: `cardAt(index)` gives each card's rectangle (the list's own rectangle is fixed). */
function layout(list: { top: number; bottom: number; left: number; right: number }, cardAt: (i: number) => { top: number; bottom: number; left: number; right: number }, direction = "ltr") {
  const real = Element.prototype.getBoundingClientRect;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    if (this.classList.contains("eb-class-list")) return rect(list);
    if (this.classList.contains("eb-class-row")) return rect(cardAt([...this.parentElement!.children].indexOf(this)));
    return real.call(this);
  });
  const realStyle = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation(((el: Element, pseudo?: string | null) => {
    const style = realStyle(el, pseudo);
    return el.classList.contains("eb-class-list") ? ({ ...style, direction } as CSSStyleDeclaration) : style;
  }) as typeof window.getComputedStyle);
}

describe("U.1 — the class bar", () => {
  it("the view switch and the class filter share one toolbar row", () => {
    render(<ClassesPane {...paneProps("c0")} />);
    const toolbar = document.querySelector(".eb-classes-pane > .eb-class-toolbar") as HTMLElement;
    expect(toolbar).not.toBeNull();
    expect(toolbar.querySelector(".eb-segmented[role=group]")).not.toBeNull();
    expect(toolbar.querySelector(".eb-class-filter input[type=search]")).not.toBeNull();
  });
  it("a selected card below the visible rows is scrolled into view inside the list; the page is not scrolled", () => {
    // two rows of 80 px visible (list 0..170); card i sits on row ⌊i / 3⌋
    layout({ top: 0, bottom: 170, left: 0, right: 900 }, i => ({ top: Math.floor(i / 3) * 88, bottom: Math.floor(i / 3) * 88 + 80, left: 0, right: 300 }));
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const { rerender } = render(<ClassesPane {...paneProps("c0")} />);
    const list = document.querySelector(".eb-class-list") as HTMLElement;
    expect(list.scrollTop).toBe(0);                                      // the first card is visible: nothing moves
    rerender(<ClassesPane {...paneProps("c7")} />);                      // row 3 (176..256) → 86 px down
    expect(list.scrollTop).toBe(256 - 170);
    expect(scrollTo).not.toHaveBeenCalled();
  });
  it("a card above the visible rows scrolls the list back up", () => {
    // the list was scrolled down by 100 px: card 0 now sits at 40..120 above the list's 100..270 window
    layout({ top: 100, bottom: 270, left: 0, right: 900 }, i => (i === 0 ? { top: 40, bottom: 120, left: 0, right: 300 } : { top: 130, bottom: 210, left: 0, right: 300 }));
    const { rerender } = render(<ClassesPane {...paneProps("c1")} />);
    const list = document.querySelector(".eb-class-list") as HTMLElement;
    list.scrollTop = 100;
    rerender(<ClassesPane {...paneProps("c0")} />);
    expect(list.scrollTop).toBe(100 - 60);
  });
  it("RTL phone strip: a card half outside the strip is aligned to the strip's start (its right edge), a snap position", () => {
    layout({ top: 0, bottom: 120, left: 34, right: 358 }, i => (i === 1 ? { top: 0, bottom: 110, left: -50, right: 150 } : { top: 0, bottom: 110, left: 160, right: 356 }), "rtl");
    render(<ClassesPane {...paneProps("c1")} />);
    const list = document.querySelector(".eb-class-list") as HTMLElement;
    expect(list.scrollLeft).toBe(150 - 358);
  });
  it("LTR: the same card is aligned to the strip's left edge", () => {
    layout({ top: 0, bottom: 120, left: 34, right: 358 }, () => ({ top: 0, bottom: 110, left: 300, right: 500 }), "ltr");
    render(<ClassesPane {...paneProps("c2")} />);
    expect((document.querySelector(".eb-class-list") as HTMLElement).scrollLeft).toBe(300 - 34);
  });
});

describe("U.1 — the roster row carries the compact phone card", () => {
  it("the name carries the family name for the card; the family / status / login / tasks cells are classed", () => {
    const student = { userId: "u1", code: "S1", identityNumber: "123456789", firstName: "ليان", familyName: "خالد", displayName: "ليان خالد", classId: "c1", active: true, archived: false, createdAt: "", updatedAt: "", lastLoginAt: "", submittedAssignmentsCount: 2, likesCount: 0 };
    const noop = () => {};
    const props = {
      classroom: cls("c1", "الحادي عشر"), classActive: true, students: [student], visibleStudents: [student], stats: { total: 1, active: 1, disabled: 0, archived: 0, neverLogged: 1 },
      loading: false, busy: false, searchText: "", onSearch: noop, statusFilter: "all", onStatusFilter: noop, sortKey: "firstName", sortAsc: true, onSort: noop,
      selectedIds: [], onToggleSelected: noop, onToggleSelectVisible: noop, onClearSelection: noop, onAddStudent: noop, onImport: noop, onRefresh: noop, onExportCsv: noop,
      onOpenProfile: noop, onOpenHistory: noop, onEdit: noop, onCopyIdentity: noop, onToggleActive: noop, onArchive: noop, onDelete: noop,
      bulk: { targetClasses: [], targetClassId: "", onTargetChange: noop, onAction: noop }, credentialBox: null, onCopyCredentialBox: noop, onHideCredentialBox: noop,
      credentialBatch: null, onToggleBatch: noop, onDownloadBatch: noop, onDiscardBatch: noop, onCopyCredential: noop, bulkErrors: [],
      statusLabel: () => "فعّال", fmtDate: (v: string) => v, splitName: () => ({ firstName: "", familyName: "" }),
    } as unknown as RosterPaneProps;
    render(<RosterPane {...props} />);
    const row = document.querySelector(".eb-roster-table tbody tr") as HTMLElement;
    const name = row.querySelector("td.eb-col-name strong") as HTMLElement;
    expect(name.textContent).toBe("ليان");                               // the DOM text stays the first name (desktop column)
    expect(name.getAttribute("data-family")).toBe("خالد");               // the phone card appends it (CSS ::after)
    expect(row.querySelector("td.eb-col-family")?.textContent).toBe("خالد");
    expect(row.querySelector("td.eb-col-status")?.textContent).toBe("فعّال");
    expect(row.querySelector("td.eb-col-login")?.textContent).toBe("لم يدخل بعد");
    expect(row.querySelector("td.eb-col-tasks")?.textContent).toContain("الواجبات (2)");
  });
});

describe("U.1 — style contract", () => {
  const read = (f: string) => readFileSync(path.join(process.cwd(), "src", f), "utf8");
  const css = read("page-parts.css"), ui = read("ui/ui.css");
  const phone = css.slice(css.indexOf("@media (max-width:767px)"));
  const rule = (sheet: string, selector: string) => { const i = sheet.indexOf(selector + "{"); return i < 0 ? "" : sheet.slice(i, sheet.indexOf("}", i) + 1); };
  it("one column at every width; the class pane is no longer a sticky side column", () => {
    expect(rule(css, ".eb-students-layout")).toContain("grid-template-columns:minmax(0,1fr);");
    expect(css).not.toMatch(/\.eb-students-layout\{ grid-template-columns:\d+px/);
    expect(css).not.toMatch(/\.eb-classes-pane\{[^}]*position:sticky/);
  });
  it("the class filter is a row item of the toolbar; the class list is a bounded grid of cards", () => {
    expect(rule(css, ".eb-class-toolbar")).toContain("display:flex; flex-wrap:wrap;");
    expect(rule(css, ".eb-class-toolbar .eb-class-filter")).toContain("flex:1 1 220px;");
    const list = rule(css, ".eb-class-list");
    expect(list).toContain("display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr));");
    expect(list).toContain("max-block-size:180px; overflow:auto;");
  });
  it("phone: the class strip, a single-line roster search and the compact card (family name, hidden family column, actions in the corner)", () => {
    expect(phone).toContain(".eb-class-list{ grid-template-columns:none; grid-auto-flow:column;");
    expect(phone).toContain("scroll-snap-type:x proximity;");
    expect(phone).toContain(".eb-roster-toolbar .eb-search-field{ flex:0 0 auto; min-width:0; }");
    expect(phone).toContain(".eb-roster-table tbody td.eb-col-name strong[data-family]::after{ content:\" \" attr(data-family); }");
    expect(phone).toContain(".eb-roster-table tbody td.eb-col-family{ display:none; }");
    expect(phone).toMatch(/\.eb-roster-table tbody td\.eb-col-actions\{ position:absolute;/);
  });
  it("the side sheet: inline end, full height; a bottom sheet on a phone", () => {
    expect(ui).toContain(".eb-dialog-root.is-sheet { justify-content: flex-end; align-items: stretch; padding: 0; }");
    expect(ui).toContain(".eb-dialog-root.is-sheet .eb-dialog { width: min(640px, 100%); max-height: none;");
    expect(ui.slice(ui.indexOf("U.1 — on a phone the side sheet"))).toContain(".eb-dialog-root.is-sheet { padding: var(--eb-space-2) 0 0; align-items: flex-end; }");
  });
});
