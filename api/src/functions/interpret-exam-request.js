const { app } = require("@azure/functions");
const { withCachePolicy } = require("../lib/http-cache");   // Tadris+ P10-I: JSON responses default to private, no-store
const { withAiRateLimit } = require("../lib/ai-rate-limit");   // D3: per-teacher AI rate limit at registration
const fs = require("fs");
const path = require("path");
const { requireTeacherSession } = require("../lib/teacher-session");
const { requireCapability } = require("../lib/access/require-capability");   // Tadris+ P3-B
// Phase 21I — multi-subject routing: the SAME rules the Builder runs (src/examRequestRouting.ts, through the lib adapter).
const {
  EXAM_SUBJECT_DOMAINS,
  EXAM_SOURCE_PREFERENCES,
  EXAM_REQUEST_LANGUAGES,
  BANK_SUBJECT_DOMAIN,
  resolveExamRoute,
  buildComposerPrefill
} = require("../lib/exam-request-routing");

function loadConfig(fileName) {
  const candidates = [
    path.join(process.cwd(), "config", fileName),
    path.join(__dirname, "..", "..", "config", fileName)
  ];

  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) {
      return JSON.parse(
        fs.readFileSync(filePath, "utf8")
      );
    }
  }

  throw new Error(`Config file not found: ${fileName}`);
}

async function createOpenAIClient() {
  const module = await import("openai");
  const OpenAI = module.default;
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  return new OpenAI({ apiKey });
}

async function createZaiClient() {
  const module = await import("openai");
  const OpenAI = module.default;

  const apiKey = process.env.ZAI_API_KEY;
  const baseURL =
    process.env.ZAI_BASE_URL ||
    "https://api.z.ai/api/paas/v4";

  if (!apiKey) {
    throw new Error(
      "ZAI_API_KEY is not configured."
    );
  }

  return new OpenAI({
    apiKey,
    baseURL
  });
}
async function createQwenClient() {
  const module = await import("openai");
  const OpenAI = module.default;

  const apiKey = process.env.QWEN_API_KEY;

  // Preferred: set a workspace-specific Model Studio
  // compatible-mode URL in QWEN_BASE_URL.
  // The legacy international endpoint remains functional.
  const baseURL =
    process.env.QWEN_BASE_URL ||
    "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";

  if (!apiKey) {
    throw new Error(
      "QWEN_API_KEY is not configured."
    );
  }

  return new OpenAI({
    apiKey,
    baseURL
  });
}
function parseJsonObjectText(value) {
  let text = String(value || "").trim();

  if (text.startsWith("```")) {
    text = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
  }

  return JSON.parse(text);
}
function buildSchema(topicCodes) {
  const countProperty = {
    type: "integer",
    minimum: 0,
    maximum: 40
  };

  return {
    type: "object",
    additionalProperties: false,
    properties: {
      title: {
        type: "string"
      },
      totalQuestions: {
        type: "integer",
        minimum: 1,
        maximum: 40
      },
      requestedQuestionCount: {
        type: "integer",
        minimum: 0,
        maximum: 10000
      },
      totalMarks: {
        type: "integer",
        minimum: 1,
        maximum: 500
      },
      sectionTargets: {
        type: "object",
        additionalProperties: false,
        properties: {
          BASIC: countProperty,
          INFRASTRUCTURE: countProperty
        },
        required: ["BASIC", "INFRASTRUCTURE"]
      },
      difficultyTargets: {
        type: "object",
        additionalProperties: false,
        properties: {
          "1": countProperty,
          "2": countProperty,
          "3": countProperty,
          "4": countProperty,
          "5": countProperty
        },
        required: ["1", "2", "3", "4", "5"]
      },
      topicTargets: {
        type: "array",
        maxItems: 20,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            topic: {
              type: "string",
              enum: topicCodes
            },
            count: {
              type: "integer",
              minimum: 1,
              maximum: 40
            }
          },
          required: ["topic", "count"]
        }
      },
      excludedTopics: {
        type: "array",
        items: {
          type: "string",
          enum: topicCodes
        }
      },
      typeTargets: {
        type: "object",
        additionalProperties: false,
        properties: {
          multipleChoice: countProperty,
          fillBlank: countProperty,
          wordBank: countProperty,
          open: countProperty
        },
        required: [
          "multipleChoice",
          "fillBlank",
          "wordBank",
          "open"
        ]
      },
      minimums: {
        type: "object",
        additionalProperties: false,
        properties: {
          images: countProperty,
          cli: countProperty,
          calculations: countProperty
        },
        required: ["images", "cli", "calculations"]
      },
      rules: {
        type: "object",
        additionalProperties: false,
        properties: {
          excludeNeedsReview: {
            type: "boolean"
          },
          avoidSameFamily: {
            type: "boolean"
          },
          preferOfficialSources: {
            type: "boolean"
          },
          avoidPreviouslyUsed: {
            type: "boolean"
          },
          recentExamCount: {
            type: "integer",
            minimum: 0,
            maximum: 20
          }
        },
        required: [
          "excludeNeedsReview",
          "avoidSameFamily",
          "preferOfficialSources",
          "avoidPreviouslyUsed",
          "recentExamCount"
        ]
      },
      explanation: {
        type: "string"
      },
      // Phase 21I — the request's subject. Only networking can be served by the classified bank; every other subject is routed to the
      // AI Full Exam Composer. Untrusted: re-checked in code (resolveExamRoute) against a deterministic detector.
      subject: {
        type: "object",
        additionalProperties: false,
        properties: {
          domain: {
            type: "string",
            enum: [...EXAM_SUBJECT_DOMAINS]
          },
          label: {
            type: "string"
          },
          language: {
            type: "string",
            enum: [...EXAM_REQUEST_LANGUAGES]
          },
          sourcePreference: {
            type: "string",
            enum: [...EXAM_SOURCE_PREFERENCES]
          },
          questionCountExplicit: {
            type: "boolean"
          },
          durationMinutes: {
            type: "integer",
            minimum: 0,
            maximum: 600
          },
          course: {
            type: "string"
          },
          grade: {
            type: "string"
          },
          topics: {
            type: "array",
            maxItems: 20,
            items: {
              type: "string"
            }
          }
        },
        required: [
          "domain",
          "label",
          "language",
          "sourcePreference",
          "questionCountExplicit",
          "durationMinutes",
          "course",
          "grade",
          "topics"
        ]
      }
    },
    required: [
      "title",
      "totalQuestions",
      "requestedQuestionCount",
      "totalMarks",
      "sectionTargets",
      "difficultyTargets",
      "topicTargets",
      "excludedTopics",
      "typeTargets",
      "minimums",
      "rules",
      "explanation",
      "subject"
    ]
  };
}

function buildInstructions(topicsConfig) {
  return `
أنت محلل طلبات Tadris+ (منصة الامتحانات).

المستخدم معلم يكتب وصفًا حرًا بالعربية أو العبرية أو الإنجليزية
للامتحان الذي يريد بناءه. المنصة تدعم مواضيع متعددة: شبكات الاتصال، البرمجة،
الفيزياء، الكيمياء، الرياضيات، وغيرها.

مهمتك هنا تحليل الطلب فقط وتحويله إلى خطة منظمة.
لا تؤلف أي سؤال ولا تجب عن أي سؤال.

أولًا — تصنيف الموضوع (الحقل subject):
أ. subject.domain هو موضوع الامتحان الذي يطلبه المعلم فعلًا، وليس موضوع هذه التعليمات:
   networking = شبكات الاتصال (791381، IPv4، VLAN، OSPF، DHCP، CLI...)
   programming = برمجة (Python، Java، C#، خوارزميات...)
   physics = فيزياء، chemistry = كيمياء، mathematics = رياضيات
   mixed = أكثر من موضوع من هذه المواضيع معًا، other = موضوع آخر (تاريخ، لغة، علوم عامة...).
   لا تصنّف الطلب networking إلا إذا كان عن شبكات الاتصال صراحة.
ب. subject.label اسم الموضوع كما يفهمه المعلم بلغته (مثل «فيزياء — الحركة» أو «Python»)، قصير.
ج. subject.language لغة الطلب: ar أو en أو he.
د. subject.sourcePreference: bank إذا طلب المعلم صراحة أسئلة من المخزن/البنك، newQuestions إذا طلب تأليف أسئلة جديدة، وإلا unspecified.
هـ. subject.questionCountExplicit=true فقط إذا ذكر المعلم عدد الأسئلة صراحة.
و. subject.durationMinutes مدة الامتحان بالدقائق إن ذُكرت، وإلا 0.
ز. subject.course وsubject.grade المساق والصف إن ذُكرا، وإلا نص فارغ.
ح. subject.topics مواضيع الطلب بكلمات المعلم نفسه (حتى 20، قصيرة)، لأي موضوع كان.

ثانيًا — خطة مخزن الأسئلة: مخزن الأسئلة المصنف يغطي شبكات الاتصال (791381) فقط.
القواعد التالية (الأقسام BASIC/INFRASTRUCTURE ورموز المواضيع) تخص طلبات الشبكات.
إذا كان الطلب عن موضوع آخر فاملأ حقول الخطة بالقيم الافتراضية، واترك topicTargets وexcludedTopics فارغة،
ولا تستخدم رموز مواضيع الشبكات، واستخرج مع ذلك العدد والعلامة والصعوبة والعنوان من الطلب.

المواضيع المسموحة (لطلبات الشبكات) هي فقط:
${JSON.stringify(topicsConfig.topics, null, 2)}

قواعد الخطة:
1. الحد الأقصى المطلق لعدد الأسئلة في أي امتحان هو 40. totalQuestions هو العدد الفعلي الذي سيُستخدم لبناء الامتحان ويجب ألا يتجاوز 40 أبدًا مهما كان طلب المستخدم أكبر. إذا لم يذكر المستخدم عددًا استخدم 20 لـtotalQuestions.
1ب. requestedQuestionCount يمثل العدد الذي طلبه المستخدم فعليًا في نص طلبه بالضبط (حتى لو كان أكبر من 40 أو غير منطقي مثل 100 أو 1000)، بدون أي تقييد. إذا لم يذكر المستخدم عددًا صريحًا، اجعله مساويًا لنفس قيمة totalQuestions.
2. إذا ذكر العلامة النهائية فاحترمها. إذا لم يذكرها استخدم 100.
3. sectionTargets يجب أن يساوي مجموعهما totalQuestions بالضبط.
4. إذا لم يحدد توزيع BASIC / INFRASTRUCTURE، استخدم تقريبًا 60% BASIC و40% INFRASTRUCTURE.
5. difficultyTargets يجب أن يساوي مجموعها totalQuestions بالضبط.
6. إذا لم يحدد الصعوبة، استخدم توزيعًا مدرسيًا متوازنًا تقريبًا: 20% مستوى 1، 25% مستوى 2، 35% مستوى 3، 15% مستوى 4، 5% مستوى 5.
7. إذا قال طلاب ضعفاء أو سهل، زد المستويات 1 و2 وخفف 4 و5.
8. إذا قال متقدم أو صعب، زد 4 و5 مع إبقاء الامتحان قابلًا للحل.
9. topicTargets تمثل فقط المواضيع التي طلب لها عددًا أو تركيزًا واضحًا. لا يلزم أن يساوي مجموعها totalQuestions.
10. typeTargets تمثل الأعداد الصريحة التي طلبها المستخدم من الأنواع. إذا لم يحدد نوعًا معينًا فضع 0 له، ولا توزع العدد المتبقي افتراضيًا.
11. الأنواع المقصودة:
   multipleChoice = أمريكي / اختيار من متعدد
   fillBlank = أكمل الناقص
   wordBank = مخزن كلمات
   open = سؤال مفتوح
12. minimums تمثل الحدود الدنيا التي طلبها المستخدم للصور أو CLI أو الحسابات. إذا لم يطلب شيئًا فضع 0.
13. excludeNeedsReview=true افتراضيًا.
14. avoidSameFamily=true افتراضيًا.
15. preferOfficialSources=true افتراضيًا.
16. avoidPreviouslyUsed=false افتراضيًا وrecentExamCount=0 ما لم يطلب المستخدم خلاف ذلك.
17. لا تستخدم موضوعًا غير موجود في القائمة.
18. explanation بالعربية، قصيرة وواضحة، تلخص كيف فهمت الطلب.
`;
}

function clampInteger(value, min, max) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return min;
  }

  return Math.max(
    min,
    Math.min(max, Math.round(number))
  );
}

function normalizeDistribution(
  raw,
  keys,
  total,
  defaultWeights
) {
  const values = {};
  let sum = 0;

  for (const key of keys) {
    const value = Math.max(
      0,
      Number(raw?.[key] || 0)
    );
    values[key] = value;
    sum += value;
  }

  const source =
    sum > 0
      ? values
      : defaultWeights;

  const sourceSum = keys.reduce(
    (acc, key) => acc + Number(source[key] || 0),
    0
  );

  if (sourceSum <= 0) {
    const result = {};
    keys.forEach((key, index) => {
      result[key] = index === 0 ? total : 0;
    });
    return result;
  }

  const exact = keys.map(key => ({
    key,
    value:
      (Number(source[key] || 0) / sourceSum) * total
  }));

  const result = {};
  let assigned = 0;

  for (const item of exact) {
    const base = Math.floor(item.value);
    result[item.key] = base;
    assigned += base;
  }

  let remainder = total - assigned;

  exact
    .map(item => ({
      ...item,
      fraction: item.value - Math.floor(item.value)
    }))
    .sort((a, b) => b.fraction - a.fraction)
    .forEach(item => {
      if (remainder > 0) {
        result[item.key] += 1;
        remainder -= 1;
      }
    });

  return result;
}

function normalizePlan(plan, prompt) {
  const totalQuestions = clampInteger(
    plan?.totalQuestions || 20,
    1,
    40
  );

  // Reported by the AI separately from totalQuestions so a request like "100 questions" can
  // still be shown to the teacher as "requested: 100 / approved: 40" instead of being silently
  // clamped away before the teacher ever sees the original number.
  const requestedQuestionCount = clampInteger(
    plan?.requestedQuestionCount || totalQuestions,
    0,
    10000
  );

  const totalMarks = clampInteger(
    plan?.totalMarks || 100,
    1,
    500
  );

  const sectionTargets = normalizeDistribution(
    plan?.sectionTargets,
    ["BASIC", "INFRASTRUCTURE"],
    totalQuestions,
    {
      BASIC: 60,
      INFRASTRUCTURE: 40
    }
  );

  const difficultyTargets = normalizeDistribution(
    plan?.difficultyTargets,
    ["1", "2", "3", "4", "5"],
    totalQuestions,
    {
      "1": 20,
      "2": 25,
      "3": 35,
      "4": 15,
      "5": 5
    }
  );

  const topicTargets = Array.isArray(plan?.topicTargets)
    ? plan.topicTargets
        .map(item => ({
          topic: String(item.topic || ""),
          count: clampInteger(item.count, 1, totalQuestions)
        }))
        .filter(item => item.topic)
    : [];

  const typeTargets = {
    multipleChoice: clampInteger(
      plan?.typeTargets?.multipleChoice || 0,
      0,
      totalQuestions
    ),
    fillBlank: clampInteger(
      plan?.typeTargets?.fillBlank || 0,
      0,
      totalQuestions
    ),
    wordBank: clampInteger(
      plan?.typeTargets?.wordBank || 0,
      0,
      totalQuestions
    ),
    open: clampInteger(
      plan?.typeTargets?.open || 0,
      0,
      totalQuestions
    )
  };

  const minimums = {
    images: clampInteger(
      plan?.minimums?.images || 0,
      0,
      totalQuestions
    ),
    cli: clampInteger(
      plan?.minimums?.cli || 0,
      0,
      totalQuestions
    ),
    calculations: clampInteger(
      plan?.minimums?.calculations || 0,
      0,
      totalQuestions
    )
  };

  // Phase 21I — the default title names the request's subject (it used to be «امتحان شبكات» for every request).
  const defaultTitle = "امتحان " + resolveExamRoute({ ai: plan?.subject, prompt }).subjectLabel;

  return {
    title: String(plan?.title || defaultTitle).trim() || defaultTitle,
    originalRequest: String(prompt || "").trim(),
    totalQuestions,
    requestedQuestionCount,
    totalMarks,
    sectionTargets,
    difficultyTargets,
    topicTargets,
    excludedTopics: Array.isArray(plan?.excludedTopics)
      ? [...new Set(plan.excludedTopics.map(String))]
      : [],
    typeTargets,
    minimums,
    rules: {
      excludeNeedsReview:
        plan?.rules?.excludeNeedsReview !== false,
      avoidSameFamily:
        plan?.rules?.avoidSameFamily !== false,
      preferOfficialSources:
        plan?.rules?.preferOfficialSources !== false,
      avoidPreviouslyUsed:
        plan?.rules?.avoidPreviouslyUsed === true,
      recentExamCount: clampInteger(
        plan?.rules?.recentExamCount || 0,
        0,
        20
      )
    },
    explanation: String(plan?.explanation || "").trim()
  };
}

/**
 * Phase 21I — the response for an analysed request: the normalized bank plan (unchanged contract), the code-owned ROUTE decision
 * (bank | composer, with the reasons the teacher sees and the routes the teacher may switch to) and the composer form pre-fill.
 * A networking request keeps the bank flow exactly as before; any other subject is never matched against the networking bank.
 */
function buildInterpretResult(rawPlan, prompt, topicsConfig, provider, model) {
  const plan = {
    ...normalizePlan(rawPlan, prompt),
    aiProvider: provider,
    aiModel: model
  };
  const route = resolveExamRoute({ ai: rawPlan?.subject, prompt });
  // A request routed away from the bank never carries networking topic targets into a later bank run: a teacher switching to the bank
  // for an uncertain subject starts with no topic selected and chooses the topics (as for any request whose topics were not detected),
  // instead of starting from codes the model guessed.
  if (route.domain !== BANK_SUBJECT_DOMAIN) {
    plan.topicTargets = [];
    plan.excludedTopics = [];
  }
  plan.subjectDomain = route.domain;
  const composerPrefill = buildComposerPrefill({ decision: route, ai: rawPlan?.subject, prompt, plan });
  return {
    ok: true,
    plan,
    topics: topicsConfig.topics,
    provider,
    model,
    route,
    composerPrefill
  };
}

app.http("interpretExamRequest", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "interpret-exam-request",

  handler: withCachePolicy(withAiRateLimit("interpret-exam-request", "ai-general", async request => {
    try {
      const auth = await requireTeacherSession(request);

      if (!auth.ok) {
        return auth.response;
      }
      const capabilityDenial = await requireCapability(auth, "interpret-exam-request.js", "*", {}, null);   // Tadris+ P3-B
      if (capabilityDenial) return capabilityDenial;

      let body = {};

      try {
        body = await request.json();
      }
      catch {
        body = {};
      }

      const prompt = String(body?.prompt || "").trim();

      if (!prompt) {
        return {
          status: 400,
          jsonBody: {
            ok: false,
            error: "اكتب وصف الامتحان أولًا."
          }
        };
      }

      if (prompt.length > 10000) {
        return {
          status: 400,
          jsonBody: {
            ok: false,
            error: "طلب الامتحان طويل جدًا."
          }
        };
      }

      const topicsConfig = loadConfig("topics.json");
      const topicCodes = topicsConfig.topics.map(
        item => item.code
      );

      const requestedProvider =
        String(body?.provider || "glm")
          .trim()
          .toLowerCase();

      const provider =
        ["glm", "qwen", "qwenplus", "openai"]
          .includes(requestedProvider)
          ? requestedProvider
          : "glm";

      let model = "";
      let rawPlan = null;

      const schema = buildSchema(topicCodes);

      const jsonSystemInstruction =
        buildInstructions(topicsConfig) +
        "\n\nReturn JSON only. " +
        "The response must be valid JSON " +
        "and follow this JSON schema:\n" +
        JSON.stringify(schema);

      if (provider === "glm") {
        const zai = await createZaiClient();

        model =
          process.env.ZAI_MODEL ||
          "glm-5.3-flash";

        const response =
          await zai.chat.completions.create({
            model,
            messages: [
              {
                role: "system",
                content: jsonSystemInstruction
              },
              {
                role: "user",
                content: prompt
              }
            ],
            response_format: {
              type: "json_object"
            },
            temperature: 0.1,
            max_tokens: 2200
          });

        const outputText =
          response?.choices?.[0]
            ?.message?.content;

        if (!outputText) {
          throw new Error(
            "GLM returned no JSON response."
          );
        }

        rawPlan =
          parseJsonObjectText(outputText);
      }
      else if (
        provider === "qwen" ||
        provider === "qwenplus"
      ) {
        const qwen =
          await createQwenClient();

        model =
          provider === "qwenplus"
            ? (
                process.env.QWEN_PLUS_MODEL ||
                "qwen3.7-plus"
              )
            : (
                process.env.QWEN_MODEL ||
                "qwen3.5-flash"
              );

        const response =
          await qwen.chat.completions.create({
            model,
            messages: [
              {
                role: "system",
                content: jsonSystemInstruction
              },
              {
                role: "user",
                content: prompt
              }
            ],
            response_format: {
              type: "json_object"
            },

            // Qwen 3.5 supports hybrid thinking.
            // Node OpenAI SDK sends this custom field
            // at the top level as required by Model Studio.
            enable_thinking: false,

            temperature: 0.1
          });

        const outputText =
          response?.choices?.[0]
            ?.message?.content;

        if (!outputText) {
          throw new Error(
            "Qwen returned no JSON response."
          );
        }

        rawPlan =
          parseJsonObjectText(outputText);
      }
      else {
        const openai =
          await createOpenAIClient();

        model =
          process.env.OPENAI_MODEL ||
          "gpt-5.6-luna";

        const response =
          await openai.responses.create({
            model,
            store: false,
            instructions:
              buildInstructions(topicsConfig),
            input: [
              {
                role: "user",
                content: [
                  {
                    type: "input_text",
                    text: prompt
                  }
                ]
              }
            ],
            text: {
              format: {
                type: "json_schema",
                name: "exam_plan",
                strict: true,
                schema
              }
            },
            max_output_tokens: 2200
          });

        if (!response.output_text) {
          throw new Error(
            "OpenAI returned no output_text"
          );
        }

        rawPlan =
          JSON.parse(response.output_text);
      }

      return {
        status: 200,
        jsonBody: buildInterpretResult(rawPlan, prompt, topicsConfig, provider, model)
      };
    }
    catch {
      return {
        status: 500,
        jsonBody: {
          ok: false,
          error: "تعذر تحليل طلب الامتحان حاليًا."
        }
      };
    }
  }))
});

// Exported only for unit testing the question-count clamping rule (clampInteger/normalizePlan
// have no other external callers — app.http's own route registration above is unaffected).
module.exports = { clampInteger, normalizePlan, buildSchema, buildInstructions, buildInterpretResult };


