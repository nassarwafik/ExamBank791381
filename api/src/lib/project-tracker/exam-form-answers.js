// Phase F2 — the student's answers to a project exam form: what one answer may hold, when a question counts as answered,
// and the two writes a student may make (save a draft, submit). Pure: no storage, no clock, no session. The caller
// (exam-form-service.js) does the reads, the CAS round and the membership checks (docs/enterprise-project-exam-form-f2.md).
//
// Every answer is REBUILT from the fields this module knows (an allow-list): an unknown key, an option that is not in the
// question, a text longer than the question allows or a question that is not in the class's form is refused, and nothing is
// written. A form never produces a mark here: marking is the teacher's (F3).

// Inputs that are not available yet: student images arrive in F4 and files in F5. Their questions are shown, not answerable,
// and never block a submit until then.
const DEFERRED_KINDS = new Set(["image", "file"]);
// Phase F4 — a class whose teacher switched image answers on (`rules.imageAnswers`, stored on the class form) answers its
// image questions; files still wait for F5. Every function below takes the class's `rules`; without them (or for a class
// that never switched images on) image questions stay deferred exactly as before.
// Phase F5 (files) — the same for file questions: a class whose teacher switched file answers on (`rules.fileAnswers`)
// answers them; anywhere else they stay deferred. The two switches are independent.
const DEFERRED_SETS = { "": DEFERRED_KINDS, i: new Set(["file"]), f: new Set(["image"]), if: new Set() };
const deferredKindsOf = rules => DEFERRED_SETS[(rules && rules.imageAnswers === true ? "i" : "") + (rules && rules.fileAnswers === true ? "f" : "")];
// The file reference stored on an answer ({ id, name, ext, bytes, addedAt }), or null; written only by exam-form-files.js.
const fileOf = answer => (answer && isObject(answer.file) && typeof answer.file.id === "string" && /^[a-f0-9]{24}$/.test(answer.file.id) ? answer.file : null);
// A question that takes images: an image question, or a text / code / table question that asks for images beside its answer.
const acceptsImages = question => isObject(question.images) && Number.isInteger(question.images.max) && question.images.max > 0;
// The image references stored on an answer ([{ id, width, height, bytes, addedAt }]); written only by exam-form-images.js.
const imagesOf = answer => (answer && Array.isArray(answer.images) ? answer.images : []);
const MAX_PATCH_QUESTIONS = 120;
const CELL_MAX = 300;
const JUSTIFICATION_MAX = 1000;

function fail(message, httpStatus = 400, code) {
  const err = new Error(message);
  err.httpStatus = httpStatus;
  if (code) err.code = code;
  throw err;
}
const isObject = v => !!v && typeof v === "object" && !Array.isArray(v);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const idsOf = list => new Set(list.map(e => e.id));
const blank = s => s.trim() === "";

function uniqueKnown(list, known, what) {
  if (!Array.isArray(list)) fail(what + ": إجابة غير صحيحة.");
  const seen = new Set();
  for (const id of list) {
    if (typeof id !== "string" || !known.has(id)) fail(what + ": خيار غير موجود في السؤال.");
    if (seen.has(id)) fail(what + ": خيار مكرّر.");
    seen.add(id);
  }
  return seen;
}

/**
 * One answer as it is stored, or null when the student cleared it. Throws 400 on anything the question does not allow.
 * @param {object} question a question of the class's (validated) form
 * @param {*} raw what the student sent for it
 */
function normalizeAnswer(question, raw, rules) {
  const what = "السؤال " + question.questionId;
  if (deferredKindsOf(rules).has(question.kind)) fail(what + ": هذا النوع من الإجابات غير متاح بعد.", 400, "KIND_NOT_AVAILABLE");
  // Phase F4 — an image is never written through a draft: it is uploaded (sanitized, stored, then referenced by the server).
  if (question.kind === "image") fail(what + ": تُضاف الصور بزر إرفاق الصورة.", 400, "IMAGE_VIA_UPLOAD");
  // Phase F5 — nor is a file: it is uploaded (checked, stored, then referenced by the server).
  if (question.kind === "file") fail(what + ": يُرفق الملف بزر إرفاق الملف.", 400, "FILE_VIA_UPLOAD");
  if (raw === null || raw === undefined) return null;
  if (!isObject(raw)) fail(what + ": إجابة غير صحيحة.");

  switch (question.kind) {
    case "shortText": case "paragraph": case "cli": {
      if (typeof raw.text !== "string") fail(what + ": إجابة غير صحيحة.");
      if (raw.text.length > question.maxLength) fail(what + ": الإجابة أطول من الحد المسموح (" + question.maxLength + ").");
      return blank(raw.text) ? null : { text: raw.text };
    }
    case "table": {
      if (!Array.isArray(raw.rows) || raw.rows.length > question.maxRows) fail(what + ": عدد الصفوف أكبر من الحد المسموح (" + question.maxRows + ").");
      const columns = question.columns.map(c => c.id);
      const known = new Set(columns);
      const rows = [];
      for (const row of raw.rows) {
        if (!isObject(row)) fail(what + ": صف غير صحيح.");
        for (const key of Object.keys(row)) if (!known.has(key)) fail(what + ": عمود غير موجود في الجدول.");
        const out = {};
        let filled = false;
        for (const id of columns) {
          const cell = has(row, id) ? row[id] : "";
          if (typeof cell !== "string" || cell.length > CELL_MAX) fail(what + ": خانة غير صحيحة أو أطول من " + CELL_MAX + " حرفًا.");
          out[id] = cell;
          if (!blank(cell)) filled = true;
        }
        if (filled) rows.push(out);
      }
      return rows.length ? { rows } : null;
    }
    case "choice": {
      const optionId = raw.optionId === undefined ? null : raw.optionId;
      if (optionId !== null && (typeof optionId !== "string" || !idsOf(question.options).has(optionId))) fail(what + ": خيار غير موجود في السؤال.");
      let justification = "";
      if (raw.justification !== undefined) {
        if (question.justification !== true) fail(what + ": هذا السؤال لا يطلب تبريرًا.");
        if (typeof raw.justification !== "string" || raw.justification.length > JUSTIFICATION_MAX) fail(what + ": التبرير أطول من الحد المسموح (" + JUSTIFICATION_MAX + ").");
        justification = raw.justification;
      }
      if (optionId === null && blank(justification)) return null;
      return blank(justification) ? { optionId } : { optionId, justification };
    }
    case "multiChoice": {
      const chosen = uniqueKnown(raw.optionIds, idsOf(question.options), what);
      const optionIds = question.options.map(o => o.id).filter(id => chosen.has(id));   // stored in the question's own order
      return optionIds.length ? { optionIds } : null;
    }
    case "matching": {
      if (!isObject(raw.pairs)) fail(what + ": إجابة غير صحيحة.");
      const left = idsOf(question.left), right = idsOf(question.right);
      const pairs = {};
      for (const [l, r] of Object.entries(raw.pairs)) {
        if (!left.has(l) || typeof r !== "string" || !right.has(r)) fail(what + ": عنصر غير موجود في السؤال.");
        pairs[l] = r;
      }
      return Object.keys(pairs).length ? { pairs } : null;
    }
    case "ordering": {
      const order = uniqueKnown(raw.order, idsOf(question.items), what);
      if (order.size !== question.items.length) fail(what + ": رتّب كل العناصر.");
      return { order: raw.order.slice() };
    }
    case "scale": {
      if (!isObject(raw.values)) fail(what + ": إجابة غير صحيحة.");
      const items = idsOf(question.items);
      const values = {};
      for (const [id, v] of Object.entries(raw.values)) {
        if (!items.has(id) || !Number.isInteger(v) || v < question.min || v > question.max) fail(what + ": قيمة خارج السلّم.");
        values[id] = v;
      }
      return Object.keys(values).length ? { values } : null;
    }
    case "checklist": {
      const chosen = uniqueKnown(raw.checked, idsOf(question.items), what);
      const checked = question.items.map(i => i.id).filter(id => chosen.has(id));
      return checked.length ? { checked } : null;
    }
    case "declaration":
      if (typeof raw.accepted !== "boolean") fail(what + ": إجابة غير صحيحة.");
      return raw.accepted ? { accepted: true } : null;
    default:
      return fail(what + ": نوع سؤال غير معروف.");
  }
}

// Is this question fully answered (what a submit needs for a required question)? `answer` is a stored, normalized answer.
// Phase F4 — with image answers on, an image question needs at least `images.min` images (and at least one), and a text /
// code / table question that asks for images needs them beside its answer.
function isAnswered(question, answer, rules) {
  if (!answer) return false;
  const imagesOn = !!(rules && rules.imageAnswers === true);
  if (question.kind === "image") return imagesOn && imagesOf(answer).length >= Math.max(1, question.images.min);
  // Phase F5 — with file answers on, a file question is answered when it holds its file.
  if (question.kind === "file") return !!(rules && rules.fileAnswers === true) && !!fileOf(answer);
  if (imagesOn && acceptsImages(question) && imagesOf(answer).length < question.images.min) return false;
  switch (question.kind) {
    case "shortText": case "paragraph": case "cli": return typeof answer.text === "string" && !blank(answer.text);
    case "table": return Array.isArray(answer.rows) && answer.rows.length >= question.minRows;
    case "choice": return typeof answer.optionId === "string" && (question.justification !== true || (typeof answer.justification === "string" && !blank(answer.justification)));
    case "multiChoice": return Array.isArray(answer.optionIds) && answer.optionIds.length > 0;
    case "matching": return isObject(answer.pairs) && question.left.every(l => typeof answer.pairs[l.id] === "string");
    case "ordering": return Array.isArray(answer.order) && answer.order.length === question.items.length;
    case "scale": return isObject(answer.values) && question.items.every(i => Number.isInteger(answer.values[i.id]));
    case "checklist": return Array.isArray(answer.checked) && answer.checked.length > 0;
    case "declaration": return answer.accepted === true;
    default: return false;
  }
}

const questionsOf = template => template.sections.flatMap(s => s.questions);

/**
 * Where the student stands: how many answerable questions are answered, and which REQUIRED ones still block a submit.
 * Questions of a deferred kind are counted apart and never block.
 */
function formProgress(template, answers, rules) {
  const stored = isObject(answers) ? answers : {};
  const deferredKinds = deferredKindsOf(rules);
  let total = 0, answered = 0, deferred = 0;
  const missing = [];
  for (const q of questionsOf(template)) {
    if (deferredKinds.has(q.kind)) { deferred += 1; continue; }
    total += 1;
    if (isAnswered(q, stored[q.questionId], rules)) answered += 1;
    else if (q.required === true) missing.push(q.questionId);
  }
  return { total, answered, deferred, missing };
}

function emptyDocument({ projectCode, classId, studentId, formVersion, now }) {
  return { schemaVersion: 1, projectCode, classId, studentId, formVersion, status: "draft", answers: {}, revision: 0, startedAt: now, updatedAt: now, submittedAt: null };
}

// Phase F3 — the student may write while the form is a draft or was RETURNED by the teacher for correction. A submitted form
// waits for the teacher; an approved one is final for the student.
const STUDENT_WRITABLE = new Set(["draft", "returned"]);

// The checks shared by both writes: the document is this form's, the student may still write it, and the page that sends the
// write has seen the latest saved state (another device or tab may have saved since).
// Phase F4 — the state part alone (used by the image writes, which carry no revision: adding or removing one image never
// overwrites another answer, so there is nothing a stale page could undo).
function assertStudentWritable(doc, template) {
  if (doc.formVersion !== template.formVersion) fail("تغيّرت نسخة الاستمارة. حدّث الصفحة.", 409, "FORM_VERSION_CHANGED");
  if (doc.status === "approved") fail("اعتمد المعلم الاستمارة، ولا يمكن تعديلها.", 409, "FORM_APPROVED");
  if (!STUDENT_WRITABLE.has(doc.status)) fail("سلّمت الاستمارة، ولا يمكن تعديلها إلا إذا أعادها المعلم.", 409, "FORM_SUBMITTED");
}
function assertWritableDraft(doc, template, baseRevision) {
  assertStudentWritable(doc, template);
  if (!Number.isInteger(baseRevision) || baseRevision !== doc.revision) fail("حُفظت إجاباتك من جهاز أو نافذة أخرى. حدّث الصفحة.", 409, "DRAFT_STALE");
}

/**
 * Saves a draft: `patch` = { questionId: answer | null } for the questions that changed (null clears one).
 * Returns { doc, changed }. Nothing is returned for writing when the patch changes nothing.
 */
function applyDraft(current, template, { patch, baseRevision, identity, now, rules }) {
  const doc = current ? JSON.parse(JSON.stringify(current)) : emptyDocument({ ...identity, formVersion: template.formVersion, now });
  assertWritableDraft(doc, template, baseRevision);
  if (!isObject(patch)) fail("طلب غير صحيح.");
  const ids = Object.keys(patch);
  if (!ids.length) fail("لا توجد إجابات للحفظ.");
  if (ids.length > MAX_PATCH_QUESTIONS) fail("عدد الإجابات في الطلب أكبر من الحد المسموح (" + MAX_PATCH_QUESTIONS + ").");
  const byId = new Map(questionsOf(template).map(q => [q.questionId, q]));
  if (!isObject(doc.answers)) doc.answers = {};
  let changed = false;
  for (const id of ids) {
    const question = byId.get(id);
    if (!question) fail("سؤال غير موجود في الاستمارة: " + id);
    const before = has(doc.answers, id) ? doc.answers[id] : null;
    // Phase F4 — the images already attached to this question stay: a draft rewrites the text / rows only, and never
    // carries an image reference of its own (normalizeAnswer rebuilds the answer from the fields it knows).
    const written = normalizeAnswer(question, patch[id], rules);
    const kept = imagesOf(before);
    const next = kept.length ? { ...(written || {}), images: kept } : written;
    if (JSON.stringify(before) === JSON.stringify(next)) continue;
    if (next === null) delete doc.answers[id]; else doc.answers[id] = next;
    changed = true;
  }
  if (!changed) return { doc: current || null, changed: false };
  doc.revision += 1;
  doc.updatedAt = now;
  return { doc, changed: true };
}

/**
 * Submits the form: every required, answerable question must be answered. The document becomes read-only for the student.
 */
function applySubmit(current, template, { baseRevision, now, rules }) {
  if (!current) fail("لا توجد إجابات محفوظة للتسليم.", 400, "NOTHING_TO_SUBMIT");
  const doc = JSON.parse(JSON.stringify(current));
  assertWritableDraft(doc, template, baseRevision);
  const progress = formProgress(template, doc.answers, rules);
  if (progress.missing.length) {
    const err = new Error("أكمل الأسئلة الإلزامية قبل التسليم (" + progress.missing.length + ").");
    err.httpStatus = 400; err.code = "FORM_INCOMPLETE"; err.missing = progress.missing;
    throw err;
  }
  if (doc.status === "returned") doc.resubmittedAt = now;                        // Phase F3: a corrected form goes back to the teacher
  doc.status = "submitted";
  doc.submittedAt = now;
  doc.updatedAt = now;
  doc.revision += 1;
  return { doc };
}

module.exports = { DEFERRED_KINDS, MAX_PATCH_QUESTIONS, STUDENT_WRITABLE, deferredKindsOf, acceptsImages, imagesOf, fileOf, assertStudentWritable, normalizeAnswer, isAnswered, formProgress, emptyDocument, applyDraft, applySubmit };
