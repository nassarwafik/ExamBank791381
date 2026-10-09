// Phase 21C — deterministic acceptance exam for the general interactive 3D scene + semantic-selection runtime.
// The JSON fixture is generated from this source and validated through the production 21C authorities.
const v=(x,y,z)=>({x,y,z});
const obj=(id,label,kind,center,size,palette,rotation)=>({id,label,kind,center,size,palette,...(rotation?{rotation}:{})});
const target=(id,kind,label,objectId,element)=>({id,kind,label,objectId,...(element?{element}:{})});
const base=(id,title,description,objects,targets)=>({version:1,id,title,description,camera:{yaw:-0.65,pitch:0.45,zoom:1},interaction:{rotate:true,zoom:true,select:true},objects,targets});

export const SCENES_21C=Object.freeze({
  cube:(()=>{
    const objects=[obj("cube","المكعب","box",v(0,0,0),v(3,3,3),2)];
    const targets=[
      ...["front","back","left","right","top","bottom"].map(x=>target(x,"face","الوجه "+({"front":"الأمامي","back":"الخلفي","left":"الأيسر","right":"الأيمن","top":"العلوي","bottom":"السفلي"}[x]),"cube",x)),
      ...["A","B","C","D","E","F","G","H"].map(x=>target("v"+x,"vertex","الرأس "+x,"cube",x)),
      ...["AB","BC","CD","DA","EF","FG","GH","HE","AE","BF","CG","DH"].map(x=>target("e"+x,"edge","الحافة "+x,"cube",x))
    ];
    return base("scene-cube","مكعب تفاعلي","مكعب هندسي لاختيار أوجه وحواف ورؤوس دلاليًا.",objects,targets);
  })(),
  pyramid:(()=>{
    const objects=[obj("pyramid","الهرم","pyramid",v(0,0,0),v(3.4,3.2,3.4),4)];
    const targets=[
      target("base","face","القاعدة","pyramid","base"),
      ...["sideAB","sideBC","sideCD","sideDA"].map(x=>target(x,"face","وجه جانبي "+x.slice(4),"pyramid",x)),
      ...["A","B","C","D","E"].map(x=>target("v"+x,"vertex","الرأس "+x,"pyramid",x)),
      ...["AB","BC","CD","DA","AE","BE","CE","DE"].map(x=>target("e"+x,"edge","الحافة "+x,"pyramid",x))
    ];
    return base("scene-pyramid","هرم رباعي تفاعلي","هرم رباعي لتحديد الأوجه والحواف والرؤوس.",objects,targets);
  })(),
  heart:(()=>{
    const objects=[
      obj("leftVentricle","البطين الأيسر","ellipsoid",v(-0.45,-0.55,0),v(1.5,2.2,1.25),6,v(0,0,-0.18)),
      obj("rightVentricle","البطين الأيمن","ellipsoid",v(0.55,-0.45,0.12),v(1.35,1.95,1.1),5,v(0,0,0.16)),
      obj("leftAtrium","الأذين الأيسر","ellipsoid",v(-0.55,0.75,-0.08),v(1.1,1.05,1),6),
      obj("rightAtrium","الأذين الأيمن","ellipsoid",v(0.62,0.78,0.08),v(1.1,1.05,1),5),
      obj("aorta","الشريان الأبهر","cylinder",v(-0.1,1.55,0),v(0.48,1.45,0.48),3,v(0,0,0.08)),
      obj("pulmonary","الشريان الرئوي","cylinder",v(0.55,1.35,0.25),v(0.38,1.25,0.38),2,v(0,0,-0.25))
    ];
    return base("scene-heart","القلب — نموذج تعليمي مبسّط","نموذج تركيبي مبسّط للحجرات الأربع وبعض الأوعية الكبرى؛ ليس نموذجًا سريريًا.",objects,objects.map(o=>target(o.id,"object",o.label,o.id)));
  })(),
  torso:(()=>{
    const objects=[
      obj("leftLung","الرئة اليسرى","ellipsoid",v(-0.75,0.55,0),v(1.05,2.15,0.8),2,v(0,0,-0.08)),
      obj("rightLung","الرئة اليمنى","ellipsoid",v(0.75,0.55,0),v(1.05,2.15,0.8),2,v(0,0,0.08)),
      obj("heart","القلب","ellipsoid",v(-0.08,0.15,0.52),v(0.95,1.15,0.7),6,v(0,0,-0.2)),
      obj("liver","الكبد","ellipsoid",v(0.58,-1.05,0.1),v(1.8,0.8,0.75),4,v(0,0,0.12)),
      obj("stomach","المعدة","ellipsoid",v(-0.62,-1,0.18),v(0.95,1,0.7),3,v(0,0,-0.22))
    ];
    return base("scene-torso","أعضاء رئيسية في جذع جسم الإنسان","نموذج تعليمي مبسّط لتحديد أعضاء رئيسية في الجذع.",objects,objects.map(o=>target(o.id,"object",o.label,o.id)));
  })(),
  water:(()=>{
    const objects=[
      obj("oxygen","ذرة الأكسجين","sphere",v(0,0,0),v(1.25,1.25,1.25),6),
      obj("hydrogenLeft","ذرة هيدروجين","sphere",v(-1.25,-0.75,0),v(0.72,0.72,0.72),1),
      obj("hydrogenRight","ذرة هيدروجين","sphere",v(1.25,-0.75,0),v(0.72,0.72,0.72),1),
      obj("bondLeft","رابطة","cylinder",v(-0.62,-0.38,0),v(0.18,1.5,0.18),7,v(0,0,-0.72)),
      obj("bondRight","رابطة","cylinder",v(0.62,-0.38,0),v(0.18,1.5,0.18),7,v(0,0,0.72))
    ];
    return base("scene-water","جزيء ماء H₂O","تمثيل تعليمي مبسّط لذرة أكسجين وذرتي هيدروجين.",objects,[
      target("oxygen","object","ذرة الأكسجين","oxygen"),target("hydrogenLeft","object","ذرة الهيدروجين اليسرى","hydrogenLeft"),target("hydrogenRight","object","ذرة الهيدروجين اليمنى","hydrogenRight")
    ]);
  })()
});

export const INTERACTIVE_3D_ACCEPTANCE_PATH="docs/fixtures/interactive-3d-21c/ExamBank_21C_Interactive_3D_Acceptance.json";
export const serializeExam=exam=>JSON.stringify(exam,null,2)+"\n";

export function buildInteractive3DAcceptanceExam(){
  const S=SCENES_21C;
  const select=(id,text,scene,targetKind,mode,maxSelections,correct,marks=5)=>({
    examQuestionId:id,presentationType:"scene3DSelection",questionTypeVersion:1,text,marks,
    scene3DSelection:{v:1,scene,target:targetKind,mode,maxSelections,label:text},
    answer:{scoring:mode==="multiple"?"partial":"allOrNothing",correct}
  });
  const paragraph=text=>({type:"paragraph",runs:[{text}]});
  const rich=(...blocks)=>({schemaVersion:1,blocks});
  const section=(id,title,questions)=>({id,title,gradingPolicy:"all",questions});
  const richDemo={
    examQuestionId:"g1",presentationType:"multipleChoice",text:"أي وصف يعبّر عن النموذج المعروض؟",marks:5,
    richContent:rich(paragraph("دوّر النموذج ثم لاحظ الأجزاء المعروضة."),{type:"interactive3D",scene:S.water}),
    options:[{text:"جزيء ماء مبسّط"},{text:"مكعب"},{text:"قلب"},{text:"هرم"}],answer:{correctOptionIndex:0}
  };
  return {
    schemaVersion:2,examId:"EXAMBANK-21C-INTERACTIVE-3D",title:"ExamBank 21C — اختبار القبول للمجسمات ثلاثية الأبعاد التفاعلية",status:"draft",metadata:{},
    coverPage:{enabled:true,activityType:"exam",subtitle:"هندسة وأحياء وكيمياء بنموذج 3D دلالي",
      instructions:"دوّر وكبّر النموذج عند الحاجة ثم اختر العنصر المطلوب من النموذج أو من القائمة الدلالية.",
      instructionsRichContent:rich(paragraph("حركة الكاميرا لا تُعد إجابة؛ التصحيح يعتمد على معرّف العنصر الدلالي فقط.")),
      showStudentName:true,showClassName:true,showExamDate:true,showDuration:true,showTotalMarks:true,showMarksDistribution:true},
    presentation:{schemaVersion:1,preset:"modernAcademic"},
    sections:[
      section("sec-a","أ — أوجه المكعب",[select("a1","اختر الوجه المقابل للوجه السفلي في المكعب.",S.cube,"face","single",1,["face:top"])]),
      section("sec-b","ب — رؤوس المكعب",[select("b1","اختر الرأسين A و E.",S.cube,"vertex","multiple",2,["vertex:vA","vertex:vE"])]),
      section("sec-c","ج — الهرم",[select("c1","اختر الرأس الذي لا يقع على قاعدة الهرم.",S.pyramid,"vertex","single",1,["vertex:vE"])]),
      section("sec-d","د — القلب",[select("d1","اختر حجرة القلب التي تضخ الدم المؤكسج إلى الجسم عبر الشريان الأبهر.",S.heart,"object","single",1,["object:leftVentricle"])]),
      section("sec-e","هـ — جسم الإنسان",[select("e1","اختر العضو الكبير أسفل الرئة اليمنى والمشارك في إنتاج الصفراء.",S.torso,"object","single",1,["object:liver"])]),
      section("sec-f","و — الكيمياء",[select("f1","اختر الذرة التي تظهر مرة واحدة فقط في جزيء H₂O.",S.water,"object","single",1,["object:oxygen"])]),
      section("sec-g","ز — 3D كمحتوى غني",[richDemo])
    ]
  };
}
