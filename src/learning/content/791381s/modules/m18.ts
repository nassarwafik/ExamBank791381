// Learning Materials — «أوراق تلخيص للمراجعة» (791381s), section 18 «إدارة VLAN مركزيًا: VTP».
//
// Verbatim conversion of booklet PDF pages 51–53 (the section header box → an opener page; each numbered sub-topic → one
// reader page). Every block is origin:"book": nothing is added, removed or reworded; bold runs are `strong`, monospace
// runs are `code`, printed box labels are the callout titles. The VTP Server/Client drawing is a crop of the booklet
// itself.

import type { ContentModule, ContentSource } from "../../types";

const CID = "791381s";
const src = (pdf: number, end?: number): ContentSource =>
  end ? { kind: "book", sourceId: CID, pdfPageStart: pdf, pdfPageEnd: end } : { kind: "book", sourceId: CID, pdfPageStart: pdf };

const m18: ContentModule = {
  id: "791381s-m18",
  title: "إدارة VLAN مركزيًا: VTP",
  order: 18,
  lessons: [
    {
      id: "791381s-m18-l00",
      title: "افتتاحية الوحدة",
      order: 0,
      pages: [
        {
          id: "791381s-m18-l00-p01",
          title: "إدارة VLAN مركزيًا: VTP",
          order: 1,
          layout: "opener",
          source: src(51),
          blocks: [
            {
              id: "m18-l00-p01-opener", type: "unit-opener", origin: "book",
              unitLabel: "الدفعة الرابعة · كتاب ص 139–144", unitNumber: "18", title: "إدارة VLAN مركزيًا: VTP",
              subtitle: "كيف نعرّف VLAN مرة واحدة فتصل إلى كل السويتشات؟",
            },
          ],
        },
      ],
    },
    {
      id: "791381s-m18-l01",
      title: "إدارة VLAN مركزيًا: VTP",
      order: 1,
      pages: [
        {
          id: "791381s-m18-l01-p01",
          title: "ما هو VTP؟",
          order: 1,
          source: src(51),
          blocks: [
            {
              id: "m18-l01-p01-def", type: "text", origin: "book",
              spans: [{ text: "VTP بروتوكول من Cisco لإدارة VLAN على عدة سويتشات من مكان واحد.", style: "strong" }],
            },
            {
              id: "m18-l01-p01-intro", type: "text", origin: "book",
              spans: [{ text: "تخيّل مدرسة فيها 6 سويتشات. إذا أردنا إضافة VLAN جديدة، يجب أن نكتب الأوامر 6 مرات! مع VTP نكتبها مرة واحدة فقط على سويتش رئيسي، وهو يوزّعها على الباقي." }],
            },
            {
              id: "m18-l01-p01-points", type: "list", origin: "book", variant: "plain",
              items: [
                { id: "m18-l01-p01-t1", text: [{ text: "المشكلة:", style: "strong" }, { text: " تعديل VLAN يدويًا على كل سويتش يأخذ وقتًا ويسبّب أخطاء." }] },
                {
                  id: "m18-l01-p01-t2",
                  text: [
                    { text: "الحل:", style: "strong" },
                    { text: " سويتش " },
                    { text: "Server", style: "strong" },
                    { text: " يرسل التحديثات إلى سويتشات " },
                    { text: "Client", style: "strong" },
                    { text: "." },
                  ],
                },
                { id: "m18-l01-p01-t3", text: [{ text: "يعمل غالبًا عبر وصلات " }, { text: "Trunk", style: "strong" }, { text: "." }] },
              ],
            },
            {
              id: "m18-l01-p01-fullname", type: "text", origin: "book",
              spans: [{ text: "الاسم الكامل:", style: "strong" }, { text: " VTP = VLAN Trunking Protocol" }],
            },
          ],
        },
        {
          id: "791381s-m18-l01-p02",
          title: "كيف يعمل VTP؟",
          order: 2,
          source: src(52),
          blocks: [
            {
              id: "m18-l01-p02-drawing", type: "diagram", origin: "book",
              src: "/learning-assets/791381s/bf24757a6d996271.png",
              alt: "مربع في الأعلى مكتوب فيه «Switch · Server» و«هنا نعرّف VLAN»، تخرج منه ثلاثة خطوط إلى ثلاثة مربعات مكتوب في كل منها «Client»؛ وعلى الخطين الجانبيين عبارة «VLAN 10, 20»، وينتهي أحدهما بسهم.",
              caption: "نعرّف VLAN على الـ Server فقط، فتصل تلقائيًا إلى كل الـ Clients",
            },
            {
              id: "m18-l01-p02-steps", type: "list", origin: "book", variant: "ordered",
              items: [
                { id: "m18-l01-p02-s1", text: [{ text: "نضبط سويتشًا واحدًا كـ " }, { text: "Server", style: "strong" }, { text: "." }] },
                { id: "m18-l01-p02-s2", text: [{ text: "نضبط باقي السويتشات كـ " }, { text: "Client", style: "strong" }, { text: "." }] },
                { id: "m18-l01-p02-s3", text: [{ text: "نعرّف VLAN في الـ Server فقط، فتصل للباقي تلقائيًا." }] },
              ],
            },
            {
              id: "m18-l01-p02-benefit", type: "callout", origin: "book", kind: "summary", title: "الفائدة",
              spans: [{ text: "توفير الوقت، وتقليل أخطاء تكرار الإعدادات على كل سويتش." }],
            },
          ],
        },
        {
          id: "791381s-m18-l01-p03",
          title: "إعداد VTP: Server و Client",
          order: 3,
          source: src(52, 53),
          blocks: [
            {
              id: "m18-l01-p03-intro", type: "text", origin: "book",
              spans: [{ text: "كل السويتشات يجب أن تكون في نفس «المجموعة» (Domain) ولها نفس كلمة المرور، حتى تقبل التحديثات من الـ Server." }],
            },
            { id: "m18-l01-p03-server-h", type: "heading", origin: "book", level: 3, text: "على السويتش الرئيسي (Server)" },
            { id: "m18-l01-p03-server-cli-h", type: "heading", origin: "book", level: 4, text: "Switch CLI · Server", dir: "ltr" },
            {
              id: "m18-l01-p03-server-cli", type: "code", origin: "book", language: "cli", dir: "ltr",
              code: "① Switch(config)# vtp mode server\n② Switch(config)# vtp domain HFA\n③ Switch(config)# vtp password 123",
            },
            {
              id: "m18-l01-p03-server-steps", type: "list", origin: "book", variant: "ordered",
              items: [
                { id: "m18-l01-p03-ss1", text: [{ text: "هذا السويتش هو الـ Server: هو الذي يدير تعريفات VLAN." }] },
                { id: "m18-l01-p03-ss2", text: [{ text: "اسم المجال المشترك " }, { text: "(Domain)", dir: "ltr" }, { text: ": HFA." }] },
                { id: "m18-l01-p03-ss3", text: [{ text: "كلمة مرور المجال: 123." }] },
              ],
            },
            { id: "m18-l01-p03-client-h", type: "heading", origin: "book", level: 3, text: "على كل سويتش آخر (Client)" },
            { id: "m18-l01-p03-client-cli-h", type: "heading", origin: "book", level: 4, text: "Switch CLI · Client", dir: "ltr" },
            {
              id: "m18-l01-p03-client-cli", type: "code", origin: "book", language: "cli", dir: "ltr",
              code: "① Switch(config)# vtp mode client\n② Switch(config)# vtp domain HFA\n③ Switch(config)# vtp password 123",
            },
            {
              id: "m18-l01-p03-client-steps", type: "list", origin: "book", variant: "ordered",
              items: [
                { id: "m18-l01-p03-cs1", text: [{ text: "هذا السويتش Client: يستقبل تعريفات VLAN من الـ Server." }] },
                { id: "m18-l01-p03-cs2", text: [{ text: "نفس اسم المجال بالضبط." }] },
                { id: "m18-l01-p03-cs3", text: [{ text: "نفس كلمة المرور بالضبط." }] },
              ],
            },
            {
              id: "m18-l01-p03-warning", type: "callout", origin: "book", kind: "warning", title: "انتبه",
              spans: [
                { text: "يجب أن يكون " },
                { text: "Domain", style: "strong" },
                { text: " و " },
                { text: "Password", style: "strong" },
                { text: " متطابقين في كل السويتشات، وإلا لن تصل التحديثات." },
              ],
            },
          ],
        },
        {
          id: "791381s-m18-l01-p04",
          title: "تعريف VLAN على سويتش الـ Server",
          order: 4,
          source: src(53),
          blocks: [
            {
              id: "m18-l01-p04-intro", type: "text", origin: "book",
              spans: [{ text: "بعد إعداد VTP نعرّف VLAN مرة واحدة فقط على الـ Server (بالأوامر التي تعلّمناها: vlan 10 ثم name)." }],
            },
            {
              id: "m18-l01-p04-points", type: "list", origin: "book", variant: "plain",
              items: [
                { id: "m18-l01-p04-t1", text: [{ text: "الـ Server ينقل التعريفات لباقي السويتشات." }] },
                { id: "m18-l01-p04-t2", text: [{ text: "هذا يقلّل الحاجة لتكرار الأوامر." }] },
                { id: "m18-l01-p04-t3", text: [{ text: "كل السويتشات يجب أن تكون داخل نفس الـ Domain، وكل سويتش Client ما عدا الـ Server." }] },
              ],
            },
            {
              id: "m18-l01-p04-check", type: "callout", origin: "book", kind: "summary", title: "تأكّد",
              spans: [{ text: "إذا كان VTP صحيحًا، ستظهر VLAN على الـ Clients تلقائيًا (نفحص بالأمر show vlan brief)." }],
            },
            {
              id: "m18-l01-p04-exam", type: "callout", origin: "book", kind: "summary", title: "للامتحان",
              spans: [
                { text: "يكفي أن تعرف الفرق بين " },
                { text: "Server", style: "strong" },
                { text: " (يعرّف ويرسل) و " },
                { text: "Client", style: "strong" },
                { text: " (يستقبل)، ووظيفة كل منهما." },
              ],
            },
          ],
        },
      ],
    },
  ],
};

export default m18;
