const fs=require("fs"),path=require("path"),{execFileSync,execSync}=require("child_process");
const root=process.cwd(),P=(...x)=>path.join(root,...x),die=m=>{console.error("\nERROR: "+m);process.exit(1)};
let branch="";try{branch=execFileSync("git",["branch","--show-current"],{encoding:"utf8"}).trim()}catch{die("تعذر قراءة فرع Git.")}
if(branch!=="v2-dev")die("شغّل الملف على v2-dev. الفرع الحالي: "+branch);
const dash=P("src","TeacherDashboard.tsx"),cssFile=P("src","platform.css");
if(!fs.existsSync(dash)||!fs.existsSync(cssFile))die("Phase 2.0I غير موجودة.");
let s=fs.readFileSync(dash,"utf8"),css=fs.readFileSync(cssFile,"utf8");
if(!s.includes("Professional Teacher Analytics")||!s.includes("function LineChart"))die("TeacherDashboard.tsx لا يطابق Phase 2.0I.");
for(const f of [dash,cssFile,P("package.json"),P("package-lock.json")])if(fs.existsSync(f)&&!fs.existsSync(f+".bak-phase2j-chartjs"))fs.copyFileSync(f,f+".bak-phase2j-chartjs");

console.log("Installing Chart.js...");
execSync("npm install chart.js react-chartjs-2",{cwd:root,stdio:"inherit",shell:true});

const oldImport='import {useEffect,useMemo,useState} from "react";';
const newImport=`import {useEffect,useMemo,useRef,useState} from "react";
import {Chart as ChartJS,CategoryScale,LinearScale,PointElement,LineElement,BarElement,ArcElement,Tooltip,Legend,Filler,type ChartOptions} from "chart.js";
import {Line,Doughnut,Bar} from "react-chartjs-2";
ChartJS.register(CategoryScale,LinearScale,PointElement,LineElement,BarElement,ArcElement,Tooltip,Legend,Filler);`;
if(!s.includes(oldImport))die("تعذر تعديل imports.");
s=s.replace(oldImport,newImport);

const a=s.indexOf("function LineChart"),b=s.indexOf("function TeacherDashboard");
if(a<0||b<a)die("تعذر تحديد الرسوم القديمة.");

const charts=`
function AnimatedNumber({value,suffix="",decimals=0}:{value:number|null;suffix?:string;decimals?:number}){
 const [shown,setShown]=useState(0),previous=useRef(0);
 useEffect(()=>{const target=Number(value??0),from=previous.current,start=performance.now();let id=0;
  const tick=(now:number)=>{const p=Math.min(1,(now-start)/850),e=1-Math.pow(1-p,3);setShown(from+(target-from)*e);if(p<1)id=requestAnimationFrame(tick);else previous.current=target};
  id=requestAnimationFrame(tick);return()=>cancelAnimationFrame(id)},[value]);
 if(value===null)return <>—</>;
 return <>{shown.toFixed(decimals).replace(/\.0$/,"")}{suffix}</>;
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

`;
s=s.slice(0,a)+charts+s.slice(b);
s=s.replace(/ const maxDistribution=.*?\n const maxClassAverage=.*?\n\n/s,"");
s=s.replace('<strong>{k.activeStudents}</strong>','<strong><AnimatedNumber value={k.activeStudents}/></strong>')
 .replace('<strong>{fmtPct(k.average)}</strong>','<strong><AnimatedNumber value={k.average} suffix="%" decimals={1}/></strong>')
 .replace('<strong>{fmtPct(k.completionRate)}</strong>','<strong><AnimatedNumber value={k.completionRate} suffix="%" decimals={1}/></strong>')
 .replace('<strong>{k.followUpStudents}</strong>','<strong><AnimatedNumber value={k.followUpStudents}/></strong>')
 .replace('<strong>{k.publishedAssignments}</strong>','<strong><AnimatedNumber value={k.publishedAssignments}/></strong>')
 .replace('<strong>{trendIcon(k.performanceChange)} {Math.abs(k.performanceChange).toFixed(1)}%</strong>','<strong>{trendIcon(k.performanceChange)} <AnimatedNumber value={Math.abs(k.performanceChange)} suffix="%" decimals={1}/></strong>');

const grade='<div className="analytics-bars">{data.gradeDistribution.map(item=><div className="analytics-bar-row" key={item.label}><span>{item.label}</span><div><i style={{width:(item.count/maxDistribution*100)+"%"}}/></div><b>{item.count}</b></div>)}</div>';
const cls='<div className="analytics-bars">{data.classComparison.map(item=><button className="analytics-bar-row analytics-bar-button" key={item.classId} onClick={()=>setClassId(item.classId)}><span>{item.name}</span><div><i style={{width:(Number(item.average||0)/maxClassAverage*100)+"%"}}/></div><b>{fmtPct(item.average)}</b></button>)}{!data.classComparison.length&&<div className="analytics-empty-chart">لا توجد بيانات صفوف بعد.</div>}</div>';
const topic='<div className="analytics-topic-list">{data.topicAnalytics.map(item=><div key={item.topic}><div><strong>{item.topic}</strong><span>{fmtPct(item.average)} · {item.gradedQuestions} إجابة مصححة</span></div><div className="analytics-topic-track"><i className={Number(item.average||0)<60?"weak":Number(item.average||0)>=80?"strong":""} style={{width:clampPct(item.average)+"%"}}/></div></div>)}{!data.topicAnalytics.length&&<div className="analytics-empty-chart">ستظهر تحليلات الموضوعات بعد وجود إجابات مصححة.</div>}</div>';
if(!s.includes(grade)||!s.includes(cls)||!s.includes(topic))die("تعذر استبدال أحد الرسوم اليدوية.");
s=s.replace(grade,'<GradeDistributionChart items={data.gradeDistribution}/>')
 .replace(cls,'<ClassComparisonChart items={data.classComparison} onSelect={setClassId}/>')
 .replace(topic,'<TopicChart items={data.topicAnalytics}/>')
 .replace('<span className="platform-eyebrow">Professional Teacher Analytics</span>','<span className="platform-eyebrow">Professional Teacher Analytics · Chart.js</span>');
fs.writeFileSync(dash,s,"utf8");

if(!css.includes("EXAMBANK_2_PHASE_J_CHARTJS")){
 css+=`
/* EXAMBANK_2_PHASE_J_CHARTJS */
.analytics-chart-canvas{position:relative;width:100%;height:300px;direction:rtl}
.analytics-chart-line{height:310px}.analytics-chart-bar{height:290px}.analytics-chart-class{height:300px}.analytics-chart-topic{height:360px}
.analytics-chart-donut{height:235px;max-width:260px;margin:0 auto;position:relative}
.analytics-donut-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none}
.analytics-donut-center strong{font-size:28px;color:#0f172a;line-height:1}.analytics-donut-center span{margin-top:6px;font-size:11px;color:#64748b;font-weight:800}
.analytics-chart-hint{display:block;text-align:center;color:#94a3b8;margin-top:4px}.analytics-kpi strong{font-variant-numeric:tabular-nums}
@media(max-width:720px){.analytics-chart-canvas{height:260px}.analytics-chart-topic{height:330px}.analytics-chart-donut{height:210px}}
`;
 fs.writeFileSync(cssFile,css,"utf8");
}
console.log("Updated TeacherDashboard.tsx + platform.css + npm dependencies");
console.log("\nRunning build...\n");
execSync("npm run build",{cwd:root,stdio:"inherit",shell:true});
console.log("\nPhase 2.0J Animated Professional Charts installed successfully.");
console.log("Included: Chart.js animated line/doughnut/bar charts, hover tooltips, animated KPI counters, class click drill-down.");
