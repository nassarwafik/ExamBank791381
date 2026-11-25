import { useId, useMemo, useState } from "react";
import type { AuthoringEditorProps } from "../registryTypes";
import { MACHINE_DESIGN_LIMITS, validateMachineDesignQuestion, type MachineDesignKind } from "../../machineDesignQuestion";
import MachineBuilder from "../../learning/activities/MachineBuilder";
import { draftOfMachineShape, initialMachineDraft, machineOfLabDraft, type MachineRules } from "../../learning/activities/machineDraft";
import { layoutOfDraft } from "../../learning/activities/automatonDraft";
import { parseWords, type LabDraft } from "../../studentTools/automataLab";
import "../../learning/activities/activities.css";

// AUTO-A11a — machineDesign@1 authoring (lazy). The question's PUBLIC rules — a push-down automaton or a Turing machine, for a Turing machine
// «تميّز لغة» or «تحسب دالة» and the book's left end ├, the alphabet, the student's state limit, the longest word the check tries, and
// optional examples (words that are accepted / rejected, or a function's word → answer) — and the PRIVATE reference machine, built with the
// very builder the student uses. The reference is written to `answer` (removed by the student sanitizer) as soon as the teacher builds it;
// until then finalization blocks («الآلة النموذجية مفقودة»). Every change is validated live by the same contract the server finalizes and
// grades with: the reference is read by the book's engine, and the examples are run on it.
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const KIND_LABEL: Readonly<Record<MachineDesignKind, string>> = Object.freeze({ PDA: "أوتومات مكدّس (حتمي)", TM: "آلة تورنغ (حتمية)" });
const words = (v: unknown) => (Array.isArray(v) ? v.filter((w): w is string => typeof w === "string") : []);
const shownWords = (ws: string[]) => ws.map(w => (w === "" ? "ε" : w)).join(" ");
type Pair = { word: string; answer: string };
const pairs = (v: unknown): Pair[] => (Array.isArray(v) ? v.filter(isObj).filter(x => typeof x.word === "string" && typeof x.output === "string").map(x => ({ word: x.word as string, answer: x.output as string })) : []);
const shownPairs = (ps: Pair[]) => ps.map(p => (p.word || "ε") + "=" + (p.answer || "ε")).join(" ");
/** «111=11111 ε=11»: a word, «=», its answer (ε for the empty word or answer). */
function parsePairs(text: string): Pair[] {
  const out: Pair[] = [];
  for (const raw of text.split(/[\s,،]+/)) {
    const m = /^([^=]*)=(.*)$/.exec(raw);
    if (!m) continue;
    const e = (s: string) => (s === "ε" ? "" : s);
    if (!out.some(p => p.word === e(m[1]))) out.push({ word: e(m[1]), answer: e(m[2]) });
  }
  return out.slice(0, MACHINE_DESIGN_LIMITS.words);
}

export default function MachineDesignEditor({ node, onChange, disabled }: AuthoringEditorProps) {
  const ids = "mde" + useId().replace(/:/g, "");
  const raw = isObj((node as { machineDesign?: unknown }).machineDesign) ? (node as { machineDesign: Record<string, unknown> }).machineDesign : {};
  const machine: MachineDesignKind = raw.machine === "TM" ? "TM" : "PDA";
  const compute = machine === "TM" && raw.mode === "compute";
  const leftEnd = machine === "TM" && raw.leftEnd === true;
  const alphabet = Array.isArray(raw.alphabet) ? raw.alphabet.filter((s): s is string => typeof s === "string") : [];
  const maxStates = typeof raw.maxStates === "number" ? raw.maxStates : 6;
  const maxLength = typeof raw.maxLength === "number" ? raw.maxLength : undefined;
  const ex = isObj(raw.examples) ? raw.examples : {};
  const accept = words(ex.accept), reject = words(ex.reject), computeEx = pairs(ex.compute);
  const key = isObj(node.answer) ? node.answer : {};
  const issues = useMemo(() => validateMachineDesignQuestion(node as unknown as Record<string, unknown>), [node]);

  const [alphabetText, setAlphabetText] = useState(() => alphabet.join(", "));
  const [acceptText, setAcceptText] = useState(() => shownWords(accept));
  const [rejectText, setRejectText] = useState(() => shownWords(reject));
  const [computeText, setComputeText] = useState(() => shownPairs(computeEx));
  const alphabetKey = alphabet.join(",");
  const refRules = useMemo<MachineRules>(() => ({ machine, alphabet: alphabetKey ? alphabetKey.split(",") : [], maxStates: MACHINE_DESIGN_LIMITS.states, leftEnd, ...(compute ? { mode: "compute" as const } : {}) }), [machine, alphabetKey, leftEnd, compute]);
  const [draft, setDraft] = useState<LabDraft>(() => draftOfMachineShape(refRules, key.reference, key.layout) ?? initialMachineDraft(refRules));
  const built = isObj(key.reference);

  type Next = { machine?: MachineDesignKind; compute?: boolean; leftEnd?: boolean; alphabet?: string[]; maxStates?: number; maxLength?: number | null; accept?: string[]; reject?: string[]; computeEx?: Pair[]; draft?: LabDraft };
  const write = (next: Next) => {
    if (disabled) return;
    const m = next.machine ?? machine, a = next.alphabet ?? alphabet;
    const isCompute = m === "TM" && (next.compute ?? compute), end = m === "TM" && (next.leftEnd ?? (next.machine === "TM" && machine !== "TM" ? true : leftEnd));
    const len = next.maxLength === null ? undefined : next.maxLength ?? maxLength;
    const acc = next.accept ?? accept, rej = next.reject ?? reject, cex = next.computeEx ?? computeEx;
    let d = next.draft ?? draft;
    if (d.kind !== m || d.alphabet.join(",") !== a.join(",") || d.leftEnd !== end) d = { ...d, kind: m, alphabet: [...a], leftEnd: end };
    if (d !== draft) setDraft(d);
    const writesReference = built || next.draft !== undefined;
    const examples = isCompute ? (cex.length ? { compute: cex.map(p => ({ word: p.word, output: p.answer })) } : null) : (acc.length || rej.length ? { accept: acc, reject: rej } : null);
    onChange({
      machineDesign: {
        v: 1, machine: m, ...(isCompute ? { mode: "compute" } : {}), alphabet: a, maxStates: Math.round(next.maxStates ?? maxStates),
        ...(end ? { leftEnd: true } : {}), ...(len !== undefined ? { maxLength: Math.round(len) } : {}), ...(examples ? { examples } : {}),
      },
      answer: writesReference ? (() => { const layout = layoutOfDraft(d); return { reference: machineOfLabDraft(d), ...(layout ? { layout } : {}) }; })() : {},
    } as never);
  };
  const applyAlphabet = (text: string) => { setAlphabetText(text); write({ alphabet: [...new Set(text.split(/[\s,،]+/).filter(Boolean))] }); };

  return (
    <div className="qt-editor qt-machine-design" data-testid="qt-editor-machineDesign" dir="rtl">
      <fieldset className="ad-fields" disabled={disabled}>
        <legend>قواعد السؤال (يراها الطالب)</legend>
        <div className="ad-inline" role="radiogroup" aria-label="نوع الآلة">
          {(["PDA", "TM"] as const).map(t => <label key={t}><input type="radio" name={ids + "-kind"} checked={machine === t} onChange={() => write({ machine: t })} />{KIND_LABEL[t]}</label>)}
        </div>
        {machine === "TM" && (
          <div className="ad-inline" role="radiogroup" aria-label="ما تفعله الآلة">
            <label><input type="radio" name={ids + "-mode"} checked={!compute} onChange={() => write({ compute: false })} />تميّز لغة (تتوقف في حالة قبول)</label>
            <label><input type="radio" name={ids + "-mode"} checked={compute} onChange={() => write({ compute: true })} />تحسب دالة (الجواب بين علامتي $)</label>
          </div>
        )}
        <label>الأبجدية (رموز مفصولة بفواصل؛ $ لعلامة الجواب)<input type="text" dir="ltr" value={alphabetText} maxLength={40} onChange={e => applyAlphabet(e.target.value)} /></label>
        <label>أقصى عدد لحالات آلة الطالب<input type="number" min={1} max={MACHINE_DESIGN_LIMITS.states} value={maxStates} onChange={e => write({ maxStates: Number(e.target.value) })} /></label>
        {machine === "TM" && <label className="ad-check"><input type="checkbox" checked={leftEnd} onChange={e => write({ leftEnd: e.target.checked })} />بداية الشريط ├ قبل المدخل (كما في الكتاب)</label>}
        <label>أطول كلمة يجرّبها التصحيح (فارغ: 8)<input type="number" min={1} max={MACHINE_DESIGN_LIMITS.maxLength} value={maxLength ?? ""} onChange={e => write({ maxLength: e.target.value === "" ? null : Number(e.target.value) })} /></label>
        {compute
          ? <label>أمثلة: كلمة=جواب (اختيارية؛ ε للفارغ، مثل 111=11111 ε=11)<input type="text" dir="ltr" value={computeText} onChange={e => { setComputeText(e.target.value); write({ computeEx: parsePairs(e.target.value) }); }} /></label>
          : <>
            <label>كلمات أمثلة تُقبل (اختيارية؛ ε للكلمة الفارغة)<input type="text" dir="ltr" value={acceptText} onChange={e => { setAcceptText(e.target.value); write({ accept: parseWords(e.target.value).slice(0, MACHINE_DESIGN_LIMITS.words) }); }} /></label>
            <label>كلمات أمثلة تُرفض (اختيارية)<input type="text" dir="ltr" value={rejectText} onChange={e => { setRejectText(e.target.value); write({ reject: parseWords(e.target.value).slice(0, MACHINE_DESIGN_LIMITS.words) }); }} /></label>
          </>}
        <p className="ad-note">صِف {compute ? "الدالة" : "اللغة"} في نص السؤال. التصحيح يشغّل آلة الطالب والآلة النموذجية على كل {compute ? "المدخلات" : "الكلمات"} حتى الطول المحدد (ليس برهانًا): اتفاقهما العلامة كاملة، وكلمة تختلفان فيها صفر، وآلة تورنغ لا تتوقف إلى مراجعتك.{compute ? " الكلمات التي ترفضها الآلة النموذجية ليست مدخلًا للدالة، فلا تُفحص." : ""}</p>
      </fieldset>
      <fieldset className="ad-fields" disabled={disabled} data-testid="machine-reference">
        <legend>الآلة النموذجية (مفتاح التصحيح — لا تصل إلى الطالب)</legend>
        {!built && <p className="ad-note" role="note">ابنِ الآلة النموذجية هنا: أي تعديل عليها يحفظها مفتاحًا للتصحيح.</p>}
        <div className="learning-autodesign learning-machine-design">
          <MachineBuilder ids={ids} rules={refRules} draft={draft} onDraft={d => write({ draft: d })} examples={{ accept: [], reject: [], compute: [] }} disabled={disabled} />
        </div>
      </fieldset>
      {issues.length > 0 && <div className="ad-issues" role="alert" data-testid="machine-question-issues">
        <strong>يحتاج السؤال إلى استكمال قبل الاعتماد:</strong>
        <ul>{issues.slice(0, 8).map((i, k) => <li key={k} data-code={i.code}>{i.message}</li>)}</ul>
      </div>}
    </div>
  );
}
