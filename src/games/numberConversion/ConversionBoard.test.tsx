// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import ConversionBoard from "./ConversionBoard";
import { emptyBits, type Bit } from "./conversion";

afterEach(cleanup);

describe("ConversionBoard — the interactive 8-bit method", () => {
  it("renders eight accessible bit BUTTONS with visible place-value labels", () => {
    render(<ConversionBoard bits={emptyBits()} onChange={vi.fn()} direction="dec2bin" />);
    const bitButtons = screen.getAllByRole("button", { name: /الخانة بقيمة/ });
    expect(bitButtons.length).toBe(8);
    for (const p of ["128", "64", "32", "16", "8", "4", "2", "1"]) expect(screen.getByText(p)).toBeTruthy();
    // all off initially, aria-pressed reflects state
    expect(bitButtons.every(b => b.getAttribute("aria-pressed") === "false")).toBe(true);
  });

  it("toggling a box calls onChange with that bit flipped (answer derived from boxes, not typed)", () => {
    const onChange = vi.fn();
    render(<ConversionBoard bits={emptyBits()} onChange={onChange} direction="dec2bin" />);
    fireEvent.click(screen.getByRole("button", { name: "الخانة بقيمة 128: مطفأة" }));
    expect(onChange).toHaveBeenCalledWith([1, 0, 0, 0, 0, 0, 0, 0]);
    onChange.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "الخانة بقيمة 4: مطفأة" }));
    expect(onChange).toHaveBeenCalledWith([0, 0, 0, 0, 0, 1, 0, 0]);
  });

  it("shows the derived readout: active-value sum and the target-base result", () => {
    const bits45: Bit[] = [0, 0, 1, 0, 1, 1, 0, 1];
    render(<ConversionBoard bits={bits45} onChange={vi.fn()} direction="dec2bin" />);
    expect(screen.getByText("32 + 8 + 4 + 1 = 45")).toBeTruthy();
    expect(screen.getByText("00101101")).toBeTruthy();                 // binary target readout + live binary line
    const on = screen.getByRole("button", { name: "الخانة بقيمة 32: مضاءة" });
    expect(on.getAttribute("aria-pressed")).toBe("true");
  });

  it("a hex-target direction shows each nibble's hex digit", () => {
    const bits182: Bit[] = [1, 0, 1, 1, 0, 1, 1, 0];                   // B6
    render(<ConversionBoard bits={bits182} onChange={vi.fn()} direction="bin2hex" />);
    expect(screen.getByText(/= *B/)).toBeTruthy();
    expect(screen.getByText(/= *6/)).toBeTruthy();
  });

  it("disabled board ignores clicks (used while feedback is shown)", () => {
    const onChange = vi.fn();
    render(<ConversionBoard bits={emptyBits()} onChange={onChange} direction="dec2bin" disabled />);
    const btn = screen.getByRole("button", { name: "الخانة بقيمة 128: مطفأة" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("a HEX direction teaches each nibble's own 8|4|2|1 weights, not the global octet (Fix 1)", () => {
    render(<ConversionBoard bits={emptyBits()} onChange={vi.fn()} direction="bin2hex" />);
    expect(screen.queryByText("128")).toBeNull();          // no global octet labels for bin↔hex
    expect(screen.queryByText("64")).toBeNull();
    expect(screen.queryByText("32")).toBeNull();
    // each 4-bit group independently shows 8|4|2|1 → two of each weight
    for (const w of ["8", "4", "2", "1"]) expect(screen.getAllByText(w).length).toBe(2);
  });

  it("decimal↔hex shows BOTH the global octet AND the nibble weights (the binary bridge, Fix 1)", () => {
    render(<ConversionBoard bits={emptyBits()} onChange={vi.fn()} direction="dec2hex" />);
    expect(screen.getByText("128")).toBeTruthy();          // global octet present
    expect(screen.getByText("64")).toBeTruthy();
    expect(screen.getAllByText("8").length).toBeGreaterThanOrEqual(2);   // 8 appears as octet place AND as nibble weight ×2
  });

  it("guided and challenge do NOT render identical scaffolding; boxes always remain (Fix 2)", () => {
    const bits45: Bit[] = [0, 0, 1, 0, 1, 1, 0, 1];
    const { unmount } = render(<ConversionBoard bits={bits45} onChange={vi.fn()} direction="dec2bin" level="guided" />);
    expect(screen.getByText("32 + 8 + 4 + 1 = 45")).toBeTruthy();                 // guided: live sum visible
    expect(screen.getByText("00101101")).toBeTruthy();                            // guided: live binary visible
    expect(screen.getAllByRole("button", { name: /الخانة بقيمة/ }).length).toBe(8);
    unmount();

    render(<ConversionBoard bits={bits45} onChange={vi.fn()} direction="dec2bin" level="challenge" />);
    expect(screen.queryByText("32 + 8 + 4 + 1 = 45")).toBeNull();                 // challenge: no live sum before Check
    expect(screen.queryByText("00101101")).toBeNull();                            // challenge: no live derived readouts
    expect(screen.getByText(/تحقّق/)).toBeTruthy();                                // shows a "check to reveal" note instead
    expect(screen.getAllByRole("button", { name: /الخانة بقيمة/ }).length).toBe(8);   // boxes ALWAYS remain
  });

  it("challenge reveals the full teaching readout once the board is locked after Check (Fix 2)", () => {
    const bits45: Bit[] = [0, 0, 1, 0, 1, 1, 0, 1];
    render(<ConversionBoard bits={bits45} onChange={vi.fn()} direction="dec2bin" level="challenge" disabled />);
    expect(screen.getByText("32 + 8 + 4 + 1 = 45")).toBeTruthy();                 // locked → sum shown
    expect(screen.getByText("00101101")).toBeTruthy();                            // locked → binary shown
  });
});
