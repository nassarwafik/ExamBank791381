
const {
  normalizeExamStructure,
  sectionQuestionId,
  partId,
  partLabel,
  fieldId,
  questionParts,
  isCompound,
  distributePartMarks,
  admittedResponse,
  isAdmittedAnswered,
  selectGradedUnits,
  defaultTrueFalseOptions
} = require("./exam-structure");
// Phase 16A — code-owned grading registry (see question-type-graders.js): registered types, the legacy adapter, fail-closed
// unknown types / unsupported versions. This file never grows a per-type branch again.
const { resolveGrader, unknownTypeResult, legacyResponseAdmitted, LEGACY } = require("./question-type-graders");
// Phase 20D — composite@1: the ONE strict structure authority (shared build) + the trusted SmartSim "prepare once / evaluate many" seam.
const { compositeStructure, compositeChildNode, compositeChildKey, compositeQuestionVersion, isCompositeQuestionNode, compositeQuestionMaxMarks, selectCompositeCountedParts } = require("./shared-finalization/compositeQuestion");
const { prepareSmartSimEvaluation, evaluatePreparedSmartSimChecks } = require("./shared-finalization/trustedSimPlugins");
// Phase 20G.3 — the ONE legacy table authority (shared build): the rows the student card draws and the control it draws for each row.
const { parseTable, resolveTableRowOptions, legacyTableCellControl } = require("./shared-finalization/legacyTableSemantics");

function clean(v){
  return String(v??"")
    .normalize("NFKC")
    .replace(/[ـ]/g,"")
    .replace(/[،,]/g,",")
    .replace(/[؛;]/g,";")
    .replace(/[–—−]/g,"-")
    .replace(/\s+/g," ")
    .trim()
    .toLowerCase();
}
function round(n){return Number(Number(n||0).toFixed(2))}
function marks(question){return Math.max(0,Number(question?.marks??question?.points??0)||0)}
function gradeChoice(question,response,answer){
  const idx=Number(response?.index);
  if(!Number.isInteger(idx)||idx<0)return false;
  const options=Array.isArray(question?.options)?question.options:[];
  const option=options[idx]||{};
  if(Number.isInteger(Number(answer?.correctOptionIndex))&&idx===Number(answer.correctOptionIndex))return true;
  if(answer?.correctText&&clean(option.text??option.label??option.value)===clean(answer.correctText))return true;
  const eng=["a","b","c","d","e","f","g","h"],ar=["أ","ب","ج","د","هـ","و","ز","ح"];
  const candidates=[
    option.value,option.label,option.text,String(idx+1),eng[idx],ar[idx]
  ].filter(v=>v!==undefined&&v!==null).map(clean);
  const expected=[answer?.correctOptionValue,answer?.correctOptionLabel,...(Array.isArray(answer?.values)?answer.values:[])].filter(Boolean).map(clean);
  return expected.some(x=>candidates.includes(x));
}
function gradeSequence(response,answer,max){
  const actual=Array.isArray(response?.values)?response.values:[];
  const expected=Array.isArray(answer?.values)?answer.values:[];
  if(!expected.length)return {score:0,manualReview:true};
  let correct=0;
  expected.forEach((v,i)=>{if(clean(actual[i])===clean(v))correct++});
  return {score:max*(correct/expected.length),manualReview:false,parts:{correct,total:expected.length}};
}
// Phase 20G.3 — legacy table grading semantics. A table is auto-graded ONLY with positive, server-owned authority over EVERY row the
// student card draws (legacyTableSemantics: the same parse + per-row control the renderer uses); the absence of a row label from the key is
// never read as a correct negative answer. legacyTableMode decides, from the question alone:
//   keyed    — answer.text is a row=value key giving every drawn row a non-empty expected value: a select row's value must be one of the
//              options it offers, a checkbox row's value must be true / false;
//   checkbox — no row=value pairs, EVERY row is drawn as a checkbox, and answer.text lists the rows to tick, each list item EXACTLY a row
//              label (no substring membership);
//   manual   — anything else (a blank or duplicated row label, a conflicting / incomplete / unofferable key, a key naming no row, a
//              text-input or select table without a row key): score 0, teacher review;
//   none     — the question text holds no table.
const TABLE_TICKS=new Set(["true","1","✓"]);
// a stored cell's text: only primitives carry an answer (a stored object / array is never coerced, so it can neither crash nor match)
function cellText(v){return typeof v==="string"||typeof v==="number"||typeof v==="boolean"?String(v):""}
function isTick(v){return v===true||TABLE_TICKS.has(clean(cellText(v)))}
function legacyTableMode(question,answer=question?.answer){
  const parsed=parseTable(cellText(question?.text));
  if(!parsed)return {mode:"none"};
  const labels=parsed.rows.map(r=>clean(r[0])),controls=labels.map((_l,i)=>legacyTableCellControl(question,i));
  const manual={mode:"manual",labels,controls};
  if(labels.some(l=>!l)||new Set(labels).size!==labels.length)return manual;
  const keyText=cellText(answer?.text),pairs=new Map();
  let conflict=false;
  keyText.split(/[؛;]/).forEach(part=>{
    const p=part.split("=");
    if(p.length<2)return;
    const k=clean(p[0]),v=clean(p.slice(1).join("="));
    if(pairs.has(k)&&pairs.get(k)!==v)conflict=true;
    pairs.set(k,v);
  });
  if(pairs.size){
    if(conflict)return manual;
    const expected=[];
    for(let i=0;i<labels.length;i++){
      const e=pairs.get(labels[i]);
      if(!e)return manual;
      if(controls[i]==="select"&&!resolveTableRowOptions(question,i).values.some(v=>clean(cellText(v))===e))return manual;
      if(controls[i]==="checkbox"&&e!=="true"&&e!=="false")return manual;
      expected.push(e);
    }
    // Review Fix 1: a key that leaves NOTHING to tick or type (every row a checkbox keyed false) cannot tell a correct answer from an
    // untouched table (an all-unticked answer is unanswered): teacher review, never a silent 0.
    if(controls.every(c=>c==="checkbox")&&expected.every(e=>e==="false"))return manual;
    return {mode:"keyed",labels,controls,expected};
  }
  if(!controls.every(c=>c==="checkbox"))return manual;
  // Review Fix 1: a list cannot be split unambiguously when a row label itself contains a list separator (TCP/IP, "DNS, DHCP")
  if(labels.some(l=>/[,;\n\r|/]/.test(l)))return manual;
  const tokens=keyText.split(/[,،;؛\n\r|/]+/).map(clean).filter(Boolean);
  if(!tokens.length||tokens.some(t=>!labels.includes(t)))return manual;
  const ticked=new Set(tokens);
  return {mode:"checkbox",labels,controls,expected:labels.map(l=>ticked.has(l))};
}
function gradeTable(question,response,answer,max){
  const m=legacyTableMode(question,answer);
  const vals=Array.isArray(response?.values)?response.values:[];
  if((m.mode!=="keyed"&&m.mode!=="checkbox")||!vals.length)return {score:0,manualReview:true};
  // the denominator is EVERY drawn row: a missing cell (the UI's sparse array) is a blank / unticked row, never a smaller table
  const total=m.expected.length,cells=m.expected.map((_e,i)=>vals[i]);
  // nothing ticked / typed in any drawn row: unanswered (isResponseAnswered), 0 — never credit for rows the key leaves unticked
  const answered=cells.some((v,i)=>m.controls[i]==="checkbox"?isTick(v):cellText(v).trim()!=="");
  if(!answered)return {score:0,manualReview:false,parts:{correct:0,total}};
  let ok=0;
  cells.forEach((v,i)=>{
    const e=m.expected[i];
    if(m.mode==="checkbox"?isTick(v)===e:m.controls[i]==="checkbox"?isTick(v)===(e==="true"):clean(cellText(v))===e)ok++;
  });
  return {score:max*(ok/total),manualReview:false,parts:{correct:ok,total}};
}

// Compares one submitted field value against its stored correct value. Handles the three field
// value shapes the new question types produce: boolean (multiTrueFalse rows / "private?" columns),
// arrays (acceptable-answer sets), and plain strings (CLI blanks, table cells, dropdowns). Boolean
// keys accept both the literal true/false and the Arabic "صحيح"/"غير صحيح" the <select> submits.
function matchField(got,correct){
  if(typeof correct==="boolean"){
    const c=clean(got);
    if(got===true||c==="true"||c==="صحيح")return correct===true;
    if(got===false||c==="false"||c==="غير صحيح")return correct===false;
    return false;
  }
  if(Array.isArray(correct))return correct.some(c=>clean(got)!==""&&clean(got)===clean(c));
  return clean(got)!==""&&clean(got)===clean(correct);
}

// Grades the generalized "fields" response used by multiTrueFalse, generalized tableFill, cliFill,
// multi-blank wordBank/fillBlank and matching-as-fields. A field is gradable when a correct value is
// known (field.correct, or question.answer.fields[fieldId]). Per-field weight = field.marks when all
// gradable fields supply one, otherwise the question marks split equally between them (keeps partial
// floating-point credit: 4 blanks over 5 marks => 1.25 each). If NO field has an answer key the
// whole thing falls back to manual review (an open field-set with no reliable key).
function gradeFields(question,response,max){
  const fields=Array.isArray(question?.fields)?question.fields:[];
  const values=response&&response.kind==="fields"&&response.values&&typeof response.values==="object"?response.values:{};
  const answerFields=question?.answer&&typeof question.answer.fields==="object"&&question.answer.fields?question.answer.fields:{};
  const gradable=[];
  fields.forEach((f,i)=>{
    const fid=fieldId(f,i);
    let correct;
    if(f&&f.correct!==undefined)correct=f.correct;
    else if(answerFields[fid]!==undefined)correct=answerFields[fid];
    if(correct!==undefined)gradable.push({fid,field:f,correct});
  });
  if(!gradable.length)return {score:0,manualReview:true};
  const explicit=gradable.every(g=>g.field&&g.field.marks!=null&&Number.isFinite(Number(g.field.marks)));
  const weights=explicit?gradable.map(g=>Number(g.field.marks)||0):gradable.map(()=>max/gradable.length);
  let score=0,ok=0;
  gradable.forEach((g,i)=>{if(matchField(values[g.fid],g.correct)){score+=weights[i];ok++}});
  return {score,manualReview:false,parts:{correct:ok,total:gradable.length}};
}

// Grades a compound question: each part is graded as its own mini-question (its `type` becomes the
// presentationType, its own answer key travels with it) and the results are summed. Part marks come
// from distributePartMarks(). manualReview is true if ANY part still needs manual review, and
// manualReviewMarks carries the exact marks still pending so partially-auto compound questions don't
// wrongly finalize the whole attempt.
function gradeCompound(question,response){
  const parts=questionParts(question);
  const pmarks=distributePartMarks(question);
  const presp=response&&response.kind==="compound"&&response.parts?response.parts:{};
  let score=0,maxM=0,manualMarks=0;
  const partResults=parts.map((p,i)=>{
    const pid=partId(p,i);
    const sub={...p,marks:pmarks[i],presentationType:p.type||p.presentationType,answer:p.answer};
    const r=gradeQuestion(sub,presp[pid],undefined,"part");
    score+=r.score;maxM+=r.maxMarks;
    const mr=r.manualReviewMarks!=null?r.manualReviewMarks:(r.manualReview?r.maxMarks:0);
    manualMarks+=mr;
    return {partId:pid,label:partLabel(p,i),score:round(r.score),maxMarks:round(r.maxMarks),correct:r.correct,manualReview:r.manualReview};
  });
  return {score,maxMarks:maxM,correct:maxM>0&&score>=maxM-1e-9,manualReview:manualMarks>0,manualReviewMarks:manualMarks,parts:partResults};
}

// Phase 20D — grades a composite@1 question by grading its CHILDREN with their own graders (no duplicate child grading):
//   • the composite authority is re-validated (strict structure); a broken authority fails CLOSED as a whole (0, manual review, the stored
//     official maximum) — never a guessed partial grade; an unknown / unsupported child VERSION fails closed for that part only;
//   • a SHARED SmartSim context is replayed ONCE (prepareSmartSimEvaluation) and every linked part evaluates its OWN private checks on that
//     server-derived state with its own marks; the response's state / score / checks are never read;
//   • every other child goes through gradeQuestion(childNode, childAnswer, context) with the SERVER-owned child identity
//     <questionId>::part::<partId> as its generation key (parametric children), so projection, grading and review regenerate the same instance;
//   • group policy: "all" counts every part; "firstNAnswered" counts the first N answered parts in display order — excess answers stay
//     stored but are IGNORED (score 0, countedMaxMarks 0, never pending review, never a coding job);
//   • parent: score = Σ_groups min(Σ counted part scores, group official max); maxMarks = the official maximum; manualReviewMarks = the exact
//     counted marks still awaiting a teacher; correct only when every counted part is fully correct and nothing awaits review.
// The returned `composite` descriptor (groups → official max + part ids) lets the canonical rebuild recompute the parent from its parts.
function gradeComposite(question,response,context){
  const fallbackMax=compositeQuestionMaxMarks(question);
  const closed={score:0,maxMarks:fallbackMax,correct:false,manualReview:true,manualReviewMarks:fallbackMax,parts:null};
  if(compositeQuestionVersion(question)!==1)return closed;
  const st=compositeStructure(question);
  if(!st.ok)return closed;
  const model=st.model;
  const resp=response&&typeof response==="object"&&response.kind==="composite"?response:null;
  const partAnswers=resp&&resp.parts&&typeof resp.parts==="object"&&!Array.isArray(resp.parts)?resp.parts:{};
  const ctxAnswers=resp&&resp.contexts&&typeof resp.contexts==="object"&&!Array.isArray(resp.contexts)?resp.contexts:{};
  const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k)?o[k]:undefined;
  // Phase 20G.2 (O1) — first-N selection sees only the child answers the child authorities admit (a mismatched child answer takes no slot);
  // the counted children are still graded from the stored answers below, so a counted mismatch fails closed in its own grader.
  const selection=selectCompositeCountedParts(question,admittedResponse(question,resp));
  const qkey=context&&typeof context.questionKey==="string"?context.questionKey:null;
  const generation=context&&context.generation&&typeof context.generation==="object"?context.generation:null;
  const prepared=new Map();
  const preparedFor=ctxId=>{if(!prepared.has(ctxId)){const c=model.contextById.get(ctxId);prepared.set(ctxId,prepareSmartSimEvaluation({envelope:c&&c.kind==="smartSim"?c.envelope:undefined,response:own(ctxAnswers,ctxId)}))}return prepared.get(ctxId)};
  let score=0,manualMarks=0,allCorrect=true,countedAny=false;
  const partResults=[],groups=[];
  for(const g of model.groups){
    let gScore=0;
    for(const p of g.parts){
      const sel=selection.get(p.id)||{counted:false,answered:false,ignored:false};
      const base={partId:p.id,groupId:g.id,label:p.label,type:p.type,maxMarks:round(p.marks)};
      if(!sel.counted){partResults.push({...base,score:0,countedMaxMarks:0,correct:false,manualReview:false,ignored:!!sel.ignored,counted:false});continue}
      let r;
      if(p.linkedSmartSim){
        const e=evaluatePreparedSmartSimChecks(preparedFor(p.contextId),{answerKey:p.raw.answer,maxMarks:p.marks});
        r={score:e.score,maxMarks:p.marks,correct:e.correct===true&&e.manualReview!==true,manualReview:e.manualReview===true,parts:e.parts};
      }else{
        r=gradeQuestion({...compositeChildNode(p.raw),marks:p.marks},own(partAnswers,p.id),generation&&qkey?{generation,questionKey:compositeChildKey(qkey,p.id)}:undefined,"part");
      }
      const s=Math.min(Math.max(0,Number(r.score)||0),p.marks);
      const mr=r.manualReviewMarks!=null?r.manualReviewMarks:(r.manualReview?p.marks:0);
      countedAny=true;gScore+=s;manualMarks+=mr;
      if(!(r.correct===true&&!r.manualReview))allCorrect=false;
      partResults.push({...base,score:round(s),countedMaxMarks:round(p.marks),correct:r.correct===true&&!r.manualReview,manualReview:!!r.manualReview,ignored:false,counted:true,...(r.parts?{parts:r.parts}:{})});
    }
    score+=Math.min(gScore,g.officialMax);
    groups.push({id:g.id,gradingPolicy:g.gradingPolicy,maxMarks:round(g.officialMax),partIds:g.parts.map(p=>p.id)});
  }
  const max=model.officialMax;
  return {score,maxMarks:max,correct:countedAny&&allCorrect&&manualMarks===0&&score>=max-1e-9,manualReview:manualMarks>0,manualReviewMarks:manualMarks,parts:partResults,composite:{v:1,groups}};
}

// Grades a single question (or part). Phase 16A: the type is resolved through the code-owned registry first — a registered
// (Wave 1 / plugin) type uses its handler; a legacy type / alias / absent type uses the LEGACY adapter below, which is the
// original grader byte-for-byte (response-kind first, then type / answer.mode); an unknown type or an unsupported version
// fails closed (score 0, manual review). Compound questions compose their parts through the same resolution.
// Phase 19B — `context` (optional) carries the SERVER-owned generation identity of the attempt being graded ({ generation:
// { assignmentId, studentId, attemptNumber }, questionKey }); a registered handler receives it as its 4th argument. Only a
// parametric handler reads it; every other grader ignores it, so all existing grades are byte-for-byte unchanged.
// Phase 20G.2 RF1 — `placement` ("part" for a compound part / composite child, else the top-level question) reaches only the legacy
// answer-kind binding: a part is answered through CompoundPartControl, which never draws a table.
function gradeQuestion(question,response,context,placement){
  // Phase 20D — the composite family is decided by its TYPE (checked first: a composite carrying a legacy `parts` array is a broken
  // authority and fails closed, never graded as a compound); compound@1 keeps its structural detection below, unchanged.
  if(isCompositeQuestionNode(question)){
    const r=gradeComposite(question,response,context);
    return {score:r.score,maxMarks:r.maxMarks,correct:r.correct,manualReview:r.manualReview,manualReviewMarks:r.manualReviewMarks,parts:r.parts,...(r.composite?{composite:r.composite}:{})};
  }
  if(isCompound(question)){
    const r=gradeCompound(question,response);
    return {score:r.score,maxMarks:r.maxMarks,correct:r.correct,manualReview:r.manualReview,manualReviewMarks:r.manualReviewMarks,parts:r.parts};
  }
  const max=marks(question);
  const handler=resolveGrader(question?.presentationType||question?.type,question?.questionTypeVersion,{legacyFlat:!(typeof question?.presentationType==="string"&&question.presentationType.trim()!=="")});
  if(handler===undefined)return unknownTypeResult(max);
  if(handler!==LEGACY){
    const r=handler(question,response,max,context)||{};
    const score=Math.min(Math.max(0,Number(r.score)||0),max);
    const manualReview=r.manualReview===true;
    return {score,maxMarks:max,correct:r.correct===true&&!manualReview,manualReview,...(r.parts?{parts:r.parts}:{})};
  }
  return gradeLegacyQuestion(question,response,max,placement);
}
// LEGACY ADAPTER — the original dispatch, unchanged: response-kind first (so a fields response always routes correctly
// regardless of type spelling), then the legacy type / answer.mode decisions for choice / sequence / table / text.
// Phase 20G.2 (O1) — the response kind no longer CHOOSES the grader on its own: before the dispatch, the question authority must admit
// the kind (legacyAnswerKindAllowed, the same shared rule the ingest applies). A present response whose kind the question does not admit
// (a forged choice on a fillBlank / ordering / typeless question …) fails CLOSED to teacher review — never a score, never a silent zero.
// An absent response (null / undefined) keeps its historical path byte-for-byte (an unanswered question is not a mismatch).
function gradeLegacyQuestion(question,response,max,placement){
  if(response!=null&&!legacyResponseAdmitted(question,response,placement))return {score:0,maxMarks:max,correct:false,manualReview:true};
  const answer=question?.answer||{},type=String(question?.presentationType||question?.type||"").toLowerCase();
  if(response?.kind==="fields"){
    const r=gradeFields(question,response,max);
    return {...r,maxMarks:max,correct:r.score>=max-1e-9&&!r.manualReview};
  }
  if(type==="multiplechoice"||type==="truefalse"||response?.kind==="choice"){
    // trueFalse is first-class even without stored options: default to صحيح/غير صحيح, and accept a
    // boolean answer.correct (true->index 0, false->index 1) as a stable, gradeable representation.
    let gq=question,ans=answer;
    if(type==="truefalse"){
      if(!Array.isArray(question.options)||!question.options.length)gq={...question,options:defaultTrueFalseOptions()};
      if(!Number.isInteger(Number(answer?.correctOptionIndex))&&typeof answer?.correct==="boolean")ans={...answer,correctOptionIndex:answer.correct?0:1};
    }
    const correct=gradeChoice(gq,response,ans);
    return {score:correct?max:0,maxMarks:max,correct,manualReview:false};
  }
  if(answer?.mode==="exactSequence"||answer?.mode==="sequence"||response?.kind==="sequence"){
    const r=gradeSequence(response,answer,max);
    return {...r,maxMarks:max,correct:r.score>=max-1e-9};
  }
  if(response?.kind==="table"){
    const r=gradeTable(question,response,answer,max);
    return {...r,maxMarks:max,correct:r.score>=max-1e-9};
  }
  if(response?.kind==="text"&&answer?.text){
    const a=clean(response.value),e=clean(answer.text);
    const correct=!!a&&a===e;
    return {score:correct?max:0,maxMarks:max,correct,manualReview:!correct};
  }
  return {score:0,maxMarks:max,correct:false,manualReview:true};
}

// Grades one question within a section, honouring the section's answer-unit / graded-unit selection.
// For a part-unit section it grades each part and counts only the parts whose unit key was selected
// (first-N at part level). For a question-unit section the whole question counts only if selected.
// Returns display-facing per-question data plus the "counted" contribution used for section totals.
function gradeQuestionForSection(q,i,section,answers,countedKeys,generation){
  const id=sectionQuestionId(section,q,i);
  const resp=answers?.[id];
  if(section.answerUnit==="part"&&isCompound(q)){
    const parts=questionParts(q),pmarks=distributePartMarks(q);
    const presp=resp&&resp.kind==="compound"&&resp.parts?resp.parts:{};
    let countedScore=0,countedMax=0,fullMax=0,countedManual=0;
    const partOut=parts.map((p,pi)=>{
      const pid=partId(p,pi),key=id+"::"+pid;
      const sub={...p,marks:pmarks[pi],presentationType:p.type||p.presentationType,answer:p.answer};
      const r=gradeQuestion(sub,presp[pid],undefined,"part");
      fullMax+=r.maxMarks;
      const counted=countedKeys.has(key);
      const mr=r.manualReviewMarks!=null?r.manualReviewMarks:(r.manualReview?r.maxMarks:0);
      if(counted){countedScore+=r.score;countedMax+=r.maxMarks;countedManual+=mr}
      return {partId:pid,label:partLabel(p,pi),score:round(r.score),maxMarks:round(r.maxMarks),correct:r.correct,manualReview:r.manualReview,counted,ignored:!counted&&isAdmittedAnswered(sub,presp[pid],"part")};
    });
    return {id,score:countedScore,maxMarks:fullMax,countedMaxMarks:countedMax,manualReviewMarks:countedManual,correct:countedMax>0&&countedScore>=countedMax-1e-9,manualReview:countedManual>0,ignored:countedMax===0&&isAdmittedAnswered(q,resp),parts:partOut};
  }
  const r=gradeQuestion(q,resp,generation?{generation,questionKey:id}:isCompositeQuestionNode(q)?{questionKey:id}:undefined),counted=countedKeys.has(id);
  const mr=r.manualReviewMarks!=null?r.manualReviewMarks:(r.manualReview?r.maxMarks:0);
  // Phase 20D — an excess (first-N) or otherwise uncounted composite is ignored WHOLE: its parts carry no counted marks either.
  const parts=r.composite&&!counted&&Array.isArray(r.parts)?r.parts.map(p=>({...p,score:0,countedMaxMarks:0,manualReview:false,correct:false,counted:false,ignored:true})):(r.parts||null);
  return {id,score:counted?r.score:0,maxMarks:r.maxMarks,countedMaxMarks:counted?r.maxMarks:0,manualReviewMarks:counted?mr:0,correct:r.correct,manualReview:counted?r.manualReview:false,ignored:!counted&&isAdmittedAnswered(q,resp),parts,...(r.composite?{composite:r.composite}:{})};
}

// Section-aware, backward-compatible exam grader.
//   - "all"        : section score = sum of question scores; section max = sum of question max marks.
//   - "capScore"   : section score = min(sum of scores, section.maxMarks); ALL answered questions
//                    (and partial marks) contribute until the cap. e.g. 21x3=63 raw => 60.
//   - "firstNAnswered": only the first `requiredAnswers` ANSWERED units (in display order) are graded;
//                    excess answers stay saved but score 0; section max = section.maxMarks, which also caps the score.
// A legacy flat exam normalizes to a single "all" section, so its output is identical to the original
// grader (same fields, same numbers). Extra fields (ignored/countedMaxMarks/sectionId/sections) are
// purely additive.
// Phase 19B — `context.parametric` = the server-owned { assignmentId, studentId, attemptNumber } of the attempt being graded (see
// parametricGenerationContext in the callers). Absent ⇒ parametric questions fail closed to manual review; nothing else changes.
function gradeExam(exam,answers,context){
  const norm=normalizeExamStructure(exam);
  const generation=context&&context.parametric&&typeof context.parametric==="object"?context.parametric:null;
  let score=0,total=0,manualMarks=0,displayNumber=0;
  const questions=[],sections=[];
  norm.sections.forEach(section=>{
    const {countedKeys}=selectGradedUnits(section,answers);
    const graded=section.questions.map((q,i)=>gradeQuestionForSection(q,i,section,answers,countedKeys,generation));
    let rawSum=graded.reduce((s,g)=>s+g.score,0);
    const secManual=graded.reduce((s,g)=>s+g.manualReviewMarks,0);
    let secMax;
    if(section.gradingPolicy==="capScore"){
      secMax=section.maxMarks!=null?section.maxMarks:graded.reduce((s,g)=>s+g.maxMarks,0);
      rawSum=Math.min(rawSum,secMax);
    }else if(section.gradingPolicy==="firstNAnswered"){
      secMax=section.maxMarks!=null?section.maxMarks:graded.reduce((s,g)=>s+g.countedMaxMarks,0);
      // Phase 20G (D1) — the explicit section maximum is a CAP here too (exactly like capScore and like the canonical rebuild's
      // sectionCappedScore): with unequal question marks the first N answered units can sum above it, and an attempt must never score
      // above its own total nor change score when an unrelated review is saved.
      if(section.maxMarks!=null)rawSum=Math.min(rawSum,secMax);
    }else{
      // "all" is NEVER capped: section max is the sum of question marks, regardless of any (stale)
      // section.maxMarks. This guarantees an "all" section can never produce score > total even if a
      // leftover cap survived a policy switch in older data.
      secMax=graded.reduce((s,g)=>s+g.maxMarks,0);
    }
    score+=rawSum;total+=secMax;manualMarks+=secManual;
    graded.forEach(g=>{
      questions.push({
        questionId:g.id,
        questionNumber:++displayNumber,
        sectionId:section.id,
        score:round(g.score),
        maxMarks:round(g.maxMarks),
        countedMaxMarks:round(g.countedMaxMarks),
        correct:g.correct,
        manualReview:g.manualReview,
        ignored:!!g.ignored,
        parts:g.parts||null,
        ...(g.composite?{composite:g.composite}:{})
      });
    });
    sections.push({
      id:section.id,
      title:section.title,
      gradingPolicy:section.gradingPolicy,
      answerUnit:section.answerUnit,
      requiredAnswers:section.requiredAnswers,
      maxMarks:round(secMax),
      score:round(rawSum),
      questionIds:graded.map(g=>g.id)
    });
  });
  return {
    score:round(score),
    totalMarks:round(total),
    percentage:total?round(score/total*100):0,
    manualReviewMarks:round(manualMarks),
    finalized:round(manualMarks)===0,
    questions,
    sections
  };
}

// Phase 19B — the ONE builder of the server-owned parametric generation identity for an official attempt (delivery and every
// grading call site use it). Built ONLY from server state (the assignment storage id, the authenticated student / the submission
// path, the attempt number the server stamped); nothing in a request body can name it. Validated downstream (malformed ⇒ the
// parametric question fails closed to manual review).
function parametricGenerationContext(assignmentId,studentId,attemptNumber){return {parametric:{assignmentId:String(assignmentId||""),studentId:String(studentId||""),attemptNumber:Number(attemptNumber)}}}
module.exports={gradeExam,gradeQuestion,gradeFields,gradeCompound,matchField,parametricGenerationContext,legacyTableMode};
