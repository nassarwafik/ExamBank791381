import { describe, it, expect } from "vitest";
import { feedEventParts, eventTypeOf, type FeedMedal } from "./achievements";

// Phase 4D — the shared feed formatter distinguishes a persisted GAME (Live Challenge) medal from an assessment medal.
// Assessment medals keep their exact existing wording; game medals read as a live-challenge win. The medal event type
// (and thus the shared medal icon) is unchanged — only the sentence differs.

const LABELS = { medal: (t: string) => ({ gold: "ذهبية", silver: "فضية", bronze: "برونزية" }[t] || t), rank: (t: string) => t, stage: (n: number) => "المرحلة " + n };
const text = (parts: { text: string }[]) => parts.map(p => p.text).join("");

describe("feedEventParts — game vs assessment medals", () => {
  it("a game medal reads as a Live Challenge win with the challenge title", () => {
    const medal: FeedMedal = { tier: "gold", assignmentTitle: "شبكات", source: "game", gameType: "live_challenge", placement: 1, challengeId: "c9" };
    const parts = feedEventParts({ eventType: "medal", studentDisplayName: "أحمد", medal }, LABELS);
    expect(text(parts)).toBe("أحمد حصل على ميدالية ذهبية في التحدّي المباشر «شبكات»");
    // the emphasised tokens are the student's name and the challenge title
    expect(parts.filter(p => p.strong).map(p => p.text)).toEqual(["أحمد", "«شبكات»"]);
  });

  it("an assessment medal keeps its existing wording (no live-challenge phrasing)", () => {
    const medal: FeedMedal = { tier: "silver", assignmentId: "A1", assignmentTitle: "اختبار الوحدة" };
    const parts = feedEventParts({ eventType: "medal", studentDisplayName: "ليان", medal }, LABELS);
    expect(text(parts)).toBe("ليان حصل على ميدالية فضية في اختبار الوحدة");
    expect(text(parts)).not.toContain("التحدّي المباشر");
  });

  it("a legacy medal post with no medal object still renders as an assessment medal", () => {
    const parts = feedEventParts({ eventType: "medal", studentDisplayName: "كريم", assignmentTitle: "قديم", tier: "bronze" }, LABELS);
    expect(eventTypeOf({ eventType: "medal" })).toBe("medal");
    expect(text(parts)).toBe("كريم حصل على ميدالية برونزية في قديم");
  });
});
