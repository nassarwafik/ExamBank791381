import { describe, it, expect } from "vitest";
import { formatCountdown, countdownTone } from "./examTimer";

const MIN = 60_000;

describe("formatCountdown", () => {
  it("MM:SS under an hour, H:MM:SS at/over an hour, clamps at zero", () => {
    expect(formatCountdown(42 * MIN + 17 * 1000)).toBe("42:17");
    expect(formatCountdown(5 * 1000)).toBe("00:05");
    expect(formatCountdown(60 * MIN)).toBe("1:00:00");
    expect(formatCountdown(90 * MIN + 5 * 1000)).toBe("1:30:05");
    expect(formatCountdown(0)).toBe("00:00");
    expect(formatCountdown(-5000)).toBe("00:00");
  });
});

describe("countdownTone", () => {
  it("escalates: normal > 5min, warn <= 5min, danger <= 1min", () => {
    expect(countdownTone(10 * MIN)).toBe("");
    expect(countdownTone(5 * MIN + 1)).toBe("");     // just over 5:00 -> normal
    expect(countdownTone(5 * MIN)).toBe("warn");     // exactly 5:00 -> warn
    expect(countdownTone(60 * 1000)).toBe("danger"); // exactly 1:00 -> danger
    expect(countdownTone(60 * 1000 + 1)).toBe("warn");
    expect(countdownTone(30 * 1000)).toBe("danger");
    expect(countdownTone(0)).toBe("danger");
  });
});
