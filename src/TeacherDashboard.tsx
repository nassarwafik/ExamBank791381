import {useEffect,useMemo,useRef,useState,type ReactNode} from "react";
import {Chart as ChartJS,CategoryScale,LinearScale,PointElement,LineElement,BarElement,ArcElement,Tooltip,Legend,Filler,type ChartOptions} from "chart.js";
import {Line,Doughnut,Bar} from "react-chartjs-2";
import {IconMedal,IconRefresh,IconDownload,IconPrint,IconSparkles,IconCheck,IconWarning,IconInfo} from "./icons";
import {MEDAL_COLORS,MEDAL_LABELS} from "./medals";
import {QuestionTextBlock} from "./questionContent";
import {REACTIONS,eventTypeOf,feedEventParts,type ReactionId,type FeedMedal,type FeedRank,type FeedProject,type FeedStage} from "./achievements";
import {RANK_VISUALS} from "./studentRankVisuals";
import {stageVisual} from "./studentStageVisuals";
import type {RankTier} from "./studentRank";
import {resolveGradingStatus,type GradingStatus} from "./gradingStatus";
import StatCard from "./ui/StatCard";
import SectionHeader from "./ui/SectionHeader";
ChartJS.register(CategoryScale,LinearScale,PointElement,LineElement,BarElement,ArcElement,Tooltip,Legend,Filler);

type DashboardProps={token:string};
/** Phase 8A — the ONE analytics scope of the dashboard: GLOBAL (no class), CLASS (class only), STUDENT (class + student). */
type ScopeMode="global"|"class"|"student";
type ClassItem={classId:string;name:string;grade:string;schoolYear:string;active:boolean;studentCount:number};
type AssignmentTrend={assignmentId:string;classId:string;className:string;title:string;dueAt:string;date:string;students:number;submitted:number;missing:number;pendingReview:number;completionRate:number;average:number|null;highest:number|null;lowest:number|null};
type ClassComparison={classId:string;name:string;grade:string;students:number;assignments:number;expected:number;submitted:number;missing:number;pendingReview:number;completionRate:number;average:number|null};
type TopicAnalytics={topic:string;average:number|null;gradedQuestions:number};
type FollowUp={userId:string;displayName:string;identityNumber:string;classId:string;className:string;average:number|null;assigned:number;completed:number;missing:number;completionRate:number;trendDelta:number;trend:"improving"|"declining"|"stable";lastLoginAt:string;severity:"high"|"medium"|"low";reasons:string[]};
type Insight={tone:"success"|"warning"|"info";title:string;text:string};
type StudentDetail={userId:string;displayName:string;classId:string;className:string;average:number|null;assigned:number;completed:number;missing:number;completionRate:number;trendDelta:number;trend:"improving"|"declining"|"stable";lastLoginAt:string;needsFollowUp?:boolean;reasons?:string[];scoreTrend:Array<{assignmentId:string;title:string;date:string;percentage:number}>;topicAnalytics:TopicAnalytics[]};
type Analytics={
 ok:true;generatedAt:string;
 scope:{mode?:ScopeMode;classId:string;className:string;studentId?:string;studentName?:string;from:string;to:string};
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
type AchievementPost={postId:string;eventType?:string;classId:string;className:string;studentDisplayName:string;assignmentTitle:string;tier?:"gold"|"silver"|"bronze";medal?:FeedMedal|null;rank?:FeedRank|null;stage?:FeedStage|null;project?:FeedProject|null;createdAt:string;reactionCounts:Record<ReactionId,number>;teacherReaction:ReactionId|null;teacherNote:string};
// The SAME event wording as the student feed (achievements.feedEventParts); the class name follows the student's name.
// Stage-era global events use the 25-stage titles; historical global events and project ranks the legacy six-rank titles.
const FEED_LABELS={medal:(tier:string)=>MEDAL_LABELS[tier as keyof typeof MEDAL_LABELS]||tier,rank:(tier:string)=>RANK_VISUALS[tier as RankTier]?.title||tier,stage:(n:number)=>stageVisual(n).title};
function AchievementIcon({post}:{post:AchievementPost}){
 const type=eventTypeOf(post);
 if(type==="medal"){const tier=post.medal?.tier||post.tier||"bronze";return <IconMedal size={22} style={{color:MEDAL_COLORS[tier]}}/>;}
 const stageNumber=Number(post.stage?.stageNumber);
 if(type==="global_rank_up"&&Number.isInteger(stageNumber)&&stageNumber>=1) return <img className="achievement-rank-art is-stage" src={stageVisual(stageNumber).image} alt="" aria-hidden="true" width={32} height={32} loading="lazy" decoding="async"/>;
 const tier=(type==="global_rank_up"?post.rank?.tier:post.project?.tier)||"beginner";
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
function LineChart({items,student=false}:{items:AssignmentTrend[];student?:boolean}){
 const reduce=usePrefersReducedMotion();
 const points=items.filter(x=>x.average!==null);
 const seriesLabel=student?"علامة الطالب":"متوسط العلامات";
 const data=useMemo(()=>({labels:points.map(x=>x.title),datasets:[{label:seriesLabel,data:points.map(x=>clampPct(x.average)),borderColor:"#2563eb",backgroundColor:"rgba(37,99,235,.13)",pointBackgroundColor:"#2563eb",pointBorderColor:"#fff",pointBorderWidth:2,pointRadius:4,pointHoverRadius:7,borderWidth:3,tension:.38,fill:true}]}),[points,seriesLabel]);
 const options:ChartOptions<"line">=useMemo(()=>({responsive:true,maintainAspectRatio:false,animation:chartAnimation(reduce,1050),interaction:{mode:"index",intersect:false},plugins:{legend:{display:false},tooltip:{rtl:true,callbacks:{label:i=>(student?" العلامة: ":" المتوسط: ")+Number(i.raw||0).toFixed(1)+"%"}}},scales:{y:{beginAtZero:true,max:100,ticks:{callback:v=>v+"%"},grid:{color:GRID_COLOR}},x:{grid:{display:false},ticks:{maxRotation:0,autoSkip:true,maxTicksLimit:8}}}}),[reduce,student]);
 if(points.length<2)return <div className="analytics-empty-chart">{student?"تظهر حركة العلامات بعد توفر نتيجتين على الأقل لهذا الطالب.":"تظهر حركة الأداء بعد توفر نتيجتين على الأقل."}</div>;
 const summary=`${student?"تطور علامات الطالب":"تطور متوسط الأداء"} عبر ${points.length} واجبات: من ${fmtPct(points[0].average)} في «${points[0].title}» إلى ${fmtPct(points[points.length-1].average)} في «${points[points.length-1].title}».`;
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
function GradeDistributionChart({items,student=false}:{items:Array<{label:string;count:number}>;student?:boolean}){
 const reduce=usePrefersReducedMotion();
 const data=useMemo(()=>({labels:items.map(x=>x.label),datasets:[{label:student?"عدد الواجبات":"عدد الطلاب",data:items.map(x=>x.count),backgroundColor:"rgba(37,99,235,.78)",borderRadius:8,borderSkipped:false}]}),[items,student]);
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
 const [classId,setClassId]=useState("");
 const [studentId,setStudentId]=useState("");
 const [range,setRange]=useState<RangeKey>("all");
 // Phase 8A — the scope the teacher selected. Every analytics surface renders ONLY data loaded for exactly this key:
 // while another scope loads (or after it fails) the previous scope's numbers are never shown.
 const mode:ScopeMode=studentId?"student":classId?"class":"global";
 const scopeKey=classId+"|"+studentId+"|"+range;
 const [loaded,setLoaded]=useState<{key:string;classId:string;data:Analytics}|null>(null);
 const data=loaded?.data??null;
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState("");
 const dashboardGen=useRef(0);
 // AI advice belongs to the scope it was requested for (aiKey); a response for an older scope is dropped (aiGen).
 const [aiKey,setAiKey]=useState("");
 const aiGen=useRef(0);
 const [aiAdvice,setAiAdvice]=useState("");
 const [aiBusy,setAiBusy]=useState(false);
 const [aiError,setAiError]=useState("");
 const [assignmentResults,setAssignmentResults]=useState<AssignmentResults|null>(null);
 // Phase 8A: the student the open assignment drill was requested for ("" = the whole class). A drill is rendered only
 // for the student it belongs to, so a class drill can never appear under a student scope (or the other way round).
 const [assignmentFor,setAssignmentFor]=useState("");
 const [assignmentBusy,setAssignmentBusy]=useState(false);
 const [profile,setProfile]=useState<StudentProfile|null>(null);
 const [profileBusy,setProfileBusy]=useState(false);
 const [review,setReview]=useState<AttemptReview|null>(null);
 const [reviewBusy,setReviewBusy]=useState(false);
 const drillTriggers=useRef<Partial<Record<DrillKind,HTMLElement|null>>>({});
 // Drill panels opened for one scope never land in another: a scope change bumps the generation.
 const drillGen=useRef(0);

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
  const gen=++dashboardGen.current;
  const key=scopeKey,forClass=classId;
  setLoading(true);setError("");
  try{
   const result=await teacherApi<Analytics>("/api/teacher-analytics"+queryString());
   if(gen!==dashboardGen.current)return;   // a newer scope was requested meanwhile — never overwrite it
   setLoaded({key,classId:forClass,data:result});
   drillGen.current++;setAssignmentResults(null);setReview(null);setProfile(null);
  }catch(e){if(gen===dashboardGen.current)setError(e instanceof Error?e.message:"تعذر تحميل لوحة المتابعة.");}
  finally{if(gen===dashboardGen.current)setLoading(false)}
 }

 useEffect(()=>{void loadDashboard()},[classId,studentId,range]);

 const [achievements,setAchievements]=useState<AchievementPost[]>([]);
 const [achievementsError,setAchievementsError]=useState("");
 const [noteDrafts,setNoteDrafts]=useState<Record<string,string>>({});
 const [noteBusy,setNoteBusy]=useState<string>("");

 const [achievementsLoading,setAchievementsLoading]=useState(false);
 // Only the newest scope may apply its result: a slower response for an earlier class/student is dropped.
 const achievementsGen=useRef(0);

 // «إنجازات الطلاب الأخيرة» follows the dashboard scope (class, or class + student). The server filters BEFORE its
 // newest-first cap, so a class's older achievements are not crowded out by other classes. `range` stays analytics-only.
 async function loadAchievements(scope:{classId:string;studentId:string}){
  const gen=++achievementsGen.current;
  setAchievements([]);setAchievementsError("");setAchievementsLoading(true);   // never show the previous scope's posts
  const params=new URLSearchParams();
  if(scope.classId){params.set("classId",scope.classId);if(scope.studentId)params.set("studentId",scope.studentId);}
  const query=params.toString();
  try{
   const result=await teacherApi<{ok:true;posts:AchievementPost[]}>("/api/teacher-achievement-feed"+(query?"?"+query:""));
   if(gen===achievementsGen.current)setAchievements(result.posts||[]);
  }catch(e){if(gen===achievementsGen.current)setAchievementsError(e instanceof Error?e.message:"تعذر تحميل إشعارات الإنجازات.");}
  finally{if(gen===achievementsGen.current)setAchievementsLoading(false);}
 }
 useEffect(()=>{void loadAchievements({classId,studentId})},[classId,studentId]);

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

 /** A scope change clears every scope-bound surface at once: drill panels (and their in-flight loads) and AI advice. */
 function resetScopedUi(){
  drillGen.current++;aiGen.current++;
  setAssignmentResults(null);setProfile(null);setReview(null);setAssignmentBusy(false);setProfileBusy(false);setReviewBusy(false);
  setAiAdvice("");setAiError("");setAiBusy(false);setAiKey("");
 }
 // A new class (or «كل الصفوف») always drops the student: a student selection never survives a class change.
 function selectClass(id:string){setClassId(id);setStudentId("");resetScopedUi()}
 function selectStudent(id:string){setStudentId(id);resetScopedUi()}
 function selectRange(value:RangeKey){setRange(value);resetScopedUi()}

 /** The AI request carries exactly the current scope (global → no selector, class → classId, student → classId +
  *  studentId, plus the loaded period); the server recomputes that scope itself. */
 async function runAiAnalysis(){
  if(!loaded||loaded.key!==scopeKey)return;
  const gen=++aiGen.current,key=scopeKey;
  setAiBusy(true);setAiError("");setAiAdvice("");setAiKey(key);
  try{
   const payload:{classId?:string;studentId?:string;from?:string;to?:string}={};
   if(classId)payload.classId=classId;
   if(classId&&studentId)payload.studentId=studentId;
   if(loaded.data.scope.from)payload.from=loaded.data.scope.from;
   if(loaded.data.scope.to)payload.to=loaded.data.scope.to;
   const response=await fetch("/api/teacher-analytics-ai",{method:"POST",headers:{"Content-Type":"application/json","x-builder-token":token,"Authorization":"Bearer "+token},body:JSON.stringify(payload)});
   const result=await response.json() as {ok?:boolean;advice?:string;error?:string};
   if(gen!==aiGen.current)return;
   if(!response.ok||!result.ok||!result.advice)throw new Error(result.error||"تعذر إجراء التحليل الذكي.");
   setAiAdvice(result.advice);
  }catch(e){if(gen===aiGen.current)setAiError(e instanceof Error?e.message:"تعذر إجراء التحليل الذكي.");}
  finally{if(gen===aiGen.current)setAiBusy(false)}
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
  const gen=drillGen.current;
  // STUDENT scope: the drill asks the server for this one student only (never the class gradebook).
  const forStudent=classId&&studentId?studentId:"";
  setAssignmentBusy(true);setError("");setReview(null);
  try{
   const params=new URLSearchParams({assignmentId:item.assignmentId});
   if(forStudent)params.set("studentId",forStudent);
   const result=await teacherApi<{ok:true}&AssignmentResults>("/api/assignment-results?"+params.toString());
   if(gen!==drillGen.current)return;
   if(forStudent&&(result.students.length!==1||result.students[0].studentId!==forStudent))throw new Error("تعذر فتح نتيجة الطالب لهذا الواجب.");
   setAssignmentResults(result);setAssignmentFor(forStudent);
  }catch(e){if(gen===drillGen.current)setError(e instanceof Error?e.message:"تعذر فتح تفاصيل الواجب.");}
  finally{if(gen===drillGen.current)setAssignmentBusy(false)}
 }

 async function openProfile(userId:string){
  rememberTrigger("profile");
  const gen=drillGen.current;
  setProfileBusy(true);setError("");
  try{
   const result=await teacherApi<{ok:true;profile:StudentProfile}>("/api/students?profileUserId="+encodeURIComponent(userId));
   if(gen===drillGen.current)setProfile(result.profile);
  }catch(e){if(gen===drillGen.current)setError(e instanceof Error?e.message:"تعذر فتح ملف الطالب.");}
  finally{if(gen===drillGen.current)setProfileBusy(false)}
 }

 async function openAttempt(assignmentId:string,studentId:string,attemptNumber:number){
  if(!review)rememberTrigger("review");
  const gen=drillGen.current;
  setReviewBusy(true);setError("");
  try{
   const params=new URLSearchParams({assignmentId,studentId,attemptNumber:String(attemptNumber)});
   const result=await teacherApi<{ok:true}&AttemptReview>("/api/assignment-review?"+params.toString());
   if(gen===drillGen.current)setReview(result);
  }catch(e){if(gen===drillGen.current)setError(e instanceof Error?e.message:"تعذر فتح تفاصيل المحاولة.");}
  finally{if(gen===drillGen.current)setReviewBusy(false)}
 }

 /** The scope caption of the page, the CSV and the AI section (one wording, derived from the current selection). */
 function scopeNames(){
  const className=data?.classes.find(item=>item.classId===classId)?.name||(loaded?.key===scopeKey?data?.scope.className:"")||"";
  const roster=loaded&&loaded.classId===classId&&classId?loaded.data.students:[];
  const studentName=roster.find(item=>item.userId===studentId)?.displayName||(loaded?.key===scopeKey?data?.scope.studentName||data?.studentDetail?.displayName:"")||"";
  return {className,studentName,roster};
 }

 function exportCsv(){
  if(!loaded||loaded.key!==scopeKey)return;   // never export another scope's figures
  const d=loaded.data;
  const {className,studentName}=scopeNames();
  const student=mode==="student";
  const scopeRow=mode==="global"?"كل الصفوف / جميع الطلاب":mode==="class"?className:"الطالب: "+studentName+" / الصف: "+className;
  const rows:string[][]=[
   ["ExamBank - Teacher Analytics"],
   ["النطاق",scopeRow],
   ["تاريخ التقرير",fmtDate(d.generatedAt)],
   [],
   ["المؤشر","القيمة"],
   ["الطلاب",String(d.kpis.activeStudents)],
   ["متوسط العلامات",fmtPct(d.kpis.average)],
   ["نسبة التسليم",fmtPct(d.kpis.completionRate)],
   ["يحتاجون متابعة",String(d.kpis.followUpStudents)],
   ["واجبات منشورة",String(d.kpis.publishedAssignments)],
   ["تسليمات ناقصة",String(d.kpis.missingSubmissions)],
   [],
   ["الواجب","الصف",student?"علامة الطالب":"المتوسط","التسليم","لم يسلم","مراجعة"],
   ...d.assignmentTrend.map(item=>[item.title,item.className,fmtPct(item.average),fmtPct(item.completionRate),String(item.missing),String(item.pendingReview)]),
   [],
   // Student scope: only the selected student's own follow-up row (the server never returns classmates here).
   [student?"متابعة الطالب":"طلاب يحتاجون متابعة","الصف","المعدل","ناقص","الاتجاه","السبب"],
   ...d.followUp.filter(item=>!student||item.userId===studentId).map(item=>[item.displayName,item.className,fmtPct(item.average),String(item.missing),trendText(item.trendDelta),item.reasons.join("، ")]),
   [],
   ["الموضوع","المتوسط","إجابات مصححة"],
   ...d.topicAnalytics.map(item=>[item.topic,fmtPct(item.average),String(item.gradedQuestions)]),
   // Multi-class / multi-student sections exist only where they are meaningful.
   ...(mode==="global"&&d.classComparison.length?[[],["مقارنة الصفوف","الطلاب","المتوسط","نسبة التسليم"],...d.classComparison.map(item=>[item.name,String(item.students),fmtPct(item.average),fmtPct(item.completionRate)])]:[]),
   ...(!student&&d.topImprovers.length?[[],["أفضل تحسن","الصف","التحسن"],...d.topImprovers.map(item=>[item.displayName,item.className,"+"+item.trendDelta+"%"])]:[])
  ];
  const content="﻿"+rows.map(row=>row.map(csvCell).join(",")).join("\r\n");
  const blob=new Blob([content],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download="ExamBank-Teacher-Analytics.csv";a.click();URL.revokeObjectURL(url);
 }

 if(!data&&loading)return <div className="analytics-loading" role="status">جارٍ بناء لوحة التحليل...</div>;
 if(!data)return <div className="platform-error" role="alert">{error||"لا توجد بيانات لعرضها."}</div>;

 const fresh=loaded?.key===scopeKey;
 const k=data.kpis;
 const isStudent=mode==="student";
 const {className:scopeClassName,studentName:scopeStudentName,roster}=scopeNames();
 const scopeCaption=mode==="global"?"كل الصفوف · جميع الطلاب":mode==="class"?"الصف: "+scopeClassName+" · جميع طلاب الصف":"الطالب: "+scopeStudentName+" · الصف: "+scopeClassName;
 const hasDrill=fresh&&Boolean(assignmentResults||profile||review||assignmentBusy||profileBusy||reviewBusy);
 const aiVisible=aiKey===scopeKey;
 const aiLabel=mode==="global"?"تحليل البيانات العامة واستخلاص العبر":mode==="class"?"تحليل بيانات الصف واستخلاص العبر":"تحليل بيانات الطالب واستخلاص العبر";
 const aiDescription=mode==="global"?"يحلل الذكاء الاصطناعي بيانات كل الصفوف وجميع الطلاب ويقترح خطوات عملية للتطوير.":mode==="class"?"يحلل الذكاء الاصطناعي بيانات الصف "+scopeClassName+" وجميع طلابه فقط ويقترح خطوات عملية للتطوير.":"يحلل الذكاء الاصطناعي بيانات الطالب "+scopeStudentName+" وحده (الصف "+scopeClassName+") ويقترح خطوات عملية لمساعدته.";

 /* "Needs attention" — four locked categories. Counts come straight from the
    KPI payload; item lists reuse the same payload arrays the sections below
    render (followUp is already limited to high/medium by the backend). */
 const pendingItems=data.assignmentTrend.filter(item=>item.pendingReview>0).map(item=>({key:item.assignmentId,label:item.title,meta:`${item.pendingReview} بانتظار التصحيح · ${item.className}`,onOpen:()=>void openAssignment(item)}));
 const urgentItems=data.followUp.filter(item=>item.severity==="high").map(item=>({key:item.userId,label:item.displayName,meta:`${item.className} · المعدل ${fmtPct(item.average)} · ناقص ${item.missing}`,onOpen:()=>void openProfile(item.userId)}));
 const missingItems=data.assignmentTrend.filter(item=>item.missing>0).map(item=>({key:item.assignmentId,label:item.title,meta:isStudent?`لم يُسلّم · ${item.className}`:`${item.missing} لم يُسلّموا · ${item.className}`,onOpen:()=>void openAssignment(item)}));
 const neverLoggedItems=data.followUp.filter(item=>!item.lastLoginAt).map(item=>({key:item.userId,label:item.displayName,meta:item.className,onOpen:()=>void openProfile(item.userId)}));

 const rangeButton=(value:RangeKey,label:string)=><button type="button" className={range===value?"active":""} aria-pressed={range===value} onClick={()=>selectRange(value)}>{label}</button>;
 const insightIcon=(tone:Insight["tone"])=>tone==="success"?<IconCheck size={16}/>:tone==="warning"?<IconWarning size={16}/>:<IconInfo size={16}/>;
 const adviceBlock=(text:string)=><div className="analytics-ai-advice">{text.split(/\n+/).filter(Boolean).map((line,index)=><p key={index}>{line}</p>)}</div>;
 const detail=isStudent?data.studentDetail:null;

 return <div className="analytics-dashboard eb-dash" dir="rtl" data-scope-mode={mode}>
  <section className="eb-dash-toolbar" aria-label="أدوات لوحة المتابعة">
   <div className="eb-dash-filters">
    <label className="eb-dash-field">الصف<select value={classId} onChange={(e:{target:{value:string}})=>selectClass(e.target.value)}><option value="">كل الصفوف</option>{data.classes.filter(item=>item.active).map(item=><option key={item.classId} value={item.classId}>{item.name} · {item.grade||"—"}</option>)}</select></label>
    {classId&&<label className="eb-dash-field">الطالب<select value={studentId} onChange={(e:{target:{value:string}})=>selectStudent(e.target.value)}><option value="">كل طلاب الصف</option>{roster.map(item=><option key={item.userId} value={item.userId}>{item.displayName}</option>)}</select></label>}
    <div className="eb-dash-field"><span id="eb-dash-range-label">الفترة</span><div className="analytics-segmented" role="group" aria-labelledby="eb-dash-range-label">{rangeButton("all","كل الفترة")}{rangeButton("30","30 يومًا")}{rangeButton("90","90 يومًا")}{rangeButton("365","سنة")}</div></div>
   </div>
   <div className="eb-dash-scope"><strong data-testid="dashboard-scope-caption">{scopeCaption}</strong>{fresh&&<span>آخر تحديث: {fmtDate(data.generatedAt)}</span>}</div>
   <div className="eb-dash-actions">
    <button type="button" className="eb-toolbar-button" onClick={()=>void loadDashboard()} disabled={loading}><IconRefresh size={16}/>تحديث</button>
    <button type="button" className="eb-toolbar-button" onClick={exportCsv} disabled={!fresh}><IconDownload size={16}/>تصدير CSV</button>
    <button type="button" className="eb-toolbar-button" onClick={()=>window.print()}><IconPrint size={16}/>طباعة</button>
   </div>
  </section>

  {error&&<div className="platform-error" role="alert">{error}</div>}
  {!fresh&&loading&&<div className="analytics-loading" role="status">جارٍ تحميل بيانات النطاق المحدد...</div>}

  {fresh&&<div className={"eb-dash-layout"+(hasDrill?" has-drill":"")}>
  <div className="eb-dash-main">

  {detail&&<section className="eb-dash-section eb-student-focus" aria-labelledby="eb-student-focus-title">
   <SectionHeader level={2} id="eb-student-focus-title" title={detail.displayName} description={"تركيز على طالب واحد · "+detail.className}/>
   <div className="analytics-mini-kpis"><span>المعدل <b>{fmtPct(detail.average)}</b></span><span>مكتملة <b>{detail.completed}/{detail.assigned}</b></span><span>ناقصة <b>{detail.missing}</b></span><span>الاتجاه <b>{trendIcon(detail.trendDelta)} {trendText(detail.trendDelta)}</b></span></div>
   {detail.reasons&&detail.reasons.length>0&&<p className="eb-student-focus-reasons">مؤشرات المتابعة: {detail.reasons.join("، ")}</p>}
  </section>}

  <section className="eb-dash-section eb-dash-kpis" aria-labelledby="eb-kpis-title">
   <h2 id="eb-kpis-title" className="eb-visually-hidden">المؤشرات الرئيسية</h2>
   <div className="eb-stat-grid is-primary">
    <StatCard primary label={isStudent?"معدل الطالب":"متوسط العلامات"} value={fmtPct(k.average)} hint={k.highest===null?"لا توجد نتائج":"أعلى "+fmtPct(k.highest)+" · أدنى "+fmtPct(k.lowest)}/>
    <StatCard primary label="نسبة التسليم" value={fmtPct(k.completionRate)} hint={`${k.submissions} من ${k.expectedSubmissions} حالة متوقعة`} tone="info"/>
    {isStudent
     ?<StatCard primary label="يحتاج متابعة" value={k.followUpStudents?"نعم":"لا"} hint={k.neverLogged?"لم يسجل الدخول بعد":"سجّل الدخول"} tone="attention"/>
     :<StatCard primary label="يحتاجون متابعة" value={k.followUpStudents} hint={`${k.neverLogged} لم يسجلوا الدخول`} tone="attention"/>}
    <StatCard primary label="بانتظار التصحيح" value={k.pendingReview} hint={`من ${k.submissions} تسليمًا`} tone="danger"/>
   </div>
   <div className="eb-stat-grid is-secondary">
    <StatCard label="الطلاب الفعّالون" value={k.activeStudents} hint={mode==="global"?k.activeClasses+" صفوف فعّالة":mode==="class"?"في الصف المختار":"الطالب المختار فقط"}/>
    <StatCard label="واجبات منشورة" value={k.publishedAssignments} hint="ضمن النطاق الحالي"/>
    <StatCard label="اتجاه الأداء" value={trendIcon(k.performanceChange)+" "+fmtPct(Math.abs(k.performanceChange))} hint={trendText(k.performanceChange)+" مقارنة بالواجبات السابقة"} tone={k.performanceChange<0?"danger":"success"}/>
   </div>
  </section>

  <section className="eb-dash-section" aria-labelledby="eb-attention-title">
   <SectionHeader level={2} id="eb-attention-title" title="يحتاج إلى انتباهك" description="أربع فئات مرتّبة حسب الأولوية ضمن النطاق الحالي"/>
   <div className="eb-attention-grid">
    <AttentionCard id="eb-attention-pending" title="بانتظار التصحيح" count={k.pendingReview} tone="danger" items={pendingItems} empty="لا توجد تسليمات بانتظار التصحيح"/>
    <AttentionCard id="eb-attention-urgent" title={isStudent?"حالة عاجلة":"طلاب في حالة عاجلة"} count={urgentItems.length} tone="danger" items={urgentItems} empty="لا توجد حالات عاجلة"/>
    <AttentionCard id="eb-attention-missing" title="تسليمات ناقصة" count={k.missingSubmissions} tone="attention" items={missingItems} empty="لا توجد تسليمات ناقصة"/>
    <AttentionCard id="eb-attention-never" title={isStudent?"لم يسجّل الدخول":"لم يسجّلوا الدخول"} count={k.neverLogged} tone="info" items={neverLoggedItems} empty={isStudent?"سجّل الطالب الدخول":"جميع الطلاب سجّلوا الدخول"}/>
   </div>
  </section>

  <section className="eb-dash-section" aria-labelledby="eb-trends-title">
   <SectionHeader level={2} id="eb-trends-title" title="الاتجاهات والتحليلات"/>
   <div className="eb-chart-grid">
    <article className="analytics-card eb-chart-card eb-span-2"><SectionHeader level={3} title={isStudent?"حركة علامات الطالب":"تطور متوسط الأداء"} actions={<span className="analytics-chip">آخر {data.assignmentTrend.length} واجبات</span>}/><LineChart items={data.assignmentTrend} student={isStudent}/></article>
    <article className="analytics-card eb-chart-card"><SectionHeader level={3} title={isStudent?"حالة تسليم الطالب":"حالة التسليم"}/><DonutChart submitted={data.submissionStatus.submitted} missing={data.submissionStatus.missing} pendingReview={data.submissionStatus.pendingReview}/></article>
    <article className="analytics-card eb-chart-card"><SectionHeader level={3} title={isStudent?"توزيع علامات الطالب":"توزيع العلامات"}/><GradeDistributionChart items={data.gradeDistribution} student={isStudent}/></article>
    {mode==="global"&&<article className="analytics-card eb-chart-card"><SectionHeader level={3} title="مقارنة الصفوف" description="اختر صفًا لعرض تفاصيله"/><ClassComparisonChart items={data.classComparison} selectedClassId={classId} onSelect={selectClass}/></article>}
    <article className="analytics-card eb-chart-card"><SectionHeader level={3} title={isStudent?"الموضوعات لهذا الطالب":"الأداء حسب الموضوع"} actions={<span className="analytics-chip">الأضعف أولًا</span>}/><TopicChart items={data.topicAnalytics}/></article>
   </div>
  </section>

  {!isStudent&&<section className="eb-dash-section" aria-labelledby="eb-followup-title">
   <SectionHeader level={2} id="eb-followup-title" title="طلاب يحتاجون متابعة" count={data.followUp.length} description="عاجل: يحتاج تدخلًا فوريًا · متابعة: يحتاج مراقبة"/>
   <div className="eb-followup-grid">
    <article className="analytics-card eb-span-2"><div className="students-table-wrap"><table className="students-table analytics-table"><thead><tr><th>الطالب</th><th>الصف</th><th>المعدل</th><th>غير مسلّم</th><th>الاتجاه</th><th>السبب</th><th>الحالة</th></tr></thead><tbody>{data.followUp.map(item=><tr key={item.userId}><td><button type="button" className="analytics-link" onClick={()=>void openProfile(item.userId)}>{item.displayName}</button><small>{maskIdentity(item.identityNumber)}</small></td><td>{item.className}</td><td>{fmtPct(item.average)}</td><td>{item.missing}</td><td><span className={"analytics-trend-badge "+item.trend}>{trendIcon(item.trendDelta)} {trendText(item.trendDelta)} {item.trendDelta?Math.abs(item.trendDelta)+"%":""}</span></td><td>{item.reasons.join("، ")}</td><td><span className={"analytics-risk "+item.severity}>{item.severity==="high"?"عاجل":"متابعة"}</span></td></tr>)}{!data.followUp.length&&<tr><td colSpan={7}>لا توجد حالات متابعة بارزة ضمن النطاق الحالي.</td></tr>}</tbody></table></div></article>
    <article className="analytics-card"><SectionHeader level={3} title="أفضل تحسن"/><div className="analytics-improvers">{data.topImprovers.map((item,index)=><button type="button" key={item.userId} onClick={()=>void openProfile(item.userId)}><span className="analytics-rank">{index+1}</span><div><strong>{item.displayName}</strong><small>{item.className}</small></div><b>↑ {item.trendDelta}%</b></button>)}{!data.topImprovers.length&&<div className="analytics-empty-chart">نحتاج نتائج متتابعة أكثر لقياس التحسن.</div>}</div></article>
   </div>
  </section>}

  <section className="eb-dash-section" aria-labelledby="eb-assignments-title">
   <SectionHeader level={2} id="eb-assignments-title" title={isStudent?"واجبات الطالب":"متابعة الواجبات"} description={isStudent?"افتح أي واجب لعرض نتيجة الطالب ومحاولاته":"افتح أي واجب لعرض نتائج طلابه ومحاولاتهم"}/>
   <article className="analytics-card"><div className="students-table-wrap"><table className="students-table analytics-table"><thead><tr><th>الواجب</th><th>الصف</th><th>{isStudent?"العلامة":"المتوسط"}</th><th>{isStudent?"الحالة":"التسليم"}</th>{!isStudent&&<th>غير مسلّم</th>}<th>مراجعة</th><th>الموعد</th></tr></thead><tbody>{[...data.assignmentTrend].reverse().map(item=><tr key={item.assignmentId}><td><button type="button" className="analytics-link" onClick={()=>void openAssignment(item)}>{item.title}</button></td><td>{item.className}</td><td>{fmtPct(item.average)}</td><td>{isStudent?(item.submitted?"تم التسليم":"لم يُسلّم"):fmtPct(item.completionRate)}</td>{!isStudent&&<td>{item.missing}</td>}<td>{isStudent?(item.pendingReview?"بانتظار التصحيح":"—"):item.pendingReview}</td><td>{item.dueAt?fmtDate(item.dueAt):"—"}</td></tr>)}{!data.assignmentTrend.length&&<tr><td colSpan={isStudent?6:7}>لا توجد واجبات منشورة ضمن النطاق الحالي.</td></tr>}</tbody></table></div></article>
  </section>

  <section className="eb-dash-section" aria-labelledby="eb-insights-title">
   <SectionHeader level={2} id="eb-insights-title" title="مؤشرات ذكية للمعلم"/>
   <article className="analytics-card"><div className="analytics-insights">{data.insights.map((item,index)=><article key={index} className={"analytics-insight "+item.tone}><div className="analytics-insight-icon" aria-hidden="true">{insightIcon(item.tone)}</div><div><strong>{item.title}</strong><p>{item.text}</p></div></article>)}{!data.insights.length&&<div className="analytics-empty-chart">لا توجد مؤشرات ضمن النطاق الحالي.</div>}</div></article>
  </section>

  <section className="eb-dash-section" aria-labelledby="eb-achievements-title">
   <SectionHeader level={2} id="eb-achievements-title" title="إنجازات الطلاب الأخيرة" count={achievements.length>0?achievements.length:undefined}/>
   <article className="analytics-card achievement-notify-card">{achievementsError&&<div className="platform-error" role="alert">{achievementsError}</div>}<div className="achievement-notify-list">{achievements.map(post=><article key={post.postId} className="achievement-notify-item" data-event-type={eventTypeOf(post)}><AchievementIcon post={post}/><div className="achievement-notify-body"><AchievementText post={post}/><div className="achievement-reaction-row">{REACTIONS.map(r=><button key={r.id} type="button" className={"achievement-reaction"+(post.teacherReaction===r.id?" active":"")} title={r.label} aria-label={r.label} aria-pressed={post.teacherReaction===r.id} onClick={()=>void teacherReact(post,r.id)}>{r.emoji} {post.reactionCounts[r.id]>0?post.reactionCounts[r.id]:""}</button>)}</div><div className="achievement-note-row"><input type="text" aria-label="كلمة تشجيع" placeholder="اكتب كلمة تشجيع..." maxLength={200} value={noteDrafts[post.postId]??post.teacherNote} onChange={e=>setNoteDrafts(prev=>({...prev,[post.postId]:e.target.value}))}/><button type="button" onClick={()=>void saveNote(post)} disabled={noteBusy===post.postId}>{noteBusy===post.postId?"جارٍ الإرسال...":"إرسال"}</button></div></div></article>)}{!achievements.length&&!achievementsLoading&&!achievementsError&&<div className="analytics-empty-chart">لا توجد إنجازات بعد.</div>}{achievementsLoading&&<div className="analytics-empty-chart" role="status">جارٍ تحميل الإنجازات...</div>}</div></article>
  </section>

  <section className="eb-dash-section" aria-labelledby="eb-ai-title">
   <SectionHeader level={2} id="eb-ai-title" title={aiLabel} description={aiDescription}/>
   <article className="analytics-card"><button type="button" className="analytics-ai-button primary" onClick={()=>void runAiAnalysis()} disabled={aiBusy}><IconSparkles size={16}/>{aiBusy&&aiVisible?"جارٍ التحليل...":aiLabel}</button>{aiError&&aiVisible&&<div className="platform-error" role="alert">{aiError}</div>}{aiAdvice&&aiVisible&&adviceBlock(aiAdvice)}</article>
  </section>

  </div>

  {hasDrill&&<div className="eb-drill-dock" aria-label="التفاصيل">
   {assignmentBusy&&<div className="analytics-loading" role="status">جارٍ تحميل تفاصيل الواجب...</div>}
   {assignmentResults&&!isStudent&&assignmentFor===""&&<DashboardDrillPanel kind="assignment" title={assignmentResults.assignment.title} subtitle="من الواجب إلى الطالب إلى المحاولة إلى السؤال" onClose={closeAssignment}>
    <div className="analytics-mini-kpis"><span>المتوسط <b>{fmtPct(assignmentResults.stats.average)}</b></span><span>سلّموا <b>{assignmentResults.stats.submitted}/{assignmentResults.stats.students}</b></span><span>مراجعة <b>{assignmentResults.stats.pendingReview}</b></span><span>أعلى <b>{fmtPct(assignmentResults.stats.highest)}</b></span></div>
    <div className="students-table-wrap"><table className="students-table analytics-table"><thead><tr><th>الطالب</th><th>المحاولات</th><th>آخر علامة</th><th>الحالة</th><th>فتح محاولة</th></tr></thead><tbody>{assignmentResults.students.map(student=><tr key={student.studentId}><td><button type="button" className="analytics-link" onClick={()=>void openProfile(student.studentId)}>{student.studentName}</button></td><td>{student.attemptsUsed}/{student.allowedAttempts}</td><td>{student.latestResult?fmtPct(student.latestResult.percentage):"—"}</td><td>{!student.latestResult?"لم يسلّم":resolveGradingStatus(student.latestResult)==="final"?"مصحح":"يحتاج مراجعة"}</td><td><div className="analytics-attempt-buttons">{student.attempts.map(attempt=><button type="button" key={attempt.attemptNumber} onClick={()=>void openAttempt(assignmentResults.assignment.assignmentId,student.studentId,attempt.attemptNumber)}>#{attempt.attemptNumber} · {fmtPct(attempt.percentage)}</button>)}</div></td></tr>)}</tbody></table></div>
   </DashboardDrillPanel>}
   {assignmentResults&&isStudent&&assignmentFor===studentId&&(()=>{
    // STUDENT scope: the selected student's own result and attempts — no classmates, no class aggregates.
    const row=assignmentResults.students.find(item=>item.studentId===studentId);
    const status=!row?.latestResult?"لم يسلّم":resolveGradingStatus(row.latestResult)==="final"?"مصحح":"يحتاج مراجعة";
    return <DashboardDrillPanel kind="assignment" title={assignmentResults.assignment.title} subtitle={"نتيجة الطالب ومحاولاته · "+(row?.studentName||"")} onClose={closeAssignment}>
     <div className="analytics-mini-kpis"><span>علامة الطالب <b>{row?.latestResult?fmtPct(row.latestResult.percentage):"—"}</b></span><span>المحاولات <b>{row?row.attemptsUsed+"/"+row.allowedAttempts:"—"}</b></span><span>الحالة <b>{status}</b></span></div>
     {row&&row.attempts.length>0
      ?<div className="analytics-attempt-buttons">{row.attempts.map(attempt=><button type="button" key={attempt.attemptNumber} onClick={()=>void openAttempt(assignmentResults.assignment.assignmentId,row.studentId,attempt.attemptNumber)}>محاولة #{attempt.attemptNumber} · {fmtPct(attempt.percentage)}</button>)}</div>
      :<p className="analytics-empty-chart">لم يسلّم الطالب هذا الواجب بعد.</p>}
    </DashboardDrillPanel>;
   })()}

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
  </div>}
 </div>;
}

export default TeacherDashboard;
