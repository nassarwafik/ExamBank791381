// @vitest-environment happy-dom
//
// Phase 21I — the builder prompt («ماذا تريد في الامتحان؟») through the REAL App with a mocked teacher API whose analysis endpoint answers
// with the REAL server result builder (api/src/functions/interpret-exam-request.js → buildInterpretResult). A physics / programming request
// never searches the networking bank: the route card offers the AI Full Exam Composer, which opens on a NEW structured exam with its form
// filled from the request — and nothing is generated before «توليد». A networking request keeps the bank flow. Unsaved structured work is
// never discarded silently.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, act } from "@testing-library/react";
import { createRequire } from "node:module";
import App from "./App";

const nodeRequire = createRequire(import.meta.url);
const { buildInterpretResult } = nodeRequire("../api/src/functions/interpret-exam-request.js") as { buildInterpretResult: (raw: unknown, prompt: string, topics: unknown, provider: string, model: string) => Record<string, unknown> };
const TOPICS = { topics: [{ code: "IP_ADDRESSING", name: "IPv4 Addressing", parent: null }, { code: "DHCP", name: "DHCP", parent: "NETWORK_SERVICES" }] };

const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);
let calls: { availability: number; composer: number; interpret: number };
let modelSubject: Record<string, unknown> | undefined;
const rawPlan = () => ({
  title: "", totalQuestions: 10, requestedQuestionCount: 10, totalMarks: 50,
  sectionTargets: { BASIC: 6, INFRASTRUCTURE: 4 }, difficultyTargets: { "1": 2, "2": 3, "3": 3, "4": 2, "5": 0 },
  topicTargets: [{ topic: "DHCP", count: 2 }], excludedTopics: [],
  typeTargets: { multipleChoice: 0, fillBlank: 0, wordBank: 0, open: 0 }, minimums: { images: 0, cli: 0, calculations: 0 },
  rules: { excludeNeedsReview: true, avoidSameFamily: true, preferOfficialSources: true, avoidPreviouslyUsed: false, recentExamCount: 0 },
  explanation: "فهمت الطلب.", subject: modelSubject
});

beforeEach(() => {
  calls = { availability: 0, composer: 0, interpret: 0 };
  modelSubject = undefined;
  try { sessionStorage.clear(); localStorage.clear(); } catch { /* ignore */ }
  sessionStorage.setItem("examBankBuilderToken", "teacher-token");
  sessionStorage.setItem("examBankSessionRole", "teacher");
  sessionStorage.setItem("examBankSessionDisplayName", "أ. أحمد");
  localStorage.setItem("tadris.studio.layout", "classic");
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
  Element.prototype.scrollIntoView = function scrollIntoView() {};
  globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url.includes("/api/platform-session")) return res(200, { ok: true, role: "teacher", displayName: "أ. أحمد" });
    if (url.includes("/api/teacher-profile")) return res(200, { ok: true, profile: { teacherId: "t1", displayName: "أ. أحمد", hasCustomName: false, avatarId: "", profilePhoto: null, updatedAt: "" } });
    if (url.includes("/api/project-tracker")) return res(200, { ok: true, projects: [], totalReadyForReview: 0, byProject: {} });
    if (url.includes("/api/messages")) return res(200, { ok: true, totalUnread: 0, capped: false });
    if (url.includes("/api/saved-exams")) return res(200, { ok: true, exams: [] });
    if (url.includes("/api/interpret-exam-request")) { calls.interpret += 1; return res(200, buildInterpretResult(rawPlan(), String(body.prompt), TOPICS, "glm", "m")); }
    if (url.includes("/api/exam-question-availability")) { calls.availability += 1; return res(200, { ok: true, availableCount: 12, topicFacets: [{ topic: "DHCP", count: 7 }], difficultyFacets: [], typeFacets: [], topics: TOPICS.topics }); }
    if (url.includes("/api/ai-exam-composer")) { calls.composer += 1; return res(503, { ok: false, code: "AI_UNAVAILABLE" }); }
    return res(200, { ok: true });
  }) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const click = async (el: Element) => { await act(async () => { fireEvent.click(el); }); };
const settle = (ms = 30) => act(async () => { await new Promise(r => setTimeout(r, ms)); });

async function analyse(prompt: string) {
  render(<App />);
  const box = await screen.findByRole("textbox", { name: "وصف الامتحان المطلوب" }, { timeout: 8000 });
  await act(async () => { fireEvent.change(box, { target: { value: prompt } }); });
  await click(screen.getByRole("button", { name: "تحليل الطلب" }));
  await settle(60);
}
const routeCard = () => screen.findByRole("region", { name: "كيف سيُبنى هذا الامتحان؟" }, { timeout: 10000 });   // a lazy chunk

describe("21I builder prompt — multi-subject routing", () => {
  it("a physics request never searches the networking bank; the composer opens pre-filled and generates nothing by itself", async () => {
    modelSubject = { domain: "physics", label: "فيزياء — الحركة", language: "ar", sourcePreference: "unspecified", questionCountExplicit: true, durationMinutes: 45, course: "", grade: "11", topics: ["السقوط الحر", "المقذوفات"] };
    await analyse("أريد امتحان فيزياء من 10 أسئلة عن السقوط الحر والمقذوفات مع محاكاة، مدته 45 دقيقة");
    expect(calls.interpret).toBe(1);
    expect(calls.availability).toBe(0);                                         // the networking bank is never queried
    expect(screen.queryByRole("heading", { name: "الأسئلة المتاحة لهذا الطلب" })).toBeNull();
    const card = await routeCard();
    expect(card.textContent).toContain("فيزياء — الحركة");
    expect(card.textContent).toContain("مخزن الأسئلة المصنف يغطي شبكات الاتصال فقط");
    expect(within(card).queryByRole("radio", { name: /مخزن الأسئلة/ })).toBeNull();   // the bank cannot serve physics: not offered
    expect(within(card).getByRole("radio", { name: /المؤلف الذكي/ })).toHaveProperty("checked", true);

    await click(within(card).getByRole("button", { name: "فتح المؤلف الذكي بهذا الطلب" }));
    const dialog = await screen.findByRole("dialog", { name: "المؤلف الذكي للامتحان" }, { timeout: 15000 });
    expect((within(dialog).getByRole("textbox", { name: "المادة (مطلوب)" }) as HTMLInputElement).value).toBe("فيزياء — الحركة");
    expect((within(dialog).getByRole("textbox", { name: "الصف" }) as HTMLInputElement).value).toBe("11");
    expect((within(dialog).getByRole("spinbutton", { name: "مجموع العلامات (مطلوب)" }) as HTMLInputElement).value).toBe("50");
    expect((within(dialog).getByRole("spinbutton", { name: "عدد الأسئلة المستهدف" }) as HTMLInputElement).value).toBe("10");
    expect((within(dialog).getByRole("spinbutton", { name: "المدة بالدقائق" }) as HTMLInputElement).value).toBe("45");
    expect(within(dialog).getByRole("note").textContent).toContain("عُبّئ هذا النموذج من طلبك");
    await settle(60);
    expect(calls.composer).toBe(0);                                             // nothing is generated before «توليد»
  }, 40000);

  it("a networking request keeps the bank flow; the teacher may switch it to the composer and back", async () => {
    modelSubject = { domain: "networking", label: "شبكات", language: "ar", sourcePreference: "unspecified", questionCountExplicit: true, durationMinutes: 0, course: "", grade: "", topics: ["DHCP"] };
    await analyse("امتحان شبكات من 10 أسئلة عن DHCP وIPv4 وVLAN");
    expect(calls.availability).toBe(1);
    expect(screen.getByRole("heading", { name: "الأسئلة المتاحة لهذا الطلب" })).toBeTruthy();
    const card = await routeCard();
    const bank = within(card).getByRole("radio", { name: /مخزن الأسئلة/ });
    expect(bank).toHaveProperty("checked", true);
    await click(within(card).getByRole("radio", { name: /المؤلف الذكي/ }));
    expect(screen.queryByRole("heading", { name: "الأسئلة المتاحة لهذا الطلب" })).toBeNull();
    expect(within(await routeCard()).getByRole("button", { name: "فتح المؤلف الذكي بهذا الطلب" })).toBeTruthy();
    await click(within(await routeCard()).getByRole("radio", { name: /مخزن الأسئلة/ }));
    expect(screen.getByRole("heading", { name: "الأسئلة المتاحة لهذا الطلب" })).toBeTruthy();
    expect(calls.availability).toBe(1);                                         // the earlier availability is reused
  }, 40000);

  it("a provider that returned no subject still routes a programming request to the composer (deterministic fallback)", async () => {
    await analyse("Create a Python programming exam about loops and arrays with 3 coding questions");
    expect(calls.availability).toBe(0);
    expect((await routeCard()).textContent).toContain("البرمجة");
  }, 40000);

  it("unsaved structured work is never discarded silently: the teacher is asked first", async () => {
    modelSubject = { domain: "programming", label: "Python", language: "ar", sourcePreference: "unspecified", questionCountExplicit: false, durationMinutes: 0, course: "", grade: "", topics: [] };
    render(<App />);
    await click(await screen.findByRole("button", { name: /امتحان منظّم جديد/ }, { timeout: 8000 }));
    await screen.findByRole("dialog", { name: /امتحان منظّم جديد/ }, { timeout: 15000 });
    await click(screen.getByRole("button", { name: "رجوع" }));
    await click(await screen.findByRole("button", { name: "الخروج دون حفظ" }));
    await settle(60);
    const box = screen.getByRole("textbox", { name: "وصف الامتحان المطلوب" });
    await act(async () => { fireEvent.change(box, { target: { value: "امتحان برمجة بلغة بايثون عن المصفوفات" } }); });
    await click(screen.getByRole("button", { name: "تحليل الطلب" }));
    await settle(60);

    await click(within(await routeCard()).getByRole("button", { name: "فتح المؤلف الذكي بهذا الطلب" }));
    const confirm = await screen.findByRole("dialog", { name: "امتحان منظّم غير محفوظ" });
    await click(within(confirm).getByRole("button", { name: "العودة للامتحان الحالي" }));
    await settle(60);
    expect(screen.queryByRole("dialog", { name: "المؤلف الذكي للامتحان" })).toBeNull();
    expect(screen.getByRole("button", { name: /متابعة تحرير الامتحان المنظّم/ })).toBeTruthy();   // the unsaved exam is still there

    await click(within(await routeCard()).getByRole("button", { name: "فتح المؤلف الذكي بهذا الطلب" }));
    await click(within(await screen.findByRole("dialog", { name: "امتحان منظّم غير محفوظ" })).getByRole("button", { name: "فتح امتحان جديد" }));
    const dialog = await screen.findByRole("dialog", { name: "المؤلف الذكي للامتحان" }, { timeout: 15000 });
    expect((within(dialog).getByRole("textbox", { name: "المادة (مطلوب)" }) as HTMLInputElement).value).toBe("Python");
  }, 40000);
});
