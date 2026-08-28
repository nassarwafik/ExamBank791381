import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import "./App.css";

type DifficultyMap = Record<"1" | "2" | "3" | "4" | "5", number>;

type ExamPlan = {
  title: string;
  originalRequest: string;
  totalQuestions: number;
  totalMarks: number;
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
  aiProvider?: "glm" | "qwen" | "openai";
  aiModel?: string;
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
  origin: "bank" | "ai-generated";
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
    origin: "bank" | "ai-generated" | null;
    assets: QuestionImageAsset[];
    prompt: string | null;
  };
  history: unknown[];
  redoStack: unknown[];
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

function getStoredToken() {
  try {
    return sessionStorage.getItem("examBankBuilderToken") || "";
  }
  catch {
    return "";
  }
}

function App() {
  const [token, setToken] = useState(getStoredToken);
  const [userCode, setUserCode] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);

  const [examPrompt, setExamPrompt] = useState("");
  const [aiProvider, setAiProvider] = useState<"glm" | "qwen" | "openai">("glm");
  const [plan, setPlan] = useState<ExamPlan | null>(null);
  const [exam, setExam] = useState<ExamDraft | null>(null);
  const [generateBusy, setGenerateBusy] = useState(false);
  const [builderError, setBuilderError] = useState("");
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
      const response = await fetch("/api/builder-login", {
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
    }
    catch {
      // Ignore storage failures.
    }

    setToken("");
    setUserCode("");
    setPassword("");
    setExamPrompt("");
    setPlan(null);
    setExam(null);
    setBuilderError("");
  }

  async function handleGenerateExam() {
    if (!examPrompt.trim() || generateBusy) {
      return;
    }

    setGenerateBusy(true);
    setBuilderError("");
    setPlan(null);
    setExam(null);

    try {
      const interpreted = await apiRequest<{
        ok: true;
        plan: ExamPlan;
      }>("/api/interpret-exam-request", {
        method: "POST",
        body: JSON.stringify({
          prompt: examPrompt.trim(),
          provider: aiProvider
        })
      });

      setPlan(interpreted.plan);

      const generated = await apiRequest<{
        ok: true;
        exam: ExamDraft;
      }>("/api/generate-exam", {
        method: "POST",
        body: JSON.stringify({
          plan: interpreted.plan
        })
      });

      setExam(generated.exam);

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

  function updateQuestion(
    examQuestionId: string,
    updater: (question: ExamQuestion) => ExamQuestion
  ) {
    setExam(current => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        updatedAt: new Date().toISOString(),
        questions: current.questions.map(question =>
          question.examQuestionId === examQuestionId
            ? updater(question)
            : question
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

  function applyQuestionReplacement(
    currentQuestion: ExamQuestion,
    replacement: ExamQuestion
  ) {
    const history = [
      ...getHistory(
        currentQuestion
      ),
      cloneQuestion(
        currentQuestion
      )
    ].slice(-30);

    updateQuestion(
      currentQuestion
        .examQuestionId,

      () => ({
        ...replacement,

        examQuestionId:
          currentQuestion
            .examQuestionId,

        marks:
          currentQuestion
            .marks,

        locked:
          currentQuestion
            .locked,

        teacherNote:
          currentQuestion
            .teacherNote,

        history,

        redoStack: []
      })
    );
  }

  async function runBankQuestionAction(
    question: ExamQuestion,
    options: {
      difficulty?: number;
      presentationType?:
        ExamQuestion["presentationType"];
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

  function showNextPhaseMessage() {
    setBuilderError(
      "تم تجهيز الواجهة لهذه الأداة. سنربط تنفيذها بالـ Backend في المرحلة التالية دون تغيير الصفحة."
    );
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
      <main className="login-page" dir="rtl">
        <section className="login-card">
          <div className="brand-mark">EB</div>
          <h1>ExamBank 791381</h1>
          <p className="subtitle">
            نظام ذكي لبناء امتحانات شبكات الاتصال
          </p>

          <form onSubmit={handleLogin}>
            <label>
              كود المستخدم
              <input
                type="text"
                value={userCode}
                onChange={event =>
                  setUserCode(event.target.value)
                }
                placeholder="أدخل كود المستخدم"
                autoComplete="username"
              />
            </label>

            <label>
              كلمة المرور
              <input
                type="password"
                value={password}
                onChange={event =>
                  setPassword(event.target.value)
                }
                placeholder="أدخل كلمة المرور"
                autoComplete="current-password"
              />
            </label>

            {loginError && (
              <div className="error-message">
                {loginError}
              </div>
            )}

            <button
              type="submit"
              className="primary-button"
              disabled={loginBusy}
            >
              {loginBusy ? "جارٍ الدخول..." : "دخول"}
            </button>
          </form>

          <p className="login-note">
            جلسة دخول آمنة لباني الامتحانات
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="builder-page" dir="rtl">
      <header className="top-bar">
        <div>
          <h1>ExamBank 791381</h1>
          <p>
            اكتب ما تريد، وسيبقى بناء الامتحان وتعديله كله في هذه الصفحة
          </p>
        </div>

        <button
          className="logout-button"
          onClick={handleLogout}
        >
          تسجيل الخروج
        </button>
      </header>

      <section className="builder-content">
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
                        | "glm"
                        | "qwen"
                        | "openai"
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
                  <option value="openai">
                    OpenAI GPT-5.6 Luna
                  </option>
                </select>
              </label>

              <button
              className="generate-button"
              onClick={handleGenerateExam}
              disabled={!examPrompt.trim() || generateBusy}
            >
              {generateBusy
                ? "جارٍ تحليل الطلب وبناء الامتحان..."
                : "إنشاء الامتحان"}
            </button>
            </div>
          </div>
        </div>

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
                        ? "Qwen"
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
            className="generated-exam"
            id="generated-exam"
          >
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
                  onClick={showNextPhaseMessage}
                  disabled={!globalInstruction.trim()}
                >
                  تطبيق على الامتحان بالذكاء الاصطناعي
                </button>
              </div>
            </div>

            <div className="questions-list">
              {exam.questions.map((question, index) => {
                const answerShown =
                  answerVisibility[question.examQuestionId] === true;

                return (
                  <article
                    className={`question-card difficulty-${question.difficulty} ${
                      question.locked ? "question-locked" : ""
                    }`}
                    key={question.examQuestionId}
                  >
                    <div className="question-top-row">
                      <div className="question-number">
                        السؤال {index + 1}
                      </div>

                      <div className="question-top-actions">
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

                    <div className="question-text-panel">
                      <div className="question-text">
                        {question.text}
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
                            runBankQuestionAction(
                              question,
                              {
                                presentationType:
                                  event.target.value as
                                    ExamQuestion["presentationType"]
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
                  </article>
                );
              })}
            </div>

            <div className="bottom-actions-card">
              <button onClick={showNextPhaseMessage}>
                💾 حفظ الامتحان
              </button>
              <button onClick={showNextPhaseMessage}>
                📋 حفظ كقالب
              </button>
              <button onClick={showNextPhaseMessage}>
                ✅ فحص جودة الامتحان
              </button>
              <button onClick={showNextPhaseMessage}>
                👨‍🎓 نسخة الطالب
              </button>
              <button onClick={showNextPhaseMessage}>
                👨‍🏫 نسخة المعلم
              </button>
              <button onClick={showNextPhaseMessage}>
                🖨 طباعة / PDF
              </button>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

export default App;


