# Phase 21D-D.3 — Enterprise Virtual Chemistry Laboratory (`chemistryLab@1`)

Status: implementation complete on the branch `feature/phase-21d-d3-chemistry-lab`; **independent review required, owner merge only.**
Baseline: `main` = `6a61005244f60173285b0d0a50ed70a118b97527` (D.2 `chemistryReactions@1` merged, PR #292).

This record follows the D.1 and D.2 design records (`docs/enterprise-chemistry-smartsim-21d-d.md`, `docs/enterprise-chemistry-reactions-21d-d2.md`)
and uses the same structure. Verified facts are kept apart from educational modelling assumptions. Every number in §11 was produced on the
branch by the commands named there.

**This is a virtual-only simulation for learning. It is not an instruction manual for physical chemical procedures.** The workspace,
the editor and the acceptance exam say so to the student and the teacher.

## 1. Repository audit (what D.3 builds on)

| Area | Finding | Consequence for D.3 |
|---|---|---|
| Trusted SmartSim | `smartSim@1` is ONE question type. Behaviour comes from code-owned plugins resolved by exact identity (`src/trustedSimRegistry.ts`; production set in `src/trustedSimPlugins.ts`). The server replays semantic actions and never reads a client state. A broken envelope or key fails closed to manual review. | D.3 is a NEW exact identity, `chemistryLab@1`, registered after `chemistryReactions@1`. No new question type, grading engine, registry or persistence. |
| Config visibility | The SmartSim config is PUBLIC: `projectSmartSimForStudent` sends it to the student. Private material lives only in the checks of the answer key. | The config holds given data only. An unknown titration publishes the observable equivalence volume, never the concentration the student must find. No task asks for a value that is itself a published parameter. |
| Shared build | `scripts/build-shared-finalization.mjs` compiles the listed `src/` modules into `api/src/lib/shared-finalization` (drift-tested). | Nine modules added: `src/chemistry/lab/{exact,units,precision,solutions,acidBase,titration,kinetics}.ts`, `src/chemistryLabModel.ts`, `src/chemistryLabPlugin.ts`. |
| Lazy UI | `src/trustedSim/smartSimUiRegistry.ts` maps an identity to a lazy Workspace / Editor / ReviewDetails. `smartSimStarters.ts` gives the authoring starter. | The lab has its own lazy chunks under `src/chemistryLab/`. The starter is the titration template. |
| D.1 / D.2 cores | The D.1 formula engine and CIAAW-2024 atomic weights; the D.2 exact balancing solver. | Molar masses come from D.1 (exact rationals). The titration's mole ratio comes from the D.2 solver balancing the neutralization equation; it is never typed by hand. |
| Dynamic runtime | `src/smartsim/dynamic/DynamicPlot2D` is a safe SVG plot built from numbers. | Used for the c–V curve, the titration curve (from recorded readings only) and the [A]–t curves. No chart library is added. |
| Existing numeric tolerances | Earlier simulators accept a teacher-typed tolerance. | D.3 has **no free tolerance anywhere**. The tolerance follows from the task's reporting precision and a code-owned instrument floor (§4). |

## 2. Architecture

```
public config ─► validateChemLabConfig (strict; refuse, never repair) ─► chemLabContext (memoized per canonical experiment)
     │                                   │ derived: solute / stock / balance range · pH of each solution · titration setup · k per trial
     ▼
student actions ─► normalizeChemLabAction (exact keys, declared ids, whole drops, 0.01 g) ─► replay ─► canonical state
     │                                                                                          {lab, observations, answers}
     ▼                                                                                                     │
ChemLabWorkspace (lazy, presentation)                             evaluateChemLabCheck (server grader + teacher review)
                                                                  expected values DERIVED from config + replayed state
```

Files:

| Layer | Files |
|---|---|
| Science (pure, exact) | `src/chemistry/lab/exact.ts`, `units.ts`, `precision.ts`, `solutions.ts`, `acidBase.ts`, `titration.ts`, `kinetics.ts` |
| Contract | `src/chemistryLabModel.ts` (config, quantities, choices, observations); `src/chemistryLabPlugin.ts` (actions, replay, checks, descriptor) |
| UI (lazy) | `src/chemistryLab/ChemLabWorkspace.tsx`, `LabBenches.tsx`, `LabInstruments.tsx`, `LabAnswers.tsx`, `ChemLabEditor.tsx`, `ChemLabReview.tsx`, `labView.ts`, `chemLab.css` |
| Templates | `src/chemistryLab/labTemplates.ts` |

## 3. Scientific sources, verified facts and modelling assumptions

**Sources** (all open, retrieved 2026-10-11; recorded in `ACID_BASE_SOURCES`, the module headers and the tests):

* OpenStax *Chemistry 2e* (CC BY 4.0):
  * §3.3 Molarity and Examples 3.14–3.21;
  * §12.4–12.5 Integrated rate laws and the Arrhenius equation, Examples 12.6–12.13;
  * §14.1–14.3 Kw, pH and pOH, strong acids and bases; §14.7 titration, Table 14.2 and Example 14.21;
  * Appendix H (Ka of acetic acid, 1.8 × 10⁻⁵) and Appendix I (Kb of ammonia, 1.8 × 10⁻⁵).
* LibreTexts reference table *Acid–Base Indicators* (CC BY-NC-SA 4.0), for the transition ranges.
* CIAAW 2024 standard atomic weights, through D.1.

| Kind | Statement | Basis |
|---|---|---|
| Verified fact | c = n / V; n is conserved on dilution: c₁V₁ = c₂V₂; m = c·V·M. | OpenStax §3.3. The tests reproduce Examples 3.14, 3.17, 3.19 and 3.21. |
| Verified fact | Kw = 1.0 × 10⁻¹⁴ at 25 °C; pH = −log[H₃O⁺]; pH + pOH = 14.00; strong acids and bases ionize completely. | OpenStax §14.1–14.3. |
| Verified fact | Ka(CH₃COOH) = Kb(NH₃) = 1.8 × 10⁻⁵ at 25 °C. | OpenStax Appendices H and I. |
| Verified fact | Strong/strong titration: equivalence follows the balanced equation; pH = 7.00 at equivalence at 25 °C. | OpenStax §14.7, Table 14.2 and Example 14.21. Of the 19 table rows, 18 match exactly. The row at 22.0 mL matches within the source's last digit, because the source rounds [H₃O⁺] before taking the log (test). |
| Verified fact | Integrated rate laws of order 0, 1 and 2; half-lives; the Arrhenius equation. | OpenStax §12.4–12.5. The tests reproduce Examples 12.6, 12.8, 12.11, 12.12 and 12.13. |
| Verified fact (with recorded disagreement) | Indicator transition ranges: methyl orange 3.2–4.4, methyl red 4.8–6.0, bromothymol blue 6.0–7.6, phenolphthalein 8.2–10.0. | LibreTexts table. Other textbooks print slightly different ranges, for example 3.1–4.4 and 8.0–9.6. The lab uses ONE cited table, and a graded indicator question is refused near a range edge (§6.3). |
| Modelling assumption | Ideal dilute solutions at 25 °C. Activities equal concentrations. Volumes are additive. | Stated in the workspace ("نموذج علمي مبسّط (25 °C، محاليل مثالية)") and here. |
| Modelling assumption | pH uses the full charge balance with Kw for strong species (closed form) and for weak species (bisection on log [H₃O⁺]). Dilute acids therefore never become "basic". | Tests: 1.0 × 10⁻⁸ M HCl gives pH 6.98, never the naive 8.00. The weak-acid result is checked against an independent cubic solution. |
| Modelling assumption | END POINT = the titrant volume at which the solution's pH equals the middle of the indicator's range (≈ pK of the indicator). | An educational convention; stated in the editor and in the titration explanation. |
| Modelling assumption | An indicator is "suitable" when \|end point − equivalence point\| ≤ 0.10 mL, which is the volume uncertainty of a burette titre (2 × 0.05 mL). Errors within ±0.01 mL of that limit are AMBIGUOUS and never offered for grading. | A stated rule of this lab, shown to the teacher with the computed errors. |
| Modelling assumption | Rate model: one reactant A → products. Arrhenius is parametrized by k at 25 °C and Ea (R = 8.314 J mol⁻¹ K⁻¹). A catalyst lowers Ea by a stated amount and keeps the same A. | Stated in the experiment header. |
| Illustrative only | Liquid colours: the indicator colour (categorical state from the cited range; inside the range a shade between the two colours), the CuSO₄ blue (proportional to c / c_max), the reactant shading in the rate lab. | Labelled "تمثيل توضيحي" next to every coloured drawing. No optical model (Beer–Lambert) is claimed. |
| Model bound | Solute maximum concentrations: 1.00 M for NaCl, KCl, CaCl₂ and glucose; 0.50 M for CuSO₄; 0.010 M for Ca(OH)₂. pH species ranges and titration ranges are listed in §5. | These are MODEL bounds, far below saturation (Ca(OH)₂ solubility ≈ 0.02 M). Above a bound the lab reports an unsupported state, never a value. |

## 4. Exact numerics and the answer-precision policy

* **Exact rationals** (`exact.ts`). Every decision about a grade, a range or a refusal uses BigInt rationals: comparisons, rounding and
  tolerance arithmetic.
  * Decimals are parsed strictly: ≤ 32 characters, ≤ 12 integer digits, ≤ 12 fraction digits, an optional exponent with |e| ≤ 30.
    "NaN", "Infinity", "0x1F", "25,00", "1e999", signs on authored values and anything else are refused.
  * Doubles from the pH and rate models are converted to their EXACT binary value (`fromNumber`) before they are compared. No float
    comparison decides a mark.
  * Rounding is half AWAY from zero, applied exactly. For example, 2.675 → 2.68, where binary floating point gives 2.67.
* **Units** (`units.ts`). Each dimension has a list of units; the first one is canonical. Conversions are exact rationals (mL = 10⁻³ L,
  min = 60 s, °C = K − 273.15, …). A unit from another dimension is refused by the action normalizer.
* **Tolerance** (`precision.ts`):

  `tolerance = max(½ unit in the last reported place of the trusted value, instrument floor)`, and acceptance is inclusive (≤).

  * The reporting precision is part of the PUBLIC task (`{ decimals: 0–6 }` or `{ significant: 1–6 }`). The student is told
    "اكتب الإجابة بـ 3 أرقام معنوية".
  * The instrument floors are code-owned:

    | Quantity | Floor |
    |---|---|
    | Burette reading | ±0.05 mL |
    | Equivalence / end-point volume | ±0.10 mL (two readings) |
    | Titrant moles | c·0.10 mL |
    | Analyte moles and concentration | n·0.10 mL / V_eq and c·0.10 mL / V_eq |

  * A check carries no tolerance and no expected value. A key that tries to add one fails closed (§8).
  * Significant figures use the magnitude of the trusted value exactly (`floorLog10`). A prepared solution is compared with the student's
    OWN replayed bench state.

## 5. The four lab models

| Lab | Model and equations | Supported range (refused outside) |
|---|---|---|
| **A. Solutions** (`solutions.ts`) | **From a solid**: m on a 0.01 g balance, made up to the mark of a volumetric flask (25 / 50 / 100 / 250 / 500 / 1000 mL): n = m / M, c = n / V. **Dilution**: a pipette (1 / 2 / 5 / 10 / 20 / 25 / 50 mL) of the stock into a larger flask: n = c₁V₁, c₂ = c₁V₁ / V₂. Required mass m = c·V·M (exact; the weighable value is rounded to 0.01 g). Required aliquot V₁ = c₂V₂ / c₁. | Five catalog solutes; the hydrate CuSO₄·5H₂O is weighed (M = 249.677 g/mol). The balance range runs up to the solute's bound in the largest flask, rounded DOWN to 0.01 g. Above the bound: `LAB_SOLUTION_ABOVE_MODEL`. An aliquot not smaller than the flask is refused. |
| **B. pH** (`acidBase.ts`) | One solute per solution at 25 °C. Strong acid / base: x² − a·x − Kw = 0 (no cancellation for either sign). Weak acid / base: x = cK / (K + x) + Kw / x by bisection on log x. Acidic / neutral / basic is decided by the solute KIND, never by a rounded pH. Indicators: categorical colour state from the cited range. | HCl, HNO₃, NaOH, KOH: 10⁻⁹–1.0 M. Ca(OH)₂: up to 0.010 M (two OH⁻). CH₃COOH, NH₃: 10⁻⁶–1.0 M. NaCl; pure water. Outside: `LAB_PH_UNSUPPORTED`. Mixtures and buffers are not modelled. |
| **C. Titration** (`titration.ts`) | Strong acid / strong base only. The salt formula is built from the ions, and [acid, base] → [salt, H₂O] is balanced by the D.2 solver, which gives the mole ratio (2HCl + Ca(OH)₂ is 2 : 1). The exact equivalence volume is an exact rational. pH after V mL: excess δ = (n_H⁺ − n_OH⁻) / (Va + V), then the charge balance. Indicator end point and error as in §3. Curve points are each computed, never interpolated. | Concentrations 0.0010–0.50 M (and within the species' bound). Analyte 5–50 mL. Equivalence 5–45 mL (50 mL burette). Weak or buffered systems, two acids, or out-of-range values: refused with a code. Burette: whole drops (multiples of 0.05 mL), never beyond 50 mL. |
| **D. Rate** (`kinetics.ts`) | [A](t) for order 0 (stops at 0), order 1, order 2. t½, the initial rate k[A]₀ⁿ, and the two-point Ea. k(T, catalyst) = A·exp(−(Ea − drop) / RT) with A fixed by k₂₅. The time cursor is presentation only; there is no "animation speed" model. | T 0–100 °C; Ea 10–250 kJ/mol; the catalyst drop must leave ≥ 5 kJ/mol; [A]₀ 0.001–2 M; derived k in [10⁻⁸, 10³]; observation window 10–36 000 s. |

## 6. `chemistryLab@1` — contract

### 6.1 Config (public, strict)

`{ v: 1, experiment, view: { readouts, graph }, tasks }`. All keys are exact. Authored decimals are canonical strings (`0.100`, `25.00`; no
sign and no exponent, except k₂₅, which may use e-notation). Every rule below refuses the config; nothing is repaired.

* **Experiment kinds** (from the strict-config validator):
  * `solutions`: `{ solute, source: solid | stock, stock, flasks, pipettes }`. A solid source has no stock and no pipettes. A stock needs a
    pipette smaller than some flask.
  * `ph`: ≤ 6 labelled solutions and ≤ 4 indicators.
  * `titration`: `{ analyte { species, volume, concentration | equivalence (exactly one) }, titrant { species, concentration }, indicators ≥ 1 }`.
  * `rate`: `{ order, k25, ea, catalystDrop | null, duration, trials ≤ 4 }`. A trial with a catalyst needs a defined catalyst effect.
* **View**:
  * `readouts` enables the instruments that show numbers: the flask label (A), the pH meter (B, C) and [A](t) (D).
  * `graph` enables the c–V curve, the pH scale, the titration curve and the [A]–t curves.
  * A titration curve without the pH meter is refused, because the curve is built from meter readings.
* **Tasks** (≤ 8), with ids that are unique semantic ids:
  * `number`: a declared quantity, its references (`subject`, `other`, `at`), a unit of the quantity's dimension, and a precision.
  * `choice`: a declared question, with the mode it allows and ≥ 2 options from the offered set.
  * `prepare`: a target concentration within the solute's bound, and the volume of an available flask. The target must be reachable: a
    mass in the balance range, or an aliquot that is an available pipette.
  * `observe`: a declared requirement, with a count where the requirement needs one.

### 6.2 Quantities (number tasks; the trusted value is derived)

| Lab | Quantities |
|---|---|
| A | Concentration and moles of the student's OWN made-up solution (no value until it is made up). |
| B | pH, pOH, [H₃O⁺] and [OH⁻] of a solution. |
| C | Equivalence volume, titrant moles, analyte moles, analyte concentration, the student's burette reading, initial pH, pH after a stated volume, end-point volume for an indicator. |
| D | k (unit by order), t½, initial rate, [A] at a stated time, and the initial-rate ratio of two trials. |

A quantity that does not exist with the authored values is refused at authoring (`LAB_QUANTITY_UNDEFINED`).

### 6.3 Choices (derived answers; ambiguous derivations are refused at authoring)

| Lab | Questions and their ambiguity refusals |
|---|---|
| A | What is conserved on dilution (stock experiments only). |
| B | Classification of a solution; lowest or highest pH (refused when the two extremes differ by < 0.01 pH); indicator colour (refused when the pH is within 0.05 of a range edge). |
| C | Suitable indicators (refused when any offered indicator is AMBIGUOUS); the closest end point (refused when the two best differ by < 0.005 mL); pH at equivalence. |
| D | The fastest trial (refused when the two fastest differ by < 1 %); the effect of temperature, concentration (order 0 means "none") and the catalyst. |

A single-choice task must offer exactly one correct option. A multiple-choice task must offer at least one.

### 6.4 Observations (completion requirements)

* Prepared solutions recorded in several different flasks.
* All solutions measured with the meter (needs readouts).
* All solutions tested with a named indicator.
* N distinct burette readings.
* A reading before AND after equivalence, each within 1.00 mL of it.
* All trials run.

Progress lines in the workspace state only facts about the student's own record (for example, "سجّلت 2 قراءات مختلفة"). They never say
whether a requirement is met where that would reveal an answer.

### 6.5 Actions, replay, state

* **Actions** (≤ 500, exact keys, declared ids only):
  * Bench: `solution.flask / mass / pipette / makeUp`, `ph.measure` (needs readouts), `ph.indicator`, `titration.indicator`,
    `titration.add` (whole drops), `rate.run`, `lab.record`, `lab.reset` (keeps the record and the answers).
  * Answers: `answer.number { taskId, value, unit }`, `answer.choose`, `answer.clear`.
  * Viewing a graph, moving the time cursor, zooming and exploring are PRESENTATION: never actions, never stored.
* **Replay** ignores operations a real bench would not allow: adding beyond the burette, making up an empty flask, recording nothing.
  Repeated meter, indicator and run observations are recorded once. The record holds ≤ 24 observations.
* **State**: `{ v: 1, lab, observations, answers }`, canonical with answers in task order. It is rebuilt by replay; the client state is
  never read.

### 6.6 Checks (private)

* `lab.number`, `lab.choice`, `lab.prepared` and `lab.observed`, each with exactly `{ id, label, weight, kind, taskId }`.
* The check kind must match the task kind. Expected values, tolerances and any extra keys are refused.
* `lab.choice` is an exact set comparison.
* `lab.prepared` passes when the made-up solution is the target:
  * from a solid: the right flask, and a mass within 0.01 g (one balance division) of the exact need;
  * by dilution: the right flask and the exact aliquot.
* The review text names solutions, trials and indicators in Arabic, never as raw ids.

## 7. UI (lazy; `src/chemistryLab/*`)

* **Workspace** (student and teacher preview):
  * One bench per experiment, with SVG instruments: a volumetric flask with a graduation mark, a balance with a display, a pipette
    selector, beakers and conical flasks, a 50 mL burette with a scale, and a pH scale with indicator ranges.
  * Each bench operation and each saved answer is ONE semantic action. A repeated setter replaces the previous one. A no-op is announced
    and not recorded. Corrupt saved actions restart with a visible notice.
* **Separation of observations, measurements and answers.** The record table lists what the student recorded. Instruments show
  measurements only where enabled. The answers panel is the only place an answer is written. Nothing says "correct".
* **Accessibility**:
  * RTL page with LTR islands for formulas, units and numbers. Quantities inside Arabic text are wrapped in Unicode LTR isolates.
  * Keyboard operation for every control. A 3 px focus ring. Controls of at least 44 px.
  * An `aria-live` status line, and text alternatives for every drawing.
  * Large text without overflow (150 % on a 390 px phone). Dark and `prefers-contrast: more` styles.
* **Typed numbers**: Arabic-Indic digits, the Arabic decimal separator and the typographic minus are normalized; anything that is not a
  plain decimal is refused in place and never sent.
* **Editor**:
  * Templates; experiment fields per lab; view flags with explanations; tasks with quantity, unit and precision; choice options;
    observation requirements.
  * Teacher-only derived data: molar mass, balance range, required mass or aliquot, pH of every solution, V_eq, every indicator's end
    point and error, and k and t½ per trial.
  * Expected answers with their tolerance; private checks; the canonical validator's refusals; a student preview.
* **Review**: the server-replayed bench state, the record and the saved answers. The server check list above it shows the expected
  answers and verdicts.

## 8. Security boundaries

* The config is public. The private key holds only task references. No expected value, tolerance or answer is ever stored in the
  question; every one is derived on the server.
* Student input is untrusted:
  * Actions are normalized against the config: exact keys, declared ids, bounded canonical decimals, whole drops, 0.01 g.
  * A forged state, score, `correct` flag or `expected` key is discarded. Ingest rebinds the answer to the published question and
    re-derives the state.
* Fail closed:
  * A tampered config is blocked at finalization and withheld from students. Examples: unknown keys, a weak-acid titration, an
    out-of-model concentration, an ambiguous task, a graph without its meter, an injected renderer.
  * A broken key goes to manual review with no automatic mark (examples: an expected value, a free tolerance, a mismatched check kind).
    Every other question is still graded automatically.
* Colours and drawings come from code-owned catalogs. No markup, style or URL comes from data.

## 9. Bundle and performance

* Lazy chunks: `ChemLabWorkspace`, `ChemLabEditor`, `ChemLabReview` and their CSS. The lab models ride the lazy `trustedSimPlugins` chunk.
  The bundle guard (`scripts/check-bundle-budget.mjs`) requires the lab UI signatures to stay out of the initial graph and the Student
  Portal closure, and the lab core signatures to stay in `trustedSimPlugins-*.js`.
* The initial JS graph is unchanged: 9 files, 362,603 B raw (§11.4). The budget (125 KB gzip) is unchanged.
* A burette drop takes ≈ 50 ms in real Chromium: bind, autosave, replay and render (§11).

## 10. The acceptance exam

`docs/fixtures/chemistry-lab-21dd3/ExamBank_21DD3_Chemistry_Lab_Acceptance.json` (generated from
`api/tests/certification-21dd3/chemistryLabExam.js`, drift-tested). 100 marks:

| Section | Content | Marks |
|---|---|---|
| A | Standard solution from a solid (12); dilution (10) | 22 |
| B | pH meter and classification (12); indicators without a meter (8) | 20 |
| C | Titration with meter and curve (12); unknown acid by indicator (12) | 24 |
| D | Rate: temperature and catalyst (12) | 12 |
| E | Conventional questions (MCQ, numeric, true / false), graded "first 2 answered" (`maxMarks` 8) | 8 |
| F | Composite: a shared limewater titration (2HCl + Ca(OH)₂); two linked SmartSim parts (6 + 4) and an MCQ part (4) | 14 |

It passes the real import, save, re-import and finalization (no blocker). It is part of the platform capability matrix
(`docs/fixtures/certification-20g/coverage-map.md`).

## 11. Verification evidence (D.3)

All numbers below were produced on the branch. The code head for the local gates is `816406b`; later commits change documentation only.
The exact-head CI record is in the PR body (AGENTS.md §6).

### 11.1 Local gates

| Gate | Result |
|---|---|
| `npx tsc -b` | pass |
| `npm run lint` (oxlint) | exit 0. 0 errors; 116 warnings, the same count as `main`, none in a D.3 file. |
| `npm run build` + bundle guard | pass. Initial JS graph 9 files, 109.9 KB gzip (budget 125 KB, unchanged). |
| `npm test` (root: app + API + scripts) | **909 files, 11,905 tests, 0 failures** |
| D.3 suites | 93 tests in 6 files: `labFoundation` 19, `labModels` 25, `chemistryLab` authority 23, UI 15, lifecycle 10, fixture drift 1 |
| D.1 / D.2 regression | inside the full suite. Real Chromium: D.1 36 / 36, D.2 41 / 41. |
| Real Chromium D.3 (`scripts/check-chemistry-browser-21dd3.mjs`) | **47 / 47** after the preview-acceptance fix (§11.6). It was 46 / 46 before the bidi audit check was added. |
| `git diff --check` | clean |

### 11.2 Science evidence (what the tests prove)

* Lab A: OpenStax Examples 3.14, 3.17, 3.19 and 3.21 are reproduced. CIAAW molar masses are exact (CuSO₄·5H₂O = 249.677 g/mol). The
  balance range is rounded down. c ∝ 1 / V at constant n, exactly.
* Lab B:
  * pH 0.00 / 2.00 / 12.00 for 1.0 M HCl / 0.010 M HCl / 0.010 M NaOH, and 12.00 for 0.0050 M Ca(OH)₂ (two OH⁻).
  * 1.0 × 10⁻⁸ M HCl gives pH 6.98, not 8.00.
  * The weak-acid result agrees with an independent cubic solution.
  * Monotonic on dilution; never crosses 7.
  * Unsupported outside the ranges.
* Lab C:
  * OpenStax Table 14.2: 18 of 19 rows exact; the 22.0 mL row is within the source's last digit because the source rounds first.
  * Example 14.21 is reproduced.
  * 2 : 1 stoichiometry comes from the D.2 solver.
  * Equivalence ≠ end point; the indicator error is computed; the ambiguity band refuses near-limit indicators.
  * Only whole drops are accepted.
* Lab D: OpenStax Examples 12.6, 12.8, 12.11, 12.12 and 12.13 are reproduced. Ea from Example 12.13 is 1.85 × 10⁵ J/mol exactly; the
  source prints 1.8 × 10⁵ after rounding its slope. The tests also check Arrhenius consistency, and that zero order stops at 0.
* Precision policy:
  * the inclusive half-unit boundary: pH 3.377 and 3.386 pass around 3.38158; 3.376 and 3.387 fail;
  * the instrument floors: burette 18.55–18.65 mL pass, 18.66 fails; titre 0.00925–0.00935 mol/L pass, 0.00924 fails;
  * exact unit conversion: 0.02500 L = 25.00 mL; 2.50e-3 mol = 2.50 mmol.

### 11.3 Fail-first evidence (defects found during D.3)

| Defect | Proof on the defective SHA | Fix |
|---|---|---|
| The teacher review showed choice options as raw ids ("phenolphthalein، bromothymolBlue"). | The test "review text names indicators, solutions and trials in Arabic" failed on `c123ff8` with exactly that text. | `44a3726` (`optionText` names indicators). |
| The rate lab's time cursor was mirrored by the RTL page: ArrowRight moved time backwards, against the graph's axis. | Real Chromium on `44a3726`: after 35 × ArrowRight the t1 reading stayed at 0.100 mol/L. | `fa0aa20` (`dir="ltr"`). Now 0.100 → 0.0497 mol/L, with no answer changed. |
| Bidi reordering: "24.50 mL" displayed as "mL 24.50" in the record table. | A Chromium glyph-order check fails with the isolates removed ("unit-then-number") and passes with them. Screenshot evidence on `48ecf1c`'s run. | `fa0aa20` (Unicode LTR isolates). |
| **Found by preview acceptance.** The same bidi reordering remained everywhere else a number + unit is shown. On the deployed PR preview of `bb18a26`, 52 of 69 visible occurrences (37 distinct texts) showed the unit left of the number. Affected: status messages; teacher-authored labels and task texts (the RLM in the templates did not help); choice options; record rows built from labels; fixed hints ("25 °C", "0.01 g", "(0.05 mL)"). | On the `bb18a26` sources, three tests failed: the new chemLabUi test (`'أُضيف 1.00 mL من السحاحة.'` without isolates); the new `isolateQuantities` test (not a function); and the new Chromium bidi audit (FAILED 1 / 47, 70 occurrences). | `f29805d`: `labView.isolateQuantities`, applied at every render site of config text, status and options, with `ltr()` on fixed strings. All three now pass; the audit finds 70 occurrences and 0 reordered. Presentation only: config, model and grading are untouched. |

The plugin-list and capability-matrix updates are **pins**, not fail-first tests.

### 11.4 Bundle (measured with the guard's own `initialGraph()` closure)

* `main` `6a61005` and the head both have 9 initial files, **362,603 B raw**. Every initial chunk is byte-identical once the
  content-hash names are normalized. The gzip totals (112,518 vs 112,521 B) differ only through those hash characters.
* The lab's lazy chunks (raw / gzip):

  | Chunk | Raw | Gzip |
  |---|---|---|
  | `ChemLabWorkspace` | 36.8 KB | 10.5 KB |
  | `ChemLabEditor` | 29.8 KB | 7.9 KB |
  | `ChemLabReview` | 2.8 KB | 1.2 KB |
  | Shared `chemLab` helpers | 3.5 KB | 1.8 KB |
  | CSS | 6.0 KB | 1.9 KB |

  The lab models ride `trustedSimPlugins`. The guard requires `clab-bench`, `clab-editor` and `clab-review` to stay lazy, and
  `LAB_TITRATION_SPECIES_UNKNOWN`, `LAB_PH_UNSUPPORTED`, `LAB_RATE_INVALID` and `LAB_ACTION_INVALID` to stay in `trustedSimPlugins-*.js`.

### 11.5 Mutation campaign (`scripts/mutate-chemistry-21dd3.mjs`)

* **Run 1** (67 mutants, sources of `d52f361`): **58 killed, 9 survived, 0 invalid, 0 timeouts.** Files restored (sha256-verified,
  `git diff` clean).
* **Survivors, classified** (all addressed in `68b223f`):

  | Mutant | Classification | Resolution |
  |---|---|---|
  | E03-length-bound | EQUIVALENT: `DECIMAL_PATTERN` matches ≤ 30 characters, so the 32-character pre-filter never decides | removed; replaced by E03-integer-digits and E04-fraction-digits, with digit-bound tests |
  | M02-unknown-ions | test gap | unknown limewater (2 : 1) derives 0.0100 mol/L |
  | M10-time-beyond-duration | test gap | a time beyond the window is refused; the window end is accepted |
  | M13-bracket-window | test gap | readings > 1.00 mL away do not bracket; exactly 1.00 mL does |
  | M14-fastest-tie | test gap | identical trials make "fastest" ambiguous (refused) |
  | M15-prepared-any-flask | test gap | the right mass in the wrong flask is not the target |
  | G06-empty-make-up | test gap | an empty flask is not made up |
  | G12-record-unbounded | test gap | the record holds at most 24 observations |
  | G14-duplicate-measurements | test gap | a repeated meter reading is recorded once |

* **Run 2** (`--only`, the 10 affected mutants, on `68b223f`): **10 / 10 killed.** Files restored.
* **Ledger audit before the PR.** G13-action-limit (500 → 5000) was recorded as killed in run 1, but no test ran: both files failed to
  load. The registry refuses any plugin with more than `SMART_SIM_LIMITS.actions` (1000) at registration, so the D.3 bound itself was never
  exercised. The mutant now plants 1000, the largest value the registry accepts. Run 3 (`--only=G13-action-limit`): **KILLED** by
  assertions in both files (3 failing tests, including the lifecycle refusal of 501 actions). Files restored, sha256-verified.
* The campaign now has **69 mutants**. V08-quantities-not-isolated, which turns `isolateQuantities` into the identity, was added with the preview-acceptance fix. Run on `f29805d` (`--only`, together with V05): both killed, files restored. The `mutations-21dd3` CI job runs all of them on the PR head.

### 11.6 Real Chromium (head code `816406b`: 46 checks; from `f29805d`: 47 checks, with the glyph-measured bidi audit of every number + unit in all eight workspaces)

* All four labs on one exam page, rendered from the student projection; nothing private in the DOM; no WebGL.
* RTL page with LTR formula and number islands.
* Lab A by keyboard only (Arabic digits normalized); a visible 3 px focus ring; an announced status line.
* Readouts and curves appear only where enabled. Meter readings 2.00 / 3.38 / 7.00 / 11.00. Categorical indicator colours.
* Titration:
  * a non-drop volume is refused in place;
  * pH 3.00 / 11.00 around equivalence;
  * colourless at 18.60 mL, transitional one drop later;
  * the curve is built from the recorded readings.
* Rate: the keyboard time cursor changes readings, never answers.
* Accessible names for every control; a burette drop takes ≈ 50 ms.
* After a reload, every answer is restored and grades identically: full marks on the page's 88 SmartSim marks. A forged answer is
  refused.
* The teacher review shows Arabic expected answers. The editor (templates, kind switch, tasks) round-trips import → save → export →
  import, and its preview mounts the workspace.
* Dark scheme. Phone at 390 × 844: no overflow, also with 150 % text; taps work. The phone editor has no overflow either.

## 12. Known limitations and outstanding risks

* **Single-solute pH at 25 °C** (pH lab only). No mixtures, buffers, polyprotic acids, salts of weak acids or bases (hydrolysis), activity
  corrections or temperature dependence of Kw.
* **Strong acid / strong base titrations only.** Weak acid / strong base curves (buffer region, half-equivalence pH = pKa) are refused, not
  approximated.
* **Indicator ranges differ between sources.** One cited table is used. Graded colour questions near a range edge are refused. The
  end-point convention (mid-range) is a stated assumption.
* **Colours are illustrative.** There is no colorimetry or Beer–Lambert model. A "find the concentration from the colour" task is not
  offered.
* **Unknown-sample identification is limited.** Because the config is public, the lab cannot hide which substance is in a flask. Only an
  unknown concentration is supported, and only through its observable equivalence volume.
* **Rate model.** One reactant and integer orders only. Arrhenius is parametrized by k₂₅ and Ea; there is no mechanism, equilibrium or
  temperature dependence of Ea. Parameters are public, so "determine Ea" tasks are not offered.
* **Solubility.** Model bounds are far below saturation; no precipitation is modelled.
* **No sound, no animation of mixing, no 3D.** The time cursor is presentation, not a model of real time.
* **Plan after D.3 (D.4):** the cross-identity chemistry acceptance exam (D.1–D.3 in composite contexts), AI composer catalog entries
  (fail-closed), and the no-graphics fallback audit. **D.4 was not started in this phase.**
