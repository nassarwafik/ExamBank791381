// Phase 20F — SmartSim through the composer. The model never writes a plugin config or a check: it fills a bounded SIMULATION SPEC that
// can only name catalog entries, and CODE builds the public envelope and the PRIVATE weighted checks:
//   networkTopology@2 — the AI picks a curriculum scenario id; config + checks are the production template (code-owned, pinned to give no
//                       free credit). A composite part may take a SUBSET of the scenario's check ids.
//   physicsFreeFall@1 — the AI picks a bounded model and task kinds; every expected value is COMPUTED by code from the model (never typed
//                       by the AI); apex tasks exist only for an upward throw.
//   functionStudy2d@1 — the AI picks a language-2 expression, a window, the task groups and the expected answers (the academic key, like an
//                       MCQ index); code PROBES each expected value numerically against the expression and refuses an inconsistent key.
// Then the production validators decide (validateSmartSimEnvelope / validateSmartSimAnswerKey) and the NO-FREE-CREDIT gate runs: the
// key evaluated on an empty action stream must award nothing.
import { validateSmartSimEnvelope, validateSmartSimAnswerKey, evaluateSmartSim } from "../trustedSimQuestion";
import "../trustedSimPlugins";
import { impactTime, peakHeight, validateFreeFallConfig, type FreeFallConfigV1, type FreeFallModel } from "../physicsFreeFallModel";
import { compileFunction, evaluateFunctionAt, validateFunctionStudyConfig, FUNCTION_STUDY_TASKS } from "../functionStudyModel";
import { net2TemplateById } from "../networkTopology2/net2Templates";
import { COMPOSER_LIMITS, type ComposerIssue } from "./composerLimits";
import { COMPOSER_FUNCTION_TASKS, COMPOSER_NET_SCENARIOS, COMPOSER_PHYSICS_MEASUREMENTS, COMPOSER_PHYSICS_POINTS, COMPOSER_SIM_PLUGIN_KEYS, composerSimVersion, type ComposerSimPluginKey } from "./composerCatalog";
import { cleanText, hasExactKeys, isArr, isEnum, isNum, isStr, sArr, sEnum, sNull, sNum, sObj, sStr, type JsonSchema } from "./composerSchemaKit";

export type SimCheck = { id: string; label: string; weight: number; kind: string } & Record<string, unknown>;
export type SimEnvelope = { schemaVersion: 1; pluginKey: string; pluginVersion: number; config: unknown };
export type BuiltSim = { plugin: ComposerSimPluginKey; title: string; instructions: string; envelope: SimEnvelope; checks: SimCheck[] };
type R<T> = { ok: true; value: T } | { ok: false; issues: ComposerIssue[] };
const fail = <T>(code: string, message: string, path?: string): R<T> => ({ ok: false, issues: [{ code, message, ...(path ? { path } : {}) }] });
const L = COMPOSER_LIMITS;
const INTERVAL_KINDS = ["increasing", "decreasing"] as const;

export function buildSimSpecSchema(): JsonSchema {
  return sObj({
    plugin: sEnum(COMPOSER_SIM_PLUGIN_KEYS), title: sStr(), instructions: sStr(),
    network: sNull(sObj({ scenario: sEnum(COMPOSER_NET_SCENARIOS) })),
    physics: sNull(sObj({ initialHeight: sNum(), initialVelocity: sNum(), gravity: sNum(), measurements: sArr(sEnum(COMPOSER_PHYSICS_MEASUREMENTS), COMPOSER_PHYSICS_MEASUREMENTS.length), probeTime: sNum(), points: sArr(sEnum(COMPOSER_PHYSICS_POINTS), COMPOSER_PHYSICS_POINTS.length) })),
    function: sNull(sObj({
      source: sStr(), xMin: sNum(), xMax: sNum(), yMin: sNum(), yMax: sNum(), tasks: sArr(sEnum(COMPOSER_FUNCTION_TASKS), COMPOSER_FUNCTION_TASKS.length),
      domainExclusions: sArr(sNum(), 10), xIntercepts: sArr(sNum(), 10), yIntercept: sNull(sNum()), verticalAsymptotes: sArr(sNum(), 10), horizontalAsymptotes: sArr(sNum(), 2),
      extrema: sArr(sObj({ kind: sEnum(["min", "max"]), x: sNum(), y: sNum() }), 10), intervals: sArr(sObj({ kind: sEnum(INTERVAL_KINDS), from: sStr(), to: sStr() }), 12)
    }))
  });
}
const SPEC_KEYS = ["plugin", "title", "instructions", "network", "physics", "function"] as const;

// ── physics: labels / units of the task vocabulary (code-owned) ─────────────────────────────────────────────────────────────────────
const MEASURE: Record<string, { id: string; label: string; unit: "s" | "m" | "m/s" }> = {
  impactTime: { id: "impactTime", label: "زمن الوصول إلى الأرض", unit: "s" }, impactSpeed: { id: "impactSpeed", label: "سرعة الارتطام (مقدار)", unit: "m/s" },
  maxHeight: { id: "maxHeight", label: "أقصى ارتفاع يبلغه الجسم", unit: "m" }, apexTime: { id: "apexTime", label: "زمن الوصول إلى أعلى نقطة", unit: "s" },
  heightAtTime: { id: "heightAtT", label: "الارتفاع عند زمن الفحص", unit: "m" }, velocityAtTime: { id: "velocityAtT", label: "السرعة المتجهة عند زمن الفحص (الأعلى موجب)", unit: "m/s" }
};
const POINT: Record<string, { id: string; label: string }> = {
  impactPoint: { id: "impactPoint", label: "نقطة الارتطام على منحنى الارتفاع–الزمن" }, apexPoint: { id: "apexPoint", label: "أعلى نقطة على منحنى الارتفاع–الزمن" },
  trajectoryPoint: { id: "trajPoint", label: "نقطة من منحنى الارتفاع–الزمن" }
};
const r6 = (n: number) => Number(n.toFixed(6));

function buildPhysics(p: unknown, path: string): R<{ config: FreeFallConfigV1; checks: SimCheck[] }> {
  if (!hasExactKeys(p, ["initialHeight", "initialVelocity", "gravity", "measurements", "probeTime", "points"])) return fail("AI_SIM_SPEC_MALFORMED", "مواصفة محاكاة السقوط الحر غير صالحة.", path);
  if (!isNum(p.initialHeight, -1e9, 1e9) || !isNum(p.initialVelocity, -1e9, 1e9) || !isNum(p.gravity, -1e9, 1e9) || !isNum(p.probeTime, -1e9, 1e9)) return fail("AI_SIM_SPEC_MALFORMED", "قيم النموذج الفيزيائي غير عددية.", path);
  const ms = p.measurements, ps = p.points;
  if (!isArr(ms, COMPOSER_PHYSICS_MEASUREMENTS.length) || !ms.every(m => isEnum(m, COMPOSER_PHYSICS_MEASUREMENTS)) || new Set(ms).size !== ms.length) return fail("AI_SIM_SPEC_MALFORMED", "مهام القياس غير صالحة.", path);
  if (!isArr(ps, COMPOSER_PHYSICS_POINTS.length) || !ps.every(m => isEnum(m, COMPOSER_PHYSICS_POINTS)) || new Set(ps).size !== ps.length) return fail("AI_SIM_SPEC_MALFORMED", "مهام النقاط غير صالحة.", path);
  if (!ms.length && !ps.length) return fail("AI_SIM_TASK_INVALID", "أضف مهمة قياس أو نقطة واحدة على الأقل.", path);
  const model: FreeFallModel = { initialHeight: p.initialHeight, initialVelocity: p.initialVelocity, gravity: p.gravity };
  const upward = model.initialVelocity > 0;
  const probe = (ms as string[]).some(m => m === "heightAtTime" || m === "velocityAtTime");
  if (!upward && ((ms as string[]).some(m => m === "maxHeight" || m === "apexTime") || (ps as string[]).includes("apexPoint"))) return fail("AI_SIM_TASK_INVALID", "مهام أعلى نقطة تخص القذف إلى الأعلى فقط (السرعة الابتدائية موجبة).", path);
  let end = NaN;
  try { end = impactTime(model); } catch { end = NaN; }
  const view = { maxTime: Number.isFinite(end) ? Math.min(COMPOSER_LIMITS.durationMax, Math.max(0.5, Math.ceil(end * 1.15 * 2) / 2)) : 1, showVelocityGraph: true };
  const config = { v: 1 as const, model, view, tasks: { measurements: (ms as string[]).map(m => ({ ...MEASURE[m] })), points: (ps as string[]).map(x => ({ ...POINT[x] })) } };
  const v = validateFreeFallConfig(config);
  if (!v.ok) return { ok: false, issues: v.issues.map(i => ({ code: "AI_SIM_CONFIG_INVALID", message: i.message, path })) };
  if (probe && !(p.probeTime > 0 && p.probeTime < end)) return fail("AI_SIM_TASK_INVALID", "زمن الفحص يجب أن يقع داخل الحركة (بين 0 ولحظة الارتطام).", path);
  const t = p.probeTime;
  const checks: SimCheck[] = [];
  for (const m of ms as string[]) {
    if (m === "impactTime") checks.push({ id: "impact-time", label: "زمن الوصول إلى الأرض", weight: 3, kind: "physics.impactTime", measurementId: "impactTime", tolerance: 0.05 });
    if (m === "impactSpeed") checks.push({ id: "impact-speed", label: "سرعة الارتطام", weight: 3, kind: "physics.impactSpeed", measurementId: "impactSpeed", tolerance: 0.1 });
    if (m === "maxHeight") checks.push({ id: "max-height", label: "أقصى ارتفاع", weight: 2, kind: "numericNear@1", valueId: "maxHeight", expected: r6(peakHeight(model)), tolerance: 0.05 });
    if (m === "apexTime") checks.push({ id: "apex-time", label: "زمن أعلى نقطة", weight: 2, kind: "numericNear@1", valueId: "apexTime", expected: r6(model.initialVelocity / model.gravity), tolerance: 0.05 });
    if (m === "heightAtTime") checks.push({ id: "height-at-t", label: "الارتفاع عند زمن الفحص", weight: 2, kind: "physics.heightAtTime", measurementId: "heightAtT", time: t, tolerance: 0.05 });
    if (m === "velocityAtTime") checks.push({ id: "velocity-at-t", label: "السرعة المتجهة عند زمن الفحص", weight: 1, kind: "physics.velocityAtTime", measurementId: "velocityAtT", time: t, tolerance: 0.05 });
  }
  for (const x of ps as string[]) {
    if (x === "impactPoint") checks.push({ id: "impact-point", label: "نقطة الارتطام على المنحنى", weight: 2, kind: "pointNear@1", pointId: "impactPoint", expected: { x: r6(end), y: 0 }, tolerance: 0.05 });
    if (x === "apexPoint") checks.push({ id: "apex-point", label: "أعلى نقطة على المنحنى", weight: 2, kind: "pointNear@1", pointId: "apexPoint", expected: { x: r6(model.initialVelocity / model.gravity), y: r6(peakHeight(model)) }, tolerance: 0.05 });
    if (x === "trajectoryPoint") checks.push({ id: "trajectory-point", label: "نقطة على منحنى الحركة", weight: 1, kind: "physics.pointOnTrajectory", pointId: "trajPoint", tolerance: 0.1 });
  }
  return { ok: true, value: { config: v.config, checks } };
}

// ── function study: the AI's key, numerically probed against the expression (structure + consistency, not academic proof) ──────────
const parseBound = (s: string): number | "-inf" | "+inf" | null => {
  const t = s.trim().toLowerCase();
  if (t === "-inf" || t === "-∞") return "-inf";
  if (t === "+inf" || t === "inf" || t === "+∞" || t === "∞") return "+inf";
  const n = Number(t);
  return t !== "" && Number.isFinite(n) ? n : null;
};
function buildFunction(f: unknown, path: string): R<{ config: unknown; checks: SimCheck[] }> {
  const keys = ["source", "xMin", "xMax", "yMin", "yMax", "tasks", "domainExclusions", "xIntercepts", "yIntercept", "verticalAsymptotes", "horizontalAsymptotes", "extrema", "intervals"] as const;
  if (!hasExactKeys(f, keys) || !isStr(f.source, 400, 1) || ![f.xMin, f.xMax, f.yMin, f.yMax].every(v => isNum(v, -1e9, 1e9))) return fail("AI_SIM_SPEC_MALFORMED", "مواصفة دراسة الدالة غير صالحة.", path);
  if (!isArr(f.tasks, FUNCTION_STUDY_TASKS.length) || !f.tasks.length || !f.tasks.every(t => isEnum(t, FUNCTION_STUDY_TASKS)) || new Set(f.tasks).size !== f.tasks.length) return fail("AI_SIM_SPEC_MALFORMED", "مهام دراسة الدالة غير صالحة.", path);
  const nums = (v: unknown, max: number): v is number[] => isArr(v, max) && v.every(x => isNum(x, -1e6, 1e6));
  if (!nums(f.domainExclusions, 10) || !nums(f.xIntercepts, 10) || !nums(f.verticalAsymptotes, 10) || !nums(f.horizontalAsymptotes, 2) || !(f.yIntercept === null || isNum(f.yIntercept, -1e6, 1e6))) return fail("AI_SIM_SPEC_MALFORMED", "قيم مفتاح الدالة غير عددية.", path);
  if (!isArr(f.extrema, 10) || !f.extrema.every(e => hasExactKeys(e, ["kind", "x", "y"]) && (e.kind === "min" || e.kind === "max") && isNum(e.x, -1e6, 1e6) && isNum(e.y, -1e6, 1e6))) return fail("AI_SIM_SPEC_MALFORMED", "القيم القصوى غير صالحة.", path);
  if (!isArr(f.intervals, 12) || !f.intervals.every(e => hasExactKeys(e, ["kind", "from", "to"]) && isEnum(e.kind, INTERVAL_KINDS) && isStr(e.from, 20) && isStr(e.to, 20))) return fail("AI_SIM_SPEC_MALFORMED", "فترات التزايد والتناقص غير صالحة.", path);
  const tasks = Object.fromEntries(FUNCTION_STUDY_TASKS.map(t => [t, (f.tasks as string[]).includes(t)])) as Record<string, boolean>;
  const config = { v: 1, expression: { language: 2, variable: "x", source: f.source.trim() }, window: { xMin: f.xMin, xMax: f.xMax, yMin: f.yMin, yMax: f.yMax, sampleCount: 701 }, tasks };
  const vc = validateFunctionStudyConfig(config);
  if (!vc.ok) return { ok: false, issues: vc.issues.map(i => ({ code: "AI_SIM_CONFIG_INVALID", message: i.message, path })) };
  const c = compileFunction(config.expression.source);
  if (!c.ok) return fail("AI_SIM_CONFIG_INVALID", "تعبير الدالة غير صالح في لغة التعبيرات الآمنة.", path);
  const at = (x: number): number | null => { const r = evaluateFunctionAt(c.ast, x); return r.ok ? r.value : null; };
  const near = (a: number | null, b: number, tol = 0.01) => a !== null && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
  const issues: ComposerIssue[] = [];
  const bad = (m: string) => issues.push({ code: "AI_FUNCTION_KEY_INCONSISTENT", message: "مفتاح دراسة الدالة لا يطابق التعبير: " + m, path });
  const ex = f.domainExclusions as number[], xi = f.xIntercepts as number[], va = f.verticalAsymptotes as number[], ha = f.horizontalAsymptotes as number[];
  const ext = f.extrema as { kind: "min" | "max"; x: number; y: number }[];
  if (tasks.domainExclusions) for (const x of ex) if (at(x) !== null) bad("الدالة معرّفة عند x = " + x + ".");
  if (tasks.verticalAsymptotes) for (const x of va) { const a = at(x - 1e-6), b = at(x + 1e-6); if (at(x) !== null || (a !== null && Math.abs(a) < 1e3 && b !== null && Math.abs(b) < 1e3)) bad("لا يوجد خط تقارب رأسي عند x = " + x + "."); }
  if (tasks.xIntercepts) for (const x of xi) if (!near(at(x), 0)) bad("f(" + x + ") ≠ 0.");
  if (tasks.yIntercept) { if (f.yIntercept === null) bad("المقطع الصادي مفقود."); else if (!near(at(0), f.yIntercept as number)) bad("f(0) ≠ " + f.yIntercept + "."); }
  if (tasks.horizontalAsymptotes) for (const y of ha) if (!near(at(1e4), y, 0.02) && !near(at(-1e4), y, 0.02)) bad("لا يقترب منحنى الدالة من y = " + y + ".");
  if (tasks.extrema) for (const e of ext) {
    const y = at(e.x), l = at(e.x - 1e-3), r = at(e.x + 1e-3);
    if (!near(y, e.y) || l === null || r === null || (e.kind === "min" ? !(l >= (y as number) - 1e-9 && r >= (y as number) - 1e-9) : !(l <= (y as number) + 1e-9 && r <= (y as number) + 1e-9))) bad("النقطة (" + e.x + ", " + e.y + ") ليست " + (e.kind === "min" ? "قيمة صغرى" : "قيمة عظمى") + " محلية.");
  }
  const intervals: { kind: string; from: number | "-inf" | "+inf"; to: number | "-inf" | "+inf" }[] = [];
  if (tasks.monotonicIntervals) for (const iv of f.intervals as { kind: string; from: string; to: string }[]) {
    const a = parseBound(iv.from), b = parseBound(iv.to);
    if (a === null || b === null || a === "+inf" || b === "-inf") { bad("حدود فترة غير صالحة."); continue; }
    intervals.push({ kind: iv.kind, from: a, to: b });
    const lo = a === "-inf" ? (typeof b === "number" ? b - 10 : -10) : a, hi = b === "+inf" ? (typeof a === "number" ? a + 10 : 10) : b;
    if (!(lo < hi)) { bad("فترة فارغة."); continue; }
    const m = (lo + hi) / 2, y1 = at(m - 1e-4), y2 = at(m + 1e-4);
    if (y1 === null || y2 === null || (iv.kind === "increasing" ? !(y2 > y1) : !(y2 < y1))) bad("الدالة ليست " + (iv.kind === "increasing" ? "متزايدة" : "متناقصة") + " على (" + iv.from + ", " + iv.to + ").");
  }
  if (issues.length) return { ok: false, issues };
  const checks: SimCheck[] = [];
  const T = 0.01;
  if (tasks.domainExclusions) checks.push({ id: "domain", label: "استثناءات المجال", weight: 2, kind: "domain.exclusions", expected: ex, tolerance: T });
  if (tasks.xIntercepts) checks.push({ id: "x-intercepts", label: "المقاطع السينية", weight: 1, kind: "intercepts.x", expected: xi.map(x => ({ x, y: 0 })), tolerance: T });
  if (tasks.yIntercept) checks.push({ id: "y-intercept", label: "المقطع الصادي", weight: 1, kind: "intercept.y", expected: f.yIntercept, tolerance: T });
  if (tasks.verticalAsymptotes) checks.push({ id: "vertical-asymptotes", label: "خطوط التقارب الرأسية", weight: 2, kind: "asymptotes.vertical", expected: va, tolerance: T });
  if (tasks.horizontalAsymptotes) checks.push({ id: "horizontal-asymptotes", label: "خطوط التقارب الأفقية", weight: 1, kind: "asymptotes.horizontal", expected: ha, tolerance: T });
  if (tasks.extrema) checks.push({ id: "extrema", label: "القيم القصوى المحلية", weight: 3, kind: "extrema.points", expected: ext.map(e => ({ kind: e.kind, x: e.x, y: e.y })), tolerance: T });
  if (tasks.monotonicIntervals) checks.push({ id: "monotonic", label: "فترات التزايد والتناقص", weight: 3, kind: "monotonic.intervals", tolerance: T, expected: intervals });
  return { ok: true, value: { config: vc.config, checks } };
}

/** Normalizes a SIM SPEC into a built simulator (envelope + full private check catalog) — production validators decide; no free credit. */
export function buildSimFromSpec(raw: unknown, path = "smartSim", expectPlugin?: ComposerSimPluginKey | null, expectScenario?: string | null): R<BuiltSim> {
  if (!hasExactKeys(raw, SPEC_KEYS) || !isEnum(raw.plugin, COMPOSER_SIM_PLUGIN_KEYS) || !isStr(raw.title, L.titleChars) || !isStr(raw.instructions, L.goalChars * 4)) return fail("AI_SIM_SPEC_MALFORMED", "مواصفة المحاكاة غير صالحة البنية.", path);
  const plugin = raw.plugin as ComposerSimPluginKey;
  if (expectPlugin && plugin !== expectPlugin) return fail("AI_SIM_PLUGIN_MISMATCH", "المحاكي المستخدم لا يطابق الخطة.", path);
  const others = { networkTopology: ["physics", "function"], physicsFreeFall: ["network", "function"], functionStudy2d: ["network", "physics"] }[plugin];
  if (others.some(k => raw[k] !== null)) return fail("AI_SIM_SPEC_MALFORMED", "مواصفة المحاكاة تحتوي إعدادات محاكٍ آخر.", path);
  let config: unknown, checks: SimCheck[];
  if (plugin === "networkTopology") {
    const n = raw.network;
    if (!hasExactKeys(n, ["scenario"]) || !isEnum(n.scenario, COMPOSER_NET_SCENARIOS)) return fail("AI_SIM_SPEC_MALFORMED", "سيناريو الشبكة غير معروف.", path);
    if (expectScenario && n.scenario !== expectScenario) return fail("AI_SIM_PLUGIN_MISMATCH", "سيناريو الشبكة لا يطابق الخطة.", path);
    const t = net2TemplateById(n.scenario)!;
    config = t.config(); checks = t.checks() as SimCheck[];
  } else if (plugin === "physicsFreeFall") {
    const b = buildPhysics(raw.physics, path); if (!b.ok) return b; config = b.value.config; checks = b.value.checks;
  } else {
    const b = buildFunction(raw.function, path); if (!b.ok) return b; config = b.value.config; checks = b.value.checks;
  }
  const envelope: SimEnvelope = { schemaVersion: 1, pluginKey: plugin, pluginVersion: composerSimVersion(plugin)!, config };
  const env = validateSmartSimEnvelope(envelope);
  if (!env.ok) return { ok: false, issues: env.issues.map(i => ({ code: "AI_SIM_CONFIG_INVALID", message: i.message, path })) };
  const key = validateSmartSimAnswerKey({ scoring: "proportional", checks }, env.plugin, env.envelope.config);
  if (!key.ok) return { ok: false, issues: key.issues.map(i => ({ code: "AI_SIM_CHECKS_INVALID", message: i.message, path })) };
  return { ok: true, value: { plugin, title: cleanText(raw.title), instructions: cleanText(raw.instructions), envelope, checks } };
}

/** NO FREE CREDIT: the key evaluated on an EMPTY action stream (the untouched initial state) must award nothing. */
export function simFreeCreditIssues(envelope: SimEnvelope, checks: SimCheck[], path: string): ComposerIssue[] {
  const e = evaluateSmartSim({ envelope, answerKey: { scoring: "proportional", checks }, response: { kind: "smartSim", pluginKey: envelope.pluginKey, pluginVersion: envelope.pluginVersion, actions: [], state: {} }, maxMarks: 1 });
  if (!e.valid) return [{ code: "AI_SIM_CHECKS_INVALID", message: "مفتاح المحاكاة غير صالح.", path }];
  return e.passedWeight > 0 ? [{ code: "AI_SIM_FREE_CREDIT", message: "فحوص المحاكاة تمنح علامات قبل أي عمل من الطالب (الحالة الابتدائية تحقق بعضها).", path }] : [];
}
