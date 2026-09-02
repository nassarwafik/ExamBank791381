import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import StudentPortal from "./StudentPortal";
import TeacherPlatform from "./TeacherPlatform";
import { IconUser, IconLock, IconWarning, IconBuilder, IconDashboard, IconStudents, IconAssignments, IconLogout, IconChevronDown, IconImage, IconSparkles } from "./icons";
import { QuestionTextBlock } from "./questionContent";
import "./App.css";
import "./platform.css";
import "./page-parts.css";
import "./shell.css";
import "./dashboard-pro.css";
import "./builder-pro.css";
import "./studentexam-pro.css";
import "./review-pro.css";
import "./assignments-pro.css";
import "./studentportal-pro.css";
import "./login-pro.css";
// FINAL_BUILDER_PHASE_6
// EXAMBANK_2_PHASE_A
// EXAMBANK_2_PHASE_B
// EXAMBANK_2_PHASE_C
// EXAMBANK_2_PHASE_D
// EXAMBANK_IMAGE_UPLOAD_AND_TYPE_CONVERSION

type DifficultyMap = Record<"1" | "2" | "3" | "4" | "5", number>;

type ExamPlan = {
  title: string;
  originalRequest: string;
  totalQuestions: number;
  requestedQuestionCount: number;
  totalMarks: number;
  allowedDifficulties?: number[];
  allowedTypes?: string[];
  sectionTargets: {
    BASIC: number;
    INFRASTRUCTURE: number;
  };
  difficultyTargets: DifficultyMap;
  topicTargets: Array<{
    topic: string;
    count: number;
  }>;
  excludedTopics: string[];
  typeTargets: {
    multipleChoice: number;
    fillBlank: number;
    wordBank: number;
    open: number;
  };
  minimums: {
    images: number;
    cli: number;
    calculations: number;
  };
  rules: {
    excludeNeedsReview: boolean;
    avoidSameFamily: boolean;
    preferOfficialSources: boolean;
    avoidPreviouslyUsed: boolean;
    recentExamCount: number;
  };
  explanation: string;
  aiProvider?: "glm" | "qwen" | "qwenplus" | "openai";
  aiModel?: string;
};

type TopicOption = { code: string; name: string; parent: string | null };
type FacetCount = { topic?: string; difficulty?: number; type?: string; count: number };
type ExamAvailability = {
  availableCount: number;
  topicFacets: FacetCount[];
  difficultyFacets: FacetCount[];
  typeFacets: FacetCount[];
  preview?: Array<{ id: string; text: string; topic: string; difficulty: number; type: string }>;
};

type QuestionOption = {
  value?: string;
  label?: string;
  text?: string;
  order?: number;
};

type QuestionField = {
  id?: string;
  label?: string;
  order?: number;
  kind?: string;
  options?: QuestionOption[];
};

type QuestionImageAsset = {
  id?: string;
  origin: "bank" | "ai-generated" | "uploaded";
  blobName?: string;
  contentType?: string;
  dataUrl: string;
};

type ExamQuestion = {
  examQuestionId: string;
  origin: "bank" | "ai-generated";
  bankQuestionId?: string;
  sourceId?: string;
  sourceQuestionId?: string;
  questionNumber?: string;
  section: "BASIC" | "INFRASTRUCTURE";
  topic: string;
  secondaryTopics: string[];
  difficulty: number;
  difficultyLabel: string;
  familyKey: string;
  hasCLI: boolean;
  requiresCalculation: boolean;
  presentationType:
    | "multipleChoice"
    | "fillBlank"
    | "wordBank"
    | "open";
  bankType?: string;
  marks: number;
  locked: boolean;
  text: string;
  textHtml?: string;
  options: QuestionOption[];
  fields: QuestionField[];
  parts: unknown[];
  answer: Record<string, unknown>;
  hint?: string;
  teacherNote: string;
  aiInstruction: string;
  wasModified: boolean;
  wordBank?: string[];
  image: {
    exists: boolean;
    visible: boolean;
    origin: "bank" | "ai-generated" | "uploaded" | null;
    assets: QuestionImageAsset[];
    prompt: string | null;
  };
  history: unknown[];
  redoStack: unknown[];
};

type ExamMetadata = {
  school: string;
  subject: string;
  grade: string;
  className: string;
  teacherName: string;
  date: string;
  duration: string;
  semester: string;
  generalInstructions: string;
};

type ExamDraft = {
  schemaVersion: number;
  examId: string;
  title: string;
  originalRequest: string;
  plan: ExamPlan;
  totalMarks: number;
  status: "draft" | "final";
  createdAt: string;
  updatedAt: string;
  metadata?: ExamMetadata;
  questions: ExamQuestion[];
  summary: {
    sections: Record<string, number>;
    difficulty: DifficultyMap;
    topics: Record<string, number>;
    types: Record<string, number>;
    images: number;
    cli: number;
    calculations: number;
  };
  warnings: string[];
  revisionHistory: unknown[];
};

type ApiError = {
  ok?: boolean;
  error?: string;
};

type SavedExamListItem = {
  blobName: string;
  examId: string;
  title: string;
  savedAt: string;
  questionCount: number;
  totalMarks: number;
};

type SavedTemplateListItem = {
  blobName: string;
  templateId: string;
  title: string;
  savedAt: string;
  totalMarks: number;
  totalQuestions: number;
};

type GlobalAiOperation = {
  examQuestionId: string;
  action: "modify" | "replace";
  targetTopic: string;
  targetDifficulty: number;
  targetType:
    | ""
    | ExamQuestion["presentationType"];
  instruction: string;
};

const difficultyNames: Record<number, string> = {
  1: "Easy",
  2: "Easy-Medium",
  3: "Medium",
  4: "Harder",
  5: "Advanced"
};

const typeNames: Record<ExamQuestion["presentationType"], string> = {
  multipleChoice: "أمريكي",
  fillBlank: "أكمل الناقص",
  wordBank: "مخزن كلمات",
  open: "مفتوح"
};

const RECOVERY_KEY =
  "ExamBank791381-Recovery-V1";

function defaultExamMetadata(): ExamMetadata {
  return {
    school: "",
    subject:
      "شبكات الاتصال",
    grade: "",
    className: "",
    teacherName: "",
    date: "",
    duration: "",
    semester: "",
    generalInstructions:
      "أجب عن جميع الأسئلة، واقرأ السؤال جيدًا قبل الإجابة."
  };
}

function hasRecoveryDraft() {
  try {
    return Boolean(
      localStorage.getItem(
        RECOVERY_KEY
      )
    );
  }
  catch {
    return false;
  }
}

function getStoredToken() {
  try {
    return sessionStorage.getItem("examBankBuilderToken") || "";
  }
  catch {
    return "";
  }
}

function getStoredRole():
  "teacher" |
  "student" |
  "" {
  try {
    const stored =
      sessionStorage
        .getItem(
          "examBankSessionRole"
        );

    if (
      stored ===
        "teacher" ||
      stored ===
        "student"
    ) {
      return stored;
    }

    return getStoredToken()
      ? "teacher"
      : "";
  }
  catch {
    return "";
  }
}

function getStoredDisplayName() {
  try {
    return sessionStorage
      .getItem(
        "examBankSessionDisplayName"
      ) || "";
  }
  catch {
    return "";
  }
}

function App() {
  const [token, setToken] = useState(getStoredToken);

  const [
    sessionRole,
    setSessionRole
  ] =
    useState<
      "teacher" |
      "student" |
      ""
    >(
      getStoredRole
    );

  const [
    sessionDisplayName,
    setSessionDisplayName
  ] =
    useState(
      getStoredDisplayName
    );

  const [
    teacherView,
    setTeacherView
  ] =
    useState<
      "builder" |
      "platform"
    >(
      "builder"
    );

  const [workspaceTab, setWorkspaceTab] = useState<"dashboard" | "students" | "assignments">("dashboard");

  function goToWorkspace(tab: "dashboard" | "students" | "assignments") {
    setTeacherView("platform");
    setWorkspaceTab(tab);
  }

  const [userCode, setUserCode] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);

  const [examPrompt, setExamPrompt] = useState("");
  const [aiProvider, setAiProvider] = useState<"glm" | "qwen" | "qwenplus" | "openai">("glm");
  const [plan, setPlan] = useState<ExamPlan | null>(null);
  const [exam, setExam] = useState<ExamDraft | null>(null);
  const [generateBusy, setGenerateBusy] = useState(false);
  const [builderError, setBuilderError] = useState("");

  const [analyzeBusy, setAnalyzeBusy] = useState(false);
  const [topicsCatalog, setTopicsCatalog] = useState<TopicOption[]>([]);
  const [availability, setAvailability] = useState<ExamAvailability | null>(null);
  const [availabilityBusy, setAvailabilityBusy] = useState(false);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [selectedDifficulties, setSelectedDifficulties] = useState<number[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [manualQuestionCount, setManualQuestionCount] = useState(0);
  const [previewBusy, setPreviewBusy] = useState(false);
  // Guards against out-of-order responses when the teacher toggles filters faster than the
  // network round-trip: only the response to the most recently issued request is ever applied.
  const availabilityRequestId = useRef(0);
  const [globalInstruction, setGlobalInstruction] = useState("");
  const [questionBusy, setQuestionBusy] = useState<
    Record<string, boolean>
  >({});
  const [imageBusy, setImageBusy] = useState<
    Record<string, boolean>
  >({});
  const [imageNotice, setImageNotice] = useState<
    Record<string, string>
  >({});
  const [answerVisibility, setAnswerVisibility] = useState<
    Record<string, boolean>
  >({});

  const [previewMode, setPreviewMode] = useState<
    "edit" | "student" | "teacher"
  >("edit");

  const [saveBusy, setSaveBusy] = useState<
    "exam" | "template" | null
  >(null);

  const [actionNotice, setActionNotice] = useState("");

  const [qualityReport, setQualityReport] = useState<
    string[] | null
  >(null);

  const [savedExams, setSavedExams] = useState<
    SavedExamListItem[]
  >([]);

  const [savedExamsOpen, setSavedExamsOpen] =
    useState(false);

  const [savedExamsBusy, setSavedExamsBusy] =
    useState(false);

  const [exportBusy, setExportBusy] =
    useState(false);

  const [templates, setTemplates] = useState<
    SavedTemplateListItem[]
  >([]);

  const [templatesOpen, setTemplatesOpen] =
    useState(false);

  const [templatesBusy, setTemplatesBusy] =
    useState(false);

  const [globalAiBusy, setGlobalAiBusy] =
    useState(false);

  const [hasUnsavedChanges, setHasUnsavedChanges] =
    useState(false);

  useEffect(() => {
    if (!hasUnsavedChanges) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  const [lastCloudSaveAt, setLastCloudSaveAt] =
    useState("");

  const [recoveryAvailable, setRecoveryAvailable] =
    useState(hasRecoveryDraft);

  const loggedIn = Boolean(token);

  const totalCurrentMarks = useMemo(() => {
    if (!exam) {
      return 0;
    }

    return exam.questions.reduce(
      (sum, question) => sum + Number(question.marks || 0),
      0
    );
  }, [exam]);

  // FINAL_BUILDER_PHASE_6_AUTOSAVE
  useEffect(() => {
    if (
      !loggedIn ||
      !exam ||
      !hasUnsavedChanges
    ) {
      return;
    }

    const timer =
      window.setTimeout(
        () => {
          try {
            const payload = {
              exam:
                makeRecoveryExam(
                  exam
                ),

              plan,

              examPrompt,

              savedAt:
                new Date()
                  .toISOString()
            };

            localStorage.setItem(
              RECOVERY_KEY,
              JSON.stringify(
                payload
              )
            );

            setRecoveryAvailable(
              true
            );
          }
          catch {
            // Recovery is best-effort.
          }
        },
        1800
      );

    return () =>
      window.clearTimeout(
        timer
      );
  }, [
    loggedIn,
    exam,
    plan,
    examPrompt,
    hasUnsavedChanges
  ]);

  async function apiRequest<T>(
    url: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers = new Headers(options.headers || {});
    headers.set("Content-Type", "application/json");

    if (token) {
      // Azure Static Web Apps may handle Authorization specially.
      // Send our builder session in a dedicated custom header as well.
      headers.set("x-builder-token", token);
      headers.set("Authorization", `Bearer ${token}`);
    }

    const response = await fetch(url, {
      ...options,
      headers
    });

    const data = (await response.json()) as T & ApiError;

    if (!response.ok) {
      if (response.status === 401) {
        handleLogout();
      }

      throw new Error(
        data.error || `HTTP ${response.status}`
      );
    }

    return data;
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault();

    if (!userCode.trim() || !password.trim()) {
      setLoginError("أدخل كود المستخدم وكلمة المرور.");
      return;
    }

    setLoginBusy(true);
    setLoginError("");

    try {
      const response = await fetch("/api/platform-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          userCode: userCode.trim(),
          password
        })
      });

      const data = (await response.json()) as {
        ok?: boolean;
        token?: string;
        role?:
          "teacher" |
          "student";
        displayName?: string;
        error?: string;
      };

      if (!response.ok || !data.token) {
        throw new Error(
          data.error || "تعذر تسجيل الدخول."
        );
      }

      sessionStorage.setItem(
        "examBankBuilderToken",
        data.token
      );

      const resolvedRole =
        data.role ||
        "teacher";

      sessionStorage.setItem(
        "examBankSessionRole",
        resolvedRole
      );

      sessionStorage.setItem(
        "examBankSessionDisplayName",
        data.displayName ||
        ""
      );

      setSessionRole(
        resolvedRole
      );

      setSessionDisplayName(
        data.displayName ||
        ""
      );

      setTeacherView(
        "builder"
      );

      setToken(data.token);
      setPassword("");
    }
    catch (error) {
      setLoginError(
        error instanceof Error
          ? error.message
          : "تعذر تسجيل الدخول."
      );
    }
    finally {
      setLoginBusy(false);
    }
  }

  function handleLogout() {
    try {
      sessionStorage.removeItem("examBankBuilderToken");
      sessionStorage.removeItem("examBankSessionRole");
      sessionStorage.removeItem("examBankSessionDisplayName");
    }
    catch {
      // Ignore storage failures.
    }

    setToken("");
    setSessionRole("");
    setSessionDisplayName("");
    setTeacherView("builder");
    setUserCode("");
    setPassword("");
    setExamPrompt("");
    setPlan(null);
    setExam(null);
    setBuilderError("");
    setAvailability(null);
    setTopicsCatalog([]);
    setSelectedTopics([]);
    setSelectedDifficulties([]);
    setSelectedTypes([]);
    setManualQuestionCount(0);
  }

  async function fetchAvailability(
    topics: string[],
    difficulties: number[],
    types: string[],
    preview = false
  ) {
    const requestId = ++availabilityRequestId.current;
    if (preview) setPreviewBusy(true); else setAvailabilityBusy(true);

    // A teacher can uncheck every topic. Treating that as "no restriction" would silently allow
    // every topic in the bank, which is exactly the accidental behavior this feature exists to
    // prevent — so it is never sent to the backend as an unrestricted request.
    if (topicsCatalog.length > 0 && topics.length === 0) {
      if (availabilityRequestId.current === requestId) {
        setAvailability(prev => ({
          availableCount: 0,
          topicFacets: prev?.topicFacets ?? [],
          difficultyFacets: [],
          typeFacets: [],
          preview: preview ? [] : prev?.preview
        }));
        if (preview) setPreviewBusy(false); else setAvailabilityBusy(false);
      }
      return;
    }

    try {
      const result = await apiRequest<{ ok: true } & ExamAvailability>(
        "/api/exam-question-availability",
        {
          method: "POST",
          body: JSON.stringify({
            selectedTopics: topics,
            allowedDifficulties: difficulties,
            allowedTypes: types,
            preview
          })
        }
      );
      // Discard this response if a newer request has been issued since (out-of-order network
      // replies from rapid filter toggling must never overwrite a more recent filter's result).
      if (availabilityRequestId.current !== requestId) {
        return;
      }
      setAvailability(prev => ({
        availableCount: result.availableCount,
        topicFacets: result.topicFacets,
        difficultyFacets: result.difficultyFacets,
        typeFacets: result.typeFacets,
        preview: preview ? result.preview : prev?.preview
      }));
    }
    catch (error) {
      if (availabilityRequestId.current !== requestId) {
        return;
      }
      setBuilderError(
        error instanceof Error
          ? error.message
          : "تعذر حساب الأسئلة المتاحة حاليًا."
      );
    }
    finally {
      if (availabilityRequestId.current === requestId) {
        if (preview) setPreviewBusy(false); else setAvailabilityBusy(false);
      }
    }
  }

  async function handleAnalyzeRequest() {
    if (!examPrompt.trim() || analyzeBusy) {
      return;
    }

    setAnalyzeBusy(true);
    setBuilderError("");
    setPlan(null);
    setExam(null);
    setAvailability(null);

    try {
      const interpreted = await apiRequest<{
        ok: true;
        plan: ExamPlan;
        topics: TopicOption[];
      }>("/api/interpret-exam-request", {
        method: "POST",
        body: JSON.stringify({
          prompt: examPrompt.trim(),
          provider: aiProvider
        })
      });

      setPlan(interpreted.plan);
      setTopicsCatalog(interpreted.topics);
      setManualQuestionCount(interpreted.plan.totalQuestions);

      // Only topics/difficulty/type the AI actually detected in the prompt start checked — never
      // auto-select anything the teacher didn't ask for. Any topic code the AI returned that
      // isn't a real, known topic (possible with providers that don't strictly enforce the
      // schema) is silently dropped rather than invented as a new topic or left as an invisible
      // selection with no matching checkbox.
      const knownTopicCodes = new Set(interpreted.topics.map(topic => topic.code));
      const initialTopics = interpreted.plan.topicTargets
        .map(item => item.topic)
        .filter(topic => knownTopicCodes.has(topic));
      const initialDifficulties = Object.entries(interpreted.plan.difficultyTargets)
        .filter(([, count]) => Number(count) > 0)
        .map(([level]) => Number(level));
      const initialTypes = Object.entries(interpreted.plan.typeTargets)
        .filter(([, count]) => Number(count) > 0)
        .map(([type]) => type);

      setSelectedTopics(initialTopics);
      setSelectedDifficulties(initialDifficulties);
      setSelectedTypes(initialTypes);

      await fetchAvailability(initialTopics, initialDifficulties, initialTypes);

      window.setTimeout(() => {
        document
          .getElementById("exam-availability-panel")
          ?.scrollIntoView({
            behavior: "smooth",
            block: "start"
          });
      }, 80);
    }
    catch (error) {
      setBuilderError(
        error instanceof Error
          ? error.message
          : "حدث خطأ أثناء تحليل الطلب."
      );
    }
    finally {
      setAnalyzeBusy(false);
    }
  }

  function toggleTopic(code: string) {
    const next = selectedTopics.includes(code)
      ? selectedTopics.filter(t => t !== code)
      : [...selectedTopics, code];
    setSelectedTopics(next);
    void fetchAvailability(next, selectedDifficulties, selectedTypes);
  }

  function toggleDifficulty(level: number) {
    const next = selectedDifficulties.includes(level)
      ? selectedDifficulties.filter(d => d !== level)
      : [...selectedDifficulties, level];
    setSelectedDifficulties(next);
    void fetchAvailability(selectedTopics, next, selectedTypes);
  }

  function toggleType(type: string) {
    const next = selectedTypes.includes(type)
      ? selectedTypes.filter(t => t !== type)
      : [...selectedTypes, type];
    setSelectedTypes(next);
    void fetchAvailability(selectedTopics, selectedDifficulties, next);
  }

  async function handlePreviewQuestions() {
    await fetchAvailability(selectedTopics, selectedDifficulties, selectedTypes, true);
  }

  async function handleCreateExam() {
    if (!plan || generateBusy) {
      return;
    }

    setGenerateBusy(true);
    setBuilderError("");
    setExam(null);

    try {
      const excludedTopics = selectedTopics.length
        ? topicsCatalog
            .map(topic => topic.code)
            .filter(code => !selectedTopics.includes(code))
        : [];

      const finalPlan: ExamPlan = {
        ...plan,
        totalQuestions: Math.min(40, Math.max(1, manualQuestionCount || plan.totalQuestions)),
        excludedTopics,
        allowedDifficulties: selectedDifficulties,
        allowedTypes: selectedTypes
      };

      const generated = await apiRequest<{
        ok: true;
        exam: ExamDraft;
      }>("/api/generate-exam", {
        method: "POST",
        body: JSON.stringify({
          plan: finalPlan
        })
      });

      setExam({
        ...generated.exam,

        metadata: {
          ...defaultExamMetadata(),
          ...(
            generated.exam
              .metadata ||
            {}
          )
        }
      });

      setHasUnsavedChanges(
        true
      );

      window.setTimeout(() => {
        document
          .getElementById("generated-exam")
          ?.scrollIntoView({
            behavior: "smooth",
            block: "start"
          });
      }, 80);
    }
    catch (error) {
      setBuilderError(
        error instanceof Error
          ? error.message
          : "حدث خطأ أثناء بناء الامتحان."
      );
    }
    finally {
      setGenerateBusy(false);
    }
  }

  function rebuildSummary(
    questions:
      ExamQuestion[]
  ): ExamDraft["summary"] {
    const sections:
      Record<string, number> =
      {};

    const difficulty:
      DifficultyMap = {
        "1": 0,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0
      };

    const topics:
      Record<string, number> =
      {};

    const types:
      Record<string, number> =
      {};

    let images = 0;
    let cli = 0;
    let calculations = 0;

    for (
      const question
      of questions
    ) {
      sections[
        question.section
      ] =
        (
          sections[
            question.section
          ] ||
          0
        ) + 1;

      const difficultyKey =
        String(
          question.difficulty
        ) as
          keyof DifficultyMap;

      if (
        difficultyKey in
        difficulty
      ) {
        difficulty[
          difficultyKey
        ] += 1;
      }

      topics[
        question.topic
      ] =
        (
          topics[
            question.topic
          ] ||
          0
        ) + 1;

      types[
        question
          .presentationType
      ] =
        (
          types[
            question
              .presentationType
          ] ||
          0
        ) + 1;

      if (
        question.image
          ?.exists
      ) {
        images += 1;
      }

      if (
        question.hasCLI
      ) {
        cli += 1;
      }

      if (
        question
          .requiresCalculation
      ) {
        calculations += 1;
      }
    }

    return {
      sections,
      difficulty,
      topics,
      types,
      images,
      cli,
      calculations
    };
  }

  function updateQuestion(
    examQuestionId: string,
    updater: (question: ExamQuestion) => ExamQuestion
  ) {
    setHasUnsavedChanges(
      true
    );

    setExam(current => {
      if (!current) {
        return current;
      }

      const questions =
        current.questions.map(
          question =>
            question.examQuestionId ===
            examQuestionId
              ? updater(question)
              : question
        );

      return {
        ...current,

        updatedAt:
          new Date()
            .toISOString(),

        questions,

        summary:
          rebuildSummary(
            questions
          )
      };
    });
  }

  function toggleLock(question: ExamQuestion) {
    updateQuestion(
      question.examQuestionId,
      current => ({
        ...current,
        locked: !current.locked
      })
    );
  }

  function toggleImage(question: ExamQuestion) {
    updateQuestion(
      question.examQuestionId,
      current => ({
        ...current,
        image: {
          ...current.image,
          visible: !current.image.visible
        }
      })
    );
  }

  function changeMarks(
    question: ExamQuestion,
    marks: number
  ) {
    updateQuestion(
      question.examQuestionId,
      current => ({
        ...current,
        marks: Math.max(0, marks)
      })
    );
  }

  function changeTeacherNote(
    question: ExamQuestion,
    note: string
  ) {
    updateQuestion(
      question.examQuestionId,
      current => ({
        ...current,
        teacherNote: note
      })
    );
  }

  function changeAiInstruction(
    question: ExamQuestion,
    instruction: string
  ) {
    updateQuestion(
      question.examQuestionId,
      current => ({
        ...current,
        aiInstruction: instruction
      })
    );
  }


  function cloneQuestion(
    question: ExamQuestion
  ): ExamQuestion {
    const copy =
      JSON.parse(
        JSON.stringify(question)
      ) as ExamQuestion;

    copy.history = [];
    copy.redoStack = [];

    return copy;
  }

  function getHistory(
    question: ExamQuestion
  ): ExamQuestion[] {
    return question.history as ExamQuestion[];
  }

  function getRedoStack(
    question: ExamQuestion
  ): ExamQuestion[] {
    return question.redoStack as ExamQuestion[];
  }

  function setQuestionLoading(
    examQuestionId: string,
    value: boolean
  ) {
    setQuestionBusy(
      current => ({
        ...current,
        [examQuestionId]:
          value
      })
    );
  }

  function buildReplacementWithHistory(
    currentQuestion:
      ExamQuestion,
    replacement:
      ExamQuestion
  ): ExamQuestion {
    const history = [
      ...getHistory(
        currentQuestion
      ),

      cloneQuestion(
        currentQuestion
      )
    ].slice(-30);

    return {
      ...replacement,

      examQuestionId:
        currentQuestion
          .examQuestionId,

      marks:
        currentQuestion.marks,

      locked:
        currentQuestion.locked,

      teacherNote:
        currentQuestion
          .teacherNote,

      history,

      redoStack: []
    };
  }

  function applyQuestionReplacement(
    currentQuestion: ExamQuestion,
    replacement: ExamQuestion
  ) {
    updateQuestion(
      currentQuestion
        .examQuestionId,

      () =>
        buildReplacementWithHistory(
          currentQuestion,
          replacement
        )
    );
  }

  async function runBankQuestionAction(
    question: ExamQuestion,
    options: {
      difficulty?: number;
      presentationType?:
        ExamQuestion["presentationType"];
      topic?: string;
    } = {}
  ) {
    if (
      question.locked ||
      questionBusy[
        question.examQuestionId
      ]
    ) {
      return;
    }

    setBuilderError("");

    setQuestionLoading(
      question.examQuestionId,
      true
    );

    try {
      const usedBankQuestionIds =
        exam?.questions
          .map(
            item =>
              item.bankQuestionId
          )
          .filter(Boolean) ||
        [];

      const usedFamilyKeys =
        exam?.questions
          .map(
            item =>
              item.familyKey
          )
          .filter(Boolean) ||
        [];

      const result =
        await apiRequest<{
          ok: true;
          question: ExamQuestion;
        }>(
          "/api/question-bank-action",
          {
            method: "POST",

            body:
              JSON.stringify({
                question,
                ...options,
                usedBankQuestionIds,
                usedFamilyKeys
              })
          }
        );

      applyQuestionReplacement(
        question,
        result.question
      );
    }
    catch (error) {
      setBuilderError(
        error instanceof Error
          ? error.message
          : "Question bank action failed."
      );
    }
    finally {
      setQuestionLoading(
        question.examQuestionId,
        false
      );
    }
  }

  async function runAiQuestionAction(
    question: ExamQuestion,
    action:
      "modify" |
      "external"
  ) {
    if (
      question.locked ||
      questionBusy[
        question.examQuestionId
      ]
    ) {
      return;
    }

    const instruction =
      action === "modify"
        ? question
            .aiInstruction
            .trim()
        : "";

    if (
      action === "modify" &&
      !instruction
    ) {
      return;
    }

    setBuilderError("");

    setQuestionLoading(
      question.examQuestionId,
      true
    );

    try {
      const result =
        await apiRequest<{
          ok: true;
          question: ExamQuestion;
          provider: string;
          model: string;
        }>(
          "/api/question-ai-action",
          {
            method: "POST",

            body:
              JSON.stringify({
                action,
                question,
                instruction,
                provider:
                  aiProvider
              })
          }
        );

      applyQuestionReplacement(
        question,
        result.question
      );
    }
    catch (error) {
      setBuilderError(
        error instanceof Error
          ? error.message
          : "Question AI action failed."
      );
    }
    finally {
      setQuestionLoading(
        question.examQuestionId,
        false
      );
    }
  }


  async function convertQuestionType(
    question: ExamQuestion,
    targetType: ExamQuestion["presentationType"]
  ) {
    if (
      targetType === question.presentationType ||
      question.locked ||
      questionBusy[
        question.examQuestionId
      ]
    ) {
      return;
    }

    setBuilderError("");

    setQuestionLoading(
      question.examQuestionId,
      true
    );

    const instruction = [
      `حوّل طريقة عرض هذا السؤال فقط إلى "${typeNames[targetType]}".`,
      "ممنوع استبدال السؤال بسؤال آخر أو تغيير موضوعه أو فكرته التعليمية.",
      "حافظ قدر الإمكان على نفس نص السؤال، السيناريو، الأرقام، عناوين IP، أوامر CLI، المعطيات، والصورة.",
      "غيّر فقط ما يلزم في الصياغة والبنية حتى يصبح السؤال صالحًا للنوع المطلوب.",
      "لا تغيّر الصعوبة أو القسم أو الموضوع أو العلامة.",
      targetType === "open"
        ? "عند التحويل إلى مفتوح: أزل بدائل الاختيار فقط، وحافظ على نفس المطلوب مع نموذج إجابة صحيح."
        : "",
      targetType === "multipleChoice"
        ? "عند التحويل إلى أمريكي: أنشئ أربعة بدائل معقولة مبنية على نفس السؤال، مع بديل صحيح واحد."
        : "",
      targetType === "fillBlank"
        ? "عند التحويل إلى أكمل الناقص: أنشئ الفراغات من نفس محتوى السؤال دون إدخال موضوع جديد."
        : "",
      targetType === "wordBank"
        ? "عند التحويل إلى مخزن كلمات: أنشئ الحقول والكلمات من نفس محتوى السؤال دون إدخال موضوع جديد."
        : ""
    ]
      .filter(Boolean)
      .join("\n");

    /*
      Do not send image bytes or local history to the AI endpoint.
      The image is restored exactly after conversion.
    */
    const questionForAi: ExamQuestion = {
      ...question,
      presentationType:
        targetType,
      aiInstruction:
        "",
      image: {
        ...question.image,
        assets: []
      },
      history: [],
      redoStack: []
    };

    try {
      const result =
        await apiRequest<{
          ok: true;
          question: ExamQuestion;
          provider: string;
          model: string;
        }>(
          "/api/question-ai-action",
          {
            method: "POST",

            body:
              JSON.stringify({
                action:
                  "modify",
                question:
                  questionForAi,
                instruction,
                provider:
                  aiProvider
              })
          }
        );

      if (
        result.question
          .presentationType !==
        targetType
      ) {
        throw new Error(
          "لم يُرجع الذكاء الاصطناعي نوع السؤال المطلوب. حاول مرة أخرى."
        );
      }

      applyQuestionReplacement(
        question,
        {
          ...result.question,

          /*
            Type conversion must not replace the original
            image or change the question metadata.
          */
          section:
            question.section,
          topic:
            question.topic,
          secondaryTopics:
            question.secondaryTopics,
          difficulty:
            question.difficulty,
          difficultyLabel:
            question.difficultyLabel,
          marks:
            question.marks,
          image:
            question.image
        }
      );

      setActionNotice(
        `✓ تم تحويل السؤال إلى ${typeNames[targetType]} مع الحفاظ على نفس السؤال.`
      );
    }
    catch (error) {
      setBuilderError(
        error instanceof Error
          ? error.message
          : "تعذر تحويل نوع السؤال."
      );
    }
    finally {
      setQuestionLoading(
        question.examQuestionId,
        false
      );
    }
  }


  function undoQuestion(
    question: ExamQuestion
  ) {
    const history =
      getHistory(
        question
      );

    if (
      history.length === 0
    ) {
      return;
    }

    const previous =
      cloneQuestion(
        history[
          history.length - 1
        ]
      );

    previous.history =
      history.slice(
        0,
        -1
      );

    previous.redoStack = [
      ...getRedoStack(
        question
      ),
      cloneQuestion(
        question
      )
    ].slice(-30);

    updateQuestion(
      question.examQuestionId,
      () => previous
    );
  }

  function redoQuestion(
    question: ExamQuestion
  ) {
    const redo =
      getRedoStack(
        question
      );

    if (
      redo.length === 0
    ) {
      return;
    }

    const next =
      cloneQuestion(
        redo[
          redo.length - 1
        ]
      );

    next.history = [
      ...getHistory(
        question
      ),
      cloneQuestion(
        question
      )
    ].slice(-30);

    next.redoStack =
      redo.slice(
        0,
        -1
      );

    updateQuestion(
      question.examQuestionId,
      () => next
    );
  }

  function restoreOriginalQuestion(
    question: ExamQuestion
  ) {
    const history =
      getHistory(
        question
      );

    if (
      history.length === 0
    ) {
      return;
    }

    const original =
      cloneQuestion(
        history[0]
      );

    original.history = [];

    original.redoStack = [
      ...getRedoStack(
        question
      ),
      cloneQuestion(
        question
      )
    ].slice(-30);

    updateQuestion(
      question.examQuestionId,
      () => original
    );
  }

  function deleteQuestionImage(
    question: ExamQuestion
  ) {
    if (
      question.locked
    ) {
      return;
    }

    const history = [
      ...getHistory(
        question
      ),
      cloneQuestion(
        question
      )
    ].slice(-30);

    updateQuestion(
      question.examQuestionId,

      current => ({
        ...current,

        history,

        redoStack: [],

        image: {
          exists: false,
          visible: false,
          origin: null,
          assets: [],
          prompt: null
        }
      })
    );
  }


  function extractIpRanges(
    text: string
  ): Array<{
    start: string;
    end: string;
  }> {
    const ranges: Array<{
      start: string;
      end: string;
    }> = [];

    const regex =
      /\\b((?:\\d{1,3}\\.){3}\\d{1,3})\\s*[–—-]\\s*((?:\\d{1,3}\\.){3}\\d{1,3})\\b/g;

    let match:
      RegExpExecArray |
      null;

    while (
      (
        match =
          regex.exec(
            text
          )
      ) !== null
    ) {
      ranges.push({
        start:
          match[1],

        end:
          match[2]
      });
    }

    return ranges;
  }

  function getWordBank(
    question:
      ExamQuestion
  ): string[] {
    const values:
      string[] = [];

    if (
      Array.isArray(
        question.wordBank
      )
    ) {
      values.push(
        ...question.wordBank
      );
    }

    for (
      const field
      of question.fields ||
      []
    ) {
      for (
        const option
        of field.options ||
        []
      ) {
        const value =
          String(
            option.text ||
            option.label ||
            option.value ||
            ""
          ).trim();

        if (
          value
        ) {
          values.push(
            value
          );
        }
      }
    }

    return Array.from(
      new Set(
        values
          .map(
            value =>
              value.trim()
          )
          .filter(
            Boolean
          )
      )
    );
  }


  async function uploadQuestionImage(
    question: ExamQuestion,
    file: File
  ) {
    if (
      question.locked ||
      imageBusy[
        question.examQuestionId
      ]
    ) {
      return;
    }

    const allowedTypes =
      new Set([
        "image/png",
        "image/jpeg",
        "image/webp"
      ]);

    const contentType =
      String(
        file.type || ""
      )
        .toLowerCase();

    if (
      !allowedTypes.has(
        contentType
      )
    ) {
      const message =
        "يمكن رفع صور PNG أو JPG أو WEBP فقط.";

      setBuilderError(
        message
      );

      setImageNotice(
        current => ({
          ...current,
          [
            question.examQuestionId
          ]:
            message
        })
      );

      return;
    }

    /*
      Keep the exam JSON manageable because uploaded images
      are stored as portable data URLs inside the draft.
    */
    const maxBytes =
      3 * 1024 * 1024;

    if (
      file.size >
      maxBytes
    ) {
      const message =
        "حجم الصورة كبير جدًا. الحد الأقصى 3 MB.";

      setBuilderError(
        message
      );

      setImageNotice(
        current => ({
          ...current,
          [
            question.examQuestionId
          ]:
            message
        })
      );

      return;
    }

    setBuilderError("");

    setImageBusy(
      current => ({
        ...current,
        [
          question.examQuestionId
        ]:
          true
      })
    );

    setImageNotice(
      current => ({
        ...current,
        [
          question.examQuestionId
        ]:
          "جاري رفع الصورة من الحاسوب..."
      })
    );

    try {
      const dataUrl =
        await new Promise<string>(
          (
            resolve,
            reject
          ) => {
            const reader =
              new FileReader();

            reader.onload =
              () => {
                if (
                  typeof reader.result ===
                  "string"
                ) {
                  resolve(
                    reader.result
                  );
                }
                else {
                  reject(
                    new Error(
                      "تعذر قراءة الصورة."
                    )
                  );
                }
              };

            reader.onerror =
              () =>
                reject(
                  new Error(
                    "تعذر قراءة الصورة."
                  )
                );

            reader.readAsDataURL(
              file
            );
          }
        );

      const history = [
        ...getHistory(
          question
        ),
        cloneQuestion(
          question
        )
      ].slice(-30);

      const asset:
        QuestionImageAsset = {
          id:
            "uploaded-" +
            Date.now(),
          origin:
            "uploaded",
          contentType,
          dataUrl
        };

      updateQuestion(
        question.examQuestionId,

        current => ({
          ...current,

          history,

          redoStack: [],

          image: {
            exists: true,
            visible: true,
            origin:
              "uploaded",
            assets: [
              asset
            ],
            prompt: null
          }
        })
      );

      setImageNotice(
        current => ({
          ...current,
          [
            question.examQuestionId
          ]:
            "تم رفع الصورة من الحاسوب بنجاح."
        })
      );
    }
    catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "تعذر رفع الصورة.";

      setBuilderError(
        message
      );

      setImageNotice(
        current => ({
          ...current,
          [
            question.examQuestionId
          ]:
            message
        })
      );
    }
    finally {
      setImageBusy(
        current => ({
          ...current,
          [
            question.examQuestionId
          ]:
            false
        })
      );
    }
  }


  async function generateQuestionImage(
    question:
      ExamQuestion
  ) {
    if (
      question.locked ||
      imageBusy[
        question
          .examQuestionId
      ]
    ) {
      return;
    }

    setBuilderError("");

    setImageBusy(
      current => ({
        ...current,

        [
          question
            .examQuestionId
        ]:
          true
      })
    );

    setImageNotice(
      current => ({
        ...current,

        [
          question
            .examQuestionId
        ]:
          "جاري إنشاء الصورة... قد يستغرق ذلك عدة ثوانٍ."
      })
    );

    try {
      const result =
        await apiRequest<{
          ok: true;

          model:
            string;

          prompt:
            string;

          asset:
            QuestionImageAsset;
        }>(
          "/api/generate-question-image",

          {
            method:
              "POST",

            body:
              JSON.stringify({
                question
              })
          }
        );

      const history = [
        ...getHistory(
          question
        ),

        cloneQuestion(
          question
        )
      ].slice(-30);

      updateQuestion(
        question
          .examQuestionId,

        current => ({
          ...current,

          history,

          redoStack: [],

          image: {
            exists: true,

            visible: true,

            origin:
              "ai-generated",

            assets: [
              result.asset
            ],

            prompt:
              result.prompt
          }
        })
      );

      setImageNotice(
        current => ({
          ...current,

          [
            question
              .examQuestionId
          ]:
            "تم إنشاء الصورة بنجاح."
        })
      );
    }
    catch (error) {
      const message =
        error
        instanceof Error
          ? error.message
          : "تعذر إنشاء الصورة.";

      setImageNotice(
        current => ({
          ...current,

          [
            question
              .examQuestionId
          ]:
            "تعذر إنشاء الصورة: " +
            message
        })
      );

      setBuilderError(
        message
      );
    }
    finally {
      setImageBusy(
        current => ({
          ...current,

          [
            question
              .examQuestionId
          ]:
            false
        })
      );
    }
  }


  async function saveExamArtifact(
    kind:
      "exam" |
      "template"
  ) {
    if (
      !exam ||
      saveBusy
    ) {
      return;
    }

    setBuilderError("");

    setActionNotice("");

    setSaveBusy(
      kind
    );

    try {
      const result =
        await apiRequest<{
          ok: true;

          kind:
            string;

          blobName:
            string;

          savedAt:
            string;
        }>(
          "/api/save-exam-artifact",

          {
            method:
              "POST",

            body:
              JSON.stringify({
                kind,
                exam
              })
          }
        );

      if (
        kind ===
        "template"
      ) {
        setActionNotice(
          "✓ تم حفظ القالب بنجاح."
        );
      }
      else {
        setActionNotice(
          "✓ تم حفظ الامتحان بنجاح."
        );
      }

      console.log(
        "Saved:",
        result.blobName
      );
    }
    catch (error) {
      const message =
        error
        instanceof Error
          ? error.message
          : "تعذر الحفظ.";

      setBuilderError(
        message
      );
    }
    finally {
      setSaveBusy(
        null
      );
    }
  }

  function questionHasAnswer(
    question:
      ExamQuestion
  ) {
    if (
      !question.answer
    ) {
      return false;
    }

    return (
      Object.keys(
        question.answer
      ).length > 0
    );
  }

  function runQualityCheck() {
    if (
      !exam
    ) {
      return;
    }

    const issues:
      string[] = [];

    const currentMarks =
      exam.questions.reduce(
        (
          total,
          question
        ) =>
          total +
          Number(
            question.marks ||
            0
          ),
        0
      );

    if (
      currentMarks !==
      Number(
        exam.totalMarks
      )
    ) {
      issues.push(
        "مجموع علامات الأسئلة هو " +
        currentMarks +
        " بينما علامة الامتحان المطلوبة هي " +
        exam.totalMarks +
        "."
      );
    }

    if (
      exam.questions.length !==
      Number(
        exam.plan
          ?.totalQuestions ||
        exam.questions.length
      )
    ) {
      issues.push(
        "عدد الأسئلة الحالي لا يطابق عدد الأسئلة في الخطة."
      );
    }

    const seenBankIds =
      new Set();

    const seenFamilies =
      new Set();

    exam.questions.forEach(
      (
        question,
        index
      ) => {
        const number =
          index + 1;

        if (
          !question.text
            ?.trim()
        ) {
          issues.push(
            "السؤال " +
            number +
            " لا يحتوي على نص."
          );
        }

        if (
          Number(
            question.marks
          ) <= 0
        ) {
          issues.push(
            "السؤال " +
            number +
            " علامته صفر أو غير صالحة."
          );
        }

        if (
          !questionHasAnswer(
            question
          )
        ) {
          issues.push(
            "السؤال " +
            number +
            " لا يحتوي على نموذج إجابة."
          );
        }

        if (
          question.presentationType ===
            "multipleChoice" &&
          (
            !Array.isArray(
              question.options
            ) ||
            question.options.length <
              2
          )
        ) {
          issues.push(
            "السؤال " +
            number +
            " أمريكي ولكن عدد الخيارات غير كافٍ."
          );
        }

        if (
          (
            question.presentationType ===
              "fillBlank" ||
            question.presentationType ===
              "wordBank"
          ) &&
          (
            !Array.isArray(
              question.fields
            ) ||
            question.fields.length ===
              0
          )
        ) {
          issues.push(
            "السؤال " +
            number +
            " يحتاج حقول إجابة ولكنه لا يحتوي على حقول."
          );
        }

        if (
          question.presentationType ===
            "wordBank" &&
          (
            !Array.isArray(
              question.wordBank
            ) ||
            question.wordBank.length ===
              0
          )
        ) {
          issues.push(
            "السؤال " +
            number +
            " من نوع مخزن كلمات ولكن مخزن الكلمات فارغ."
          );
        }

        if (
          question.image
            ?.exists &&
          (
            !Array.isArray(
              question.image.assets
            ) ||
            question.image.assets.length ===
              0
          )
        ) {
          issues.push(
            "السؤال " +
            number +
            " مسجل كسؤال صورة ولكن لا توجد صورة فعلية."
          );
        }

        if (
          question.bankQuestionId
        ) {
          if (
            seenBankIds.has(
              question.bankQuestionId
            )
          ) {
            issues.push(
              "يوجد تكرار للسؤال الأصلي عند السؤال " +
              number +
              "."
            );
          }

          seenBankIds.add(
            question.bankQuestionId
          );
        }

        if (
          question.familyKey
        ) {
          if (
            seenFamilies.has(
              question.familyKey
            )
          ) {
            issues.push(
              "يوجد أكثر من سؤال من نفس العائلة عند السؤال " +
              number +
              "."
            );
          }

          seenFamilies.add(
            question.familyKey
          );
        }
      }
    );

    setQualityReport(
      issues
    );

    if (
      issues.length === 0
    ) {
      setActionNotice(
        "✓ فحص الجودة اكتمل: لم يتم العثور على مشاكل."
      );
    }
    else {
      setActionNotice(
        "⚠ فحص الجودة وجد " +
        issues.length +
        " ملاحظة."
      );
    }
  }

  function showStudentCopy() {
    if (
      !exam
    ) {
      return;
    }

    setPreviewMode(
      "student"
    );

    setAnswerVisibility(
      {}
    );

    setActionNotice(
      "أنت الآن في معاينة نسخة الطالب."
    );

    window.setTimeout(
      () => {
        document
          .getElementById(
            "generated-exam"
          )
          ?.scrollIntoView({
            behavior:
              "smooth",

            block:
              "start"
          });
      },
      40
    );
  }

  function showTeacherCopy() {
    if (
      !exam
    ) {
      return;
    }

    const allAnswers:
      Record<string, boolean> =
      {};

    for (
      const question
      of exam.questions
    ) {
      allAnswers[
        question.examQuestionId
      ] = true;
    }

    setAnswerVisibility(
      allAnswers
    );

    setPreviewMode(
      "teacher"
    );

    setActionNotice(
      "أنت الآن في معاينة نسخة المعلم مع نموذج الإجابة."
    );

    window.setTimeout(
      () => {
        document
          .getElementById(
            "generated-exam"
          )
          ?.scrollIntoView({
            behavior:
              "smooth",

            block:
              "start"
          });
      },
      40
    );
  }

  function exitPreviewMode() {
    setPreviewMode(
      "edit"
    );

    setActionNotice(
      "تم الرجوع إلى وضع تحرير الامتحان."
    );
  }


  function safeDownloadName(
    value: string
  ) {
    return String(
      value ||
      "exam"
    )
      .trim()
      .replace(
        /[<>:"/\\|?*\\u0000-\\u001F]/g,
        "-"
      )
      .replace(
        /\\s+/g,
        "-"
      )
      .replace(
        /-+/g,
        "-"
      )
      .replace(
        /^-|-$/g,
        ""
      )
      .slice(
        0,
        80
      ) || "exam";
  }

  async function blobToDataUrl(
    blob: Blob
  ): Promise<string> {
    return new Promise(
      (
        resolve,
        reject
      ) => {
        const reader =
          new FileReader();

        reader.onload =
          () => {
            resolve(
              String(
                reader.result ||
                ""
              )
            );
          };

        reader.onerror =
          () => {
            reject(
              new Error(
                "تعذر تحويل الصورة."
              )
            );
          };

        reader.readAsDataURL(
          blob
        );
      }
    );
  }

  async function imageToPortableData(
    url: string
  ): Promise<string> {
    if (
      !url
    ) {
      return "";
    }

    if (
      url.startsWith(
        "data:"
      )
    ) {
      return url;
    }

    const response =
      await fetch(
        url
      );

    if (
      !response.ok
    ) {
      throw new Error(
        "HTTP " +
        response.status
      );
    }

    return blobToDataUrl(
      await response.blob()
    );
  }

  function buildExportTable(
    question:
      ExamQuestion
  ) {
    const ranges =
      extractIpRanges(
        question.text
      );

    if (
      ranges.length < 2
    ) {
      return null;
    }

    return {
      kind:
        "ip-range-table",

      headers: [
        "الخيار",
        "بداية النطاق",
        "نهاية النطاق",
        "إجابة الطالب"
      ],

      rows:
        ranges.map(
          (
            range,
            index
          ) => [
            [
              "أ",
              "ب",
              "ج",
              "د",
              "هـ",
              "و"
            ][index] ||
              String(
                index + 1
              ),

            range.start,

            range.end,

            ""
          ]
        )
    };
  }

  async function downloadExamForAI() {
    if (
      !exam ||
      exportBusy
    ) {
      return;
    }

    const preflightIssues =
      collectFinalIssues(
        exam
      );

    if (
      preflightIssues.length >
      0
    ) {
      setQualityReport(
        preflightIssues
      );

      const continueExport =
        window.confirm(
          "وجد الفحص " +
          preflightIssues.length +
          " ملاحظة قبل التصدير.\n\n" +
          preflightIssues
            .slice(
              0,
              6
            )
            .join("\n") +
          (
            preflightIssues.length >
            6
              ? "\n..."
              : ""
          ) +
          "\n\nهل تريد التصدير رغم ذلك؟"
        );

      if (!continueExport) {
        setActionNotice(
          "تم إيقاف التصدير حتى تراجع الملاحظات."
        );

        return;
      }
    }

    setBuilderError("");

    setExportBusy(
      true
    );

    setActionNotice(
      "⏳ جارٍ تجهيز ملف AI وتنزيل الصور..."
    );

    try {
      const portableQuestions =
        [];

      for (
        let index = 0;
        index <
          exam.questions.length;
        index += 1
      ) {
        const question =
          exam.questions[
            index
          ];

        const portableImages:
          Array<{
            id: string;
            origin: string;
            contentType: string;
            dataUrl: string;
            prompt: string | null;
          }> = [];

        for (
          let imageIndex = 0;
          imageIndex <
            (
              question.image
                ?.assets ||
              []
            ).length;
          imageIndex += 1
        ) {
          const asset =
            question
              .image
              .assets[
                imageIndex
              ];

          try {
            const dataUrl =
              await imageToPortableData(
                asset.dataUrl
              );

            portableImages.push({
              id:
                asset.id ||
                "q" +
                String(
                  index + 1
                ) +
                "-img-" +
                String(
                  imageIndex +
                  1
                ),

              origin:
                asset.origin,

              contentType:
                asset.contentType ||
                "image/png",

              dataUrl,

              prompt:
                question.image
                  ?.prompt ||
                null
            });
          }
          catch {
            /*
              If embedding fails,
              keep the original
              reference as fallback.
            */

            portableImages.push({
              id:
                asset.id ||
                "q" +
                String(
                  index + 1
                ) +
                "-img-" +
                String(
                  imageIndex +
                  1
                ),

              origin:
                asset.origin,

              contentType:
                asset.contentType ||
                "image/png",

              dataUrl:
                asset.dataUrl,

              prompt:
                question.image
                  ?.prompt ||
                null
            });
          }
        }

        const cleanOptions =
          (
            question.options ||
            []
          ).map(
            (
              option,
              optionIndex
            ) => ({
              number:
                optionIndex +
                1,

              text:
                option.text ||
                option.label ||
                option.value ||
                ""
            })
          );

        const cleanFields =
          (
            question.fields ||
            []
          ).map(
            (
              field,
              fieldIndex
            ) => ({
              number:
                fieldIndex +
                1,

              label:
                field.label ||
                "حقل " +
                String(
                  fieldIndex +
                  1
                ),

              kind:
                field.kind ||
                "text"
            })
          );

        portableQuestions.push({
          number:
            index + 1,

          marks:
            Number(
              question.marks ||
              0
            ),

          section:
            question.section,

          topic:
            question.topic,

          secondaryTopics:
            question
              .secondaryTopics ||
            [],

          difficulty:
            question.difficulty,

          difficultyLabel:
            difficultyNames[
              question.difficulty
            ] ||
            "Level " +
            question.difficulty,

          type:
            question
              .presentationType,

          hasCLI:
            question.hasCLI,

          requiresCalculation:
            question
              .requiresCalculation,

          text:
            question.text,

          textHtml:
            question.textHtml ||
            "",

          options:
            cleanOptions,

          fields:
            cleanFields,

          wordBank:
            getWordBank(
              question
            ),

          table:
            buildExportTable(
              question
            ),

          images:
            portableImages,

          answer:
            question.answer
        });
      }

      const answerKey =
        portableQuestions.map(
          question => ({
            questionNumber:
              question.number,

            marks:
              question.marks,

            answer:
              question.answer
          })
        );

      const exportDocument =
        {
          format:
            "ExamBank-AI-Export",

          version:
            1,

          exportedAt:
            new Date()
              .toISOString(),

          source:
            "ExamBank 791381",

          purpose:
            "Create a polished printable exam PDF with a separate teacher answer key.",

          document: {
            language:
              "ar",

            direction:
              "rtl",

            paperSize:
              "A4",

            title:
              exam.title,

            examId:
              exam.examId,

            totalMarks:
              exam.totalMarks,

            questionCount:
              exam.questions.length,

            metadata:
              exam.metadata ||
              defaultExamMetadata()
          },

          instructionsForAI: [
            "أنشئ مستند امتحان احترافيًا وجاهزًا للطباعة بصيغة PDF وحجم A4.",
            "لغة الامتحان العربية واتجاه الكتابة من اليمين إلى اليسار RTL.",
            "استخدم بيانات metadata في رأس الامتحان: المدرسة، الموضوع، الصف، الشعبة، المعلم، التاريخ، المدة والفصل الدراسي.",
            "أضف في رأس نسخة الطالب خانة فارغة لاسم الطالب وخانة لرقم الهوية.",
            "لا تغير نص الأسئلة أو القيم أو الخيارات أو الإجابات الصحيحة.",
            "صحح التنسيق فقط ولا تغير المحتوى العلمي.",
            "حافظ على المصطلحات التقنية الإنجليزية وعناوين IP وCLI كما هي.",
            "حوّل المعطيات التي تناسب الجداول إلى جداول واضحة ومنظمة.",
            "ضع كل قيمة في خلية مستقلة واترك خانات مناسبة لإجابة الطالب.",
            "في أسئلة مخزن الكلمات اعرض مخزن الكلمات في صندوق واضح ثم الفراغات تحته.",
            "في الاختيار من متعدد رتّب الخيارات بوضوح وبمسافات مريحة.",
            "استخدم الصور المرفقة مع السؤال نفسه ولا تنقل صورة إلى سؤال آخر.",
            "لا تكشف الإجابات في نسخة الطالب.",
            "أنشئ أولًا نسخة الطالب كاملة بدون الحلول.",
            "بعد انتهاء نسخة الطالب أنشئ قسمًا منفصلًا بعنوان نموذج الإجابة للمعلم.",
            "في نموذج الإجابة اذكر رقم السؤال والإجابة الصحيحة والعلامة.",
            "اجعل التصميم أكاديميًا بسيطًا وأنيقًا ومناسبًا لمدرسة ثانوية.",
            "لا تضف أسئلة جديدة ولا تحذف أي سؤال."
          ],

          originalRequest:
            exam.originalRequest,

          plan:
            exam.plan,

          studentExam: {
            title:
              exam.title,

            totalMarks:
              exam.totalMarks,

            metadata:
              exam.metadata ||
              defaultExamMetadata(),

            questions:
              portableQuestions.map(
                question => {
                  const {
                    answer,
                    ...studentQuestion
                  } =
                    question;

                  return studentQuestion;
                }
              )
          },

          answerKey,

          fullQuestions:
            portableQuestions
        };

      const json =
        JSON.stringify(
          exportDocument,
          null,
          2
        );

      const blob =
        new Blob(
          [
            json
          ],
          {
            type:
              "application/json;charset=utf-8"
          }
        );

      const url =
        URL.createObjectURL(
          blob
        );

      const anchor =
        document.createElement(
          "a"
        );

      const date =
        new Date()
          .toISOString()
          .slice(
            0,
            10
          );

      anchor.href =
        url;

      anchor.download =
        safeDownloadName(
          exam.title
        ) +
        "-" +
        date +
        ".ai-exam.json";

      document.body.appendChild(
        anchor
      );

      anchor.click();

      anchor.remove();

      URL.revokeObjectURL(
        url
      );

      setActionNotice(
        "✓ تم تنزيل ملف ExamBank AI Export إلى الحاسوب."
      );
    }
    catch (error) {
      const message =
        error
        instanceof Error
          ? error.message
          : "تعذر تجهيز ملف AI.";

      setBuilderError(
        message
      );

      setActionNotice(
        "⚠ تعذر تنزيل ملف AI."
      );
    }
    finally {
      setExportBusy(
        false
      );
    }
  }

  async function loadSavedExams() {
    setSavedExamsBusy(
      true
    );

    setBuilderError("");

    try {
      const result =
        await apiRequest<{
          ok: true;

          exams:
            SavedExamListItem[];
        }>(
          "/api/saved-exams",
          {
            method:
              "GET"
          }
        );

      setSavedExams(
        result.exams ||
        []
      );
    }
    catch (error) {
      setBuilderError(
        error
        instanceof Error
          ? error.message
          : "تعذر قراءة الامتحانات المحفوظة."
      );
    }
    finally {
      setSavedExamsBusy(
        false
      );
    }
  }

  async function toggleSavedExams() {
    if (
      savedExamsOpen
    ) {
      setSavedExamsOpen(
        false
      );

      return;
    }

    setSavedExamsOpen(
      true
    );

    await loadSavedExams();
  }

  async function openSavedExam(
    item:
      SavedExamListItem
  ) {
    setSavedExamsBusy(
      true
    );

    setBuilderError("");

    try {
      const result =
        await apiRequest<{
          ok: true;

          exam:
            ExamDraft;

          savedAt?:
            string;
        }>(
          "/api/saved-exams",
          {
            method:
              "POST",

            body:
              JSON.stringify({
                action:
                  "load",

                blobName:
                  item.blobName
              })
          }
        );

      const loadedExam =
        result.exam;

      setExam(
        loadedExam
      );

      setPlan(
        loadedExam.plan ||
        null
      );

      setExamPrompt(
        loadedExam
          .originalRequest ||
        loadedExam.plan
          ?.originalRequest ||
        ""
      );

      setPreviewMode(
        "edit"
      );

      setAnswerVisibility(
        {}
      );

      setQualityReport(
        null
      );

      setSavedExamsOpen(
        false
      );

      setActionNotice(
        "✓ تم فتح الامتحان المحفوظ ويمكنك متابعة تعديله."
      );

      window.setTimeout(
        () => {
          document
            .getElementById(
              "generated-exam"
            )
            ?.scrollIntoView({
              behavior:
                "smooth",

              block:
                "start"
            });
        },
        80
      );
    }
    catch (error) {
      setBuilderError(
        error
        instanceof Error
          ? error.message
          : "تعذر فتح الامتحان."
      );
    }
    finally {
      setSavedExamsBusy(
        false
      );
    }
  }

  async function deleteSavedExam(
    item:
      SavedExamListItem
  ) {
    const confirmed =
      window.confirm(
        "هل تريد حذف الامتحان المحفوظ:\n" +
        item.title +
        "؟"
      );

    if (
      !confirmed
    ) {
      return;
    }

    setSavedExamsBusy(
      true
    );

    setBuilderError("");

    try {
      await apiRequest<{
        ok: true;
        deleted:
          boolean;
      }>(
        "/api/saved-exams",
        {
          method:
            "POST",

          body:
            JSON.stringify({
              action:
                "delete",

              blobName:
                item.blobName
            })
        }
      );

      setSavedExams(
        current =>
          current.filter(
            saved =>
              saved.blobName !==
              item.blobName
          )
      );

      setActionNotice(
        "✓ تم حذف الامتحان المحفوظ."
      );
    }
    catch (error) {
      setBuilderError(
        error
        instanceof Error
          ? error.message
          : "تعذر حذف الامتحان."
      );
    }
    finally {
      setSavedExamsBusy(
        false
      );
    }
  }


  function updateExamMetadata(
    field:
      keyof ExamMetadata,
    value:
      string
  ) {
    setHasUnsavedChanges(
      true
    );

    setExam(current => {
      if (!current) {
        return current;
      }

      return {
        ...current,

        updatedAt:
          new Date()
            .toISOString(),

        metadata: {
          ...defaultExamMetadata(),
          ...(
            current.metadata ||
            {}
          ),

          [field]:
            value
        }
      };
    });
  }

  function scrollToQuestion(
    examQuestionId:
      string
  ) {
    document
      .getElementById(
        "question-" +
        examQuestionId
      )
      ?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
  }

  function moveQuestion(
    index:
      number,
    direction:
      -1 | 1
  ) {
    setHasUnsavedChanges(
      true
    );

    setExam(current => {
      if (!current) {
        return current;
      }

      const target =
        index + direction;

      if (
        target < 0 ||
        target >=
          current
            .questions
            .length
      ) {
        return current;
      }

      const questions = [
        ...current.questions
      ];

      const temp =
        questions[index];

      questions[index] =
        questions[target];

      questions[target] =
        temp;

      return {
        ...current,

        updatedAt:
          new Date()
            .toISOString(),

        questions,

        summary:
          rebuildSummary(
            questions
          )
      };
    });
  }

  function duplicateQuestion(
    question:
      ExamQuestion,
    index:
      number
  ) {
    setHasUnsavedChanges(
      true
    );

    setExam(current => {
      if (!current) {
        return current;
      }

      const copy =
        cloneQuestion(
          question
        );

      copy.examQuestionId =
        question.examQuestionId +
        "-copy-" +
        Date.now();

      copy.locked =
        false;

      copy.teacherNote =
        question.teacherNote
          ? question.teacherNote +
            " (نسخة)"
          : "نسخة من السؤال " +
            String(
              index + 1
            );

      const questions = [
        ...current.questions
      ];

      questions.splice(
        index + 1,
        0,
        copy
      );

      return {
        ...current,

        updatedAt:
          new Date()
            .toISOString(),

        questions,

        summary:
          rebuildSummary(
            questions
          )
      };
    });
  }

  function deleteExamQuestion(
    question:
      ExamQuestion,
    index:
      number
  ) {
    const confirmed =
      window.confirm(
        "هل تريد حذف السؤال " +
        String(
          index + 1
        ) +
        " من الامتحان؟"
      );

    if (!confirmed) {
      return;
    }

    setHasUnsavedChanges(
      true
    );

    setExam(current => {
      if (!current) {
        return current;
      }

      const questions =
        current.questions.filter(
          item =>
            item.examQuestionId !==
            question.examQuestionId
        );

      return {
        ...current,

        updatedAt:
          new Date()
            .toISOString(),

        questions,

        summary:
          rebuildSummary(
            questions
          )
      };
    });
  }

  function autoDistributeMarks() {
    if (
      !exam ||
      exam.questions.length ===
      0
    ) {
      return;
    }

    const mode =
      window.prompt(
        "اختر طريقة التوزيع:\n1 = متساوٍ\n2 = حسب الصعوبة",
        "2"
      );

    if (
      mode !== "1" &&
      mode !== "2"
    ) {
      return;
    }

    const target =
      Math.max(
        1,
        Math.round(
          Number(
            exam.totalMarks ||
            100
          )
        )
      );

    const weights =
      exam.questions.map(
        question =>
          mode === "1"
            ? 1
            : Math.max(
                1,
                Number(
                  question.difficulty ||
                  1
                )
              )
      );

    const totalWeight =
      weights.reduce(
        (
          sum,
          value
        ) =>
          sum + value,
        0
      );

    const exact =
      weights.map(
        weight =>
          (
            weight /
            totalWeight
          ) *
          target
      );

    const marks =
      exact.map(
        value =>
          Math.floor(
            value
          )
      );

    let remainder =
      target -
      marks.reduce(
        (
          sum,
          value
        ) =>
          sum + value,
        0
      );

    exact
      .map(
        (
          value,
          index
        ) => ({
          index,

          fraction:
            value -
            Math.floor(
              value
            )
        })
      )
      .sort(
        (
          a,
          b
        ) =>
          b.fraction -
          a.fraction
      )
      .forEach(
        item => {
          if (
            remainder >
            0
          ) {
            marks[
              item.index
            ] += 1;

            remainder -= 1;
          }
        }
      );

    setExam(current => {
      if (!current) {
        return current;
      }

      const questions =
        current.questions.map(
          (
            question,
            index
          ) => ({
            ...question,

            marks:
              marks[index]
          })
        );

      return {
        ...current,

        updatedAt:
          new Date()
            .toISOString(),

        questions,

        summary:
          rebuildSummary(
            questions
          )
      };
    });

    setHasUnsavedChanges(
      true
    );

    setActionNotice(
      mode === "1"
        ? "✓ تم توزيع العلامات بالتساوي."
        : "✓ تم توزيع العلامات حسب الصعوبة."
    );
  }

  function makeRecoveryExam(
    source:
      ExamDraft
  ): ExamDraft {
    const copy =
      JSON.parse(
        JSON.stringify(
          source
        )
      ) as ExamDraft;

    for (
      const question
      of copy.questions
    ) {
      question.history = [];
      question.redoStack = [];

      if (
        question.image
          ?.assets
      ) {
        question.image.assets =
          question.image.assets
            .filter(asset => {
              const value =
                String(
                  asset.dataUrl ||
                  ""
                );

              return !(
                value.startsWith(
                  "data:"
                ) &&
                value.length >
                  300000
              );
            });

        if (
          question.image
            .assets.length ===
          0
        ) {
          question.image.exists =
            false;

          question.image.visible =
            false;
        }
      }
    }

    return copy;
  }

  function restoreRecoveryDraft() {
    try {
      const raw =
        localStorage.getItem(
          RECOVERY_KEY
        );

      if (!raw) {
        setRecoveryAvailable(
          false
        );

        return;
      }

      const payload =
        JSON.parse(
          raw
        ) as {
          exam:
            ExamDraft;
          plan:
            ExamPlan | null;
          examPrompt:
            string;
        };

      if (!payload.exam) {
        throw new Error(
          "Recovery draft is invalid."
        );
      }

      setExam(
        payload.exam
      );

      setPlan(
        payload.plan ||
        payload.exam.plan ||
        null
      );

      setExamPrompt(
        payload.examPrompt ||
        payload.exam
          .originalRequest ||
        ""
      );

      setPreviewMode(
        "edit"
      );

      setHasUnsavedChanges(
        true
      );

      setRecoveryAvailable(
        false
      );

      setActionNotice(
        "✓ تم استعادة المسودة المحلية. الصور الكبيرة المولدة بالذكاء الاصطناعي قد تحتاج إلى إعادة إنشاء."
      );
    }
    catch (error) {
      setBuilderError(
        error
        instanceof Error
          ? error.message
          : "تعذر استعادة المسودة."
      );
    }
  }

  function discardRecoveryDraft() {
    try {
      localStorage.removeItem(
        RECOVERY_KEY
      );
    }
    catch {
      // Ignore local storage errors.
    }

    setRecoveryAvailable(
      false
    );
  }

  async function saveExamAsCopy() {
    if (
      !exam ||
      saveBusy
    ) {
      return;
    }

    const now =
      new Date()
        .toISOString();

    const copy:
      ExamDraft = {
        ...JSON.parse(
          JSON.stringify(
            exam
          )
        ) as ExamDraft,

        examId:
          "EXAM-" +
          Date.now(),

        title:
          exam.title +
          " - نسخة",

        createdAt:
          now,

        updatedAt:
          now
      };

    setSaveBusy(
      "exam"
    );

    setBuilderError("");

    try {
      const result =
        await apiRequest<{
          ok: true;
          savedAt:
            string;
          blobName:
            string;
        }>(
          "/api/save-exam-artifact",

          {
            method:
              "POST",

            body:
              JSON.stringify({
                kind:
                  "exam",

                exam:
                  copy
              })
          }
        );

      setExam(
        copy
      );

      setHasUnsavedChanges(
        false
      );

      setLastCloudSaveAt(
        result.savedAt ||
        now
      );

      try {
        localStorage.removeItem(
          RECOVERY_KEY
        );
      }
      catch {
        // Ignore.
      }

      setRecoveryAvailable(
        false
      );

      setActionNotice(
        "✓ تم حفظ نسخة جديدة، وأنت الآن تعمل على النسخة الجديدة."
      );

      if (
        savedExamsOpen
      ) {
        await loadSavedExams();
      }
    }
    catch (error) {
      setBuilderError(
        error
        instanceof Error
          ? error.message
          : "تعذر حفظ نسخة جديدة."
      );
    }
    finally {
      setSaveBusy(
        null
      );
    }
  }

  function collectFinalIssues(
    sourceExam:
      ExamDraft
  ): string[] {
    const issues:
      string[] = [];

    const marks =
      sourceExam.questions.reduce(
        (
          sum,
          question
        ) =>
          sum +
          Number(
            question.marks ||
            0
          ),
        0
      );

    if (
      marks !==
      Number(
        sourceExam.totalMarks
      )
    ) {
      issues.push(
        "مجموع العلامات الحالي " +
        marks +
        " وليس " +
        sourceExam.totalMarks +
        "."
      );
    }

    sourceExam.questions
      .forEach(
        (
          question,
          index
        ) => {
          const number =
            index + 1;

          if (
            !question.text
              ?.trim()
          ) {
            issues.push(
              "السؤال " +
              number +
              " بلا نص."
            );
          }

          if (
            !questionHasAnswer(
              question
            )
          ) {
            issues.push(
              "السؤال " +
              number +
              " بلا نموذج إجابة."
            );
          }

          if (
            question
              .presentationType ===
              "wordBank" &&
            getWordBank(
              question
            ).length ===
              0
          ) {
            issues.push(
              "السؤال " +
              number +
              " مخزن كلمات بلا كلمات."
            );
          }

          if (
            imageBusy[
              question
                .examQuestionId
            ]
          ) {
            issues.push(
              "صورة السؤال " +
              number +
              " ما زالت قيد الإنشاء."
            );
          }
        }
      );

    return issues;
  }

  async function loadTemplates() {
    setTemplatesBusy(
      true
    );

    setBuilderError("");

    try {
      const result =
        await apiRequest<{
          ok: true;

          templates:
            SavedTemplateListItem[];
        }>(
          "/api/templates",

          {
            method:
              "GET"
          }
        );

      setTemplates(
        result.templates ||
        []
      );
    }
    catch (error) {
      setBuilderError(
        error
        instanceof Error
          ? error.message
          : "تعذر قراءة القوالب."
      );
    }
    finally {
      setTemplatesBusy(
        false
      );
    }
  }

  async function toggleTemplates() {
    if (
      templatesOpen
    ) {
      setTemplatesOpen(
        false
      );

      return;
    }

    setTemplatesOpen(
      true
    );

    await loadTemplates();
  }

  async function useTemplate(
    item:
      SavedTemplateListItem
  ) {
    if (
      templatesBusy ||
      generateBusy
    ) {
      return;
    }

    setTemplatesBusy(
      true
    );

    setBuilderError("");

    try {
      const loaded =
        await apiRequest<{
          ok: true;

          template: {
            title:
              string;
            originalRequest:
              string;
            plan:
              ExamPlan;
            metadata?:
              ExamMetadata;
          };
        }>(
          "/api/templates",

          {
            method:
              "POST",

            body:
              JSON.stringify({
                action:
                  "load",

                blobName:
                  item.blobName
              })
          }
        );

      const template =
        loaded.template;

      if (!template.plan) {
        throw new Error(
          "القالب لا يحتوي على خطة امتحان."
        );
      }

      const generated =
        await apiRequest<{
          ok: true;
          exam:
            ExamDraft;
        }>(
          "/api/generate-exam",

          {
            method:
              "POST",

            body:
              JSON.stringify({
                plan:
                  template.plan
              })
          }
        );

      const freshExam = {
        ...generated.exam,

        metadata: {
          ...defaultExamMetadata(),
          ...(
            template.metadata ||
            {}
          )
        }
      };

      setPlan(
        template.plan
      );

      setExamPrompt(
        template
          .originalRequest ||
        template.plan
          .originalRequest ||
        ""
      );

      setExam(
        freshExam
      );

      setTemplatesOpen(
        false
      );

      setPreviewMode(
        "edit"
      );

      setHasUnsavedChanges(
        true
      );

      setActionNotice(
        "✓ تم إنشاء امتحان جديد من القالب."
      );
    }
    catch (error) {
      setBuilderError(
        error
        instanceof Error
          ? error.message
          : "تعذر استخدام القالب."
      );
    }
    finally {
      setTemplatesBusy(
        false
      );
    }
  }

  async function deleteTemplate(
    item:
      SavedTemplateListItem
  ) {
    const confirmed =
      window.confirm(
        "هل تريد حذف القالب:\n" +
        item.title +
        "؟"
      );

    if (!confirmed) {
      return;
    }

    setTemplatesBusy(
      true
    );

    try {
      await apiRequest<{
        ok: true;
        deleted:
          boolean;
      }>(
        "/api/templates",

        {
          method:
            "POST",

          body:
            JSON.stringify({
              action:
                "delete",

              blobName:
                item.blobName
            })
        }
      );

      setTemplates(
        current =>
          current.filter(
            template =>
              template.blobName !==
              item.blobName
          )
      );

      setActionNotice(
        "✓ تم حذف القالب."
      );
    }
    catch (error) {
      setBuilderError(
        error
        instanceof Error
          ? error.message
          : "تعذر حذف القالب."
      );
    }
    finally {
      setTemplatesBusy(
        false
      );
    }
  }

  async function applyGlobalAiInstruction() {
    if (
      !exam ||
      !globalInstruction
        .trim() ||
      globalAiBusy
    ) {
      return;
    }

    setGlobalAiBusy(
      true
    );

    setBuilderError("");

    setActionNotice(
      "⏳ الذكاء الاصطناعي يحلل التعليمات العامة..."
    );

    try {
      const analysis =
        await apiRequest<{
          ok: true;
          summary:
            string;
          operations:
            GlobalAiOperation[];
          provider:
            string;
          model:
            string;
        }>(
          "/api/analyze-global-exam-instruction",

          {
            method:
              "POST",

            body:
              JSON.stringify({
                instruction:
                  globalInstruction
                    .trim(),

                exam,

                provider:
                  aiProvider
              })
          }
        );

      const operations =
        analysis.operations ||
        [];

      if (
        operations.length ===
        0
      ) {
        setActionNotice(
          "لم يجد الذكاء الاصطناعي تغييرات ضرورية لتنفيذها."
        );

        return;
      }

      const confirmed =
        window.confirm(
          (
            analysis.summary ||
            "سيتم تعديل الامتحان."
          ) +
          "\n\nعدد العمليات: " +
          operations.length +
          "\n\nمتابعة؟"
        );

      if (!confirmed) {
        setActionNotice(
          "تم إلغاء تطبيق التعليمات العامة."
        );

        return;
      }

      let nextQuestions =
        exam.questions.map(
          question =>
            question
        );

      const usedIds =
        new Set(
          nextQuestions
            .map(
              question =>
                question
                  .bankQuestionId
            )
            .filter(
              Boolean
            )
            .map(String)
        );

      const usedFamilies =
        new Set(
          nextQuestions
            .map(
              question =>
                question.familyKey
            )
            .filter(
              Boolean
            )
            .map(String)
        );

      for (
        let operationIndex = 0;
        operationIndex <
          operations.length;
        operationIndex += 1
      ) {
        const operation =
          operations[
            operationIndex
          ];

        const index =
          nextQuestions.findIndex(
            question =>
              question.examQuestionId ===
              operation
                .examQuestionId
          );

        if (index < 0) {
          continue;
        }

        const currentQuestion =
          nextQuestions[index];

        if (
          currentQuestion.locked
        ) {
          continue;
        }

        setActionNotice(
          "⏳ تنفيذ التغيير " +
          String(
            operationIndex +
            1
          ) +
          " من " +
          String(
            operations.length
          ) +
          "..."
        );

        if (
          operation.action ===
          "replace"
        ) {
          const result =
            await apiRequest<{
              ok: true;
              question:
                ExamQuestion;
            }>(
              "/api/question-bank-action",

              {
                method:
                  "POST",

                body:
                  JSON.stringify({
                    question:
                      currentQuestion,

                    difficulty:
                      operation
                        .targetDifficulty ||
                      undefined,

                    presentationType:
                      operation
                        .targetType ||
                      undefined,

                    topic:
                      operation
                        .targetTopic ||
                      undefined,

                    usedBankQuestionIds:
                      Array.from(
                        usedIds
                      ),

                    usedFamilyKeys:
                      Array.from(
                        usedFamilies
                      )
                  })
              }
            );

          const replacement =
            buildReplacementWithHistory(
              currentQuestion,
              result.question
            );

          nextQuestions[index] =
            replacement;

          if (
            replacement
              .bankQuestionId
          ) {
            usedIds.add(
              String(
                replacement
                  .bankQuestionId
              )
            );
          }

          if (
            replacement
              .familyKey
          ) {
            usedFamilies.add(
              String(
                replacement
                  .familyKey
              )
            );
          }
        }
        else {
          const result =
            await apiRequest<{
              ok: true;
              question:
                ExamQuestion;
            }>(
              "/api/question-ai-action",

              {
                method:
                  "POST",

                body:
                  JSON.stringify({
                    action:
                      "modify",

                    question:
                      currentQuestion,

                    instruction:
                      operation
                        .instruction ||
                      globalInstruction
                        .trim(),

                    provider:
                      aiProvider
                  })
              }
            );

          nextQuestions[index] =
            buildReplacementWithHistory(
              currentQuestion,
              result.question
            );
        }
      }

      setExam(current => {
        if (!current) {
          return current;
        }

        return {
          ...current,

          updatedAt:
            new Date()
              .toISOString(),

          questions:
            nextQuestions,

          summary:
            rebuildSummary(
              nextQuestions
            )
        };
      });

      setHasUnsavedChanges(
        true
      );

      setGlobalInstruction(
        ""
      );

      setActionNotice(
        "✓ تم تطبيق التعليمات العامة على " +
        operations.length +
        " عملية. الأسئلة المثبتة لم تتغير."
      );
    }
    catch (error) {
      setBuilderError(
        error
        instanceof Error
          ? error.message
          : "تعذر تطبيق التعليمات العامة."
      );
    }
    finally {
      setGlobalAiBusy(
        false
      );
    }
  }

  function renderAnswer(answer: Record<string, unknown>) {
    return (
      <pre className="answer-box">
        {JSON.stringify(answer, null, 2)}
      </pre>
    );
  }

  if (!loggedIn) {
    return (
      <main className="auth" dir="rtl">
        <section className="auth-brand">
          <svg className="auth-net" viewBox="0 0 400 300" aria-hidden="true" focusable="false">
            <g fill="none" stroke="#fff" strokeWidth="1">
              <path d="M40 60 L160 110 L120 220 L280 190 L340 90" />
              <path d="M160 110 L280 190" />
              <path d="M120 220 L40 260" />
            </g>
            <g fill="#fff">
              <circle cx="40" cy="60" r="4" />
              <circle cx="160" cy="110" r="5" />
              <circle cx="120" cy="220" r="4" />
              <circle cx="280" cy="190" r="5" />
              <circle cx="340" cy="90" r="4" />
              <circle cx="40" cy="260" r="4" />
            </g>
          </svg>

          <div className="auth-brand-top">
            <div className="auth-logo brand-mark">EB</div>
            <div className="auth-logo-text">
              ExamBank
              <small>791381</small>
            </div>
          </div>

          <div className="auth-hero">
            <h2>منصة الامتحانات والتدريب الذكي لشبكات الاتصال</h2>
          </div>

          <div className="auth-features login-role-note">
            <span className="auth-feature">
              👨‍🏫 معلم
            </span>

            <span className="auth-feature">
              👨‍🎓 طالب
            </span>
          </div>
        </section>

        <div className="auth-form-wrap">
          <section className="auth-card login-card">
            <h1 className="auth-welcome">ExamBank 791381</h1>
            <p className="auth-sub subtitle">
              منصة الامتحانات والتدريب الذكي لشبكات الاتصال
            </p>

            <form className="auth-form" onSubmit={handleLogin}>
              <label className="auth-field">
                <span>كود المستخدم</span>
                <div className="auth-input">
                  <IconUser size={18} />
                  <input
                    type="text"
                    value={userCode}
                    onChange={event =>
                      setUserCode(event.target.value)
                    }
                    placeholder="أدخل كود المستخدم"
                    autoComplete="username"
                  />
                </div>
              </label>

              <label className="auth-field">
                <span>كلمة المرور</span>
                <div className="auth-input">
                  <IconLock size={18} />
                  <input
                    type="password"
                    value={password}
                    onChange={event =>
                      setPassword(event.target.value)
                    }
                    placeholder="أدخل كلمة المرور"
                    autoComplete="current-password"
                  />
                </div>
              </label>

              {loginError && (
                <div className="auth-error error-message">
                  <IconWarning size={16} />
                  {loginError}
                </div>
              )}

              <button
                type="submit"
                className="auth-submit primary-button"
                disabled={loginBusy}
              >
                {loginBusy ? "جارٍ الدخول..." : "دخول"}
              </button>
            </form>

            <p className="auth-note login-note">
              نفس شاشة الدخول للمعلم والطالب
            </p>
          </section>
        </div>
      </main>
    );
  }

  if (
    sessionRole ===
    "student"
  ) {
    return (
      <StudentPortal
        token={token}
        displayName={
          sessionDisplayName
        }
        onLogout={
          handleLogout
        }
      />
    );
  }

  return (
    <main className="builder-page app-shell" dir="rtl">
      <aside className="app-sidebar" aria-label="التنقل الرئيسي">
        <div className="app-sidebar-brand">
          <span className="app-sidebar-logo">EB</span>
          <span className="app-sidebar-brand-text">
            ExamBank
            <small>791381</small>
          </span>
        </div>

        <nav className="app-sidebar-nav">
          <button
            className={"app-sidebar-link " + (teacherView === "builder" ? "active" : "")}
            onClick={() => setTeacherView("builder")}
          >
            <IconBuilder size={20} />
            <span>باني الامتحان</span>
          </button>

          <button
            className={"app-sidebar-link " + (teacherView === "platform" && workspaceTab === "dashboard" ? "active" : "")}
            onClick={() => goToWorkspace("dashboard")}
          >
            <IconDashboard size={20} />
            <span>لوحة المتابعة</span>
          </button>

          <button
            className={"app-sidebar-link " + (teacherView === "platform" && workspaceTab === "students" ? "active" : "")}
            onClick={() => goToWorkspace("students")}
          >
            <IconStudents size={20} />
            <span>الصفوف والطلاب</span>
          </button>

          <button
            className={"app-sidebar-link " + (teacherView === "platform" && workspaceTab === "assignments" ? "active" : "")}
            onClick={() => goToWorkspace("assignments")}
          >
            <IconAssignments size={20} />
            <span>الواجبات</span>
          </button>
        </nav>

        <div className="app-sidebar-user">
          <span className="app-sidebar-user-name">
            <IconUser size={16} />
            <span>{sessionDisplayName || "المعلم"}</span>
          </span>
          <button className="app-sidebar-logout logout-button" onClick={handleLogout}>
            <IconLogout size={18} />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </aside>

      <div className="app-shell-main">
      <header className="top-bar app-content-header">
        <div>
          <h1>ExamBank 791381</h1>
          <p>
            اكتب ما تريد، وسيبقى بناء الامتحان وتعديله كله في هذه الصفحة
          </p>
        </div>
      </header>

      {teacherView ===
        "platform" && (
        <TeacherPlatform
          token={token}
          currentExam={exam}
          workspaceTab={workspaceTab}
        />
      )}

      {teacherView ===
        "builder" && (
      <section className="builder-content">
        <details className="builder-setup-zone" open={!exam}>
          <summary>
            <IconSparkles size={16} />
            <span>إعداد الامتحان — الذكاء الاصطناعي، الامتحانات المحفوظة، القوالب</span>
            <IconChevronDown size={14} className="details-chevron" />
          </summary>
          <div className="builder-setup-body">
        <div className="builder-card prompt-card">
          <div className="builder-heading">
            <span className="ai-badge">AI</span>
            <div>
              <h2>ماذا تريد في الامتحان؟</h2>
              <p>
                اكتب طلبك بحرية. الذكاء الاصطناعي يحلل المطلوب،
                ثم يختار النظام الأسئلة من المخزن المصنف.
              </p>
            </div>
          </div>

          <textarea
            value={examPrompt}
            onChange={event =>
              setExamPrompt(event.target.value)
            }
            placeholder="مثال: أنشئ امتحانًا من 20 سؤالًا، 12 BASIC و8 INFRASTRUCTURE، ركز على IPv4 وDHCP وOSPF، واجعل معظم الأسئلة سهلة ومتوسطة، وأضف سؤالين صور وسؤالين CLI..."
          />

          <div className="builder-actions">
            <span className="helper-text">
              لن يتم تأليف أسئلة جديدة إلا عندما تختار أنت «بناء سؤال خارجي» لاحقًا.
            </span>

            <div className="model-and-generate">
              <label className="model-picker">
                <span>&#1575;&#1604;&#1605;&#1608;&#1583;&#1610;&#1604;</span>
                <select
                  value={aiProvider}
                  onChange={event =>
                    setAiProvider(
                      event.target.value as
                        | "glm" | "qwen" | "qwenplus" | "openai"
                    )
                  }
                  disabled={generateBusy}
                >
                  <option value="glm">
                    GLM-5.3-Flash &mdash; &#1575;&#1601;&#1578;&#1585;&#1575;&#1590;&#1610;
                  </option>
                  <option value="qwen">
                    Qwen3.5-Flash
                  </option>
                  <option value="qwenplus">
                    Qwen3.7-Plus
                  </option>
                  <option value="openai">
                    OpenAI GPT-5.6 Luna
                  </option>
                </select>
              </label>

              <button
              className="generate-button"
              onClick={handleAnalyzeRequest}
              disabled={!examPrompt.trim() || analyzeBusy}
            >
              {analyzeBusy
                ? "جارٍ تحليل الطلب والبحث عن الأسئلة..."
                : "تحليل الطلب والبحث عن الأسئلة"}
            </button>
            </div>
          </div>
        </div>

        {plan && (
          <div id="exam-availability-panel" className="builder-card exam-availability-card">
            <div className="builder-heading">
              <div>
                <h2>الأسئلة المتاحة لهذا الطلب</h2>
                <p>
                  راجع الفلاتر أدناه قبل إنشاء الامتحان. الأسئلة لن تتوسع تلقائيًا خارج المواضيع
                  التي تختارها.
                </p>
              </div>
            </div>

            <div className="availability-summary">
              <span>
                المطلوب: <strong>{plan.requestedQuestionCount}</strong>
              </span>
              <span>
                المعتمد:{" "}
                <input
                  type="number"
                  min={1}
                  max={40}
                  value={manualQuestionCount}
                  onChange={event =>
                    setManualQuestionCount(
                      Math.min(40, Math.max(1, Number(event.target.value) || 1))
                    )
                  }
                />{" "}
                / 40
              </span>
              <span>
                الحد الأقصى: <strong>40</strong>
              </span>
              <span>
                المتوفر حاليًا:{" "}
                <strong>{availabilityBusy ? "…" : availability?.availableCount ?? "—"}</strong>
              </span>
            </div>

            {plan.requestedQuestionCount > 40 && (
              <p className="platform-notice">
                لقد طلبت {plan.requestedQuestionCount} سؤالًا. الحد الأقصى المسموح به هو 40
                سؤالًا، لذلك سيتم اعتماد 40 سؤالًا فقط (أو العدد الذي تحدده أعلاه).
              </p>
            )}

            <div className="availability-filters">
              <fieldset>
                <legend>المواضيع</legend>
                {topicsCatalog.map(topic => (
                  <label key={topic.code} className="availability-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedTopics.includes(topic.code)}
                      onChange={() => toggleTopic(topic.code)}
                    />
                    {topic.name}
                    {" "}
                    <span className="availability-facet-count">
                      (
                      {availability?.topicFacets.find(f => f.topic === topic.code)?.count ?? 0}
                      )
                    </span>
                  </label>
                ))}
              </fieldset>

              <fieldset>
                <legend>الصعوبة</legend>
                {[1, 2, 3, 4, 5].map(level => (
                  <label key={level} className="availability-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedDifficulties.includes(level)}
                      onChange={() => toggleDifficulty(level)}
                    />
                    {difficultyNames[level] || `Level ${level}`}
                  </label>
                ))}
              </fieldset>

              <fieldset>
                <legend>نوع السؤال</legend>
                {(Object.keys(typeNames) as Array<keyof typeof typeNames>).map(type => (
                  <label key={type} className="availability-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedTypes.includes(type)}
                      onChange={() => toggleType(type)}
                    />
                    {typeNames[type]}
                  </label>
                ))}
              </fieldset>
            </div>

            <div className="builder-actions">
              <button onClick={handlePreviewQuestions} disabled={previewBusy}>
                {previewBusy ? "⏳ جارٍ التحميل..." : "معاينة الأسئلة المطابقة"}
              </button>

              <button
                className="generate-button"
                onClick={handleCreateExam}
                disabled={
                  generateBusy ||
                  availabilityBusy ||
                  !availability ||
                  availability.availableCount < manualQuestionCount
                }
              >
                {generateBusy ? "جارٍ إنشاء الامتحان..." : "إنشاء الامتحان"}
              </button>
            </div>

            {topicsCatalog.length > 0 && selectedTopics.length === 0 && (
              <p className="platform-error">
                اختر موضوعًا واحدًا على الأقل لعرض الأسئلة المتاحة وتفعيل زر الإنشاء.
              </p>
            )}

            {selectedTopics.length > 0 &&
              availability &&
              availability.availableCount < manualQuestionCount && (
              <p className="platform-error">
                المتوفر ({availability.availableCount}) أقل من المعتمد ({manualQuestionCount}).
                عدّل الفلاتر أو قلّل عدد الأسئلة المطلوب أعلاه.
              </p>
            )}

            {availability?.preview && (
              <div className="availability-preview-list">
                {availability.preview.map(item => (
                  <article key={item.id} className="availability-preview-item">
                    <QuestionTextBlock text={item.text} />
                    <small>
                      {topicsCatalog.find(t => t.code === item.topic)?.name || item.topic}
                      {" · "}
                      {difficultyNames[item.difficulty] || `Level ${item.difficulty}`}
                      {" · "}
                      {typeNames[item.type as keyof typeof typeNames] || item.type}
                    </small>
                  </article>
                ))}
                {!availability.preview.length && (
                  <p className="platform-notice">لا توجد أسئلة مطابقة للفلاتر الحالية.</p>
                )}
              </div>
            )}
          </div>
        )}

        {recoveryAvailable && (
          <div className="recovery-draft-bar">
            <div>
              <strong>
                ↻ توجد مسودة محلية غير محفوظة
              </strong>

              <span>
                يمكنك استعادتها إذا أغلقت الصفحة أو حدث تحديث للمتصفح.
              </span>
            </div>

            <div>
              <button
                className="recovery-restore"
                onClick={
                  restoreRecoveryDraft
                }
              >
                استعادة
              </button>

              <button
                className="recovery-discard"
                onClick={
                  discardRecoveryDraft
                }
              >
                تجاهل
              </button>
            </div>
          </div>
        )}

        <div className="saved-exams-access">
          <button
            onClick={
              toggleSavedExams
            }
            disabled={
              savedExamsBusy
            }
          >
            {savedExamsBusy
              ? "⏳ جارٍ تحميل المحفوظة..."
              : savedExamsOpen
                ? "✕ إغلاق الامتحانات المحفوظة"
                : "📚 الامتحانات المحفوظة"}
          </button>

          <button
            onClick={
              toggleTemplates
            }
            disabled={
              templatesBusy
            }
          >
            {templatesBusy
              ? "⏳ جارٍ تحميل القوالب..."
              : templatesOpen
                ? "✕ إغلاق القوالب"
                : "🗂 القوالب"}
          </button>

          <span>
            افتح امتحانًا محفوظًا أو استخدم قالبًا لبناء امتحان جديد من نفس الصفحة.
          </span>
        </div>

        {savedExamsOpen && (
          <section className="saved-exams-panel">
            <div className="saved-exams-heading">
              <div>
                <span className="eyebrow">
                  Azure Storage
                </span>

                <h3>
                  الامتحانات المحفوظة
                </h3>
              </div>

              <button
                onClick={
                  loadSavedExams
                }
                disabled={
                  savedExamsBusy
                }
              >
                ↻ تحديث
              </button>
            </div>

            {savedExamsBusy ? (
              <div className="saved-exams-empty">
                ⏳ جارٍ تحميل الامتحانات...
              </div>
            ) : savedExams.length === 0 ? (
              <div className="saved-exams-empty">
                لا توجد امتحانات محفوظة حتى الآن.
              </div>
            ) : (
              <div className="saved-exams-list">
                {savedExams.map(
                  item => (
                    <article
                      className="saved-exam-item"
                      key={
                        item.blobName
                      }
                    >
                      <div className="saved-exam-main">
                        <strong>
                          {item.title}
                        </strong>

                        <span>
                          {item.questionCount} سؤال
                          {" · "}
                          {item.totalMarks} علامة
                        </span>

                        <small>
                          آخر حفظ:{" "}
                          {item.savedAt
                            ? new Date(
                                item.savedAt
                              ).toLocaleString(
                                "ar"
                              )
                            : "غير معروف"}
                        </small>
                      </div>

                      <div className="saved-exam-actions">
                        <button
                          className="saved-open-button"
                          onClick={() =>
                            openSavedExam(
                              item
                            )
                          }
                        >
                          فتح وتعديل
                        </button>

                        <button
                          className="saved-delete-button"
                          onClick={() =>
                            deleteSavedExam(
                              item
                            )
                          }
                        >
                          حذف
                        </button>
                      </div>
                    </article>
                  )
                )}
              </div>
            )}
          </section>
        )}

        {templatesOpen && (
          <section className="templates-panel">
            <div className="saved-exams-heading">
              <div>
                <span className="eyebrow">
                  Exam Templates
                </span>

                <h3>
                  القوالب المحفوظة
                </h3>
              </div>

              <button
                onClick={
                  loadTemplates
                }
                disabled={
                  templatesBusy
                }
              >
                ↻ تحديث
              </button>
            </div>

            {templatesBusy ? (
              <div className="saved-exams-empty">
                ⏳ جارٍ تحميل القوالب...
              </div>
            ) : templates.length === 0 ? (
              <div className="saved-exams-empty">
                لا توجد قوالب محفوظة حتى الآن.
              </div>
            ) : (
              <div className="saved-exams-list">
                {templates.map(
                  item => (
                    <article
                      className="saved-exam-item"
                      key={
                        item.blobName
                      }
                    >
                      <div className="saved-exam-main">
                        <strong>
                          {item.title}
                        </strong>

                        <span>
                          {item.totalQuestions} سؤال
                          {" · "}
                          {item.totalMarks} علامة
                        </span>

                        <small>
                          الحفظ:{" "}
                          {item.savedAt
                            ? new Date(
                                item.savedAt
                              ).toLocaleString(
                                "ar"
                              )
                            : "غير معروف"}
                        </small>
                      </div>

                      <div className="saved-exam-actions">
                        <button
                          className="saved-open-button"
                          onClick={() =>
                            useTemplate(
                              item
                            )
                          }
                        >
                          استخدام القالب
                        </button>

                        <button
                          className="saved-delete-button"
                          onClick={() =>
                            deleteTemplate(
                              item
                            )
                          }
                        >
                          حذف
                        </button>
                      </div>
                    </article>
                  )
                )}
              </div>
            )}
          </section>
        )}
          </div>
        </details>

        {builderError && (
          <div className="builder-error">
            {builderError}
          </div>
        )}

        {plan && (
          <section className="plan-card">
            <div className="section-title-row">
              <div>
                <span className="eyebrow">فهم الذكاء الاصطناعي</span>
                <h3>{plan.title}</h3>
              </div>
              <span className="status-chip success-chip">
                تم تحليل الطلب
              </span>
            </div>

            <p className="plan-explanation">
              {plan.explanation}
            </p>
            {plan.aiModel && (
              <div className="active-model-line">
                <span className="info-chip model-chip">
                  AI: {
                    plan.aiProvider === "glm"
                      ? "GLM"
                      : plan.aiProvider === "qwen"
                        ? "Qwen 3.5 Flash"
                        : plan.aiProvider === "qwenplus"
                          ? "Qwen 3.7 Plus"
                          : "OpenAI"
                  } - {plan.aiModel}
                </span>
              </div>
            )}

            <div className="stat-grid">
              <div className="stat-box">
                <strong>{plan.totalQuestions}</strong>
                <span>سؤالًا</span>
              </div>
              <div className="stat-box">
                <strong>{plan.totalMarks}</strong>
                <span>علامة</span>
              </div>
              <div className="stat-box">
                <strong>{plan.sectionTargets.BASIC}</strong>
                <span>BASIC</span>
              </div>
              <div className="stat-box">
                <strong>{plan.sectionTargets.INFRASTRUCTURE}</strong>
                <span>INFRASTRUCTURE</span>
              </div>
            </div>

            <div className="chips-row">
              {Object.entries(plan.difficultyTargets).map(
                ([level, count]) => (
                  <span className="info-chip" key={level}>
                    {difficultyNames[Number(level)]}: {count}
                  </span>
                )
              )}

              {plan.topicTargets.map(item => (
                <span
                  className="info-chip topic-chip"
                  key={item.topic}
                >
                  {item.topic}: {item.count}
                </span>
              ))}
            </div>
          </section>
        )}

        {exam && (
          <section
            className={
              "generated-exam preview-" +
              previewMode
            }
            id="generated-exam"
          >
            {previewMode !== "edit" && (
              <div className="preview-mode-bar">
                <div>
                  <strong>
                    {previewMode === "student"
                      ? "👨‍🎓 نسخة الطالب"
                      : "👨‍🏫 نسخة المعلم"}
                  </strong>

                  <span>
                    {previewMode === "student"
                      ? "هذه هي النسخة النظيفة التي يراها الطالب."
                      : "نسخة المعلم مع نموذج الإجابة."}
                  </span>
                </div>

                <div className="preview-mode-actions">
                  <button
                    onClick={exitPreviewMode}
                  >
                    العودة للتحرير
                  </button>

                  <button
                    className="preview-download-button"
                    onClick={
                      downloadExamForAI
                    }
                    disabled={
                      exportBusy
                    }
                  >
                    {exportBusy
                      ? "⏳ جارٍ تجهيز ملف AI..."
                      : "⬇️ تنزيل للـ AI"}
                  </button>
                </div>
              </div>
            )}

            <div className="exam-preview-heading">
              <div>
                <span>
                  معاينة الامتحان
                </span>

                <strong>
                  نسخة العمل الخاصة بالمعلم
                </strong>
              </div>

              <small>
                عدّل الأسئلة من الأدوات أسفل كل سؤال
              </small>
            </div>

            <div className="builder-workspace">
            <aside className="builder-side">
            <div className="exam-toolbar-card">
              <div className="section-title-row">
                <div>
                  <span className="eyebrow">مسودة الامتحان</span>
                  <h2>{exam.title}</h2>
                  <p className="exam-id">{exam.examId}</p>
                </div>

                <div className="exam-total">
                  <strong>{totalCurrentMarks}</strong>
                  <span>/ {exam.totalMarks} علامة</span>
                </div>
              </div>

              <div className="stat-grid compact-grid">
                <div className="stat-box">
                  <strong>{exam.questions.length}</strong>
                  <span>الأسئلة</span>
                </div>
                <div className="stat-box">
                  <strong>{exam.summary.sections.BASIC || 0}</strong>
                  <span>BASIC</span>
                </div>
                <div className="stat-box">
                  <strong>
                    {exam.summary.sections.INFRASTRUCTURE || 0}
                  </strong>
                  <span>INFRASTRUCTURE</span>
                </div>
                <div className="stat-box">
                  <strong>{exam.summary.images}</strong>
                  <span>صور</span>
                </div>
              </div>

              {exam.warnings.length > 0 && (
                <div className="warning-panel">
                  <strong>ملاحظات على المطابقة:</strong>
                  <ul>
                    {exam.warnings.map((warning, index) => (
                      <li key={`${warning}-${index}`}>
                        {warning}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="global-ai-box">
                <label>
                  تعليمات للامتحان كاملًا
                  <textarea
                    value={globalInstruction}
                    onChange={event =>
                      setGlobalInstruction(event.target.value)
                    }
                    placeholder="مثال: اجعل الامتحان أسهل قليلًا، ولا تغيّر الأسئلة المقفلة، واستبدل سؤالين DHCP بسؤالين VLAN..."
                  />
                </label>

                <button
                  className="secondary-primary-button"
                  onClick={applyGlobalAiInstruction}
                  disabled={
                    !globalInstruction.trim() ||
                    globalAiBusy
                  }
                >
                  {globalAiBusy
                    ? "⏳ جارٍ تحليل وتنفيذ التغييرات..."
                    : "🤖 تطبيق على الامتحان بالذكاء الاصطناعي"}
                </button>
              </div>
            </div>

            <div className="save-status-line">
              <span
                className={
                  hasUnsavedChanges
                    ? "save-dot unsaved"
                    : "save-dot saved"
                }
              />

              <strong>
                {hasUnsavedChanges
                  ? "تغييرات غير محفوظة"
                  : "محفوظ"}
              </strong>

              {lastCloudSaveAt && (
                <small>
                  آخر حفظ سحابي:{" "}
                  {new Date(
                    lastCloudSaveAt
                  ).toLocaleString(
                    "ar"
                  )}
                </small>
              )}

              {recoveryAvailable &&
                hasUnsavedChanges && (
                  <small>
                    · توجد نسخة استرجاع محلية
                  </small>
                )}
            </div>

            <details
              className="exam-metadata-card"
            >
              <summary>
                📝 بيانات ورأس الامتحان
              </summary>

              <div className="exam-metadata-grid">
                <label>
                  اسم المدرسة
                  <input
                    value={
                      exam.metadata
                        ?.school ||
                      ""
                    }
                    onChange={event =>
                      updateExamMetadata(
                        "school",
                        event.target.value
                      )
                    }
                    placeholder="مثال: المدرسة الثانوية"
                  />
                </label>

                <label>
                  الموضوع
                  <input
                    value={
                      exam.metadata
                        ?.subject ||
                      "شبكات الاتصال"
                    }
                    onChange={event =>
                      updateExamMetadata(
                        "subject",
                        event.target.value
                      )
                    }
                  />
                </label>

                <label>
                  الصف
                  <input
                    value={
                      exam.metadata
                        ?.grade ||
                      ""
                    }
                    onChange={event =>
                      updateExamMetadata(
                        "grade",
                        event.target.value
                      )
                    }
                    placeholder="مثال: العاشر"
                  />
                </label>

                <label>
                  الشعبة
                  <input
                    value={
                      exam.metadata
                        ?.className ||
                      ""
                    }
                    onChange={event =>
                      updateExamMetadata(
                        "className",
                        event.target.value
                      )
                    }
                  />
                </label>

                <label>
                  اسم المعلم
                  <input
                    value={
                      exam.metadata
                        ?.teacherName ||
                      ""
                    }
                    onChange={event =>
                      updateExamMetadata(
                        "teacherName",
                        event.target.value
                      )
                    }
                  />
                </label>

                <label>
                  التاريخ
                  <input
                    type="date"
                    value={
                      exam.metadata
                        ?.date ||
                      ""
                    }
                    onChange={event =>
                      updateExamMetadata(
                        "date",
                        event.target.value
                      )
                    }
                  />
                </label>

                <label>
                  مدة الامتحان
                  <input
                    value={
                      exam.metadata
                        ?.duration ||
                      ""
                    }
                    onChange={event =>
                      updateExamMetadata(
                        "duration",
                        event.target.value
                      )
                    }
                    placeholder="مثال: 90 دقيقة"
                  />
                </label>

                <label>
                  الفصل الدراسي
                  <input
                    value={
                      exam.metadata
                        ?.semester ||
                      ""
                    }
                    onChange={event =>
                      updateExamMetadata(
                        "semester",
                        event.target.value
                      )
                    }
                  />
                </label>

                <label className="metadata-full">
                  تعليمات عامة للطلاب
                  <textarea
                    value={
                      exam.metadata
                        ?.generalInstructions ||
                      defaultExamMetadata()
                        .generalInstructions
                    }
                    onChange={event =>
                      updateExamMetadata(
                        "generalInstructions",
                        event.target.value
                      )
                    }
                  />
                </label>
              </div>
            </details>

            <nav className="question-jump-bar builder-navigator">
              <div className="builder-navigator-head">
                <strong>
                  الانتقال إلى سؤال
                </strong>
                <span className="builder-navigator-count">
                  {exam.questions.length}
                </span>
              </div>

              <div className="builder-navigator-grid">
                {exam.questions.map(
                  (
                    question,
                    index
                  ) => (
                    <button
                      className="builder-navigator-item"
                      key={
                        "jump-" +
                        question.examQuestionId
                      }
                      onClick={() =>
                        scrollToQuestion(
                          question
                            .examQuestionId
                        )
                      }
                      title={
                        "السؤال " +
                        String(
                          index + 1
                        ) +
                        (
                          question.locked
                            ? " · مثبت"
                            : ""
                        )
                      }
                    >
                      <span className="builder-navigator-number">
                        {index + 1}
                      </span>

                      <span className="builder-navigator-meta">
                        <span className="builder-navigator-difficulty">
                          {difficultyNames[question.difficulty] || question.difficulty}
                        </span>
                        <span className="builder-navigator-marks">
                          {question.marks}
                        </span>
                      </span>

                      <span className="builder-navigator-badges">
                        {question.locked && (
                          <IconLock size={11} />
                        )}

                        {question.image
                          ?.exists && (
                          <IconImage size={11} />
                        )}

                        {question.origin ===
                          "ai-generated" && (
                          <IconSparkles size={11} />
                        )}
                      </span>
                    </button>
                  )
                )}
              </div>
            </nav>
            </aside>

            <div className="builder-main">
            <div className="questions-list">
              {exam.questions.map((question, index) => {
                const answerShown =
                  answerVisibility[question.examQuestionId] === true;

                return (
                  <article
                    id={"question-" + question.examQuestionId}
                    className={`question-card difficulty-${question.difficulty} ${
                      question.locked ? "question-locked" : ""
                    }`}
                    key={question.examQuestionId}
                  >
                  <div className="question-header">
                    <div className="question-top-row">
                      <div className="question-number">
                        السؤال {index + 1}
                      </div>

                      <div className="question-top-actions">
                        <div className="question-order-actions">
                          <button
                            title="نقل للأعلى"
                            onClick={() =>
                              moveQuestion(
                                index,
                                -1
                              )
                            }
                            disabled={
                              index === 0
                            }
                          >
                            ↑
                          </button>

                          <button
                            title="نقل للأسفل"
                            onClick={() =>
                              moveQuestion(
                                index,
                                1
                              )
                            }
                            disabled={
                              index ===
                              exam.questions.length -
                                1
                            }
                          >
                            ↓
                          </button>

                          <button
                            title="نسخ السؤال"
                            onClick={() =>
                              duplicateQuestion(
                                question,
                                index
                              )
                            }
                          >
                            ⧉
                          </button>

                          <button
                            className="question-delete-mini"
                            title="حذف السؤال"
                            onClick={() =>
                              deleteExamQuestion(
                                question,
                                index
                              )
                            }
                          >
                            🗑
                          </button>
                        </div>

                        <label className="marks-field">
                          العلامة
                          <input
                            type="number"
                            min="0"
                            value={question.marks}
                            onChange={event =>
                              changeMarks(
                                question,
                                Number(event.target.value)
                              )
                            }
                          />
                        </label>

                        <button
                          className={`lock-button ${
                            question.locked ? "active" : ""
                          }`}
                          onClick={() => toggleLock(question)}
                        >
                          {question.locked
                            ? "🔒 مثبت"
                            : "🔓 تثبيت"}
                        </button>
                      </div>
                    </div>
                    <div className="question-header-badges">
                      <span className="question-type-badge">
                        {typeNames[question.presentationType]}
                      </span>
                      <span className="question-difficulty-badge">
                        {difficultyNames[question.difficulty] || question.difficulty}
                      </span>
                    </div>
                  </div>

                    <div className="question-meta">
                      <span>{question.section}</span>
                      <span>{question.topic}</span>
                      <span>
                        {difficultyNames[question.difficulty] ||
                          `Level ${question.difficulty}`}
                      </span>
                      <span>{typeNames[question.presentationType]}</span>
                      <span>
                        {question.origin === "bank"
                          ? `المصدر: ${question.sourceId}`
                          : "✨ سؤال خارجي"}
                      </span>
                    </div>

                    <div className="question-content">
                    <div className="question-text-panel">
                      <div className="question-text">
                        <QuestionTextBlock text={question.text} />
                      </div>
                    </div>

                    {extractIpRanges(
                      question.text
                    ).length >= 2 && (
                      <div className="structured-data-block">
                        <div className="structured-data-title">
                          المعطيات مرتبة
                        </div>

                        <div className="exam-table-wrap">
                          <table className="exam-data-table">
                            <thead>
                              <tr>
                                <th>
                                  الخيار
                                </th>

                                <th>
                                  بداية النطاق
                                </th>

                                <th>
                                  نهاية النطاق
                                </th>

                                <th>
                                  إجابة الطالب
                                </th>
                              </tr>
                            </thead>

                            <tbody>
                              {extractIpRanges(
                                question.text
                              ).map(
                                (
                                  row,
                                  rowIndex
                                ) => (
                                  <tr
                                    key={
                                      question.examQuestionId +
                                      "-range-" +
                                      rowIndex
                                    }
                                  >
                                    <td className="choice-letter">
                                      {
                                        [
                                          "أ",
                                          "ب",
                                          "ج",
                                          "د",
                                          "هـ",
                                          "و"
                                        ][
                                          rowIndex
                                        ] ||
                                        rowIndex +
                                          1
                                      }
                                    </td>

                                    <td dir="ltr">
                                      {row.start}
                                    </td>

                                    <td dir="ltr">
                                      {row.end}
                                    </td>

                                    <td className="student-answer-cell">
                                      <span className="answer-square" />
                                    </td>
                                  </tr>
                                )
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {getWordBank(
                      question
                    ).length > 0 && (
                      <div className="word-bank-box">
                        <div className="word-bank-title">
                          مخزن الكلمات
                        </div>

                        <div className="word-bank-items">
                          {getWordBank(
                            question
                          ).map(
                            (
                              word,
                              wordIndex
                            ) => (
                              <span
                                key={
                                  question.examQuestionId +
                                  "-word-" +
                                  wordIndex
                                }
                              >
                                {word}
                              </span>
                            )
                          )}
                        </div>
                      </div>
                    )}

                    {question.options.length > 0 && (
                      <ol className="question-options">
                        {question.options.map((option, optionIndex) => (
                          <li key={`${question.examQuestionId}-o-${optionIndex}`}>
                            {option.text || option.value || ""}
                          </li>
                        ))}
                      </ol>
                    )}

                    {question.fields.length > 0 && (
                      <div className="question-fields-preview">
                        {question.fields.map((field, fieldIndex) => (
                          <div
                            className="field-preview"
                            key={`${question.examQuestionId}-f-${fieldIndex}`}
                          >
                            <span>
                              {field.label || `حقل ${fieldIndex + 1}`}
                            </span>
                            <div className="blank-line" />
                          </div>
                        ))}
                      </div>
                    )}

                    <div
                      className={`question-image-slot ${
                        question.image.exists && question.image.visible
                          ? "image-visible"
                          : ""
                      }`}
                    >
                      {question.image.exists && question.image.visible ? (
                        <>
                          {question.image.assets.map((asset, assetIndex) => (
                            <img
                              key={`${question.examQuestionId}-img-${assetIndex}`}
                              src={asset.dataUrl}
                              alt={`صورة توضيحية للسؤال ${index + 1}`}
                            />
                          ))}

                          <div className="image-controls">
                            <button onClick={() => toggleImage(question)}>
                              إخفاء الصورة
                            </button>
                            <input
                              id={`question-image-upload-${question.examQuestionId}`}
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              hidden
                              onChange={event => {
                                const file =
                                  event.currentTarget.files?.[0];

                                if (file) {
                                  void uploadQuestionImage(
                                    question,
                                    file
                                  );
                                }

                                event.currentTarget.value = "";
                              }}
                              disabled={
                                question.locked ||
                                Boolean(
                                  imageBusy[
                                    question.examQuestionId
                                  ]
                                )
                              }
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const input =
                                  document.getElementById(
                                    `question-image-upload-${question.examQuestionId}`
                                  ) as HTMLInputElement | null;

                                input?.click();
                              }}
                              disabled={
                                question.locked ||
                                Boolean(
                                  imageBusy[
                                    question.examQuestionId
                                  ]
                                )
                              }
                            >
                              ⬆ رفع صورة
                            </button>
                            <button
                              className={
                                imageBusy[
                                  question.examQuestionId
                                ]
                                  ? "image-generate-button is-loading"
                                  : "image-generate-button"
                              }
                              onClick={() =>
                                generateQuestionImage(
                                  question
                                )
                              }
                              disabled={
                                question.locked ||
                                Boolean(
                                  imageBusy[
                                    question.examQuestionId
                                  ]
                                )
                              }
                            >
                              {imageBusy[
                                question.examQuestionId
                              ]
                                ? "جاري إنشاء الصورة..."
                                : "إعادة بناء الصورة"}
                            </button>
                            <button onClick={() =>
                              deleteQuestionImage(
                                question
                              )
                            }
                            disabled={
                              question.locked
                            }>
                              حذف الصورة
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="hidden-image-placeholder">
                          <span>🖼</span>
                          <strong>صورة السؤال مخفية / غير موجودة</strong>
                          <p>
                            يمكن للذكاء الاصطناعي إنشاء صورة توضيحية ملائمة لهذا السؤال.
                          </p>

                          {imageNotice[
                            question.examQuestionId
                          ] && (
                            <div
                              className={
                                imageBusy[
                                  question.examQuestionId
                                ]
                                  ? "image-status-line is-working"
                                  : "image-status-line"
                              }
                            >
                              {imageBusy[
                                question.examQuestionId
                              ] && (
                                <span className="mini-spinner" />
                              )}

                              <span>
                                {
                                  imageNotice[
                                    question.examQuestionId
                                  ]
                                }
                              </span>
                            </div>
                          )}
                          <div className="image-controls">
                            {question.image.exists && (
                              <button onClick={() => toggleImage(question)}>
                                إظهار الصورة
                              </button>
                            )}
                            <input
                              id={`question-image-upload-${question.examQuestionId}`}
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              hidden
                              onChange={event => {
                                const file =
                                  event.currentTarget.files?.[0];

                                if (file) {
                                  void uploadQuestionImage(
                                    question,
                                    file
                                  );
                                }

                                event.currentTarget.value = "";
                              }}
                              disabled={
                                question.locked ||
                                Boolean(
                                  imageBusy[
                                    question.examQuestionId
                                  ]
                                )
                              }
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const input =
                                  document.getElementById(
                                    `question-image-upload-${question.examQuestionId}`
                                  ) as HTMLInputElement | null;

                                input?.click();
                              }}
                              disabled={
                                question.locked ||
                                Boolean(
                                  imageBusy[
                                    question.examQuestionId
                                  ]
                                )
                              }
                            >
                              ⬆ رفع صورة
                            </button>
                            <button
                              className={
                                imageBusy[
                                  question.examQuestionId
                                ]
                                  ? "image-generate-button is-loading"
                                  : "image-generate-button"
                              }
                              onClick={() =>
                                generateQuestionImage(
                                  question
                                )
                              }
                              disabled={
                                question.locked ||
                                Boolean(
                                  imageBusy[
                                    question.examQuestionId
                                  ]
                                )
                              }
                            >
                              {imageBusy[
                                question.examQuestionId
                              ]
                                ? "جاري إنشاء الصورة..."
                                : "إنشاء صورة بالذكاء الاصطناعي"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    </div>

                    <details className="question-advanced-tools">
                      <summary>
                        <IconChevronDown size={14} className="details-chevron" />
                        <span>أدوات متقدمة</span>
                      </summary>
                      <div className="question-advanced-body">
                    <div className="question-action-bar">
                      <button onClick={() =>
                          runBankQuestionAction(
                            question
                          )
                        }
                        disabled={
                          question.locked ||
                          Boolean(
                            questionBusy[
                              question.examQuestionId
                            ]
                          )
                        }>
                        🔄 تغيير السؤال
                      </button>

                      <label className="select-action">
                        🎚 الصعوبة
                        <select
                          value={question.difficulty}
                          onChange={event =>
                            runBankQuestionAction(
                              question,
                              {
                                difficulty:
                                  Number(
                                    event.target.value
                                  )
                              }
                            )
                          }
                          disabled={
                            question.locked ||
                            Boolean(
                              questionBusy[
                                question.examQuestionId
                              ]
                            )
                          }
                        >
                          <option value={1}>Easy</option>
                          <option value={2}>Easy-Medium</option>
                          <option value={3}>Medium</option>
                          <option value={4}>Harder</option>
                          <option value={5}>Advanced</option>
                        </select>
                      </label>

                      <label className="select-action">
                        🧩 النوع
                        <select
                          value={question.presentationType}
                          onChange={event =>
                            convertQuestionType(
                              question,
                              event.target.value as
                                ExamQuestion["presentationType"]
                            )
                          }
                          disabled={
                            question.locked ||
                            Boolean(
                              questionBusy[
                                question.examQuestionId
                              ]
                            )
                          }
                        >
                          <option value="multipleChoice">أمريكي</option>
                          <option value="fillBlank">أكمل الناقص</option>
                          <option value="wordBank">مخزن كلمات</option>
                          <option value="open">مفتوح</option>
                        </select>
                      </label>

                      <button onClick={() =>
                          runAiQuestionAction(
                            question,
                            "external"
                          )
                        }
                        disabled={
                          question.locked ||
                          Boolean(
                            questionBusy[
                              question.examQuestionId
                            ]
                          )
                        }>
                        ✨ بناء سؤال خارجي
                      </button>

                      <button
                        onClick={() =>
                          generateQuestionImage(
                            question
                          )
                        }
                        disabled={
                          question.locked ||
                          Boolean(
                            imageBusy[
                              question.examQuestionId
                            ]
                          )
                        }
                      >
                        {imageBusy[
                          question.examQuestionId
                        ]
                          ? "⏳ جاري إنشاء الصورة..."
                          : "🖼 إنشاء / تغيير صورة"}
                      </button>
                    </div>

                    <div className="per-question-ai">
                      <label>
                        ✍ تعليمات خاصة لهذا السؤال
                        <textarea
                          value={question.aiInstruction}
                          onChange={event =>
                            changeAiInstruction(
                              question,
                              event.target.value
                            )
                          }
                          placeholder="مثال: اجعل السؤال أسهل، غيّر الأرقام وحافظ على الفكرة، حوّله إلى سيناريو عملي، أو أنشئ له رسمة توضيحية..."
                        />
                      </label>

                      <button
                        className="secondary-primary-button"
                        onClick={() =>
                          runAiQuestionAction(
                            question,
                            "modify"
                          )
                        }
                        disabled={
                          !question.aiInstruction.trim() ||
                          question.locked ||
                          Boolean(
                            questionBusy[
                              question.examQuestionId
                            ]
                          )
                        }
                      >
                        🤖 تطبيق التعديل
                      </button>
                    </div>

                    <details className="teacher-note-panel">
                      <summary>ملاحظة خاصة للمعلم</summary>
                      <textarea
                        value={question.teacherNote}
                        onChange={event =>
                          changeTeacherNote(
                            question,
                            event.target.value
                          )
                        }
                        placeholder="هذه الملاحظة لا تظهر في نسخة الطالب."
                      />
                    </details>

                    <div className="question-footer-actions">
                      <button
                        onClick={() =>
                          setAnswerVisibility(current => ({
                            ...current,
                            [question.examQuestionId]: !answerShown
                          }))
                        }
                      >
                        👁 {answerShown ? "إخفاء الإجابة" : "نموذج الإجابة"}
                      </button>
                      <button onClick={() =>
                          undoQuestion(
                            question
                          )
                        }
                        disabled={
                          getHistory(
                            question
                          ).length === 0
                        }>↩ تراجع</button>
                      <button onClick={() =>
                          redoQuestion(
                            question
                          )
                        }
                        disabled={
                          getRedoStack(
                            question
                          ).length === 0
                        }>↪ إعادة</button>
                      <button onClick={() =>
                          restoreOriginalQuestion(
                            question
                          )
                        }
                        disabled={
                          getHistory(
                            question
                          ).length === 0
                        }>↩ الرجوع للأصل</button>
                    </div>

                    {answerShown && renderAnswer(question.answer)}
                      </div>
                    </details>
                  </article>
                );
              })}
            </div>

            {qualityReport !== null && (
              <div
                className={
                  qualityReport.length === 0
                    ? "quality-report quality-good"
                    : "quality-report quality-warning"
                }
              >
                <div className="quality-report-heading">
                  <strong>
                    {qualityReport.length === 0
                      ? "✓ الامتحان جاهز"
                      : "⚠ تقرير فحص الجودة"}
                  </strong>

                  <button
                    onClick={() =>
                      setQualityReport(null)
                    }
                  >
                    ×
                  </button>
                </div>

                {qualityReport.length === 0 ? (
                  <p>
                    لم يتم العثور على مشاكل أساسية في الامتحان.
                  </p>
                ) : (
                  <ul>
                    {qualityReport.map(
                      (
                        issue,
                        index
                      ) => (
                        <li
                          key={
                            "quality-" +
                            index
                          }
                        >
                          {issue}
                        </li>
                      )
                    )}
                  </ul>
                )}
              </div>
            )}

            {actionNotice && (
              <div className="bottom-action-notice">
                {actionNotice}
              </div>
            )}

            <div className="bottom-actions-card">
              <button
                onClick={() =>
                  saveExamArtifact(
                    "exam"
                  )
                }
                disabled={
                  saveBusy !== null
                }
              >
                {saveBusy === "exam"
                  ? "⏳ جارٍ الحفظ..."
                  : "💾 حفظ الامتحان"}
              </button>

              <button
                onClick={
                  saveExamAsCopy
                }
                disabled={
                  saveBusy !== null
                }
              >
                💾 حفظ نسخة جديدة
              </button>

              <button
                onClick={() =>
                  saveExamArtifact(
                    "template"
                  )
                }
                disabled={
                  saveBusy !== null
                }
              >
                {saveBusy === "template"
                  ? "⏳ جارٍ حفظ القالب..."
                  : "📋 حفظ كقالب"}
              </button>

              <button
                onClick={
                  runQualityCheck
                }
              >
                ✅ فحص جودة الامتحان
              </button>

              <button
                onClick={
                  autoDistributeMarks
                }
              >
                ⚖️ توزيع العلامات
              </button>

              <button
                onClick={
                  showStudentCopy
                }
              >
                👨‍🎓 نسخة الطالب
              </button>

              <button
                onClick={
                  showTeacherCopy
                }
              >
                👨‍🏫 نسخة المعلم
              </button>

              <button
                className="export-ai-button"
                onClick={
                  downloadExamForAI
                }
                disabled={
                  exportBusy
                }
              >
                {exportBusy
                  ? "⏳ جارٍ تجهيز الملف..."
                  : "⬇️ تنزيل ملف للـ AI"}
              </button>
            </div>
            </div>
            </div>
          </section>
        )}
      </section>
      )}
      </div>
    </main>
  );
}

export default App;


