const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = process.cwd();
const file = path.join(root, "src", "StudentExamPage.tsx");

function fail(message) {
  console.error("\nERROR: " + message);
  process.exit(1);
}

if (!fs.existsSync(file)) {
  fail("src/StudentExamPage.tsx was not found.");
}

let text = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");

if (text.includes("EXAMBANK_WORD_BANK_DROPDOWN_FIX")) {
  console.log("Word-bank dropdown fix is already installed.");
  process.exit(0);
}

const oldField =
  'type Field={id?:string;number?:number;label?:string;kind?:string};';

const newField =
  'type Field={id?:string;number?:number;label?:string;kind?:string;options?:Opt[]};';

if (!text.includes(oldField)) {
  fail("Could not locate the StudentExamPage Field type.");
}

text = text.replace(oldField, newField);

const anchor =
  'function imageList(q:Question){if(q.image?.exists&&q.image.visible&&Array.isArray(q.image.assets))return q.image.assets;return Array.isArray(q.images)?q.images:[]}\n';

const helper = String.raw`function imageList(q:Question){if(q.image?.exists&&q.image.visible&&Array.isArray(q.image.assets))return q.image.assets;return Array.isArray(q.images)?q.images:[]}

/* EXAMBANK_WORD_BANK_DROPDOWN_FIX */
function getWordBank(q:Question){
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
`;

if (!text.includes(anchor)) {
  fail("Could not locate the StudentExamPage helper insertion point.");
}

text = text.replace(anchor, helper);

const oldRender = String.raw`   {!table&&seq&&<><div className="iex-bank">{(q.wordBank||[]).filter(x=>x&&x!=="— اختر —").map((w,n)=><span key={n}>{w}</span>)}</div><div className="iex-seq">{(q.fields||[]).map((f,n)=><label key={f.id||f.number||n}><span>{f.label||"الحقل "+(n+1)}</span><select value={a?.kind==="sequence"?a.values[n]||"":""} onChange={e=>setSeq(id,n,e.target.value)}><option value="">— اختر —</option>{(q.wordBank||[]).filter(x=>x&&x!=="— اختر —").map((w,k)=><option key={k}>{w}</option>)}</select></label>)}</div></>}
`;

const newRender = String.raw`   {!table&&seq&&(()=>{const bank=getWordBank(q);return <><div className="iex-bank">{bank.map((w,n)=><span key={n}>{w}</span>)}</div><div className="iex-seq">{(q.fields||[]).map((f,n)=><label key={f.id||f.number||n}><span>{f.label||"الحقل "+(n+1)}</span><select value={a?.kind==="sequence"?a.values[n]||"":""} onChange={e=>setSeq(id,n,e.target.value)}><option value="">— اختر —</option>{bank.map((w,k)=><option key={k} value={w}>{w}</option>)}</select></label>)}</div></>})()}
`;

if (!text.includes(oldRender)) {
  fail("Could not locate the word-bank renderer.");
}

text = text.replace(oldRender, newRender);

const backup = file + ".bak-wordbank-fix";
if (!fs.existsSync(backup)) {
  fs.copyFileSync(file, backup);
}

fs.writeFileSync(file, text, "utf8");

console.log("Running npm run build...");

try {
  execFileSync(
    "cmd.exe",
    ["/d", "/s", "/c", "npm run build"],
    { cwd: root, stdio: "inherit" }
  );
} catch {
  fail("BUILD FAILED. Do not commit. Send the first TypeScript error.");
}

console.log("");
console.log("WORD BANK DROPDOWN FIX PASSED.");
console.log("");
console.log("The student exam now gets word-bank choices from:");
console.log("  1. question.wordBank");
console.log("  2. question.fields[].options");
console.log("  3. question.options as a fallback");
console.log("");
console.log('git add src/StudentExamPage.tsx');
console.log('git commit -m "Fix word bank dropdown options"');
console.log("git push");
