const { app } = require("@azure/functions");
const { BlobServiceClient } = require("@azure/storage-blob");
const { requireBuilderAuth } = require("../lib/builder-auth");

// ==========================================================
// Convert downloaded Blob stream to UTF-8 string
// ==========================================================

async function streamToString(readableStream) {
  const chunks = [];

  for await (const chunk of readableStream) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

// ==========================================================
// Find a JavaScript const value while respecting:
// strings, escaping and nested [] / {}
//
// Example:
// const baseQ = [ ... ];
// const images = { ... };
// ==========================================================

function extractConstJson(source, constName) {
  const marker = `const ${constName}`;

  const markerIndex = source.indexOf(marker);

  if (markerIndex < 0) {
    throw new Error(`Could not find const ${constName}`);
  }

  const equalsIndex = source.indexOf("=", markerIndex);

  if (equalsIndex < 0) {
    throw new Error(`Could not find '=' for const ${constName}`);
  }

  let start = equalsIndex + 1;

  while (
    start < source.length &&
    /\s/.test(source[start])
  ) {
    start++;
  }

  const firstChar = source[start];

  if (firstChar !== "[" && firstChar !== "{") {
    throw new Error(
      `const ${constName} does not start with [ or {`
    );
  }

  const opening = firstChar;
  const closing = opening === "[" ? "]" : "}";

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < source.length; i++) {
    const char = source[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === '"') {
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
      continue;
    }

    if (char === closing) {
      depth--;

      if (depth === 0) {
        const jsonText =
          source.substring(start, i + 1);

        return JSON.parse(jsonText);
      }
    }
  }

  throw new Error(
    `Could not find end of const ${constName}`
  );
}

// ==========================================================
// Read metadata from title / page text
// ==========================================================

function detectExamMetadata(html) {
  let examCode = null;
  let year = null;

  const examCodeMatch =
    html.match(/\b791381\b/);

  if (examCodeMatch) {
    examCode = examCodeMatch[0];
  }

  const yearMatch =
    html.match(/\b20\d{2}\b/);

  if (yearMatch) {
    year = Number(yearMatch[0]);
  }

  return {
    examCode,
    year
  };
}

// ==========================================================
// Azure Function
// ==========================================================

app.http("inspectHtml", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "inspect-html",

  handler: async request => {
    try {
      const auth = requireBuilderAuth(request);

      if (!auth.ok) {
        return auth.response;
      }

      const connectionString =
        process.env.AZURE_STORAGE_CONNECTION_STRING;

      if (!connectionString) {
        return {
          status: 500,
          jsonBody: {
            ok: false,
            error:
              "AZURE_STORAGE_CONNECTION_STRING is not configured"
          }
        };
      }

      const blobServiceClient =
        BlobServiceClient.fromConnectionString(
          connectionString
        );

      const containerClient =
        blobServiceClient.getContainerClient("raw");

      const blobClient =
        containerClient.getBlobClient(
          "791381 - 2025.html"
        );

      const exists =
        await blobClient.exists();

      if (!exists) {
        return {
          status: 404,
          jsonBody: {
            ok: false,
            error:
              "791381 - 2025.html was not found"
          }
        };
      }

      const downloadResponse =
        await blobClient.download();

      if (!downloadResponse.readableStreamBody) {
        throw new Error(
          "Blob download returned no stream"
        );
      }

      const html =
        await streamToString(
          downloadResponse.readableStreamBody
        );

      // --------------------------------------------
      // Parse the four structures we already know
      // from this interactive HTML format.
      // --------------------------------------------

      const images =
        extractConstJson(
          html,
          "images"
        );

      const baseQ =
        extractConstJson(
          html,
          "baseQ"
        );

      const infraQ =
        extractConstJson(
          html,
          "infraQ"
        );

      const graphicQ =
        extractConstJson(
          html,
          "graphicQ"
        );

      const metadata =
        detectExamMetadata(html);

      return {
        status: 200,

        jsonBody: {
          ok: true,

          source: {
            fileName:
              "791381 - 2025.html",

            container:
              "raw",

            sizeBytes:
              Buffer.byteLength(
                html,
                "utf8"
              )
          },

          exam: {
            examCode:
              metadata.examCode,

            year:
              metadata.year
          },

          detected: {
            baseQuestions:
              Array.isArray(baseQ)
                ? baseQ.length
                : 0,

            infrastructureQuestions:
              Array.isArray(infraQ)
                ? infraQ.length
                : 0,

            graphicsQuestions:
              Array.isArray(graphicQ)
                ? graphicQ.length
                : 0,

            embeddedImages:
              images &&
              typeof images === "object"
                ? Object.keys(images).length
                : 0
          },

          networking: {
            answerableQuestions:
              (Array.isArray(baseQ)
                ? baseQ.length
                : 0)
              +
              (Array.isArray(infraQ)
                ? infraQ.length
                : 0),

            graphicsExcluded:
              true
          },

          message:
            "HTML source was downloaded and parsed successfully."
        }
      };
    } catch {
      return {
        status: 500,

        jsonBody: {
          ok: false,

          error: "تعذر فحص صفحة HTML حاليًا."
        }
      };
    }
  }
});