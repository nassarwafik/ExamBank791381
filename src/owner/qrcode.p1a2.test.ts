import { describe, it, expect } from "vitest";
import { encodeQr, qrPath } from "./qrcode";
import fixtures from "./qrcode.fixtures.json";

// Tadris+ P1-A2 — the in-house QR encoder. The fixtures are the `qrcode` npm package's output (byte mode, level M, fixed mask)
// for five inputs covering versions 1, 3, 8, 9 and 11 (version information from 7, a 16-bit length field from 10, UTF-8 Arabic).
// Before committing, the encoder was also compared module-for-module with that package for 1,242 matrices (every version 1–20,
// all 8 masks) and every auto-masked code was decoded back with jsQR (docs/enterprise-owner-screens-p1a2.md §4).

const asBits = (rows: boolean[][]) => rows.map(r => r.map(v => (v ? "1" : "0")).join(""));

describe("P1-A2 QR encoder", () => {
  it.each(fixtures.cases.map(c => [c.version, c.mask, c.text] as const))("v%i mask %i matches the reference module-for-module: %s", (version, mask, text) => {
    const ref = fixtures.cases.find(c => c.text === text)!;
    const m = encodeQr(text, { mask });
    expect(m.version).toBe(version);
    expect(m.size).toBe(version * 4 + 17);
    expect(asBits(m.modules)).toEqual(ref.rows);
  });

  it("chooses the smallest version that holds the text (an otpauth link fits in a small code)", () => {
    const uri = fixtures.cases[1].text;
    expect(encodeQr(uri).version).toBe(fixtures.cases[1].version);
    expect(encodeQr("A").version).toBe(1);
  });

  it("the automatic mask is one of 0–7 and the format information encodes level M with that mask", () => {
    const m = encodeQr(fixtures.cases[1].text);
    expect(m.mask).toBeGreaterThanOrEqual(0);
    expect(m.mask).toBeLessThanOrEqual(7);
    // Read the 15 format bits around the top-left finder (ISO/IEC 18004 §7.9) and undo the 0x5412 mask.
    let bits = 0;
    const at = (x: number, y: number) => (m.modules[y][x] ? 1 : 0);
    const order: Array<[number, number]> = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
    order.forEach(([x, y], i) => { bits |= at(x, y) << i; });
    const data = (bits ^ 0x5412) >>> 10;
    expect(data >>> 3).toBe(0);            // level M
    expect(data & 7).toBe(m.mask);
  });

  it("draws the three finder patterns and the always-dark module", () => {
    const m = encodeQr("Tadris+");
    const n = m.size;
    for (const [x0, y0] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
      for (let i = 0; i < 7; i++) {
        expect(m.modules[y0][x0 + i]).toBe(true);
        expect(m.modules[y0 + 6][x0 + i]).toBe(true);
      }
      expect(m.modules[y0 + 3][x0 + 3]).toBe(true);
      expect(m.modules[y0 + 1][x0 + 1]).toBe(false);
    }
    expect(m.modules[n - 8][8]).toBe(true);
  });

  it("refuses text longer than version 20 holds, and an invalid mask", () => {
    expect(() => encodeQr("x".repeat(666))).not.toThrow();
    expect(() => encodeQr("x".repeat(667))).toThrow(/too long/);
    expect(() => encodeQr("x", { mask: 8 })).toThrow();
  });

  it("the SVG path has one square per dark module, offset by the quiet zone", () => {
    const m = encodeQr("Tadris+");
    const dark = m.modules.flat().filter(Boolean).length;
    const d = qrPath(m, 4);
    expect(d.match(/M/g)?.length).toBe(dark);
    expect(d.startsWith("M4,4h1v1h-1z")).toBe(true);
  });
});
