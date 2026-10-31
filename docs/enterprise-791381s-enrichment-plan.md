# 791381s — interactive enrichment of «أوراق تلخيص شبكات الاتصال» (plan and phase record)

> **ملخّص للمالك (Arabic summary).** الهدف: تحويل أوراق التلخيص `791381s` إلى مادة تفاعلية جذابة **دون تغيير أي كلمة
> من الكتاب**: الطلاب يملكون النسخة المطبوعة ويكتبون ملاحظاتهم عليها، فكل صفحة في القارئ تبقى مطابقة للمطبوع. نضيف فقط:
> هوية بصرية (ألوان لكل دفعة، خط Cairo، أيقونات للصناديق)، صورًا ومحاكاة وأمثلة تحت الفقرة التي تشرحها، وصفحة
> «تدريبات الوحدة» في آخر كل وحدة: يختار الطالب، يظهر الخطأ بالأحمر والصحيح بالأخضر مع شرح بسيط، وتُحسب في نقاط القوة
> كما في الكتاب الأول. العمل مقسّم إلى تسع مراحل؛ كل مرحلة فرع وطلب دمج مستقل، والمالك وحده يدمج.

## 1. Owner decisions (binding for every phase)

| # | Decision | Source |
|---|---|---|
| D1 | **The book text never changes.** No word, block, order, title, page or booklet drawing of `791381s` is edited, moved, removed or replaced. Students own the printed booklet and annotate it; the Reader must stay page-for-page identical to it. | Owner, 2026-10-31 |
| D2 | **Everything new is an addition**, marked as enrichment (`origin: "teacher-enrichment"`, the Reader's «إثراء» tag), placed **after** the book block it explains, or on an added page. A booklet PNG is never swapped for an SVG: the SVG is added next to it. | Owner, 2026-10-31 |
| D3 | **End-of-unit interactive exercises** («تدريبات الوحدة») close every unit: the student picks an answer → the wrong choice turns **red**, the right one **green**, with a short explanation of the correct answer underneath. They must also work in presentation mode (the teacher asks, the class answers). | Owner, 2026-10-31 |
| D4 | **Simulations are welcome** where they help (reuse 791381's activities first). | Owner, 2026-10-31 |
| D5 | **Colour, typography and icons are very important**: attractive colours, beautiful fonts, attractive icons — as presentation of the unchanged book. | Owner, 2026-10-31 |
| D6 | **End-of-unit exercises count toward the student's Strength points**, exactly as in the first book (791381) — the existing Study Practice Strength path (server-judged, best-once). | Owner, 2026-10-31 |
| D7 | **Finish Phases 7 and 9 in the current form; Phase 8 becomes the exam-system integration**: bring the platform's exam engine and its curriculum network simulator (`networkTopology@2`: routers / switches / PCs with Command Prompt / servers / access points), its advanced question types (labelDiagram / hotspot on the booklet's drawings, parametricNumeric, inlineCloze, tableFill, multipleSelect…) and the Exam Library trainings (T01–T30, F01–F06) into the booklet, in the places that make it professional — without ever creating an exam record or a grade from practice, and without any answer reaching the browser before an answer. | Owner, 2026-10-31 |

The book is protected mechanically, not by convention: the **book lock** (Phase 1, section 4) fails the root suite on any
change to a book block, a book page's identity / order / source, or a booklet drawing's bytes.

## 2. Starting point (baseline `ffd0d58`)

- `791381s`: 37 modules (m00 cover + the booklet's sections 1–36), 202 pages, verbatim book content only: 105 tables,
  99 callouts (the booklet's printed box labels), 33 cropped booklet drawings, **0** visuals, **0** practice, **0** activities.
  The printed booklet is black and white.
- `791381` (the full book) already ships reusable enrichment: 122 registered SVG visuals (`src/learning/visuals/registry.ts`,
  not course-bound), 15 registered activities (`productionActivityRegistry`, incl. `cli-terminal`, `osi-layers`,
  `tcp-handshake`, `ipv6-compress`, `hub-switch-router-flow`), 415 `practice` blocks (257 multipleChoice, 91 trueFalse,
  67 shortInput), 65 `practice-table` worksheets (dropdown cells).
- Exercise kinds that **exist**: multipleChoice, trueFalse, shortInput, practice-table (dropdown). `fillBlank` exists in the
  schema but renders statically. **Missing**: word bank (مخزن كلمات), matching (وصل), ordering (ترتيب), classify (تصنيف).
- The current inline checker (`PracticeBlockView`) does **not** reveal the right answer after a wrong one (hint ladder +
  retry; explanation only after a right answer). D3 needs a reveal mode (Phase 2).

### Page-by-page analysis (input for Phases 4–7)

`docs/enterprise-791381s-enrichment/analysis/g1.json … g4.json` hold one entry per page of all 202 pages (m00–m08,
m09–m18, m19–m27, m28–m36): proposed visuals (reuse of a 791381 visual / activity, or new), proposed exercises with a
concrete Arabic sample item and its answer drawn from that page's own text, the matching 791381 practice to reuse, and the
colour meaning per module. Totals: **277 visual proposals** (153 reuse-visual, 67 reuse-activity, 18 new-visual, 7
new-activity, 32 "replace-png") and **487 exercise proposals** (106 mcq, 89 trueFalse, 68 shortInput, 66 matching, 54
dropdown, 44 classify, 36 ordering, 24 wordBank).

**Reading rule for the analysis (D2):** every `replace-png` proposal means *add the named SVG next to the booklet drawing*;
the drawing itself stays. Every sample item is a draft: it is re-checked against the page text when it is authored.

### Findings to carry into the content phases

| Finding | Where | Handling |
|---|---|---|
| **Conversion error (fidelity defect):** the Reader shows «HTTP = HTTPS + طبقة أمان»; the printed booklet (PDF p. 39, verified on a 150-dpi render) prints HTTPS = HTTP + طبقة أمان. | `791381s-m13-l01-p02`, block `m13-l01-p02-c2` | **Fixed** (owner-approved, 2026-10-31): the card now reads «HTTPS = HTTP + طبقة أمان» with the formula as one LTR span (no-break spaces); fail-first test `src/learning/content/791381s/fidelity.m13.test.ts`; the lock entry of that one page was re-written, the served body regenerated. |
| The booklet itself calls EIGRP «Distance Vector متطوّر» on one page and «Hybrid (Cisco فقط)» on another. | m29-l01-p01 vs m35-l01-p03 | Not changed (D1). Each exercise follows only its own page's wording; the owner is informed. |
| Port Security uses `maximum 3` (m23) and `maximum 2` (m25 table). | m23, m25 | Two different examples; each page's exercises use its own number. |
| 791381 visuals that must **not** be reused: `791381/m28/port-security-config-summary` (Restrict/Protect, not in the booklet), `791381/m28/route-types-summary` (adds 0.0.0.0/0), `791381/m03/svi-gateway` on m16-l01-p06 (192.168.1.254 ≠ the page's 192.168.10.254); the 791381 VLAN/Trunk sim uses fa0/24 where the booklet uses g0/1; extended-ACL sim m06-l01-p01 adds port 443. | various | Reuse only after the labels match the booklet page, or author a new descriptor. |
| 791381-m07 (IP addresses) has no practice questions. | — | Exercises authored for 791381s-m03 can later be offered to 791381 too (separate owner decision). |

## 3. Phases

One phase = one branch = one pull request, through the canonical loop of `AGENTS.md` (baseline gate → tests → full
validation → mutation proof for the guards → exact-head CI → independent review → **owner merge**). Publication to a class
stays the teacher's explicit action (deployment ≠ publication).

| # | Phase | Scope | Done when |
|---|---|---|---|
| **1** | **Visual identity + book lock** | Course-scoped «booklet» skin: a colour per booklet group (intro, six «دفعات», «الملخص الشامل»), Cairo for headings (self-hosted, OFL), an icon + colour per printed box family, tinted tables / cards / opener / index dots, light · sepia · dark · presentation. **Book lock** test. | Section 4. |
| **2** | **Reveal-mode questions + «تدريبات الوحدة» page** | A reveal mode for multipleChoice / trueFalse / dropdown: after an answer, the chosen wrong option red, the right option green, the explanation below (server-check compatible: the server returns the key and explanation only after the attempt). An end-of-unit page layout (score «7 / 10», «أعد المحاولة»), presentation-friendly. Counted in Strength (D6) through the existing study index. Relax the 791381s "book-only" test to "book locked + enrichment allowed" (the lock already guards the book). | Fail-first tests for reveal semantics and answer-key secrecy before answering; mutation proof on the key-secrecy guard. |
| **3** | **New exercise kinds** | `wordBank`, `matching`, `ordering`, `classify`: schema, validator, Reader view (keyboard + touch, RTL), server check (L.6b) and study-index support, reveal mode. Course-agnostic. | Each kind: validator + render + server-judged tests; mutation proof on the evaluator. |
| **4** | **Enrich «الدفعتان 1–2»** (m01–m08) | Reuse 791381 visuals/activities under the paragraphs they explain; added solved examples (conversions, IP validity, CIDR); «تدريبات الوحدة» (8–12 items) per unit. New activity candidates: `binary-boxes` (m02 «أهم أداة في الوحدة»), `ip-validity-checker` (m03). | Book lock green; every item answerable from its page; study index regenerated. |
| **5** | **Enrich «الدفعتان 3–4»** (m09–m19) | OSI, TCP handshake, message delivery, CLI terminal setups for switch / VLAN / trunk / VTP; end-of-unit pages. New candidates: `pc-command-prompt` (ping / ipconfig), `trunk-tagging`. | idem |
| **6** | **Enrich «الدفعتان 5–6»** (m20–m30) | Wi-Fi / DMZ visuals, IPv6 compress, DHCP DORA, Port Security, passwords, routing, ACL; CLI setups (DHCP, port security, static route); end-of-unit pages. New visual candidate: running-config vs startup-config (`copy`). | idem |
| **7** | **«الملخّص الشامل»** (m31–m36) | An interactive twin of each review table (one column as dropdowns), placed on the unit's «تدريبات الوحدة» page so it is filled from memory (not copied from the table above); a cumulative review set per unit. | idem |
| **8** | **Exam-system integration (D7)** | 8A — link units to the existing Exam Library trainings (T01–T30, F01–F06; same Strength bucket, no double count). 8B — network labs in the units with the full curriculum simulator (`networkTopology@2`): VLAN, Trunk / Router on a Stick, DHCP, Port Security, wireless, `ping` / `ipconfig` on a PC. 8C — advanced question types on «تدريبات الوحدة» (label the booklet drawing, numbers that change per attempt, passage completion, table fill). Practice never creates an exam record or grade; keys stay server-side. | Design record + fail-first tests on the practice ↔ exam boundary; mutation proof on key secrecy and on "no exam record from practice". |
| **9** | **Final audit** | Every page on phone / desktop, light / sepia / dark, presentation mode, print, load size; every item traced to its page text. | Report to the owner; ready for class publication. |

Order: **1 → 2 → 3**, then **4 → 5 → 6 → 7**; **8** in parallel with 5–7.

## 4. Phase 1 record — visual identity + book lock

**What ships**

- `src/learning/themes/courseTheme.ts` — pure data: `courseThemeId` (only `791381s` → `"booklet"`), `pageThemeFor`
  (the manifest batch of the page's module names the tone; unknown → `"base"`), `calloutTone` (printed box label →
  one of 12 families: remember · warning · example · idea · rule · note · mistake · analogy · prevention · benefit · why ·
  exam; unknown label → the callout kind's family).
- `src/learning/themes/CalloutToneIcon.tsx` — one decorative outline icon per family (aria-hidden, the app's 20×20 icon
  language).
- `src/learning/themes/booklet-theme.css` — every rule keyed on `data-course-theme="booklet"`, `data-theme-tone` or
  `data-callout-tone`; light values plus `light-dark()` dark values (the app's dark mode and the Reader's «داكن» theme);
  Cairo 600/700/800 (`public/fonts/Cairo-*.woff2`, `public/fonts/Cairo-OFL.txt`) for headings only.
- Reader wiring: `ReaderPageHeader.theme` (set by `LearningReader` from the manifest), `data-course-theme` /
  `data-theme-tone` on the page `<article>` (normal and opener pages), `data-callout-tone` + the icon on printed boxes,
  `data-theme-tone` on each index unit. An unthemed course (791381) renders the exact markup it had: React omits the
  undefined attributes and the callout keeps its old branch.
- **Book lock**: `scripts/book-lock.mjs` (canonical-JSON SHA-256 of a page's identity + every origin-"book" block;
  booklet drawings by bytes), the committed `src/learning/content/791381s/book-lock.json` (202 pages, 32 drawings) and
  `src/learning/content/791381s/bookLock.test.ts` (unchanged pages, unchanged book page order, new pages enrichment-only,
  unchanged drawings). Writing a new lock (`node scripts/book-lock.mjs --write 791381s`) means the book changed — an owner
  decision only.

**Group colours** — intro indigo · b1 blue · b2 teal · b3 violet · b4 orange · b5 rose · b6 green · summary amber.
Text uses each group's *ink* (≥ 4.5:1 on white); bars, dots and icon chips use its *tone*.

**What does not change** — no content file of `791381s` or `791381` is edited; the existing 791381s course test still
asserts book-only content (relaxed only in Phase 2, when the first enrichment block arrives, with the lock already in place).

## 5. Phase 2 record — reveal-mode questions + «تدريبات الوحدة»

**Reveal mode** (`reveal: true` on a `practice` block — `RevealMarker` in `src/learning/content/types.ts`):

- *Reader* (`PracticeBlockView`): before an answer nothing of the key is in the DOM. After an answer the question locks: the
  chosen wrong option is red with «✕ إجابتك», the right option green with «✓ الإجابة الصحيحة», the verdict line names the
  right answer, and the explanation («الشرح: …») shows for a right **and** a wrong answer. No hint ladder; «أعد السؤال» clears.
  Never colour-only (icon + words); tokens only (dark theme re-maps them).
- *Server* (`api/src/lib/learning-check.js`): the check index carries `reveal: true`; `checkResponse` returns the right answer
  (`reveal: { kind, optionIds | answer }`) and the explanation with every **well-formed answer of that question** — a malformed
  response or one of another kind gets neither, so the key never leaves without an answer. Kinds: multipleChoice, trueFalse
  (shortInput is excluded: its stored key is normalised, not the text to show).
- *Strength* (D6, `api/src/lib/learning-study.js`): reveal questions are ordinary study activities (round(completed / eligible ×
  20) per unit). Anti-farming: a student's wrong answer to a reveal study activity is recorded once as `revealed` (CAS); a later
  right answer is judged and answered but **never completed** (`revealedBefore`, gained 0) — also when the reveal lands between
  the read and the write of an overlapping request. A first right answer completes as usual; a completion is never undone or
  marked revealed. The local (authored-key) path never reports a right answer after a shown one either.
- *Validator*: `reveal` exactly `true`, multipleChoice / trueFalse only, with an answer key and an explanation in authored
  content (a served body carries neither).
- `GET /api/learning-study/{course}` advertises `policy.moduleCount` per course (791381: 28; 791381s: 37).

**«تدريبات الوحدة» page** (`layout: "practice"`): only teacher-enrichment blocks, at least one exercise (validator). The Reader
shows «تدريبات تفاعلية» instead of «من الكتاب», a how-to line, the questions, a running score «أجبت عن a من n · الصحيحة: r»,
then «نتيجتك: r / n» and «أعد كل الأسئلة» (screen state only; each answer still goes to the server, which decides points).

**Pilot**: `791381s-m01-l02-p01` «تدريبات الوحدة: أساسيات الشبكات» — 10 reveal questions (8 multipleChoice, 2 trueFalse), each
answered and explained by the section's printed text. The book pages are untouched (book lock green); the served bodies, check
index, study index and page index are regenerated. The 791381s course test now allows added enrichment (enrichment types,
origin teacher-enrichment, enrichment-only added pages) while the book lock pins the book.

Not in this phase: reveal for `practice-table` dropdowns and shortInput (Phase 3 with the new kinds); content for the other units
(Phases 4–7).

## 6. Phase 3 record — new exercise kinds (مخزن كلمات · وصل · ترتيب · تصنيف)

Four **structured** `PracticeQuestion` kinds (`src/learning/content/types.ts`), course-agnostic, each with its presentation and —
in authored content only — its key:

| Kind | Presentation | Key | Reader surface (`StructuredPracticeInput.tsx`) |
|---|---|---|---|
| `wordBank` | `segments` (text + `{ blank }`), `bank` (distractors allowed) | `answers` {blank: word} | passage with blank buttons + word chips; a chip fills the selected / next blank, a filled blank gives its word back, each chip once |
| `matching` | `left`, `right` items | `pairs` {left: right}, one-to-one | one native `<select>` per left item |
| `ordering` | `items` in the authored (scrambled) order | `order` (item ids) | list with ▲ / ▼ buttons |
| `classify` | `groups`, `items` | `assign` {item: group} | one radio group of group buttons per item |

- **Judging** (local evaluator, server `evaluateStudyResponse`): right only when **every** part is right; malformed / other-kind
  responses are wrong. The server also returns `parts` (right / wrong per answered part — never the expected value), shown as an
  icon + screen-reader word beside each part. Outside reveal mode the learner edits (the verdict clears) and checks again.
- **Reveal** (Phase 2 mode, extended): the key comes back only for a response of the same kind that answers **every** part (an
  empty or partial answer cannot fish for it). The surface locks and each wrong part shows «الصحيح: …» (ordering: «الترتيب
  الصحيح» list); the explanation shows underneath. Anti-farming and Strength are unchanged (the same study rules).
- **Served bodies** keep the presentation only (`servedQuestion`); the check / study indexes carry the keys (`practiceQuestionKey`).
- **Validator** (`invalid-structured-question`): unique non-empty ids and texts, minimum sizes (≥ 1 blank and a word per blank;
  ≥ 2 per matching side and right ≥ left; ≥ 3 ordering items; ≥ 2 groups and items), a key covering every part with an offered
  choice, matching one-to-one, ordering items not authored in the answer order. Reveal accepts the four kinds (key + explanation).

**Pilot**: four new reveal questions on `791381s-m01-l02-p01` (now 14 questions) — q11 wordBank (الحجم · المسافة · PAN · WAN, with
the distractor «السرعة»), q12 matching (PAN / LAN / WAN ↔ their printed descriptions), q13 ordering (PAN → LAN → WAN), q14 classify
(network uses vs. management and maintenance) — all answered by section 1's printed text. Book lock green.

Not in this phase: reveal for `practice-table` dropdowns (they already show a verdict per cell); drag-and-drop gestures (the
surfaces are tap / keyboard / native controls, which work the same on phones, tablets and with a screen reader).

## 7. Phase 4 record — «الدفعتان 1–2» (units 1–8) enriched

Authored in parallel per unit pair, then integrated and fact-checked by the lead against the booklet text. Every addition is
`teacher-enrichment`, placed after the book block it explains; the book blocks are byte-identical (book lock green, diffs of the
unit files are insertions only).

| Unit | Visuals / activities added (reused from 791381, labels checked against the booklet page) | «تدريبات الوحدة» |
|---|---|---|
| 1 أساسيات الشبكات | network-connected-devices, shared-printer, network-building-blocks, network-management-cycle; `network-scope` (PAN/LAN/WAN, booklet wording) | already in Phase 2–3 (14) |
| 2 الأعداد | binary-to-decimal (01111011 = 123), hex-to-binary (A23F) | 12 |
| 3 عناوين IP | ip-identity, private-public; `ipv4-octets` (192.168.100.10) | 12 |
| 4 الفئات والقناع و CIDR | address-classes, subnet-mask (192.168.1.100), same-network; `cidr-network-host` (the page's three examples); `gateway-flow` | 12 |
| 5 أجهزة الشبكات | switch-unicast, router-networks; `hub-switch-router-flow` | 12 |
| 6 أشكال التوصيل | p2p-direct; `network-topologies` (booklet card wording) | 11 |
| 7 الكوابل و MAC | `cable-comparison` (booklet table), `mac-address-anatomy` (A0:02:AF:2D:10:22) | 12 |
| 8 أنواع الرسائل | storage-units; `message-delivery` (the booklet drawing); `broadcast-address` (the booklet's five rows; practice uses three of them); one solved example (2048 بايت = 2 KB, the booklet's own) | 12 |

97 end-of-unit questions in all (multipleChoice, trueFalse, wordBank, matching, ordering, classify), every one in reveal mode with an
explanation quoting the unit's text.

**Rejected on purpose** (they would add content the booklet does not state): conversion-map (decimal ↔ Hex), network-uses-map (4 of 6
uses), ipv4-vs-ipv6 (32 / 128 bit), static-dynamic (DHCP), localhost-loopback / apipa-fallback, cidr-prefix («32 بت», «مضيف»),
subnetting-walkthrough (192.168.1.25 «مثال الكتاب»), collision-domains, bus-collision («فتتلف البيانات ويُعاد الإرسال»),
mac-frame-delivery, ip-vs-mac-summary (32 / 48 bit), message-structure visuals (invented addresses). Invented practice networks in the
broadcast builder were replaced by the booklet's own rows.

**Notes for review**: router-networks / hub-switch-router-flow draw a generic «Switch» inside each network (the booklet's drawing
shows «شبكة 1 / 2»); network-topologies labels Tree / Hybrid centres «Switch» (the page says «جهازًا مركزيًا مثل السويتش»);
private-public draws a router at the LAN edge; the cidr-network-host task's built-in wrong-answer reasons match the booklet's p06 rule.

Guards added: `course791381s.test.ts` — every enrichment visual / activity resolves to a registered renderer; units 1–8 each end with a
«تدريبات الوحدة» page of 8+ reveal questions in 3+ kinds. Visual gate: `learning-search` change declared (booklet pages 203 → 210).

## 8. Phase 5 record — «الدفعتان 3–4» (units 9–19) enriched

Same method and rules as Phase 4 (parallel authoring per unit group, lead integration and fact-check of every question).

| Unit | Visuals / activities added (reused, labels checked) | «تدريبات الوحدة» |
|---|---|---|
| 9 OSI و TCP/IP | `osi-layers` (booklet table wording, send 7→1 / receive 1→7), osi-vs-tcpip, tcp-vs-udp | 12 |
| 10 البروتوكولات | ssh-vs-telnet, dns-http-dhcp | 12 |
| 11 أوامر الفحص | tracert-hops (no CLI sim: the engine is Cisco-only, not Windows) | 11 |
| 12 المجالات | collision-domains, half-full-duplex, apipa-fallback; `network-domains` | 12 |
| 13 الأمان | hijacking-vs-mitm, dos-vs-ddos, secure-two-pillars, https-secure-channel (HTTP + SSL/TLS = HTTPS) | 12 |
| 14 التجزئة والمصافحة | encapsulation-stack, pdu-anatomy; `tcp-handshake` | 12 |
| 15 CLI | cli-interface, switch-ports-map; `cli-terminal` (enable → configure terminal → vlan 10) | 12 |
| 16 VLAN | vlan-segmentation, vlan-access-trunk-terms, vlan-example-topology; 3 × `cli-terminal` (vlan/name, access port, SVI) | 12 |
| 17 Native / Tagged | tagged-untagged-native, access-port-assignment; 2 × `cli-terminal` (native vlan 99, allowed vlan 10,20) | 12 |
| 18 VTP | vtp-roles, vtp-propagation; 2 × `cli-terminal` (server / client, domain HFA, password 123) | 11 |
| 19 Trunk / Router on a Stick | trunk-multi-vlan, inter-switch-trunk-ports, dot1q-tag-frame, router-on-a-stick, subinterfaces-vlan30-40; 4 × `cli-terminal` (range trunk, g0/1 allowed vlan, sub-interfaces .10/.20, .30/.40) | 12 |

130 new questions (227 in units 1–19). Every CLI exercise was run through the real reader (`readCliExerciseConfig`) and engine
(`submitCommand`) with the booklet's exact command lines: all reach `completed`.

**Rejected on purpose** (content the booklet does not state, or values that differ): stp-loop-blocking (blocks SW1–SW3, the booklet
SW2–SW3), protocols-by-transport («سريع — رسائل قصيرة»), ping-echo (ICMP), arp-association / troubleshooting-command-map, tcpip-layers,
svi-gateway (192.168.1.254 ≠ 192.168.10.254), dot1q-tag-frame on unit 17 («Dot1Q» not in that unit), subinterfaces-vlan10-20 (draws
g0/0.20 as unfinished), the range CLI box on m16-p05 (the engine prints `(config-if)#`, the booklet teaches `(config-if-range)#`).

**Notes for review**: the booklet says HTTPS in the google.com steps and HTTP in its «معًا» sentence (unit 10) — each item follows its
own sentence; tcp-vs-udp shows «ACK» (the booklet's handshake unit uses SYN / SYN-ACK / ACK); tracert-hops labels stops «قفزة»; the
network-domains explorer applies the booklet's rule «كل منفذ في السويتش = مجال تصادم مستقل» to its drawing (6 collision domains);
m19-p03's range trunk exercise shows `(config-if)#` (its description tells the student).

Guards: the units-1–19 practice-page test; visual gate: `learning-search` declared (pages 210 → 221).

## 9. Phase 6 record — «الدفعتان 5–6» (units 20–30) enriched

| Unit | Visuals / activities added (reused, labels checked) | «تدريبات الوحدة» |
|---|---|---|
| 20 DMZ و Wi-Fi | dmz-three-zone, wifi-radio-link, wireless-network-types, ssid-beacon, wifi-protection-technologies, access-point-bridge | 12 |
| 21 IPv6 والمنافذ | ipv6-anatomy, well-known-ports; `ipv6-compress` (the booklet's three examples, character for character) | 12 |
| 22 DHCP | dhcp-automatic-config, dhcp-dora, dhcp-pool-excluded, dedicated-dhcp-server; 2 × `cli-terminal` (interface + pool LAN; default-router / dns-server / excluded-address) | 12 |
| 23 Port Security | port-security-scenario; 3 × `cli-terminal` (static MAC 00A0.1234.5678, sticky, maximum 3) | 11 |
| 24 كلمات المرور | device-security-layers, device-access-paths; 3 × `cli-terminal` (console, vty 0 4, enable secret + service password-encryption) | 12 |
| 25 مرجع الأوامر | 2 × `cli-terminal` (hostname SW1 / banner / g0/0; port security with maximum 2 — this page's number) | 12 |
| 26 WAN | frame-relay-vs-atm, hdlc-vs-metro | 11 |
| 27 التوجيه | routing-methods-overview, static-route-path, routing-update-types, admin-distance-summary; `cli-terminal` (ip route 192.168.2.0 255.255.255.0 10.0.0.2) | 12 |
| 28 OSPF | ospf-topology (the booklet drawing), wildcard-inversion; 2 × `cli-terminal` (R1 / R2) | 12 |
| 29 EIGRP | eigrp-metric-adaptation («Distance Vector» — this page's wording), show-ip-route ([120/1] via 192.168.1.1); 2 × `cli-terminal` (AS 100) | 11 |
| 30 ACL | acl-gate, standard-acl-source, extended-acl-decision («مثل 80 أو 443» is on that page); 3 × `cli-terminal` (standard 10, 10/20/30 examples, extended 100 eq 80) | 12 |

129 new questions (356 in units 1–30). Every CLI exercise ran through the real reader + engine with the booklet's command lines
and completes (and, as a negative check, R2 does not complete with `router eigrp 200`).

**Rejected or removed by the lead**: port-security-config-summary (Restrict / Protect), route-types-summary (0.0.0.0/0), wan-vs-lan-scope
(ownership / provider claims), ssh-vs-telnet on unit 24 («نص مقروء»), cli-mode-ladder (draws `vlan 10`), apipa-fallback on unit 22, the
extended-ACL sim with port 443, the show-commands map on unit 25 (adds a grouping — «show interfaces» under «Config» — the booklet's table
does not have), and a duplicate AD visual on unit 27's Metric page (kept on its AD page). No `copy` CLI exercise (the engine has no
`copy`), no show-command exercise (4 of the 13 table commands are not in the engine).

**Checked, not an error**: unit 21 «db8 → 0db8»: on the printed page (PDF 64) the arrow points from «0db8» to «db8»; the Reader shows the
same visual order (direction marks), so the meaning «احذف الأصفار» is right.

**Notes for review**: m30-p05's extended exercise applies the list on g0/0 (the page names no interface; the unit's standard page uses
g0/0); m23-p03/p04 and m25-p02 run on f0/1 (the unit's p02 port); m24's first visual already names Console / VTY / Enable (introduced on
the next page of the same unit).

Guards: units-1–30 practice-page test; visual gate: `learning-search` declared (pages 221 → 232).

## 10. Phase 7 record — «الملخّص الشامل» (units 31–36) enriched

| Unit | Interactive table twins (on the practice page) | Visuals / activities | Questions |
|---|---|---|---|
| 31 الأساسيات | 8 (property, Subnet Mask, base, the 192 boxes row, layer, cable, connection type, network symbol) | private-public, address-classes; `hub-switch-router-flow`, `cable-comparison`, `network-scope` | 12 |
| 32 النماذج والبروتوكولات | 4 (OSI layer, Port, UDP, data unit) | encapsulation-stack; `osi-layers` (the booklet's Arabic layer names) | 12 |
| 33 العنونة والتجزئة | 6 (address, message type, prefix, Wildcard, IPv6 value, IPv6 special address) | subnetting-walkthrough (192.168.1.25/24, the booklet's example), wildcard-inversion; `ipv6-compress` (2001:0DB8:…:0001 → 2001:DB8::1); a solved example on the table's 172.16.5.40/16 row | 12 |
| 34 التبديل و VLANs | 4 (technology, VTP mode, STP element, concept) | trunk-multi-vlan, stp-loop-blocking, metro-vlan-summary; 3 × `cli-terminal` (g0/1 trunk with allowed 10,20,30 + native 99, VTP HFA / SA1234, gi0/0.10 dot1Q 10) | 12 |
| 35 التوجيه والأمان | 5 (AD row, protocol type — this unit's «Hybrid (Cisco فقط)», attack description, violation result, ACL placement) | route-types-summary and port-security-config-summary (this unit prints 0.0.0.0/0 and Restrict / Protect), admin-distance-summary, dos-vs-ddos, acl-gate; 5 × `cli-terminal` | 12 |
| 36 الخدمات والأوامر | 3 (term NAT / PAT / APIPA, CMD command, Show command) | nat-pat-apipa, dhcp-dora and tcp-three-way-handshake (SVG twins next to the booklet's crops), web-opening-journey; 2 × `cli-terminal` | 12 |

30 table twins and 72 questions (458 checkable activities in the whole booklet). **Placement decision (lead)**: the agents first put
each twin right under its book table, with the same rows — the answer was in view just above; the twins were moved to the unit's
«تدريبات الوحدة» page (renamed to that page's ids) so the student recalls the table. A test pins it (no practice-table on a book page of
units 31–36). Every CLI exercise ran through the real engine with the booklet's lines and completes.

**Rejected on purpose** (selection): ip-vs-mac-summary, static-dynamic, binary-to-decimal (123 ≠ the page's 192), cable-media-overview
(100 Gbps, Coaxial), utp-vs-stp, well-known-ports (FTP 21 ≠ «20 , 21»), tcp-vs-udp («مرتّب»), protocols-by-transport (DNS UDP-only),
ssh-vs-telnet, message-delivery on unit 33, apipa-fallback (169.254.10.7), ipv6-summary («أطول سلسلة»), vlan-segmentation (VLAN 20 =
المحاسبة ≠ the booklet's SALES), vtp-roles / vtp-propagation, router-on-a-stick (g0/0.20), routing-update-types on unit 35 (EIGRP «Distance
Vector» ≠ this unit's «Hybrid»), extended-acl-decision on unit 35 (443 / ICMP), dhcp-pool-excluded, troubleshooting-command-map; the range
CLI box (`config-if-range`).

**Notes for review**: unit 35's protocol-type table offers «Distance Vector (قديم)» (RIP's value in that table) as a wrong choice for EIGRP;
the EIGRP challenge on unit 35 requires the wildcard as printed in line ④, although its «للتذكّر» says it is optional; CLI exercises without
a named interface run on f0/1 (port security) and g0/0 / g0/1 (ACL), each description says so.

Guards: every unit 1–36 ends with an 8+ question reveal page; units 31–36's twins live on the practice page. Visual gate: `learning-search`
declared (pages 232 → 238). **With Phase 7, every unit of the booklet is enriched**; Phase 8 (exam-system integration, D7) and Phase 9
(final audit) remain.

## 11. Phase 8 design — the exam system inside the booklet (D7)

Design only (read-only study of HEAD `8345b226`); implementation starts after the owner approves this section. Every part
keeps the owner's rules: the book never changes (book lock), everything added is `teacher-enrichment`, practice never
creates an exam record, an attempt or a grade, and no key reaches the browser before an answer.

### 11.1 What the platform already provides

| Piece | Where | Reused for |
|---|---|---|
| Exam Library trainings T01–T30, F01–F06 (607 items: 550 MCQ, 40 matching, 17 open) | `api/src/lib/learning-training-registry.js`, `api/src/functions/learning-training.js`, `src/learning/training/*` | 8A |
| Training Strength bucket, keyed by `trainingId` only (40 pts each) | `learning-practice.js`, `student-strength.js` | 8A, unchanged (no double count) |
| Curriculum network simulator `networkTopology@2` (routers, switches, PCs with Command Prompt, servers, AP) and its server-side checks | `src/networkTopology2/Net2Workspace.tsx`, `evaluateSmartSim` / `evaluateNet2Check` (shared CJS) | 8B |
| Official pure grader `gradeExam` and student projection `sanitizeExamForStudent` | `api/src/lib/assignment-grading.js`, `student-exam-sanitize.js` | 8C |

**Defect found during the study (fixed fail-first in 8C-0):** `LearningTrainingRunner.tsx` renders `StudentQuestionCard`
without `onAnswer`. A registered (advanced) question type therefore gets the no-op fallback, its answer is lost and Submit
stays disabled. Today's library holds no such type, so no student is affected yet.

### 11.2 8A — the 36 Exam Library trainings opened from the booklet's units

- **Gate:** the registry keeps its 791381 rows untouched and adds 791381s *release points*
  (`ALSO_RELEASED_BY`). A training opens when **any** of its release modules is published to the class. Nothing is
  published automatically, and teacher access is unchanged.
- **Placement:** one metadata-only `library-training` block (six keys, no question text) on the «تدريبات الوحدة» page of
  the releasing unit: T01 m01 · T02 m02 · T03–T04 m03 · T05 m04 · T06 m05 · T07 m06 · T08 m07 · T09 m08 · T10 m09 ·
  T11 m10 · T12 m11 · T13 m12 · T14 m14 · T15 m16 · T16 m18 · T17 m19 · T18 m21 · T19 m22 · T20 m24 · T21 m25 · T22 m26 ·
  T23 m29 · T24 m30 · T25–T26 m24 · T27–T30 m30 · F01–F06 on m36's page, gated by m30.
- **Strength:** the same `trainingId` bucket. A student whose class has both books has one record (best score kept).
  `library-training` blocks are never study activities.
- **Tests:**
  - fail-first: a 791381s-only class with m01 published gets 403 on T01 today and 200 after;
  - unpublished → 403;
  - one practice document across both books;
  - every id placed exactly once, at its release module;
  - no training id in the 791381s study index.
- **Mutations:** drop the extra release points; skip the publication check; compare the course id loosely.
- `course791381s.test.ts` gains `library-training` in its enrichment list. This is a scope extension, not a loosening:
  the book lock still guards the book.

### 11.3 8B — network labs with the curriculum simulator

- **Block:** `simulation` / `network-lab` v1, config `{topology, task{intro, goals}, checks, feedback, solution}`.
- **Served body:** strips `checks`, `feedback` and `solution` and adds `serverCheck`. The Reader mounts
  `Net2Workspace` lazily (`src/learning/lab/NetworkLabActivity.tsx`, never `trustedSimPlugins`).
- **Judging:** the existing practice route `POST /api/learning-study/{course}/attempt` replays the student's action list
  on the server (256 KB cap). It uses `evaluateSmartSim` all-or-nothing and returns per-goal booleans only, never values.
  A broken envelope or key returns a retryable error and writes nothing: never a "wrong" because of infrastructure.
- **Labs where the simulator supports the booklet's commands:**
  - m15 hostname / SVI
  - m16 VLAN and isolation
  - m17 native / allowed VLANs
  - m18 VTP
  - m19 Router on a Stick
  - m20 wireless (SSID / WPA2 / DHCP)
  - m22 DHCP
  - m23 Port Security (real err-disabled)
  - m24 Cisco passwords
  - m36 services (DNS / HTTP, nslookup, browse)
  - m11 (Command Prompt) and m27 (connected routes) are partial.
- **Not possible under `@2`:** m21 IPv6, m28–m29 OSPF / EIGRP, m30 ACL (`ip route` / `access-list` are refused). These
  units keep their Phase 5–7 `cli-terminal` exercises. Supporting them needs a future `networkTopology@3` (versioned
  semantics are immutable).
- **Cost:** about 65 KB gzip, loaded only when a lab opens. The Reader's first load is unchanged, and a bundle-guard
  extension proves it.
- **Strength (owner decision):** an eligible lab raises a unit's denominator, so existing students' unit Strength
  (`round(completed / eligible × 20)`) can drop. Proposed default: labs ship as checked but not counted
  (`studyEligible:false`) until the owner decides.
- **Mutations M1–M7:**
  - M1 checks left in the served body
  - M2 trusting a client state
  - M3 any-check-passes
  - M4 `unavailable` recorded as wrong
  - M5 values in `parts`
  - M6 simulator code on the first load
  - M7 `fetch(` in the lab code

### 11.4 8C — advanced question types in «تدريبات الوحدة»

- **Block:** `exam-item` `{id, origin, itemId, label}`, metadata only.
- **Store:** the question lives in a private store under `api/src/data/learning-exam-items/791381s/`, written with the
  existing Builder schema. Allowed types: multipleSelect, numericResponse, matrix, categorization, inlineCloze,
  labelDiagram / hotspot on the booklet's own drawings, parametricNumeric, tableFill / cliFill. Every node passes the
  shared `validateQuestionTypeNode`.
- **Endpoint** `learning-exam-item/{course}/{item}` (same caller / class / archive gate as trainings, plus "the item's
  unit is published"):
  - `GET` returns `sanitizeExamForStudent` (no key).
  - `POST …/check` runs `gradeExam` and returns `persisted:false` with per-part verdicts. The reveal and explanation are
    returned only after a well-formed answer, as in Phase 2.
  - The parametric instance is seeded on the server, the same for GET and check.
- **Writes:** none. No exam, attempt, gradebook or study record (v1). Counting the items in Strength is a later, separate
  owner decision.
- **UI:** a lazy `ExamItemBlockView` reusing `StudentQuestionCard` (with `onAnswer`). A bundle guard keeps the question
  renderers out of the Reader's first load.
- **Mutations:** remove the sanitize call; drop the gate; trust a client score; drop the parametric context.

### 11.5 Pull-request order

Each step is its own PR, one at a time, owner-merged:

| PR | Content |
|---|---|
| 8A | Release points, gate, and the 36 blocks in the units |
| 8B-1 | Lab contract and server judging; no UI |
| 8B-2 | Lab view, bundle guard, one pilot (m19 ROAS, not counted) |
| 8B-3 | The labs of m15–m24, m11, m36 |
| 8C-0 | Training runner `onAnswer` fix (fail-first) |
| 8C-1 | Item store, endpoint, safety suite |
| 8C-2 | Block, lazy view, host seam |
| 8C-3 | Authored 791381s items, each traced to the booklet page it practises |

## 12. Phase 8A record — the Exam Library trainings opened from the booklet's units

The owner approved §11 on 2026-10-31. For labs, the proposed default applies: they are checked but not counted in Strength
until the owner decides.

**What changed**

- **Gate (`api/src/lib/learning-training-registry.js`).**
  - Each of the 36 items keeps its 791381 row byte for byte and gains one 791381s release point (`SUMMARY_BOOKLET_UNIT`).
  - `trainingAllowedForClass` opens an item when **any** release point is published: course assigned and that module
    visible, both checked with the exact course id of that point.
  - New helpers: `trainingReleases` and `trainingReleaseModuleFor`.
  - A load-time check fails the API start if an item has no 791381s point, a point names an unknown item, or a point
    names a module that is not in the course registry.
  - Nothing auto-publishes, and teacher access is unchanged.
- **Content.**
  - 36 metadata-only `library-training` cards, `origin: "teacher-enrichment"`, ids `mNN-l02-p01-lib-tNN` /
    `-lib-fNN`, placed at the end of the releasing unit's «تدريبات الوحدة» page. F01–F06 go on unit 36's page, gated by
    unit 30.
  - The book lock is unchanged, the manifest is unchanged, and the study index is unchanged: trainings are never study
    activities.
  - The served bodies of the 24 touched units were regenerated.
- **Reader (`LearningPageRenderer.tsx`, `reader.css`).**
  - On a practice page, the training cards sit in their own section «تدريبات من مكتبة الامتحانات» after the running score.
  - The score counts the questions only, and «أعد كل الأسئلة» leaves the cards as they are.
  - The cards themselves are the existing training cards: the title comes only from the API when the item is available.
- **Tests.**
  - `api/tests/learning-training-791381s.test.js` (new).
  - `src/learning/content/791381s/libraryTraining791381s.test.tsx` (new).
  - `course791381s.test.ts` adds `library-training` to its enrichment list (a scope extension: the book lock still
    guards the book).

**Fail-first:** `api/tests/learning-training-791381s.test.js` against baseline code `8345b226`:

| Test | Result on the baseline |
|---|---|
| Registry | `trainingReleaseModuleFor is not a function` |
| Gate | a 791381s-only class with m01 published: `expected false to be true` |
| API | the list row of T01 lacks `available: true` |

The other 3 tests passed on the baseline. On the head, all 6 pass.

**Mutation campaign** (each file restored byte for byte, hash-verified; `git status` unchanged afterwards):

| Id | Planted defect | Verdict | Killed by |
|---|---|---|---|
| A1 | gate uses the primary row only | KILLED | the 791381s gate and API tests |
| A2 | an extra point opens on course assignment alone | KILLED | the 791381s gate and API tests |
| A3 | the course id is compared case-insensitively | KILLED | the registry test |
| A4 | every point is checked under the primary course | KILLED | the 791381s gate and API tests |
| A5 | T24 (ACL) is released one unit early | KILLED | the registry and gate tests |
| A6 | the cards are rendered among the questions | KILLED | the practice-page render test |
| A7 | a card's module drifts from the API's release module | KILLED | the placement test |

## 13. Phase 8B-1 record — the network-lab contract and its server judge (no UI yet)

**What changed**

- **Content model (`types.ts`, `validation.ts`).**
  - New block: `simulation` / `network-lab` v1. Its config holds:
    - `topology`: public, networkTopology@2;
    - `task`: an intro and one goal per check;
    - `checks`: private;
    - `feedback`: private;
    - `solution`: private, the authored proof.
  - The validator checks the structure (`invalid-network-lab`):
    - version 1, a config allowlist, a task intro;
    - goals equal to the checks, same ids in the same order;
    - a solution and well-formed feedback;
    - never a `reveal` and never an authored `serverCheck`.
- **Proof (`src/learning/lab/networkLabProof.ts`).** The real simulator proves each lab: valid topology and key, no free
  credit on the untouched lab, and the solution passes every check. A test applies it to every lab in every course.
  - It stays out of the validator, so the simulator is never pulled into a bundle.
  - The same test requires every lab to carry `studyEligible: false` until the owner decides (§11.3).
- **Eligibility and served body (`eligibility.ts`, `checkIndex.ts`).**
  - The key is `{ kind: "network-lab", topology, checks }`.
  - The `studyEligible: false` opt-out works as for practice blocks.
  - The served body is an **allowlist**: `topology` and `task` plus `serverCheck`. Checks, feedback and solution never
    leave the server.
- **Server judge (`api/src/lib/learning-lab.js`).**
  - `evaluateNetworkLab` runs the same `evaluateSmartSim` as the exam grader, all-or-nothing.
  - Only the learner's `actions` are read; the state is re-derived by replay.
  - `parts` holds one boolean per check.
  - A broken topology or key is `unavailable`.
- **Practice route (`api/src/functions/learning-study.js`, `learning-check.js`, `learning-study.js`).**
  - A lab is judged on the existing `POST /api/learning-study/{course}/attempt`.
  - `unavailable` returns **503 retryable and writes nothing**: never a "wrong" (AGENTS.md §10).
  - An answer over 256 KB returns 413.
- **Defect fixed (fail-first).** The route never returned the per-part verdict (`parts`) that the server computes for the
  structured kinds of Phase 3. On a served page, a wrong wordBank / matching / classify answer showed no per-part ✓ / ✕ and
  no «الصحيح: …» beside the wrong parts.
  - `api/tests/learning-study-parts.test.js` fails on `9eb9a46b`: `expected undefined to deeply equal { b1: true, b2: false, … }`.
  - It passes on the head.

**Mutation campaign** (each file restored byte for byte, hash-verified):

| Id | Planted defect | Verdict |
|---|---|---|
| B1 | whole lab config served (key leak) | KILLED |
| B2 | the judge trusts a client `correct: true` | KILLED |
| B3 | any check passes → right | KILLED |
| B4 | broken key judged wrong instead of unavailable | KILLED |
| B5 | `parts` carry values | KILLED |
| B6 | checkResponse drops `unavailable` | KILLED |
| B7 | the route drops `parts` | KILLED |
| B8 | no size limit | KILLED |
| B9 | a lab ignores its opt-out | KILLED |
| B10 | the route ignores `unavailable` | KILLED |
| B11 | the response's `state` is passed to the evaluator | SURVIVED, then the test was strengthened → KILLED |

B11 survived the first run because the evaluator re-derives the state, so a normal state changes nothing. It is not
equivalent: a junk or over-deep state made a right action list fail. The new test "the response's state is never even read"
kills it.

**Next:** 8B-2 — the lab view (lazy `Net2Workspace`, never `trustedSimPlugins`), the host check seam, the bundle guard, and
the m19 Router-on-a-Stick pilot (`studyEligible: false`).

## 14. Phase 8B-2 record — the network lab in the Reader + the unit 19 pilot

**What changed**

- **Engine (`activities/engine.ts`, `LearningActivityHost.tsx`).**
  - `simulation` / `network-lab` v1 is registered behind an `import()` thunk. The allowlist pins now name sixteen entries.
  - New optional host seam `check` (`ActivityCheck`), passed through untouched. The engine and the renderer never fetch.
- **Lab view (`src/learning/lab/NetworkLabActivity.tsx`, `labConfig.ts`, `lab.css`).**
  - It shows the task, the goals and the real networkTopology@2 student workspace. The workspace is imported directly,
    never the trusted-sim plugin set.
  - The actions live in React state only. The shell's «إعادة تعيين» empties them.
  - «تحقّق من الإعداد» sends `{ kind: "network-lab", actions }` and nothing else.
  - The result shows ✓ / ✕ with words for each goal: hints after a wrong check, the explanation after a right one.
  - A new action clears the verdict.
  - A failed or retryable check says «تعذّر التحقق», never a wrong verdict.
  - Without a seam, the lab is explore-only.
- **Reader (`LearningPageRenderer.tsx`).** The seam is given only to a **served** lab (`serverCheck`) inside a study host.
  It goes through `study.report` to the practice route (8B-1).
- **Pilot (`791381s-m19`, «تدريبات الوحدة»).** «مختبر شبكي: Router on a Stick» uses the booklet's own values: VLAN 10 / 20,
  g0/0.10 / g0/0.20 with `encapsulation dot1Q`, the gateways 192.168.10.254 and 192.168.20.254 /24, the trunk on g0/1, and
  `no shutdown` on g0/0.
  - SW1 starts with the VLANs and access ports of unit 16, so the task is this unit's.
  - Seven goals; the last is PC1 (VLAN 10) ⇄ PC2 (VLAN 20).
  - The simulator proves it: no free credit, the booklet's commands pass 7 / 7, and leaving out `no shutdown` fails both the
    router-port goal and the ping goal.
  - It is marked `studyEligible: false`: checked but not counted, so the study index is unchanged.
- **Bundle guard (`scripts/check-bundle-budget.mjs`).**
  - No simulator signature is allowed in the Reader's first-load graph.
  - A lazy `NetworkLabActivity` chunk must exist, and its static closure must not include `trustedSimPlugins`.
  - Measured: the lab chunk's closure is 10 files, 64.6 KB gzip. The Reader's first load is 39.1 KB (budget 40; it was 38.5).

**Mutation campaign** (each file restored byte for byte, hash-verified):

| Id | Planted defect | Verdict |
|---|---|---|
| C1 | the seam is given to an authored lab | KILLED |
| C2 | a client claim is sent with the actions | KILLED |
| C3 | a verdict survives a new action | KILLED |
| C4 | a failed check is shown as wrong | KILLED |
| C5 | every goal is marked right | KILLED |
| C6 | reset keeps the actions | KILLED |
| C7 | the pilot counts in Strength | KILLED |
| C8 | the pilot's solution drops `no shutdown` | KILLED |
| C9 | a static import of the lab in the Reader | KILLED by the bundle guard: `Net2Workspace … (first Reader load) carries the network simulator` |
