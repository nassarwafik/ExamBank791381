// Phase 21E.2 — PART=builder of scripts/capture-visual-gate-21e2.mjs (certification only; never shipped). Opens a saved structured
// exam in the REAL builder overlay and measures the 21E.2 builder contract at one viewport:
//   T  toolbar: at most 8 visible actions; identity + actions rows; height; sticky only where there is room (≥ 768 × 600);
//   B  dialog: the builder overlay is role=dialog + aria-modal, named by the toolbar heading; focus moves inside when it opens;
//   M  «المزيد» by keyboard: Enter opens, ArrowDown moves, Escape closes and returns focus to the trigger;
//   E  Escape on the builder with an unsaved edit asks the unsaved-changes guard; «البقاء» keeps the edit and the builder;
//   F1 a deletion's toast never overlaps the toolbar's controls; after scrolling, a non-sticky toolbar no longer covers content.
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
      await more.focus(); await page.keyboard.press("Enter"); await page.waitForTimeout(200);
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
}
