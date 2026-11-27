// @vitest-environment happy-dom
//
// Phase T13 — the owner's two binary-conversion aids: «صناديق التحويل» (place values above empty boxes; the student writes 0 / 1
// and computes alone, the tool computes nothing) and «قائمة التحويل من السادس عشر إلى الثنائي» (the reference list 0 – F).
import { describe, it, expect, afterEach, vi } from "vitest";
import { createRequire } from "node:module";
import { render, cleanup, fireEvent, screen, within } from "@testing-library/react";
import StudentToolDock from "./StudentToolDock";
import StudentToolsEditor from "./StudentToolsEditor";
import { validateStudentTools, defaultStudentToolConfig, STUDENT_TOOL_IDS, type StudentToolsSpecV1 } from "./studentToolsSpec";
import { studentToolCatalogEntry, studentToolsSummary } from "./studentToolsCatalog";
import { questionRiskFor } from "./studentToolsRisk";
import { placeValues, boxDigit, boxRows, HEX_BINARY_ROWS } from "./placeValueBoxes";

const apiSpec = createRequire(import.meta.url)("../../api/src/lib/shared-finalization/studentTools/studentToolsSpec.js") as { validateStudentTools: typeof validateStudentTools };
afterEach(cleanup);

const spec = (...tools: unknown[]) => ({ version: 1, tools });
const ok = (v: unknown) => validateStudentTools(v).ok;

describe("T13 contract (additive within version 1)", () => {
  it("both ids join the contract after every earlier tool, with their defaults", () => {
    // their exact place: after the eleven earlier ids (T14's csharpEditor and AUTO-A4's automataLab were added after them, additively)
    expect(STUDENT_TOOL_IDS.slice(11, 13)).toEqual(["placeValueBoxes", "hexBinaryTable"]);
    expect(STUDENT_TOOL_IDS.slice(13)).toEqual(["csharpEditor", "automataLab", "networkLab", "diagramEditor"]);   // N1 — the network lab, DG1 — the diagram editor, additively
    expect(defaultStudentToolConfig("placeValueBoxes")).toEqual({ id: "placeValueBoxes", width: 8 });
    expect(defaultStudentToolConfig("hexBinaryTable")).toEqual({ id: "hexBinaryTable", showDecimal: true });
  });
  it("the boxes accept 4, 8 or 16 and nothing else; closed keys", () => {
    for (const w of [4, 8, 16]) expect(validateStudentTools(spec({ id: "placeValueBoxes", width: w }))).toMatchObject({ ok: true, value: spec({ id: "placeValueBoxes", width: w }) });
    for (const w of [0, 2, 5, 12, 32, "8", null, undefined]) expect(ok(spec({ id: "placeValueBoxes", width: w }))).toBe(false);
    expect(ok(spec({ id: "placeValueBoxes", width: 8, total: true }))).toBe(false);
    expect(ok(spec({ id: "placeValueBoxes" }))).toBe(false);
  });
  it("the hex list needs a boolean showDecimal; closed keys", () => {
    expect(ok(spec({ id: "hexBinaryTable", showDecimal: false }))).toBe(true);
    for (const v of ["true", 1, null, undefined]) expect(ok(spec({ id: "hexBinaryTable", showDecimal: v }))).toBe(false);
    expect(ok(spec({ id: "hexBinaryTable", showDecimal: true, range: "full" }))).toBe(false);
  });
  it("the API's generated copy decides exactly the same", () => {
    for (const v of [spec({ id: "placeValueBoxes", width: 16 }), spec({ id: "placeValueBoxes", width: 5 }), spec({ id: "hexBinaryTable", showDecimal: true }), spec({ id: "hexBinaryTable" })])
      expect(apiSpec.validateStudentTools(v)).toEqual(validateStudentTools(v));
  });
  it("an exam spec written before T13 keeps its exact value", () => {
    const before = spec({ id: "baseConverter", bases: [2, 16], showSteps: false }, { id: "bitwiseCalculator", width: 8 });
    expect(validateStudentTools(before)).toMatchObject({ ok: true, value: before });
  });
});

describe("T13 helpers, catalog and answer risk", () => {
  it("place values, the 0 / 1 keystroke filter and the rows of the boxes", () => {
    expect(placeValues(8)).toEqual([128, 64, 32, 16, 8, 4, 2, 1]);
    expect(placeValues(4)).toEqual([8, 4, 2, 1]);
    expect(placeValues(16)[0]).toBe(32768);
    expect(["1", "0", "01", "10", "2", "a", "", "12"].map(boxDigit)).toEqual(["1", "0", "1", "0", "", "", "", "1"]);
    expect(boxRows(16).map(r => r.length)).toEqual([8, 8]);
    expect(boxRows(4)).toEqual([[8, 4, 2, 1]]);
  });
  it("the hex list is 0 – F with 4-bit binary", () => {
    expect(HEX_BINARY_ROWS).toHaveLength(16);
    expect(HEX_BINARY_ROWS.map(r => r.hex).join("")).toBe("0123456789ABCDEF");
    expect(HEX_BINARY_ROWS[10]).toEqual({ hex: "A", bin: "1010", dec: 10 });
    expect(HEX_BINARY_ROWS[0].bin).toBe("0000");
    expect(HEX_BINARY_ROWS[15]).toEqual({ hex: "F", bin: "1111", dec: 15 });
  });
  it("catalog names and the start-screen summary", () => {
    expect(studentToolCatalogEntry("placeValueBoxes").label).toBe("صناديق التحويل");
    expect(studentToolCatalogEntry("hexBinaryTable").label).toBe("قائمة التحويل من السادس عشر إلى الثنائي");
    expect(studentToolsSummary({ tools: [{ id: "placeValueBoxes" }, { id: "hexBinaryTable" }] })).toEqual(["صناديق التحويل", "قائمة التحويل من السادس عشر إلى الثنائي"]);
  });
  it("the hex list names hex questions; the boxes never name a question (they compute nothing)", () => {
    const q = (text: string) => ({ examQuestionId: "q", presentationType: "shortAnswer", text });
    for (const t of ["حوّل العدد (3F)16 إلى النظام الثنائي", "ما مقابل الرقم السادس عشر B بالثنائي؟", "Convert 0x2A to binary", "hex digit"]) expect(questionRiskFor("hexBinaryTable", q(t))).toBe(true);
    expect(questionRiskFor("hexBinaryTable", q("حوّل العدد 13 إلى النظام الثنائي"))).toBe(false);
    for (const t of ["حوّل العدد 200 إلى النظام الثنائي", "حوّل (3F)16 إلى الثنائي"]) expect(questionRiskFor("placeValueBoxes", q(t))).toBe(false);
  });
});

const DOCK = spec({ id: "placeValueBoxes", width: 8 }, { id: "hexBinaryTable", showDecimal: true });
const openTool = (name: string) => {
  fireEvent.click(screen.getByTestId("student-tools-button"));
  fireEvent.click(within(screen.getByRole("group", { name: "الأدوات المسموحة" })).getByRole("button", { name }));
};
const box = (v: number) => screen.getByRole("textbox", { name: "صندوق المنزلة " + v }) as HTMLInputElement;

describe("T13 the student's conversion boxes", () => {
  it("shows 128 … 1 above empty boxes; a typed 0 / 1 moves to the next box; nothing is computed", () => {
    render(<StudentToolDock studentTools={DOCK} sectionId="s1" />);
    openTool("صناديق التحويل");
    const panel = screen.getByTestId("tool-placeValueBoxes");
    expect(within(panel).getAllByRole("columnheader").map(h => h.textContent)).toEqual(["128", "64", "32", "16", "8", "4", "2", "1"]);
    expect([128, 64, 32, 16, 8, 4, 2, 1].map(v => box(v).value)).toEqual(Array(8).fill(""));
    // The document's example: 0 1 1 1 1 0 1 1.
    "01111011".split("").forEach((d, i) => fireEvent.change(box([128, 64, 32, 16, 8, 4, 2, 1][i]), { target: { value: d } }));
    expect([128, 64, 32, 16, 8, 4, 2, 1].map(v => box(v).value).join("")).toBe("01111011");
    expect(panel.textContent).not.toMatch(/123|=\s*\d/); // no total anywhere (0111 1011 is 123)
    fireEvent.change(box(128), { target: { value: "1" } });
    expect(document.activeElement).toBe(box(64));
  });
  it("refuses any digit but 0 / 1; Backspace on an empty box goes back; «مسح الصناديق» empties them all", () => {
    render(<StudentToolDock studentTools={DOCK} sectionId="s1" />);
    openTool("صناديق التحويل");
    fireEvent.change(box(4), { target: { value: "7" } });
    expect(box(4).value).toBe("");
    fireEvent.change(box(4), { target: { value: "1" } });
    fireEvent.keyDown(box(1), { key: "Backspace" });
    expect(box(1).value).toBe("");
    fireEvent.keyDown(box(2), { key: "Backspace" });
    expect(document.activeElement).toBe(box(4));
    expect(box(4).value).toBe("");
    fireEvent.change(box(16), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "مسح الصناديق" }));
    expect(box(16).value).toBe("");
    expect(document.activeElement).toBe(box(128));
  });
  it("16 boxes come as two bytes; what the student typed survives closing and reopening the tool", () => {
    render(<StudentToolDock studentTools={spec({ id: "placeValueBoxes", width: 16 })} sectionId="s1" />);
    openTool("صناديق التحويل");
    expect(screen.getAllByRole("table").map(t => t.getAttribute("aria-label"))).toEqual(["صناديق التحويل، البايت 1", "صناديق التحويل، البايت 2"]);
    fireEvent.change(box(32768), { target: { value: "1" } });
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    openTool("صناديق التحويل");
    expect(box(32768).value).toBe("1");
  });
});

describe("T13 the student's hex ↔ binary list", () => {
  it("lists 0 – F with binary and decimal; the decimal column follows the teacher's choice", () => {
    const r = render(<StudentToolDock studentTools={DOCK} sectionId="s1" />);
    openTool("قائمة التحويل من السادس عشر إلى الثنائي");
    const table = within(screen.getByTestId("tool-hexBinaryTable")).getByRole("table");
    expect(within(table).getAllByRole("columnheader").map(h => h.textContent)).toEqual(["عشري", "ثنائي", "Hex"]);
    const rows = within(table).getAllByRole("row").slice(1).map(tr => Array.from(tr.children).map(c => c.textContent).join(" "));
    expect(rows).toHaveLength(16);
    expect(rows[0]).toBe("0 0000 0");
    expect(rows[12]).toBe("12 1100 C");
    expect(rows[15]).toBe("15 1111 F");
    r.unmount();
    render(<StudentToolDock studentTools={spec({ id: "hexBinaryTable", showDecimal: false })} sectionId="s1" />);
    openTool("قائمة التحويل من السادس عشر إلى الثنائي");
    expect(within(screen.getByTestId("tool-hexBinaryTable")).getAllByRole("columnheader").map(h => h.textContent)).toEqual(["ثنائي", "Hex"]);
  });
});

describe("T13 builder options", () => {
  const mount = (value: unknown) => {
    const onChange = vi.fn<(next: StudentToolsSpecV1 | undefined) => void>();
    const r = render(<StudentToolsEditor value={value} sections={[{ id: "s1", title: "الأول" }]} onChange={onChange} />);
    return { ...r, onChange, last: () => onChange.mock.calls.at(-1)?.[0] };
  };
  it("switching each tool on emits its default; the box count and the decimal column are editable", () => {
    const m = mount(undefined);
    fireEvent.click(screen.getByRole("checkbox", { name: "صناديق التحويل" }));
    expect(m.last()).toEqual(spec({ id: "placeValueBoxes", width: 8 }));
    m.rerender(<StudentToolsEditor value={m.last()} sections={[{ id: "s1", title: "الأول" }]} onChange={m.onChange} />);
    fireEvent.change(screen.getByRole("combobox", { name: "عدد الصناديق" }), { target: { value: "16" } });
    expect(m.last()).toEqual(spec({ id: "placeValueBoxes", width: 16 }));
    m.rerender(<StudentToolsEditor value={m.last()} sections={[{ id: "s1", title: "الأول" }]} onChange={m.onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "قائمة التحويل من السادس عشر إلى الثنائي" }));
    expect(m.last()).toEqual(spec({ id: "placeValueBoxes", width: 16 }, { id: "hexBinaryTable", showDecimal: true }));
    m.rerender(<StudentToolsEditor value={m.last()} sections={[{ id: "s1", title: "الأول" }]} onChange={m.onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "إظهار العمود العشري" }));
    expect(m.last()).toEqual(spec({ id: "placeValueBoxes", width: 16 }, { id: "hexBinaryTable", showDecimal: false }));
  });
});
