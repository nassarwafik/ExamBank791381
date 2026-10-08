// Phase 20F — DETERMINISTIC fake AI for tests (CI never depends on a live provider). Builders for strict-schema-shaped model outputs
// (plan, section items, 19A question drafts, SmartSim specs, composite specs, rich blocks, patch operations) and a scripted adapter with
// the exact signature of the server's callTextJson dependency. Test-only: imported by tests, never by production code.
export type FakeCall = { instructions: string; prompt: string; schema: unknown; schemaName: string };
type Json = Record<string, unknown>;

export const Q19_NULLS: Json = { multipleChoice: null, trueFalse: null, shortAnswer: null, fillBlank: null, inlineCloze: null, networkCli: null, parametricNumeric: null, openResponse: null, codeStimulus: null, tableFill: null, coding: null };
/** A 19A question draft (all payload keys present, exactly one set). */
export const q19 = (intent: string, text: string, payload: Json = {}, marks = 1): Json => ({ intent, confidence: "clear", unsupportedCapabilities: [], explanation: "", text, marks, ...Q19_NULLS, ...payload });
export const mcq = (text: string, options: string[], correctIndex = 0) => q19("multipleChoice", text, { multipleChoice: { options, correctIndex } });
export const tf = (text: string, correct: boolean) => q19("trueFalse", text, { trueFalse: { correct } });
export const piece = (over: Json) => ({ kind: "text", text: "", accepted: [], caseSensitive: false, options: [], correctIndex: -1, ...over });
export const cloze = (text: string, pieces: Json[]) => q19("inlineCloze", text, { inlineCloze: { scoring: "proportional", pieces } });
export const level = (label: string, score: number) => ({ label, score, description: "" });
export const criterion = (title: string, maxScore: number) => ({ title, description: title, guidance: "إرشاد سري للمعلم", maxScore, allowCustomScore: false, levels: [level("كامل", maxScore), level("جزئي", Math.max(0.5, maxScore / 2)), level("صفر", 0)] });
export const open = (text: string, criteria: Json[], profile = "explain") => q19("openResponse", text, { openResponse: { profile, instructions: "", minChars: 0, maxChars: 1500, rubricVisibility: "hidden", criteria, modelAnswer: "إجابة نموذجية سرية" } });
export const numericParam = (text: string, vars: [string, number, number][], expr: string) => q19("parametricNumeric", text, { parametricNumeric: { variables: vars.map(([name, min, max]) => ({ name, kind: "integer", min, max, step: 1, format: { kind: "plain", decimals: 0 } })), derivedVariables: [], constraints: [], answerExpression: expr, mode: "tolerance", tolerance: 0.01, below: 0, above: 0, unitMode: "none", unitLabel: "", unit: "" } });
export const coding = (text: string, language: string, examples: [string, string][] = [["1 2", "3"]]) => q19("coding", text, { coding: { mode: "writeProgram", language, starterCode: "", publicExamples: examples.map(([input, sampleOutput]) => ({ input, sampleOutput })) } });
export const shortAns = (text: string, modelAnswer = "") => q19("shortAnswer", text, { shortAnswer: { modelAnswer } });

const RB_BASE = { text: "", level: 2, dir: "auto", items: [], headers: [], rows: [], language: "text", source: "", variant: "info", title: "", pairs: [], chart: null };   // 21A.1 adds the chart descriptor (null outside dataChart)
export const rb = (type: string, over: Json = {}): Json => ({ ...RB_BASE, type, ...over });
export const table = (headers: string[], rows: string[][], title = "") => rb("table", { headers, rows, title });
export const cli = (source: string, title = "") => rb("cli", { source, title });
export const math = (source: string) => rb("math", { source });
export const callout = (text: string, variant = "note", title = "") => rb("callout", { text, variant, title });

export const netSim = (scenario: string, title = "شبكة المختبر"): Json => ({ plugin: "networkTopology", title, instructions: "", network: { scenario }, physics: null, function: null });
export const physSim = (h: number, v: number, g: number, measurements: string[], points: string[] = [], probeTime = 0.5): Json => ({ plugin: "physicsFreeFall", title: "تجربة السقوط", instructions: "", network: null, physics: { initialHeight: h, initialVelocity: v, gravity: g, measurements, probeTime, points }, function: null });
export const funcSim = (over: Json): Json => ({ plugin: "functionStudy2d", title: "دراسة دالة", instructions: "", network: null, physics: null, function: { source: "(2*x-4)/((x-1)*(x+2))", xMin: -6, xMax: 8, yMin: -6, yMax: 6, tasks: ["domainExclusions", "xIntercepts", "yIntercept", "verticalAsymptotes", "horizontalAsymptotes"], domainExclusions: [-2, 1], xIntercepts: [2], yIntercept: 2, verticalAsymptotes: [-2, 1], horizontalAsymptotes: [0], extrema: [], intervals: [], ...over } });

/** A composite written NESTED (readable in tests) → the FLAT wire shape of the provider schema (parts name their 1-based group). */
export const flatComposite = (c: Json | null): Json => {
  if (!c) return { compositeText: "", compositeContext: null, compositeGroups: [], compositeParts: [] };
  const groups = (c.groups as Json[]) ?? [];
  return {
    compositeText: c.text, compositeContext: c.context,
    compositeGroups: groups.map(g => { const { parts: _p, ...head } = g; void _p; return head; }),
    compositeParts: groups.flatMap((g, gi) => ((g.parts as Json[]) ?? []).map(p => ({ group: gi + 1, ...p })))
  };
};
export const item = (kind: string, over: Json = {}): Json => {
  const { composite: c, ...rest } = over;
  return { kind, topic: "", difficulty: "medium", rationale: "", stem: [], question: null, smartSim: null, ...flatComposite((c as Json | null | undefined) ?? null), assetRequest: null, ...rest };
};
export const part = (kind: string, marks: number, over: Json = {}): Json => ({ kind, linked: false, marks, label: "", simChecks: [], simText: "", question: null, ...over });
export const group = (parts: Json[], over: Json = {}): Json => ({ title: "", policy: "all", requiredAnswers: null, parts, ...over });
export const composite = (text: string, context: Json | null, groups: Json[]): Json => ({ text, context, groups });
export const simContext = (sim: Json): Json => ({ kind: "smartSim", sim, sourceTitle: "", sourceBlocks: [] });
export const sourceContext = (title: string, blocks: Json[]): Json => ({ kind: "source", sim: null, sourceTitle: title, sourceBlocks: blocks });

export const planItem = (kind: string, marks: number, over: Json = {}): Json => ({ kind, topic: "", difficulty: "medium", marks, simulator: null, scenario: null, note: "", ...over });
export const planSection = (title: string, items: Json[], over: Json = {}): Json => ({ title, instructions: "", marks: items.reduce((n, i) => n + (i.marks as number), 0), topics: [], items, ...over });
export const plan = (title: string, preset: string, sections: Json[], over: Json = {}): Json => ({ title, learningGoals: [], presentationPreset: preset, coverageNote: "", sections, unsupportedRequests: [], ...over });

export const OP_BASE: Json = { op: "updateQuestionText", sectionId: null, questionId: null, partId: null, position: null, text: null, title: null, marks: null, preset: null, tableVariant: null, variant: null, richBlocks: null, richMode: null, item: null, section: null, items: null, reason: "" };
/** addSection written with `section.items` (readable in tests) → the wire shape (items beside the section header). */
export const op = (name: string, over: Json = {}): Json => {
  const sec = over.section as Json | null | undefined;
  if (sec && Array.isArray(sec.items)) { const { items, ...head } = sec; return { ...OP_BASE, op: name, ...over, section: head, items }; }
  return { ...OP_BASE, op: name, ...over };
};
export const patch = (operations: Json[], summary = "تعديل"): Json => ({ summary, operations });

/** A scripted provider: responses are consumed in order per schemaName; every call is recorded. */
export function scriptedAi(script: Record<string, unknown[]>) {
  const calls: FakeCall[] = [];
  const queues = Object.fromEntries(Object.entries(script).map(([k, v]) => [k, [...v]]));
  const fn = async (args: FakeCall) => {
    calls.push(args);
    const q = queues[args.schemaName];
    if (!q || !q.length) throw new Error("no scripted response for " + args.schemaName);
    const next = q.shift();
    if (next instanceof Error) throw next;
    return { result: typeof next === "function" ? (next as (a: FakeCall) => unknown)(args) : next };
  };
  return { fn, calls };
}
