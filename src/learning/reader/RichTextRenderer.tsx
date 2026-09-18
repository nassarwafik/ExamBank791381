import type { RichText, InlineSpan } from "../content/types";

/**
 * Renders Phase-2 `RichText` (an ordered list of safe inline spans) WITHOUT `dangerouslySetInnerHTML`.
 * Each span becomes a real element by style (strong / em / term / code) and may opt into its own inline `dir`
 * (an LTR technical term inside RTL Arabic). Returns a fragment so callers wrap it in the right block element.
 */
export default function RichTextRenderer({ spans }: { spans: RichText }) {
  return (
    <>
      {spans.map((span, i) => <Span key={i} span={span} />)}
    </>
  );
}

function Span({ span }: { span: InlineSpan }) {
  const dir = span.dir ? { dir: span.dir } : {};
  switch (span.style) {
    case "strong":
      return <strong {...dir}>{span.text}</strong>;
    case "em":
      return <em {...dir}>{span.text}</em>;
    case "code":
      return <code className="learning-reader-inline-code" dir={span.dir ?? "ltr"}>{span.text}</code>;
    case "term":
      return <span className="learning-reader-term" {...dir}>{span.text}</span>;
    default:
      return span.dir ? <span dir={span.dir}>{span.text}</span> : <>{span.text}</>;
  }
}
