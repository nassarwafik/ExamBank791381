// Phase 21G.1 — the assignment composer's state, extracted unchanged from AssignmentsPanel: where the content comes from (the open
// exam, a saved exam, the 791381 library), the library browser (search, category, preview, copy to the builder) and the form fields
// (class, title, instructions, window, attempts, duration, policy, publish). The create request itself stays with the workspace
// controller, which owns the list and the busy state.
import { useEffect, useMemo, useRef, useState } from "react";
import type { AttemptPolicy } from "./attemptPolicy";
import type { ResultsRelease } from "./resultsRelease";
import type { LatePolicy } from "./latePolicy";
import { assignmentWindowIssues } from "./assignmentWindow";
import { filterLibraryCatalog, catalogCategories, type LibraryCatalogItem } from "../examLibrary";
import { examHasQuestions, examQuestionCount } from "../examTypes";
import { localDate, type AssignmentsApi } from "./assignmentsApi";
import type { Classroom, Exam, SavedExam, SourceMode } from "./types";

export const DEFAULT_INSTRUCTIONS = "أجب عن جميع الأسئلة واقرأ التعليمات جيدًا قبل البدء.";

type ComposerDeps = {
  api: AssignmentsApi;
  current: Exam | null;
  active: Classroom[];
  onCopyLibraryExamToBuilder?: (examSnapshot: Exam, title: string) => void;
  setError: (v: string) => void;
  setNotice: (v: string) => void;
};

export function useAssignmentComposer({ api, current, active, onCopyLibraryExamToBuilder, setError, setNotice }: ComposerDeps) {
  // Phase 21G.6 — the target classes (one copy of the assignment per class, D4). The first active class is chosen once, when the
  // classes arrive; after that only the teacher (or a finished create) changes the selection — it is never re-filled behind them.
  const [classIds, setClassIds] = useState<string[]>([]), classDefaulted = useRef(false);
  const [title, setTitle] = useState(""), [instructions, setInstructions] = useState(DEFAULT_INSTRUCTIONS);
  const [openAt, setOpenAt] = useState(localDate(0)), [dueAt, setDueAt] = useState(localDate(72));
  const [maxAttempts, setMaxAttempts] = useState(1), [durationMinutes, setDurationMinutes] = useState(0), [attemptPolicy, setAttemptPolicy] = useState<AttemptPolicy>("continuous"), [resultsRelease, setResultsRelease] = useState<ResultsRelease>("immediate");
  const [publish, setPublish] = useState(false);
  const [latePolicy, setLatePolicy] = useState<LatePolicy | null>(null);   // D5 (item 10) — off by default
  const [savedExams, setSavedExams] = useState<SavedExam[]>([]), [examSource, setExamSource] = useState(current ? "current" : ""), [savedExam, setSavedExam] = useState<Exam | null>(null), [examLoading, setExamLoading] = useState(false);
  const [sourceMode, setSourceMode] = useState<SourceMode>("mine");
  const [libraryCatalog, setLibraryCatalog] = useState<LibraryCatalogItem[]>([]), [libraryLoading, setLibraryLoading] = useState(false), [librarySearch, setLibrarySearch] = useState(""), [libraryCategory, setLibraryCategory] = useState(""), [librarySelectedId, setLibrarySelectedId] = useState(""), [libraryExam, setLibraryExam] = useState<Exam | null>(null);
  const [preview, setPreview] = useState<{ title: string; exam: Exam } | null>(null), [previewBusyId, setPreviewBusyId] = useState(""), [copyBusyId, setCopyBusyId] = useState("");

  const sourceExam = sourceMode === "library" ? libraryExam : (examSource === "current" ? current : savedExam);
  useEffect(() => { if (!classDefaulted.current && active[0]) { classDefaulted.current = true; setClassIds([active[0].classId]); } }, [active]);
  const toggleClass = (id: string) => setClassIds(x => (x.includes(id) ? x.filter(y => y !== id) : [...x, id]));
  const setAllClasses = (on: boolean) => setClassIds(on ? active.map(c => c.classId) : []);
  useEffect(() => { if (current && examSource === "" && examHasQuestions(current)) setExamSource("current"); }, [current, examSource]);

  async function loadSavedExams() {
    try { const r = await api<{ exams: SavedExam[] }>("/api/saved-exams"); setSavedExams(r.exams || []); } catch (e) { setError(e instanceof Error ? e.message : "تعذر تحميل الامتحانات المحفوظة."); }
  }
  async function chooseExam(value: string) {
    setExamSource(value); setSavedExam(null); setError(""); setNotice("");
    if (!value) { return; }
    if (value === "current") {
      if (current?.title) setTitle(current.title);
      return;
    }
    const meta = savedExams.find(x => x.blobName === value);
    setExamLoading(true);
    try {
      const r = await api<{ exam: Exam }>("/api/saved-exams", { method: "POST", body: JSON.stringify({ action: "load", blobName: value }) });
      setSavedExam(r.exam || null); setTitle(String(r.exam?.title || meta?.title || "")); setNotice("✓ تم اختيار الامتحان المحفوظ.");
    } catch (e) { setExamSource(""); setError(e instanceof Error ? e.message : "تعذر فتح الامتحان المحفوظ."); } finally { setExamLoading(false); }
  }
  async function switchSourceMode(mode: SourceMode) {
    setSourceMode(mode); setError(""); setNotice("");
    if (mode === "library" && !libraryCatalog.length && !libraryLoading) {
      setLibraryLoading(true);
      try { const r = await api<{ catalog: LibraryCatalogItem[] }>("/api/exam-library"); setLibraryCatalog(r.catalog || []); }
      catch (e) { setError(e instanceof Error ? e.message : "تعذر تحميل مكتبة 791381."); }
      finally { setLibraryLoading(false); }
    }
  }
  async function chooseLibraryItem(it: LibraryCatalogItem) {
    if (!it.publishable || examLoading) return;
    setLibrarySelectedId(it.libraryItemId); setLibraryExam(null); setError(""); setNotice("");
    setExamLoading(true);
    try {
      const r = await api<{ item: { examSnapshot: Exam } }>("/api/exam-library/" + encodeURIComponent(it.libraryItemId));
      setLibraryExam(r.item?.examSnapshot || null); setTitle(String(r.item?.examSnapshot?.title || it.title || "")); setNotice("✓ تم اختيار «" + it.title + "» من مكتبة 791381.");
    } catch (e) { setLibrarySelectedId(""); setError(e instanceof Error ? e.message : "تعذر فتح عنصر المكتبة."); } finally { setExamLoading(false); }
  }
  // Preview reuses the ONE faithful renderer (ExamPreview), whose toSafePreviewExam() deep-scrubs every grading secret from the
  // whole exam (sections / cover / parts / fields / options) — so previewing any item (including needs_review ones) is safe and never
  // reveals answers, and structured exams keep their sections / cover instead of being flattened.
  async function openPreview(it: LibraryCatalogItem) {
    if (previewBusyId) return;
    setPreviewBusyId(it.libraryItemId); setError("");
    try {
      const r = await api<{ item: { examSnapshot: Exam } }>("/api/exam-library/" + encodeURIComponent(it.libraryItemId));
      setPreview({ title: it.title, exam: (r.item?.examSnapshot || {}) as Exam });
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر فتح المعاينة."); } finally { setPreviewBusyId(""); }
  }
  async function copyLibraryItem(it: LibraryCatalogItem) {
    if (!onCopyLibraryExamToBuilder || copyBusyId) return;
    setCopyBusyId(it.libraryItemId); setError(""); setNotice("");
    try {
      const r = await api<{ item: { examSnapshot: Exam } }>("/api/exam-library/" + encodeURIComponent(it.libraryItemId));
      if (r.item?.examSnapshot) onCopyLibraryExamToBuilder(r.item.examSnapshot, it.title);
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر نسخ العنصر إلى الباني."); } finally { setCopyBusyId(""); }
  }
  const libraryFiltered = useMemo(() => filterLibraryCatalog(libraryCatalog, { search: librarySearch, category: libraryCategory }), [libraryCatalog, librarySearch, libraryCategory]);
  const libraryCats = useMemo(() => catalogCategories(libraryCatalog), [libraryCatalog]);
  const sourceCount = examQuestionCount(sourceExam);
  const windowIssues = assignmentWindowIssues(openAt, dueAt);

  return {
    fields: { classIds, setClassIds, toggleClass, setAllClasses, title, setTitle, instructions, setInstructions, openAt, setOpenAt, dueAt, setDueAt, maxAttempts, setMaxAttempts, durationMinutes, setDurationMinutes, attemptPolicy, setAttemptPolicy, resultsRelease, setResultsRelease, latePolicy, setLatePolicy, publish, setPublish },
    source: { sourceMode, switchSourceMode, sourceExam, sourceCount, current, hasCurrent: !!(current && examHasQuestions(current)), savedExams, examSource, chooseExam, examLoading, loadSavedExams },
    library: { libraryLoading, libraryFiltered, libraryCats, librarySearch, setLibrarySearch, libraryCategory, setLibraryCategory, librarySelectedId, chooseLibraryItem, openPreview, previewBusyId, copyLibraryItem: onCopyLibraryExamToBuilder ? copyLibraryItem : undefined, copyBusyId },
    preview, closePreview: () => setPreview(null),
    // The chosen content, previewed by the ONE faithful renderer (ExamPreview scrubs every grading secret).
    previewSelected: () => { if (sourceExam) setPreview({ title: String(sourceExam.title || title), exam: sourceExam }); },
    windowIssues
  };
}
export type AssignmentComposerState = ReturnType<typeof useAssignmentComposer>;
