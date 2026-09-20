import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import LearningReader from "../reader/LearningReader";
import type { ReaderContentApi } from "../reader/readerContentApi";
import type { LibraryTrainingHost, TrainingClient, TrainingListEntry, TrainingStatus } from "./types";

// The runner (and the exam question primitive it pulls) is code-split: reading never pays for practising.
const LearningTrainingRunner = lazy(() => import("./LearningTrainingRunner"));

type ListState = { kind: "loading" } | { kind: "error" } | { kind: "ready"; byId: Record<string, TrainingListEntry> };
type View = { kind: "reader"; pageId?: string; presentation?: boolean } | { kind: "training"; trainingId: string; returnPageId?: string; returnPresentation?: boolean };

/**
 * The ONE Reader-plus-training host used by BOTH the teacher's Learning Materials and the student's portal. It does
 * not fork the Reader: it mounts the SAME LearningReader with an injected `training` seam, remembers the current
 * page (and whether the Reader was in presentation mode), swaps the Reader for the shared LearningTrainingRunner when
 * a training is opened and, on return, remounts the Reader on the SAME page (never page 1) in the same mode. The availability list is read ONCE per mount (and again after a
 * training closes, so best results refresh); a page never issues per-block requests.
 *
 * `client === null` → no session → the Reader renders with no training host (generic cards, zero requests).
 */
export default function LearningReaderWithTraining({ courseId, api, onExit, exitLabel, client, actor, onTrainingSubmitted }: {
  courseId: string;
  api?: ReaderContentApi;
  onExit: () => void;
  exitLabel: string;
  client: TrainingClient | null;
  actor: "student" | "teacher";
  /** Fired after a graded submission was accepted by the server (hosts use it to refresh Strength on exit). */
  onTrainingSubmitted?: () => void;
}) {
  const [view, setView] = useState<View>({ kind: "reader" });
  const [list, setList] = useState<ListState>({ kind: "loading" });
  const [listNonce, setListNonce] = useState(0);
  const pageRef = useRef<string | undefined>(undefined);
  const presentationRef = useRef(false);            // the Reader's presentation mode, remembered across a training

  // The list is set from the async callbacks only (the initial state is "loading"; a refresh resets it from the
  // handler that requests it), so nothing is set synchronously inside the effect.
  useEffect(() => {
    if (!client) return;
    let alive = true;
    client.list()
      .then(r => {
        if (!alive) return;
        const byId: Record<string, TrainingListEntry> = {};
        for (const t of r.trainings || []) byId[t.trainingId] = t;
        setList({ kind: "ready", byId });
      })
      .catch(() => { if (alive) setList({ kind: "error" }); });
    return () => { alive = false; };
  }, [client, listNonce]);

  const onPageChange = useCallback((pageId: string) => { pageRef.current = pageId; }, []);
  const onPresentationChange = useCallback((on: boolean) => { presentationRef.current = on; }, []);
  const refreshList = useCallback(() => { setList({ kind: "loading" }); setListNonce(n => n + 1); }, []);

  const host = useMemo<LibraryTrainingHost | undefined>(() => {
    if (!client) return undefined;
    return {
      status(trainingId: string): TrainingStatus {
        if (list.kind === "loading") return { kind: "loading" };
        if (list.kind === "error") return { kind: "error" };
        const t = list.byId[trainingId];
        if (!t || !t.available || !t.title) return { kind: "unavailable" };
        return { kind: "available", title: t.title, best: t.best ?? null };
      },
      // The current page is captured HERE (an event), so the return remounts the Reader on the same page.
      onOpen(trainingId: string) { setView({ kind: "training", trainingId, returnPageId: pageRef.current, returnPresentation: presentationRef.current }); },
      onRetry: refreshList,
    };
  }, [client, list, refreshList]);

  // The runner's client wraps the host's so a successful submission is observable (Strength refresh on exit).
  const runnerClient = useMemo<TrainingClient | null>(() => {
    if (!client) return null;
    return {
      list: () => client.list(),
      load: id => client.load(id),
      submit: async (id, answers) => { const r = await client.submit(id, answers); onTrainingSubmitted?.(); return r; },
    };
  }, [client, onTrainingSubmitted]);

  if (view.kind === "training" && runnerClient) {
    return (
      <Suspense fallback={<p className="eb-muted" role="status">جارٍ فتح التدريب...</p>}>
        <LearningTrainingRunner
          trainingId={view.trainingId}
          actor={actor}
          client={runnerClient}
          exitLabel="العودة إلى الصفحة"
          onExit={() => { setView({ kind: "reader", pageId: view.returnPageId, presentation: view.returnPresentation }); refreshList(); }}
        />
      </Suspense>
    );
  }

  return (
    <LearningReader
      courseId={courseId}
      api={api}
      onExit={onExit}
      exitLabel={exitLabel}
      training={host}
      initialPageId={view.kind === "reader" ? view.pageId : undefined}
      onPageChange={onPageChange}
      initialPresentation={view.kind === "reader" ? view.presentation : undefined}
      onPresentationChange={onPresentationChange}
    />
  );
}
