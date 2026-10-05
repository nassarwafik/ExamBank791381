import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  PARAMETRIC_FUNCTIONS, PARAMETRIC_GENERATOR_VERSIONS, PARAMETRIC_LIMITS, evaluateConstraint, evaluateExpression, generateInstance, officialSeedText,
  parseConstraint, parseExpression, parseTemplate, previewSeedText, renderTemplate, seedDigest, validateGenerationIdentity, validateVariables
} from "./parametricEngine";

// Phase 19B — the deterministic parametric ENGINE (pure, reusable by future families): the closed expression language (tokenizer →
// recursive-descent parser → bounded evaluator), constraints, the bounded integer variable model, the {{id}} template parser and the
// versioned deterministic generator (cyrb128 → sfc32, generatorVersion 1). Every pinned value below was produced by an INDEPENDENT
// reference implementation of the v1 specification (scratch, not this module). New-module suite (fail-first on b8aa6ce: no engine).
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vars = (rows: { id: string; min: number; max: number; step: number }[]) => rows.map(r => ({ kind: "int" as const, ...r }));
const AB = vars([{ id: "a", min: 2, max: 10, step: 1 }, { id: "b", min: 5, max: 20, step: 1 }]);
const env = (o: Record<string, number>) => new Map(Object.entries(o));
const ev = (src: string, values: Record<string, number> = {}) => {
  const p = parseExpression(src);
  if (!p.ok) return { parse: p.code };
  const r = evaluateExpression(p.ast, env(values));
  return r.ok ? { value: r.value } : { eval: r.code };
};
const constraints = (list: string[]) => list.map(c => { const p = parseConstraint(c); if (!p.ok) throw new Error(c + " " + p.code); return p.constraint; });

describe("19B engine — the closed expression language", () => {
  it("numbers, variables, parentheses, + - * / % ^, unary minus and the six safe functions, with conventional precedence", () => {
    expect(ev("1 + 2 * 3")).toEqual({ value: 7 });
    expect(ev("(1 + 2) * 3")).toEqual({ value: 9 });
    expect(ev("a * b - c / 4", { a: 3, b: 5, c: 8 })).toEqual({ value: 13 });
    expect(ev("17 % 5")).toEqual({ value: 2 });
    expect(ev("-a + 2", { a: 5 })).toEqual({ value: -3 });
    expect(ev("2 ^ 3 ^ 2")).toEqual({ value: 512 });                     // right associative
    expect(ev("-2 ^ 2")).toEqual({ value: -4 });                        // unary minus binds looser than ^
    expect(ev("2 ^ (32 - p) - 2", { p: 26 })).toEqual({ value: 62 });   // usable IPv4 hosts for a /26
    expect(ev("abs(-3) + floor(2.7) + ceil(2.1) + round(2.5) + min(4, 2, 9) + max(1, 8)")).toEqual({ value: 3 + 2 + 3 + 3 + 2 + 8 });
    expect(ev("round(2.345, 2)")).toEqual({ value: 2.35 });
    expect(ev("round(1.005, 2)")).toEqual({ value: 1.01 });             // binary noise cleaned deterministically
    expect(ev("round(-2.5)")).toEqual({ value: -3 });                   // half away from zero
    expect(ev("0.5 * m * v ^ 2", { m: 4, v: 3 })).toEqual({ value: 18 });
    expect([...PARAMETRIC_FUNCTIONS]).toEqual(["abs", "round", "floor", "ceil", "min", "max"]);
  });
  it("parse reports the referenced variables (sorted, unique) so validators can check them against the declared set", () => {
    const p = parseExpression("b * a + a");
    expect(p.ok && p.refs).toEqual(["a", "b"]);
  });
  it("refuses everything that is not the grammar: JS execution, member access, strings, arrays, assignments, statements, unknown functions", () => {
    for (const src of ["constructor.constructor('x')()", "a.b", "Math.max(1,2)", "'x'", "\"x\"", "[1,2]", "a = 1", "a; b", "a => a", "`x`", "{}", "a ? b : c", "a && b", "a || b", "!a", "a ** 2", "eval(1)", "Function(1)", "process.exit()", "require(1)", "import(1)", "x[0]", "1e5", "0x1f", "a == b"])
      expect(parseExpression(src).ok, src).toBe(false);
    expect(parseExpression("sqrt(4)")).toMatchObject({ ok: false, code: "EXPR_UNKNOWN_FUNCTION" });
    expect(parseExpression("log2(8)")).toMatchObject({ ok: false, code: "EXPR_UNKNOWN_FUNCTION" });
    expect(parseExpression("a.b")).toMatchObject({ ok: false, code: "EXPR_TOKEN_INVALID" });
    expect(parseExpression("abs(1, 2)")).toMatchObject({ ok: false, code: "EXPR_ARITY" });
    expect(parseExpression("min(1)")).toMatchObject({ ok: false, code: "EXPR_ARITY" });
    expect(parseExpression("a(1)")).toMatchObject({ ok: false, code: "EXPR_UNKNOWN_FUNCTION" });
    expect(parseExpression("abs + 1")).toMatchObject({ ok: false, code: "EXPR_SYNTAX" });
    expect(parseExpression("1 +")).toMatchObject({ ok: false, code: "EXPR_SYNTAX" });
    expect(parseExpression("(1 + 2")).toMatchObject({ ok: false, code: "EXPR_SYNTAX" });
    expect(parseExpression("")).toMatchObject({ ok: false, code: "EXPR_EMPTY" });
    expect(parseExpression(42)).toMatchObject({ ok: false, code: "EXPR_EMPTY" });
  });
  it("prototype-sensitive identifiers are refused as variables and as functions", () => {
    for (const src of ["__proto__", "constructor", "prototype", "__proto__ + 1", "constructor(1)", "hasOwnProperty(1)", "toString"])
      expect(parseExpression(src).ok, src).toBe(false);
    expect(parseExpression("__proto__")).toMatchObject({ ok: false, code: "EXPR_FORBIDDEN_IDENTIFIER" });
  });
  it("length, token and depth limits are enforced before evaluation", () => {
    expect(parseExpression("1+".repeat(300) + "1")).toMatchObject({ ok: false });
    expect(parseExpression("a".repeat(PARAMETRIC_LIMITS.expressionChars + 1))).toMatchObject({ ok: false, code: "EXPR_TOO_LONG" });
    expect(parseExpression(Array.from({ length: 120 }, () => "1").join("+"))).toMatchObject({ ok: false, code: "EXPR_TOO_MANY_TOKENS" });
    expect(parseExpression("(".repeat(40) + "1" + ")".repeat(40))).toMatchObject({ ok: false, code: "EXPR_TOO_DEEP" });
    expect(parseExpression("-".repeat(40) + "1")).toMatchObject({ ok: false, code: "EXPR_TOO_DEEP" });
    expect(parseExpression("(".repeat(20) + "1" + ")".repeat(20)).ok).toBe(true);
  });
  it("evaluation fails closed on divide by zero, non-finite or out-of-range values, unsafe exponents and unknown variables", () => {
    expect(ev("1 / (a - a)", { a: 3 })).toEqual({ eval: "EVAL_DIVIDE_BY_ZERO" });
    expect(ev("5 % 0")).toEqual({ eval: "EVAL_DIVIDE_BY_ZERO" });
    expect(ev("0 ^ -1")).toEqual({ eval: "EVAL_DIVIDE_BY_ZERO" });
    expect(ev("2 ^ 0.5")).toEqual({ eval: "EVAL_EXPONENT_INVALID" });
    expect(ev("2 ^ 65")).toEqual({ eval: "EVAL_EXPONENT_INVALID" });
    expect(ev("10 ^ 16")).toEqual({ eval: "EVAL_OUT_OF_RANGE" });
    expect(ev("999999999999999 * 10")).toEqual({ eval: "EVAL_OUT_OF_RANGE" });
    expect(ev("x + 1")).toEqual({ eval: "EVAL_UNKNOWN_VARIABLE" });
    expect(ev("round(1, 11)")).toEqual({ eval: "EVAL_ROUND_DIGITS_INVALID" });
    expect(ev("round(1, 1.5)")).toEqual({ eval: "EVAL_ROUND_DIGITS_INVALID" });
    const p = parseExpression("a + 1");
    expect(p.ok && evaluateExpression(p.ast, env({ a: Number.NaN }))).toMatchObject({ ok: false, code: "EVAL_NON_FINITE" });
    expect(p.ok && evaluateExpression(p.ast, env({ a: Number.POSITIVE_INFINITY }))).toMatchObject({ ok: false, code: "EVAL_NON_FINITE" });
    // a variable lookup never reaches the prototype chain
    expect(p.ok && evaluateExpression(p.ast, new Map())).toMatchObject({ ok: false, code: "EVAL_UNKNOWN_VARIABLE" });
  });
  it("constraints are exactly ONE comparison of two expressions; expressions never contain a comparison", () => {
    const c = parseConstraint("a + b <= 100");
    expect(c.ok && c.refs).toEqual(["a", "b"]);
    expect(c.ok && evaluateConstraint(c.constraint, env({ a: 40, b: 60 }))).toEqual({ ok: true, holds: true });
    expect(c.ok && evaluateConstraint(c.constraint, env({ a: 41, b: 60 }))).toEqual({ ok: true, holds: false });
    for (const [src, a, b, holds] of [["a < b", 1, 2, true], ["a > b", 1, 2, false], ["a >= b", 2, 2, true], ["a != b", 2, 2, false], ["a == b", 2, 2, true]] as const) {
      const p = parseConstraint(src); expect(p.ok && evaluateConstraint(p.constraint, env({ a, b })), src).toEqual({ ok: true, holds });
    }
    for (const src of ["a", "a < b < c", "a = b", "a <> b", "a < ", "a === b", ""]) expect(parseConstraint(src).ok, src).toBe(false);
    expect(parseExpression("a < b")).toMatchObject({ ok: false, code: "EXPR_COMPARISON_NOT_ALLOWED" });
    const z = parseConstraint("10 / a > 1");
    expect(z.ok && evaluateConstraint(z.constraint, env({ a: 0 }))).toMatchObject({ ok: false, code: "EVAL_DIVIDE_BY_ZERO" });
  });
});

describe("19B engine — bounded integer variables", () => {
  it("a valid declaration is returned normalized; ids are stable and strictly formed", () => {
    expect(validateVariables([{ id: "hosts", kind: "int", min: 20, max: 120, step: 5 }])).toEqual({ ok: true, variables: [{ id: "hosts", kind: "int", min: 20, max: 120, step: 5 }] });
  });
  it("refuses unknown fields, prototype keys, duplicate / malformed / reserved ids, non-integers, impossible ranges, invalid or misaligned steps, too many variables", () => {
    const code = (raw: unknown) => { const r = validateVariables(raw); return r.ok ? "OK" : r.issues.map(i => i.code).join(","); };
    expect(code([])).toBe("PARAM_VARIABLES_INVALID");
    expect(code("a")).toBe("PARAM_VARIABLES_INVALID");
    expect(code(Array.from({ length: PARAMETRIC_LIMITS.variables + 1 }, (_, i) => ({ id: "v" + i, kind: "int", min: 0, max: 1, step: 1 })))).toBe("PARAM_VARIABLES_INVALID");
    expect(code([{ id: "a", kind: "int", min: 0, max: 1, step: 1, weight: 2 }])).toBe("PARAM_VAR_INVALID");
    expect(code([JSON.parse('{"id":"a","kind":"int","min":0,"max":1,"step":1,"__proto__":{"x":1}}')])).toBe("PARAM_VAR_INVALID");
    expect(code([{ id: "a", kind: "int", min: 0, max: 1, step: 1 }, { id: "a", kind: "int", min: 0, max: 1, step: 1 }])).toBe("PARAM_VAR_ID_DUPLICATE");
    for (const id of ["1a", "a-b", "a b", "", "x".repeat(33), "__proto__"]) expect(code([{ id, kind: "int", min: 0, max: 1, step: 1 }]), id).toBe("PARAM_VAR_ID_INVALID");
    for (const id of ["constructor", "prototype", "abs", "round", "min"]) expect(code([{ id, kind: "int", min: 0, max: 1, step: 1 }]), id).toBe("PARAM_VAR_ID_RESERVED");
    expect(code([{ id: "a", kind: "float", min: 0, max: 1, step: 1 }])).toBe("PARAM_VAR_KIND_UNSUPPORTED");
    expect(code([{ id: "a", kind: "int", min: 0.5, max: 1, step: 1 }])).toBe("PARAM_VAR_BOUNDS_INVALID");
    expect(code([{ id: "a", kind: "int", min: 0, max: 1e12, step: 1 }])).toBe("PARAM_VAR_BOUNDS_INVALID");
    expect(code([{ id: "a", kind: "int", min: 0, max: Number.POSITIVE_INFINITY, step: 1 }])).toBe("PARAM_VAR_BOUNDS_INVALID");
    expect(code([{ id: "a", kind: "int", min: 10, max: 1, step: 1 }])).toBe("PARAM_VAR_RANGE_IMPOSSIBLE");
    for (const step of [0, -1, 1.5, "1"]) expect(code([{ id: "a", kind: "int", min: 0, max: 10, step }]), String(step)).toBe("PARAM_VAR_STEP_INVALID");
    expect(code([{ id: "a", kind: "int", min: 0, max: 10, step: 3 }])).toBe("PARAM_VAR_STEP_MISALIGNED");
  });
});

describe("19B engine — the {{id}} template", () => {
  it("parses placeholders into text / variable parts and renders values as plain text", () => {
    const t = parseTemplate("لديك شبكة تحتاج إلى {{hosts}} جهازًا و {{hosts}} مرة أخرى", new Set(["hosts"]));
    expect(t.ok && t.refs).toEqual(["hosts"]);
    expect(t.ok && renderTemplate(t.parts, { hosts: 60 })).toBe("لديك شبكة تحتاج إلى 60 جهازًا و 60 مرة أخرى");
    const n = parseTemplate("x = {{a}}", new Set(["a"]));
    expect(n.ok && renderTemplate(n.parts, { a: -7 })).toBe("x = -7");
  });
  it("refuses unknown variables, malformed / nested / executable placeholder syntax", () => {
    const code = (s: string) => { const r = parseTemplate(s, new Set(["a"])); return r.ok ? "OK" : r.issues.map(i => i.code).join(","); };
    expect(code("{{b}}")).toBe("PARAM_TEMPLATE_UNKNOWN_VARIABLE");
    for (const s of ["{{a", "a}}", "{{ a }}", "{{a.b}}", "{{{a}}}", "{{a}}}", "{{constructor}}", "{{__proto__}}", "{{a + 1}}", "{{#if a}}", "${a}", "{{}}"]) expect(code(s), s).not.toBe("OK");
    expect(code("نص بلا متغيرات")).toBe("OK");
    expect(code("{ a } و }")).toBe("OK");                                 // single braces are ordinary text
  });
});

describe("19B engine — versioned deterministic generation (generatorVersion 1)", () => {
  const id = (over: Record<string, unknown> = {}) => validateGenerationIdentity({ assignmentId: "asg-19b", studentId: "stu-1", attemptNumber: 1, questionKey: "q1", ...over })!;
  it("the official seed text is a canonical, unambiguous JSON array of the server-owned identity; preview seeds live in another namespace", () => {
    expect(officialSeedText(1, id())).toBe('["smartassess.parametric",1,"official","asg-19b","stu-1",1,"q1"]');
    expect(previewSeedText(1, "q1", 1)).toBe('["smartassess.parametric",1,"preview","q1",1]');
    expect(seedDigest(officialSeedText(1, id()))).toBe("896b187e1b0615f2313ff4fd48a8a628");
    expect([...PARAMETRIC_GENERATOR_VERSIONS]).toEqual([1, 2]);                                   // Phase 19C adds generatorVersion 2 (v1 unchanged)
  });
  it("identity validation: non-empty bounded ids, a positive integer attempt number; anything else is null (fail closed)", () => {
    expect(id()).toEqual({ assignmentId: "asg-19b", studentId: "stu-1", attemptNumber: 1, questionKey: "q1" });
    for (const bad of [{ assignmentId: "" }, { studentId: 7 }, { attemptNumber: 0 }, { attemptNumber: 1.5 }, { attemptNumber: "1" }, { questionKey: "x".repeat(300) }])
      expect(validateGenerationIdentity({ assignmentId: "asg-19b", studentId: "stu-1", attemptNumber: 1, questionKey: "q1", ...bad }), JSON.stringify(bad)).toBeNull();
    expect(validateGenerationIdentity(null)).toBeNull();
  });
  it("EXACT pinned instances (independent reference): same identity ⇒ same values; another question / attempt ⇒ an independent instance", () => {
    const g = (seed: string, c: string[] = []) => generateInstance({ generatorVersion: 1, variables: AB, constraints: constraints(c) }, seed);
    expect(g(officialSeedText(1, id()))).toEqual({ ok: true, values: { a: 10, b: 10 }, attempt: 1 });
    expect(g(officialSeedText(1, id()))).toEqual({ ok: true, values: { a: 10, b: 10 }, attempt: 1 });          // replay
    expect(g(officialSeedText(1, id({ attemptNumber: 2 })))).toEqual({ ok: true, values: { a: 9, b: 18 }, attempt: 1 });
    expect(g(officialSeedText(1, id({ questionKey: "q2" })))).toEqual({ ok: true, values: { a: 5, b: 16 }, attempt: 1 });
    expect(g(previewSeedText(1, "q1", 1))).toEqual({ ok: true, values: { a: 7, b: 15 }, attempt: 1 });
    expect(g(previewSeedText(1, "q1", 2))).toEqual({ ok: true, values: { a: 8, b: 17 }, attempt: 1 });
    expect(generateInstance({ generatorVersion: 1, variables: vars([{ id: "hosts", min: 20, max: 120, step: 5 }]), constraints: [] }, officialSeedText(1, id({ questionKey: "net1" })))).toEqual({ ok: true, values: { hosts: 60 }, attempt: 1 });
    expect(generateInstance({ generatorVersion: 1, variables: vars([{ id: "p", min: 24, max: 30, step: 1 }]), constraints: [] }, officialSeedText(1, id({ questionKey: "net2" })))).toEqual({ ok: true, values: { p: 30 }, attempt: 1 });
  });
  it("constraints are honoured by bounded candidate generation (pinned: the first candidate is rejected, the second accepted)", () => {
    const r = generateInstance({ generatorVersion: 1, variables: AB, constraints: constraints(["a < b", "a + b <= 20"]) }, officialSeedText(1, id()));
    expect(r).toEqual({ ok: true, values: { a: 2, b: 13 }, attempt: 2 });
    for (let n = 1; n <= 40; n++) {
      const x = generateInstance({ generatorVersion: 1, variables: AB, constraints: constraints(["a < b", "a + b <= 20", "b % a != 0"]) }, officialSeedText(1, id({ attemptNumber: n })));
      if (x.ok) { expect(x.values.a < x.values.b && x.values.a + x.values.b <= 20 && x.values.b % x.values.a !== 0, String(n)).toBe(true); expect(x.attempt).toBeLessThanOrEqual(PARAMETRIC_LIMITS.attempts); }
    }
  });
  it("impossible constraints fail closed after EXACTLY the bounded attempt limit — never an infinite loop, never a silently ignored constraint", () => {
    expect(PARAMETRIC_LIMITS.attempts).toBe(100);
    const r = generateInstance({ generatorVersion: 1, variables: AB, constraints: constraints(["a > b + 100"]) }, officialSeedText(1, id()));
    expect(r).toEqual({ ok: false, code: "GEN_CONSTRAINTS_UNSATISFIED" });
    const z = generateInstance({ generatorVersion: 1, variables: vars([{ id: "a", min: 0, max: 0, step: 1 }]), constraints: constraints(["10 / a > 1"]) }, officialSeedText(1, id()));
    expect(z).toEqual({ ok: false, code: "GEN_CONSTRAINTS_UNSATISFIED" });                                // an erroring constraint never holds
  });
  it("an unsupported generator version is refused (never silently generated with v1)", () => {
    expect(generateInstance({ generatorVersion: 2, variables: AB, constraints: [] }, officialSeedText(1, id()))).toEqual({ ok: false, code: "GEN_UNSUPPORTED_VERSION" });
    expect(generateInstance({ generatorVersion: 0, variables: AB, constraints: [] }, "x")).toEqual({ ok: false, code: "GEN_UNSUPPORTED_VERSION" });
  });
  it("the engine is pure: no Math.random, Date, crypto, eval, Function, import(), DOM or I/O anywhere in the module", () => {
    const src = fs.readFileSync(path.join(repo, "src/parametricEngine.ts"), "utf8").replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(src).not.toMatch(/Math\.random|Date\.|new Date|crypto|\beval\s*\(|new Function|Function\(|import\(|require\(|document\.|window\.|fetch\(|process\./);
    expect(src).not.toMatch(/^import /m);                                                              // dependency-free
  });
});
