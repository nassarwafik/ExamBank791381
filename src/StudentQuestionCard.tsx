
import {IconCheck} from "./icons";
import {parseTable,promptText,resolveTableRowOptions} from "./questionContent";

// Extracted verbatim from StudentExamPage.tsx so the exact same rendering (including PR #33's
// table-dropdown logic) can be reused both by the real student exam page and by the teacher-facing
// theme preview (ExamThemePreview.tsx) - no rendering logic changes, only the props boundary.
export type Opt={value?:string;label?:string;text?:string;order?:number;number?:number};
export type Field={id?:string;number?:number;label?:string;kind?:string;options?:Opt[]};
export type ImageAsset={dataUrl?:string};
export type Question={examQuestionId?:string;id?:string;number?:number;text:string;textHtml?:string;marks:number;presentationType?:string;type?:string;options?:Opt[];fields?:Field[];wordBank?:string[];image?:{exists?:boolean;visible?:boolean;assets?:ImageAsset[]};images?:ImageAsset[]};
export type Answer={kind:"choice";index:number}|{kind:"sequence";values:string[]}|{kind:"table";values:(string|boolean)[]}|{kind:"text";value:string};

export const qid=(q:Question,i:number)=>String(q.examQuestionId||q.id||q.number||i+1);
export const typeOf=(q:Question)=>String(q.presentationType||q.type||"").toLowerCase();
export function answered(a:Answer|undefined){if(!a)return false;if(a.kind==="choice")return Number.isInteger(a.index);if(a.kind==="text")return !!a.value.trim();return a.values.some(v=>typeof v==="boolean"?v:String(v).trim()!=="")}
export function tableCheckbox(q:Question){return /وضع علامة|✓|خاص بالشبكات الخاصة\?|private\?/i.test(q.text)}
function imageList(q:Question){if(q.image?.exists&&q.image.visible&&Array.isArray(q.image.assets))return q.image.assets;return Array.isArray(q.images)?q.images:[]}

/* EXAMBANK_WORD_BANK_DROPDOWN_FIX */
export function getWordBank(q:Question){
 const values:string[]=[];
 const add=(raw:unknown)=>{
  const value=String(raw??"").trim();
  if(!value||value==="— اختر —")return;
  if(!values.includes(value))values.push(value);
 };
 if(Array.isArray(q.wordBank))q.wordBank.forEach(add);
 for(const field of q.fields||[]){
  for(const option of field.options||[]){
   add(option.text||option.label||option.value);
  }
 }
 if(!values.length&&typeOf(q)==="wordbank"){
  for(const option of q.options||[]){
   add(option.text||option.label||option.value);
  }
 }
 return values;
}

type Props={
 q:Question;
 index:number;
 id:string;
 answer:Answer|undefined;
 onChoice:(index:number)=>void;
 onSeq:(index:number,value:string)=>void;
 onTable:(index:number,value:string|boolean)=>void;
 onText:(value:string)=>void;
 disabled?:boolean;
};

export default function StudentQuestionCard({q,index,id,answer,onChoice,onSeq,onTable,onText,disabled}:Props){
 const a=answer,t=typeOf(q),table=parseTable(q.text),seq=t==="wordbank"||t==="fillblank"||((q.fields?.length||0)>0&&t!=="open");
 return <article className={"iex-q "+(answered(a)?"done":"")}><div className="iex-node">{index+1}</div><div className="iex-card"><div className="iex-qhead"><span>{t==="multiplechoice"?"اختيار من متعدد":t==="matching"?"طابق":t==="ordering"?"رتّب العناصر":table?"أكمل الجدول":seq?"أكمل الناقص":"سؤال"}</span><strong>{q.marks} علامة</strong></div><p className="iex-qtext">{promptText(q.text)}</p>
  {imageList(q).map((im,n)=>im.dataUrl?<img className="iex-image" src={im.dataUrl} alt={"صورة السؤال "+(index+1)} key={n}/>:null)}
  {t==="multiplechoice"&&<div className="iex-options">{(q.options||[]).map((o,n)=><label className={"iex-option "+(a?.kind==="choice"&&a.index===n?"selected":"")} key={n}><input type="radio" name={id} checked={a?.kind==="choice"&&a.index===n} onChange={()=>onChoice(n)} disabled={disabled}/><span className="iex-pick">{a?.kind==="choice"&&a.index===n&&<IconCheck size={14}/>}</span><b>{o.text||o.label||o.value||""}</b></label>)}</div>}
  {table&&<div className="iex-table-wrap"><table><thead><tr>{table.headers.map((h,n)=><th key={n}>{h}</th>)}</tr></thead><tbody>{table.rows.map((r,n)=>{const rowOptions=resolveTableRowOptions(q,n);return <tr key={n}><td>{r[0]}</td><td>{rowOptions?<select className="iex-cell-select" value={a?.kind==="table"?String(a.values[n]??""):""} onChange={e=>onTable(n,e.target.value)} disabled={disabled}><option value="">— اختر —</option>{rowOptions.isBoolean?<><option value="true">صحيح</option><option value="false">غير صحيح</option></>:rowOptions.values.map((v,k)=><option key={k} value={v}>{v}</option>)}</select>:tableCheckbox(q)?<input className="iex-check" type="checkbox" checked={a?.kind==="table"&&Boolean(a.values[n])} onChange={e=>onTable(n,e.target.checked)} disabled={disabled}/>:<input className="iex-cell" value={a?.kind==="table"?String(a.values[n]??""):""} onChange={e=>onTable(n,e.target.value)} placeholder="اكتب الإجابة" disabled={disabled}/>}</td></tr>})}</tbody></table></div>}
  {!table&&seq&&(()=>{const bank=getWordBank(q);return <><div className="iex-bank">{bank.map((w,n)=><span key={n}>{w}</span>)}</div><div className={"iex-seq"+(t==="ordering"?" iex-order-list":"")}>{(q.fields||[]).map((f,n)=><label key={f.id||f.number||n}><span>{f.label||"الحقل "+(n+1)}</span><select value={a?.kind==="sequence"?a.values[n]||"":""} onChange={e=>onSeq(n,e.target.value)} disabled={disabled}><option value="">— اختر —</option>{bank.map((w,k)=><option key={k} value={w}>{w}</option>)}</select></label>)}</div></>})()}
  {!table&&!seq&&t!=="multiplechoice"&&<textarea className="iex-open" value={a?.kind==="text"?a.value:""} onChange={e=>onText(e.target.value)} placeholder="اكتب إجابتك هنا..." disabled={disabled}/>}
 </div></article>;
}
