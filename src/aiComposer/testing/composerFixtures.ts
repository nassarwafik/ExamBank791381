// Phase 20F — ACCEPTANCE FIXTURES A–E as deterministic scripted model outputs (intent + plan + one section draft per planned section).
// They run through the REAL endpoint handler and the REAL client orchestration (tests); the generated exams are exported to
// docs/fixtures/ai-composer-20f/ and pinned. Test-only module.
import * as F from "./composerFakeAi";

type Json = Record<string, unknown>;
export type ComposerFixture = { name: string; intent: Json; plan: Json; sections: Json[] };

// ── A — Arabic networking exam: 100 marks, 120 min, 4 sections, networkLab ────────────────────────────────────────────────────────────
const NET_INSTRUCTION = "أنشئ امتحان شبكات للصف الحادي عشر من 100 علامة. قسم نظري وقسم عملي. استخدم VLAN وVTP وDHCP وRouter-on-a-Stick وPort Security. أضف سؤال Composite مع محاكي networkTopology@2. أضف جداول أجهزة وعنونة وCLI. اجعل التصميم networkLab ومتوسط الصعوبة.";
const A: ComposerFixture = {
  name: "A-network",
  intent: { v: 1, subject: "الشبكات", course: "شبكات الحاسوب", grade: "11", language: "ar", totalMarks: 100, durationMinutes: 120, difficulty: "medium", sectionTarget: 4, presentationPreset: "networkLab", requiredTopics: ["IPv4", "VLAN", "VTP", "Trunk", "DHCP", "Router-on-a-Stick", "Port Security"], teacherInstruction: NET_INSTRUCTION },
  plan: F.plan("امتحان الشبكات — الصف الحادي عشر", "networkLab", [
    F.planSection("أساسيات العنونة IPv4", [F.planItem("multipleChoice", 4, { topic: "IPv4" }), F.planItem("multipleChoice", 4, { topic: "IPv4/CIDR" }), F.planItem("inlineCloze", 6, { topic: "IPv4/CIDR" }), F.planItem("trueFalse", 2, { topic: "IPv4", difficulty: "easy" }), F.planItem("shortAnswer", 4, { topic: "IPv4" })]),
    F.planSection("الشبكات المحلية الافتراضية", [F.planItem("multipleChoice", 3, { topic: "VLAN" }), F.planItem("inlineCloze", 6, { topic: "VTP" }), F.planItem("openResponse", 8, { topic: "Trunk", difficulty: "hard" }), F.planItem("multipleChoice", 3, { topic: "Port Security" }), F.planItem("networkCli", 5, { topic: "VLAN" })]),
    F.planSection("خدمات الشبكة", [F.planItem("multipleChoice", 4, { topic: "DHCP" }), F.planItem("inlineCloze", 6, { topic: "DHCP" }), F.planItem("openResponse", 10, { topic: "DHCP", difficulty: "hard" })]),
    F.planSection("العملي المتكامل", [F.planItem("composite", 20, { topic: "Router-on-a-Stick", simulator: "networkTopology", scenario: "roas", difficulty: "hard" }), F.planItem("smartSim", 15, { topic: "DHCP", simulator: "networkTopology", scenario: "dhcp" })])
  ], { learningGoals: ["عنونة IPv4", "VLAN وTrunk", "خدمات DHCP"], unsupportedRequests: [] }),
  sections: [
    { items: [
      F.item("multipleChoice", { topic: "IPv4", question: F.mcq("كم عدد بتات عنوان IPv4؟", ["32", "64", "128", "16"]) }),
      F.item("multipleChoice", { topic: "IPv4/CIDR", question: F.mcq("ما قناع الشبكة المكافئ لـ /26؟", ["255.255.255.192", "255.255.255.128", "255.255.255.224", "255.255.255.0"]), stem: [F.table(["الشبكة", "البادئة"], [["192.168.1.0", "/26"]], "جدول العنونة")] }),
      F.item("inlineCloze", { topic: "IPv4/CIDR", question: F.cloze("أكمل الفقرة", [F.piece({ text: "الشبكة 192.168.1.0/24 تحتوي " }), F.piece({ kind: "textBlank", accepted: ["254"] }), F.piece({ text: " عنوانًا صالحًا للأجهزة، وعنوان البث هو " }), F.piece({ kind: "dropdown", options: ["192.168.1.255", "192.168.1.0"], correctIndex: 0 }), F.piece({ text: "." })]) }),
      F.item("trueFalse", { topic: "IPv4", difficulty: "easy", question: F.tf("العنوان 10.0.0.1 عنوان خاص.", true) }),
      F.item("shortAnswer", { topic: "IPv4", question: F.shortAns("ما الفرق بين العنوان العام والخاص؟", "الخاص لا يُوجَّه على الإنترنت") })
    ] },
    { items: [
      F.item("multipleChoice", { topic: "VLAN", question: F.mcq("ما فائدة VLAN؟", ["تقسيم الشبكة منطقيًا", "زيادة سرعة الكابل", "تشفير البيانات"]), stem: [F.table(["الجهاز", "المنفذ", "VLAN"], [["PC1", "Fa0/1", "10"], ["PC2", "Fa0/2", "10"], ["PC3", "Fa0/11", "20"]], "جدول الأجهزة")] }),
      F.item("inlineCloze", { topic: "VTP", question: F.cloze("أكمل", [F.piece({ text: "في VTP يُنشئ السويتش في وضع " }), F.piece({ kind: "dropdown", options: ["server", "client"], correctIndex: 0 }), F.piece({ text: " شبكات VLAN بينما يستقبلها " }), F.piece({ kind: "dropdown", options: ["client", "server"], correctIndex: 0 }), F.piece({ text: "." })]) }),
      F.item("openResponse", { topic: "Trunk", difficulty: "hard", question: F.open("اشرح وظيفة منفذ Trunk ودور Native VLAN.", [F.criterion("دقة المفهوم", 4), F.criterion("مثال تطبيقي", 4)]), stem: [F.cli("SW1(config)# interface g0/1\nSW1(config-if)# switchport mode trunk", "أوامر الإعداد")] }),
      F.item("multipleChoice", { topic: "Port Security", question: F.mcq("ماذا يفعل وضع المخالفة shutdown في Port Security؟", ["يعطّل المنفذ", "يرسل تحذيرًا فقط", "يتجاهل الإطارات"]) }),
      F.item("networkCli", { topic: "VLAN", question: F.q19("networkCli", "اضبط السويتش: أنشئ VLAN 10 باسم STAFF واجعل المنفذ Fa0/1 access في VLAN 10.", { networkCli: { scoring: "proportional", initialHostname: "Switch", initialVlans: [], initialInterfaces: [], targetHostname: "Switch", targetVlans: [{ id: 10, name: "STAFF" }], targetInterfaces: [{ name: "fa0/1", mode: "access", accessVlan: 10, nativeVlan: 0, adminState: "", ipAddress: "", subnetMask: "" }] } }) })
    ] },
    { items: [
      F.item("multipleChoice", { topic: "DHCP", question: F.mcq("أي أمر يحدد البوابة الافتراضية في مجمّع DHCP؟", ["default-router", "dns-server", "network"]), stem: [F.cli("R1(config)# ip dhcp pool LAN\nR1(dhcp-config)# network 192.168.1.0 255.255.255.0")] }),
      F.item("inlineCloze", { topic: "DHCP", question: F.cloze("أكمل مراحل DHCP", [F.piece({ text: "تبدأ العملية برسالة " }), F.piece({ kind: "dropdown", options: ["Discover", "Request"], correctIndex: 0 }), F.piece({ text: " ثم Offer ثم " }), F.piece({ kind: "dropdown", options: ["Request", "Discover"], correctIndex: 0 }), F.piece({ text: " ثم ACK." })]) }),
      F.item("openResponse", { topic: "DHCP", difficulty: "hard", question: F.open("قارن بين العنونة الثابتة والعنونة عبر DHCP في شبكة مدرسة.", [F.criterion("المقارنة", 5), F.criterion("التبرير", 5)], "compare") })
    ] },
    { items: [
      F.item("composite", { topic: "Router-on-a-Stick", difficulty: "hard", composite: F.composite("استخدم محاكي الشبكة المشترك للإجابة عن البنود التالية.", F.simContext(F.netSim("roas", "شبكة Router-on-a-Stick")), [
        F.group([F.part("smartSim", 4, { linked: true, simChecks: ["k1", "k2", "k3", "k4", "k5"], simText: "أنشئ شبكات VLAN واربط المنافذ" }), F.part("smartSim", 6, { linked: true, simChecks: ["k6", "k7", "k8", "k9", "k10", "k11"], simText: "اضبط Trunk والواجهات الفرعية" }), F.part("smartSim", 4, { linked: true, simChecks: ["k12"], simText: "تحقق من الاتصال بين PC1 وPC3" })], { title: "العمل على المحاكي" }),
        F.group([F.part("multipleChoice", 3, { linked: true, question: F.mcq("لماذا نحتاج إلى واجهات فرعية في Router-on-a-Stick؟", ["لتوجيه كل VLAN عبر منفذ واحد", "لزيادة السرعة", "لتشفير البيانات"]) }), F.part("openResponse", 3, { linked: true, question: F.open("فسّر لماذا لا يصل PC1 إلى PC3 قبل ضبط الراوتر.", [F.criterion("التفسير", 3)]) })], { title: "التحليل" })
      ]) }),
      F.item("smartSim", { topic: "DHCP", smartSim: { text: "اضبط خدمة DHCP على الراوتر حتى يحصل PC1 وPC2 على عناوين.", sim: F.netSim("dhcp", "شبكة DHCP") } })
    ] }
  ]
};

// ── B — physics, scienceLab, 100 marks ─────────────────────────────────────────────────────────────────────────────────────────────────
const B: ComposerFixture = {
  name: "B-physics",
  intent: { v: 1, subject: "الفيزياء", grade: "10", language: "ar", totalMarks: 100, difficulty: "mixed", sectionTarget: 3, presentationPreset: "scienceLab", requiredTopics: ["السقوط الحر", "القذف"], teacherInstruction: "امتحان فيزياء عن السقوط الحر والقذف الرأسي مع محاكاة وجداول وصيغ." },
  plan: F.plan("امتحان الحركة في بعد واحد", "scienceLab", [
    F.planSection("المفاهيم", [F.planItem("multipleChoice", 5, { topic: "السقوط الحر" }), F.planItem("parametricNumeric", 10, { topic: "السقوط الحر" }), F.planItem("openResponse", 15, { topic: "القذف", difficulty: "hard" })]),
    F.planSection("المحاكاة", [F.planItem("smartSim", 20, { topic: "السقوط الحر", simulator: "physicsFreeFall" }), F.planItem("smartSim", 20, { topic: "القذف", simulator: "physicsFreeFall" })]),
    F.planSection("سياق مشترك", [F.planItem("composite", 30, { topic: "القذف", simulator: "physicsFreeFall", difficulty: "hard" })])
  ]),
  sections: [
    { items: [
      F.item("multipleChoice", { topic: "السقوط الحر", question: F.mcq("ما تسارع الجسم الساقط سقوطًا حرًا قرب سطح الأرض؟", ["9.8 م/ث² نحو الأسفل", "صفر", "9.8 م/ث² نحو الأعلى"]), stem: [F.math("a = -g"), F.table(["الكمية", "الرمز", "الوحدة"], [["الارتفاع", "y", "m"], ["السرعة", "v", "m/s"]], "رموز الحركة")] }),
      F.item("parametricNumeric", { topic: "السقوط الحر", question: F.numericParam("جسم يسقط من السكون. احسب مقدار سرعته بعد {{t}} ثانية (g = 10 م/ث²).", [["t", 1, 9]], "10*t") }),
      F.item("openResponse", { topic: "القذف", difficulty: "hard", question: F.open("اشرح لماذا تكون السرعة صفرًا عند أعلى نقطة في القذف الرأسي بينما التسارع لا يساوي صفرًا.", [F.criterion("الفهم الفيزيائي", 6), F.criterion("استخدام المصطلحات", 4)]) })
    ] },
    { items: [
      F.item("smartSim", { topic: "السقوط الحر", smartSim: { text: "يسقط جسم من السكون من ارتفاع 20 م. استخدم المحاكاة لقياس زمن الوصول وسرعة الارتطام.", sim: F.physSim(20, 0, 9.8, ["impactTime", "impactSpeed", "heightAtTime"], ["impactPoint"], 1) } }),
      F.item("smartSim", { topic: "القذف", smartSim: { text: "قُذف جسم إلى الأعلى بسرعة 10 م/ث من ارتفاع 30 م. قِس أقصى ارتفاع وزمن الوصول إليه.", sim: F.physSim(30, 10, 10, ["maxHeight", "apexTime", "impactTime"], ["apexPoint"]) } })
    ] },
    { items: [
      F.item("composite", { topic: "القذف", difficulty: "hard", composite: F.composite("استخدم محاكاة القذف المشتركة للإجابة عن البنود التالية.", F.simContext(F.physSim(25, 5, 9.8, ["impactTime", "maxHeight", "velocityAtTime"], ["apexPoint"], 1)), [
        F.group([F.part("smartSim", 8, { linked: true, simChecks: ["impact-time"], simText: "زمن الوصول إلى الأرض" }), F.part("smartSim", 8, { linked: true, simChecks: ["max-height", "apex-point"], simText: "أقصى ارتفاع وأعلى نقطة" }), F.part("smartSim", 4, { linked: true, simChecks: ["velocity-at-t"], simText: "السرعة عند 1 ث" })], { title: "القياس" }),
        F.group([F.part("multipleChoice", 4, { linked: true, question: F.mcq("متى تتغيّر إشارة السرعة؟", ["عند أعلى نقطة", "عند الارتطام", "لا تتغيّر"]) }), F.part("openResponse", 6, { linked: true, question: F.open("فسّر شكل منحنى السرعة مع الزمن.", [F.criterion("التفسير", 3), F.criterion("الربط بالتسارع", 3)]) })], { title: "التفسير" })
      ]) })
    ] }
  ]
};

// ── C — computer science, developerWorkspace (Python, Java, C# — public material only) ─────────────────────────────────────────────────
const C: ComposerFixture = {
  name: "C-computer-science",
  intent: { v: 1, subject: "علوم الحاسوب", grade: "12", language: "ar", totalMarks: 60, difficulty: "medium", sectionTarget: 2, presentationPreset: "developerWorkspace", requiredTopics: ["Python", "Java", "C#"], teacherInstruction: "امتحان برمجة يشمل Python وJava وC# مع أسئلة مفاهيمية وأسئلة كتابة برامج." },
  plan: F.plan("امتحان البرمجة", "developerWorkspace", [
    F.planSection("المفاهيم", [F.planItem("multipleChoice", 5, { topic: "Python" }), F.planItem("tableFill", 10, { topic: "Python" }), F.planItem("openResponse", 10, { topic: "Java" })]),
    F.planSection("كتابة البرامج", [F.planItem("coding", 10, { topic: "Python" }), F.planItem("coding", 10, { topic: "Java" }), F.planItem("coding", 15, { topic: "C#", difficulty: "hard" })])
  ]),
  sections: [
    { items: [
      F.item("multipleChoice", { topic: "Python", question: { ...F.mcq("ماذا يطبع البرنامج؟", ["6", "5", "خطأ"]), codeStimulus: { language: "python", source: "x = 2\nprint(x * 3)", label: "البرنامج" } } }),
      F.item("tableFill", { topic: "Python", question: F.q19("tableFill", "تتبّع قيم المتغيرات في الحلقة.", { tableFill: { headers: ["i", "s"], rows: [["0", "0"], ["1", "1"], ["2", "3"]], answerCells: [{ row: 1, column: 1, correct: "1" }, { row: 2, column: 1, correct: "3" }] } }) }),
      F.item("openResponse", { topic: "Java", question: F.open("اشرح الفرق بين int وInteger في Java.", [F.criterion("الدقة", 5), F.criterion("الأمثلة", 5)]), stem: [F.rb("code", { language: "java", source: "Integer a = 5;\nint b = a;", title: "مثال" })] })
    ] },
    { items: [
      F.item("coding", { topic: "Python", question: F.coding("اكتب برنامجًا يقرأ عددين ويطبع مجموعهما.", "python") }),
      F.item("coding", { topic: "Java", question: F.coding("اكتب برنامج Java يقرأ عددًا ويطبع مربعه.", "java", [["4", "16"]]) }),
      F.item("coding", { topic: "C#", difficulty: "hard", question: F.coding("اكتب برنامج C# يقرأ سلسلة ويطبعها معكوسة.", "csharp", [["abc", "cba"]]) })
    ] }
  ]
};

// ── D — mathematics: functionStudy2d@1, parametric, rich math, composite ───────────────────────────────────────────────────────────────
const RATIONAL = { tasks: ["domainExclusions", "xIntercepts", "yIntercept", "verticalAsymptotes", "horizontalAsymptotes", "extrema", "monotonicIntervals"], extrema: [{ kind: "min", x: 0, y: 2 }, { kind: "max", x: 4, y: 0.2222222222222222 }], intervals: [{ kind: "decreasing", from: "-inf", to: "-2" }, { kind: "decreasing", from: "-2", to: "0" }, { kind: "increasing", from: "0", to: "1" }, { kind: "increasing", from: "1", to: "4" }, { kind: "decreasing", from: "4", to: "+inf" }] };
const D: ComposerFixture = {
  name: "D-mathematics",
  intent: { v: 1, subject: "الرياضيات", grade: "12", language: "ar", totalMarks: 50, difficulty: "hard", sectionTarget: 2, presentationPreset: "modernAcademic", teacherInstruction: "دراسة دالة كسرية وأسئلة بمعطيات متغيرة." },
  plan: F.plan("امتحان دراسة الدوال", "modernAcademic", [
    F.planSection("الحساب", [F.planItem("parametricNumeric", 6, { topic: "الاشتقاق" }), F.planItem("multipleChoice", 4, { topic: "النهايات" })]),
    F.planSection("دراسة دالة", [F.planItem("smartSim", 20, { topic: "دراسة دالة كسرية", simulator: "functionStudy2d" }), F.planItem("composite", 20, { topic: "دراسة دالة كسرية", simulator: "functionStudy2d" })])
  ]),
  sections: [
    { items: [
      F.item("parametricNumeric", { topic: "الاشتقاق", question: F.numericParam("إذا كانت f(x) = {{a}}x² فاحسب f′(2).", [["a", 1, 9]], "4*a") }),
      F.item("multipleChoice", { topic: "النهايات", question: F.mcq("ما نهاية 1/x عندما تقترب x من اللانهاية؟", ["0", "1", "∞"]), stem: [F.math("\\lim_{x\\to\\infty} \\frac{1}{x}")] })
    ] },
    { items: [
      F.item("smartSim", { topic: "دراسة دالة كسرية", smartSim: { text: "ادرس الدالة f(x) = (2x − 4) / ((x − 1)(x + 2)) باستخدام أداة دراسة الدوال.", sim: F.funcSim(RATIONAL) } }),
      F.item("composite", { topic: "دراسة دالة كسرية", composite: F.composite("استخدم الدالة المشتركة للإجابة عن البنود.", F.simContext(F.funcSim({})), [
        F.group([F.part("smartSim", 8, { linked: true, simChecks: ["domain", "vertical-asymptotes"], simText: "استثناءات المجال وخطوط التقارب الرأسية" }), F.part("smartSim", 4, { linked: true, simChecks: ["x-intercepts", "y-intercept"], simText: "المقاطع" })]),
        F.group([F.part("multipleChoice", 4, { linked: true, question: F.mcq("ما خط التقارب الأفقي؟", ["y = 0", "y = 2", "لا يوجد"]) }), F.part("openResponse", 4, { linked: true, question: F.open("فسّر سلوك الدالة قرب x = 1.", [F.criterion("التفسير", 4)]) })])
      ]) })
    ] }
  ]
};

// ── E — mixed enterprise showcase ────────────────────────────────────────────────────────────────────────────────────────────────────
const E: ComposerFixture = {
  name: "E-showcase",
  intent: { v: 1, subject: "مشروع متكامل", grade: "12", language: "ar", totalMarks: 80, difficulty: "mixed", sectionTarget: 2, presentationPreset: "cards", capabilities: { visual: true }, teacherInstruction: "امتحان عرض يجمع جداول وصورًا ومحاكاة وأسئلة مفتوحة وبرمجة ومعطيات متغيرة." },
  plan: F.plan("امتحان العرض المتكامل", "cards", [
    F.planSection("مصادر ومحاكاة", [F.planItem("composite", 20, { topic: "مصدر جدولي" }), F.planItem("smartSim", 15, { topic: "السقوط الحر", simulator: "physicsFreeFall" }), F.planItem("multipleChoice", 5, { topic: "الشبكات" })]),
    F.planSection("إنتاج", [F.planItem("openResponse", 15, { topic: "التحليل" }), F.planItem("parametricNumeric", 10, { topic: "الحساب" }), F.planItem("coding", 15, { topic: "Python" })])
  ]),
  sections: [
    { items: [
      F.item("composite", { topic: "مصدر جدولي", composite: F.composite("اقرأ الجدول ثم أجب.", F.sourceContext("نتائج تجربة", [F.table(["الزمن (ث)", "المسافة (م)"], [["1", "5"], ["2", "20"], ["3", "45"]], "قياسات"), F.callout("لاحظ نمط تزايد المسافة.", "note", "ملاحظة")]), [
        F.group([F.part("multipleChoice", 5, { linked: true, question: F.mcq("كيف تتغير المسافة مع الزمن؟", ["تربيعيًا", "خطيًا", "ثابتة"]) }), F.part("multipleChoice", 5, { linked: true, question: F.mcq("كم المسافة عند 2 ث؟", ["20 م", "10 م", "5 م"]) })], { title: "أسئلة أ", policy: "firstNAnswered", requiredAnswers: 1 }),
        F.group([F.part("openResponse", 15, { linked: true, question: F.open("اشرح العلاقة بين الزمن والمسافة.", [F.criterion("التفسير", 5)]) })], { title: "تفسير" })
      ]) }),
      F.item("smartSim", { topic: "السقوط الحر", smartSim: { text: "قِس زمن سقوط كرة من 45 م.", sim: F.physSim(45, 0, 10, ["impactTime"], []) } }),
      F.item("multipleChoice", { topic: "الشبكات", question: F.mcq("أي جهاز يظهر في الصورة؟", ["راوتر", "سويتش", "نقطة وصول"]), assetRequest: { description: "صورة لجهاز راوتر Cisco من الأمام تُظهر المنافذ G0/0 وG0/1." } })
    ] },
    { items: [
      F.item("openResponse", { topic: "التحليل", question: F.open("حلل أثر زيادة الارتفاع على زمن السقوط.", [F.criterion("التحليل", 6), F.criterion("الدقة", 4)], "analyze") }),
      F.item("parametricNumeric", { topic: "الحساب", question: F.numericParam("احسب {{a}} × {{b}}.", [["a", 2, 9], ["b", 2, 9]], "a*b") }),
      F.item("coding", { topic: "Python", question: F.coding("اكتب برنامجًا يطبع الأعداد من 1 إلى n.", "python", [["3", "1\n2\n3"]]) })
    ] }
  ]
};

export const COMPOSER_FIXTURES: readonly ComposerFixture[] = Object.freeze([A, B, C, D, E]);
export const fixtureScript = (f: ComposerFixture) => ({ ai_exam_plan: [f.plan], ai_exam_section: f.sections });
