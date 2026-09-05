// Parses Book791381's index.html into catalog metadata. Deterministic regex-based extraction over
// the confirmed, stable DOM shape of each item card - no AI, no manual copying (see the Discovery
// report, Phase B): a real fetch of https://nassarwafik.github.io/Book791381/index.html was
// inspected directly to derive this shape.
//
//   <article class="card item-card" data-group="foundation" data-search="...">
//     <div class="code training-code">T01</div>
//     <small>تدريب تفاعلي</small><h3>أساسيات الشبكات</h3>
//     <p>تعريف الشبكة، فوائدها...</p>
//     <div class="info-row"><span><b>10</b> سؤالًا</span><span>الصفحات <b>6–11</b></span></div>
//     <div class="tags"><span class="tag">أساسيات</span><span class="tag">LAN / WAN</span></div>
//     <a class="open-btn" href="T01.html">فتح T01</a>
//   </article>
// Matches both training cards (class="card item-card") and final-exam cards
// (class="card exam-card item-card") - both carry the same metadata shape (code/title/description/tags).
const ARTICLE_REGEX = /<article class="card (?:exam-card )?item-card" data-group="([^"]*)"[^>]*>([\s\S]*?)<\/article>/g;
const CODE_REGEX = /<div class="code[^"]*">([^<]*)<\/div>/;
const TITLE_REGEX = /<h3>([\s\S]*?)<\/h3>/;
const DESCRIPTION_REGEX = /<\/div>\s*<p>([\s\S]*?)<\/p>/;
const QUESTION_COUNT_REGEX = /<b>(\d+)<\/b>\s*سؤال/;
const PAGE_RANGE_REGEX = /الصفحات\s*<b>([^<]*)<\/b>/;
const TAG_REGEX = /<span class="tag">([^<]*)<\/span>/g;

function decodeEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseBookCatalogIndex(html) {
  const items = [];

  for (const match of String(html || "").matchAll(ARTICLE_REGEX)) {
    const category = match[1];
    const block = match[2];

    const codeMatch = CODE_REGEX.exec(block);
    const libraryItemId = codeMatch ? decodeEntities(codeMatch[1]) : "";
    if (!libraryItemId) continue;

    const titleMatch = TITLE_REGEX.exec(block);
    const descriptionMatch = DESCRIPTION_REGEX.exec(block);
    const questionCountMatch = QUESTION_COUNT_REGEX.exec(block);
    const pageRangeMatch = PAGE_RANGE_REGEX.exec(block);
    const tags = Array.from(block.matchAll(TAG_REGEX)).map(tagMatch => decodeEntities(tagMatch[1])).filter(Boolean);

    items.push({
      libraryItemId,
      category: decodeEntities(category),
      title: titleMatch ? decodeEntities(titleMatch[1]) : "",
      description: descriptionMatch ? decodeEntities(descriptionMatch[1]) : "",
      questionCount: questionCountMatch ? Number(questionCountMatch[1]) : 0,
      pageRange: pageRangeMatch ? decodeEntities(pageRangeMatch[1]) : "",
      tags
    });
  }

  return items;
}

module.exports = { parseBookCatalogIndex };
