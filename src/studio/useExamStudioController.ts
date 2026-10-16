// Phase 21F.1 — the structured exam's state owner, extracted from App.tsx: the ONE history authority (13A), the save flow with its
// second-line finalization guard (13C-C) and conditional saves with conflict resolution (21F.0), and the builder's notice / error.
// App keeps only what is about the page (builder visibility, entry points, services); everything about editing and persisting the
// structured exam lives here, so later Studio phases change this module instead of App.tsx. Behaviour is unchanged by the move.
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { StructuredExam } from "../examTypes";
import { newExamId } from "../examBuilderState";
import { useStructuredExamHistory } from "../useStructuredExamHistory";
import { isExamDirty } from "../examHistory";
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
  // Phase 21F.8 — a server draft autosave in flight. Deliberately NOT `saving`: the builder disables its fields while `saving`, and an
  // autosave must never take the field the teacher is typing in away from them.
  const [autosaving, setAutosaving] = useState(false);
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
  // Phase 21F.8 — saves run one at a time (a manual save during an autosave waits for it), and each starts from the LATEST version the
  // server returned: the history's version, advanced as soon as a save succeeds (before the next render), so two saves of this tab
  // never conflict with each other.
  const baseEtag = useRef(serverEtag);
  useLayoutEffect(() => { baseEtag.current = serverEtag; }, [serverEtag]);
  const inflight = useRef<Promise<void> | null>(null);
  const failedAutosave = useRef<StructuredExam | null>(null);
  const save = useCallback(async (mode: SaveMode, override?: { snapshot: StructuredExam; serverEtag: string | null }, options: { quiet?: boolean } = {}) => {
    const snapshot = override?.snapshot ?? present;
    if (!snapshot) return;
    while (inflight.current) await inflight.current;
    const quiet = options.quiet === true;
    const run = (async () => {
      const base = override ? override.serverEtag : baseEtag.current;
      if (quiet) setAutosaving(true); else { setSaving(true); setError(""); setNotice(""); }
      try {
        // Phase 13C-C — SECOND-LINE GUARD: a "final" save evaluates the exact snapshot about to be persisted with the canonical
        // finalization authority (structural validity + quality gates); when refused, no request is sent and nothing is
        // committed. Draft saves are never gated. Reconciliation against the latest exam is unchanged (13A saved authority).
        // The authority is loaded on demand (it already lives in the lazy builder chunk) so the initial graph does not grow.
        const { runStructuredSave, saveConditionFields, saveConflictOf, savedEtagOf } = await import("../structuredSavePolicy");
        try {
          const result = await runStructuredSave({
            snapshot, mode,
            request: async payload => {
              const response = await deps.current.request<{ ok: true; etag?: string | null }>("/api/save-exam-artifact", { method: "POST", body: JSON.stringify({ kind: "exam", exam: payload, ...saveConditionFields(base) }) });
              const etag = savedEtagOf(response);
              if (etag) baseEtag.current = etag;
              return response;
            },
            commitSaved: history.commitSaved
          });
          if (!result.ok) { if (quiet) failedAutosave.current = snapshot; else setError(result.reason); return; }
        }
        catch (e) {
          const refused = saveConflictOf(e);
          if (!refused) throw e;
          setConflict({ ...refused, mode });
          return;
        }
        setConflict(null);
        failedAutosave.current = null;
        // An autosave is silent: the save status in the top bar («محفوظ») is its only report.
        if (quiet) return;
        setNotice(mode === "final" ? "✓ تم اعتماد الامتحان المنظّم نهائيًا وحفظه." : "✓ تم حفظ مسودة الامتحان المنظّم.");
        await deps.current.afterSave?.();
      }
      catch (e) {
        if (quiet) {
          // Offline / server error: nothing is lost (the history keeps the edits, the local backup keeps writing); the same snapshot is not
          // retried — the next edit or a manual save tries again.
          failedAutosave.current = snapshot;
          setNotice("تعذّر الحفظ التلقائي على الخادم. تغييراتك باقية في المحرر ونسختها الاحتياطية المحلية؛ احفظ يدويًا عند عودة الاتصال.");
        }
        else setError(e instanceof Error ? e.message : "تعذر حفظ الامتحان المنظّم حاليًا.");
      }
      finally {
        if (quiet) setAutosaving(false); else setSaving(false);
      }
    })();
    inflight.current = run;
    try { await run; } finally { if (inflight.current === run) inflight.current = null; }
  }, [present, history.commitSaved]);

  /**
   * Phase 21F.8 (D3) — server draft autosave, requested by the builder after 5 s without edits (no media upload pending, no save in
   * flight). Draft only and never a creation: it runs only for an exam the server already holds at a known version (the conditional
   * save then refuses to overwrite a newer one and opens «تعارض في الحفظ»), never for a final exam (a draft save would demote it),
   * never while a conflict is open, and never twice for a snapshot that just failed.
   */
  const autosaveDraft = useCallback(() => {
    if (!present || saving || autosaving || conflict) return;
    if (typeof baseEtag.current !== "string" || present.status === "final") return;
    if (!isExamDirty(history.history) || failedAutosave.current === present) return;
    void save("draft", undefined, { quiet: true });
  }, [present, saving, autosaving, conflict, history.history, save]);

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

  return { history, exam: present, saving, autosaving, autosaveDraft, notice, error, conflict, setNotice, setError, openExam, save, reloadFromServer, saveAsCopy, replaceServer, dismissConflict };
}
