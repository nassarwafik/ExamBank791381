import { useMemo } from "react";
import { evaluateHotspot } from "../hotspotQuestion";
import { evaluateLabelDiagram } from "../labelDiagramQuestion";
import { visualImageSrc } from "../visualGeometry";
import VisualCanvas, { ShapeSvg } from "./VisualCanvas";
import { at, pct } from "./visualPosition";
import "./visual.css";

// Phase 19D — the TEACHER review of visual answers (AssignmentReview only; never a student surface). It re-evaluates the stored student
// answer against the published key with the SAME shared authority as the grader: hotspot = the image with the private target regions
// (matched ✓ / missed ✗) and the student's points (which target each satisfied, maximum one-to-one matching); labelDiagram = per zone the
// student's label, the correct label and ✓ / ✗. An invalid published contract is an explicit manual-review state. Manual teacher marks
// remain the official override. Student-provided text is rendered as text.
type ViewProps = { answer: unknown; answerKey: unknown; config: unknown; image: unknown };
const fieldsValues = (a: unknown): Record<string, unknown> => (a && typeof a === "object" && (a as { kind?: unknown }).kind === "fields" && (a as { values?: unknown }).values && typeof (a as { values: unknown }).values === "object" ? (a as { values: Record<string, unknown> }).values : {});

export function HotspotAnswerView({ answer, answerKey, config, image }: ViewProps) {
  const e = useMemo(() => evaluateHotspot(config, answerKey, image, answer), [config, answerKey, image, answer]);
  const src = visualImageSrc(image);
  if (!e.ok || !src) return <div className="vq-review" data-testid="hotspot-review"><p className="vq-unavailable" data-testid="hotspot-review-unavailable">لا يمكن تقييم هذا السؤال آليًا (إعداد أو مفتاح أو صورة غير صالحة) — تصحيح يدوي.</p></div>;
  const alt = config && typeof config === "object" && typeof (config as { alt?: unknown }).alt === "string" ? (config as { alt: string }).alt : "صورة السؤال";
  return (
    <div className="vq-review" data-testid="hotspot-review">
      <VisualCanvas src={src} alt={alt} svg={e.targets.map(t => <ShapeSvg key={t.id} shape={t.shape} testId="hotspot-review-target" matched={t.matched} className={t.matched ? "vq-target-hit" : "vq-target-miss"} />)}>
        {e.points.map((p, i) => <span key={i} className="vq-marker" data-testid="hotspot-review-point" data-state={p.target ? "hit" : "miss"} style={at(p)} aria-label={"نقطة الطالب " + (i + 1)}>{i + 1}</span>)}
      </VisualCanvas>
      <p className="vq-status">أصاب الطالب {e.matched} من {e.total} مناطق صحيحة.</p>
      <ul className="vq-list">
        {e.targets.map(t => <li key={t.id}>المنطقة {t.index}: {t.matched ? "✓ أصابها الطالب" : "✗ لم يُصبها"}</li>)}
        {e.points.map((p, i) => <li key={"p" + i}>نقطة الطالب {i + 1} (<bdi dir="ltr">{pct(p.x)}، {pct(p.y)}</bdi>): {p.target ? "داخل منطقة صحيحة" : "خارج المناطق الصحيحة أو مكررة"}</li>)}
      </ul>
    </div>
  );
}
export function HotspotKeySummary({ answerKey }: { answerKey: unknown }) {
  const k = answerKey && typeof answerKey === "object" ? (answerKey as { scoring?: unknown; regions?: unknown }) : {};
  const n = Array.isArray(k.regions) ? k.regions.length : 0;
  return <p className="vq-status">{n} مناطق صحيحة · {k.scoring === "allOrNothing" ? "الكل أو لا شيء" : "نسبية"}</p>;
}

export function LabelDiagramAnswerView({ answer, answerKey, config, image }: ViewProps) {
  const e = useMemo(() => evaluateLabelDiagram(config, answerKey, image, fieldsValues(answer)), [config, answerKey, image, answer]);
  const src = visualImageSrc(image);
  if (!e.ok) return <div className="vq-review" data-testid="label-review"><p className="vq-unavailable" data-testid="label-review-unavailable">لا يمكن تقييم هذا السؤال آليًا (إعداد أو مفتاح أو صورة غير صالحة) — تصحيح يدوي.</p></div>;
  const zones = config && typeof config === "object" && Array.isArray((config as { zones?: unknown }).zones) ? ((config as { zones: { id: string; shape: never }[] }).zones) : [];
  const alt = config && typeof config === "object" && typeof (config as { alt?: unknown }).alt === "string" ? (config as { alt: string }).alt : "صورة السؤال";
  return (
    <div className="vq-review" data-testid="label-review">
      {src && <VisualCanvas src={src} alt={alt} svg={zones.map(z => <ShapeSvg key={z.id} shape={z.shape} className="vq-zone" />)} />}
      <table>
        <thead><tr><th scope="col">المنطقة</th><th scope="col">تسمية الطالب</th><th scope="col">التسمية الصحيحة</th><th scope="col">النتيجة</th></tr></thead>
        <tbody>{e.results.map(r => <tr key={r.zoneId} data-testid="label-review-row"><td>المنطقة {r.index}{r.name ? " — " + r.name : ""}</td><td>{r.given || "—"}</td><td>{r.expected}</td><td>{r.ok ? "✓" : "✗"}</td></tr>)}</tbody>
      </table>
      <p className="vq-status">{e.correct} من {e.total} مناطق صحيحة.</p>
    </div>
  );
}
export function LabelDiagramKeySummary({ answerKey }: { answerKey: unknown }) {
  const k = answerKey && typeof answerKey === "object" ? (answerKey as { scoring?: unknown; correctLabelByZone?: unknown }) : {};
  const n = k.correctLabelByZone && typeof k.correctLabelByZone === "object" ? Object.keys(k.correctLabelByZone).length : 0;
  return <p className="vq-status">{n} مناطق بتسميات صحيحة · {k.scoring === "allOrNothing" ? "الكل أو لا شيء" : "نسبية"}</p>;
}
