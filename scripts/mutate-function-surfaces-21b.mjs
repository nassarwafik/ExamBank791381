#!/usr/bin/env node
// Phase 21B mutation certification: 23 isolated source mutations, independent test processes and SHA-256 verified restoration.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { spawnSync } from "node:child_process";

const SPEC="src/functionSurfaces/surfaceSpec.ts";
const MESH="src/functionSurfaces/surfaceMesh.ts";
const VIEW="src/functionSurfaces/Surface3DView.tsx";
const RICH="src/richContent/richContentModel.ts";
const CORE=["src/functionSurfaces/surfaceMutationPins.21b.test.ts","src/functionSurfaces/surface.21b.test.tsx","src/functionSurfaces/surfaceRichContent.21b.test.ts"];
const VIEWS=["src/functionSurfaces/surface.21b.test.tsx"];
const M=(id,file,before,after,tests=CORE)=>({id,file,before,after,tests});
const mutants=[
  M("S01-nonplain-object",SPEC,'return p === Object.prototype || p === null;','return true;'),
  M("S02-unknown-key",SPEC,'for (const key of Object.keys(o)) if (!keys.includes(key)) fail("SURFACE_UNKNOWN_KEY"','for (const key of Object.keys(o)) if (false && !keys.includes(key)) fail("SURFACE_UNKNOWN_KEY"'),
  M("S03-version",SPEC,'if (top.version !== 1) fail("SURFACE_VERSION_INVALID"','if (false && top.version !== 1) fail("SURFACE_VERSION_INVALID"'),
  M("S04-prototype-id",SPEC,'["constructor", "prototype", "__proto__"].includes(id)','false'),
  M("S05-bidi-text",SPEC,'|| UNSAFE_BIDI.test(v)','|| false'),
  M("S06-invisible-text",SPEC,'|| UNSAFE_INVISIBLE.test(v)','|| false'),
  M("S07-foreign-variable",SPEC,'else if (parsed.refs.some(ref => ref !== "x" && ref !== "y"))','else if (false && parsed.refs.some(ref => ref !== "x" && ref !== "y"))'),
  M("S08-inverted-view",SPEC,'if (xMin! >= xMax! || yMin! >= yMax! || zMin! >= zMax!)','if (false)'),
  M("S09-grid-upper-bound",SPEC,'maxSteps: 40','maxSteps: 400'),
  M("S10-grid-integer",SPEC,'if (!Number.isInteger(xSteps) || !Number.isInteger(ySteps))','if (false && (!Number.isInteger(xSteps) || !Number.isInteger(ySteps)))'),
  M("S11-camera-elevation",SPEC,'"surface.camera.elevation", 0.15, 1.35','"surface.camera.elevation", 0.15, 13.5'),

  M("M01-off-window-hole",MESH,'return r.ok && finite(r.value) && r.value >= v.zMin && r.value <= v.zMax ? { x, y, z: r.value } : null;','return r.ok && finite(r.value) ? { x, y, z: r.value } : null;'),
  M("M02-corner-hole",MESH,'if (p.some(q => q === null)) { skippedCells++; continue; }','if (false && p.some(q => q === null)) { skippedCells++; continue; }'),
  M("M03-edge-probes",MESH,'const bottom = probe(xm, y0), top = probe(xm, y1);','const bottom = middle, top = middle;'),
  M("M04-curvature-guard",MESH,'Math.abs(middle.z - cornerMean) > zSpan * 0.3','Math.abs(middle.z - cornerMean) > zSpan * 30'),
  M("M05-jump-guard",MESH,'Math.max(...zs) - Math.min(...zs) > zSpan * 0.85','Math.max(...zs) - Math.min(...zs) > zSpan * 85'),
  M("M06-width-clamp",MESH,'const w = Math.max(160, Math.min(1600, width));','const w = Math.max(16, Math.min(1600, width));'),
  M("M07-height-clamp",MESH,'const h = Math.max(160, Math.min(1200, height));','const h = Math.max(16, Math.min(1200, height));'),

  M("R01-surface-count",RICH,'if (++surfaceCount > RICH_LIMITS.functionSurfaces)','if (++surfaceCount > RICH_LIMITS.functionSurfaces + 10)'),
  M("R02-duplicate-surface-id",RICH,'if (surfaceIds.has(surface.value.id))','if (false && surfaceIds.has(surface.value.id))'),

  M("V01-keyboard-right",VIEW,'else if (key === "ArrowRight") setCamera(v => ({ ...v, azimuth: limitAngle(v.azimuth + 0.2) }));','else if (false && key === "ArrowRight") setCamera(v => ({ ...v, azimuth: limitAngle(v.azimuth + 0.2) }));',VIEWS),
  M("V02-home-reset",VIEW,'else if (key === "Home") resetCamera();','else if (false && key === "Home") resetCamera();',VIEWS),
  M("V03-pointer-drag",VIEW,'if (!d || d.id !== e.pointerId) return;','if (true) return;',VIEWS)
];

const sha=s=>crypto.createHash("sha256").update(s).digest("hex");
const files=[...new Set(mutants.map(m=>m.file))];
const BACKUP=path.join(os.tmpdir(),"exambank-21b-mutation-backup.json");
if(fs.existsSync(BACKUP)){
  const stale=JSON.parse(fs.readFileSync(BACKUP,"utf8"));
  for(const [file,contents] of Object.entries(stale)) fs.writeFileSync(file,contents,"utf8");
  fs.rmSync(BACKUP,{force:true});
  console.log("21B_MUTATION_RESTORED_STALE_BACKUP",JSON.stringify(Object.keys(stale)));
}
if(process.argv.includes("--restore")) process.exit(0);
const original=new Map(files.map(file=>[file,fs.readFileSync(file,"utf8")]));
const restoreAll=()=>{for(const [file,contents] of original)fs.writeFileSync(file,contents,"utf8");fs.rmSync(BACKUP,{force:true});};
for(const sig of ["SIGINT","SIGTERM","SIGHUP"])process.on(sig,()=>{restoreAll();console.error("21B_MUTATION_INTERRUPTED "+sig+" — sources restored");process.exit(130);});
const hashes=Object.fromEntries([...original].map(([file,value])=>[file,sha(value)]));
const status=spawnSync("git",["status","--porcelain","--",...files],{encoding:"utf8"});
if(status.status!==0||status.stdout.trim()){console.error("Mutated source tree must start clean.",status.stdout);process.exit(3);}
const vitest=tests=>spawnSync(process.execPath,["node_modules/vitest/vitest.mjs","run","--reporter=dot",...tests],{encoding:"utf8",timeout:90000,maxBuffer:4*1024*1024,env:{...process.env,CI:"true"}});
const allTests=[...new Set(mutants.flatMap(x=>x.tests))];
const baseline=vitest(allTests);
if(baseline.status!==0){console.error("BASELINE RED",baseline.stdout.slice(-3500),baseline.stderr.slice(-2000));process.exit(4);}
console.log("21B_MUTATION_BASELINE_GREEN",JSON.stringify({tests:allTests,mutants:mutants.length,files:hashes}));
const ledger=[];
fs.writeFileSync(BACKUP,JSON.stringify(Object.fromEntries(original)),"utf8");
try{
  for(const m of mutants){
    let outcome="invalid",diagnostic="";
    const source=original.get(m.file);
    const occurrences=source.split(m.before).length-1;
    if(occurrences!==1)diagnostic="needle count "+occurrences;
    else if(m.before===m.after)diagnostic="mutation identical";
    else{
      try{
        fs.writeFileSync(m.file,source.replace(m.before,m.after),"utf8");
        const result=vitest(m.tests);
        if(["SIGINT","SIGTERM","SIGHUP"].includes(result.signal)||result.status===130){restoreAll();console.error("21B_MUTATION_INTERRUPTED during "+m.id);process.exit(130);}
        const output=(result.stdout||"")+"\n"+(result.stderr||"");
        if(result.error?.code==="ETIMEDOUT"||result.signal){outcome="timeout";diagnostic=String(result.error||result.signal);}
        else if(result.status===0){outcome="survived";diagnostic="Selected tests passed";}
        else if(/Transform failed|Failed to parse source|SyntaxError:|Unexpected token|Error during transform/.test(output)){outcome="invalid";diagnostic=output.slice(-700);}
        else{outcome="killed";diagnostic=output.split("\n").filter(x=>/FAIL |AssertionError|Test Files|Tests +/.test(x)).slice(0,3).join(" ").slice(0,600);}
      }catch(error){diagnostic=String(error);}
      finally{fs.writeFileSync(m.file,source,"utf8");}
    }
    const record={id:m.id,file:m.file,outcome,diagnostic};
    ledger.push(record);console.log("21B_MUTATION_RESULT",JSON.stringify(record));
  }
}finally{restoreAll();}
const verified=files.every(f=>sha(fs.readFileSync(f,"utf8"))===hashes[f]);
const git=spawnSync("git",["diff","--exit-code","--",...files],{encoding:"utf8"});
const counts=Object.fromEntries(["killed","survived","invalid","timeout"].map(s=>[s,ledger.filter(r=>r.outcome===s).length]));
const report={baseline:"green",source_sha256:hashes,restored:verified&&git.status===0,counts,mutants:ledger};
fs.mkdirSync("artifacts/phase-21b",{recursive:true});
fs.writeFileSync("artifacts/phase-21b/mutation-ledger.json",JSON.stringify(report,null,2)+"\n");
console.log("21B_MUTATION_SUMMARY",JSON.stringify({restored:report.restored,counts,report:"artifacts/phase-21b/mutation-ledger.json"}));
if(!report.restored||counts.invalid||counts.timeout||counts.survived)process.exitCode=1;
