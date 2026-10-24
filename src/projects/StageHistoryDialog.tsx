import { useEffect, useState } from "react";
import { trackerGet } from "./api";
import Dialog from "../ui/Dialog";
import EmptyState from "../ui/EmptyState";
import { BY_LABEL, fmtDateTime, stageHistoryText, type StageHistoryEvent } from "./stageHistory";

/** Which stage of which student the dialog shows. A new object is a new opening: the history is read again. */
export type StageHistoryTarget = { studentId: string; stageId: string; title: string };

type Props = {
  token: string; projectCode: string; classId: string;
  /** null = closed. */
  target: StageHistoryTarget | null;
  onClose: () => void;
};

type Loaded = { target: StageHistoryTarget; attempt: number; error: string; events: StageHistoryEvent[] };

/**
 * Phase G4b — «سجلّ التغييرات» of one student's stage, shared by the student table (G3) and the class matrix (G4b): every stored
 * event of the stage (`resource=stage-history`), newest first, in words, with who made it. It is read from the server at each
 * opening, never cached, so a save since the last opening shows. A response for an earlier opening, another cell or a closed
 * dialog is dropped.
 */
export default function StageHistoryDialog({ token, projectCode, classId, target, onClose }: Props) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!target) return;
    let live = true;
    trackerGet<{ events: StageHistoryEvent[] }>(token, projectCode, "stage-history", { classId, studentId: target.studentId, stageId: target.stageId }).then(
      r => { if (live) setLoaded({ target, attempt, error: "", events: Array.isArray(r.events) ? r.events : [] }); },
      e => { if (live) setLoaded({ target, attempt, error: e instanceof Error ? e.message : "تعذر تحميل سجلّ التغييرات.", events: [] }); });
    return () => { live = false; };
  }, [token, projectCode, classId, target, attempt]);
  const current = loaded && target && loaded.target === target && loaded.attempt === attempt ? loaded : null;

  return (
    <Dialog open={!!target} title={target ? target.title : "سجلّ التغييرات"} onClose={onClose} size="md">
      {target && (
        <div className="eb-stage-history" data-stage-id={target.stageId} data-student-id={target.studentId}>
          {!current && <p className="eb-muted" role="status">جارٍ تحميل سجلّ التغييرات...</p>}
          {current && current.error && <div className="platform-error assignment-inline-message" role="alert">{current.error} <button type="button" className="eb-button is-small" onClick={() => setAttempt(a => a + 1)}>إعادة المحاولة</button></div>}
          {current && !current.error && (current.events.length ? (
            <ol className="eb-timeline eb-stage-history-list" aria-label="التغييرات من الأحدث إلى الأقدم">
              {current.events.map(ev => (
                <li key={ev.eventId}>
                  <span className="eb-timeline-text">{stageHistoryText(ev)}</span>
                  <small className="eb-muted eb-stage-history-meta"><span className="eb-timeline-date">{fmtDateTime(ev.createdAt)}</span> · <span className="eb-stage-history-by">{BY_LABEL[ev.by] || BY_LABEL.teacher}</span></small>
                </li>
              ))}
            </ol>
          ) : <EmptyState compact title="لا توجد تغييرات مسجّلة لهذه المرحلة." />)}
        </div>
      )}
    </Dialog>
  );
}
