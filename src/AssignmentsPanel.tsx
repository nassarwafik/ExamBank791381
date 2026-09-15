import {useEffect,useMemo,useState,Fragment} from "react";
import {withTrackingCode} from "./lib/requestTrace";
import AssignmentReview from "./AssignmentReview";
import {createPortal} from "react-dom";
import ExamPreview from "./ExamPreview";
import {IconPlus,IconChevronDown} from "./icons";
import {filterLibraryCatalog,catalogCategories,categoryLabel,type LibraryCatalogItem} from "./examLibrary";
import {examHasQuestions,examQuestionCount} from "./examTypes";
import {gradingClass,resolveGradingStatus,type GradingStatus} from "./gradingStatus";

type Classroom={classId:string;name:string;grade:string;active:boolean};
type Item={assignmentId:string;classId:string;className:string;title:string;instructions:string;status:"draft"|"published"|"archived";openAt:string;dueAt:string;questionCount:number;totalMarks:number;maxAttempts:number;durationMinutes?:number;archivedAt?:string;archivedBy?:string;archivedFromStatus?:string;archiveReason?:string};
// Read-only deletion impact (Roadmap #7) returned by action:"deleteImpact".
type Impact={assignmentId:string;status:string;submissionDocuments:number;studentsWithCompletedAttempts:number;completedAttempts:number;activeAttempts:number;draftDocuments:number;canPurge:boolean};
type Exam={examId?:string;title?:string;totalMarks?:number;questions?:unknown[];sections?:unknown[]};
type SavedExam={blobName:string;examId:string;title:string;savedAt:string;questionCount:number;totalMarks:number};
type Attempt={attemptNumber:number;score:number;totalMarks:number;percentage:number;submittedAt:string;finalized:boolean;manualReviewMarks:number;gradingStatus?:GradingStatus;startedAt?:string;endedAt?:string;endReason?:string;timedOut?:boolean};
type ActiveAttempt={attemptNumber:number;startedAt:string;endsAt:string;extendedEndsAt?:string;status?:string;lastSavedAt?:string};
type StudentResult={studentId:string;studentName:string;studentCode:string;attemptsUsed:number;allowedAttempts:number;dueAtOverride:string|null;attemptStatus?:string;gradingStatus?:GradingStatus;activeAttempt?:ActiveAttempt|null;effectiveAttemptEndsAt?:string;attemptDurationEndsAt?:string;attemptExpired?:boolean;canStartAttempt?:boolean;canWrite?:boolean;timed?:boolean;durationMinutes?:number;attempts:Attempt[];latestResult:Attempt|null};
// Server-authoritative grading status for a student's LATEST result; fall back to the same inputs the
// server uses (never inferred from percentage). "notSubmitted" when there is no completed attempt.
// Row-level server gradingStatus wins; otherwise the SHARED resolver derives it from the latest result's
// manualReviewMarks/finalized (never from score). No local copy of the rule.
const rowGrading=(s:StudentResult):GradingStatus=>s.gradingStatus?s.gradingStatus:resolveGradingStatus(s.latestResult);
// The authoritative lifecycle snapshot every mutating teacher action returns (B2B #18) — merged into the row.
type LifecycleSnap=Partial<StudentResult>;
// Lightweight lifecycle labels for the gradebook (B2A #22): لم يبدأ / قيد المحاولة / مسودة / تم التسليم / انتهى الوقت.
const LIFECYCLE_LABEL:Record<string,string>={notStarted:"لم يبدأ",started:"قيد المحاولة",draft:"مسودة",submitted:"تم التسليم",timedOut:"انتهى الوقت"};
type Stats={students:number;submitted:number;pendingReview:number;finalized?:number;notSubmitted?:number;active?:number;average:number|null;highest:number|null;lowest:number|null};
type GradebookFilter="all"|"pendingReview"|"final"|"notSubmitted"|"active";
type GradebookSort="name"|"pendingFirst"|"highest"|"lowest";
type QuestionStat={questionId:string;number:number;text:string;type:string;maxMarks:number;studentsAnalyzed:number;correctCount:number;correctRate:number|null;averageScore:number|null;averagePercentage:number|null;manualReviewCount:number;difficulty:"easy"|"medium"|"hard"|null};
type ItemAnalysis={assignmentId:string;title:string;studentsInClass:number;studentsSubmitted:number;attemptsAnalyzed:number;questions:QuestionStat[]};
type Props={token:string;classes:Classroom[];currentExam:unknown|null;onCopyLibraryExamToBuilder?:(examSnapshot:Exam,title:string)=>void};

const localDate=(h:number)=>{const d=new Date(Date.now()+h*3600000);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)};
const toLocalInput=(iso:string)=>{if(!iso)return "";const d=new Date(iso);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)};
const fmt=(v:string)=>v?new Date(v).toLocaleString("ar"):"بدون موعد";

export default function AssignmentsPanel({token,classes,currentExam,onCopyLibraryExamToBuilder}:Props){
 const current=currentExam&&typeof currentExam==="object"?currentExam as Exam:null;
 const [items,setItems]=useState<Item[]>([]),[classId,setClassId]=useState(""),[title,setTitle]=useState(""),[instructions,setInstructions]=useState("أجب عن جميع الأسئلة واقرأ التعليمات جيدًا قبل البدء."),[openAt,setOpenAt]=useState(localDate(0)),[dueAt,setDueAt]=useState(localDate(72)),[maxAttempts,setMaxAttempts]=useState(1),[durationMinutes,setDurationMinutes]=useState(0),[publish,setPublish]=useState(true),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState(""),[resultsFor,setResultsFor]=useState<Item|null>(null),[results,setResults]=useState<StudentResult[]>([]),[stats,setStats]=useState<Stats|null>(null),[review,setReview]=useState<{studentId:string;attemptNumber:number}|null>(null);
 const [deadlineFor,setDeadlineFor]=useState<string|null>(null),[deadlineValue,setDeadlineValue]=useState("");
 const [reopenFor,setReopenFor]=useState<string|null>(null),[reopenValue,setReopenValue]=useState("");
 const [extendFor,setExtendFor]=useState<string|null>(null),[extendValue,setExtendValue]=useState("");
 const [showArchived,setShowArchived]=useState(false),[purgeFor,setPurgeFor]=useState<Item|null>(null),[purgeTitle,setPurgeTitle]=useState("");
 const [analysis,setAnalysis]=useState<ItemAnalysis|null>(null),[analysisBusy,setAnalysisBusy]=useState(false),[analysisSort,setAnalysisSort]=useState<"number"|"hardest"|"easiest">("number");
 // Roadmap #13 — gradebook search/filter/sort (client-side over the already-loaded results; no request per keystroke).
 const [gbSearch,setGbSearch]=useState(""),[gbFilter,setGbFilter]=useState<GradebookFilter>("all"),[gbSort,setGbSort]=useState<GradebookSort>("name");
 const [savedExams,setSavedExams]=useState<SavedExam[]>([]),[examSource,setExamSource]=useState(current?"current":""),[savedExam,setSavedExam]=useState<Exam|null>(null),[examLoading,setExamLoading]=useState(false);
 const [sourceMode,setSourceMode]=useState<"mine"|"library">("mine");
 const [libraryCatalog,setLibraryCatalog]=useState<LibraryCatalogItem[]>([]),[libraryLoading,setLibraryLoading]=useState(false),[librarySearch,setLibrarySearch]=useState(""),[libraryCategory,setLibraryCategory]=useState(""),[librarySelectedId,setLibrarySelectedId]=useState(""),[libraryExam,setLibraryExam]=useState<Exam|null>(null);
 const [preview,setPreview]=useState<{title:string;exam:Exam}|null>(null),[previewBusyId,setPreviewBusyId]=useState(""),[copyBusyId,setCopyBusyId]=useState("");
 const active=useMemo(()=>classes.filter(x=>x.active),[classes]);
 const sourceExam=sourceMode==="library"?libraryExam:(examSource==="current"?current:savedExam);
 useEffect(()=>{if(!classId&&active[0])setClassId(active[0].classId)},[active,classId]);
 useEffect(()=>{if(current&&examSource===""&&examHasQuestions(current))setExamSource("current")},[current,examSource]);

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

 async function switchSourceMode(mode:"mine"|"library"){
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

 async function create(){
  if(busy||!classId||!title.trim()||!sourceExam||!examHasQuestions(sourceExam))return;
  setBusy(true);setError("");setNotice("");
  try{
   const r=await api<{assignment:Item}>("/api/assignments",{method:"POST",body:JSON.stringify({action:"create",classId,title:title.trim(),instructions:instructions.trim(),openAt:openAt?new Date(openAt).toISOString():"",dueAt:dueAt?new Date(dueAt).toISOString():"",maxAttempts,durationMinutes,publish,examSnapshot:sourceExam})});
   setItems(x=>[r.assignment,...x]);setNotice("✓ تم إنشاء الواجب من الامتحان المختار.");
  }catch(e){setError(e instanceof Error?e.message:"تعذر إنشاء الواجب.")}finally{setBusy(false)}
 }
 async function action(item:Item,body:any){setBusy(true);try{const r=await api<{assignment:Item}>("/api/assignments",{method:"POST",body:JSON.stringify({assignmentId:item.assignmentId,...body})});setItems(x=>x.map(y=>y.assignmentId===item.assignmentId?r.assignment:y))}catch(e){setError(e instanceof Error?e.message:"تعذر تنفيذ العملية.")}finally{setBusy(false)}}
 // Roadmap #7 — archive-first deletion. The normal destructive action ARCHIVES (never physically deletes)
 // and always checks authoritative impact first so an active-attempt archive is confirmed explicitly.
 async function fetchImpact(item:Item):Promise<Impact|null>{try{const r=await api<{impact:Impact}>("/api/assignments",{method:"POST",body:JSON.stringify({action:"deleteImpact",assignmentId:item.assignmentId})});return r.impact}catch(e){setError(e instanceof Error?e.message:"تعذر حساب أثر العملية.");return null}}
 async function archiveItem(item:Item){
  setBusy(true);setError("");setNotice("");
  try{
   const impact=await fetchImpact(item);if(!impact)return;
   let confirmActive=false;
   if(impact.activeAttempts>0){
    if(!window.confirm("يوجد "+impact.activeAttempts+" طلاب في محاولات نشطة. أرشفة الواجب ستمنعهم من المتابعة حتى تتم استعادته. لن تُحذف إجاباتهم أو محاولاتهم."))return;
    confirmActive=true;
   }else if(!window.confirm("سيتم إخفاء الواجب عن الطلاب مع الاحتفاظ بجميع التسليمات والنتائج. يمكنك استعادته لاحقًا."))return;
   const r=await api<{assignment:Item}>("/api/assignments",{method:"POST",body:JSON.stringify({action:"archive",assignmentId:item.assignmentId,...(confirmActive?{confirmActiveAttempts:true}:{})})});
   setItems(x=>x.map(y=>y.assignmentId===item.assignmentId?r.assignment:y));
   // If this assignment's gradebook is open, refresh its authoritative status so B2B controls hide at once.
   setResultsFor(prev=>prev&&prev.assignmentId===item.assignmentId?r.assignment:prev);
   if(resultsFor?.assignmentId===item.assignmentId){setDeadlineFor(null);setReopenFor(null);setExtendFor(null)}
   setNotice("✓ تم أرشفة الواجب «"+item.title+"».");
  }catch(e){setError(e instanceof Error?e.message:"تعذر أرشفة الواجب.")}finally{setBusy(false)}
 }
 async function restoreItem(item:Item){setBusy(true);setError("");setNotice("");try{const r=await api<{assignment:Item}>("/api/assignments",{method:"POST",body:JSON.stringify({action:"restore",assignmentId:item.assignmentId})});setItems(x=>x.map(y=>y.assignmentId===item.assignmentId?r.assignment:y));setResultsFor(prev=>prev&&prev.assignmentId===item.assignmentId?r.assignment:prev);setNotice("✓ تم استعادة الواجب «"+item.title+"».")}catch(e){setError(e instanceof Error?e.message:"تعذر استعادة الواجب.")}finally{setBusy(false)}}
 // Permanent purge — impact-gated. History present => never even offer purge; zero history => modal that
 // requires typing the exact title before POSTing action:"purge".
 async function openPurge(item:Item){setError("");setNotice("");setBusy(true);try{const impact=await fetchImpact(item);if(!impact)return;if(impact.submissionDocuments>0){setError("لا يمكن الحذف النهائي لأن للواجب بيانات طلاب محفوظة. اترك الواجب في الأرشيف للحفاظ على السجل.");return}setPurgeFor(item);setPurgeTitle("")}finally{setBusy(false)}}
 async function confirmPurge(){if(!purgeFor)return;const item=purgeFor;setBusy(true);setError("");try{const r=await api<{purged?:boolean}>("/api/assignments",{method:"POST",body:JSON.stringify({action:"purge",assignmentId:item.assignmentId,confirmAssignmentId:item.assignmentId,confirmTitle:purgeTitle})});if(r.purged){setItems(x=>x.filter(y=>y.assignmentId!==item.assignmentId));if(resultsFor?.assignmentId===item.assignmentId){setResultsFor(null);setResults([]);setStats(null)}setPurgeFor(null);setNotice("✓ تم حذف الواجب نهائيًا.")}}catch(e){setError(e instanceof Error?e.message:"تعذر الحذف النهائي.")}finally{setBusy(false)}}
 async function loadResults(item=resultsFor){if(!item)return;setBusy(true);setDeadlineFor(null);setReopenFor(null);setExtendFor(null);setAnalysis(null);try{const r=await api<{students:StudentResult[];stats:Stats}>("/api/assignment-results?assignmentId="+encodeURIComponent(item.assignmentId));setResultsFor(item);setResults(r.students||[]);setStats(r.stats||null)}catch(e){setError(e instanceof Error?e.message:"تعذر تحميل النتائج.")}finally{setBusy(false)}}
 async function loadItemAnalysis(item=resultsFor){if(!item)return;setAnalysisBusy(true);setError("");try{const r=await api<ItemAnalysis>("/api/assignment-item-analysis?assignmentId="+encodeURIComponent(item.assignmentId));setAnalysis(r)}catch(e){setError(e instanceof Error?e.message:"تعذر تحميل تحليل الأسئلة.")}finally{setAnalysisBusy(false)}}
 // Merge an authoritative lifecycle snapshot (returned by every mutating action) into the student's row
 // so the UI never guesses (B2B #2/#20). Only defined fields are applied.
 function mergeSnap(studentId:string,snap:LifecycleSnap){setResults(x=>x.map(y=>y.studentId===studentId?{...y,...snap}:y))}
 async function grantAttempt(s:StudentResult){
  if(!resultsFor)return;
  if(!window.confirm("سيتم السماح للطالب بمحاولة إضافية دون حذف المحاولات السابقة."))return;
  setBusy(true);setError("");
  try{const r=await api<LifecycleSnap>("/api/assignment-results",{method:"POST",body:JSON.stringify({action:"allowRetry",assignmentId:resultsFor.assignmentId,studentId:s.studentId})});mergeSnap(s.studentId,r);setNotice("✓ تم منح محاولة إضافية للطالب "+s.studentName)}catch(e){setError(e instanceof Error?e.message:"تعذر منح المحاولة.")}finally{setBusy(false)}
 }
 // Prefill only from an EXISTING per-student override; never from the original dueAt (that value equals
// the global due and would fail the "must be after the original due" rule if submitted as-is). While the
// assignment is still open reopenUntil is optional, so a blank default is safe.
 function openReopen(s:StudentResult){setError("");setExtendFor(null);setDeadlineFor(null);setReopenFor(s.studentId);setReopenValue(s.dueAtOverride?toLocalInput(s.dueAtOverride):"")}
 async function saveReopen(s:StudentResult){
  if(!resultsFor)return;
  if(!window.confirm("إعادة فتح الواجب لهذا الطالب: تُتاح له محاولة واحدة إذا لزم دون حذف نتيجته السابقة، ولن تبدأ المحاولة تلقائيًا."))return;
  setBusy(true);setError("");
  try{const body:{action:string;assignmentId:string;studentId:string;reopenUntil?:string}={action:"reopenStudent",assignmentId:resultsFor.assignmentId,studentId:s.studentId};if(reopenValue)body.reopenUntil=new Date(reopenValue).toISOString();const r=await api<LifecycleSnap>("/api/assignment-results",{method:"POST",body:JSON.stringify(body)});mergeSnap(s.studentId,r);setReopenFor(null);setNotice("✓ تم إعادة فتح الواجب للطالب "+s.studentName)}catch(e){setError(e instanceof Error?e.message:"تعذر إعادة فتح الواجب.")}finally{setBusy(false)}
 }
 function openExtend(s:StudentResult){setError("");setReopenFor(null);setDeadlineFor(null);setExtendFor(s.studentId);const cur=s.activeAttempt?.extendedEndsAt||s.attemptDurationEndsAt||s.activeAttempt?.endsAt||"";setExtendValue(cur?toLocalInput(cur):"")}
 async function saveExtend(s:StudentResult){
  if(!resultsFor||!extendValue)return;
  if(!window.confirm("سيتم تمديد وقت هذه المحاولة النشطة فقط دون إعادة ضبط العدّاد أو تغيير بدايتها."))return;
  setBusy(true);setError("");
  try{const r=await api<LifecycleSnap>("/api/assignment-results",{method:"POST",body:JSON.stringify({action:"extendActiveAttempt",assignmentId:resultsFor.assignmentId,studentId:s.studentId,newEndsAt:new Date(extendValue).toISOString()})});mergeSnap(s.studentId,r);setExtendFor(null);setNotice("✓ تم تمديد وقت المحاولة للطالب "+s.studentName)}catch(e){setError(e instanceof Error?e.message:"تعذر تمديد وقت المحاولة.")}finally{setBusy(false)}
 }
 function openDeadline(s:StudentResult){setError("");setDeadlineFor(s.studentId);setDeadlineValue(s.dueAtOverride?toLocalInput(s.dueAtOverride):"")}
 async function saveDeadline(s:StudentResult){if(!resultsFor||!deadlineValue)return;setBusy(true);setError("");try{const r=await api<LifecycleSnap&{dueAtOverride:string|null}>("/api/assignment-results",{method:"POST",body:JSON.stringify({action:"setDueAtOverride",assignmentId:resultsFor.assignmentId,studentId:s.studentId,dueAtOverride:new Date(deadlineValue).toISOString()})});mergeSnap(s.studentId,r);setDeadlineFor(null);setNotice("✓ تم تمديد الموعد للطالب "+s.studentName)}catch(e){setError(e instanceof Error?e.message:"تعذر حفظ التمديد.")}finally{setBusy(false)}}
 async function clearDeadline(s:StudentResult){if(!resultsFor)return;setBusy(true);setError("");try{const r=await api<LifecycleSnap&{dueAtOverride:string|null}>("/api/assignment-results",{method:"POST",body:JSON.stringify({action:"setDueAtOverride",assignmentId:resultsFor.assignmentId,studentId:s.studentId,dueAtOverride:null})});mergeSnap(s.studentId,r);setDeadlineFor(null);setNotice("✓ تم إلغاء تمديد الطالب "+s.studentName)}catch(e){setError(e instanceof Error?e.message:"تعذر إلغاء التمديد.")}finally{setBusy(false)}}
 const inClass=classId?items.filter(x=>x.classId===classId):items;
 const archivedCount=inClass.filter(x=>x.status==="archived").length;
 const visible=inClass.filter(x=>showArchived?x.status==="archived":x.status!=="archived");
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

 return <section className="assignments-panel platform-card">
  <div className="assignments-heading"><div><span className="platform-eyebrow">Assignments · Phase 2.0E</span><h3>الواجبات، التصحيح وسجل العلامات</h3><p>اختر امتحانًا محفوظًا ثم حوّله إلى واجب للصف.</p></div><button onClick={()=>{void load();void loadSavedExams()}} disabled={loading||examLoading}>↻ تحديث</button></div>
  {error&&<div className="platform-error assignment-inline-message">{error}</div>}{notice&&<div className="platform-notice assignment-inline-message">{notice}</div>}

  {/* Zone 1: Create Assignment — collapsible, open by default only while the class has no assignments yet */}
  <details className="assignment-zone assignment-create-zone" open={items.length===0}>
   <summary><IconPlus size={16}/><span>إنشاء واجب جديد</span><IconChevronDown size={14} className="details-chevron"/></summary>
   <div className="assignment-zone-body">
    <nav className="analytics-view-tabs" role="tablist" aria-label="مصدر محتوى الواجب">
     <button type="button" className={"analytics-view-tab "+(sourceMode==="mine"?"active":"")} onClick={()=>void switchSourceMode("mine")}>🧠 امتحاناتي</button>
     <button type="button" className={"analytics-view-tab "+(sourceMode==="library"?"active":"")} onClick={()=>void switchSourceMode("library")}>📚 مكتبة 791381</button>
    </nav>
    <div className="assignment-source-card">
     <div style={{flex:1}}><span>مصدر الواجب</span><strong>{sourceExam?.title||"لم يتم اختيار محتوى"}</strong><small>{sourceCount?sourceCount+" سؤال":"اختر محتوى الواجب"}</small></div>
     {sourceMode==="mine"&&<div style={{minWidth:"min(100%, 390px)"}}><label>اختيار الامتحان<select value={examSource} onChange={e=>void chooseExam(e.target.value)} disabled={examLoading}>
      <option value="">اختر امتحانًا محفوظًا</option>
      {current&&examHasQuestions(current)&&<option value="current">الامتحان المفتوح حاليًا · {current.title||"بدون عنوان"}</option>}
      {savedExams.map(x=><option key={x.blobName} value={x.blobName}>{x.title} · {x.questionCount} سؤال · {x.totalMarks} علامة</option>)}
     </select></label>{examLoading&&<small>⏳ جارٍ فتح الامتحان...</small>}</div>}
     <div className="assignment-source-marks">{sourceExam?.totalMarks?sourceExam.totalMarks+" علامة":"—"}</div>
    </div>
    {sourceMode==="library"&&<div className="library-picker">
     {libraryLoading?<div className="platform-loading">⏳ جارٍ تحميل مكتبة 791381...</div>:<>
      <div className="library-picker-controls">
       <input className="library-search" value={librarySearch} onChange={e=>setLibrarySearch(e.target.value)} placeholder="ابحث: VLAN، DHCP، Subnet، CIDR..."/>
       <div className="library-cat-chips">
        <button type="button" className={"library-cat-chip "+(libraryCategory===""?"active":"")} onClick={()=>setLibraryCategory("")}>الكل</button>
        {libraryCats.map(code=><button key={code} type="button" className={"library-cat-chip "+(libraryCategory===code?"active":"")} onClick={()=>setLibraryCategory(code)}>{categoryLabel(code)}</button>)}
       </div>
      </div>
      <div className="library-item-list">
       {libraryFiltered.map(it=>{const selected=librarySelectedId===it.libraryItemId;const disabled=!it.publishable;return (
        <div key={it.libraryItemId} className={"library-item"+(selected?" selected":"")+(disabled?" disabled":"")}>
         <button type="button" className="library-item-select" onClick={()=>void chooseLibraryItem(it)} disabled={disabled||examLoading} aria-disabled={disabled}>
          <span className="library-item-code">{it.libraryItemId}</span>
          <span className="library-item-main"><strong>{it.title}</strong><small>{it.questionCount} سؤال · {it.totalMarks} علامة · {categoryLabel(it.category)}</small></span>
          {disabled&&<span className="library-item-badge">يحتاج مراجعة</span>}
         </button>
         <button type="button" className="library-item-preview" onClick={()=>void openPreview(it)} disabled={!!previewBusyId} title="معاينة" aria-label={"معاينة "+it.title}>{previewBusyId===it.libraryItemId?"⏳":"👁"}</button>
         {onCopyLibraryExamToBuilder&&<button type="button" className="library-item-preview" onClick={()=>void copyLibraryItem(it)} disabled={!!copyBusyId} title="نسخ إلى باني الامتحانات" aria-label={"نسخ "+it.title+" إلى الباني"}>{copyBusyId===it.libraryItemId?"⏳":"📝"}</button>}
        </div>
       )})}
       {!libraryFiltered.length&&<div className="platform-empty">لا توجد عناصر مطابقة.</div>}
      </div>
     </>}
    </div>}
    <div className="assignment-create-grid">
     <label>الصف<select value={classId} onChange={e=>setClassId(e.target.value)}><option value="">اختر الصف</option>{active.map(c=><option value={c.classId} key={c.classId}>{c.name}{c.grade?" · "+c.grade:""}</option>)}</select></label>
     <label>عنوان الواجب<input value={title} onChange={e=>setTitle(e.target.value)}/></label>
     <label className="assignment-wide-field">تعليمات<textarea value={instructions} onChange={e=>setInstructions(e.target.value)}/></label>
     <label>يفتح في<input type="datetime-local" value={openAt} onChange={e=>setOpenAt(e.target.value)}/></label>
     <label>آخر موعد<input type="datetime-local" value={dueAt} onChange={e=>setDueAt(e.target.value)}/></label>
     <label>عدد المحاولات<select value={maxAttempts} onChange={e=>setMaxAttempts(Number(e.target.value))}>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
     <label>مدة المحاولة (بالدقائق)<select value={durationMinutes} onChange={e=>setDurationMinutes(Number(e.target.value))}><option value={0}>بدون مؤقت</option>{[15,30,45,60,90,120,180].map(n=><option key={n} value={n}>{n} دقيقة</option>)}</select></label>
     <label className="assignment-publish-toggle"><input type="checkbox" checked={publish} onChange={e=>setPublish(e.target.checked)}/><span>نشر مباشرة</span></label>
    </div>
    <div className="assignment-create-cta-row">
     <button className="platform-primary assignment-create-button" onClick={create} disabled={busy||examLoading||!classId||!title.trim()||!sourceExam||!sourceCount}>📤 إنشاء الواجب</button>
    </div>
   </div>
  </details>

  {/* Zone 2: Current Assignments */}
  <section className="assignment-zone assignment-list-zone">
   <div className="assignment-zone-heading"><div className="assignment-view-tabs" role="tablist"><button type="button" className={"assignment-view-tab "+(!showArchived?"active":"")} onClick={()=>setShowArchived(false)}>الواجبات الحالية</button><button type="button" className={"assignment-view-tab "+(showArchived?"active":"")} onClick={()=>setShowArchived(true)}>المؤرشفة{archivedCount?" ("+archivedCount+")":""}</button></div><span className="assignment-zone-count">{visible.length}</span></div>
   <div className="assignment-list">{visible.map(item=><article className="assignment-row" key={item.assignmentId}><div className="assignment-row-main"><div className="assignment-row-title-line"><strong>{item.title}</strong><span className={"assignment-status "+item.status}>{item.status==="published"?"منشور":item.status==="archived"?"مؤرشف":"مسودة"}</span></div><span>{item.className}{item.className?" · ":""}{item.questionCount} سؤال · {item.totalMarks} علامة · {item.maxAttempts||1} محاولة · {item.durationMinutes?item.durationMinutes+" دقيقة":"بدون مؤقت"}</span><small>التسليم: {fmt(item.dueAt)}{item.status==="archived"&&item.archivedAt?" · أُرشف: "+fmt(item.archivedAt):""}</small></div><div className="assignment-row-actions"><button onClick={()=>void loadResults(item)}>📊 سجل العلامات</button>{item.status==="archived"?<><button onClick={()=>void restoreItem(item)} disabled={busy}>استعادة</button><button className="assignment-delete-button" onClick={()=>void openPurge(item)} disabled={busy}>حذف نهائي</button></>:<>{item.status!=="published"?<button onClick={()=>action(item,{action:"setStatus",status:"published"})}>نشر</button>:<button onClick={()=>action(item,{action:"setStatus",status:"draft"})}>إيقاف النشر</button>}<select value={item.maxAttempts||1} onChange={e=>action(item,{action:"setMaxAttempts",maxAttempts:Number(e.target.value)})}>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n} محاولات</option>)}</select><button className="assignment-delete-button" onClick={()=>void archiveItem(item)} disabled={busy}>أرشفة</button></>}</div></article>)}
   {!visible.length&&<div className="platform-empty">{showArchived?"لا توجد واجبات مؤرشفة.":"لا توجد واجبات بعد."}</div>}
   </div>
  </section>

  {/* Zone 3: Gradebook — visually separated section, opens only when a "سجل العلامات" is selected */}
  {resultsFor&&<section className="assignment-zone assignment-gradebook-zone"><div className="assignments-heading"><div><span className="platform-eyebrow">Gradebook</span><h3>سجل علامات: {resultsFor.title}</h3></div><div className="assignment-row-actions"><button onClick={()=>{if(analysis)setAnalysis(null);else void loadItemAnalysis()}}>📊 تحليل الأسئلة</button><button onClick={()=>{setResultsFor(null);setResults([]);setStats(null);setDeadlineFor(null);setReopenFor(null);setExtendFor(null);setAnalysis(null)}}>إغلاق</button></div></div>{stats&&<div className="gradebook-stats"><article><strong>{stats.submitted}/{stats.students}</strong><span>سلّموا</span></article><article><strong>{stats.average===null?"—":stats.average+"%"}</strong><span>المعدل</span></article><article><strong>{stats.highest===null?"—":stats.highest+"%"}</strong><span>الأعلى</span></article><article><strong>{stats.lowest===null?"—":stats.lowest+"%"}</strong><span>الأدنى</span></article><article className={stats.pendingReview?"warn":""}><strong>{stats.pendingReview}</strong><span>بانتظار التصحيح</span></article><article><strong>{stats.finalized??0}</strong><span>نهائي</span></article><article><strong>{stats.active??0}</strong><span>قيد المحاولة</span></article><article><strong>{stats.notSubmitted??0}</strong><span>لم يسلّم</span></article></div>}
   <div className="gradebook-controls"><input className="gradebook-search" type="search" placeholder="بحث بالاسم أو الكود" value={gbSearch} onChange={e=>setGbSearch(e.target.value)}/><div className="gradebook-filter-row">{([["all","الكل"],["pendingReview","بانتظار التصحيح"],["final","نهائي"],["notSubmitted","لم يسلّم"],["active","قيد المحاولة"]] as [GradebookFilter,string][]).map(([f,lbl])=><button key={f} type="button" className={"gradebook-chip"+(gbFilter===f?" active":"")} onClick={()=>setGbFilter(f)}>{lbl}</button>)}</div><div className="gradebook-sort"><span>ترتيب:</span>{([["name","الاسم"],["pendingFirst","بانتظار التصحيح أولًا"],["highest","العلامة الأعلى"],["lowest","العلامة الأدنى"]] as [GradebookSort,string][]).map(([sv,lbl])=><button key={sv} type="button" className={gbSort===sv?"active":""} onClick={()=>setGbSort(sv)}>{lbl}</button>)}</div></div><div className="students-table-wrap"><table className="students-table"><thead><tr><th>الطالب</th><th>المحاولات</th><th>آخر علامة</th><th>الحالة</th><th>إجراء</th></tr></thead><tbody>{visibleResults.map(s=>{const effDue=s.dueAtOverride||resultsFor.dueAt;const willClip=!!(extendValue&&effDue&&new Date(extendValue).getTime()>new Date(effDue).getTime());return <Fragment key={s.studentId}><tr><td><strong>{s.studentName}</strong><small className="result-code">{s.studentCode}</small>{s.attemptStatus&&<small className={"lifecycle-badge lifecycle-"+s.attemptStatus}>{LIFECYCLE_LABEL[s.attemptStatus]||s.attemptStatus}</small>}{s.activeAttempt?.startedAt&&<small className="lifecycle-started">بدأ: {fmt(s.activeAttempt.startedAt)}</small>}{s.timed&&s.activeAttempt&&s.effectiveAttemptEndsAt&&<small className="lifecycle-ends">ينتهي فعليًا: {fmt(s.effectiveAttemptEndsAt)}</small>}{s.activeAttempt?.extendedEndsAt&&<small className="lifecycle-extended-badge">تم تمديد وقت المحاولة</small>}{s.dueAtOverride&&<small className="deadline-extended-badge">تمديد حتى: {fmt(s.dueAtOverride)}</small>}</td><td>{s.attemptsUsed}/{s.allowedAttempts}</td><td>{s.latestResult?s.latestResult.score+"/"+s.latestResult.totalMarks+" ("+s.latestResult.percentage+"%)":"لم يسلّم"}</td><td>{(()=>{const gs=rowGrading(s);return gs==="notSubmitted"?<span className="review-state none">لم يسلّم</span>:<span className={"review-state "+gradingClass(gs)}>{gs==="final"?"نهائي":"بانتظار التصحيح"+(s.latestResult&&s.latestResult.manualReviewMarks>0?" ("+s.latestResult.manualReviewMarks+" ع.)":"")}</span>})()}</td><td><div className="gradebook-actions">{s.latestResult&&<button className="review-button" onClick={()=>setReview({studentId:s.studentId,attemptNumber:s.latestResult!.attemptNumber})}>{rowGrading(s)==="pendingReview"?"✏️ تصحيح الآن":"عرض / تعديل التصحيح"}</button>}{resultsFor.status!=="archived"&&<><button onClick={()=>void grantAttempt(s)} disabled={busy}>+ منح محاولة إضافية</button><button onClick={()=>reopenFor===s.studentId?setReopenFor(null):openReopen(s)} disabled={busy||!!s.activeAttempt}>إعادة فتح للطالب</button>{s.timed&&s.activeAttempt&&<button onClick={()=>extendFor===s.studentId?setExtendFor(null):openExtend(s)} disabled={busy}>⏱ تمديد وقت المحاولة</button>}<button onClick={()=>deadlineFor===s.studentId?setDeadlineFor(null):openDeadline(s)}>⏰ تمديد الموعد</button></>}</div></td></tr>{resultsFor.status!=="archived"&&deadlineFor===s.studentId&&<tr className="deadline-edit-row"><td colSpan={5}><div className="deadline-edit-inline"><span>الموعد الأصلي: {fmt(resultsFor.dueAt)}</span>{s.dueAtOverride&&<span>التمديد الحالي: {fmt(s.dueAtOverride)}</span>}<input type="datetime-local" value={deadlineValue} onChange={e=>setDeadlineValue(e.target.value)}/><button onClick={()=>void saveDeadline(s)} disabled={busy||!deadlineValue}>حفظ التمديد</button>{s.dueAtOverride&&<button onClick={()=>void clearDeadline(s)} disabled={busy}>إلغاء التمديد</button>}<button onClick={()=>setDeadlineFor(null)}>إغلاق</button></div></td></tr>}{resultsFor.status!=="archived"&&reopenFor===s.studentId&&<tr className="deadline-edit-row reopen-edit-row"><td colSpan={5}><div className="deadline-edit-inline"><span>إعادة الفتح حتى:</span><input type="datetime-local" value={reopenValue} onChange={e=>setReopenValue(e.target.value)}/><span className="reopen-hint">تُتاح محاولة واحدة إذا لزم · لا تُحذف النتيجة السابقة · لا تبدأ المحاولة الآن</span><button onClick={()=>void saveReopen(s)} disabled={busy}>حفظ إعادة الفتح</button><button onClick={()=>setReopenFor(null)}>إغلاق</button></div></td></tr>}{resultsFor.status!=="archived"&&extendFor===s.studentId&&<tr className="deadline-edit-row extend-edit-row"><td colSpan={5}><div className="deadline-edit-inline extend-inline"><span>البداية: {fmt(s.activeAttempt?.startedAt||"")}</span><span>النهاية الأصلية: {fmt(s.activeAttempt?.endsAt||"")}</span>{s.activeAttempt?.extendedEndsAt&&<span>التمديد الحالي: {fmt(s.activeAttempt.extendedEndsAt)}</span>}<span>النهاية الفعلية الحالية: {fmt(s.effectiveAttemptEndsAt||"")}</span><input type="datetime-local" value={extendValue} onChange={e=>setExtendValue(e.target.value)}/>{willClip&&<span className="extend-clip-warning">ملاحظة: موعد تسليم الطالب الحالي سيوقف المحاولة قبل هذا الوقت. مدّد موعد التسليم أيضًا إذا أردت إعطاء الوقت كاملًا.</span>}<button onClick={()=>void saveExtend(s)} disabled={busy||!extendValue}>حفظ التمديد</button><button onClick={()=>setExtendFor(null)}>إغلاق</button></div></td></tr>}</Fragment>;})}</tbody></table></div></section>}
  {analysisBusy&&<div className="platform-loading">⏳ جارٍ تحليل الأسئلة...</div>}
  {analysis&&<section className="assignment-zone assignment-item-analysis-zone"><div className="assignments-heading"><div><span className="platform-eyebrow">Item Analysis</span><h3>تحليل الأسئلة: {analysis.title}</h3></div><button onClick={()=>setAnalysis(null)}>إغلاق</button></div><div className="gradebook-stats"><article><strong>{analysis.studentsSubmitted}/{analysis.studentsInClass}</strong><span>طلاب في التحليل</span></article><article><strong>{analysisSummary?.overallAverage===null||analysisSummary?.overallAverage===undefined?"—":analysisSummary.overallAverage+"%"}</strong><span>متوسط عام</span></article><article><strong>{analysisSummary?.hardest?"س"+analysisSummary.hardest.number:"—"}</strong><span>أصعب سؤال</span></article><article><strong>{analysisSummary?.easiest?"س"+analysisSummary.easiest.number:"—"}</strong><span>أسهل سؤال</span></article></div><div className="item-analysis-sort"><span>ترتيب حسب:</span><button className={analysisSort==="number"?"active":""} onClick={()=>setAnalysisSort("number")}>رقم السؤال</button><button className={analysisSort==="hardest"?"active":""} onClick={()=>setAnalysisSort("hardest")}>الأصعب أولًا</button><button className={analysisSort==="easiest"?"active":""} onClick={()=>setAnalysisSort("easiest")}>الأسهل أولًا</button></div><div className="students-table-wrap"><table className="students-table item-analysis-table"><thead><tr><th>#</th><th>نص السؤال</th><th>عدد الطلاب</th><th>نسبة الصحيح</th><th>متوسط العلامة</th><th>متوسط %</th><th>الصعوبة</th><th>مراجعة يدوية</th></tr></thead><tbody>{sortedQuestions.map(q=><tr key={q.questionId}><td>{q.number}</td><td className="item-analysis-text">{q.text&&q.text.length>60?q.text.slice(0,60)+"…":q.text||"—"}</td><td>{q.studentsAnalyzed}</td><td>{q.correctRate===null?"—":q.correctRate+"%"}</td><td>{q.averageScore===null?"—":q.averageScore+"/"+q.maxMarks}</td><td>{q.averagePercentage===null?"—":q.averagePercentage+"%"}</td><td>{q.difficulty?<span className={"difficulty-badge "+q.difficulty}>{q.difficulty==="easy"?"سهل":q.difficulty==="medium"?"متوسط":"صعب"}</span>:"—"}</td><td>{q.manualReviewCount>0?q.manualReviewCount:"—"}</td></tr>)}{!sortedQuestions.length&&<tr><td colSpan={8}>لا توجد أسئلة لتحليلها.</td></tr>}</tbody></table></div></section>}
  {review&&resultsFor&&<AssignmentReview token={token} assignmentId={resultsFor.assignmentId} studentId={review.studentId} initialAttempt={review.attemptNumber} onClose={()=>setReview(null)} onSaved={()=>void loadResults(resultsFor)}/>}
  {preview&&createPortal(<ExamPreview exam={preview.exam} onClose={()=>setPreview(null)}/>,document.body)}
  {purgeFor&&<div className="review-overlay" dir="rtl" onClick={()=>!busy&&setPurgeFor(null)}><div className="review-modal purge-modal" onClick={e=>e.stopPropagation()}><div className="review-top"><div><span className="platform-eyebrow">Permanent delete</span><h2>حذف نهائي</h2></div></div><div className="platform-error">هذا حذف نهائي ولا يمكن التراجع عنه.</div><p>لتأكيد حذف الواجب «{purgeFor.title}» نهائيًا، اكتب عنوان الواجب بالضبط:</p><input className="purge-title-input" value={purgeTitle} onChange={e=>setPurgeTitle(e.target.value)} placeholder={purgeFor.title}/><div className="review-footer"><button onClick={()=>setPurgeFor(null)} disabled={busy}>إلغاء</button><button className="assignment-delete-button" onClick={()=>void confirmPurge()} disabled={busy||purgeTitle!==purgeFor.title}>حذف نهائي</button></div></div></div>}
 </section>;
}
