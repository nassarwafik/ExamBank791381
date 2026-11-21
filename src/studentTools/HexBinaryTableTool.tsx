import type { HexBinaryTableToolV1 } from "./studentToolsSpec";
import { HEX_BINARY_ROWS } from "./placeValueBoxes";

// Phase T13 — «قائمة التحويل من السادس عشر إلى الثنائي» (the owner's document): the reference list 0 – F with each digit's 4-bit
// binary form and, as the teacher chose, its decimal value. A fixed table: nothing is typed or computed.

export default function HexBinaryTableTool({ config }: { config: HexBinaryTableToolV1 }) {
  return (
    <div data-testid="tool-hexBinaryTable" className="stt-table-wrap stt-hexbin-wrap">
      <table className="stt-table stt-hexbin-table">
        <caption>من السادس عشر إلى الثنائي</caption>
        <thead><tr>
          {config.showDecimal && <th scope="col">عشري</th>}
          <th scope="col">ثنائي</th>
          <th scope="col">Hex</th>
        </tr></thead>
        <tbody>{HEX_BINARY_ROWS.map(r => (
          <tr key={r.hex}>
            {config.showDecimal && <td dir="ltr">{r.dec}</td>}
            <td dir="ltr" className="stt-mono">{r.bin}</td>
            <th scope="row" dir="ltr">{r.hex}</th>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
