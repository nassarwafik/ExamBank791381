# Phase F5 (PDF) — Project exam form: «طباعة / حفظ PDF» of one student's form

## Problem

A student's exam form lives only on the site: sixteen sections shown one at a time. A teacher who wants it on paper — for a
meeting with the student, for the project file, for an external examiner — has nothing to print, and a student has no copy
of what they submitted. F1 named a PDF export as part of F5; the owner asked for it on 2026-11-15.

## Scope

| In this phase | Not in this phase |
|---|---|
| «طباعة / حفظ PDF» in the teacher's review of one student: the teacher's copy | A PDF of a whole class in one file |
| «طباعة / حفظ PDF» on the student's own form page: the student's copy | A PDF made on the server |
| The attached images inside the document | Files: not uploaded to the site at all (the owner's decision of 2026-11-15, `docs/enterprise-project-exam-form-no-file-uploads.md`) |
| The three bundled forms (794589, 883589, 899373) | |

No route, no API code and no stored document changes: the export is built in the page from what the page already holds.

## How

The platform already exports PDF one way (`reports/printReport.ts`, `print/examPrint.ts`, `students/credentialSheets.ts`): a
print-ready, right-to-left HTML document written into a **hidden same-origin iframe** and handed to the browser's print
dialog, where «حفظ بصيغة PDF» makes the file. The browser shapes the Arabic text; a JavaScript PDF library would not. No
dependency, no popup. This phase follows it.

| File | |
|---|---|
| `src/projects/examForm/examFormPrint.ts` | `buildExamFormPrintHtml` (the document), `referencedImageIds`, `loadPrintImages`, `printExamFormDocument`, `printDate` |
| `src/projects/examForm/ExamFormPrintButton.tsx` | the button: reads the images, builds, prints; its progress and its error |
| `StudentExamForm.tsx`, `TeacherExamFormReview.tsx` | what each copy carries (`printCopy`) |

The document is A4 portrait: the form's title, the project, the student's name and the form's state; a few facts (answers,
dates); the mark, the teacher's general note; then every section with every question and the student's answer; the section's
rating under it; a footer that says whose copy it is and when it was made.

| Answer | Printed as |
|---|---|
| text, paragraph | the text, line breaks kept |
| commands (`cli`) | a left-to-right monospace block |
| table | a table with the question's column titles |
| choice, multi-choice, checklist | the chosen option(s) in words; a choice's justification |
| matching | each left item ← its chosen right item |
| ordering | a numbered list in the student's order |
| scale | each item and its value |
| declaration | «أوافق.» |
| image(s) | embedded, two per row; a question's only image at the page's width |
| file question | «يُسلَّم الملف للمعلم مباشرة: الملفات لا تُرفع إلى الموقع.» — always, whatever the answer holds |
| nothing | «لم يُجب.» / «لم تُرفق صورة.» |

**Images.** An image has no public address. The button reads each attached image with the reader's own session (the
student's `GET ?image=`, the teacher's `GET resource=exam-form-image`), one after another, turns it into a data URL and
embeds it. An image that cannot be read is left out and the document says so in its place; one image never fails the
export. The print waits for the pictures to decode, at most 3 seconds.

## What each copy carries

| | The student's copy | The teacher's copy |
|---|---|---|
| The student's answers and images | yes — as they are on the page | yes |
| Right / wrong per auto-marked question | only after the approval (what the server sends the student) | yes |
| Section ratings and notes, the general note | only after the approval | the **stored** ones; said to be «لم تُعتمد بعد، ولا يراها الطالب» until the approval |
| The mark | only after the approval | only of an approved form |
| An answer key | **never** | **never** |
| The student's login code | never | never |

- The student's copy adds nothing to what the student's page already holds: before the approval the server sends no
  review, so there is none to print.
- The teacher's copy prints what is **stored**. With unsaved ratings on the page the button does not print and says «احفظ
  التقديرات أولًا لتظهر في ملف الطباعة».
- The footer of the teacher's copy says «نسخة المعلم — لا تتضمن مفاتيح الإجابة».

## Safety

- **No answer key on paper.** The teacher's view of a form carries the keys (F3). The print module never reads a
  question's `answer` field, so a key cannot reach the document from either page; a wrong choice prints the student's
  choice and «إجابة خاطئة», never the right option. Tested from the teacher's own sections, and by a planted mutant.
- **Nothing a student wrote is markup.** Every answer, table cell, name, note and label is HTML-escaped; a `<script>` or an
  `<img onerror>` typed into an answer prints as text.
- **No file on paper.** Files are not uploaded (the owner's decision). A file question prints the line the student's page
  shows; a file reference that an answer may still hold from the short time uploads existed is never read, so neither its
  name nor its id is printed.
- **An image is only an image.** A source is embedded only if it is a base64 data URL of WebP, PNG or JPEG, matched to its
  end; an address, an SVG or a data URL with anything after it prints as a placeholder. The document makes no request.
- **Protected content never bypasses the API.** The images come from the reader's own authenticated reads; the document
  lives in a hidden iframe for the print and is removed after it.
- **The server decides** who may read a form and an image; the button is on pages the reader already has.
- **Presentation only.** The teacher's ratings in a draft copy carry the points the page computes from the stored levels,
  labelled as not approved; the mark of an approved form is the server's.

## Tests and proof

`src/projects/examForm/examFormPrint.f5pdf.test.tsx` (20 tests):

- **the document** — right-to-left A4 with 16 sections and 92 questions; each kind of answer as text; the two «nothing»
  lines and the hand-in line of a file question; escaping of an answer, a table cell, commands, a justification, a name, a state, a note, the meta and a rating;
  an image only as a raster data URL (an address, an SVG and a data URL with an attribute after it are placeholders); a
  file reference left in an answer never printed; the 883589 and 899373 forms whole from their own templates (every
  section, question and kind of answer, no key); **no key from the teacher's sections**; the review only when given; dates;
- **images and print** — each image read once, in order; a failed read and a non-image left out; the iframe hidden,
  right-to-left, printed once and removed after `afterprint`; false and nothing left behind when the frame cannot print;
- **the student's page** over the real handlers — the whole form, the name, the sanitized image embedded and read once more
  with the student's session, no review before the approval; after it the mark, 16 ratings, the notes and right / wrong,
  and never the right option of a wrong choice;
- **the teacher's review** over the real handlers — verdicts, the stored rating and its note, «لم تُعتمد بعد», every attached
  image of the form, no key, no login code; unsaved ratings refused with the reason; an approved form's mark; a browser
  that cannot print.

Every existing exam-form suite passes unchanged.

Fail-first is not applicable: new behaviour, no defect fixed.

Mutation campaign: 33 mutants in `examFormPrint.ts`, `ExamFormPrintButton.tsx`, `StudentExamForm.tsx` and
`TeacherExamFormReview.tsx`; one exact replacement each, the test file run alone, each file restored byte-for-byte by
SHA-256, `git status` unchanged afterwards. **33 KILLED, 0 survived, 0 timeouts.**

| Group | Mutants |
|---|---|
| Escaping (a text answer; a table cell; commands; a justification; the name in the heading; the title; a teacher's note; the general note; the meta) | 9 |
| Images (any string embedded as an address; an SVG accepted; the check not anchored to the end; a non-image kept; one unreadable image fails the export; the document printed without its images) | 6 |
| Keys and the review (the right option printed; a verdict for every question; right printed as wrong; unanswered printed as wrong; the teacher's copy without verdicts; without its key-free mark) | 6 |
| What a copy carries (the student's copy only the section on screen; without the review of an approved form; without a name; unsaved ratings printed; the login code printed; working ratings not said to be unapproved; no mark for an approved form; the file's id printed) | 8 |
| Printing (the iframe left after printing; a frame that cannot print left behind; a browser that cannot print silent; a refusal to print ignored) | 4 |

**Real browser (local, not a committed gate).** The production build next to the real API in process (the harness of the
browser gates), Chromium, the teacher at 1440 × 900 and the student at 390 × 844 (touch). A whole 794589 form — 92
questions answered, 14 images attached, rated and approved (94.5) — printed from each page; the document the page made was
rendered to PDF by the same engine. 20 checks passed.

| | The teacher's copy | The student's copy |
|---|---|---|
| The file | a real PDF, 19 A4 pages, 476 KB | a real PDF, 18 A4 pages, 473 KB |
| Images | 14 of 14 in the document | 14 of 14 |
| Text | the student's name, the mark 94.5, 12 right and 1 wrong verdicts; the commands readable left-to-right | the mark, a section's note, the general note; 16 sections and 92 questions — the whole form, not the section on screen |
| Never there | an answer key (the right option of the wrong choice is nowhere); the student's login code | an answer key |
| Layout | the document fits the A4 width; the review page does not scroll sideways | the form page does not scroll sideways; the button is 44 px tall on touch |

The pages were also read by eye (rendered to images): the heading, the tables inside the page's width, the commands, the
images with their captions, the rating boxes. Two things were changed after the first look — a table's cells now break
long words instead of leaving the page, and a question's only image takes the page's width instead of half of it — and
the run above is on the build with both.

**Visual regression (local run of the UX-R19b gate).** Base `e90b3b60` build against this branch's build, phone viewport,
light and dark: 79 captures compared in each theme, 0 changed, GATE PASS. Tablet and desktop run in CI.

## Known limits

- The PDF is made by the browser's print dialog: its exact pages, margins and file name depend on the browser and on what
  the reader chooses there («حفظ بصيغة PDF», paper size, headers). The real-browser run renders the same document with
  Chromium's engine; other browsers were not run.
- One student per export. A class is exported one form at a time.
- A form with many large images takes a few seconds to prepare (each image is read again for the document) and makes a
  larger PDF; the button shows its progress.
- No file is part of the export: files are handed to the teacher, not uploaded.
- Phones: the print dialog of a mobile browser offers «حفظ بصيغة PDF» on current Android and iOS; this was not run on a
  device.
