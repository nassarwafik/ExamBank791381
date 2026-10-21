# Secrecy canaries and live values (T-1)

A secrecy test plants recognisable values in private data (hidden tests, answer keys, weights, coordinates) and then asserts
that a payload, the DOM, a request, storage or a log does **not** contain them: `expect(text).not.toMatch(CANARIES)`. Such
a test fails in two ways: when the value really leaks, and when the canary also matches something that is not the value. The
second kind is a false leak report. It is rare, random, and it turns `main` red with no defect behind it.

The 19D hotfix (#377) was the first case seen in CI. The canary `0\.557` matched the timestamp `"…:50.557Z"` in the
payload's `dueAt`. T-1 audits every other canary in the repository for the same defect.

## The rule

A canary that is a **number** must match it only as a **whole number**:

```js
/(?<![\d.])9\.17(?!\d)/          // not /9\.17/
```

The reason is that payloads, DOM text, requests, storage and logs carry live values that change on every run:

- ISO timestamps `…:SS.mmmZ`;
- epoch milliseconds;
- UUIDs and hex identifiers.

An ISO timestamp always has three millisecond digits. An unanchored `A\.B` therefore matches whenever the seconds end in `A`
and the milliseconds start with `B`. For `9\.17` that happens to one timestamp in a thousand, and every payload carries
several timestamps.

A canary that is a word or a token (`HIDDEN_LABEL_CANARY_17EB`, `"regions"`, `target-router`) needs nothing. When you add a
numeric canary, add the case that pins it, as both T-1 tests do:

- a fixed clock whose timestamp holds the digits, with no false leak;
- the value written as a JSON number, an array element and text, which still matches;
- another number holding the digits (`19.17`, `9.175`), which does not match.

## The audit

The audit used two methods.

1. **Static scan.** Every regular-expression and string canary in a negative assertion, or assigned to a canary constant, was
   tested against a generated corpus of each kind of live value:
   - every `SS.mmm` and `HH:MM` of an ISO timestamp, and three years of dates;
   - 60 000 epoch values, UUIDs, hex and base64url identifiers, and `Math.random()` values.

   This flagged 63 assertion sites for timestamps alone. The scan cannot tell whether the subject of the assertion contains a live
   value, so this is only a candidate list.
2. **Two recorded runs of the whole root suite.** A Vitest setup file outside the repository recorded every negative
   `toMatch` / `toContain` on a string subject: 20 930 assertions. For each, it kept the live-looking tokens its subject
   carried. The suite then ran a second time. A token class whose values differed between the two runs is **live** for that
   assertion: 537 assertions qualified.

   Each such assertion was then tested against shape-preserving variants of its **own** live tokens:
   - an ISO timestamp, with every time of day;
   - a hex run, with random hex of the same length.

   This counts only matches that can really happen.

### Results

| Canary | Where | Live values in the subject | Verdict |
|---|---|---|---|
| `9\.17` (the hidden weight) | `api/tests/coding-17e-b-practice.test.js` P16 | `dueAt`, `startedAt`, `endsAt`, `draftSavedAt` | **false leak possible**: 60 of 61 440 times of day per timestamp. Fixed. |
| `9\.17` (the hidden weight) | `src/questionTypes/coding.17e-b.test.tsx`, the autosave × run E2E (3 assertions) | autosave timestamps in requests and storage | **false leak possible**, same rate. Fixed. |
| 8 word canaries (`cs1`, `rp_`, `cg_`, `q1`, `sub\b`, `--`, …) | 17C, 17D-B1, 20D, 20G, 7B, 16B-A | hex job / target ids and UUIDs | **clear**: hex and UUID alphabets cannot spell them. |
| the other 61 timestamp candidates of the static scan: numbers (`29\.5`, `9\.83`, `3\.75`, `2\.5`, `999`, …), digit classes, `:` | parametric numeric, smart-sim, certification and UI suites | none (fixed or no timestamps) | **clear today**: their subjects carry no live value. They follow the rule above when someone adds one. |

The tests added by #384 and #385, which merged into `main` during the phase, were recorded twice as well. They have no live
assertion at risk.

## Evidence

- **Fail-first** on `18d66eff`, with the new tests and the old canary, 2 of 52 tests fail:
  - P16b: `expected '{"ok":true,"assignment":…' not to match /HIDDEN_STDIN_CANARY_17EB|…/`. The payload under the
    `…:09.170Z` clock.
  - T-1 UI: `expected '{"savedAt":"2026-10-20T19:20:09.170Z"…' not to match …`.
- **Mutation campaign.** 8 mutants, 4 in each file, all KILLED:
  - M1: the lookbehind dropped;
  - M2: the lookahead dropped, which reproduces the defect;
  - M3: the weight canary removed;
  - M4: the weight matched only inside quotes.

  Each file was restored byte-for-byte and SHA-256 verified.

## Not done

The audit tools (the static scanner and the two-run recorder) are not committed. They read the whole suite and take minutes.
A permanent guard would have to run the suite twice inside the suite. The rule above and the pinning cases are the lasting
part. Runner tests (`npm --prefix runner test`, Node test runner) were not recorded. The static scan found no numeric canary
there.
