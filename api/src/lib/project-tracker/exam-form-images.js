// Phase F4 — the images a student attaches to their project exam form («استمارة امتحان المشروع»): which questions take
// images, how many, and the two writes on the answers document (attach one, remove one). Pure: no storage, no image
// processing, no clock. The caller (exam-form-service.js) sanitizes the upload, stores the blob, runs the CAS round and
// checks the membership (docs/enterprise-project-exam-form-f4.md).
//
// An image is referenced from the answer of its question: answers[questionId].images = [{ id, width, height, bytes, addedAt }].
// The reference is written ONLY here, with an id the server generated for a blob the server stored. A draft save cannot
// write one (exam-form-answers.js rebuilds an answer from the fields it knows and keeps the stored references).
// Adding or removing an image does not advance `revision`: it never overwrites another answer, so a page that missed it has
// nothing to undo, and the student's text saves are not refused because a photo was attached meanwhile.
const { acceptsImages, imagesOf, assertStudentWritable, emptyDocument } = require("./exam-form-answers");

const IMAGE_ID = /^[a-f0-9]{24}$/;

function fail(message, httpStatus = 400, code) {
  const err = new Error(message);
  err.httpStatus = httpStatus;
  if (code) err.code = code;
  throw err;
}
const isObject = v => !!v && typeof v === "object" && !Array.isArray(v);
const isImageId = id => typeof id === "string" && IMAGE_ID.test(id);
const questionOf = (template, questionId) => template.sections.flatMap(s => s.questions).find(q => q.questionId === questionId) || null;

// The question an image may be attached to, or a refusal: image answers are off for this class, the question is not in the
// class's form (unknown or hidden), or it does not take images.
function imageQuestion(template, questionId, rules) {
  if (!rules || rules.imageAnswers !== true) fail("إرفاق الصور غير متاح بعد في استمارة هذا الصف.", 400, "KIND_NOT_AVAILABLE");
  const question = typeof questionId === "string" ? questionOf(template, questionId) : null;
  if (!question) fail("سؤال غير موجود في الاستمارة.", 400, "UNKNOWN_QUESTION");
  if (!acceptsImages(question)) fail("هذا السؤال لا يقبل صورًا.", 400, "NO_IMAGES_HERE");
  return question;
}

/**
 * Attaches one stored image to a question. `image` = { id, width, height, bytes } of a blob the caller already wrote.
 * Returns { doc }. Refused when the question holds its maximum already (the caller then removes the blob it wrote).
 */
function applyAddImage(current, template, { questionId, image, identity, now, rules }) {
  const question = imageQuestion(template, questionId, rules);
  const doc = current ? JSON.parse(JSON.stringify(current)) : emptyDocument({ ...identity, formVersion: template.formVersion, now });
  assertStudentWritable(doc, template);
  if (!isObject(image) || !isImageId(image.id)) fail("صورة غير صحيحة.");
  if (!isObject(doc.answers)) doc.answers = {};
  const answer = isObject(doc.answers[questionId]) ? doc.answers[questionId] : {};
  const images = imagesOf(answer);
  if (images.length >= question.images.max) fail("بلغت الحد الأقصى من الصور لهذا السؤال (" + question.images.max + "). احذف صورة لتضيف غيرها.", 409, "IMAGE_LIMIT");
  doc.answers[questionId] = { ...answer, images: [...images, { id: image.id, width: image.width, height: image.height, bytes: image.bytes, addedAt: now }] };
  doc.updatedAt = now;
  return { doc };
}

/**
 * Removes one image from a question. Returns { doc, changed }: removing an image that is not there changes nothing (a
 * repeated request is harmless). An answer left with nothing in it is removed, never stored as an empty shell.
 */
function applyRemoveImage(current, template, { questionId, imageId, now, rules }) {
  imageQuestion(template, questionId, rules);
  if (!isImageId(imageId)) fail("صورة غير صحيحة.");
  if (!current) return { doc: null, changed: false };
  const doc = JSON.parse(JSON.stringify(current));
  assertStudentWritable(doc, template);
  const answer = isObject(doc.answers) && isObject(doc.answers[questionId]) ? doc.answers[questionId] : null;
  const images = imagesOf(answer);
  if (!images.some(i => i.id === imageId)) return { doc: current, changed: false };
  const left = images.filter(i => i.id !== imageId);
  const { images: _dropped, ...rest } = answer;
  if (left.length) doc.answers[questionId] = { ...rest, images: left };
  else if (Object.keys(rest).length) doc.answers[questionId] = rest;
  else delete doc.answers[questionId];
  doc.updatedAt = now;
  return { doc, changed: true };
}

// Whether this answers document references the image (the only images a reader of this document may be served).
function referencesImage(doc, imageId) {
  if (!isImageId(imageId) || !doc || !isObject(doc.answers)) return false;
  return Object.values(doc.answers).some(answer => imagesOf(answer).some(i => i.id === imageId));
}

module.exports = { isImageId, imageQuestion, applyAddImage, applyRemoveImage, referencesImage };
