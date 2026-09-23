// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { readFileSync } from "fs";
import path from "path";
import LiveChallengeGenerator from "./LiveChallengeGenerator";
import type { LiveChallengeClient } from "./liveChallengeClient";
import type { TeacherLiveSessionClient, TeacherLobby } from "./liveSessionClient";
import { newQuestion } from "../../examBuilderState";

// The teacher recovery-discovery effect reads sessionStorage on the home screen, so clear it between tests.
afterEach(() => { cleanup(); vi.restoreAllMocks(); try { sessionStorage.clear(); } catch { /* ignore */ } });

function fakeClient(over: Partial<LiveChallengeClient> = {}): LiveChallengeClient {
  return {
    list: vi.fn(async () => []),
    get: vi.fn(async () => null),
    save: vi.fn(async () => ({ ok: true })),
    remove: vi.fn(async () => ({ ok: true })),
    listSourceExams: vi.fn(async () => []),
    loadSourceQuestions: vi.fn(async () => ({ title: "", questions: [] })),
    ...over,
  };
}

const openEditor = async (client: LiveChallengeClient) => {
  render(<LiveChallengeGenerator token="t" onBack={vi.fn()} client={client} />);
  await screen.findByRole("heading", { level: 1, name: "مولّد التحدّي المباشر" });
  fireEvent.click(await screen.findByRole("button", { name: "إنشاء تحدٍّ جديد" }));
  await screen.findByLabelText("عنوان التحدّي");
};

describe("LiveChallengeGenerator — home + authoring", () => {
  it("lists saved challenges on the home screen and can open create", async () => {
    const client = fakeClient({ list: vi.fn(async () => [{ challengeId: "c1", title: "تحدٍّ محفوظ", questionCount: 3 }]) });
    render(<LiveChallengeGenerator token="t" onBack={vi.fn()} client={client} />);
    expect(await screen.findByText("تحدٍّ محفوظ")).toBeTruthy();
    expect(client.list).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "إنشاء تحدٍّ جديد" }));
    expect((await screen.findByLabelText("عنوان التحدّي") as HTMLInputElement).value).toBe("تحدٍّ جديد");
  });

  it("opens an existing saved challenge via the client", async () => {
    const client = fakeClient({
      list: vi.fn(async () => [{ challengeId: "c1", title: "قديم", questionCount: 1 }]),
      get: vi.fn(async () => ({ schemaVersion: 1, challengeId: "c1", title: "قديم", courseId: "791381", questions: [{ question: newQuestion("trueFalse", { text: "س" }), source: { kind: "manual" as const } }] })),
    });
    render(<LiveChallengeGenerator token="t" onBack={vi.fn()} client={client} />);
    fireEvent.click(await screen.findByText("قديم"));
    await waitFor(() => expect(client.get).toHaveBeenCalledWith("c1"));
    expect((await screen.findByLabelText("عنوان التحدّي") as HTMLInputElement).value).toBe("قديم");
  });

  it("adds a manual question through the SHARED composer; all 11 canonical types are offered", async () => {
    const client = fakeClient();
    await openEditor(client);
    // the new-question type picker offers all 11 canonical types (no duplicated registry)
    expect((screen.getByLabelText("نوع السؤال الجديد") as HTMLSelectElement).querySelectorAll("option").length).toBe(11);
    fireEvent.click(screen.getByRole("button", { name: "+ إضافة سؤال" }));
    // the question is edited through QuestionComposer (its type selector is present)
    expect(await screen.findByLabelText("نوع السؤال")).toBeTruthy();
    expect(document.querySelectorAll(".eb-lcq").length).toBe(1);
  });

  it("edits, duplicates, moves and deletes questions", async () => {
    const client = fakeClient();
    await openEditor(client);
    fireEvent.click(screen.getByRole("button", { name: "+ إضافة سؤال" }));   // q1 (multipleChoice)
    // edit the prompt through the composer
    fireEvent.change(screen.getByPlaceholderText("نص السؤال"), { target: { value: "سؤالي الأول" } });
    expect((screen.getByPlaceholderText("نص السؤال") as HTMLTextAreaElement).value).toBe("سؤالي الأول");
    // duplicate (scoped to the card head — icon buttons expose the emoji as their name, so query by title) → 2 cards
    const firstHead = () => document.querySelector(".eb-lcq .sb-q-head") as HTMLElement;
    fireEvent.click(within(firstHead()).getByTitle("تكرار"));
    expect(document.querySelectorAll(".eb-lcq").length).toBe(2);
    // move the first card down, then delete it → back to 1
    fireEvent.click(within(firstHead()).getByTitle("أسفل"));
    fireEvent.click(within(firstHead()).getByTitle("حذف"));
    await waitFor(() => expect(document.querySelectorAll(".eb-lcq").length).toBe(1));
  });

  it("saves the challenge definition via the client", async () => {
    const client = fakeClient();
    await openEditor(client);
    fireEvent.click(screen.getByRole("button", { name: "+ إضافة سؤال" }));
    fireEvent.click(screen.getByRole("button", { name: "حفظ التحدّي" }));
    await waitFor(() => expect(client.save).toHaveBeenCalled());
    const saved = (client.save as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as { questions: unknown[] };
    expect(saved.questions.length).toBe(1);
    expect(await screen.findByText("تم حفظ التحدّي.")).toBeTruthy();
  });
});

describe("LiveChallengeGenerator — import (immutable snapshot, source isolation)", () => {
  it("imports a source-exam question as an immutable snapshot; later source edits do not change the challenge copy", async () => {
    const source = newQuestion("multipleChoice", { text: "نص المصدر", options: [{ text: "أ" }, { text: "ب" }] });
    const client = fakeClient({
      listSourceExams: vi.fn(async () => [{ blobName: "exams/e1.json", examId: "E1", title: "امتحان مصدر", questionCount: 1 }]),
      loadSourceQuestions: vi.fn(async () => ({ title: "امتحان مصدر", questions: [source] })),
    });
    await openEditor(client);
    fireEvent.click(screen.getByRole("button", { name: "استيراد من امتحان" }));
    fireEvent.click(await screen.findByText("امتحان مصدر"));                       // pick the exam
    const check = await screen.findByRole("checkbox");
    fireEvent.click(check);                                                        // select its question
    fireEvent.click(screen.getByRole("button", { name: /أضف المحدّد/ }));
    // the imported question now renders in a challenge card with the original text
    expect((await screen.findByPlaceholderText("نص السؤال") as HTMLTextAreaElement).value).toBe("نص المصدر");
    // mutate the ORIGINAL source object → the challenge snapshot must NOT change
    source.text = "عُدّل المصدر";
    (source.options as { text: string }[])[0].text = "مُعدّل";
    expect((screen.getByPlaceholderText("نص السؤال") as HTMLTextAreaElement).value).toBe("نص المصدر");
  });
});

describe("LiveChallengeGenerator — student preview (reused renderer, no answer-key leak)", () => {
  it("previews a question through ExamPreview and never shows the model answer key", async () => {
    const secret = newQuestion("shortAnswer", { text: "سؤال قصير", answer: { text: "سرّ الإجابة" } });
    const client = fakeClient({
      listSourceExams: vi.fn(async () => [{ blobName: "exams/e1.json", examId: "E1", title: "امتحان", questionCount: 1 }]),
      loadSourceQuestions: vi.fn(async () => ({ title: "امتحان", questions: [secret] })),
    });
    await openEditor(client);
    fireEvent.click(screen.getByRole("button", { name: "استيراد من امتحان" }));
    fireEvent.click(await screen.findByText("امتحان"));
    fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /أضف المحدّد/ }));
    await screen.findByPlaceholderText("نص السؤال");
    fireEvent.click(screen.getByTitle("معاينة الطالب"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/سؤال قصير/)).toBeTruthy();                    // the prompt renders
    expect(within(dialog).queryByText("سرّ الإجابة")).toBeNull();                  // the answer key is stripped
  });
});

describe("structural boundary", () => {
  it("the challenge question card consumes the SHARED QuestionComposer (no second question editor)", () => {
    const src = readFileSync(path.join(process.cwd(), "src", "games", "liveChallenge", "ChallengeQuestionCard.tsx"), "utf8");
    expect(src).toContain("QuestionComposer");
    expect(src).not.toContain("QuestionBodyEditor");   // does not re-implement body selection
  });
});

describe("LiveChallengeGenerator — semantics (standalone vs embedded in a host that owns <main>/<h1>)", () => {
  const TITLE = "مولّد التحدّي المباشر";
  it("standalone (default): a <main> root and an <h1> title — on home AND in the editor (unchanged)", async () => {
    const { container } = render(<LiveChallengeGenerator token="t" onBack={vi.fn()} client={fakeClient()} />);
    await screen.findByRole("heading", { level: 1, name: TITLE });
    expect(container.firstElementChild?.tagName).toBe("MAIN");
    fireEvent.click(await screen.findByRole("button", { name: "إنشاء تحدٍّ جديد" }));
    await screen.findByLabelText("عنوان التحدّي");
    expect(container.firstElementChild?.tagName).toBe("MAIN");
    expect(screen.getByRole("heading", { level: 1, name: TITLE })).toBeTruthy();
  });

  it("embedded: a <div> root (no <main>) and an <h2> title — same classes, same controls — on home AND in the editor", async () => {
    const onBack = vi.fn();
    const { container } = render(<LiveChallengeGenerator token="t" onBack={onBack} client={fakeClient()} embedded />);
    await screen.findByRole("heading", { level: 2, name: TITLE });
    const root = container.firstElementChild as HTMLElement;
    expect(root.tagName).toBe("DIV");
    expect(root.className).toBe("student-portal eb-student-shell eb-games-surface eb-lc");   // identical styling hooks
    expect(root.getAttribute("dir")).toBe("rtl");
    expect(container.querySelector("main")).toBeNull();
    expect(container.querySelector("h1")).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "إنشاء تحدٍّ جديد" }));
    await screen.findByLabelText("عنوان التحدّي");
    expect(container.querySelector("main")).toBeNull();
    expect(container.querySelector("h1")).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: TITLE })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /التحدّيات/ }));             // editor back → home, still embedded
    await screen.findByRole("heading", { level: 2, name: TITLE });
    fireEvent.click(screen.getByRole("button", { name: /العودة إلى الألعاب/ }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

// ── Review fix 2 — teacher recovery is discoverable when Live Challenge is reopened (parent flow) ────────────────
const tlobby = (over: Partial<TeacherLobby> = {}): TeacherLobby => ({
  sessionId: "K7MX4P", joinCode: "K7MX4P", challengeId: "c1", challengeTitle: "تحدّي محفوظ", classId: "cl1",
  status: "lobby", counts: { total: 1, joined: 1, ready: 1 }, roundVersion: 0, questionCount: 1, playing: 1,
  participants: [], startedAt: null, createdAt: "", updatedAt: "", finishedAt: null, closedAt: null, ...over,
});
const tactive = (): TeacherLobby => tlobby({
  status: "active", roundVersion: 1,
  round: { roundVersion: 1, questionNumber: 1, questionCount: 1, questionStartedAt: null, answered: 0, playing: 1,
    question: { examQuestionId: "q1", presentationType: "multipleChoice", text: "عاصمة الأردن؟", marks: 1, options: [{ text: "عمّان" }, { text: "إربد" }] } },
});
function fakeSessionClient(get: TeacherLiveSessionClient["get"]): TeacherLiveSessionClient {
  return {
    create: async () => ({ ok: true, session: tlobby() }),
    get,
    start: async () => ({ ok: true, status: 200, session: tactive() }),
    next: async () => ({ ok: true, status: 200, session: tactive() }),
    finish: async () => ({ ok: true, status: 200, session: tlobby({ status: "finished", finishedAt: "z" }) }),
    close: async () => ({ ok: true, session: tlobby({ status: "closed", closedAt: "z" }) }),
    listClasses: async () => [],
    listStudents: async () => [],
  };
}
const renderHome = (get: TeacherLiveSessionClient["get"]) =>
  render(<LiveChallengeGenerator token="t" onBack={vi.fn()} client={fakeClient()} sessionClient={fakeSessionClient(get)} />);

describe("LiveChallengeGenerator — teacher recovery on reopen (review fix)", () => {
  it("a remembered active room surfaces استئناف on the HOME screen (no challenge opened) and resumes into the live session", async () => {
    try { sessionStorage.setItem("eb-lc-teacher-room", "K7MX4P"); } catch { /* ignore */ }
    const get = vi.fn(async () => tactive());
    renderHome(get);
    const resumeBtn = await screen.findByRole("button", { name: "استئناف الجلسة" });   // offered without opening a challenge
    expect(get).toHaveBeenCalledWith("K7MX4P");
    expect(screen.getByRole("button", { name: "إنشاء تحدٍّ جديد" })).toBeTruthy();       // still the authoring home
    fireEvent.click(resumeBtn);
    expect(await screen.findByText("رمز الدخول")).toBeTruthy();                          // live session UI
    expect(screen.getByText("عاصمة الأردن؟")).toBeTruthy();                              // current active question
  });
  it("a remembered CLOSED room shows no resume card and clears the hint", async () => {
    try { sessionStorage.setItem("eb-lc-teacher-room", "K7MX4P"); } catch { /* ignore */ }
    const get = vi.fn(async () => tlobby({ status: "closed", closedAt: "z" }));
    renderHome(get);
    await waitFor(() => expect(get).toHaveBeenCalledWith("K7MX4P"));
    expect(await screen.findByRole("button", { name: "إنشاء تحدٍّ جديد" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "استئناف الجلسة" })).toBeNull();
    expect(sessionStorage.getItem("eb-lc-teacher-room")).toBeNull();
  });
  it("an unknown / foreign room (get → null) clears the hint and leaves the normal home", async () => {
    try { sessionStorage.setItem("eb-lc-teacher-room", "K7MX4P"); } catch { /* ignore */ }
    const get = vi.fn(async () => null);
    renderHome(get);
    await waitFor(() => expect(get).toHaveBeenCalledWith("K7MX4P"));
    expect(screen.queryByRole("button", { name: "استئناف الجلسة" })).toBeNull();
    expect(sessionStorage.getItem("eb-lc-teacher-room")).toBeNull();
  });
  it("تجاهل clears the hint and removes the resume card, leaving the normal home", async () => {
    try { sessionStorage.setItem("eb-lc-teacher-room", "K7MX4P"); } catch { /* ignore */ }
    renderHome(vi.fn(async () => tactive()));
    fireEvent.click(await screen.findByRole("button", { name: "تجاهل" }));
    expect(screen.queryByRole("button", { name: "استئناف الجلسة" })).toBeNull();
    expect(sessionStorage.getItem("eb-lc-teacher-room")).toBeNull();
    expect(screen.getByRole("button", { name: "إنشاء تحدٍّ جديد" })).toBeTruthy();
  });
  it("a remembered FINISHED room is still resumable in Phase 4B", async () => {
    try { sessionStorage.setItem("eb-lc-teacher-room", "K7MX4P"); } catch { /* ignore */ }
    renderHome(vi.fn(async () => tlobby({ status: "finished", finishedAt: "z" })));
    expect(await screen.findByRole("button", { name: "استئناف الجلسة" })).toBeTruthy();
    expect(sessionStorage.getItem("eb-lc-teacher-room")).toBe("K7MX4P");
  });
  it("no remembered room → no resume card, and normal new-room creation still works", async () => {
    render(<LiveChallengeGenerator token="t" onBack={vi.fn()} client={fakeClient({ list: vi.fn(async () => [{ challengeId: "c1", title: "تحدٍّ محفوظ", questionCount: 2 }]) })} sessionClient={fakeSessionClient(vi.fn(async () => null))} />);
    await screen.findByText("تحدٍّ محفوظ");
    expect(screen.queryByRole("button", { name: "استئناف الجلسة" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "إنشاء غرفة مباشرة" }));           // normal flow still available
    expect(await screen.findByRole("button", { name: "إنشاء الغرفة" })).toBeTruthy();
  });
});
