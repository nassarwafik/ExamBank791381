
const { app } = require("@azure/functions");

const {
  requireBuilderAuth
} = require("../lib/builder-auth");

const ALLOWED_TOPICS = [
  "NUMBER_SYSTEMS",
  "NETWORK_BASICS",
  "OSI_TCPIP",
  "NETWORK_DEVICES",
  "NETWORK_TOPOLOGIES",
  "IP_ADDRESSING",
  "SUBNET_CIDR",
  "PRIVATE_PUBLIC_IP",
  "IPV6",
  "NETWORK_SERVICES",
  "DHCP",
  "DNS",
  "HTTP_HTTPS",
  "FTP",
  "EMAIL_PROTOCOLS",
  "APIPA",
  "SWITCHING",
  "VLAN",
  "TRUNK_8021Q",
  "VTP",
  "PORT_SECURITY",
  "INTERVLAN_ROUTING",
  "ROUTING",
  "STATIC_ROUTING",
  "OSPF",
  "RIP",
  "EIGRP",
  "ACL",
  "NAT",
  "CISCO_CLI",
  "WIRELESS",
  "WAN_METRO",
  "OTHER_NETWORKING"
];

async function loadOpenAI() {
  const module =
    await import("openai");

  return module.default;
}

async function createClient(provider) {
  const OpenAI =
    await loadOpenAI();

  if (provider === "glm") {
    const apiKey =
      process.env.ZAI_API_KEY;

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
            process.env.ZAI_BASE_URL ||
            "https://api.z.ai/api/paas/v4"
        }),

      model:
        process.env.ZAI_MODEL ||
        "glm-5.3-flash",

      mode: "chat"
    };
  }

  if (
    provider === "qwen" ||
    provider === "qwenplus"
  ) {
    const apiKey =
      process.env.QWEN_API_KEY;

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
            process.env.QWEN_BASE_URL ||
            "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
        }),

      model:
        provider === "qwenplus"
          ? (
              process.env
                .QWEN_PLUS_MODEL ||
              "qwen3.7-plus"
            )
          : (
              process.env
                .QWEN_MODEL ||
              "qwen3.5-flash"
            ),

      mode: "qwen"
    };
  }

  const apiKey =
    process.env.OPENAI_API_KEY;

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
      process.env.OPENAI_MODEL ||
      "gpt-5.6-luna",

    mode: "responses"
  };
}

function parseJsonObjectText(value) {
  let text =
    String(value || "")
      .trim();

  const fence =
    String
      .fromCharCode(96)
      .repeat(3);

  if (text.startsWith(fence)) {
    text =
      text
        .slice(fence.length)
        .trimStart();

    if (
      text
        .toLowerCase()
        .startsWith("json")
    ) {
      text =
        text
          .slice(4)
          .trimStart();
    }

    if (text.endsWith(fence)) {
      text =
        text
          .slice(
            0,
            -fence.length
          )
          .trimEnd();
    }
  }

  return JSON.parse(text);
}

function buildSchema() {
  return {
    type: "object",
    additionalProperties: false,

    properties: {
      summary: {
        type: "string"
      },

      operations: {
        type: "array",
        maxItems: 40,

        items: {
          type: "object",
          additionalProperties:
            false,

          properties: {
            examQuestionId: {
              type: "string"
            },

            action: {
              type: "string",
              enum: [
                "modify",
                "replace"
              ]
            },

            targetTopic: {
              type: "string"
            },

            targetDifficulty: {
              type: "integer",
              minimum: 0,
              maximum: 5
            },

            targetType: {
              type: "string",
              enum: [
                "",
                "multipleChoice",
                "fillBlank",
                "wordBank",
                "open"
              ]
            },

            instruction: {
              type: "string"
            }
          },

          required: [
            "examQuestionId",
            "action",
            "targetTopic",
            "targetDifficulty",
            "targetType",
            "instruction"
          ]
        }
      }
    },

    required: [
      "summary",
      "operations"
    ]
  };
}

function buildPrompt(
  instruction,
  exam
) {
  const questions =
    Array.isArray(
      exam?.questions
    )
      ? exam.questions.map(
          (
            question,
            index
          ) => ({
            number:
              index + 1,

            examQuestionId:
              String(
                question
                  .examQuestionId ||
                ""
              ),

            locked:
              question.locked ===
              true,

            section:
              question.section,

            topic:
              question.topic,

            difficulty:
              Number(
                question
                  .difficulty ||
                0
              ),

            type:
              question
                .presentationType,

            text:
              String(
                question.text ||
                ""
              ).slice(
                0,
                450
              )
          })
        )
      : [];

  return [
    "You are planning safe edits to a high-school networking exam.",

    "Do NOT write the replacement questions yourself.",

    "Return only an operation plan. The application will execute the operations using the question bank or the per-question AI editor.",

    "Never create an operation for a locked question.",

    "Use action=replace when the request changes topic, difficulty, presentation type, or asks to swap questions.",

    "Use action=modify only for wording, numbers, scenario phrasing, clarity, or other edits that keep the same main learning objective.",

    "For replace: set targetTopic only when a topic change is requested, targetDifficulty 1-5 only when requested, and targetType only when requested. Otherwise use empty topic, difficulty 0, and empty type.",

    "For modify: put a precise standalone teacher instruction in instruction and leave target fields empty/0.",

    "Only include questions that truly need a change.",

    "Do not exceed the number of requested changes. If the user says replace two questions, return two replacement operations.",

    "Allowed topic codes: " +
      ALLOWED_TOPICS.join(", "),

    "Teacher global instruction:",
    String(
      instruction || ""
    ),

    "Current exam JSON summary:",
    JSON.stringify(
      questions
    )
  ].join("\n");
}

function cleanResult(result, exam) {
  const available =
    new Map(
      (
        exam?.questions ||
        []
      ).map(question => [
        String(
          question
            .examQuestionId
        ),
        question
      ])
    );

  const operations =
    Array.isArray(
      result?.operations
    )
      ? result.operations
          .filter(operation => {
            const question =
              available.get(
                String(
                  operation
                    ?.examQuestionId ||
                  ""
                )
              );

            return (
              question &&
              question.locked !==
                true
            );
          })
          .map(operation => ({
            examQuestionId:
              String(
                operation
                  .examQuestionId
              ),

            action:
              operation.action ===
              "replace"
                ? "replace"
                : "modify",

            targetTopic:
              ALLOWED_TOPICS.includes(
                String(
                  operation
                    .targetTopic ||
                  ""
                )
              )
                ? String(
                    operation
                      .targetTopic
                  )
                : "",

            targetDifficulty:
              [1, 2, 3, 4, 5]
                .includes(
                  Number(
                    operation
                      .targetDifficulty
                  )
                )
                ? Number(
                    operation
                      .targetDifficulty
                  )
                : 0,

            targetType:
              [
                "multipleChoice",
                "fillBlank",
                "wordBank",
                "open"
              ].includes(
                String(
                  operation
                    .targetType ||
                  ""
                )
              )
                ? String(
                    operation
                      .targetType
                  )
                : "",

            instruction:
              String(
                operation
                  .instruction ||
                ""
              ).trim()
          }))
      : [];

  return {
    summary:
      String(
        result?.summary ||
        ""
      ).trim(),

    operations
  };
}

app.http(
  "analyzeGlobalExamInstruction",
  {
    methods: [
      "POST"
    ],

    authLevel:
      "anonymous",

    route:
      "analyze-global-exam-instruction",

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

          const instruction =
            String(
              body?.instruction ||
              ""
            ).trim();

          const exam =
            body?.exam;

          if (!instruction) {
            return {
              status: 400,

              jsonBody: {
                ok: false,
                error:
                  "Global instruction is required."
              }
            };
          }

          if (
            !exam ||
            !Array.isArray(
              exam.questions
            )
          ) {
            return {
              status: 400,

              jsonBody: {
                ok: false,
                error:
                  "Exam is required."
              }
            };
          }

          const requestedProvider =
            String(
              body?.provider ||
              "glm"
            )
              .trim()
              .toLowerCase();

          const provider =
            [
              "glm",
              "qwen",
              "qwenplus",
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
              instruction,
              exam
            );

          let rawResult = null;

          if (
            mode === "responses"
          ) {
            const response =
              await client
                .responses
                .create({
                  model,

                  store: false,

                  instructions:
                    "Return only the structured global exam operation plan.",

                  input: [
                    {
                      role: "user",

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
                        "global_exam_operations",

                      strict: true,

                      schema
                    }
                  }
                });

            rawResult =
              parseJsonObjectText(
                response.output_text
              );
          }
          else {
            const response =
              await client
                .chat
                .completions
                .create({
                  model,

                  messages: [
                    {
                      role: "system",

                      content:
                        "Return JSON only. Follow the requested operation schema exactly."
                    },
                    {
                      role: "user",

                      content:
                        prompt +
                        "\nJSON schema:\n" +
                        JSON.stringify(
                          schema
                        )
                    }
                  ],

                  response_format: {
                    type:
                      "json_object"
                  },

                  temperature:
                    0.1,

                  max_tokens:
                    3200,

                  ...(
                    mode === "qwen"
                      ? {
                          enable_thinking:
                            false
                        }
                      : {}
                  )
                });

            rawResult =
              parseJsonObjectText(
                response
                  ?.choices
                  ?.[0]
                  ?.message
                  ?.content
              );
          }

          const result =
            cleanResult(
              rawResult,
              exam
            );

          return {
            status: 200,

            jsonBody: {
              ok: true,
              provider,
              model,
              summary:
                result.summary,
              operations:
                result.operations
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
                  : "Global AI analysis failed."
            }
          };
        }
      }
  }
);
