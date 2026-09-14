
import {useEffect,useMemo,useRef,useState,useCallback} from "react";
import {IconCheck} from "./icons";
import StudentQuestionCard,{qid,answered} from "./StudentQuestionCard";
import type {Question,Answer} from "./StudentQuestionCard";
import type {ExamSection} from "./examStructure";
import {normalizeExamTheme,previousFocusIndex,nextFocusIndex,focusProgressPercent} from "./examTheme";
import type {FieldValue} from "./StudentQuestionCard";
import {normalizeExamStructure,calculateSectionProgress} from "./examStructure";
import StructuredExamSection from "./StructuredExamSection";
import StructuredExamCover from "./StructuredExamCover";
import {normalizeCoverPage,examMarksDistribution,type ExamCoverPage,type MarksDistribution} from "./examCover";
import {formatCountdown,countdownTone} from "./examTimer";
import {isUnexpectedStatus,trackingSuffix} from "./lib/requestTrace";

type ExamBody={title?:string;metadata?:{school?:string;subject?:string;grade?:string;className?:string;generalInstructions?:string};presentationTheme?:string;coverPage?:ExamCoverPage;questions?:Question[];sections?:ExamSection[]};
type Assignment={assignmentId:string;title:string;instructions:string;openAt:string;dueAt:string;effectiveDueAt?:string;maxAttempts:number;questionCount:number;totalMarks:number;durationMinutes?:number;requiresStart?:boolean;timed?:boolean;marksDistribution?:MarksDistribution;exam:ExamBody};
type Answers=Record<string,Answer>;
type Result={attemptNumber:number;submittedAt:string;score:number;totalMarks:number;percentage:number;manualReviewMarks:number;finalized:boolean;teacherFeedback?:string;timedOut?:boolean;startedAt?:string;endedAt?:string;endReason?:string;questionGrades?:Array<{questionId:string;score:number;maxMarks:number;correct:boolean;manualReview:boolean}>};
type ActiveAttempt={attemptNumber:number;startedAt:string;endsAt:string;status?:string;lastSavedAt?:string};
type State={attemptsUsed:number;allowedAttempts:number;canAttempt:boolean;dueClosed:boolean;draftAnswers:Answers;draftSavedAt:string;latestResult:Result|null;attempts:Array<Result>;durationMinutes?:number;timed?:boolean;attemptModelVersion?:number;requiresStart?:boolean;attemptStatus?:string;serverNow?:string;activeAttempt?:ActiveAttempt|null;effectiveAttemptEndsAt?:string;attemptExpired?:boolean;canStartAttempt?:boolean;canWrite?:boolean};
type Props={token:string;assignment:Assignment;studentName:string;className:string;onBack:()=>void;onLogout:()=>void};

class ApiError extends Error{
 status:number;
 requestId:string;
 constructor(status:number,message:string,requestId=""){super(message);this.status=status;this.requestId=requestId}
}
// Roadmap #9: keep the Arabic message; append a subtle "(رمز التتبع: …)" ONLY for an unexpected server error
// (5xx / network) that carries a correlation id — never for an expected 401/409 etc.
function errText(e:unknown,fallback:string):string{
 const base=e instanceof Error?e.message:fallback;
 if(e instanceof ApiError&&isUnexpectedStatus(e.status)&&e.requestId)return base+trackingSuffix(e.requestId);
 return base;
}

const fmt=(v:string)=>v?new Date(v).toLocaleString("ar"):"بدون موعد";
const durationLabel=(m:number|undefined)=>m&&m>0?m+" دقيقة":"بدون مؤقت";

export default function StudentExamPage({token,assignment,studentName,className,onBack,onLogout}:Props){
 const theme=normalizeExamTheme(assignment.exam.presentationTheme);
 const [exam,setExam]=useState<ExamBody>(assignment.exam);
 const qs=exam.questions||[];
 const [answers,setAnswers]=useState<Answers>({}),[state,setState]=useState<State|null>(null),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[retrying,setRetrying]=useState(false),[saveFailed,setSaveFailed]=useState(false),[dirty,setDirty]=useState(false),[submitBusy,setSubmitBusy]=useState(false),[error,setError]=useState(""),[result,setResult]=useState<Result|null>(null),[started,setStarted]=useState(true),[coverStarted,setCoverStarted]=useState(false),[focusIndex,setFocusIndex]=useState(0);
 const [starting,setStarting]=useState(false),[expired,setExpired]=useState(false),[remainingMs,setRemainingMs]=useState<number|null>(null);
 const loaded=useRef(false),timer=useRef<number|null>(null),revision=useRef(0),savedRevision=useRef(0),saveQueue=useRef<Promise<void>>(Promise.resolve()),submittingRef=useRef(false),initialAnswersSynced=useRef(false),mountedRef=useRef(true),latestTargetRevision=useRef(0);
 const startingRef=useRef(false),finalizingRef=useRef(false);
 // Server-anchored clock: we never trust the device wall clock. On each server response we store the
 // server's effective-end and a performance.now() anchor; the countdown is (effEnd - (serverNow + (perf-anchor))).
 const effEndMs=useRef(0),serverAnchorMs=useRef(0),perfAnchor=useRef(0);
 const timed=!!(state?.timed)|| (assignment.durationMinutes||0)>0;
 const hasActive=!!state?.activeAttempt;
 // B2A: an assignment REQUIRES an explicit server start when it is TIMED (B1) OR uses the unified
 // lifecycle (attemptModelVersion>=2, incl. UNTIMED). The pre-start payload carries requiresStart:true;
 // once loaded, state.timed / state.attemptModelVersion confirm it. Legacy untimed => false (historical).
 const requiresStart=timed||!!assignment.requiresStart||Number(state?.attemptModelVersion||0)>=2||!!state?.requiresStart;
 // INVARIANT: for a start-gated exam the question UI must NEVER render until the full exam body has
 // actually loaded. A server activeAttempt alone is NOT enough — the body fetch may have failed.
 // examBodyLoaded is derived from the presence of real questions/sections in the current local exam
 // (pre-start metadata has neither), so a resync that flips activeAttempt true can never reveal a
 // body-less exam.
 const examBodyLoaded=(exam.questions?.length||0)>0||(exam.sections||[]).some(s=>((s as {questions?:unknown[]}).questions?.length||0)>0);
 const needsStart=requiresStart&&!examBodyLoaded&&!result;
 // Can begin OR resume/retry loading: a fresh start (canStartAttempt) OR an existing server attempt whose
 // body has not loaded (so the compact button is never permanently disabled just because canStartAttempt
 // is false once an activeAttempt exists).
 const canStartOrResume=!!(state?.canStartAttempt||state?.activeAttempt);
 const writable=!!state?.canWrite&&!expired;

 async function subApi<T>(options:RequestInit={}):Promise<T>{const h=new Headers(options.headers||{});h.set("Content-Type","application/json");h.set("x-student-token",token);h.set("Authorization","Bearer "+token);const r=await fetch("/api/student-submission/"+encodeURIComponent(assignment.assignmentId),{...options,headers:h}),j=await r.json() as T&{error?:string};if(r.status===401){onLogout();throw new ApiError(401,"انتهت الجلسة.")}if(!r.ok)throw new ApiError(r.status,j.error||"حدث خطأ.",r.headers?.get?.("x-request-id")||"");return j}
 const api=subApi;
 // Re-anchor the local countdown clock to a fresh server state (serverNow + effectiveAttemptEndsAt).
 const anchorClock=useCallback((st:State)=>{
  const end=st.effectiveAttemptEndsAt?Date.parse(st.effectiveAttemptEndsAt):0;
  const sn=st.serverNow?Date.parse(st.serverNow):Date.now();
  if(end){effEndMs.current=end;serverAnchorMs.current=sn;perfAnchor.current=(typeof performance!=="undefined"?performance.now():0);setRemainingMs(Math.max(0,end-sn))}
 },[]);
 // Loads the FULL student-sanitized exam body (only available after startAttempt). Never swallows a
 // failure into "empty exam": a non-2xx throws, a 401 runs the normal logout, and a still-pre-start
 // payload (requiresStart / no exam body) is treated as a retryable failure. The caller reveals the
 // questions ONLY when this resolves.
 async function fetchExamBody():Promise<ExamBody>{
  const h=new Headers();h.set("x-student-token",token);h.set("Authorization","Bearer "+token);
  const r=await fetch("/api/student-assignment/"+encodeURIComponent(assignment.assignmentId),{headers:h});
  let j:{assignment?:{exam?:ExamBody;requiresStart?:boolean};error?:string}={};try{j=await r.json()}catch{}
  if(r.status===401){onLogout();throw new ApiError(401,"انتهت الجلسة.")}
  if(!r.ok)throw new ApiError(r.status,j.error||"تعذر تحميل الأسئلة.",r.headers?.get?.("x-request-id")||"");
  if(j.assignment?.requiresStart||!j.assignment?.exam||(!j.assignment.exam.questions&&!j.assignment.exam.sections))throw new ApiError(409,"تعذر تحميل الأسئلة بعد بدء المحاولة. حاول مرة أخرى.");
  return j.assignment.exam;
 }
 async function saveDraftSnapshot(snapshot:Answers,myRevision:number){
  if(myRevision<latestTargetRevision.current)return;
  if(mountedRef.current){setSaving(true);setSaveFailed(false)}
  try{
   for(let attempt=0;attempt<=3;attempt++){
    if(myRevision<latestTargetRevision.current)return;
    try{
     await api({method:"POST",body:JSON.stringify({action:"saveDraft",answers:snapshot})});
     savedRevision.current=Math.max(savedRevision.current,myRevision);
     if(mountedRef.current){setSaveFailed(false);setError("");setDirty(revision.current>savedRevision.current)}
     return;
    }catch(e){
     if(myRevision<latestTargetRevision.current)return;
     // A 409 on a start-gated save can be an expired deadline (duration OR due-clipped), a stale autosave
     // after another tab finalized, OR a transient availability state. Decide from AUTHORITATIVE server
     // state, not the Arabic message text (B2A #17 covers UNTIMED v2 the same way).
     if(requiresStart&&e instanceof ApiError&&e.status===409){
      if(mountedRef.current){setSaving(false);setRetrying(false)}
      const res=await reconcileTimed409();
      if(res!=="other")return;                 // finalized or resumed => handled
      if(mountedRef.current){setError(e.message);setSaveFailed(true)}
      return;
     }
     const retryable=!(e instanceof ApiError)||e.status>=500;
     if(!retryable||attempt===3){
      if(mountedRef.current){setError(errText(e,"تعذر الحفظ التلقائي."));setSaveFailed(true)}
      return;
     }
     if(mountedRef.current)setRetrying(true);
     await new Promise(resolve=>window.setTimeout(resolve,[1000,2000,4000][attempt]));
    }
   }
  }finally{
   if(mountedRef.current){setSaving(false);setRetrying(false)}
  }
 }
 useEffect(()=>{mountedRef.current=true;return()=>{mountedRef.current=false}},[]);
 useEffect(()=>{let cancelled=false;(async()=>{setLoading(true);try{const r=await api<{state:State}>();if(cancelled)return;const st=r.state;setState(st);setAnswers(st.draftAnswers||{});anchorClock(st);
  const rs=!!st.timed||Number(st.attemptModelVersion||0)>=2||!!st.requiresStart;
  if(rs){
   if(st.activeAttempt){
    // AUTHORITATIVE: a live/active attempt ALWAYS takes precedence over a historical latestResult (e.g.
    // attempt 2 active while attempt 1 already has a result). Otherwise the stale result would silently
    // suppress the countdown, timeout firing and resync during the active attempt.
    setResult(null);setStarted(true);
    if(st.timed&&st.attemptExpired){void triggerTimeout()}else{setExpired(false)}
   }else{setResult(st.latestResult);setStarted(false)}
  }else{setResult(st.latestResult);setStarted(st.attemptsUsed===0||Object.keys(st.draftAnswers||{}).length>0)}
  loaded.current=true}catch(e){if(!cancelled)setError(e instanceof Error?e.message:"تعذر تحميل المحاولة.")}finally{if(!cancelled)setLoading(false)}})();return()=>{cancelled=true;if(timer.current)window.clearTimeout(timer.current)}},[assignment.assignmentId,token]);
 useEffect(()=>{if(!loaded.current||!started||!writable||!examBodyLoaded||submittingRef.current)return;if(!initialAnswersSynced.current){initialAnswersSynced.current=true;return}revision.current+=1;latestTargetRevision.current=revision.current;setDirty(true);const myRevision=revision.current,snapshot=answers;if(timer.current)window.clearTimeout(timer.current);timer.current=window.setTimeout(()=>{if(submittingRef.current)return;saveQueue.current=saveQueue.current.catch(()=>{}).then(()=>saveDraftSnapshot(snapshot,myRevision))},800);return()=>{if(timer.current)window.clearTimeout(timer.current)}},[answers,started,writable]);
 useEffect(()=>{const handler=(e:BeforeUnloadEvent)=>{if(revision.current<=savedRevision.current)return;e.preventDefault();e.returnValue=""};window.addEventListener("beforeunload",handler);return()=>window.removeEventListener("beforeunload",handler)},[]);
 // Resync the server-authoritative timer on reconnect and when returning to the tab; never a per-second poll.
 // Resync from AUTHORITATIVE server state. Not gated on `result` (a stale completed result must never
 // block resyncing a live active attempt). A live attempt takes precedence over latestResult and clears
 // any stale local `expired` (supports a freshly applied dueAtOverride reviving the attempt).
 // B2A #16: follow AUTHORITATIVE server state across tabs. When a start-gated attempt is active, take it
 // (active beats a stale result). When it is gone on the server (another tab submitted / it timed out),
 // stop the writable UI and show the latest result. Legacy untimed keeps its historical result-only sync.
 const resync=useCallback(async()=>{if(!mountedRef.current||submittingRef.current||finalizingRef.current)return;try{const st=(await api<{state:State}>()).state;if(!mountedRef.current)return;setState(st);anchorClock(st);const rs=!!st.timed||Number(st.attemptModelVersion||0)>=2||!!st.requiresStart;if(rs){if(st.activeAttempt){setResult(null);setStarted(true);if(st.timed&&st.attemptExpired){void triggerTimeout()}else{setExpired(false)}}else{setResult(st.latestResult);setStarted(false);setExpired(false)}}else{setResult(st.latestResult)}}catch{/* ignore transient resync failure */}},[]);
 useEffect(()=>{const handleOnline=()=>{if(expired&&!finalizingRef.current){void triggerTimeout();return}if(submittingRef.current||!started||!writable)return;if(revision.current>savedRevision.current){const myRevision=revision.current,snapshot=answers;saveQueue.current=saveQueue.current.catch(()=>{}).then(()=>saveDraftSnapshot(snapshot,myRevision))}void resync()};window.addEventListener("online",handleOnline);const onVis=()=>{if(document.visibilityState==="visible")void resync()};document.addEventListener("visibilitychange",onVis);return()=>{window.removeEventListener("online",handleOnline);document.removeEventListener("visibilitychange",onVis)}},[answers,started,writable,expired,resync]);
 // Local 1s countdown between server syncs, anchored to performance.now() (device wall-clock changes
 // cannot reset it). Fires timeout finalization exactly once when it reaches zero.
 useEffect(()=>{
  if(!timed||!hasActive||result||!state?.effectiveAttemptEndsAt)return;
  const tick=()=>{const elapsed=(typeof performance!=="undefined"?performance.now():0)-perfAnchor.current;const est=serverAnchorMs.current+elapsed;const rem=effEndMs.current-est;setRemainingMs(Math.max(0,rem));if(rem<=0){void triggerTimeout()}};
  tick();const idv=window.setInterval(tick,1000);return()=>window.clearInterval(idv);
 },[timed,hasActive,result,state?.effectiveAttemptEndsAt]);

 async function startTimedAttempt(){
  if(startingRef.current)return;startingRef.current=true;setStarting(true);setError("");
  try{
   // 1) Start on the server (the timer is now running). startAttempt is IDEMPOTENT, so a retry after a
   //    failed exam fetch returns the SAME startedAt/endsAt and never restarts the timer.
   const r=await api<{state:State}>({method:"POST",body:JSON.stringify({action:"startAttempt"})});
   // 2) Load the full exam BEFORE revealing anything. If this throws we keep the start gate visible and
   //    surface the error — we never reveal an empty exam or drop the student into a blank timed screen.
   const body=await fetchExamBody();
   // 3) Only now, with questions in hand, reveal the exam and anchor the countdown to the server window.
   //    Clearing result here (not in startNext) means a FAILED next-attempt start never wipes the
   //    previous result — the old result stays until a new attempt has actually begun.
   setExam(body);setState(r.state);setAnswers(r.state.draftAnswers||{});anchorClock(r.state);setExpired(false);finalizingRef.current=false;setResult(null);setStarted(true);setCoverStarted(true);
   window.scrollTo({top:0,behavior:"smooth"});
  }catch(e){
   // A 409 on start can mean the PRIOR server start (e.g. a failed body-fetch retry, or a next attempt)
   // expired before this click — the server-side activeAttempt is now past its effective deadline
   // (duration OR due date). Confirm with AUTHORITATIVE server state (never the device clock / message
   // text) and, only if an expired active attempt truly exists, finalize it through the normal timeout
   // flow instead of stranding the student on the gate. No new attempt, no timer restart, no reveal.
   if(e instanceof ApiError&&e.status===409){
    try{
     const st=await api<{state:State}>();
     if(st.state.timed&&st.state.activeAttempt&&st.state.attemptExpired){setStarting(false);startingRef.current=false;await triggerTimeout();return}
    }catch{/* fall through to plain error display */}
   }
   // Gate/result stays (we did NOT setStarted/setCoverStarted, did NOT replace exam, did NOT clear
   // result). Pressing start again re-runs startAttempt (same timer) then retries the exam fetch.
   setError(errText(e,"تعذر بدء المحاولة."));
  }finally{setStarting(false);startingRef.current=false}
 }
 // Reconcile a 409 on a start-gated write/start against AUTHORITATIVE server state (never the device clock
 // or the Arabic message). Works for TIMED and UNTIMED v2. Finalizes a genuinely-expired timed attempt;
 // RESUMES a still-live one (e.g. a freshly applied dueAtOverride revived it); STOPS and shows the latest
 // result when the attempt is gone on the server (another tab submitted / it timed out). Returns what it did.
 async function reconcileTimed409():Promise<"finalized"|"resumed"|"stopped"|"other">{
  try{
   const st=(await api<{state:State}>()).state;
   if(!mountedRef.current)return "other";
   const rs=!!st.timed||Number(st.attemptModelVersion||0)>=2||!!st.requiresStart;
   if(rs&&st.activeAttempt&&st.timed&&st.attemptExpired){setState(st);anchorClock(st);setResult(null);setStarted(true);void triggerTimeout();return "finalized"}
   if(rs&&st.activeAttempt){setState(st);anchorClock(st);setResult(null);setStarted(true);setExpired(false);finalizingRef.current=false;submittingRef.current=false;setError("");return "resumed"}
   if(rs&&!st.activeAttempt){setState(st);setResult(st.latestResult);setStarted(false);setExpired(false);setError("");return "stopped"}
  }catch{/* ignore */}
  return "other";
 }
 async function triggerTimeout(){
  if(finalizingRef.current)return;finalizingRef.current=true;setExpired(true);submittingRef.current=true;
  try{
   await saveQueue.current.catch(()=>{});
   const r=await api<{result:Result;state:State}>({method:"POST",body:JSON.stringify({action:"finalizeTimedOutAttempt"})});
   if(mountedRef.current){if(r.result)setResult(r.result);setState(r.state);setStarted(false);setAnswers({});window.scrollTo({top:0,behavior:"smooth"})}
  }catch(e){
   finalizingRef.current=false;
   // A 409 here can mean the attempt is NOT actually expired anymore (a dueAtOverride extended the
   // effective deadline). Confirm via server state and RESUME the live attempt instead of staying stuck.
   if(e instanceof ApiError&&e.status===409){
    try{
     const st=(await api<{state:State}>()).state;
     if(mountedRef.current&&st.timed&&st.activeAttempt&&!st.attemptExpired){setState(st);anchorClock(st);setResult(null);setStarted(true);setExpired(false);setError("");submittingRef.current=false;return}
    }catch{/* ignore */}
   }
   // Offline / transient — keep answers locked (time is over) and retry when connectivity returns.
   if(mountedRef.current)setError(e instanceof Error&&(e as ApiError).status>=500||!(e instanceof ApiError)?"انتهى الوقت. سيتم إنهاء المحاولة تلقائيًا عند عودة الاتصال.":(e as Error).message);
  }finally{submittingRef.current=false}
 }
 const norm=useMemo(()=>normalizeExamStructure(exam),[exam]);
 const structured=norm.structured;
 const cover=useMemo<ExamCoverPage|undefined>(()=>normalizeCoverPage(exam.coverPage),[exam.coverPage]);
 const coverDistribution=useMemo(()=>assignment.marksDistribution&&assignment.marksDistribution.rows.length?assignment.marksDistribution:examMarksDistribution(norm),[assignment.marksDistribution,norm]);
 const questionTotal=useMemo(()=>structured?norm.sections.reduce((n,s)=>n+s.questions.length,0):qs.length,[structured,norm,qs]);
 const {done,total,pct}=useMemo(()=>{
  if(structured){let a=0,t=0;norm.sections.forEach(s=>{const p=calculateSectionProgress(s,answers);a+=p.answered;t+=p.total});return {done:a,total:t,pct:t?Math.round(a/t*100):0}}
  const d=qs.reduce((n,q,i)=>n+(answered(answers[qid(q,i)])?1:0),0);return {done:d,total:qs.length,pct:qs.length?Math.round(d/qs.length*100):0};
 },[structured,norm,answers,qs]);
 const setChoice=(id:string,index:number)=>setAnswers(a=>({...a,[id]:{kind:"choice",index}}));
 const setSeq=(id:string,index:number,value:string)=>setAnswers(a=>{const prev=a[id]?.kind==="sequence"?(a[id] as {kind:"sequence";values:string[]}).values:[];const values=[...prev];values[index]=value;return {...a,[id]:{kind:"sequence",values}}});
 const setTable=(id:string,index:number,value:string|boolean)=>setAnswers(a=>{const prev=a[id]?.kind==="table"?(a[id] as {kind:"table";values:(string|boolean)[]}).values:[];const values=[...prev];values[index]=value;return {...a,[id]:{kind:"table",values}}});
 const setField=(id:string,fieldId:string,value:FieldValue)=>setAnswers(a=>{const prev=a[id]?.kind==="fields"?(a[id] as {kind:"fields";values:Record<string,FieldValue>}).values:{};return {...a,[id]:{kind:"fields",values:{...prev,[fieldId]:value}}}});
 const setPart=(id:string,partId:string,ans:Answer)=>setAnswers(a=>{const prev=a[id]?.kind==="compound"?(a[id] as {kind:"compound";parts:Record<string,Answer>}).parts:{};return {...a,[id]:{kind:"compound",parts:{...prev,[partId]:ans}}}});
 function confirmSubmit(){
  if(structured){
   const short=norm.sections.filter(s=>s.gradingPolicy==="firstNAnswered"&&s.requiredAnswers!=null).map(s=>({s,p:calculateSectionProgress(s,answers)})).find(x=>x.p.required!=null&&x.p.answered<x.p.required);
   if(short)return window.confirm("أجبت عن "+short.p.answered+" من "+short.p.required+" بنود مطلوبة"+(short.s.title?" في «"+short.s.title+"»":"")+". هل تريد التسليم؟");
   return window.confirm("سيتم إرسال الحل للتصحيح. هل تريد المتابعة؟");
  }
  if(done<qs.length)return window.confirm("لم تُجب عن جميع الأسئلة. هل تريد التسليم الآن؟");
  return window.confirm("سيتم إرسال الحل للتصحيح. هل تريد المتابعة؟");
 }
 async function submit(){if(!writable||submitBusy)return;if(!confirmSubmit())return;submittingRef.current=true;setSubmitBusy(true);setError("");if(timer.current)window.clearTimeout(timer.current);const submitSnapshot=answers,submitRevision=revision.current;if(submitRevision>savedRevision.current){saveQueue.current=saveQueue.current.catch(()=>{}).then(()=>saveDraftSnapshot(submitSnapshot,submitRevision))}try{await saveQueue.current;if(savedRevision.current<submitRevision){setError("تعذر حفظ إجاباتك بسبب مشكلة في الاتصال. تحقق من الإنترنت وحاول التسليم مرة أخرى.");return}const r=await api<{result:Result;state:State}>({method:"POST",body:JSON.stringify({action:"submit",answers:submitSnapshot})});setResult(r.result);setState(r.state);setStarted(false);setAnswers({});savedRevision.current=revision.current;window.scrollTo({top:0,behavior:"smooth"})}catch(e){
  // Race at the deadline: a 409 may be an expired attempt (duration OR due-clipped => finalize) or a
  // still-live one (=> resume). Decide from AUTHORITATIVE server state, not the Arabic message text.
  if(requiresStart&&e instanceof ApiError&&e.status===409){submittingRef.current=false;const res=await reconcileTimed409();if(res==="other")setError(e.message)}
  else setError(errText(e,"تعذر تسليم الواجب."))
 }finally{setSubmitBusy(false);if(!finalizingRef.current)submittingRef.current=false}}
 // Start-gated next-attempt (TIMED or UNTIMED v2): DON'T clear the previous result here —
 // startTimedAttempt clears it only after the new attempt has actually started AND its exam body loaded,
 // so a failed start keeps the result visible. Legacy untimed reveals locally (no server start).
 function startNext(){if(requiresStart){if(!state?.canStartAttempt)return;setError("");void startTimedAttempt();return}if(!state?.canAttempt)return;setAnswers({});setResult(state.latestResult);setStarted(true);setCoverStarted(false);window.scrollTo({top:0,behavior:"smooth"})}
 function backWithoutSubmit(){if(revision.current>savedRevision.current&&!window.confirm("توجد إجابات لم تُحفظ بعد. هل تريد المغادرة على أي حال؟"))return;onBack()}
 if(loading)return <main className="student-portal" dir="rtl"><div className="platform-loading">⏳ جارٍ تجهيز صفحة الامتحان...</div></main>;
 if(!started&&result)return <main className={"interactive-exam-page exam-theme-"+theme} dir="rtl"><div className="iex-wrap"><section className="iex-result-card"><span className="platform-eyebrow">RESULT</span><h1>تم تسليم المحاولة {result.attemptNumber}{result.timedOut?" (انتهى الوقت)":""}</h1>{error&&<div className="platform-error iex-error">{error}</div>}<div className="iex-score">{result.score}<small> / {result.totalMarks}</small></div><strong>{result.percentage}%</strong>{result.timedOut&&<p className="iex-timeout-note">⏱ تم إنهاء هذه المحاولة تلقائيًا عند انتهاء الوقت، وصُحّحت الإجابات المحفوظة.</p>}{result.manualReviewMarks>0&&<p>العلامة الحالية مؤقتة، وهناك {result.manualReviewMarks} علامة تحتاج مراجعة المعلم.</p>}{result.finalized&&<p className="iex-finalized">✓ تم اعتماد العلامة النهائية.</p>}{result.teacherFeedback&&<div className="iex-teacher-feedback"><strong>ملاحظة المعلم</strong><span>{result.teacherFeedback}</span></div>}<p>تم الحفظ في حسابك بتاريخ {fmt(result.submittedAt)}</p><div className="iex-result-actions"><button onClick={onBack}>العودة إلى المهام</button>{(requiresStart?state?.canStartAttempt:state?.canAttempt)&&<button className="primary" onClick={startNext} disabled={starting}>{starting?"⏳ جارٍ البدء...":"بدء محاولة جديدة ("+((state?.attemptsUsed||0)+1)+" من "+(state?.allowedAttempts||assignment.maxAttempts)+")"}</button>}</div>{!(requiresStart?state?.canStartAttempt:state?.canAttempt)&&<div className="iex-no-retry">لا توجد محاولة إضافية متاحة. يستطيع المعلم السماح بمحاولة أخرى من صفحة النتائج.</div>}</section></div></main>;
 // START GATE (B2A) — questions are NOT delivered by the server until startAttempt succeeds, for TIMED
 // and UNTIMED v2 assignments alike. Shows the structured cover (when enabled) or a compact start card;
 // pressing start calls the server, refetches the exam and reveals the questions. TIMED also anchors the
 // countdown; UNTIMED never shows a countdown.
 if(needsStart){
  const rawDate=assignment.openAt||assignment.effectiveDueAt||assignment.dueAt;
  const examDate=rawDate?new Date(rawDate).toLocaleDateString("ar"):"";
  const dur=durationLabel(assignment.durationMinutes||state?.durationMinutes);
  // "متابعة المحاولة" when a server attempt already exists but its body hasn't loaded (e.g. start
  // succeeded then the exam fetch failed); "بدء المحاولة" for a fresh start.
  const resumeMode=!!state?.activeAttempt;
  const startLabel=starting?"⏳ جارٍ البدء...":(resumeMode?"متابعة المحاولة":"بدء المحاولة");
  // Pre-start, the server deliberately omits sections/questions, so `structured` is false here. Cover
  // selection must therefore depend only on the (safe) coverPage config, never on the hidden structure.
  if(cover?.enabled){
   return <main className={"interactive-exam-page exam-theme-"+theme} dir="rtl"><div className="iex-wrap">
    {error&&<div className="platform-error iex-error">{error}</div>}
    <StructuredExamCover cover={cover} title={assignment.title||exam.title||"امتحان"} distribution={coverDistribution}
     runtime={{studentName,className:className||exam.metadata?.className||"",examDate,duration:timed?dur:""}}
     starting={starting} onStart={()=>{void startTimedAttempt()}}/>
   </div></main>;
  }
  return <main className={"interactive-exam-page exam-theme-"+theme} dir="rtl"><div className="iex-wrap">
   {error&&<div className="platform-error iex-error">{error}</div>}
   <section className="iex-start-card"><span className="platform-eyebrow">{timed?"Timed":"Attempt"}</span><h1>{assignment.title}</h1><p>{assignment.instructions}</p>
    <div className="iex-start-meta">{timed&&<span>مدة المحاولة: <strong>{dur}</strong></span>}<span>{assignment.questionCount} سؤال · {assignment.totalMarks} علامة</span><span>المحاولة {(state?.attemptsUsed||0)+1} / {state?.allowedAttempts||assignment.maxAttempts}</span></div>
    <p className="iex-start-hint">{resumeMode?(timed?"محاولتك جارية على الخادم — اضغط لمتابعة تحميل الأسئلة. لن يُعاد ضبط العدّاد.":"محاولتك جارية على الخادم — اضغط لمتابعة تحميل الأسئلة."):(timed?"لن تظهر الأسئلة إلا بعد بدء المحاولة، وسيبدأ العدّاد فور الضغط على الزر.":"لن تظهر الأسئلة إلا بعد بدء المحاولة.")}</p>
    <div className="iex-start-actions"><button onClick={onBack}>العودة</button><button className="primary" onClick={()=>{void startTimedAttempt()}} disabled={starting||!canStartOrResume}>{startLabel}</button></div>
    {!canStartOrResume&&!starting&&<div className="iex-no-retry">لا يمكن بدء المحاولة الآن (قد يكون الموعد انتهى أو استُنفدت المحاولات).</div>}
   </section>
  </div></main>;
 }
 // Legacy untimed cover (no server start): reveal locally on press. v2 untimed uses the START GATE above,
 // so this is gated on !requiresStart to keep the two flows separate.
 if(structured&&cover?.enabled&&!coverStarted&&!timed&&!requiresStart){
  const rawDate=assignment.openAt||assignment.effectiveDueAt||assignment.dueAt;
  const examDate=rawDate?new Date(rawDate).toLocaleDateString("ar"):"";
  return <main className={"interactive-exam-page exam-theme-"+theme} dir="rtl"><div className="iex-wrap">
   <StructuredExamCover cover={cover} title={assignment.title||exam.title||"امتحان"} distribution={coverDistribution}
    runtime={{studentName,className:className||exam.metadata?.className||"",examDate}}
    onStart={()=>{setCoverStarted(true);window.scrollTo({top:0,behavior:"smooth"})}}/>
  </div></main>;
 }
 const inputsDisabled=submitBusy||expired;
 return <main className={"interactive-exam-page exam-theme-"+theme} dir="rtl"><div className="iex-wrap">
  <header className="iex-head"><div><span className="iex-school">{exam.metadata?.school||"ExamBank 791381"}</span><h1>{assignment.title}</h1><p>{assignment.instructions}</p><div className="iex-badges"><span>{className||exam.metadata?.className||"الصف"}</span><span>{questionTotal} أسئلة</span><span>{assignment.totalMarks} علامة</span><span>المحاولة {(state?.attemptsUsed||0)+1} / {state?.allowedAttempts||assignment.maxAttempts}</span></div></div><div className="iex-student"><strong>{studentName}</strong><span>آخر موعد: {fmt(assignment.effectiveDueAt||assignment.dueAt)}</span></div></header>
  {timed&&hasActive&&remainingMs!==null&&<div className={"iex-countdown "+countdownTone(remainingMs)}><span className="iex-countdown-label">الوقت المتبقي</span><strong className="iex-countdown-clock">{formatCountdown(remainingMs)}</strong></div>}
  {error&&<div className="platform-error iex-error">{error}</div>}
  {expired&&!result&&<div className="platform-notice iex-error">انتهى وقت المحاولة — لم يعد بالإمكان تعديل الإجابات، ويجري إنهاء المحاولة وتصحيح ما تم حفظه.</div>}
  <div className="iex-progress"><span>تقدّمك</span><div><i style={{width:pct+"%"}}/></div><strong>{done} / {total}</strong><small>{saveFailed?"غير محفوظ — تحقق من الاتصال":retrying?"تعذر الحفظ — إعادة المحاولة...":(saving||dirty)?"جارٍ الحفظ...":<><IconCheck size={11}/>تم الحفظ</>}</small></div>
  {structured?(()=>{let offset=0;return <>{norm.sections.map((section,si)=>{const startIndex=offset;offset+=section.questions.length;return <StructuredExamSection key={section.id} section={section} sectionNumber={si+1} startIndex={startIndex} answers={answers} onChoice={setChoice} onSeq={setSeq} onTable={setTable} onText={(id,v)=>setAnswers(x=>({...x,[id]:{kind:"text",value:v}}))} onField={setField} onPart={setPart} disabled={inputsDisabled}/>})}</>})():
  theme==="focus"&&qs.length>0?(()=>{const i=Math.min(focusIndex,qs.length-1),q=qs[i],id=qid(q,i);return <div className="iex-focus-mode"><div className="iex-focus-nav"><button onClick={()=>setFocusIndex(x=>previousFocusIndex(x,qs.length))} disabled={i===0}>◀ السابق</button><span>السؤال {i+1} من {qs.length}</span><button onClick={()=>setFocusIndex(x=>nextFocusIndex(x,qs.length))} disabled={i===qs.length-1}>التالي ▶</button></div><div className="iex-focus-progress"><i style={{width:focusProgressPercent(i,qs.length)+"%"}}/></div><StudentQuestionCard q={q} index={i} id={id} answer={answers[id]} onChoice={n=>setChoice(id,n)} onSeq={(n,v)=>setSeq(id,n,v)} onTable={(n,v)=>setTable(id,n,v)} onText={v=>setAnswers(x=>({...x,[id]:{kind:"text",value:v}}))} disabled={inputsDisabled}/></div>})():(
  <section className="iex-flow">{qs.map((q,i)=>{const id=qid(q,i);return <StudentQuestionCard key={id} q={q} index={i} id={id} answer={answers[id]} onChoice={n=>setChoice(id,n)} onSeq={(n,v)=>setSeq(id,n,v)} onTable={(n,v)=>setTable(id,n,v)} onText={v=>setAnswers(x=>({...x,[id]:{kind:"text",value:v}}))} disabled={inputsDisabled}/>})}</section>
  )}
  <footer className="iex-foot"><div><strong>أجبت عن {done} من {total}</strong><span>{saving?"جارٍ حفظ الإجابات...":"يتم حفظ إجاباتك تلقائيًا أثناء الحل."}</span></div><div><button onClick={backWithoutSubmit}>العودة بدون تسليم</button><button className="primary" onClick={submit} disabled={submitBusy||!writable}>{submitBusy?"⏳ جارٍ التصحيح...":<><IconCheck size={15}/>تسليم وتصحيح الامتحان</>}</button></div></footer>
 </div></main>
}
