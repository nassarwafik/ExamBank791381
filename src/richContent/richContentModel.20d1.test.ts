import { describe, it, expect } from "vitest";
import * as R from "./richContentModel";
import { parseMath } from "./richMath";

// Phase 20D.1 — RichContentV1: structured, data-only content (never HTML). Fail-first on 0b22080: the module does not exist.
const codes = (raw: unknown) => R.validateRichContent(raw).issues.filter(i => i.severity === "error").map(i => i.code);
const doc = (...blocks: unknown[]) => ({ schemaVersion: 1, blocks });
const p = (text: string) => ({ type: "paragraph", runs: [{ text }] });
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

export const FULL_DOC = () => doc(
  { type: "heading", level: 3, runs: [{ text: "معطيات الشبكة" }] },
  { type: "paragraph", runs: [{ text: "اضبط الأمر " }, { text: "switchport mode trunk", marks: ["code"] }, { text: " على المنفذ." }], dir: "auto", align: "start" },
  { type: "unorderedList", items: [{ runs: [{ text: "أولًا" }] }, { runs: [{ text: "ثانيًا", marks: ["bold"] }] }] },
  { type: "orderedList", items: [{ runs: [{ text: "خطوة" }] }] },
  { type: "table", caption: "الأجهزة", columnHeaders: ["الجهاز", "VLAN", "IP", "Gateway"], rowHeaders: true, rows: [["PC1", "10", "192.168.10.10", "192.168.10.1"], ["PC2", "20", { runs: [{ text: "192.168.20.10", marks: ["code"] }] }, "192.168.20.1"]], responsive: "scroll" },
  { type: "image", asset: { dataUrl: PNG, origin: "uploaded" }, alt: "مخطط" },
  { type: "figure", asset: { dataUrl: PNG, origin: "uploaded" }, alt: "مخطط", caption: [{ text: "الشكل 1" }] },
  { type: "code", language: "python", source: "print('<script>')", lineNumbers: true, title: "برنامج" },
  { type: "cli", source: "Switch(config)# vlan 10\nSwitch(config-vlan)# name STAFF", title: "الأوامر" },
  { type: "quote", runs: [{ text: "العلم نور" }], citation: "مثل" },
  { type: "callout", variant: "info", title: "ملاحظة", runs: [{ text: "استخدم العناوين كما تظهر." }] },
  { type: "divider" },
  { type: "keyValueGrid", items: [{ label: "الجهاز", value: "R1" }, { label: "IP", value: "192.168.10.1" }] },
  { type: "columns", columns: [{ blocks: [p("يمين")] }, { blocks: [{ type: "math", source: "v = g t" }] }] },
  { type: "math", source: "h = \\frac{1}{2} g t^{2}" },
  { type: "paragraph", runs: [{ text: "السرعة " }, { math: "v_0 = 0" }] }
);

describe("20D1-R1 schema", () => {
  it("a document using every v1 block validates with no issue; the canonical value equals the input", () => {
    const r = R.validateRichContent(FULL_DOC());
    expect(r.issues).toEqual([]);
    expect(r.value).toEqual(FULL_DOC());
  });
  it("the block vocabulary is exactly the documented v1 set (frozen, discoverable)", () => {
    // Phase 21A.1 appended "dataChart" (an additive block: every 20D.1 / 21A type keeps its position — the order is pinned by
    // cert-21a1-compat-freeze; an older reader refuses the new type with RICH_CONTENT_BLOCK_TYPE, as the fail-first run on the baseline
    // showed — docs/enterprise-interactive-charts-21a1.md §18).
    // Phase 21A.2 appends functionGraph without changing the older block positions.
    expect(R.RICH_BLOCK_TYPES).toEqual(["heading", "paragraph", "unorderedList", "orderedList", "table", "image", "figure", "code", "cli", "quote", "callout", "divider", "keyValueGrid", "columns", "math", "dataChart", "functionGraph"]);
    expect(Object.isFrozen(R.RICH_LIMITS)).toBe(true);
  });
  it("plain-text derivation (search / fallback / accessibility) walks every text-bearing block", () => {
    const t = R.richContentPlainText(FULL_DOC());
    for (const s of ["معطيات الشبكة", "switchport mode trunk", "192.168.20.10", "العلم نور", "R1", "يمين"]) expect(t).toContain(s);
  });
});

describe("20D1-R2 strict validation — refusals", () => {
  const cases: [string, unknown, string][] = [
    ["not an object", "<p>x</p>", "RICH_CONTENT_INVALID"],
    ["future version", { schemaVersion: 2, blocks: [] }, "RICH_CONTENT_VERSION"],
    ["empty document", doc(), "RICH_CONTENT_EMPTY"],
    ["unknown root key", { ...doc(p("x")), html: "<b>x</b>" }, "RICH_CONTENT_UNKNOWN_KEY"],
    ["unknown block type", doc({ type: "iframe", src: "https://x" }), "RICH_CONTENT_BLOCK_TYPE"],
    ["unknown block key", doc({ ...p("x"), style: "color:red" }), "RICH_CONTENT_UNKNOWN_KEY"],
    ["className on a block", doc({ ...p("x"), className: "iex-topbar" }), "RICH_CONTENT_UNKNOWN_KEY"],
    ["prototype key", doc(JSON.parse('{"type":"paragraph","runs":[{"text":"x"}],"__proto__":{"a":1}}')), "RICH_CONTENT_UNKNOWN_KEY"],
    ["constructor key on a run", doc({ type: "paragraph", runs: [{ text: "x", constructor: 1 }] }), "RICH_CONTENT_UNKNOWN_KEY"],
    ["raw <script> in prose", doc(p("hi <script>alert(1)</script>")), "RICH_CONTENT_RAW_HTML"],
    ["raw <style> in a caption", doc({ type: "table", caption: "<style>body{}</style>", rows: [["a"]] }), "RICH_CONTENT_RAW_HTML"],
    ["<iframe> in a cell", doc({ type: "table", rows: [["<iframe src=x>"]] }), "RICH_CONTENT_RAW_HTML"],
    ["<svg onload> in a list item", doc({ type: "unorderedList", items: [{ runs: [{ text: "<svg onload=alert(1)>" }] }] }), "RICH_CONTENT_RAW_HTML"],
    ["javascript: in a callout", doc({ type: "callout", variant: "info", runs: [{ text: "javascript:alert(1)" }] }), "RICH_CONTENT_RAW_HTML"],
    ["data:text/html in a quote citation", doc({ type: "quote", runs: [{ text: "x" }], citation: "data:text/html,<b>" }), "RICH_CONTENT_RAW_HTML"],
    ["unknown mark", doc({ type: "paragraph", runs: [{ text: "x", marks: ["blink"] }] }), "RICH_CONTENT_INVALID"],
    ["run with both text and math", doc({ type: "paragraph", runs: [{ text: "x", math: "y" }] }), "RICH_CONTENT_INVALID"],
    ["arbitrary colour on a run", doc({ type: "paragraph", runs: [{ text: "x", color: "#f00" }] }), "RICH_CONTENT_UNKNOWN_KEY"],
    ["link run", doc({ type: "paragraph", runs: [{ text: "x", href: "https://evil" }] }), "RICH_CONTENT_UNKNOWN_KEY"],
    ["heading level 1", doc({ type: "heading", level: 1, runs: [{ text: "x" }] }), "RICH_CONTENT_INVALID"],
    ["css alignment string", doc({ ...p("x"), align: "justify; position:fixed" }), "RICH_CONTENT_INVALID"],
    ["unknown table responsive mode", doc({ type: "table", rows: [["a"]], responsive: "hidden" }), "RICH_CONTENT_INVALID"],
    ["ragged table rows", doc({ type: "table", columnHeaders: ["a", "b"], rows: [["1"]] }), "RICH_CONTENT_INVALID"],
    ["external image URL", doc({ type: "image", asset: { dataUrl: "https://evil.example/x.png" }, alt: "x" }), "RICH_CONTENT_IMAGE"],
    ["SVG image", doc({ type: "image", asset: { dataUrl: "data:image/svg+xml;base64,PHN2Zz4=" }, alt: "x" }), "RICH_CONTENT_IMAGE"],
    ["javascript: image", doc({ type: "figure", asset: { dataUrl: "javascript:alert(1)" }, alt: "x", caption: [] }), "RICH_CONTENT_IMAGE"],
    ["image without alt", doc({ type: "image", asset: { dataUrl: PNG }, alt: "" }), "RICH_CONTENT_IMAGE"],
    ["unknown code language", doc({ type: "code", language: "html><script", source: "x" }), "RICH_CONTENT_INVALID"],
    ["unknown callout variant", doc({ type: "callout", variant: "danger-overlay", runs: [{ text: "x" }] }), "RICH_CONTENT_INVALID"],
    ["three columns", doc({ type: "columns", columns: [{ blocks: [p("a")] }, { blocks: [p("b")] }, { blocks: [p("c")] }] }), "RICH_CONTENT_INVALID"],
    ["nested columns", doc({ type: "columns", columns: [{ blocks: [{ type: "columns", columns: [{ blocks: [] }, { blocks: [] }] }] }, { blocks: [p("b")] }] }), "RICH_CONTENT_NESTING"],
    ["unknown LaTeX command", doc({ type: "math", source: "\\href{javascript:x}{y}" }), "RICH_CONTENT_MATH"],
    ["LaTeX \\def macro", doc({ type: "math", source: "\\def\\x{1}" }), "RICH_CONTENT_MATH"],
    ["unbalanced math braces", doc({ type: "math", source: "\\frac{1}{2" }), "RICH_CONTENT_MATH"],
    ["control characters", doc(p("a\u0000b")), "RICH_CONTENT_INVALID_TEXT"]
  ];
  for (const [name, raw, code] of cases) it(name + " → " + code, () => expect(codes(raw)).toContain(code));
});

describe("20D1-R3 bounds", () => {
  it("block, item, row, column, cell, code, math, depth and size limits all block", () => {
    const L = R.RICH_LIMITS;
    expect(codes(doc(...Array.from({ length: L.blocks + 1 }, () => p("x"))))).toContain("RICH_CONTENT_LIMIT");
    expect(codes(doc({ type: "unorderedList", items: Array.from({ length: L.listItems + 1 }, () => ({ runs: [{ text: "x" }] })) }))).toContain("RICH_CONTENT_LIMIT");
    expect(codes(doc({ type: "table", rows: Array.from({ length: L.tableRows + 1 }, () => ["x"]) }))).toContain("RICH_CONTENT_LIMIT");
    expect(codes(doc({ type: "table", rows: [Array.from({ length: L.tableColumns + 1 }, () => "x")] }))).toContain("RICH_CONTENT_LIMIT");
    expect(codes(doc({ type: "table", rows: [["x".repeat(L.cellChars + 1)]] }))).toContain("RICH_CONTENT_LIMIT");
    expect(codes(doc({ type: "code", language: "python", source: "x".repeat(L.codeBytes + 1) }))).toContain("RICH_CONTENT_LIMIT");
    expect(codes(doc({ type: "math", source: "x".repeat(L.mathChars + 1) }))).toContain("RICH_CONTENT_LIMIT");
    expect(codes(doc({ type: "paragraph", runs: Array.from({ length: L.runs + 1 }, () => ({ text: "x" })) }))).toContain("RICH_CONTENT_LIMIT");
    expect(codes(doc(p("x".repeat(L.blockChars + 1))))).toContain("RICH_CONTENT_LIMIT");
  });
});

describe("20D1-R4 student projection and images", () => {
  it("projectRichContentForStudent returns the canonical rebuild, or undefined for anything malformed (fail closed → plain text)", () => {
    expect(R.projectRichContentForStudent(FULL_DOC())).toEqual(FULL_DOC());
    expect(R.projectRichContentForStudent({ ...FULL_DOC(), teacherNote: "x" })).toBeUndefined();
    expect(R.projectRichContentForStudent(doc(p("<script>x</script>")))).toBeUndefined();
  });
  it("mapRichImages visits every image / figure (columns included) and rebuilds the document with mapped assets", () => {
    const seen: unknown[] = [];
    const out = R.mapRichImages(FULL_DOC(), a => { seen.push(a); return { ...a, id: "mapped" }; }) as { blocks: { type: string; asset?: { id?: string } }[] };
    expect(seen).toHaveLength(2);
    expect(out.blocks.filter(b => b.asset).every(b => b.asset!.id === "mapped")).toBe(true);
  });
});

describe("20D1-R5 math parser — allow-listed LaTeX subset", () => {
  it("parses fractions, roots, scripts, greek letters, operators and \\text into a closed AST", () => {
    for (const s of ["h = \\frac{1}{2} g t^{2}", "\\sqrt[3]{x}", "v_0 + a t", "\\Delta x \\approx 9.8 \\times 2", "\\text{السرعة} = \\frac{d}{t}", "\\left( a + b \\right)^{2}", "\\sum_{i=1}^{n} i"]) expect(parseMath(s).ok, s).toBe(true);
  });
  it("refuses unknown commands, macros and HTML-capable commands", () => {
    for (const s of ["\\href{x}{y}", "\\url{x}", "\\html{x}", "\\style{x}", "\\class{x}{y}", "\\def\\a{1}", "\\newcommand{\\a}{1}", "\\input{x}", "\\unknown"]) expect(parseMath(s).ok, s).toBe(false);
  });
});

describe("20D1-R9 mutation-gap closure — size and math bounds (internal mutation round 1)", () => {
  const limit = (raw: unknown) => R.validateRichContent(raw).issues.map(i => i.code);
  it("a single text block over blockChars is refused, one at the bound is accepted", () => {
    expect(limit(doc(p("ب".repeat(R.RICH_LIMITS.blockChars + 1))))).toContain("RICH_CONTENT_LIMIT");
    expect(limit(doc(p("ب".repeat(R.RICH_LIMITS.blockChars))))).toEqual([]);
    // several runs, each under the bound, together over it (the per-block sum, not only the per-run check)
    const half = Math.ceil(R.RICH_LIMITS.blockChars / 2) + 1;
    expect(limit(doc({ type: "paragraph", runs: [{ text: "د".repeat(half) }, { text: "ه".repeat(half), marks: ["bold"] }] }))).toContain("RICH_CONTENT_LIMIT");
  });
  it("many blocks each under blockChars but together over totalChars are refused", () => {
    const n = Math.ceil(R.RICH_LIMITS.totalChars / (R.RICH_LIMITS.blockChars - 1)) + 1;
    const blocks = Array.from({ length: n }, () => p("ج".repeat(R.RICH_LIMITS.blockChars - 1)));
    expect(limit(doc(...blocks))).toContain("RICH_CONTENT_LIMIT");
  });
  it("structure-heavy documents (many tiny runs with every mark) over serializedBytes are refused even when text totals are small", () => {
    const run = { text: "a", marks: ["bold", "italic", "underline", "code", "sup", "sub"] };
    const blocks = Array.from({ length: 60 }, () => ({ type: "paragraph", runs: Array.from({ length: R.RICH_LIMITS.runs }, () => run) }));
    expect(JSON.stringify(doc(...blocks)).length).toBeGreaterThan(R.RICH_LIMITS.serializedBytes);
    expect(limit(doc(...blocks))).toContain("RICH_CONTENT_LIMIT");
  });
  it("math nesting deeper than MATH_LIMITS.depth and node counts over MATH_LIMITS.nodes are refused", async () => {
    const { MATH_LIMITS } = await import("./richMath");
    const deep = "\\sqrt{".repeat(MATH_LIMITS.depth + 2) + "x" + "}".repeat(MATH_LIMITS.depth + 2);
    expect(deep.length).toBeLessThan(MATH_LIMITS.chars);
    expect(parseMath(deep).ok).toBe(false);
    const wide = "x+".repeat(MATH_LIMITS.nodes) + "x";
    expect(wide.length).toBeLessThan(MATH_LIMITS.chars);
    expect(parseMath(wide).ok).toBe(false);
    expect(parseMath("\\sqrt{\\sqrt{x}}").ok).toBe(true);
    expect(parseMath("x+".repeat(50) + "x").ok).toBe(true);
  });
});
