// Learning Materials — CLI simulator: DEFENSIVE reading of a block's opaque `config` into a `CliExerciseConfig`.
// The activity block's config is plain data authored in a content module (validated by the content validator only
// as "opaque"); the renderer validates the exercise shape here and refuses anything malformed (→ the block's
// static fallback is shown). Command ids and modes are checked against the closed grammar — a config can never
// name a command the simulator does not implement, let alone code.
import type { CliCommandId, CliExerciseConfig, CliExpectation, CliGoal, CliStateCondition, CliStep } from "./types";
import { CLI_DEVICE_TYPES, CLI_EXERCISE_KINDS, CLI_MODES } from "./types";
import { COMMANDS } from "./grammar";
import { isSimpleName } from "./normalize";

const KNOWN_IDS = new Set<string>(COMMANDS.map(c => c.id));
const isStr = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const isMode = (v: unknown): v is CliExerciseConfig["startMode"] => typeof v === "string" && (CLI_MODES as readonly string[]).includes(v);
const isCommandId = (v: unknown): v is CliCommandId => typeof v === "string" && KNOWN_IDS.has(v);
const strList = (v: unknown, max: number): string[] => (Array.isArray(v) ? v.filter(isStr).slice(0, max) : []);
const rec = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

const IF_PROPS = new Set(["switchportMode", "accessVlan", "allowedVlans", "ipAddress", "subnetMask", "encapsulationVlan", "shutdown"]);
const POOL_PROPS = new Set(["network", "mask", "defaultRouter", "dnsServers"]);
const VTP_PROPS = new Set(["mode", "domain", "password"]);
const scalar = (v: unknown) => typeof v === "string" || typeof v === "number" || typeof v === "boolean";
const scalarOrList = (v: unknown) => scalar(v) || (Array.isArray(v) && v.every(x => typeof x === "string" || typeof x === "number"));

function readCondition(v: unknown): CliStateCondition | null {
  const c = rec(v);
  if (!c) return null;
  switch (c.kind) {
    case "mode": return isMode(c.mode) ? { kind: "mode", mode: c.mode! } : null;
    case "hostname": return isStr(c.value) ? { kind: "hostname", value: c.value } : null;
    case "interface": return isStr(c.name) && typeof c.prop === "string" && IF_PROPS.has(c.prop) && scalarOrList(c.value) ? { kind: "interface", name: c.name, prop: c.prop as Extract<CliStateCondition, { kind: "interface" }>["prop"], value: c.value as never } : null;
    case "vlan": return Number.isInteger(c.vlanId) ? { kind: "vlan", vlanId: c.vlanId as number } : null;
    case "dhcp-pool": return isStr(c.name) && typeof c.prop === "string" && POOL_PROPS.has(c.prop) && scalarOrList(c.value) ? { kind: "dhcp-pool", name: c.name, prop: c.prop as Extract<CliStateCondition, { kind: "dhcp-pool" }>["prop"], value: c.value as never } : null;
    case "dhcp-excluded": return isStr(c.from) && (c.to === undefined || isStr(c.to)) ? (c.to === undefined ? { kind: "dhcp-excluded", from: c.from } : { kind: "dhcp-excluded", from: c.from, to: c.to as string }) : null;
    case "vtp": return typeof c.prop === "string" && VTP_PROPS.has(c.prop) && isStr(c.value) ? { kind: "vtp", prop: c.prop as "mode" | "domain" | "password", value: c.value } : null;
    default: return null;
  }
}

function readExpectation(v: unknown): CliExpectation | null {
  const e = rec(v);
  if (!e) return null;
  if ("command" in e) {
    if (!isCommandId(e.command)) return null;
    const args = rec(e.args);
    if (e.args !== undefined && !args) return null;
    if (args && !Object.values(args).every(scalarOrList)) return null;
    return args ? { command: e.command, args: args as CliExpectation extends { args?: infer A } ? A : never } : { command: e.command };
  }
  if ("mode" in e) return isMode(e.mode) ? { mode: e.mode! } : null;
  if ("condition" in e) { const c = readCondition(e.condition); return c ? { condition: c } : null; }
  return null;
}

function readSteps(v: unknown): CliStep[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > 40) return null;
  const out: CliStep[] = [];
  const ids = new Set<string>();
  for (const raw of v) {
    const s = rec(raw);
    if (!s || !isStr(s.id) || ids.has(s.id) || !isStr(s.instruction)) return null;
    const expect = readExpectation(s.expect);
    if (!expect) return null;
    ids.add(s.id);
    const step: CliStep = { id: s.id, instruction: s.instruction, expect, hints: strList(s.hints, 2) };
    if (isStr(s.success)) step.success = s.success;
    out.push(step);
  }
  return out;
}

function readGoals(v: unknown): CliGoal[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > 40) return null;
  const out: CliGoal[] = [];
  const ids = new Set<string>();
  for (const raw of v) {
    const g = rec(raw);
    if (!g || !isStr(g.id) || ids.has(g.id) || !isStr(g.label)) return null;
    const condition = readCondition(g.condition);
    if (!condition) return null;
    ids.add(g.id);
    out.push({ id: g.id, label: g.label, condition });
  }
  return out;
}

/**
 * Read an opaque block config into a validated exercise, or null when it is not a well-formed v1 exercise. The
 * result is a NEW, cleaned object (unknown keys dropped; hint ladders capped at two; only known command ids kept).
 */
export function readCliExerciseConfig(config: unknown): CliExerciseConfig | null {
  const c = rec(config);
  if (!c) return null;
  if (typeof c.kind !== "string" || !(CLI_EXERCISE_KINDS as readonly string[]).includes(c.kind)) return null;
  if (typeof c.device !== "string" || !(CLI_DEVICE_TYPES as readonly string[]).includes(c.device)) return null;
  const kind = c.kind as CliExerciseConfig["kind"], device = c.device as CliExerciseConfig["device"];
  const out: CliExerciseConfig = { kind, device };
  if (c.hostname !== undefined) { if (!isStr(c.hostname) || !isSimpleName(c.hostname)) return null; out.hostname = c.hostname; }
  if (c.startMode !== undefined) { if (!isMode(c.startMode)) return null; out.startMode = c.startMode; }
  if (c.startInterface !== undefined) { if (!isStr(c.startInterface)) return null; out.startInterface = c.startInterface; }
  if (c.startPool !== undefined) { if (!isStr(c.startPool) || !isSimpleName(c.startPool)) return null; out.startPool = c.startPool; }
  if ((out.startMode === "interface" || out.startMode === "subinterface") && !out.startInterface) return null;
  if (out.startMode === "dhcp" && !out.startPool) return null;
  if (isStr(c.intro)) out.intro = c.intro;
  if (isStr(c.completion)) out.completion = c.completion;
  if (c.allowed !== undefined) { if (!Array.isArray(c.allowed) || !c.allowed.every(isCommandId)) return null; out.allowed = [...c.allowed]; }
  const preset = rec(c.preset);
  if (preset) {
    const p: NonNullable<CliExerciseConfig["preset"]> = {};
    const ifs = rec(preset.interfaces), vl = rec(preset.vlans), pools = rec(preset.dhcpPools);
    if (ifs) p.interfaces = Object.fromEntries(Object.entries(ifs).map(([k, v]) => [k, rec(v) ?? {}])) as NonNullable<CliExerciseConfig["preset"]>["interfaces"];
    if (vl) p.vlans = Object.fromEntries(Object.entries(vl).map(([k, v]) => [k, rec(v) ?? {}])) as NonNullable<CliExerciseConfig["preset"]>["vlans"];
    if (pools) p.dhcpPools = Object.fromEntries(Object.entries(pools).map(([k, v]) => [k, rec(v) ?? {}])) as NonNullable<CliExerciseConfig["preset"]>["dhcpPools"];
    out.preset = p;
  }
  if (kind === "task") {
    const goals = readGoals(c.goals);
    if (!goals) return null;
    out.goals = goals;
    out.hints = strList(c.hints, 2);
  } else {
    const steps = readSteps(c.steps);
    if (!steps) return null;
    out.steps = steps;
  }
  return out;
}
