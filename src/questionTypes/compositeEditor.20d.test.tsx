// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { useState } from "react";
import { render, cleanup, fireEvent, act, screen, within } from "@testing-library/react";
import CompositeEditor from "./editors/CompositeEditor";
import type { QuestionBody } from "../examTypes";
import { mergePatch } from "../examBuilderState";
import { validateCompositeQuestion } from "../compositeQuestion";
import { typeSpecificContentPresent } from "./typeContent";
import { compositeArabicExam, compositeCsExam, compositePhysicsExam } from "../composite/compositeFixtures";

// Phase 20D — focused behaviour of the composite@1 authoring editor: every operation emits a FRESH canonical root through onChange, the
// question mark is only changed by the explicit button, and the resulting composites pass (or fail, where expected) the strict authority.
afterEach(cleanup);
type Obj = Record<string, unknown>;
const settle = async (container: HTMLElement) => { for (let i = 0; i < 60; i++) { await act(async () => { await new Promise(r => setTimeout(r, 20)); }); if (!container.querySelector('[role="status"]')) break; } };
const groupsOf = (q: Obj) => (q.composite as { groups: { id: string; gradingPolicy: string; requiredAnswers: unknown; maxMarks: unknown; parts: Obj[] }[] }).groups;
const contextsOf = (q: Obj) => (q.composite as { contexts: Obj[] }).contexts;
const errors = (q: Obj) => validateCompositeQuestion(q).map(i => i.code);

function mount(initial: Obj) {
  const box: { q: Obj; patches: Obj[] } = { q: initial, patches: [] };
  function Host() {
    const [q, setQ] = useState<Obj>(initial);
    return <CompositeEditor node={q as unknown as QuestionBody} onChange={patch => { box.patches.push(patch as Obj); setQ(prev => { const next = mergePatch(prev, patch as Obj); box.q = next; return next; }); }} />;
  }
  const r = render(<Host />);
  return { ...r, box };
}
async function confirmWith(label: string) {
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: label }));
  await act(async () => { await Promise.resolve(); });
}

describe("20D-ED1 parts and groups", () => {
  it("add / duplicate / delete (confirmed) / move a part between groups — fresh ids, valid composite, marks never rewritten silently", async () => {
    const question = compositeArabicExam().sections[0].questions[0] as unknown as Obj;
    const { container, box } = mount(question);
    await settle(container);
    expect(errors(box.q)).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "+ إضافة بند إلى المجموعة 3" }));
    const added = groupsOf(box.q)[2].parts[1];
    expect(added.type).toBe("multipleChoice");
    expect(added.marks).toBe(1);
    expect(typeof added.label).toBe("string");
    expect(box.patches.every(p => !("marks" in p))).toBe(true);
    expect(errors(box.q)).toEqual(["COMPOSITE_MARKS_MISMATCH"]);                // 21 ≠ 20: warned, never silently rewritten
    expect(container.querySelector(".cmp-marks-mismatch")).toBeTruthy();
    fireEvent.click(within(container.querySelector(".cmp-marks-mismatch") as HTMLElement).getByRole("button"));
    expect(box.patches.at(-1)).toEqual({ marks: 21 });
    expect(errors(box.q)).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "تكرار البند أ" }));
    const gA = groupsOf(box.q)[0].parts;
    expect(gA).toHaveLength(5);
    expect(gA[1].id).not.toBe("pA1");
    expect(gA[1].type).toBe("multipleChoice");
    expect(gA[1].contextId).toBe("ctxText");

    fireEvent.click(screen.getByRole("button", { name: "حذف البند ب" }));
    await confirmWith("حذف البند");
    expect(groupsOf(box.q)[0].parts.map(p => p.id)).not.toContain("pA2");

    fireEvent.change(screen.getByRole("combobox", { name: "نقل البند ح إلى مجموعة أخرى" }), { target: { value: "gA" } });
    expect(groupsOf(box.q)[0].parts.at(-1)!.id).toBe("pC1");
    expect(groupsOf(box.q)[2].parts.map(p => p.id)).not.toContain("pC1");

    // +2 (duplicate) −3 (delete) → official 20 ≠ 21: the explicit button aligns the question mark again
    expect(errors(box.q)).toEqual(["COMPOSITE_MARKS_MISMATCH"]);
    fireEvent.click(within(container.querySelector(".cmp-marks-mismatch") as HTMLElement).getByRole("button"));
    expect(box.patches.at(-1)).toEqual({ marks: 20 });
    expect(errors(box.q)).toEqual([]);
    expect(container.querySelector(".cmp-marks-mismatch")).toBeNull();
  });

  it("a group switched to firstNAnswered with equal part marks becomes a valid first-N group; back to all clears its quota", async () => {
    const question = compositeArabicExam().sections[0].questions[0] as unknown as Obj;
    const { container, box } = mount(question);
    await settle(container);
    fireEvent.click(screen.getByRole("button", { name: "إضافة مجموعة" }));
    const gid = groupsOf(box.q)[3].id;
    fireEvent.click(screen.getByRole("button", { name: "+ إضافة بند إلى المجموعة 4" }));
    fireEvent.click(screen.getByRole("button", { name: "+ إضافة بند إلى المجموعة 4" }));
    fireEvent.change(screen.getByRole("combobox", { name: "قاعدة تصحيح المجموعة 4" }), { target: { value: "firstNAnswered" } });
    let g = groupsOf(box.q).find(x => x.id === gid)!;
    expect(g).toMatchObject({ gradingPolicy: "firstNAnswered", requiredAnswers: 2, maxMarks: 2 });
    fireEvent.change(screen.getByRole("combobox", { name: "قاعدة تصحيح المجموعة 4" }).closest(".cmp-editor-policy")!.querySelector('input[aria-label="عدد الإجابات المطلوبة في المجموعة 4"]')!, { target: { value: "1" } });
    g = groupsOf(box.q).find(x => x.id === gid)!;
    expect(g).toMatchObject({ requiredAnswers: 1, maxMarks: 1 });
    expect(errors(box.q)).toEqual(["COMPOSITE_MARKS_MISMATCH"]);
    fireEvent.click(within(container.querySelector(".cmp-marks-mismatch") as HTMLElement).getByRole("button"));
    expect(box.patches.at(-1)).toEqual({ marks: 21 });
    expect(errors(box.q)).toEqual([]);
    fireEvent.change(screen.getByRole("combobox", { name: "قاعدة تصحيح المجموعة 4" }), { target: { value: "all" } });
    expect(groupsOf(box.q).find(x => x.id === gid)).toMatchObject({ gradingPolicy: "all", requiredAnswers: null, maxMarks: null });
  });
});

describe("20D-ED3 exact child identity", () => {
  it("a coding child switches to an EXACT supported version (confirmed): the body is re-seeded for that version, identity / marks / link kept", async () => {
    const question = compositeCsExam().sections[0].questions[0] as unknown as Obj;
    const { container, box } = mount(question);
    await settle(container);
    const select = screen.getByRole("combobox", { name: "إصدار نوع البند ج" }) as HTMLSelectElement;
    expect([...select.options].map(o => o.value)).toEqual(["1", "2", "3"]);
    expect(select.value).toBe("2");
    fireEvent.change(select, { target: { value: "3" } });
    await confirmWith("تغيير الإصدار");
    const c1 = groupsOf(box.q)[1].parts.find(p => p.id === "c1")!;
    expect(c1).toMatchObject({ id: "c1", type: "coding", questionTypeVersion: 3, marks: 10, label: "ج" });
    expect((c1.coding as Obj).template).toBeTruthy();
    expect(errors(box.q)).toEqual([]);
  });
});

describe("20D-ED2 shared contexts", () => {
  it("linking an independent SmartSim part to a SmartSim context sets contextId and removes its own envelope", async () => {
    const question = compositePhysicsExam().sections[0].questions[0] as unknown as Obj;
    const { container, box } = mount(question);
    await settle(container);
    fireEvent.click(screen.getByRole("button", { name: "+ إضافة بند إلى المجموعة 2" }));
    const pid = groupsOf(box.q)[1].parts[2].id;
    const label = String(groupsOf(box.q)[1].parts[2].label);
    fireEvent.change(screen.getByRole("combobox", { name: "نوع البند " + label }), { target: { value: "smartSim" } });
    let part = groupsOf(box.q)[1].parts.find(p => p.id === pid)!;
    expect(part.type).toBe("smartSim");
    expect(part.smartSim).toBeTruthy();
    expect(part.contextId).toBeUndefined();
    fireEvent.change(screen.getByRole("combobox", { name: "السياق المشترك لـالبند " + label }), { target: { value: "ctxSim" } });
    part = groupsOf(box.q)[1].parts.find(p => p.id === pid)!;
    expect(part.contextId).toBe("ctxSim");
    expect("smartSim" in part).toBe(false);
    expect(part.answer).toEqual({ scoring: "proportional", checks: [] });
    // the strict authority sees a linked part (its empty private key is the only content blocker), never a duplicated envelope
    const codes = errors(box.q);
    expect(codes).not.toContain("COMPOSITE_SMARTSIM_LINKED_ENVELOPE");
    expect(codes).not.toContain("COMPOSITE_SMARTSIM_CONTEXT_REQUIRED");
  });

  it("removing a context (confirmed) unlinks every part that read it; a linked SmartSim part keeps a copy of the envelope and its checks", async () => {
    const question = compositePhysicsExam().sections[0].questions[0] as unknown as Obj;
    const envelope = JSON.stringify((contextsOf(question)[0] as Obj).smartSim);
    const { container, box } = mount(question);
    await settle(container);
    fireEvent.click(screen.getByRole("button", { name: "حذف محاكاة السقوط الحر" }));
    await confirmWith("حذف السياق");
    expect(contextsOf(box.q)).toEqual([]);
    const parts = groupsOf(box.q).flatMap(g => g.parts);
    expect(parts.some(p => "contextId" in p)).toBe(false);
    const s1 = parts.find(p => p.id === "s1")!;
    expect(JSON.stringify(s1.smartSim)).toBe(envelope);
    expect((s1.answer as { checks: unknown[] }).checks).toHaveLength(1);
    expect(errors(box.q)).toEqual([]);
  });

  it("adding a shared source context creates one text source; an authored composite counts as type content", async () => {
    const question = compositeArabicExam().sections[0].questions[0] as unknown as Obj;
    const { container, box } = mount({ ...question, composite: { v: 1, contexts: [], groups: [groupsOf(question)[2]] }, marks: 6 });
    await settle(container);
    fireEvent.click(screen.getByRole("button", { name: "+ مصدر مشترك" }));
    const ctx = contextsOf(box.q)[0] as { id: string; kind: string; sources: Obj[] };
    expect(ctx.kind).toBe("source");
    expect(ctx.sources).toEqual([{ id: ctx.sources[0].id, version: 1, kind: "text", text: "" }]);
    expect(typeSpecificContentPresent(box.q)).toBe(true);
    const fresh = { presentationType: "composite", composite: { v: 1, contexts: [], groups: [{ id: "g1", title: "", gradingPolicy: "all", requiredAnswers: null, maxMarks: null, parts: [{ id: "p1", type: "multipleChoice", text: "", marks: 1, options: [{ text: "" }, { text: "" }], answer: { correctOptionIndex: 0 } }] }] } };
    expect(typeSpecificContentPresent(fresh)).toBe(false);
  });
});
