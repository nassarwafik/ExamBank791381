import type { LabeledIdentity } from "../../examTypes";
import { genId } from "../../examBuilderState";
import type { AuthoringEditorProps } from "../registryTypes";

// Phase 16A — Categorization authoring (lazy). Categories and items carry STABLE ids; the key maps itemId → categoryId.
type Key = Record<string, string>;
const keyOf = (answer: unknown): Key => { const a = (answer && typeof answer === "object" ? (answer as { correctCategoryByItem?: unknown }).correctCategoryByItem : undefined); const out: Key = {}; if (a && typeof a === "object") for (const [k, v] of Object.entries(a as Record<string, unknown>)) if (typeof v === "string") out[k] = v; return out; };
const move = <T,>(list: T[], i: number, d: number) => { const j = i + d; if (j < 0 || j >= list.length) return list; const next = list.slice(); [next[i], next[j]] = [next[j], next[i]]; return next; };

export default function CategorizationEditor({ node, onChange, disabled }: AuthoringEditorProps) {
  const categories: LabeledIdentity[] = node.categorization?.categories ?? [], items: LabeledIdentity[] = node.categorization?.items ?? [];
  const key = keyOf(node.answer);
  const commit = (c: LabeledIdentity[], it: LabeledIdentity[], k: Key) => {
    const catIds = new Set(c.map(x => x.id)), itemIds = new Set(it.map(x => x.id));
    const clean: Key = {}; for (const [iid, cid] of Object.entries(k)) if (itemIds.has(iid) && catIds.has(cid)) clean[iid] = cid;
    onChange({ categorization: { categories: c, items: it }, answer: { correctCategoryByItem: clean } });
  };
  return (
    <div className="qt-editor qt-categorization" data-testid="qt-editor-categorization">
      <div className="qt-two-col">
        <fieldset className="qt-fieldset"><legend>الفئات</legend>
          {categories.map((c, ci) => <div className="sb-field-row" key={c.id}>
            <input className="sb-input" aria-label={"الفئة " + (ci + 1)} value={c.label} placeholder={"الفئة " + (ci + 1)} onChange={e => commit(categories.map((x, k) => (k === ci ? { ...x, label: e.target.value } : x)), items, key)} disabled={disabled} />
            <button type="button" className="sb-icon-btn" aria-label="أعلى" title="أعلى" onClick={() => commit(move(categories, ci, -1), items, key)} disabled={disabled || ci === 0}>↑</button>
            <button type="button" className="sb-icon-btn" aria-label="أسفل" title="أسفل" onClick={() => commit(move(categories, ci, 1), items, key)} disabled={disabled || ci === categories.length - 1}>↓</button>
            {categories.length > 2 && <button type="button" className="sb-icon-btn sb-danger" aria-label="حذف الفئة" title="حذف الفئة" onClick={() => commit(categories.filter((_, k) => k !== ci), items, key)} disabled={disabled}>×</button>}
          </div>)}
          <button type="button" className="sb-mini-btn" onClick={() => commit([...categories, { id: genId("cat"), label: "" }], items, key)} disabled={disabled}>+ إضافة فئة</button>
        </fieldset>
        <fieldset className="qt-fieldset"><legend>العناصر والفئة الصحيحة</legend>
          {items.map((it, ii) => <div className="sb-field-row" key={it.id}>
            <input className="sb-input" aria-label={"العنصر " + (ii + 1)} value={it.label} placeholder={"العنصر " + (ii + 1)} onChange={e => commit(categories, items.map((x, k) => (k === ii ? { ...x, label: e.target.value } : x)), key)} disabled={disabled} />
            <select className="sb-input sb-input-sm" aria-label={"فئة العنصر " + (ii + 1)} value={key[it.id] ?? ""} onChange={e => commit(categories, items, { ...key, [it.id]: e.target.value })} disabled={disabled}>
              <option value="">— الفئة الصحيحة —</option>
              {categories.map((c, ci) => <option key={c.id} value={c.id}>{c.label || "الفئة " + (ci + 1)}</option>)}
            </select>
            <button type="button" className="sb-icon-btn" aria-label="أعلى" title="أعلى" onClick={() => commit(categories, move(items, ii, -1), key)} disabled={disabled || ii === 0}>↑</button>
            <button type="button" className="sb-icon-btn" aria-label="أسفل" title="أسفل" onClick={() => commit(categories, move(items, ii, 1), key)} disabled={disabled || ii === items.length - 1}>↓</button>
            {items.length > 1 && <button type="button" className="sb-icon-btn sb-danger" aria-label="حذف العنصر" title="حذف العنصر" onClick={() => commit(categories, items.filter((_, k) => k !== ii), key)} disabled={disabled}>×</button>}
          </div>)}
          <button type="button" className="sb-mini-btn" onClick={() => commit(categories, [...items, { id: genId("item"), label: "" }], key)} disabled={disabled}>+ إضافة عنصر</button>
        </fieldset>
      </div>
      {items.some(i => !key[i.id]) && <p className="sb-hint sb-warn-text">بعض العناصر بلا فئة صحيحة محددة.</p>}
    </div>
  );
}
