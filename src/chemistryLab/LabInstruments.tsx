import { useId } from "react";
import type { Indicator } from "../chemistry/lab/acidBase";
import { isolateQuantities } from "./labView";

// Phase 21D-D.3 — lightweight SVG instruments of the virtual chemistry laboratory (UI only). Every shape is built here from NUMBERS the
// workspace derived from the canonical config and the replayed state; colours are ILLUSTRATIVE pictures, never measurements. The drawings
// are LTR islands with a text alternative; the numbers that matter are always also given as text next to them.
const clamp01 = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);
const useClipId = (p: string) => p + useId().replace(/[^A-Za-z0-9_-]/g, "");

/** A volumetric flask filled to `fill` (1 = the graduation mark), with an illustrative liquid colour. */
export function VolumetricFlask({ volume, fill, colour, label }: { volume: number | null; fill: number; colour: string | null; label: string }) {
  const f = clamp01(fill), liquidTop = 150 - f * 108, id = useClipId("clabf"); // the bulb holds most of the volume; the mark sits on the neck at y = 42
  return (
    <svg className="clab-svg clab-flask" viewBox="0 0 120 170" role="img" aria-label={label}>
      <defs><clipPath id={id}><path d="M50 10 H70 V60 Q104 78 104 118 Q104 160 60 160 Q16 160 16 118 Q16 78 50 60 Z" /></clipPath></defs>
      <g clipPath={"url(#" + id + ")"}>
        {f > 0 && <rect className="clab-liquid" x="0" y={liquidTop} width="120" height={170 - liquidTop} style={{ fill: colour ?? "#d8ecfb" }} />}
      </g>
      <path className="clab-glass" d="M50 10 H70 V60 Q104 78 104 118 Q104 160 60 160 Q16 160 16 118 Q16 78 50 60 Z" />
      <line className="clab-mark" x1="46" x2="74" y1="42" y2="42" />
      <text className="clab-svg-text" x="60" y="128" textAnchor="middle">{volume === null ? "—" : volume + " mL"}</text>
    </svg>
  );
}
/** An electronic balance with its display (the mass the student placed, to 0.01 g). */
export function Balance({ mass }: { mass: string | null }) {
  return (
    <svg className="clab-svg clab-balance" viewBox="0 0 160 90" role="img" aria-label={"الميزان: " + (mass ?? "0.00") + " g"}>
      <rect className="clab-body" x="10" y="40" width="140" height="42" rx="6" />
      <rect className="clab-pan" x="40" y="26" width="80" height="8" rx="3" />
      <rect className="clab-pan" x="76" y="34" width="8" height="8" />
      {mass !== null && <path className="clab-powder" d="M58 26 Q80 8 102 26 Z" />}
      <rect className="clab-display" x="44" y="52" width="72" height="20" rx="3" />
      <text className="clab-display-text" x="110" y="67" textAnchor="end">{mass ?? "0.00"} g</text>
    </svg>
  );
}
/** A 50 mL burette read from the top (0.00 at the top): the liquid column falls as titrant is delivered. */
export function Burette({ added, capacity }: { added: number; capacity: number }) {
  const top = 12, bottom = 212, y = (v: number) => top + ((bottom - top) * v) / capacity, a = Math.max(0, Math.min(capacity, added));
  const ticks = Array.from({ length: capacity + 1 }, (_, i) => i);
  return (
    <svg className="clab-svg clab-burette" viewBox="0 0 70 250" role="img" aria-label={"السحاحة: القراءة " + a.toFixed(2) + " mL"}>
      <rect className="clab-liquid clab-titrant" x="26" y={y(a)} width="14" height={Math.max(0, bottom - y(a))} />
      <rect className="clab-glass" x="26" y={top} width="14" height={bottom - top} rx="2" />
      {ticks.map(v => <line key={v} className="clab-tick" x1={40} x2={v % 5 === 0 ? 50 : 45} y1={y(v)} y2={y(v)} />)}
      {ticks.filter(v => v % 10 === 0).map(v => <text key={"t" + v} className="clab-svg-small" x="52" y={y(v) + 3}>{v}</text>)}
      <path className="clab-glass" d="M28 212 L33 232 L38 212" />
      <rect className="clab-tap" x="20" y="218" width="26" height="5" rx="2" />
    </svg>
  );
}
/** A conical (Erlenmeyer) flask or a beaker with an illustrative liquid colour. */
export function Beaker({ colour, fill = 0.55, conical = false, label, caption }: { colour: string; fill?: number; conical?: boolean; label: string; caption?: string }) {
  const f = clamp01(fill), outline = conical ? "M38 8 H62 V40 L92 112 Q94 120 86 120 H14 Q6 120 8 112 L38 40 Z" : "M14 10 V112 Q14 120 22 120 H78 Q86 120 86 112 V10";
  const clip = conical ? outline : "M14 10 V112 Q14 120 22 120 H78 Q86 120 86 112 V10 Z", top = 120 - f * 92;
  const id = useClipId("clabb");
  return (
    <svg className="clab-svg clab-beaker" viewBox="0 0 100 136" role="img" aria-label={label}>
      <defs><clipPath id={id}><path d={clip} /></clipPath></defs>
      <g clipPath={"url(#" + id + ")"}><rect className="clab-liquid" x="0" y={top} width="100" height={136 - top} style={{ fill: colour }} /></g>
      <path className="clab-glass" d={outline} />
      {caption && <text className="clab-svg-small" x="50" y="133" textAnchor="middle">{caption}</text>}
    </svg>
  );
}
/** The pH scale 0–14 with indicator transition ranges and the measured solutions (labels as text titles). */
export function PhScale({ indicators, marks }: { indicators: readonly Indicator[]; marks: readonly { id: string; label: string; pH: number }[] }) {
  const W = 340, x = (p: number) => 12 + ((W - 24) * Math.max(0, Math.min(14, p))) / 14, grad = useClipId("clabg");
  const stops = ["#c62828", "#ef6c00", "#f9a825", "#7cb342", "#2e7d32", "#00838f", "#1565c0", "#4527a0"];
  return (
    <svg className="clab-svg clab-scale" viewBox={"0 0 " + W + " " + (46 + indicators.length * 16)} role="img" aria-label="مقياس pH من 0 إلى 14 مع مدى تغيّر الكواشف">
      <defs><linearGradient id={grad} x1="0" x2="1">{stops.map((c, i) => <stop key={c} offset={i / (stops.length - 1)} stopColor={c} />)}</linearGradient></defs>
      <rect x="12" y="8" width={W - 24} height="12" rx="3" fill={"url(#" + grad + ")"} />
      {Array.from({ length: 15 }, (_, p) => <text key={p} className="clab-svg-small" x={x(p)} y="32" textAnchor="middle">{p}</text>)}
      {marks.map(m => <g key={m.id} transform={"translate(" + x(m.pH).toFixed(1) + " 14)"}><title>{isolateQuantities(m.label) + ": pH " + m.pH.toFixed(2)}</title><path className="clab-ph-mark" d="M0 -8 L5 -14 H-5 Z" /><text className="clab-svg-small clab-ph-mark-text" y="-16" textAnchor="middle">{m.id}</text></g>)}
      {indicators.map((ind, i) => (
        <g key={ind.id} transform={"translate(0 " + (40 + i * 16) + ")"}>
          <title>{ind.nameAr + ": " + ind.low + "–" + ind.high}</title>
          <rect x={x(0)} y="0" width={x(ind.low) - x(0)} height="8" style={{ fill: ind.acidColour }} className="clab-range" />
          <rect x={x(ind.low)} y="0" width={x(ind.high) - x(ind.low)} height="8" className="clab-range is-transition" />
          <rect x={x(ind.high)} y="0" width={x(14) - x(ind.high)} height="8" style={{ fill: ind.baseColour }} className="clab-range" />
        </g>
      ))}
    </svg>
  );
}
