// Lightweight, purpose-built extractor for the F-series "q-card" HTML template shared verbatim by
// F01/F02/F04/F05 (confirmed by direct inspection of all four): each question is a
//   <div class="q-card" id="card_<qid>">
//     <div class="q-header"> <div class="q-num">N</div> <div class="q-text">...</div> <span class="q-marks">M علامة</span> </div>
//     (radio group | single text input | a <table> of <select>/<input> rows)
//   </div>
// This is deliberately NOT the full generic DOM engine in import-html-exam.js - that file targets a
// much broader, messier input space; here the shape is regular enough that a small focused parser
// is more reliable and far easier to maintain. It only reads structure, never executes anything.

function stripTags(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[☐☑✓]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Splits the HTML into q-card blocks by scanning for each `<div class="q-card"` opener and walking
// <div> open/close depth to find its matching close - robust to arbitrarily nested divs inside.
function splitCards(html) {
  const cards = [];
  // The id is optional: F01/F02/F04 give each card id="card_<qid>"; F05 uses a bare
  // <div class="q-card"> with no id (its questions are numbered only by .q-num order).
  const openRegex = /<div\s+class="q-card"([^>]*)>/g;
  let match;
  let autoIndex = 0;

  while ((match = openRegex.exec(html)) !== null) {
    autoIndex += 1;
    const idMatch = /\bid="([^"]*)"/.exec(match[1]);
    const id = idMatch ? idMatch[1].replace(/^card_/, "") : "q" + autoIndex;
    const bodyStart = match.index + match[0].length;

    // Walk div depth starting at 1 (we're inside the just-opened q-card div).
    const divToken = /<div\b|<\/div>/g;
    divToken.lastIndex = bodyStart;
    let depth = 1;
    let token;
    let end = html.length;
    while ((token = divToken.exec(html)) !== null) {
      if (token[0] === "</div>") {
        depth -= 1;
        if (depth === 0) { end = token.index; break; }
      }
      else {
        depth += 1;
      }
    }

    cards.push({ id, inner: html.slice(bodyStart, end) });
    openRegex.lastIndex = end;
  }

  return cards;
}

function extractHeader(inner) {
  const numMatch = /<div class="q-num">([\s\S]*?)<\/div>/.exec(inner);
  const textMatch = /<div class="q-text">([\s\S]*?)<\/div>/.exec(inner);
  // marks: F01/F02/F04 use <span class="q-marks">, F05 uses <div class="mark">.
  const marksMatch = /<span class="q-marks">([\s\S]*?)<\/span>/.exec(inner) || /<div class="mark">([\s\S]*?)<\/div>/.exec(inner);
  return {
    questionNumber: numMatch ? stripTags(numMatch[1]) : "",
    text: textMatch ? stripTags(textMatch[1]) : "",
    marksText: marksMatch ? stripTags(marksMatch[1]) : ""
  };
}

// A radio group: one <input type="radio" name="X" value="V"> per option, with the option's visible
// label being the text of the enclosing <label>. Returns {name, options:[{value,text}]}.
function extractRadioGroup(inner) {
  const labelRegex = /<label[^>]*>([\s\S]*?)<\/label>/g;
  const options = [];
  let name = "";
  let match;
  while ((match = labelRegex.exec(inner)) !== null) {
    const labelInner = match[1];
    const radio = /<input[^>]*type="radio"[^>]*>/i.exec(labelInner);
    if (!radio) continue;
    const nameMatch = /\bname="([^"]*)"/.exec(radio[0]);
    const valueMatch = /\bvalue="([^"]*)"/.exec(radio[0]);
    if (nameMatch) name = nameMatch[1];
    options.push({
      value: valueMatch ? valueMatch[1] : "",
      text: stripTags(labelInner)
    });
  }
  return options.length ? { name, options } : null;
}

// A single free-text input: <input type="text" id="X">, not inside a table.
function extractSingleTextInput(inner) {
  // Only treat as a single-text question if there's exactly one text input AND no <table>.
  if (/<table/i.test(inner)) return null;
  const inputs = inner.match(/<input[^>]*type="text"[^>]*>/gi) || [];
  if (inputs.length !== 1) return null;
  const idMatch = /\bid="([^"]*)"/.exec(inputs[0]);
  return { fieldId: idMatch ? idMatch[1] : "" };
}

// A table of per-row answer controls (selects or text inputs), used for matching / multi-part
// questions. Returns {rows:[{label, controlId, kind:"select"|"text", options?:[...]}]}.
function extractControlTable(inner) {
  if (!/<table/i.test(inner)) return null;
  const rowRegex = /<tr>([\s\S]*?)<\/tr>/g;
  const rows = [];
  let match;
  while ((match = rowRegex.exec(inner)) !== null) {
    const rowHtml = match[1];
    if (/<th\b/i.test(rowHtml)) continue; // header row
    const cells = Array.from(rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)).map(c => c[1]);
    if (cells.length < 2) continue;

    const label = stripTags(cells[0]);
    const answerCell = cells[cells.length - 1];

    const selectMatch = /<select[^>]*\bid="([^"]*)"[^>]*>([\s\S]*?)<\/select>/.exec(answerCell);
    if (selectMatch) {
      const optionValues = Array.from(selectMatch[2].matchAll(/<option[^>]*>([\s\S]*?)<\/option>/g))
        .map(o => stripTags(o[1]))
        .filter(v => v && !/^--/.test(v) && v !== "اختر");
      rows.push({ label, controlId: selectMatch[1], kind: "select", options: optionValues });
      continue;
    }

    const textMatch = /<input[^>]*type="text"[^>]*\bid="([^"]*)"[^>]*>/.exec(answerCell) || /<input[^>]*\bid="([^"]*)"[^>]*type="text"[^>]*>/.exec(answerCell);
    if (textMatch) {
      rows.push({ label, controlId: textMatch[1], kind: "text" });
    }
  }
  return rows.length ? { rows } : null;
}

// Pulls every inline data:-URI <img> that lives inside this card, so a question's own diagram
// travels with it (linked by containment - no positional guessing across cards).
function extractCardImages(inner) {
  return Array.from(inner.matchAll(/<img[^>]*src=['"]data:([\w/+.-]+);base64,([A-Za-z0-9+/=]+)['"]/g))
    .map((match, index) => ({ id: "img-" + index, contentType: match[1], base64: match[2] }));
}

// Parses one q-card into a structured, source-shape-agnostic descriptor. `field` is exactly one of
// radioGroup | singleText | controlTable | null (unrecognized).
function parseQCard(card) {
  const header = extractHeader(card.inner);
  const radioGroup = extractRadioGroup(card.inner);
  const controlTable = extractControlTable(card.inner);
  const singleText = radioGroup || controlTable ? null : extractSingleTextInput(card.inner);

  // A bare <textarea> with no radio/table/text-input is an open, free-response question (F05's
  // whole format, plus "show your working" prompts elsewhere) - no auto-gradable answer exists.
  const hasTextarea = /<textarea\b/i.test(card.inner);

  let field = null;
  if (radioGroup) field = { kind: "radioGroup", ...radioGroup };
  else if (controlTable) field = { kind: "controlTable", ...controlTable };
  else if (singleText) field = { kind: "singleText", ...singleText };
  else if (hasTextarea) field = { kind: "openText" };

  return { id: card.id, ...header, field, images: extractCardImages(card.inner) };
}

function extractQCards(html) {
  return splitCards(html).map(parseQCard);
}

module.exports = { extractQCards, splitCards, parseQCard, stripTags };
