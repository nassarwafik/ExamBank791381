import { useState, type ReactNode } from "react";
import {
  chemLabContext, type ChemLabConfigV1, type ChemLabStateV1, type PhExperiment, type RateExperiment, type SolutionsContext, type SolutionsExperiment,
  type SolutionsLabState, type TitrationExperiment, type TitrationLabState
} from "../chemistryLabModel";
import type { ChemLabAction } from "../chemistryLabPlugin";
import { parseDecimal, toFixed, toNumber } from "../chemistry/lab/exact";
import { isBalanceMass } from "../chemistry/lab/solutions";
import { acidBaseSpecies, formatPh, indicatorById, type Indicator } from "../chemistry/lab/acidBase";
import { BURETTE, isBuretteStep } from "../chemistry/lab/titration";
import { RATE_ORDER_LABEL, decayCurve, rateConstantDimension } from "../chemistry/lab/kinetics";
import { LAB_UNITS } from "../chemistry/lab/units";
import DynamicPlot2D from "../smartsim/dynamic/DynamicPlot2D";
import { Balance, Beaker, Burette, PhScale, VolumetricFlask } from "./LabInstruments";
import { appearance, dilutionCurve, flaskPh, isolateQuantities, ltr, mix, phOf, preparedView, rateContext, sig, studentDecimal, titrationContext, trialConcentration } from "./labView";

// Phase 21D-D.3 — the four benches of the chemistryLab@1 workspace (UI only). Every button is ONE semantic action the workspace replays
// through the registered plugin; what a bench SHOWS (instrument readings, colours, curves) is derived from the replayed state by the science
// modules the server uses, and appears only where the teacher enabled it. Colours and liquid levels are illustrative pictures.
export type BenchProps = { cfg: ChemLabConfigV1; state: ChemLabStateV1; disabled?: boolean; act: (a: ChemLabAction, message: string) => void; recordFull: boolean; uid: string };
const PLOT_W = 360, PLOT_H = 220;
const WATER = "#dcecfb";

function Step({ n, children }: { n: number; children: ReactNode }) {
  return <li className="clab-step"><span className="clab-step-n" aria-hidden="true">{n}</span><div className="clab-step-body">{children}</div></li>;
}

// ── Lab A — solutions and dilution ─────────────────────────────────────────────────────────────────────────────────────────────────────
export function SolutionsBench({ cfg, state, disabled, act, recordFull, uid }: BenchProps) {
  const e = cfg.experiment as SolutionsExperiment, lab = state.lab as SolutionsLabState, ctx = chemLabContext(e) as SolutionsContext, solute = ctx.solute;
  const [massText, setMassText] = useState(lab.mass ?? "");
  const [error, setError] = useState("");
  const view = preparedView(cfg, state), solid = e.source === "solid";
  const placed = solid ? lab.mass !== null : lab.pipette !== null;
  const maxMass = ctx.maxMass ? toFixed(ctx.maxMass, 2) : "—";
  const weigh = () => {
    const t = studentDecimal(massText), m = t ? parseDecimal(t) : null;
    if (!t || !m || !ctx.maxMass || !isBalanceMass(m, ctx.maxMass)) { setError("أدخل كتلة موجبة لأقرب 0.01 g لا تتجاوز " + maxMass + " g (حد الميزان في هذه التجربة)."); return; }
    setError(""); act({ type: "solution.mass", mass: t }, "وُضع " + toFixed(m, 2) + " g من " + solute.nameAr + " على الميزان.");
  };
  const tint = solute.colour
    ? view.state === "ready" ? mix("#ffffff", solute.colour, 0.15 + 0.85 * Math.min(1, view.concentration / toNumber(solute.maxConcentration))) : placed ? mix("#ffffff", solute.colour, 0.6) : WATER
    : WATER;
  const fill = lab.madeUp ? 1 : placed && lab.flask !== null ? 0.4 : 0;
  const vMin = solid ? Math.min(...e.flasks) / 2 : Math.max(1, lab.pipette ?? Math.min(...e.pipettes)), vMax = Math.max(...e.flasks);
  return (
    <section className="clab-bench" aria-label="طاولة تحضير المحاليل" data-testid="clab-bench-solutions">
      <p className="chem-note">
        المادة: <strong>{solute.nameAr}</strong> <span className="chem-ltr chem-formula">{solute.formula}</span>
        {solid ? <> — الكتلة المولية <span className="chem-ltr">{toFixed(solute.molarMass, 3)} g/mol</span></> : <> — المحلول الأم <span className="chem-ltr">{e.stock} mol/L</span></>}
      </p>
      {solute.note && <p className="chem-help">{solute.note}</p>}
      <div className="clab-stage">
        <div className="clab-instruments">
          {solid && <figure className="clab-figure"><Balance mass={lab.mass} /><figcaption>{isolateQuantities("الميزان (دقة 0.01 g)")}</figcaption></figure>}
          <figure className="clab-figure">
            <VolumetricFlask volume={lab.flask} fill={fill} colour={tint} label={lab.flask === null ? "لم يُختر دورق" : "دورق حجمي " + lab.flask + " mL" + (lab.madeUp ? " مكمّل إلى العلامة" : "")} />
            <figcaption>{lab.flask === null ? "اختر دورقًا" : lab.madeUp ? "مكمّل إلى العلامة" : "لم يُكمل إلى العلامة"}{solute.colour && <small className="clab-illustrative"> · اللون تمثيل توضيحي</small>}</figcaption>
          </figure>
        </div>
        <ol className="clab-steps">
          <Step n={1}>
            <span id={uid + "-flask"}>اختر الدورق الحجمي</span>
            <div className="chem-row" role="group" aria-labelledby={uid + "-flask"}>
              {e.flasks.map(v => <button key={v} type="button" aria-pressed={lab.flask === v} disabled={disabled} onClick={() => act({ type: "solution.flask", volume: v }, "اخترت دورقًا حجمه " + v + " mL.")}><span className="chem-ltr">{v} mL</span></button>)}
            </div>
          </Step>
          <Step n={2}>
            {solid ? <>
              <div className="clab-field"><label htmlFor={uid + "-mass"}>الكتلة على الميزان (g)</label>
                <span className="chem-row">
                  <input id={uid + "-mass"} type="text" inputMode="decimal" dir="ltr" autoComplete="off" spellCheck={false} maxLength={12} value={massText} disabled={disabled} data-testid="clab-mass"
                    aria-invalid={error ? true : undefined} aria-describedby={error ? uid + "-mass-err" : undefined}
                    onChange={ev => setMassText(ev.target.value)} onKeyDown={ev => { if (ev.key === "Enter") { ev.preventDefault(); if (!disabled) weigh(); } }} />
                  <button type="button" disabled={disabled} onClick={weigh}>ضع على الميزان</button>
                </span>
              </div>
              <small className="chem-help">من 0.01 إلى {maxMass} g.</small>
              {error && <p id={uid + "-mass-err"} className="chem-error" role="alert">{isolateQuantities(error)}</p>}
            </> : <>
              <span id={uid + "-pipette"}>انقل بالماصّة حجمًا من المحلول الأم</span>
              <div className="chem-row" role="group" aria-labelledby={uid + "-pipette"}>
                {e.pipettes.map(v => <button key={v} type="button" aria-pressed={lab.pipette === v} disabled={disabled} onClick={() => act({ type: "solution.pipette", volume: v }, "نُقل " + v + " mL من المحلول الأم بالماصّة.")}>ماصّة <span className="chem-ltr">{v} mL</span></button>)}
              </div>
            </>}
          </Step>
          <Step n={3}>
            <button type="button" data-testid="clab-makeup" disabled={disabled || lab.flask === null || !placed || lab.madeUp}
              onClick={() => act({ type: "solution.makeUp" }, "أُكمل الحجم بالماء المقطر إلى العلامة ورُجّ الدورق.")}>أكمل بالماء المقطر إلى العلامة</button>
          </Step>
          <Step n={4}>
            <button type="button" data-testid="clab-record" disabled={disabled || !lab.madeUp || recordFull} onClick={() => act({ type: "lab.record" }, "سُجّل المحلول في جدول الملاحظات.")}>سجّل المحلول في جدول الملاحظات</button>
          </Step>
        </ol>
      </div>
      {view.state === "invalid" && <p className="chem-error" role="alert">حجم الماصّة يجب أن يكون أصغر من حجم الدورق؛ هذا التحضير غير ممكن.</p>}
      {view.state === "outside" && <p className="chem-error" role="alert" data-testid="clab-outside">التركيز الناتج يتجاوز الحد الذي يدعمه النموذج لهذه المادة ({ltr(toNumber(solute.maxConcentration) + " mol/L")})؛ لا تُعرض له قيمة.</p>}
      {cfg.view.readouts && view.state === "ready" && <p className="clab-readout" data-testid="clab-label-readout">ملصق الدورق (قيمة محسوبة من الكتلة أو الحجم المنقول وحجم الدورق): <span className="chem-ltr">c = {sig(view.concentration)} mol/L</span></p>}
      {cfg.view.graph && view.state === "ready" && (
        <figure className="clab-plot">
          <DynamicPlot2D width={PLOT_W} height={PLOT_H} xDomain={[vMin, vMax]} yDomain={[0, (view.moles / (vMin / 1000)) * 1.05]} xLabel="V (mL)" yLabel="c (mol/L)"
            title="التركيز مقابل الحجم عند ثبات كمية المادة" testId="clab-plot-dilution" progress={[{ id: "c", points: dilutionCurve(view.moles, vMin, vMax) }]}
            marker={{ x: view.flask, y: view.concentration, label: "دورقك: " + view.flask + " mL" }} />
          <figcaption className="chem-help">عند ثبات كمية المادة المذابة n يتناسب التركيز عكسيًا مع الحجم: c = n / V (والنقطة هي دورقك).</figcaption>
        </figure>
      )}
      {!disabled && <button type="button" className="is-secondary" onClick={() => act({ type: "lab.reset" }, "أُفرغت الأدوات؛ جدول الملاحظات والإجابات محفوظة.")}>إفراغ الأدوات والبدء بتحضير جديد</button>}
    </section>
  );
}

// ── Lab B — pH meter and indicators ────────────────────────────────────────────────────────────────────────────────────────────────────
export function PhBench({ cfg, state, disabled, act, recordFull }: BenchProps) {
  const e = cfg.experiment as PhExperiment, indicators = e.indicators.map(id => indicatorById(id)!) as Indicator[];
  const measured = (id: string) => state.observations.some(o => o.kind === "meter" && o.solution === id);
  const tested = (id: string, ind: string) => state.observations.some(o => o.kind === "indicator" && o.solution === id && o.indicator === ind);
  const marks = e.solutions.filter(s => measured(s.id)).map(s => ({ id: s.id, label: s.label, pH: phOf(cfg, s.id) ?? 7 }));
  return (
    <section className="clab-bench" aria-label="طاولة الأحماض والقواعد" data-testid="clab-bench-ph">
      <p className="chem-note">كل المحاليل عند {ltr("25 °C")}. {cfg.view.readouts ? "قِس pH بجهاز القياس، أو" : "لا يتوفر جهاز قياس pH في هذه التجربة؛"} اختبر عينة من كل محلول بقطرات من الكاشف ولاحظ اللون.</p>
      <div className="clab-solutions">
        {e.solutions.map(s => {
          const sp = acidBaseSpecies(s.species)!, pH = phOf(cfg, s.id);
          return (
            <article key={s.id} className="clab-card" data-testid="clab-solution" data-id={s.id} aria-label={s.label}>
              <h4>{isolateQuantities(s.label)}</h4>
              <p className="chem-help"><span className="chem-ltr chem-formula">{sp.formula}</span> — {sp.nameAr}</p>
              <div className="clab-samples">
                <Beaker colour={WATER} label={"عينة من " + s.label} caption="العينة" />
                {indicators.filter(ind => tested(s.id, ind.id)).map(ind => {
                  const a = pH === null ? null : appearance(ind, pH);
                  return a && <figure key={ind.id} className="clab-sample" data-testid="clab-indicator-result"><Beaker colour={a.colour} conical label={ind.nameAr + " في " + s.label + ": " + a.name} /><figcaption>{ind.nameAr}: <strong>{a.name}</strong></figcaption></figure>;
                })}
              </div>
              {cfg.view.readouts && (measured(s.id)
                ? <p className="clab-meter" data-testid="clab-meter-reading">جهاز pH: <span className="chem-ltr">pH = {pH === null ? "—" : formatPh(pH)}</span></p>
                : <button type="button" disabled={disabled || recordFull} onClick={() => act({ type: "ph.measure", solutionId: s.id }, "قيس pH " + s.label + ".")}>قِس pH بالجهاز</button>)}
              <div className="chem-row" role="group" aria-label={"اختبار " + s.label + " بالكواشف"}>
                {indicators.map(ind => <button key={ind.id} type="button" className="is-secondary" disabled={disabled || recordFull || tested(s.id, ind.id)}
                  onClick={() => act({ type: "ph.indicator", solutionId: s.id, indicatorId: ind.id }, "أضيفت قطرات " + ind.nameAr + " إلى عينة من " + s.label + ".")}>أضف {ind.nameAr}</button>)}
              </div>
            </article>
          );
        })}
      </div>
      {cfg.view.graph && (
        <figure className="clab-plot">
          <PhScale indicators={indicators} marks={cfg.view.readouts ? marks : []} />
          <figcaption className="chem-help">مقياس pH ومدى تغيّر لون كل كاشف{cfg.view.readouts ? " والمحاليل التي قستها" : ""}. اللون داخل مدى التغير انتقالي ولا يحدد pH بدقة.</figcaption>
        </figure>
      )}
    </section>
  );
}

// ── Lab C — strong acid / strong base titration ───────────────────────────────────────────────────────────────────────────────────────
const STEPS = ["0.05", "0.10", "0.50", "1.00", "5.00"];
export function TitrationBench({ cfg, state, disabled, act, recordFull, uid }: BenchProps) {
  const e = cfg.experiment as TitrationExperiment, lab = state.lab as TitrationLabState, ctx = titrationContext(cfg)!, s = ctx.setup;
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const added = parseDecimal(lab.added)!, addedN = toNumber(added), pH = flaskPh(cfg, lab.added) ?? 7;
  const ind = lab.indicator ? indicatorById(lab.indicator) : undefined, look = ind ? appearance(ind, pH) : null;
  const room = (v: string) => addedN + Number(v) <= BURETTE.capacityML + 1e-9;
  const add = (v: string) => act({ type: "titration.add", volume: v }, "أُضيف " + v + " mL من السحاحة.");
  const addTyped = () => {
    const t = studentDecimal(text), v = t ? parseDecimal(t) : null;
    if (!t || !v || !isBuretteStep(v)) { setError("أدخل حجمًا موجبًا من مضاعفات القطرة (0.05 mL)، مثل 0.35 أو 2.00."); return; }
    if (!room(t)) { setError("لا يكفي ما بقي في السحاحة (السعة " + BURETTE.capacityML + " mL)."); return; }
    setError(""); add(toFixed(v, 2));
  };
  const readings = state.observations.filter(o => o.kind === "reading").map(o => (o as { added: string }).added);
  const points = [...new Set(readings)].map(v => ({ x: Number(v), y: flaskPh(cfg, v) ?? 7 })).sort((a, b) => a.x - b.x);
  const xMax = Math.min(BURETTE.capacityML, Math.max(10, addedN, ...points.map(p => p.x)) + 2);
  const analyte = s.analyte, titrant = s.titrant;
  return (
    <section className="clab-bench" aria-label="طاولة المعايرة" data-testid="clab-bench-titration">
      <p className="chem-note">
        في الدورق المخروطي: <span className="chem-ltr">{e.analyte.volume} mL</span> من {analyte.nameAr} <span className="chem-ltr chem-formula">{analyte.formula}</span>{" "}
        {ctx.unknown ? <strong>(تركيزه مجهول)</strong> : <>تركيزه <span className="chem-ltr">{e.analyte.concentration} mol/L</span></>}.
        في السحاحة: {titrant.nameAr} <span className="chem-ltr chem-formula">{titrant.formula}</span> تركيزه <span className="chem-ltr">{e.titrant.concentration} mol/L</span>.
      </p>
      <p className="chem-note">معادلة التعادل: <span className="chem-ltr chem-formula" data-testid="clab-equation">{s.equation}</span></p>
      <fieldset className="chem-task">
        <legend>الكاشف في الدورق</legend>
        <div className="chem-options" role="radiogroup" aria-label="الكاشف">
          {e.indicators.map(id => { const x = indicatorById(id)!; return (
            <label key={id} className="chem-option"><input type="radio" name={uid + "-indicator"} checked={lab.indicator === id} disabled={disabled}
              onChange={() => act({ type: "titration.indicator", indicatorId: id }, "أُضيفت قطرات " + x.nameAr + " إلى الدورق.")} />{x.nameAr} <small className="chem-ltr">({x.low}–{x.high})</small></label>
          ); })}
        </div>
      </fieldset>
      <div className="clab-stage">
        <div className="clab-instruments">
          <figure className="clab-figure"><Burette added={addedN} capacity={BURETTE.capacityML} /><figcaption>السحاحة <span className="chem-ltr">50 mL</span></figcaption></figure>
          <figure className="clab-figure">
            <Beaker conical colour={look ? look.colour : WATER} fill={0.25 + 0.5 * Math.min(1, (toNumber(s.va) + addedN) / (toNumber(s.va) + BURETTE.capacityML))}
              label={"الدورق: " + (look ? ind!.nameAr + " " + look.name : "بلا كاشف")} />
            <figcaption>{look ? <>اللون: <strong data-testid="clab-flask-colour">{look.name}</strong></> : "لم يُضف كاشف"} <small className="clab-illustrative">(تمثيل توضيحي)</small></figcaption>
          </figure>
        </div>
        <div className="clab-controls">
          <p className="clab-readout" aria-live="polite">قراءة السحاحة (الحجم المضاف): <span className="chem-ltr" data-testid="clab-burette-reading">{lab.added} mL</span></p>
          {cfg.view.readouts && <p className="clab-meter">جهاز pH: <span className="chem-ltr" data-testid="clab-flask-ph">pH = {formatPh(pH)}</span></p>}
          <div className="chem-row" role="group" aria-label="إضافة المحلول القياسي من السحاحة">
            {STEPS.map(v => <button key={v} type="button" disabled={disabled || !room(v)} onClick={() => add(v)}>{v === "0.05" ? isolateQuantities("قطرة واحدة (0.05 mL)") : <>+ <span className="chem-ltr">{v} mL</span></>}</button>)}
          </div>
          <div className="clab-field"><label htmlFor={uid + "-add"}>أضف حجمًا آخر (mL)</label>
            <span className="chem-row">
              <input id={uid + "-add"} type="text" inputMode="decimal" dir="ltr" autoComplete="off" spellCheck={false} maxLength={8} value={text} disabled={disabled} data-testid="clab-add-volume"
                aria-invalid={error ? true : undefined} onChange={ev => setText(ev.target.value)} onKeyDown={ev => { if (ev.key === "Enter") { ev.preventDefault(); if (!disabled) addTyped(); } }} />
              <button type="button" disabled={disabled} onClick={addTyped}>أضف</button>
            </span>
          </div>
          {error && <p className="chem-error" role="alert">{isolateQuantities(error)}</p>}
          <div className="chem-row">
            <button type="button" data-testid="clab-record" disabled={disabled || recordFull} onClick={() => act({ type: "lab.record" }, "سُجّلت قراءة السحاحة " + lab.added + " mL.")}>سجّل القراءة</button>
            {!disabled && <button type="button" className="is-secondary" onClick={() => act({ type: "lab.reset" }, "عُبّئت السحاحة ووُضع دورق جديد؛ القراءات المسجلة والإجابات محفوظة.")}>دورق جديد وتعبئة السحاحة</button>}
          </div>
        </div>
      </div>
      {cfg.view.graph && cfg.view.readouts && (
        <figure className="clab-plot">
          <DynamicPlot2D width={PLOT_W} height={PLOT_H} xDomain={[0, xMax]} yDomain={[0, 14]} xLabel="V (mL)" yLabel="pH" title="منحنى المعايرة من قراءاتك المسجلة" testId="clab-plot-titration"
            progress={[{ id: "readings", points }]} marker={{ x: addedN, y: pH, label: "الآن: " + lab.added + " mL" }} events={points.map(p => ({ x: p.x, y: p.y, label: p.x.toFixed(2) + " mL · pH " + formatPh(p.y), kind: "reading" }))} />
          <figcaption className="chem-help">يُرسم المنحنى من القراءات التي سجّلتها فقط؛ سجّل قراءات أكثر قرب القفزة لتحدد نقطة التكافؤ بدقة.</figcaption>
        </figure>
      )}
      <details className="clab-explain">
        <summary>نقطة التكافؤ ونقطة النهاية</summary>
        <p className="chem-help"><strong>نقطة التكافؤ</strong>: الحجم الذي تكون عنده كمية القاعدة المضافة مكافئة تمامًا لكمية الحمض حسب المعادلة الموزونة (pH = 7.00 عند {ltr("25 °C")} في معايرة حمض قوي بقاعدة قوية).</p>
        <p className="chem-help"><strong>نقطة النهاية</strong>: الحجم الذي يتغير عنده لون الكاشف. تقترب من نقطة التكافؤ ولا تساويها بالضرورة؛ الفرق بينهما هو خطأ الكاشف.</p>
      </details>
    </section>
  );
}

// ── Lab D — reaction rate ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
const SERIES = ["clab-s1", "clab-s2", "clab-s3", "clab-s4"];
export function RateBench({ cfg, state, disabled, act, recordFull }: BenchProps) {
  const e = cfg.experiment as RateExperiment, ctx = rateContext(cfg)!;
  const [t, setT] = useState(0);
  const ran = (id: string) => state.observations.some(o => o.kind === "run" && o.trial === id);
  const kUnit = LAB_UNITS[rateConstantDimension(e.order)][0].label;
  const runTrials = e.trials.filter(tr => ran(tr.id));
  const yMax = Math.max(...e.trials.map(tr => ctx.trials[tr.id].a0)) * 1.05;
  const stepT = Math.max(1, Math.round(e.duration / 120));
  return (
    <section className="clab-bench" aria-label="طاولة سرعة التفاعل" data-testid="clab-bench-rate">
      <p className="chem-note">
        تفاعل نموذجي <span className="chem-ltr chem-formula">A → products</span> — {RATE_ORDER_LABEL[e.order]}، ثابت السرعة عند {ltr("25 °C")}:{" "}
        <span className="chem-ltr">k = {e.k25} {kUnit}</span>، طاقة التنشيط <span className="chem-ltr">Ea = {e.ea} kJ/mol</span>
        {e.catalystDrop !== null && <>، والحافز يخفض طاقة التنشيط بمقدار <span className="chem-ltr">{e.catalystDrop} kJ/mol</span></>}.
      </p>
      <div className="clab-table-scroll">
        <table className="clab-table">
          <caption>التجارب</caption>
          <thead><tr><th scope="col">التجربة</th><th scope="col">درجة الحرارة</th><th scope="col">[A]₀</th><th scope="col">حافز</th><th scope="col">تشغيل</th>{cfg.view.readouts && <th scope="col">[A] عند t</th>}</tr></thead>
          <tbody>
            {e.trials.map((tr, i) => {
              const c = trialConcentration(cfg, tr.id, t);
              return (
                <tr key={tr.id} data-testid="clab-trial" data-id={tr.id}>
                  <th scope="row"><span className={"clab-swatch " + SERIES[i]} aria-hidden="true" /> {isolateQuantities(tr.label)}</th>
                  <td className="clab-num">{tr.temperature} °C</td><td className="clab-num">{tr.concentration} mol/L</td><td>{tr.catalyst ? "نعم" : "لا"}</td>
                  <td>{ran(tr.id) ? "شُغّلت" : <button type="button" disabled={disabled || recordFull} onClick={() => act({ type: "rate.run", trialId: tr.id }, "شُغّلت " + tr.label + ".")}>شغّل</button>}</td>
                  {cfg.view.readouts && <td className="clab-num" data-testid="clab-trial-readout">{ran(tr.id) && c !== null ? sig(c) + " mol/L" : "—"}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <label className="clab-field clab-time"><span>زمن المشاهدة t (ث) — للعرض فقط، لا يُحفظ</span>
        <span className="chem-row">
          <input type="range" dir="ltr" min={0} max={e.duration} step={stepT} value={t} onChange={ev => setT(Number(ev.target.value))} aria-valuetext={t + " s"} data-testid="clab-time" />
          <span className="chem-ltr clab-num">t = {t} s</span>
        </span>
      </label>
      {runTrials.length > 0 && (
        <div className="clab-samples" aria-label="أوعية التجارب المشغّلة">
          {runTrials.map(tr => { const c = trialConcentration(cfg, tr.id, t) ?? 0, f = c / ctx.trials[tr.id].a0; return (
            <figure key={tr.id} className="clab-sample"><Beaker colour={mix("#ffffff", "#7b3fa0", 0.1 + 0.9 * f)} label={tr.label + ": المتبقي من A عند t"} /><figcaption>{isolateQuantities(tr.label)}</figcaption></figure>
          ); })}
          <small className="clab-illustrative">شدة اللون تمثيل توضيحي لكمية A المتبقية.</small>
        </div>
      )}
      {cfg.view.graph && runTrials.length > 0 && (
        <figure className="clab-plot">
          <DynamicPlot2D width={PLOT_W} height={PLOT_H} xDomain={[0, e.duration]} yDomain={[0, yMax]} xLabel="t (s)" yLabel="[A] (mol/L)" title="تركيز المادة المتفاعلة مع الزمن" testId="clab-plot-rate"
            progress={runTrials.map(tr => { const x = ctx.trials[tr.id]; return { id: tr.id, className: SERIES[e.trials.indexOf(tr)], points: decayCurve(e.order, x.k, x.a0, e.duration).map(p => ({ x: p.t, y: p.c })) }; })} nowX={t} />
          <figcaption className="chem-help">المنحنيات محسوبة من قانون السرعة ومعادلة أرهينيوس للتجارب التي شغّلتها. ميل المماس عند t = 0 هو السرعة الابتدائية.</figcaption>
        </figure>
      )}
    </section>
  );
}
