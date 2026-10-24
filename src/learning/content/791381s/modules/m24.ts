// Learning Materials — «أوراق تلخيص للمراجعة» (791381s), section 24 «حماية أجهزة Cisco بكلمات المرور».
//
// Verbatim conversion of booklet PDF pages 73–76 (the section header box → an opener page; each numbered sub-topic → one
// reader page). Every block is origin:"book": nothing is added, removed or reworded.

import type { ContentModule, ContentSource } from "../../types";

const CID = "791381s";
const src = (pdf: number, end?: number): ContentSource =>
  end ? { kind: "book", sourceId: CID, pdfPageStart: pdf, pdfPageEnd: end } : { kind: "book", sourceId: CID, pdfPageStart: pdf };

const m24: ContentModule = {
  id: "791381s-m24",
  title: "حماية أجهزة Cisco بكلمات المرور",
  order: 24,
  lessons: [
    {
      id: "791381s-m24-l00",
      title: "افتتاحية الوحدة",
      order: 0,
      pages: [
        {
          id: "791381s-m24-l00-p01",
          title: "حماية أجهزة Cisco بكلمات المرور",
          order: 1,
          layout: "opener",
          source: src(73),
          blocks: [
            {
              id: "m24-l00-p01-opener", type: "unit-opener", origin: "book",
              unitLabel: "الدفعة الخامسة · كتاب ص 185–190", unitNumber: "24", title: "حماية أجهزة Cisco بكلمات المرور",
              subtitle: "كيف نمنع أي شخص من الدخول إلى السويتش أو الراوتر وتغيير إعداداته؟",
            },
          ],
        },
      ],
    },
    {
      id: "791381s-m24-l01",
      title: "حماية أجهزة Cisco بكلمات المرور",
      order: 1,
      pages: [
        {
          id: "791381s-m24-l01-p01",
          title: "لماذا نحمي السويتشات والراوترات؟",
          order: 1,
          source: src(73),
          blocks: [
            {
              id: "m24-l01-p01-intro", type: "text", origin: "book",
              spans: [{ text: "إذا استطاع أي شخص الدخول إلى الراوتر، يستطيع تغيير الإعدادات وتعطيل الشبكة كلها. لذلك نضع كلمات مرور حتى يدخل التقني المسؤول فقط." }],
            },
            {
              id: "m24-l01-p01-points", type: "list", origin: "book", variant: "plain",
              items: [
                { id: "m24-l01-p01-pt1", text: [{ text: "الهدف: السماح للتقني فقط بتعديل الإعدادات." }] },
                { id: "m24-l01-p01-pt2", text: [{ text: "كلمات المرور تمنع الدخول غير المصرّح به." }] },
              ],
            },
            {
              id: "m24-l01-p01-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [
                { text: "حماية الجهاز نفسه " },
                { text: "لا تقل أهمية", style: "strong" },
                { text: " عن حماية الشبكة." },
              ],
            },
          ],
        },
        {
          id: "791381s-m24-l01-p02",
          title: "طرق الدخول إلى أجهزة Cisco",
          order: 2,
          source: src(73),
          blocks: [
            {
              id: "m24-l01-p02-table", type: "table", origin: "book",
              headers: ["الطريقة", "معناها", "الأمر"],
              rows: [
                ["Console", "دخول مباشر بكابل Console. نستخدمه عند البرمجة الأولى، ونحن قريبون من الجهاز.", "line console 0"],
                ["VTY", "دخول عن بُعد عبر الشبكة باستخدام Telnet أو SSH.", "line vty 0 4"],
                ["Enable", "الدخول إلى وضع الأوامر المتقدّم (#).", "enable secret"],
              ],
              columnDirs: ["rtl", "rtl", "ltr"],
            },
            {
              id: "m24-l01-p02-memo", type: "text", origin: "book",
              spans: [{ text: "Console = قريب من الجهاز (بكابل) · VTY = دخول عن بُعد", style: "strong" }],
            },
          ],
        },
        {
          id: "791381s-m24-l01-p03",
          title: "كلمة مرور Console",
          order: 3,
          source: src(74),
          blocks: [
            { id: "m24-l01-p03-cli-h", type: "heading", origin: "book", level: 4, text: "Switch / Router CLI", dir: "ltr" },
            {
              id: "m24-l01-p03-cli", type: "code", origin: "book", language: "cli", dir: "ltr",
              code: [
                "① Switch(config)# line console 0",
                "② Switch(config-line)# password cisco123",
                "③ Switch(config-line)# login",
              ].join("\n"),
            },
            {
              id: "m24-l01-p03-steps", type: "list", origin: "book", variant: "ordered",
              items: [
                { id: "m24-l01-p03-s1", text: [{ text: "ندخل إلى إعدادات منفذ الدخول المباشر للجهاز." }] },
                { id: "m24-l01-p03-s2", text: [{ text: "نحدّد كلمة المرور." }] },
                {
                  id: "m24-l01-p03-s3",
                  text: [{ text: "login", style: "strong" }, { text: ": يجعل الجهاز يطلب كلمة المرور عند الدخول (بدونه لا يسأل عنها)." }],
                },
              ],
            },
            {
              id: "m24-l01-p03-note", type: "text", origin: "book",
              spans: [{ text: "مهم عند وجود الجهاز في مكان مشترك، ونستعمله كثيرًا في Packet Tracer." }],
            },
          ],
        },
        {
          id: "791381s-m24-l01-p04",
          title: "كلمة مرور VTY (الدخول عن بُعد)",
          order: 4,
          source: src(74),
          blocks: [
            { id: "m24-l01-p04-cli-h", type: "heading", origin: "book", level: 4, text: "Switch / Router CLI", dir: "ltr" },
            {
              id: "m24-l01-p04-cli", type: "code", origin: "book", language: "cli", dir: "ltr",
              code: [
                "① Switch(config)# line vty 0 4",
                "② Switch(config-line)# password cisco123",
                "③ Switch(config-line)# login",
              ].join("\n"),
            },
            {
              id: "m24-l01-p04-steps", type: "list", origin: "book", variant: "ordered",
              items: [
                {
                  id: "m24-l01-p04-s1",
                  text: [{ text: "vty 0 4", style: "strong" }, { text: ": خطوط الدخول عن بُعد — 5 خطوط (من 0 إلى 4)، أي 5 أشخاص معًا." }],
                },
                { id: "m24-l01-p04-s2", text: [{ text: "كلمة مرور تمنع الدخول العشوائي." }] },
                { id: "m24-l01-p04-s3", text: [{ text: "يجعل الجهاز يطلب كلمة المرور." }] },
              ],
            },
            {
              id: "m24-l01-p04-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [
                { text: "يُفضّل " },
                { text: "SSH", style: "strong" },
                { text: " بدل Telnet، لأنه أكثر أمانًا ويشفّر البيانات." },
              ],
            },
          ],
        },
        {
          id: "791381s-m24-l01-p05",
          title: "تشفير كلمات المرور",
          order: 5,
          source: src(75),
          blocks: [
            { id: "m24-l01-p05-cli-h", type: "heading", origin: "book", level: 4, text: "Switch / Router CLI", dir: "ltr" },
            {
              id: "m24-l01-p05-cli", type: "code", origin: "book", language: "cli", dir: "ltr",
              code: [
                "① Switch(config)# enable secret cisco123",
                "② Switch(config)# service password-encryption",
              ].join("\n"),
            },
            {
              id: "m24-l01-p05-steps", type: "list", origin: "book", variant: "ordered",
              items: [
                {
                  id: "m24-l01-p05-s1",
                  text: [
                    { text: "enable secret", style: "strong" },
                    { text: ": كلمة مرور لوضع الأوامر المتقدّم، محفوظة " },
                    { text: "بشكل مشفّر", style: "strong" },
                    { text: ". أقوى من enable password." },
                  ],
                },
                {
                  id: "m24-l01-p05-s2",
                  text: [
                    { text: "service password-encryption", style: "strong" },
                    { text: ": يخفي كلمات المرور العادية (مثل كلمة Console و VTY) في ملف الإعدادات." },
                  ],
                },
              ],
            },
            {
              id: "m24-l01-p05-why", type: "callout", origin: "book", kind: "summary", title: "لماذا نشفّر؟",
              spans: [{ text: "بدون تشفير، من يعرض الإعدادات يرى password cisco123 مكتوبة بوضوح. بعد التشفير يرى رموزًا غير مفهومة بدلها." }],
            },
          ],
        },
        {
          id: "791381s-m24-l01-p06",
          title: "عرض الإعدادات وحفظها",
          order: 6,
          source: src(75, 76),
          blocks: [
            {
              id: "m24-l01-p06-intro", type: "text", origin: "book",
              spans: [{ text: "أوامر show نستعملها للفحص والتأكّد من الأوامر. تُكتب في الوضع المتقدّم (#)." }],
            },
            { id: "m24-l01-p06-cli-h", type: "heading", origin: "book", level: 4, text: "Switch / Router CLI", dir: "ltr" },
            {
              id: "m24-l01-p06-cli", type: "code", origin: "book", language: "cli", dir: "ltr",
              code: [
                "① Switch# show running-config",
                "② Switch# show startup-config",
                "③ Switch# copy running-config startup-config",
              ].join("\n"),
            },
            {
              id: "m24-l01-p06-steps", type: "list", origin: "book", variant: "ordered",
              items: [
                {
                  id: "m24-l01-p06-s1",
                  text: [
                    { text: "running-config", style: "strong" },
                    { text: ": يعرض الإعدادات " },
                    { text: "الحالية", style: "strong" },
                    { text: " التي تعمل الآن." },
                  ],
                },
                {
                  id: "m24-l01-p06-s2",
                  text: [
                    { text: "startup-config", style: "strong" },
                    { text: ": يعرض الإعدادات " },
                    { text: "المحفوظة", style: "strong" },
                    { text: " التي تُحمّل عند تشغيل الجهاز." },
                  ],
                },
                {
                  id: "m24-l01-p06-s3",
                  text: [{ text: "copy", style: "strong" }, { text: ": يحفظ الإعدادات الحالية — حتى لا تضيع عند إطفاء الجهاز." }],
                },
              ],
            },
            {
              id: "m24-l01-p06-save", type: "callout", origin: "book", kind: "summary", title: "لا تنسَ الحفظ",
              spans: [{ text: "الإعدادات الحالية (running) تضيع إذا أُطفئ الجهاز. بعد البرمجة احفظها دائمًا بالأمر copy running-config startup-config." }],
            },
          ],
        },
      ],
    },
  ],
};

export default m24;
