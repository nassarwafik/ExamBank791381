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

  it("once RESOLVED (locked) the board shows the teaching readout: sum and target-base result", () => {
    const bits45: Bit[] = [0, 0, 1, 0, 1, 1, 0, 1];
    render(<ConversionBoard bits={bits45} onChange={vi.fn()} direction="dec2bin" disabled />);
    expect(screen.getByText("32 + 8 + 4 + 1 = 45")).toBeTruthy();
    expect(screen.getByText("00101101")).toBeTruthy();                 // binary line (post-resolution only)
    const on = screen.getByRole("button", { name: "الخانة بقيمة 32: مضاءة" });
    expect(on.getAttribute("aria-pressed")).toBe("true");
  });

  it("a hex-target direction shows each nibble's hex digit only once RESOLVED", () => {
    const bits182: Bit[] = [1, 0, 1, 1, 0, 1, 1, 0];                   // B6
    render(<ConversionBoard bits={bits182} onChange={vi.fn()} direction="bin2hex" disabled />);
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

  it("NO level prints anything derived from the boxes before resolution (all six directions)", () => {
    const bits182: Bit[] = [1, 0, 1, 1, 0, 1, 1, 0];   // 182 = 0xB6 = 10110110
    const dirs = ["dec2bin", "bin2dec", "bin2hex", "hex2bin", "dec2hex", "hex2dec"] as const;
    for (const level of ["guided", "practice", "challenge"] as const) {
      for (const direction of dirs) {
        const { container, unmount } = render(<ConversionBoard bits={bits182} onChange={vi.fn()} direction={direction} level={level} />);
        const text = container.textContent || "";
        expect(text, level + " " + direction).not.toContain("182");          // decimal result / running total
        expect(text, level + " " + direction).not.toContain("10110110");     // binary answer line
        expect(text, level + " " + direction).not.toContain("B6");           // hex answer
        expect(text, level + " " + direction).not.toMatch(/=\s*[0-9A-F]/);  // no "= B" nibble digit, no "= total"
        expect(text, level + " " + direction).not.toContain("النتيجة");
        expect(container.querySelector(".eb-ncb-sum, .eb-ncb-derived, .eb-ncb-binary, .eb-ncb-nibble-hex"), level + " " + direction).toBeNull();
        expect(container.querySelectorAll(".eb-ncb-bit").length).toBe(8);   // the boxes ALWAYS remain
        unmount();
      }
    }
  });

  it("every level shows the full teaching readout once the board is locked after resolution", () => {
    const bits45: Bit[] = [0, 0, 1, 0, 1, 1, 0, 1];
    for (const level of ["guided", "practice", "challenge"] as const) {
      const { unmount } = render(<ConversionBoard bits={bits45} onChange={vi.fn()} direction="dec2bin" level={level} disabled />);
      expect(screen.getByText("32 + 8 + 4 + 1 = 45")).toBeTruthy();
      expect(screen.getByText("00101101")).toBeTruthy();
      unmount();
    }
  });
});

describe("ConversionBoard — numeric orientation is pinned LEFT→RIGHT, immune to the RTL page", () => {
  const labelsInOrder = (container: HTMLElement) =>
    Array.from(container.querySelectorAll(".eb-ncb-bit")).map(b => Number((b.getAttribute("aria-label") || "").replace(/^\D*(\d+).*$/, "$1")));

  it("the board is an explicit dir=ltr island even inside an RTL page", () => {
    const { container } = render(<div dir="rtl"><ConversionBoard bits={emptyBits()} onChange={vi.fn()} direction="dec2bin" /></div>);
    const board = container.querySelector(".eb-ncb-board") as HTMLElement;
    expect(board.getAttribute("dir")).toBe("ltr");
    // every box's nearest direction-bearing ancestor is the LTR board, not the RTL page
    for (const bit of Array.from(container.querySelectorAll(".eb-ncb-bit"))) {
      expect((bit as HTMLElement).closest("[dir]")?.getAttribute("dir")).toBe("ltr");
    }
  });

  it("decimal/binary: DOM (= visual LTR) order is 128 64 32 16 8 4 2 1 — 128 leftmost, 1 rightmost", () => {
    const { container } = render(<ConversionBoard bits={emptyBits()} onChange={vi.fn()} direction="dec2bin" />);
    expect(labelsInOrder(container)).toEqual([128, 64, 32, 16, 8, 4, 2, 1]);
    const places = Array.from(container.querySelectorAll(".eb-ncb-place")).map(e => Number(e.textContent));
    expect(places).toEqual([128, 64, 32, 16, 8, 4, 2, 1]);
  });

  it("hex: two nibbles, HIGH nibble first (left), each weighted 8 4 2 1", () => {
    const { container } = render(<ConversionBoard bits={emptyBits()} onChange={vi.fn()} direction="bin2hex" />);
    const groups = Array.from(container.querySelectorAll(".eb-ncb-nibble"));
    expect(groups.map(g => g.getAttribute("aria-label"))).toEqual(["المجموعة العليا (4 بتات)", "المجموعة الدنيا (4 بتات)"]);
    const weights = Array.from(container.querySelectorAll(".eb-ncb-nibweight")).map(e => Number(e.textContent));
    expect(weights).toEqual([8, 4, 2, 1, 8, 4, 2, 1]);
    expect(labelsInOrder(container)).toEqual([8, 4, 2, 1, 8, 4, 2, 1]);
  });

  it("decimal↔hex keeps the whole octet 128 64 32 16 | 8 4 2 1 with per-nibble 8 4 2 1 underneath", () => {
    const { container } = render(<ConversionBoard bits={emptyBits()} onChange={vi.fn()} direction="dec2hex" />);
    expect(Array.from(container.querySelectorAll(".eb-ncb-place")).map(e => Number(e.textContent))).toEqual([128, 64, 32, 16, 8, 4, 2, 1]);
    expect(Array.from(container.querySelectorAll(".eb-ncb-nibweight")).map(e => Number(e.textContent))).toEqual([8, 4, 2, 1, 8, 4, 2, 1]);
    // the separator sits between the two nibbles
    const board = container.querySelector(".eb-ncb-board") as HTMLElement;
    expect(Array.from(board.children).map(c => c.className)).toEqual(["eb-ncb-nibble", "eb-ncb-sep", "eb-ncb-nibble"]);
  });
});
