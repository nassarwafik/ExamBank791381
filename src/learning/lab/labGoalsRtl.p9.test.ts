// 791381s Phase 9 (docs/enterprise-791381s-enrichment-plan.md §20) — DEFECT found by the final audit's screenshots: a network-lab
// goal that begins with a device name («SW1: المنفذ g0/1 في وضع Trunk», «R1: …», «PC1 …») was laid out left-to-right and its
// Arabic words appeared scrambled («Trunk في وضع g0/1 المنفذ :SW1»): the goal label used `unicode-bidi: plaintext`, which takes
// the paragraph direction from the FIRST strong character (a Latin one here). The goals now inherit the page's RTL direction
// (the Latin runs — SW1, g0/1, dot1Q, 192.168.10.254 — still render left-to-right inside it, as everywhere in the booklet).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

describe("lab goals and exam-item texts keep the page's RTL direction", () => {
  it("no `unicode-bidi: plaintext` in the lab or exam-item styles (a goal starting with «SW1:» must stay RTL)", () => {
    for (const rel of ["./lab.css", "../examItem/examItem.css"]) expect(read(rel), rel).not.toMatch(/unicode-bidi\s*:\s*plaintext/);
  });
});
