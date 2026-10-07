// Phase 20G — certification exam C: COMPUTER SCIENCE (100 marks). Python, Java and C# coding in BOTH modes — editable full source (coding@2,
// the authoring version) and locked templates (coding@3) — official hidden-test grading through the API (the grading authority) and a Runner
// double that executes NOTHING and only reports raw per-case evidence; compile-error policies (teacher review vs explicit zero); a composite
// sharing a code source with a coding child; tracing, ordering, cloze and rubric questions.
import * as K from "../kit.js";

const { A } = K;
const LIMITS = { sourceBytes: 65536, outputBytes: 65536, timeMs: 2000, memoryMb: 128 };
const cfg = (langs, def, starterCode = {}, publicTests = []) => ({ allowedLanguages: langs, defaultLanguage: def, starterCode, taskMode: "program", inputMode: "stdin", outputMode: "stdout", limits: { ...LIMITS }, publicTests });
const key = (hiddenTests, compileErrorPolicy, references) => ({ gradingMode: "hiddenTests", comparator: "trimTrailingWhitespace", compileErrorPolicy, hiddenTests, referenceSolutions: references });
// hidden tests: the expected outputs and inputs are TEACHER data (canaried) — the student and the Runner never see them
const T = (id, input, expectedOutput, weight) => ({ id, title: K.canary("HT-" + id), input, expectedOutput, weight });

export const HIDDEN = {
  sum: [T("py-small", "1 2\n", "SUM=3\n", 1), T("py-neg", "-4 10\n", "SUM=6\n", 2), T("py-big", "1000000 2000000\n", "SUM=3000000\n", 3)],
  rev: [T("j-word", "networking\n", "gnikrowten\n", 1), T("j-ar", "شبكة\n", "ةكبش\n", 1)],
  upper: [T("cs-1", "router\n", "ROUTER\n", 1), T("cs-2", "vlan 10\n", "VLAN 10\n", 1)],
  vowels: [T("v-1", "education\n", "5\n", 1), T("v-2", "rhythm\n", "0\n", 1), T("v-3", "AEIOU\n", "5\n", 2)],
  child: [T("c-1", "3\n", "6\n", 1), T("c-2", "10\n", "55\n", 3)]
};
export const CS_SOURCE = "def f(n):\n    total = 0\n    for i in range(1, n + 1):\n        total += i\n    return total\n\nprint(f(4))\n";

export function examC() {
  return K.exam("CERT20G-C-CS", "شهادة 20G — امتحان علم الحاسوب", [
    K.section("c-s1", "القسم الأول: التتبّع والمفاهيم", [
      K.mcq("c1-1", "ما مخرجات البرنامج المعروض في المصدر المشترك عند n = 4؟", 3, ["4", "10", "24"], 1),
      K.mcq("c1-2", "ما رتبة تعقيد البحث الثنائي في أسوأ الحالات؟", 3, ["O(n)", "O(log n)", "O(n²)"], 1),
      K.shortAnswer("c1-3", "ما قيمة len([1, 2, 3])؟", 2, "3"),
      K.tableFill("c1-4", "أكمل جدول تتبّع الحلقة for i in range(3): s += i (القيمة الابتدائية s = 0):", 4, ["i", "s بعد التكرار"], [["0", ""], ["1", ""], ["2", ""]], [["s0", 0, 1, "0"], ["s1", 1, 1, "1"], ["s2", 2, 1, "3"]]),
      K.ordering("c1-5", "رتّب خطوات ترجمة برنامج Java وتشغيله:", 4, ["كتابة الملف Main.java", "javac Main.java", "java Main"]),
      K.fillBlank("c1-6", "أكمل: الكلمة المحجوزة لتعريف دالة في Python هي ____ ، وللخروج من الحلقة ____ .", 4, [["f1", "تعريف الدالة", "def"], ["f2", "الخروج من الحلقة", "break"]])
    ]),
    K.section("c-s2", "القسم الثاني: البرمجة", [
      K.coding("c2-1", "اكتب برنامج Python يقرأ عددين صحيحين ويطبع SUM=<المجموع>.", 15, 2, cfg(["python"], "python", {}, [{ id: "pub-1", input: "2 3\n", sampleOutput: "SUM=5\n" }]),
        key(HIDDEN.sum, "manualReview", { python: K.canary("REF-PY-SUM") })),
      K.coding("c2-2", "اكتب برنامج Java يقرأ كلمة ويطبعها معكوسة.", 15, 2, cfg(["java"], "java", { java: "import java.util.Scanner;\npublic class Main {\n  public static void main(String[] args) {\n    // اكتب الحل هنا\n  }\n}\n" }),
        key(HIDDEN.rev, "manualReview", { java: K.canary("REF-JAVA-REV") })),
      K.coding("c2-3", "أكمل برنامج C# ليطبع السطر المُدخل بأحرف كبيرة.", 15, 3, { ...cfg(["csharp"], "csharp"), template: { language: "csharp", segments: [
        { kind: "locked", text: "using System;\npublic class Program {\n  public static void Main() {\n    string line = Console.ReadLine();\n    Console.WriteLine(" },
        { kind: "editable", id: "expr", starter: "line" },
        { kind: "locked", text: ");\n  }\n}\n" }] } }, key(HIDDEN.upper, "zero", { csharp: K.canary("REF-CS-UPPER") })),
      K.coding("c2-4", "أكمل الدالة count_vowels في Python (القالب مقفل إلا جسم الدالة).", 15, 3, { ...cfg(["python"], "python"), template: { language: "python", segments: [
        { kind: "locked", text: "def count_vowels(text):\n" },
        { kind: "editable", id: "body", starter: "    return 0\n" },
        { kind: "locked", text: "\n\nprint(count_vowels(input()))\n" }] } }, key(HIDDEN.vowels, "manualReview", { python: K.canary("REF-PY-VOWELS") }))
    ]),
    K.section("c-s3", "القسم الثالث: سؤال مركّب حول الكود", [
      K.composite("c3-1", "ادرس الكود في المصدر المشترك ثم أجب.", 20,
        [K.sourceContext("ctxCode", "الكود", [{ id: "code1", version: 1, kind: "code", title: "sum.py", language: "python", source: CS_SOURCE }])],
        [K.group("gTrace", "تتبّع", [
          K.part("t1", "أ", K.mcq("x", "كم مرة يُنفَّذ جسم الحلقة عند n = 4؟", 4, ["3", "4", "5"], 1), { contextId: "ctxCode" }),
          K.part("t2", "ب", K.shortAnswer("x", "ما قيمة f(3)؟", 2, "6"), { contextId: "ctxCode" })
        ]), K.group("gCode", "البرمجة", [
          K.part("k1", "ج", K.coding("x", "اكتب برنامجًا يقرأ n ويطبع مجموع الأعداد من 1 إلى n.", 10, 2, cfg(["python", "java", "csharp"], "python"), key(HIDDEN.child, "manualReview", { python: K.canary("REF-CHILD") }))),
          K.part("o1", "د", K.openResponse("x", "اشرح لماذا يبدأ range من 1 وينتهي عند n + 1.", 4, "C31", [["explain", "الشرح", 4, [["full", 4], ["half", 2], ["none", 0]]]]), { contextId: "ctxCode" })
        ])])
    ])
  ], {
    coverPage: K.cover("الصف الحادي عشر — علم الحاسوب", "تُصحَّح البرامج على الخادم بحالات اختبار مخفية. الأخطاء التقنية لا تُحتسب صفرًا أبدًا."),
    presentation: { schemaVersion: 1, preset: "developerWorkspace", components: { code: { variant: "dark" } } }
  });
}

// ── what the students submit, and what the Runner double reports back for each (raw stdout per opaque case, nothing else) ────────────────
export const SRC = {
  sumOk: "a, b = map(int, input().split())\nprint('SUM=' + str(a + b))\n",
  sumNoNeg: "a, b = input().split()\nprint('SUM=' + str(abs(int(a)) + int(b)))\n",
  revOk: "import java.util.Scanner;\npublic class Main {\n  public static void main(String[] args) {\n    String w = new Scanner(System.in).nextLine();\n    System.out.println(new StringBuilder(w).reverse());\n  }\n}\n",
  revBroken: "public class Main {\n  public static void main(String[] args) {\n    System.out.println(\"x\")\n  }\n}\n",
  upperOk: "line.ToUpper()",
  upperBroken: "line.ToUpper(",
  vowelsOk: "    return sum(1 for c in text.lower() if c in 'aeiou')\n",
  vowelsSlow: "    while True:\n        pass\n",
  childOk: "n = int(input())\nprint(n * (n + 1) // 2)\n"
};
export const ANSWERS = {
  PERFECT: {
    "c1-1": A.choice(1), "c1-2": A.choice(1), "c1-3": A.text("3"), "c1-4": A.fields({ s0: "0", s1: "1", s2: "3" }), "c1-5": A.seq(["كتابة الملف Main.java", "javac Main.java", "java Main"]), "c1-6": A.fields({ f1: "def", f2: "break" }),
    "c2-1": A.code(SRC.sumOk), "c2-2": A.code(SRC.revOk, "java"), "c2-3": A.template({ expr: SRC.upperOk }, "csharp"), "c2-4": A.template({ body: SRC.vowelsOk }),
    "c3-1": A.composite({ t1: A.choice(1), t2: A.text("6"), k1: A.code(SRC.childOk), o1: A.text("لأن range لا يشمل نهايته، فنكتب n + 1 ليُجمع n نفسه.") })
  },
  PARTIAL: {
    "c1-1": A.choice(0), "c1-2": A.choice(1), "c1-3": A.text("4"), "c1-4": A.fields({ s0: "0", s1: "1", s2: "2" }), "c1-5": A.seq(["javac Main.java", "كتابة الملف Main.java", "java Main"]), "c1-6": A.fields({ f1: "def", f2: "stop" }),
    "c2-1": A.code(SRC.sumNoNeg), "c2-2": A.code(SRC.revOk, "java"), "c2-3": A.template({ expr: SRC.upperOk }, "csharp"), "c2-4": A.template({ body: SRC.vowelsSlow }),
    "c3-1": A.composite({ t1: A.choice(0), t2: A.text("6"), k1: A.code(SRC.childOk), o1: A.text("لا أعرف.") })
  },
  COMPILE: {
    "c1-1": A.choice(1), "c2-1": A.code(SRC.sumOk), "c2-2": A.code(SRC.revBroken, "java"), "c2-3": A.template({ expr: SRC.upperBroken }, "csharp"), "c2-4": A.template({ body: SRC.vowelsOk })
  }
};
