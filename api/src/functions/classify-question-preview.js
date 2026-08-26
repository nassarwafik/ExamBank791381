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


// ==========================================================
// Load JSON config
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
// Stream helpers
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


// ==========================================================
// OpenAI client
//
// Dynamic import works cleanly with our CommonJS
// Azure Function project.
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
// Build readable question description
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


  // --------------------------------------------------------
  // Parent / composite context
  // --------------------------------------------------------

  if (question.parentGroup) {
    lines.push("");
    lines.push("PARENT / GROUP CONTEXT:");

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
    Array.isArray(question.options) &&
    question.options.length > 0
  ) {
    lines.push("");
    lines.push("OPTIONS:");

    for (const option of question.options) {
      lines.push(
        `${option.label}: ${option.text}`
      );
    }
  }


  // --------------------------------------------------------
  // Fields
  // --------------------------------------------------------

  if (
    Array.isArray(question.fields) &&
    question.fields.length > 0
  ) {
    lines.push("");
    lines.push("FIELDS:");

    for (const field of question.fields) {
      lines.push(
        `${field.order}. ${field.label}`
      );
    }
  }


  // --------------------------------------------------------
  // Parts
  // --------------------------------------------------------

  if (
    Array.isArray(question.parts) &&
    question.parts.length > 0
  ) {
    lines.push("");
    lines.push("PARTS:");

    for (const part of question.parts) {
      lines.push(
        `${part.order}. ${part.label}`
      );

      if (
        Array.isArray(part.options) &&
        part.options.length > 0
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
  //
  // We include the answer because difficulty can depend on
  // what the student actually has to produce.
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
// Image input
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
// Structured Output JSON Schema
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
// Prompt
// ==========================================================

function buildInstructions(
  topicsConfig,
  difficultyConfig
) {
  return `
أنت خبير في تصنيف أسئلة شبكات الاتصال
للامتحان 791381.

مهمتك ليست حل السؤال فقط، بل تصنيفه بدقة
حتى يستخدم لاحقًا في بناء امتحانات لطلاب
مدرسة ثانوية.

==================================================
TOPIC CLASSIFICATION
==================================================

اختر primaryTopic واحدًا فقط من القائمة التالية.

يمكن اختيار حتى 3 secondaryTopics.

التصنيفات المتاحة:

${JSON.stringify(
  topicsConfig.topics,
  null,
  2
)}

اختر الموضوع الأكثر تخصصًا عندما يكون واضحًا.

مثال:
إذا كان السؤال عن OSPF:
primaryTopic = OSPF
وليس ROUTING فقط.

إذا كان عن Subnet Mask / CIDR:
primaryTopic = SUBNET_CIDR.

إذا كان عن أوامر Cisco عامة بدون موضوع
أكثر تخصصًا:
primaryTopic = CISCO_CLI.

==================================================
DIFFICULTY CLASSIFICATION
==================================================

هذا هو سياق الطلاب وسلم الصعوبة المعتمد:

${JSON.stringify(
  difficultyConfig,
  null,
  2
)}

التزم بهذا السلم حرفيًا.

لا تصنف الصعوبة بالنسبة لخبير شبكات.

قيّم الصعوبة بالنسبة للطلاب المذكورين،
مع الأخذ بعين الاعتبار أن الامتحان مفتوح المادة
ولديهم أمثلة محلولة مشابهة.

==================================================
QUESTION FAMILY
==================================================

أنشئ familyKey إنجليزيًا قصيرًا وثابتًا
يصف الفكرة الأساسية التي يختبرها السؤال.

مثال:

dhcp-purpose
ospf-network-command
ipv4-valid-router-address
subnet-host-range
nvram-startup-config

الهدف من familyKey هو منع اختيار سؤالين
يختبران نفس الفكرة تقريبًا في الامتحان نفسه.

استخدم lowercase والكلمات مفصولة بشرطة -.

==================================================
FLAGS
==================================================

hasCLI:
true فقط إذا كان الطالب يحتاج قراءة أو كتابة
أوامر CLI أو Cisco IOS.

requiresCalculation:
true إذا كان الحل يحتاج حسابًا فعليًا، مثل
binary conversion أو subnetting أو CIDR أو
حساب عدد hosts/networks.

==================================================
REVIEW
==================================================

needsReview = true إذا كان التصنيف غير واضح
أو السؤال ناقص أو متعدد الاحتمالات.

إذا needsReview=false:
reviewReason يجب أن يكون "".

==================================================
OUTPUT
==================================================

اكتب difficultyReason بالعربية وباختصار واضح.

لا تخترع معلومات غير موجودة في السؤال.

إذا كانت هناك صورة مرفقة، استخدمها في فهم
السؤال وتقييم صعوبته.
`;
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
      // Temporary protection
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
      // Environment
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
      // Config
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
          topic => topic.code
        );


      // ----------------------------------------------------
      // Storage
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


      // ----------------------------------------------------
      // Read bank source
      // ----------------------------------------------------

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


      if (questions.length === 0) {
        throw new Error(
          "Bank source contains no questions"
        );
      }


      // ----------------------------------------------------
      // Optional QuestionID from body
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


      let question;


      if (requestedQuestionId) {
        question =
          questions.find(
            item =>
              item.id
              ===
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
        // First question still waiting for classification
        question =
          questions.find(
            item =>
              item
                .classification
                ?.status
              ===
              "pending"
          )
          ||
          questions[0];
      }


      // ----------------------------------------------------
      // Build multimodal input
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
      // OpenAI
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


      // ----------------------------------------------------
      // Structured output
      // ----------------------------------------------------

      if (
        !response.output_text
      ) {
        throw new Error(
          "OpenAI returned no output_text"
        );
      }


      const classification =
        JSON.parse(
          response.output_text
        );


      // ----------------------------------------------------
      // Make difficulty label deterministic
      // ----------------------------------------------------

      const difficultyDefinition =
        difficultyConfig.levels[
          String(
            classification.difficulty
          )
        ];


      classification
        .difficultyLabel =
        difficultyDefinition
          ?.label
        || "";


      // ----------------------------------------------------
      // Preview only
      // ----------------------------------------------------

      return {
        status:
          200,

        jsonBody: {
          ok:
            true,

          previewOnly:
            true,

          savedToBank:
            false,

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
            "Classification preview completed. Bank was not modified."
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