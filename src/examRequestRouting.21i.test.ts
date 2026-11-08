import { describe, it, expect } from "vitest";
import {
  BANK_SUBJECT_DOMAIN, EXAM_SUBJECT_DOMAINS, PREFILL_CAPABILITY_KEYS, buildComposerPrefill, composerDifficultyFromTargets, detectExamSubject,
  detectRequestLanguage, detectSourcePreference, normalizeAiSubject, parseComposerPrefill, parseExamRouteDecision, resolveExamRoute, stripArabicArticles,
  normalizeRequestText
} from "./examRequestRouting";
import { COMPOSER_CAPABILITY_FLAGS, normalizeComposerIntent } from "./aiComposer/composerIntent";
import { COMPOSER_LIMITS } from "./aiComposer/composerLimits";
import { formFromPrefill, initialForm, intentInputOf } from "./aiComposer/composerForm";

// Phase 21I — multi-subject routing of the builder prompt. The bank (791381 networking) serves networking requests only; every other subject
// goes to the AI Full Exam Composer with a pre-filled, re-validated form.
const NETWORKING = "أنشئ امتحانًا من 20 سؤالًا، 12 BASIC و8 INFRASTRUCTURE، ركز على IPv4 وDHCP وOSPF، واجعل معظم الأسئلة سهلة ومتوسطة، وأضف سؤالين صور وسؤالين CLI";
const PHYSICS = "أريد امتحان فيزياء من 10 أسئلة عن السقوط الحر والمقذوفات والتسارع";
const PROGRAMMING_AR = "امتحان برمجة بلغة بايثون للصف العاشر فيه حلقات التكرار والمصفوفات و3 أسئلة كود";
const PROGRAMMING_EN = "Create a Python programming exam about loops and arrays with 2 coding questions";
const CHEMISTRY = "امتحان كيمياء عن التفاعلات الكيميائية والمعايرة والحموض مع محاكاة";
const MATH = "امتحان رياضيات عن الدوال والمشتقات وخطوط التقارب";
const PHYSICS_HE = "מבחן בפיזיקה על נפילה חופשית ותאוצה";
const HISTORY = "امتحان تاريخ عن الحرب العالمية الأولى";
const NET_NEW = "امتحان شبكات بأسئلة جديدة عن VLAN وTrunk";
const MIXED = "امتحان يجمع البرمجة بلغة بايثون والخوارزميات مع الشبكات وVLAN وOSPF";

describe("21I deterministic subject detection", () => {
  it.each([
    [NETWORKING, "networking"], [PHYSICS, "physics"], [PROGRAMMING_AR, "programming"], [PROGRAMMING_EN, "programming"],
    [CHEMISTRY, "chemistry"], [MATH, "mathematics"], [PHYSICS_HE, "physics"]
  ])("%s → %s (high confidence)", (prompt, domain) => {
    const d = detectExamSubject(prompt);
    expect(d.domain).toBe(domain);
    expect(d.confidence).toBe("high");
    expect(d.evidence.length).toBeGreaterThan(0);
  });
  it("a subject with no lexicon evidence is «other» with no confidence; two strong subjects are «mixed»", () => {
    expect(detectExamSubject(HISTORY)).toMatchObject({ domain: "other", confidence: "none", evidence: [] });
    expect(detectExamSubject(MIXED)).toMatchObject({ domain: "mixed", confidence: "low" });
  });
  it("Arabic articles and proclitics do not hide a term (السقوط الحر / بالشبكات / للمصفوفات)", () => {
    expect(stripArabicArticles(normalizeRequestText("السقوط الحر بالشبكات للمصفوفات والتسارع"))).toBe("سقوط حر شبكات مصفوفات تسارع");
    expect(stripArabicArticles("برمجه بايثون")).toBe("برمجه بايثون");   // a word's own letters are never removed
  });
  it("Latin terms match whole tokens only (no «rip» inside «script», no «nat» inside «natural»)", () => {
    expect(detectExamSubject("a natural script about descriptions").scores.networking).toBe(0);
    expect(detectExamSubject("configure RIP and NAT").scores.networking).toBe(2);
  });
  it("language and source preference", () => {
    expect(detectRequestLanguage(PHYSICS)).toBe("ar");
    expect(detectRequestLanguage(PROGRAMMING_EN)).toBe("en");
    expect(detectRequestLanguage(PHYSICS_HE)).toBe("he");
    expect(detectRequestLanguage(NETWORKING)).toBe("ar");   // English networking terms inside an Arabic request
    expect(detectSourcePreference(NET_NEW)).toBe("newQuestions");
    expect(detectSourcePreference("امتحان شبكات من بنك الأسئلة")).toBe("bank");
    expect(detectSourcePreference(PHYSICS)).toBe("unspecified");
  });
});

describe("21I route decision", () => {
  it("a networking request stays on the bank (unchanged flow) and may switch to the composer", () => {
    const r = resolveExamRoute({ ai: { domain: "networking", label: "شبكات" }, prompt: NETWORKING });
    expect(r).toMatchObject({ route: "bank", domain: "networking", confidence: "high", needsConfirmation: false });
    expect(r.allowedRoutes).toEqual(["bank", "composer"]);
  });
  it.each([[PHYSICS, "physics"], [PROGRAMMING_AR, "programming"], [CHEMISTRY, "chemistry"], [MATH, "mathematics"]])(
    "%s goes to the composer and the networking bank is NOT offered", (prompt, domain) => {
      const r = resolveExamRoute({ ai: { domain }, prompt });
      expect(r).toMatchObject({ route: "composer", domain, needsConfirmation: false });
      expect(r.allowedRoutes).toEqual(["composer"]);
    });
  it("the AI misclassifying a physics request as networking is overruled by the detector and flagged for confirmation", () => {
    const r = resolveExamRoute({ ai: { domain: "networking" }, prompt: PHYSICS });
    expect(r).toMatchObject({ route: "composer", domain: "physics", confidence: "low", needsConfirmation: true });
    expect(r.allowedRoutes).toContain("bank");                  // uncertain: the teacher may still decide
    expect(r.reasons[0]).toContain("تأكد");
  });
  it("the AI's «other» is overruled by a sure detector; an AI domain with supporting evidence is kept", () => {
    expect(resolveExamRoute({ ai: { domain: "other" }, prompt: CHEMISTRY })).toMatchObject({ domain: "chemistry", needsConfirmation: true });
    expect(resolveExamRoute({ ai: { domain: "mathematics" }, prompt: "امتحان فيزياء ورياضيات عن الدوال والتسارع" })).toMatchObject({ domain: "mathematics", needsConfirmation: false });
  });
  it("a provider without a valid classification falls back to the detector (non-strict providers)", () => {
    expect(resolveExamRoute({ ai: undefined, prompt: PROGRAMMING_EN })).toMatchObject({ route: "composer", domain: "programming", needsConfirmation: false, language: "en" });
    expect(resolveExamRoute({ ai: { domain: "biology!" }, prompt: NETWORKING })).toMatchObject({ route: "bank", domain: "networking" });
    const unknown = resolveExamRoute({ ai: null, prompt: HISTORY });
    expect(unknown).toMatchObject({ route: "composer", domain: "other", needsConfirmation: true });
    expect(unknown.allowedRoutes).toEqual(["bank", "composer"]);
  });
  it("«other» confirmed by the AI with no networking evidence offers the composer only", () => {
    expect(resolveExamRoute({ ai: { domain: "other", label: "تاريخ" }, prompt: HISTORY })).toMatchObject({ route: "composer", allowedRoutes: ["composer"], subjectLabel: "تاريخ" });
  });
  it("networking + «new questions» → composer; a non-networking request asking for the bank is told the bank has none", () => {
    expect(resolveExamRoute({ ai: { domain: "networking" }, prompt: NET_NEW })).toMatchObject({ route: "composer", sourcePreference: "newQuestions", allowedRoutes: ["bank", "composer"] });
    const r = resolveExamRoute({ ai: { domain: "physics", sourcePreference: "bank" }, prompt: PHYSICS });
    expect(r.route).toBe("composer");
    expect(r.reasons.join(" ")).toContain("المخزن لا يحتوي");
  });
  it("mixed requests are composed (one structured exam) with the bank still available", () => {
    expect(resolveExamRoute({ ai: { domain: "mixed" }, prompt: MIXED })).toMatchObject({ route: "composer", domain: "mixed", allowedRoutes: ["bank", "composer"] });
  });
  it("only networking can ever take the bank route", () => {
    for (const domain of EXAM_SUBJECT_DOMAINS) {
      for (const prompt of [NETWORKING, PHYSICS, HISTORY, MIXED]) {
        const r = resolveExamRoute({ ai: { domain }, prompt });
        if (r.route === "bank") expect(r.domain).toBe(BANK_SUBJECT_DOMAIN);
      }
    }
  });
});

describe("21I untrusted AI subject is bounded", () => {
  it("unknown enums become null, strings are cleaned and bounded, topics de-duplicated and capped", () => {
    const n = normalizeAiSubject({ domain: "DROP TABLE", label: "<b>فيزياء</b>\u0007" + "x".repeat(500), language: "fr", sourcePreference: "all", questionCountExplicit: "yes",
      durationMinutes: 99999, topics: [...Array(40)].map((_, i) => "t" + (i % 25)).concat(["", 5 as unknown as string]), course: { a: 1 }, grade: "11" });
    expect(n.domain).toBeNull();
    expect(n.language).toBeNull();
    expect(n.sourcePreference).toBeNull();
    expect(n.questionCountExplicit).toBe(false);
    expect(n.durationMinutes).toBeNull();
    expect(/[<>]/.test(n.label) || n.label.includes(String.fromCharCode(7))).toBe(false);
    expect(n.label.length).toBeLessThanOrEqual(COMPOSER_LIMITS.shortText);
    expect(n.topics.length).toBe(COMPOSER_LIMITS.topics);
    expect(n.course).toBe("");
    expect(n.grade).toBe("11");
    expect(normalizeAiSubject("not an object").domain).toBeNull();
  });
});

describe("21I composer pre-fill", () => {
  const ai = { domain: "physics", label: "فيزياء — الحركة", language: "ar", sourcePreference: "unspecified", questionCountExplicit: true, durationMinutes: 45, course: "", grade: "11", topics: ["السقوط الحر", "المقذوفات"] };
  const plan = { title: "امتحان فيزياء", totalMarks: 50, requestedQuestionCount: 10, totalQuestions: 10, difficultyTargets: { "1": 4, "2": 3, "3": 2, "4": 1, "5": 0 } };
  it("maps the request onto the composer's structured controls", () => {
    const decision = resolveExamRoute({ ai, prompt: PHYSICS });
    const p = buildComposerPrefill({ decision, ai, prompt: PHYSICS, plan });
    expect(p).toMatchObject({ v: 1, subject: "فيزياء — الحركة", grade: "11", language: "ar", totalMarks: 50, durationMinutes: 45, difficulty: "easy", questionTarget: 10,
      requiredTopics: ["السقوط الحر", "المقذوفات"], instruction: PHYSICS, notes: [] });
    expect(p.capabilities).toEqual({ coding: false, smartSim: true, parametric: true });
  });
  it("an unstated question count lets the composer choose; an over-limit count is clamped with a note; an over-long request is noted", () => {
    const decision = resolveExamRoute({ ai: { domain: "programming" }, prompt: PROGRAMMING_EN });
    expect(buildComposerPrefill({ decision, ai: { domain: "programming" }, prompt: PROGRAMMING_EN, plan }).questionTarget).toBeNull();
    const big = buildComposerPrefill({ decision, ai: { domain: "programming", questionCountExplicit: true }, prompt: PROGRAMMING_EN, plan: { ...plan, requestedQuestionCount: 500 } });
    expect(big.questionTarget).toBe(COMPOSER_LIMITS.items);
    expect(big.notes[0]).toContain(String(COMPOSER_LIMITS.items));
    const long = buildComposerPrefill({ decision, prompt: "python code ".repeat(400), plan });
    expect(long.notes.join(" ")).toContain(String(COMPOSER_LIMITS.instructionChars));
  });
  it("subject defaults: programming turns coding on, chemistry has no composer simulation (noted when one is requested)", () => {
    const prog = resolveExamRoute({ ai: { domain: "programming" }, prompt: PROGRAMMING_AR });
    expect(buildComposerPrefill({ decision: prog, prompt: PROGRAMMING_AR, plan }).capabilities).toMatchObject({ coding: true, smartSim: false });
    const chem = resolveExamRoute({ ai: { domain: "chemistry" }, prompt: CHEMISTRY });
    const c = buildComposerPrefill({ decision: chem, prompt: CHEMISTRY, plan });
    expect(c.capabilities.smartSim).toBe(true);                   // «مع محاكاة» explicitly asked
    expect(c.notes.join(" ")).toContain("الكيمياء");
    expect(buildComposerPrefill({ decision: chem, prompt: "امتحان كيمياء عن الحموض", plan }).capabilities.smartSim).toBe(false);
  });
  it("difficulty mapping from the 1–5 distribution", () => {
    expect(composerDifficultyFromTargets({ "1": 4, "2": 4, "3": 2 })).toBe("easy");
    expect(composerDifficultyFromTargets({ "3": 2, "4": 3, "5": 2 })).toBe("hard");
    expect(composerDifficultyFromTargets({ "2": 1, "3": 8, "4": 1 })).toBe("medium");
    expect(composerDifficultyFromTargets({ "1": 4, "2": 5, "3": 7, "4": 3, "5": 1 })).toBe("mixed");
    expect(composerDifficultyFromTargets(null)).toBe("mixed");
  });
  it("every pre-fill capability key is a real composer capability flag (drift guard)", () => {
    for (const k of PREFILL_CAPABILITY_KEYS) expect(COMPOSER_CAPABILITY_FLAGS as readonly string[]).toContain(k);
  });
  it("a pre-filled composer form produces an intent the composer's own normalizer accepts (end to end, every subject)", () => {
    for (const [prompt, domain] of [[PHYSICS, "physics"], [PROGRAMMING_EN, "programming"], [CHEMISTRY, "chemistry"], [MATH, "mathematics"], [HISTORY, "other"], [MIXED, "mixed"], [NET_NEW, "networking"]] as const) {
      const decision = resolveExamRoute({ ai: { domain, questionCountExplicit: true }, prompt });
      const prefill = parseComposerPrefill(JSON.parse(JSON.stringify(buildComposerPrefill({ decision, ai: { domain, questionCountExplicit: true }, prompt, plan }))));
      expect(prefill, prompt).not.toBeNull();
      const r = normalizeComposerIntent(intentInputOf(formFromPrefill(prefill!)));
      expect(r.ok, prompt + JSON.stringify(r)).toBe(true);
      if (r.ok) {
        expect(r.intent.subject).toBe(prefill!.subject);
        expect(r.intent.teacherInstruction).toBe(prompt);
        expect(r.intent.totalMarks).toBe(50);
        expect(r.intent.questionTarget).toBe(10);
      }
    }
  });
  it("the form keeps every control the pre-fill does not name at its default", () => {
    const prefill = parseComposerPrefill({ v: 1, subject: "Python", totalMarks: 20, language: "en", difficulty: "hard", capabilities: { coding: true } })!;
    const f = formFromPrefill(prefill), d = initialForm();
    expect(f).toMatchObject({ subject: "Python", totalMarks: "20", language: "en", difficulty: "hard", questionTarget: "", durationMinutes: "", preset: d.preset, types: d.types });
    expect(f.capabilities).toEqual({ ...d.capabilities, coding: true });
  });
});

describe("21I client re-checks of server payloads", () => {
  it("a malformed decision / pre-fill is refused (the UI then keeps the bank flow / shows no composer form)", () => {
    expect(parseExamRouteDecision(null)).toBeNull();
    expect(parseExamRouteDecision({ v: 1, route: "teleport", domain: "physics" })).toBeNull();
    expect(parseExamRouteDecision({ v: 2, route: "bank", domain: "networking" })).toBeNull();
    expect(parseComposerPrefill({ v: 1, subject: "", totalMarks: 10 })).toBeNull();
    expect(parseComposerPrefill({ v: 1, subject: "x", totalMarks: 0 })).toBeNull();
    expect(parseComposerPrefill({ v: 1, subject: "x", totalMarks: 10, questionTarget: 999, durationMinutes: -1, difficulty: "extreme", language: "fr" }))
      .toMatchObject({ questionTarget: null, durationMinutes: null, difficulty: "mixed", language: "ar" });
  });
  it("a decision always allows its own route and drops unknown routes", () => {
    const d = parseExamRouteDecision({ v: 1, route: "composer", domain: "physics", allowedRoutes: ["bank", "x"], reasons: ["a", 3] });
    expect(d?.allowedRoutes).toEqual(["composer", "bank"]);
    expect(d?.reasons).toEqual(["a"]);
    expect(d?.domainLabel).toBe("الفيزياء");
  });
});
