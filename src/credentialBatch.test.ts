// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import {
  openCredentialBatch,
  toggleCredentialBatchCollapsed,
  credentialBatchVisible,
  buildCredentialsDownload,
  type CredentialLite
} from "./credentialBatch";

afterEach(() => vi.restoreAllMocks());

const creds = (n: number): CredentialLite[] =>
  Array.from({ length: n }, (_, i) => ({ userId: "u" + i, firstName: "F" + i, familyName: "L" + i, code: "C" + i, identityNumber: "ID" + i, password: "pw" + i }));

describe("credentialBatch — class-scoped visibility (A/B/C/D/H)", () => {
  it("A: a batch generated for class A is visible while class A is selected", () => {
    const b = openCredentialBatch("A", "الصف أ", creds(3));
    expect(credentialBatchVisible(b, "A")).toBe(true);
  });
  it("B: switching to class B hides it (but the batch is preserved, not discarded)", () => {
    const b = openCredentialBatch("A", "الصف أ", creds(3));
    expect(credentialBatchVisible(b, "B")).toBe(false);
    expect(b.credentials).toHaveLength(3); // still in memory
  });
  it("C: returning to class A shows it again", () => {
    const b = openCredentialBatch("A", "الصف أ", creds(3));
    expect(credentialBatchVisible(b, "B")).toBe(false);
    expect(credentialBatchVisible(b, "A")).toBe(true);
  });
  it("D: a discarded (null) batch is never visible", () => {
    expect(credentialBatchVisible(null, "A")).toBe(false);
  });
  it("an empty batch is never visible", () => {
    expect(credentialBatchVisible(openCredentialBatch("A", "الصف أ", []), "A")).toBe(false);
  });
  it("H: opening a class-B batch replaces the class-A one without mislabeling/mixing", () => {
    const a = openCredentialBatch("A", "الصف أ", creds(2));
    const b = openCredentialBatch("B", "الصف ب", creds(5));
    expect(b.classId).toBe("B");
    expect(b.className).toBe("الصف ب");
    expect(b.credentials).toHaveLength(5);
    // download reflects the NEW batch's own class, never mixed with A
    expect(buildCredentialsDownload(b).classId).toBe("B");
    expect(a.classId).toBe("A"); // the old batch object is untouched/independent
  });
});

describe("credentialBatch — collapse/expand (E/F)", () => {
  it("starts expanded and toggles collapsed", () => {
    const b = openCredentialBatch("A", "الصف أ", creds(1));
    expect(b.collapsed).toBe(false);
    const collapsed = toggleCredentialBatchCollapsed(b);
    expect(collapsed.collapsed).toBe(true);
    expect(toggleCredentialBatchCollapsed(collapsed).collapsed).toBe(false);
    // toggling never loses the credentials (the table returns on expand)
    expect(collapsed.credentials).toHaveLength(1);
  });
});

describe("credentialBatch — download uses ORIGINAL class metadata (G)", () => {
  it("payload uses the batch's own classId/className/createdAt, never a current selection", () => {
    const b = openCredentialBatch("classA-id", "الصف الأول", creds(2), "2026-09-12T10:00:00.000Z");
    const payload = buildCredentialsDownload(b);
    expect(payload.classId).toBe("classA-id");
    expect(payload.className).toBe("الصف الأول");
    expect(payload.generatedAt).toBe("2026-09-12T10:00:00.000Z");
    expect(payload.students).toHaveLength(2);
    expect(payload.students[0]).toMatchObject({ firstName: "F0", familyName: "L0", identityNumber: "ID0", password: "pw0" });
  });
  it("identityNumber falls back to code when absent", () => {
    const b = openCredentialBatch("A", "الصف أ", [{ code: "CODE9", password: "p9" }]);
    expect(buildCredentialsDownload(b).students[0].identityNumber).toBe("CODE9");
  });
});

describe("credentialBatch — security: touches no browser storage (J)", () => {
  it("open/toggle/build never write to localStorage or sessionStorage", () => {
    const localSet = vi.spyOn(Storage.prototype, "setItem");
    const b = openCredentialBatch("A", "الصف أ", creds(3), "2026-09-12T10:00:00.000Z");
    toggleCredentialBatchCollapsed(b);
    buildCredentialsDownload(b);
    credentialBatchVisible(b, "A");
    expect(localSet).not.toHaveBeenCalled();
  });
});
