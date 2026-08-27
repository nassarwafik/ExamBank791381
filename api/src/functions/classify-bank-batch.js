const { app } = require("@azure/functions");
const { BlobServiceClient } = require("@azure/storage-blob");
const fs = require("fs");
const path = require("path");

const BANK_CONTAINER = "bank";
const ASSETS_CONTAINER = "assets";
const INDEX_BLOB = "index/questions-index.json";
const MAX_BATCH_SIZE = 12;
const DEFAULT_BATCH_SIZE = 10;

function loadConfig(fileName) {
  const candidates = [
    path.join(process.cwd(), "config", fileName),
    path.join(__dirname, "..", "..", "config", fileName)
  ];

  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    }
  }

  throw new Error(`Config file not found: ${fileName}`);
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function downloadBlobBuffer(containerClient, blobName) {
  const blobClient = containerClient.getBlobClient(blobName);
  const response = await blobClient.download();
  if (!response.readableStreamBody) {
    throw new Error(`Could not download ${blobName}`);
  }
  return await streamToBuffer(response.readableStreamBody);
}

async function downloadBlobJson(containerClient, blobName) {
  const buffer = await downloadBlobBuffer(containerClient, blobName);
  return JSON.parse(buffer.toString("utf8"));
}

async function uploadJson(containerClient, blobName, data) {
  const text = JSON.stringify(data, null, 2);
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  await blockBlobClient.uploadData(Buffer.from(text, "utf8"), {
    blobHTTPHeaders: {
      blobContentType: "application/json; charset=utf-8"
    }
  });
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

function isFinalReviewStatus(value) {
  return value === "classified" || value === "needs-review";
}

function isPendingIndexQuestion(question) {
  return !isFinalReviewStatus(question?.reviewStatus);
}

function isFinalSourceQuestion(question) {
  return isFinalReviewStatus(question?.reviewStatus)
    || isFinalReviewStatus(question?.classification?.status);
}

function normalizeKnownSection(section) {
  return section === "BASIC" || section === "INFRASTRUCTURE"
    ? section
    : null;
}

function buildQuestionText(question) {
  const lines = [];

  lines.push(`Question ID: ${question.id}`);
  lines.push(`Source ID: ${question.sourceId || ""}`);
  lines.push(`Question number: ${question.questionNumber || ""}`);
  lines.push(`Current section: ${question.section || "UNKNOWN"}`);
  lines.push(`Question type: ${question.type || ""}`);
  lines.push(`Original type: ${question.originalType || ""}`);

  lines.push("");
  lines.push("QUESTION:");
  lines.push(question.text || "");

  if (question.parentGroup) {
    lines.push("");
    lines.push("PARENT / GROUP CONTEXT:");
    lines.push(JSON.stringify(question.parentGroup, null, 2));
  }

  if (Array.isArray(question.options) && question.options.length > 0) {
    lines.push("");
    lines.push("OPTIONS:");
    for (const option of question.options) {
      lines.push(`${option.label}: ${option.text}`);
    }
  }

  if (Array.isArray(question.fields) && question.fields.length > 0) {
    lines.push("");
    lines.push("FIELDS:");
    for (const field of question.fields) {
      lines.push(`${field.order}. ${field.label}`);
    }
  }

  if (Array.isArray(question.parts) && question.parts.length > 0) {
    lines.push("");
    lines.push("PARTS:");
    for (const part of question.parts) {
      lines.push(`${part.order}. ${part.label}`);
      if (Array.isArray(part.options)) {
        for (const option of part.options) {
          lines.push(`   ${option.label}: ${option.text}`);
        }
      }
    }
  }

  lines.push("");
  lines.push("ANSWER MODEL:");
  lines.push(JSON.stringify(question.answer || {}, null, 2));

  lines.push("");
  lines.push("QUESTION FLAGS:");
  lines.push(JSON.stringify(question.flags || {}, null, 2));

  return lines.join("\n");
}

async function buildImageInputs(question, assetsContainer) {
  const result = [];

  if (!Array.isArray(question.assets)) {
    return result;
  }

  for (const asset of question.assets) {
    if (!asset?.blobName) {
      continue;
    }

    const buffer = await downloadBlobBuffer(assetsContainer, asset.blobName);
    const contentType = asset.contentType || "image/png";
    const dataUrl = `data:${contentType};base64,${buffer.toString("base64")}`;

    result.push({
      type: "input_image",
      image_url: dataUrl,
      detail: "high"
    });
  }

  return result;
}

function classificationItemSchema(topicCodes, questionIds) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      questionId: {
        type: "string",
        enum: questionIds
      },
      section: {
        type: "string",
        enum: ["BASIC", "INFRASTRUCTURE"]
      },
      primaryTopic: {
        type: "string",
        enum: topicCodes
      },
      secondaryTopics: {
        type: "array",
        items: {
          type: "string",
          enum: topicCodes
        },
        maxItems: 3
      },
      difficulty: {
        type: "integer",
        minimum: 1,
        maximum: 5
      },
      difficultyReason: {
        type: "string"
      },
      difficultyConfidence: {
        type: "number",
        minimum: 0,
        maximum: 1
      },
      familyKey: {
        type: "string"
      },
      hasCLI: {
        type: "boolean"
      },
      requiresCalculation: {
        type: "boolean"
      },
      needsReview: {
        type: "boolean"
      },
      reviewReason: {
        type: "string"
      }
    },
    required: [
      "questionId",
      "section",
      "primaryTopic",
      "secondaryTopics",
      "difficulty",
      "difficultyReason",
      "difficultyConfidence",
      "familyKey",
      "hasCLI",
      "requiresCalculation",
      "needsReview",
      "reviewReason"
    ]
  };
}

function buildBatchSchema(topicCodes, questionIds) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      classifications: {
        type: "array",
        minItems: questionIds.length,
        maxItems: questionIds.length,
        items: classificationItemSchema(topicCodes, questionIds)
      }
    },
    required: ["classifications"]
  };
}

function buildInstructions(topicsConfig, difficultyConfig) {
  return `
أنت خبير في تصنيف أسئلة شبكات الاتصال للامتحان 791381.
ستصنف عدة أسئلة في الطلب نفسه. يجب أن تعيد تصنيفًا واحدًا بالضبط لكل questionId، دون حذف أو تكرار.

==================================================
SECTION
==================================================

القيم المسموحة فقط: BASIC أو INFRASTRUCTURE.

إذا كان Current section للسؤال هو BASIC أو INFRASTRUCTURE، أعد نفس القيمة بالضبط ولا تغيّرها؛ لأنها مأخوذة من بنية امتحان رسمي.

إذا كان Current section هو LEGACY أو UNKNOWN أو فارغًا، صنفه وفق طبيعة السؤال:

BASIC:
- أنظمة العد والتحويلات الأساسية.
- IPv4/IPv6، Class، Private/Public، APIPA، Subnet Mask وCIDR والحسابات الأساسية.
- أجهزة الشبكة، Topologies، MAC، OSI/TCP-IP، البروتوكولات والخدمات ووظائفها.
- معلومات نظرية أو تشخيص مباشر لا يتطلب Configuration متقدمًا.

INFRASTRUCTURE:
- Cisco Configuration أو CLI عندما يكون جوهر السؤال إعداد راوتر/سويتش أو تحليل أوامر متقدمة.
- VLAN, VTP, Trunk, 802.1Q, Router-on-a-Stick, Port Security.
- DHCP configuration، Routing، Static Route، OSPF، RIP، EIGRP.
- ACL، NAT/PAT، إعداد WAN/Metro أو سيناريو Topology يحتاج إعدادات/استنتاجات بنيوية.

وجود كلمة Cisco وحدها لا يكفي لجعل السؤال INFRASTRUCTURE؛ مثال سؤال بسيط عن وظيفة ping يمكن أن يبقى BASIC.

==================================================
TOPIC
==================================================
اختر primaryTopic واحدًا فقط ويمكن حتى 3 secondaryTopics.
استخدم الأكثر تخصصًا الممكن.

التصنيفات:
${JSON.stringify(topicsConfig.topics, null, 2)}

أمثلة:
OSPF -> OSPF وليس ROUTING فقط.
CIDR أو Subnet Mask -> SUBNET_CIDR.
DHCP -> DHCP.

==================================================
DIFFICULTY
==================================================
السياق والمعيار المعتمد نفسه الذي استُخدم في أسئلة 2025 المصنفة:
${JSON.stringify(difficultyConfig, null, 2)}

قيّم الصعوبة بالنسبة لطلاب ضعفاء إلى دون المتوسط، والامتحان مفتوح المادة، ولديهم أمثلة محلولة مشابهة.
استخدم SECTION النهائي الذي اخترته عند تطبيق قواعد الصعوبة.
صيغة السؤال جزء أساسي من الصعوبة.

==================================================
FAMILY KEY
==================================================
أنشئ familyKey إنجليزيًا قصيرًا وثابتًا يصف المهارة الأساسية وليس الأرقام الخاصة بالسؤال.
استعمل lowercase و - قدر الإمكان.
أمثلة:
dhcp-purpose
ospf-network-command
subnet-host-range
ipv4-valid-router-address
nvram-startup-config

==================================================
FLAGS
==================================================
hasCLI = true فقط عندما يحتاج الطالب قراءة/تمييز/كتابة أوامر CLI أو Cisco IOS.
requiresCalculation = true عندما يحتاج الحل حسابًا فعليًا مثل binary conversion أو CIDR/subnetting أو host calculations.

==================================================
REVIEW
==================================================
needsReview = true فقط إذا كان السؤال أو الصورة أو التصنيف ملتبسًا فعلًا ويستحق مراجعة المعلم.
إذا needsReview=false يجب أن يكون reviewReason = "".

==================================================
OUTPUT
==================================================
- لا تخترع معلومات غير موجودة.
- استعمل الصور الملحقة بالسؤال عند وجودها.
- difficultyReason بالعربية، قصير وواضح.
- secondaryTopics لا تكرر primaryTopic.
`;
}

function normalizeFamilyKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "other-networking";
}

function normalizeClassification(raw, question, difficultyConfig) {
  const fixedSection = normalizeKnownSection(question.section);
  const section = fixedSection || raw.section;
  const primaryTopic = raw.primaryTopic;
  const secondaryTopics = [...new Set(
    (Array.isArray(raw.secondaryTopics) ? raw.secondaryTopics : [])
      .filter(x => x && x !== primaryTopic)
  )].slice(0, 3);

  const difficulty = Number(raw.difficulty);
  const level = difficultyConfig.levels[String(difficulty)];
  const needsReview = raw.needsReview === true;

  return {
    questionId: question.id,
    section,
    primaryTopic,
    secondaryTopics,
    difficulty,
    difficultyLabel: level?.label || "",
    difficultyReason: String(raw.difficultyReason || "").trim(),
    difficultyConfidence: Math.max(0, Math.min(1, Number(raw.difficultyConfidence) || 0)),
    familyKey: normalizeFamilyKey(raw.familyKey),
    hasCLI: raw.hasCLI === true,
    requiresCalculation: raw.requiresCalculation === true,
    needsReview,
    reviewReason: needsReview ? String(raw.reviewReason || "").trim() : ""
  };
}

function classificationFromSource(question) {
  const c = question?.classification;
  if (!c || !isFinalReviewStatus(c.status || question.reviewStatus)) {
    return null;
  }

  return {
    section: normalizeKnownSection(question.section) || question.section || "LEGACY",
    primaryTopic: c.topic ?? question.topic ?? null,
    secondaryTopics: c.secondaryTopics ?? question.secondaryTopics ?? [],
    difficulty: c.difficulty ?? question.difficulty ?? null,
    difficultyLabel: c.difficultyLabel ?? question.difficultyLabel ?? null,
    difficultyConfidence: c.difficultyConfidence ?? question.difficultyConfidence ?? null,
    familyKey: c.familyKey ?? question.familyKey ?? null,
    hasCLI: question.flags?.hasCLI === true,
    requiresCalculation: question.flags?.requiresCalculation === true,
    needsReview: c.needsReview === true || question.reviewStatus === "needs-review",
    reviewStatus: question.reviewStatus || c.status
  };
}

function syncIndexQuestion(indexQuestion, sourceQuestion, classification) {
  indexQuestion.section = classification.section;
  indexQuestion.topic = classification.primaryTopic;
  indexQuestion.secondaryTopics = classification.secondaryTopics;
  indexQuestion.difficulty = classification.difficulty;
  indexQuestion.difficultyLabel = classification.difficultyLabel;
  indexQuestion.familyKey = classification.familyKey;
  indexQuestion.hasCLI = classification.hasCLI;
  indexQuestion.requiresCalculation = classification.requiresCalculation;
  indexQuestion.needsReview = classification.needsReview;
  indexQuestion.reviewStatus = sourceQuestion.reviewStatus;
  indexQuestion.classificationConfidence = classification.difficultyConfidence;
}

function applyClassificationToSource(question, classification, model, now) {
  question.section = classification.section;
  question.topic = classification.primaryTopic;
  question.secondaryTopics = classification.secondaryTopics;
  question.difficulty = classification.difficulty;
  question.difficultyLabel = classification.difficultyLabel;
  question.difficultyReason = classification.difficultyReason;
  question.difficultyConfidence = classification.difficultyConfidence;
  question.familyKey = classification.familyKey;

  if (!question.flags) {
    question.flags = {};
  }
  question.flags.hasCLI = classification.hasCLI;
  question.flags.requiresCalculation = classification.requiresCalculation;

  question.reviewStatus = classification.needsReview
    ? "needs-review"
    : "classified";

  question.classification = {
    topic: classification.primaryTopic,
    secondaryTopics: classification.secondaryTopics,
    difficulty: classification.difficulty,
    difficultyLabel: classification.difficultyLabel,
    difficultyReason: classification.difficultyReason,
    difficultyConfidence: classification.difficultyConfidence,
    familyKey: classification.familyKey,
    needsReview: classification.needsReview,
    reviewReason: classification.reviewReason,
    status: question.reviewStatus,
    model,
    classifiedAt: now
  };
}

function countPending(indexDocument) {
  const questions = Array.isArray(indexDocument.questions)
    ? indexDocument.questions
    : [];
  return questions.filter(isPendingIndexQuestion).length;
}

function countPendingForSource(indexDocument, sourceId) {
  const questions = Array.isArray(indexDocument.questions)
    ? indexDocument.questions
    : [];
  return questions.filter(q => q.sourceId === sourceId && isPendingIndexQuestion(q)).length;
}

app.http("classifyBankBatch", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "classify-bank-batch",

  handler: async request => {
    try {
      const configuredKey = process.env.BANK_SETUP_KEY;
      const suppliedKey = request.headers.get("x-bank-setup-key");

      if (!configuredKey || suppliedKey !== configuredKey) {
        return {
          status: 401,
          jsonBody: { ok: false, error: "Unauthorized" }
        };
      }

      const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
      if (!connectionString) {
        throw new Error("AZURE_STORAGE_CONNECTION_STRING is not configured");
      }

      const model = process.env.OPENAI_MODEL || "gpt-5.6-terra";

      let body = {};
      try {
        body = await request.json();
      } catch {
        body = {};
      }

      const saveToBank = body?.save === true;
      const requestedSourceId = body?.sourceId
        ? String(body.sourceId).trim()
        : null;
      const requestedBatchSize = Number(body?.batchSize || DEFAULT_BATCH_SIZE);
      const batchSize = Math.max(1, Math.min(MAX_BATCH_SIZE,
        Number.isFinite(requestedBatchSize) ? Math.floor(requestedBatchSize) : DEFAULT_BATCH_SIZE
      ));

      const topicsConfig = loadConfig("topics.json");
      const difficultyConfig = loadConfig("difficulty-rubric.json");
      const topicCodes = topicsConfig.topics.map(item => item.code);

      const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
      const bankContainer = blobServiceClient.getContainerClient(BANK_CONTAINER);
      const assetsContainer = blobServiceClient.getContainerClient(ASSETS_CONTAINER);

      const indexDocument = await downloadBlobJson(bankContainer, INDEX_BLOB);
      const indexQuestions = Array.isArray(indexDocument.questions)
        ? indexDocument.questions
        : [];

      const initialPending = countPending(indexDocument);
      if (initialPending === 0) {
        return {
          status: 200,
          jsonBody: {
            ok: true,
            complete: true,
            previewOnly: !saveToBank,
            savedToBank: false,
            remainingPending: 0,
            message: "No pending questions remain."
          }
        };
      }

      let sourceId = requestedSourceId;
      if (!sourceId) {
        const firstPending = indexQuestions.find(isPendingIndexQuestion);
        sourceId = firstPending?.sourceId || null;
      }

      if (!sourceId) {
        throw new Error("Could not resolve a pending sourceId");
      }

      const sourceBlob = `sources/${sourceId}.json`;
      const bankDocument = await downloadBlobJson(bankContainer, sourceBlob);
      const sourceQuestions = Array.isArray(bankDocument.questions)
        ? bankDocument.questions
        : [];
      const sourceById = new Map(sourceQuestions.map(q => [q.id, q]));

      // Repair index entries that are already classified in the source JSON.
      let repairedIndexEntries = 0;
      for (const indexQuestion of indexQuestions) {
        if (indexQuestion.sourceId !== sourceId || !isPendingIndexQuestion(indexQuestion)) {
          continue;
        }

        const sourceQuestion = sourceById.get(indexQuestion.id);
        const existing = classificationFromSource(sourceQuestion);
        if (!sourceQuestion || !existing) {
          continue;
        }

        syncIndexQuestion(indexQuestion, sourceQuestion, existing);
        repairedIndexEntries++;
      }

      if (saveToBank && repairedIndexEntries > 0) {
        indexDocument.updatedAt = new Date().toISOString();
        await uploadJson(bankContainer, INDEX_BLOB, indexDocument);
      }

      const pendingIndexForSource = indexQuestions.filter(q =>
        q.sourceId === sourceId && isPendingIndexQuestion(q)
      );

      const pendingSourceQuestions = pendingIndexForSource
        .map(iq => sourceById.get(iq.id))
        .filter(q => q && !isFinalSourceQuestion(q));

      if (pendingSourceQuestions.length === 0) {
        const remainingPending = countPending(indexDocument);
        return {
          status: 200,
          jsonBody: {
            ok: true,
            complete: remainingPending === 0,
            previewOnly: !saveToBank,
            savedToBank: saveToBank && repairedIndexEntries > 0,
            sourceId,
            repairedIndexEntries,
            processed: 0,
            remainingPending,
            remainingInSource: countPendingForSource(indexDocument, sourceId),
            message: repairedIndexEntries > 0
              ? "Index repaired from source classifications; no new model classification in this call."
              : "No pending source questions found for this source."
          }
        };
      }

      const textOnly = pendingSourceQuestions.filter(q =>
        !Array.isArray(q.assets) || q.assets.length === 0
      );
      const withImages = pendingSourceQuestions.filter(q =>
        Array.isArray(q.assets) && q.assets.length > 0
      );

      // Text questions are batched for speed. Image questions are processed one at a time
      // to keep the question/image association unambiguous.
      const selected = textOnly.length > 0
        ? textOnly.slice(0, batchSize)
        : withImages.slice(0, 1);

      const selectedIds = selected.map(q => q.id);
      const userContent = [];
      let imageCount = 0;

      for (let i = 0; i < selected.length; i++) {
        const question = selected[i];
        userContent.push({
          type: "input_text",
          text:
            `===== QUESTION ${i + 1} OF ${selected.length} =====\n` +
            `Return classification for questionId exactly: ${question.id}\n\n` +
            buildQuestionText(question) +
            "\n\nAny images immediately following this text belong only to this question."
        });

        const imageInputs = await buildImageInputs(question, assetsContainer);
        imageCount += imageInputs.length;
        userContent.push(...imageInputs);
      }

      const openai = await createOpenAIClient();
      const response = await openai.responses.create({
        model,
        store: false,
        instructions: buildInstructions(topicsConfig, difficultyConfig),
        input: [
          {
            role: "user",
            content: userContent
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "bank_batch_classification",
            strict: true,
            schema: buildBatchSchema(topicCodes, selectedIds)
          }
        },
        max_output_tokens: Math.min(10000, 1800 + selected.length * 650)
      });

      if (!response.output_text) {
        throw new Error("OpenAI returned no output_text");
      }

      const parsed = JSON.parse(response.output_text);
      const rawClassifications = Array.isArray(parsed.classifications)
        ? parsed.classifications
        : [];

      if (rawClassifications.length !== selected.length) {
        throw new Error(
          `Classification count mismatch: expected ${selected.length}, got ${rawClassifications.length}`
        );
      }

      const byQuestionId = new Map();
      for (const raw of rawClassifications) {
        if (!selectedIds.includes(raw.questionId)) {
          throw new Error(`Unexpected questionId from model: ${raw.questionId}`);
        }
        if (byQuestionId.has(raw.questionId)) {
          throw new Error(`Duplicate questionId from model: ${raw.questionId}`);
        }
        byQuestionId.set(raw.questionId, raw);
      }

      for (const questionId of selectedIds) {
        if (!byQuestionId.has(questionId)) {
          throw new Error(`Missing classification for questionId: ${questionId}`);
        }
      }

      const classifications = selected.map(question =>
        normalizeClassification(
          byQuestionId.get(question.id),
          question,
          difficultyConfig
        )
      );

      let needsReviewInBatch = 0;

      if (saveToBank) {
        const now = new Date().toISOString();

        for (let i = 0; i < selected.length; i++) {
          const question = selected[i];
          const classification = classifications[i];
          applyClassificationToSource(question, classification, model, now);

          const indexQuestion = indexQuestions.find(item => item.id === question.id);
          if (indexQuestion) {
            syncIndexQuestion(indexQuestion, question, classification);
          }

          if (classification.needsReview) {
            needsReviewInBatch++;
          }
        }

        bankDocument.updatedAt = now;
        indexDocument.updatedAt = now;

        // Sequential writes + PowerShell sequential caller avoid concurrent index updates.
        await uploadJson(bankContainer, sourceBlob, bankDocument);
        await uploadJson(bankContainer, INDEX_BLOB, indexDocument);
      } else {
        needsReviewInBatch = classifications.filter(c => c.needsReview).length;
      }

      const remainingPending = saveToBank
        ? countPending(indexDocument)
        : initialPending;
      const remainingInSource = saveToBank
        ? countPendingForSource(indexDocument, sourceId)
        : pendingIndexForSource.length;

      return {
        status: 200,
        jsonBody: {
          ok: true,
          previewOnly: !saveToBank,
          savedToBank: saveToBank,
          complete: saveToBank && remainingPending === 0,
          model,
          sourceId,
          sourceBlob,
          batchSizeRequested: batchSize,
          processed: selected.length,
          imageQuestionsInBatch: selected.filter(q => Array.isArray(q.assets) && q.assets.length > 0).length,
          imageCount,
          repairedIndexEntries,
          needsReviewInBatch,
          remainingInSource,
          remainingPending,
          initialPending,
          classifications,
          message: saveToBank
            ? "Batch classified and saved to bank."
            : "Batch classification preview completed; nothing was saved."
        }
      };
    } catch (error) {
      return {
        status: 500,
        jsonBody: {
          ok: false,
          error: error instanceof Error ? error.message : "Unknown batch classification error"
        }
      };
    }
  }
});
