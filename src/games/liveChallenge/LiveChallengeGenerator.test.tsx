// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { readFileSync } from "fs";
import path from "path";
import LiveChallengeGenerator from "./LiveChallengeGenerator";
import type { LiveChallengeClient } from "./liveChallengeClient";
import { newQuestion } from "../../examBuilderState";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

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
