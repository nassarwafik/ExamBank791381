import {useEffect,useMemo,useRef,useState} from "react";
import {Chart as ChartJS,CategoryScale,LinearScale,PointElement,LineElement,BarElement,ArcElement,Tooltip,Legend,Filler,type ChartOptions} from "chart.js";
import {Line,Doughnut,Bar} from "react-chartjs-2";
ChartJS.register(CategoryScale,LinearScale,PointElement,LineElement,BarElement,ArcElement,Tooltip,Legend,Filler);

type DashboardProps={token:string};
type ClassItem={classId:string;name:string;grade:string;schoolYear:string;active:boolean;studentCount:number};
type AssignmentTrend={assignmentId:string;classId:string;className:string;title:string;dueAt:string;date:string;students:number;submitted:number;missing:number;pendingReview:number;completionRate:number;average:number|null;highest:number|null;lowest:number|null};
type ClassComparison={classId:string;name:string;grade:string;students:number;assignments:number;expected:number;submitted:number;missing:number;pendingReview:number;completionRate:number;average:number|null};
type TopicAnalytics={topic:string;average:number|null;gradedQuestions:number};
type FollowUp={userId:string;displayName:string;identityNumber:string;classId:string;className:string;average:number|null;assigned:number;completed:number;missing:number;completionRate:number;trendDelta:number;trend:"improving"|"declining"|"stable";lastLoginAt:string;severity:"high"|"medium"|"low";reasons:string[]};
type Insight={tone:"success"|"warning"|"info";title:string;text:string};
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
};
type ApiError={ok?:boolean;error?:string};
type StudentProfile={
 student:{userId:string;displayName:string;identityNumber:string;firstName:string;familyName:string;classId:string;active:boolean;archived:boolean;createdAt:string;lastLoginAt:string};
 classroom:{classId:string;name:string;grade:string;schoolYear:string}|null;
 stats:{assigned:number;completed:number;pending:number;average:number|null;lastLoginAt:string};
 assignments:Array<{assignmentId:string;title:string;status:string;dueAt:string;totalMarks:number;attemptsUsed:number;latestScore:number|null;latestPercentage:number|null;submittedAt:string;finalized:boolean}>;
};
type AssignmentResults={
 assignment:{assignmentId:string;title:string;maxAttempts:number;totalMarks:number};
 stats:{students:number;submitted:number;pendingReview:number;average:number|null;highest:number|null;lowest:number|null};
 students:Array<{studentId:string;studentName:string;studentCode:string;attemptsUsed:number;allowedAttempts:number;attempts:Array<{attemptNumber:number;score:number;totalMarks:number;percentage:number;submittedAt:string;finalized:boolean}>;latestResult:{attemptNumber:number;score:number;totalMarks:number;percentage:number;submittedAt:string;finalized:boolean}|null}>;
};
type AttemptReview={
 assignment:{assignmentId:string;title:string;totalMarks:number};
 student:{studentId:string;studentName:string;studentCode:string};
 attempt:{attemptNumber:number;submittedAt:string;score:number;totalMarks:number;percentage:number;manualReviewMarks:number;finalized:boolean;teacherFeedback:string};
 attempts:Array<{attemptNumber:number;submittedAt:string;score:number;totalMarks:number;percentage:number;manualReviewMarks:number;finalized:boolean}>;
 questions:Array<{questionId:string;questionNumber:number;text:string;marks:number;type:string;autoGrade:{score:number;maxMarks:number;correct:boolean;manualReview:boolean;reviewed?:boolean}|null;manualScore:number|null;teacherComment:string}>;
};
type RangeKey="all"|"30"|"90"|"365";

const fmtDate=(value:string)=>value?new Date(value).toLocaleString("ar",{dateStyle:"medium",timeStyle:"short"}):"—";
const fmtPct=(value:number|null)=>value===null?"—":value.toFixed(1).replace(/\.0$/,"")+"%";
const clampPct=(value:number|null)=>Math.max(0,Math.min(100,Number(value??0)));
const maskIdentity=(value:string)=>value?"•••••"+value.slice(-4):"—";
const trendText=(delta:number)=>delta>=5?"يتحسن":delta<=-5?"يتراجع":"مستقر";
const trendIcon=(delta:number)=>delta>=5?"↑":delta<=-5?"↓":"→";
const csvCell=(value:unknown)=>`"${String(value??"").replace(/"/g,'""')}"`;


function AnimatedNumber({value,suffix="",decimals=0}:{value:number|null;suffix?:string;decimals?:number}){
 const [shown,setShown]=useState(0),previous=useRef(0);
 useEffect(()=>{const target=Number(value??0),from=previous.current,start=performance.now();let id=0;
  const tick=(now:number)=>{const p=Math.min(1,(now-start)/850),e=1-Math.pow(1-p,3);setShown(from+(target-from)*e);if(p<1)id=requestAnimationFrame(tick);else previous.current=target};
  id=requestAnimationFrame(tick);return()=>cancelAnimationFrame(id)},[value]);
 if(value===null)return <>—</>;
 return <>{shown.toFixed(decimals).replace(/.0$/,"")}{suffix}</>;
}
function LineChart({items}:{items:AssignmentTrend[]}){
 const points=items.filter(x=>x.average!==null);
 const data=useMemo(()=>({labels:points.map(x=>x.title),datasets:[{label:"متوسط العلامات",data:points.map(x=>clampPct(x.average)),borderColor:"#2563eb",backgroundColor:"rgba(37,99,235,.13)",pointBackgroundColor:"#2563eb",pointBorderColor:"#fff",pointBorderWidth:2,pointRadius:4,pointHoverRadius:7,borderWidth:3,tension:.38,fill:true}]}),[points]);
 const options:ChartOptions<"line">=useMemo(()=>({responsive:true,maintainAspectRatio:false,animation:{duration:1050,easing:"easeOutQuart"},interaction:{mode:"index",intersect:false},plugins:{legend:{display:false},tooltip:{rtl:true,callbacks:{label:i=>" المتوسط: "+Number(i.raw||0).toFixed(1)+"%"}}},scales:{y:{beginAtZero:true,max:100,ticks:{callback:v=>v+"%"},grid:{color:"rgba(148,163,184,.18)"}},x:{grid:{display:false},ticks:{maxRotation:0,autoSkip:true,maxTicksLimit:8}}}}),[]);
 if(points.length<2)return <div className="analytics-empty-chart">تظهر حركة الأداء بعد توفر نتيجتين على الأقل.</div>;
 return <div className="analytics-chart-canvas analytics-chart-line"><Line data={data} options={options}/></div>;
}
function DonutChart({submitted,missing,pendingReview}:{submitted:number;missing:number;pendingReview:number}){
 const total=Math.max(1,submitted+missing);
 const data=useMemo(()=>({labels:["تم التسليم","لم يُسلّم"],datasets:[{data:[submitted,missing],backgroundColor:["#2563eb","#e2e8f0"],borderColor:["#fff","#fff"],borderWidth:4,hoverOffset:8}]}),[submitted,missing]);
 const options:ChartOptions<"doughnut">=useMemo(()=>({responsive:true,maintainAspectRatio:false,cutout:"72%",animation:{duration:1150,easing:"easeOutQuart"},plugins:{legend:{display:false},tooltip:{rtl:true}}}),[]);
 return <div className="analytics-donut-layout"><div className="analytics-chart-canvas analytics-chart-donut"><Doughnut data={data} options={options}/><div className="analytics-donut-center"><strong><AnimatedNumber value={submitted/total*100} suffix="%"/></strong><span>تسليم</span></div></div><div className="analytics-legend"><span><i className="legend-dot submitted"/>تم التسليم <b>{submitted}</b></span><span><i className="legend-dot missing"/>لم يُسلّم <b>{missing}</b></span><span><i className="legend-dot review"/>تحتاج مراجعة <b>{pendingReview}</b></span></div></div>;
}
function GradeDistributionChart({items}:{items:Array<{label:string;count:number}>}){
 const data=useMemo(()=>({labels:items.map(x=>x.label),datasets:[{label:"عدد الطلاب",data:items.map(x=>x.count),backgroundColor:"rgba(37,99,235,.78)",borderRadius:8,borderSkipped:false}]}),[items]);
 const options:ChartOptions<"bar">=useMemo(()=>({responsive:true,maintainAspectRatio:false,animation:{duration:1000,easing:"easeOutQuart"},plugins:{legend:{display:false},tooltip:{rtl:true}},scales:{y:{beginAtZero:true,ticks:{precision:0},grid:{color:"rgba(148,163,184,.18)"}},x:{grid:{display:false}}}}),[]);
 if(!items.length)return <div className="analytics-empty-chart">لا توجد علامات بعد.</div>;
 return <div className="analytics-chart-canvas analytics-chart-bar"><Bar data={data} options={options}/></div>;
}
function ClassComparisonChart({items,onSelect}:{items:ClassComparison[];onSelect:(id:string)=>void}){
 const data=useMemo(()=>({labels:items.map(x=>x.name),datasets:[{label:"متوسط الصف",data:items.map(x=>clampPct(x.average)),backgroundColor:"rgba(14,165,233,.78)",borderRadius:8,borderSkipped:false}]}),[items]);
 const options:ChartOptions<"bar">=useMemo(()=>({responsive:true,maintainAspectRatio:false,indexAxis:"y",animation:{duration:1050,easing:"easeOutQuart"},onClick:(_e,els)=>{const i=els[0]?.index;if(i!==undefined&&items[i])onSelect(items[i].classId)},plugins:{legend:{display:false},tooltip:{rtl:true,callbacks:{label:i=>" المتوسط: "+Number(i.raw||0).toFixed(1)+"%"}}},scales:{x:{beginAtZero:true,max:100,ticks:{callback:v=>v+"%"},grid:{color:"rgba(148,163,184,.18)"}},y:{grid:{display:false}}}}),[items,onSelect]);
 if(!items.length)return <div className="analytics-empty-chart">لا توجد بيانات صفوف بعد.</div>;
 return <div className="analytics-chart-canvas analytics-chart-class"><Bar data={data} options={options}/><small className="analytics-chart-hint">اضغط على صف لعرض تفاصيله</small></div>;
}
function TopicChart({items}:{items:TopicAnalytics[]}){
 const visible=items.slice(0,10);
 const data=useMemo(()=>({labels:visible.map(x=>x.topic),datasets:[{label:"متوسط الموضوع",data:visible.map(x=>clampPct(x.average)),backgroundColor:visible.map(x=>Number(x.average||0)<60?"rgba(239,68,68,.76)":Number(x.average||0)>=80?"rgba(22,163,74,.76)":"rgba(245,158,11,.76)"),borderRadius:7,borderSkipped:false}]}),[visible]);
 const options:ChartOptions<"bar">=useMemo(()=>({responsive:true,maintainAspectRatio:false,indexAxis:"y",animation:{duration:1100,easing:"easeOutQuart"},plugins:{legend:{display:false},tooltip:{rtl:true,callbacks:{label:i=>" المتوسط: "+Number(i.raw||0).toFixed(1)+"%"}}},scales:{x:{beginAtZero:true,max:100,ticks:{callback:v=>v+"%"},grid:{color:"rgba(148,163,184,.18)"}},y:{grid:{display:false}}}}),[]);
 if(!visible.length)return <div className="analytics-empty-chart">ستظهر تحليلات الموضوعات بعد وجود إجابات مصححة.</div>;
 return <div className="analytics-chart-canvas analytics-chart-topic"><Bar data={data} options={options}/></div>;
}

function TeacherDashboard({token}:DashboardProps){
 const [data,setData]=useState<Analytics|null>(null);
 const [classId,setClassId]=useState("");
 const [range,setRange]=useState<RangeKey>("all");
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState("");
 const [assignmentResults,setAssignmentResults]=useState<AssignmentResults|null>(null);
 const [assignmentBusy,setAssignmentBusy]=useState(false);
 const [profile,setProfile]=useState<StudentProfile|null>(null);
 const [profileBusy,setProfileBusy]=useState(false);
 const [review,setReview]=useState<AttemptReview|null>(null);
 const [reviewBusy,setReviewBusy]=useState(false);

 async function teacherApi<T>(url:string):Promise<T>{
  const response=await fetch(url,{headers:{"x-builder-token":token,"Authorization":"Bearer "+token}});
  const result=await response.json() as T&ApiError;
  if(!response.ok)throw new Error(result.error||"تعذر تحميل البيانات.");
  return result;
 }

 function queryString(){
  const params=new URLSearchParams();
  if(classId)params.set("classId",classId);
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

 useEffect(()=>{void loadDashboard()},[classId,range]);

 async function openAssignment(item:AssignmentTrend){
  setAssignmentBusy(true);setError("");setReview(null);
  try{
   const result=await teacherApi<{ok:true}&AssignmentResults>("/api/assignment-results?assignmentId="+encodeURIComponent(item.assignmentId));
   setAssignmentResults(result);
  }catch(e){setError(e instanceof Error?e.message:"تعذر فتح تفاصيل الواجب.");}
  finally{setAssignmentBusy(false)}
 }

 async function openProfile(userId:string){
  setProfileBusy(true);setError("");
  try{
   const result=await teacherApi<{ok:true;profile:StudentProfile}>("/api/students?profileUserId="+encodeURIComponent(userId));
   setProfile(result.profile);
  }catch(e){setError(e instanceof Error?e.message:"تعذر فتح ملف الطالب.");}
  finally{setProfileBusy(false)}
 }

 async function openAttempt(assignmentId:string,studentId:string,attemptNumber:number){
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

 if(!data&&loading)return <div className="analytics-loading">⏳ جارٍ بناء لوحة التحليل...</div>;
 if(!data)return <div className="platform-error">{error||"لا توجد بيانات لعرضها."}</div>;

 const k=data.kpis;
 const selectedClass=data.classes.find(item=>item.classId===classId);

 return <div className="analytics-dashboard" dir="rtl">
  <section className="analytics-hero">
   <div><span className="platform-eyebrow">Professional Teacher Analytics · Chart.js</span><h2>لوحة المتابعة والتحليل</h2><p>نظرة شاملة على أداء الطلاب، التسليمات، الاتجاهات والموضوعات التي تحتاج تدخلًا.</p></div>
   <div className="analytics-hero-actions"><button onClick={()=>void loadDashboard()} disabled={loading}>↻ تحديث</button><button onClick={exportCsv}>⬇ Excel / CSV</button><button onClick={()=>window.print()}>🖨 طباعة / PDF</button></div>
  </section>

  <section className="analytics-filter-bar">
   <label>الصف<select value={classId} onChange={(e:{target:{value:string}})=>setClassId(e.target.value)}><option value="">كل الصفوف</option>{data.classes.filter(item=>item.active).map(item=><option key={item.classId} value={item.classId}>{item.name} · {item.grade||"—"}</option>)}</select></label>
   <label>الفترة<select value={range} onChange={(e:{target:{value:string}})=>setRange(e.target.value as RangeKey)}><option value="all">كل الفترة</option><option value="30">آخر 30 يومًا</option><option value="90">آخر 90 يومًا</option><option value="365">آخر سنة</option></select></label>
   <div className="analytics-scope"><strong>{selectedClass?.name||"كل الصفوف"}</strong><span>آخر تحديث: {fmtDate(data.generatedAt)}</span></div>
  </section>

  {error&&<div className="platform-error">{error}</div>}

  <section className="analytics-kpi-grid">
   <article className="analytics-kpi"><span>الطلاب الفعّالون</span><strong><AnimatedNumber value={k.activeStudents}/></strong><small>{classId?"في الصف المختار":k.activeClasses+" صفوف فعّالة"}</small></article>
   <article className="analytics-kpi"><span>متوسط العلامات</span><strong><AnimatedNumber value={k.average} suffix="%" decimals={1}/></strong><small>{k.highest===null?"لا توجد نتائج":"أعلى "+fmtPct(k.highest)+" · أدنى "+fmtPct(k.lowest)}</small></article>
   <article className="analytics-kpi"><span>نسبة التسليم</span><strong><AnimatedNumber value={k.completionRate} suffix="%" decimals={1}/></strong><small>{k.submissions} من {k.expectedSubmissions} حالة متوقعة</small></article>
   <article className="analytics-kpi attention"><span>يحتاجون متابعة</span><strong><AnimatedNumber value={k.followUpStudents}/></strong><small>{k.neverLogged} لم يسجلوا الدخول</small></article>
   <article className="analytics-kpi"><span>واجبات منشورة</span><strong><AnimatedNumber value={k.publishedAssignments}/></strong><small>{k.pendingReview} تحتاج مراجعة</small></article>
   <article className={`analytics-kpi ${k.performanceChange<0?"negative":"positive"}`}><span>اتجاه الأداء</span><strong>{trendIcon(k.performanceChange)} <AnimatedNumber value={Math.abs(k.performanceChange)} suffix="%" decimals={1}/></strong><small>{trendText(k.performanceChange)} مقارنة بالواجبات السابقة</small></article>
  </section>

  <section className="analytics-main-grid">
   <article className="analytics-card analytics-wide"><div className="analytics-card-head"><div><span className="platform-eyebrow">Performance Trend</span><h3>تطور متوسط الأداء</h3></div><span className="analytics-chip">آخر {data.assignmentTrend.length} واجبات</span></div><LineChart items={data.assignmentTrend}/></article>
   <article className="analytics-card"><div className="analytics-card-head"><div><span className="platform-eyebrow">Submission Status</span><h3>حالة التسليم</h3></div></div><DonutChart submitted={data.submissionStatus.submitted} missing={data.submissionStatus.missing} pendingReview={data.submissionStatus.pendingReview}/></article>
  </section>

  <section className="analytics-main-grid">
   <article className="analytics-card"><div className="analytics-card-head"><div><span className="platform-eyebrow">Grade Distribution</span><h3>توزيع العلامات</h3></div></div><GradeDistributionChart items={data.gradeDistribution}/></article>
   <article className="analytics-card"><div className="analytics-card-head"><div><span className="platform-eyebrow">Class Comparison</span><h3>مقارنة الصفوف</h3></div></div><ClassComparisonChart items={data.classComparison} onSelect={setClassId}/></article>
  </section>

  <section className="analytics-main-grid">
   <article className="analytics-card"><div className="analytics-card-head"><div><span className="platform-eyebrow">Topic Analytics</span><h3>الأداء حسب الموضوع</h3></div><span className="analytics-chip">الأضعف أولًا</span></div><TopicChart items={data.topicAnalytics}/></article>
   <article className="analytics-card"><div className="analytics-card-head"><div><span className="platform-eyebrow">Smart Insights</span><h3>مؤشرات ذكية للمعلم</h3></div></div><div className="analytics-insights">{data.insights.map((item,index)=><article key={index} className={"analytics-insight "+item.tone}><div className="analytics-insight-icon">{item.tone==="success"?"✓":item.tone==="warning"?"!":"i"}</div><div><strong>{item.title}</strong><p>{item.text}</p></div></article>)}</div></article>
  </section>

  <section className="analytics-main-grid">
   <article className="analytics-card analytics-wide"><div className="analytics-card-head"><div><span className="platform-eyebrow">Follow-up Center</span><h3>طلاب يحتاجون متابعة</h3></div><span className="analytics-chip warning">{data.followUp.length}</span></div><div className="students-table-wrap"><table className="students-table analytics-table"><thead><tr><th>الطالب</th><th>الصف</th><th>المعدل</th><th>غير مسلّم</th><th>الاتجاه</th><th>السبب</th><th></th></tr></thead><tbody>{data.followUp.map(item=><tr key={item.userId}><td><button className="analytics-link" onClick={()=>void openProfile(item.userId)}>{item.displayName}</button><small>{maskIdentity(item.identityNumber)}</small></td><td>{item.className}</td><td>{fmtPct(item.average)}</td><td>{item.missing}</td><td><span className={"analytics-trend-badge "+item.trend}>{trendIcon(item.trendDelta)} {trendText(item.trendDelta)} {item.trendDelta?Math.abs(item.trendDelta)+"%":""}</span></td><td>{item.reasons.join("، ")}</td><td><span className={"analytics-risk "+item.severity}>{item.severity==="high"?"عاجل":"متابعة"}</span></td></tr>)}{!data.followUp.length&&<tr><td colSpan={7}>لا توجد حالات متابعة بارزة ضمن النطاق الحالي.</td></tr>}</tbody></table></div></article>
   <article className="analytics-card"><div className="analytics-card-head"><div><span className="platform-eyebrow">Improvement</span><h3>أفضل تحسن</h3></div></div><div className="analytics-improvers">{data.topImprovers.map((item,index)=><button key={item.userId} onClick={()=>void openProfile(item.userId)}><span className="analytics-rank">{index+1}</span><div><strong>{item.displayName}</strong><small>{item.className}</small></div><b>↑ {item.trendDelta}%</b></button>)}{!data.topImprovers.length&&<div className="analytics-empty-chart">نحتاج نتائج متتابعة أكثر لقياس التحسن.</div>}</div></article>
  </section>

  <section className="analytics-card analytics-assignment-card"><div className="analytics-card-head"><div><span className="platform-eyebrow">Assignments</span><h3>متابعة الواجبات</h3></div><span className="analytics-chip">اضغط على واجب للتفاصيل</span></div><div className="students-table-wrap"><table className="students-table analytics-table"><thead><tr><th>الواجب</th><th>الصف</th><th>المتوسط</th><th>التسليم</th><th>غير مسلّم</th><th>مراجعة</th><th>الموعد</th></tr></thead><tbody>{[...data.assignmentTrend].reverse().map(item=><tr key={item.assignmentId} className="analytics-click-row" onClick={()=>void openAssignment(item)}><td><strong>{item.title}</strong></td><td>{item.className}</td><td>{fmtPct(item.average)}</td><td>{fmtPct(item.completionRate)}</td><td>{item.missing}</td><td>{item.pendingReview}</td><td>{item.dueAt?fmtDate(item.dueAt):"—"}</td></tr>)}{!data.assignmentTrend.length&&<tr><td colSpan={7}>لا توجد واجبات منشورة ضمن النطاق الحالي.</td></tr>}</tbody></table></div></section>

  {assignmentBusy&&<div className="analytics-loading">جارٍ تحميل تفاصيل الواجب...</div>}
  {assignmentResults&&<section className="analytics-drill-card"><div className="analytics-card-head"><div><span className="platform-eyebrow">Drill Down · Assignment</span><h3>{assignmentResults.assignment.title}</h3><p>من الواجب ← الطالب ← المحاولة ← السؤال</p></div><button onClick={()=>{setAssignmentResults(null);setReview(null)}}>إغلاق</button></div><div className="analytics-mini-kpis"><span>المتوسط <b>{fmtPct(assignmentResults.stats.average)}</b></span><span>سلّموا <b>{assignmentResults.stats.submitted}/{assignmentResults.stats.students}</b></span><span>مراجعة <b>{assignmentResults.stats.pendingReview}</b></span><span>أعلى <b>{fmtPct(assignmentResults.stats.highest)}</b></span></div><div className="students-table-wrap"><table className="students-table analytics-table"><thead><tr><th>الطالب</th><th>المحاولات</th><th>آخر علامة</th><th>الحالة</th><th>فتح محاولة</th></tr></thead><tbody>{assignmentResults.students.map(student=><tr key={student.studentId}><td><button className="analytics-link" onClick={()=>void openProfile(student.studentId)}>{student.studentName}</button></td><td>{student.attemptsUsed}/{student.allowedAttempts}</td><td>{student.latestResult?fmtPct(student.latestResult.percentage):"—"}</td><td>{!student.latestResult?"لم يسلّم":student.latestResult.finalized?"مصحح":"يحتاج مراجعة"}</td><td><div className="analytics-attempt-buttons">{student.attempts.map(attempt=><button key={attempt.attemptNumber} onClick={()=>void openAttempt(assignmentResults.assignment.assignmentId,student.studentId,attempt.attemptNumber)}>#{attempt.attemptNumber} · {fmtPct(attempt.percentage)}</button>)}</div></td></tr>)}</tbody></table></div></section>}

  {profileBusy&&<div className="analytics-loading">جارٍ فتح ملف الطالب...</div>}
  {profile&&<section className="analytics-drill-card"><div className="analytics-card-head"><div><span className="platform-eyebrow">Drill Down · Student</span><h3>{profile.student.displayName}</h3><p>{profile.classroom?.name||"—"} · {maskIdentity(profile.student.identityNumber)}</p></div><button onClick={()=>setProfile(null)}>إغلاق</button></div><div className="analytics-mini-kpis"><span>المعدل <b>{fmtPct(profile.stats.average)}</b></span><span>مكتملة <b>{profile.stats.completed}/{profile.stats.assigned}</b></span><span>ناقصة <b>{profile.stats.pending}</b></span><span>آخر دخول <b>{profile.stats.lastLoginAt?fmtDate(profile.stats.lastLoginAt):"لم يدخل"}</b></span></div><div className="students-table-wrap"><table className="students-table analytics-table"><thead><tr><th>الواجب</th><th>المحاولات</th><th>العلامة</th><th>النسبة</th><th>الحالة</th></tr></thead><tbody>{profile.assignments.map(item=><tr key={item.assignmentId}><td>{item.title}</td><td>{item.attemptsUsed}</td><td>{item.latestScore===null?"—":item.latestScore+"/"+item.totalMarks}</td><td>{fmtPct(item.latestPercentage)}</td><td>{item.latestScore===null?"لم يسلّم":item.finalized?"مصحح":"مراجعة"}</td></tr>)}</tbody></table></div></section>}

  {reviewBusy&&<div className="analytics-loading">جارٍ فتح تفاصيل المحاولة...</div>}
  {review&&<section className="analytics-drill-card"><div className="analytics-card-head"><div><span className="platform-eyebrow">Drill Down · Attempt · Questions</span><h3>{review.student.studentName} · المحاولة #{review.attempt.attemptNumber}</h3><p>{review.assignment.title} · {fmtPct(review.attempt.percentage)} · {review.attempt.finalized?"مصححة بالكامل":"تحتاج مراجعة"}</p></div><button onClick={()=>setReview(null)}>إغلاق</button></div><div className="analytics-attempt-buttons analytics-attempt-switcher">{review.attempts.map(attempt=><button className={attempt.attemptNumber===review.attempt.attemptNumber?"active":""} key={attempt.attemptNumber} onClick={()=>void openAttempt(review.assignment.assignmentId,review.student.studentId,attempt.attemptNumber)}>محاولة #{attempt.attemptNumber} · {fmtPct(attempt.percentage)}</button>)}</div><div className="students-table-wrap"><table className="students-table analytics-table"><thead><tr><th>#</th><th>السؤال</th><th>النوع</th><th>العلامة</th><th>الحالة</th></tr></thead><tbody>{review.questions.map(question=>{const score=question.manualScore??question.autoGrade?.score??0;const max=question.autoGrade?.maxMarks??question.marks;const pending=question.autoGrade?.manualReview===true&&question.autoGrade?.reviewed!==true&&question.manualScore===null;return <tr key={question.questionId}><td>{question.questionNumber}</td><td className="analytics-question-text">{question.text}</td><td>{question.type||"—"}</td><td>{score}/{max}</td><td>{pending?<span className="analytics-risk high">مراجعة</span>:<span className="status-active">مصحح</span>}</td></tr>})}</tbody></table></div>{review.attempt.teacherFeedback&&<div className="analytics-feedback"><strong>ملاحظة المعلم:</strong> {review.attempt.teacherFeedback}</div>}</section>}
 </div>;
}

export default TeacherDashboard;
