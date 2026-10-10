import { useCallback, useEffect, useId, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useOrbitCamera, type OrbitLimits } from "../interactive3d/orbitCamera";
import { MESH_LIBRARY, type MeshLibraryAsset } from "./meshAssetCatalog";
import { loadMeshModelAsset, meshLoadError, type MeshLoadError, type MeshLoadResult, type MeshLoadOptions } from "./meshAssetLoader";
import { DEFAULT_MESH_CAMERA, MESH_MODEL_LIMITS, meshModelMissingParts, validateMeshModelSpec, type MeshModelSpecV1 } from "./meshModelSpec";
import { createMeshRenderer, type MeshMark, type MeshRenderer, type MeshRendererStats, type MeshRenderState } from "./meshRenderer";
import type { MeshDocument } from "./glbAsset";
import "./mesh-model.css";

// Phase 21D-B.1 — the viewer of a realistic mesh model (lazy; student exam, teacher preview and review).
// It REUSES the Phase 21D orbit-camera controller (drag / touch rotation with inertia, pinch and deliberate wheel zoom, arrow / ± / Home
// keys, reset, reduced motion, content-keyed reset, full listener cleanup) on a WebGL2 canvas drawn by the owned renderer. The labelled
// parts list is the accessible, non-spatial alternative: every selection and hide / show action is available there without drag precision
// or colour perception, and it keeps working when WebGL is unavailable (fallback) or the asset cannot be shown (meaningful error).
// The GL context exists only while the viewer is on screen (IntersectionObserver): several models in one exam never exhaust the browser's
// context limit, and the parsed document stays in the loader's cache so returning to a question is instant.
// Camera, hidden parts and hover are PRESENTATION state; only the student's selected part ids are ever reported (onChange).
const LIMITS: OrbitLimits = { pitchMin: -MESH_MODEL_LIMITS.pitchAbs, pitchMax: MESH_MODEL_LIMITS.pitchAbs, zoomMin: MESH_MODEL_LIMITS.zoomMin, zoomMax: MESH_MODEL_LIMITS.zoomMax };
const MARK_LABELS: Readonly<Record<MeshMark, string>> = Object.freeze({ correct: "اختيار صحيح", incorrect: "اختيار غير صحيح", missed: "جزء صحيح لم يُختر" });
const r3 = (n: number) => Math.round(n * 1000) / 1000;
type Phase = "waiting" | "loading" | "ready" | "fallback" | "error" | "lost";

export type MeshModelSelection = { selected: readonly string[]; max: number; disabled?: boolean; onChange: (next: string[]) => void };
export type MeshModel3DViewProps = {
  model: MeshModelSpecV1;
  library?: readonly MeshLibraryAsset[];
  selection?: MeshModelSelection;
  marks?: Readonly<Record<string, MeshMark>>;
  /** test / certification seams (never set by product code) */
  loader?: (model: MeshModelSpecV1, options: MeshLoadOptions) => Promise<MeshLoadResult>;
  createRenderer?: typeof createMeshRenderer;
  onRenderer?: (renderer: MeshRenderer | null) => void;
  /** authoring: the current view whenever it settles (the editor's «use this view as the starting view») */
  onViewChange?: (view: { azimuth: number; elevation: number; zoom: number }) => void;
};

export default function MeshModel3DView({ model, library = MESH_LIBRARY, selection, marks, loader = loadMeshModelAsset, createRenderer = createMeshRenderer, onRenderer, onViewChange }: MeshModel3DViewProps) {
  const uid = useId().replace(/[^A-Za-z0-9_-]/g, "");
  const checked = useMemo(() => validateMeshModelSpec(model, { library }), [model, library]);
  const value = checked.ok ? checked.value : null, entry = checked.ok ? checked.library : null;
  // Three keys, so that editing text (a label, a description, the title) never reloads the asset, recreates the GL context or moves
  // the view: the ASSET (bytes, parsed document, renderer) depends on the asset reference only; the VIEW resets when the asset or the
  // authored camera changes; hidden parts reset when the asset or the labelled part set changes.
  const assetKey = value ? JSON.stringify(value.asset) : "";
  const authored = value?.camera ?? entry?.camera ?? DEFAULT_MESH_CAMERA;               // a library asset brings its reviewed default view
  const viewKey = assetKey + "|" + authored.azimuth + "," + authored.elevation + "," + authored.zoom;
  const partsKey = assetKey + "|" + (value ? value.parts.map(p => p.id).join(",") : "");
  const { camera, interacting, reset, rotateBy, zoomBy, attachTo, onKeyDown, pointerHandlers, consumeSuppressedClick } = useOrbitCamera({
    initial: { yaw: authored.azimuth, pitch: authored.elevation, zoom: authored.zoom },
    resetKey: viewKey, limits: LIMITS, rotate: !!value?.controls.rotate, zoom: !!value?.controls.zoom
  });
  const onViewChangeRef = useRef(onViewChange);
  useEffect(() => { onViewChangeRef.current = onViewChange; });
  useEffect(() => { if (!interacting) onViewChangeRef.current?.({ azimuth: camera.yaw, elevation: camera.pitch, zoom: camera.zoom }); }, [camera, interacting]);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const [hover, setHover] = useState<string | null>(null);
  const [shownKey, setShownKey] = useState(partsKey);
  if (shownKey !== partsKey) { setShownKey(partsKey); setHidden(new Set()); setHover(null); }

  // ── asset: load (shared, verified, cached) once the viewer is near the screen ──────────────────────────────────────────────────────
  const figure = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const el = figure.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(entries => setVisible(entries.some(e => e.isIntersecting)), { rootMargin: "240px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const [doc, setDoc] = useState<{ key: string; document: MeshDocument } | null>(null);
  const [failure, setFailure] = useState<{ key: string; error: MeshLoadError } | null>(null);
  const [progress, setProgress] = useState<{ key: string; loaded: number; total: number | null } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const wanted = !!value && visible;
  const loadKey = assetKey + "#" + attempt;
  const valueRef = useRef(value);
  useEffect(() => { valueRef.current = value; });
  useEffect(() => {
    const v = valueRef.current;
    if (!wanted || !v) return;
    const controller = new AbortController();
    // the labelled parts are checked against the parsed document below (so a label edit never reloads); the load is the asset's alone
    void loader({ ...v, parts: [] }, { signal: controller.signal, onProgress: (loaded, total) => setProgress({ key: loadKey, loaded, total }) }).then(r => {
      if (controller.signal.aborted) return;
      if (r.ok) setDoc({ key: loadKey, document: r.value.document });
      else setFailure({ key: loadKey, error: r.error });
    });
    return () => controller.abort();
  }, [wanted, loader, loadKey]);
  const loaded = doc && doc.key === loadKey ? doc.document : null;
  const missing = useMemo(() => (value && loaded ? meshModelMissingParts(value, loaded.parts.map(p => p.id)) : []), [value, loaded]);
  const document_ = missing.length ? null : loaded;                                            // labelled parts missing → fail closed
  const error = failure && failure.key === loadKey ? failure.error : missing.length ? meshLoadError("MESH_LOAD_PARTS", missing.slice(0, 5).join(", ")) : null;

  // ── renderer: created while visible with a document, disposed when hidden / unmounted (no leaked contexts). Each renderer gets a FRESH
  // canvas (created and removed here, never by React): dispose() releases the context itself (WEBGL_lose_context), and a lost context
  // is never handed to the next renderer of the same viewer (StrictMode remount, scrolling back to a parked question).
  const surface = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const renderer = useRef<MeshRenderer | null>(null);
  const onRendererRef = useRef(onRenderer);
  useEffect(() => { onRendererRef.current = onRenderer; });
  const [gl, setGl] = useState<{ phase: "ready" | "fallback" | "lost"; generation: number } | null>(null);
  const [stats, setStats] = useState<MeshRendererStats | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const el = frameRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(entries => { const w = entries[0]?.contentRect.width ?? 0; if (w > 0) setWidth(Math.max(240, Math.min(1100, Math.round(w)))); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const height = Math.round(Math.max(260, Math.min(620, width * (width < 560 ? 0.95 : 0.66))));
  const selectable = useMemo(() => new Set(value ? value.parts.map(p => p.id) : []), [value]);
  const selected = useMemo(() => new Set(selection ? selection.selected : []), [selection]);
  const markMap = useMemo(() => new Map(Object.entries(marks ?? {}).filter(([k]) => selectable.has(k))), [marks, selectable]);
  const state = useMemo<MeshRenderState>(() => ({ camera, hidden, selected, hover, selectable, marks: markMap }), [camera, hidden, selected, hover, selectable, markMap]);
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; });
  // every frame is drawn at the CURRENT drawing-buffer size: the state frames below and the asynchronous "textures ready" frame (it can
  // come before the first state frame, or after the page moved to another display) both size the buffer first — a frame is never drawn,
  // nor its stats published, at a stale size
  const sizeRef = useRef({ width, height });
  useEffect(() => { sizeRef.current = { width, height }; });
  const fit = (r: MeshRenderer) => {
    const el = canvas.current;
    r.resize(el?.clientWidth || sizeRef.current.width, el?.clientHeight || sizeRef.current.height, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
  };
  useEffect(() => {
    const host = surface.current;
    if (!host || !document_ || !visible) return;
    const el = document.createElement("canvas");
    el.className = "mm3d-canvas";
    el.setAttribute("aria-hidden", "true");
    host.appendChild(el);
    canvas.current = el;
    let generation = 0;
    const r = createRenderer(el, document_, {
      onContextLost: () => setGl({ phase: "lost", generation: ++generation }),
      onContextRestored: () => { setGl({ phase: "ready", generation: ++generation }); },
      onTexturesReady: () => { const cur = renderer.current; if (cur) { fit(cur); cur.render(stateRef.current); setStats(cur.stats()); } }
    });
    renderer.current = r;
    onRendererRef.current?.(r);
    setGl({ phase: r ? "ready" : "fallback", generation: 0 });
    return () => {
      r?.dispose();
      setGl(null);
      if (renderer.current === r) renderer.current = null;
      if (canvas.current === el) canvas.current = null;
      el.remove();
      onRendererRef.current?.(null);
    };
  }, [document_, visible, createRenderer]);
  const glReady = gl?.phase === "ready";                                                       // set only while a live renderer exists
  // one frame per state change (coalesced to the display refresh)
  useEffect(() => {
    const r = renderer.current;
    if (!r || !glReady) return;
    const el = canvas.current;
    r.resize(el?.clientWidth || width, el?.clientHeight || height, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
    const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (cb: FrameRequestCallback) => setTimeout(() => cb(0), 16) as unknown as number;
    const caf = typeof cancelAnimationFrame === "function" ? cancelAnimationFrame : (id: number) => clearTimeout(id);
    const id = raf(() => { r.render(state); setStats(r.stats()); });
    return () => caf(id);
  }, [state, width, height, glReady, gl]);

  const phase: Phase = !value ? "error" : error ? "error" : gl?.phase === "fallback" ? "fallback" : gl?.phase === "lost" ? "lost" : glReady ? "ready" : !visible ? "waiting" : "loading";
  const setSurface = useCallback((el: HTMLDivElement | null) => { surface.current = el; attachTo(el); }, [attachTo]);

  // ── selection (spatial pick or the parts list) ─────────────────────────────────────────────────────────────────────────────────────
  const canSelect = !!selection && !selection.disabled;
  const toggleSelect = (id: string) => {
    if (!selection || selection.disabled || !selectable.has(id)) return;
    const cur = [...selection.selected];
    if (cur.includes(id)) selection.onChange(cur.filter(x => x !== id));
    else if (selection.max === 1) selection.onChange([id]);
    else if (cur.length < selection.max) selection.onChange([...cur, id]);
  };
  const pointAt = (e: { clientX: number; clientY: number }) => {
    const el = canvas.current, r = renderer.current;
    if (!el || !r || !glReady) return null;
    const box = el.getBoundingClientRect();
    return r.pick(e.clientX - box.left, e.clientY - box.top, state);
  };
  const lastHover = useRef(0);
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointerHandlers.onPointerMove(e);
    if (e.pointerType !== "mouse" || interacting || e.buttons) return;
    const now = performance.now();
    if (now - lastHover.current < 90) return;
    lastHover.current = now;
    const id = pointAt(e);
    if (id !== hover) setHover(id);
  };
  const onClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (consumeSuppressedClick()) return;
    const id = pointAt(e);
    if (id && canSelect) toggleSelect(id);
  };
  const toggleHidden = (id: string) => setHidden(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  if (!value) return <p className="mm3d-unavailable" role="alert">تعذّر عرض النموذج ثلاثي الأبعاد؛ يحتاج مراجعة المعلم.</p>;
  const hoverLabel = hover ? value.parts.find(p => p.id === hover)?.label : undefined;
  const pct = progress && progress.key === loadKey && progress.total ? Math.min(100, Math.round((progress.loaded / progress.total) * 100)) : null;
  const label = "نموذج ثلاثي الأبعاد: " + value.title + ". أجزاؤه المسمّاة: " + value.parts.map(p => p.label).join("، ") + ".";
  return (
    <figure ref={figure} className="mm3d" dir="rtl" aria-labelledby={uid + "-title"} data-model-id={value.id} data-state={phase}
      data-selected={[...selected].join(",")} data-hidden={[...hidden].join(",")}>
      <figcaption>
        <strong id={uid + "-title"}>{value.title}</strong>
        <p>{value.description}</p>
      </figcaption>
      <div className="mm3d-controls" role="toolbar" aria-label="التحكم في عرض النموذج">
        {value.controls.rotate && <>
          <button type="button" className="mm3d-icon" title="تدوير لليسار" aria-label="تدوير لليسار" onClick={() => rotateBy(-0.25, 0)}>⟲</button>
          <button type="button" className="mm3d-icon" title="تدوير لليمين" aria-label="تدوير لليمين" onClick={() => rotateBy(0.25, 0)}>⟳</button>
          <button type="button" className="mm3d-icon" title="رفع المنظور" aria-label="رفع المنظور" onClick={() => rotateBy(0, 0.15)}>⤒</button>
          <button type="button" className="mm3d-icon" title="خفض المنظور" aria-label="خفض المنظور" onClick={() => rotateBy(0, -0.15)}>⤓</button>
        </>}
        {value.controls.zoom && <>
          <button type="button" className="mm3d-icon" title="تكبير" aria-label="تكبير" onClick={() => zoomBy(1.15)}>+</button>
          <button type="button" className="mm3d-icon" title="تصغير" aria-label="تصغير" onClick={() => zoomBy(1 / 1.15)}>−</button>
        </>}
        <button type="button" onClick={reset}>إعادة العرض</button>
        {value.controls.hideParts && hidden.size > 0 && <button type="button" onClick={() => setHidden(new Set())}>إظهار كل الأجزاء</button>}
      </div>
      <div className="mm3d-frame" ref={frameRef} dir="ltr">
        <div ref={setSurface} className="mm3d-scene" style={{ height: height + "px" }}
          tabIndex={0} role="img" aria-label={label} aria-describedby={uid + "-help"}
          data-yaw={r3(camera.yaw)} data-pitch={r3(camera.pitch)} data-zoom={r3(camera.zoom)} data-interacting={interacting ? "" : undefined}
          data-draws={stats?.drawCalls ?? 0} data-triangles={stats?.triangles ?? 0} data-gpu-bytes={stats?.gpuBytes ?? 0} data-samples={stats?.samples ?? 0} data-dpr={stats?.dpr ?? 0}
          data-hover={hover ?? ""}
          onPointerDown={pointerHandlers.onPointerDown} onPointerMove={onPointerMove} onPointerUp={pointerHandlers.onPointerUp} onPointerCancel={pointerHandlers.onPointerCancel}
          onPointerLeave={() => setHover(null)} onClick={onClick}
          onKeyDown={e => { if (onKeyDown(e)) e.preventDefault(); }} />
        {phase === "loading" && <div className="mm3d-overlay" role="status">
          <span>جارٍ تحميل النموذج…</span>
          <span className="mm3d-progress" role="progressbar" aria-label="تقدم تحميل النموذج" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined}><span style={{ width: (pct ?? 8) + "%" }} /></span>
        </div>}
        {phase === "lost" && <div className="mm3d-overlay" role="status">توقف العرض مؤقتًا (فقد سياق الرسوميات)؛ تجري الاستعادة تلقائيًا…</div>}
        {phase === "error" && error && <div className="mm3d-overlay mm3d-error" role="alert">
          <span>{error.message}</span>
          {(error.code === "MESH_LOAD_NETWORK" || error.code === "MESH_LOAD_HTTP") && <button type="button" onClick={() => setAttempt(a => a + 1)}>إعادة المحاولة</button>}
        </div>}
        {phase === "fallback" && <div className="mm3d-overlay mm3d-fallback" role="note">العرض ثلاثي الأبعاد غير متاح في هذا المتصفح (WebGL 2). يمكنك استخدام قائمة الأجزاء أدناه.</div>}
        {hoverLabel && phase === "ready" && <div className="mm3d-tip" aria-hidden="true">{hoverLabel}</div>}
      </div>
      <p className="mm3d-help" id={uid + "-help"}>
        {value.controls.rotate ? "اسحب النموذج لتدويره. " : ""}{value.controls.zoom ? "للتكبير: إصبعان على الشاشة اللمسية، أو عجلة الفأرة بعد النقر على النموذج (أو مع Ctrl). " : ""}{canSelect ? "انقر جزءًا لاختياره أو استخدم قائمة الأجزاء. " : ""}بعد التركيز على النموذج: {value.controls.rotate ? "الأسهم للتدوير، " : ""}{value.controls.zoom ? "و+ و− للتكبير والتصغير، " : ""}وHome لإعادة العرض.
      </p>
      {selection && <p className="mm3d-status" role="status" aria-live="polite">{selection.selected.length ? "اخترت " + selection.selected.length + (selection.max > 1 ? " من " + selection.max : "") + ": " + selection.selected.map(id => value.parts.find(p => p.id === id)?.label ?? id).join("، ") : "لم تختر أي جزء بعد."}</p>}
      <ul className="mm3d-parts" aria-label="أجزاء النموذج">
        {value.parts.map(p => {
          const isSel = selected.has(p.id), isHidden = hidden.has(p.id), mark = markMap.get(p.id);
          return (
            <li key={p.id} data-part={p.id} className={[isSel ? "is-selected" : "", isHidden ? "is-hidden" : "", mark ? "is-" + mark : ""].filter(Boolean).join(" ") || undefined}>
              {selection
                ? <label><input type="checkbox" checked={isSel} disabled={!canSelect || (!isSel && selection.max > 1 && selection.selected.length >= selection.max)} onChange={() => toggleSelect(p.id)} aria-label={"اختيار " + p.label} /><span>{p.label}</span></label>
                : <span className="mm3d-part-label">{p.label}</span>}
              {mark && <em className="mm3d-mark">{MARK_LABELS[mark]}</em>}
              {p.description && <small>{p.description}</small>}
              {value.controls.hideParts && <button type="button" className="mm3d-hide" aria-pressed={isHidden} onClick={() => toggleHidden(p.id)}>{isHidden ? "إظهار" : "إخفاء"}<span className="mm3d-sr"> {p.label}</span></button>}
            </li>
          );
        })}
      </ul>
      <details className="mm3d-provenance">
        <summary>مصدر النموذج وترخيصه</summary>
        {entry ? <dl>
          <dt>المصدر</dt><dd><a href={entry.provenance.sourceUrl} target="_blank" rel="noopener noreferrer">{entry.provenance.source}</a></dd>
          <dt>نسبة العمل</dt><dd>{entry.provenance.attribution} (<a href={entry.provenance.sourceLicenseUrl} target="_blank" rel="noopener noreferrer">{entry.provenance.sourceLicense}</a>)</dd>
          <dt>ترخيص هذا الملف</dt><dd><a href={entry.provenance.licenseUrl} target="_blank" rel="noopener noreferrer">{entry.provenance.license}</a></dd>
          <dt>تعديلات ExamBank</dt><dd>{entry.provenance.modifications}</dd>
          <dt>حدود الاستخدام التعليمي</dt><dd>{entry.provenance.educationalLimitations}</dd>
        </dl> : <p>نموذج رفعه المعلم؛ تحقّق الخادم من بنيته وبصمته (SHA-256) قبل حفظه، ولا يُعرض إلا إذا طابقت بصمته النسخة المعتمدة في السؤال.</p>}
      </details>
    </figure>
  );
}
