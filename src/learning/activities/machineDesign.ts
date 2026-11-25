// AUTO-A10 (docs/enterprise-automata-lab-a4.md §14) — the browser side of «صمّم الآلة» for a push-down automaton or a Turing machine
// (`simulation` / `machine-design` v1): the reader of the SERVED task (its public statement only; the reference never reaches the
// browser) and the Arabic text of the server's verdict. The judge itself is the server's (api/src/lib/learning-machine-design.js).

const SYMBOL = /^[A-Za-z0-9#*+@]$/;
export const MACHINE_DESIGN_MAX_STATES = 12;

export type MachineTask = {
  intro: string;
  machine: "PDA" | "TM";
  alphabet: string[];
  maxStates: number;
  mode: "recognize" | "compute";
  leftEnd: boolean;
  maxLength: number;
  examples: { accept: string[]; reject: string[]; compute: { word: string; answer: string }[] };
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const words = (v: unknown): string[] | null => {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > 8 || !v.every(w => typeof w === "string" && w.length <= 20)) return null;
  return [...new Set(v as string[])];
};

/** The task of a served (or authored) block, or null when it does not read — the activity then shows its fallback. Strict. */
export function readMachineTask(config: unknown): MachineTask | null {
  const t = isObj(config) && isObj(config.task) ? config.task : null;
  if (!t || typeof t.intro !== "string" || !t.intro.trim()) return null;
  if (t.machine !== "PDA" && t.machine !== "TM") return null;
  if (!Array.isArray(t.alphabet) || t.alphabet.length === 0 || t.alphabet.length > 4) return null;
  const alphabet: string[] = [];
  for (const s of t.alphabet) { if (typeof s !== "string" || !SYMBOL.test(s) || alphabet.includes(s)) return null; alphabet.push(s); }
  const maxStates = t.maxStates === undefined ? MACHINE_DESIGN_MAX_STATES : t.maxStates;
  if (!Number.isInteger(maxStates) || (maxStates as number) < 1 || (maxStates as number) > MACHINE_DESIGN_MAX_STATES) return null;
  const mode = t.mode === undefined ? "recognize" : t.mode;
  if (mode !== "recognize" && mode !== "compute") return null;
  if (mode === "compute" && t.machine !== "TM") return null;
  if (t.leftEnd !== undefined && (t.leftEnd !== true || t.machine !== "TM")) return null;
  const maxLength = t.maxLength === undefined ? 8 : t.maxLength;
  if (!Number.isInteger(maxLength) || (maxLength as number) < 1 || (maxLength as number) > 10) return null;
  const ex = t.examples === undefined ? {} : t.examples;
  if (!isObj(ex)) return null;
  const accept = words(ex.accept), reject = words(ex.reject);
  const compute = ex.compute === undefined ? [] : Array.isArray(ex.compute) && ex.compute.length <= 8 && ex.compute.every(x => isObj(x) && typeof x.word === "string" && typeof x.answer === "string")
    ? (ex.compute as { word: string; answer: string }[]).map(x => ({ word: x.word, answer: x.answer })) : null;
  if (!accept || !reject || !compute) return null;
  return { intro: t.intro, machine: t.machine, alphabet, maxStates: maxStates as number, mode, leftEnd: t.leftEnd === true, maxLength: maxLength as number, examples: { accept, reject, compute } };
}

const shown = (w: string) => (w === "" ? "ε (الكلمة الفارغة)" : w);
const answerText = (a: string | null | undefined) => (a === null || a === undefined ? "لا جواب بين علامتي $" : "«" + (a === "" ? "ε" : a) + "»");
/** The server's counterexample in words (a recognised language, or a computed function). */
export function counterexampleText(ce: { word: string; shouldAccept?: boolean; expected?: string | null; got?: string | null }): string {
  if (ce.shouldAccept !== undefined) return "الكلمة " + shown(ce.word) + (ce.shouldAccept ? " يجب أن تُقبل، لكن آلتك ترفضها." : " يجب أن تُرفض، لكن آلتك تقبلها.");
  return "على الكلمة " + shown(ce.word) + " الجواب الصحيح " + answerText(ce.expected) + "، وآلتك تعطي " + answerText(ce.got) + ".";
}
