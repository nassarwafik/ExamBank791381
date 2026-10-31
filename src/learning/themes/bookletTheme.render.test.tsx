// @vitest-environment happy-dom
// The booklet skin in the Reader: it is presentation only. A themed 791381s page carries the theme attributes and one
// decorative icon per printed box — and its TEXT is exactly the unthemed text (the printed booklet the students annotate).
// An unthemed course (the full book 791381) renders the very markup it always had.
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { render, cleanup } from "@testing-library/react";
import LearningPageRenderer, { type ReaderPageHeader } from "../reader/LearningPageRenderer";
import LearningReaderToc from "../reader/LearningReaderToc";
import manifest791381s from "../content/791381s/manifest";
import { loadBundledModuleContent } from "../content/bundledModules";
import type { ContentModule, ContentPage } from "../content/types";
import { pageThemeFor } from "./courseTheme";

afterEach(cleanup);

const headerFor = (mod: ContentModule, page: ContentPage, themed: boolean): ReaderPageHeader => ({
  courseId: "791381s", pageTitle: page.title, moduleTitle: mod.title, lessonTitle: mod.lessons[0].title,
  position: { index: 1, total: 1 }, source: page.source,
  theme: themed ? pageThemeFor("791381s", manifest791381s, mod.id) : undefined,
});
const pageWithCallouts = (mod: ContentModule) => mod.lessons.flatMap(l => l.pages).find(p => p.blocks.some(b => b.type === "callout"))!;

describe("booklet skin — the page", () => {
  it("a themed page carries data-course-theme / data-theme-tone and keeps the exact text of the unthemed page", async () => {
    const mod = await loadBundledModuleContent("791381s", "791381s-m03");
    const page = pageWithCallouts(mod);
    const plain = render(<LearningPageRenderer header={headerFor(mod, page, false)} body={{ kind: "ready", page }} />);
    const plainText = plain.container.textContent;
    const plainArticle = plain.container.querySelector("article")!;
    expect(plainArticle.hasAttribute("data-course-theme")).toBe(false);
    expect(plain.container.querySelector("[data-callout-tone], .booklet-callout-icon")).toBeNull();
    cleanup();

    const themed = render(<LearningPageRenderer header={headerFor(mod, page, true)} body={{ kind: "ready", page }} />);
    const article = themed.container.querySelector("article")!;
    expect(article.getAttribute("data-course-theme")).toBe("booklet");
    expect(article.getAttribute("data-theme-tone")).toBe("b1");
    expect(themed.container.textContent).toBe(plainText);   // not one character of the book differs
  }, 30000);

  it("every printed box gets its family and ONE decorative icon; the printed label text is unchanged", async () => {
    const mod = await loadBundledModuleContent("791381s", "791381s-m03");
    const page = pageWithCallouts(mod);
    const { container } = render(<LearningPageRenderer header={headerFor(mod, page, true)} body={{ kind: "ready", page }} />);
    const callouts = [...container.querySelectorAll(".learning-reader-callout")];
    const authored = page.blocks.filter(b => b.type === "callout" && b.kind !== "clarification");
    expect(callouts).toHaveLength(authored.length);
    callouts.forEach((c, i) => {
      expect(c.getAttribute("data-callout-tone")).toBeTruthy();
      const icons = c.querySelectorAll("svg.booklet-callout-icon");
      expect(icons).toHaveLength(1);
      expect(icons[0].getAttribute("aria-hidden")).toBe("true");
      const b = authored[i] as Extract<typeof authored[number], { type: "callout" }>;
      expect(c.querySelector(".learning-reader-callout-label")!.textContent).toBe(b.title);
    });
  }, 30000);

  it("the unit opener page is themed too (the hero takes the group colour)", async () => {
    const mod = await loadBundledModuleContent("791381s", "791381s-m31");
    const opener = mod.lessons.flatMap(l => l.pages).find(p => p.layout === "opener")!;
    const { container } = render(<LearningPageRenderer header={headerFor(mod, opener, true)} body={{ kind: "ready", page: opener }} />);
    const article = container.querySelector("article.is-opener")!;
    expect(article.getAttribute("data-course-theme")).toBe("booklet");
    expect(article.getAttribute("data-theme-tone")).toBe("summary");
  }, 30000);

  it("a course without a theme (header.theme absent) renders no theme attribute, no tone and no icon", async () => {
    const mod = await loadBundledModuleContent("791381s", "791381s-m01");
    const page = pageWithCallouts(mod);
    const header = { ...headerFor(mod, page, false), courseId: "791381", theme: pageThemeFor("791381", manifest791381s, mod.id) };
    const { container } = render(<LearningPageRenderer header={header} body={{ kind: "ready", page }} />);
    expect(container.querySelector("[data-course-theme], [data-theme-tone], [data-callout-tone], .booklet-callout-icon")).toBeNull();
  }, 30000);
});

describe("booklet skin — the index", () => {
  it("each unit of a themed course carries its group tone; an unthemed manifest carries none", () => {
    const { container } = render(
      <LearningReaderToc manifest={manifest791381s} selectedPageId="791381s-m01-l01-p01" activeModuleId="791381s-m01" onSelectPage={() => {}} idPrefix="t" />,
    );
    const mods = [...container.querySelectorAll(".learning-reader-toc-module")];
    expect(mods).toHaveLength(37);
    expect(mods[0].getAttribute("data-theme-tone")).toBe("intro");
    expect(mods[1].getAttribute("data-theme-tone")).toBe("b1");
    expect(mods[36].getAttribute("data-theme-tone")).toBe("summary");
    cleanup();
    const other = render(
      <LearningReaderToc manifest={{ ...manifest791381s, courseId: "791381" }} selectedPageId="791381s-m01-l01-p01" activeModuleId="791381s-m01" onSelectPage={() => {}} idPrefix="t" />,
    );
    expect(other.container.querySelector("[data-theme-tone]")).toBeNull();
  });
});

describe("booklet skin — the stylesheet stays scoped and self-hosted", () => {
  const css = readFileSync(resolve(process.cwd(), "src/learning/themes/booklet-theme.css"), "utf8");
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/@font-face\s*{[^}]*}/g, "");

  it("every style rule is keyed on the theme's own attributes (no other course or page is touched)", () => {
    const selectors = [...rules.matchAll(/([^{}@]+){[^{}]*}/g)].map(m => m[1].trim()).filter(s => s && !s.startsWith("@") && !/^\(/.test(s));
    expect(selectors.length).toBeGreaterThan(30);
    for (const sel of selectors) expect(sel, sel).toMatch(/\[data-course-theme="booklet"\]|\[data-theme-tone|\[data-callout-tone/);
  });

  it("fonts load only from the app's own /fonts/ folder (no external host), and the Cairo licence ships with them", () => {
    const urls = [...css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map(m => m[1]);
    expect(urls.length).toBe(6);
    for (const u of urls) expect(u).toMatch(/^\/fonts\/Cairo-(600|700|800)-(arabic|latin)\.woff2$/);
    const pub = resolve(process.cwd(), "public/fonts") + "/";
    for (const u of urls) expect(readFileSync(pub + u.slice("/fonts/".length)).byteLength).toBeGreaterThan(1000);
    expect(readFileSync(pub + "Cairo-OFL.txt", "utf8")).toMatch(/SIL Open Font License, Version 1\.1/);
  });
});
