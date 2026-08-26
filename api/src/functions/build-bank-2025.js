const { app } = require("@azure/functions");
const { BlobServiceClient } = require("@azure/storage-blob");
const crypto = require("crypto");

const RAW_CONTAINER = "raw";
const BANK_CONTAINER = "bank";
const ASSETS_CONTAINER = "assets";

const RAW_FILE = "791381 - 2025.html";

const SOURCE_ID = "791381-2025";
const EXAM_CODE = "791381";
const YEAR = 2025;


// ==========================================================
// Stream -> Buffer / String
// ==========================================================

async function streamToBuffer(stream) {
  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}


async function downloadBlobBuffer(containerClient, blobName) {
  const blobClient =
    containerClient.getBlobClient(blobName);

  const response =
    await blobClient.download();

  if (!response.readableStreamBody) {
    throw new Error(
      `Could not download blob: ${blobName}`
    );
  }

  return await streamToBuffer(
    response.readableStreamBody
  );
}


async function downloadBlobText(containerClient, blobName) {
  const buffer =
    await downloadBlobBuffer(
      containerClient,
      blobName
    );

  return buffer.toString("utf8");
}


// ==========================================================
// Extract JSON stored inside:
//
// const baseQ = [...];
// const infraQ = [...];
// const images = {...};
// ==========================================================

function extractConstJson(source, constName) {
  const pattern =
    new RegExp(
      `\\bconst\\s+${constName}\\s*=\\s*`
    );

  const match =
    pattern.exec(source);

  if (!match) {
    throw new Error(
      `Could not find const ${constName}`
    );
  }

  let start =
    match.index + match[0].length;

  while (
    start < source.length &&
    /\s/.test(source[start])
  ) {
    start++;
  }

  const opening =
    source[start];

  let closing;

  if (opening === "{") {
    closing = "}";
  }
  else if (opening === "[") {
    closing = "]";
  }
  else {
    throw new Error(
      `const ${constName} does not contain JSON`
    );
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (
    let i = start;
    i < source.length;
    i++
  ) {
    const char =
      source[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      }
      else if (char === "\\") {
        escaped = true;
      }
      else if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === opening) {
      depth++;
    }
    else if (char === closing) {
      depth--;

      if (depth === 0) {
        return JSON.parse(
          source.substring(
            start,
            i + 1
          )
        );
      }
    }
  }

  throw new Error(
    `Could not find end of const ${constName}`
  );
}


// ==========================================================
// HTML -> plain text
// ==========================================================

function decodeEntities(value) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(
      /&#(\d+);/g,
      (_, number) =>
        String.fromCharCode(
          Number(number)
        )
    );
}


function toPlainText(value) {
  if (!value) {
    return "";
  }

  return decodeEntities(
    String(value)
      .replace(
        /<\s*br\s*\/?\s*>/gi,
        "\n"
      )
      .replace(
        /<[^>]+>/g,
        ""
      )
  )
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .trim();
}


// ==========================================================
// Question type
// ==========================================================

function normalizeQuestionType(type) {
  switch (
    String(type || "")
      .toLowerCase()
  ) {
    case "radio":
    case "radioimage":
      return "multipleChoice";

    case "text":
    case "textimage":
      return "shortAnswer";

    case "multitext":
      return "multiField";

    case "multiselect":
      return "multiField";

    case "combo":
    case "comboimage":
      return "multiPart";

    default:
      return "other";
  }
}


// ==========================================================
// Options
// ==========================================================

function normalizeOptionLabel(value) {
  const text =
    String(value || "").trim();

  if (/^[a-z]$/i.test(text)) {
    return text.toUpperCase();
  }

  return text;
}


function convertOptions(options) {
  if (!Array.isArray(options)) {
    return [];
  }

  return options.map(
    (option, index) => ({
      value:
        String(
          option.v ?? ""
        ),

      label:
        normalizeOptionLabel(
          option.v ?? index + 1
        ),

      text:
        toPlainText(
          option.t ?? ""
        ),

      textHtml:
        String(
          option.t ?? ""
        ),

      order:
        index + 1
    })
  );
}


// ==========================================================
// Fields
// ==========================================================

function convertFields(fields) {
  if (!Array.isArray(fields)) {
    return [];
  }

  return fields.map(
    (field, index) => ({
      id:
        String(
          field.id ?? ""
        ),

      label:
        toPlainText(
          field.label ?? ""
        ),

      labelHtml:
        String(
          field.label ?? ""
        ),

      order:
        index + 1
    })
  );
}


// ==========================================================
// Parts
// ==========================================================

function convertParts(parts) {
  if (!Array.isArray(parts)) {
    return [];
  }

  return parts.map(
    (part, index) => ({
      id:
        String(
          part.id ?? ""
        ),

      name:
        String(
          part.name ?? ""
        ),

      kind:
        String(
          part.kind ?? ""
        ),

      label:
        toPlainText(
          part.label ?? ""
        ),

      labelHtml:
        String(
          part.label ?? ""
        ),

      options:
        convertOptions(
          part.options
        ),

      order:
        index + 1
    })
  );
}


// ==========================================================
// Answers
// ==========================================================

function convertAnswer(question) {
  if (
    question.correct !== undefined &&
    question.correct !== null &&
    String(question.correct).trim() !== ""
  ) {
    const correctValue =
      String(question.correct);

    const option =
      Array.isArray(question.options)
        ? question.options.find(
            x =>
              String(x.v)
                .toLowerCase()
              ===
              correctValue
                .toLowerCase()
          )
        : null;

    return {
      mode:
        "singleChoice",

      correctOptionValue:
        correctValue,

      correctOptionLabel:
        normalizeOptionLabel(
          correctValue
        ),

      correctText:
        option
          ? toPlainText(
              option.t
            )
          : null,

      values: [
        correctValue
      ]
    };
  }


  if (
    Array.isArray(question.accept) &&
    question.accept.length > 0
  ) {
    return {
      mode:
        "exactSequence",

      values:
        question.accept.map(
          value => String(value)
        )
    };
  }


  if (
    Array.isArray(question.acceptAny) &&
    question.acceptAny.length > 0
  ) {
    return {
      mode:
        "anyAccepted",

      values:
        question.acceptAny.map(
          value => String(value)
        )
    };
  }


  if (
    Array.isArray(
      question.acceptContains
    ) &&
    question.acceptContains.length > 0
  ) {
    return {
      mode:
        "containsTokens",

      values:
        question.acceptContains.map(
          value => String(value)
        )
    };
  }


  return {
    mode:
      "manual",

    values: []
  };
}


// ==========================================================
// Image references
// ==========================================================

function getImageKeys(question) {
  const result = [];

  if (
    typeof question.image === "string" &&
    question.image.trim()
  ) {
    result.push(
      question.image.trim()
    );
  }

  if (Array.isArray(question.images)) {
    for (const image of question.images) {
      if (
        typeof image === "string" &&
        image.trim()
      ) {
        result.push(
          image.trim()
        );
      }
    }
  }

  return [
    ...new Set(result)
  ];
}


// ==========================================================
// Decode Base64 image
// ==========================================================

function decodeImage(value) {
  let base64 =
    String(value || "").trim();

  let contentType =
    "image/png";

  const dataUriMatch =
    base64.match(
      /^data:([^;]+);base64,(.*)$/s
    );

  if (dataUriMatch) {
    contentType =
      dataUriMatch[1];

    base64 =
      dataUriMatch[2];
  }

  const buffer =
    Buffer.from(
      base64,
      "base64"
    );


  // PNG
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return {
      buffer,
      extension:
        ".png",
      contentType:
        "image/png"
    };
  }


  // JPEG
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return {
      buffer,
      extension:
        ".jpg",
      contentType:
        "image/jpeg"
    };
  }


  // GIF
  if (
    buffer.length >= 6 &&
    buffer
      .subarray(0, 3)
      .toString("ascii")
      === "GIF"
  ) {
    return {
      buffer,
      extension:
        ".gif",
      contentType:
        "image/gif"
    };
  }


  return {
    buffer,
    extension:
      contentType === "image/jpeg"
        ? ".jpg"
        : ".png",

    contentType
  };
}


// ==========================================================
// Upload JSON
// ==========================================================

async function uploadJson(
  containerClient,
  blobName,
  value
) {
  const text =
    JSON.stringify(
      value,
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
// Existing bank index
// ==========================================================

async function readExistingIndex(
  bankContainer
) {
  const blobName =
    "index/questions-index.json";

  const blobClient =
    bankContainer.getBlobClient(
      blobName
    );

  if (
    !(await blobClient.exists())
  ) {
    return {
      schemaVersion: 1,
      updatedAt: null,
      questionCount: 0,
      questions: []
    };
  }

  const text =
    await downloadBlobText(
      bankContainer,
      blobName
    );

  return JSON.parse(text);
}


// ==========================================================
// Convert one question
// ==========================================================

function convertQuestion(
  sourceQuestion,
  section,
  assetLookup
) {
  const sourceQuestionId =
    String(
      sourceQuestion.id ?? ""
    );

  const questionId =
    `${SOURCE_ID}-${sourceQuestionId}`;

  const imageKeys =
    getImageKeys(
      sourceQuestion
    );

  const assets =
    imageKeys
      .filter(
        key =>
          assetLookup.has(key)
      )
      .map(
        key =>
          assetLookup.get(key)
      );


  const isInfra =
    section === "INFRASTRUCTURE";


  return {
    id:
      questionId,

    sourceId:
      SOURCE_ID,

    sourceQuestionId,

    questionNumber:
      String(
        sourceQuestion.n ?? ""
      ),

    section,

    parentGroup:
      isInfra
        ? {
            id:
              `${SOURCE_ID}-q23`,

            number:
              "23",

            title:
              "القسم الثاني – تخصص البنى التحتية للاتصالات"
          }
        : null,

    points:
      sourceQuestion.mark !== undefined
        ? Number(
            sourceQuestion.mark
          )
        : null,

    type:
      normalizeQuestionType(
        sourceQuestion.type
      ),

    originalType:
      String(
        sourceQuestion.type ?? ""
      ),

    text:
      toPlainText(
        sourceQuestion.text ?? ""
      ),

    textHtml:
      String(
        sourceQuestion.text ?? ""
      ),

    options:
      convertOptions(
        sourceQuestion.options
      ),

    fields:
      convertFields(
        sourceQuestion.fields
      ),

    parts:
      convertParts(
        sourceQuestion.parts
      ),

    answer:
      convertAnswer(
        sourceQuestion
      ),

    hint:
      toPlainText(
        sourceQuestion.hint ?? ""
      ),

    assets,

    flags: {
      hasImage:
        assets.length > 0,

      hasOptions:
        Array.isArray(
          sourceQuestion.options
        ) &&
        sourceQuestion.options.length > 0,

      isChild:
        isInfra,

      requiresManualReview:
        convertAnswer(
          sourceQuestion
        ).mode === "manual"
    },

    classification: {
      topic:
        null,

      secondaryTopics: [],

      difficulty:
        null,

      difficultyLabel:
        null,

      difficultyReason:
        null,

      difficultyConfidence:
        null,

      familyKey:
        null,

      status:
        "pending"
    },

    reviewStatus:
      "pending-classification"
  };
}


// ==========================================================
// MAIN FUNCTION
// ==========================================================

app.http("buildBank2025", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "build-bank-2025",

  handler: async request => {
    try {
      // --------------------------------------------------
      // Temporary protection until real login is built
      // --------------------------------------------------

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
          status: 401,

          jsonBody: {
            ok: false,
            error:
              "Unauthorized"
          }
        };
      }


      // --------------------------------------------------
      // Storage
      // --------------------------------------------------

      const connectionString =
        process.env
          .AZURE_STORAGE_CONNECTION_STRING;


      if (!connectionString) {
        throw new Error(
          "AZURE_STORAGE_CONNECTION_STRING is not configured"
        );
      }


      const blobServiceClient =
        BlobServiceClient
          .fromConnectionString(
            connectionString
          );


      const rawContainer =
        blobServiceClient
          .getContainerClient(
            RAW_CONTAINER
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


      // --------------------------------------------------
      // Download raw source
      // --------------------------------------------------

      const rawBuffer =
        await downloadBlobBuffer(
          rawContainer,
          RAW_FILE
        );


      const html =
        rawBuffer.toString(
          "utf8"
        );


      const sourceHash =
        crypto
          .createHash("sha256")
          .update(rawBuffer)
          .digest("hex");


      // --------------------------------------------------
      // Parse source
      // --------------------------------------------------

      const images =
        extractConstJson(
          html,
          "images"
        );


      const baseQuestions =
        extractConstJson(
          html,
          "baseQ"
        );


      const infraQuestions =
        extractConstJson(
          html,
          "infraQ"
        );


      if (
        !Array.isArray(
          baseQuestions
        ) ||
        baseQuestions.length !== 22
      ) {
        throw new Error(
          `Expected 22 BASIC questions, found ${baseQuestions.length}`
        );
      }


      if (
        !Array.isArray(
          infraQuestions
        ) ||
        infraQuestions.length !== 12
      ) {
        throw new Error(
          `Expected 12 INFRASTRUCTURE questions, found ${infraQuestions.length}`
        );
      }


      // --------------------------------------------------
      // Networking image keys only
      // --------------------------------------------------

      const referencedImageKeys =
        [
          ...baseQuestions,
          ...infraQuestions
        ]
          .flatMap(
            question =>
              getImageKeys(
                question
              )
          );


      const uniqueImageKeys =
        [
          ...new Set(
            referencedImageKeys
          )
        ];


      // --------------------------------------------------
      // Upload only referenced networking images
      // --------------------------------------------------

      const assetLookup =
        new Map();


      for (
        const imageKey
        of uniqueImageKeys
      ) {
        if (!images[imageKey]) {
          throw new Error(
            `Missing embedded image: ${imageKey}`
          );
        }


        const decoded =
          decodeImage(
            images[imageKey]
          );


        const blobName =
          `${EXAM_CODE}/${YEAR}/${imageKey}${decoded.extension}`;


        const blockBlobClient =
          assetsContainer
            .getBlockBlobClient(
              blobName
            );


        await blockBlobClient
          .uploadData(
            decoded.buffer,
            {
              blobHTTPHeaders: {
                blobContentType:
                  decoded.contentType
              }
            }
          );


        assetLookup.set(
          imageKey,
          {
            id:
              `${SOURCE_ID}-${imageKey}`,

            key:
              imageKey,

            container:
              ASSETS_CONTAINER,

            blobName,

            contentType:
              decoded.contentType,

            sizeBytes:
              decoded.buffer.length
          }
        );
      }


      // --------------------------------------------------
      // Convert questions
      // --------------------------------------------------

      const questions =
        [
          ...baseQuestions.map(
            question =>
              convertQuestion(
                question,
                "BASIC",
                assetLookup
              )
          ),

          ...infraQuestions.map(
            question =>
              convertQuestion(
                question,
                "INFRASTRUCTURE",
                assetLookup
              )
          )
        ];


      // --------------------------------------------------
      // Source bank document
      // --------------------------------------------------

      const now =
        new Date()
          .toISOString();


      const bankDocument = {
        schemaVersion:
          1,

        source: {
          id:
            SOURCE_ID,

          examCode:
            EXAM_CODE,

          year:
            YEAR,

          season:
            "صيف",

          title:
            "791381 – صيف 2025",

          sourceType:
            "bagrut",

          provenance:
            "interactive-html",

          priority:
            90,

          original: {
            container:
              RAW_CONTAINER,

            blobName:
              RAW_FILE,

            sha256:
              sourceHash
          },

          processedAt:
            now
        },

        groups: [
          {
            id:
              `${SOURCE_ID}-q23`,

            number:
              "23",

            title:
              "القسم الثاني – تخصص البنى التحتية للاتصالات",

            type:
              "composite"
          }
        ],

        questionCount:
          questions.length,

        imageCount:
          uniqueImageKeys.length,

        questions
      };


      await uploadJson(
        bankContainer,
        `sources/${SOURCE_ID}.json`,
        bankDocument
      );


      // --------------------------------------------------
      // Update lightweight question index
      // --------------------------------------------------

      const existingIndex =
        await readExistingIndex(
          bankContainer
        );


      const oldQuestions =
        Array.isArray(
          existingIndex.questions
        )
          ? existingIndex.questions
          : [];


      const otherSources =
        oldQuestions.filter(
          question =>
            question.sourceId
            !== SOURCE_ID
        );


      const sourceIndexEntries =
        questions.map(
          question => ({
            id:
              question.id,

            sourceId:
              question.sourceId,

            year:
              YEAR,

            examCode:
              EXAM_CODE,

            sourcePriority:
              90,

            questionNumber:
              question.questionNumber,

            section:
              question.section,

            type:
              question.type,

            originalType:
              question.originalType,

            topic:
              question
                .classification
                .topic,

            difficulty:
              question
                .classification
                .difficulty,

            familyKey:
              question
                .classification
                .familyKey,

            hasImage:
              question.flags.hasImage,

            assetCount:
              question.assets.length,

            reviewStatus:
              question.reviewStatus
          })
        );


      const finalIndexQuestions =
        [
          ...otherSources,
          ...sourceIndexEntries
        ];


      const finalIndex = {
        schemaVersion:
          1,

        updatedAt:
          now,

        questionCount:
          finalIndexQuestions.length,

        questions:
          finalIndexQuestions
      };


      await uploadJson(
        bankContainer,
        "index/questions-index.json",
        finalIndex
      );


      // --------------------------------------------------
      // Result
      // --------------------------------------------------

      return {
        status: 200,

        jsonBody: {
          ok: true,

          sourceId:
            SOURCE_ID,

          rawFile:
            RAW_FILE,

          rawSha256:
            sourceHash,

          questions: {
            basic:
              baseQuestions.length,

            infrastructure:
              infraQuestions.length,

            total:
              questions.length
          },

          assets: {
            referenced:
              uniqueImageKeys.length,

            uploaded:
              uniqueImageKeys.length
          },

          bank: {
            sourceBlob:
              `sources/${SOURCE_ID}.json`,

            indexBlob:
              "index/questions-index.json"
          },

          classification:
            "NOT RUN YET",

          message:
            "Question bank source created successfully."
        }
      };
    }
    catch (error) {
      return {
        status: 500,

        jsonBody: {
          ok: false,

          error:
            error instanceof Error
              ? error.message
              : "Unknown build-bank error"
        }
      };
    }
  }
});