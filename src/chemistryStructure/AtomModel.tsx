import { chemShellLetter } from "../chemistry/electrons";

// Phase 21D-D.1 — the educational SHELL DIAGRAM of an atom or ion (SVG, presentation only). The nucleus shows its proton and neutron
// counts; electrons are drawn evenly on concentric circles grouped by the principal shell n (K, L, M, N). The figure says what it is: an
// educational model — the circles are NOT orbits or trajectories (an electron's position is described by orbitals, as probabilities).
const RINGS = [58, 86, 114, 142];
export const ATOM_MODEL_NOTE = "تمثيل تعليمي: الدوائر تجمع الإلكترونات حسب رقم الغلاف (n)، وليست مدارات أو مسارات حقيقية؛ موقع الإلكترون يوصف احتماليًا بالأفلاك.";

export default function AtomModel({ protons, neutrons, shells, cloud, caption }: { protons: number; neutrons: number; shells: readonly number[] | null; cloud?: number; caption: string }) {
  const drawn = shells ? shells.slice(0, RINGS.length) : [];
  return (
    <figure className="chem-atom-model" data-testid="chem-atom-model" data-shells={shells ? shells.join(",") : ""}>
      <svg viewBox="0 0 300 300" role="img" aria-label={caption + " — " + protons + " بروتون، " + neutrons + " نيوترون" + (shells ? "، الإلكترونات في الأغلفة: " + (shells.join("، ") || "لا شيء") : cloud !== undefined ? "، " + cloud + " إلكترون" : "")}>
        {drawn.map((_, i) => <circle key={"ring" + i} className="chem-shell" cx={150} cy={150} r={RINGS[i]} />)}
        {drawn.map((_, i) => <text key={"label" + i} className="chem-shell-label" x={150} y={150 - RINGS[i] - 4}>{chemShellLetter(i)}</text>)}
        {drawn.flatMap((count, i) => Array.from({ length: count }, (_, k) => {
          const t = (2 * Math.PI * k) / Math.max(count, 1) + i * 0.35 - Math.PI / 2;
          return <circle key={"e" + i + "-" + k} className="chem-electron" cx={150 + RINGS[i] * Math.cos(t)} cy={150 + RINGS[i] * Math.sin(t)} r={count > 14 ? 3.6 : 4.6} />;
        }))}
        {!shells && cloud !== undefined && cloud > 0 && <><circle className="chem-cloud" cx={150} cy={150} r={100} /><text className="chem-cloud-label" x={150} y={58}>{"e⁻ × " + cloud}</text></>}
        <circle className="chem-nucleus" cx={150} cy={150} r={28} />
        <text className="chem-nucleus-text" x={150} y={146}>{protons + "p⁺"}</text>
        <text className="chem-nucleus-text" x={150} y={162}>{neutrons + "n"}</text>
      </svg>
      <figcaption>{caption}<small>{ATOM_MODEL_NOTE}</small></figcaption>
    </figure>
  );
}
