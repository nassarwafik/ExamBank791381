# Structured Exam Import (JSON + HTML)

ExamBank can import a **complete structured exam** from a `.json` or `.html`/`.htm` file directly into
the **Structured Exam Builder** (teacher UI → **📥 استيراد امتحان منظّم**). The result is the same
`StructuredExam` object the rest of the app uses (builder, saved exams, assignments, student rendering,
grading, validation, sanitizer) — no separate model, no post‑import transform.

This document is the **stable conversion target**: convert a Word/PDF exam externally into one of the
formats below, then upload it and keep editing in the builder. Word/PDF/OCR/AI extraction are **not**
part of import — you produce JSON or annotated HTML first.

Ready-to-copy templates ship in `public/templates/`:
- `structured-exam-template.json`
- `structured-exam-template.html`

---

## Behaviour common to all imports

- Fully **client‑side** (no upload). Parsing uses `JSON.parse` / `DOMParser` only.
- Every import is forced to **`status: "draft"`** (a file’s `"final"` is never trusted).
- A **fresh `examId`** is generated (a foreign/storage id is never reused); the original is kept at
  `metadata.import.originalExamId`, alongside `sourceFileName`, `sourceFormat`, `importedAt`.
- Missing ids (section / question / part / field) are **generated**; supplied ids are preserved.
  `displayNumber` is preserved but is **never** used as identity.
- A structured exam never keeps a top‑level `questions[]` (only `sections[].questions[]`).
- **Parse errors** (bad JSON, no `sections`, unsupported type, …) are separate from **validation
  errors** from `examQuality` (missing answer keys, firstN without `requiredAnswers`, …). Serious parse
  errors block opening; validation errors do **not** — you open as a draft and fix them in the builder.
- Size limit ≈ **10 MB** (large enough for a few embedded base64 images).
- Nothing is auto‑saved. You choose **حفظ مسودة** or **اعتماد نهائي** in the builder.

## Security

Imported files are **data, not UI**. HTML is parsed with `DOMParser("text/html")`, which builds an
inert tree and **never** runs `<script>`, inline handlers, or network/resource loads. Imported HTML is
never mounted and never passed to `innerHTML`/`dangerouslySetInnerHTML`. For the embedded‑JSON mode only
the `textContent` of the single `application/json` script is read; all other scripts are ignored.
External (`http(s)`) image URLs are preserved as metadata but **never fetched** (a warning is shown);
prefer `data:` URLs. Teacher answer keys stay in the saved exam and are stripped from the student payload
by the unchanged `student-exam-sanitize.js`.

---

## 1) JSON format (canonical)

A JSON file is exactly a `StructuredExam`:

```json
{
  "examId": "791381-2026",
  "title": "امتحان 791381",
  "status": "draft",
  "sections": [
    {
      "id": "core",
      "title": "القسم الأول - الأساس",
      "instructions": "",
      "gradingPolicy": "capScore",         // "all" | "capScore" | "firstNAnswered"
      "maxMarks": 60,                        // required (>0) for capScore & firstNAnswered; null for "all"
      "requiredAnswers": null,               // required for firstNAnswered
      "answerUnit": "question",              // "question" | "part" (firstNAnswered)
      "stimuli": {},
      "questions": [
        {
          "examQuestionId": "q1",            // stable id (generated if missing)
          "displayNumber": "1",             // printed number (never identity)
          "presentationType": "multipleChoice",
          "text": "أي عنوان هو عنوان خاص؟",
          "marks": 3,
          "options": [{ "text": "8.8.8.8" }, { "text": "172.16.5.10" }],
          "answer": { "correctOptionIndex": 1 }
        }
      ]
    }
  ]
}
```

### Answer shapes per type (teacher-side keys)

| Type | Data | Answer key |
|------|------|-----------|
| `multipleChoice` | `options[]` | `answer.correctOptionIndex` |
| `trueFalse` | (options optional) | `answer.correct` (boolean) |
| `multiTrueFalse` | `fields[]` (`statement`, `kind:"boolean"`, `correct`) | per field |
| `shortAnswer` | — | `answer.text` optional → else manual review |
| `fillBlank` / `wordBank` / `ordering` | `fields[]` (`label`, `correct`), optional `wordBank[]` | `answer = { mode:"exactSequence", values:[...] }` (per field order) |
| `matching` | markdown table in `text` + `fields[].options` | `answer.text = "left=right;..."` |
| `tableFill` | `tableHeaders[]`, `tableRows[][]`, `fields[]` with `row`/`column`/`kind`/`correct` | per cell |
| `cliFill` | `cli` (blanks as `[[fieldId]]`) + `fields[]` (`id`, `correct`) | per blank |
| `compound` | `parts[]` (each a mini‑question with its own `type`, `marks`, body, answer) | per part |

Type **aliases** accepted (normalized with a warning): `mcq`→`multipleChoice`, `open`/`short`→`shortAnswer`,
`tf`→`trueFalse`, `cli`→`cliFill`, `table`→`tableFill`, etc. An **unknown** type is an import error (never
silently converted).

---

## 2) HTML — Mode A: embedded JSON (highest reliability)

A human‑viewable HTML file may carry the exact JSON in one script:

```html
<script type="application/json" id="exambank-structured-exam">
{ ...StructuredExam JSON... }
</script>
```

Only this script’s `textContent` is read (and parsed by the same JSON path). All other page scripts are
ignored and never executed.

---

## 3) HTML — Mode B: annotated DOM (`data-*` schema)

When no embedded JSON is present, an annotated DOM is parsed. Visual styling is irrelevant.

Root: `<article data-exambank="structured-exam" data-title="…" data-theme="default">`.

### Section
```html
<section data-section data-section-id="core" data-title="…"
         data-grading-policy="capScore|all|firstNAnswered"
         data-max-marks="60" data-required-answers="8" data-answer-unit="question|part">
  <p data-section-instructions>…</p>
  … stimuli … questions …
</section>
```

### Shared stimulus (rendered once; questions link via `data-group-id`)
```html
<div data-stimulus data-group-id="topology-1" data-title="المخطط">
  <p data-stimulus-text>اعتمد على المخطط التالي</p>
  <img data-stimulus-image src="data:image/png;base64,…">
</div>
```

### Question wrapper
```html
<article data-question data-id="q1" data-display-number="1" data-type="…" data-marks="3" data-group-id="topology-1">
  <p data-question-text>…</p>
  … type-specific body …
</article>
```

### Type-specific bodies

**multipleChoice** — mark the correct `<li>`:
```html
<ul data-options>
  <li data-option>RIP</li>
  <li data-option data-correct="true">OSPF</li>
</ul>
```
(Zero or more than one `data-correct` → import error; no guessing.)

**trueFalse** — on the question: `data-correct="true|false"` (also accepts `صحيح`/`غير صحيح`).

**multiTrueFalse**:
```html
<div data-fields>
  <div data-field data-id="f1" data-kind="boolean" data-correct="true">DNS يحوّل الاسم إلى IP</div>
</div>
```

**fillBlank / wordBank / ordering**:
```html
<div data-word-bank><span data-word>OSPF</span><span data-word>RIP</span></div>
<div data-fields>
  <div data-field data-id="b1" data-label="…" data-kind="text|select" data-correct="169.254"></div>
</div>
```
(`answer.values` is derived from field order.)

**matching**:
```html
<div data-matching>
  <div data-pair data-left="DNS" data-right="تحويل أسماء"></div>
</div>
```

**tableFill** — mark answerable cells (multiple per row allowed):
```html
<table data-table-fill>
  <thead><tr><th>VLAN</th><th>Network</th><th>Gateway</th></tr></thead>
  <tbody><tr>
    <td>20</td>
    <td data-answer-cell data-field-id="network" data-kind="text" data-correct="192.168.20.0"></td>
    <td data-answer-cell data-field-id="gateway" data-kind="text" data-correct="192.168.20.1"></td>
  </tr></tbody>
</table>
```
`data-kind="select"` cells may list options via `data-options="a|b|c"` or child `<option data-option>`.
`data-kind="boolean"` accepts `data-correct="true|false"`.

**cliFill**:
```html
<pre data-cli>R1(config-subif)# encapsulation dot1Q [[vlan]]
R1(config-subif)# ip address [[ip]] 255.255.255.0</pre>
<div data-cli-fields>
  <span data-field data-id="vlan" data-correct="20"></span>
  <span data-field data-id="ip" data-correct="192.168.20.1"></span>
</div>
```
Validation flags a `[[placeholder]]` without a field, a field not referenced, and a missing correct value.

**compound** — each part is a `<section data-part>` with its own `data-type`; the same body rules apply:
```html
<article data-question data-id="q25" data-type="compound" data-marks="40">
  <p data-question-text>أجب عن البنود</p>
  <section data-part data-id="p1" data-label="أ" data-type="multipleChoice" data-marks="5">
    <p data-part-text>…</p>
    <ul data-options>…</ul>
  </section>
</article>
```

### Section attribute reference

| Attribute | Meaning |
|-----------|---------|
| `data-section` | marks a section |
| `data-section-id` | section id (generated if missing) |
| `data-title` | section / exam / stimulus title |
| `data-grading-policy` | `all` \| `capScore` \| `firstNAnswered` |
| `data-max-marks` | section maximum (required for capScore/firstN) |
| `data-required-answers` | firstN count |
| `data-answer-unit` | `question` \| `part` |
| `[data-section-instructions]` | section instructions text |

### Question / part attribute reference

| Attribute | Meaning |
|-----------|---------|
| `data-question` / `data-part` | marks a question / a compound part |
| `data-id` | stable id (generated if missing) |
| `data-display-number` | printed number (never identity) |
| `data-type` | one of the 11 supported types (aliases allowed) |
| `data-marks` | numeric marks |
| `data-group-id` | link to a section stimulus |
| `[data-question-text]` / `[data-part-text]` | prompt text |

---

## Import summary

After parsing, the dialog shows the file name, a reliability label (`JSON قياسي` / `HTML + JSON قياسي`
/ `HTML منظّم` — not an AI score), recognized counts (sections, questions, parts, tables, CLI, stimuli,
images), and two lists: **parse errors** (block opening) and **problems to review** (validation errors +
warnings, which do not block opening). Then **فتح في محرر الامتحان المنظّم**.

## Limitations (this phase)

- No Word/PDF/OCR/AI extraction, no Word→HTML/PDF→HTML conversion, no automatic content repair.
- Arbitrary visual HTML is **not** heuristically understood — use embedded JSON or the annotated schema.
- External image URLs are preserved but not embedded (a warning is shown). Prefer `data:` URLs.
