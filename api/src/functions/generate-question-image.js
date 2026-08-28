
const { app } = require("@azure/functions");

const {
  requireBuilderAuth
} = require("../lib/builder-auth");

async function loadOpenAI() {
  const module =
    await import("openai");

  return module.default;
}

function buildImagePrompt(
  question
) {
  const options =
    Array.isArray(
      question?.options
    )
      ? question.options
          .map(
            item =>
              item?.text ||
              item?.value ||
              ""
          )
          .filter(
            Boolean
          )
      : [];

  return [
    "Create a clean educational diagram for a high-school computer networking exam.",

    "The illustration must help the student understand the scenario, but MUST NOT reveal, highlight, or imply the correct answer.",

    "Use a white or very light background, clear geometry, simple network icons, and a print-friendly textbook style.",

    "Avoid decorative art, people, logos, watermarks, answer marks, check marks, and unnecessary text.",

    "If labels are required, prefer short standard networking labels such as Router, Switch, PC, Server, VLAN, IP, DHCP, DNS, OSPF.",

    "Question topic: " +
      String(
        question?.topic ||
        "Networking"
      ),

    "Question: " +
      String(
        question?.text ||
        ""
      ),

    options.length
      ? "Answer choices for context only: " +
        options.join(" | ")
      : ""
  ]
    .filter(Boolean)
    .join("\n");
}

app.http(
  "generateQuestionImage",
  {
    methods: [
      "POST"
    ],

    authLevel:
      "anonymous",

    route:
      "generate-question-image",

    handler:
      async request => {
        try {
          const auth =
            requireBuilderAuth(
              request
            );

          if (
            !auth.ok
          ) {
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

          const question =
            body?.question;

          if (
            !question
              ?.examQuestionId ||
            !question
              ?.text
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

          const apiKey =
            process.env
              .OPENAI_API_KEY;

          if (
            !apiKey
          ) {
            throw new Error(
              "OPENAI_API_KEY is not configured."
            );
          }

          const OpenAI =
            await loadOpenAI();

          const client =
            new OpenAI({
              apiKey
            });

          const model =
            process.env
              .OPENAI_IMAGE_MODEL ||
            "gpt-image-2";

          const prompt =
            String(
              body?.prompt ||
              ""
            ).trim() ||
            buildImagePrompt(
              question
            );

          const response =
            await client
              .images
              .generate({
                model,

                prompt,

                size:
                  "1024x1024",

                quality:
                  "low"
              });

          const item =
            response
              ?.data?.[0];

          if (
            !item
          ) {
            throw new Error(
              "Image model returned no image."
            );
          }

          const dataUrl =
            item.b64_json
              ? "data:image/png;base64," +
                item.b64_json
              : item.url;

          if (
            !dataUrl
          ) {
            throw new Error(
              "Image model returned no usable image data."
            );
          }

          return {
            status: 200,

            jsonBody: {
              ok: true,

              model,

              prompt,

              asset: {
                id:
                  "ai-image-" +
                  Date.now(),

                origin:
                  "ai-generated",

                contentType:
                  "image/png",

                dataUrl
              }
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
                  : "Image generation failed."
            }
          };
        }
      }
  }
);
