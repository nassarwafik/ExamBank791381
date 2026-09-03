import { useEffect, useMemo, useRef, useState } from "react";
import { QuestionTextBlock, parseTable, promptText } from "./questionContent";
import type { ExamQuestion, QuestionOption, TopicOption } from "./App";
import { difficultyNames, typeNames } from "./App";

type ApiError = { ok?: boolean; error?: string };

type FileStatus = "uploading" | "analyzing" | "partial" | "done" | "failed";

export type ImportedFile = {
  importJobId: string;
  fileName: string;
  status: FileStatus;
  progressLabel: string;
  error?: string;
};

export type ImportedImage = { id: string; dataUrl: string; contentType: string };

export type ImportedQuestion = {
  importedQuestionId: string;
  importJobId: string;
  sourceFileName: string;
  pageNumbers: number[];
  questionNumberGuess: string;
  topic: string | null;
  difficulty: number | null;
  presentationType: ExamQuestion["presentationType"] | null;
  confidence: number;
  text: string;
  options: QuestionOption[];
  hasVisibleAnswer: boolean;
  answerText: string;
  requiresManualReview: boolean;
  images: ImportedImage[];
  // Section resolution (see api/src/lib/section-resolver.js): auto-filled from the topic's
  // majority mapping when confident, otherwise null until the teacher explicitly picks one. A
  // question bank commit is BLOCKED for any question whose section is still null - never LEGACY,
  // never guessed. The exam-draft path (not the Bank) is more lenient (see toExamQuestion).
  section: "BASIC" | "INFRASTRUCTURE" | null;
  sectionConfidence: number;
  // Raw teacher-typed answer pool (comma/newline separated) used only when the teacher manually
  // converts this question to presentationType "wordBank" - see convertTableRowsToWordBank().
  wordBankInput: string;
};

export type DuplicateMatch = {
  sourceId: string;
  questionId: string;
  matchType: "exact" | "similar";
  similarity: number;
  preview: string;
};

export type UnassignedAsset = ImportedImage & { importJobId: string; sourceFileName: string };

export type ImportSessionState = {
  files: ImportedFile[];
  pool: ImportedQuestion[];
  selectedIds: string[];
  filterSourceFile: string;
  filterTopic: string;
  filterDifficulty: number;
  filterType: string;
  minConfidence: number;
  effectiveTopics: (TopicOption & { defaultSection?: "BASIC" | "INFRASTRUCTURE" | null; sectionConfidence?: number })[];
  duplicates: Record<string, DuplicateMatch[]>;
  duplicateDecisions: Record<string, "skip" | "addAnyway">;
  unassignedAssets: UnassignedAsset[];
};

// Lives in App.tsx (lifted above this component) so the whole import session - uploaded files,
// their analysis state, extracted questions, selections, duplicate-check results - survives the
// teacher navigating away to the Exam Draft and back, instead of being lost on unmount. See the
// "Import Session persistence" requirement this was built for.
export function createEmptyImportSession(topicsCatalog: TopicOption[] = []): ImportSessionState {
  return {
    files: [],
    pool: [],
    selectedIds: [],
    filterSourceFile: "",
    filterTopic: "",
    filterDifficulty: 0,
    filterType: "",
    minConfidence: 0,
    effectiveTopics: topicsCatalog,
    duplicates: {},
    duplicateDecisions: {},
    unassignedAssets: []
  };
}

type Props = {
  token: string;
  topicsCatalog: TopicOption[];
  hasOpenDraft: boolean;
  currentExamQuestionCount: number;
  session: ImportSessionState;
  onSessionChange: (updater: (previous: ImportSessionState) => ImportSessionState) => void;
  onBuildNewExam: (questions: ExamQuestion[]) => void;
  onAppendToExam: (questions: ExamQuestion[]) => void;
};

const MAX_FILES_PER_SESSION = 20;
const MAX_EXAM_QUESTIONS = 40;
const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".html", ".htm"];

function extensionOf(fileName: string) {
  const match = /\.[^./\\]+$/.exec(fileName.toLowerCase());
  return match ? match[0] : "";
}

function defaultPresentationType(question: ImportedQuestion): ExamQuestion["presentationType"] {
  return question.presentationType || "open";
}

// A cell containing only underscores/dashes (Arabic or Latin) is the blank the student is meant to
// fill in - the OTHER cell in that row is the row's label (e.g. "Network Address"). This mirrors
// how these worksheet-style tables are actually authored (a blank-answer column + a given/label
// column), rather than assuming a fixed column order.
function isBlankPlaceholderCell(cell: string): boolean {
  return /^[_\-ـ\s]*$/.test(cell.trim()) || cell.trim() === "";
}

export type ConvertedWordBankFields = { prose: string; fields: { id: string; label: string; order: number; kind: string }[] };

// Pure, exported for unit testing. Converts a table-formatted question's text into the shape
// StudentExamPage.tsx's EXISTING wordBank/fillBlank rendering already expects (one field per row,
// answered via a dropdown populated from ExamQuestion.wordBank) - this is a pure data
// transformation, not a UI or student-facing rendering change, so StudentExamPage.tsx itself is
// never touched. Returns null when the question has no parseable table (nothing to convert).
export function convertTableRowsToWordBankFields(text: string): ConvertedWordBankFields | null {
  const table = parseTable(text);
  if (!table) {
    return null;
  }

  const fields = table.rows.map((row, index) => {
    const blankIndex = row.findIndex(isBlankPlaceholderCell);
    const labelCell = blankIndex >= 0 ? row[(blankIndex + 1) % row.length] : row[row.length - 1];
    return { id: `field-${index}`, label: (labelCell || "").trim(), order: index, kind: "select" };
  });

  return { prose: promptText(text), fields };
}

// Splits the teacher's free-typed answer pool on commas/newlines, trims, and drops empties/dupes.
export function parseWordBankInput(raw: string): string[] {
  const values = String(raw || "").split(/[,\n]/).map(value => value.trim()).filter(Boolean);
  return [...new Set(values)];
}

// Pure, exported for unit testing: the teacher's manual section choice always overwrites whatever
// topic-section-map.json auto-resolved, REGARDLESS of how confident that auto-resolution was (a
// >=90%-confidence suggestion is still only ever a pre-filled default, never a locked value - the
// data model here has no "locked"/"readonly" concept at all, so nothing prevents an override).
export function applySectionOverride(
  pool: ImportedQuestion[],
  importedQuestionId: string,
  section: "BASIC" | "INFRASTRUCTURE"
): ImportedQuestion[] {
  return pool.map(question => (question.importedQuestionId === importedQuestionId ? { ...question, section } : question));
}

// Same algorithm as generate-exam.js's distributeMarks(): split totalMarks as evenly as possible
// across `count` questions, handing the 1-mark remainder to the first few so the sum is exact.
export function distributeMarks(totalMarks: number, count: number): number[] {
  const total = Math.max(1, totalMarks || 100);
  const safeCount = Math.max(1, count);
  const base = Math.floor(total / safeCount);
  let remainder = total - base * safeCount;

  return Array.from({ length: safeCount }, () => {
    const value = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) {
      remainder -= 1;
    }
    return value;
  });
}

// Draft-building is intentionally more lenient than the Bank commit gate: ExamQuestion.section is
// a non-nullable BASIC|INFRASTRUCTURE field used only for the draft's own summary tally, and the
// "never LEGACY / never guess" hard rule the teacher asked for applies specifically to what gets
// permanently written to the Question Bank (see bank-import-action.js's partitionQuestionsBySectionValidity),
// not to a transient, freely-editable exam draft. A best-effort fallback here is acceptable.
function toExamQuestion(question: ImportedQuestion, index: number, marks: number): ExamQuestion {
  const imageAssets = question.images.map(image => ({
    id: image.id,
    origin: "uploaded" as const,
    contentType: image.contentType,
    dataUrl: image.dataUrl
  }));

  // Manual teacher conversion (see the "النوع" selector in the review UI): a table-formatted
  // question the teacher retyped as "wordBank" gets its markdown table stripped out of `text` and
  // rebuilt as fields+wordBank instead - the exact shape StudentExamPage.tsx's ALREADY-WORKING
  // dropdown-per-field rendering expects for any other wordBank question. Falls back to the
  // original text/no-fields if there's no table to convert (nothing to do).
  const wordBankConversion = question.presentationType === "wordBank"
    ? convertTableRowsToWordBankFields(question.text)
    : null;

  return {
    examQuestionId: `IMP-${Date.now()}-${index}`,
    origin: "imported",
    section: question.section || "BASIC",
    topic: question.topic || "OTHER_NETWORKING",
    secondaryTopics: [],
    difficulty: question.difficulty || 2,
    difficultyLabel: question.difficulty ? difficultyNames[question.difficulty] || "" : "",
    familyKey: `IMPORTED-${question.importedQuestionId}`,
    hasCLI: false,
    requiresCalculation: false,
    presentationType: defaultPresentationType(question),
    marks,
    locked: false,
    text: wordBankConversion ? wordBankConversion.prose : question.text,
    textHtml: "",
    options: question.options,
    fields: wordBankConversion ? wordBankConversion.fields : [],
    wordBank: wordBankConversion ? parseWordBankInput(question.wordBankInput) : undefined,
    parts: [],
    answer: question.hasVisibleAnswer && question.answerText
      ? { mode: "anyAccepted", values: [question.answerText] }
      : {},
    teacherNote: question.requiresManualReview ? "مستورد من ملف — يحتاج مراجعة (موضوع/نوع/صعوبة غير مؤكد)." : "",
    aiInstruction: "",
    wasModified: false,
    image: {
      exists: imageAssets.length > 0,
      visible: imageAssets.length > 0,
      origin: imageAssets.length > 0 ? "uploaded" : null,
      assets: imageAssets,
      prompt: null
    },
    history: [],
    redoStack: []
  };
}

export default function ImportQuestionsPanel({
  token,
  topicsCatalog,
  hasOpenDraft,
  currentExamQuestionCount,
  session,
  onSessionChange,
  onBuildNewExam,
  onAppendToExam
}: Props) {
  const {
    files, pool, filterSourceFile, filterTopic, filterDifficulty, filterType, minConfidence,
    effectiveTopics, duplicates, duplicateDecisions, unassignedAssets
  } = session;
  const selectedIds = useMemo(() => new Set(session.selectedIds), [session.selectedIds]);

  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [checkBusy, setCheckBusy] = useState(false);
  const [commitBusy, setCommitBusy] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function patchSession(patch: Partial<ImportSessionState> | ((previous: ImportSessionState) => Partial<ImportSessionState>)) {
    onSessionChange(previous => ({ ...previous, ...(typeof patch === "function" ? patch(previous) : patch) }));
  }

  useEffect(() => {
    if (topicsCatalog.length > 0 && effectiveTopics.length === 0) {
      patchSession({ effectiveTopics: topicsCatalog });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicsCatalog]);

  useEffect(() => {
    if (effectiveTopics.length > 0) {
      return;
    }
    // Self-heals when the teacher opens this panel without ever having used the AI-prompt builder
    // first (which is otherwise the only place topicsCatalog gets populated).
    (async () => {
      try {
        const result = await api<{ ok: true; topics: ImportSessionState["effectiveTopics"] }>("/api/exam-question-availability", {
          method: "POST",
          body: JSON.stringify({})
        });
        if (Array.isArray(result.topics) && result.topics.length > 0) {
          patchSession({ effectiveTopics: result.topics });
        }
      } catch {
        // Non-fatal — topic filter/names simply stay empty until the teacher uses the other flow.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveTopics.length]);

  async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers || {});
    headers.set("Content-Type", "application/json");
    headers.set("x-builder-token", token);
    headers.set("Authorization", "Bearer " + token);
    const response = await fetch(url, { ...options, headers });
    const result = (await response.json()) as T & ApiError;
    if (!response.ok) {
      throw new Error(result.error || "حدث خطأ.");
    }
    return result;
  }

  function updateFile(importJobId: string, patch: Partial<ImportedFile>) {
    patchSession(previous => ({
      files: previous.files.map(file => (file.importJobId === importJobId ? { ...file, ...patch } : file))
    }));
  }

  function resolveSection(topic: string | null): { section: "BASIC" | "INFRASTRUCTURE" | null; sectionConfidence: number } {
    const match = topic ? effectiveTopics.find(t => t.code === topic) : null;
    return { section: match?.defaultSection ?? null, sectionConfidence: match?.sectionConfidence ?? 0 };
  }

  async function analyzeFile(importJobId: string, fileName: string) {
    updateFile(importJobId, { status: "analyzing", progressLabel: "جارٍ تحليل الأسئلة..." });

    // The backend's per-question objects don't carry importJobId/sourceFileName/section (only the
    // whole response does, or section is derived client-side from topic) - stamp them here.
    type RawDetectedQuestion = Omit<ImportedQuestion, "sourceFileName" | "importJobId" | "section" | "sectionConfidence">;

    let addedSoFar = 0;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      let result: {
        ok: true; status: string; questions: RawDetectedQuestion[]; processedChunks: number; totalChunks: number;
        warnings: string[]; unassignedAssets: ImportedImage[]; lastChunkError: string | null;
      };
      try {
        result = await api("/api/import-analyze", {
          method: "POST",
          body: JSON.stringify({ importJobId, provider: "openai" })
        });
      } catch (err) {
        updateFile(importJobId, { status: "failed", error: err instanceof Error ? err.message : "تعذر تحليل الملف." });
        return;
      }

      const stamped = result.questions.map(question => {
        const { section, sectionConfidence } = resolveSection(question.topic);
        return { ...question, sourceFileName: fileName, importJobId, section, sectionConfidence, wordBankInput: "" };
      });

      const newUnassigned: UnassignedAsset[] = (result.unassignedAssets || []).map(asset => ({ ...asset, importJobId, sourceFileName: fileName }));

      patchSession(previous => {
        const existingIds = new Set(previous.pool.map(item => item.importedQuestionId));
        const additions = stamped.filter(item => !existingIds.has(item.importedQuestionId));
        const existingAssetIds = new Set(previous.unassignedAssets.map(a => a.id));
        const additionalAssets = newUnassigned.filter(a => !existingAssetIds.has(a.id));
        return { pool: [...previous.pool, ...additions], unassignedAssets: [...previous.unassignedAssets, ...additionalAssets] };
      });

      addedSoFar = stamped.length;

      if (result.status === "done") {
        updateFile(importJobId, {
          status: "done",
          progressLabel: `تم العثور على ${addedSoFar} سؤالًا`
        });
        return;
      }

      // A real AI-provider failure (missing key, timeout, ...) must never look like ordinary "still
      // processing" progress or a cheerful "found 0 questions" - stop retrying automatically and
      // surface a clear, explicitly retryable error instead (the teacher can press "إعادة التحليل"
      // once the underlying issue is resolved; the same unprocessed chunk will be retried then).
      if (result.lastChunkError) {
        updateFile(importJobId, {
          status: "failed",
          error: "تعذر تحليل الملف بواسطة OpenAI حاليًا."
        });
        return;
      }

      updateFile(importJobId, {
        status: "partial",
        progressLabel: `جارٍ التحليل... (${result.processedChunks}/${result.totalChunks})`
      });
    }

    updateFile(importJobId, { status: "partial", progressLabel: "التحليل لم يكتمل بعد — أعد المحاولة." });
  }

  async function uploadOneFile(file: File) {
    setError("");
    const extension = extensionOf(file.name);
    if (!ACCEPTED_EXTENSIONS.includes(extension)) {
      setError(`نوع الملف غير مدعوم: ${file.name}. الأنواع المدعومة: PDF, DOCX, HTML.`);
      return;
    }

    const placeholderId = "uploading-" + Date.now() + "-" + Math.random().toString(16).slice(2, 8);
    patchSession(previous => ({
      files: [...previous.files, { importJobId: placeholderId, fileName: file.name, status: "uploading", progressLabel: "جارٍ رفع الملف..." }]
    }));

    try {
      const arrayBuffer = await file.arrayBuffer();
      const headers = new Headers();
      headers.set("x-builder-token", token);
      headers.set("Authorization", "Bearer " + token);
      headers.set("x-file-name", encodeURIComponent(file.name));
      headers.set("x-file-type", file.type || "application/octet-stream");

      const response = await fetch("/api/import-upload", { method: "POST", headers, body: arrayBuffer });
      const result = (await response.json()) as { ok: true; importJobId: string; fileName: string } & ApiError;

      if (!response.ok) {
        throw new Error(result.error || "تعذر رفع الملف.");
      }

      patchSession(previous => ({
        files: previous.files.map(item => (item.importJobId === placeholderId
          ? { ...item, importJobId: result.importJobId, status: "analyzing" as FileStatus, progressLabel: "جارٍ استخراج النص..." }
          : item))
      }));

      await analyzeFile(result.importJobId, file.name);
    } catch (err) {
      patchSession(previous => ({
        files: previous.files.map(item => (item.importJobId === placeholderId
          ? { ...item, status: "failed" as FileStatus, error: err instanceof Error ? err.message : "تعذر رفع الملف." }
          : item))
      }));
    }
  }

  async function handleFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) {
      return;
    }
    if (files.length + fileList.length > MAX_FILES_PER_SESSION) {
      setError(`لا يمكن رفع أكثر من ${MAX_FILES_PER_SESSION} ملفًا في نفس الجلسة.`);
      return;
    }
    for (const file of Array.from(fileList)) {
      await uploadOneFile(file);
    }
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
    void handleFilesSelected(event.dataTransfer.files);
  }

  function retryAnalysis(file: ImportedFile) {
    void analyzeFile(file.importJobId, file.fileName);
  }

  const filteredQuestions = useMemo(() => {
    return pool.filter(question => {
      if (filterSourceFile && question.sourceFileName !== filterSourceFile) return false;
      if (filterTopic && question.topic !== filterTopic) return false;
      if (filterDifficulty && question.difficulty !== filterDifficulty) return false;
      if (filterType && question.presentationType !== filterType) return false;
      if (question.confidence < minConfidence) return false;
      return true;
    });
  }, [pool, filterSourceFile, filterTopic, filterDifficulty, filterType, minConfidence]);

  function toggleSelected(importedQuestionId: string) {
    patchSession(previous => {
      const next = new Set(previous.selectedIds);
      if (next.has(importedQuestionId)) {
        next.delete(importedQuestionId);
      } else {
        next.add(importedQuestionId);
      }
      return { selectedIds: [...next] };
    });
  }

  function selectAllFiltered() {
    patchSession(previous => ({ selectedIds: [...new Set([...previous.selectedIds, ...filteredQuestions.map(q => q.importedQuestionId)])] }));
  }

  function clearSelection() {
    patchSession({ selectedIds: [] });
  }

  function setQuestionSection(importedQuestionId: string, section: "BASIC" | "INFRASTRUCTURE") {
    patchSession(previous => ({ pool: applySectionOverride(previous.pool, importedQuestionId, section) }));
  }

  function setQuestionType(importedQuestionId: string, presentationType: ExamQuestion["presentationType"]) {
    patchSession(previous => ({
      pool: previous.pool.map(question => (question.importedQuestionId === importedQuestionId ? { ...question, presentationType } : question))
    }));
  }

  function setQuestionWordBankInput(importedQuestionId: string, wordBankInput: string) {
    patchSession(previous => ({
      pool: previous.pool.map(question => (question.importedQuestionId === importedQuestionId ? { ...question, wordBankInput } : question))
    }));
  }

  const selectedQuestions = useMemo(
    () => pool.filter(question => selectedIds.has(question.importedQuestionId)),
    [pool, selectedIds]
  );

  const sourceFileNames = useMemo(() => [...new Set(pool.map(question => question.sourceFileName))], [pool]);

  function buildExamQuestionsFromSelection(): ExamQuestion[] {
    const marks = distributeMarks(100, selectedQuestions.length);
    return selectedQuestions.map((question, index) => toExamQuestion(question, index, marks[index]));
  }

  function handleBuildNewExam() {
    if (selectedQuestions.length > MAX_EXAM_QUESTIONS) {
      setError(`تم اختيار ${selectedQuestions.length} سؤالًا، لكن الحد الأقصى للامتحان هو ${MAX_EXAM_QUESTIONS}. قلّل الاختيار أولًا.`);
      return;
    }
    setError("");
    onBuildNewExam(buildExamQuestionsFromSelection());
    setNotice(`تم بناء امتحان جديد من ${selectedQuestions.length} سؤالًا مستوردًا.`);
  }

  function handleAppendToExam() {
    const total = currentExamQuestionCount + selectedQuestions.length;
    if (total > MAX_EXAM_QUESTIONS) {
      setError(`الامتحان الحالي يحتوي ${currentExamQuestionCount} سؤالًا، وإضافة ${selectedQuestions.length} سيتجاوز الحد الأقصى (${MAX_EXAM_QUESTIONS}). قلّل الاختيار أولًا.`);
      return;
    }
    setError("");
    onAppendToExam(buildExamQuestionsFromSelection());
    setNotice(`تمت إضافة ${selectedQuestions.length} سؤالًا إلى الامتحان الحالي.`);
  }

  async function runDuplicateCheck() {
    if (selectedQuestions.length === 0) {
      return;
    }
    setCheckBusy(true);
    setError("");
    try {
      const result = await api<{ ok: true; results: { importedQuestionId: string; duplicates: DuplicateMatch[] }[] }>(
        "/api/bank-import-action",
        {
          method: "POST",
          body: JSON.stringify({
            action: "check",
            questions: selectedQuestions.map(q => ({ importedQuestionId: q.importedQuestionId, text: q.text }))
          })
        }
      );

      patchSession(previous => {
        const nextDuplicates: Record<string, DuplicateMatch[]> = {};
        const nextDecisions: Record<string, "skip" | "addAnyway"> = { ...previous.duplicateDecisions };
        for (const item of result.results) {
          nextDuplicates[item.importedQuestionId] = item.duplicates;
          if (item.duplicates.some(d => d.matchType === "exact") && !(item.importedQuestionId in nextDecisions)) {
            nextDecisions[item.importedQuestionId] = "skip";
          }
        }
        return { duplicates: nextDuplicates, duplicateDecisions: nextDecisions };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر فحص التكرار.");
    } finally {
      setCheckBusy(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void runDuplicateCheck();
    }, 500);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.selectedIds]);

  async function handleSaveToBank() {
    if (selectedQuestions.length === 0) {
      return;
    }

    const notSkippedForDuplicates = selectedQuestions.filter(question => duplicateDecisions[question.importedQuestionId] !== "skip");
    if (notSkippedForDuplicates.length === 0) {
      setError("كل الأسئلة المختارة مُستبعدة بسبب التكرار. اختر \"أضف رغم ذلك\" إن أردت إضافتها فعلًا.");
      return;
    }

    // Hard, frontend-side gate mirroring the mandatory backend one: never attempt to commit a
    // question with no resolved BASIC/INFRASTRUCTURE section. The teacher must pick one first.
    const missingSection = notSkippedForDuplicates.filter(question => question.section !== "BASIC" && question.section !== "INFRASTRUCTURE");
    if (missingSection.length > 0) {
      setError(`${missingSection.length} سؤالًا بلا قسم محدد (أساسي/بنية تحتية). اختر القسم لكل سؤال قبل الحفظ في البنك.`);
      return;
    }

    const toCommit = notSkippedForDuplicates;

    setCommitBusy(true);
    setError("");
    try {
      const first = toCommit[0];
      const result = await api<{ ok: true; sourceId: string; addedCount: number; skippedCount: number }>("/api/bank-import-action", {
        method: "POST",
        body: JSON.stringify({
          action: "commit",
          importJobId: first.importJobId,
          fileName: first.sourceFileName,
          questions: toCommit.map(question => ({
            importedQuestionId: question.importedQuestionId,
            questionNumberGuess: question.questionNumberGuess || question.pageNumbers.join(","),
            section: question.section,
            topic: question.topic,
            difficulty: question.difficulty,
            presentationType: question.presentationType,
            text: question.text,
            options: question.options,
            hasVisibleAnswer: question.hasVisibleAnswer,
            answerText: question.answerText,
            requiresManualReview: question.requiresManualReview,
            imageAssets: question.images,
            hasImage: question.images.length > 0
          }))
        })
      });
      setNotice(`تمت إضافة ${result.addedCount} سؤالًا إلى بنك الأسئلة (المصدر: ${result.sourceId}).${result.skippedCount ? ` تم تجاوز ${result.skippedCount} سؤالًا (قسم غير صالح).` : ""}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر الإضافة إلى بنك الأسئلة.");
    } finally {
      setCommitBusy(false);
    }
  }

  return (
    <section className="builder-content">
      <div className="builder-card">
        <div className="builder-heading">
          <div>
            <h2>استيراد أسئلة من ملف</h2>
            <p>
              ارفع ملفات PDF أو DOCX أو HTML تحتوي أسئلة، وسيكتشفها الذكاء الاصطناعي، ثم تختار ما
              تريد إضافته إلى الامتحان أو حفظه في بنك الأسئلة.
            </p>
          </div>
        </div>

        <div
          className={"import-drop-zone" + (dragOver ? " drag-over" : "")}
          onDragOver={event => { event.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <p>اسحب ملفات PDF / Word / HTML إلى هنا</p>
          <p>أو اضغط لاختيار الملفات</p>
          <button type="button" onClick={() => fileInputRef.current?.click()}>
            اختيار ملفات
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.html,.htm"
            hidden
            onChange={event => void handleFilesSelected(event.target.files)}
          />
        </div>

        {error && <p className="platform-error">{error}</p>}
        {notice && <p className="platform-notice">{notice}</p>}

        {files.length > 0 && (
          <ul className="import-file-list">
            {files.map(file => (
              <li key={file.importJobId} className={"import-file-item status-" + file.status}>
                <span className="import-file-name">{file.fileName}</span>
                <span className="import-file-status">
                  {file.status === "failed" ? "❌ " + (file.error || "فشل") : file.progressLabel}
                </span>
                {file.status === "failed" && (
                  <button type="button" onClick={() => retryAnalysis(file)}>
                    إعادة التحليل
                  </button>
                )}
                {file.status === "partial" && (
                  <button type="button" onClick={() => retryAnalysis(file)}>
                    متابعة التحليل
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {unassignedAssets.length > 0 && (
          <div className="import-unassigned-assets">
            <p className="platform-notice">
              ⚠ {unassignedAssets.length} صورة لم يمكن ربطها بسؤال محدد (لم تُنسخ ضمن نص أي سؤال). لن تُفقد، لكنها لن تُرفق تلقائيًا بأي سؤال.
            </p>
            <div className="import-unassigned-grid">
              {unassignedAssets.map(asset => (
                <figure key={asset.id}>
                  <img src={asset.dataUrl} alt="صورة غير مرتبطة" />
                  <figcaption>{asset.sourceFileName}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        )}
      </div>

      {pool.length > 0 && (
        <div className="builder-card exam-availability-card">
          <div className="builder-heading">
            <div>
              <h2>الأسئلة المستخرجة</h2>
              <p>تم العثور على {pool.length} سؤالًا من {files.filter(f => f.status === "done" || f.status === "partial").length} ملف. تم اختيار {selectedQuestions.length} سؤالًا.</p>
            </div>
          </div>

          <div className="availability-filters">
            <fieldset>
              <legend>المصدر</legend>
              <label className="availability-checkbox">
                <input type="radio" checked={filterSourceFile === ""} onChange={() => patchSession({ filterSourceFile: "" })} />
                الكل
              </label>
              {sourceFileNames.map(name => (
                <label key={name} className="availability-checkbox">
                  <input type="radio" checked={filterSourceFile === name} onChange={() => patchSession({ filterSourceFile: name })} />
                  {name}
                </label>
              ))}
            </fieldset>

            <fieldset>
              <legend>الموضوع</legend>
              <label className="availability-checkbox">
                <input type="radio" checked={filterTopic === ""} onChange={() => patchSession({ filterTopic: "" })} />
                الكل
              </label>
              {effectiveTopics.map(topic => (
                <label key={topic.code} className="availability-checkbox">
                  <input type="radio" checked={filterTopic === topic.code} onChange={() => patchSession({ filterTopic: topic.code })} />
                  {topic.name}
                </label>
              ))}
            </fieldset>

            <fieldset>
              <legend>الصعوبة</legend>
              <label className="availability-checkbox">
                <input type="radio" checked={filterDifficulty === 0} onChange={() => patchSession({ filterDifficulty: 0 })} />
                الكل
              </label>
              {[1, 2, 3, 4, 5].map(level => (
                <label key={level} className="availability-checkbox">
                  <input type="radio" checked={filterDifficulty === level} onChange={() => patchSession({ filterDifficulty: level })} />
                  {difficultyNames[level] || `Level ${level}`}
                </label>
              ))}
            </fieldset>

            <fieldset>
              <legend>النوع</legend>
              <label className="availability-checkbox">
                <input type="radio" checked={filterType === ""} onChange={() => patchSession({ filterType: "" })} />
                الكل
              </label>
              {(Object.keys(typeNames) as Array<keyof typeof typeNames>).map(type => (
                <label key={type} className="availability-checkbox">
                  <input type="radio" checked={filterType === type} onChange={() => patchSession({ filterType: type })} />
                  {typeNames[type]}
                </label>
              ))}
            </fieldset>

            <fieldset>
              <legend>الثقة في الاستخراج</legend>
              {[0, 0.6, 0.8].map(threshold => (
                <label key={threshold} className="availability-checkbox">
                  <input type="radio" checked={minConfidence === threshold} onChange={() => patchSession({ minConfidence: threshold })} />
                  {threshold === 0 ? "الكل" : threshold === 0.6 ? "متوسطة فأعلى" : "عالية فقط"}
                </label>
              ))}
            </fieldset>
          </div>

          <div className="builder-actions">
            <button type="button" onClick={selectAllFiltered}>تحديد كل المعروض</button>
            <button type="button" onClick={clearSelection}>إلغاء التحديد</button>
          </div>

          {selectedQuestions.length > MAX_EXAM_QUESTIONS && (
            <p className="platform-notice">
              تم اختيار {selectedQuestions.length} سؤالًا، لكن الحد الأقصى للامتحان هو {MAX_EXAM_QUESTIONS}. قلّل الاختيار للمتابعة.
            </p>
          )}

          <ul className="availability-preview-list">
            {filteredQuestions.map(question => {
              const questionDuplicates = duplicates[question.importedQuestionId] || [];
              return (
                <li key={question.importedQuestionId} className="availability-preview-item import-question-item">
                  <label className="availability-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(question.importedQuestionId)}
                      onChange={() => toggleSelected(question.importedQuestionId)}
                    />
                    <strong>{question.sourceFileName}</strong>
                    {question.pageNumbers.length > 0 && <span> — صفحة {question.pageNumbers.join(",")}</span>}
                  </label>

                  <div className="import-question-badges">
                    <span>{question.topic ? (effectiveTopics.find(t => t.code === question.topic)?.name || question.topic) : "موضوع غير محدد"}</span>
                    <span>{question.difficulty ? (difficultyNames[question.difficulty] || question.difficulty) : "صعوبة غير محددة"}</span>
                    {question.requiresManualReview && <span className="import-badge-review">يحتاج مراجعة</span>}
                    <label className="import-section-picker">
                      القسم:
                      <select
                        value={question.section || ""}
                        onChange={event => setQuestionSection(question.importedQuestionId, event.target.value as "BASIC" | "INFRASTRUCTURE")}
                      >
                        <option value="" disabled>— اختر —</option>
                        <option value="BASIC">أساسي (BASIC)</option>
                        <option value="INFRASTRUCTURE">بنية تحتية (INFRASTRUCTURE)</option>
                      </select>
                    </label>
                    <label className="import-section-picker">
                      النوع:
                      <select
                        value={question.presentationType || "open"}
                        onChange={event => setQuestionType(question.importedQuestionId, event.target.value as ExamQuestion["presentationType"])}
                      >
                        {(Object.keys(typeNames) as Array<keyof typeof typeNames>).map(type => (
                          <option key={type} value={type}>{typeNames[type]}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <QuestionTextBlock text={question.text} />

                  {question.presentationType === "wordBank" && (() => {
                    const converted = convertTableRowsToWordBankFields(question.text);
                    if (!converted) {
                      return (
                        <p className="platform-error">
                          لا يوجد جدول في هذا السؤال لتحويله إلى قائمة منسدلة — سيبقى كسؤال عادي.
                        </p>
                      );
                    }
                    return (
                      <div className="import-wordbank-editor">
                        <p>
                          الحقول المكتشفة: {converted.fields.map(f => f.label).filter(Boolean).join("، ") || "—"}
                        </p>
                        <label>
                          قائمة الإجابات (افصل بينها بفاصلة):
                          <textarea
                            value={question.wordBankInput}
                            onChange={event => setQuestionWordBankInput(question.importedQuestionId, event.target.value)}
                            placeholder="مثال: 192.168.10.0, 0.0.0.55, 255.255.255.0"
                          />
                        </label>
                        {parseWordBankInput(question.wordBankInput).length === 0 && (
                          <p className="platform-error">اكتب قائمة الإجابات قبل إضافة هذا السؤال، وإلا ستظهر القائمة المنسدلة فارغة للطالب.</p>
                        )}
                      </div>
                    );
                  })()}

                  {question.images.length > 0 && (
                    <div className="import-question-images">
                      {question.images.map(image => (
                        <img key={image.id} src={image.dataUrl} alt="صورة السؤال" />
                      ))}
                    </div>
                  )}

                  {questionDuplicates.length > 0 && (
                    <div className="import-duplicate-badge">
                      ⚠ يوجد سؤال {questionDuplicates[0].matchType === "exact" ? "مطابق" : "مشابه"} في المخزن.
                      <label>
                        <input
                          type="radio"
                          checked={duplicateDecisions[question.importedQuestionId] !== "addAnyway"}
                          onChange={() => patchSession(previous => ({ duplicateDecisions: { ...previous.duplicateDecisions, [question.importedQuestionId]: "skip" } }))}
                        />
                        لا تُضف
                      </label>
                      <label>
                        <input
                          type="radio"
                          checked={duplicateDecisions[question.importedQuestionId] === "addAnyway"}
                          onChange={() => patchSession(previous => ({ duplicateDecisions: { ...previous.duplicateDecisions, [question.importedQuestionId]: "addAnyway" } }))}
                        />
                        أضف رغم ذلك
                      </label>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="builder-actions">
            <button type="button" onClick={handleBuildNewExam} disabled={selectedQuestions.length === 0}>
              بناء امتحان جديد من الأسئلة المختارة
            </button>
            {hasOpenDraft && (
              <button type="button" onClick={handleAppendToExam} disabled={selectedQuestions.length === 0}>
                إضافة الأسئلة المختارة إلى الامتحان الحالي
              </button>
            )}
            <button type="button" onClick={() => void handleSaveToBank()} disabled={selectedQuestions.length === 0 || commitBusy}>
              {commitBusy ? "⏳ جارٍ الحفظ..." : "إضافة إلى مخزن الأسئلة"}
            </button>
            {checkBusy && <span>جارٍ فحص التكرار...</span>}
          </div>
        </div>
      )}
    </section>
  );
}
