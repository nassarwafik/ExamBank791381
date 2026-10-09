import { describe, it, expect } from "vitest";
import { buildAiGraphSchema, mapAiGraph, normalizeMathNotation, requestNumbers, statedFormulas } from "./composerGraph";
import { buildRichBlockSchema, mapAiRichBlocks } from "./composerRich";
import { rb } from "./testing/composerFakeAi";
import { buildComposerCatalog, catalogForPrompt, COMPOSER_CATALOG_VERSION } from "./composerCatalog";

// 21A.2: adversarial and compatibility certification of AI -> bounded graph descriptor -> canonical graph.
// No generated mathematics: the teacher must write the expression in the original request.
const D = (over: Record<string, unknown> = {}) => ({
  title: "منحنى دالة", description: "رسم الدالة التي كتبها المعلم",
  xMin: null, xMax: null, yMin: null, yMax: null,
  curves: [{ label: "f(x)", expression: "x^2 - 4*x + 3", domainMin: null, domainMax: null }],
  ...over
});
const policy = (request: string, charts = true) => ({ request, charts, illustrative: false });
// ComposerIssue.path is optional by contract (the failing branch is still read-only here).
const codes = (r: { ok: boolean; issues?: { code: string; path?: string }[] }) => r.ok ? [] : (r.issues ?? []).map(i => [i.code, i.path]);
const EXPLICIT = "ارسم منحنى الدالة f(x) = x^2 - 4x + 3 على المستوى";

describe("21A2-AI1 closed descriptor and strict teacher provenance", () => {
  it("V4 catalog names mathematical function graphs, without exposing plotting-library settings", () => {
    expect(COMPOSER_CATALOG_VERSION).toBe("AI_COMPOSER_CATALOG_V4");
    const lines = catalogForPrompt(buildComposerCatalog()).split("\n");
    expect(lines.find(l => l.startsWith("Function graphs: "))).toContain("never infer a formula");
    expect(lines.find(l => l.startsWith("Rich blocks: "))).toContain("functionGraph");
    expect(lines.find(l => l.startsWith("Charts: "))).toContain("dataOrigin");
    const schema = JSON.stringify(buildAiGraphSchema());
    for (const prohibited of ['"id"', '"points"', '"roles"', '"answer"', '"javascript"', '"html"', '"formatter"', '"option"']) expect(schema).not.toContain(prohibited);
    expect(JSON.stringify(buildRichBlockSchema())).toContain('"graph"');
  });
  it("accepts the exact authored formula and default window through the real rich mapper", () => {
    const result = mapAiRichBlocks([rb("functionGraph", { graph: D() })], "stem", policy(EXPLICIT));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const g = result.richContent!.blocks[0];
    expect(g.type).toBe("functionGraph");
    if (g.type !== "functionGraph") return;
    expect(g.graph.id).toBe("graph1");
    const authored = g.graph.curves[0];
    expect(authored.kind).toBe("explicit");
    if (authored.kind === "explicit") expect(authored.expression).toBe("x^2 - 4*x + 3");
    expect(g.graph.viewport).toEqual({ xMin: -10, xMax: 10, yMin: -10, yMax: 10 });
    expect(g.graph.points ?? []).toHaveLength(0);
  });
  it("keeps expressions unchanged but compares only mathematical notation", () => {
    expect(normalizeMathNotation("2×x²")).toBe("2x^2");
    expect(statedFormulas("Plot f(x) = x^2 + 1 and y = sin(x)")).toEqual(new Set(["x^2+1", "sin(x)"]));
    expect(requestNumbers("المجال من -π إلى 2π")).toContain(-Math.PI);
    expect(requestNumbers("المجال من -π إلى 2π")).toContain(2 * Math.PI);
  });
  it("refuses a described but unstated formula at the expression path", () => {
    const r = mapAiGraph(D(), 0, policy("ارسم دالة تربيعية جذراها 1 و 3"), "stem[0].graph");
    expect(codes(r)).toEqual([["AI_GRAPH_EXPRESSION_NOT_STATED", "stem[0].graph.curves[0].expression"]]);
  });
  it("refuses disabling graphs or omitting the teacher policy entirely", () => {
    expect(codes(mapAiGraph(D(), 0, undefined, "stem[0].graph"))[0][0]).toBe("AI_GRAPH_POLICY_MISSING");
    expect(codes(mapAiGraph(D(), 0, policy(EXPLICIT, false), "stem[0].graph"))[0][0]).toBe("AI_GRAPH_DISABLED");
  });
  it("refuses invented domain/window bounds, partial viewport and unknown keys", () => {
    expect(codes(mapAiGraph(D({ curves: [{ label: "f", expression: "x^2 - 4*x + 3", domainMin: 777, domainMax: null }] }), 0, policy(EXPLICIT), "g"))).toEqual([["AI_GRAPH_NUMBER_NOT_STATED", "g.curves[0].domainMin"]]);
    expect(codes(mapAiGraph(D({ xMin: -2, xMax: 2, yMin: -5, yMax: 5 }), 0, policy(EXPLICIT), "g"))[0]).toEqual(["AI_GRAPH_NUMBER_NOT_STATED", "g.xMin"]);
    expect(codes(mapAiGraph(D({ xMin: -2 }), 0, policy(EXPLICIT), "g"))[0][0]).toBe("AI_GRAPH_MALFORMED");
    expect(codes(mapAiGraph(D({ javascript: "alert(1)" }), 0, policy(EXPLICIT), "g"))[0][0]).toBe("AI_GRAPH_MALFORMED");
  });
  it("refuses executable-looking or invented formulas, not just malformed syntax", () => {
    const r = mapAiGraph(D({ curves: [{ label: "f", expression: "process.exit(1)", domainMin: null, domainMax: null }] }), 0, policy(EXPLICIT), "g");
    expect(codes(r)).toEqual([["AI_GRAPH_EXPRESSION_NOT_STATED", "g.curves[0].expression"]]);
  });
  it("renumbers independent block positions deterministically and never invents answer keys", () => {
    const r = mapAiRichBlocks([rb("paragraph", { text: "مقدمة" }), rb("functionGraph", { graph: D() })], "stem", policy(EXPLICIT));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const g = r.richContent!.blocks[1];
    expect(g.type).toBe("functionGraph");
    if (g.type !== "functionGraph") return;
    expect(g.graph.id).toBe("graph2");
    expect(JSON.stringify(r.richContent)).not.toMatch(/"answer"|"role"|"on"|"slope"/);
  });
});
