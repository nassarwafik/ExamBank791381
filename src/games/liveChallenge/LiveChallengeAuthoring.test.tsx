// @vitest-environment happy-dom
// Live Challenge authoring — redesigned editor (header card, toolbar, empty state, question list), the ONE shared
// import dialog (saved exam | local JSON file), the legacy saved-exam regression through the REAL client, and the JSON
// import flow (local parse only, selection before import, immutable snapshots, source metadata kind "exam").
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { readFileSync } from "fs";
import path from "path";
import LiveChallengeGenerator from "./LiveChallengeGenerator";
import { createLiveChallengeClient, type LiveChallengeClient } from "./liveChallengeClient";
import { MAX_IMPORT_BYTES } from "../../structuredExamImport";

afterEach(() => { cleanup(); vi.restoreAllMocks(); document.body.style.overflow = ""; });

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
const openEditor = async (client: LiveChallengeClient, embedded = false) => {
  const utils = render(<LiveChallengeGenerator token="t" onBack={vi.fn()} client={client} embedded={embedded} />);
  fireEvent.click(await screen.findByRole("button", { name: "إنشاء تحدٍّ جديد" }));
  await screen.findByLabelText("عنوان التحدّي");
  return utils;
};
const mcq = (id: string, text: string) => ({ examQuestionId: id, presentationType: "multipleChoice", text, marks: 2, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 } });
const dialog = () => screen.getByRole("dialog", { name: "استيراد أسئلة" });
const jsonFile = (value: unknown, name = "exam.json") => new File([typeof value === "string" ? value : JSON.stringify(value)], name, { type: "application/json" });
const chooseFile = (file: File) => fireEvent.change(within(dialog()).getByLabelText("ملف الامتحان (JSON)"), { target: { files: [file] } });

describe("editor — header card, toolbar, empty state", () => {
  it("header card: title + subtitle, a wide labelled title field, the question count badge and the prominent Save", async () => {
    await openEditor(fakeClient());
    const head = document.querySelector(".eb-lc-headcard") as HTMLElement;
    expect(within(head).getByRole("heading", { level: 1, name: "مولّد التحدّي المباشر" })).toBeTruthy();
    expect(within(head).getByText("أنشئ أسئلة التحدّي ورتّبها قبل بدء الجلسة المباشرة.")).toBeTruthy();
    expect((within(head).getByLabelText("عنوان التحدّي") as HTMLInputElement).classList.contains("eb-lc-title-input")).toBe(true);
    expect(head.querySelector(".eb-lc-stat")?.textContent).toBe("0سؤال");
    const save = within(head).getByRole("button", { name: "حفظ التحدّي" });
    expect(save.classList.contains("is-primary")).toBe(true);
  });

  it("toolbar card groups «new question» (labelled type select + add) and «import» (saved exam + JSON)", async () => {
    await openEditor(fakeClient());
    const bar = screen.getByRole("region", { name: "إضافة أسئلة إلى التحدّي" });
    expect(bar.classList.contains("eb-lc-toolbar")).toBe(true);
    const newGroup = within(bar).getByRole("group", { name: "سؤال جديد" });
    expect((within(newGroup).getByLabelText("نوع السؤال الجديد") as HTMLSelectElement).options.length).toBe(11);
    expect(within(newGroup).getByRole("button", { name: "+ إضافة سؤال" })).toBeTruthy();
    const importGroup = within(bar).getByRole("group", { name: "الاستيراد" });
    expect(within(importGroup).getByRole("button", { name: "استيراد من امتحان" })).toBeTruthy();
    expect(within(importGroup).getByRole("button", { name: "استيراد من JSON" })).toBeTruthy();
  });

  it("empty state offers «+ إضافة أول سؤال» / «استيراد امتحان»; it disappears once a question exists and the count updates", async () => {
    await openEditor(fakeClient());
    const empty = document.querySelector(".eb-lc-emptystate") as HTMLElement;
    expect(within(empty).getByText("لا توجد أسئلة في التحدّي بعد")).toBeTruthy();
    expect(within(empty).getByRole("button", { name: "استيراد امتحان" })).toBeTruthy();
    fireEvent.click(within(empty).getByRole("button", { name: "+ إضافة أول سؤال" }));
    await waitFor(() => expect(document.querySelector(".eb-lc-emptystate")).toBeNull());
    const list = screen.getByRole("list", { name: "أسئلة التحدّي" });
    expect(list.tagName).toBe("OL");
    expect(within(list).getAllByRole("listitem").length).toBe(1);
    expect(document.querySelector(".eb-lc-stat")?.textContent).toBe("1سؤال");
    // card chrome: numbered badge, a named action group, accessible action names
    const card = document.querySelector(".eb-lcq") as HTMLElement;
    expect(within(card).getByLabelText("السؤال 1 من 1")).toBeTruthy();
    const actions = within(card).getByRole("group", { name: "إجراءات السؤال 1" });
    for (const n of ["معاينة الطالب", "نقل إلى الأعلى", "نقل إلى الأسفل", "تكرار السؤال", "حذف السؤال"]) expect(within(actions).getByRole("button", { name: n })).toBeTruthy();
  });

  it("heading hierarchy follows the embedding: standalone h1 → h2 section; embedded h2 → h3 (still no <main>/<h1>)", async () => {
    await openEditor(fakeClient());
    expect(screen.getByRole("heading", { level: 2, name: "إضافة أسئلة إلى التحدّي" })).toBeTruthy();
    cleanup();
    const { container } = await openEditor(fakeClient(), true);
    expect(screen.getByRole("heading", { level: 2, name: "مولّد التحدّي المباشر" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "إضافة أسئلة إلى التحدّي" })).toBeTruthy();
    expect(container.querySelector("main")).toBeNull();
    expect(container.querySelector("h1")).toBeNull();
  });
});

describe("import dialog — one shared picker, two sources", () => {
  it("«استيراد من امتحان» opens the shared Dialog (aria-modal, named, described) on the saved source; exam cards show count, marks and date", async () => {
    const client = fakeClient({ listSourceExams: vi.fn(async () => [{ blobName: "b1", examId: "E1", title: "امتحان الكوابل", questionCount: 12, totalMarks: 40, savedAt: "2026-05-04T10:00:00Z" }]) });
    await openEditor(client);
    fireEvent.click(screen.getByRole("button", { name: "استيراد من امتحان" }));
    const d = dialog();
    expect(d.getAttribute("aria-modal")).toBe("true");
    expect(d.getAttribute("aria-describedby")).toBeTruthy();
    const sw = within(d).getByRole("group", { name: "مصدر الاستيراد" });
    expect(within(sw).getByRole("button", { name: "امتحان محفوظ" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(sw).getByRole("button", { name: "ملف JSON" }).getAttribute("aria-pressed")).toBe("false");
    await waitFor(() => expect(document.activeElement?.textContent).toBe("اختر امتحانًا محفوظًا"));   // focus moves to the step heading
    const card = await within(d).findByRole("button", { name: /امتحان الكوابل/ });
    expect(card.textContent).toContain("12 سؤال");
    expect(card.textContent).toContain("40 علامة");
    expect(card.textContent).toContain("2026-05-04");
    expect((within(d).getByRole("button", { name: /أضف المحدّد/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("«استيراد من JSON» opens on the JSON source (labelled file input, .json accept) without touching saved exams; switching sources works; Escape closes", async () => {
    const client = fakeClient();
    await openEditor(client);
    const opener = screen.getByRole("button", { name: "استيراد من JSON" });
    opener.focus();
    fireEvent.click(opener);
    const d = dialog();
    expect(within(d).getByRole("button", { name: "ملف JSON" }).getAttribute("aria-pressed")).toBe("true");
    const input = within(d).getByLabelText("ملف الامتحان (JSON)") as HTMLInputElement;
    expect(input.type).toBe("file");
    expect(input.getAttribute("accept")).toBe(".json,application/json");
    expect(client.listSourceExams).not.toHaveBeenCalled();
    fireEvent.click(within(d).getByRole("button", { name: "امتحان محفوظ" }));
    await waitFor(() => expect(client.listSourceExams).toHaveBeenCalledTimes(1));
    expect(within(d).getByRole("heading", { name: "اختر امتحانًا محفوظًا" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("REGRESSION — legacy saved exams through the REAL client (the false «no importable questions»)", () => {
  function stubSavedExams(exam: unknown, questionCount: number) {
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(url + " " + (init?.method || "GET"));
      if (url === "/api/saved-exams" && (!init || !init.method)) return { ok: true, status: 200, json: async () => ({ ok: true, exams: [{ blobName: "saved/x.json", examId: "X", title: "امتحان قديم", questionCount }] }) };
      if (url === "/api/saved-exams" && init?.method === "POST") return { ok: true, status: 200, json: async () => ({ ok: true, exam }) };
      return { ok: true, status: 200, json: async () => ({ ok: true, challenges: [] }) };
    }) as unknown as typeof fetch;
    return calls;
  }
  const openSaved = async () => {
    await openEditor(createLiveChallengeClient("tok"));
    fireEvent.click(screen.getByRole("button", { name: "استيراد من امتحان" }));
    fireEvent.click(await within(dialog()).findByRole("button", { name: /امتحان قديم/ }));
  };

  it("a LEGACY exam (questions[]) listed with 3 questions opens with its 3 questions — never the empty message", async () => {
    stubSavedExams({ examId: "X", title: "امتحان قديم", questions: [mcq("EQ-001", "الأول"), { examQuestionId: "EQ-002", presentationType: "open", text: "الثاني", marks: 3 }, mcq("EQ-003", "الثالث")] }, 3);
    await openSaved();
    const d = dialog();
    await waitFor(() => expect(within(d).getAllByRole("checkbox").length).toBe(3));
    expect(within(d).queryByText("لا توجد أسئلة قابلة للاستيراد في هذا الامتحان.")).toBeNull();
    expect(within(d).getByText("3 سؤال", { selector: ".eb-lc-select-total" })).toBeTruthy();
    expect(within(d).getByRole("checkbox", { name: /إجابة قصيرة \/ مفتوحة الثاني/ })).toBeTruthy();   // legacy «open» → shortAnswer
  });

  it("a structured exam still works; a GENUINELY empty exam shows the empty message; an unrecognizable exam shows a different message", async () => {
    stubSavedExams({ title: "منظّم", sections: [{ questions: [mcq("a", "أ")] }] }, 1);
    await openSaved();
    await waitFor(() => expect(within(dialog()).getAllByRole("checkbox").length).toBe(1));
    cleanup();
    stubSavedExams({ title: "فارغ", sections: [{ questions: [] }] }, 0);
    await openSaved();
    expect(await within(dialog()).findByText("لا توجد أسئلة قابلة للاستيراد في هذا الامتحان.")).toBeTruthy();
    cleanup();
    stubSavedExams({ title: "تالف", questions: [{ presentationType: "hologram" }] }, 1);
    await openSaved();
    expect(await within(dialog()).findByText("تعذّر التعرّف على بنية أسئلة هذا الامتحان.")).toBeTruthy();
    expect(within(dialog()).queryByText("لا توجد أسئلة قابلة للاستيراد في هذا الامتحان.")).toBeNull();
  });
});

describe("JSON import — local parse, selection first, immutable snapshots, source kind «exam»", () => {
  const STRUCTURED = { examId: "S-1", title: "امتحان JSON", sections: [{ id: "s", title: "", gradingPolicy: "all", questions: [mcq("a", "سؤال أ"), mcq("b", "سؤال ب"), mcq("c", "سؤال ج")] }] };
  const openJson = async (client = fakeClient()) => {
    await openEditor(client);
    fireEvent.click(screen.getByRole("button", { name: "استيراد من JSON" }));
    return client;
  };

  it("parses locally (no network), shows the file's exam title + count, and adds ONLY the selected questions as snapshots tagged kind «exam»", async () => {
    const fetchSpy = vi.fn(); globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const client = await openJson();
    chooseFile(jsonFile(STRUCTURED));
    const d = dialog();
    expect(await within(d).findByRole("heading", { name: "امتحان JSON" })).toBeTruthy();
    expect(within(d).getByText("3 سؤال", { selector: ".eb-lc-select-total" })).toBeTruthy();
    expect(document.querySelectorAll(".eb-lcq").length).toBe(0);                       // nothing dumped before selection
    fireEvent.click(within(d).getByRole("checkbox", { name: /سؤال ب/ }));
    expect(within(d).getByText("المحدّد: 1 من 3")).toBeTruthy();
    fireEvent.click(within(d).getByRole("button", { name: "أضف المحدّد (1)" }));
    await waitFor(() => expect(document.querySelectorAll(".eb-lcq").length).toBe(1));
    expect(fetchSpy).not.toHaveBeenCalled();                                            // local-only: nothing uploaded
    // the saved definition carries an immutable snapshot (fresh id) tagged as an exam source from a JSON file
    fireEvent.click(screen.getByRole("button", { name: "حفظ التحدّي" }));
    await waitFor(() => expect(client.save).toHaveBeenCalled());
    const def = (client.save as unknown as { mock: { calls: [{ questions: { question: { examQuestionId: string; text: string }; source: unknown }[] }][] } }).mock.calls[0][0];
    expect(def.questions).toHaveLength(1);
    expect(def.questions[0].question.text).toBe("سؤال ب");
    expect(def.questions[0].question.examQuestionId).not.toBe("b");
    expect(def.questions[0].source).toEqual({ kind: "exam", sourceId: "json:S-1", sourceTitle: "امتحان JSON (ملف JSON)" });
    expect(document.querySelector(".eb-lcq-source")?.textContent).toBe("من امتحان · امتحان JSON (ملف JSON)");
  });

  it("«تحديد الكل» selects every question («إلغاء تحديد الكل» clears); the add button always reflects the count", async () => {
    await openJson();
    chooseFile(jsonFile({ exam: STRUCTURED }));                                          // the saved-exam wrapper
    const d = dialog();
    await within(d).findByRole("heading", { name: "امتحان JSON" });
    fireEvent.click(within(d).getByRole("button", { name: "تحديد الكل" }));
    expect(within(d).getAllByRole("checkbox").every(c => (c as HTMLInputElement).checked)).toBe(true);
    fireEvent.click(within(d).getByRole("button", { name: "إلغاء تحديد الكل" }));
    expect(within(d).getByRole("button", { name: "أضف المحدّد (0)" })).toBeTruthy();
    fireEvent.click(within(d).getByRole("button", { name: "تحديد الكل" }));
    fireEvent.click(within(d).getByRole("button", { name: "أضف المحدّد (3)" }));
    await waitFor(() => expect(document.querySelectorAll(".eb-lcq").length).toBe(3));
  });

  it("legacy flat JSON is accepted", async () => {
    await openJson();
    chooseFile(jsonFile({ title: "قديم", questions: [mcq("x", "س1"), mcq("y", "س2")] }, "old.json"));
    expect(await within(dialog()).findByRole("heading", { name: "قديم" })).toBeTruthy();
    expect(within(dialog()).getAllByRole("checkbox").length).toBe(2);
  });

  it("errors are specific, announced (role=alert) and never presented as an empty exam", async () => {
    await openJson();
    const cases: [File, string | RegExp][] = [
      [jsonFile("{ not json"), "تعذّر قراءة ملف JSON. تأكّد من صحة الملف."],
      [jsonFile({ hello: "world" }), "لم يتم العثور على امتحان صالح في الملف."],
      [jsonFile({ title: "ف", sections: [{ questions: [] }] }), "لا يحتوي الملف على أسئلة قابلة للاستيراد."],
      [jsonFile({ title: "خطأ", sections: [{ questions: [{ examQuestionId: "q", presentationType: "hologram", text: "?", marks: 1 }] }] }), /تعذّر استيراد الامتحان من الملف: .*hologram/],
    ];
    for (const [file, message] of cases) {
      chooseFile(file);
      const alert = await within(dialog()).findByRole("alert");
      expect(alert.textContent).toMatch(message instanceof RegExp ? message : new RegExp(message.replace(/[.()]/g, "\\$&")));
      expect(within(dialog()).queryByText("لا توجد أسئلة قابلة للاستيراد في هذا الامتحان.")).toBeNull();
    }
  });

  it("an oversized file is rejected before it is read", async () => {
    await openJson();
    const big = jsonFile(STRUCTURED, "big.json");
    Object.defineProperty(big, "size", { value: MAX_IMPORT_BYTES + 1 });
    const textSpy = vi.spyOn(big, "text");
    chooseFile(big);
    expect((await within(dialog()).findByRole("alert")).textContent).toContain("حجم الملف أكبر من الحد المسموح");
    expect(textSpy).not.toHaveBeenCalled();
  });
});

describe("responsive / scope contracts (CSS)", () => {
  const css = readFileSync(path.join(process.cwd(), "src", "games", "games.css"), "utf8");
  const lc = css.slice(css.indexOf("/* ---------- Live Challenge Generator"));
  it("every new rule is scoped under .eb-lc / .eb-lcq (no broad main/button/input/select selectors)", () => {
    const selectors = lc.replace(/\/\*[\s\S]*?\*\//g, "").match(/[^{}]+(?=\{)/g)!.map(s => s.trim()).filter(s => !s.startsWith("@media"));
    for (const sel of selectors) for (const part of sel.split(",")) expect(part.trim(), part).toMatch(/^\.eb-(lc|lcq|dialog\.eb-lc)/);
  });
  it("phone-first toolbar (one column) → two groups ≥640px; header grid ≥1024px; stacked touch-size actions on phones", () => {
    expect(lc).toMatch(/\.eb-lc-toolbar-groups\{ display:grid; grid-template-columns:minmax\(0, 1fr\);/);
    expect(lc).toMatch(/@media \(min-width: 640px\)\{[\s\S]*?\.eb-lc-toolbar-groups\{ grid-template-columns:minmax\(0, 1fr\) minmax\(0, 1fr\)/);
    expect(lc).toMatch(/@media \(min-width: 1024px\)\{[\s\S]*?\.eb-lc-headcard\{ display:grid;/);
    expect(lc).toMatch(/@media \(max-width: 639\.98px\)\{[\s\S]*?\.eb-lc-import-foot\{ display:grid; grid-template-columns:minmax\(0, 1fr\);/);
    expect(lc).toMatch(/\.eb-lc-action\{ min-height:44px; \}/);
  });
});
