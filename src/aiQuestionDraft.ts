// Phase 19A — AI-ASSISTED QUESTION AUTHORING: the deterministic layer between an AI model and the exam. Pure (no React, no DOM,
// no I/O): compiled into the shared server build (the endpoint) and used by the Builder dialog (client-side re-verification).
//
// The AI only PROPOSES: one typed draft in a strict JSON schema (intent + the payload of that intent). This module
//   1. checks the AI output SHAPE strictly (exact keys, types, no prototype-sensitive keys) — malformed output is refused;
//   2. resolves the intent: ordinary families, inlineCloze and networkCli are generated; simulation / coding are recognised but
//      never generated (they need a teacher package / teacher-verified hidden tests); "unsupported" is refused;
//   3. guards the simulator: a networkCli draft is refused when the AI declares, or the request clearly asks for, a capability the
//      V1 managed SWITCH does not have (routing, OSPF, ACL, NAT, DHCP, …) or when the AI marks its intent ambiguous;
//   4. MAPS the draft to the canonical node of its type (deterministic, field by field — nothing invented, nothing repaired);
//   5. lets the SAME canonical validators manual authoring uses decide validity (validateStructuredExam → the registered type
//      validators validateNetworkCliQuestion / validateInlineClozeQuestion and the legacy structural rules). Invalid ⇒ refused
//      with the validator's issues; the AI result is never patched into validity after the fact.
// The request signals below are ADVISORY (they shape the prompt and add a conservative simulator guard); they are never the sole
// authority for anything that is generated.
import { validateStructuredExam } from "./examQuality";
import { normalizeInterfaceName } from "./networkCliEngine";
import type { BuilderQuestion, StructuredExam } from "./examTypes";

export const AI_AUTHOR_INTENTS = Object.freeze(["multipleChoice", "trueFalse", "shortAnswer", "fillBlank", "inlineCloze", "networkCli", "parametricNumeric", "hotspot", "labelDiagram", "simulation", "coding", "unsupported"] as const);
export type AiAuthorIntent = (typeof AI_AUTHOR_INTENTS)[number];
/** The intents this layer generates a question for (simulation / coding / unsupported are recognised, never generated). */
export const AI_GENERATED_TYPES: readonly string[] = Object.freeze(["multipleChoice", "trueFalse", "shortAnswer", "fillBlank", "inlineCloze", "networkCli", "parametricNumeric"]);
export const AI_AUTHOR_LIMITS = Object.freeze({ requestChars: 2000, textChars: 4000, explanationChars: 1000, capabilities: 20, capabilityChars: 100, options: 8, fillBlanks: 10, pieces: 100, pieceOptions: 12, accepted: 20, stringChars: 500, vlans: 64, interfaces: 32, paramVariables: 20, paramConstraints: 20 });
export const AI_DRAFT_QUESTION_ID = "ai-draft";

export type AiAuthorIssue = { code: string; message: string };
export type AiAuthorResult =
  | { ok: true; intent: AiAuthorIntent; question: BuilderQuestion; notes: string[] }
  | { ok: false; code: string; message: string; intent?: AiAuthorIntent; issues: AiAuthorIssue[] };

// ── request signals (advisory) ─────────────────────────────────────────────────────────────────────────────────────────────
const NETWORK_SIGNAL = /(\bswitch(?:es)?\b|سويتش|سويچ|مبدّل|مبدل|\bvlans?\b|\btrunk\b|ترانك|\bcli\b|cisco|سيسكو|switchport|native\s*vlan|\bsvi\b|المنافذ|منفذ|منافذ|network\s+simulator|محاكي\s*(?:أوامر\s*)?(?:الشبكة|شبكة|سويتش))/i;
const CLOZE_SIGNAL = /(فراغ|فراغات|\bcloze\b|\bblanks?\b|fill[-\s]?in|أكمل|اكمل|منسدلة|dropdowns?|drop-down)/i;
const PASSAGE_SIGNAL = /(فقرة|نص\s*تفاعلي|\bparagraph\b|\bpassage\b|\bcloze\b|\binline\b|منسدلة|dropdowns?|drop-down|قائمة)/i;
const CODING_SIGNAL = /(برمجة|برنامج|\bcode\b|\bcoding\b|python|بايثون|\bjava\b|جافا|c#|سي شارب)/i;
const SIMULATION_SIGNAL = /(smartsim|\.smartsim|حزمة\s*محاكاة|simulation\s+package)/i;
// Phase 19B — "different numbers for every student / attempt" (Arabic / English).
const PARAMETRIC_SIGNAL = /(\bparametric\b|random\s+(?:integers?|numbers?|values?)|different\s+(?:numeric\s+)?(?:version|numbers?|values?)\s+(?:for|per)\s+(?:each|every)\s+student|per[-\s]student\s+(?:numbers?|values?)|بأرقام\s+مختلفة|أرقام\s+مختلفة|قيم\s+مختلفة|(?:رقمي|حسابي|رياضيات)[^.؟?!]{0,30}(?:متغير|يتغير|متغيرة)|معطيات\s+متغيرة|يتغير\s+لكل\s+طالب|مختلفة\s+لكل\s+طالب|different\s+values?\s+for\s+(?:each|every)\s+student)/i;
// Phase 19D — visual requests (diacritics removed first): label the parts of a drawing / mark an area on an image.
const LABEL_DIAGRAM_SIGNAL = /((?:^|\s)سم\s+(?:أجزاء|اجزاء|مكونات|طبقات)|تسمية\s+(?:أجزاء|اجزاء|مكونات)|اسحب\s+التسميات|التسميات\s+(?:إلى|الى|على)|\blabel(?:l?ing)?\s+(?:the\s+)?(?:parts\s+of\s+(?:the\s+|a\s+)?)?diagram|\blabel\s+diagram|\bdrag\s+(?:the\s+)?labels\b)/i;
const HOTSPOT_SIGNAL = /((?:ينقر|انقر|النقر|اضغط|يضغط|حدد|يحدد|ظلل)[^.؟?!]{0,40}(?:الصورة|صورة|المخطط|الرسم)|\b(?:click|tap|select|mark|identify)\b[^.?!]{0,40}\b(?:image|picture|photo|diagram)\b|\bhotspot\b)/i;
const UNSUPPORTED_NETWORK: readonly [string, RegExp][] = [
  ["router", /\brouters?\b|\brouting\b|راوتر|الراوتر|موجّه|جهاز\s*التوجيه|بروتوكول(?:ات)?\s*(?:ال)?توجيه|التوجيه\s*(?:الثابت|الديناميكي)/i],
  ["ospf", /\bospf\b/i], ["eigrp", /\beigrp\b/i], ["rip", /\bripv?2?\b/i], ["bgp", /\bbgp\b/i],
  ["acl", /\bacls?\b|access-list|قوائم\s*التحكم\s*بالوصول/i], ["nat", /\bnat\b|\bpat\b/i], ["dhcp", /\bdhcp\b/i],
  ["static route", /ip\s+route|static\s+rout/i], ["spanning-tree", /spanning[-\s]?tree|\bstp\b/i], ["port-security", /port[-\s]?security/i],
  ["etherchannel", /etherchannel|port[-\s]?channel/i], ["vtp", /\bvtp\b/i], ["remote access", /\bssh\b|\btelnet\b/i],
  ["interface range", /interface\s+range/i], ["allowed vlan", /allowed\s+vlan/i], ["ping / traceroute", /\bping\b|traceroute/i], ["ipv6", /ipv6/i]
];
export type AuthorRequestSignals = { suggestedIntent: AiAuthorIntent | null; unsupportedCapabilities: string[] };
/** Advisory bilingual signals: the intent the request most plausibly names and any network capability outside networkCli@1. */
export function classifyAuthorRequest(request: string): AuthorRequestSignals {
  const t = String(request ?? "");
  const unsupportedCapabilities = UNSUPPORTED_NETWORK.filter(([, re]) => re.test(t)).map(([label]) => label);
  let suggestedIntent: AiAuthorIntent | null = null;
  const plain = t.replace(/[\u064B-\u0652]/g, "");
  if (SIMULATION_SIGNAL.test(t)) suggestedIntent = "simulation";
  else if (LABEL_DIAGRAM_SIGNAL.test(plain)) suggestedIntent = "labelDiagram";
  else if (HOTSPOT_SIGNAL.test(plain)) suggestedIntent = "hotspot";
  else if (PARAMETRIC_SIGNAL.test(t)) suggestedIntent = "parametricNumeric";
  else if (CODING_SIGNAL.test(t) && !NETWORK_SIGNAL.test(t)) suggestedIntent = "coding";
  else if (CLOZE_SIGNAL.test(t)) suggestedIntent = PASSAGE_SIGNAL.test(t) ? "inlineCloze" : "fillBlank";
  else if (NETWORK_SIGNAL.test(t)) suggestedIntent = "networkCli";
  return { suggestedIntent, unsupportedCapabilities };
}

// ── the strict schema the AI must fill (OpenAI structured outputs: every property required, nullable payloads) ──────────────
type JsonSchema = Record<string, unknown>;
const str = (): JsonSchema => ({ type: "string" });
const int = (minimum: number, maximum: number): JsonSchema => ({ type: "integer", minimum, maximum });
const obj = (properties: Record<string, JsonSchema>): JsonSchema => ({ type: "object", additionalProperties: false, properties, required: Object.keys(properties) });
const arr = (items: JsonSchema, maxItems: number): JsonSchema => ({ type: "array", items, maxItems });
const nullable = (s: JsonSchema): JsonSchema => ({ anyOf: [{ type: "null" }, s] });
const VLAN_ROW = obj({ id: int(1, 4094), name: str() });
const IFACE_ROW = obj({ name: str(), mode: { type: "string", enum: ["", "access", "trunk"] }, accessVlan: int(0, 4094), nativeVlan: int(0, 4094), adminState: { type: "string", enum: ["", "up", "shutdown"] }, ipAddress: str(), subnetMask: str() });
const numberSchema = (): JsonSchema => ({ type: "number" });
// Phase 19B — a variable row carries `name` (mapped to the canonical variable id); bounds are integers judged by the canonical validator.
// Phase 19C — v2 rows: an explicit kind (integer / decimal), numeric bounds and step (decimals allowed), and a display format.
const PARAM_FORMAT = obj({ kind: { type: "string", enum: ["plain", "fixed", "percentage"] }, decimals: int(0, 10) });
const PARAM_VAR_ROW = obj({ name: str(), kind: { type: "string", enum: ["integer", "decimal"] }, min: numberSchema(), max: numberSchema(), step: numberSchema(), format: PARAM_FORMAT });
const PARAM_DERIVED_ROW = obj({ name: str(), expression: str(), format: PARAM_FORMAT });
export function buildAiAuthorSchema() {
  return {
    type: "object" as const,
    additionalProperties: false as const,
    properties: {
      intent: { type: "string", enum: [...AI_AUTHOR_INTENTS] },
      confidence: { type: "string", enum: ["clear", "ambiguous"] },
      unsupportedCapabilities: arr(str(), AI_AUTHOR_LIMITS.capabilities),
      explanation: str(),
      text: str(),
      marks: int(1, 100),
      multipleChoice: nullable(obj({ options: arr(str(), AI_AUTHOR_LIMITS.options), correctIndex: int(-1, 7) })),
      trueFalse: nullable(obj({ correct: { type: "boolean" } })),
      shortAnswer: nullable(obj({ modelAnswer: str() })),
      fillBlank: nullable(obj({ blanks: arr(obj({ label: str(), correctText: str() }), AI_AUTHOR_LIMITS.fillBlanks) })),
      inlineCloze: nullable(obj({
        scoring: { type: "string", enum: ["proportional", "allOrNothing"] },
        pieces: arr(obj({ kind: { type: "string", enum: ["text", "textBlank", "dropdown"] }, text: str(), accepted: arr(str(), AI_AUTHOR_LIMITS.accepted), caseSensitive: { type: "boolean" }, options: arr(str(), AI_AUTHOR_LIMITS.pieceOptions), correctIndex: int(-1, 11) }), AI_AUTHOR_LIMITS.pieces)
      })),
      networkCli: nullable(obj({
        scoring: { type: "string", enum: ["proportional", "allOrNothing"] },
        initialHostname: str(), initialVlans: arr(VLAN_ROW, AI_AUTHOR_LIMITS.vlans), initialInterfaces: arr(IFACE_ROW, AI_AUTHOR_LIMITS.interfaces),
        targetHostname: str(), targetVlans: arr(VLAN_ROW, AI_AUTHOR_LIMITS.vlans), targetInterfaces: arr(IFACE_ROW, AI_AUTHOR_LIMITS.interfaces)
      })),
      parametricNumeric: nullable(obj({
        variables: arr(PARAM_VAR_ROW, AI_AUTHOR_LIMITS.paramVariables), derivedVariables: arr(PARAM_DERIVED_ROW, AI_AUTHOR_LIMITS.paramVariables), constraints: arr(str(), AI_AUTHOR_LIMITS.paramConstraints), answerExpression: str(),
        mode: { type: "string", enum: ["tolerance", "range"] }, tolerance: numberSchema(), below: numberSchema(), above: numberSchema(),
        unitMode: { type: "string", enum: ["none", "label", "input"] }, unitLabel: str(), unit: str()
      }))
    },
    required: ["intent", "confidence", "unsupportedCapabilities", "explanation", "text", "marks", "multipleChoice", "trueFalse", "shortAnswer", "fillBlank", "inlineCloze", "networkCli", "parametricNumeric"]
  };
}

/** The prompt: the exact type vocabulary, the networkCli@1 capability scope, the cloze rules, the safety rules and the advisory signals. */
export function buildAiAuthorPrompt(request: string, signals: AuthorRequestSignals, preferredType?: string): string {
  return [
    "You author exactly ONE assessment question for SmartAssess from a teacher's request. Return JSON that follows the schema exactly.",
    "Choose `intent` deliberately:",
    "- multipleChoice: 2-8 options, correctIndex is zero-based. trueFalse: a statement and its truth value. shortAnswer: an open question with an optional model answer.",
    "- fillBlank: an ordinary short completion with separate answer fields (one field per blank); never use it for passages with mixed controls.",
    "- inlineCloze: a passage whose blanks sit INSIDE the text. `pieces` in reading order: kind \"text\" (passage text), \"textBlank\" (the student types; `accepted` lists every accepted answer — synonyms, abbreviations, multi-word answers; `caseSensitive` only when case matters), \"dropdown\" (2-12 `options`, exactly ONE correct option via zero-based `correctIndex`). Mixed text blanks and dropdowns in any order are allowed.",
    "- networkCli: a deterministic educational managed SWITCH command-line simulator (networkCli@1). It is NOT a router and NOT Packet Tracer. The student types Cisco-like commands; grading compares the final device state with your target.",
    "  Supported scope ONLY: hostname; VLAN database (VLAN ids 2-4094 except 1002-1005, optional VLAN names); interfaces FastEthernet0/1 to FastEthernet0/24 and GigabitEthernet0/1 to GigabitEthernet0/2 with switchport mode access or trunk, access VLAN, trunk native VLAN, administrative state (up / shutdown); SVIs `Vlan<id>` with an IPv4 address and subnet mask (never on a physical port).",
    "  Fill `networkCli` with the initial state (usually hostname \"Switch\" and nothing else) and the TARGET state the student must reach. Every target value you set is one graded check; use \"\" / 0 for values that are not required. Use only the interface names above.",
    "  NOT supported (never invent them): routers, routing, static routes, OSPF, EIGRP, RIP, BGP, ACLs, NAT, DHCP, spanning-tree, port-security, EtherChannel, VTP, SSH / Telnet, interface range, trunk allowed VLAN lists, ping / traceroute, IPv6. If the request needs any of them, list them in `unsupportedCapabilities` and set intent \"unsupported\" (or choose an ordinary question type).",
    "- parametricNumeric: a numeric question whose numbers DIFFER for every student and attempt (math, physics, chemistry, subnet arithmetic). `text` is the stem with {{name}} placeholders for every generated value (e.g. \"A network needs {{hosts}} hosts…\"). `variables`: bounded variables { name (a letter then letters / digits / _), kind \"integer\" or \"decimal\" (at most 6 decimals), min, max, step, format } where (max - min) is a multiple of step. `derivedVariables`: optional values computed from variables or earlier derived values { name, expression, format } (e.g. area = a * b; never circular). `constraints`: optional single comparisons over variables and derived values such as \"a < b\", \"b != 0\" or \"sqrt(a) < b\". `answerExpression` computes the correct answer from the variables / derived values using ONLY numbers, names, + - * / % ^ (^ is pow), parentheses and abs, round(x, digits), floor, ceil, min, max, sqrt, pow, log (natural), log10, exp — no other functions, no code. `format` only changes how a value is WRITTEN in the stem: \"plain\", \"fixed\" (decimals places) or \"percentage\" (value × 100 with decimals places and %); grading always uses the exact values. For a percentage answer write the expression in percent, e.g. \"100 * correct / total\", with unitLabel \"%\". `mode` \"tolerance\" (with `tolerance` >= 0, 0 = exact) or \"range\" (`below` / `above` >= 0 around the result). `unitMode` \"none\", \"label\" (a fixed `unitLabel` shown next to the answer) or \"input\" (the student types the unit; the correct `unit` is graded). Never put the computed answer or the expression in `text`.",
    "- simulation: the teacher wants an uploaded interactive .smartsim simulation. coding: the student must write a program. Recognise them; do not invent their content (fill no payload).",
    "- hotspot: the student clicks / taps target areas on an IMAGE. labelDiagram: the student places labels from a bank on zones of a diagram IMAGE. You have no image and no geometry authority: recognise these intents but never invent coordinates, regions or zones — fill no payload; the teacher places them on an attached image.",
    "- unsupported: the request cannot be met with the types above; explain why in `explanation`.",
    "If the request is ambiguous, set confidence \"ambiguous\" and prefer a safe ordinary question (shortAnswer or multipleChoice) instead of a simulator.",
    "Fill ONLY the payload object of the chosen intent; set every other payload to null.",
    "Never put, include or reveal a correct answer, an accepted answer or the target configuration in `text` or in passage text pieces.",
    "Write the question in clear Arabic unless the teacher asks for English; CLI commands, interface names and protocol names stay in English. `marks` is a positive integer.",
    "Deterministic request signals (advisory only): Suggested intent: " + (signals.suggestedIntent ?? "none") + "; unsupported network capabilities detected: " + (signals.unsupportedCapabilities.join(", ") || "none") + ".",
    preferredType ? "Teacher preferred type: " + preferredType + "." : "",
    "Teacher request:",
    String(request)
  ].filter(Boolean).join("\n");
}

// ── strict AI-output shape ─────────────────────────────────────────────────────────────────────────────────────────────────
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const isPlain = (v: unknown): v is Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};
const hasForbiddenKey = (v: unknown, depth = 0): boolean => {
  if (depth > 8) return true;
  if (Array.isArray(v)) return v.some(x => hasForbiddenKey(x, depth + 1));
  if (v && typeof v === "object") return Object.keys(v).some(k => FORBIDDEN_KEYS.has(k) || hasForbiddenKey((v as Record<string, unknown>)[k], depth + 1));
  return false;
};
const exactKeys = (o: Record<string, unknown>, keys: readonly string[]) => Object.keys(o).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(o, k));
const isStr = (v: unknown, max: number = AI_AUTHOR_LIMITS.stringChars): v is string => typeof v === "string" && v.length <= max;
const isInt = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const strArr = (v: unknown, maxItems: number): v is string[] => Array.isArray(v) && v.length <= maxItems && v.every(x => isStr(x));
const ROOT_KEYS = ["intent", "confidence", "unsupportedCapabilities", "explanation", "text", "marks", "multipleChoice", "trueFalse", "shortAnswer", "fillBlank", "inlineCloze", "networkCli"];
// Phase 19B — `parametricNumeric` is required in the schema sent to the model; a 19A-shaped draft without it means "no payload".
const OPTIONAL_ROOT_KEYS = ["parametricNumeric"];
const PARAM_KEYS = ["variables", "constraints", "answerExpression", "mode", "tolerance", "below", "above", "unitMode", "unitLabel", "unit"];
type AiParamVar = { name: string; min: number; max: number; step: number };
type AiFormat = { kind: string; decimals: number };
type AiParamVarV2 = { name: string; kind: string; min: number; max: number; step: number; format: AiFormat };
type AiDerived = { name: string; expression: string; format: AiFormat };
// Phase 19C — a payload carrying `derivedVariables` is the v2 shape (variable rows with kind + format); without it, the Phase 19B
// shape (integer rows) maps to the v1 contract exactly as before. The strict schema sent to the model always requires the v2 keys.
type AiParametric = { variables: (AiParamVar | AiParamVarV2)[]; derivedVariables?: AiDerived[]; constraints: string[]; answerExpression: string; mode: string; tolerance: number; below: number; above: number; unitMode: string; unitLabel: string; unit: string };
const PIECE_KEYS = ["kind", "text", "accepted", "caseSensitive", "options", "correctIndex"];
const IFACE_KEYS = ["name", "mode", "accessVlan", "nativeVlan", "adminState", "ipAddress", "subnetMask"];
const NET_KEYS = ["scoring", "initialHostname", "initialVlans", "initialInterfaces", "targetHostname", "targetVlans", "targetInterfaces"];
type AiPiece = { kind: string; text: string; accepted: string[]; caseSensitive: boolean; options: string[]; correctIndex: number };
type AiIface = { name: string; mode: string; accessVlan: number; nativeVlan: number; adminState: string; ipAddress: string; subnetMask: string };
type AiVlan = { id: number; name: string };
type AiNet = { scoring: string; initialHostname: string; initialVlans: AiVlan[]; initialInterfaces: AiIface[]; targetHostname: string; targetVlans: AiVlan[]; targetInterfaces: AiIface[] };
type AiDraft = { intent: string; confidence: string; unsupportedCapabilities: string[]; explanation: string; text: string; marks: number; multipleChoice: { options: string[]; correctIndex: number } | null; trueFalse: { correct: boolean } | null; shortAnswer: { modelAnswer: string } | null; fillBlank: { blanks: { label: string; correctText: string }[] } | null; inlineCloze: { scoring: string; pieces: AiPiece[] } | null; networkCli: AiNet | null; parametricNumeric?: AiParametric | null };

// SHAPE only (types + generous bounds): semantic ranges (VLAN 1 / reserved / > 4094, ports, masks, …) are judged by the CANONICAL
// validator so the teacher sees its exact issue, never a generic "malformed" for a value the contract itself refuses.
const vlanRow = (v: unknown): v is AiVlan => isPlain(v) && exactKeys(v, ["id", "name"]) && isInt(v.id, 0, 99999) && isStr(v.name);
const ifaceRow = (v: unknown): v is AiIface => isPlain(v) && exactKeys(v, IFACE_KEYS) && isStr(v.name, 64) && isStr(v.mode, 16) && isInt(v.accessVlan, 0, 99999) && isInt(v.nativeVlan, 0, 99999) && isStr(v.adminState, 16) && isStr(v.ipAddress, 64) && isStr(v.subnetMask, 64);
const finiteNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const paramVarRow = (v: unknown): v is AiParamVar => isPlain(v) && exactKeys(v, ["name", "min", "max", "step"]) && isStr(v.name, 64) && [v.min, v.max, v.step].every(x => typeof x === "number" && Number.isSafeInteger(x));
const formatShape = (f: unknown): f is AiFormat => isPlain(f) && exactKeys(f, ["kind", "decimals"]) && isStr(f.kind, 16) && typeof f.decimals === "number" && Number.isInteger(f.decimals);
const paramVarRowV2 = (v: unknown): v is AiParamVarV2 => isPlain(v) && exactKeys(v, ["name", "kind", "min", "max", "step", "format"]) && isStr(v.name, 64) && isStr(v.kind, 16) && finiteNum(v.min) && finiteNum(v.max) && finiteNum(v.step) && formatShape(v.format);
const derivedRow = (v: unknown): v is AiDerived => isPlain(v) && exactKeys(v, ["name", "expression", "format"]) && isStr(v.name, 64) && isStr(v.expression) && formatShape(v.format);
const paramShapeOk = (p: unknown): p is AiParametric => isPlain(p) && (Object.prototype.hasOwnProperty.call(p, "derivedVariables") ? exactKeys(p, [...PARAM_KEYS, "derivedVariables"]) && Array.isArray(p.derivedVariables) && p.derivedVariables.length <= AI_AUTHOR_LIMITS.paramVariables && p.derivedVariables.every(derivedRow) && Array.isArray(p.variables) && p.variables.length <= AI_AUTHOR_LIMITS.paramVariables && p.variables.every(paramVarRowV2) : exactKeys(p, PARAM_KEYS) && Array.isArray(p.variables) && p.variables.length <= AI_AUTHOR_LIMITS.paramVariables && p.variables.every(paramVarRow))
  && strArr(p.constraints, AI_AUTHOR_LIMITS.paramConstraints) && isStr(p.answerExpression) && isStr(p.mode, 16) && finiteNum(p.tolerance) && finiteNum(p.below) && finiteNum(p.above) && isStr(p.unitMode, 16) && isStr(p.unitLabel, 64) && isStr(p.unit, 64);
function shapeOk(raw: unknown): raw is AiDraft {
  if (!isPlain(raw) || hasForbiddenKey(raw) || !ROOT_KEYS.every(k => Object.prototype.hasOwnProperty.call(raw, k)) || Object.keys(raw).some(k => !ROOT_KEYS.includes(k) && !OPTIONAL_ROOT_KEYS.includes(k))) return false;
  if (raw.parametricNumeric !== undefined && raw.parametricNumeric !== null && !paramShapeOk(raw.parametricNumeric)) return false;
  if (typeof raw.intent !== "string" || (raw.confidence !== "clear" && raw.confidence !== "ambiguous")) return false;
  if (!strArr(raw.unsupportedCapabilities, AI_AUTHOR_LIMITS.capabilities) || !raw.unsupportedCapabilities.every(c => c.length <= AI_AUTHOR_LIMITS.capabilityChars)) return false;
  if (!isStr(raw.explanation, AI_AUTHOR_LIMITS.explanationChars) || !isStr(raw.text, AI_AUTHOR_LIMITS.textChars) || !isInt(raw.marks, 1, 100)) return false;
  const mc = raw.multipleChoice, tf = raw.trueFalse, sa = raw.shortAnswer, fb = raw.fillBlank, ic = raw.inlineCloze, nc = raw.networkCli;
  if (mc !== null && !(isPlain(mc) && exactKeys(mc, ["options", "correctIndex"]) && strArr(mc.options, AI_AUTHOR_LIMITS.options) && isInt(mc.correctIndex, -1, 99))) return false;
  if (tf !== null && !(isPlain(tf) && exactKeys(tf, ["correct"]) && typeof tf.correct === "boolean")) return false;
  if (sa !== null && !(isPlain(sa) && exactKeys(sa, ["modelAnswer"]) && isStr(sa.modelAnswer, AI_AUTHOR_LIMITS.textChars))) return false;
  if (fb !== null && !(isPlain(fb) && exactKeys(fb, ["blanks"]) && Array.isArray(fb.blanks) && fb.blanks.length <= AI_AUTHOR_LIMITS.fillBlanks && fb.blanks.every(b => isPlain(b) && exactKeys(b, ["label", "correctText"]) && isStr(b.label) && isStr(b.correctText)))) return false;
  if (ic !== null && !(isPlain(ic) && exactKeys(ic, ["scoring", "pieces"]) && isStr(ic.scoring, 32) && Array.isArray(ic.pieces) && ic.pieces.length <= AI_AUTHOR_LIMITS.pieces && ic.pieces.every(p => isPlain(p) && exactKeys(p, PIECE_KEYS) && isStr(p.kind, 16) && isStr(p.text, 2000) && strArr(p.accepted, AI_AUTHOR_LIMITS.accepted) && typeof p.caseSensitive === "boolean" && strArr(p.options, AI_AUTHOR_LIMITS.pieceOptions) && isInt(p.correctIndex, -1, 99)))) return false;
  if (nc !== null && !(isPlain(nc) && exactKeys(nc, NET_KEYS) && isStr(nc.scoring, 32) && isStr(nc.initialHostname, 64) && isStr(nc.targetHostname, 64)
    && Array.isArray(nc.initialVlans) && nc.initialVlans.length <= AI_AUTHOR_LIMITS.vlans && nc.initialVlans.every(vlanRow)
    && Array.isArray(nc.targetVlans) && nc.targetVlans.length <= AI_AUTHOR_LIMITS.vlans && nc.targetVlans.every(vlanRow)
    && Array.isArray(nc.initialInterfaces) && nc.initialInterfaces.length <= AI_AUTHOR_LIMITS.interfaces && nc.initialInterfaces.every(ifaceRow)
    && Array.isArray(nc.targetInterfaces) && nc.targetInterfaces.length <= AI_AUTHOR_LIMITS.interfaces && nc.targetInterfaces.every(ifaceRow))) return false;
  return true;
}

// ── deterministic mapping AI draft → canonical node ────────────────────────────────────────────────────────────────────────
type Mapped = { node: Record<string, unknown>; issues: AiAuthorIssue[] };
const base = (d: AiDraft, presentationType: string): Record<string, unknown> => ({ examQuestionId: AI_DRAFT_QUESTION_ID, presentationType, text: d.text, marks: d.marks });

function mapNetworkCli(d: AiDraft, n: AiNet): Mapped {
  const issues: AiAuthorIssue[] = [];
  const vlans = (rows: AiVlan[]) => { const out: Record<string, { name?: string }> = {}; for (const r of rows) { const id = String(r.id); if (out[id]) issues.push({ code: "AI_NETCLI_DUPLICATE_VLAN", message: "VLAN " + id + " مكرّرة في المسودة." }); out[id] = r.name !== "" ? { name: r.name } : {}; } return out; };
  // Interface names are canonicalized by the ENGINE's own spelling authority; an unknown name is kept as written so the canonical
  // validator refuses it (never guessed into a real port). Two spellings of one interface are refused (no silent merge).
  const interfaces = (rows: AiIface[]) => {
    const out: Record<string, Record<string, unknown>> = {};
    for (const r of rows) {
      const name = normalizeInterfaceName(r.name) ?? r.name;
      if (Object.prototype.hasOwnProperty.call(out, name)) { issues.push({ code: "AI_NETCLI_DUPLICATE_INTERFACE", message: "الواجهة «" + r.name + "» مذكورة أكثر من مرة في المسودة." }); continue; }
      const e: Record<string, unknown> = {};
      if (r.mode !== "") e.mode = r.mode;
      if (r.accessVlan !== 0) e.accessVlan = r.accessVlan;
      if (r.nativeVlan !== 0) e.nativeVlan = r.nativeVlan;
      if (r.adminState === "up") e.shutdown = false; else if (r.adminState === "shutdown") e.shutdown = true; else if (r.adminState !== "") e.shutdown = r.adminState;
      if (r.ipAddress !== "") e.ipAddress = r.ipAddress;
      if (r.subnetMask !== "") e.subnetMask = r.subnetMask;
      out[name] = e;
    }
    return out;
  };
  const target: Record<string, unknown> = {};
  if (n.targetHostname !== "") target.hostname = n.targetHostname;
  target.vlans = vlans(n.targetVlans);
  target.interfaces = interfaces(n.targetInterfaces);
  const node = {
    ...base(d, "networkCli"), questionTypeVersion: 1,
    networkCli: { device: "switch", initialState: { v: 1, device: "switch", hostname: n.initialHostname === "" ? "Switch" : n.initialHostname, vlans: vlans(n.initialVlans), interfaces: interfaces(n.initialInterfaces) } },
    answer: { targetState: target, scoring: n.scoring }
  };
  return { node, issues };
}

function mapInlineCloze(d: AiDraft, c: { scoring: string; pieces: AiPiece[] }): Mapped {
  // Presentation canonicalization only: empty text pieces are dropped and adjacent text pieces merged (the canonical passage has
  // no empty text segment). Blank ids b1..bn and option ids o1..on are deterministic. Grading data is mapped as written.
  const segments: Record<string, unknown>[] = [];
  const blanks: Record<string, unknown> = {};
  let n = 0;
  for (const p of c.pieces) {
    if (p.kind === "text") {
      if (p.text === "") continue;
      const last = segments[segments.length - 1];
      if (last && last.type === "text") last.text = String(last.text) + p.text; else segments.push({ type: "text", text: p.text });
      continue;
    }
    const id = "b" + ++n;
    if (p.kind === "textBlank") { segments.push({ type: "blank", id, control: "text" }); blanks[id] = { accepted: [...p.accepted], caseSensitive: p.caseSensitive }; continue; }
    if (p.kind === "dropdown") {
      segments.push({ type: "blank", id, control: "dropdown", options: p.options.map((label, i) => ({ id: "o" + (i + 1), label })) });
      blanks[id] = { correctOptionId: p.correctIndex >= 0 && p.correctIndex < p.options.length ? "o" + (p.correctIndex + 1) : "" };
      continue;
    }
    segments.push({ type: "blank", id, control: p.kind });                 // an unknown control is refused by the validator
  }
  return { node: { ...base(d, "inlineCloze"), questionTypeVersion: 1, inlineCloze: { v: 1, segments }, answer: { scoring: c.scoring, blanks } }, issues: [] };
}

function mapParametric(d: AiDraft, p: AiParametric): Mapped {
  // Field by field, nothing invented: `name` → the canonical variable id; the unit policy maps to the public response presentation
  // and (for "input") the private required unit. An unknown mode / unit mode is kept as written so the canonical validator refuses it.
  const response = p.unitMode === "label" ? { unit: "label", label: p.unitLabel } : p.unitMode === "input" ? { unit: "input" } : p.unitMode === "none" ? { unit: "none" } : { unit: p.unitMode };
  const answer: Record<string, unknown> = p.mode === "range" ? { expression: p.answerExpression, mode: "range", below: p.below, above: p.above } : p.mode === "tolerance" ? { expression: p.answerExpression, mode: "tolerance", tolerance: p.tolerance } : { expression: p.answerExpression, mode: p.mode };
  if (p.unitMode === "input") answer.unit = p.unit;
  if (p.derivedVariables) {
    // v2: kinds and formats as written ("plain" is the default, so it is omitted); an unknown kind / format kind is kept so the
    // canonical validator refuses it.
    const fmt = (f: AiFormat) => (f.kind === "plain" ? {} : { format: { kind: f.kind, decimals: f.decimals } });
    const variables = (p.variables as AiParamVarV2[]).map(v => ({ id: v.name, kind: v.kind, min: v.min, max: v.max, step: v.step, ...fmt(v.format) }));
    const derivedVariables = p.derivedVariables.map(dv => ({ id: dv.name, expression: dv.expression, ...fmt(dv.format) }));
    return { node: { ...base(d, "parametricNumeric"), questionTypeVersion: 1, parametric: { v: 2, generatorVersion: 2, variables, derivedVariables, constraints: [...p.constraints], response }, answer }, issues: [] };
  }
  const parametric = { v: 1, generatorVersion: 1, variables: (p.variables as AiParamVar[]).map(v => ({ id: v.name, kind: "int", min: v.min, max: v.max, step: v.step })), constraints: [...p.constraints], response };
  return { node: { ...base(d, "parametricNumeric"), questionTypeVersion: 1, parametric, answer }, issues: [] };
}

function mapDraft(d: AiDraft): Mapped | null {
  switch (d.intent) {
    case "multipleChoice": return d.multipleChoice ? { node: { ...base(d, "multipleChoice"), options: d.multipleChoice.options.map(text => ({ text })), answer: { correctOptionIndex: d.multipleChoice.correctIndex } }, issues: [] } : null;
    case "trueFalse": return d.trueFalse ? { node: { ...base(d, "trueFalse"), answer: { correct: d.trueFalse.correct } }, issues: [] } : null;
    case "shortAnswer": return { node: { ...base(d, "shortAnswer"), answer: d.shortAnswer && d.shortAnswer.modelAnswer.trim() !== "" ? { text: d.shortAnswer.modelAnswer } : {} }, issues: [] };
    case "fillBlank": return d.fillBlank ? { node: { ...base(d, "fillBlank"), fields: d.fillBlank.blanks.map((b, i) => ({ id: "f" + (i + 1), kind: "text", label: b.label, correct: b.correctText })), wordBank: [], answer: { mode: "exactSequence", values: d.fillBlank.blanks.map(b => b.correctText) } }, issues: [] } : null;
    case "inlineCloze": return d.inlineCloze ? mapInlineCloze(d, d.inlineCloze) : null;
    case "networkCli": return d.networkCli ? mapNetworkCli(d, d.networkCli) : null;
    case "parametricNumeric": return d.parametricNumeric ? mapParametric(d, d.parametricNumeric) : null;
    default: return null;
  }
}

// ── the canonical judgment (shared with the Builder dialog's client-side re-verification) ──────────────────────────────────
const NODE_KEYS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  multipleChoice: ["examQuestionId", "presentationType", "text", "marks", "options", "answer"],
  trueFalse: ["examQuestionId", "presentationType", "text", "marks", "answer"],
  shortAnswer: ["examQuestionId", "presentationType", "text", "marks", "answer"],
  fillBlank: ["examQuestionId", "presentationType", "text", "marks", "fields", "wordBank", "answer"],
  inlineCloze: ["examQuestionId", "presentationType", "questionTypeVersion", "text", "marks", "inlineCloze", "answer"],
  networkCli: ["examQuestionId", "presentationType", "questionTypeVersion", "text", "marks", "networkCli", "answer"],
  parametricNumeric: ["examQuestionId", "presentationType", "questionTypeVersion", "text", "marks", "parametric", "answer"]
});
const INVALID_MESSAGE = "مسودة الذكاء الاصطناعي لا تجتاز التحقق القياسي للسؤال؛ لم يُنشأ أي سؤال.";
/**
 * Judges a generated node with the canonical validators manual authoring uses: the type must be a generated type, the node may
 * carry only that type's canonical keys (nothing private or teacher-side smuggled elsewhere), and the structured-exam quality gate
 * (which runs the registered type validator) must report no error for it.
 */
export function verifyAiQuestionNode(node: unknown): { ok: true; question: BuilderQuestion } | { ok: false; code: "AI_DRAFT_INVALID"; message: string; issues: AiAuthorIssue[] } {
  const fail = (issues: AiAuthorIssue[]) => ({ ok: false as const, code: "AI_DRAFT_INVALID" as const, message: INVALID_MESSAGE, issues });
  if (!isPlain(node) || hasForbiddenKey(node)) return fail([{ code: "AI_NODE_MALFORMED", message: "بنية السؤال المقترح غير صالحة." }]);
  const type = node.presentationType;
  const allowed = typeof type === "string" ? NODE_KEYS[type] : undefined;
  if (!allowed) return fail([{ code: "AI_TYPE_NOT_ALLOWED", message: "نوع السؤال المقترح لا يُنشأ بالذكاء الاصطناعي." }]);
  const extra = Object.keys(node).filter(k => !allowed.includes(k));
  if (extra.length) return fail([{ code: "AI_NODE_UNKNOWN_FIELD", message: "السؤال المقترح يحتوي حقولًا غير متوقعة: " + extra.join("، ") }]);
  if (typeof node.examQuestionId !== "string" || node.examQuestionId === "") return fail([{ code: "AI_NODE_MALFORMED", message: "معرّف السؤال المقترح مفقود." }]);
  const exam = { examId: "ai-authoring", title: "AI", status: "draft", schemaVersion: 2, sections: [{ id: "ai-section", title: "AI", instructions: "", maxMarks: null, gradingPolicy: "all", requiredAnswers: null, answerUnit: "question", stimuli: {}, questions: [node] }] } as unknown as StructuredExam;
  const errors = validateStructuredExam(exam).filter(i => i.severity === "error");
  if (errors.length) return fail(errors.map(i => ({ code: i.code, message: i.message })));
  return { ok: true, question: node as unknown as BuilderQuestion };
}

const MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  AI_DRAFT_MALFORMED: "استجابة الذكاء الاصطناعي لا تطابق البنية المطلوبة؛ لم يُنشأ أي سؤال.",
  AI_INTENT_UNKNOWN: "نوع السؤال الذي اقترحه الذكاء الاصطناعي غير معروف؛ لم يُنشأ أي سؤال.",
  AI_TYPE_NOT_GENERATED_simulation: "أسئلة المحاكاة التفاعلية تحتاج حزمة ‎.smartsim‎ يرفعها المعلم؛ لا يُنشئها الذكاء الاصطناعي. أضف السؤال من «محاكاة تفاعلية».",
  AI_TYPE_NOT_GENERATED_coding: "أسئلة البرمجة تحتاج اختبارات مخفية يكتبها المعلم ويتحقق منها؛ لا يُنشئها الذكاء الاصطناعي. أضف السؤال من «برمجة / كتابة كود».",
  AI_REQUEST_UNSUPPORTED: "الطلب غير مدعوم بأنواع الأسئلة المتاحة.",
  AI_VISUAL_GEOMETRY_REQUIRED_hotspot: "أسئلة «تحديد منطقة على صورة» تحتاج صورة يحدّد عليها المعلم المناطق الصحيحة بنفسه؛ لا يخمّن الذكاء الاصطناعي إحداثيات من النص. أضف السؤال من «تحديد منطقة على صورة»، ثم ارفع الصورة وارسم المناطق.",
  AI_VISUAL_GEOMETRY_REQUIRED_labelDiagram: "أسئلة «تسمية أجزاء الرسم» تحتاج صورة يضع المعلم عليها مناطق التسمية بنفسه؛ لا يخمّن الذكاء الاصطناعي إحداثيات من النص. أضف السؤال من «تسمية أجزاء الرسم»، ثم ارفع الصورة وأضف المناطق والتسميات.",
  AI_NETCLI_UNSUPPORTED_CAPABILITY: "محاكي أوامر الشبكة (الإصدار 1) مبدّل تعليمي فقط؛ هذه القدرات غير مدعومة",
  AI_NETCLI_AMBIGUOUS: "الطلب غير واضح بما يكفي لإنشاء سؤال محاكٍ؛ حدّد المطلوب (VLANs، المنافذ access/trunk، native VLAN، عنوان SVI) أو اطلب سؤالًا عاديًا."
});
const refuse = (code: string, message: string, intent?: AiAuthorIntent, issues: AiAuthorIssue[] = []): AiAuthorResult => ({ ok: false, code, message, ...(intent ? { intent } : {}), issues });

/** AI draft → canonical question (or a refusal with the canonical issues). Deterministic for a given draft and request. */
export function normalizeAiQuestionDraft(raw: unknown, context: { request: string }): AiAuthorResult {
  if (!shapeOk(raw)) return refuse("AI_DRAFT_MALFORMED", MESSAGES.AI_DRAFT_MALFORMED);
  if (!(AI_AUTHOR_INTENTS as readonly string[]).includes(raw.intent)) return refuse("AI_INTENT_UNKNOWN", MESSAGES.AI_INTENT_UNKNOWN);
  const intent = raw.intent as AiAuthorIntent;
  if (intent === "simulation" || intent === "coding") return refuse("AI_TYPE_NOT_GENERATED", MESSAGES["AI_TYPE_NOT_GENERATED_" + intent], intent);
  // Phase 19D — no image, no geometry authority: a visual intent is NEVER generated (no invented coordinates, whatever the payload).
  if (intent === "hotspot" || intent === "labelDiagram") return refuse("AI_VISUAL_GEOMETRY_REQUIRED", MESSAGES["AI_VISUAL_GEOMETRY_REQUIRED_" + intent], intent);
  if (intent === "unsupported") return refuse("AI_REQUEST_UNSUPPORTED", MESSAGES.AI_REQUEST_UNSUPPORTED + (raw.explanation ? " " + raw.explanation : ""), intent);
  if (intent === "networkCli") {
    const unsupported = [...new Set([...raw.unsupportedCapabilities.filter(c => c.trim() !== ""), ...classifyAuthorRequest(context.request).unsupportedCapabilities])];
    if (unsupported.length) return refuse("AI_NETCLI_UNSUPPORTED_CAPABILITY", MESSAGES.AI_NETCLI_UNSUPPORTED_CAPABILITY + ": " + unsupported.join("، ") + ".", intent, unsupported.map(c => ({ code: "NETCLI_CAPABILITY_UNSUPPORTED", message: c })));
    if (raw.confidence === "ambiguous") return refuse("AI_NETCLI_AMBIGUOUS", MESSAGES.AI_NETCLI_AMBIGUOUS, intent);
  }
  const mapped = mapDraft(raw);
  if (!mapped) return refuse("AI_DRAFT_INVALID", INVALID_MESSAGE, intent, [{ code: "AI_TYPE_PAYLOAD_MISSING", message: "المسودة لا تحتوي بيانات النوع المختار." }]);
  if (mapped.issues.length) return refuse("AI_DRAFT_INVALID", INVALID_MESSAGE, intent, mapped.issues);
  const verdict = verifyAiQuestionNode(mapped.node);
  if (!verdict.ok) return refuse(verdict.code, verdict.message, intent, verdict.issues);
  return { ok: true, intent, question: verdict.question, notes: raw.explanation ? [raw.explanation] : [] };
}
