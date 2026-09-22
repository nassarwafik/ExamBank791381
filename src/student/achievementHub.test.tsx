// @vitest-environment happy-dom
// Achievement Hub («تقدّمي وقوتي») + generic achievement events (frontend): the three recognition tiles are separate
// counts (never summed), the server's recognition is displayed verbatim, the feed switches its wording/icon by
// eventType with the exact sentences, legacy medal posts still render and react, the teacher dashboard shares the
// same wording, and the teacher's student profile shows the concise Strength / recognition block.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, within, fireEvent } from "@testing-library/react";
import StudentProgressSection from "./StudentProgressSection";
import AchievementFeed from "./AchievementFeed";
import StudentDialog from "../students/StudentDialog";
import { feedEventParts, eventTypeOf, type FeedPost } from "../achievements";
import { normalizeRecognition } from "./recognitionPresentation";
import type { StudentRecognition } from "./types";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const stats = { assigned: 5, completed: 4, average: 80, pendingReview: 0, finalized: 4, inProgress: 1, averageFinalized: 82 };
// 25-STAGE server payload: 360 points → stage 5 «تنين النار» (0-79=1 … 320-399=5), 40 into the 80-point stage.
const strength = { totalPoints: 360, libraryPoints: 220, modulePoints: 140, stage: 5, stageCount: 25, stageSpan: 80, withinStagePoints: 40, nextStageRemaining: 40, percent: 50, nextStage: 6, totalMax: 2000 };
const recognition: StudentRecognition = { medals: { total: 12, gold: 5, silver: 4, bronze: 3 }, reactionsReceived: { total: 36, byType: { heart: 18, clap: 10, cheer: 5, fire: 3 } }, achievements: { total: 7, byType: { global_rank_up: 4, project_rank_up: 2, project_complete: 1 } } };

describe("Achievement Hub — تقدّمي وقوتي", () => {
  it("keeps the current STAGE artwork central with the two-source Strength breakdown, and shows medals / reactions / achievements as three separate tiles", () => {
    render(<StudentProgressSection stats={stats} medals={["gold", "gold", "silver"]} strength={strength} recognition={recognition} averageFinalized={82} />);
    expect(screen.getByRole("heading", { level: 2, name: "تقدّمي وقوتي" })).toBeTruthy();
    expect(screen.getByText("تنين النار")).toBeTruthy();                     // stage-5 name from the uploaded pack
    expect(screen.getByText("المرحلة 5 من 25")).toBeTruthy();                // server stage / stageCount
    expect(screen.getByText(/نقاط القوة:/).textContent).toBe("نقاط القوة: 360 / 2000");
    expect(screen.getByText(/التقدم في هذه المرحلة:/).textContent).toBe("التقدم في هذه المرحلة: 40 / 80");
    const breakdown = screen.getByText("تدريبات المكتبة").closest("ul") as HTMLElement;
    expect(breakdown.textContent).toBe("تدريبات المكتبة220إتمام دروس الكتاب140");
    const tiles = within(screen.getByRole("list", { name: "التقدير" })).getAllByRole("listitem");
    expect(tiles.map(t => t.querySelector(".eb-sp-recognition-label")?.textContent)).toEqual(["الميداليات", "التفاعلات", "الإنجازات"]);
    expect(tiles.map(t => t.querySelector(".eb-sp-recognition-count")?.textContent)).toEqual(["12", "36", "7"]);   // server values, never medalsFor()
    expect(within(tiles[1]).getByLabelText("التفاعلات حسب النوع").textContent).toBe("❤️أحببته 18👏أحسنت 10🎉مبروك 5🔥رائع 3");
    // no combined recognition score anywhere (12 + 36 + 7 = 55 must not appear)
    expect(document.body.textContent).not.toMatch(/\b55\b/);
  });
  it("without a server recognition payload the medal tile falls back to the finalized medal list and the others read 0", () => {
    render(<StudentProgressSection stats={stats} medals={["gold", "bronze"]} strength={null} recognition={null} averageFinalized={null} />);
    const tiles = within(screen.getByRole("list", { name: "التقدير" })).getAllByRole("listitem");
    expect(tiles.map(t => t.querySelector(".eb-sp-recognition-count")?.textContent)).toEqual(["2", "0", "0"]);
    expect(screen.queryByLabelText("التفاعلات حسب النوع")).toBeNull();
  });
  it("normalizeRecognition: exact server shape passes through; malformed → null; junk counts → 0", () => {
    expect(normalizeRecognition(recognition)).toEqual(recognition);
    expect(normalizeRecognition(undefined)).toBeNull();
    expect(normalizeRecognition("x")).toBeNull();
    expect(normalizeRecognition({ medals: { total: "9" }, reactionsReceived: { total: -3, byType: { heart: "x" } } })!.reactionsReceived).toEqual({ total: 0, byType: { heart: 0, clap: 0, cheer: 0, fire: 0 } });
  });
});

const base = (over: Partial<FeedPost>): FeedPost => ({ postId: "p", studentDisplayName: "ليان", assignmentTitle: "", createdAt: "2026-01-01T00:00:00.000Z", isOwnPost: false, reactionCounts: { heart: 0, clap: 0, cheer: 0, fire: 0 }, myReaction: null, teacherReaction: null, teacherNote: "", ...over });
const POSTS: FeedPost[] = [
  base({ postId: "m1", eventType: "medal", medal: { tier: "gold", assignmentTitle: "الشبكات" }, assignmentTitle: "الشبكات", tier: "gold" }),
  base({ postId: "g1", eventType: "global_rank_up", studentDisplayName: "كريم", rank: { stage: 5, points: 360 } }),
  base({ postId: "pr1", eventType: "project_rank_up", studentDisplayName: "هاجر", project: { projectCode: "AQ", title: "AquaSense", tier: "silver", level: 3, projectStrength: 210 } }),
  base({ postId: "pc1", eventType: "project_complete", studentDisplayName: "أحمد", project: { projectCode: "SB", title: "SecureBank", tier: "legendary", level: 6, projectStrength: 600 } }),
  base({ postId: "legacy", studentDisplayName: "سارة", assignmentTitle: "واجب قديم", tier: "bronze", reactionCounts: { heart: 2, clap: 0, cheer: 0, fire: 0 }, teacherReaction: "clap", teacherNote: "أحسنت" })
];
const feedProps = { error: "", shareOn: true, shareSaving: false, now: Date.parse("2026-01-02T00:00:00.000Z"), onToggleShare: () => {}, onReact: vi.fn() };

describe("Achievement feed — wording and icon by eventType", () => {
  it("renders the exact sentence per event type; legacy posts (no eventType) are medals and keep reactions/note", () => {
    render(<AchievementFeed posts={POSTS} {...feedProps} />);
    expect(screen.getByText("أحدث الإنجازات والتقدّم في صفك")).toBeTruthy();
    const items = screen.getAllByRole("article").filter(a => a.className.includes("eb-sp-feed-item"));
    const texts = items.map(i => i.querySelector(".eb-sp-feed-text")?.textContent);
    expect(texts).toEqual([
      "ليان حصل على ميدالية ذهبية في الشبكات",
      "تقدّم كريم إلى تنين النار — المرحلة 5",
      "تقدّم هاجر في مشروع AquaSense إلى نمر البرق",
      "أكمل أحمد مشروع SecureBank",
      "سارة حصل على ميدالية برونزية في واجب قديم"
    ]);
    expect(items.map(i => i.getAttribute("data-event-type"))).toEqual(["medal", "global_rank_up", "project_rank_up", "project_complete", "medal"]);
    expect(items[0].querySelector(".eb-sp-medal-icon.is-gold")).toBeTruthy();
    expect(items[1].querySelector("img.eb-sp-feed-rank-art.is-global_rank_up")).toBeTruthy();   // the same rank artwork
    expect(items[2].querySelector("img.eb-sp-feed-rank-art")).toBeTruthy();
    expect(items[4].querySelector(".eb-sp-medal-icon.is-bronze")).toBeTruthy();
    expect(within(items[4]).getByText("كلمة من المعلم: أحسنت")).toBeTruthy();
    const heart = within(within(items[4]).getByRole("group", { name: "ردود الفعل" })).getByRole("button", { name: /أحببته/ });
    expect(heart.textContent).toContain("2");
    fireEvent.click(within(items[1]).getByRole("button", { name: /مبروك/ }));
    expect(feedProps.onReact).toHaveBeenCalledWith("g1", "cheer");
  });
  it("empty state uses the generic wording", () => {
    render(<AchievementFeed posts={[]} {...feedProps} />);
    expect(screen.getByText("عندما يحقق أحد طلاب الصف إنجازًا سيظهر هنا.")).toBeTruthy();
  });
  it("feedEventParts is the ONE wording authority (teacher dashboard reuses it)", () => {
    const labels = { medal: (t: string) => ({ gold: "ذهبية", silver: "فضية", bronze: "برونزية" } as Record<string, string>)[t], rank: (t: string) => ({ diamond: "تنين النار", silver: "نمر البرق" } as Record<string, string>)[t] || t, stage: (s: number) => ({ 5: "تنين النار" } as Record<number, string>)[s] || ("المرحلة " + s) };
    expect(feedEventParts(POSTS[1], labels).map(p => p.text).join("")).toBe("تقدّم كريم إلى تنين النار — المرحلة 5");
    expect(feedEventParts(POSTS[3], labels).map(p => p.text).join("")).toBe("أكمل أحمد مشروع SecureBank");
    expect(eventTypeOf({})).toBe("medal"); expect(eventTypeOf({ eventType: "bogus" })).toBe("medal");
  });
});

describe("Teacher student profile — concise Strength / recognition", () => {
  const profile = {
    student: { userId: "u1", code: "S1", identityNumber: "123456789", firstName: "ليان", familyName: "خالد", displayName: "ليان خالد", classId: "c1", active: true, archived: false, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "", lastLoginAt: "", submittedAssignmentsCount: 0, likesCount: 36 },
    classroom: { classId: "c1", name: "الحادي عشر", grade: "11", schoolYear: "2026" },
    stats: { assigned: 5, completed: 4, pending: 1, average: 80, lastLoginAt: "" },
    assignments: [], submittedAssignmentsCount: 0, submittedAssignments: [],
    strength: { totalPoints: 360, libraryPoints: 220, modulePoints: 140, stage: 5, stageCount: 25, withinStagePoints: 40, nextStageRemaining: 40, percent: 50, nextStage: 6, totalMax: 2000 },
    recognition,
    projectSummaries: [{ projectCode: "AQ", title: "AquaSense", overallProgress: 72, complete: false }, { projectCode: "SB", title: "SecureBank", overallProgress: 100, complete: true }]
  };
  const noop = () => {};
  it("shows the STAGE + Strength, the three recognition counts and project summaries; absent payload → nothing extra", () => {
    render(<StudentDialog profile={profile as never} section="summary" onClose={noop} busy={false} suspended={false} passwordReveal={null} onResetPassword={noop} onCopyPassword={noop} onReview={noop} onAllowRetry={noop} deadlineFor={null} deadlineValue="" onDeadlineValue={noop} onOpenDeadline={noop} onCloseDeadline={noop} onSaveDeadline={noop} onClearDeadline={noop} fmtDate={v => v} />);
    const block = screen.getByLabelText("القوة والتقدير");
    expect(block.textContent).toContain("تنين النار"); expect(block.textContent).toContain("المرحلة 5 من 25"); expect(block.textContent).toContain("نقاط القوة: 360 / 2000");
    expect(block.textContent).toContain("الميداليات: 12"); expect(block.textContent).toContain("التفاعلات المستلمة: 36"); expect(block.textContent).toContain("الإنجازات: 7");
    expect(block.textContent).toContain("AquaSense: 72%"); expect(block.textContent).toContain("SecureBank: 100% · مكتمل");
    cleanup();
    render(<StudentDialog profile={{ ...profile, strength: undefined, recognition: undefined, projectSummaries: undefined } as never} section="summary" onClose={noop} busy={false} suspended={false} passwordReveal={null} onResetPassword={noop} onCopyPassword={noop} onReview={noop} onAllowRetry={noop} deadlineFor={null} deadlineValue="" onDeadlineValue={noop} onOpenDeadline={noop} onCloseDeadline={noop} onSaveDeadline={noop} onClearDeadline={noop} fmtDate={v => v} />);
    expect(screen.queryByLabelText("القوة والتقدير")).toBeNull();
  });
});
