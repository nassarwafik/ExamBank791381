import { useId, useMemo, useState } from "react";
import type { AuthoringEditorProps } from "../registryTypes";
import { AUTOMATON_DESIGN_LIMITS, validateAutomatonDesignQuestion, type AutomatonDesignMachineType } from "../../automatonDesignQuestion";
import AutomatonBuilder from "../../learning/activities/AutomatonBuilder";
import { draftOfMachine, initialFaDraft, machineOfDraft, type FaRules } from "../../learning/activities/automatonDraft";
import { parseWords, type LabDraft } from "../../studentTools/automataLab";
import "../../learning/activities/activities.css";

// AUTO-A8 — automatonDesign@1 authoring (lazy). The question's PUBLIC rules — the machine type (deterministic or not), the alphabet, the
// student's state limit, «أوتومات كامل» (deterministic only) and optional example words — and the PRIVATE reference machine, built with
// the very builder the student uses (the table, or the drawing editor on a desktop). The reference is written to `answer` (removed by the
// student sanitizer) as soon as the teacher builds it; until then finalization blocks («الآلة النموذجية مفقودة»). Every change is
// validated live by the same contract the server finalizes and grades with — the example words are checked against the reference.
// The reference may use up to 12 states whatever the student's limit (a teacher's NFA for a DFA question is the same language).
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const TYPE_LABEL: Readonly<Record<AutomatonDesignMachineType, string>> = Object.freeze({ DFA: "أوتومات منتهٍ حتمي", NFA: "أوتومات منتهٍ غير حتمي (يُسمح بـ ε)" });
const words = (v: unknown) => (Array.isArray(v) ? v.filter((w): w is string => typeof w === "string") : []);
const shownWords = (ws: string[]) => ws.map(w => (w === "" ? "ε" : w)).join(" ");

export default function AutomatonDesignEditor({ node, onChange, disabled }: AuthoringEditorProps) {
  const ids = "ade" + useId().replace(/:/g, "");
  const raw = isObj((node as { automatonDesign?: unknown }).automatonDesign) ? (node as { automatonDesign: Record<string, unknown> }).automatonDesign : {};
  const machine: AutomatonDesignMachineType = raw.machine === "NFA" ? "NFA" : "DFA";
  const alphabet = Array.isArray(raw.alphabet) ? raw.alphabet.filter((s): s is string => typeof s === "string") : [];
  const maxStates = typeof raw.maxStates === "number" ? raw.maxStates : 4;
  const complete = raw.complete === true && machine === "DFA";
  const ex = isObj(raw.examples) ? raw.examples : {};
  const accept = words(ex.accept), reject = words(ex.reject);
  const key = isObj(node.answer) ? node.answer : {};
  const issues = useMemo(() => validateAutomatonDesignQuestion(node as unknown as Record<string, unknown>), [node]);

  const [alphabetText, setAlphabetText] = useState(() => alphabet.join(", "));
  const [acceptText, setAcceptText] = useState(() => shownWords(accept));
  const [rejectText, setRejectText] = useState(() => shownWords(reject));
  const refRules = useMemo<FaRules>(() => ({ machine, alphabet, maxStates: AUTOMATON_DESIGN_LIMITS.states, complete: false }), [machine, alphabet.join(",")]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [draft, setDraft] = useState<LabDraft>(() => draftOfMachine(refRules, key.reference) ?? initialFaDraft(refRules));
  const built = isObj(key.reference);

  type Next = { machine?: AutomatonDesignMachineType; alphabet?: string[]; maxStates?: number; complete?: boolean; accept?: string[]; reject?: string[]; draft?: LabDraft };
  const write = (next: Next) => {
    if (disabled) return;
    const m = next.machine ?? machine, a = next.alphabet ?? alphabet;
    const c = m === "DFA" && (next.complete ?? complete);
    const acc = next.accept ?? accept, rej = next.reject ?? reject;
    const rules: FaRules = { machine: m, alphabet: a, maxStates: AUTOMATON_DESIGN_LIMITS.states, complete: false };
    let d = next.draft ?? draft;
    if (d.kind !== m || d.alphabet.join(",") !== a.join(",")) { d = { ...d, kind: m, alphabet: [...a] }; }
    if (d !== draft) setDraft(d);
    const writesReference = built || next.draft !== undefined;
    onChange({
      automatonDesign: { v: 1, machine: m, alphabet: a, maxStates: Math.round(next.maxStates ?? maxStates), ...(c ? { complete: true } : {}), ...(acc.length || rej.length ? { examples: { accept: acc, reject: rej } } : {}) },
      answer: writesReference ? { reference: machineOfDraft(d, rules) } : {},
    } as never);
  };
  const applyAlphabet = (text: string) => { setAlphabetText(text); write({ alphabet: [...new Set(text.split(/[\s,،]+/).filter(Boolean))] }); };

  return (
    <div className="qt-editor qt-automaton-design" data-testid="qt-editor-automatonDesign" dir="rtl">
      <fieldset className="ad-fields" disabled={disabled}>
        <legend>قواعد السؤال (يراها الطالب)</legend>
        <div className="ad-inline" role="radiogroup" aria-label="نوع الآلة">
          {(["DFA", "NFA"] as const).map(t => <label key={t}><input type="radio" name={ids + "-type"} checked={machine === t} onChange={() => write({ machine: t })} />{TYPE_LABEL[t]}</label>)}
        </div>
        <label>الأبجدية (رموز مفصولة بفواصل)<input type="text" dir="ltr" value={alphabetText} maxLength={40} onChange={e => applyAlphabet(e.target.value)} /></label>
        <label>أقصى عدد لحالات آلة الطالب<input type="number" min={1} max={AUTOMATON_DESIGN_LIMITS.states} value={maxStates} onChange={e => write({ maxStates: Number(e.target.value) })} /></label>
        {machine === "DFA" && <label className="ad-check"><input type="checkbox" checked={complete} onChange={e => write({ complete: e.target.checked })} />أوتومات كامل: سهم لكل حالة ولكل رمز (آلة الطالب بلا سهم ناقص تُعتبر خاطئة)</label>}
        <label>كلمات أمثلة تُقبل (اختيارية؛ ε للكلمة الفارغة)<input type="text" dir="ltr" value={acceptText} onChange={e => { setAcceptText(e.target.value); write({ accept: parseWords(e.target.value).slice(0, AUTOMATON_DESIGN_LIMITS.words) }); }} /></label>
        <label>كلمات أمثلة تُرفض (اختيارية)<input type="text" dir="ltr" value={rejectText} onChange={e => { setRejectText(e.target.value); write({ reject: parseWords(e.target.value).slice(0, AUTOMATON_DESIGN_LIMITS.words) }); }} /></label>
        <p className="ad-note">صِف اللغة في نص السؤال. التصحيح: العلامة كاملة إن قبلت آلة الطالب لغة الآلة النموذجية بالضبط، وإلا صفر؛ وتُحفظ أقصر كلمة تختلفان فيها.</p>
      </fieldset>
      <fieldset className="ad-fields" disabled={disabled} data-testid="automaton-reference">
        <legend>الآلة النموذجية (مفتاح التصحيح — لا تصل إلى الطالب)</legend>
        {!built && <p className="ad-note" role="note">ابنِ الآلة النموذجية هنا: أي تعديل عليها يحفظها مفتاحًا للتصحيح.</p>}
        <div className="learning-autodesign">
          <AutomatonBuilder ids={ids} rules={refRules} draft={draft} onDraft={d => write({ draft: d })} machineTitle="الآلة النموذجية"
            quickTitle="فحص سريع للآلة النموذجية" decidedBy="المقارنة مع آلة الطالب تتم عند التصحيح." disabled={disabled} />
        </div>
      </fieldset>
      {issues.length > 0 && <div className="ad-issues" role="alert" data-testid="automaton-question-issues">
        <strong>يحتاج السؤال إلى استكمال قبل الاعتماد:</strong>
        <ul>{issues.slice(0, 8).map((i, k) => <li key={k} data-code={i.code}>{i.message}</li>)}</ul>
      </div>}
    </div>
  );
}
