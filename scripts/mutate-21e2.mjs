#!/usr/bin/env node
// Phase 21E.2 mutation certification (AGENTS.md §9): one source mutation at a time in an independent Vitest process, SHA-256
// verified byte-for-byte restoration (also on SIGINT / SIGTERM / SIGHUP and from a stale backup after a hard kill), no parallel
// mutations, a TIMEOUT is never counted as KILLED, a machine-readable ledger. Reference: runner/tests/mutation/load-mutations.js
// and scripts/mutate-function-graphs-21a2.mjs. `--restore` only restores a stale backup. `--only=ID,ID` runs a subset.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { spawnSync } from "node:child_process";

const T = {
  exportsUnit: "src/teacher/teacherExports.21e2.test.ts",
  exportsPanel: "src/AssignmentsPanel.export.21e2.test.tsx",
  dashboard: "src/TeacherDashboard.chartTables.21e2.test.tsx",
  dashboardOld: "src/TeacherDashboard.test.tsx",
  field: "src/fieldFrame.21e2.test.tsx",
  freeze: "src/compoundFreeze.20d.test.tsx",
  icons: "src/builderIconButtons.8e7.test.tsx",
  labels: "src/teacher/saveLabels.guard.21e2.test.ts",
  surface: "src/ui/useModalSurface.21e2.test.tsx",
  toolbar: "src/builder/BuilderToolbar.21e2.test.tsx",
  reviewFixes: "src/builder/reviewFixes.21e2.test.tsx",
  liveChallenge: "src/games/liveChallenge/LiveChallengeGenerator.test.tsx",
  actionMenuK1: "src/ui/ActionMenu.reviewK1.21e2.test.tsx",
  surfaceK2: "src/ui/useModalSurface.reviewK2.21e2.test.tsx",
  builderK2: "src/StructuredExamBuilder.reviewK2.21e2.test.tsx",
  appK2: "src/App.builderFocus.reviewK2.21e2.test.tsx",
  inlineK3: "src/builder/inlineIssues.reviewK3.21e2b.test.tsx",
  inlineWiring: "src/builder/inlineIssuesWiring.21e2b.test.tsx",
  inlineRF3: "src/builder/inlineIssues.reviewRF3.21e2b.test.tsx",
  issueIndexRF3: "src/builder/issueIndex.rf3.21e2b.test.ts",
  sticky: "src/builder/stickyLayers.reviewRF3.21e2b.test.tsx",
  explorer: "src/builder/explorer.reviewRF3.21e2b.test.tsx",
  saveStatus: "src/builder/saveStatus.reviewRF3.21e2b.test.tsx",
  reliability: "src/StructuredExamBuilder.reliability.test.tsx",
  productivity: "src/structuredExamProductivity.test.ts",
  continuity: "src/StructuredExamBuilder.focusContinuity.reviewRF4.21e2b.test.tsx",
  menuScroll: "src/ui/ActionMenu.scrollFocus.reviewRF4.21e2b.test.tsx",
  rf2Focus: "src/StructuredExamBuilder.reviewFix2.21e1s2rf2.test.tsx",
  saveStatus4: "src/builder/saveStatus.reviewRF3.21e2b.test.tsx",
  follow: "src/StructuredExamBuilder.followEdits.reviewRF4.21e2b.test.tsx",
  mediaSave: "src/StructuredExamBuilder.mediaSave.test.tsx",
  historyModal: "src/StructuredExamBuilder.historyUnderModal.reviewRF4.21e2b.test.tsx",
  issueFallback: "src/builder/issueFallback.reviewRF4.21e2b.test.tsx",
  inlineRF2: "src/builder/inlineIssues.reviewRF2.21e2b.test.tsx",
  saveFeedback: "src/builder/saveFeedback.reviewRF4.21e2b.test.tsx"
};
const M = (id, file, before, after, tests, what) => ({ id, file, before, after, tests, what });
const mutants = [
  // G — exports
  M("G1-filtered-rows", "src/AssignmentsPanel.tsx", "gradebookCsvRows(resultsFor,results,rowGrading)", "gradebookCsvRows(resultsFor,visibleResults,rowGrading)", [T.exportsPanel], "gradebook export uses the searched / filtered subset"),
  M("G2-row-order", "src/teacher/teacherExports.ts", "for (const s of [...rows].sort(byStudent)) {", "for (const s of [...rows]) {", [T.exportsUnit], "rows follow the input order (unstable)"),
  M("G3-missing-is-zero", "src/teacher/teacherExports.ts", 'Number.isFinite(value) ? value : "");', 'Number.isFinite(value) ? value : 0);', [T.exportsUnit], "a missing value exported as 0"),
  M("G4-private-field", "src/teacher/teacherExports.ts", '      r ? csvDateTime(r.submittedAt) : ""\n    ]);\n  }\n  return out;\n}\n\n/** The subset', '      r ? csvDateTime(r.submittedAt) : "",\n      String((r as unknown as { teacherFeedback?: string })?.teacherFeedback ?? "")\n    ]);\n  }\n  return out;\n}\n\n/** The subset', [T.exportsUnit], "teacher feedback leaks into the gradebook export"),
  M("G5-filename-path", "src/teacher/teacherExports.ts", '/[\\u0000-\\u001f\\u007f\\\\/:*?"<>|]+/g', '/[\\u0000-\\u001f\\u007f:*?"<>|]+/g', [T.exportsUnit], "path separators survive in the download name"),
  M("G6-export-enabled-empty", "src/assignments/Gradebook.tsx", "disabled={p.busy || p.totalRows === 0}", "disabled={p.totalRows < 0}", [T.exportsPanel], "export not disabled while busy / empty"),
  // H — chart tables
  M("H1-null-points", "src/teacher/dashboardChartTables.ts", "return items.filter(x => x.average !== null);", "return items;", [T.dashboard, T.dashboardOld], "the trend table / chart include assignments without an average"),
  M("H2-topic-cap", "src/teacher/dashboardChartTables.ts", "export const TOPIC_CHART_LIMIT = 10;", "export const TOPIC_CHART_LIMIT = 12;", [T.dashboard, T.dashboardOld], "the topic table shows more than the plotted ten"),
  M("H3-after-inside-figure", "src/ui/ChartCard.tsx", '<div className="eb-chart-card-figure" role="img" aria-label={ariaLabel || title}>{content}</div>\n        {after}', '<div className="eb-chart-card-figure" role="img" aria-label={ariaLabel || title}>{content}{after}</div>', [T.dashboard], "the class picker is hidden inside role=img"),
  M("H4-empty-as-figure", "src/ui/ChartCard.tsx", "const isEmpty = empty !== undefined && empty !== null && empty !== false;", "const isEmpty = false;", [T.dashboard], "an empty chart still renders a figure + table toggle"),
  // C — Field frame and field rules
  M("C1-invalid-before-touch", "src/ui/Field.tsx", '  const visibleError = hasError && (showError === "always" || touched || reveal);\n  const describedBy = [help ? helpId : "", visibleError ? errorId : ""].filter(Boolean).join(" ") || undefined;\n  const a11y', '  const visibleError = hasError;\n  const describedBy = [help ? helpId : "", visibleError ? errorId : ""].filter(Boolean).join(" ") || undefined;\n  const a11y', [T.field], "a field turns red before the teacher left it"),
  M("C2-error-not-described", "src/ui/Field.tsx", 'const a11y: FieldA11y = { id, ...(describedBy ? { "aria-describedby": describedBy } : {}),', 'const a11y: FieldA11y = { id,', [T.field], "the error / help is not linked with aria-describedby"),
  M("C3-no-aria-invalid", "src/ui/Field.tsx", '...(visibleError ? { "aria-invalid": true as const } : {}) };', "};", [T.field], "aria-invalid never set"),
  M("C4-reveal-ignored", "src/ui/Field.tsx", "  const reveal = useContext(FieldRevealContext);\n  const [touchedFor, setTouchedFor]", "  const reveal = false && useContext(FieldRevealContext);\n  const [touchedFor, setTouchedFor]", [T.field], "a question's reveal does not show its field errors"),
  M("C5-group-invalid-dropped", "src/ui/Field.tsx", '{children(visibleError ? { "aria-invalid": true, "aria-describedby": errorId } : {})}', "{children({})}", [T.field], "radios of an invalid group are not marked / described"),
  M("C6-marks-zero-valid", "src/teacher/questionFieldIssues.ts", "if (!Number.isFinite(m) || m <= 0) out.marks", "if (!Number.isFinite(m) || m < 0) out.marks", [T.field], "marks of 0 shown as valid (MARKS_PROBLEM blocks finalization)"),
  M("C7-mcq-index-range", "src/teacher/questionFieldIssues.ts", "if (!Number.isInteger(ci) || ci < 0 || ci >= opts.length) out.answer", "if (!Number.isInteger(ci) || ci < 0) out.answer", [T.field], "an out-of-range correct option shown as valid"),
  M("C8-matching-right-side", "src/teacher/questionFieldIssues.ts", 'if (left === "" || right === "") pairs[i]', 'if (left === "") pairs[i]', [T.field], "a pair without its answer is not flagged"),
  M("C9-numeric-reversed-field", "src/teacher/questionFieldIssues.ts", 'else if (i.code === "NUM_RANGE_REVERSED") out.max = i.message;', 'else if (i.code === "NUM_RANGE_REVERSED") out.min = i.message;', [T.field], "a reversed range flags the wrong bound"),
  M("C10-frame-in-compound-parts", "src/QuestionBodyEditor.tsx", 'if (framed && (type === "multipleChoice" || type === "shortAnswer" || type === "matching")) return', 'if ((type === "multipleChoice" || type === "shortAnswer" || type === "matching")) return', [T.freeze, T.icons], "compound@1 part editors change (freeze F-12)"),
  // E — contextual names
  M("E1-generic-question-up", "src/StructuredQuestionEditor.tsx", 'aria-label={"نقل السؤال " + questionLabel + " للأعلى"}', 'aria-label="أعلى"', [T.icons], "the reorder button no longer says which question moves"),
  // F — save vocabulary
  M("F1-literal-save", "src/assignments/AssignmentList.tsx", 'disabled={busy || !inFuture}>{SAVE_LABELS.saveChanges}</button>', 'disabled={busy || !inFuture}>حفظ</button>', [T.labels], "a bare «حفظ» literal comes back"),
  M("F2-draft-equals-final", "src/teacher/saveLabels.ts", 'finalizeExam: "اعتماد نهائي",', 'finalizeExam: "حفظ مسودة",', [T.labels], "finalize labelled like an ordinary save"),
  // B — modal surface
  M("B1-escape-under-dialog", "src/ui/useModalSurface.ts", "if (!surface || event.defaultPrevented || hasModalAbove(surface)) return;", "if (!surface || event.defaultPrevented) return;", [T.surface], "Escape reaches the builder while a dialog is on top"),
  M("B2-no-focus-return", "src/ui/useModalSurface.ts", 'if (opener && opener.isConnected && typeof opener.focus === "function") opener.focus();', "void opener;", [T.surface], "closing the builder drops focus"),
  M("B3-no-tab-wrap", "src/ui/useModalSurface.ts", "if (event.shiftKey && (!inside || current === first || current === surface)) { event.preventDefault(); last.focus(); }", "if (false) { last.focus(); }", [T.surface], "Shift+Tab escapes the surface"),
  // B4: since K2 C-F1 a text field's Escape is the field's own, so the IME-in-a-text-field test alone no longer separates the
  // composition guard; the K2 file's composition on a non-text editor host (EditContext-style) does.
  M("B4-ime-escape", "src/ui/useModalSurface.ts", "if (event.isComposing) return;", "", [T.surface, T.surfaceK2], "an IME composition's Escape exits the builder"),
  // A — toolbar structure
  M("A1-menu-items-visible", "src/builder/BuilderToolbar.tsx", '<ActionMenu label={MORE_MENU_LABEL} text="المزيد" icon={<IconMore size={18} aria-hidden="true" />} className="sb-tb-menu">\n              <MenuItems items={moreItems} />\n            </ActionMenu>', '<MenuItems items={moreItems} />', [T.toolbar], "overflow items rendered as visible buttons (> 8)"),
  // Review Fix (independent adversarial review of the first implementation)
  M("R1-full-identity-in-gradebook", "src/teacher/teacherExports.ts", "      maskedStudentCode(s.studentCode),", "      s.studentCode || \"\",", [T.exportsUnit, T.exportsPanel], "the gradebook export carries the full identity / login number"),
  M("R2-code-back-in-drill", "src/teacher/teacherExports.ts", 'export const RESULTS_COLUMNS = ["الطالب", "الحالة",', 'export const RESULTS_COLUMNS = ["الطالب", "كود الطالب", "الحالة",', [T.exportsUnit, T.dashboard], "the drill export grows an extra column (identity) the screen never shows"),
  M("R3-touch-key-ignored", "src/ui/Field.tsx", "const touched = touchedFor === touchKey;", "const touched = touchedFor !== null;", [T.field], "a visited state moves onto another pair after a delete"),
  M("R4-type-change-reuses-frame", "src/QuestionBodyEditor.tsx", "<FramedLegacyEditor key={type} node={node}", "<FramedLegacyEditor node={node}", [T.field], "a type change inherits the previous type's visited state"),
  M("R5-composer-always-framed", "src/QuestionComposer.tsx", "disabled={disabled} framed={framed} />}", "disabled={disabled} framed />}", [T.field, T.liveChallenge], "Live Challenge shows exam-finalization errors"),
  M("R6-menu-under-overlay", "src/page-parts.css", "z-index:calc(var(--eb-z-modal) + 1);", "z-index:var(--eb-z-dropdown);", [T.reviewFixes], "toolbar menus paint under the builder overlay"),
  M("R7-tab-leaves-menu-open", "src/ui/ActionMenu.tsx", "        if (!panel || !trigger || !panel.contains(document.activeElement)) return;\n        e.preventDefault(); e.stopPropagation();", "        if (!panel || !trigger || !panel.contains(document.activeElement)) return;\n        return;", [T.reviewFixes], "Tab from a menu item leaves the page / surface with the menu open"),
  M("R8-tab-no-modal-wrap", "src/ui/ActionMenu.tsx", "order[at + 1] || (modal ? order[0] : trigger)", "order[at + 1] || trigger", [T.reviewFixes], "Tab from the last menu inside a modal surface does not wrap"),
  M("R9-mcq-options-message-hidden", "src/QuestionBodyEditor.tsx", "error={[issues.options, issues.answer].filter(Boolean).join(\" \")}", "error={issues.answer || issues.options}", [T.field], "the blocking MISSING_OPTIONS message is hidden behind «choose the answer»"),
  M("A2-toggle-state-lost", "src/builder/BuilderToolbar.tsx", "aria-pressed={item.pressed === undefined ? undefined : item.pressed}", "", [T.toolbar], "a menu toggle loses its pressed state"),
  // Review cluster K1 — the shared ActionMenu as used by the builder toolbar (A-F1 focus, A-F2 placement / own scroll, C-F6 portal host)
  M("K1-1-focus-before-settle", "src/ui/ActionMenu.tsx", "    settleVisibility(panel);                                             // A-F1: never focus a control that is still hidden\n", "", [T.actionMenuK1], "focus issued while the reveal's visibility transition is still at its first instant"),
  M("K1-2-settle-every-transition", "src/ui/ActionMenu.tsx", '.transitionProperty !== "visibility") continue;', '.transitionProperty === "never") continue;', [T.actionMenuK1], "every transition in the panel is cut short"),
  M("K1-3-no-frame-retry", "src/ui/ActionMenu.tsx", '    if (document.activeElement === first || typeof requestAnimationFrame !== "function") return;', "    return;", [T.actionMenuK1], "no retry where getAnimations is missing"),
  M("K1-4-retry-steals-focus", "src/ui/ActionMenu.tsx", "(active === triggerRef.current || active === document.body || active === null)", "(true)", [T.actionMenuK1], "the retry pulls focus back from where the user moved it"),
  M("K1-5-viewport-cap-always", "src/ui/ActionMenu.tsx", "const maxHeight = p.height <= room ? cap : Math.max(Math.min(MIN_PANEL, cap), room);", "const maxHeight = cap;", [T.actionMenuK1], "a panel taller than its room runs off-screen"),
  M("K1-6-old-side-choice", "src/ui/ActionMenu.tsx", "const below = p.height <= roomBelow || (p.height > roomAbove && roomBelow >= roomAbove);", "const below = p.height <= roomBelow || p.height > roomAbove;", [T.actionMenuK1], "below even when above has more room"),
  M("K1-7-no-bottom-clamp", "src/ui/ActionMenu.tsx", "Math.max(gap, Math.min(t.bottom + gap, vh - gap - height))", "t.bottom + gap", [T.actionMenuK1], "a minimum-height panel below a tall trigger ends off-screen"),
  M("K1-8-own-scroll-closes", "src/ui/ActionMenu.tsx", "      if (e.type === \"scroll\" && e.target instanceof Node && panelRef.current?.contains(e.target)) return;\n", "", [T.actionMenuK1], "the panel's own scroll closes the menu"),
  M("K1-9-every-scroll-ignored", "src/ui/ActionMenu.tsx", "if (e.type === \"scroll\" && e.target instanceof Node && panelRef.current?.contains(e.target)) return;", "if (e.type === \"scroll\") return;", [T.actionMenuK1], "a page / ancestor scroll no longer closes the menu"),
  M("K1-10-portal-body", "src/ui/ActionMenu.tsx", "        host ?? document.body\n", "        document.body\n", [T.actionMenuK1], "the panel leaves the aria-modal surface"),
  M("K1-11-rebase-ignored", "src/ui/ActionMenu.tsx", "    if (rebasesFixed(el)) return document.body;", "    if (false) return document.body;", [T.actionMenuK1], "a transformed / filtered surface hosts a fixed panel (wrong coordinates)"),
  M("K1-12-overscroll-dropped", "src/page-parts.css", "\n  overscroll-behavior:contain;", "\n", [T.actionMenuK1], "the panel's scroll chains into the page under it"),
  // Review cluster K2 — the builder overlay as a modal surface (C-F1 Escape in text fields, A-F3 focus in / back, C-F4 reveal clearance)
  M("K2-1-escape-in-field-exits", "src/ui/useModalSurface.ts", "        if (isTextEditingTarget(event.target)) return;                // C-F1: the field's own Escape (a search box clears itself)\n", "", [T.surfaceK2, T.builderK2], "Escape typed in a text field / the explorer search exits the builder"),
  M("K2-2-escape-in-field-prevented", "src/ui/useModalSurface.ts", "        if (isTextEditingTarget(event.target)) return;                // C-F1: the field's own Escape (a search box clears itself)\n        event.preventDefault();\n", "        event.preventDefault();\n        if (isTextEditingTarget(event.target)) return;\n", [T.surfaceK2, T.builderK2], "no exit, but the native Escape (search clear) is still cancelled"),
  M("K2-3-no-settle", "src/ui/useModalSurface.ts", "    focusSurface(surface);\n  }, [ref, active]);", "  }, [ref, active]);", [T.surfaceK2], "a layer closing in the same update leaves focus behind the aria-modal surface"),
  M("K2-4-settle-ignores-modal-above", "src/ui/useModalSurface.ts", "if (!surface || (a && surface.contains(a)) || hasModalAbove(surface)) return;", "if (!surface || (a && surface.contains(a))) return;", [T.surfaceK2], "the settle step steals focus from a modal layer above"),
  M("K2-5-body-is-an-opener", "src/ui/useModalSurface.ts", "current !== document.body && ", "", [T.surfaceK2, T.appK2], "<body> recorded as the opener"),
  M("K2-6-no-fallback-focus", "src/ui/useModalSurface.ts", "        if (target && target.isConnected) target.focus();", "        void target;", [T.surfaceK2, T.appK2], "closing with no opener drops focus on <body>"),
  M("K2-7-fallback-before-render", "src/ui/useModalSurface.ts", "      void Promise.resolve().then(() => {", "      void [0].forEach(() => {", [T.surfaceK2, T.appK2], "the return target is read during the closing commit, before it is rendered"),
  M("K2-8-no-reactivation-guard", "src/ui/useModalSurface.ts", "        if (ACTIVE.has(surface)) return;\n", "", [T.surfaceK2], "StrictMode's simulated unmount sends focus out of the open surface"),
  M("K2-9-fallback-steals-placed-focus", "src/ui/useModalSurface.ts", "        if (!focusLost() && !(a && surface.contains(a))) return;\n", "", [T.surfaceK2], "the return target overrides focus the closing update placed on purpose"),
  M("K2-10-static-toolbar-band", "src/StructuredExamBuilder.tsx", '    const toolbarSticky = !!bar && !isStaticBox(bar);\n', '    const toolbarSticky = !!bar;\n', [T.builderK2], "a static (phone / 200 %) toolbar still reserves its whole resting band"),
  M("K2-11-app-no-return-target", "src/App.tsx", "              returnFocusTo={() => continueStructuredRef.current ?? savedExamsToggleRef.current}\n", "", [T.appK2], "App passes no return target"),
  M("K2-12-app-wrong-return-target", "src/App.tsx", "continueStructuredRef.current ?? savedExamsToggleRef.current", "savedExamsToggleRef.current", [T.appK2], "App returns focus to the toggle although «متابعة …» is there"),
  M("K2-13-builder-drops-target", "src/StructuredExamBuilder.tsx", "useModalSurface(surfaceRef, true, () => { if (!saving) void requestExit(); }, returnFocusTo);", "useModalSurface(surfaceRef, true, () => { if (!saving) void requestExit(); });", [T.appK2], "the builder never forwards App's return target"),
  // Review cluster K3 — inline issues (C-F3 reveal derived, C-F5 announcer per exam, A-F4 named issue list, A-F6 clicked issue's field,
  // A-F7 glyphs not spoken). The focus outline of a pointer-opened list is CSS: only the real-browser harness check R-3 sees it.
  M("K3-1-reveal-latched", "src/StructuredExamBuilder.tsx", "  if ([...revealedQuestions.keys()].some(id => !hasError(id))) {", "  if (false) {", [T.inlineK3], "the reveal outlives the question's issues (a later empty row is red before it is visited)"),
  M("K3-2-announcer-keeps-baseline", "src/builder/useIssueAnnouncer.ts", '    if (last.current.identity !== identity) { last.current = { identity, key }; setText(""); return; }   // another exam: a new baseline\n', "", [T.inlineK3], "another exam's counts are announced after it opens"),
  M("K3-3-announcer-keeps-text", "src/builder/useIssueAnnouncer.ts", 'last.current = { identity, key }; setText(""); return; }', "last.current = { identity, key }; return; }", [T.inlineK3], "the previous exam's sentence stays (and comes back with that exam)"),
  M("K3-4-builder-no-identity", "src/StructuredExamBuilder.tsx", "useIssueAnnouncer(errors.length, warnings.length, ISSUE_SETTLE_MS, exam.examId)", "useIssueAnnouncer(errors.length, warnings.length, ISSUE_SETTLE_MS)", [T.inlineK3], "the builder does not tell the announcer which exam it shows"),
  M("K3-5-list-not-focusable", "src/builder/InlineIssues.tsx", " tabIndex={-1} data-severity", " data-severity", [T.inlineK3, T.inlineWiring, T.builderK2], "the issue list cannot take focus"),
  M("K3-6-question-falls-to-card", "src/StructuredExamBuilder.tsx", "(ownIssueList(el) ?? el).focus({ preventScroll: true });", "el.focus({ preventScroll: true });", [T.inlineK3], "an issue with no control focuses the unnamed card"),
  M("K3-7-section-unnamed", "src/StructuredExamBuilder.tsx", "      if (!list) { revealSection(el); markIssueFocus(el); return; }", "      { revealSection(el); markIssueFocus(el); return; }", [T.inlineK3, T.inlineWiring, T.builderK2], "a section entry focuses the unnamed section"),
  M("K3-8-section-not-aligned", "src/StructuredExamBuilder.tsx", "      markIssueFocus(el);\n      alignSection(el);\n", "      markIssueFocus(el);\n", [T.inlineK3, T.inlineWiring, T.builderK2], "the section heading is not brought below the toolbar"),
  M("K3-9-card-not-aligned", "src/StructuredExamBuilder.tsx", "    } else alignCard(el);", "    }", [T.inlineK3], "the card whose list takes focus is not brought into view"),
  M("K3-10-first-invalid-wins", "src/StructuredExamBuilder.tsx", "      field = showing.length\n        ? showing.map(f => f.querySelector<HTMLElement>(INVALID_FIELD)).find(Boolean) ?? showing.map(f => f.querySelector<HTMLElement>(ENABLED_CONTROL)).find(Boolean)\n        : Array.from(el.querySelectorAll<HTMLElement>(INVALID_FIELD)).find(c => !showsOtherIssue(el, c));", "      field = el.querySelector<HTMLElement>(INVALID_FIELD);", [T.inlineK3], "the first invalid field in DOM order wins over the clicked issue's field"),
  M("K3-11-code-not-passed", "src/StructuredExamBuilder.tsx", "onClick={() => openIssue(target, iss)}", 'onClick={() => openIssue(target, { ...iss, code: "", message: "" })}', [T.inlineK3], "the summary entry does not say which issue was clicked"),
  M("K3-12-frame-no-codes", "src/ui/Field.tsx", '  visible && issueCode ? { "data-issue-codes": issueCode, "data-issue-nth": String(issueNth ?? 1) } : {};', '  visible && issueCode ? { "data-issue-nth": String(issueNth ?? 1) } : {};', [T.inlineK3], "a field frame does not say which issue it shows"),
  M("K3-13-codes-while-valid", "src/ui/Field.tsx", '  visible && issueCode ? { "data-issue-codes": issueCode, "data-issue-nth": String(issueNth ?? 1) } : {};', '  issueCode ? { "data-issue-codes": issueCode, "data-issue-nth": String(issueNth ?? 1) } : {};', [T.inlineK3], "a valid frame still claims its codes"),
  M("K3-14-text-wrong-code", "src/QuestionComposer.tsx", "issueCode={HEADER_FIELD_CODES.text}", "issueCode={HEADER_FIELD_CODES.marks}", [T.inlineK3], "the question text claims MARKS_PROBLEM"),
  M("K3-15-mcq-codes-dropped", "src/QuestionBodyEditor.tsx", "issueCode={fieldIssueCodes(issues, MULTIPLE_CHOICE_FIELD_CODES)}", 'issueCode=""', [T.inlineK3], "the options group does not carry MISSING_OPTIONS / MISSING_ANSWER"),
  M("K3-16-pair-code-dropped", "src/QuestionBodyEditor.tsx", "error={issues.pairs[i]?.right} issueCode={MATCHING_FIELD_CODES.pair}", "error={issues.pairs[i]?.right}", [T.inlineK3], "an incomplete pair's answer does not carry MATCH_INCOMPLETE_PAIR"),
  M("K3-17-numeric-codes-dropped", "src/teacher/questionFieldIssues.ts", "const code = codeOf.get(message); if (code) out[field] = code;", "void codeOf; void message;", [T.inlineK3], "numeric fields carry no codes"),
  M("K3-18-chevron-spoken", "src/StructuredExamBuilder.tsx", '" is-open" : "")} aria-hidden="true" />{errors.length', '" is-open" : "")} />{errors.length', [T.inlineK3], "the disclosure chevron is exposed to assistive technology"),
  M("K3-19-chevron-stuck-open", "src/StructuredExamBuilder.tsx", '(showIssues ? " is-open" : "")} aria-hidden', '" is-open"} aria-hidden', [T.inlineK3], "the chevron no longer follows aria-expanded"),
  M("K3-20-save-glyph-spoken", "src/StructuredExamBuilder.tsx", '<span aria-hidden="true">{SAVE_STATE_GLYPH[saveState]}</span>', "<span>{SAVE_STATE_GLYPH[saveState]}</span>", [T.inlineK3], "the save state's glyph is read out"),
  // Review Fix 3 (owner-listed I-1 … I-4, audit A-01 / A-02, owner observations O-1 / O-2) and its re-review (RR3-1, RR3-3, RR3-A11Y-2)
  M("RF3-I1-part-dropped", "src/StructuredExamBuilder.tsx", "part: issuePartFocus(issue, question) };", "part: null };", [T.inlineRF3], "a part's issue falls back to the card's first invalid field"),
  M("RF3-I2-no-marker", "src/StructuredExamBuilder.tsx", '    a.setAttribute(ISSUE_FOCUS, "");\n', "", [T.inlineRF3], "the control a summary entry focused is never marked (no ring after a pointer click)"),
  M("RF3-I3-duplicates-counted-across-cards", "src/builder/issueIndex.ts", "  if (last < 0) return questionIssues;\n", "  return questionIssues;\n", [T.inlineRF3, T.issueIndexRF3], "a duplicated id's occurrences are counted across every card again"),
  M("RF3-I4-own-saving-string", "src/StructuredExamBuilder.tsx", '<span aria-hidden="true">{SAVE_STATE_GLYPH[saveState]}</span> {savedFinal ? SAVE_LABELS.savedFinal : SAVE_STATE_LABELS[saveState]}</span>}', '<span aria-hidden="true">{SAVE_STATE_GLYPH[saveState]}</span> {savedFinal ? SAVE_LABELS.savedFinal : saveState === "saving" ? "جارٍ الحفظ" : SAVE_STATE_LABELS[saveState]}</span>}', [T.saveStatus, T.reliability], "the status writes its own saving string next to the button's"),
  M("RF3-I4-not-atomic", "src/StructuredExamBuilder.tsx", ' role="status" aria-live="polite" aria-atomic="true"><span aria-hidden="true">{SAVE_STATE_GLYPH', ' role="status" aria-live="polite"><span aria-hidden="true">{SAVE_STATE_GLYPH', [T.saveStatus], "the save status may be read as a fragment"),
  M("RF3-I4-glyph-in-table", "src/teacher/saveLabels.ts", '  saved: "محفوظ",', '  saved: "✓ محفوظ",', [T.labels, T.saveStatus], "a status sentence carries a glyph (read out)"),
  M("RF3-A01-band-unpublished", "src/StructuredExamBuilder.tsx", '    const publish = () => root.style.setProperty(TOOLBAR_BAND_VAR, Math.ceil(bar.getBoundingClientRect().height) + "px");\n', "    const publish = () => {};\n", [T.sticky], "the layers below the toolbar slide under it again"),
  M("RF3-A01-bulk-not-an-edge", "src/StructuredExamBuilder.tsx", "    if (bulk) edge = Math.max(edge, bulk.getBoundingClientRect().bottom);\n", "", [T.sticky], "a heading under the stuck bulk-action bar counts as on screen"),
  M("RF3-A02-static-toolbar-edge", "src/StructuredExamBuilder.tsx", "    let edge = !bar ? 0 : isStaticBox(bar) ? (scrollerOf()?.getBoundingClientRect().top ?? 0) : bar.getBoundingClientRect().bottom;\n", "    let edge = !bar ? 0 : bar.getBoundingClientRect().bottom;\n", [T.sticky], "a scrolled-away static toolbar makes headings above the screen count as visible"),
  M("RF3-O1-explorer-close-to-body", "src/StructuredExamBuilder.tsx", "    (more ?? toolbar)?.focus();\n", "", [T.explorer], "closing the explorer dialog whose opener left leaves focus on <body>"),
  M("RF3-O2-raw-table-preview", "src/structuredExamProductivity.ts", 'const preview = (t: unknown) => navigatorPreviewText(String(t ?? "")).replace(/\\s+/g, " ").trim().slice(0, PREVIEW_MAX);', 'const preview = (t: unknown) => String(t ?? "").replace(/\\s+/g, " ").trim().slice(0, PREVIEW_MAX);', [T.explorer, T.productivity], "the explorer shows a matching question's raw table syntax"),
  M("RR3-1-rich-content-form", "src/builder/issueIndex.ts", ' || message.startsWith(e.name + " — ")', "", [T.issueIndexRF3, T.inlineRF3], "a composite part's rich-content issue names no part"),
  M("RR3-1-composite-label-form", "src/builder/issueIndex.ts", '\n  || (e.part.family === "composite" && message.includes("البند «" + e.label + "»"))', "", [T.issueIndexRF3, T.inlineRF3], "the composite authority's «البند «ب»» form names no part"),
  M("RR3-3-first-row", "src/StructuredExamBuilder.tsx", '.querySelectorAll<HTMLElement>(".sb-field-row")[focus.row - 1]', '.querySelectorAll<HTMLElement>(".sb-field-row")[0]', [T.inlineRF3], "a row issue focuses the part's first row"),
  M("RR3-3-answer-ignored", "src/StructuredExamBuilder.tsx", "focus.answer ? controls.at(-1)", "false ? controls.at(-1)", [T.inlineRF3], "a missing answer focuses the row's item, not its answer"),
  M("RR3-3-unlocatable-row-to-body", "src/builder/issueIndex.ts", ': { part, at: "list" };', ': { part, at: "body" };', [T.issueIndexRF3, T.inlineRF3], "a table cell issue focuses the table's first control"),
  M("RR3-A11Y-2-no-tab-clearance", "src/StructuredExamBuilder.tsx", "      if (scroller && top < edge) scroller.scrollTop", "      if (false) scroller.scrollTop", [T.sticky], "a Tab leaves focus under the sticky layers"),
  M("RR3-A11Y-2-programmatic-adjusted", "src/StructuredExamBuilder.tsx", "      if (!tabbing || !(t instanceof HTMLElement) || inFixedLayer(t)) return;", "      if (!(t instanceof HTMLElement) || inFixedLayer(t)) return;", [T.sticky], "programmatic focus (the reveals) is moved too"),
  M("RR3-A11Y-2-sticky-layer-scrolls", "src/StructuredExamBuilder.tsx", "      if (!tabbing || !(t instanceof HTMLElement) || inFixedLayer(t)) return;", "      if (!tabbing || !(t instanceof HTMLElement)) return;", [T.sticky], "a Tab into the toolbar scrolls the content"),
  // Review Fix 4 — focus continuity (audit A-07, A-08, A-09 / B-04, A-11, A-13) and the ActionMenu scroll / resize close (A-14 / B-05)
  M("RF4-A14-no-trigger-focus", "src/ui/ActionMenu.tsx", "      if (hadFocus && triggerRef.current) focusWithoutScroll(triggerRef.current);\n", "", [T.menuScroll, T.actionMenuK1], "a scroll / resize close leaves keyboard focus on <body>"),
  M("RF4-A14-takes-focus-from-elsewhere", "src/ui/ActionMenu.tsx", "      if (hadFocus && triggerRef.current) focusWithoutScroll", "      if (triggerRef.current) focusWithoutScroll", [T.menuScroll], "a scroll close pulls focus to the trigger from wherever the teacher put it"),
  M("RF4-A14-scrolls-back", "src/ui/ActionMenu.tsx", "      if (hadFocus && triggerRef.current) focusWithoutScroll(triggerRef.current);", "      if (hadFocus && triggerRef.current) triggerRef.current.focus();", [T.menuScroll], "the trigger is focused with a scroll right after the page moved"),
  M("RF4-A07-no-partner", "src/StructuredExamBuilder.tsx", "        if (usable(partner)) { focusWithin(partner, host, \"reveal\"); return; }\n", "", [T.continuity], "a reorder to an end lands on the card / section, not its other reorder button"),
  M("RF4-A07-marker-dropped", "src/StructuredQuestionEditor.tsx", " onClick={() => onMove(1)} data-reorder=\"down\"", " onClick={() => onMove(1)}", [T.continuity], "the question ↓ has no partner marker"),
  M("RF4-A08-no-history-sibling", "src/StructuredExamBuilder.tsx", "        (other ?? toolbar)?.focus({ preventScroll: true });", "        toolbar?.focus({ preventScroll: true });", [T.continuity], "the last undo / redo step lands on the toolbar, not the other history button"),
  M("RF4-A08-toolbar-undo-not-restored", "src/StructuredExamBuilder.tsx", "        if (focusLost()) focusItemOrNeighbour(t.deletion, 0, \"reveal\");\n", "", [T.continuity], "a deletion undone from the toolbar does not focus the restored question"),
  M("RF4-disabled-focus-not-lost", "src/StructuredExamBuilder.tsx", " || !a.isConnected || a.matches(\":disabled\"); };", " || !a.isConnected; };", [T.continuity], "focus on a control that is disabled now counts as placed"),
  M("RF4-A09-native-disabled", "src/StructuredExamBuilder.tsx", "onClick={() => { if (!saving) onSave(\"draft\"); }} disabled={mediaPending}", "onClick={() => { if (!saving) onSave(\"draft\"); }} disabled={saving || mediaPending}", [T.continuity, T.saveStatus4], "«حفظ مسودة» is natively disabled while saving (focus falls to <body>)"),
  M("RF4-A09-draft-no-guard", "src/StructuredExamBuilder.tsx", "onClick={() => { if (!saving) onSave(\"draft\"); }}", "onClick={() => { onSave(\"draft\"); }}", [T.continuity], "a second activation while saving starts a second draft save"),
  M("RF4-A09-final-no-guard", "src/StructuredExamBuilder.tsx", "    if (!onSave || saving) return;", "    if (!onSave) return;", [T.continuity], "a second activation while saving starts a second final save"),
  M("RF4-A09-final-not-aria-disabled", "src/StructuredExamBuilder.tsx", "aria-disabled={saving || !decision.canFinalize || undefined}", "aria-disabled={!decision.canFinalize || undefined}", [T.continuity], "«اعتماد نهائي» is not marked unavailable while saving"),
  M("RF4-A11-last-toggled-ignored", "src/StructuredExamBuilder.tsx", "      const id = lastToggled.current && before.selected.has(lastToggled.current) ? lastToggled.current : questionOrder", "      const id = questionOrder", [T.continuity], "clearing the selection focuses the first selected card, not the last toggled one"),
  M("RF4-A11-bulk-delete-no-neighbour", "src/StructuredExamBuilder.tsx", "      if (removed) {", "      if (false) {", [T.continuity], "a bulk delete does not focus the removed block's surviving neighbour"),
  M("RF4-A11-navigator-ignored", "src/StructuredExamBuilder.tsx", "    if (spot.region === \"navigator\") {", "    if (false) {", [T.continuity], "the explorer's «إلغاء التحديد» does not land on «تحديد الظاهر»"),
  M("RF4-A13-no-neighbour", "src/StructuredExamBuilder.tsx", "      const was = questionOrder(before.exam).find(x => x.id === spot.questionId);\n      if (was) {", "      const was = questionOrder(before.exam).find(x => x.id === spot.questionId);\n      if (false) {", [T.continuity], "a card removed by Ctrl+Z / Ctrl+Y gives focus to its section, not its neighbour"),
  M("RF4-A13-no-follow-back", "src/StructuredExamBuilder.tsx", "      if (item && document.activeElement === back.neighbour) {", "      if (false) {", [T.continuity], "the redo that brings the card back leaves focus on the neighbour"),
  M("RF4-A13-moved-card-ignored", "src/StructuredExamBuilder.tsx", "      if (now) { focusInPlace(now, \"card\", 0, \"reveal\"); return; }\n", "", [T.continuity], "a card re-created in another section is treated as gone"),
  M("RF4-A13-section-gone-ignored", "src/StructuredExamBuilder.tsx", "      if (ids.includes(spot.sectionId)) {", "      if (false) {", [T.continuity], "a section removed by Ctrl+Z gives focus to the toolbar, not its neighbour section"),
  M("RF4-other-disabled-to-toolbar", "src/StructuredExamBuilder.tsx", "      if (host) focusInPlace(host, host.classList.contains(\"sb-question\") ? \"card\" : \"section\", 0, \"reveal\");\n      else toolbar", "      if (false) focusInPlace(host, host.classList.contains(\"sb-question\") ? \"card\" : \"section\", 0, \"reveal\");\n      else toolbar", [T.continuity], "a field disabled under focus lands on the toolbar, not its card"),
  M("RF4-steals-placed-focus", "src/StructuredExamBuilder.tsx", "    if (spot.el.isConnected && !spot.el.matches(\":disabled\")) return null;", "", [T.continuity, T.rf2Focus], "focus the teacher put elsewhere (a plain blur) is pulled back by an unrelated change"),
  M("RF4-toast-not-owned", "src/StructuredExamBuilder.tsx", "    if (!spot || spot.region === \"toast\" || !focusLost()) return null;", "    if (!spot || !focusLost()) return null;", [T.continuity], "the continuity step moves focus while a toast's own recovery is under way"),
  M("RF4-layout-pass-before-explorer-step", "src/StructuredExamBuilder.tsx", "  useLayoutEffect(() => {\n    const was = navDialogWasOpen.current, jump = navJump.current;\n    navDialogWasOpen.current = navDialogOpen;\n    navJump.current = false;\n    if (!was || navDialogOpen || jump || !alive.current || !focusLost()) return;\n    const toolbar = builderRef.current?.querySelector<HTMLElement>(\".sb-toolbar\");\n    const more = Array.from(toolbar?.querySelectorAll<HTMLButtonElement>(\"button\") ?? []).find(b => b.getAttribute(\"aria-label\") === MORE_MENU_LABEL && !b.disabled);\n    (more ?? toolbar)?.focus();\n  }, [navDialogOpen]);                                                   // eslint-disable-line react-hooks/exhaustive-deps\n  // RF4 — the selection UI (the bulk bar, the question explorer) is re-homed in the commit itself (after the explorer-dialog step above,\n  // which keeps its own target): a passive effect of the explorer's dialog (≤ 900 px) would otherwise move focus to that dialog's first\n  // control before the continuity step below runs.\n  useLayoutEffect(() => {\n    const before = continuityBase.current, spot = takenSpot();\n    if (alive.current && before && (spot?.region === \"bulk\" || spot?.region === \"navigator\")) rehomeFocus(spot, before);\n  });                                                                     // eslint-disable-line react-hooks/exhaustive-deps\n", "  // RF4 — the selection UI (the bulk bar, the question explorer) is re-homed in the commit itself (after the explorer-dialog step above,\n  // which keeps its own target): a passive effect of the explorer's dialog (≤ 900 px) would otherwise move focus to that dialog's first\n  // control before the continuity step below runs.\n  useLayoutEffect(() => {\n    const before = continuityBase.current, spot = takenSpot();\n    if (alive.current && before && (spot?.region === \"bulk\" || spot?.region === \"navigator\")) rehomeFocus(spot, before);\n  });                                                                     // eslint-disable-line react-hooks/exhaustive-deps\n  useLayoutEffect(() => {\n    const was = navDialogWasOpen.current, jump = navJump.current;\n    navDialogWasOpen.current = navDialogOpen;\n    navJump.current = false;\n    if (!was || navDialogOpen || jump || !alive.current || !focusLost()) return;\n    const toolbar = builderRef.current?.querySelector<HTMLElement>(\".sb-toolbar\");\n    const more = Array.from(toolbar?.querySelectorAll<HTMLButtonElement>(\"button\") ?? []).find(b => b.getAttribute(\"aria-label\") === MORE_MENU_LABEL && !b.disabled);\n    (more ?? toolbar)?.focus();\n  }, [navDialogOpen]);                                                   // eslint-disable-line react-hooks/exhaustive-deps\n", [T.explorer, T.continuity], "the selection re-home runs before the explorer-dialog step (closing the zoomed explorer lands on the toolbar, not «المزيد»)"),
  // RF4 — follow a structural edit (A-03 «نقل إلى قسم», A-06 ↑ / ↓, A-12 added question / section)
  M("RF4-A03-select-moves", "src/StructuredQuestionEditor.tsx", "onChange={e => setMoveTarget(e.target.value)}", "onChange={e => { setMoveTarget(e.target.value); onMoveToSection(e.target.value); }}", [T.follow, T.continuity], "choosing a section (an ArrowDown on the closed select) moves the question again"),
  M("RF4-A03-button-ignores-choice", "src/StructuredQuestionEditor.tsx", "onClick={() => { if (canMove) onMoveToSection(moveTarget); }}", "onClick={() => { if (canMove) onMoveToSection(sectionOptions.find(s => s.id !== currentSectionId)?.id ?? moveTarget); }}", [T.follow], "«نقل» moves to the first other section, not the chosen one"),
  M("RF4-A03-button-enabled-on-current", "src/StructuredQuestionEditor.tsx", "const canMove = moveTarget !== currentSectionId && !disabled && !mediaPending;", "const canMove = !disabled && !mediaPending;", [T.follow], "«نقل» is enabled while the current section is chosen"),
  M("RF4-A03-media-lock-dropped", "src/StructuredQuestionEditor.tsx", "const canMove = moveTarget !== currentSectionId && !disabled && !mediaPending;", "const canMove = moveTarget !== currentSectionId && !disabled;", [T.follow, T.mediaSave], "«نقل» moves a question whose image is still being processed"),
  M("RF4-A03-deleted-target-kept", "src/StructuredQuestionEditor.tsx", "const moveTarget = sectionOptions.some(s => s.id === pickedTarget) ? pickedTarget : currentSectionId;", "const moveTarget = pickedTarget;", [T.follow], "a chosen section deleted before «نقل» keeps «نقل» enabled (the move would drop the question)"),
  M("RF4-A03-moved-card-not-followed", "src/StructuredExamBuilder.tsx", "    setSections(s => movQTo(s, sectionId, questionId, to));\n    followEdit(\"question\", questionId, true);\n", "    setSections(s => movQTo(s, sectionId, questionId, to));\n", [T.follow], "the card moved with «نقل» is not focused and revealed in its new section"),
  M("RF4-A06-card-not-revealed", "src/StructuredExamBuilder.tsx", "    if (f.kind === \"question\") alignCard(el); else alignSection(el);\n  });", "    if (f.kind === \"question\") void el; else alignSection(el);\n  });", [T.follow], "a card moved with ↑ / ↓ off the screen is not revealed"),
  M("RF4-A06-section-not-revealed", "src/StructuredExamBuilder.tsx", "    if (f.kind === \"question\") alignCard(el); else alignSection(el);\n  });", "    if (f.kind === \"question\") alignCard(el); else void el;\n  });", [T.follow], "a section moved with ↑ / ↓ off the screen is not revealed"),
  M("RF4-A06-pressed-button-ignored", "src/StructuredExamBuilder.tsx", "    if (headingOnScreen(el, 0) && (!control || (control.top >= toolbarBottom() - 1 && control.bottom <= window.innerHeight))) return;", "    if (headingOnScreen(el, 0)) return;", [T.follow], "a moved card whose heading is in view but whose pressed button is off-screen is not revealed"),
  M("RF4-A06-always-scrolls", "src/StructuredExamBuilder.tsx", "    if (headingOnScreen(el, 0) && (!control || (control.top >= toolbarBottom() - 1 && control.bottom <= window.innerHeight))) return;", "", [T.follow], "a moved card still in view scrolls the page anyway"),
  M("RF4-A06-follow-not-settled", "src/StructuredExamBuilder.tsx", "    if (!el) return;\n    follow.current = null;\n", "    if (!el) return;\n", [T.follow], "a settled follow request stays armed: a later, unrelated edit scrolls back to the moved card"),
  M("RF4-A12-take-only-reveals", "src/StructuredExamBuilder.tsx", "    if (f.take) { if (f.kind === \"question\") focusCard(f.id); else revealSection(el); return; }", "    if (f.take) { if (f.kind === \"question\") alignCard(el); else alignSection(el); return; }", [T.follow, T.continuity], "an added / moved card or added section is revealed but not focused"),
  M("RF4-A12-section-not-followed", "src/StructuredExamBuilder.tsx", "    followEdit(\"section\", added.id, true);\n", "", [T.follow], "«+ إضافة قسم» leaves focus on the button"),
  M("RF4-A12-palette-not-followed", "src/ExamSectionEditor.tsx", "} else onAddQuestion(q); onQuestionAdded?.(q.examQuestionId); };", "} else onAddQuestion(q); };", [T.follow], "a question picked in the palette leaves focus on «+ إضافة سؤال»"),
  M("RF4-A12-scenario-not-followed", "src/ExamSectionEditor.tsx", "} else onAddQuestion(q); onQuestionAdded?.(q.examQuestionId); };", "} else { onAddQuestion(q); onQuestionAdded?.(q.examQuestionId); } };", [T.follow], "a question created inside a scenario leaves focus on the scenario's button"),
  M("RF4-A11-selection-after-dialog-trap", "src/StructuredExamBuilder.tsx", "    if (alive.current && before && (spot?.region === \"bulk\" || spot?.region === \"navigator\")) rehomeFocus(spot, before);", "    void before; void spot;", [T.continuity], "the explorer dialog's clear lands on the dialog's first control, not «تحديد الظاهر»"),
  // RF4 — undo / redo under a modal layer (A-04), save feedback (A-10 / B-01, B-06), the issue fallback (A-05, owner-directed)
  M("RF4-A04-history-under-modal", "src/StructuredExamBuilder.tsx", "      if (host && hasModalAbove(host)) return;\n", "", [T.historyModal], "Ctrl+Z / Ctrl+Y change the exam behind the preview, the unsaved-changes guard and a menu's dialog"),
  M("RF4-A04-key-taken-under-modal", "src/StructuredExamBuilder.tsx", "      if (host && hasModalAbove(host)) return;\n      const h = historyRef.current;\n      e.preventDefault();\n", "      const h = historyRef.current;\n      e.preventDefault();\n      if (host && hasModalAbove(host)) return;\n", [T.historyModal], "under a modal layer the history keys still take the key from it (preventDefault)"),
  M("RF4-A04-native-undo-leaks", "src/StructuredExamBuilder.tsx", "      if (hasModalAbove(host)) e.preventDefault();\n", "", [T.historyModal], "the browser's own undo changes a builder field hidden behind the layer"),
  M("RF4-A04-native-undo-any-input", "src/StructuredExamBuilder.tsx", '      if (kind !== "historyUndo" && kind !== "historyRedo") return;\n', "", [T.historyModal], "every edit of a builder field is refused while a layer is open, not only the history steps"),
  M("RF4-A04-native-undo-inner-layer", "src/StructuredExamBuilder.tsx", "      if (layer && !layer.contains(host)) return;", "      void layer;", [T.historyModal], "a layer rendered inside the builder loses its own fields' native undo"),
  M("RF4-A05-first-invalid-again", "src/StructuredExamBuilder.tsx", ".find(c => !showsOtherIssue(el, c));", ".find(() => true);", [T.issueFallback, T.inlineRF2], "an issue no frame shows focuses the first invalid field again (another issue's marks / text / pair)"),
  M("RF4-A05-frameless-control-refused", "src/StructuredExamBuilder.tsx", ".find(c => !showsOtherIssue(el, c));", ".find(() => false);", [T.issueFallback], "an invalid control with no frame code (a rubric row) is never chosen: the named list instead"),
  M("RF4-A10-not-announced", "src/StructuredExamBuilder.tsx", '<span className="sb-stat sb-save-error" role="alert">', '<span className="sb-stat sb-save-error">', [T.saveFeedback], "a failed save is shown but not announced"),
  M("RF4-A10-not-shown", "src/StructuredExamBuilder.tsx", '{error && <span className="sb-stat sb-save-error"', '{false && error && <span className="sb-stat sb-save-error"', [T.saveFeedback], "a failed save shows its reason nowhere"),
  M("RF4-A10-no-failure-words", "src/StructuredExamBuilder.tsx", ' role="alert">{SAVE_LABELS.saveFailed}: {error}</span>}', ' role="alert">{error}</span>}', [T.saveFeedback], "the failure chip shows a bare reason without «تعذّر الحفظ»"),
  M("RF4-B06-stale-notice", "src/StructuredExamBuilder.tsx", '{notice && (noticeKind === "open" || saveState === undefined || saveState === "saved") && ', "{notice && ", [T.saveFeedback], "the save's success notice stays beside «تغييرات غير محفوظة»"),
  M("RF4-B06-open-notice-hidden", "src/StructuredExamBuilder.tsx", '(noticeKind === "open" || saveState === undefined || saveState === "saved")', '(saveState === undefined || saveState === "saved")', [T.saveFeedback], "an import / preset notice disappears while the exam is unsaved"),
  M("RF4-B06-glyph-spoken", "src/StructuredExamBuilder.tsx", '<><span aria-hidden="true">{m[1]}</span> {text.slice(m[0].length)}</>', "<>{text}</>", [T.saveFeedback], "the notice's «✓» is read out"),
  M("RF4-B06-final-like-draft", "src/StructuredExamBuilder.tsx", "{savedFinal ? SAVE_LABELS.savedFinal : SAVE_STATE_LABELS[saveState]}", "{SAVE_STATE_LABELS[saveState]}", [T.saveFeedback], "a final approval is announced «محفوظ», exactly like a draft save"),
  M("RF4-B06-final-chip-repeated", "src/StructuredExamBuilder.tsx", '{exam.status === "final" && !savedFinal && ', '{exam.status === "final" && ', [T.saveFeedback], "«معتمد نهائيًا» is repeated beside «محفوظ — معتمد نهائيًا»"),
  M("RF4-B06-final-label-glyph", "src/teacher/saveLabels.ts", '  savedFinal: "محفوظ — معتمد نهائيًا",', '  savedFinal: "✓ محفوظ — معتمد نهائيًا",', [T.labels, T.saveFeedback], "the approval status sentence carries a glyph (read out)")
];

const only = (process.argv.find(a => a.startsWith("--only=")) || "").slice(7).split(",").filter(Boolean);
const selected = only.length ? mutants.filter(m => only.includes(m.id)) : mutants;
const ANSI = new RegExp(String.fromCharCode(27) + "\\[[0-9;]*m", "g");
const sha = s => crypto.createHash("sha256").update(s).digest("hex");
const files = [...new Set(selected.map(m => m.file))];
const BACKUP = path.join(os.tmpdir(), "exambank-21e2-mutation-backup.json");
if (fs.existsSync(BACKUP)) {
  const stale = JSON.parse(fs.readFileSync(BACKUP, "utf8"));
  for (const [file, contents] of Object.entries(stale)) fs.writeFileSync(file, contents, "utf8");
  fs.rmSync(BACKUP, { force: true });
  console.log("21E2_MUTATION_RESTORED_STALE_BACKUP", JSON.stringify(Object.keys(stale)));
}
if (process.argv.includes("--restore")) process.exit(0);
const original = new Map(files.map(file => [file, fs.readFileSync(file, "utf8")]));
const restoreAll = () => { for (const [file, contents] of original) fs.writeFileSync(file, contents, "utf8"); fs.rmSync(BACKUP, { force: true }); };
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => { restoreAll(); console.error("21E2_MUTATION_INTERRUPTED " + sig + " — sources restored"); process.exit(130); });
const hashes = Object.fromEntries([...original].map(([file, value]) => [file, sha(value)]));
const status = spawnSync("git", ["status", "--porcelain", "--", ...files], { encoding: "utf8" });
if (status.status !== 0 || status.stdout.trim()) { console.error("Mutated source files must start clean.", status.stdout); process.exit(3); }
const vitest = tests => spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--reporter=dot", ...tests], { encoding: "utf8", timeout: 180000, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, CI: "true" } });
const allTests = [...new Set(selected.flatMap(x => x.tests))];
const baseline = vitest(allTests);
if (baseline.status !== 0) { console.error("BASELINE RED", baseline.stdout.slice(-3500), baseline.stderr.slice(-2000)); process.exit(4); }
console.log("21E2_MUTATION_BASELINE_GREEN", JSON.stringify({ tests: allTests, mutants: selected.length, files: hashes }));
const ledger = [];
fs.writeFileSync(BACKUP, JSON.stringify(Object.fromEntries(original)), "utf8");
try {
  for (const m of selected) {
    let outcome = "invalid", diagnostic = "";
    const source = original.get(m.file);
    const occurrences = source.split(m.before).length - 1;
    if (occurrences !== 1) diagnostic = "needle count " + occurrences;
    else if (m.before === m.after) diagnostic = "mutation identical";
    else {
      try {
        fs.writeFileSync(m.file, source.replace(m.before, m.after), "utf8");
        const result = vitest(m.tests);
        if (["SIGINT", "SIGTERM", "SIGHUP"].includes(result.signal) || result.status === 130) { restoreAll(); console.error("21E2_MUTATION_INTERRUPTED during " + m.id + " — sources restored"); process.exit(130); }
        const output = (result.stdout || "") + "\n" + (result.stderr || "");
        if (result.error?.code === "ETIMEDOUT" || result.signal) { outcome = "timeout"; diagnostic = String(result.error || result.signal); }
        else if (result.status === 0) { outcome = "survived"; diagnostic = "Selected tests passed"; }
        else if (/Transform failed|Failed to parse source|SyntaxError:|Unexpected token|Error during transform|TypeError: .* is not a function/.test(output) && !/AssertionError/.test(output)) { outcome = "invalid"; diagnostic = output.slice(-700); }
        else { outcome = "killed"; diagnostic = output.split("\n").filter(x => /FAIL |AssertionError/.test(x)).slice(0, 2).join(" ").replace(ANSI, "").slice(0, 400); }
      } catch (error) { diagnostic = String(error); }
      finally { fs.writeFileSync(m.file, source, "utf8"); }
    }
    const rec = { id: m.id, file: m.file, what: m.what, outcome, diagnostic };
    ledger.push(rec);
    console.log("21E2_MUTATION_RESULT", JSON.stringify(rec));
  }
} finally { restoreAll(); }
const verified = files.every(f => sha(fs.readFileSync(f, "utf8")) === hashes[f]);
const git = spawnSync("git", ["diff", "--exit-code", "--", ...files], { encoding: "utf8" });
const counts = Object.fromEntries(["killed", "survived", "invalid", "timeout"].map(s => [s, ledger.filter(r => r.outcome === s).length]));
const report = { baseline: "green", source_sha256: hashes, restored: verified && git.status === 0, counts, mutants: ledger };
fs.mkdirSync("artifacts/phase-21e2", { recursive: true });
fs.writeFileSync("artifacts/phase-21e2/mutation-ledger.json", JSON.stringify(report, null, 2) + "\n");
console.log("21E2_MUTATION_SUMMARY", JSON.stringify({ restored: report.restored, counts, report: "artifacts/phase-21e2/mutation-ledger.json" }));
if (!report.restored || counts.invalid || counts.timeout || counts.survived) process.exitCode = 1;
