
import {useEffect,useMemo,useRef,useState,useCallback} from "react";
import {IconCheck,IconMenu} from "./icons";
import {useConfirm} from "./ui/useConfirm";
import {usePrefersReducedMotion} from "./ui/usePrefersReducedMotion";
import ProgressBar from "./ui/ProgressBar";
import SaveStatus from "./student/exam/SaveStatus";
import ExamTopBar from "./student/exam/ExamTopBar";
import ExamDetailsDisclosure from "./student/exam/ExamDetailsDisclosure";
import {formatDateLatn,formatDateTimeLatn} from "./student/exam/format";
import StudentQuestionCard,{qid,answered} from "./StudentQuestionCard";
import type {Question,Answer} from "./StudentQuestionCard";
import type {ExamSection} from "./examStructure";
import {normalizeExamTheme} from "./examTheme";
import type {FieldValue} from "./StudentQuestionCard";
import {normalizeExamStructure,calculateSectionProgress,selectGradedUnits} from "./examStructure";
import {StructuredSectionQuestion} from "./StructuredExamSection";
import {buildQuestionPages,clampPageIndex,countAnsweredPages} from "./student/exam/questionPager";
import ExamBottomNavigation from "./student/exam/ExamBottomNavigation";
import QuestionNavigatorDialog from "./student/exam/QuestionNavigatorDialog";
import ExamSectionContext from "./student/exam/ExamSectionContext";
import ExamReviewScreen from "./student/exam/ExamReviewScreen";
import StructuredExamCover from "./StructuredExamCover";
import ExamGeneralInstructions from "./ExamGeneralInstructions";
import {normalizeCoverPage,examMarksDistribution,type ExamCoverPage,type MarksDistribution} from "./examCover";
import {countdownTone} from "./examTimer";
import {isUnexpectedStatus,trackingSuffix} from "./lib/requestTrace";
import {deriveSaveState,shouldWarnBeforeUnload} from "./studentSaveState";
import {scoreLabel,gradingClass,resolveGradingStatus,type GradingStatus} from "./gradingStatus";
import {normalizeAttemptPolicy,formatRemaining} from "./assignments/attemptPolicy";
import {rememberStrictExit,pendingStrictExit,clearStrictExit} from "./student/exam/strictExitMarker";

type ExamBody={title?:string;metadata?:{school?:string;subject?:string;grade?:string;className?:string;generalInstructions?:string};presentationTheme?:string;coverPage?:ExamCoverPage;questions?:Question[];sections?:ExamSection[]};
type Assignment={assignmentId:string;title:string;instructions:string;openAt:string;dueAt:string;effectiveDueAt?:string;maxAttempts:number;questionCount:number;totalMarks:number;durationMinutes?:number;requiresStart?:boolean;timed?:boolean;attemptPolicy?:string;marksDistribution?:MarksDistribution;exam:ExamBody};
type Answers=Record<string,Answer>;
type Result={attemptNumber:number;submittedAt:string;score:number;totalMarks:number;percentage:number;manualReviewMarks:number;finalized:boolean;gradingStatus?:GradingStatus;teacherFeedback?:string;timedOut?:boolean;startedAt?:string;endedAt?:string;endReason?:string;questionGrades?:Array<{questionId:string;score:number;maxMarks:number;correct:boolean;manualReview:boolean}>};
// Grading status is server-authoritative (result.gradingStatus). For an older cached result the SHARED
// resolver derives it from manualReviewMarks/finalized — never from score/percentage. No local copy.
const resultGradingStatus=(r:Result):GradingStatus=>resolveGradingStatus(r);
// Phase 7A (model 3): attemptEpoch advances on pause/resume; a paused attempt carries its stopped budget.
type ActiveAttempt={attemptNumber:number;startedAt:string;endsAt:string;status?:string;lastSavedAt?:string;attemptEpoch?:number;pausedAt?:string;pausedRemainingMs?:number|null;pauseCount?:number};
type State={attemptsUsed:number;allowedAttempts:number;canAttempt:boolean;dueClosed:boolean;draftAnswers:Answers;draftSavedAt:string;latestResult:Result|null;attempts:Array<Result>;durationMinutes?:number;timed?:boolean;attemptModelVersion?:number;attemptPolicy?:string;effectiveDueAt?:string;requiresStart?:boolean;attemptStatus?:string;serverNow?:string;activeAttempt?:ActiveAttempt|null;effectiveAttemptEndsAt?:string;attemptExpired?:boolean;canStartAttempt?:boolean;canWrite?:boolean};
type Props={token:string;assignment:Assignment;studentName:string;className:string;onBack:()=>void;onLogout:()=>void};
// Roadmap #10/#11 — a stable identity for the attempt a local dirty snapshot was produced under, so a
// reconnect/late write can never land on a DIFFERENT (newer) attempt.
// Phase 7A: a model-3 attempt also carries its EPOCH (pause/resume boundary). A snapshot produced before a pause is a
// DIFFERENT context from the resumed attempt even though number and startedAt are equal.
type AttemptCtx={attemptNumber:number;startedAt:string;attemptEpoch?:number}|null;
const attemptId=(st:State|null):AttemptCtx=>st&&st.activeAttempt?{attemptNumber:Number(st.activeAttempt.attemptNumber),startedAt:String(st.activeAttempt.startedAt||""),...(typeof st.activeAttempt.attemptEpoch==="number"?{attemptEpoch:st.activeAttempt.attemptEpoch}:{})}:null;
const sameAttempt=(a:AttemptCtx,b:AttemptCtx):boolean=>!!a&&!!b&&a.attemptNumber===b.attemptNumber&&a.startedAt===b.startedAt&&a.attemptEpoch===b.attemptEpoch;
// The identity a write/lifecycle request asserts (the server re-checks every field against the live attempt).
const identityOf=(ctx:AttemptCtx)=>ctx?{expectedAttemptNumber:ctx.attemptNumber,expectedStartedAt:ctx.startedAt,...(typeof ctx.attemptEpoch==="number"?{expectedAttemptEpoch:ctx.attemptEpoch}:{})}:{};


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

// UX-7b-1: dates/times shown to students use Western digits (formatDateTimeLatn / formatDateLatn).
const durationLabel=(m:number|undefined)=>m&&m>0?m+" دقيقة":"بدون مؤقت";

export default function StudentExamPage({token,assignment,studentName,className,onBack,onLogout}:Props){
 const theme=normalizeExamTheme(assignment.exam.presentationTheme);
 const [exam,setExam]=useState<ExamBody>(assignment.exam);
 const qs=exam.questions||[];
 const [answers,setAnswers]=useState<Answers>({}),[state,setState]=useState<State|null>(null),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[retrying,setRetrying]=useState(false),[,setSaveFailed]=useState(false),[,setDirty]=useState(false),[submitBusy,setSubmitBusy]=useState(false),[error,setError]=useState(""),[result,setResult]=useState<Result|null>(null),[started,setStarted]=useState(true),[coverStarted,setCoverStarted]=useState(false);
 // UX-7b-2 — LOCAL presentation state only (never derived from network state): the displayed question, the
 // answer/review view and the navigator dialog. Navigation is immediate and never waits for or triggers a save.
 const [pageIndex,setPageIndex]=useState(0),[view,setView]=useState<"answer"|"review">("answer"),[navOpen,setNavOpen]=useState(false);
 // Focus contract: set ONLY by an intentional navigation (Next / Previous / navigator jump / review enter-leave); the
 // effect below moves focus to the new heading once, after render. Autosave, timer ticks and resyncs never set it.
 const pendingFocusRef=useRef<"question"|"review"|null>(null),questionHeadingRef=useRef<HTMLHeadingElement|null>(null),reviewHeadingRef=useRef<HTMLHeadingElement|null>(null);
 // Back to the first question in answer mode — ONLY when a genuinely different attempt/generation is adopted or a new
 // attempt starts. A same-attempt resync (timer/state refresh, clean draft adoption) never moves the student.
 const resetPager=useCallback(()=>{setPageIndex(0);setView("answer");setNavOpen(false)},[]);
 const [starting,setStarting]=useState(false),[expired,setExpired]=useState(false),[remainingMs,setRemainingMs]=useState<number|null>(null);
 // Phase 7A — pausable «حفظ مؤقت والخروج» in flight; strict attempt ended because the student left the page.
 const [pausing,setPausing]=useState(false),[strictEnded,setStrictEnded]=useState(false);
 const exitSentRef=useRef(false),strictArmedRef=useRef(false),pendingExitRef=useRef<AttemptCtx>(null);
 // UX-7b-1 — shared confirmation (replaces window.confirm with identical texts/gating) and reduced-motion aware scrolling.
 const {confirm,confirmDialog}=useConfirm();
 const reducedMotion=usePrefersReducedMotion();
 const scrollTop=()=>window.scrollTo({top:0,behavior:reducedMotion?"auto":"smooth"});
 // Roadmap #10/#11 — connectivity is a HINT (navigator.onLine + online/offline events); it never means the
 // API is reachable. lastSavedAt is SERVER-authoritative only (state.draftSavedAt initially, response.savedAt
 // after each confirmed save). saveError = the bounded retry policy gave up.
 const [online,setOnline]=useState(typeof navigator==="undefined"||navigator.onLine!==false),[lastSavedAt,setLastSavedAt]=useState(""),[saveError,setSaveError]=useState(false);
 const onlineRef=useRef(online),stateRef=useRef<State|null>(null),answersRef=useRef<Answers>({}),dirtyAttemptRef=useRef<AttemptCtx>(null);
 // Roadmap #10/#11 — LEGACY untimed has no attempt identity (the server creates activeAttempt lazily on the
 // first saveDraft), so a legacy dirty snapshot is bound to a GENERATION = attemptsUsed (completed-attempt
 // count). If a resync shows attemptsUsed advanced (another tab submitted the attempt we were editing), the
 // old snapshot must never be uploaded as the next attempt; same generation keeps the normal clean/dirty rule.
 const dirtyGenerationRef=useRef(0);
 // Roadmap #10/#11 — the exact answers object last hydrated FROM THE SERVER. The autosave effect compares the
 // current `answers` against it by REFERENCE, so a server hydration (load / new attempt / adoption / reconcile)
 // is never mistaken for a user edit (a user edit always produces a brand-new object).
 const hydrationRef=useRef<Answers|null>(null);
 const loaded=useRef(false),timer=useRef<number|null>(null),revision=useRef(0),savedRevision=useRef(0),saveQueue=useRef<Promise<void>>(Promise.resolve()),submittingRef=useRef(false),mountedRef=useRef(true),latestTargetRevision=useRef(0);
 // Roadmap #10/#11 — a monotonically-increasing "save context" generation. Every AUTHORITATIVE server
 // hydration that resets attempt/save bookkeeping (applyServerAttemptState) bumps it. An in-flight save (or
 // its retry/error/reconcile side effects) captures the epoch when scheduled and is DROPPED SILENTLY if the
 // epoch has since changed, so a stale attempt-1 response can never contaminate attempt 2 (savedRevision /
 // lastSavedAt / dirty / error / retry). The server-side stale-attempt guard remains the final write backstop.
 const saveEpoch=useRef(0);
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
 const writable=!!state?.canWrite&&!expired&&!strictEnded;
 // Phase 7A — the assignment's attempt policy (server-authoritative; a missing field is "continuous").
 const policy=normalizeAttemptPolicy(state?.attemptPolicy??assignment.attemptPolicy);
 const paused=state?.activeAttempt?.status==="paused";

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
 async function saveDraftSnapshot(snapshot:Answers,myRevision:number,attemptCtx:AttemptCtx,epoch:number){
  if(myRevision<latestTargetRevision.current)return;
  if(epoch!==saveEpoch.current)return; // an authoritative hydration replaced the context before we started
  // Offline before we even start: don't fire a doomed request; leave the revision dirty for reconnect (#7).
  if(!onlineRef.current){if(mountedRef.current){setSaving(false);setRetrying(false)}return}
  if(mountedRef.current)setSaveError(false);
  // The request carries the attempt identity the snapshot was produced under so the SERVER rejects a late
  // write that would land on a DIFFERENT (newer) attempt (stale-attempt guard).
  const identity=attemptCtx?{expectedAttemptNumber:attemptCtx.attemptNumber,expectedStartedAt:attemptCtx.startedAt,...(typeof attemptCtx.attemptEpoch==="number"?{expectedAttemptEpoch:attemptCtx.attemptEpoch}:{})}:{};
  try{
   for(let attempt=0;attempt<=3;attempt++){
    if(myRevision<latestTargetRevision.current)return;
    if(epoch!==saveEpoch.current)return; // authoritative hydration replaced the context → drop silently
    if(!onlineRef.current){if(mountedRef.current){setSaving(false);setRetrying(false)}return}
    if(mountedRef.current){setSaving(true);setRetrying(false)} // B1: SAVING = a request is actually in flight
    try{
     const resp=await api<{savedAt?:string}>({method:"POST",body:JSON.stringify({action:"saveDraft",answers:snapshot,...identity})});
     // STALE-SUCCESS GUARD: if the context changed while this request was in flight (another tab started a new
     // attempt / this one closed), this 200 belongs to the OLD attempt — never advance savedRevision or claim
     // a saved time for the new context. The server-side guard already refused any real cross-attempt write.
     if(epoch!==saveEpoch.current)return;
     savedRevision.current=Math.max(savedRevision.current,myRevision);
     // SERVER-authoritative saved time (#3): use response.savedAt, never Date.now().
     if(mountedRef.current){if(resp&&resp.savedAt)setLastSavedAt(String(resp.savedAt));setSaveFailed(false);setSaveError(false);setRetrying(false);setError("");setDirty(revision.current>savedRevision.current)}
     return;
    }catch(e){
     if(myRevision<latestTargetRevision.current)return;
     // STALE-ERROR GUARD: a failure of a superseded context must not reconcile, show an error/tracking code,
     // or retry for the new attempt.
     if(epoch!==saveEpoch.current)return;
     // A 409 (start-gated expiry, a stale autosave after another tab finalized/started a new attempt, or a
     // stale-attempt guard rejection) is NEVER blindly retried: reconcile against AUTHORITATIVE server state.
     if(e instanceof ApiError&&e.status===409){
      if(mountedRef.current){setSaving(false);setRetrying(false)}
      if(requiresStart){const res=await reconcileTimed409();if(res!=="other")return}
      else{void resync()}
      if(epoch!==saveEpoch.current)return; // reconcile adopted a new context → don't stamp the old 409 message on it
      if(mountedRef.current){setError(e.message);setSaveFailed(true)} // expected 409 → message only, no tracking suffix
      return;
     }
     // A network TypeError while the browser has since gone offline → pause here; the reconnect flow resyncs
     // then re-saves the LATEST snapshot. No endless retry storm while offline (#9).
     if(!onlineRef.current){if(mountedRef.current){setSaving(false);setRetrying(false)}return}
     const retryable=!(e instanceof ApiError)||e.status>=500;
     if(!retryable||attempt===3){
      if(mountedRef.current){setError(errText(e,"تعذر الحفظ التلقائي."));setSaveFailed(true);setSaveError(true);setSaving(false);setRetrying(false)}
      return;
     }
     // B1: during backoff we are NOT in flight → RETRYING (never masked by SAVING).
     if(mountedRef.current){setSaving(false);setRetrying(true)}
     await new Promise(resolve=>window.setTimeout(resolve,[1000,2000,4000][attempt]));
     if(epoch!==saveEpoch.current)return; // context replaced during backoff → abandon silently
     if(!onlineRef.current){if(mountedRef.current){setSaving(false);setRetrying(false)}return} // went offline mid-backoff
    }
   }
  }finally{
   // Only clear the in-flight indicators if THIS context still owns them (a stale save must not reset the
   // new attempt's saving/retrying state).
   if(mountedRef.current&&epoch===saveEpoch.current){setSaving(false);setRetrying(false)}
  }
 }
 useEffect(()=>{mountedRef.current=true;return()=>{mountedRef.current=false}},[]);
 // Keep refs current for use inside window event handlers / async loops without re-subscribing.
 useEffect(()=>{onlineRef.current=online},[online]);
 useEffect(()=>{stateRef.current=state},[state]);
 useEffect(()=>{answersRef.current=answers},[answers]);
 useEffect(()=>{let cancelled=false;(async()=>{setLoading(true);try{const r=await api<{state:State}>();if(cancelled)return;const st=r.state;applyServerAttemptState(st);anchorClock(st);
  const rs=!!st.timed||Number(st.attemptModelVersion||0)>=2||!!st.requiresStart;
  if(rs){
   if(st.activeAttempt){
    // AUTHORITATIVE: a live/active attempt ALWAYS takes precedence over a historical latestResult (e.g.
    // attempt 2 active while attempt 1 already has a result). Otherwise the stale result would silently
    // suppress the countdown, timeout firing and resync during the active attempt.
    setResult(null);setStarted(true);
    if((st.timed||st.activeAttempt.status==="paused")&&st.attemptExpired){void triggerTimeout()}
    else{
     setExpired(false);
     // Phase 7A strict: an exit that was sent while this page went away (possibly lost) is completed now, before any
     // question is shown again — the same attempt is never continued. Only for the SAME attempt identity.
     const pending=pendingStrictExit(assignment.assignmentId);
     if(normalizeAttemptPolicy(st.attemptPolicy)==="strict"&&pending&&sameAttempt(pending,attemptId(st))){pendingExitRef.current=pending;exitSentRef.current=true;setStrictEnded(true)}
     else if(pending)clearStrictExit(assignment.assignmentId);
    }
   }else{setResult(st.latestResult);setStarted(false);clearStrictExit(assignment.assignmentId)}
  }else{setResult(st.latestResult);setStarted(st.attemptsUsed===0||Object.keys(st.draftAnswers||{}).length>0)}
  loaded.current=true}catch(e){if(!cancelled)setError(e instanceof Error?e.message:"تعذر تحميل المحاولة.")}finally{if(!cancelled)setLoading(false)}})();return()=>{cancelled=true;if(timer.current)window.clearTimeout(timer.current)}},[assignment.assignmentId,token]);
 useEffect(()=>{if(!loaded.current||!started||!writable||!examBodyLoaded||submittingRef.current)return;if(answers===hydrationRef.current)return;/* server hydration, not a user edit */revision.current+=1;latestTargetRevision.current=revision.current;setDirty(true);const myRevision=revision.current,snapshot=answers,ctx=attemptId(stateRef.current),epoch=saveEpoch.current;dirtyAttemptRef.current=ctx;dirtyGenerationRef.current=Number(stateRef.current?.attemptsUsed||0);if(timer.current)window.clearTimeout(timer.current);timer.current=window.setTimeout(()=>{if(submittingRef.current)return;if(epoch!==saveEpoch.current)return;/* context replaced before debounce fired */saveQueue.current=saveQueue.current.catch(()=>{}).then(()=>saveDraftSnapshot(snapshot,myRevision,ctx,epoch))},800);return()=>{if(timer.current)window.clearTimeout(timer.current)}},[answers,started,writable]);
 useEffect(()=>{const handler=(e:BeforeUnloadEvent)=>{if(!shouldWarnBeforeUnload(revision.current,savedRevision.current))return;e.preventDefault();e.returnValue=""};window.addEventListener("beforeunload",handler);return()=>window.removeEventListener("beforeunload",handler)},[]);
 // Resync the server-authoritative timer on reconnect and when returning to the tab; never a per-second poll.
 // Resync from AUTHORITATIVE server state. Not gated on `result` (a stale completed result must never
 // block resyncing a live active attempt). A live attempt takes precedence over latestResult and clears
 // any stale local `expired` (supports a freshly applied dueAtOverride reviving the attempt).
 // B2A #16: follow AUTHORITATIVE server state across tabs. When a start-gated attempt is active, take it
 // (active beats a stale result). When it is gone on the server (another tab submitted / it timed out),
 // stop the writable UI and show the latest result. Legacy untimed keeps its historical result-only sync.
 // THE single server-hydration / attempt-transition helper. Applies answers that came FROM THE SERVER
 // (initial load, a newly started attempt, adoption of a different attempt, a 409 reconcile). It marks the
 // draft object in hydrationRef so the autosave effect treats it as hydration (never a user edit), binds the
 // local dirty-attempt identity to this attempt, and RESETS all per-attempt bookkeeping (revision,
 // savedRevision, lastSavedAt, save flags) so a new attempt never inherits the previous attempt's state.
 const applyServerAttemptState=useCallback((st:State)=>{
  const draft=st.draftAnswers||{};
  // Bump the save epoch FIRST: any in-flight save (and its pending retry/error/reconcile) is now stale and
  // will be dropped silently, and cancel any queued autosave debounce so an obsolete snapshot is not even sent.
  saveEpoch.current+=1;
  if(timer.current){window.clearTimeout(timer.current);timer.current=null}
  stateRef.current=st;setState(st);
  answersRef.current=draft;hydrationRef.current=draft;setAnswers(draft);
  revision.current=0;savedRevision.current=0;latestTargetRevision.current=0;
  dirtyAttemptRef.current=attemptId(st);dirtyGenerationRef.current=Number(st.attemptsUsed||0);
  setLastSavedAt(String(st.draftSavedAt||""));setSaveError(false);setRetrying(false);setSaving(false);setDirty(false);
 },[]);
 // For an authoritative resync/reconcile that returns a LIVE active attempt, decide clean-vs-dirty. The SERVER
 // wins whenever this tab has no unsaved work: a DIFFERENT attempt, OR the SAME attempt while this tab is clean
 // (revision<=savedRevision) — another tab saved a newer draft, so adopt it via applyServerAttemptState (fresh
 // draftAnswers/draftSavedAt, reset bookkeeping, no autosave from hydration). ONLY when the SAME attempt has
 // genuine local unsaved edits do we preserve them and refresh timer/state alone (no cross-tab merge — a clean
 // stale tab must never overwrite the newer server draft, but real unsaved work is never discarded).
 const adoptOrKeepActive=useCallback((st:State)=>{
  const differentAttempt=!sameAttempt(attemptId(st),dirtyAttemptRef.current);
  const hasLocalUnsaved=revision.current>savedRevision.current;
  if(differentAttempt||!hasLocalUnsaved){applyServerAttemptState(st);if(differentAttempt)resetPager()}else{stateRef.current=st;setState(st)}
 },[applyServerAttemptState,resetPager]);
 // Resync AUTHORITATIVE server state. Returns the fresh State on success, or null on failure (so callers
 // never act on stale state). SAME active attempt → update timer/state only, PRESERVING legitimate unsaved
 // local answers. DIFFERENT attempt → adopt it via applyServerAttemptState (never keep a cross-attempt snapshot).
 const resync=useCallback(async():Promise<State|null>=>{if(!mountedRef.current||submittingRef.current||finalizingRef.current)return null;try{const st=(await api<{state:State}>()).state;if(!mountedRef.current)return st;const rs=!!st.timed||Number(st.attemptModelVersion||0)>=2||!!st.requiresStart;if(rs){if(st.activeAttempt){adoptOrKeepActive(st);anchorClock(st);setResult(null);setStarted(true);if((st.timed||st.activeAttempt.status==="paused")&&st.attemptExpired){void triggerTimeout()}else{setExpired(false)}}else{applyServerAttemptState(st);anchorClock(st);setResult(st.latestResult);setStarted(false);setExpired(false)}}else{
  // LEGACY untimed (no attempt identity — activeAttempt is created lazily). Bind to the GENERATION
  // (attemptsUsed): if it advanced, the attempt we were editing was submitted elsewhere → discard the local
  // snapshot and adopt authoritative server state (result/next attempt). Same generation keeps clean-vs-dirty
  // parity: a CLEAN tab adopts the server draft (server wins), a tab with genuine unsaved edits keeps them.
  const genChanged=Number(st.attemptsUsed||0)!==dirtyGenerationRef.current;
  const hasLocalUnsaved=revision.current>savedRevision.current;
  if(!genChanged&&hasLocalUnsaved){stateRef.current=st;setState(st);anchorClock(st);setResult(st.latestResult)}
  else{applyServerAttemptState(st);if(genChanged)resetPager();anchorClock(st);setResult(st.latestResult);setStarted(st.attemptsUsed===0||Object.keys(st.draftAnswers||{}).length>0)}
 }return st}catch{return null/* transient resync failure — caller must not act on stale state */}},[applyServerAttemptState,adoptOrKeepActive,resetPager]);
 // Reconnect recovery (#8): server authority FIRST (resync — which also finalizes an expired attempt and
 // adopts a changed one), THEN save the latest dirty snapshot ONLY if the server still reports the SAME
 // attempt writable. A failed resync does nothing (never save/finalize on stale state).
 const recoverAndSave=useCallback(async()=>{
  if(!mountedRef.current||submittingRef.current)return;
  const st=await resync();
  if(!st)return;                                   // resync failed → never act on stale state
  if(revision.current<=savedRevision.current)return; // nothing unsaved
  const rs=!!st.timed||Number(st.attemptModelVersion||0)>=2||!!st.requiresStart;
  // MODERN: only save when the SAME live attempt is still writable (identity match). LEGACY: activeAttempt may
  // be null (server creates it lazily on the first saveDraft), so gate on canWrite + the SAME generation
  // (attemptsUsed) the snapshot was composed under — never upload an old-generation snapshot as a new attempt.
  const canSave=rs
   ? (st.canWrite&&!st.attemptExpired&&!!st.activeAttempt&&sameAttempt(attemptId(st),dirtyAttemptRef.current))
   : (st.canWrite&&Number(st.attemptsUsed||0)===dirtyGenerationRef.current);
  if(canSave){
   const myRevision=revision.current,snapshot=answersRef.current,ctx=attemptId(st),epoch=saveEpoch.current;
   saveQueue.current=saveQueue.current.catch(()=>{}).then(()=>saveDraftSnapshot(snapshot,myRevision,ctx,epoch));
  }
 },[resync]);
 useEffect(()=>{
  // Update the ref synchronously (event handlers/submit read it immediately, before the state re-render commits).
  const handleOnline=()=>{onlineRef.current=true;if(mountedRef.current)setOnline(true);void recoverAndSave()};
  const handleOffline=()=>{onlineRef.current=false;if(mountedRef.current)setOnline(false)};
  window.addEventListener("online",handleOnline);
  window.addEventListener("offline",handleOffline);
  const onVis=()=>{if(document.visibilityState==="visible")void resync()};
  document.addEventListener("visibilitychange",onVis);
  return()=>{window.removeEventListener("online",handleOnline);window.removeEventListener("offline",handleOffline);document.removeEventListener("visibilitychange",onVis)};
 },[recoverAndSave,resync]);
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
   // Reveal the new attempt. applyServerAttemptState hydrates its server draft and RESETS all per-attempt
   // bookkeeping (revision/savedRevision/lastSavedAt/save flags) so attempt N+1 never inherits attempt N's
   // state, and no autosave is scheduled by the hydration (ref-marker).
   setExam(body);applyServerAttemptState(r.state);anchorClock(r.state);setExpired(false);finalizingRef.current=false;setResult(null);setStarted(true);setCoverStarted(true);
   exitSentRef.current=false;setStrictEnded(false); // Phase 7A: a NEW strict attempt starts un-exited
   resetPager(); // new attempt → first question (presentation only)
   scrollTop();
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
   // LIVE attempt → adoptOrKeepActive: DIFFERENT attempt or a CLEAN same attempt adopts the server draft;
   // only a SAME attempt with genuine local unsaved edits keeps them (update timer/state alone). No active
   // attempt (another tab submitted / it timed out) → full authoritative closed-state adoption via
   // applyServerAttemptState: obsolete local answers discarded, revision/savedRevision/dirtyAttempt reset,
   // lastSavedAt from server, no delayed save, beforeunload no longer warns. Then show the latest result.
   if(rs&&st.activeAttempt&&(st.timed||st.activeAttempt.status==="paused")&&st.attemptExpired){adoptOrKeepActive(st);anchorClock(st);setResult(null);setStarted(true);void triggerTimeout();return "finalized"}
   if(rs&&st.activeAttempt){adoptOrKeepActive(st);anchorClock(st);setResult(null);setStarted(true);setExpired(false);finalizingRef.current=false;submittingRef.current=false;setError("");return "resumed"}
   if(rs&&!st.activeAttempt){applyServerAttemptState(st);setResult(st.latestResult);setStarted(false);setExpired(false);setError("");return "stopped"}
  }catch{/* ignore */}
  return "other";
 }
 async function triggerTimeout(){
  if(finalizingRef.current)return;
  // Offline (#B2): the deadline passed but we cannot reach the server — LOCK inputs and wait. Do NOT call
  // finalize, and do NOT retry every countdown tick (no finalize storm). The reconnect flow resyncs
  // authoritative state first and finalizes exactly once (or resumes if the attempt was extended).
  if(!onlineRef.current){if(mountedRef.current)setExpired(true);return}
  finalizingRef.current=true;setExpired(true);submittingRef.current=true;
  try{
   await saveQueue.current.catch(()=>{});
   const r=await api<{result:Result;state:State}>({method:"POST",body:JSON.stringify({action:"finalizeTimedOutAttempt"})});
   // Adopt the authoritative CLOSED/finalized state through the SHARED hydration path: invalidate the save
   // context (epoch bump), cancel any pending autosave debounce, reset revision/savedRevision/dirtyAttempt/
   // dirtyGeneration and save flags, and take the server's finalized draft (NEVER upload post-deadline local
   // answers). Then show the result. `expired` stays true (a timed-out result); beforeunload no longer warns.
   if(mountedRef.current){applyServerAttemptState(r.state);setResult(r.result||r.state.latestResult);setStarted(false);setError("");scrollTop()}
  }catch(e){
   finalizingRef.current=false;
   // A 409 here can mean the attempt is NOT actually expired anymore (a dueAtOverride extended the effective
   // deadline), or another tab already submitted/started a new attempt. Decide from AUTHORITATIVE server state
   // through the SAME attempt-context logic (adoptOrKeepActive) — never resume a new attempt with stale answers.
   if(e instanceof ApiError&&e.status===409){
    try{
     const st=(await api<{state:State}>()).state;
     if(mountedRef.current){
      const rs=!!st.timed||Number(st.attemptModelVersion||0)>=2||!!st.requiresStart;
      if(rs&&st.activeAttempt&&!st.attemptExpired){
       // LIVE again: SAME attempt + local unsaved edits keeps them; SAME clean or DIFFERENT adopts the server
       // draft (discarding obsolete old-attempt answers). No autosave is caused merely by hydration.
       adoptOrKeepActive(st);anchorClock(st);setResult(null);setStarted(true);setExpired(false);finalizingRef.current=false;submittingRef.current=false;setError("");return;
      }
      if(rs&&!st.activeAttempt){
       // Already closed elsewhere → authoritative closed-state adoption: show the result, clear obsolete local
       // answers/context, no finalize retry, no stale timeout error, beforeunload no longer warns.
       applyServerAttemptState(st);setResult(st.latestResult);setStarted(false);setExpired(false);setError("");submittingRef.current=false;return;
      }
     }
    }catch{/* ignore — fall through to the timeout-locked messaging */}
   }
   // Offline / transient — keep answers locked (time is over) and retry when connectivity returns.
   // Roadmap #9: for an UNEXPECTED 5xx finalize failure that carries a correlation id, keep the timeout/
   // offline wording and append the subtle tracking code so the student can quote it. A network failure
   // (no ApiError) keeps the message with no fake id; an expected domain error uses its own message.
   if(mountedRef.current){
    const is5xx=e instanceof ApiError&&e.status>=500;
    const base=(is5xx||!(e instanceof ApiError))?"انتهى الوقت. سيتم إنهاء المحاولة تلقائيًا عند عودة الاتصال.":(e as Error).message;
    setError(is5xx?base+trackingSuffix((e as ApiError).requestId):base);
   }
  }finally{submittingRef.current=false}
 }

 // ── Phase 7A — STRICT: leaving the exam page ends the running attempt (server action finalizeIntegrityExit). ──
 // Armed ONLY once the attempt is really running with its questions on screen (never before startAttempt succeeds,
 // never while paused, never after a result/expiry). Exit signals: visibilitychange→hidden, pagehide, leaving this
 // page inside the app (unmount) and the explicit back button. `blur` is deliberately NOT used (a select, the keyboard
 // or an accessibility tool must never end an exam). Duplicate signals are idempotent (exitSentRef + the server).
 const strictArmed=policy==="strict"&&started&&examBodyLoaded&&hasActive&&!paused&&!result&&!expired;
 useEffect(()=>{strictArmedRef.current=strictArmed},[strictArmed]);
 // Best-effort delivery while the page is going away: an authenticated keepalive fetch carrying ONLY the attempt
 // identity (the server grades its own saved draft). A per-tab marker lets the next load finish it if it was lost.
 function sendIntegrityExitBeacon(){
  if(exitSentRef.current||!strictArmedRef.current||submittingRef.current||finalizingRef.current)return;
  const ctx=attemptId(stateRef.current);if(!ctx)return;
  exitSentRef.current=true;rememberStrictExit(assignment.assignmentId,ctx);
  if(mountedRef.current)setStrictEnded(true);
  // The page's single authenticated submission client, with keepalive so the request outlives the page.
  void api<{result?:Result|null;state?:State}>({method:"POST",keepalive:true,body:JSON.stringify({action:"finalizeIntegrityExit",...identityOf(ctx)})})
   .then(j=>{clearStrictExit(assignment.assignmentId);if(mountedRef.current&&j.state){applyServerAttemptState(j.state);setResult(j.result||j.state.latestResult);setStarted(false)}})
   .catch(e=>{if(e instanceof ApiError&&e.status===409)clearStrictExit(assignment.assignmentId)/* else: best effort — completed on return (confirmStrictExit) */});
 }
 // The awaited form (explicit back, return to a visible page, next load with a pending marker). Idempotent on the server.
 async function confirmStrictExit(target?:AttemptCtx){
  const ctx=target||attemptId(stateRef.current)||pendingStrictExit(assignment.assignmentId);
  if(!ctx)return;
  exitSentRef.current=true;if(mountedRef.current)setStrictEnded(true);
  try{
   const r=await api<{result:Result|null;state:State}>({method:"POST",body:JSON.stringify({action:"finalizeIntegrityExit",...identityOf(ctx)})});
   clearStrictExit(assignment.assignmentId);
   if(mountedRef.current){applyServerAttemptState(r.state);setResult(r.result||r.state.latestResult);setStarted(false);setError("")}
  }catch(e){
   // 409 = that attempt is not the live one any more (a newer attempt): never end it — adopt the server state instead.
   if(e instanceof ApiError&&e.status===409){clearStrictExit(assignment.assignmentId);exitSentRef.current=false;if(mountedRef.current){setStrictEnded(false);void resync()}return}
   if(mountedRef.current)setError(errText(e,"تعذر تأكيد إنهاء المحاولة. سيُعاد إرسال الطلب عند عودة الاتصال."));
  }
 }
 // Event handlers read the latest closures through refs (no re-subscription on every render).
 const exitBeaconRef=useRef(sendIntegrityExitBeacon),confirmExitRef=useRef(confirmStrictExit);
 useEffect(()=>{exitBeaconRef.current=sendIntegrityExitBeacon;confirmExitRef.current=confirmStrictExit});
 useEffect(()=>{
  if(!strictArmed)return;
  const onVis=()=>{if(document.visibilityState==="hidden")exitBeaconRef.current()};
  const onHide=()=>exitBeaconRef.current();
  document.addEventListener("visibilitychange",onVis);window.addEventListener("pagehide",onHide);
  return()=>{document.removeEventListener("visibilitychange",onVis);window.removeEventListener("pagehide",onHide)};
 },[strictArmed]);
 // Leaving the exam page inside the app (unmount while still armed) is also an exit.
 useEffect(()=>()=>{if(strictArmedRef.current)exitBeaconRef.current()},[]);
 // Back on the page after an exit was sent: make sure the server has it (idempotent) and show the result.
 useEffect(()=>{
  if(!strictEnded||result)return;
  // An exit remembered from a previous page (lost keepalive) is completed right away, for that exact identity.
  if(pendingExitRef.current){const target=pendingExitRef.current;pendingExitRef.current=null;void confirmExitRef.current(target)}
  const onVis=()=>{if(document.visibilityState==="visible")void confirmExitRef.current()};
  document.addEventListener("visibilitychange",onVis);window.addEventListener("online",onVis);
  return()=>{document.removeEventListener("visibilitychange",onVis);window.removeEventListener("online",onVis)};
 },[strictEnded,result]);

 // ── Phase 7A — PAUSABLE: explicit «حفظ مؤقت والخروج» and «متابعة المحاولة». The server stores the answers and the
 // remaining budget atomically; the page leaves ONLY after the server confirmed the pause. ──
 async function pauseAndExit(){
  if(!writable||submitBusy||pausing||policy!=="pausable")return;
  if(!onlineRef.current){setError("لا يمكن الحفظ المؤقت دون اتصال بالإنترنت. تحقق من الاتصال وحاول مرة أخرى.");return}
  const ok=await confirm({title:"حفظ مؤقت والخروج",message:timed?"سيتم حفظ إجاباتك وإيقاف المؤقت. يمكنك متابعة المحاولة نفسها لاحقًا بالوقت المتبقي، قبل آخر موعد للواجب.":"سيتم حفظ إجاباتك. يمكنك متابعة المحاولة نفسها لاحقًا قبل آخر موعد للواجب.",confirmLabel:"حفظ والخروج",cancelLabel:"متابعة الحل"});
  if(!ok)return;
  submittingRef.current=true;setPausing(true);setError("");
  if(timer.current){window.clearTimeout(timer.current);timer.current=null}
  try{
   await saveQueue.current.catch(()=>{});
   const snapshot=answersRef.current,ctx=attemptId(stateRef.current);
   const r=await api<{state:State}>({method:"POST",body:JSON.stringify({action:"pauseAttempt",answers:snapshot,...identityOf(ctx)})});
   applyServerAttemptState(r.state);                                // paused: bookkeeping reset → no unsaved-changes warning
   onBack();
  }catch(e){
   submittingRef.current=false;
   if(e instanceof ApiError&&e.status===409){await reconcileTimed409()}
   setError(errText(e,"تعذر الحفظ المؤقت."));
  }finally{if(mountedRef.current)setPausing(false);submittingRef.current=false}
 }
 async function resumePausedAttempt(){
  if(startingRef.current)return;startingRef.current=true;setStarting(true);setError("");
  try{
   const r=await api<{state:State}>({method:"POST",body:JSON.stringify({action:"resumeAttempt",...identityOf(attemptId(stateRef.current))})});
   // The attempt is running again on the server: adopt it FIRST (a failed body fetch then leaves the ordinary
   // «متابعة المحاولة» gate, which only reloads the questions — it never restarts or re-pauses anything).
   applyServerAttemptState(r.state);anchorClock(r.state);setExpired(false);finalizingRef.current=false;
   const body=await fetchExamBody();
   setExam(body);setResult(null);setStarted(true);setCoverStarted(true);resetPager();scrollTop();
  }catch(e){
   if(e instanceof ApiError&&e.status===409){await reconcileTimed409()}
   setError(errText(e,"تعذر متابعة المحاولة."));
  }finally{setStarting(false);startingRef.current=false}
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
 // UX-7b-2 — ordered presentation pages over the SAME exam/ids (no answer transformation); clamped for any exam size so a
 // resumed attempt, an authoritative body change or an unexpected question-count change can never point past the end.
 const pages=useMemo(()=>buildQuestionPages(norm,exam.questions||[]),[norm,exam.questions]);
 const currentIndex=clampPageIndex(pageIndex,pages.length); // derived every render — the stored index is never trusted as-is
 const currentPage=pages[currentIndex];
 const answeredPages=useMemo(()=>countAnsweredPages(pages,answers),[pages,answers]);
 // firstN "extra answer" hints for the CURRENT structured section only — the shared selectGradedUnits, never a second rule.
 const currentCountedKeys=useMemo(()=>currentPage?.section?selectGradedUnits(currentPage.section,answers).countedKeys:new Set<string>(),[currentPage,answers]);
 // Intentional navigation (local, immediate, zero requests). The save queue/debounce run independently.
 const goTo=(index:number)=>{setNavOpen(false);setView("answer");setPageIndex(clampPageIndex(index,pages.length));pendingFocusRef.current="question"};
 const goPrevious=()=>goTo(currentIndex-1);
 const goNext=()=>goTo(currentIndex+1);
 const openReview=()=>{setNavOpen(false);setView("review");pendingFocusRef.current="review"};
 const backToAnswering=()=>{setView("answer");pendingFocusRef.current="question"};
 // After an intentional navigation renders, focus the NEW heading (not the page top, not the navigator opener) and bring
 // it into view with reduced-motion-aware scrolling. Runs only when the displayed question/view changes; a timer tick,
 // an autosave or a same-question resync never re-runs it, and it does nothing unless navigation asked for focus.
 useEffect(()=>{
  const want=pendingFocusRef.current;if(!want)return;pendingFocusRef.current=null;
  const el=want==="review"?reviewHeadingRef.current:questionHeadingRef.current;
  if(!el)return;
  const behavior:ScrollBehavior=reducedMotion?"auto":"smooth";
  el.focus({preventScroll:true});
  if(typeof el.scrollIntoView==="function")el.scrollIntoView({block:"start",behavior});
  else window.scrollTo({top:0,behavior});
 },[currentIndex,view,reducedMotion]);
 const setChoice=(id:string,index:number)=>setAnswers(a=>({...a,[id]:{kind:"choice",index}}));
 const setSeq=(id:string,index:number,value:string)=>setAnswers(a=>{const prev=a[id]?.kind==="sequence"?(a[id] as {kind:"sequence";values:string[]}).values:[];const values=[...prev];values[index]=value;return {...a,[id]:{kind:"sequence",values}}});
 const setTable=(id:string,index:number,value:string|boolean)=>setAnswers(a=>{const prev=a[id]?.kind==="table"?(a[id] as {kind:"table";values:(string|boolean)[]}).values:[];const values=[...prev];values[index]=value;return {...a,[id]:{kind:"table",values}}});
 const setField=(id:string,fieldId:string,value:FieldValue)=>setAnswers(a=>{const prev=a[id]?.kind==="fields"?(a[id] as {kind:"fields";values:Record<string,FieldValue>}).values:{};return {...a,[id]:{kind:"fields",values:{...prev,[fieldId]:value}}}});
 const setPart=(id:string,partId:string,ans:Answer)=>setAnswers(a=>{const prev=a[id]?.kind==="compound"?(a[id] as {kind:"compound";parts:Record<string,Answer>}).parts:{};return {...a,[id]:{kind:"compound",parts:{...prev,[partId]:ans}}}});
 // The exact former window.confirm messages, now through the shared ConfirmDialog (same gating order; cancel = no request).
 const SUBMIT_CONFIRM={title:"تسليم الامتحان",confirmLabel:"تسليم الآن",cancelLabel:"متابعة الحل",tone:"danger" as const};
 function confirmSubmit():Promise<boolean>{
  if(structured){
   const short=norm.sections.filter(s=>s.gradingPolicy==="firstNAnswered"&&s.requiredAnswers!=null).map(s=>({s,p:calculateSectionProgress(s,answers)})).find(x=>x.p.required!=null&&x.p.answered<x.p.required);
   if(short)return confirm({...SUBMIT_CONFIRM,message:"أجبت عن "+short.p.answered+" من "+short.p.required+" بنود مطلوبة"+(short.s.title?" في «"+short.s.title+"»":"")+". هل تريد التسليم؟"});
   return confirm({...SUBMIT_CONFIRM,message:"سيتم إرسال الحل للتصحيح. هل تريد المتابعة؟"});
  }
  if(done<qs.length)return confirm({...SUBMIT_CONFIRM,message:"لم تُجب عن جميع الأسئلة. هل تريد التسليم الآن؟"});
  return confirm({...SUBMIT_CONFIRM,message:"سيتم إرسال الحل للتصحيح. هل تريد المتابعة؟"});
 }
 // A manual "retry save" (#12): resync authoritative state first, then save the LATEST snapshot if the server
 // still allows writing — never creating a new revision merely by retrying.
 async function manualSave(){setError("");setSaveError(false);await recoverAndSave()}
 async function submit(){if(!writable||submitBusy)return;
  // Offline submit guard (#11): never send a final submit while offline — the latest answers may be unsaved.
  if(!onlineRef.current){setError("لا يمكن تسليم الامتحان قبل حفظ التغييرات. تحقق من الاتصال بالإنترنت.");return}
  if(!(await confirmSubmit()))return;submittingRef.current=true;setSubmitBusy(true);setError("");if(timer.current)window.clearTimeout(timer.current);const submitSnapshot=answers,submitRevision=revision.current,submitCtx=attemptId(stateRef.current),submitEpoch=saveEpoch.current;if(submitRevision>savedRevision.current){saveQueue.current=saveQueue.current.catch(()=>{}).then(()=>saveDraftSnapshot(submitSnapshot,submitRevision,submitCtx,submitEpoch))}try{await saveQueue.current;
  // If the pre-submit save hit a stale-attempt 409 and reconciliation adopted a DIFFERENT attempt / a closed
  // result, the epoch changed: leave that authoritative reconciled UI intact — do NOT submit attempt 1's
  // answers and do NOT stamp a stale "couldn't save" message onto the new context.
  if(submitEpoch!==saveEpoch.current)return;
  if(savedRevision.current<submitRevision){setError("تعذر حفظ إجاباتك بسبب مشكلة في الاتصال. تحقق من الإنترنت وحاول التسليم مرة أخرى.");return}const identity=identityOf(submitCtx);if(submitEpoch!==saveEpoch.current)return;const r=await api<{result:Result;state:State}>({method:"POST",body:JSON.stringify({action:"submit",answers:submitSnapshot,...identity})});setResult(r.result);setState(r.state);setStarted(false);setAnswers({});savedRevision.current=revision.current;scrollTop()}catch(e){
  // Race at the deadline: a 409 may be an expired attempt (duration OR due-clipped => finalize) or a
  // still-live one (=> resume). Decide from AUTHORITATIVE server state, not the Arabic message text.
  if(requiresStart&&e instanceof ApiError&&e.status===409){submittingRef.current=false;const res=await reconcileTimed409();if(res==="other")setError(e.message)}
  else setError(errText(e,"تعذر تسليم الواجب."))
 }finally{setSubmitBusy(false);if(!finalizingRef.current)submittingRef.current=false}}
 // Start-gated next-attempt (TIMED or UNTIMED v2): DON'T clear the previous result here —
 // startTimedAttempt clears it only after the new attempt has actually started AND its exam body loaded,
 // so a failed start keeps the result visible. Legacy untimed reveals locally (no server start).
 function startNext(){if(requiresStart){if(!state?.canStartAttempt)return;setError("");void startTimedAttempt();return}if(!state?.canAttempt)return;
  // Legacy untimed reveals the next attempt locally (no server start). Begin a CLEAN R10/#11 save context so
  // attempt N+1 inherits NOTHING (revision/savedRevision/lastSavedAt/flags), no autosave fires from the reset
  // (empty answers marked as hydration), the epoch is refreshed and any pending debounce cleared, and the
  // legacy generation is bound to the current attemptsUsed. Only a real student edit schedules the first save.
  saveEpoch.current+=1;if(timer.current){window.clearTimeout(timer.current);timer.current=null}
  const empty:Answers={};answersRef.current=empty;hydrationRef.current=empty;setAnswers(empty);
  revision.current=0;savedRevision.current=0;latestTargetRevision.current=0;
  dirtyAttemptRef.current=null;dirtyGenerationRef.current=Number(state.attemptsUsed||0);
  setLastSavedAt("");setSaveError(false);setRetrying(false);setSaving(false);setDirty(false);setError("");
  setResult(state.latestResult);setStarted(true);setCoverStarted(false);resetPager();scrollTop()}
 async function backWithoutSubmit(){
  // Phase 7A strict: the explicit back action ends the running attempt — after a clear confirmation, the latest edit is
  // saved, then the attempt is closed on the server and its result shown (never continued).
  if(strictArmedRef.current){
   if(!(await confirm({title:"مغادرة الامتحان",message:"هذا امتحان بوضع صارم: مغادرة صفحة الامتحان تنهي هذه المحاولة وتُصحَّح إجاباتك المحفوظة، ولا يمكن متابعتها. هل تريد المغادرة؟",confirmLabel:"إنهاء المحاولة والمغادرة",cancelLabel:"البقاء",tone:"danger"})))return;
   exitSentRef.current=true;
   if(timer.current){window.clearTimeout(timer.current);timer.current=null}
   if(revision.current>savedRevision.current){const snap=answersRef.current,rev=revision.current,ctx=attemptId(stateRef.current),ep=saveEpoch.current;saveQueue.current=saveQueue.current.catch(()=>{}).then(()=>saveDraftSnapshot(snap,rev,ctx,ep))}
   await saveQueue.current.catch(()=>{});
   await confirmStrictExit();
   return;
  }
  if(revision.current>savedRevision.current&&!(await confirm({title:"مغادرة بدون تسليم",message:"توجد إجابات لم تُحفظ بعد. هل تريد المغادرة على أي حال؟",confirmLabel:"المغادرة",cancelLabel:"البقاء",tone:"danger"})))return;onBack()}
 if(loading)return <main className="interactive-exam-page" dir="rtl"><div className="iex-wrap"><p className="iex-loading" role="status">جارٍ تجهيز صفحة الامتحان...</p></div></main>;
 if(!started&&result)return <main className={"interactive-exam-page exam-theme-"+theme} dir="rtl"><div className="iex-wrap"><section className="iex-result-card"><span className="iex-eyebrow">النتيجة</span><h1>تم تسليم المحاولة {result.attemptNumber}{result.endReason==="integrityExit"?" (غادرت صفحة الامتحان)":result.endReason==="teacherEnded"?" (أنهى المعلم المحاولة)":result.timedOut?" (انتهى الوقت)":""}</h1>{error&&<div className="platform-error iex-error">{error}</div>}<div className="iex-score">{result.score}<small> / {result.totalMarks}</small></div><strong>{result.percentage}%</strong>{(()=>{const gs=resultGradingStatus(result);return <><span className={"iex-grade-badge iex-grade-"+gradingClass(gs)}>{scoreLabel(gs)}</span>{result.timedOut&&<p className="iex-timeout-note">تم إنهاء هذه المحاولة تلقائيًا عند انتهاء الوقت، وصُحّحت الإجابات المحفوظة.</p>}{result.endReason==="integrityExit"&&<p className="iex-timeout-note">تم إنهاء هذه المحاولة لأنك غادرت صفحة الامتحان في الوضع الصارم، وصُحّحت الإجابات المحفوظة.</p>}{result.endReason==="teacherEnded"&&<p className="iex-timeout-note">أنهى المعلم هذه المحاولة، وصُحّحت آخر إجابات محفوظة.</p>}{gs==="pendingReview"?<p className="iex-provisional">العلامة مؤقتة — بانتظار مراجعة المعلم{result.manualReviewMarks>0?" ("+result.manualReviewMarks+" علامة قيد المراجعة)":""}.</p>:<p className="iex-finalized"><IconCheck size={14} aria-hidden="true"/>العلامة النهائية معتمدة.</p>}</>})()}{result.teacherFeedback&&<div className="iex-teacher-feedback"><strong>ملاحظة المعلم</strong><span>{result.teacherFeedback}</span></div>}<p className="iex-result-when">تم الحفظ في حسابك بتاريخ {formatDateTimeLatn(result.submittedAt)}</p><div className="iex-result-actions"><button type="button" className="eb-button" onClick={onBack}>العودة إلى المهام</button>{(requiresStart?state?.canStartAttempt:state?.canAttempt)&&<button type="button" className="eb-button is-primary primary" onClick={startNext} disabled={starting}>{starting?"جارٍ البدء...":"بدء محاولة جديدة ("+((state?.attemptsUsed||0)+1)+" من "+(state?.allowedAttempts||assignment.maxAttempts)+")"}</button>}</div>{!(requiresStart?state?.canStartAttempt:state?.canAttempt)&&<div className="iex-no-retry">لا توجد محاولة إضافية متاحة. يستطيع المعلم السماح بمحاولة أخرى من صفحة النتائج.</div>}</section></div></main>;
 // START GATE (B2A) — questions are NOT delivered by the server until startAttempt succeeds, for TIMED
 // and UNTIMED v2 assignments alike. Shows the structured cover (when enabled) or a compact start card;
 // pressing start calls the server, refetches the exam and reveals the questions. TIMED also anchors the
 // countdown; UNTIMED never shows a countdown.
 // Phase 7A — a strict attempt that ended because the student left: never show its questions again.
 if(strictEnded&&!result){
  return <main className={"interactive-exam-page exam-theme-"+theme} dir="rtl"><div className="iex-wrap">
   <section className="iex-start-card iex-strict-ended" role="status"><span className="iex-eyebrow">وضع صارم</span><h1>انتهت المحاولة</h1>
    <p>تم إنهاء هذه المحاولة لأنك غادرت صفحة الامتحان. ستُصحَّح الإجابات المحفوظة وتظهر النتيجة هنا.</p>
    {error&&<div className="platform-error iex-error">{error}</div>}
    <div className="iex-start-actions"><button type="button" className="eb-button" onClick={onBack}>العودة إلى المهام</button><button type="button" className="eb-button is-primary primary" onClick={()=>{void confirmStrictExit()}}>عرض النتيجة</button></div>
   </section>
  </div></main>;
 }
 // Phase 7A — a PAUSED (save & resume) attempt: its questions stay hidden and its clock stopped until «متابعة المحاولة».
 if(paused&&!result&&state?.activeAttempt){
  const aa=state.activeAttempt;
  const rem=typeof aa.pausedRemainingMs==="number"?aa.pausedRemainingMs:null;
  return <main className={"interactive-exam-page exam-theme-"+theme} dir="rtl"><div className="iex-wrap">
   {error&&<div className="platform-error iex-error" role="alert">{error}</div>}
   <section className="iex-start-card iex-paused-card" aria-labelledby="iex-paused-title"><span className="iex-eyebrow">حفظ مؤقت</span>
    <h1 id="iex-paused-title">لديك محاولة محفوظة مؤقتًا</h1>
    <p>{assignment.title}</p>
    <dl className="iex-paused-meta">
     <div><dt>المحاولة</dt><dd>{aa.attemptNumber} / {state.allowedAttempts||assignment.maxAttempts}</dd></div>
     <div><dt>آخر حفظ</dt><dd>{formatDateTimeLatn(aa.lastSavedAt||aa.pausedAt||"")}</dd></div>
     {rem!==null&&<div><dt>الوقت المتبقي</dt><dd>{formatRemaining(rem)}</dd></div>}
     <div><dt>آخر موعد للواجب</dt><dd>{formatDateTimeLatn(state.effectiveDueAt||assignment.effectiveDueAt||assignment.dueAt)}</dd></div>
    </dl>
    <p className="iex-start-hint">{rem!==null?"إجاباتك محفوظة. عند المتابعة يُستأنف المؤقت بالوقت المتبقي فقط، ولا يتجاوز آخر موعد للواجب.":"إجاباتك محفوظة. ستتابع المحاولة نفسها قبل آخر موعد للواجب."}</p>
    <div className="iex-start-actions"><button type="button" className="eb-button" onClick={onBack}>العودة</button><button type="button" className="eb-button is-primary primary" onClick={()=>{void resumePausedAttempt()}} disabled={starting}>{starting?"جارٍ المتابعة...":"متابعة المحاولة"}</button></div>
   </section>
  </div></main>;
 }
 if(needsStart){
  const rawDate=assignment.openAt||assignment.effectiveDueAt||assignment.dueAt;
  const examDate=formatDateLatn(rawDate);
  const dur=durationLabel(assignment.durationMinutes||state?.durationMinutes);
  // "متابعة المحاولة" when a server attempt already exists but its body hasn't loaded (e.g. start
  // succeeded then the exam fetch failed); "بدء المحاولة" for a fresh start.
  const resumeMode=!!state?.activeAttempt;
  const startLabel=starting?"جارٍ البدء...":(resumeMode?"متابعة المحاولة":"بدء المحاولة");
  // Pre-start, the server deliberately omits sections/questions, so `structured` is false here. Cover
  // selection must therefore depend only on the (safe) coverPage config, never on the hidden structure.
  // Phase 7A — the strict warning is shown BEFORE the student starts (nothing is armed until the attempt runs).
  const strictWarning=policy==="strict"&&!resumeMode?<div className="iex-strict-warning" role="note"><strong>تنبيه:</strong> هذا امتحان بوضع صارم. بعد بدء المحاولة، مغادرة صفحة الامتحان أو الانتقال إلى تطبيق أو تبويب آخر ستؤدي إلى إنهاء المحاولة.</div>:null;
  if(cover?.enabled){
   return <main className={"interactive-exam-page exam-theme-"+theme} dir="rtl"><div className="iex-wrap">
    {error&&<div className="platform-error iex-error">{error}</div>}
    {strictWarning}
    <StructuredExamCover cover={cover} title={assignment.title||exam.title||"امتحان"} distribution={coverDistribution}
     runtime={{studentName,className:className||exam.metadata?.className||"",examDate,duration:timed?dur:""}}
     starting={starting} onStart={()=>{void startTimedAttempt()}}/>
   </div></main>;
  }
  return <main className={"interactive-exam-page exam-theme-"+theme} dir="rtl"><div className="iex-wrap">
   {error&&<div className="platform-error iex-error">{error}</div>}
   <section className="iex-start-card"><span className="iex-eyebrow">{timed?"محاولة مؤقتة":"محاولة"}</span><h1>{assignment.title}</h1><p>{assignment.instructions}</p>
    {strictWarning}
    <div className="iex-start-meta">{timed&&<span>مدة المحاولة: <strong>{dur}</strong></span>}<span>{assignment.questionCount} سؤال · {assignment.totalMarks} علامة</span><span>المحاولة {(state?.attemptsUsed||0)+1} / {state?.allowedAttempts||assignment.maxAttempts}</span></div>
    <p className="iex-start-hint">{resumeMode?(timed?"محاولتك جارية على الخادم — اضغط لمتابعة تحميل الأسئلة. لن يُعاد ضبط العدّاد.":"محاولتك جارية على الخادم — اضغط لمتابعة تحميل الأسئلة."):(timed?"لن تظهر الأسئلة إلا بعد بدء المحاولة، وسيبدأ العدّاد فور الضغط على الزر.":"لن تظهر الأسئلة إلا بعد بدء المحاولة.")}</p>
    <div className="iex-start-actions"><button type="button" className="eb-button" onClick={onBack}>العودة</button><button type="button" className="eb-button is-primary primary" onClick={()=>{void startTimedAttempt()}} disabled={starting||!canStartOrResume}>{startLabel}</button></div>
    {!canStartOrResume&&!starting&&<div className="iex-no-retry">لا يمكن بدء المحاولة الآن (قد يكون الموعد انتهى أو استُنفدت المحاولات).</div>}
   </section>
  </div></main>;
 }
 // Legacy untimed cover (no server start): reveal locally on press. v2 untimed uses the START GATE above,
 // so this is gated on !requiresStart to keep the two flows separate.
 if(structured&&cover?.enabled&&!coverStarted&&!timed&&!requiresStart){
  const rawDate=assignment.openAt||assignment.effectiveDueAt||assignment.dueAt;
  const examDate=formatDateLatn(rawDate);
  return <main className={"interactive-exam-page exam-theme-"+theme} dir="rtl"><div className="iex-wrap">
   <StructuredExamCover cover={cover} title={assignment.title||exam.title||"امتحان"} distribution={coverDistribution}
    runtime={{studentName,className:className||exam.metadata?.className||"",examDate}}
    onStart={()=>{setCoverStarted(true);scrollTop()}}/>
  </div></main>;
 }
 const inputsDisabled=submitBusy||expired||strictEnded||pausing;
 // Roadmap #10/#11 — ONE authoritative derived save state for rendering; server-confirmed lastSavedAt only.
 const saveKind=deriveSaveState({localRevision:revision.current,savedRevision:savedRevision.current,saving,retrying,errorExhausted:saveError,online});
 const attemptLine="المحاولة "+((state?.attemptsUsed||0)+1)+" / "+(state?.allowedAttempts||assignment.maxAttempts);
 const classLine=className||exam.metadata?.className||"الصف";
 const hasGeneralInstructions=!!String(exam.metadata?.generalInstructions||"").trim();
 // UX-7b-1 — one compact sticky top region (back · title · context · timer chip), the metadata behind a disclosure,
 // one progress row with the SINGLE live save-status region, then the unchanged question rendering.
 return <main className={"interactive-exam-page exam-theme-"+theme} dir="rtl"><div className="iex-wrap">
  <ExamTopBar title={assignment.title} context={classLine+" · "+attemptLine} onBack={()=>{void backWithoutSubmit()}} timer={timed&&hasActive&&remainingMs!==null?{remainingMs,tone:countdownTone(remainingMs)}:null}/>
  {error&&<div className="platform-error iex-error" role="alert">{error}</div>}
  {policy==="strict"&&hasActive&&<div className="iex-strict-badge" role="note"><strong>وضع صارم</strong><span>مغادرة هذه الصفحة أو التبديل إلى تطبيق أو تبويب آخر تنهي المحاولة.</span></div>}
  {expired&&!result&&<div className="platform-notice iex-error" role="status">انتهى وقت المحاولة — لم يعد بالإمكان تعديل الإجابات، ويجري إنهاء المحاولة وتصحيح ما تم حفظه.</div>}
  <div className="iex-progress">
   <div className="iex-position">
    <div className="iex-position-text">
     <strong className="iex-position-main">{view==="review"?"مراجعة الإجابات":"السؤال "+(pages.length?currentIndex+1:0)+" / "+pages.length}</strong>
     {view==="answer"&&currentPage?.section&&<span className="iex-position-sub">القسم {currentPage.sectionIndex+1} · السؤال {currentPage.positionInSection+1} / {currentPage.sectionSize}</span>}
    </div>
    <button type="button" className="eb-button is-small iex-nav-trigger" aria-haspopup="dialog" onClick={()=>setNavOpen(true)}><IconMenu size={16} aria-hidden="true"/>قائمة الأسئلة<span className="iex-nav-trigger-count">{answeredPages} / {pages.length} مجاب</span></button>
   </div>
   <div className="iex-progress-bar"><ProgressBar label="تقدّمك" value={pct} showValue={false} size="sm"/><strong className="iex-progress-count">{done} / {total}</strong></div>
   <SaveStatus kind={saveKind} lastSavedAt={lastSavedAt} onRetry={()=>{void manualSave()}}/>
   {policy==="pausable"&&writable&&<div className="iex-pause-row">
    <button type="button" className="eb-button is-small iex-pause-button" onClick={()=>{void pauseAndExit()}} disabled={pausing||submitBusy}>{pausing?"جارٍ الحفظ المؤقت...":"حفظ مؤقت والخروج"}</button>
    <small>{timed?"يحفظ إجاباتك ويوقف المؤقت حتى تعود. مغادرة الصفحة دون حفظ مؤقت لا توقف المؤقت.":"يحفظ إجاباتك لتتابع المحاولة نفسها لاحقًا."}</small>
   </div>}
  </div>
  <ExamDetailsDisclosure summary={questionTotal+" أسئلة · "+assignment.totalMarks+" علامة"} defaultOpen={hasGeneralInstructions}>
   {assignment.instructions&&<p className="iex-details-instructions">{assignment.instructions}</p>}
   <dl className="iex-details-list">
    <div><dt>الطالب</dt><dd>{studentName}</dd></div>
    <div><dt>الصف</dt><dd>{classLine}</dd></div>
    <div><dt>الأسئلة</dt><dd>{questionTotal}</dd></div>
    <div><dt>العلامات</dt><dd>{assignment.totalMarks}</dd></div>
    {timed&&<div><dt>مدة المحاولة</dt><dd>{durationLabel(assignment.durationMinutes||state?.durationMinutes)}</dd></div>}
    <div><dt>آخر موعد</dt><dd>{formatDateTimeLatn(assignment.effectiveDueAt||assignment.dueAt)}</dd></div>
    <div><dt>المحاولة</dt><dd>{attemptLine}</dd></div>
    {exam.metadata?.school&&<div><dt>المدرسة</dt><dd>{exam.metadata.school}</dd></div>}
   </dl>
   {/* Roadmap #17/#15 — exam-level general instructions (presentation only), shared with the teacher preview. */}
   <ExamGeneralInstructions text={exam.metadata?.generalInstructions}/>
  </ExamDetailsDisclosure>
  {/* UX-7b-2 — ONE paged rendering model for every theme and width: one logical question mounted at a time (the theme
      class stays purely visual). Structured questions render through the section renderer's per-question code with a
      compact section context; flat questions through the same StudentQuestionCard as before. Keys are unchanged. */}
  {view==="review"?(
   <ExamReviewScreen title={assignment.title} pages={pages} answers={answers} sections={structured?norm.sections:[]} headingRef={reviewHeadingRef} onJump={goTo} onBackToAnswering={backToAnswering} onSubmit={()=>{void submit()}} submitBusy={submitBusy} submitDisabled={submitBusy||!writable}/>
  ):currentPage?(()=>{const page=currentPage,id=page.id,q=page.question;return <section className="iex-page" aria-labelledby="iex-page-heading" key={id}>
   <h2 id="iex-page-heading" className="iex-page-heading" tabIndex={-1} ref={questionHeadingRef}>السؤال {q.displayNumber??(currentIndex+1)} من {pages.length}</h2>
   {page.section&&<ExamSectionContext section={page.section} sectionNumber={page.sectionIndex+1} positionInSection={page.positionInSection} sectionSize={page.sectionSize} firstInSection={page.firstInSection} answers={answers}/>}
   {page.section
    ?<StructuredSectionQuestion section={page.section} q={q} questionIndex={page.positionInSection} globalIndex={currentIndex} answers={answers} countedKeys={currentCountedKeys} showStimulus={!!q.groupId} disabled={inputsDisabled} onChoice={setChoice} onSeq={setSeq} onTable={setTable} onText={(qid2,v)=>setAnswers(x=>({...x,[qid2]:{kind:"text",value:v}}))} onField={setField} onPart={setPart}/>
    :<StudentQuestionCard q={q} index={currentIndex} id={id} answer={answers[id]} onChoice={n=>setChoice(id,n)} onSeq={(n,v)=>setSeq(id,n,v)} onTable={(n,v)=>setTable(id,n,v)} onText={v=>setAnswers(x=>({...x,[id]:{kind:"text",value:v}}))} disabled={inputsDisabled}/>}
  </section>})():<p className="iex-loading" role="status">لا توجد أسئلة في هذا الامتحان.</p>}
  {view==="answer"&&<ExamBottomNavigation index={currentIndex} total={pages.length} onPrevious={goPrevious} onNext={goNext} onReview={openReview}/>}
  <QuestionNavigatorDialog open={navOpen} onClose={()=>setNavOpen(false)} pages={pages} answers={answers} currentIndex={view==="answer"?currentIndex:-1} onJump={goTo} answeredCount={answeredPages}/>
  {confirmDialog}
 </div></main>
}
