#!/usr/bin/env node
// «ابنِ الشبكة» (docs/enterprise-network-build-exercises.md) — a build-the-network exercise in a REAL Chromium on the production build,
// inside the book reader of 791381 (module m29) next to the REAL API in process (browser-harness/learning-l8-api.cjs). Certification only.
// At 1280 and at 390 (touch):
//   • the exercise «راوتر يصل شبكتين» shows its goals and the plain builder (router / switch / PC only);
//   • the empty network cannot be checked; a half-built network is judged by the SERVER: some goals ✓, some ✕, and the hints;
//   • the learner finishes the network (cables, the router's CLI, the PCs' IP Configuration); «تحقّق من شبكتي» → every goal ✓;
//   • a reload restores the network from the exercise's draft; no page error, no horizontal scroll of the page.
//   • the Desktop's IP Configuration fields fit their columns: each input lies inside its own field box, so a saved address stays
//     visible (it was clipped under the next column — the value was saved but looked empty);
//   • the summary booklet 791381s (its own visual theme): the m37 exercise «VTP — Server وClient» is built through the UI — two
//     switches, a trunk, VTP server / client, VLAN 30 created on the server only — and the server marks every goal ✓.
//   • 791381 m30 (LAB mode): «WAN وتوجيه ثابت» — PC1 — R1 ═serial═ R2 — PC2 built through the UI, the routers' lines (serial addressing,
//     clock rate, ip route) typed in their terminals; `show ip route` shows the S route, tracert crosses both routers, and the server,
//     replaying the lab network with the lab's own engine, marks every goal ✓.
//   • 791381s m38 (LAB mode in the booklet's theme): «Static NAT» shows its goals and the full lab builder (serial ports), with no page scroll.
//
// Tools are measuring instruments, not project dependencies: PLAYWRIGHT_CORE_DIR (or the global `playwright`), CHROMIUM_PATH.
// SHOT_DIR (optional) receives screenshots. Exit 1 when a check fails, 2 when a tool or the build is missing.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.resolve(process.env.DIST || path.join(root, "dist"));
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR || root, "package.json"))("playwright-core")); }
catch { try { ({ chromium } = require("playwright")); } catch { console.error("playwright unavailable (set PLAYWRIGHT_CORE_DIR)"); process.exit(2); } }
if (!fs.existsSync(path.join(dist, "index.html"))) { console.error("no production build at " + dist); process.exit(2); }

require(path.join(root, "api/src/lib/observability.js")).setSink(() => {});
const { createLearningApi } = require(path.join(root, "browser-harness/learning-l8-api.cjs"));
const CID = "791381";
const api = createLearningApi({ apiRoot: path.join(root, "api"), seed: {} });
const teacherToken = api.teacherToken();
const MIME = { ".js": "text/javascript", ".html": "text/html; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".webp": "image/webp", ".json": "application/json" };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost");
  if (u.pathname.startsWith("/api/")) {
    let body = ""; req.on("data", c => { body += c; });
    req.on("end", async () => { const r = await api.handle(req.method, req.url, req.headers, body); res.writeHead(r.status, r.headers); res.end(r.body); });
    return;
  }
  let full = path.resolve(dist, "." + decodeURIComponent(u.pathname));
  if (!full.startsWith(dist + path.sep) || !fs.existsSync(full) || !fs.statSync(full).isFile()) full = path.join(dist, "index.html");
  res.writeHead(200, { "content-type": MIME[path.extname(full)] || "application/octet-stream", "cache-control": "no-store" });
  fs.createReadStream(full).pipe(res);
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const origin = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ["--no-sandbox"] });

const failures = [];
const check = (ok, what) => { console.log((ok ? "  ✓ " : "  ✗ ") + what); if (!ok) failures.push(what); return ok; };
const shot = async (page, name) => { if (process.env.SHOT_DIR) await page.screenshot({ path: path.join(process.env.SHOT_DIR, name + ".png") }); };

const PAGE = "791381-m29-l02-p01";
for (const [label, viewport, touch] of [["1280", { width: 1280, height: 900 }, false], ["390", { width: 390, height: 844 }, true]]) {
  console.log("viewport " + label);
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch, serviceWorkers: "block", locale: "ar" });
  await ctx.addInitScript(t => { sessionStorage.setItem("examBankBuilderToken", t); sessionStorage.setItem("examBankSessionRole", "teacher"); sessionStorage.setItem("examBankSessionDisplayName", "المعلم"); }, teacherToken);
  const page = await ctx.newPage();
  page.on("pageerror", e => failures.push("page error: " + e.message));
  await page.goto(origin + "/#/learning/" + CID + "/read/" + PAGE);
  await page.reload();
  const ex = page.getByTestId("network-build");
  await ex.waitFor({ timeout: 20000 });
  const lab = ex.getByTestId("network-lab");
  await lab.waitFor({ timeout: 20000 });
  check((await ex.locator(".learning-lab-goal").count()) === 8, "the eight goals are listed");
  const kinds = await lab.getByRole("group", { name: "إضافة جهاز" }).getByRole("button").allTextContents();
  check(JSON.stringify(kinds) === JSON.stringify(["+ راوتر", "+ سويتش", "+ حاسوب"]), "the builder offers the task's kinds only: " + kinds.join(" "));
  const verify = ex.getByRole("button", { name: "تحقّق من شبكتي", exact: true });
  check(await verify.isDisabled(), "the empty network cannot be checked");
  for (const k of ["+ راوتر", "+ سويتش", "+ سويتش", "+ حاسوب", "+ حاسوب"]) await lab.getByRole("button", { name: k, exact: true }).click();
  const sel = name => lab.getByRole("combobox", { name, exact: true });
  const connect = async (a, ap, b, bp) => {
    await sel("من الجهاز").selectOption(a); await sel("منفذ الجهاز الأول").selectOption(ap);
    await sel("إلى الجهاز").selectOption(b); await sel("منفذ الجهاز الثاني").selectOption(bp);
    await lab.getByRole("button", { name: "صِل", exact: true }).click();
  };
  check(!(await sel("منفذ الجهاز الأول").locator("option").allTextContents()).some(o => o.startsWith("s0/")), "no serial port in the plain builder");
  await connect("r1", "g0/0", "sw1", "g0/1");
  await verify.click();
  await ex.locator(".learning-lab-goal.is-right").first().waitFor({ timeout: 20000 });
  const right = await ex.locator(".learning-lab-goal.is-right").count(), wrong = await ex.locator(".learning-lab-goal.is-wrong").count();
  check(right === 2 && wrong === 6, "the server judged the half-built network goal by goal (" + right + " ✓, " + wrong + " ✕)");
  check(await ex.getByRole("list", { name: "تلميحات" }).count() === 1, "the hints follow a wrong check");
  await connect("r1", "g0/1", "sw2", "g0/1");
  check(await ex.locator(".learning-lab-goal.is-right, .learning-lab-goal.is-wrong").count() === 0, "a change clears the verdict");
  await connect("sw1", "f0/1", "pc1", "eth0");
  await connect("sw2", "f0/1", "pc2", "eth0");
  const openDevice = async name => { await lab.getByTestId("network-lab-devices").getByRole("button", { name }).click(); return lab.getByTestId("network-lab-device"); };
  const r1 = await openDevice(/^R1/);
  for (const line of ["enable", "configure terminal", "interface g0/0", "ip address 192.168.1.1 255.255.255.0", "no shutdown", "exit", "interface g0/1", "ip address 192.168.2.1 255.255.255.0", "no shutdown", "end"]) {
    await r1.getByRole("textbox").last().fill(line); await r1.getByRole("button", { name: "تنفيذ" }).click();
  }
  for (const [name, address, gw] of [[/^PC1/, "192.168.1.10", "192.168.1.1"], [/^PC2/, "192.168.2.10", "192.168.2.1"]]) {
    const panel = await openDevice(name);
    await panel.getByRole("button", { name: /IP Configuration/ }).click();
    const ipc = panel.getByTestId("net2-ipconfig");
    await ipc.getByLabel("IP Address").fill(address); await ipc.getByLabel("Subnet Mask").fill("255.255.255.0"); await ipc.getByLabel("Default Gateway").fill(gw);
    await ipc.getByRole("button", { name: /حفظ/ }).click();
  }
  // the saved address is still shown, inside its own field (no input wider than its column)
  const ipcBox = lab.getByTestId("network-lab-device").getByTestId("net2-ipconfig");
  const fit = await ipcBox.evaluate(root => [...root.querySelectorAll(".net2-field")].map(f => { const i = f.querySelector("input"); if (!i) return true; const a = f.getBoundingClientRect(), b = i.getBoundingClientRect(); return b.left >= a.left - 0.5 && b.right <= a.right + 0.5; }));
  check(fit.length >= 4 && fit.every(Boolean), "IP Configuration: every input lies inside its own field (" + fit.join(",") + ")");
  check((await ipcBox.getByLabel("IP Address").inputValue()) === "192.168.2.10", "IP Configuration: the saved address is shown after «حفظ»");
  const pc1 = await openDevice(/^PC1/);
  await pc1.getByRole("button", { name: /Command Prompt/ }).click();
  const cmd = pc1.getByTestId("net2-cmd");
  await cmd.getByRole("textbox").fill("ping 192.168.2.10"); await cmd.getByRole("button", { name: "تنفيذ" }).click();
  check(/Reply from 192\.168\.2\.10/.test(await cmd.getByTestId("ncli-screen").textContent()), "on screen: ping from PC1 crosses R1 to PC2");
  await verify.click();
  await ex.getByText("✓ أحسنت — شبكتك تحقق كل الأهداف.").waitFor({ timeout: 20000 });
  check(await ex.locator(".learning-lab-goal.is-right").count() === 8, "the server: every goal ✓");
  check(await ex.locator(".learning-lab-explanation").count() === 1, "the explanation follows the right check");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 1, "no horizontal scroll (" + overflow + "px)");
  await shot(page, "netbuild-" + label);
  await page.reload();
  await page.getByTestId("network-build").getByTestId("network-lab").waitFor({ timeout: 20000 });
  check(await page.getByTestId("network-build").getByTestId("network-lab-devices").getByRole("button").count() === 5, "a reload restores the network from the exercise's draft");
  await ctx.close();
}

/** 791381s m37 — the VTP exercise in the booklet, built and configured through the UI; the server judges it. */
for (const [label, viewport, touch] of [["booklet 1280", { width: 1280, height: 900 }, false], ["booklet 390", { width: 390, height: 844 }, true]]) {
  console.log("viewport " + label);
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch, serviceWorkers: "block", locale: "ar" });
  await ctx.addInitScript(t => { sessionStorage.setItem("examBankBuilderToken", t); sessionStorage.setItem("examBankSessionRole", "teacher"); sessionStorage.setItem("examBankSessionDisplayName", "المعلم"); }, teacherToken);
  const page = await ctx.newPage();
  page.on("pageerror", e => failures.push("page error: " + e.message));
  await page.goto(origin + "/#/learning/791381s/read/791381s-m37-l01-p03");
  await page.reload();
  const ex = page.getByTestId("network-build");
  await ex.waitFor({ timeout: 20000 });
  const lab = ex.getByTestId("network-lab");
  await lab.waitFor({ timeout: 20000 });
  check((await ex.locator(".learning-lab-goal").count()) === 7, "the seven goals are listed");
  for (const k of ["+ سويتش", "+ سويتش", "+ حاسوب", "+ حاسوب"]) await lab.getByRole("button", { name: k, exact: true }).click();
  const sel = name => lab.getByRole("combobox", { name, exact: true });
  for (const [a, ap, b, bp] of [["sw1", "g0/1", "sw2", "g0/1"], ["sw1", "f0/1", "pc1", "eth0"], ["sw2", "f0/1", "pc2", "eth0"]]) {
    await sel("من الجهاز").selectOption(a); await sel("منفذ الجهاز الأول").selectOption(ap);
    await sel("إلى الجهاز").selectOption(b); await sel("منفذ الجهاز الثاني").selectOption(bp);
    await lab.getByRole("button", { name: "صِل", exact: true }).click();
  }
  const openDevice = async name => { await lab.getByTestId("network-lab-devices").getByRole("button", { name }).click(); return lab.getByTestId("network-lab-device"); };
  const lines = {
    SW1: ["enable", "configure terminal", "vtp domain SCHOOL", "vtp mode server", "vlan 30", "exit", "interface f0/1", "switchport mode access", "switchport access vlan 30", "exit", "interface g0/1", "switchport mode trunk", "end"],
    SW2: ["enable", "configure terminal", "vtp domain SCHOOL", "vtp mode client", "interface g0/1", "switchport mode trunk", "exit", "interface f0/1", "switchport mode access", "switchport access vlan 30", "end"],
  };
  for (const [sw, ls] of Object.entries(lines)) {
    const panel = await openDevice(new RegExp("^" + sw));
    for (const line of ls) { await panel.getByRole("textbox").last().fill(line); await panel.getByRole("button", { name: "تنفيذ" }).click(); }
  }
  const sw2 = await openDevice(/^SW2/);
  await sw2.getByRole("textbox").last().fill("show vlan brief"); await sw2.getByRole("button", { name: "تنفيذ" }).click();
  check(/30\s+VLAN0030/.test(await sw2.getByTestId("ncli-screen").textContent()), "on screen: SW2 learned VLAN 30 from the VTP server");
  for (const [name, address] of [[/^PC1/, "192.168.30.1"], [/^PC2/, "192.168.30.2"]]) {
    const panel = await openDevice(name);
    await panel.getByRole("button", { name: /IP Configuration/ }).click();
    const ipc = panel.getByTestId("net2-ipconfig");
    await ipc.getByLabel("IP Address").fill(address); await ipc.getByLabel("Subnet Mask").fill("255.255.255.0");
    await ipc.getByRole("button", { name: /حفظ/ }).click();
  }
  await ex.getByRole("button", { name: "تحقّق من شبكتي", exact: true }).click();
  await ex.getByText("✓ أحسنت — شبكتك تحقق كل الأهداف.").waitFor({ timeout: 20000 });
  check(await ex.locator(".learning-lab-goal.is-right").count() === 7, "the server: every goal ✓ (VTP server / client, VLAN 30 learned, ping)");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 1, "no horizontal scroll (" + overflow + "px)");
  await shot(page, "netbuild-" + label.replace(" ", "-"));
  await ctx.close();
}

/** 791381 m30 — the static-routing WAN exercise in LAB mode, built and configured through the UI; the server replays the lab network. */
for (const [label, viewport, touch] of [["lab 1280", { width: 1280, height: 900 }, false], ["lab 390", { width: 390, height: 844 }, true]]) {
  console.log("viewport " + label);
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch, serviceWorkers: "block", locale: "ar" });
  await ctx.addInitScript(t => { sessionStorage.setItem("examBankBuilderToken", t); sessionStorage.setItem("examBankSessionRole", "teacher"); sessionStorage.setItem("examBankSessionDisplayName", "المعلم"); }, teacherToken);
  const page = await ctx.newPage();
  page.on("pageerror", e => failures.push("page error: " + e.message));
  await page.goto(origin + "/#/learning/" + CID + "/read/791381-m30-l01-p01");
  await page.reload();
  const ex = page.getByTestId("network-build");
  await ex.waitFor({ timeout: 20000 });
  const lab = ex.getByTestId("network-lab");
  await lab.waitFor({ timeout: 20000 });
  check((await ex.locator(".learning-lab-goal").count()) === 4, "the four goals are listed");
  for (const k of ["+ راوتر", "+ راوتر", "+ حاسوب", "+ حاسوب"]) await lab.getByRole("button", { name: k, exact: true }).click();
  const sel = name => lab.getByRole("combobox", { name, exact: true });
  for (const [a, ap, b, bp] of [["r1", "s0/0/0", "r2", "s0/0/0"], ["r1", "g0/0", "pc1", "eth0"], ["r2", "g0/0", "pc2", "eth0"]]) {
    await sel("من الجهاز").selectOption(a); await sel("منفذ الجهاز الأول").selectOption(ap);
    await sel("إلى الجهاز").selectOption(b); await sel("منفذ الجهاز الثاني").selectOption(bp);
    await lab.getByRole("button", { name: "صِل", exact: true }).click();
  }
  const openDevice = async name => { await lab.getByTestId("network-lab-devices").getByRole("button", { name }).click(); return lab.getByTestId("network-lab-device"); };
  const lines = {
    R1: ["enable", "configure terminal", "interface g0/0", "ip address 192.168.1.1 255.255.255.0", "no shutdown", "exit", "interface s0/0/0", "ip address 10.0.0.1 255.255.255.252", "clock rate 64000", "no shutdown", "exit", "ip route 192.168.2.0 255.255.255.0 10.0.0.2", "end"],
    R2: ["enable", "configure terminal", "interface g0/0", "ip address 192.168.2.1 255.255.255.0", "no shutdown", "exit", "interface s0/0/0", "ip address 10.0.0.2 255.255.255.252", "no shutdown", "exit", "ip route 192.168.1.0 255.255.255.0 10.0.0.1", "end"],
  };
  for (const [r, ls] of Object.entries(lines)) {
    const panel = await openDevice(new RegExp("^" + r));
    for (const line of ls) { await panel.getByRole("textbox").last().fill(line); await panel.getByRole("button", { name: "تنفيذ" }).click(); }
  }
  const r1 = await openDevice(/^R1/);
  await r1.getByRole("textbox").last().fill("show ip route"); await r1.getByRole("button", { name: "تنفيذ" }).click();
  check(/S\s+192\.168\.2\.0\/24 \[1\/0\] via 10\.0\.0\.2/.test(await r1.getByTestId("ncli-screen").textContent()), "on screen: R1 has the static route S 192.168.2.0/24 via 10.0.0.2");
  for (const [name, address, gw] of [[/^PC1/, "192.168.1.10", "192.168.1.1"], [/^PC2/, "192.168.2.10", "192.168.2.1"]]) {
    const panel = await openDevice(name);
    await panel.getByRole("button", { name: /IP Configuration/ }).click();
    const ipc = panel.getByTestId("net2-ipconfig");
    await ipc.getByLabel("IP Address").fill(address); await ipc.getByLabel("Subnet Mask").fill("255.255.255.0"); await ipc.getByLabel("Default Gateway").fill(gw);
    await ipc.getByRole("button", { name: /حفظ/ }).click();
  }
  const pc1 = await openDevice(/^PC1/);
  await pc1.getByRole("button", { name: /Command Prompt/ }).click();
  const cmd = pc1.getByTestId("net2-cmd");
  await cmd.getByRole("textbox").fill("tracert 192.168.2.10"); await cmd.getByRole("button", { name: "تنفيذ" }).click();
  check(/1 .*192\.168\.1\.1[\s\S]*2 .*10\.0\.0\.2[\s\S]*3 .*192\.168\.2\.10/.test(await cmd.getByTestId("ncli-screen").textContent()), "on screen: tracert from PC1 crosses R1 and R2");
  await ex.getByRole("button", { name: "تحقّق من شبكتي", exact: true }).click();
  await ex.getByText("✓ أحسنت — شبكتك تحقق كل الأهداف.").waitFor({ timeout: 20000 });
  check(await ex.locator(".learning-lab-goal.is-right").count() === 4, "the server (lab replay): every goal ✓ — the link, both static routes, the ping");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 1, "no horizontal scroll (" + overflow + "px)");
  await shot(page, "netbuild-" + label.replace(" ", "-"));
  await ctx.close();
}

/** 791381s m38 — a LAB exercise in the booklet's theme: the goals, the full lab builder (serial ports), no horizontal scroll. */
for (const [label, viewport, touch] of [["booklet lab 1280", { width: 1280, height: 900 }, false], ["booklet lab 390", { width: 390, height: 844 }, true]]) {
  console.log("viewport " + label);
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch, serviceWorkers: "block", locale: "ar" });
  await ctx.addInitScript(t => { sessionStorage.setItem("examBankBuilderToken", t); sessionStorage.setItem("examBankSessionRole", "teacher"); sessionStorage.setItem("examBankSessionDisplayName", "المعلم"); }, teacherToken);
  const page = await ctx.newPage();
  page.on("pageerror", e => failures.push("page error: " + e.message));
  await page.goto(origin + "/#/learning/791381s/read/791381s-m38-l03-p01");
  await page.reload();
  const ex = page.getByTestId("network-build");
  await ex.waitFor({ timeout: 20000 });
  const lab = ex.getByTestId("network-lab");
  await lab.waitFor({ timeout: 20000 });
  check((await ex.locator(".learning-lab-goal").count()) === 4, "the four goals are listed");
  await lab.getByRole("button", { name: "+ راوتر", exact: true }).click();
  await lab.getByRole("button", { name: "+ راوتر", exact: true }).click();
  await lab.getByRole("combobox", { name: "من الجهاز", exact: true }).selectOption("r1");
  check((await lab.getByRole("combobox", { name: "منفذ الجهاز الأول", exact: true }).locator("option").allTextContents()).includes("s0/0/0"), "the lab builder offers the serial ports");
  check(await lab.getByTestId("network-lab-router-extras").count() === 1, "the lab's router commands are listed under the terminal");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 1, "no horizontal scroll (" + overflow + "px)");
  await shot(page, "netbuild-" + label.replaceAll(" ", "-"));
  await ctx.close();
}

await browser.close();
server.close();
if (failures.length) { console.log("\n" + failures.length + " failure(s)"); process.exit(1); }
console.log("\nall checks passed");
