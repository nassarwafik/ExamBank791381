import { describe, it, expect } from "vitest";
import { ASCII_ROWS, asciiRows, asciiLookup } from "./asciiTable";
import { bitwise } from "./bitwise";
import { truthTable } from "./truthTable";
import { convertUnit, UNITS, UNIT_CATEGORIES } from "./unitConverter";
import { validateStudentTools, defaultStudentToolConfig, UNIT_CATEGORY_IDS, STUDENT_TOOL_IDS } from "./studentToolsSpec";
import { STUDENT_TOOLS_CATALOG } from "./studentToolsCatalog";
import { questionRiskFor } from "./studentToolsRisk";

describe("T6 — ASCII table", () => {
  it("has the 128 codes with every base, and the standard control names", () => {
    expect(ASCII_ROWS).toHaveLength(128);
    expect(ASCII_ROWS[65]).toMatchObject({ char: "A", dec: "65", hex: "41", oct: "101", bin: "01000001", printable: true });
    expect([ASCII_ROWS[0].name, ASCII_ROWS[10].name, ASCII_ROWS[13].name, ASCII_ROWS[27].name, ASCII_ROWS[127].name]).toEqual(["NUL", "LF", "CR", "ESC", "DEL"]);
    expect(asciiRows("printable").map(r => r.code)).toEqual(Array.from({ length: 95 }, (_, i) => i + 32));
    expect(asciiRows("full")).toHaveLength(128);
  });
  it.each([["A", [65]], ["a", [97]], ["7", [55]], ["65", [65]], ["0x41", [65]], ["41h", [65]], ["0b1000001", [65]], ["1000001", [65]], ["Hi!", [72, 105, 33]], [" ", [32]]] as const)(
    "looks up %j", (q, codes) => {
      const r = asciiLookup(q, "printable");
      expect(r.ok && r.rows.map(x => x.code)).toEqual(codes);
    });
  it("control characters only in the full table", () => {
    expect(asciiLookup("LF", "full")).toMatchObject({ ok: true });
    expect(asciiLookup("LF", "printable").ok).toBe(false);
    expect(asciiLookup("10", "printable").ok).toBe(false);
    expect(asciiLookup("10", "full").ok && asciiLookup("10", "full")).toMatchObject({ rows: [{ name: "LF" }] });
  });
  it.each(["", "200", "0x80", "ب", "x".repeat(65)])("refuses %j with an Arabic message", q => {
    const r = asciiLookup(q, "full");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/[\u0600-\u06FF]/);
  });
});

describe("T6 — bitwise calculator", () => {
  it("computes every operation on 8 bits", () => {
    const r = (op: Parameters<typeof bitwise>[0], a: string, b = "") => { const x = bitwise(op, a, b, 2, 8); return x.ok ? x.result.bin : x.message; };
    expect(r("AND", "11001010", "10101100")).toBe("1000 1000");
    expect(r("OR", "11001010", "10101100")).toBe("1110 1110");
    expect(r("XOR", "11001010", "10101100")).toBe("0110 0110");
    expect(r("NAND", "11001010", "10101100")).toBe("0111 0111");
    expect(r("NOR", "11001010", "10101100")).toBe("0001 0001");
    expect(r("NOT", "11001010")).toBe("0011 0101");
    expect(r("SHL", "11001010", "1")).toBe("1001 0100");        // the high bit falls off the 8-bit word
    expect(r("SHR", "11001010", "2")).toBe("0011 0010");
  });
  it("reads decimal and hex, and shows every base", () => {
    const x = bitwise("AND", "255", "15", 10, 16);
    expect(x.ok && x.result).toEqual({ bin: "0000 0000 0000 1111", dec: "15", hex: "000F" });
    const y = bitwise("XOR", "FF", "0F", 16, 8);
    expect(y.ok && y.result.hex).toBe("F0");
  });
  it("network mask arithmetic on 32 bits", () => {
    const x = bitwise("AND", "C0A8010A", "FFFFFFC0", 16, 32);
    expect(x.ok && x.result.hex).toBe("C0A80100");
  });
  it.each([
    ["AND", "111111111", "1", 2, 8, /لا يتسع في 8 بت/], ["AND", "102", "1", 2, 8, /غير مسموح/], ["SHL", "1", "9", 2, 8, /من 0 إلى 8/],
    ["SHR", "1", "-1", 2, 8, /من 0 إلى 8/], ["OR", "", "1", 10, 8, /^A:/], ["XOR", "1", "x", 16, 8, /^B:/]
  ] as const)("refuses %s %s %s", (op, a, b, base, w, msg) => {
    const r = bitwise(op, a, b, base, w);
    expect(!r.ok && r.message).toMatch(msg);
  });
});

describe("T6 — truth tables", () => {
  const out = (e: string, max = 4) => { const r = truthTable(e, max); return r.ok ? r.rows.map(x => (x.output ? 1 : 0)).join("") : "ERR:" + r.message; };
  it.each([
    ["A AND B", "0001"], ["A OR B", "0111"], ["A XOR B", "0110"], ["A NAND B", "1110"], ["A NOR B", "1000"], ["NOT A", "10"],
    ["A ∧ B", "0001"], ["A & B", "0001"], ["A && B", "0001"], ["A·B", "0001"], ["AB", "0001"], ["A + B", "0111"], ["A | B", "0111"], ["A ∨ B", "0111"],
    ["A ⊕ B", "0110"], ["A ^ B", "0110"], ["¬A", "10"], ["!A", "10"], ["~A", "10"], ["A'", "10"], ["(A+B)'", "1000"], ["A''", "01"]
  ])("%s", (e, expected) => expect(out(e)).toBe(expected));
  it("precedence: NOT > AND > XOR > OR, implicit AND, constants", () => {
    expect(out("A + B C")).toBe(out("A OR (B AND C)"));
    expect(out("A ^ B C")).toBe(out("A XOR (B AND C)"));
    expect(out("NOT A AND B")).toBe(out("(NOT A) AND B"));
    expect(out("A(B + C)")).toBe(out("A AND (B OR C)"));
    expect(out("A AND 1")).toBe("01");
    expect(out("A OR 1")).toBe("11");
    expect(out("1")).toBe("1");
  });
  it("orders variables alphabetically (A most significant) and lists the minterms", () => {
    const r = truthTable("C OR A B", 4);
    expect(r.ok && r.variables).toEqual(["A", "B", "C"]);
    expect(r.ok && r.minterms).toEqual([1, 3, 5, 6, 7]);
    expect(r.ok && r.normalized).toBe("C ∨ A ∧ B");
  });
  it("enforces the teacher's variable limit", () => {
    expect(out("A B C D E", 4)).toMatch(/^ERR:.*5 متغيرات.*4/);
    expect(out("A B C D E", 5)).toHaveLength(32);
  });
  it.each(["", "A AND", "(A OR B", "A OR B)", "a and b", "A $ B", "A AND AND B", "x".repeat(201)])("refuses %j with an Arabic message", e => {
    expect(out(e)).toMatch(/^ERR:.*[\u0600-\u06FF]/);
  });
  it("bounds the nesting depth", () => {
    expect(out("(".repeat(40) + "A" + ")".repeat(40))).toMatch(/^ERR:/);
    expect(out("NOT ".repeat(40) + "A")).toMatch(/^ERR:/);
  });
});

describe("T6 — unit converter", () => {
  const c = (cat: Parameters<typeof convertUnit>[0], f: string, t: string, v: string) => { const r = convertUnit(cat, f, t, v); return r.ok ? r.display : "ERR"; };
  it.each([
    ["length", "km", "m", "2.5", "2500"], ["length", "in", "cm", "1", "2.54"], ["length", "mi", "km", "1", "1.609344"],
    ["mass", "g", "kg", "1500", "1.5"], ["mass", "lb", "kg", "1", "0.45359237"],
    ["time", "h", "s", "1.5", "5400"], ["time", "ms", "us", "1", "1000"],
    ["temperature", "C", "F", "100", "212"], ["temperature", "F", "C", "-40", "-40"], ["temperature", "C", "K", "0", "273.15"], ["temperature", "K", "C", "0", "-273.15"],
    ["speed", "kmh", "mps", "36", "10"],
    ["data", "B", "bit", "1", "8"], ["data", "kB", "B", "1", "1000"], ["data", "KiB", "B", "1", "1024"], ["data", "MiB", "KiB", "1", "1024"], ["data", "GB", "MB", "1", "1000"],
    ["dataRate", "Mbps", "MBps", "100", "12.5"], ["dataRate", "Gbps", "Mbps", "1", "1000"], ["dataRate", "kBps", "kbps", "1", "8"]
  ] as const)("%s: %s %s → %s", (cat, f, t, v, out) => expect(c(cat, f, t, v)).toBe(out));
  it("shows no binary artefacts", () => {
    expect(c("length", "cm", "m", "0.1")).toBe("0.001");
    expect(c("length", "m", "cm", "0.07")).toBe("7");
  });
  it.each([
    ["temperature", "K", "C", "-1"], ["temperature", "C", "K", "-300"], ["mass", "kg", "g", "-1"], ["data", "B", "bit", "-8"],
    ["length", "m", "km", "abc"], ["length", "m", "km", ""], ["length", "m", "parsec", "1"], ["length", "m", "km", "1e400"]
  ] as const)("refuses %s %s→%s %j with an Arabic message", (cat, f, t, v) => {
    const r = convertUnit(cat, f, t, v);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/[\u0600-\u06FF]/);
  });
  it("the contract's category list matches the engine's", () => {
    expect([...UNIT_CATEGORY_IDS]).toEqual([...UNIT_CATEGORIES]);
    for (const cat of UNIT_CATEGORIES) expect(UNITS[cat].length).toBeGreaterThanOrEqual(2);
  });
});

describe("T6 — contract, catalog and risk", () => {
  const spec = (...tools: unknown[]) => ({ version: 1, tools });
  it("every new tool's default is valid, and the catalog lists every contract tool", () => {
    for (const id of ["asciiTable", "bitwiseCalculator", "truthTable", "unitConverter", "periodicTable"] as const) expect(validateStudentTools(spec(defaultStudentToolConfig(id))).ok).toBe(true);
    expect(STUDENT_TOOLS_CATALOG.map(e => e.id)).toEqual([...STUDENT_TOOL_IDS]);
  });
  it("canonicalizes the unit categories into contract order", () => {
    const v = validateStudentTools(spec({ id: "unitConverter", categories: ["data", "length"] }));
    expect(v.ok && v.value.tools[0]).toEqual({ id: "unitConverter", categories: ["length", "data"] });
  });
  it.each([
    [{ id: "asciiTable", range: "extended" }], [{ id: "asciiTable" }],
    [{ id: "bitwiseCalculator", width: 64 }], [{ id: "bitwiseCalculator", width: "8" }],
    [{ id: "truthTable", maxVariables: 1 }], [{ id: "truthTable", maxVariables: 7 }], [{ id: "truthTable", maxVariables: 3.5 }],
    [{ id: "unitConverter", categories: [] }], [{ id: "unitConverter", categories: ["volume"] }], [{ id: "unitConverter", categories: ["data", "data"] }],
    [{ id: "periodicTable", showMass: true }], [{ id: "periodicTable", showMass: true, showConfiguration: "yes" }],
    [{ id: "periodicTable", showMass: true, showConfiguration: true, answers: true }]
  ])("refuses %j", t => expect(validateStudentTools(spec(t)).ok).toBe(false));
  it("names questions for the subject tools that can answer them, never for the unit converter", () => {
    expect(questionRiskFor("asciiTable", { text: "ما رمز ASCII للحرف A؟" })).toBe(true);
    expect(questionRiskFor("bitwiseCalculator", { text: "احسب 1100 AND 1010" })).toBe(true);
    expect(questionRiskFor("truthTable", { text: "أكمل جدول الحقيقة للدارة المنطقية" })).toBe(true);
    expect(questionRiskFor("periodicTable", { text: "ما العدد الذري للصوديوم؟" })).toBe(true);
    expect(questionRiskFor("unitConverter", { text: "حوّل 5 km إلى m" })).toBe(false);
    expect(questionRiskFor("truthTable", { text: "عرّف البروتوكول" })).toBe(false);
  });
});
