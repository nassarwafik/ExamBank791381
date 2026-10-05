import { useMemo, useState } from "react";
import type { AuthoringEditorProps } from "../registryTypes";
import type { Answer } from "../../answerState";
import type { Question } from "../../studentQuestionTypes";
import { defaultHotspotConfig, validateHotspotQuestion } from "../../hotspotQuestion";
import { visualImageSrc } from "../../visualGeometry";
import RegionEditor, { type EditorRegion } from "../../visual/RegionEditor";
import HotspotView from "../../visual/HotspotView";
import "../../visual/visual.css";

// Phase 19D — hotspot@1 authoring (lazy). The teacher attaches the image through the EXISTING «صورة السؤال» media editor (upload / AI /
// bank — no second asset system), describes it for students who cannot see it, chooses one or several selections and the scoring
// policy, and draws the target regions with the shared region editor (rectangle / circle / polygon, move, resize, numeric fields,
// delete). In multiple mode the number of selections always equals the number of targets. A student preview renders the real student
// view (targets are never drawn there). Canonical validation is shown inline; there is no raw JSON anywhere.
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const nextId = (regions: EditorRegion[], prefix: string) => { let n = 0; for (const r of regions) { const m = /^\D+(\d+)$/.exec(String(r.id)); if (m) n = Math.max(n, Number(m[1])); } return prefix + (Math.max(n, regions.length) + 1); };

export default function HotspotEditor({ node, onChange, disabled }: AuthoringEditorProps) {
  const raw = (node as { hotspot?: unknown }).hotspot;
  const cfg = isObj(raw) ? raw : (defaultHotspotConfig() as unknown as Record<string, unknown>);
  const mode = cfg.mode === "multiple" ? "multiple" : "single";
  const alt = typeof cfg.alt === "string" ? cfg.alt : "";
  const key = isObj(node.answer) ? (node.answer as Record<string, unknown>) : {};
  const scoring = key.scoring === "proportional" ? "proportional" : "allOrNothing";
  const regions = useMemo<EditorRegion[]>(() => (Array.isArray(key.regions) ? (key.regions as unknown[]).filter(isObj).map(r => ({ id: String(r.id ?? ""), shape: r.shape as EditorRegion["shape"] })) : []), [key.regions]);
  const src = visualImageSrc((node as { image?: unknown }).image);
  const [preview, setPreview] = useState(false);
  const [previewAnswer, setPreviewAnswer] = useState<Answer | undefined>(undefined);
  const issues = useMemo(() => validateHotspotQuestion(node as unknown as Record<string, unknown>), [node]);
  const write = (next: { mode?: "single" | "multiple"; alt?: string; scoring?: string; regions?: EditorRegion[] }) => {
    const m = next.mode ?? mode, rs = next.regions ?? regions;
    onChange({ hotspot: { v: 1, mode: m, selections: m === "multiple" ? rs.length : 1, alt: next.alt ?? alt }, answer: { scoring: next.scoring ?? scoring, regions: rs } } as never);
  };
  return (
    <div className="qt-editor qt-editor-hotspot vq-editor" data-testid="qt-editor-hotspot">
      <fieldset>
        <legend>الصورة ووصفها</legend>
        {!src && <p className="vq-note" data-testid="visual-needs-image">أضف صورة لهذا السؤال من قسم «صورة السؤال» (رفع، أو من البنك، أو بالذكاء الاصطناعي) وأبقِها ظاهرة، ثم ارسم عليها المناطق الصحيحة.</p>}
        <label>وصف الصورة للطلاب (يُقرأ لمن لا يرى الصورة)
          <textarea aria-label="وصف الصورة للطلاب" value={alt} disabled={disabled} onChange={e => write({ alt: e.target.value })} placeholder="مثال: مخطط شبكة فيه موجّه في الأعلى ومبدّل في الوسط وحاسوبان." />
        </label>
      </fieldset>
      <fieldset>
        <legend>طريقة الإجابة والتصحيح</legend>
        <div className="vq-fields">
          <label>طريقة التحديد
            <select aria-label="طريقة التحديد" value={mode} disabled={disabled} onChange={e => write({ mode: e.target.value === "multiple" ? "multiple" : "single" })}>
              <option value="single">نقطة واحدة</option><option value="multiple">عدة نقاط (نقطة لكل منطقة)</option>
            </select>
          </label>
          <label>طريقة الاحتساب
            <select aria-label="طريقة الاحتساب" value={scoring} disabled={disabled} onChange={e => write({ scoring: e.target.value })}>
              <option value="proportional">نسبية (جزء من العلامة لكل منطقة)</option><option value="allOrNothing">الكل أو لا شيء</option>
            </select>
          </label>
        </div>
        <p className="vq-note">{mode === "multiple" ? "عدد النقاط المطلوبة من الطالب = عدد المناطق الصحيحة (" + regions.length + "). كل نقطة تُحتسب لمنطقة واحدة فقط." : "يحدّد الطالب نقطة واحدة؛ ارسم منطقة صحيحة واحدة."}</p>
      </fieldset>
      {src && (
        <fieldset>
          <legend>المناطق الصحيحة (لا يراها الطالب)</legend>
          <RegionEditor src={src} alt={alt || "صورة السؤال"} regions={regions} disabled={disabled} canAdd={mode === "multiple" || regions.length === 0}
            addHint="وضع «نقطة واحدة» يقبل منطقة صحيحة واحدة؛ احذفها أو اختر «عدة نقاط» لإضافة غيرها." nextId={() => nextId(regions, "t")} onChange={rs => write({ regions: rs })} />
        </fieldset>
      )}
      {issues.length > 0 && <ul className="vq-issues" data-testid="visual-issues">{issues.map((i, n) => <li key={n}>{i.message}</li>)}</ul>}
      {src && <div className="vq-actions"><button type="button" aria-pressed={preview} onClick={() => setPreview(p => !p)}>معاينة الطالب</button></div>}
      {src && preview && (
        <div className="vq-preview" data-testid="visual-student-preview">
          <p className="vq-note">معاينة المعلم: هكذا يرى الطالب السؤال (لا تُعرض المناطق الصحيحة ولا تُحفظ النقاط هنا).</p>
          <HotspotView q={node as unknown as Question} id="hotspot-preview" answer={previewAnswer} onAnswer={setPreviewAnswer} labelPrefix="معاينة الطالب" />
        </div>
      )}
    </div>
  );
}
