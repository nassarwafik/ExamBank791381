// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { render, cleanup, act } from "@testing-library/react";
import * as P from "./presentationModel";
import { validateRichContent } from "../richContent/richContentModel";
import { parseMath } from "../richContent/richMath";
import { markdownToRichContent } from "../richContent/markdownToRichContent";
import { validateStructuredExam } from "../examQuality";
import ExamPreview from "../ExamPreview";
import StudentQuestionCard, { type Question } from "../StudentQuestionCard";
import RichContentRenderer from "../richContent/RichContentRenderer";

// Phase 20D.1 — Independent Review Fix 1 (fail-first on 1eb2c21). Every case below fails on the reviewed head and passes after the fix.
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const settle = async () => { for (let i = 0; i < 15; i++) await act(async () => { await new Promise(r => setTimeout(r, 15)); }); };
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, "..", "..", f), "utf8");
const doc = (...blocks: unknown[]) => ({ schemaVersion: 1, blocks });
const p = (text: string) => ({ type: "paragraph", runs: [{ text }] });
const RICH = doc({ type: "table", caption: "جدول", columnHeaders: ["أ", "ب"], rows: [["1", "2"]] }, p("تعليمات منسقة فريدة"));

describe("RF1-M1 raw-HTML detection is linear (no CPU denial of service) and legitimate '<' prose is accepted", () => {
  it("five 20 000-char runs of '<' + spaces validate quickly (was ≈2.1 s, quadratic)", () => {
    const run = "<" + " ".repeat(19998) + "x";
    const t = performance.now();
    const r = validateRichContent(doc(...Array.from({ length: 5 }, () => p(run))));
    expect(performance.now() - t).toBeLessThan(400);
    expect(r.ok).toBe(true);
  });
  it("an over-limit document of such runs is rejected quickly (bounds are not checked only after every regex)", () => {
    const run = "<" + " ".repeat(19998) + "x";
    const t = performance.now();
    const r = validateRichContent(doc(...Array.from({ length: 20 }, () => p(run))));
    expect(performance.now() - t).toBeLessThan(400);
    expect(r.issues.map(i => i.code)).toContain("RICH_CONTENT_LIMIT");
  });
  it("math / CS prose with '<' is accepted; real tags are still refused", () => {
    for (const ok of ["إذا كان 0 < a < 1 فإن", "for i < a.length", "for (i=0; i<a.length; i++)", "x < p", "a<b و b>c", "if x<p then"]) expect(validateRichContent(doc(p(ok))).ok, ok).toBe(true);
    for (const bad of ["<script>alert(1)</script>", "</a>", "<img src=x>", "<p>نص</p>", "<!-- x -->", "javascript:alert(1)", "<SVG onload=x>"]) expect(validateRichContent(doc(p(bad))).issues.map(i => i.code), bad).toContain("RICH_CONTENT_RAW_HTML");
  });
  it("the Markdown converter keeps a literal '<' in prose (no full-width rewrite)", () => {
    const r = markdownToRichContent("إذا كان 0 < a < 1 فإن a<b");
    expect(JSON.stringify(r.value)).toContain("0 < a < 1 فإن a<b");
    expect(JSON.stringify(r.value)).not.toContain("＜");
  });
});

describe("RF1-M2 presentation values can never move, hide, unpin or make transparent the lifecycle chrome", () => {
  const CHROME = /\.iex-(topbar|bottom-nav|save|countdown|strict|pause-row|review-actions|nav-trigger)/;
  const FORBIDDEN_PROP = /^(position|display|visibility|opacity|z-index|inset[\w-]*|top|bottom|left|right|transform|pointer-events|clip|clip-path)$/;
  function rules(css: string): { selector: string; decls: string; print: boolean }[] {
    const out: { selector: string; decls: string; print: boolean }[] = [];
    const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const walk = (s: string, print: boolean) => {
      let i = 0;
      while (i < s.length) {
        const open = s.indexOf("{", i); if (open < 0) break;
        const head = s.slice(i, open).trim();
        let depth = 1, j = open + 1;
        while (j < s.length && depth) { if (s[j] === "{") depth++; else if (s[j] === "}") depth--; j++; }
        const body = s.slice(open + 1, j - 1);
        if (head.startsWith("@")) walk(body, print || /@media\s+print/.test(head));
        else out.push({ selector: head, decls: body, print });
        i = j;
      }
    };
    walk(src, false);
    return out;
  }
  for (const f of ["src/presentation/presentation.css", "src/richContent/rich-content.css"]) it(f + ": no screen rule targeting lifecycle chrome changes its placement / visibility or makes it transparent", () => {
    const offenders: string[] = [];
    for (const r of rules(read(f))) {
      if (r.print || !CHROME.test(r.selector)) continue;
      for (const d of r.decls.split(";")) {
        const [prop, ...v] = d.split(":"); const name = (prop || "").trim(), value = v.join(":").trim();
        if (!name) continue;
        if (FORBIDDEN_PROP.test(name) || (/^background(-color)?$/.test(name) && /transparent|rgba?\([^)]*,\s*0\s*\)|\/\s*0\s*\)/.test(value))) offenders.push(r.selector + " { " + name + ": " + value + " }");
      }
    }
    expect(offenders).toEqual([]);
  });
  it("stickyTopBar is not part of the v1 vocabulary (the lifecycle top bar is always sticky) and no root attribute can unpin it", () => {
    expect(P.validatePresentation({ schemaVersion: 1, preset: "default", layout: { stickyTopBar: false } }).issues.map(i => i.code)).toContain("PRESENTATION_UNKNOWN_KEY");
    const attrs = P.presentationRootAttributes(P.resolvePresentation({ schemaVersion: 1, preset: "focus" })!);
    expect(Object.keys(attrs)).not.toContain("data-xp-sticky");
  });
  it("direction:ltr never mirrors the lifecycle chrome: the root stays rtl, the direction applies to content only", async () => {
    const exam = { title: "Exam", presentation: { schemaVersion: 1, preset: "default", direction: "ltr" }, sections: [{ id: "s1", title: "S", gradingPolicy: "all", questions: [{ examQuestionId: "q1", presentationType: "multipleChoice", text: "Which?", marks: 1, options: [{ text: "A" }, { text: "B" }], answer: { correctOptionIndex: 0 } }] }] };
    const r = render(<ExamPreview exam={exam as never} onClose={() => {}} />);
    await settle();
    const root = r.container.querySelector(".exam-presentation") as HTMLElement;
    expect(root.getAttribute("dir")).toBe("rtl");
    expect(root.getAttribute("data-xp-direction")).toBe("ltr");
    expect(read("src/presentation/presentation.css")).toMatch(/\[data-xp-direction="ltr"\][^{]*\.iex-q[^{]*\{[^}]*direction:\s*ltr/);
  });
});

describe("RF1-M3 a rich stem never replaces the plain text that teacher / review / training surfaces read", () => {
  it("a question with a valid rich stem and empty text is still an EMPTY_TEXT finalization error", () => {
    const e = { title: "t", sections: [{ id: "s1", title: "S", gradingPolicy: "all", questions: [{ examQuestionId: "q1", presentationType: "multipleChoice", text: "", richContent: RICH, marks: 1, options: [{ text: "A" }, { text: "B" }], answer: { correctOptionIndex: 0 } }] }] };
    const issues = validateStructuredExam(e as never).filter(i => i.severity === "error");
    expect(issues.map(i => i.code)).toContain("EMPTY_TEXT");
    expect(issues.find(i => i.code === "EMPTY_TEXT")!.message).toMatch(/استخدام نص المحتوى كنص بديل/);
  });
});

describe("RF1-m2 math depth is bounded for unbraced command arguments too", () => {
  it("\\vec / \\sqrt / \\frac chains without braces deeper than MATH_LIMITS.depth are refused", () => {
    expect(parseMath("\\vec ".repeat(30) + "x").ok).toBe(false);
    expect(parseMath("\\sqrt ".repeat(30) + "x").ok).toBe(false);
    expect(parseMath("\\frac 1".repeat(30) + "2").ok).toBe(false);
    expect(parseMath("\\vec v + \\sqrt 2").ok).toBe(true);
  });
});

describe("RF1-m3 a parametric node never shows a rich stem (the authored template would leak)", () => {
  it("StudentQuestionCard renders the generated plain text for a node carrying a parametric config, even with richContent", async () => {
    const q = { examQuestionId: "q1", presentationType: "shortAnswer", text: "احسب 12 × 3", marks: 1, parametric: { v: 1 }, richContent: doc(p("القالب {{a}} × {{b}}")) } as unknown as Question;
    const r = render(<StudentQuestionCard q={q} index={0} id="q1" answer={undefined} onChoice={() => {}} onSeq={() => {}} onTable={() => {}} onText={() => {}} onField={() => {}} />);
    await settle();
    expect(r.container.textContent).toContain("احسب 12 × 3");
    expect(r.container.textContent).not.toContain("{{a}}");
  });
  it("finalization refuses rich content on any node that carries a parametric config", () => {
    const e = { title: "t", sections: [{ id: "s1", title: "S", gradingPolicy: "all", questions: [{ examQuestionId: "q1", presentationType: "shortAnswer", text: "x", marks: 1, parametric: { v: 1 }, richContent: RICH }] }] };
    expect(validateStructuredExam(e as never).map(i => i.code)).toContain("PARAMETRIC_RICH_CONTENT_FORBIDDEN");
  });
});

describe("RF1-m4 rich section instructions are shown without an exam presentation too", () => {
  it("legacy (no presentation) teacher preview renders a section's rich instructions", async () => {
    const exam = { title: "t", presentationTheme: "classic", sections: [{ id: "s1", title: "S", gradingPolicy: "all", instructions: "", instructionsRichContent: RICH, questions: [{ examQuestionId: "q1", presentationType: "multipleChoice", text: "سؤال", marks: 1, options: [{ text: "A" }, { text: "B" }], answer: { correctOptionIndex: 0 } }] }] };
    const r = render(<ExamPreview exam={exam as never} onClose={() => {}} />);
    await settle();
    expect(r.container.querySelector(".exam-presentation")).toBeNull();
    expect(r.container.textContent).toContain("تعليمات منسقة فريدة");
    expect(r.container.querySelector("table caption")?.textContent).toBe("جدول");
  });
  it("the student page's section context renders rich instructions without a presentation (rendered, not only wired)", async () => {
    (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
    window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
    const json = (status: number, body: unknown) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body } as Response);
    const STATE = { attemptsUsed: 0, allowedAttempts: 1, canAttempt: true, canWrite: true, dueClosed: false, availability: "open", draftAnswers: {}, draftSavedAt: "", latestResult: null, attempts: [], timed: false, attemptModelVersion: 0, requiresStart: false, serverNow: "2026-03-01T10:00:00.000Z", activeAttempt: null, effectiveAttemptEndsAt: "", attemptExpired: false, canStartAttempt: false, durationMinutes: 0 };
    globalThis.fetch = vi.fn((url: string, init?: RequestInit) => String(url).includes("/api/student-submission/") ? ((init && init.method) === "POST" ? json(200, { ok: true, savedAt: "x" }) : json(200, { ok: true, state: STATE })) : json(404, {})) as unknown as typeof fetch;
    const exam = { title: "t", metadata: {}, presentationTheme: "classic", sections: [{ id: "s1", title: "S", gradingPolicy: "all", instructions: "", instructionsRichContent: RICH, questions: [{ examQuestionId: "q1", presentationType: "multipleChoice", text: "سؤال", marks: 1, options: [{ text: "A" }, { text: "B" }] }] }] };
    const assignment = { assignmentId: "asg1", title: "واجب", instructions: "", openAt: "", dueAt: "2026-05-01T10:30:00.000Z", effectiveDueAt: "", maxAttempts: 1, durationMinutes: 0, requiresStart: false, timed: false, questionCount: 1, totalMarks: 1, exam };
    const { default: StudentExamPage } = await import("../StudentExamPage");
    const r = render(<StudentExamPage token="t" assignment={assignment as never} studentName="أ" className="ب" onBack={() => {}} onLogout={() => {}} />);
    await settle();
    expect(r.container.querySelector(".exam-presentation")).toBeNull();
    expect(r.container.querySelector(".iex-section-context")?.textContent).toContain("تعليمات منسقة فريدة");
    expect(read("src/StudentExamPage.tsx")).toMatch(/richInstructions=\{\(rawSection as[\s\S]{0,80}?\)\?\.instructionsRichContent\}/);
  });
});

describe("RF1-m6 the Markdown converter is linear on adversarial lines", () => {
  for (const [name, md] of [
    ["whitespace-heavy heading", "# a" + " ".repeat(20000) + "b"],
    ["unmatched single emphasis", "*a ".repeat(6600)],
    ["unmatched strong emphasis", "**a ".repeat(5000)],
    ["unmatched underscores", "_a ".repeat(6600)]
  ] as const) it(name + " converts in well under a second (was 0.9 – 1.6 s)", () => {
    const t = performance.now();
    markdownToRichContent(md);
    expect(performance.now() - t).toBeLessThan(400);
  });
  it("ordinary headings and emphasis still convert", () => {
    const r = markdownToRichContent("## عنوان ##\n\nنص **عريض** و*مائل*");
    expect(r.value!.blocks[0]).toEqual({ type: "heading", level: 2, runs: [{ text: "عنوان" }] });
    expect(JSON.stringify(r.value!.blocks[1])).toContain('"marks":["bold"]');
  });
  it("chunking never splits a surrogate pair", () => {
    const r = markdownToRichContent("a" + "😀".repeat(15000));
    for (const b of r.value!.blocks as { runs?: { text?: string }[] }[]) for (const run of b.runs ?? []) if (run.text) {
      expect(/^[\uDC00-\uDFFF]/.test(run.text)).toBe(false);
      expect(/[\uD800-\uDBFF]$/.test(run.text)).toBe(false);
    }
  });
});

describe("RF1 nits", () => {
  it("colours are strict #RRGGBB in stored JSON (#RGB is refused by the validator)", () => {
    expect(P.validatePresentation({ schemaVersion: 1, preset: "default", tokens: { colors: { primary: "#14d" } } }).issues.map(i => i.code)).toContain("PRESENTATION_COLOR");
    expect(P.validatePresentation({ schemaVersion: 1, preset: "default", tokens: { colors: { primary: "#1144dd" } } }).value!.tokens!.colors!.primary).toBe("#1144DD");
  });
  it("an empty figure caption renders no empty <figcaption>", () => {
    const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    const r = render(<RichContentRenderer content={validateRichContent(doc({ type: "figure", asset: { dataUrl: PNG, origin: "uploaded" }, alt: "شكل", caption: [] })).value!} />);
    expect(r.container.querySelector("figure.xp-figure figcaption")).toBeNull();
  });
});
