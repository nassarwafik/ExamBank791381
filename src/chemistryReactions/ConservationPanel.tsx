import { chemElement } from "../chemistry/elements";
import { describeChargeRow, describeConservationRow, type ConservationTable } from "../chemistry/reactions";

// Phase 21D-D.2 — the atom-conservation table (presentation; the counts come from the exact engine function the grader uses). One row per
// element: the count on each side, the difference and the status, plus the net-charge row for ionic equations; a polite live summary
// announces the status as coefficients change. A row whose terms are not all set yet shows "pending", never "conserved" (0 = 0 of unset
// terms is not conservation). Shown to a student only when the teacher enables it (it reveals whether the equation balances).
const signed = (q: number) => (q > 0 ? "+" + q : q < 0 ? "−" + Math.abs(q) : "0");
export default function ConservationPanel({ table, caption, live = true }: { table: ConservationTable; caption?: string; live?: boolean }) {
  const off = table.rows.filter(r => !r.balanced);
  const summary = !table.complete ? "أكمل كل المعاملات لمعرفة إن كانت المعادلة موزونة."
    : table.balanced ? "المعادلة موزونة: كل عنصر محفوظ" + (table.charge ? " والشحنة محفوظة." : ".")
      : "المعادلة غير موزونة: " + [...off.map(r => r.element), ...(table.charge && !table.charge.balanced ? ["الشحنة"] : [])].join("، ") + " غير محفوظ.";
  return (
    <div className="rxn-conservation" data-testid="rxn-conservation" data-balanced={table.balanced} data-complete={table.complete}>
      <div className="rxn-table-scroll">
        <table className="rxn-table">
          <caption>{caption ?? "حفظ الذرات: العدد في المتفاعلات والنواتج"}</caption>
          <thead><tr><th scope="col">العنصر</th><th scope="col">في المتفاعلات</th><th scope="col">في النواتج</th><th scope="col">الفرق</th><th scope="col">الحالة</th></tr></thead>
          <tbody>
            {table.rows.map(r => (
              <tr key={r.element} className={!r.complete ? "is-pending" : r.balanced ? "is-ok" : "is-off"} data-element={r.element} title={describeConservationRow(r, chemElement(r.element)?.nameAr ?? "")}>
                <th scope="row"><span className="rxn-ltr">{r.element}</span> <small>{chemElement(r.element)?.nameAr}</small></th>
                <td className="rxn-num">{r.reactants}</td><td className="rxn-num">{r.products}</td>
                <td className="rxn-num">{r.delta === 0 ? "0" : signed(r.delta)}</td>
                <td>{!r.complete ? <span className="rxn-pending">… أكمل معاملاته</span> : r.balanced ? <span className="rxn-ok">✓ محفوظ</span> : <span className="rxn-off">✗ غير محفوظ</span>}</td>
              </tr>
            ))}
            {table.charge && (
              <tr className={!table.charge.complete ? "is-pending" : table.charge.balanced ? "is-ok" : "is-off"} data-element="charge" title={describeChargeRow(table.charge)}>
                <th scope="row">الشحنة الكلية</th>
                <td className="rxn-num">{signed(table.charge.reactants)}</td><td className="rxn-num">{signed(table.charge.products)}</td>
                <td className="rxn-num">{signed(table.charge.delta)}</td>
                <td>{!table.charge.complete ? <span className="rxn-pending">… أكمل المعاملات</span> : table.charge.balanced ? <span className="rxn-ok">✓ محفوظة</span> : <span className="rxn-off">✗ غير محفوظة</span>}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className={"rxn-status" + (table.balanced ? " is-ok" : table.complete ? " is-off" : "")} role={live ? "status" : undefined} aria-live={live ? "polite" : undefined} data-testid="rxn-status">{summary}</p>
    </div>
  );
}
