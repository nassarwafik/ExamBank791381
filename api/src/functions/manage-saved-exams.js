
const { app } = require("@azure/functions");

const {
  BlobServiceClient
} = require("@azure/storage-blob");

const {
  requireBuilderAuth
} = require("../lib/builder-auth");
const {
  hydrateBankAssets
} = require("../lib/bank-asset-hydrate");

const {
  countExamQuestions,
  examOfficialStats
} = require("../lib/exam-structure");
// Phase 21F.0 — ownership (multi-user mode) and the ETag a conditional save starts from.
const { examOwnerOf, canAccessSavedExam } = require("../lib/saved-exam-access");
const { downloadJsonWithEtagOrNull, deleteBlobConditional, isConcurrencyConflict } = require("../lib/platform-storage");

const BANK_CONTAINER =
  "bank";

const EXAMS_PREFIX =
  "exams/";

async function streamToBuffer(
  stream
) {
  const chunks = [];

  for await (
    const chunk
    of stream
  ) {
    chunks.push(
      Buffer.from(
        chunk
      )
    );
  }

  return Buffer.concat(
    chunks
  );
}

async function downloadJson(
  container,
  blobName
) {
  const blob =
    container.getBlobClient(
      blobName
    );

  const response =
    await blob.download();

  if (
    !response
      .readableStreamBody
  ) {
    throw new Error(
      "Unable to read saved exam."
    );
  }

  const buffer =
    await streamToBuffer(
      response
        .readableStreamBody
    );

  return JSON.parse(
    buffer.toString(
      "utf8"
    )
  );
}

function isSafeExamBlob(
  blobName
) {
  const value =
    String(
      blobName || ""
    );

  return (
    value.startsWith(
      EXAMS_PREFIX
    ) &&
    value.endsWith(
      ".json"
    ) &&
    !value.includes(
      ".."
    ) &&
    !value.includes(
      "\\"
    )
  );
}

function getContainer() {
  const connectionString =
    process.env
      .AZURE_STORAGE_CONNECTION_STRING;

  if (
    !connectionString
  ) {
    throw new Error(
      "AZURE_STORAGE_CONNECTION_STRING is not configured."
    );
  }

  const service =
    BlobServiceClient
      .fromConnectionString(
        connectionString
      );

  return service
    .getContainerClient(
      BANK_CONTAINER
    );
}

async function listSavedExams(
  container,
  owner = null
) {
  const exams = [];

  let examined = 0;

  for await (
    const blob
    of container.listBlobsFlat({
      prefix:
        EXAMS_PREFIX
    })
  ) {
    if (
      examined >= 100
    ) {
      break;
    }

    examined += 1;

    try {
      const document =
        await downloadJson(
          container,
          blob.name
        );

      const exam =
        document?.exam;

      if (
        !exam ||
        !canAccessSavedExam(
          document,
          owner
        )
      ) {
        continue;
      }

      exams.push({
        blobName:
          blob.name,

        examId:
          String(
            exam.examId ||
            ""
          ),

        title:
          String(
            exam.title ||
            "امتحان بدون عنوان"
          ),

        savedAt:
          String(
            document.savedAt ||
            exam.updatedAt ||
            blob.properties
              ?.lastModified
              ?.toISOString() ||
            ""
          ),

        questionCount:
          countExamQuestions(
            exam
          ),

        // Display the AUTHORITATIVE structural total (matches the grader), not a possibly-stale
        // top-level exam.totalMarks. Persistence is left untouched — this is a read-time summary only.
        totalMarks:
          examOfficialStats(
            exam
          ).totalMarks
      });
    }
    catch {
      /*
        Skip damaged or
        unrelated blobs.
      */
    }
  }

  exams.sort(
    (
      a,
      b
    ) =>
      String(
        b.savedAt
      ).localeCompare(
        String(
          a.savedAt
        )
      )
  );

  return exams;
}

// Teacher read of a saved exam. Bank image assets are persisted by durable identity only (save-exam-artifact); the
// signed /api/question-image URL a browser can load is minted HERE, at read time, through the shared helper — so an
// exam reopened days after authoring still shows its bank images. The stored document is never rewritten by a read.
// `deps` is an optional dependency-injection seam for unit tests (production passes nothing).
async function handler(request, deps = {}) {
  const auth = (deps.requireBuilderAuth || requireBuilderAuth)(request);
  if (!auth.ok) {
    return auth.response;
  }
  const container = (deps.getContainer || getContainer)();
  // Phase 21F.0 — the stored document AND its ETag (null when a test injects a plain downloadJson).
  const read = deps.downloadJson
    ? async (c, name) => ({ value: await deps.downloadJson(c, name), etag: null })
    : (c, name) => downloadJsonWithEtagOrNull(c, name);
  const owner = examOwnerOf(auth.user);
  const notFound = { status: 404, jsonBody: { ok: false, code: "EXAM_NOT_FOUND", error: "الامتحان غير موجود." } };

  try {
    if (request.method === "GET") {
      const exams = await (deps.listSavedExams || listSavedExams)(container, owner);
      return { status: 200, jsonBody: { ok: true, exams } };
    }

    let body = {};
    try {
      body = await request.json();
    }
    catch {
      body = {};
    }

    const action = String(body?.action || "").trim().toLowerCase();
    const blobName = String(body?.blobName || "");

    if (!isSafeExamBlob(blobName)) {
      return { status: 400, jsonBody: { ok: false, error: "Invalid saved exam." } };
    }

    if (action === "load") {
      const { value: document, etag } = await read(container, blobName);
      if (!document) return notFound;
      if (!document.exam) {
        throw new Error("Saved exam document is invalid.");
      }
      // Another teacher's exam is reported exactly like a missing one (its existence is not disclosed).
      if (!canAccessSavedExam(document, owner)) return notFound;
      return { status: 200, jsonBody: { ok: true, exam: hydrateBankAssets(document.exam), savedAt: document.savedAt || null, blobName, etag: etag || null } };
    }

    if (action === "delete") {
      const { value: document, etag } = await read(container, blobName);
      if (document && !canAccessSavedExam(document, owner)) return notFound;
      try {
        // Deleted only if nobody saved it since it was read for the ownership decision (If-Match).
        const result = await deleteBlobConditional(container, blobName, etag || null);
        return { status: 200, jsonBody: { ok: true, deleted: result.succeeded === true } };
      }
      catch (e) {
        if (!isConcurrencyConflict(e)) throw e;
        return { status: 409, jsonBody: { ok: false, code: "EXAM_CONFLICT", error: "تم تعديل هذا الامتحان للتو؛ أعد المحاولة." } };
      }
    }

    return { status: 400, jsonBody: { ok: false, error: "Unsupported saved exam action." } };
  }
  catch {
    return { status: 500, jsonBody: { ok: false, error: "تعذر تنفيذ إجراء الامتحانات المحفوظة حاليًا." } };
  }
}

app.http("manageSavedExams", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  route: "saved-exams",
  handler: request => handler(request)
});

module.exports = { handler };
