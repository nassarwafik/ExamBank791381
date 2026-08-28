
const { app } = require("@azure/functions");

const {
  BlobServiceClient
} = require("@azure/storage-blob");

const crypto = require("crypto");

const {
  requireBuilderAuth,
  createSignedAssetParams
} = require("../lib/builder-auth");

const BANK_CONTAINER = "bank";
const INDEX_BLOB =
  "index/questions-index.json";

async function streamToBuffer(stream) {
  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(
      Buffer.from(chunk)
    );
  }

  return Buffer.concat(chunks);
}

async function downloadJson(
  containerClient,
  blobName
) {
  const blobClient =
    containerClient.getBlobClient(
      blobName
    );

  const response =
    await blobClient.download();

  if (!response.readableStreamBody) {
    throw new Error(
      "Unable to read blob: " +
      blobName
    );
  }

  const buffer =
    await streamToBuffer(
      response.readableStreamBody
    );

  return JSON.parse(
    buffer.toString("utf8")
  );
}

function presentationTypeFromFullQuestion(
  question
) {
  if (
    question.type ===
    "multipleChoice"
  ) {
    return "multipleChoice";
  }

  if (
    question.type ===
    "multiField"
  ) {
    const fields =
      Array.isArray(
        question.fields
      )
        ? question.fields
        : [];

    const hasSelect =
      fields.some(field =>
        String(
          field.kind || ""
        ).toLowerCase() ===
          "select" ||
        (
          Array.isArray(
            field.options
          ) &&
          field.options.length > 2
        )
      );

    return hasSelect
      ? "wordBank"
      : "fillBlank";
  }

  return "open";
}

function broadlyMatchesType(
  indexQuestion,
  desiredType
) {
  if (!desiredType) {
    return true;
  }

  if (
    desiredType ===
    "multipleChoice"
  ) {
    return (
      indexQuestion.type ===
      "multipleChoice"
    );
  }

  if (
    desiredType ===
      "fillBlank" ||
    desiredType ===
      "wordBank"
  ) {
    return (
      indexQuestion.type ===
      "multiField"
    );
  }

  return ![
    "multipleChoice",
    "multiField"
  ].includes(
    indexQuestion.type
  );
}

function isOfficialLikeSource(
  question
) {
  const sourceId =
    String(
      question.sourceId || ""
    );

  const examCode =
    String(
      question.examCode || ""
    );

  return (
    /^791381-20\d{2}/.test(
      sourceId
    ) ||
    /^791367-20\d{2}/.test(
      sourceId
    ) ||
    examCode === "791381" ||
    examCode === "791367"
  );
}

function buildAssetData(asset) {
  if (!asset?.blobName) {
    return null;
  }

  const {
    exp,
    sig
  } =
    createSignedAssetParams(
      asset.blobName,
      8 * 60 * 60
    );

  return {
    id:
      asset.id ||
      asset.key ||
      asset.blobName,

    origin: "bank",

    blobName:
      asset.blobName,

    contentType:
      asset.contentType ||
      "image/png",

    dataUrl:
      "/api/question-image" +
      "?blob=" +
      encodeURIComponent(
        asset.blobName
      ) +
      "&exp=" +
      encodeURIComponent(
        String(exp)
      ) +
      "&sig=" +
      encodeURIComponent(sig)
  };
}

function candidateScore(
  candidate,
  current,
  desiredDifficulty,
  desiredType,
  usedFamilies
) {
  let score =
    crypto.randomInt(
      0,
      1000
    ) / 1000;

  if (
    candidate.section ===
    current.section
  ) {
    score += 80;
  }

  if (
    candidate.topic ===
    current.topic
  ) {
    score += 65;
  }

  const difficulty =
    Number(
      candidate.difficulty
    );

  const targetDifficulty =
    Number.isInteger(
      desiredDifficulty
    )
      ? desiredDifficulty
      : Number(
          current.difficulty
        );

  if (
    difficulty ===
    targetDifficulty
  ) {
    score += 55;
  }

  if (
    broadlyMatchesType(
      candidate,
      desiredType ||
        current.presentationType
    )
  ) {
    score += 35;
  }

  if (
    candidate.hasCLI ===
    current.hasCLI
  ) {
    score += 8;
  }

  if (
    candidate.requiresCalculation ===
    current.requiresCalculation
  ) {
    score += 8;
  }

  if (
    candidate.hasImage ===
    current.image?.exists
  ) {
    score += 4;
  }

  if (
    isOfficialLikeSource(
      candidate
    )
  ) {
    score += 5;
  }

  const familyKey =
    String(
      candidate.familyKey || ""
    ).trim();

  if (
    familyKey &&
    usedFamilies.has(
      familyKey
    )
  ) {
    score -= 1000;
  }

  return score;
}

function buildExamQuestion(
  fullQuestion,
  indexQuestion,
  currentQuestion
) {
  const renderedAssets =
    (
      Array.isArray(
        fullQuestion.assets
      )
        ? fullQuestion.assets
        : []
    )
      .map(
        buildAssetData
      )
      .filter(Boolean);

  const presentationType =
    presentationTypeFromFullQuestion(
      fullQuestion
    );

  return {
    examQuestionId:
      currentQuestion
        .examQuestionId,

    origin: "bank",

    bankQuestionId:
      fullQuestion.id,

    sourceId:
      fullQuestion.sourceId,

    sourceQuestionId:
      fullQuestion
        .sourceQuestionId,

    questionNumber:
      fullQuestion
        .questionNumber,

    section:
      indexQuestion.section,

    topic:
      indexQuestion.topic,

    secondaryTopics:
      indexQuestion
        .secondaryTopics ||
      [],

    difficulty:
      Number(
        indexQuestion
          .difficulty
      ),

    difficultyLabel:
      indexQuestion
        .difficultyLabel ||
      "",

    familyKey:
      indexQuestion
        .familyKey ||
      "",

    hasCLI:
      indexQuestion
        .hasCLI === true,

    requiresCalculation:
      indexQuestion
        .requiresCalculation ===
      true,

    presentationType,

    bankType:
      fullQuestion.type,

    marks:
      Number(
        currentQuestion
          .marks ||
        0
      ),

    locked:
      currentQuestion
        .locked === true,

    text:
      fullQuestion.text ||
      "",

    textHtml:
      fullQuestion.textHtml ||
      "",

    options:
      fullQuestion.options ||
      [],

    fields:
      fullQuestion.fields ||
      [],

    parts:
      fullQuestion.parts ||
      [],

    answer:
      fullQuestion.answer ||
      {},

    hint:
      fullQuestion.hint ||
      "",

    teacherNote:
      currentQuestion
        .teacherNote ||
      "",

    aiInstruction: "",

    wasModified: false,

    image: {
      exists:
        renderedAssets.length >
        0,

      visible:
        renderedAssets.length >
        0,

      origin:
        renderedAssets.length >
        0
          ? "bank"
          : null,

      assets:
        renderedAssets,

      prompt: null
    },

    history: [],
    redoStack: []
  };
}

app.http(
  "questionBankAction",
  {
    methods: [
      "POST"
    ],

    authLevel:
      "anonymous",

    route:
      "question-bank-action",

    handler:
      async request => {
        try {
          const auth =
            requireBuilderAuth(
              request
            );

          if (!auth.ok) {
            return auth.response;
          }

          let body = {};

          try {
            body =
              await request.json();
          }
          catch {
            body = {};
          }

          const currentQuestion =
            body?.question;

          if (
            !currentQuestion
              ?.examQuestionId
          ) {
            return {
              status: 400,

              jsonBody: {
                ok: false,

                error:
                  "Current question is required."
              }
            };
          }

          const desiredDifficulty =
            body?.difficulty ===
              undefined ||
            body?.difficulty ===
              null
              ? null
              : Number(
                  body.difficulty
                );

          const desiredType =
            body
              ?.presentationType
              ? String(
                  body
                    .presentationType
                )
              : null;

          if (
            desiredDifficulty !==
              null &&
            ![
              1,
              2,
              3,
              4,
              5
            ].includes(
              desiredDifficulty
            )
          ) {
            return {
              status: 400,

              jsonBody: {
                ok: false,
                error:
                  "Invalid difficulty."
              }
            };
          }

          if (
            desiredType &&
            ![
              "multipleChoice",
              "fillBlank",
              "wordBank",
              "open"
            ].includes(
              desiredType
            )
          ) {
            return {
              status: 400,

              jsonBody: {
                ok: false,

                error:
                  "Invalid presentation type."
              }
            };
          }

          const connectionString =
            process.env
              .AZURE_STORAGE_CONNECTION_STRING;

          if (
            !connectionString
          ) {
            throw new Error(
              "AZURE_STORAGE_CONNECTION_STRING is not configured"
            );
          }

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

          const index =
            await downloadJson(
              bankContainer,
              INDEX_BLOB
            );

          const usedIds =
            new Set(
              Array.isArray(
                body
                  ?.usedBankQuestionIds
              )
                ? body
                    .usedBankQuestionIds
                    .map(String)
                : []
            );

          if (
            currentQuestion
              .bankQuestionId
          ) {
            usedIds.add(
              String(
                currentQuestion
                  .bankQuestionId
              )
            );
          }

          const usedFamilies =
            new Set(
              Array.isArray(
                body
                  ?.usedFamilyKeys
              )
                ? body
                    .usedFamilyKeys
                    .map(String)
                    .filter(
                      Boolean
                    )
                : []
            );

          const allQuestions =
            Array.isArray(
              index.questions
            )
              ? index.questions
              : [];

          let candidates =
            allQuestions.filter(
              candidate => {
                if (
                  !candidate?.id ||
                  !candidate
                    ?.sourceId
                ) {
                  return false;
                }

                if (
                  usedIds.has(
                    String(
                      candidate.id
                    )
                  )
                ) {
                  return false;
                }

                if (
                  ![
                    "BASIC",
                    "INFRASTRUCTURE"
                  ].includes(
                    candidate.section
                  )
                ) {
                  return false;
                }

                if (
                  !candidate.topic ||
                  candidate.topic ===
                    "UNKNOWN"
                ) {
                  return false;
                }

                if (
                  candidate
                    .needsReview ===
                  true
                ) {
                  return false;
                }

                if (
                  candidate
                    .reviewStatus ===
                  "needs-review"
                ) {
                  return false;
                }

                if (
                  desiredDifficulty !==
                    null &&
                  Number(
                    candidate
                      .difficulty
                  ) !==
                    desiredDifficulty
                ) {
                  return false;
                }

                if (
                  !broadlyMatchesType(
                    candidate,
                    desiredType
                  )
                ) {
                  return false;
                }

                return true;
              }
            );

          if (
            candidates.length ===
            0
          ) {
            throw new Error(
              "No eligible replacement question was found."
            );
          }

          candidates.sort(
            (
              a,
              b
            ) =>
              candidateScore(
                b,
                currentQuestion,
                desiredDifficulty,
                desiredType,
                usedFamilies
              ) -
              candidateScore(
                a,
                currentQuestion,
                desiredDifficulty,
                desiredType,
                usedFamilies
              )
          );

          const sourceCache =
            new Map();

          let chosen = null;

          for (
            const candidate
            of candidates.slice(
              0,
              100
            )
          ) {
            let sourceDocument =
              sourceCache.get(
                candidate.sourceId
              );

            if (
              !sourceDocument
            ) {
              sourceDocument =
                await downloadJson(
                  bankContainer,
                  "sources/" +
                    candidate
                      .sourceId +
                    ".json"
                );

              sourceCache.set(
                candidate
                  .sourceId,
                sourceDocument
              );
            }

            const fullQuestion =
              sourceDocument
                ?.questions
                ?.find(
                  item =>
                    item.id ===
                    candidate.id
                );

            if (
              !fullQuestion
            ) {
              continue;
            }

            const actualType =
              presentationTypeFromFullQuestion(
                fullQuestion
              );

            if (
              desiredType &&
              actualType !==
                desiredType
            ) {
              continue;
            }

            chosen = {
              indexQuestion:
                candidate,

              fullQuestion
            };

            break;
          }

          if (!chosen) {
            throw new Error(
              "No replacement question matched the requested controls."
            );
          }

          return {
            status: 200,

            jsonBody: {
              ok: true,

              question:
                buildExamQuestion(
                  chosen
                    .fullQuestion,

                  chosen
                    .indexQuestion,

                  currentQuestion
                )
            }
          };
        }
        catch (error) {
          return {
            status: 500,

            jsonBody: {
              ok: false,

              error:
                error
                instanceof Error
                  ? error.message
                  : "Question bank action failed."
            }
          };
        }
      }
  }
);
