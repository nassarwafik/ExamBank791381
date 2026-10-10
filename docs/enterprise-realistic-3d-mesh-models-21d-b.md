# Phase 21D-B — Enterprise Realistic 3D Mesh Models

Design record for realistic, interactive 3D mesh models in teacher-authored exams and student delivery. The phase is delivered as three
reviewable pull requests:

| Sub-phase | Scope | Status |
|---|---|---|
| **B.1** | Audit, architecture, asset security, the versioned contract, content-addressed storage, the WebGL viewer | this record, §1–§12 |
| B.2 | Licensed high-fidelity anatomical assets (heart first), material quality, educational labelling, teacher authoring | §13 (plan) |
| B.3 | Full exam integration (question type, grading, review, autosave, import / export), acceptance exam, performance certification | §13 (plan) |

Baseline: `main` at `8ff966f` (the merge of PR #285, Phase 21D-A.4); its Quality Gate (run 38041285543) and Runner security run passed
before any change was made.

## 1. Audit of the existing 3D architecture

| Area | Finding | Consequence for 21D-B |
|---|---|---|
| Renderers | Every 3D view is owned SVG: function surfaces V1 (21B), interactive scenes (21C / 21D) and multi-surface plots (21D-A.4). There is no depth buffer: painter's order on facets. | Realistic anatomy needs real rasterisation with a depth buffer: a **new WebGL path**, behind its own lazy boundary. The SVG paths stay unchanged. |
| Camera | `src/interactive3d/orbitCamera.ts` (`useOrbitCamera`) is renderer-agnostic. It returns `{yaw, pitch, zoom}` and handles: drag and touch with inertia, pinch, deliberate wheel zoom, keys, Home, reduced motion, a content-keyed reset, click suppression after a drag, and full cleanup. | **Reused unchanged** for the mesh viewer. |
| Graded 3D question | `scene3DSelection@1` stores a primitive scene (`SceneSpecV1`) inside its config, derives semantic targets (`object:…`), validates and grades on the server, and its fail-closed path routes to `manualReview`. It is wired into about 15 registries: validator, defaults, catalog, presentation, student renderer, editor, review, server grader, sanitizer, draft-answer binding and the `Answer` union. | Its config, grader and renderer must stay byte-identical. The mesh question is a **new type** (`meshPartSelection@1`, B.3) that follows the same registry pattern; no existing version family changes. |
| Durable assets | The SmartSim package store (`api/src/lib/smartsim/package-store.js`) is the approved precedent. Teacher uploads are validated entirely by the server and stored immutably, content-addressed by SHA-256, behind create-only records. A public capability route serves them; published exams pin `(id, version, hash)`; publishing checks availability. | **Mirrored** for mesh assets (`api/src/lib/mesh-assets/store.js`). |
| Static assets | `public/` already ships 11 MB of exam-library content. The service worker never intercepts non-navigation requests. | Reviewed library models ship as immutable, content-addressed static files `/mesh-assets/<sha256>.glb` (B.2). |
| Bundle | Initial graph 127,805 of 128,000 bytes gzip (**195 bytes of headroom**). | Everything mesh-related is lazy. B.1 does not touch any initial-graph module. B.3's registry wiring must stay within the headroom or bring a relief commit (19E precedent). |
| WebGL in CI | Headless Chromium 141 provides WebGL 2 through ANGLE / SwiftShader: 4× MSAA, 8K textures, `WEBGL_lose_context`. | Real pixel-level certification of the WebGL path is possible without a GPU, including context-loss tests. |
| Anatomy source | BodyParts3D (Database Center for Life Science, Japan) offers FMA-identified, artist-cleaned meshes of the whole body as OBJ, with the heart split into chambers, great vessels, valves and coronary vessels, and the lungs into lobes. The licence page (updated 2025-02-27) states **CC BY 4.0**; the 2011–2013 OBJ headers still carry **CC BY-SA 2.1 JP**. | A real, recognisable, part-labelled heart is feasible for B.2. Licensing is handled conservatively (§11). |

## 2. Decision: the smallest safe WebGL integration boundary

**An owned, minimal WebGL 2 renderer that draws only documents the GLB authority has already validated and normalised.** It is a lazy
module with no third-party 3D engine.

| Option | Assessment |
|---|---|
| A general 3D engine + its glTF loader | Mature rendering, but a large, general loading surface: URI resolution, extension handlers, decoder workers (Draco, KTX2, meshopt), animation and skinning paths. Every one would need to be disabled or audited, and an engine chunk is about 150 KB gzip. Persisted exam JSON would also be tempted to carry engine options. |
| **Owned WebGL 2 renderer (chosen)** | It parses nothing: it receives typed arrays from the authority. It cannot fetch, decode extensions or execute anything. Its chunk is small (§10), and it owns GPU-memory bounds, context loss and disposal. The trade-off is that rendering correctness is ours to prove, so it is certified in real Chromium with pixel probes (§9). |

```
exam JSON (MeshModelSpecV1: asset ref + labels)                 ── no geometry, no URL, no renderer state
   │  validateMeshModelSpec (shared: Builder + server)
   ▼
meshAssetUrl(ref)  →  same-origin URL derived from the SHA-256 (library: /mesh-assets/<hex>.glb · upload: /api/mesh-assets/runtime/<hex>)
   │  meshAssetLoader: stream + byte cap → SHA-256 must equal the pin → inspectGlbAsset (the SAME authority as the server upload)
   ▼
MeshDocument (typed arrays, world transforms, materials, image bytes)
   │  meshRenderer (WebGL 2): GPU upload, PBR draw, ID-pass picking, dispose
   ▼
MeshModel3DView (lazy React): shared 21D orbit controller · parts list · states · provenance
```

## 3. Asset security model

| Threat | Control |
|---|---|
| Code execution from a model | Only data is parsed. There are no scripts, decoders, workers or extension handlers. Images are decoded by the browser's image decoder (`createImageBitmap`) only after their signature matches PNG or JPEG. |
| External or uncontrolled network loading | Any `uri` is refused (http, data:, relative). Everything must be inside the single GLB. The runtime URL is derived by code from a validated hash. The loader refuses redirects and sends same-origin credentials only. |
| Path traversal | Hashes must match `^[0-9a-f]{64}$`, both in the contract and at the server route. Storage names are built from the hash. Display names are reduced to a sanitised base name. |
| Substituted or corrupted bytes | The browser verifies SHA-256 before parsing. The server re-verifies the stored bytes against the hash before serving (integrity at rest; a mismatch returns 500 and is never served). Library references must match the reviewed entry's pinned hash. |
| Unsafe extensions or features | `extensionsUsed`, `extensionsRequired`, `extensions` and `extras` are refused, as are animations, skins, morph targets, cameras, sparse accessors, non-triangle modes and extra UV sets. |
| Malformed or hostile structure | Exact keys at every level. Every buffer view, accessor, stride, offset and index is bounds-checked against the bytes present. Numbers must be finite. The node graph must be a forest no deeper than 16 levels. The authority never throws (400 seeded random corruptions certified). |
| Resource exhaustion | Budgets cover file size, JSON size, triangles, vertices, parts, materials, textures and texture pixels (§4). The loader caps streamed bytes. GPU textures are downscaled to the device limit and a pixel budget (lower on low-memory devices). The parsed-document cache is byte-bounded. |
| Serving a model as a document | The runtime route sends `model/gltf-binary`, `nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, `Content-Disposition: attachment`, same-origin CORP and no-referrer. |
| Answer-key exposure | A model carries no answer data. Teacher-only keys and tolerances live in the question's answer key, which the existing sanitizer removes (B.3). Part labels are student-facing by design. |

## 4. The GLB authority (`src/meshModels/glbAsset.ts`, shared server build)

The authority accepts only the GLB 2.0 container (a JSON chunk plus one BIN chunk) and only this glTF subset:

* triangle meshes with float `POSITION`, optional float `NORMAL` (computed when absent), `TEXCOORD_0` (float or normalised u8 / u16) and `TANGENT` (validated, not used);
* u8 / u16 / u32 indices, or none;
* metallic-roughness materials with base colour, metallic-roughness, normal, occlusion and emissive textures (`TEXCOORD_0` only), alpha modes and double-sidedness;
* PNG / JPEG images embedded in buffer views;
* samplers from the WebGL enumerations;
* one scene, or the parentless nodes when there is none;
* **mesh-bearing nodes are the model's named parts**, with unique ids matching `^[A-Za-z][A-Za-z0-9_-]{0,47}$` (no prototype names).

| Budget | Limit |
|---|---|
| File / JSON chunk | 16 MiB / 2 MiB |
| Triangles / vertices | 400,000 / 400,000 |
| Parts / nodes / tree depth | 64 / 512 / 16 |
| Meshes / primitives / accessors / buffer views | 128 / 256 / 2,048 / 2,048 |
| Materials / textures / images | 32 / 16 / 8 |
| Image side / total texture pixels | 2,048 px / 4 × 2048² |

Every refusal returns a code, a JSON path and an Arabic reason for the teacher. The codes are: `MESH_ASSET_HEADER`, `VERSION`, `LENGTH`,
`CHUNK`, `JSON`, `SHAPE`, `UNSUPPORTED`, `EXTENSION`, `EXTERNAL_REFERENCE`, `BUFFER`, `BOUNDS`, `NUMBER`, `IMAGE`, `LIMIT`, `GRAPH`,
`NAME`, `PART_NAME`, `PART_DUPLICATE`, `EMPTY`, `TOO_LARGE` and `INVALID`. On success the authority returns a normalised document
(tightly packed copies with world transforms resolved) and a summary (parts, budgets and bounds) that the server stores with the upload.

## 5. The versioned contract — `MeshModelSpecV1` (`src/meshModels/meshModelSpec.ts`, shared)

```json
{
  "version": 1,
  "id": "heartModel",
  "title": "القلب البشري",
  "description": "…",
  "asset": { "source": "library", "id": "human-heart-bp3d", "version": 1, "sha256": "<64 hex>" },
  "parts": [ { "id": "leftVentricle", "label": "البطين الأيسر", "description": "…" } ],
  "controls": { "rotate": true, "zoom": true, "hideParts": true },
  "camera": { "azimuth": 0, "elevation": 0.2, "zoom": 1 }
}
```

* `asset` takes one of two forms:
  * **library** `{id, version, sha256}`: must name a reviewed catalogue entry with the same bytes. A changed file is a new version, never a silent replacement.
  * **upload** `{sha256, byteLength}`: a teacher file the server validated and stored.

  A URL is never accepted.
* `parts` holds 1–64 labelled parts: the student-facing vocabulary and, for questions, the only selectable targets.
  * Labels are plain text of at most 60 characters, with no markup, control, bidi or invisible characters.
  * Library parts must exist in the reviewed file.
  * Upload parts are checked when the bytes are inspected: in the browser before drawing (an error asks for teacher review), and by the server before publishing (B.3).
* Validation is strict, never throws, and returns a canonical copy.
* The exam JSON never embeds binary data.

The **library catalogue** (`meshAssetCatalog.ts`) pins each asset's SHA-256, byte length, parts with default Arabic labels, and
**provenance**: source, source URL, licence, licence URL, required attribution, ExamBank's modifications, educational limitations and
retrieval date. The viewer shows the provenance under "مصدر النموذج وترخيصه". B.1 ships the catalogue empty; B.2 adds reviewed assets.

## 6. Storage and delivery

* **Uploads** (`api/src/functions/mesh-assets.js`, `api/src/lib/mesh-assets/store.js`):
  * `POST /api/mesh-assets/upload` requires builder authentication and a `.glb` name. Size is bounded by both the declared and the actual length. The shared authority validates; a refused file stores nothing.
  * Accepted bytes are stored once at `mesh-assets/blobs/<sha256>.glb`, with a create-only record `mesh-assets/records/<sha256>.json` (validation summary) and a per-teacher index `mesh-assets/owners/<salted owner hash>/<sha256>.json`.
  * Re-uploads are idempotent. Two teachers uploading the same bytes share one blob, each with their own index entry.
  * `GET /api/mesh-assets` lists only the caller's assets.
* **Runtime**: `GET /api/mesh-assets/runtime/{sha256}` is public by design, as a content-addressed capability. It serves only hashes that have a record, re-verifies the bytes, and uses the headers in §3.
* **Library assets** (B.2) ship as `public/mesh-assets/<sha256>.glb`. The name is the hash, so the files are immutable.

## 7. The renderer (`src/meshModels/meshRenderer.ts`, `meshCamera.ts`)

* **Context and drawing buffer.**
  * A WebGL 2 context with `antialias` (MSAA), a depth buffer and no alpha.
  * Drawing buffer = CSS size × DPR, with DPR capped at 2 and at most 4.2 M pixels.
  * Back faces are culled unless a material is double-sided.
* **Shading.**
  * Metallic-roughness PBR: GGX distribution, height-correlated Smith visibility and Schlick Fresnel.
  * A camera-relative key / fill / rim light rig plus a sky / ground hemisphere and a split-sum ambient specular approximation.
  * ACES tone mapping and sRGB output.
  * Base-colour and emissive textures are uploaded as sRGB with mipmaps and anisotropic filtering.
  * Normal maps use a tangent-free cotangent frame.
  * Occlusion maps are supported, and alpha `MASK` / `BLEND` (blended parts are sorted back to front).
* **Picking.** An ID pass renders into an offscreen RGBA8 + depth target and reads one pixel, so the **front-most visible** part is selected. Non-labelled parts still occlude.
* **State, not geometry.** Highlight and review tints (selected, hover, correct / incorrect / missed) and hidden parts are render state; geometry is never edited.
* **GPU memory.** Every buffer, texture and the pick target is accounted for. Textures are downscaled to `MAX_TEXTURE_SIZE` and to a 16.8 M-pixel budget, or 4.2 M on devices reporting ≤ 4 GB memory.
* **Context loss.** `webglcontextlost` is prevented, and the viewer shows a status. On `webglcontextrestored` everything is rebuilt from the retained CPU document and decoded bitmaps, and the frame is redrawn.
* **`dispose()`.** Releases buffers, VAOs, textures, programs and the framebuffer, then the context itself (`WEBGL_lose_context`), and closes the image bitmaps. A live-renderer counter certifies that nothing leaks.
* **On demand.** One frame is drawn per state change; there is no continuous loop.

## 8. The viewer (`src/meshModels/MeshModel3DView.tsx`, lazy)

* **Interaction.** The **shared Phase 21D orbit controller** drives drag and one-finger rotation with inertia, pinch, deliberate wheel zoom (focus or Ctrl / ⌘), arrow keys, ± and Home, buttons per the authored controls, Reset, and reduced motion. A click after a drag never selects.
* **Selection and hide / show.** Selection comes from a GPU pick on click or from the **parts list**. The list is the accessible, non-spatial alternative: checkboxes with a selection maximum, hide / show per part and "show all". It works without WebGL.
* **States.**
  * `waiting`: parked off-screen;
  * `loading`: with a progress bar;
  * `ready`;
  * `fallback`: WebGL 2 unavailable, and the parts list still answers;
  * `error`: a meaningful message, with retry for network / HTTP errors; integrity and missing parts fail closed;
  * `lost`: context loss, restored automatically.
* **Bounded contexts.** Each renderer gets a **fresh canvas**, so a disposed (lost) context is never reused by StrictMode or by scrolling back. An IntersectionObserver creates the GL context only near the screen and releases it when the viewer scrolls away. Several questions on one page therefore never exhaust the browser's context limit, and the shared document cache makes returning instant.
* **Accessibility and layout.** The page is RTL and the drawing LTR. The surface has `role="img"` with a label listing the parts, plus keyboard help, an `aria-live` selection status, review marks as text, and print rules.

## 9. Test evidence (B.1)

| Suite | Result |
|---|---|
| `src/meshModels/glbAsset.21db.test.ts`: accepted documents and every refusal class (container, uri, extensions, unsupported features, bounds, numbers, graph, parts, images, budgets, strict shape), 400-case corruption fuzz that never throws, strict UTF-8 | 16 / 16 |
| `src/meshModels/meshModel.21db.test.ts`: contract (library pin, upload ref, derived URL, refusals, hostile input), camera framing invariance over yaw / pitch / aspect, normal matrix, pick-id round trip, loader (derived URL, no redirects, progress, SHA-256 before parsing, length pin, byte caps, HTTP / network / invalid / missing parts, shared download, cache, abort) | 15 / 15 |
| `src/meshModels/meshViewer.21db.test.tsx`: load states and progress, fallback, errors and retry, invalid model, pick and list selection with maximum, hide / show, review marks, authored controls, orbit buttons and keys, fresh canvas and disposal under StrictMode | 7 / 7 |
| `api/tests/mesh-assets-21db.test.js`: auth / name / size, unsafe and malformed uploads store nothing, content-addressed idempotent storage, per-teacher index, own list, sanitised names, runtime headers, malformed / traversal hashes, integrity at rest | 9 / 9 |
| Real Chromium (`scripts/check-mesh-models-browser-21db.mjs`, WebGL 2 through SwiftShader) | **37 / 37** (below) |

The real-Chromium checks are:

* **Loading.** Streamed, SHA-256-verified loading to the ready state in about 0.3–0.4 s.
* **Rendering.** All five parts drawn with 4× MSAA and a 2× buffer at DPR 2. The texture is sampled. The background stays clear.
* **Depth.** The front block (red) occludes the back plate. Hiding the block reveals the plate at the same pixel. **Turned round (yaw ≈ π), the plate occludes the block**: true depth, not draw order.
* **Interaction.** Reset; mouse drag; Ctrl + wheel; keyboard.
* **Selection.** A GPU pick selects the front-most part, a second click deselects it, and the highlight is visible in pixels. List selection follows authoring order, with the maximum enforced.
* **Review and uploads.** Review tints show in pixels and as text. An upload loads from the API route. Rotate-only controls are honoured.
* **Fail closed.** Substituted bytes are refused (integrity). Missing labelled parts ask for teacher review.
* **Contexts.** An off-screen viewer is parked and comes back when visible. Context loss shows a status and restores automatically. 20 mount / unmount cycles leave no live renderer. Four visible models hold four live contexts at once.
* **Downloads.** One download per hash.
* **Phone and fallback.** RTL / LTR; one-finger touch rotation on a phone, with no overflow at 390 px. The WebGL-unavailable fallback still answers through the list.
* **Hygiene.** No page error and no external host.

**Targeted mutation proof.** The campaign covered critical security invariants only (no large campaign). There were 20 planted
defects, each run against the focused suites (the renderer's against real Chromium). Every file was restored byte for byte (SHA-256
verified), and `git status` was clean afterwards. **19 KILLED, 1 EQUIVALENT, no timeouts.**

| Id | Planted defect | Result |
|---|---|---|
| A01 / A02 / A03 | `uri` refusal / `extensions`·`extras` refusal / `extensionsUsed`·`extensionsRequired` check removed | KILLED |
| A04 / A05 | index-out-of-range check / accessor extent check removed | KILLED |
| A06 / A07 / A08 / A09 | NaN·∞ check / image signature check / part-name validation / file-size budget removed | KILLED |
| A10 | image MIME allow-list removed | **EQUIVALENT**: the signature sniffer is a second, independent guard that returns null for every type other than PNG / JPEG, so the image is still refused with the same code. That guard is now pinned explicitly (`sniffImage(png, "image/svg+xml" …) === null`). |
| C01 / C02 / C03 | library hash pin not compared / runtime URL built from an unvalidated hash / labelled parts not checked against the library file | KILLED |
| L01 / L02 / L03 | SHA-256 integrity check removed / redirects followed / streamed byte cap removed | KILLED |
| S01 / S02 / S03 | integrity at rest not re-verified / server accepts what the authority refused / runtime route without `nosniff` and CSP sandbox | KILLED |
| R01 | depth test disabled in the colour pass (real Chromium) | KILLED by the pixel probes "front block in front of the back plate" and "selected part highlighted" |

## 10. Bundle and performance (B.1)

| Measurement | Value |
|---|---|
| Initial JS graph (`main` `8ff966f` → this branch) | **127,805 → 127,805 bytes gzip (unchanged)**; budget 128,000 unchanged |
| Mesh viewer lazy chunk (renderer, loader, GLB authority, contract, orbit controller, viewer) | 71.4 KB raw / **25.3 KB gzip** JS + 1.4 KB gzip CSS, measured in an isolated lazy build that also carries the small JSX runtime |
| Comparison | a general 3D engine chunk alone is about 150 KB gzip |
| B.1 production build | the viewer is not wired into the app yet, so no mesh chunk is emitted. The bundle guard keeps the mesh signatures out of the initial graph and the Student Portal closure as soon as B.3 wires the viewer. |
| GLB authority (Node) | 53 KB, 5-part textured test asset validated in about 6 ms |
| Real Chromium (SwiftShader, CPU) | ready (streamed, SHA-256-verified, validated, uploaded) in about 0.3–0.4 s for the 53 KB test asset; one download per hash shared by every viewer |
| GPU memory (test asset) | 53.5 KB (geometry + texture + pick target), reported by the renderer and exposed on the viewer |
| Rendering | on demand (one frame per state change); MSAA 4×; DPR ≤ 2 and ≤ 4.2 M pixels |

Anatomical-asset numbers (load time, frame time, GPU memory, several questions per exam, low memory) are measured in B.2 and B.3 and
recorded in the performance report.

## 11. Licensing and provenance policy

* Every library asset records its source, source URL, licence, licence URL, required attribution, ExamBank's modifications, educational limitations and retrieval date. The viewer shows them, and B.2 adds a `docs/mesh-assets/` provenance file per asset.
* **BodyParts3D.** The licensor's page (updated 2025-02-27) grants CC BY 4.0, with the attribution "BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International". The OBJ files carry the older CC BY-SA 2.1 JP notice. To honour both statements, ExamBank's derived GLB files will be published under **CC BY-SA 4.0** with that attribution, and both notices will be recorded.
* **Accuracy claims.** Models are described as educational anatomical models derived from a cited dataset, never as patient-specific or diagnostic. Each entry states its limitations: the source's polygon reduction, the simplified surface-only geometry, and that structures are separated by ExamBank for labelling.
* **No unlicensed assets.** Primitive composites are never presented as anatomy, and test fixtures are labelled engineering fixtures.

## 12. Commit, CI and measurement record (B.1)

To be completed on the final head of the B.1 pull request.

## 13. Plan for B.2 and B.3

* **B.2:**
  * a reproducible conversion pipeline (BodyParts3D OBJ → merged, welded, Y-up, normal-smoothed GLB with one node per labelled part);
  * the human heart (chambers, great vessels and more) and the lungs (lobes, trachea, bronchi) as reviewed library assets, each with provenance and licence records;
  * material quality (per-structure colours, roughness);
  * Arabic labels and descriptions;
  * teacher authoring: pick a library model or an uploaded one, label parts, preview.
* **B.3:**
  * `meshPartSelection@1` across every registry: validation and finalization, sanitizer, server grading, draft-answer binding / autosave, teacher review, JSON import / export, and a publish-time availability check for uploads;
  * the importable Arabic acceptance exam (heart plus a second model);
  * a performance report (load time, frame time, GPU memory, several questions in one exam, context loss, low memory) and real-Chromium lifecycle certification.
