import { describe, it, expect } from "vitest";
// Phase 11B — the API keeps its own CSV encoder (CommonJS; no route streams CSV today). It must apply exactly the
// same formula-injection rule as the one client encoder, so the two can never drift apart.
import { csvCell as serverCell, toCsv as serverCsv } from "../src/lib/reports/aggregate.js";
import { csvCell as clientCell, toCsv as clientCsv } from "../../src/reports/csv.ts";

const SAMPLES = [
  "=SUM(1,1)", " =SUM(1,1)", "   +1+1", " \t=1+1", " \r=1+1", "    @cmd", " \t \t-2+3", "\n=1", " =1", "‏=1", "﻿@x", "\u0001=1",
  "\t1", "\r1", "-1", "+972500000", "محمد", "  محمد", " 12", "a=b", "user@example.com", 'اسم "الطالب"', "", 12, 0, null, undefined
];

describe("server CSV guard == client CSV guard (11B)", () => {
  it("every sample encodes identically", () => {
    for (const v of SAMPLES) expect(serverCell(v), JSON.stringify(v)).toBe(clientCell(v));
  });
  it("whole documents encode identically", () => {
    const rows = [["a", " =x"], ["\t@y", 3]];
    expect(serverCsv(rows)).toBe(clientCsv(rows));
  });
  it("leading-whitespace formulas are prefixed on the server too", () => {
    expect(serverCell(" =SUM(1,1)")).toBe("\"' =SUM(1,1)\"");
    expect(serverCell(" \t-2+3")).toBe("\"' \t-2+3\"");
  });
});
