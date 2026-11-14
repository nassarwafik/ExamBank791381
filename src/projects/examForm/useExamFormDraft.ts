// Phase F2-UI — the draft machinery of the student's project exam form: load, edit, save as the student goes, resume,
// submit. One save runs at a time; an edit made while a save is in flight is sent by the next one. The server is the
// authority: every save carries the page's last known revision, and the page shows the server's own progress.
//
// What each server answer means here:
//   network / 5xx            the edits stay pending; retried with a backoff, then «تعذر حفظ التغييرات» with a manual retry
//   409 DRAFT_STALE          another device or tab saved: the form is read again, the edits still pending here are kept
//                            (one question = one answer, so they merge by question) and sent on the new revision
//   409 submitted / closed   the form is read-only now: pending edits are dropped and the reason is shown
//   400                      an answer the server refuses: shown, never retried
//
// Phase F4-UI — images. An image is attached and removed by its own request, and the reference is written by the server:
// an edit of a question's text never carries the list, so the page keeps the server's images beside the edit. The page
// sends ONE request to the form at a time — a save and an image never travel together — so the answer it adopts last is
// always the newest one.
import { useCallback, useEffect, useRef, useState } from "react";
import { deriveSaveState, shouldWarnBeforeUnload, type SaveStateKind } from "../../studentSaveState";
import { ExamFormRequestError, addExamFormImage, fetchExamForm, removeExamFormImage, saveExamFormDraft, submitExamForm } from "./api";
import type { ExamFormAnswer, ExamFormAnswers, ExamFormImageRef, ExamFormView } from "./types";

const BACKOFF_MS = [1000, 2000, 4000];
const MAX_STALE_ROUNDS = 3;
const asError = (e: unknown, fallback: string) => (e instanceof ExamFormRequestError ? e : new ExamFormRequestError(fallback, 0));
const wait = (ms: number) => new Promise<void>(resolve => { setTimeout(resolve, ms); });
// What the page shows for a question: the student's edit, with the images the server holds for it.
const withImages = (answer: ExamFormAnswer | null, images: ExamFormImageRef[] | undefined): ExamFormAnswer | null =>
  (images && images.length ? { ...(answer || {}), images } : answer);
// A refusal that says nothing about the form itself: the image was not acceptable (type, size, undecodable).
const isImageRefusal = (failure: ExamFormRequestError) => failure.status === 400 || failure.status === 413;

export type SubmitOutcome = { ok: true } | { ok: false; message: string; missing: string[] };

export type ExamFormDraft = {
  view: ExamFormView | null;
  /** Loaded and the teacher has not opened the form (or it is gone). */
  unavailable: boolean;
  loading: boolean;
  loadError: string;
  /** The answers as the page shows them: the server's, with the edits not saved yet on top. */
  answers: ExamFormAnswers;
  /** Read-only now: submitted, closed by the teacher, or an archived class. */
  locked: boolean;
  setAnswer: (questionId: string, answer: ExamFormAnswer | null) => void;
  /** Phase F4-UI — the teacher switched image answers on for this class: image questions take images here. */
  imagesOn: boolean;
  /** Attach one image (a data URL) to a question; rejects with the server's reason. */
  addImage: (questionId: string, dataUrl: string) => Promise<void>;
  removeImage: (questionId: string, imageId: string) => Promise<void>;
  saveKind: SaveStateKind;
  lastSavedAt: string;
  retrySave: () => void;
  /** Why the form became read-only, or a save the server refused. */
  notice: string;
  error: string;
  submitting: boolean;
  /** Sends the edits not saved yet and answers with the server's latest view (null when the form is not available). */
  saveNow: () => Promise<ExamFormView | null>;
  submit: () => Promise<SubmitOutcome>;
  reload: () => Promise<void>;
};

// Image questions wait for a later phase unless the class has them on: the server says which kinds are still deferred.
export const hasImageAnswers = (view: ExamFormView | null) => !!view && Array.isArray(view.deferredKinds) && !view.deferredKinds.includes("image");

// The student may write a draft and a form the teacher returned for correction (Phase F3); nothing else.
export const isLocked = (view: ExamFormView | null) => !view || !(view.status === "draft" || view.status === "returned") || view.state !== "open" || view.readOnly === true;

export function useExamFormDraft(token: string, projectCode: string, saveDelayMs = 800): ExamFormDraft {
  const [view, setView] = useState<ExamFormView | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [answers, setAnswers] = useState<ExamFormAnswers>({});
  const [localRevision, setLocalRevision] = useState(0);
  const [savedRevision, setSavedRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [errorExhausted, setErrorExhausted] = useState(false);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine !== false);
  const [lastSavedAt, setLastSavedAt] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const base = useRef(0);                                               // the server revision this page builds on
  const dirty = useRef(new Map<string, ExamFormAnswer | null>());       // edits not confirmed by the server yet
  const local = useRef(0);
  const locked = useRef(true);
  const running = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disposed = useRef(false);
  const latest = useRef<ExamFormView | null>(null);                     // the last view the server sent

  // The server's view becomes the page's; edits still pending here stay on top of its answers.
  const adopt = useCallback((next: ExamFormView) => {
    base.current = next.revision;
    latest.current = next;
    locked.current = isLocked(next);
    if (locked.current) dirty.current = new Map();
    const merged: ExamFormAnswers = { ...next.answers };
    for (const [id, answer] of dirty.current) {
      const shown = withImages(answer, next.answers[id]?.images);
      if (shown === null) delete merged[id]; else merged[id] = shown;
    }
    setView(next);
    setUnavailable(false);
    setAnswers(merged);
    if (next.updatedAt) setLastSavedAt(next.updatedAt);
    if (!dirty.current.size) setSavedRevision(local.current);
  }, []);

  const reload = useCallback(async () => {
    try {
      const next = await fetchExamForm(token, projectCode);
      if (disposed.current) return;
      setLoadError("");
      if (next) adopt(next);
      else { locked.current = true; dirty.current = new Map(); setView(null); setUnavailable(true); }
    } catch (e) {
      if (!disposed.current) setLoadError(asError(e, "تعذر تحميل الاستمارة.").message);
    } finally {
      if (!disposed.current) setLoading(false);
    }
  }, [token, projectCode, adopt]);

  const drain = useCallback(async () => {
    let attempts = 0, staleRounds = 0;
    setSaving(true);
    try {
      while (dirty.current.size && !locked.current && !disposed.current) {
        const patch = Object.fromEntries(dirty.current);
        dirty.current = new Map();
        try {
          const next = await saveExamFormDraft(token, projectCode, base.current, patch);
          if (disposed.current) return;
          attempts = 0;
          setRetrying(false); setErrorExhausted(false); setError("");
          adopt(next);
        } catch (e) {
          if (disposed.current) return;
          const failure = asError(e, "تعذر حفظ الإجابات.");
          // The edits of this request go back under any edit made meanwhile.
          for (const [id, answer] of Object.entries(patch)) if (!dirty.current.has(id)) dirty.current.set(id, answer);
          if (failure.retryable) {
            if (attempts < BACKOFF_MS.length) { setRetrying(true); await wait(BACKOFF_MS[attempts]); attempts += 1; continue; }
            setRetrying(false); setErrorExhausted(true);
            return;
          }
          if (failure.status === 409 && failure.code === "DRAFT_STALE" && staleRounds < MAX_STALE_ROUNDS) {
            staleRounds += 1;
            const fresh = await fetchExamForm(token, projectCode).catch(() => undefined);
            if (disposed.current) return;
            if (fresh === undefined) { setErrorExhausted(true); return; }
            if (fresh === null) { locked.current = true; dirty.current = new Map(); setView(null); setUnavailable(true); return; }
            adopt(fresh);
            if (locked.current) setNotice("سُلّمت الاستمارة أو أُغلقت من جهاز آخر. إجاباتك المحفوظة باقية.");
            continue;
          }
          // Refused for good: the form is read-only now, or the server does not accept this answer.
          dirty.current = new Map();
          if (failure.status === 400) setError(failure.message); else setNotice(failure.message);
          await reload();
          return;
        }
      }
    } finally {
      if (!disposed.current) setSaving(false);
    }
  }, [token, projectCode, adopt, reload]);

  // One save loop at a time; a caller that needs "everything saved" awaits the loop already running.
  const flush = useCallback((): Promise<void> => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (!running.current) running.current = drain().finally(() => { running.current = null; });
    return running.current;
  }, [drain]);

  const setAnswer = useCallback((questionId: string, answer: ExamFormAnswer | null) => {
    if (locked.current) return;
    dirty.current.set(questionId, answer);
    local.current += 1;
    setLocalRevision(local.current);
    setErrorExhausted(false);
    setAnswers(current => {
      const next = { ...current };
      const shown = withImages(answer, current[questionId]?.images);
      if (shown === null) delete next[questionId]; else next[questionId] = shown;
      return next;
    });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; void flush(); }, saveDelayMs);
  }, [flush, saveDelayMs]);

  const saveNow = useCallback(async () => { await flush(); return latest.current; }, [flush]);

  // Phase F4-UI — one image request. It waits for the save in flight, holds the page's single request slot while it
  // travels (a save asked for meanwhile waits for it), and sends the edits made in the meantime right after itself.
  const imageRequest = useCallback(async (send: () => Promise<ExamFormView>, fallback: string): Promise<void> => {
    while (running.current) await running.current;
    if (locked.current) throw new ExamFormRequestError("الاستمارة للعرض فقط الآن.", 409);
    const round = (async (): Promise<ExamFormRequestError | null> => {
      let failure: ExamFormRequestError | null = null;
      try {
        const next = await send();
        if (!disposed.current) adopt(next);
      } catch (e) {
        failure = asError(e, fallback);
        // The form itself changed under the page (submitted, closed, the question is full from another device): read it again.
        if (!disposed.current && !failure.retryable && !isImageRefusal(failure)) await reload();
      }
      if (dirty.current.size && !locked.current && !disposed.current) await drain();
      return failure;
    })();
    running.current = round.then(() => undefined).finally(() => { running.current = null; });
    const failure = await round;
    if (failure) throw failure;
  }, [adopt, drain, reload]);

  const addImage = useCallback((questionId: string, dataUrl: string) =>
    imageRequest(() => addExamFormImage(token, projectCode, questionId, dataUrl), "تعذر رفع الصورة."), [imageRequest, token, projectCode]);
  const removeImage = useCallback((questionId: string, imageId: string) =>
    imageRequest(() => removeExamFormImage(token, projectCode, questionId, imageId), "تعذر حذف الصورة."), [imageRequest, token, projectCode]);

  const submit = useCallback(async (): Promise<SubmitOutcome> => {
    setSubmitting(true);
    try {
      await flush();
      if (dirty.current.size) return { ok: false, message: "تعذر حفظ آخر التغييرات. تحقق من الاتصال ثم حاول مرة أخرى.", missing: [] };
      const next = await submitExamForm(token, projectCode, base.current);
      if (!disposed.current) adopt(next);
      return { ok: true };
    } catch (e) {
      const failure = asError(e, "تعذر تسليم الاستمارة.");
      if (failure.code !== "FORM_INCOMPLETE") await reload();
      return { ok: false, message: failure.message, missing: failure.missing };
    } finally {
      if (!disposed.current) setSubmitting(false);
    }
  }, [token, projectCode, adopt, flush, reload]);

  useEffect(() => {
    disposed.current = false;
    // The first load starts after this effect returns (a microtask), like every later reload: it is never a synchronous
    // state change of the effect itself.
    queueMicrotask(() => { if (!disposed.current) void reload(); });
    return () => {
      disposed.current = true;
      if (timer.current) clearTimeout(timer.current);
      // Leaving the page with edits not sent yet: one last save, best effort. (The ref is read at unmount on purpose.)
      const pending = dirty.current;
      if (pending.size && !locked.current) void saveExamFormDraft(token, projectCode, base.current, Object.fromEntries(pending)).catch(() => undefined);
    };
  }, [token, projectCode, reload]);

  useEffect(() => {
    const up = () => { setOnline(true); void flush(); };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, [flush]);

  useEffect(() => {
    if (!shouldWarnBeforeUnload(localRevision, savedRevision)) return undefined;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [localRevision, savedRevision]);

  return {
    view, unavailable, loading, loadError, answers, locked: isLocked(view), setAnswer,
    imagesOn: hasImageAnswers(view), addImage, removeImage,
    saveKind: deriveSaveState({ localRevision, savedRevision, saving, retrying, errorExhausted, online }),
    lastSavedAt, retrySave: () => { setErrorExhausted(false); void flush(); },
    notice, error, submitting, saveNow, submit, reload
  };
}
