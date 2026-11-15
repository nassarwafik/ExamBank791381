# Phase F5-UI — Project exam form: the student's file input, the teacher's switch, the download in the review

## Problem

F5 (files, `docs/enterprise-project-exam-form-f5-files.md`) shipped the server side: a class can take one file per file
question — the Packet Tracer file, the project book — once its teacher switches that on. No screen used it: the student's
page still showed a file question as «يتاح قريبًا», the teacher could not switch files on, and the review said a file question
is checked from the student's book. This phase adds the three screens. It changes no route and no stored document.

## Scope

| In this phase | Not in this phase |
|---|---|
| The student's file input on the form page: attach, replace, remove, download | PDF export; the 899373 form (the rest of F5) |
| The teacher's switch on the form's control: «تفعيل أسئلة الملفات» | A malware scan (new infrastructure, the owner's decision) |
| The student's file in the teacher's review: name, size, download | Showing a file in the page (a file is only ever a download) |

## Decisions taken in this phase

| Question | Decision | Why |
|---|---|---|
| Does a first open switch files on, as it does images (F4-UI, the owner's decision)? | **No.** Files are switched on only by the teacher's own step, per class, on an open form. | The owner decided the image default; nobody decided a file default. A file is not sanitized and is not scanned, and the deployed host's request-size limit for a 10 MB upload is not verified yet (below). An explicit step lets one class try it first. Open for the owner. |
| What does the confirmation of the switch say? | That required file questions will block a submit, that files are downloaded and opened on the teacher's own device, that **the site does not scan them for viruses**, and that the switch cannot be undone. | The teacher decides with the limit in front of them. |
| Is a file ever shown in the page? | **No.** Neither on the student's page nor in the review: a name, a size and a download button. No link with an address, no preview. | The server never serves a file inline (F5); the pages follow. |

## Student

`StudentExamForm` → `QuestionInput` → `ExamFormFile`, only where the server says the class has file answers on
(`deferredKinds` without `"file"`; `useExamFormDraft.filesOn`). Anywhere else a file question is the notice it was.

| | |
|---|---|
| Attach | «إرفاق ملف» opens the device's file picker, limited to the extensions the question accepts. The page refuses a wrong extension, an empty file and a file over 10 MB **before** any request, in words; everything else is the server's check, and its refusal is shown as it says it (for example «محتوى الملف لا يطابق نوعه»). |
| What is sent | `{ projectCode, action: "addFile", questionId, fileName, dataBase64 }` — the picked file's own name and its bytes. No student, no class. |
| Shown | The file's name, its size in words («184 كيلوبايت», «2.2 ميغابايت») and «تنزيل». Under it «استبدال الملف» and «حذف الملف», and the line «المقبول: … — حتى 10 ميغابايت، ملف واحد». |
| Replace | Picking another file replaces the question's file (one file per question; the server swaps the reference and removes the old bytes). |
| Remove | After a confirmation. |
| Download | Read with the student's session (`GET ?file=`) and handed to the browser as a download under the file's own name. The file never has an address in the page's markup and is never shown in it. A failed download says so and can be tried again. |
| Read-only form (submitted, approved, closed, archived) | The name, the size and the download only; «لم يُرفق ملف.» where there is none. |
| One request at a time | A file travels in the page's single request slot, like an image (F4-UI): a save and a file never travel together. A refused file says nothing about the form, so the form is not read again. |
| Submit | A required file question is in the server's `missing` list until its file is attached, like any required question. |

The line above the sections that counts what is still deferred now follows both switches: images, files or both.

## Teacher

**The switch** (`ProjectExamFormControl`). Once the form was opened the control says whether file answers are on. On an
open form of a class that can be managed, «تفعيل أسئلة الملفات» asks for the confirmation above and then sends
`{ action: "examForm.open", classId, fileAnswers: true }`. It is not offered before the first open, on a closed form (the
same action would reopen it), on a read-only class, or once files are on. A first open from the control still switches
images on (F4-UI) and does **not** switch files on.

**The review** (`TeacherExamFormReview`). A file question whose answer holds a file says «أرفق الطالب ملفًا لهذا السؤال. نزّله
وافتحه على جهازك كأي ملف يصلك من طالب.» and shows the same name / size / download line, read with the teacher's session
through the class's own route (`GET resource=exam-form-file&classId=&studentId=&fileId=`: capability, tenancy, membership
and the reference are the server's checks). A file question with no file still says it is checked from the student's book.
The teacher's page has no attach, replace or remove.

## Safety

- **The server decides.** The page's extension and size checks, the hidden buttons on a read-only form and the hidden
  switch are presentation only; every rule is F5's and is unchanged.
- **Protected content never bypasses the API.** A download is the response of the reader's own authenticated read; the
  page holds the bytes only for the click and never gives the file an address a link could carry.
- **Never rendered.** No preview, no inline viewer, on either page.
- **Not a malware scan** — said in the teacher's confirmation and in the review's line.
- **Identity.** The student's requests carry no student or class; the teacher's download names the class and the student
  of the form being reviewed.
- **Styles.** Class selectors only, inside the existing form block of `studentportal-pro.css` (before the guarded
  learning-materials block).

## Files

| Added | |
|---|---|
| `src/projects/examForm/ExamFormFile.tsx` | the student's file input; `ExamFormFileLine` (name, size, download) |
| `src/projects/examForm/fileRules.ts` | the page's own checks and the size in words |
| `src/projects/examForm/ExamForm.files.f5ui.test.tsx` | the three screens over the real handlers |

| Changed | |
|---|---|
| `src/projects/examForm/api.ts` | `addExamFormFile`, `removeExamFormFile`, `fetchExamFormFile` |
| `src/projects/examForm/useExamFormDraft.ts` | `filesOn`, `addFile`, `removeFile`, `readFile` (the image request slot) |
| `src/projects/examForm/QuestionInput.tsx`, `StudentExamForm.tsx` | the file input where files are on; the deferred line |
| `src/projects/examForm/TeacherExamFormReview.tsx` | the file line in the review |
| `src/projects/ProjectExamFormControl.tsx` | the state line and the switch |
| `src/projects/api.ts` | `trackerGetBlob` takes the message of a failed read |
| `src/projects/examForm/types.ts` | `ExamFormFileRef`, `file` on an answer |
| `src/studentportal-pro.css` | the styles |

## Tests and proof

`src/projects/examForm/ExamForm.files.f5ui.test.tsx` (17 tests, the real student and teacher handlers on the in-memory
container): files off (a notice, no input, no request); attach (the request's exact fields, the stored bytes, name and
size, the progress, the revision unmoved); replace; the page's refusals with no request; the server's refusal shown, nothing
stored, the form not read again; remove after a confirmation and its cancel; the download (the student's session, the
name, the same bytes, no address and no viewer in the page) and a failed download; a required file question blocking the
submit, then the read-only record; the review (the file line, the teacher's session and parameters, no write controls, a
question with no file) and its failed download; the switch (not on a first open, the confirmation's text, the request, the
audit, the cancel, where it is not offered); the page's rules.

Every existing exam-form suite passes unchanged except one sentence the deferred line now ends with («إرفاق الملفات غير
مفعّل لصفك» instead of «سيتاح قريبًا»); the F4-UI test that reads that line matches its beginning and still passes.

Fail-first is not applicable: new behaviour, no defect fixed.

Mutation campaign: 27 mutants in `ExamFormFile.tsx`, `fileRules.ts`, `QuestionInput.tsx`, `useExamFormDraft.ts`, `api.ts`,
`StudentExamForm.tsx`, `TeacherExamFormReview.tsx` and `ProjectExamFormControl.tsx`; one exact replacement each, the F5-UI
test file run alone, each file restored byte-for-byte by SHA-256, `git status` unchanged afterwards.
**27 KILLED, 0 survived, 0 timeouts.**

| Group | Mutants |
|---|---|
| Where files are offered (on while the class has them off; never offered; the page gives no tools; a read-only form still offers attach / remove) | 4 |
| What the page checks and sends (the extension check skipped; the size check skipped; the name not sent; the data-URL prefix sent with the bytes; the request carries a student; the size text in bytes) | 6 |
| Remove and refusals (removed without a confirmation; a refused file reloads the form) | 2 |
| Downloads (no name; a silent failure; read without the session) | 3 |
| The review (the file hidden; «checked from the book» beside a file; another student named; the image route read) | 4 |
| The switch (on at a first open; sent without a confirmation; without `fileAnswers`; on a closed form; on a read-only class; still offered once on; the confirmation silent about scanning; the state line inverted) | 8 |

**Real browser (local, not a committed gate).** The production build next to the real API in process (the harness of the
browser gates), Chromium at 390 × 844 (touch) and 1440 × 900, the teacher and the student: 33 checks passed. The files
were the owner's real 794589 work-in-progress — a 188,506-byte `.pkt` and a 2,278,973-byte `.docx` book, read from outside the
repository and never copied into it.

- The teacher's switch: the state line, the confirmation («لا يفحصها من الفيروسات»), the class form stored, the switch gone.
- The student: a renamed executable refused by the server with nothing stored; the real `.pkt` and book attached under
  Arabic names and stored byte for byte; a real browser download of the book — the saved file has the file's own name and
  the same bytes; no address and no viewer for the file in the page; a file just under 10 MB (a 13.3 MB request body) stored
  in about 0.7 s and replacing the earlier one; remove after the confirmation.
- The teacher's review: the file's name instead of «checked from the book», and a real download of the same bytes.
- No page scrolls sideways (the control, the file questions empty and attached, the review); the file buttons are at
  least 44 px tall on touch.

Two findings of that run:

- **A download named «download».** The first run saved every Arabic-named file as `download`. Cause, shown by a controlled
  probe (the same page code, only the browser's locale differs): the test container has no locale, and Chromium then
  cannot encode a non-ASCII file name; with a UTF-8 locale — what a real device has — the Arabic name is kept, and an ASCII
  name was kept in both. A defect of the test environment, not of the page: the harness now starts the browser with a
  UTF-8 locale. No product change.
- **An extension drawn reversed.** Beside an Arabic name that ends in digits, «كتاب المشروع 794589.docx» was drawn with its
  end as «docx.794589» (the bidirectional algorithm treats the digits after Arabic letters as part of the right-to-left
  run). The name's extension is now its own left-to-right run; the text is still the whole name. Tested.

**Visual regression (local run of the UX-R19b gate).** Base `b466aa41` build against this branch's build, phone viewport,
light and dark: 79 captures compared in each theme, 0 changed, GATE PASS. Tablet and desktop run in CI.

The mutation campaign ran before the extension change above (one element in `ExamFormFileLine`); that change is covered
by its own assertion and the campaign was not repeated.

## Known limits

- **The deployed host's request-size limit is still not verified.** The real-browser run above sends a file just under
  10 MB through the page (a 13.3 MB request body) to the real handlers **in process**; it proves the page and the handlers,
  not the limit of the deployed host. The first real class should try a large file on the PR preview or in production
  before the switch is used widely. Until then the switch is the teacher's explicit, per-class step, never a default.
- No malware scan (F5).
- A file is read into memory by the page to be sent (up to 10 MB as base64) and again to be downloaded.
- The review shows a file's name and size, not when it was attached or how often it was replaced.
- PDF export and the 899373 form remain (the rest of F5).
