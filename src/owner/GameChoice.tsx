import type { EducationalGame } from "./ownerApi";

/**
 * Tadris+ P7-B2 — «الألعاب المخوَّلة» in the owner's access editor (owner decision §19.25): every game (the default, and every game
 * added later) or only the checked ones. Applied with the capabilities while the owner enforces access: a game left out is not
 * available to the teacher nor to their students. A game whose capability the chosen set does not hold cannot be used — it says so.
 */
export default function GameChoice({ teacherId, games, chosenCapabilities, mode, onMode, chosen, onChosen }: {
  teacherId: string; games: EducationalGame[]; chosenCapabilities: Set<string>; mode: "all" | "some"; onMode: (m: "all" | "some") => void;
  chosen: Set<string>; onChosen: (next: Set<string>) => void;
}) {
  const toggle = (id: string, on: boolean) => { const n = new Set(chosen); if (on) n.add(id); else n.delete(id); onChosen(n); };
  return (
    <fieldset className="eb-owner-access-options eb-owner-games-choice">
      <legend>الألعاب المخوَّلة</legend>
      <label className="eb-owner-access-option">
        <input type="radio" name={"games-" + teacherId} checked={mode === "all"} onChange={() => onMode("all")} />
        <span><strong>كل الألعاب</strong><small>كل ما تسمح به صلاحياته، ومعها كل لعبة تُضاف لاحقًا.</small></span>
      </label>
      <label className="eb-owner-access-option">
        <input type="radio" name={"games-" + teacherId} checked={mode === "some"} onChange={() => onMode("some")} />
        <span><strong>ألعاب محددة فقط</strong><small>اللعبة غير المختارة لا يستخدمها المعلم ولا يلعبها طلابه.</small></span>
      </label>
      {mode === "some" && games.map(g => (
        <label key={g.id} className="eb-owner-check">
          <input type="checkbox" checked={chosen.has(g.id)} onChange={e => toggle(g.id, e.target.checked)} />
          <span>{g.label}{chosenCapabilities.has(g.capability) ? "" : " (لن تُتاح: تحتاج صلاحية غير مختارة)"}</span>
        </label>
      ))}
      {mode === "some" && chosen.size === 0 && <p className="eb-owner-hint">لم تختر أي لعبة: لن تُتاح له ولا لطلابه أي لعبة أثناء التطبيق.</p>}
    </fieldset>
  );
}
