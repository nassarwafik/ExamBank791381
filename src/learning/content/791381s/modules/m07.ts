// Learning Materials — «أوراق تلخيص للمراجعة» (791381s), section 7 «الكوابل وعنوان MAC».
//
// Verbatim conversion of booklet PDF pages 23–25 (the section header box → an opener page; each numbered sub-topic → one
// reader page). Every block is origin:"book": nothing is added, removed or reworded; bold runs are `strong`, printed box
// labels are the callout titles, the monospace MAC boxes are code blocks.

import type { ContentModule, ContentSource } from "../../types";

const CID = "791381s";
const src = (pdf: number, end?: number): ContentSource =>
  end ? { kind: "book", sourceId: CID, pdfPageStart: pdf, pdfPageEnd: end } : { kind: "book", sourceId: CID, pdfPageStart: pdf };

const m07: ContentModule = {
  id: "791381s-m07",
  title: "الكوابل وعنوان MAC",
  order: 7,
  lessons: [
    {
      id: "791381s-m07-l00",
      title: "افتتاحية الوحدة",
      order: 0,
      pages: [
        {
          id: "791381s-m07-l00-p01",
          title: "الكوابل وعنوان MAC",
          order: 1,
          layout: "opener",
          source: src(23),
          blocks: [
            {
              id: "m07-l00-p01-opener", type: "unit-opener", origin: "book",
              unitLabel: "الدفعة الثانية · الوحدة السابعة · كتاب ص 61–65", unitNumber: "07", title: "الكوابل وعنوان MAC",
              subtitle: "كيف تنتقل البيانات؟ وما هو العنوان الفيزيائي للجهاز؟",
            },
          ],
        },
      ],
    },
    {
      id: "791381s-m07-l01",
      title: "الكوابل وعنوان MAC",
      order: 1,
      pages: [
        {
          id: "791381s-m07-l01-p01",
          title: "الكوابل المستعملة في الشبكات",
          order: 1,
          source: src(23, 24),
          blocks: [
            {
              id: "m07-l01-p01-def", type: "text", origin: "book",
              spans: [{ text: "الكوابل هي الطريق الذي تنتقل عبره البيانات بين الأجهزة.", style: "strong" }],
            },
            {
              id: "m07-l01-p01-intro", type: "text", origin: "book",
              spans: [{ text: "البيانات تنتقل في الكابل كإشارات كهربائية (في النحاس) أو كضوء (في الألياف). نوع الكابل يؤثّر على السرعة والمسافة والتشويش." }],
            },
            {
              id: "m07-l01-p01-table", type: "table", origin: "book",
              headers: ["الكابل", "اسمه بالعربية", "صفته", "يُستعمل لـ"],
              rows: [
                ["UTP", "زوج ملتوٍ غير محمي", "غلاف بلاستيكي فقط، بدون طبقة حماية. شائع ورخيص.", "شبكات البيت والمدرسة"],
                ["STP", "زوج ملتوٍ محمي", "فيه طبقة حماية معدنية. أفضل ضد التشويش.", "أماكن فيها تشويش"],
                ["Fiber Optic", "ألياف بصرية", "لبّ زجاجي ينقل الضوء. سرعة عالية جدًا.", "مسافات طويلة جدًا"],
                ["Coaxial", "كابل محوري", "موصّل نحاسي في المنتصف.", "التلفزيون والإنترنت عبر الكابل"],
              ],
            },
            {
              id: "m07-l01-p01-rule", type: "callout", origin: "book", kind: "summary", title: "قاعدة",
              spans: [
                { text: "كلما زادت " },
                { text: "الحماية والجودة", style: "strong" },
                { text: "، كان الكابل أفضل ضد التشويش وفقدان البيانات. الألياف البصرية تستعمل الضوء، لذلك سرعتها عالية جدًا." },
              ],
            },
          ],
        },
        {
          id: "791381s-m07-l01-p02",
          title: "عنوان MAC (MAC Address)",
          order: 2,
          source: src(24, 25),
          blocks: [
            {
              id: "m07-l01-p02-def", type: "text", origin: "book",
              spans: [{ text: "عنوان MAC = رقم فيزيائي خاص بكرت الشبكة في الجهاز.", style: "strong" }],
            },
            {
              id: "m07-l01-p02-intro", type: "text", origin: "book",
              spans: [{ text: "كل كرت شبكة يأتي من المصنع وعليه رقم MAC خاص به، مثل رقم الهوية للإنسان." }],
            },
            {
              id: "m07-l01-p02-points", type: "list", origin: "book", variant: "plain",
              items: [
                { id: "m07-l01-p02-pt1", text: [{ text: "يكون " }, { text: "فريدًا", style: "strong" }, { text: " لكل جهاز تقريبًا." }] },
                { id: "m07-l01-p02-pt2", text: [{ text: "يتكوّن من " }, { text: "12 منزلة سادس عشرية", style: "strong" }, { text: " (Hex)." }] },
                { id: "m07-l01-p02-pt3", text: [{ text: "يعمل في " }, { text: "الطبقة الثانية", style: "strong" }, { text: " من نموذج OSI." }] },
                { id: "m07-l01-p02-pt4", text: [{ text: "يستخدمه " }, { text: "Switch", style: "strong" }, { text: " لمعرفة الجهاز المقصود." }] },
              ],
            },
            { id: "m07-l01-p02-mac", type: "code", origin: "book", language: "text", dir: "ltr", code: "A0:02:AF:2D:10:22" },
            {
              id: "m07-l01-p02-mac-note", type: "text", origin: "book",
              spans: [{ text: "مثال على عنوان MAC: 6 أزواج × 2 = 12 رمزًا" }],
            },
            { id: "m07-l01-p02-bcast", type: "code", origin: "book", language: "text", dir: "ltr", code: "FF:FF:FF:FF:FF:FF" },
            {
              id: "m07-l01-p02-bcast-note", type: "text", origin: "book",
              spans: [{ text: "عنوان البث (Broadcast) في MAC" }],
            },
            { id: "m07-l01-p02-uses-h", type: "heading", origin: "book", level: 3, text: "استخدامات عنوان MAC" },
            {
              id: "m07-l01-p02-uses", type: "list", origin: "book", variant: "plain",
              items: [
                { id: "m07-l01-p02-u1", text: [{ text: "تمييز الأجهزة:", style: "strong" }, { text: " نعرف كل جهاز داخل الشبكة." }] },
                { id: "m07-l01-p02-u2", text: [{ text: "توجيه البيانات:", style: "strong" }, { text: " السويتش يستعمله ليرسل للمقصود." }] },
                { id: "m07-l01-p02-u3", text: [{ text: "الأمان:", style: "strong" }, { text: " يمكن منع أجهزة غير مسموحة." }] },
                { id: "m07-l01-p02-u4", text: [{ text: "إدارة الشبكة:", style: "strong" }, { text: " تتبّع الأجهزة وتنظيمها." }] },
                { id: "m07-l01-p02-u5", text: [{ text: "الجدار الناري:", style: "strong" }, { text: " قد يُستعمل للتحكم بالوصول." }] },
              ],
            },
            { id: "m07-l01-p02-ipmac-h", type: "heading", origin: "book", level: 3, text: "الفرق بين IP و MAC" },
            {
              id: "m07-l01-p02-ipmac", type: "table", origin: "book",
              headers: ["وجه المقارنة", "عنوان IP", "عنوان MAC"],
              rows: [
                ["نوعه", "عنوان منطقي (رقم في الشبكة)", "عنوان فيزيائي (في كرت الشبكة)"],
                ["هل يتغيّر؟", "قد يتغيّر", "ثابت غالبًا"],
                ["شكله", "192.168.1.5", "A0:02:AF:2D:10:22"],
                ["طبقة OSI", "الثالثة (الشبكة)", "الثانية (ربط البيانات)"],
                ["الجهاز الذي يستعمله", "Router", "Switch"],
              ],
            },
          ],
        },
      ],
    },
  ],
};

export default m07;
