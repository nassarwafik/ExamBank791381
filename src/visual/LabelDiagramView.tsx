import { useId, useMemo, useRef, useState } from "react";
import type { StudentRendererProps } from "../questionTypes/registryTypes";
import { projectLabelDiagramConfigForStudent } from "../labelDiagramQuestion";
import { shapeAnchor, visualImageSrc } from "../visualGeometry";
import VisualCanvas, { ShapeSvg } from "./VisualCanvas";
import { at } from "./visualPosition";

// Phase 19D — the labelDiagram@1 student view (student exam AND the teacher's in-editor student preview). It reads ONLY the strict public
// projection (zones, labels, reuse policy) and the canonical image — never the correct mapping. Three equivalent ways to place a label:
//   • tap fallback (phones / keyboard): select a label in the bank, then activate a zone (zones and labels are real buttons);
//   • select fallback (screen readers / keyboard): one labelled combobox per zone in the mapping list;
//   • drag and drop (desktop).
// Assignments can be changed or removed before submission; with reuse disabled a label placed on another zone MOVES there. The Answer is
// the existing `fields` Answer: { kind: "fields", values: { zoneId: labelId } }.
export default function LabelDiagramView({ q, answer, onAnswer, disabled, labelPrefix }: StudentRendererProps) {
  const cfg = useMemo(() => projectLabelDiagramConfigForStudent((q as { labelDiagram?: unknown }).labelDiagram), [q]);
  const src = useMemo(() => visualImageSrc((q as { image?: unknown }).image), [q]);
  const values = useMemo<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    if (answer?.kind === "fields") for (const [k, v] of Object.entries(answer.values)) if (typeof v === "string" && v) out[k] = v;
    return out;
  }, [answer]);
  const [selected, setSelected] = useState<string | null>(null);
  const dragged = useRef<string | null>(null);
  const hintId = useId();
  if (!cfg || !src) return <p className="vq-unavailable" role="note" data-testid="visual-unavailable">تعذّر عرض صورة هذا السؤال؛ أبلغ معلّمك.</p>;
  const text = new Map(cfg.labels.map(l => [l.id, l.text]));
  const used = new Set(Object.values(values));
  const emit = (next: Record<string, string>) => { if (!disabled) onAnswer({ kind: "fields", values: next }); };
  const assign = (zoneId: string, labelId: string) => {
    if (disabled) return;
    const next: Record<string, string> = {};
    for (const [z, l] of Object.entries(values)) if (z !== zoneId && (cfg.allowReuse || l !== labelId)) next[z] = l;
    if (labelId) next[zoneId] = labelId;
    emit(next);
  };
  const zoneName = (i: number) => "المنطقة " + (i + 1) + (cfg.zones[i].name ? " — " + cfg.zones[i].name : "");
  const onZone = (zoneId: string) => { if (disabled || !selected) return; assign(zoneId, selected); setSelected(null); };
  return (
    <div className="vq label-diagram-response" data-testid="label-diagram-response">
      <p className="vq-note" id={hintId}>اختر تسمية من البنك ثم اضغط على المنطقة المناسبة، أو اسحبها إليها، أو استخدم القوائم تحت الصورة.</p>
      <VisualCanvas src={src} alt={cfg.alt} describedBy={hintId}
        svg={cfg.zones.map(z => <ShapeSvg key={z.id} shape={z.shape} className="vq-zone" />)}>
        {cfg.zones.map((z, i) => {
          const l = values[z.id];
          return (
            <button type="button" key={z.id} className="vq-zone-btn" data-testid="label-zone" data-filled={l ? "true" : "false"} style={at(shapeAnchor(z.shape))} disabled={disabled}
              aria-label={zoneName(i) + ": " + (l ? text.get(l) ?? "" : "فارغة")} aria-describedby={hintId}
              onClick={() => onZone(z.id)} onDragOver={e => { if (!disabled) e.preventDefault(); }} onDrop={e => { e.preventDefault(); const id = dragged.current; dragged.current = null; if (id) assign(z.id, id); }}>
              <span className="vq-zone-num" aria-hidden="true">{i + 1}</span>{l ? text.get(l) : ""}
            </button>
          );
        })}
      </VisualCanvas>
      <div className="vq-bank" data-testid="label-bank" role="group" aria-label={labelPrefix + " — بنك التسميات"}>
        {cfg.labels.map(l => (
          <button type="button" key={l.id} className="vq-chip" aria-pressed={selected === l.id} data-used={used.has(l.id) ? "true" : "false"} draggable={!disabled} disabled={disabled}
            onClick={() => setSelected(s => (s === l.id ? null : l.id))} onDragStart={e => { dragged.current = l.id; try { e.dataTransfer?.setData("text/plain", l.id); } catch { /* best effort */ } }}>
            {l.text}{used.has(l.id) ? " ✓" : ""}
          </button>
        ))}
      </div>
      <ul className="vq-list" data-testid="label-mapping" aria-label="تسمياتك على المناطق">
        {cfg.zones.map((z, i) => (
          <li key={z.id}>
            <label>{zoneName(i)}{" "}
              <select aria-label={"تسمية المنطقة " + (i + 1)} value={values[z.id] ?? ""} disabled={disabled} onChange={e => assign(z.id, e.target.value)}>
                <option value="">— بلا تسمية —</option>
                {cfg.labels.map(l => <option key={l.id} value={l.id}>{l.text}</option>)}
              </select>
            </label>
            {values[z.id] && <button type="button" disabled={disabled} onClick={() => assign(z.id, "")}>إزالة التسمية من المنطقة {i + 1}</button>}
          </li>
        ))}
      </ul>
    </div>
  );
}
