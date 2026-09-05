import { describe, it, expect } from "vitest";
import { extractQCards } from "./qcard-dom-extract.js";

describe("extractQCards - the shared F-series q-card template", () => {
  it("extracts a radio-group question (F01/F04 style, id + q-marks span)", () => {
    const html = `<div class="q-card" id="card_q1">
      <div class="q-header"><div class="q-num">1</div><div class="q-text">ما هو عنوان الشبكة؟</div><span class="q-marks">2 علامة</span></div>
      <label class="opt-label"><input type="radio" name="q1" value="a"><span>192.168.10.0</span></label>
      <label class="opt-label"><input type="radio" name="q1" value="b"><span>192.168.0.0</span></label>
    </div>`;
    const cards = extractQCards(html);
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe("q1");
    expect(cards[0].text).toBe("ما هو عنوان الشبكة؟");
    expect(cards[0].marksText).toBe("2 علامة");
    expect(cards[0].field.kind).toBe("radioGroup");
    expect(cards[0].field.name).toBe("q1");
    expect(cards[0].field.options.map(o => o.value)).toEqual(["a", "b"]);
  });

  it("extracts a single free-text question", () => {
    const html = `<div class="q-card" id="card_q3">
      <div class="q-header"><div class="q-num">3</div><div class="q-text">حوّل 11001010:</div><span class="q-marks">2 علامة</span></div>
      <div>الجواب: <input type="text" id="q3"></div>
    </div>`;
    const cards = extractQCards(html);
    expect(cards[0].field.kind).toBe("singleText");
    expect(cards[0].field.fieldId).toBe("q3");
  });

  it("extracts a per-row select table (matching)", () => {
    const html = `<div class="q-card" id="card_q5">
      <div class="q-header"><div class="q-num">5</div><div class="q-text">اربط:</div><span class="q-marks">4 علامات</span></div>
      <table><thead><tr><th>البروتوكول</th><th>الوظيفة</th></tr></thead><tbody>
        <tr><td>DNS</td><td><select id="q5_dns"><option value="">-- اختر --</option><option>تحويل الأسماء</option><option>نقل الملفات</option></select></td></tr>
      </tbody></table>
    </div>`;
    const cards = extractQCards(html);
    expect(cards[0].field.kind).toBe("controlTable");
    expect(cards[0].field.rows[0].label).toBe("DNS");
    expect(cards[0].field.rows[0].controlId).toBe("q5_dns");
    expect(cards[0].field.rows[0].options).toEqual(["تحويل الأسماء", "نقل الملفات"]);
  });

  it("handles F05's variant (bare q-card, .q-head, .mark, textarea = open)", () => {
    const html = `<div class="q-card">
      <div class="q-head"><div class="q-num">1</div><div class="q-text">اشرح:</div><div class="mark">4 درجات</div></div>
      <textarea></textarea>
    </div>`;
    const cards = extractQCards(html);
    expect(cards[0].id).toBe("q1");
    expect(cards[0].marksText).toBe("4 درجات");
    expect(cards[0].field.kind).toBe("openText");
  });

  it("extracts inline data-uri images that live inside a card, linked by containment", () => {
    const html = `<div class="q-card" id="card_q11">
      <div class="q-header"><div class="q-num">11</div><div class="q-text">حسب الصورة:</div><span class="q-marks">3</span></div>
      <img src="data:image/png;base64,AAAABBBB">
      <label><input type="radio" name="q11" value="a"><span>A</span></label>
    </div>`;
    const cards = extractQCards(html);
    expect(cards[0].images).toHaveLength(1);
    expect(cards[0].images[0]).toEqual({ id: "img-0", contentType: "image/png", base64: "AAAABBBB" });
  });

  it("walks nested divs correctly so a card's boundary is its own matching close", () => {
    const html = `<div class="q-card" id="card_q1">
      <div class="q-header"><div class="q-num">1</div><div class="q-text">س</div><span class="q-marks">2</span></div>
      <div class="wrapper"><label><input type="radio" name="q1" value="a"><span>A</span></label></div>
    </div>
    <div class="q-card" id="card_q2">
      <div class="q-header"><div class="q-num">2</div><div class="q-text">س2</div><span class="q-marks">2</span></div>
      <label><input type="radio" name="q2" value="a"><span>A</span></label>
    </div>`;
    const cards = extractQCards(html);
    expect(cards).toHaveLength(2);
    expect(cards[0].id).toBe("q1");
    expect(cards[1].id).toBe("q2");
  });
});
