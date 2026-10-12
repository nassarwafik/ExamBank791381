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
