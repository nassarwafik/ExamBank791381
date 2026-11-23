import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The book's classes in the C# editor's runs («مبنى المعطيات», 899271d): the served copy is the PROVEN library byte for byte
// (scripts/ds-course/unit4/Unit4.cs, compiled with every course program by prove-dotnet.mjs); it is appended after the program
// (line numbers kept); a class the writer declares is left out (no duplicate); other courses get nothing.
const cjs = createRequire(import.meta.url);
const L = cjs("../src/lib/course-library.js");
const ROOT = join(import.meta.dirname, "..", "..");

describe("course library — the book's classes", () => {
  it("the served copy is the proven library, byte for byte (no drift)", () => {
    expect(readFileSync(join(ROOT, "api/src/data/course-libraries/899271d.cs"), "utf8")).toBe(readFileSync(join(ROOT, "scripts/ds-course/unit4/Unit4.cs"), "utf8"));
  });
  it("899271d has the five classes of the book, with the book's members; other courses and inherited names have none", () => {
    const cls = L.libraryClasses("899271d");
    expect(cls.map(c => c.key)).toEqual(["Node/0", "Node/1", "BinNode/1", "Stack/1", "Queue/1"]);
    const code = Object.fromEntries(cls.map(c => [c.key, c.code]));
    for (const m of ["public bool IsEmpty()", "public void Push(T x)", "public T Top()", "public T Pop()"]) expect(code["Stack/1"]).toContain(m);
    for (const m of ["public bool IsEmpty()", "public T Head()", "public void Insert(T x)", "public T Remove()"]) expect(code["Queue/1"]).toContain(m);
    for (const m of ["public T GetValue()", "public Node<T> GetNext()", "public void SetNext(Node<T> Next)", "public bool HasNext()"]) expect(code["Node/1"]).toContain(m);
    for (const m of ["public BinNode<T> GetLeft()", "public BinNode<T> GetRight()", "public bool HasLeft()", "public bool HasRight()"]) expect(code["BinNode/1"]).toContain(m);
    for (const c of cls) expect(c.code.trim().endsWith("}"), c.key).toBe(true);
    for (const id of ["791381", "899371", "toString", "__proto__", ""]) expect(L.libraryClasses(id), id).toEqual([]);
  });
  it("appended AFTER the program (line numbers kept); a class the writer declares is left out; arity matters", () => {
    const program = "public class Program { static void Main()\n{\n    var s = new Stack<int>();\n}\n}\n";
    const out = L.withCourseLibrary("899271d", program, "static void Main() {}");
    expect(out.startsWith(program)).toBe(true);
    for (const h of ["public class Node\n", "public class Node<T>", "public class BinNode<T>", "public class Stack<T>", "public class Queue<T>"]) expect(out).toContain(h);
    const mine = "public class Stack<T> { public void Push(T x) {} }\nclass P { static void Main() { } }";
    const withMine = L.withCourseLibrary("899271d", mine, mine);
    expect(withMine).not.toContain("public T Top()");                 // the book's Stack<T> left out: the writer's is compiled
    expect(withMine).toContain("public class Queue<T>");
    expect(withMine).toContain("public class Node<T>");
    const nonGeneric = "class Node { }\nclass P { static void Main() { } }";
    const keepsGeneric = L.withCourseLibrary("899271d", nonGeneric, nonGeneric);
    expect(keepsGeneric).toContain("public class Node<T>");           // Node (0) declared by the writer ≠ Node<T> (1)
    expect(keepsGeneric).not.toMatch(/public class Node\n/);
    expect(L.withCourseLibrary("791381", program, program)).toBe(program);
  });
});
