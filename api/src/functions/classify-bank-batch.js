const { app } = require("@azure/functions");
const { BlobServiceClient } = require("@azure/storage-blob");
const fs = require("fs");
const path = require("path");
const { requireBuilderAuth } = require("../lib/builder-auth");

const BANK_CONTAINER = "bank";
const ASSETS_CONTAINER = "assets";
const INDEX_BLOB = "index/questions-index.json";

const MAX_BATCH_SIZE = 12;
const DEFAULT_BATCH_SIZE = 10;


// ==========================================================
// CONFIG
// ==========================================================

function loadConfig(fileName) {

  const candidates = [

    path.join(
      process.cwd(),
      "config",
      fileName
    ),

    path.join(
      __dirname,
      "..",
      "..",
      "config",
      fileName
    )
  ];


  for (const filePath of candidates) {

    if (fs.existsSync(filePath)) {

      return JSON.parse(
        fs.readFileSync(
          filePath,
          "utf8"
        )
      );
    }
  }


  throw new Error(
    `Config file not found: ${fileName}`
  );
}


// ==========================================================
// BLOB HELPERS
// ==========================================================

async function streamToBuffer(stream) {

  const chunks = [];


  for await (const chunk of stream) {

    chunks.push(
      Buffer.from(chunk)
    );
  }


  return Buffer.concat(chunks);
}


async function downloadBlobBuffer(
  containerClient,
  blobName
) {

  const response =
    await containerClient
      .getBlobClient(blobName)
      .download();


  if (!response.readableStreamBody) {

    throw new Error(
      `Could not download ${blobName}`
    );
  }


  return await streamToBuffer(
    response.readableStreamBody
  );
}


async function downloadBlobJson(
  containerClient,
  blobName
) {

  const buffer =
    await downloadBlobBuffer(
      containerClient,
      blobName
    );


  return JSON.parse(
    buffer.toString("utf8")
  );
}


async function uploadJson(
  containerClient,
  blobName,
  data
) {

  const text =
    JSON.stringify(
      data,
      null,
      2
    );


  await containerClient
    .getBlockBlobClient(blobName)
    .uploadData(
      Buffer.from(
        text,
        "utf8"
      ),
      {
        blobHTTPHeaders: {
          blobContentType:
            "application/json; charset=utf-8"
        }
      }
    );
}


// ==========================================================
// OPENAI
// ==========================================================

async function createOpenAIClient() {

  const module =
    await import("openai");


  const OpenAI =
    module.default;


  const apiKey =
    process.env.OPENAI_API_KEY;


  if (!apiKey) {

    throw new Error(
      "OPENAI_API_KEY is not configured"
    );
  }


  return new OpenAI({
    apiKey
  });
}


// ==========================================================
// STATUS HELPERS
// ==========================================================

function isFinalReviewStatus(value) {

  return (
    value === "classified" ||
    value === "needs-review"
  );
}


function isPendingIndexQuestion(
  question
) {

  return !isFinalReviewStatus(
    question?.reviewStatus
  );
}


function isFinalSourceQuestion(
  question
) {

  return (
    isFinalReviewStatus(
      question?.reviewStatus
    )
    ||
    isFinalReviewStatus(
      question
        ?.classification
        ?.status
    )
  );
}


function normalizeKnownSection(
  section
) {

  if (
    section === "BASIC" ||
    section === "INFRASTRUCTURE"
  ) {

    return section;
  }


  return null;
}


// ==========================================================
// QUESTION TEXT
// ==========================================================

function buildQuestionText(
  question
) {

  const lines = [];


  lines.push(
    `Question ID: ${question.id}`
  );


  lines.push(
    `Source ID: ${question.sourceId || ""}`
  );


  lines.push(
    `Question number: ${question.questionNumber || ""}`
  );


  lines.push(
    `Current section: ${question.section || "UNKNOWN"}`
  );


  lines.push(
    `Question type: ${question.type || ""}`
  );


  lines.push(
    `Original type: ${question.originalType || ""}`
  );


  lines.push("");
  lines.push("QUESTION:");

  lines.push(
    question.text || ""
  );


  // --------------------------------------------------------
  // Parent context
  // --------------------------------------------------------

  if (question.parentGroup) {

    lines.push("");

    lines.push(
      "PARENT / GROUP CONTEXT:"
    );


    lines.push(
      JSON.stringify(
        question.parentGroup,
        null,
        2
      )
    );
  }


  // --------------------------------------------------------
  // Options
  // --------------------------------------------------------

  if (
    Array.isArray(
      question.options
    )
    &&
    question.options.length > 0
  ) {

    lines.push("");
    lines.push("OPTIONS:");


    for (
      const option
      of question.options
    ) {

      lines.push(
        `${option.label}: ${option.text}`
      );
    }
  }


  // --------------------------------------------------------
  // Fields
  // --------------------------------------------------------

  if (
    Array.isArray(
      question.fields
    )
    &&
    question.fields.length > 0
  ) {

    lines.push("");
    lines.push("FIELDS:");


    for (
      const field
      of question.fields
    ) {

      lines.push(
        `${field.order}. ${field.label}`
      );
    }
  }


  // --------------------------------------------------------
  // Parts
  // --------------------------------------------------------

  if (
    Array.isArray(
      question.parts
    )
    &&
    question.parts.length > 0
  ) {

    lines.push("");
    lines.push("PARTS:");


    for (
      const part
      of question.parts
    ) {

      lines.push(
        `${part.order}. ${part.label}`
      );


      if (
        Array.isArray(
          part.options
        )
      ) {

        for (
          const option
          of part.options
        ) {

          lines.push(
            `   ${option.label}: ${option.text}`
          );
        }
      }
    }
  }


  // --------------------------------------------------------
  // Answer
  // --------------------------------------------------------

  lines.push("");
  lines.push("ANSWER MODEL:");


  lines.push(
    JSON.stringify(
      question.answer || {},
      null,
      2
    )
  );


  // --------------------------------------------------------
  // Flags
  // --------------------------------------------------------

  lines.push("");
  lines.push("QUESTION FLAGS:");


  lines.push(
    JSON.stringify(
      question.flags || {},
      null,
      2
    )
  );


  return lines.join("\n");
}


// ==========================================================
// IMAGE VALIDATION
// ==========================================================

function detectImageContentType(
  buffer
) {

  if (
    !Buffer.isBuffer(buffer)
    ||
    buffer.length < 4
  ) {

    return null;
  }


  // --------------------------------------------------------
  // PNG
  // --------------------------------------------------------

  if (
    buffer.length >= 8
    &&
    buffer[0] === 0x89
    &&
    buffer[1] === 0x50
    &&
    buffer[2] === 0x4e
    &&
    buffer[3] === 0x47
    &&
    buffer[4] === 0x0d
    &&
    buffer[5] === 0x0a
    &&
    buffer[6] === 0x1a
    &&
    buffer[7] === 0x0a
  ) {

    return "image/png";
  }


  // --------------------------------------------------------
  // JPEG
  // --------------------------------------------------------

  if (
    buffer.length >= 3
    &&
    buffer[0] === 0xff
    &&
    buffer[1] === 0xd8
    &&
    buffer[2] === 0xff
  ) {

    return "image/jpeg";
  }


  // --------------------------------------------------------
  // GIF
  // --------------------------------------------------------

  if (
    buffer.length >= 6
  ) {

    const header =
      buffer
        .subarray(
          0,
          6
        )
        .toString(
          "ascii"
        );


    if (
      header === "GIF87a"
      ||
      header === "GIF89a"
    ) {

      return "image/gif";
    }
  }


  // --------------------------------------------------------
  // WEBP
  // --------------------------------------------------------

  if (
    buffer.length >= 12
    &&
    buffer
      .subarray(
        0,
        4
      )
      .toString(
        "ascii"
      )
      === "RIFF"
    &&
    buffer
      .subarray(
        8,
        12
      )
      .toString(
        "ascii"
      )
      === "WEBP"
  ) {

    return "image/webp";
  }


  return null;
}


// ==========================================================
// IMAGES
// ==========================================================

async function buildImageInputs(
  question,
  assetsContainer
) {

  const inputs = [];
  const warnings = [];


  if (
    !Array.isArray(
      question.assets
    )
  ) {

    return {
      inputs,
      warnings
    };
  }


  for (
    const asset
    of question.assets
  ) {

    if (!asset?.blobName) {

      continue;
    }


    try {

      const buffer =
        await downloadBlobBuffer(
          assetsContainer,
          asset.blobName
        );


      const contentType =
        detectImageContentType(
          buffer
        );


      // ----------------------------------------------------
      // Invalid image
      // ----------------------------------------------------

      if (!contentType) {

        warnings.push({

          blobName:
            asset.blobName,

          reason:
            "Stored blob bytes are not a supported PNG/JPEG/GIF/WEBP image."
        });


        continue;
      }


      // ----------------------------------------------------
      // Valid image
      // ----------------------------------------------------

      const dataUrl =
        `data:${contentType};base64,`
        +
        buffer.toString(
          "base64"
        );


      inputs.push({

        type:
          "input_image",

        image_url:
          dataUrl,

        detail:
          "high"
      });
    }
    catch (error) {

      warnings.push({

        blobName:
          asset.blobName,

        reason:
          error instanceof Error
            ? error.message
            : String(error)
      });
    }
  }


  return {
    inputs,
    warnings
  };
}


// ==========================================================
// CLASSIFICATION SCHEMA
// ==========================================================

function classificationItemSchema(
  topicCodes,
  questionIds
) {

  return {

    type:
      "object",

    additionalProperties:
      false,


    properties: {

      questionId: {

        type:
          "string",

        enum:
          questionIds
      },


      section: {

        type:
          "string",

        enum: [
          "BASIC",
          "INFRASTRUCTURE"
        ]
      },


      primaryTopic: {

        type:
          "string",

        enum:
          topicCodes
      },


      secondaryTopics: {

        type:
          "array",

        items: {

          type:
            "string",

          enum:
            topicCodes
        },

        maxItems:
          3
      },


      difficulty: {

        type:
          "integer",

        minimum:
          1,

        maximum:
          5
      },


      difficultyReason: {

        type:
          "string"
      },


      difficultyConfidence: {

        type:
          "number",

        minimum:
          0,

        maximum:
          1
      },


      familyKey: {

        type:
          "string"
      },


      hasCLI: {

        type:
          "boolean"
      },


      requiresCalculation: {

        type:
          "boolean"
      },


      needsReview: {

        type:
          "boolean"
      },


      reviewReason: {

        type:
          "string"
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


// ==========================================================
// BATCH SCHEMA
// ==========================================================

function buildBatchSchema(
  topicCodes,
  questionIds
) {

  return {

    type:
      "object",

    additionalProperties:
      false,


    properties: {

      classifications: {

        type:
          "array",

        minItems:
          questionIds.length,

        maxItems:
          questionIds.length,

        items:
          classificationItemSchema(
            topicCodes,
            questionIds
          )
      }
    },


    required: [
      "classifications"
    ]
  };
}


// ==========================================================
// PROMPT
// ==========================================================

function buildInstructions(
  topicsConfig,
  difficultyConfig
) {

  return `

أنت خبير في تصنيف أسئلة شبكات الاتصال
للامتحان 791381.

ستصنف عدة أسئلة في الطلب نفسه.

يجب أن تعيد تصنيفًا واحدًا بالضبط
لكل questionId.

لا تحذف سؤالًا.
لا تكرر سؤالًا.

==================================================
SECTION
==================================================

القيم المسموحة فقط:

BASIC

INFRASTRUCTURE


إذا كان Current section هو:

BASIC

أو

INFRASTRUCTURE

أعد نفس القيمة بالضبط
ولا تغيّرها.

لأنها مأخوذة من بنية امتحان رسمي.


إذا كان Current section هو:

LEGACY

أو

UNKNOWN

أو فارغًا

صنفه وفق طبيعة السؤال.


BASIC:

- أنظمة العد والتحويلات.

- IPv4 و IPv6.

- Class.

- Private / Public IP.

- APIPA.

- Subnet Mask.

- CIDR.

- الحسابات الأساسية.

- أجهزة الشبكة.

- Topologies.

- MAC.

- OSI.

- TCP/IP.

- البروتوكولات والخدمات.

- المعلومات النظرية المباشرة.


INFRASTRUCTURE:

- Cisco Configuration.

- Cisco CLI المتقدم.

- VLAN.

- VTP.

- Trunk.

- 802.1Q.

- Router-on-a-Stick.

- Port Security.

- DHCP Configuration.

- Routing.

- Static Routing.

- OSPF.

- RIP.

- EIGRP.

- ACL.

- NAT / PAT.

- WAN / Metro.

- Topology يحتاج إعدادات
  أو استنتاجات بنيوية.


وجود كلمة Cisco وحدها
لا يجعل السؤال INFRASTRUCTURE.


مثال:

سؤال بسيط عن وظيفة ping
يمكن أن يكون BASIC.


==================================================
TOPIC
==================================================

اختر primaryTopic واحدًا فقط.

يمكن اختيار حتى 3 secondaryTopics.

استخدم التصنيف الأكثر تخصصًا.


التصنيفات:

${JSON.stringify(
  topicsConfig.topics,
  null,
  2
)}


أمثلة:

OSPF
-> OSPF

وليس ROUTING فقط.


CIDR

أو

Subnet Mask

-> SUBNET_CIDR


DHCP

-> DHCP


==================================================
DIFFICULTY
==================================================

استخدم نفس معيار 2025.


المعيار:

${JSON.stringify(
  difficultyConfig,
  null,
  2
)}


قيّم الصعوبة بالنسبة لطلاب:

ضعفاء إلى دون المتوسط.


الامتحان:

مفتوح المادة.


الطلاب لديهم:

أمثلة محلولة مشابهة.


صيغة السؤال
جزء أساسي من الصعوبة.


==================================================
FAMILY KEY
==================================================

أنشئ familyKey إنجليزيًا
قصيرًا وثابتًا.

يصف المهارة الأساسية
وليس الأرقام الخاصة بالسؤال.


استخدم:

lowercase

و

-


أمثلة:

dhcp-purpose

ospf-network-command

subnet-host-range

ipv4-valid-router-address

nvram-startup-config


الهدف:

منع اختيار سؤالين
يختبران نفس المهارة
في امتحان واحد.


==================================================
FLAGS
==================================================

hasCLI = true

فقط عندما يحتاج الطالب إلى:

قراءة

أو

تمييز

أو

كتابة

Cisco CLI / IOS.


requiresCalculation = true

إذا احتاج السؤال إلى حساب فعلي مثل:

binary conversion

CIDR

subnetting

host calculations


==================================================
REVIEW
==================================================

needsReview = true

فقط إذا كان:

السؤال

أو الصورة

أو التصنيف

ملتبسًا فعلًا.


إذا:

needsReview = false

يجب أن يكون:

reviewReason = ""


==================================================
IMPORTANT
==================================================

لا تخترع معلومات غير موجودة.

استخدم الصور إذا كانت موجودة وصالحة.

إذا كانت الصورة غير متوفرة
لا تخترع محتواها.

difficultyReason
بالعربية.

اجعله قصيرًا وواضحًا.

secondaryTopics
لا تكرر primaryTopic.

`;
}


// ==========================================================
// NORMALIZE FAMILY KEY
// ==========================================================

function normalizeFamilyKey(value) {

  return String(
    value || ""
  )
    .trim()
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      "-"
    )
    .replace(
      /^-+|-+$/g,
      ""
    )
    .slice(
      0,
      120
    )
    ||
    "other-networking";
}


// ==========================================================
// NORMALIZE CLASSIFICATION
// ==========================================================

function normalizeClassification(
  raw,
  question,
  difficultyConfig
) {

  const primaryTopic =
    raw.primaryTopic;


  const difficulty =
    Number(
      raw.difficulty
    );


  const level =
    difficultyConfig
      .levels[
        String(
          difficulty
        )
      ];


  const needsReview =
    raw.needsReview === true;


  const secondaryTopics =
    [
      ...new Set(

        (
          Array.isArray(
            raw.secondaryTopics
          )
            ? raw.secondaryTopics
            : []
        )
          .filter(
            value =>
              value
              &&
              value !== primaryTopic
          )
      )
    ]
      .slice(
        0,
        3
      );


  return {

    questionId:
      question.id,


    section:
      normalizeKnownSection(
        question.section
      )
      ||
      raw.section,


    primaryTopic,


    secondaryTopics,


    difficulty,


    difficultyLabel:
      level?.label
      ||
      "",


    difficultyReason:
      String(
        raw.difficultyReason
        ||
        ""
      )
        .trim(),


    difficultyConfidence:
      Math.max(
        0,
        Math.min(
          1,
          Number(
            raw.difficultyConfidence
          )
          ||
          0
        )
      ),


    familyKey:
      normalizeFamilyKey(
        raw.familyKey
      ),


    hasCLI:
      raw.hasCLI === true,


    requiresCalculation:
      raw.requiresCalculation
      === true,


    needsReview,


    reviewReason:
      needsReview
        ? String(
            raw.reviewReason
            ||
            ""
          )
            .trim()
        : ""
  };
}


// ==========================================================
// EXISTING SOURCE CLASSIFICATION
// ==========================================================

function classificationFromSource(
  question
) {

  const classification =
    question?.classification;


  if (
    !classification
    ||
    !isFinalReviewStatus(
      classification.status
      ||
      question.reviewStatus
    )
  ) {

    return null;
  }


  return {

    section:
      normalizeKnownSection(
        question.section
      )
      ||
      question.section
      ||
      "LEGACY",


    primaryTopic:
      classification.topic
      ??
      question.topic
      ??
      null,


    secondaryTopics:
      classification.secondaryTopics
      ??
      question.secondaryTopics
      ??
      [],


    difficulty:
      classification.difficulty
      ??
      question.difficulty
      ??
      null,


    difficultyLabel:
      classification.difficultyLabel
      ??
      question.difficultyLabel
      ??
      null,


    difficultyConfidence:
      classification.difficultyConfidence
      ??
      question.difficultyConfidence
      ??
      null,


    familyKey:
      classification.familyKey
      ??
      question.familyKey
      ??
      null,


    hasCLI:
      question
        .flags
        ?.hasCLI
      === true,


    requiresCalculation:
      question
        .flags
        ?.requiresCalculation
      === true,


    needsReview:
      classification.needsReview
      === true
      ||
      question.reviewStatus
      === "needs-review",


    reviewStatus:
      question.reviewStatus
      ||
      classification.status
  };
}


// ==========================================================
// SYNC INDEX
// ==========================================================

function syncIndexQuestion(
  indexQuestion,
  sourceQuestion,
  classification
) {

  indexQuestion.section =
    classification.section;


  indexQuestion.topic =
    classification.primaryTopic;


  indexQuestion.secondaryTopics =
    classification.secondaryTopics;


  indexQuestion.difficulty =
    classification.difficulty;


  indexQuestion.difficultyLabel =
    classification.difficultyLabel;


  indexQuestion.familyKey =
    classification.familyKey;


  indexQuestion.hasCLI =
    classification.hasCLI;


  indexQuestion.requiresCalculation =
    classification.requiresCalculation;


  indexQuestion.needsReview =
    classification.needsReview;


  indexQuestion.reviewStatus =
    sourceQuestion.reviewStatus;


  indexQuestion.classificationConfidence =
    classification.difficultyConfidence;
}


// ==========================================================
// SAVE CLASSIFICATION TO SOURCE
// ==========================================================

function applyClassificationToSource(
  question,
  classification,
  model,
  now
) {

  question.section =
    classification.section;


  question.topic =
    classification.primaryTopic;


  question.secondaryTopics =
    classification.secondaryTopics;


  question.difficulty =
    classification.difficulty;


  question.difficultyLabel =
    classification.difficultyLabel;


  question.difficultyReason =
    classification.difficultyReason;


  question.difficultyConfidence =
    classification.difficultyConfidence;


  question.familyKey =
    classification.familyKey;


  if (!question.flags) {

    question.flags = {};
  }


  question.flags.hasCLI =
    classification.hasCLI;


  question.flags.requiresCalculation =
    classification.requiresCalculation;


  question.reviewStatus =
    classification.needsReview
      ? "needs-review"
      : "classified";


  question.classification = {

    topic:
      classification.primaryTopic,


    secondaryTopics:
      classification.secondaryTopics,


    difficulty:
      classification.difficulty,


    difficultyLabel:
      classification.difficultyLabel,


    difficultyReason:
      classification.difficultyReason,


    difficultyConfidence:
      classification.difficultyConfidence,


    familyKey:
      classification.familyKey,


    needsReview:
      classification.needsReview,


    reviewReason:
      classification.reviewReason,


    status:
      question.reviewStatus,


    model,


    classifiedAt:
      now
  };
}


// ==========================================================
// PENDING COUNTERS
// ==========================================================

function countPending(
  indexDocument
) {

  const questions =
    Array.isArray(
      indexDocument.questions
    )
      ? indexDocument.questions
      : [];


  return questions
    .filter(
      isPendingIndexQuestion
    )
    .length;
}


function countPendingForSource(
  indexDocument,
  sourceId
) {

  const questions =
    Array.isArray(
      indexDocument.questions
    )
      ? indexDocument.questions
      : [];


  return questions
    .filter(
      question =>
        question.sourceId
          === sourceId
        &&
        isPendingIndexQuestion(
          question
        )
    )
    .length;
}


// ==========================================================
// AZURE FUNCTION
// ==========================================================

app.http(
  "classifyBankBatch",
  {

    methods: [
      "POST"
    ],


    authLevel:
      "anonymous",


    route:
      "classify-bank-batch",


    handler:
      async request => {

        try {

          // =================================================
          // AUTH (teacher/builder session required)
          // =================================================

          const auth =
            requireBuilderAuth(
              request
            );

          if (!auth.ok) {
            return auth.response;
          }


          // =================================================
          // ENVIRONMENT
          // =================================================

          const connectionString =
            process.env
              .AZURE_STORAGE_CONNECTION_STRING;


          if (!connectionString) {

            throw new Error(
              "AZURE_STORAGE_CONNECTION_STRING is not configured"
            );
          }


          const model =
            process.env.OPENAI_MODEL
            ||
            "gpt-5.6-terra";


          // =================================================
          // BODY
          // =================================================

          let body = {};


          try {

            body =
              await request.json();
          }
          catch {

            body = {};
          }


          const saveToBank =
            body?.save === true;


          const requestedSourceId =
            body?.sourceId
              ? String(
                  body.sourceId
                )
                  .trim()
              : null;


          const requestedBatchSize =
            Number(
              body?.batchSize
              ||
              DEFAULT_BATCH_SIZE
            );


          const batchSize =
            Math.max(

              1,

              Math.min(

                MAX_BATCH_SIZE,

                Number.isFinite(
                  requestedBatchSize
                )
                  ? Math.floor(
                      requestedBatchSize
                    )
                  : DEFAULT_BATCH_SIZE
              )
            );


          // =================================================
          // CONFIG
          // =================================================

          const topicsConfig =
            loadConfig(
              "topics.json"
            );


          const difficultyConfig =
            loadConfig(
              "difficulty-rubric.json"
            );


          const topicCodes =
            topicsConfig
              .topics
              .map(
                item =>
                  item.code
              );


          // =================================================
          // STORAGE
          // =================================================

          const blobServiceClient =
            BlobServiceClient
              .fromConnectionString(
                connectionString
              );


          const bankContainer =
            blobServiceClient
              .getContainerClient(
                BANK_CONTAINER
              );


          const assetsContainer =
            blobServiceClient
              .getContainerClient(
                ASSETS_CONTAINER
              );


          // =================================================
          // INDEX
          // =================================================

          const indexDocument =
            await downloadBlobJson(
              bankContainer,
              INDEX_BLOB
            );


          const indexQuestions =
            Array.isArray(
              indexDocument.questions
            )
              ? indexDocument.questions
              : [];


          // =================================================
          // TOTAL PENDING
          // =================================================

          const initialPending =
            countPending(
              indexDocument
            );


          if (
            initialPending === 0
          ) {

            return {

              status:
                200,


              jsonBody: {

                ok:
                  true,


                complete:
                  true,


                previewOnly:
                  !saveToBank,


                savedToBank:
                  false,


                remainingPending:
                  0,


                message:
                  "No pending questions remain."
              }
            };
          }


          // =================================================
          // SOURCE
          // =================================================

          let sourceId =
            requestedSourceId;


          if (!sourceId) {

            const firstPending =
              indexQuestions
                .find(
                  isPendingIndexQuestion
                );


            sourceId =
              firstPending
                ?.sourceId
              ||
              null;
          }


          if (!sourceId) {

            throw new Error(
              "Could not resolve a pending sourceId"
            );
          }


          const sourceBlob =
            `sources/${sourceId}.json`;


          const bankDocument =
            await downloadBlobJson(
              bankContainer,
              sourceBlob
            );


          const sourceQuestions =
            Array.isArray(
              bankDocument.questions
            )
              ? bankDocument.questions
              : [];


          const sourceById =
            new Map(

              sourceQuestions.map(

                question => [

                  question.id,

                  question
                ]
              )
            );


          // =================================================
          // REPAIR INDEX
          // =================================================

          let repairedIndexEntries =
            0;


          for (
            const indexQuestion
            of indexQuestions
          ) {

            if (
              indexQuestion.sourceId
                !== sourceId
              ||
              !isPendingIndexQuestion(
                indexQuestion
              )
            ) {

              continue;
            }


            const sourceQuestion =
              sourceById.get(
                indexQuestion.id
              );


            const existing =
              classificationFromSource(
                sourceQuestion
              );


            if (
              !sourceQuestion
              ||
              !existing
            ) {

              continue;
            }


            syncIndexQuestion(

              indexQuestion,

              sourceQuestion,

              existing
            );


            repairedIndexEntries++;
          }


          if (
            saveToBank
            &&
            repairedIndexEntries > 0
          ) {

            indexDocument.updatedAt =
              new Date()
                .toISOString();


            await uploadJson(

              bankContainer,

              INDEX_BLOB,

              indexDocument
            );
          }


          // =================================================
          // PENDING IN SOURCE
          // =================================================

          const pendingIndexForSource =
            indexQuestions
              .filter(

                question =>

                  question.sourceId
                    === sourceId

                  &&

                  isPendingIndexQuestion(
                    question
                  )
              );


          const pendingSourceQuestions =
            pendingIndexForSource

              .map(

                indexQuestion =>

                  sourceById.get(
                    indexQuestion.id
                  )
              )

              .filter(

                question =>

                  question

                  &&

                  !isFinalSourceQuestion(
                    question
                  )
              );


          // =================================================
          // SOURCE COMPLETE
          // =================================================

          if (
            pendingSourceQuestions.length
            === 0
          ) {

            const remainingPending =
              countPending(
                indexDocument
              );


            return {

              status:
                200,


              jsonBody: {

                ok:
                  true,


                complete:
                  remainingPending
                    === 0,


                previewOnly:
                  !saveToBank,


                savedToBank:
                  saveToBank
                  &&
                  repairedIndexEntries
                    > 0,


                sourceId,


                repairedIndexEntries,


                processed:
                  0,


                remainingPending,


                remainingInSource:
                  countPendingForSource(
                    indexDocument,
                    sourceId
                  ),


                message:
                  repairedIndexEntries
                    > 0

                    ? "Index repaired from source classifications; no new model classification in this call."

                    : "No pending source questions found for this source."
              }
            };
          }


          // =================================================
          // SELECT QUESTIONS
          // =================================================

          const textOnly =
            pendingSourceQuestions
              .filter(

                question =>

                  !Array.isArray(
                    question.assets
                  )

                  ||

                  question.assets.length
                    === 0
              );


          const withImages =
            pendingSourceQuestions
              .filter(

                question =>

                  Array.isArray(
                    question.assets
                  )

                  &&

                  question.assets.length
                    > 0
              );


          /*
           * Text questions are processed in batches.
           *
           * Image questions are processed one at a time.
           *
           * This guarantees that each image belongs
           * to one specific question.
           */

          const selected =
            textOnly.length > 0

              ? textOnly.slice(
                  0,
                  batchSize
                )

              : withImages.slice(
                  0,
                  1
                );


          const selectedIds =
            selected.map(
              question =>
                question.id
            );


          // =================================================
          // BUILD INPUT
          // =================================================

          const userContent = [];


          let imageCount =
            0;


          let imageWarnings =
            [];


          let imageFallbackUsed =
            false;


          for (
            let i = 0;
            i < selected.length;
            i++
          ) {

            const question =
              selected[i];


            // ------------------------------------------------
            // Question text
            // ------------------------------------------------

            userContent.push({

              type:
                "input_text",


              text:

                `===== QUESTION ${i + 1} OF ${selected.length} =====\n`

                +

                `Return classification for questionId exactly: ${question.id}\n\n`

                +

                buildQuestionText(
                  question
                )

                +

                "\n\nAny valid images immediately following this text belong only to this question."
            });


            // ------------------------------------------------
            // Images
            // ------------------------------------------------

            const imageResult =
              await buildImageInputs(

                question,

                assetsContainer
              );


            imageCount +=
              imageResult
                .inputs
                .length;


            // ------------------------------------------------
            // Invalid image found
            // ------------------------------------------------

            if (
              imageResult
                .warnings
                .length > 0
            ) {

              imageFallbackUsed =
                true;


              imageWarnings.push(

                ...imageResult
                  .warnings
                  .map(

                    warning => ({

                      questionId:
                        question.id,

                      ...warning
                    })
                  )
              );


              userContent.push({

                type:
                  "input_text",


                text:

                  "IMAGE WARNING: One or more stored images for this question could not be decoded. "

                  +

                  "Use only textual information that is actually available. "

                  +

                  "Do not invent missing visual details. "

                  +

                  "If the missing image is material to classification, set needsReview=true."
              });
            }


            userContent.push(
              ...imageResult.inputs
            );
          }


          // =================================================
          // OPENAI
          // =================================================

          const openai =
            await createOpenAIClient();


          const createClassificationResponse =
            async content =>

              await openai
                .responses
                .create({

                  model,


                  store:
                    false,


                  instructions:
                    buildInstructions(

                      topicsConfig,

                      difficultyConfig
                    ),


                  input: [

                    {

                      role:
                        "user",


                      content
                    }
                  ],


                  text: {

                    format: {

                      type:
                        "json_schema",


                      name:
                        "bank_batch_classification",


                      strict:
                        true,


                      schema:
                        buildBatchSchema(

                          topicCodes,

                          selectedIds
                        )
                    }
                  },


                  max_output_tokens:
                    Math.min(

                      10000,

                      1800

                      +

                      selected.length
                      *
                      650
                    )
                });


          // =================================================
          // CALL MODEL
          // =================================================

          let response;


          try {

            response =
              await createClassificationResponse(
                userContent
              );
          }
          catch (error) {

            const errorMessage =
              error instanceof Error

                ? error.message

                : String(
                    error || ""
                  );


            // ------------------------------------------------
            // Was this an invalid image?
            // ------------------------------------------------

            const invalidImage =
              imageCount > 0

              &&

              /does not represent a valid image|invalid image|image data.*valid image/i
                .test(
                  errorMessage
                );


            if (!invalidImage) {

              throw error;
            }


            // ------------------------------------------------
            // Retry without images
            // ------------------------------------------------

            imageFallbackUsed =
              true;


            imageWarnings.push({

              questionId:
                selected[0]
                  ?.id
                ||
                null,


              blobName:
                null,


              reason:
                `OpenAI rejected image data: ${errorMessage}`
            });


            const textOnlyUserContent =
              selected.map(

                (
                  question,
                  i
                ) => ({

                  type:
                    "input_text",


                  text:

                    `===== QUESTION ${i + 1} OF ${selected.length} =====\n`

                    +

                    `Return classification for questionId exactly: ${question.id}\n\n`

                    +

                    buildQuestionText(
                      question
                    )

                    +

                    "\n\nIMAGE WARNING: This question has stored image data, "

                    +

                    "but the image could not be decoded by the model. "

                    +

                    "Classify from textual content only. "

                    +

                    "Do not invent visual details. "

                    +

                    "If the image is material, set needsReview=true."
                })
              );


            response =
              await createClassificationResponse(
                textOnlyUserContent
              );
          }


          // =================================================
          // MODEL RESPONSE
          // =================================================

          if (
            !response.output_text
          ) {

            throw new Error(
              "OpenAI returned no output_text"
            );
          }


          const parsed =
            JSON.parse(
              response.output_text
            );


          const rawClassifications =
            Array.isArray(
              parsed.classifications
            )

              ? parsed.classifications

              : [];


          if (
            rawClassifications.length
            !== selected.length
          ) {

            throw new Error(

              `Classification count mismatch: expected ${selected.length}, got ${rawClassifications.length}`
            );
          }


          // =================================================
          // VALIDATE QUESTION IDS
          // =================================================

          const byQuestionId =
            new Map();


          for (
            const raw
            of rawClassifications
          ) {

            if (
              !selectedIds.includes(
                raw.questionId
              )
            ) {

              throw new Error(
                `Unexpected questionId from model: ${raw.questionId}`
              );
            }


            if (
              byQuestionId.has(
                raw.questionId
              )
            ) {

              throw new Error(
                `Duplicate questionId from model: ${raw.questionId}`
              );
            }


            byQuestionId.set(

              raw.questionId,

              raw
            );
          }


          for (
            const questionId
            of selectedIds
          ) {

            if (
              !byQuestionId.has(
                questionId
              )
            ) {

              throw new Error(
                `Missing classification for questionId: ${questionId}`
              );
            }
          }


          // =================================================
          // NORMALIZE CLASSIFICATIONS
          // =================================================

          const classifications =
            selected.map(

              question =>

                normalizeClassification(

                  byQuestionId.get(
                    question.id
                  ),

                  question,

                  difficultyConfig
                )
            );


          // =================================================
          // FORCE REVIEW FOR INVALID IMAGE
          // =================================================

          if (
            imageFallbackUsed
          ) {

            for (
              let i = 0;
              i < selected.length;
              i++
            ) {

              const question =
                selected[i];


              if (
                !Array.isArray(
                  question.assets
                )
                ||
                question.assets.length
                  === 0
              ) {

                continue;
              }


              const classification =
                classifications[i];


              classification.needsReview =
                true;


              classification.difficultyConfidence =
                Math.min(

                  classification
                    .difficultyConfidence,

                  0.65
                );


              classification.reviewReason =

                "تم التصنيف اعتمادًا على النص لأن صورة مخزنة للسؤال لم تكن صالحة للقراءة؛ يُنصح بمراجعة السؤال والصورة يدويًا.";
            }
          }


          // =================================================
          // SAVE
          // =================================================

          let needsReviewInBatch =
            0;


          if (saveToBank) {

            const now =
              new Date()
                .toISOString();


            for (
              let i = 0;
              i < selected.length;
              i++
            ) {

              const question =
                selected[i];


              const classification =
                classifications[i];


              applyClassificationToSource(

                question,

                classification,

                model,

                now
              );


              const indexQuestion =
                indexQuestions
                  .find(

                    item =>
                      item.id
                      === question.id
                  );


              if (indexQuestion) {

                syncIndexQuestion(

                  indexQuestion,

                  question,

                  classification
                );
              }


              if (
                classification.needsReview
              ) {

                needsReviewInBatch++;
              }
            }


            // ------------------------------------------------
            // Update timestamps
            // ------------------------------------------------

            bankDocument.updatedAt =
              now;


            indexDocument.updatedAt =
              now;


            // ------------------------------------------------
            // Save source
            // ------------------------------------------------

            await uploadJson(

              bankContainer,

              sourceBlob,

              bankDocument
            );


            // ------------------------------------------------
            // Save index
            // ------------------------------------------------

            await uploadJson(

              bankContainer,

              INDEX_BLOB,

              indexDocument
            );
          }
          else {

            needsReviewInBatch =
              classifications
                .filter(

                  classification =>
                    classification
                      .needsReview
                )
                .length;
          }


          // =================================================
          // PROGRESS
          // =================================================

          const remainingPending =
            saveToBank

              ? countPending(
                  indexDocument
                )

              : initialPending;


          const remainingInSource =
            saveToBank

              ? countPendingForSource(

                  indexDocument,

                  sourceId
                )

              : pendingIndexForSource
                  .length;


          // =================================================
          // RESULT
          // =================================================

          return {

            status:
              200,


            jsonBody: {

              ok:
                true,


              previewOnly:
                !saveToBank,


              savedToBank:
                saveToBank,


              complete:
                saveToBank
                &&
                remainingPending
                  === 0,


              model,


              sourceId,


              sourceBlob,


              batchSizeRequested:
                batchSize,


              processed:
                selected.length,


              imageQuestionsInBatch:
                selected
                  .filter(

                    question =>
                      Array.isArray(
                        question.assets
                      )

                      &&

                      question.assets.length
                        > 0
                  )
                  .length,


              imageCount,


              imageFallbackUsed,


              imageWarnings,


              repairedIndexEntries,


              needsReviewInBatch,


              remainingInSource,


              remainingPending,


              initialPending,


              classifications,


              message:
                saveToBank

                  ? "Batch classified and saved to bank."

                  : "Batch classification preview completed; nothing was saved."
            }
          };
        }
        catch {

          // =================================================
          // ERROR
          // =================================================

          return {

            status:
              500,


            jsonBody: {

              ok:
                false,


              error: "تعذر تنفيذ التصنيف الجماعي حاليًا."
            }
          };
        }
      }
  }
);