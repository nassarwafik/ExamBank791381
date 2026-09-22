import {
  PLACES, NIBBLE_PLACES, activePlaces, valueFromBits, binaryString, nibbleHexDigit, targetReadout,
  boardViewFor, readoutPolicy, DIRECTION_META, type Bit, type ConversionDirection, type AssistanceLevel,
} from "./conversion";

/**
 * The interactive 8-bit conversion board — the student's WORKING area (the learning method, not decoration). Eight
 * place-value boxes grouped into two 4-bit nibbles; the student toggles bits to reason, then types the FINAL answer in
 * the game's answer field (the server grades that text — never these boxes). Every box is a real <button> (keyboard
 * accessible, aria-pressed, meaningful label); correctness is never conveyed by colour alone.
 *
 * Orientation: the numeric board is always LEFT→RIGHT `128 64 32 16 | 8 4 2 1` (high nibble on the LEFT) — it is an
 * explicit `dir="ltr"` island, so the surrounding RTL Arabic page can never mirror it. The canonical order array stays
 * [128 … 1]; only the rendering direction is pinned.
 *
 * TWO pedagogical views over ONE source of truth (the eight bits): decimal/binary directions label the boxes with the
 * global octet 128…1; hexadecimal directions label EACH nibble with its own 8|4|2|1 weights; decimal↔hex shows both.
 * Before the task is resolved NOTHING derived from the boxes is printed (no sum/total, target result, binary line or
 * nibble hex digit) — that would tell the student what to type. Once resolved (`disabled`, the board then holding the
 * server's canonical solution bits) the full teaching readout appears.
 */
export default function ConversionBoard({ bits, onChange, direction, level = "guided", disabled = false, solutionBits = null }: {
  bits: Bit[];
  onChange: (bits: Bit[]) => void;
  direction: ConversionDirection;
  level?: AssistanceLevel;
  disabled?: boolean;
  solutionBits?: Bit[] | null;
}) {
  const meta = DIRECTION_META[direction];
  const view = boardViewFor(direction);
  const policy = readoutPolicy(level, disabled);
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
            const primaryWeight = view.showGlobalPlaces ? PLACES[i] : NIBBLE_PLACES[k];
            return (
              <div className={"eb-ncb-col" + (on ? " is-on" : "")} key={i}>
                {view.showGlobalPlaces && <span className="eb-ncb-place" aria-hidden="true">{PLACES[i]}</span>}
                {view.showNibbleWeights && <span className="eb-ncb-nibweight" aria-hidden="true">{NIBBLE_PLACES[k]}</span>}
                <button
                  type="button"
                  className={"eb-ncb-bit" + (on ? " is-on" : "") + (disabled && solutionBits && isSolutionDiff ? " is-missed" : "")}
                  aria-pressed={on}
                  disabled={disabled}
                  onClick={() => toggle(i)}
                  aria-label={"الخانة بقيمة " + primaryWeight + ": " + (on ? "مضاءة" : "مطفأة")}
                >
                  <span aria-hidden="true">{on ? "1" : "0"}</span>
                </button>
              </div>
            );
          })}
        </div>
        {view.showNibbleHex && policy.showNibbleHexLive && (
          <p className="eb-ncb-nibble-hex" aria-hidden="true">= {nibbleHexDigit(bits, half)}<sub>16</sub></p>
        )}
      </div>
    );
  };
  return (
    <div className="eb-ncb" data-direction={direction} data-level={level}>
      {/* numeric LTR island: 128 is always the leftmost box and 1 the rightmost, whatever the page direction */}
      <div className="eb-ncb-board" dir="ltr" role="group" aria-label="صناديق التحويل الثنائية">
        {renderNibble(0)}
        <span className="eb-ncb-sep" aria-hidden="true"></span>
        {renderNibble(1)}
      </div>
      <div className="eb-ncb-readout" aria-live="polite">
        {policy.showSum && (
          <p className="eb-ncb-sum">{sum.length ? sum.join(" + ") + " = " + value : "لم تُختَر أي قيمة بعد (0)"}</p>
        )}
        {policy.showDerived && (
          <p className="eb-ncb-derived">
            <span className="eb-ncb-derived-label">النتيجة ({meta.targetLabelAr}):</span>{" "}
            <strong dir="ltr">{targetReadout(bits, meta.targetBase)}{meta.targetBase === 2 ? "₂" : meta.targetBase === 16 ? "₁₆" : ""}</strong>
          </p>
        )}
        {policy.showBinaryLine && (
          <p className="eb-ncb-binary" dir="ltr" aria-label={"التمثيل الثنائي الحالي " + binaryString(bits)}>{binaryString(bits)}</p>
        )}
      </div>
    </div>
  );
}
