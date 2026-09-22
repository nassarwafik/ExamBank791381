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
});
