# Phase 21D-D — Enterprise Chemistry SmartSim (design record)

Status: **D.1 implemented on `feature/phase-21d-d1-chemistry-atomic-molecular`** (baseline `origin/main` = `c59242266acd8376dcad711efa6bfb78918ff1b4`); awaiting independent review.
D.2–D.4 are planned in §9 and will ship as separate pull requests. Nothing is merged by an agent: the owner performs every merge.

This record is the phase record required by `AGENTS.md` §1. Sections §1–§3 are the audit and the architecture decision, §4–§8 describe
D.1 as built, §9 is the plan for D.2–D.4, and §10–§12 hold the verification evidence and the known limitations.

---

## 1. Repository audit (baseline `c592422`)

| Item | Finding (verified by reading the code / running it) |
|---|---|
| Baseline | `origin/main` = `c592422` (merge of #290, B.3). B.1 (#286, `a8c860a`), B.2 (#287, `ef780e2`) and B.3 (#290, `c592422`) are merged; post-merge CI on `c592422` was green (Quality Gate 38068565748, Build and Deploy, Runner 38068565750, recovery sweep). |
| Question type | `smartSim@1` is ONE generic question type. Behaviour comes from **code-owned plugins** registered by exact identity `pluginKey@pluginVersion` (`src/trustedSimRegistry.ts`, production list `src/trustedSimPlugins.ts`). Exam JSON only *names* an identity; an unknown identity resolves to nothing and grading fails closed (`SMART_SIM_FAIL_CLOSED`: 0 + manual review). |
| Persisted shapes | public `question.smartSim = { schemaVersion: 1, pluginKey, pluginVersion, config }`; private `question.answer = { scoring, checks[] }` (removed by the student sanitizer); student answer `{ kind: "smartSim", pluginKey, pluginVersion, actions, state }`. |
| Grading authority | `src/trustedSimQuestion.ts` (compiled into `api/src/lib/shared-finalization/`): the server **replays the semantic actions** through the plugin, discards the client `state`, evaluates the private checks as FACTS and computes weighted points itself. Composite contexts prepare once and evaluate many. A broken student answer is an ordinary zero; a broken envelope / key is a manual-review fail-closed. |
| Generic rules | `src/trustedSimRules.ts`: `objectSelected@1`, `objectNotSelected@1`, `setEquals@1`, `orderEquals@1`, `numericNear@1`, `pointNear@1`, `relationExists@1`, opted into per plugin through the descriptor + a neutral `ruleView`. |
| Descriptor / vocabulary | `src/trustedSimDescriptor.ts`, `src/trustedSimVocabulary.ts`: the domain `chemistry`, capabilities `scene.3d`, `camera.rotate`, `camera.zoom`, `object.select`, `object.label`, `value.set`, the asset kind `molecule` already exist; scene kinds ⇔ `scene.*` capabilities ⇔ `supports` flags are cross-checked. Presentation prefixes (`camera.`, `view.`, `pointer.` …) can never be academic actions. |
| Chemistry today | **No chemistry plugin exists.** Only metadata: the `chemistry` domain, `asset.molecule`, and two *test-only* universal fixtures (`periodicTable`, `chemistryEquation`) in `src/trustedSimUniversalFixtures.ts`. Nothing is assumed beyond that. |
| UI seams | `src/trustedSim/smartSimUiRegistry.ts` (identity → lazy Workspace / Editor / ReviewDetails), `src/trustedSim/smartSimStarters.ts` (starter config), the generic `SmartSimEditor` host, `SmartSimReviewView`. The physics plugins (`physicsLab@1`, 21D-A.2) are the reference pattern (strict config model + plugin + lazy UI + presets + acceptance exam + Chromium check). |
| Server integration | No API module is plugin-specific: the API grades through the shared build. A new plugin = new pure modules in `SHARED_ENTRIES` (`scripts/build-shared-finalization.mjs`, drift-tested) + one registration line. |
| 3D engines | (a) **21C/21D owned SVG renderer** (`src/interactive3d/`): tessellated primitives, painter's algorithm, palette of 8, ≤ 64 objects; (b) **B.1 WebGL2 mesh engine** (`src/meshModels/`): GLB assets by SHA-256, GPU picking, context-loss / low-memory handling; (c) the ONE **orbit-camera controller** `src/interactive3d/orbitCamera.ts` (`useOrbitCamera`: drag, inertia, wheel / pinch, keyboard, Home reset, reduced motion) shared by every owned 3D viewer. |
| Bundle | Initial JS graph measured on `c592422`: **109.9 KB gzip** (guard line `INITIAL_JS_GZIP_BUDGET_KB = 125` = 128,000 B, never raised). `trustedSimPlugins-*.js` and every plugin UI are lazy chunks. Lazy guards are signature lists in `scripts/check-bundle-budget.mjs`. |
| Assets / security | Mesh assets are referenced by pinned SHA-256 and served from the API; SmartSim plugins carry **no asset references** unless their descriptor declares an asset kind. Exam text is sanitized; plugin configs are strict (exact keys, bounded, refuse-not-repair). |

## 2. Architecture decision

1. **Chemistry is a family of trusted SmartSim plugins**, never a new question type, never a second grader, registry, storage or camera.
   D.1 adds ONE new exact identity, **`chemistryStructure@1`** (domain `chemistry`). D.2 / D.3 add their own identities (§9); a published
   question stays bound to the identity it names forever.
2. **Science lives in a pure, shared chemistry core** (`src/chemistry/*`), compiled into the server build: the element catalog, the
   electron-configuration model, the formula parser / composition engine and the molecule catalog. The client, the server ingest, the
   grader and the teacher review run the same code.
3. **Every expected value is DERIVED by trusted code** from validated catalog data and the authored subject (the `physicsLab@1`
   `lab.referenceValue` pattern). A teacher never types the expected number of neutrons, the molar mass or the shape: they choose the
   quantity, and the private check carries only the reference (and, when the target must stay secret, a private *species*). Generic rules
   (`setEquals@1`, `objectSelected@1`, `numericNear@1` …) remain available for teacher-authored facts (e.g. "select the polar bonds").
4. **3D reuse.** The molecule viewer reuses the shared **orbit-camera controller** (`useOrbitCamera`) and renders ball-and-stick
   molecules in an owned SVG layer: an orthographic sphere projects exactly to a circle, so atoms are depth-sorted shaded circles and bonds
   are depth-sorted segments (multiplicity drawn as parallel lines). This is chosen over (a) the 21C primitive tessellator — 8-colour
   palette, 64-object bound, hundreds of polygons per sphere for no scientific gain — and (b) the B.1 WebGL engine — it needs GLB assets, a
   GPU context and its own asset pipeline, while molecules here are procedural, tiny and must always render, including on low-memory phones
   and without WebGL. Consequence: **no WebGL context is created by chemistry**, so context loss and GPU memory pressure cannot affect it;
   the text structure list is always present as the accessible / no-graphics path.
5. **Nothing presentational is graded.** Rotation, zoom, labels, the measuring probe, periodic-table browsing and the exploration of the
   built atom's live identity are presentation; only explicit semantic decisions become actions.

## 3. Educational models, verified facts and modelling assumptions

| Topic | Verified fact (source, retrieved 2026-10-10) | Modelling assumption / limitation (stated in the UI where it matters) |
|---|---|---|
| Elements Z = 1–36 | Standard atomic weights: **CIAAW Abridged Standard Atomic Weights 2024** (https://www.ciaaw.org/abridged-atomic-weights.htm) — every value in `src/chemistry/elements.ts` matches the table (36 / 36). | Abridged values are used as exact decimals; school tables that round (Cl = 35.5) are accommodated by the teacher's tolerance, not by a second table. |
| Isotopes | Naturally occurring isotopes per element: **CIAAW isotopic compositions table** (https://www.ciaaw.org/isotopic-abundances.htm) — every list matches (36 / 36). Two classroom radioisotopes are added and flagged: ³H and ¹⁴C. | A species is accepted only with a catalogued mass number; nuclear stability is not modelled. |
| Electron configurations | Ground-state configurations of the neutral atoms: **NIST ASD, Ground Levels and Ionization Energies** (physics.nist.gov, `ie.pl`). Z ≤ 36 follows the Madelung (n + l) order except **Cr [Ar]3d⁵4s¹** and **Cu [Ar]3d¹⁰4s¹**, both encoded and tested. | Ions: electrons are removed from the highest n first (highest l within n) and added in Madelung order — the standard textbook rule; it reproduces Fe²⁺ [Ar]3d⁶, Fe³⁺ [Ar]3d⁵, Cu²⁺ [Ar]3d⁹ … (tested). |
| Shell diagram | Electrons per principal shell n are the sums of the configuration (K, L, M, N). | **The circles are an educational shell (Bohr-type) diagram, not orbits or trajectories.** The UI says so next to every diagram. Electrons are distributed evenly on a ring only for readability. |
| Simple ions | — | A curriculum list of common monatomic ions (charges −3…+3), e.g. Na⁺, Mg²⁺, Al³⁺, O²⁻, Cl⁻, Fe²⁺/Fe³⁺, Cu⁺/Cu²⁺. Other charges are refused, not computed. |
| Molecule geometry | Experimental bond lengths and angles from **NIST CCCBDB** (Computational Chemistry Comparison and Benchmark DataBase, `expgeom2x.asp`), with the primary reference recorded per molecule in the catalog (Huber & Herzberg 1979, Herzberg 1966, Kuchitsu 1998, Hoy & Bunker 1979, Hirota 1979, NIST diatomic database). | Static equilibrium picture (no vibration). Coordinates are rebuilt from the tabulated lengths / angles and tested to reproduce them. Atom sizes in ball-and-stick are NOT to scale. |
| Bonding / shape | Lewis structures, VSEPR shapes and molecular polarity of the 12 catalog molecules are standard textbook facts; each entry is cross-checked by code: valence-electron count = 2 × bond orders + 2 × lone pairs, octet / duet per atom (BF₃'s boron sextet is a declared exception), VSEPR shape re-derived from domains. | Lewis model limitation stated: O₂ is drawn with a double bond although the molecule is paramagnetic (a triplet), which the Lewis model does not explain. Lone pairs are drawn along idealised domain directions — illustrative, not electron density. |
| Formulas | Formula grammar: element symbols of the catalog (case-sensitive), counts 1–999, parentheses (depth ≤ 3), one hydrate dot. Molar masses are summed in **exact integer arithmetic** (atomic weights × 10⁴). | No charges, isotopes, structural formulas or names are parsed in D.1. |

## 4. D.1 — `chemistryStructure@1` (atomic & molecular structure)

### 4.1 Public configuration (strict, refuse-not-repair)

```
{ v: 1, activity: "atom" | "molecule" | "formula",
  subject:  atom → null | { element, massNumber, charge }      (shown to the student as a given)
            molecule → { molecule }                            (catalog id)
            formula → { formula }                              (validated by the parser; stored in canonical text)
  view:     { periodicTable: "hidden" | "basic" | "detailed", identity: bool, details: bool, measure: bool },
  tasks:    { build: bool, shells: bool, values: [{ id, label, unit }], formulas: [{ id, label }],
              classifications: [{ id, label, property }], selection: null | { label, target: "elements" | "atoms" | "bonds", max } } }
```

Everything in the public config is visible to the student by design; a target that must stay secret lives in a private check (§4.3).

### 4.2 Semantic actions (the only graded input)

`particles.set {protons, neutrons, electrons}` / `particles.clear` · `shells.set {shells: [K, L, M, N]}` / `shells.clear` ·
`value.set {valueId, value}` / `value.clear` · `formula.set {formulaId, text}` / `formula.clear` · `classification.set {taskId, option}` /
`classification.clear` · `object.select {objectId}` / `object.deselect`. Exact keys, declared ids, bounded integers / numbers, formulas
parsed by the trusted parser, the selection bound enforced; at most 500 actions.

### 4.3 Private checks

| Kind | Expected value | Notes |
|---|---|---|
| `chem.particles` | protons / neutrons / electrons of the authored subject or a **private species** | `particles` = which counts must match (partial credit through several checks). |
| `chem.shells` | electrons per shell of the subject or a private `{ element, charge }` | the configuration model of §3. |
| `chem.value` | a derived quantity (atomic number, valence electrons, molar mass, mass %, bond angle …) | absolute tolerance chosen by the teacher. |
| `chem.formula` | the molecular or empirical formula of the subject, or a private target formula | compared by composition (order-independent), never by text. |
| `chem.classification` | block, category, metal class, ion type, VSEPR shape, polarity | derived from the catalog. |
| generic | `objectSelected@1`, `objectNotSelected@1`, `setEquals@1`, `numericNear@1` | teacher-authored facts on the rule view (selection ids + value ids). |

A check whose reference is undefined for the authored subject (e.g. "valence electrons" of a d-block element, "bond angle" of a diatomic
molecule) is **refused at authoring time** — it can never silently award or withhold marks.

## 5. UI (lazy; `src/chemistryStructure/*`)

| Surface | What it does | Accessibility / RTL |
|---|---|---|
| **Atom builder** (`ChemWorkspace`, `AtomModel`) | Counters for p⁺ / n / e⁻ and for electrons per shell K–N are DRAFTS; *حفظ البناء* / *حفظ التوزيع* emit one semantic action each. The SVG shell diagram follows the draft and always carries the note *«تمثيل تعليمي: الدوائر تجمع الإلكترونات حسب رقم الغلاف (n)، وليست مدارات أو مسارات حقيقية …»*. The live identity of the built species (ᴬ_Z X^q, name, “uncatalogued mass number”, “unusual charge”) appears only when the teacher allows it. | number inputs + labelled −/+ buttons; `aria-live` identity; nuclide notation as an LTR island. |
| **Periodic table** (`PeriodicTable`) | 36 cells at their IUPAC (group, period) positions, coloured by category; focus / hover shows the information line (basic or detailed); when the task asks for elements, pressing a cell chooses it (single choice replaces, multiple bounded by `max`). | ONE tab stop (roving `tabindex`), arrows / Home / End move, Enter / Space choose; `aria-pressed`; LTR grid inside its own horizontal scroller (the page never overflows at 390 px). |
| **3D molecule** (`MoleculeView3D`) | Ball-and-stick on the shared `useOrbitCamera` (drag with inertia, Ctrl/after-click wheel, pinch, arrows, +/−, Home, auto-fit by bounding sphere); depth-sorted shaded circles, bonds trimmed to the atom surfaces, double / triple bonds as parallel lines; optional atom labels and (if details are allowed) VSEPR lone-pair directions; a measuring probe (2 atoms → distance in pm, 3 atoms → angle). Selection of atoms / bonds when the task asks for it. | the structure list under the model is the keyboard path (toggle buttons with `aria-pressed`); bidi-isolated probe text; `role="img"` scene with help text; no tap-highlight artefacts on phones. |
| **Formula / values / classifications** | Formula input with LIVE parsing (the trusted parser's Arabic message; save disabled while invalid; canonical text stored); numeric values with explicit save; classification radio groups named per workspace instance. Composition table (CIAAW weights, contributions, molar mass) only when details are allowed. | labelled inputs, `role="alert"` errors, `radiogroup`s. |
| **Teacher editor** (`ChemEditor`) | Activity + classroom presets (²³Na⁺, period 3 / group 17 with a private ³⁵Cl target, water, any catalog molecule, glucose, CuSO₄·5H₂O); the given subject; what the student may see (with “reveals the answer” hints); tasks; PRIVATE checks with the **expected value derived by the trusted core** shown next to every chem check; optional private species per check; scoring; a preview running the real workspace. | RTL, structured (never raw JSON), no overflow at 390 px. |
| **Review** (`ChemReview`) | The given subject and the student's SERVER-derived answers as text. | table with captions. |

## 6. Server, grading and exam lifecycle

* No API module changed. The six pure modules are added to `SHARED_ENTRIES` and compiled into `api/src/lib/shared-finalization/`
  (drift-tested); `src/trustedSimPlugins.ts` registers `chemistryStructure@1` (appended — every existing identity is unchanged).
* The server replays the semantic actions; the client `state`, score and checks are never read; a broken answer is an ordinary zero;
  a broken envelope / key or a check whose reference is undefined fails **closed** (0 + manual review, `finalized: false`) — proven by the
  lifecycle test (`manualReviewMarks: 7`).
* Composite contexts work unchanged (prepare once / evaluate many): the acceptance exam shares an ammonia model between a linked SmartSim
  part and an MCQ.
* The student sanitizer removes `answer` (checks, tolerances, private species, expected selections); the public config carries only the
  given subject — the private ³⁵Cl target of the periodic-table question never leaves the server (lifecycle test).
* Import → save → re-import, finalization, `normalizeDraftAnswers`, `gradeExam` — all through the production authorities.

## 7. Bundle and lazy loading

| Measure (local build of the branch) | Value |
|---|---|
| Initial JS graph | **112,508 B gzip** (9 files; `main` c592422: 112,509 B) — guard line unchanged at 125 KB = 128,000 B |
| `ChemWorkspace-*.js` (workspace + molecule viewer + periodic table + atom model) | 9,437 B gzip (+ `ChemWorkspace-*.css` 2,083 B) |
| `ChemEditor-*.js` / `ChemReview-*.js` | 6,272 B / 1,000 B gzip |
| `trustedSimPlugins-*.js` (lazy; now also the chemistry core) | 23,712 B gzip |

`scripts/check-bundle-budget.mjs` gains a chemistry rule (strengthening only): the UI signatures (`chem-workspace`, `chem-mol-scene`,
`chem-ptable-grid`, `chem-editor`, `chem-review`) never in the initial graph nor in the Student Portal's static closure, the core
signatures (`CHEM_CONFIG_INVALID`, `FORMULA_ELEMENT_UNKNOWN`) never in the initial graph, and every signature must exist in some chunk.
**WebGL is not used**: the Chromium certification counts WebGL context requests (0) and renders the molecule with WebGL disabled; context-loss
and low-GPU-memory certifications therefore do not apply to chemistry (the B.1 engine keeps its own).

## 8. Security and resource bounds

| Concern | Bound / rule |
|---|---|
| Public config | strict exact keys, catalog references only (element symbol, catalogued mass number, common ion, catalog molecule, canonical formula); refuse, never repair. Nothing secret may live in it. |
| Private targets | `species` / `formula` inside private checks only; validated like the subject; stripped from student delivery. |
| Actions | ≤ 500; exact keys; declared ids; particles p ≤ 36, n ≤ 60, e ≤ 40; ≤ 4 shells × ≤ 32 electrons (sum ≤ 40); values finite, \|v\| ≤ 10⁶; formulas parsed (≤ 128 chars input, canonical ≤ 64); options from the code-owned vocabulary; the selection never exceeds `max` at any point of the replay; presentation prefixes refused by the core. |
| Formula parser | ≤ 64 chars, depth ≤ 3, ≤ 2 hydrate dots, counts 1–999, multipliers 2–99, ≤ 10 000 atoms; no charges, brackets, spaces or names. |
| Computation / rendering | catalog of 36 elements and 12 molecules (≤ 6 atoms, ≤ 5 bonds); projection is O(atoms + bonds) per frame; SVG only; no assets, no URLs, no dynamic code. |
| Grading authority | derived references only (or the teacher's generic-rule facts); undefined references refused at authoring time; invalid authority → fail closed to manual review. |

## 9. Plan for D.2–D.4 (separate PRs; dependency: each builds on the merged D.1 core)

| PR | Identity / scope | Depends on |
|---|---|---|
| **D.2 Reactions & Equations** | new identity `chemistryReactions@1`: a curated, validated reaction catalog (no free-form model-generated equations); balancing as a student action (integer coefficients 1–20) checked by **exact integer conservation** of every element and charge; stoichiometry, limiting reactant, theoretical yield with exact rationals; `chem.balanced`, `chem.coefficients`, `chem.limitingReactant` checks. | D.1 formula parser + atomic weights (shared, unchanged). |
| **D.3 Virtual Lab** | new identity `chemistryLab@1`: solutions (c = n / V), dilution (c₁V₁ = c₂V₂), strong acid / base pH (ideal, 25 °C, Kw = 1.0 × 10⁻¹⁴), a validated indicator table, a conceptual strong–strong titration curve, a qualitative temperature / rate model with stated assumptions, observation tables. **Virtual only**: no procedures for real hazardous mixing, synthesis or unsafe experimentation. | D.1 core; the D.2 stoichiometry module for titration equivalence. |
| **D.4 Exam integration** | the chemistry acceptance exam across D.1–D.3 identities in composite contexts, the authoring catalog / AI composer entries (fail-closed), JSON import / export round trips, teacher review, mobile and keyboard certification, the no-graphics fallback, and the grading-authority audit (no automatic marks without an established authority). | D.1–D.3 merged. |

## 10. Verification evidence (D.1)

### 10.1 Science reference tests (`src/chemistry/chemistryCore.21dd1.test.ts`, 19 tests)

Independently transcribed from the primary sources (never produced by the implementation): all 36 CIAAW 2024 abridged atomic weights and
all 36 CIAAW isotope lists; the NIST ASD ground configurations Z = 19–36 (Cr, Cu exceptions); hand-computed molar masses in exact units
(H₂O 18.0150, CO₂ 44.009, NaCl 58.440, C₆H₁₂O₆ 180.156, Ca(OH)₂ 74.092, Al₂(SO₄)₃ 342.132, CuSO₄·5H₂O 249.677, (NH₄)₃PO₄ 149.087,
Mg₃(PO₄)₂ 262.855, Fe₂(SO₄)₃ 399.858 g/mol) and mass percentages (O in H₂O 88.8093 %, C in CO₂ 27.2921 %, Cu in CuSO₄·5H₂O 25.4513 %);
shells of 13 atoms and 21 ions (Fe²⁺ 2,8,14 · Fe³⁺ 2,8,13 · Cu²⁺ 2,8,17 · Cr³⁺ 2,8,11 …); group / period re-derived from the configuration
for all 36 elements; 24 formula refusals with their exact codes; every CCCBDB length (± 0.01 pm) and angle (± 0.001°) reproduced by the
rebuilt coordinates; Lewis electron counts, octets (BF₃ the only declared exception), VSEPR shapes re-derived; deep-frozen catalogs.

### 10.2 Authority, UI, lifecycle and Chromium

| Suite | Result |
|---|---|
| `src/chemistryStructure.21dd1.test.ts` — registration, strict config, actions / replay, derived checks, private species, forgery, fail closed | 15 / 15 |
| `src/chemistryStructure/chemistryUi.21dd1.test.tsx` — real student host on the sanitized question, periodic table keyboard, 3D molecule, formulas, two workspaces on one page, editor, review | 13 / 13 |
| `src/chemistryStructure/chemView.21dd1.test.ts` — projection invariants (fail-first, below) | 2 / 2 |
| `api/tests/certification-21dd1/*` — import → save → re-import, finalization, perfect 43 / partial / blank, attacker, student projection, tampered configs, fail-closed key | 7 / 7 |
| `scripts/check-chemistry-browser-21dd1.mjs` — real Chromium (desktop, phone 390 × 844 DPR 3 touch, WebGL disabled) | 36 / 36 |
| Mutation campaign `scripts/mutate-chemistry-21dd1.mjs` | 43 / 43 KILLED, 0 survived, 0 timeout, restored (sha256 + `git diff`) |
| Root suite `npm test` (on `a37dd47`, code-identical to the head) | 897 / 897 files, 11,698 / 11,698 tests |

Chromium performance: frame interval while dragging the molecule — median 16.7 ms, p95 16.7 ms (59–62 frames); no WebGL context requested.

### 10.3 Defects found by the certification (fail-first)

| Defect | Fail-first test (run on `b04157d`) | Failing assertion | Fix |
|---|---|---|---|
| Bonds painted across the disks of the atoms they join (the O–H bond covered O1; a click aimed at O1 hit the bond) | `chemView.21dd1.test.ts` (2 cases) | `hydrogen b1: expected 0 to be greater than or equal to 27.77`; end-on ethyne drew 3 bonds | bonds trimmed to 0.9 r at both ends; a bond pointing at the viewer is hidden (`ff6bf63`) |
| Two questions with the same classification task id shared ONE radio group (choosing in CO₂ unchecked water) | `chemistryUi.21dd1.test.tsx` › *classification radios of two workspaces are independent groups* | `expected 'chem-shape' not to be 'chem-shape'` | radio names per workspace instance (`useId`) (`ff6bf63`) |

The exact-head CI results are reported in the pull request (not in this file, which would change the head).

## 11. Known limitations (D.1)

* Elements Z = 1–36 only; simple ions = the curated common-ion list (charges −3…+3); mass numbers = natural isotopes + ³H, ¹⁴C (no
  isotopic masses or abundances are used — only A).
* The shell diagram shows electrons per principal shell (≤ 4 shells); no orbital-box or subshell-filling activity in D.1 (the
  configuration is shown as text when the teacher allows details).
* Twelve small catalog molecules; no rings, isomers, conformers, ions or user-built molecules; geometry is a static equilibrium picture;
  atom sizes are not to scale; lone pairs are idealised VSEPR directions; the Lewis model's O₂ limitation is stated in the UI.
* Formula answers are compared by composition (HOH = H₂O); structural formulas, charges and names are not parsed.
* A bond pointing straight at the viewer is hidden behind its atoms (correct for ball-and-stick) and is then selectable only from the
  structure list.
* The AI exam composer catalog does not yet offer chemistry (D.4).
* The browser harness renders the shared ammonia context as a standalone workspace; the production composite renderer is covered by the
  unit and lifecycle suites (D.4 adds the full composite browser path).
