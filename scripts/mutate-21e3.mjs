#!/usr/bin/env node
// Phase 21E.3 focused mutation certification (AGENTS.md §9): the in-place chunk recovery (URL trust, remap set, single
// evaluation, refusals), the recovery card (no leak, re-arm, reload gating), the calm announcer (timer once, save silence),
// focus after transitions, the focus reveal, and the LTR islands. Each mutant is planted, the named suites run, the file is
// restored byte-for-byte (sha256-verified, also on interruption) and `git diff` must be clean afterwards.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { spawnSync } from "node:child_process";

const RL = "src/recoverableLazy.ts", QEB = "src/student/exam/QuestionErrorBoundary.tsx", ANN = "src/student/exam/examAnnouncements.ts";
const PAGE = "src/StudentExamPage.tsx", SAVE = "src/student/exam/SaveStatus.tsx", FIELD = "src/QuestionField.tsx", LAB = "src/physicsLab/LabScene.tsx";
const CARD = "src/StudentQuestionCard.tsx", LTR = "src/ui/ltrIsland.ts", REVEAL = "src/student/exam/keyboardReveal.ts", BELL = "src/notifications/NotificationBell.tsx";
const GUARD = "scripts/check-bundle-budget.mjs", ANNR = "src/student/exam/examAnnouncer.ts", PRES = "src/notifications/notificationPresentation.ts", CHART = "src/charts/DataChart.tsx";
const HOT = "src/visual/HotspotView.tsx", HOLD = "src/student/exam/pointerHold.ts", UICSS = "src/ui/ui.css";
const RT = ["src/recoverableLazy.21e3.test.tsx", "src/recoverableLazy.rf1.test.tsx"];
const UNITS = ["src/student/exam/exam21e3.units.test.tsx", "src/student/exam/rf1.units.test.tsx"];
const PAGE_T = ["src/StudentExamPage.ux21e3.test.tsx", "src/StudentExamPage.rf1.test.tsx"];
const STEM_T = ["src/StudentQuestionCard.stem21e3.test.tsx", "src/StudentQuestionCard.stem.rf1.test.tsx", "src/richContent/RichContentRenderer.rf1.test.tsx"];
const REVEAL_T = ["src/student/exam/keyboardReveal.rf1.test.tsx", "src/StudentExamPage.rf1.test.tsx"];
const GUARD_T = ["scripts/check-bundle-budget.rf1.test.mjs"];
// Review fix 2 suites.
const ANN_T = ["src/student/exam/examAnnouncer.rf2.test.ts", "src/StudentExamPage.rf1.test.tsx"];
const FOCUS_T = ["src/StudentQuestionCard.focus.rf2.test.tsx", "src/StudentQuestionCard.focus2.rf2.test.tsx", "src/student/exam/rf1.units.test.tsx", "src/StudentExamPage.ux21e3.test.tsx"];
const RT2 = ["src/recoverableLazy.rf1.test.tsx", "src/recoverableLazy.rf2.test.tsx"];
const BELL_T = ["src/notifications/NotificationBell.grade.rf2.test.tsx", "src/student/exam/exam21e3.units.test.tsx"];
// Review fix 3 suites.
const RT3 = ["src/recoverableLazy.rf1.test.tsx", "src/recoverableLazy.rf2.test.tsx", "src/recoverableLazy.rf3.test.tsx"];
const RF3_T = ["src/student/exam/rf3.units.test.tsx", "src/StudentExamPage.rf3.test.tsx"];
// `equivalent` (rare): the reason a mutant cannot change behaviour (AGENTS.md §9 "show the mutant is equivalent"). It is still
// planted and run; if it survives it is reported as `equivalent` with that reason (never silently), and if it is killed the reason
// was wrong and it counts as killed. `before` / `after` may be arrays (one mutant made of several edits in the same file, for a
// rule enforced by layered guards: review fix 3).
const M = (id, file, before, after, tests, equivalent) => ({ id, file, before, after, tests, equivalent });
const edits = m => (Array.isArray(m.before) ? m.before.map((b, i) => [b, m.after[i]]) : [[m.before, m.after]]);
const mutants = [
  // URL trust — the only way a URL reaches the importer, the import map, a source read or a stylesheet.
  M("R01-origin", RL, "if (u.origin !== env.origin || u.username", "if (false || u.username", RT),
  M("R02-query", RL, " || u.search || u.hash) return null;", " || u.hash) return null;", RT),
  M("R03-chunk-name", RL, " || (name !== undefined && m[1] !== name)) return null;", ") return null;", RT),
  M("R04-hash-shape", RL, "const HASHED = /^([A-Za-z0-9_-]+)-[0-9a-z]{8}\\.(js|css)$/;", "const HASHED = /^([A-Za-z0-9_-]+)-[0-9A-Za-z]{6,}\\.(js|css)$/;", RT),
  M("R05-assets-prefix", RL, "if (!u.pathname.startsWith(prefix)) return null;", "", RT),
  M("R06-typeerror-only", RL, 'if (!e || e.name !== "TypeError" || typeof e.message !== "string") return null;', 'if (!e || typeof e.message !== "string") return null;', RT),
  // The remap set — single evaluation.
  M("R07-no-ancestors", RL, "for (const [u, out] of graph) if (!bad.has(u) && out.some(v => bad.has(v))) { bad.add(u); changed = true; }", "", RT),
  M("R08-healthy-remapped", RL, "const bad = new Set([...graph.keys()].filter(u => u === entry || poisoned(u)));", "const bad = new Set([...graph.keys()]);", RT),
  M("R09-recovered-remapped", RL, "return [...bad].filter(u => !recovered(u));", "return [...bad];", RT),
  M("R10-no-settled-reuse", RL, "    if (hit) return env.importUrl(hit);\n", "", RT),
  M("R11-never-remap-ignored", RL, 'if (set.some(u => NEVER_REMAP.has(assetName(u)))) throw new Error("recovery-refused");', "", RT),
  M("R12-no-original-first", RL, "const mod = await original().catch((err: unknown) => {", "const mod = await (attempts > 1 && entry ? (viaRemap = true, remapped(entry)) : original()).catch((err: unknown) => {", RT),
  M("R13-map-unscoped", RL, "for (const u of set) scopes[url(u)] = imports;", "for (const u of set) scopes[u] = imports;", RT),
  M("R14-no-css-relink", RL, "if (attempts > 1 || failedCss.size > 0) await relinkFailedCss(ownCss);", "", RT),
  M("R15-shape-unchecked", RL, 'if (!isComponent(component)) throw new Error("recovery-shape");', "", RT),
  M("R16-shared-no-pick", RL, "const component = viaRemap && options.shared ? pickShared(mod) : mod?.default;", "const component = mod?.default;", RT),
  // Review fix 1 — the runtime gaps the review found (each killed by a review-fix-1 test).
  M("R17-no-serialization", RL, "const run = queue.then(task);", "const run = task();", RT),
  M("R18-css-relink-fail-open", RL, 'if ([...own].some(css => failedCss.has(css))) throw new Error("recovery-css");', "", RT),
  M("R19-css-first-only", RL, 'link.addEventListener("error", () => { states.set(url, "failed"); if (css) failedCss.add(url); }, { once: true });', 'link.addEventListener("error", () => { states.set(url, "failed"); }, { once: true });', RT),
  M("R20-inflight-ignored", RL, 'if (set.some(u => inflight.has(u))) throw new Error("recovery-busy");', "", RT),
  M("R21-no-import-bound", RL, 'return within(importing, limits.import, "recovery-timeout");', "return importing;", RT),
  M("R22-remap-any-browser", RL, "if (entry && cached && (attempts > 1 || settled.size > 0))", "if (entry && (attempts > 1 || settled.size > 0))", RT),
  M("R23-element-accepted", RL, "COMPONENT_TYPES.has((c as { $$typeof?: symbol }).$$typeof as symbol)", "true", RT),
  // Review fix 2 — runtime.
  // (R25 of review fix 2 — "re-link every failed stylesheet" — is now the intended behaviour; see R28-R33.)
  M("R26-no-total-bound", RL, "const set = await within(remapSet(entry, poisoned, u => settled.has(u), edgesOf), limits.total, \"recovery-timeout\");", "const set = await remapSet(entry, poisoned, u => settled.has(u), edgesOf);", RT2),
  M("R27-own-css-unrecorded", RL, "        for (const u of requested) ownCss.add(u);\n", "", RT3),
  // Review fix 3 — runtime.
  M("R28-css-relink-own-only", RL, "await Promise.all([...failedCss].map(css => relink(doc, css)));", "await Promise.all([...failedCss].filter(css => own.has(css)).map(css => relink(doc, css)));", RT3),
  M("R29-no-first-load-relink", RL, "if (attempts > 1 || failedCss.size > 0) await relinkFailedCss(ownCss);", "if (attempts > 1) await relinkFailedCss(ownCss);", RT3),
  M("R30-css-fail-closed-any", RL, 'if ([...own].some(css => failedCss.has(css))) throw new Error("recovery-css");', 'if (failedCss.size > 0) throw new Error("recovery-css");', RT3),
  M("R31-css-relink-not-awaited", RL, "await Promise.all([...failedCss].map(css => relink(doc, css)));", "void Promise.all([...failedCss].map(css => relink(doc, css)));", RT3),
  M("R32-relink-not-shared", RL, "if (running) return running;", "void running;", RT3),
  M("R33-relink-never-cleared", RL, "        relinking.delete(css);\n", "", RT3),
  M("R34-recovered-suspends-again", RL, "return loading.then(m => { current = m.default; return true; }, () => false);", "return loading.then(() => true, () => false);", RF3_T),
  M("R24-shared-pick-ambiguous", RL, "return hits.length === 1 ? (hits[0] as { default: unknown }).default : undefined;", "return hits.length >= 1 ? (hits[0] as { default: unknown }).default : undefined;", RT),
  // The recovery card.
  M("B01-retry-loads-nothing", QEB, "    const ok = await retryFailedLoads([...this.handles]);\n", "    const ok = true;\n", UNITS),
  M("B02-log-leaks", QEB, 'console.error("[QuestionErrorBoundary]", { code: chunk ? "chunk-load" : "runtime" });', 'console.error("[QuestionErrorBoundary]", { code: chunk ? "chunk-load" : "runtime", message: String((error as Error)?.message) });', [...UNITS, ...PAGE_T]),
  M("B03-reload-before-retry", QEB, "    if (this.state.retries === 0) return false;\n", "", PAGE_T),
  M("B04-no-reset-on-new-question", QEB, "return props.resetKey !== state.resetKey ? { failed: false, retries: 0, retrying: false, resetKey: props.resetKey, landed: false, quiet: false } : null;", "return null;", UNITS),
  M("B05-no-focus-follow", QEB, "if (this.restoreFocus) { this.restoreFocus = false; this.placeFocusAfterRecovery(this.token); }", "if (this.restoreFocus) { this.restoreFocus = false; }", [...PAGE_T, ...UNITS]),
  // Review fix 2 — focus after a recovery never lands on an answer control.
  M("B13-focus-on-answer-control", QEB, "      line.focus({ preventScroll: true });\n", "      ((line.nextElementSibling?.querySelector('input,textarea,select,button,[tabindex]') as HTMLElement | null) ?? line).focus({ preventScroll: true });\n", FOCUS_T),
  M("B14-no-landing-line", QEB, "landed: ok && this.restoreFocus && onCard && !this.anchored()", "landed: false", FOCUS_T),
  // Review fix 3 — nothing scrolls after a recovery; the line leaves the name; moved focus is never taken.
  M("B15-line-scrolled-into-view", QEB, "      line.focus({ preventScroll: true });\n      return;", "      line.focus({ preventScroll: true });\n      line.scrollIntoView?.({ block: \"nearest\" });\n      return;", RF3_T),
  M("B16-line-focus-scrolls", QEB, "      line.focus({ preventScroll: true });\n", "      line.focus();\n", RF3_T),
  M("B17-line-stays-in-name", QEB, '"aria-hidden": quiet || undefined', '"aria-hidden": undefined', RF3_T),
  M("B18-line-never-quiet", QEB, "onBlur: () => { if (!this.state.quiet) this.setState({ quiet: true }); }", "onBlur: () => {}", RF3_T),
  M("B19-moved-focus-taken", QEB, ["const onCard = !a || a === document.body || a === document.documentElement || !!(card && card.contains(a));", "if (!line || !idle()) {"], ["const onCard = true;", "if (!line) {"], RF3_T),
  M("B21-swap-mid-press", QEB, "    await pointerReleased();\n", "", RF3_T),
  M("B22-press-elsewhere-ignored", QEB, "if (press.t >= started && !(cardNow && press.target instanceof Node && cardNow.contains(press.target))) this.restoreFocus = false;", "void press;", RF3_T),
  M("H01-finger-not-tracked", HOLD, 'document.addEventListener("touchstart", e => { touch = true; down(e); }, opts);', 'document.addEventListener("touchstart", e => { down(e); }, opts);', RF3_T),
  M("H02-short-press-cap", HOLD, "export async function pointerReleased(capMs = 60_000, settleMs = 60)", "export async function pointerReleased(capMs = 10_000, settleMs = 60)", RF3_T),
  M("C01-hidden-line-focus-invisible", UICSS, ".eb-visually-hidden[data-recovery-line]:focus-visible + * {", ".eb-visually-hidden[data-recovery-line]:focus-visible + .none {", RF3_T),
  M("B20-anchor-takes-moved-focus", QEB, "if (!this.mounted || token !== this.token || !idle()) return;", "if (!this.mounted || token !== this.token) return;", RF3_T),
  M("B06-stem-card-not-text", CARD, '<QuestionErrorBoundary resetKey={id} variant="stem" fallback={plain}>', "<QuestionErrorBoundary resetKey={id}>", STEM_T),
  M("B07-refocus-steals", QEB, "if (wasOnCard && (!active || active === document.body || active === document.documentElement)) this.retryRef.current?.focus();", "this.retryRef.current?.focus();", UNITS),
  M("B08-retry-every-loader", QEB, "    const ok = await retryFailedLoads([...this.handles]);\n", "    const ok = await retryFailedLoads();\n", UNITS),
  M("B09-guidance-not-describing", QEB, "aria-describedby={afterRetry ? guidanceId : v === \"stem\" || v === \"inline\" ? noteId : undefined}", "aria-describedby={undefined}", PAGE_T),
  M("B10-stem-silent", QEB, '    if (v === "stem" || v === "inline") {\n', '    if (v === "stem" || v === "inline") return this.props.fallback;\n    if (false) {\n', STEM_T),
  M("B12-css-failure-logged-runtime", QEB, " || /^Unable to preload CSS/.test(msg)", "", UNITS),
  M("B11-student-wording-everywhere", QEB, 'private exam() { return this.context.scope === "exam"; }', "private exam() { return true; }", UNITS),
  // Reload gating, focus, timer and announcer on the page.
  M("P01-reload-in-strict", PAGE, 'reloadAllowed:policy!=="strict"&&online&&saveKind==="saved"', 'reloadAllowed:online&&saveKind==="saved"', PAGE_T),
  M("P02-reload-unsaved", PAGE, 'reloadAllowed:policy!=="strict"&&online&&saveKind==="saved"&&!submitBusy', 'reloadAllowed:policy!=="strict"&&online&&!submitBusy', PAGE_T),
  M("P03-focus-on-open", PAGE, 'if(prev===screen||prev==="loading")return;', "if(prev===screen)return;", PAGE_T),
  M("P04-no-result-focus", PAGE, '  }else if(screen==="result"||screen==="strict"){', '  }else if(false){', PAGE_T),
  M("P05-no-start-focus", PAGE, '  if(screen==="exam"){\n   const el=view==="review"', '  if(false){\n   const el=view==="review"', PAGE_T),
  M("P07-timer-no-memory", PAGE, "next.record.forEach(t=>d.add(t));writeTimerNotices(timerAttempt,d);", "next.record.forEach(t=>d.add(t));", PAGE_T),
  M("P08-reload-offline", PAGE, 'reloadAllowed:policy!=="strict"&&online&&saveKind==="saved"', 'reloadAllowed:policy!=="strict"&&saveKind==="saved"', PAGE_T),
  M("P09-transition-smooth", PAGE, 'window.scrollTo({top:0,behavior:"auto"});\n   revealElement(el);', "window.scrollTo({top:0,behavior});\n   revealElement(el);", PAGE_T),
  M("P10-timer-off-screen", PAGE, 'if(screen!=="exam"||!timerAttempt||remainingMs===null||expired)return;', "if(!timerAttempt||remainingMs===null||expired)return;", PAGE_T,
    "defence in depth: the announcer is rendered only by the questions-screen return; every other screen returns earlier, so announce() returns false there and nothing is recorded (RF1-P5 covers the observable rule)"),
  M("P12-announcer-never-cleared", ANNR, "clock.setTimeout(() => { if (el.firstChild === span) el.replaceChildren(); }, ANNOUNCEMENT_CLEAR_MS);", "void 0;", ANN_T),
  M("P11-announcer-no-settle", ANNR, "wait = Math.max(readyAt - t, last + ANNOUNCEMENT_GAP_MS - t);", "wait = last + ANNOUNCEMENT_GAP_MS - t;", ANN_T),
  M("P13-announcer-no-gap", ANNR, "wait = Math.max(readyAt - t, last + ANNOUNCEMENT_GAP_MS - t);", "wait = readyAt - t;", ANN_T),
  M("P14-announcer-drop-silent", ANNR, "dropped.forEach(m => m.onDropped?.());", "void dropped;", ANN_T),
  M("P15-announcer-drop-delivered", ANNR, "dropped.forEach(m => m.onDropped?.());", "dropped.forEach(m => m.onDelivered?.());", ANN_T),
  M("P17-reload-while-pausing", PAGE, '&&!submitBusy&&!pausing,strict:', '&&!submitBusy,strict:', RF3_T),
  M("P18-reload-while-submitting", PAGE, '&&!submitBusy&&!pausing,strict:', '&&!pausing,strict:', RF3_T),
  M("P19-anchor-scrolls", PAGE, 'h.focus({preventScroll:true});return true}};', 'h.focus({preventScroll:true});h.scrollIntoView?.({block:"start"});return true}};', RF3_T),
  M("P20-anchor-focus-scrolls", PAGE, 'h.focus({preventScroll:true});return true}};', 'h.focus();return true}};', RF3_T),
  M("P16-review-anchor", PAGE, 'const h=view==="review"?reviewHeadingRef.current:questionHeadingRef.current;if(!h)return false;', "const h=questionHeadingRef.current;if(!h)return false;", PAGE_T),
  // Keyboard-only reveal (the blockers).
  M("K01-reveal-pointer-focus", REVEAL, "if (!el || pointerDown || intent < 0 || intent <= pointerAt || t - intent > KEY_INTENT_MS || (o.skip && el.matches(o.skip))) return;", "if (!el) return;", REVEAL_T),
  M("K08-reveal-programmatic-focus", REVEAL, " || (o.skip && el.matches(o.skip))) return;", ") return;", RF3_T),
  M("P21-line-not-skipped", PAGE, 'skip:"#iex-page-heading,.iex-review-title,["+RECOVERY_LINE_ATTRIBUTE+"]"', 'skip:"#iex-page-heading,.iex-review-title"', RF3_T),
  M("K02-reveal-while-pointer-down", REVEAL, "if (!el || pointerDown || intent < 0", "if (!el || intent < 0", REVEAL_T),
  M("K03-reveal-any-key", REVEAL, "const onKey = (e: KeyboardEvent) => { if (NAV_KEYS.has(e.key)) keyAt = now(); };", "const onKey = () => { keyAt = now(); };", REVEAL_T),
  M("K04-reveal-not-consumed", REVEAL, "    keyAt = -1;                                                         // one key press explains at most one focus change\n", "", REVEAL_T),
  M("K06-reveal-smooth", REVEAL, 'o.win.scrollBy({ top: d, left: 0, behavior: "auto" });', 'o.win.scrollBy({ top: d, left: 0, behavior: "smooth" });', [...REVEAL_T, "src/StudentExamPage.ux21e3.test.tsx"]),
  M("K07-reveal-fixed-layer", REVEAL, 'if (o.win.getComputedStyle?.(n).position === "fixed") return;', "void n;", REVEAL_T),
  M("K05-reveal-no-frame-recheck", REVEAL, "if (pointerDown || pointerAt > intent || o.doc.activeElement !== el) return;", "", REVEAL_T),
  // Announcement rules.
  M("A01-timer-repeat", ANN, "const due = TIMER_THRESHOLDS_MS.filter(t => remainingMs <= t && !announced.has(t));", "const due = TIMER_THRESHOLDS_MS.filter(t => remainingMs <= t);", [...UNITS, ...PAGE_T]),
  M("A02-timer-early", ANN, "const due = TIMER_THRESHOLDS_MS.filter(t => remainingMs <= t && !announced.has(t));", "const due = TIMER_THRESHOLDS_MS.filter(t => remainingMs <= t + 60_000 && !announced.has(t));", [...UNITS, ...PAGE_T]),
  M("A03-save-noisy", ANN, 'if (next === "saved" && problemOpen) return', 'if (next === "saved") return', [...UNITS, ...PAGE_T]),
  M("A04-label-live-again", SAVE, '<span className={"iex-save-state iex-save-" + kind}>', '<span className={"iex-save-state iex-save-" + kind} role="status" aria-live="polite">', ["src/StudentExamPage.ux7b1.test.tsx", "src/StudentExamPage.reliability.test.tsx", ...PAGE_T]),
  // LTR islands.
  M("L01-cli-not-isolated", FIELD, '<pre className="iex-cli" dir="ltr">', '<pre className="iex-cli">', PAGE_T),
  M("L02-physics-title-ltr", LAB, ' direction="rtl" textAnchor="end">{conserved', '>{conserved', UNITS),
  M("L03-island-drops-bdi", LTR, 'out.push(createElement("bdi", { dir: "ltr", key: key++ }, m[0]));', "out.push(m[0]);", [...UNITS, "src/pwa/InstallAppCard.6a.test.tsx"]),
  M("L04-grade-any-preview", BELL, "view.grade ? isolateLtr(", "true ? isolateLtr(", BELL_T),
  M("L06-grade-not-exposed", PRES, 'preview, icon: "review", grade };', 'preview, icon: "review" };', BELL_T),
  M("V01-keys-read-twice", HOT, 'id={hintId + "-keys"} aria-hidden="true">', 'id={hintId + "-keys"}>', UNITS),
  M("D01-chart-reload-in-exam", CHART, 'const inExam = useContext(QuestionRecoveryContext).scope === "exam";', "const inExam = (useContext(QuestionRecoveryContext), false);", ["src/charts/DataChartRetry.rf2.test.tsx", "src/charts/DataChartRetry.21a1.test.tsx"]),
  M("L05-grade-unbounded", LTR, "export const GRADE_LTR = /(?<![\\d/]|\\d\\.)\\d+(?:\\.\\d+)?\\s*\\/\\s*\\d+(?:\\.\\d+)?(?![\\d/]|\\.\\d)/g;", "export const GRADE_LTR = /\\d+(?:\\.\\d+)?\\s*\\/\\s*\\d+(?:\\.\\d+)?/g;", UNITS),
  // The build guard (review fix 1).
  M("G01-guard-name-unchecked", GUARD, "if (base !== d[3]) failures.push(", "if (false) failures.push(", GUARD_T),
  M("G02-guard-neverremap-unread", GUARD, "if (neverRemap.includes(name)) failures.push(", "if (false) failures.push(", GUARD_T),
  M("G04-guard-alias-unchecked", GUARD, "for (const r of line.matchAll(RECOVERY_REFERENCE)) failures.push(", "for (const r of []) failures.push(", GUARD_T),
  M("G05-guard-symlink-skip", GUARD, "realOf(path.resolve(process.argv[1])) === realOf(fileURLToPath(import.meta.url))", "path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)", GUARD_T),
  M("G03-guard-no-minimum", GUARD, "if (decls.length < MIN_RECOVERABLE_DECLARATIONS) failures.push(", "if (false) failures.push(", GUARD_T),
];

const sha = s => crypto.createHash("sha256").update(s).digest("hex"), files = [...new Set(mutants.map(m => m.file))];
// One backup per checkout (review fix 2): a run in one worktree never "restores" another worktree's stale backup.
const BACKUP = path.join(os.tmpdir(), "exambank-21e3-mutation-backup-" + sha(fs.realpathSync(process.cwd())).slice(0, 12) + ".json");
if (fs.existsSync(BACKUP)) { const stale = JSON.parse(fs.readFileSync(BACKUP, "utf8")); for (const [file, contents] of Object.entries(stale)) fs.writeFileSync(file, contents, "utf8"); fs.rmSync(BACKUP, { force: true }); console.log("21E3_MUTATION_RESTORED_STALE_BACKUP"); }
if (process.argv.includes("--restore")) process.exit(0);
const only = (process.env.ONLY || "").split(",").filter(Boolean);
const selected = only.length ? mutants.filter(m => only.includes(m.id)) : mutants;
const original = new Map(files.map(file => [file, fs.readFileSync(file, "utf8")]));
const restore = () => { for (const [file, contents] of original) fs.writeFileSync(file, contents, "utf8"); fs.rmSync(BACKUP, { force: true }); };
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => { restore(); process.exit(130); });
const hashes = Object.fromEntries([...original].map(([file, value]) => [file, sha(value)]));
const dirty = spawnSync("git", ["status", "--porcelain", "--", ...files], { encoding: "utf8" });
if (dirty.status !== 0 || dirty.stdout.trim()) { console.error("Mutated sources must start clean.", dirty.stdout); process.exit(3); }
const vitest = tests => spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--reporter=dot", ...tests], { encoding: "utf8", timeout: 240000, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, CI: "true", NO_COLOR: "1" } });
const all = [...new Set(selected.flatMap(m => m.tests))], baseline = vitest(all);
if (baseline.status !== 0) { console.error("BASELINE RED", baseline.stdout.slice(-5000), baseline.stderr.slice(-3000)); process.exit(4); }
console.log("21E3_MUTATION_BASELINE_GREEN", JSON.stringify({ tests: all, mutants: selected.length, files: hashes }));
const ledger = [];
fs.writeFileSync(BACKUP, JSON.stringify(Object.fromEntries(original)), "utf8");
try {
  for (const m of selected) {
    let outcome = "invalid", diagnostic = "", killedBy = [];
    const source = original.get(m.file), pairs = edits(m), occ = pairs.map(([b]) => source.split(b).length - 1);
    if (occ.some(n => n !== 1)) diagnostic = "needle count " + occ.join(",");
    else if (pairs.some(([b, a]) => b === a)) diagnostic = "mutation identical";
    else {
      try {
        fs.writeFileSync(m.file, pairs.reduce((text, [b, a]) => text.replace(b, a), source), "utf8");
        const r = vitest(m.tests), output = (r.stdout || "") + "\n" + (r.stderr || "");
        if (r.error?.code === "ETIMEDOUT" || r.signal) { outcome = "timeout"; diagnostic = String(r.error || r.signal); }
        else if (r.status === 0) { outcome = m.equivalent ? "equivalent" : "survived"; diagnostic = m.equivalent ? "Selected tests passed; declared equivalent: " + m.equivalent : "Selected tests passed"; }
        else if (/Transform failed|Failed to parse source|SyntaxError:|Unexpected token|Error during transform/.test(output)) { outcome = "invalid"; diagnostic = output.slice(-800); }
        else {
          outcome = "killed";
          const lines = output.split("\n");
          diagnostic = lines.filter(x => /Test Files|Tests +/.test(x)).slice(0, 2).join(" ").slice(0, 300);
          // The failing tests that killed the mutant (AGENTS.md §13: "killed by which test").
          killedBy = [...new Set(lines.map(x => /FAIL\s+(\S+\.test\.\w+\s+>.+?)\s*$/.exec(x)?.[1]).filter(Boolean))].slice(0, 6);
        }
      } finally { fs.writeFileSync(m.file, source, "utf8"); }
    }
    const record = { id: m.id, file: m.file, outcome, diagnostic, killedBy };
    ledger.push(record);
    console.log("21E3_MUTATION_RESULT", JSON.stringify(record));
  }
} finally { restore(); }
const verified = files.every(f => sha(fs.readFileSync(f, "utf8")) === hashes[f]), git = spawnSync("git", ["diff", "--exit-code", "--", ...files], { encoding: "utf8" });
const counts = Object.fromEntries(["killed", "equivalent", "survived", "invalid", "timeout"].map(s => [s, ledger.filter(r => r.outcome === s).length]));
const report = { baseline: "green", source_sha256: hashes, restored: verified && git.status === 0, counts, mutants: ledger };
fs.mkdirSync("artifacts/phase-21e3", { recursive: true });
fs.writeFileSync("artifacts/phase-21e3/mutation-ledger.json", JSON.stringify(report, null, 2) + "\n");
console.log("21E3_MUTATION_SUMMARY", JSON.stringify({ restored: report.restored, counts, report: "artifacts/phase-21e3/mutation-ledger.json" }));
if (!report.restored || counts.invalid || counts.timeout || counts.survived) process.exitCode = 1;
