import { useState } from "react";
import type { Machine } from "../learning/activities/automaton";
import { KIND_LABEL, type AutomatonKind, type LabDraft } from "./automataLab";
import { complementOf, concatenation, equivalence, mergeTraps, minimize, needsCompleteDfa, productOf, reversal, toDeterministic, unionByNewStart, type AlgoResult, type Equivalence } from "./automataAlgorithms";

/**
 * AUTO-A5 (docs/enterprise-automata-lab-a4.md §7) — two sections of «مختبر الآلات»:
 *   ٨ «آلاتي»: up to six machines kept in the panel (A, B, …) — to combine two (التقاطع / الاتحاد) or compare them;
 *   ٩ «الخوارزميات خطوة خطوة»: the course's algorithms on the machine being edited (and a kept one): «حوّل إلى حتمي», «التقاطع» /
 *     «الاتحاد», «اجمع حالات المصيدة», «المتمّم», «التصغير», «هل آلتاي متكافئتان؟». The working appears row by row («الخطوة التالية»,
 *     «أظهر كل الخطوات»), then «افتح الناتج في المحرر» (the machine being edited is kept first, so nothing is lost).
 * A result belongs to the machine it was computed from: an edit clears it. Nothing is stored or sent.
 */

export type Shelf = { name: string; draft: LabDraft; machine: Machine }[];
export const SHELF_MAX = 6;
const SHELF_NAMES = ["A", "B", "C", "D", "E", "F"];
type Shown = { stamp: string; title: string; result: AlgoResult; shown: number } | { stamp: string; title: string; eq: Equivalence; other: string };

export default function AutomataLabAlgorithms({ ids, draft, machine, stamp, shelf, setShelf, load, kinds, num }: {
  ids: string; draft: LabDraft; machine: Machine | null; stamp: string; shelf: Shelf; setShelf: (s: Shelf) => void; load: (d: LabDraft) => void;
  /** The machines the teacher offers: a result of another kind is shown, not opened. */
  kinds: readonly AutomatonKind[];
  /** The heading's number in the panel («٨. »). */
  num: (key: string) => string;
}) {
  const [partner, setPartner] = useState(0);
  const [shown, setShown] = useState<Shown | null>(null);
  const [said, setSaid] = useState("");
  const now = shown && shown.stamp === stamp ? shown : null;
  const fa = !!machine && (machine.kind === "DFA" || machine.kind === "NFA");
  const other = shelf[Math.min(partner, shelf.length - 1)];
  const sameAsKept = shelf.find(s => s.machine && JSON.stringify(s.machine) === stamp);

  const keep = (): string | null => {
    if (!machine) return null;
    if (sameAsKept) return sameAsKept.name;
    if (shelf.length >= SHELF_MAX) return null;
    const name = SHELF_NAMES.find(n => !shelf.some(s => s.name === n)) as string;
    setShelf([...shelf, { name, draft, machine }]);
    return name;
  };
  const run = (title: string, result: AlgoResult) => { setShown({ stamp, title, result, shown: 1 }); setSaid(""); };
  const openResult = (d: LabDraft) => {
    const kept = keep();
    load(d);
    setSaid(kept ? "فُتح الناتج في المحرر. الآلة السابقة محفوظة في «آلاتي» باسم " + kept + "." : "فُتح الناتج في المحرر.");
  };

  return (
    <>
      <section className="learning-autodesign-section" aria-labelledby={ids + "-k"}>
        <h3 id={ids + "-k"} className="learning-autodesign-heading">{num("k")}آلاتي</h3>
        <p className="stt-hint">احفظ آلة هنا لتبني التقاطع أو الاتحاد معها، أو لتقارنها بآلة أخرى. تبقى ما دامت الصفحة مفتوحة (حتى {SHELF_MAX} آلات).</p>
        <button type="button" className="stt-btn" disabled={!machine || !!sameAsKept || shelf.length >= SHELF_MAX} onClick={() => { const n = keep(); if (n) setSaid("حُفظت الآلة باسم " + n + "."); }}>
          {sameAsKept ? "الآلة محفوظة باسم " + sameAsKept.name : "احفظ هذه الآلة"}
        </button>
        {shelf.length > 0 && (
          <ul className="alab-shelf">
            {shelf.map(s => (
              <li key={s.name}>
                <span className="learning-autodesign-statename" dir="ltr">{s.name}</span>
                <span className="stt-hint">{KIND_LABEL[s.machine.kind]}، {s.machine.states.length} حالات، <span dir="ltr">{"Σ = {" + s.machine.alphabet.join(", ") + "}"}</span></span>
                <button type="button" className="learning-autodesign-btn is-quiet" onClick={() => { load(s.draft); setSaid("فُتحت الآلة " + s.name + " في المحرر."); }}>افتح</button>
                <button type="button" className="learning-autodesign-btn is-quiet" aria-label={"احذف الآلة " + s.name} onClick={() => setShelf(shelf.filter(x => x !== s))}>حذف</button>
              </li>
            ))}
          </ul>
        )}
        {said && <p className="stt-hint" role="status">{said}</p>}
      </section>

      <section className="learning-autodesign-section" aria-labelledby={ids + "-g"}>
        <h3 id={ids + "-g"} className="learning-autodesign-heading">{num("g")}الخوارزميات خطوة خطوة</h3>
        {!machine ? <p className="stt-hint">تعمل الخوارزميات حين تصبح الآلة جاهزة (انظر «الفحوص»).</p>
          : !fa ? <p className="stt-hint">الخوارزميات للأوتومات المنتهي (حتمي أو غير حتمي).</p> : (
            <>
              <div className="alab-algos" role="group" aria-label="خوارزميات على الآلة الحالية">
                <button type="button" className="stt-btn" disabled={machine.kind !== "NFA"} onClick={() => run("حوّل إلى حتمي", toDeterministic(machine))}>حوّل إلى حتمي</button>
                <button type="button" className="stt-btn" disabled={machine.kind !== "DFA"} onClick={() => run("اجمع حالات المصيدة", mergeTraps(machine))}>اجمع حالات المصيدة</button>
                <button type="button" className="stt-btn" disabled={machine.kind !== "DFA"} onClick={() => run("المتمّم", complementOf(machine))}>المتمّم</button>
                <button type="button" className="stt-btn" disabled={machine.kind !== "DFA"} onClick={() => run("التصغير", minimize(machine))}>التصغير</button>
                <button type="button" className="stt-btn" onClick={() => run("العكس", reversal(machine))}>العكس</button>
              </div>
              {machine.kind === "DFA" && needsCompleteDfa(machine) && <p className="stt-hint">المتمّم والتصغير والتقاطع والاتحاد تحتاج أوتومات كاملًا: أضف حالة مصيدة أولًا (في «الفحوص»).</p>}
              {machine.kind === "NFA" && <p className="stt-hint">اجمع حالات المصيدة والمتمّم والتصغير لأوتومات حتمي: حوّل إلى حتمي أولًا.</p>}
              <div className="stt-row">
                <label className="stt-label" htmlFor={ids + "-with"}>مع الآلة</label>
                <select id={ids + "-with"} className="stt-input alab-short" disabled={!shelf.length} value={Math.min(partner, Math.max(shelf.length - 1, 0))} onChange={e => setPartner(Number(e.target.value))}>
                  {shelf.length ? shelf.map((s, i) => <option key={s.name} value={i}>{s.name}</option>) : <option value={0}>—</option>}
                </select>
                <button type="button" className="stt-btn" disabled={!other} onClick={() => other && run("التقاطع مع " + other.name, productOf(machine, other.machine, "intersection"))}>التقاطع</button>
                <button type="button" className="stt-btn" disabled={!other} onClick={() => other && run("الاتحاد مع " + other.name, productOf(machine, other.machine, "union"))}>الاتحاد</button>
                <button type="button" className="stt-btn" disabled={!other} onClick={() => other && run("الاتحاد بحالة بداية جديدة مع " + other.name, unionByNewStart(machine, other.machine))}>الاتحاد بحالة بداية جديدة</button>
                <button type="button" className="stt-btn" disabled={!other} onClick={() => other && run("التسلسل مع " + other.name, concatenation(machine, other.machine))}>التسلسل</button>
                <button type="button" className="stt-btn" disabled={!other} onClick={() => other && setShown({ stamp, title: "مقارنة مع " + other.name, eq: equivalence(machine, other.machine), other: other.name })}>هل آلتاي متكافئتان؟</button>
              </div>
              <p className="stt-hint">«التقاطع» و«الاتحاد»: أوتومات الجداء لآلتين حتميتين كاملتين. «الاتحاد بحالة بداية جديدة» و«التسلسل» و«العكس»: إنشاءات الكتاب لخصائص الانغلاق، وناتجها غير حتمي.</p>
              {!shelf.length && <p className="stt-hint">للعمليات على آلتين والمقارنة: احفظ آلة في «آلاتي» أولًا.</p>}
            </>
          )}
        {now && ("eq" in now ? <EquivalenceText eq={now.eq} other={now.other} /> : (
          <Working shown={now} next={() => setShown({ ...now, shown: now.shown + 1 })} all={() => setShown({ ...now, shown: Infinity })} open={openResult} kinds={kinds} />
        ))}
      </section>
    </>
  );
}

function EquivalenceText({ eq, other }: { eq: Equivalence; other: string }) {
  const word = (w: string) => <span dir="ltr" className="learning-autodesign-word">{w === "" ? "ε" : w}</span>;
  return (
    <div className="alab-result" role="status">
      {"equal" in eq && eq.equal && <p className="alab-good">✓ الآلتان متكافئتان: تقبلان اللغة نفسها.</p>}
      {"equal" in eq && !eq.equal && <p>✗ ليستا متكافئتين. أقصر كلمة تختلفان فيها: {word(eq.word)} — {eq.firstAccepts ? "تقبلها الآلة الحالية وترفضها " + other : "ترفضها الآلة الحالية وتقبلها " + other}.</p>}
      {"overflow" in eq && <p>الآلتان أكبر من أن تُقارنا هنا.</p>}
      {"error" in eq && <p>{eq.error}</p>}
    </div>
  );
}

function Working({ shown, next, all, open, kinds }: { shown: { title: string; result: AlgoResult; shown: number }; next: () => void; all: () => void; open: (d: LabDraft) => void; kinds: readonly AutomatonKind[] }) {
  const r = shown.result;
  if (!r.ok) return <p className="stt-error alab-result" role="alert">{shown.title}: {r.message}</p>;
  const symbols = r.machine.alphabet;
  const rows = r.rows.slice(0, shown.shown);
  const done = shown.shown >= r.rows.length;
  return (
    <div className="alab-result">
      <h4 className="learning-autodesign-heading">{shown.title}</h4>
      {r.removed && r.removed.length > 0 && <p className="stt-hint">حالات لا نصلها من البداية حُذفت: <span dir="ltr">{r.removed.join("، ")}</span>.</p>}
      {r.rounds && (
        <ol className="alab-list" aria-label="جولات التقسيم">
          {r.rounds.map((groups, i) => (
            <li key={i}>{i === 0 ? "حالات القبول وغيرها" : "الجولة " + i + ": نقسم كل مجموعة حسب المجموعة التي يقود إليها كل رمز"}: <span dir="ltr">{groups.map(g => "{" + g.join(", ") + "}").join("  ")}</span></li>
          ))}
        </ol>
      )}
      <div className="learning-autodesign-tablewrap" tabIndex={0} role="region" aria-label={"خطوات " + shown.title}>
        <table className="learning-autodesign-table">
          <thead><tr><th scope="col">الحالة</th><th scope="col">تمثّل</th><th scope="col">قبول</th>{symbols.map(s => <th key={s} scope="col" dir="ltr">{s}</th>)}</tr></thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.name}>
                <th scope="row" dir="ltr">{row.name}{row.note && <span className="stt-hint"> ({row.note})</span>}</th>
                <td dir="ltr">{row.members.length ? "{" + row.members.join(", ") + "}" : "∅"}</td>
                <td>{row.accept ? "✓" : "—"}</td>
                {symbols.map(s => <td key={s} dir="ltr">{row.moves.find(m => m.symbol === s)?.to ?? ""}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="stt-hint" role="status">{done ? r.summary : "الخطوة " + rows.length + " من " + r.rows.length + "."}{done && r.renamed ? " أسماء الحالات طويلة، فسُمّيت q0، q1 … وبجانب كل حالة اسمها في الخوارزمية." : ""}</p>
      <div className="stt-row">
        {!done && <button type="button" className="stt-btn" onClick={next}>الخطوة التالية</button>}
        {!done && <button type="button" className="stt-btn" onClick={all}>أظهر كل الخطوات</button>}
        <button type="button" className="stt-btn is-primary" disabled={!kinds.includes(r.machine.kind)} onClick={() => open(r.draft)}>افتح الناتج في المحرر</button>
      </div>
      {!kinds.includes(r.machine.kind) && <p className="stt-hint">لا يُفتح الناتج: «{KIND_LABEL[r.machine.kind]}» ليس من الآلات التي أتاحها المعلّم في المختبر.</p>}
    </div>
  );
}
