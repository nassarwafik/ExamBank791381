import "./console.css";
import { diffSets } from "./diffSets";

/**
 * Tadris+ P4-A — DiffView: what a change ADDS and REMOVES, before it is saved (blueprint §8: «عرض الفروقات قبل الحفظ»). Two
 * labelled lists in words («ستُضاف» / «ستُزال»), never colour alone; nothing changed is said in words too. Pure: it compares two
 * sets of ids and shows their labels in the order given.
 */

export default function DiffView({ label, before, after, labelOf = id => id, addedTitle = "ستُضاف", removedTitle = "ستُزال", emptyText = "لا تغيير." }: {
  label: string; before: readonly string[]; after: readonly string[]; labelOf?: (id: string) => string; addedTitle?: string; removedTitle?: string; emptyText?: string;
}) {
  const { added, removed } = diffSets(before, after);
  return (
    <section className="eb-diff" aria-label={label}>
      {added.length === 0 && removed.length === 0 && <p className="eb-diff-none">{emptyText}</p>}
      {added.length > 0 && (
        <div className="eb-diff-group eb-diff-added">
          <h4>{addedTitle} ({added.length})</h4>
          <ul aria-label={addedTitle}>{added.map(id => <li key={id}>{labelOf(id)}</li>)}</ul>
        </div>
      )}
      {removed.length > 0 && (
        <div className="eb-diff-group eb-diff-removed">
          <h4>{removedTitle} ({removed.length})</h4>
          <ul aria-label={removedTitle}>{removed.map(id => <li key={id}>{labelOf(id)}</li>)}</ul>
        </div>
      )}
    </section>
  );
}
