# BRAND-005 / PWA-006 — Tadris+ identity and installable-app branding (design record)

Source: `Problems.pdf` pages 4–5; approved assets `TadrisPlus_Brand_Assets.zip` (owner). Tracker: `docs/tadris-enterprise-problems-tracker.md`.

Brand: **Tadris+** · tagline **التعليم المتكامل** · artwork: open book with a turquoise plus sign on a dark-navy rounded square.
The one source of the visible name is `src/brand.ts` (`BRAND_NAME`, `BRAND_TAGLINE`, `BRAND_TITLE`).

## 1. Final brand asset inventory (`public/pwa/`)

All files are derived from the owner's approved artwork only (no redrawn symbol, no altered plus sign, no new logo).

| File | Size | Kind | Source | Use |
|---|---|---|---|---|
| `favicon-16.png` / `favicon-32.png` / `favicon-48.png` | 16 / 32 / 48 | RGBA tile, transparent corners | `TadrisPlus_icon_original_crop.png` (748²), white corners made transparent, Lanczos resize | browser tab, Windows taskbar / shortcut |
| `icon-192.png` / `icon-512.png` | 192 / 512 | RGBA tile, transparent corners | same | manifest `any`, in-app brand mark (`BrandMark`), push notification icon |
| `icon-maskable-192.png` / `icon-maskable-512.png` | 192 / 512 | opaque, full-bleed navy `#031c40` | `TadrisPlus_maskable_512.png`, artwork re-centred at 72 % (see §3) | manifest `maskable` (Android adaptive icons) |
| `apple-touch-icon.png` | 180 | opaque, full-bleed navy | from the maskable 512 | iOS / iPadOS Add to Home Screen |
| `tadris-logo-480.png` | 480 | RGBA | `TadrisPlus_full_logo.png` resized | full-brand presentation surfaces (reserved; not on the initial graph) |

Weights: 16 px 0.8 KB · 32 px 2.2 KB · 48 px 4.1 KB · 192 px 35 KB · 512 px 205 KB · maskable 14 KB / 67 KB · Apple 12.5 KB.
All PNGs are stripped, maximum-compression, within the existing budgets (`src/brand.10a.test.tsx`, `src/pwa/serviceWorker.6a.test.ts`).

Readability at small sizes was checked by rasterising the 16 / 32 / 48 px files at 4× in Chromium (`scripts/check-brand-pwa-browser.mjs`,
`shots/02-favicons-16-32-48-x4.png`): at 32 and 48 px the book and the plus are clearly recognisable; at 16 px the navy tile with the
white/cyan book silhouette is recognisable but the plus sign reads as a highlight (inherent to a 16 px raster of this artwork — reported, not hidden).

## 2. Surfaces

| Surface | Before | After |
|---|---|---|
| Browser tab title | `ExamBank 791381 — منصة الامتحانات والواجبات` | `Tadris+ — التعليم المتكامل` |
| Favicons | old mark | new set + `?v=tadris1` |
| `theme-color` (status bar / title bar) | `#0f172a` | `#031c40` (the artwork's navy) |
| Login hero | `ExamBank` / `791381`, heading `ExamBank 791381` | `Tadris+` / `التعليم المتكامل`, heading `Tadris+` (form, chips, hero copy unchanged) |
| Session check screen | `ExamBank 791381` | `Tadris+` |
| Teacher sidebar | `ExamBank 791381` | `Tadris+` / `التعليم المتكامل` |
| Student top bar | `ExamBank 2.0` | `Tadris+` — `التعليم المتكامل — بوابة الطالب للتدريب والواجبات` |
| Install card / dialog / manual guidance / push card | `تثبيت ExamBank` … | `تثبيت Tadris+` … |
| Offline page | `ExamBank — …`, `EB` tile | `Tadris+ — …`, `T+` navy tile, tagline line |
| Manifest `name` / `short_name` / `description` | `ExamBank 791381` / `ExamBank` | `Tadris+` / `Tadris+` / `Tadris+ — التعليم المتكامل: …` |
| Apple `apple-mobile-web-app-title` | `ExamBank` | `Tadris+` |
| Exports | `ExamBank-AI-Export`, `ExamBank-Teacher-Analytics.csv` + CSV header | `TadrisPlus-AI-Export`, `TadrisPlus-Teacher-Analytics.csv`, header `Tadris+ - Teacher Analytics` |
| 3D model provenance label | `تعديلات ExamBank` | `تعديلات Tadris+` |
| AI prompt context (analytics, exam-request interpreter) | "…اسمها ExamBank" | "…اسمها Tadris+" |

**Not renamed (by design):** repository, API routes, blob paths, document keys, exam / question ids, auth claims and session
contexts (`ExamBank791381:student-session:v2`, builder-session context), environment variables, Azure resources, storage keys
(`examBankBuilderToken`, `examBankPwaInstallCardDismissedAt`, `ExamBank791381-Recovery-V1`), the service-worker cache prefix
(`examBank-pwa-`), the `glbWriter` generator string, feature names («بنك الأسئلة», «بنك الامتحانات»), and code comments.
Existing students, teachers, exams, assignments, grades and sessions are untouched.

## 3. Maskable safe area (verified, with one trade-off)

The supplied `TadrisPlus_maskable_512.png` is full-bleed navy with the artwork spanning 389 px of 512 (76 %). Measured against the
W3C maskable safe zone (a circle of radius 40 % = 205 px), **25 % of its artwork pixels (14 570 of 58 085) fall outside the circle**:
on a circular launcher (Pixel, many Samsung themes) the book's lower corners would be clipped. The shipped maskable icons therefore
re-centre the same artwork at **72 %** on the same navy — the largest scale at which **0 pixels** fall outside the circle at 512 px *and*
at 192 px after resampling (`src/brand.tadris.test.ts` decodes the PNGs and counts; it fails on any regression). The content box is
276 px, inside the central 80 % square as well. Visual trade-off: the artwork's own rounded-tile edge is faintly visible inside the
navy circle (`shots/03-icon-sheet-any-maskable-circle-apple.png`); the owner may prefer the supplied full-bleed file (identical
look on square masks, clipped on circles) — swap the two files and lower the test's expectation if so.

## 4. PWA manifest migration analysis (existing ExamBank installations)

| Field | Decision | Why |
|---|---|---|
| `id` `./`, `start_url` `./`, `scope` `./`, `display`, `orientation`, `lang`, `dir` | **unchanged** | the browser identifies an installed app by `id` (resolved against `start_url`); changing it would create a *second* app and strand the old one. |
| `name`, `short_name`, `description`, `theme_color`, `background_color` | changed | pure presentation; Chromium's manifest-update pipeline applies name / colour changes on the next launch (desktop) or the next check (Android, within ~1 day, or at launch after a cold start). |
| icon `src` | same paths **+ `?v=tadris1`** | a changed URL forces every browser and launcher to re-fetch; Chromium also compares icon bitmaps, but a URL change is the deterministic path (and SWA / browser caches of the old files are bypassed). |
| `sw.js` | offline cache `offline-v2` | the offline page changed; `activate` deletes the worker's own `offline-v1` and nothing else; app code is still never cached by the worker. |

Expected behaviour per platform (what the owner's checklist should observe):

- **Windows / macOS Chrome & Edge (installed app):** name, icon, title-bar colour update on the next launch after the new manifest is
  fetched (Chrome checks the manifest when the app opens; Edge likewise). The Start-menu / taskbar shortcut is regenerated by the
  browser — on Windows the taskbar pin may keep the old glyph until the user unpins/re-pins (OS icon cache). No reinstall needed.
- **Android Chrome (WebAPK):** Chrome re-mints the WebAPK when the manifest changes (name / icons / colours), typically within a day or
  at the next launch; the home-screen icon and name update automatically. No duplicate app because `id` is unchanged. Samsung
  Internet / Firefox shortcuts update on the next "Add to Home screen"; existing shortcuts keep the cached icon until re-added.
- **iOS / iPadOS Safari:** Home-screen bookmarks are frozen at add time (icon + title); they never update. Students who installed
  «ExamBank» keep that icon and name until they remove it and re-add (**documented in the in-app guidance**; the new
  `apple-mobile-web-app-title` and `apple-touch-icon` apply to every new addition).
- **Browser tab favicon:** picked up on the next load (versioned URL); a hard refresh clears a stale tab icon.
- **Push notifications:** the notification icon is `pwa/icon-192.png` (same path, new file) — the worker fetches it fresh.

Nothing is deleted or cleared: no cache other than the worker's own offline page is touched; localStorage / sessionStorage /
drafts / sessions remain. Installation stays user-controlled: the existing optional card (`InstallAppCard`, 7-day «ليس الآن»
dismissal, no repeated prompts, nothing during an exam) is unchanged apart from the name.

## 5. Verification

- Unit / contract: `src/brand.tadris.test.ts` (identity, surfaces, PNG kinds / sizes / corners, **decoded maskable safe-area count**,
  manifest identity, versioned URLs, SW cache version); updated pins in `src/brand.10a.test.tsx`, `src/pwa/serviceWorker.6a.test.ts`,
  `src/pwa/InstallAppCard.6a.test.tsx`, `src/shell/StudentShell.test.tsx`, `src/StudentPortal.ux7a.test.tsx`, `src/TeacherDashboard.test.tsx`.
- Real Chromium on the **production build**: `scripts/check-brand-pwa-browser.mjs` — manifest 200 `application/manifest+json`,
  identity fields, every icon URL (manifest, favicons, Apple) 200 `image/png` and decoded at its declared size, tab title, theme
  colour, Apple title, login heading / brand row / brand image, no «ExamBank» text, `sw.js` served, offline page rebranded,
  phone 390 px without overflow; favicon strip and icon sheet (any / maskable-in-circle / Apple) rasterised for the evidence.
- **Device coverage honestly stated:** the container has no Windows desktop, Android or iOS device. Installation UI, launcher icon,
  app name and startup appearance on those platforms were **not** observed in this session. Manual checklist for the owner:

  **Windows (Chrome / Edge):** open the preview URL → address-bar install icon shows «Tadris+» → install → Start menu entry «Tadris+» with
  the book-and-plus icon → launches at `/` (login) with navy title bar → login and open an exam. Existing install: launch the old
  «ExamBank 791381» app twice; after the second launch the window title / name read Tadris+; re-pin the taskbar shortcut if its glyph is stale.

  **Android (Chrome):** menu → «Install app» / «Add to Home screen» → sheet shows «Tadris+» with the icon → home-screen icon round / squircle
  shows the book without clipping → opens standalone at `/` → student login persists. Existing WebAPK: open the app, wait for the update
  (≤ 1 day) or reinstall; no duplicate icon appears.

  **iPhone / iPad (Safari):** Share → «Add to Home Screen» → title prefilled «Tadris+» → icon is the navy square with the book → opens
  full-screen with the default status bar → login works. Existing bookmark: remove and re-add (iOS never updates installed icons).
