import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { parseMath } from "./richMath";
import { oldGrammarCandidates } from "./testing/mathCorpus";

// Phase 21A — OLD-GRAMMAR FREEZE. Scientific Math v2 must be a strict superset of the Phase 20D.1 subset: every expression the 20D.1
// parser accepted keeps a byte-identical AST, and nothing it refused becomes accepted unless it is a documented v2 construct. The pins
// below were CAPTURED ON THE UNTOUCHED BASELINE 60ddadc (CAPTURE_21A_FREEZE=1 in a detached worktree), before any 21A parser change.
//   1. the repository corpus: every math source found in fixtures / tests / docs / editor defaults at 60ddadc;
//   2. 60,000 deterministic old-grammar candidates in 10 independent slices of 6,000 (seeds 21001…21010; each slice is its own test so no
//      single test carries the whole corpus): half plain, half corrupted (malformed, refused commands, v2 look-alikes).
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
const SLICES = 10, PER_SLICE = 6000;
/** Per-slice pins: [accepted, refused, marked, acceptedDigest, refusedDigest] (seed 21001 + slice). */
const PINS: [number, number, number, string, string][] = [
  [2064, 3051, 885, "8ec5a477d74d02a7cba0887ed5c5e5a58557c8ffcf97974808d2a26f8b170611", "02aef5506525fcd0f7084dda8beed566d4dc795f82f7ca154a5562d5830b9a3b"],
  [2037, 3051, 912, "e62a0e1dd4fdaf6de07957564a751392d42e70a6645ea28653ad6047e2218eb3", "8fc10e6c53e76c5feb556fa309a7d86f5bb96bfb8292778237b8b89ca95a63aa"],
  [2062, 3017, 921, "8eea38f9e180366b3ed4605affabe297d06d144c0227f89476cf1b443e34755f", "4b277dadcedc442a689ec7d66fac4a522266f9e7420e87a9713f441eba8b79f7"],
  [2052, 3015, 933, "ef03b08c5fa08ca54c60a4eb7a05c7ae272b872fa4709ba47d35cc860c4bd651", "1cd4a0a788c6c867045ffef0e951dacbd9f7e8940f1dc04d93b06ffdb7b5757c"],
  [2053, 3062, 885, "c5620a8666f0db5fe0392b6f25503a5c3d312c29bf05011fea228b58e01960d1", "8570ee0fe25ba14c749bfa1b94a0d9e6feaf7334f98dc8e69eca46e86dc867a8"],
  [2050, 3003, 947, "da14f747ea2dcbe84f24b5c8cde37272a551007a03455ca06c6e423f278460b3", "4af927997fc9f97ad333ecc673b656e7097fd911b04c7df0533d1e56891001cd"],
  [2021, 3054, 925, "68fe053b00d95e85d45790dcb824e349ccd00bde7b710228ac3f624a7b81a1dc", "fbd99173c7a733be935731627a4e1eb27cc18d60eb9eed2f35a5f425bf4368aa"],
  [2037, 3043, 920, "8fb79926c5be6ce1afaf7192066546ddb052e8f36af78946ee8408fda2b06ca9", "1a42f862783ff5f1bee0abe16fa0703ac9c612a2326bb9f3e1f78c0a361d35d8"],
  [2017, 3070, 913, "412be8bad082d1d5d3934b5c3af11b237cb787cb0ce9c45b75fd1eba260f4d19", "8b38d2e3c763f83889e64dd3576a57c72adf52b6e761d744fd3005aa98233900"],
  [2038, 3041, 921, "c2f1f2d6fc474d625e6eed524f3b8b67837b37916ebbd7166bd6fc83847a2bee", "bb0763469605dc2da09e9fb68575183c77c64bbcf03d06b436056de4a3c32e4d"]
];
describe("21A-FREEZE old-grammar compatibility (pins captured on 60ddadc)", () => {
  it("the repository corpus: every math source in fixtures / tests / docs keeps its verdict and its exact AST", () => {
    const rows = REPO.map(([s, ok]) => { const p = parseMath(s); expect(p.ok, s.slice(0, 80)).toBe(ok); return p.ok ? [s, p.ast] : [s, null]; });
    if (CAPTURE) { console.log("PIN_REPO_DIGEST", digest(rows)); return; }
    expect(digest(rows)).toBe(PIN_REPO_DIGEST);
  });
  for (let k = 0; k < SLICES; k++) {
    it(`old-grammar candidates, slice ${k + 1}/${SLICES} (6,000, seed ${21001 + k}): accepted ones keep identical ASTs, refused ones stay refused; v2 look-alikes widen only for real v2 syntax`, () => {
      const next = oldGrammarCandidates(21001 + k);
      const acc = createHash("sha256"), ref = createHash("sha256");
      let accepted = 0, refused = 0, marked = 0;
      for (let i = 0; i < PER_SLICE; i++) {
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
      const got: [number, number, number, string, string] = [accepted, refused, marked, acc.digest("hex"), ref.digest("hex")];
      if (CAPTURE) { console.log("PIN_SLICE", k, JSON.stringify(got)); return; }
      expect(got).toEqual(PINS[k]);
    });
  }
  it("the sliced corpus is the 60,000-candidate scale with at least 20,000 accepted old-grammar expressions", () => {
    if (CAPTURE) return;
    expect(PINS).toHaveLength(SLICES);
    expect(SLICES * PER_SLICE).toBe(60000);
    expect(PINS.reduce((n, p) => n + p[0], 0)).toBeGreaterThanOrEqual(20000);
  });
});
