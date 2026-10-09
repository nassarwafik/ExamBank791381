// Phase 21C — scene3DSelection@1: semantic target selection on an ExamBank-owned interactive 3D scene.
// Student answers carry stable target keys only; never screen pixels, camera angles or renderer state.
import { effectiveQuestionTypeVersion } from "./questionTypeCatalog";
import { CONTROL, RAW_HTML } from "./richContent/proseGuard";
import { projectInteractive3DSceneForStudent, scene3DTargetKey, scene3DTargets, SCENE3D_TARGET_KINDS, SCENE3D_TARGET_KIND_LABELS, validateInteractive3DSceneSpec, type Interactive3DSceneSpecV1, type Scene3DTargetKind, type Scene3DTargetV1 } from "./interactive3d/sceneSpec";

export const SCENE3D_SELECTION_TYPE_KEY="scene3DSelection";
export const SCENE3D_SELECTION_CONFIG_VERSION=1;
export const SCENE3D_SELECTION_LIMITS=Object.freeze({labelChars:160,minTargets:2,responseTargets:128});
export const SCENE3D_SELECTION_MODES=Object.freeze(["single","multiple"] as const);
export type Scene3DSelectionMode=(typeof SCENE3D_SELECTION_MODES)[number];
export const SCENE3D_SELECTION_SCORING=Object.freeze(["allOrNothing","partial"] as const);
export type Scene3DSelectionScoring=(typeof SCENE3D_SELECTION_SCORING)[number];
export type Scene3DSelectionConfigV1={v:1;scene:Interactive3DSceneSpecV1;target:Scene3DTargetKind;mode:Scene3DSelectionMode;maxSelections:number;label?:string};
export type Scene3DSelectionAnswerKeyV1={scoring:Scene3DSelectionScoring;correct:string[]};
export type Scene3DSelectionAnswer={kind:"scene3DSelection";sceneId:string;targets:string[]};
export type Scene3DSelectionIssue={code:string;message:string;severity:"error";path?:string};

const err=(code:string,message:string,path?:string):Scene3DSelectionIssue=>({code,message,severity:"error",...(path?{path}:{})});
const FORBIDDEN=new Set(["__proto__","constructor","prototype"]);
const isPlain=(v:unknown):v is Record<string,unknown>=>{if(!v||typeof v!=="object"||Array.isArray(v))return false;const p=Object.getPrototypeOf(v);return p===Object.prototype||p===null;};
const onlyKeys=(o:Record<string,unknown>,allowed:readonly string[])=>Object.keys(o).every(k=>allowed.includes(k)&&!FORBIDDEN.has(k));
const own=(o:Record<string,unknown>,k:string)=>Object.prototype.hasOwnProperty.call(o,k);
const ID=/^[A-Za-z][A-Za-z0-9_-]{0,31}$/;
const TARGET=/^(object|face|edge|vertex):[A-Za-z][A-Za-z0-9_-]{0,31}$/;
const BIDI=/[\u202A-\u202E\u2066-\u2069]/, INVISIBLE=/[\u00AD\u034F\u061C\u180E\u200B\u200E\u200F\u2060\uFEFF]/;

export const defaultScene3DSelectionAnswerKey=():Scene3DSelectionAnswerKeyV1=>({scoring:"allOrNothing",correct:[]});
export const scene3DSelectionQuestionVersion=(node:unknown):number|undefined=>isPlain(node)?effectiveQuestionTypeVersion(SCENE3D_SELECTION_TYPE_KEY,node.questionTypeVersion):undefined;

export type Scene3DSelectionConfigResult={ok:true;config:Scene3DSelectionConfigV1;targets:Scene3DTargetV1[];issues:[]}|{ok:false;issues:Scene3DSelectionIssue[]};
export function validateScene3DSelectionConfig(raw:unknown):Scene3DSelectionConfigResult{
  if(!isPlain(raw))return{ok:false,issues:[err("SCENE3D_SELECTION_CONFIG_MISSING","إعداد سؤال الاختيار من نموذج 3D مفقود أو غير صالح.","scene3DSelection")]};
  const issues:Scene3DSelectionIssue[]=[];
  if(!onlyKeys(raw,["v","scene","target","mode","maxSelections","label"]))issues.push(err("SCENE3D_SELECTION_UNKNOWN_KEY","إعداد سؤال 3D يحتوي حقولًا غير معروفة.","scene3DSelection"));
  if(raw.v!==1)issues.push(err("SCENE3D_SELECTION_VERSION","إصدار سؤال 3D غير مدعوم.","scene3DSelection.v"));
  const scene=validateInteractive3DSceneSpec(raw.scene,"scene3DSelection.scene");
  if(!scene.ok)issues.push(...scene.issues.slice(0,10).map(i=>err("SCENE3D_SELECTION_SCENE_INVALID",i.message+" ["+i.code+"]",i.path)));
  const target=raw.target,mode=raw.mode;
  if(typeof target!=="string"||!(SCENE3D_TARGET_KINDS as readonly string[]).includes(target))issues.push(err("SCENE3D_SELECTION_TARGET_INVALID","حدّد ما يختاره الطالب: مجسم/جزء أو وجه أو حافة أو رأس.","scene3DSelection.target"));
  if(typeof mode!=="string"||!(SCENE3D_SELECTION_MODES as readonly string[]).includes(mode))issues.push(err("SCENE3D_SELECTION_MODE_INVALID","طريقة الاختيار غير معروفة.","scene3DSelection.mode"));
  let label:string|undefined;
  if(own(raw,"label")){
    const l=raw.label;
    if(typeof l!=="string"||!l.trim()||l.trim().length>SCENE3D_SELECTION_LIMITS.labelChars||CONTROL.test(l)||RAW_HTML.test(l)||BIDI.test(l)||INVISIBLE.test(l))issues.push(err("SCENE3D_SELECTION_LABEL_INVALID","تعليمة الاختيار نص عادي غير فارغ حتى 160 حرفًا.","scene3DSelection.label"));
    else label=l.trim();
  }
  let targets:Scene3DTargetV1[]=[];
  if(scene.ok&&typeof target==="string"&&(SCENE3D_TARGET_KINDS as readonly string[]).includes(target)){
    if(!scene.value.interaction.select)issues.push(err("SCENE3D_SELECTION_SELECT_DISABLED","المشهد لا يسمح بالاختيار؛ فعّل select في إعداد التفاعل.","scene3DSelection.scene.interaction.select"));
    targets=scene3DTargets(scene.value,target as Scene3DTargetKind);
    if(targets.length<SCENE3D_SELECTION_LIMITS.minTargets)issues.push(err("SCENE3D_SELECTION_TARGETS_TOO_FEW","يحتاج السؤال عنصرين على الأقل من نوع «"+SCENE3D_TARGET_KIND_LABELS[target as Scene3DTargetKind]+"».","scene3DSelection.target"));
  }
  const max=raw.maxSelections;
  if(typeof max!=="number"||!Number.isInteger(max)||max<1||(targets.length>0&&max>targets.length)||(mode==="single"&&max!==1))issues.push(err("SCENE3D_SELECTION_MAX_INVALID","الحد الأقصى للاختيارات غير صالح.","scene3DSelection.maxSelections"));
  if(issues.length||!scene.ok)return{ok:false,issues};
  return{ok:true,config:{v:1,scene:scene.value,target:target as Scene3DTargetKind,mode:mode as Scene3DSelectionMode,maxSelections:max as number,...(label?{label}:{})},targets,issues:[]};
}

type KeyResult={ok:true;key:Scene3DSelectionAnswerKeyV1;issues:[]}|{ok:false;issues:Scene3DSelectionIssue[]};
function checkKey(raw:unknown,cfg:{config:Scene3DSelectionConfigV1;targets:Scene3DTargetV1[]}|null):KeyResult{
  if(!isPlain(raw))return{ok:false,issues:[err("SCENE3D_SELECTION_KEY_INVALID","مفتاح تصحيح سؤال 3D مفقود أو غير صالح.","answer")]};
  const issues:Scene3DSelectionIssue[]=[];
  if(!onlyKeys(raw,["scoring","correct"]))issues.push(err("SCENE3D_SELECTION_KEY_INVALID","مفتاح التصحيح يحتوي حقولًا غير معروفة.","answer"));
  const scoring=raw.scoring;
  if(typeof scoring!=="string"||!(SCENE3D_SELECTION_SCORING as readonly string[]).includes(scoring))issues.push(err("SCENE3D_SELECTION_SCORING_UNKNOWN","طريقة الاحتساب غير معروفة.","answer.scoring"));
  const correct=raw.correct;
  if(!Array.isArray(correct)||correct.some(x=>typeof x!=="string")){issues.push(err("SCENE3D_SELECTION_KEY_INVALID","الاختيارات الصحيحة غير صالحة.","answer.correct"));return{ok:false,issues};}
  if(!cfg)return issues.length?{ok:false,issues}:{ok:true,key:{scoring:scoring as Scene3DSelectionScoring,correct:[...(correct as string[])]},issues:[]};
  if(cfg.config.mode==="single"&&scoring==="partial")issues.push(err("SCENE3D_SELECTION_SCORING_UNKNOWN","الاختيار الواحد يُصحّح بالكل أو لا شيء.","answer.scoring"));
  const order=cfg.targets.map(scene3DTargetKey),keys=correct as string[];
  if(!keys.length)issues.push(err("SCENE3D_SELECTION_KEY_EMPTY","حدّد الإجابة الصحيحة على النموذج.","answer.correct"));
  if(new Set(keys).size!==keys.length)issues.push(err("SCENE3D_SELECTION_KEY_DUPLICATE","الإجابة الصحيحة مكررة.","answer.correct"));
  const unknown=keys.filter(k=>!order.includes(k));
  if(unknown.length)issues.push(err("SCENE3D_SELECTION_KEY_UNKNOWN_TARGET","مفتاح التصحيح يذكر هدفًا غير موجود: «"+unknown[0].slice(0,48)+"».","answer.correct"));
  if(cfg.config.mode==="single"&&keys.length>1)issues.push(err("SCENE3D_SELECTION_KEY_SINGLE","الاختيار الواحد له إجابة صحيحة واحدة.","answer.correct"));
  if(keys.length>cfg.config.maxSelections)issues.push(err("SCENE3D_SELECTION_KEY_UNREACHABLE","عدد الإجابات الصحيحة أكبر من الحد المتاح للطالب.","answer.correct"));
  return issues.length?{ok:false,issues}:{ok:true,key:{scoring:scoring as Scene3DSelectionScoring,correct:order.filter(k=>keys.includes(k))},issues:[]};
}
export function validateScene3DSelectionAnswerKey(raw:unknown,rawConfig:unknown):KeyResult{
  const cfg=validateScene3DSelectionConfig(rawConfig);
  if(!cfg.ok)return{ok:false,issues:[err("SCENE3D_SELECTION_KEY_CONFIG_INVALID","لا يمكن فحص المفتاح لأن إعداد سؤال 3D غير صالح.","scene3DSelection")]};
  return checkKey(raw,cfg);
}
export function validateScene3DSelectionQuestion(node:Record<string,unknown>):Scene3DSelectionIssue[]{
  const out:Scene3DSelectionIssue[]=[];
  if(scene3DSelectionQuestionVersion(node)===undefined)out.push(err("SCENE3D_SELECTION_VERSION_UNSUPPORTED","إصدار سؤال 3D غير مدعوم.","questionTypeVersion"));
  const cfg=validateScene3DSelectionConfig(node.scene3DSelection);if(!cfg.ok)out.push(...cfg.issues);
  const key=checkKey(node.answer,cfg.ok?cfg:null);if(!key.ok)out.push(...key.issues);
  return out;
}
export function projectScene3DSelectionConfigForStudent(raw:unknown):Scene3DSelectionConfigV1|null{
  const r=validateScene3DSelectionConfig(raw);
  if(!r.ok)return null;
  const scene=projectInteractive3DSceneForStudent(r.config.scene);
  return scene?{...r.config,scene}:null;
}

type ReadResult={ok:true;targets:string[]}|{ok:false;code:string};
function readResponse(response:unknown,cfg:{config:Scene3DSelectionConfigV1;targets:Scene3DTargetV1[]}):ReadResult{
  if(!isPlain(response)||response.kind!=="scene3DSelection"||!Array.isArray(response.targets))return{ok:false,code:"SCENE3D_SELECTION_ANSWER_INVALID"};
  if(response.sceneId!==cfg.config.scene.id)return{ok:false,code:"SCENE3D_SELECTION_SCENE_MISMATCH"};
  const given=response.targets;
  if(given.length>Math.min(cfg.config.maxSelections,SCENE3D_SELECTION_LIMITS.responseTargets))return{ok:false,code:"SCENE3D_SELECTION_TOO_MANY"};
  if(given.some(k=>typeof k!=="string"))return{ok:false,code:"SCENE3D_SELECTION_ANSWER_INVALID"};
  const order=cfg.targets.map(scene3DTargetKey);
  if((given as string[]).some(k=>!order.includes(k)))return{ok:false,code:"SCENE3D_SELECTION_TARGET_UNKNOWN"};
  if(new Set(given).size!==given.length)return{ok:false,code:"SCENE3D_SELECTION_DUPLICATE"};
  return{ok:true,targets:order.filter(k=>(given as string[]).includes(k))};
}
export type Scene3DSelectionAnswerResult={ok:true;answer:Scene3DSelectionAnswer}|{ok:false;code:string};
export function normalizeScene3DSelectionAnswer(a:unknown):Scene3DSelectionAnswerResult{
  if(!isPlain(a)||a.kind!=="scene3DSelection"||typeof a.sceneId!=="string"||!ID.test(a.sceneId)||FORBIDDEN.has(a.sceneId)||!Array.isArray(a.targets))return{ok:false,code:"SCENE3D_SELECTION_ANSWER_INVALID"};
  if(a.targets.length>SCENE3D_SELECTION_LIMITS.responseTargets)return{ok:false,code:"SCENE3D_SELECTION_TOO_MANY"};
  if(a.targets.some(k=>typeof k!=="string"||!TARGET.test(k)))return{ok:false,code:"SCENE3D_SELECTION_ANSWER_INVALID"};
  if(new Set(a.targets).size!==a.targets.length)return{ok:false,code:"SCENE3D_SELECTION_DUPLICATE"};
  return{ok:true,answer:{kind:"scene3DSelection",sceneId:a.sceneId,targets:[...(a.targets as string[])]}};
}
export function bindScene3DSelectionAnswerToQuestion(a:unknown,question:unknown):Scene3DSelectionAnswerResult{
  const shape=normalizeScene3DSelectionAnswer(a);if(!shape.ok)return shape;
  const cfg=isPlain(question)?validateScene3DSelectionConfig(question.scene3DSelection):null;
  if(!cfg||!cfg.ok)return shape;
  const r=readResponse(shape.answer,cfg);
  return r.ok?{ok:true,answer:{kind:"scene3DSelection",sceneId:cfg.config.scene.id,targets:r.targets}}:r;
}
export const isScene3DSelectionAnswerAnswered=(a:unknown):boolean=>isPlain(a)&&a.kind==="scene3DSelection"&&Array.isArray(a.targets)&&a.targets.length>0;

export type Scene3DSelectionScore={score:number;correct:boolean;manualReview:boolean;parts:{correct:number;total:number}};
export const SCENE3D_SELECTION_FAIL_CLOSED:Readonly<Scene3DSelectionScore>=Object.freeze({score:0,correct:false,manualReview:true,parts:Object.freeze({correct:0,total:0})});
type Authority={config:Scene3DSelectionConfigV1;targets:Scene3DTargetV1[];key:Scene3DSelectionAnswerKeyV1};
function authorityOf(rawConfig:unknown,rawKey:unknown):Authority|null{
  const cfg=validateScene3DSelectionConfig(rawConfig);if(!cfg.ok)return null;
  const key=checkKey(rawKey,cfg);return key.ok?{config:cfg.config,targets:cfg.targets,key:key.key}:null;
}
export function scoreScene3DSelection(input:{config:unknown;answerKey:unknown;response:unknown;maxMarks:number}):Scene3DSelectionScore{
  const max=Number.isFinite(input.maxMarks)?Math.max(0,input.maxMarks):0,auth=authorityOf(input.config,input.answerKey);
  if(!auth)return{...SCENE3D_SELECTION_FAIL_CLOSED,parts:{...SCENE3D_SELECTION_FAIL_CLOSED.parts}};
  const total=auth.key.correct.length,r=readResponse(input.response,auth);
  if(!r.ok)return{score:0,correct:false,manualReview:false,parts:{correct:0,total}};
  const hits=r.targets.filter(k=>auth.key.correct.includes(k)).length,union=new Set([...r.targets,...auth.key.correct]).size;
  const exact=hits===total&&r.targets.length===total;
  const score=auth.key.scoring==="allOrNothing"?(exact?max:0):max*hits/Math.max(1,union);
  return{score:Math.min(max,Math.max(0,score)),correct:exact,manualReview:false,parts:{correct:hits,total}};
}
export type Scene3DSelectionEvaluation={ok:true;correct:number;total:number;exact:boolean;results:{key:string;label:string;detail:string;selected:boolean;expected:boolean;mark:"correct"|"incorrect"|"missed"|null}[]}|{ok:false;issues:Scene3DSelectionIssue[]};
export function evaluateScene3DSelection(rawConfig:unknown,rawKey:unknown,rawResponse:unknown):Scene3DSelectionEvaluation{
  const auth=authorityOf(rawConfig,rawKey);
  if(!auth){const cfg=validateScene3DSelectionConfig(rawConfig);return{ok:false,issues:cfg.ok?validateScene3DSelectionAnswerKey(rawKey,rawConfig).issues:cfg.issues};}
  const r=readResponse(rawResponse,auth),chosen=new Set(r.ok?r.targets:[]);
  const results=auth.targets.map(t=>{const key=scene3DTargetKey(t),selected=chosen.has(key),expected=auth.key.correct.includes(key);return{key,label:t.label,detail:t.detail??"",selected,expected,mark:selected&&expected?"correct" as const:selected?"incorrect" as const:expected?"missed" as const:null};});
  const hits=results.filter(x=>x.mark==="correct").length;
  return{ok:true,correct:hits,total:auth.key.correct.length,exact:hits===auth.key.correct.length&&chosen.size===hits,results};
}
