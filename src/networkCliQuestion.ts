// Phase 18C — the networkCli@1 QUESTION model. Pure (no React, no DOM, no I/O): compiled into the shared server build so the
// Builder, finalization, the student sanitizer, the draft-answer ingest and the authoritative grader apply the SAME contract.
//
// Public vs private: everything a student may see lives under `question.networkCli` (the device and its INITIAL canonical
// state); the TARGET state the grader compares against — and the scoring mode — live ONLY under `question.answer`, which the
// student sanitizer always removes. Grading compares canonical configuration STATE (hostname, VLAN database, interface
// configuration), never the command transcript: any valid command sequence that reaches the target earns the same marks.
// The server never trusts a client-claimed state: the bounded command history is replayed from the question's initial state
// through the shared engine (bindNetworkCliAnswerToQuestion at ingest, scoreNetworkCli at grading).
import { effectiveQuestionTypeVersion } from "./questionTypeCatalog";
import {
  NETWORK_CLI_LIMITS, NETWORK_CLI_STATE_VERSION, canonicalizeState, createDeviceState, effectiveInterfaceConfig, isPhysicalPort, isSviName, isIpv4, isSubnetMask, isUsableHostAddress,
  isValidHostname, isValidVlanName, interfaceExists, normalizeDeviceState, normalizeInterfaceName, parseVlanId, replayCommands, serializeState, sortInterfaceNames, displayInterfaceName,
  type NetworkCliDeviceState, type NetworkCliInterfaceConfig, type NetworkCliSwitchportMode
} from "./networkCliEngine";

export const NETWORK_CLI_TYPE_KEY = "networkCli";
export type NetworkCliQuestionConfigV1 = { device: "switch"; initialState: NetworkCliDeviceState };
/** One interface's target checks: every PRESENT field is one graded dimension (compared against the EFFECTIVE value). */
export type NetworkCliInterfaceTarget = { mode?: NetworkCliSwitchportMode; accessVlan?: number; nativeVlan?: number; shutdown?: boolean; ipAddress?: string; subnetMask?: string };
/** The PRIVATE target: a present VLAN key = "must exist" (+ "name correct" when a name is given); a present interface field = one check. */
export type NetworkCliTargetStateV1 = { hostname?: string; vlans?: Record<string, { name?: string }>; interfaces?: Record<string, NetworkCliInterfaceTarget> };
export type NetworkCliScoringMode = "proportional" | "allOrNothing";
export const NETWORK_CLI_SCORING_MODES: readonly NetworkCliScoringMode[] = Object.freeze(["proportional", "allOrNothing"]);
export type NetworkCliAnswerKeyV1 = { targetState: NetworkCliTargetStateV1; scoring?: NetworkCliScoringMode };
export type NetworkCliAnswer = { kind: "networkCli"; commands: string[]; state: NetworkCliDeviceState };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const FORBIDDEN = new Set(["__proto__", "constructor", "prototype"]);
export type NetworkCliIssue = { code: string; message: string; severity: "error"; path?: string };
const err = (code: string, message: string, path?: string): NetworkCliIssue => ({ code, message, severity: "error", path });
const PUBLIC_KEYS = new Set(["device", "initialState"]);
const INTERFACE_TARGET_FIELDS = ["mode", "accessVlan", "nativeVlan", "shutdown", "ipAddress", "subnetMask"] as const;

export const defaultNetworkCliConfig = (): NetworkCliQuestionConfigV1 => ({ device: "switch", initialState: createDeviceState() });
export const defaultNetworkCliAnswerKey = (): Required<NetworkCliAnswerKeyV1> => ({ targetState: {}, scoring: "proportional" });
/** The effective QUESTION TYPE VERSION through the ONE catalog authority: absent = 1; 1 as stored; anything else undefined (fail closed). */
export const networkCliQuestionVersion = (node: unknown): number | undefined => (isObj(node) ? effectiveQuestionTypeVersion(NETWORK_CLI_TYPE_KEY, node.questionTypeVersion) : undefined);
/** The scoring mode of a key: ABSENT = the canonical historical default (proportional); an explicit known value = itself; any other
 *  explicit value = undefined (INVALID — never silently proportional; Review Fix 1). */
export const networkCliScoringMode = (answerKey: unknown): NetworkCliScoringMode | undefined => {
  const v = isObj(answerKey) ? answerKey.scoring : undefined;
  return v === undefined ? "proportional" : v === "proportional" || v === "allOrNothing" ? v : undefined;
};

/** The initial device state of a config: the canonical state plus the VLANs its access ports imply (a device would show them). */
export function initialStateOf(cfg: NetworkCliQuestionConfigV1): NetworkCliDeviceState {
  const s = canonicalizeState(cfg.initialState);
  const vlans = { ...s.vlans };
  for (const name of Object.keys(s.interfaces)) { const v = s.interfaces[name].accessVlan; if (v !== undefined && v !== 1 && !vlans[String(v)]) vlans[String(v)] = {}; }
  return canonicalizeState({ ...s, vlans });
}

const STATE_KEYS = ["v", "device", "hostname", "vlans", "interfaces"] as const;
/** Allow-list rebuild of a state object: ONLY the known keys at every level survive (unknown / smuggled keys are dropped, never copied). */
function pickStateShape(raw: unknown): unknown {
  if (!isObj(raw)) return raw;
  const out: Record<string, unknown> = {};
  for (const k of STATE_KEYS) if (raw[k] !== undefined) out[k] = raw[k];
  if (isObj(out.vlans)) { const v: Record<string, unknown> = {}; for (const id of Object.keys(out.vlans)) { if (FORBIDDEN.has(id)) return undefined; const e = (out.vlans as Record<string, unknown>)[id]; v[id] = isObj(e) ? (e.name === undefined ? {} : { name: e.name }) : e; } out.vlans = v; }
  if (isObj(out.interfaces)) { const ifs: Record<string, unknown> = {}; for (const n of Object.keys(out.interfaces)) { if (FORBIDDEN.has(n)) return undefined; const e = (out.interfaces as Record<string, unknown>)[n]; if (!isObj(e)) { ifs[n] = e; continue; } const c: Record<string, unknown> = {}; for (const f of INTERFACE_TARGET_FIELDS) if (e[f] !== undefined) c[f] = e[f]; ifs[n] = c; } out.interfaces = ifs; }
  return out;
}
/** STUDENT PROJECTION (secrecy / public payload shaping — NOT grading authority): an allow-list rebuild (unknown keys dropped) that
 *  must then pass the strict state normalizer — a private value smuggled into the public object never reaches a student; an INVALID
 *  value fails closed. Review Fix 2: a successful projection is never proof that the PUBLISHED config is valid; the grading authority
 *  is validateNetworkCliConfig below, which refuses what this function silently repairs. */
export function projectNetworkCliConfigForStudent(cfg: unknown): NetworkCliQuestionConfigV1 | undefined {
  if (!isObj(cfg) || cfg.device !== "switch") return undefined;
  const st = normalizeDeviceState(pickStateShape(cfg.initialState));
  if (!st.ok) return undefined;
  return { device: "switch", initialState: initialStateOf({ device: "switch", initialState: st.state }) };
}

// ── the PUBLIC configuration contract — ONE canonical STRICT authority (Review Fix 2) ──────────────────────────────────
// Shared by finalization validation, the authoritative scorer and the teacher review. Unlike the student projection it never
// repairs anything: the config root must be exactly { device, initialState }, the device exactly "switch" (networkCli@1), and the
// ORIGINAL initial state must pass the strict normalizeDeviceState (unknown fields at any level, bad values, prototype-sensitive
// keys ⇒ refused). The normalized result is the canonical config (implied access VLANs included), identical to the projection of a
// VALID config. Any problem makes the whole config invalid: the scorer then returns NETWORK_CLI_FAIL_CLOSED.
export type NetworkCliConfigResult = { ok: true; config: NetworkCliQuestionConfigV1; issues: [] } | { ok: false; issues: NetworkCliIssue[] };
export function validateNetworkCliConfig(raw: unknown): NetworkCliConfigResult {
  if (!isObj(raw)) return { ok: false, issues: [err("NETCLI_CONFIG_MISSING", "إعداد محاكي الشبكة مفقود أو غير صالح.", "networkCli")] };
  const out: NetworkCliIssue[] = [];
  for (const k of Object.keys(raw)) if (!PUBLIC_KEYS.has(k)) out.push(err("NETCLI_CONFIG_UNKNOWN_KEY", "حقل غير معروف في إعداد المحاكي: " + k, "networkCli." + k));
  if (raw.device !== "switch") out.push(err("NETCLI_DEVICE_UNSUPPORTED", "نوع الجهاز غير مدعوم في هذا الإصدار (المدعوم: switch).", "networkCli.device"));
  const st = normalizeDeviceState(raw.initialState);
  if (!st.ok) out.push(err("NETCLI_INITIAL_STATE_INVALID", "الحالة الابتدائية للجهاز غير صالحة (" + st.detail + ").", "networkCli.initialState"));
  if (out.length || !st.ok) return { ok: false, issues: out };
  return { ok: true, config: { device: "switch", initialState: initialStateOf({ device: "switch", initialState: st.state }) }, issues: [] };
}

// ── finalization validation ────────────────────────────────────────────────────────────────────────────────────────────
const TARGET_KEYS = new Set(["hostname", "vlans", "interfaces"]);

/** Validates one target interface entry; returns the canonical name or pushes issues. */
function validateTargetInterface(rawName: string, entry: unknown, where: string, out: NetworkCliIssue[]): { name: string; checks: number; entry: NetworkCliInterfaceTarget } | undefined {
  const name = FORBIDDEN.has(rawName) ? null : normalizeInterfaceName(rawName);
  if (!name) { out.push(err("NETCLI_TARGET_INTERFACE_INVALID", "واجهة غير موجودة على هذا الجهاز في الحالة المستهدفة: " + rawName, where)); return undefined; }
  if (!isObj(entry)) { out.push(err("NETCLI_TARGET_INTERFACE_INVALID", "إعداد الواجهة المستهدف غير صالح: " + rawName, where)); return undefined; }
  const physical = isPhysicalPort(name);
  let checks = 0;
  for (const k of Object.keys(entry)) {
    if (!(INTERFACE_TARGET_FIELDS as readonly string[]).includes(k)) { out.push(err("NETCLI_TARGET_INTERFACE_INVALID", "حقل غير معروف في الواجهة المستهدفة " + rawName + ": " + k, where)); continue; }
    const v = entry[k];
    let ok = true;
    if (k === "mode") ok = physical && (v === "access" || v === "trunk");
    else if (k === "accessVlan" || k === "nativeVlan") ok = physical && typeof v === "number" && parseVlanId(String(v), { allowOne: true, allowReserved: false }) !== null;
    else if (k === "shutdown") ok = typeof v === "boolean";
    else if (k === "ipAddress") ok = !physical && typeof v === "string" && isIpv4(v);
    else if (k === "subnetMask") ok = !physical && typeof v === "string" && isSubnetMask(v);
    if (!ok) out.push(err("NETCLI_TARGET_INTERFACE_INVALID", "قيمة غير صالحة في الواجهة المستهدفة " + displayInterfaceName(name) + ": " + k, where)); else checks++;
  }
  if (typeof entry.ipAddress === "string" && typeof entry.subnetMask === "string" && isIpv4(entry.ipAddress) && isSubnetMask(entry.subnetMask) && !isUsableHostAddress(entry.ipAddress, entry.subnetMask)) out.push(err("NETCLI_TARGET_INTERFACE_INVALID", "عنوان IP المستهدف ليس عنوان مضيف صالحًا ضمن قناعه: " + displayInterfaceName(name), where));
  const typed: NetworkCliInterfaceTarget = {};
  for (const f of INTERFACE_TARGET_FIELDS) if (entry[f] !== undefined) (typed as Record<string, unknown>)[f] = entry[f];
  return { name, checks, entry: typed };
}

/** networkCli@1 finalization rules: every problem BLOCKS; nothing here executes anything. */
export function validateNetworkCliQuestion(node: Record<string, unknown>): NetworkCliIssue[] {
  const out: NetworkCliIssue[] = [];
  if (networkCliQuestionVersion(node) === undefined) out.push(err("NETCLI_VERSION_UNSUPPORTED", "إصدار سؤال محاكي الشبكة غير مدعوم في هذا الإصدار من التطبيق.", "questionTypeVersion"));
  const cfg = validateNetworkCliConfig(node.networkCli);
  if (!cfg.ok) { out.push(...cfg.issues); if (cfg.issues.some(i => i.code === "NETCLI_CONFIG_MISSING")) return out; }
  const key = validateNetworkCliAnswerKey(node.answer);
  return key.ok ? out : [...out, ...key.issues];
}

// ── the PRIVATE grading contract — ONE canonical authority (Review Fix 1) ──────────────────────────────────────────────
// Shared by finalization validation, the authoritative scorer and the teacher review. It validates AND normalizes the whole
// private key: answer root (`targetState` + optional `scoring` only), target root (hostname / vlans / interfaces only), canonical
// hostname, VLAN rows 2–4094 without the reserved ids (VLAN 1 is implicit and never a target row), `{ name? }` entries with
// canonical VLAN names, interface rows that are supported ports / SVIs with field restrictions, valid ranges / types / usable
// host addresses, no prototype-sensitive keys, no two aliases of the same interface. Any problem makes the WHOLE key invalid:
// the scorer then returns the fail-closed result (no automatic academic mark, manual review) — never a partial grade of the
// valid-looking subset, never a silently defaulted scoring policy.
export type NetworkCliAnswerKeyNormalized = { targetState: NetworkCliTargetStateV1; scoring: NetworkCliScoringMode; checks: number };
export type NetworkCliAnswerKeyResult = { ok: true; key: NetworkCliAnswerKeyNormalized; issues: [] } | { ok: false; issues: NetworkCliIssue[] };
const ANSWER_KEYS = new Set(["targetState", "scoring"]);
export function validateNetworkCliAnswerKey(raw: unknown): NetworkCliAnswerKeyResult {
  const out: NetworkCliIssue[] = [];
  if (!isObj(raw) || !isObj(raw.targetState)) return { ok: false, issues: [err("NETCLI_TARGET_MISSING", "الحالة المستهدفة (مفتاح التصحيح) مفقودة.", "answer.targetState")] };
  for (const k of Object.keys(raw)) if (!ANSWER_KEYS.has(k)) out.push(err("NETCLI_ANSWER_KEY_INVALID", "حقل غير معروف في مفتاح التصحيح: " + k, "answer." + k));
  const t = raw.targetState;
  const target: NetworkCliTargetStateV1 = {};
  let checks = 0;
  for (const k of Object.keys(t)) if (!TARGET_KEYS.has(k)) out.push(err("NETCLI_TARGET_UNKNOWN_KEY", "حقل غير معروف في الحالة المستهدفة: " + k, "answer.targetState." + k));
  if (t.hostname !== undefined) { if (typeof t.hostname === "string" && isValidHostname(t.hostname)) { target.hostname = t.hostname; checks++; } else out.push(err("NETCLI_TARGET_HOSTNAME_INVALID", "اسم الجهاز المستهدف غير صالح.", "answer.targetState.hostname")); }
  if (t.vlans !== undefined) {
    if (!isObj(t.vlans)) out.push(err("NETCLI_TARGET_VLAN_INVALID", "قائمة VLAN المستهدفة غير صالحة.", "answer.targetState.vlans"));
    else {
      const vlans: Record<string, { name?: string }> = {};
      for (const id of Object.keys(t.vlans)) {
        const where = "answer.targetState.vlans." + id;
        if (FORBIDDEN.has(id) || parseVlanId(id, { allowOne: false, allowReserved: false }) === null) { out.push(err("NETCLI_TARGET_VLAN_INVALID", "رقم VLAN مستهدف غير صالح (2–4094، بلا المحجوزة؛ VLAN 1 افتراضية ولا تُستهدف): " + id, where)); continue; }
        const v = t.vlans[id];
        if (!isObj(v) || Object.keys(v).some(x => x !== "name")) { out.push(err("NETCLI_TARGET_VLAN_INVALID", "إدخال VLAN المستهدف غير صالح: " + id, where)); continue; }
        checks++;
        if (v.name === undefined) vlans[id] = {};
        else if (typeof v.name === "string" && isValidVlanName(v.name)) { vlans[id] = { name: v.name }; checks++; }
        else out.push(err("NETCLI_TARGET_VLAN_INVALID", "اسم VLAN المستهدف غير صالح: " + id, where));
      }
      target.vlans = vlans;
    }
  }
  if (t.interfaces !== undefined) {
    if (!isObj(t.interfaces)) out.push(err("NETCLI_TARGET_INTERFACE_INVALID", "قائمة الواجهات المستهدفة غير صالحة.", "answer.targetState.interfaces"));
    else {
      const byName = new Map<string, NetworkCliInterfaceTarget>();
      for (const rawName of Object.keys(t.interfaces)) {
        const where = "answer.targetState.interfaces." + rawName;
        const r = validateTargetInterface(rawName, t.interfaces[rawName], where, out);
        if (!r) continue;
        if (byName.has(r.name)) { out.push(err("NETCLI_TARGET_INTERFACE_INVALID", "الواجهة مكررة في الحالة المستهدفة (اسمان لنفس الواجهة): " + rawName, where)); continue; }
        byName.set(r.name, r.entry); checks += r.checks;
      }
      const interfaces: Record<string, NetworkCliInterfaceTarget> = {};
      for (const name of sortInterfaceNames([...byName.keys()])) interfaces[name] = byName.get(name)!;
      target.interfaces = interfaces;
    }
  }
  if (checks === 0 && !out.some(i => i.code.startsWith("NETCLI_TARGET_") && i.code !== "NETCLI_TARGET_UNKNOWN_KEY")) out.push(err("NETCLI_TARGET_EMPTY", "حدّد عنصرًا واحدًا على الأقل في الحالة المستهدفة (اسم الجهاز، VLAN، أو إعداد واجهة).", "answer.targetState"));
  const scoring = networkCliScoringMode(raw);
  if (scoring === undefined) out.push(err("NETCLI_SCORING_UNKNOWN", "طريقة احتساب العلامة غير معروفة.", "answer.scoring"));
  if (out.length) return { ok: false, issues: out };
  return { ok: true, key: { targetState: target, scoring: scoring!, checks }, issues: [] };
}

// ── answer ingest ─────────────────────────────────────────────────────────────────────────────────────────────────────
export type NetworkCliAnswerResult = { ok: true; answer: NetworkCliAnswer } | { ok: false; code: string };
/** Shape + bounds of a `networkCli` answer: EXACTLY {kind, commands, state}; commands are strings within the line / count limits. */
export function normalizeNetworkCliAnswer(a: unknown): NetworkCliAnswerResult {
  if (!isObj(a) || a.kind !== "networkCli" || !Array.isArray(a.commands)) return { ok: false, code: "NETCLI_ANSWER_INVALID" };
  if (a.commands.length > NETWORK_CLI_LIMITS.commands) return { ok: false, code: "NETCLI_HISTORY_TOO_LARGE" };
  const commands: string[] = [];
  for (const c of a.commands) { if (typeof c !== "string" || c.length > NETWORK_CLI_LIMITS.inputChars) return { ok: false, code: "NETCLI_ANSWER_INVALID" }; commands.push(c); }
  const st = normalizeDeviceState(a.state);
  if (!st.ok) return { ok: false, code: "NETCLI_ANSWER_INVALID" };
  return { ok: true, answer: { kind: "networkCli", commands, state: st.state } };
}
/**
 * Binds an answer to the AUTHORITATIVE published question: the question must be networkCli at a supported version with a projectable
 * config; the stored state is RE-DERIVED by replaying the command history from the question's initial state (the claimed state is
 * discarded). Returns the canonical answer or a precise refusal. Ingest deliberately uses the student PROJECTION (like coding@1's
 * bindCodeAnswerToQuestion): a teacher-side defect in the published config never destroys the student's transcript — the stored
 * state is evidence only, and the grading authority (scoreNetworkCli) re-derives it under the STRICT contract and fails closed.
 */
export function bindNetworkCliAnswerToQuestion(a: unknown, question: unknown): NetworkCliAnswerResult {
  const base = normalizeNetworkCliAnswer(a);
  if (!base.ok) return base;
  if (!isObj(question) || String(question.presentationType ?? question.type ?? "") !== NETWORK_CLI_TYPE_KEY || networkCliQuestionVersion(question) === undefined) return { ok: false, code: "NETCLI_QUESTION_MISMATCH" };
  const cfg = projectNetworkCliConfigForStudent(question.networkCli);
  if (!cfg) return { ok: false, code: "NETCLI_QUESTION_INVALID" };
  const replay = replayCommands(cfg.initialState, base.answer.commands);
  return { ok: true, answer: { kind: "networkCli", commands: base.answer.commands, state: replay.session.state } };
}
/** answered ⇔ at least one non-blank command was entered (mirror: answerState.ts / api exam-structure.js). */
export const isNetworkCliAnswerAnswered = (a: unknown): boolean => isObj(a) && a.kind === "networkCli" && Array.isArray(a.commands) && a.commands.some(c => typeof c === "string" && c.trim() !== "");

// ── evaluation ────────────────────────────────────────────────────────────────────────────────────────────────────────
export type NetworkCliCheck = { id: string; label: string; expected: string; actual: string; ok: boolean };
const show = (v: unknown): string => (v === undefined ? "—" : typeof v === "boolean" ? (v ? "shutdown" : "no shutdown") : String(v));
const FIELD_LABEL: Record<(typeof INTERFACE_TARGET_FIELDS)[number], string> = { mode: "وضع المنفذ (access / trunk)", accessVlan: "VLAN الوصول", nativeVlan: "Native VLAN", shutdown: "الحالة الإدارية", ipAddress: "عنوان IPv4", subnetMask: "قناع الشبكة" };
/** Compares the target against a canonical state: one check per present target field (compared against EFFECTIVE values). */
export function evaluateNetworkCliTarget(target: NetworkCliTargetStateV1, state: NetworkCliDeviceState): NetworkCliCheck[] {
  const c = canonicalizeState(state);
  const out: NetworkCliCheck[] = [];
  if (typeof target.hostname === "string") out.push({ id: "hostname", label: "اسم الجهاز", expected: target.hostname, actual: c.hostname, ok: c.hostname === target.hostname });
  for (const id of Object.keys(target.vlans ?? {}).filter(k => !FORBIDDEN.has(k)).sort((a, b) => Number(a) - Number(b))) {
    const t = target.vlans![id]; const exists = !!c.vlans[id];                                        // VLAN 1 is never a target row (the contract refuses it)
    out.push({ id: "vlan:" + id + ":exists", label: "VLAN " + id + " موجودة", expected: "موجودة", actual: exists ? "موجودة" : "غير موجودة", ok: exists });
    if (t && typeof t.name === "string") { const actual = c.vlans[id]?.name; out.push({ id: "vlan:" + id + ":name", label: "اسم VLAN " + id, expected: t.name, actual: show(actual), ok: actual === t.name }); }
  }
  const byName = new Map<string, NetworkCliInterfaceTarget>();
  for (const raw of Object.keys(target.interfaces ?? {})) { const n = FORBIDDEN.has(raw) ? null : normalizeInterfaceName(raw); const v = target.interfaces![raw]; if (n && isObj(v) && !byName.has(n)) byName.set(n, v); }
  for (const name of sortInterfaceNames([...byName.keys()])) {
    const t = byName.get(name)!, exists = interfaceExists(c, name), e = effectiveInterfaceConfig(c, name);
    for (const f of INTERFACE_TARGET_FIELDS) {
      if (t[f] === undefined) continue;
      const actual = exists ? (e as NetworkCliInterfaceConfig)[f] : undefined;
      out.push({ id: "if:" + name + ":" + f, label: displayInterfaceName(name) + " — " + FIELD_LABEL[f], expected: show(t[f]), actual: show(actual), ok: actual === t[f] });
    }
  }
  return out;
}
export const targetCheckCount = (target: NetworkCliTargetStateV1): number => evaluateNetworkCliTarget(target, createDeviceState()).length;

export type NetworkCliScore = { score: number; correct: boolean; manualReview: boolean; parts: { correct: number; total: number } };
/** The fail-closed result: an INVALID grading contract yields no automatic academic mark and routes the question to manual review. */
export const NETWORK_CLI_FAIL_CLOSED: Readonly<NetworkCliScore> = Object.freeze({ score: 0, correct: false, manualReview: true, parts: Object.freeze({ correct: 0, total: 0 }) });
/**
 * The authoritative scorer (server grader + teacher review). Review Fix 1 / 2: it validates BOTH the public configuration and the
 * PRIVATE grading contract through the ONE canonical STRICT authorities (validateNetworkCliConfig / validateNetworkCliAnswerKey)
 * BEFORE any check is evaluated; if either is invalid it returns NETWORK_CLI_FAIL_CLOSED — never a partial grade of the valid-looking
 * subset, never a defaulted scoring policy. Under a valid contract it re-derives the canonical state by replaying the response's
 * command history from the question's initial state, evaluates the target and applies the scoring mode; a malformed / missing /
 * foreign STUDENT response is an ordinary zero (manualReview false) — a student mistake is never a grading-authority failure.
 */
export function scoreNetworkCli(input: { config: unknown; answerKey: unknown; response: unknown; maxMarks: number }): NetworkCliScore {
  const max = Number.isFinite(input.maxMarks) ? Math.max(0, input.maxMarks) : 0;
  // Review Fix 2: the PUBLISHED public config is validated by the STRICT authority (never by the student projection, which repairs
  // unknown fields for secrecy). An invalid public config or an invalid private key ⇒ no automatic academic mark.
  const cfg = validateNetworkCliConfig(input.config);
  const key = validateNetworkCliAnswerKey(input.answerKey);
  if (!cfg.ok || !key.ok) return { ...NETWORK_CLI_FAIL_CLOSED, parts: { ...NETWORK_CLI_FAIL_CLOSED.parts } };
  const total = key.key.checks;
  const base = normalizeNetworkCliAnswer(input.response);
  if (!base.ok) return { score: 0, correct: false, manualReview: false, parts: { correct: 0, total } };
  const state = replayCommands(cfg.config.initialState, base.answer.commands).session.state;
  const checks = evaluateNetworkCliTarget(key.key.targetState, state);
  const passed = checks.filter(c => c.ok).length;
  const all = passed === checks.length;
  const score = key.key.scoring === "allOrNothing" ? (all ? max : 0) : max * passed / checks.length;
  return { score: Math.min(max, Math.max(0, score)), correct: all, manualReview: false, parts: { correct: passed, total: checks.length } };
}
/** Deterministic fingerprint of a canonical state (teacher review / tests). */
export const networkCliStateFingerprint = (state: NetworkCliDeviceState): string => serializeState(state);
export { NETWORK_CLI_STATE_VERSION, isSviName };
