import {useEffect,useMemo,useRef,useState} from "react";
import type {AttemptPolicy} from "./assignments/attemptPolicy";
import {withTrackingCode} from "./lib/requestTrace";
import AssignmentReview from "./AssignmentReview";
import {createPortal} from "react-dom";
import ExamPreview from "./ExamPreview";
import {IconPlus,IconRefresh} from "./icons";
import {filterLibraryCatalog,catalogCategories,type LibraryCatalogItem} from "./examLibrary";
import {examHasQuestions,examQuestionCount} from "./examTypes";
import {resolveGradingStatus,type GradingStatus} from "./gradingStatus";
import {normalizeClassStatus} from "./classLifecycle";
import ActionMenu from "./ui/ActionMenu";
import {useConfirm} from "./ui/useConfirm";
import AssignmentList,{MaxAttemptsDialog,AssignmentTimingDialog} from "./assignments/AssignmentList";
import AssignmentDetail from "./assignments/AssignmentDetail";
import AssignmentComposer from "./assignments/AssignmentComposer";
import Gradebook from "./assignments/Gradebook";
import {DeadlineDialog,ReopenDialog,ExtendDialog,PurgeDialog} from "./assignments/GradebookRowEditors";
import type {Classroom,Item,Impact,Exam,SavedExam,StudentResult,LifecycleSnap,Stats,GradebookFilter,GradebookSort,QuestionStat,ItemAnalysis,AnalysisSort,SourceMode,WorkspaceMode} from "./assignments/types";

// Server-authoritative grading status for a student's LATEST result; fall back to the same inputs the
// server uses (never inferred from percentage). "notSubmitted" when there is no completed attempt.
// Row-level server gradingStatus wins; otherwise the SHARED resolver derives it from the latest result's
// manualReviewMarks/finalized (never from score). No local copy of the rule.
const rowGrading=(s:StudentResult):GradingStatus=>s.gradingStatus?s.gradingStatus:resolveGradingStatus(s.latestResult);
type Props={token:string;classes:Classroom[];currentExam:unknown|null;onCopyLibraryExamToBuilder?:(examSnapshot:Exam,title:string)=>void};

const localDate=(h:number)=>{const d=new Date(Date.now()+h*3600000);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)};
const toLocalInput=(iso:string)=>{if(!iso)return "";const d=new Date(iso);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)};
const fmt=(v:string)=>v?new Date(v).toLocaleString("ar"):"بدون موعد";

// Master-list scope (class filter · current/archived view · search). The SAME predicate drives the displayed list
// and the UX-5 invariant "a visible AssignmentDetail belongs to the current master-list scope", so the two can
// never disagree. Pure; `q` is already trimmed + lowercased.
type MasterScope={classId:string;showArchived:boolean;q:string};
function matchesMasterScope(x:Item,s:MasterScope):boolean{
 if(s.classId&&x.classId!==s.classId)return false;
 if(s.showArchived?x.status!=="archived":x.status==="archived")return false;
 if(s.q&&![x.title,x.className].join(" ").toLocaleLowerCase("ar").includes(s.q))return false;
 return true;
}
const normalizeQuery=(v:string)=>v.trim().toLocaleLowerCase("ar");

export default function AssignmentsPanel({token,classes,currentExam,onCopyLibraryExamToBuilder}:Props){
 const current=currentExam&&typeof currentExam==="object"?currentExam as Exam:null;
 const [items,setItems]=useState<Item[]>([]),[classId,setClassId]=useState(""),[title,setTitle]=useState(""),[instructions,setInstructions]=useState("أجب عن جميع الأسئلة واقرأ التعليمات جيدًا قبل البدء."),[openAt,setOpenAt]=useState(localDate(0)),[dueAt,setDueAt]=useState(localDate(72)),[maxAttempts,setMaxAttempts]=useState(1),[durationMinutes,setDurationMinutes]=useState(0),[attemptPolicy,setAttemptPolicy]=useState<AttemptPolicy>("continuous"),[publish,setPublish]=useState(true),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState(""),[resultsFor,setResultsFor]=useState<Item|null>(null),[results,setResults]=useState<StudentResult[]>([]),[stats,setStats]=useState<Stats|null>(null),[review,setReview]=useState<{studentId:string;attemptNumber:number}|null>(null);
 const [deadlineFor,setDeadlineFor]=useState<string|null>(null),[deadlineValue,setDeadlineValue]=useState("");
 const [reopenFor,setReopenFor]=useState<string|null>(null),[reopenValue,setReopenValue]=useState("");
 const [extendFor,setExtendFor]=useState<string|null>(null),[extendValue,setExtendValue]=useState("");
 const [showArchived,setShowArchived]=useState(false),[purgeFor,setPurgeFor]=useState<Item|null>(null),[purgeTitle,setPurgeTitle]=useState("");
 const [analysis,setAnalysis]=useState<ItemAnalysis|null>(null),[analysisBusy,setAnalysisBusy]=useState(false),[analysisSort,setAnalysisSort]=useState<AnalysisSort>("number");
 // Roadmap #13 — gradebook search/filter/sort (client-side over the already-loaded results; no request per keystroke).
 const [gbSearch,setGbSearch]=useState(""),[gbFilter,setGbFilter]=useState<GradebookFilter>("all"),[gbSort,setGbSort]=useState<GradebookSort>("name");
 const [savedExams,setSavedExams]=useState<SavedExam[]>([]),[examSource,setExamSource]=useState(current?"current":""),[savedExam,setSavedExam]=useState<Exam|null>(null),[examLoading,setExamLoading]=useState(false);
 const [sourceMode,setSourceMode]=useState<SourceMode>("mine");
 const [libraryCatalog,setLibraryCatalog]=useState<LibraryCatalogItem[]>([]),[libraryLoading,setLibraryLoading]=useState(false),[librarySearch,setLibrarySearch]=useState(""),[libraryCategory,setLibraryCategory]=useState(""),[librarySelectedId,setLibrarySelectedId]=useState(""),[libraryExam,setLibraryExam]=useState<Exam|null>(null);
 const [preview,setPreview]=useState<{title:string;exam:Exam}|null>(null),[previewBusyId,setPreviewBusyId]=useState(""),[copyBusyId,setCopyBusyId]=useState("");
 // UX-5 workspace state: list filter (separate from the composer's target class), search, mode, explicit attempts editor.
 const [filterClassId,setFilterClassId]=useState<string|null>(null),[search,setSearch]=useState(""),[mode,setMode]=useState<WorkspaceMode>("list"),[attemptsFor,setAttemptsFor]=useState<Item|null>(null),[timingFor,setTimingFor]=useState<Item|null>(null);
 const detailHeadingRef=useRef<HTMLHeadingElement>(null),composerHeadingRef=useRef<HTMLHeadingElement>(null);
 const detailOpenerRef=useRef<HTMLElement|null>(null),composerOpenerRef=useRef<HTMLElement|null>(null),focusDetailPending=useRef(false),focusComposerOpenerPending=useRef(false),focusWorkspacePending=useRef(false);
 const toolbarRef=useRef<HTMLDivElement|null>(null),scopeRef=useRef<MasterScope>({classId:"",showArchived:false,q:""});
 const {confirm,cancelPending,confirmDialog}=useConfirm();
 // Roadmap #34: a class is offered as an assignment target only through the canonical lifecycle helper (status
 // "archived" OR active:false ⇒ archived), never the raw compatibility `active` flag.
 const active=useMemo(()=>classes.filter(x=>normalizeClassStatus(x)==="active"),[classes]);
 const sourceExam=sourceMode==="library"?libraryExam:(examSource==="current"?current:savedExam);
 useEffect(()=>{if(!classId&&active[0])setClassId(active[0].classId)},[active,classId]);
 useEffect(()=>{if(current&&examSource===""&&examHasQuestions(current))setExamSource("current")},[current,examSource]);
 // The list scope defaults to the first canonical-active class (as before); "" = all classes once the teacher chooses it.
 const effectiveFilter=filterClassId===null?(active[0]?.classId||""):filterClassId;

 async function api<T>(url:string,options:RequestInit={}):Promise<T>{
  const h=new Headers(options.headers||{});h.set("Content-Type","application/json");h.set("x-builder-token",token);h.set("Authorization","Bearer "+token);
  const r=await fetch(url,{...options,headers:h}),j=await r.json() as T&{error?:string};if(!r.ok)throw new Error(withTrackingCode(j.error||"حدث خطأ.",r.status,r));return j;
 }
 async function load(){setLoading(true);try{const r=await api<{assignments:Item[]}>("/api/assignments");setItems(r.assignments||[])}catch(e){setError(e instanceof Error?e.message:"تعذر تحميل الواجبات.")}finally{setLoading(false)}}
 async function loadSavedExams(){
  try{const r=await api<{exams:SavedExam[]}>("/api/saved-exams");setSavedExams(r.exams||[])}catch(e){setError(e instanceof Error?e.message:"تعذر تحميل الامتحانات المحفوظة.")}
 }
 useEffect(()=>{void load();void loadSavedExams()},[]);

 async function chooseExam(value:string){
  setExamSource(value);setSavedExam(null);setError("");setNotice("");
  if(!value){return}
  if(value==="current"){
   if(current?.title)setTitle(current.title);
   return;
  }
  const meta=savedExams.find(x=>x.blobName===value);
  setExamLoading(true);
  try{
   const r=await api<{exam:Exam}>("/api/saved-exams",{method:"POST",body:JSON.stringify({action:"load",blobName:value})});
   setSavedExam(r.exam||null);setTitle(String(r.exam?.title||meta?.title||""));setNotice("✓ تم اختيار الامتحان المحفوظ.");
  }catch(e){setExamSource("");setError(e instanceof Error?e.message:"تعذر فتح الامتحان المحفوظ.")}finally{setExamLoading(false)}
 }

 async function switchSourceMode(mode:SourceMode){
  setSourceMode(mode);setError("");setNotice("");
  if(mode==="library"&&!libraryCatalog.length&&!libraryLoading){
   setLibraryLoading(true);
   try{const r=await api<{catalog:LibraryCatalogItem[]}>("/api/exam-library");setLibraryCatalog(r.catalog||[])}
   catch(e){setError(e instanceof Error?e.message:"تعذر تحميل مكتبة 791381.")}
   finally{setLibraryLoading(false)}
  }
 }
 async function chooseLibraryItem(it:LibraryCatalogItem){
  if(!it.publishable||examLoading)return;
  setLibrarySelectedId(it.libraryItemId);setLibraryExam(null);setError("");setNotice("");
  setExamLoading(true);
  try{
   const r=await api<{item:{examSnapshot:Exam}}>("/api/exam-library/"+encodeURIComponent(it.libraryItemId));
   setLibraryExam(r.item?.examSnapshot||null);setTitle(String(r.item?.examSnapshot?.title||it.title||""));setNotice("✓ تم اختيار «"+it.title+"» من مكتبة 791381.");
  }catch(e){setLibrarySelectedId("");setError(e instanceof Error?e.message:"تعذر فتح عنصر المكتبة.")}finally{setExamLoading(false)}
 }
 // Preview reuses the ONE faithful renderer (ExamPreview), whose toSafePreviewExam() deep-scrubs every
 // grading secret from the whole exam (sections/cover/parts/fields/options) — so previewing any item
 // (including needs_review ones) is safe and never reveals answers, and structured exams keep their
 // sections/cover instead of being flattened.
 async function openPreview(it:LibraryCatalogItem){
  if(previewBusyId)return;
  setPreviewBusyId(it.libraryItemId);setError("");
  try{
   const r=await api<{item:{examSnapshot:Exam}}>("/api/exam-library/"+encodeURIComponent(it.libraryItemId));
   setPreview({title:it.title,exam:(r.item?.examSnapshot||{}) as Exam});
  }catch(e){setError(e instanceof Error?e.message:"تعذر فتح المعاينة.")}finally{setPreviewBusyId("")}
 }
 async function copyLibraryItem(it:LibraryCatalogItem){
  if(!onCopyLibraryExamToBuilder||copyBusyId)return;
  setCopyBusyId(it.libraryItemId);setError("");setNotice("");
  try{
   const r=await api<{item:{examSnapshot:Exam}}>("/api/exam-library/"+encodeURIComponent(it.libraryItemId));
   if(r.item?.examSnapshot)onCopyLibraryExamToBuilder(r.item.examSnapshot,it.title);
  }catch(e){setError(e instanceof Error?e.message:"تعذر نسخ العنصر إلى الباني.")}finally{setCopyBusyId("")}
 }
 const libraryFiltered=useMemo(()=>filterLibraryCatalog(libraryCatalog,{search:librarySearch,category:libraryCategory}),[libraryCatalog,librarySearch,libraryCategory]);
 const libraryCats=useMemo(()=>catalogCategories(libraryCatalog),[libraryCatalog]);

 // ── Workspace modes: composer (non-modal, in the detail area) and detail (non-modal). Focus moves to the
 // area's heading when it appears and returns to the opening control when it closes.
 function openComposer(){
  const el=typeof document!=="undefined"?document.activeElement:null;
  composerOpenerRef.current=el instanceof HTMLElement?el:null;
  setError("");setNotice("");setMode("composer");
 }
 function closeComposer(){
  // The opener is disabled while the composer is open, so focus is returned after the mode flips (effect below).
  focusComposerOpenerPending.current=true;setMode("list");
 }
 useEffect(()=>{
  if(mode==="composer"){composerHeadingRef.current?.focus();return}
  if(focusComposerOpenerPending.current){
   focusComposerOpenerPending.current=false;
   const el=composerOpenerRef.current;composerOpenerRef.current=null;
   if(el&&el.isConnected)el.focus();
  }
 },[mode]);
 useEffect(()=>{if(mode==="list"&&resultsFor&&focusDetailPending.current){focusDetailPending.current=false;detailHeadingRef.current?.focus()}},[mode,resultsFor]);

 async function create(){
  if(busy||!classId||!title.trim()||!sourceExam||!examHasQuestions(sourceExam))return;
  setBusy(true);setError("");setNotice("");
  try{
   const r=await api<{assignment:Item}>("/api/assignments",{method:"POST",body:JSON.stringify({action:"create",classId,title:title.trim(),instructions:instructions.trim(),openAt:openAt?new Date(openAt).toISOString():"",dueAt:dueAt?new Date(dueAt).toISOString():"",maxAttempts,durationMinutes,attemptPolicy,publish,examSnapshot:sourceExam})});
   setItems(x=>[r.assignment,...x]);setNotice("✓ تم إنشاء الواجب من الامتحان المختار.");
   closeComposer();
  }catch(e){setError(e instanceof Error?e.message:"تعذر إنشاء الواجب.")}finally{setBusy(false)}
 }
 async function action(item:Item,body:any){setBusy(true);try{const r=await api<{assignment:Item}>("/api/assignments",{method:"POST",body:JSON.stringify({assignmentId:item.assignmentId,...body})});reconcileMutated(r.assignment)}catch(e){setError(e instanceof Error?e.message:"تعذر تنفيذ العملية.")}finally{setBusy(false)}}
 async function saveMaxAttempts(item:Item,value:number){await action(item,{action:"setMaxAttempts",maxAttempts:value});setAttemptsFor(null)}
 // Phase 5A — class-wide time & deadline update. One authoritative request; reconcile the returned summary
 // into the list (and the open gradebook if it points here) WITHOUT a page reload, then a clear success notice.
 // Availability/eligibility is re-derived server-side, so an eligible student reopens and an exhausted one does not.
 async function saveTiming(item:Item,dueAtIso:string,durationMinutes:number){
  setBusy(true);setError("");setNotice("");
  try{
   const r=await api<{assignment:Item}>("/api/assignments",{method:"POST",body:JSON.stringify({action:"updateTiming",assignmentId:item.assignmentId,dueAt:dueAtIso,durationMinutes})});
   reconcileMutated(r.assignment);setTimingFor(null);setNotice("✓ تم تحديث وقت الواجب وموعد التسليم.");
  }catch(e){setError(e instanceof Error?e.message:"تعذر تحديث وقت الواجب.")}finally{setBusy(false)}
 }
 // Roadmap #7 — archive-first deletion. The normal destructive action ARCHIVES (never physically deletes)
 // and always checks authoritative impact first so an active-attempt archive is confirmed explicitly.
 async function fetchImpact(item:Item):Promise<Impact|null>{try{const r=await api<{impact:Impact}>("/api/assignments",{method:"POST",body:JSON.stringify({action:"deleteImpact",assignmentId:item.assignmentId})});return r.impact}catch(e){setError(e instanceof Error?e.message:"تعذر حساب أثر العملية.");return null}}
 async function archiveItem(item:Item){
  setBusy(true);setError("");setNotice("");
  try{
   const impact=await fetchImpact(item);if(!impact)return;
   let confirmActive=false;
   if(impact.activeAttempts>0){
    if(!(await confirm({message:"يوجد "+impact.activeAttempts+" طلاب في محاولات نشطة. أرشفة الواجب ستمنعهم من المتابعة حتى تتم استعادته. لن تُحذف إجاباتهم أو محاولاتهم.",title:"أرشفة واجب فيه محاولات نشطة",confirmLabel:"أرشفة"})))return;
    confirmActive=true;
   }else if(!(await confirm({message:"سيتم إخفاء الواجب عن الطلاب مع الاحتفاظ بجميع التسليمات والنتائج. يمكنك استعادته لاحقًا.",title:"أرشفة الواجب",confirmLabel:"أرشفة"})))return;
   const r=await api<{assignment:Item}>("/api/assignments",{method:"POST",body:JSON.stringify({action:"archive",assignmentId:item.assignmentId,...(confirmActive?{confirmActiveAttempts:true}:{})})});
   // If this assignment's gradebook is open: refresh its authoritative status so B2B controls hide at once, or
   // drop the detail entirely when the archived assignment leaves the current master scope.
   reconcileMutated(r.assignment);
   if(resultsFor?.assignmentId===item.assignmentId){setDeadlineFor(null);setReopenFor(null);setExtendFor(null)}
   setNotice("✓ تم أرشفة الواجب «"+item.title+"».");
  }catch(e){setError(e instanceof Error?e.message:"تعذر أرشفة الواجب.")}finally{setBusy(false)}
 }
 async function restoreItem(item:Item){setBusy(true);setError("");setNotice("");try{const r=await api<{assignment:Item}>("/api/assignments",{method:"POST",body:JSON.stringify({action:"restore",assignmentId:item.assignmentId})});reconcileMutated(r.assignment);setNotice("✓ تم استعادة الواجب «"+item.title+"».")}catch(e){setError(e instanceof Error?e.message:"تعذر استعادة الواجب.")}finally{setBusy(false)}}
 // Permanent purge — impact-gated. History present => never even offer purge; zero history => danger dialog
 // that requires typing the exact title before POSTing action:"purge".
 async function openPurge(item:Item){setError("");setNotice("");setBusy(true);try{const impact=await fetchImpact(item);if(!impact)return;if(impact.submissionDocuments>0){setError("لا يمكن الحذف النهائي لأن للواجب بيانات طلاب محفوظة. اترك الواجب في الأرشيف للحفاظ على السجل.");return}setPurgeFor(item);setPurgeTitle("")}finally{setBusy(false)}}
 async function confirmPurge(){if(!purgeFor)return;const item=purgeFor;setBusy(true);setError("");try{const r=await api<{purged?:boolean}>("/api/assignments",{method:"POST",body:JSON.stringify({action:"purge",assignmentId:item.assignmentId,confirmAssignmentId:item.assignmentId,confirmTitle:purgeTitle})});if(r.purged){setItems(x=>x.filter(y=>y.assignmentId!==item.assignmentId));if(resultsFor?.assignmentId===item.assignmentId)clearDetail({restoreFocus:false});focusWorkspacePending.current=true;setPurgeFor(null);setNotice("✓ تم حذف الواجب نهائيًا.")}}catch(e){setError(e instanceof Error?e.message:"تعذر الحذف النهائي.")}finally{setBusy(false)}}
 // Opening an assignment = exactly one authoritative results read; the composer yields to the detail area.
 async function loadResults(item=resultsFor,trigger?:HTMLElement|null){if(!item)return;if(trigger!==undefined){detailOpenerRef.current=trigger;focusDetailPending.current=true;setMode("list")}setBusy(true);setDeadlineFor(null);setReopenFor(null);setExtendFor(null);setAnalysis(null);try{const r=await api<{students:StudentResult[];stats:Stats}>("/api/assignment-results?assignmentId="+encodeURIComponent(item.assignmentId));if(!matchesMasterScope(item,scopeRef.current))return;setResultsFor(item);setResults(r.students||[]);setStats(r.stats||null)}catch(e){setError(e instanceof Error?e.message:"تعذر تحميل النتائج.")}finally{setBusy(false)}}
 // Clears every piece of detail state (results, stats, analysis, gradebook controls, row editors, opener ref).
 // restoreFocus:true = the explicit close button (focus returns to the original "فتح"); restoreFocus:false = the
 // detail left the master scope while the teacher operates a master control or after an authoritative mutation,
 // so the control they are using keeps focus and no detached opener is ever focused.
 function clearDetail({restoreFocus}:{restoreFocus:boolean}){
  setResultsFor(null);setResults([]);setStats(null);setDeadlineFor(null);setReopenFor(null);setExtendFor(null);setAnalysis(null);setGbSearch("");setGbFilter("all");setGbSort("name");
  const el=detailOpenerRef.current;detailOpenerRef.current=null;
  if(restoreFocus&&el&&el.isConnected)el.focus();
 }
 function closeDetail(){clearDetail({restoreFocus:true})}
 // Master controls: apply the change, then enforce the invariant against the resulting scope. The composer is
 // never closed here (its target class is intentionally independent of the list filter).
 function changeScope(patch:{filterClassId?:string;showArchived?:boolean;search?:string}){
  const next:MasterScope={classId:patch.filterClassId!==undefined?patch.filterClassId:effectiveFilter,showArchived:patch.showArchived!==undefined?patch.showArchived:showArchived,q:normalizeQuery(patch.search!==undefined?patch.search:search)};
  scopeRef.current=next;
  if(patch.filterClassId!==undefined)setFilterClassId(patch.filterClassId);
  if(patch.showArchived!==undefined)setShowArchived(patch.showArchived);
  if(patch.search!==undefined)setSearch(patch.search);
  if(resultsFor&&!matchesMasterScope(resultsFor,next))clearDetail({restoreFocus:false});
 }
 // Authoritative assignment mutation (setStatus / setMaxAttempts / archive / restore): replace the row, and if the
 // returned assignment no longer belongs to the master scope, drop a detail that pointed at it (never focusing a
 // detached opener; a stable workspace target is focused only if focus was actually lost with the row).
 function reconcileMutated(updated:Item){
  setItems(x=>x.map(y=>y.assignmentId===updated.assignmentId?updated:y));
  if(matchesMasterScope(updated,scopeRef.current)){setResultsFor(prev=>prev&&prev.assignmentId===updated.assignmentId?updated:prev);return}
  if(resultsFor?.assignmentId===updated.assignmentId)clearDetail({restoreFocus:false});
  focusWorkspacePending.current=true;
 }
 useEffect(()=>{
  if(!focusWorkspacePending.current)return;
  focusWorkspacePending.current=false;
  const el=document.activeElement;
  if(!el||el===document.body||!el.isConnected)toolbarRef.current?.focus();
 });
 async function loadItemAnalysis(item=resultsFor){if(!item)return;setAnalysisBusy(true);setError("");try{const r=await api<ItemAnalysis>("/api/assignment-item-analysis?assignmentId="+encodeURIComponent(item.assignmentId));setAnalysis(r)}catch(e){setError(e instanceof Error?e.message:"تعذر تحميل تحليل الأسئلة.")}finally{setAnalysisBusy(false)}}
 // Merge an authoritative lifecycle snapshot (returned by every mutating action) into the student's row
 // so the UI never guesses (B2B #2/#20). Only defined fields are applied.
 function mergeSnap(studentId:string,snap:LifecycleSnap){setResults(x=>x.map(y=>y.studentId===studentId?{...y,...snap}:y))}
 async function grantAttempt(s:StudentResult){
  if(!resultsFor)return;
  if(!(await confirm({message:"سيتم السماح للطالب بمحاولة إضافية دون حذف المحاولات السابقة.",title:"منح محاولة إضافية",confirmLabel:"منح المحاولة"})))return;
  setBusy(true);setError("");
  try{const r=await api<LifecycleSnap>("/api/assignment-results",{method:"POST",body:JSON.stringify({action:"allowRetry",assignmentId:resultsFor.assignmentId,studentId:s.studentId})});mergeSnap(s.studentId,r);setNotice("✓ تم منح محاولة إضافية للطالب "+s.studentName)}catch(e){setError(e instanceof Error?e.message:"تعذر منح المحاولة.")}finally{setBusy(false)}
 }
 // Prefill only from an EXISTING per-student override; never from the original dueAt (that value equals
 // the global due and would fail the "must be after the original due" rule if submitted as-is). While the
 // assignment is still open reopenUntil is optional, so a blank default is safe.
 function openReopen(s:StudentResult){setError("");setExtendFor(null);setDeadlineFor(null);setReopenFor(s.studentId);setReopenValue(s.dueAtOverride?toLocalInput(s.dueAtOverride):"")}
 async function saveReopen(s:StudentResult){
  if(!resultsFor)return;
  if(!(await confirm({message:"إعادة فتح الواجب لهذا الطالب: تُتاح له محاولة واحدة إذا لزم دون حذف نتيجته السابقة، ولن تبدأ المحاولة تلقائيًا.",title:"إعادة فتح للطالب",confirmLabel:"إعادة الفتح"})))return;
  setBusy(true);setError("");
  try{const body:{action:string;assignmentId:string;studentId:string;reopenUntil?:string}={action:"reopenStudent",assignmentId:resultsFor.assignmentId,studentId:s.studentId};if(reopenValue)body.reopenUntil=new Date(reopenValue).toISOString();const r=await api<LifecycleSnap>("/api/assignment-results",{method:"POST",body:JSON.stringify(body)});mergeSnap(s.studentId,r);setReopenFor(null);setNotice("✓ تم إعادة فتح الواجب للطالب "+s.studentName)}catch(e){setError(e instanceof Error?e.message:"تعذر إعادة فتح الواجب.")}finally{setBusy(false)}
 }
 function openExtend(s:StudentResult){setError("");setReopenFor(null);setDeadlineFor(null);setExtendFor(s.studentId);const cur=s.activeAttempt?.extendedEndsAt||s.attemptDurationEndsAt||s.activeAttempt?.endsAt||"";setExtendValue(cur?toLocalInput(cur):"")}
 async function saveExtend(s:StudentResult){
  if(!resultsFor||!extendValue)return;
  if(!(await confirm({message:"سيتم تمديد وقت هذه المحاولة النشطة فقط دون إعادة ضبط العدّاد أو تغيير بدايتها.",title:"تمديد وقت المحاولة",confirmLabel:"تمديد"})))return;
  setBusy(true);setError("");
  try{const r=await api<LifecycleSnap>("/api/assignment-results",{method:"POST",body:JSON.stringify({action:"extendActiveAttempt",assignmentId:resultsFor.assignmentId,studentId:s.studentId,newEndsAt:new Date(extendValue).toISOString()})});mergeSnap(s.studentId,r);setExtendFor(null);setNotice("✓ تم تمديد وقت المحاولة للطالب "+s.studentName)}catch(e){setError(e instanceof Error?e.message:"تعذر تمديد وقت المحاولة.")}finally{setBusy(false)}
 }
 function openDeadline(s:StudentResult){setError("");setReopenFor(null);setExtendFor(null);setDeadlineFor(s.studentId);setDeadlineValue(s.dueAtOverride?toLocalInput(s.dueAtOverride):"")}
 async function saveDeadline(s:StudentResult){if(!resultsFor||!deadlineValue)return;setBusy(true);setError("");try{const r=await api<LifecycleSnap&{dueAtOverride:string|null}>("/api/assignment-results",{method:"POST",body:JSON.stringify({action:"setDueAtOverride",assignmentId:resultsFor.assignmentId,studentId:s.studentId,dueAtOverride:new Date(deadlineValue).toISOString()})});mergeSnap(s.studentId,r);setDeadlineFor(null);setNotice("✓ تم تمديد الموعد للطالب "+s.studentName)}catch(e){setError(e instanceof Error?e.message:"تعذر حفظ التمديد.")}finally{setBusy(false)}}
 async function clearDeadline(s:StudentResult){if(!resultsFor)return;setBusy(true);setError("");try{const r=await api<LifecycleSnap&{dueAtOverride:string|null}>("/api/assignment-results",{method:"POST",body:JSON.stringify({action:"setDueAtOverride",assignmentId:resultsFor.assignmentId,studentId:s.studentId,dueAtOverride:null})});mergeSnap(s.studentId,r);setDeadlineFor(null);setNotice("✓ تم إلغاء تمديد الطالب "+s.studentName)}catch(e){setError(e instanceof Error?e.message:"تعذر إلغاء التمديد.")}finally{setBusy(false)}}
 // Review opens above the NON-MODAL detail; row-editor dialogs and the pending confirm never stay open beneath it.
 function openReview(s:StudentResult){if(!s.latestResult)return;setDeadlineFor(null);setReopenFor(null);setExtendFor(null);setAttemptsFor(null);setPurgeFor(null);cancelPending();setReview({studentId:s.studentId,attemptNumber:s.latestResult.attemptNumber})}

 const masterScope:MasterScope={classId:effectiveFilter,showArchived,q:normalizeQuery(search)};
 useEffect(()=>{scopeRef.current=masterScope});
 const archivedCount=items.filter(x=>matchesMasterScope(x,{classId:effectiveFilter,showArchived:true,q:""})).length;
 const scoped=items.filter(x=>matchesMasterScope(x,{...masterScope,q:""}));
 const visible=items.filter(x=>matchesMasterScope(x,masterScope));
 const sourceCount=examQuestionCount(sourceExam);
 const sortedQuestions=useMemo(()=>{
  if(!analysis)return [];
  if(analysisSort==="number")return [...analysis.questions].sort((a,b)=>a.number-b.number);
  const withData=analysis.questions.filter(q=>q.averagePercentage!==null),withoutData=analysis.questions.filter(q=>q.averagePercentage===null);
  withData.sort((a,b)=>analysisSort==="hardest"?(a.averagePercentage as number)-(b.averagePercentage as number):(b.averagePercentage as number)-(a.averagePercentage as number));
  return [...withData,...withoutData];
 },[analysis,analysisSort]);
 const analysisSummary=useMemo(()=>{
  if(!analysis)return null;
  const withPct=analysis.questions.filter(q=>q.averagePercentage!==null);
  if(!withPct.length)return {overallAverage:null as number|null,hardest:null as QuestionStat|null,easiest:null as QuestionStat|null};
  const overallAverage=Math.round(withPct.reduce((sum,q)=>sum+(q.averagePercentage as number),0)/withPct.length*10)/10;
  const hardest=withPct.reduce((a,b)=>(a.averagePercentage as number)<=(b.averagePercentage as number)?a:b);
  const easiest=withPct.reduce((a,b)=>(a.averagePercentage as number)>=(b.averagePercentage as number)?a:b);
  return {overallAverage,hardest,easiest};
 },[analysis]);
 // Roadmap #13 — gradebook rows after client-side search (name/code) + filter (grading/active) + sort.
 const visibleResults=useMemo(()=>{
  const q=gbSearch.trim().toLowerCase();
  let rows=results.filter(s=>!q||String(s.studentName||"").toLowerCase().includes(q)||String(s.studentCode||"").toLowerCase().includes(q));
  rows=rows.filter(s=>{
   if(gbFilter==="all")return true;
   if(gbFilter==="active")return !!s.activeAttempt;               // currently attempting (independent of grading)
   return rowGrading(s)===gbFilter;                                // pendingReview | final | notSubmitted
  });
  const pct=(s:StudentResult)=>s.latestResult?Number(s.latestResult.percentage||0):null;
  const byName=(a:StudentResult,b:StudentResult)=>String(a.studentName).localeCompare(String(b.studentName),"ar");
  const sorted=[...rows];
  if(gbSort==="name")sorted.sort(byName);
  else if(gbSort==="pendingFirst")sorted.sort((a,b)=>{const ap=rowGrading(a)==="pendingReview"?0:1,bp=rowGrading(b)==="pendingReview"?0:1;return ap!==bp?ap-bp:byName(a,b)});
  else sorted.sort((a,b)=>{const av=pct(a),bv=pct(b);if(av===null&&bv===null)return byName(a,b);if(av===null)return 1;if(bv===null)return -1;return gbSort==="highest"?bv-av:av-bv});
  return sorted;
 },[results,gbSearch,gbFilter,gbSort]);
 const deadlineStudent=results.find(x=>x.studentId===deadlineFor)||null,reopenStudent=results.find(x=>x.studentId===reopenFor)||null,extendStudent=results.find(x=>x.studentId===extendFor)||null;
 const extendEffDue=extendStudent?(extendStudent.dueAtOverride||resultsFor?.dueAt||""):"";
 const willClip=!!(extendValue&&extendEffDue&&new Date(extendValue).getTime()>new Date(extendEffDue).getTime());
 const canCreate=!busy&&!examLoading&&!!classId&&!!title.trim()&&!!sourceExam&&sourceCount>0;
 const showDetailArea=mode==="composer"||resultsFor!==null;

 return <section className="assignments-panel eb-assignments">
  <div className="eb-assign-toolbar" role="region" aria-label="أدوات الواجبات" ref={toolbarRef} tabIndex={-1}>
   <div className="eb-assign-filters">
    <label className="eb-field-inline">الصف<select value={effectiveFilter} onChange={e=>changeScope({filterClassId:e.target.value})}><option value="">كل الصفوف</option>{active.map(c=><option value={c.classId} key={c.classId}>{c.name}{c.grade?" · "+c.grade:""}</option>)}</select></label>
    <div className="eb-segmented" role="group" aria-label="عرض الواجبات">
     <button type="button" aria-pressed={!showArchived} onClick={()=>changeScope({showArchived:false})}>الواجبات الحالية</button>
     <button type="button" aria-pressed={showArchived} onClick={()=>changeScope({showArchived:true})}>المؤرشفة{archivedCount?" ("+archivedCount+")":""}</button>
    </div>
    <label className="eb-field-inline eb-assign-search">بحث<input type="search" value={search} onChange={e=>changeScope({search:e.target.value})} placeholder="بحث بعنوان الواجب أو الصف"/></label>
   </div>
   <div className="eb-assign-actions">
    <button type="button" className="eb-button is-primary" onClick={openComposer} disabled={mode==="composer"}><IconPlus size={16}/>إنشاء واجب</button>
    <ActionMenu label="المزيد من إجراءات الواجبات">
     <button type="button" className="eb-menu-item" onClick={()=>{void load();void loadSavedExams()}} disabled={loading||examLoading}><IconRefresh size={16}/>تحديث</button>
    </ActionMenu>
   </div>
  </div>
  {error&&<div className="platform-error assignment-inline-message" role="alert">{error}</div>}{notice&&<div className="platform-notice assignment-inline-message" role="status" aria-live="polite">{notice}</div>}

  <div className={"eb-assign-layout"+(showDetailArea?" has-detail":"")}>
   <AssignmentList items={visible} showArchived={showArchived} hasAnyInScope={scoped.length>0} selectedId={mode==="list"&&resultsFor?resultsFor.assignmentId:""} busy={busy} loading={loading}
    onOpen={(item,trigger)=>void loadResults(item,trigger)} onPublish={item=>void action(item,{action:"setStatus",status:"published"})} onUnpublish={item=>void action(item,{action:"setStatus",status:"draft"})}
    onEditAttempts={setAttemptsFor} onEditTiming={setTimingFor} onArchive={item=>void archiveItem(item)} onRestore={item=>void restoreItem(item)} onPurge={item=>void openPurge(item)} onCreate={openComposer} fmt={fmt}/>
   {mode==="composer"&&<AssignmentComposer headingRef={composerHeadingRef} onClose={closeComposer} busy={busy} examLoading={examLoading}
    sourceMode={sourceMode} onSourceMode={m=>void switchSourceMode(m)} sourceExam={sourceExam} sourceCount={sourceCount} currentExam={current} hasCurrent={!!(current&&examHasQuestions(current))}
    savedExams={savedExams} examSource={examSource} onChooseExam={v=>void chooseExam(v)}
    libraryLoading={libraryLoading} libraryItems={libraryFiltered} libraryCategories={libraryCats} librarySearch={librarySearch} onLibrarySearch={setLibrarySearch} libraryCategory={libraryCategory} onLibraryCategory={setLibraryCategory}
    librarySelectedId={librarySelectedId} onChooseLibraryItem={it=>void chooseLibraryItem(it)} onPreview={it=>void openPreview(it)} previewBusyId={previewBusyId} onCopyToBuilder={onCopyLibraryExamToBuilder?(it=>void copyLibraryItem(it)):undefined} copyBusyId={copyBusyId}
    activeClasses={active} classId={classId} onClassId={setClassId} title={title} onTitle={setTitle} instructions={instructions} onInstructions={setInstructions} openAt={openAt} onOpenAt={setOpenAt} dueAt={dueAt} onDueAt={setDueAt}
    maxAttempts={maxAttempts} onMaxAttempts={setMaxAttempts} durationMinutes={durationMinutes} onDurationMinutes={setDurationMinutes} attemptPolicy={attemptPolicy} onAttemptPolicy={setAttemptPolicy} publish={publish} onPublish={setPublish} canCreate={canCreate} onCreate={()=>void create()}/>}
   {mode==="list"&&resultsFor&&<AssignmentDetail item={resultsFor} stats={stats} loading={busy} headingRef={detailHeadingRef} onClose={closeDetail}
    analysis={analysis} analysisBusy={analysisBusy} analysisSort={analysisSort} onAnalysisSort={setAnalysisSort} onToggleAnalysis={()=>{if(analysis)setAnalysis(null);else void loadItemAnalysis()}} sortedQuestions={sortedQuestions} analysisSummary={analysisSummary} fmt={fmt}>
    <Gradebook assignment={resultsFor} rows={visibleResults} totalRows={results.length} gradingOf={rowGrading} busy={busy}
     search={gbSearch} onSearch={setGbSearch} filter={gbFilter} onFilter={setGbFilter} sort={gbSort} onSort={setGbSort}
     onReview={openReview} onGrant={s=>void grantAttempt(s)} onReopen={openReopen} onExtend={openExtend} onDeadline={openDeadline} fmt={fmt}/>
   </AssignmentDetail>}
  </div>

  <MaxAttemptsDialog item={attemptsFor} busy={busy} onSave={(item,value)=>void saveMaxAttempts(item,value)} onClose={()=>setAttemptsFor(null)}/>
  <AssignmentTimingDialog item={timingFor} busy={busy} onSave={(item,dueAtIso,durationMinutes)=>void saveTiming(item,dueAtIso,durationMinutes)} onClose={()=>setTimingFor(null)} fmt={fmt}/>
  <DeadlineDialog student={deadlineStudent} assignment={resultsFor} busy={busy} value={deadlineValue} onValue={setDeadlineValue} onClose={()=>setDeadlineFor(null)} onSave={s=>void saveDeadline(s)} onClear={s=>void clearDeadline(s)} fmt={fmt}/>
  <ReopenDialog student={reopenStudent} assignment={resultsFor} busy={busy} value={reopenValue} onValue={setReopenValue} onClose={()=>setReopenFor(null)} onSave={s=>void saveReopen(s)} fmt={fmt}/>
  <ExtendDialog student={extendStudent} assignment={resultsFor} busy={busy} value={extendValue} onValue={setExtendValue} onClose={()=>setExtendFor(null)} onSave={s=>void saveExtend(s)} willClip={willClip} fmt={fmt}/>
  <PurgeDialog item={purgeFor} title={purgeTitle} onTitle={setPurgeTitle} busy={busy} onConfirm={()=>void confirmPurge()} onClose={()=>{if(!busy)setPurgeFor(null)}}/>
  {confirmDialog}
  {review&&resultsFor&&<AssignmentReview token={token} assignmentId={resultsFor.assignmentId} studentId={review.studentId} initialAttempt={review.attemptNumber} onClose={()=>setReview(null)} onSaved={()=>void loadResults(resultsFor)}/>}
  {preview&&createPortal(<ExamPreview exam={preview.exam} onClose={()=>setPreview(null)}/>,document.body)}
 </section>;
}
