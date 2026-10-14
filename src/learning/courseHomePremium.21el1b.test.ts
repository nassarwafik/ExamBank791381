import { describe, it, expect } from "vitest";
import manifest from "./content/791381/manifest";
import { flattenPageRefs } from "./content/navigation";
import { LEARNING_COURSES } from "./catalog";

describe("21E L1-B — course section counts originate from manifest", () => {
  const course = LEARNING_COURSES.find(c => c.id === "791381")!;
  const flat = flattenPageRefs(manifest);
  it("preserves all 8 overview batches in canonical order", () => {
    expect(manifest.batches?.map(b => b.id)).toEqual(course.overviewBatches.map(b => b.id));
  });
  it("every page belongs to exactly one displayed populated section", () => {
    const memberships = new Map<string, number>();
    for (const batch of manifest.batches ?? []) {
      for (const page of flat.filter(p => batch.moduleIds.includes(p.module.id))) {
        memberships.set(page.page.id, (memberships.get(page.page.id) ?? 0) + 1);
      }
    }
    expect(memberships.size).toBe(flat.length);
    expect([...memberships.values()].every(v => v === 1)).toBe(true);
  });
  it("manifest-derived reading ranges are ordered and sum to total pages", () => {
    let count = 0;
    for (const batch of manifest.batches ?? []) {
      const pages = flat.filter(p => batch.moduleIds.includes(p.module.id));
      const lessons = new Set(pages.map(p => p.lesson.id));
      if (pages.length) {
        expect(pages[0].index).toBe(count);
        expect(pages[pages.length - 1].index).toBe(count + pages.length - 1);
        expect(lessons.size).toBeGreaterThan(0);
      }
      count += pages.length;
    }
    expect(count).toBe(flat.length);
    expect(flat.length).toBe(248);
  });
});
