// Phase 21E.2 — PART=builder of scripts/capture-visual-gate-21e2.mjs (certification only; never shipped). Opens a saved structured
// exam in the REAL builder overlay and measures the 21E.2 builder contract at one viewport:
//   T  toolbar: at most 8 visible actions; identity + actions rows; height; sticky only where there is room (≥ 768 × 600);
//   B  dialog: the builder overlay is role=dialog + aria-modal, named by the toolbar heading; focus moves inside when it opens;
//   M  «المزيد» by keyboard: Enter opens, ArrowDown moves, Escape closes and returns focus to the trigger;
//      K1: focus is inside the panel right after Enter (before any arrow key) and after a pointer click on «إضافة أسئلة» — with
//      reduced motion AND with motion on (the real CSS transitions); the panel lives inside the builder dialog (aria-modal) and
//      paints on top of it; with a blueprint + policy exam the long «المزيد» list stays inside the viewport, scrolls internally
//      (the menu stays open, the page does not scroll) and every item / the keyboard-focused item is visible;
//   E  Escape on the builder with an unsaved edit asks the unsaved-changes guard; «البقاء» keeps the edit and the builder;
//   F1 a deletion's toast never overlaps the toolbar's controls; after scrolling, a non-sticky toolbar no longer covers content.
//   K2 the overlay as a modal surface: Escape in the explorer's search box clears it and keeps the builder (N-1); a summary entry
//      reveals its target 12 px below the stuck toolbar, or 12 px below the scroller's top where the toolbar is static (R-1);
//      closing the builder never leaves focus on <body> (B-3); opening it from the import wizard keeps focus inside it (B-4).
//   K3 the summary's section entry focuses the section's NAMED issue list with a visible focus outline, by keyboard and by pointer
//      (R-1 / R-2 / R-3); the summary
//      toggle is named by its counts, its chevron is aria-hidden and points down (open) / to the inline end (closed, RTL: left),
//      and the save-state status hides its glyph from assistive technology (S-1).
//   RF2 Review Fix 2 on a saved exam whose questions show issues (E11): a summary entry focuses ITS issue instance — «الزوج 3» the
//      third pair, «الزوج 1» the first (I-1) — and a multiple-choice question without options (marks 0) focuses «+ إضافة خيار» in
//      the frame showing the issue, never the invalid marks; the marks' own entry still focuses the marks (I-2).
//   RF3 Review Fix 3 (owner-listed): a compound PART's entry focuses that part's own control, never the card's invalid marks; parts
//      that cannot be told apart lead to the card's named issue list (I-1, E12); after a MOUSE click on an entry the focused element
//      shows a visible focus outline (style ≠ none, ≥ 2 px, a non-transparent colour) — inputs, buttons, named lists (I-2); the save
//      status speaks the save-label table: one sentence per state change, no glyph, «جارٍ الحفظ…» like the draft button (I-4).
//   RF3 audit / owner observations: the bulk-action bar and the inline explorer stick BELOW the stuck toolbar — every control
//      hit-tests to itself, by mouse and by Tab; a revealed section clears the bar (A-01); where the toolbar is static (200 %, phone)
//      a deletion's neighbour / a Ctrl+Y target is revealed, never focused off-screen (A-02); closing the explorer's dialog after a
//      zoom never leaves focus on <body> and «المزيد» opens again (O-1); the explorer shows a matching question by its words (O-2).
// On a BEFORE build the 21E.2 toolbar does not exist: each probe records what it finds ("absent") instead of throwing.

export async function runBuilder({ vp: [name, viewport, touch, dsf], newPage, origin, record, check, overflow }) {
  const id = "builder-" + name;
  const { ctx, page, shot } = await newPage(id, viewport, touch, dsf);
  const rec = record.viewports[id] = {};
  try {
    await page.goto(origin + "/", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /الامتحانات المحفوظة/ }).first().click();
    await page.locator(".saved-exams-panel").getByRole("button", { name: /فتح وتعديل/ }).first().click();
    await page.locator("#sb-q-s2q2").waitFor({ timeout: 20000 }); await page.waitForTimeout(500);
    await shot("01-builder-top");

    rec.toolbar = await page.evaluate(() => {
      const bar = document.querySelector(".sb-toolbar");
      const visible = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden"; };
      const buttons = bar ? [...bar.querySelectorAll("button")].filter(visible) : [];
      const sb = document.querySelector(".structured-builder-overlay");
      const named = sb && sb.getAttribute("aria-labelledby") ? document.getElementById(sb.getAttribute("aria-labelledby"))?.textContent : null;
      return { buttons: buttons.length, names: buttons.map(b => (b.getAttribute("aria-label") || b.textContent || "").trim()), height: bar ? Math.round(bar.getBoundingClientRect().height) : null,
        position: bar ? getComputedStyle(bar).position : null, role: sb?.getAttribute("role") || null, modal: sb?.getAttribute("aria-modal") || null, name: named || null,
        focusInside: !!(sb && sb.contains(document.activeElement)), emojiLabels: buttons.filter(b => /[\u{1F300}-\u{1FAFF}☀-➿]/u.test(b.textContent || "")).length };
    });
    const t = rec.toolbar, roomy = viewport.width >= 768 && viewport.height >= 600;
    check(id, "T-1 at most 8 visible toolbar actions", t.buttons > 0 && t.buttons <= 8, t.buttons + ": " + t.names.join(" | "));
    check(id, "T-2 no emoji-only / emoji-prefixed toolbar labels", t.emojiLabels === 0, String(t.emojiLabels));
    check(id, "T-3 sticky only where there is room (≥ 768 × 600)", roomy ? t.position === "sticky" : t.position !== "sticky", t.position + " · height " + t.height);
    check(id, "B-1 builder is a named modal dialog", t.role === "dialog" && t.modal === "true" && !!t.name, JSON.stringify([t.role, t.modal, t.name]));
    check(id, "B-2 focus moves inside the builder when it opens", t.focusInside, String(t.focusInside));

    // M — «المزيد» by keyboard
    const more = page.getByRole("button", { name: "المزيد من أدوات الامتحان" });
    if (await more.count()) {
      await more.focus(); await page.keyboard.press("Enter");
      rec.menuOnEnter = await page.evaluate(menuProbe);                   // K1 — sampled at once: no wait, no arrow key yet
      check(id, "M-0 «المزيد» (reduced motion): focus is inside the open panel right after Enter (before any arrow key)", rec.menuOnEnter.open && rec.menuOnEnter.focusInPanel, JSON.stringify(rec.menuOnEnter));
      check(id, "M-3 the open panel lives inside the builder dialog (aria-modal) and paints on top of it", rec.menuOnEnter.open && rec.menuOnEnter.inModal && rec.menuOnEnter.onTop, JSON.stringify({ host: rec.menuOnEnter.host, onTop: rec.menuOnEnter.onTop }));
      await page.waitForTimeout(200);
      const opened = await more.getAttribute("aria-expanded");
      await shot("02-more-menu");
      await page.keyboard.press("ArrowDown"); await page.waitForTimeout(100);
      const inMenu = await page.evaluate(() => !!document.activeElement?.closest(".eb-menu-panel"));
      await page.keyboard.press("Escape"); await page.waitForTimeout(200);
      const back = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") || "");
      const still = await page.locator(".sb-builder").count();
      rec.menu = { opened, inMenu, back, builderStillOpen: still };
      check(id, "M-1 «المزيد»: Enter opens, arrows move, Escape closes to its trigger (builder stays)", opened === "true" && inMenu && back === "المزيد من أدوات الامتحان" && still === 1, JSON.stringify(rec.menu));
    } else { rec.menu = "absent"; check(id, "M-1 «المزيد» menu", false, "absent"); }
    // K1 — the pointer path: one click on «إضافة أسئلة» puts focus inside its panel (then Escape back to the trigger).
    const add = page.getByRole("button", { name: "إضافة أسئلة" });
    if (await add.count()) {
      await add.click();
      rec.addOnClick = await page.evaluate(menuProbe);
      await page.keyboard.press("Escape"); await page.waitForTimeout(150);
      check(id, "M-0b «إضافة أسئلة» (reduced motion): a pointer click opens the panel with focus inside it", rec.addOnClick.open && rec.addOnClick.focusInPanel, JSON.stringify(rec.addOnClick));
    } else { rec.addOnClick = "absent"; check(id, "M-0b «إضافة أسئلة» menu", false, "absent"); }

    // E — Escape with an unsaved edit → the guard; staying keeps the edit
    const title = page.locator(".sb-exam-title");
    await title.fill("اختبار الوحدة الثانية — معدّل"); await page.waitForTimeout(150);
    await page.locator("#sb-q-s1q1").focus(); await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    const guard = page.getByRole("dialog", { name: /تغييرات غير محفوظة/ });
    const guardShown = await guard.count();
    if (guardShown) { await shot("03-escape-guard"); await page.keyboard.press("Escape"); await page.waitForTimeout(300); }
    rec.escape = { guardShown, builderStillOpen: await page.locator(".sb-builder").count(), title: await title.inputValue().catch(() => "") };
    check(id, "E-1 Escape asks the unsaved-changes guard; keeping returns to the builder with the edit", guardShown === 1 && rec.escape.builderStillOpen === 1 && /معدّل/.test(rec.escape.title), JSON.stringify(rec.escape));

    // F1 — toast vs toolbar; a non-sticky toolbar scrolls away
    const del = page.locator("#sb-q-s1q2").getByRole("button", { name: "حذف", exact: true });
    await del.focus(); await page.keyboard.press("Enter"); await page.waitForTimeout(400);
    rec.toast = await page.evaluate(() => {
      const toast = document.querySelector(".eb-toast"), bar = document.querySelector(".sb-toolbar");
      if (!toast || !bar) return { toast: !!toast };
      const tr = toast.getBoundingClientRect();
      const hidden = [...bar.querySelectorAll("button, input")].filter(c => { const r = c.getBoundingClientRect(); return r.width && r.left < tr.right && r.right > tr.left && r.top < tr.bottom && r.bottom > tr.top; }).map(c => (c.getAttribute("aria-label") || c.textContent || "").trim());
      return { toast: true, covered: hidden };
    });
    await shot("04-after-delete-toast");
    check(id, "F1-1 the toast never covers a toolbar control", rec.toast.toast && rec.toast.covered.length === 0, JSON.stringify(rec.toast));
    await page.evaluate(() => { const s = document.querySelector(".structured-builder-overlay"); s.scrollTop = 600; }); await page.waitForTimeout(300);
    rec.scrolled = await page.evaluate(() => { const b = document.querySelector(".sb-toolbar").getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), vh: innerHeight }; });
    await shot("05-scrolled");
    check(id, "F1-2 scrolled: the toolbar covers " + (roomy ? "at most its sticky band" : "nothing (scrolled away)"), roomy ? rec.scrolled.bottom <= rec.scrolled.vh * 0.45 : rec.scrolled.bottom <= 0, JSON.stringify(rec.scrolled));
    rec.overflow = await overflow(page);
    check(id, "V-1 no horizontal overflow", rec.overflow.scrollWidth <= rec.overflow.clientWidth, JSON.stringify(rec.overflow));
  } catch (e) { rec.error = String(e).slice(0, 300); check(id, "builder run", false, rec.error); }
  await ctx.close();
  await runBlueprintMenu({ vp: [name, viewport, touch, dsf], newPage, origin, record, check });
  await runModalSurface({ vp: [name, viewport, touch, dsf], newPage, origin, record, check });
  await runInstanceFocus({ vp: [name, viewport, touch, dsf], newPage, origin, record, check });
  await runPartFocus({ vp: [name, viewport, touch, dsf], newPage, origin, record, check });
  await runSaveStatus({ vp: [name, viewport, touch, dsf], newPage, origin, record, check, overflow });
  await runStickyLayers({ vp: [name, viewport, touch, dsf], newPage, origin, record, check });
  await runRevealStatic({ vp: [name, viewport, touch, dsf], newPage, origin, record, check });
  await runExplorerZoom({ vp: [name, viewport, touch, dsf], newPage, origin, record, check });
  await runExplorerPreview({ vp: [name, viewport, touch, dsf], newPage, origin, record, check });
}

// K1 — what the open ActionMenu looks like at this instant (page context): open? focus inside? host = the aria-modal builder
// dialog? does a hit test at the centre of its first item land on the panel (paints above the overlay's content)?
function menuProbe() {
  const panel = document.querySelector(".eb-menu-panel"), a = document.activeElement;
  if (!panel) return { open: false, active: (a?.getAttribute("aria-label") || a?.textContent || a?.tagName || "").trim().slice(0, 40) };
  const modal = document.querySelector(".structured-builder-overlay");
  const first = panel.querySelector("button, input");
  const r = first ? first.getBoundingClientRect() : null;
  const hit = r ? document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 10)) : null;
  return { open: true, focusInPanel: !!a && panel.contains(a), active: (a?.getAttribute("aria-label") || a?.textContent || a?.tagName || "").trim().slice(0, 40),
    host: panel.parentElement === document.body ? "body" : (panel.parentElement?.className || panel.parentElement?.tagName || "?"), inModal: !!modal && modal.contains(panel), onTop: !!hit && panel.contains(hit) };
}

// K1 — runs with motion ON (no reduced-motion preference), so the app's real transitions apply (App.css: button { transition:
// .18s ease } = transition-property all, which also transitions a control's INHERITED visibility when its panel is revealed).
//   A-F1: Enter / Space / a pointer click open a menu with focus already inside the panel (sampled at once, before any arrow key).
//   A-F2: a blueprint + policy exam gives «المزيد» its longest list. At every viewport (the 640 × 450 @2 = 200 % zoom case is the
//         one that used to run off-screen): the panel stays inside the viewport; every item is inside the viewport or can be
//         scrolled into view INSIDE the panel (the menu stays open, the page does not scroll); the keyboard-focused item is visible.
async function runBlueprintMenu({ vp: [name, viewport, touch, dsf], newPage, origin, record, check }) {
  const id = "builder-bp-" + name;
  const { ctx, page, shot } = await newPage(id, viewport, touch, dsf, "no-preference");
  const rec = record.viewports[id] = {};
  try {
    await page.goto(origin + "/", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /الامتحانات المحفوظة/ }).first().click();
    await page.locator(".saved-exam-item", { hasText: "اختبار بمخطط وسياسة جودة" }).getByRole("button", { name: /فتح وتعديل/ }).click();
    await page.locator("#sb-q-s2q2").waitFor({ timeout: 20000 }); await page.waitForTimeout(500);
    const more = page.getByRole("button", { name: "المزيد من أدوات الامتحان" });
    if (!(await more.count())) { rec.menu = "absent"; check(id, "M-2 «المزيد» with a blueprint", false, "absent"); await ctx.close(); return; }
    // A-F1 with motion on: Space, then a pointer click on «إضافة أسئلة», each sampled at once and closed with Escape.
    await more.focus(); await page.keyboard.press("Space");
    rec.onSpace = await page.evaluate(menuProbe);
    await page.keyboard.press("Escape"); await page.waitForTimeout(250);
    const add = page.getByRole("button", { name: "إضافة أسئلة" });
    if (await add.count()) { await add.click(); rec.addOnClick = await page.evaluate(menuProbe); await page.keyboard.press("Escape"); await page.waitForTimeout(250); }
    else rec.addOnClick = { open: false, absent: true };
    await more.focus(); await page.keyboard.press("Enter");
    rec.onEnter = await page.evaluate(menuProbe);
    check(id, "M-0m «المزيد» (motion on): focus is inside the open panel right after Enter (before any arrow key)", rec.onEnter.open && rec.onEnter.focusInPanel, JSON.stringify(rec.onEnter));
    check(id, "M-0n motion on: Space on «المزيد» and a pointer click on «إضافة أسئلة» open with focus inside the panel", rec.onSpace.open && rec.onSpace.focusInPanel && rec.addOnClick.open && rec.addOnClick.focusInPanel, JSON.stringify({ space: rec.onSpace, click: rec.addOnClick }));
    await page.waitForTimeout(250);
    rec.geometry = await page.evaluate(() => {
      const p = document.querySelector(".eb-menu-panel"), t = document.querySelector('[aria-label="المزيد من أدوات الامتحان"]');
      if (!p) return { open: false };
      const r = p.getBoundingClientRect(), tr = t.getBoundingClientRect();
      return { open: true, vh: innerHeight, top: Math.round(r.top), bottom: Math.round(r.bottom), triggerTop: Math.round(tr.top), triggerBottom: Math.round(tr.bottom),
        clientHeight: p.clientHeight, scrollHeight: p.scrollHeight, scrollable: p.scrollHeight > p.clientHeight + 1 && getComputedStyle(p).overflowY !== "visible",
        items: [...p.querySelectorAll("button")].map(b => (b.querySelector(".sb-menu-label")?.textContent || b.textContent || "").trim()) };
    });
    await shot("01-more-menu-blueprint");
    // Every item: brought into view INSIDE the panel (as keyboard focus would) — the menu must stay open and the item be fully visible.
    rec.items = await page.evaluate(async () => {
      const frames = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
      const overlay = document.querySelector(".structured-builder-overlay"), pageScroll = [scrollY, overlay ? overlay.scrollTop : 0];
      const out = [];
      const n = document.querySelector(".eb-menu-panel")?.querySelectorAll("button").length || 0;
      for (let i = 0; i < n; i++) {
        const p = document.querySelector(".eb-menu-panel");
        if (!p) { out.push({ i, open: false }); break; }
        const b = p.querySelectorAll("button")[i];
        b.scrollIntoView({ block: "nearest", inline: "nearest" }); await frames();
        const still = document.querySelector(".eb-menu-panel");
        if (!still) { out.push({ i, open: false }); break; }
        const r = b.getBoundingClientRect(), pr = still.getBoundingClientRect();
        out.push({ i, open: true, top: Math.round(r.top), bottom: Math.round(r.bottom), visible: r.top >= -0.5 && r.bottom <= innerHeight + 0.5 && r.top >= pr.top - 0.5 && r.bottom <= pr.bottom + 0.5 });
      }
      return { count: n, results: out, pageScrolled: scrollY !== pageScroll[0] || (overlay ? overlay.scrollTop : 0) !== pageScroll[1] };
    });
    // Keyboard: ArrowUp from the first item wraps to the end of the list — the focused item must be visible.
    const stillOpen = await page.locator(".eb-menu-panel").count();
    if (!stillOpen) { await more.focus(); await page.keyboard.press("Enter"); await page.waitForTimeout(250); }
    await page.evaluate(() => { const p = document.querySelector(".eb-menu-panel"); if (p) p.scrollTop = 0; const f = p?.querySelector("button"); if (f) f.focus({ preventScroll: true }); });
    await page.waitForTimeout(100);
    await page.keyboard.press("ArrowUp"); await page.waitForTimeout(250);
    rec.focused = await page.evaluate(() => {
      const p = document.querySelector(".eb-menu-panel"), a = document.activeElement;
      if (!p) return { open: false };
      const r = a.getBoundingClientRect(), pr = p.getBoundingClientRect();
      return { open: true, inPanel: p.contains(a), label: (a.textContent || "").trim().slice(0, 40), top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight,
        visible: r.top >= -0.5 && r.bottom <= innerHeight + 0.5 && r.top >= pr.top - 0.5 && r.bottom <= pr.bottom + 0.5 };
    });
    await shot("02-more-menu-blueprint-focus-last");
    await page.keyboard.press("Escape"); await page.waitForTimeout(150);
    const g = rec.geometry, it = rec.items;
    check(id, "M-2a blueprint «المزيد»: the open panel lies inside the viewport", g.open && g.top >= 0 && g.bottom <= g.vh, JSON.stringify({ top: g.top, bottom: g.bottom, vh: g.vh, trigger: [g.triggerTop, g.triggerBottom], items: g.items && g.items.length, scrollable: g.scrollable }));
    check(id, "M-2b blueprint «المزيد»: every item is visible or scrolls into view inside the panel; the menu stays open; the page does not scroll", it.count >= 9 && it.results.length === it.count && it.results.every(x => x.open && x.visible) && !it.pageScrolled,
      JSON.stringify({ count: it.count, failing: it.results.filter(x => !x.open || !x.visible), pageScrolled: it.pageScrolled, labels: g.items }));
    check(id, "M-2c blueprint «المزيد»: the keyboard-focused item (ArrowUp from the first wraps to the end) is visible and the menu stays open", rec.focused.open && rec.focused.inPanel && rec.focused.visible, JSON.stringify(rec.focused));
  } catch (e) { rec.error = String(e).slice(0, 300); check(id, "builder blueprint-menu run", false, rec.error); }
  await ctx.close();
}

// K2 — the builder overlay as a modal surface (reduced motion: every scroll is instant, so positions are final when measured).
//   N-1 (C-F1, where the explorer is inline: > 900 px): Escape typed in «بحث في الامتحان» clears the search (the browser's own
//       behaviour) and keeps the builder — no exit, no unsaved-changes guard.
//   R-1 (C-F4): a section-level summary entry (a «سقف للعلامة» section without its maximum) reveals the section with 12 px above it,
//       measured from the stuck toolbar's bottom where the toolbar is sticky, else from the scroller's top (the static toolbar
//       scrolls away and can never cover it). It used to land ~the toolbar's height lower on phones / at 200 %.
//   B-3 (A-F3 2): the builder was opened from a saved-exams row that left the page with its panel; closing it puts focus on a
//       page control, never <body>.
//   B-4 (A-F3 1): with the builder chunk already loaded, «فتح في باني الامتحان» at the end of the import wizard opens the builder
//       and closes the wizard in one update; focus must end inside the builder dialog, not on «استيراد امتحان منظّم» behind it.
const IMPORT_EXAM = { schemaVersion: 2, examId: "IMP1", title: "امتحان مستورد", status: "draft", metadata: {},
  sections: [{ id: "i1", title: "القسم المستورد", gradingPolicy: "all", stimuli: {}, instructions: "",
    questions: [1, 2].map(n => ({ examQuestionId: "i1q" + n, presentationType: "shortAnswer", text: "سؤال مستورد " + n, marks: 2, answer: { text: "-" } })) }] };
const activeProbe = () => {
  const a = document.activeElement, o = document.querySelector(".structured-builder-overlay");
  return { builderOpen: !!document.querySelector(".sb-builder"), wizardOpen: !!document.querySelector(".smart-import"), body: !a || a === document.body,
    inBuilder: !!o && !!a && o.contains(a), active: (a?.getAttribute("aria-label") || a?.textContent || a?.tagName || "").replace(/\s+/g, " ").trim().slice(0, 50) };
};
async function runModalSurface({ vp: [name, viewport, touch, dsf], newPage, origin, record, check }) {
  const id = "builder-k2-" + name;
  const { ctx, page, shot } = await newPage(id, viewport, touch, dsf);
  const rec = record.viewports[id] = {};
  try {
    await page.goto(origin + "/", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /الامتحانات المحفوظة/ }).first().click();
    await page.locator(".saved-exams-panel").getByRole("button", { name: /فتح وتعديل/ }).first().click();
    await page.locator("#sb-q-s2q2").waitFor({ timeout: 20000 }); await page.waitForTimeout(500);
    const reopen = async () => {
      if (await page.locator(".sb-builder").count()) return;
      await page.getByRole("button", { name: /متابعة تحرير الامتحان المنظّم/ }).click();
      await page.locator("#sb-q-s2q2").waitFor({ timeout: 10000 }); await page.waitForTimeout(300);
    };

    // N-1 — Escape in the explorer's search box (inline explorer only; below 900 px it is a Dialog with its own Escape).
    if (viewport.width > 900) {
      await page.getByRole("button", { name: "المزيد من أدوات الامتحان" }).click();
      await page.locator(".eb-menu-panel").getByRole("button", { name: "مستكشف الأسئلة" }).click();
      const search = page.getByRole("searchbox", { name: "بحث في الامتحان" });
      await search.fill("السؤال 1"); await page.waitForTimeout(150);
      await page.keyboard.press("Escape"); await page.waitForTimeout(400);
      rec.searchEscape = { builderOpen: await page.locator(".sb-builder").count(), guard: await page.getByRole("dialog", { name: /تغييرات غير محفوظة/ }).count(),
        value: (await search.count()) ? await search.inputValue() : null, focus: await page.evaluate(() => document.activeElement?.getAttribute("aria-label") || document.activeElement?.tagName || "") };
      await shot("01-search-escape");
      check(id, "N-1 Escape in «بحث في الامتحان» clears the search and keeps the builder (no exit, no guard)", rec.searchEscape.builderOpen === 1 && rec.searchEscape.guard === 0 && rec.searchEscape.value === "", JSON.stringify(rec.searchEscape));
      if (rec.searchEscape.guard) { await page.keyboard.press("Escape"); await page.waitForTimeout(200); }
      await reopen();
    }

    // R-1 — summary entry → section reveal clearance.
    await page.locator('[data-section-id="s1"] .sb-policy-choices input[type="radio"]').nth(1).check();
    const entry = page.locator(".sb-issues-list .sb-issue-link", { hasText: "القسم 1" }).first();
    await entry.waitFor({ timeout: 5000 });
    await page.evaluate(() => { document.querySelector(".structured-builder-overlay").scrollTop = 0; }); await page.waitForTimeout(200);
    await entry.focus(); await page.keyboard.press("Enter"); await page.waitForTimeout(600);
    rec.reveal = await page.evaluate(() => {
      const s = document.querySelector(".structured-builder-overlay"), bar = document.querySelector(".sb-toolbar"), t = document.querySelector('[data-section-id="s1"]');
      const sr = s.getBoundingClientRect(), br = bar.getBoundingClientRect(), tr = t.getBoundingClientRect();
      const sticky = getComputedStyle(bar).position === "sticky";
      const edge = sticky ? br.bottom : sr.top + (parseFloat(getComputedStyle(s).borderTopWidth) || 0);
      // K3 A-F4 — focus goes to the section's own NAMED issue list (the section element itself has no name).
      const list = [...t.children].find(c => c.classList.contains("sb-section-head"))?.querySelector(":scope > .sb-inline-issues") ?? null;
      return { sticky, toolbarHeight: Math.round(br.height), toolbarBottom: Math.round(br.bottom), scrollerTop: Math.round(sr.top), targetTop: Math.round(tr.top),
        gap: Math.round(tr.top - edge), margin: t.style.scrollMarginBlockStart, scrollTop: Math.round(s.scrollTop), maxScroll: s.scrollHeight - s.clientHeight, focused: !!list && document.activeElement === list };
    });
    await shot("02-summary-reveal");
    const r = rec.reveal, clamped = r.scrollTop <= 0 || r.scrollTop >= r.maxScroll - 1;
    check(id, "R-1 a summary entry reveals its section 12 px below the " + (r.sticky ? "stuck toolbar" : "scroller's top (static toolbar, scrolled away)") + " — not a toolbar height lower",
      !clamped && r.focused && r.gap >= 4 && r.gap <= 24, JSON.stringify({ ...r, clamped }));
    // R-2 (K3 A-F4) — the focused list is named «مشكلات القسم 1» and shows where focus went (a visible outline).
    rec.revealFocus = await page.evaluate(() => {
      const a = document.activeElement, cs = a ? getComputedStyle(a) : null;
      return { role: a?.getAttribute("role") || a?.tagName || "", name: a?.getAttribute("aria-label") || "", inSection: !!a?.closest('[data-section-id="s1"]'),
        outlineStyle: cs?.outlineStyle || "", outlineWidth: cs ? parseFloat(cs.outlineWidth) || 0 : 0 };
    });
    const f = rec.revealFocus;
    check(id, "R-2 the section entry focuses the section's named issue list «مشكلات القسم 1», with a visible focus outline",
      f.role === "group" && f.name === "مشكلات القسم 1" && f.inSection && f.outlineStyle !== "none" && f.outlineWidth > 0, JSON.stringify(f));

    // S-1 (K3 A-F7) — glyphs are shown, never spoken: the summary toggle and the save-state status.
    const glyphProbe = () => {
      const spoken = el => { const c = el.cloneNode(true); c.querySelectorAll('[aria-hidden="true"]').forEach(n => n.remove()); return (c.textContent || "").replace(/\s+/g, " ").trim(); };
      const head = document.querySelector(".sb-issues-summary .sb-issues-head"), chip = document.querySelector(".sb-save-state");
      const out = { head: !!head, expanded: head?.getAttribute("aria-expanded") ?? null, spoken: head ? spoken(head) : "", chipText: chip?.textContent ?? null, chipSpoken: chip ? spoken(chip) : null };
      const svg = head?.querySelector("svg.eb-disclosure-chevron");
      if (!svg) return { ...out, chevron: false };
      const t = getComputedStyle(svg).transform, m = new DOMMatrixReadOnly(t === "none" ? undefined : t);
      // Where the icon's own "down" (0, 1) points on screen now.
      return { ...out, chevron: true, hidden: svg.getAttribute("aria-hidden"), points: m.c < -0.5 ? "left" : m.c > 0.5 ? "right" : m.d > 0.5 ? "down" : "up" };
    };
    const head = page.locator(".sb-issues-summary .sb-issues-head");
    await page.evaluate(() => { document.querySelector(".structured-builder-overlay").scrollTop = 0; }); await page.waitForTimeout(200);
    rec.glyphOpen = await page.evaluate(glyphProbe);
    if (rec.glyphOpen.head) { await head.focus(); await page.keyboard.press("Enter"); await page.waitForTimeout(300); }
    rec.glyphClosed = await page.evaluate(glyphProbe);
    await shot("02b-summary-collapsed");
    if (rec.glyphOpen.head) { await head.focus(); await page.keyboard.press("Enter"); await page.waitForTimeout(300); }
    // R-3 (K3 A-F4) — the same entry by POINTER: programmatic focus after a mouse click does not match :focus-visible, so the list
    // must show its own focus outline (like a focused card) for the teacher to see where the click led.
    await page.evaluate(() => { document.querySelector(".structured-builder-overlay").scrollTop = 0; }); await page.waitForTimeout(200);
    await entry.click(); await page.waitForTimeout(600);
    rec.pointerFocus = await page.evaluate(() => {
      const a = document.activeElement, cs = a ? getComputedStyle(a) : null;
      return { role: a?.getAttribute("role") || a?.tagName || "", name: a?.getAttribute("aria-label") || "", focusVisible: !!a?.matches(":focus-visible"),
        outlineStyle: cs?.outlineStyle || "", outlineWidth: cs ? parseFloat(cs.outlineWidth) || 0 : 0 };
    });
    const pf = rec.pointerFocus;
    check(id, "R-3 a POINTER click on the section entry focuses «مشكلات القسم 1» with a visible focus outline (not only :focus-visible)",
      pf.role === "group" && pf.name === "مشكلات القسم 1" && pf.outlineStyle !== "none" && pf.outlineWidth > 0, JSON.stringify(pf));
    const go = rec.glyphOpen, gc = rec.glyphClosed, GLYPH = /[▾▸◂▴▹◃▶◀✓●⏳↺]/u;
    check(id, "S-1 the issue summary toggle is named by its counts (no ▾ / ▸); its aria-hidden chevron points down when open and to the inline end (left, RTL) when closed; the save state's glyph is not spoken",
      go.chevron && gc.chevron && go.hidden === "true" && go.expanded === "true" && gc.expanded === "false" && go.points === "down" && gc.points === "left" &&
      !GLYPH.test(go.spoken) && !GLYPH.test(gc.spoken) && /^\d+ /.test(go.spoken) && go.chipText === "● تغييرات غير محفوظة" && go.chipSpoken === "تغييرات غير محفوظة",
      JSON.stringify({ open: go, closed: gc }));

    // B-3 — close the builder (an unsaved edit exists: «رجوع» → guard → «الخروج دون حفظ»).
    await page.locator(".sb-tb-exit").click();
    const leave = page.getByRole("button", { name: "الخروج دون حفظ" });
    await leave.waitFor({ timeout: 5000 }); await leave.click(); await page.waitForTimeout(500);
    rec.closeFocus = await page.evaluate(activeProbe);
    check(id, "B-3 closing the builder (opened from a saved-exams row that left the page) returns focus to a page control, never <body>", !rec.closeFocus.builderOpen && !rec.closeFocus.body, JSON.stringify(rec.closeFocus));

    // B-4 — import wizard → builder (the builder chunk is loaded by now).
    await page.getByRole("button", { name: /استيراد امتحان منظّم/ }).click();
    const wizard = page.locator(".smart-import");
    await wizard.locator('input[type="file"]').setInputFiles({ name: "exam.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(IMPORT_EXAM)) });
    await wizard.getByRole("button", { name: "الإصلاح الآمن التلقائي" }).click();
    await wizard.getByRole("button", { name: "المتابعة إلى الفحص النهائي" }).click();
    const openBtn = wizard.getByRole("button", { name: /فتح (في باني الامتحان|كمسودة في الباني)/ });
    await openBtn.focus(); await page.keyboard.press("Enter");
    await page.locator(".sb-builder").waitFor({ timeout: 10000 }); await page.waitForTimeout(500);
    rec.importFocus = await page.evaluate(activeProbe);
    await shot("03-import-open");
    check(id, "B-4 «فتح في باني الامتحان» from the import wizard leaves focus inside the builder dialog (not behind it)", rec.importFocus.builderOpen && !rec.importFocus.wizardOpen && rec.importFocus.inBuilder, JSON.stringify(rec.importFocus));
  } catch (e) { rec.error = String(e).slice(0, 300); check(id, "builder modal-surface run", false, rec.error); }
  await ctx.close();
}

// RF2 — Review Fix 2, in real Chromium on E11 (reduced motion: every scroll is instant, so positions are final when measured).
//   I-1 (RF2-1): the matching question has two MATCH_INCOMPLETE_PAIR issues; «الزوج 3» focuses «العنصر 3» (not pair 1, the first
//       frame carrying the code) and «الزوج 1» focuses «العنصر 1» — each inside its card and visible: below the stuck toolbar where
//       it is sticky, inside the viewport.
//   I-2 (RF2-2): the multiple-choice question has no options and marks 0; «… بأقل من خيارين» focuses «+ إضافة خيار» inside the frame
//       that shows MISSING_OPTIONS (it used to fall through to the invalid marks field); «… علامته غير صالحة» still focuses the marks.
const focusProbe = () => {
  const a = document.activeElement, bar = document.querySelector(".sb-toolbar");
  const label = a?.id ? document.querySelector(`label[for="${a.id}"]`)?.textContent : null;
  const r = a?.getBoundingClientRect(), sticky = !!bar && getComputedStyle(bar).position === "sticky", top = sticky ? bar.getBoundingClientRect().bottom : 0;
  const frame = a?.closest("[data-issue-codes]");
  return { name: (label || a?.getAttribute("aria-label") || a?.textContent || a?.tagName || "").replace(/\s+/g, " ").trim().slice(0, 50), tag: a?.tagName || "",
    card: a?.closest(".sb-question")?.id || "", codes: frame?.getAttribute("data-issue-codes") || "", nth: frame?.getAttribute("data-issue-nth") || "",
    visible: !!r && r.height > 0 && r.top >= top - 1 && r.bottom <= window.innerHeight + 1, sticky };
};
async function runInstanceFocus({ vp: [name, viewport, touch, dsf], newPage, origin, record, check }) {
  const id = "builder-rf2-" + name;
  const { ctx, page, shot } = await newPage(id, viewport, touch, dsf);
  const rec = record.viewports[id] = {};
  try {
    await page.goto(origin + "/", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /الامتحانات المحفوظة/ }).first().click();
    await page.locator(".saved-exam-item", { hasText: "اختبار مواضع المشكلات" }).getByRole("button", { name: /فتح وتعديل/ }).click();
    await page.locator("#sb-q-s1c1").waitFor({ timeout: 20000 }); await page.waitForTimeout(500);
    const open = async (text, n) => {
      await page.evaluate(() => { document.querySelector(".structured-builder-overlay").scrollTop = 0; }); await page.waitForTimeout(150);
      const entry = page.locator(".sb-issues-list .sb-issue-link", { hasText: text });
      const count = await entry.count();
      if (count !== 1) return { entry: count };
      await entry.click(); await page.waitForTimeout(600);
      const f = await page.evaluate(focusProbe);
      await shot(n);
      return f;
    };
    rec.pair3 = await open("الزوج 3", "01-pair3");
    rec.pair1 = await open("الزوج 1", "02-pair1");
    const p3 = rec.pair3, p1 = rec.pair1;
    check(id, "I-1 (RF2-1) «الزوج 3» focuses «العنصر 3» and «الزوج 1» focuses «العنصر 1» (each its own pair, visible below the toolbar)",
      p3.name === "العنصر 3" && p3.card === "sb-q-s1m1" && p3.codes === "MATCH_INCOMPLETE_PAIR" && p3.nth === "2" && p3.visible &&
      p1.name === "العنصر 1" && p1.card === "sb-q-s1m1" && p1.nth === "1" && p1.visible, JSON.stringify({ pair3: p3, pair1: p1 }));
    rec.options = await open("بأقل من خيارين", "03-missing-options");
    rec.marks = await open("علامته غير صالحة", "04-marks");
    const o = rec.options, m = rec.marks;
    check(id, "I-2 (RF2-2) a multiple-choice question without options focuses «+ إضافة خيار» in the frame showing MISSING_OPTIONS (not the invalid marks); its marks entry focuses «العلامة»",
      o.name === "+ إضافة خيار" && o.tag === "BUTTON" && o.card === "sb-q-s1c1" && o.codes.split(" ").includes("MISSING_OPTIONS") && o.visible &&
      m.name === "العلامة" && m.tag === "INPUT" && m.card === "sb-q-s1c1" && m.visible, JSON.stringify({ options: o, marks: m }));
  } catch (e) { rec.error = String(e).slice(0, 300); check(id, "builder RF2 instance-focus run", false, rec.error); }
  await ctx.close();
}

// RF3 — Review Fix 3 (owner-listed I-1 / I-2), in real Chromium (reduced motion). Every entry is opened by a MOUSE click: Chromium
// does not match :focus-visible for the script focus that follows a pointer click, so the focused element must draw its own ring.
//   I-1 (E12): s1k1 has marks 0 and a second multiple-choice part without options: its «… بأقل من خيارين» entry focuses «+ إضافة خيار»
//       inside part 2 (`.sb-compound-editor > .sb-part`, the frozen compound@1 markup) — never «العلامة», never part 1's control; s1k2's
//       two parts share the label «س» (cannot be told apart): the entry focuses the card's named issue list «مشكلات السؤال 2».
//   I-2 (E11 + E12): after each mouse click the focused element (a pair input, «+ إضافة خيار», the marks input, a part's button, a named
//       list) has a visible outline: computed outline-style ≠ none, outline-width ≥ 2 px, outline colour not transparent.
const ringProbe = () => {
  const a = document.activeElement, bar = document.querySelector(".sb-toolbar");
  const label = a?.id ? document.querySelector(`label[for="${a.id}"]`)?.textContent : null;
  const r = a?.getBoundingClientRect(), sticky = !!bar && getComputedStyle(bar).position === "sticky", top = sticky ? bar.getBoundingClientRect().bottom : 0;
  const cs = a ? getComputedStyle(a) : null, alpha = c => { const m = /rgba?\(([^)]+)\)/.exec(c || ""); if (!m) return c && c !== "transparent" ? 1 : 0; const v = m[1].split(/[ ,/]+/).filter(Boolean); return v.length > 3 ? parseFloat(v[3]) : 1; };
  const part = a?.closest(".sb-compound-editor > .sb-part");
  return { name: (label || a?.getAttribute("aria-label") || a?.textContent || a?.tagName || "").replace(/\s+/g, " ").trim().slice(0, 50), tag: a?.tagName || "", role: a?.getAttribute("role") || "",
    card: a?.closest(".sb-question")?.id || "", part: part ? [...part.parentElement.children].filter(c => c.classList.contains("sb-part")).indexOf(part) + 1 : 0,
    visible: !!r && r.height > 0 && r.top >= top - 1 && r.bottom <= window.innerHeight + 1, focusVisible: !!a?.matches(":focus-visible"),
    outlineStyle: cs?.outlineStyle || "", outlineWidth: cs ? parseFloat(cs.outlineWidth) || 0 : 0, outlineColor: cs?.outlineColor || "", outlineAlpha: cs ? alpha(cs.outlineColor) : 0 };
};
const ringShown = f => f.outlineStyle !== "none" && f.outlineWidth >= 2 && f.outlineAlpha > 0;
async function runPartFocus({ vp: [name, viewport, touch, dsf], newPage, origin, record, check }) {
  const id = "builder-rf3-" + name;
  const { ctx, page, shot } = await newPage(id, viewport, touch, dsf);
  const rec = record.viewports[id] = {};
  try {
    const load = async (title, firstCard) => {
      await page.goto(origin + "/", { waitUntil: "networkidle" });
      await page.getByRole("button", { name: /الامتحانات المحفوظة/ }).first().click();
      await page.locator(".saved-exam-item", { hasText: title }).getByRole("button", { name: /فتح وتعديل/ }).click();
      await page.locator(firstCard).waitFor({ timeout: 20000 }); await page.waitForTimeout(500);
    };
    const open = async (text, n, nth = 0) => {
      await page.evaluate(() => { document.querySelector(".structured-builder-overlay").scrollTop = 0; }); await page.waitForTimeout(150);
      const entries = page.locator(".sb-issues-list .sb-issue-link", { hasText: text });
      const count = await entries.count();
      if (count <= nth) return { entry: count };
      await entries.nth(nth).click(); await page.waitForTimeout(600);       // a MOUSE click (Playwright's click = pointer events)
      const f = await page.evaluate(ringProbe);
      await shot(n);
      return { ...f, entries: count };
    };
    await load("اختبار مواضع المشكلات", "#sb-q-s1c1");
    rec.pair3 = await open("الزوج 3", "01-pair3-mouse");
    rec.options = await open("بأقل من خيارين", "02-options-mouse");
    rec.marks = await open("علامته غير صالحة", "03-marks-mouse");
    await load("اختبار بنود السؤال المركّب", "#sb-q-s1k1");
    rec.part = await open("«البند 2 من » اختيار من متعدد بأقل من خيارين", "04-compound-part-mouse");
    rec.partMarks = await open("علامته غير صالحة", "05-compound-marks-mouse");
    rec.sameLabel = await open("«البند س من » اختيار من متعدد بأقل من خيارين", "06-compound-same-label-mouse", 1);
    const p = rec.part, pm = rec.partMarks, sl = rec.sameLabel;
    check(id, "RF3 I-1 a compound part's «… بأقل من خيارين» focuses «+ إضافة خيار» in THAT part (part 2), never «العلامة» or part 1; its marks entry focuses «العلامة»; same-label parts lead to «مشكلات السؤال 2»",
      p.name === "+ إضافة خيار" && p.tag === "BUTTON" && p.card === "sb-q-s1k1" && p.part === 2 && p.visible &&
      pm.name === "العلامة" && pm.tag === "INPUT" && pm.card === "sb-q-s1k1" && pm.visible &&
      sl.entries === 2 && sl.role === "group" && sl.name === "مشكلات السؤال 2" && sl.card === "sb-q-s1k2", JSON.stringify({ part: p, marks: pm, sameLabel: sl }));
    // RR3-3 — a row issue inside a part focuses THAT row (s1k3: valid marks, pair 3 of its matching part incomplete).
    rec.row = await open("الزوج 3 في «البند 2 من »", "07-compound-row-mouse");
    rec.rowWhere = await page.evaluate(() => {
      const a = document.activeElement, row = a?.closest(".sb-field-row"), part = a?.closest(".sb-compound-editor > .sb-part");
      return { value: a && "value" in a ? a.value : null, row: row && part ? [...part.querySelectorAll(".sb-field-row")].indexOf(row) + 1 : 0 };
    });
    const rw = rec.row;
    check(id, "RR3-3 a row issue inside a part («الزوج 3 في «البند 2 من …»») focuses THAT pair's empty «العنصر» (part 2, row 3) with a visible ring — never pair 1",
      rw.card === "sb-q-s1k3" && rw.part === 2 && rw.tag === "INPUT" && rec.rowWhere.row === 3 && rec.rowWhere.value === "" && rw.visible && ringShown(rw), JSON.stringify({ row: rw, where: rec.rowWhere }));
    const all = { pair3: rec.pair3, options: rec.options, marks: rec.marks, part: p, partMarks: pm, sameLabel: sl, row: rw };
    check(id, "RF3 I-2 after a MOUSE click on an entry the focused element shows a visible focus outline (style ≠ none, ≥ 2 px, not transparent): pair input, «+ إضافة خيار», «العلامة», a part's button, a named list",
      Object.values(all).every(f => f.tag && ringShown(f)), JSON.stringify(Object.fromEntries(Object.entries(all).map(([k, f]) => [k, { name: f.name, focusVisible: f.focusVisible, style: f.outlineStyle, width: f.outlineWidth, color: f.outlineColor }]))));
  } catch (e) { rec.error = String(e).slice(0, 300); check(id, "builder RF3 part-focus run", false, rec.error); }
  await ctx.close();
}

// RF3 I-4 — one save vocabulary, in real Chromium on E9. The save request is held (page.route) so the in-flight state can be read.
// A MutationObserver records what every live region (role=status / alert / log, aria-live) says, without aria-hidden content, each
// time it changes: edit → «تغييرات غير محفوظة», a MOUSE click on «حفظ مسودة» → «جارٍ الحفظ…» (the status and the button show the same
// string; the button is no live region and sits in none), release → «محفوظ». Exactly those three sentences, from the status only.
async function runSaveStatus({ vp: [name, viewport, touch, dsf], newPage, origin, record, check, overflow }) {
  const id = "builder-rf3s-" + name;
  const { ctx, page, shot } = await newPage(id, viewport, touch, dsf);
  const rec = record.viewports[id] = {};
  let release = () => {};
  try {
    const held = new Promise(r => { release = r; });
    await page.route(u => /\/api\/(saved-exams|save-exam-artifact)$/.test(u.pathname), async route => {
      const req = route.request(), body = req.postData() || "";
      if (req.method() === "POST" && (/save-exam-artifact$/.test(new URL(req.url()).pathname) || /"action"\s*:\s*"save"/.test(body))) await held;
      await route.continue();
    });
    await page.goto(origin + "/", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /الامتحانات المحفوظة/ }).first().click();
    await page.locator(".saved-exam-item", { hasText: "اختبار الوحدة الثانية" }).getByRole("button", { name: /فتح وتعديل/ }).click();
    await page.locator("#sb-q-s2q2").waitFor({ timeout: 20000 }); await page.waitForTimeout(500);
    await page.evaluate(() => {
      const spoken = el => { const c = el.cloneNode(true); c.querySelectorAll('[aria-hidden="true"]').forEach(n => n.remove()); return (c.textContent || "").replace(/\s+/g, " ").trim(); };
      const live = () => [...document.querySelectorAll('[role="status"], [role="alert"], [role="log"], [aria-live]')].filter(n => n.getAttribute("aria-live") !== "off");
      const last = new Map(live().map(r => [r, spoken(r)]));
      window.__rf3Said = [];
      new MutationObserver(() => { for (const r of live()) { const t = spoken(r); if (last.get(r) !== t) { last.set(r, t); if (t) window.__rf3Said.push({ region: r.classList.contains("sb-save-state") ? "status" : (r.className || r.tagName), text: t }); } } })
        .observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
    });
    await page.locator(".sb-exam-title").fill("اختبار الوحدة الثانية — معدّل"); await page.waitForTimeout(300);
    await page.locator(".sb-tb-save").getByRole("button", { name: "حفظ مسودة" }).click();   // a MOUSE click
    await page.locator(".sb-save-state.is-saving").waitFor({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(200);
    rec.during = await page.evaluate(() => {
      const spoken = el => { const c = el.cloneNode(true); c.querySelectorAll('[aria-hidden="true"]').forEach(n => n.remove()); return (c.textContent || "").replace(/\s+/g, " ").trim(); };
      const LIVE = '[role="status"], [role="alert"], [role="log"], [aria-live]:not([aria-live="off"])';
      const chip = document.querySelector(".sb-save-state"), button = document.querySelector(".sb-tb-save button");
      const r = chip?.getBoundingClientRect(), a = document.activeElement;
      return { chipText: chip?.textContent ?? null, chipSpoken: chip ? spoken(chip) : null, role: chip?.getAttribute("role") ?? null, live: chip?.getAttribute("aria-live") ?? null,
        atomic: chip?.getAttribute("aria-atomic") ?? null, buttonText: (button?.textContent || "").trim(), buttonDisabled: !!button?.disabled,
        buttonInLive: !!(button?.closest(LIVE) || button?.querySelector(LIVE)), saying: [...document.querySelectorAll(LIVE)].filter(n => spoken(n).includes(spoken(chip))).length,
        chipInView: !!r && r.width > 0 && r.left >= 0 && r.right <= window.innerWidth, focus: a === document.body ? "BODY" : (a?.className || a?.tagName || "") };
    });
    rec.duringOverflow = await overflow(page);
    await shot("01-saving");
    release();
    await page.locator(".sb-save-state.is-saved").waitFor({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(300);
    rec.after = await page.evaluate(() => ({ chipText: document.querySelector(".sb-save-state")?.textContent ?? null, buttonText: (document.querySelector(".sb-tb-save button")?.textContent || "").trim() }));
    rec.said = await page.evaluate(() => window.__rf3Said);
    await shot("02-saved");
    const d = rec.during, GLYPH = /[✓●⏳↺]|\p{Extended_Pictographic}/u;
    check(id, "RF3 I-4 the save status speaks the save-label table — one sentence per state change, no glyph: «تغييرات غير محفوظة» → «جارٍ الحفظ…» (the draft button's own string; the button is no live region) → «محفوظ»",
      d.chipText === "⏳ جارٍ الحفظ…" && d.chipSpoken === "جارٍ الحفظ…" && d.buttonText === d.chipSpoken && d.buttonDisabled && !d.buttonInLive && d.saying === 1 &&
      d.role === "status" && d.live === "polite" && d.atomic === "true" && d.chipInView && rec.duringOverflow.scrollWidth <= rec.duringOverflow.clientWidth &&
      rec.after.chipText === "✓ محفوظ" && rec.after.buttonText === "حفظ مسودة" &&
      JSON.stringify(rec.said) === JSON.stringify([{ region: "status", text: "تغييرات غير محفوظة" }, { region: "status", text: "جارٍ الحفظ…" }, { region: "status", text: "محفوظ" }]) &&
      rec.said.every(x => !GLYPH.test(x.text)), JSON.stringify({ during: d, overflow: rec.duringOverflow, after: rec.after, said: rec.said }));
  } catch (e) { release(); rec.error = String(e).slice(0, 300); check(id, "builder RF3 save-status run", false, rec.error); }
  await ctx.close();
}

// RF3 — confirmed audit findings and owner-listed observations (Review Fix 3), in real Chromium (reduced motion). Pointer actions use
// page.mouse at the measured centre (a covered control must FAIL the check, not make Playwright wait for it to become clickable).
const openSaved = async (page, origin, title, firstCard) => {
  await page.goto(origin + "/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /الامتحانات المحفوظة/ }).first().click();
  await page.locator(".saved-exam-item", { hasText: title }).getByRole("button", { name: /فتح وتعديل/ }).click();
  await page.locator(firstCard).waitFor({ timeout: 20000 }); await page.waitForTimeout(500);
};
const mouseOn = async (page, locator) => {
  const b = await locator.boundingBox();
  if (!b) return false;
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  return true;
};
// Every visible control of `selector` (page context): does a hit test at its centre land on it? Where it sits otherwise.
const hitProbe = selector => {
  const host = document.querySelector(selector), tb = document.querySelector(".sb-toolbar");
  if (!host) return { present: false };
  const r = host.getBoundingClientRect(), t = tb.getBoundingClientRect();
  const controls = [...host.querySelectorAll("button, select, input")].filter(c => { const b = c.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.bottom > 0 && b.top < innerHeight; }).map(c => {
    const b = c.getBoundingClientRect(), hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return { name: (c.getAttribute("aria-label") || c.textContent || c.tagName).replace(/\s+/g, " ").trim().slice(0, 24), ok: !!hit && (hit === c || c.contains(hit)),
      hit: hit?.closest(".sb-toolbar") ? "TOOLBAR" : hit === c || c.contains(hit) ? "self" : (hit?.className || hit?.tagName || "none").toString().slice(0, 24), top: Math.round(b.top) };
  });
  return { present: true, position: getComputedStyle(host).position, cssTop: getComputedStyle(host).top, top: Math.round(r.top), bottom: Math.round(r.bottom),
    toolbarSticky: getComputedStyle(tb).position === "sticky", toolbarBottom: Math.round(t.bottom), vh: innerHeight, controls };
};
const activeHit = () => {
  const a = document.activeElement, r = a?.getBoundingClientRect(), hit = r ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
  return { name: (a?.getAttribute("aria-label") || a?.textContent || a?.tagName || "").replace(/\s+/g, " ").trim().slice(0, 30), tag: a?.tagName || "", body: a === document.body,
    inBar: !!a?.closest(".sb-bulk-bar"), inNav: !!a?.closest("aside.sb-navigator"), top: r ? Math.round(r.top) : null, covered: !!hit?.closest(".sb-toolbar") && !a?.closest(".sb-toolbar"),
    visible: !!hit && (hit === a || !!a?.contains(hit)) };
};
//   A-01: E9 — scroll to the second section, MOUSE-select «السؤال 1 في s2»: the bulk-action bar (sticky ≥ 641 px) sticks below the stuck
//         toolbar; each of its controls hit-tests to itself; Tab from the control before it focuses its first control, not covered;
//         a mouse click on «إلغاء التحديد» clears the selection. ≤ 640 px the bar is static: brought into view, every control hit-tests.
//         Inline explorer (> 900 px), scrolled 2500 px: its controls hit-test to themselves and a mouse click focuses «بحث في الامتحان».
//         With questions selected, a summary entry reveals «مشكلات القسم 2» below the toolbar AND the bar.
/** RR3-A11Y-2 — how much of the focused control the sticky layers cover: 5 points (centre + inset corners, clipped to the screen); a
 *  control that is itself in a sticky / fixed layer (the toolbar, the bar, a menu) is reported with its layer and not judged. */
const coverProbe = () => {
  const a = document.activeElement;
  if (!a || a === document.body) return { body: true };
  const layers = [document.querySelector(".sb-toolbar"), document.querySelector(".sb-bulk-bar")].filter(l => l && getComputedStyle(l).position === "sticky");
  let layer = "";
  for (let n = a; n && !n.classList?.contains("structured-builder-overlay"); n = n.parentElement) { const p = getComputedStyle(n).position; if (p === "sticky" || p === "fixed") { layer = n.className || n.tagName; break; } }
  const r = a.getBoundingClientRect(), x0 = Math.max(r.left + 2, 1), x1 = Math.min(r.right - 2, innerWidth - 1), y0 = Math.max(r.top + 2, 1), y1 = Math.min(r.bottom - 2, innerHeight - 1);
  const pts = [[(x0 + x1) / 2, (y0 + y1) / 2], [x0, y0], [x1, y0], [x0, y1], [x1, y1]];
  const covered = pts.filter(([x, y]) => { const h = document.elementFromPoint(x, y); return !!h && !a.contains(h) && layers.some(l => l.contains(h)); }).length;
  return { name: (a.getAttribute("aria-label") || a.textContent || a.tagName || "").replace(/\s+/g, " ").trim().slice(0, 30), top: Math.round(r.top), layer: String(layer).slice(0, 40),
    sticky: layers.map(l => l.className.split(" ")[0] + ":" + Math.round(l.getBoundingClientRect().bottom)), fully: covered === 5, partly: covered > 0 && covered < 5 };
};
async function runStickyLayers({ vp: [name, viewport, touch, dsf], newPage, origin, record, check }) {
  const id = "builder-rf3l-" + name;
  const { ctx, page, shot } = await newPage(id, viewport, touch, dsf);
  const rec = record.viewports[id] = {};
  try {
    await openSaved(page, origin, "اختبار الوحدة الثانية", "#sb-q-s2q2");
    const centre = sel => page.evaluate(s => { const o = document.querySelector(".structured-builder-overlay"), c = document.querySelector(s); o.scrollTop += c.getBoundingClientRect().top - o.clientHeight / 2; }, sel);
    await centre("#sb-q-s2q1"); await page.waitForTimeout(300);
    await mouseOn(page, page.locator("#sb-q-s2q1").getByRole("checkbox", { name: "تحديد السؤال" })); await page.waitForTimeout(400);
    const stuck = await page.evaluate(() => getComputedStyle(document.querySelector(".sb-bulk-bar")).position === "sticky");
    if (!stuck) { await page.evaluate(() => document.querySelector(".sb-bulk-bar").scrollIntoView({ block: "center" })); await page.waitForTimeout(300); }
    rec.bar = await page.evaluate(hitProbe, ".sb-bulk-bar");
    await shot("01-bulk-bar");
    // Tab from the control just before the bar (focused without scrolling, as a teacher's previous Tab leaves it).
    await page.evaluate(() => {
      const o = document.querySelector(".structured-builder-overlay"), bar = document.querySelector(".sb-bulk-bar");
      const all = [...o.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      const first = all.findIndex(el => bar.contains(el));
      all[first - 1]?.focus({ preventScroll: true });
    });
    await page.keyboard.press("Tab"); await page.waitForTimeout(150);
    rec.tab = await page.evaluate(activeHit);
    // RR3-A11Y-2 / audit B-02 (WCAG 2.4.11) — with the selection up, Shift+Tab upward through the content from the last control of
    // «السؤال 2 في s2»: no focus stop is fully or partly hidden under the sticky layers (the stuck toolbar and the bulk-action bar).
    await page.evaluate(() => {
      const c = document.querySelector("#sb-q-s2q2");
      const all = [...c.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])')];
      all.at(-1)?.focus();
    });
    rec.walk = [];
    for (let i = 0; i < 40; i++) { await page.keyboard.press("Shift+Tab"); await page.waitForTimeout(60); rec.walk.push(await page.evaluate(coverProbe)); }
    const hidden = rec.walk.filter(w => w.layer === "" && (w.fully || w.partly));
    check(id, "RR3-A11Y-2 / B-02 Shift+Tab ×40 through the content with questions selected: no focus stop is hidden (fully or partly) under the sticky toolbar / bulk-action bar, none on <body>",
      rec.walk.length === 40 && hidden.length === 0 && rec.walk.every(w => !w.body), JSON.stringify({ hidden, stops: rec.walk.length, sticky: rec.walk[0]?.sticky }));
    await shot("01b-shift-tab-walk");
    // Where the bar is static (≤ 640 px) the walk scrolled it away: back into view for the pointer step below.
    if (!stuck) { await page.evaluate(() => document.querySelector(".sb-bulk-bar").scrollIntoView({ block: "center" })); await page.waitForTimeout(300); }
    rec.clearClicked = await mouseOn(page, page.locator(".sb-bulk-bar").getByRole("button", { name: "إلغاء التحديد" })); await page.waitForTimeout(300);
    rec.cleared = (await page.locator(".sb-bulk-bar").count()) === 0;
    const b = rec.bar, barOk = b.present && b.controls.length >= 5 && b.controls.every(c => c.ok) && (!b.toolbarSticky || b.position !== "sticky" || b.top >= b.toolbarBottom) && b.bottom <= b.vh;
    check(id, "RF3 A-01 the bulk-action bar sticks below the stuck toolbar: every control hit-tests to itself; Tab reaches its first control uncovered; a mouse click on «إلغاء التحديد» clears the selection",
      barOk && rec.tab.inBar && !rec.tab.covered && rec.tab.visible && rec.clearClicked && rec.cleared, JSON.stringify({ bar: b, tab: rec.tab, cleared: rec.cleared }));

    if (viewport.width > 900) {
      await page.getByRole("button", { name: "المزيد من أدوات الامتحان" }).click();
      await page.locator(".eb-menu-panel").getByRole("button", { name: "مستكشف الأسئلة" }).click(); await page.waitForTimeout(300);
      await page.evaluate(() => { document.querySelector(".structured-builder-overlay").scrollTop = 2500; }); await page.waitForTimeout(300);
      rec.nav = await page.evaluate(hitProbe, "aside.sb-navigator");
      await mouseOn(page, page.locator("aside.sb-navigator").getByRole("searchbox", { name: "بحث في الامتحان" })); await page.waitForTimeout(150);
      rec.navClick = await page.evaluate(activeHit);
      await shot("02-explorer-scrolled");
      const n = rec.nav;
      check(id, "RF3 A-01 the inline explorer sticks below the stuck toolbar (scrolled): its controls hit-test to themselves; a mouse click focuses «بحث في الامتحان»",
        n.present && n.controls.length >= 3 && n.controls.every(c => c.ok) && n.top >= n.toolbarBottom && rec.navClick.name === "بحث في الامتحان" && rec.navClick.inNav && !rec.navClick.covered,
        JSON.stringify({ nav: { ...n, controls: n.controls?.slice(0, 8) }, click: rec.navClick }));
      await page.getByRole("button", { name: "المزيد من أدوات الامتحان" }).click();
      await page.locator(".eb-menu-panel").getByRole("button", { name: "مستكشف الأسئلة" }).click(); await page.waitForTimeout(300);
    }

    // A selection + a section-level issue in s2 (capScore without a maximum): the entry reveals the section's named list below both layers.
    await centre("#sb-q-s1q2"); await page.waitForTimeout(200);
    await mouseOn(page, page.locator("#sb-q-s1q2").getByRole("checkbox", { name: "تحديد السؤال" })); await page.waitForTimeout(300);
    await page.locator('[data-section-id="s2"] .sb-policy-choices input[type="radio"]').nth(1).check(); await page.waitForTimeout(300);
    await page.evaluate(() => { document.querySelector(".structured-builder-overlay").scrollTop = 0; }); await page.waitForTimeout(200);
    await page.locator(".sb-issues-list .sb-issue-link", { hasText: "القسم 2" }).first().click(); await page.waitForTimeout(700);
    rec.reveal = await page.evaluate(() => {
      const a = document.activeElement, r = a.getBoundingClientRect(), tb = document.querySelector(".sb-toolbar"), bar = document.querySelector(".sb-bulk-bar");
      const tSticky = getComputedStyle(tb).position === "sticky", bSticky = !!bar && getComputedStyle(bar).position === "sticky";
      const edge = Math.max(tSticky ? tb.getBoundingClientRect().bottom : 0, bSticky ? bar.getBoundingClientRect().bottom : 0);
      return { name: a.getAttribute("aria-label") || a.tagName, top: Math.round(r.top), edge: Math.round(edge), bar: !!bar, barSticky: bSticky, vh: innerHeight };
    });
    await shot("03-reveal-with-selection");
    const rv = rec.reveal;
    check(id, "RF3 A-01 with questions selected, a summary entry reveals «مشكلات القسم 2» below the toolbar AND the bulk-action bar (never under the bar)",
      rv.name === "مشكلات القسم 2" && rv.bar && rv.top >= rv.edge - 1 && rv.top + 24 <= rv.vh, JSON.stringify(rv));
  } catch (e) { rec.error = String(e).slice(0, 300); check(id, "builder RF3 sticky-layers run", false, rec.error); }
  await ctx.close();
}

//   A-02: E9 — (A) «السؤال 4» of section 1 at the top of the visible area, a MOUSE click on its «حذف»: focus goes to «السؤال 3» and its heading
//         is on screen (below the stuck toolbar where it is sticky, inside the viewport); (B) Enter on «حذف» of «السؤال 2», Enter on the
//         toast's «تراجع», Ctrl+Z, Ctrl+Y: «السؤال 2» is focused with its heading on screen. 200 % / phone used to give −934 / −1319.
const headProbe = () => {
  const a = document.activeElement, r = a.getBoundingClientRect(), tb = document.querySelector(".sb-toolbar");
  const edge = getComputedStyle(tb).position === "sticky" ? tb.getBoundingClientRect().bottom : 0;
  return { focus: a === document.body ? "BODY" : a.id || a.getAttribute("aria-label") || a.tagName, top: Math.round(r.top), bottom: Math.round(r.bottom), edge: Math.round(edge), vh: innerHeight,
    onScreen: r.top >= edge - 1 && r.top + 48 <= innerHeight };
};
async function runRevealStatic({ vp: [name, viewport, touch, dsf], newPage, origin, record, check }) {
  const id = "builder-rf3r-" + name;
  const rec = record.viewports[id] = {};
  for (const step of ["A", "B"]) {
    const { ctx, page, shot } = await newPage(id + "-" + step, viewport, touch, dsf);
    try {
      await openSaved(page, origin, "اختبار الوحدة الثانية", "#sb-q-s2q2");
      if (step === "A") {
        // «السؤال 4» at the top of what the teacher sees: 12 px below the stuck toolbar, or below the screen's top where it is static.
        await page.evaluate(() => {
          const o = document.querySelector(".structured-builder-overlay"), c = document.getElementById("sb-q-s1q4"), tb = document.querySelector(".sb-toolbar");
          const edge = getComputedStyle(tb).position === "sticky" ? tb.getBoundingClientRect().bottom : 0;
          o.scrollTop += c.getBoundingClientRect().top - edge - 12;
        }); await page.waitForTimeout(300);
        await mouseOn(page, page.locator("#sb-q-s1q4").getByRole("button", { name: "حذف", exact: true })); await page.waitForTimeout(700);
        rec.A = await page.evaluate(headProbe);
        await shot("01-after-delete");
      } else {
        await page.locator("#sb-q-s1q2").getByRole("button", { name: "حذف", exact: true }).focus(); await page.keyboard.press("Enter"); await page.waitForTimeout(600);
        await page.locator(".eb-toast").getByRole("button", { name: /تراجع/ }).focus(); await page.keyboard.press("Enter"); await page.waitForTimeout(700);
        await page.keyboard.press("Control+z"); await page.waitForTimeout(600);
        await page.keyboard.press("Control+y"); await page.waitForTimeout(700);
        rec.B = await page.evaluate(headProbe);
        await shot("02-after-redo");
      }
    } catch (e) { rec[step] = { error: String(e).slice(0, 300) }; }
    await ctx.close();
  }
  check(id, "RF3 A-02 the card focus lands on is on screen: a deletion's neighbour (mouse «حذف» on «السؤال 4») and the Ctrl+Y target («السؤال 2») — below the stuck toolbar or the screen's top where it is static",
    rec.A?.focus === "sb-q-s1q3" && rec.A.onScreen && rec.B?.focus === "sb-q-s1q2" && rec.B.onScreen, JSON.stringify(rec));
}

//   O-1 (150 % / 200 % only — a zoom): E9 at 1280 × 900, the inline explorer open with focus in «بحث في الامتحان»; the window zooms to
//         this viewport, the explorer becomes a dialog; Escape closes it — focus is on «المزيد» (never <body>) and a MOUSE click on
//         «المزيد» opens its menu.
async function runExplorerZoom({ vp: [name, viewport, touch, dsf], newPage, origin, record, check }) {
  if (name !== "150pct" && name !== "200pct") return;
  const id = "builder-rf3z-" + name;
  const { ctx, page, shot } = await newPage(id, { width: 1280, height: 900 }, touch, dsf);
  const rec = record.viewports[id] = {};
  try {
    await openSaved(page, origin, "اختبار الوحدة الثانية", "#sb-q-s2q2");
    const more = page.getByRole("button", { name: "المزيد من أدوات الامتحان" });
    await more.click(); await page.locator(".eb-menu-panel").getByRole("button", { name: "مستكشف الأسئلة" }).click(); await page.waitForTimeout(300);
    await mouseOn(page, page.locator("aside.sb-navigator").getByRole("searchbox", { name: "بحث في الامتحان" })); await page.waitForTimeout(150);
    rec.before = await page.evaluate(activeHit);
    await page.setViewportSize(viewport); await page.waitForTimeout(700);
    rec.dialog = await page.getByRole("dialog", { name: "مستكشف الأسئلة" }).count();
    await page.keyboard.press("Escape"); await page.waitForTimeout(500);
    rec.after = await page.evaluate(activeHit);
    rec.dialogAfter = await page.getByRole("dialog", { name: "مستكشف الأسئلة" }).count();
    await shot("01-after-escape");
    await mouseOn(page, more); await page.waitForTimeout(300);
    rec.menu = { expanded: await more.getAttribute("aria-expanded"), panel: await page.locator(".eb-menu-panel").count() };
    await page.keyboard.press("Escape"); await page.waitForTimeout(200);
    check(id, "RF3 O-1 zoomed with focus in the inline explorer: Escape on the dialog it became returns focus to «المزيد» (never <body>); the next click on «المزيد» opens it",
      rec.before.name === "بحث في الامتحان" && rec.dialog === 1 && rec.dialogAfter === 0 && !rec.after.body && rec.after.name === "المزيد من أدوات الامتحان" && rec.menu.expanded === "true" && rec.menu.panel === 1, JSON.stringify(rec));
  } catch (e) { rec.error = String(e).slice(0, 300); check(id, "builder RF3 explorer-zoom run", false, rec.error); }
  await ctx.close();
}

//   O-2: E13 — a matching question written as the builder writes it (a markdown table in its text): the explorer (inline panel or
//         dialog) shows «العمود أ، العمود ب · HTTP · DNS · HTTPS», and no entry text or selection checkbox name carries «|» or «---».
async function runExplorerPreview({ vp: [name, viewport, touch, dsf], newPage, origin, record, check }) {
  const id = "builder-rf3p-" + name;
  const { ctx, page, shot } = await newPage(id, viewport, touch, dsf);
  const rec = record.viewports[id] = {};
  try {
    await openSaved(page, origin, "اختبار سؤال المطابقة", "#sb-q-s1m1");
    await page.getByRole("button", { name: "المزيد من أدوات الامتحان" }).click();
    await page.locator(".eb-menu-panel").getByRole("button", { name: "مستكشف الأسئلة" }).click(); await page.waitForTimeout(400);
    rec.nav = await page.evaluate(() => ({ texts: [...document.querySelectorAll(".sb-navigator .sb-nav-text")].map(n => n.textContent),
      labels: [...document.querySelectorAll(".sb-navigator .sb-nav-check")].map(n => n.getAttribute("aria-label")), dialog: !!document.querySelector(".sb-navigator-dialog") }));
    await shot("01-explorer-matching");
    const all = [...rec.nav.texts, ...rec.nav.labels];
    check(id, "RF3 O-2 the question explorer shows a matching question by its words («العمود أ، العمود ب · HTTP · DNS · HTTPS»), never its table syntax (no «|» / «---» in a text or a checkbox name)",
      rec.nav.texts.length === 2 && rec.nav.texts[1] === "العمود أ، العمود ب · HTTP · DNS · HTTPS" && all.every(t => t && !/\||---/.test(t)), JSON.stringify(rec.nav));
  } catch (e) { rec.error = String(e).slice(0, 300); check(id, "builder RF3 explorer-preview run", false, rec.error); }
  await ctx.close();
}
