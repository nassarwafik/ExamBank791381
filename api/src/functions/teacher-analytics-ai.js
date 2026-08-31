const { app } = require("@azure/functions");
const { requireBuilderAuth } = require("../lib/builder-auth");
const { getContainer } = require("../lib/platform-storage");
const { computeTeacherAnalytics } = require("../lib/teacher-analytics-core");

// Same default provider (GLM via the Z.ai-compatible endpoint) already used by
// interpret-exam-request.js for teacher-facing AI features in this project.
async function createZaiClient() {
  const module = await import("openai");
  const OpenAI = module.default;
  const apiKey = process.env.ZAI_API_KEY;
  const baseURL = process.env.ZAI_BASE_URL || "https://api.z.ai/api/paas/v4";
  if (!apiKey) throw new Error("ZAI_API_KEY is not configured.");
  return new OpenAI({ apiKey, baseURL });
}

function pct(value) {
  return value === null || value === undefined ? "لا توجد بيانات كافية" : value + "%";
}

function buildClassPrompt(data) {
  const k = data.kpis;
  const topics = data.topicAnalytics.slice(0, 8)
    .map(t => "- " + t.topic + ": " + pct(t.average) + " (" + t.gradedQuestions + " إجابة مصححة)")
    .join("\n") || "لا توجد بيانات موضوعات كافية بعد.";
  const classes = data.classComparison
    .map(c => "- " + c.name + ": المتوسط " + pct(c.average) + "، نسبة التسليم " + c.completionRate + "%")
    .join("\n") || "لا توجد بيانات صفوف كافية.";
  const followUp = data.followUp.slice(0, 10)
    .map(f => "- " + f.displayName + ": المعدل " + pct(f.average) + "، الأسباب: " + (f.reasons.join("، ") || "—"))
    .join("\n") || "لا يوجد طلاب بحاجة متابعة حاليًا.";

  return "أنت مساعد تربوي يحلل بيانات أداء صف دراسي في منصة اختبارات إلكترونية اسمها ExamBank، وتقدّم نصائح عملية للمعلم باللغة العربية.\n\n" +
    "نطاق التحليل: " + data.scope.className + "\n" +
    "متوسط العلامات العام: " + pct(k.average) + "\n" +
    "نسبة التسليم: " + k.completionRate + "%\n" +
    "عدد الطلاب الذين يحتاجون متابعة: " + k.followUpStudents + "\n" +
    "اتجاه الأداء مقارنة بالواجبات السابقة: " + (k.performanceChange > 0 ? "تحسّن" : k.performanceChange < 0 ? "تراجع" : "مستقر") + " (" + k.performanceChange + "%)\n\n" +
    "أداء الموضوعات (من الأضعف إلى الأقوى):\n" + topics + "\n\n" +
    "مقارنة الصفوف:\n" + classes + "\n\n" +
    "طلاب يحتاجون متابعة (عيّنة):\n" + followUp + "\n\n" +
    "المطلوب منك:\n" +
    "1. حدد أهم 2-3 نقاط ضعف حقيقية تستحق تدخل المعلم (مثل موضوع معيّن ضعيف، أو نمط تراجع لدى مجموعة طلاب).\n" +
    "2. اقترح إجراءات عملية ومحددة (مثال: مراجعة موضوع معيّن مع الصف قبل الواجب القادم، أو إنشاء امتحان قصير يركّز على موضوع ضعيف).\n" +
    "3. اذكر نقطة إيجابية واحدة على الأقل إن وُجدت لتحفيز المعلم.\n" +
    "اكتب الرد كفقرات قصيرة واضحة بالعربية، دون عناوين أو تنسيق برمجي، بأسلوب مباشر وعملي لا يتجاوز 200 كلمة.";
}

function buildStudentPrompt(detail) {
  const topics = detail.topicAnalytics.slice(0, 8)
    .map(t => "- " + t.topic + ": " + pct(t.average))
    .join("\n") || "لا توجد بيانات موضوعات كافية بعد لهذا الطالب.";
  const trend = detail.scoreTrend.slice(-6)
    .map(p => "- " + p.title + ": " + p.percentage + "%")
    .join("\n") || "لا توجد نتائج كافية لرسم اتجاه.";

  return "أنت مساعد تربوي يحلل أداء طالب واحد في منصة اختبارات إلكترونية اسمها ExamBank، وتقدّم نصائح شخصية للمعلم بخصوص هذا الطالب تحديدًا باللغة العربية.\n\n" +
    "اسم الطالب: " + detail.displayName + "\n" +
    "الصف: " + (detail.className || "—") + "\n" +
    "المعدل العام: " + pct(detail.average) + "\n" +
    "عدد الواجبات المكتملة: " + detail.completed + " من " + detail.assigned + "\n" +
    "عدد الواجبات غير المسلّمة: " + detail.missing + "\n" +
    "اتجاه الأداء: " + (detail.trend === "improving" ? "تحسّن" : detail.trend === "declining" ? "تراجع" : "مستقر") + " (" + detail.trendDelta + "%)\n" +
    "آخر تسجيل دخول: " + (detail.lastLoginAt || "لم يسجل الدخول بعد") + "\n\n" +
    "أداء الموضوعات لهذا الطالب:\n" + topics + "\n\n" +
    "تطور آخر الدرجات:\n" + trend + "\n\n" +
    "المطلوب منك:\n" +
    "1. حدد أهم نقطة ضعف أو نمط يستدعي الانتباه لدى هذا الطالب تحديدًا (موضوع معيّن، تراجع، غياب عن الدخول...).\n" +
    "2. اقترح للمعلم إجراءً عمليًا محددًا لمساعدة هذا الطالب (مراجعة فردية لموضوع معيّن، تمرين إضافي، متابعة حضور...).\n" +
    "3. اذكر نقطة قوة واحدة لدى الطالب إن وُجدت.\n" +
    "اكتب الرد كفقرات قصيرة واضحة بالعربية، بأسلوب مباشر وعملي، لا يتجاوز 150 كلمة.";
}

app.http("teacherAnalyticsAi", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "teacher-analytics-ai",
  handler: async request => {
    try {
      const auth = requireBuilderAuth(request);
      if (!auth.ok) return auth.response;

      let body = {};
      try { body = await request.json(); } catch { body = {}; }
      const classId = String(body?.classId || "").trim();
      const studentId = String(body?.studentId || "").trim();

      const container = getContainer();
      const data = await computeTeacherAnalytics(container, { classId, studentId });

      let prompt;
      if (studentId) {
        if (!data.studentDetail) {
          return { status: 404, jsonBody: { ok: false, error: "لا توجد بيانات كافية لهذا الطالب ضمن هذا النطاق." } };
        }
        prompt = buildStudentPrompt(data.studentDetail);
      } else {
        prompt = buildClassPrompt(data);
      }

      const zai = await createZaiClient();
      const model = process.env.ZAI_MODEL || "glm-5.3-flash";
      const response = await zai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: "أنت مساعد تربوي محترف، ردودك مباشرة وعملية وباللغة العربية الفصحى فقط، بدون أي تنسيق Markdown أو JSON." },
          { role: "user", content: prompt }
        ],
        temperature: 0.4,
        max_tokens: 700
      });

      const advice = response?.choices?.[0]?.message?.content;
      if (!advice) throw new Error("AI returned no content.");

      return {
        status: 200,
        jsonBody: { ok: true, advice: String(advice).trim(), scope: studentId ? "student" : "class" }
      };
    } catch {
      return {
        status: 500,
        jsonBody: { ok: false, error: "تعذر إجراء التحليل الذكي حاليًا." }
      };
    }
  }
});
