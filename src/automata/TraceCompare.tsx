// AUTO-A15b — a machineTrace@1 answer beside the true run, row by row: the student's row, the true row, and whether the row earned its part
// (an error never counted twice: a row that is the step from the student's own wrong row is right), then the verdict both ways. Shared by
// the teacher's review and the student's released breakdown (owner decision: after the exam the run is no secret). Rows are left-to-right
// text («q1 ├A[b]»), each its own <bdi>.
export type TraceCompareRow = { mine: string; truth: string; right: boolean };
export type TraceCompareData = { rows: TraceCompareRow[]; verdict: { mine: "accept" | "reject" | null; truth: "accept" | "reject" | null; right: boolean } };
const VERDICT = { accept: "مقبولة", reject: "مرفوضة" } as const;
const v = (x: "accept" | "reject" | null) => (x ? VERDICT[x] : "—");

export default function TraceCompare({ data, testId }: { data: TraceCompareData; testId?: string }) {
  const right = data.rows.filter(r => r.right).length + (data.verdict.right ? 1 : 0);
  return (
    <div className="mt-table-wrap" data-testid={testId}>
      <table className="mt-table mt-compare">
        <caption>التتبّع سطرًا سطرًا: {right} من {data.rows.length + 1} أجزاء صحيحة (السطر الذي يتبع خطأً سابقًا بخطوة صحيحة يُحسب صحيحًا)</caption>
        <thead><tr><th scope="col">السطر</th><th scope="col">إجابة الطالب</th><th scope="col">التشغيل الصحيح</th><th scope="col">الجزء</th></tr></thead>
        <tbody>
          {data.rows.map((r, k) => (
            <tr key={k} data-right={r.right ? "yes" : "no"}>
              <th scope="row">{k}</th>
              <td><bdi dir="ltr">{r.mine}</bdi></td>
              <td><bdi dir="ltr">{r.truth}</bdi></td>
              <td>{r.right ? "✓ صحيح" : "✗ خطأ"}</td>
            </tr>
          ))}
          <tr data-right={data.verdict.right ? "yes" : "no"}>
            <th scope="row">النتيجة</th>
            <td>{v(data.verdict.mine)}</td>
            <td>{v(data.verdict.truth)}</td>
            <td>{data.verdict.right ? "✓ صحيح" : "✗ خطأ"}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
