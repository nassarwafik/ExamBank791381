import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { buildComposerCatalog, catalogForPrompt, COMPOSER_CATALOG_VERSION, COMPOSER_SCIENTIFIC_MATH } from "./composerCatalog";
import { mapAiRichBlocks } from "./composerRich";
import { runGeneration, type ComposerTransport } from "./composerRun";
import { withComposerHistory } from "./composerExam";
import * as F from "./testing/composerFakeAi";
import { MATH_COMMANDS, MATH_ENVIRONMENTS, MATH_GRID_LIMITS, MATH_LANGUAGE_VERSION, MATH_LIMITS, parseMath } from "../richContent/richMath";
import { MATH_FEATURES } from "../richContent/mathFeatures";
import { parseStructuredExamJson } from "../structuredExamImport";
import { looksLikeRawHtml, validateRichContent } from "../richContent/richContentModel";
import type { StructuredExam } from "../examTypes";
import * as sanitizer from "../../api/src/lib/student-exam-sanitize.js";
import * as grading from "../../api/src/lib/assignment-grading.js";

// Phase 21A — the AI Composer learns Scientific Math v2 from the ONE catalog (derived from the parser and its proven feature table), the
// prompt carries a bounded contract, and the canonical validator (validateRichContent → parseMath) decides every AI formula: success through
// the REAL endpoint handler with a scripted provider, adversarial formulas refused and repaired within the existing bound, never stored raw.
// Fail-first on 60ddadc: no scientificMath catalog entry, catalog V1, grids refused.
const composerApi = createRequire(import.meta.url)("../../api/src/functions/ai-exam-composer.js");
const handler = (composerApi as { handler: (r: unknown, d: unknown) => Promise<{ status: number; jsonBody: Record<string, unknown> }> }).handler;
const sanitize = (sanitizer as unknown as { sanitizeExamForStudent: (e: unknown) => unknown }).sanitizeExamForStudent;
const gradeExam = (grading as unknown as { gradeExam: (e: unknown, a: unknown) => { score: number } }).gradeExam;
function transportFor(script: Record<string, unknown[]>) {
  const ai = F.scriptedAi(script);
  const t: ComposerTransport = async body => (await handler({ json: async () => body }, { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), callTextJson: ai.fn, reserveComposerCall: async () => ({ allowed: true, retryAfterSeconds: 0 }), container: null, now: () => "2026-10-08T00:00:00.000Z" })).jsonBody;
  return { t, calls: ai.calls };
}
const noop = () => {};
const qs = (e: StructuredExam) => e.sections.flatMap(s => s.questions) as unknown as Record<string, unknown>[];
const mathOf = (q: Record<string, unknown>) => (((q.richContent as { blocks: { type: string; source?: string }[] } | undefined)?.blocks) ?? []).filter(b => b.type === "math").map(b => b.source);

const MATRIX = "A = \\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}";
const DET = "\\det A = \\begin{vmatrix} 1 & 2 \\\\ 3 & 4 \\end{vmatrix} = -2";
const CASES = "f(x) = \\begin{cases} x^{2} & \\text{إذا كان } x \\ge 0 \\\\ -x & \\text{إذا كان } x < 0 \\end{cases}";
const ALIGNED_CRLF = "\\begin{aligned}\r\nV &= IR \\\\\r\nP &= VI\r\n\\end{aligned}";
const ALIGNED_LF = "\\begin{aligned}\nV &= IR \\\\\nP &= VI\n\\end{aligned}";
const CHEM = "\\mathrm{N}_2 + 3\\mathrm{H}_2 \\rightleftharpoons 2\\mathrm{NH}_3";
const COMPLEX = "z \\in \\mathbb{C}, \\quad \\Re(z) = a, \\quad \\overline{z} = a - bi";
const INTEGRAL = "\\iint_{D} x y \\, dA";

const INTENT = { v: 1, subject: "الرياضيات والعلوم", grade: "12", language: "ar", totalMarks: 10, difficulty: "medium", sectionTarget: 1, presentationPreset: "modernAcademic", teacherInstruction: "أسئلة قصيرة تستخدم المصفوفات والدوال متعددة القواعد والاتزان الكيميائي." };
const PLAN = F.plan("امتحان الترميز العلمي", "modernAcademic", [F.planSection("الترميز العلمي", [F.planItem("multipleChoice", 4, { topic: "المصفوفات" }), F.planItem("trueFalse", 3, { topic: "الدوال" }), F.planItem("multipleChoice", 3, { topic: "الكيمياء" })])]);
const sectionWith = (m1: string, m2: string, m3: string) => ({ items: [
  F.item("multipleChoice", { topic: "المصفوفات", question: F.mcq("ما محدد المصفوفة A؟", ["-2", "2", "10"]), stem: [F.math(m1), F.math(DET)] }),
  F.item("trueFalse", { topic: "الدوال", question: F.tf("الدالة f متصلة عند x = 0.", true), stem: [F.math(m2), F.math(ALIGNED_CRLF)] }),
  F.item("multipleChoice", { topic: "الكيمياء", question: F.mcq("ماذا يدل السهم المزدوج؟", ["اتزان", "تفاعل تام", "لا شيء"]), stem: [F.math(m3), F.math(COMPLEX), F.math(INTEGRAL)] })
] });

describe("21A-AI1 the catalog derives Scientific Math v2 from code", () => {
  it("catalog V2 with a scientificMath entry that IS the parser's vocabulary (same frozen references), bounds and proven examples", () => {
    expect(COMPOSER_CATALOG_VERSION).toBe("AI_COMPOSER_CATALOG_V2");
    const c = buildComposerCatalog();
    expect(c.version).toBe("AI_COMPOSER_CATALOG_V2");
    expect(c.scientificMath).toBe(COMPOSER_SCIENTIFIC_MATH);
    expect(c.scientificMath.version).toBe(MATH_LANGUAGE_VERSION);
    expect(c.scientificMath.environments).toBe(MATH_ENVIRONMENTS);
    expect(c.scientificMath.commands).toBe(MATH_COMMANDS);
    expect(c.scientificMath.features).toBe(MATH_FEATURES);
    expect(c.scientificMath.limits).toEqual({ ...MATH_LIMITS, ...MATH_GRID_LIMITS });
    expect(Object.isFrozen(COMPOSER_SCIENTIFIC_MATH) && Object.isFrozen(COMPOSER_SCIENTIFIC_MATH.limits)).toBe(true);
    for (const f of c.scientificMath.features) expect(parseMath(f.example).ok, f.id).toBe(true);
    expect(c.richBlocks).toContain("math");
  });
  it("the prompt carries a BOUNDED math contract: exact commands, environments, limits, examples; nothing outside the vocabulary is offered", () => {
    const p = catalogForPrompt();
    const line = p.split("\n").find(l => l.startsWith("Math blocks"))!;
    expect(line).toBeTruthy();
    expect(line.length).toBeLessThanOrEqual(3500);
    expect(p.length).toBeLessThanOrEqual(9000);
    expect(p.startsWith("CAPABILITY CATALOG AI_COMPOSER_CATALOG_V2")).toBe(true);
    const envs = line.slice(line.indexOf("environments ONLY ") + 18, line.indexOf(" as \\begin{name}")).split(", ");
    expect(envs).toEqual([...MATH_ENVIRONMENTS]);                                                    // the exact list, not a substring — mutation M50
    for (const f of MATH_FEATURES) expect(line, f.id).toContain(f.example);
    for (const n of [MATH_LIMITS.chars, MATH_LIMITS.nodes, MATH_LIMITS.depth, MATH_GRID_LIMITS.rows, MATH_GRID_LIMITS.cols, MATH_GRID_LIMITS.cells]) expect(line).toContain(String(n));
    expect(line).toContain("cases and aligned at most " + MATH_GRID_LIMITS.casesCols + " columns");     // reviewer mutant R20
    expect(line).toContain("rows by \\\\, never nested, at most");                                   // reviewer mutant V20 (review fix 3)
    const offered = line.slice(line.indexOf("commands ONLY ") + 14, line.indexOf("; environments ONLY")).split(" ").map(s => s.replace(/^\\/, ""));
    expect(offered).toEqual([...MATH_COMMANDS]);
    for (const bad of ["href", "url", "html", "style", "class", "def", "newcommand", "input", "include", "color", "array"]) expect(offered, bad).not.toContain(bad);
  });
});

describe("21A-AI2 AI math blocks → RichContentV1 through the canonical validator", () => {
  it("accepts matrices, determinants, cases with Arabic text, aligned (CRLF → LF), number sets, multiple integrals and chemistry — exact sources", () => {
    const r = mapAiRichBlocks([MATRIX, DET, CASES, ALIGNED_CRLF, CHEM, COMPLEX, INTEGRAL].map(F.math));
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.richContent!.blocks.map(b => (b as { source: string }).source)).toEqual([MATRIX, DET, CASES, ALIGNED_LF, CHEM, COMPLEX, INTEGRAL]);
    const bare = mapAiRichBlocks([F.math(ALIGNED_CRLF.replace(/\r\n/g, "\r"))]);                       // bare CR (reviewer mutant R19)
    expect(bare.ok && bare.richContent!.blocks.map(b => (b as { source: string }).source)).toEqual([ALIGNED_LF]);
  });
  it("every ADVERSARIAL formula is refused with AI_RICH_CONTENT_INVALID (escape hatches, macros, files, unknown / malformed / nested environments, separators outside a grid, HTML / CSS / JS, bounds)", () => {
    const ADVERSARIAL = [
      "\\href{javascript:alert(1)}{x}", "\\url{https://evil.example}", "\\html{<b>x</b>}", "\\style{color:red}{x}", "\\class{evil}{x}", "\\def\\x{1} \\x",
      "\\newcommand{\\x}{1}", "\\renewcommand{\\frac}{x}", "\\input{/etc/passwd}", "\\include{secret}", "\\color{red}{x}", "\\begin{array}{cc} a & b \\end{array}",
      "\\begin{tabular}{c} a \\end{tabular}", "\\begin{matrix} a", "\\begin{pmatrix} a \\end{bmatrix}", "\\end{matrix}", "\\begin{matrix} \\begin{matrix} a \\end{matrix} \\end{matrix}",
      "\\begin{ matrix } a \\end{matrix}", "\\begin{matrix*} a \\end{matrix*}", "\\begin{__proto__} a \\end{__proto__}", "a & b", "a \\\\ b", "\\begin{matrix} a \\\\[2pt] b \\end{matrix}",
      "<script>alert(1)</script>", "<math><mi>x</mi></math>", "x <style>*{}</style>", "javascript:alert(1)", "\\mathbb{A}", "\\mathbb{RR}",
      "\\begin{matrix}" + " a \\\\".repeat(MATH_GRID_LIMITS.rows) + " a \\end{matrix}", "x".repeat(MATH_LIMITS.chars + 1)
    ];
    for (const s of ADVERSARIAL) {
      const r = mapAiRichBlocks([F.math(s)]);
      expect(r.ok, s.slice(0, 60)).toBe(false);
      if (!r.ok) expect(r.issues.map(i => i.code), s.slice(0, 60)).toContain("AI_RICH_CONTENT_INVALID");
    }
  });
});

describe("21A-AI2b HTML-looking formulas", () => {
  it("the math language reads them as inert relations (stored-content validator UNCHANGED — a 20D.1 pin), but AI intake refuses them", () => {
    for (const s of ["<script>alert(1)</script>", "<math><mi>x</mi></math>", "x <style>*{}</style>", "javascript:alert(1)", "<img src=x onerror=alert(1)>"]) {
      expect(parseMath(s).ok, s).toBe(true);                                                                                    // pin: 60ddadc accepts it too
      expect(validateRichContent({ schemaVersion: 1, blocks: [{ type: "math", source: s }] }).ok, s).toBe(true);
      expect(looksLikeRawHtml(s), s).toBe(true);
      const r = mapAiRichBlocks([F.math(s)]);
      expect(r.ok, s).toBe(false);
      if (!r.ok) expect(r.issues.map(i => i.code)).toEqual(["AI_RICH_CONTENT_INVALID"]);
    }
    // documented false positives (review fix 1, design record §24): inner-product / expectation-value spellings look like tags → refused
    // (fails closed: the section is refused with the markup message and costs one bounded repair round; the prompt does not special-case it)
    for (const s of ["<a, b>", "<p>"]) { expect(parseMath(s).ok, s).toBe(true); expect(mapAiRichBlocks([F.math(s)]).ok, s).toBe(false); }
    for (const s of ["a < b", "0 < x < 1", "a/b", "x > y \\Rightarrow f(x) > f(y)"]) {
      expect(looksLikeRawHtml(s), s).toBe(false);
      expect(mapAiRichBlocks([F.math(s)]).ok, s).toBe(true);
    }
  });
});

describe("21A-AI3 scripted provider through the REAL endpoint and orchestration", () => {
  it("success: a plan + one section with v2 math stems becomes a canonical exam; formulas are exact, the student payload keeps them, round trip, grading unchanged", async () => {
    const { t, calls } = transportFor({ ai_exam_plan: [PLAN], ai_exam_section: [sectionWith(MATRIX, CASES, CHEM)] });
    const r = await runGeneration(t, INTENT, { examId: "EXAM-21A-AI", report: noop, nonce: "fx21a0" });
    if (!r.ok) throw new Error(JSON.stringify(r.failure));
    const exam = r.result.exam;
    expect(r.result.verdict.blocking).toEqual([]);
    expect(r.result.verdict.summary.totalMarks).toBe(10);
    expect(qs(exam).map(mathOf)).toEqual([[MATRIX, DET], [CASES, ALIGNED_LF], [CHEM, COMPLEX, INTEGRAL]]);
    expect((exam.metadata as { aiComposer: { catalog: string } }).aiComposer.catalog).toBe("AI_COMPOSER_CATALOG_V2");
    expect(calls.map(c => c.schemaName)).toEqual(["ai_exam_plan", "ai_exam_section"]);
    for (const c of calls) { expect(c.prompt).toContain("AI_COMPOSER_CATALOG_V2"); expect(c.prompt).toContain("Math blocks (scientific notation language v2)"); }
    const imp = parseStructuredExamJson(JSON.stringify(exam), "ai-21a.json");
    expect([imp.canOpen, imp.parseErrors, imp.validationErrors]).toEqual([true, [], []]);
    expect(qs(imp.exam as StructuredExam).map(mathOf)).toEqual(qs(exam).map(mathOf));
    const student = sanitize(exam) as StructuredExam;
    expect(qs(student).map(mathOf)).toEqual(qs(exam).map(mathOf));
    expect(JSON.stringify(student)).not.toMatch(/"(correctOptionIndex|aiComposer|correct)"\s*:/);
    expect(gradeExam(exam, {}).score).toBe(0);
  });
  it("adversarial then repaired: an \\href / \\begin{array} section is refused (AI_RICH_CONTENT_INVALID → SECTION_INVALID) and the bounded repair succeeds", async () => {
    const { t, calls } = transportFor({ ai_exam_plan: [PLAN], ai_exam_section: [sectionWith("\\href{javascript:alert(1)}{A}", "\\begin{array}{cc} a & b \\end{array}", CHEM), sectionWith(MATRIX, CASES, CHEM)] });
    const r = await runGeneration(t, INTENT, { examId: "EXAM-21A-AI", report: noop, nonce: "fx21a1" });
    if (!r.ok) throw new Error(JSON.stringify(r.failure));
    expect(calls.map(c => c.schemaName)).toEqual(["ai_exam_plan", "ai_exam_section", "ai_exam_section"]);
    expect(calls[2].prompt).toContain("REPAIR");
    expect(calls[2].prompt).toMatch(/صيغة|الصيغة|math/i);
    expect(JSON.stringify(r.result.exam)).not.toMatch(/\\\\href|\\\\begin\{array\}|javascript:/);
    expect(qs(r.result.exam).map(mathOf)[0]).toEqual([MATRIX, DET]);
  });
  it("adversarial forever: three refused sections end in a classified validation failure — no exam, nothing stored raw", async () => {
    const bad = sectionWith("\\def\\x{\\href{javascript:alert(1)}{y}} \\x", "\\begin{matrix} \\begin{matrix} a \\end{matrix} \\end{matrix}", "<script>alert(1)</script>");
    const { t, calls } = transportFor({ ai_exam_plan: [PLAN], ai_exam_section: [bad, bad, bad] });
    const r = await runGeneration(t, INTENT, { examId: "EXAM-21A-AI", report: noop, nonce: "fx21a2" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.failure.kind).toBe("validation");
    expect(r.failure.issues.map(i => i.code)).toContain("AI_RICH_CONTENT_INVALID");
    expect(calls.map(c => c.schemaName)).toEqual(["ai_exam_plan", "ai_exam_section", "ai_exam_section", "ai_exam_section"]);
    expect("result" in r).toBe(false);
  });
});


describe("21A-AI4 catalog provenance (review fix 1: what metadata.aiComposer.catalog really records)", () => {
  it("an exam last composed under V1 keeps \"V1\" until its next composer operation, which re-stamps the CURRENT catalog (history entries carry none)", () => {
    const entry = { at: "2026-01-01T00:00:00.000Z", mode: "generate", summary: "قديم", baseRevision: "r0", status: "applied" as const, operations: 1, warnings: 0 };
    const v1 = { examId: "E", title: "t", sections: [], metadata: { aiComposer: { v: 1, catalog: "AI_COMPOSER_CATALOG_V1", coverage: [], history: [entry] } } } as unknown as StructuredExam;
    expect(JSON.parse(JSON.stringify(v1)).metadata.aiComposer.catalog).toBe("AI_COMPOSER_CATALOG_V1");     // stored / imported untouched
    const next = withComposerHistory(v1, { ...entry, at: "2026-10-08T00:00:00.000Z", mode: "modify" }) as unknown as { metadata: { aiComposer: { catalog: string; history: { mode: string }[] } } };
    expect(next.metadata.aiComposer.catalog).toBe("AI_COMPOSER_CATALOG_V2");
    expect(next.metadata.aiComposer.history.map(h => h.mode)).toEqual(["generate", "modify"]);
    expect(Object.keys(next.metadata.aiComposer.history[0])).not.toContain("catalog");
  });
});

describe("21A-AI5 review fix 3: the markup refusal reads the formula the block actually yields", () => {
  it("markup in the plain-text fallback of an AI math block (empty source) is refused for the MARKUP reason (reviewer mutant V16)", () => {
    const tag = "<script>alert(1)</script>";
    const r = mapAiRichBlocks([{ ...F.math(""), text: tag }]);                                       // a complete block: only the formula differs
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.map(i => [i.code, i.message])).toEqual([["AI_RICH_CONTENT_INVALID", "الصيغة الرياضية لا تقبل وسوم HTML أو روابط script."]]);
    const plain = mapAiRichBlocks([{ ...F.math(""), text: "x^{2}" }]);                                // a clean fallback still maps, exactly
    expect(plain.ok && plain.richContent).toEqual({ schemaVersion: 1, blocks: [{ type: "math", source: "x^{2}" }] });
  });
});
