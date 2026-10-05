# Phase 19C — Advanced Parametric Engine & Domain-Ready Foundation

Baseline `751003f0a19e8004b2b9bad92b88d160d0e4ba64` (post-merge of Phase 19B, PR #256). Branch
`feature/19c-advanced-parametric-engine`. Phase 19C extends the Phase 19B engine (`docs/parametric-questions-engine-19b.md`) with
decimal variables, more safe functions, derived values, richer constraints, a presentation-format layer, a teacher sample
generator and solution inspector, and v2 AI drafts — **additively**, as a new contract version. Every Phase 19B question and
attempt replays exactly as before.

**Still not arbitrary code execution.** No `eval`, no `Function`, no dynamic import, no host / global access, no property access.
Every new capability goes through the same tokenizer → recursive-descent parser → bounded evaluator.

## 1. Architecture

```
generic engine (src/parametricEngine.ts)          — language 1 / 2, variables, derived graph, formats, generator 1 / 2
  └─ domain-neutral contract (src/parametricNumericQuestion.ts) — config v1 / v2, private key, projection, grading, review, samples
       └─ [future] domain adapters (not implemented — §14)
```

| Version | Config | Generator | Language | Status |
|---|---|---|---|---|
| v1 (Phase 19B) | `{ v: 1, generatorVersion: 1, variables: [{ id, kind: "int", … }], constraints, response }` | 1 | 1 (abs round floor ceil min max; `^` integer exponent) | frozen — exact replay |
| v2 (Phase 19C) | `{ v: 2, generatorVersion: 2, variables, derivedVariables, constraints, response }` | 2 | 2 (+ sqrt pow log log10 exp; `^` ≡ pow) | default for new questions |

The question type stays `parametricNumeric@1`; the contract version lives inside the config. `checkConfig` dispatches on `v`; a
v1 config can never use a v2 feature (an extra `derivedVariables` key is `PARAM_CONFIG_UNKNOWN_KEY`, kind `"integer"` is
`PARAM_VAR_KIND_UNSUPPORTED`, `sqrt` is `EXPR_UNKNOWN_FUNCTION`); a v2 config must use generator 2; any other version fails closed
(`PARAM_CONFIG_VERSION`) in validation, delivery, grading and review.

## 2. Version compatibility and replay

* Generator 1, language 1 and the v1 contract are byte-for-byte the Phase 19B code paths (the node budget, the new functions and
  the new reserved names apply to language 2 only). All Phase 19B suites run unchanged; the only 19B pin that changed is the list
  of generator versions (`[1]` → `[1, 2]`). A dedicated 19C test re-asserts the 19B pins (projection, grade, review instance with
  the same seed digest, teacher sample) for a v1 question.
* The generator version is part of the official seed text, so a v2 instance comes from a different stream than a v1 instance of
  the same identity.
* Historical questions are never migrated during replay. A teacher may **explicitly** upgrade a v1 *draft* in the editor
  («ترقية إلى الإصدار 2», `upgradeParametricConfigToV2`): kind `"int"` → `"integer"`, no derived values; the editor states that new
  attempts will receive different values. Published assignment snapshots are frozen, so existing attempts are unaffected.

## 3. Decimal model and precision policy

```
{ "id": "r", "kind": "decimal", "min": 1.5, "max": 9.5, "step": 0.5, "format": { "kind": "fixed", "decimals": 1 } }   // format optional
{ "id": "a", "kind": "integer", "min": 2, "max": 10 }                                                                // step defaults to 1
```

* `kind` is explicit (`"integer"` | `"decimal"`); it is never inferred from the numbers.
* Authored `min`, `max`, `step` have at most **6 decimal places** (`PARAM_VAR_PRECISION` otherwise — 1/3 is refused, nothing is
  silently rounded); |bound| ≤ 10^9; `step` > 0 (an integer for integers); `min ≤ max`; `max − min` a multiple of `step`
  (`PARAM_VAR_STEP_MISALIGNED`); at most 10,000,000 grid positions per variable.
* Generation is **index based on a scaled-integer grid**: scale = 10^d (d = the largest number of decimals among min / max / step);
  value = (min·scale + index·step·scale) / scale normalized with `toFixed(d)`. There is no repeated `+ step`, so there is no drift
  (0.1 … 0.9 yields exactly `0.3`, never `0.30000000000000004`), every value lies on the grid inside `[min, max]`, both ends reachable.

## 4. Safe functions (language 2)

| Function | Arity | Domain | Notes |
|---|---|---|---|
| abs, floor, ceil | 1 | all | unchanged |
| round(x[, d]) | 1–2 | d integer 0..10 | half away from zero (unchanged) |
| min, max | 2–10 | all | unchanged |
| sqrt(x) | 1 | x ≥ 0 | IEEE correctly rounded |
| pow(a, b), `a ^ b` | 2 | integer b with \|b\| ≤ 64: any a (0 ^ negative ⇒ divide by zero); fractional b: a > 0 | `^` and pow are the SAME function in language 2 |
| log(x) natural, log10(x) | 1 | x > 0 | result normalized to 12 significant digits |
| exp(x) | 1 | result ≤ 10^15 | result normalized to 12 significant digits |

Domain errors (`EVAL_DOMAIN`), division by zero, exponent violations, non-finite or out-of-range (> 10^15) values fail. They never
yield NaN / Infinity: authoring validation reports them (sample check), a failing derived value or constraint rejects that candidate,
and an official instance that cannot be computed is graded `0 / correct false / manualReview true`. Transcendental results are
normalized to 12 significant digits to absorb last-ulp differences between math libraries; the server's value is authoritative.

## 5. Derived values (dependency graph)

```
"derivedVariables": [ { "id": "area", "expression": "a * b" }, { "id": "half", "expression": "area / 2", "format": { "kind": "fixed", "decimals": 1 } } ]
```

Language-2 expressions over base variables and other derived values. Validation: exact keys, valid non-reserved ids, no duplicates,
no collision with a base name, valid expressions, no self reference, no unknown reference, and an **acyclic** graph
(`PARAM_DERIVED_CYCLE`). Evaluation order is a deterministic topological order (Kahn's algorithm, ties broken by declaration
order) — declaration order alone is never trusted. At most 20 derived values. Derived values are computed per candidate after the base
draw, before the constraints. They are server/teacher data: a student sees a derived value only if the stem displays it.

## 6. Constraints

Each constraint is **exactly one comparison** (`==`, `!=`, `<`, `<=`, `>`, `>=`) between two language-2 expressions over base and
derived values; the list is a conjunction (all must hold). Decision: a list of single comparisons is safer and easier to read than a
logical sub-grammar (`&&`, `||`, `!` stay outside the language), while still expressing every conjunctive condition.
Retry policy: per candidate, constraints are checked in declared order; a failing or non-evaluable constraint rejects the candidate;
at most **100** candidates (a counted loop — no `while`); then `GEN_CONSTRAINTS_UNSATISFIED` (fail closed, nothing weakened).

## 7. Formatting and grading semantics

Formats (`plain` — 12 significant digits; `fixed` — exactly `decimals` places; `percentage` — value × 100 with `decimals` places and
«%») apply to variables and derived values **in the rendered stem only**. Rounding is half away from zero; `decimals` 0..10;
anything else is `PARAM_FORMAT_INVALID`. No IP-address or other domain formats in the generic engine.

**Grading rule (explicit):** the official expected value is the answer expression evaluated on the **exact** official values
(base + derived), never on displayed strings; the student's number is compared with that value as written (tolerance / range,
numericResponse comparison). Consequences, all tested:
* t = 3.75 displayed as `3.8` ⇒ the expected speed is 32 / 3.75 = 8.533…, not 32 / 3.8 (8.42 is wrong).
* There is no hidden rescaling: for a percentage question write `100 * correct / total` with unit label `%` (5 of 27 ⇒ 18.518…,
  «18.5» accepted with tolerance 0.05; «0.185» is wrong).
* If the stem shows rounded values, choose a tolerance that covers the rounding, or round explicitly with `round()`.

## 8. Examples

| Domain | Stem | Model |
|---|---|---|
| Mathematics | مستطيل طوله {{a}} سم وعرضه {{b}} سم. احسب مساحته. | a, b integer; derived `area = a * b`; constraint `a != b`; answer `area` |
| Networking | شبكة ببادئة /{{p}}. كم عنوانًا قابلًا للاستخدام؟ | p integer 24..30; derived `hosts = 2 ^ (32 - p) - 2`; answer `hosts` |
| Physics | قطع جسم {{d}} مترًا في {{t}} ثانية. ما متوسط سرعته؟ | d decimal 10..50 step 0.5; t decimal 2..8 step 0.25; derived `speed = d / t` (fixed 2); answer `speed`, tolerance 0.01, unit label «م/ث» |
| Percentage | أجاب طالب عن {{correct}} من {{total}} سؤالًا إجابة صحيحة. ما النسبة المئوية؟ | total 10..40, correct 0..40; constraint `correct <= total`; answer `100 * correct / total`, tolerance 0.05, label «%» |

## 9. Teacher sample generator and solution inspector

`previewParametricSamples(node, 3 | 5 | 10, start)` generates PREVIEW-namespace instances (`["smartassess.parametric", 2,
"preview", questionKey, n]` — never equal to an official seed), each with base values, derived values, the rendered stem, every
constraint with both evaluated sides, the answer expression, the exact expected value, the comparison policy and the accepted
candidate number. The editor's «توليد العينات» section lists them («عينات أخرى» shows the next window) and «فحص الحل للعينة N» opens
the inspector. It is pure and local: no fetch, no attempt, nothing written onto the question, never part of a student payload.
The review of a v2 attempt (`assignment-review` → `parametricReviewInstance`) adds the derived values and the constraint evaluation of
the EXACT official instance (same authority as grading). Both are teacher-only (Builder auth / teacher platform chunk).

## 10. Builder UX

Eight sections — المتغيرات، القيم المشتقة، القيود، نص السؤال، صيغة الإجابة، مقارنة الإجابة، تنسيق العرض، توليد العينات — form
controls only (no JSON, no AST words), expressions LTR inside the RTL UI, inline canonical validation (duplicate names, unknown
symbols, invalid range / step / precision, cycles, unsupported functions, impossible constraints, failing samples) long before
publication. v1 questions keep the 19B editor plus the explicit upgrade button.

## 11. Security model

* **Server authority:** the official identity, generation, derived values, answer computation, validation, grading and replay are
  server-side and unchanged in principle from 19B; the client never chooses the seed.
* **Forgery:** ingest keeps exactly `{ kind: "numeric", value, unit? }`; a forged seed, generated / derived values, expected value,
  format or version override is dropped before storage and ignored by the grader (tested at the grader too).
* **Secrecy:** the student projection keeps the 19B shape (`v / status / generatorVersion / values / response`) with `values` limited to
  the symbols the stem shows; formulas, derived values the stem does not show, constraints, the expected value and preview / inspector
  data never reach a student (projection reader rejects any extra field).
* **Bounded work (complexity budgets):** source ≤ 500 chars (constraint ≤ 300), ≤ 200 tokens, ≤ 160 AST nodes (language 2), depth ≤ 32,
  ≤ 20 variables, ≤ 20 derived values, ≤ 20 constraints, ≤ 10 function arguments, ≤ 100 candidates, |value| ≤ 10^15, |exponent| ≤ 64,
  ≤ 6 authored decimals, ≤ 10^7 positions per variable, format / round decimals ≤ 10.

## 12. AI validation

The AI schema offers v2 rows (`kind`, numeric bounds / step, `format`) and `derivedVariables`. A payload with `derivedVariables`
maps field by field to a v2 node (`name` → `id`, `plain` formats omitted); a Phase 19B-shaped payload still maps to v1. Every draft
goes through `verifyAiQuestionNode` → the structured-exam quality gate → `validateParametricNumericQuestion` (server and Builder
dialog). Refused with the canonical issues, never repaired: unknown functions, invalid / misaligned decimal steps, cyclic or
unknown derived references, impossible constraints, unsafe expressions, non-finite answers, malformed formats, excessive complexity.

## 13. Bundle

The 125 KB initial-graph guard (128,000 bytes, gzip level 9) is unchanged. Measured on the same build pipeline:

| Tree | Initial graph (gzip) | Headroom |
|---|---|---|
| Baseline `751003f` (Phase 19B merged) | 127,376 bytes | 624 bytes |
| Phase 19C head | 127,407 bytes | 593 bytes |

The +31 bytes come from the v2 default literal in `questionTypeDefaults.ts` (statically imported by the question-type
registry). The editor (with the sample generator and inspector), the engine and the review view are lazy
(`PARAMETRIC_SIGNATURES` now also covers the inspector and the review constraint list, so a regression that pulls them into
the initial graph fails the build).

## 14. Future domain-adapter seam (not implemented)

The engine stays domain-neutral. A future adapter (networking, mathematics, physics, chemistry) plugs in **without changing the
generic engine** as a new, separately versioned contract layer:

1. a new config version (e.g. `v: 3`) or a declared `profile` key, dispatched by `checkConfig` exactly like v1 / v2 today;
2. typed values beyond numbers (IPv4 address, CIDR prefix, quantity-with-unit) generated by pure, bounded adapter generators that
   receive the same seeded stream;
3. a closed set of adapter functions registered under that version only (e.g. `ipv4.network(addr, prefix)`), parsed by the same
   parser with an extended whitelist and evaluated with typed domain checks — never host code;
4. adapter formats (dotted quad, scientific with units) in the presentation layer, and an adapter answer kind / comparator when a
   numeric answer is not enough.

Nothing of this exists yet; the v1 / v2 numeric contracts are unaffected by it.

## 15. Limitations (intentional)

No symbolic algebra, CAS, unit conversion, IPv4 parsing / subnet-address arithmetic, chemistry balancing, graph plotting,
student-written formulas, arbitrary JavaScript / Python, external calculators or grading APIs; no scientific display format; no
`&&` / `||` in constraints; integer / decimal variables only (no categorical or non-uniform distributions); no partial credit; not a
compound part; practice and live challenges deliver no parametric instance (unavailable there; grading without an identity goes to
manual review). No database migration and no infrastructure change.
