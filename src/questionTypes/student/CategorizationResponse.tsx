import type { StudentRendererProps } from "../registryTypes";

// Phase 16A — Categorization student response (lazy, Wave 1 = accessible assignment UI, no drag dependency): one labelled
// select per item. The response ({ kind: "fields", values: { itemId: categoryId } }) is independent of presentation, so a
// later drag UI can reuse the same stored answers and grading.
type Cfg = { categories?: { id: string; label: string }[]; items?: { id: string; label: string }[] };
export default function CategorizationResponse({ q, id, answer, onAnswer, disabled, labelPrefix }: StudentRendererProps) {
  const cfg = ((q as { categorization?: Cfg }).categorization || {}) as Cfg;
  const categories = Array.isArray(cfg.categories) ? cfg.categories : [], items = Array.isArray(cfg.items) ? cfg.items : [];
  const values = answer?.kind === "fields" ? answer.values : {};
  const assign = (iid: string, cid: string) => onAnswer({ kind: "fields", values: { ...(answer?.kind === "fields" ? answer.values : {}), [iid]: cid } });
  return <div className="iex-seq iex-categorize">{items.map(it => <label key={it.id} className="iex-categorize-row"><span>{it.label}</span><select className="iex-cell-select" name={id + "-" + it.id} aria-label={labelPrefix + " — " + it.label + " — الفئة"} value={typeof values[it.id] === "string" ? String(values[it.id]) : ""} onChange={e => assign(it.id, e.target.value)} disabled={disabled}><option value="">— اختر الفئة —</option>{categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>)}</div>;
}
