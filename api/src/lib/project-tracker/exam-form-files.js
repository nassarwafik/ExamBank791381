// Phase F5 (files) — the file a student attaches to a FILE question of their project exam form («أرفق ملف Packet Tracer»,
// «أرفق كتاب المشروع»): which questions take a file, what a file must look like, and the two writes on the answers document
// (set the file, remove it). Pure: no storage, no clock. The caller (exam-form-service.js) stores the blob, runs the CAS
// round and checks the membership (docs/enterprise-project-exam-form-f5-files.md).
//
// A file is referenced from the answer of its question: answers[questionId].file = { id, name, ext, bytes, addedAt }. ONE
// file per question; attaching another replaces it. The reference is written ONLY here, with an id the server generated
// for a blob the server stored; a draft save cannot write one (exam-form-answers.js refuses a file question).
//
// Unlike an image, a file cannot be re-encoded: the platform has no sanitizer for a Packet Tracer file or a Word document.
// So a file is NEVER interpreted, rendered or served inline by the platform. It is stored as opaque bytes and served only
// as a download (attachment, application/octet-stream, nosniff) to the student who owns it and to the teacher of the
// class. The checks below keep the input to what the question asks for; they are not a malware scan.
const { fileOf, assertStudentWritable, emptyDocument } = require("./exam-form-answers");

const FILE_ID = /^[a-f0-9]{24}$/;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_NAME_LENGTH = 120;

function fail(message, httpStatus = 400, code) {
  const err = new Error(message);
  err.httpStatus = httpStatus;
  if (code) err.code = code;
  throw err;
}
const isObject = v => !!v && typeof v === "object" && !Array.isArray(v);
const isFileId = id => typeof id === "string" && FILE_ID.test(id);
// (fileOf — the file reference stored on an answer — is the answers module's: its «answered» rule reads it too.)
const questionOf = (template, questionId) => template.sections.flatMap(s => s.questions).find(q => q.questionId === questionId) || null;
// Characters a file name must not carry: C0 controls, DEL, and the bidirectional marks, overrides and isolates (a name
// ending in an override followed by reversed text would otherwise DISPLAY as another extension).
const isHiddenChar = n => n < 0x20 || n === 0x7f || n === 0x200e || n === 0x200f || (n >= 0x202a && n <= 0x202e) || (n >= 0x2066 && n <= 0x2069);
const tooLarge = () => fail("الملف أكبر من الحد المسموح (" + Math.round(MAX_FILE_BYTES / (1024 * 1024)) + " ميغابايت).", 413, "TOO_LARGE");

// The question a file may be attached to, or a refusal: file answers are off for this class, the question is not in the
// class's form (unknown or hidden), or it is not a file question.
function fileQuestion(template, questionId, rules) {
  if (!rules || rules.fileAnswers !== true) fail("إرفاق الملفات غير متاح بعد في استمارة هذا الصف.", 400, "KIND_NOT_AVAILABLE");
  const question = typeof questionId === "string" ? questionOf(template, questionId) : null;
  if (!question) fail("سؤال غير موجود في الاستمارة.", 400, "UNKNOWN_QUESTION");
  if (question.kind !== "file") fail("هذا السؤال لا يقبل ملفًا.", 400, "NO_FILE_HERE");
  return question;
}

/**
 * The display name and the extension of an upload, or a refusal. Only the LAST path segment is kept (a name is a label, never
 * a path), control and bidirectional-override characters are dropped, and the extension must be one the question accepts.
 */
function describeFileName(question, rawName) {
  if (typeof rawName !== "string") fail("اسم الملف غير صحيح.", 400, "FILE_NAME");
  const base = [...rawName.split(/[\\/]/).pop()].filter(c => !isHiddenChar(c.codePointAt(0))).join("").trim();
  const dot = base.lastIndexOf(".");
  if (!base || dot <= 0 || dot === base.length - 1) fail("اسم الملف غير صحيح.", 400, "FILE_NAME");
  const ext = base.slice(dot).toLowerCase();
  if (!/^\.[a-z0-9]{1,8}$/.test(ext) || !question.accept.includes(ext)) fail("نوع الملف غير مقبول لهذا السؤال. المقبول: " + question.accept.join("، ") + ".", 400, "FILE_TYPE");
  const stem = base.slice(0, dot).slice(0, MAX_NAME_LENGTH - ext.length);
  return { name: stem + ext, ext };
}

/**
 * Decodes the upload (base64) inside the size bound, BEFORE any other work on it. Returns the bytes.
 */
function decodeFileUpload(dataBase64) {
  if (typeof dataBase64 !== "string" || !dataBase64) fail("الملف فارغ.", 400, "EMPTY");
  if (dataBase64.length > Math.ceil(MAX_FILE_BYTES * 4 / 3) + 4) tooLarge();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(dataBase64)) fail("تعذر قراءة الملف.", 400, "FILE_ENCODING");
  const buffer = Buffer.from(dataBase64, "base64");
  if (!buffer.length) fail("الملف فارغ.", 400, "EMPTY");
  if (buffer.length > MAX_FILE_BYTES) tooLarge();
  return buffer;
}

const startsWith = (buffer, bytes) => buffer.length >= bytes.length && bytes.every((b, i) => buffer[i] === b);
const ascii = text => [...text].map(c => c.charCodeAt(0));
// What a Packet Tracer file is NOT: an executable, an archive, a document or markup. A .pkt has no published signature (new
// versions are an encrypted stream), so it cannot be recognised positively; these are the things it must not be.
const NOT_A_PKT = [ascii("MZ"), [0x7f, ...ascii("ELF")], ascii("PK"), ascii("%PDF"), ascii("#!"), ascii("Rar!"), [0x37, 0x7a, 0xbc, 0xaf], [0x1f, 0x8b], [0xcf, 0xfa, 0xed, 0xfe], [0xca, 0xfe, 0xba, 0xbe], ascii("{\\rtf")];
const MARKUP = /^\s*<(?:!doctype|html|\?xml|svg|script|body|head)/i;

/**
 * Do the bytes look like what the extension says? A refusal (400 FILE_CONTENT) when they do not. This keeps the input to
 * the kinds the form asks for; it is not a malware scan.
 *   .pdf   starts with «%PDF-»
 *   .docx  a ZIP holding «[Content_Types].xml» and «word/document.xml», and no macro project
 *   .pkt   not an executable, an archive, a PDF, a script or markup
 */
function assertFileContent(ext, buffer) {
  const wrong = () => fail("محتوى الملف لا يطابق نوعه (" + ext + ").", 400, "FILE_CONTENT");
  if (ext === ".pdf") { if (!startsWith(buffer, ascii("%PDF-"))) wrong(); return; }
  if (ext === ".docx") {
    if (!startsWith(buffer, [0x50, 0x4b, 0x03, 0x04]) || !buffer.includes("[Content_Types].xml") || !buffer.includes("word/document.xml")) wrong();
    if (buffer.includes("vbaProject.bin")) fail("ملف Word يحوي ماكرو. احفظه بصيغة .docx بلا ماكرو ثم أرفقه.", 400, "FILE_MACROS");
    return;
  }
  if (ext === ".pkt") {
    if (NOT_A_PKT.some(signature => startsWith(buffer, signature)) || MARKUP.test(buffer.subarray(0, 64).toString("latin1"))) wrong();
    return;
  }
  wrong();
}

/**
 * Sets the file of a question. `file` = { id, name, ext, bytes } of a blob the caller already wrote. Returns
 * { doc, replacedId }: the id of the file this one replaces (the caller removes that blob), or null.
 */
function applySetFile(current, template, { questionId, file, identity, now, rules }) {
  fileQuestion(template, questionId, rules);
  const doc = current ? JSON.parse(JSON.stringify(current)) : emptyDocument({ ...identity, formVersion: template.formVersion, now });
  assertStudentWritable(doc, template);
  if (!isObject(file) || !isFileId(file.id)) fail("ملف غير صحيح.");
  if (!isObject(doc.answers)) doc.answers = {};
  const before = fileOf(doc.answers[questionId]);
  doc.answers[questionId] = { file: { id: file.id, name: file.name, ext: file.ext, bytes: file.bytes, addedAt: now } };
  doc.updatedAt = now;
  return { doc, replacedId: before ? before.id : null };
}

/**
 * Removes the file of a question. Returns { doc, changed }: removing a file that is not there (or another id) changes
 * nothing, so a repeated request is harmless. The answer is removed with it, never stored as an empty shell.
 */
function applyRemoveFile(current, template, { questionId, fileId, now, rules }) {
  fileQuestion(template, questionId, rules);
  if (!isFileId(fileId)) fail("ملف غير صحيح.");
  if (!current) return { doc: null, changed: false };
  const doc = JSON.parse(JSON.stringify(current));
  assertStudentWritable(doc, template);
  const stored = isObject(doc.answers) ? fileOf(doc.answers[questionId]) : null;
  if (!stored || stored.id !== fileId) return { doc: current, changed: false };
  delete doc.answers[questionId];
  doc.updatedAt = now;
  return { doc, changed: true };
}

// The file record this answers document references under that id, or null (the only files a reader of the document may get).
function referencedFile(doc, fileId) {
  if (!isFileId(fileId) || !doc || !isObject(doc.answers)) return null;
  for (const answer of Object.values(doc.answers)) { const file = fileOf(answer); if (file && file.id === fileId) return file; }
  return null;
}

// The download's Content-Disposition: always an attachment. An ASCII fallback name plus the UTF-8 name (RFC 5987).
function attachmentDisposition(name, ext) {
  const safe = typeof name === "string" && name ? name : "file" + ext;
  // A name with no ASCII letter or digit of its own (an Arabic name) falls back to «file.<ext>»; the UTF-8 name follows.
  const stem = safe.slice(0, safe.length - ext.length).replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  const fallback = (stem || "file") + ext;
  const encoded = encodeURIComponent(safe).replace(/['()*!]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase());
  return 'attachment; filename="' + fallback + '"; filename*=UTF-8\'\'' + encoded;
}

module.exports = { MAX_FILE_BYTES, isFileId, fileOf, fileQuestion, describeFileName, decodeFileUpload, assertFileContent, applySetFile, applyRemoveFile, referencedFile, attachmentDisposition };
