
const {
  normalizeExamStructure,
  questionId: unitQuestionId,
  partId,
  fieldId,
  questionParts,
  isCompound,
  distributePartMarks,
  isResponseAnswered,
  selectGradedUnits
} = require("./exam-structure");

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
function tableRows(text){
  const lines=String(text||"").split(/\r?\n/).map(x=>x.trim()).filter(x=>x.startsWith("|")&&x.endsWith("|"));
  if(lines.length<2)return [];
  const split=line=>line.slice(1,-1).split("|").map(x=>x.trim());
  const rows=lines.map(split).filter(c=>!c.every(x=>/^:?-{3,}:?$/.test(x.replace(/\s/g,""))));
  return rows.length>1?rows.slice(1):[];
}
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
function pairMap(answerText){
  const m=new Map();
  String(answerText||"").split(/[؛;]/).forEach(part=>{
    const p=part.split("=");
    if(p.length>=2)m.set(clean(p[0]),clean(p.slice(1).join("=")));
  });
  return m;
}
function gradeTable(question,response,answer,max){
  const rows=tableRows(question?.text);
  const vals=Array.isArray(response?.values)?response.values:[];
  if(!rows.length||!vals.length)return {score:0,manualReview:true};
  const amap=pairMap(answer?.text);
  if(amap.size){
    let ok=0,total=Math.min(rows.length,vals.length);
    for(let i=0;i<total;i++){
      const key=clean(rows[i][0]),expected=amap.get(key);
      if(expected!==undefined&&clean(vals[i])===expected)ok++;
    }
    return {score:total?max*(ok/total):0,manualReview:false,parts:{correct:ok,total}};
  }
  const answerText=clean(answer?.text);
  if(answerText){
    let ok=0,total=Math.min(rows.length,vals.length);
    for(let i=0;i<total;i++){
      const expected=answerText.includes(clean(rows[i][0]));
      const actual=vals[i]===true||clean(vals[i])==="true"||clean(vals[i])==="1"||clean(vals[i])==="✓";
      if(actual===expected)ok++;
    }
    return {score:total?max*(ok/total):0,manualReview:false,parts:{correct:ok,total}};
  }
  return {score:0,manualReview:true};
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
    const r=gradeQuestion(sub,presp[pid]);
    score+=r.score;maxM+=r.maxMarks;
    const mr=r.manualReviewMarks!=null?r.manualReviewMarks:(r.manualReview?r.maxMarks:0);
    manualMarks+=mr;
    return {partId:pid,label:String(p?.label||""),score:round(r.score),maxMarks:round(r.maxMarks),correct:r.correct,manualReview:r.manualReview};
  });
  return {score,maxMarks:maxM,correct:maxM>0&&score>=maxM-1e-9,manualReview:manualMarks>0,manualReviewMarks:manualMarks,parts:partResults};
}

// Grades a single question (or part). Dispatch is response-kind first (so a compound/fields response
// always routes correctly regardless of type spelling), then falls back to the legacy type/answer.mode
// dispatch — byte-for-byte the same decisions the original grader made for choice/sequence/table/text.
function gradeQuestion(question,response){
  if(isCompound(question)){
    const r=gradeCompound(question,response);
    return {score:r.score,maxMarks:r.maxMarks,correct:r.correct,manualReview:r.manualReview,manualReviewMarks:r.manualReviewMarks,parts:r.parts};
  }
  const max=marks(question),answer=question?.answer||{},type=String(question?.presentationType||question?.type||"").toLowerCase();
  if(response?.kind==="fields"){
    const r=gradeFields(question,response,max);
    return {...r,maxMarks:max,correct:r.score>=max-1e-9&&!r.manualReview};
  }
  if(type==="multiplechoice"||type==="truefalse"||response?.kind==="choice"){
    const correct=gradeChoice(question,response,answer);
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
function gradeQuestionForSection(q,i,section,answers,countedKeys){
  const id=unitQuestionId(q,i);
  const resp=answers?.[id];
  if(section.answerUnit==="part"&&isCompound(q)){
    const parts=questionParts(q),pmarks=distributePartMarks(q);
    const presp=resp&&resp.kind==="compound"&&resp.parts?resp.parts:{};
    let countedScore=0,countedMax=0,fullMax=0,countedManual=0;
    const partOut=parts.map((p,pi)=>{
      const pid=partId(p,pi),key=id+"::"+pid;
      const sub={...p,marks:pmarks[pi],presentationType:p.type||p.presentationType,answer:p.answer};
      const r=gradeQuestion(sub,presp[pid]);
      fullMax+=r.maxMarks;
      const counted=countedKeys.has(key);
      const mr=r.manualReviewMarks!=null?r.manualReviewMarks:(r.manualReview?r.maxMarks:0);
      if(counted){countedScore+=r.score;countedMax+=r.maxMarks;countedManual+=mr}
      return {partId:pid,label:String(p?.label||""),score:round(r.score),maxMarks:round(r.maxMarks),correct:r.correct,manualReview:r.manualReview,counted,ignored:!counted&&isResponseAnswered(presp[pid])};
    });
    return {id,score:countedScore,maxMarks:fullMax,countedMaxMarks:countedMax,manualReviewMarks:countedManual,correct:countedMax>0&&countedScore>=countedMax-1e-9,manualReview:countedManual>0,ignored:countedMax===0&&isResponseAnswered(resp),parts:partOut};
  }
  const r=gradeQuestion(q,resp),counted=countedKeys.has(id);
  const mr=r.manualReviewMarks!=null?r.manualReviewMarks:(r.manualReview?r.maxMarks:0);
  return {id,score:counted?r.score:0,maxMarks:r.maxMarks,countedMaxMarks:counted?r.maxMarks:0,manualReviewMarks:counted?mr:0,correct:r.correct,manualReview:counted?r.manualReview:false,ignored:!counted&&isResponseAnswered(resp),parts:r.parts||null};
}

// Section-aware, backward-compatible exam grader.
//   - "all"        : section score = sum of question scores; section max = sum of question max marks.
//   - "capScore"   : section score = min(sum of scores, section.maxMarks); ALL answered questions
//                    (and partial marks) contribute until the cap. e.g. 21x3=63 raw => 60.
//   - "firstNAnswered": only the first `requiredAnswers` ANSWERED units (in display order) are graded;
//                    excess answers stay saved but score 0; section max = section.maxMarks.
// A legacy flat exam normalizes to a single "all" section, so its output is identical to the original
// grader (same fields, same numbers). Extra fields (ignored/countedMaxMarks/sectionId/sections) are
// purely additive.
function gradeExam(exam,answers){
  const norm=normalizeExamStructure(exam);
  let score=0,total=0,manualMarks=0,displayNumber=0;
  const questions=[],sections=[];
  norm.sections.forEach(section=>{
    const {countedKeys}=selectGradedUnits(section,answers);
    const graded=section.questions.map((q,i)=>gradeQuestionForSection(q,i,section,answers,countedKeys));
    let rawSum=graded.reduce((s,g)=>s+g.score,0);
    const secManual=graded.reduce((s,g)=>s+g.manualReviewMarks,0);
    let secMax;
    if(section.gradingPolicy==="capScore"){
      secMax=section.maxMarks!=null?section.maxMarks:graded.reduce((s,g)=>s+g.maxMarks,0);
      rawSum=Math.min(rawSum,secMax);
    }else if(section.gradingPolicy==="firstNAnswered"){
      secMax=section.maxMarks!=null?section.maxMarks:graded.reduce((s,g)=>s+g.countedMaxMarks,0);
    }else{
      secMax=section.maxMarks!=null?section.maxMarks:graded.reduce((s,g)=>s+g.maxMarks,0);
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
        parts:g.parts||null
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

module.exports={gradeExam,gradeQuestion,gradeFields,gradeCompound,matchField};
