// Phase 20F / 21I — the composer's GENERATE form state (the dialog's structured controls) and its pre-fill from the builder prompt. Kept out
// of the dialog component file so the pure mapping is testable and the component file exports components only.
import { COMPOSER_CAPABILITY_DEFAULT_OFF, COMPOSER_CAPABILITY_FLAGS, COMPOSER_DIFFICULTIES, COMPOSER_LANGUAGES, type ComposerCapabilityFlag } from "./composerIntent";
import { COMPOSER_ITEM_KINDS, type ComposerItemKind } from "./composerCatalog";
import { COMPOSER_LIMITS } from "./composerLimits";
import { PREFILL_CAPABILITY_KEYS, type ComposerPrefill } from "../examRequestRouting";

export type GenForm = {
  subject: string; course: string; grade: string; language: (typeof COMPOSER_LANGUAGES)[number]; totalMarks: string; durationMinutes: string;
  difficulty: (typeof COMPOSER_DIFFICULTIES)[number]; sectionTarget: string; questionTarget: string; preset: string;
  types: Record<ComposerItemKind, boolean>; capabilities: Record<ComposerCapabilityFlag, boolean>; requiredTopics: string; excludedTopics: string; instruction: string;
};
export const initialForm = (): GenForm => ({
  subject: "", course: "", grade: "", language: "ar", totalMarks: "", durationMinutes: "", difficulty: "mixed", sectionTarget: "", questionTarget: "", preset: "auto",
  types: Object.fromEntries(COMPOSER_ITEM_KINDS.map(k => [k, true])) as Record<ComposerItemKind, boolean>,
  capabilities: Object.fromEntries(COMPOSER_CAPABILITY_FLAGS.map(f => [f, !COMPOSER_CAPABILITY_DEFAULT_OFF.includes(f)])) as Record<ComposerCapabilityFlag, boolean>,
  requiredTopics: "", excludedTopics: "", instruction: ""
});
/** Phase 21I — the generate form filled from a request pre-fill: only the structured controls the pre-fill names change; every other
 *  control keeps its default. The free instruction is the teacher's own request text. */
export function formFromPrefill(prefill: ComposerPrefill): GenForm {
  const f = initialForm();
  const capabilities = { ...f.capabilities };
  for (const k of PREFILL_CAPABILITY_KEYS) if (typeof prefill.capabilities[k] === "boolean" && k in capabilities) capabilities[k as ComposerCapabilityFlag] = prefill.capabilities[k] as boolean;
  return {
    ...f,
    subject: prefill.subject.slice(0, COMPOSER_LIMITS.shortText),
    course: prefill.course.slice(0, COMPOSER_LIMITS.shortText),
    grade: prefill.grade.slice(0, COMPOSER_LIMITS.shortText),
    language: (COMPOSER_LANGUAGES as readonly string[]).includes(prefill.language) ? prefill.language : f.language,
    totalMarks: String(prefill.totalMarks),
    durationMinutes: prefill.durationMinutes ? String(prefill.durationMinutes) : "",
    difficulty: (COMPOSER_DIFFICULTIES as readonly string[]).includes(prefill.difficulty) ? prefill.difficulty : f.difficulty,
    questionTarget: prefill.questionTarget ? String(prefill.questionTarget) : "",
    capabilities,
    requiredTopics: prefill.requiredTopics.join("، "),
    instruction: prefill.instruction
  };
}

const topicsOf = (s: string) => [...new Set(s.split(/[,،]/).map(t => t.trim()).filter(Boolean))];
const intNum = (s: string) => (s.trim() === "" ? null : Number(s));

/** The intent input exactly as normalizeComposerIntent expects it (empty optional controls are omitted; the code normalizes the rest). */
export function intentInputOf(f: GenForm): Record<string, unknown> {
  const types = COMPOSER_ITEM_KINDS.filter(k => f.types[k]);
  const out: Record<string, unknown> = { v: 1, subject: f.subject.trim(), language: f.language, totalMarks: intNum(f.totalMarks), difficulty: f.difficulty, capabilities: { ...f.capabilities }, presentationPreset: f.preset };
  if (f.course.trim()) out.course = f.course.trim();
  if (f.grade.trim()) out.grade = f.grade.trim();
  if (f.durationMinutes.trim()) out.durationMinutes = intNum(f.durationMinutes);
  if (f.sectionTarget.trim()) out.sectionTarget = intNum(f.sectionTarget);
  if (f.questionTarget.trim()) out.questionTarget = intNum(f.questionTarget);
  if (types.length !== COMPOSER_ITEM_KINDS.length) out.allowedQuestionTypes = types;
  const req = topicsOf(f.requiredTopics), exc = topicsOf(f.excludedTopics);
  if (req.length) out.requiredTopics = req;
  if (exc.length) out.excludedTopics = exc;
  if (f.instruction.trim()) out.teacherInstruction = f.instruction.trim();
  return out;
}
