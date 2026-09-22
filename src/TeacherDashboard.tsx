import {useEffect,useMemo,useRef,useState,type ReactNode} from "react";
import {Chart as ChartJS,CategoryScale,LinearScale,PointElement,LineElement,BarElement,ArcElement,Tooltip,Legend,Filler,type ChartOptions} from "chart.js";
import {Line,Doughnut,Bar} from "react-chartjs-2";
import {IconMedal,IconRefresh,IconDownload,IconPrint,IconSparkles,IconCheck,IconWarning,IconInfo} from "./icons";
import {MEDAL_COLORS,MEDAL_LABELS} from "./medals";
import {QuestionTextBlock} from "./questionContent";
import {REACTIONS,eventTypeOf,feedEventParts,type ReactionId,type FeedMedal,type FeedRank,type FeedProject} from "./achievements";
import {RANK_VISUALS} from "./studentRankVisuals";
import type {RankTier} from "./studentRank";
import {stageDef} from "./student/strengthStages";
import {resolveGradingStatus,type GradingStatus} from "./gradingStatus";
import StatCard from "./ui/StatCard";
import SectionHeader from "./ui/SectionHeader";
ChartJS.register(CategoryScale,LinearScale,PointElement,LineElement,BarElement,ArcElement,Tooltip,Legend,Filler);

type DashboardProps={token:string};
type ClassItem={classId:string;name:string;grade:string;schoolYear:string;active:boolean;studentCount:number};
type AssignmentTrend={assignmentId:string;classId:string;className:string;title:string;dueAt:string;date:string;students:number;submitted:number;missing:number;pendingReview:number;completionRate:number;average:number|null;highest:number|null;lowest:number|null};
type ClassComparison={classId:string;name:string;grade:string;students:number;assignments:number;expected:number;submitted:number;missing:number;pendingReview:number;completionRate:number;average:number|null};
type TopicAnalytics={topic:string;average:number|null;gradedQuestions:number};
type FollowUp={userId:string;displayName:string;identityNumber:string;classId:string;className:string;average:number|null;assigned:number;completed:number;missing:number;completionRate:number;trendDelta:number;trend:"improving"|"declining"|"stable";lastLoginAt:string;severity:"high"|"medium"|"low";reasons:string[]};
type Insight={tone:"success"|"warning"|"info";title:string;text:string};
type StudentDetail={userId:string;displayName:string;classId:string;className:string;average:number|null;assigned:number;completed:number;missing:number;completionRate:number;trendDelta:number;trend:"improving"|"declining"|"stable";lastLoginAt:string;scoreTrend:Array<{assignmentId:string;title:string;date:string;percentage:number}>;topicAnalytics:TopicAnalytics[]};
type Analytics={
 ok:true;generatedAt:string;
 scope:{classId:string;className:string;from:string;to:string};
 classes:ClassItem[];
 kpis:{activeClasses:number;activeStudents:number;publishedAssignments:number;submissions:number;expectedSubmissions:number;missingSubmissions:number;pendingReview:number;lateSubmissions:number;completionRate:number;average:number|null;highest:number|null;lowest:number|null;performanceChange:number;followUpStudents:number;neverLogged:number};
 submissionStatus:{submitted:number;missing:number;pendingReview:number;late:number};
 gradeDistribution:Array<{label:string;count:number}>;
 assignmentTrend:AssignmentTrend[];
 classComparison:ClassComparison[];
 topicAnalytics:TopicAnalytics[];
 followUp:FollowUp[];
 topImprovers:FollowUp[];
 insights:Insight[];
 students:Array<{userId:string;displayName:string}>;
 studentDetail:StudentDetail|null;
};
type ApiError={ok?:boolean;error?:string};
type StudentProfile={
 student:{userId:string;displayName:string;identityNumber:string;firstName:string;familyName:string;classId:string;active:boolean;archived:boolean;createdAt:string;lastLoginAt:string};
 classroom:{classId:string;name:string;grade:string;schoolYear:string}|null;
 stats:{assigned:number;completed:number;pending:number;average:number|null;lastLoginAt:string};
 assignments:Array<{assignmentId:string;title:string;status:string;dueAt:string;totalMarks:number;attemptsUsed:number;latestScore:number|null;latestPercentage:number|null;submittedAt:string;gradingStatus?:GradingStatus;finalized?:boolean}>;
};
type AssignmentResults={
 assignment:{assignmentId:string;title:string;maxAttempts:number;totalMarks:number};
 stats:{students:number;submitted:number;pendingReview:number;average:number|null;highest:number|null;lowest:number|null};
 students:Array<{studentId:string;studentName:string;studentCode:string;attemptsUsed:number;allowedAttempts:number;attempts:Array<{attemptNumber:number;score:number;totalMarks:number;percentage:number;submittedAt:string;gradingStatus?:GradingStatus;finalized:boolean}>;latestResult:{attemptNumber:number;score:number;totalMarks:number;percentage:number;submittedAt:string;gradingStatus?:GradingStatus;finalized:boolean}|null}>;
};
type AttemptReview={
 assignment:{assignmentId:string;title:string;totalMarks:number};
 student:{studentId:string;studentName:string;studentCode:string};
 attempt:{attemptNumber:number;submittedAt:string;score:number;totalMarks:number;percentage:number;manualReviewMarks:number;gradingStatus?:GradingStatus;finalized:boolean;teacherFeedback:string};
 attempts:Array<{attemptNumber:number;submittedAt:string;score:number;totalMarks:number;percentage:number;manualReviewMarks:number;gradingStatus?:GradingStatus;finalized:boolean}>;
 questions:Array<{questionId:string;questionNumber:number;text:string;marks:number;type:string;autoGrade:{score:number;maxMarks:number;correct:boolean;manualReview:boolean;reviewed?:boolean}|null;manualScore:number|null;teacherComment:string}>;
};
type RangeKey="all"|"30"|"90"|"365";
type AchievementPost={postId:string;eventType?:string;classId:string;className:string;studentDisplayName:string;assignmentTitle:string;tier?:"gold"|"silver"|"bronze";medal?:FeedMedal|null;rank?:FeedRank|null;project?:FeedProject|null;createdAt:string;reactionCounts:Record<ReactionId,number>;teacherReaction:ReactionId|null;teacherNote:string};
// The SAME event wording as the student feed (achievements.feedEventParts); the class name follows the student's name.
const FEED_LABELS={medal:(tier:string)=>MEDAL_LABELS[tier as keyof typeof MEDAL_LABELS]||tier,rank:(tier:string)=>RANK_VISUALS[tier as RankTier]?.title||tier,stage:(stage:number)=>stageDef(stage).name};
function AchievementIcon({post}:{post:AchievementPost}){
 const type=eventTypeOf(post);
 if(type==="medal"){const tier=post.medal?.tier||post.tier||"bronze";return <IconMedal size={22} style={{color:MEDAL_COLORS[tier]}}/>;}
 // global_rank_up → the current Strength STAGE artwork (25-stage pack); project events → the project's own 6-tier art.
 if(type==="global_rank_up"){return <img className="achievement-rank-art" src={stageDef(post.rank?.stage).image} alt="" aria-hidden="true" width={32} height={32} loading="lazy" decoding="async"/>;}
 const tier=post.project?.tier||"beginner";
 return <img className="achievement-rank-art" src={(RANK_VISUALS[tier as RankTier]||RANK_VISUALS.beginner).image} alt="" aria-hidden="true" width={32} height={32} loading="lazy" decoding="async"/>;
}
function AchievementText({post}:{post:AchievementPost}){
 const parts=feedEventParts(post,FEED_LABELS);
 return <p>{parts.map((part,i)=>part.strong?<strong key={i}>{part.text}</strong>:<span key={i}>{part.text}</span>)} <span className="eb-muted">({post.className})</span></p>;
}
type DrillKind="assignment"|"profile"|"review";

const fmtDate=(value:string)=>value?new Date(value).toLocaleString("ar",{dateStyle:"medium",timeStyle:"short"}):"—";
const fmtPct=(value:number|null)=>value===null?"—":value.toFixed(1).replace(/\.0$/,"")+"%";
const clampPct=(value:number|null)=>Math.max(0,Math.min(100,Number(value??0)));
const maskIdentity=(value:string)=>value?"•••••"+value.slice(-4):"—";
const trendText=(delta:number)=>delta>=5?"يتحسن":delta<=-5?"يتراجع":"مستقر";
const trendIcon=(delta:number)=>delta>=5?"↑":delta<=-5?"↓":"→";
const csvCell=(value:unknown)=>`"${String(value??"").replace(/"/g,'""')}"`;
const REDUCED_MOTION_QUERY="(prefers-reduced-motion: reduce)";
const GRID_COLOR="rgba(148,163,184,.18)";
const ATTENTION_PREVIEW=5;

/** Chart.js animation config honouring the OS reduced-motion preference (read once per mount, updated on change). */
function usePrefersReducedMotion(){
 const [reduce,setReduce]=useState(()=>typeof window!=="undefined"&&typeof window.matchMedia==="function"&&window.matchMedia(REDUCED_MOTION_QUERY).matches===true);
 useEffect(()=>{
  if(typeof window==="undefined"||typeof window.matchMedia!=="function")return;
  const mq=window.matchMedia(REDUCED_MOTION_QUERY);
  if(!mq||typeof mq.addEventListener!=="function")return;
  const onChange=()=>setReduce(mq.matches===true);
  mq.addEventListener("change",onChange);
  return()=>mq.removeEventListener("change",onChange);
 },[]);
 return reduce;
}
const chartAnimation=(reduce:boolean,duration:number)=>reduce?false as const:{duration,easing:"easeOutQuart" as const};

/* ------------------------------------------------------------------ charts
   Every dataset below is computed from the same payload fields as before UX-3
   (labels/data arrays are unchanged); UX-3 only adds a text summary for
   assistive technology and the reduced-motion switch. */
function LineChart({items}:{items:AssignmentTrend[]}){
 const reduce=usePrefersReducedMotion();
 const points=items.filter(x=>x.average!==null);
 const data=useMemo(()=>({labels:points.map(x=>x.title),datasets:[{label:"متوسط العلامات",data:points.map(x=>clampPct(x.average)),borderColor:"#2563eb",backgroundColor:"rgba(37,99,235,.13)",pointBackgroundColor:"#2563eb",pointBorderColor:"#fff",pointBorderWidth:2,pointRadius:4,pointHoverRadius:7,borderWidth:3,tension:.38,fill:true}]}),[points]);
 const options:ChartOptions<"line">=useMemo(()=>({responsive:true,maintainAspectRatio:false,animation:chartAnimation(reduce,1050),interaction:{mode:"index",intersect:false},plugins:{legend:{display:false},tooltip:{rtl:true,callbacks:{label:i=>" المتوسط: "+Number(i.raw||0).toFixed(1)+"%"}}},scales:{y:{beginAtZero:true,max:100,ticks:{callback:v=>v+"%"},grid:{color:GRID_COLOR}},x:{grid:{display:false},ticks:{maxRotation:0,autoSkip:true,maxTicksLimit:8}}}}),[reduce]);
 if(points.length<2)return <div className="analytics-empty-chart">تظهر حركة الأداء بعد توفر نتيجتين على الأقل.</div>;
 const summary=`تطور متوسط الأداء عبر ${points.length} واجبات: من ${fmtPct(points[0].average)} في «${points[0].title}» إلى ${fmtPct(points[points.length-1].average)} في «${points[points.length-1].title}».`;
 return <div className="analytics-chart-canvas analytics-chart-line" role="img" aria-label={summary}><Line data={data} options={options}/></div>;
}
function DonutChart({submitted,missing,pendingReview}:{submitted:number;missing:number;pendingReview:number}){
 const reduce=usePrefersReducedMotion();
 const total=Math.max(1,submitted+missing);
 const data=useMemo(()=>({labels:["تم التسليم","لم يُسلّم"],datasets:[{data:[submitted,missing],backgroundColor:["#2563eb","#e2e8f0"],borderColor:["#fff","#fff"],borderWidth:4,hoverOffset:8}]}),[submitted,missing]);
 const options:ChartOptions<"doughnut">=useMemo(()=>({responsive:true,maintainAspectRatio:false,cutout:"72%",animation:chartAnimation(reduce,1150),plugins:{legend:{display:false},tooltip:{rtl:true}}}),[reduce]);
 const summary=`حالة التسليم: ${fmtPct(submitted/total*100)} نسبة التسليم، ${submitted} تم التسليم، ${missing} لم يُسلّم، ${pendingReview} تحتاج مراجعة.`;
 return <div className="analytics-donut-layout"><div className="analytics-chart-canvas analytics-chart-donut" role="img" aria-label={summary}><Doughnut data={data} options={options}/><div className="analytics-donut-center"><strong>{fmtPct(submitted/total*100)}</strong><span>تسليم</span></div></div><div className="analytics-legend"><span><i className="legend-dot submitted"/>تم التسليم <b>{submitted}</b></span><span><i className="legend-dot missing"/>لم يُسلّم <b>{missing}</b></span><span><i className="legend-dot review"/>تحتاج مراجعة <b>{pendingReview}</b></span></div></div>;
}
function GradeDistributionChart({items}:{items:Array<{label:string;count:number}>}){
 const reduce=usePrefersReducedMotion();
 const data=useMemo(()=>({labels:items.map(x=>x.label),datasets:[{label:"عدد الطلاب",data:items.map(x=>x.count),backgroundColor:"rgba(37,99,235,.78)",borderRadius:8,borderSkipped:false}]}),[items]);
 const options:ChartOptions<"bar">=useMemo(()=>({responsive:true,maintainAspectRatio:false,animation:chartAnimation(reduce,1000),plugins:{legend:{display:false},tooltip:{rtl:true}},scales:{y:{beginAtZero:true,ticks:{precision:0},grid:{color:GRID_COLOR}},x:{grid:{display:false}}}}),[reduce]);
 if(!items.length)return <div className="analytics-empty-chart">لا توجد علامات بعد.</div>;
 const summary="توزيع العلامات: "+items.map(x=>`${x.label}: ${x.count}`).join("، ")+".";
 return <div className="analytics-chart-canvas analytics-chart-bar" role="img" aria-label={summary}><Bar data={data} options={options}/></div>;
}
function ClassComparisonChart({items,selectedClassId,onSelect}:{items:ClassComparison[];selectedClassId:string;onSelect:(id:string)=>void}){
 const reduce=usePrefersReducedMotion();
 const data=useMemo(()=>({labels:items.map(x=>x.name),datasets:[{label:"متوسط الصف",data:items.map(x=>clampPct(x.average)),backgroundColor:"rgba(14,165,233,.78)",borderRadius:8,borderSkipped:false}]}),[items]);
 const options:ChartOptions<"bar">=useMemo(()=>({responsive:true,maintainAspectRatio:false,indexAxis:"y",animation:chartAnimation(reduce,1050),onClick:(_e,els)=>{const i=els[0]?.index;if(i!==undefined&&items[i])onSelect(items[i].classId)},plugins:{legend:{display:false},tooltip:{rtl:true,callbacks:{label:i=>" المتوسط: "+Number(i.raw||0).toFixed(1)+"%"}}},scales:{x:{beginAtZero:true,max:100,ticks:{callback:v=>v+"%"},grid:{color:GRID_COLOR}},y:{grid:{display:false}}}}),[items,onSelect,reduce]);
 if(!items.length)return <div className="analytics-empty-chart">لا توجد بيانات صفوف بعد.</div>;
 const summary="مقارنة الصفوف: "+items.map(x=>`${x.name}: ${fmtPct(x.average)}`).join("، ")+".";
 return <>
  <div className="analytics-chart-canvas analytics-chart-class" role="img" aria-label={summary}><Bar data={data} options={options}/></div>
  <ul className="eb-chart-picker" aria-label="اختيار صف لعرض تفاصيله">{items.map(item=><li key={item.classId}><button type="button" className="eb-chart-picker-item" aria-pressed={item.classId===selectedClassId} onClick={()=>onSelect(item.classId)}><span>{item.name}</span><b>{fmtPct(item.average)}</b></button></li>)}</ul>
 </>;
}
function StudentTrendChart({items}:{items:Array<{title:string;percentage:number}>}){
 const reduce=usePrefersReducedMotion();
 const data=useMemo(()=>({labels:items.map(x=>x.title),datasets:[{label:"العلامة",data:items.map(x=>clampPct(x.percentage)),borderColor:"#7c3aed",backgroundColor:"rgba(124,58,237,.13)",pointBackgroundColor:"#7c3aed",pointBorderColor:"#fff",pointBorderWidth:2,pointRadius:4,pointHoverRadius:7,borderWidth:3,tension:.38,fill:true}]}),[items]);
 const options:ChartOptions<"line">=useMemo(()=>({responsive:true,maintainAspectRatio:false,animation:chartAnimation(reduce,1050),interaction:{mode:"index",intersect:false},plugins:{legend:{display:false},tooltip:{rtl:true,callbacks:{label:i=>" العلامة: "+Number(i.raw||0).toFixed(1)+"%"}}},scales:{y:{beginAtZero:true,max:100,ticks:{callback:v=>v+"%"},grid:{color:GRID_COLOR}},x:{grid:{display:false},ticks:{maxRotation:0,autoSkip:true,maxTicksLimit:8}}}}),[reduce]);
 if(items.length<2)return <div className="analytics-empty-chart">تظهر حركة العلامات بعد توفر نتيجتين على الأقل لهذا الطالب.</div>;
 const summary=`حركة علامات الطالب عبر ${items.length} واجبات: من ${fmtPct(items[0].percentage)} إلى ${fmtPct(items[items.length-1].percentage)}.`;
 return <div className="analytics-chart-canvas analytics-chart-line" role="img" aria-label={summary}><Line data={data} options={options}/></div>;
}
function TopicChart({items}:{items:TopicAnalytics[]}){
 const reduce=usePrefersReducedMotion();
 const visible=items.slice(0,10);
 const data=useMemo(()=>({labels:visible.map(x=>x.topic),datasets:[{label:"متوسط الموضوع",data:visible.map(x=>clampPct(x.average)),backgroundColor:visible.map(x=>Number(x.average||0)<60?"rgba(239,68,68,.76)":Number(x.average||0)>=80?"rgba(22,163,74,.76)":"rgba(245,158,11,.76)"),borderRadius:7,borderSkipped:false}]}),[visible]);
 const options:ChartOptions<"bar">=useMemo(()=>({responsive:true,maintainAspectRatio:false,indexAxis:"y",animation:chartAnimation(reduce,1100),plugins:{legend:{display:false},tooltip:{rtl:true,callbacks:{label:i=>" المتوسط: "+Number(i.raw||0).toFixed(1)+"%"}}},scales:{x:{beginAtZero:true,max:100,ticks:{callback:v=>v+"%"},grid:{color:GRID_COLOR}},y:{grid:{display:false}}}}),[reduce]);
 if(!visible.length)return <div className="analytics-empty-chart">ستظهر تحليلات الموضوعات بعد وجود إجابات مصححة.</div>;
 const summary="الأداء حسب الموضوع: "+visible.map(x=>`${x.topic}: ${fmtPct(x.average)}`).join("، ")+".";
 return <div className="analytics-chart-canvas analytics-chart-topic" role="img" aria-label={summary}><Bar data={data} options={options}/></div>;
}

/* ------------------------------------------------------------ drill panel
   Dashboard-private (not the global Modal). Desktop ≥1280: docked at the
   inline-end of the dashboard column; below that it is a full-width block in
   the page flow. The heading receives focus when the panel opens; the
   dashboard returns focus to the opening control on close. */
function DashboardDrillPanel({kind,title,subtitle,onClose,children}:{kind:DrillKind;title:ReactNode;subtitle?:ReactNode;onClose:()=>void;children:ReactNode}){
 const headingRef=useRef<HTMLHeadingElement>(null);
 const titleId="eb-drill-"+kind+"-title";
 useEffect(()=>{headingRef.current?.focus()},[]);
 return <aside className={"eb-drill-panel eb-drill-"+kind} aria-labelledby={titleId} data-drill={kind}>
  <div className="eb-drill-head">
   <div className="eb-drill-head-text"><h2 id={titleId} ref={headingRef} tabIndex={-1} className="eb-drill-title">{title}</h2>{subtitle&&<p className="eb-drill-subtitle">{subtitle}</p>}</div>
   <button type="button" className="eb-drill-close" onClick={onClose}>إغلاق</button>
  </div>
  <div className="eb-drill-body">{children}</div>
 </aside>;
}

/* The `count` is the authoritative KPI value for the category; `items` are the
   rows the payload happens to carry for it (followUp is sorted and cut to 20 by
   the backend, so a category can have a positive count with no listed rows).
   The locked empty string is therefore shown only when the count is zero;
   a positive count without rows renders a truthful partial-details note. */
function AttentionCard({id,title,count,tone,items,empty}:{id:string;title:string;count:number;tone:"danger"|"attention"|"info";items:Array<{key:string;label:string;meta:string;onOpen:()=>void}>;empty:string}){
 const shown=items.slice(0,ATTENTION_PREVIEW);
 const rest=items.length-shown.length;
 let body:ReactNode;
 if(shown.length)body=<ul className="eb-attention-list">{shown.map(item=><li key={item.key}><button type="button" className="eb-attention-item" onClick={item.onOpen}><span className="eb-attention-item-label">{item.label}</span><span className="eb-attention-item-meta">{item.meta}</span></button></li>)}</ul>;
 else if(count===0)body=<p className="eb-attention-empty">{empty}</p>;
 else body=<p className="eb-attention-partial">توجد {count} حالات ضمن النطاق الحالي، لكن تفاصيلها ليست ضمن قائمة المتابعة المختصرة.</p>;
 return <article className={"eb-attention-card tone-"+tone} aria-labelledby={id}>
  <h3 id={id} className="eb-attention-title"><span>{title}</span><span className="eb-attention-count">{count}</span></h3>
  {body}
  {rest>0&&<p className="eb-attention-more">و{rest} أخرى ضمن النطاق الحالي</p>}
 </article>;
}

function TeacherDashboard({token}:DashboardProps){
 const [data,setData]=useState<Analytics|null>(null);
 const [classId,setClassId]=useState("");
 const [studentId,setStudentId]=useState("");
 const [range,setRange]=useState<RangeKey>("all");
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState("");
 const [aiScope,setAiScope]=useState<"class"|"student"|"">("");
 const [aiAdvice,setAiAdvice]=useState("");
 const [aiBusy,setAiBusy]=useState(false);
 const [aiError,setAiError]=useState("");
 const [assignmentResults,setAssignmentResults]=useState<AssignmentResults|null>(null);
 const [assignmentBusy,setAssignmentBusy]=useState(false);
 const [profile,setProfile]=useState<StudentProfile|null>(null);
 const [profileBusy,setProfileBusy]=useState(false);
 const [review,setReview]=useState<AttemptReview|null>(null);
 const [reviewBusy,setReviewBusy]=useState(false);
 const drillTriggers=useRef<Partial<Record<DrillKind,HTMLElement|null>>>({});

 async function teacherApi<T>(url:string):Promise<T>{
  const response=await fetch(url,{headers:{"x-builder-token":token,"Authorization":"Bearer "+token}});
  const result=await response.json() as T&ApiError;
  if(!response.ok)throw new Error(result.error||"تعذر تحميل البيانات.");
  return result;
 }

 function queryString(){
  const params=new URLSearchParams();
  if(classId)params.set("classId",classId);
  if(studentId)params.set("studentId",studentId);
  if(range!=="all"){
   const days=Number(range);
   const from=new Date(Date.now()-days*24*60*60*1000);
   params.set("from",from.toISOString());
   params.set("to",new Date().toISOString());
  }
  return params.toString()?"?"+params.toString():"";
 }

 async function loadDashboard(){
  setLoading(true);setError("");
  try{
   const result=await teacherApi<Analytics>("/api/teacher-analytics"+queryString());
   setData(result);
   setAssignmentResults(null);setReview(null);setProfile(null);
  }catch(e){setError(e instanceof Error?e.message:"تعذر تحميل لوحة المتابعة.");}
  finally{setLoading(false)}
 }

 useEffect(()=>{void loadDashboard()},[classId,studentId,range]);

 const [achievements,setAchievements]=useState<AchievementPost[]>([]);
 const [achievementsError,setAchievementsError]=useState("");
 const [noteDrafts,setNoteDrafts]=useState<Record<string,string>>({});
 const [noteBusy,setNoteBusy]=useState<string>("");

 async function loadAchievements(){
  try{const result=await teacherApi<{ok:true;posts:AchievementPost[]}>("/api/teacher-achievement-feed");setAchievements(result.posts||[]);}
  catch(e){setAchievementsError(e instanceof Error?e.message:"تعذر تحميل إشعارات الإنجازات.");}
 }
 useEffect(()=>{void loadAchievements()},[]);

 async function teacherReact(post:AchievementPost,reaction:ReactionId){
  try{
   const response=await fetch("/api/teacher-achievement-feed",{method:"POST",headers:{"Content-Type":"application/json","x-builder-token":token,"Authorization":"Bearer "+token},body:JSON.stringify({action:"react",classId:post.classId,postId:post.postId,reaction})});
   const result=await response.json() as {ok?:boolean;teacherReaction?:ReactionId|null;error?:string};
   if(!response.ok||!result.ok)throw new Error(result.error||"تعذر إرسال ردّ الفعل.");
   setAchievements(prev=>prev.map(p=>p.postId===post.postId?{...p,teacherReaction:result.teacherReaction??null}:p));
  }catch(e){setAchievementsError(e instanceof Error?e.message:"تعذر إرسال ردّ الفعل.");}
 }

 async function saveNote(post:AchievementPost){
  const note=(noteDrafts[post.postId]??post.teacherNote).trim();
  setNoteBusy(post.postId);
  try{
   const response=await fetch("/api/teacher-achievement-feed",{method:"POST",headers:{"Content-Type":"application/json","x-builder-token":token,"Authorization":"Bearer "+token},body:JSON.stringify({action:"setNote",classId:post.classId,postId:post.postId,note})});
   const result=await response.json() as {ok?:boolean;teacherNote?:string;error?:string};
   if(!response.ok||!result.ok)throw new Error(result.error||"تعذر حفظ الملاحظة.");
   setAchievements(prev=>prev.map(p=>p.postId===post.postId?{...p,teacherNote:result.teacherNote??""}:p));
   setNoteDrafts(prev=>{const next={...prev};delete next[post.postId];return next});
  }catch(e){setAchievementsError(e instanceof Error?e.message:"تعذر حفظ الملاحظة.");}
  finally{setNoteBusy("")}
 }

 function selectClass(id:string){setClassId(id);setStudentId("");setAiAdvice("");setAiScope("");setAiError("")}
 function selectStudent(id:string){setStudentId(id);setAiAdvice("");setAiScope("");setAiError("")}

 async function runAiAnalysis(scope:"class"|"student"){
  setAiBusy(true);setAiError("");setAiAdvice("");setAiScope(scope);
  try{
   const payload:{classId:string;studentId?:string}={classId};
   if(scope==="student")payload.studentId=studentId;
   const response=await fetch("/api/teacher-analytics-ai",{method:"POST",headers:{"Content-Type":"application/json","x-builder-token":token,"Authorization":"Bearer "+token},body:JSON.stringify(payload)});
   const result=await response.json() as {ok?:boolean;advice?:string;error?:string};
   if(!response.ok||!result.ok||!result.advice)throw new Error(result.error||"تعذر إجراء التحليل الذكي.");
   setAiAdvice(result.advice);
  }catch(e){setAiError(e instanceof Error?e.message:"تعذر إجراء التحليل الذكي.");}
  finally{setAiBusy(false)}
 }

 /* Focus bookkeeping for the drill panels: remember the control that opened a
    panel; on close return focus to it when it is still in the document. A
    filter change clears the panels without touching focus. */
 function rememberTrigger(kind:DrillKind){
  const el=typeof document!=="undefined"?document.activeElement:null;
  drillTriggers.current[kind]=el instanceof HTMLElement?el:null;
 }
 function restoreTrigger(kind:DrillKind){
  const el=drillTriggers.current[kind];
  drillTriggers.current[kind]=null;
  if(el&&el.isConnected&&typeof el.focus==="function")el.focus();
 }
 function closeAssignment(){restoreTrigger("assignment");setAssignmentResults(null);setReview(null)}
 function closeProfile(){restoreTrigger("profile");setProfile(null)}
 function closeReview(){restoreTrigger("review");setReview(null)}

 async function openAssignment(item:AssignmentTrend){
  rememberTrigger("assignment");
  setAssignmentBusy(true);setError("");setReview(null);
  try{
   const result=await teacherApi<{ok:true}&AssignmentResults>("/api/assignment-results?assignmentId="+encodeURIComponent(item.assignmentId));
   setAssignmentResults(result);
  }catch(e){setError(e instanceof Error?e.message:"تعذر فتح تفاصيل الواجب.");}
  finally{setAssignmentBusy(false)}
 }

 async function openProfile(userId:string){
  rememberTrigger("profile");
  setProfileBusy(true);setError("");
  try{
   const result=await teacherApi<{ok:true;profile:StudentProfile}>("/api/students?profileUserId="+encodeURIComponent(userId));
   setProfile(result.profile);
  }catch(e){setError(e instanceof Error?e.message:"تعذر فتح ملف الطالب.");}
  finally{setProfileBusy(false)}
 }

 async function openAttempt(assignmentId:string,studentId:string,attemptNumber:number){
  if(!review)rememberTrigger("review");
  setReviewBusy(true);setError("");
  try{
   const params=new URLSearchParams({assignmentId,studentId,attemptNumber:String(attemptNumber)});
   const result=await teacherApi<{ok:true}&AttemptReview>("/api/assignment-review?"+params.toString());
   setReview(result);
  }catch(e){setError(e instanceof Error?e.message:"تعذر فتح تفاصيل المحاولة.");}
  finally{setReviewBusy(false)}
 }

 function exportCsv(){
  if(!data)return;
  const rows:string[][]=[
   ["ExamBank - Teacher Analytics"],
   ["النطاق",data.scope.className],
   ["تاريخ التقرير",fmtDate(data.generatedAt)],
   [],
   ["المؤشر","القيمة"],
   ["الطلاب",String(data.kpis.activeStudents)],
   ["متوسط العلامات",fmtPct(data.kpis.average)],
   ["نسبة التسليم",fmtPct(data.kpis.completionRate)],
   ["يحتاجون متابعة",String(data.kpis.followUpStudents)],
   ["واجبات منشورة",String(data.kpis.publishedAssignments)],
   ["تسليمات ناقصة",String(data.kpis.missingSubmissions)],
   [],
   ["الواجب","الصف","المتوسط","التسليم","لم يسلم","مراجعة"],
   ...data.assignmentTrend.map(item=>[item.title,item.className,fmtPct(item.average),fmtPct(item.completionRate),String(item.missing),String(item.pendingReview)]),
   [],
   ["طلاب يحتاجون متابعة","الصف","المعدل","ناقص","الاتجاه","السبب"],
   ...data.followUp.map(item=>[item.displayName,item.className,fmtPct(item.average),String(item.missing),trendText(item.trendDelta),item.reasons.join("، ")]),
   [],
   ["الموضوع","المتوسط","إجابات مصححة"],
   ...data.topicAnalytics.map(item=>[item.topic,fmtPct(item.average),String(item.gradedQuestions)])
  ];
  const content="\ufeff"+rows.map(row=>row.map(csvCell).join(",")).join("\r\n");
  const blob=new Blob([content],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download="ExamBank-Teacher-Analytics.csv";a.click();URL.revokeObjectURL(url);
 }

 if(!data&&loading)return <div className="analytics-loading" role="status">جارٍ بناء لوحة التحليل...</div>;
 if(!data)return <div className="platform-error" role="alert">{error||"لا توجد بيانات لعرضها."}</div>;

 const k=data.kpis;
 const selectedClass=data.classes.find(item=>item.classId===classId);
 const scopeLabel=selectedClass?.name||"كل الصفوف";
 const hasDrill=Boolean(assignmentResults||profile||review||assignmentBusy||profileBusy||reviewBusy);

 /* "Needs attention" — four locked categories. Counts come straight from the
    KPI payload; item lists reuse the same payload arrays the sections below
    render (followUp is already limited to high/medium by the backend). */
 const pendingItems=data.assignmentTrend.filter(item=>item.pendingReview>0).map(item=>({key:item.assignmentId,label:item.title,meta:`${item.pendingReview} بانتظار التصحيح · ${item.className}`,onOpen:()=>void openAssignment(item)}));
 const urgentItems=data.followUp.filter(item=>item.severity==="high").map(item=>({key:item.userId,label:item.displayName,meta:`${item.className} · المعدل ${fmtPct(item.average)} · ناقص ${item.missing}`,onOpen:()=>void openProfile(item.userId)}));
 const missingItems=data.assignmentTrend.filter(item=>item.missing>0).map(item=>({key:item.assignmentId,label:item.title,meta:`${item.missing} لم يُسلّموا · ${item.className}`,onOpen:()=>void openAssignment(item)}));
 const neverLoggedItems=data.followUp.filter(item=>!item.lastLoginAt).map(item=>({key:item.userId,label:item.displayName,meta:item.className,onOpen:()=>void openProfile(item.userId)}));

 const rangeButton=(value:RangeKey,label:string)=><button type="button" className={range===value?"active":""} aria-pressed={range===value} onClick={()=>setRange(value)}>{label}</button>;
 const insightIcon=(tone:Insight["tone"])=>tone==="success"?<IconCheck size={16}/>:tone==="warning"?<IconWarning size={16}/>:<IconInfo size={16}/>;
 const adviceBlock=(text:string)=><div className="analytics-ai-advice">{text.split(/\n+/).filter(Boolean).map((line,index)=><p key={index}>{line}</p>)}</div>;

 return <div className="analytics-dashboard eb-dash" dir="rtl">
  <section className="eb-dash-toolbar" aria-label="أدوات لوحة المتابعة">
   <div className="eb-dash-filters">
    <label className="eb-dash-field">الصف<select value={classId} onChange={(e:{target:{value:string}})=>selectClass(e.target.value)}><option value="">كل الصفوف</option>{data.classes.filter(item=>item.active).map(item=><option key={item.classId} value={item.classId}>{item.name} · {item.grade||"—"}</option>)}</select></label>
    {classId&&<label className="eb-dash-field">الطالب<select value={studentId} onChange={(e:{target:{value:string}})=>selectStudent(e.target.value)}><option value="">كل طلاب الصف</option>{data.students.map(item=><option key={item.userId} value={item.userId}>{item.displayName}</option>)}</select></label>}
    <div className="eb-dash-field"><span id="eb-dash-range-label">الفترة</span><div className="analytics-segmented" role="group" aria-labelledby="eb-dash-range-label">{rangeButton("all","كل الفترة")}{rangeButton("30","30 يومًا")}{rangeButton("90","90 يومًا")}{rangeButton("365","سنة")}</div></div>
   </div>
   <div className="eb-dash-scope"><strong>{scopeLabel}</strong><span>آخر تحديث: {fmtDate(data.generatedAt)}</span></div>
   <div className="eb-dash-actions">
    <button type="button" className="eb-toolbar-button" onClick={()=>void loadDashboard()} disabled={loading}><IconRefresh size={16}/>تحديث</button>
    <button type="button" className="eb-toolbar-button" onClick={exportCsv}><IconDownload size={16}/>تصدير CSV</button>
    <button type="button" className="eb-toolbar-button" onClick={()=>window.print()}><IconPrint size={16}/>طباعة</button>
   </div>
  </section>

  {error&&<div className="platform-error" role="alert">{error}</div>}

  <div className={"eb-dash-layout"+(hasDrill?" has-drill":"")}>
  <div className="eb-dash-main">

  {studentId&&data.studentDetail&&<section className="eb-dash-section eb-student-focus" aria-labelledby="eb-student-focus-title">
   <SectionHeader level={2} id="eb-student-focus-title" title={data.studentDetail.displayName} description={"تركيز على طالب واحد · "+data.studentDetail.className}/>
   <div className="analytics-mini-kpis"><span>المعدل <b>{fmtPct(data.studentDetail.average)}</b></span><span>مكتملة <b>{data.studentDetail.completed}/{data.studentDetail.assigned}</b></span><span>ناقصة <b>{data.studentDetail.missing}</b></span><span>الاتجاه <b>{trendIcon(data.studentDetail.trendDelta)} {trendText(data.studentDetail.trendDelta)}</b></span></div>
   <div className="eb-chart-grid">
    <article className="analytics-card eb-chart-card eb-span-2"><SectionHeader level={3} title="حركة علامات الطالب"/><StudentTrendChart items={data.studentDetail.scoreTrend}/></article>
    <article className="analytics-card eb-chart-card"><SectionHeader level={3} title="الموضوعات لهذا الطالب"/><TopicChart items={data.studentDetail.topicAnalytics}/></article>
    <article className="analytics-card eb-chart-card"><SectionHeader level={3} title="تحليل ذكي لهذا الطالب"/><button type="button" className="analytics-ai-button" onClick={()=>void runAiAnalysis("student")} disabled={aiBusy}><IconSparkles size={16}/>{aiBusy&&aiScope==="student"?"جارٍ التحليل...":"تحليل بيانات هذا الطالب بالذكاء الاصطناعي"}</button>{aiError&&aiScope==="student"&&<div className="platform-error" role="alert">{aiError}</div>}{aiAdvice&&aiScope==="student"&&adviceBlock(aiAdvice)}</article>
   </div>
  </section>}

  <section className="eb-dash-section eb-dash-kpis" aria-labelledby="eb-kpis-title">
   <h2 id="eb-kpis-title" className="eb-visually-hidden">المؤشرات الرئيسية</h2>
   <div className="eb-stat-grid is-primary">
    <StatCard primary label="متوسط العلامات" value={fmtPct(k.average)} hint={k.highest===null?"لا توجد نتائج":"أعلى "+fmtPct(k.highest)+" · أدنى "+fmtPct(k.lowest)}/>
    <StatCard primary label="نسبة التسليم" value={fmtPct(k.completionRate)} hint={`${k.submissions} من ${k.expectedSubmissions} حالة متوقعة`} tone="info"/>
    <StatCard primary label="يحتاجون متابعة" value={k.followUpStudents} hint={`${k.neverLogged} لم يسجلوا الدخول`} tone="attention"/>
    <StatCard primary label="بانتظار التصحيح" value={k.pendingReview} hint={`من ${k.submissions} تسليمًا`} tone="danger"/>
   </div>
   <div className="eb-stat-grid is-secondary">
    <StatCard label="الطلاب الفعّالون" value={k.activeStudents} hint={classId?"في الصف المختار":k.activeClasses+" صفوف فعّالة"}/>
    <StatCard label="واجبات منشورة" value={k.publishedAssignments} hint="ضمن النطاق الحالي"/>
    <StatCard label="اتجاه الأداء" value={trendIcon(k.performanceChange)+" "+fmtPct(Math.abs(k.performanceChange))} hint={trendText(k.performanceChange)+" مقارنة بالواجبات السابقة"} tone={k.performanceChange<0?"danger":"success"}/>
   </div>
  </section>

  <section className="eb-dash-section" aria-labelledby="eb-attention-title">
   <SectionHeader level={2} id="eb-attention-title" title="يحتاج إلى انتباهك" description="أربع فئات مرتّبة حسب الأولوية ضمن النطاق الحالي"/>
   <div className="eb-attention-grid">
    <AttentionCard id="eb-attention-pending" title="بانتظار التصحيح" count={k.pendingReview} tone="danger" items={pendingItems} empty="لا توجد تسليمات بانتظار التصحيح"/>
    <AttentionCard id="eb-attention-urgent" title="طلاب في حالة عاجلة" count={urgentItems.length} tone="danger" items={urgentItems} empty="لا توجد حالات عاجلة"/>
    <AttentionCard id="eb-attention-missing" title="تسليمات ناقصة" count={k.missingSubmissions} tone="attention" items={missingItems} empty="لا توجد تسليمات ناقصة"/>
    <AttentionCard id="eb-attention-never" title="لم يسجّلوا الدخول" count={k.neverLogged} tone="info" items={neverLoggedItems} empty="جميع الطلاب سجّلوا الدخول"/>
   </div>
  </section>

  <section className="eb-dash-section" aria-labelledby="eb-trends-title">
   <SectionHeader level={2} id="eb-trends-title" title="الاتجاهات والتحليلات"/>
   <div className="eb-chart-grid">
    <article className="analytics-card eb-chart-card eb-span-2"><SectionHeader level={3} title="تطور متوسط الأداء" actions={<span className="analytics-chip">آخر {data.assignmentTrend.length} واجبات</span>}/><LineChart items={data.assignmentTrend}/></article>
    <article className="analytics-card eb-chart-card"><SectionHeader level={3} title="حالة التسليم"/><DonutChart submitted={data.submissionStatus.submitted} missing={data.submissionStatus.missing} pendingReview={data.submissionStatus.pendingReview}/></article>
    <article className="analytics-card eb-chart-card"><SectionHeader level={3} title="توزيع العلامات"/><GradeDistributionChart items={data.gradeDistribution}/></article>
    <article className="analytics-card eb-chart-card"><SectionHeader level={3} title="مقارنة الصفوف" description="اختر صفًا لعرض تفاصيله"/><ClassComparisonChart items={data.classComparison} selectedClassId={classId} onSelect={selectClass}/></article>
    <article className="analytics-card eb-chart-card"><SectionHeader level={3} title="الأداء حسب الموضوع" actions={<span className="analytics-chip">الأضعف أولًا</span>}/><TopicChart items={data.topicAnalytics}/></article>
   </div>
  </section>

  <section className="eb-dash-section" aria-labelledby="eb-followup-title">
   <SectionHeader level={2} id="eb-followup-title" title="طلاب يحتاجون متابعة" count={data.followUp.length} description="عاجل: يحتاج تدخلًا فوريًا · متابعة: يحتاج مراقبة"/>
   <div className="eb-followup-grid">
    <article className="analytics-card eb-span-2"><div className="students-table-wrap"><table className="students-table analytics-table"><thead><tr><th>الطالب</th><th>الصف</th><th>المعدل</th><th>غير مسلّم</th><th>الاتجاه</th><th>السبب</th><th>الحالة</th></tr></thead><tbody>{data.followUp.map(item=><tr key={item.userId}><td><button type="button" className="analytics-link" onClick={()=>void openProfile(item.userId)}>{item.displayName}</button><small>{maskIdentity(item.identityNumber)}</small></td><td>{item.className}</td><td>{fmtPct(item.average)}</td><td>{item.missing}</td><td><span className={"analytics-trend-badge "+item.trend}>{trendIcon(item.trendDelta)} {trendText(item.trendDelta)} {item.trendDelta?Math.abs(item.trendDelta)+"%":""}</span></td><td>{item.reasons.join("، ")}</td><td><span className={"analytics-risk "+item.severity}>{item.severity==="high"?"عاجل":"متابعة"}</span></td></tr>)}{!data.followUp.length&&<tr><td colSpan={7}>لا توجد حالات متابعة بارزة ضمن النطاق الحالي.</td></tr>}</tbody></table></div></article>
    <article className="analytics-card"><SectionHeader level={3} title="أفضل تحسن"/><div className="analytics-improvers">{data.topImprovers.map((item,index)=><button type="button" key={item.userId} onClick={()=>void openProfile(item.userId)}><span className="analytics-rank">{index+1}</span><div><strong>{item.displayName}</strong><small>{item.className}</small></div><b>↑ {item.trendDelta}%</b></button>)}{!data.topImprovers.length&&<div className="analytics-empty-chart">نحتاج نتائج متتابعة أكثر لقياس التحسن.</div>}</div></article>
   </div>
  </section>

  <section className="eb-dash-section" aria-labelledby="eb-assignments-title">
   <SectionHeader level={2} id="eb-assignments-title" title="متابعة الواجبات" description="افتح أي واجب لعرض نتائج طلابه ومحاولاتهم"/>
   <article className="analytics-card"><div className="students-table-wrap"><table className="students-table analytics-table"><thead><tr><th>الواجب</th><th>الصف</th><th>المتوسط</th><th>التسليم</th><th>غير مسلّم</th><th>مراجعة</th><th>الموعد</th></tr></thead><tbody>{[...data.assignmentTrend].reverse().map(item=><tr key={item.assignmentId}><td><button type="button" className="analytics-link" onClick={()=>void openAssignment(item)}>{item.title}</button></td><td>{item.className}</td><td>{fmtPct(item.average)}</td><td>{fmtPct(item.completionRate)}</td><td>{item.missing}</td><td>{item.pendingReview}</td><td>{item.dueAt?fmtDate(item.dueAt):"—"}</td></tr>)}{!data.assignmentTrend.length&&<tr><td colSpan={7}>لا توجد واجبات منشورة ضمن النطاق الحالي.</td></tr>}</tbody></table></div></article>
  </section>

  <section className="eb-dash-section" aria-labelledby="eb-insights-title">
   <SectionHeader level={2} id="eb-insights-title" title="مؤشرات ذكية للمعلم"/>
   <article className="analytics-card"><div className="analytics-insights">{data.insights.map((item,index)=><article key={index} className={"analytics-insight "+item.tone}><div className="analytics-insight-icon" aria-hidden="true">{insightIcon(item.tone)}</div><div><strong>{item.title}</strong><p>{item.text}</p></div></article>)}{!data.insights.length&&<div className="analytics-empty-chart">لا توجد مؤشرات ضمن النطاق الحالي.</div>}</div></article>
  </section>

  <section className="eb-dash-section" aria-labelledby="eb-achievements-title">
   <SectionHeader level={2} id="eb-achievements-title" title="إنجازات الطلاب الأخيرة" count={achievements.length>0?achievements.length:undefined}/>
   <article className="analytics-card achievement-notify-card">{achievementsError&&<div className="platform-error" role="alert">{achievementsError}</div>}<div className="achievement-notify-list">{achievements.map(post=><article key={post.postId} className="achievement-notify-item" data-event-type={eventTypeOf(post)}><AchievementIcon post={post}/><div className="achievement-notify-body"><AchievementText post={post}/><div className="achievement-reaction-row">{REACTIONS.map(r=><button key={r.id} type="button" className={"achievement-reaction"+(post.teacherReaction===r.id?" active":"")} title={r.label} aria-label={r.label} aria-pressed={post.teacherReaction===r.id} onClick={()=>void teacherReact(post,r.id)}>{r.emoji} {post.reactionCounts[r.id]>0?post.reactionCounts[r.id]:""}</button>)}</div><div className="achievement-note-row"><input type="text" aria-label="كلمة تشجيع" placeholder="اكتب كلمة تشجيع..." maxLength={200} value={noteDrafts[post.postId]??post.teacherNote} onChange={e=>setNoteDrafts(prev=>({...prev,[post.postId]:e.target.value}))}/><button type="button" onClick={()=>void saveNote(post)} disabled={noteBusy===post.postId}>{noteBusy===post.postId?"جارٍ الإرسال...":"إرسال"}</button></div></div></article>)}{!achievements.length&&<div className="analytics-empty-chart">لا توجد إنجازات بعد.</div>}</div></article>
  </section>

  <section className="eb-dash-section" aria-labelledby="eb-ai-title">
   <SectionHeader level={2} id="eb-ai-title" title="تحليل البيانات العامة واستخلاص العبر" description={"يحلل الذكاء الاصطناعي بيانات "+scopeLabel+" ويقترح خطوات عملية للتطوير."}/>
   <article className="analytics-card"><button type="button" className="analytics-ai-button primary" onClick={()=>void runAiAnalysis("class")} disabled={aiBusy}><IconSparkles size={16}/>{aiBusy&&aiScope==="class"?"جارٍ التحليل...":"تحليل البيانات العامة واستخلاص العبر"}</button>{aiError&&aiScope==="class"&&<div className="platform-error" role="alert">{aiError}</div>}{aiAdvice&&aiScope==="class"&&adviceBlock(aiAdvice)}</article>
  </section>

  </div>

  {hasDrill&&<div className="eb-drill-dock" aria-label="التفاصيل">
   {assignmentBusy&&<div className="analytics-loading" role="status">جارٍ تحميل تفاصيل الواجب...</div>}
   {assignmentResults&&<DashboardDrillPanel kind="assignment" title={assignmentResults.assignment.title} subtitle="من الواجب إلى الطالب إلى المحاولة إلى السؤال" onClose={closeAssignment}>
    <div className="analytics-mini-kpis"><span>المتوسط <b>{fmtPct(assignmentResults.stats.average)}</b></span><span>سلّموا <b>{assignmentResults.stats.submitted}/{assignmentResults.stats.students}</b></span><span>مراجعة <b>{assignmentResults.stats.pendingReview}</b></span><span>أعلى <b>{fmtPct(assignmentResults.stats.highest)}</b></span></div>
    <div className="students-table-wrap"><table className="students-table analytics-table"><thead><tr><th>الطالب</th><th>المحاولات</th><th>آخر علامة</th><th>الحالة</th><th>فتح محاولة</th></tr></thead><tbody>{assignmentResults.students.map(student=><tr key={student.studentId}><td><button type="button" className="analytics-link" onClick={()=>void openProfile(student.studentId)}>{student.studentName}</button></td><td>{student.attemptsUsed}/{student.allowedAttempts}</td><td>{student.latestResult?fmtPct(student.latestResult.percentage):"—"}</td><td>{!student.latestResult?"لم يسلّم":resolveGradingStatus(student.latestResult)==="final"?"مصحح":"يحتاج مراجعة"}</td><td><div className="analytics-attempt-buttons">{student.attempts.map(attempt=><button type="button" key={attempt.attemptNumber} onClick={()=>void openAttempt(assignmentResults.assignment.assignmentId,student.studentId,attempt.attemptNumber)}>#{attempt.attemptNumber} · {fmtPct(attempt.percentage)}</button>)}</div></td></tr>)}</tbody></table></div>
   </DashboardDrillPanel>}

   {profileBusy&&<div className="analytics-loading" role="status">جارٍ فتح ملف الطالب...</div>}
   {profile&&<DashboardDrillPanel kind="profile" title={profile.student.displayName} subtitle={(profile.classroom?.name||"—")+" · "+maskIdentity(profile.student.identityNumber)} onClose={closeProfile}>
    <div className="analytics-mini-kpis"><span>المعدل <b>{fmtPct(profile.stats.average)}</b></span><span>مكتملة <b>{profile.stats.completed}/{profile.stats.assigned}</b></span><span>ناقصة <b>{profile.stats.pending}</b></span><span>آخر دخول <b>{profile.stats.lastLoginAt?fmtDate(profile.stats.lastLoginAt):"لم يدخل"}</b></span></div>
    <div className="students-table-wrap"><table className="students-table analytics-table"><thead><tr><th>الواجب</th><th>المحاولات</th><th>العلامة</th><th>النسبة</th><th>الحالة</th></tr></thead><tbody>{profile.assignments.map(item=><tr key={item.assignmentId}><td>{item.title}</td><td>{item.attemptsUsed}</td><td>{item.latestScore===null?"—":item.latestScore+"/"+item.totalMarks}</td><td>{fmtPct(item.latestPercentage)}</td><td>{item.latestScore===null?"لم يسلّم":resolveGradingStatus(item)==="final"?"مصحح":"مراجعة"}</td></tr>)}</tbody></table></div>
   </DashboardDrillPanel>}

   {reviewBusy&&<div className="analytics-loading" role="status">جارٍ فتح تفاصيل المحاولة...</div>}
   {review&&<DashboardDrillPanel kind="review" title={review.student.studentName+" · المحاولة #"+review.attempt.attemptNumber} subtitle={review.assignment.title+" · "+fmtPct(review.attempt.percentage)+" · "+(resolveGradingStatus(review.attempt)==="final"?"مصححة بالكامل":"تحتاج مراجعة")} onClose={closeReview}>
    <div className="analytics-attempt-buttons analytics-attempt-switcher">{review.attempts.map(attempt=><button type="button" className={attempt.attemptNumber===review.attempt.attemptNumber?"active":""} aria-pressed={attempt.attemptNumber===review.attempt.attemptNumber} key={attempt.attemptNumber} onClick={()=>void openAttempt(review.assignment.assignmentId,review.student.studentId,attempt.attemptNumber)}>محاولة #{attempt.attemptNumber} · {fmtPct(attempt.percentage)}</button>)}</div>
    <div className="students-table-wrap"><table className="students-table analytics-table"><thead><tr><th>#</th><th>السؤال</th><th>النوع</th><th>العلامة</th><th>الحالة</th></tr></thead><tbody>{review.questions.map(question=>{const score=question.manualScore??question.autoGrade?.score??0;const max=question.autoGrade?.maxMarks??question.marks;const pending=question.autoGrade?.manualReview===true&&question.autoGrade?.reviewed!==true&&question.manualScore===null;return <tr key={question.questionId}><td>{question.questionNumber}</td><td className="analytics-question-text"><QuestionTextBlock text={question.text}/></td><td>{question.type||"—"}</td><td>{score}/{max}</td><td>{pending?<span className="analytics-risk high">مراجعة</span>:<span className="status-active">مصحح</span>}</td></tr>})}</tbody></table></div>
    {review.attempt.teacherFeedback&&<div className="analytics-feedback"><strong>ملاحظة المعلم:</strong> {review.attempt.teacherFeedback}</div>}
   </DashboardDrillPanel>}
  </div>}
  </div>
 </div>;
}

export default TeacherDashboard;
