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
| **Conversion error (fidelity defect):** the Reader shows «HTTP = HTTPS + طبقة أمان»; the printed booklet (PDF p. 39, verified on a 150-dpi render) prints HTTPS = HTTP + طبقة أمان. | `791381s-m13-l01-p02`, block `m13-l01-p02-c2` | Owner decision pending: a fidelity hotfix makes the Reader match the print again and re-writes that one page's lock entry. No exercise uses this sentence until then. |
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
| **7** | **«الملخّص الشامل»** (m31–m36) | An interactive twin **under** each review table (dropdown / classify), reusing 791381-m28's 17 worksheets where they match the booklet; a cumulative review set per unit. | idem |
| **8** | **New simulations** | VLAN + trunk, subnetting calculator, ACL rule evaluator, DHCP DORA, OSPF / EIGRP path choice — registry-backed, reduced-motion safe. Can run in parallel with 5–7. | Each activity: allowlist entry + fallback + tests. |
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
