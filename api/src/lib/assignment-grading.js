
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
function gradeQuestion(question,response){
  const max=marks(question),answer=question?.answer||{},type=String(question?.presentationType||question?.type||"").toLowerCase();
  if(type==="multiplechoice"||response?.kind==="choice"){
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
function gradeExam(exam,answers){
  const qs=Array.isArray(exam?.questions)?exam.questions:[];
  let score=0,total=0,manualMarks=0;
  const questions=qs.map((q,i)=>{
    const id=String(q.examQuestionId||q.id||q.number||i+1);
    const r=gradeQuestion(q,answers?.[id]);
    score+=r.score;total+=r.maxMarks;if(r.manualReview)manualMarks+=r.maxMarks;
    return {questionId:id,questionNumber:i+1,score:Number(r.score.toFixed(2)),maxMarks:r.maxMarks,correct:r.correct,manualReview:r.manualReview,parts:r.parts||null};
  });
  return {score:Number(score.toFixed(2)),totalMarks:Number(total.toFixed(2)),percentage:total?Number((score/total*100).toFixed(2)):0,manualReviewMarks:Number(manualMarks.toFixed(2)),finalized:manualMarks===0,questions};
}
module.exports={gradeExam};
