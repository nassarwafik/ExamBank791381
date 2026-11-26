import { pdaLabel, tmLabel, type Machine, type PdaMachine } from "../learning/activities/automaton";

// AUTO-A15a — the machine of a machineTrace@1 question as a table, in the book's notation (the student's page and the teacher's editor):
// a finite automaton as δ (a row per state, a column per symbol); a push-down automaton or a Turing machine as its arrows (from, the label
// «ادفع a,⏊/S» / «a/A,R», to) and the list of its states. «→» marks the start, «*» an accepting state; each state is its own left-to-right
// run (<bdi dir="ltr">) so the marks stay with it on a right-to-left page (measured in A14). It never runs the machine: the run is the answer.
const Mark = ({ m, q }: { m: Machine; q: string }) => <bdi dir="ltr">{(q === m.start ? "→ " : "") + q + (m.accept.includes(q) ? " *" : "")}</bdi>;
const KIND: Record<Machine["kind"], string> = { DFA: "أوتومات منتهٍ حتمي", NFA: "أوتومات منتهٍ غير حتمي", PDA: "أوتومات مكدّس", TM: "آلة تورنغ" };

export default function MachineTraceTable({ m, testId }: { m: Machine; testId?: string }) {
  const legend = "«→» حالة البداية، «*» حالة قبول";
  if (m.kind === "DFA" || m.kind === "NFA") {
    const symbols = [...m.alphabet, ...(m.transitions.some(t => t.symbol === "ε") ? ["ε"] : [])];
    const cell = (q: string, s: string) => { const to = m.transitions.filter(t => t.from === q && t.symbol === s).map(t => t.to); return to.length ? to.join("، ") : (m.kind === "NFA" ? "∅" : "—"); };
    return (
      <div className="mt-table-wrap" data-testid={testId}>
        <table className="mt-table">
          <caption>{KIND[m.kind]} — جدول الانتقالات δ؛ {legend}</caption>
          <thead><tr><th scope="col">الحالة</th>{symbols.map(s => <th scope="col" key={s} dir="ltr">{s}</th>)}</tr></thead>
          <tbody>{m.states.map(q => <tr key={q}><th scope="row"><Mark m={m} q={q} /></th>{symbols.map(s => <td key={s} dir="ltr">{cell(q, s)}</td>)}</tr>)}</tbody>
        </table>
      </div>
    );
  }
  const extra = m.kind === "TM" ? (m.leftEnd !== undefined ? "؛ الكلمة مكتوبة بعد " + m.leftEnd + " والرأس على أول رموزها" : "؛ الرأس على أول رموز الكلمة") + "، " + m.blank + " الخانة الفارغة" : "؛ " + (m as PdaMachine).bottom + " قاع المكدّس";
  return (
    <div className="mt-table-wrap" data-testid={testId}>
      <table className="mt-table">
        <caption>{KIND[m.kind]} — الانتقالات؛ {legend}{extra}</caption>
        <thead><tr><th scope="col">من</th><th scope="col">الانتقال</th><th scope="col">إلى</th></tr></thead>
        <tbody>{m.transitions.map((t, i) => (
          <tr key={i}><td><Mark m={m} q={t.from} /></td><td dir="auto">{m.kind === "PDA" ? pdaLabel(t as never) : tmLabel(t as never)}</td><td><Mark m={m} q={t.to} /></td></tr>
        ))}</tbody>
      </table>
      <p className="mt-states">الحالات: {m.states.map((q, k) => <span key={q}>{k ? "، " : ""}<Mark m={m} q={q} /></span>)}</p>
    </div>
  );
}
