import { describe, it, expect } from "vitest";
import { resolveTrack } from "./trackState";

describe("resolveTrack (Track report project-switch safety)", () => {
  it("keeps the current track when it is still available", () => {
    expect(resolveTrack("book", ["book", "visualStudio"], "book")).toBe("book");
  });
  it("drops a stale track from another project and falls back to the server default", () => {
    // was 899373 'access', switched to 883589 (book / visualStudio)
    expect(resolveTrack("access", ["book", "visualStudio"], "book")).toBe("book");
  });
  it("falls back to the first track when neither current nor fallback is valid", () => {
    expect(resolveTrack("access", ["book", "packetTracer"], "nope")).toBe("book");
  });
  it("returns empty when there are no tracks", () => {
    expect(resolveTrack("book", [], "book")).toBe("");
  });
});
