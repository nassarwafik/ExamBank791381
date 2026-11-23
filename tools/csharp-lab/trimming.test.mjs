import { describe, it, expect } from "vitest";
import fs from "node:fs";

// Visual lab V6 (docs/enterprise-csharp-visual-lab-plan.md §14) — the lab's download is trimmed SELECTIVELY. Two lists must agree:
// the libraries CSharpLab.csproj keeps WHOLE (its first TrimmerRootAssembly group) and Lab.cs's KeptWhole, the libraries a program
// may use (anything else is refused as LAB0001 before it runs). A library kept whole but not allowed is waste; one allowed but not
// kept whole could fail half-way at run time — so they must be the same.
const csproj = fs.readFileSync(new URL("./CSharpLab.csproj", import.meta.url), "utf8");
const lab = fs.readFileSync(new URL("./Lab.cs", import.meta.url), "utf8");

describe("V6 — the trimmed lab's two lists agree", () => {
  it("partial trimming is on (Roslyn and the lab are never trimmed)", () => {
    expect(csproj).toMatch(/<PublishTrimmed>true<\/PublishTrimmed>/);
    expect(csproj).toMatch(/<TrimMode>partial<\/TrimMode>/);
  });
  it("the libraries kept whole = the libraries a program may use", () => {
    const groups = [...csproj.matchAll(/<ItemGroup>([\s\S]*?)<\/ItemGroup>/g)].map(m => [...m[1].matchAll(/<TrimmerRootAssembly Include="([^"]+)" \/>/g)].map(x => x[1]));
    const keptWhole = groups.find(g => g.length > 0) ?? [];
    const allRoots = groups.flat();
    const block = lab.match(/KeptWhole = new HashSet<string>\s*\{([\s\S]*?)\};/);
    expect(block).not.toBeNull();
    const allowed = [...block[1].matchAll(/"([^"]+)"/g)].map(m => m[1]);
    expect([...allowed].sort()).toEqual([...keptWhole].sort());
    expect(allowed).toContain("System.Private.CoreLib");
    for (const a of allowed) expect(allRoots).toContain(a);
  });
});
