import { describe, it, expect } from "vitest";
import { filterLibraryCatalog, catalogCategories, categoryLabel, CATEGORY_LABELS, type LibraryCatalogItem } from "./examLibrary";

function item(overrides: Partial<LibraryCatalogItem> = {}): LibraryCatalogItem {
  return {
    libraryItemId: "T01",
    title: "أساسيات الشبكات",
    category: "foundation",
    description: "تعريف الشبكة",
    tags: ["LAN / WAN"],
    questionCount: 10,
    totalMarks: 100,
    conversionStatus: "ready",
    publishable: true,
    ...overrides
  };
}

describe("filterLibraryCatalog", () => {
  const catalog = [
    item({ libraryItemId: "T05", title: "Class وSubnet", category: "foundation", tags: ["CIDR", "Subnet Mask"] }),
    item({ libraryItemId: "T19", title: "بروتوكول DHCP", category: "foundation", tags: ["DHCP"] }),
    item({ libraryItemId: "F03", title: "نموذج D", category: "final", tags: ["نهائي"] })
  ];

  it("returns all items when no filters are given", () => {
    expect(filterLibraryCatalog(catalog)).toHaveLength(3);
  });

  it("filters by category", () => {
    expect(filterLibraryCatalog(catalog, { category: "final" }).map(x => x.libraryItemId)).toEqual(["F03"]);
  });

  it("searches by tag", () => {
    expect(filterLibraryCatalog(catalog, { search: "DHCP" }).map(x => x.libraryItemId)).toEqual(["T19"]);
  });

  it("searches by id and title, case-insensitively", () => {
    expect(filterLibraryCatalog(catalog, { search: "t05" }).map(x => x.libraryItemId)).toEqual(["T05"]);
    expect(filterLibraryCatalog(catalog, { search: "subnet" }).map(x => x.libraryItemId)).toEqual(["T05"]);
  });

  it("combines category and search", () => {
    expect(filterLibraryCatalog(catalog, { category: "foundation", search: "نموذج" })).toHaveLength(0);
  });

  it("returns empty when nothing matches", () => {
    expect(filterLibraryCatalog(catalog, { search: "zzz" })).toHaveLength(0);
  });
});

describe("catalogCategories", () => {
  it("returns present categories in stable source order", () => {
    const catalog = [item({ category: "final" }), item({ category: "foundation" }), item({ category: "infra" })];
    expect(catalogCategories(catalog)).toEqual(["foundation", "infra", "final"]);
  });
});

describe("categoryLabel", () => {
  it("maps every known code to an Arabic label", () => {
    for (const code of Object.keys(CATEGORY_LABELS)) {
      expect(categoryLabel(code)).toBe(CATEGORY_LABELS[code]);
    }
  });

  it("falls back to the raw code for an unknown category", () => {
    expect(categoryLabel("mystery")).toBe("mystery");
  });
});
