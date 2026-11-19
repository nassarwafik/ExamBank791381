// @vitest-environment happy-dom
// Phase T10 — the student periodic table up to Z 118 (docs/enterprise-student-tools-t.md §16).
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen, within } from "@testing-library/react";
import PeriodicTableTool from "./PeriodicTableTool";
import StudentToolsEditor from "./StudentToolsEditor";
import { PERIODIC_ELEMENTS, periodicElements, PERIODIC_CATEGORY_LABEL, CURRICULUM_Z_MAX } from "./periodicTableData";
import { CHEM_ELEMENTS } from "../chemistry/elements";
import { validateStudentTools, defaultStudentToolConfig, type StudentToolsSpecV1, type PeriodicTableToolV1 } from "./studentToolsSpec";

afterEach(cleanup);

// The IUPAC 18-column position of an element, derived from Z alone (independent of the data under test).
const PERIOD_ENDS = [2, 10, 18, 36, 54, 86, 118];
function expectedPosition(z: number): { period: number; group: number | null } {
  const period = PERIOD_ENDS.findIndex(end => z <= end) + 1;
  const start = period === 1 ? 1 : PERIOD_ENDS[period - 2] + 1, i = z - start;   // 0-based index inside the period
  if (period === 1) return { period, group: z === 1 ? 1 : 18 };
  if (period <= 3) return { period, group: i < 2 ? i + 1 : i + 11 };
  if (period <= 5) return { period, group: i + 1 };
  if (i < 2) return { period, group: i + 1 };
  if (i < 17) return { period, group: null };                                       // the lanthanide / actinide series (La–Lu, Ac–Lr)
  return { period, group: i - 13 };
}

describe("the element data", () => {
  it("lists Z 1–118 exactly once, with unique symbols and names", () => {
    expect(PERIODIC_ELEMENTS.map(e => e.z)).toEqual(Array.from({ length: 118 }, (_, i) => i + 1));
    expect(new Set(PERIODIC_ELEMENTS.map(e => e.symbol)).size).toBe(118);
    expect(new Set(PERIODIC_ELEMENTS.map(e => e.nameAr)).size).toBe(118);
    expect(new Set(PERIODIC_ELEMENTS.map(e => e.nameEn)).size).toBe(118);
    for (const e of PERIODIC_ELEMENTS) {
      expect(e.symbol, String(e.z)).toMatch(/^[A-Z][a-z]?$/);
      expect(e.nameAr.trim(), String(e.z)).not.toBe("");
      expect(PERIODIC_CATEGORY_LABEL[e.category], String(e.z)).toBeTruthy();
    }
  });

  it("Z 1–36 are the verified chemistry catalog, unchanged", () => {
    expect(PERIODIC_ELEMENTS.slice(0, 36).map(e => [e.z, e.symbol, e.nameAr, e.nameEn, e.weightText, e.group, e.period, e.category]))
      .toEqual(CHEM_ELEMENTS.map(e => [e.z, e.symbol, e.nameAr, e.nameEn, e.weightText, e.group, e.period, e.category]));
    expect(CHEM_ELEMENTS).toHaveLength(36);
  });

  it("every element sits where its atomic number puts it in the 18-column table", () => {
    for (const e of PERIODIC_ELEMENTS) expect({ period: e.period, group: e.group }, e.symbol).toEqual(expectedPosition(e.z));
    expect(PERIODIC_ELEMENTS.filter(e => e.category === "lanthanide").map(e => e.z)).toEqual(Array.from({ length: 15 }, (_, i) => 57 + i));
    expect(PERIODIC_ELEMENTS.filter(e => e.category === "actinide").map(e => e.z)).toEqual(Array.from({ length: 15 }, (_, i) => 89 + i));
  });

  it("atomic weights are the printed decimals of the table; exactly the elements without a standard weight have none", () => {
    const none = PERIODIC_ELEMENTS.filter(e => e.weightText === null).map(e => e.z);
    expect(none).toEqual([43, 61, 84, 85, 86, 87, 88, 89, ...Array.from({ length: 26 }, (_, i) => 93 + i)]);
    for (const e of PERIODIC_ELEMENTS) if (e.weightText !== null) expect(e.weightText, e.symbol).toMatch(/^\d{1,3}\.\d{1,4}$/);
    // a typo check: weights rise with Z except the known inversions (Ar/K, Co/Ni, Te/I, Th/Pa)
    const weighed = PERIODIC_ELEMENTS.filter(e => e.weightText !== null);
    const drops = weighed.slice(1).filter((e, i) => Number(e.weightText) < Number(weighed[i].weightText)).map(e => e.symbol);
    expect(drops).toEqual(["K", "Ni", "I", "Pa"]);
    expect(PERIODIC_ELEMENTS.find(e => e.symbol === "Au")!.weightText).toBe("196.97");
    expect(PERIODIC_ELEMENTS.find(e => e.symbol === "Pb")!.weightText).toBe("207.2");
    expect(PERIODIC_ELEMENTS.find(e => e.symbol === "U")!.weightText).toBe("238.03");
  });

  it("the curriculum range is Z 1–36", () => {
    expect(periodicElements("curriculum")).toHaveLength(CURRICULUM_Z_MAX);
    expect(periodicElements("all")).toHaveLength(118);
  });
});

describe("the contract (additive within version 1)", () => {
  const spec = (t: unknown): unknown => ({ version: 1, tools: [t] });
  it("an older spec without `range` keeps its exact canonical shape (Z 1–36)", () => {
    const r = validateStudentTools(spec({ id: "periodicTable", showMass: true, showConfiguration: false }));
    expect(r.ok && r.value.tools[0]).toEqual({ id: "periodicTable", showMass: true, showConfiguration: false });
  });
  it("\"curriculum\" is canonicalized to the absence of the key; \"all\" is kept", () => {
    const c = validateStudentTools(spec({ id: "periodicTable", showMass: true, showConfiguration: true, range: "curriculum" }));
    expect(c.ok && c.value.tools[0]).toEqual({ id: "periodicTable", showMass: true, showConfiguration: true });
    const a = validateStudentTools(spec({ id: "periodicTable", showMass: true, showConfiguration: true, range: "all" }));
    expect(a.ok && a.value.tools[0]).toEqual({ id: "periodicTable", showMass: true, showConfiguration: true, range: "all" });
  });
  it("any other range is refused, the whole spec with it", () => {
    for (const bad of ["full", "", null, 118, true]) {
      const r = validateStudentTools(spec({ id: "periodicTable", showMass: true, showConfiguration: true, range: bad }));
      expect(r.ok, String(bad)).toBe(false);
      if (!r.ok) expect(r.issues.map(i => i.code)).toContain("STUDENT_TOOLS_INVALID_VALUE");
    }
  });
  it("a teacher switching the tool on now gets the full table", () => {
    expect(defaultStudentToolConfig("periodicTable")).toEqual({ id: "periodicTable", showMass: true, showConfiguration: true, range: "all" });
  });
});

const tool = (over: Partial<PeriodicTableToolV1> = {}) => render(<PeriodicTableTool config={{ id: "periodicTable", showMass: true, showConfiguration: true, ...over }} />);
const elementButtons = () => within(screen.getByRole("grid", { name: "الجدول الدوري" })).getAllByRole("gridcell").filter(c => c.tagName === "BUTTON");

describe("the student tool", () => {
  it("without `range` (every exam published before T10) it is the Z 1–36 table, exactly as before", () => {
    tool();
    expect(elementButtons()).toHaveLength(36);
    expect(screen.getByText(/العناصر من 1 إلى 36 \(نطاق المنهاج\)/)).toBeTruthy();
    expect(screen.queryByRole("row", { name: "اللانثانيدات" })).toBeNull();
  });

  it("the full table shows all 118 elements, the f-block series in their own rows", () => {
    tool({ range: "all" });
    expect(elementButtons()).toHaveLength(118);
    expect(screen.getByText(/العناصر كلها من 1 إلى 118/)).toBeTruthy();
    const lan = screen.getByRole("row", { name: "اللانثانيدات" });
    expect(within(lan).getAllByRole("gridcell").filter(c => c.tagName === "BUTTON").map(b => b.textContent)).toEqual(
      ["57La", "58Ce", "59Pr", "60Nd", "61Pm", "62Sm", "63Eu", "64Gd", "65Tb", "66Dy", "67Ho", "68Er", "69Tm", "70Yb", "71Lu"]);
    expect(within(screen.getByRole("row", { name: "الأكتينيدات" })).getAllByRole("gridcell").filter(c => c.tagName === "BUTTON")).toHaveLength(15);
    expect(screen.getByText("57–71")).toBeTruthy();
    expect(screen.getByText("89–103")).toBeTruthy();
  });

  it("a heavy element shows its data; its configuration is not invented", () => {
    tool({ range: "all" });
    fireEvent.click(screen.getByRole("gridcell", { name: /ذهب Au/ }));
    const d = screen.getByTestId("pt-detail");
    expect(d.textContent).toContain("79");
    expect(d.textContent).toContain("196.97");
    expect(d.textContent).toContain("6 · 11");
    expect(d.textContent).toContain("يُعرض للعناصر من 1 إلى 36 فقط");
  });

  it("an element without a standard atomic weight says so; a lanthanide has no group number", () => {
    tool({ range: "all" });
    fireEvent.click(screen.getByRole("gridcell", { name: /بروميثيوم Pm/ }));
    const d = screen.getByTestId("pt-detail");
    expect(d.textContent).toContain("لا كتلة ذرية قياسية");
    expect(d.textContent).toContain("6 · —");
    expect(d.textContent).toContain("لانثانيد");
  });

  it("an element of the curriculum keeps its configuration in the full table", () => {
    tool({ range: "all" });
    fireEvent.click(screen.getByRole("gridcell", { name: /صوديوم Na/ }));
    expect(screen.getByTestId("pt-detail").textContent).toContain("3s");
  });
});

describe("the Builder", () => {
  const mount = (value: unknown) => {
    const onChange = vi.fn<(next: StudentToolsSpecV1 | undefined) => void>();
    const r = render(<StudentToolsEditor value={value} sections={[]} onChange={onChange} />);
    return { ...r, onChange, last: () => onChange.mock.calls.at(-1)?.[0] };
  };
  it("the teacher chooses the range; the curriculum range is emitted without the key", () => {
    const m = mount({ version: 1, tools: [{ id: "periodicTable", showMass: true, showConfiguration: true }] });
    const select = screen.getByRole("combobox", { name: "العناصر المعروضة" }) as HTMLSelectElement;
    expect(select.value).toBe("curriculum");
    fireEvent.change(select, { target: { value: "all" } });
    expect(m.last()!.tools[0]).toEqual({ id: "periodicTable", showMass: true, showConfiguration: true, range: "all" });
    m.rerender(<StudentToolsEditor value={m.last()} sections={[]} onChange={m.onChange} />);
    fireEvent.change(screen.getByRole("combobox", { name: "العناصر المعروضة" }), { target: { value: "curriculum" } });
    expect(m.last()!.tools[0]).toEqual({ id: "periodicTable", showMass: true, showConfiguration: true });
  });
});
