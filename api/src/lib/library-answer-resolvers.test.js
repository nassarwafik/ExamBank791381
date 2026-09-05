import { describe, it, expect } from "vitest";
import { resolveAkAnswers, resolveGCallAnswers, resolveAnswerMap } from "./library-answer-resolvers.js";

describe("resolveAkAnswers - the const AK = {...} answer key (F01/F04)", () => {
  it("parses a flat qid->value map, keeping strings and dropping nested objects", () => {
    const html = `<script>const AK = { q1:'a', q2:'b', q15_1:'1a', note:{skip:true} };</script>`;
    const map = resolveAkAnswers(html);
    expect(map.get("q1")).toBe("a");
    expect(map.get("q15_1")).toBe("1a");
    expect(map.has("note")).toBe(false);
  });

  it("returns an empty map when there is no AK object", () => {
    expect(resolveAkAnswers("<script>const X=1;</script>").size).toBe(0);
  });
});

describe("resolveGCallAnswers - inline g('id','value') grader calls (F02)", () => {
  it("extracts every g() call's id and expected answer", () => {
    const html = `g('s1q1','غير صحيح',v); g("s1q2", "b", x);`;
    const map = resolveGCallAnswers(html);
    expect(map.get("s1q1")).toBe("غير صحيح");
    expect(map.get("s1q2")).toBe("b");
  });
});

describe("resolveAnswerMap - picks whichever convention the file uses", () => {
  it("prefers AK when present", () => {
    const html = `const AK = { q1:'a' }; g('q1','WRONG',v);`;
    expect(resolveAnswerMap(html).get("q1")).toBe("a");
  });

  it("falls back to g() calls when there is no AK", () => {
    expect(resolveAnswerMap("g('s1q1','b',v)").get("s1q1")).toBe("b");
  });
});
