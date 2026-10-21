/// <reference types="node" />
// Phase UX-R1 — the project charts' FALLBACK colours are a copy of design-tokens.css (Chart.js needs resolved strings, and the
// live token is unreadable where CSS is not loaded — under Vitest, in a print frame, before the stylesheet arrives). A token
// change that forgets the copy leaves the charts in the old palette with no failing check, so the copy is compared with the
// token sheet here. happy-dom resolves no stylesheet, so tokenColor() returns exactly the fallback.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { tokenColor } from "./chartPalette";

const tokens = readFileSync(join(fileURLToPath(new URL("..", import.meta.url)), "design-tokens.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const tokenHex = (name: string) => {
  const m = new RegExp(name + ":\\s*(#[0-9a-fA-F]{6})\\b").exec(tokens);
  if (!m) throw new Error(name + " is not a literal hex colour in design-tokens.css");
  return m[1].toLowerCase();
};

describe("UX-R1 — chart fallback colours mirror design-tokens.css", () => {
  for (const name of ["--eb-primary", "--eb-primary-strong", "--eb-primary-300", "--eb-info", "--eb-success", "--eb-warn", "--eb-danger", "--eb-line-2", "--eb-faint", "--eb-muted"]) {
    it(name, () => {
      expect(tokenColor(name).toLowerCase()).toBe(tokenHex(name));
    });
  }
});
