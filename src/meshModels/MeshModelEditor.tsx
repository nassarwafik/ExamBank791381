import { useEffect, useId, useMemo, useRef, useState } from "react";
import MeshModel3DView from "./MeshModel3DView";
import { MESH_ASSET_LIMITS } from "./glbAsset";
import { MESH_LIBRARY, meshLibraryAsset, type MeshLibraryAsset } from "./meshAssetCatalog";
import type { MeshLoadOptions, MeshLoadResult } from "./meshAssetLoader";
import { useMeshAssetService, type MeshAssetService, type MeshUploadResult } from "./meshAssetService";
import {
  cameraFromView, draftFromLibrary, draftFromUpload, sourcePartsOfLibrary, sourcePartsOfUpload, withPartIncluded, withPartText,
  type MeshSourcePart, type MeshUploadedAsset
} from "./meshModelDraft";
import { DEFAULT_MESH_CAMERA, MESH_MODEL_LIMITS, validateMeshModelSpec, type MeshModelSpecV1 } from "./meshModelSpec";
import type { createMeshRenderer } from "./meshRenderer";
import "./mesh-model.css";

// Phase 21D-B.2 — teacher authoring of a realistic 3D mesh model (lazy; never in the student bundle).
// The teacher picks an asset — a reviewed model of the code-owned library (provenance and licence shown), or a .glb they upload, which
// the SERVER validates and stores content-addressed — then chooses which named parts form the student-facing vocabulary, writes their
// Arabic labels and descriptions, decides what students may do (rotate / zoom / hide parts) and sets the starting view by rotating the
// live preview. Every change is reported as a MeshModelSpecV1 draft; the canonical validator runs live and its reasons are shown, and
// the exam pipeline validates again on save / publish. The preview is EXACTLY the student viewer (same loader, integrity check and
// renderer); while the draft is momentarily invalid it keeps showing the last valid version. Answer keys are not part of the model:
// the question type that embeds this editor owns them.
type Tab = "library" | "uploads";
export type MeshModelEditorProps = {
  value: MeshModelSpecV1 | null;
  onChange: (next: MeshModelSpecV1) => void;
  /** id given to a new model (the embedding question decides it) */
  modelId?: string;
  library?: readonly MeshLibraryAsset[];
  disabled?: boolean;
  /** test / certification seams (product code uses the App-provided service and the real loader / renderer) */
  service?: MeshAssetService;
  loader?: (model: MeshModelSpecV1, options: MeshLoadOptions) => Promise<MeshLoadResult>;
  createRenderer?: typeof createMeshRenderer;
};
const fmtBytes = (n: number) => (n >= 1024 * 1024 ? (n / (1024 * 1024)).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
const fmtCount = (n: number) => n.toLocaleString("en-US");
const fmtAngle = (rad: number) => Math.round((rad * 180) / Math.PI) + "°";

export default function MeshModelEditor({ value, onChange, modelId = "model", library = MESH_LIBRARY, disabled = false, service: injected, loader, createRenderer }: MeshModelEditorProps) {
  const uid = useId().replace(/[^A-Za-z0-9_-]/g, "");
  const contextService = useMeshAssetService();
  const service = injected ?? contextService;
  const [tab, setTab] = useState<Tab>(value?.asset.source === "upload" ? "uploads" : "library");
  const [uploads, setUploads] = useState<MeshUploadedAsset[] | null>(null);
  const [uploadsError, setUploadsError] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<MeshUploadResult | null>(null);
  const [pending, setPending] = useState<{ title: string; draft: MeshModelSpecV1 } | null>(null);
  const [viewNote, setViewNote] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const view = useRef<{ azimuth: number; elevation: number; zoom: number } | null>(null);
  const alive = useRef(true);
  const listed = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const loadUploads = async () => {
    if (!service) return;
    setUploadsError("");
    try { const rows = await service.list(); if (alive.current) setUploads(rows); }
    catch { if (alive.current) { setUploads([]); setUploadsError("تعذّر تحميل نماذجك المرفوعة. أعد المحاولة."); } }
  };
  const uploadsWanted = tab === "uploads" || value?.asset.source === "upload";
  useEffect(() => { if (uploadsWanted && service && !listed.current) { listed.current = true; void loadUploads(); } });   // once, on first need

  // the asset's own parts (the only labels a teacher can author): the library entry, or the server's record of the uploaded file
  const entry = value?.asset.source === "library" ? meshLibraryAsset(library, value.asset.id, value.asset.version) ?? null : null;
  const uploadRecord = value?.asset.source === "upload" ? uploads?.find(u => u.sha256 === value.asset.sha256) ?? null : null;
  const source: MeshSourcePart[] = entry ? sourcePartsOfLibrary(entry) : uploadRecord ? sourcePartsOfUpload(uploadRecord) : value ? value.parts.map(p => ({ ...p })) : [];

  const checked = useMemo(() => (value ? validateMeshModelSpec(value, { library }) : null), [value, library]);
  const [lastValid, setLastValid] = useState<MeshModelSpecV1 | null>(checked?.ok ? checked.value : null);
  const validKey = checked?.ok ? JSON.stringify(checked.value) : "";
  const [shownValid, setShownValid] = useState(validKey);
  if (checked?.ok && validKey !== shownValid) { setShownValid(validKey); setLastValid(checked.value); }
  const preview = checked?.ok ? checked.value : lastValid && value && lastValid.asset.sha256 === value.asset.sha256 ? lastValid : null;

  const emit = (next: MeshModelSpecV1) => { if (!disabled) onChange(next); };
  const choose = (title: string, draft: MeshModelSpecV1) => {
    if (disabled) return;
    if (value && value.asset.sha256 === draft.asset.sha256) return;
    if (value) { setPending({ title, draft }); return; }                                         // replacing labelled work is confirmed
    view.current = null; setViewNote(""); emit(draft);
  };
  const confirmPending = () => { if (pending) { view.current = null; setViewNote(""); emit(pending.draft); setPending(null); } };
  const upload = async (file: File) => {
    if (!service || disabled) return;
    setResult(null);
    if (!file.name.toLowerCase().endsWith(".glb")) { setResult({ status: "error", message: "يُقبل فقط ملف نموذج بصيغة .glb (glTF 2.0 ثنائي)." }); return; }
    setProgress(0);
    let r: MeshUploadResult;
    try { r = await service.upload(file, f => { if (alive.current) setProgress(f); }); }
    catch { r = { status: "error", message: "تعذّر رفع النموذج. تحقق من الاتصال ثم أعد المحاولة." }; }
    if (!alive.current) return;
    setProgress(null); setResult(r);
    if (r.status === "created" || r.status === "exists") {
      const asset = r.asset;
      setUploads(prev => [asset, ...(prev ?? []).filter(u => u.sha256 !== asset.sha256)]);
      choose(asset.name ?? "نموذج مرفوع", draftFromUpload(asset, value?.id ?? modelId));
    }
  };

  const included = new Set(value ? value.parts.map(p => p.id) : []);
  const issues = checked && !checked.ok ? checked.issues : [];
  const camera = value?.camera ?? entry?.camera ?? DEFAULT_MESH_CAMERA;
  const assetDefaultCamera = entry ? entry.camera : DEFAULT_MESH_CAMERA;
  const useCurrentView = () => {
    if (!value || !view.current) { setViewNote("حرّك النموذج في المعاينة أولًا."); return; }
    emit({ ...value, camera: cameraFromView(view.current) });
    setViewNote("اعتُمد العرض الحالي عرضًا ابتدائيًا للطلاب.");
  };

  return (
    <section className="mm3d-editor" dir="rtl" data-testid="mesh-model-editor" aria-labelledby={uid + "-h"}>
      <h4 id={uid + "-h"}>النموذج ثلاثي الأبعاد</h4>
      <div className="mm3d-tabs" role="tablist" aria-label="مصدر النموذج">
        <button type="button" role="tab" id={uid + "-tab-library"} aria-controls={uid + "-panel"} aria-selected={tab === "library"} onClick={() => setTab("library")}>مكتبة النماذج المعتمدة</button>
        {service && <button type="button" role="tab" id={uid + "-tab-uploads"} aria-controls={uid + "-panel"} aria-selected={tab === "uploads"} onClick={() => setTab("uploads")}>نماذجي المرفوعة</button>}
      </div>
      <div id={uid + "-panel"} role="tabpanel" aria-labelledby={uid + "-tab-" + tab} className="mm3d-source">
        {tab === "library" && <ul className="mm3d-lib">
          {library.map(a => {
            const current = value?.asset.source === "library" && value.asset.id === a.id && value.asset.version === a.version;
            return <li key={a.id + "@" + a.version} data-asset={a.id} className={current ? "is-current" : undefined}>
              <strong>{a.title}</strong>
              <span>{a.subject} · {fmtCount(a.parts.length)} جزءًا مسمّى · {fmtBytes(a.byteLength)}</span>
              <span className="mm3d-licence">المصدر: {a.provenance.source} · الترخيص: {a.provenance.license}</span>
              <button type="button" disabled={disabled || current} aria-pressed={current} onClick={() => choose(a.title, draftFromLibrary(a, value?.id ?? modelId))}>{current ? "النموذج الحالي" : "اختيار هذا النموذج"}</button>
            </li>;
          })}
        </ul>}
        {tab === "uploads" && service && <div className="mm3d-uploads">
          <p className="mm3d-note">ارفع ملف .glb (glTF 2.0 ثنائي) لا يتجاوز {Math.floor(MESH_ASSET_LIMITS.maxBytes / (1024 * 1024))} MB، أجزاؤه عُقد مسمّاة، دون روابط خارجية أو امتدادات أو رسوم متحركة. يتحقق الخادم من الملف ويحفظه ببصمته (SHA-256)، ولا يُشغَّل أي محتوى منه.</p>
          <input ref={fileRef} type="file" accept=".glb,model/gltf-binary" className="mm3d-sr" id={uid + "-file"} disabled={disabled || progress !== null}
            onChange={e => { const f = e.target.files && e.target.files[0]; if (f) void upload(f); e.target.value = ""; }} />
          <button type="button" disabled={disabled || progress !== null} onClick={() => fileRef.current?.click()}>رفع نموذج .glb</button>
          {progress !== null && <span className="mm3d-progress" role="progressbar" aria-label="تقدم رفع النموذج" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}><span style={{ width: Math.max(4, Math.round(progress * 100)) + "%" }} /></span>}
          {result?.status === "rejected" && <div className="mm3d-issues" role="alert"><strong>رفض الخادم الملف لأنه لم يجتز فحوص السلامة:</strong><ul>{result.issues.slice(0, 8).map((i, k) => <li key={k}>{i.message}</li>)}</ul></div>}
          {result?.status === "error" && <p className="mm3d-issues" role="alert">{result.message}</p>}
          {(result?.status === "created" || result?.status === "exists") && <p className="mm3d-ok" role="status">{result.status === "exists" ? "هذا الملف محفوظ مسبقًا؛ اختير من نماذجك." : "حُفظ النموذج بعد التحقق منه."}</p>}
          {uploadsError && <p className="mm3d-issues" role="alert">{uploadsError} <button type="button" onClick={() => void loadUploads()}>إعادة المحاولة</button></p>}
          {uploads && uploads.length > 0 && <ul className="mm3d-lib">
            {uploads.map(u => {
              const current = value?.asset.source === "upload" && value.asset.sha256 === u.sha256;
              return <li key={u.sha256} data-asset={u.sha256.slice(0, 12)} className={current ? "is-current" : undefined}>
                <strong>{u.name || "نموذج مرفوع"}</strong>
                <span>{fmtCount(u.parts.length)} جزءًا · {fmtCount(u.triangles)} مثلثًا · {fmtBytes(u.byteLength)}</span>
                <span className="mm3d-licence" dir="ltr">sha256 {u.sha256.slice(0, 12)}…</span>
                <button type="button" disabled={disabled || current} aria-pressed={current} onClick={() => choose(u.name || "نموذج مرفوع", draftFromUpload(u, value?.id ?? modelId))}>{current ? "النموذج الحالي" : "اختيار هذا النموذج"}</button>
              </li>;
            })}
          </ul>}
          {uploads && uploads.length === 0 && !uploadsError && <p className="mm3d-note">لا توجد نماذج مرفوعة بعد.</p>}
        </div>}
      </div>
      {pending && <div className="mm3d-confirm" role="alertdialog" aria-labelledby={uid + "-confirm"}>
        <p id={uid + "-confirm"}>استبدال النموذج بـ «{pending.title}» يحذف تسميات الأجزاء والعرض الابتدائي الحاليين. هل تريد المتابعة؟</p>
        <button type="button" onClick={confirmPending}>استبدال النموذج</button>
        <button type="button" onClick={() => setPending(null)}>إلغاء</button>
      </div>}

      {!value && <p className="mm3d-note">اختر نموذجًا من المكتبة المعتمدة{service ? " أو ارفع ملف .glb" : ""} للبدء.</p>}
      {value && <>
        <fieldset className="mm3d-fields" disabled={disabled}>
          <legend>العنوان والوصف</legend>
          <label>عنوان النموذج<input type="text" value={value.title} maxLength={MESH_MODEL_LIMITS.titleChars} onChange={e => emit({ ...value, title: e.target.value })} /></label>
          <label>وصف أو تعليمات للطالب<textarea value={value.description} maxLength={MESH_MODEL_LIMITS.descriptionChars} rows={2} onChange={e => emit({ ...value, description: e.target.value })} /></label>
        </fieldset>

        <fieldset className="mm3d-fields" disabled={disabled}>
          <legend>الأجزاء والتسميات ({fmtCount(included.size)} من {fmtCount(source.length)})</legend>
          <p className="mm3d-note">الأجزاء المحددة هي وحدها التي يراها الطالب مسمّاة ويستطيع اختيارها؛ تبقى بقية الأجزاء ظاهرة في النموذج دون تسمية.</p>
          <ol className="mm3d-part-rows">
            {source.map(s => {
              const on = included.has(s.id), part = value.parts.find(p => p.id === s.id);
              return <li key={s.id} data-part={s.id} className={on ? "is-on" : undefined}>
                <label className="mm3d-include"><input type="checkbox" aria-label={"تضمين الجزء " + s.id} checked={on} disabled={on && included.size <= 1}
                  onChange={e => emit(withPartIncluded(value, source, s.id, e.target.checked))} /><code dir="ltr">{s.id}</code></label>
                {on && part && <>
                  <label>التسمية<input type="text" aria-label={"تسمية الجزء " + s.id} value={part.label} maxLength={MESH_MODEL_LIMITS.labelChars} onChange={e => emit(withPartText(value, s.id, { label: e.target.value }))} /></label>
                  <label>الوصف (اختياري)<textarea aria-label={"وصف الجزء " + s.id} value={part.description ?? ""} maxLength={MESH_MODEL_LIMITS.partDescriptionChars} rows={2} onChange={e => emit(withPartText(value, s.id, { description: e.target.value }))} /></label>
                  {(part.label !== s.label || (part.description ?? "") !== (s.description ?? "")) && entry && <button type="button" className="mm3d-linkish" onClick={() => emit(withPartText(value, s.id, { label: s.label, description: s.description ?? "" }))}>استعادة التسمية المعتمدة</button>}
                </>}
              </li>;
            })}
          </ol>
        </fieldset>

        <fieldset className="mm3d-fields mm3d-inline" disabled={disabled}>
          <legend>ما يتاح للطالب</legend>
          <label><input type="checkbox" checked={value.controls.rotate} onChange={e => emit({ ...value, controls: { ...value.controls, rotate: e.target.checked } })} />تدوير النموذج</label>
          <label><input type="checkbox" checked={value.controls.zoom} onChange={e => emit({ ...value, controls: { ...value.controls, zoom: e.target.checked } })} />التكبير والتصغير</label>
          <label><input type="checkbox" checked={value.controls.hideParts} onChange={e => emit({ ...value, controls: { ...value.controls, hideParts: e.target.checked } })} />إخفاء الأجزاء وإظهارها</label>
        </fieldset>

        <fieldset className="mm3d-fields" disabled={disabled}>
          <legend>العرض الابتدائي</legend>
          <p className="mm3d-note" data-testid="mesh-editor-camera">الاتجاه {fmtAngle(camera.azimuth)} · الارتفاع {fmtAngle(camera.elevation)} · التكبير ×{camera.zoom.toFixed(2)}</p>
          <div className="mm3d-row">
            <button type="button" onClick={useCurrentView}>اعتماد العرض الحالي في المعاينة</button>
            <button type="button" onClick={() => { emit({ ...value, camera: { ...assetDefaultCamera } }); setViewNote("أُعيد العرض الافتراضي للنموذج."); }}>العرض الافتراضي للنموذج</button>
          </div>
          {viewNote && <p className="mm3d-note" role="status">{viewNote}</p>}
        </fieldset>

        {issues.length > 0 && <div className="mm3d-issues" role="alert" data-testid="mesh-editor-issues">
          <strong>يحتاج النموذج إلى تصحيح قبل الحفظ:</strong>
          <ul>{issues.map((i, k) => <li key={k} data-code={i.code}>{i.message}</li>)}</ul>
        </div>}

        <div className="mm3d-preview" data-testid="mesh-editor-preview">
          <h5>معاينة كما يراها الطالب</h5>
          {preview
            ? <MeshModel3DView model={preview} library={library} loader={loader} createRenderer={createRenderer} onViewChange={v => { view.current = v; }} />
            : <p className="mm3d-note">تظهر المعاينة بعد تصحيح المشكلات أعلاه.</p>}
        </div>
      </>}
    </section>
  );
}
