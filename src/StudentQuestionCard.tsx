
import {IconCheck} from "./icons";
import {parseTable,promptText,resolveTableRowOptions} from "./questionContent";
import QuestionField from "./QuestionField";

// Extracted verbatim from StudentExamPage.tsx so the exact same rendering (including PR #33's
// table-dropdown logic) can be reused both by the real student exam page and by the teacher-facing
// theme preview (ExamThemePreview.tsx) - no rendering logic changes, only the props boundary.
export type Opt={value?:string;label?:string;text?:string;order?:number;number?:number};
// `Field` gained optional structural hints for the new generalized question types:
//  - row/column place an answerable cell explicitly in a generalized table (never inferred);
//  - statement is the per-row text of a multiTrueFalse question;
//  - kind stays free-form ("text"|"select"|"boolean"|...) so legacy fields are unaffected.
// `correct` is deliberately NOT part of this student-facing type — answer keys never reach the browser.
export type Field={id?:string;number?:number;label?:string;kind?:string;options?:Opt[];row?:number;column?:number;statement?:string};
export type ImageAsset={dataUrl?:string};
// A compound question's independent subpart. Reuses the same answer-control vocabulary as a whole
// question so parts render through the exact same field/choice/text machinery (no second engine).
export type QuestionPart={id:string;label?:string;text?:string;textHtml?:string;marks?:number;type:string;options?:Opt[];fields?:Field[];wordBank?:string[];cli?:string;tableHeaders?:string[];tableRows?:string[][];image?:{exists?:boolean;visible?:boolean;assets?:ImageAsset[]};images?:ImageAsset[]};
export type Question={examQuestionId?:string;id?:string;number?:number;displayNumber?:string;text:string;textHtml?:string;marks:number;presentationType?:string;type?:string;options?:Opt[];fields?:Field[];wordBank?:string[];cli?:string;tableHeaders?:string[];tableRows?:string[][];parts?:QuestionPart[];groupId?:string;stimulus?:{title?:string;text?:string;image?:ImageAsset};image?:{exists?:boolean;visible?:boolean;assets?:ImageAsset[]};images?:ImageAsset[]};
// The implicit options a trueFalse question renders/grades with when it stores none. Index 0 = صحيح.
export const TRUE_FALSE_OPTIONS:Opt[]=[{text:"صحيح"},{text:"غير صحيح"}];
export const optionsFor=(q:{type?:string;presentationType?:string;options?:Opt[]}):Opt[]=>{const t=String(q.presentationType||q.type||"").toLowerCase();if(t==="truefalse"&&!(q.options&&q.options.length))return TRUE_FALSE_OPTIONS;return q.options||[]};
export type FieldValue=string|boolean|string[];
// Answer is a discriminated union. The first four members are the ORIGINAL shapes and are kept
// byte-for-byte so every stored draft / submitted attempt still loads and grades. "fields" and
// "compound" are the additive new shapes for generalized field questions and compound questions.
export type Answer={kind:"choice";index:number}|{kind:"sequence";values:string[]}|{kind:"table";values:(string|boolean)[]}|{kind:"text";value:string}|{kind:"fields";values:Record<string,FieldValue>}|{kind:"compound";parts:Record<string,Answer>};

export const qid=(q:Question,i:number)=>String(q.examQuestionId||q.id||q.number||i+1);
export const typeOf=(q:Question)=>String(q.presentationType||q.type||"").toLowerCase();
const nonEmptyValue=(v:unknown)=>typeof v==="boolean"?v:String(v??"").trim()!=="";
export function answered(a:Answer|undefined):boolean{
 if(!a)return false;
 if(a.kind==="choice")return Number.isInteger(a.index);
 if(a.kind==="text")return !!a.value.trim();
 if(a.kind==="sequence"||a.kind==="table")return a.values.some(nonEmptyValue);
 if(a.kind==="fields")return Object.values(a.values).some(v=>Array.isArray(v)?v.some(nonEmptyValue):nonEmptyValue(v));
 if(a.kind==="compound")return Object.values(a.parts).some(answered);
 return false;
}
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
 onField?:(fieldId:string,value:FieldValue)=>void;
 disabled?:boolean;
};

// New generalized field-based types answered via a single {kind:"fields"} map. Deliberately narrow:
// only these three route to QuestionField, so legacy wordBank/fillBlank/matching keep using the
// existing {kind:"sequence"} path below untouched.
export function isFieldType(q:Question){const t=typeOf(q);return t==="multitruefalse"||t==="clifill"||(t==="tablefill"&&!!(q.tableHeaders||q.tableRows));}

export default function StudentQuestionCard({q,index,id,answer,onChoice,onSeq,onTable,onText,onField,disabled}:Props){
 const a=answer,t=typeOf(q),fieldType=isFieldType(q),table=!fieldType&&parseTable(q.text),seq=!fieldType&&(t==="wordbank"||t==="fillblank"||((q.fields?.length||0)>0&&t!=="open"));
 const fieldValues=a?.kind==="fields"?a.values:{};
 const noopField=()=>{};
 return <article className={"iex-q "+(answered(a)?"done":"")}><div className="iex-node">{q.displayNumber??(index+1)}</div><div className="iex-card"><div className="iex-qhead"><span>{t==="multiplechoice"?"اختيار من متعدد":t==="truefalse"?"صح أو خطأ":t==="multitruefalse"?"صح/خطأ متعدد":t==="clifill"?"أوامر CLI":t==="matching"?"طابق":t==="ordering"?"رتّب العناصر":(table||fieldType)?"أكمل الجدول":seq?"أكمل الناقص":"سؤال"}</span><strong>{q.marks} علامة</strong></div><p className="iex-qtext">{promptText(q.text)}</p>
  {imageList(q).map((im,n)=>im.dataUrl?<img className="iex-image" src={im.dataUrl} alt={"صورة السؤال "+(index+1)} key={n}/>:null)}
  {(t==="multiplechoice"||t==="truefalse")&&<div className="iex-options">{optionsFor(q).map((o,n)=><label className={"iex-option "+(a?.kind==="choice"&&a.index===n?"selected":"")} key={n}><input type="radio" name={id} checked={a?.kind==="choice"&&a.index===n} onChange={()=>onChoice(n)} disabled={disabled}/><span className="iex-pick">{a?.kind==="choice"&&a.index===n&&<IconCheck size={14}/>}</span><b>{o.text||o.label||o.value||""}</b></label>)}</div>}
  {fieldType&&<QuestionField q={q} idBase={id} values={fieldValues} onField={onField||noopField} disabled={disabled}/>}
  {table&&<div className="iex-table-wrap"><table><thead><tr>{table.headers.map((h,n)=><th key={n}>{h}</th>)}</tr></thead><tbody>{table.rows.map((r,n)=>{const rowOptions=resolveTableRowOptions(q,n);return <tr key={n}><td>{r[0]}</td><td>{rowOptions?<select className="iex-cell-select" value={a?.kind==="table"?String(a.values[n]??""):""} onChange={e=>onTable(n,e.target.value)} disabled={disabled}><option value="">— اختر —</option>{rowOptions.isBoolean?<><option value="true">صحيح</option><option value="false">غير صحيح</option></>:rowOptions.values.map((v,k)=><option key={k} value={v}>{v}</option>)}</select>:tableCheckbox(q)?<input className="iex-check" type="checkbox" checked={a?.kind==="table"&&Boolean(a.values[n])} onChange={e=>onTable(n,e.target.checked)} disabled={disabled}/>:<input className="iex-cell" value={a?.kind==="table"?String(a.values[n]??""):""} onChange={e=>onTable(n,e.target.value)} placeholder="اكتب الإجابة" disabled={disabled}/>}</td></tr>})}</tbody></table></div>}
  {!table&&seq&&(()=>{const bank=getWordBank(q);const seqVal=(n:number)=>a?.kind==="sequence"?a.values[n]||"":"";return <><div className="iex-bank">{bank.map((w,n)=><span key={n}>{w}</span>)}</div><div className={"iex-seq"+(t==="ordering"?" iex-order-list":"")}>{(q.fields||[]).map((f,n)=><label key={f.id||f.number||n}><span>{f.label||"الحقل "+(n+1)}</span>{bank.length?<select value={seqVal(n)} onChange={e=>onSeq(n,e.target.value)} disabled={disabled}><option value="">— اختر —</option>{bank.map((w,k)=><option key={k} value={w}>{w}</option>)}</select>:<input className="iex-cell" value={seqVal(n)} onChange={e=>onSeq(n,e.target.value)} placeholder="اكتب الإجابة" disabled={disabled}/>}</label>)}</div></>})()}
  {!table&&!seq&&!fieldType&&t!=="multiplechoice"&&t!=="truefalse"&&<textarea className="iex-open" value={a?.kind==="text"?a.value:""} onChange={e=>onText(e.target.value)} placeholder="اكتب إجابتك هنا..." disabled={disabled}/>}
 </div></article>;
}
