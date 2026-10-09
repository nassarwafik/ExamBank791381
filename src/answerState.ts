// Phase 14A — the ONE "is this answer answered?" predicate, extracted verbatim from StudentQuestionCard.tsx into a pure,
// React-free module so the exam structure helpers (examStructure → examCover → examPreviewModel → examBuilderState →
// examQuality → examFinalization) can be compiled for the server governance authority without pulling a React component.
// StudentQuestionCard re-exports it, so every existing importer keeps the same function.
import { isSimulationStateAnswered, type JsonValue } from "./smartsimState";
import type { NetworkCliDeviceState } from "./networkCliEngine";
// Phase 20D adds "composite" (composite@1: the CONTAINING authority only — { parts: partId → the child's own Answer, contexts: contextId → the
// shared SmartSim context's Answer }; answered ⇔ some part or some context answered).
// Phase 20A adds "smartSim" (a trusted SmartSim answer: the plugin identity + bounded SEMANTIC actions + a restore-only state the server
// re-derives by replay — never grading authority; answered ⇔ ≥ 1 action; a reset simulation is unanswered).
// Phase 19F adds "codeTemplate" (coding@3 locked template: ONLY the gap values — never a source, never locked text; answered ⇔ some gap
// holds non-blank text). The official source is reconstructed on the server from the published template.
// Phase 19D adds "hotspot" (normalized image-content points only — never a score, a target id or pixels; answered ⇔ ≥ 1 point).
// Phase 18C adds "networkCli" (a bounded command history + the canonical device state the shared engine derives from it; answered ⇔ ≥ 1 command).
// Phase 16B-A adds "simulation" (an opaque, bounded JSON state reported by a sandboxed simulator; answered ⇔ non-empty).
export type FieldValue = string | boolean | string[];
// Answer is a discriminated union. The first four members are the ORIGINAL shapes and are kept
// byte-for-byte so every stored draft / submitted attempt still loads and grades. "fields" and
// "compound" are the additive new shapes for generalized field questions and compound questions.
// Phase 16A adds two explicit response shapes for the Wave 1 types: "multiChoice" (Multiple Select — option IDENTITIES, never
// visual indexes) and "numeric" (Numeric Response — the raw text the student typed plus an optional unit; parsing happens in
// the grader). Matrix and Categorization reuse "fields" (rowId → columnId / itemId → categoryId), which is semantically clean.
// Unknown kinds fail closed in answered() (never counted as answered).
export type Answer={kind:"choice";index:number}|{kind:"sequence";values:string[]}|{kind:"table";values:(string|boolean)[]}|{kind:"text";value:string}|{kind:"fields";values:Record<string,FieldValue>}|{kind:"compound";parts:Record<string,Answer>}|{kind:"multiChoice";optionIds:string[]}|{kind:"numeric";value:string;unit?:string}|{kind:"simulation";state:JsonValue}|{kind:"code";language:string;languageVersion:number;source:string}|{kind:"networkCli";commands:string[];state:NetworkCliDeviceState}|{kind:"hotspot";points:{x:number;y:number}[]}|{kind:"chartSelection";chartId:string;targets:string[]}|{kind:"functionGraphSelection";graphId:string;targets:string[]}|{kind:"codeTemplate";language:string;languageVersion:number;values:Record<string,string>}|{kind:"smartSim";pluginKey:string;pluginVersion:number;actions:JsonValue[];state:JsonValue}|{kind:"composite";parts:Record<string,Answer>;contexts:Record<string,Answer>};

const nonEmptyValue = (v: unknown) => (typeof v === "boolean" ? v : String(v ?? "").trim() !== "");
export function answered(a: Answer | undefined): boolean {
  if (!a) return false;
  if (a.kind === "choice") return Number.isInteger(a.index);
  if (a.kind === "text") return !!a.value.trim();
  if (a.kind === "sequence" || a.kind === "table") return a.values.some(nonEmptyValue);
  if (a.kind === "fields") return Object.values(a.values).some(v => (Array.isArray(v) ? v.some(nonEmptyValue) : nonEmptyValue(v)));
  if (a.kind === "compound") return Object.values(a.parts).some(answered);
  if (a.kind === "multiChoice") return Array.isArray(a.optionIds) && a.optionIds.some(id => typeof id === "string" && id !== "");
  if (a.kind === "numeric") return typeof a.value === "string" && a.value.trim() !== "";
  if (a.kind === "simulation") return isSimulationStateAnswered(a.state);
  if (a.kind === "code") return typeof a.source === "string" && a.source.trim() !== "";   // 17A — source TEXT, never trimmed when stored
  if (a.kind === "networkCli") return Array.isArray(a.commands) && a.commands.some(c => typeof c === "string" && c.trim() !== "");   // 18C — mirror of networkCliQuestion.isNetworkCliAnswerAnswered
  if (a.kind === "hotspot") return Array.isArray(a.points) && a.points.length > 0;   // 19D — mirror of hotspotQuestion.isHotspotAnswerAnswered
  if (a.kind === "chartSelection") return Array.isArray(a.targets) && a.targets.length > 0;   // 21A.1 — mirror of chartSelectionQuestion.isChartSelectionAnswerAnswered
  if (a.kind === "functionGraphSelection") return Array.isArray(a.targets) && a.targets.length > 0;   // 21A.2 — mirror of isFunctionGraphSelectionAnswerAnswered
  if (a.kind === "smartSim") return Array.isArray(a.actions) && a.actions.length > 0;   // 20A — mirror of trustedSimQuestion.isSmartSimAnswerAnswered
  if (a.kind === "composite") return (!!a.parts && typeof a.parts === "object" && Object.values(a.parts).some(answered)) || (!!a.contexts && typeof a.contexts === "object" && Object.values(a.contexts).some(answered));   // 20D — mirror of compositeModel.isCompositeAnswerAnswered
  if (a.kind === "codeTemplate") return !!a.values && typeof a.values === "object" && Object.values(a.values).some(v => typeof v === "string" && v.trim() !== "");   // 19F — mirror of codingTemplate.isCodeTemplateAnswered
  return false;
}
