import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { validateSimulationReference, type SimulationQuestionConfig } from "../smartsimManifest";
import { normalizeSimulationState, type JsonValue } from "../smartsimState";
import { SMARTSIM_DEFAULT_HEIGHT_PX, SMARTSIM_READY_TIMEOUT_MS, SMARTSIM_STATE_DEBOUNCE_MS, clampResizeHeight, hostMessage, newInstanceId, parseSimulatorMessage } from "./smartsimBridge";
import { runtimeEntryUrl } from "./runtimeUrl";
import "./smartsim.css";

// Phase 16B-A — the ONE sandbox host used by students (StudentQuestionCard → SimulationResponse), by the teacher preview
// (ExamPreview renders the same card) and by the editor's «معاينة المحاكاة» (mode="preview" adds a debug inspector OUTSIDE the
// frame). Isolation model (documented in docs/universal-simulation-runtime-16b-a.md):
//   • <iframe sandbox="allow-scripts"> ONLY — no allow-same-origin (opaque origin: no parent DOM, cookies, localStorage or
//     token), no popups / top navigation / forms / modals / downloads / pointer lock / presentation / storage access;
//   • src is ALWAYS the same-origin content-addressed runtime route built from the VALIDATED exact reference (never a URL
//     from exam JSON, never srcdoc, never an external origin); the served documents carry their own strict CSP;
//   • messages are accepted only from this iframe's window, for this instanceId, protocol 1, allowed type, bounded payload;
//   • the simulator receives ONLY protocol / instance / scenario / publicConfig / savedState / disabled — never student
//     identity, other answers, exam data or credentials; whatever it reports never grades anything.
export type SimulationHostErrorCode = "PACKAGE_REFERENCE_INVALID" | "READY_TIMEOUT" | "STATE_TOO_LARGE" | "SIMULATOR_ERROR";
export type SimulationHostProps = {
  reference: SimulationQuestionConfig | undefined;
  savedState: unknown;
  onStateChange: (state: JsonValue | null) => void;
  disabled?: boolean;
  mode?: "student" | "preview";
  /** Telemetry seam: only package identity + error code, never state or student data. */
  onError?: (info: { packageId: string; packageVersion: number; errorCode: SimulationHostErrorCode }) => void;
  readyTimeoutMs?: number;
  debounceMs?: number;
  label?: string;
};
const MESSAGES: Record<SimulationHostErrorCode, string> = {
  PACKAGE_REFERENCE_INVALID: "تعذّر تحميل المحاكاة: مرجع حزمة المحاكاة في هذا السؤال غير صالح. أبلغ معلّمك.",
  READY_TIMEOUT: "تعذّر تحميل المحاكاة في الوقت المتوقع. تحقق من الاتصال ثم أعد المحاولة.",
  STATE_TOO_LARGE: "أرسلت المحاكاة حالة أكبر من الحد المسموح، فتم الاحتفاظ بآخر حالة صالحة.",
  SIMULATOR_ERROR: "حدث خطأ داخل المحاكاة. يمكنك إعادة المحاولة؛ آخر حالة محفوظة لا تزال لديك."
};

export default function SimulationSandboxHost({ reference, savedState, onStateChange, disabled = false, mode = "student", onError, readyTimeoutMs = SMARTSIM_READY_TIMEOUT_MS, debounceMs = SMARTSIM_STATE_DEBOUNCE_MS, label }: SimulationHostProps) {
  const issues = useMemo(() => validateSimulationReference(reference), [reference]);
  const src = useMemo(() => { if (issues.length || !reference) return null; try { return runtimeEntryUrl(reference); } catch { return null; } }, [issues, reference]);
  const [instanceId, setInstanceId] = useState(newInstanceId);
  const [readyFor, setReadyFor] = useState<string | null>(null);
  const ready = readyFor === instanceId;                                                     // a new instance is not ready until ITS handshake
  const [error, setError] = useState<{ code: SimulationHostErrorCode; detail?: string } | null>(null);
  const [height, setHeight] = useState(SMARTSIM_DEFAULT_HEIGHT_PX);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const readyRef = useRef(false);
  const savedStateRef = useRef(savedState);
  const disabledRef = useRef(disabled);
  const onStateChangeRef = useRef(onStateChange);
  const onErrorRef = useRef(onError);
  const lastEmittedRef = useRef<string>(JSON.stringify(savedState ?? null));
  const debounceRef = useRef<number | null>(null);
  const referenceRef = useRef(reference);
  // latest-value refs are refreshed in an effect (never during render) so message handlers see current props
  useEffect(() => { savedStateRef.current = savedState; disabledRef.current = disabled; onStateChangeRef.current = onStateChange; onErrorRef.current = onError; referenceRef.current = reference; });

  const post = useCallback((type: "SMARTSIM_INIT" | "SMARTSIM_RESTORE_STATE" | "SMARTSIM_SET_DISABLED" | "SMARTSIM_RESET", payload: unknown) => {
    const win = frameRef.current?.contentWindow;
    if (!win) return;
    // the sandboxed frame has an OPAQUE origin, so "*" is the only deliverable target; the message carries no secrets
    win.postMessage(hostMessage(type, instanceId, payload), "*");
  }, [instanceId]);
  const report = useCallback((code: SimulationHostErrorCode, detail?: string) => {
    setError({ code, detail });
    const r = referenceRef.current;
    if (r && onErrorRef.current) onErrorRef.current({ packageId: String(r.packageId), packageVersion: Number(r.packageVersion), errorCode: code });
  }, []);
  const emit = useCallback((state: JsonValue | null) => {
    lastEmittedRef.current = JSON.stringify(state);
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    if (debounceMs > 0) debounceRef.current = window.setTimeout(() => { debounceRef.current = null; onStateChangeRef.current(state); }, debounceMs);
    else onStateChangeRef.current(state);
  }, [debounceMs]);

  // one bridge session per (instanceId): READY handshake with timeout + the strict message policy
  useEffect(() => {
    if (!src) return;
    readyRef.current = false;
    const timer = window.setTimeout(() => { if (!readyRef.current) report("READY_TIMEOUT"); }, readyTimeoutMs);
    const onMessage = (event: MessageEvent) => {
      const frame = frameRef.current;
      if (!frame || !frame.contentWindow || event.source !== frame.contentWindow) return;
      const msg = parseSimulatorMessage(event.data, instanceId);
      if (!msg) return;
      switch (msg.type) {
        case "SMARTSIM_READY": {
          if (readyRef.current) return;
          readyRef.current = true; window.clearTimeout(timer); setReadyFor(instanceId);
          const r = referenceRef.current;
          post("SMARTSIM_INIT", { protocolVersion: 1, instanceId, scenario: r?.scenario ?? {}, publicConfig: r?.publicConfig ?? {}, savedState: savedStateRef.current ?? null, disabled: disabledRef.current });
          return;
        }
        case "SMARTSIM_STATE_CHANGED": {
          if (!readyRef.current || disabledRef.current || !("state" in msg.payload)) return;
          const n = normalizeSimulationState(msg.payload.state);
          if (n.ok) { setError(e => (e && e.code === "STATE_TOO_LARGE" ? null : e)); emit(n.state); }
          else if (n.code === "STATE_TOO_LARGE") report("STATE_TOO_LARGE");
          return;                                                                             // any other malformed state: ignored
        }
        case "SMARTSIM_REQUEST_RESET": {
          if (!readyRef.current || disabledRef.current) return;
          post("SMARTSIM_RESET", {}); emit(null);
          return;
        }
        case "SMARTSIM_ERROR": { report("SIMULATOR_ERROR", typeof msg.payload.code === "string" ? msg.payload.code.slice(0, 40) : undefined); return; }
        case "SMARTSIM_RESIZE": { const h = clampResizeHeight(msg.payload.height); if (h !== undefined) setHeight(h); return; }
      }
    };
    window.addEventListener("message", onMessage);
    return () => { window.removeEventListener("message", onMessage); window.clearTimeout(timer); if (debounceRef.current !== null) { window.clearTimeout(debounceRef.current); debounceRef.current = null; } };
  }, [src, instanceId, readyTimeoutMs, post, emit, report]);

  // disabled → SET_DISABLED (submitted / ended / review)
  useEffect(() => { if (ready) post("SMARTSIM_SET_DISABLED", { disabled }); }, [disabled, ready, post]);
  // an EXTERNAL change of the saved state (server hydration, attempt resume) → RESTORE_STATE; our own emissions are not echoed
  useEffect(() => {
    const serialized = JSON.stringify(savedState ?? null);
    if (!ready || serialized === lastEmittedRef.current) return;
    lastEmittedRef.current = serialized;
    post("SMARTSIM_RESTORE_STATE", { state: savedState ?? null });
  }, [savedState, ready, post]);

  const retry = () => { setError(null); setInstanceId(newInstanceId()); };
  const reset = () => { if (!ready || disabled) return; post("SMARTSIM_RESET", {}); emit(null); };
  const title = "محاكاة تفاعلية" + (label || reference?.title ? ": " + (label || reference?.title) : "");

  if (!src) {
    return <div className="smartsim-host" dir="rtl"><div className="smartsim-error" role="alert" data-testid="smartsim-error" data-error-code="PACKAGE_REFERENCE_INVALID"><p>{MESSAGES.PACKAGE_REFERENCE_INVALID}</p></div></div>;
  }
  const fatal = error?.code === "READY_TIMEOUT";
  return (
    <div className={"smartsim-host" + (disabled ? " is-disabled" : "")} dir="rtl">
      {error && (
        <div className="smartsim-error" role="alert" data-testid="smartsim-error" data-error-code={error.code}>
          <p>{MESSAGES[error.code]}{error.detail ? <span className="smartsim-error-code"> ({error.detail})</span> : null}</p>
          <button type="button" className="eb-button" onClick={retry}>إعادة المحاولة</button>
        </div>
      )}
      {!ready && !error && <p className="smartsim-loading" role="status">جارٍ تحميل المحاكاة…</p>}
      <iframe key={instanceId} ref={frameRef} data-testid="smartsim-frame" className="smartsim-frame" src={src} sandbox="allow-scripts" referrerPolicy="no-referrer" title={title} style={{ height: height + "px" }} hidden={fatal} aria-busy={!ready} />
      <div className="smartsim-controls">
        {ready && !disabled && <button type="button" className="eb-button smartsim-reset" onClick={reset}>إعادة ضبط المحاكاة</button>}
        {disabled && <span className="smartsim-readonly">المحاكاة للعرض فقط</span>}
      </div>
      {mode === "preview" && (
        <details className="smartsim-debug" open>
          <summary>حالة المحاكاة المحفوظة (معاينة المعلّم فقط)</summary>
          <pre data-testid="smartsim-debug-state" dir="ltr">{JSON.stringify(savedState ?? null, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}
