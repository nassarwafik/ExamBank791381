# Phase 21D-D.2 — Chemistry Reactions & Equations SmartSim (`chemistryReactions@1`)

Status: implementation complete on PR #292; **independent review required, owner merge only.**
Baseline: `main` = `d842070be6dc778f3f65801eed4ab619c60a6fab` (D.1 `chemistryStructure@1` merged). Draft checkpoint continued: `6938ea1`.

This record follows the D.1 design record (`docs/enterprise-chemistry-smartsim-21d-d.md`) and uses the same structure: verified facts are
separated from educational modelling assumptions, and every number in §11 was produced on the branch by the commands named there.

## 1. Repository audit (what D.2 builds on)

| Area | Finding | Consequence for D.2 |
|---|---|---|
| Trusted SmartSim | `smartSim@1` is ONE question type; behaviour comes from code-owned plugins resolved by exact identity (`src/trustedSimRegistry.ts`, production set in `src/trustedSimPlugins.ts`). The server replays semantic actions and never reads a client state; a broken envelope or key fails closed to manual review. | D.2 is a NEW exact identity `chemistryReactions@1`; no new question type, grading engine, registry or persistence. |
| Descriptor | Strict vocabulary (domains, scene kinds, capabilities, tools, accessibility); `genericRules` opt-in needs a `ruleView`. | Descriptor declares 2D + 3D (the D.1 molecule viewer is reused), no generic rules — every check is a plugin check with a derived answer. |
| Shared build | `scripts/build-shared-finalization.mjs` compiles the listed `src/` modules into `api/src/lib/shared-finalization` (drift-tested). | Four modules added: `src/chemistry/reactions.ts`, `src/chemistry/reactionCatalog.ts`, `src/chemistryReactionsModel.ts`, `src/chemistryReactionsPlugin.ts`. |
| Lazy UI | `src/trustedSim/smartSimUiRegistry.ts` maps an identity to lazy Workspace / Editor / ReviewDetails; `smartSimStarters.ts` gives the authoring starter. | Own lazy chunks under `src/chemistryReactions/`. |
| D.1 chemistry core | Formula engine (H–Kr, case-sensitive, bounded, refuses charge notation), CIAAW 2024 weights, NIST CCCBDB molecule catalog, SVG ball-and-stick projection with the shared orbit camera (no WebGL). | Formulas are parsed by the D.1 engine; charges are a separate integer; catalog molecules are drawn with their real geometry. |
| Draft on the branch | `src/chemistry/reactions.ts` imported `./chemistry/formula` (non-existent path): the Quality Gate on `6938ea1` failed with `ERR_MODULE_NOT_FOUND` and the D.2 test file loaded no tests. | Fixed first (commit `44d8b45`, reproduced locally before the fix); the nine original tests are kept and pass. |
| D.1 numeric tolerance | `chem.value` accepts any tolerance in [0, 10⁶]: a careless teacher key can accept almost anything. | Not changed here (unrelated to D.2; a separate hotfix is the owner's decision). D.2 has **no numeric tolerance anywhere**: every comparison is an exact integer or set equality. |

## 2. Architecture

```
reaction (catalog id | teacher equation) ─► validateReaction (strict schema) ─► balanceReaction (exact BigInt null space)
        │                                                                                 │
        ▼                                                                                 ▼
 validateRxnConfig (public, strict) ──► rxnContext {reaction, catalog, termIds, lowest}   (memoized per canonical config)
        │
 student actions ─► normalizeRxnAction ─► replay ─► canonical state {coefficients, classifications, selections}
        │                                                         │
        ▼                                                         ▼
 RxnWorkspace (lazy, presentation)                  evaluateRxnCheck (server grader + teacher review): derived answers only
```

Files: `src/chemistry/reactions.ts` (engine), `src/chemistry/reactionCatalog.ts` (curated data + derived facts), `src/chemistryReactionsModel.ts`
(public config), `src/chemistryReactionsPlugin.ts` (actions, replay, checks, descriptor), `src/chemistryReactions/*` (lazy UI and templates).

## 3. Scientific sources, verified facts and modelling assumptions

**Sources (all open, retrieved 2026-10-11; recorded per reaction in `REACTION_SOURCES`).** OpenStax *Chemistry 2e* (CC BY 4.0) §4.1 Writing and
Balancing Chemical Equations, §4.2 Classifying Chemical Reactions, §4.5 Quantitative Chemical Analysis, §5.3 Enthalpy (Table 5.2 combustion
enthalpies), §15.1 Precipitation and Dissolution; LibreTexts *Introduction to Chemistry* (Anoka-Ramsey CC, derived from CK-12 Chemistry) §7.5
Classifying Chemical Reactions; University of Colorado Boulder Lecture Demonstration Manual S130 (CaCl₂ + Na₂CO₃ → CaCO₃).

| Kind | Statement | Basis |
|---|---|---|
| Verified fact | Every catalog equation, its state symbols and its smallest whole-number coefficients are exactly as printed by its source. | Sources above; the exact solver reproduces all 33 coefficient sets (test). One recorded deviation: LibreTexts prints `CO2 (s)` in glucose combustion — recorded as CO₂(g). |
| Verified fact | Coefficients are the relative numbers of particles; subscripts define the substance and never change when balancing; each element's atoms are equal on both sides. | OpenStax §4.1. |
| Verified fact | Redox = a change of oxidation number; oxidizing agent = the species reduced; reducing agent = the species oxidized; oxidation-number rules. | OpenStax §4.2. The per-term oxidation numbers are curated with these rules and checked to sum to each term's charge (test). |
| Verified fact | Family definitions: combination, decomposition, single / double replacement, combustion (LibreTexts §7.5); precipitation, neutralization, redox (OpenStax §4.2); "many reactions may be classified in more than one way" (LibreTexts §7.5). | Encoded as `families` (certainly applies) and `contested` (depends on the text or the conditions). |
| Modelling assumption | Average oxidation numbers where atoms of one element differ (C in C₇H₁₆ = −16/7; N in NH₄NO₃ = +1). Roles derived from averages are the same as from individual atoms for these reactions. | Stated in the catalog notes. |
| Modelling assumption | H⁺ stands for H₃O⁺ in water; S stands for S₈; the iron equation is a simplified model of rusting (hydrated oxide in reality). | Stated in the catalog notes and shown to students. |
| Modelling assumption | The particle picture: catalog molecules use NIST CCCBDB geometry (D.1); every other species is a tile of element dots — an ionic compound is a formula unit, never drawn as a molecule; colours and atom sizes are illustrative. | Stated in the figure caption. |
| Scope statement | A balanced equation is NOT evidence that the reaction occurs (no thermodynamics, kinetics or product prediction). | Shown in the workspace and the editor; the engine never invents a product. |

## 4. The exact balancing engine (`src/chemistry/reactions.ts`)

* **Terms** `{ formula, charge, state? }`: the D.1 formula engine (canonical text only), an explicit integer charge in [−8, +8], an optional
  state symbol (s, l, g, aq). ≤ 8 terms per side, ≤ 12 in total. A species repeated anywhere (same composition and charge — `C2H5OH` and
  `C2H6O` count as the same) is refused: it makes the conservation system degenerate.
* **Conservation matrix** `A`: one row per element (alphabetical), plus a charge row when any term is charged; reactant columns positive,
  product columns negative. A coefficient vector `x` balances the equation iff `A·x = 0` with every `x > 0`.
* **Null space, exactly**: fraction-free Gauss–Jordan elimination over the integers in `BigInt` (each row divided by the gcd of its entries
  after every step); a basis vector per free column `f` is `x_f = D` (the lcm of the pivot values), `x_pivot = −row[f]·D / row[pivot]`,
  then divided by its gcd and sign-normalized (first non-zero entry positive). No floating point is used anywhere a decision is made; the
  bounded results are converted to safe integers only for display.
* **Outcomes**: nullity 1 with a strictly positive vector ⇒ the unique smallest whole-number coefficients. Otherwise a precise refusal:
  `REACTION_ELEMENT_ONE_SIDE` (with the elements), `REACTION_CHARGE_UNBALANCEABLE` (atoms alone would balance), `REACTION_UNBALANCEABLE`
  (only the trivial solution), `REACTION_NO_POSITIVE_SOLUTION`, `REACTION_COEFFICIENTS_TOO_LARGE` (> 999), `REACTION_NOT_UNIQUE`.
* **Canonicalization policy (non-unique systems).** When the null space has dimension d ≥ 2 the equation superposes d independent reactions
  (e.g. H₂ + O₂ → H₂O + H₂O₂): infinitely many non-proportional balancings exist and chemistry, not arithmetic, decides the mixture. The
  engine returns the deterministic integer basis for diagnosis and **every consumer refuses the equation** — it never picks one balancing.
* **Conservation table**: per element the count on each side, the difference and the status, plus the charge row; an unset coefficient
  counts 0 and makes the table incomplete (never balanced). The UI and the grader call the same function.
* **Bounds**: matrix ≤ 37 × 12 (36 elements + charge, 12 terms); entries ≤ 999 per formula count; the elimination is O(rows × columns²) on
  small BigInts — measured in §11.

## 5. The curated catalog (`src/chemistry/reactionCatalog.ts`)

33 reactions (12 middle school, 21 secondary): combination (water, ammonia, iron(III) oxide, MgO, SO₂, Ca(OH)₂, NaCl, HCl), combustion (CH₄,
C₂H₆, C₂H₄, C₇H₁₆, glucose), decomposition (CaCO₃, water electrolysis, H₂O₂, NH₄NO₃), single replacement (Zn + HCl, Mg + Cu(NO₃)₂, Cl₂ + NaBr;
Na + H₂O with single replacement contested), neutralization (HCl + NaOH, Mg(OH)₂ + 2HCl, H₃O⁺ + OH⁻), precipitation (CaCl₂ + Na₂CO₃ and two net
ionic equations), and ionic / redox equations (CO₂ + 2OH⁻, brine electrolysis, Cl₂ disproportionation, Fe²⁺ / Cr₂O₇²⁻, MnO₄⁻ / H₂C₂O₄).
Per reaction: source keys, Arabic names, level, notes, families, contested families, curated roles (acid, base, precipitate, fuel) and per-term
oxidation numbers. Derived at runtime: the redox family check, the oxidizing / reducing agents (an element of a reactant appears in a product
with a higher / lower oxidation number; a disproportionating reactant is both), and element / compound / ion (definitions). Entries are
immutable once published; a correction is a new id.

## 6. `chemistryReactions@1` — contract

**Public config** `{ v: 1, reaction, view, tasks }` (strict; refuse, never repair):
* `reaction`: `{ catalog: id }` or `{ custom: { reactants, products } }` with exact `{ formula, charge, state }` terms; a typed equation is
  accepted only when the exact solver finds a unique positive balancing (the teacher sees the reason otherwise).
* `view`: `conservation` (the live atom-count table with differences and status — it tells the student whether the equation balances: for
  practice; hide it in an exam), `particles`, `states`, `names` (catalog only).
* `tasks.balance`: `null` or `{ locked: termIds }` — given coefficients shown to the student (the smallest coefficients, derived), at least
  one left to write.
* `tasks.classifications` (≤ 4, catalog only): `{ id, label, mode: single | multiple, options: families (≥ 2) }`. Refused when an option is
  contested for that reaction, when a single choice has zero or several correct options, or when a multiple choice has no correct option. A
  typed equation can never be classified (no pattern-matching of formulas).
* `tasks.selections` (≤ 4): `{ id, label, role }`; catalog-only roles (oxidizing / reducing agent, acid, base, precipitate, fuel) are refused
  for typed equations; a role with no term in the reaction is refused.

**Actions** (semantic, server-validated; ≤ 500): `coefficient.set { termId, value 1–999 }` (never on a locked term),
`coefficient.clear`, `equation.reset`, `species.select / deselect { taskId, termId }`, `reaction.classify { taskId, families }` (offered
options only; exactly one for single choice), `reaction.unclassify`. Presentation gestures are refused by the platform. Canonical state:
coefficients in term order, task answers in task order, selected terms in term order, families in vocabulary order — the grade never depends on
click order.

**Private checks** (no expected value is ever stored; every answer is derived at grading time):

| Kind | Passes when | Derived from |
|---|---|---|
| `rxn.balanced` | the COMPLETE equation conserves every element and the charge (any positive whole numbers) | exact conservation table |
| `rxn.lowest` | the complete equation equals the smallest whole-number coefficients | exact solver |
| `rxn.element { element }` | the complete equation conserves that element | exact conservation table |
| `rxn.charge` | the complete equation conserves the net charge (refused for a neutral equation — it would always pass) | exact conservation table |
| `rxn.coefficient { termId }` | that term's coefficient is the smallest one (refused for a locked term) | exact solver |
| `rxn.classification { taskId }` | the chosen set equals the certain families among the offered options | catalog |
| `rxn.selection { taskId }` | the selected set equals the terms with the role | catalog / definitions |

Scoring is the platform's: proportional by weight or all-or-nothing. A broken key (an unknown kind, an extra parameter such as an expected
value, an undefined element / term / task) makes the whole key invalid ⇒ score 0 + manual review (fail closed).

**Generic SmartSim rules.** The plugin implements the full registry / descriptor / replay contract and declares `genericRules: []` — an
explicit, supported opt-out. The generic rules carry teacher-typed expected values (`objectSelected@1`, `setEquals@1`) or tolerances
(`numericNear@1`), while every D.2 answer must be derived from code-owned references and compared exactly; a generic-rule check on this
plugin is therefore an unknown kind and fails closed (tested).

## 7. UI (lazy; `src/chemistryReactions/*`)

* **Workspace** (student and teacher preview): the equation is an LTR island in an RTL page; one coefficient box per term (type, ↑ / ↓, or the
  pointer-only step buttons; Tab moves from box to box); invalid text is refused in place with an alert and never sent; clearing a box
  removes the decision; given coefficients are shown locked. The live conservation table (when allowed) with the charge row and a polite
  live status; the particle picture (coefficient × particles, real catalog molecule geometry, formula-unit tiles, ions with their charge,
  "+N" beyond ten copies); the D.1 3D viewer for catalog molecules (presentation only); radio / checkbox classification and term chips.
* **Editor**: templates, catalog picker by level with the teacher-only balanced equation, families (certain and contested), notes and
  sources; the teacher's own equation (formula, charge, state rows; canonical text; the solver's verdict); views; tasks with option
  markers (correct / not / contested); private checks with derived expected answers and suggested checks; validation messages; preview.
* **Review**: the server-derived equation (given coefficients included), its conservation table and the saved answers; the config is read
  through the registered plugin (the same authority as the workspace and the server).
* **Templates** (Arabic): water, methane, iron (given coefficient), CaCO₃ (multiple choice), Mg(OH)₂ neutralization (acid / base),
  precipitation, dichromate (charge), and a teacher's own Al + O₂ equation.

## 8. Security boundaries

Untrusted student input: actions only (exact keys, declared ids, bounded integers, offered options), replayed by the server; the client
`state`, score, checks or flags are never read. No hidden answer reaches the student: the public config holds the question only (the
smallest coefficients, families and roles are derived on the server at grading time; the sanitizer removes `answer`). The catalog is code,
so the knowledge it encodes (as any textbook) is not a secret — what matters is that the UI never displays an expected answer to a student
and that the live conservation table is a teacher's explicit choice. No prototype-sensitive keys (bounded-JSON guard + exact keys), no
dynamic code, no asset, URL or network access, no WebGL unless a student opens a 3D view (and then SVG — no WebGL at all). Malformed configs
are blocked at finalization and withheld from students; broken keys fail closed.

## 9. Bundle and performance

Everything is lazy: the engine, catalog, model and plugin ride the lazy `trustedSimPlugins` chunk (as D.1's core does); the workspace,
editor and review are their own chunks (plus a shared `rxn` presentation chunk and the templates). The bundle guard requires the D.2
signatures (`rxn-workspace`, `rxn-equation`, `rxn-conservation`, `rxn-particles`, `rxn-editor`, `rxn-review`, `RXN_CONFIG_INVALID`,
`REACTION_TERM_DUPLICATE`) to exist and to stay out of the initial graph, and the chemistry core signatures to be emitted ONLY in the
`trustedSimPlugins` chunk: a chemistry UI entry that reaches the core without reaching the registry makes the bundler split the core into
its own chunk, which the entry's preload map must then name — the initial graph grows (this happened on `2bd75c0`, +35 B gzip, and was
fixed in `4010fa4`; §11.4). The solver is O(rows × columns²) BigInt arithmetic on a matrix of at most 37 × 12; measured in §11.5.

## 10. Plan after D.2

D.3 (virtual lab: solutions, dilution, pH, titration — stoichiometry moves there with its first consumer) and D.4 (exam integration across
D.1–D.3, AI composer catalog, full composite browser path). Stoichiometry / limiting reactant, listed for D.2 in the D.1 plan, is deferred to
D.3: this phase's request is balancing, conservation, families and roles.

## 11. Verification evidence (D.2)

Every figure below was produced on this branch by the command named. "Code head" is `4010fa4` (the last commit that changes code, tests
or tooling); the commit that adds this record changes documentation only. Exact-head CI is reported in the PR body for the final head (a
document cannot carry the CI result of the commit that contains it).

### 11.1 Local gates (code head `4010fa4` unless stated)

| Gate | Command | Result |
|---|---|---|
| Type check | `npx tsc -b` | exit 0 |
| Lint | `npm run lint` (the repository's linter is oxlint; there is no ESLint configuration) | exit 0; no finding in any D.2 file (the warnings it prints are in unrelated, unchanged files) |
| Build + bundle guard | `npm run build` | exit 0; guard passed; initial graph 9 files, 112,518 B gzip / 362,603 B raw (budget 125 KB) — §11.4 |
| Full root suite | `npm test` | **903 files / 11,812 tests passed, 0 failed** (338 s; includes the API, scripts and governance-contract suites) |
| Shared-finalization drift | part of `npm test` (the compiled `api/src/lib/shared-finalization` equals a fresh build) | passed |
| D.2 suites | `npx vitest run` on the files below | 6 files, **114 / 114 passed**: `reactions.21dd2` 42, `reactionCatalog.21dd2` 25, `chemistryReactions.21dd2` 23, `reactionsUi.21dd2` 17, `api/tests/certification-21dd2` lifecycle 6 + fixture drift 1 |
| Real Chromium | `node --experimental-strip-types scripts/check-chemistry-browser-21dd2.mjs` (Chromium 1194 headless) | **41 / 41 checks passed** |
| Mutation campaign | `node scripts/mutate-chemistry-21dd2.mjs` | **59 mutants: 59 KILLED, 0 survived, 0 invalid, 0 timeout**; every mutated file restored byte for byte (sha-256 verified, `git diff` clean) — §11.6 |
| Whitespace | `git diff --check origin/main...HEAD` | clean |

### 11.2 Science evidence (what the tests prove)

* **Catalog reproduction.** The exact solver reproduces the smallest whole-number coefficients printed by the source for all 33 catalog
  equations; every term's oxidation numbers sum to its charge; every equation conserves every element and the charge with its coefficients;
  the derived redox flag, oxidizing / reducing agents and element / compound / ion kinds match the curated text (`reactionCatalog.21dd2`).
* **Solver correctness.** Classic and ionic equations (e.g. KMnO₄ + HCl with four products → 2 / 16 / 2 / 2 / 5 / 8; permanganate /
  iron(II) → 1 / 5 / 8 / 1 / 5 / 4; dichromate / iron(II) with +24 on both sides), independence from the order the terms are written in,
  every refusal code with a minimal witness (one-sided element, charge-only failure, only the trivial solution,
  a negative coefficient required, coefficients above 999 — computed exactly, e.g. 997 002 — and non-unique systems), the deterministic
  primitive, sign-normalized NOT_UNIQUE basis, exact integer null spaces, and the strict term schema (canonical formula text only, explicit
  charge, optional state, no repeated species) (`reactions.21dd2`).
* **Conservation display.** Rows and the charge row are "pending" until every term that contains the element (or every charged term) has a
  coefficient; a complete equation is judged exactly (`reactions.21dd2`, UI tests, Chromium b1).
* **No pattern-matching.** A typed equation can never be classified and never gets a catalog-only role; contested families can never be
  offered (`chemistryReactions.21dd2`).

### 11.3 Fail-first evidence (defects found during D.2)

| Defect | Proof on the defective SHA | After the fix |
|---|---|---|
| Draft imported `./chemistry/formula` (non-existent): Quality Gate red on `6938ea1`, D.2 tests not loaded | CI on `6938ea1`: `ERR_MODULE_NOT_FOUND`, reproduced locally | `44d8b45`: the nine draft tests pass |
| Conservation rows judged elements whose terms had no coefficient ("✗" for H with only CH₄ / CO₂ set; untouched Fe read 0 = 0 "✓") | 4 tests fail on `0938b9d` (detached worktree): expected `… أكمل معاملاته`, got `✗ غير محفوظ` | `119a664`: pass |
| Teacher editor overflowed a 390 px phone (selects sized to their longest option) | tightened Chromium check: `scrollWidth 658` | `119a664`: 390 |
| Mutants R08 / R09 / R14 survived the first full campaign (diagnostic basis not pinned; non-canonical formula text accepted and rewritten) | campaign 1 on `1cecd35` sources: 56 killed / 3 survived | `2bd75c0`: focused re-run 3 / 3 killed |
| Initial graph +35 B gzip (a new chemistry chunk named in the entry's preload map) | new guard on a build of `2bd75c0`: 3 failures (core signatures in `chemistryReactionsPlugin-*.js`), exit 1 | `4010fa4`: exit 0, initial graph raw bytes equal to `main` |

### 11.4 Bundle (measured with the guard's own `initialGraph()`)

| Build | Initial files | Raw bytes | Gzip bytes |
|---|---|---|---|
| `main` `d842070` | 9 | 362,603 | 112,508 |
| `2bd75c0` (before the fix) | 9 | 362,666 | 112,543 |
| `4010fa4` | 9 | 362,603 | 112,518 |

At `4010fa4` the nine initial chunks are identical to `main` byte for byte once the 8-character content hashes of lazy chunk names are
normalized (those hashes change whenever any lazy code changes); the remaining +10 B gzip is the compressibility of the new hash strings.
No D.2 code is in the initial graph or the Student Portal's static closure (guard).

### 11.5 Performance (Node 22, this container)

| Measurement | Result |
|---|---|
| Ferrocyanide / permanganate (9 terms, 8 element rows; solved 10 / 122 / 299 / 162 / 5 / 122 / 60 / 60 / 188) | 0.05 ms per solve (mean of 2 000) |
| Dichromate / iron(II) (6 terms, charge row) | 0.02 ms |
| 12 terms, 10 element rows (two independent reactions ⇒ NOT_UNIQUE) | 0.05 ms |
| `C998H999 = C999 + H998` (exact 997 002, refused) | 0.005 ms |
| Seeded fuzz, 20 000 distinct equations whose two sides hold the same elements (every one reaches the elimination; ≤ 12 terms, counts ≤ 30) | worst single observation 4.97 ms; the slowest equation re-timed alone: median 0.12 ms, max 0.44 ms over 300 solves |
| Seeded fuzz, 2 × 20 000 unconstrained equations (20- and 5-element pools) | worst single observation 2.8 ms |
| Coefficient change in real Chromium (bind + autosave + replay + table + particles) | 15 ms (check: < 120 ms) |

An earlier fuzz run recorded one 33.8 ms observation that did not reproduce; isolated re-timing shows the slowest inputs take well under
1 ms, so such spikes are runtime pauses (collection / compilation), not input cost. The grader replays at most 500 actions per answer.

### 11.6 Mutation campaign

`scripts/mutate-chemistry-21dd2.mjs` plants one isolated defect at a time across the conservation table, the exact solver, the term schema, the
catalog and its derived facts, the strict config authority, action normalization and replay, the derived checks, hidden-answer protection and
the presentation. It runs the targeted suites (the API lifecycle grades through the regenerated shared build), restores every file byte for
byte (sha-256 + `git diff`) and writes `artifacts/phase-21dd2/mutation-ledger.json`. A timeout or a transform error never counts as killed.

* Campaign 1 (sources of `1cecd35`): 56 killed, **3 survived** — R08 (gcd reduction removed), R09 (sign normalization removed), R14 (the
  canonical-text check removed). None is equivalent: R08 / R09 change the documented NOT_UNIQUE diagnostic basis, R14 accepts non-canonical
  formula text and silently rewrites it. The tests were strengthened (`2bd75c0`) and a focused re-run killed all three.
* Final campaign (sources of the code head `4010fa4`, all 59 mutants): **59 killed, 0 survived, 0 invalid, 0 timeout, restored = true**.

| Id | Mutated file | Outcome | Killed by (first failing test) |
|---|---|---|---|
| R01-product-sign | `chemistry/reactions.ts` | KILLED | `reactionCatalog.21dd2.test.ts` › every equation passes the strict validator and the exact solver reproduces the source's coefficients |
| R02-row-balanced | `chemistry/reactions.ts` | KILLED | `reactionCatalog.21dd2.test.ts` › every equation passes the strict validator and the exact solver reproduces the source's coefficients |
| R03-incomplete-counts | `chemistry/reactions.ts` | KILLED | `chemistryReactions.21dd2.test.ts` › never awards a conservation mark for an incomplete or unbalanced equation, and explains the imbalance |
| R18-row-completeness | `chemistry/reactions.ts` | KILLED | `reactionsUi.21dd2.test.tsx` › each coefficient is ONE semantic action per term; the conservation table follows; balanced status is announced |
| R04-charge-ignored-in-table | `chemistry/reactions.ts` | KILLED | `chemistryReactions.21dd2.test.ts` › separates atom conservation from charge conservation in ionic equations |
| R05-no-charge-row | `chemistry/reactions.ts` | KILLED | `reactionCatalog.21dd2.test.ts` › every equation passes the strict validator and the exact solver reproduces the source's coefficients |
| R06-solver-without-charge | `chemistry/reactions.ts` | KILLED | `reactionCatalog.21dd2.test.ts` › every equation passes the strict validator and the exact solver reproduces the source's coefficients |
| R07-positivity | `chemistry/reactions.ts` | KILLED | `reactions.21dd2.test.ts` › reports a one-dimensional solution that is not strictly positive |
| R08-gcd-reduction | `chemistry/reactions.ts` | KILLED | `reactions.21dd2.test.ts` › refuses non-unique equations (several independent balancings) and returns a deterministic integer basis |
| R09-sign-normalization | `chemistry/reactions.ts` | KILLED | `reactions.21dd2.test.ts` › computes null spaces exactly for integer matrices |
| R10-one-sided-element | `chemistry/reactions.ts` | KILLED | `reactions.21dd2.test.ts` › names the elements that appear on one side only |
| R11-non-unique-picked | `chemistry/reactions.ts` | KILLED | `reactions.21dd2.test.ts` › refuses non-unique equations (several independent balancings) and returns a deterministic integer basis |
| R12-coefficient-bound | `chemistry/reactions.ts` | KILLED | `reactions.21dd2.test.ts` › refuses an equation whose smallest coefficients exceed the bound (exact, no overflow) |
| R13-repeated-species | `chemistry/reactions.ts` | KILLED | `reactions.21dd2.test.ts` › accepts an optional state symbol and refuses an unknown one, extra keys, unknown elements and repeated species |
| R14-canonical-formula | `chemistry/reactions.ts` | KILLED | `reactions.21dd2.test.ts` › accepts an optional state symbol and refuses an unknown one, extra keys, unknown elements and repeated species |
| R15-charge-range | `chemistry/reactions.ts` | KILLED | `reactions.21dd2.test.ts` › rejects untrusted configuration keys and out-of-range charges |
| R16-coefficient-ignored | `chemistry/reactions.ts` | KILLED | `reactions.21dd2.test.ts` › balances water with exact integer coefficients |
| R17-charge-diagnosis | `chemistry/reactions.ts` | KILLED | `reactions.21dd2.test.ts` › diagnoses a charge that can never balance although the atoms can |
| C01-water-coefficients | `chemistry/reactionCatalog.ts` | KILLED | `reactionCatalog.21dd2.test.ts` › every equation passes the strict validator and the exact solver reproduces the source's coefficients |
| C02-oxidized-direction | `chemistry/reactionCatalog.ts` | KILLED | `reactionCatalog.21dd2.test.ts` › derives the oxidizing and reducing agents from oxidation-number changes |
| C03-iron-combustion-contested | `chemistry/reactionCatalog.ts` | KILLED | `chemistryReactions.21dd2.test.ts` › refuses classifications that would mark a defensible answer wrong, or that are guessed for a teacher's equatio |
| C04-methane-oxidation-number | `chemistry/reactionCatalog.ts` | KILLED | `reactionCatalog.21dd2.test.ts` › oxidation numbers cover exactly the elements of each term and sum to its charge (OpenStax rule 4) |
| C05-precipitate-role | `chemistry/reactionCatalog.ts` | KILLED | `reactionCatalog.21dd2.test.ts` › curated roles name real terms on the right side |
| C06-element-definition | `chemistry/reactionCatalog.ts` | KILLED | `reactionCatalog.21dd2.test.ts` › derives element / compound / ion by definition and keeps curated roles |
| C07-contested-status | `chemistry/reactionCatalog.ts` | KILLED | `chemistryReactions.21dd2.test.ts` › refuses classifications that would mark a defensible answer wrong, or that are guessed for a teacher's equatio |
| S01-config-unknown-key | `chemistryReactionsModel.ts` | KILLED | `chemistryReactions.21dd2.test.ts` › refuses unknown keys, versions, catalog ids and malformed reaction references |
| S02-unbalanceable-accepted | `chemistryReactionsModel.ts` | KILLED | `chemistryReactions.21dd2.test.ts` › accepts a teacher's equation only when it is valid and UNIQUELY balanceable |
| S03-names-on-typed-equation | `chemistryReactionsModel.ts` | KILLED | `chemistryReactions.21dd2.test.ts` › refuses inconsistent views and balance tasks |
| S04-every-coefficient-locked | `chemistryReactionsModel.ts` | KILLED | `chemistryReactions.21dd2.test.ts` › refuses inconsistent views and balance tasks |
| S05-contested-offered | `chemistryReactionsModel.ts` | KILLED | `chemistryReactions.21dd2.test.ts` › refuses classifications that would mark a defensible answer wrong, or that are guessed for a teacher's equatio |
| S06-single-ambiguous | `chemistryReactionsModel.ts` | KILLED | `chemistryReactions.21dd2.test.ts` › refuses classifications that would mark a defensible answer wrong, or that are guessed for a teacher's equatio |
| S07-catalog-only-role | `chemistryReactionsModel.ts` | KILLED | `chemistryReactions.21dd2.test.ts` › refuses selection roles that cannot be answered and malformed / colliding task ids |
| S08-empty-role | `chemistryReactionsModel.ts` | KILLED | `chemistryReactions.21dd2.test.ts` › refuses selection roles that cannot be answered and malformed / colliding task ids |
| S09-task-id-collision | `chemistryReactionsModel.ts` | KILLED | `chemistryReactions.21dd2.test.ts` › refuses selection roles that cannot be answered and malformed / colliding task ids |
| S10-classification-guessed | `chemistryReactionsModel.ts` | KILLED | `chemistryReactions.21dd2.test.ts` › refuses classifications that would mark a defensible answer wrong, or that are guessed for a teacher's equatio |
| A01-zero-coefficient | `chemistryReactionsPlugin.ts` | KILLED | `chemistryReactions.21dd2.test.ts` › REFUSES malformed, undeclared, locked, out-of-bound and presentation actions (the whole answer is refused) |
| A02-locked-writable | `chemistryReactionsPlugin.ts` | KILLED | `chemistryReactions.21dd2.test.ts` › REFUSES malformed, undeclared, locked, out-of-bound and presentation actions (the whole answer is refused) |
| A03-coefficient-exact-keys | `chemistryReactionsPlugin.ts` | KILLED | `chemistryReactions.21dd2.test.ts` › REFUSES malformed, undeclared, locked, out-of-bound and presentation actions (the whole answer is refused) |
| A04-unoffered-family | `chemistryReactionsPlugin.ts` | KILLED | `chemistryReactions.21dd2.test.ts` › REFUSES malformed, undeclared, locked, out-of-bound and presentation actions (the whole answer is refused) |
| A05-single-choice-count | `chemistryReactionsPlugin.ts` | KILLED | `chemistryReactions.21dd2.test.ts` › REFUSES malformed, undeclared, locked, out-of-bound and presentation actions (the whole answer is refused) |
| A06-unknown-term-selected | `chemistryReactionsPlugin.ts` | KILLED | `chemistryReactions.21dd2.test.ts` › REFUSES malformed, undeclared, locked, out-of-bound and presentation actions (the whole answer is refused) |
| A07-reset-noop | `chemistryReactionsPlugin.ts` | KILLED | `chemistryReactions.21dd2.test.ts` › replays into a canonical state (term order, family vocabulary order, selection term order) |
| A08-selection-click-order | `chemistryReactionsPlugin.ts` | KILLED | `chemistryReactions.21dd2.test.ts` › replays into a canonical state (term order, family vocabulary order, selection term order) |
| G01-complete-required | `chemistry/reactions.ts` | KILLED | `chemistryReactions.21dd2.test.ts` › never awards a conservation mark for an incomplete or unbalanced equation, and explains the imbalance |
| G02-lowest-exact | `chemistryReactionsPlugin.ts` | KILLED | `chemistryReactions.21dd2.test.ts` › accepts a multiple as balanced but not as the smallest whole numbers |
| G03-element-complete | `chemistryReactionsPlugin.ts` | KILLED | `chemistryReactions.21dd2.test.ts` › never awards a conservation mark for an incomplete or unbalanced equation, and explains the imbalance |
| G04-charge-complete | `chemistryReactionsPlugin.ts` | KILLED | `chemistryReactions.21dd2.test.ts` › never awards a conservation mark for an incomplete or unbalanced equation, and explains the imbalance |
| G05-coefficient-exact | `chemistryReactionsPlugin.ts` | KILLED | `cert-21dd2-reactions-lifecycle.test.js` › PERFECT / PARTIAL / BLANK are decided by server replay against solver- and catalog-derived answers (41 marks i |
| G06-classification-exact-set | `chemistryReactionsPlugin.ts` | KILLED | `chemistryReactions.21dd2.test.ts` › grades a multiple-choice classification as an exact set |
| G07-selection-exact-set | `chemistryReactionsPlugin.ts` | KILLED | `chemistryReactions.21dd2.test.ts` › never awards a conservation mark for an incomplete or unbalanced equation, and explains the imbalance |
| G08-given-coefficients | `chemistryReactionsPlugin.ts` | KILLED | `chemistryReactions.21dd2.test.ts` › uses the given (locked) coefficient and grades only what the student writes |
| G09-expected-value-smuggled | `chemistryReactionsPlugin.ts` | KILLED | `chemistryReactions.21dd2.test.ts` › accepts exactly the parameters of each kind and never an expected value |
| G10-charge-on-neutral | `chemistryReactionsPlugin.ts` | KILLED | `chemistryReactions.21dd2.test.ts` › accepts exactly the parameters of each kind and never an expected value |
| H01-answer-in-public-config | `chemistryReactionsModel.ts` | KILLED | `chemistryReactions.21dd2.test.ts` › every classroom template is a valid question with no finalization issue |
| U01-clear-is-an-action | `chemistryReactions/RxnWorkspace.tsx` | KILLED | `reactionsUi.21dd2.test.tsx` › keyboard arrows and the step buttons change a coefficient; invalid text is refused with an alert and never sen |
| U02-radio-group-name | `chemistryReactions/RxnWorkspace.tsx` | KILLED | `reactionsUi.21dd2.test.tsx` › two workspaces on one page keep independent radio groups |
| U03-family-click-order | `chemistryReactions/RxnWorkspace.tsx` | KILLED | `reactionsUi.21dd2.test.tsx` › single choice is a radio group, multiple choice a checkbox group; each decision is one action |
| U04-aqueous-drawn-as-molecule | `chemistryReactions/rxnView.ts` | KILLED | `reactionsUi.21dd2.test.tsx` › ionic compounds are formula units, ions carry their charge, and a locked coefficient is shown and cannot be ed |
| U05-copies-cap | `chemistryReactions/rxnView.ts` | KILLED | `reactionsUi.21dd2.test.tsx` › ionic compounds are formula units, ions carry their charge, and a locked coefficient is shown and cannot be ed |

### 11.7 CI

The D.2 workflow (`chemistry-smartsim-21dd.yml`) runs the D.1 jobs unchanged plus `chromium-21dd2` and `mutations-21dd2` on any D.2 path;
the Quality Gate, Build and Deploy and Runner workflows run as for every PR. Results for the final head (workflow, run attempt,
conclusion) and the PR-preview outcome are recorded in the PR body.

On the code head `4010fa4` (run 38110359977 and its siblings, attempt 1): D.2 Chromium, D.2 mutations, D.1 Chromium, D.1 mutations, graph
mutations and the Runner suite **passed**; the Quality Gate **failed on one unrelated test** — `src/GovernancePanel.14b.test.tsx` › "submit
opens the readiness panel, then the actor-selection dialog…" (`Unable to find role="dialog" and name "تعيين دورة المراجعة"`; 11,811 of
11,812 tests passed), so Build and Deploy was skipped. The same failure, with the same message, occurred before D.2 existed on two
unrelated branches (`8e0c281`, run 38013399882; `bb14d0c`, run 38047984250). It passes 11 of 11 local runs, idle and under full CPU load, and D.2 touches neither the governance panel nor the
dialog primitive. Per `AGENTS.md` §12 it is not patched here (§12 below).

## 12. Known limitations and outstanding risks

* Elements H–Kr only (D.1 formula engine); ions from typed equations must carry an explicit charge; no electrons (e⁻) as terms, no
  half-reactions, no phase-change or equilibrium arrows (⇌ is shown as →; the catalog notes say which reactions are reversible).
* Non-unique equations (nullity ≥ 2) are refused, never balanced by choice.
* Classification and agent roles exist only for catalog reactions; families of a typed equation are never guessed.
* Average oxidation numbers for C₇H₁₆ and NH₄NO₃ (stated).
* Coefficients above 999 are refused.
* The particle picture is schematic (sizes and colours illustrative); species outside the D.1 molecule catalog are drawn as element-dot tiles.
* D.1's permissive numeric tolerance (`chem.value`) is unchanged — a separate hotfix.
* No AI composer entry yet (D.4).
* **Outside D.2 (recorded, not patched here):** the intermittent `GovernancePanel.14b` assignment-dialog failure in CI (§11.7), the same
  file as the documented flaky 409 test; its root cause is not established (in-file module isolation rules out a stale dialog-stack token,
  the dialog is a static import and the confirm control is not gated by the panel's initial loads). A separate hotfix is recommended.
