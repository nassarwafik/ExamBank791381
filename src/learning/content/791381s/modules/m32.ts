// Learning Materials — «أوراق تلخيص للمراجعة» (791381s), section 32 «النماذج والبروتوكولات».
//
// Verbatim conversion of booklet PDF pages 96–98 (the section header box → an opener page; each numbered sub-topic → one
// reader page). Every converted block is origin:"book": nothing is added, removed or reworded; bold runs are `strong`,
// monospace runs are `code`, printed box labels are the callout titles.
//
// Enrichment (docs/enterprise-791381s-enrichment-plan.md, Phase 7): teacher-enrichment blocks (visuals and activities
// reused from course 791381 after checking their labels against this section, interactive practice-table twins of the
// review tables, and the end-of-unit «تدريبات الوحدة» lesson) are ADDED after the book blocks they explain. The book
// blocks stay verbatim — pinned by the book lock (bookLock.test.ts).

import type { ContentModule, ContentSource, PracticeTableSelectCell } from "../../types";

const CID = "791381s";
const src = (pdf: number, end?: number): ContentSource =>
  end ? { kind: "book", sourceId: CID, pdfPageStart: pdf, pdfPageEnd: end } : { kind: "book", sourceId: CID, pdfPageStart: pdf };
/** A dropdown cell of a practice-table twin: `options` = the values the column takes (not in row order), `key` = the booklet's cell. */
const sel = (options: string[]) => (key: string): PracticeTableSelectCell => ({ kind: "select", options, key });
const OSI = sel(["Application · التطبيقات", "Data Link · الربط", "Network · التوجيه", "Physical · الإشارات", "Presentation · العرض", "Session · الجلسات", "Transport · النقل"]);
const PORT = sel(["20 , 21", "22", "23", "25", "53", "67 , 68", "69", "80", "110", "143", "443"]);
const UDP = sel(["سريع جدًا", "بدون اتصال", "البث، الألعاب، VoIP", "قد تضيع البيانات", "لا يرسل تأكيدًا"]);
const PDU = sel(["Bit", "Data", "Frame", "Packet", "Segment"]);

const m32: ContentModule = {
  id: "791381s-m32",
  title: "النماذج والبروتوكولات",
  order: 32,
  lessons: [
    {
      id: "791381s-m32-l00",
      title: "افتتاحية الوحدة",
      order: 0,
      pages: [
        {
          id: "791381s-m32-l00-p01",
          title: "النماذج والبروتوكولات",
          order: 1,
          layout: "opener",
          source: src(96),
          blocks: [
            {
              id: "m32-l00-p01-opener", type: "unit-opener", origin: "book",
              unitLabel: "الملخص الشامل ② · كتاب ص 237–240", unitNumber: "32", title: "النماذج والبروتوكولات",
              subtitle: "نموذج OSI · المنافذ المهمّة · TCP وUDP · وحدات البيانات والتغليف",
            },
          ],
        },
      ],
    },
    {
      id: "791381s-m32-l01",
      title: "النماذج والبروتوكولات",
      order: 1,
      pages: [
        {
          id: "791381s-m32-l01-p01",
          title: "نموذج OSI — الطبقات السبع",
          order: 1,
          source: src(96),
          blocks: [
            {
              id: "m32-l01-p01-table", type: "table", origin: "book",
              headers: ["#", "الطبقة", "أمثلة"],
              rows: [
                ["7", "Application · التطبيقات", "HTTP · DNS"],
                ["6", "Presentation · العرض", "SSL · JPEG"],
                ["5", "Session · الجلسات", "RPC"],
                ["4", "Transport · النقل", "TCP · UDP"],
                ["3", "Network · التوجيه", "IP · ICMP"],
                ["2", "Data Link · الربط", "MAC"],
                ["1", "Physical · الإشارات", "Cables"],
              ],
            },
            { id: "m32-l01-p01-memo-h", type: "heading", origin: "book", level: 4, text: "للحفظ (7 إلى 1)" },
            {
              id: "m32-l01-p01-memo1", type: "text", origin: "book",
              spans: [
                { text: "احفظ الجملة: " },
                { text: "All People Seem To Need Data Processing", style: "strong" },
                { text: "." },
              ],
            },
            {
              id: "m32-l01-p01-memo2", type: "text", origin: "book",
              spans: [{ text: "كل كلمة تبدأ بحرف طبقة: نبدأ من الأعلى (الطبقة 7) إلى الأسفل (الطبقة 1)، وهذا اتجاه الإرسال." }],
            },
            {
              // ENRICHMENT — interactive-diagram / osi-layers / v1 (as in 791381s m09): the table's seven layers with its own
              // Arabic names and examples, and the «للحفظ» direction (7 → 1 when sending; the reverse when receiving, p04).
              id: "m32-l01-p01-osi-explorer", type: "interactive-diagram", origin: "teacher-enrichment",
              interactionType: "osi-layers", version: 1,
              title: "استكشف طبقات OSI السبع",
              description: "اضغط على أي طبقة لترى أمثلتها كما في الجدول، وبدّل بين «إرسال» و«استقبال» لترى اتجاه المرور في الطبقات.",
              source: src(96),
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "طبقات OSI من 7 إلى 1: 7 Application · التطبيقات (HTTP · DNS) · 6 Presentation · العرض (SSL · JPEG) · 5 Session · الجلسات (RPC) · 4 Transport · النقل (TCP · UDP) · 3 Network · التوجيه (IP · ICMP) · 2 Data Link · الربط (MAC) · 1 Physical · الإشارات (Cables). نبدأ من الأعلى (الطبقة 7) إلى الأسفل (الطبقة 1)، وهذا اتجاه الإرسال، وعند الاستقبال بالعكس." },
              config: {
                layers: [
                  { number: 7, name: "Application", arabic: "التطبيقات", token: "HTTP", role: "أمثلة: HTTP · DNS." },
                  { number: 6, name: "Presentation", arabic: "العرض", token: "SSL", role: "أمثلة: SSL · JPEG." },
                  { number: 5, name: "Session", arabic: "الجلسات", token: "RPC", role: "مثال: RPC." },
                  { number: 4, name: "Transport", arabic: "النقل", token: "TCP/UDP", role: "أمثلة: TCP · UDP." },
                  { number: 3, name: "Network", arabic: "التوجيه", token: "IP", role: "أمثلة: IP · ICMP." },
                  { number: 2, name: "Data Link", arabic: "الربط", token: "MAC", role: "مثال: MAC." },
                  { number: 1, name: "Physical", arabic: "الإشارات", token: "Cables", role: "مثال: Cables." },
                ],
                sendLabel: "إرسال", receiveLabel: "استقبال",
                sendNote: "نبدأ من الأعلى (الطبقة 7) إلى الأسفل (الطبقة 1)، وهذا اتجاه الإرسال.",
                receiveNote: "وعند الاستقبال بالعكس: من الطبقة 1 إلى الطبقة 7.",
              },
            },
          ],
        },
        {
          id: "791381s-m32-l01-p02",
          title: "البروتوكولات والمنافذ المهمّة",
          order: 2,
          source: src(97),
          blocks: [
            {
              id: "m32-l01-p02-table", type: "table", origin: "book",
              headers: ["البروتوكول", "Port", "الوظيفة"],
              rows: [
                ["HTTP", "80", "تصفّح عادي"],
                ["HTTPS", "443", "تصفّح آمن"],
                ["FTP", "20 , 21", "نقل ملفات"],
                ["TFTP", "69", "نقل ملفات بسيط"],
                ["DNS", "53", "ترجمة الأسماء إلى IP"],
                ["DHCP", "67 , 68", "توزيع IP تلقائي"],
                ["SMTP", "25", "إرسال بريد"],
                ["POP3", "110", "استقبال بريد"],
                ["IMAP", "143", "إدارة البريد"],
                ["SSH", "22", "دخول آمن عن بُعد"],
                ["TELNET", "23", "دخول غير آمن"],
              ],
              columnDirs: ["rtl", "ltr", "rtl"],
            },
            {
              id: "m32-l01-p02-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [
                { text: "ARP", style: "strong" },
                { text: " يربط IP بـ MAC، و" },
                { text: "ICMP", style: "strong" },
                { text: " للفحص (ping)، وكلاهما في الطبقات الدنيا." },
              ],
            },
          ],
        },
        {
          id: "791381s-m32-l01-p03",
          title: "الفروق بين TCP و UDP",
          order: 3,
          source: src(97, 98),
          blocks: [
            {
              id: "m32-l01-p03-table", type: "table", origin: "book",
              headers: ["الميزة", "TCP", "UDP"],
              rows: [
                ["نوع الاتصال", "يتصل أولًا (Connection-Oriented)", "بدون اتصال"],
                ["التأكيد", "يرسل تأكيد استلام ACK", "لا يرسل تأكيدًا"],
                ["الموثوقية", "موثوق — يضمن الوصول", "قد تضيع البيانات"],
                ["السرعة", "بطيء نسبيًا", "سريع جدًا"],
                ["الاستخدام", "الملفات، الويب، البريد", "البث، الألعاب، VoIP"],
              ],
            },
            {
              id: "m32-l01-p03-transport", type: "table", origin: "book",
              headers: ["تعمل عبر TCP", "تعمل عبر UDP", "تعمل عبر الاثنين"],
              rows: [["HTTP / HTTPS · FTP · SMTP · SSH", "TFTP · DHCP · RIP · SNMP", "DNS"]],
            },
          ],
        },
        {
          id: "791381s-m32-l01-p04",
          title: "وحدات البيانات والتغليف",
          order: 4,
          source: src(98),
          blocks: [
            {
              id: "m32-l01-p04-table", type: "table", origin: "book",
              headers: ["الطبقة", "الوحدة", "تحتوي"],
              rows: [
                ["Application", "Data", "البيانات النهائية"],
                ["Transport", "Segment", "المنفذ Port"],
                ["Network", "Packet", "عنوان IP"],
                ["Data Link", "Frame", "عنوان MAC"],
                ["Physical", "Bit", "إشارات 0 و 1"],
              ],
            },
            {
              id: "m32-l01-p04-send", type: "text", origin: "book",
              spans: [
                { text: "عند الإرسال: ", style: "strong" },
                { text: "Data → Segment → Packet → Frame → Bits", style: "code" },
              ],
            },
            {
              id: "m32-l01-p04-receive", type: "text", origin: "book",
              spans: [{ text: "وعند الاستقبال بالعكس", style: "strong" }],
            },
            {
              // ENRICHMENT — visual reused from course 791381 (m18 encapsulation-stack, also used in 791381s): the «عند
              // الإرسال» line as nesting — Segment (Port) around Data, Packet (IP) around it, Frame (MAC) around that.
              id: "m32-l01-p04-v-encapsulation", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m18/encapsulation-stack", motion: true,
              source: src(98),
              title: "رسم توضيحي: التغليف عند الإرسال",
              alt: "مستطيل Data في الوسط، يحيط به غلاف Segment (النقل، منافذ)، ثم غلاف Packet (الشبكة، IP) حول Segment، ثم غلاف Frame (ربط البيانات، MAC) حول Packet؛ وتحته السطر Data ← Segment ← Packet ← Frame.",
              caption: "عند الإرسال: Data → Segment → Packet → Frame → Bits. الـ Segment فيه المنفذ Port، والـ Packet فيه عنوان IP، والـ Frame فيه عنوان MAC؛ وعند الاستقبال بالعكس.",
            },
          ],
        },
      ],
    },
    {
      id: "791381s-m32-l02",
      title: "تدريبات الوحدة",
      order: 2,
      pages: [
        {
          id: "791381s-m32-l02-p01",
          title: "تدريبات الوحدة: النماذج والبروتوكولات",
          order: 1,
          layout: "practice",
          source: src(96, 98),
          blocks: [
            {
              id: "m32-l02-p01-t01", type: "practice-table", origin: "teacher-enrichment",
              caption: "املأ العمود «الطبقة»: اختر الطبقة من رقمها وأمثلتها",
              headers: ["#", "الطبقة", "أمثلة"],
              rows: [
                ["7", OSI("Application · التطبيقات"), "HTTP · DNS"],
                ["6", OSI("Presentation · العرض"), "SSL · JPEG"],
                ["5", OSI("Session · الجلسات"), "RPC"],
                ["4", OSI("Transport · النقل"), "TCP · UDP"],
                ["3", OSI("Network · التوجيه"), "IP · ICMP"],
                ["2", OSI("Data Link · الربط"), "MAC"],
                ["1", OSI("Physical · الإشارات"), "Cables"],
              ],
            },
            {
              id: "m32-l02-p01-t02", type: "practice-table", origin: "teacher-enrichment",
              caption: "املأ العمود «Port»: اختر رقم المنفذ لكل بروتوكول",
              headers: ["البروتوكول", "Port", "الوظيفة"],
              rows: [
                ["HTTP", PORT("80"), "تصفّح عادي"],
                ["HTTPS", PORT("443"), "تصفّح آمن"],
                ["FTP", PORT("20 , 21"), "نقل ملفات"],
                ["TFTP", PORT("69"), "نقل ملفات بسيط"],
                ["DNS", PORT("53"), "ترجمة الأسماء إلى IP"],
                ["DHCP", PORT("67 , 68"), "توزيع IP تلقائي"],
                ["SMTP", PORT("25"), "إرسال بريد"],
                ["POP3", PORT("110"), "استقبال بريد"],
                ["IMAP", PORT("143"), "إدارة البريد"],
                ["SSH", PORT("22"), "دخول آمن عن بُعد"],
                ["TELNET", PORT("23"), "دخول غير آمن"],
              ],
              columnDirs: ["rtl", "ltr", "rtl"],
            },
            {
              id: "m32-l02-p01-t03", type: "practice-table", origin: "teacher-enrichment",
              caption: "املأ العمود «UDP»: ما الذي يقابل صفة TCP في كل سطر؟",
              headers: ["الميزة", "TCP", "UDP"],
              rows: [
                ["نوع الاتصال", "يتصل أولًا (Connection-Oriented)", UDP("بدون اتصال")],
                ["التأكيد", "يرسل تأكيد استلام ACK", UDP("لا يرسل تأكيدًا")],
                ["الموثوقية", "موثوق — يضمن الوصول", UDP("قد تضيع البيانات")],
                ["السرعة", "بطيء نسبيًا", UDP("سريع جدًا")],
                ["الاستخدام", "الملفات، الويب، البريد", UDP("البث، الألعاب، VoIP")],
              ],
            },
            {
              id: "m32-l02-p01-t04", type: "practice-table", origin: "teacher-enrichment",
              caption: "املأ العمود «الوحدة»: ما وحدة البيانات في كل طبقة؟",
              headers: ["الطبقة", "الوحدة", "تحتوي"],
              rows: [
                ["Application", PDU("Data"), "البيانات النهائية"],
                ["Transport", PDU("Segment"), "المنفذ Port"],
                ["Network", PDU("Packet"), "عنوان IP"],
                ["Data Link", PDU("Frame"), "عنوان MAC"],
                ["Physical", PDU("Bit"), "إشارات 0 و 1"],
              ],
            },
            {
              id: "m32-l02-p01-q01", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "ما الطبقة رقم 4 في نموذج OSI؟",
                options: [{ id: "a", text: "Network · التوجيه" }, { id: "b", text: "Transport · النقل", correct: true }, { id: "c", text: "Session · الجلسات" }, { id: "d", text: "Data Link · الربط" }],
                feedback: { explanation: "الطبقة 4 هي Transport · النقل، وأمثلتها TCP · UDP. أما 5 فهي Session، و3 Network، و2 Data Link." },
              },
            },
            {
              id: "m32-l02-p01-q02", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "ordering", prompt: "رتّب طبقات OSI من الأعلى (الطبقة 7) إلى الأسفل (الطبقة 1)، وهو اتجاه الإرسال:",
                items: [
                  { id: "t", text: "Transport · النقل" },
                  { id: "a", text: "Application · التطبيقات" },
                  { id: "ph", text: "Physical · الإشارات" },
                  { id: "n", text: "Network · التوجيه" },
                  { id: "s", text: "Session · الجلسات" },
                  { id: "d", text: "Data Link · الربط" },
                  { id: "pr", text: "Presentation · العرض" },
                ],
                order: ["a", "pr", "s", "t", "n", "d", "ph"],
                feedback: { explanation: "احفظ الجملة All People Seem To Need Data Processing: كل كلمة تبدأ بحرف طبقة من 7 إلى 1 — Application ثم Presentation ثم Session ثم Transport ثم Network ثم Data Link ثم Physical." },
              },
            },
            {
              id: "m32-l02-p01-q03", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "wordBank", prompt: "أكمل أرقام المنافذ من مخزن الكلمات:",
                segments: ["HTTP للتصفّح العادي على المنفذ ", { blank: "b1" }, "، وHTTPS للتصفّح الآمن على المنفذ ", { blank: "b2" }, "، وDNS لترجمة الأسماء إلى IP على المنفذ ", { blank: "b3" }, "."],
                bank: ["80", "443", "53", "22", "25"],
                answers: { b1: "80", b2: "443", b3: "53" },
                feedback: { explanation: "في جدول المنافذ: HTTP · 80 · تصفّح عادي، HTTPS · 443 · تصفّح آمن، DNS · 53 · ترجمة الأسماء إلى IP." },
              },
            },
            {
              id: "m32-l02-p01-q04", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "ما رقم المنفذ الذي يستعمله SSH؟",
                options: [{ id: "a", text: "23" }, { id: "b", text: "21" }, { id: "c", text: "22", correct: true }, { id: "d", text: "443" }],
                feedback: { explanation: "SSH · 22 · دخول آمن عن بُعد، أما TELNET · 23 فدخول غير آمن." },
              },
            },
            {
              id: "m32-l02-p01-q05", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "TELNET على المنفذ 23 هو الدخول الآمن عن بُعد.", answer: false, feedback: { explanation: "TELNET · 23 · دخول غير آمن، والدخول الآمن عن بُعد هو SSH على المنفذ 22." } },
            },
            {
              id: "m32-l02-p01-q06", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "matching", prompt: "صِل كل بروتوكول بريد بوظيفته:",
                left: [{ id: "smtp", text: "SMTP · 25" }, { id: "pop3", text: "POP3 · 110" }, { id: "imap", text: "IMAP · 143" }],
                right: [{ id: "r1", text: "استقبال بريد" }, { id: "r2", text: "إدارة البريد" }, { id: "r3", text: "إرسال بريد" }],
                pairs: { smtp: "r3", pop3: "r1", imap: "r2" },
                feedback: { explanation: "SMTP · 25 · إرسال بريد، POP3 · 110 · استقبال بريد، IMAP · 143 · إدارة البريد." },
              },
            },
            {
              id: "m32-l02-p01-q07", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "أي بروتوكول يربط IP بـ MAC؟",
                options: [{ id: "a", text: "ARP", correct: true }, { id: "b", text: "ICMP" }, { id: "c", text: "DNS" }, { id: "d", text: "DHCP" }],
                feedback: { explanation: "تذكّر: ARP يربط IP بـ MAC، وICMP للفحص (ping)، وكلاهما في الطبقات الدنيا." },
              },
            },
            {
              id: "m32-l02-p01-q08", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "UDP يرسل تأكيد استلام ACK.", answer: false, feedback: { explanation: "TCP يرسل تأكيد استلام ACK، أما UDP فلا يرسل تأكيدًا، ولذلك قد تضيع البيانات لكنه سريع جدًا." } },
            },
            {
              id: "m32-l02-p01-q09", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "classify", prompt: "صنّف كل بروتوكول حسب بروتوكول النقل الذي يعمل عبره:",
                groups: [{ id: "tcp", text: "تعمل عبر TCP" }, { id: "udp", text: "تعمل عبر UDP" }, { id: "both", text: "تعمل عبر الاثنين" }],
                items: [
                  { id: "i1", text: "HTTP / HTTPS" },
                  { id: "i2", text: "TFTP" },
                  { id: "i3", text: "DNS" },
                  { id: "i4", text: "FTP" },
                  { id: "i5", text: "DHCP" },
                  { id: "i6", text: "SMTP" },
                  { id: "i7", text: "RIP" },
                  { id: "i8", text: "SSH" },
                  { id: "i9", text: "SNMP" },
                ],
                assign: { i1: "tcp", i2: "udp", i3: "both", i4: "tcp", i5: "udp", i6: "tcp", i7: "udp", i8: "tcp", i9: "udp" },
                feedback: { explanation: "تعمل عبر TCP: HTTP / HTTPS · FTP · SMTP · SSH. تعمل عبر UDP: TFTP · DHCP · RIP · SNMP. تعمل عبر الاثنين: DNS." },
              },
            },
            {
              id: "m32-l02-p01-q10", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "أي وحدة بيانات تحتوي عنوان IP؟",
                options: [{ id: "a", text: "Segment" }, { id: "b", text: "Frame" }, { id: "c", text: "Packet", correct: true }, { id: "d", text: "Bit" }],
                feedback: { explanation: "في طبقة Network الوحدة Packet وتحتوي عنوان IP؛ أما Segment فيحتوي المنفذ Port، وFrame يحتوي عنوان MAC، وBit إشارات 0 و 1." },
              },
            },
            {
              id: "m32-l02-p01-q11", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "ordering", prompt: "رتّب وحدات البيانات عند الإرسال:",
                items: [{ id: "frame", text: "Frame" }, { id: "data", text: "Data" }, { id: "bits", text: "Bits" }, { id: "packet", text: "Packet" }, { id: "segment", text: "Segment" }],
                order: ["data", "segment", "packet", "frame", "bits"],
                feedback: { explanation: "عند الإرسال: Data → Segment → Packet → Frame → Bits، وعند الاستقبال بالعكس." },
              },
            },
            {
              id: "m32-l02-p01-q12", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "أي صفة من صفات UDP؟",
                options: [{ id: "a", text: "موثوق — يضمن الوصول" }, { id: "b", text: "يرسل تأكيد استلام ACK" }, { id: "c", text: "يتصل أولًا (Connection-Oriented)" }, { id: "d", text: "سريع جدًا", correct: true }],
                feedback: { explanation: "UDP بدون اتصال، لا يرسل تأكيدًا، وقد تضيع البيانات، لكنه سريع جدًا؛ والصفات الثلاث الأخرى صفات TCP." },
              },
            },
          ],
        },
      ],
    },
  ],
};

export default m32;
