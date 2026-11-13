// AUTO-A3 (docs/enterprise-automata-design-a3.md) — the browser side of «صمّم الآلة»: the reader of the SERVED task (the public
// statement only; the reference machine never reaches the browser) and the Arabic text of the public rules a machine can break.
// The judge itself is the server's (api/src/lib/learning-automaton-design.js): nothing here decides right or wrong.

/** The state limit of a learner's machine (the server's AUTOMATON_DESIGN_LIMITS.states). */
export const MAX_DESIGN_STATES = 12;
const SYMBOL = /^[A-Za-z0-9#$*+@]$/;

export type DesignTask = {
  intro: string;
  machine: "DFA" | "NFA";
  alphabet: string[];
  maxStates: number;
  complete: boolean;
  examples: { accept: string[]; reject: string[] };
};

const words = (v: unknown, alphabet: string[]): string[] | null => {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > 8) return null;
  const out: string[] = [];
  for (const w of v) {
    if (typeof w !== "string" || w.length > 20 || ![...w].every(c => alphabet.includes(c))) return null;
    if (!out.includes(w)) out.push(w);
  }
  return out;
};

/** The task of a served (or authored) block, or null when it does not read — the activity then shows its fallback. Strict. */
export function readDesignTask(config: unknown): DesignTask | null {
  const c = config && typeof config === "object" && !Array.isArray(config) ? (config as Record<string, unknown>) : null;
  const t = c && c.task && typeof c.task === "object" && !Array.isArray(c.task) ? (c.task as Record<string, unknown>) : null;
  if (!t || typeof t.intro !== "string" || !t.intro.trim()) return null;
  if (t.machine !== "DFA" && t.machine !== "NFA") return null;
  if (!Array.isArray(t.alphabet) || t.alphabet.length === 0 || t.alphabet.length > 6) return null;
  const alphabet: string[] = [];
  for (const s of t.alphabet) { if (typeof s !== "string" || !SYMBOL.test(s) || alphabet.includes(s)) return null; alphabet.push(s); }
  const maxStates = t.maxStates === undefined ? MAX_DESIGN_STATES : t.maxStates;
  if (!Number.isInteger(maxStates) || (maxStates as number) < 1 || (maxStates as number) > MAX_DESIGN_STATES) return null;
  if (t.complete !== undefined && typeof t.complete !== "boolean") return null;
  if (t.complete === true && t.machine !== "DFA") return null;
  const ex = t.examples === undefined ? {} : t.examples;
  if (!ex || typeof ex !== "object" || Array.isArray(ex)) return null;
  const accept = words((ex as Record<string, unknown>).accept, alphabet), reject = words((ex as Record<string, unknown>).reject, alphabet);
  if (!accept || !reject) return null;
  return { intro: t.intro, machine: t.machine, alphabet, maxStates: maxStates as number, complete: t.complete === true, examples: { accept, reject } };
}

/** The Arabic sentence for a public rule the server says the machine broke. */
export function issueText(issue: { code: string; state?: string; symbol?: string; max?: number }): string {
  switch (issue.code) {
    case "incomplete": return "الأوتومات ليس كاملًا: لا يوجد سهم من " + (issue.state ?? "") + " بالرمز " + (issue.symbol ?? "") + ".";
    case "two-arrows": return "في الأوتومات الحتمي سهم واحد فقط لكل حالة ولكل رمز، ومن " + (issue.state ?? "") + " بالرمز " + (issue.symbol ?? "") + " أكثر من سهم.";
    case "epsilon-in-dfa": return "لا توجد انتقالات ε في الأوتومات الحتمي.";
    case "symbol-outside-alphabet": return "الرمز " + (issue.symbol ?? "") + " ليس في أبجدية التمرين.";
    case "too-many-states": return "عدد الحالات أكبر من المسموح (" + (issue.max ?? "") + ").";
    case "no-start": return "اختر حالة البداية.";
    case "no-states": return "أضف حالة واحدة على الأقل.";
    default: return "تعذّر قراءة الآلة. تأكد من الحالات والانتقالات.";
  }
}
