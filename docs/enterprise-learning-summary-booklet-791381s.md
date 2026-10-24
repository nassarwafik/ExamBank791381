# Learning Materials — the summary booklet «أوراق تلخيص للمراجعة» as a second course (`791381s`)

The owner supplied a 122-page PDF booklet, «شبكات الاتصال — أوراق تلخيص للمراجعة · نموذج 791381 · للصف العاشر / الحادي
عشر», prepared by الأستاذ وفيق نصار. The owner asked for it to be added as a **new, separate learning material** (one
course for both grades), **transcribed exactly as printed, nothing added and nothing removed**, and laid out like the
existing book 791381.

This phase adds that course. The existing book `791381` is unchanged: its content, its generated server data and its
publication are byte-identical.

## Decisions

| # | Decision | Why |
|---|---|---|
| S-a | **Course id `791381s`.** The owner chose it. | It keeps the model number visible («كتاب 791381s»). It is a different id from `791381`. A `791381-` prefix check never matches `791381s-…` ids. It passes every id check (`^[A-Za-z0-9_-]{1,64}$`). |
| S-b | **One module per numbered booklet section.** Modules `791381s-m01` … `m36` are sections 1–36, with `order` = the section number. `m00` is the cover and «كيف أدرس من هذه الأوراق؟» (order 0). | This mirrors the book: a module is a teachable unit that the teacher publishes on its own, and `mNN` is the section number the student sees printed. |
| S-c | **Inside a module:** lesson `l00` holds an opener page built from the section's header box (`unit-opener`: the top line verbatim, the number, the title, the question line). Lesson `l01` has one reader page per numbered sub-topic («1 ما هي الشبكة؟» → `-l01-p01`). | This is the existing opener + lesson pattern. A sub-topic is the booklet's own unit of reading. A booklet page often ends in the middle of a sub-topic, so a page records its PDF page range (`source.pdfPageStart` / `pdfPageEnd`). |
| S-d | **Eight overview sections**, matching the booklet's own cover and contents: «المقدمة» (`m00`), the six «دفعات» (`b1`–`b6`) and «الملخص الشامل» (`m31`–`m36`). | The catalog `overviewBatches` and the manifest `batches` are equal (pinned by a test). |
| S-e | **Book content only.** Every block is `origin: "book"`. The allowed block types are `text`, `heading`, `callout`, `list`, `table`, `code`, `diagram` and `unit-opener`. | This is the owner's fidelity rule: no practice, no visuals, no activities, no teacher notes. Two block shapes are also excluded because the renderer adds its own words: `example` adds «مثال محلول» / «المطلوب», and an untitled `callout` adds a generic label. Every booklet box keeps its printed label as the callout title instead («مثال», «تذكّر», «انتبه», «الفكرة» …). |
| S-f | **Pages not converted.** The contents pages 2–3 are replaced by the Reader's own table of contents. Pages 113–122 are blank lined note pages («صفحات مسطّرة للملاحظات»). | Neither holds learning content. Every other printed line is in the course. |
| S-g | **Diagrams are crops of the booklet itself**: 32 PNGs in `public/learning-assets/791381s/<sha256-16>.png`, 312 KB in total, the largest 27 KB. Each is a `diagram` block with a full Arabic `alt` that names every label in the drawing, and a `caption` only where the booklet prints one. | The drawings are booklet content, so they cannot be redrawn or dropped. Plain string paths are used because module bodies are serialised to JSON by the build script (an `import` of an image would leak a dev path). The file names are content hashes: a URL is only learned from a body the API served after the publication check, and Static Web Apps lists no directory. The images themselves are public files; asset-level confidentiality is not claimed (same limit as `docs/learning-content-architecture.md`). |
| S-h | **Display fidelity of mixed Arabic / Latin / number text.** In a few places the plain logical text would display in a different order than the print. Those places use invisible direction marks, never a changed character: RLM around the arrows of an arrow chain («Discover ← Offer ← Request ← ACK», «PAN الأصغر ← LAN ← WAN»), an LTR span for an LTR island («Switch(config)#», «https://»), an LRM before an equation in an LTR cell, and `dir: "ltr"` for the two lines the booklet prints left-to-right. | The booklet was typeset from HTML with isolated runs. Without the marks, an arrow chain would point the wrong way in the Reader. The existing book already uses RLM marks in the same way. |

## How the text was taken from the PDF

- `pdftotext` mis-orders lam-alef and other ligatures in this PDF («االتصال», «العرشي»). The text was instead read glyph by
  glyph (visual order). It was then reordered to logical RTL order, keeping Latin and number runs together, and
  NFKC-normalised. A mark drawn over a two-letter ligature is assigned to the letter it sits over. This fixes, for
  example, «تميّز» / «الكلّي» / «كاملًا», all verified on 300-dpi crops. Bold (Cairo-Bold) and monospace (JetBrains Mono)
  runs were carried over as `strong` / `code` spans.
- Seven glyphs had no Unicode mapping. Each one is a letter carrying a shadda, and was read from the page image.
- Every page was then compared line by line against its rendered image. A bidi check compares the displayed order of
  every Latin / number / operator token in each authored string against the PDF's visual line, so a difference in
  display order cannot pass silently. What remains are wrapped lines that read the same. There are also two lines where
  the booklet's own rendering is visibly broken: «20,allowed vlan 10» under the CLI line «allowed vlan 10,20», and
  «(Domain): HFA». The course keeps the author's text in those two places.

## Size

| | |
|---|---|
| Modules | 37 (m00–m36) |
| Reader pages | 202 (36 openers + 166 sub-topic pages) |
| Blocks | 793 — 270 text, 105 table, 101 list, 98 heading, 98 callout, 53 code, 36 unit-opener, 32 diagram |
| Server bodies | `api/src/data/learning-content/791381s/` 231 KB; page index 202 pages; study / check indexes empty (no checkable block) |
| Manifest chunk | 5.5 KB gzip (budget 15) |

## Publication

Deployment is not publication. The server registry lists the 37 modules, so a teacher can attach the course to a class
and publish modules from «المواد التعليمية» in the class. Nothing is visible to any student until the teacher does so.
No existing class changes.

## Tests

- `src/learning/content/791381s/course791381s.test.ts` covers:
  - identity: the catalog order, ids, prefixes, sources, and batches equal to the catalog;
  - the manifest is exactly the one derived from the bodies;
  - the app's body list, the manifest and the server registry agree, as does the committed page index;
  - the whole course passes the validator;
  - the book-only policy;
  - every diagram file exists, is ≤ 150 KB and is referenced, and no unreferenced asset ships.
- `api/tests/learning-materials-registry.test.js` adds the booklet's exact module list and checks that ids are validated per course.
- The library tests that clicked the page-wide «فتح الكتاب» button now open it inside the 791381 card. The catalog test
  and the library-search test expect the two courses.
- `scripts/check-bundle-budget.mjs`: the manifest signature now also recognises a suffixed course id, so the new manifest
  chunk is measured against the budget. There is a fixture for it, plus mutants L7-M17 and L7-M18 in `scripts/mutate-l.mjs`.
