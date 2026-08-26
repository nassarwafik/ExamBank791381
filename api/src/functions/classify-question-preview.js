const { app } = require("@azure/functions");
const {
  BlobServiceClient
} = require("@azure/storage-blob");

const fs = require("fs");
const path = require("path");

const BANK_CONTAINER = "bank";
const ASSETS_CONTAINER = "assets";

const SOURCE_ID = "791381-2025";
const SOURCE_BLOB =
  `sources/${SOURCE_ID}.json`;

const INDEX_BLOB =
  "index/questions-index.json";


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
  const blobClient =
    containerClient
      .getBlobClient(blobName);


  const response =
    await blobClient.download();


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


  const blockBlobClient =
    containerClient
      .getBlockBlobClient(
        blobName
      );


  await blockBlobClient.uploadData(
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
// QUESTION DESCRIPTION
// ==========================================================

function buildQuestionText(question) {
  const lines = [];


  lines.push(
    `Question ID: ${question.id}`
  );

  lines.push(
    `Question number: ${question.questionNumber}`
  );

  lines.push(
    `Section: ${question.section}`
  );

  lines.push(
    `Question type: ${question.type}`
  );

  lines.push(
    `Original type: ${question.originalType}`
  );


  lines.push("");
  lines.push("QUESTION:");

  lines.push(
    question.text || ""
  );


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


  if (
    Array.isArray(question.options) &&
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


  if (
    Array.isArray(question.fields) &&
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


  if (
    Array.isArray(question.parts) &&
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
        Array.isArray(part.options)
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


  lines.push("");
  lines.push("ANSWER MODEL:");

  lines.push(
    JSON.stringify(
      question.answer || {},
      null,
      2
    )
  );


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
// IMAGES
// ==========================================================

async function buildImageInputs(
  question,
  assetsContainer
) {
  const result = [];


  if (
    !Array.isArray(question.assets)
  ) {
    return result;
  }


  for (
    const asset
    of question.assets
  ) {
    if (!asset.blobName) {
      continue;
    }


    const buffer =
      await downloadBlobBuffer(
        assetsContainer,
        asset.blobName
      );


    const contentType =
      asset.contentType
      || "image/png";


    const dataUrl =
      `data:${contentType};base64,`
      +
      buffer.toString("base64");


    result.push({
      type:
        "input_image",

      image_url:
        dataUrl,

      detail:
        "high"
    });
  }


  return result;
}


// ==========================================================
// STRUCTURED OUTPUT
// ==========================================================

function buildClassificationSchema(
  topicCodes
) {
  return {
    type:
      "object",

    additionalProperties:
      false,

    properties: {
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
// PROMPT
// ==========================================================

function buildInstructions(
  topicsConfig,
  difficultyConfig
) {
  return `
أنت خبير في تصنيف أسئلة شبكات الاتصال
للامتحان 791381.

مهمتك تصنيف السؤال ليستخدم لاحقًا
في بناء امتحانات مدرسية.

==================================================
TOPIC
==================================================

اختر primaryTopic واحدًا فقط.

يمكن اختيار حتى 3 secondaryTopics.

استخدم التصنيف الأكثر تخصصًا الممكن.

التصنيفات:

${JSON.stringify(
  topicsConfig.topics,
  null,
  2
)}

أمثلة:

OSPF -> OSPF
وليس ROUTING فقط.

CIDR أو Subnet Mask
-> SUBNET_CIDR.

DHCP
-> DHCP.

==================================================
DIFFICULTY
==================================================

السياق المعتمد:

${JSON.stringify(
  difficultyConfig,
  null,
  2
)}

قيّم الصعوبة بالنسبة للطلاب المحددين،
وليس بالنسبة إلى خبير شبكات.

تذكر أن الامتحان مفتوح المادة،
وأن الطلاب لديهم أمثلة محلولة مشابهة.

==================================================
FAMILY KEY
==================================================

أنشئ familyKey إنجليزيًا قصيرًا وثابتًا
يصف الفكرة الأساسية التي يختبرها السؤال.

أمثلة:

dhcp-purpose
ospf-network-command
subnet-host-range
ipv4-valid-router-address
nvram-startup-config

استخدم lowercase و - فقط تقريبًا.

الهدف هو منع اختيار سؤالين يختبران
الفكرة نفسها في امتحان واحد.

==================================================
FLAGS
==================================================

hasCLI = true فقط عندما يحتاج الطالب
قراءة أو كتابة أوامر CLI / Cisco IOS.

requiresCalculation = true عندما يحتاج
الحل حسابًا فعليًا مثل:

binary conversion
CIDR
subnetting
host calculations

==================================================
REVIEW
==================================================

needsReview = true فقط إذا كان السؤال
أو التصنيف غير واضح بدرجة تستحق
مراجعة المعلم.

إذا كانت needsReview=false:
reviewReason يجب أن يكون "".

==================================================
OUTPUT
==================================================

difficultyReason بالعربية.

اجعله قصيرًا وواضحًا.

لا تخترع معلومات غير موجودة.

استعمل الصورة عند وجودها.
`;
}


// ==========================================================
// SAVE CLASSIFICATION
// ==========================================================

async function saveClassification(
  bankContainer,
  bankDocument,
  question,
  classification,
  model
) {
  const now =
    new Date()
      .toISOString();


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
      classification.needsReview
        ? "needs-review"
        : "classified",

    model,

    classifiedAt:
      now
  };


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


  // --------------------------------------------------------
  // Save source JSON
  // --------------------------------------------------------

  await uploadJson(
    bankContainer,
    SOURCE_BLOB,
    bankDocument
  );


  // --------------------------------------------------------
  // Update lightweight index
  // --------------------------------------------------------

  const indexDocument =
    await downloadBlobJson(
      bankContainer,
      INDEX_BLOB
    );


  const indexQuestion =
    indexDocument.questions
      ?.find(
        item =>
          item.id === question.id
      );


  if (indexQuestion) {
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
      question.reviewStatus;

    indexQuestion.classificationConfidence =
      classification.difficultyConfidence;
  }


  indexDocument.updatedAt =
    now;


  await uploadJson(
    bankContainer,
    INDEX_BLOB,
    indexDocument
  );
}


// ==========================================================
// MAIN
// ==========================================================

app.http("classifyQuestionPreview", {
  methods: [
    "POST"
  ],

  authLevel:
    "anonymous",

  route:
    "classify-question-preview",


  handler: async request => {
    try {
      // ----------------------------------------------------
      // AUTH
      // ----------------------------------------------------

      const configuredKey =
        process.env.BANK_SETUP_KEY;


      const suppliedKey =
        request.headers.get(
          "x-bank-setup-key"
        );


      if (
        !configuredKey ||
        suppliedKey !== configuredKey
      ) {
        return {
          status:
            401,

          jsonBody: {
            ok:
              false,

            error:
              "Unauthorized"
          }
        };
      }


      // ----------------------------------------------------
      // ENVIRONMENT
      // ----------------------------------------------------

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
        || "gpt-5.6-terra";


      // ----------------------------------------------------
      // BODY
      // ----------------------------------------------------

      let body = {};


      try {
        body =
          await request.json();
      }
      catch {
        body = {};
      }


      const requestedQuestionId =
        body?.questionId
          ? String(
              body.questionId
            )
          : null;


      const saveToBank =
        body?.save === true;


      // ----------------------------------------------------
      // CONFIG
      // ----------------------------------------------------

      const topicsConfig =
        loadConfig(
          "topics.json"
        );


      const difficultyConfig =
        loadConfig(
          "difficulty-rubric.json"
        );


      const topicCodes =
        topicsConfig.topics.map(
          item => item.code
        );


      // ----------------------------------------------------
      // STORAGE
      // ----------------------------------------------------

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


      const bankDocument =
        await downloadBlobJson(
          bankContainer,
          SOURCE_BLOB
        );


      const questions =
        Array.isArray(
          bankDocument.questions
        )
          ? bankDocument.questions
          : [];


      // ----------------------------------------------------
      // QUESTION
      // ----------------------------------------------------

      let question;


      if (requestedQuestionId) {
        question =
          questions.find(
            item =>
              item.id ===
              requestedQuestionId
          );


        if (!question) {
          return {
            status:
              404,

            jsonBody: {
              ok:
                false,

              error:
                `Question not found: ${requestedQuestionId}`
            }
          };
        }
      }
      else {
        question =
          questions.find(
            item =>
              item
                .classification
                ?.status
              ===
              "pending"
          );
      }


      // ----------------------------------------------------
      // Nothing pending
      // ----------------------------------------------------

      if (!question) {
        return {
          status:
            200,

          jsonBody: {
            ok:
              true,

            complete:
              true,

            remainingPending:
              0,

            message:
              "No pending questions remain."
          }
        };
      }


      // ----------------------------------------------------
      // INPUT
      // ----------------------------------------------------

      const questionText =
        buildQuestionText(
          question
        );


      const imageInputs =
        await buildImageInputs(
          question,
          assetsContainer
        );


      const userContent = [
        {
          type:
            "input_text",

          text:
            questionText
        },

        ...imageInputs
      ];


      // ----------------------------------------------------
      // OPENAI
      // ----------------------------------------------------

      const openai =
        await createOpenAIClient();


      const response =
        await openai.responses.create({
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

              content:
                userContent
            }
          ],

          text: {
            format: {
              type:
                "json_schema",

              name:
                "question_classification",

              strict:
                true,

              schema:
                buildClassificationSchema(
                  topicCodes
                )
            }
          },

          max_output_tokens:
            1200
        });


      if (!response.output_text) {
        throw new Error(
          "OpenAI returned no output_text"
        );
      }


      const classification =
        JSON.parse(
          response.output_text
        );


      // ----------------------------------------------------
      // Difficulty label from our rubric
      // ----------------------------------------------------

      const level =
        difficultyConfig.levels[
          String(
            classification.difficulty
          )
        ];


      classification.difficultyLabel =
        level?.label || "";


      // ----------------------------------------------------
      // SAVE
      // ----------------------------------------------------

      if (saveToBank) {
        await saveClassification(
          bankContainer,
          bankDocument,
          question,
          classification,
          model
        );
      }


      // ----------------------------------------------------
      // Progress
      // ----------------------------------------------------

      const remainingPending =
        questions.filter(
          item =>
            item
              .classification
              ?.status
            ===
            "pending"
        ).length;


      // ----------------------------------------------------
      // RESPONSE
      // ----------------------------------------------------

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
            remainingPending === 0,

          remainingPending,

          totalQuestions:
            questions.length,

          model,

          question: {
            id:
              question.id,

            number:
              question.questionNumber,

            section:
              question.section,

            type:
              question.type,

            text:
              question.text,

            hasImage:
              question.flags
                ?.hasImage
              || false,

            imageCount:
              imageInputs.length
          },

          classification,

          message:
            saveToBank
              ? "Question classified and saved to bank."
              : "Classification preview completed."
        }
      };
    }
    catch (error) {
      return {
        status:
          500,

        jsonBody: {
          ok:
            false,

          error:
            error instanceof Error
              ? error.message
              : "Unknown classification error"
        }
      };
    }
  }
});