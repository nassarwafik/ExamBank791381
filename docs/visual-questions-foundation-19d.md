# Phase 19D — Visual Questions Foundation

Two new versioned question families share ONE pure geometry engine:

| Type | Arabic label | Student task | Answer |
|---|---|---|---|
| `hotspot@1` | تحديد منطقة على صورة | mark one or several positions on an image | `{ kind: "hotspot", points: [{ x, y }] }` (new additive Answer kind) |
| `labelDiagram@1` | تسمية أجزاء الرسم | place labels from a bank on visible zones of a diagram | the existing `fields` Answer `{ kind: "fields", values: { zoneId: labelId } }` |

The catalog grows from 20 to 22 production types (both appended, category «تفاعلي», auto-graded, partial credit, interactive,
image-requiring, offline-capable, **not** compound parts). This is **not** the network topology designer.

## 1. Architecture

```
src/visualGeometry.ts          pure geometry engine (validation, containment, matching, pointer mapping, image identity)
src/hotspotQuestion.ts         hotspot@1 contract: config / key / question validation, projection, ingest binding, scorer, review evaluation
src/labelDiagramQuestion.ts    labelDiagram@1 contract: the same seams
src/visual/VisualCanvas.tsx    the ONE image + overlay component (student, editor, review)
src/visual/HotspotView.tsx     hotspot student view (also the editor's student preview)
src/visual/LabelDiagramView.tsx labelDiagram student view (also the editor's student preview)
src/visual/RegionEditor.tsx    the ONE teacher region editor (hotspot targets AND labelDiagram zones)
src/visual/VisualReviewView.tsx teacher review overlays
src/questionTypes/{student,editors}/…  thin registry entries (lazy)
```

The three pure modules are in the shared server build (`scripts/build-shared-finalization.mjs`): authoring, finalization, the
student sanitizer, the ingest binding, the authoritative grader and the teacher review run byte-identical geometry. Coordinate /
region logic exists exactly once (`visualGeometry.ts`); both question models and every UI surface call it.

Registry integration (Phase 16A seams, no central switch): catalog rows, defaults, validators, authoring registry, student registry,
grader registry, presentation (description / icon / chips), content detection, sanitizer projection, ingest binding, the answered
predicate (client + server), the review payload, the shared-finalization build and the bundle signatures.

## 2. Geometry coordinate system

* **Normalized coordinates** relative to the displayed image **content**: `x, y ∈ [0, 1]`, (0, 0) = top-left, (1, 1) = bottom-right.
* Browser pixels, device DPI and responsive layout never enter academic authority; only normalized values are persisted or graded.
* Shapes (all strictly validated, never repaired):
  * rectangle `{ kind: "rect", x, y, width, height }` — must lie inside the image (`x + width ≤ 1`, `y + height ≤ 1`);
  * circle `{ kind: "circle", cx, cy, r }` — centre in range, `0.005 ≤ r ≤ 0.5`; a circle is defined **in normalized space**, so on a
    non-square image it is drawn as the matching ellipse (rx = r·W, ry = r·H) — display and grading agree;
  * polygon `{ kind: "polygon", points: [{ x, y } × 3..20] }` — no duplicate vertex, simple (no self-intersection), area ≥ 0.0001.
* Refused: unknown / missing / prototype-sensitive keys (`__proto__`, `constructor`, `prototype`), non-numbers, NaN, Infinity, values
  outside [0, 1], zero / tiny sizes (< 0.005), negative radii, radii above 0.5, polygons outside 3..20 points, self-intersecting or
  zero-area polygons, unknown kinds. Limits: ≤ 50 regions / zones per question, ids `^[A-Za-z][A-Za-z0-9_-]{0,31}$`.
* Clamping exists only for UI pointer input / dragging (`clampUnit`), never to repair published or submitted data.

## 3. Boundary semantics (deterministic)

Rectangle edges, the circle circumference and polygon edges / vertices count as **inside**, with an epsilon of `1e-9` (absorbs
floating representation error). Polygons use even-odd ray casting after an explicit on-edge test, so rays through vertices never
change a result. Client and server run the same compiled code, so the same payload grades identically.

## 4. hotspot@1 contract

* **Public** `question.hotspot = { v: 1, mode: "single" | "multiple", selections, alt }`:
  * single ⇒ `selections = 1` (exactly one target);
  * multiple ⇒ `selections` 2..50 = the exact number of targets — **intentionally public** (the student must know how many places to
    mark; capping the selections at the target count prevents click-farming without any penalty scoring);
  * `alt` 3..500 characters: the meaningful image description (accessibility contract).
* **Private** `question.answer = { scoring: "proportional" | "allOrNothing", regions: [{ id, shape }] }` — scoring is never defaulted;
  regions count = `selections`; unique stable ids.
* **Image**: the question's canonical `image` (see §8) is part of the grading authority.

### Grading

1. validate the public config, the private key and the image through ONE strict authority — any defect ⇒ `score 0, correct false,
   manualReview true` (never partial credit);
2. read ONLY the response's normalized points (`x`, `y` finite in [0, 1]); a wrong kind, a malformed point (pixels, NaN, strings) or
   more points than `selections` ⇒ an ordinary incorrect answer (`score 0, manualReview false`);
3. **maximum one-to-one matching** between points and targets (augmenting paths): a point satisfies at most one target, duplicate
   clicks never earn repeated credit, overlapping targets are resolved optimally — the result is independent of point / target order;
4. proportional = marks × matched / targets; allOrNothing = marks only when every target is matched. Wrong selections simply match
   nothing (the selection cap already bounds them).

Client-sent `score`, `matched`, `targetIds`, `regions`, `correct`, `parts` or pixel sizes are dropped at ingest and ignored by the scorer.

## 5. Overlap policy

Option B: overlapping target regions are allowed; deterministic one-to-one maximum matching guarantees that one point never satisfies
two targets and that marks never depend on the order of clicks or regions (tested in both orders).

## 6. labelDiagram@1 contract

* **Public** `question.labelDiagram = { v: 1, alt, allowReuse, zones: [{ id, shape, name? }], labels: [{ id, text }] }` — the zones are
  public by design; names optional (≤ 60), label texts 1..120 and unique (normalized).
* **Private** `question.answer = { scoring, correctLabelByZone: { zoneId: labelId } }` — every zone exactly one known label; no unknown
  zone; no prototype key; with reuse disabled no label is correct for two zones.
* **Answer**: the existing `fields` Answer (registry-native, like matrix / categorization / inlineCloze).
* **Grading**: same authority rule; every zone is one part (`parts = { correct, total }`); proportional = correct / zones; allOrNothing.
  A response naming an unknown label, using a label twice while reuse is disabled, or carrying non-string values is malformed ⇒ an
  ordinary 0; unknown (forged) zone ids are ignored.
* **Ingest**: unknown zones stripped; unknown labels, reuse abuse, prototype keys and maps above 200 keys rejected; other root fields
  (`score`, `correctLabelByZone`, …) dropped.

## 7. Public / private boundaries (secrecy model)

| Data | Student payload | Teacher editor / preview | Teacher review |
|---|---|---|---|
| image + description | ✓ (existing media path) | ✓ | ✓ |
| hotspot mode / selections | ✓ | ✓ | ✓ |
| hotspot target regions / ids | **never** | ✓ (editor only; the in-editor student preview draws none) | ✓ |
| labelDiagram zones / labels | ✓ | ✓ | ✓ |
| correct label mapping | **never** | ✓ | ✓ |

The student sanitizer rebuilds `hotspot` / `labelDiagram` through the strict projections **before** the generic secret-key policy runs:
a config smuggling any extra field (targets, a mapping) is withheld entirely (fail closed); `answer` is blanked as for every type. The
student renderers read only the projections and never `answer`.

## 8. Image asset integration

No second asset system. Both types use the canonical question image `image: { exists, visible, assets: [asset] }` (Phase 5B), authored
with the existing «صورة السؤال» editor (upload, AI generation, bank). The asset **identity** is validated:

* embedded `data:image/png|jpeg|webp|svg+xml` (uploaded / AI-generated; SVG is sanitized by the existing media module), or
* a bank asset `{ origin: "bank", blobName }` with a safe blob name — the browser URL is a short-lived signed credential minted at
  delivery (`hydrateBankAssets`) and at review (`hydrateBankAssetsInQuestion`), never authority.

Refused: missing or hidden images, browser object URLs (`blob:`), remote / signed URLs on non-bank assets, local paths, non-image data
URLs. The image is part of the grading authority (a hidden / removed image routes the question to manual review).

## 9. Student pointer mapping

`clientPointToNormalized(client, imgRect, naturalSize)` maps a pointer against the **displayed image content**: the content rectangle
of an `object-fit: contain` image is computed from the element rect and the intrinsic size, so a pointer in the letterbox band
returns null (no point) and resize / zoom / DPI never change the normalized result (tested). Results are rounded to 6 decimals. The
overlay is positioned over the content rectangle (measured on load and on resize — no render loop) and draws in a pixel viewBox equal to
the content box.

## 10. Accessibility

* A meaningful image description (`alt`) is **required** at authoring time and is the student image's alt text.
* hotspot: the image overlay is a focusable control — arrows move a visible cursor (Shift = larger step), Enter / Space place a point;
  markers are buttons (drag, arrows to nudge, Delete to remove); a live status («حدّدت n من m») and a selection summary list every point
  with a remove button.
* labelDiagram: zones and labels are real buttons (keyboard focusable, named «المنطقة n — name: label»); the non-drag tap-select
  fallback and a labelled combobox per zone are always present.
* **Honest V1 limitation**: a hotspot question asks *where* something is on an image; for a student who cannot see the image the
  description and keyboard cursor do not make it equivalent. Teachers should provide an alternative question for such students.

## 11. Mobile UX

Touch targets ≥ 40 px (markers 32 px with padding), `touch-action` tuned for tapping and dragging, the tap-select fallback for labels,
combobox fallback, responsive image (`max-height: 70vh`, `object-fit: contain`, letterbox-aware mapping), RTL chrome.

## 12. AI limitations

The AI builder recognises `hotspot` / `labelDiagram` (intent enum, bilingual request signals, prompt) but has no image and no geometry
authority: a visual intent is always refused with `AI_VISUAL_GEOMETRY_REQUIRED` and a teacher-facing message; it never returns a
question with coordinates, whatever payload it smuggles (an extra root key is `AI_DRAFT_MALFORMED`). Incomplete drafts are not part of
the AI contract, so V1 does not create one; manual placement by the teacher is the V1 path.

## 13. Compound questions

Not compound-capable (V1 decision): the catalog marks both types non-compound, the validator refuses them as parts
(`TYPE_NOT_COMPOUND_CAPABLE`) and the ingest rejects a hotspot answer inside a compound part (`HOTSPOT_QUESTION_MISMATCH`).

## 14. Security

Tested refusals: prototype keys, unknown root / geometry fields, NaN / Infinity, x / y < 0 or > 1 (incl. pixel values), zero-size
rectangles, negative / oversized radii, polygons < 3 or > 20 points, duplicate / invalid ids, > 50 regions, excessive clicks, forged
target ids / matched ids / scores / mappings, duplicate clicks, overlapping targets, label reuse abuse, unknown labels / zones, malformed
or non-identity image assets, unsupported versions (never routed to V1). Renderers / editors / review use no `innerHTML`, `eval`,
network or storage.

## 15. Bundle architecture

Everything visual is lazy (registries' `import()` edges; the review module is reached only through `AssignmentReview`). Only the catalog
rows, the default literals, the registry edges, the answered predicate and the card's `ownsImage` check are in the initial graph. The
bundle guard gained `VISUAL_SIGNATURES` (`vq-canvas`, `vq-region-editor`, `qt-editor-hotspot`, `qt-editor-labelDiagram`, `vq-review`);
the 128,000-byte limit is unchanged. SVG overlays + CSS + pointer events only — no canvas, no drawing library, no animation loop.

| Tree | Initial graph (gzip level 9) | Headroom to 128,000 bytes |
|---|---|---|
| Baseline `e0ec8e2` (Phase 19C merged) | 127,410 bytes | 590 |
| Phase 19D head | 127,914 bytes | 86 |

The +504 bytes are the two catalog rows, the two default literals, four lazy registry edges, the `hotspot` answered predicate and the
card's `ownsImage` check.

## 16. Known V1 limitations

* No penalty scoring; no partial point credit by distance; no freehand student drawing; no OCR / object detection / AI geometry.
* Hotspot is not equivalent for students who cannot see the image (see §10).
* Zone names / label texts are plain text (no rich formatting); one image per visual question (the canonical first asset).
* The initial-graph headroom under the unchanged 128,000-byte budget is small (see the PR); later phases must pay for new initial code.
