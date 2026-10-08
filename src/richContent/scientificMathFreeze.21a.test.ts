import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { parseMath } from "./richMath";
import { oldGrammarCandidates } from "./testing/mathCorpus";

// Phase 21A — OLD-GRAMMAR FREEZE. Scientific Math v2 must be a strict superset of the Phase 20D.1 subset: every expression the 20D.1
// parser accepted keeps a byte-identical AST, and nothing it refused becomes accepted unless it is a documented v2 construct. The pins
// below were CAPTURED ON THE UNTOUCHED BASELINE 60ddadc (CAPTURE_21A_FREEZE=1 in a detached worktree), before any 21A parser change.
//   1. the repository corpus: every math source found in fixtures / tests / docs / editor defaults at 60ddadc;
//   2. 60,000 deterministic old-grammar candidates (seed 21001): half plain, half corrupted (malformed, refused commands, v2 look-alikes).
const digest = (x: unknown) => createHash("sha256").update(typeof x === "string" ? x : JSON.stringify(x)).digest("hex");
const CAPTURE = process.env.CAPTURE_21A_FREEZE === "1";

const REPO: [string, boolean][] = [
  ["a = -g", true], ["\\lim_{x\\to\\infty} \\frac{1}{x}", true], ["h = \\frac{1}{2} g t^{2}", true], ["h", true], ["v = v_{0} + g t", true],
  ["\\sqrt{a^{2} + b^{2}}", true], ["E = m c^{2}", true], ["x^2", true], ["a^{2} + b^{2} = c^{2}", true], ["x^{2}", true], ["\\frac{a}{b}", true],
  ["v = g t", true], ["v_0 = 0", true], ["y", true], ["\\href{javascript:x}{y}", false], ["\\def\\x{1}", false], ["\\frac{1}{2", false],
  ["x".repeat(2001), false], ["\\sqrt[3]{x}", true], ["v_0 + a t", true], ["\\Delta x \\approx 9.8 \\times 2", true], ["\\text{السرعة} = \\frac{d}{t}", true],
  ["\\left( a + b \\right)^{2}", true], ["\\sum_{i=1}^{n} i", true], ["\\href{x}{y}", false], ["\\url{x}", false], ["\\html{x}", false], ["\\style{x}", false],
  ["\\class{x}{y}", false], ["\\def\\a{1}", false], ["\\newcommand{\\a}{1}", false], ["\\input{x}", false], ["\\unknown", false],
  ["\\sqrt{".repeat(26) + "x" + "}".repeat(26), false], ["x+".repeat(600) + "x", false], ["\\sqrt{\\sqrt{x}}", true], ["x+".repeat(50) + "x", true],
  ["\\frac{d}{t}", true], ["\\frac{1}{2} g t^{2}", true], ["\\sqrt{x}", true], ["\\href{https://x}{y}", false], ["\\vec ".repeat(30) + "x", false],
  ["\\sqrt ".repeat(30) + "x", false], ["\\frac 1".repeat(30) + "2", false], ["\\vec v + \\sqrt 2", true]
];
const PIN_REPO_DIGEST = "458f395837e00cb21f35f7eaa85a695f5e7b1bc729e9c014b780b62aa6036928";

/** A v2 look-alike the 20D.1 parser refused: v2 may accept it ONLY when it carries a documented v2 construct. */
const V2_MARK = /\\(begin|end|mathbb|iint|iiint)(?![A-Za-z])|&|\\\\/;
const V2_LEGIT = /\\begin\{matrix\}|\\mathbb\{R\}|\\iint(?![A-Za-z])/;
const CANDIDATES = 60000;
const PIN = { accepted: 20508, refused: 30379, marked: 9113, acceptedDigest: "1b4bc8933736e37bb073461879952838cfe9f8aa5159cbef7d6be33da1b0a9d8", refusedDigest: "af1a560006538784a0b4d5b7331579b7be7b5a30da6e8cebadbfe5e989af010e" };

describe("21A-FREEZE old-grammar compatibility (pins captured on 60ddadc)", () => {
  it("the repository corpus: every math source in fixtures / tests / docs keeps its verdict and its exact AST", () => {
    const rows = REPO.map(([s, ok]) => { const p = parseMath(s); expect(p.ok, s.slice(0, 80)).toBe(ok); return p.ok ? [s, p.ast] : [s, null]; });
    if (CAPTURE) { console.log("PIN_REPO_DIGEST", digest(rows)); return; }
    expect(digest(rows)).toBe(PIN_REPO_DIGEST);
  });
  it("60,000 deterministic old-grammar candidates: accepted ones keep identical ASTs, refused ones stay refused; v2 look-alikes widen only for real v2 syntax", () => {
    const next = oldGrammarCandidates(21001);
    const acc = createHash("sha256"), ref = createHash("sha256");
    let accepted = 0, refused = 0, marked = 0;
    for (let i = 0; i < CANDIDATES; i++) {
      const s = next();
      const p = parseMath(s);
      if (V2_MARK.test(s)) {
        marked++;
        if (CAPTURE) expect(p.ok, "baseline accepted a v2 look-alike: " + s.slice(0, 80)).toBe(false);
        else if (p.ok) expect(V2_LEGIT.test(s), "a v2 look-alike was accepted without a documented v2 construct: " + s.slice(0, 120)).toBe(true);
        continue;
      }
      if (p.ok) { accepted++; acc.update(s).update("\u0000").update(JSON.stringify(p.ast)).update("\u0001"); }
      else { refused++; ref.update(s).update("\u0001"); }
    }
    const got = { accepted, refused, marked, acceptedDigest: acc.digest("hex"), refusedDigest: ref.digest("hex") };
    if (CAPTURE) { console.log("PIN", JSON.stringify(got)); return; }
    expect(got).toEqual(PIN);
    expect(accepted).toBeGreaterThanOrEqual(20000);
  });
});
