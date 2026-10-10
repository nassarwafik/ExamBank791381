# Phase 21D-B — Enterprise Realistic 3D Mesh Models

Design record for realistic, interactive 3D mesh models in teacher-authored exams and student delivery. The phase is delivered as three
reviewable pull requests:

| Sub-phase | Scope | Status |
|---|---|---|
| **B.1** | Audit, architecture, asset security, the versioned contract, content-addressed storage, the WebGL viewer | this record, §1–§12 |
| B.2 | Licensed high-fidelity anatomical assets (heart first), material quality, educational labelling, teacher authoring | §14 |
| B.3 | Full exam integration (question type, grading, review, autosave, import / export), acceptance exam, performance certification | §15 |

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
| `api/tests/mesh-assets-21db.test.js`: auth / name / size, unsafe and malformed uploads store nothing, content-addressed idempotent storage, per-teacher index, own list, sanitised names, runtime headers, malformed / traversal hashes, integrity at rest | 8 / 8 |
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

**Baseline and branch:**
- Baseline: `8ff966f1c06bc90de16a203435f396af6e398508` (merge of #285; main Quality Gate run 38041285543 = success).
- Branch: `feature/phase-21d-b1-mesh-webgl-foundation`, pull request #286.

**Commits:**

| Commit | Content |
|---|---|
| `e914a28` | implementation |
| `d34cb69` | design record + mutation proof |
| `fe1c1b3` | route-inventory classification |
| `f04fbf5` | harness CI fix: data: favicon, 4xx responses logged by URL, hidden artifact directory uploaded |

**Exact-head CI on `f04fbf5`** (all attempt 1):

| Workflow | Run | Conclusion |
|---|---|---|
| Quality Gate | 38044568027 | success |
| Build and Deploy | 38044568027 | success; PR preview environment created; no production or Runner deployment |
| Real Chromium WebGL | 38044568015 | success, 37 / 37 |
| Runner security & smoke | 38044568062 | success |

## 13. Plan for B.2 and B.3

* **B.2** (delivered; see §14 — the lungs were replaced by the brain because BodyParts3D has no lung-lobe surfaces):
  * a reproducible conversion pipeline (BodyParts3D OBJ → merged, welded, Y-up, normal-smoothed GLB with one node per labelled part);
  * the human heart (chambers, great vessels and more) and the lungs (lobes, trachea, bronchi) as reviewed library assets, each with provenance and licence records;
  * material quality (per-structure colours, roughness);
  * Arabic labels and descriptions;
  * teacher authoring: pick a library model or an uploaded one, label parts, preview.
* **B.3:**
  * `meshPartSelection@1` across every registry: validation and finalization, sanitizer, server grading, draft-answer binding / autosave, teacher review, JSON import / export, and a publish-time availability check for uploads;
  * the importable Arabic acceptance exam (heart plus a second model);
  * a performance report (load time, frame time, GPU memory, several questions in one exam, context loss, low memory) and real-Chromium lifecycle certification.

## 14. Phase 21D-B.2 — anatomical library models, material quality and authoring

**Branch:** `feature/phase-21d-b2-anatomical-mesh-assets`.
- It is stacked on the B.1 branch at `f04fbf5`.
- Its pull request targets `main`. Until #286 merges, the pull request also lists the B.1 commits. The B.2 change itself is
  `f04fbf5..head`.

### 14.1 Assets

The provenance record is `docs/mesh-assets/PROVENANCE.md`. The served licence notice is `public/mesh-assets/NOTICE.txt`.

| Catalog id | File (SHA-256 prefix) | Bytes | Triangles | Parts | Source elements |
|---|---|---|---|---|---|
| `human-heart-bp3d` v1 | `61e01bcf…` | 2,001,400 | 99,207 (not simplified) | 14 | 81 BodyParts3D elements |
| `human-brain-bp3d` v1 | `6de4ff20…` | 2,531,732 | 118,856 (from 237,720) | 10 | 36 elements |

**Heart parts:**
- the four chambers;
- the aorta and pulmonary trunk;
- both venae cavae;
- the coronary arteries and the cardiac veins;
- the four valves.

**Brain parts:**
- the frontal, parietal, temporal and occipital lobes and the insula;
- the cerebellum;
- the midbrain, pons and medulla;
- the cerebral white matter.

The source is BodyParts3D 4.0 (DBCLS). The licensor's page states CC BY 4.0, while the OBJ headers carry an older CC BY-SA 2.1 JP
notice. The derived GLB files are therefore published under **CC BY-SA 4.0** with the verbatim attribution. The licence is recorded
in each GLB's `asset.copyright`, in the catalog, in the NOTICE and in the provenance panel of the viewer.

**Educational limitations** are written into the catalog entries and shown to every viewer:
- a single adult specimen; not a diagnostic or measurement tool;
- the heart has no ventricular myocardium surface: the ventricles are cavity surfaces, and some posterior coronary branches float
  slightly off them;
- not shown: the pulmonary veins and the papillary muscles;
- the inferior vena cava is clipped;
- the brain is simplified to about 50 %, and its superior temporal gyrus, orbital gyri and medial surface are not included;
- colours are teaching conventions.

**Pipeline** (`scripts/convert-bodyparts3d-21db.mts`):
- It verifies the source archive's SHA-256 before using it.
- It writes the same bytes on every run.
- It validates each output with the same GLB authority the server and browser use.
- The manifest `docs/mesh-assets/bodyparts3d-21db-manifest.json` lists every source element (FJ id, FMA concept, name) with
  triangle counts.

**Simplifier** (`src/meshModels/meshSimplify.ts`): an offline quadric edge-collapse simplifier.
- Placement is endpoint-only, so every output vertex is an original source vertex with its source normal; no geometry is invented.
- Open boundaries are locked.
- Folds are refused: a collapse whose face-normal dot product falls below 0.3 is rejected.
- It is deterministic.

**Rendering:**
- The light rig was retuned for tissue: key 2.35, fill 0.55, rim 1.0, darker ambient.
- Each library entry carries a reviewed default view: the heart anterior at zoom 1.2, the brain right-lateral at zoom 1.3.

### 14.2 Authoring

`MeshModelEditor` is lazy. It ships unwired in B.2; the question type that embeds it arrives in B.3. It provides:
- **Asset sources:**
  - the reviewed library, with source and licence shown on each card;
  - "my uploaded models", through an App-owned `MeshAssetService` provided by React context, the same token-free pattern as SmartSim.
    The service has `meshAssetClient.ts` (XHR upload with progress, the auth header only, an encoded file name, and malformed rows
    dropped).
- **Drafts built from the asset** (`meshModelDraft.ts`): a teacher can only label parts the file contains. A re-included part gets its
  default label back.
- **Labels and descriptions, part inclusion and the student controls.**
- **Starting view:** the starting view is captured from the live preview, then wrapped, clamped and rounded into the contract's
  ranges.
- **Live validation:** the canonical validator runs on every change and shows its Arabic reasons.
- **Replacing a labelled model asks for confirmation.**
- **Preview:** the preview is the student viewer itself. It keeps showing the last valid model while the draft is invalid.

**Defect found and fixed (fail-first on `1961514`).** The B.1 viewer keyed the asset load, the camera reset and the GL renderer on the
whole model JSON. In a live preview, every label keystroke therefore:
- reloaded the asset;
- disposed and recreated the WebGL context;
- reset the view.

The fix splits the keys:
- the asset and GL context depend on the asset reference only;
- the view resets when the asset or the authored camera changes;
- hidden parts reset when the labelled part set changes.

Labelled parts are now checked against the parsed document in the viewer. A part missing from the file still fails closed, and it
recovers without a reload once the label is removed.

`src/meshModels/meshViewerStability.21db.test.tsx` failed 3 / 3 on `1961514` (worktree run):
- the loader was called 2 times instead of once (two tests);
- the state was `ready` instead of `error`.

All 3 pass on the head.

The renderer gained `pickMany` for orientation certification: one pick pass, many read-backs. The product `pick` now routes through
it, with identical behaviour; the B.1 Chromium checks pass 37 / 37.

### 14.3 Tests and certification (B.2)

**Unit tests:**

| Suite | Tests |
|---|---|
| `meshAssetCatalog.21db` (files, hashes, GLB authority, exact part lists, contract validation of the defaults, provenance, NOTICE / PROVENANCE / manifest consistency) | 6 |
| `meshSimplify.21db` (original vertices, closed and oriented, boundary + area, fold refusal, determinism) | 5 |
| `meshViewerStability.21db` (fail-first) | 3 |
| `meshModelEditor.21db` | 9 |
| `meshAssetClient.21db` | 3 |

B.1 suites updated for the new fields: 38.

**Real Chromium** (`scripts/check-mesh-anatomy-browser-21db.mjs`, a second step of the WebGL workflow): **32 / 32**. It covers:
- **The shipped files at full resolution.**
- **Anatomical orientation, from GPU picks on a 64 × 48 grid:**
  - in the anterior view of the heart, the superior vena cava and right atrium lie on the viewer's left of the aorta and pulmonary
    trunk; the great vessels sit above the ventricles; the inferior vena cava is below the superior one;
  - the left atrium is prominent only from behind;
  - in the right lateral view of the brain, the frontal lobe is anterior of the parietal lobe, which is anterior of the occipital
    lobe; the temporal lobe is below the parietal lobe; the cerebellum is posterior and inferior; the brainstem is lowest.
- **Rendering:** tissue colour, selection highlight, hide / show, context loss and restore.
- **Several models and caching:** three models at once; one download per file.
- **The editor flows:**
  - library pick;
  - label edits that keep the same canvas;
  - view capture;
  - the replace confirmation;
  - an upload through the service;
  - an invalid label.
- **Phone:** touch rotation; no overflow at 390 px for the viewer and the editor.
- **Hygiene:** no page error, no foreign host.

**Measured performance** (headless Chromium, SwiftShader CPU rendering, no GPU; a real GPU is far faster):

| Model | Ready (from navigation: 2.0–2.5 MB streamed, SHA-256, validated, uploaded) | Frame (render + synchronous read-back) | GPU memory |
|---|---|---|---|
| Heart | 0.30–0.38 s | 190–280 ms | 1.9 MB |
| Brain | 0.26–0.32 s | 390–430 ms | 2.4 MB |
| Heart + brain + heart | — | — | 6.2 MB in total |

**Mutation proof (B.2):** 16 mutants were planted, each file restored byte-for-byte with SHA-256 verification; `git status` was
unchanged afterwards.

| Id | Mutant | Verdict |
|---|---|---|
| B2-01 | viewer: missing-parts gate removed | KILLED (after strengthening, see below) |
| B2-02 | viewer: missing-parts error dropped | KILLED |
| B2-03 | viewer: asset keyed on the whole model | KILLED |
| B2-04 | viewer: camera reset on text edits | KILLED |
| B2-05 | catalog: heart pin wrong | KILLED |
| B2-06 | catalog: unknown part labelled | KILLED |
| B2-07 | catalog: attribution weakened | KILLED |
| B2-08 | draft: foreign part accepted | KILLED |
| B2-09 | draft: zoom not clamped | KILLED |
| B2-10 | editor: emits while disabled | KILLED |
| B2-11 | editor: replace without confirmation | KILLED |
| B2-12 | editor: non-.glb sent to the server | KILLED |
| B2-13 | client: malformed hash accepted | KILLED |
| B2-14 | simplifier: boundary not locked | KILLED |
| B2-15 | simplifier: fold check disabled | KILLED (after strengthening, see below) |
| B2-16 | simplifier: non-original vertex | KILLED |

Two mutants survived the first run and were treated as findings:
- **B2-01:** a GL context was still created behind the error overlay. The test now asserts that no renderer exists for a model that
  cannot be shown.
- **B2-15:** on a perfectly flat sheet, fold-free collapses always exist. The test now uses a jittered, rippled sheet; without the
  guard it produces 44 folded faces.

**Bundle:**
- The editor is lazy. Its class names joined the guard's mesh signatures, so they must stay out of the initial graph and out of the
  student portal's static closure.
- The initial graph is unchanged.

**Static Web Apps configuration:** not changed, for two reasons:
- two existing tests pin it as unchanged;
- the loader does not depend on the served MIME type, because it verifies bytes by SHA-256.

Serving `.glb` from `/mesh-assets/` is to be verified on the PR preview.

## 15. Phase 21D-B.3 — exam integration: `meshPartSelection@1`

Branch `feature/phase-21d-b3-mesh-exam-integration`, stacked on B.2 (`e64df26`: B.2 + the B.1 record correction). It changes no B.1 / B.2
contract: `MeshModelSpecV1`, the GLB authority, the library catalog, the viewer and the editor are reused as they are.

### 15.1 The question type

`meshPartSelection@1` is an additive production type (catalog row after `scene3DSelection@1`; category interactive; grading auto;
partial credit; **not** a compound part nor a composite child, and **not** an AI-composer kind).

| Field | Where | Contract |
|---|---|---|
| `meshPartSelection` | question (public) | `{ v: 1, model: MeshModelSpecV1, mode: "single" \| "multiple", maxSelections, label?, hideLabels?: true }` — `maxSelections` is 1 for single, ≤ the labelled parts otherwise; at least two labelled parts; the instruction is plain text (no HTML, control, bidi-override or invisible characters, ≤ 160) |
| `answer` | question (private; removed by the student sanitizer) | `{ scoring: "allOrNothing" \| "partial", correct: string[] }` — non-empty, unique, labelled parts only, reachable within the limit; single choice is all-or-nothing with one part. Canonicalised to the model's part order |
| student answer | attempt | `{ kind: "meshPartSelection", modelId, parts: string[] }` — exact keys; ids of the published model only. Camera, pixels, hidden parts and renderer state are never part of an answer |

One shared authority, `src/meshPartSelectionQuestion.ts`, compiled verbatim to the API (`scripts/build-shared-finalization.mjs`, drift
test): config / key validation, answer shape, binding to the published question, the student projection, scoring and the teacher
evaluation.

**Scoring** (server only): all-or-nothing gives full marks for exactly the correct set (a superset is not exact); partial gives
`max × hits ÷ |selected ∪ correct|`, so selecting everything never pays. **Fail closed:** a config or key that cannot be classified is
never auto-scored — 0 with `manualReview` (teacher review), never a silent zero. A blank answer is an ordinary unanswered question. An
answer that does not bind (another model, an unlabelled part, too many parts, a duplicate, extra fields such as a self-reported score)
is refused at ingest with its classified code and is never stored, exactly like the other semantic selection types.

**Hidden labels** (`hideLabels: true`, identification questions): the student projection replaces every label with a neutral ordinal
(«الجزء ١»…) and drops part descriptions **before anything leaves the server**. This is pedagogical, not secrecy: part ids remain the
answer vocabulary in the client and the GLB itself names its nodes — as target keys do in `scene3DSelection@1`. The correct parts are
never sent. The provenance block keeps the licence-required attribution and the general educational limitations of the asset; they name
no part of a question.

### 15.2 Server integration

| Seam | Change |
|---|---|
| `draft-answers.js` | mesh answers are bound to the published question (`MESH_SELECTION_*` codes); a mesh answer on another type is `MESH_SELECTION_QUESTION_MISMATCH` |
| `question-type-graders.js` | registered grader (shared scoring) |
| `student-exam-sanitize.js` | the config is rebuilt through the strict authority (canonical copy, hidden labels neutral); an invalid config is withheld |
| `exam-structure.js` | "first N answered": a non-empty selection takes a slot; an empty one never does |
| `assignment-review.js` | the teacher review payload carries the real model (true labels even when hidden from the student), the key and the stored answer |
| `exam-governance.js` + `mesh-assets/store.js` | **publish gate** `MESH_ASSET_UNAVAILABLE` (422 at submit-review): every UPLOADED model must exist in the store — bytes present and re-verified against their SHA-256 (integrity at rest), exactly the pinned length, and containing every labelled part. Library assets are code-owned and pinned by the catalog |

Exam JSON never embeds model bytes: a model is a library id + version + SHA-256, or an upload SHA-256 + length. The acceptance exam is
15.7 KB for six models.

### 15.3 Authoring, delivery and review (all lazy)

- **Teacher editor** (`questionTypes/editors/MeshPartSelectionEditor.tsx`): the B.2 model editor (library / uploads, labels,
  controls, starting view, live preview) plus the question — single / multiple, limit (bounded by the labelled parts), instruction,
  hidden labels, scoring and the private key (chosen among the labelled parts). When labelled parts change, correct parts that no
  longer exist are pruned from the key and the teacher is told. Every change is validated live by the shared authority.
- **Upload service:** App-owned (`meshAssetClient`, loaded lazily with the shared builder auth headers; the builder never holds the
  token) and provided to every editor through `MeshAssetServiceContext`; without it only the library is offered.
- **Student renderer** (`questionTypes/student/MeshPartSelectionResponse.tsx`): the B.1 viewer with selection — a click on the model
  selects the front-most labelled part (GPU pick), and the accessible parts list selects too (and keeps working without WebGL or when
  the asset cannot be shown). The answer for another model is never shown as selected.
- **Teacher review** (`meshModels/MeshPartSelectionReview.tsx`, `lazyWithRetry` key `teacher-mesh-review`): re-evaluates the stored
  answer with the shared authority; marks correct / incorrect / missed in the image and as text, with the real labels.

### 15.4 Bundle relief

Wiring the type added 72 B to the initial graph (128,072 B > the unchanged 128,000 B budget). The flat-exam theme preview dialog
(«معاينة هذا التنسيق», a user-opened dialog) was the only static importer that pulled the whole student rendering closure into the
initial graph, so App now loads it on demand (`lazyWithRetry` key `teacher-theme-preview`, inside a Suspense boundary in the same
portal; inventoried in `deploymentRecovery.inventory.11d.test.ts`; pinned by `bundleRelief.21db3.test.ts`). Initial graph: **18 files,
128,072 B → 9 files, 112,511 B gzip** (15,489 B headroom). The mesh UI signatures stay out of the initial graph and the student portal's
static closure (bundle guard).

### 15.5 Arabic acceptance exam

`docs/fixtures/mesh-models-21db3/ExamBank_21DB3_Mesh_Models_Acceptance.json`, generated by `scripts/generate-mesh-models-21db3-fixture.mjs`
from `scripts/mesh-models-21db3-exam.mjs` (byte-for-byte drift test). 28 marks:

| Q | Model (library) | Task | Mode / scoring | Marks |
|---|---|---|---|---|
| h1 | heart — chambers + great vessels | the chamber that pumps oxygenated blood into the aorta | single | 4 |
| h2 | heart — vessels | the two arteries leaving the ventricles | multiple (2), partial | 4 |
| h3 | heart — valves | the valve between left atrium and left ventricle, **labels hidden** | single | 4 |
| b1 | brain — balance | the part mainly responsible for balance and coordination | single | 4 |
| b2 | brain — brainstem | the three parts of the brainstem | multiple (3), all-or-nothing | 6 |
| b3 | brain — lobes | the lobe that mainly processes vision, **labels hidden** | single | 4 |
| c1 | — | an ordinary multiple-choice question in the same exam | — | 2 |

### 15.6 Tests and certification (B.3)

| Suite | Tests |
|---|---|
| `src/meshPartSelectionQuestion.21db3.test.ts` — catalog identity, config / key validation (rejections), registry routing, projection, binding, scoring, fail closed, evaluation, CJS parity | 48 |
| `src/questionTypes/meshPartSelection.21db3.test.tsx` — student renderer, editor, upload service wiring, review | 12 |
| `api/tests/certification-21db3/cert-21db3-mesh-lifecycle.test.js` — the real platform (see below) | 16 |
| `api/tests/certification-21db3/cert-21db3-fixture-drift.test.js` | 2 |
| `src/aiComposer/composerMesh.21db3.test.ts` — the AI composer cannot author or reference mesh models (fail closed) | 2 |
| `src/bundleRelief.21db3.test.ts` | 3 |

Updated pins (an additive type, as for every earlier type): catalog order (`questionTypeCatalog.16a`), the frozen catalog
(`presentationFreeze.20d1` L-9: 29 types), the answer union (`StudentExamPage.ux7b1`), the deployment-recovery inventory, and the 20G
capability matrix (`meshPartSelection@1`: disposition A, exercised by the 21DB3 exam; `coverage-map.md` regenerated).

**Platform lifecycle** (real handlers, in-memory storage): import → canonical save → export → re-import is exact; finalization
refuses a forged library hash, an external URL, an executable field and an unlabelled part; save → load → governance (the mesh gate
passes: library assets only) → publish → assignment; sanitized delivery (models exact, hidden labels neutral, no key); autosave and
reload in chunks restore exactly; idempotent submit; hand-derived ledgers **PERFECT 28 · PARTIAL 10 · BLANK 0 · ATTACKER 0** (eight
forged answers refused with their codes, nothing stored); regrading is repeatable; teacher review (real labels, key, stored answer,
marks; save keeps 10 / final). Uploads: submit-review is refused (422 `MESH_ASSET_UNAVAILABLE`) while the upload is missing; with the
asset stored the exam publishes, delivers the content-addressed reference and grades; missing bytes, corrupted bytes at rest, a length
mismatch and an unlabelled part are each reported.

**Real Chromium** (`scripts/check-mesh-exam-browser-21db3.mjs`, third step of the 21D-B WebGL workflow): **27 / 27** locally. It covers:
- the six-question exam page from the student projection; hidden-label questions list neutral names; no key in the student DOM;
- a click on the heart selects the front-most labelled part (GPU pick); single / multiple / limit through the lists; every change is
  autosaved through the shared server binding; a forged answer is refused; a **reload restores every answer**; the restored answers
  grade to full marks with no manual review;
- scrolling the whole exam keeps **≤ 3 live GL contexts** (≤ 2 on a phone); each library file is downloaded **once** per page;
- **context loss** mid-exam: status, automatic restore, the saved answer unchanged;
- **20 mount / unmount cycles** of the exam: no live renderer left, at most **1.9 MiB** JS heap growth after GC (bound 24 MiB);
- **low-memory phone** (deviceMemory 2, DPR 3): drawing buffer capped at 2× (676 × 642 for 338 × 321 CSS px), tap-to-answer, no
  horizontal overflow at 390 px;
- **WebGL unavailable:** a meaningful note, and the whole exam is answered through the parts lists and grades to full marks;
- the teacher review shows every answer exact and the real label of the hidden-label answer; no page error, no foreign host.

**Measured** (headless Chromium, SwiftShader CPU rendering, no GPU):

| Figure | Value |
|---|---|
| First model ready (desktop, from navigation, 6-question page) | 0.78–0.91 s (three runs) |
| First model ready (phone, DPR 2 buffer) | 0.48–0.54 s |
| Bytes downloaded for the six questions | 4,533,132 (heart 2,001,400 + brain 2,531,732, once each) |
| GPU memory per live viewer (desktop canvas) | 2.5 MB |
| Live GL contexts while scrolling | max 3 (desktop), 2 (phone) |
| JS heap growth after 20 exam mount / unmount cycles (after GC) | −0.1 to 1.9 MiB |

**Mutation proof (B.3):** 23 mutants were planted, one at a time, with each file restored byte-for-byte (SHA-256 verified); `git status`
was clean before and after.

| Id | Mutant | Verdict |
|---|---|---|
| B3-01 | scoring: an all-or-nothing superset earns full marks | KILLED (after strengthening, see below) |
| B3-02 | scoring: partial credit ignores wrong extras | KILLED |
| B3-03 | fail closed: unclassifiable → silent zero | KILLED |
| B3-04 | binding: unlabelled part accepted | KILLED |
| B3-05 | binding: another model's answer accepted | KILLED |
| B3-06 | projection: hidden labels sent | KILLED |
| B3-07 | key: unlabelled correct part accepted | KILLED |
| B3-08 | binding: more parts than allowed | KILLED |
| B3-09 | config: raw HTML instruction accepted | KILLED |
| B3-10 | sanitizer: mesh config not projected | KILLED |
| B3-11 | ingest: mesh answers not bound | KILLED |
| B3-12 | grading: no server grader | KILLED |
| B3-13 | governance: missing upload published | KILLED |
| B3-14 | store gate: missing / corrupted bytes pass | KILLED |
| B3-15 | store gate: unlabelled part passes | KILLED |
| B3-16 | store gate: length mismatch passes | KILLED |
| B3-17 | firstN: empty selection takes a slot | KILLED |
| B3-18 | review: payload lacks the model | KILLED |
| B3-19 | editor: key keeps parts no longer labelled | KILLED |
| B3-20 | editor: single choice keeps several parts | KILLED |
| B3-21 | client: empty selection counts as answered | KILLED |
| B3-22 | student: another model's answer shown | KILLED |
| B3-23 | bundle: theme preview static again | KILLED |

B3-01 survived the first run (no question had a limit above its key) and was treated as a finding: the domain suite now asserts that
every correct part plus a wrong one scores 0 under all-or-nothing and is not exact in the evaluation.

**Fail-first:** not applicable — B.3 adds a feature and fixes no defect. The mutation round is the evidence that the new tests detect
defects.

### 15.7 Limitations (B.3)

- Hidden labels are pedagogical (see §15.1); a determined student can read part ids from the page or the GLB node names.
- A mesh question cannot be a compound part or a composite child, and the AI composer cannot author one (by design; additive later as
  a new version).
- Performance figures are from CPU rendering (SwiftShader); a real GPU is faster. Real-device testing on low-end phones was not
  possible here.
- Changing the model of a published question is a new exam revision (models are pinned by hash); answers saved against a previous
  model are refused by the binding, never re-mapped.

## 16. Phase 21D-B.3 — final certification on `main` after B.1 and B.2 merged

### 16.1 Reconciliation

- **Baseline.** `origin/main` = `ef780e2` (merge of #287, B.2). Its tree equals the reconciled B.2 head `cbc8ebc`, which itself contains
  B.1 (#286 → `a8c860a`), the scene3DSelection hotfix (#288) and the parametric test fix (#289). Exact-main CI on `ef780e2`: Quality Gate
  ✅, Runner ✅, Build and Deploy (production, the owner's merge) ✅.
- **Merge.** `657370d` is a normal merge commit (`git merge origin/main`, parents `68cab11` + `ef780e2`). There was no rebase, no
  force-push and no history rewrite.
- **What main brought.** Since this branch's last B.2 merge (`7eaf608`), main's only new content was #288 (4 files).
- **Conflicts.** Two, each an adjacent one-line addition for a different question type, resolved as the **union** of both sides:

  | File | Kept |
  |---|---|
  | `api/src/lib/exam-structure.js` › `isResponseAnswered` | #288's `scene3DSelection` case **and** B.3's `meshPartSelection` case |
  | `api/src/functions/assignment-review.js` › `chartReviewFields` | #288's `scene3DSelection` **and** B.3's `meshPartSelection` teacher-only payload |

- **Proofs.**
  - `git diff ef780e2 657370d` equals the reviewed B.3 diff `git diff 7eaf608 68cab11` byte for byte on every file except the two
    resolved lines: 77 files, +2,549 / −59 on both sides.
  - `git diff 68cab11 657370d` equals main's delta `git diff 7eaf608 ef780e2` on every other file.
  - Mutants B3-24 / B3-25 / B3-26 (below) show that each side of the resolution is guarded by its own test.

### 16.2 End-to-end audit of `meshPartSelection@1`

Each requested aspect was traced in the code and tied to executed evidence. **No product defect was found.**

**Teacher**
- The question editor (production `MeshPartSelectionEditor`) works in real Chromium. It was certified for:
  - library heart: single and multiple mode, limit, partial scoring, correct parts, instruction, a renamed part, a captured starting
    view, hidden labels;
  - the key following the labelled parts: removing a correct part drops it with a notice;
  - a teacher-uploaded model loaded from its content-addressed API route, after confirmation;
  - the builder's real import → save → export → import round trip, exact for both the library and the uploaded question;
  - RTL layout with no overflow on desktop and at 390 px.
- The App-owned upload service reaches the editor through context; the token is never seen.
- Upload is builder-authenticated and validated server-side by the shared GLB authority.

**Student**
- The renderer projects the config through the shared authority.
- The parts list stays usable in every load state, including fallback and error: `canSelect` depends only on `disabled`. A failing model
  or missing WebGL never blocks an answer.
- Answers carry part ids only. The camera is presentation state. Certified on the exam page: rotate (drag and button), zoom (button and
  Ctrl+wheel) and reset leave the saved answers byte-identical.

**Review**
- `MeshPartSelectionReview` re-evaluates with the server's authority and shows the real labels, also for hidden-label questions.
- The payload reaches the teacher only (`chartReviewFields`).

**Grading** — all decided by the server (`question-type-graders.js` → shared `scoreMeshPartSelection`):

| Requested case | Behaviour | Evidence |
|---|---|---|
| exact (all-or-nothing) | full marks | domain suite; PERFECT ledger 28 |
| superset / miss (all-or-nothing) | 0 | domain suite (B3-01 killed) |
| partial (IoU) | max·hits/\|selected ∪ correct\|; guess-all never pays | domain suite (B3-02); authoring Chromium 4 / 2 / 4⁄3 / 0 |
| empty | 0, never a review | BLANK ledger 0 |
| nonexistent part id | refused at ingest (`MESH_SELECTION_PART_UNKNOWN`) | ATTACKER (B3-04) |
| duplicated id | refused (`MESH_SELECTION_DUPLICATE`) | ATTACKER |
| other model | refused (`MESH_SELECTION_MODEL_MISMATCH`) | ATTACKER (B3-05) |
| forged shape: score / camera / pixels / prototype key | refused (`MESH_SELECTION_ANSWER_INVALID`) | ATTACKER |
| over the limit | refused (`MESH_SELECTION_TOO_MANY`) | ATTACKER (B3-08) |
| a mesh answer on another type, or an unknown question | refused (`MESH_SELECTION_QUESTION_MISMATCH`) | ATTACKER |
| unsupported asset reference (outside the reviewed library, external URL, executable field) | refused at finalization | lifecycle |
| unavailable / corrupted / mismatched upload, missing labelled part | publication refused (422 `MESH_ASSET_UNAVAILABLE`); grading never depends on bytes | lifecycle gate (B3-13…16) |
| `firstNAnswered` | a non-empty selection takes a slot, an empty one does not | lifecycle (B3-17, B3-26) |
| `all` | every question counted | the acceptance exam (three `all` sections) |
| autosave → reload → submit | exact restore in canonical order; idempotent submit; regrade repeatable | lifecycle + Chromium reload |
| authority cannot be established | that question → teacher review (0 + manual-review marks, not finalized), never an automatic mark or a silent zero | **new** lifecycle test (18 auto + 10 manual on a forged snapshot); kills the fail-closed mutant alone |

**Assets**
- Content-addressed SHA-256 at upload, at rest (store gate) and in the browser (before parsing).
- The shared GLB schema and binary authority, size and geometry limits.
- Library references pinned by id, version and hash against the catalog.
- No external URL: the URL is derived from the hash.
- Attribution and licence shown in the viewer's provenance panel.
- No key in the student payload: the sanitizer projection is mutant-checked (B3-10), with a DOM scan in Chromium.

### 16.3 Gap found and closed: the mesh lazy-bundle guard could become vacuous

**The gap.**
- B.1 and B.2 shipped the WebGL viewer unwired, so `check-bundle-budget.mjs` tolerated absent mesh signatures (`main`: "0 lazy chunks").
- B.3 wires the viewer into the product, so a renamed class name or test id would have silently emptied the guard.

**Proof on the B.3 build.** With four of its five signatures renamed in the built chunks, the previous guard still printed "bundle guard
passed".

**The fix.**
- Every mesh signature must now be **found** in a lazy chunk, as the interactive 3D guard already requires.
- The meshPartSelection editor, student renderer and review test ids joined the signature list.
- On the renamed build the new guard fails once per missing signature. The real build passes: 5 lazy mesh chunks, none in the initial
  graph or the Student Portal static closure.

This tightens the guard and loosens nothing; the 128,000-byte budget is unchanged.

### 16.4 Results on the final head

| Check | Result |
|---|---|
| Root suite `npx vitest run` | **890 / 890 files, 11,641 / 11,641 tests** |
| Lifecycle certification (21DB3) | 17 + fixture drift 2 = **19 / 19** (PERFECT 28 · PARTIAL 10 · BLANK 0 · ATTACKER 0) |
| `#288` hotfix suites + B.3 focused suites | 87 / 87 after the merge |
| `npx tsc -b` · `npm run lint` · `git diff --check` | exit 0 · exit 0 (116 warnings, as on `main`) · clean |
| `npm run build` + bundle guard | passed; initial JS graph **112,511 B** gzip (9 files; `main` 127,805 B; budget 128,000) |
| Real Chromium — B.1 viewer / anatomy + editor / **exam** | **37 / 37 · 32 / 32 · 37 / 37** |
| Mutation campaign (B3-01 … B3-26), restore SHA-verified, `git status` unchanged | **26 / 26 KILLED**, plus the new platform fail-closed test killing B3-03 on its own |
| Assets | GLB files, NOTICE, PROVENANCE, manifest, catalog and converter byte-identical to `main`; both files content-addressed |

**New mutants:**

| Id | Mutant | Verdict | Killed by |
|---|---|---|---|
| B3-24 | #288's `scene3DSelection` firstN case lost in the resolution | KILLED | `scene3d-first-n-answered-hotfix` |
| B3-25 | #288's teacher-review 3D payload lost in the resolution | KILLED | `scene3d-review-config-hotfix` |
| B3-26 | B.3's `meshPartSelection` firstN case lost in the resolution | KILLED | 21DB3 lifecycle (firstN) |

**Exam Chromium** (37 checks):
- the 27 of §15.6;
- 1 exam-page camera check;
- 9 teacher-authoring checks.

**Measured** (SwiftShader):

| Figure | Value |
|---|---|
| First model ready (desktop) | 855 ms |
| First model ready (phone) | 613 ms |
| Downloaded per exam | 4,533,132 B, each file once |
| GPU per live viewer | 2.5 MB |
| Live contexts | ≤ 3 desktop, ≤ 2 phone |
| Heap growth after 20 exam mount cycles | 1.8 MiB |

Exact-head CI and the PR-preview results are recorded in the PR body: they run on the commit that carries this record.
