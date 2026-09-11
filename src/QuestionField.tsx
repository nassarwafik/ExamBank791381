
import type {Field,FieldValue,Opt} from "./StudentQuestionCard";
import {fieldId} from "./examStructure";

// Renders the answer CONTROLS for the generalized "fields" question types — multiTrueFalse,
// generalized tableFill, cliFill, and the generic multi-blank fields (wordBank / fillBlank / matching
// expressed as fields). It never renders card chrome or the prompt; StudentQuestionCard / CompoundQuestion
// own that. All values live in one flat map keyed by fieldId, and every change flows through onField,
// so the parent stores a single {kind:"fields",values} answer. This is the ONE place the new input
// types are drawn — no parallel rendering engine.

export type FieldQuestion={
 type?:string;
 presentationType?:string;
 fields?:Field[];
 wordBank?:string[];
 cli?:string;
 tableHeaders?:string[];
 tableRows?:string[][];
};

type Props={
 q:FieldQuestion;
 idBase:string;
 values:Record<string,FieldValue>;
 onField:(fieldId:string,value:FieldValue)=>void;
 disabled?:boolean;
};

const optText=(o:Opt)=>o.text||o.label||o.value||"";
const asString=(v:FieldValue|undefined)=>typeof v==="boolean"?(v?"true":"false"):String(v??"");

function BooleanSelect({value,onChange,name,disabled}:{value:string;onChange:(v:string)=>void;name:string;disabled?:boolean}){
 return <select className="iex-cell-select iex-tf-select" name={name} value={value} onChange={e=>onChange(e.target.value)} disabled={disabled}>
  <option value="">— اختر —</option>
  <option value="true">صحيح</option>
  <option value="false">غير صحيح</option>
 </select>;
}

export default function QuestionField({q,idBase,values,onField,disabled}:Props){
 const type=String(q.type||q.presentationType||"").toLowerCase();
 const fields=q.fields||[];
 const get=(fid:string)=>asString(values[fid]);

 // multiTrueFalse: one independently-answered صحيح/غير صحيح per statement row.
 if(type==="multitruefalse"){
  return <div className="iex-mtf">{fields.map((f,i)=>{const fid=fieldId(f,i);return <div className="iex-mtf-row" key={fid}><span className="iex-mtf-text">{f.statement||f.label||("عبارة "+(i+1))}</span><BooleanSelect name={idBase+"-"+fid} value={get(fid)} onChange={v=>onField(fid,v)} disabled={disabled}/></div>;})}</div>;
 }

 // cliFill: fixed Cisco command text with only the marked [[fieldId]] blanks editable, in monospace.
 if(type==="clifill"&&q.cli){
  const parts=q.cli.split(/\[\[([^\]]+)\]\]/g); // even indexes = fixed text, odd = field id
  return <pre className="iex-cli">{parts.map((chunk,i)=>{
   if(i%2===0)return <span key={i}>{chunk}</span>;
   const fid=chunk.trim();
   return <input className="iex-cli-input" key={i} value={get(fid)} onChange={e=>onField(fid,e.target.value)} placeholder="…" disabled={disabled} spellCheck={false} autoCapitalize="off" autoCorrect="off"/>;
  })}</pre>;
 }

 // Generalized tableFill: answerable cells are placed EXPLICITLY by (row,column); every other cell is
 // static text taken from tableRows. A cell's field.kind decides text / select / boolean input.
 if(type==="tablefill"&&(q.tableHeaders||q.tableRows)){
  const headers=q.tableHeaders||[];
  const rows=q.tableRows||[];
  const fieldAt=new Map<string,Field>();
  fields.forEach((f,i)=>{if(f.row!=null&&f.column!=null)fieldAt.set(f.row+":"+f.column,{...f,id:fieldId(f,i)});});
  const rowCount=Math.max(rows.length,...fields.map(f=>(f.row??0)+1),0);
  const colCount=Math.max(headers.length,...rows.map(r=>r.length),...fields.map(f=>(f.column??0)+1),1);
  return <div className="iex-table-wrap"><table><thead><tr>{Array.from({length:colCount},(_,c)=><th key={c}>{headers[c]||""}</th>)}</tr></thead><tbody>{Array.from({length:rowCount},(_,r)=><tr key={r}>{Array.from({length:colCount},(_,c)=>{
   const f=fieldAt.get(r+":"+c);
   if(!f)return <td key={c}>{rows[r]?.[c]??""}</td>;
   const fid=String(f.id);
   const kind=String(f.kind||"text").toLowerCase();
   return <td key={c}>{
    kind==="boolean"?<BooleanSelect name={idBase+"-"+fid} value={get(fid)} onChange={v=>onField(fid,v)} disabled={disabled}/>:
    kind==="select"?<select className="iex-cell-select" value={get(fid)} onChange={e=>onField(fid,e.target.value)} disabled={disabled}><option value="">— اختر —</option>{(f.options||[]).map((o,k)=><option key={k} value={optText(o)}>{optText(o)}</option>)}</select>:
    <input className="iex-cell" value={get(fid)} onChange={e=>onField(fid,e.target.value)} placeholder="اكتب الإجابة" disabled={disabled}/>
   }</td>;
  })}</tr>)}</tbody></table></div>;
 }

 // Generic fields: labeled blanks. Per field, options come from (1) the field's own select options
 // (e.g. a matching part, whose choices buildMatchingPatch stores on field.options), else (2) the
 // shared wordBank, else (3) a plain text input. This keeps fillBlank/wordBank/ordering/multiTrueFalse/
 // tableFill/CLI unchanged while making compound matching (per-field options) selectable.
 const bank=q.wordBank||[];
 return <div className="iex-seq iex-fields">{fields.map((f,i)=>{
  const fid=fieldId(f,i);
  const fieldOpts=String(f.kind||"").toLowerCase()==="select"&&Array.isArray(f.options)&&f.options.length?f.options.map(optText).filter(Boolean):[];
  const opts=fieldOpts.length?fieldOpts:bank;
  return <label key={fid}><span>{f.label||f.statement||("الحقل "+(i+1))}</span>{opts.length?<select value={get(fid)} onChange={e=>onField(fid,e.target.value)} disabled={disabled}><option value="">— اختر —</option>{opts.map((w,k)=><option key={k} value={w}>{w}</option>)}</select>:<input className="iex-cell" value={get(fid)} onChange={e=>onField(fid,e.target.value)} placeholder="اكتب الإجابة" disabled={disabled}/>}</label>;
 })}</div>;
}
