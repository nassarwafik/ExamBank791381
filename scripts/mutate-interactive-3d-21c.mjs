#!/usr/bin/env node
// Phase 21C focused mutation certification: semantic 3D contract, target binding, grading and interaction.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { spawnSync } from "node:child_process";
const SPEC="src/interactive3d/sceneSpec.ts",SELECT="src/scene3DSelectionQuestion.ts",MESH="src/interactive3d/sceneMesh.ts",VIEW="src/interactive3d/Interactive3DView.tsx";
const CORE=["src/interactive3d/interactive3d.21c.test.tsx","api/tests/certification-21c/cert-21c-3d-lifecycle.test.js"];
const UI=["src/interactive3d/interactive3d.21c.test.tsx"];
const M=(id,file,before,after,tests=CORE)=>({id,file,before,after,tests});
const mutants=[
 M("S01-nonplain",SPEC,'return p === Object.prototype || p === null;','return true;'),
 M("S02-exact-keys",SPEC,'if (!exactKeys(v, keys)) add("SCENE3D_UNKNOWN_KEY"','if (false && !exactKeys(v, keys)) add("SCENE3D_UNKNOWN_KEY"'),
 M("S03-version",SPEC,'if (top.version !== 1) add("SCENE3D_VERSION_INVALID"','if (false && top.version !== 1) add("SCENE3D_VERSION_INVALID"'),
 M("S04-prototype-id",SPEC,'|| FORBIDDEN.has(v)) { add("SCENE3D_ID_INVALID"','|| false) { add("SCENE3D_ID_INVALID"'),
 M("S05-bidi-text",SPEC,'|| BIDI.test(v) || INVISIBLE.test(v))','|| false || INVISIBLE.test(v))'),
 M("S06-invisible-text",SPEC,'|| INVISIBLE.test(v))','|| false)'),
 M("S07-object-limit",SPEC,'top.objects.length > SCENE3D_LIMITS.objects','top.objects.length > SCENE3D_LIMITS.objects * 10'),
 M("S08-duplicate-object",SPEC,'if (objectId && objectIds.has(objectId))','if (false && objectId && objectIds.has(objectId))'),
 M("S09-target-object",SPEC,'if (objectId && !objectRef) add("SCENE3D_TARGET_OBJECT_UNKNOWN"','if (false && objectId && !objectRef) add("SCENE3D_TARGET_OBJECT_UNKNOWN"'),
 M("S10-target-element",SPEC,'if (kind && objectRef && !validElement(kind, objectRef, element))','if (false && kind && objectRef && !validElement(kind, objectRef, element))'),

 M("Q01-config-exact",SELECT,'if(!onlyKeys(raw,["v","scene","target","mode","maxSelections","label"]))','if(false && !onlyKeys(raw,["v","scene","target","mode","maxSelections","label"]))'),
 M("Q02-select-enabled",SELECT,'if(!scene.value.interaction.select)issues.push(','if(false && !scene.value.interaction.select)issues.push('),
 M("Q03-target-minimum",SELECT,'if(targets.length<SCENE3D_SELECTION_LIMITS.minTargets)','if(false && targets.length<SCENE3D_SELECTION_LIMITS.minTargets)'),
 M("Q04-max-bound",SELECT,'||(targets.length>0&&max>targets.length)||(mode==="single"&&max!==1))','||(false&&targets.length>0&&max>targets.length)||(mode==="single"&&max!==1))'),
 M("Q05-key-duplicate",SELECT,'if(new Set(keys).size!==keys.length)','if(false && new Set(keys).size!==keys.length)'),
 M("Q06-key-unknown",SELECT,'if(unknown.length)issues.push(','if(false && unknown.length)issues.push('),
 M("Q07-scene-mismatch",SELECT,'if(response.sceneId!==cfg.config.scene.id)return{ok:false,code:"SCENE3D_SELECTION_SCENE_MISMATCH"};','if(false)return{ok:false,code:"SCENE3D_SELECTION_SCENE_MISMATCH"};'),
 M("Q08-response-unknown",SELECT,'if((given as string[]).some(k=>!order.includes(k)))return{ok:false,code:"SCENE3D_SELECTION_TARGET_UNKNOWN"};','if(false)return{ok:false,code:"SCENE3D_SELECTION_TARGET_UNKNOWN"};'),
 M("Q09-normalize-duplicate",SELECT,'if(new Set(a.targets).size!==a.targets.length)return{ok:false,code:"SCENE3D_SELECTION_DUPLICATE"};','if(false)return{ok:false,code:"SCENE3D_SELECTION_DUPLICATE"};'),
 M("Q10-partial-union",SELECT,'max*hits/Math.max(1,union)','max*hits/Math.max(1,total)'),

 M("M01-box-face-semantic",MESH,'["top",["D","C","G","H"]]','["top",["A","B","F","E"]]'),
 M("V01-home-reset",VIEW,'else if(key==="Home")reset(); else return false;','else if(false&&key==="Home")reset(); else return false;',UI)
];
const sha=s=>crypto.createHash("sha256").update(s).digest("hex"),files=[...new Set(mutants.map(m=>m.file))];
const BACKUP=path.join(os.tmpdir(),"exambank-21c-mutation-backup.json");
if(fs.existsSync(BACKUP)){const stale=JSON.parse(fs.readFileSync(BACKUP,"utf8"));for(const [file,contents] of Object.entries(stale))fs.writeFileSync(file,contents,"utf8");fs.rmSync(BACKUP,{force:true});console.log("21C_MUTATION_RESTORED_STALE_BACKUP");}
if(process.argv.includes("--restore"))process.exit(0);
const original=new Map(files.map(file=>[file,fs.readFileSync(file,"utf8")]));
const restore=()=>{for(const [file,contents] of original)fs.writeFileSync(file,contents,"utf8");fs.rmSync(BACKUP,{force:true});};
for(const sig of ["SIGINT","SIGTERM","SIGHUP"])process.on(sig,()=>{restore();process.exit(130);});
const hashes=Object.fromEntries([...original].map(([file,value])=>[file,sha(value)]));
const dirty=spawnSync("git",["status","--porcelain","--",...files],{encoding:"utf8"});if(dirty.status!==0||dirty.stdout.trim()){console.error("Mutated sources must start clean.",dirty.stdout);process.exit(3);}
const vitest=tests=>spawnSync(process.execPath,["node_modules/vitest/vitest.mjs","run","--reporter=dot",...tests],{encoding:"utf8",timeout:100000,maxBuffer:5*1024*1024,env:{...process.env,CI:"true"}});
const all=[...new Set(mutants.flatMap(m=>m.tests))],baseline=vitest(all);if(baseline.status!==0){console.error("BASELINE RED",baseline.stdout.slice(-5000),baseline.stderr.slice(-3000));process.exit(4);}
console.log("21C_MUTATION_BASELINE_GREEN",JSON.stringify({tests:all,mutants:mutants.length,files:hashes}));
const ledger=[];fs.writeFileSync(BACKUP,JSON.stringify(Object.fromEntries(original)),"utf8");
try{for(const m of mutants){let outcome="invalid",diagnostic="";const source=original.get(m.file),occ=source.split(m.before).length-1;
 if(occ!==1)diagnostic="needle count "+occ;else if(m.before===m.after)diagnostic="mutation identical";else{try{fs.writeFileSync(m.file,source.replace(m.before,m.after),"utf8");const r=vitest(m.tests),output=(r.stdout||"")+"\n"+(r.stderr||"");
  if(r.error?.code==="ETIMEDOUT"||r.signal){outcome="timeout";diagnostic=String(r.error||r.signal);}else if(r.status===0){outcome="survived";diagnostic="Selected tests passed";}else if(/Transform failed|Failed to parse source|SyntaxError:|Unexpected token|Error during transform/.test(output)){outcome="invalid";diagnostic=output.slice(-800);}else{outcome="killed";diagnostic=output.split("\n").filter(x=>/FAIL |AssertionError|Test Files|Tests +/.test(x)).slice(0,4).join(" ").slice(0,700);}}finally{fs.writeFileSync(m.file,source,"utf8");}}
 const record={id:m.id,file:m.file,outcome,diagnostic};ledger.push(record);console.log("21C_MUTATION_RESULT",JSON.stringify(record));}}finally{restore();}
const verified=files.every(f=>sha(fs.readFileSync(f,"utf8"))===hashes[f]),git=spawnSync("git",["diff","--exit-code","--",...files],{encoding:"utf8"});
const counts=Object.fromEntries(["killed","survived","invalid","timeout"].map(s=>[s,ledger.filter(r=>r.outcome===s).length]));
const report={baseline:"green",source_sha256:hashes,restored:verified&&git.status===0,counts,mutants:ledger};fs.mkdirSync("artifacts/phase-21c",{recursive:true});fs.writeFileSync("artifacts/phase-21c/mutation-ledger.json",JSON.stringify(report,null,2)+"\n");
console.log("21C_MUTATION_SUMMARY",JSON.stringify({restored:report.restored,counts,report:"artifacts/phase-21c/mutation-ledger.json"}));if(!report.restored||counts.invalid||counts.timeout||counts.survived)process.exitCode=1;
