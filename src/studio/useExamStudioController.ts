// Phase 21F.1 — the structured exam's state owner, extracted from App.tsx: the ONE history authority (13A), the save flow with its
// second-line finalization guard (13C-C) and conditional saves with conflict resolution (21F.0), and the builder's notice / error.
// App keeps only what is about the page (builder visibility, entry points, services); everything about editing and persisting the
// structured exam lives here, so later Studio phases change this module instead of App.tsx. Behaviour is unchanged by the move.
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { StructuredExam } from "../examTypes";
import { newExamId } from "../examBuilderState";
import { useStructuredExamHistory } from "../useStructuredExamHistory";
import type { SaveConflict } from "../structuredSavePolicy";

export type StudioRequest = <T>(url: string, init: RequestInit) => Promise<T>;
export type SaveMode = "draft" | "final";
export type StudioConflict = SaveConflict & { mode: SaveMode };

export function useExamStudioController({ request, afterSave }: { request: StudioRequest; afterSave?: () => Promise<unknown> | void }) {
  const history = useStructuredExamHistory();
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState<StudioConflict | null>(null);
  // The owner's request helper changes identity on every App render (it closes over the session token); calls read the latest.
  const deps = useRef({ request, afterSave });
  useLayoutEffect(() => { deps.current = { request, afterSave }; });

  /** Open an exam in the builder: a COMPLETE history reset (13A). `serverEtag`: see ExamHistory.serverEtag (21F.0). */
  const openExam = useCallback((exam: StructuredExam, source: "saved" | "unsaved", serverEtag?: string | null, message = "") => {
    history.open(exam, source, serverEtag);
    setConflict(null);
    setError("");
    setNotice(message);
  }, [history]);

  // A save states the server version it starts from (21F.0): the server refuses to overwrite a newer version (409 EXAM_CONFLICT)
  // and the teacher resolves it in SaveConflictDialog. `override` carries the snapshot / base of those resolutions.
  const present = history.present;
  const serverEtag = history.history.serverEtag;
  const save = useCallback(async (mode: SaveMode, override?: { snapshot: StructuredExam; serverEtag: string | null }) => {
    const snapshot = override?.snapshot ?? present;
    if (!snapshot) return;
    const base = override ? override.serverEtag : serverEtag;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      // Phase 13C-C — SECOND-LINE GUARD: a "final" save evaluates the exact snapshot about to be persisted with the canonical
      // finalization authority (structural validity + quality gates); when refused, no request is sent and nothing is
      // committed. Draft saves are never gated. Reconciliation against the latest exam is unchanged (13A saved authority).
      // The authority is loaded on demand (it already lives in the lazy builder chunk) so the initial graph does not grow.
      const { runStructuredSave, saveConditionFields, saveConflictOf } = await import("../structuredSavePolicy");
      try {
        const result = await runStructuredSave({
          snapshot, mode,
          request: payload => deps.current.request<{ ok: true; etag?: string | null }>("/api/save-exam-artifact", { method: "POST", body: JSON.stringify({ kind: "exam", exam: payload, ...saveConditionFields(base) }) }),
          commitSaved: history.commitSaved
        });
        if (!result.ok) { setError(result.reason); return; }
      }
      catch (e) {
        const refused = saveConflictOf(e);
        if (!refused) throw e;
        setConflict({ ...refused, mode });
        return;
      }
      setConflict(null);
      setNotice(mode === "final" ? "✓ تم اعتماد الامتحان المنظّم نهائيًا وحفظه." : "✓ تم حفظ مسودة الامتحان المنظّم.");
      await deps.current.afterSave?.();
    }
    catch (e) {
      setError(e instanceof Error ? e.message : "تعذر حفظ الامتحان المنظّم حاليًا.");
    }
    finally {
      setSaving(false);
    }
  }, [present, serverEtag, history.commitSaved]);

  // Conflict resolutions (each discarding choice was already confirmed in the dialog).
  const reloadFromServer = useCallback(async () => {
    if (!conflict?.blobName) return;
    setSaving(true);
    try {
      const result = await deps.current.request<{ ok: true; exam: StructuredExam; etag?: string | null }>("/api/saved-exams", { method: "POST", body: JSON.stringify({ action: "load", blobName: conflict.blobName }) });
      history.open(result.exam, "saved", typeof result.etag === "string" ? result.etag : undefined);
      setConflict(null);
      setError("");
      setNotice("✓ فُتحت أحدث نسخة محفوظة على الخادم.");
    }
    catch (e) {
      setError(e instanceof Error ? e.message : "تعذر فتح نسخة الخادم.");
    }
    finally {
      setSaving(false);
    }
  }, [conflict, history]);
  const saveAsCopy = useCallback(() => {
    if (!conflict || !present) return;
    const copy: StructuredExam = { ...present, examId: newExamId(), title: (present.title?.trim() || "امتحان") + " (نسختي)" };
    history.open(copy, "unsaved", null);
    setConflict(null);
    void save(conflict.mode, { snapshot: copy, serverEtag: null });
  }, [conflict, present, history, save]);
  const replaceServer = useCallback(() => {
    if (!conflict || !present) return;
    setConflict(null);
    void save(conflict.mode, { snapshot: present, serverEtag: conflict.serverEtag });
  }, [conflict, present, save]);
  const dismissConflict = useCallback(() => setConflict(null), []);

  return { history, exam: present, saving, notice, error, conflict, setNotice, setError, openExam, save, reloadFromServer, saveAsCopy, replaceServer, dismissConflict };
}
