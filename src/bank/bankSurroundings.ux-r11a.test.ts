// UX-R11a — the exam bank, «استيراد من ملف», «مراجعات النشر» and «سجل النشاط» in the reference look
// (docs/enterprise-ux-r0-redesign-foundation.md R11a). Presentation only: markup, roles and behaviour are pinned by the UX-6c /
// 14B / 8B suites. These guards pin the UX-R11a blocks (once in their sheets, scoped to their page, free of stacking contexts,
// transitions, colour literals and physical sides) and the three fixes: the bank's and the import page's phone overflow, and
// the review inbox loading the builder's base classes it renders.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (...p: string[]) => readFileSync(path.join(process.cwd(), "src", ...p), "utf8");
// A block runs to the next phase block (UX-R11b appends its own after it in builder-pro.css) or to the end of the sheet.
const block = (src: string) => {
  const at = src.lastIndexOf("/*", src.indexOf("UX-R11a"));
  expect(src.indexOf("UX-R11a"), "UX-R11a block").toBeGreaterThan(-1);
  const next = src.indexOf("/* UX-R", at + 2);
  return { at, body: src.slice(at, next > -1 ? next : undefined).replace(/\/\*[\s\S]*?\*\//g, "") };
};
/** The declarations of the rule whose selector list is exactly `sel` (at a line start, optionally indented) inside a block. */
const rule = (b: { body: string }, sel: string) => {
  const m = b.body.match(new RegExp("\\n\\s*" + sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s?\\{"));
  expect(m, "rule " + sel).not.toBeNull();
  const i = b.body.indexOf(m![0]) + m![0].length;
  return b.body.slice(i, b.body.indexOf("}", i)).trim();
};
const bankSrc = read("bank-pro.css"), importSrc = read("builder-pro.css"), inboxSrc = read("governance", "reviewInbox.css"), partsSrc = read("page-parts.css");
const bank = block(bankSrc), imp = block(importSrc), inbox = block(inboxSrc), audit = block(partsSrc);
const sels = (b: { body: string }) => (b.body.match(/^[^{}@\n][^{}\n]*(?=\{)/gm) || []).flatMap(s => s.split(",")).map(s => s.trim()).filter(Boolean);

describe("UX-R11a — the fixes", () => {
  it("bank: the overview's actions wrap inside the page (the header wraps; the actions never exceed the page width)", () => {
    expect(rule(bank, ".eb-bank .eb-section-header")).toBe("flex-wrap:wrap;");
    expect(rule(bank, ".eb-bank .eb-section-header-text")).toBe("flex:1 1 14rem; min-width:0;");
    expect(rule(bank, ".eb-bank .eb-section-actions")).toBe("min-width:0; max-inline-size:100%;");
  });

  it("import: the URL forms' grid track never exceeds the panel and the address field may shrink", () => {
    expect(rule(imp, ".import-url-forms")).toBe("grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));");
    expect(rule(imp, ".import-url-row input")).toBe("min-width:0;");
  });

  it("review inbox: the page loads the sheet that defines the builder base classes it renders, before its own sheet", () => {
    const page = read("governance", "ReviewInboxPage.tsx");
    const builderSheet = read("structured-builder.css");
    for (const cls of ["sb-btn", "sb-btn-primary", "sb-hint", "sb-banner", "sb-bp-h"]) {
      expect(page + read("governance", "RevisionViewer.tsx")).toContain(cls);
      expect(builderSheet).toMatch(new RegExp("\\." + cls + "(?![\\w-])"));
    }
    const at = page.indexOf('import "../structured-builder.css";');
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(page.indexOf('import "./reviewInbox.css";'));
  });
});

describe("UX-R11a — the blocks themselves", () => {
  it("each appears once in its sheet; only a later phase block may follow it", () => {
    for (const src of [bankSrc, importSrc, inboxSrc, partsSrc]) expect(src.indexOf("UX-R11a")).toBe(src.lastIndexOf("UX-R11a"));
  });

  it("add no stacking context, no transition, no colour literal, no physical side", () => {
    for (const b of [bank, imp, inbox, audit]) {
      expect(b.body).not.toMatch(/\b(isolation|z-index|transform|filter|contain|will-change|transition|animation|position)\s*:/);
      expect(b.body).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
      expect(b.body).not.toMatch(/(margin|padding|border)-(left|right)|padding-inline-end|\b(left|right)\s*:/);
    }
  });

  it("scope every rule to its page, so the shared header, segmented group, stat cards, platform card and table keep their look", () => {
    for (const s of sels(bank)) expect(s).toMatch(/^\.eb-bank /);
    for (const s of sels(imp)) expect(s).toMatch(/^\.import-/);
    for (const s of sels(inbox)) expect(s).toMatch(/^\.gov-inbox( |$)/);
    for (const s of sels(audit)) expect(s).toMatch(/^\.teacher-platform-inner > \.platform-(hero|card)|^\.audit-history-table/);
  });

  it("never restyle a status colour (badges, stage pills, decision notes, the correct option)", () => {
    for (const b of [bank, inbox, audit]) expect(b.body).not.toMatch(/eb-badge|is-correct|gov-stage|gov-decision|gov-workflow|tone-/);
  });
});

describe("UX-R11a — the bank", () => {
  it("the view switch is the reference segmented group; the figures are ONE hairline strip whose cells draw their own hairlines", () => {
    expect(rule(bank, '.eb-bank .eb-segmented > button[aria-pressed="true"]')).toBe("background:var(--eb-chrome-active); font-weight:var(--eb-fw-bold); box-shadow:none;");
    expect(rule(bank, ".eb-bank .eb-bank-stats")).toBe("gap:0; background:var(--eb-surface); border:1px solid var(--eb-line); border-radius:var(--eb-r); overflow:hidden;");
    expect(rule(bank, ".eb-bank .eb-bank-stats .eb-stat-card")).toBe("border-color:transparent; border-radius:0; background:transparent; box-shadow:1px 0 0 0 var(--eb-line), 0 1px 0 0 var(--eb-line);");
  });

  it("flat 8 px panels, a quiet white table header, and the exam lists as ONE hairline card of 44 px rows", () => {
    expect(rule(bank, ".eb-bank .eb-bank-dist-card")).toBe("border-radius:var(--eb-r);");
    expect(rule(bank, ".eb-bank .eb-bank-table-wrap")).toBe("border-radius:var(--eb-r);");
    expect(rule(bank, ".eb-bank .eb-bank-table th")).toBe("background:var(--eb-surface);");
    expect(rule(bank, ".eb-bank .eb-bank-exam-list")).toBe("gap:0; background:var(--eb-surface); border:1px solid var(--eb-line); border-radius:var(--eb-r); overflow:hidden;");
    expect(rule(bank, ".eb-bank .eb-bank-exam-row")).toBe("min-block-size:44px; border:0; border-block-start:1px solid var(--eb-line); border-radius:0;");
  });
});

describe("UX-R11a — the review inbox and the activity log", () => {
  it("inbox: the stage tabs read as sub-navigation and the tasks are ONE hairline card of 44 px rows with a quiet «فتح»", () => {
    expect(rule(inbox, '.gov-inbox .gov-inbox-tab[aria-selected="true"]')).toBe("background:var(--eb-chrome-active);border-color:transparent;color:var(--eb-text-heading);font-weight:var(--eb-fw-bold)");
    expect(rule(inbox, ".gov-inbox .gov-inbox-list")).toBe("gap:0;background:var(--eb-surface);border:1px solid var(--eb-line);border-radius:var(--eb-r);overflow:hidden");
    expect(rule(inbox, ".gov-inbox .gov-task")).toBe("min-block-size:44px;border:0;border-block-start:1px solid var(--eb-line);border-radius:0;background:transparent");
    expect(rule(inbox, ".gov-inbox .gov-task-open.sb-btn-primary,.gov-inbox .gov-task-open.sb-btn-primary:hover")).toBe("background:var(--eb-surface);border-color:var(--eb-line-2);color:var(--eb-text-heading)");
  });

  it("inbox: the page has the symmetric logical gutter (16 px, 24 px from 768 px); the 14B phone block is kept", () => {
    expect(rule(inbox, ".gov-inbox")).toBe("box-sizing:border-box;padding-inline:var(--eb-space-4)");
    expect(inbox.body).toContain("@media (min-width:768px){.gov-inbox{padding-inline:var(--eb-space-5)}}");
    expect(inboxSrc).toMatch(/@media \(max-width:640px\)/);
  });

  it("log: the navy banner is a plain page header with a quiet 44 px «تحديث»; the card is a flat 8 px panel; the header is white", () => {
    expect(rule(audit, ".teacher-platform-inner > .platform-hero")).toBe("padding:0; background:transparent; color:var(--eb-text-heading); border-radius:0; box-shadow:none;");
    expect(rule(audit, ".teacher-platform-inner > .platform-hero > button")).toContain("min-height:44px;");
    expect(rule(audit, ".teacher-platform-inner > .platform-card:has(.audit-history-table)")).toBe("border-color:var(--eb-line); border-radius:var(--eb-r); box-shadow:none;");
    expect(rule(audit, ".audit-history-table.students-table thead th")).toBe("background:var(--eb-surface); color:var(--eb-muted);");
  });
});
