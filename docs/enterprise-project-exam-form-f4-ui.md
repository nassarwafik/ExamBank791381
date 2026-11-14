# Phase F4-UI — Project exam form: the student's images on the page, and the teacher's switch

## Problem

F4 (`docs/enterprise-project-exam-form-f4.md`) shipped the server side of the images a student attaches to the project
exam form: a per-class switch, attach / remove, the two reads, the submit rules. No screen used it: no teacher could
switch image answers on, and the student's page showed every image question as «سيتاح قريبًا». This phase adds the two
screens, together, as F4 required («F4-UI must ship the input together with the switch»).

## Scope

| In this phase | Not in this phase |
|---|---|
| The student's image input on the form page: attach, thumbnails, enlarge, remove | The images in the teacher's review page — arrives with the review screens (F3-UI); the teacher's image route exists since F4 |
| The teacher's switch on the project dashboard | Files (`.pkt`, the book) — F5 |
| A large photo shrunk in the browser before it is sent | Any change to the API, the storage or the image pipeline (none) |

## Owner decisions (2026-11-14)

| Question | Decision |
|---|---|
| F4 left open: does the teacher's control switch images on by default for a new class? | **Yes.** A class opened for the first time from the control has image answers on. |
| A class opened before this phase? | It stays **off** — its students were told image questions do not block a submit — until its teacher presses «تفعيل أسئلة الصور». |

The server's own default is unchanged: an `examForm.open` that says nothing about images switches nothing (F4). The
default lives in the teacher's control, which now says `imageAnswers: true` on a first open.

## Student

Where the server's view says image answers are on (`deferredKinds` no longer lists `image`), a question that takes
images shows `ExamFormImages`:

- an **image question** shows it in place of the «سيتاح قريبًا» notice;
- a **text / code / table question that asks for images** shows its own input first and the images under it (the notice
  under a code question is gone).

| Element | Behaviour |
|---|---|
| Count line | «الصور المرفقة: 2 من 3» and what the question requires (its own `images.min` / `images.max`). |
| «إرفاق صورة» | A native file input (JPEG / PNG / WebP), several files at once while the question has room. Files are sent one after the other; more files than the question holds are not sent, and the page says so. The button is gone when the question is full. |
| Thumbnail | Read with the student's session (`GET ?image=`) and shown from memory (an object URL): an image has no public address, and its id never appears in the page's markup as an address. A failed read offers «إعادة المحاولة». |
| Enlarge | Pressing a thumbnail shows it at the width of the question, in place; pressing again makes it small. No new tab, no dialog. |
| «حذف» | One confirmation, then the image is removed (the server removes the reference and the blob). |
| Read-only form (submitted, approved, closed, archived) | The thumbnails only; «لم تُرفق صورة.» where there is none. |
| Errors | The server's own reason is shown under the question (not an image, too large, the question is full, the form was submitted or closed). A file that is not one of the three types is refused before it is sent. |

Progress, the «مكتمل» marks and the missing list stay the **server's**: a required image question is listed as missing
until its images are attached, and is marked on the page like any other required question.

Where the class has image answers **off**, the page is exactly what it was (F2-UI): the notices, no input, no image
request. The existing F2-UI, F3 and F1b page suites pass unchanged.

### One request at a time

Attaching an image does not advance the form's `revision` (F4), so a save and an image request answered out of order
could leave the page showing the older of two bodies. The draft hook (`useExamFormDraft`) therefore keeps a single
request slot for the form: an image request waits for the save in flight, a save asked for while an image travels waits
for it, and the edits typed meanwhile are sent right after the image. The last body the page adopts is always the newest.

The page never writes an image list. An edit of a question's text carries its text only; the page keeps the server's
images beside the unsaved edit, so a thumbnail never disappears while the student types, and one that arrives while an
edit is still unsaved is shown beside it. (The server would drop a list sent by a client anyway — F4.)

A refusal that says the form itself changed (submitted or closed meanwhile, the question filled from another device)
makes the page read the form again, so it becomes read-only with the reason. A refusal of the file itself (`400`, `413`)
is shown and nothing else changes.

### A large photo

A phone photo is often larger than the server's 6 MB upload bound. A file over 1.5 MB is drawn in the browser inside the
box the server stores anyway (1600 px, EXIF orientation applied by the browser) and sent as a JPEG; a screenshot under
that travels untouched. When the browser cannot do it, the original is sent if it fits, and refused with a message if it
does not. This is a convenience only: the server sniffs the real bytes, bounds the upload, re-encodes and strips the
metadata whatever the page did (`api/src/lib/profile-image.js`).

Checked in real Chromium: a 10.5 MB, 4000 × 3000 JPEG with EXIF orientation 6 left the page as a 1 MB JPEG and was shown
upright at 1200 × 1600.

## Teacher

`ProjectExamFormControl` on the project dashboard:

| Class | What the control shows and does |
|---|---|
| Form never opened | The open confirmation now says image questions are on. The request is `examForm.open { imageAnswers: true }`. |
| Open, images on | «أسئلة الصور مفعّلة: يرفق الطلاب صورًا من مشروعهم.» |
| Open, images off (opened before this phase) | «أسئلة الصور غير مفعّلة لهذا الصف…» and the button «تفعيل أسئلة الصور». Its confirmation says what changes (required image questions become a condition of the submit; submitted forms stay submitted) and that it cannot be undone. The request is `examForm.open { imageAnswers: true }`. |
| Closed | The same line, **without** the button: the switch travels on `examForm.open`, which would also reopen the form. Reopening a closed form sends no word about images, so it never switches anything. |
| Read-only (archived class, no manage capability) | The line, no button. The server enforces both regardless. |

## Files

| Added | |
|---|---|
| `src/projects/examForm/ExamFormImages.tsx` | the image input of one question |
| `src/projects/examForm/imageFile.ts` | a picked file → the data URL to send (type, size, shrink) |
| `src/projects/examForm/StudentExamForm.images.f4ui.test.tsx`, `imageFile.f4ui.test.ts`, `src/projects/ProjectExamFormControl.f4ui.test.tsx` | tests |

| Changed | |
|---|---|
| `src/projects/examForm/api.ts` | `addExamFormImage`, `removeExamFormImage`, `fetchExamFormImage` |
| `src/projects/examForm/useExamFormDraft.ts` | `imagesOn`, `addImage`, `removeImage`; the single request slot; images kept beside an unsaved edit |
| `src/projects/examForm/QuestionInput.tsx`, `StudentExamForm.tsx`, `types.ts` | the input per question; the notice about deferred questions names files only where images are on |
| `src/projects/ProjectExamFormControl.tsx` | the default on a first open; the switch |
| `src/studentportal-pro.css` | token-only styles (`.eb-sp-form-image*`) |
| `src/projects/ProjectExamFormControl.f2ui.test.tsx` | **one expectation edited** — see below |

No API change, no storage change, no new route or capability, no new dependency, no new lazy chunk, no workflow change.

### The one edited expectation

`ProjectExamFormControl.f2ui.test.tsx` pinned the body of the first open as `{ projectCode, action, classId }`. The owner
decided that a first open switches image answers on, so that body is now `{ projectCode, action, classId, imageAnswers:
true }` and the expectation says so, with a comment naming the decision. It is a product change the owner asked for, not
a test loosened to pass: the reopen and the close bodies are still pinned exactly, and the new file pins that a reopen
never carries the switch.

## Safety

- **The server decides.** Whether a class has image answers on, whether a question takes an image, how many, whether the
  form is writable, whether the file is an image: all refusals are the server's (F4), and every one is covered there. The
  page's checks (file type, size, the hidden button on a full question or a read-only form) are presentation only.
- **Protected content never bypasses the API.** A thumbnail is the response of the student's own authenticated read. No
  image address is public, guessable from the page, or usable without the session.
- **Identity.** The image requests name the project, the question and the image only; the student and the class come
  from the session (a test pins the exact keys of the upload body).
- **Grading safety.** Nothing here produces a mark. A failed upload is an error the student sees; nothing is stored and
  no empty answer is written. Switching image answers on changes no stored answer and no submitted form's status.
- **No silent change for a class already filling the form.** Its image answers stay off until its teacher decides.
- **Irreversible switch, said plainly.** The confirmation tells the teacher it cannot be undone; the server refuses to
  switch it back (`409 IMAGES_FROZEN`, F4).

## Gates

- **Bundle.** The form lives in the already-lazy student portal chunk; the initial JS is unchanged.
- **Source guards.** `studentportal-pro.css` stays token-only with logical properties; no emoji, native dialog or tab
  role added; `StudentProjectPanel.tsx` is untouched (still one request of its own).
- **Visual regression (C15).** No captured page changes: the form page is not among the captured pages and the capture
  harness serves no exam form to the dashboard.

## Tests and mutation proof

All three test files drive the **real** API handlers over the in-memory container; the student file uses real images made
with `sharp` and the server's real pipeline.

- `StudentExamForm.images.f4ui.test.tsx` (15): images off — the page as before, no image request; attach — the exact
  request body, the sanitized image stored under the student, the thumbnail read with the session and shown from memory,
  the server's progress; enlarge; several files and the question's maximum; room for another; a file that is not an image
  refused unsent; the server's refusal of a disguised file with nothing stored; remove after a confirmation (cancel sends
  nothing); a code question keeps text and images together while typing, clearing and saving; an image that arrives
  beside an unsaved edit; one request at a time (both requests held by the test, so the order is asserted, not timed); a
  failed thumbnail read and its retry; a required image question blocking the submit, then the submitted record
  read-only; a form closed while attaching; a text question saved as before.
- `ProjectExamFormControl.f4ui.test.tsx` (5): the first open switches images on (request, stored form, audit); a class
  opened before stays off and is switched on after a confirmation (cancel sends nothing); a closed form is not offered the
  switch and its reopen carries none; a read-only class; a refused switch.
- `imageFile.f4ui.test.ts` (6): the three types only; a small file untouched; a large file shrunk; fallbacks; the bounds.

Assertions that something did **not** happen (no request, no button, no dialog) are made after the page settled.

Fail-first is not applicable: new behaviour, no defect fixed.

Mutation campaign: 43 mutants across the draft hook, the API client, the image input, the picked-file module, the form
page, the question input and the teacher control; each one exact replacement, the seven exam-form UI test files run, the
file restored byte-for-byte and verified by SHA-256, run alone, `git status` unchanged afterwards. **43 KILLED,
0 survived, 0 timeouts.**

The first run: 42 killed, 1 survivor — «an image that arrives beside an unsaved edit is not shown». The test meant for it
waited for the upload with the clock, and the image had already landed before the edit was typed, so the case never
happened. The two tests about the order of requests now hold the save and the upload themselves and release them in the
order they assert; the campaign was run again in full.

| Group | Mutants |
|---|---|
| Draft hook (images dropped by an edit; an image beside an unsaved edit not shown; the answer not adopted; an image sent during a save; a save started during an image; edits typed meanwhile not saved; a closed form not read again; images read as on everywhere / never; a refusal swallowed) | 10 |
| API client (an image read without the session; a removal that names no image; an error answer shown as an image; an upload naming another question) | 4 |
| Image input (more files than the question holds; removal without asking; attaching on a read-only or a full question; removing on a read-only form; no reason shown; no retry; no enlarge) | 8 |
| Picked file (not an image sent; no shrink; a small file shrunk; over the bound sent; a larger or empty shrink result used; a file too large opened) | 7 |
| Form page and question input (no image input for a code question; an input while images are off; the old notice kept; no input handed to any question; removal without a confirmation; the old «coming soon» note) | 6 |
| Teacher control (first open without the switch; a reopen with it; the switch on a closed form or a read-only class; sent without a confirmation; still offered once on; a request without `imageAnswers`; no reason shown) | 8 |

## Known limits

- The teacher cannot see the images yet: the review screens (F3-UI) are not merged. The teacher's image route has existed
  since F4 and needs no change.
- A class opened before this phase and now **closed** must be reopened before its images can be switched on.
- The shrink re-encodes a large PNG screenshot as JPEG before the server re-encodes it to WebP; screenshots under 1.5 MB
  (the usual case) are not touched.
- Uploads are not resumable and are not retried automatically; a failed upload is shown and the student picks the file
  again. While the device is offline and a save is retrying, an image waits for that save.
- No offline queue for images: an image is attached only while online.
