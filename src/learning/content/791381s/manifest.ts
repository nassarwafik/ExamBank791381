// Learning Materials — content MANIFEST for the summary booklet «أوراق تلخيص للمراجعة» (course 791381s, نموذج 791381).
//
// The lightweight table of contents: module / lesson / page IDENTITIES, titles and source references — and NO block bodies
// (each module's bodies live in `modules/mNN.ts` and are served by the API after the publication check). Module mNN is the
// booklet's numbered section NN (m00 = its introduction, the cover); `order` is the section number. Every page's source is
// the booklet PDF page that printed it. Generated from the authored bodies; contentData.sync.test.ts pins the two equal.
//
// ID policy: `791381s` · `791381s-mNN` · `791381s-mNN-lNN` · `791381s-mNN-lNN-pNN` — stable, never regenerated at runtime.

import { LEARNING_CONTENT_SCHEMA_VERSION, type LearningCourseManifest } from "../types";

const manifest: LearningCourseManifest = {
  schemaVersion: LEARNING_CONTENT_SCHEMA_VERSION,
  courseId: "791381s",
  title: "أوراق تلخيص شبكات الاتصال",
  direction: "rtl",
  modules: [
    {
      id: "791381s-m00",
      title: "أوراق تلخيص للمراجعة",
      order: 0,
      lessons: [
        {
          id: "791381s-m00-l01",
          title: "أوراق تلخيص للمراجعة",
          order: 1,
          pages: [
            { id: "791381s-m00-l01-p01", title: "شبكات الاتصال — أوراق تلخيص للمراجعة", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 1 } },
            { id: "791381s-m00-l01-p02", title: "كيف أدرس من هذه الأوراق؟", order: 2, source: { kind: "book", sourceId: "791381s", pdfPageStart: 1 } },
          ],
        },
      ],
    },
    {
      id: "791381s-m01",
      title: "أساسيات الشبكات",
      order: 1,
      lessons: [
        {
          id: "791381s-m01-l00",
          title: "افتتاحية الوحدة",
          order: 0,
          pages: [
            { id: "791381s-m01-l00-p01", title: "أساسيات الشبكات", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 4 } },
          ],
        },
        {
          id: "791381s-m01-l01",
          title: "أساسيات الشبكات",
          order: 1,
          pages: [
            { id: "791381s-m01-l01-p01", title: "ما هي الشبكة؟", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 4 } },
            { id: "791381s-m01-l01-p02", title: "لماذا نحتاج الشبكة؟ (الاستخدامات والحسنات)", order: 2, source: { kind: "book", sourceId: "791381s", pdfPageStart: 4, pdfPageEnd: 5 } },
            { id: "791381s-m01-l01-p03", title: "أنواع الشبكات حسب الحجم", order: 3, source: { kind: "book", sourceId: "791381s", pdfPageStart: 5 } },
            { id: "791381s-m01-l01-p04", title: "ماذا نحتاج لبناء شبكة؟", order: 4, source: { kind: "book", sourceId: "791381s", pdfPageStart: 5 } },
            { id: "791381s-m01-l01-p05", title: "إدارة الشبكة وصيانتها", order: 5, source: { kind: "book", sourceId: "791381s", pdfPageStart: 6 } },
          ],
        },
      ],
    },
    {
      id: "791381s-m02",
      title: "الأعداد والتحويل بينها",
      order: 2,
      lessons: [
        {
          id: "791381s-m02-l00",
          title: "افتتاحية الوحدة",
          order: 0,
          pages: [
            { id: "791381s-m02-l00-p01", title: "الأعداد والتحويل بينها", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 6 } },
          ],
        },
        {
          id: "791381s-m02-l01",
          title: "الأعداد والتحويل بينها",
          order: 1,
          pages: [
            { id: "791381s-m02-l01-p01", title: "العشري والثنائي", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 6 } },
            { id: "791381s-m02-l01-p02", title: "طريقة الصناديق (أهم أداة في الوحدة)", order: 2, source: { kind: "book", sourceId: "791381s", pdfPageStart: 7 } },
            { id: "791381s-m02-l01-p03", title: "من الثنائي إلى العشري", order: 3, source: { kind: "book", sourceId: "791381s", pdfPageStart: 7 } },
            { id: "791381s-m02-l01-p04", title: "من العشري إلى الثنائي", order: 4, source: { kind: "book", sourceId: "791381s", pdfPageStart: 7, pdfPageEnd: 8 } },
            { id: "791381s-m02-l01-p05", title: "النظام السادس عشر (Hex)", order: 5, source: { kind: "book", sourceId: "791381s", pdfPageStart: 8, pdfPageEnd: 9 } },
            { id: "791381s-m02-l01-p06", title: "من Hex إلى الثنائي", order: 6, source: { kind: "book", sourceId: "791381s", pdfPageStart: 9 } },
            { id: "791381s-m02-l01-p07", title: "من الثنائي إلى Hex", order: 7, source: { kind: "book", sourceId: "791381s", pdfPageStart: 10 } },
            { id: "791381s-m02-l01-p08", title: "خلاصة التحويلات", order: 8, source: { kind: "book", sourceId: "791381s", pdfPageStart: 10 } },
          ],
        },
      ],
    },
    {
      id: "791381s-m03",
      title: "عناوين IP",
      order: 3,
      lessons: [
        {
          id: "791381s-m03-l00",
          title: "افتتاحية الوحدة",
          order: 0,
          pages: [
            { id: "791381s-m03-l00-p01", title: "عناوين IP", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 11 } },
          ],
        },
        {
          id: "791381s-m03-l01",
          title: "عناوين IP",
          order: 1,
          pages: [
            { id: "791381s-m03-l01-p01", title: "ما هو عنوان IP؟", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 11 } },
            { id: "791381s-m03-l01-p02", title: "IPv4 و IPv6", order: 2, source: { kind: "book", sourceId: "791381s", pdfPageStart: 11 } },
            { id: "791381s-m03-l01-p03", title: "مبنى عنوان IPv4", order: 3, source: { kind: "book", sourceId: "791381s", pdfPageStart: 11, pdfPageEnd: 12 } },
            { id: "791381s-m03-l01-p04", title: "متى يكون عنوان IP غير صالح للحاسوب؟", order: 4, source: { kind: "book", sourceId: "791381s", pdfPageStart: 12, pdfPageEnd: 13 } },
            { id: "791381s-m03-l01-p05", title: "عنوان عام وعنوان خاص", order: 5, source: { kind: "book", sourceId: "791381s", pdfPageStart: 13 } },
            { id: "791381s-m03-l01-p06", title: "عنوان ثابت وعنوان متغيّر", order: 6, source: { kind: "book", sourceId: "791381s", pdfPageStart: 14 } },
          ],
        },
      ],
    },
    {
      id: "791381s-m04",
      title: "الفئات وقناع الشبكة و CIDR",
      order: 4,
      lessons: [
        {
          id: "791381s-m04-l00",
          title: "افتتاحية الوحدة",
          order: 0,
          pages: [
            { id: "791381s-m04-l00-p01", title: "الفئات وقناع الشبكة و CIDR", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 14 } },
          ],
        },
        {
          id: "791381s-m04-l01",
          title: "الفئات وقناع الشبكة و CIDR",
          order: 1,
          pages: [
            { id: "791381s-m04-l01-p01", title: "فئات العناوين (Class)", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 14, pdfPageEnd: 15 } },
            { id: "791381s-m04-l01-p02", title: "قناع الشبكة (Subnet Mask)", order: 2, source: { kind: "book", sourceId: "791381s", pdfPageStart: 15 } },
            { id: "791381s-m04-l01-p03", title: "جزء الشبكة وجزء الجهاز", order: 3, source: { kind: "book", sourceId: "791381s", pdfPageStart: 15, pdfPageEnd: 16 } },
            { id: "791381s-m04-l01-p04", title: "ما هو CIDR؟", order: 4, source: { kind: "book", sourceId: "791381s", pdfPageStart: 16 } },
            { id: "791381s-m04-l01-p05", title: "أول عنوان وآخر عنوان في الشبكة", order: 5, source: { kind: "book", sourceId: "791381s", pdfPageStart: 17 } },
            { id: "791381s-m04-l01-p06", title: "أجهزة في نفس الشبكة", order: 6, source: { kind: "book", sourceId: "791381s", pdfPageStart: 17, pdfPageEnd: 18 } },
            { id: "791381s-m04-l01-p07", title: "البوابة الافتراضية (Default Gateway)", order: 7, source: { kind: "book", sourceId: "791381s", pdfPageStart: 18, pdfPageEnd: 19 } },
          ],
        },
      ],
    },
    {
      id: "791381s-m05",
      title: "أجهزة الشبكات",
      order: 5,
      lessons: [
        {
          id: "791381s-m05-l00",
          title: "افتتاحية الوحدة",
          order: 0,
          pages: [
            { id: "791381s-m05-l00-p01", title: "أجهزة الشبكات", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 19 } },
          ],
        },
        {
          id: "791381s-m05-l01",
          title: "أجهزة الشبكات",
          order: 1,
          pages: [
            { id: "791381s-m05-l01-p01", title: "جهاز Hub", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 19 } },
            { id: "791381s-m05-l01-p02", title: "جهاز Switch", order: 2, source: { kind: "book", sourceId: "791381s", pdfPageStart: 20 } },
            { id: "791381s-m05-l01-p03", title: "جهاز Router", order: 3, source: { kind: "book", sourceId: "791381s", pdfPageStart: 21 } },
          ],
        },
      ],
    },
    {
      id: "791381s-m06",
      title: "أنواع شبكات الاتصال (أشكال التوصيل)",
      order: 6,
      lessons: [
        {
          id: "791381s-m06-l00",
          title: "افتتاحية الوحدة",
          order: 0,
          pages: [
            { id: "791381s-m06-l00-p01", title: "أنواع شبكات الاتصال (أشكال التوصيل)", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 21 } },
          ],
        },
        {
          id: "791381s-m06-l01",
          title: "أنواع شبكات الاتصال (أشكال التوصيل)",
          order: 1,
          pages: [
            { id: "791381s-m06-l01-p01", title: "الشبكات البسيطة", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 21, pdfPageEnd: 22 } },
            { id: "791381s-m06-l01-p02", title: "الشبكات السلكية التقليدية", order: 2, source: { kind: "book", sourceId: "791381s", pdfPageStart: 22 } },
            { id: "791381s-m06-l01-p03", title: "الشبكات الحديثة", order: 3, source: { kind: "book", sourceId: "791381s", pdfPageStart: 22, pdfPageEnd: 23 } },
          ],
        },
      ],
    },
    {
      id: "791381s-m07",
      title: "الكوابل وعنوان MAC",
      order: 7,
      lessons: [
        {
          id: "791381s-m07-l00",
          title: "افتتاحية الوحدة",
          order: 0,
          pages: [
            { id: "791381s-m07-l00-p01", title: "الكوابل وعنوان MAC", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 23 } },
          ],
        },
        {
          id: "791381s-m07-l01",
          title: "الكوابل وعنوان MAC",
          order: 1,
          pages: [
            { id: "791381s-m07-l01-p01", title: "الكوابل المستعملة في الشبكات", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 23, pdfPageEnd: 24 } },
            { id: "791381s-m07-l01-p02", title: "عنوان MAC (MAC Address)", order: 2, source: { kind: "book", sourceId: "791381s", pdfPageStart: 24, pdfPageEnd: 25 } },
          ],
        },
      ],
    },
    {
      id: "791381s-m08",
      title: "أنواع الرسائل",
      order: 8,
      lessons: [
        {
          id: "791381s-m08-l00",
          title: "افتتاحية الوحدة",
          order: 0,
          pages: [
            { id: "791381s-m08-l00-p01", title: "أنواع الرسائل", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 25 } },
          ],
        },
        {
          id: "791381s-m08-l01",
          title: "أنواع الرسائل",
          order: 1,
          pages: [
            { id: "791381s-m08-l01-p01", title: "البث (Broadcast) بالتفصيل", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 25, pdfPageEnd: 26 } },
            { id: "791381s-m08-l01-p02", title: "مبنى الرسالة في الشبكة", order: 2, source: { kind: "book", sourceId: "791381s", pdfPageStart: 27 } },
            { id: "791381s-m08-l01-p03", title: "وحدات التخزين", order: 3, source: { kind: "book", sourceId: "791381s", pdfPageStart: 27 } },
          ],
        },
      ],
    },
    {
      id: "791381s-m09",
      title: "نموذج OSI ونموذج TCP/IP",
      order: 9,
      lessons: [
        {
          id: "791381s-m09-l00",
          title: "افتتاحية الوحدة",
          order: 0,
          pages: [
            { id: "791381s-m09-l00-p01", title: "نموذج OSI ونموذج TCP/IP", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 28 } },
          ],
        },
        {
          id: "791381s-m09-l01",
          title: "نموذج OSI ونموذج TCP/IP",
          order: 1,
          pages: [
            { id: "791381s-m09-l01-p01", title: "ما هو نموذج OSI؟", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 28, pdfPageEnd: 29 } },
            { id: "791381s-m09-l01-p02", title: "نموذج TCP/IP", order: 2, source: { kind: "book", sourceId: "791381s", pdfPageStart: 29, pdfPageEnd: 30 } },
            { id: "791381s-m09-l01-p03", title: "بروتوكولا النقل: TCP و UDP", order: 3, source: { kind: "book", sourceId: "791381s", pdfPageStart: 30 } },
          ],
        },
      ],
    },
    {
      id: "791381s-m10",
      title: "البروتوكولات",
      order: 10,
      lessons: [
        {
          id: "791381s-m10-l00",
          title: "افتتاحية الوحدة",
          order: 0,
          pages: [
            { id: "791381s-m10-l00-p01", title: "البروتوكولات", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 31 } },
          ],
        },
        {
          id: "791381s-m10-l01",
          title: "البروتوكولات",
          order: 1,
          pages: [
            { id: "791381s-m10-l01-p01", title: "البروتوكولات", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 31, pdfPageEnd: 32 } },
          ],
        },
      ],
    },
    {
      id: "791381s-m11",
      title: "أوامر فحص الشبكة",
      order: 11,
      lessons: [
        {
          id: "791381s-m11-l00",
          title: "افتتاحية الوحدة",
          order: 0,
          pages: [
            { id: "791381s-m11-l00-p01", title: "أوامر فحص الشبكة", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 32 } },
          ],
        },
        {
          id: "791381s-m11-l01",
          title: "أوامر فحص الشبكة",
          order: 1,
          pages: [
            { id: "791381s-m11-l01-p01", title: "الأمر ping", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 32, pdfPageEnd: 33 } },
            { id: "791381s-m11-l01-p02", title: "الأمر ipconfig", order: 2, source: { kind: "book", sourceId: "791381s", pdfPageStart: 33 } },
            { id: "791381s-m11-l01-p03", title: "الأمر tracert", order: 3, source: { kind: "book", sourceId: "791381s", pdfPageStart: 33 } },
            { id: "791381s-m11-l01-p04", title: "الأمر nslookup", order: 4, source: { kind: "book", sourceId: "791381s", pdfPageStart: 33 } },
            { id: "791381s-m11-l01-p05", title: "الأمر arp", order: 5, source: { kind: "book", sourceId: "791381s", pdfPageStart: 34 } },
          ],
        },
      ],
    },
    {
      id: "791381s-m12",
      title: "المجالات والمفاهيم",
      order: 12,
      lessons: [
        {
          id: "791381s-m12-l00",
          title: "افتتاحية الوحدة",
          order: 0,
          pages: [
            { id: "791381s-m12-l00-p01", title: "المجالات والمفاهيم", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 34 } },
          ],
        },
        {
          id: "791381s-m12-l01",
          title: "المجالات والمفاهيم",
          order: 1,
          pages: [
            { id: "791381s-m12-l01-p01", title: "مجال التصادم (Collision Domain)", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 34, pdfPageEnd: 35 } },
            { id: "791381s-m12-l01-p02", title: "مجال البث (Broadcast Domain)", order: 2, source: { kind: "book", sourceId: "791381s", pdfPageStart: 35 } },
            { id: "791381s-m12-l01-p03", title: "بروتوكول STP", order: 3, source: { kind: "book", sourceId: "791381s", pdfPageStart: 36 } },
            { id: "791381s-m12-l01-p04", title: "Half Duplex و Full Duplex", order: 4, source: { kind: "book", sourceId: "791381s", pdfPageStart: 36 } },
            { id: "791381s-m12-l01-p05", title: "Localhost و APIPA", order: 5, source: { kind: "book", sourceId: "791381s", pdfPageStart: 36, pdfPageEnd: 37 } },
          ],
        },
      ],
    },
    {
      id: "791381s-m13",
      title: "أمان الشبكات",
      order: 13,
      lessons: [
        {
          id: "791381s-m13-l00",
          title: "افتتاحية الوحدة",
          order: 0,
          pages: [
            { id: "791381s-m13-l00-p01", title: "أمان الشبكات", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 37 } },
          ],
        },
        {
          id: "791381s-m13-l01",
          title: "أمان الشبكات",
          order: 1,
          pages: [
            { id: "791381s-m13-l01-p01", title: "القرصنة والهجمات على الشبكة", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 37, pdfPageEnd: 38 } },
            { id: "791381s-m13-l01-p02", title: "الاتصالات الآمنة", order: 2, source: { kind: "book", sourceId: "791381s", pdfPageStart: 38, pdfPageEnd: 39 } },
          ],
        },
      ],
    },
    {
      id: "791381s-m14",
      title: "تجزئة البيانات والمصافحة الثلاثية",
      order: 14,
      lessons: [
        {
          id: "791381s-m14-l00",
          title: "افتتاحية الوحدة",
          order: 0,
          pages: [
            { id: "791381s-m14-l00-p01", title: "تجزئة البيانات والمصافحة الثلاثية", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 39 } },
          ],
        },
        {
          id: "791381s-m14-l01",
          title: "تجزئة البيانات والمصافحة الثلاثية",
          order: 1,
          pages: [
            { id: "791381s-m14-l01-p01", title: "تجزئة البيانات في OSI", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 39, pdfPageEnd: 40 } },
            { id: "791381s-m14-l01-p02", title: "المصافحة الثلاثية في TCP‏ (‎3-Way Handshake)", order: 2, source: { kind: "book", sourceId: "791381s", pdfPageStart: 40, pdfPageEnd: 41 } },
          ],
        },
      ],
    },
    {
      id: "791381s-m15",
      title: "برمجة السويتش من CLI",
      order: 15,
      lessons: [
        {
          id: "791381s-m15-l00",
          title: "افتتاحية الوحدة",
          order: 0,
          pages: [
            { id: "791381s-m15-l00-p01", title: "برمجة السويتش من CLI", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 41 } },
          ],
        },
        {
          id: "791381s-m15-l01",
          title: "برمجة السويتش من CLI",
          order: 1,
          pages: [
            { id: "791381s-m15-l01-p01", title: "ما هو CLI؟", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 41, pdfPageEnd: 42 } },
            { id: "791381s-m15-l01-p02", title: "الدخول إلى وضع البرمجة", order: 2, source: { kind: "book", sourceId: "791381s", pdfPageStart: 42, pdfPageEnd: 43 } },
            { id: "791381s-m15-l01-p03", title: "منافذ السويتش وأسماؤها", order: 3, source: { kind: "book", sourceId: "791381s", pdfPageStart: 43 } },
            { id: "791381s-m15-l01-p04", title: "خطوات برمجة أي منفذ", order: 4, source: { kind: "book", sourceId: "791381s", pdfPageStart: 43, pdfPageEnd: 44 } },
          ],
        },
      ],
    },
    {
      id: "791381s-m16",
      title: "الشبكات الافتراضية VLAN",
      order: 16,
      lessons: [
        {
          id: "791381s-m16-l00",
          title: "افتتاحية الوحدة",
          order: 0,
          pages: [
            { id: "791381s-m16-l00-p01", title: "الشبكات الافتراضية VLAN", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 44 } },
          ],
        },
        {
          id: "791381s-m16-l01",
          title: "الشبكات الافتراضية VLAN",
          order: 1,
          pages: [
            { id: "791381s-m16-l01-p01", title: "ما هي VLAN؟", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 44, pdfPageEnd: 45 } },
            { id: "791381s-m16-l01-p02", title: "مصطلحات مهمة", order: 2, source: { kind: "book", sourceId: "791381s", pdfPageStart: 45 } },
            { id: "791381s-m16-l01-p03", title: "مثال: جدول VLAN", order: 3, source: { kind: "book", sourceId: "791381s", pdfPageStart: 45, pdfPageEnd: 46 } },
            { id: "791381s-m16-l01-p04", title: "إنشاء VLAN على السويتش", order: 4, source: { kind: "book", sourceId: "791381s", pdfPageStart: 46 } },
            { id: "791381s-m16-l01-p05", title: "ربط المنافذ مع VLAN (منافذ Access)", order: 5, source: { kind: "book", sourceId: "791381s", pdfPageStart: 46, pdfPageEnd: 47 } },
            { id: "791381s-m16-l01-p06", title: "الواجهة SVI والبوابة (Gateway)", order: 6, source: { kind: "book", sourceId: "791381s", pdfPageStart: 48 } },
          ],
        },
      ],
    },
    {
      id: "791381s-m17",
      title: "Native و Tagged و Untagged",
      order: 17,
      lessons: [
        {
          id: "791381s-m17-l00",
          title: "افتتاحية الوحدة",
          order: 0,
          pages: [
            { id: "791381s-m17-l00-p01", title: "Native و Tagged و Untagged", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 48 } },
          ],
        },
        {
          id: "791381s-m17-l01",
          title: "Native و Tagged و Untagged",
          order: 1,
          pages: [
            { id: "791381s-m17-l01-p01", title: "ما هو الـ Tag؟", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 48, pdfPageEnd: 49 } },
            { id: "791381s-m17-l01-p02", title: "الأنواع الثلاثة", order: 2, source: { kind: "book", sourceId: "791381s", pdfPageStart: 49 } },
            { id: "791381s-m17-l01-p03", title: "إعداد Native VLAN", order: 3, source: { kind: "book", sourceId: "791381s", pdfPageStart: 49, pdfPageEnd: 50 } },
            { id: "791381s-m17-l01-p04", title: "إعداد Tagged VLAN عبر Trunk", order: 4, source: { kind: "book", sourceId: "791381s", pdfPageStart: 50 } },
            { id: "791381s-m17-l01-p05", title: "إعداد Untagged / Access (تذكير)", order: 5, source: { kind: "book", sourceId: "791381s", pdfPageStart: 50, pdfPageEnd: 51 } },
          ],
        },
      ],
    },
    {
      id: "791381s-m18",
      title: "إدارة VLAN مركزيًا: VTP",
      order: 18,
      lessons: [
        {
          id: "791381s-m18-l00",
          title: "افتتاحية الوحدة",
          order: 0,
          pages: [
            { id: "791381s-m18-l00-p01", title: "إدارة VLAN مركزيًا: VTP", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 51 } },
          ],
        },
        {
          id: "791381s-m18-l01",
          title: "إدارة VLAN مركزيًا: VTP",
          order: 1,
          pages: [
            { id: "791381s-m18-l01-p01", title: "ما هو VTP؟", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 51 } },
            { id: "791381s-m18-l01-p02", title: "كيف يعمل VTP؟", order: 2, source: { kind: "book", sourceId: "791381s", pdfPageStart: 52 } },
            { id: "791381s-m18-l01-p03", title: "إعداد VTP: Server و Client", order: 3, source: { kind: "book", sourceId: "791381s", pdfPageStart: 52, pdfPageEnd: 53 } },
            { id: "791381s-m18-l01-p04", title: "تعريف VLAN على سويتش الـ Server", order: 4, source: { kind: "book", sourceId: "791381s", pdfPageStart: 53 } },
          ],
        },
      ],
    },
    {
      id: "791381s-m19",
      title: "Trunk و Router on a Stick",
      order: 19,
      lessons: [
        {
          id: "791381s-m19-l00",
          title: "افتتاحية الوحدة",
          order: 0,
          pages: [
            { id: "791381s-m19-l00-p01", title: "Trunk و Router on a Stick", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 54 } },
          ],
        },
        {
          id: "791381s-m19-l01",
          title: "Trunk و Router on a Stick",
          order: 1,
          pages: [
            { id: "791381s-m19-l01-p01", title: "ما هو Trunk؟", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 54 } },
            { id: "791381s-m19-l01-p02", title: "منافذ الربط بين السويتشات", order: 2, source: { kind: "book", sourceId: "791381s", pdfPageStart: 54, pdfPageEnd: 55 } },
            { id: "791381s-m19-l01-p03", title: "أوامر Trunk على السويتشات", order: 3, source: { kind: "book", sourceId: "791381s", pdfPageStart: 55 } },
            { id: "791381s-m19-l01-p04", title: "ما هو Dot1Q؟", order: 4, source: { kind: "book", sourceId: "791381s", pdfPageStart: 56 } },
            { id: "791381s-m19-l01-p05", title: "Router on a Stick", order: 5, source: { kind: "book", sourceId: "791381s", pdfPageStart: 56, pdfPageEnd: 57 } },
            { id: "791381s-m19-l01-p06", title: "أوامر الراوتر: VLAN 10 و VLAN 20", order: 6, source: { kind: "book", sourceId: "791381s", pdfPageStart: 57, pdfPageEnd: 58 } },
            { id: "791381s-m19-l01-p07", title: "أوامر الراوتر: VLAN 30 و VLAN 40", order: 7, source: { kind: "book", sourceId: "791381s", pdfPageStart: 58 } },
          ],
        },
      ],
    },
    {
      id: "791381s-m20",
      title: "المنطقة العازلة DMZ والشبكات اللاسلكية",
      order: 20,
      lessons: [
        {
          id: "791381s-m20-l00",
          title: "افتتاحية الوحدة",
          order: 0,
          pages: [
            { id: "791381s-m20-l00-p01", title: "المنطقة العازلة DMZ والشبكات اللاسلكية", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 59 } },
          ],
        },
        {
          id: "791381s-m20-l01",
          title: "المنطقة العازلة DMZ والشبكات اللاسلكية",
          order: 1,
          pages: [
            { id: "791381s-m20-l01-p01", title: "المنطقة العازلة DMZ", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 59, pdfPageEnd: 60 } },
            { id: "791381s-m20-l01-p02", title: "الشبكة اللاسلكية Wi-Fi", order: 2, source: { kind: "book", sourceId: "791381s", pdfPageStart: 60 } },
            { id: "791381s-m20-l01-p03", title: "أنواع الشبكات اللاسلكية", order: 3, source: { kind: "book", sourceId: "791381s", pdfPageStart: 61 } },
            { id: "791381s-m20-l01-p04", title: "SSID — اسم شبكة Wi-Fi", order: 4, source: { kind: "book", sourceId: "791381s", pdfPageStart: 61 } },
            { id: "791381s-m20-l01-p05", title: "أمان الشبكة اللاسلكية", order: 5, source: { kind: "book", sourceId: "791381s", pdfPageStart: 62 } },
            { id: "791381s-m20-l01-p06", title: "نقطة الوصول Access Point", order: 6, source: { kind: "book", sourceId: "791381s", pdfPageStart: 62, pdfPageEnd: 63 } },
          ],
        },
      ],
    },
    {
      id: "791381s-m21",
      title: "IPv6 والمنافذ Ports",
      order: 21,
      lessons: [
        {
          id: "791381s-m21-l00",
          title: "افتتاحية الوحدة",
          order: 0,
          pages: [
            { id: "791381s-m21-l00-p01", title: "IPv6 والمنافذ Ports", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 63 } },
          ],
        },
        {
          id: "791381s-m21-l01",
          title: "IPv6 والمنافذ Ports",
          order: 1,
          pages: [
            { id: "791381s-m21-l01-p01", title: "IPv6 — عنوان الجيل الجديد", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 63, pdfPageEnd: 64 } },
            { id: "791381s-m21-l01-p02", title: "اختصار عنوان IPv6", order: 2, source: { kind: "book", sourceId: "791381s", pdfPageStart: 64 } },
            { id: "791381s-m21-l01-p03", title: "المنافذ المهمة Ports", order: 3, source: { kind: "book", sourceId: "791381s", pdfPageStart: 64, pdfPageEnd: 65 } },
          ],
        },
      ],
    },
    {
      id: "791381s-m22",
      title: "بروتوكول DHCP",
      order: 22,
      lessons: [
        {
          id: "791381s-m22-l00",
          title: "افتتاحية الوحدة",
          order: 0,
          pages: [
            { id: "791381s-m22-l00-p01", title: "بروتوكول DHCP", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 66 } },
          ],
        },
        {
          id: "791381s-m22-l01",
          title: "بروتوكول DHCP",
          order: 1,
          pages: [
            { id: "791381s-m22-l01-p01", title: "ما هو DHCP؟", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 66 } },
            { id: "791381s-m22-l01-p02", title: "مراحل عمل DHCP (DORA)", order: 2, source: { kind: "book", sourceId: "791381s", pdfPageStart: 66, pdfPageEnd: 67 } },
            { id: "791381s-m22-l01-p03", title: "مثال: DHCP على الراوتر", order: 3, source: { kind: "book", sourceId: "791381s", pdfPageStart: 67, pdfPageEnd: 68 } },
            { id: "791381s-m22-l01-p04", title: "ملاحظات مهمة عن DHCP", order: 4, source: { kind: "book", sourceId: "791381s", pdfPageStart: 69 } },
            { id: "791381s-m22-l01-p05", title: "DHCP عن طريق Server (في Packet Tracer)", order: 5, source: { kind: "book", sourceId: "791381s", pdfPageStart: 69, pdfPageEnd: 70 } },
          ],
        },
      ],
    },
    {
      id: "791381s-m23",
      title: "حماية المنافذ Port Security",
      order: 23,
      lessons: [
        {
          id: "791381s-m23-l00",
          title: "افتتاحية الوحدة",
          order: 0,
          pages: [
            { id: "791381s-m23-l00-p01", title: "حماية المنافذ Port Security", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 70 } },
          ],
        },
        {
          id: "791381s-m23-l01",
          title: "حماية المنافذ Port Security",
          order: 1,
          pages: [
            { id: "791381s-m23-l01-p01", title: "ما هو Port Security؟", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 70 } },
            { id: "791381s-m23-l01-p02", title: "الطريقة الأولى: MAC ثابت", order: 2, source: { kind: "book", sourceId: "791381s", pdfPageStart: 71 } },
            { id: "791381s-m23-l01-p03", title: "الطريقة الثانية: Sticky MAC", order: 3, source: { kind: "book", sourceId: "791381s", pdfPageStart: 71, pdfPageEnd: 72 } },
            { id: "791381s-m23-l01-p04", title: "تحديد عدد الأجهزة", order: 4, source: { kind: "book", sourceId: "791381s", pdfPageStart: 72 } },
          ],
        },
      ],
    },
    {
      id: "791381s-m24",
      title: "حماية أجهزة Cisco بكلمات المرور",
      order: 24,
      lessons: [
        {
          id: "791381s-m24-l00",
          title: "افتتاحية الوحدة",
          order: 0,
          pages: [
            { id: "791381s-m24-l00-p01", title: "حماية أجهزة Cisco بكلمات المرور", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 73 } },
          ],
        },
        {
          id: "791381s-m24-l01",
          title: "حماية أجهزة Cisco بكلمات المرور",
          order: 1,
          pages: [
            { id: "791381s-m24-l01-p01", title: "لماذا نحمي السويتشات والراوترات؟", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 73 } },
            { id: "791381s-m24-l01-p02", title: "طرق الدخول إلى أجهزة Cisco", order: 2, source: { kind: "book", sourceId: "791381s", pdfPageStart: 73 } },
            { id: "791381s-m24-l01-p03", title: "كلمة مرور Console", order: 3, source: { kind: "book", sourceId: "791381s", pdfPageStart: 74 } },
            { id: "791381s-m24-l01-p04", title: "كلمة مرور VTY (الدخول عن بُعد)", order: 4, source: { kind: "book", sourceId: "791381s", pdfPageStart: 74 } },
            { id: "791381s-m24-l01-p05", title: "تشفير كلمات المرور", order: 5, source: { kind: "book", sourceId: "791381s", pdfPageStart: 75 } },
            { id: "791381s-m24-l01-p06", title: "عرض الإعدادات وحفظها", order: 6, source: { kind: "book", sourceId: "791381s", pdfPageStart: 75, pdfPageEnd: 76 } },
          ],
        },
      ],
    },
    {
      id: "791381s-m25",
      title: "مرجع أوامر Cisco",
      order: 25,
      lessons: [
        {
          id: "791381s-m25-l00",
          title: "افتتاحية الوحدة",
          order: 0,
          pages: [
            { id: "791381s-m25-l00-p01", title: "مرجع أوامر Cisco", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 76 } },
          ],
        },
        {
          id: "791381s-m25-l01",
          title: "مرجع أوامر Cisco",
          order: 1,
          pages: [
            { id: "791381s-m25-l01-p01", title: "أوامر أساسية للجهاز", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 76, pdfPageEnd: 77 } },
            { id: "791381s-m25-l01-p02", title: "جدول الأوامر حسب الموضوع", order: 2, source: { kind: "book", sourceId: "791381s", pdfPageStart: 77, pdfPageEnd: 78 } },
            { id: "791381s-m25-l01-p03", title: "أوامر الفحص المهمة (show)", order: 3, source: { kind: "book", sourceId: "791381s", pdfPageStart: 78 } },
            { id: "791381s-m25-l01-p04", title: "لمحة عن الوحدة القادمة: OSPF و EIGRP و ACL", order: 4, source: { kind: "book", sourceId: "791381s", pdfPageStart: 79 } },
          ],
        },
      ],
    },
    {
      id: "791381s-m26",
      title: "الشبكة الواسعة WAN",
      order: 26,
      lessons: [
        {
          id: "791381s-m26-l00",
          title: "افتتاحية الوحدة",
          order: 0,
          pages: [
            { id: "791381s-m26-l00-p01", title: "الشبكة الواسعة WAN", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 80 } },
          ],
        },
        {
          id: "791381s-m26-l01",
          title: "الشبكة الواسعة WAN",
          order: 1,
          pages: [
            { id: "791381s-m26-l01-p01", title: "ما هي WAN؟", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 80 } },
            { id: "791381s-m26-l01-p02", title: "تقنيات WAN القديمة", order: 2, source: { kind: "book", sourceId: "791381s", pdfPageStart: 81 } },
            { id: "791381s-m26-l01-p03", title: "تقنيات WAN الأحدث", order: 3, source: { kind: "book", sourceId: "791381s", pdfPageStart: 81 } },
          ],
        },
      ],
    },
    {
      id: "791381s-m27",
      title: "مفاهيم التوجيه Routing",
      order: 27,
      lessons: [
        {
          id: "791381s-m27-l00",
          title: "افتتاحية الوحدة",
          order: 0,
          pages: [
            { id: "791381s-m27-l00-p01", title: "مفاهيم التوجيه Routing", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 82 } },
          ],
        },
        {
          id: "791381s-m27-l01",
          title: "مفاهيم التوجيه Routing",
          order: 1,
          pages: [
            { id: "791381s-m27-l01-p01", title: "ما هو التوجيه؟", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 82 } },
            { id: "791381s-m27-l01-p02", title: "ثلاث طرق للتوجيه", order: 2, source: { kind: "book", sourceId: "791381s", pdfPageStart: 82 } },
            { id: "791381s-m27-l01-p03", title: "التوجيه الثابت Static Route", order: 3, source: { kind: "book", sourceId: "791381s", pdfPageStart: 82, pdfPageEnd: 83 } },
            { id: "791381s-m27-l01-p04", title: "Distance Vector و Link-State", order: 4, source: { kind: "book", sourceId: "791381s", pdfPageStart: 83 } },
            { id: "791381s-m27-l01-p05", title: "المقياس Metric", order: 5, source: { kind: "book", sourceId: "791381s", pdfPageStart: 83, pdfPageEnd: 84 } },
            { id: "791381s-m27-l01-p06", title: "المسافة الإدارية AD", order: 6, source: { kind: "book", sourceId: "791381s", pdfPageStart: 84 } },
          ],
        },
      ],
    },
    {
      id: "791381s-m28",
      title: "بروتوكول OSPF",
      order: 28,
      lessons: [
        {
          id: "791381s-m28-l00",
          title: "افتتاحية الوحدة",
          order: 0,
          pages: [
            { id: "791381s-m28-l00-p01", title: "بروتوكول OSPF", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 84 } },
          ],
        },
        {
          id: "791381s-m28-l01",
          title: "بروتوكول OSPF",
          order: 1,
          pages: [
            { id: "791381s-m28-l01-p01", title: "ما هو OSPF؟", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 84, pdfPageEnd: 85 } },
            { id: "791381s-m28-l01-p02", title: "مثال: شبكتان متصلتان عبر راوترين", order: 2, source: { kind: "book", sourceId: "791381s", pdfPageStart: 85 } },
            { id: "791381s-m28-l01-p03", title: "أوامر R1", order: 3, source: { kind: "book", sourceId: "791381s", pdfPageStart: 85, pdfPageEnd: 86 } },
            { id: "791381s-m28-l01-p04", title: "أوامر R2", order: 4, source: { kind: "book", sourceId: "791381s", pdfPageStart: 86 } },
          ],
        },
      ],
    },
    {
      id: "791381s-m29",
      title: "بروتوكول EIGRP وجدول التوجيه",
      order: 29,
      lessons: [
        {
          id: "791381s-m29-l00",
          title: "افتتاحية الوحدة",
          order: 0,
          pages: [
            { id: "791381s-m29-l00-p01", title: "بروتوكول EIGRP وجدول التوجيه", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 87 } },
          ],
        },
        {
          id: "791381s-m29-l01",
          title: "بروتوكول EIGRP وجدول التوجيه",
          order: 1,
          pages: [
            { id: "791381s-m29-l01-p01", title: "ما هو EIGRP؟", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 87 } },
            { id: "791381s-m29-l01-p02", title: "مثال EIGRP", order: 2, source: { kind: "book", sourceId: "791381s", pdfPageStart: 87, pdfPageEnd: 88 } },
            { id: "791381s-m29-l01-p03", title: "أوامر R1 و R2", order: 3, source: { kind: "book", sourceId: "791381s", pdfPageStart: 88 } },
            { id: "791381s-m29-l01-p04", title: "مقارنة أوامر OSPF و EIGRP", order: 4, source: { kind: "book", sourceId: "791381s", pdfPageStart: 89 } },
            { id: "791381s-m29-l01-p05", title: "جدول التوجيه show ip route", order: 5, source: { kind: "book", sourceId: "791381s", pdfPageStart: 89, pdfPageEnd: 90 } },
          ],
        },
      ],
    },
    {
      id: "791381s-m30",
      title: "قوائم التحكم بالوصول ACL",
      order: 30,
      lessons: [
        {
          id: "791381s-m30-l00",
          title: "افتتاحية الوحدة",
          order: 0,
          pages: [
            { id: "791381s-m30-l00-p01", title: "قوائم التحكم بالوصول ACL", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 90 } },
          ],
        },
        {
          id: "791381s-m30-l01",
          title: "قوائم التحكم بالوصول ACL",
          order: 1,
          pages: [
            { id: "791381s-m30-l01-p01", title: "ما هي ACL؟", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 90 } },
            { id: "791381s-m30-l01-p02", title: "نوعا ACL", order: 2, source: { kind: "book", sourceId: "791381s", pdfPageStart: 90, pdfPageEnd: 91 } },
            { id: "791381s-m30-l01-p03", title: "Standard ACL خطوة خطوة", order: 3, source: { kind: "book", sourceId: "791381s", pdfPageStart: 91 } },
            { id: "791381s-m30-l01-p04", title: "أمثلة Standard ACL", order: 4, source: { kind: "book", sourceId: "791381s", pdfPageStart: 91, pdfPageEnd: 92 } },
            { id: "791381s-m30-l01-p05", title: "Extended ACL", order: 5, source: { kind: "book", sourceId: "791381s", pdfPageStart: 92, pdfPageEnd: 93 } },
          ],
        },
      ],
    },
    {
      id: "791381s-m31",
      title: "الأساسيات",
      order: 31,
      lessons: [
        {
          id: "791381s-m31-l00",
          title: "افتتاحية الوحدة",
          order: 0,
          pages: [
            { id: "791381s-m31-l00-p01", title: "الأساسيات", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 93 } },
          ],
        },
        {
          id: "791381s-m31-l01",
          title: "الأساسيات",
          order: 1,
          pages: [
            { id: "791381s-m31-l01-p01", title: "المفاهيم الأولى: IP و MAC", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 93 } },
            { id: "791381s-m31-l01-p02", title: "فئات عناوين IPv4", order: 2, source: { kind: "book", sourceId: "791381s", pdfPageStart: 94 } },
            { id: "791381s-m31-l01-p03", title: "أنظمة العدّ والتحويل", order: 3, source: { kind: "book", sourceId: "791381s", pdfPageStart: 94 } },
            { id: "791381s-m31-l01-p04", title: "أجهزة الشبكة", order: 4, source: { kind: "book", sourceId: "791381s", pdfPageStart: 94, pdfPageEnd: 95 } },
            { id: "791381s-m31-l01-p05", title: "الكوابل ووسائط الاتصال", order: 5, source: { kind: "book", sourceId: "791381s", pdfPageStart: 95 } },
            { id: "791381s-m31-l01-p06", title: "أنواع الشبكات حسب النطاق", order: 6, source: { kind: "book", sourceId: "791381s", pdfPageStart: 95, pdfPageEnd: 96 } },
          ],
        },
      ],
    },
    {
      id: "791381s-m32",
      title: "النماذج والبروتوكولات",
      order: 32,
      lessons: [
        {
          id: "791381s-m32-l00",
          title: "افتتاحية الوحدة",
          order: 0,
          pages: [
            { id: "791381s-m32-l00-p01", title: "النماذج والبروتوكولات", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 96 } },
          ],
        },
        {
          id: "791381s-m32-l01",
          title: "النماذج والبروتوكولات",
          order: 1,
          pages: [
            { id: "791381s-m32-l01-p01", title: "نموذج OSI — الطبقات السبع", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 96 } },
            { id: "791381s-m32-l01-p02", title: "البروتوكولات والمنافذ المهمّة", order: 2, source: { kind: "book", sourceId: "791381s", pdfPageStart: 97 } },
            { id: "791381s-m32-l01-p03", title: "الفروق بين TCP و UDP", order: 3, source: { kind: "book", sourceId: "791381s", pdfPageStart: 97, pdfPageEnd: 98 } },
            { id: "791381s-m32-l01-p04", title: "وحدات البيانات والتغليف", order: 4, source: { kind: "book", sourceId: "791381s", pdfPageStart: 98 } },
          ],
        },
      ],
    },
    {
      id: "791381s-m33",
      title: "العنونة والتجزئة",
      order: 33,
      lessons: [
        {
          id: "791381s-m33-l00",
          title: "افتتاحية الوحدة",
          order: 0,
          pages: [
            { id: "791381s-m33-l00-p01", title: "العنونة والتجزئة", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 98 } },
          ],
        },
        {
          id: "791381s-m33-l01",
          title: "العنونة والتجزئة",
          order: 1,
          pages: [
            { id: "791381s-m33-l01-p01", title: "العناوين الخاصة وأنواع الرسائل", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 98, pdfPageEnd: 99 } },
            { id: "791381s-m33-l01-p02", title: "التجزئة Subnetting — أمثلة محلولة", order: 2, source: { kind: "book", sourceId: "791381s", pdfPageStart: 99 } },
            { id: "791381s-m33-l01-p03", title: "قناع البدل Wildcard Mask", order: 3, source: { kind: "book", sourceId: "791381s", pdfPageStart: 99, pdfPageEnd: 100 } },
            { id: "791381s-m33-l01-p04", title: "العنوان IPv6 — البنية والتصغير", order: 4, source: { kind: "book", sourceId: "791381s", pdfPageStart: 100, pdfPageEnd: 101 } },
          ],
        },
      ],
    },
    {
      id: "791381s-m34",
      title: "التبديل و VLANs",
      order: 34,
      lessons: [
        {
          id: "791381s-m34-l00",
          title: "افتتاحية الوحدة",
          order: 0,
          pages: [
            { id: "791381s-m34-l00-p01", title: "التبديل و VLANs", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 101 } },
          ],
        },
        {
          id: "791381s-m34-l01",
          title: "التبديل و VLANs",
          order: 1,
          pages: [
            { id: "791381s-m34-l01-p01", title: "مفهوم VLANs و VTP", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 101 } },
            { id: "791381s-m34-l01-p02", title: "أوامر VLAN و Trunk", order: 2, source: { kind: "book", sourceId: "791381s", pdfPageStart: 102 } },
            { id: "791381s-m34-l01-p03", title: "أوضاع وأوامر VTP", order: 3, source: { kind: "book", sourceId: "791381s", pdfPageStart: 103 } },
            { id: "791381s-m34-l01-p04", title: "التوجيه بين VLANs — Dot1Q", order: 4, source: { kind: "book", sourceId: "791381s", pdfPageStart: 103, pdfPageEnd: 104 } },
            { id: "791381s-m34-l01-p05", title: "بروتوكول STP وسلوك السويتش", order: 5, source: { kind: "book", sourceId: "791381s", pdfPageStart: 104 } },
            { id: "791381s-m34-l01-p06", title: "Metro-Ethernet و VLAN", order: 6, source: { kind: "book", sourceId: "791381s", pdfPageStart: 104 } },
          ],
        },
      ],
    },
    {
      id: "791381s-m35",
      title: "التوجيه والأمان",
      order: 35,
      lessons: [
        {
          id: "791381s-m35-l00",
          title: "افتتاحية الوحدة",
          order: 0,
          pages: [
            { id: "791381s-m35-l00-p01", title: "التوجيه والأمان", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 105 } },
          ],
        },
        {
          id: "791381s-m35-l01",
          title: "التوجيه والأمان",
          order: 1,
          pages: [
            { id: "791381s-m35-l01-p01", title: "أنواع المسارات", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 105 } },
            { id: "791381s-m35-l01-p02", title: "المسافة الإدارية AD", order: 2, source: { kind: "book", sourceId: "791381s", pdfPageStart: 105 } },
            { id: "791381s-m35-l01-p03", title: "بروتوكولات التوجيه — مقارنة", order: 3, source: { kind: "book", sourceId: "791381s", pdfPageStart: 106 } },
            { id: "791381s-m35-l01-p04", title: "الهجمات الشائعة", order: 4, source: { kind: "book", sourceId: "791381s", pdfPageStart: 106, pdfPageEnd: 107 } },
            { id: "791381s-m35-l01-p05", title: "تأمين المنافذ Port Security", order: 5, source: { kind: "book", sourceId: "791381s", pdfPageStart: 107 } },
            { id: "791381s-m35-l01-p06", title: "تأمين الوصول بكلمات المرور و SSH", order: 6, source: { kind: "book", sourceId: "791381s", pdfPageStart: 108 } },
            { id: "791381s-m35-l01-p07", title: "قوائم التحكم بالوصول ACL", order: 7, source: { kind: "book", sourceId: "791381s", pdfPageStart: 108, pdfPageEnd: 109 } },
          ],
        },
      ],
    },
    {
      id: "791381s-m36",
      title: "الخدمات والأوامر",
      order: 36,
      lessons: [
        {
          id: "791381s-m36-l00",
          title: "افتتاحية الوحدة",
          order: 0,
          pages: [
            { id: "791381s-m36-l00-p01", title: "الخدمات والأوامر", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 109 } },
          ],
        },
        {
          id: "791381s-m36-l01",
          title: "الخدمات والأوامر",
          order: 1,
          pages: [
            { id: "791381s-m36-l01-p01", title: "NAT و PAT و APIPA", order: 1, source: { kind: "book", sourceId: "791381s", pdfPageStart: 109, pdfPageEnd: 110 } },
            { id: "791381s-m36-l01-p02", title: "بروتوكول DHCP — مراحل DORA", order: 2, source: { kind: "book", sourceId: "791381s", pdfPageStart: 110, pdfPageEnd: 111 } },
            { id: "791381s-m36-l01-p03", title: "مصافحة TCP الثلاثية", order: 3, source: { kind: "book", sourceId: "791381s", pdfPageStart: 111 } },
            { id: "791381s-m36-l01-p04", title: "سيناريو تكاملي: فتح موقع", order: 4, source: { kind: "book", sourceId: "791381s", pdfPageStart: 111, pdfPageEnd: 112 } },
            { id: "791381s-m36-l01-p05", title: "أوامر CMD و Show", order: 5, source: { kind: "book", sourceId: "791381s", pdfPageStart: 112 } },
          ],
        },
      ],
    },
  ],
  // The booklet's own groups (its cover and table of contents): the introduction, the six «دفعات» and «الملخص الشامل».
  batches: [
    { id: "intro", label: "المقدمة", moduleIds: ["791381s-m00"] },
    { id: "b1", label: "الأساسيات والأعداد وعناوين IP", moduleIds: ["791381s-m01", "791381s-m02", "791381s-m03", "791381s-m04"] },
    { id: "b2", label: "الأجهزة والرسائل", moduleIds: ["791381s-m05", "791381s-m06", "791381s-m07", "791381s-m08"] },
    { id: "b3", label: "النماذج والبروتوكولات والأمان", moduleIds: ["791381s-m09", "791381s-m10", "791381s-m11", "791381s-m12", "791381s-m13", "791381s-m14"] },
    { id: "b4", label: "برمجة السويتش و VLAN", moduleIds: ["791381s-m15", "791381s-m16", "791381s-m17", "791381s-m18", "791381s-m19"] },
    { id: "b5", label: "Wi-Fi و IPv6 و DHCP والأمان", moduleIds: ["791381s-m20", "791381s-m21", "791381s-m22", "791381s-m23", "791381s-m24", "791381s-m25"] },
    { id: "b6", label: "WAN والتوجيه و ACL", moduleIds: ["791381s-m26", "791381s-m27", "791381s-m28", "791381s-m29", "791381s-m30"] },
    { id: "summary", label: "الملخص الشامل", moduleIds: ["791381s-m31", "791381s-m32", "791381s-m33", "791381s-m34", "791381s-m35", "791381s-m36"] },
  ],
};

export default manifest;
