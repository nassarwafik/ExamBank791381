# Phase 20A.1 — Universal SmartSim Contract Hardening

Status: implemented on `feature/20a1-universal-smartsim-contract` (baseline `a48d108`, the merge of #264). Owner review required before
merge.

## 1. Design goals

Phase 20A/20B built a trusted plugin framework (`smartSim@1`) and its first plugin (`networkTopology@1`). 20A.1 hardens the
**contracts** so that future simulators in networking, mathematics, physics, chemistry, biology, geography and other subjects plug
in as:

1. repository-owned plugin code;
2. safe JSON configuration;
3. optional trusted assets;
4. semantic actions;
5. a replay-derived canonical state;
6. typed grading checks;
7. a lazy UI implementation;

— without redesigning ExamBank. This phase builds **platform infrastructure only**. It ships no new production plugin, no
renderer, no 3D library, no asset and no domain science.

## 2. One question type: `smartSim@1`

The question-type catalog stays at **24**. "Physics simulation", "math simulation", "biology simulation" and similar are **not**
question types; they are SmartSim plugins selected by an exact `(pluginKey, pluginVersion)`. The persisted envelope is unchanged
and byte-compatible:

```json
{ "schemaVersion": 1, "pluginKey": "networkTopology", "pluginVersion": 1, "config": { … } }
```

There is no new required envelope field and no migration. The descriptor, capabilities and rules live in **code**. An envelope
that tries to carry `descriptor`, `capabilities`, `rules`, `component` or `module` is refused (`SMARTSIM_ENVELOPE_UNKNOWN_KEY`).

## 3. Code-owned plugin trust (unchanged principle, stronger contract)

```
                     SmartSim Core (trustedSimRegistry / trustedSimQuestion)
                          │
        ┌─────────────────┼──────────────────────────────┐
   Vocabulary + Descriptor   Generic trusted rules     Trusted asset registry
        └─────────────────┼──────────────────────────────┘
                    Plugin registry (exact identity)
          ┌───────────────┼───────────────┐
      Networking       Physics          Math …   (repository plugins)
```

- **The core owns:** identities, versions, bounds, capability vocabulary, the safe scene schema, trusted asset references,
  semantic-action rules, the small generic rule library, replay, scoring, security and discovery metadata.
- **The plugin owns:** domain science, the canonical domain state, its domain actions and checks, and its
  renderer/editor/review UI.
- **JSON never owns executable behaviour.**

## 4. Envelope stability

`SmartSimEnvelopeV1` is unchanged. `networkTopology@1` keeps its own config, state, actions, connectivity, router CLI and
grading. It does not use the universal scene, and nothing about it migrates. Pins:

- the template envelope validates and its student projection is **byte-identical** to the input;
- the full two-LAN exercise still grades **23 / 23** through `gradeExam`;
- the question finalizes;
- the catalog has 24 types.

## 5. The plugin descriptor (`src/trustedSimDescriptor.ts`)

```ts
type SmartSimPluginDescriptorV1 = {
  descriptorVersion: 1; key; version; label; domain;
  sceneKinds; rendererFamilies; capabilities; actionKinds; checkKinds; genericRules; assetKinds; tools; accessibility;
  supports: { autosave; restore; reset; partialCredit; offline; twoDimensional; threeDimensional };
};
```

- **Origin:** code only. A plugin object must carry `descriptor`. `registerSmartSimPlugin` validates it strictly and checks it
  against the plugin's own code: key, version and label must match, and `checkKinds` must equal the plugin's check kinds. It is
  stored **deep-frozen**.
- **Strict validation:**
  - exact keys (an extra `component` / `module` / `rendererModule` / `url` key is refused);
  - every list item from the versioned vocabulary, no duplicates, at most 64 items;
  - `actionKinds` must be non-empty and never a presentation gesture (`camera.*`, `view.*`, `pointer.*`, …);
  - every `genericRules` entry must be an existing exact rule id and must not also be a plugin check kind;
  - `sceneKinds`, the `scene.2d`/`scene.3d` capabilities and the `supports` flags must agree.
- **Exact resolution:** `resolveSmartSimDescriptor(key, version)`. A v2 descriptor never answers for v1. There is no "latest"
  and no coercion.
- **Data-only listing:** `listSmartSimPluginDescriptors()` returns fresh plain-JSON copies sorted by identity. Mutating a
  listing never changes the registry.
- **`networkTopology@1` declares:**

  | Field | Value |
  |---|---|
  | domain | `networking` |
  | sceneKinds | 2D only |
  | renderer families | `svg2d` / `terminal` / `form` |
  | capabilities | `scene.2d`, `object.select`, `object.label`, `network.links`, `network.cli`, `network.hostConfig`, `network.ping` |
  | actionKinds | its six action types |
  | checkKinds | its 19 check kinds |
  | genericRules | none |
  | assetKinds | none |
  | accessibility | `keyboardAlternative`, `objectList`, `semanticLabels`, `toolLabels`, `textTranscript` |

## 6. Capabilities and the vocabulary (`src/trustedSimVocabulary.ts`)

`SMART_SIM_VOCABULARY_VERSION = 1`. Capabilities are **metadata**: they describe what repository code supports and never switch
behaviour on.

- **Capabilities:**
  - scene and camera: `scene.2d|3d`, `camera.pan|zoom|rotate`;
  - interaction: `object.select|drag|label`, `point.place`, `line.draw`, `region.select`;
  - graphs: `graph.2d|3d`;
  - networking: `network.cli|links|hostConfig|ping`;
  - simulation: `simulation.play|pause|scrub`;
  - measurement: `measure.distance|angle|elevation`;
  - other: `value.set`, `sequence.order`;
  - assets: `asset.image|mesh3d|texture|dataset|map|terrain|molecule|anatomy`.
- **Domains:** `networking`, `mathematics`, `physics`, `chemistry`, `biology`, `geography`, `general`. These are authoring
  metadata only and have zero grading authority.
- **Renderer families:** `custom`, `svg2d`, `canvas2d`, `graph2d`, `webgl3d`, `map2d`, `table`, `terminal`, `form`.
- **Tools:** `select`, `drag`, `placePoint`, `drawLine`, `measure*`, `rotateView`/`zoomView`/`panView`, `play`/`pause`/`scrub`,
  `connect`, `terminal`, `form`, `probe`, `label`.
- **Accessibility features:** `keyboardAlternative`, `semanticLabels`, `objectList`, `toolLabels`, `textTranscript`.

**Naming and versioning policy:**

- names are lowercase and namespaced (`area.ability`);
- additions are **additive**;
- an existing name never changes meaning;
- a removal or a change of meaning requires `SMART_SIM_VOCABULARY_VERSION = 2`.

## 7. The universal scene (`src/trustedSimScene.ts`)

`SmartSimSceneV1 = { v: 1, space: "2d" | "3d", objects, relations?, camera? }` is an **optional** library a future plugin may
embed in its config.

- **Objects:** `{ id, primitive, label?, semanticLabel?, transform?, asset?, parent?, tags? }`.
  - The `id` is a stable semantic identity (`^[A-Za-z][A-Za-z0-9_-]{0,63}$`, never a prototype name). Ids are unique. Grading
    never uses an array index, a pixel or a DOM id.
  - **Primitives** (presentation/interaction only, never domain science): `point`, `line`, `segment`, `vector`, `curve`,
    `surface`, `region`, `node`, `edge`, `label`, `image`, `mesh`, `body`, `marker`, `group`. The core never interprets
    "router", "atom" or "liver"; plugins map their domain objects to primitives.
  - **Transforms** are finite and bounded:
    - 2D: `{ x, y, rotation?, scale? }`;
    - 3D: `{ x, y, z, rotation?: {x, y, z}, scale?: number | {x, y, z} }`;
    - coordinates are at most ±1e6, rotations at most ±360, scale is in (0, 1000];
    - there are no matrices and no wrong-dimension values.
  - **Parents** must reference an existing container (`group` / `mesh` / `body` / `region`). Cycles are refused.
  - **Assets** are only on `mesh` (`mesh3d`/`anatomy`/`terrain`/`molecule`) and `image` (`image`/`texture`/`map`), where they
    are required. They resolve exactly in the trusted registry.
- **Relations** `{ id, kind, from, to }` are DATA (`connectedTo`, `contains`, `parentOf`, `labelFor`). They need existing,
  distinct endpoints and unique ids, and are canonicalized by id. Geometric relations (parallel, tangent, …) are domain
  semantics and stay in plugins.
- **Camera** (presentation only):
  - 2D: `{ center, zoom }`;
  - 3D: `{ position, target, fov?, zoom? }`;
  - `semanticScene()` drops it.
- **Strict allow-lists at every level.** `script`, `html`, `srcdoc`, `module`, `component`, `rendererModule`, `grader`,
  `handler`, `onClick`, `onLoad`, `eval`, `function`, `shaderSource`, `url`, `href`, `src`, … are refused (not stripped) on the
  scene, objects, transforms, relations and camera. Labels are bounded text without control characters and are rendered as
  text.
- **Bounds:**

  | Item | Limit |
  |---|---|
  | objects | 500 |
  | relations | 1000 |
  | id length | 64 |
  | label length | 120 |
  | semantic label length | 200 |
  | tags | 16 |

- **Deterministic canonical form:** canonical key order, authored object order kept (it is draw/list order), relations sorted.
  Validation is idempotent.

## 8. 2D / 3D readiness

3D is **architecturally ready, not rendered**:

- a 3D scene contract, 3D transforms and a 3D camera;
- the camera capabilities;
- the `mesh3d`/`terrain`/`anatomy` asset kinds;
- the `webgl3d` renderer family;
- semantic selection and placement actions.

`package.json` gains no 3D dependency, the initial bundle is unchanged (119.4 KB gzip before and after, budget 125 KB), and the
first real 3D plugin phase will add WebGL behind its own lazy edge.

## 9. Trusted assets (`src/trustedSimAssets.ts`)

- **Registry:** code-owned metadata `{ key, version, kind, mime, byteSize, sha256, source, capabilities }`, registered only by
  repository code. The production registry is **empty**; no asset file is added in this phase.
  - **Kinds:** `image`, `mesh3d`, `texture`, `dataset`, `map`, `terrain`, `molecule`, `anatomy`. There is no SVG, HTML, script,
    shader or wasm kind.
  - **MIME types** are allow-listed per kind: raster images, `model/gltf-binary`, JSON or octet-stream.
  - **`source`** is a *logical* repository-relative name (lowercase segments, single slashes, one safe extension). It is never
    a URL, an absolute path, a `..` traversal or a scheme (`javascript:`, `data:`, `file:`, `blob:`, `http(s):`).
  - Size is at most 64 MiB. The sha256 is required. Duplicate identities are refused.
- **Reference** from exam JSON: `{ assetKey, assetVersion[, kind][, sha256] }`. Exact keys, resolved exactly
  (`human-body@1 ≠ human-body@2`).
  - An unknown asset fails closed with `SMARTSIM_ASSET_UNKNOWN`, with no substitution even when another version exists.
  - A sha256 or kind mismatch, or a missing required capability, is refused.
  - URL-like or path-like keys and extra keys (`url`, `src`, `href`, `path`, `module`, `script`) give `SMARTSIM_ASSET_REF_INVALID`.
- **Plugin constraint:** a plugin's universal config may only use asset kinds its descriptor declares (`SMARTSIM_ASSET_KIND_UNDECLARED`).

## 10. Semantic actions (`src/trustedSimSemanticActions.ts`)

The academic truth is a list of **semantic** actions (`object.select {objectId}`, `point.place {pointId, position}`,
`value.set {valueId, value}`, `router.command {deviceId, command}`). Gestures are never academic:

- `camera.*`, `view.*`, `pointer.*`, `mouse.*`, `wheel.*`, `hover.*`, `ui.*`, `render.*`, `touch.*` and `key.*` action types are
  refused by the **core replay** for every plugin (`SMARTSIM_ACTION_PRESENTATION_ONLY`);
- a descriptor cannot declare them as action kinds;
- extra keys such as `screenX` or `triangleId` are refused by strict action shapes.

**Optional universal building blocks** for future plugins (`networkTopology@1` does not use them):

- **Config:** `{ v: 1, scene, requiredCapabilities? }`, validated against the descriptor. JSON can only *require* capabilities
  the plugin declared and can never grant one (`SMARTSIM_CAPABILITY_UNDECLARED` / `_UNKNOWN` / `_DUPLICATE`). The scene space
  must be a declared scene kind. Unknown keys such as `rules`, `renderer`, `component`, `module`, `capabilities` or `descriptor`
  are refused.
- **Universal action kinds:** `object.select`, `object.deselect`, `point.place` (on `point`/`marker` objects, in the scene's
  dimension), `value.set` (finite, bounded at ±1e9), `sequence.push` and `sequence.clear`. A plugin can only use the ones it
  declared.
- **Neutral replay state:** `{ v: 1, selected (sorted), points, values (sorted keys), sequence }`. It is pure and deterministic.

## 11. Presentation vs canonical state

| | Scene | Canonical state |
|---|---|---|
| What | the authored, public world description | the academically meaningful, replay-derived result |
| Who writes it | the teacher (validated JSON) | the server, from semantic actions |
| Example (anatomy) | a mesh asset with millions of triangles + organ regions | `{ "selected": ["liver"] }` |
| Example (function graph) | thousands of sampled points | `{ "markers": { "extremum1": { "x": 2, "y": 3 } } }` |

Camera angle, zoom, pan, UI tabs, hover, panels, palette position, animation frame and render resolution never enter canonical
graded state. Tests pin this: two questions that differ only by camera grade identically, and every gesture is refused.

## 12. The generic trusted rule library (`src/trustedSimRules.ts`)

Seven exactly versioned rules, fixed in code (JSON can never add one):

| Rule | Params | Fact |
|---|---|---|
| `objectSelected@1` | `objectId` | selected / not selected |
| `objectNotSelected@1` | `objectId` | inverse |
| `setEquals@1` | `expectedIds` (0–500, unique) | order-insensitive set of selected ids |
| `orderEquals@1` | `expectedIds` (1–500, unique) | exact sequence |
| `numericNear@1` | `valueId`, `expected`, `tolerance ≥ 0` | `|v − e| ≤ tol` |
| `pointNear@1` | `pointId`, `expected {x, y[, z]}`, `tolerance > 0` | Euclidean distance ≤ tol, same dimension |
| `relationExists@1` | `relation`, `from`, `to` | the relation is present |

- **Parameters** are strict: exact keys, finite bounded numbers, no strings as numbers, no expressions.
- **References** must exist in the plugin's neutral **rule view** of the initial state (`SMARTSIM_RULE_REFERENCE_UNKNOWN`).
- **Evaluation** is pure and deterministic and returns **facts** (expected / actual / passed / evidence). The core computes
  marks from the teacher's weights.
- **Opt-in:**
  - a plugin may use a rule only when its descriptor's `genericRules` lists that exact id and it provides
    `ruleView(state, config)`;
  - otherwise the check kind is unknown: finalization blocks and grading fails closed with manual review;
  - `networkTopology@1` opts into none;
  - `perfectScore`, `objectSelected` (unversioned) and `objectSelected@2` are all refused.

## 13. Plugin-specific science

These are **not** in the core: `networkReachable`, `equationBalanced`, `newtonForceBalanced`, `orbitalConfigurationValid`,
`functionHasAsymptote`, `moleculeValenceValid`, `terrainWatershedCorrect`. They are domain check kinds in their plugins, as
`networkTopology@1` already does with `reachability`. A test scans the rule module for domain words to keep it neutral.

## 14. The AI-composer catalog (`src/trustedSimCatalog.ts`)

`smartSimAuthoringCatalog()` returns:

```
{ catalogVersion: 1, vocabularyVersion: 1, descriptorVersion: 1, plugins: [descriptor metadata …], genericRules: [{ id, kind, version, params }], capabilities: [...] }
```

- **Plain data, built field by field:** no function, no module path, no component name, no grader, no secret, nothing from any
  question.
- **Future workflow:**

  ```
  teacher prompt → AI chooses an EXISTING plugin from the catalog → AI proposes JSON config + private checks
                 → canonical validators (envelope, descriptor-bound config, check kinds, rule params) → teacher review → finalization
  ```

  The AI never generates runtime code, registers a plugin, creates a grader or bypasses validation. The AI authoring UI itself
  is deferred.

## 15. Security summary

- **Strict allow-lists, not deny-lists.** Every new schema (scene, config, descriptor, asset record and reference, rule
  parameters) accepts only listed keys and types.
- **No dynamic code anywhere:** no `eval`, `new Function`, dynamic `import()`, `require`, `fetch`, timers, randomness or DOM in
  the new modules or their server copies (tests scan both).
- **The UI registry** still resolves only through literal repository `import("../…")` edges (pinned).
- **No identity can be spoofed.** Capabilities, rules, assets, descriptors and plugin versions are exact and code-owned.
- **Forged client state never earns marks:** the server replays and the rule view is built from the replayed state. A forged
  state earns nothing beyond the initial state.
- **`simulation@1` is unchanged.** It stays untrusted, sandboxed and manual. A manifest that claims `scene.3d`, `trusted`, a
  `pluginKey` or a `descriptor` keeps exactly its five capability booleans, gains no plugin identity, and the grader remains
  `0 + manual review` (pinned).

## 16. Exact versioning

There is no "latest", "nearest", fallback or coercion for:

- plugins (`key@version`);
- descriptors (`descriptorVersion: 1`, resolved by plugin identity);
- the scene (`v: 1`);
- assets (`assetKey@assetVersion` + sha256);
- generic rules (`kind@version`);
- the vocabulary (`SMART_SIM_VOCABULARY_VERSION`).

An unsupported future identity fails closed.

## 17. Adding a new trusted SmartSim plugin

1. **Implement the pure authority** in `src/<plugin>.ts`: `validateConfig` (optionally `validateUniversalSimConfig(raw,
   descriptor)` plus your own domain fields), `createRuntime`, `normalizeAction` (optionally `normalizeUniversalAction`),
   `applyAction`, `canonicalState`, `serializeState`, `validateCheck` / `evaluateCheck` for **domain** check kinds, and
   optionally `ruleView` + `reviewDetails`.
2. **Declare the exact descriptor** next to the code (domain, scene kinds, renderer families, capabilities, action kinds, check
   kinds, opt-in generic rules, asset kinds, tools, accessibility, supports).
3. **Register it** with one line in `src/trustedSimPlugins.ts`.
4. **Register trusted asset metadata** for any assets it needs, in code (exact key, version, sha256, logical source).
5. **Add a literal lazy UI entry** in `src/trustedSim/smartSimUiRegistry.ts` (workspace, editor, review details). It must
   provide a semantic, keyboard-reachable interaction path (object list, labelled tools), as `networkTopology@1` does with its
   device list.
6. **Add the module to `SHARED_ENTRIES`** in `scripts/build-shared-finalization.mjs` and regenerate.
7. **Add tests** (fail-first, security, cross-surface parity) and **run mutations** on its authority.

No change to the SmartSim core, the question type, the catalog, ingest, grading or review is normally needed.

### Examples (one architecture across subjects)

- **Networking (`networkTopology@1`, production):** topology config plus per-device CLI. Actions: `pc.*`, `switch.command`,
  `router.command`. Domain checks such as `reachability` and `router.ipAddress`. No generic rules.
- **Physics (`physicsMotion@1` / `freeFall@1`):** scene `body` + `marker` objects, capabilities
  `simulation.play/pause/scrub` and `point.place`. Actions: `value.set` (drop time) and `point.place` (impact point). Checks:
  `numericNear@1` and `pointNear@1`, plus a plugin-owned `motionConsistent` if needed. Gravity and Newtonian equations live in
  the plugin.
- **Mathematics 2D (`functionGraph@1`):** scene `curve` + `marker` objects, actions `point.place` (extremum, intercept),
  checks `pointNear@1`. Function evaluation lives in the plugin, never as JSON expressions.
- **Mathematics 3D (`functionSurface3d@1`):** 3D scene `surface` + `point`, capabilities `camera.rotate/zoom` and
  `object.select`, actions `point.place {x, y, z}`, checks `pointNear@1` in 3D. The camera never grades.
- **Chemistry, equation balancing (`chemistryEquation@1`):** species as `label` objects, actions `value.set` on coefficients,
  checks `numericNear@1` per coefficient plus a plugin-owned `equationBalanced`.
- **Chemistry, periodic table (`periodicTable@1`):** element symbols (`H`, `He`, `Li`, …) as semantic ids, actions
  `object.select`, checks `setEquals@1` (e.g. the alkali metals). A dataset asset may be added later.
- **Biology 3D (`anatomy3d@1`):** trusted `human-body@1` mesh asset, organ `region` objects, actions
  `object.select {objectId: "liver"}`, checks `objectSelected@1`. Mesh triangle ids are irrelevant; the canonical state is
  `{ selected: ["liver"] }`.
- **Geography (`terrainMap@1`):** trusted `galilee-terrain@1` terrain asset, capabilities `measure.elevation/distance` and
  `point.place`, action `point.place {x, y, z}` (the summit), check `pointNear@1`. Terrain triangles and pixels are never
  answers.

Every example except networking is a **test-only fixture** in `src/trustedSimUniversalFixtures.ts` (imported by no application
module). The cross-domain suites validate their envelopes and grade their semantic actions through the same production
authority.

## 18. Tests

| Suite | What it proves |
|---|---|
| `src/trustedSimUniversal.20a1.test.ts` | vocabulary, descriptor validation, registry requirements, exact descriptor resolution, data-only listing, authoring catalog, envelope compatibility pins, catalog = 24, UI registry literal imports, module source scans |
| `src/trustedSimScene.20a1.test.ts` | scene canonicalization, ids, primitives, allow-lists at every level, transforms, bounds, relations, parents, camera, assets in scenes; semantic actions, gestures, universal config vs descriptor |
| `src/trustedSimAssets.20a1.test.ts` | asset registry, malformed records, exact resolution, references, adversarial URLs / traversal / schemes |
| `src/trustedSimRules.20a1.test.ts` | rule registry, strict params, references, facts, purity, no expression language or domain science |
| `src/trustedSimCrossDomain.20a1.test.ts` | the end-to-end proof (config → action → replay → canonical state → generic rule → score), forged state, camera, unknown rules, exact plugin versions, six future-subject fixtures |
| `api/tests/trusted-smartsim-universal-20a1.test.js` | server: production descriptors / catalog equal the client build, SHARED_ENTRIES and server-copy scans, real `gradeExam` / ingest / sanitizer / finalization with a test plugin, a 3D asset plugin, networkTopology@1 and simulation@1 pins, client/server parity |

## 19. Mutation campaign

Each mutant was run one at a time with exact anchored edits.

- A mutant counts as KILLED only when a behavioural test fails; drift and parity tests never count.
- Every touched file is restored byte-for-byte (SHA-256 verified in a `finally`), and `git status` was clean afterwards.
- `s` variants mutate the committed server copy and are judged by the server suites.

**34 mutants: 34 KILLED, 0 SURVIVED, 0 TIMEOUT**, all on the first run.

| Id | Planted defect | Result | Killed by (first failing group) |
|---|---|---|---|
| M1 | unknown capability accepted in a descriptor | KILLED | 20A.1-D — the plugin DESCRIPTOR: exact, strict, immutable, data only |
| M1b | unknown capability accepted in a universal config | KILLED | 20A.1-A — SEMANTIC actions are the academic truth; gestures and camera never are |
| M2 | duplicate capability / action / check silently accepted (descriptor lists) | KILLED | 20A.1-D — the plugin DESCRIPTOR: exact, strict, immutable, data only |
| M3 | JSON-supplied renderer / component / module path accepted in a universal config | KILLED | 20A.1-A — SEMANTIC actions are the academic truth; gestures and camera never are |
| M3b | scene objects accept component / rendererModule / handler fields | KILLED | 20A.1-S — SmartSimSceneV1: a strict, bounded, data-only world description |
| M4 | unknown asset version falls back to another registered version | KILLED | 20A.1-AS — the code-owned asset registry |
| M5 | external URL / path accepted as a trusted asset key | KILLED | 20A.1-AS — the code-owned asset registry |
| M5b | unsafe logical asset source (traversal / scheme / svg) accepted at registration | KILLED | 20A.1-AS — the code-owned asset registry |
| M6 | duplicate scene object id accepted | KILLED | 20A.1-S — SmartSimSceneV1: a strict, bounded, data-only world description |
| M7 | NaN / Infinity / unbounded coordinates accepted | KILLED | 20A.1-S — SmartSimSceneV1: a strict, bounded, data-only world description |
| M8 | descriptor accepts an unknown / unversioned generic rule id | KILLED | 20A.1-D — the plugin DESCRIPTOR: exact, strict, immutable, data only |
| M8b | rule library treats an unknown rule kind as objectSelected@1 | KILLED | 20A.1-R2 — strict parameters and references (never an expression) |
| M9 | a plugin uses a generic rule it did not opt into (TS core) | KILLED | 20A.1-X1 — the end-to-end proof: JSON → action → replay → canonical state → generic rule → score |
| M9s | a plugin uses a generic rule it did not opt into (server copy) | KILLED | 20A.1-S2 — the end-to-end server proof with a TEST-ONLY universal plugin |
| M10 | camera (presentation) changes the grade via the rule view | KILLED | 20A.1-X1 — the end-to-end proof: JSON → action → replay → canonical state → generic rule → score |
| M10b | presentation gestures are not refused by the core replay (TS) | KILLED | 20A.1-X1 — the end-to-end proof: JSON → action → replay → canonical state → generic rule → score |
| M10s | presentation gestures are not refused by the core replay (server copy → ingest) | KILLED | 20A.1-S2 — the end-to-end server proof with a TEST-ONLY universal plugin |
| M11 | generic rules read the client's forged state instead of the replay (TS) | KILLED | 20A.1-X1 — the end-to-end proof: JSON → action → replay → canonical state → generic rule → score |
| M11s | generic rules read the client's forged state (server copy → gradeExam) | KILLED | 20A.1-S2 — the end-to-end server proof with a TEST-ONLY universal plugin |
| M12 | the persisted envelope must now carry a descriptor (networkTopology@1 breaks) | KILLED | 20B-T5 — private checks graded on SERVER-derived state (the canonical two-LAN exercise) |
| M12s | the persisted envelope must carry a descriptor (server copy) | KILLED | 20B-S1 — authoritative grading of the canonical two-LAN exercise |
| M13 | a simulation@1 package manifest keeps any claimed capability / plugin identity (server copy) | KILLED | 20A.1-S3 — PINS: networkTopology@1 and simulation@1 are unchanged |
| M14 | the authoring catalog spreads the plugin object (functions leak) | KILLED | 20A.1-C — the AUTHORING / AI-composer catalog: safe metadata only |
| M15 | a v2 descriptor answers for v1 (latest-version fallback) | KILLED | 20A.1-D — the plugin DESCRIPTOR: exact, strict, immutable, data only |
| M16 | registration accepts a descriptor whose identity / label disagrees with the plugin | KILLED | 20A.1-D — the plugin DESCRIPTOR: exact, strict, immutable, data only |
| M17 | registration accepts generic rules without a ruleView | KILLED | 20A.1-D — the plugin DESCRIPTOR: exact, strict, immutable, data only |
| M18 | relation to an unknown / identical endpoint accepted | KILLED | 20A.1-S — SmartSimSceneV1: a strict, bounded, data-only world description |
| M19 | an asset kind the plugin never declared is accepted in its config | KILLED | 20A.1-A — SEMANTIC actions are the academic truth; gestures and camera never are |
| M20 | asset sha256 pin mismatch accepted | KILLED | 20A.1-AR — asset REFERENCES in exam JSON |
| M21 | scene object bound dropped (500 → 5000) | KILLED | 20A.1-S — SmartSimSceneV1: a strict, bounded, data-only world description |
| M22 | pointNear ignores a 2D / 3D dimension mismatch | KILLED | 20A.1-R3 — pure evaluators return FACTS (expected / actual / passed / evidence), never marks |
| M23 | numericNear tolerance becomes exclusive | KILLED | 20A.1-X2 — future subjects fit the SAME architecture (test-only fixtures, no core change) |
| M24 | a presentation gesture may be declared as an academic action kind | KILLED | 20A.1-D — the plugin DESCRIPTOR: exact, strict, immutable, data only |
| M25 | descriptor scene kind / capability / supports consistency not enforced | KILLED | 20A.1-D — the plugin DESCRIPTOR: exact, strict, immutable, data only |

## 20. Deferred work

- **Renderers:** the first real 3D/WebGL renderer (with its dependency behind a lazy edge) and the plugin UIs for the examples
  above.
- **Domain science:** Newton/free-fall engines, chemical balancing, function evaluation, periodic-table production UI,
  anatomy and terrain renderers.
- **Assets:** real trusted assets and a trusted asset delivery service (signed URLs from a reviewed store).
- **AI composer:** the AI authoring UI that consumes `smartSimAuthoringCatalog()`.
- **More generic rules,** only when two or more plugins need the same pattern, as new exact ids (`…@1`), never by changing an
  existing rule.
