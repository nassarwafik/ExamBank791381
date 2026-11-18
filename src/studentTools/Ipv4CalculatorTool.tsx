import { useId, useState } from "react";
import type { Ipv4CalculatorToolV1 } from "./studentToolsSpec";
import {
  analyzeCidrText, parseCidrInput, splitSubnets, prefixForHosts, prefixForSubnetCount, MAX_SUBNET_ROWS,
  type Ipv4Analysis, type Ipv4Scope, type SubnetSplit
} from "./ipv4Calculator";

// Phase T2 — the student IPv4 / subnet calculator panel. All arithmetic is ipv4Calculator.ts; this component only reads input and
// lays out results. Addresses are shown LTR inside the RTL exam.

const SCOPE_LABEL: Record<Ipv4Scope, string> = {
  private: "خاص", public: "عام", loopback: "استرجاع (Loopback)", linkLocal: "محلي للرابط (Link-local)", multicast: "بث متعدد (Multicast)",
  reserved: "محجوز", thisNetwork: "هذه الشبكة", sharedAddress: "مشترك (CGNAT)"
};

type SplitMode = "prefix" | "subnets" | "hosts";
const SPLIT_LABEL: Record<SplitMode, string> = { prefix: "البادئة الجديدة", subnets: "عدد الشبكات الفرعية", hosts: "عدد الأجهزة في كل شبكة" };

const Ltr = ({ children }: { children: string }) => <bdi dir="ltr" className="stt-ltr">{children}</bdi>;

export default function Ipv4CalculatorTool({ config }: { config: Ipv4CalculatorToolV1 }) {
  const id = useId();
  const [text, setText] = useState("");
  const [analysis, setAnalysis] = useState<Ipv4Analysis | null>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<SplitMode>("prefix");
  const [splitValue, setSplitValue] = useState("");
  const [split, setSplit] = useState<SubnetSplit | null>(null);
  const [splitError, setSplitError] = useState("");

  const calculate = () => {
    setSplit(null); setSplitError("");
    const r = analyzeCidrText(text);
    if (!r.ok) { setAnalysis(null); setError(r.message); return; }
    setError(""); setAnalysis(r.value);
  };

  const calculateSplit = () => {
    setSplit(null);
    const p = parseCidrInput(text);
    if (!p.ok) { setSplitError(p.message); return; }
    const n = /^\d{1,10}$/.test(splitValue.trim()) ? Number(splitValue.trim()) : NaN;
    if (!Number.isInteger(n) || n < 1) { setSplitError("اكتب عددًا صحيحًا موجبًا."); return; }
    const base = p.value.prefix;
    const newPrefix = mode === "prefix" ? n : mode === "subnets" ? prefixForSubnetCount(base, n) : prefixForHosts(n);
    if (newPrefix === null) { setSplitError(mode === "subnets" ? "لا يمكن تقسيم هذه الشبكة إلى هذا العدد من الشبكات." : "لا توجد بادئة تتسع لهذا العدد من الأجهزة."); return; }
    if (mode === "hosts" && newPrefix < base) { setSplitError("الشبكة الأصلية أصغر من أن تتسع لهذا العدد من الأجهزة."); return; }
    if (mode === "hosts" && newPrefix === base) { setSplitError("الشبكة الأصلية تتسع لهذا العدد دون تقسيم."); return; }
    const r = splitSubnets(p.value.address, base, newPrefix, MAX_SUBNET_ROWS);
    if (!r.ok) { setSplitError(r.message); return; }
    setSplitError(""); setSplit(r.value);
  };

  const rows: [string, string][] = analysis ? [
    ["عنوان الشبكة", analysis.network],
    ["عنوان البث", analysis.broadcast ?? "لا يوجد (/" + analysis.prefix + ")"],
    ["أول عنوان مستخدم", analysis.firstHost],
    ["آخر عنوان مستخدم", analysis.lastHost],
    ["عدد العناوين", analysis.totalAddresses.toLocaleString("en-US")],
    ["الأجهزة المتاحة", analysis.usableHosts.toLocaleString("en-US")],
    ["قناع الشبكة", analysis.mask],
    ["القناع العكسي", analysis.wildcard],
    ["البادئة", "/" + analysis.prefix]
  ] : [];

  return (
    <div className="stt-ipv4" data-testid="tool-ipv4">
      <label className="stt-label" htmlFor={id + "-cidr"}>العنوان مع البادئة أو القناع</label>
      <div className="stt-row">
        <input id={id + "-cidr"} className="stt-input" dir="ltr" autoComplete="off" spellCheck={false} maxLength={40} inputMode="decimal"
          value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); calculate(); } }}
          placeholder="192.168.1.10/24" aria-describedby={id + "-cidr-hint"} />
        <button type="button" className="stt-btn is-primary" onClick={calculate}>احسب</button>
      </div>
      <p className="stt-hint" id={id + "-cidr-hint"}>مثل <Ltr>192.168.1.10/26</Ltr> أو <Ltr>192.168.1.10 255.255.255.192</Ltr></p>
      {error && <p className="stt-error" role="alert">{error}</p>}

      {analysis && (
        <div aria-live="polite" data-testid="ipv4-result">
          <dl className="stt-dl">
            {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd><Ltr>{v}</Ltr></dd></div>)}
            <div><dt>فئة العنوان</dt><dd>{analysis.addressClass}</dd></div>
            <div><dt>نطاق العنوان</dt><dd>{SCOPE_LABEL[analysis.scope]}</dd></div>
          </dl>
          {analysis.prefix >= 31 && <p className="stt-hint">{analysis.prefix === 31 ? "‏/31 رابط نقطة إلى نقطة: العنوانان كلاهما قابلان للاستخدام (RFC 3021)." : "‏/32 عنوان جهاز واحد."}</p>}
          {config.showBinary && (
            <table className="stt-table stt-binary">
              <caption>الشكل الثنائي</caption>
              <tbody>
                <tr><th scope="row">العنوان</th><td dir="ltr">{analysis.binary.address}</td></tr>
                <tr><th scope="row">القناع</th><td dir="ltr">{analysis.binary.mask}</td></tr>
                <tr><th scope="row">الشبكة</th><td dir="ltr">{analysis.binary.network}</td></tr>
              </tbody>
            </table>
          )}
        </div>
      )}

      {config.allowSubnetting && (
        <fieldset className="stt-fieldset">
          <legend>تقسيم الشبكة</legend>
          <div className="stt-radios" role="radiogroup" aria-label="طريقة التقسيم">
            {(Object.keys(SPLIT_LABEL) as SplitMode[]).map(m => (
              <label key={m} className="stt-radio"><input type="radio" name={id + "-mode"} checked={mode === m} onChange={() => { setMode(m); setSplit(null); setSplitError(""); }} />{SPLIT_LABEL[m]}</label>
            ))}
          </div>
          <div className="stt-row">
            <input className="stt-input is-short" dir="ltr" inputMode="numeric" maxLength={10} aria-label={SPLIT_LABEL[mode]} value={splitValue}
              onChange={e => setSplitValue(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); calculateSplit(); } }} placeholder={mode === "prefix" ? "26" : "4"} />
            <button type="button" className="stt-btn" onClick={calculateSplit}>قسّم</button>
          </div>
          {splitError && <p className="stt-error" role="alert">{splitError}</p>}
          {split && (
            <div aria-live="polite" data-testid="ipv4-split">
              <p className="stt-hint">
                البادئة الجديدة <Ltr>{"/" + split.newPrefix}</Ltr> · بتات مستعارة {split.borrowedBits} · عدد الشبكات {split.totalSubnets.toLocaleString("en-US")} · الأجهزة في كل شبكة {split.hostsPerSubnet.toLocaleString("en-US")}
              </p>
              <div className="stt-table-wrap">
                <table className="stt-table">
                  <thead><tr><th scope="col">#</th><th scope="col">الشبكة</th><th scope="col">أول عنوان</th><th scope="col">آخر عنوان</th><th scope="col">البث</th></tr></thead>
                  <tbody>
                    {split.subnets.map(s => (
                      <tr key={s.index}><td>{s.index}</td><td dir="ltr">{s.network}</td><td dir="ltr">{s.firstHost}</td><td dir="ltr">{s.lastHost}</td><td dir="ltr">{s.broadcast ?? "—"}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {split.truncated && <p className="stt-hint">تُعرض أول {split.subnets.length} شبكة فقط من أصل {split.totalSubnets.toLocaleString("en-US")}.</p>}
            </div>
          )}
        </fieldset>
      )}
    </div>
  );
}
