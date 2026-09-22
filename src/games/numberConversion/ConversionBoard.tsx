import { PLACES, activePlaces, valueFromBits, binaryString, nibbleHexDigit, targetReadout, targetIsHex, DIRECTION_META, type Bit, type ConversionDirection } from "./conversion";

/**
 * The interactive 8-bit conversion board — the HEART of the game and the student's working method (not decoration).
 * Eight place-value boxes (128…1) grouped into two 4-bit nibbles; the student toggles each bit and the answer is
 * DERIVED from the boxes (binary / decimal / hex per the task's target), never typed. Every box is a real
 * <button> (keyboard accessible, aria-pressed, meaningful label); correctness is never conveyed by colour alone
 * (the on/off state carries text "1"/"0" and the pressed state). Place values stay visible at every assistance
 * level — the box method is the identity of this game.
 */
export default function ConversionBoard({ bits, onChange, direction, disabled = false, solutionBits = null }: {
  bits: Bit[];
  onChange: (bits: Bit[]) => void;
  direction: ConversionDirection;
  disabled?: boolean;
  solutionBits?: Bit[] | null;
}) {
  const meta = DIRECTION_META[direction];
  const hexTarget = targetIsHex(direction);
  const value = valueFromBits(bits);
  const sum = activePlaces(bits);
  const toggle = (i: number) => {
    if (disabled) return;
    const next = bits.slice() as Bit[];
    next[i] = next[i] === 1 ? 0 : 1;
    onChange(next);
  };
  const renderNibble = (half: 0 | 1) => {
    const start = half === 0 ? 0 : 4;
    return (
      <div className="eb-ncb-nibble" role="group" aria-label={half === 0 ? "المجموعة العليا (4 بتات)" : "المجموعة الدنيا (4 بتات)"}>
        <div className="eb-ncb-cols">
          {[0, 1, 2, 3].map(k => {
            const i = start + k;
            const on = bits[i] === 1;
            const isSolutionDiff = solutionBits ? solutionBits[i] !== bits[i] : false;
            return (
              <div className={"eb-ncb-col" + (on ? " is-on" : "")} key={i}>
                <span className="eb-ncb-place" aria-hidden="true">{PLACES[i]}</span>
                <button
                  type="button"
                  className={"eb-ncb-bit" + (on ? " is-on" : "") + (disabled && solutionBits && isSolutionDiff ? " is-missed" : "")}
                  aria-pressed={on}
                  disabled={disabled}
                  onClick={() => toggle(i)}
                  aria-label={"الخانة بقيمة " + PLACES[i] + ": " + (on ? "مضاءة" : "مطفأة")}
                >
                  <span aria-hidden="true">{on ? "1" : "0"}</span>
                </button>
              </div>
            );
          })}
        </div>
        {hexTarget && (
          <p className="eb-ncb-nibble-hex" aria-hidden="true">= {nibbleHexDigit(bits, half)}<sub>16</sub></p>
        )}
      </div>
    );
  };
  return (
    <div className="eb-ncb" data-direction={direction}>
      <div className="eb-ncb-board" role="group" aria-label="صناديق التحويل الثنائية">
        {renderNibble(0)}
        <span className="eb-ncb-sep" aria-hidden="true"></span>
        {renderNibble(1)}
      </div>
      <div className="eb-ncb-readout" aria-live="polite">
        <p className="eb-ncb-sum">{sum.length ? sum.join(" + ") + " = " + value : "لم تُختَر أي قيمة بعد (0)"}</p>
        <p className="eb-ncb-derived">
          <span className="eb-ncb-derived-label">النتيجة ({meta.targetLabelAr}):</span>{" "}
          <strong dir="ltr">{targetReadout(bits, meta.targetBase)}{meta.targetBase === 2 ? "₂" : meta.targetBase === 16 ? "₁₆" : ""}</strong>
        </p>
        <p className="eb-ncb-binary" dir="ltr" aria-label={"التمثيل الثنائي الحالي " + binaryString(bits)}>{binaryString(bits)}</p>
      </div>
    </div>
  );
}
