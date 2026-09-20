// Learning Materials — CLI simulator: EXERCISE progress (session = device state + transcript + step/goal
// progress + hint ladder). Pure functions over plain objects — the React terminal only renders a session and
// calls `submitCommand` / `revealHint`. Nothing is persisted or sent anywhere; `createSession` is the reset.
import type { CliDeviceState, CliExecResult, CliExerciseConfig, CliExpectation, CliExpectedArgs, CliStateCondition, CliStep, ParsedCommand } from "./types";
import { executeCommand } from "./engine";
import { NAVIGATION_COMMANDS } from "./grammar";
import { createInitialState, promptFor, CLI_MODE_LABEL } from "./state";
import { normalizeInterfaceName, aclEntryText, ospfNetworkText } from "./normalize";

export type CliTone = "success" | "error" | "info";
export interface CliHistoryEntry {
  id: number;
  prompt: string;
  input: string;
  /** Execution status, or "not-required" when the exercise refused an otherwise valid command. */
  status: CliExecResult["status"] | "not-required";
  feedback?: string;
  tone: CliTone;
  output?: string[];
}

export interface CliSession {
  state: CliDeviceState;
  history: CliHistoryEntry[];
  /** guided / challenge: index of the current step (= steps.length once every step is achieved). */
  stepIndex: number;
  completed: boolean;
  /** Hints revealed for the CURRENT step (guided / challenge) or for the task. */
  hintsShown: number;
  /** Failed (non-navigation) attempts on the current step / task since the last success. */
  attempts: number;
  nextId: number;
}

/** Learner-facing feedback strings (exported so tests pin the exact wording). */
export const CLI_FEEDBACK = {
  unknown: "✗ أمر غير معروف في هذا المحاكي التعليمي",
  wrongMode: (label: string) => "✗ الأمر صحيح لكنك في الوضع غير المناسب — المطلوب: " + label,
  interfaceFirst: "✗ اختر الواجهة أولًا",
  incomplete: (detail: string) => "✗ الأمر ناقص — " + detail,
  invalid: (detail: string) => "✗ قيمة غير صالحة — " + detail,
  notRequired: "✗ هذا الأمر غير مطلوب في هذا التدريب",
  retry: "✗ حاول مرة أخرى",
  correct: "✓ صحيح",
  guidedStep: "✓ أحسنت",
  done: "✓ تم",
  completed: "✓ أحسنت، أكملت التدريب",
  taskCompleted: "✓ أحسنت، الإعداد المطلوب مكتمل",
} as const;

const MAX_HISTORY = 200;

export function createSession(exercise: CliExerciseConfig): CliSession {
  return { state: createInitialState(exercise), history: [], stepIndex: 0, completed: false, hintsShown: 0, attempts: 0, nextId: 1 };
}

const lc = (v: unknown) => (typeof v === "string" ? v.toLowerCase() : v);
const canonIf = (v: unknown) => (typeof v === "string" ? (normalizeInterfaceName(v) ?? v.toLowerCase()) : v);

function sameValue(actual: unknown, expected: unknown, interfaceNames = false): boolean {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return false;
    const norm = (arr: unknown[]) => arr.map(x => (interfaceNames ? canonIf(x) : lc(x))).map(String).sort();
    const a = norm(actual), e = norm(expected);
    return a.every((x, i) => x === e[i]);
  }
  if (Array.isArray(actual)) return false;
  return interfaceNames ? canonIf(actual) === canonIf(expected) : lc(actual) === lc(expected);
}

/** Does an executed command match `{command, args}`? Interface names and names compare canonically. */
export function commandMatches(cmd: ParsedCommand, id: ParsedCommand["id"], args?: CliExpectedArgs): boolean {
  if (cmd.id !== id) return false;
  if (!args) return true;
  // An access-list expectation pins the entry's fields flat (`action`, `source`, `protocol`, `destination`, `port`).
  const rec = (cmd.id === "access-list" ? { ...cmd, ...cmd.entry } : cmd) as unknown as Record<string, unknown>;
  return Object.entries(args).every(([k, v]) => sameValue(rec[k], v, k === "interfaces" || k === "name" && id === "interface"));
}

function findPool(state: CliDeviceState, name: string) {
  const key = Object.keys(state.dhcpPools).find(k => k.toLowerCase() === name.toLowerCase());
  return key === undefined ? undefined : state.dhcpPools[key];
}

/** Is a state condition satisfied by the state? Pure. */
export function conditionMet(state: CliDeviceState, cond: CliStateCondition): boolean {
  switch (cond.kind) {
    case "mode": return state.mode === cond.mode;
    case "hostname": return sameValue(state.hostname, cond.value);
    case "interface": {
      const name = normalizeInterfaceName(cond.name);
      const i = name ? state.interfaces[name] : undefined;
      if (!i) return false;
      if (cond.prop === "accessGroup") return sameValue(i.accessGroup ? i.accessGroup.acl + " " + i.accessGroup.direction : undefined, cond.value);
      return sameValue(i[cond.prop], cond.value);
    }
    case "vlan": return Boolean(state.vlans[String(cond.vlanId)]);
    case "dhcp-pool": {
      const p = findPool(state, cond.name);
      return p ? sameValue(p[cond.prop], cond.value) : false;
    }
    case "dhcp-excluded": return state.dhcpExcluded.some(e => e.from === cond.from && e.to === cond.to);
    case "vtp": return sameValue(state.vtp[cond.prop], cond.value);
    case "port-security": {
      const name = normalizeInterfaceName(cond.name);
      const ps = name ? state.interfaces[name]?.portSecurity : undefined;
      if (!ps) return cond.prop === "enabled" ? cond.value === false : false;
      return sameValue(ps[cond.prop], cond.value);
    }
    case "line": return sameValue(state.lines[cond.line][cond.prop], cond.value);
    case "device": return sameValue(state[cond.prop], cond.value);
    case "routing": {
      const proc = state.routing[cond.protocol];
      if (!proc) return false;
      if (cond.prop === "id") return proc.id === cond.value;
      const texts = cond.protocol === "ospf" ? state.routing.ospf!.networks.map(ospfNetworkText) : state.routing.eigrp!.networks;
      return texts.some(t => sameValue(t, cond.value));
    }
    case "acl": {
      const list = state.acls[String(cond.number)] ?? [];
      if (cond.prop === "count") return list.length === cond.value;
      return list.some(e => sameValue(aclEntryText(e), cond.value));
    }
  }
}

/** Did this executed command (and resulting state) satisfy an expectation? */
export function expectationMet(expect: CliExpectation, result: CliExecResult, state: CliDeviceState): boolean {
  if (result.status !== "ok") return false;
  if ("command" in expect) return commandMatches(result.command, expect.command, expect.args);
  if ("mode" in expect) return state.mode === expect.mode;
  return conditionMet(state, expect.condition);
}

/** The current step of a guided / challenge exercise (undefined when done or for a task). */
export function currentStep(exercise: CliExerciseConfig, session: CliSession): CliStep | undefined {
  return exercise.kind === "task" ? undefined : exercise.steps?.[session.stepIndex];
}

/** Every goal of a task with its live status. */
export function goalStatus(exercise: CliExerciseConfig, state: CliDeviceState): { id: string; label: string; met: boolean }[] {
  return (exercise.goals ?? []).map(g => ({ id: g.id, label: g.label, met: conditionMet(state, g.condition) }));
}

/** The hint ladder that applies right now (the current step's, or the task's). */
export function applicableHints(exercise: CliExerciseConfig, session: CliSession): string[] {
  if (exercise.kind === "task") return exercise.hints ?? [];
  return currentStep(exercise, session)?.hints ?? [];
}

/** Hints revealed so far (never more than the ladder holds). */
export function visibleHints(exercise: CliExerciseConfig, session: CliSession): string[] {
  return applicableHints(exercise, session).slice(0, session.hintsShown);
}

export function revealHint(exercise: CliExerciseConfig, session: CliSession): CliSession {
  const max = applicableHints(exercise, session).length;
  return session.hintsShown >= max ? session : { ...session, hintsShown: session.hintsShown + 1 };
}

/** The message shown once the exercise is complete. */
export function completionMessage(exercise: CliExerciseConfig): string {
  return exercise.completion ?? (exercise.kind === "task" ? CLI_FEEDBACK.taskCompleted : CLI_FEEDBACK.completed);
}

const IF_MODES = new Set(["interface", "subinterface"]);

function feedbackFor(result: Exclude<CliExecResult, { status: "ok" | "empty" }>, before: CliDeviceState): { feedback: string; tone: CliTone } {
  switch (result.status) {
    case "unknown": return { feedback: CLI_FEEDBACK.unknown, tone: "error" };
    case "incomplete": return { feedback: CLI_FEEDBACK.incomplete(result.detail), tone: "error" };
    case "invalid": return { feedback: CLI_FEEDBACK.invalid(result.detail), tone: "error" };
    case "wrong-mode": {
      const onlyInterface = result.requiredModes.every(m => IF_MODES.has(m));
      if (onlyInterface && !IF_MODES.has(before.mode)) return { feedback: CLI_FEEDBACK.interfaceFirst, tone: "error" };
      return { feedback: CLI_FEEDBACK.wrongMode(result.requiredModes.map(m => CLI_MODE_LABEL[m]).join(" أو ")), tone: "error" };
    }
  }
}

function push(session: CliSession, entry: Omit<CliHistoryEntry, "id">): CliSession {
  const history = [...session.history, { ...entry, id: session.nextId }];
  return { ...session, history: history.length > MAX_HISTORY ? history.slice(history.length - MAX_HISTORY) : history, nextId: session.nextId + 1 };
}

/**
 * Submit ONE line: execute it against the device (unknown / wrong-mode / incomplete / invalid input never changes
 * state), refuse commands the exercise does not allow (never executed), then advance the step / goal progress.
 * Pure: returns a new session; the previous one is untouched.
 */
export function submitCommand(exercise: CliExerciseConfig, session: CliSession, raw: unknown): CliSession {
  const before = session.state;
  const prompt = promptFor(before);
  const exec = executeCommand(before, raw);
  const input = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  if (exec.result.status === "empty") return session;
  if (exec.result.status !== "ok") {
    const { feedback, tone } = feedbackFor(exec.result, before);
    return push({ ...session, attempts: session.attempts + 1 }, { prompt, input, status: exec.result.status, feedback, tone });
  }
  const cmd = exec.result.command;
  const navigation = NAVIGATION_COMMANDS.includes(cmd.id);
  if (exercise.allowed && !navigation && !exercise.allowed.includes(cmd.id)) {
    return push({ ...session, attempts: session.attempts + 1 }, { prompt, input, status: "not-required", feedback: CLI_FEEDBACK.notRequired, tone: "error" });
  }
  const state = exec.state;
  const base: CliSession = { ...session, state };
  const output = exec.result.output;
  if (exercise.kind === "task") {
    const allMet = (exercise.goals ?? []).length > 0 && goalStatus(exercise, state).every(g => g.met);
    if (allMet && !session.completed) return push({ ...base, completed: true, attempts: 0 }, { prompt, input, status: "ok", feedback: completionMessage(exercise), tone: "success", output });
    if (navigation || session.completed) return push(base, { prompt, input, status: "ok", feedback: CLI_FEEDBACK.done, tone: "info", output });
    return push({ ...base, attempts: session.attempts + 1 }, { prompt, input, status: "ok", feedback: CLI_FEEDBACK.done, tone: "info", output });
  }
  const step = currentStep(exercise, session);
  if (!step) return push(base, { prompt, input, status: "ok", feedback: CLI_FEEDBACK.done, tone: "info", output });
  if (expectationMet(step.expect, exec.result, state)) {
    const stepIndex = session.stepIndex + 1;
    const completed = stepIndex >= (exercise.steps?.length ?? 0);
    const feedback = step.success ?? (exercise.kind === "guided" ? CLI_FEEDBACK.guidedStep : CLI_FEEDBACK.correct);
    return push({ ...base, stepIndex, completed, hintsShown: 0, attempts: 0 }, { prompt, input, status: "ok", feedback, tone: "success", output });
  }
  if (navigation) return push(base, { prompt, input, status: "ok", feedback: CLI_FEEDBACK.done, tone: "info", output });
  return push({ ...base, attempts: session.attempts + 1 }, { prompt, input, status: "ok", feedback: CLI_FEEDBACK.retry, tone: "error", output });
}
