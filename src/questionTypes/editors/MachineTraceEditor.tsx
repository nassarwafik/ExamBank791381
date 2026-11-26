import { useId, useMemo, useState } from "react";
import type { AuthoringEditorProps } from "../registryTypes";
import { validateMachineTraceQuestion, validateMachineTraceConfig, rowOfConfig, MACHINE_TRACE_LIMITS, type MachineTraceKind, type TraceRow } from "../../machineTraceQuestion";
import { parseTraceNotation, formatTraceNotation, type TraceNotation } from "../../automata/machineTraceNotation";
import MachineTraceTable from "../../automata/MachineTraceTable";
import "../../automata/machineTrace.css";

// AUTO-A15a — machineTrace@1 authoring (lazy). The question is the machine and the word, both PUBLIC: the teacher writes the machine in the
// book's notation, one transition per line (automata/machineTraceNotation.ts), and the word; every change is validated live by the same
// contract the server finalizes and grades with (the book's reader; a run that ends within the row limit). The teacher sees the machine as
// the student will (its table) and the true run the server will grade against — computed here from the same contract, stored nowhere: the
// key stays empty. It wears the automatonDesign@1 editor's styles (`qt-automaton-design`).
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const KIND_LABEL: Readonly<Record<MachineTraceKind, string>> = Object.freeze({ DFA: "أوتومات منتهٍ حتمي", NFA: "أوتومات منتهٍ غير حتمي", PDA: "أوتومات مكدّس", TM: "آلة تورنغ" });
const EXAMPLE: Readonly<Record<MachineTraceKind, string>> = Object.freeze({ DFA: "q0 a q1\nq0 b q0", NFA: "q0 a,b q0\nq0 b q1", PDA: "q0 → q1 : ادفع a,⏊/A\nq1 → q1 : اسحب b,A/A", TM: "q0 → q1 : a/A,R\nq1 → q1 : b/b,R" });
const rowText = (r: TraceRow) => (r.states ? "{" + r.states.join(", ") + "}" : [r.state, r.stack, r.tape].filter(x => x !== undefined).join("  "));

export default function MachineTraceEditor({ node, onChange, disabled }: AuthoringEditorProps) {
  const ids = "mte" + useId().replace(/:/g, "");
  const raw = isObj((node as { machineTrace?: unknown }).machineTrace) ? (node as { machineTrace: Record<string, unknown> }).machineTrace : {};
  const [notation, setNotation] = useState<TraceNotation>(() => formatTraceNotation(isObj(raw.machine) ? raw.machine : undefined));
  const [word, setWord] = useState<string>(() => (typeof raw.word === "string" ? raw.word : ""));
  const [badLines, setBadLines] = useState<number[]>([]);
  const issues = useMemo(() => validateMachineTraceQuestion(node as unknown as Record<string, unknown>), [node]);
  const checked = useMemo(() => validateMachineTraceConfig((node as { machineTrace?: unknown }).machineTrace), [node]);

  const write = (n: TraceNotation, w: string) => {
    if (disabled) return;
    setNotation(n); setWord(w);
    const parsed = parseTraceNotation(n);
    setBadLines(parsed.badLines);
    onChange({ machineTrace: { v: 1, machine: parsed.machine, word: w }, answer: {} } as never);
  };
  const set = (patch: Partial<TraceNotation>) => write({ ...notation, ...patch }, word);

  return (
    <div className="qt-editor qt-automaton-design qt-machine-trace" data-testid="qt-editor-machineTrace" dir="rtl">
      <fieldset className="ad-fields" disabled={disabled}>
        <legend>الآلة والكلمة (يراهما الطالب)</legend>
        <div className="ad-inline" role="radiogroup" aria-label="نوع الآلة">
          {(["DFA", "NFA", "PDA", "TM"] as const).map(k => <label key={k}><input type="radio" name={ids + "-q-kind"} checked={notation.kind === k} onChange={() => set({ kind: k })} />{KIND_LABEL[k]}</label>)}
        </div>
        <label>أبجدية الكلمة (رموز مفصولة بفواصل)<input type="text" dir="ltr" value={notation.alphabet} maxLength={40} onChange={e => set({ alphabet: e.target.value })} /></label>
        <label>حالة البداية<input type="text" dir="ltr" value={notation.start} maxLength={MACHINE_TRACE_LIMITS.stateChars} onChange={e => set({ start: e.target.value })} /></label>
        <label>حالات القبول (مفصولة بفواصل)<input type="text" dir="ltr" value={notation.accept} maxLength={80} onChange={e => set({ accept: e.target.value })} /></label>
        {notation.kind === "TM" && <label className="ad-check"><input type="checkbox" checked={notation.leftEnd} onChange={e => set({ leftEnd: e.target.checked })} />بداية الشريط ├ قبل الكلمة (كما في الكتاب)</label>}
        <label>الانتقالات، سطر لكل انتقال بترميز الكتاب
          <textarea dir="ltr" rows={6} value={notation.transitions} placeholder={EXAMPLE[notation.kind]} onChange={e => set({ transitions: e.target.value })} />
        </label>
        <p className="ad-note">
          {notation.kind === "PDA" ? "مثال: «q0 → q1 : ادفع a,⏊/S» أو «اسحب b,A/A» أو «بلا تغيير b,S/»؛ ⏊ قاع المكدّس." : notation.kind === "TM" ? "مثال: «q0 → q1 : a/A,R» (R يمين، L يسار، S بلا حركة)؛ ∆ الخانة الفارغة." : "مثال: «q0 a q1»، ولعدة رموز «q0 a,b q1»" + (notation.kind === "NFA" ? "، وε لسهم بلا قراءة." : ".")}
        </p>
        {badLines.length > 0 && <p className="ad-note" role="alert" data-testid="machine-trace-bad-lines">أسطر لا تُقرأ انتقالًا: {badLines.join("، ")}.</p>}
        <label>الكلمة التي يتتبّعها الطالب (حتى {MACHINE_TRACE_LIMITS.wordChars} رمزًا؛ فارغة للكلمة ε)<input type="text" dir="ltr" value={word} maxLength={MACHINE_TRACE_LIMITS.wordChars} onChange={e => write(notation, e.target.value.replace(/\s+/g, ""))} /></label>
        <p className="ad-note">إن سمحتَ بأداة «مختبر الآلات» في هذا الامتحان يستطيع الطالب تشغيل الآلة فيها.</p>
      </fieldset>
      {checked.ok && (
        <fieldset className="ad-fields" data-testid="machine-trace-preview">
          <legend>كما يراها الطالب، والتشغيل الصحيح (يحسبه الخادم ولا يراه الطالب)</legend>
          <MachineTraceTable m={checked.machine} />
          <ol className="mt-run" start={0} data-testid="machine-trace-true-run">
            {checked.run.rows.map((c, k) => <li key={k}><bdi dir="ltr">{rowText(rowOfConfig(checked.machine, c))}</bdi></li>)}
          </ol>
          <p className="ad-note">النتيجة: {checked.run.verdict === "accept" ? "الكلمة مقبولة" : "الكلمة مرفوضة"} — {checked.run.rows.length} سطرًا والنتيجة، أي {checked.run.rows.length + 1} أجزاء للعلامة.</p>
        </fieldset>
      )}
      {issues.length > 0 && <div className="ad-issues" role="alert" data-testid="machine-trace-issues">
        <strong>يحتاج السؤال إلى استكمال قبل الاعتماد:</strong>
        <ul>{issues.slice(0, 8).map((i, k) => <li key={k} data-code={i.code}>{i.message}</li>)}</ul>
      </div>}
    </div>
  );
}

