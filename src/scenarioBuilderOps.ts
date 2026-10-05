// Phase 19G — the PURE builder operations of the Scenario layer, scoped to ONE section (the only owner of `scenarios[]`). Every function
// returns NEW objects (React state is never mutated) and returns the SAME section reference when nothing changes. None of them touches a
// question's type, version, marks, answer, grading or media: membership is only `scenario.questionIds`, and the presentation order of
// the linked questions is the section's own `questions` order (members are kept contiguous; link / move / regroup reorder the section's
// question list, which is the one order authority). Loaded only by the Builder chunk (never by the initial graph).
import type { BuilderQuestion, BuilderSection } from "./examTypes";
import { genId, mergePatch, moveInArray } from "./examBuilderState";
import type { ScenarioV1, SourceStimulusKind, SourceStimulusV1 } from "./scenarioSource";

export function newScenario(overrides: Partial<ScenarioV1> = {}): ScenarioV1 {
  return { id: genId("scn"), version: 1, title: "", instructions: "", sources: [], questionIds: [], ...overrides };
}
export function newSourceStimulus(kind: SourceStimulusKind, overrides: Partial<Record<string, unknown>> = {}): SourceStimulusV1 {
  const base = { id: genId("src"), version: 1 as const };
  switch (kind) {
    case "image": return { ...base, kind: "image", alt: "", image: {}, ...overrides } as SourceStimulusV1;
    case "table": return { ...base, kind: "table", columnHeaders: ["", ""], rows: [["", ""]], ...overrides } as SourceStimulusV1;
    case "code": return { ...base, kind: "code", language: "python", source: "", ...overrides } as SourceStimulusV1;
    default: return { ...base, kind: "text", text: "", ...overrides } as SourceStimulusV1;
  }
}

const scenariosOf = (s: BuilderSection): ScenarioV1[] => (Array.isArray(s.scenarios) ? s.scenarios : []);
const qid = (q: BuilderQuestion): string => String(q.examQuestionId);
/** The ids ordered as the section lists its questions (the canonical membership order); unknown ids keep their relative place at the end. */
function sectionOrder(questions: BuilderQuestion[], ids: readonly string[]): string[] {
  const pos = new Map(questions.map((q, i) => [qid(q), i]));
  return [...ids].sort((a, b) => (pos.get(a) ?? 1e9) - (pos.get(b) ?? 1e9));
}
function mapScenario(section: BuilderSection, scenarioId: string, fn: (sc: ScenarioV1) => ScenarioV1): BuilderSection {
  const list = scenariosOf(section);
  const i = list.findIndex(s => s.id === scenarioId);
  if (i < 0) return section;
  const next = fn(list[i]);
  if (next === list[i]) return section;
  const scenarios = list.slice(); scenarios[i] = next;
  return { ...section, scenarios };
}

// ── scenario CRUD ─────────────────────────────────────────────────────────────────────────────────────────────────────
export const addScenario = (section: BuilderSection, scenario: ScenarioV1 = newScenario()): BuilderSection => ({ ...section, scenarios: [...scenariosOf(section), scenario] });
export const updateScenario = (section: BuilderSection, scenarioId: string, patch: Partial<Pick<ScenarioV1, "title" | "instructions">>): BuilderSection => mapScenario(section, scenarioId, sc => mergePatch<ScenarioV1>(sc, patch as Partial<ScenarioV1>));
/** Deleting a scenario leaves every question in place, intact and standalone. */
export function deleteScenario(section: BuilderSection, scenarioId: string): BuilderSection {
  const list = scenariosOf(section);
  if (!list.some(s => s.id === scenarioId)) return section;
  return { ...section, scenarios: list.filter(s => s.id !== scenarioId) };
}
export function moveScenario(section: BuilderSection, scenarioId: string, delta: number): BuilderSection {
  const list = scenariosOf(section);
  const i = list.findIndex(s => s.id === scenarioId);
  const next = i < 0 ? list : moveInArray(list, i, delta);
  return next === list ? section : { ...section, scenarios: next };
}

// ── source CRUD (inside one scenario) ─────────────────────────────────────────────────────────────────────────────────
export const addScenarioSource = (section: BuilderSection, scenarioId: string, source: SourceStimulusV1): BuilderSection => mapScenario(section, scenarioId, sc => ({ ...sc, sources: [...sc.sources, source] }));
export const updateScenarioSource = (section: BuilderSection, scenarioId: string, sourceId: string, patch: Record<string, unknown>): BuilderSection =>
  mapScenario(section, scenarioId, sc => (sc.sources.some(s => s.id === sourceId) ? { ...sc, sources: sc.sources.map(s => (s.id === sourceId ? (mergePatch(s as unknown as Record<string, unknown>, patch) as unknown as SourceStimulusV1) : s)) } : sc));
export const deleteScenarioSource = (section: BuilderSection, scenarioId: string, sourceId: string): BuilderSection =>
  mapScenario(section, scenarioId, sc => (sc.sources.some(s => s.id === sourceId) ? { ...sc, sources: sc.sources.filter(s => s.id !== sourceId) } : sc));
export const moveScenarioSource = (section: BuilderSection, scenarioId: string, sourceId: string, delta: number): BuilderSection =>
  mapScenario(section, scenarioId, sc => { const i = sc.sources.findIndex(s => s.id === sourceId); const next = i < 0 ? sc.sources : moveInArray(sc.sources, i, delta); return next === sc.sources ? sc : { ...sc, sources: next }; });
/** Changes a source's KIND: a fresh body of the new kind under the SAME id and title (the old kind's payload is dropped). */
export const replaceScenarioSource = (section: BuilderSection, scenarioId: string, sourceId: string, kind: SourceStimulusKind): BuilderSection =>
  mapScenario(section, scenarioId, sc => ({ ...sc, sources: sc.sources.map(s => (s.id === sourceId ? newSourceStimulus(kind, { id: s.id, ...(s.title !== undefined ? { title: s.title } : {}) }) : s)) }));

// ── membership ────────────────────────────────────────────────────────────────────────────────────────────────────────
export const scenarioOf = (section: BuilderSection, questionId: string): ScenarioV1 | undefined => scenariosOf(section).find(s => s.questionIds.includes(questionId));
/** The section's questions that belong to NO scenario (the ones a scenario may link). */
export function linkableQuestions(section: BuilderSection, _scenarioId?: string): BuilderQuestion[] {
  const taken = new Set(scenariosOf(section).flatMap(s => s.questionIds));
  return section.questions.filter(q => !taken.has(qid(q)));
}
function memberIndices(section: BuilderSection, sc: ScenarioV1): number[] {
  const set = new Set(sc.questionIds);
  return section.questions.map((q, i) => (set.has(qid(q)) ? i : -1)).filter(i => i >= 0);
}
/** Links an existing question of THIS section (not yet in any scenario) and moves it right after the scenario's last member, so the
 *  members stay contiguous; a scenario without members anchors where the question already is. Marks / answers / type are untouched. */
export function linkScenarioQuestion(section: BuilderSection, scenarioId: string, questionId: string): BuilderSection {
  const sc = scenariosOf(section).find(s => s.id === scenarioId);
  const qi = section.questions.findIndex(q => qid(q) === questionId);
  if (!sc || qi < 0 || scenarioOf(section, questionId)) return section;
  const members = memberIndices(section, sc);
  let questions = section.questions;
  if (members.length) {
    const last = Math.max(...members);
    const arr = questions.slice();
    const [item] = arr.splice(qi, 1);
    arr.splice(qi < last ? last : last + 1, 0, item);
    questions = arr;
  }
  const next = mapScenario({ ...section, questions }, scenarioId, s => ({ ...s, questionIds: sectionOrder(questions, [...s.questionIds, questionId]) }));
  return next;
}
/** Removes only the reference; the question stays where it is, intact. */
export const unlinkScenarioQuestion = (section: BuilderSection, scenarioId: string, questionId: string): BuilderSection =>
  mapScenario(section, scenarioId, sc => (sc.questionIds.includes(questionId) ? { ...sc, questionIds: sc.questionIds.filter(id => id !== questionId) } : sc));
/** Moves a linked question one place among the scenario's members (never past a non-member); presentation order only. */
export function moveScenarioQuestion(section: BuilderSection, scenarioId: string, questionId: string, delta: number): BuilderSection {
  const sc = scenariosOf(section).find(s => s.id === scenarioId);
  if (!sc) return section;
  const members = memberIndices(section, sc);
  const p = members.findIndex(i => qid(section.questions[i]) === questionId);
  const target = p + delta;
  if (p < 0 || target < 0 || target >= members.length) return section;
  const arr = section.questions.slice();
  const [item] = arr.splice(members[p], 1);
  arr.splice(members[target], 0, item);
  return mapScenario({ ...section, questions: arr }, scenarioId, s => ({ ...s, questionIds: sectionOrder(arr, s.questionIds) }));
}
/** Makes scattered members contiguous at the first member's position (stable relative order). Same reference when already contiguous. */
export function regroupScenario(section: BuilderSection, scenarioId: string): BuilderSection {
  const sc = scenariosOf(section).find(s => s.id === scenarioId);
  if (!sc) return section;
  const members = memberIndices(section, sc);
  if (members.length < 2 || members[members.length - 1] - members[0] + 1 === members.length) return section;
  const set = new Set(members);
  const picked = members.map(i => section.questions[i]);
  const rest = section.questions.filter((_, i) => !set.has(i));
  const arr = [...rest.slice(0, members[0]), ...picked, ...rest.slice(members[0])];
  return mapScenario({ ...section, questions: arr }, scenarioId, s => ({ ...s, questionIds: sectionOrder(arr, s.questionIds) }));
}
/** Adds a NEW canonical question (from the catalog factory) right after the scenario's last member and links it. */
export function createQuestionInScenario(section: BuilderSection, scenarioId: string, question: BuilderQuestion): BuilderSection {
  const sc = scenariosOf(section).find(s => s.id === scenarioId);
  if (!sc) return section;
  const members = memberIndices(section, sc);
  const at = members.length ? Math.max(...members) + 1 : section.questions.length;
  const questions = section.questions.slice(); questions.splice(at, 0, question);
  return linkScenarioQuestion({ ...section, questions }, scenarioId, qid(question));
}
