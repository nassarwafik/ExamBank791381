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
const INTERFACE_TARGET_FIELDS = ["mode", "accessVlan", "nativeVlan", "shutdown", "ipAddress", "subnetMask"] as const;

export const defaultNetworkCliConfig = (): NetworkCliQuestionConfigV1 => ({ device: "switch", initialState: createDeviceState() });
export const defaultNetworkCliAnswerKey = (): Required<NetworkCliAnswerKeyV1> => ({ targetState: {}, scoring: "proportional" });
/** The effective QUESTION TYPE VERSION through the ONE catalog authority: absent = 1; 1 as stored; anything else undefined (fail closed). */
export const networkCliQuestionVersion = (node: unknown): number | undefined => (isObj(node) ? effectiveQuestionTypeVersion(NETWORK_CLI_TYPE_KEY, node.questionTypeVersion) : undefined);
export const networkCliScoringMode = (answerKey: unknown): NetworkCliScoringMode => (isObj(answerKey) && answerKey.scoring === "allOrNothing" ? "allOrNothing" : "proportional");

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
/** The ONLY student projection of a networkCli config: an allow-list rebuild (unknown keys dropped) that must then pass the strict
 *  state normalizer — a private value smuggled into the public object never reaches a student; an INVALID value fails closed. */
export function projectNetworkCliConfigForStudent(cfg: unknown): NetworkCliQuestionConfigV1 | undefined {
  if (!isObj(cfg) || cfg.device !== "switch") return undefined;
  const st = normalizeDeviceState(pickStateShape(cfg.initialState));
  if (!st.ok) return undefined;
  return { device: "switch", initialState: initialStateOf({ device: "switch", initialState: st.state }) };
}

// ── finalization validation ────────────────────────────────────────────────────────────────────────────────────────────
export type NetworkCliIssue = { code: string; message: string; severity: "error"; path?: string };
const err = (code: string, message: string, path?: string): NetworkCliIssue => ({ code, message, severity: "error", path });
const PUBLIC_KEYS = new Set(["device", "initialState"]);
const TARGET_KEYS = new Set(["hostname", "vlans", "interfaces"]);

/** Validates one target interface entry; returns the canonical name or pushes issues. */
function validateTargetInterface(rawName: string, entry: unknown, where: string, out: NetworkCliIssue[]): { name: string; checks: number } | undefined {
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
  return { name, checks };
}

/** networkCli@1 finalization rules: every problem BLOCKS; nothing here executes anything. */
export function validateNetworkCliQuestion(node: Record<string, unknown>): NetworkCliIssue[] {
  const out: NetworkCliIssue[] = [];
  if (networkCliQuestionVersion(node) === undefined) out.push(err("NETCLI_VERSION_UNSUPPORTED", "إصدار سؤال محاكي الشبكة غير مدعوم في هذا الإصدار من التطبيق.", "questionTypeVersion"));
  const cfg = node.networkCli;
  if (!isObj(cfg)) return [...out, err("NETCLI_CONFIG_MISSING", "إعداد محاكي الشبكة مفقود أو غير صالح.", "networkCli")];
  for (const k of Object.keys(cfg)) if (!PUBLIC_KEYS.has(k)) out.push(err("NETCLI_CONFIG_UNKNOWN_KEY", "حقل غير معروف في إعداد المحاكي: " + k, "networkCli." + k));
  if (cfg.device !== "switch") out.push(err("NETCLI_DEVICE_UNSUPPORTED", "نوع الجهاز غير مدعوم في هذا الإصدار (المدعوم: switch).", "networkCli.device"));
  const st = normalizeDeviceState(cfg.initialState);
  if (!st.ok) out.push(err("NETCLI_INITIAL_STATE_INVALID", "الحالة الابتدائية للجهاز غير صالحة (" + st.detail + ").", "networkCli.initialState"));
  const key = node.answer;
  if (!isObj(key) || !isObj(key.targetState)) return [...out, err("NETCLI_TARGET_MISSING", "الحالة المستهدفة (مفتاح التصحيح) مفقودة.", "answer.targetState")];
  const t = key.targetState;
  let checks = 0;
  for (const k of Object.keys(t)) if (!TARGET_KEYS.has(k)) out.push(err("NETCLI_TARGET_UNKNOWN_KEY", "حقل غير معروف في الحالة المستهدفة: " + k, "answer.targetState." + k));
  if (t.hostname !== undefined) { if (typeof t.hostname === "string" && isValidHostname(t.hostname)) checks++; else out.push(err("NETCLI_TARGET_HOSTNAME_INVALID", "اسم الجهاز المستهدف غير صالح.", "answer.targetState.hostname")); }
  if (t.vlans !== undefined) {
    if (!isObj(t.vlans)) out.push(err("NETCLI_TARGET_VLAN_INVALID", "قائمة VLAN المستهدفة غير صالحة.", "answer.targetState.vlans"));
    else for (const id of Object.keys(t.vlans)) {
      const where = "answer.targetState.vlans." + id;
      if (FORBIDDEN.has(id) || parseVlanId(id, { allowOne: false, allowReserved: false }) === null) { out.push(err("NETCLI_TARGET_VLAN_INVALID", "رقم VLAN مستهدف غير صالح (2–4094، بلا المحجوزة): " + id, where)); continue; }
      const v = t.vlans[id];
      if (!isObj(v) || Object.keys(v).some(x => x !== "name")) { out.push(err("NETCLI_TARGET_VLAN_INVALID", "إدخال VLAN المستهدف غير صالح: " + id, where)); continue; }
      checks++;
      if (v.name !== undefined) { if (typeof v.name === "string" && isValidVlanName(v.name)) checks++; else out.push(err("NETCLI_TARGET_VLAN_INVALID", "اسم VLAN المستهدف غير صالح: " + id, where)); }
    }
  }
  if (t.interfaces !== undefined) {
    if (!isObj(t.interfaces)) out.push(err("NETCLI_TARGET_INTERFACE_INVALID", "قائمة الواجهات المستهدفة غير صالحة.", "answer.targetState.interfaces"));
    else { const seen = new Set<string>(); for (const raw of Object.keys(t.interfaces)) { const r = validateTargetInterface(raw, t.interfaces[raw], "answer.targetState.interfaces." + raw, out); if (!r) continue; if (seen.has(r.name)) out.push(err("NETCLI_TARGET_INTERFACE_INVALID", "الواجهة مكررة في الحالة المستهدفة: " + raw, "answer.targetState.interfaces." + raw)); seen.add(r.name); checks += r.checks; } }
  }
  if (checks === 0 && !out.some(i => i.code.startsWith("NETCLI_TARGET_") && i.code !== "NETCLI_TARGET_UNKNOWN_KEY")) out.push(err("NETCLI_TARGET_EMPTY", "حدّد عنصرًا واحدًا على الأقل في الحالة المستهدفة (اسم الجهاز، VLAN، أو إعداد واجهة).", "answer.targetState"));
  if (key.scoring !== undefined && !NETWORK_CLI_SCORING_MODES.includes(key.scoring as NetworkCliScoringMode)) out.push(err("NETCLI_SCORING_UNKNOWN", "طريقة احتساب العلامة غير معروفة.", "answer.scoring"));
  return out;
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
 * Binds an answer to the AUTHORITATIVE published question: the question must be networkCli at a supported version with a valid
 * config; the stored state is RE-DERIVED by replaying the command history from the question's initial state (the claimed state
 * is discarded). Returns the canonical answer or a precise refusal.
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
    const t = target.vlans![id]; const exists = id === "1" || !!c.vlans[id];
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
/**
 * The authoritative scorer (server grader + teacher review). Re-derives the canonical state by replaying the response's command
 * history from the question's initial state, evaluates the private target and applies the scoring mode. Fails CLOSED (0, manual
 * review) when the question itself is unusable; a response of another kind / with no history simply scores 0.
 */
export function scoreNetworkCli(input: { config: unknown; answerKey: unknown; response: unknown; maxMarks: number }): NetworkCliScore {
  const max = Number.isFinite(input.maxMarks) ? Math.max(0, input.maxMarks) : 0;
  const cfg = projectNetworkCliConfigForStudent(input.config);
  const target = isObj(input.answerKey) && isObj(input.answerKey.targetState) ? (input.answerKey.targetState as NetworkCliTargetStateV1) : undefined;
  const total = target ? targetCheckCount(target) : 0;
  if (!cfg || !target || total === 0) return { score: 0, correct: false, manualReview: true, parts: { correct: 0, total } };
  const base = normalizeNetworkCliAnswer(input.response);
  if (!base.ok) return { score: 0, correct: false, manualReview: false, parts: { correct: 0, total } };
  const state = replayCommands(cfg.initialState, base.answer.commands).session.state;
  const checks = evaluateNetworkCliTarget(target, state);
  const passed = checks.filter(c => c.ok).length;
  const all = passed === checks.length;
  const score = networkCliScoringMode(input.answerKey) === "allOrNothing" ? (all ? max : 0) : max * passed / checks.length;
  return { score: Math.min(max, Math.max(0, score)), correct: all, manualReview: false, parts: { correct: passed, total: checks.length } };
}
/** Deterministic fingerprint of a canonical state (teacher review / tests). */
export const networkCliStateFingerprint = (state: NetworkCliDeviceState): string => serializeState(state);
export { NETWORK_CLI_STATE_VERSION, isSviName };
