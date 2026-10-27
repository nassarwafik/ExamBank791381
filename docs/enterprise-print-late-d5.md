# D5 — exam printing (item 9) and the late-submission policy (item 10)

Two gaps found by the project survey. The owner made these decisions before implementation:

- **Item 9:** a student paper **and** a separate answer key. Interactive questions print their prompt with a note.
- **Item 10:** an optional, per-assignment late window with a **fixed** percentage deduction set by the teacher. It is off by default.

| # | Gap | Change |
|---|---|---|
| 9 | Exams could not be printed at all. Only the gradebook, the reports and the login cards could be printed. | «طباعة ورقة الامتحان (PDF)» and «طباعة مفتاح الإجابات (PDF)» in the builder's tools menu (classic and Studio). |
| 10 | The deadline was a hard close. The only exception was a per-student extension. | `assignment.latePolicy = { windowHours, deductionPercent }`. Late attempts are accepted inside the window, stamped late, and lose the fixed percentage. |

## 1. Exam printing (item 9)

`src/print/examPrint.ts`: a pure builder of one self-contained right-to-left HTML document, and `printExam(exam, mode)`.

**How it prints**
- From a hidden same-origin iframe, exactly like the gradebook and login-card prints. There is no popup, no script and no dependency.
- The browser's «حفظ بصيغة PDF» produces the PDF, with correct Arabic shaping.
- Printing waits until the images have loaded, or at most 3 seconds.

**Contents**
- Header: title, school / subject / grade / teacher / date / duration when present, and the official total marks.
- Student paper only: name and class lines, and the general instructions.
- The sections, with their instructions and a "first N" note.
- Section stimuli and scenarios, each printed once before its first question.
- Each question with its display number and its official marks (`questionMaxMarks`, `distributePartMarks`), followed by its stem.
- Legacy markdown tables print as tables, and rich stems print as their plain text.
- Code stimuli and images.

**Per question family**

| Family | Student paper | Answer key |
|---|---|---|
| Multiple choice / true–false | lettered options / two circles | the letter and the text |
| Multiple select | check boxes | the correct options |
| Multiple true–false | statement table | ✓ in the right column |
| Fill-blank / word bank | word list (alphabetical) + blanks | the values |
| Matching | labels + blanks, answer pool in **alphabetical** order (never key order) | label ← answer |
| Ordering | items (alphabetical) + boxes | the sequence |
| Table fill / CLI fill | the table / CLI with blanks | the cell values |
| Matrix / categorization | grid of circles / categories + items | ✓ / item ← category |
| Inline cloze | passage with numbered blanks or option lists | accepted answers / correct option |
| Numeric | answer line (with unit) | value ± tolerance or range, unit |
| Parametric numeric | answer line, with a note that values are generated per student on the platform | the expression |
| Short answer / open response | answer lines (and the public instructions) | the stored answer / the model answer |
| Coding | starter code or template, answer lines, a note | "graded by hidden tests on the platform" |
| Compound / composite | every part with its label and marks | each part's answer |
| Interactive (hotspot, label diagram, charts, function graph, 3D, mesh, simulation, SmartSim, network CLI) | the prompt and image, with «سؤال تفاعلي — يُجاب عنه على المنصة.» | "graded on the platform" |

**Safety**
- Every value is HTML-escaped.
- Images are only `data:image/…` URLs or same-origin paths, matching the D2 CSP `img-src`. An external URL is dropped.
- The student paper never contains a key box or any answer value; key values are read only in key mode.
- Hidden tests, reference solutions, rubric guidance and interactive targets are never printed in either document.
- The key carries «مفتاح الإجابات — للمعلم فقط» in its title, its header and its footer.

The print module lives in the builder's lazy chunk, so it adds nothing to the initial bundle.

## 2. Late-submission policy (item 10)

**Model:** `api/src/lib/late-policy.js` (server authority), with `src/assignments/latePolicy.ts` as the client wording.

**The policy field**
- Shape: `latePolicy = { windowHours: 1..336, deductionPercent: 0..90 }`, both integers.
- A missing field means no late window. Every assignment stored before D5 therefore closes at its due date exactly as before.
- A malformed stored value is also treated as no window; it can never open a closed assignment.

**Availability** (`assignment-availability.js`)
- The window starts at each student's **effective** due date, so a per-student extension moves it too.
- `closeMs = dueMs + window`. Inside the window, availability stays `open` and `inLateWindow` is true.
- The window's end is the hard close everywhere the due date used to be. `timerState` caps running attempts at `closeMs`: a timed attempt started before the deadline may run to its own duration end inside the window.
- Without a policy, `closeMs === dueMs`, so behaviour is byte-for-byte unchanged.

**Lateness and the deduction**
- **When an attempt is late:** when it **ended** strictly after the effective due date. The end is the submit time, or the authoritative end of a timed-out / strict-exit / teacher-ended attempt — never the moment it was finalized offline.
- **The stamp:** `attempt.late = { minutesLate, deductionPercent }`, the policy in force at that moment. A later policy change never rewrites an existing result.
- **Where it is applied:** in the four attempt creators, and in the one canonical rebuild (`rebuildAttemptGrades`). The rebuild first recomputes the raw total, so the deduction is never stacked. A teacher review, a coding callback or a render-failure decision all re-apply it to the new total.
- **What the attempt stores:** `rawScore` (the mark before the deduction) and `latePenalty` (the marks deducted). `score` and `percentage` are the official, deducted values, so every existing reader (gradebook, reports, exports, medals, Strength, analytics) sees the same number.
- **Pending marks:** marks still awaiting review are not deducted until they are awarded.
- **No manufactured zero:** the 90 % cap keeps the policy a deduction, never a zero (AGENTS.md §10).
- **Waiver:** the teacher may waive the deduction for one attempt, or restore it (`assignment-results` `setLateWaiver`). The attempt keeps its late stamp; the score is rebuilt and the medal re-synced; the action is audited and idempotent.

**Results release:** under a late policy, "after the due date" means **after the late window**, on the server (`results-release.js`) and in the teacher's wording. Results and the per-question breakdown never reach the class while classmates may still submit late.

**Student surfaces**
- `state().lateWindow` is announced before the due date and active inside the window.
- The dashboard card shows «تسليم متأخر حتى … · خصم …٪».
- The exam start card shows the notice, and the details list shows the cutoff.
- A late result says how late it was and the percentage. The marks before / after the deduction (`rawScore`, `latePenalty`) are withheld with the score until results are released.

**Teacher surfaces**
- The composer's rules step (disabled until there is a due date) and the review step.
- The assignment page's settings: shown, and editable any time through `setlatepolicy`. Removing the policy is confirmed.
- The list's time chip: «انتهى الموعد · تسليم متأخر خلال …».
- The gradebook: «متأخر … · خصم …٪», the mark before the deduction, and «إلغاء / إعادة خصم التأخير» in the row menu.

**API**
- `manage-assignments` `create` accepts `latePolicy`: malformed → 400; without a due date → 400.
- New action `setlatepolicy {latePolicy | null}`: archived → 409; without a due date → 409. Audited.
- `SUMMARY_VERSION` 3 adds `latePolicy` to the list summary.
- `assignment-results` GET returns `assignment.latePolicy`, plus `late` / `rawScore` / `latePenalty` per attempt. New action `setLateWaiver {attemptNumber, waived}`.

**Unchanged**
- The automatic reminder (D4) still fires 24 h before the due date, not before the late cutoff.
- The teacher's «تذكير» and the student dashboard counts follow `timerState`, so a student inside the window counts as "can still submit".
- Teacher analytics keeps its existing `lateSubmissions` count.

## 3. Known limitations

- Printing works from the builder (the exam the teacher has open). A published assignment's snapshot is not loaded for printing; open its exam in the builder instead.
- A rich stem prints as plain text (no charts or 3D). Interactive families print a note, by design.
- The deduction is one fixed percentage per late attempt, per the owner's decision; there is no per-day scale.
- The gradebook CSV / Excel export carries the official (deducted) score; it has no separate lateness column.
