const { app } = require("@azure/functions");
const {
  BlobServiceClient
} = require("@azure/storage-blob");
const {
  requireBuilderAuth
} = require("../lib/builder-auth");


const BANK_CONTAINER = "bank";
const INDEX_BLOB =
  "index/questions-index.json";


// ==========================================================
// Helpers
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


async function downloadJson(
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
      `Unable to read blob: ${blobName}`
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


// ==========================================================
// Counter helpers
// ==========================================================

function increment(object, key) {
  const safeKey =
    key === null ||
    key === undefined ||
    key === ""
      ? "UNKNOWN"
      : String(key);


  object[safeKey] =
    (object[safeKey] || 0) + 1;
}


function sortCountObject(object) {
  return Object
    .entries(object)
    .sort(
      (a, b) => b[1] - a[1]
    )
    .reduce(
      (result, [key, value]) => {
        result[key] = value;
        return result;
      },
      {}
    );
}


// ==========================================================
// Main
// ==========================================================

app.http("bankSummary", {
  methods: [
    "GET"
  ],

  authLevel:
    "anonymous",

  route:
    "bank-summary",


  handler: async request => {
    try {
      // ----------------------------------------------------
      // Authentication (teacher/builder session required)
      // ----------------------------------------------------

      const auth =
        requireBuilderAuth(request);

      if (!auth.ok) {
        return auth.response;
      }


      // ----------------------------------------------------
      // Storage
      // ----------------------------------------------------

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


      const questions =
        Array.isArray(index.questions)
          ? index.questions
          : [];


      // ----------------------------------------------------
      // Counters
      // ----------------------------------------------------

      const bySection = {};
      const byDifficulty = {};
      const byTopic = {};
      const bySource = {};
      const byType = {};

      let classified = 0;
      let pending = 0;
      let needsReview = 0;
      let cliQuestions = 0;
      let calculationQuestions = 0;


      // ----------------------------------------------------
      // Loop
      // ----------------------------------------------------

      for (const question of questions) {

        increment(
          bySection,
          question.section
        );


        increment(
          byDifficulty,
          question.difficulty
        );


        increment(
          byTopic,
          question.topic
        );


        increment(
          bySource,
          question.sourceId
        );


        increment(
          byType,
          question.type
        );


        // ----------------------------------------------
        // Classification state
        // ----------------------------------------------

        if (
          question.reviewStatus ===
          "classified"
        ) {
          classified++;
        }
        else if (
          question.reviewStatus ===
          "needs-review"
        ) {
          classified++;
          needsReview++;
        }
        else {
          pending++;
        }


        // ----------------------------------------------
        // Flags
        // ----------------------------------------------

        if (
          question.hasCLI === true
        ) {
          cliQuestions++;
        }


        if (
          question.requiresCalculation
          === true
        ) {
          calculationQuestions++;
        }
      }


      // ----------------------------------------------------
      // Difficulty 1..5 - always return all levels
      // ----------------------------------------------------

      const difficultyDistribution = {
        "1": byDifficulty["1"] || 0,
        "2": byDifficulty["2"] || 0,
        "3": byDifficulty["3"] || 0,
        "4": byDifficulty["4"] || 0,
        "5": byDifficulty["5"] || 0
      };


      // ----------------------------------------------------
      // Section difficulty matrix
      // ----------------------------------------------------

      const sectionDifficulty = {};


      for (const question of questions) {

        const section =
          question.section || "UNKNOWN";


        if (!sectionDifficulty[section]) {
          sectionDifficulty[section] = {
            "1": 0,
            "2": 0,
            "3": 0,
            "4": 0,
            "5": 0
          };
        }


        const difficulty =
          String(
            question.difficulty || ""
          );


        if (
          sectionDifficulty[section]
            [difficulty] !== undefined
        ) {
          sectionDifficulty[section]
            [difficulty]++;
        }
      }


      // ----------------------------------------------------
      // Sources
      // ----------------------------------------------------

      const sources =
        Object
          .entries(bySource)
          .map(
            ([sourceId, count]) => ({
              sourceId,
              count
            })
          );


      // ----------------------------------------------------
      // Result
      // ----------------------------------------------------

      return {
        status: 200,

        jsonBody: {
          ok: true,

          bank: {
            totalQuestions:
              questions.length,

            classified,

            pending,

            needsReview
          },

          flags: {
            cliQuestions,
            calculationQuestions
          },

          sections:
            sortCountObject(
              bySection
            ),

          difficulty:
            difficultyDistribution,

          sectionDifficulty,

          topics:
            sortCountObject(
              byTopic
            ),

          questionTypes:
            sortCountObject(
              byType
            ),

          sources,

          indexUpdatedAt:
            index.updatedAt || null
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
              : "Unknown bank summary error"
        }
      };
    }
  }
});