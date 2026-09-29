import { describe, it, expect } from "vitest";
import { formatCoverageNumber, formatPercent, formatDelta } from "./coverageFormat";

// Phase 13C-B — the ONE display helper: rounding happens here, never inside the pure engine.
describe("coverage display helpers", () => {
  it("integers stay integers; fractions show at most two decimals; float drift collapses", () => {
    expect(formatCoverageNumber(5)).toBe("5"); expect(formatCoverageNumber(2.5)).toBe("2.5"); expect(formatCoverageNumber(4 / 3)).toBe("1.33");
    expect(formatCoverageNumber(0.1 + 0.2)).toBe("0.3"); expect(formatCoverageNumber(-0)).toBe("0");
  });
  it("percentages round to one decimal and 99.999999999 reads as 100%", () => {
    expect(formatPercent(99.999999999)).toBe("100%"); expect(formatPercent(100 / 3)).toBe("33.3%"); expect(formatPercent(40)).toBe("40%"); expect(formatPercent(0)).toBe("0%");
  });
  it("deltas carry a sign and the unit (percentage points vs absolute)", () => {
    expect(formatDelta(-8, "percent")).toBe("−8 نقاط مئوية"); expect(formatDelta(1, "absolute")).toBe("+1"); expect(formatDelta(-2.5, "absolute")).toBe("−2.5"); expect(formatDelta(0.4, "percent")).toBe("+0.4 نقاط مئوية");
  });
});
