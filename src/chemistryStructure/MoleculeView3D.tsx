import { useId, useMemo, useState, type ReactElement } from "react";
import { useOrbitCamera, type OrbitLimits } from "../interactive3d/orbitCamera";
import { chemElement } from "../chemistry/elements";
import { angleAt, distance, type Molecule } from "../chemistry/molecules";
import { atomColor, atomInk, projectMolecule } from "./chemView";

// Phase 21D-D.1 — the 3D molecule viewer (lazy, presentation only). It REUSES the shared orbit-camera controller of ExamBank's owned 3D
// viewers (drag / inertia / wheel / pinch / keyboard / Home reset / reduced motion — src/interactive3d/orbitCamera.ts) and draws a
// ball-and-stick model in SVG: an orthographic sphere is exactly a circle, so atoms are shaded, depth-sorted circles and bonds depth-sorted
// segments (double / triple bonds as parallel lines). No WebGL context is created: nothing here can be lost to a GPU reset or to memory
// pressure. Rotation, zoom, labels, lone pairs and the measuring probe are never answers; the only answer is an explicit selection, emitted
// through `selection.onToggle` (pointer on the model, or the keyboard-reachable structure list below it).
export type MoleculeSelection = { target: "atoms" | "bonds"; selected: readonly string[]; max: number; disabled?: boolean; label: string; onToggle: (id: string) => void };
const W = 360, H = 280;
const LIMITS: OrbitLimits = { pitchMin: -1.45, pitchMax: 1.45, zoomMin: 0.55, zoomMax: 2.4 };
const ORDER_TEXT = ["", "أحادية", "ثنائية", "ثلاثية"];
const r1 = (n: number) => String(Math.round(n * 10) / 10);

export default function MoleculeView3D({ molecule: m, selection, measure, lonePairsAllowed, showFormula }: { molecule: Molecule; selection?: MoleculeSelection; measure: boolean; lonePairsAllowed: boolean; showFormula: boolean }) {
  const uid = useId().replace(/[^A-Za-z0-9_-]/g, "");
  const { camera, reset, rotateBy, zoomBy, consumeSuppressedClick, attachTo, onKeyDown, pointerHandlers, interacting } = useOrbitCamera({
    initial: { yaw: 0.55, pitch: 0.35, zoom: 1 }, resetKey: m.id, limits: LIMITS, rotate: true, zoom: true
  });
  const [labels, setLabels] = useState(true);
  const [pairs, setPairs] = useState(false);
  const [mode, setMode] = useState<"select" | "measure">(selection ? "select" : "measure");
  const [picked, setPicked] = useState<string[]>([]);
  const proj = useMemo(() => projectMolecule(m, camera, W, H, lonePairsAllowed && pairs), [m, camera, lonePairsAllowed, pairs]);
  const selected = new Set(selection?.selected ?? []);
  const canSelect = !!selection && !selection.disabled && (mode === "select" || !measure);
  const full = !!selection && selection.selected.length >= selection.max;
  const name = (id: string) => { const a = m.atoms.find(x => x.id === id); return a ? (chemElement(a.element)?.nameAr ?? a.element) + " " + a.id : id; };
  const bondName = (id: string) => { const b = m.bonds.find(x => x.id === id)!; return "رابطة " + b.a + "–" + b.b + " (" + ORDER_TEXT[b.order] + ")"; };
  const toggle = (id: string) => { if (!selection || !canSelect) return; if (!selected.has(id) && full && selection.max > 1) return; selection.onToggle(id); };
  const pick = (id: string) => setPicked(p => (p.length >= 3 || p.includes(id) ? [id] : [...p, id]));
  const clickAtom = (id: string) => { if (consumeSuppressedClick()) return; if (measure && mode === "measure") pick(id); else if (selection?.target === "atoms") toggle(id); };
  const clickBond = (id: string) => { if (consumeSuppressedClick()) return; if (selection?.target === "bonds" && (!measure || mode === "select")) toggle(id); };
  const at = (id: string) => m.atoms.find(a => a.id === id)!.position;
  const probe = picked.length === 2 ? "المسافة بين " + picked[0] + " و" + picked[1] + " = " + r1(distance(at(picked[0]), at(picked[1])) * 100) + " pm"
    : picked.length === 3 ? "الزاوية " + picked[0] + "–" + picked[1] + "–" + picked[2] + " = " + r1(angleAt(at(picked[0]), at(picked[1]), at(picked[2]))) + "°"
      : picked.length === 1 ? "اختر ذرة ثانية لقياس المسافة، ثم ثالثة لقياس الزاوية عند الذرة الوسطى." : "";
  type Item = { kind: "atom" | "bond" | "pair"; depth: number; key: string; node: ReactElement };
  const items: Item[] = [];
  for (const b of proj.bonds) {
    const on = selected.has(b.id), gap = 4.2, offsets = b.order === 1 ? [0] : b.order === 2 ? [-gap / 2, gap / 2] : [-gap, 0, gap];
    items.push({ kind: "bond", depth: b.depth, key: b.id, node: (
      <g key={b.id} className={"chem-bond" + (on ? " is-selected" : "")} data-chem-bond={b.id} data-order={b.order}>
        {offsets.map((o, i) => <line key={i} x1={b.x1 + b.nx * o} y1={b.y1 + b.ny * o} x2={b.x2 + b.nx * o} y2={b.y2 + b.ny * o} />)}
        {selection?.target === "bonds" && <line className="chem-bond-hit" x1={b.x1} y1={b.y1} x2={b.x2} y2={b.y2} onClick={() => clickBond(b.id)} aria-label={bondName(b.id)} />}
      </g>) });
  }
  for (const a of proj.atoms) {
    const on = selected.has(a.id), probed = picked.includes(a.id);
    items.push({ kind: "atom", depth: a.depth, key: a.id, node: (
      <g key={a.id} className={"chem-atom" + (on ? " is-selected" : "") + (probed ? " is-probed" : "")} data-chem-atom={a.id} onClick={() => clickAtom(a.id)} aria-label={name(a.id)}>
        <circle cx={a.x} cy={a.y} r={a.r} fill={"url(#" + uid + "-g-" + a.element + ")"} />
        <text x={a.x} y={a.y} dy="0.35em" fill={atomInk(a.element)} style={{ fontSize: Math.max(9, Math.min(16, a.r * 0.9)) }}>{a.element}</text>
        {labels && <text className="chem-atom-id" x={a.x + a.r * 0.75} y={a.y - a.r * 0.75}>{a.id}</text>}
      </g>) });
  }
  for (const [i, p] of proj.pairs.entries()) items.push({ kind: "pair", depth: p.depth, key: "lp" + i, node: (
    <g key={"lp" + i} className="chem-lone-pair" aria-hidden="true"><circle cx={p.x + p.dx * 3} cy={p.y + p.dy * 3} r={2.2} /><circle cx={p.x - p.dx * 3} cy={p.y - p.dy * 3} r={2.2} /></g>) });
  items.sort((a, b) => a.depth - b.depth || (a.kind === b.kind ? 0 : a.kind === "bond" ? -1 : 1));
  const elements = [...new Set(m.atoms.map(a => a.element))];
  return (
    <figure className="chem-mol" data-testid="chem-molecule" data-molecule={m.id}>
      <div className="chem-toolbar" role="group" aria-label="أدوات عرض الجزيء">
        <button type="button" className="chem-icon" aria-label="تدوير لليسار" title="تدوير لليسار" onClick={() => rotateBy(-0.2, 0)}>⟲</button>
        <button type="button" className="chem-icon" aria-label="تدوير لليمين" title="تدوير لليمين" onClick={() => rotateBy(0.2, 0)}>⟳</button>
        <button type="button" className="chem-icon" aria-label="رفع المنظور" title="رفع المنظور" onClick={() => rotateBy(0, 0.15)}>⤒</button>
        <button type="button" className="chem-icon" aria-label="خفض المنظور" title="خفض المنظور" onClick={() => rotateBy(0, -0.15)}>⤓</button>
        <button type="button" className="chem-icon" aria-label="تكبير" title="تكبير" onClick={() => zoomBy(1.12)}>+</button>
        <button type="button" className="chem-icon" aria-label="تصغير" title="تصغير" onClick={() => zoomBy(1 / 1.12)}>−</button>
        <button type="button" data-testid="chem-mol-reset" onClick={reset}>إعادة العرض</button>
        <button type="button" aria-pressed={labels} onClick={() => setLabels(v => !v)}>تسميات الذرات</button>
        {lonePairsAllowed && <button type="button" aria-pressed={pairs} data-testid="chem-mol-pairs" onClick={() => setPairs(v => !v)}>الأزواج غير الرابطة</button>}
        {measure && selection && <span className="chem-modes" role="group" aria-label="وضع النقر">
          <button type="button" aria-pressed={mode === "select"} onClick={() => setMode("select")}>اختيار</button>
          <button type="button" aria-pressed={mode === "measure"} data-testid="chem-mol-measure" onClick={() => { setMode("measure"); setPicked([]); }}>قياس</button>
        </span>}
      </div>
      <p id={uid + "-help"} className="chem-help">اسحب لتدوير الجزيء في كل الاتجاهات، وكبّر بعجلة الفأرة أو بإصبعين. بعد التركيز على النموذج: الأسهم للتدوير، و+ و− للتكبير، وHome لإعادة العرض. أحجام الذرات ليست بمقياس حقيقي؛ الأطوال والزوايا من بيانات تجريبية.</p>
      <svg ref={attachTo} className="chem-mol-scene" viewBox={"0 0 " + W + " " + H} role="img" tabIndex={0} aria-describedby={uid + "-help"}
        aria-label={"نموذج الكرة والعصا ثلاثي الأبعاد للجزيء" + (showFormula ? ": " + m.nameAr : "")} data-yaw={Math.round(camera.yaw * 1000) / 1000} data-zoom={Math.round(camera.zoom * 1000) / 1000} data-interacting={interacting || undefined}
        onKeyDown={e => { if (onKeyDown(e)) e.preventDefault(); }} {...pointerHandlers}>
        <defs>
          {elements.map(el => (
            <radialGradient key={el} id={uid + "-g-" + el} cx="35%" cy="32%" r="70%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" /><stop offset="38%" stopColor={atomColor(el)} /><stop offset="100%" stopColor={atomColor(el)} stopOpacity="0.85" />
            </radialGradient>
          ))}
        </defs>
        <rect className="chem-mol-bg" width={W} height={H} />
        {items.map(i => i.node)}
      </svg>
      {measure && <p className="chem-probe" role="status" data-testid="chem-probe">{mode === "measure" || !selection ? (probe || "أداة القياس: انقر ذرتين لقياس المسافة أو ثلاث ذرات لقياس الزاوية (للاستكشاف فقط؛ احفظ إجابتك في المهام).") : ""}</p>}
      <details className="chem-structure" open={!!selection} data-testid="chem-structure">
        <summary>{selection ? selection.label + " — أو اختر من القائمة" : "وصف نصي لبنية الجزيء"}</summary>
        <ul aria-label="الذرات">
          {m.atoms.map(a => <li key={a.id}>{selection?.target === "atoms"
            ? <button type="button" aria-pressed={selected.has(a.id)} disabled={selection.disabled || (!selected.has(a.id) && full && selection.max > 1)} data-chem-pick={a.id} onClick={() => toggle(a.id)}>{name(a.id)}</button>
            : <span>{name(a.id)}</span>}</li>)}
        </ul>
        <ul aria-label="الروابط">
          {m.bonds.map(b => <li key={b.id}>{selection?.target === "bonds"
            ? <button type="button" aria-pressed={selected.has(b.id)} disabled={selection.disabled || (!selected.has(b.id) && full && selection.max > 1)} data-chem-pick={b.id} onClick={() => toggle(b.id)}>{bondName(b.id)}</button>
            : <span>{bondName(b.id)}</span>}</li>)}
        </ul>
      </details>
    </figure>
  );
}
