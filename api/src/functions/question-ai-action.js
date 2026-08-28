
const { app } = require("@azure/functions");

const {
  requireBuilderAuth
} = require("../lib/builder-auth");

async function loadOpenAI() {
  const module =
    await import("openai");

  return module.default;
}

async function createClient(
  provider
) {
  const OpenAI =
    await loadOpenAI();

  if (
    provider === "glm"
  ) {
    const apiKey =
      process.env
        .ZAI_API_KEY;

    if (!apiKey) {
      throw new Error(
        "ZAI_API_KEY is not configured."
      );
    }

    return {
      client:
        new OpenAI({
          apiKey,

          baseURL:
            process.env
              .ZAI_BASE_URL ||
            "https://api.z.ai/api/paas/v4"
        }),

      model:
        process.env
          .ZAI_MODEL ||
        "glm-5.3-flash",

      mode: "chat"
    };
  }

  if (
    provider === "qwen"
  ) {
    const apiKey =
      process.env
        .QWEN_API_KEY;

    if (!apiKey) {
      throw new Error(
        "QWEN_API_KEY is not configured."
      );
    }

    return {
      client:
        new OpenAI({
          apiKey,

          baseURL:
            process.env
              .QWEN_BASE_URL ||
            "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
        }),

      model:
        process.env
          .QWEN_MODEL ||
        "qwen3.5-flash",

      mode: "qwen"
    };
  }

  const apiKey =
    process.env
      .OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not configured."
    );
  }

  return {
    client:
      new OpenAI({
        apiKey
      }),

    model:
      process.env
        .OPENAI_MODEL ||
      "gpt-5.6-luna",

    mode:
      "responses"
  };
}

function buildSchema() {
  return {
    type: "object",

    additionalProperties:
      false,

    properties: {
      text: {
        type: "string"
      },

      presentationType: {
        type: "string",

        enum: [
          "multipleChoice",
          "fillBlank",
          "wordBank",
          "open"
        ]
      },

      options: {
        type: "array",

        maxItems: 8,

        items: {
          type: "string"
        }
      },

      fields: {
        type: "array",

        maxItems: 10,

        items: {
          type: "string"
        }
      },

      answerText: {
        type: "string"
      },

      correctOptionIndex: {
        type: "integer",
        minimum: -1,
        maximum: 7
      },

      fieldAnswers: {
        type: "array",

        maxItems: 10,

        items: {
          type: "string"
        }
      }
    },

    required: [
      "text",
      "presentationType",
      "options",
      "fields",
      "answerText",
      "correctOptionIndex",
      "fieldAnswers"
    ]
  };
}

function parseJsonObjectText(
  value
) {
  let text =
    String(
      value || ""
    ).trim();

  const fence =
    String
      .fromCharCode(96)
      .repeat(3);

  if (
    text.startsWith(
      fence
    )
  ) {
    text =
      text
        .slice(
          fence.length
        )
        .trimStart();

    if (
      text
        .toLowerCase()
        .startsWith(
          "json"
        )
    ) {
      text =
        text
          .slice(4)
          .trimStart();
    }

    if (
      text.endsWith(
        fence
      )
    ) {
      text =
        text
          .slice(
            0,
            -fence.length
          )
          .trimEnd();
    }
  }

  return JSON.parse(
    text
  );
}

function buildPrompt(
  action,
  question,
  instruction
) {
  const modeInstruction =
    action === "external"
      ? "Create a new independent exam question with the requested metadata. Do not copy the source wording."
      : "Modify only the exam-copy question according to the teacher instruction. Keep the same learning objective unless the instruction explicitly asks otherwise. Recompute the answer if any numbers, options, or wording affecting the answer change.";

  return [
    "You are editing a high-school computer networking exam.",

    modeInstruction,

    "Return a complete valid question and its answer.",

    "Section: " +
      String(
        question.section ||
        "BASIC"
      ),

    "Topic: " +
      String(
        question.topic ||
        "OTHER_NETWORKING"
      ),

    "Difficulty: " +
      String(
        question.difficulty ||
        3
      ),

    "Requested presentation type: " +
      String(
        question
          .presentationType ||
        "open"
      ),

    action === "modify"
      ? "Current question JSON: " +
        JSON.stringify({
          text:
            question.text ||
            "",

          options:
            question.options ||
            [],

          fields:
            question.fields ||
            [],

          answer:
            question.answer ||
            {}
        })
      : "",

    instruction
      ? "Teacher instruction: " +
        instruction
      : "",

    "For multiple choice provide 4 plausible options and a zero-based correctOptionIndex.",

    "For fillBlank/wordBank provide fields and fieldAnswers.",

    "For open questions provide answerText.",

    "Use clear Arabic appropriate for the exam unless technical CLI/code requires English."
  ]
    .filter(Boolean)
    .join("\n");
}

function convertResult(
  result,
  question,
  action
) {
  const presentationType =
    [
      "multipleChoice",
      "fillBlank",
      "wordBank",
      "open"
    ].includes(
      result.presentationType
    )
      ? result.presentationType
      : question.presentationType;

  const options =
    presentationType ===
    "multipleChoice"
      ? (
          result.options ||
          []
        ).map(
          (
            text,
            index
          ) => ({
            value:
              String(
                index + 1
              ),

            text:
              String(
                text || ""
              ),

            order:
              index + 1
          })
        )
      : [];

  const fields =
    presentationType ===
      "fillBlank" ||
    presentationType ===
      "wordBank"
      ? (
          result.fields ||
          []
        ).map(
          (
            label,
            index
          ) => ({
            id:
              "ai-field-" +
              String(
                index + 1
              ),

            label:
              String(
                label ||
                (
                  "Field " +
                  String(
                    index + 1
                  )
                )
              ),

            order:
              index + 1,

            kind:
              presentationType ===
                "wordBank"
                ? "select"
                : "text",

            options: []
          })
        )
      : [];

  let answer = {};

  if (
    presentationType ===
    "multipleChoice"
  ) {
    const correctIndex =
      Number(
        result
          .correctOptionIndex
      );

    answer = {
      correctOptionIndex:
        Number.isInteger(
          correctIndex
        )
          ? correctIndex
          : -1,

      correctAnswer:
        Number.isInteger(
          correctIndex
        ) &&
        correctIndex >= 0 &&
        correctIndex <
          options.length
          ? options[
              correctIndex
            ].text
          : String(
              result
                .answerText ||
              ""
            )
    };
  }
  else if (
    presentationType ===
      "fillBlank" ||
    presentationType ===
      "wordBank"
  ) {
    answer = {
      answers:
        Array.isArray(
          result
            .fieldAnswers
        )
          ? result
              .fieldAnswers
              .map(String)
          : []
    };
  }
  else {
    answer = {
      text:
        String(
          result
            .answerText ||
          ""
        )
    };
  }

  return {
    ...question,

    origin:
      action ===
      "external"
        ? "ai-generated"
        : question.origin,

    bankQuestionId:
      action ===
      "external"
        ? undefined
        : question
            .bankQuestionId,

    sourceId:
      action ===
      "external"
        ? undefined
        : question
            .sourceId,

    sourceQuestionId:
      action ===
      "external"
        ? undefined
        : question
            .sourceQuestionId,

    questionNumber:
      action ===
      "external"
        ? undefined
        : question
            .questionNumber,

    familyKey:
      action ===
      "external"
        ? "AI-" +
          Date.now()
        : question
            .familyKey,

    presentationType,

    bankType:
      action ===
      "external"
        ? undefined
        : question
            .bankType,

    text:
      String(
        result.text ||
        ""
      ).trim(),

    textHtml: "",

    options,

    fields,

    parts: [],

    answer,

    hint: "",

    aiInstruction: "",

    wasModified: true,

    image:
      action ===
      "external"
        ? {
            exists: false,
            visible: false,
            origin: null,
            assets: [],
            prompt: null
          }
        : question.image,

    history: [],

    redoStack: []
  };
}

app.http(
  "questionAiAction",
  {
    methods: [
      "POST"
    ],

    authLevel:
      "anonymous",

    route:
      "question-ai-action",

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

          const action =
            body?.action ===
            "external"
              ? "external"
              : "modify";

          const question =
            body?.question;

          if (
            !question
              ?.examQuestionId
          ) {
            return {
              status: 400,

              jsonBody: {
                ok: false,

                error:
                  "Question is required."
              }
            };
          }

          const instruction =
            String(
              body
                ?.instruction ||
              ""
            ).trim();

          if (
            action ===
              "modify" &&
            !instruction
          ) {
            return {
              status: 400,

              jsonBody: {
                ok: false,

                error:
                  "Teacher instruction is required."
              }
            };
          }

          const requestedProvider =
            String(
              body
                ?.provider ||
              "glm"
            )
              .trim()
              .toLowerCase();

          const provider =
            [
              "glm",
              "qwen",
              "openai"
            ].includes(
              requestedProvider
            )
              ? requestedProvider
              : "glm";

          const {
            client,
            model,
            mode
          } =
            await createClient(
              provider
            );

          const schema =
            buildSchema();

          const prompt =
            buildPrompt(
              action,
              question,
              instruction
            );

          let rawResult =
            null;

          if (
            mode ===
            "responses"
          ) {
            const response =
              await client
                .responses
                .create({
                  model,

                  store: false,

                  instructions:
                    "Return only the requested structured question JSON.",

                  input: [
                    {
                      role:
                        "user",

                      content: [
                        {
                          type:
                            "input_text",

                          text:
                            prompt
                        }
                      ]
                    }
                  ],

                  text: {
                    format: {
                      type:
                        "json_schema",

                      name:
                        "exam_question",

                      strict:
                        true,

                      schema
                    }
                  },

                  max_output_tokens:
                    1800
                });

            if (
              !response
                .output_text
            ) {
              throw new Error(
                "OpenAI returned no output_text."
              );
            }

            rawResult =
              JSON.parse(
                response
                  .output_text
              );
          }
          else {
            const requestBody =
              {
                model,

                messages: [
                  {
                    role:
                      "system",

                    content:
                      "Return JSON only. Follow this JSON schema exactly:\n" +
                      JSON.stringify(
                        schema
                      )
                  },

                  {
                    role:
                      "user",

                    content:
                      prompt
                  }
                ],

                response_format: {
                  type:
                    "json_object"
                },

                temperature:
                  0.2,

                max_tokens:
                  1800
              };

            if (
              mode ===
              "qwen"
            ) {
              requestBody
                .enable_thinking =
                false;
            }

            const response =
              await client
                .chat
                .completions
                .create(
                  requestBody
                );

            const outputText =
              response
                ?.choices
                ?.[0]
                ?.message
                ?.content;

            if (
              !outputText
            ) {
              throw new Error(
                provider +
                " returned no JSON response."
              );
            }

            rawResult =
              parseJsonObjectText(
                outputText
              );
          }

          const updatedQuestion =
            convertResult(
              rawResult,
              question,
              action
            );

          return {
            status: 200,

            jsonBody: {
              ok: true,

              question:
                updatedQuestion,

              provider,

              model
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
                  : "Question AI action failed."
            }
          };
        }
      }
  }
);
